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

    let s = strength.clamp(0.0, 1.0);
    let dp = detail_preserve.clamp(0.0, 1.0);

    // Strength -> sigmas: 正向关系，strength越大sigma越大，磨皮越强
    // range_sigma: color domain (0-255 scale), 10 -> 75
    let range_sigma = 10.0 + s * 65.0;
    // spatial_sigma: spatial domain (pixels), from 1.5 -> 5.0
    // Bug fix: was fixed at 3.0, now scales with strength properly
    let spatial_sigma = 1.5 + s * 3.5;
    // Ensure minimum spatial sigma so that the filter is never a no-op (sigma<1 would degrade to identity)
    let spatial_sigma = spatial_sigma.max(1.5);

    // detail_preserve reduces effective range sigma, making filter more edge-aware (stronger edges preserved)
    let effective_range_sigma = range_sigma * (1.0 - dp * 0.7);

    let radius = (spatial_sigma * 3.0).ceil() as i32;

    let src_raw = src.as_raw();

    let w_usize = w as usize;
    let h_usize = h as usize;

    let mut skin_mask = build_feathered_skin_mask(&src, w, h, face_regions);
    // Bug fix: explicitly clamp mask to [0,1] to avoid numerical drift outside the valid range
    for mv in skin_mask.iter_mut() {
        *mv = mv.clamp(0.0, 1.0);
    }

    // Step 1: bilateral filter into a temporary smoothed buffer
    let mut smoothed: Vec<(f32, f32, f32)> = vec![(0.0f32, 0.0f32, 0.0f32); (w * h) as usize];
    {
        let sm = &skin_mask;
        smoothed.par_iter_mut().enumerate().for_each(|(idx, out)| {
            let mask_val = sm[idx];
            let center_offset = idx * 4;

            if mask_val <= 0.001 {
                *out = (0.0, 0.0, 0.0);
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
                *out = (sum_r * inv, sum_g * inv, sum_b * inv);
            } else {
                *out = (cr, cg, cb);
            }
        });
    }

    // Step 2: detail preservation pass (only when detail_preserve > 0)
    // Extracts a "detail" (high-contrast) image from the original vs. a large-blur version,
    // then adds a fraction of it back onto the smoothed result based on detail_preserve.
    // This restores skin pores and fine texture that the bilateral filter would erase.
    let detail_weight = dp * 0.8; // how much of the extracted detail is restored
    if detail_weight > 1e-4 {
        // Build a simple 3x3 box-blurred version of the source for detail extraction.
        // A wider box would be more accurate but this 3x3 is fast and catches fine texture contrast.
        let mut blur3: Vec<(f32, f32, f32)> = vec![(0.0f32, 0.0f32, 0.0f32); (w * h) as usize];
        for y in 0..h_usize {
            for x in 0..w_usize {
                let mut sr = 0.0f32;
                let mut sg = 0.0f32;
                let mut sb = 0.0f32;
                let mut cnt = 0u32;
                for ky in -1..=1i32 {
                    let ny = (y as i32 + ky).clamp(0, (h_usize - 1) as i32) as usize;
                    for kx in -1..=1i32 {
                        let nx = (x as i32 + kx).clamp(0, (w_usize - 1) as i32) as usize;
                        let off = (ny * w_usize + nx) * 4;
                        sr += src_raw[off] as f32;
                        sg += src_raw[off + 1] as f32;
                        sb += src_raw[off + 2] as f32;
                        cnt += 1;
                    }
                }
                let inv = 1.0 / cnt as f32;
                blur3[y * w_usize + x] = (sr * inv, sg * inv, sb * inv);
            }
        }
        // Combine: detail = original - boxblur; output = smoothed + detail_weight * detail
        for idx in 0..(w_usize * h_usize) {
            let mask_val = skin_mask[idx];
            if mask_val <= 0.001 {
                continue;
            }
            let center_offset = idx * 4;
            let or = src_raw[center_offset] as f32;
            let og = src_raw[center_offset + 1] as f32;
            let ob = src_raw[center_offset + 2] as f32;
            let (br, bg, bb) = blur3[idx];
            // "Detail" = high-frequency residual (skin pores, fine edges, texture)
            let dr = or - br;
            let dg = og - bg;
            let db = ob - bb;
            let (sr, sg, sb) = smoothed[idx];
            // Only add positive portion of detail weight via mask to avoid double-blending.
            let w = detail_weight * mask_val;
            smoothed[idx] = (sr + dr * w, sg + dg * w, sb + db * w);
        }
    }

    // Step 3: write final pixels, blending smoothed result with original per skin_mask weight
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
            let (sr, sg, sb) = smoothed[idx];
            let or = src_raw[center_offset] as f32;
            let og = src_raw[center_offset + 1] as f32;
            let ob = src_raw[center_offset + 2] as f32;
            let mv = mask_val;
            // Bug fix: clamp final blended value to [0,255] before the u8 cast
            // to guard against FP rounding error pushing values outside the valid range.
            let fr = (sr * mv + or * (1.0 - mv)).round().clamp(0.0, 255.0) as u8;
            let fg = (sg * mv + og * (1.0 - mv)).round().clamp(0.0, 255.0) as u8;
            let fb = (sb * mv + ob * (1.0 - mv)).round().clamp(0.0, 255.0) as u8;
            pixel[0] = fr;
            pixel[1] = fg;
            pixel[2] = fb;
            pixel[3] = src_raw[center_offset + 3];
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
/// `slim_amount` controls horizontal pinching of the jaw region (0..1).
/// `jaw_amount` controls vertical compression/extension of the jaw (-1..1, negative=shrink, positive=elongate).
/// `forehead_amount` controls vertical compression/extension of the forehead (-1..1, negative=lower/press, negative=raise/enlarge).
pub fn apply_face_reshape(
    img: &mut DynamicImage,
    face_regions: &[FaceRegion],
    slim_amount: f32,
    jaw_amount: f32,
    forehead_amount: f32,
) -> Result<(), String> {
    let (w, h) = img.dimensions();
    if w == 0 || h == 0 {
        return Err("Image has zero dimensions".to_string());
    }
    let mut rgba = img.to_rgba8();
    apply_face_reshape_rgba(
        &mut rgba,
        w,
        h,
        face_regions,
        slim_amount,
        jaw_amount,
        forehead_amount,
    );
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
    forehead_amount: f32,
) {
    if face_regions.is_empty() {
        return;
    }

    let slim = slim_amount.clamp(-1.0, 1.0);
    let jaw = jaw_amount.clamp(-1.0, 1.0);
    let forehead = forehead_amount.clamp(-1.0, 1.0);

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
            // Bug #6 fix: slim, jaw, and forehead must operate on the original
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
                // slim is always non-negative (0..1), dx * strength subtracts
                // → moves sx inward toward center (pinches jaw/cheek region).
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

                // Jaw: vertical compression/elongation from ORIGINAL position.
                // Operates on lower half of the face (norm_y > 0).
                // jaw positive → strength > 0 → sy -= dy * (+) → dy>0 (lower half)
                //   → sy decreases → samples from above → output stretched down (jaw longer).
                // jaw negative → strength < 0 → sy increases → samples from below
                //   → output compressed upward (jaw shorter).
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

                // Forehead: vertical compression/raising on upper half (norm_y < 0).
                // Operates on upper half of the face (norm_y in [-1, 0]).
                // forehead positive → strength > 0 → sy -= dy * (+) where dy<0
                //   → sy -= (negative) = sy increases → samples from below → stretched up (forehead taller).
                // forehead negative → strength < 0 → sy -= dy * (-) where dy<0
                //   → sy -= (positive) = sy decreases → samples from above → compressed down (forehead shorter).
                if forehead.abs() > 1e-4 {
                    let dx = orig_x - face_cx;
                    let dy = orig_y - face_cy;
                    let norm_y = dy / (fh as f32 / 2.0).max(1.0);
                    if norm_y > -1.0 && norm_y < 0.0 {
                        let norm_x = dx / (fw as f32 / 2.0).max(1.0);
                        let dist_sq = norm_x * norm_x + norm_y * norm_y;
                        if dist_sq < 1.0 {
                            let falloff = 1.0 - dist_sq;
                            // Upper-only weight: stronger at top of face (norm_y near -1)
                            let upper_weight = (-norm_y).clamp(0.0, 1.0);
                            let strength = forehead * falloff * falloff * upper_weight * 0.20;
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
    if regions.is_empty() {
        return;
    }

    // brightness=1.0 (100%) → max lift of 0.40 (was 0.25) for stronger whitening
    let max_brightness_lift = brightness.clamp(0.0, 1.0) * 0.40;
    let sat_factor = 1.0 - saturation.clamp(0.0, 1.0) * 0.8;

    for &(cx, cy, radius) in regions {
        let r = radius.max(1);
        if r == 0 {
            continue;
        }
        let r_f = r as f32;
        // Expand scan region by 15% to include soft feather zone
        let scan_r = (r_f * 1.15).ceil() as i32;
        let x_min = (cx as i32 - scan_r).max(0) as u32;
        let x_max = (cx as i32 + scan_r).min(w as i32 - 1) as u32;
        let y_min = (cy as i32 - scan_r).max(0) as u32;
        let y_max = (cy as i32 + scan_r).min(h as i32 - 1) as u32;

        for y in y_min..=y_max {
            for x in x_min..=x_max {
                let dx = x as f32 - cx as f32;
                let dy = y as f32 - cy as f32;
                let dist = (dx * dx + dy * dy).sqrt();

                // Soft mask instead of hard cut-off.
                // Inside r*0.85: full weight. r*0.85 ~ r*1.15: smooth feather to 0.
                let feather_inner = r_f * 0.85;
                let feather_outer = r_f * 1.15;
                let spatial_weight = if dist <= feather_inner {
                    1.0
                } else if dist < feather_outer {
                    1.0 - (dist - feather_inner) / (feather_outer - feather_inner)
                } else {
                    continue;
                };
                let spatial_weight = spatial_weight * spatial_weight;

                let pixel = rgba.get_pixel(x, y);
                let (rf, gf, bf) = rgb_to_f32(pixel[0], pixel[1], pixel[2]);

                let (hue, sat, lum) = rgb_to_hsl(rf, gf, bf);

                // Hue: extended from 20-80 to 15-85 to better cover
                // Asian yellow teeth (some approach 60°) and slight off-yellows.
                let is_tooth_hue = hue > 15.0 && hue < 85.0;
                // Saturation: raised from 0.55 to 0.70 to catch heavily
                // stained / yellow teeth with higher chroma.
                let is_tooth_sat = sat < 0.70;
                // Luminance: lowered from 0.25 to 0.20 to include slightly
                // shadowed teeth (e.g. mouth corners under soft lighting).
                let is_tooth_lum = lum > 0.20;

                if is_tooth_hue && is_tooth_sat && is_tooth_lum {
                    let weight = spatial_weight;

                    let new_sat = sat * (1.0 - weight * (1.0 - sat_factor));
                    // Stronger, perceptually-linear brightening curve.
                    let new_lum = lum + (1.0 - lum) * weight * max_brightness_lift;

                    let (nr, ng, nb) =
                        hsl_to_rgb(hue, new_sat.clamp(0.0, 1.0), new_lum.clamp(0.0, 1.0));
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

                // Highlight protection: very bright pixels should also be
                // protected from over-brightening that causes blown-out whites.
                // lum > 0.80 starts ramping down, lum >= 0.95 fully protected.
                let highlight_protection = (1.0 - (lum - 0.80) / 0.15).clamp(0.0, 1.0);

                let effective_weight = weight * dark_protection * highlight_protection;

                let boost = bright * effective_weight;
                let new_r = (rf + (1.0 - rf) * boost).clamp(0.0, 1.0);
                let new_g = (gf + (1.0 - gf) * boost).clamp(0.0, 1.0);
                let new_b = (bf + (1.0 - bf) * boost).clamp(0.0, 1.0);

                let contrast_boost = 1.0 + effective_weight * bright * 0.5;
                let mid = 0.5;
                let cr = (mid + (new_r - mid) * contrast_boost).clamp(0.0, 1.0);
                let cg = (mid + (new_g - mid) * contrast_boost).clamp(0.0, 1.0);
                let cb = (mid + (new_b - mid) * contrast_boost).clamp(0.0, 1.0);

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
    if regions.is_empty() {
        return Ok(());
    }

    let mut rgba = img.to_rgba8();
    let alpha = opacity.clamp(0.0, 1.0);
    let (mr, mg, mb) = rgb_to_f32(color.0, color.1, color.2);
    // Pre-compute HSL of the makeup color for lip-blend (HS + preserve L) mode
    let (makeup_hue, makeup_sat, makeup_lum_val) = rgb_to_hsl(mr, mg, mb);

    for &(cx, cy, radius) in regions {
        let r = radius.max(1);
        if r == 0 {
            continue;
        }
        let r_f = r as f32;
        // Expand scan by 15% for soft feather zone (no hard cut-off)
        let scan_r = (r_f * 1.15).ceil() as i32;
        let x_min = (cx as i32 - scan_r).max(0) as u32;
        let x_max = (cx as i32 + scan_r).min(w as i32 - 1) as u32;
        let y_min = (cy as i32 - scan_r).max(0) as u32;
        let y_max = (cy as i32 + scan_r).min(h as i32 - 1) as u32;

        for y in y_min..=y_max {
            for x in x_min..=x_max {
                let dx = x as f32 - cx as f32;
                let dy = y as f32 - cy as f32;
                let dist = (dx * dx + dy * dy).sqrt();

                // Smooth feather mask instead of hard radius cut-off
                let feather_inner = r_f * 0.85;
                let feather_outer = r_f * 1.15;
                let weight = if dist <= feather_inner {
                    1.0
                } else if dist < feather_outer {
                    1.0 - (dist - feather_inner) / (feather_outer - feather_inner)
                } else {
                    continue;
                };
                let weight = weight * weight;

                // Defensive clamp: opacity * weight should never exceed 1.0
                let effective_alpha = (alpha * weight).clamp(0.0, 1.0);

                let pixel = rgba.get_pixel(x, y);
                let (rf, gf, bf) = rgb_to_f32(pixel[0], pixel[1], pixel[2]);
                let (hue, sat, orig_l) = rgb_to_hsl(rf, gf, bf);
                let orig_lum = luminance(rf, gf, bf);

                // Hue/semantic area match
                let matches = match makeup_type {
                    "lip" => (hue < 20.0 || hue > 340.0) && sat > 0.2,
                    "blush" => (hue < 30.0 || hue > 330.0) && sat > 0.05,
                    "eyebrow" => sat < 0.3,
                    _ => true,
                };

                if !matches {
                    continue;
                }

                if effective_alpha < 1e-4 {
                    continue;
                }

                let (nr, ng, nb) = if makeup_type == "lip" {
                    // Lipstick special blend: inject color (H+S) while mostly
                    // preserving the original lip luminance. This avoids the
                    // "dark lipstick → unnaturally dark flat lips" problem,
                    // and instead adds saturated color on top of natural shading.
                    // Fallback for grey/black/white makeup (makeup_sat≈0):
                    // still apply as a tinted luminance overlay so the user
                    // gets visible effect even with pure black/white picks.
                    if makeup_sat > 0.02 {
                        let blended_s = sat + (makeup_sat - sat) * effective_alpha;
                        let blended_h = if (makeup_hue - hue).abs() <= 180.0 {
                            hue + (makeup_hue - hue) * effective_alpha
                        } else {
                            // Wrap around 0/360
                            let delta = if makeup_hue > hue {
                                makeup_hue - hue - 360.0
                            } else {
                                makeup_hue - hue + 360.0
                            };
                            (hue + delta * effective_alpha + 360.0) % 360.0
                        };
                        // Keep 80% of original luminance + 20% of makeup luminance
                        let blended_l = orig_l * (1.0 - 0.35 * effective_alpha)
                            + makeup_lum_val * 0.35 * effective_alpha;
                        let (cr, cg, cb) = hsl_to_rgb(
                            blended_h.rem_euclid(360.0),
                            blended_s.clamp(0.0, 1.0),
                            blended_l.clamp(0.0, 1.0),
                        );
                        // Final cross-fade between original and HS-blended color
                        (
                            rf * (1.0 - effective_alpha) + cr * effective_alpha,
                            gf * (1.0 - effective_alpha) + cg * effective_alpha,
                            bf * (1.0 - effective_alpha) + cb * effective_alpha,
                        )
                    } else {
                        // Achromatic makeup (black/grey/white): use luminance tint
                        let tint_l = orig_l + (makeup_lum_val - orig_l) * effective_alpha;
                        let (cr, cg, cb) = hsl_to_rgb(hue, sat, tint_l.clamp(0.0, 1.0));
                        (cr, cg, cb)
                    }
                } else {
                    // Blush / Eyebrow / default: perceptual luminance-preserving
                    // RGB blend. For low-sat colors (e.g. eyebrow pencil black)
                    // this still works because lum_scale uses orig_lum dominantly.
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

                    (
                        rf * (1.0 - effective_alpha) + adj_mr * effective_alpha,
                        gf * (1.0 - effective_alpha) + adj_mg * effective_alpha,
                        bf * (1.0 - effective_alpha) + adj_mb * effective_alpha,
                    )
                };

                let (r8, g8, b8) =
                    f32_to_rgb(nr.clamp(0.0, 1.0), ng.clamp(0.0, 1.0), nb.clamp(0.0, 1.0));
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
                // Bug fix: use filter_map + get() to avoid panic if the model returns < 63 points
                // (e.g. an older/custom landmark model or partial detection).
                let nose_pts: Vec<_> = (51..63).filter_map(|i| pts.get(i).copied()).collect();
                let (n_cx, n_cy, n_r) = compute_center_radius(&nose_pts);

                // Mouth: indices 87..106
                let mouth_pts: Vec<_> = (87..106).filter_map(|i| pts.get(i).copied()).collect();
                let (m_cx, m_cy, m_r) = compute_center_radius(&mouth_pts);

                // Jawline: 3 key points from contour (0, 16, 32)
                // Guard every index to avoid panics on short landmark arrays.
                let p0 = pts.get(0).copied().unwrap_or((0.0, 0.0));
                let p16 = pts.get(16).copied().unwrap_or(p0);
                let p32 = pts.get(32).copied().unwrap_or(p16);
                let jawline_points = vec![p0, p16, p32];

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

                // ── Hair heuristic (comprehensive, Bug #11 + vivid-hair + extended-skin fixes) ──
                let is_dark = lum < 0.40;
                let is_low_sat = sat < 0.30 && lum < 0.55;
                let is_light_hair = lum > 0.45 && sat < 0.45 && hue > 35.0 && hue < 70.0;
                let is_white_hair = lum > 0.55 && sat < 0.15;
                // ── Fix #1: Vivid colored hair (red/blue/purple/pink) should be INCLUDED ──
                //   Old code used `sat < 0.55` and EXCLUDED bright dyes.
                let is_vivid_hair_hue = sat > 0.50
                    && ((hue > 300.0 && hue <= 360.0)
                        || (hue >= 0.0 && hue < 30.0)
                        || (hue > 200.0 && hue < 280.0));
                let has_hair_hint =
                    is_dark || is_low_sat || is_light_hair || is_white_hair || is_vivid_hair_hue;

                // ── Fix #2: Expand skin-hue exclusion to cover warm skin range 0..50° + 350..360° ──
                let skin_hue = (hue < 50.0) || (hue > 350.0);
                let is_not_skin = !(skin_hue && sat > 0.12 && lum > 0.20);

                if !(has_hair_hint && is_not_skin) {
                    continue;
                }

                // ── Fix #3: Lower texture threshold from 0.02 to 0.008 for silky straight hair ──
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
                if edge_mag < 0.008 && sat < 0.15 {
                    continue;
                }

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

                // ── Fix #4: Inject minimum saturation for white/silver hair (sat<0.15) so dyeing it is visible ──
                let effective_sat = if is_white_hair && hue_delta.abs() > 1.0 {
                    sat.max(0.25)
                } else {
                    sat
                };

                // ── Fix #5: Use multiplicative brightness (luminance * factor) instead of additive luma shift,
                //           with soft knee protection for values > 0.8 to avoid highlight blowout. ──
                let bright_factor = 1.0 + bright; // e.g. -50% → 0.5×, +50% → 1.5×
                let raw_lum = lum * bright_factor;
                let new_lum = if raw_lum > 0.8 && bright_factor > 1.0 {
                    let over = raw_lum - 0.8;
                    let soft_over = over * 0.3;
                    (0.8 + soft_over).min(1.0)
                } else {
                    raw_lum.clamp(0.0, 1.0)
                };

                let new_hue = (hue + hue_delta * weight).rem_euclid(360.0);
                let (nr, ng, nb) = hsl_to_rgb(new_hue, effective_sat, new_lum);
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
    // Bug fix: consistent zero-dimension handling — match all sibling portrait functions
    // by returning Err (not silent Ok) so callers detect broken input uniformly.
    if w == 0 || h == 0 {
        return Err("Image has zero dimensions".to_string());
    }
    if w < 20 || h < 20 {
        return Ok(());
    }

    let (anchor_face_opt, fallback_mode) = if face_regions.is_empty() {
        (None, true)
    } else {
        match face_regions.iter().min_by_key(|f| f.face_rect.1) {
            Some(f) => {
                let face_area = f.face_rect.2 * f.face_rect.3;
                let img_area = w * h;
                if face_area * 100 < img_area / 100 {
                    (None, true)
                } else {
                    (Some(f.clone()), false)
                }
            }
            None => (None, true),
        }
    };

    let (body_y_start, face_cx_fallback): (u32, f32) = if fallback_mode {
        ((h as f32 * 0.22) as u32, w as f32 / 2.0)
    } else {
        let f = anchor_face_opt.as_ref().unwrap();
        (
            f.face_rect.1 + f.face_rect.3,
            f.face_rect.0 as f32 + f.face_rect.2 as f32 / 2.0,
        )
    };

    if body_y_start >= h.saturating_sub(2) {
        return Ok(());
    }

    let slim = slim_amount.clamp(0.0, 1.0);
    let height = height_amount.clamp(0.0, 1.0);
    let leg = leg_amount.clamp(0.0, 1.0);

    if slim < 1e-4 && height < 1e-4 && leg < 1e-4 {
        return Ok(());
    }

    let src = img.to_rgba8();

    let face_regions_for_mask: Vec<FaceRegion> = if fallback_mode {
        Vec::new()
    } else {
        face_regions.to_vec()
    };
    let body_mask = build_body_mask(
        &src,
        w,
        h,
        &face_regions_for_mask,
        body_y_start,
        fallback_mode,
        face_cx_fallback,
    );

    let mut has_body = false;
    for &v in &body_mask {
        if v > 0.001 {
            has_body = true;
            break;
        }
    }
    if !has_body {
        return Ok(());
    }

    let mut dst = RgbaImage::from_pixel(w, h, Rgba([0, 0, 0, 0]));

    let body_h = (h - body_y_start) as f32;
    let max_total_stretch = 0.35;
    let raw_total = height * 0.15 + leg * 0.20;
    let stretch_cap = if raw_total > max_total_stretch {
        max_total_stretch / raw_total.max(1e-6)
    } else {
        1.0
    };
    let capped_height = height * stretch_cap;
    let capped_leg = leg * stretch_cap;

    let leg_start_norm = 0.55;
    let leg_transition_half_norm = 0.07f32;

    // Bug fix: use face center as the symmetry axis instead of hard-coded image center.
    // When the subject is off-center (e.g. rule-of-thirds composition), the old code
    // would slim the background instead of the body.  Prefer anchor face center; fall
    // back to image midpoint only in fallback mode.
    let cx_slim = if fallback_mode {
        w as f32 / 2.0
    } else {
        face_cx_fallback
    };

    // symmetry_enabled: when true, the horizontal slim displacement is mirrored across
    // cx_slim so that both sides of the body are pulled in equally (prevents body
    // shift / drift that looks unnatural on centered portraits).  When false,
    // displacement is signed per-pixel (negative on left, positive on right), which
    // preserves the original behaviour for artistic / asymmetric shots.
    for y_out in 0..h {
        for x_out in 0..w {
            let mut sx = x_out as f32;
            let mut sy = y_out as f32;

            if y_out >= body_y_start {
                let dy_body = y_out as f32 - body_y_start as f32;
                if body_h > 0.0 {
                    let norm_y = dy_body / body_h;
                    let mask_val = body_mask[(y_out * w + x_out) as usize];

                    if mask_val > 0.001 {
                        if slim > 1e-4 {
                            let dx_raw = sx - cx_slim;
                            // Symmetric slim: pull BOTH sides toward center by the
                            // same absolute magnitude.  Without symmetry the signed
                            // dx directly is used, which is asymmetric by construction
                            // (left side moves right, right side moves left — but
                            // magnitude may differ due to sampling).  With symmetry
                            // enabled we compute weight from |dx| and apply an equal
                            // pull toward axis, which keeps the body centroid stable.
                            let (dx, slim_dir) = if symmetry_enabled {
                                (dx_raw.abs(), -dx_raw.signum())
                            } else {
                                (dx_raw, -1.0f32)
                            };
                            let waist_weight = if norm_y > 0.2 && norm_y < 0.6 {
                                let t = (norm_y - 0.4) / 0.2;
                                1.0 - t.abs()
                            } else {
                                0.0
                            };
                            let falloff = (1.0 - norm_y) * waist_weight;
                            let mut strength = slim * falloff * 0.20 * mask_val;

                            let max_slim_per_side = 0.20;
                            if strength > max_slim_per_side {
                                strength = max_slim_per_side;
                            }
                            if symmetry_enabled {
                                sx += slim_dir * dx * strength;
                            } else {
                                sx -= dx * strength;
                            }
                        }

                        if (capped_height + capped_leg) > 1e-4 {
                            let leg_blend = if norm_y <= leg_start_norm - leg_transition_half_norm {
                                0.0
                            } else if norm_y >= leg_start_norm + leg_transition_half_norm {
                                1.0
                            } else {
                                let t = (norm_y - (leg_start_norm - leg_transition_half_norm))
                                    / (leg_transition_half_norm * 2.0);
                                let t = t.clamp(0.0, 1.0);
                                t * t * (3.0 - 2.0 * t)
                            };

                            let base_stretch = capped_height * 0.15;
                            let leg_stretch = capped_leg * 0.20 * leg_blend;
                            let total_stretch = base_stretch + leg_stretch;

                            let stretch_weight = if norm_y < 0.05 {
                                let t = norm_y / 0.05;
                                t * t
                            } else {
                                norm_y * norm_y
                            };
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

fn build_body_mask(
    rgba: &RgbaImage,
    w: u32,
    h: u32,
    face_regions: &[FaceRegion],
    body_y_start: u32,
    fallback_mode: bool,
    fallback_cx: f32,
) -> Vec<f32> {
    let area = (w * h) as usize;
    let mut mask = vec![0.0f32; area];

    if body_y_start >= h - 1 {
        return mask;
    }

    let (face_cx, face_width) = if fallback_mode {
        let est_face_w = (w as f32 * 0.22).max(40.0);
        (fallback_cx, est_face_w)
    } else {
        let anchor_face = face_regions.iter().min_by_key(|f| f.face_rect.1).unwrap();
        let fc = anchor_face.face_rect.0 as f32 + anchor_face.face_rect.2 as f32 / 2.0;
        let fw = anchor_face.face_rect.2 as f32;
        (fc, fw)
    };

    let body_h = (h - body_y_start) as f32;

    let mut row_left = vec![w as i32; h as usize];
    let mut row_right = vec![0i32; h as usize];

    for y in body_y_start..h {
        let dy = (y - body_y_start) as f32 / body_h.max(1.0);
        let half_width_factor = if dy < 0.35 {
            0.9 - 0.3 * (dy / 0.35)
        } else if dy < 0.65 {
            0.6 + 0.4 * ((dy - 0.35) / 0.30)
        } else {
            1.0 - 0.5 * ((dy - 0.65) / 0.35)
        };
        let expected_half_w = (face_width * half_width_factor * 1.3).max(20.0);

        let cx = face_cx as i32;
        let search_range = (expected_half_w * 1.8).min(w as f32 * 0.45) as i32;

        let mut l = cx;
        for dx in 0..=search_range {
            let xx = (cx - dx).clamp(0, w as i32 - 1) as u32;
            let p = rgba.get_pixel(xx, y);
            let skin_c = skin_confidence(p[0], p[1], p[2]);
            let dist_factor = 1.0 - (dx as f32 / search_range as f32).min(1.0);
            let score = skin_c * 0.5 + dist_factor * 0.5;
            if score < 0.25 && dx as f32 > expected_half_w * 0.6 {
                break;
            }
            l = cx - dx;
        }

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

    let mut smooth_left = row_left.clone();
    let mut smooth_right = row_right.clone();
    for y in (body_y_start + 1)..(h - 1) {
        let yi = y as usize;
        smooth_left[yi] = (row_left[yi - 1] + row_left[yi] + row_left[yi + 1]) / 3;
        smooth_right[yi] = (row_right[yi - 1] + row_right[yi] + row_right[yi + 1]) / 3;
    }
    if body_y_start + 1 < h - 1 {
        let yi = body_y_start as usize;
        if yi + 1 < h as usize {
            smooth_left[yi] = (row_left[yi] + row_left[yi + 1]) / 2;
            smooth_right[yi] = (row_right[yi] + row_right[yi + 1]) / 2;
        }
        let yi2 = (h - 1) as usize;
        if yi2 > 0 {
            smooth_left[yi2] = (row_left[yi2 - 1] + row_left[yi2]) / 2;
            smooth_right[yi2] = (row_right[yi2 - 1] + row_right[yi2]) / 2;
        }
    }

    for y in body_y_start..h {
        let yi = y as usize;
        let l = smooth_left[yi] as f32;
        let r = smooth_right[yi] as f32;
        let cx_r = (l + r) * 0.5;
        let half_w = (r - l) * 0.5;
        let feather = (half_w * 0.15).max(5.0);

        let x_start = (l - feather).max(0.0) as u32;
        let x_end = (r + feather).min(w as f32 - 1.0) as u32;

        for x in x_start..=x_end {
            let dx = (x as f32 - cx_r).abs();
            let dist_from_edge = half_w - dx;
            let weight = if dist_from_edge > 0.0 {
                (dist_from_edge / feather).min(1.0)
            } else {
                0.0
            };
            let clamped = weight.clamp(0.0, 1.0);
            mask[(y * w + x) as usize] = clamped;
        }
    }

    let transition_h: u32 = if fallback_mode {
        (h as f32 * 0.04).max(8.0) as u32
    } else {
        let anchor = face_regions.iter().min_by_key(|f| f.face_rect.1).unwrap();
        (anchor.face_rect.3 as f32 * 0.3).max(5.0) as u32
    };
    let t_end = (body_y_start + transition_h).min(h);
    for y in body_y_start..t_end {
        let dy = (y - body_y_start) as f32 / transition_h as f32;
        let vert_weight = dy * dy;
        let x0 = (y * w) as usize;
        for x in 0..w as usize {
            let idx = x0 + x;
            mask[idx] = (mask[idx] * vert_weight).clamp(0.0, 1.0);
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

    // 4. Face reshape (forehead slightly adjusted for balanced one-click look)
    apply_face_reshape_rgba(&mut rgba, w, h, face_regions, s * 0.25, s * 0.10, s * 0.05);

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

    // 3. Face reshape (face slim 0..1, jaw -1..1, forehead -1..1)
    if face_slim > 1e-4 || jaw.abs() > 1e-4 || forehead.abs() > 1e-4 {
        if !filtered_faces.is_empty() {
            // Adjust face_rect for forehead so the warp ellipse covers the
            // actual forehead region correctly, then apply full liquify warp.
            let mut adjusted_faces: Vec<FaceRegion> = filtered_faces.to_vec();
            if forehead.abs() > 1e-4 {
                for face in &mut adjusted_faces {
                    let shift = (forehead / 50.0 * face.face_rect.3 as f32 / 4.0) as i32;
                    face.face_rect.1 = face.face_rect.1.saturating_add_signed(-shift);
                    face.face_rect.3 = (face.face_rect.3 as i32 + shift).max(10) as u32;
                }
            }
            apply_face_reshape(
                img,
                &adjusted_faces,
                face_slim / 100.0,
                jaw / 50.0,
                forehead / 50.0,
            )?;
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
        // Use the mouth landmark, but shrink radius by 10% to better match
        // the lip area (mouth landmark typically includes a bit of surrounding skin).
        // Skip faces whose mouth radius is invalid (0).
        let lip_regions: Vec<_> = filtered_faces
            .iter()
            .filter_map(|f| {
                let (mx, my, mr) = f.mouth;
                if mr == 0 {
                    None
                } else {
                    let lip_r = (mr as f32 * 0.90).max(1.0) as u32;
                    Some((mx, my, lip_r))
                }
            })
            .collect();
        if !lip_regions.is_empty() {
            let col = hex_to_rgb(&lipstick_color).unwrap_or((200, 50, 50));
            apply_makeup(img, "lip", &lip_regions, col, lipstick_opacity / 100.0)?;
        }
    }
    if !blush_color.is_empty() && blush_opacity > 1e-4 && !filtered_faces.is_empty() {
        // Blush: anchor to the nose position (more stable than eye offsets),
        // place left cheek on the viewer's right-hand side of the nose
        // (i.e. subject's left cheek) and vice versa, roughly on the
        // horizontal mid-line between nose and mouth.
        let mut blush_regions = Vec::new();
        for face in &filtered_faces {
            let (nose_x, nose_y, nose_r) = face.nose;
            let (_, mouth_y, _) = face.mouth;
            if nose_r == 0 {
                continue;
            }
            let cheek_r = (nose_r as f32 * 1.40).max(2.0) as u32;
            // Horizontal offset: ~2× nose radius from the nose center
            let cheek_offset_x = (nose_r as f32 * 2.0).ceil() as i32;
            // Vertical position: roughly 40% from nose down to mouth
            let v_mix = 0.40;
            let cheek_y = (nose_y as f32 * (1.0 - v_mix) + mouth_y as f32 * v_mix) as i32;
            // Left cheek (subject's right = viewer's left)
            let left_cheek_x = (nose_x as i32).saturating_sub(cheek_offset_x);
            // Right cheek (subject's left = viewer's right)
            let right_cheek_x = (nose_x as i32) + cheek_offset_x;
            if left_cheek_x >= 0 {
                blush_regions.push((left_cheek_x as u32, cheek_y.max(0) as u32, cheek_r));
            }
            if (right_cheek_x as u32) < img.dimensions().0 {
                blush_regions.push((right_cheek_x as u32, cheek_y.max(0) as u32, cheek_r));
            }
        }
        if !blush_regions.is_empty() {
            let col = hex_to_rgb(&blush_color).unwrap_or((220, 100, 100));
            apply_makeup(img, "blush", &blush_regions, col, blush_opacity / 100.0)?;
        }
    }
    if !eyebrow_color.is_empty() && eyebrow_opacity > 1e-4 && !filtered_faces.is_empty() {
        // Eyebrows: use TWO separate regions per face, anchored just above
        // the left/right eye landmarks. This matches natural eyebrow
        // position far better than a single center blob.
        let mut brow_regions = Vec::new();
        for face in &filtered_faces {
            let (lex, ley, ler) = face.left_eye;
            let (rex, rey, rer) = face.right_eye;
            let face_w = face.face_rect.2;
            if ler == 0 || rer == 0 || face_w == 0 {
                continue;
            }
            // Eyebrow sits roughly 0.7× eye-radius ABOVE the eye center
            // and is slightly wider than the eye (1.15× radius)
            let brow_r_x = ((ler.max(rer) as f32) * 1.15).max(1.0) as u32;
            let brow_up_offset = ((ler.max(rer) as f32) * 0.70).ceil() as i32;
            let left_brow_y = (ley as i32).saturating_sub(brow_up_offset);
            let right_brow_y = (rey as i32).saturating_sub(brow_up_offset);
            if left_brow_y >= 0 {
                brow_regions.push((lex, left_brow_y as u32, brow_r_x));
            }
            if right_brow_y >= 0 {
                brow_regions.push((rex, right_brow_y as u32, brow_r_x));
            }
        }
        if !brow_regions.is_empty() {
            let col = hex_to_rgb(&eyebrow_color).unwrap_or((80, 50, 30));
            apply_makeup(img, "eyebrow", &brow_regions, col, eyebrow_opacity / 100.0)?;
        }
    }

    // 7. Hair adjust
    // Match the scaling convention: frontend sends hue in 0..100 percent,
    // map to -180..180 degree range (same sign semantics as hue controls elsewhere).
    // Brightness is -50..50 frontend → /50 → -1..1 internally (consistent with above).
    if (hair_hue.abs() > 1e-4 || hair_bright.abs() > 1e-4) && !filtered_faces.is_empty() {
        let hue_degrees = (hair_hue / 100.0) * 180.0; // 0..100 → 0..180, keep sign if frontend sends signed
        let effective_hue = if hair_hue.abs() > 100.0 { hair_hue } else { hue_degrees }; // allow passthrough if already degrees
        apply_hair_adjust(img, &filtered_faces, effective_hue, hair_bright / 50.0)?;
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
        assert!(apply_face_reshape(&mut img, &[], 0.5, 0.5, 0.3).is_err());
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
