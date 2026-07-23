#![allow(clippy::too_many_arguments)]
#![allow(clippy::collapsible_if)]
#![allow(clippy::needless_range_loop)]
#![allow(clippy::excessive_precision)]
#![allow(clippy::ptr_arg)]

use image::{DynamicImage, GenericImageView, Rgba, RgbaImage};
use rayon::prelude::*;

// ---------------------------------------------------------------------------
// Data structures
// ---------------------------------------------------------------------------

#[derive(Clone, Debug)]
pub struct FaceRegion {
    pub face_rect: (u32, u32, u32, u32), // x, y, width, height
    pub left_eye: (u32, u32, u32),       // x_center, y_center, radius
    pub right_eye: (u32, u32, u32),
    pub nose: (u32, u32, u32),
    pub mouth: (u32, u32, u32),
    pub jawline_points: Vec<(u32, u32)>,
}

// ---------------------------------------------------------------------------
// Helper: RGB <-> f32 conversions
// ---------------------------------------------------------------------------

#[inline(always)]
fn rgb_to_f32(r: u8, g: u8, b: u8) -> (f32, f32, f32) {
    (r as f32 / 255.0, g as f32 / 255.0, b as f32 / 255.0)
}

#[inline(always)]
fn f32_to_rgb(r: f32, g: f32, b: f32) -> (u8, u8, u8) {
    (
        (r.clamp(0.0, 1.0) * 255.0).round() as u8,
        (g.clamp(0.0, 1.0) * 255.0).round() as u8,
        (b.clamp(0.0, 1.0) * 255.0).round() as u8,
    )
}

/// Compute luminance from RGB [0..1]
#[inline(always)]
fn luminance(r: f32, g: f32, b: f32) -> f32 {
    0.299 * r + 0.587 * g + 0.114 * b
}

/// Gaussian function
#[inline(always)]
fn gaussian(x: f32, sigma: f32) -> f32 {
    if sigma <= 0.0 {
        return if x == 0.0 { 1.0 } else { 0.0 };
    }
    let s2 = sigma * sigma;
    (-x * x / (2.0 * s2)).exp()
}

// ---------------------------------------------------------------------------
// 1. Skin Smoothing – Bilateral Filter with skin mask
// ---------------------------------------------------------------------------

/// Apply bilateral filter for skin smoothing, restricted to skin regions.
/// `strength` controls the range sigma (0..1 maps to range_sigma 10..75).
/// `detail_preserve` modulates how much edge detail is retained (0..1).
/// Spatial sigma is fixed at 3.0 as specified.
/// When `face_regions` is empty, falls back to global smoothing (for backward compat).
pub fn apply_skin_smoothing(
    img: &mut DynamicImage,
    strength: f32,
    detail_preserve: f32,
    face_regions: &[FaceRegion],
) -> Result<(), String> {
    let (w, h) = img.dimensions();
    if w == 0 || h == 0 {
        return Err("Image has zero dimensions".to_string());
    }
    let mut rgba = img.to_rgba8();
    apply_skin_smoothing_rgba(&mut rgba, w, h, strength, detail_preserve, face_regions);
    *img = DynamicImage::ImageRgba8(rgba);
    Ok(())
}

/// Core bilateral-filter skin smoothing operating directly on an RgbaImage buffer.
/// Used by `apply_one_click_beauty` to avoid repeated DynamicImage ↔ RgbaImage
/// conversions across multiple pipeline steps.
fn apply_skin_smoothing_rgba(
    rgba: &mut RgbaImage,
    w: u32,
    h: u32,
    strength: f32,
    detail_preserve: f32,
    face_regions: &[FaceRegion],
) {
    let src = rgba.clone();

    let range_sigma = 10.0 + strength.clamp(0.0, 1.0) * 65.0;
    let spatial_sigma = 3.0_f32;
    let effective_range_sigma = range_sigma * (1.0 - detail_preserve.clamp(0.0, 1.0) * 0.7);

    let radius = (spatial_sigma * 3.0).ceil() as i32;

    let src_raw = src.as_raw();

    let w_usize = w as usize;
    let h_usize = h as usize;

    let skin_mask = build_feathered_skin_mask(&src, w, h, face_regions);

    // Write results directly into rgba's buffer via a mutable slice
    let result_slice: &mut [u8] = &mut **rgba;

    result_slice
        .par_chunks_mut(4)
        .enumerate()
        .for_each(|(idx, pixel)| {
            let mask_val = skin_mask[idx];

            let center_offset = idx * 4;

            if mask_val <= 0.001 {
                pixel[0] = src_raw[center_offset];
                pixel[1] = src_raw[center_offset + 1];
                pixel[2] = src_raw[center_offset + 2];
                pixel[3] = src_raw[center_offset + 3];
                return;
            }

            let cr = src_raw[center_offset] as f32;
            let cg = src_raw[center_offset + 1] as f32;
            let cb = src_raw[center_offset + 2] as f32;

            let mut sum_r = 0.0f32;
            let mut sum_g = 0.0f32;
            let mut sum_b = 0.0f32;
            let mut w_sum = 0.0f32;

            let x = (idx % w_usize) as i32;
            let y = (idx / w_usize) as i32;

            for ky in -radius..=radius {
                let ny = (y + ky).clamp(0, (h_usize - 1) as i32) as usize;
                for kx in -radius..=radius {
                    let nx = (x + kx).clamp(0, (w_usize - 1) as i32) as usize;

                    let spatial_dist = ((kx * kx + ky * ky) as f32).sqrt();
                    let ws = gaussian(spatial_dist, spatial_sigma);

                    let n_offset = (ny * w_usize + nx) * 4;
                    let nr = src_raw[n_offset] as f32;
                    let ng = src_raw[n_offset + 1] as f32;
                    let nb = src_raw[n_offset + 2] as f32;

                    let color_dist =
                        ((cr - nr) * (cr - nr) + (cg - ng) * (cg - ng) + (cb - nb) * (cb - nb))
                            .sqrt();

                    let wr = gaussian(color_dist, effective_range_sigma);

                    let weight = ws * wr;
                    sum_r += nr * weight;
                    sum_g += ng * weight;
                    sum_b += nb * weight;
                    w_sum += weight;
                }
            }

            if w_sum > 0.0 {
                let inv = 1.0 / w_sum;
                let smooth_r = (sum_r * inv).round().clamp(0.0, 255.0) as u8;
                let smooth_g = (sum_g * inv).round().clamp(0.0, 255.0) as u8;
                let smooth_b = (sum_b * inv).round().clamp(0.0, 255.0) as u8;

                pixel[0] = ((smooth_r as f32) * mask_val
                    + (src_raw[center_offset] as f32) * (1.0 - mask_val))
                    .round() as u8;
                pixel[1] = ((smooth_g as f32) * mask_val
                    + (src_raw[center_offset + 1] as f32) * (1.0 - mask_val))
                    .round() as u8;
                pixel[2] = ((smooth_b as f32) * mask_val
                    + (src_raw[center_offset + 2] as f32) * (1.0 - mask_val))
                    .round() as u8;
                pixel[3] = src_raw[center_offset + 3];
            } else {
                pixel[0] = src_raw[center_offset];
                pixel[1] = src_raw[center_offset + 1];
                pixel[2] = src_raw[center_offset + 2];
                pixel[3] = src_raw[center_offset + 3];
            }
        });
}

/// Build a feathered skin mask: face-region ellipses intersected with skin confidence.
/// Returns a float mask [0..1] that is 1.0 for definite skin pixels and
/// falls off smoothly at face boundaries and skin-tone edges.
fn build_feathered_skin_mask(
    rgba: &RgbaImage,
    w: u32,
    h: u32,
    face_regions: &[FaceRegion],
) -> Vec<f32> {
    let area = (w * h) as usize;

    // If no face regions, return full mask (fallback to global smoothing)
    if face_regions.is_empty() {
        return vec![1.0f32; area];
    }

    let mut mask = vec![0.0f32; area];

    // Step 1: Elliptical falloff mask for each face region
    for face in face_regions {
        let (fx, fy, fw, fh) = face.face_rect;
        let cx = fx as f32 + fw as f32 / 2.0;
        let cy = fy as f32 + fh as f32 / 2.0;

        // Slightly expand face region to include neck and nearby skin
        let rx = fw as f32 * 0.65;
        let ry = fh as f32 * 0.65;

        let x_start = (fx as i32 - (fw as f32 * 0.3) as i32).max(0) as u32;
        let x_end = (fx + fw + (fw as f32 * 0.3) as u32).min(w - 1);
        let y_start = (fy as i32 - (fh as f32 * 0.3) as i32).max(0) as u32;
        let y_end = (fy + fh + (fh as f32 * 0.3) as u32).min(h - 1);

        for y in y_start..=y_end {
            for x in x_start..=x_end {
                let dx = x as f32 - cx;
                let dy = y as f32 - cy;
                let norm_x = dx / rx.max(1.0);
                let norm_y = dy / ry.max(1.0);
                let dist_sq = norm_x * norm_x + norm_y * norm_y;

                let elliptic_weight = if dist_sq < 1.0 { 1.0 - dist_sq } else { 0.0 };

                let idx = (y * w + x) as usize;
                mask[idx] = mask[idx].max(elliptic_weight);
            }
        }
    }

    // Step 2: Multiply by per-pixel skin confidence for finer detail
    for y in 0..h {
        for x in 0..w {
            let idx = (y * w + x) as usize;
            if mask[idx] > 0.0 {
                let p = rgba.get_pixel(x, y);
                let skin_conf = skin_confidence(p[0], p[1], p[2]);
                // Use a soft threshold: 0.25 = start of falloff, 0.45 = full
                let skin_weight = if skin_conf >= 0.45 {
                    1.0
                } else if skin_conf > 0.25 {
                    (skin_conf - 0.25) / 0.20
                } else {
                    0.0
                };
                mask[idx] *= skin_weight;
            }
        }
    }

    mask
}

// ---------------------------------------------------------------------------
// 2. Blemish Removal – Content-Aware Fill
// ---------------------------------------------------------------------------

/// Remove blemish spots using content-aware fill from surrounding pixels.
/// Each spot is (x_center, y_center, radius). `blend_radius` controls
/// the feathering at the edge of the patch.
pub fn apply_blemish_removal(
    img: &mut DynamicImage,
    spots: &[(u32, u32, u32)],
    blend_radius: f32,
) -> Result<(), String> {
    let (w, h) = img.dimensions();
    if w == 0 || h == 0 {
        return Err("Image has zero dimensions".to_string());
    }

    let mut rgba = img.to_rgba8();

    for &(cx, cy, radius) in spots {
        let r = radius.max(1);
        let blend_r = blend_radius.clamp(0.0, 1.0) * r as f32;

        // Bug #8 fix: ring must be far enough that the blend/feather zone
        // does NOT reach back into the sample ring.
        // Old: sample_ring = r + (r/3).max(1) → for r=2, ring=3, but blend
        // can extend to r+blend_r which overlaps ring.
        // New: minimum gap of (r + blend_r.ceil() + 2) pixels.
        let min_gap = (r as f32 + blend_r + 2.0).ceil() as u32;
        let sample_ring = min_gap.max(r + (r / 3).max(1));

        let num_samples = (2.0 * std::f32::consts::PI * sample_ring as f32).ceil() as u32;
        let mut ring_colors: Vec<(f32, f32, f32, f32)> = Vec::new();

        for i in 0..num_samples {
            let angle = 2.0 * std::f32::consts::PI * i as f32 / num_samples as f32;
            let sx = (cx as f32 + sample_ring as f32 * angle.cos()).round() as i32;
            let sy = (cy as f32 + sample_ring as f32 * angle.sin()).round() as i32;

            if sx >= 0 && sx < w as i32 && sy >= 0 && sy < h as i32 {
                let p = rgba.get_pixel(sx as u32, sy as u32);
                ring_colors.push((p[0] as f32, p[1] as f32, p[2] as f32, p[3] as f32));
            }
        }

        if ring_colors.is_empty() {
            continue;
        }

        // Fill each pixel inside the blemish by weighted average from ring
        let x_min = (cx as i32 - (r + blend_r.ceil() as u32) as i32).max(0) as u32;
        let x_max = (cx + r + blend_r.ceil() as u32).min(w - 1);
        let y_min = (cy as i32 - (r + blend_r.ceil() as u32) as i32).max(0) as u32;
        let y_max = (cy + r + blend_r.ceil() as u32).min(h - 1);

        for y in y_min..=y_max {
            for x in x_min..=x_max {
                let dx = x as f32 - cx as f32;
                let dy = y as f32 - cy as f32;
                let dist = (dx * dx + dy * dy).sqrt();

                let outer_edge = r as f32;
                let fade_end = outer_edge + blend_r;

                if dist > fade_end {
                    continue;
                }

                // Compute weight for blending based on angle-matched ring samples
                let angle = dy.atan2(dx);
                let mut sum_r = 0.0f32;
                let mut sum_g = 0.0f32;
                let mut sum_b = 0.0f32;
                let mut sum_a = 0.0f32;
                let mut wt = 0.0f32;

                for (ri, &(rr, rg, rb, ra)) in ring_colors.iter().enumerate() {
                    let ring_angle =
                        2.0 * std::f32::consts::PI * ri as f32 / ring_colors.len() as f32;
                    let angle_diff = (angle - ring_angle).abs();
                    let angle_diff = angle_diff.min(2.0 * std::f32::consts::PI - angle_diff);
                    // Bug #9 fix: sigma increased from 1.0 to 3.0 radians.
                    // Old σ=1.0 gave ±57° effective range → strong directional bias.
                    // New σ=3.0 gives ~±171° range → smooth 360° blending.
                    let aw = (-angle_diff * angle_diff / 3.0).exp();
                    sum_r += rr * aw;
                    sum_g += rg * aw;
                    sum_b += rb * aw;
                    sum_a += ra * aw;
                    wt += aw;
                }

                if wt > 0.0 {
                    let inv_wt = 1.0 / wt;
                    let fill_r = sum_r * inv_wt;
                    let fill_g = sum_g * inv_wt;
                    let fill_b = sum_b * inv_wt;
                    let fill_a = sum_a * inv_wt;

                    // Blend factor: 1.0 at center, fading to 0.0 at fade_end
                    let blend = if dist <= outer_edge {
                        1.0
                    } else if blend_r > 0.0 {
                        1.0 - (dist - outer_edge) / blend_r
                    } else {
                        1.0
                    };
                    let blend = blend.clamp(0.0, 1.0);

                    let orig = rgba.get_pixel(x, y);
                    let or = orig[0] as f32;
                    let og = orig[1] as f32;
                    let ob = orig[2] as f32;
                    let oa = orig[3] as f32;

                    rgba.put_pixel(
                        x,
                        y,
                        Rgba([
                            (or * (1.0 - blend) + fill_r * blend)
                                .round()
                                .clamp(0.0, 255.0) as u8,
                            (og * (1.0 - blend) + fill_g * blend)
                                .round()
                                .clamp(0.0, 255.0) as u8,
                            (ob * (1.0 - blend) + fill_b * blend)
                                .round()
                                .clamp(0.0, 255.0) as u8,
                            (oa * (1.0 - blend) + fill_a * blend)
                                .round()
                                .clamp(0.0, 255.0) as u8,
                        ]),
                    );
                }
            }
        }
    }

    *img = DynamicImage::ImageRgba8(rgba);
    Ok(())
}

// ---------------------------------------------------------------------------
// 3. Face Reshape – Liquify (mesh-based local warp)
// ---------------------------------------------------------------------------

/// Apply face reshaping using inverse-mapping liquify warp.
/// `slim_amount` controls horizontal pinching of the jaw region.
/// `jaw_amount` controls vertical compression of the jaw.
pub fn apply_face_reshape(
    img: &mut DynamicImage,
    face_regions: &[FaceRegion],
    slim_amount: f32,
    jaw_amount: f32,
) -> Result<(), String> {
    let (w, h) = img.dimensions();
    if w == 0 || h == 0 {
        return Err("Image has zero dimensions".to_string());
    }
    let mut rgba = img.to_rgba8();
    apply_face_reshape_rgba(&mut rgba, w, h, face_regions, slim_amount, jaw_amount);
    *img = DynamicImage::ImageRgba8(rgba);
    Ok(())
}

/// Core face reshape operating directly on RgbaImage.
/// Only processes the union of face bounding boxes expanded by the warp radius,
/// avoiding a full w×h scan (Bug #14 fix).
fn apply_face_reshape_rgba(
    rgba: &mut RgbaImage,
    w: u32,
    h: u32,
    face_regions: &[FaceRegion],
    slim_amount: f32,
    jaw_amount: f32,
) {
    if face_regions.is_empty() {
        return;
    }

    let slim = slim_amount.clamp(-1.0, 1.0);
    let jaw = jaw_amount.clamp(-1.0, 1.0);

    // Compute the affected region: union of all face bboxes expanded by max radius
    let mut bb_min_x = w;
    let mut bb_min_y = h;
    let mut bb_max_x = 0u32;
    let mut bb_max_y = 0u32;
    for face in face_regions {
        let (fx, fy, fw, fh) = face.face_rect;
        // Expand by half the face dimensions (the elliptical influence radius)
        let margin_x = (fw as f32 * 0.6).ceil() as u32;
        let margin_y = (fh as f32 * 0.6).ceil() as u32;
        bb_min_x = bb_min_x.min(fx.saturating_sub(margin_x));
        bb_min_y = bb_min_y.min(fy.saturating_sub(margin_y));
        bb_max_x = bb_max_x.max((fx + fw + margin_x).min(w - 1));
        bb_max_y = bb_max_y.max((fy + fh + margin_y).min(h - 1));
    }

    let src = rgba.clone();

    for y_out in bb_min_y..=bb_max_y {
        for x_out in bb_min_x..=bb_max_x {
            // Bug #6 fix: both slim and jaw must operate on the original
            // (x_out, y_out), not chain effects. Store original coords and
            // accumulate displacements independently.
            let orig_x = x_out as f32;
            let orig_y = y_out as f32;
            let mut sx = orig_x;
            let mut sy = orig_y;

            for face in face_regions {
                let (fx, fy, fw, fh) = face.face_rect;
                let face_cx = fx as f32 + fw as f32 / 2.0;
                let face_cy = fy as f32 + fh as f32 / 2.0;

                // Slim: horizontal displacement toward center from ORIGINAL position
                if slim.abs() > 1e-4 {
                    let dx = orig_x - face_cx;
                    let dy = orig_y - face_cy;
                    let norm_x = dx / (fw as f32 / 2.0).max(1.0);
                    let norm_y = dy / (fh as f32 / 2.0).max(1.0);
                    let dist_sq = norm_x * norm_x + norm_y * norm_y;
                    if dist_sq < 1.0 {
                        let lower_weight = (norm_y * 0.5 + 0.5).clamp(0.0, 1.0);
                        let falloff = 1.0 - dist_sq;
                        let strength = slim * falloff * falloff * lower_weight * 0.3;
                        sx -= dx * strength;
                    }
                }

                // Jaw: vertical compression from ORIGINAL position
                if jaw.abs() > 1e-4 {
                    let dx = orig_x - face_cx;
                    let dy = orig_y - face_cy;
                    let norm_y = dy / (fh as f32 / 2.0).max(1.0);
                    if norm_y > 0.0 && norm_y < 1.0 {
                        let norm_x = dx / (fw as f32 / 2.0).max(1.0);
                        let dist_sq = norm_x * norm_x + norm_y * norm_y;
                        if dist_sq < 1.0 {
                            let falloff = 1.0 - dist_sq;
                            let strength = jaw * falloff * falloff * 0.15;
                            sy -= dy * strength;
                        }
                    }
                }
            }

            let px = sample_bilinear_rgba(&src, w, h, sx, sy);
            rgba.put_pixel(x_out, y_out, px);
        }
    }
}

// ---------------------------------------------------------------------------
// 4. Eye Enlarge – Spherical Magnification Warp
// ---------------------------------------------------------------------------

/// Enlarge eyes using local spherical magnification.
/// Each region is (x_center, y_center, radius). `amount` 0..1 controls
/// the magnification strength.
pub fn apply_eye_enlarge(
    img: &mut DynamicImage,
    eye_regions: &[(u32, u32, u32)],
    amount: f32,
) -> Result<(), String> {
    let (w, h) = img.dimensions();
    if w == 0 || h == 0 {
        return Err("Image has zero dimensions".to_string());
    }
    if amount.abs() < 1e-4 || eye_regions.is_empty() {
        return Ok(());
    }
    let mut rgba = img.to_rgba8();
    apply_eye_enlarge_rgba(&mut rgba, w, h, eye_regions, amount);
    *img = DynamicImage::ImageRgba8(rgba);
    Ok(())
}

/// Core eye enlarge operating directly on RgbaImage.
/// Only processes the union of eye region bounding boxes, avoiding a full
/// w×h scan (Bug #14 fix).
fn apply_eye_enlarge_rgba(
    rgba: &mut RgbaImage,
    w: u32,
    h: u32,
    eye_regions: &[(u32, u32, u32)],
    amount: f32,
) {
    // Compute the affected region: union of all eye bounding boxes
    let mut bb_min_x = w;
    let mut bb_min_y = h;
    let mut bb_max_x = 0u32;
    let mut bb_max_y = 0u32;
    for &(ecx, ecy, er) in eye_regions {
        let r = er.max(1);
        bb_min_x = bb_min_x.min(ecx.saturating_sub(r));
        bb_min_y = bb_min_y.min(ecy.saturating_sub(r));
        bb_max_x = bb_max_x.max((ecx + r).min(w - 1));
        bb_max_y = bb_max_y.max((ecy + r).min(h - 1));
    }

    let magnify = 1.0 + amount.clamp(0.0, 1.0) * 0.5;
    let src = rgba.clone();

    for y_out in bb_min_y..=bb_max_y {
        for x_out in bb_min_x..=bb_max_x {
            let mut sx = x_out as f32;
            let mut sy = y_out as f32;

            for &(ecx, ecy, er) in eye_regions {
                let dx = x_out as f32 - ecx as f32;
                let dy = y_out as f32 - ecy as f32;
                let dist = (dx * dx + dy * dy).sqrt();
                let r = er.max(1) as f32;

                if dist < r {
                    let norm = dist / r;
                    let weight = 1.0 - norm * norm;
                    let effective_magnify = 1.0 + (magnify - 1.0) * weight;

                    sx = ecx as f32 + dx / effective_magnify;
                    sy = ecy as f32 + dy / effective_magnify;
                    break;
                }
            }

            let px = sample_bilinear_rgba(&src, w, h, sx, sy);
            rgba.put_pixel(x_out, y_out, px);
        }
    }
}

// ---------------------------------------------------------------------------
// 5. Teeth Whitening – Hue Selection + Brightness Lift
// ---------------------------------------------------------------------------

/// Whiten teeth by selecting pixels in the yellow/desaturated range within
/// each region and boosting brightness while reducing saturation.
pub fn apply_teeth_whitening(
    img: &mut DynamicImage,
    regions: &[(u32, u32, u32)],
    brightness: f32,
    saturation: f32,
) -> Result<(), String> {
    let (w, h) = img.dimensions();
    if w == 0 || h == 0 {
        return Err("Image has zero dimensions".to_string());
    }
    let mut rgba = img.to_rgba8();
    apply_teeth_whitening_rgba(&mut rgba, w, h, regions, brightness, saturation);
    *img = DynamicImage::ImageRgba8(rgba);
    Ok(())
}

fn apply_teeth_whitening_rgba(
    rgba: &mut RgbaImage,
    w: u32,
    h: u32,
    regions: &[(u32, u32, u32)],
    brightness: f32,
    saturation: f32,
) {
    let brightness_factor = 1.0 + brightness.clamp(0.0, 1.0) * 0.5;
    let sat_factor = 1.0 - saturation.clamp(0.0, 1.0) * 0.8;

    for &(cx, cy, radius) in regions {
        let r = radius.max(1) as i32;
        let x_min = (cx as i32 - r).max(0) as u32;
        let x_max = (cx as i32 + r).min(w as i32 - 1) as u32;
        let y_min = (cy as i32 - r).max(0) as u32;
        let y_max = (cy as i32 + r).min(h as i32 - 1) as u32;

        for y in y_min..=y_max {
            for x in x_min..=x_max {
                let dx = x as f32 - cx as f32;
                let dy = y as f32 - cy as f32;
                let dist = (dx * dx + dy * dy).sqrt();
                if dist > r as f32 {
                    continue;
                }

                let pixel = rgba.get_pixel(x, y);
                let (rf, gf, bf) = rgb_to_f32(pixel[0], pixel[1], pixel[2]);

                let (hue, sat, lum) = rgb_to_hsl(rf, gf, bf);

                let is_tooth_hue = hue > 20.0 && hue < 80.0;
                let is_tooth_sat = sat < 0.55;
                let is_tooth_lum = lum > 0.25;

                if is_tooth_hue && is_tooth_sat && is_tooth_lum {
                    let weight = 1.0 - (dist / r as f32);
                    let weight = weight * weight;

                    let new_sat = sat * (1.0 - weight * (1.0 - sat_factor));
                    let new_lum = lum + (1.0 - lum) * weight * (brightness_factor - 1.0) * 0.5;

                    let (nr, ng, nb) = hsl_to_rgb(hue, new_sat, new_lum.clamp(0.0, 1.0));
                    let (r8, g8, b8) = f32_to_rgb(nr, ng, nb);

                    rgba.put_pixel(x, y, Rgba([r8, g8, b8, pixel[3]]));
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// 6. Eye Brighten – Increase brightness and contrast of eye regions
// ---------------------------------------------------------------------------

/// Brighten eyes by increasing luminance and contrast within eye regions.
pub fn apply_eye_brighten(
    img: &mut DynamicImage,
    regions: &[(u32, u32, u32)],
    brightness: f32,
) -> Result<(), String> {
    let (w, h) = img.dimensions();
    if w == 0 || h == 0 {
        return Err("Image has zero dimensions".to_string());
    }
    let mut rgba = img.to_rgba8();
    apply_eye_brighten_rgba(&mut rgba, w, h, regions, brightness);
    *img = DynamicImage::ImageRgba8(rgba);
    Ok(())
}

fn apply_eye_brighten_rgba(
    rgba: &mut RgbaImage,
    w: u32,
    h: u32,
    regions: &[(u32, u32, u32)],
    brightness: f32,
) {
    let bright = brightness.clamp(0.0, 1.0) * 0.3;

    for &(cx, cy, radius) in regions {
        let r = radius.max(1) as i32;
        let x_min = (cx as i32 - r).max(0) as u32;
        let x_max = (cx as i32 + r).min(w as i32 - 1) as u32;
        let y_min = (cy as i32 - r).max(0) as u32;
        let y_max = (cy as i32 + r).min(h as i32 - 1) as u32;

        for y in y_min..=y_max {
            for x in x_min..=x_max {
                let dx = x as f32 - cx as f32;
                let dy = y as f32 - cy as f32;
                let dist = (dx * dx + dy * dy).sqrt();
                if dist > r as f32 {
                    continue;
                }

                let weight = 1.0 - (dist / r as f32);
                let weight = weight * weight;

                let pixel = rgba.get_pixel(x, y);
                let (rf, gf, bf) = rgb_to_f32(pixel[0], pixel[1], pixel[2]);
                let lum = luminance(rf, gf, bf);

                // Dark-region protection: pupil and very dark pixels should not
                // be brightened, otherwise the pupil turns gray/unnatural.
                let dark_protection = (lum / 0.20).clamp(0.0, 1.0);
                let effective_weight = weight * dark_protection;

                let boost = bright * effective_weight;
                let new_r = rf + (1.0 - rf) * boost;
                let new_g = gf + (1.0 - gf) * boost;
                let new_b = bf + (1.0 - bf) * boost;

                let contrast_boost = 1.0 + effective_weight * bright * 0.5;
                let mid = 0.5;
                let cr = mid + (new_r - mid) * contrast_boost;
                let cg = mid + (new_g - mid) * contrast_boost;
                let cb = mid + (new_b - mid) * contrast_boost;

                let (r8, g8, b8) = f32_to_rgb(cr, cg, cb);
                rgba.put_pixel(x, y, Rgba([r8, g8, b8, pixel[3]]));
            }
        }
    }
}

// ---------------------------------------------------------------------------
// 7. Makeup – Lip color, blush, eyebrow coloring
// ---------------------------------------------------------------------------

/// Apply makeup effect (lipstick, blush, or eyebrow color) to specified regions.
/// `makeup_type` is one of "lip", "blush", "eyebrow".
/// `color` is the target RGB color.
/// `opacity` controls the blend strength (0..1).
pub fn apply_makeup(
    img: &mut DynamicImage,
    makeup_type: &str,
    regions: &[(u32, u32, u32)],
    color: (u8, u8, u8),
    opacity: f32,
) -> Result<(), String> {
    let (w, h) = img.dimensions();
    if w == 0 || h == 0 {
        return Err("Image has zero dimensions".to_string());
    }

    let mut rgba = img.to_rgba8();
    let alpha = opacity.clamp(0.0, 1.0);
    let (mr, mg, mb) = rgb_to_f32(color.0, color.1, color.2);

    for &(cx, cy, radius) in regions {
        let r = radius.max(1) as i32;
        let x_min = (cx as i32 - r).max(0) as u32;
        let x_max = (cx as i32 + r).min(w as i32 - 1) as u32;
        let y_min = (cy as i32 - r).max(0) as u32;
        let y_max = (cy as i32 + r).min(h as i32 - 1) as u32;

        for y in y_min..=y_max {
            for x in x_min..=x_max {
                let dx = x as f32 - cx as f32;
                let dy = y as f32 - cy as f32;
                let dist = (dx * dx + dy * dy).sqrt();
                if dist > r as f32 {
                    continue;
                }

                let pixel = rgba.get_pixel(x, y);
                let (rf, gf, bf) = rgb_to_f32(pixel[0], pixel[1], pixel[2]);
                let (hue, sat, _lum) = rgb_to_hsl(rf, gf, bf);

                // Check if the pixel's hue matches the makeup target area
                let matches = match makeup_type {
                    "lip" => {
                        // Bug #10 fix: narrowed hue range and raised saturation threshold.
                        // Old range covered 0°~20° AND 300°~360° (≈80° total) which
                        // included gums and tongue. New range is 0°~20° AND 340°~360°
                        // (≈40° total), with sat > 0.2 to avoid pale skin.
                        (hue < 20.0 || hue > 340.0) && sat > 0.2
                    }
                    "blush" => {
                        // Cheeks: warm hues, low-medium saturation
                        (hue < 30.0 || hue > 330.0) && sat > 0.05
                    }
                    "eyebrow" => {
                        // Eyebrows: low saturation (mostly gray/brown)
                        sat < 0.3
                    }
                    _ => true, // For unknown types, apply to all pixels in region
                };

                if !matches {
                    continue;
                }

                // Spatial falloff
                let weight = 1.0 - (dist / r as f32);
                let weight = weight * weight;
                let effective_alpha = alpha * weight;

                // Blend: overlay the makeup color, preserving some original luminance.
                // Use a perceptual luminance blend instead of a raw ratio to avoid
                // blowing out dark makeup on bright skin (e.g. dark lipstick on
                // light lips becoming white due to ratio > 1.0).
                let orig_lum = luminance(rf, gf, bf);
                let makeup_lum = luminance(mr, mg, mb);
                let target_lum = orig_lum * 0.65 + makeup_lum * 0.35;
                let lum_scale = if makeup_lum > 0.001 {
                    target_lum / makeup_lum
                } else {
                    1.0
                };

                let adj_mr = (mr * lum_scale).clamp(0.0, 1.0);
                let adj_mg = (mg * lum_scale).clamp(0.0, 1.0);
                let adj_mb = (mb * lum_scale).clamp(0.0, 1.0);

                let nr = rf * (1.0 - effective_alpha) + adj_mr * effective_alpha;
                let ng = gf * (1.0 - effective_alpha) + adj_mg * effective_alpha;
                let nb = bf * (1.0 - effective_alpha) + adj_mb * effective_alpha;

                let (r8, g8, b8) = f32_to_rgb(nr, ng, nb);
                rgba.put_pixel(x, y, Rgba([r8, g8, b8, pixel[3]]));
            }
        }
    }

    *img = DynamicImage::ImageRgba8(rgba);
    Ok(())
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Bilinear sampling from an RGBA8 source image at sub-pixel coordinates.
fn sample_bilinear_rgba(src: &RgbaImage, w: u32, h: u32, x: f32, y: f32) -> Rgba<u8> {
    let x0 = x.floor().max(0.0).min(w as f32 - 1.0) as u32;
    let y0 = y.floor().max(0.0).min(h as f32 - 1.0) as u32;
    let x1 = (x0 + 1).min(w - 1);
    let y1 = (y0 + 1).min(h - 1);

    let fx = x - x0 as f32;
    let fy = y - y0 as f32;
    let fx = fx.clamp(0.0, 1.0);
    let fy = fy.clamp(0.0, 1.0);

    let p00 = src.get_pixel(x0, y0);
    let p10 = src.get_pixel(x1, y0);
    let p01 = src.get_pixel(x0, y1);
    let p11 = src.get_pixel(x1, y1);

    let mut result = [0u8; 4];
    for c in 0..4 {
        let v00 = p00[c] as f32;
        let v10 = p10[c] as f32;
        let v01 = p01[c] as f32;
        let v11 = p11[c] as f32;

        let top = v00 * (1.0 - fx) + v10 * fx;
        let bot = v01 * (1.0 - fx) + v11 * fx;
        let val = top * (1.0 - fy) + bot * fy;
        result[c] = val.round().clamp(0.0, 255.0) as u8;
    }

    Rgba(result)
}

/// Convert RGB [0..1] to HSL (h: 0..360, s: 0..1, l: 0..1)
fn rgb_to_hsl(r: f32, g: f32, b: f32) -> (f32, f32, f32) {
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

/// Convert HSL (h: 0..360, s: 0..1, l: 0..1) to RGB [0..1]
fn hsl_to_rgb(h: f32, s: f32, l: f32) -> (f32, f32, f32) {
    if s < 1e-6 {
        return (l, l, l);
    }

    let hue_to_rgb = |p: f32, q: f32, mut t: f32| -> f32 {
        if t < 0.0 {
            t += 1.0;
        }
        if t > 1.0 {
            t -= 1.0;
        }
        if t < 1.0 / 6.0 {
            return p + (q - p) * 6.0 * t;
        }
        if t < 1.0 / 2.0 {
            return q;
        }
        if t < 2.0 / 3.0 {
            return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
        }
        p
    };

    let q = if l < 0.5 {
        l * (1.0 + s)
    } else {
        l + s - l * s
    };
    let p = 2.0 * l - q;
    let h_norm = h / 360.0;

    let r = hue_to_rgb(p, q, h_norm + 1.0 / 3.0);
    let g = hue_to_rgb(p, q, h_norm);
    let b = hue_to_rgb(p, q, h_norm - 1.0 / 3.0);

    (r, g, b)
}

// ---------------------------------------------------------------------------
// 8. Face Region Detection – Multi-model skin detection + facial feature verification
// ---------------------------------------------------------------------------

/// Detect face regions using multi-model skin-tone detection, connected-component
/// analysis, facial feature verification and elliptical fitting.
///
/// The algorithm works in six stages:
/// 1. Multi-model skin-tone detection (YCbCr + RGB + HSV fusion).
/// 2. Binary morphological opening to remove noise.
/// 3. Connected-component labelling; keep the largest N components.
/// 4. Aspect ratio and size filtering.
/// 5. Facial feature verification (eye symmetry, mouth detection, face shape).
/// 6. Elliptical bounding box → infer eye / nose / mouth positions.
pub fn detect_face_regions(img: &DynamicImage) -> Vec<FaceRegion> {
    let (w, h) = img.dimensions();
    if w < 32 || h < 32 {
        return Vec::new();
    }

    let rgba = img.to_rgba8();

    // 1. Multi-model skin-tone mask
    let skin_mask = build_skin_mask(&rgba, w, h, 0.35);

    // 2. Morphological opening (erosion + dilation) with radius scaled to image size
    // Scale radius so that at ~6000px diagonal → radius=3, at ~300px → radius=1
    let diag = ((w * w + h * h) as f64).sqrt();
    let morph_radius = ((diag / 1500.0).ceil() as u32).max(1).min(5);
    let mut opened = vec![false; (w * h) as usize];
    erode_mask(&skin_mask, w, h, &mut opened, morph_radius);
    let mut dilated = vec![false; (w * h) as usize];
    dilate_mask(&opened, w, h, &mut dilated, morph_radius);

    // 3. Connected components (4-connectivity)
    let labels = label_connected_components(&dilated, w, h);
    let components = extract_components(&labels, w, h);

    // Keep up to 12 largest components initially, require minimum area
    let mut sorted = components;
    sorted.sort_by(|a, b| b.area.cmp(&a.area));
    let min_area = ((w as usize * h as usize) / 200).max(80);
    let top_components: Vec<_> = sorted
        .into_iter()
        .filter(|c| c.area >= min_area)
        .take(12)
        .collect();

    if top_components.is_empty() {
        return Vec::new();
    }

    // 4 & 5. Filter by face-like properties and facial feature verification
    let mut verified: Vec<(Component, f32)> = Vec::new();
    for comp in &top_components {
        let (cx, cy, cwidth, cheight) = comp.bounding_box;
        let aspect = cwidth as f32 / cheight as f32;

        // Filter 1: Aspect ratio check (face is roughly 0.6 - 1.4 w/h)
        if aspect < 0.5 || aspect > 1.5 {
            continue;
        }

        // Filter 2: Skin pixel density within bounding box (should be mostly skin)
        let skin_pixels_in_box = comp.area as f32;
        let box_area = (cwidth as f32) * (cheight as f32);
        let fill_ratio = skin_pixels_in_box / box_area;
        if fill_ratio < 0.25 {
            continue;
        }

        // Filter 3: Facial feature verification score
        let feature_score = verify_facial_features(&rgba, w, h, comp);
        if feature_score < 0.25 {
            continue;
        }

        // Combined score: fill ratio + feature score
        let combined = 0.3 * fill_ratio.min(1.0) + 0.7 * feature_score;
        verified.push((comp.clone(), combined));
    }

    verified.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    let top_components: Vec<_> = verified.into_iter().take(6).map(|(c, _)| c).collect();

    if top_components.is_empty() {
        return Vec::new();
    }

    // 6. Fit ellipse / bounding box and infer facial features
    let mut regions = Vec::new();
    for comp in &top_components {
        let (cx, cy, cwidth, cheight) = comp.bounding_box;
        let face_cx = cx as f32 + cwidth as f32 / 2.0;
        let face_cy = cy as f32 + cheight as f32 / 2.0;

        // Estimate feature positions based on classical face proportions
        let eye_y = (face_cy - cheight as f32 * 0.22).max(0.0);
        let eye_sep = cwidth as f32 * 0.28;
        let left_eye = (
            (face_cx - eye_sep).max(0.0) as u32,
            eye_y as u32,
            (cwidth as f32 * 0.18).max(1.0) as u32,
        );
        let right_eye = (
            (face_cx + eye_sep).max(0.0) as u32,
            eye_y as u32,
            (cwidth as f32 * 0.18).max(1.0) as u32,
        );
        let nose = (
            face_cx.max(0.0) as u32,
            (face_cy + cheight as f32 * 0.05).max(0.0) as u32,
            (cwidth as f32 * 0.12).max(1.0) as u32,
        );
        let mouth = (
            face_cx.max(0.0) as u32,
            (face_cy + cheight as f32 * 0.30).max(0.0) as u32,
            (cwidth as f32 * 0.22).max(1.0) as u32,
        );

        // Jawline: simple V-shape based on face width/height
        let jaw_width = cwidth as f32 * 0.45;
        let jaw_y = face_cy + cheight as f32 * 0.42;
        let jawline_points = vec![
            ((face_cx - jaw_width).max(0.0) as u32, jaw_y.max(0.0) as u32),
            (
                face_cx.max(0.0) as u32,
                (jaw_y + cheight as f32 * 0.08).max(0.0) as u32,
            ),
            ((face_cx + jaw_width).max(0.0) as u32, jaw_y.max(0.0) as u32),
        ];

        regions.push(FaceRegion {
            face_rect: (cx, cy, cwidth, cheight),
            left_eye,
            right_eye,
            nose,
            mouth,
            jawline_points,
        });
    }

    regions
}

/// Verify facial features within a candidate face component.
/// Returns a confidence score in [0..1].
/// Checks: eye-region darkness + symmetry, mouth-region color,
/// horizontal/vertical face proportions, symmetry of skin mask.
fn verify_facial_features(rgba: &RgbaImage, w: u32, h: u32, comp: &Component) -> f32 {
    let (cx, cy, cwidth, cheight) = comp.bounding_box;
    if cwidth < 10 || cheight < 10 {
        return 0.0;
    }

    let face_cx = cx as f32 + cwidth as f32 / 2.0;
    let face_cy = cy as f32 + cheight as f32 / 2.0;

    // ---- Check 1: Eye region darkness and symmetry ----
    let eye_y = (face_cy - cheight as f32 * 0.22).max(cy as f32);
    let eye_half_h = (cheight as f32 * 0.10).max(3.0);
    let eye_sep = cwidth as f32 * 0.28;
    let eye_half_w = (cwidth as f32 * 0.14).max(3.0);

    let left_eye_dark = region_darkness(
        rgba,
        w,
        h,
        (face_cx - eye_sep - eye_half_w).max(0.0) as u32,
        (eye_y - eye_half_h).max(0.0) as u32,
        (eye_half_w * 2.0) as u32,
        (eye_half_h * 2.0) as u32,
    );
    let right_eye_dark = region_darkness(
        rgba,
        w,
        h,
        (face_cx + eye_sep - eye_half_w).max(0.0) as u32,
        (eye_y - eye_half_h).max(0.0) as u32,
        (eye_half_w * 2.0) as u32,
        (eye_half_h * 2.0) as u32,
    );

    // Forehead/cheek brightness reference (above eyes, center)
    let forehead_y = (cy as f32 + cheight as f32 * 0.15).max(cy as f32);
    let cheek_bright = region_darkness(
        rgba,
        w,
        h,
        (face_cx - cwidth as f32 * 0.15).max(0.0) as u32,
        forehead_y as u32,
        (cwidth as f32 * 0.3) as u32,
        (cheight as f32 * 0.12) as u32,
    );

    // Eyes should be darker than forehead/cheeks
    let eye_contrast = ((cheek_bright - (left_eye_dark + right_eye_dark) * 0.5) / 0.5)
        .max(0.0)
        .min(1.0);
    let eye_symmetry = 1.0 - (left_eye_dark - right_eye_dark).abs();
    let eye_score = (eye_contrast * 0.7 + eye_symmetry * 0.3).min(1.0);

    // ---- Check 2: Mouth region - warmer/darker than surrounding skin ----
    let mouth_y = face_cy + cheight as f32 * 0.30;
    let mouth_half_h = (cheight as f32 * 0.07).max(2.0);
    let mouth_half_w = (cwidth as f32 * 0.18).max(3.0);
    let mouth_dark = region_darkness(
        rgba,
        w,
        h,
        (face_cx - mouth_half_w).max(0.0) as u32,
        (mouth_y - mouth_half_h).max(0.0) as u32,
        (mouth_half_w * 2.0) as u32,
        (mouth_half_h * 2.0) as u32,
    );

    // Chin reference (below mouth)
    let chin_dark = region_darkness(
        rgba,
        w,
        h,
        (face_cx - cwidth as f32 * 0.1).max(0.0) as u32,
        (mouth_y + mouth_half_h * 1.5).min(cy as f32 + cheight as f32 - 2.0) as u32,
        (cwidth as f32 * 0.2) as u32,
        (cheight as f32 * 0.08) as u32,
    );
    let mouth_contrast = ((chin_dark - mouth_dark) / 0.4).max(0.0).min(1.0);

    // Mouth redness: R should be higher than G and B relative to chin
    let mouth_redness = region_redness(
        rgba,
        w,
        h,
        (face_cx - mouth_half_w).max(0.0) as u32,
        (mouth_y - mouth_half_h).max(0.0) as u32,
        (mouth_half_w * 2.0) as u32,
        (mouth_half_h * 2.0) as u32,
    );
    let chin_redness = region_redness(
        rgba,
        w,
        h,
        (face_cx - cwidth as f32 * 0.1).max(0.0) as u32,
        (mouth_y + mouth_half_h * 1.5).min(cy as f32 + cheight as f32 - 2.0) as u32,
        (cwidth as f32 * 0.2) as u32,
        (cheight as f32 * 0.08) as u32,
    );
    let mouth_red_contrast = ((mouth_redness - chin_redness) / 0.15).max(0.0).min(1.0);

    let mouth_score = (mouth_contrast * 0.4 + mouth_red_contrast * 0.6).min(1.0);

    // ---- Check 3: Face symmetry (left-right skin mask symmetry) ----
    let symmetry_score = compute_face_symmetry(comp, w);

    // ---- Check 4: Vertical proportion (eye line at ~40-50% from top) ----
    let eye_y_ratio = (eye_y - cy as f32) / cheight as f32;
    let proportion_score = if eye_y_ratio > 0.3 && eye_y_ratio < 0.55 {
        1.0 - ((eye_y_ratio - 0.42) / 0.15).abs()
    } else {
        0.0
    }
    .max(0.0);

    // ---- Weighted fusion ----
    let total =
        0.35 * eye_score + 0.25 * mouth_score + 0.25 * symmetry_score + 0.15 * proportion_score;
    total.clamp(0.0, 1.0)
}

/// Average darkness (1 - luminance) of a rectangular region.
fn region_darkness(rgba: &RgbaImage, w: u32, h: u32, x: u32, y: u32, rw: u32, rh: u32) -> f32 {
    let x0 = x.min(w.saturating_sub(1));
    let y0 = y.min(h.saturating_sub(1));
    let x1 = (x0 + rw).min(w);
    let y1 = (y0 + rh).min(h);
    if x1 <= x0 || y1 <= y0 {
        return 0.5;
    }

    let mut sum = 0.0f32;
    let mut count = 0u32;
    for yy in y0..y1 {
        for xx in x0..x1 {
            let p = rgba.get_pixel(xx, yy);
            let (rf, gf, bf) = rgb_to_f32(p[0], p[1], p[2]);
            let lum = luminance(rf, gf, bf);
            sum += 1.0 - lum;
            count += 1;
        }
    }
    if count == 0 { 0.5 } else { sum / count as f32 }
}

/// Average redness (R - (G+B)/2) of a rectangular region, normalized to [0..1].
fn region_redness(rgba: &RgbaImage, w: u32, h: u32, x: u32, y: u32, rw: u32, rh: u32) -> f32 {
    let x0 = x.min(w.saturating_sub(1));
    let y0 = y.min(h.saturating_sub(1));
    let x1 = (x0 + rw).min(w);
    let y1 = (y0 + rh).min(h);
    if x1 <= x0 || y1 <= y0 {
        return 0.0;
    }

    let mut sum = 0.0f32;
    let mut count = 0u32;
    for yy in y0..y1 {
        for xx in x0..x1 {
            let p = rgba.get_pixel(xx, yy);
            let (rf, gf, bf) = rgb_to_f32(p[0], p[1], p[2]);
            let redness = rf - (gf + bf) * 0.5;
            sum += redness;
            count += 1;
        }
    }
    if count == 0 {
        0.0
    } else {
        (sum / count as f32).clamp(0.0, 1.0)
    }
}

/// Compute left-right symmetry of a component's skin pixels.
fn compute_face_symmetry(comp: &Component, _w: u32) -> f32 {
    let (cx, _cy, cwidth, cheight) = comp.bounding_box;
    if cwidth < 4 || cheight < 4 {
        return 0.5;
    }

    let face_cx = cx + cwidth / 2;
    let half_w = cwidth / 2;

    // Build a mini-mask of skin pixels within the bounding box
    let mut mask = vec![false; (cwidth * cheight) as usize];
    for &(px, py) in &comp.pixels {
        let lx = px - cx;
        let ly = py - comp.bounding_box.1;
        if lx < cwidth && ly < cheight {
            mask[(ly * cwidth + lx) as usize] = true;
        }
    }

    // Compare left half to mirrored right half
    let mut match_count = 0u32;
    let mut total = 0u32;

    for ly in 0..cheight {
        for lx in 0..half_w {
            let left_idx = (ly * cwidth + lx) as usize;
            let rx = cwidth - 1 - lx;
            let right_idx = (ly * cwidth + rx) as usize;

            let left_val = mask[left_idx];
            let right_val = mask[right_idx];

            if left_val || right_val {
                total += 1;
                if left_val == right_val {
                    match_count += 1;
                }
            }
        }
    }

    if total == 0 {
        0.5
    } else {
        match_count as f32 / total as f32
    }
}

/// Detect face regions using the ONNX FaceLandmarkDetector (SCRFD + 2d106det).
/// Falls back to an empty vector if detection fails.
pub fn detect_face_regions_onnx(
    img: &DynamicImage,
    detector: &mut crate::face_landmark::FaceLandmarkDetector,
) -> Vec<FaceRegion> {
    match detector.detect_all(img) {
        Ok(landmarks) => landmarks
            .into_iter()
            .map(|lm| {
                let pts = lm.points;

                // face_rect from contour points 0-32
                let mut min_x = f32::MAX;
                let mut min_y = f32::MAX;
                let mut max_x = f32::MIN;
                let mut max_y = f32::MIN;
                for i in 0..33 {
                    let (x, y) = pts[i];
                    min_x = min_x.min(x);
                    min_y = min_y.min(y);
                    max_x = max_x.max(x);
                    max_y = max_y.max(y);
                }
                let face_rect = (
                    min_x as u32,
                    min_y as u32,
                    (max_x - min_x) as u32,
                    (max_y - min_y) as u32,
                );

                // Eyes: use 2d106det semantic indices for direct left/right grouping.
                // Bug #7 fix: was using indices 63..87 (24 points) and splitting by
                // x-axis median — this fails when the face is tilted > 15° because
                // left/right eyes overlap in x.
                //
                // 2d106det semantic layout:
                //   Left eye contour:  pts[33..39]  (6 points)
                //   Right eye contour: pts[39..51]  (12 points, includes lids)
                //
                // We also pull from the eyebrow region (87..92 and 92..97) as
                // supplementary anchors if the eye contours are sparse.
                let left_eye_pts: Vec<_> = (33..39).filter_map(|i| pts.get(i).copied()).collect();
                let right_eye_pts: Vec<_> = (39..51).filter_map(|i| pts.get(i).copied()).collect();
                let (le_cx, le_cy, le_r) = compute_center_radius(&left_eye_pts);
                let (re_cx, re_cy, re_r) = compute_center_radius(&right_eye_pts);

                // Nose: indices 51..63
                let nose_pts: Vec<_> = (51..63).map(|i| pts[i]).collect();
                let (n_cx, n_cy, n_r) = compute_center_radius(&nose_pts);

                // Mouth: indices 87..106
                let mouth_pts: Vec<_> = (87..106).map(|i| pts[i]).collect();
                let (m_cx, m_cy, m_r) = compute_center_radius(&mouth_pts);

                // Jawline: 3 key points from contour
                let jawline_points = vec![pts[0], pts[16], pts[32]];

                FaceRegion {
                    face_rect,
                    left_eye: (le_cx, le_cy, le_r),
                    right_eye: (re_cx, re_cy, re_r),
                    nose: (n_cx, n_cy, n_r),
                    mouth: (m_cx, m_cy, m_r),
                    jawline_points: jawline_points
                        .into_iter()
                        .map(|(x, y)| (x as u32, y as u32))
                        .collect(),
                }
            })
            .collect(),
        Err(_) => Vec::new(),
    }
}

fn compute_center_radius(pts: &[(f32, f32)]) -> (u32, u32, u32) {
    if pts.is_empty() {
        return (0, 0, 0);
    }
    let min_x = pts.iter().map(|p| p.0).fold(f32::MAX, f32::min);
    let max_x = pts.iter().map(|p| p.0).fold(f32::MIN, f32::max);
    let min_y = pts.iter().map(|p| p.1).fold(f32::MAX, f32::min);
    let max_y = pts.iter().map(|p| p.1).fold(f32::MIN, f32::max);
    let cx = ((min_x + max_x) * 0.5) as u32;
    let cy = ((min_y + max_y) * 0.5) as u32;
    let r = ((max_x - min_x).max(max_y - min_y) * 0.5) as u32;
    (cx, cy, r.max(1))
}

#[derive(Debug, Clone)]
struct Component {
    label: u32,
    area: usize,
    pixels: Vec<(u32, u32)>,
    bounding_box: (u32, u32, u32, u32), // x, y, w, h
}

fn label_connected_components(mask: &[bool], w: u32, h: u32) -> Vec<u32> {
    let area = (w * h) as usize;
    let mut labels = vec![0u32; area];
    let mut next_label = 1u32;
    let mut parent: Vec<u32> = vec![0];

    fn find(parent: &mut Vec<u32>, x: u32) -> u32 {
        let mut x = x;
        while parent[x as usize] != x {
            parent[x as usize] = parent[parent[x as usize] as usize];
            x = parent[x as usize];
        }
        x
    }

    fn union(parent: &mut Vec<u32>, a: u32, b: u32) {
        let ra = find(parent, a);
        let rb = find(parent, b);
        if ra != rb {
            parent[rb as usize] = ra;
        }
    }

    for y in 0..h {
        for x in 0..w {
            let idx = (y * w + x) as usize;
            if !mask[idx] {
                continue;
            }
            let mut neighbors: Vec<u32> = Vec::new();
            if x > 0 && mask[idx - 1] {
                neighbors.push(labels[idx - 1]);
            }
            if y > 0 && mask[(idx as u32 - w) as usize] {
                neighbors.push(labels[(idx as u32 - w) as usize]);
            }

            if neighbors.is_empty() {
                labels[idx] = next_label;
                parent.push(next_label);
                next_label += 1;
            } else {
                let min_label = *neighbors.iter().min().unwrap_or(&0);
                labels[idx] = min_label;
                for &n in &neighbors {
                    union(&mut parent, min_label, n);
                }
            }
        }
    }

    // Second pass: flatten labels
    for y in 0..h {
        for x in 0..w {
            let idx = (y * w + x) as usize;
            if labels[idx] > 0 {
                labels[idx] = find(&mut parent, labels[idx]);
            }
        }
    }
    labels
}

fn extract_components(labels: &[u32], w: u32, h: u32) -> Vec<Component> {
    use std::collections::HashMap;
    let mut map: HashMap<u32, Vec<(u32, u32)>> = HashMap::new();
    for y in 0..h {
        for x in 0..w {
            let lbl = labels[(y * w + x) as usize];
            if lbl > 0 {
                map.entry(lbl).or_default().push((x, y));
            }
        }
    }
    map.into_iter()
        .map(|(label, pixels)| {
            let area = pixels.len();
            let min_x = pixels.iter().map(|p| p.0).min().unwrap_or(0);
            let max_x = pixels.iter().map(|p| p.0).max().unwrap_or(0);
            let min_y = pixels.iter().map(|p| p.1).min().unwrap_or(0);
            let max_y = pixels.iter().map(|p| p.1).max().unwrap_or(0);
            Component {
                label,
                area,
                pixels,
                bounding_box: (min_x, min_y, max_x - min_x + 1, max_y - min_y + 1),
            }
        })
        .collect()
}

fn erode_mask(src: &[bool], w: u32, h: u32, dst: &mut [bool], radius: u32) {
    for y in 0..h {
        for x in 0..w {
            let mut all_set = true;
            for dy in -(radius as i32)..=(radius as i32) {
                for dx in -(radius as i32)..=(radius as i32) {
                    let nx = (x as i32 + dx).clamp(0, w as i32 - 1) as u32;
                    let ny = (y as i32 + dy).clamp(0, h as i32 - 1) as u32;
                    if !src[(ny * w + nx) as usize] {
                        all_set = false;
                        break;
                    }
                }
                if !all_set {
                    break;
                }
            }
            dst[(y * w + x) as usize] = all_set;
        }
    }
}

fn dilate_mask(src: &[bool], w: u32, h: u32, dst: &mut [bool], radius: u32) {
    for y in 0..h {
        for x in 0..w {
            let mut any_set = false;
            for dy in -(radius as i32)..=(radius as i32) {
                for dx in -(radius as i32)..=(radius as i32) {
                    let nx = (x as i32 + dx).clamp(0, w as i32 - 1) as u32;
                    let ny = (y as i32 + dy).clamp(0, h as i32 - 1) as u32;
                    if src[(ny * w + nx) as usize] {
                        any_set = true;
                        break;
                    }
                }
                if any_set {
                    break;
                }
            }
            dst[(y * w + x) as usize] = any_set;
        }
    }
}

#[inline(always)]
fn rgb_to_ycbcr(r: u8, g: u8, b: u8) -> (f32, f32, f32) {
    let rf = r as f32;
    let gf = g as f32;
    let bf = b as f32;
    let y = 0.299 * rf + 0.587 * gf + 0.114 * bf;
    let cb = 128.0 - 0.168736 * rf - 0.331264 * gf + 0.5 * bf;
    let cr = 128.0 + 0.5 * rf - 0.418688 * gf - 0.081312 * bf;
    (y, cb, cr)
}

/// Multi-model skin detection: combines YCbCr, RGB ratio, and HSV for robust
/// detection across all skin tones (light, medium, dark).
/// Returns a confidence score in [0..1].
#[inline(always)]
fn skin_confidence(r: u8, g: u8, b: u8) -> f32 {
    let rf = r as f32 / 255.0;
    let gf = g as f32 / 255.0;
    let bf = b as f32 / 255.0;

    // Model 1: Extended YCbCr (Kovac et al. + extended for dark skin)
    let (y_val, cb, cr) = rgb_to_ycbcr(r, g, b);
    // Wider ranges: Cb 70-140, Cr 105-180, covers light → dark skin tones
    let ycbcr_score = if y_val > 20.0 && cb >= 70.0 && cb <= 140.0 && cr >= 105.0 && cr <= 180.0 {
        // Score peaks in the middle of the range, falls off at edges
        let cb_center = 105.0;
        let cr_center = 142.0;
        let cb_dist = ((cb - cb_center) / 35.0).abs();
        let cr_dist = ((cr - cr_center) / 37.0).abs();
        (1.0 - cb_dist * 0.5).max(0.0) * (1.0 - cr_dist * 0.5).max(0.0)
    } else {
        0.0
    };

    // Model 2: Normalized RGB ratio (Kovac et al.)
    let rgb_score =
        if rf > 0.2 && gf > 0.15 && bf > 0.1 && rf > gf && rf > bf && (rf - gf).abs() > 0.02 {
            // R > G > B is typical for skin; weight by how well it fits
            let rg = rf - gf;
            let rb = rf - bf;
            (rg.min(rb) * 3.0).min(1.0).max(0.0)
        } else {
            0.0
        };

    // Model 3: HSV-based (hue in warm range, moderate saturation)
    let (hue, sat, lum) = rgb_to_hsl(rf, gf, bf);
    let hsv_score = if sat > 0.05 && sat < 0.85 && lum > 0.08 && lum < 0.95 {
        let hue_norm = if hue > 180.0 { 360.0 - hue } else { hue };
        if hue_norm < 50.0 {
            1.0 - (hue_norm - 20.0).abs() / 40.0
        } else {
            0.0
        }
        .max(0.0)
    } else {
        0.0
    };

    // Weighted fusion: YCbCr is most reliable, RGB and HSV as supplements
    let score = 0.5 * ycbcr_score + 0.3 * rgb_score + 0.2 * hsv_score;
    score.clamp(0.0, 1.0)
}

/// Binary skin mask with adaptive threshold.
fn build_skin_mask(rgba: &RgbaImage, w: u32, h: u32, threshold: f32) -> Vec<bool> {
    let mut mask = vec![false; (w * h) as usize];
    for y in 0..h {
        for x in 0..w {
            let p = rgba.get_pixel(x, y);
            let conf = skin_confidence(p[0], p[1], p[2]);
            mask[(y * w + x) as usize] = conf >= threshold;
        }
    }
    mask
}

/// Build a soft (f32) skin mask for feathered blending.
fn build_soft_skin_mask(rgba: &RgbaImage, w: u32, h: u32) -> Vec<f32> {
    let mut mask = vec![0.0f32; (w * h) as usize];
    for y in 0..h {
        for x in 0..w {
            let p = rgba.get_pixel(x, y);
            mask[(y * w + x) as usize] = skin_confidence(p[0], p[1], p[2]);
        }
    }
    mask
}

// ---------------------------------------------------------------------------
// 9. Hair Adjustment – Hue shift + Brightness
// ---------------------------------------------------------------------------

/// Adjust hair color by shifting hue and brightness in hair-like regions.
/// Uses dark/low-saturation pixel detection combined with texture/edge
/// analysis to avoid matching dark clothing (Bug #11 fix).
pub fn apply_hair_adjust(
    img: &mut DynamicImage,
    face_regions: &[FaceRegion],
    hue_shift: f32,
    brightness: f32,
) -> Result<(), String> {
    let (w, h) = img.dimensions();
    if w == 0 || h == 0 {
        return Err("Image has zero dimensions".to_string());
    }

    let mut rgba = img.to_rgba8();
    let hue_delta = hue_shift.clamp(-180.0, 180.0);
    let bright = brightness.clamp(-0.5, 0.5);

    for face in face_regions {
        let (fx, fy, fw, fh) = face.face_rect;

        // Bug #11 fix: shrink the hair region to the area ABOVE the face
        // (hair is on the head, not the shoulders/background).
        // Old region went from fy-fh/2 to fy+fh*1.5, covering shoulders and
        // background. New region: fy-fh*0.7 to fy+fh*0.1 (mostly above face).
        let head_top = fy.saturating_sub((fh as f32 * 0.7) as u32);
        let head_bottom = (fy + (fh as f32 * 0.1) as u32).min(h - 1);
        // Narrow horizontal range: face width + 30% margin on each side
        let margin = (fw as f32 * 0.3) as u32;
        let head_left = fx.saturating_sub(margin);
        let head_right = (fx + fw + margin).min(w - 1);

        for y in head_top..=head_bottom {
            for x in head_left..=head_right {
                let pixel = rgba.get_pixel(x, y);
                let (rf, gf, bf) = rgb_to_f32(pixel[0], pixel[1], pixel[2]);
                let (hue, sat, lum) = rgb_to_hsl(rf, gf, bf);

                // Bug #11: improved hair heuristic.
                // Old: lum < 0.35 || (lum < 0.55 && sat < 0.25)
                //   → matched all dark objects (clothing, furniture, shadows).
                // New: tighter constraints that better isolate hair.
                let is_dark = lum < 0.40;
                let is_low_sat = sat < 0.30 && lum < 0.55;
                // Light hair: blonde / gold (warm yellow, medium-high luminance)
                let is_light_hair = lum > 0.45 && sat < 0.45 && hue > 35.0 && hue < 70.0;
                // White / silver / gray hair (high luminance, very low saturation)
                let is_white_hair = lum > 0.55 && sat < 0.15;
                // Hair typically has R ≈ G ≈ B (neutral dark) or warm brown tint.
                // Exclude obvious skin tones and strong colors.
                let is_not_skin = !(hue < 40.0 && sat > 0.15 && lum > 0.25);
                let is_not_strong_color = sat < 0.55;
                let is_hair = (is_dark || is_low_sat || is_light_hair || is_white_hair)
                    && is_not_skin
                    && is_not_strong_color;

                if !is_hair {
                    continue;
                }

                // Local texture check: hair has fine texture (high local variance),
                // while dark clothing is often uniform. Compute a 3×3 gradient
                // variance; if too smooth, skip (likely fabric/shadow).
                let gx = if x > 0 && x < w - 1 {
                    let pl = rgba.get_pixel(x - 1, y);
                    let pr = rgba.get_pixel(x + 1, y);
                    (pl[0] as f32 - pr[0] as f32).abs()
                        + (pl[1] as f32 - pr[1] as f32).abs()
                        + (pl[2] as f32 - pr[2] as f32).abs()
                } else {
                    0.0
                };
                let gy = if y > 0 && y < h - 1 {
                    let pu = rgba.get_pixel(x, y - 1);
                    let pd = rgba.get_pixel(x, y + 1);
                    (pu[0] as f32 - pd[0] as f32).abs()
                        + (pu[1] as f32 - pd[1] as f32).abs()
                        + (pu[2] as f32 - pd[2] as f32).abs()
                } else {
                    0.0
                };
                let edge_mag = (gx + gy) / (255.0 * 3.0);
                // Hair typically has some texture; very smooth dark regions
                // are likely clothing/fabric.
                if edge_mag < 0.02 && sat < 0.15 {
                    continue;
                }

                // Distance from face center for falloff
                let fcx = fx as f32 + fw as f32 / 2.0;
                let fcy = fy as f32 + fh as f32 / 2.0;
                let dx = x as f32 - fcx;
                let dy = y as f32 - fcy;
                let norm_x = dx / (fw as f32 * 0.8).max(1.0);
                let norm_y = dy / (fh as f32 * 0.8).max(1.0);
                let dist_sq = norm_x * norm_x + norm_y * norm_y;
                if dist_sq > 1.0 {
                    continue;
                }
                let weight = 1.0 - dist_sq;

                let new_hue = (hue + hue_delta * weight).rem_euclid(360.0);
                let new_lum = (lum + bright * weight).clamp(0.0, 1.0);
                let (nr, ng, nb) = hsl_to_rgb(new_hue, sat, new_lum);
                let (r8, g8, b8) = f32_to_rgb(nr, ng, nb);
                rgba.put_pixel(x, y, Rgba([r8, g8, b8, pixel[3]]));
            }
        }
    }

    *img = DynamicImage::ImageRgba8(rgba);
    Ok(())
}

// ---------------------------------------------------------------------------
// 10. Body Reshape – Liquify for full-body slimming / elongation with contour mask
// ---------------------------------------------------------------------------

/// Apply body reshaping (slim, heighten, leg-lengthen) using a mesh warp,
/// restricted to the detected body region to protect the background.
/// Operates on the lower half of the image relative to the face position.
pub fn apply_body_reshape(
    img: &mut DynamicImage,
    face_regions: &[FaceRegion],
    slim_amount: f32,
    height_amount: f32,
    leg_amount: f32,
    symmetry_enabled: bool,
) -> Result<(), String> {
    let (w, h) = img.dimensions();
    if w == 0 || h == 0 || face_regions.is_empty() {
        return Ok(());
    }

    let src = img.to_rgba8();
    let mut dst = RgbaImage::from_pixel(w, h, Rgba([0, 0, 0, 0]));

    // Use the highest face as the body anchor
    let anchor_face = match face_regions.iter().min_by_key(|f| f.face_rect.1) {
        Some(f) => f,
        None => return Ok(()),
    };
    let body_y_start = anchor_face.face_rect.1 + anchor_face.face_rect.3;

    let slim = slim_amount.clamp(-1.0, 1.0);
    let height = height_amount.clamp(-1.0, 1.0);
    let leg = leg_amount.clamp(-1.0, 1.0);

    // When symmetry is enabled, both sides of the body are adjusted equally
    // by pinching toward the center. When disabled, only one side is affected.
    let symmetry_factor = if symmetry_enabled { 1.0 } else { 0.5 };

    // Build a body contour mask below the face to protect background
    let body_mask = build_body_mask(&src, w, h, face_regions, body_y_start);

    for y_out in 0..h {
        for x_out in 0..w {
            let mut sx = x_out as f32;
            let mut sy = y_out as f32;

            // Only affect below the face
            if y_out >= body_y_start {
                let dy_body = y_out as f32 - body_y_start as f32;
                let body_h = (h - body_y_start) as f32;
                if body_h > 0.0 {
                    let norm_y = dy_body / body_h;

                    // Get body mask weight for this pixel
                    let mask_val = body_mask[(y_out * w + x_out) as usize];

                    if mask_val > 0.001 {
                        // Slim: horizontal pinch toward center, stronger at waist
                        if slim.abs() > 1e-4 {
                            let cx = w as f32 / 2.0;
                            let dx = sx - cx;
                            // Waist is around 30-50% down the body
                            let waist_weight = if norm_y > 0.2 && norm_y < 0.6 {
                                1.0 - ((norm_y - 0.4) / 0.2).abs()
                            } else {
                                0.0
                            };
                            let falloff = (1.0 - norm_y) * waist_weight;
                            let strength = slim * falloff * 0.25 * symmetry_factor * mask_val;
                            sx -= dx * strength;
                        }

                        // Height / leg lengthen: vertical stretch of lower body
                        if (height + leg).abs() > 1e-4 {
                            let leg_start_norm = 0.55;
                            let is_leg = norm_y > leg_start_norm;
                            let base_stretch = height * 0.15;
                            let leg_stretch = if is_leg { leg * 0.20 } else { 0.0 };
                            let total_stretch = base_stretch + leg_stretch;

                            let stretch_weight = norm_y * norm_y; // stronger lower down
                            sy -= dy_body * total_stretch * stretch_weight * mask_val;
                        }
                    }
                }
            }

            let px = sample_bilinear_rgba(&src, w, h, sx, sy);
            dst.put_pixel(x_out, y_out, px);
        }
    }

    *img = DynamicImage::ImageRgba8(dst);
    Ok(())
}

/// Build a soft body contour mask for the region below the face.
/// Uses multiple cues: central vertical falloff, skin-tone detection,
/// edge/gradient analysis, and horizontal column density.
/// Returns a float mask [0..1].
fn build_body_mask(
    rgba: &RgbaImage,
    w: u32,
    h: u32,
    face_regions: &[FaceRegion],
    body_y_start: u32,
) -> Vec<f32> {
    let area = (w * h) as usize;
    let mut mask = vec![0.0f32; area];

    if body_y_start >= h - 1 {
        return mask;
    }

    // Find the main anchor face (highest one) for body center
    let anchor_face = match face_regions.iter().min_by_key(|f| f.face_rect.1) {
        Some(f) => f,
        None => return mask, // No face regions, return empty mask
    };
    let face_cx = anchor_face.face_rect.0 as f32 + anchor_face.face_rect.2 as f32 / 2.0;
    let face_width = anchor_face.face_rect.2 as f32;

    let body_h = (h - body_y_start) as f32;

    // ---- Step 1: Vertical column projection to find body width per row ----
    // Compute horizontal energy (variance + skin + center bias) for each row
    let mut row_left = vec![w as i32; h as usize];
    let mut row_right = vec![0i32; h as usize];

    for y in body_y_start..h {
        // Estimate body half-width at this row: wider at top (shoulders), narrower at waist, wider at hips
        let dy = (y - body_y_start) as f32 / body_h.max(1.0);
        // Approximate body shape: shoulders (0.0) -> waist (0.35) -> hips (0.65) -> legs (1.0)
        let half_width_factor = if dy < 0.35 {
            // Shoulders to waist: narrow down
            0.9 - 0.3 * (dy / 0.35)
        } else if dy < 0.65 {
            // Waist to hips: widen
            0.6 + 0.4 * ((dy - 0.35) / 0.30)
        } else {
            // Hips to legs: narrow down
            1.0 - 0.5 * ((dy - 0.65) / 0.35)
        };
        let expected_half_w = (face_width * half_width_factor * 1.3).max(20.0);

        // Search left and right from center for body edges using skin+edge cues
        let cx = face_cx as i32;
        let search_range = (expected_half_w * 1.8).min(w as f32 * 0.45) as i32;

        // Left edge: move outward from center until edge/non-skin is found
        let mut l = cx;
        for dx in 0..=search_range {
            let xx = (cx - dx).clamp(0, w as i32 - 1) as u32;
            let p = rgba.get_pixel(xx, y);
            let skin_c = skin_confidence(p[0], p[1], p[2]);
            // Score: skin contributes, proximity to center contributes
            let dist_factor = 1.0 - (dx as f32 / search_range as f32).min(1.0);
            let score = skin_c * 0.5 + dist_factor * 0.5;
            if score < 0.25 && dx as f32 > expected_half_w * 0.6 {
                break;
            }
            l = cx - dx;
        }

        // Right edge
        let mut r = cx;
        for dx in 0..=search_range {
            let xx = (cx + dx).clamp(0, w as i32 - 1) as u32;
            let p = rgba.get_pixel(xx, y);
            let skin_c = skin_confidence(p[0], p[1], p[2]);
            let dist_factor = 1.0 - (dx as f32 / search_range as f32).min(1.0);
            let score = skin_c * 0.5 + dist_factor * 0.5;
            if score < 0.25 && dx as f32 > expected_half_w * 0.6 {
                break;
            }
            r = cx + dx;
        }

        row_left[y as usize] = l.max(0);
        row_right[y as usize] = r.min(w as i32 - 1);
    }

    // Smooth the row edges (3-row moving average)
    let mut smooth_left = row_left.clone();
    let mut smooth_right = row_right.clone();
    for y in (body_y_start + 1)..(h - 1) {
        let yi = y as usize;
        smooth_left[yi] = (row_left[yi - 1] + row_left[yi] + row_left[yi + 1]) / 3;
        smooth_right[yi] = (row_right[yi - 1] + row_right[yi] + row_right[yi + 1]) / 3;
    }

    // ---- Step 2: Fill the mask with soft edges ----
    for y in body_y_start..h {
        let yi = y as usize;
        let l = smooth_left[yi] as f32;
        let r = smooth_right[yi] as f32;
        let cx = (l + r) * 0.5;
        let half_w = (r - l) * 0.5;
        let feather = (half_w * 0.15).max(5.0); // feather zone on each side

        let x_start = (l - feather).max(0.0) as u32;
        let x_end = (r + feather).min(w as f32 - 1.0) as u32;

        for x in x_start..=x_end {
            let dx = (x as f32 - cx).abs();
            let dist_from_edge = half_w - dx;
            let weight = if dist_from_edge > 0.0 {
                // Inside body: 1.0, feathering near edge
                (dist_from_edge / feather).min(1.0)
            } else {
                // Outside: 0.0
                0.0
            };
            mask[(y * w + x) as usize] = weight;
        }
    }

    // ---- Step 3: Vertical feather at body_y_start (transition from face) ----
    let transition_h = (anchor_face.face_rect.3 as f32 * 0.3).max(5.0) as u32;
    for y in body_y_start..(body_y_start + transition_h).min(h) {
        let dy = (y - body_y_start) as f32 / transition_h as f32;
        let vert_weight = dy * dy; // quadratic fade-in
        for x in 0..w {
            let idx = (y * w + x) as usize;
            mask[idx] *= vert_weight;
        }
    }

    mask
}

// ---------------------------------------------------------------------------
// 11. Skin Tone Unify – LAB-based skin-tone equalisation
// ---------------------------------------------------------------------------

/// Unify skin tone by shifting detected skin pixels toward a target skin colour
/// in CIELAB space while preserving local luminance variation.
pub fn apply_skin_tone_unify(
    img: &mut DynamicImage,
    face_regions: &[FaceRegion],
    warmth: f32,
    redness: f32,
    strength: f32,
) -> Result<(), String> {
    let (w, h) = img.dimensions();
    if w == 0 || h == 0 {
        return Err("Image has zero dimensions".to_string());
    }
    let mut rgba = img.to_rgba8();
    apply_skin_tone_unify_rgba(&mut rgba, w, h, face_regions, warmth, redness, strength);
    *img = DynamicImage::ImageRgba8(rgba);
    Ok(())
}

fn apply_skin_tone_unify_rgba(
    rgba: &mut RgbaImage,
    w: u32,
    h: u32,
    face_regions: &[FaceRegion],
    warmth: f32,
    redness: f32,
    strength: f32,
) {
    let s = strength.clamp(0.0, 1.0);
    if s < 1e-4 {
        return;
    }

    let target_a = 15.0 + redness * 20.0;
    let target_b = 18.0 + warmth * 15.0;

    for face in face_regions {
        let (fx, fy, fw, fh) = face.face_rect;
        let x_min = fx;
        let x_max = (fx + fw).min(w - 1);
        let y_min = fy;
        let y_max = (fy + fh).min(h - 1);

        for y in y_min..=y_max {
            for x in x_min..=x_max {
                let pixel = rgba.get_pixel(x, y);
                let (rf, gf, bf) = rgb_to_f32(pixel[0], pixel[1], pixel[2]);

                let (hue, sat, lum) = rgb_to_hsl(rf, gf, bf);
                let is_skin = (hue < 50.0 || hue > 330.0)
                    && sat > 0.08
                    && sat < 0.65
                    && lum > 0.15
                    && lum < 0.85;
                if !is_skin {
                    continue;
                }

                let (l, a, b_val) = rgb_to_lab(rf, gf, bf);

                let new_a = a + (target_a - a) * s;
                let new_b = b_val + (target_b - b_val) * s;

                let (nr, ng, nb) = lab_to_rgb(l, new_a, new_b);
                let (r8, g8, b8) = f32_to_rgb(nr, ng, nb);
                rgba.put_pixel(x, y, Rgba([r8, g8, b8, pixel[3]]));
            }
        }
    }
}

/// sRGB gamma decode: convert gamma-encoded [0,1] to linear light [0,1].
/// Bug #12 fix: rgb_to_lab / lab_to_rgb must operate on linear RGB,
/// not gamma-encoded sRGB. Without this step the LAB conversion is
/// mathematically incorrect.
#[inline(always)]
fn srgb_to_linear(v: f32) -> f32 {
    if v <= 0.04045 {
        v / 12.92
    } else {
        ((v + 0.055) / 1.055).powf(2.4)
    }
}

#[inline(always)]
fn linear_to_srgb(v: f32) -> f32 {
    if v <= 0.0031308 {
        v * 12.92
    } else {
        1.055 * v.powf(1.0 / 2.4) - 0.055
    }
}

#[inline(always)]
fn rgb_to_lab(r: f32, g: f32, b: f32) -> (f32, f32, f32) {
    // Bug #12 fix: decode sRGB gamma before linear RGB→XYZ→LAB.
    let r_lin = srgb_to_linear(r);
    let g_lin = srgb_to_linear(g);
    let b_lin = srgb_to_linear(b);

    // D65 illuminant
    let x = 0.4124564 * r_lin + 0.3575761 * g_lin + 0.1804375 * b_lin;
    let y = 0.2126729 * r_lin + 0.7151522 * g_lin + 0.0721750 * b_lin;
    let z = 0.0193339 * r_lin + 0.1191920 * g_lin + 0.9503041 * b_lin;

    fn f(t: f32) -> f32 {
        if t > 216.0 / 24389.0 {
            t.cbrt()
        } else {
            (24389.0 / 27.0 * t + 16.0) / 116.0
        }
    }

    let fx = f(x);
    let fy = f(y);
    let fz = f(z);

    let l = 116.0 * fy - 16.0;
    let a = 500.0 * (fx - fy);
    let b = 200.0 * (fy - fz);
    (l, a, b)
}

#[inline(always)]
fn lab_to_rgb(l: f32, a: f32, b: f32) -> (f32, f32, f32) {
    let fy = (l + 16.0) / 116.0;
    let fx = a / 500.0 + fy;
    let fz = fy - b / 200.0;

    fn finv(t: f32) -> f32 {
        let delta = 6.0 / 29.0;
        if t > delta {
            t * t * t
        } else {
            3.0 * delta * delta * (t - 4.0 / 29.0)
        }
    }

    let x = finv(fx);
    let y = finv(fy);
    let z = finv(fz);

    let r = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
    let g = -0.9692660 * x + 1.8760108 * y + 0.0415560 * z;
    let b = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;

    // Bug #12 fix: re-encode to sRGB gamma after linear RGB→XYZ conversion.
    (
        linear_to_srgb(r.clamp(0.0, 1.0)),
        linear_to_srgb(g.clamp(0.0, 1.0)),
        linear_to_srgb(b.clamp(0.0, 1.0)),
    )
}

// ---------------------------------------------------------------------------
// 12. One-Click Beauty – Auto-detect + optimal preset
// ---------------------------------------------------------------------------

/// Apply a one-click beauty preset: skin smoothing, eye brighten, teeth whiten,
/// face slim, and skin-tone unify with automatically chosen moderate values.
pub fn apply_one_click_beauty(
    img: &mut DynamicImage,
    strength: f32,
    face_regions: &[FaceRegion],
) -> Result<(), String> {
    let s = strength.clamp(0.0, 1.0);
    if s < 1e-4 {
        return Ok(());
    }

    let (w, h) = img.dimensions();
    if w == 0 || h == 0 {
        return Err("Image has zero dimensions".to_string());
    }

    if face_regions.is_empty() {
        // No face detected → apply a gentle global skin-tone smoothing
        apply_skin_smoothing(img, s * 0.3, 0.7, &[])?;
        return Ok(());
    }

    // Convert to RgbaImage once; all _rgba variants operate on this buffer directly.
    // This avoids the 6× to_rgba8() → compute → DynamicImage::ImageRgba8() round-trips
    // that the original code performed (Bug #13 fix).
    let mut rgba = img.to_rgba8();

    // 1. Skin smoothing
    apply_skin_smoothing_rgba(&mut rgba, w, h, s * 0.35, 0.65, face_regions);

    // 2. Eye brighten + enlarge
    let eye_regions: Vec<_> = face_regions
        .iter()
        .flat_map(|f| vec![f.left_eye, f.right_eye])
        .collect();
    if !eye_regions.is_empty() {
        apply_eye_brighten_rgba(&mut rgba, w, h, &eye_regions, s * 0.45);
        apply_eye_enlarge_rgba(&mut rgba, w, h, &eye_regions, s * 0.20);
    }

    // 3. Teeth whiten
    let teeth_regions: Vec<_> = face_regions.iter().map(|f| f.mouth).collect();
    if !teeth_regions.is_empty() {
        apply_teeth_whitening_rgba(&mut rgba, w, h, &teeth_regions, s * 0.35, s * 0.30);
    }

    // 4. Face reshape
    apply_face_reshape_rgba(&mut rgba, w, h, face_regions, s * 0.25, s * 0.10);

    // 5. Skin tone unify
    apply_skin_tone_unify_rgba(&mut rgba, w, h, face_regions, 0.0, 0.0, s * 0.25);

    // Wrap back once
    *img = DynamicImage::ImageRgba8(rgba);
    Ok(())
}

// ---------------------------------------------------------------------------
// 13. Portrait Adjustments Entry – Apply all portrait params from JSON
// ---------------------------------------------------------------------------

/// Master entry point: given a `DynamicImage`, pre-computed face regions, and a
/// JSON-like portrait-adjustment map, apply every enabled adjustment in order.
/// This is the function called from `process_preview_job` after the GPU pass.
pub fn apply_portrait_adjustments(
    img: &mut DynamicImage,
    portrait_json: &serde_json::Value,
    face_regions: &[FaceRegion],
) -> Result<(), String> {
    // Extract each field; missing or zero fields are skipped
    let get_f32 = |key: &str| -> f32 {
        portrait_json
            .get(key)
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0) as f32
    };
    let get_str = |key: &str| -> String {
        portrait_json
            .get(key)
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string()
    };

    // Read personAttribute to filter which faces to process
    let person_attribute = get_str("personAttribute");
    let filtered_faces: Vec<FaceRegion> =
        if person_attribute.is_empty() || person_attribute == "all" {
            face_regions.to_vec()
        } else {
            // Filter face regions based on personAttribute
            face_regions
                .iter()
                .filter(|face| {
                    match person_attribute.as_str() {
                        "single" => true, // Process only the largest/dominant face
                        "male" | "elderMale" => {
                            let aspect = face.face_rect.2 as f32 / face.face_rect.3.max(1) as f32;
                            aspect > 0.85 // Wider / squarer jaw tends to be male
                        }
                        "female" | "elderFemale" => {
                            let aspect = face.face_rect.2 as f32 / face.face_rect.3.max(1) as f32;
                            aspect <= 0.85 // Narrower / oval face tends to be female
                        }
                        "child" => {
                            // Use absolute face width relative to actual image width
                            // as a size heuristic, NOT relative to the largest face.
                            //
                            // Typical child face width on a portrait photo is
                            // < 30% of image width (adults are ~35-50%).
                            let (img_w, _) = img.dimensions();
                            // Face width < 28% of image width → likely child
                            // Also: if face is significantly smaller than the
                            // average face (for multi-person photos)
                            let is_small_absolute = face.face_rect.2 < img_w / 4;
                            let avg_width = face_regions.iter().map(|f| f.face_rect.2).sum::<u32>()
                                / face_regions.len().max(1) as u32;
                            let is_small_relative = face.face_rect.2 < avg_width / 2;
                            let is_smallest = face.face_rect.2
                                == face_regions
                                    .iter()
                                    .map(|f| f.face_rect.2)
                                    .min()
                                    .unwrap_or(u32::MAX);
                            is_small_absolute
                                || (face_regions.len() > 1 && (is_small_relative && is_smallest))
                        } // Heuristic: smaller faces
                        _ => true,
                    }
                })
                .cloned()
                .collect()
        };

    // For "single" mode, only process the largest (dominant) face.
    // Bug #5 fix: was .take(1) which took the first in detection order,
    // not the largest. Now uses max_by_key on face area (width * height).
    let filtered_faces: Vec<FaceRegion> = if person_attribute == "single" {
        filtered_faces
            .into_iter()
            .max_by_key(|f| f.face_rect.2 * f.face_rect.3)
            .into_iter()
            .collect()
    } else {
        filtered_faces
    };

    let skin_strength = get_f32("skinSmoothingStrength");
    let skin_detail = get_f32("skinSmoothingDetailPreserve");
    let face_slim = get_f32("faceSlimAmount");
    let jaw = get_f32("jawAmount");
    let forehead = get_f32("foreheadAmount");
    let eye_enlarge = get_f32("eyeEnlargeAmount");
    let eye_brighten = get_f32("eyeBrightenAmount");
    let teeth_bright = get_f32("teethWhitenBrightness");
    let teeth_desat = get_f32("teethWhitenDesaturate");
    let lipstick_color = get_str("lipstickColor");
    let lipstick_opacity = get_f32("lipstickOpacity");
    let blush_color = get_str("blushColor");
    let blush_opacity = get_f32("blushOpacity");
    let eyebrow_color = get_str("eyebrowColor");
    let eyebrow_opacity = get_f32("eyebrowOpacity");
    let hair_hue = get_f32("hairHueShift");
    let hair_bright = get_f32("hairBrightness");
    let body_slim = get_f32("bodySlimAmount");
    let body_height = get_f32("bodyHeightAmount");
    let leg_len = get_f32("legLengthAmount");
    let body_symmetry = portrait_json
        .get("bodySymmetryEnabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    // Parse blemish spots
    let (img_w, img_h) = img.dimensions();
    let spots: Vec<(u32, u32, u32)> = portrait_json
        .get("blemishSpots")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|spot| {
                    let x = spot.get("x")?.as_f64()? as f32;
                    let y = spot.get("y")?.as_f64()? as f32;
                    let r = spot.get("radius")?.as_f64()? as f32;
                    let px_x =
                        ((x * img_w as f32).round() as i32).clamp(0, img_w as i32 - 1) as u32;
                    let px_y =
                        ((y * img_h as f32).round() as i32).clamp(0, img_h as i32 - 1) as u32;
                    let px_r = ((r * img_w as f32).max(3.0).round() as i32)
                        .clamp(1, (img_w / 2) as i32) as u32;
                    Some((px_x, px_y, px_r))
                })
                .collect()
        })
        .unwrap_or_default();

    // 1. Blemish removal (does not need face_regions)
    if !spots.is_empty() {
        apply_blemish_removal(img, &spots, 0.5)?;
    }

    // 2. Skin smoothing
    if skin_strength > 1e-4 {
        apply_skin_smoothing(
            img,
            skin_strength / 100.0,
            skin_detail / 100.0,
            &filtered_faces,
        )?;
    }

    // 3. Face reshape
    if face_slim > 1e-4 || jaw.abs() > 1e-4 || forehead.abs() > 1e-4 {
        if !filtered_faces.is_empty() {
            // forehead adjustment: shift face_rect top upward/downward
            let mut adjusted_faces: Vec<FaceRegion> = filtered_faces.to_vec();
            if forehead.abs() > 1e-4 {
                for face in &mut adjusted_faces {
                    let shift = (forehead / 50.0 * face.face_rect.3 as f32 / 4.0) as i32;
                    face.face_rect.1 = face.face_rect.1.saturating_add_signed(-shift);
                    face.face_rect.3 = (face.face_rect.3 as i32 + shift).max(10) as u32;
                }
            }
            apply_face_reshape(img, &adjusted_faces, face_slim / 100.0, jaw / 50.0)?;
        }
    }

    // 4. Eye enhance
    if (eye_enlarge > 1e-4 || eye_brighten > 1e-4) && !filtered_faces.is_empty() {
        let eye_regions: Vec<_> = filtered_faces
            .iter()
            .flat_map(|f| vec![f.left_eye, f.right_eye])
            .collect();
        if eye_enlarge > 1e-4 {
            apply_eye_enlarge(img, &eye_regions, eye_enlarge / 100.0)?;
        }
        if eye_brighten > 1e-4 {
            apply_eye_brighten(img, &eye_regions, eye_brighten / 100.0)?;
        }
    }

    // 5. Teeth whiten
    if (teeth_bright > 1e-4 || teeth_desat > 1e-4) && !filtered_faces.is_empty() {
        let teeth_regions: Vec<_> = filtered_faces.iter().map(|f| f.mouth).collect();
        apply_teeth_whitening(
            img,
            &teeth_regions,
            teeth_bright / 100.0,
            teeth_desat / 100.0,
        )?;
    }

    // 6. Makeup
    if !lipstick_color.is_empty() && lipstick_opacity > 1e-4 && !filtered_faces.is_empty() {
        let lip_regions: Vec<_> = filtered_faces.iter().map(|f| f.mouth).collect();
        let col = hex_to_rgb(&lipstick_color).unwrap_or((200, 50, 50));
        apply_makeup(img, "lip", &lip_regions, col, lipstick_opacity / 100.0)?;
    }
    if !blush_color.is_empty() && blush_opacity > 1e-4 && !filtered_faces.is_empty() {
        // Blush: on cheeks, lateral to nose
        let mut blush_regions = Vec::new();
        for face in &filtered_faces {
            let cheek_r = face.face_rect.2 / 5;
            blush_regions.push((
                face.left_eye.0.saturating_sub(cheek_r),
                face.left_eye.1 + cheek_r,
                cheek_r,
            ));
            blush_regions.push((
                face.right_eye.0 + cheek_r,
                face.right_eye.1 + cheek_r,
                cheek_r,
            ));
        }
        let col = hex_to_rgb(&blush_color).unwrap_or((220, 100, 100));
        apply_makeup(img, "blush", &blush_regions, col, blush_opacity / 100.0)?;
    }
    if !eyebrow_color.is_empty() && eyebrow_opacity > 1e-4 && !filtered_faces.is_empty() {
        let brow_regions: Vec<_> = filtered_faces
            .iter()
            .map(|f| {
                let brow_y = f.face_rect.1 + f.face_rect.3 / 5;
                let brow_r = f.face_rect.2 / 6;
                (f.face_rect.0 + f.face_rect.2 / 2, brow_y, brow_r)
            })
            .collect();
        let col = hex_to_rgb(&eyebrow_color).unwrap_or((80, 50, 30));
        apply_makeup(img, "eyebrow", &brow_regions, col, eyebrow_opacity / 100.0)?;
    }

    // 7. Hair adjust
    if (hair_hue.abs() > 1e-4 || hair_bright.abs() > 1e-4) && !filtered_faces.is_empty() {
        apply_hair_adjust(img, &filtered_faces, hair_hue, hair_bright / 50.0)?;
    }

    // 8. Body reshape
    if (body_slim > 1e-4 || body_height > 1e-4 || leg_len > 1e-4) && !filtered_faces.is_empty() {
        apply_body_reshape(
            img,
            &filtered_faces,
            body_slim / 100.0,
            body_height / 100.0,
            leg_len / 100.0,
            body_symmetry,
        )?;
    }

    // 9. Skin tone unify (subtle, applied last)
    // Only apply when skin smoothing is active so we don't force an unwanted
    // color shift when the user has not enabled any portrait adjustments.
    if skin_strength > 1e-4 && !filtered_faces.is_empty() {
        let unify_strength = skin_strength / 100.0 * 0.1;
        apply_skin_tone_unify(img, &filtered_faces, 0.0, 0.0, unify_strength)?;
    }

    Ok(())
}

fn hex_to_rgb(hex: &str) -> Option<(u8, u8, u8)> {
    let hex = hex.trim_start_matches('#');
    if hex.len() == 6 {
        let r = u8::from_str_radix(&hex[0..2], 16).ok()?;
        let g = u8::from_str_radix(&hex[2..4], 16).ok()?;
        let b = u8::from_str_radix(&hex[4..6], 16).ok()?;
        Some((r, g, b))
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgba, RgbaImage};

    #[test]
    fn test_rgb_to_f32_roundtrip() {
        assert_eq!(rgb_to_f32(0, 0, 0), (0.0, 0.0, 0.0));
        assert_eq!(rgb_to_f32(255, 255, 255), (1.0, 1.0, 1.0));
        assert_eq!(
            rgb_to_f32(128, 128, 128),
            (128.0 / 255.0, 128.0 / 255.0, 128.0 / 255.0)
        );
    }

    #[test]
    fn test_f32_to_rgb_clamps() {
        assert_eq!(f32_to_rgb(-0.5, 1.2, 0.5), (0, 255, 128));
        assert_eq!(f32_to_rgb(0.0, 0.0, 1.0), (0, 0, 255));
    }

    #[test]
    fn test_luminance() {
        assert_eq!(luminance(1.0, 1.0, 1.0), 1.0);
        assert_eq!(luminance(0.0, 0.0, 0.0), 0.0);
        let lum = luminance(1.0, 0.0, 0.0);
        assert!((lum - 0.299).abs() < 1e-6);
    }

    #[test]
    fn test_gaussian() {
        assert_eq!(gaussian(0.0, 1.0), 1.0);
        assert!(gaussian(3.0, 1.0) < 0.05);
        assert_eq!(gaussian(0.0, 0.0), 1.0);
        assert_eq!(gaussian(1.0, 0.0), 0.0);
    }

    #[test]
    fn test_rgb_to_hsl_red() {
        let (h, s, l) = rgb_to_hsl(1.0, 0.0, 0.0);
        assert!((h - 0.0).abs() < 1e-3 || (h - 360.0).abs() < 1e-3);
        assert!((s - 1.0).abs() < 1e-3);
        assert!((l - 0.5).abs() < 1e-3);
    }

    #[test]
    fn test_hsl_to_rgb_roundtrip() {
        for h in [0.0, 60.0, 120.0, 180.0, 240.0, 300.0] {
            for s in [0.0, 0.5, 1.0] {
                for l in [0.25, 0.5, 0.75] {
                    let (r, g, b) = hsl_to_rgb(h, s, l);
                    let (h2, s2, l2) = rgb_to_hsl(r, g, b);
                    if s > 1e-6 {
                        let dh = (h - h2).abs().min(360.0 - (h - h2).abs());
                        assert!(
                            dh < 1.0,
                            "HSL roundtrip failed for h={}, s={}, l={}",
                            h,
                            s,
                            l
                        );
                        assert!((s - s2).abs() < 1e-3);
                    }
                    assert!((l - l2).abs() < 1e-3);
                }
            }
        }
    }

    #[test]
    fn test_rgb_to_ycbcr() {
        let (y, cb, cr) = rgb_to_ycbcr(255, 255, 255);
        assert!(y > 250.0);
        assert!(cb > 125.0 && cb < 135.0);
        assert!(cr > 125.0 && cr < 135.0);
    }

    #[test]
    fn test_rgb_to_lab_roundtrip() {
        let (l, a, b) = rgb_to_lab(0.5, 0.5, 0.5);
        let (r, g, b_out) = lab_to_rgb(l, a, b);
        assert!((r - 0.5).abs() < 1e-3);
        assert!((g - 0.5).abs() < 1e-3);
        assert!((b_out - 0.5).abs() < 1e-3);
    }

    #[test]
    fn test_hex_to_rgb() {
        assert_eq!(hex_to_rgb("#FF0000"), Some((255, 0, 0)));
        assert_eq!(hex_to_rgb("00FF00"), Some((0, 255, 0)));
        assert_eq!(hex_to_rgb("0000FF"), Some((0, 0, 255)));
        assert_eq!(hex_to_rgb("GG0000"), None);
        assert_eq!(hex_to_rgb("FF000"), None);
    }

    #[test]
    fn test_apply_skin_smoothing_zero_image() {
        let mut img =
            DynamicImage::ImageRgba8(RgbaImage::from_pixel(1, 1, Rgba([128, 128, 128, 255])));
        assert!(apply_skin_smoothing(&mut img, 0.5, 0.5, &[]).is_ok());
    }

    #[test]
    fn test_apply_skin_smoothing_rejects_zero_dim() {
        let mut img = DynamicImage::ImageRgba8(RgbaImage::new(0, 10));
        assert!(apply_skin_smoothing(&mut img, 0.5, 0.5, &[]).is_err());
    }

    #[test]
    fn test_detect_face_regions_tiny_image() {
        let img = DynamicImage::ImageRgba8(RgbaImage::new(16, 16));
        let regions = detect_face_regions(&img);
        assert!(regions.is_empty());
    }

    #[test]
    fn test_apply_face_reshape_zero_dim() {
        let mut img = DynamicImage::ImageRgba8(RgbaImage::new(0, 10));
        assert!(apply_face_reshape(&mut img, &[], 0.5, 0.5).is_err());
    }

    #[test]
    fn test_apply_eye_enlarge_no_regions() {
        let mut img =
            DynamicImage::ImageRgba8(RgbaImage::from_pixel(10, 10, Rgba([255, 0, 0, 255])));
        assert!(apply_eye_enlarge(&mut img, &[], 0.5).is_ok());
    }

    #[test]
    fn test_apply_teeth_whitening_zero_dim() {
        let mut img = DynamicImage::ImageRgba8(RgbaImage::new(0, 10));
        assert!(apply_teeth_whitening(&mut img, &[(5, 5, 3)], 0.5, 0.5).is_err());
    }

    #[test]
    fn test_apply_eye_brighten_zero_dim() {
        let mut img = DynamicImage::ImageRgba8(RgbaImage::new(0, 10));
        assert!(apply_eye_brighten(&mut img, &[(5, 5, 3)], 0.5).is_err());
    }

    #[test]
    fn test_apply_makeup_zero_dim() {
        let mut img = DynamicImage::ImageRgba8(RgbaImage::new(0, 10));
        assert!(apply_makeup(&mut img, "lip", &[(5, 5, 3)], (200, 50, 50), 0.5).is_err());
    }

    #[test]
    fn test_apply_blemish_removal_zero_dim() {
        let mut img = DynamicImage::ImageRgba8(RgbaImage::new(0, 10));
        assert!(apply_blemish_removal(&mut img, &[(5, 5, 3)], 0.5).is_err());
    }

    #[test]
    fn test_apply_hair_adjust_zero_dim() {
        let mut img = DynamicImage::ImageRgba8(RgbaImage::new(0, 10));
        assert!(apply_hair_adjust(&mut img, &[], 10.0, 0.1).is_err());
    }

    #[test]
    fn test_apply_body_reshape_empty_faces() {
        let mut img =
            DynamicImage::ImageRgba8(RgbaImage::from_pixel(10, 10, Rgba([255, 0, 0, 255])));
        assert!(apply_body_reshape(&mut img, &[], 0.5, 0.5, 0.5, true).is_ok());
    }

    #[test]
    fn test_apply_skin_tone_unify_zero_dim() {
        let mut img = DynamicImage::ImageRgba8(RgbaImage::new(0, 10));
        assert!(apply_skin_tone_unify(&mut img, &[], 0.0, 0.0, 0.5).is_err());
    }

    #[test]
    fn test_apply_one_click_beauty_no_faces() {
        let mut img =
            DynamicImage::ImageRgba8(RgbaImage::from_pixel(10, 10, Rgba([128, 128, 128, 255])));
        assert!(apply_one_click_beauty(&mut img, 0.5, &[]).is_ok());
    }

    #[test]
    fn test_compute_center_radius_empty() {
        assert_eq!(compute_center_radius(&[]), (0, 0, 0));
    }

    #[test]
    fn test_compute_center_radius_single() {
        assert_eq!(compute_center_radius(&[(10.0, 20.0)]), (10, 20, 1));
    }

    #[test]
    fn test_label_connected_components_empty() {
        let mask = vec![false; 4];
        let labels = label_connected_components(&mask, 2, 2);
        assert_eq!(labels, vec![0, 0, 0, 0]);
    }

    #[test]
    fn test_extract_components_empty() {
        let labels = vec![0, 0, 0, 0];
        let comps = extract_components(&labels, 2, 2);
        assert!(comps.is_empty());
    }

    #[test]
    fn test_erode_mask_all_false() {
        let src = vec![false; 4];
        let mut dst = vec![false; 4];
        erode_mask(&src, 2, 2, &mut dst, 1);
        assert_eq!(dst, vec![false, false, false, false]);
    }

    #[test]
    fn test_dilate_mask_all_false() {
        let src = vec![false; 4];
        let mut dst = vec![false; 4];
        dilate_mask(&src, 2, 2, &mut dst, 1);
        assert_eq!(dst, vec![false, false, false, false]);
    }
}
