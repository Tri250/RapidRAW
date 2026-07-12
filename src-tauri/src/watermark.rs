//! 水印处理模块
//! 
//! 支持文字水印和图片水印，国内摄影社区常用功能

use base64::{Engine as _, engine::general_purpose};
use ab_glyph::FontArc;
use image::{DynamicImage, GenericImageView, Rgba, RgbaImage};
use imageproc::drawing;
use serde::{Deserialize, Serialize};
use std::io::Cursor;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatermarkConfig {
    /// 水印类型
    pub watermark_type: WatermarkType,
    /// 水印位置
    pub position: WatermarkPosition,
    /// 不透明度 (0.0-1.0)
    pub opacity: f32,
    /// 缩放比例 (相对于图片尺寸)
    pub scale: f32,
    /// 边距 (像素)
    pub margin: u32,
    /// 旋转角度 (度)
    pub rotation: f32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum WatermarkType {
    /// 文字水印
    Text,
    /// 图片水印
    Image,
    /// EXIF 参数水印（相机型号/光圈/快门/ISO/焦距）
    ExifInfo,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum WatermarkPosition {
    TopLeft,
    TopCenter,
    TopRight,
    CenterLeft,
    Center,
    CenterRight,
    BottomLeft,
    BottomCenter,
    BottomRight,
    /// 平铺（全图重复）
    Tiled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextWatermarkConfig {
    pub text: String,
    pub font_size: f32,
    pub color: [u8; 4], // RGBA
    pub font_path: Option<String>,
    pub shadow: bool,
    pub shadow_color: [u8; 4],
    pub shadow_offset: (i32, i32),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageWatermarkConfig {
    pub image_data: Vec<u8>,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExifWatermarkConfig {
    pub camera_model: String,
    pub aperture: String,
    pub shutter_speed: String,
    pub iso: String,
    pub focal_length: String,
    pub font_size: f32,
    pub color: [u8; 4],
    pub show_border: bool,
    pub border_color: [u8; 4],
}

impl Default for WatermarkConfig {
    fn default() -> Self {
        Self {
            watermark_type: WatermarkType::Text,
            position: WatermarkPosition::BottomRight,
            opacity: 0.8,
            scale: 0.05,
            margin: 20,
            rotation: 0.0,
        }
    }
}

/// 应用水印到图片
pub fn apply_watermark_internal(
    image: &DynamicImage,
    config: &WatermarkConfig,
    text_config: Option<&TextWatermarkConfig>,
    image_config: Option<&ImageWatermarkConfig>,
    exif_config: Option<&ExifWatermarkConfig>,
) -> Result<DynamicImage, String> {
    let (img_width, img_height) = image.dimensions();
    let mut result = image.to_rgba8();
    
    match config.watermark_type {
        WatermarkType::Text => {
            if let Some(tc) = text_config {
                apply_text_watermark(&mut result, img_width, img_height, config, tc)?;
            }
        }
        WatermarkType::Image => {
            if let Some(ic) = image_config {
                apply_image_watermark(&mut result, img_width, img_height, config, ic)?;
            }
        }
        WatermarkType::ExifInfo => {
            if let Some(ec) = exif_config {
                apply_exif_watermark(&mut result, img_width, img_height, config, ec)?;
            }
        }
    }
    
    Ok(DynamicImage::ImageRgba8(result))
}

/// 应用文字水印
fn apply_text_watermark(
    image: &mut RgbaImage,
    img_width: u32,
    img_height: u32,
    config: &WatermarkConfig,
    text_config: &TextWatermarkConfig,
) -> Result<(), String> {
    let font_size = (img_width as f32 * config.scale).max(12.0);
    let text = &text_config.text;
    
    // 计算文字宽度（粗略估算）
    let text_width = text.len() as u32 * (font_size as u32 * 2 / 3);
    let text_height = font_size as u32;
    
    let (x, y) = calculate_position(
        img_width, img_height,
        text_width, text_height,
        config.position,
        config.margin,
    );
    
    let color = Rgba(text_config.color);
    let opacity = (config.opacity * 255.0) as u8;
    
    // 使用 imageproc 绘制文字
    let scale = ab_glyph::PxScale::from(font_size);
    let font_data = include_bytes!("../assets/fonts/NotoSansSC-Regular.otf");
    let font = FontArc::try_from_slice(font_data)
        .map_err(|_| "Failed to load font".to_string())?;
    
    // 阴影
    if text_config.shadow {
        let shadow_color = Rgba([
            text_config.shadow_color[0],
            text_config.shadow_color[1],
            text_config.shadow_color[2],
            opacity,
        ]);
        drawing::draw_text_mut(
            image,
            shadow_color,
            x as i32 + text_config.shadow_offset.0,
            y as i32 + text_config.shadow_offset.1,
            scale,
            &font,
            text,
        );
    }
    
    // 主文字
    let text_color = if text_config.shadow {
        Rgba([color[0], color[1], color[2], opacity])
    } else {
        Rgba([
            text_config.color[0],
            text_config.color[1],
            text_config.color[2],
            opacity,
        ])
    };
    
    drawing::draw_text_mut(image, text_color, x as i32, y as i32, scale, &font, text);
    
    Ok(())
}

/// 应用图片水印
fn apply_image_watermark(
    image: &mut RgbaImage,
    img_width: u32,
    img_height: u32,
    config: &WatermarkConfig,
    watermark_config: &ImageWatermarkConfig,
) -> Result<(), String> {
    let wm_width = (img_width as f32 * config.scale).max(20.0) as u32;
    let wm_height = (watermark_config.height as f32 * wm_width as f32 / watermark_config.width as f32) as u32;
    
    let (x, y) = calculate_position(
        img_width, img_height,
        wm_width, wm_height,
        config.position,
        config.margin,
    );
    
    let opacity = (config.opacity * 255.0) as u8;
    
    // 如果水印是平铺模式
    if config.position == WatermarkPosition::Tiled {
        let spacing_x = wm_width + config.margin;
        let spacing_y = wm_height + config.margin;
        
        let mut ty = 0u32;
        while ty < img_height {
            let mut tx = 0u32;
            while tx < img_width {
                blend_watermark_region(
                    image, img_width, img_height,
                    &watermark_config.image_data,
                    watermark_config.width, watermark_config.height,
                    tx, ty, wm_width, wm_height,
                    opacity,
                );
                tx += spacing_x;
            }
            ty += spacing_y;
        }
    } else {
        blend_watermark_region(
            image, img_width, img_height,
            &watermark_config.image_data,
            watermark_config.width, watermark_config.height,
            x, y, wm_width, wm_height,
            opacity,
        );
    }
    
    Ok(())
}

/// 混合水印区域
fn blend_watermark_region(
    image: &mut RgbaImage,
    img_width: u32,
    img_height: u32,
    wm_data: &[u8],
    wm_width: u32,
    wm_height: u32,
    target_x: u32,
    target_y: u32,
    target_w: u32,
    target_h: u32,
    opacity: u8,
) {
    for dy in 0..target_h {
        for dx in 0..target_w {
            let ix = target_x + dx;
            let iy = target_y + dy;
            if ix >= img_width || iy >= img_height {
                continue;
            }
            
            let sx = (dx as f32 * wm_width as f32 / target_w as f32) as u32;
            let sy = (dy as f32 * wm_height as f32 / target_h as f32) as u32;
            
            if sx < wm_width && sy < wm_height {
                let wm_idx = ((sy * wm_width + sx) * 4) as usize;
                if wm_idx + 3 < wm_data.len() {
                    let wm_a = (wm_data[wm_idx + 3] as u16 * opacity as u16 / 255) as u8;
                    if wm_a > 0 {
                        let img_pixel = image.get_pixel_mut(ix, iy);
                        let alpha = wm_a as f32 / 255.0;
                        img_pixel[0] = (img_pixel[0] as f32 * (1.0 - alpha) + wm_data[wm_idx] as f32 * alpha) as u8;
                        img_pixel[1] = (img_pixel[1] as f32 * (1.0 - alpha) + wm_data[wm_idx + 1] as f32 * alpha) as u8;
                        img_pixel[2] = (img_pixel[2] as f32 * (1.0 - alpha) + wm_data[wm_idx + 2] as f32 * alpha) as u8;
                    }
                }
            }
        }
    }
}

/// 应用 EXIF 参数水印
fn apply_exif_watermark(
    image: &mut RgbaImage,
    img_width: u32,
    img_height: u32,
    config: &WatermarkConfig,
    exif_config: &ExifWatermarkConfig,
) -> Result<(), String> {
    let lines = vec![
        exif_config.camera_model.clone(),
        format!("{}  {}  ISO{}  {}mm",
            exif_config.aperture,
            exif_config.shutter_speed,
            exif_config.iso,
            exif_config.focal_length,
        ),
    ];
    
    // 计算边框
    let font_size = (img_width as f32 * 0.025).max(10.0);
    let line_height = (font_size * 1.5) as u32;
    let text_width = lines.iter()
        .map(|l| l.len() as u32 * (font_size as u32 * 2 / 3))
        .max()
        .unwrap_or(200);
    let text_height = lines.len() as u32 * line_height;
    
    let padding = (font_size * 0.5) as u32;
    let box_width = text_width + padding * 2;
    let box_height = text_height + padding * 2;
    
    let (box_x, box_y) = calculate_position(
        img_width, img_height,
        box_width, box_height,
        config.position,
        config.margin,
    );
    
    // 绘制背景框
    if exif_config.show_border {
        let border_color = Rgba(exif_config.border_color);
        // 绘制简单的矩形边框
        for dy in 0..box_height {
            for dx in 0..box_width {
                let ix = box_x + dx;
                let iy = box_y + dy;
                if ix < img_width && iy < img_height {
                    let is_border = dx < 2 || dx >= box_width - 2 || dy < 2 || dy >= box_height - 2;
                    if is_border {
                        image.put_pixel(ix, iy, Rgba([border_color[0], border_color[1], border_color[2], 255]));
                    }
                }
            }
        }
    }
    
    let scale = ab_glyph::PxScale::from(font_size);
    let font_data = include_bytes!("../assets/fonts/NotoSansSC-Regular.otf");
    let font = FontArc::try_from_slice(font_data)
        .map_err(|_| "Failed to load font".to_string())?;
    let text_color = Rgba(exif_config.color);
    
    for (i, line) in lines.iter().enumerate() {
        let ty = box_y + padding + i as u32 * line_height;
        drawing::draw_text_mut(
            image,
            text_color,
            (box_x + padding) as i32,
            ty as i32,
            scale,
            &font,
            line,
        );
    }
    
    Ok(())
}

/// 计算水印位置
fn calculate_position(
    img_width: u32,
    img_height: u32,
    wm_width: u32,
    wm_height: u32,
    position: WatermarkPosition,
    margin: u32,
) -> (u32, u32) {
    let x = match position {
        WatermarkPosition::TopLeft | WatermarkPosition::CenterLeft | WatermarkPosition::BottomLeft => margin,
        WatermarkPosition::TopCenter | WatermarkPosition::Center | WatermarkPosition::BottomCenter => {
            (img_width.saturating_sub(wm_width)) / 2
        }
        WatermarkPosition::TopRight | WatermarkPosition::CenterRight | WatermarkPosition::BottomRight => {
            img_width.saturating_sub(wm_width).saturating_sub(margin)
        }
        WatermarkPosition::Tiled => margin,
    };
    
    let y = match position {
        WatermarkPosition::TopLeft | WatermarkPosition::TopCenter | WatermarkPosition::TopRight => margin,
        WatermarkPosition::CenterLeft | WatermarkPosition::Center | WatermarkPosition::CenterRight => {
            (img_height.saturating_sub(wm_height)) / 2
        }
        WatermarkPosition::BottomLeft | WatermarkPosition::BottomCenter | WatermarkPosition::BottomRight => {
            img_height.saturating_sub(wm_height).saturating_sub(margin)
        }
        WatermarkPosition::Tiled => margin,
    };
    
    (x, y)
}

// ============================================================================
// Tauri Commands
// ============================================================================

fn decode_base64_image(base64_str: &str) -> Result<DynamicImage, String> {
    let data_url_prefix = "data:image/";
    let encoded_data = if base64_str.starts_with(data_url_prefix) {
        let comma_pos = base64_str.find(',').ok_or("Invalid data URL format")?;
        &base64_str[comma_pos + 1..]
    } else {
        base64_str
    };

    let decoded_bytes = general_purpose::STANDARD
        .decode(encoded_data)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    image::load_from_memory(&decoded_bytes).map_err(|e| format!("Failed to load image: {}", e))
}

fn encode_image_to_base64(image: &DynamicImage) -> Result<String, String> {
    let mut buf = Cursor::new(Vec::new());
    image
        .write_to(&mut buf, image::ImageFormat::Png)
        .map_err(|e| format!("Failed to encode image: {}", e))?;
    let base64_str = general_purpose::STANDARD.encode(buf.get_ref());
    Ok(format!("data:image/png;base64,{}", base64_str))
}

/// Tauri command: 应用水印到图片
#[tauri::command]
pub fn apply_watermark(
    image_base64: String,
    config_json: String,
    text_config_json: Option<String>,
    image_config_json: Option<String>,
    exif_config_json: Option<String>,
) -> Result<String, String> {
    let image = decode_base64_image(&image_base64)?;
    let config: WatermarkConfig =
        serde_json::from_str(&config_json).map_err(|e| format!("Invalid config: {}", e))?;

    let text_config: Option<TextWatermarkConfig> = text_config_json
        .map(|s| serde_json::from_str(&s))
        .transpose()
        .map_err(|e| format!("Invalid text config: {}", e))?;

    let image_config: Option<ImageWatermarkConfig> = image_config_json
        .map(|s| serde_json::from_str(&s))
        .transpose()
        .map_err(|e| format!("Invalid image config: {}", e))?;

    let exif_config: Option<ExifWatermarkConfig> = exif_config_json
        .map(|s| serde_json::from_str(&s))
        .transpose()
        .map_err(|e| format!("Invalid exif config: {}", e))?;

    let result = apply_watermark_internal(
        &image,
        &config,
        text_config.as_ref(),
        image_config.as_ref(),
        exif_config.as_ref(),
    )?;

    encode_image_to_base64(&result)
}

/// Tauri command: 预览水印效果
#[tauri::command]
pub fn preview_watermark(
    image_base64: String,
    config_json: String,
    text_config_json: Option<String>,
    image_config_json: Option<String>,
    exif_config_json: Option<String>,
    preview_max_dim: Option<u32>,
) -> Result<String, String> {
    let mut image = decode_base64_image(&image_base64)?;
    let config: WatermarkConfig =
        serde_json::from_str(&config_json).map_err(|e| format!("Invalid config: {}", e))?;

    let text_config: Option<TextWatermarkConfig> = text_config_json
        .map(|s| serde_json::from_str(&s))
        .transpose()
        .map_err(|e| format!("Invalid text config: {}", e))?;

    let image_config: Option<ImageWatermarkConfig> = image_config_json
        .map(|s| serde_json::from_str(&s))
        .transpose()
        .map_err(|e| format!("Invalid image config: {}", e))?;

    let exif_config: Option<ExifWatermarkConfig> = exif_config_json
        .map(|s| serde_json::from_str(&s))
        .transpose()
        .map_err(|e| format!("Invalid exif config: {}", e))?;

    // 缩小预览图片以提高性能
    let max_dim = preview_max_dim.unwrap_or(800);
    let (w, h) = image.dimensions();
    if w > max_dim || h > max_dim {
        image = image.resize(max_dim, max_dim, image::imageops::FilterType::Lanczos3);
    }

    let result = apply_watermark_internal(
        &image,
        &config,
        text_config.as_ref(),
        image_config.as_ref(),
        exif_config.as_ref(),
    )?;

    encode_image_to_base64(&result)
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_calculate_position_top_left() {
        let (x, y) = calculate_position(1920, 1080, 100, 50, WatermarkPosition::TopLeft, 20);
        assert_eq!(x, 20);
        assert_eq!(y, 20);
    }
    
    #[test]
    fn test_calculate_position_bottom_right() {
        let (x, y) = calculate_position(1920, 1080, 100, 50, WatermarkPosition::BottomRight, 20);
        assert_eq!(x, 1800); // 1920 - 100 - 20
        assert_eq!(y, 1010); // 1080 - 50 - 20
    }
    
    #[test]
    fn test_calculate_position_center() {
        let (x, y) = calculate_position(1920, 1080, 100, 50, WatermarkPosition::Center, 20);
        assert_eq!(x, 910); // (1920 - 100) / 2
        assert_eq!(y, 515); // (1080 - 50) / 2
    }
}