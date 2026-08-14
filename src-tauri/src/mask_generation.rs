use crate::ai_processing::{
    AiDepthMaskParameters, AiForegroundMaskParameters, AiSkyMaskParameters, AiSubjectMaskParameters,
};
use base64::{Engine as _, engine::general_purpose};
use image::{
    DynamicImage, GenericImageView, GrayImage, ImageEncoder, ImageFormat, Luma, Rgba, RgbaImage,
};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::hash_map::DefaultHasher;
use std::f32::consts::PI;
use std::hash::{Hash, Hasher};
use std::io::Cursor;
use std::sync::Arc; // Required for parallel rasterization

use crate::MutexResilient;
use crate::app_state::AppState;
use crate::get_cached_full_warped_image;

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(crate = "serde")]
#[serde(rename_all = "camelCase")]
pub enum SubMaskMode {
    Additive,
    Subtractive,
    Intersect,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(crate = "serde")]
#[serde(rename_all = "camelCase")]
pub struct SubMask {
    pub id: String,
    #[serde(rename = "type")]
    pub mask_type: String,
    pub visible: bool,
    #[serde(default)]
    pub invert: bool,
    #[serde(default = "default_opacity")]
    pub opacity: f32,
    pub mode: SubMaskMode,
    pub parameters: Value,
}

fn default_opacity() -> f32 {
    100.0
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(crate = "serde")]
#[serde(rename_all = "camelCase")]
pub struct MaskDefinition {
    pub id: String,
    pub name: String,
    pub visible: bool,
    pub invert: bool,
    #[serde(default = "default_opacity")]
    pub opacity: f32,
    pub adjustments: Value,
    pub sub_masks: Vec<SubMask>,
}

impl MaskDefinition {
    pub fn requires_warped_image(&self) -> bool {
        self.sub_masks
            .iter()
            .any(|sm| sm.mask_type == "color" || sm.mask_type == "luminance")
    }
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(crate = "serde")]
#[serde(rename_all = "camelCase")]
pub struct PatchData {
    pub color: String,
    pub mask: String,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(crate = "serde")]
#[serde(rename_all = "camelCase")]
pub struct AiPatchDefinition {
    pub id: String,
    pub name: String,
    pub visible: bool,
    pub invert: bool,
    pub prompt: String,
    #[serde(default)]
    pub patch_data: Option<PatchData>,
    #[serde(default = "default_opacity")]
    pub opacity: f32,
    pub sub_masks: Vec<SubMask>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
struct GrowFeatherParameters {
    #[serde(default)]
    grow: f32,
    #[serde(default)]
    feather: f32,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
struct RadialMaskParameters {
    center_x: f64,
    center_y: f64,
    radius_x: f64,
    radius_y: f64,
    rotation: f32,
    feather: f32,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
struct LinearMaskParameters {
    start_x: f64,
    start_y: f64,
    end_x: f64,
    end_y: f64,
    #[serde(default = "default_range")]
    range: f32,
}

fn default_range() -> f32 {
    50.0
}

impl Default for LinearMaskParameters {
    fn default() -> Self {
        Self {
            start_x: 0.0,
            start_y: 0.0,
            end_x: 0.0,
            end_y: 0.0,
            range: default_range(),
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct Point {
    x: f64,
    y: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
struct BrushLine {
    tool: String,
    brush_size: f32,
    points: Vec<Point>,
    #[serde(default = "default_brush_feather")]
    feather: f32,
}

fn default_brush_feather() -> f32 {
    0.5
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
struct BrushMaskParameters {
    #[serde(default)]
    lines: Vec<BrushLine>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
struct FlowLine {
    tool: String,
    brush_size: f32,
    points: Vec<Point>,
    #[serde(default = "default_brush_feather")]
    feather: f32,
    #[serde(default = "default_line_flow")]
    flow: f32,
}

fn default_line_flow() -> f32 {
    10.0
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
struct FlowMaskParameters {
    #[serde(default)]
    lines: Vec<FlowLine>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
struct ParametricMaskParameters {
    target_x: f64,
    target_y: f64,
    #[serde(default = "default_tolerance")]
    tolerance: f32,
    #[serde(default)]
    grow: f32,
    #[serde(default)]
    feather: f32,
    #[serde(default)]
    rotation: f32,
    #[serde(default)]
    flip_horizontal: bool,
    #[serde(default)]
    flip_vertical: bool,
    #[serde(default)]
    orientation_steps: u8,
}

fn default_tolerance() -> f32 {
    20.0
}

impl Default for ParametricMaskParameters {
    fn default() -> Self {
        Self {
            target_x: 0.0,
            target_y: 0.0,
            tolerance: default_tolerance(),
            grow: 0.0,
            feather: 35.0,
            rotation: 0.0,
            flip_horizontal: false,
            flip_vertical: false,
            orientation_steps: 0,
        }
    }
}

fn grayscale_dilate(image: &GrayImage, k: u8) -> GrayImage {
    let (width, height) = image.dimensions();
    if width == 0 || height == 0 {
        return image.clone();
    }
    let w = width as usize;
    let h = height as usize;
    let r = k as i32;
    let src = image.as_raw();

    let mut temp = vec![0u8; w * h];
    let mut out = vec![0u8; w * h];

    for y in 0..h {
        let row_offset = y * w;
        for x in 0..w {
            let mut max_val = 0;
            let start = (x as i32 - r).max(0) as usize;
            let end = (x as i32 + r).min((w - 1) as i32) as usize;
            for xi in start..=end {
                max_val = max_val.max(src[row_offset + xi]);
            }
            temp[row_offset + x] = max_val;
        }
    }

    for x in 0..w {
        for y in 0..h {
            let mut max_val = 0;
            let start = (y as i32 - r).max(0) as usize;
            let end = (y as i32 + r).min((h - 1) as i32) as usize;
            for yi in start..=end {
                max_val = max_val.max(temp[yi * w + x]);
            }
            out[y * w + x] = max_val;
        }
    }

    GrayImage::from_raw(width, height, out).unwrap_or_else(|| {
        eprintln!(
            "Warning: Failed to create GrayImage of size {}x{}, creating empty mask",
            width, height
        );
        GrayImage::new(width, height)
    })
}

fn grayscale_erode(image: &GrayImage, k: u8) -> GrayImage {
    let (width, height) = image.dimensions();
    if width == 0 || height == 0 {
        return image.clone();
    }
    let w = width as usize;
    let h = height as usize;
    let r = k as i32;
    let src = image.as_raw();

    let mut temp = vec![0u8; w * h];
    let mut out = vec![0u8; w * h];

    for y in 0..h {
        let row_offset = y * w;
        for x in 0..w {
            let mut min_val = 255;
            let start = (x as i32 - r).max(0) as usize;
            let end = (x as i32 + r).min((w - 1) as i32) as usize;
            for xi in start..=end {
                min_val = min_val.min(src[row_offset + xi]);
            }
            temp[row_offset + x] = min_val;
        }
    }

    for x in 0..w {
        for y in 0..h {
            let mut min_val = 255;
            let start = (y as i32 - r).max(0) as usize;
            let end = (y as i32 + r).min((h - 1) as i32) as usize;
            for yi in start..=end {
                min_val = min_val.min(temp[yi * w + x]);
            }
            out[y * w + x] = min_val;
        }
    }

    GrayImage::from_raw(width, height, out).unwrap_or_else(|| {
        eprintln!(
            "Warning: Failed to create GrayImage of size {}x{}, creating empty mask",
            width, height
        );
        GrayImage::new(width, height)
    })
}

fn apply_grow_and_feather(mask: &mut GrayImage, grow: f32, feather: f32, width: u32, height: u32) {
    let base_dimension = width.min(height) as f32;

    if grow.abs() > 0.01 {
        const MAX_GROW_PERCENTAGE: f32 = 0.01;
        let grow_pixels = (grow / 100.0) * base_dimension * MAX_GROW_PERCENTAGE;

        let amount = grow_pixels.abs().round() as u8;

        if amount > 0 {
            if grow_pixels > 0.0 {
                *mask = grayscale_dilate(mask, amount);
            } else {
                *mask = grayscale_erode(mask, amount);
            }
        }
    }

    if feather > 0.0 {
        const MAX_FEATHER_SIGMA_PERCENTAGE: f32 = 0.02;
        let sigma = (feather / 100.0) * base_dimension * MAX_FEATHER_SIGMA_PERCENTAGE;

        if sigma > 0.01 {
            *mask = imageproc::filter::gaussian_blur_f32(mask, sigma);
        }
    }
}

fn stroke_bounds(
    points: &[Point],
    width: u32,
    height: u32,
    radius: f32,
    scale: f32,
    crop_offset: (f32, f32),
) -> Option<(u32, u32, u32, u32)> {
    if width == 0 || height == 0 || points.is_empty() {
        return None;
    }

    let mut min_x = f32::INFINITY;
    let mut min_y = f32::INFINITY;
    let mut max_x = f32::NEG_INFINITY;
    let mut max_y = f32::NEG_INFINITY;
    let r_pad = radius.ceil() + 2.0;

    for p in points {
        let px = p.x as f32 * scale - crop_offset.0;
        let py = p.y as f32 * scale - crop_offset.1;

        min_x = min_x.min(px - r_pad);
        min_y = min_y.min(py - r_pad);
        max_x = max_x.max(px + r_pad);
        max_y = max_y.max(py + r_pad);
    }

    if max_x < 0.0 || max_y < 0.0 || min_x > (width - 1) as f32 || min_y > (height - 1) as f32 {
        return None;
    }

    let min_x = min_x.floor().max(0.0).min((width - 1) as f32) as u32;
    let min_y = min_y.floor().max(0.0).min((height - 1) as f32) as u32;
    let max_x = max_x.ceil().max(0.0).min((width - 1) as f32) as u32;
    let max_y = max_y.ceil().max(0.0).min((height - 1) as f32) as u32;

    if min_x > max_x || min_y > max_y {
        None
    } else {
        Some((min_x, min_y, max_x, max_y))
    }
}

#[allow(clippy::too_many_arguments)]
fn render_stroke_layer_parallel(
    points: &[Point],
    radius: f32,
    feather: f32,
    scale: f32,
    crop_offset: (f32, f32),
    layer_offset: (f32, f32),
    bb_w: u32,
    bb_h: u32,
) -> GrayImage {
    // Cast to usize before multiplying to prevent u32 overflow on very large bounding boxes.
    let mut out_pixels = vec![0u8; (bb_w as usize) * (bb_h as usize)];
    if points.is_empty() || radius <= 0.0 {
        return GrayImage::from_raw(bb_w, bb_h, out_pixels).unwrap_or_else(|| {
            eprintln!(
                "Warning: Failed to create GrayImage of size {}x{}, creating empty mask",
                bb_w, bb_h
            );
            GrayImage::new(bb_w, bb_h)
        });
    }

    struct Segment {
        x1: f32,
        y1: f32,
        dx: f32,
        dy: f32,
        len_sq: f32,
        bounds_left: i32,
        bounds_right: i32,
        bounds_top: i32,
        bounds_bottom: i32,
    }

    let mut segments = Vec::with_capacity(points.len().saturating_sub(1));
    for pair in points.windows(2) {
        let x1 = pair[0].x as f32 * scale - crop_offset.0 - layer_offset.0;
        let y1 = pair[0].y as f32 * scale - crop_offset.1 - layer_offset.1;
        let x2 = pair[1].x as f32 * scale - crop_offset.0 - layer_offset.0;
        let y2 = pair[1].y as f32 * scale - crop_offset.1 - layer_offset.1;

        let left = ((x1.min(x2) - radius).floor() as i32).max(0);
        let right = ((x1.max(x2) + radius).ceil() as i32).min(bb_w as i32 - 1);
        let top = ((y1.min(y2) - radius).floor() as i32).max(0);
        let bottom = ((y1.max(y2) + radius).ceil() as i32).min(bb_h as i32 - 1);

        if left > right || top > bottom {
            continue;
        }

        let dx = x2 - x1;
        let dy = y2 - y1;
        let len_sq = dx * dx + dy * dy;

        segments.push(Segment {
            x1,
            y1,
            dx,
            dy,
            len_sq,
            bounds_left: left,
            bounds_right: right,
            bounds_top: top,
            bounds_bottom: bottom,
        });
    }

    let mut single_point = None;
    if segments.is_empty() && !points.is_empty() {
        let x1 = points[0].x as f32 * scale - crop_offset.0 - layer_offset.0;
        let y1 = points[0].y as f32 * scale - crop_offset.1 - layer_offset.1;
        let left = ((x1 - radius).floor() as i32).max(0);
        let right = ((x1 + radius).ceil() as i32).min(bb_w as i32 - 1);
        let top = ((y1 - radius).floor() as i32).max(0);
        let bottom = ((y1 + radius).ceil() as i32).min(bb_h as i32 - 1);
        if left <= right && top <= bottom {
            single_point = Some((x1, y1, left, right, top, bottom));
        }
    }

    let feather_amount = feather.clamp(0.0, 1.0);
    let inner_radius = radius * (1.0 - feather_amount);
    let feather_range = (radius - inner_radius).max(0.01);
    let radius_sq = radius * radius;
    let inner_radius_sq = inner_radius * inner_radius;

    out_pixels
        .par_chunks_mut(bb_w as usize)
        .enumerate()
        .for_each(|(y, row)| {
            let py = y as f32;
            let y_i32 = y as i32;

            let mut active_segments = Vec::new();
            for seg in &segments {
                if y_i32 >= seg.bounds_top && y_i32 <= seg.bounds_bottom {
                    active_segments.push(seg);
                }
            }

            let is_point_active = if let Some(pt) = &single_point {
                y_i32 >= pt.4 && y_i32 <= pt.5
            } else {
                false
            };

            if active_segments.is_empty() && !is_point_active {
                return;
            }

            for (x, pixel) in row.iter_mut().enumerate() {
                let px = x as f32;
                let x_i32 = x as i32;

                let mut min_dist_sq = radius_sq + 1.0;

                for seg in &active_segments {
                    if x_i32 >= seg.bounds_left && x_i32 <= seg.bounds_right {
                        let dist_sq = if seg.len_sq < 0.0001 {
                            (px - seg.x1) * (px - seg.x1) + (py - seg.y1) * (py - seg.y1)
                        } else {
                            let t = (((px - seg.x1) * seg.dx + (py - seg.y1) * seg.dy)
                                / seg.len_sq)
                                .clamp(0.0, 1.0);
                            let proj_x = seg.x1 + t * seg.dx;
                            let proj_y = seg.y1 + t * seg.dy;
                            (px - proj_x) * (px - proj_x) + (py - proj_y) * (py - proj_y)
                        };
                        if dist_sq < min_dist_sq {
                            min_dist_sq = dist_sq;
                        }
                    }
                }

                if is_point_active {
                    let pt = single_point.as_ref().unwrap();
                    if x_i32 >= pt.2 && x_i32 <= pt.3 {
                        let dist_sq = (px - pt.0) * (px - pt.0) + (py - pt.1) * (py - pt.1);
                        if dist_sq < min_dist_sq {
                            min_dist_sq = dist_sq;
                        }
                    }
                }

                if min_dist_sq <= radius_sq {
                    let intensity = if min_dist_sq <= inner_radius_sq {
                        1.0
                    } else {
                        let dist = min_dist_sq.sqrt();
                        let t = ((dist - inner_radius) / feather_range).clamp(0.0, 1.0);
                        1.0 - (t * t * (3.0 - 2.0 * t))
                    };
                    *pixel = (intensity * 255.0).round() as u8;
                }
            }
        });

    GrayImage::from_raw(bb_w, bb_h, out_pixels).unwrap_or_else(|| {
        eprintln!(
            "Warning: Failed to create GrayImage of size {}x{}, creating empty mask",
            bb_w, bb_h
        );
        GrayImage::new(bb_w, bb_h)
    })
}

fn generate_radial_bitmap(
    params_value: &Value,
    width: u32,
    height: u32,
    scale: f32,
    crop_offset: (f32, f32),
) -> GrayImage {
    let params: RadialMaskParameters =
        serde_json::from_value(params_value.clone()).unwrap_or_else(|e| {
            log::warn!("Mask parameter JSON parse error: {}, using defaults", e);
            <RadialMaskParameters>::default()
        });
    let mut mask = GrayImage::new(width, height);

    let center_x = (params.center_x as f32 * scale - crop_offset.0) as i32;
    let center_y = (params.center_y as f32 * scale - crop_offset.1) as i32;
    let radius_x = params.radius_x as f32 * scale;
    let radius_y = params.radius_y as f32 * scale;
    let rotation_rad = params.rotation * PI / 180.0;

    for y in 0..height {
        for x in 0..width {
            let dx = x as f32 - center_x as f32;
            let dy = y as f32 - center_y as f32;

            let cos_rot = rotation_rad.cos();
            let sin_rot = rotation_rad.sin();

            let rot_dx = dx * cos_rot + dy * sin_rot;
            let rot_dy = -dx * sin_rot + dy * cos_rot;

            let norm_x = rot_dx / radius_x.max(0.01);
            let norm_y = rot_dy / radius_y.max(0.01);

            let dist = (norm_x.powi(2) + norm_y.powi(2)).sqrt();

            let inner_bound = 1.0 - params.feather.clamp(0.0, 1.0);
            let intensity = 1.0 - (dist - inner_bound) / (1.0 - inner_bound).max(0.01);
            let clamped_intensity = intensity.clamp(0.0, 1.0);

            mask.put_pixel(x, y, Luma([(clamped_intensity * 255.0) as u8]));
        }
    }

    mask
}

fn generate_linear_bitmap(
    params_value: &Value,
    width: u32,
    height: u32,
    scale: f32,
    crop_offset: (f32, f32),
) -> GrayImage {
    let params: LinearMaskParameters =
        serde_json::from_value(params_value.clone()).unwrap_or_else(|e| {
            log::warn!("Mask parameter JSON parse error: {}, using defaults", e);
            <LinearMaskParameters>::default()
        });
    let mut mask = GrayImage::new(width, height);

    let start_x = params.start_x as f32 * scale - crop_offset.0;
    let start_y = params.start_y as f32 * scale - crop_offset.1;
    let end_x = params.end_x as f32 * scale - crop_offset.0;
    let end_y = params.end_y as f32 * scale - crop_offset.1;
    let range = params.range * scale;

    let line_vec_x = end_x - start_x;
    let line_vec_y = end_y - start_y;

    let len_sq = line_vec_x.powi(2) + line_vec_y.powi(2);

    if len_sq < 0.01 {
        return mask;
    }

    let perp_vec_x = -line_vec_y / len_sq.sqrt();
    let perp_vec_y = line_vec_x / len_sq.sqrt();

    let half_width = range.max(0.01);

    for y_u in 0..height {
        for x_u in 0..width {
            let x = x_u as f32;
            let y = y_u as f32;

            let pixel_vec_x = x - start_x;
            let pixel_vec_y = y - start_y;

            let dist_perp = pixel_vec_x * perp_vec_x + pixel_vec_y * perp_vec_y;

            let t = dist_perp / half_width;

            let intensity = 0.5 - t * 0.5;

            let clamped_intensity = intensity.clamp(0.0, 1.0);

            mask.put_pixel(x_u, y_u, Luma([(clamped_intensity * 255.0) as u8]));
        }
    }

    mask
}

fn generate_brush_bitmap(
    params_value: &Value,
    width: u32,
    height: u32,
    scale: f32,
    crop_offset: (f32, f32),
) -> GrayImage {
    let params: BrushMaskParameters =
        serde_json::from_value(params_value.clone()).unwrap_or_else(|e| {
            log::warn!("Mask parameter JSON parse error: {}, using defaults", e);
            <BrushMaskParameters>::default()
        });
    let mut final_mask = GrayImage::new(width, height);

    for line in &params.lines {
        if line.points.is_empty() {
            continue;
        }

        let is_eraser = line.tool == "eraser";
        let radius = (line.brush_size * scale / 2.0).max(0.0);
        let feather = line.feather.clamp(0.0, 1.0);

        let Some((min_x, min_y, max_x, max_y)) =
            stroke_bounds(&line.points, width, height, radius, scale, crop_offset)
        else {
            continue;
        };

        let bb_w = max_x - min_x + 1;
        let bb_h = max_y - min_y + 1;
        let layer_offset = (min_x as f32, min_y as f32);

        let line_mask = render_stroke_layer_parallel(
            &line.points,
            radius,
            feather,
            scale,
            crop_offset,
            layer_offset,
            bb_w,
            bb_h,
        );

        for y in 0..bb_h {
            for x in 0..bb_w {
                let src_val = line_mask.get_pixel(x, y)[0] as f32 / 255.0;
                if src_val <= 0.0 {
                    continue;
                }

                let abs_x = min_x + x;
                let abs_y = min_y + y;
                let dst_pixel = final_mask.get_pixel_mut(abs_x, abs_y);
                let dst_val = dst_pixel[0] as f32 / 255.0;

                let blended = if is_eraser {
                    dst_val * (1.0 - src_val)
                } else {
                    dst_val + src_val - dst_val * src_val
                };

                dst_pixel[0] = (blended.clamp(0.0, 1.0) * 255.0).round() as u8;
            }
        }
    }

    final_mask
}

fn generate_flow_bitmap(
    params_value: &Value,
    width: u32,
    height: u32,
    scale: f32,
    crop_offset: (f32, f32),
) -> GrayImage {
    let params: FlowMaskParameters =
        serde_json::from_value(params_value.clone()).unwrap_or_else(|e| {
            log::warn!("Mask parameter JSON parse error: {}, using defaults", e);
            <FlowMaskParameters>::default()
        });
    let mut final_mask = GrayImage::new(width, height);

    for line in &params.lines {
        if line.points.is_empty() {
            continue;
        }

        let is_eraser = line.tool == "eraser";
        let flow_per_stroke = (line.flow.clamp(0.0, 100.0) / 100.0) * 255.0;
        let radius = (line.brush_size * scale / 2.0).max(0.0);
        let feather = line.feather.clamp(0.0, 1.0);

        let Some((min_x, min_y, max_x, max_y)) =
            stroke_bounds(&line.points, width, height, radius, scale, crop_offset)
        else {
            continue;
        };

        let bb_w = max_x - min_x + 1;
        let bb_h = max_y - min_y + 1;
        let layer_offset = (min_x as f32, min_y as f32);

        let line_mask = render_stroke_layer_parallel(
            &line.points,
            radius,
            feather,
            scale,
            crop_offset,
            layer_offset,
            bb_w,
            bb_h,
        );

        for y in 0..bb_h {
            for x in 0..bb_w {
                let stroke_pixel = line_mask.get_pixel(x, y)[0] as f32;
                if stroke_pixel <= 0.0 {
                    continue;
                }

                let abs_x = min_x + x;
                let abs_y = min_y + y;
                let pixel = final_mask.get_pixel_mut(abs_x, abs_y);

                let c_norm = pixel[0] as f32 / 255.0;
                let delta = ((stroke_pixel / 255.0) * flow_per_stroke).round();
                let d_norm = (delta / 255.0).clamp(0.0, 1.0);

                let next = if is_eraser {
                    c_norm * (1.0 - d_norm)
                } else {
                    c_norm + d_norm - c_norm * d_norm
                };

                pixel[0] = (next.clamp(0.0, 1.0) * 255.0).round() as u8;
            }
        }
    }

    final_mask
}

struct TransformParams {
    rotation: f32,
    flip_horizontal: bool,
    flip_vertical: bool,
    orientation_steps: u8,
    width: u32,
    height: u32,
    scale: f32,
    crop_offset: (f32, f32),
}

fn generate_ai_bitmap_from_full_mask(
    full_mask_image: &GrayImage,
    tf: &TransformParams,
) -> GrayImage {
    let (full_mask_w, full_mask_h) = full_mask_image.dimensions();
    let mut final_mask = GrayImage::new(tf.width, tf.height);

    let angle_rad = tf.rotation.to_radians();
    let cos_a = angle_rad.cos();
    let sin_a = angle_rad.sin();

    let (coarse_rotated_w, coarse_rotated_h) = if tf.orientation_steps % 2 == 1 {
        (full_mask_h, full_mask_w)
    } else {
        (full_mask_w, full_mask_h)
    };

    let scaled_coarse_rotated_w = coarse_rotated_w as f32 * tf.scale;
    let scaled_coarse_rotated_h = coarse_rotated_h as f32 * tf.scale;
    let center_x = scaled_coarse_rotated_w / 2.0;
    let center_y = scaled_coarse_rotated_h / 2.0;

    for y_out in 0..tf.height {
        for x_out in 0..tf.width {
            let x_uncrop = x_out as f32 + tf.crop_offset.0;
            let y_uncrop = y_out as f32 + tf.crop_offset.1;

            let x_centered = x_uncrop - center_x;
            let y_centered = y_uncrop - center_y;

            let x_unrotated = x_centered * cos_a + y_centered * sin_a + center_x;
            let y_unrotated = -x_centered * sin_a + y_centered * cos_a + center_y;

            let x_unflipped = if tf.flip_horizontal {
                scaled_coarse_rotated_w - x_unrotated
            } else {
                x_unrotated
            };
            let y_unflipped = if tf.flip_vertical {
                scaled_coarse_rotated_h - y_unrotated
            } else {
                y_unrotated
            };

            let (x_unrotated_coarse, y_unrotated_coarse) = match tf.orientation_steps {
                0 => (x_unflipped, y_unflipped),
                1 => (y_unflipped, scaled_coarse_rotated_w - x_unflipped),
                2 => (
                    scaled_coarse_rotated_w - x_unflipped,
                    scaled_coarse_rotated_h - y_unflipped,
                ),
                3 => (scaled_coarse_rotated_h - y_unflipped, x_unflipped),
                _ => (x_unflipped, y_unflipped),
            };

            let x_src = x_unrotated_coarse / tf.scale;
            let y_src = y_unrotated_coarse / tf.scale;

            if x_src >= 0.0
                && x_src < full_mask_w as f32
                && y_src >= 0.0
                && y_src < full_mask_h as f32
            {
                let pixel = full_mask_image.get_pixel(x_src as u32, y_src as u32);
                final_mask.put_pixel(x_out, y_out, *pixel);
            }
        }
    }

    final_mask
}

fn generate_ai_bitmap_from_base64(data_url: &str, tf: &TransformParams) -> Option<GrayImage> {
    let b64_data = if let Some(idx) = data_url.find(',') {
        &data_url[idx + 1..]
    } else {
        data_url
    };

    let decoded_bytes = general_purpose::STANDARD.decode(b64_data).ok()?;
    let full_mask_image = image::load_from_memory(&decoded_bytes).ok()?.to_luma8();

    Some(generate_ai_bitmap_from_full_mask(&full_mask_image, tf))
}

fn generate_ai_sky_bitmap(
    params_value: &Value,
    width: u32,
    height: u32,
    scale: f32,
    crop_offset: (f32, f32),
) -> Option<GrayImage> {
    let params: AiSkyMaskParameters = serde_json::from_value(params_value.clone()).ok()?;
    let grow_feather: GrowFeatherParameters = serde_json::from_value(params_value.clone())
        .unwrap_or_else(|e| {
            log::warn!("Mask parameter JSON parse error: {}, using defaults", e);
            <GrowFeatherParameters>::default()
        });
    let data_url = params.mask_data_base64?;

    let tf = TransformParams {
        rotation: params.rotation.unwrap_or(0.0),
        flip_horizontal: params.flip_horizontal.unwrap_or(false),
        flip_vertical: params.flip_vertical.unwrap_or(false),
        orientation_steps: params.orientation_steps.unwrap_or(0),
        width,
        height,
        scale,
        crop_offset,
    };
    let mut mask = generate_ai_bitmap_from_base64(&data_url, &tf)?;

    apply_grow_and_feather(
        &mut mask,
        grow_feather.grow,
        grow_feather.feather,
        width,
        height,
    );

    Some(mask)
}

fn generate_ai_depth_bitmap(
    params_value: &Value,
    width: u32,
    height: u32,
    scale: f32,
    crop_offset: (f32, f32),
) -> Option<GrayImage> {
    let params: AiDepthMaskParameters = serde_json::from_value(params_value.clone()).ok()?;
    let grow_feather: GrowFeatherParameters = serde_json::from_value(params_value.clone())
        .unwrap_or_else(|e| {
            log::warn!("Mask parameter JSON parse error: {}, using defaults", e);
            <GrowFeatherParameters>::default()
        });
    let data_url = params.mask_data_base64?;

    let tf = TransformParams {
        rotation: params.rotation.unwrap_or(0.0),
        flip_horizontal: params.flip_horizontal.unwrap_or(false),
        flip_vertical: params.flip_vertical.unwrap_or(false),
        orientation_steps: params.orientation_steps.unwrap_or(0),
        width,
        height,
        scale,
        crop_offset,
    };

    let depth_map = generate_ai_bitmap_from_base64(&data_url, &tf)?;

    let (w, h) = depth_map.dimensions();
    let mut mask = GrayImage::new(w, h);

    fn smoothstep(edge0: f32, edge1: f32, x: f32) -> f32 {
        let t = ((x - edge0) / (edge1 - edge0).max(0.0001)).clamp(0.0, 1.0);
        t * t * (3.0 - 2.0 * t)
    }

    let min_fade = params.min_fade;
    let max_fade = params.max_fade;

    for (x, y, p) in depth_map.enumerate_pixels() {
        let val_pct = (p[0] as f32 / 255.0) * 100.0;

        let lower_bound = smoothstep(params.min_depth - min_fade, params.min_depth, val_pct);
        let upper_bound = 1.0 - smoothstep(params.max_depth, params.max_depth + max_fade, val_pct);
        let bandpass_weight = lower_bound * upper_bound;

        let depth_intensity = val_pct / 100.0;
        let final_intensity = bandpass_weight * depth_intensity;

        mask.put_pixel(x, y, Luma([(final_intensity * 255.0) as u8]));
    }

    if params.feather > 0.0 {
        mask = image::imageops::blur(&mask, params.feather * 0.1);
    }

    apply_grow_and_feather(
        &mut mask,
        grow_feather.grow,
        grow_feather.feather,
        width,
        height,
    );

    Some(mask)
}

fn generate_ai_foreground_bitmap(
    params_value: &Value,
    width: u32,
    height: u32,
    scale: f32,
    crop_offset: (f32, f32),
) -> Option<GrayImage> {
    let params: AiForegroundMaskParameters = serde_json::from_value(params_value.clone()).ok()?;
    let grow_feather: GrowFeatherParameters = serde_json::from_value(params_value.clone())
        .unwrap_or_else(|e| {
            log::warn!("Mask parameter JSON parse error: {}, using defaults", e);
            <GrowFeatherParameters>::default()
        });
    let data_url = params.mask_data_base64?;

    let tf = TransformParams {
        rotation: params.rotation.unwrap_or(0.0),
        flip_horizontal: params.flip_horizontal.unwrap_or(false),
        flip_vertical: params.flip_vertical.unwrap_or(false),
        orientation_steps: params.orientation_steps.unwrap_or(0),
        width,
        height,
        scale,
        crop_offset,
    };
    let mut mask = generate_ai_bitmap_from_base64(&data_url, &tf)?;

    apply_grow_and_feather(
        &mut mask,
        grow_feather.grow,
        grow_feather.feather,
        width,
        height,
    );

    Some(mask)
}

fn generate_ai_subject_bitmap(
    params_value: &Value,
    width: u32,
    height: u32,
    scale: f32,
    crop_offset: (f32, f32),
) -> Option<GrayImage> {
    let params: AiSubjectMaskParameters = serde_json::from_value(params_value.clone()).ok()?;
    let grow_feather: GrowFeatherParameters = serde_json::from_value(params_value.clone())
        .unwrap_or_else(|e| {
            log::warn!("Mask parameter JSON parse error: {}, using defaults", e);
            <GrowFeatherParameters>::default()
        });
    let data_url = params.mask_data_base64?;

    let tf = TransformParams {
        rotation: params.rotation.unwrap_or(0.0),
        flip_horizontal: params.flip_horizontal.unwrap_or(false),
        flip_vertical: params.flip_vertical.unwrap_or(false),
        orientation_steps: params.orientation_steps.unwrap_or(0),
        width,
        height,
        scale,
        crop_offset,
    };
    let mut mask = generate_ai_bitmap_from_base64(&data_url, &tf)?;

    apply_grow_and_feather(
        &mut mask,
        grow_feather.grow,
        grow_feather.feather,
        width,
        height,
    );

    Some(mask)
}

fn generate_color_bitmap(
    params_value: &Value,
    width: u32,
    height: u32,
    scale: f32,
    crop_offset: (f32, f32),
    warped_image: Option<&image::DynamicImage>,
) -> Option<GrayImage> {
    let params: ParametricMaskParameters = serde_json::from_value(params_value.clone()).ok()?;
    let warped = warped_image?;
    let (full_w, full_h) = warped.dimensions();

    let target_x = params.target_x.round() as i32;
    let target_y = params.target_y.round() as i32;
    if target_x < 0 || target_y < 0 || target_x >= full_w as i32 || target_y >= full_h as i32 {
        return None;
    }

    let ref_pixel = warped.get_pixel(target_x as u32, target_y as u32);
    let ref_r = ref_pixel[0] as f32;
    let ref_g = ref_pixel[1] as f32;
    let ref_b = ref_pixel[2] as f32;

    let mut mask = GrayImage::new(width, height);

    let angle_rad = params.rotation * PI / 180.0;
    let cos_a = angle_rad.cos();
    let sin_a = angle_rad.sin();

    let (coarse_rotated_w, coarse_rotated_h) = if params.orientation_steps % 2 == 1 {
        (full_h, full_w)
    } else {
        (full_w, full_h)
    };

    let scaled_coarse_rotated_w = coarse_rotated_w as f32 * scale;
    let scaled_coarse_rotated_h = coarse_rotated_h as f32 * scale;
    let center_x = scaled_coarse_rotated_w / 2.0;
    let center_y = scaled_coarse_rotated_h / 2.0;

    let tolerance_sq = (params.tolerance * 2.55).max(1.0).powi(2) * 3.0;
    let inv_scale = 1.0 / scale;

    for y_out in 0..height {
        let y_uncrop = y_out as f32 + crop_offset.1;
        let y_centered = y_uncrop - center_y;
        let y_sin = y_centered * sin_a;
        let y_cos = y_centered * cos_a;

        for x_out in 0..width {
            let x_uncrop = x_out as f32 + crop_offset.0;
            let x_centered = x_uncrop - center_x;

            let x_unrotated = x_centered * cos_a + y_sin + center_x;
            let y_unrotated = -x_centered * sin_a + y_cos + center_y;

            let x_unflipped = if params.flip_horizontal {
                scaled_coarse_rotated_w - x_unrotated
            } else {
                x_unrotated
            };
            let y_unflipped = if params.flip_vertical {
                scaled_coarse_rotated_h - y_unrotated
            } else {
                y_unrotated
            };

            let (x_unrotated_coarse, y_unrotated_coarse) = match params.orientation_steps {
                0 => (x_unflipped, y_unflipped),
                1 => (y_unflipped, scaled_coarse_rotated_w - x_unflipped),
                2 => (
                    scaled_coarse_rotated_w - x_unflipped,
                    scaled_coarse_rotated_h - y_unflipped,
                ),
                3 => (scaled_coarse_rotated_h - y_unflipped, x_unflipped),
                _ => (x_unflipped, y_unflipped),
            };

            if x_unrotated_coarse >= 0.0 && y_unrotated_coarse >= 0.0 {
                let x_src = (x_unrotated_coarse * inv_scale) as u32;
                let y_src = (y_unrotated_coarse * inv_scale) as u32;

                if x_src < full_w && y_src < full_h {
                    let pixel = warped.get_pixel(x_src, y_src);
                    let dist_sq = (pixel[0] as f32 - ref_r).powi(2)
                        + (pixel[1] as f32 - ref_g).powi(2)
                        + (pixel[2] as f32 - ref_b).powi(2);

                    if dist_sq <= tolerance_sq {
                        let intensity = 1.0 - (dist_sq.sqrt() / tolerance_sq.sqrt());
                        mask.put_pixel(x_out, y_out, Luma([(intensity * 255.0) as u8]));
                    }
                }
            }
        }
    }

    apply_grow_and_feather(&mut mask, params.grow, params.feather, width, height);
    Some(mask)
}

fn generate_luminance_bitmap(
    params_value: &Value,
    width: u32,
    height: u32,
    scale: f32,
    crop_offset: (f32, f32),
    warped_image: Option<&image::DynamicImage>,
) -> Option<GrayImage> {
    let params: ParametricMaskParameters = serde_json::from_value(params_value.clone()).ok()?;
    let warped = warped_image?;
    let (full_w, full_h) = warped.dimensions();

    let target_x = params.target_x.round() as i32;
    let target_y = params.target_y.round() as i32;
    if target_x < 0 || target_y < 0 || target_x >= full_w as i32 || target_y >= full_h as i32 {
        return None;
    }

    let ref_pixel = warped.get_pixel(target_x as u32, target_y as u32);
    let ref_luma =
        0.299 * ref_pixel[0] as f32 + 0.587 * ref_pixel[1] as f32 + 0.114 * ref_pixel[2] as f32;

    let mut mask = GrayImage::new(width, height);

    let angle_rad = params.rotation * PI / 180.0;
    let cos_a = angle_rad.cos();
    let sin_a = angle_rad.sin();

    let (coarse_rotated_w, coarse_rotated_h) = if params.orientation_steps % 2 == 1 {
        (full_h, full_w)
    } else {
        (full_w, full_h)
    };

    let scaled_coarse_rotated_w = coarse_rotated_w as f32 * scale;
    let scaled_coarse_rotated_h = coarse_rotated_h as f32 * scale;
    let center_x = scaled_coarse_rotated_w / 2.0;
    let center_y = scaled_coarse_rotated_h / 2.0;

    let tolerance_val = (params.tolerance * 2.55).max(1.0);
    let inv_scale = 1.0 / scale;

    for y_out in 0..height {
        let y_uncrop = y_out as f32 + crop_offset.1;
        let y_centered = y_uncrop - center_y;
        let y_sin = y_centered * sin_a;
        let y_cos = y_centered * cos_a;

        for x_out in 0..width {
            let x_uncrop = x_out as f32 + crop_offset.0;
            let x_centered = x_uncrop - center_x;

            let x_unrotated = x_centered * cos_a + y_sin + center_x;
            let y_unrotated = -x_centered * sin_a + y_cos + center_y;

            let x_unflipped = if params.flip_horizontal {
                scaled_coarse_rotated_w - x_unrotated
            } else {
                x_unrotated
            };
            let y_unflipped = if params.flip_vertical {
                scaled_coarse_rotated_h - y_unrotated
            } else {
                y_unrotated
            };

            let (x_unrotated_coarse, y_unrotated_coarse) = match params.orientation_steps {
                0 => (x_unflipped, y_unflipped),
                1 => (y_unflipped, scaled_coarse_rotated_w - x_unflipped),
                2 => (
                    scaled_coarse_rotated_w - x_unflipped,
                    scaled_coarse_rotated_h - y_unflipped,
                ),
                3 => (scaled_coarse_rotated_h - y_unflipped, x_unflipped),
                _ => (x_unflipped, y_unflipped),
            };

            if x_unrotated_coarse >= 0.0 && y_unrotated_coarse >= 0.0 {
                let x_src = (x_unrotated_coarse * inv_scale) as u32;
                let y_src = (y_unrotated_coarse * inv_scale) as u32;

                if x_src < full_w && y_src < full_h {
                    let pixel = warped.get_pixel(x_src, y_src);
                    let luma =
                        0.299 * pixel[0] as f32 + 0.587 * pixel[1] as f32 + 0.114 * pixel[2] as f32;
                    let dist = (luma - ref_luma).abs();

                    if dist <= tolerance_val {
                        let intensity = 1.0 - (dist / tolerance_val);
                        mask.put_pixel(x_out, y_out, Luma([(intensity * 255.0) as u8]));
                    }
                }
            }
        }
    }

    apply_grow_and_feather(&mut mask, params.grow, params.feather, width, height);
    Some(mask)
}

fn generate_all_bitmap(width: u32, height: u32) -> GrayImage {
    GrayImage::from_pixel(width, height, Luma([255]))
}

fn generate_sub_mask_bitmap(
    sub_mask: &SubMask,
    width: u32,
    height: u32,
    scale: f32,
    crop_offset: (f32, f32),
    warped_image: Option<&DynamicImage>,
) -> Option<GrayImage> {
    if !sub_mask.visible {
        return None;
    }

    match sub_mask.mask_type.as_str() {
        "radial" => Some(generate_radial_bitmap(
            &sub_mask.parameters,
            width,
            height,
            scale,
            crop_offset,
        )),
        "linear" => Some(generate_linear_bitmap(
            &sub_mask.parameters,
            width,
            height,
            scale,
            crop_offset,
        )),
        "brush" | "clone" | "heal" => Some(generate_brush_bitmap(
            &sub_mask.parameters,
            width,
            height,
            scale,
            crop_offset,
        )),
        "flow" => Some(generate_flow_bitmap(
            &sub_mask.parameters,
            width,
            height,
            scale,
            crop_offset,
        )),
        "color" => generate_color_bitmap(
            &sub_mask.parameters,
            width,
            height,
            scale,
            crop_offset,
            warped_image,
        ),
        "luminance" => generate_luminance_bitmap(
            &sub_mask.parameters,
            width,
            height,
            scale,
            crop_offset,
            warped_image,
        ),
        "ai-subject" => {
            generate_ai_subject_bitmap(&sub_mask.parameters, width, height, scale, crop_offset)
        }
        "ai-foreground" => {
            generate_ai_foreground_bitmap(&sub_mask.parameters, width, height, scale, crop_offset)
        }
        "ai-sky" => generate_ai_sky_bitmap(&sub_mask.parameters, width, height, scale, crop_offset),
        "ai-depth" => {
            generate_ai_depth_bitmap(&sub_mask.parameters, width, height, scale, crop_offset)
        }
        "quick-eraser" => {
            generate_ai_subject_bitmap(&sub_mask.parameters, width, height, scale, crop_offset)
        }
        "all" => Some(generate_all_bitmap(width, height)),
        _ => None,
    }
}

pub fn generate_mask_bitmap(
    mask_def: &MaskDefinition,
    width: u32,
    height: u32,
    scale: f32,
    crop_offset: (f32, f32),
    warped_image: Option<&DynamicImage>,
) -> Option<GrayImage> {
    if width == 0 || height == 0 {
        return None;
    }

    if !mask_def.visible || mask_def.sub_masks.is_empty() {
        return None;
    }

    if scale <= 0.0 {
        return None;
    }

    let mut final_mask = GrayImage::new(width, height);

    for sub_mask in &mask_def.sub_masks {
        if let Some(mut sub_bitmap) =
            generate_sub_mask_bitmap(sub_mask, width, height, scale, crop_offset, warped_image)
        {
            if sub_mask.invert {
                for p in sub_bitmap.pixels_mut() {
                    p[0] = 255 - p[0];
                }
            }

            let opacity_multiplier = (sub_mask.opacity / 100.0).clamp(0.0, 1.0);
            if opacity_multiplier < 1.0 {
                for pixel in sub_bitmap.pixels_mut() {
                    pixel[0] = (pixel[0] as f32 * opacity_multiplier) as u8;
                }
            }

            match sub_mask.mode {
                SubMaskMode::Additive => {
                    for (x, y, pixel) in final_mask.enumerate_pixels_mut() {
                        let sub_pixel = sub_bitmap.get_pixel(x, y);
                        pixel[0] = pixel[0].max(sub_pixel[0]);
                    }
                }
                SubMaskMode::Subtractive => {
                    for (x, y, pixel) in final_mask.enumerate_pixels_mut() {
                        let sub_pixel = sub_bitmap.get_pixel(x, y);
                        pixel[0] = pixel[0].saturating_sub(sub_pixel[0]);
                    }
                }
                SubMaskMode::Intersect => {
                    for (x, y, pixel) in final_mask.enumerate_pixels_mut() {
                        let sub_pixel = sub_bitmap.get_pixel(x, y);
                        pixel[0] = pixel[0].min(sub_pixel[0]);
                    }
                }
            }
        }
    }

    if mask_def.invert {
        for pixel in final_mask.pixels_mut() {
            pixel[0] = 255 - pixel[0];
        }
    }

    let opacity_multiplier = (mask_def.opacity / 100.0).clamp(0.0, 1.0);
    if opacity_multiplier < 1.0 {
        for pixel in final_mask.pixels_mut() {
            pixel[0] = (pixel[0] as f32 * opacity_multiplier) as u8;
        }
    }

    Some(final_mask)
}

#[tauri::command]
pub fn generate_mask_overlay(
    mut mask_def: serde_json::Value,
    width: u32,
    height: u32,
    scale: f32,
    crop_offset: (f32, f32),
    mut js_adjustments: Option<serde_json::Value>,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    if let Some(ref mut adj) = js_adjustments {
        crate::adjustment_utils::hydrate_adjustments(&state, adj);
    }

    if let Some(sub_masks) = mask_def.get_mut("subMasks").and_then(|v| v.as_array_mut()) {
        let mut cache = state.patch_cache.lock().unwrap_or_else(|e| {
            log::warn!("Mutex poisoned");
            e.into_inner()
        });
        crate::adjustment_utils::hydrate_sub_masks(sub_masks, &mut cache);
    }

    let parsed_mask_def: MaskDefinition = serde_json::from_value(mask_def)
        .map_err(|e| format!("Failed to parse hydrated mask_def: {}", e))?;

    let scaled_crop_offset = (crop_offset.0 * scale, crop_offset.1 * scale);

    let warped_image = js_adjustments.as_ref().and_then(|adj| {
        resolve_warped_image_for_masks(&state, adj, std::slice::from_ref(&parsed_mask_def))
    });

    if let Some(gray_mask) = generate_mask_bitmap(
        &parsed_mask_def,
        width,
        height,
        scale,
        scaled_crop_offset,
        warped_image.as_deref(),
    ) {
        let mut rgba_mask = RgbaImage::new(width, height);
        for (x, y, pixel) in gray_mask.enumerate_pixels() {
            let intensity = pixel[0];
            let alpha = (intensity as f32 * 0.5) as u8;
            rgba_mask.put_pixel(x, y, Rgba([255, 0, 0, alpha]));
        }

        let mut buf = Cursor::new(Vec::new());
        rgba_mask
            .write_to(&mut buf, ImageFormat::Png)
            .map_err(|e| e.to_string())?;

        let base64_str = general_purpose::STANDARD.encode(buf.get_ref());
        let data_url = format!("data:image/png;base64,{}", base64_str);

        Ok(data_url)
    } else {
        Ok("".to_string())
    }
}

pub fn resolve_warped_image_for_masks(
    state: &tauri::State<AppState>,
    adjustments: &serde_json::Value,
    masks: &[MaskDefinition],
) -> Option<Arc<DynamicImage>> {
    if masks.iter().any(|m| m.requires_warped_image()) {
        get_cached_full_warped_image(state, adjustments).ok()
    } else {
        None
    }
}

pub fn get_cached_or_generate_mask(
    state: &tauri::State<AppState>,
    def: &MaskDefinition,
    width: u32,
    height: u32,
    scale: f32,
    crop_offset: (f32, f32),
    adjustments: &serde_json::Value,
) -> Option<GrayImage> {
    let mut hasher = DefaultHasher::new();

    let mut def_for_hash = def.clone();
    def_for_hash.adjustments = serde_json::Value::Null;
    let def_json = serde_json::to_string(&def_for_hash).unwrap_or_default();
    def_json.hash(&mut hasher);

    width.hash(&mut hasher);
    height.hash(&mut hasher);
    scale.to_bits().hash(&mut hasher);
    crop_offset.0.to_bits().hash(&mut hasher);
    crop_offset.1.to_bits().hash(&mut hasher);

    let key = hasher.finish();

    {
        let cache = state.mask_cache.lock().unwrap_or_else(|e| {
            log::warn!("Mutex poisoned");
            e.into_inner()
        });
        if let Some(img) = cache.get(&key) {
            return Some(img.clone());
        }
    }

    let warped_image =
        resolve_warped_image_for_masks(state, adjustments, std::slice::from_ref(def));

    let generated = generate_mask_bitmap(
        def,
        width,
        height,
        scale,
        crop_offset,
        warped_image.as_deref(),
    );

    if let Some(img) = &generated {
        let mut cache = state.mask_cache.lock().unwrap_or_else(|e| {
            log::warn!("Mutex poisoned");
            e.into_inner()
        });
        if cache.len() > 50 {
            // Remove oldest half of entries instead of clearing all
            let keys: Vec<_> = cache.keys().take(cache.len() / 2).cloned().collect();
            for k in keys {
                cache.remove(&k);
            }
        }
        cache.insert(key, img.clone());
    }

    generated
}

// ---------------------------------------------------------------------------
// Color Range Mask – HSL-based
// ---------------------------------------------------------------------------

/// Generate a mask based on HSL color range selection.
///
/// Two parameter styles are supported and unified internally:
/// * **Frontend / ImageCanvas style** (preferred, when `target_x >= 0`):
///   `hue_center` (0..360), `hue_range` (0..180),
///   `sat_min` (0..100) / `sat_max` (0..100),
///   `lum_min` (0..100) / `lum_max` (0..100).
///   The pixel at (`target_x`, `target_y`) is used as the HSL anchor and
///   `tolerance` inflates all three ranges.
/// * **Center/range style** (when `target_x < 0`, legacy):
///   `center_hue`, `center_sat`, `center_lum` + `hue_range`/`sat_range`/`lum_range`.
///
/// Both styles produce a mask in the same HSL-distance / min-max format.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn generate_color_range_mask(
    state: tauri::State<AppState>,
    js_adjustments: Option<serde_json::Value>,
    path: Option<String>,
    target_x: Option<i32>,
    target_y: Option<i32>,
    hue_center: Option<f32>,
    hue_range: Option<f32>,
    sat_min: Option<f32>,
    sat_max: Option<f32>,
    lum_min: Option<f32>,
    lum_max: Option<f32>,
    tolerance: Option<f32>,
    feather: Option<f32>,
    center_hue: Option<f32>,
    center_sat: Option<f32>,
    center_lum: Option<f32>,
    sat_range: Option<f32>,
    lum_range: Option<f32>,
) -> Result<AiSkyMaskParameters, String> {
    let _ = (js_adjustments, path); // silence unused
    let loaded_image = state
        .original_image
        .lock_resilient()
        .clone()
        .ok_or("No original image loaded")?;

    let (w, h) = loaded_image.image.as_ref().dimensions();
    if w == 0 || h == 0 {
        return Err("Image has zero dimensions".to_string());
    }

    let rgba = loaded_image.image.to_rgba8();
    let feather_v = feather.unwrap_or(10.0).clamp(0.0, 100.0);
    let tol = tolerance.unwrap_or(20.0).max(0.0) / 100.0;

    // ── Unify input to (h_lo, h_hi), (s_lo, s_hi), (l_lo, l_hi) ──
    let tx = target_x.unwrap_or(-1);
    let ty = target_y.unwrap_or(-1);
    let (h_lo, h_hi, s_lo, s_hi, l_lo, l_hi) = if tx >= 0 && ty >= 0 {
        // ── Frontend / ImageCanvas style: use (hueCenter, ranges, tolerance) ──
        // Sample anchor pixel at (target_x, target_y) to obtain HSL baseline.
        let ax = (tx as u32).min(w.saturating_sub(1));
        let ay = (ty as u32).min(h.saturating_sub(1));
        let anchor_px = rgba.get_pixel(ax, ay);
        let (a_rf, a_gf, a_bf) = (
            anchor_px[0] as f32 / 255.0,
            anchor_px[1] as f32 / 255.0,
            anchor_px[2] as f32 / 255.0,
        );
        let (ah, as_, al) = rgb_to_hsl_internal(a_rf, a_gf, a_bf);

        // If the user provided explicit hueCenter, use it; otherwise the anchor.
        let hc = hue_center.unwrap_or(ah).rem_euclid(360.0);
        // Default hue half-range: 30° (matches the default parameters?.hueRange ?? 30)
        let h_half = hue_range.unwrap_or(30.0).clamp(0.0, 180.0);
        let tol_h = tol * 40.0;

        let s_min_pct = sat_min.unwrap_or(10.0).clamp(0.0, 100.0) / 100.0;
        let s_max_pct = sat_max.unwrap_or(100.0).clamp(0.0, 100.0) / 100.0;
        let l_min_pct = lum_min.unwrap_or(10.0).clamp(0.0, 100.0) / 100.0;
        let l_max_pct = lum_max.unwrap_or(90.0).clamp(0.0, 100.0) / 100.0;

        // Anchor-driven overlap: user ranges ∩ (anchor ± tolerance*default_range)
        let tol_s = tol * 0.2;
        let tol_l = tol * 0.2;
        let s_min = s_min_pct.max(as_ - tol_s).clamp(0.0, 1.0);
        let s_max = s_max_pct.min(as_ + tol_s).clamp(0.0, 1.0);
        let l_min = l_min_pct.max(al - tol_l).clamp(0.0, 1.0);
        let l_max = l_max_pct.min(al + tol_l).clamp(0.0, 1.0);

        (
            (hc - h_half - tol_h).rem_euclid(360.0),
            (hc + h_half + tol_h).rem_euclid(360.0),
            s_min,
            s_max,
            l_min,
            l_max,
        )
    } else {
        // ── Legacy center/range style ──
        let ch = center_hue.unwrap_or(0.0).rem_euclid(360.0);
        let cs = center_sat.unwrap_or(0.5).clamp(0.0, 1.0);
        let cl = center_lum.unwrap_or(0.5).clamp(0.0, 1.0);
        let hr = hue_range.unwrap_or(30.0).max(0.0);
        let sr = sat_range.unwrap_or(0.3).max(0.0);
        let lr = lum_range.unwrap_or(0.3).max(0.0);
        (
            (ch - hr).rem_euclid(360.0),
            (ch + hr).rem_euclid(360.0),
            (cs - sr).max(0.0),
            (cs + sr).min(1.0),
            (cl - lr).max(0.0),
            (cl + lr).min(1.0),
        )
    };

    // Hue is circular: detect 0° wrap-around
    let hue_wraps = h_lo > h_hi;

    // Compute raw mask
    // Cast to usize before multiplying so large images can't overflow a u32.
    let mut mask_data = vec![0u8; (w as usize) * (h as usize)];

    for y in 0..h {
        for x in 0..w {
            let pixel = rgba.get_pixel(x, y);
            let (rf, gf, bf) = (
                pixel[0] as f32 / 255.0,
                pixel[1] as f32 / 255.0,
                pixel[2] as f32 / 255.0,
            );
            let (hue, sat, lum) = rgb_to_hsl_internal(rf, gf, bf);

            // Hue weight (handle 0° wrap)
            let h_in = if hue_wraps {
                hue >= h_lo || hue <= h_hi
            } else {
                hue >= h_lo && hue <= h_hi
            };
            let hue_weight = if h_in { 1.0 } else { 0.0 };

            let sat_weight = if sat >= s_lo && sat <= s_hi { 1.0 } else { 0.0 };

            let lum_weight = if lum >= l_lo && lum <= l_hi { 1.0 } else { 0.0 };

            let combined = hue_weight * sat_weight * lum_weight;
            let idx = (y as usize) * (w as usize) + (x as usize);
            mask_data[idx] = (combined * 255.0_f32).round().clamp(0.0_f32, 255.0_f32) as u8;
        }
    }

    // Apply feathering (Gaussian blur)
    if feather_v > 0.0 {
        let gray_mask = GrayImage::from_raw(w, h, mask_data.clone())
            .ok_or("Failed to create gray image for feathering")?;
        let sigma = feather_v / 100.0 * w.min(h) as f32 * 0.01;
        let blurred = imageproc::filter::gaussian_blur_f32(&gray_mask, sigma.max(0.01));
        mask_data = blurred.into_raw();
    }

    // Encode to PNG base64 data-URL for frontend compatibility (expects mask_data_base64 field)
    let gray_img = GrayImage::from_raw(w, h, mask_data).ok_or("Failed to build final GrayImage")?;
    let mut png_buf = Cursor::new(Vec::new());
    gray_img
        .write_to(&mut png_buf, ImageFormat::Png)
        .map_err(|e| format!("PNG encode failed: {}", e))?;
    let b64 = general_purpose::STANDARD.encode(png_buf.get_ref());
    let data_url = format!("data:image/png;base64,{}", b64);

    Ok(AiSkyMaskParameters {
        mask_data_base64: Some(data_url),
        rotation: None,
        flip_horizontal: None,
        flip_vertical: None,
        orientation_steps: None,
    })
}

// ---------------------------------------------------------------------------
// Luminance Range Mask
// ---------------------------------------------------------------------------

/// Generate a mask based on luminance range.
///
/// Two styles are supported:
/// * **Frontend / ImageCanvas style** (when `target_x >= 0` or explicit `lum_min`/`lum_max` pct given):
///   `lum_min`, `lum_max` are on a 0..100 percent scale, `tolerance` expands the band,
///   `target_x` / `target_y` provide an optional anchor sample.
/// * **Legacy style**: `min_lum` and `max_lum` are in the 0..1 linear range.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn generate_luminance_range_mask(
    state: tauri::State<AppState>,
    js_adjustments: Option<serde_json::Value>,
    path: Option<String>,
    target_x: Option<i32>,
    target_y: Option<i32>,
    lum_min: Option<f32>,
    lum_max: Option<f32>,
    tolerance: Option<f32>,
    feather: Option<f32>,
    min_lum: Option<f32>,
    max_lum: Option<f32>,
) -> Result<AiDepthMaskParameters, String> {
    let _ = (js_adjustments, path, target_x, target_y);
    let loaded_image = state
        .original_image
        .lock_resilient()
        .clone()
        .ok_or("No original image loaded")?;

    let (w, h) = loaded_image.image.as_ref().dimensions();
    if w == 0 || h == 0 {
        return Err("Image has zero dimensions".to_string());
    }

    let rgba = loaded_image.image.to_rgba8();

    // ── Unify input style ──
    // Frontend ImageCanvas style uses (lum_min..lum_max) 0..100 pct with tolerance expansion.
    // Legacy style uses (min_lum..max_lum) in 0..1 linear.
    let frontend_style = lum_min.is_some() || lum_max.is_some();
    let feather_v = feather.unwrap_or(10.0).clamp(0.0, 100.0);
    let tol_v = tolerance.unwrap_or(20.0).max(0.0) / 100.0;

    let (min_l, max_l): (f32, f32) = if frontend_style {
        let mut l_min_pct = lum_min.unwrap_or(10.0).clamp(0.0, 100.0) / 100.0;
        let mut l_max_pct = lum_max.unwrap_or(90.0).clamp(0.0, 100.0) / 100.0;
        // tolerance expansion
        let band = (l_max_pct - l_min_pct).max(0.01);
        let expand = band * tol_v + 0.02;
        l_min_pct = (l_min_pct - expand).max(0.0);
        l_max_pct = (l_max_pct + expand).min(1.0);
        (l_min_pct, l_max_pct)
    } else {
        let ml = min_lum.unwrap_or(0.0).clamp(0.0, 1.0);
        let mx = max_lum.unwrap_or(1.0).clamp(0.0, 1.0);
        (ml.min(mx), ml.max(mx))
    };
    let feather_sigma = feather_v / 100.0 * 0.3; // Gaussian sigma for transition

    // Cast to usize before multiplying so large images can't overflow a u32.
    let mut mask_data = vec![0u8; (w as usize) * (h as usize)];

    for y in 0..h {
        for x in 0..w {
            let pixel = rgba.get_pixel(x, y);
            let lum = 0.299 * pixel[0] as f32 / 255.0
                + 0.587 * pixel[1] as f32 / 255.0
                + 0.114 * pixel[2] as f32 / 255.0;

            // Gaussian-shaped selection: peak in [min_l, max_l], falloff outside
            let intensity = if lum >= min_l && lum <= max_l {
                1.0
            } else if feather_sigma > 1e-6 {
                let dist = if lum < min_l {
                    min_l - lum
                } else {
                    lum - max_l
                };
                (-dist * dist / (2.0 * feather_sigma * feather_sigma)).exp()
            } else {
                0.0
            };

            let idx = (y as usize) * (w as usize) + (x as usize);
            mask_data[idx] = (intensity * 255.0).round().clamp(0.0, 255.0) as u8;
        }
    }

    // Apply additional feathering blur if requested
    if feather_v > 0.0 {
        let gray_mask = GrayImage::from_raw(w, h, mask_data.clone())
            .ok_or("Failed to create gray image for feathering")?;
        let sigma = feather_v / 100.0 * w.min(h) as f32 * 0.01;
        let blurred = imageproc::filter::gaussian_blur_f32(&gray_mask, sigma.max(0.01));
        mask_data = blurred.into_raw();
    }

    // Encode to PNG base64 data-URL for frontend compatibility (expects mask_data_base64 field)
    let gray_img = GrayImage::from_raw(w, h, mask_data)
        .ok_or("Failed to build final GrayImage (luminance)")?;
    let mut png_buf: Vec<u8> = Vec::with_capacity((w as usize) * (h as usize) * 2);
    {
        let mut cur = Cursor::new(&mut png_buf);
        image::codecs::png::PngEncoder::new(&mut cur)
            .write_image(
                gray_img.as_raw(),
                gray_img.width(),
                gray_img.height(),
                image::ExtendedColorType::L8,
            )
            .map_err(|e| format!("PNG encode failed: {}", e))?;
    }
    let b64 = general_purpose::STANDARD.encode(&png_buf);
    let data_url = format!("data:image/png;base64,{}", b64);

    Ok(AiDepthMaskParameters {
        mask_data_base64: Some(data_url),
        min_depth: 0.0,
        max_depth: 100.0,
        min_fade: 0.0,
        max_fade: 0.0,
        feather: feather_v,
        rotation: None,
        flip_horizontal: None,
        flip_vertical: None,
        orientation_steps: None,
    })
}

// ---------------------------------------------------------------------------
// Mask Feather
// ---------------------------------------------------------------------------

/// Apply Gaussian feathering to the bitmap of the mask container that owns
/// `sub_mask_id`. The caller (frontend) passes the current adjustments and the
/// sub-mask id; the backend generates the resolved mask bitmap, applies the
/// feather blur, and returns a PNG base64 data URL compatible with the existing
/// `mask_data_base64` parameter format.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn apply_mask_feather(
    state: tauri::State<AppState>,
    js_adjustments: Option<serde_json::Value>,
    path: Option<String>,
    sub_mask_id: String,
    feather: f32,
    rotation: Option<f32>,
    flip_horizontal: Option<bool>,
    flip_vertical: Option<bool>,
    orientation_steps: Option<u8>,
) -> Result<AiSkyMaskParameters, String> {
    let _ = path;

    if sub_mask_id.is_empty() {
        return Err("subMaskId is required".to_string());
    }

    let mut adjustments = js_adjustments.unwrap_or_default();
    crate::adjustment_utils::hydrate_adjustments(&state, &mut adjustments);

    // Locate the mask container that contains the requested sub-mask.
    let masks_value = adjustments.get("masks").cloned().unwrap_or_default();
    let mask_containers = masks_value.as_array().cloned().unwrap_or_default();

    let mut target_mask_def: Option<MaskDefinition> = None;
    for mut container in mask_containers {
        // Hydrate cached mask data for sub-masks in this container.
        if let Some(sub_masks) = container.get_mut("subMasks").and_then(|v| v.as_array_mut()) {
            let mut cache = state.patch_cache.lock().unwrap_or_else(|e| {
                log::warn!("Mutex poisoned");
                e.into_inner()
            });
            crate::adjustment_utils::hydrate_sub_masks(sub_masks, &mut cache);
        }

        let mask_def: MaskDefinition = serde_json::from_value(container)
            .map_err(|e| format!("Failed to parse mask definition: {}", e))?;

        if mask_def.sub_masks.iter().any(|sm| sm.id == sub_mask_id) {
            target_mask_def = Some(mask_def);
            break;
        }
    }

    let mut mask_def = target_mask_def.ok_or_else(|| {
        format!(
            "Mask container containing sub-mask '{}' not found",
            sub_mask_id
        )
    })?;

    // Isolate the target sub-mask so feathering applies to its own bitmap rather
    // than the combined container bitmap.
    mask_def.sub_masks.retain(|sm| sm.id == sub_mask_id);
    if mask_def.sub_masks.is_empty() {
        return Err(format!(
            "Sub-mask '{}' was removed during isolation",
            sub_mask_id
        ));
    }

    let loaded_image = state
        .original_image
        .lock_resilient()
        .clone()
        .ok_or("No original image loaded")?;
    let (width, height) = loaded_image.image.as_ref().dimensions();
    if width == 0 || height == 0 {
        return Err("Image has zero dimensions".to_string());
    }

    let warped_image =
        resolve_warped_image_for_masks(&state, &adjustments, std::slice::from_ref(&mask_def));

    let mask_bitmap = generate_mask_bitmap(
        &mask_def,
        width,
        height,
        1.0,
        (0.0, 0.0),
        warped_image.as_deref(),
    )
    .ok_or_else(|| "Failed to generate mask bitmap".to_string())?;

    // Apply Gaussian feather using the same percentage-to-sigma mapping used by
    // the color/luminance range mask generators.
    let feather_v = feather.clamp(0.0, 100.0);
    let final_mask = if feather_v > 0.01 {
        let sigma = feather_v / 100.0 * width.min(height) as f32 * 0.01;
        imageproc::filter::gaussian_blur_f32(&mask_bitmap, sigma.max(0.01))
    } else {
        mask_bitmap
    };

    let mut png_buf = Cursor::new(Vec::new());
    final_mask
        .write_to(&mut png_buf, ImageFormat::Png)
        .map_err(|e| format!("PNG encode failed: {}", e))?;
    let b64 = general_purpose::STANDARD.encode(png_buf.get_ref());
    let data_url = format!("data:image/png;base64,{}", b64);

    Ok(AiSkyMaskParameters {
        mask_data_base64: Some(data_url),
        rotation,
        flip_horizontal,
        flip_vertical,
        orientation_steps,
    })
}

// ---------------------------------------------------------------------------
// Internal HSL conversion (for mask_generation module)
// ---------------------------------------------------------------------------

fn rgb_to_hsl_internal(r: f32, g: f32, b: f32) -> (f32, f32, f32) {
    let max_c = r.max(g).max(b);
    let min_c = r.min(g).min(b);
    let l = (max_c + min_c) / 2.0;

    if (max_c - min_c).abs() < 1e-6 {
        return (0.0, 0.0, l);
    }

    let d = max_c - min_c;
    let s = if l > 0.5 {
        d / (2.0 - max_c - min_c)
    } else {
        d / (max_c + min_c)
    };

    let h = if (max_c - r).abs() < 1e-6 {
        (g - b) / d + if g < b { 6.0 } else { 0.0 }
    } else if (max_c - g).abs() < 1e-6 {
        (b - r) / d + 2.0
    } else {
        (r - g) / d + 4.0
    };

    (h * 60.0, s, l)
}
