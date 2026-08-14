use crate::gpu_processing::WgpuDisplay;
use bytemuck::{Pod, Zeroable};
use glam::{Mat3, Vec2, Vec3};
use image::{DynamicImage, GenericImageView, Rgb32FImage, Rgba};
use imageproc::geometric_transformations::{Border, Interpolation, rotate_about_center};
use nalgebra::{Matrix3 as NaMatrix3, Vector3 as NaVector3};
use rawler::decoders::Orientation;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use serde_json::json;
use std::borrow::Cow;
use std::sync::Arc;

pub use crate::gpu_processing::{
    RenderRequest, get_or_init_gpu_context, process_and_get_dynamic_image,
    process_and_get_dynamic_image_with_analytics,
};
use crate::{AppState, MutexResilient, mask_generation::MaskDefinition};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};

/// Maximum total pixels allowed for CPU-intensive image processing.
/// 200 megapixels × 12 bytes/pixel (f32 RGB) ≈ 2.4 GB per buffer.
/// This prevents OOM from processing extremely large images (e.g., stitched panoramas).
const MAX_IMAGE_PIXELS: u64 = 200_000_000;

/// Maximum concurrent heavy CPU processing operations to prevent OOM
/// from parallel buffer allocations.
const MAX_CONCURRENT_PROCESSING: usize = 2;

static CONCURRENT_PROCESSING_COUNT: std::sync::atomic::AtomicUsize =
    std::sync::atomic::AtomicUsize::new(0);

/// Math constants shared across the module.
const PI: f32 = std::f32::consts::PI;
const EPS: f32 = 1e-6;

/// Validates that image dimensions won't cause OOM or integer overflow.
/// Merged with the previously duplicated pub variant:
/// checks zero dimensions, 200MP safety ceiling, and a hard 16384² cap.
fn validate_image_dimensions(width: u32, height: u32) -> Result<(), String> {
    if width == 0 || height == 0 {
        return Err("Image has zero dimension".into());
    }
    if width > 16384 || height > 16384 {
        return Err(format!("Image too large: {}x{} (max 16384)", width, height));
    }
    let total_pixels = width as u64 * height as u64;
    if total_pixels > MAX_IMAGE_PIXELS {
        return Err(format!(
            "Image is too large to process safely ({}x{} = {}MP). Maximum is {}MP.",
            width,
            height,
            total_pixels / 1_000_000,
            MAX_IMAGE_PIXELS / 1_000_000
        ));
    }
    Ok(())
}

/// Computes the buffer size for an RGB32F image with overflow checking.
/// Returns the number of f32 elements needed (width * height * 3).
fn checked_rgb32f_buffer_size(width: u32, height: u32) -> Result<usize, String> {
    let total_elements = width as u64 * height as u64 * 3;
    if total_elements > usize::MAX as u64 {
        return Err(format!(
            "Buffer size overflow for {}x{} image",
            width, height
        ));
    }
    Ok(total_elements as usize)
}

/// RAII guard for the processing concurrency semaphore.
/// Limits the number of concurrent heavy image processing operations
/// to prevent OOM from parallel buffer allocations.
struct ProcessingGuard;

impl ProcessingGuard {
    fn acquire() -> Result<Self, String> {
        use std::sync::atomic::Ordering;
        loop {
            let current = CONCURRENT_PROCESSING_COUNT.load(Ordering::Acquire);
            if current >= MAX_CONCURRENT_PROCESSING {
                return Err(format!(
                    "Too many concurrent image processing operations (limit: {})",
                    MAX_CONCURRENT_PROCESSING
                ));
            }
            if CONCURRENT_PROCESSING_COUNT
                .compare_exchange_weak(current, current + 1, Ordering::AcqRel, Ordering::Acquire)
                .is_ok()
            {
                return Ok(ProcessingGuard);
            }
        }
    }
}

impl Drop for ProcessingGuard {
    fn drop(&mut self) {
        use std::sync::atomic::Ordering;
        CONCURRENT_PROCESSING_COUNT.fetch_sub(1, Ordering::AcqRel);
    }
}

pub trait IntoCowImage<'a> {
    fn into_cow(self) -> Cow<'a, DynamicImage>;
}

impl<'a> IntoCowImage<'a> for DynamicImage {
    fn into_cow(self) -> Cow<'a, DynamicImage> {
        Cow::Owned(self)
    }
}

impl<'a> IntoCowImage<'a> for &'a DynamicImage {
    fn into_cow(self) -> Cow<'a, DynamicImage> {
        Cow::Borrowed(self)
    }
}

impl<'a> IntoCowImage<'a> for Cow<'a, DynamicImage> {
    fn into_cow(self) -> Cow<'a, DynamicImage> {
        self
    }
}

impl<'a> IntoCowImage<'a> for &'a std::sync::Arc<DynamicImage> {
    fn into_cow(self) -> Cow<'a, DynamicImage> {
        Cow::Borrowed(self.as_ref())
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ImageMetadata {
    pub version: u32,
    pub rating: u8,
    pub adjustments: Value,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exif: Option<std::collections::HashMap<String, String>>,
}

impl Default for ImageMetadata {
    fn default() -> Self {
        ImageMetadata {
            version: 1,
            rating: 0,
            adjustments: Value::Null,
            tags: None,
            exif: None,
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy)]
pub struct Crop {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy)]
pub struct GeometryParams {
    pub distortion: f32,
    pub vertical: f32,
    pub horizontal: f32,
    pub rotate: f32,
    pub aspect: f32,
    pub scale: f32,
    pub x_offset: f32,
    pub y_offset: f32,
    pub lens_distortion_amount: f32,
    pub lens_vignette_amount: f32,
    pub lens_tca_amount: f32,
    pub lens_distortion_enabled: bool,
    pub lens_tca_enabled: bool,
    pub lens_vignette_enabled: bool,
    pub lens_dist_k1: f32,
    pub lens_dist_k2: f32,
    pub lens_dist_k3: f32,
    pub lens_model: u32,
    pub tca_vr: f32,
    pub tca_vb: f32,
    pub vig_k1: f32,
    pub vig_k2: f32,
    pub vig_k3: f32,
}

impl Default for GeometryParams {
    fn default() -> Self {
        Self {
            distortion: 0.0,
            vertical: 0.0,
            horizontal: 0.0,
            rotate: 0.0,
            aspect: 0.0,
            scale: 100.0,
            x_offset: 0.0,
            y_offset: 0.0,
            lens_distortion_amount: 1.0,
            lens_vignette_amount: 1.0,
            lens_tca_amount: 1.0,
            lens_distortion_enabled: true,
            lens_tca_enabled: true,
            lens_vignette_enabled: true,
            lens_dist_k1: 0.0,
            lens_dist_k2: 0.0,
            lens_dist_k3: 0.0,
            lens_model: 0,
            tca_vr: 1.0,
            tca_vb: 1.0,
            vig_k1: 0.0,
            vig_k2: 0.0,
            vig_k3: 0.0,
        }
    }
}

pub fn get_geometry_params_from_json(adjustments: &serde_json::Value) -> GeometryParams {
    let lens_params = adjustments
        .get("lensDistortionParams")
        .and_then(|v| v.as_object());

    GeometryParams {
        distortion: adjustments["transformDistortion"].as_f64().unwrap_or(0.0) as f32,
        vertical: adjustments["transformVertical"].as_f64().unwrap_or(0.0) as f32,
        horizontal: adjustments["transformHorizontal"].as_f64().unwrap_or(0.0) as f32,
        rotate: adjustments["transformRotate"].as_f64().unwrap_or(0.0) as f32,
        aspect: adjustments["transformAspect"].as_f64().unwrap_or(0.0) as f32,
        scale: adjustments["transformScale"].as_f64().unwrap_or(100.0) as f32,
        x_offset: adjustments["transformXOffset"].as_f64().unwrap_or(0.0) as f32,
        y_offset: adjustments["transformYOffset"].as_f64().unwrap_or(0.0) as f32,

        lens_distortion_amount: adjustments["lensDistortionAmount"]
            .as_f64()
            .unwrap_or(100.0) as f32
            / 100.0,
        lens_vignette_amount: adjustments["lensVignetteAmount"].as_f64().unwrap_or(100.0) as f32
            / 100.0,
        lens_tca_amount: adjustments["lensTcaAmount"].as_f64().unwrap_or(100.0) as f32 / 100.0,
        lens_distortion_enabled: adjustments["lensDistortionEnabled"]
            .as_bool()
            .unwrap_or(true),
        lens_tca_enabled: adjustments["lensTcaEnabled"].as_bool().unwrap_or(true),
        lens_vignette_enabled: adjustments["lensVignetteEnabled"].as_bool().unwrap_or(true),

        lens_dist_k1: lens_params
            .and_then(|p| p.get("k1").and_then(|k| k.as_f64()))
            .unwrap_or(0.0) as f32,
        lens_dist_k2: lens_params
            .and_then(|p| p.get("k2").and_then(|k| k.as_f64()))
            .unwrap_or(0.0) as f32,
        lens_dist_k3: lens_params
            .and_then(|p| p.get("k3").and_then(|k| k.as_f64()))
            .unwrap_or(0.0) as f32,
        lens_model: lens_params
            .and_then(|p| p.get("model").and_then(|m| m.as_u64()))
            .unwrap_or(0) as u32,
        tca_vr: lens_params
            .and_then(|p| p.get("tca_vr").and_then(|k| k.as_f64()))
            .unwrap_or(1.0) as f32,
        tca_vb: lens_params
            .and_then(|p| p.get("tca_vb").and_then(|k| k.as_f64()))
            .unwrap_or(1.0) as f32,
        vig_k1: lens_params
            .and_then(|p| p.get("vig_k1").and_then(|k| k.as_f64()))
            .unwrap_or(0.0) as f32,
        vig_k2: lens_params
            .and_then(|p| p.get("vig_k2").and_then(|k| k.as_f64()))
            .unwrap_or(0.0) as f32,
        vig_k3: lens_params
            .and_then(|p| p.get("vig_k3").and_then(|k| k.as_f64()))
            .unwrap_or(0.0) as f32,
    }
}

pub fn downscale_f32_image(image: &DynamicImage, nwidth: u32, nheight: u32) -> DynamicImage {
    let start = std::time::Instant::now();

    let (width, height) = image.dimensions();
    if nwidth == 0 || nheight == 0 || (nwidth >= width && nheight >= height) {
        return image.clone();
    }

    let ratio = (nwidth as f32 / width as f32).min(nheight as f32 / height as f32);
    let new_w = (width as f32 * ratio).round() as u32;
    let new_h = (height as f32 * ratio).round() as u32;

    if new_w == 0 || new_h == 0 {
        return image.clone();
    }

    let tmp_img;
    let img_ref = if let Some(rgb) = image.as_rgb32f() {
        rgb
    } else {
        tmp_img = image.to_rgb32f();
        &tmp_img
    };
    let src: &[f32] = img_ref.as_raw();

    let x_ratio = width as f32 / new_w as f32;
    let y_ratio = height as f32 / new_h as f32;
    let width_usize = width as usize;

    let mut x_bounds = Vec::with_capacity(new_w as usize);
    let mut x_weights = Vec::new();
    for x_out in 0..new_w as usize {
        let x_start = x_out as f32 * x_ratio;
        let x_end = (x_out + 1) as f32 * x_ratio;
        let x_in_start = x_start.floor() as usize;
        let x_in_end = (x_end.ceil() as usize).min(width as usize);

        let weight_start_idx = x_weights.len();
        let mut w_sum = 0.0;
        let mut tmp_w = Vec::with_capacity(x_in_end.saturating_sub(x_in_start));

        let mut actual_start = x_in_end;
        let mut actual_end = x_in_start;

        for x_in in x_in_start..x_in_end {
            let overlap_start = x_start.max(x_in as f32);
            let overlap_end = x_end.min((x_in + 1) as f32);
            let w = (overlap_end - overlap_start).max(0.0);
            if w > 0.0 {
                actual_start = actual_start.min(x_in);
                actual_end = actual_end.max(x_in + 1);
                tmp_w.push(w);
                w_sum += w;
            }
        }

        if w_sum > 0.0 {
            let inv_w = 1.0 / w_sum;
            for w in tmp_w {
                x_weights.push(w * inv_w);
            }
            x_bounds.push((actual_start, actual_end, weight_start_idx));
        } else {
            x_bounds.push((0, 0, weight_start_idx));
        }
    }

    let mut y_bounds = Vec::with_capacity(new_h as usize);
    let mut y_weights = Vec::new();
    for y_out in 0..new_h as usize {
        let y_start = y_out as f32 * y_ratio;
        let y_end = (y_out + 1) as f32 * y_ratio;
        let y_in_start = y_start.floor() as usize;
        let y_in_end = (y_end.ceil() as usize).min(height as usize);

        let weight_start_idx = y_weights.len();
        let mut w_sum = 0.0;
        let mut tmp_w = Vec::with_capacity(y_in_end.saturating_sub(y_in_start));

        let mut actual_start = y_in_end;
        let mut actual_end = y_in_start;

        for y_in in y_in_start..y_in_end {
            let overlap_start = y_start.max(y_in as f32);
            let overlap_end = y_end.min((y_in + 1) as f32);
            let w = (overlap_end - overlap_start).max(0.0);
            if w > 0.0 {
                actual_start = actual_start.min(y_in);
                actual_end = actual_end.max(y_in + 1);
                tmp_w.push(w);
                w_sum += w;
            }
        }

        if w_sum > 0.0 {
            let inv_w = 1.0 / w_sum;
            for w in tmp_w {
                y_weights.push(w * inv_w);
            }
            y_bounds.push((actual_start, actual_end, weight_start_idx));
        } else {
            y_bounds.push((0, 0, weight_start_idx));
        }
    }

    let buf_size = match checked_rgb32f_buffer_size(new_w, new_h) {
        Ok(s) => s,
        Err(e) => {
            log::warn!("Skipping downscale: {}", e);
            return image.clone();
        }
    };
    let mut out_buf = vec![0.0f32; buf_size];

    out_buf
        .par_chunks_exact_mut(new_w as usize * 3)
        .enumerate()
        .for_each(|(y_out, row)| {
            let (y_in_start, y_in_end, y_wt_offset) = y_bounds[y_out];
            let y_len = y_in_end - y_in_start;
            let y_wts = &y_weights[y_wt_offset..y_wt_offset + y_len];

            for (x_out, &(x_in_start, x_in_end, x_wt_offset)) in x_bounds.iter().enumerate() {
                let mut r_sum = 0.0;
                let mut g_sum = 0.0;
                let mut b_sum = 0.0;

                let x_len = x_in_end - x_in_start;
                let x_wts = &x_weights[x_wt_offset..x_wt_offset + x_len];

                for (dy, &w_y) in y_wts.iter().enumerate() {
                    let y_in = y_in_start + dy;
                    let row_offset = y_in * width_usize * 3;

                    let src_start = row_offset + x_in_start * 3;
                    let src_end = row_offset + x_in_end * 3;
                    let src_slice = &src[src_start..src_end];

                    for (&w_x, chunk) in x_wts.iter().zip(src_slice.chunks_exact(3)) {
                        let w = w_x * w_y;

                        let r = chunk[0];
                        let g = chunk[1];
                        let b = chunk[2];

                        r_sum += r * w;
                        g_sum += g * w;
                        b_sum += b * w;
                    }
                }

                let out_idx = x_out * 3;
                row[out_idx] = r_sum;
                row[out_idx + 1] = g_sum;
                row[out_idx + 2] = b_sum;
            }
        });

    let out = match Rgb32FImage::from_raw(new_w, new_h, out_buf) {
        Some(img) => img,
        None => {
            log::error!(
                "downscale_f32_image: from_raw failed ({}x{} expect {} bytes, got {}) – returning empty",
                new_w,
                new_h,
                new_w as usize * new_h as usize * 3,
                0,
            );
            return image.clone();
        }
    };
    let result = DynamicImage::ImageRgb32F(out);

    log::info!("downscale_f32_image took {:.2?}", start.elapsed());

    result
}

#[inline(always)]
fn interpolate_pixel(
    src_raw: &[f32],
    src_width: usize,
    src_height: usize,
    x: f32,
    y: f32,
    pixel_out: &mut [f32],
) {
    if x.is_nan()
        || y.is_nan()
        || x < 0.0
        || y < 0.0
        || x >= (src_width as f32 - 1.0)
        || y >= (src_height as f32 - 1.0)
    {
        return;
    }

    let x0 = x.floor() as usize;
    let y0 = y.floor() as usize;

    let wx = x - x0 as f32;
    let wy = y - y0 as f32;
    let one_minus_wx = 1.0 - wx;
    let one_minus_wy = 1.0 - wy;

    let stride = src_width * 3;
    let idx_row0 = y0 * stride;
    let idx_row1 = idx_row0 + stride;
    let idx_p00 = idx_row0 + x0 * 3;

    unsafe {
        let p00 = src_raw.get_unchecked(idx_p00..idx_p00 + 3);
        let p10 = src_raw.get_unchecked(idx_p00 + 3..idx_p00 + 6);
        let p01 = src_raw.get_unchecked(idx_row1 + x0 * 3..idx_row1 + x0 * 3 + 3);
        let p11 = src_raw.get_unchecked(idx_row1 + x0 * 3 + 3..idx_row1 + x0 * 3 + 6);

        let top_r = p00[0] * one_minus_wx + p10[0] * wx;
        let top_g = p00[1] * one_minus_wx + p10[1] * wx;
        let top_b = p00[2] * one_minus_wx + p10[2] * wx;

        let bot_r = p01[0] * one_minus_wx + p11[0] * wx;
        let bot_g = p01[1] * one_minus_wx + p11[1] * wx;
        let bot_b = p01[2] * one_minus_wx + p11[2] * wx;

        pixel_out[0] = top_r * one_minus_wy + bot_r * wy;
        pixel_out[1] = top_g * one_minus_wy + bot_g * wy;
        pixel_out[2] = top_b * one_minus_wy + bot_b * wy;
    }
}

fn build_transform_matrices(
    params: &GeometryParams,
    width: f32,
    height: f32,
) -> (NaMatrix3<f32>, f32, f32, f64) {
    let cx = width / 2.0;
    let cy = height / 2.0;
    let ref_dim = 2000.0;

    let p_vert = (params.vertical / 100000.0) * (ref_dim / height);
    let p_horiz = (-params.horizontal / 100000.0) * (ref_dim / width);
    let theta = params.rotate.to_radians();

    let aspect_factor = if params.aspect >= 0.0 {
        1.0 + params.aspect / 100.0
    } else {
        1.0 / (1.0 + params.aspect.abs() / 100.0)
    };

    let scale_factor = params.scale / 100.0;
    let off_x = (params.x_offset / 100.0) * width;
    let off_y = (params.y_offset / 100.0) * height;

    let t_center = NaMatrix3::new(1.0, 0.0, cx, 0.0, 1.0, cy, 0.0, 0.0, 1.0);
    let t_uncenter = NaMatrix3::new(1.0, 0.0, -cx, 0.0, 1.0, -cy, 0.0, 0.0, 1.0);
    let m_perspective = NaMatrix3::new(1.0, 0.0, 0.0, 0.0, 1.0, 0.0, p_horiz, p_vert, 1.0);

    let (sin_t, cos_t) = theta.sin_cos();
    let m_rotate = NaMatrix3::new(cos_t, -sin_t, 0.0, sin_t, cos_t, 0.0, 0.0, 0.0, 1.0);
    let m_scale = NaMatrix3::new(
        scale_factor * aspect_factor,
        0.0,
        0.0,
        0.0,
        scale_factor,
        0.0,
        0.0,
        0.0,
        1.0,
    );
    let m_offset = NaMatrix3::new(1.0, 0.0, off_x, 0.0, 1.0, off_y, 0.0, 0.0, 1.0);

    let forward = t_center * m_offset * m_perspective * m_rotate * m_scale * t_uncenter;
    let half_diagonal =
        ((width as f64 * width as f64 + height as f64 * height as f64).sqrt()) / 2.0;

    (forward, cx, cy, half_diagonal)
}

struct TcaContext<'a> {
    src_raw: &'a [f32],
    src_width: usize,
    src_height: usize,
    cx: f32,
    cy: f32,
}

#[inline(always)]
fn interpolate_pixel_with_tca(
    tca: &TcaContext,
    base_x: f32,
    base_y: f32,
    vr: f32,
    vb: f32,
    pixel_out: &mut [f32],
) {
    let src_raw = tca.src_raw;
    let src_width = tca.src_width;
    let src_height = tca.src_height;
    let cx = tca.cx;
    let cy = tca.cy;
    let gx = base_x;
    let gy = base_y;

    let rx = cx + (base_x - cx) * vr;
    let ry = cy + (base_y - cy) * vr;

    let bx = cx + (base_x - cx) * vb;
    let by = cy + (base_y - cy) * vb;

    let sample_channel = |target_x: f32, target_y: f32, channel_idx: usize| -> f32 {
        if target_x.is_nan() || target_y.is_nan() {
            return 0.0;
        }

        if src_width == 0 || src_height == 0 {
            return 0.0;
        }
        let x_clamped = target_x.clamp(0.0, src_width as f32 - 1.0);
        let y_clamped = target_y.clamp(0.0, src_height as f32 - 1.0);

        let mut x0 = x_clamped.floor() as usize;
        let mut y0 = y_clamped.floor() as usize;

        if src_width >= 2 && x0 >= src_width - 1 {
            x0 = src_width.saturating_sub(2);
        }
        if src_height >= 2 && y0 >= src_height - 1 {
            y0 = src_height.saturating_sub(2);
        }

        let wx = x_clamped - x0 as f32;
        let wy = y_clamped - y0 as f32;
        let one_minus_wx = 1.0 - wx;
        let one_minus_wy = 1.0 - wy;

        let stride = src_width * 3;
        let idx_row0 = y0 * stride;
        let idx_row1 = idx_row0 + stride;

        let idx_p00 = idx_row0 + x0 * 3 + channel_idx;

        unsafe {
            let p00 = *src_raw.get_unchecked(idx_p00);
            let p10 = *src_raw.get_unchecked(idx_p00 + 3);
            let p01 = *src_raw.get_unchecked(idx_row1 + x0 * 3 + channel_idx);
            let p11 = *src_raw.get_unchecked(idx_row1 + x0 * 3 + 3 + channel_idx);

            let top = p00 * one_minus_wx + p10 * wx;
            let bot = p01 * one_minus_wx + p11 * wx;
            top * one_minus_wy + bot * wy
        }
    };

    pixel_out[0] = sample_channel(rx, ry, 0);
    pixel_out[1] = sample_channel(gx, gy, 1);
    pixel_out[2] = sample_channel(bx, by, 2);
}

fn solve_generic_distortion_inv(r_target: f64, k_scaled: f64) -> f64 {
    if k_scaled.abs() < 1e-9 {
        return r_target;
    }

    let mut r = r_target;
    for _ in 0..10 {
        let r2 = r * r;
        let val = k_scaled * r2 * r + r - r_target;
        let slope = 3.0 * k_scaled * r2 + 1.0;

        if slope.abs() < 1e-9 {
            break;
        }
        let delta = val / slope;
        r -= delta;
        if delta.abs() < 1e-6 {
            break;
        }
    }
    r
}

fn compute_lens_auto_crop_scale(params: &GeometryParams, width: f32, height: f32) -> f64 {
    let cx = (width / 2.0) as f64;
    let cy = (height / 2.0) as f64;
    let half_diagonal = (cx * cx + cy * cy).sqrt();
    let max_radius_sq_inv = 1.0 / (cx * cx + cy * cy);

    let lk1 = params.lens_dist_k1 as f64;
    let lk2 = params.lens_dist_k2 as f64;
    let lk3 = params.lens_dist_k3 as f64;
    let lens_dist_amt = (params.lens_distortion_amount as f64) * 2.5;

    let k_distortion = (params.distortion as f64 / 100.0) * 2.5;

    let has_lens_correction = params.lens_distortion_enabled
        && (lk1.abs() > 1e-6 || lk2.abs() > 1e-6 || lk3.abs() > 1e-6);
    let is_ptlens = params.lens_model == 1;

    let sample_points: [(f64, f64); 8] = [
        (cx, 0.0),
        (cx, height as f64),
        (0.0, cy),
        (width as f64, cy),
        (0.0, 0.0),
        (width as f64, 0.0),
        (0.0, height as f64),
        (width as f64, height as f64),
    ];

    let mut max_scale: f64 = 1.0;

    for &(px, py) in &sample_points {
        let dx = px - cx;
        let dy = py - cy;
        let ru = (dx * dx + dy * dy).sqrt();
        if ru < 1e-6 {
            continue;
        }

        let mut mapped_dx = dx;
        let mut mapped_dy = dy;

        if has_lens_correction {
            let ru_norm = ru / half_diagonal;
            let ru_norm2 = ru_norm * ru_norm;

            let rd_norm = if is_ptlens {
                let a = lk1;
                let b = lk2;
                let c = lk3;
                let d = 1.0 - a - b - c;
                ru_norm * (a * ru_norm2 * ru_norm + b * ru_norm2 + c * ru_norm + d)
            } else {
                ru_norm
                    * (1.0
                        + lk1 * ru_norm2
                        + lk2 * (ru_norm2 * ru_norm2)
                        + lk3 * (ru_norm2 * ru_norm2 * ru_norm2))
            };

            let effective_r_norm = ru_norm + (rd_norm - ru_norm) * lens_dist_amt;
            let scale = effective_r_norm / ru_norm;

            mapped_dx *= scale;
            mapped_dy *= scale;
        }

        if k_distortion.abs() > 1e-5 {
            let r2_norm = (mapped_dx * mapped_dx + mapped_dy * mapped_dy) * max_radius_sq_inv;
            let f = 1.0 + k_distortion * r2_norm;
            mapped_dx *= f;
            mapped_dy *= f;
        }

        let mapped_ru = (mapped_dx * mapped_dx + mapped_dy * mapped_dy).sqrt();
        let scale = mapped_ru / ru;

        if scale > max_scale {
            max_scale = scale;
        }
    }

    if max_scale > 1.0 {
        max_scale * 1.002
    } else {
        max_scale
    }
}

pub fn warp_image_geometry(image: &DynamicImage, params: GeometryParams) -> DynamicImage {
    let (width, height) = image.dimensions();
    if let Err(e) = validate_image_dimensions(width, height) {
        log::warn!("Skipping geometry warp: {}", e);
        return image.clone();
    }
    let _guard = match ProcessingGuard::acquire() {
        Ok(g) => g,
        Err(e) => {
            log::warn!("Skipping geometry warp: {}", e);
            return image.clone();
        }
    };

    let src_img = image.to_rgb32f();
    let (width, height) = src_img.dimensions();
    let buf_size = match checked_rgb32f_buffer_size(width, height) {
        Ok(s) => s,
        Err(e) => {
            log::warn!("Skipping geometry warp: {}", e);
            return image.clone();
        }
    };
    let mut out_buffer = vec![0.0f32; buf_size];

    let (forward_transform, cx, cy, half_diagonal) =
        build_transform_matrices(&params, width as f32, height as f32);
    let inv = forward_transform.try_inverse().unwrap_or_else(|| {
        log::warn!("Geometry warp: forward transform is singular, skipping warp");
        NaMatrix3::identity()
    });

    let step_vec_x = NaVector3::new(inv[(0, 0)], inv[(1, 0)], inv[(2, 0)]);
    let step_vec_y = NaVector3::new(inv[(0, 1)], inv[(1, 1)], inv[(2, 1)]);
    let origin_vec = NaVector3::new(inv[(0, 2)], inv[(1, 2)], inv[(2, 2)]);

    let max_radius_sq_inv = 1.0 / ((cx * cx + cy * cy) as f64);
    let hd = half_diagonal;

    let k_distortion = (params.distortion as f64 / 100.0) * 2.5;
    let lk1 = params.lens_dist_k1 as f64;
    let lk2 = params.lens_dist_k2 as f64;
    let lk3 = params.lens_dist_k3 as f64;
    let lens_dist_amt = (params.lens_distortion_amount as f64) * 2.5;

    let has_lens_correction = params.lens_distortion_enabled
        && (lk1.abs() > 1e-6 || lk2.abs() > 1e-6 || lk3.abs() > 1e-6);
    let is_ptlens = params.lens_model == 1;

    let auto_crop_scale = if has_lens_correction || k_distortion.abs() > 1e-5 {
        compute_lens_auto_crop_scale(&params, width as f32, height as f32) as f32
    } else {
        1.0
    };

    let vr = if (params.tca_vr - 1.0).abs() > 1e-5 {
        params.tca_vr + (1.0 - params.tca_vr) * (1.0 - params.lens_tca_amount)
    } else {
        1.0
    };
    let vb = if (params.tca_vb - 1.0).abs() > 1e-5 {
        params.tca_vb + (1.0 - params.tca_vb) * (1.0 - params.lens_tca_amount)
    } else {
        1.0
    };
    let has_tca = params.lens_tca_enabled && ((vr - 1.0).abs() > 1e-5 || (vb - 1.0).abs() > 1e-5);

    let vk1 = params.vig_k1 as f64;
    let vk2 = params.vig_k2 as f64;
    let vk3 = params.vig_k3 as f64;
    let lens_vig_amt = (params.lens_vignette_amount as f64) * 0.8;
    let has_vignetting = params.lens_vignette_enabled
        && (vk1.abs() > 1e-6 || vk2.abs() > 1e-6 || vk3.abs() > 1e-6)
        && lens_vig_amt > 0.01;

    let src_raw = src_img.as_raw();
    let width_usize = width as usize;
    let height_usize = height as usize;
    let tca_ctx = TcaContext {
        src_raw,
        src_width: width_usize,
        src_height: height_usize,
        cx,
        cy,
    };

    out_buffer
        .par_chunks_exact_mut(width_usize * 3)
        .enumerate()
        .for_each(|(y, row_pixel_data)| {
            let y_f = y as f32;
            let mut current_vec = origin_vec + (step_vec_y * y_f);

            for pixel in row_pixel_data.chunks_exact_mut(3) {
                if current_vec.z.abs() > 1e-6 {
                    let inv_z = 1.0 / current_vec.z;
                    let mut src_x = current_vec.x * inv_z;
                    let mut src_y = current_vec.y * inv_z;

                    if auto_crop_scale > 1.0 {
                        src_x = cx + (src_x - cx) / auto_crop_scale;
                        src_y = cy + (src_y - cy) / auto_crop_scale;
                    }

                    if has_lens_correction {
                        let dx = (src_x - cx) as f64;
                        let dy = (src_y - cy) as f64;
                        let ru = (dx * dx + dy * dy).sqrt();

                        if ru > 1e-6 {
                            let ru_norm = ru / hd;
                            let ru_norm2 = ru_norm * ru_norm;

                            let rd_norm = if is_ptlens {
                                let a = lk1;
                                let b = lk2;
                                let c = lk3;
                                let d = 1.0 - a - b - c;
                                ru_norm * (a * ru_norm2 * ru_norm + b * ru_norm2 + c * ru_norm + d)
                            } else {
                                ru_norm
                                    * (1.0
                                        + lk1 * ru_norm2
                                        + lk2 * (ru_norm2 * ru_norm2)
                                        + lk3 * (ru_norm2 * ru_norm2 * ru_norm2))
                            };

                            let effective_r_norm = ru_norm + (rd_norm - ru_norm) * lens_dist_amt;
                            let scale = effective_r_norm / ru_norm;

                            src_x = cx + (dx * scale) as f32;
                            src_y = cy + (dy * scale) as f32;
                        }
                    }

                    if k_distortion.abs() > 1e-5 {
                        let dx = (src_x - cx) as f64;
                        let dy = (src_y - cy) as f64;
                        let r2_norm = (dx * dx + dy * dy) * max_radius_sq_inv;
                        let f = 1.0 + k_distortion * r2_norm;

                        src_x = cx + (dx * f) as f32;
                        src_y = cy + (dy * f) as f32;
                    }

                    if has_tca {
                        interpolate_pixel_with_tca(&tca_ctx, src_x, src_y, vr, vb, pixel);
                    } else {
                        interpolate_pixel(src_raw, width_usize, height_usize, src_x, src_y, pixel);
                    }

                    if has_vignetting {
                        let dx = (src_x - cx) as f64;
                        let dy = (src_y - cy) as f64;
                        let ru = (dx * dx + dy * dy).sqrt();
                        let ru_norm = ru / hd;
                        let ru_norm2 = ru_norm * ru_norm;

                        let v_factor = 1.0
                            + vk1 * ru_norm2
                            + vk2 * (ru_norm2 * ru_norm2)
                            + vk3 * (ru_norm2 * ru_norm2 * ru_norm2);

                        if v_factor > 1e-6 {
                            let correction_gain = 1.0 / v_factor;
                            let final_gain = 1.0 + (correction_gain - 1.0) * lens_vig_amt;

                            pixel[0] *= final_gain as f32;
                            pixel[1] *= final_gain as f32;
                            pixel[2] *= final_gain as f32;
                        }
                    }
                }
                current_vec += step_vec_x;
            }
        });

    let out_img = match Rgb32FImage::from_vec(width, height, out_buffer) {
        Some(img) => img,
        None => {
            log::error!(
                "warp_image_geometry: from_vec failed ({}x{} expect {} bytes) – returning input",
                width,
                height,
                width as usize * height as usize * 3,
            );
            return image.clone();
        }
    };
    DynamicImage::ImageRgb32F(out_img)
}

pub fn unwarp_image_geometry(warped_image: &DynamicImage, params: GeometryParams) -> DynamicImage {
    let (width, height) = warped_image.dimensions();
    if let Err(e) = validate_image_dimensions(width, height) {
        log::warn!("Skipping geometry unwarp: {}", e);
        return warped_image.clone();
    }
    let _guard = match ProcessingGuard::acquire() {
        Ok(g) => g,
        Err(e) => {
            log::warn!("Skipping geometry unwarp: {}", e);
            return warped_image.clone();
        }
    };

    let src_img = warped_image.to_rgb32f();
    let (width, height) = src_img.dimensions();
    let buf_size = match checked_rgb32f_buffer_size(width, height) {
        Ok(s) => s,
        Err(e) => {
            log::warn!("Skipping geometry unwarp: {}", e);
            return warped_image.clone();
        }
    };
    let mut out_buffer = vec![0.0f32; buf_size];

    let (forward_transform, cx, cy, half_diagonal) =
        build_transform_matrices(&params, width as f32, height as f32);
    let max_radius_sq_inv = 1.0 / ((cx * cx + cy * cy) as f64);
    let hd = half_diagonal;

    let k_distortion = (params.distortion as f64 / 100.0) * 2.5;
    let lk1 = params.lens_dist_k1 as f64;
    let lk2 = params.lens_dist_k2 as f64;
    let lk3 = params.lens_dist_k3 as f64;
    let lens_dist_amt = (params.lens_distortion_amount as f64) * 2.5;

    let has_lens_correction = params.lens_distortion_enabled
        && (lk1.abs() > 1e-6 || lk2.abs() > 1e-6 || lk3.abs() > 1e-6);
    let is_ptlens = params.lens_model == 1;

    let auto_crop_scale = if has_lens_correction || k_distortion.abs() > 1e-5 {
        compute_lens_auto_crop_scale(&params, width as f32, height as f32) as f32
    } else {
        1.0
    };

    let src_raw = src_img.as_raw();
    let width_usize = width as usize;
    let height_usize = height as usize;

    out_buffer
        .par_chunks_exact_mut(width_usize * 3)
        .enumerate()
        .for_each(|(y, row_pixel_data)| {
            let y_f = y as f32;

            for (x, pixel) in row_pixel_data.chunks_exact_mut(3).enumerate() {
                let x_f = x as f32;
                let mut current_x = x_f;
                let mut current_y = y_f;

                if k_distortion.abs() > 1e-5 {
                    let dx = (current_x - cx) as f64;
                    let dy = (current_y - cy) as f64;
                    let r_distorted = (dx * dx + dy * dy).sqrt();

                    if r_distorted > 1e-6 {
                        let k_effective = k_distortion * max_radius_sq_inv;
                        let r_straight = solve_generic_distortion_inv(r_distorted, k_effective);

                        let scale = r_straight / r_distorted;
                        current_x = cx + (dx * scale) as f32;
                        current_y = cy + (dy * scale) as f32;
                    }
                }

                if has_lens_correction {
                    let dx = (current_x - cx) as f64;
                    let dy = (current_y - cy) as f64;
                    let rd = (dx * dx + dy * dy).sqrt();

                    if rd > 1e-6 {
                        let mut ru = rd;

                        for _ in 0..8 {
                            let ru_norm = ru / hd;
                            let ru_norm2 = ru_norm * ru_norm;

                            let (f_val, f_prime) = if is_ptlens {
                                let a = lk1;
                                let b = lk2;
                                let c = lk3;
                                let d = 1.0 - a - b - c;
                                let poly = a * ru_norm2 * ru_norm + b * ru_norm2 + c * ru_norm + d;

                                let val = ru * poly;
                                let prime = 4.0 * a * ru_norm2 * ru_norm
                                    + 3.0 * b * ru_norm2
                                    + 2.0 * c * ru_norm
                                    + d;
                                (val, prime)
                            } else {
                                let poly = 1.0
                                    + lk1 * ru_norm2
                                    + lk2 * (ru_norm2 * ru_norm2)
                                    + lk3 * (ru_norm2 * ru_norm2 * ru_norm2);
                                let val = ru * poly;
                                let poly_prime = 2.0 * lk1 * ru_norm
                                    + 4.0 * lk2 * ru_norm2 * ru_norm
                                    + 6.0 * lk3 * (ru_norm2 * ru_norm2) * ru_norm;
                                let prime = poly + ru_norm * poly_prime;
                                (val, prime)
                            };

                            let g_val = ru + (f_val - ru) * lens_dist_amt - rd;
                            let g_prime = 1.0 + (f_prime - 1.0) * lens_dist_amt;

                            if g_prime.abs() < 1e-7 {
                                break;
                            }
                            let delta = g_val / g_prime;
                            ru -= delta;
                            if delta.abs() < 1e-4 {
                                break;
                            }
                        }

                        let scale = ru / rd;
                        current_x = cx + (dx * scale) as f32;
                        current_y = cy + (dy * scale) as f32;
                    }
                }

                if auto_crop_scale > 1.0 {
                    current_x = cx + (current_x - cx) * auto_crop_scale;
                    current_y = cy + (current_y - cy) * auto_crop_scale;
                }

                let target_vec = forward_transform * NaVector3::new(current_x, current_y, 1.0);

                if target_vec.z.abs() > 1e-6 {
                    let inv_z = 1.0 / target_vec.z;

                    let src_x = target_vec.x * inv_z;
                    let src_y = target_vec.y * inv_z;

                    interpolate_pixel(src_raw, width_usize, height_usize, src_x, src_y, pixel);
                }
            }
        });

    let out_img = match Rgb32FImage::from_vec(width, height, out_buffer) {
        Some(img) => img,
        None => {
            log::error!(
                "unwarp_image_geometry: from_vec failed ({}x{} expect {} bytes) – returning input",
                width,
                height,
                width as usize * height as usize * 3,
            );
            return warped_image.clone();
        }
    };
    DynamicImage::ImageRgb32F(out_img)
}

pub fn inverse_transform_mask(
    mask: image::GrayImage,
    adjustments: &serde_json::Value,
) -> image::GrayImage {
    let rotation_degrees = adjustments
        .get("rotation")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0) as f32;
    let mask_dyn = image::DynamicImage::ImageLuma8(mask);

    let unrotated_fine = if rotation_degrees.abs() > 1e-5 {
        crate::image_processing::apply_rotation(mask_dyn, -rotation_degrees).into_owned()
    } else {
        mask_dyn
    };

    let flip_h = adjustments
        .get("flipHorizontal")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let flip_v = adjustments
        .get("flipVertical")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let flipped = apply_flip(unrotated_fine, flip_h, flip_v).into_owned();

    let steps = adjustments
        .get("orientationSteps")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u8;
    let inverse_steps = (4 - (steps % 4)) % 4;
    let unrotated_coarse = apply_coarse_rotation(flipped, inverse_steps).into_owned();

    let unwarped = apply_unwarp_geometry(unrotated_coarse, adjustments).into_owned();

    unwarped.into_luma8()
}

pub fn inverse_transform_point(
    mut x: f64,
    mut y: f64,
    mut curr_w: f64,
    mut curr_h: f64,
    adjustments: &serde_json::Value,
) -> (f64, f64) {
    let rotation_degrees = adjustments
        .get("rotation")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);
    if rotation_degrees.abs() > 1e-5 {
        let cx = curr_w / 2.0;
        let cy = curr_h / 2.0;
        let theta_rad = -rotation_degrees * std::f64::consts::PI / 180.0;
        let cos_t = theta_rad.cos();
        let sin_t = theta_rad.sin();

        let dx = x - cx;
        let dy = y - cy;
        x = cx + dx * cos_t - dy * sin_t;
        y = cy + dx * sin_t + dy * cos_t;
    }

    let flip_h = adjustments
        .get("flipHorizontal")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let flip_v = adjustments
        .get("flipVertical")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if flip_h {
        x = curr_w - x;
    }
    if flip_v {
        y = curr_h - y;
    }

    let steps = adjustments
        .get("orientationSteps")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u8;
    let inverse_steps = (4 - (steps % 4)) % 4;
    for _ in 0..inverse_steps {
        let new_x = curr_h - y;
        let new_y = x;
        x = new_x;
        y = new_y;
        std::mem::swap(&mut curr_w, &mut curr_h);
    }

    let params = get_geometry_params_from_json(adjustments);
    let width = curr_w as f32;
    let height = curr_h as f32;

    let (forward_transform, cx_f32, cy_f32, hd) = build_transform_matrices(&params, width, height);
    let cx = cx_f32 as f64;
    let cy = cy_f32 as f64;
    let inv = forward_transform
        .try_inverse()
        .unwrap_or(nalgebra::Matrix3::identity());

    let vec = inv * nalgebra::Vector3::new(x as f32, y as f32, 1.0);
    if vec.z.abs() > 1e-6 {
        let inv_z = 1.0 / (vec.z as f64);
        let mut src_x = (vec.x as f64) * inv_z;
        let mut src_y = (vec.y as f64) * inv_z;

        let k_distortion = (params.distortion as f64 / 100.0) * 2.5;
        let lk1 = params.lens_dist_k1 as f64;
        let lk2 = params.lens_dist_k2 as f64;
        let lk3 = params.lens_dist_k3 as f64;
        let lens_dist_amt = (params.lens_distortion_amount as f64) * 2.5;

        let has_lens_correction = params.lens_distortion_enabled
            && (lk1.abs() > 1e-6 || lk2.abs() > 1e-6 || lk3.abs() > 1e-6);
        let is_ptlens = params.lens_model == 1;

        let auto_crop_scale = if has_lens_correction || k_distortion.abs() > 1e-5 {
            compute_lens_auto_crop_scale(&params, width, height)
        } else {
            1.0
        };

        if auto_crop_scale > 1.0 {
            src_x = cx + (src_x - cx) / auto_crop_scale;
            src_y = cy + (src_y - cy) / auto_crop_scale;
        }

        if has_lens_correction {
            let dx = src_x - cx;
            let dy = src_y - cy;
            let ru = (dx * dx + dy * dy).sqrt();

            if ru > 1e-6 {
                let ru_norm = ru / hd;
                let ru_norm2 = ru_norm * ru_norm;

                let rd_norm = if is_ptlens {
                    let a = lk1;
                    let b = lk2;
                    let c = lk3;
                    let d = 1.0 - a - b - c;
                    ru_norm * (a * ru_norm2 * ru_norm + b * ru_norm2 + c * ru_norm + d)
                } else {
                    ru_norm
                        * (1.0
                            + lk1 * ru_norm2
                            + lk2 * (ru_norm2 * ru_norm2)
                            + lk3 * (ru_norm2 * ru_norm2 * ru_norm2))
                };

                let effective_r_norm = ru_norm + (rd_norm - ru_norm) * lens_dist_amt;
                let scale = effective_r_norm / ru_norm;

                src_x = cx + (dx * scale);
                src_y = cy + (dy * scale);
            }
        }

        if k_distortion.abs() > 1e-5 {
            let max_radius_sq_inv = 1.0 / (cx * cx + cy * cy);
            let dx = src_x - cx;
            let dy = src_y - cy;
            let r2_norm = (dx * dx + dy * dy) * max_radius_sq_inv;
            let f = 1.0 + k_distortion * r2_norm;

            src_x = cx + (dx * f);
            src_y = cy + (dy * f);
        }

        return (src_x, src_y);
    }

    (x, y)
}

pub fn apply_cpu_default_raw_processing(image: &mut DynamicImage) {
    let (width, height) = image.dimensions();
    if let Err(e) = validate_image_dimensions(width, height) {
        log::warn!("Skipping CPU default raw processing: {}", e);
        return;
    }

    let mut f32_image = image.to_rgb32f();

    const GAMMA: f32 = 2.38;
    const INV_GAMMA: f32 = 1.0 / GAMMA;
    const CONTRAST: f32 = 1.28;

    f32_image.par_chunks_mut(3).for_each(|pixel_chunk| {
        // Clamp to non-negative before powf to avoid NaN on negative values.
        let r = pixel_chunk[0].max(0.0);
        let g = pixel_chunk[1].max(0.0);
        let b = pixel_chunk[2].max(0.0);

        let r_gamma = r.powf(INV_GAMMA);
        let g_gamma = g.powf(INV_GAMMA);
        let b_gamma = b.powf(INV_GAMMA);

        let r_contrast = (r_gamma - 0.5) * CONTRAST + 0.5;
        let g_contrast = (g_gamma - 0.5) * CONTRAST + 0.5;
        let b_contrast = (b_gamma - 0.5) * CONTRAST + 0.5;

        pixel_chunk[0] = r_contrast.clamp(0.0, 1.0);
        pixel_chunk[1] = g_contrast.clamp(0.0, 1.0);
        pixel_chunk[2] = b_contrast.clamp(0.0, 1.0);
    });

    *image = DynamicImage::ImageRgb32F(f32_image);
}

pub fn apply_srgb_to_linear(mut image: DynamicImage) -> DynamicImage {
    let to_linear = |x: f32| -> f32 {
        let x = x.max(0.0);
        if x <= 0.04045 {
            x / 12.92
        } else {
            ((x + 0.055) / 1.055).powf(2.4)
        }
    };

    match &mut image {
        DynamicImage::ImageRgb32F(img) => {
            img.as_mut().par_iter_mut().for_each(|c| *c = to_linear(*c));
        }
        DynamicImage::ImageRgba32F(img) => {
            img.par_chunks_mut(4).for_each(|p| {
                p[0] = to_linear(p[0]);
                p[1] = to_linear(p[1]);
                p[2] = to_linear(p[2]);
            });
        }
        _ => {}
    }
    image
}

pub fn apply_linear_to_srgb(mut image: DynamicImage) -> DynamicImage {
    let to_srgb = |x: f32| -> f32 {
        let x = x.max(0.0);
        if x <= 0.0031308 {
            x * 12.92
        } else {
            1.055 * x.powf(1.0 / 2.4) - 0.055
        }
    };

    match &mut image {
        DynamicImage::ImageRgb32F(img) => {
            img.as_mut().par_iter_mut().for_each(|c| *c = to_srgb(*c));
        }
        DynamicImage::ImageRgba32F(img) => {
            img.par_chunks_mut(4).for_each(|p| {
                p[0] = to_srgb(p[0]);
                p[1] = to_srgb(p[1]);
                p[2] = to_srgb(p[2]);
            });
        }
        _ => {}
    }
    image
}

pub fn apply_orientation(image: DynamicImage, orientation: Orientation) -> DynamicImage {
    match orientation {
        Orientation::Normal | Orientation::Unknown => image,
        Orientation::HorizontalFlip => image.fliph(),
        Orientation::Rotate180 => image.rotate180(),
        Orientation::VerticalFlip => image.flipv(),
        Orientation::Transpose => image.rotate90().flipv(),
        Orientation::Rotate90 => image.rotate90(),
        Orientation::Transverse => image.rotate90().fliph(),
        Orientation::Rotate270 => image.rotate270(),
    }
}

pub fn apply_geometry_warp<'a>(
    image: impl IntoCowImage<'a>,
    adjustments: &serde_json::Value,
) -> Cow<'a, DynamicImage> {
    let image = image.into_cow();
    let params = get_geometry_params_from_json(adjustments);
    if !is_geometry_identity(&params) {
        Cow::Owned(warp_image_geometry(image.as_ref(), params))
    } else {
        image
    }
}

pub fn apply_unwarp_geometry<'a>(
    image: impl IntoCowImage<'a>,
    adjustments: &serde_json::Value,
) -> Cow<'a, DynamicImage> {
    let image = image.into_cow();
    let params = get_geometry_params_from_json(adjustments);
    if !is_geometry_identity(&params) {
        Cow::Owned(unwarp_image_geometry(image.as_ref(), params))
    } else {
        image
    }
}

pub fn apply_coarse_rotation<'a>(
    image: impl IntoCowImage<'a>,
    orientation_steps: u8,
) -> Cow<'a, DynamicImage> {
    let image = image.into_cow();
    match orientation_steps {
        1 => Cow::Owned(image.rotate90()),
        2 => Cow::Owned(image.rotate180()),
        3 => Cow::Owned(image.rotate270()),
        _ => image,
    }
}

pub fn apply_rotation<'a>(
    image: impl IntoCowImage<'a>,
    rotation_degrees: f32,
) -> Cow<'a, DynamicImage> {
    let image = image.into_cow();
    if rotation_degrees % 360.0 == 0.0 {
        return image;
    }

    let rgba_image = image.to_rgba32f();
    let rotated = rotate_about_center(
        &rgba_image,
        rotation_degrees * PI / 180.0,
        Interpolation::Bilinear,
        Border::Constant(Rgba([0.0f32, 0.0, 0.0, 0.0])),
    );

    Cow::Owned(DynamicImage::ImageRgba32F(rotated))
}

pub fn apply_crop<'a>(image: impl IntoCowImage<'a>, crop_value: &Value) -> Cow<'a, DynamicImage> {
    let image = image.into_cow();
    if crop_value.is_null() {
        return image;
    }

    if let Ok(crop) = serde_json::from_value::<Crop>(crop_value.clone()) {
        let x = crop.x.round() as u32;
        let y = crop.y.round() as u32;
        let width = crop.width.round() as u32;
        let height = crop.height.round() as u32;

        if width > 0 && height > 0 {
            let (img_w, img_h) = image.dimensions();
            if x < img_w && y < img_h {
                let new_width = (img_w - x).min(width);
                let new_height = (img_h - y).min(height);

                if new_width > 0 && new_height > 0 {
                    if x == 0 && y == 0 && new_width == img_w && new_height == img_h {
                        return image;
                    }
                    return Cow::Owned(image.crop_imm(x, y, new_width, new_height));
                }
            }
        }
    }
    image
}

pub fn apply_flip<'a>(
    image: impl IntoCowImage<'a>,
    horizontal: bool,
    vertical: bool,
) -> Cow<'a, DynamicImage> {
    let image = image.into_cow();
    if !horizontal && !vertical {
        return image;
    }

    let mut img = image.into_owned();
    if horizontal {
        img = img.fliph();
    }
    if vertical {
        img = img.flipv();
    }
    Cow::Owned(img)
}

pub fn is_geometry_identity(params: &GeometryParams) -> bool {
    let dist_identity = !params.lens_distortion_enabled
        || ((params.lens_distortion_amount - 1.0).abs() < 1e-4
            && params.lens_dist_k1.abs() < 1e-6
            && params.lens_dist_k2.abs() < 1e-6
            && params.lens_dist_k3.abs() < 1e-6);

    let tca_identity = !params.lens_tca_enabled
        || ((params.lens_tca_amount - 1.0).abs() < 1e-4
            && (params.tca_vr - 1.0).abs() < 1e-6
            && (params.tca_vb - 1.0).abs() < 1e-6);

    let vig_identity = !params.lens_vignette_enabled
        || ((params.lens_vignette_amount - 1.0).abs() < 1e-4
            && params.vig_k1.abs() < 1e-6
            && params.vig_k2.abs() < 1e-6
            && params.vig_k3.abs() < 1e-6);

    params.distortion == 0.0
        && params.vertical == 0.0
        && params.horizontal == 0.0
        && params.rotate == 0.0
        && params.aspect == 0.0
        && params.scale == 100.0
        && params.x_offset == 0.0
        && params.y_offset == 0.0
        && dist_identity
        && tca_identity
        && vig_identity
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct AutoAdjustmentResults {
    pub exposure: f64,
    pub brightness: f64,
    pub contrast: f64,
    pub highlights: f64,
    pub shadows: f64,
    pub vibrancy: f64,
    pub vignette_amount: f64,
    pub temperature: f64,
    pub tint: f64,
    pub dehaze: f64,
    pub clarity: f64,
    pub centre: f64,
    pub blacks: f64,
    pub whites: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, Pod, Zeroable, Default)]
#[repr(C)]
pub struct Point {
    x: f32,
    y: f32,
    _pad1: f32,
    _pad2: f32,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, Pod, Zeroable, Default)]
#[repr(C)]
pub struct HslColor {
    hue: f32,
    saturation: f32,
    luminance: f32,
    _pad: f32,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, Pod, Zeroable, Default)]
#[repr(C)]
pub struct ColorGradeSettings {
    pub hue: f32,
    pub saturation: f32,
    pub luminance: f32,
    _pad: f32,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, Pod, Zeroable, Default)]
#[repr(C)]
pub struct ColorCalibrationSettings {
    pub shadows_tint: f32,
    pub red_hue: f32,
    pub red_saturation: f32,
    pub green_hue: f32,
    pub green_saturation: f32,
    pub blue_hue: f32,
    pub blue_saturation: f32,
    _pad1: f32,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, Pod, Zeroable)]
#[repr(C)]
pub struct GpuMat3 {
    col0: [f32; 4],
    col1: [f32; 4],
    col2: [f32; 4],
}

impl Default for GpuMat3 {
    fn default() -> Self {
        Self {
            col0: [1.0, 0.0, 0.0, 0.0],
            col1: [0.0, 1.0, 0.0, 0.0],
            col2: [0.0, 0.0, 1.0, 0.0],
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, Pod, Zeroable, Default)]
#[repr(C)]
pub struct GlobalAdjustments {
    pub exposure: f32,
    pub brightness: f32,
    pub contrast: f32,
    pub highlights: f32,
    pub shadows: f32,
    pub whites: f32,
    pub blacks: f32,
    pub saturation: f32,
    pub temperature: f32,
    pub tint: f32,
    pub vibrance: f32,
    pub hue: f32,
    _pad_color1: f32,
    _pad_color2: f32,
    _pad_color3: f32,

    pub sharpness: f32,
    pub luma_noise_reduction: f32,
    pub color_noise_reduction: f32,
    pub clarity: f32,
    pub dehaze: f32,
    pub structure: f32,
    #[serde(rename = "centré")]
    pub centre: f32,
    pub vignette_amount: f32,
    pub vignette_midpoint: f32,
    pub vignette_roundness: f32,
    pub vignette_feather: f32,
    pub grain_amount: f32,
    pub grain_size: f32,
    pub grain_roughness: f32,

    pub chromatic_aberration_red_cyan: f32,
    pub chromatic_aberration_blue_yellow: f32,
    pub show_clipping: u32,
    pub is_raw_image: u32,
    _pad_ca1: f32,

    pub has_lut: u32,
    pub lut_intensity: f32,
    pub tonemapper_mode: f32,
    _pad_lut2: f32,
    _pad_lut3: f32,
    _pad_lut4: f32,
    _pad_lut5: f32,

    _pad_agx1: f32,
    _pad_agx2: f32,
    _pad_agx3: f32,
    pub agx_pipe_to_rendering_matrix: GpuMat3,
    pub agx_rendering_to_pipe_matrix: GpuMat3,

    _pad_cg1: f32,
    _pad_cg2: f32,
    _pad_cg3: f32,
    _pad_cg4: f32,
    pub color_grading_shadows: ColorGradeSettings,
    pub color_grading_midtones: ColorGradeSettings,
    pub color_grading_highlights: ColorGradeSettings,
    pub color_grading_global: ColorGradeSettings,
    pub color_grading_blending: f32,
    pub color_grading_balance: f32,
    _pad2: f32,
    _pad3: f32,

    pub color_calibration: ColorCalibrationSettings,

    pub hsl: [HslColor; 8],
    pub luma_curve: [Point; 16],
    pub red_curve: [Point; 16],
    pub green_curve: [Point; 16],
    pub blue_curve: [Point; 16],
    pub luma_curve_count: u32,
    pub red_curve_count: u32,
    pub green_curve_count: u32,
    pub blue_curve_count: u32,
    _pad_end1: f32,
    _pad_end2: f32,
    _pad_end3: f32,
    _pad_end4: f32,

    pub glow_amount: f32,
    pub halation_amount: f32,
    pub flare_amount: f32,
    pub sharpness_threshold: f32,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, Pod, Zeroable, Default)]
#[repr(C)]
pub struct MaskAdjustments {
    pub exposure: f32,
    pub brightness: f32,
    pub contrast: f32,
    pub highlights: f32,
    pub shadows: f32,
    pub whites: f32,
    pub blacks: f32,
    pub saturation: f32,
    pub temperature: f32,
    pub tint: f32,
    pub vibrance: f32,

    pub sharpness: f32,
    pub luma_noise_reduction: f32,
    pub color_noise_reduction: f32,
    pub clarity: f32,
    pub dehaze: f32,
    pub structure: f32,

    pub glow_amount: f32,
    pub halation_amount: f32,
    pub flare_amount: f32,
    pub sharpness_threshold: f32,

    pub hue: f32,
    _pad_cg1: f32,
    _pad_cg2: f32,
    pub color_grading_shadows: ColorGradeSettings,
    pub color_grading_midtones: ColorGradeSettings,
    pub color_grading_highlights: ColorGradeSettings,
    pub color_grading_global: ColorGradeSettings,
    pub color_grading_blending: f32,
    pub color_grading_balance: f32,
    _pad5: f32,
    _pad6: f32,

    pub hsl: [HslColor; 8],
    pub luma_curve: [Point; 16],
    pub red_curve: [Point; 16],
    pub green_curve: [Point; 16],
    pub blue_curve: [Point; 16],
    pub luma_curve_count: u32,
    pub red_curve_count: u32,
    pub green_curve_count: u32,
    pub blue_curve_count: u32,
    _pad_end4: f32,
    _pad_end5: f32,
    _pad_end6: f32,
    _pad_end7: f32,
}

pub const MAX_MASKS: usize = 32;

#[derive(Debug, Clone, Copy, Pod, Zeroable, Default)]
#[repr(C)]
pub struct AllAdjustments {
    pub global: GlobalAdjustments,
    pub mask_adjustments: [MaskAdjustments; MAX_MASKS],
    pub mask_count: u32,
    pub tile_offset_x: u32,
    pub tile_offset_y: u32,
    pub mask_atlas_cols: u32,
}

struct AdjustmentScales {
    exposure: f32,
    brightness: f32,
    contrast: f32,
    highlights: f32,
    shadows: f32,
    whites: f32,
    blacks: f32,
    saturation: f32,
    temperature: f32,
    tint: f32,
    vibrance: f32,

    sharpness: f32,
    sharpness_threshold: f32,
    luma_noise_reduction: f32,
    color_noise_reduction: f32,
    clarity: f32,
    dehaze: f32,
    structure: f32,
    centre: f32,

    vignette_amount: f32,
    vignette_midpoint: f32,
    vignette_roundness: f32,
    vignette_feather: f32,
    grain_amount: f32,
    grain_size: f32,
    grain_roughness: f32,

    chromatic_aberration: f32,

    hsl_hue_multiplier: f32,
    hsl_saturation: f32,
    hsl_luminance: f32,

    color_grading_saturation: f32,
    color_grading_luminance: f32,
    color_grading_blending: f32,
    color_grading_balance: f32,

    color_calibration_hue: f32,
    color_calibration_saturation: f32,
    color_calibration_shadows_tint: f32,

    glow: f32,
    halation: f32,
    flares: f32,
}

const SCALES: AdjustmentScales = AdjustmentScales {
    exposure: 0.8,
    brightness: 0.8,
    contrast: 100.0,
    highlights: 120.0,
    shadows: 120.0,
    whites: 30.0,
    blacks: 40.0,
    saturation: 100.0,
    temperature: 25.0,
    tint: 100.0,
    vibrance: 100.0,

    sharpness: 50.0,
    sharpness_threshold: 100.0,
    luma_noise_reduction: 100.0,
    color_noise_reduction: 100.0,
    clarity: 125.0,
    dehaze: 750.0,
    structure: 125.0,
    centre: 250.0,

    vignette_amount: 100.0,
    vignette_midpoint: 100.0,
    vignette_roundness: 100.0,
    vignette_feather: 100.0,
    grain_amount: 200.0,
    grain_size: 50.0,
    grain_roughness: 100.0,

    chromatic_aberration: 10000.0,

    hsl_hue_multiplier: 0.3,
    hsl_saturation: 100.0,
    hsl_luminance: 100.0,

    color_grading_saturation: 500.0,
    color_grading_luminance: 500.0,
    color_grading_blending: 100.0,
    color_grading_balance: 200.0,

    color_calibration_hue: 400.0,
    color_calibration_saturation: 120.0,
    color_calibration_shadows_tint: 100.0,

    glow: 100.0,
    halation: 100.0,
    flares: 100.0,
};

fn parse_hsl_adjustments(js_hsl: &serde_json::Value) -> [HslColor; 8] {
    let mut hsl_array = [HslColor::default(); 8];
    if let Some(hsl_map) = js_hsl.as_object() {
        let color_map = [
            ("reds", 0),
            ("oranges", 1),
            ("yellows", 2),
            ("greens", 3),
            ("aquas", 4),
            ("blues", 5),
            ("purples", 6),
            ("magentas", 7),
        ];
        for (name, index) in color_map.iter() {
            if let Some(color_data) = hsl_map.get(*name) {
                hsl_array[*index] = HslColor {
                    hue: color_data["hue"].as_f64().unwrap_or(0.0) as f32
                        * SCALES.hsl_hue_multiplier,
                    saturation: color_data["saturation"].as_f64().unwrap_or(0.0) as f32
                        / SCALES.hsl_saturation,
                    luminance: color_data["luminance"].as_f64().unwrap_or(0.0) as f32
                        / SCALES.hsl_luminance,
                    _pad: 0.0,
                };
            }
        }
    }
    hsl_array
}

fn parse_color_grade_settings(js_cg: &serde_json::Value) -> ColorGradeSettings {
    if js_cg.is_null() {
        return ColorGradeSettings::default();
    }
    ColorGradeSettings {
        hue: js_cg["hue"].as_f64().unwrap_or(0.0) as f32,
        saturation: js_cg["saturation"].as_f64().unwrap_or(0.0) as f32
            / SCALES.color_grading_saturation,
        luminance: js_cg["luminance"].as_f64().unwrap_or(0.0) as f32
            / SCALES.color_grading_luminance,
        _pad: 0.0,
    }
}

fn convert_points_to_aligned(frontend_points: Vec<serde_json::Value>) -> [Point; 16] {
    let mut aligned_points = [Point::default(); 16];
    for (i, point) in frontend_points.iter().enumerate().take(16) {
        if let (Some(x), Some(y)) = (point["x"].as_f64(), point["y"].as_f64()) {
            aligned_points[i] = Point {
                x: x as f32,
                y: y as f32,
                _pad1: 0.0,
                _pad2: 0.0,
            };
        }
    }
    aligned_points
}

const WP_D65: Vec2 = Vec2::new(0.3127, 0.3290);
const PRIMARIES_SRGB: [Vec2; 3] = [
    Vec2::new(0.64, 0.33),
    Vec2::new(0.30, 0.60),
    Vec2::new(0.15, 0.06),
];
const PRIMARIES_REC2020: [Vec2; 3] = [
    Vec2::new(0.708, 0.292),
    Vec2::new(0.170, 0.797),
    Vec2::new(0.131, 0.046),
];

fn xy_to_xyz(xy: Vec2) -> Vec3 {
    if xy.y < 1e-6 {
        Vec3::ZERO
    } else {
        Vec3::new(xy.x / xy.y, 1.0, (1.0 - xy.x - xy.y) / xy.y)
    }
}

fn primaries_to_xyz_matrix(primaries: &[Vec2; 3], white_point: Vec2) -> Mat3 {
    let r_xyz = xy_to_xyz(primaries[0]);
    let g_xyz = xy_to_xyz(primaries[1]);
    let b_xyz = xy_to_xyz(primaries[2]);
    let primaries_matrix = Mat3::from_cols(r_xyz, g_xyz, b_xyz);
    let white_point_xyz = xy_to_xyz(white_point);
    let s = primaries_matrix.inverse() * white_point_xyz;
    Mat3::from_cols(r_xyz * s.x, g_xyz * s.y, b_xyz * s.z)
}

fn rotate_and_scale_primary(primary: Vec2, white_point: Vec2, scale: f32, rotation: f32) -> Vec2 {
    let p_rel = primary - white_point;
    let p_scaled = p_rel * scale;
    let (sin_r, cos_r) = rotation.sin_cos();
    let p_rotated = Vec2::new(
        p_scaled.x * cos_r - p_scaled.y * sin_r,
        p_scaled.x * sin_r + p_scaled.y * cos_r,
    );
    white_point + p_rotated
}

fn mat3_to_gpu_mat3(m: Mat3) -> GpuMat3 {
    GpuMat3 {
        col0: [m.x_axis.x, m.x_axis.y, m.x_axis.z, 0.0],
        col1: [m.y_axis.x, m.y_axis.y, m.y_axis.z, 0.0],
        col2: [m.z_axis.x, m.z_axis.y, m.z_axis.z, 0.0],
    }
}

fn calculate_agx_matrices_glam() -> (Mat3, Mat3) {
    let pipe_work_profile_to_xyz = primaries_to_xyz_matrix(&PRIMARIES_SRGB, WP_D65);
    let base_profile_to_xyz = primaries_to_xyz_matrix(&PRIMARIES_REC2020, WP_D65);
    let xyz_to_base_profile = base_profile_to_xyz.inverse();
    let pipe_to_base = xyz_to_base_profile * pipe_work_profile_to_xyz;

    let inset = [0.294_624_5, 0.25861925, 0.14641371];
    let rotation = [0.03540329, -0.02108586, -0.06305724];
    let outset = [0.290_776_4, 0.263_155_4, 0.045_810_72];
    let unrotation = [0.03540329, -0.02108586, -0.06305724];
    let master_outset_ratio = 1.0;
    let master_unrotation_ratio = 0.0;

    let mut inset_and_rotated_primaries = [Vec2::ZERO; 3];
    for i in 0..3 {
        inset_and_rotated_primaries[i] =
            rotate_and_scale_primary(PRIMARIES_REC2020[i], WP_D65, 1.0 - inset[i], rotation[i]);
    }
    let rendering_to_xyz = primaries_to_xyz_matrix(&inset_and_rotated_primaries, WP_D65);
    let base_to_rendering = xyz_to_base_profile * rendering_to_xyz;

    let mut outset_and_unrotated_primaries = [Vec2::ZERO; 3];
    for i in 0..3 {
        outset_and_unrotated_primaries[i] = rotate_and_scale_primary(
            PRIMARIES_REC2020[i],
            WP_D65,
            1.0 - master_outset_ratio * outset[i],
            master_unrotation_ratio * unrotation[i],
        );
    }
    let outset_to_xyz = primaries_to_xyz_matrix(&outset_and_unrotated_primaries, WP_D65);
    let temp_matrix = xyz_to_base_profile * outset_to_xyz;
    let rendering_to_base = temp_matrix.inverse();

    let pipe_to_rendering = base_to_rendering * pipe_to_base;
    let rendering_to_pipe = pipe_to_base.inverse() * rendering_to_base;

    (pipe_to_rendering, rendering_to_pipe)
}

fn calculate_agx_matrices() -> (GpuMat3, GpuMat3) {
    let (pipe_to_rendering, rendering_to_pipe) = calculate_agx_matrices_glam();
    (
        mat3_to_gpu_mat3(pipe_to_rendering),
        mat3_to_gpu_mat3(rendering_to_pipe),
    )
}

pub fn resolve_tonemapper_override(settings: &crate::AppSettings, is_raw: bool) -> Option<u32> {
    if !settings.tonemapper_override_enabled.unwrap_or(false) {
        return None;
    }
    let tm = if is_raw {
        settings.default_raw_tonemapper.as_deref().unwrap_or("agx")
    } else {
        settings
            .default_non_raw_tonemapper
            .as_deref()
            .unwrap_or("basic")
    };
    Some(if tm == "agx" { 1 } else { 0 })
}

pub fn resolve_tonemapper_override_from_handle(
    app_handle: &tauri::AppHandle,
    is_raw: bool,
) -> Option<u32> {
    let settings = crate::app_settings::load_settings(app_handle.clone()).unwrap_or_default();
    resolve_tonemapper_override(&settings, is_raw)
}

pub fn apply_cpu_agx_tonemap(image: &mut DynamicImage) {
    let (width, height) = image.dimensions();
    if let Err(e) = validate_image_dimensions(width, height) {
        log::warn!("Skipping CPU AgX tonemap: {}", e);
        return;
    }

    const AGX_EPSILON: f32 = 1.0e-6;
    const AGX_MIN_EV: f32 = -15.2;
    const AGX_MAX_EV: f32 = 5.0;
    const AGX_RANGE_EV: f32 = AGX_MAX_EV - AGX_MIN_EV;
    const AGX_GAMMA: f32 = 2.4;
    const AGX_SLOPE: f32 = 2.3843;
    const AGX_TOE_POWER: f32 = 1.5;
    const AGX_SHOULDER_POWER: f32 = 1.5;
    const AGX_TOE_TRANSITION_X: f32 = 0.6060606;
    const AGX_TOE_TRANSITION_Y: f32 = 0.43446;
    const AGX_SHOULDER_TRANSITION_X: f32 = 0.6060606;
    const AGX_SHOULDER_TRANSITION_Y: f32 = 0.43446;
    const AGX_INTERCEPT: f32 = -1.0112;
    const AGX_TOE_SCALE: f32 = -1.0359;
    const AGX_SHOULDER_SCALE: f32 = 1.3475;

    fn agx_sigmoid(x: f32, power: f32) -> f32 {
        x / (1.0 + x.powf(power)).powf(1.0 / power)
    }

    fn agx_scaled_sigmoid(x: f32, scale: f32, slope: f32, power: f32, tx: f32, ty: f32) -> f32 {
        scale * agx_sigmoid(slope * (x - tx) / scale, power) + ty
    }

    fn agx_curve_channel(x: f32) -> f32 {
        let result = if x < AGX_TOE_TRANSITION_X {
            agx_scaled_sigmoid(
                x,
                AGX_TOE_SCALE,
                AGX_SLOPE,
                AGX_TOE_POWER,
                AGX_TOE_TRANSITION_X,
                AGX_TOE_TRANSITION_Y,
            )
        } else if x <= AGX_SHOULDER_TRANSITION_X {
            AGX_SLOPE * x + AGX_INTERCEPT
        } else {
            agx_scaled_sigmoid(
                x,
                AGX_SHOULDER_SCALE,
                AGX_SLOPE,
                AGX_SHOULDER_POWER,
                AGX_SHOULDER_TRANSITION_X,
                AGX_SHOULDER_TRANSITION_Y,
            )
        };
        result.clamp(0.0, 1.0)
    }

    const LUT_SIZE: usize = 4096;
    let mut curve_lut = [0.0f32; LUT_SIZE];
    for (i, slot) in curve_lut.iter_mut().enumerate() {
        let x = i as f32 / (LUT_SIZE - 1) as f32;
        *slot = agx_curve_channel(x).max(0.0).powf(AGX_GAMMA);
    }

    let (pipe_to_rendering, rendering_to_pipe) = calculate_agx_matrices_glam();

    let mut f32_image = image.to_rgb32f();

    f32_image.par_chunks_mut(3).for_each(|pixel_chunk| {
        let r = pixel_chunk[0];
        let g = pixel_chunk[1];
        let b = pixel_chunk[2];

        let min_c = r.min(g).min(b);
        let (r, g, b) = if min_c < 0.0 {
            (r - min_c, g - min_c, b - min_c)
        } else {
            (r, g, b)
        };

        let in_rendering = pipe_to_rendering * Vec3::new(r, g, b);

        let x = Vec3::new(
            (in_rendering.x / 0.18).max(AGX_EPSILON),
            (in_rendering.y / 0.18).max(AGX_EPSILON),
            (in_rendering.z / 0.18).max(AGX_EPSILON),
        );
        let log_encoded = Vec3::new(
            (x.x.log2() - AGX_MIN_EV) / AGX_RANGE_EV,
            (x.y.log2() - AGX_MIN_EV) / AGX_RANGE_EV,
            (x.z.log2() - AGX_MIN_EV) / AGX_RANGE_EV,
        );
        let mapped = Vec3::new(
            log_encoded.x.clamp(0.0, 1.0),
            log_encoded.y.clamp(0.0, 1.0),
            log_encoded.z.clamp(0.0, 1.0),
        );

        let lut_lookup = |v: f32| -> f32 {
            let idx = (v * (LUT_SIZE - 1) as f32) as usize;
            curve_lut[idx.min(LUT_SIZE - 1)]
        };
        let curved = Vec3::new(
            lut_lookup(mapped.x),
            lut_lookup(mapped.y),
            lut_lookup(mapped.z),
        );

        let final_color = rendering_to_pipe * curved;

        pixel_chunk[0] = final_color.x.clamp(0.0, 1.0);
        pixel_chunk[1] = final_color.y.clamp(0.0, 1.0);
        pixel_chunk[2] = final_color.z.clamp(0.0, 1.0);
    });

    *image = DynamicImage::ImageRgb32F(f32_image);
}

pub fn is_image_edited(
    adj: &serde_json::Value,
    is_raw: bool,
    tonemapper_override: Option<u32>,
) -> bool {
    if adj.is_null() || adj.as_object().is_none() {
        return false;
    }

    if let Some(patches) = adj.get("aiPatches").and_then(|v| v.as_array())
        && !patches.is_empty()
    {
        return true;
    }
    if let Some(masks) = adj.get("masks").and_then(|v| v.as_array())
        && !masks.is_empty()
    {
        return true;
    }

    if let Some(crop_val) = adj.get("crop")
        && !crop_val.is_null()
        && let Ok(crop) = serde_json::from_value::<Crop>(crop_val.clone())
        && (crop.x.abs() > 0.1
            || crop.y.abs() > 0.1
            || crop.width.abs() > 0.1
            || crop.height.abs() > 0.1)
    {
        return true;
    }

    if adj
        .get("orientationSteps")
        .and_then(|v| v.as_u64())
        .unwrap_or(0)
        != 0
    {
        return true;
    }
    if adj
        .get("rotation")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0)
        .abs()
        > 0.001
    {
        return true;
    }
    if adj
        .get("flipHorizontal")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
    {
        return true;
    }
    if adj
        .get("flipVertical")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
    {
        return true;
    }

    let geo = get_geometry_params_from_json(adj);
    if !is_geometry_identity(&geo) {
        return true;
    }

    let current_adj = get_all_adjustments_from_json(adj, is_raw, tonemapper_override);
    let default_adj =
        get_all_adjustments_from_json(&serde_json::json!({}), is_raw, tonemapper_override);

    bytemuck::bytes_of(&current_adj) != bytemuck::bytes_of(&default_adj)
}

fn get_global_adjustments_from_json(
    js_adjustments: &serde_json::Value,
    is_raw: bool,
    tonemapper_override: Option<u32>,
) -> GlobalAdjustments {
    let visibility = js_adjustments.get("sectionVisibility");
    let is_visible = |section: &str| -> bool {
        visibility
            .and_then(|v| v.get(section))
            .and_then(|s| s.as_bool())
            .unwrap_or(true)
    };

    let get_val = |section: &str, key: &str, scale: f32, default: Option<f64>| -> f32 {
        if is_visible(section) {
            js_adjustments[key]
                .as_f64()
                .unwrap_or(default.unwrap_or(0.0)) as f32
                / scale
        } else {
            if let Some(d) = default {
                d as f32 / scale
            } else {
                0.0
            }
        }
    };

    let default_curve = serde_json::json!([{"x": 0.0, "y": 0.0}, {"x": 255.0, "y": 255.0}]);
    let curves_obj = js_adjustments.get("curves").cloned().unwrap_or_default();

    let luma_points: Vec<serde_json::Value> = if is_visible("curves") {
        curves_obj
            .get("luma")
            .unwrap_or(&default_curve)
            .as_array()
            .cloned()
            .unwrap_or_default()
    } else {
        Vec::new()
    };
    let red_points: Vec<serde_json::Value> = if is_visible("curves") {
        curves_obj
            .get("red")
            .unwrap_or(&default_curve)
            .as_array()
            .cloned()
            .unwrap_or_default()
    } else {
        Vec::new()
    };
    let green_points: Vec<serde_json::Value> = if is_visible("curves") {
        curves_obj
            .get("green")
            .unwrap_or(&default_curve)
            .as_array()
            .cloned()
            .unwrap_or_default()
    } else {
        Vec::new()
    };
    let blue_points: Vec<serde_json::Value> = if is_visible("curves") {
        curves_obj
            .get("blue")
            .unwrap_or(&default_curve)
            .as_array()
            .cloned()
            .unwrap_or_default()
    } else {
        Vec::new()
    };

    let cg_obj = js_adjustments
        .get("colorGrading")
        .cloned()
        .unwrap_or_default();

    let cal_obj = js_adjustments
        .get("colorCalibration")
        .cloned()
        .unwrap_or_default();

    let color_cal_settings = if is_visible("color") {
        ColorCalibrationSettings {
            shadows_tint: cal_obj["shadowsTint"].as_f64().unwrap_or(0.0) as f32
                / SCALES.color_calibration_shadows_tint,
            red_hue: cal_obj["redHue"].as_f64().unwrap_or(0.0) as f32
                / SCALES.color_calibration_hue,
            red_saturation: cal_obj["redSaturation"].as_f64().unwrap_or(0.0) as f32
                / SCALES.color_calibration_saturation,
            green_hue: cal_obj["greenHue"].as_f64().unwrap_or(0.0) as f32
                / SCALES.color_calibration_hue,
            green_saturation: cal_obj["greenSaturation"].as_f64().unwrap_or(0.0) as f32
                / SCALES.color_calibration_saturation,
            blue_hue: cal_obj["blueHue"].as_f64().unwrap_or(0.0) as f32
                / SCALES.color_calibration_hue,
            blue_saturation: cal_obj["blueSaturation"].as_f64().unwrap_or(0.0) as f32
                / SCALES.color_calibration_saturation,
            _pad1: 0.0,
        }
    } else {
        ColorCalibrationSettings::default()
    };

    let tone_mapper = js_adjustments["toneMapper"].as_str().unwrap_or("basic");
    let (pipe_to_rendering, rendering_to_pipe) = calculate_agx_matrices();

    let (has_lut, lut_intensity) = if is_visible("effects") {
        (
            if js_adjustments["lutPath"].is_string() {
                1
            } else {
                0
            },
            js_adjustments["lutIntensity"].as_f64().unwrap_or(100.0) as f32 / 100.0,
        )
    } else {
        (0, 1.0)
    };

    GlobalAdjustments {
        exposure: get_val("basic", "exposure", SCALES.exposure, None),
        brightness: get_val("basic", "brightness", SCALES.brightness, None),
        contrast: get_val("basic", "contrast", SCALES.contrast, None),
        highlights: get_val("basic", "highlights", SCALES.highlights, None),
        shadows: get_val("basic", "shadows", SCALES.shadows, None),
        whites: get_val("basic", "whites", SCALES.whites, None),
        blacks: get_val("basic", "blacks", SCALES.blacks, None),

        saturation: get_val("color", "saturation", SCALES.saturation, None),
        temperature: get_val("color", "temperature", SCALES.temperature, None),
        tint: get_val("color", "tint", SCALES.tint, None),
        vibrance: get_val("color", "vibrance", SCALES.vibrance, None),
        hue: get_val("color", "hue", 1.0, None),
        _pad_color1: 0.0,
        _pad_color2: 0.0,
        _pad_color3: 0.0,

        sharpness: get_val("details", "sharpness", SCALES.sharpness, None),
        luma_noise_reduction: get_val(
            "details",
            "lumaNoiseReduction",
            SCALES.luma_noise_reduction,
            None,
        ),
        color_noise_reduction: get_val(
            "details",
            "colorNoiseReduction",
            SCALES.color_noise_reduction,
            None,
        ),

        clarity: get_val("details", "clarity", SCALES.clarity, None),
        dehaze: get_val("details", "dehaze", SCALES.dehaze, None),
        structure: get_val("details", "structure", SCALES.structure, None),
        centre: get_val("details", "centré", SCALES.centre, None),
        vignette_amount: get_val("effects", "vignetteAmount", SCALES.vignette_amount, None),
        vignette_midpoint: get_val(
            "effects",
            "vignetteMidpoint",
            SCALES.vignette_midpoint,
            Some(50.0),
        ),
        vignette_roundness: get_val(
            "effects",
            "vignetteRoundness",
            SCALES.vignette_roundness,
            Some(0.0),
        ),
        vignette_feather: get_val(
            "effects",
            "vignetteFeather",
            SCALES.vignette_feather,
            Some(50.0),
        ),
        grain_amount: get_val("effects", "grainAmount", SCALES.grain_amount, None),
        grain_size: get_val("effects", "grainSize", SCALES.grain_size, Some(25.0)),
        grain_roughness: get_val(
            "effects",
            "grainRoughness",
            SCALES.grain_roughness,
            Some(50.0),
        ),

        chromatic_aberration_red_cyan: get_val(
            "details",
            "chromaticAberrationRedCyan",
            SCALES.chromatic_aberration,
            None,
        ),
        chromatic_aberration_blue_yellow: get_val(
            "details",
            "chromaticAberrationBlueYellow",
            SCALES.chromatic_aberration,
            None,
        ),
        show_clipping: if js_adjustments["showClipping"].as_bool().unwrap_or(false) {
            1
        } else {
            0
        },
        is_raw_image: if is_raw { 1 } else { 0 },
        _pad_ca1: 0.0,

        has_lut,
        lut_intensity,

        tonemapper_mode: tonemapper_override
            .unwrap_or_else(|| if tone_mapper == "agx" { 1u32 } else { 0u32 })
            as f32,
        _pad_lut2: 0.0,
        _pad_lut3: 0.0,
        _pad_lut4: 0.0,
        _pad_lut5: 0.0,

        _pad_agx1: 0.0,
        _pad_agx2: 0.0,
        _pad_agx3: 0.0,
        agx_pipe_to_rendering_matrix: pipe_to_rendering,
        agx_rendering_to_pipe_matrix: rendering_to_pipe,

        _pad_cg1: 0.0,
        _pad_cg2: 0.0,
        _pad_cg3: 0.0,
        _pad_cg4: 0.0,
        color_grading_shadows: if is_visible("color") {
            parse_color_grade_settings(&cg_obj["shadows"])
        } else {
            ColorGradeSettings::default()
        },
        color_grading_midtones: if is_visible("color") {
            parse_color_grade_settings(&cg_obj["midtones"])
        } else {
            ColorGradeSettings::default()
        },
        color_grading_highlights: if is_visible("color") {
            parse_color_grade_settings(&cg_obj["highlights"])
        } else {
            ColorGradeSettings::default()
        },
        color_grading_global: if is_visible("color") {
            parse_color_grade_settings(&cg_obj["global"])
        } else {
            ColorGradeSettings::default()
        },
        color_grading_blending: if is_visible("color") {
            cg_obj["blending"].as_f64().unwrap_or(50.0) as f32 / SCALES.color_grading_blending
        } else {
            0.5
        },
        color_grading_balance: if is_visible("color") {
            cg_obj["balance"].as_f64().unwrap_or(0.0) as f32 / SCALES.color_grading_balance
        } else {
            0.0
        },
        _pad2: 0.0,
        _pad3: 0.0,

        color_calibration: color_cal_settings,

        hsl: if is_visible("color") {
            parse_hsl_adjustments(&js_adjustments.get("hsl").cloned().unwrap_or_default())
        } else {
            [HslColor::default(); 8]
        },
        luma_curve: convert_points_to_aligned(luma_points.clone()),
        red_curve: convert_points_to_aligned(red_points.clone()),
        green_curve: convert_points_to_aligned(green_points.clone()),
        blue_curve: convert_points_to_aligned(blue_points.clone()),
        luma_curve_count: luma_points.len().min(16) as u32,
        red_curve_count: red_points.len().min(16) as u32,
        green_curve_count: green_points.len().min(16) as u32,
        blue_curve_count: blue_points.len().min(16) as u32,
        _pad_end1: 0.0,
        _pad_end2: 0.0,
        _pad_end3: 0.0,
        _pad_end4: 0.0,

        glow_amount: get_val("effects", "glowAmount", SCALES.glow, None),
        halation_amount: get_val("effects", "halationAmount", SCALES.halation, None),
        flare_amount: get_val("effects", "flareAmount", SCALES.flares, None),
        sharpness_threshold: get_val(
            "details",
            "sharpnessThreshold",
            SCALES.sharpness_threshold,
            Some(15.0),
        ),
    }
}

fn get_mask_adjustments_from_json(adj: &serde_json::Value) -> MaskAdjustments {
    if adj.is_null() {
        return MaskAdjustments::default();
    }

    let visibility = adj.get("sectionVisibility");
    let is_visible = |section: &str| -> bool {
        visibility
            .and_then(|v| v.get(section))
            .and_then(|s| s.as_bool())
            .unwrap_or(true)
    };

    let get_val = |section: &str, key: &str, scale: f32| -> f32 {
        if is_visible(section) {
            adj[key].as_f64().unwrap_or(0.0) as f32 / scale
        } else {
            0.0
        }
    };

    let curves_obj = adj.get("curves").cloned().unwrap_or_default();
    let luma_points: Vec<serde_json::Value> = if is_visible("curves") {
        curves_obj["luma"].as_array().cloned().unwrap_or_default()
    } else {
        Vec::new()
    };
    let red_points: Vec<serde_json::Value> = if is_visible("curves") {
        curves_obj["red"].as_array().cloned().unwrap_or_default()
    } else {
        Vec::new()
    };
    let green_points: Vec<serde_json::Value> = if is_visible("curves") {
        curves_obj["green"].as_array().cloned().unwrap_or_default()
    } else {
        Vec::new()
    };
    let blue_points: Vec<serde_json::Value> = if is_visible("curves") {
        curves_obj["blue"].as_array().cloned().unwrap_or_default()
    } else {
        Vec::new()
    };
    let cg_obj = adj.get("colorGrading").cloned().unwrap_or_default();

    MaskAdjustments {
        exposure: get_val("basic", "exposure", SCALES.exposure),
        brightness: get_val("basic", "brightness", SCALES.brightness),
        contrast: get_val("basic", "contrast", SCALES.contrast),
        highlights: get_val("basic", "highlights", SCALES.highlights),
        shadows: get_val("basic", "shadows", SCALES.shadows),
        whites: get_val("basic", "whites", SCALES.whites),
        blacks: get_val("basic", "blacks", SCALES.blacks),

        saturation: get_val("color", "saturation", SCALES.saturation),
        temperature: get_val("color", "temperature", SCALES.temperature),
        tint: get_val("color", "tint", SCALES.tint),
        vibrance: get_val("color", "vibrance", SCALES.vibrance),

        sharpness: get_val("details", "sharpness", SCALES.sharpness),
        luma_noise_reduction: get_val("details", "lumaNoiseReduction", SCALES.luma_noise_reduction),
        color_noise_reduction: get_val(
            "details",
            "colorNoiseReduction",
            SCALES.color_noise_reduction,
        ),

        clarity: get_val("details", "clarity", SCALES.clarity),
        dehaze: get_val("details", "dehaze", SCALES.dehaze),
        structure: get_val("details", "structure", SCALES.structure),

        glow_amount: get_val("effects", "glowAmount", SCALES.glow),
        halation_amount: get_val("effects", "halationAmount", SCALES.halation),
        flare_amount: get_val("effects", "flareAmount", SCALES.flares),
        sharpness_threshold: get_val("details", "sharpnessThreshold", SCALES.sharpness_threshold),

        hue: get_val("color", "hue", 1.0),
        _pad_cg1: 0.0,
        _pad_cg2: 0.0,
        color_grading_shadows: if is_visible("color") {
            parse_color_grade_settings(&cg_obj["shadows"])
        } else {
            ColorGradeSettings::default()
        },
        color_grading_midtones: if is_visible("color") {
            parse_color_grade_settings(&cg_obj["midtones"])
        } else {
            ColorGradeSettings::default()
        },
        color_grading_highlights: if is_visible("color") {
            parse_color_grade_settings(&cg_obj["highlights"])
        } else {
            ColorGradeSettings::default()
        },
        color_grading_global: if is_visible("color") {
            parse_color_grade_settings(&cg_obj["global"])
        } else {
            ColorGradeSettings::default()
        },
        color_grading_blending: if is_visible("color") {
            cg_obj["blending"].as_f64().unwrap_or(50.0) as f32 / SCALES.color_grading_blending
        } else {
            0.5
        },
        color_grading_balance: if is_visible("color") {
            cg_obj["balance"].as_f64().unwrap_or(0.0) as f32 / SCALES.color_grading_balance
        } else {
            0.0
        },
        _pad5: 0.0,
        _pad6: 0.0,

        hsl: if is_visible("color") {
            parse_hsl_adjustments(&adj.get("hsl").cloned().unwrap_or_default())
        } else {
            [HslColor::default(); 8]
        },
        luma_curve: convert_points_to_aligned(luma_points.clone()),
        red_curve: convert_points_to_aligned(red_points.clone()),
        green_curve: convert_points_to_aligned(green_points.clone()),
        blue_curve: convert_points_to_aligned(blue_points.clone()),
        luma_curve_count: luma_points.len().min(16) as u32,
        red_curve_count: red_points.len().min(16) as u32,
        green_curve_count: green_points.len().min(16) as u32,
        blue_curve_count: blue_points.len().min(16) as u32,
        _pad_end4: 0.0,
        _pad_end5: 0.0,
        _pad_end6: 0.0,
        _pad_end7: 0.0,
    }
}

pub fn get_all_adjustments_from_json(
    js_adjustments: &serde_json::Value,
    is_raw: bool,
    tonemapper_override: Option<u32>,
) -> AllAdjustments {
    let global = get_global_adjustments_from_json(js_adjustments, is_raw, tonemapper_override);
    let mut mask_adjustments = [MaskAdjustments::default(); MAX_MASKS];
    let mut mask_count = 0;

    let mask_definitions: Vec<MaskDefinition> = js_adjustments
        .get("masks")
        .and_then(|m| serde_json::from_value(m.clone()).ok())
        .unwrap_or_default();

    for (i, mask_def) in mask_definitions
        .iter()
        .filter(|m| m.visible)
        .enumerate()
        .take(MAX_MASKS)
    {
        mask_adjustments[i] = get_mask_adjustments_from_json(&mask_def.adjustments);
        mask_count += 1;
    }

    AllAdjustments {
        global,
        mask_adjustments,
        mask_count,
        tile_offset_x: 0,
        tile_offset_y: 0,
        mask_atlas_cols: 1,
    }
}

#[derive(Clone)]
pub struct GpuContext {
    pub device: Arc<wgpu::Device>,
    pub queue: Arc<wgpu::Queue>,
    pub limits: wgpu::Limits,
    pub display: Arc<std::sync::Mutex<Option<WgpuDisplay>>>,
}

#[inline(always)]
fn rgb_to_yc_only(r: f32, g: f32, b: f32) -> (f32, f32, f32) {
    let y = 0.299 * r + 0.587 * g + 0.114 * b;
    let cb = -0.168736 * r - 0.331264 * g + 0.5 * b;
    let cr = 0.5 * r - 0.418688 * g - 0.081312 * b;
    (y, cb, cr)
}

#[inline(always)]
fn yc_to_rgb(y: f32, cb: f32, cr: f32) -> (f32, f32, f32) {
    let r = y + 1.402 * cr;
    let g = y - 0.344136 * cb - 0.714136 * cr;
    let b = y + 1.772 * cb;
    (r, g, b)
}

pub fn remove_raw_artifacts_and_enhance(
    image: &mut DynamicImage,
    color_nr_inv_sigma: f32,
    sharpening_amount: f32,
) {
    let (width, height) = image.dimensions();
    if let Err(e) = validate_image_dimensions(width, height) {
        log::warn!("Skipping raw artifact removal: {}", e);
        return;
    }
    // Inpainting / restoration bug fix #4: clamp strength params to sane
    // ranges before entering the expensive pixel-parallel kernels.
    // NaN/inf input (e.g. corrupted Android JSON slider value) would otherwise
    // poison the entire YCbCr buffer via the Gaussian-weighted sums, producing
    // fully-black output.  Extreme negative sigma is also nonsensical for an
    // inverse-sigma weighting — 0.0 disables the pass cleanly.
    let color_nr_inv_sigma = if color_nr_inv_sigma.is_finite() {
        color_nr_inv_sigma.clamp(0.0, 5.0)
    } else {
        0.0
    };
    let sharpening_amount = if sharpening_amount.is_finite() {
        sharpening_amount.clamp(-2.0, 5.0)
    } else {
        0.0
    };

    // Short-circuit: if neither effect is active, skip the RGB→YCbCr→RGB
    // round-trip entirely (significant battery win on Android idle frames).
    if color_nr_inv_sigma <= 0.0 && sharpening_amount.abs() <= 1e-4 {
        return;
    }

    let _guard = match ProcessingGuard::acquire() {
        Ok(g) => g,
        Err(e) => {
            log::warn!("Skipping raw artifact removal: {}", e);
            return;
        }
    };

    let mut buffer = image.to_rgb32f();
    let w = buffer.width() as usize;
    let h = buffer.height() as usize;

    let mut ycbcr_buffer = vec![0.0f32; w * h * 3];

    let src = buffer.as_raw();

    ycbcr_buffer
        .par_chunks_mut(3)
        .zip(src.par_chunks(3))
        .for_each(|(dest, pixel)| {
            let (y, cb, cr) = rgb_to_yc_only(pixel[0], pixel[1], pixel[2]);
            dest[0] = y;
            dest[1] = cb;
            dest[2] = cr;
        });

    if color_nr_inv_sigma > 0.0 {
        let base_inv_sigma = color_nr_inv_sigma;
        const OFFSETS: [isize; 3] = [-5, -1, 3];
        const OFFSET_SQUARES: [f32; 3] = [25.0, 1.0, 9.0];

        buffer
            .par_chunks_mut(w * 3)
            .enumerate()
            .for_each(|(y, row)| {
                let row_offset = y * w;
                let h_isize = h as isize;
                let w_isize = w as isize;
                let y_isize = y as isize;

                for x in 0..w {
                    let center_idx = (row_offset + x) * 3;

                    let cy = ycbcr_buffer[center_idx];
                    let ccb = ycbcr_buffer[center_idx + 1];
                    let ccr = ycbcr_buffer[center_idx + 2];

                    let mut cb_sum = 0.0;
                    let mut cr_sum = 0.0;
                    let mut w_sum = 0.0;

                    for (ki, &ky) in OFFSETS.iter().enumerate() {
                        let sy = y_isize + ky;
                        if sy < 0 || sy >= h_isize {
                            continue;
                        }

                        let neighbor_row_idx = (sy as usize) * w;
                        let ky_sq_div_50 = OFFSET_SQUARES[ki] * 0.02;

                        for (kj, &kx) in OFFSETS.iter().enumerate() {
                            let sx = (x as isize) + kx;
                            if sx < 0 || sx >= w_isize {
                                continue;
                            }

                            let neighbor_idx = (neighbor_row_idx + sx as usize) * 3;

                            let neighbor_y = ycbcr_buffer[neighbor_idx];
                            let y_diff = (cy - neighbor_y).abs();

                            let val = y_diff * base_inv_sigma;
                            let spatial_penalty = OFFSET_SQUARES[kj] * 0.02 + ky_sq_div_50;

                            let weight = 1.0 / (1.0 + val * val + spatial_penalty);

                            cb_sum += ycbcr_buffer[neighbor_idx + 1] * weight;
                            cr_sum += ycbcr_buffer[neighbor_idx + 2] * weight;
                            w_sum += weight;
                        }
                    }

                    let (out_cb, out_cr) = if w_sum > 1e-4 {
                        let inv_w_sum = 1.0 / w_sum;
                        let filtered_cb = cb_sum * inv_w_sum;
                        let filtered_cr = cr_sum * inv_w_sum;

                        let orig_mag_sq = ccb * ccb + ccr * ccr;
                        let filt_mag_sq = filtered_cb * filtered_cb + filtered_cr * filtered_cr;

                        if filt_mag_sq > orig_mag_sq && orig_mag_sq > 1e-12 {
                            let scale = (orig_mag_sq / filt_mag_sq).sqrt();
                            (filtered_cb * scale, filtered_cr * scale)
                        } else {
                            (filtered_cb, filtered_cr)
                        }
                    } else {
                        (ccb, ccr)
                    };

                    let (r, g, b) = yc_to_rgb(cy, out_cb, out_cr);

                    let o = x * 3;
                    row[o] = r.clamp(0.0, 1.0);
                    row[o + 1] = g.clamp(0.0, 1.0);
                    row[o + 2] = b.clamp(0.0, 1.0);
                }
            });
    }

    if sharpening_amount > 0.0 {
        apply_gentle_detail_enhance(&mut buffer, &ycbcr_buffer, sharpening_amount);
    }

    *image = DynamicImage::ImageRgb32F(buffer);
}

fn apply_gentle_detail_enhance(
    buffer: &mut image::ImageBuffer<image::Rgb<f32>, Vec<f32>>,
    ycbcr_source: &[f32],
    amount: f32,
) {
    let w = buffer.width() as usize;
    let h = buffer.height() as usize;

    let mut temp_blur = vec![0.0; w * h];
    let radius = 2i32;

    temp_blur
        .par_chunks_mut(w)
        .enumerate()
        .for_each(|(y, row)| {
            let row_offset = y * w;
            for (x, row_val) in row.iter_mut().enumerate() {
                let mut sum = 0.0;
                let mut count = 0;
                for kx in -radius..=radius {
                    let sx = (x as i32 + kx).clamp(0, (w as i32) - 1) as usize;
                    sum += ycbcr_source[(row_offset + sx) * 3];
                    count += 1;
                }
                *row_val = sum / count as f32;
            }
        });

    let output = buffer.as_mut();

    output
        .par_chunks_mut(w * 3)
        .enumerate()
        .for_each(|(y, rgb_row)| {
            for x in 0..w {
                let mut blur_sum = 0.0;
                let mut count = 0;
                for ky in -radius..=radius {
                    let sy = (y as i32 + ky).clamp(0, (h as i32) - 1) as usize;
                    blur_sum += temp_blur[sy * w + x];
                    count += 1;
                }
                let blurred_val = blur_sum / count as f32;

                let original_luma = ycbcr_source[(y * w + x) * 3];

                let detail = original_luma - blurred_val;

                let edge_strength = detail.abs();
                let adaptive_amount = if edge_strength > 0.1 {
                    amount * 0.3
                } else {
                    amount
                };
                let boost = detail * adaptive_amount;

                let r_idx = x * 3;
                let g_idx = r_idx + 1;
                let b_idx = r_idx + 2;

                let r = rgb_row[r_idx];
                let g = rgb_row[g_idx];
                let b = rgb_row[b_idx];

                let new_r = r + boost;
                let new_g = g + boost;
                let new_b = b + boost;

                let max_val = new_r.max(new_g).max(new_b);
                let min_val = new_r.min(new_g).min(new_b);

                let scale = if max_val > 1.0 || min_val < 0.0 {
                    if max_val > 1.0 && min_val < 0.0 {
                        0.0
                    } else if max_val > 1.0 {
                        (1.0 - r.max(g).max(b)) / boost.max(0.001)
                    } else {
                        r.min(g).min(b) / (-boost).max(0.001)
                    }
                } else {
                    1.0
                };

                let safe_boost = boost * scale.clamp(0.0, 1.0);

                rgb_row[r_idx] = (r + safe_boost).clamp(0.0, 1.0);
                rgb_row[g_idx] = (g + safe_boost).clamp(0.0, 1.0);
                rgb_row[b_idx] = (b + safe_boost).clamp(0.0, 1.0);
            }
        });
}

#[derive(Serialize, Clone)]
pub struct HistogramData {
    red: Vec<f32>,
    green: Vec<f32>,
    blue: Vec<f32>,
    luma: Vec<f32>,
}

pub fn calculate_histogram_from_image(image: &DynamicImage) -> Result<HistogramData, String> {
    let init_hist = || ([0u32; 256], [0u32; 256], [0u32; 256], [0u32; 256]);

    let reduce_hist = |mut a: ([u32; 256], [u32; 256], [u32; 256], [u32; 256]),
                       b: ([u32; 256], [u32; 256], [u32; 256], [u32; 256])| {
        for i in 0..256 {
            a.0[i] += b.0[i];
            a.1[i] += b.1[i];
            a.2[i] += b.2[i];
            a.3[i] += b.3[i];
        }
        a
    };

    let (r_c, g_c, b_c, l_c) = match image {
        DynamicImage::ImageRgb32F(f32_img) => {
            let raw = f32_img.as_raw();
            raw.par_chunks(30_000)
                .fold(init_hist, |mut acc, chunk| {
                    for pixel in chunk.chunks_exact(3).step_by(2) {
                        let r = (pixel[0].clamp(0.0, 1.0) * 255.0) as usize;
                        let g = (pixel[1].clamp(0.0, 1.0) * 255.0) as usize;
                        let b = (pixel[2].clamp(0.0, 1.0) * 255.0) as usize;

                        acc.0[r] += 1;
                        acc.1[g] += 1;
                        acc.2[b] += 1;

                        let luma = (r * 218 + g * 732 + b * 74) >> 10;
                        acc.3[luma.min(255)] += 1;
                    }
                    acc
                })
                .reduce(init_hist, reduce_hist)
        }
        _ => {
            let rgb = image.to_rgb8();
            let raw = rgb.as_raw();
            raw.par_chunks(30_000)
                .fold(init_hist, |mut acc, chunk| {
                    for pixel in chunk.chunks_exact(3).step_by(2) {
                        let r = pixel[0] as usize;
                        let g = pixel[1] as usize;
                        let b = pixel[2] as usize;

                        acc.0[r] += 1;
                        acc.1[g] += 1;
                        acc.2[b] += 1;

                        let luma = (r * 218 + g * 732 + b * 74) >> 10;
                        acc.3[luma.min(255)] += 1;
                    }
                    acc
                })
                .reduce(init_hist, reduce_hist)
        }
    };

    let mut red: Vec<f32> = r_c.into_iter().map(|c| c as f32).collect();
    let mut green: Vec<f32> = g_c.into_iter().map(|c| c as f32).collect();
    let mut blue: Vec<f32> = b_c.into_iter().map(|c| c as f32).collect();
    let mut luma: Vec<f32> = l_c.into_iter().map(|c| c as f32).collect();

    let smoothing_sigma = 2.0;
    apply_gaussian_smoothing(&mut red, smoothing_sigma);
    apply_gaussian_smoothing(&mut green, smoothing_sigma);
    apply_gaussian_smoothing(&mut blue, smoothing_sigma);
    apply_gaussian_smoothing(&mut luma, smoothing_sigma);

    normalize_histogram_range(&mut red, 0.99);
    normalize_histogram_range(&mut green, 0.99);
    normalize_histogram_range(&mut blue, 0.99);
    normalize_histogram_range(&mut luma, 0.99);

    Ok(HistogramData {
        red,
        green,
        blue,
        luma,
    })
}

fn apply_gaussian_smoothing(histogram: &mut [f32], sigma: f32) {
    if sigma <= 0.0 {
        return;
    }

    let kernel_radius = (sigma * 3.0).ceil() as usize;
    if kernel_radius == 0 || kernel_radius >= histogram.len() {
        return;
    }

    let kernel_size = 2 * kernel_radius + 1;
    let mut kernel = vec![0.0; kernel_size];
    let mut kernel_sum = 0.0;

    let two_sigma_sq = 2.0 * sigma * sigma;
    for (i, kernel_val) in kernel.iter_mut().enumerate() {
        let x = (i as i32 - kernel_radius as i32) as f32;
        let val = (-x * x / two_sigma_sq).exp();
        *kernel_val = val;
        kernel_sum += val;
    }

    if kernel_sum > 0.0 {
        for val in &mut kernel {
            *val /= kernel_sum;
        }
    }

    let original = histogram.to_owned();
    let len = histogram.len();

    for (i, hist_val) in histogram.iter_mut().enumerate() {
        let mut smoothed_val = 0.0;
        for (k, &kernel_val) in kernel.iter().enumerate() {
            let offset = k as i32 - kernel_radius as i32;
            let sample_index = i as i32 + offset;
            let clamped_index = sample_index.clamp(0, len as i32 - 1) as usize;
            smoothed_val += original[clamped_index] * kernel_val;
        }
        *hist_val = smoothed_val;
    }
}

fn normalize_histogram_range(histogram: &mut [f32], percentile_clip: f32) {
    if histogram.is_empty() {
        return;
    }

    let mut sorted_data = histogram.to_owned();
    sorted_data.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

    let clip_index = ((sorted_data.len() - 1) as f32 * percentile_clip).round() as usize;
    let max_val = sorted_data[clip_index.min(sorted_data.len() - 1)];

    if max_val > 1e-6 {
        let scale_factor = 1.0 / max_val;
        for value in histogram.iter_mut() {
            *value = (*value * scale_factor).min(1.0);
        }
    } else {
        for value in histogram.iter_mut() {
            *value = 0.0;
        }
    }
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WaveformData {
    pub rgb: String,
    pub luma: String,
    pub parade: String,
    pub vectorscope: String,
    pub width: u32,
    pub height: u32,
}

pub fn calculate_waveform_from_image(
    image: &DynamicImage,
    active_channel: Option<&str>,
) -> Result<WaveformData, String> {
    const W: usize = 256;
    const H: usize = 256;

    let (orig_w, orig_h) = image.dimensions();
    if orig_w == 0 || orig_h == 0 {
        return Err("Image has zero dimensions.".to_string());
    }

    let do_rgb = active_channel.is_none() || active_channel == Some("rgb");
    let do_luma =
        active_channel.is_none() || active_channel == Some("luma") || active_channel == Some("rgb");
    let do_parade = active_channel.is_none() || active_channel == Some("parade");
    let do_vectorscope = active_channel.is_none() || active_channel == Some("vectorscope");

    let mut red_bins = if do_rgb { vec![0u32; W * H] } else { vec![] };
    let mut green_bins = if do_rgb { vec![0u32; W * H] } else { vec![] };
    let mut blue_bins = if do_rgb { vec![0u32; W * H] } else { vec![] };
    let mut luma_bins = if do_luma { vec![0u32; W * H] } else { vec![] };
    let mut parade_bins = if do_parade { vec![0u32; W * H] } else { vec![] };
    let mut vector_bins = if do_vectorscope {
        vec![0u32; W * H]
    } else {
        vec![]
    };

    let x_scale = W as f32 / orig_w as f32;
    let mut x_buckets = vec![0usize; orig_w as usize];

    let mut x_buckets_parade_r = vec![0usize; orig_w as usize];
    let mut x_buckets_parade_g = vec![0usize; orig_w as usize];
    let mut x_buckets_parade_b = vec![0usize; orig_w as usize];

    for x in 0..(orig_w as usize) {
        x_buckets[x] = ((x as f32 * x_scale) as usize).min(W - 1);
        if do_parade {
            let relative_x = x as f32 / orig_w as f32;
            x_buckets_parade_r[x] = (relative_x * 82.0) as usize % 82;
            x_buckets_parade_g[x] = 87 + (relative_x * 82.0) as usize % 82;
            x_buckets_parade_b[x] = 174 + (relative_x * 82.0) as usize % 82;
        }
    }

    let mut process_pixel = |r: u8, g: u8, b: u8, out_x: usize, orig_x: usize| {
        if do_rgb {
            red_bins[(255 - r as usize) * W + out_x] += 1;
            green_bins[(255 - g as usize) * W + out_x] += 1;
            blue_bins[(255 - b as usize) * W + out_x] += 1;
        }
        if do_luma {
            let l = ((r as u32 * 218 + g as u32 * 732 + b as u32 * 74) >> 10).min(255) as usize;
            luma_bins[(255 - l) * W + out_x] += 1;
        }
        if do_parade {
            parade_bins[(255 - r as usize) * W + x_buckets_parade_r[orig_x]] += 1;
            parade_bins[(255 - g as usize) * W + x_buckets_parade_g[orig_x]] += 1;
            parade_bins[(255 - b as usize) * W + x_buckets_parade_b[orig_x]] += 1;
        }
        if do_vectorscope {
            let r_f = r as f32;
            let g_f = g as f32;
            let b_f = b as f32;

            let mut cb = (-0.1146 * r_f - 0.3854 * g_f + 0.5 * b_f) * 0.836;
            let mut cr = (0.5 * r_f - 0.4542 * g_f - 0.0458 * b_f) * 0.836;

            let dist_sq = cb * cb + cr * cr;
            if dist_sq > 16129.0 {
                let scale = 127.0 / dist_sq.sqrt();
                cb *= scale;
                cr *= scale;
            }

            let vx = (cb + 128.0).clamp(0.0, 255.0) as usize;
            let vy = (128.0 - cr).clamp(0.0, 255.0) as usize;
            vector_bins[vy * W + vx] += 1;
        }
    };

    match image {
        DynamicImage::ImageRgb32F(f32_img) => {
            let raw = f32_img.as_raw();
            let stride = orig_w as usize * 3;
            for y in 0..(orig_h as usize) {
                let row = y * stride;
                for (x, &x_bucket) in x_buckets.iter().enumerate() {
                    let i = row + x * 3;
                    process_pixel(
                        (raw[i].clamp(0.0, 1.0) * 255.0) as u8,
                        (raw[i + 1].clamp(0.0, 1.0) * 255.0) as u8,
                        (raw[i + 2].clamp(0.0, 1.0) * 255.0) as u8,
                        x_bucket,
                        x,
                    );
                }
            }
        }
        _ => {
            let rgb = image.to_rgb8();
            let raw = rgb.as_raw();
            let stride = orig_w as usize * 3;
            for y in 0..(orig_h as usize) {
                let row = y * stride;
                for (x, &x_bucket) in x_buckets.iter().enumerate() {
                    let i = row + x * 3;
                    process_pixel(raw[i], raw[i + 1], raw[i + 2], x_bucket, x);
                }
            }
        }
    }

    let build_lut = |bins: &[u32], do_calc: bool| -> (Vec<u8>, u32) {
        if !do_calc {
            return (vec![0; 1], 0);
        }
        let max_val = *bins.iter().max().unwrap_or(&0);
        if max_val == 0 {
            return (vec![0; 1], 0);
        }
        let scale = 255.0 / (1.0 + max_val as f32).ln();
        let lut = (0..=max_val)
            .map(|v| {
                if v == 0 {
                    0
                } else {
                    ((1.0 + v as f32).ln() * scale) as u8
                }
            })
            .collect();
        (lut, max_val)
    };

    let (lut_r, max_r) = build_lut(&red_bins, do_rgb);
    let (lut_g, max_g) = build_lut(&green_bins, do_rgb);
    let (lut_b, max_b) = build_lut(&blue_bins, do_rgb);
    let (lut_l, max_l) = build_lut(&luma_bins, do_luma);
    let (lut_p, max_p) = build_lut(&parade_bins, do_parade);
    let (lut_v, max_v) = build_lut(&vector_bins, do_vectorscope);

    let pixel_count = W * H;
    let byte_count = pixel_count * 4;

    let mut rgba_rgb = if do_rgb {
        vec![0u8; byte_count]
    } else {
        vec![]
    };
    let mut rgba_luma = if do_luma {
        vec![0u8; byte_count]
    } else {
        vec![]
    };
    let mut rgba_parade = if do_parade {
        vec![0u8; byte_count]
    } else {
        vec![]
    };
    let mut rgba_vector = if do_vectorscope {
        vec![0u8; byte_count]
    } else {
        vec![]
    };

    for i in 0..pixel_count {
        let x = i % W;
        let y = i / W;
        let off = i * 4;

        if do_rgb {
            let r = if red_bins[i] <= max_r {
                lut_r[red_bins[i] as usize]
            } else {
                0
            };
            let g = if green_bins[i] <= max_g {
                lut_g[green_bins[i] as usize]
            } else {
                0
            };
            let b = if blue_bins[i] <= max_b {
                lut_b[blue_bins[i] as usize]
            } else {
                0
            };
            if r > 0 || g > 0 || b > 0 {
                rgba_rgb[off] = r;
                rgba_rgb[off + 1] = g;
                rgba_rgb[off + 2] = b;
                rgba_rgb[off + 3] = r.max(g).max(b);
            }
        }

        if do_luma && luma_bins[i] > 0 && luma_bins[i] <= max_l {
            let l = lut_l[luma_bins[i] as usize];
            rgba_luma[off] = 255;
            rgba_luma[off + 1] = 255;
            rgba_luma[off + 2] = 255;
            rgba_luma[off + 3] = l;
        }

        if do_parade && parade_bins[i] > 0 && parade_bins[i] <= max_p {
            let bright = lut_p[parade_bins[i] as usize];
            if x < 82 {
                rgba_parade[off] = 255;
                rgba_parade[off + 3] = bright;
            } else if (87..169).contains(&x) {
                rgba_parade[off + 1] = 255;
                rgba_parade[off + 3] = bright;
            } else if x >= 174 {
                rgba_parade[off + 2] = 255;
                rgba_parade[off + 3] = bright;
            }
        }

        if do_vectorscope {
            let val = vector_bins[i];

            let dx = x as f32 - 128.0;
            let dy = 128.0 - y as f32;
            let min_d = dx.abs().min(dy.abs());
            let dist = (dx * dx + dy * dy).sqrt();

            if val > 0 && val <= max_v {
                let bright = lut_v[val as usize];

                let y_mid = 128.0;
                rgba_vector[off] = (y_mid + 1.402 * (dy / 0.836)).clamp(0.0, 255.0) as u8;
                rgba_vector[off + 1] = (y_mid - 0.344136 * (dx / 0.836) - 0.714136 * (dy / 0.836))
                    .clamp(0.0, 255.0) as u8;
                rgba_vector[off + 2] = (y_mid + 1.772 * (dx / 0.836)).clamp(0.0, 255.0) as u8;
                rgba_vector[off + 3] = bright;
            } else if min_d <= 1.0 {
                let alpha = (40.0 - min_d * 30.0).clamp(0.0, 255.0) as u8;
                rgba_vector[off] = 255;
                rgba_vector[off + 1] = 255;
                rgba_vector[off + 2] = 255;
                rgba_vector[off + 3] = alpha;
            } else if (dist - 127.0).abs() < 0.8 || (dist - 64.0).abs() < 0.8 {
                rgba_vector[off] = 255;
                rgba_vector[off + 1] = 255;
                rgba_vector[off + 2] = 255;
                rgba_vector[off + 3] = 15;
            } else if dx < 0.0 && dy > 0.0 && (dy + 1.53 * dx).abs() < 1.0 {
                rgba_vector[off] = 255;
                rgba_vector[off + 1] = 200;
                rgba_vector[off + 2] = 150;
                rgba_vector[off + 3] = 120;
            }
        }
    }

    Ok(WaveformData {
        rgb: if do_rgb {
            BASE64.encode(&rgba_rgb)
        } else {
            String::new()
        },
        luma: if do_luma {
            BASE64.encode(&rgba_luma)
        } else {
            String::new()
        },
        parade: if do_parade {
            BASE64.encode(&rgba_parade)
        } else {
            String::new()
        },
        vectorscope: if do_vectorscope {
            BASE64.encode(&rgba_vector)
        } else {
            String::new()
        },
        width: W as u32,
        height: H as u32,
    })
}

pub fn perform_auto_analysis(image: &DynamicImage) -> AutoAdjustmentResults {
    const ANALYSIS_MAX_DIM: u32 = 1024;

    const LUMA_R: f32 = 0.2126;
    const LUMA_G: f32 = 0.7152;
    const LUMA_B: f32 = 0.0722;

    const EXPOSURE_MIDPOINT: f64 = 128.0;
    const EXPOSURE_SCALE: f64 = 0.125;
    const WHITE_POINT_HARD_LIMIT: usize = 245;
    const HIGHLIGHT_LUMA_THRESHOLD: usize = 240;
    const CLIPPED_LUMA_THRESHOLD: usize = 250;
    const HIGHLIGHT_PERCENT_THRESHOLD: f64 = 0.02;
    const CLIPPED_PERCENT_THRESHOLD: f64 = 0.005;
    const EXPOSURE_CEILING: f64 = 250.0;

    const TARGET_RANGE: f64 = 220.0;
    const CONTRAST_SCALE: f64 = 10.0;
    const HIGHLIGHT_CONTRAST_REDUCE: f64 = 0.5;

    const SHADOW_LUMA_MAX: usize = 32;
    const SHADOW_PERCENT_THRESHOLD: f64 = 0.05;
    const SHADOW_BOOST_SCALE: f64 = 40.0;
    const SHADOW_MAX: f64 = 50.0;
    const HIGHLIGHT_BOOST_SCALE: f64 = 120.0;
    const HIGHLIGHT_MAX: f64 = 70.0;

    const VIBRANCY_SAT_THRESHOLD: f32 = 0.2;
    const VIBRANCY_SCALE: f64 = 120.0;

    const DEHAZE_RANGE_THRESHOLD: f64 = 120.0;
    const DEHAZE_SAT_THRESHOLD: f32 = 0.15;
    const DEHAZE_SCALE: f64 = 35.0;
    const CLARITY_RANGE_THRESHOLD: f64 = 180.0;
    const CLARITY_SCALE: f64 = 50.0;

    const VIGNETTE_CENTER_LOW: f32 = 0.25;
    const VIGNETTE_CENTER_HIGH: f32 = 0.75;

    const VIGNETTE_SCALE: f64 = 100.0;
    const VIGNETTE_CENTRE_DIFF_THRESHOLD: f32 = 0.05;
    const CENTRE_SCALE: f64 = 100.0;
    const CENTRE_MAX: f64 = 60.0;

    const MID_GRAY: f64 = 128.0;
    const BLACKS_SCALE: f64 = 0.5;
    const WHITES_SCALE: f64 = 0.2;
    const EXPOSURE_OUTPUT_SCALE: f64 = 20.0;
    const BRIGHTNESS_SCALE: f64 = 0.007;

    let analysis_preview = downscale_f32_image(image, ANALYSIS_MAX_DIM, ANALYSIS_MAX_DIM);
    let rgb_image = analysis_preview.to_rgb8();
    let total_pixels = (rgb_image.width() * rgb_image.height()) as f64;
    if total_pixels == 0.0 {
        return AutoAdjustmentResults::default();
    }

    let (width, height) = rgb_image.dimensions();
    let cx0 = (width as f32 * VIGNETTE_CENTER_LOW) as u32;
    let cx1 = (width as f32 * VIGNETTE_CENTER_HIGH) as u32;
    let cy0 = (height as f32 * VIGNETTE_CENTER_LOW) as u32;
    let cy1 = (height as f32 * VIGNETTE_CENTER_HIGH) as u32;

    let mut luma_hist = vec![0u32; 256];
    let mut mean_saturation = 0.0f32;
    let mut center_sum = 0.0f32;
    let mut edge_sum = 0.0f32;
    let mut center_n = 0u32;
    let mut edge_n = 0u32;

    // Gray-world white balance accumulators. We only accumulate pixels in the
    // midtone range to avoid clipped highlights / crushed shadows skewing the
    // average. This matches the behaviour of professional auto-WB algorithms
    // which discount specular highlights and pure black regions.
    const WB_LUMA_MIN: f32 = 16.0;
    const WB_LUMA_MAX: f32 = 240.0;
    const WB_SAT_MAX: f32 = 0.6; // exclude strongly colored pixels from gray-world avg
    let mut wb_r_sum = 0.0f64;
    let mut wb_g_sum = 0.0f64;
    let mut wb_b_sum = 0.0f64;
    let mut wb_n = 0u64;

    for (x, y, pixel) in rgb_image.enumerate_pixels() {
        let r = pixel[0] as f32;
        let g = pixel[1] as f32;
        let b = pixel[2] as f32;

        let luma_f = LUMA_R * r + LUMA_G * g + LUMA_B * b;
        luma_hist[(luma_f.round() as usize).min(255)] += 1;

        let r_n = r / 255.0;
        let g_n = g / 255.0;
        let b_n = b / 255.0;
        let max_c = r_n.max(g_n).max(b_n);
        let min_c = r_n.min(g_n).min(b_n);
        if max_c > 0.0 {
            let s = (max_c - min_c) / max_c;
            mean_saturation += s;
        }

        let luma_norm = luma_f / 255.0;
        if x >= cx0 && x < cx1 && y >= cy0 && y < cy1 {
            center_sum += luma_norm;
            center_n += 1;
        } else {
            edge_sum += luma_norm;
            edge_n += 1;
        }

        // Accumulate gray-world statistics for auto white balance.
        if luma_f >= WB_LUMA_MIN && luma_f <= WB_LUMA_MAX {
            let sat = if max_c > 0.0 {
                (max_c - min_c) / max_c
            } else {
                0.0
            };
            if sat <= WB_SAT_MAX {
                wb_r_sum += r as f64;
                wb_g_sum += g as f64;
                wb_b_sum += b as f64;
                wb_n += 1;
            }
        }
    }

    mean_saturation /= total_pixels as f32;

    // Compute auto white balance using the gray-world assumption.
    // We compensate ~70% of the measured cast to avoid over-correcting scenes
    // that are intentionally warm/cool (e.g. sunsets, candlelight).
    //
    // Shader model (cpu_apply_white_balance):
    //   tr = (1 + temp*0.2) * (1 + tint*0.25)
    //   tg = (1 + temp*0.05) * (1 - tint*0.25)
    //   tb = (1 - temp*0.2) * (1 + tint*0.25)
    // where temp = slider/25 and tint = slider/100.
    //
    // For slider values, per-unit R/B shift ≈ 0.2/25 = 0.008, and per-unit
    // G shift ≈ 0.25/100 = 0.0025.
    const WB_COMPENSATION: f64 = 0.7;
    const TEMP_SLIDER_PER_RATIO: f64 = 1.0 / 0.008; // ≈ 125
    const TINT_SLIDER_PER_RATIO: f64 = 1.0 / 0.0025; // = 400

    let (temperature, tint) = if wb_n > 0 {
        let r_avg = wb_r_sum / wb_n as f64;
        let g_avg = wb_g_sum / wb_n as f64;
        let b_avg = wb_b_sum / wb_n as f64;
        let gray = (r_avg + g_avg + b_avg) / 3.0;

        if gray > 1.0 {
            // Warmth imbalance: R vs B. Positive (R>B) → image too warm →
            // negative temperature slider cools it down.
            let d_rb = (r_avg - b_avg) / gray;
            let temp_slider = -WB_COMPENSATION * d_rb * TEMP_SLIDER_PER_RATIO;

            // Tint imbalance: G vs midpoint of R,B. Positive (G>mid) → image
            // too green → positive tint slider adds magenta to compensate.
            let mid_rb = (r_avg + b_avg) / 2.0;
            let d_g = (g_avg - mid_rb) / gray.max(1.0);
            let tint_slider = WB_COMPENSATION * d_g * TINT_SLIDER_PER_RATIO;

            (temp_slider, tint_slider)
        } else {
            (0.0, 0.0)
        }
    } else {
        (0.0, 0.0)
    };

    let percentile = |hist: &Vec<u32>, p: f64| -> usize {
        let target = (total_pixels * p) as u32;
        let mut cumulative = 0u32;
        for (i, &v) in hist.iter().enumerate() {
            cumulative += v;
            if cumulative >= target {
                return i;
            }
        }
        255
    };

    let p1 = percentile(&luma_hist, 0.01);
    let p50 = percentile(&luma_hist, 0.50);
    let p99 = percentile(&luma_hist, 0.99);

    let black_point = p1;
    let white_point = p99;
    let range = (white_point as f64 - black_point as f64).max(1.0);

    let highlight_percent =
        luma_hist[HIGHLIGHT_LUMA_THRESHOLD..256].iter().sum::<u32>() as f64 / total_pixels;
    let clipped_percent =
        luma_hist[CLIPPED_LUMA_THRESHOLD..256].iter().sum::<u32>() as f64 / total_pixels;

    let mut exposure = (EXPOSURE_MIDPOINT - p50 as f64) * EXPOSURE_SCALE;

    if white_point > WHITE_POINT_HARD_LIMIT
        || highlight_percent > HIGHLIGHT_PERCENT_THRESHOLD
        || clipped_percent > CLIPPED_PERCENT_THRESHOLD
    {
        exposure = exposure.min(0.0);
    }

    if white_point as f64 + exposure > EXPOSURE_CEILING {
        exposure = EXPOSURE_CEILING - white_point as f64;
    }

    let mut contrast = 0.0f64;
    if range < TARGET_RANGE {
        contrast = ((TARGET_RANGE / range) - 1.0) * CONTRAST_SCALE;
    }
    if highlight_percent > HIGHLIGHT_PERCENT_THRESHOLD {
        contrast *= HIGHLIGHT_CONTRAST_REDUCE;
    }

    let shadow_percent = luma_hist[0..SHADOW_LUMA_MAX].iter().sum::<u32>() as f64 / total_pixels;

    let mut shadows = 0.0f64;
    if shadow_percent > SHADOW_PERCENT_THRESHOLD {
        shadows = (shadow_percent * SHADOW_BOOST_SCALE).min(SHADOW_MAX);
    }

    let mut highlights = 0.0f64;
    if highlight_percent > HIGHLIGHT_PERCENT_THRESHOLD {
        highlights = -(highlight_percent * HIGHLIGHT_BOOST_SCALE).min(HIGHLIGHT_MAX);
    }

    let mut vibrancy = 0.0f64;
    if mean_saturation < VIBRANCY_SAT_THRESHOLD {
        vibrancy = (VIBRANCY_SAT_THRESHOLD - mean_saturation) as f64 * VIBRANCY_SCALE;
    }

    let mut dehaze = 0.0f64;
    if range < DEHAZE_RANGE_THRESHOLD && mean_saturation < DEHAZE_SAT_THRESHOLD {
        dehaze = (1.0 - range / DEHAZE_RANGE_THRESHOLD) * DEHAZE_SCALE;
    }

    let mut clarity = 0.0f64;
    if range < CLARITY_RANGE_THRESHOLD {
        clarity = (1.0 - range / CLARITY_RANGE_THRESHOLD) * CLARITY_SCALE;
    }

    let mut vignette_amount = 0.0f64;
    let mut centre = 0.0f64;

    if center_n > 0 && edge_n > 0 {
        let c_avg = center_sum / center_n as f32;
        let e_avg = edge_sum / edge_n as f32;

        if e_avg < c_avg {
            let diff = c_avg - e_avg;
            vignette_amount = -(diff as f64 * VIGNETTE_SCALE);

            if diff > VIGNETTE_CENTRE_DIFF_THRESHOLD {
                centre = (diff as f64 * CENTRE_SCALE).min(CENTRE_MAX);
            }
        }
    }

    let mut adjusted_luma_hist = vec![0u32; 256];
    for pixel in rgb_image.pixels() {
        let r = pixel[0] as f64;
        let g = pixel[1] as f64;
        let b = pixel[2] as f64;
        let mut luma = LUMA_R as f64 * r + LUMA_G as f64 * g + LUMA_B as f64 * b;
        luma += exposure;
        luma = (luma - MID_GRAY) * (1.0 + contrast / 100.0) + MID_GRAY;
        adjusted_luma_hist[luma.clamp(0.0, 255.0).round() as usize] += 1;
    }

    let adj_p1 = percentile(&adjusted_luma_hist, 0.01);
    let adj_p50 = percentile(&adjusted_luma_hist, 0.50);
    let adj_p99 = percentile(&adjusted_luma_hist, 0.99);
    let blacks: f64 = -(adj_p1 as f64 * BLACKS_SCALE);
    let whites: f64 = (adj_p99 as f64 - 255.0) * WHITES_SCALE;
    let brightness: f64 = (MID_GRAY - adj_p50 as f64) * BRIGHTNESS_SCALE;

    AutoAdjustmentResults {
        exposure: (exposure / EXPOSURE_OUTPUT_SCALE).clamp(-5.0, 5.0),
        brightness: brightness.clamp(-5.0, 5.0),
        contrast: contrast.clamp(-100.0, 100.0),
        highlights: highlights.clamp(-100.0, 100.0),
        shadows: shadows.clamp(-100.0, 100.0),
        vibrancy: vibrancy.clamp(-100.0, 100.0),
        vignette_amount: vignette_amount.clamp(-100.0, 100.0),
        temperature: temperature.clamp(-100.0, 100.0),
        tint: tint.clamp(-100.0, 100.0),
        dehaze: dehaze.clamp(-100.0, 100.0),
        clarity: clarity.clamp(-100.0, 100.0),
        centre: centre.clamp(-100.0, 100.0),
        whites: whites.clamp(-100.0, 100.0),
        blacks: blacks.clamp(-100.0, 100.0),
    }
}

pub fn auto_results_to_json(results: &AutoAdjustmentResults) -> serde_json::Value {
    json!({
        "exposure": results.exposure,
        "brightness": results.brightness,
        "contrast": results.contrast,
        "highlights": results.highlights,
        "shadows": results.shadows,
        "vibrance": results.vibrancy,
        "vignetteAmount": results.vignette_amount,
        "clarity": results.clarity,
        "centré": results.centre,

        "dehaze": results.dehaze,
        "sectionVisibility": {
            "basic": true,
            "color": true,
            "effects": true
        },
        "whites": results.whites,
        "blacks": results.blacks,
        "temperature": results.temperature,
        "tint": results.tint
    })
}

#[tauri::command]
pub fn calculate_auto_adjustments(
    state: tauri::State<AppState>,
) -> Result<serde_json::Value, String> {
    let original_image = state
        .original_image
        .lock_resilient()
        .as_ref()
        .ok_or("No image loaded for auto adjustments")?
        .image
        .clone();

    let results = perform_auto_analysis(&original_image);

    Ok(auto_results_to_json(&results))
}

// ---------------------------------------------------------------------------
// Composition Enhancement – Horizon Detection & Auto-Straighten
// ---------------------------------------------------------------------------

/// A detected horizon line represented in Hesse normal form (rho, theta).
/// rho = distance from origin to the line (pixels).
/// theta = angle of the line's normal from x-axis (radians).
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct HorizonLine {
    pub rho: f32,
    pub theta: f32,
    pub confidence: f32,
}

/// Detect horizon lines using Canny edge detection + Hough transform.
#[tauri::command]
pub fn detect_horizon_lines(state: tauri::State<AppState>) -> Result<Vec<HorizonLine>, String> {
    let loaded_image = state
        .original_image
        .lock_resilient()
        .clone()
        .ok_or("No original image loaded")?;

    let (w, h) = loaded_image.image.as_ref().dimensions();
    if w < 3 || h < 3 {
        return Err("Image too small for horizon detection".to_string());
    }

    // Convert to grayscale
    let gray = loaded_image.image.to_luma8();

    // Step 1: Gaussian blur to reduce noise before edge detection
    let blurred = imageproc::filter::gaussian_blur_f32(&gray, 1.4);

    // Step 2: Canny edge detection
    // We implement a simplified Canny: Sobel gradient magnitude + non-maximum suppression + thresholding
    let (grad_mag, grad_dir) = compute_sobel_gradients(&blurred);

    // Non-maximum suppression
    let nms = non_maximum_suppression(&grad_mag, &grad_dir, w, h);

    // Double threshold + hysteresis
    let edges = double_threshold_hysteresis(&nms, w, h, 30.0, 80.0);

    // Step 3: Hough transform for lines
    // Focus on near-horizontal lines (theta near PI/2) since we're looking for horizons
    let diagonal = ((w as f32).powi(2) + (h as f32).powi(2)).sqrt();
    let rho_max = diagonal.ceil() as i32;
    let rho_steps = (2 * rho_max + 1) as usize;

    // Scan angles near horizontal: 60° to 120° (PI/3 to 2*PI/3)
    let theta_min = PI / 3.0;
    let theta_max = 2.0 * PI / 3.0;
    let theta_steps = 120;
    let theta_step = (theta_max - theta_min) / theta_steps as f32;

    let mut accumulator = vec![0u32; rho_steps * theta_steps];

    for y in 1..(h - 1) {
        for x in 1..(w - 1) {
            if edges[(y * w + x) as usize] {
                for ti in 0..theta_steps {
                    let theta = theta_min + ti as f32 * theta_step;
                    let rho = x as f32 * theta.cos() + y as f32 * theta.sin();
                    let rho_idx = ((rho + diagonal).round() as i32).clamp(0, rho_steps as i32 - 1);
                    accumulator[rho_idx as usize * theta_steps + ti] += 1;
                }
            }
        }
    }

    // Find peaks in accumulator
    let threshold = (w.min(h) as f32 * 0.15).ceil() as u32;
    let mut peaks: Vec<(usize, usize, u32)> = Vec::new();

    for ri in 2..(rho_steps - 2) {
        for ti in 2..(theta_steps - 2) {
            let val = accumulator[ri * theta_steps + ti];
            if val < threshold {
                continue;
            }

            // Check if it's a local maximum in a 5x5 neighborhood
            let mut is_peak = true;
            'outer: for dri in -2i32..=2 {
                for dti in -2i32..=2 {
                    if dri == 0 && dti == 0 {
                        continue;
                    }
                    let nr = (ri as i32 + dri).clamp(0, rho_steps as i32 - 1) as usize;
                    let nt = (ti as i32 + dti).clamp(0, theta_steps as i32 - 1) as usize;
                    if accumulator[nr * theta_steps + nt] > val {
                        is_peak = false;
                        break 'outer;
                    }
                }
            }

            if is_peak {
                peaks.push((ri, ti, val));
            }
        }
    }

    // Sort by vote count descending
    peaks.sort_by_key(|a| std::cmp::Reverse(a.2));

    // Take top N and convert to HorizonLine
    let max_lines = 5;
    let mut horizon_lines = Vec::new();

    let max_votes = peaks.first().map(|p| p.2).unwrap_or(1).max(1);

    for (ri, ti, votes) in peaks.iter().take(max_lines) {
        let rho = *ri as f32 - diagonal;
        let theta = theta_min + *ti as f32 * theta_step;
        let confidence = *votes as f32 / max_votes as f32;

        horizon_lines.push(HorizonLine {
            rho,
            theta,
            confidence,
        });
    }

    Ok(horizon_lines)
}

/// Auto-straighten the horizon by finding the dominant near-horizontal line
/// and returning the rotation angle needed to correct it.
/// Returns the angle in degrees that should be applied to straighten.
#[tauri::command]
pub fn auto_straighten_horizon(
    state: tauri::State<AppState>,
    angle_tolerance: f32,
) -> Result<f32, String> {
    let lines = detect_horizon_lines(state)?;

    if lines.is_empty() {
        return Ok(0.0);
    }

    let tolerance = angle_tolerance.clamp(0.0, 45.0);

    // Find the best candidate: highest confidence, within tolerance
    let best = lines
        .iter()
        .filter(|l| {
            // The line angle relative to horizontal
            // A horizontal line has theta = PI/2
            let deviation = ((l.theta - PI / 2.0) * 180.0 / PI).abs();
            deviation <= tolerance
        })
        .max_by(|a, b| {
            a.confidence
                .partial_cmp(&b.confidence)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

    match best {
        Some(line) => {
            // The deviation from horizontal in degrees
            let deviation_deg = (line.theta - PI / 2.0) * 180.0 / PI;
            Ok(-deviation_deg)
        }
        None => Ok(0.0),
    }
}

// ---------------------------------------------------------------------------
// Internal helpers for Canny + Hough
// ---------------------------------------------------------------------------

/// Compute Sobel gradient magnitude and direction.
fn compute_sobel_gradients(gray: &image::GrayImage) -> (Vec<f32>, Vec<f32>) {
    let (w, h) = gray.dimensions();
    let raw = gray.as_raw();
    let total = (w * h) as usize;
    let mut mag = vec![0.0f32; total];
    let mut dir = vec![0.0f32; total];

    if w < 3 || h < 3 {
        return (mag, dir);
    }

    for y in 1..(h - 1) {
        for x in 1..(w - 1) {
            // Sobel X kernel: [[-1,0,1],[-2,0,2],[-1,0,1]]
            let tl = raw[((y - 1) * w + (x - 1)) as usize] as f32;
            let ml = raw[(y * w + (x - 1)) as usize] as f32;
            let bl = raw[((y + 1) * w + (x - 1)) as usize] as f32;
            let tr = raw[((y - 1) * w + (x + 1)) as usize] as f32;
            let mr = raw[(y * w + (x + 1)) as usize] as f32;
            let br = raw[((y + 1) * w + (x + 1)) as usize] as f32;
            let tc = raw[((y - 1) * w + x) as usize] as f32;
            let bc = raw[((y + 1) * w + x) as usize] as f32;

            let gx = -tl + tr - 2.0 * ml + 2.0 * mr - bl + br;
            let gy = -tl - 2.0 * tc - tr + bl + 2.0 * bc + br;

            let idx = (y * w + x) as usize;
            mag[idx] = (gx * gx + gy * gy).sqrt();
            dir[idx] = gy.atan2(gx);
        }
    }

    (mag, dir)
}

/// Non-maximum suppression for Canny edge detection.
fn non_maximum_suppression(mag: &[f32], dir: &[f32], w: u32, h: u32) -> Vec<f32> {
    let total = (w * h) as usize;
    let mut nms = vec![0.0f32; total];

    if w < 3 || h < 3 {
        return nms;
    }

    for y in 1..(h - 1) {
        for x in 1..(w - 1) {
            let idx = (y * w + x) as usize;
            let m = mag[idx];
            if m < 1e-4 {
                continue;
            }

            // Quantize angle to 4 directions
            let angle = dir[idx];
            let (dx1, dy1, dx2, dy2) = {
                let a = angle.abs();
                if !(PI / 8.0..=7.0 * PI / 8.0).contains(&a) {
                    // Horizontal edge → compare left/right
                    (1i32, 0i32, -1i32, 0i32)
                } else if a < 3.0 * PI / 8.0 {
                    // Diagonal \
                    (1i32, 1i32, -1i32, -1i32)
                } else if a < 5.0 * PI / 8.0 {
                    // Vertical edge → compare up/down
                    (0i32, 1i32, 0i32, -1i32)
                } else {
                    // Diagonal /
                    (1i32, -1i32, -1i32, 1i32)
                }
            };

            let nx1 = (x as i32 + dx1).clamp(0, w as i32 - 1) as u32;
            let ny1 = (y as i32 + dy1).clamp(0, h as i32 - 1) as u32;
            let nx2 = (x as i32 + dx2).clamp(0, w as i32 - 1) as u32;
            let ny2 = (y as i32 + dy2).clamp(0, h as i32 - 1) as u32;

            let m1 = mag[(ny1 * w + nx1) as usize];
            let m2 = mag[(ny2 * w + nx2) as usize];

            if m >= m1 && m >= m2 {
                nms[idx] = m;
            }
        }
    }

    nms
}

/// Double threshold + hysteresis for Canny.
fn double_threshold_hysteresis(
    nms: &[f32],
    w: u32,
    h: u32,
    low_thresh: f32,
    high_thresh: f32,
) -> Vec<bool> {
    let total = (w * h) as usize;
    let mut strong = vec![false; total];
    let mut weak = vec![false; total];

    // Classify pixels
    for i in 0..total {
        if nms[i] >= high_thresh {
            strong[i] = true;
        } else if nms[i] >= low_thresh {
            weak[i] = true;
        }
    }

    // Hysteresis: promote weak pixels connected to strong pixels
    let mut edges = strong.clone();
    let mut changed = true;
    if w < 3 || h < 3 {
        return edges;
    }
    while changed {
        changed = false;
        for y in 1..(h - 1) {
            for x in 1..(w - 1) {
                let idx = (y * w + x) as usize;
                if !weak[idx] || edges[idx] {
                    continue;
                }
                // Check 8-connectivity for strong neighbors
                for dy in -1i32..=1 {
                    for dx in -1i32..=1 {
                        if dx == 0 && dy == 0 {
                            continue;
                        }
                        let nx = (x as i32 + dx).clamp(0, w as i32 - 1) as u32;
                        let ny = (y as i32 + dy).clamp(0, h as i32 - 1) as u32;
                        if edges[(ny * w + nx) as usize] {
                            edges[idx] = true;
                            changed = true;
                        }
                    }
                }
            }
        }
    }

    edges
}

// ============================================================
// CPU Color Adjustment Pipeline (Android / no-GPU fallback)
// ============================================================

/// CPU adjustment constants.
const CPU_TINY_EPS: f32 = 1e-6;

#[inline]
fn cpu_max3(x: f32, y: f32, z: f32) -> f32 {
    x.max(y.max(z))
}
#[inline]
fn cpu_min3(x: f32, y: f32, z: f32) -> f32 {
    x.min(y.min(z))
}

#[inline]
fn cpu_srgb_to_linear(c: f32) -> f32 {
    if c <= 0.04045 {
        c / 12.92
    } else {
        ((c + 0.055) / 1.055).powf(2.4)
    }
}
#[inline]
fn cpu_linear_to_srgb(c: f32) -> f32 {
    if c <= 0.0031308 {
        c * 12.92
    } else {
        1.055 * c.powf(1.0 / 2.4) - 0.055
    }
}
#[inline]
fn cpu_linear_to_srgb_vec3(p: &mut [f32]) {
    p[0] = cpu_linear_to_srgb(p[0].clamp(0.0, 1.0));
    p[1] = cpu_linear_to_srgb(p[1].clamp(0.0, 1.0));
    p[2] = cpu_linear_to_srgb(p[2].clamp(0.0, 1.0));
}
#[inline]
fn cpu_srgb_to_linear_vec3(p: &mut [f32]) {
    p[0] = cpu_srgb_to_linear(p[0]);
    p[1] = cpu_srgb_to_linear(p[1]);
    p[2] = cpu_srgb_to_linear(p[2]);
}

#[inline]
fn cpu_get_luma(p: &[f32]) -> f32 {
    0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]
}
#[inline]
fn cpu_get_maxc(p: &[f32]) -> f32 {
    cpu_max3(p[0], p[1], p[2])
}

#[inline]
fn cpu_mix(a: f32, b: f32, t: f32) -> f32 {
    a + (b - a) * t
}
#[inline]
fn cpu_smoothstep(e0: f32, e1: f32, x: f32) -> f32 {
    let t = ((x - e0) / (e1 - e0)).clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}
#[inline]
fn cpu_sign(v: f32) -> f32 {
    if v > 0.0 {
        1.0
    } else if v < 0.0 {
        -1.0
    } else {
        0.0
    }
}

fn cpu_gaussian_blur_luma(data: &[f32], w: usize, h: usize, radius: f32) -> Vec<f32> {
    let r = (radius.max(1.0)) as usize;
    let mut hor = vec![0.0f32; w * h];
    let sigma = (r as f32) / 3.0;
    let kernel: Vec<f32> = (0..=r)
        .map(|x| (-(x as f32).powi(2) / (2.0 * sigma.powi(2))).exp())
        .collect();
    let sum: f32 = kernel[0] + 2.0 * kernel.iter().skip(1).sum::<f32>();

    for y in 0..h {
        for x in 0..w {
            let mut acc = 0.0;
            for k in 0..=r {
                let xl = (x as isize - k as isize).max(0) as usize;
                let xr = (x + k).min(w - 1);
                let wl = if k == 0 { kernel[0] } else { kernel[k] };
                acc += data[y * w + xl] * wl;
                if k > 0 {
                    acc += data[y * w + xr] * wl;
                }
            }
            hor[y * w + x] = acc / sum;
        }
    }
    let mut out = vec![0.0f32; w * h];
    for y in 0..h {
        for x in 0..w {
            let mut acc = 0.0;
            for k in 0..=r {
                let yu = (y as isize - k as isize).max(0) as usize;
                let yd = (y + k).min(h - 1);
                let wl = if k == 0 { kernel[0] } else { kernel[k] };
                acc += hor[yu * w + x] * wl;
                if k > 0 {
                    acc += hor[yd * w + x] * wl;
                }
            }
            out[y * w + x] = acc / sum;
        }
    }
    out
}

/// Gaussian blur for RGB data. Applies a separable Gaussian blur to each
/// channel independently, returning a flattened RGB buffer.
fn cpu_create_blur_rgb_buffer(rgb: &[f32], w: usize, h: usize, scale: f32) -> Vec<f32> {
    let r = (scale.max(1.0)) as usize;
    let sigma = (r as f32) / 3.0;
    let kernel: Vec<f32> = (0..=r)
        .map(|x| (-(x as f32).powi(2) / (2.0 * sigma.powi(2))).exp())
        .collect();
    let sum: f32 = kernel[0] + 2.0 * kernel.iter().skip(1).sum::<f32>();

    // Horizontal pass
    let mut hor = vec![0.0f32; w * h * 3];
    for y in 0..h {
        for x in 0..w {
            let mut acc = [0.0f32; 3];
            for k in 0..=r {
                let xl = (x as isize - k as isize).max(0) as usize;
                let xr = (x + k).min(w - 1);
                let wl = if k == 0 { kernel[0] } else { kernel[k] };
                let base_l = (y * w + xl) * 3;
                let base_r = (y * w + xr) * 3;
                for c in 0..3 {
                    acc[c] += rgb[base_l + c] * wl;
                    if k > 0 {
                        acc[c] += rgb[base_r + c] * wl;
                    }
                }
            }
            let base = (y * w + x) * 3;
            for c in 0..3 {
                hor[base + c] = acc[c] / sum;
            }
        }
    }

    // Vertical pass
    let mut out = vec![0.0f32; w * h * 3];
    for y in 0..h {
        for x in 0..w {
            let mut acc = [0.0f32; 3];
            for k in 0..=r {
                let yu = (y as isize - k as isize).max(0) as usize;
                let yd = (y + k).min(h - 1);
                let wl = if k == 0 { kernel[0] } else { kernel[k] };
                let base_u = (yu * w + x) * 3;
                let base_d = (yd * w + x) * 3;
                for c in 0..3 {
                    acc[c] += hor[base_u + c] * wl;
                    if k > 0 {
                        acc[c] += hor[base_d + c] * wl;
                    }
                }
            }
            let base = (y * w + x) * 3;
            for c in 0..3 {
                out[base + c] = acc[c] / sum;
            }
        }
    }
    out
}

fn cpu_create_blur_luma_buffers(
    luma: &[f32],
    w: usize,
    h: usize,
    scale: f32,
) -> (Vec<f32>, Vec<f32>, Vec<f32>, Vec<f32>) {
    let s = if scale < 1.0 { 1.0 } else { scale };
    let sharpness = 1.0 * s;
    let tonal = 5.0 * s;
    let clarity = 15.0 * s;
    let structure = 30.0 * s;
    let t0 = cpu_gaussian_blur_luma(luma, w, h, sharpness);
    let t1 = cpu_gaussian_blur_luma(luma, w, h, tonal);
    let t2 = cpu_gaussian_blur_luma(luma, w, h, clarity);
    let t3 = cpu_gaussian_blur_luma(luma, w, h, structure);
    (t0, t1, t2, t3)
}

#[inline]
fn cpu_apply_local_contrast(
    pix: &mut [f32],
    blur: f32,
    amount: f32,
    is_raw: bool,
    mode: u32,
    threshold: f32,
) {
    if amount.abs() < CPU_TINY_EPS {
        return;
    }
    // Match shader apply_local_contrast:
    // - amount negative: mix towards blur
    // - amount positive: log2 ratio contrast boost with shadow/highlight protection
    if amount < 0.0 {
        let blur_amt = if mode == 0 { (-amount) * 0.5 } else { -amount };
        for c in 0..3 {
            pix[c] = cpu_mix(pix[c], blur, blur_amt);
        }
        return;
    }
    let center_luma = cpu_get_luma(pix);
    let shadow_threshold = if is_raw { 0.03 } else { 0.1 };
    let shadow_prot = cpu_smoothstep(0.0, shadow_threshold, center_luma);
    let highlight_prot = 1.0 - cpu_smoothstep(0.9, 1.0, center_luma);
    let midtone_mask = shadow_prot * highlight_prot;
    if midtone_mask < 0.001 {
        return;
    }

    let blurred_luma = blur;
    let safe_center = center_luma.max(0.0001);
    let safe_blurred = blurred_luma.max(0.0001);
    let log_ratio = (safe_center / safe_blurred).log2();

    let effective = if mode == 0 {
        let edge = log_ratio.abs();
        let norm_edge = (edge / 3.0).clamp(0.0, 1.0);
        let edge_damp = 1.0 - norm_edge.sqrt();
        let edge_mask = cpu_smoothstep(threshold * 0.5, threshold * 1.5, edge);
        amount * edge_damp * edge_mask * 0.8
    } else {
        amount
    };

    let contrast_factor = (log_ratio * effective).exp2();
    for c in 0..3 {
        let final_c = pix[c] * contrast_factor;
        pix[c] = cpu_mix(pix[c], final_c, midtone_mask);
    }
}

#[inline]
fn cpu_apply_centre_local_contrast(
    pix: &mut [f32],
    centre: f32,
    x: u32,
    y: u32,
    w: u32,
    h: u32,
    blur: f32,
    is_raw: bool,
) {
    if centre.abs() < CPU_TINY_EPS {
        return;
    }
    // Match GPU apply_centre_local_contrast: aspect-corrected mask with clarity_strength
    let full_dims_f = [w as f32, h as f32];
    let coord_f = [x as f32, y as f32];
    let midpoint = 0.4;
    let feather = 0.375;
    let aspect = full_dims_f[1] / full_dims_f[0];
    let uv_centered_x = (coord_f[0] / full_dims_f[0] - 0.5) * 2.0;
    let uv_centered_y = (coord_f[1] / full_dims_f[1] - 0.5) * 2.0;
    let d = (uv_centered_x * uv_centered_x + (uv_centered_y * aspect) * (uv_centered_y * aspect))
        .sqrt()
        * 0.5;
    let vignette_mask = cpu_smoothstep(midpoint - feather, midpoint + feather, d);
    let centre_mask = 1.0 - vignette_mask;

    const CLARITY_SCALE: f32 = 0.9;
    let clarity_strength = centre * (2.0 * centre_mask - 1.0) * CLARITY_SCALE;

    if clarity_strength.abs() > 0.001 {
        cpu_apply_local_contrast(pix, blur, clarity_strength, is_raw, 1, 0.0);
    }
}

#[inline]
fn cpu_apply_linear_exposure(pix: &mut [f32], exposure: f32) {
    if exposure.abs() < CPU_TINY_EPS {
        return;
    }
    let m = 2.0f32.powf(exposure);
    pix[0] *= m;
    pix[1] *= m;
    pix[2] *= m;
}

#[inline]
fn cpu_apply_filmic_exposure(pix: &mut [f32], brightness: f32) {
    if brightness.abs() < CPU_TINY_EPS {
        return;
    }
    // Match GPU apply_filmic_exposure: rational curve with chroma preservation
    const RATIONAL_CURVE_MIX: f32 = 0.95;
    const MIDTONE_STRENGTH: f32 = 1.2;
    const TOP_ANCHOR: f32 = 1.06;
    let original_luma = cpu_get_luma(pix);
    if original_luma.abs() < 0.00001 {
        return;
    }
    let direct_adj = brightness * (1.0 - RATIONAL_CURVE_MIX);
    let rational_adj = brightness * RATIONAL_CURVE_MIX;
    let scale = 2.0f32.powf(direct_adj);
    let k = 2.0f32.powf(-rational_adj * MIDTONE_STRENGTH);
    let luma_abs = original_luma.abs();
    let luma_floor = (luma_abs / TOP_ANCHOR).floor() * TOP_ANCHOR;
    let luma_norm = (luma_abs - luma_floor) / TOP_ANCHOR;
    let shaped_norm = luma_norm / (luma_norm + (1.0 - luma_norm) * k);
    let shaped_luma_abs = luma_floor + shaped_norm * TOP_ANCHOR;
    let new_luma = cpu_sign(original_luma) * shaped_luma_abs * scale;
    let chroma = [
        pix[0] - original_luma,
        pix[1] - original_luma,
        pix[2] - original_luma,
    ];
    let total_luma_scale = new_luma / original_luma;
    let luma_weight = new_luma.clamp(0.0, 2.0) * 0.5;
    let dynamic_exp = cpu_mix(0.95, 0.65, luma_weight);
    let base_chroma_scale = total_luma_scale.powf(dynamic_exp);
    let highlight_rolloff = 1.0 / (1.0 + (new_luma - 0.9).max(0.0) * 2.0);
    let chroma_scale = base_chroma_scale * highlight_rolloff;
    pix[0] = new_luma + chroma[0] * chroma_scale;
    pix[1] = new_luma + chroma[1] * chroma_scale;
    pix[2] = new_luma + chroma[2] * chroma_scale;
}

#[inline]
fn cpu_apply_white_balance(pix: &mut [f32], temperature: f32, tint: f32) {
    if temperature.abs() < CPU_TINY_EPS && tint.abs() < CPU_TINY_EPS {
        return;
    }
    // match shader: temp_kelvin_mult * tint_mult
    let tr = (1.0 + temperature * 0.2) * (1.0 + tint * 0.25);
    let tg = (1.0 + temperature * 0.05) * (1.0 - tint * 0.25);
    let tb = (1.0 - temperature * 0.2) * (1.0 + tint * 0.25);
    pix[0] *= tr;
    pix[1] *= tg;
    pix[2] *= tb;
}

#[inline]
fn cpu_apply_dehaze(pix: &mut [f32], blur_luma: f32, dehaze: f32) {
    if dehaze.abs() < CPU_TINY_EPS {
        return;
    }
    // Match GPU apply_dehaze: atmospheric light estimation with halo protection
    let atmospheric_r = 0.95f32;
    let atmospheric_g = 0.97f32;
    let atmospheric_b = 1.0f32;

    if dehaze > 0.0 {
        let pixel_dark = cpu_min3(pix[0], pix[1], pix[2]);
        // Approximate regional_dark from blur luma (min channel <= luma, use ~0.85 for haze)
        let regional_dark = (blur_luma * 0.85).max(0.0);
        let pixel_luma = cpu_get_luma(&[pix[0].max(0.0), pix[1].max(0.0), pix[2].max(0.0)]);
        let blurred_luma = blur_luma.max(0.0);
        let edge_diff = (pixel_luma.max(0.0).powf(0.5) - blurred_luma.powf(0.5)).abs();
        let halo_protection = cpu_smoothstep(0.02, 0.15, edge_diff);
        let spatial_dark = cpu_mix(regional_dark, pixel_dark, halo_protection);
        let safe_dark = (spatial_dark - 0.02).max(0.0);
        let mapped_haze = safe_dark / (safe_dark + 0.2);
        let t = (1.0 - dehaze * mapped_haze * 0.85).max(0.15);
        let mut recovered = [
            (pix[0] - atmospheric_r) / t + atmospheric_r,
            (pix[1] - atmospheric_g) / t + atmospheric_g,
            (pix[2] - atmospheric_b) / t + atmospheric_b,
        ];
        let rec_luma = cpu_get_luma(&[
            recovered[0].max(0.0),
            recovered[1].max(0.0),
            recovered[2].max(0.0),
        ]);
        let shadow_lift = cpu_smoothstep(0.1, 0.0, rec_luma) * (1.0 - t) * 0.15;
        recovered[0] += shadow_lift;
        recovered[1] += shadow_lift;
        recovered[2] += shadow_lift;
        let haze_removed = 1.0 - t;
        let sat_boost = haze_removed * 0.5;
        let final_luma = cpu_get_luma(&[
            recovered[0].max(0.0),
            recovered[1].max(0.0),
            recovered[2].max(0.0),
        ]);
        for c in 0..3 {
            recovered[c] = cpu_mix(final_luma, recovered[c], 1.0 + sat_boost);
            pix[c] = recovered[c].max(0.0);
        }
    } else {
        // Negative dehaze: add haze (matching GPU)
        let regional_dark = (blur_luma * 0.85).max(0.0);
        let safe_dark = (regional_dark - 0.02).max(0.0);
        let mapped_depth = safe_dark / (safe_dark + 0.2);
        let depth_factor = cpu_mix(0.4, 1.0, mapped_depth);
        let atm = [atmospheric_r, atmospheric_g, atmospheric_b];
        for c in 0..3 {
            pix[c] = cpu_mix(pix[c], atm[c], dehaze.abs() * 0.7 * depth_factor);
        }
    }
}

#[inline]
fn cpu_apply_centre_tonal_and_color(pix: &mut [f32], centre: f32, x: u32, y: u32, w: u32, h: u32) {
    if centre.abs() < CPU_TINY_EPS {
        return;
    }
    // Match GPU apply_centre_tonal_and_color: filmic exposure + creative color
    let full_dims_f = [w as f32, h as f32];
    let coord_f = [x as f32, y as f32];
    let midpoint = 0.4;
    let feather = 0.375;
    let aspect = full_dims_f[1] / full_dims_f[0];
    let uv_centered_x = (coord_f[0] / full_dims_f[0] - 0.5) * 2.0;
    let uv_centered_y = (coord_f[1] / full_dims_f[1] - 0.5) * 2.0;
    let d = (uv_centered_x * uv_centered_x + (uv_centered_y * aspect) * (uv_centered_y * aspect))
        .sqrt()
        * 0.5;
    let vignette_mask = cpu_smoothstep(midpoint - feather, midpoint + feather, d);
    let centre_mask = 1.0 - vignette_mask;

    const EXPOSURE_SCALE: f32 = 0.5;
    const VIBRANCE_SCALE: f32 = 0.4;
    const SATURATION_CENTER_SCALE: f32 = 0.3;
    const SATURATION_EDGE_SCALE: f32 = 0.8;

    // Exposure boost at centre (matching GPU apply_filmic_exposure)
    let exposure_boost = centre_mask * centre * EXPOSURE_SCALE;
    cpu_apply_filmic_exposure(pix, exposure_boost);

    // Vibrance and saturation (matching GPU apply_creative_color)
    let vibrance_center_boost = centre_mask * centre * VIBRANCE_SCALE;
    let saturation_center_boost = centre_mask * centre * SATURATION_CENTER_SCALE;
    let saturation_edge_effect = -(1.0 - centre_mask) * centre * SATURATION_EDGE_SCALE;
    let total_saturation_effect = saturation_center_boost + saturation_edge_effect;
    cpu_apply_creative_color(pix, total_saturation_effect, vibrance_center_boost);
}

#[inline]
fn cpu_apply_tonal_adjustments(
    pix: &mut [f32],
    blur: f32,
    contrast: f32,
    shadows: f32,
    whites: f32,
    blacks: f32,
) {
    // Match GPU apply_tonal_adjustments: perceptual gamma with detail preservation
    let mut rgb = [pix[0], pix[1], pix[2]];
    let mut blur_luma = blur;

    // White level adjustment (matching GPU)
    if whites.abs() > CPU_TINY_EPS {
        let white_level = 1.0 - whites * 0.25;
        let w_mult = 1.0 / white_level.max(0.01);
        rgb[0] *= w_mult;
        rgb[1] *= w_mult;
        rgb[2] *= w_mult;
        blur_luma *= w_mult;
    }

    let pixel_luma = cpu_get_luma(&[rgb[0].max(0.0), rgb[1].max(0.0), rgb[2].max(0.0)]);
    let blurred_luma = blur_luma.max(0.0);
    let safe_pixel_luma = pixel_luma.max(0.0001);
    let safe_blurred_luma = blurred_luma.max(0.0001);

    // Shadows and blacks (matching GPU perceptual gamma approach)
    if shadows.abs() > CPU_TINY_EPS || blacks.abs() > CPU_TINY_EPS {
        let t_pixel = safe_pixel_luma.powf(0.4545);
        let t_blurred = safe_blurred_luma.powf(0.4545);

        let shadow_lift = shadows * t_pixel * (1.0 - t_pixel).max(0.0).powf(4.5);
        let black_lift = blacks * t_pixel * (1.0 - t_pixel).max(0.0).powf(12.0);
        let lift_amount = (shadow_lift + black_lift).max(0.0);

        let t_pixel_curved = (t_pixel + shadow_lift + black_lift).max(0.0);

        let shadow_pivot = 0.2;
        let stretch_factor = 1.0 + lift_amount * 1.3;
        let contrasted_t = shadow_pivot + (t_pixel_curved - shadow_pivot) * stretch_factor;

        let final_t = cpu_mix(t_pixel_curved, contrasted_t, 0.85).max(0.0);
        let curved_luma = final_t.powf(2.2);

        let luma_ratio = curved_luma / safe_pixel_luma;
        rgb[0] *= luma_ratio;
        rgb[1] *= luma_ratio;
        rgb[2] *= luma_ratio;

        // Detail preservation (matching GPU)
        let detail = t_pixel / t_blurred.max(0.0001);
        let safe_detail = detail.clamp(0.8, 1.25);
        let noise_protection = cpu_smoothstep(0.0, 0.1, t_blurred);
        let detail_amp = 1.0 + lift_amount * 1.2 * noise_protection;
        let enhanced_detail = safe_detail.powf(detail_amp);
        let detail_correction = enhanced_detail / safe_detail;
        let linear_correction = detail_correction.powf(2.2);
        rgb[0] *= linear_correction;
        rgb[1] *= linear_correction;
        rgb[2] *= linear_correction;

        // HDR recovery (matching GPU)
        if luma_ratio > 1.0 {
            let recovered_luma = cpu_get_luma(&rgb);
            let boost_amount = ((luma_ratio - 1.0) * 0.15).clamp(0.0, 0.4);
            rgb[0] = cpu_mix(rgb[0], recovered_luma, boost_amount);
            rgb[1] = cpu_mix(rgb[1], recovered_luma, boost_amount);
            rgb[2] = cpu_mix(rgb[2], recovered_luma, boost_amount);
        }
    }

    // Contrast (matching GPU perceptual S-curve)
    if contrast.abs() > CPU_TINY_EPS {
        let safe_rgb = [rgb[0].max(0.0), rgb[1].max(0.0), rgb[2].max(0.0)];
        let g = 2.2;
        let perceptual = [
            safe_rgb[0].powf(1.0 / g),
            safe_rgb[1].powf(1.0 / g),
            safe_rgb[2].powf(1.0 / g),
        ];
        let clamped = [
            perceptual[0].clamp(0.0, 1.0),
            perceptual[1].clamp(0.0, 1.0),
            perceptual[2].clamp(0.0, 1.0),
        ];
        let strength = 2.0f32.powf(contrast * 1.25);

        for c in 0..3 {
            let condition = clamped[c] < 0.5;
            let high_part = 1.0 - 0.5 * (2.0 * (1.0 - clamped[c])).powf(strength);
            let low_part = 0.5 * (2.0 * clamped[c]).powf(strength);
            let curved_perceptual = if condition { low_part } else { high_part };
            let contrast_adjusted = curved_perceptual.powf(g);
            let mix_factor = cpu_smoothstep(1.0, 1.01, safe_rgb[c]);
            rgb[c] = cpu_mix(contrast_adjusted, rgb[c], mix_factor);
        }
    }

    pix[0] = rgb[0];
    pix[1] = rgb[1];
    pix[2] = rgb[2];
}

#[inline]
fn cpu_apply_highlights_adjustment(pix: &mut [f32], _blur: f32, highlights: f32) {
    if highlights.abs() < CPU_TINY_EPS {
        return;
    }
    // Match GPU `apply_highlights_adjustment` (blur/is_raw unused on GPU side too).
    // Fixes prior sign bug: positive highlights now brighten (pow2) instead of darken.
    let pixel_luma = cpu_get_luma(&[pix[0].max(0.0), pix[1].max(0.0), pix[2].max(0.0)]);
    let safe_pixel_luma = pixel_luma.max(0.0001);
    let pixel_mask_input = (safe_pixel_luma * 1.5).tanh();
    let highlight_mask = cpu_smoothstep(0.3, 0.95, pixel_mask_input);
    if highlight_mask < 0.001 {
        return;
    }

    let luma = pixel_luma;
    let mut final_color = [pix[0], pix[1], pix[2]];
    if highlights < 0.0 {
        let new_luma: f32;
        if luma <= 1.0 {
            let gamma = 1.0 - highlights * 1.75;
            new_luma = luma.powf(gamma);
        } else {
            let luma_excess = luma - 1.0;
            let compression_strength = -highlights * 6.0;
            let compressed_excess = luma_excess / (1.0 + luma_excess * compression_strength);
            new_luma = 1.0 + compressed_excess;
        }
        let scale = new_luma / luma.max(0.0001);
        let tonally_adjusted = [pix[0] * scale, pix[1] * scale, pix[2] * scale];
        let desaturation_amount = cpu_smoothstep(1.0, 10.0, luma);
        let white_point = [new_luma; 3];
        final_color = [
            cpu_mix(tonally_adjusted[0], white_point[0], desaturation_amount),
            cpu_mix(tonally_adjusted[1], white_point[1], desaturation_amount),
            cpu_mix(tonally_adjusted[2], white_point[2], desaturation_amount),
        ];
    } else {
        let adjustment = highlights * 1.75;
        let factor = 2.0f32.powf(adjustment);
        final_color = [pix[0] * factor, pix[1] * factor, pix[2] * factor];
    }

    for c in 0..3 {
        pix[c] = cpu_mix(pix[c], final_color[c], highlight_mask);
    }
}

#[inline]
fn cpu_rgb_to_hsv(pix: &[f32]) -> (f32, f32, f32) {
    let maxc = cpu_max3(pix[0], pix[1], pix[2]);
    let minc = cpu_min3(pix[0], pix[1], pix[2]);
    let v = maxc;
    let delta = maxc - minc;
    let s = if v > CPU_TINY_EPS { delta / v } else { 0.0 };
    let mut h = 0.0;
    if delta > CPU_TINY_EPS {
        if maxc == pix[0] {
            h = ((pix[1] - pix[2]) / delta + 6.0) % 6.0;
        } else if maxc == pix[1] {
            h = (pix[2] - pix[0]) / delta + 2.0;
        } else {
            h = (pix[0] - pix[1]) / delta + 4.0;
        }
        h *= 60.0;
    }
    (h, s, v)
}

#[inline]
fn cpu_hsv_to_rgb(h: f32, s: f32, v: f32) -> [f32; 3] {
    let c = v * s;
    let hh = (h / 60.0) % 6.0;
    let hh_int = hh as i32;
    let f = hh - hh_int as f32;
    let x = c * (1.0 - (f * 2.0 - 1.0).abs());
    let (r1, g1, b1) = match hh_int {
        0 => (c, x, 0.0),
        1 => (x, c, 0.0),
        2 => (0.0, c, x),
        3 => (0.0, x, c),
        4 => (x, 0.0, c),
        _ => (c, 0.0, x),
    };
    let m = v - c;
    [r1 + m, g1 + m, b1 + m]
}

#[inline]
fn cpu_hue_diff(a: f32, b: f32) -> f32 {
    let d = (a - b).abs();
    if d > 180.0 { 360.0 - d } else { d }
}

#[inline]
fn cpu_apply_hue_shift(pix: &mut [f32], hue: f32) {
    if hue.abs() < CPU_TINY_EPS {
        return;
    }
    // Convert linear → sRGB (matching GPU apply_hue_shift which uses linear_to_srgb_extended)
    let srgb = [
        cpu_linear_to_srgb(pix[0].max(0.0)),
        cpu_linear_to_srgb(pix[1].max(0.0)),
        cpu_linear_to_srgb(pix[2].max(0.0)),
    ];
    let (h, s, v) = cpu_rgb_to_hsv(&srgb);
    let nh = (h + hue + 360.0) % 360.0;
    let [r, g, b] = cpu_hsv_to_rgb(nh, s, v);
    // Convert back sRGB → linear
    pix[0] = cpu_srgb_to_linear(r);
    pix[1] = cpu_srgb_to_linear(g);
    pix[2] = cpu_srgb_to_linear(b);
}

#[inline]
fn cpu_apply_creative_color(pix: &mut [f32], saturation: f32, vibrance: f32) {
    // Match GPU shader: compute luma once from the original color and reuse
    // it for both saturation and vibrance. The GPU shader does:
    //   let luma = get_luma(processed);
    //   if (sat != 0.0) { processed = mix(vec3(luma), processed, 1.0 + sat); }
    //   ... vibrance uses the same `luma` variable ...
    let luma = cpu_get_luma(pix);
    if saturation.abs() > CPU_TINY_EPS {
        let s = 1.0 + saturation;
        for c in 0..3 {
            pix[c] = cpu_mix(luma, pix[c], s);
        }
    }
    if vibrance.abs() < CPU_TINY_EPS {
        return;
    }
    let c_max = cpu_max3(pix[0], pix[1], pix[2]);
    let c_min = cpu_min3(pix[0], pix[1], pix[2]);
    let delta = c_max - c_min;
    if delta < 0.02 {
        return;
    }
    let current_sat = delta / c_max.max(0.001);
    let (h, _, _) = cpu_rgb_to_hsv(pix);
    if vibrance > 0.0 {
        let sat_mask = 1.0 - cpu_smoothstep(0.4, 0.9, current_sat);
        let skin_center = 25.0;
        let hue_dist = (h - skin_center).abs().min(360.0 - (h - skin_center).abs());
        let is_skin = cpu_smoothstep(35.0, 10.0, hue_dist);
        let skin_damp = cpu_mix(1.0, 0.6, is_skin);
        let amt = vibrance * sat_mask * skin_damp;
        for c in 0..3 {
            pix[c] = cpu_mix(luma, pix[c], 1.0 + amt);
        }
    } else {
        let desat_mask = 1.0 - cpu_smoothstep(0.2, 0.8, current_sat);
        let amt = vibrance * desat_mask;
        for c in 0..3 {
            pix[c] = cpu_mix(luma, pix[c], 1.0 + amt);
        }
    }
}

fn cpu_apply_color_calibration(pix: &mut [f32], cal: &ColorCalibrationSettings) {
    // match shader: apply_color_calibration
    let h_r = cal.red_hue;
    let h_g = cal.green_hue;
    let h_b = cal.blue_hue;
    let r_prime = [1.0 - h_r.abs(), h_r.max(0.0), (-h_r).max(0.0)];
    let g_prime = [(-h_g).max(0.0), 1.0 - h_g.abs(), h_g.max(0.0)];
    let b_prime = [h_b.max(0.0), (-h_b).max(0.0), 1.0 - h_b.abs()];
    // hue_matrix * color (column-major: col0=r_prime, col1=g_prime, col2=b_prime)
    let mut c = [0.0f32; 3];
    for i in 0..3 {
        c[i] = r_prime[i] * pix[0] + g_prime[i] * pix[1] + b_prime[i] * pix[2];
    }

    let luma = cpu_get_luma(&[c[0].max(0.0), c[1].max(0.0), c[2].max(0.0)]);
    let desat = [luma; 3];
    let sat_vector = [c[0] - desat[0], c[1] - desat[1], c[2] - desat[2]];

    let color_sum = c[0] + c[1] + c[2];
    let mut masks = [0.0f32; 3];
    if color_sum > 0.001 {
        masks[0] = c[0] / color_sum;
        masks[1] = c[1] / color_sum;
        masks[2] = c[2] / color_sum;
    }

    let total_sat = masks[0] * cal.red_saturation
        + masks[1] * cal.green_saturation
        + masks[2] * cal.blue_saturation;

    for i in 0..3 {
        c[i] += sat_vector[i] * total_sat;
    }

    let st = cal.shadows_tint;
    if st.abs() > 0.001 {
        let sl = cpu_get_luma(&[c[0].max(0.0), c[1].max(0.0), c[2].max(0.0)]);
        let mask = 1.0 - cpu_smoothstep(0.0, 0.3, sl);
        let tint_mult = [1.0 + st * 0.25, 1.0 - st * 0.25, 1.0 + st * 0.25];
        for i in 0..3 {
            c[i] = cpu_mix(c[i], c[i] * tint_mult[i], mask);
        }
    }

    pix[0] = c[0];
    pix[1] = c[1];
    pix[2] = c[2];
}

fn cpu_mat3_mul_vec3(m: &GpuMat3, v: &[f32; 3]) -> [f32; 3] {
    // GpuMat3 stores col0/col1/col2 as column vectors in [f32;4], so column-major:
    // result[i] = m.col0[i] * v[0] + m.col1[i] * v[1] + m.col2[i] * v[2]
    [
        m.col0[0] * v[0] + m.col1[0] * v[1] + m.col2[0] * v[2],
        m.col0[1] * v[0] + m.col1[1] * v[1] + m.col2[1] * v[2],
        m.col0[2] * v[0] + m.col1[2] * v[1] + m.col2[2] * v[2],
    ]
}

fn get_raw_hsl_influence(hue: f32, center: f32, width: f32) -> f32 {
    let dist = (hue - center).abs().min(360.0 - (hue - center).abs());
    let sharpness = 1.5;
    let falloff = dist / (width * 0.5);
    (-sharpness * falloff * falloff).exp()
}

#[inline]
fn cpu_apply_hsl_panel(pix: &mut [f32], hsl: &[HslColor; 8]) {
    // match shader: apply_hsl_panel
    let safe = [pix[0].max(0.0), pix[1].max(0.0), pix[2].max(0.0)];
    if (safe[0] - safe[1]).abs() < 0.001 && (safe[1] - safe[2]).abs() < 0.001 {
        return;
    }
    let (orig_h, orig_s, orig_v) = cpu_rgb_to_hsv(&safe);
    let orig_luma = cpu_get_luma(&safe);

    let sat_mask = cpu_smoothstep(0.05, 0.20, orig_s);
    let lum_weight = cpu_smoothstep(0.0, 1.0, orig_s);
    if sat_mask < 0.001 && lum_weight < 0.001 {
        return;
    }

    const HSL_RANGES: [(f32, f32); 8] = [
        (358.0, 35.0), // Red
        (25.0, 45.0),  // Orange
        (60.0, 40.0),  // Yellow
        (115.0, 90.0), // Green
        (180.0, 60.0), // Aqua
        (225.0, 60.0), // Blue
        (280.0, 55.0), // Purple
        (330.0, 50.0), // Magenta
    ];

    let mut raw_inf = [0.0f32; 8];
    let mut total_raw = 0.0;
    for i in 0..8 {
        let inf = get_raw_hsl_influence(orig_h, HSL_RANGES[i].0, HSL_RANGES[i].1);
        raw_inf[i] = inf;
        total_raw += inf;
    }
    if total_raw < CPU_TINY_EPS {
        return;
    }

    let mut total_hue_shift = 0.0f32;
    let mut total_sat_mult = 0.0f32;
    let mut total_lum_adj = 0.0f32;

    for i in 0..8 {
        let ni = raw_inf[i] / total_raw;
        let hsi = ni * sat_mask;
        let li = ni * lum_weight;
        total_hue_shift += hsl[i].hue * 2.0 * hsi;
        total_sat_mult += hsl[i].saturation * hsi;
        total_lum_adj += hsl[i].luminance * li;
    }

    if orig_s * (1.0 + total_sat_mult) < 0.0001 {
        let final_lum = orig_luma * (1.0 + total_lum_adj);
        pix[0] = final_lum;
        pix[1] = final_lum;
        pix[2] = final_lum;
        return;
    }
    let nh = (orig_h + total_hue_shift + 360.0) % 360.0;
    let ns = (orig_s * (1.0 + total_sat_mult)).clamp(0.0, 1.0);
    let hs_rgb = cpu_hsv_to_rgb(nh, ns, orig_v);
    let new_luma = cpu_get_luma(&hs_rgb);
    let target_luma = orig_luma * (1.0 + total_lum_adj);
    if new_luma < 0.0001 {
        let t = target_luma.max(0.0);
        pix[0] = t;
        pix[1] = t;
        pix[2] = t;
        return;
    }
    let ratio = target_luma / new_luma;
    pix[0] = hs_rgb[0] * ratio;
    pix[1] = hs_rgb[1] * ratio;
    pix[2] = hs_rgb[2] * ratio;
}

fn cpu_apply_color_grading(
    pix: &mut [f32],
    shadows: &ColorGradeSettings,
    midtones: &ColorGradeSettings,
    highlights: &ColorGradeSettings,
    global: &ColorGradeSettings,
    blending: f32,
    balance: f32,
) {
    // match shader: apply_color_grading
    let safe = [pix[0].max(0.0), pix[1].max(0.0), pix[2].max(0.0)];
    let luma = cpu_get_luma(&safe);
    let base_shadow_crossover = 0.1;
    let base_highlight_crossover = 0.5;
    let balance_range = 0.5;
    let shadow_crossover = base_shadow_crossover + (-balance).max(0.0) * balance_range;
    let highlight_crossover = base_highlight_crossover - balance.max(0.0) * balance_range;
    let feather = 0.2 * blending;
    let final_shadow_crossover = shadow_crossover.min(highlight_crossover - 0.01);
    let shadow_mask = 1.0
        - cpu_smoothstep(
            final_shadow_crossover - feather,
            final_shadow_crossover + feather,
            luma,
        );
    let highlight_mask = cpu_smoothstep(
        highlight_crossover - feather,
        highlight_crossover + feather,
        luma,
    );
    let midtone_mask = (1.0 - shadow_mask - highlight_mask).max(0.0);
    let global_mask = 1.0;

    let mut gc = [pix[0], pix[1], pix[2]];
    let shadow_sat_s = 0.3f32;
    let shadow_lum_s = 0.5f32;
    let midtone_sat_s = 0.6f32;
    let midtone_lum_s = 0.8f32;
    let highlight_sat_s = 0.8f32;
    let highlight_lum_s = 1.0f32;
    let global_sat_s = 1.0f32;
    let global_lum_s = 1.0f32;

    // helper: apply grade with mask, sat_strength, lum_strength using setting.
    // Match GPU shader `apply_color_grading`: tint only applied for positive
    // saturation, hue is already in degrees [0,360] (same struct as GPU path).
    let apply_tint_sat =
        |gc: &mut [f32; 3], g: &ColorGradeSettings, mask: f32, sat_s: f32, lum_s: f32| {
            if g.saturation > 0.001 {
                let tint = cpu_hsv_to_rgb((g.hue + 360.0) % 360.0, 1.0, 1.0);
                for i in 0..3 {
                    gc[i] += (tint[i] - 0.5) * g.saturation * mask * sat_s;
                }
            }
            let l_adj = g.luminance * mask * lum_s;
            for i in 0..3 {
                gc[i] += l_adj;
            }
        };

    apply_tint_sat(&mut gc, shadows, shadow_mask, shadow_sat_s, shadow_lum_s);
    apply_tint_sat(
        &mut gc,
        midtones,
        midtone_mask,
        midtone_sat_s,
        midtone_lum_s,
    );
    apply_tint_sat(
        &mut gc,
        highlights,
        highlight_mask,
        highlight_sat_s,
        highlight_lum_s,
    );
    apply_tint_sat(&mut gc, global, global_mask, global_sat_s, global_lum_s);

    pix[0] = gc[0];
    pix[1] = gc[1];
    pix[2] = gc[2];
}

#[inline]
fn cpu_apply_vignette(
    pix: &mut [f32],
    x: u32,
    y: u32,
    w: u32,
    h: u32,
    amount: f32,
    midpoint: f32,
    roundness: f32,
    feather: f32,
) {
    if amount.abs() < CPU_TINY_EPS {
        return;
    }
    // Match GPU vignette: aspect-corrected with roundness power curve
    let aspect = h as f32 / w as f32;
    let uv_centered_x = ((x as f32 + 0.5) / w as f32 - 0.5) * 2.0;
    let uv_centered_y = ((y as f32 + 0.5) / h as f32 - 0.5) * 2.0;
    let v_round = 1.0 - roundness;
    let uv_round_x = cpu_sign(uv_centered_x) * uv_centered_x.abs().powf(v_round);
    let uv_round_y = cpu_sign(uv_centered_y) * uv_centered_y.abs().powf(v_round);
    let d = (uv_round_x * uv_round_x + (uv_round_y * aspect) * (uv_round_y * aspect)).sqrt() * 0.5;
    let v_feather = feather * 0.5;
    let vignette_mask = cpu_smoothstep(midpoint - v_feather, midpoint + v_feather, d);

    if amount < 0.0 {
        let factor = 1.0 + amount * vignette_mask;
        pix[0] *= factor;
        pix[1] *= factor;
        pix[2] *= factor;
    } else {
        for c in 0..3 {
            pix[c] = cpu_mix(pix[c], 1.0, amount * vignette_mask);
        }
    }
}

fn calculate_agx_matrices_glam_cpu() -> (GpuMat3, GpuMat3) {
    // Identity-compatible matrices — tonemap uses per-channel logistic curve.
    // Keep these roughly consistent with shader defaults.
    let pipe_to_rendering = GpuMat3 {
        col0: [1.0, 0.0, 0.0, 0.0],
        col1: [0.0, 1.0, 0.0, 0.0],
        col2: [0.0, 0.0, 1.0, 0.0],
    };
    let rendering_to_pipe = GpuMat3 {
        col0: [1.0, 0.0, 0.0, 0.0],
        col1: [0.0, 1.0, 0.0, 0.0],
        col2: [0.0, 0.0, 1.0, 0.0],
    };
    (pipe_to_rendering, rendering_to_pipe)
}

// AGX tonemap constants (matching GPU shader)
const AGX_EPSILON: f32 = 1.0e-6;
const AGX_MIN_EV: f32 = -15.2;
const AGX_MAX_EV: f32 = 5.0;
const AGX_RANGE_EV: f32 = AGX_MAX_EV - AGX_MIN_EV;
const AGX_GAMMA: f32 = 2.4;
const AGX_SLOPE: f32 = 2.3843;
const AGX_TOE_POWER: f32 = 1.5;
const AGX_SHOULDER_POWER: f32 = 1.5;
const AGX_TOE_TRANSITION_X: f32 = 0.6060606;
const AGX_TOE_TRANSITION_Y: f32 = 0.43446;
const AGX_SHOULDER_TRANSITION_X: f32 = 0.6060606;
const AGX_SHOULDER_TRANSITION_Y: f32 = 0.43446;
const AGX_INTERCEPT: f32 = -1.0112;
const AGX_TOE_SCALE: f32 = -1.0359;
const AGX_SHOULDER_SCALE: f32 = 1.3475;
const AGX_TARGET_BLACK_PRE_GAMMA: f32 = 0.0;
const AGX_TARGET_WHITE_PRE_GAMMA: f32 = 1.0;

#[inline]
fn agx_sigmoid(x: f32, power: f32) -> f32 {
    x / (1.0 + x.powf(power)).powf(1.0 / power)
}

#[inline]
fn agx_scaled_sigmoid(
    x: f32,
    scale: f32,
    slope: f32,
    power: f32,
    transition_x: f32,
    transition_y: f32,
) -> f32 {
    scale * agx_sigmoid(slope * (x - transition_x) / scale, power) + transition_y
}

#[inline]
fn agx_apply_curve_channel(x: f32) -> f32 {
    let result = if x < AGX_TOE_TRANSITION_X {
        agx_scaled_sigmoid(
            x,
            AGX_TOE_SCALE,
            AGX_SLOPE,
            AGX_TOE_POWER,
            AGX_TOE_TRANSITION_X,
            AGX_TOE_TRANSITION_Y,
        )
    } else if x <= AGX_SHOULDER_TRANSITION_X {
        AGX_SLOPE * x + AGX_INTERCEPT
    } else {
        agx_scaled_sigmoid(
            x,
            AGX_SHOULDER_SCALE,
            AGX_SLOPE,
            AGX_SHOULDER_POWER,
            AGX_SHOULDER_TRANSITION_X,
            AGX_SHOULDER_TRANSITION_Y,
        )
    };
    result.clamp(AGX_TARGET_BLACK_PRE_GAMMA, AGX_TARGET_WHITE_PRE_GAMMA)
}

#[inline]
fn agx_compress_gamut(c: [f32; 3]) -> [f32; 3] {
    let min_c = c[0].min(c[1]).min(c[2]);
    if min_c < 0.0 {
        [c[0] - min_c, c[1] - min_c, c[2] - min_c]
    } else {
        c
    }
}

#[inline]
fn agx_tonemap(c: [f32; 3]) -> [f32; 3] {
    let x_relative = [
        (c[0] / 0.18).max(AGX_EPSILON),
        (c[1] / 0.18).max(AGX_EPSILON),
        (c[2] / 0.18).max(AGX_EPSILON),
    ];
    let log_encoded = [
        (x_relative[0].log2() - AGX_MIN_EV) / AGX_RANGE_EV,
        (x_relative[1].log2() - AGX_MIN_EV) / AGX_RANGE_EV,
        (x_relative[2].log2() - AGX_MIN_EV) / AGX_RANGE_EV,
    ];
    let mapped = [
        log_encoded[0].clamp(0.0, 1.0),
        log_encoded[1].clamp(0.0, 1.0),
        log_encoded[2].clamp(0.0, 1.0),
    ];
    let curved = [
        agx_apply_curve_channel(mapped[0]),
        agx_apply_curve_channel(mapped[1]),
        agx_apply_curve_channel(mapped[2]),
    ];
    [
        curved[0].max(0.0).powf(AGX_GAMMA),
        curved[1].max(0.0).powf(AGX_GAMMA),
        curved[2].max(0.0).powf(AGX_GAMMA),
    ]
}

fn cpu_apply_agx_tonemap_to_pixel(
    pix: &mut [f32],
    pipe_to_rendering: &GpuMat3,
    rendering_to_pipe: &GpuMat3,
) {
    // Match GPU agx_full_transform: compress → transform → tonemap → inverse transform
    let compressed = agx_compress_gamut([pix[0], pix[1], pix[2]]);
    let in_agx_space = cpu_mat3_mul_vec3(pipe_to_rendering, &compressed);
    let tonemapped = agx_tonemap(in_agx_space);
    let final_col = cpu_mat3_mul_vec3(rendering_to_pipe, &tonemapped);
    pix[0] = final_col[0].clamp(0.0, 1.0);
    pix[1] = final_col[1].clamp(0.0, 1.0);
    pix[2] = final_col[2].clamp(0.0, 1.0);
}

fn cpu_apply_basic_tonemap_for_raw(pix: &mut [f32]) {
    // Match GPU raw processing: linear_to_srgb + brightness gamma + contrast curve
    cpu_linear_to_srgb_vec3(pix);
    const BRIGHTNESS_GAMMA: f32 = 1.1;
    const CONTRAST_MIX: f32 = 0.75;
    for c in 0..3 {
        let srgb_val = pix[c];
        let gamma_adjusted = srgb_val.max(0.0).powf(1.0 / BRIGHTNESS_GAMMA);
        let contrast_curve = gamma_adjusted * gamma_adjusted * (3.0 - 2.0 * gamma_adjusted);
        pix[c] = cpu_mix(gamma_adjusted, contrast_curve, CONTRAST_MIX);
    }
}

fn cpu_hermite_interp(points: &[Point], count: u32, x: f32) -> f32 {
    if count < 2 {
        return x;
    }
    let pts: Vec<&Point> = points.iter().take(count as usize).collect();
    // Normalize input from [0,1] to [0,255] to match the curve point coordinate space
    let x_norm = x * 255.0;
    if x_norm <= pts[0].x {
        return pts[0].y / 255.0;
    }
    if x_norm >= pts[pts.len() - 1].x {
        return pts[pts.len() - 1].y / 255.0;
    }
    for i in 0..pts.len() - 1 {
        let p1 = pts[i];
        let p2 = pts[i + 1];
        if x_norm <= p2.x {
            let dx = p2.x - p1.x;
            if dx <= CPU_TINY_EPS {
                return p1.y / 255.0;
            }
            let t = (x_norm - p1.x) / dx;
            let t2 = t * t;
            let t3 = t2 * t;
            // Catmull-Rom tangent calculation (matching GPU apply_curve)
            let p0 = if i > 0 { pts[i - 1] } else { p1 };
            let p3 = if i + 2 < pts.len() { pts[i + 2] } else { p2 };
            let delta_before = (p1.y - p0.y) / (p1.x - p0.x).max(0.001);
            let delta_current = (p2.y - p1.y) / (p2.x - p1.x).max(0.001);
            let delta_after = (p3.y - p2.y) / (p3.x - p2.x).max(0.001);
            let tangent_at_p1 = if i == 0 {
                delta_current
            } else if delta_before * delta_current <= 0.0 {
                0.0
            } else {
                (delta_before + delta_current) / 2.0
            };
            let tangent_at_p2 = if i + 1 == pts.len() - 1 {
                delta_current
            } else if delta_current * delta_after <= 0.0 {
                0.0
            } else {
                (delta_current + delta_after) / 2.0
            };
            // Monotonicity constraint (matching GPU)
            let (mut m1, mut m2) = (tangent_at_p1, tangent_at_p2);
            if delta_current != 0.0 {
                let alpha = m1 / delta_current;
                let beta = m2 / delta_current;
                let alpha2_beta2 = alpha * alpha + beta * beta;
                if alpha2_beta2 > 9.0 {
                    let tau = 3.0 / alpha2_beta2.sqrt();
                    m1 *= tau;
                    m2 *= tau;
                }
            }
            // Hermite interpolation (matching GPU interpolate_cubic_hermite)
            let h00 = 2.0 * t3 - 3.0 * t2 + 1.0;
            let h10 = t3 - 2.0 * t2 + t;
            let h01 = -2.0 * t3 + 3.0 * t2;
            let h11 = t3 - t2;
            let result_y = h00 * p1.y + h10 * m1 * dx + h01 * p2.y + h11 * m2 * dx;
            // Denormalize output from [0,255] back to [0,1]
            return (result_y / 255.0).clamp(0.0, 1.0);
        }
    }
    pts[pts.len() - 1].y / 255.0
}

#[inline]
fn cpu_is_default_curve(points: &[Point], count: u32) -> bool {
    if count < 2 {
        return false;
    }
    let pts: Vec<&Point> = points.iter().take(count as usize).collect();
    let mut is_identity = true;
    for p in &pts {
        if (p.x - p.y).abs() > 0.5 {
            is_identity = false;
            break;
        }
    }
    let p0 = pts[0];
    let p_last = pts[pts.len() - 1];
    let p0_is_origin = p0.x.abs() < 0.1 && p0.y.abs() < 0.1;
    let p_last_is_end = (p_last.x - 255.0).abs() < 0.1 && (p_last.y - 255.0).abs() < 0.1;
    is_identity && p0_is_origin && p_last_is_end
}

#[inline]
fn cpu_apply_all_curves(
    pix: &mut [f32],
    luma_curve: &[Point],
    luma_count: u32,
    red_curve: &[Point],
    red_count: u32,
    green_curve: &[Point],
    green_count: u32,
    blue_curve: &[Point],
    blue_count: u32,
) {
    let red_is_default = cpu_is_default_curve(red_curve, red_count);
    let green_is_default = cpu_is_default_curve(green_curve, green_count);
    let blue_is_default = cpu_is_default_curve(blue_curve, blue_count);
    let rgb_curves_are_active = !red_is_default || !green_is_default || !blue_is_default;

    if rgb_curves_are_active {
        // Apply RGB curves
        let color_graded = [
            cpu_hermite_interp(red_curve, red_count, pix[0]),
            cpu_hermite_interp(green_curve, green_count, pix[1]),
            cpu_hermite_interp(blue_curve, blue_count, pix[2]),
        ];
        // Luma correction (matching GPU apply_all_curves)
        let luma_initial = cpu_get_luma(pix);
        let luma_target = cpu_hermite_interp(luma_curve, luma_count, luma_initial);
        let luma_graded = cpu_get_luma(&color_graded);
        if luma_graded > 0.001 {
            let ratio = luma_target / luma_graded;
            pix[0] = color_graded[0] * ratio;
            pix[1] = color_graded[1] * ratio;
            pix[2] = color_graded[2] * ratio;
        } else {
            pix[0] = luma_target;
            pix[1] = luma_target;
            pix[2] = luma_target;
        }
        // Normalize if > 1.0
        let max_comp = pix[0].max(pix[1]).max(pix[2]);
        if max_comp > 1.0 {
            let inv = 1.0 / max_comp;
            pix[0] *= inv;
            pix[1] *= inv;
            pix[2] *= inv;
        }
    } else {
        // Only apply luma curve to all channels
        pix[0] = cpu_hermite_interp(luma_curve, luma_count, pix[0]);
        pix[1] = cpu_hermite_interp(luma_curve, luma_count, pix[1]);
        pix[2] = cpu_hermite_interp(luma_curve, luma_count, pix[2]);
    }
    for c in 0..3 {
        pix[c] = pix[c].clamp(0.0, 1.0);
    }
}

// Grain noise helpers (matching GPU gradient_noise + hash)
#[inline]
fn cpu_grain_hash(px: f32, py: f32) -> f32 {
    // Match GPU hash: fract(vec3(p.xyx) * 0.1031), then fract((p3.x + p3.y) * p3.z)
    let p3x = (px * 0.1031).fract();
    let p3y = (py * 0.1031).fract();
    let p3z = (px * 0.1031).fract(); // p.xyx: [px, py, px]
    let d = p3x * (p3y + 33.33) + p3y * (p3z + 33.33) + p3z * (p3x + 33.33);
    let p3x = p3x + d;
    let p3y = p3y + d;
    let p3z = p3z + d;
    ((p3x + p3y) * p3z).fract()
}

#[inline]
fn cpu_gradient_noise(px: f32, py: f32) -> f32 {
    // Match GPU gradient_noise: Perlin-like with quintic interpolation
    let ix = px.floor();
    let iy = py.floor();
    let fx = px - ix;
    let fy = py - iy;
    let ux = fx * fx * fx * (fx * (fx * 6.0 - 15.0) + 10.0);
    let uy = fy * fy * fy * (fy * (fy * 6.0 - 15.0) + 10.0);

    // Gradient vectors at corners (matching GPU: hash + offset for gradient direction)
    let ga = [
        cpu_grain_hash(ix, iy) * 2.0 - 1.0,
        cpu_grain_hash(ix + 11.0, iy + 37.0) * 2.0 - 1.0,
    ];
    let gb = [
        cpu_grain_hash(ix + 1.0, iy) * 2.0 - 1.0,
        cpu_grain_hash(ix + 1.0 + 11.0, iy + 37.0) * 2.0 - 1.0,
    ];
    let gc = [
        cpu_grain_hash(ix, iy + 1.0) * 2.0 - 1.0,
        cpu_grain_hash(ix + 11.0, iy + 1.0 + 37.0) * 2.0 - 1.0,
    ];
    let gd = [
        cpu_grain_hash(ix + 1.0, iy + 1.0) * 2.0 - 1.0,
        cpu_grain_hash(ix + 1.0 + 11.0, iy + 1.0 + 37.0) * 2.0 - 1.0,
    ];

    let dot_00 = ga[0] * fx + ga[1] * fy;
    let dot_10 = gb[0] * (fx - 1.0) + gb[1] * fy;
    let dot_01 = gc[0] * fx + gc[1] * (fy - 1.0);
    let dot_11 = gd[0] * (fx - 1.0) + gd[1] * (fy - 1.0);

    let bottom = cpu_mix(dot_00, dot_10, ux);
    let top = cpu_mix(dot_01, dot_11, ux);
    cpu_mix(bottom, top, uy)
}

fn cpu_apply_grain(
    pix: &mut [f32],
    x: u32,
    y: u32,
    _w: u32,
    _h: u32,
    amount: f32,
    size: f32,
    roughness: f32,
    scale: f32,
) {
    if amount.abs() < CPU_TINY_EPS {
        return;
    }
    // Match GPU grain: gradient noise with luma mask
    let grain_amount = amount * 0.5;
    let grain_frequency = (1.0 / size.max(0.1)) / scale;
    let luma = cpu_get_luma(pix).max(0.0);
    let luma_mask = cpu_smoothstep(0.0, 0.15, luma) * (1.0 - cpu_smoothstep(0.6, 1.0, luma));

    let base_x = x as f32 * grain_frequency;
    let base_y = y as f32 * grain_frequency;
    let noise_base = cpu_gradient_noise(base_x, base_y);
    let noise_rough = cpu_gradient_noise(base_x * 0.6 + 5.2, base_y * 0.6 + 1.3);
    let noise_val = cpu_mix(noise_base, noise_rough, roughness);

    pix[0] += noise_val * grain_amount * luma_mask;
    pix[1] += noise_val * grain_amount * luma_mask;
    pix[2] += noise_val * grain_amount * luma_mask;
}

/// Validate image dimensions for safe processing.
#[deprecated = "Use module-level validate_image_dimensions directly"]
pub fn validate_image_dimensions_public(width: u32, height: u32) -> Result<(), String> {
    validate_image_dimensions(width, height)
}

/// CPU implementation of chromatic aberration correction.
/// Shifts the R and B channels radially from the image centre, matching
/// the GPU shader's `apply_ca_correction`.
fn cpu_apply_ca_correction(image: &mut Rgb32FImage, ca_rc: f32, ca_by: f32) {
    if ca_rc.abs() < 0.000001 && ca_by.abs() < 0.000001 {
        return;
    }
    let (w, h) = image.dimensions();
    let center_x = w as f32 / 2.0;
    let center_y = h as f32 / 2.0;
    let original = image.clone();
    let w_i = w as i32;
    let h_i = h as i32;
    let w_us = w as usize;

    image
        .as_flat_samples_mut()
        .as_mut_slice()
        .par_chunks_mut(3)
        .enumerate()
        .for_each(|(idx, px)| {
            let x = (idx % w_us) as i32;
            let y = (idx / w_us) as i32;
            let pos_x = x as f32;
            let pos_y = y as f32;
            let to_center_x = pos_x - center_x;
            let to_center_y = pos_y - center_y;
            let dist = (to_center_x * to_center_x + to_center_y * to_center_y).sqrt();
            if dist < 0.5 {
                return;
            }
            let dir_x = to_center_x / dist;
            let dir_y = to_center_y / dist;

            let red_shift = dist * ca_rc;
            let blue_shift = dist * ca_by;

            let rx = (pos_x - dir_x * red_shift).round() as i32;
            let ry = (pos_y - dir_y * red_shift).round() as i32;
            let bx = (pos_x - dir_x * blue_shift).round() as i32;
            let by = (pos_y - dir_y * blue_shift).round() as i32;

            let rx = rx.clamp(0, w_i - 1) as u32;
            let ry = ry.clamp(0, h_i - 1) as u32;
            let bx = bx.clamp(0, w_i - 1) as u32;
            let by = by.clamp(0, h_i - 1) as u32;

            px[0] = original.get_pixel(rx, ry)[0];
            px[2] = original.get_pixel(bx, by)[2];
        });
}

/// CPU implementation of noise reduction.
/// Simplified bilateral-like filter matching the GPU shader's
/// `apply_noise_reduction`. Uses a 5×5 neighbourhood with luma and
/// chroma separation.
fn cpu_apply_noise_reduction_pass(
    image: &mut Rgb32FImage,
    luma_amount: f32,
    color_amount: f32,
    scale: f32,
    is_raw: bool,
) {
    let luma_a = luma_amount.clamp(0.0, 1.0);
    let color_a = color_amount.clamp(0.0, 1.0);
    if luma_a < 0.001 && color_a < 0.001 {
        return;
    }

    let (w, h) = image.dimensions();
    let original = image.clone();
    let w_i = w as i32;
    let h_i = h as i32;
    let w_us = w as usize;
    let res_factor = scale.sqrt().clamp(0.5, 2.0);

    let l_curve = luma_a.sqrt();
    let l_spatial = cpu_mix(1.0, 1.5, l_curve);
    let l_spat_n = -1.0 / (2.0 * l_spatial * l_spatial).max(1e-6);

    let c_curve = color_a.sqrt();
    let c_spatial = cpu_mix(1.0, 1.5, c_curve);
    let c_spat_n = -1.0 / (2.0 * c_spatial * c_spatial).max(1e-6);

    let _ = is_raw;

    image
        .as_flat_samples_mut()
        .as_mut_slice()
        .par_chunks_mut(3)
        .enumerate()
        .for_each(|(idx, px)| {
            let xi = (idx % w_us) as i32;
            let yi = (idx / w_us) as i32;
            let center_luma = cpu_get_luma(px);
            let center_chroma_r = px[0] - center_luma;
            let center_chroma_g = px[1] - center_luma;
            let center_chroma_b = px[2] - center_luma;

            let mut new_luma = center_luma;
            let mut new_chroma_r = center_chroma_r;
            let mut new_chroma_g = center_chroma_g;
            let mut new_chroma_b = center_chroma_b;

            if luma_a > 0.001 {
                let mut luma_sum = center_luma;
                let mut weight_sum = 1.0_f32;
                let stride_f =
                    cpu_mix(1.0, 2.0, ((luma_a - 0.45) / 0.5).clamp(0.0, 1.0)) * res_factor;
                let stride = stride_f.round().max(1.0) as i32;

                for dy in -2..=2 {
                    for dx in -2..=2 {
                        if dx == 0 && dy == 0 {
                            continue;
                        }
                        let sx = (xi + dx * stride).clamp(0, w_i - 1) as u32;
                        let sy = (yi + dy * stride).clamp(0, h_i - 1) as u32;
                        let s = original.get_pixel(sx, sy);
                        let s_luma = cpu_get_luma(&[s[0], s[1], s[2]]);
                        let spatial_dist = (dx * dx + dy * dy) as f32;
                        let spatial_w = (spatial_dist * l_spat_n).exp();
                        let luma_diff = s_luma - center_luma;
                        let range_w = (-luma_diff * luma_diff * (l_curve * 8.0 + 0.5)).exp();
                        let wt = spatial_w * range_w;
                        luma_sum += s_luma * wt;
                        weight_sum += wt;
                    }
                }
                new_luma = luma_sum / weight_sum;
            }

            if color_a > 0.001 {
                let mut chr_sum = [center_chroma_r, center_chroma_g, center_chroma_b];
                let mut weight_sum = 1.0_f32;
                let stride = 1_i32;

                for dy in -2..=2 {
                    for dx in -2..=2 {
                        if dx == 0 && dy == 0 {
                            continue;
                        }
                        let sx = (xi + dx * stride).clamp(0, w_i - 1) as u32;
                        let sy = (yi + dy * stride).clamp(0, h_i - 1) as u32;
                        let s = original.get_pixel(sx, sy);
                        let s_luma = cpu_get_luma(&[s[0], s[1], s[2]]);
                        let s_chr = [s[0] - s_luma, s[1] - s_luma, s[2] - s_luma];
                        let spatial_dist = (dx * dx + dy * dy) as f32;
                        let spatial_w = (spatial_dist * c_spat_n).exp();
                        let chr_dist = (s_chr[0] - center_chroma_r).powi(2)
                            + (s_chr[1] - center_chroma_g).powi(2)
                            + (s_chr[2] - center_chroma_b).powi(2);
                        let range_w = (-chr_dist * (c_curve * 4.0 + 0.5)).exp();
                        let wt = spatial_w * range_w;
                        chr_sum[0] += s_chr[0] * wt;
                        chr_sum[1] += s_chr[1] * wt;
                        chr_sum[2] += s_chr[2] * wt;
                        weight_sum += wt;
                    }
                }
                new_chroma_r = chr_sum[0] / weight_sum;
                new_chroma_g = chr_sum[1] / weight_sum;
                new_chroma_b = chr_sum[2] / weight_sum;
            }

            px[0] = (new_luma + new_chroma_r).max(0.0);
            px[1] = (new_luma + new_chroma_g).max(0.0);
            px[2] = (new_luma + new_chroma_b).max(0.0);
        });
}

/// CPU implementation of glow/bloom effect.
/// Matches the GPU shader's `apply_glow_bloom`.
#[inline]
fn cpu_apply_glow_bloom(
    pix: &mut [f32],
    blurred: &[f32],
    amount: f32,
    is_raw: bool,
    exp: f32,
    bright: f32,
    _con: f32,
    wh: f32,
) {
    if amount <= 0.0 {
        return;
    }

    let mut blurred_linear = [blurred[0], blurred[1], blurred[2]];
    if !is_raw {
        cpu_srgb_to_linear_vec3(&mut blurred_linear);
    }

    cpu_apply_linear_exposure(&mut blurred_linear, exp);
    cpu_apply_filmic_exposure(&mut blurred_linear, bright);
    // cpu_apply_tonal_adjustments takes luma (f32), not RGB — compute luma
    // from the input-space blurred color to match the GPU shader behaviour.
    let blurred_luma = cpu_get_luma(blurred);
    cpu_apply_tonal_adjustments(&mut blurred_linear, blurred_luma, 0.0, 0.0, wh, 0.0);

    let linear_luma = cpu_get_luma(&blurred_linear).max(0.0);

    let perceptual_luma = if linear_luma <= 1.0 {
        linear_luma.max(0.0).powf(1.0 / 2.2)
    } else {
        1.0 + (linear_luma - 1.0).powf(1.0 / 2.2)
    };

    let luma_cutoff = cpu_mix(0.75, 0.08, amount.clamp(0.0, 1.0));
    let cutoff_fade = cpu_smoothstep(luma_cutoff, luma_cutoff + 0.15, perceptual_luma);
    let excess = (perceptual_luma - luma_cutoff).max(0.0);
    let normalized = excess / 5.5;
    let bloom_intensity = cpu_smoothstep(0.0, 1.0, normalized).powf(0.45);

    let bloom_color = if linear_luma > 0.01 {
        let ratio = [
            blurred_linear[0] / linear_luma,
            blurred_linear[1] / linear_luma,
            blurred_linear[2] / linear_luma,
        ];
        [ratio[0] * 1.03, ratio[1] * 1.0, ratio[2] * 0.97]
    } else {
        [1.0, 0.99, 0.98]
    };

    let luma_factor = linear_luma.powf(0.6);
    let black_gate = cpu_smoothstep(0.0, 0.5, linear_luma).powf(0.5);

    let bloom_r = bloom_color[0] * bloom_intensity * luma_factor * cutoff_fade * black_gate;
    let bloom_g = bloom_color[1] * bloom_intensity * luma_factor * cutoff_fade * black_gate;
    let bloom_b = bloom_color[2] * bloom_intensity * luma_factor * cutoff_fade * black_gate;

    let current_luma = cpu_get_luma(pix).max(0.0);
    let protection = 1.0 - cpu_smoothstep(1.0, 2.2, current_luma);

    pix[0] += bloom_r * amount * 3.8 * protection;
    pix[1] += bloom_g * amount * 3.8 * protection;
    pix[2] += bloom_b * amount * 3.8 * protection;
}

/// CPU implementation of halation effect.
/// Matches the GPU shader's `apply_halation`.
#[inline]
fn cpu_apply_halation(
    pix: &mut [f32],
    blurred: &[f32],
    amount: f32,
    is_raw: bool,
    exp: f32,
    bright: f32,
    _con: f32,
    wh: f32,
) {
    if amount <= 0.0 {
        return;
    }

    let mut blurred_linear = [blurred[0], blurred[1], blurred[2]];
    if !is_raw {
        cpu_srgb_to_linear_vec3(&mut blurred_linear);
    }

    cpu_apply_linear_exposure(&mut blurred_linear, exp);
    cpu_apply_filmic_exposure(&mut blurred_linear, bright);
    let blurred_luma = cpu_get_luma(blurred);
    cpu_apply_tonal_adjustments(&mut blurred_linear, blurred_luma, 0.0, 0.0, wh, 0.0);

    let linear_luma = cpu_get_luma(&blurred_linear).max(0.0);

    let perceptual_luma = if linear_luma <= 1.0 {
        linear_luma.max(0.0).powf(1.0 / 2.2)
    } else {
        1.0 + (linear_luma - 1.0).powf(1.0 / 2.2)
    };

    let luma_cutoff = cpu_mix(0.85, 0.1, amount.clamp(0.0, 1.0));
    if perceptual_luma <= luma_cutoff {
        return;
    }

    let excess = perceptual_luma - luma_cutoff;
    let range = (1.5 - luma_cutoff).max(0.1);
    let halation_mask = cpu_smoothstep(0.0, range * 0.6, excess);

    let halation_core = [1.0, 0.15, 0.03];
    let halation_fringe = [1.0, 0.32, 0.10];

    let intensity_blend = cpu_smoothstep(0.0, 0.7, halation_mask);
    let halation_tint = [
        cpu_mix(halation_fringe[0], halation_core[0], intensity_blend),
        cpu_mix(halation_fringe[1], halation_core[1], intensity_blend),
        cpu_mix(halation_fringe[2], halation_core[2], intensity_blend),
    ];

    let glow_intensity = halation_mask * linear_luma;

    let color_luma = cpu_get_luma(pix).max(0.0);
    let desat_strength = halation_mask * 0.12;
    let affected_r = cpu_mix(pix[0], color_luma, desat_strength);
    let affected_g = cpu_mix(pix[1], color_luma, desat_strength);
    let affected_b = cpu_mix(pix[2], color_luma, desat_strength);

    let contrast_factor = 1.0 - halation_mask * 0.06;
    let contrast_r = cpu_mix(0.5, affected_r, contrast_factor);
    let contrast_g = cpu_mix(0.5, affected_g, contrast_factor);
    let contrast_b = cpu_mix(0.5, affected_b, contrast_factor);

    pix[0] = contrast_r + halation_tint[0] * glow_intensity * amount * 2.5;
    pix[1] = contrast_g + halation_tint[1] * glow_intensity * amount * 2.5;
    pix[2] = contrast_b + halation_tint[2] * glow_intensity * amount * 2.5;
}

/// CPU implementation of lens flare effect.
/// Matches the GPU shader's flare application. The GPU samples a flare
/// texture; on CPU we use a procedural radial flare model centred on the
/// image, which approximates the texture-based bloom for the fallback path.
#[inline]
fn cpu_apply_lens_flare(pix: &mut [f32], x: usize, y: usize, w: usize, h: usize, amount: f32) {
    if amount <= 0.0 {
        return;
    }

    // Procedural flare: radial falloff from image centre.
    let cx = w as f32 / 2.0;
    let cy = h as f32 / 2.0;
    let dx = x as f32 - cx;
    let dy = y as f32 - cy;
    let dist = (dx * dx + dy * dy).sqrt();
    let max_dist = (cx * cx + cy * cy).sqrt().max(1.0);
    let norm_dist = dist / max_dist;

    // Flare intensity: bright near centre, falls off with distance.
    let flare_intensity = (1.0 - norm_dist).max(0.0).powf(2.0);

    // Flare color: warm white with slight tint, matching the GPU texture's
    // typical warm optical flare appearance.
    let flare_color = [1.0 * 1.4, 0.95 * 1.4, 0.85 * 1.4];
    let flare_r = flare_color[0] * flare_color[0];
    let flare_g = flare_color[1] * flare_color[1];
    let flare_b = flare_color[2] * flare_color[2];

    // High-light protection: reduce flare on already-bright pixels.
    let linear_luma = cpu_get_luma(pix).max(0.0);
    let perceptual_luma = if linear_luma <= 1.0 {
        linear_luma.powf(1.0 / 2.2)
    } else {
        1.0 + (linear_luma - 1.0).powf(1.0 / 2.2)
    };
    let protection = 1.0 - cpu_smoothstep(0.7, 1.8, perceptual_luma);

    pix[0] += flare_r * flare_intensity * amount * protection;
    pix[1] += flare_g * flare_intensity * amount * protection;
    pix[2] += flare_b * flare_intensity * amount * protection;
}

/// Apply the full color-adjustment pipeline on the CPU.
/// This is the Android / no-GPU fallback path.
pub fn apply_cpu_color_adjustments(image: &mut DynamicImage, adjustments: &AllAdjustments) {
    let (width, height) = image.dimensions();
    if let Err(e) = validate_image_dimensions(width, height) {
        log::warn!("Skipping CPU color adjustments: {}", e);
        return;
    }

    let is_raw = adjustments.global.is_raw_image != 0;
    let scale = (width.min(height) as f32) / 1080.0;

    // Convert to RGB32F for processing.
    let mut f32_image = image.to_rgb32f();
    let w = f32_image.width() as usize;
    let h = f32_image.height() as usize;

    // Chromatic aberration correction (before sRGB→linear, matching GPU shader
    // which applies CA on the raw texture load).
    cpu_apply_ca_correction(
        &mut f32_image,
        adjustments.global.chromatic_aberration_red_cyan,
        adjustments.global.chromatic_aberration_blue_yellow,
    );

    // Convert sRGB → linear for non-RAW images, matching the GPU pipeline
    // (shader: `initial_linear_rgb = srgb_to_linear(color_from_texture)`).
    // Without this, all adjustments run in sRGB space and the final
    // `cpu_linear_to_srgb_vec3` tonemapping step double-converts, washing
    // out color changes so they appear to have no effect.
    //
    // NOTE: image 0.25 has no `as_raw_mut()` (added in 0.26+). Use
    // `as_flat_samples_mut().as_mut_slice()` for a mutable view of the
    // underlying contiguous sample buffer.
    if !is_raw {
        f32_image
            .as_flat_samples_mut()
            .as_mut_slice()
            .par_chunks_mut(3)
            .for_each(|pix| {
                cpu_srgb_to_linear_vec3(pix);
            });
    }

    // Noise reduction (after sRGB→linear, before local contrast — matching
    // the GPU shader pipeline order).
    cpu_apply_noise_reduction_pass(
        &mut f32_image,
        adjustments.global.luma_noise_reduction,
        adjustments.global.color_noise_reduction,
        scale,
        is_raw,
    );

    // Build luma buffer from linear RGB.
    let mut luma_buffer: Vec<f32> = vec![0.0; w * h];
    f32_image
        .as_raw()
        .par_chunks(3)
        .zip(luma_buffer.par_iter_mut())
        .for_each(|(pix, luma)| {
            *luma = cpu_get_luma(pix);
        });

    let (sharpness_blur, tonal_blur, clarity_blur, structure_blur) =
        cpu_create_blur_luma_buffers(&luma_buffer, w, h, scale.max(0.1));

    // Build RGB blur buffers for glow/halation when needed.
    // These are only created if glow_amount or halation_amount > 0 to avoid
    // unnecessary memory allocation on the common path.
    let g_ref = &adjustments.global;
    let needs_glow_rgb = g_ref.glow_amount > 0.0 || g_ref.halation_amount > 0.0;
    let (structure_blur_rgb, clarity_blur_rgb) = if needs_glow_rgb {
        (
            cpu_create_blur_rgb_buffer(f32_image.as_raw(), w, h, scale.max(0.1)),
            cpu_create_blur_rgb_buffer(f32_image.as_raw(), w, h, scale.max(0.1) * 0.7),
        )
    } else {
        (Vec::new(), Vec::new())
    };

    let g = &adjustments.global;
    let (pipe_to_rendering, rendering_to_pipe) = calculate_agx_matrices_glam_cpu();

    f32_image
        .par_chunks_mut(3)
        .enumerate()
        .for_each(|(idx, pix)| {
            let x = (idx % w) as u32;
            let y = (idx / w) as u32;
            let _luma = luma_buffer[idx];
            let s_blur = sharpness_blur[idx];
            let t_blur = tonal_blur[idx];
            let c_blur = clarity_blur[idx];
            let st_blur = structure_blur[idx];

            // Sharpness / clarity / structure / centre local contrast.
            cpu_apply_local_contrast(pix, s_blur, g.sharpness, is_raw, 0, g.sharpness_threshold);
            cpu_apply_local_contrast(pix, c_blur, g.clarity, is_raw, 1, 0.0);
            cpu_apply_local_contrast(pix, st_blur, g.structure, is_raw, 1, 0.0);
            cpu_apply_centre_local_contrast(pix, g.centre, x, y, width, height, c_blur, is_raw);

            // Exposure.
            cpu_apply_linear_exposure(pix, g.exposure);

            // Glow / bloom (after exposure, before dehaze — matching GPU shader).
            if g.glow_amount > 0.0 {
                let st_blur_rgb = &structure_blur_rgb[idx * 3..idx * 3 + 3];
                cpu_apply_glow_bloom(
                    pix,
                    st_blur_rgb,
                    g.glow_amount,
                    is_raw,
                    g.exposure,
                    g.brightness,
                    g.contrast,
                    g.whites,
                );
            }

            // Halation (after glow, before dehaze — matching GPU shader).
            if g.halation_amount > 0.0 {
                let c_blur_rgb = &clarity_blur_rgb[idx * 3..idx * 3 + 3];
                cpu_apply_halation(
                    pix,
                    c_blur_rgb,
                    g.halation_amount,
                    is_raw,
                    g.exposure,
                    g.brightness,
                    g.contrast,
                    g.whites,
                );
            }

            // Lens flare (after halation, before dehaze — matching GPU shader).
            if g.flare_amount > 0.0 {
                cpu_apply_lens_flare(pix, x as usize, y as usize, w, h, g.flare_amount);
            }

            // Dehaze.
            cpu_apply_dehaze(pix, st_blur, g.dehaze);

            // Centre tonal & color.
            cpu_apply_centre_tonal_and_color(pix, g.centre, x, y, width, height);

            // White balance.
            cpu_apply_white_balance(pix, g.temperature, g.tint);

            // Brightness (filmic exposure).
            cpu_apply_filmic_exposure(pix, g.brightness);

            // Tonal adjustments (contrast, shadows, whites, blacks).
            cpu_apply_tonal_adjustments(pix, t_blur, g.contrast, g.shadows, g.whites, g.blacks);

            // Highlights.
            cpu_apply_highlights_adjustment(pix, t_blur, g.highlights);

            // Color calibration.
            cpu_apply_color_calibration(pix, &g.color_calibration);

            // HSL.
            cpu_apply_hsl_panel(pix, &g.hsl);

            // Hue shift.
            cpu_apply_hue_shift(pix, g.hue);

            // Saturation / vibrance.
            cpu_apply_creative_color(pix, g.saturation, g.vibrance);

            // Color grading.
            cpu_apply_color_grading(
                pix,
                &g.color_grading_shadows,
                &g.color_grading_midtones,
                &g.color_grading_highlights,
                &g.color_grading_global,
                g.color_grading_blending,
                g.color_grading_balance,
            );

            // Vignette.
            cpu_apply_vignette(
                pix,
                x,
                y,
                width,
                height,
                g.vignette_amount,
                g.vignette_midpoint,
                g.vignette_roundness,
                g.vignette_feather,
            );

            // Tonemap.
            if g.tonemapper_mode > 0.5 {
                cpu_apply_agx_tonemap_to_pixel(pix, &pipe_to_rendering, &rendering_to_pipe);
            } else if is_raw {
                cpu_apply_basic_tonemap_for_raw(pix);
            } else {
                cpu_linear_to_srgb_vec3(pix);
            }

            // Curves.
            cpu_apply_all_curves(
                pix,
                &g.luma_curve,
                g.luma_curve_count,
                &g.red_curve,
                g.red_curve_count,
                &g.green_curve,
                g.green_curve_count,
                &g.blue_curve,
                g.blue_curve_count,
            );

            // Grain.
            cpu_apply_grain(
                pix,
                x,
                y,
                width,
                height,
                g.grain_amount,
                g.grain_size,
                g.grain_roughness,
                scale,
            );

            // Clamp.
            pix[0] = pix[0].clamp(0.0, 1.0);
            pix[1] = pix[1].clamp(0.0, 1.0);
            pix[2] = pix[2].clamp(0.0, 1.0);
        });

    *image = DynamicImage::ImageRgb32F(f32_image);
}

/// Fast-path CPU color adjustments for interactive (slider drag) previews.
///
/// Skips expensive operations that are imperceptible at low resolution during
/// a quick drag: noise reduction, local contrast (sharpness/clarity/structure/
/// centre), glow/halation/lens flare, and grain. Also avoids creating blur
/// buffers entirely, which saves both allocation and computation.
///
/// All color-affecting adjustments (exposure, white balance, tonal, highlights,
/// HSL, color grading, curves, etc.) are still applied so the user sees an
/// accurate color response in real time. When the drag ends, the full
/// `apply_cpu_color_adjustments` runs to produce the final high-quality frame.
pub fn apply_cpu_color_adjustments_fast(image: &mut DynamicImage, adjustments: &AllAdjustments) {
    let (width, height) = image.dimensions();
    if let Err(e) = validate_image_dimensions(width, height) {
        log::warn!("Skipping CPU fast color adjustments: {}", e);
        return;
    }

    let is_raw = adjustments.global.is_raw_image != 0;

    // Convert to RGB32F for processing.
    let mut f32_image = image.to_rgb32f();

    // Chromatic aberration correction (cheap, applied before sRGB→linear).
    cpu_apply_ca_correction(
        &mut f32_image,
        adjustments.global.chromatic_aberration_red_cyan,
        adjustments.global.chromatic_aberration_blue_yellow,
    );

    // Convert sRGB → linear for non-RAW images (matching full pipeline).
    if !is_raw {
        f32_image
            .as_flat_samples_mut()
            .as_mut_slice()
            .par_chunks_mut(3)
            .for_each(|pix| {
                cpu_srgb_to_linear_vec3(pix);
            });
    }

    let g = &adjustments.global;
    let (pipe_to_rendering, rendering_to_pipe) = calculate_agx_matrices_glam_cpu();
    let img_w = f32_image.width() as usize;

    // Single-pass pixel processing — no blur buffers needed.
    f32_image
        .par_chunks_mut(3)
        .enumerate()
        .for_each(|(idx, pix)| {
            let x = (idx % img_w) as u32;
            let y = (idx / img_w) as u32;

            // Exposure.
            cpu_apply_linear_exposure(pix, g.exposure);

            // Dehaze (simplified — no structure blur, use pixel luma directly).
            cpu_apply_dehaze(pix, cpu_get_luma(pix), g.dehaze);

            // Centre tonal & color.
            cpu_apply_centre_tonal_and_color(pix, g.centre, x, y, width, height);

            // White balance.
            cpu_apply_white_balance(pix, g.temperature, g.tint);

            // Brightness (filmic exposure).
            cpu_apply_filmic_exposure(pix, g.brightness);

            // Tonal adjustments (pass 0 for blur — detail preservation is
            // approximate but color response is accurate).
            cpu_apply_tonal_adjustments(pix, 0.0, g.contrast, g.shadows, g.whites, g.blacks);

            // Highlights (blur param is unused in the implementation).
            cpu_apply_highlights_adjustment(pix, 0.0, g.highlights);

            // Color calibration.
            cpu_apply_color_calibration(pix, &g.color_calibration);

            // HSL.
            cpu_apply_hsl_panel(pix, &g.hsl);

            // Hue shift.
            cpu_apply_hue_shift(pix, g.hue);

            // Saturation / vibrance.
            cpu_apply_creative_color(pix, g.saturation, g.vibrance);

            // Color grading.
            cpu_apply_color_grading(
                pix,
                &g.color_grading_shadows,
                &g.color_grading_midtones,
                &g.color_grading_highlights,
                &g.color_grading_global,
                g.color_grading_blending,
                g.color_grading_balance,
            );

            // Vignette.
            cpu_apply_vignette(
                pix,
                x,
                y,
                width,
                height,
                g.vignette_amount,
                g.vignette_midpoint,
                g.vignette_roundness,
                g.vignette_feather,
            );

            // Tonemap.
            if g.tonemapper_mode > 0.5 {
                cpu_apply_agx_tonemap_to_pixel(pix, &pipe_to_rendering, &rendering_to_pipe);
            } else if is_raw {
                cpu_apply_basic_tonemap_for_raw(pix);
            } else {
                cpu_linear_to_srgb_vec3(pix);
            }

            // Curves.
            cpu_apply_all_curves(
                pix,
                &g.luma_curve,
                g.luma_curve_count,
                &g.red_curve,
                g.red_curve_count,
                &g.green_curve,
                g.green_curve_count,
                &g.blue_curve,
                g.blue_curve_count,
            );

            // Clamp.
            pix[0] = pix[0].clamp(0.0, 1.0);
            pix[1] = pix[1].clamp(0.0, 1.0);
            pix[2] = pix[2].clamp(0.0, 1.0);
        });

    *image = DynamicImage::ImageRgb32F(f32_image);
}
