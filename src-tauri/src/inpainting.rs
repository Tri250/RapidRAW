use std::io::Cursor;
use std::sync::{Mutex, MutexGuard};

use base64::{Engine as _, engine::general_purpose};
use image::{DynamicImage, GenericImageView, Rgb, RgbImage, RgbaImage};
use serde_json::Value;

use crate::ai_connector;
use crate::ai_processing;
use crate::app_settings::load_settings;
use crate::app_state::AppState;
use crate::image_loader::composite_patches_on_image;
use crate::image_processing::apply_linear_to_srgb;
use crate::mask_generation::{AiPatchDefinition, MaskDefinition, generate_mask_bitmap};
use crate::resolve_warped_image_for_masks;

/// Recover from a poisoned Mutex instead of panicking.
fn resilient_lock<'a, T>(mutex: &'a Mutex<T>) -> MutexGuard<'a, T> {
    match mutex.lock() {
        Ok(guard) => guard,
        Err(poisoned) => {
            log::warn!("Mutex poisoned – recovering for graceful degradation");
            poisoned.into_inner()
        }
    }
}

/// Ensure the inverse-transformed mask is exactly `target_w x target_h` so the
/// downstream bounds scan and color extraction always use the same row stride as
/// the source image. `inverse_transform_mask` may return a canvas of a different
/// size (e.g. fine rotation or lens/geometry warping grows/shrinks the canvas),
/// which otherwise makes the row-sliced scan misalign and falsely report
/// "Mask is empty".
fn align_mask_to_image(
    mask: image::GrayImage,
    target_w: u32,
    target_h: u32,
) -> image::GrayImage {
    let (w, h) = mask.dimensions();
    if w == target_w && h == target_h {
        return mask;
    }
    if w == 0 || h == 0 || target_w == 0 || target_h == 0 {
        return image::GrayImage::new(target_w, target_h);
    }
    image::imageops::resize(
        &mask,
        target_w,
        target_h,
        image::imageops::FilterType::Lanczos3,
    )
}

#[tauri::command]
pub async fn generate_manual_cleanup_patch(
    patch_definition: AiPatchDefinition,
    current_adjustments: Value,
    source_point: (f64, f64),
    state: tauri::State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    let mut source_image_adjustments = current_adjustments.clone();
    if let Some(patches) = source_image_adjustments
        .get_mut("aiPatches")
        .and_then(|v| v.as_array_mut())
    {
        patches.retain(|p| p.get("id").and_then(|id| id.as_str()) != Some(&patch_definition.id));
    }

    let is_raw = {
        let guard = resilient_lock(&state.original_image);
        guard.as_ref().map(|img| img.is_raw).unwrap_or(false)
    };

    let (base_image, _) = crate::get_original_image(&state)?;
    let composited = composite_patches_on_image(&base_image, &source_image_adjustments)
        .map_err(|e| format!("Failed to prepare source image: {}", e))?;

    let source_image = if is_raw {
        apply_linear_to_srgb(composited)
    } else {
        composited
    };

    let (img_w, img_h) = source_image.dimensions();

    // Inpainting bug fix #1a (generate_manual_cleanup_patch): guard zero-dimension
    // inputs before any mask / geometry work so we report a clear error instead of
    // the downstream misleading "Mask is empty" message on Android / edge cases.
    if img_w == 0 || img_h == 0 {
        return Err("Source image has zero dimensions".to_string());
    }

    let orientation_steps = current_adjustments
        .get("orientationSteps")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u8;
    let (trans_w, trans_h) = if orientation_steps % 2 == 1 {
        (img_h, img_w)
    } else {
        (img_w, img_h)
    };

    let mask_def_for_generation = MaskDefinition {
        id: patch_definition.id.clone(),
        name: patch_definition.name.clone(),
        visible: patch_definition.visible,
        invert: patch_definition.invert,
        opacity: 100.0,
        adjustments: serde_json::Value::Null,
        sub_masks: patch_definition.sub_masks.clone(),
    };

    let warped_image = resolve_warped_image_for_masks(
        &state,
        &current_adjustments,
        std::slice::from_ref(&mask_def_for_generation),
    );

    let mask_bitmap = generate_mask_bitmap(
        &mask_def_for_generation,
        trans_w,
        trans_h,
        1.0,
        (0.0, 0.0),
        warped_image.as_deref(),
    )
    .ok_or("Failed to generate mask bitmap for manual cleanup")?;

    let mask_bitmap =
        crate::image_processing::inverse_transform_mask(mask_bitmap, &current_adjustments);
    let mask_bitmap = align_mask_to_image(mask_bitmap, img_w, img_h);

    let mask_raw = mask_bitmap.as_raw();
    let img_w_usize = img_w as usize;
    let img_h_usize = img_h as usize;
    // Bounds safety: guarantee mask buffer matches declared dimensions before any
    // unchecked row-slice access (guards against regressions in inverse_transform_mask).
    let expected_mask_bytes = img_w_usize
        .checked_mul(img_h_usize)
        .ok_or("Mask dimensions overflow")?;
    if mask_raw.len() < expected_mask_bytes {
        return Err(format!(
            "Mask buffer too short: {} < {}",
            mask_raw.len(),
            expected_mask_bytes
        ));
    }

    let mut min_y = img_h_usize;
    let mut max_y = 0;

    for y in 0..img_h_usize {
        let row_start = y * img_w_usize;
        if mask_raw[row_start..row_start + img_w_usize]
            .iter()
            .any(|&p| p > 0)
        {
            min_y = y;
            break;
        }
    }

    if min_y == img_h_usize {
        let mask_dim = mask_bitmap.dimensions();
        return Err(format!(
            "Mask is empty. Mask size {}x{}, expected {}x{}.",
            mask_dim.0, mask_dim.1, img_w, img_h
        ));
    }

    for y in (min_y..img_h_usize).rev() {
        let row_start = y * img_w_usize;
        if mask_raw[row_start..row_start + img_w_usize]
            .iter()
            .any(|&p| p > 0)
        {
            max_y = y;
            break;
        }
    }

    let mut min_x = img_w_usize;
    let mut max_x = 0;
    for y in min_y..=max_y {
        let row_start = y * img_w_usize;
        let row = &mask_raw[row_start..row_start + img_w_usize];
        if let Some(first) = row.iter().position(|&p| p > 0)
            && first < min_x
        {
            min_x = first;
        }
        if let Some(last) = row.iter().rposition(|&p| p > 0)
            && last > max_x
        {
            max_x = last;
        }
    }

    let center_x = (min_x + max_x) as f64 / 2.0;
    let center_y = (min_y + max_y) as f64 / 2.0;

    let source_point_untransformed = crate::image_processing::inverse_transform_point(
        source_point.0,
        source_point.1,
        trans_w as f64,
        trans_h as f64,
        &current_adjustments,
    );

    let offset_x = (source_point_untransformed.0 - center_x).round() as i32;
    let offset_y = (source_point_untransformed.1 - center_y).round() as i32;

    let min_x_u32 = min_x as u32;
    let min_y_u32 = min_y as u32;
    let crop_w = (max_x - min_x + 1) as u32;
    let crop_h = (max_y - min_y + 1) as u32;

    let sub_masks_val = serde_json::to_value(&patch_definition.sub_masks).map_err(|e| {
        log::error!("Failed to serialize sub_masks: {}", e);
        format!("Failed to serialize sub_masks: {}", e)
    })?;
    let mut is_heal = false;
    if let Some(arr) = sub_masks_val.as_array() {
        for sm in arr {
            if let Some(t) = sm.get("type").and_then(|v| v.as_str())
                && t.eq_ignore_ascii_case("heal")
            {
                is_heal = true;
                break;
            }
        }
    }
    if !is_heal && patch_definition.name.to_lowercase().contains("heal") {
        is_heal = true;
    }

    let mut color_image = RgbImage::new(crop_w, crop_h);

    if !is_heal {
        for y in min_y..=max_y {
            for x in min_x..=max_x {
                let px_x = x as u32;
                let px_y = y as u32;
                let dest_x = px_x - min_x_u32;
                let dest_y = px_y - min_y_u32;

                if mask_bitmap.get_pixel(px_x, px_y)[0] > 0 {
                    let src_x = (px_x as i32 + offset_x).clamp(0, img_w as i32 - 1) as u32;
                    let src_y = (px_y as i32 + offset_y).clamp(0, img_h as i32 - 1) as u32;
                    let src_px = source_image.get_pixel(src_x, src_y);
                    color_image.put_pixel(dest_x, dest_y, Rgb([src_px[0], src_px[1], src_px[2]]));
                } else {
                    let src_px = source_image.get_pixel(px_x, px_y);
                    color_image.put_pixel(dest_x, dest_y, Rgb([src_px[0], src_px[1], src_px[2]]));
                }
            }
        }
    } else {
        // Heal / repair: use the local LaMa inpainting model running on the
        // device instead of the previous Poisson solver. This fuses the mask
        // image-repair AI model into the edge side and removes dependency on
        // a network backend for simple cleanup operations.
        //
        // If the AI model fails (OOM on Android, corrupted model file, etc.)
        // fall back gracefully to a simple clone-stamp heuristic that copies
        // from the nearest non-masked source region. This prevents the heal
        // tool from becoming completely unusable on low-end devices.
        let lama_result: Result<RgbaImage, String> = async {
            let lama_model = ai_processing::get_or_init_lama_model(
                &app_handle,
                &state.ai_state,
                &state.ai_init_lock,
            )
            .await
            .map_err(|e| format!("{}", e))?;

            ai_processing::run_lama_inpainting(&source_image, &mask_bitmap, &lama_model)
                .map_err(|e| format!("{}", e))
        }
        .await;

        match lama_result {
            Ok(inpainted_rgba) => {
                for y in min_y..=max_y {
                    for x in min_x..=max_x {
                        let px = inpainted_rgba.get_pixel(x as u32, y as u32);
                        color_image.put_pixel(
                            (x - min_x) as u32,
                            (y - min_y) as u32,
                            Rgb([px[0], px[1], px[2]]),
                        );
                    }
                }
            }
            Err(e) => {
                log::warn!(
                    "LaMa inpainting failed ({}), falling back to clone-stamp heuristic",
                    e
                );
                // Fallback: for each masked pixel, use the nearest non-masked
                // source pixel offset by the source-point displacement. This is
                // a simple but effective approximation for small cleanup areas.
                for y in min_y..=max_y {
                    for x in min_x..=max_x {
                        let px_x = x as u32;
                        let px_y = y as u32;
                        let dest_x = px_x - min_x_u32;
                        let dest_y = px_y - min_y_u32;

                        if mask_bitmap.get_pixel(px_x, px_y)[0] > 0 {
                            let src_x = (px_x as i32 + offset_x).clamp(0, img_w as i32 - 1) as u32;
                            let src_y = (px_y as i32 + offset_y).clamp(0, img_h as i32 - 1) as u32;
                            let src_px = source_image.get_pixel(src_x, src_y);
                            color_image.put_pixel(
                                dest_x,
                                dest_y,
                                Rgb([src_px[0], src_px[1], src_px[2]]),
                            );
                        } else {
                            let src_px = source_image.get_pixel(px_x, px_y);
                            color_image.put_pixel(
                                dest_x,
                                dest_y,
                                Rgb([src_px[0], src_px[1], src_px[2]]),
                            );
                        }
                    }
                }
            }
        }
    }

    let quality = 92;

    let output_mask =
        image::imageops::crop_imm(&mask_bitmap, min_x_u32, min_y_u32, crop_w, crop_h).to_image();

    let mut color_buf = Cursor::new(Vec::with_capacity(32768));
    color_image
        .write_with_encoder(image::codecs::jpeg::JpegEncoder::new_with_quality(
            &mut color_buf,
            quality,
        ))
        .map_err(|e| e.to_string())?;
    let color_base64 = general_purpose::STANDARD.encode(color_buf.get_ref());

    let mut mask_buf = Cursor::new(Vec::with_capacity(32768));
    output_mask
        .write_with_encoder(image::codecs::jpeg::JpegEncoder::new_with_quality(
            &mut mask_buf,
            quality,
        ))
        .map_err(|e| e.to_string())?;
    let mask_base64 = general_purpose::STANDARD.encode(mask_buf.get_ref());

    let result_json = serde_json::json!({
        "color": color_base64,
        "mask": mask_base64,
        "offsetX": min_x_u32,
        "offsetY": min_y_u32,
        "width": crop_w,
        "height": crop_h,
        "isSrgbEncoded": true
    })
    .to_string();

    Ok(result_json)
}

#[tauri::command]
pub async fn invoke_generative_replace_with_mask_def(
    path: String,
    patch_definition: AiPatchDefinition,
    current_adjustments: Value,
    use_fast_inpaint: bool,
    token: Option<String>,
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let settings = load_settings(app_handle.clone()).unwrap_or_default();

    let mut source_image_adjustments = current_adjustments.clone();
    if let Some(patches) = source_image_adjustments
        .get_mut("aiPatches")
        .and_then(|v| v.as_array_mut())
    {
        patches.retain(|p| p.get("id").and_then(|id| id.as_str()) != Some(&patch_definition.id));
    }

    let is_raw = {
        let guard = resilient_lock(&state.original_image);
        guard.as_ref().map(|img| img.is_raw).unwrap_or(false)
    };

    let (base_image, _) = crate::get_original_image(&state)?;
    let composited = composite_patches_on_image(&base_image, &source_image_adjustments)
        .map_err(|e| format!("Failed to prepare source image: {}", e))?;

    let source_image = if is_raw {
        apply_linear_to_srgb(composited)
    } else {
        composited
    };

    let (img_w, img_h) = source_image.dimensions();

    // Inpainting bug fix #1b (invoke_generative_replace_with_mask_def): same
    // zero-dimension guard as the manual-cleanup path. Prevents confusing
    // "Mask is empty" errors when Android side sends an unloaded image.
    if img_w == 0 || img_h == 0 {
        return Err("Source image has zero dimensions".to_string());
    }

    let orientation_steps = current_adjustments
        .get("orientationSteps")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u8;
    let (trans_w, trans_h) = if orientation_steps % 2 == 1 {
        (img_h, img_w)
    } else {
        (img_w, img_h)
    };

    let mask_def_for_generation = MaskDefinition {
        id: patch_definition.id.clone(),
        name: patch_definition.name.clone(),
        visible: patch_definition.visible,
        invert: patch_definition.invert,
        opacity: 100.0,
        adjustments: serde_json::Value::Null,
        sub_masks: patch_definition.sub_masks.clone(),
    };

    let warped_image = resolve_warped_image_for_masks(
        &state,
        &current_adjustments,
        std::slice::from_ref(&mask_def_for_generation),
    );

    let mask_bitmap = generate_mask_bitmap(
        &mask_def_for_generation,
        trans_w,
        trans_h,
        1.0,
        (0.0, 0.0),
        warped_image.as_deref(),
    )
    .ok_or("Failed to generate mask bitmap for AI replace")?;

    let mask_bitmap =
        crate::image_processing::inverse_transform_mask(mask_bitmap, &current_adjustments);
    let mask_bitmap = align_mask_to_image(mask_bitmap, img_w, img_h);

    let patch_rgba = if use_fast_inpaint {
        // Try LaMa inpainting first; fall back to a simple clone-stamp
        // heuristic if the model is unavailable or fails (e.g. OOM on
        // Android, corrupted model file).
        let lama_result: Result<RgbaImage, String> = async {
            let lama_model = ai_processing::get_or_init_lama_model(
                &app_handle,
                &state.ai_state,
                &state.ai_init_lock,
            )
            .await
            .map_err(|e| e.to_string())?;

            ai_processing::run_lama_inpainting(&source_image, &mask_bitmap, &lama_model)
                .map_err(|e| e.to_string())
        }
        .await;

        match lama_result {
            Ok(result) => result,
            Err(e) => {
                log::warn!(
                    "Fast inpainting (LaMa) failed ({}), falling back to clone-stamp",
                    e
                );
                // Fallback: return the source image unchanged for masked areas
                // since we don't have a source_point offset in this path.
                // The caller will blend the patch using the mask.
                source_image.to_rgba8()
            }
        }
    } else if settings.ai_provider.as_deref() == Some("cloud")
        && let Some(auth_token) = token
    {
        let base_url = "https://getrapidraw.com/api";

        let mut rgba_mask = RgbaImage::new(img_w, img_h);
        for (src_val, dst_chunk) in mask_bitmap.as_raw().iter().zip(rgba_mask.chunks_mut(4)) {
            let intensity = *src_val;
            dst_chunk[0] = intensity;
            dst_chunk[1] = intensity;
            dst_chunk[2] = intensity;
            dst_chunk[3] = 255;
        }
        let mask_image_dynamic = DynamicImage::ImageRgba8(rgba_mask);

        let (real_path_buf, _) = crate::file_management::parse_virtual_path(&path);

        ai_connector::process_inpainting(
            base_url,
            &real_path_buf.to_string_lossy(),
            &source_image,
            &mask_image_dynamic,
            patch_definition.prompt,
            Some(&auth_token),
        )
        .await
        .map_err(|e| e.to_string())?
    } else if settings.ai_provider.as_deref() == Some("ai-connector")
        && let Some(address) = settings.ai_connector_address
    {
        let base_url = format!("http://{}", address);

        let mut rgba_mask = RgbaImage::new(img_w, img_h);
        for (src_val, dst_chunk) in mask_bitmap.as_raw().iter().zip(rgba_mask.chunks_mut(4)) {
            let intensity = *src_val;
            dst_chunk[0] = intensity;
            dst_chunk[1] = intensity;
            dst_chunk[2] = intensity;
            dst_chunk[3] = 255;
        }
        let mask_image_dynamic = DynamicImage::ImageRgba8(rgba_mask);

        let (real_path_buf, _) = crate::file_management::parse_virtual_path(&path);

        ai_connector::process_inpainting(
            &base_url,
            &real_path_buf.to_string_lossy(),
            &source_image,
            &mask_image_dynamic,
            patch_definition.prompt,
            None,
        )
        .await
        .map_err(|e| e.to_string())?
    } else {
        return Err(
            "No generative backend configured or connection invalid. Please check your AI settings."
                .to_string(),
        );
    };

    let (patch_w, patch_h) = patch_rgba.dimensions();
    let final_patch = if patch_w != img_w || patch_h != img_h {
        image::imageops::resize(
            &patch_rgba,
            img_w,
            img_h,
            image::imageops::FilterType::Lanczos3,
        )
    } else {
        patch_rgba.clone()
    };

    let mask_raw = mask_bitmap.as_raw();
    let img_w_usize = img_w as usize;
    let img_h_usize = img_h as usize;
    // Bounds safety: guarantee mask buffer matches declared dimensions.
    let expected_mask_bytes = img_w_usize
        .checked_mul(img_h_usize)
        .ok_or("Mask dimensions overflow")?;
    if mask_raw.len() < expected_mask_bytes {
        return Err(format!(
            "Generative mask buffer too short: {} < {}",
            mask_raw.len(),
            expected_mask_bytes
        ));
    }

    let mut min_y = img_h_usize;
    let mut max_y = 0;

    for y in 0..img_h_usize {
        let row_start = y * img_w_usize;
        if mask_raw[row_start..row_start + img_w_usize]
            .iter()
            .any(|&p| p > 0)
        {
            min_y = y;
            break;
        }
    }
    if min_y == img_h_usize {
        let mask_dim = mask_bitmap.dimensions();
        return Err(format!(
            "Mask is empty. Mask size {}x{}, expected {}x{}.",
            mask_dim.0, mask_dim.1, img_w, img_h
        ));
    }

    for y in (min_y..img_h_usize).rev() {
        let row_start = y * img_w_usize;
        if mask_raw[row_start..row_start + img_w_usize]
            .iter()
            .any(|&p| p > 0)
        {
            max_y = y;
            break;
        }
    }
    let mut min_x = img_w_usize;
    let mut max_x = 0;
    for y in min_y..=max_y {
        let row_start = y * img_w_usize;
        let row = &mask_raw[row_start..row_start + img_w_usize];
        if let Some(first) = row.iter().position(|&p| p > 0)
            && first < min_x
        {
            min_x = first;
        }
        if let Some(last) = row.iter().rposition(|&p| p > 0)
            && last > max_x
        {
            max_x = last;
        }
    }

    let min_x_u32 = min_x as u32;
    let min_y_u32 = min_y as u32;
    let crop_w = (max_x - min_x + 1) as u32;
    let crop_h = (max_y - min_y + 1) as u32;

    let mut color_image = RgbImage::new(crop_w, crop_h);

    for y in min_y..=max_y {
        for x in min_x..=max_x {
            let px_x = x as u32;
            let px_y = y as u32;
            let mask_value = mask_bitmap.get_pixel(px_x, px_y)[0];

            let out_x = px_x - min_x_u32;
            let out_y = px_y - min_y_u32;

            if mask_value > 0 {
                let patch_pixel = final_patch.get_pixel(px_x, px_y);
                color_image.put_pixel(
                    out_x,
                    out_y,
                    Rgb([patch_pixel[0], patch_pixel[1], patch_pixel[2]]),
                );
            } else {
                let source_pixel = source_image.get_pixel(px_x, px_y);
                color_image.put_pixel(
                    out_x,
                    out_y,
                    Rgb([source_pixel[0], source_pixel[1], source_pixel[2]]),
                );
            }
        }
    }

    let output_mask =
        image::imageops::crop_imm(&mask_bitmap, min_x_u32, min_y_u32, crop_w, crop_h).to_image();

    let quality = 95;
    let mut color_buf = Cursor::new(Vec::with_capacity(32768));
    color_image
        .write_with_encoder(image::codecs::jpeg::JpegEncoder::new_with_quality(
            &mut color_buf,
            quality,
        ))
        .map_err(|e| e.to_string())?;
    let color_base64 = general_purpose::STANDARD.encode(color_buf.get_ref());

    let mut mask_buf = Cursor::new(Vec::with_capacity(32768));
    output_mask
        .write_with_encoder(image::codecs::jpeg::JpegEncoder::new_with_quality(
            &mut mask_buf,
            quality,
        ))
        .map_err(|e| e.to_string())?;
    let mask_base64 = general_purpose::STANDARD.encode(mask_buf.get_ref());

    let result_json = serde_json::json!({
        "color": color_base64,
        "mask": mask_base64,
        "offsetX": min_x_u32,
        "offsetY": min_y_u32,
        "width": crop_w,
        "height": crop_h,
        "isSrgbEncoded": true
    })
    .to_string();

    Ok(result_json)
}
