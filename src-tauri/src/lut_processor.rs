//! Complete .cube LUT file parser and 3D trilinear interpolation engine.
//!
//! Supports parsing Adobe .cube LUT files and applying them to 8-bit and 16-bit
//! RGBA image data with accurate trilinear interpolation.

use anyhow::{Context, Result};

// ---------------------------------------------------------------------------
// Lut3D
// ---------------------------------------------------------------------------

/// A parsed 3D LUT from a .cube file.
#[derive(Debug, Clone)]
pub struct Lut3D {
    /// Optional title from the LUT file.
    pub title: Option<String>,
    /// Size N of the 3D LUT (the table contains N³ entries).
    pub size: usize,
    /// Domain minimum for R, G, B channels.
    pub domain_min: [f32; 3],
    /// Domain maximum for R, G, B channels.
    pub domain_max: [f32; 3],
    /// The LUT table with N³ entries, each [R, G, B].
    /// Indexing convention follows the .cube specification:
    ///   index = r_index * N * N + g_index * N + b_index
    /// where the first dimension varies fastest (R), then G, then B.
    pub table: Vec<[f32; 3]>,
}

// ---------------------------------------------------------------------------
// .cube file parser
// ---------------------------------------------------------------------------

/// Parse the contents of a .cube LUT file.
///
/// Handles comments (#), blank lines, case-insensitive keywords, TITLE,
/// LUT_3D_SIZE, DOMAIN_MIN, DOMAIN_MAX, and the N³ lines of RGB float data.
pub fn parse_cube_file(content: &str) -> Result<Lut3D> {
    let mut title: Option<String> = None;
    let mut size: Option<usize> = None;
    let mut domain_min = [0.0f32, 0.0, 0.0];
    let mut domain_max = [1.0f32, 1.0, 1.0];
    let mut table: Vec<[f32; 3]> = Vec::new();

    for (line_num, raw_line) in content.lines().enumerate() {
        let line_num = line_num + 1; // 1-based
        let trimmed = raw_line.trim();

        // Skip empty lines and comments
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        // Strip inline comments
        let line = if let Some(pos) = trimmed.find('#') {
            trimmed[..pos].trim()
        } else {
            trimmed
        };

        if line.is_empty() {
            continue;
        }

        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.is_empty() {
            continue;
        }

        let keyword = parts[0].to_uppercase();

        match keyword.as_str() {
            "TITLE" => {
                // TITLE "name" — extract quoted string
                let rest = line[parts[0].len()..].trim();
                if rest.starts_with('"') && rest.ends_with('"') && rest.len() >= 2 {
                    title = Some(rest[1..rest.len() - 1].to_string());
                } else {
                    title = Some(rest.to_string());
                }
            }
            "LUT_3D_SIZE" => {
                if parts.len() < 2 {
                    anyhow::bail!(
                        "Line {}: LUT_3D_SIZE requires a size value",
                        line_num
                    );
                }
                size = Some(parts[1].parse::<usize>().with_context(|| {
                    format!("Line {}: failed to parse LUT_3D_SIZE value", line_num)
                })?);

                if size == Some(0) {
                    anyhow::bail!("Line {}: LUT_3D_SIZE must be >= 1", line_num);
                }
            }
            "DOMAIN_MIN" => {
                if parts.len() < 4 {
                    anyhow::bail!(
                        "Line {}: DOMAIN_MIN requires 3 float values (R G B)",
                        line_num
                    );
                }
                domain_min = [
                    parts[1].parse::<f32>().with_context(|| {
                        format!("Line {}: failed to parse DOMAIN_MIN R value", line_num)
                    })?,
                    parts[2].parse::<f32>().with_context(|| {
                        format!("Line {}: failed to parse DOMAIN_MIN G value", line_num)
                    })?,
                    parts[3].parse::<f32>().with_context(|| {
                        format!("Line {}: failed to parse DOMAIN_MIN B value", line_num)
                    })?,
                ];
            }
            "DOMAIN_MAX" => {
                if parts.len() < 4 {
                    anyhow::bail!(
                        "Line {}: DOMAIN_MAX requires 3 float values (R G B)",
                        line_num
                    );
                }
                domain_max = [
                    parts[1].parse::<f32>().with_context(|| {
                        format!("Line {}: failed to parse DOMAIN_MAX R value", line_num)
                    })?,
                    parts[2].parse::<f32>().with_context(|| {
                        format!("Line {}: failed to parse DOMAIN_MAX G value", line_num)
                    })?,
                    parts[3].parse::<f32>().with_context(|| {
                        format!("Line {}: failed to parse DOMAIN_MAX B value", line_num)
                    })?,
                ];
            }
            _ => {
                // Try to parse as RGB data line
                if parts.len() < 3 {
                    // Skip unknown keywords that aren't data
                    continue;
                }

                let r = parts[0].parse::<f32>().with_context(|| {
                    format!("Line {}: failed to parse R value '{}'", line_num, parts[0])
                })?;
                let g = parts[1].parse::<f32>().with_context(|| {
                    format!("Line {}: failed to parse G value '{}'", line_num, parts[1])
                })?;
                let b = parts[2].parse::<f32>().with_context(|| {
                    format!("Line {}: failed to parse B value '{}'", line_num, parts[2])
                })?;

                table.push([r, g, b]);
            }
        }
    }

    let lut_size = size.context("LUT_3D_SIZE keyword not found in .cube file")?;
    let expected = lut_size * lut_size * lut_size;

    if table.len() != expected {
        anyhow::bail!(
            "LUT data size mismatch: expected {} entries (size={}), found {}",
            expected,
            lut_size,
            table.len()
        );
    }

    Ok(Lut3D {
        title,
        size: lut_size,
        domain_min,
        domain_max,
        table,
    })
}

// ---------------------------------------------------------------------------
// Trilinear interpolation
// ---------------------------------------------------------------------------

/// Apply a 3D LUT to a single RGB float value using trilinear interpolation.
///
/// The input (r, g, b) is first mapped from the LUT domain into index space,
/// then the 8 surrounding lattice points are found and trilinear interpolation
/// is performed. Results are clamped to [0.0, 1.0].
pub fn apply_lut(lut: &Lut3D, r: f32, g: f32, b: f32) -> [f32; 3] {
    let n = lut.size;
    if n == 0 {
        return [r, g, b];
    }

    let n_f = (n - 1) as f32;

    // Map input to index space using domain
    let ri = map_to_index(r, lut.domain_min[0], lut.domain_max[0], n_f);
    let gi = map_to_index(g, lut.domain_min[1], lut.domain_max[1], n_f);
    let bi = map_to_index(b, lut.domain_min[2], lut.domain_max[2], n_f);

    // Floor / fractional parts
    let r0 = ri.floor().clamp(0.0, n_f);
    let g0 = gi.floor().clamp(0.0, n_f);
    let b0 = bi.floor().clamp(0.0, n_f);

    let r1 = (r0 + 1.0).clamp(0.0, n_f);
    let g1 = (g0 + 1.0).clamp(0.0, n_f);
    let b1 = (b0 + 1.0).clamp(0.0, n_f);

    let fr = (ri - r0).clamp(0.0, 1.0);
    let fg = (gi - g0).clamp(0.0, 1.0);
    let fb = (bi - b0).clamp(0.0, 1.0);

    // Fetch the 8 surrounding lattice points
    let c000 = lut_sample(lut, r0, g0, b0);
    let c100 = lut_sample(lut, r1, g0, b0);
    let c010 = lut_sample(lut, r0, g1, b0);
    let c110 = lut_sample(lut, r1, g1, b0);
    let c001 = lut_sample(lut, r0, g0, b1);
    let c101 = lut_sample(lut, r1, g0, b1);
    let c011 = lut_sample(lut, r0, g1, b1);
    let c111 = lut_sample(lut, r1, g1, b1);

    // Trilinear interpolation
    let mut result = [0.0f32; 3];
    for c in 0..3 {
        let c00 = c000[c] * (1.0 - fr) + c100[c] * fr;
        let c01 = c001[c] * (1.0 - fr) + c101[c] * fr;
        let c10 = c010[c] * (1.0 - fr) + c110[c] * fr;
        let c11 = c011[c] * (1.0 - fr) + c111[c] * fr;

        let c0 = c00 * (1.0 - fg) + c10 * fg;
        let c1 = c01 * (1.0 - fg) + c11 * fg;

        result[c] = (c0 * (1.0 - fb) + c1 * fb).clamp(0.0, 1.0);
    }

    result
}

/// Map a value from domain space to LUT index space.
#[inline]
fn map_to_index(v: f32, domain_min: f32, domain_max: f32, max_index: f32) -> f32 {
    let domain_range = domain_max - domain_min;
    if domain_range.abs() < f32::EPSILON {
        0.0
    } else {
        ((v - domain_min) / domain_range * max_index).clamp(0.0, max_index)
    }
}

/// Sample the LUT table at integer (or near-integer) index coordinates.
///
/// .cube files use the convention: index = R * N * N + G * N + B,
/// where R varies fastest.
#[inline]
fn lut_sample(lut: &Lut3D, r: f32, g: f32, b: f32) -> [f32; 3] {
    let n = lut.size;
    let ri = (r.round() as usize).min(n - 1);
    let gi = (g.round() as usize).min(n - 1);
    let bi = (b.round() as usize).min(n - 1);
    lut.table[ri * n * n + gi * n + bi]
}

// ---------------------------------------------------------------------------
// Image-level LUT application
// ---------------------------------------------------------------------------

/// Apply a 3D LUT to 8-bit RGBA image data.
///
/// Each pixel is converted from 0-255 to 0.0-1.0 float, the LUT is applied
/// via trilinear interpolation, and the result is converted back to u8.
/// The alpha channel is passed through unchanged.
pub fn apply_lut_to_image(
    lut: &Lut3D,
    image_data: &[u8],
    width: u32,
    height: u32,
) -> Vec<u8> {
    let pixel_count = (width * height) as usize;
    let mut output = vec![0u8; pixel_count * 4];

    for i in 0..pixel_count {
        let base = i * 4;
        let r = image_data[base] as f32 / 255.0;
        let g = image_data[base + 1] as f32 / 255.0;
        let b = image_data[base + 2] as f32 / 255.0;
        let a = image_data[base + 3];

        let [or, og, ob] = apply_lut(lut, r, g, b);

        output[base] = (or * 255.0).round().clamp(0.0, 255.0) as u8;
        output[base + 1] = (og * 255.0).round().clamp(0.0, 255.0) as u8;
        output[base + 2] = (ob * 255.0).round().clamp(0.0, 255.0) as u8;
        output[base + 3] = a;
    }

    output
}

/// Apply a 3D LUT to 16-bit RGBA image data.
///
/// Each pixel is converted from 0-65535 to 0.0-1.0 float, the LUT is applied
/// via trilinear interpolation, and the result is converted back to u16.
/// The alpha channel is passed through unchanged.
pub fn apply_lut_to_image_16bit(
    lut: &Lut3D,
    image_data: &[u16],
    width: u32,
    height: u32,
) -> Vec<u16> {
    let pixel_count = (width * height) as usize;
    let mut output = vec![0u16; pixel_count * 4];

    for i in 0..pixel_count {
        let base = i * 4;
        let r = image_data[base] as f32 / 65535.0;
        let g = image_data[base + 1] as f32 / 65535.0;
        let b = image_data[base + 2] as f32 / 65535.0;
        let a = image_data[base + 3];

        let [or, og, ob] = apply_lut(lut, r, g, b);

        output[base] = (or * 65535.0).round().clamp(0.0, 65535.0) as u16;
        output[base + 1] = (og * 65535.0).round().clamp(0.0, 65535.0) as u16;
        output[base + 2] = (ob * 65535.0).round().clamp(0.0, 65535.0) as u16;
        output[base + 3] = a;
    }

    output
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn lut_parse_cube_file(content: String) -> Result<serde_json::Value, String> {
    let lut = parse_cube_file(&content).map_err(|e| e.to_string())?;
    serde_json::to_value(serde_json::json!({
        "title": lut.title,
        "size": lut.size,
        "domain_min": lut.domain_min,
        "domain_max": lut.domain_max,
        "entry_count": lut.table.len(),
    }))
    .map_err(|e| format!("Failed to serialize LUT info: {}", e))
}

#[tauri::command]
pub fn lut_apply_to_image(
    image_data_base64: String,
    width: u32,
    height: u32,
    lut_content: String,
) -> Result<String, String> {
    use base64::{Engine as _, engine::general_purpose};

    // Parse LUT
    let lut = parse_cube_file(&lut_content).map_err(|e| format!("Failed to parse LUT: {}", e))?;

    // Decode base64 image data
    let image_data = general_purpose::STANDARD
        .decode(&image_data_base64)
        .map_err(|e| format!("Failed to decode base64 image data: {}", e))?;

    // Apply LUT to image (8-bit RGBA)
    let output_data = apply_lut_to_image(&lut, &image_data, width, height);

    // Encode result as PNG
    let img = image::RgbaImage::from_raw(width, height, output_data)
        .ok_or_else(|| "Failed to create image from LUT output".to_string())?;
    let dynamic = image::DynamicImage::ImageRgba8(img);
    let mut png_buf = std::io::Cursor::new(Vec::new());
    dynamic
        .write_to(&mut png_buf, image::ImageFormat::Png)
        .map_err(|e| format!("Failed to encode PNG: {}", e))?;

    Ok(general_purpose::STANDARD.encode(png_buf.into_inner()))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn identity_lut(size: usize) -> Lut3D {
        let mut table = Vec::with_capacity(size * size * size);
        let n = size as f32;
        let denom = (size - 1) as f32;
        for bi in 0..size {
            for gi in 0..size {
                for ri in 0..size {
                    let r = ri as f32 / denom;
                    let g = gi as f32 / denom;
                    let b = bi as f32 / denom;
                    table.push([r, g, b]);
                }
            }
        }
        Lut3D {
            title: Some("Identity".to_string()),
            size,
            domain_min: [0.0, 0.0, 0.0],
            domain_max: [1.0, 1.0, 1.0],
            table,
        }
    }

    #[test]
    fn test_parse_simple_cube() {
        let cube_content = r#"
# This is a comment
TITLE "Test LUT"
LUT_3D_SIZE 2
DOMAIN_MIN 0.0 0.0 0.0
DOMAIN_MAX 1.0 1.0 1.0

0.0 0.0 0.0
1.0 0.0 0.0
0.0 1.0 0.0
1.0 1.0 0.0
0.0 0.0 1.0
1.0 0.0 1.0
0.0 1.0 1.0
1.0 1.0 1.0
"#;
        let lut = parse_cube_file(cube_content).unwrap();
        assert_eq!(lut.title, Some("Test LUT".to_string()));
        assert_eq!(lut.size, 2);
        assert_eq!(lut.table.len(), 8);
        assert_eq!(lut.domain_min, [0.0, 0.0, 0.0]);
        assert_eq!(lut.domain_max, [1.0, 1.0, 1.0]);

        // First entry should be black
        assert_eq!(lut.table[0], [0.0, 0.0, 0.0]);
        // Last entry should be white
        assert_eq!(lut.table[7], [1.0, 1.0, 1.0]);
    }

    #[test]
    fn test_parse_case_insensitive() {
        let cube_content = r#"
lut_3d_size 2
title "Lowercase"
domain_min 0.0 0.0 0.0
domain_max 1.0 1.0 1.0
0 0 0
1 0 0
0 1 0
1 1 0
0 0 1
1 0 1
0 1 1
1 1 1
"#;
        let lut = parse_cube_file(cube_content).unwrap();
        assert_eq!(lut.size, 2);
        assert_eq!(lut.title, Some("Lowercase".to_string()));
    }

    #[test]
    fn test_parse_missing_size_errors() {
        let cube_content = "0 0 0\n1 0 0\n";
        let result = parse_cube_file(cube_content);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("LUT_3D_SIZE"));
    }

    #[test]
    fn test_parse_wrong_entry_count_errors() {
        let cube_content = "LUT_3D_SIZE 3\n0 0 0\n1 0 0\n";
        let result = parse_cube_file(cube_content);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("mismatch"));
    }

    #[test]
    fn test_identity_lut_pass_through() {
        let lut = identity_lut(33);
        // Mid-grey should pass through
        let result = apply_lut(&lut, 0.5, 0.5, 0.5);
        assert!((result[0] - 0.5).abs() < 0.02, "R mismatch: {}", result[0]);
        assert!((result[1] - 0.5).abs() < 0.02, "G mismatch: {}", result[1]);
        assert!((result[2] - 0.5).abs() < 0.02, "B mismatch: {}", result[2]);
    }

    #[test]
    fn test_identity_lut_black_white() {
        let lut = identity_lut(33);
        let black = apply_lut(&lut, 0.0, 0.0, 0.0);
        assert!((black[0]).abs() < 0.01, "Black R: {}", black[0]);
        assert!((black[1]).abs() < 0.01);
        assert!((black[2]).abs() < 0.01);

        let white = apply_lut(&lut, 1.0, 1.0, 1.0);
        assert!((white[0] - 1.0).abs() < 0.01, "White R: {}", white[0]);
    }

    #[test]
    fn test_apply_lut_clamps_output() {
        let lut = identity_lut(2);
        // Out-of-range input should be clamped
        let result = apply_lut(&lut, 2.0, -1.0, 0.5);
        assert!(result[0] >= 0.0 && result[0] <= 1.0);
        assert!(result[1] >= 0.0 && result[1] <= 1.0);
        assert!(result[2] >= 0.0 && result[2] <= 1.0);
    }

    #[test]
    fn test_invert_lut() {
        // Build a LUT that inverts the color channels
        let size = 33;
        let mut table = Vec::with_capacity(size * size * size);
        let denom = (size - 1) as f32;
        for bi in 0..size {
            for gi in 0..size {
                for ri in 0..size {
                    let r = 1.0 - ri as f32 / denom;
                    let g = 1.0 - gi as f32 / denom;
                    let b = 1.0 - bi as f32 / denom;
                    table.push([r, g, b]);
                }
            }
        }
        let lut = Lut3D {
            title: None,
            size,
            domain_min: [0.0, 0.0, 0.0],
            domain_max: [1.0, 1.0, 1.0],
            table,
        };

        let result = apply_lut(&lut, 0.0, 0.5, 1.0);
        assert!((result[0] - 1.0).abs() < 0.02, "Invert R: {}", result[0]);
        assert!((result[1] - 0.5).abs() < 0.02, "Invert G: {}", result[1]);
        assert!((result[2] - 0.0).abs() < 0.02, "Invert B: {}", result[2]);
    }

    #[test]
    fn test_apply_lut_to_image_8bit() {
        let lut = identity_lut(33);
        // 2×2 image: all channels 128, alpha 255
        let input: Vec<u8> = vec![
            128, 128, 128, 255, //
            128, 128, 128, 255, //
            128, 128, 128, 255, //
            128, 128, 128, 255,
        ];
        let output = apply_lut_to_image(&lut, &input, 2, 2);
        // Identity LUT should return approximately the same values
        assert_eq!(output.len(), 16);
        for i in 0..4 {
            let base = i * 4;
            assert!(
                (output[base] as i32 - 128).abs() <= 2,
                "R pixel {}: got {}",
                i,
                output[base]
            );
            assert!(
                (output[base + 1] as i32 - 128).abs() <= 2,
                "G pixel {}: got {}",
                i,
                output[base + 1]
            );
            assert!(
                (output[base + 2] as i32 - 128).abs() <= 2,
                "B pixel {}: got {}",
                i,
                output[base + 2]
            );
            assert_eq!(output[base + 3], 255, "Alpha passthrough");
        }
    }

    #[test]
    fn test_apply_lut_to_image_16bit() {
        let lut = identity_lut(33);
        let input: Vec<u16> = vec![
            32768, 32768, 32768, 65535, //
            32768, 32768, 32768, 65535, //
            32768, 32768, 32768, 65535, //
            32768, 32768, 32768, 65535,
        ];
        let output = apply_lut_to_image_16bit(&lut, &input, 2, 2);
        assert_eq!(output.len(), 16);
        for i in 0..4 {
            let base = i * 4;
            assert!(
                (output[base] as i32 - 32768).abs() <= 300,
                "R pixel {}: got {}",
                i,
                output[base]
            );
            assert_eq!(output[base + 3], 65535, "Alpha passthrough 16-bit");
        }
    }

    #[test]
    fn test_custom_domain() {
        let cube_content = r#"
LUT_3D_SIZE 2
DOMAIN_MIN 0.1 0.1 0.1
DOMAIN_MAX 0.9 0.9 0.9
0.1 0.1 0.1
0.9 0.1 0.1
0.1 0.9 0.1
0.9 0.9 0.1
0.1 0.1 0.9
0.9 0.1 0.9
0.1 0.9 0.9
0.9 0.9 0.9
"#;
        let lut = parse_cube_file(cube_content).unwrap();
        assert_eq!(lut.domain_min, [0.1, 0.1, 0.1]);
        assert_eq!(lut.domain_max, [0.9, 0.9, 0.9]);

        // Input at domain_min should map to first entry
        let result = apply_lut(&lut, 0.1, 0.1, 0.1);
        assert!((result[0] - 0.1).abs() < 0.01);
    }

    #[test]
    fn test_inline_comments() {
        let cube_content = r#"
LUT_3D_SIZE 2  # size two
0 0 0 # black
1 0 0 # red
0 1 0
1 1 0
0 0 1
1 0 1
0 1 1
1 1 1
"#;
        let lut = parse_cube_file(cube_content).unwrap();
        assert_eq!(lut.size, 2);
        assert_eq!(lut.table.len(), 8);
    }
}
