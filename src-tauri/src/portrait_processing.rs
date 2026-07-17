use image::{DynamicImage, GenericImageView, Rgba, RgbaImage};
use rayon::prelude::*;

use crate::app_state::AppState;

// ---------------------------------------------------------------------------
// Data structures
// ---------------------------------------------------------------------------

#[derive(Clone, Debug)]
pub struct FaceRegion {
    pub face_rect: (u32, u32, u32, u32), // x, y, width, height
    pub left_eye: (u32, u32, u32),        // x_center, y_center, radius
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
// 1. Skin Smoothing – Bilateral Filter
// ---------------------------------------------------------------------------

/// Apply bilateral filter for skin smoothing.
/// `strength` controls the range sigma (0..1 maps to range_sigma 10..75).
/// `detail_preserve` modulates how much edge detail is retained (0..1).
/// Spatial sigma is fixed at 3.0 as specified.
pub fn apply_skin_smoothing(
    img: &mut DynamicImage,
    strength: f32,
    detail_preserve: f32,
) -> Result<(), String> {
    let (w, h) = img.dimensions();
    if w == 0 || h == 0 {
        return Err("Image has zero dimensions".to_string());
    }

    let rgba = img.to_rgba8();
    let src = rgba.clone();

    // Range sigma is driven by strength; detail_preserve reduces the effective strength
    let range_sigma = 10.0 + strength.clamp(0.0, 1.0) * 65.0;
    let spatial_sigma = 3.0_f32;
    let effective_range_sigma = range_sigma * (1.0 - detail_preserve.clamp(0.0, 1.0) * 0.7);

    let radius = (spatial_sigma * 3.0).ceil() as i32;

    let src_raw = src.as_raw();
    let dst_raw = rgba.as_raw();

    let mut result = dst_raw.to_vec();

    let w_usize = w as usize;
    let h_usize = h as usize;

    result
        .par_chunks_mut(4)
        .enumerate()
        .for_each(|(idx, pixel)| {
            let x = idx % w_usize;
            let y = idx / w_usize;

            let center_offset = (y * w_usize + x) * 4;
            let cr = src_raw[center_offset] as f32;
            let cg = src_raw[center_offset + 1] as f32;
            let cb = src_raw[center_offset + 2] as f32;

            let mut sum_r = 0.0f32;
            let mut sum_g = 0.0f32;
            let mut sum_b = 0.0f32;
            let mut w_sum = 0.0f32;

            let x_i = x as i32;
            let y_i = y as i32;

            for ky in -radius..=radius {
                let ny = (y_i + ky).clamp(0, (h_usize - 1) as i32) as usize;
                for kx in -radius..=radius {
                    let nx = (x_i + kx).clamp(0, (w_usize - 1) as i32) as usize;

                    let spatial_dist = ((kx * kx + ky * ky) as f32).sqrt();
                    let ws = gaussian(spatial_dist, spatial_sigma);

                    let n_offset = (ny * w_usize + nx) * 4;
                    let nr = src_raw[n_offset] as f32;
                    let ng = src_raw[n_offset + 1] as f32;
                    let nb = src_raw[n_offset + 2] as f32;

                    let color_dist = ((cr - nr) * (cr - nr)
                        + (cg - ng) * (cg - ng)
                        + (cb - nb) * (cb - nb))
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
                pixel[0] = (sum_r * inv).round().clamp(0.0, 255.0) as u8;
                pixel[1] = (sum_g * inv).round().clamp(0.0, 255.0) as u8;
                pixel[2] = (sum_b * inv).round().clamp(0.0, 255.0) as u8;
                pixel[3] = src_raw[center_offset + 3];
            } else {
                pixel[0] = src_raw[center_offset];
                pixel[1] = src_raw[center_offset + 1];
                pixel[2] = src_raw[center_offset + 2];
                pixel[3] = src_raw[center_offset + 3];
            }
        });

    let out = RgbaImage::from_raw(w, h, result).ok_or("Failed to create output image")?;
    *img = DynamicImage::ImageRgba8(out);
    Ok(())
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

        // Sample ring pixels from just outside the blemish
        let sample_ring = r + (r / 3).max(1);
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
                    let ring_angle = 2.0 * std::f32::consts::PI * ri as f32 / ring_colors.len() as f32;
                    let angle_diff = (angle - ring_angle).abs();
                    let angle_diff = angle_diff.min(2.0 * std::f32::consts::PI - angle_diff);
                    let aw = (-angle_diff * angle_diff / 1.0).exp(); // angular weight
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
                            (or * (1.0 - blend) + fill_r * blend).round().clamp(0.0, 255.0) as u8,
                            (og * (1.0 - blend) + fill_g * blend).round().clamp(0.0, 255.0) as u8,
                            (ob * (1.0 - blend) + fill_b * blend).round().clamp(0.0, 255.0) as u8,
                            (oa * (1.0 - blend) + fill_a * blend).round().clamp(0.0, 255.0) as u8,
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

    let src = img.to_rgba8();
    let mut dst = RgbaImage::from_pixel(w, h, Rgba([0, 0, 0, 0]));

    let slim = slim_amount.clamp(-1.0, 1.0);
    let jaw = jaw_amount.clamp(-1.0, 1.0);

    // Build warp field: for each output pixel, compute source pixel
    // using inverse mapping with bilinear interpolation
    for y_out in 0..h {
        for x_out in 0..w {
            let mut sx = x_out as f32;
            let mut sy = y_out as f32;

            for face in face_regions {
                let (fx, fy, fw, fh) = face.face_rect;
                let face_cx = fx as f32 + fw as f32 / 2.0;
                let face_cy = fy as f32 + fh as f32 / 2.0;

                // Slim: horizontal displacement toward center, strongest at jaw level
                if slim.abs() > 1e-4 {
                    let dx = sx - face_cx;
                    let dy = sy - face_cy;

                    // Influence region: elliptical around the face
                    let norm_x = dx / (fw as f32 / 2.0).max(1.0);
                    let norm_y = dy / (fh as f32 / 2.0).max(1.0);

                    let dist_sq = norm_x * norm_x + norm_y * norm_y;
                    if dist_sq < 1.0 {
                        // Weight falls off from center, stronger in lower half (jaw)
                        let lower_weight = (norm_y * 0.5 + 0.5).clamp(0.0, 1.0);
                        let falloff = 1.0 - dist_sq;
                        let strength = slim * falloff * falloff * lower_weight * 0.3;
                        sx -= dx * strength;
                    }
                }

                // Jaw: vertical compression of lower face
                if jaw.abs() > 1e-4 {
                    let dx = sx - face_cx;
                    let dy = sy - face_cy;

                    let norm_y = dy / (fh as f32 / 2.0).max(1.0);

                    // Only affect lower portion of the face
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

            // Bilinear interpolation from source
            let px = sample_bilinear_rgba(&src, w, h, sx, sy);
            dst.put_pixel(x_out, y_out, px);
        }
    }

    *img = DynamicImage::ImageRgba8(dst);
    Ok(())
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

    let src = img.to_rgba8();
    let mut dst = RgbaImage::from_pixel(w, h, Rgba([0, 0, 0, 0]));

    let magnify = 1.0 + amount.clamp(0.0, 1.0) * 0.5; // 1.0 .. 1.5

    for y_out in 0..h {
        for x_out in 0..w {
            let mut sx = x_out as f32;
            let mut sy = y_out as f32;

            for &(ecx, ecy, er) in eye_regions {
                let dx = x_out as f32 - ecx as f32;
                let dy = y_out as f32 - ecy as f32;
                let dist = (dx * dx + dy * dy).sqrt();
                let r = er.max(1) as f32;

                if dist < r {
                    // Spherical magnification: map output pixel back to a
                    // contracted source position inside the eye
                    let norm = dist / r;
                    // Smooth falloff so edges blend seamlessly
                    let weight = 1.0 - norm * norm; // quadratic falloff
                    let effective_magnify = 1.0 + (magnify - 1.0) * weight;

                    sx = ecx as f32 + dx / effective_magnify;
                    sy = ecy as f32 + dy / effective_magnify;
                    break; // Only apply the first matching eye region
                }
            }

            let px = sample_bilinear_rgba(&src, w, h, sx, sy);
            dst.put_pixel(x_out, y_out, px);
        }
    }

    *img = DynamicImage::ImageRgba8(dst);
    Ok(())
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

                // Convert to HSL
                let (hue, sat, lum) = rgb_to_hsl(rf, gf, bf);

                // Teeth are typically: hue 30-65 (yellow-ish), low-medium saturation, medium-high lightness
                let is_tooth_hue = hue > 20.0 && hue < 80.0;
                let is_tooth_sat = sat < 0.55;
                let is_tooth_lum = lum > 0.25;

                if is_tooth_hue && is_tooth_sat && is_tooth_lum {
                    // Distance-based weight for smooth falloff
                    let weight = 1.0 - (dist / r as f32);
                    let weight = weight * weight; // Quadratic falloff

                    // New saturation (reduce yellow) and brightness
                    let new_sat = sat * (1.0 - weight * (1.0 - sat_factor));
                    let new_lum = lum + (1.0 - lum) * weight * (brightness_factor - 1.0) * 0.5;

                    let (nr, ng, nb) = hsl_to_rgb(hue, new_sat, new_lum.clamp(0.0, 1.0));
                    let (r8, g8, b8) = f32_to_rgb(nr, ng, nb);

                    rgba.put_pixel(x, y, Rgba([r8, g8, b8, pixel[3]]));
                }
            }
        }
    }

    *img = DynamicImage::ImageRgba8(rgba);
    Ok(())
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
    let bright = brightness.clamp(0.0, 1.0) * 0.3; // Max 30% brightness boost

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

                // Increase brightness: push toward 1.0
                let boost = bright * weight;
                let new_r = rf + (1.0 - rf) * boost;
                let new_g = gf + (1.0 - gf) * boost;
                let new_b = bf + (1.0 - bf) * boost;

                // Slight contrast boost around midtones
                let contrast_boost = 1.0 + weight * bright * 0.5;
                let mid = 0.5;
                let cr = mid + (new_r - mid) * contrast_boost;
                let cg = mid + (new_g - mid) * contrast_boost;
                let cb = mid + (new_b - mid) * contrast_boost;

                let (r8, g8, b8) = f32_to_rgb(cr, cg, cb);
                rgba.put_pixel(x, y, Rgba([r8, g8, b8, pixel[3]]));
            }
        }
    }

    *img = DynamicImage::ImageRgba8(rgba);
    Ok(())
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
                        // Lips: warm hues (red/pink), medium+ saturation
                        (hue < 20.0 || hue > 340.0 || (hue > 300.0 && hue < 360.0))
                            && sat > 0.1
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

                // Blend: overlay the makeup color, preserving some original luminance
                let orig_lum = luminance(rf, gf, bf);
                let makeup_lum = luminance(mr, mg, mb);
                let lum_ratio = if makeup_lum > 0.01 {
                    orig_lum / makeup_lum
                } else {
                    1.0
                };

                let adj_mr = (mr * lum_ratio).min(1.0);
                let adj_mg = (mg * lum_ratio).min(1.0);
                let adj_mb = (mb * lum_ratio).min(1.0);

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
