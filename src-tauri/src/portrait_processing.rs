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

// ---------------------------------------------------------------------------
// 8. Face Region Detection – Skin-tone detection + connected components
// ---------------------------------------------------------------------------

/// Detect face regions using YCbCr skin-tone detection, connected-component
/// analysis and elliptical fitting.  Returns a list of `FaceRegion`s suitable
/// for the portrait-processing pipeline.
///
/// The algorithm works in four stages:
/// 1. YCbCr skin-tone threshold (Cb 77..127, Cr 133..173).
/// 2. Binary morphological opening to remove noise.
/// 3. Connected-component labelling; keep the largest N components.
/// 4. Elliptical bounding box → infer eye / nose / mouth positions.
pub fn detect_face_regions(img: &DynamicImage) -> Vec<FaceRegion> {
    let (w, h) = img.dimensions();
    if w < 32 || h < 32 {
        return Vec::new();
    }

    let rgba = img.to_rgba8();

    // 1. Skin-tone mask in YCbCr
    let mut skin_mask = vec![false; (w * h) as usize];
    for y in 0..h {
        for x in 0..w {
            let p = rgba.get_pixel(x, y);
            let (y_val, cb, cr) = rgb_to_ycbcr(p[0], p[1], p[2]);
            let is_skin = cb >= 77.0 && cb <= 127.0 && cr >= 133.0 && cr <= 173.0 && y_val > 40.0;
            skin_mask[(y * w + x) as usize] = is_skin;
        }
    }

    // 2. Morphological opening (3x3 erosion + 3x3 dilation)
    let mut opened = vec![false; (w * h) as usize];
    erode_mask(&skin_mask, w, h, &mut opened, 1);
    let mut dilated = vec![false; (w * h) as usize];
    dilate_mask(&opened, w, h, &mut dilated, 1);

    // 3. Connected components (4-connectivity)
    let labels = label_connected_components(&dilated, w, h);
    let components = extract_components(&labels, w, h);

    // Keep up to 6 largest components, require minimum area
    let mut sorted = components;
    sorted.sort_by(|a, b| b.area.cmp(&a.area));
    let min_area = (w * h / 100).max(100);
    let top_components: Vec<_> = sorted.into_iter().filter(|c| c.area >= min_area).take(6).collect();

    if top_components.is_empty() {
        return Vec::new();
    }

    // 4. Fit ellipse / bounding box and infer facial features
    let mut regions = Vec::new();
    for comp in &top_components {
        let (cx, cy, cwidth, cheight) = comp.bounding_box;
        let face_cx = cx as f32 + cwidth as f32 / 2.0;
        let face_cy = cy as f32 + cheight as f32 / 2.0;

        // Estimate feature positions based on classical face proportions
        let eye_y = face_cy - cheight as f32 * 0.22;
        let eye_sep = cwidth as f32 * 0.28;
        let left_eye = ((face_cx - eye_sep) as u32, eye_y as u32, (cwidth as f32 * 0.18) as u32);
        let right_eye = ((face_cx + eye_sep) as u32, eye_y as u32, (cwidth as f32 * 0.18) as u32);
        let nose = (face_cx as u32, (face_cy + cheight as f32 * 0.05) as u32, (cwidth as f32 * 0.12) as u32);
        let mouth = (face_cx as u32, (face_cy + cheight as f32 * 0.30) as u32, (cwidth as f32 * 0.22) as u32);

        // Jawline: simple V-shape based on face width/height
        let jaw_width = cwidth as f32 * 0.45;
        let jaw_y = face_cy + cheight as f32 * 0.42;
        let jawline_points = vec![
            ((face_cx - jaw_width) as u32, jaw_y as u32),
            (face_cx as u32, (jaw_y + cheight as f32 * 0.08) as u32),
            ((face_cx + jaw_width) as u32, jaw_y as u32),
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

                // Eyes: indices 63..87 (24 points). Split by median x.
                let eye_pts: Vec<_> = (63..87).map(|i| pts[i]).collect();
                let (left_eye_pts, right_eye_pts) = if !eye_pts.is_empty() {
                    let mut xs: Vec<f32> = eye_pts.iter().map(|p| p.0).collect();
                    xs.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
                    let median_x = xs[xs.len() / 2];
                    let left: Vec<_> = eye_pts.iter().filter(|p| p.0 < median_x).copied().collect();
                    let right: Vec<_> = eye_pts.iter().filter(|p| p.0 >= median_x).copied().collect();
                    (left, right)
                } else {
                    (Vec::new(), Vec::new())
                };
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
                if !all_set { break; }
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
                if any_set { break; }
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

// ---------------------------------------------------------------------------
// 9. Hair Adjustment – Hue shift + Brightness
// ---------------------------------------------------------------------------

/// Adjust hair color by shifting hue and brightness in hair-like regions.
/// Uses dark/low-saturation pixel detection as a proxy for hair.
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

    // Hair region: above and around each face, dark / low-sat pixels
    for face in face_regions {
        let (fx, fy, fw, fh) = face.face_rect;
        let head_top = fy.saturating_sub(fh / 2);
        let head_bottom = (fy + fh * 3 / 2).min(h - 1);
        let head_left = (fx as i32 - (fw as i32) / 2).max(0) as u32;
        let head_right = (fx + fw * 3 / 2).min(w - 1);

        for y in head_top..=head_bottom {
            for x in head_left..=head_right {
                let pixel = rgba.get_pixel(x, y);
                let (rf, gf, bf) = rgb_to_f32(pixel[0], pixel[1], pixel[2]);
                let (hue, sat, lum) = rgb_to_hsl(rf, gf, bf);

                // Hair heuristic: dark or low saturation
                let is_hair = lum < 0.35 || (lum < 0.55 && sat < 0.25);
                if !is_hair {
                    continue;
                }

                // Distance from face center for falloff
                let fcx = fx as f32 + fw as f32 / 2.0;
                let fcy = fy as f32 + fh as f32 / 2.0;
                let dx = x as f32 - fcx;
                let dy = y as f32 - fcy;
                let norm_x = dx / (fw as f32 * 1.2).max(1.0);
                let norm_y = dy / (fh as f32 * 1.2).max(1.0);
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
// 10. Body Reshape – Liquify for full-body slimming / elongation
// ---------------------------------------------------------------------------

/// Apply body reshaping (slim, heighten, leg-lengthen) using a mesh warp.
/// Operates on the lower half of the image relative to the face position.
pub fn apply_body_reshape(
    img: &mut DynamicImage,
    face_regions: &[FaceRegion],
    slim_amount: f32,
    height_amount: f32,
    leg_amount: f32,
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
                        let strength = slim * falloff * 0.25;
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
                        sy -= dy_body * total_stretch * stretch_weight;
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

// ---------------------------------------------------------------------------
// 11. Skin Tone Unify – LAB-based skin-tone equalisation
// ---------------------------------------------------------------------------

/// Unify skin tone by shifting detected skin pixels toward a target skin colour
/// in CIELAB space while preserving local luminance variation.
pub fn apply_skin_tone_unify(
    img: &mut DynamicImage,
    face_regions: &[FaceRegion],
    warmth: f32,      // -1..1  (cool ↔ warm)
    redness: f32,     // -1..1  (green ↔ red)
    strength: f32,    // 0..1
) -> Result<(), String> {
    let (w, h) = img.dimensions();
    if w == 0 || h == 0 {
        return Err("Image has zero dimensions".to_string());
    }

    let mut rgba = img.to_rgba8();
    let s = strength.clamp(0.0, 1.0);
    if s < 1e-4 {
        return Ok(());
    }

    // Target LAB skin tone: L*=70, a*=15 (slightly red), b*=18 (slightly yellow)
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

                // Skin-tone heuristic: moderate saturation, warm hue
                let (hue, sat, lum) = rgb_to_hsl(rf, gf, bf);
                let is_skin = (hue < 50.0 || hue > 330.0) && sat > 0.08 && sat < 0.65 && lum > 0.15 && lum < 0.85;
                if !is_skin {
                    continue;
                }

                let (l, a, b_val) = rgb_to_lab(rf, gf, bf);

                // Shift toward target, preserving luminance
                let new_a = a + (target_a - a) * s;
                let new_b = b_val + (target_b - b_val) * s;

                let (nr, ng, nb) = lab_to_rgb(l, new_a, new_b);
                let (r8, g8, b8) = f32_to_rgb(nr, ng, nb);
                rgba.put_pixel(x, y, Rgba([r8, g8, b8, pixel[3]]));
            }
        }
    }

    *img = DynamicImage::ImageRgba8(rgba);
    Ok(())
}

#[inline(always)]
fn rgb_to_lab(r: f32, g: f32, b: f32) -> (f32, f32, f32) {
    // D65 illuminant
    let x = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b;
    let y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b;
    let z = 0.0193339 * r + 0.1191920 * g + 0.9503041 * b;

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
    (r, g, b)
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

    if face_regions.is_empty() {
        // No face detected → apply a gentle global skin-tone smoothing
        apply_skin_smoothing(img, s * 0.3, 0.7)?;
        return Ok(());
    }

    // Skin smoothing
    apply_skin_smoothing(img, s * 0.35, 0.65)?;

    // Eye brighten
    let eye_regions: Vec<_> = face_regions.iter()
        .flat_map(|f| vec![f.left_eye, f.right_eye])
        .collect();
    if !eye_regions.is_empty() {
        apply_eye_brighten(img, &eye_regions, s * 0.45)?;
        apply_eye_enlarge(img, &eye_regions, s * 0.20)?;
    }

    // Teeth whiten
    let teeth_regions: Vec<_> = face_regions.iter()
        .map(|f| f.mouth)
        .collect();
    if !teeth_regions.is_empty() {
        apply_teeth_whitening(img, &teeth_regions, s * 0.35, s * 0.30)?;
    }

    // Face slim
    apply_face_reshape(img, face_regions, s * 0.25, s * 0.10)?;

    // Skin tone unify
    apply_skin_tone_unify(img, face_regions, 0.0, 0.0, s * 0.25)?;

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
        portrait_json.get(key).and_then(|v| v.as_f64()).unwrap_or(0.0) as f32
    };
    let get_str = |key: &str| -> String {
        portrait_json.get(key).and_then(|v| v.as_str()).unwrap_or("").to_string()
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

    // Parse blemish spots
    let spots: Vec<(u32, u32, u32)> = portrait_json
        .get("blemishSpots")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|spot| {
                    let x = spot.get("x")?.as_f64()? as f32;
                    let y = spot.get("y")?.as_f64()? as f32;
                    let r = spot.get("radius")?.as_f64()? as f32;
                    let (iw, ih) = img.dimensions();
                    Some(((x * iw as f32) as u32, (y * ih as f32) as u32, (r * iw as f32).max(3.0) as u32))
                })
                .collect()
        })
        .unwrap_or_default();

    // 1. Blemish removal (does not need face_regions)
    if !spots.is_empty() {
        apply_blemish_removal(img, &spots, 0.5)?;
    }

    // 2. Skin smoothing
    if skin_strength > 0.5 {
        apply_skin_smoothing(img, skin_strength / 100.0, skin_detail / 100.0)?;
    }

    // 3. Face reshape
    if face_slim > 0.5 || jaw.abs() > 0.5 || forehead.abs() > 0.5 {
        if !face_regions.is_empty() {
            // forehead adjustment: shift face_rect top upward/downward
            let mut adjusted_faces: Vec<FaceRegion> = face_regions.to_vec();
            if forehead.abs() > 0.5 {
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
    if (eye_enlarge > 0.5 || eye_brighten > 0.5) && !face_regions.is_empty() {
        let eye_regions: Vec<_> = face_regions.iter().flat_map(|f| vec![f.left_eye, f.right_eye]).collect();
        if eye_enlarge > 0.5 {
            apply_eye_enlarge(img, &eye_regions, eye_enlarge / 100.0)?;
        }
        if eye_brighten > 0.5 {
            apply_eye_brighten(img, &eye_regions, eye_brighten / 100.0)?;
        }
    }

    // 5. Teeth whiten
    if (teeth_bright > 0.5 || teeth_desat > 0.5) && !face_regions.is_empty() {
        let teeth_regions: Vec<_> = face_regions.iter().map(|f| f.mouth).collect();
        apply_teeth_whitening(img, &teeth_regions, teeth_bright / 100.0, teeth_desat / 100.0)?;
    }

    // 6. Makeup
    if !lipstick_color.is_empty() && lipstick_opacity > 0.5 && !face_regions.is_empty() {
        let lip_regions: Vec<_> = face_regions.iter().map(|f| f.mouth).collect();
        let col = hex_to_rgb(&lipstick_color).unwrap_or((200, 50, 50));
        apply_makeup(img, "lip", &lip_regions, col, lipstick_opacity / 100.0)?;
    }
    if !blush_color.is_empty() && blush_opacity > 0.5 && !face_regions.is_empty() {
        // Blush: on cheeks, lateral to nose
        let mut blush_regions = Vec::new();
        for face in face_regions {
            let cheek_r = face.face_rect.2 / 5;
            blush_regions.push((face.left_eye.0.saturating_sub(cheek_r), face.left_eye.1 + cheek_r, cheek_r));
            blush_regions.push((face.right_eye.0 + cheek_r, face.right_eye.1 + cheek_r, cheek_r));
        }
        let col = hex_to_rgb(&blush_color).unwrap_or((220, 100, 100));
        apply_makeup(img, "blush", &blush_regions, col, blush_opacity / 100.0)?;
    }
    if !eyebrow_color.is_empty() && eyebrow_opacity > 0.5 && !face_regions.is_empty() {
        let brow_regions: Vec<_> = face_regions.iter().map(|f| {
            let brow_y = f.face_rect.1 + f.face_rect.3 / 5;
            let brow_r = f.face_rect.2 / 6;
            ((f.face_rect.0 + f.face_rect.2 / 2) as u32, brow_y, brow_r)
        }).collect();
        let col = hex_to_rgb(&eyebrow_color).unwrap_or((80, 50, 30));
        apply_makeup(img, "eyebrow", &brow_regions, col, eyebrow_opacity / 100.0)?;
    }

    // 7. Hair adjust
    if (hair_hue.abs() > 0.5 || hair_bright.abs() > 0.5) && !face_regions.is_empty() {
        apply_hair_adjust(img, &face_regions, hair_hue, hair_bright / 50.0)?;
    }

    // 8. Body reshape
    if (body_slim > 0.5 || body_height > 0.5 || leg_len > 0.5) && !face_regions.is_empty() {
        apply_body_reshape(img, &face_regions, body_slim / 100.0, body_height / 100.0, leg_len / 100.0)?;
    }

    // 9. Skin tone unify (subtle, applied last)
    if !face_regions.is_empty() {
        apply_skin_tone_unify(img, &face_regions, 0.0, 0.0, 0.05)?;
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
    use image::{RgbaImage, Rgba};

    #[test]
    fn test_rgb_to_f32_roundtrip() {
        assert_eq!(rgb_to_f32(0, 0, 0), (0.0, 0.0, 0.0));
        assert_eq!(rgb_to_f32(255, 255, 255), (1.0, 1.0, 1.0));
        assert_eq!(rgb_to_f32(128, 128, 128), (128.0 / 255.0, 128.0 / 255.0, 128.0 / 255.0));
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
                        assert!(dh < 1.0, "HSL roundtrip failed for h={}, s={}, l={}", h, s, l);
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
        let mut img = DynamicImage::ImageRgba8(RgbaImage::from_pixel(1, 1, Rgba([128, 128, 128, 255])));
        assert!(apply_skin_smoothing(&mut img, 0.5, 0.5).is_ok());
    }

    #[test]
    fn test_apply_skin_smoothing_rejects_zero_dim() {
        let mut img = DynamicImage::ImageRgba8(RgbaImage::new(0, 10));
        assert!(apply_skin_smoothing(&mut img, 0.5, 0.5).is_err());
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
        let mut img = DynamicImage::ImageRgba8(RgbaImage::from_pixel(10, 10, Rgba([255, 0, 0, 255])));
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
        let mut img = DynamicImage::ImageRgba8(RgbaImage::from_pixel(10, 10, Rgba([255, 0, 0, 255])));
        assert!(apply_body_reshape(&mut img, &[], 0.5, 0.5, 0.5).is_ok());
    }

    #[test]
    fn test_apply_skin_tone_unify_zero_dim() {
        let mut img = DynamicImage::ImageRgba8(RgbaImage::new(0, 10));
        assert!(apply_skin_tone_unify(&mut img, &[], 0.0, 0.0, 0.5).is_err());
    }

    #[test]
    fn test_apply_one_click_beauty_no_faces() {
        let mut img = DynamicImage::ImageRgba8(RgbaImage::from_pixel(10, 10, Rgba([128, 128, 128, 255])));
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
