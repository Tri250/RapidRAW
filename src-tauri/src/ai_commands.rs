#[allow(clippy::too_many_arguments)]

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::io::Cursor;

use base64::{Engine as _, engine::general_purpose};
use image::{GenericImageView, GrayImage, ImageFormat, Rgba};

use crate::ai_connector;
use crate::ai_processing::{
    AiDepthMaskParameters, AiForegroundMaskParameters, AiSkyMaskParameters,
    AiSubjectMaskParameters, CachedDepthMap, generate_image_embeddings, get_or_init_ai_models,
    get_or_init_clip_models, run_depth_anything_model, run_sam_decoder, run_sky_seg_model,
    run_u2netp_model,
};
use crate::app_settings::load_settings;
use crate::app_state::AppState;
use crate::cache_utils::GEOMETRY_KEYS;
use crate::file_management::parse_virtual_path;
use crate::formats::is_raw_file;
use crate::get_cached_full_warped_image;
use crate::tagging::{extract_color_tags, generate_tags_with_clip};

fn encode_to_base64_png(image: &GrayImage) -> Result<String, String> {
    let mut buf = Cursor::new(Vec::new());
    image
        .write_to(&mut buf, ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    let base64_str = general_purpose::STANDARD.encode(buf.get_ref());
    Ok(format!("data:image/png;base64,{}", base64_str))
}

#[tauri::command]
pub async fn generate_ai_foreground_mask(
    js_adjustments: serde_json::Value,
    rotation: f32,
    flip_horizontal: bool,
    flip_vertical: bool,
    orientation_steps: u8,
    state: tauri::State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<AiForegroundMaskParameters, String> {
    let models = get_or_init_ai_models(&app_handle, &state.ai_state, &state.ai_init_lock)
        .await
        .map_err(|e| e.to_string())?;

    let warped_image = get_cached_full_warped_image(&state, &js_adjustments)?;

    let full_mask_image =
        run_u2netp_model(warped_image.as_ref(), &models.u2netp).map_err(|e| e.to_string())?;
    let base64_data = encode_to_base64_png(&full_mask_image)?;

    Ok(AiForegroundMaskParameters {
        mask_data_base64: Some(base64_data),
        rotation: Some(rotation),
        flip_horizontal: Some(flip_horizontal),
        flip_vertical: Some(flip_vertical),
        orientation_steps: Some(orientation_steps),
    })
}

#[tauri::command]
pub async fn generate_ai_sky_mask(
    js_adjustments: serde_json::Value,
    rotation: f32,
    flip_horizontal: bool,
    flip_vertical: bool,
    orientation_steps: u8,
    state: tauri::State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<AiSkyMaskParameters, String> {
    let models = get_or_init_ai_models(&app_handle, &state.ai_state, &state.ai_init_lock)
        .await
        .map_err(|e| e.to_string())?;

    let warped_image = get_cached_full_warped_image(&state, &js_adjustments)?;

    let full_mask_image =
        run_sky_seg_model(warped_image.as_ref(), &models.sky_seg).map_err(|e| e.to_string())?;
    let base64_data = encode_to_base64_png(&full_mask_image)?;

    Ok(AiSkyMaskParameters {
        mask_data_base64: Some(base64_data),
        rotation: Some(rotation),
        flip_horizontal: Some(flip_horizontal),
        flip_vertical: Some(flip_vertical),
        orientation_steps: Some(orientation_steps),
    })
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn generate_ai_depth_mask(
    js_adjustments: serde_json::Value,
    path: String,
    min_depth: f32,
    max_depth: f32,
    min_fade: f32,
    max_fade: f32,
    feather: f32,
    rotation: f32,
    flip_horizontal: bool,
    flip_vertical: bool,
    orientation_steps: u8,
    state: tauri::State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<AiDepthMaskParameters, String> {
    let models = get_or_init_ai_models(&app_handle, &state.ai_state, &state.ai_init_lock)
        .await
        .map_err(|e| e.to_string())?;

    let path_hash = {
        let mut hasher = blake3::Hasher::new();
        hasher.update(path.as_bytes());
        let mut geo_hasher = DefaultHasher::new();
        for key in GEOMETRY_KEYS {
            if let Some(val) = js_adjustments.get(key) {
                key.hash(&mut geo_hasher);
                val.to_string().hash(&mut geo_hasher);
            }
        }
        hasher.update(&geo_hasher.finish().to_le_bytes());
        hasher.finalize().to_hex().to_string()
    };

    let cached_depth = {
        let mut ai_state_lock = state.ai_state.lock().unwrap();
        let ai_state = ai_state_lock.as_mut().unwrap();

        if let Some(cached) = &ai_state.depth_map {
            if cached.path_hash == path_hash {
                cached.clone()
            } else {
                let warped_image = get_cached_full_warped_image(&state, &js_adjustments)?;
                let depth_img =
                    run_depth_anything_model(warped_image.as_ref(), &models.depth_anything)
                        .map_err(|e| e.to_string())?;
                let new_cache = CachedDepthMap {
                    path_hash: path_hash.clone(),
                    depth_image: depth_img,
                    original_size: (warped_image.width(), warped_image.height()),
                };
                ai_state.depth_map = Some(new_cache.clone());
                new_cache
            }
        } else {
            let warped_image = get_cached_full_warped_image(&state, &js_adjustments)?;
            let depth_img = run_depth_anything_model(warped_image.as_ref(), &models.depth_anything)
                .map_err(|e| e.to_string())?;
            let new_cache = CachedDepthMap {
                path_hash: path_hash.clone(),
                depth_image: depth_img,
                original_size: (warped_image.width(), warped_image.height()),
            };
            ai_state.depth_map = Some(new_cache.clone());
            new_cache
        }
    };

    let raw_depth_fullres = image::imageops::resize(
        &cached_depth.depth_image,
        cached_depth.original_size.0,
        cached_depth.original_size.1,
        image::imageops::FilterType::Triangle,
    );

    let base64_data = encode_to_base64_png(&raw_depth_fullres)?;

    Ok(AiDepthMaskParameters {
        min_depth,
        max_depth,
        min_fade,
        max_fade,
        feather,
        mask_data_base64: Some(base64_data),
        rotation: Some(rotation),
        flip_horizontal: Some(flip_horizontal),
        flip_vertical: Some(flip_vertical),
        orientation_steps: Some(orientation_steps),
    })
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn generate_ai_subject_mask(
    js_adjustments: serde_json::Value,
    path: String,
    start_point: (f64, f64),
    end_point: (f64, f64),
    rotation: f32,
    flip_horizontal: bool,
    flip_vertical: bool,
    orientation_steps: u8,
    state: tauri::State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<AiSubjectMaskParameters, String> {
    let models = get_or_init_ai_models(&app_handle, &state.ai_state, &state.ai_init_lock)
        .await
        .map_err(|e| e.to_string())?;

    let path_hash = {
        let mut hasher = blake3::Hasher::new();
        hasher.update(path.as_bytes());
        let mut geo_hasher = DefaultHasher::new();
        for key in GEOMETRY_KEYS {
            if let Some(val) = js_adjustments.get(key) {
                key.hash(&mut geo_hasher);
                val.to_string().hash(&mut geo_hasher);
            }
        }
        hasher.update(&geo_hasher.finish().to_le_bytes());
        hasher.finalize().to_hex().to_string()
    };

    let embeddings = {
        let mut ai_state_lock = state.ai_state.lock().unwrap();
        let ai_state = ai_state_lock.as_mut().unwrap();

        if let Some(cached_embeddings) = &ai_state.embeddings {
            if cached_embeddings.path_hash == path_hash {
                cached_embeddings.clone()
            } else {
                let warped_image = get_cached_full_warped_image(&state, &js_adjustments)?;
                let mut new_embeddings =
                    generate_image_embeddings(warped_image.as_ref(), &models.sam_encoder)
                        .map_err(|e| e.to_string())?;
                new_embeddings.path_hash = path_hash.clone();
                ai_state.embeddings = Some(new_embeddings.clone());
                new_embeddings
            }
        } else {
            let warped_image = get_cached_full_warped_image(&state, &js_adjustments)?;
            let mut new_embeddings =
                generate_image_embeddings(warped_image.as_ref(), &models.sam_encoder)
                    .map_err(|e| e.to_string())?;
            new_embeddings.path_hash = path_hash.clone();
            ai_state.embeddings = Some(new_embeddings.clone());
            new_embeddings
        }
    };

    let (img_w, img_h) = embeddings.original_size;

    let (coarse_rotated_w, coarse_rotated_h) = if orientation_steps % 2 == 1 {
        (img_h as f64, img_w as f64)
    } else {
        (img_w as f64, img_h as f64)
    };

    let center = (coarse_rotated_w / 2.0, coarse_rotated_h / 2.0);

    let p1 = start_point;
    let p2 = (start_point.0, end_point.1);
    let p3 = end_point;
    let p4 = (end_point.0, start_point.1);

    let angle_rad = (rotation as f64).to_radians();
    let cos_a = angle_rad.cos();
    let sin_a = angle_rad.sin();

    let unrotate = |p: (f64, f64)| {
        let px = p.0 - center.0;
        let py = p.1 - center.1;
        let new_px = px * cos_a + py * sin_a + center.0;
        let new_py = -px * sin_a + py * cos_a + center.1;
        (new_px, new_py)
    };

    let up1 = unrotate(p1);
    let up2 = unrotate(p2);
    let up3 = unrotate(p3);
    let up4 = unrotate(p4);

    let unflip = |p: (f64, f64)| {
        let mut new_px = p.0;
        let mut new_py = p.1;
        if flip_horizontal {
            new_px = coarse_rotated_w - p.0;
        }
        if flip_vertical {
            new_py = coarse_rotated_h - p.1;
        }
        (new_px, new_py)
    };

    let ufp1 = unflip(up1);
    let ufp2 = unflip(up2);
    let ufp3 = unflip(up3);
    let ufp4 = unflip(up4);

    let un_coarse_rotate = |p: (f64, f64)| -> (f64, f64) {
        match orientation_steps {
            0 => p,
            1 => (p.1, img_h as f64 - p.0),
            2 => (img_w as f64 - p.0, img_h as f64 - p.1),
            3 => (img_w as f64 - p.1, p.0),
            _ => p,
        }
    };

    let ucrp1 = un_coarse_rotate(ufp1);
    let ucrp2 = un_coarse_rotate(ufp2);
    let ucrp3 = un_coarse_rotate(ufp3);
    let ucrp4 = un_coarse_rotate(ufp4);

    let min_x = ucrp1.0.min(ucrp2.0).min(ucrp3.0).min(ucrp4.0);
    let min_y = ucrp1.1.min(ucrp2.1).min(ucrp3.1).min(ucrp4.1);
    let max_x = ucrp1.0.max(ucrp2.0).max(ucrp3.0).max(ucrp4.0);
    let max_y = ucrp1.1.max(ucrp2.1).max(ucrp3.1).max(ucrp4.1);

    let unrotated_start_point = (min_x, min_y);
    let unrotated_end_point = (max_x, max_y);

    let mask_bitmap = run_sam_decoder(
        &models.sam_decoder,
        &embeddings,
        unrotated_start_point,
        unrotated_end_point,
    )
    .map_err(|e| e.to_string())?;
    let base64_data = encode_to_base64_png(&mask_bitmap)?;

    Ok(AiSubjectMaskParameters {
        start_x: start_point.0,
        start_y: start_point.1,
        end_x: end_point.0,
        end_y: end_point.1,
        mask_data_base64: Some(base64_data),
        rotation: Some(rotation),
        flip_horizontal: Some(flip_horizontal),
        flip_vertical: Some(flip_vertical),
        orientation_steps: Some(orientation_steps),
    })
}

#[tauri::command]
pub async fn precompute_ai_subject_mask(
    js_adjustments: serde_json::Value,
    path: String,
    state: tauri::State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let models = get_or_init_ai_models(&app_handle, &state.ai_state, &state.ai_init_lock)
        .await
        .map_err(|e| e.to_string())?;

    let path_hash = {
        let mut hasher = blake3::Hasher::new();
        hasher.update(path.as_bytes());
        let mut geo_hasher = DefaultHasher::new();
        for key in GEOMETRY_KEYS {
            if let Some(val) = js_adjustments.get(key) {
                key.hash(&mut geo_hasher);
                val.to_string().hash(&mut geo_hasher);
            }
        }
        hasher.update(&geo_hasher.finish().to_le_bytes());
        hasher.finalize().to_hex().to_string()
    };

    let mut ai_state_lock = state.ai_state.lock().unwrap();
    let ai_state = ai_state_lock.as_mut().unwrap();

    if let Some(cached_embeddings) = &ai_state.embeddings
        && cached_embeddings.path_hash == path_hash
    {
        return Ok(());
    }

    let warped_image = get_cached_full_warped_image(&state, &js_adjustments)?;
    let mut new_embeddings = generate_image_embeddings(warped_image.as_ref(), &models.sam_encoder)
        .map_err(|e| e.to_string())?;

    new_embeddings.path_hash = path_hash.clone();
    ai_state.embeddings = Some(new_embeddings);

    Ok(())
}

#[tauri::command]
pub async fn check_ai_connector_status(app_handle: tauri::AppHandle) {
    let settings = load_settings(app_handle.clone()).unwrap_or_default();
    let is_connected = if let Some(address) = settings.ai_connector_address {
        ai_connector::check_status(&address).await.unwrap_or(false)
    } else {
        false
    };
    use tauri::Emitter;
    let _ = app_handle.emit(
        "ai-connector-status-update",
        serde_json::json!({ "connected": is_connected }),
    );
}

#[tauri::command]
pub async fn test_ai_connector_connection(address: String) -> Result<(), String> {
    match ai_connector::check_status(&address).await {
        Ok(true) => Ok(()),
        Ok(false) => Err("Server reachable but returned bad health status".to_string()),
        Err(e) => Err(e.to_string()),
    }
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AiRatingResult {
    pub rating: u8,
    pub description: String,
    pub tags: Vec<String>,
}

fn compute_rating_from_features(image: &image::DynamicImage) -> (u8, String) {
    let width = image.width();
    let height = image.height();
    let rgb_image = image.to_rgb8();

    // Downsample for analysis speed
    let analysis_size = 200u32;
    let small = image::imageops::resize(
        &rgb_image,
        analysis_size,
        analysis_size,
        image::imageops::FilterType::Triangle,
    );

    let mut luminances: Vec<f32> = Vec::with_capacity((analysis_size * analysis_size) as usize);
    let mut reds: Vec<f32> = Vec::new();
    let mut greens: Vec<f32> = Vec::new();
    let mut blues: Vec<f32> = Vec::new();

    for pixel in small.pixels() {
        let r = pixel[0] as f32 / 255.0;
        let g = pixel[1] as f32 / 255.0;
        let b = pixel[2] as f32 / 255.0;
        let lum = 0.299 * r + 0.587 * g + 0.114 * b;
        luminances.push(lum);
        reds.push(r);
        greens.push(g);
        blues.push(b);
    }

    let n = luminances.len() as f32;

    // Mean and variance of luminance
    let mean_lum: f32 = luminances.iter().sum::<f32>() / n;
    let var_lum: f32 = luminances
        .iter()
        .map(|x| (x - mean_lum).powi(2))
        .sum::<f32>()
        / n;

    // Dynamic range (contrast)
    let min_lum = luminances.iter().cloned().fold(f32::INFINITY, f32::min);
    let max_lum = luminances.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
    let dynamic_range = max_lum - min_lum;

    // Color saturation (average across pixels)
    let avg_sat: f32 = {
        let mut sat_sum = 0.0f32;
        for i in 0..luminances.len() {
            let max_c = reds[i].max(greens[i]).max(blues[i]);
            let min_c = reds[i].min(greens[i]).min(blues[i]);
            sat_sum += if max_c > 0.0 {
                (max_c - min_c) / max_c
            } else {
                0.0
            };
        }
        sat_sum / n
    };

    // Rule of thirds - center weight analysis
    let center_score: f32 = {
        let third_w = analysis_size as usize / 3;
        let third_h = analysis_size as usize / 3;
        let mut center_lum_sum = 0.0f32;
        let mut center_count = 0usize;
        let mut edge_lum_sum = 0.0f32;
        let mut edge_count = 0usize;
        for y in 0..analysis_size as usize {
            for x in 0..analysis_size as usize {
                let lum = luminances[y * analysis_size as usize + x];
                let is_center = x >= third_w && x < 2 * third_w && y >= third_h && y < 2 * third_h;
                if is_center {
                    center_lum_sum += lum;
                    center_count += 1;
                } else {
                    edge_lum_sum += lum;
                    edge_count += 1;
                }
            }
        }
        let center_mean = if center_count > 0 {
            center_lum_sum / center_count as f32
        } else {
            0.0
        };
        let edge_mean = if edge_count > 0 {
            edge_lum_sum / edge_count as f32
        } else {
            0.0
        };
        // Moderate center-edge contrast is good (subject separation), but too much is harsh
        let contrast = (center_mean - edge_mean).abs();
        if contrast > 0.3 {
            0.7
        } else if contrast > 0.1 {
            1.0
        } else {
            0.6
        }
    };

    // Exposure quality: penalize too dark or too bright (clipped)
    let clipped_shadows = luminances.iter().filter(|&&l| l < 0.02).count() as f32 / n;
    let clipped_highlights = luminances.iter().filter(|&&l| l > 0.98).count() as f32 / n;
    let exposure_score: f32 = 1.0 - (clipped_shadows + clipped_highlights).min(1.0);

    // Aspect ratio: standard ratios (3:2, 4:3, 16:9) get a slight bonus
    let aspect = if height > 0 {
        width as f32 / height as f32
    } else {
        1.0
    };
    let aspect_score: f32 = {
        let near_standard = (aspect - 1.5).abs() < 0.1 // ~3:2
            || (aspect - 1.333).abs() < 0.1 // ~4:3
            || (aspect - 1.778).abs() < 0.1; // ~16:9
        if near_standard { 1.0 } else { 0.8 }
    };

    // Variance score: moderate variance indicates good tonal distribution
    let variance_score: f32 = {
        // Optimal variance around 0.06-0.10 for well-exposed photos
        let optimal_var = 0.08;
        let diff = (var_lum - optimal_var).abs();
        if diff < 0.02 {
            1.0
        } else if diff < 0.05 {
            0.8
        } else {
            0.5
        }
    };

    // Combine scores (weighted)
    let raw_score = variance_score * 0.25
        + dynamic_range.min(1.0) * 0.2
        + avg_sat * 0.15
        + center_score * 0.15
        + exposure_score * 0.15
        + aspect_score * 0.1;

    // Map to 1-5 rating
    let rating = if raw_score > 0.75 {
        5
    } else if raw_score > 0.6 {
        4
    } else if raw_score > 0.45 {
        3
    } else if raw_score > 0.3 {
        2
    } else {
        1
    };

    // Generate description
    let desc = if rating >= 4 {
        if avg_sat > 0.4 {
            "色彩丰富，构图良好".to_string()
        } else if dynamic_range > 0.7 {
            "动态范围优秀，曝光平衡".to_string()
        } else {
            "整体质量良好".to_string()
        }
    } else if rating == 3 {
        if clipped_shadows > 0.1 {
            "暗部细节有损失".to_string()
        } else if clipped_highlights > 0.1 {
            "高光有溢出".to_string()
        } else {
            "质量一般".to_string()
        }
    } else {
        if var_lum < 0.02 {
            "画面缺乏对比度".to_string()
        } else if avg_sat < 0.1 {
            "画面色彩平淡".to_string()
        } else {
            "建议调整后使用".to_string()
        }
    };

    (rating, desc)
}

#[tauri::command]
pub async fn generate_ai_rating(
    path: String,
    state: tauri::State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<AiRatingResult, String> {
    let (source_path, _) = parse_virtual_path(&path);
    let source_path_str = source_path.to_string_lossy().to_string();
    let settings = load_settings(app_handle.clone()).unwrap_or_default();

    // Load image
    let image_bytes =
        std::fs::read(&source_path).map_err(|e| format!("Failed to read image: {}", e))?;
    let image = crate::image_loader::load_base_image_from_bytes(
        &image_bytes,
        &source_path_str,
        true,
        &settings,
        None,
    )
    .map_err(|e| format!("Failed to load image: {}", e))?;

    // Compute heuristic rating
    let (rating, description) = compute_rating_from_features(&image);

    // Get tags using CLIP if available
    let tags =
        match get_or_init_clip_models(&app_handle, &state.ai_state, &state.ai_init_lock).await {
            Ok(clip_models) => {
                generate_tags_with_clip(&image, &clip_models.model, &clip_models.tokenizer, None, 8)
                    .unwrap_or_else(|_| extract_color_tags(&image))
            }
            Err(_) => extract_color_tags(&image),
        };

    Ok(AiRatingResult {
        rating,
        description,
        tags,
    })
}

#[tauri::command]
pub async fn generate_ai_ratings_batch(
    paths: Vec<String>,
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<AiRatingResult>, String> {
    let settings = load_settings(app_handle.clone()).unwrap_or_default();

    // Try to init CLIP models once for the batch
    let clip_models = get_or_init_clip_models(&app_handle, &state.ai_state, &state.ai_init_lock)
        .await
        .ok();

    let mut results = Vec::with_capacity(paths.len());

    for path in &paths {
        let (source_path, _) = parse_virtual_path(path);
        let source_path_str = source_path.to_string_lossy().to_string();

        let image_bytes = match std::fs::read(&source_path) {
            Ok(b) => b,
            Err(e) => {
                log::warn!("Failed to read image {}: {}", source_path_str, e);
                results.push(AiRatingResult {
                    rating: 0,
                    description: format!("读取失败: {}", e),
                    tags: Vec::new(),
                });
                continue;
            }
        };

        let image = match crate::image_loader::load_base_image_from_bytes(
            &image_bytes,
            &source_path_str,
            true,
            &settings,
            None,
        ) {
            Ok(img) => img,
            Err(e) => {
                log::warn!("Failed to load image {}: {}", source_path_str, e);
                results.push(AiRatingResult {
                    rating: 0,
                    description: format!("加载失败: {}", e),
                    tags: Vec::new(),
                });
                continue;
            }
        };

        let (rating, description) = compute_rating_from_features(&image);

        let tags = match &clip_models {
            Some(cm) => generate_tags_with_clip(&image, &cm.model, &cm.tokenizer, None, 8)
                .unwrap_or_else(|_| extract_color_tags(&image)),
            None => extract_color_tags(&image),
        };

        results.push(AiRatingResult {
            rating,
            description,
            tags,
        });
    }

    Ok(results)
}

// ---------------------------------------------------------------------------
// Sky Replacement
// ---------------------------------------------------------------------------

/// Replace the sky region using an existing sky mask with Poisson-like blending
/// at the edges. `sky_mask` is a grayscale mask (0=keep original, 255=use sky).
/// `sky_image_data` is the new sky image as raw RGBA bytes.
/// `blend_amount` controls edge blending (0..1).
#[tauri::command]
pub fn generate_ai_sky_replace(
    state: tauri::State<AppState>,
    sky_mask: Vec<u8>,
    sky_image_data: Vec<u8>,
    blend_amount: f32,
) -> Result<Vec<u8>, String> {
    let loaded_image = state
        .original_image
        .lock()
        .unwrap()
        .clone()
        .ok_or("No original image loaded")?;

    let (w, h) = loaded_image.image.as_ref().dimensions();
    if w == 0 || h == 0 {
        return Err("Image has zero dimensions".to_string());
    }

    let mut base_rgba = loaded_image.image.to_rgba8();

    // Decode the sky image
    let sky_img = image::load_from_memory(&sky_image_data)
        .map_err(|e| format!("Failed to decode sky image: {}", e))?;
    let sky_rgba = sky_img
        .resize_exact(w, h, image::imageops::FilterType::Lanczos3)
        .to_rgba8();

    // Validate mask dimensions
    if sky_mask.len() != (w as usize * h as usize) {
        return Err(format!(
            "Sky mask size {} does not match image {}x{}={}",
            sky_mask.len(),
            w,
            h,
            w as usize * h as usize
        ));
    }

    let blend = blend_amount.clamp(0.0, 1.0);
    let blend_radius = (blend * 10.0).round() as i32; // pixel radius for edge blending

    // Build a feathered mask from the binary sky_mask
    // Apply a simple box blur for feathering
    let mut feathered = vec![0.0f32; (w * h) as usize];
    for y in 0..h {
        for x in 0..w {
            let idx = (y * w + x) as usize;
            feathered[idx] = sky_mask[idx] as f32 / 255.0;
        }
    }

    // Simple box blur for feathering
    if blend_radius > 0 {
        let mut blurred = vec![0.0f32; feathered.len()];
        let w_usize = w as usize;
        let h_usize = h as usize;

        // Horizontal pass
        for y in 0..h_usize {
            for x in 0..w_usize {
                let mut sum = 0.0f32;
                let mut count = 0;
                for kx in -blend_radius..=blend_radius {
                    let nx = (x as i32 + kx).clamp(0, w_usize as i32 - 1) as usize;
                    sum += feathered[y * w_usize + nx];
                    count += 1;
                }
                blurred[y * w_usize + x] = sum / count as f32;
            }
        }

        // Vertical pass
        for y in 0..h_usize {
            for x in 0..w_usize {
                let mut sum = 0.0f32;
                let mut count = 0;
                for ky in -blend_radius..=blend_radius {
                    let ny = (y as i32 + ky).clamp(0, h_usize as i32 - 1) as usize;
                    sum += blurred[ny * w_usize + x];
                    count += 1;
                }
                feathered[y * w_usize + x] = sum / count as f32;
            }
        }
    }

    // Composite: blend original and sky using the feathered mask
    for y in 0..h {
        for x in 0..w {
            let idx = (y * w + x) as usize;
            let alpha = feathered[idx];

            let base = base_rgba.get_pixel(x, y);
            let sky = sky_rgba.get_pixel(x, y);

            let r = (base[0] as f32 * (1.0 - alpha) + sky[0] as f32 * alpha).round() as u8;
            let g = (base[1] as f32 * (1.0 - alpha) + sky[1] as f32 * alpha).round() as u8;
            let b = (base[2] as f32 * (1.0 - alpha) + sky[2] as f32 * alpha).round() as u8;

            base_rgba.put_pixel(x, y, Rgba([r, g, b, base[3]]));
        }
    }

    // Encode result as PNG
    let mut buf = Cursor::new(Vec::new());
    base_rgba
        .write_to(&mut buf, ImageFormat::Png)
        .map_err(|e| format!("Failed to encode result: {}", e))?;

    Ok(buf.into_inner())
}

// ---------------------------------------------------------------------------
// Background Removal
// ---------------------------------------------------------------------------

/// Remove background using the existing foreground mask from AI state.
/// Produces an RGBA PNG with alpha channel from the mask.
#[tauri::command]
pub fn generate_ai_background_remove(state: tauri::State<AppState>) -> Result<Vec<u8>, String> {
    let loaded_image = state
        .original_image
        .lock()
        .unwrap()
        .clone()
        .ok_or("No original image loaded")?;

    let (w, h) = loaded_image.image.as_ref().dimensions();
    if w == 0 || h == 0 {
        return Err("Image has zero dimensions".to_string());
    }

    // Get the foreground mask from AI state via depth map
    let foreground_mask = {
        let ai_state_lock = state.ai_state.lock().unwrap();
        let ai_state = ai_state_lock
            .as_ref()
            .ok_or("AI state not initialized. Please generate a depth mask first.")?;

        if let Some(depth) = &ai_state.depth_map {
            // Use depth map: treat closer objects (higher depth value) as foreground
            let mut mask = depth.depth_image.clone();
            // Threshold: pixels above 128 are foreground
            for pixel in mask.pixels_mut() {
                pixel[0] = if pixel[0] > 128 { 255 } else { 0 };
            }
            // Resize to match
            image::imageops::resize(&mask, w, h, image::imageops::FilterType::Triangle)
        } else {
            return Err("No depth map available. Please generate a depth mask first.".to_string());
        }
    };

    // Resize mask to match image dimensions
    let mask_resized = if foreground_mask.width() != w || foreground_mask.height() != h {
        image::imageops::resize(
            &foreground_mask,
            w,
            h,
            image::imageops::FilterType::Triangle,
        )
    } else {
        foreground_mask
    };

    // Apply mask as alpha channel
    let mut rgba = loaded_image.image.to_rgba8();
    for y in 0..h {
        for x in 0..w {
            let alpha = mask_resized.get_pixel(x, y)[0];
            let pixel = rgba.get_pixel_mut(x, y);
            pixel[3] = alpha;
        }
    }

    // Encode as PNG
    let mut buf = Cursor::new(Vec::new());
    rgba.write_to(&mut buf, ImageFormat::Png)
        .map_err(|e| format!("Failed to encode result: {}", e))?;

    Ok(buf.into_inner())
}

// ---------------------------------------------------------------------------
// Super Resolution
// ---------------------------------------------------------------------------

/// Apply 2x super-resolution using Lanczos3 upsampling followed by
/// sharpening enhancement. No deep learning model is used.
#[tauri::command]
pub fn apply_super_resolution(
    state: tauri::State<AppState>,
    scale: f32,
) -> Result<Vec<u8>, String> {
    let loaded_image = state
        .original_image
        .lock()
        .unwrap()
        .clone()
        .ok_or("No original image loaded")?;

    let (w, h) = loaded_image.image.as_ref().dimensions();
    if w == 0 || h == 0 {
        return Err("Image has zero dimensions".to_string());
    }

    let effective_scale = scale.clamp(1.0, 4.0);
    let new_w = (w as f32 * effective_scale).round() as u32;
    let new_h = (h as f32 * effective_scale).round() as u32;

    // Step 1: Lanczos3 upsampling
    let mut upscaled = loaded_image
        .image
        .resize_exact(new_w, new_h, image::imageops::FilterType::Lanczos3)
        .to_rgba8();

    // Step 2: Sharpening enhancement (unsharp mask)
    // Create a blurred version
    let blurred = image::imageops::blur(&upscaled, 1.0);

    // Unsharp mask: sharpened = original + amount * (original - blurred)
    let amount = 0.5_f32;
    for y in 0..new_h {
        for x in 0..new_w {
            let orig = upscaled.get_pixel(x, y);
            let blur = blurred.get_pixel(x, y);

            let r = (orig[0] as f32 + amount * (orig[0] as f32 - blur[0] as f32))
                .round()
                .clamp(0.0, 255.0) as u8;
            let g = (orig[1] as f32 + amount * (orig[1] as f32 - blur[1] as f32))
                .round()
                .clamp(0.0, 255.0) as u8;
            let b = (orig[2] as f32 + amount * (orig[2] as f32 - blur[2] as f32))
                .round()
                .clamp(0.0, 255.0) as u8;

            upscaled.put_pixel(x, y, Rgba([r, g, b, orig[3]]));
        }
    }

    // Encode as PNG
    let mut buf = Cursor::new(Vec::new());
    upscaled
        .write_to(&mut buf, ImageFormat::Png)
        .map_err(|e| format!("Failed to encode result: {}", e))?;

    Ok(buf.into_inner())
}
