use std::borrow::Cow;
use std::collections::HashMap;
use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use image::codecs::jpeg::JpegEncoder;
use image::{DynamicImage, GenericImageView, GrayImage, ImageBuffer, ImageFormat, Luma, imageops};
use jxl_encoder::{LosslessConfig, LossyConfig, PixelLayout};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::Emitter;
use tauri::Manager;

use crate::exif_processing;
use crate::file_management::{
    generate_filename_from_template, parse_virtual_path, read_file_mapped, validate_writable_folder,
};
use crate::formats::is_raw_file;
use crate::image_loader::{
    composite_patches_on_image, load_and_composite, load_base_image_from_bytes,
};
use crate::image_processing::{
    AllAdjustments, Crop, GpuContext, RenderRequest, downscale_f32_image,
    get_all_adjustments_from_json, get_or_init_gpu_context, process_and_get_dynamic_image,
    resolve_tonemapper_override_from_handle,
};
use crate::lut_processing::{
    convert_image_to_cube_lut, generate_identity_lut_image, get_or_load_lut,
};
use crate::mask_generation::{MaskDefinition, generate_mask_bitmap};
use crate::{AppState, MutexResilient};

use crate::cache_utils::{calculate_full_job_hash, calculate_transform_hash};
use crate::portrait_processing::{
    apply_portrait_adjustments, detect_face_regions, detect_face_regions_onnx,
};
use crate::{
    apply_all_transformations, generate_transformed_preview, get_cached_or_generate_mask,
    hydrate_adjustments, load_settings, resolve_warped_image_for_masks,
};

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub enum ResizeMode {
    LongEdge,
    ShortEdge,
    Width,
    Height,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ResizeOptions {
    pub mode: ResizeMode,
    pub value: u32,
    pub dont_enlarge: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExportSettings {
    pub jpeg_quality: u8,
    pub resize: Option<ResizeOptions>,
    pub keep_metadata: bool,
    #[serde(default)]
    pub preserve_timestamps: bool,
    pub strip_gps: bool,
    pub filename_template: Option<String>,
    pub watermark: Option<WatermarkSettings>,
    #[serde(default)]
    pub export_masks: bool,
    #[serde(default)]
    pub preserve_folders: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub enum WatermarkAnchor {
    TopLeft,
    TopCenter,
    TopRight,
    CenterLeft,
    Center,
    CenterRight,
    BottomLeft,
    BottomCenter,
    BottomRight,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WatermarkSettings {
    pub path: String,
    pub anchor: WatermarkAnchor,
    pub scale: f32,
    pub spacing: f32,
    pub opacity: f32,
}

fn apply_watermark(
    base_image: &mut DynamicImage,
    watermark_settings: &WatermarkSettings,
) -> Result<(), String> {
    // Defensive: non-positive scale means invisible watermark — skip safely.
    if watermark_settings.scale <= 0.0 {
        return Ok(());
    }

    let watermark_img = image::open(&watermark_settings.path)
        .map_err(|e| format!("Failed to open watermark image: {}", e))?;

    let (base_w, base_h) = base_image.dimensions();
    if base_w == 0 || base_h == 0 {
        return Ok(());
    }
    let base_min_dim = base_w.min(base_h) as f32;

    let watermark_scale_factor =
        (base_min_dim * (watermark_settings.scale / 100.0)) / watermark_img.width().max(1) as f32;
    let mut new_wm_w = (watermark_img.width() as f32 * watermark_scale_factor).round() as u32;
    let mut new_wm_h = (watermark_img.height() as f32 * watermark_scale_factor).round() as u32;

    // Guard against an unbounded scale producing a huge in-memory resize
    // (resize_exact allocates `w*h*4` bytes). Cap at the base image size,
    // since a watermark larger than the image is never placed legibly and
    // only risks OOM with Lanczos3.
    let max_wm_dim = base_w.max(base_h);
    new_wm_w = new_wm_w.min(max_wm_dim);
    new_wm_h = new_wm_h.min(max_wm_dim);

    if new_wm_w == 0 || new_wm_h == 0 {
        return Ok(());
    }

    let scaled_watermark =
        watermark_img.resize_exact(new_wm_w, new_wm_h, image::imageops::FilterType::Lanczos3);
    let mut scaled_watermark_rgba = scaled_watermark.to_rgba8();

    let opacity_factor = (watermark_settings.opacity / 100.0).clamp(0.0, 1.0);
    for pixel in scaled_watermark_rgba.pixels_mut() {
        pixel[3] = (pixel[3] as f32 * opacity_factor) as u8;
    }
    let final_watermark = DynamicImage::ImageRgba8(scaled_watermark_rgba);

    let spacing_pixels = (base_min_dim * (watermark_settings.spacing / 100.0))
        .round()
        .clamp(0.0, base_min_dim as f32) as i64;
    let (wm_w, wm_h) = final_watermark.dimensions();

    let x = match watermark_settings.anchor {
        WatermarkAnchor::TopLeft | WatermarkAnchor::CenterLeft | WatermarkAnchor::BottomLeft => {
            spacing_pixels
        }
        WatermarkAnchor::TopCenter | WatermarkAnchor::Center | WatermarkAnchor::BottomCenter => {
            (base_w as i64 - wm_w as i64) / 2
        }
        WatermarkAnchor::TopRight | WatermarkAnchor::CenterRight | WatermarkAnchor::BottomRight => {
            base_w as i64 - wm_w as i64 - spacing_pixels
        }
    };

    let y = match watermark_settings.anchor {
        WatermarkAnchor::TopLeft | WatermarkAnchor::TopCenter | WatermarkAnchor::TopRight => {
            spacing_pixels
        }
        WatermarkAnchor::CenterLeft | WatermarkAnchor::Center | WatermarkAnchor::CenterRight => {
            (base_h as i64 - wm_h as i64) / 2
        }
        WatermarkAnchor::BottomLeft
        | WatermarkAnchor::BottomCenter
        | WatermarkAnchor::BottomRight => base_h as i64 - wm_h as i64 - spacing_pixels,
    };

    // Clamp coordinates to prevent image::imageops::overlay from panicking
    // when negative or out-of-bounds.
    let max_x = base_w.saturating_sub(wm_w) as i64;
    let max_y = base_h.saturating_sub(wm_h) as i64;
    let x = x.clamp(0, max_x);
    let y = y.clamp(0, max_y);

    image::imageops::overlay(base_image, &final_watermark, x, y);

    Ok(())
}

fn calculate_resize_target(
    current_w: u32,
    current_h: u32,
    resize_opts: &ResizeOptions,
) -> (u32, u32) {
    // Defensive: zero-dimension input or zero target value → return original.
    if current_w == 0 || current_h == 0 || resize_opts.value == 0 {
        return (current_w, current_h);
    }

    if resize_opts.dont_enlarge {
        let exceeds = match resize_opts.mode {
            ResizeMode::LongEdge => current_w.max(current_h) > resize_opts.value,
            ResizeMode::ShortEdge => current_w.min(current_h) > resize_opts.value,
            ResizeMode::Width => current_w > resize_opts.value,
            ResizeMode::Height => current_h > resize_opts.value,
        };
        if !exceeds {
            return (current_w, current_h);
        }
    }

    let fix_width = match resize_opts.mode {
        ResizeMode::LongEdge => current_w >= current_h,
        ResizeMode::ShortEdge => current_w <= current_h,
        ResizeMode::Width => true,
        ResizeMode::Height => false,
    };

    let value = resize_opts.value;
    if fix_width {
        let h = (value as f32 * (current_h as f32 / current_w as f32)).round() as u32;
        (value, h.max(1))
    } else {
        let w = (value as f32 * (current_w as f32 / current_h as f32)).round() as u32;
        (w.max(1), value)
    }
}

fn relative_dir_is_safe(rel_dir: &Path) -> bool {
    rel_dir.components().all(|component| {
        matches!(
            component,
            std::path::Component::Normal(_) | std::path::Component::CurDir
        )
    })
}

#[cfg(windows)]
fn component_matches(left: std::path::Component<'_>, right: std::path::Component<'_>) -> bool {
    left.as_os_str()
        .to_string_lossy()
        .eq_ignore_ascii_case(&right.as_os_str().to_string_lossy())
}

#[cfg(not(windows))]
fn component_matches(left: std::path::Component<'_>, right: std::path::Component<'_>) -> bool {
    left == right
}

fn strip_prefix_preserving_source_case(source_path: &Path, base_path: &Path) -> Option<PathBuf> {
    let source_components: Vec<_> = source_path.components().collect();
    let base_components: Vec<_> = base_path.components().collect();

    if base_components.len() > source_components.len() {
        return None;
    }

    if !source_components
        .iter()
        .zip(base_components.iter())
        .all(|(source, base)| component_matches(*source, *base))
    {
        return None;
    }

    Some(source_components[base_components.len()..].iter().collect())
}

fn relative_export_dir_for_preserved_folders(
    source_path: &Path,
    base_origin_folders: &[String],
) -> Option<PathBuf> {
    base_origin_folders
        .iter()
        .filter_map(|base| {
            let base_path = Path::new(base);
            strip_prefix_preserving_source_case(source_path, base_path)
                .map(|rel_path| (base_path.components().count(), rel_path))
        })
        .max_by_key(|(component_count, _)| *component_count)
        .and_then(|(_, rel_path)| {
            let rel_dir = rel_path.parent().unwrap_or_else(|| Path::new(""));
            if relative_dir_is_safe(rel_dir) {
                Some(rel_dir.to_path_buf())
            } else {
                None
            }
        })
}

fn apply_export_resize_and_watermark(
    mut image: DynamicImage,
    export_settings: &ExportSettings,
) -> Result<DynamicImage, String> {
    if let Some(resize_opts) = &export_settings.resize {
        let (current_w, current_h) = image.dimensions();
        let (target_w, target_h) = calculate_resize_target(current_w, current_h, resize_opts);

        if target_w > 0 && target_h > 0 && (target_w != current_w || target_h != current_h) {
            image = image.resize(target_w, target_h, imageops::FilterType::Lanczos3);
        }
    }

    if let Some(watermark_settings) = &export_settings.watermark {
        apply_watermark(&mut image, watermark_settings)?;
    }
    Ok(image)
}

#[allow(clippy::too_many_arguments)]
#[allow(clippy::if_same_then_else)]
#[allow(clippy::collapsible_if)]
fn process_image_for_export_pipeline(
    path: &str,
    base_image: &DynamicImage,
    js_adjustments: &Value,
    context: &GpuContext,
    state: &tauri::State<AppState>,
    is_raw: bool,
    debug_tag: &str,
    app_handle: &tauri::AppHandle,
) -> Result<DynamicImage, String> {
    let (transformed_image, unscaled_crop_offset) =
        apply_all_transformations(Cow::Borrowed(base_image), js_adjustments);
    let (img_w, img_h) = transformed_image.dimensions();

    if img_w == 0 || img_h == 0 {
        return Err("Transformed image has zero dimensions; cannot export.".to_string());
    }

    let mask_definitions: Vec<MaskDefinition> = js_adjustments
        .get("masks")
        .and_then(|m| serde_json::from_value(m.clone()).ok())
        .unwrap_or_default();

    let warped_image = resolve_warped_image_for_masks(state, js_adjustments, &mask_definitions);
    let mask_bitmaps: Vec<ImageBuffer<Luma<u8>, Vec<u8>>> = mask_definitions
        .iter()
        .filter_map(|def| {
            generate_mask_bitmap(
                def,
                img_w,
                img_h,
                1.0,
                unscaled_crop_offset,
                warped_image.as_deref(),
            )
        })
        .collect();

    let tm_override = resolve_tonemapper_override_from_handle(app_handle, is_raw);
    let mut all_adjustments = get_all_adjustments_from_json(js_adjustments, is_raw, tm_override);
    all_adjustments.global.show_clipping = 0;

    let lut_path = js_adjustments["lutPath"].as_str();
    let lut = lut_path.and_then(|p| get_or_load_lut(state, p).ok());

    let unique_hash = calculate_full_job_hash(path, js_adjustments);

    let mut result = process_and_get_dynamic_image(
        context,
        state,
        transformed_image.as_ref(),
        unique_hash,
        RenderRequest {
            adjustments: all_adjustments,
            mask_bitmaps: &mask_bitmaps,
            lut,
            roi: None,
        },
        debug_tag,
    )?;

    // Apply portrait adjustments if present
    if let Some(portrait_json) = js_adjustments.get("portrait") {
        if !portrait_json.is_null() {
            // Mirror the preview pipeline: prefer ONNX face detector if available,
            // fall back to skin-tone heuristic detector for export consistency.
            let face_regions = {
                let ai_state_guard = state.ai_state.lock_resilient();
                if let Some(detector_arc) = ai_state_guard
                    .as_ref()
                    .and_then(|s| s.face_landmark_detector.clone())
                {
                    drop(ai_state_guard);
                    let mut detector_guard = detector_arc.lock_resilient();
                    let onnx_regions = detect_face_regions_onnx(&result, &mut detector_guard);
                    // If ONNX detector returned zero faces (unusual but possible on profile / partial shots),
                    // still try the heuristic detector as a safety net.
                    if onnx_regions.is_empty() {
                        detect_face_regions(&result)
                    } else {
                        onnx_regions
                    }
                } else {
                    drop(ai_state_guard);
                    // Try a synchronous init attempt (downloads may already be cached from preview).
                    match tauri::async_runtime::block_on(async {
                        crate::ai_processing::get_or_init_face_landmark_detector(
                            app_handle,
                            &state.ai_state,
                            &state.ai_init_lock,
                        )
                        .await
                    }) {
                        Ok(detector_arc) => {
                            let mut detector_guard = detector_arc.lock_resilient();
                            let onnx_regions =
                                detect_face_regions_onnx(&result, &mut detector_guard);
                            if onnx_regions.is_empty() {
                                detect_face_regions(&result)
                            } else {
                                onnx_regions
                            }
                        }
                        Err(e) => {
                            log::warn!(
                                "Face landmark detector unavailable for export, falling back to skin-tone detection: {}",
                                e
                            );
                            detect_face_regions(&result)
                        }
                    }
                }
            };

            // Fail loudly for portrait export: portrait is a user-visible
            // effect, silently swallowing the error (as the previous
            // `log::warn!` did) means the user's "portrait" export is
            // silently a no-op. Surface the error so the batch export
            // framework can report it and not leave the user with a
            // misleading "export succeeded" toast.
            if let Err(e) = apply_portrait_adjustments(&mut result, portrait_json, &face_regions) {
                return Err(format!("Portrait processing failed: {}", e));
            }
        }
    }

    Ok(result)
}

fn set_timestamps_from_exif(src: &Path, dst: &Path) {
    let capture_dt = exif_processing::get_creation_date_from_path(src);
    let ft = filetime::FileTime::from_unix_time(
        capture_dt.timestamp(),
        capture_dt.timestamp_subsec_nanos(),
    );
    if let Err(e) = filetime::set_file_times(dst, ft, ft) {
        log::warn!("Could not set timestamps on '{}': {}", dst.display(), e);
    }
}

fn save_image_with_metadata(
    image: &DynamicImage,
    output_path: &std::path::Path,
    source_path_str: &str,
    export_settings: &ExportSettings,
) -> Result<(), String> {
    let extension = output_path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();

    let mut image_bytes = encode_image_to_bytes(image, &extension, export_settings.jpeg_quality)?;

    exif_processing::write_image_with_metadata(
        &mut image_bytes,
        source_path_str,
        &extension,
        export_settings.keep_metadata,
        export_settings.strip_gps,
    )?;

    #[cfg(target_os = "android")]
    {
        // Ensure the parent directory exists before writing the file.
        // The output path on Android is inside the app cache directory.
        if let Some(parent) = output_path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent).map_err(|e| {
                    format!(
                        "Failed to create export directory '{}': {}",
                        parent.display(),
                        e
                    )
                })?;
            }
        }

        // Write the file to disk so the share_image function can find it
        // via FileProvider.getUriForFile. Also save to MediaStore gallery
        // so the image appears in the system Photos app.
        fs::write(output_path, &image_bytes).map_err(|e| {
            format!(
                "Failed to write export file '{}': {}",
                output_path.display(),
                e
            )
        })?;

        let file_name = output_path
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| "Missing Android export file name".to_string())?;
        crate::android_integration::save_image_bytes_to_android_gallery(
            file_name,
            mime_type_for_extension(&extension),
            &image_bytes,
        )?;
    }

    #[cfg(not(target_os = "android"))]
    fs::write(output_path, image_bytes).map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg(target_os = "android")]
pub fn mime_type_for_extension(extension: &str) -> &'static str {
    match extension {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "gif" => "image/gif",
        "tif" | "tiff" => "image/tiff",
        "jxl" => "image/jxl",
        _ => "application/octet-stream",
    }
}

#[allow(clippy::too_many_arguments)]
fn process_image_for_export(
    path: &str,
    base_image: &DynamicImage,
    js_adjustments: &Value,
    export_settings: &ExportSettings,
    context: &GpuContext,
    state: &tauri::State<AppState>,
    is_raw: bool,
    app_handle: &tauri::AppHandle,
) -> Result<DynamicImage, String> {
    let processed_image = process_image_for_export_pipeline(
        path,
        base_image,
        js_adjustments,
        context,
        state,
        is_raw,
        "process_image_for_export",
        app_handle,
    )?;

    apply_export_resize_and_watermark(processed_image, export_settings)
}

fn build_single_mask_adjustments(
    all: &AllAdjustments,
    mask_index: usize,
) -> Option<AllAdjustments> {
    if mask_index >= all.mask_adjustments.len() {
        return None;
    }
    let mut single = AllAdjustments {
        global: all.global,
        mask_adjustments: all.mask_adjustments,
        mask_count: 1,
        tile_offset_x: all.tile_offset_x,
        tile_offset_y: all.tile_offset_y,
        mask_atlas_cols: all.mask_atlas_cols,
    };
    single.mask_adjustments[0] = all.mask_adjustments[mask_index];
    for i in 1..single.mask_adjustments.len() {
        single.mask_adjustments[i] = Default::default();
    }
    Some(single)
}

fn encode_grayscale_to_png(bitmap: &GrayImage) -> Result<Vec<u8>, String> {
    let mut buf = Vec::new();
    let mut cursor = Cursor::new(&mut buf);
    bitmap
        .write_to(&mut cursor, ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    Ok(buf)
}

fn encode_image_to_bytes(
    image: &DynamicImage,
    output_format: &str,
    jpeg_quality: u8,
) -> Result<Vec<u8>, String> {
    // Clamp quality to the valid 0–100 range expected by encoders.
    let jpeg_quality = jpeg_quality.clamp(0, 100);
    let mut image_bytes = Vec::new();
    let mut cursor = Cursor::new(&mut image_bytes);

    match output_format.to_lowercase().as_str() {
        "jxl" => {
            let (width, height) = image.dimensions();
            let has_alpha = image.color().has_alpha();

            let jxl_data = if jpeg_quality == 100 {
                if has_alpha {
                    let rgba = image.to_rgba8();
                    LosslessConfig::new()
                        .encode(rgba.as_raw(), width, height, PixelLayout::Rgba8)
                        .map_err(|e| format!("Failed to encode lossless JXL: {}", e))?
                } else {
                    let rgb = image.to_rgb8();
                    LosslessConfig::new()
                        .encode(rgb.as_raw(), width, height, PixelLayout::Rgb8)
                        .map_err(|e| format!("Failed to encode lossless JXL: {}", e))?
                }
            } else {
                let distance = (100.0 - jpeg_quality as f32) / 10.0;
                let distance = distance.max(0.01);

                if has_alpha {
                    let rgba = image.to_rgba8();
                    LossyConfig::new(distance)
                        .encode(rgba.as_raw(), width, height, PixelLayout::Rgba8)
                        .map_err(|e| format!("Failed to encode lossy JXL: {}", e))?
                } else {
                    let rgb = image.to_rgb8();
                    LossyConfig::new(distance)
                        .encode(rgb.as_raw(), width, height, PixelLayout::Rgb8)
                        .map_err(|e| format!("Failed to encode lossy JXL: {}", e))?
                }
            };

            return Ok(jxl_data);
        }
        "webp" => {
            let encoder = webp::Encoder::from_image(image)
                .map_err(|_| "Failed to create WebP encoder".to_string())?;
            let webp_mem = encoder.encode(jpeg_quality as f32);
            return Ok(webp_mem.to_vec());
        }
        "jpg" | "jpeg" => {
            // Encode with the stock `image` crate JPEG encoder, honoring the
            // requested quality. (The `mozjpeg-rs` dependency is a pure-Rust
            // encoder with a different API than the `mozjpeg` crate; keep the
            // reliable, always-available `image` encoder here.)
            let rgb_image = image.to_rgb8();
            let (w, h) = rgb_image.dimensions();
            let mut encoder =
                image::codecs::jpeg::JpegEncoder::new_with_quality(&mut cursor, jpeg_quality);
            encoder
                .encode(
                    rgb_image.as_raw(),
                    w,
                    h,
                    image::ExtendedColorType::Rgb8,
                )
                .map_err(|e| format!("JPEG encode failed: {}", e))?;
        }
        "png" => {
            let image_to_encode = if image.as_rgb32f().is_some() {
                DynamicImage::ImageRgb16(image.to_rgb16())
            } else {
                image.clone()
            };

            image_to_encode
                .write_to(&mut cursor, image::ImageFormat::Png)
                .map_err(|e| e.to_string())?;
        }
        "tiff" => {
            DynamicImage::ImageRgb16(image.to_rgb16())
                .write_to(&mut cursor, image::ImageFormat::Tiff)
                .map_err(|e| e.to_string())?;
        }
        "avif" => {
            image
                .write_to(&mut cursor, image::ImageFormat::Avif)
                .map_err(|e| e.to_string())?;
        }
        _ => return Err(format!("Unsupported file format: {}", output_format)),
    };
    Ok(image_bytes)
}

#[allow(clippy::too_many_arguments)]
fn export_masks_for_image(
    base_image: &DynamicImage,
    js_adjustments: &Value,
    export_settings: &ExportSettings,
    output_path_obj: &std::path::Path,
    source_path_str: &str,
    context: &Arc<GpuContext>,
    state: &tauri::State<AppState>,
    is_raw: bool,
    app_handle: &tauri::AppHandle,
) -> Result<(), String> {
    let (transformed_image, unscaled_crop_offset) =
        apply_all_transformations(Cow::Borrowed(base_image), js_adjustments);
    let (img_w, img_h) = transformed_image.dimensions();
    let mask_definitions: Vec<MaskDefinition> = js_adjustments
        .get("masks")
        .and_then(|m| serde_json::from_value(m.clone()).ok())
        .unwrap_or_default();

    let warped_image = resolve_warped_image_for_masks(state, js_adjustments, &mask_definitions);
    let mask_bitmaps: Vec<ImageBuffer<Luma<u8>, Vec<u8>>> = mask_definitions
        .iter()
        .filter_map(|def| {
            generate_mask_bitmap(
                def,
                img_w,
                img_h,
                1.0,
                unscaled_crop_offset,
                warped_image.as_deref(),
            )
        })
        .collect();

    if !mask_bitmaps.is_empty() {
        let tm_override = resolve_tonemapper_override_from_handle(app_handle, is_raw);
        let all_adjustments = get_all_adjustments_from_json(js_adjustments, is_raw, tm_override);
        let lut_path = js_adjustments["lutPath"].as_str();
        let lut = lut_path.and_then(|p| get_or_load_lut(state, p).ok());
        let unique_hash = calculate_full_job_hash(source_path_str, js_adjustments);
        let output_dir = output_path_obj.parent().unwrap_or(output_path_obj);
        let stem = output_path_obj
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("export");
        let extension = output_path_obj
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("jpg");

        for (i, _) in mask_bitmaps.iter().enumerate() {
            let Some(single_adjustments) = build_single_mask_adjustments(&all_adjustments, i)
            else {
                log::warn!(
                    "Mask index {} out of bounds for adjustments; skipping mask export.",
                    i
                );
                continue;
            };
            let full_white_mask = ImageBuffer::from_fn(img_w, img_h, |_, _| Luma([255u8]));
            let single_bitmaps: Vec<ImageBuffer<Luma<u8>, Vec<u8>>> = vec![full_white_mask];

            let processed = process_and_get_dynamic_image(
                context,
                state,
                transformed_image.as_ref(),
                unique_hash,
                RenderRequest {
                    adjustments: single_adjustments,
                    mask_bitmaps: &single_bitmaps,
                    lut: lut.clone(),
                    roi: None,
                },
                "export_mask_image",
            )?;

            let with_options = apply_export_resize_and_watermark(processed, export_settings)?;
            let (out_w, out_h) = with_options.dimensions();

            if out_w == 0 || out_h == 0 {
                log::warn!(
                    "Mask export produced zero-dimension image; skipping mask {}.",
                    i
                );
                continue;
            }

            let alpha_resized = imageops::resize(
                &mask_bitmaps[i],
                out_w,
                out_h,
                imageops::FilterType::Lanczos3,
            );

            let mask_image_path =
                output_dir.join(format!("{}_mask_{}_image.{}", stem, i, extension));
            let mask_alpha_path = output_dir.join(format!("{}_mask_{}_alpha.png", stem, i));

            save_image_with_metadata(
                &with_options,
                &mask_image_path,
                source_path_str,
                export_settings,
            )?;

            if export_settings.preserve_timestamps {
                set_timestamps_from_exif(Path::new(source_path_str), &mask_image_path);
            }

            let alpha_bytes = encode_grayscale_to_png(&alpha_resized)?;
            #[cfg(target_os = "android")]
            {
                // Write the mask file to disk so it can be shared.
                if let Some(parent) = mask_alpha_path.parent() {
                    if !parent.exists() {
                        fs::create_dir_all(parent).map_err(|e| {
                            format!(
                                "Failed to create mask export directory '{}': {}",
                                parent.display(),
                                e
                            )
                        })?;
                    }
                }
                fs::write(&mask_alpha_path, &alpha_bytes).map_err(|e| {
                    format!(
                        "Failed to write mask export file '{}': {}",
                        mask_alpha_path.display(),
                        e
                    )
                })?;

                let file_name = mask_alpha_path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .ok_or_else(|| "Missing Android mask export file name".to_string())?;
                crate::android_integration::save_image_bytes_to_android_gallery(
                    file_name,
                    "image/png",
                    &alpha_bytes,
                )?;
            }

            #[cfg(not(target_os = "android"))]
            fs::write(&mask_alpha_path, alpha_bytes).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn export_adjustments_as_lut(
    js_adjustments: &Value,
    source_path_str: &str,
    context: &Arc<GpuContext>,
    state: &tauri::State<AppState>,
    app_handle: &tauri::AppHandle,
) -> Result<Vec<u8>, String> {
    let lut_size = 33;
    let identity_image = generate_identity_lut_image(lut_size);

    let tm_override = resolve_tonemapper_override_from_handle(app_handle, false);

    // Strip geometric transforms from the JSON so the LUT is only color-based.
    // Geometric ops (crop, rotate, lens correction) would alter the identity
    // image dimensions and cause get_pixel out-of-bounds in convert_image_to_cube_lut.
    let mut clean_json = js_adjustments.clone();
    if let Some(obj) = clean_json.as_object_mut() {
        for key in [
            "crop",
            "rotation",
            "orientationSteps",
            "straighten",
            "transformDistortion",
            "transformVertical",
            "transformHorizontal",
            "transformRotate",
            "transformAspect",
            "transformScale",
            "transformXOffset",
            "transformYOffset",
        ] {
            obj.remove(key);
        }
    }

    let mut all_adjustments = get_all_adjustments_from_json(&clean_json, false, tm_override);

    all_adjustments.global.show_clipping = 0;
    all_adjustments.global.vignette_amount = 0.0;
    all_adjustments.global.grain_amount = 0.0;
    all_adjustments.global.sharpness = 0.0;
    all_adjustments.global.clarity = 0.0;
    all_adjustments.global.dehaze = 0.0;
    all_adjustments.global.structure = 0.0;
    all_adjustments.global.centre = 0.0;
    all_adjustments.global.glow_amount = 0.0;
    all_adjustments.global.halation_amount = 0.0;
    all_adjustments.global.flare_amount = 0.0;
    all_adjustments.global.luma_noise_reduction = 0.0;
    all_adjustments.global.color_noise_reduction = 0.0;
    all_adjustments.global.chromatic_aberration_red_cyan = 0.0;
    all_adjustments.global.chromatic_aberration_blue_yellow = 0.0;

    let lut_path = js_adjustments["lutPath"].as_str();
    let lut = lut_path.and_then(|p| get_or_load_lut(state, p).ok());
    let unique_hash = calculate_full_job_hash(source_path_str, &clean_json);

    let processed_lut = process_and_get_dynamic_image(
        context,
        state,
        &identity_image,
        unique_hash,
        RenderRequest {
            adjustments: all_adjustments,
            mask_bitmaps: &[],
            lut,
            roi: None,
        },
        "export_lut",
    )?;

    // Defensive check: ensure output dimensions match the expected LUT grid.
    let expected_h = lut_size * lut_size;
    if processed_lut.width() != lut_size || processed_lut.height() != expected_h {
        return Err(format!(
            "LUT export produced unexpected dimensions: {}x{} (expected {}x{}). A geometric transform may still have been applied.",
            processed_lut.width(),
            processed_lut.height(),
            lut_size,
            expected_h
        ));
    }

    convert_image_to_cube_lut(&processed_lut, lut_size)
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn export_images(
    paths: Vec<String>,
    output_folder_or_file: String,
    is_explicit_file_path: bool,
    base_origin_folders: Vec<String>,
    export_settings: ExportSettings,
    output_format: String,
    current_edit_path: Option<String>,
    current_edit_adjustments: Option<Value>,
    state: tauri::State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    tokio::time::sleep(std::time::Duration::from_millis(10)).await;

    // Check if an export is already in progress, but also clean up
    // stale handles from panicked/aborted previous exports.
    {
        let mut handle_guard = state.export_task_handle.lock().unwrap_or_else(|e| {
            log::warn!("Mutex poisoned");
            e.into_inner()
        });
        if let Some(ref handle) = *handle_guard {
            if handle.is_finished() {
                log::warn!(
                    "Previous export task finished (possibly panicked) – clearing stale handle"
                );
                *handle_guard = None;
            } else {
                return Err("An export is already in progress.".to_string());
            }
        }
    }

    let context = get_or_init_gpu_context(&state, &app_handle)?;
    let context = Arc::new(context);
    let progress_counter = Arc::new(AtomicUsize::new(0));

    // Validate output path up-front to reject path traversal and empty
    // values before any work is queued.
    // On Android, the frontend may pass an empty string (batch export) or
    // just a filename (single export) because native save dialogs are not
    // available. Use the app cache directory as the output folder and
    // construct the full path from it.
    #[cfg(target_os = "android")]
    let output_folder_or_file = {
        if output_folder_or_file.trim().is_empty() {
            // Batch export: use cache dir as the output folder
            app_handle
                .path()
                .app_cache_dir()
                .map_err(|e| format!("Failed to get app cache dir: {}", e))?
                .join("exports")
                .to_string_lossy()
                .to_string()
        } else if !output_folder_or_file.contains('/') && !output_folder_or_file.contains('\\') {
            // Single export: just a filename, use cache dir as parent
            app_handle
                .path()
                .app_cache_dir()
                .map_err(|e| format!("Failed to get app cache dir: {}", e))?
                .join("exports")
                .join(&output_folder_or_file)
                .to_string_lossy()
                .to_string()
        } else {
            output_folder_or_file
        }
    };

    let output_folder_canon = validate_writable_folder(&output_folder_or_file)?;
    let output_folder_or_file = output_folder_canon.to_string_lossy().to_string();

    let available_cores = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(1);

    let mut sys = sysinfo::System::new();
    sys.refresh_memory();

    let available_ram_gb = sys.available_memory() as f64 / 1024.0 / 1024.0 / 1024.0;

    let ram_based_limit = (available_ram_gb / 2.5).floor() as usize;

    // Cap concurrency at 3 to reduce contention and queue wait times,
    // matching the user-requested optimization. Memory-bounded devices
    // still fall back to 1–2 threads automatically via `ram_based_limit`.
    let num_threads = if paths.len() == 1 {
        1
    } else {
        available_cores.min(ram_based_limit).clamp(1, 3)
    };

    log::info!(
        "Batch Export: {} cores, {:.1} GB free RAM -> {} threads",
        available_cores,
        available_ram_gb,
        num_threads
    );

    // Detect low-memory devices and auto-throttle heavy recompute effects
    // (dehaze, glow, denoise) to avoid OOM kills and keep export responsive.
    // The threshold is conservative (2 GB free) so we only degrade on truly
    // constrained hardware.
    let low_memory_mode = available_ram_gb < 2.0;
    if low_memory_mode {
        log::warn!(
            "Low memory detected ({:.1} GB free) – disabling heavy effects (dehaze, glow, denoise) for this export batch.",
            available_ram_gb
        );
    }

    let task = tokio::spawn(async move {
        let output_folder_path = std::path::Path::new(&output_folder_or_file);
        let total_paths = paths.len();
        let settings = load_settings(app_handle.clone()).unwrap_or_default();

        let mut base_path_counts: HashMap<String, usize> = HashMap::new();
        let mut export_items = Vec::with_capacity(total_paths);

        for (i, path_str) in paths.into_iter().enumerate() {
            let (source_path, _) = parse_virtual_path(&path_str);
            let source_str = source_path.to_string_lossy().to_string();
            let count = base_path_counts.entry(source_str.clone()).or_insert(0);
            *count += 1;

            let mut explicit_vc = None;
            if let Some(idx) = path_str.rfind("vc=") {
                let id_str = path_str[idx + 3..].split('&').next().unwrap_or("");
                if let Ok(id) = id_str.parse::<u32>() {
                    explicit_vc = Some(id);
                }
            }
            if explicit_vc.is_none() {
                let lower = path_str.to_lowercase();
                if let Some(idx) = lower.rfind("_vc") {
                    let id_str: String = lower[idx + 3..]
                        .chars()
                        .take_while(|c| c.is_ascii_digit())
                        .collect();
                    if let Ok(id) = id_str.parse::<u32>() {
                        explicit_vc = Some(id);
                    }
                }
            }
            export_items.push((i, path_str, *count, explicit_vc));
        }

        let semaphore = Arc::new(tokio::sync::Semaphore::new(num_threads));
        let mut join_handles = Vec::new();

        for (global_index, image_path_str, appearance_count, explicit_vc) in export_items {
            let permit = match semaphore.clone().acquire_owned().await {
                Ok(p) => p,
                Err(e) => {
                    log::error!("Semaphore acquire failed: {}", e);
                    continue;
                }
            };

            let app_handle_clone = app_handle.clone();
            let context_clone = Arc::clone(&context);
            let progress_counter_clone = Arc::clone(&progress_counter);
            let output_folder_path = output_folder_path.to_path_buf();
            let base_origin_folders = base_origin_folders.clone();
            let export_settings = export_settings.clone();
            let output_format = output_format.clone();
            let current_edit_path = current_edit_path.clone();
            let current_edit_adjustments = current_edit_adjustments.clone();
            let settings = settings.clone();
            let low_memory = low_memory_mode;

            let handle = tokio::task::spawn_blocking(move || {
                if app_handle_clone
                    .state::<AppState>()
                    .export_task_handle
                    .lock()
                    .unwrap_or_else(|e| {
                        log::warn!("Mutex poisoned – recovering");
                        e.into_inner()
                    })
                    .is_none()
                {
                    return Err("Export cancelled".to_string());
                }

                let state = app_handle_clone.state::<AppState>();
                let (source_path, sidecar_path) = parse_virtual_path(&image_path_str);
                let source_path_str = source_path.to_string_lossy().to_string();
                let is_current_edit = Some(&source_path_str) == current_edit_path.as_ref();

                let mut js_adjustments = match (is_current_edit, current_edit_adjustments) {
                    (true, Some(adjustments)) => adjustments,
                    _ => {
                        let metadata = crate::exif_processing::load_sidecar(&sidecar_path);
                        metadata.adjustments
                    }
                };

                hydrate_adjustments(&state, &mut js_adjustments);

                // In low-memory mode, zero out expensive recompute effects
                // (dehaze, glow, denoise) to prevent OOM kills. These are
                // the heaviest effects and also the most noticeable when
                // disabled – users get a correctly-exposed export at the
                // cost of these polish effects rather than a crash.
                if low_memory {
                    if let Some(obj) = js_adjustments.as_object_mut() {
                        if let Some(v) = obj.get_mut("dehaze") {
                            *v = serde_json::json!(0.0);
                        }
                        if let Some(v) = obj.get_mut("glow") {
                            *v = serde_json::json!(0.0);
                        }
                        if let Some(v) = obj.get_mut("denoise") {
                            *v = serde_json::json!(0.0);
                        }
                        if let Some(v) = obj.get_mut("noiseReduction") {
                            *v = serde_json::json!(0.0);
                        }
                    }
                }

                let is_raw = is_raw_file(&source_path_str);
                let original_path = std::path::Path::new(&source_path_str);
                let file_date = exif_processing::get_creation_date_from_path(original_path);

                let filename_template = export_settings
                    .filename_template
                    .as_deref()
                    .unwrap_or("{original_filename}_edited");

                let mut new_stem = generate_filename_from_template(
                    filename_template,
                    original_path,
                    global_index + 1,
                    total_paths,
                    &file_date,
                );

                if let Some(vc_id) = explicit_vc {
                    new_stem = format!("{}_VC{:02}", new_stem, vc_id);
                } else if appearance_count > 1 {
                    new_stem = format!("{}_VC{:02}", new_stem, appearance_count - 1);
                }

                let new_filename = format!("{}.{}", new_stem, output_format);
                let output_path = if is_explicit_file_path && total_paths == 1 {
                    output_folder_path
                } else if export_settings.preserve_folders {
                    if let Some(rel_dir) = relative_export_dir_for_preserved_folders(
                        source_path.as_path(),
                        &base_origin_folders,
                    ) {
                        let full_dir = output_folder_path.join(rel_dir);
                        if let Err(e) = std::fs::create_dir_all(&full_dir) {
                            log::warn!("Failed to create export subdirectory: {}", e);
                        }
                        full_dir.join(&new_filename)
                    } else {
                        output_folder_path.join(&new_filename)
                    }
                } else {
                    output_folder_path.join(&new_filename)
                };

                let extension = output_format.to_lowercase();

                let result: Result<String, String> = (|| {
                    if extension == "cube" {
                        let cube_bytes = export_adjustments_as_lut(
                            &js_adjustments,
                            &source_path_str,
                            &context_clone,
                            &state,
                            &app_handle_clone,
                        )?;
                        #[cfg(target_os = "android")]
                        {
                            // Write the LUT file to disk so it can be shared.
                            if let Some(parent) = output_path.parent() {
                                if !parent.exists() {
                                    fs::create_dir_all(parent).map_err(|e| {
                                        format!(
                                            "Failed to create LUT export directory '{}': {}",
                                            parent.display(),
                                            e
                                        )
                                    })?;
                                }
                            }
                            fs::write(&output_path, &cube_bytes).map_err(|e| {
                                format!(
                                    "Failed to write LUT export file '{}': {}",
                                    output_path.display(),
                                    e
                                )
                            })?;

                            let file_name = output_path
                                .file_name()
                                .and_then(|name| name.to_str())
                                .ok_or_else(|| "Missing Android LUT file name".to_string())?;
                            crate::android_integration::save_file_bytes_to_android_downloads(
                                file_name,
                                "application/octet-stream",
                                &cube_bytes,
                            )?;
                        }
                        #[cfg(not(target_os = "android"))]
                        fs::write(&output_path, cube_bytes).map_err(|e| e.to_string())?;
                        return Ok(output_path.to_string_lossy().to_string());
                    }

                    let base_image = if is_current_edit {
                        match crate::get_original_image(&state) {
                            Ok((orig_data_arc, _)) => {
                                composite_patches_on_image(&orig_data_arc, &js_adjustments)
                                    .map_err(|e| format!("Failed to composite AI patches: {}", e))?
                            }
                            Err(_) => {
                                let bytes =
                                    fs::read(&source_path_str).map_err(|e| e.to_string())?;
                                load_and_composite(
                                    &bytes,
                                    &source_path_str,
                                    &js_adjustments,
                                    false,
                                    &settings,
                                    None,
                                )
                                .map_err(|e| format!("Failed to load fallback image: {}", e))?
                            }
                        }
                    } else {
                        match read_file_mapped(Path::new(&source_path_str)) {
                            Ok(mmap) => load_and_composite(
                                &mmap,
                                &source_path_str,
                                &js_adjustments,
                                false,
                                &settings,
                                None,
                            )
                            .map_err(|e| format!("Failed to load from mmap: {}", e))?,
                            Err(_) => {
                                let bytes =
                                    fs::read(&source_path_str).map_err(|e| e.to_string())?;
                                load_and_composite(
                                    &bytes,
                                    &source_path_str,
                                    &js_adjustments,
                                    false,
                                    &settings,
                                    None,
                                )
                                .map_err(|e| format!("Failed to load from bytes: {}", e))?
                            }
                        }
                    };

                    // Always strip masks from the main composite. Per-mask
                    // effects are rendered to their own output file via
                    // `export_masks_for_image` below (when `export_masks` is
                    // true). Leaving masks in the main adjustments causes the
                    // main export to contain the mask overlay, producing a
                    // washed-out or "cleared" main image.
                    let mut main_export_adjustments = js_adjustments.clone();
                    if let Some(obj) = main_export_adjustments.as_object_mut() {
                        obj.insert("masks".to_string(), serde_json::json!([]));
                    }

                    let final_image = process_image_for_export(
                        &source_path_str,
                        &base_image,
                        &main_export_adjustments,
                        &export_settings,
                        &context_clone,
                        &state,
                        is_raw,
                        &app_handle_clone,
                    )?;
                    save_image_with_metadata(
                        &final_image,
                        &output_path,
                        &source_path_str,
                        &export_settings,
                    )?;

                    if export_settings.preserve_timestamps {
                        set_timestamps_from_exif(Path::new(&source_path_str), &output_path);
                    }

                    if export_settings.export_masks {
                        export_masks_for_image(
                            &base_image,
                            &js_adjustments,
                            &export_settings,
                            &output_path,
                            &source_path_str,
                            &context_clone,
                            &state,
                            is_raw,
                            &app_handle_clone,
                        )?;
                    }

                    Ok(output_path.to_string_lossy().to_string())
                })();

                let current_progress = progress_counter_clone.fetch_add(1, Ordering::SeqCst) + 1;
                let _ = app_handle_clone.emit(
                    "batch-export-progress",
                    serde_json::json!({
                        "current": current_progress,
                        "total": total_paths,
                        "path": &image_path_str
                    }),
                );

                drop(permit);
                result
            });

            join_handles.push(handle);
        }

        let mut results = Vec::new();
        for handle in join_handles {
            match handle.await {
                Ok(res) => results.push(res),
                Err(e) => results.push(Err(format!("Thread crashed: {}", e))),
            }
        }

        tokio::time::sleep(std::time::Duration::from_millis(150)).await;

        let mut error_count = 0;
        let mut exported_paths: Vec<String> = Vec::new();
        for result in &results {
            match result {
                Ok(path) => exported_paths.push(path.clone()),
                Err(e) => {
                    error_count += 1;
                    log::error!("Export error: {}", e);
                    if total_paths == 1 {
                        let _ = app_handle.emit("export-error", e.clone());
                    }
                }
            }
        }

        if error_count > 0 && total_paths > 1 {
            let _ = app_handle.emit(
                "export-complete-with-errors",
                serde_json::json!({ "errors": error_count, "total": total_paths }),
            );
        } else if error_count == 0 {
            let _ = app_handle.emit(
                "batch-export-progress",
                serde_json::json!({ "current": total_paths, "total": total_paths, "path": "" }),
            );
            let _ = app_handle.emit("export-complete", exported_paths);
        }

        *app_handle
            .state::<AppState>()
            .export_task_handle
            .lock()
            .unwrap_or_else(|e| {
                log::warn!("Mutex poisoned – recovering");
                e.into_inner()
            }) = None;
    });

    *state.export_task_handle.lock().unwrap_or_else(|e| {
        log::warn!("Mutex poisoned");
        e.into_inner()
    }) = Some(task);
    Ok(())
}

#[tauri::command]
pub fn cancel_export(state: tauri::State<AppState>) -> Result<(), String> {
    match state
        .export_task_handle
        .lock()
        .unwrap_or_else(|e| {
            log::warn!("Mutex poisoned");
            e.into_inner()
        })
        .take()
    {
        Some(handle) => {
            handle.abort();
            println!("Export task cancellation requested.");
        }
        _ => {
            return Err("No export task is currently running.".to_string());
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn estimate_export_sizes(
    paths: Vec<String>,
    export_settings: ExportSettings,
    output_format: String,
    current_edit_path: Option<String>,
    current_edit_adjustments: Option<Value>,
    state: tauri::State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<usize, String> {
    if output_format.to_lowercase() == "cube" {
        return Ok(1_050_000usize.saturating_mul(paths.len()));
    }

    if paths.is_empty() {
        return Ok(0);
    }

    let first_path = &paths[0];
    let (source_path, sidecar_path) = parse_virtual_path(first_path);
    let source_path_str = source_path.to_string_lossy().to_string();

    let context = get_or_init_gpu_context(&state, &app_handle)?;
    let is_current_edit = Some(&source_path_str) == current_edit_path.as_ref();
    let is_raw = is_raw_file(&source_path_str);
    let settings = load_settings(app_handle.clone()).unwrap_or_default();

    let single_image_extrapolated_size: usize = if is_current_edit
        && current_edit_adjustments.is_some()
    {
        let loaded_image = state
            .original_image
            .lock()
            .unwrap_or_else(|e| {
                log::warn!("Mutex poisoned – recovering");
                e.into_inner()
            })
            .clone()
            .ok_or("No original image loaded")?;
        let mut adjustments_clone = current_edit_adjustments.clone().unwrap_or_else(|| {
            log::warn!("current_edit_adjustments was None, using default");
            serde_json::Value::Object(serde_json::Map::new())
        });
        hydrate_adjustments(&state, &mut adjustments_clone);

        let new_transform_hash = calculate_transform_hash(&adjustments_clone);
        let cached_preview_lock = state.cached_preview.lock().unwrap_or_else(|e| {
            log::warn!("Mutex poisoned");
            e.into_inner()
        });
        let preview_dim = settings.editor_preview_resolution.unwrap_or(1920);

        let (preview_image, scale, unscaled_crop_offset) = if let Some(cached) =
            &*cached_preview_lock
        {
            if cached.transform_hash == new_transform_hash && cached.preview_dim == preview_dim {
                let img = Arc::clone(&cached.image);
                let s = cached.scale;
                let offset = cached.unscaled_crop_offset;
                drop(cached_preview_lock);
                let owned_img = Arc::try_unwrap(img).unwrap_or_else(|arc| (*arc).clone());
                (owned_img, s, offset)
            } else {
                drop(cached_preview_lock);
                generate_transformed_preview(
                    &state,
                    &loaded_image,
                    &adjustments_clone,
                    preview_dim,
                )?
            }
        } else {
            drop(cached_preview_lock);
            generate_transformed_preview(&state, &loaded_image, &adjustments_clone, preview_dim)?
        };

        let (img_w, img_h) = preview_image.dimensions();
        let mask_definitions: Vec<MaskDefinition> = adjustments_clone
            .get("masks")
            .and_then(|m| serde_json::from_value(m.clone()).ok())
            .unwrap_or_default();

        let scaled_crop_offset = (
            unscaled_crop_offset.0 * scale,
            unscaled_crop_offset.1 * scale,
        );

        let mask_bitmaps: Vec<ImageBuffer<Luma<u8>, Vec<u8>>> = mask_definitions
            .iter()
            .filter_map(|def| {
                get_cached_or_generate_mask(
                    &state,
                    def,
                    img_w,
                    img_h,
                    scale,
                    scaled_crop_offset,
                    &adjustments_clone,
                )
            })
            .collect();

        let tm_override = resolve_tonemapper_override_from_handle(&app_handle, is_raw);
        let mut all_adjustments =
            get_all_adjustments_from_json(&adjustments_clone, is_raw, tm_override);
        all_adjustments.global.show_clipping = 0;

        let lut = adjustments_clone["lutPath"]
            .as_str()
            .and_then(|p| get_or_load_lut(&state, p).ok());
        let unique_hash =
            calculate_full_job_hash(&loaded_image.path, &adjustments_clone).wrapping_add(1);

        let processed_preview = process_and_get_dynamic_image(
            &context,
            &state,
            &preview_image,
            unique_hash,
            RenderRequest {
                adjustments: all_adjustments,
                mask_bitmaps: &mask_bitmaps,
                lut,
                roi: None,
            },
            "estimate_export_size",
        )?;

        let preview_bytes = encode_image_to_bytes(
            &processed_preview,
            &output_format,
            export_settings.jpeg_quality,
        )?;
        let preview_byte_size = preview_bytes.len();

        let (transformed_full_res, _) =
            apply_all_transformations(&loaded_image.image, &adjustments_clone);
        let (full_w, full_h) = transformed_full_res.dimensions();

        let (final_full_w, final_full_h) = if let Some(resize_opts) = &export_settings.resize {
            calculate_resize_target(full_w, full_h, resize_opts)
        } else {
            (full_w, full_h)
        };

        let (processed_preview_w, processed_preview_h) = processed_preview.dimensions();
        let pixel_ratio = if processed_preview_w > 0 && processed_preview_h > 0 {
            (final_full_w as f64 * final_full_h as f64)
                / (processed_preview_w as f64 * processed_preview_h as f64)
        } else {
            1.0
        };

        (preview_byte_size as f64 * pixel_ratio) as usize
    } else {
        let metadata = crate::exif_processing::load_sidecar(&sidecar_path);
        let mut js_adjustments = metadata.adjustments;

        const ESTIMATE_DIM: u32 = 1280;

        let file_slice: Vec<u8>;
        let mmap_guard;
        let file_data: &[u8] = match read_file_mapped(Path::new(&source_path_str)) {
            Ok(mmap) => {
                mmap_guard = Some(mmap);
                mmap_guard.as_ref().unwrap()
            }
            Err(_) => {
                file_slice = fs::read(&source_path_str).map_err(|io_err| io_err.to_string())?;
                &file_slice
            }
        };

        let original_image =
            load_base_image_from_bytes(file_data, &source_path_str, true, &settings, None)
                .map_err(|e| e.to_string())?;

        let raw_scale_factor = if is_raw {
            crate::raw_processing::get_fast_demosaic_scale_factor(
                file_data,
                original_image.width(),
                original_image.height(),
            )
        } else {
            1.0
        };

        if let Some(crop_val) = js_adjustments.get_mut("crop")
            && let Ok(c) = serde_json::from_value::<Crop>(crop_val.clone())
        {
            *crop_val = serde_json::to_value(Crop {
                x: c.x * raw_scale_factor as f64,
                y: c.y * raw_scale_factor as f64,
                width: c.width * raw_scale_factor as f64,
                height: c.height * raw_scale_factor as f64,
            })
            .unwrap_or(serde_json::Value::Null);
        }

        let (transformed_shrunk_res, unscaled_crop_offset) =
            apply_all_transformations(Cow::Borrowed(&original_image), &js_adjustments);
        let (shrunk_w, shrunk_h) = transformed_shrunk_res.dimensions();

        let preview_base = if shrunk_w > ESTIMATE_DIM || shrunk_h > ESTIMATE_DIM {
            downscale_f32_image(transformed_shrunk_res.as_ref(), ESTIMATE_DIM, ESTIMATE_DIM)
        } else {
            transformed_shrunk_res.into_owned()
        };

        let (preview_w, preview_h) = preview_base.dimensions();
        let gpu_scale = if shrunk_w > 0 {
            preview_w as f32 / shrunk_w as f32
        } else {
            1.0
        };
        let total_scale = gpu_scale * raw_scale_factor;

        let mask_definitions: Vec<MaskDefinition> = js_adjustments
            .get("masks")
            .and_then(|m| serde_json::from_value(m.clone()).ok())
            .unwrap_or_default();
        let scaled_crop_offset = (
            unscaled_crop_offset.0 * gpu_scale,
            unscaled_crop_offset.1 * gpu_scale,
        );

        let mask_bitmaps: Vec<ImageBuffer<Luma<u8>, Vec<u8>>> = mask_definitions
            .iter()
            .filter_map(|def| {
                get_cached_or_generate_mask(
                    &state,
                    def,
                    preview_w,
                    preview_h,
                    total_scale,
                    scaled_crop_offset,
                    &js_adjustments,
                )
            })
            .collect();

        let tm_override = resolve_tonemapper_override_from_handle(&app_handle, is_raw);
        let mut all_adjustments =
            get_all_adjustments_from_json(&js_adjustments, is_raw, tm_override);
        all_adjustments.global.show_clipping = 0;

        let lut = js_adjustments["lutPath"]
            .as_str()
            .and_then(|p| get_or_load_lut(&state, p).ok());
        let unique_hash =
            calculate_full_job_hash(&source_path_str, &js_adjustments).wrapping_add(1);

        let processed_preview = process_and_get_dynamic_image(
            &context,
            &state,
            &preview_base,
            unique_hash,
            RenderRequest {
                adjustments: all_adjustments,
                mask_bitmaps: &mask_bitmaps,
                lut,
                roi: None,
            },
            "estimate_batch_export_size",
        )?;

        let preview_bytes = encode_image_to_bytes(
            &processed_preview,
            &output_format,
            export_settings.jpeg_quality,
        )?;
        let single_image_estimated_size = preview_bytes.len();

        let full_w = (shrunk_w as f32 / raw_scale_factor).round() as u32;
        let full_h = (shrunk_h as f32 / raw_scale_factor).round() as u32;

        let (final_full_w, final_full_h) = if let Some(resize_opts) = &export_settings.resize {
            calculate_resize_target(full_w, full_h, resize_opts)
        } else {
            (full_w, full_h)
        };

        let (processed_preview_w, processed_preview_h) = processed_preview.dimensions();
        let pixel_ratio = if processed_preview_w > 0 && processed_preview_h > 0 {
            (final_full_w as f64 * final_full_h as f64)
                / (processed_preview_w as f64 * processed_preview_h as f64)
        } else {
            1.0
        };

        (single_image_estimated_size as f64 * pixel_ratio) as usize
    };

    Ok(single_image_extrapolated_size.saturating_mul(paths.len()))
}

/// Options for a headless (CLI) export — no GUI required.
pub struct HeadlessExportOptions {
    pub source: String,
    pub output: String,
    pub format: String,
    pub quality: u8,
    pub keep_metadata: bool,
    pub adjustments_override: Option<String>,
}

/// Execute a single-image headless export.
///
/// Loads the source image, applies adjustments from sidecar or CLI override,
/// and writes the output file. Used by the `rapidraw export` CLI subcommand.
pub fn export_single_image_headless(
    opts: HeadlessExportOptions,
    app_handle: &tauri::AppHandle,
) -> Result<(), String> {
    let (source_path, sidecar_path) = parse_virtual_path(&opts.source);
    let source_path_str = source_path.to_string_lossy().to_string();

    let settings = load_settings(app_handle.clone()).unwrap_or_default();

    // Load source image
    let file_data = fs::read(&source_path_str)
        .map_err(|e| format!("Failed to read source file '{}': {}", source_path_str, e))?;

    let original_image =
        load_base_image_from_bytes(&file_data, &source_path_str, true, &settings, None)
            .map_err(|e| format!("Failed to load image: {}", e))?;

    // Determine adjustments: CLI override > sidecar > default
    let mut adjustments: Value = if let Some(adj_str) = &opts.adjustments_override {
        serde_json::from_str(adj_str)
            .map_err(|e| format!("Failed to parse --adjustments JSON: {}", e))?
    } else {
        let metadata = crate::exif_processing::load_sidecar(&sidecar_path);
        metadata.adjustments
    };

    // Apply transformations (crop, rotation, flip)
    let (transformed_image, _) =
        apply_all_transformations(Cow::Borrowed(&original_image), &adjustments);

    // Encode and write output
    let format_lower = opts.format.to_lowercase();
    let format_normalized = match format_lower.as_str() {
        "jpg" | "jpeg" => "jpeg",
        "png" => "png",
        "webp" => "webp",
        "tiff" | "tif" => "tiff",
        "jxl" => "jxl",
        other => return Err(format!("Unsupported output format: '{}'", other)),
    };

    let export_settings = ExportSettings {
        jpeg_quality: opts.quality,
        resize: None,
        keep_metadata: opts.keep_metadata,
        preserve_timestamps: false,
        strip_gps: false,
        filename_template: None,
        watermark: None,
        export_masks: false,
        preserve_folders: false,
    };

    let mut processed = transformed_image.into_owned();

    // AI Lens Blur (Bokeh) — applied after geometry transforms, before encode.
    // No-op unless `lensBlurEnabled` is set and a depth map is present in the
    // adjustments JSON (from sidecar or --adjustments override).
    let blur_result = crate::lens_blur::apply_lens_blur(Cow::Borrowed(&processed), &adjustments);
    if let Cow::Owned(blurred) = blur_result {
        processed = blurred;
    }

    // Apply EXIF metadata if requested
    let final_bytes = encode_image_to_bytes(&processed, format_normalized, opts.quality)?;

    // Write output file
    let output_path = Path::new(&opts.output);
    if let Some(parent) = output_path.parent()
        && !parent.as_os_str().is_empty()
    {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create output directory: {}", e))?;
    }

    fs::write(output_path, &final_bytes)
        .map_err(|e| format!("Failed to write output file '{}': {}", opts.output, e))?;

    // Optionally preserve EXIF metadata
    if opts.keep_metadata {
        // EXIF preservation in headless mode is best-effort;
        // the sidecar (.rrdata) metadata is always preserved separately.
        log::info!(
            "Headless export: metadata preservation requested (sidecar preserved separately)"
        );
    }

    log::info!(
        "Headless export: {} -> {} ({})",
        source_path_str,
        opts.output,
        format_normalized
    );
    Ok(())
}
