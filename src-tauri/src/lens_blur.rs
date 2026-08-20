use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use image::{DynamicImage, GenericImageView, RgbaImage};
use rayon::prelude::*;
use std::borrow::Cow;

/// A single sample point for the bokeh disc.
#[derive(Clone, Copy)]
struct BokehTap {
    x: i32,
    y: i32,
    weight: f32,
}

/// Apply AI lens blur (bokeh) based on a depth map.
///
/// The depth map is a base64-encoded PNG image where brightness indicates depth.
/// Pixels with depth in the focused range remain sharp; pixels outside are blurred
/// using a multi-tap scatter (bokeh disc) approach.
pub fn apply_lens_blur<'a>(
    image: Cow<'a, DynamicImage>,
    adjustments: &serde_json::Value,
) -> Cow<'a, DynamicImage> {
    let effects_visible = adjustments
        .get("sectionVisibility")
        .and_then(|v| v.get("effects"))
        .and_then(|s| s.as_bool())
        .unwrap_or(true);
    if !adjustments["lensBlurEnabled"].as_bool().unwrap_or(false) || !effects_visible {
        return image;
    }

    let depth_b64 = adjustments["lensBlurDepthMap"].as_str().unwrap_or("");
    if depth_b64.is_empty() {
        return image;
    }

    let amount = adjustments["lensBlurAmount"].as_f64().unwrap_or(50.0) as f32;
    if amount <= 0.0 {
        return image;
    }

    let b64_data = match depth_b64.find(',') {
        Some(idx) => &depth_b64[idx + 1..],
        None => depth_b64,
    };
    let decoded = match BASE64.decode(b64_data) {
        Ok(b) => b,
        Err(_) => return image,
    };
    let depth_map = match image::load_from_memory(&decoded) {
        Ok(img) => img.into_luma8(),
        Err(_) => return image,
    };
    if depth_map.width() < 2 || depth_map.height() < 2 {
        return image;
    }

    let (w, h) = image.dimensions();
    if w < 8 || h < 8 {
        return image;
    }

    let max_radius = (amount / 100.0) * (w.max(h) as f32) * 0.012;
    if max_radius < 0.35 {
        return image;
    }

    let shape = adjustments["lensBlurShape"].as_str().unwrap_or("circle");
    let min_depth = adjustments["lensBlurMinDepth"].as_f64().unwrap_or(20.0) as f32 / 100.0;
    let max_depth = adjustments["lensBlurMaxDepth"].as_f64().unwrap_or(100.0) as f32 / 100.0;
    let min_fade = adjustments["lensBlurMinFade"].as_f64().unwrap_or(15.0) as f32 / 100.0;
    let max_fade = adjustments["lensBlurMaxFade"].as_f64().unwrap_or(15.0) as f32 / 100.0;

    // Resize depth map to match image dimensions
    let depth_resized = if depth_map.width() == w && depth_map.height() == h {
        depth_map
    } else {
        image::imageops::resize(&depth_map, w, h, image::imageops::FilterType::Triangle)
    };

    // Build the bokeh tap pattern
    let taps = generate_bokeh_taps(max_radius, shape);

    // Convert image to RGB32F for processing
    let src_rgb = image.to_rgb32f();
    let mut result = src_rgb.clone();

    // Process each pixel in parallel
    result.par_chunks_mut(3).enumerate().for_each(|(idx, dst)| {
        let px = (idx % w as usize) as u32;
        let py = (idx / w as usize) as u32;

        let depth_val = depth_resized.get_pixel(px, py).0[0] as f32 / 255.0;

        // Compute blur weight based on depth
        let blur_weight = compute_blur_weight(depth_val, min_depth, max_depth, min_fade, max_fade);
        if blur_weight < 0.001 {
            // In focus — keep original
            return;
        }

        // Accumulate weighted samples from the bokeh disc
        let mut r_acc = 0.0f32;
        let mut g_acc = 0.0f32;
        let mut b_acc = 0.0f32;
        let mut weight_sum = 0.0f32;

        for tap in &taps {
            let sx = px as i32 + tap.x;
            let sy = py as i32 + tap.y;

            if sx < 0 || sy < 0 || sx >= w as i32 || sy >= h as i32 {
                continue;
            }

            let s_idx = (sy as usize) * (w as usize) + (sx as usize);
            let src_raw = src_rgb.as_raw();
            let src_pix = &src_raw[s_idx * 3..s_idx * 3 + 3];

            r_acc += src_pix[0] * tap.weight;
            g_acc += src_pix[1] * tap.weight;
            b_acc += src_pix[2] * tap.weight;
            weight_sum += tap.weight;
        }

        if weight_sum > 0.0 {
            let inv_w = 1.0 / weight_sum;
            let blurred_r = r_acc * inv_w;
            let blurred_g = g_acc * inv_w;
            let blurred_b = b_acc * inv_w;

            // Blend between original and blurred based on blur_weight
            dst[0] = dst[0] * (1.0 - blur_weight) + blurred_r * blur_weight;
            dst[1] = dst[1] * (1.0 - blur_weight) + blurred_g * blur_weight;
            dst[2] = dst[2] * (1.0 - blur_weight) + blurred_b * blur_weight;
        }
    });

    // Convert the processed RGB32F buffer back to Rgba8 to preserve
    // compatibility with the downstream preview/export pipeline (which
    // expects Rgba8 and feeds the JPEG encoder directly).
    //
    // Note: `to_rgb32f()` above does NOT linearize — it only scales u8→[0,1].
    // The values therefore remain in sRGB-encoded space, so we convert back
    // with a plain scale (no OETF) to avoid double-encoding and darkening.
    let (rw, rh) = result.dimensions();
    let rgba8: RgbaImage = image::ImageBuffer::from_fn(rw, rh, |x, y| {
        let p = result.get_pixel(x, y);
        let to_u8 = |v: f32| (v.clamp(0.0, 1.0) * 255.0).round() as u8;
        image::Rgba([to_u8(p[0]), to_u8(p[1]), to_u8(p[2]), 255])
    });

    Cow::Owned(DynamicImage::ImageRgba8(rgba8))
}

/// Generate bokeh disc sample points for the given radius and aperture shape.
fn generate_bokeh_taps(radius: f32, shape: &str) -> Vec<BokehTap> {
    let r = radius.ceil() as i32;
    if r < 1 {
        return vec![BokehTap {
            x: 0,
            y: 0,
            weight: 1.0,
        }];
    }

    let r_f = radius;
    let r_sq = r_f * r_f;

    let mut taps: Vec<BokehTap> = Vec::new();

    match shape {
        "hexagon" | "hex" => {
            // Hexagonal bokeh — sample within a hexagon
            for dy in -r..=r {
                for dx in -r..=r {
                    let dist_sq = (dx * dx + dy * dy) as f32;
                    if dist_sq > r_sq {
                        continue;
                    }
                    // Hexagonal mask: check if point is within the hexagon
                    let abs_x = dx.abs() as f32;
                    let abs_y = dy.abs() as f32;
                    let hex_limit = r_f - abs_y * 0.57735; // tan(30°) ≈ 0.57735
                    if abs_x > hex_limit {
                        continue;
                    }
                    let weight = 1.0 - (dist_sq / r_sq).sqrt();
                    taps.push(BokehTap {
                        x: dx,
                        y: dy,
                        weight: weight.max(0.05),
                    });
                }
            }
        }
        "octagon" | "oct" => {
            // Octagonal bokeh
            let r_half = r_f * std::f32::consts::FRAC_1_SQRT_2; // cos(45°)
            for dy in -r..=r {
                for dx in -r..=r {
                    let dist_sq = (dx * dx + dy * dy) as f32;
                    if dist_sq > r_sq {
                        continue;
                    }
                    let abs_x = dx.abs() as f32;
                    let abs_y = dy.abs() as f32;
                    // Octagon: cut corners at 45°
                    if abs_x + abs_y > r_f + r_half {
                        continue;
                    }
                    let weight = 1.0 - (dist_sq / r_sq).sqrt();
                    taps.push(BokehTap {
                        x: dx,
                        y: dy,
                        weight: weight.max(0.05),
                    });
                }
            }
        }
        _ => {
            // Default: circular bokeh
            for dy in -r..=r {
                for dx in -r..=r {
                    let dist_sq = (dx * dx + dy * dy) as f32;
                    if dist_sq > r_sq {
                        continue;
                    }
                    let weight = 1.0 - (dist_sq / r_sq).sqrt();
                    taps.push(BokehTap {
                        x: dx,
                        y: dy,
                        weight: weight.max(0.05),
                    });
                }
            }
        }
    }

    // Normalize weights
    let total: f32 = taps.iter().map(|t| t.weight).sum();
    if total > 0.0 {
        let inv = 1.0 / total;
        let scale = inv * taps.len() as f32;
        for tap in &mut taps {
            tap.weight *= scale;
        }
    }

    taps
}

/// Compute the blur weight for a pixel based on its depth.
///
/// Returns 0.0 for in-focus pixels and 1.0 for fully blurred pixels.
#[inline]
fn compute_blur_weight(
    depth: f32,
    min_depth: f32,
    max_depth: f32,
    min_fade: f32,
    max_fade: f32,
) -> f32 {
    if depth < min_depth {
        // Near (in front of focus range) — blur with min_fade transition
        let t = (min_depth - depth) / min_fade.max(0.001);
        t.clamp(0.0, 1.0)
    } else if depth > max_depth {
        // Far (behind focus range) — blur with max_fade transition
        let t = (depth - max_depth) / max_fade.max(0.001);
        t.clamp(0.0, 1.0)
    } else {
        // Within focus range — no blur
        0.0
    }
}
