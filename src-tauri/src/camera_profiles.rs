//! 相机内色彩配置文件映射
//! 
//! 将各品牌相机 RAW 数据映射到接近相机内直出 JPEG 的色彩风格

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CameraBrand {
    Canon,
    Nikon,
    Sony,
    Fuji,
    Panasonic,
    Olympus,
    Leica,
    Hasselblad,
    Pentax,
    Generic,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CameraProfile {
    pub brand: CameraBrand,
    pub model: String,
    pub profile_name: String,
    // 基础色调曲线 (S-curve)
    pub tone_curve_shadows: f32,    // -1.0 to 1.0
    pub tone_curve_midtones: f32,   // -1.0 to 1.0
    pub tone_curve_highlights: f32, // -1.0 to 1.0
    // 色彩矩阵 (3x3 RGB→RGB)
    pub color_matrix: [f32; 9],
    // 饱和度
    pub saturation: f32,  // 0.0 to 2.0
    // 对比度
    pub contrast: f32,    // -1.0 to 1.0
    // 锐度
    pub sharpness: f32,   // 0.0 to 1.0
    // 降噪
    pub noise_reduction: f32, // 0.0 to 1.0
}

impl CameraProfile {
    // Canon Standard (标准)
    pub fn canon_standard() -> Self {
        Self {
            brand: CameraBrand::Canon,
            model: "通用".into(),
            profile_name: "Canon 标准".into(),
            tone_curve_shadows: 0.05,
            tone_curve_midtones: 0.0,
            tone_curve_highlights: -0.05,
            color_matrix: [
                1.05, -0.02, -0.03,
                -0.01, 1.04, -0.03,
                -0.01, -0.04, 1.05,
            ],
            saturation: 1.05,
            contrast: 0.05,
            sharpness: 0.3,
            noise_reduction: 0.2,
        }
    }
    
    // Canon Portrait (人像)
    pub fn canon_portrait() -> Self {
        Self {
            brand: CameraBrand::Canon,
            model: "通用".into(),
            profile_name: "Canon 人像".into(),
            tone_curve_shadows: 0.0,
            tone_curve_midtones: 0.05,
            tone_curve_highlights: -0.1,
            color_matrix: [
                1.08, -0.04, -0.04,
                -0.02, 0.98, 0.04,
                -0.02, -0.02, 1.04,
            ],
            saturation: 0.95,
            contrast: 0.0,
            sharpness: 0.2,
            noise_reduction: 0.3,
        }
    }
    
    // Canon Landscape (风光)
    pub fn canon_landscape() -> Self {
        Self {
            brand: CameraBrand::Canon,
            model: "通用".into(),
            profile_name: "Canon 风光".into(),
            tone_curve_shadows: 0.1,
            tone_curve_midtones: 0.0,
            tone_curve_highlights: -0.1,
            color_matrix: [
                1.10, -0.05, -0.05,
                -0.02, 1.10, -0.08,
                -0.02, -0.05, 1.07,
            ],
            saturation: 1.15,
            contrast: 0.1,
            sharpness: 0.4,
            noise_reduction: 0.1,
        }
    }
    
    // Nikon Standard
    pub fn nikon_standard() -> Self {
        Self {
            brand: CameraBrand::Nikon,
            model: "通用".into(),
            profile_name: "Nikon 标准".into(),
            tone_curve_shadows: 0.0,
            tone_curve_midtones: 0.0,
            tone_curve_highlights: -0.08,
            color_matrix: [
                1.03, -0.01, -0.02,
                -0.01, 1.02, -0.01,
                0.0, -0.02, 1.02,
            ],
            saturation: 1.0,
            contrast: 0.02,
            sharpness: 0.25,
            noise_reduction: 0.15,
        }
    }
    
    // Nikon Portrait
    pub fn nikon_portrait() -> Self {
        Self {
            brand: CameraBrand::Nikon,
            model: "通用".into(),
            profile_name: "Nikon 人像".into(),
            tone_curve_shadows: -0.05,
            tone_curve_midtones: 0.03,
            tone_curve_highlights: -0.12,
            color_matrix: [
                1.05, -0.03, -0.02,
                -0.01, 0.96, 0.05,
                0.0, -0.01, 1.01,
            ],
            saturation: 0.9,
            contrast: -0.05,
            sharpness: 0.15,
            noise_reduction: 0.25,
        }
    }
    
    // Nikon Landscape (风光)
    pub fn nikon_landscape() -> Self {
        Self {
            brand: CameraBrand::Nikon,
            model: "通用".into(),
            profile_name: "Nikon 风光".into(),
            tone_curve_shadows: 0.15,
            tone_curve_midtones: 0.0,
            tone_curve_highlights: -0.1,
            color_matrix: [
                1.08, -0.04, -0.04,
                -0.01, 1.08, -0.07,
                0.0, -0.04, 1.04,
            ],
            saturation: 1.12,
            contrast: 0.08,
            sharpness: 0.35,
            noise_reduction: 0.1,
        }
    }
    
    // Sony Standard
    pub fn sony_standard() -> Self {
        Self {
            brand: CameraBrand::Sony,
            model: "通用".into(),
            profile_name: "Sony 标准".into(),
            tone_curve_shadows: 0.02,
            tone_curve_midtones: 0.0,
            tone_curve_highlights: -0.06,
            color_matrix: [
                1.04, -0.02, -0.02,
                0.0, 1.03, -0.03,
                -0.01, -0.03, 1.04,
            ],
            saturation: 1.02,
            contrast: 0.03,
            sharpness: 0.3,
            noise_reduction: 0.2,
        }
    }
    
    // Fuji Provia (标准)
    pub fn fuji_provia() -> Self {
        Self {
            brand: CameraBrand::Fuji,
            model: "通用".into(),
            profile_name: "Fuji PROVIA/标准".into(),
            tone_curve_shadows: 0.0,
            tone_curve_midtones: 0.0,
            tone_curve_highlights: -0.05,
            color_matrix: [
                1.02, 0.0, -0.02,
                0.0, 1.02, -0.02,
                0.0, -0.02, 1.02,
            ],
            saturation: 1.0,
            contrast: 0.0,
            sharpness: 0.2,
            noise_reduction: 0.1,
        }
    }
    
    // Fuji Velvia (鲜艳)
    pub fn fuji_velvia() -> Self {
        Self {
            brand: CameraBrand::Fuji,
            model: "通用".into(),
            profile_name: "Fuji Velvia/鲜艳".into(),
            tone_curve_shadows: 0.15,
            tone_curve_midtones: 0.05,
            tone_curve_highlights: -0.15,
            color_matrix: [
                1.12, -0.06, -0.06,
                -0.02, 1.10, -0.08,
                -0.02, -0.06, 1.08,
            ],
            saturation: 1.25,
            contrast: 0.15,
            sharpness: 0.35,
            noise_reduction: 0.1,
        }
    }
    
    // Fuji Astia (柔和)
    pub fn fuji_astia() -> Self {
        Self {
            brand: CameraBrand::Fuji,
            model: "通用".into(),
            profile_name: "Fuji Astia/柔和".into(),
            tone_curve_shadows: -0.05,
            tone_curve_midtones: 0.02,
            tone_curve_highlights: -0.08,
            color_matrix: [
                1.04, -0.02, -0.02,
                -0.01, 0.98, 0.03,
                -0.01, -0.01, 1.02,
            ],
            saturation: 0.92,
            contrast: -0.05,
            sharpness: 0.15,
            noise_reduction: 0.2,
        }
    }
    
    // Fuji Classic Chrome
    pub fn fuji_classic_chrome() -> Self {
        Self {
            brand: CameraBrand::Fuji,
            model: "通用".into(),
            profile_name: "Fuji Classic Chrome".into(),
            tone_curve_shadows: 0.1,
            tone_curve_midtones: -0.05,
            tone_curve_highlights: -0.1,
            color_matrix: [
                1.06, -0.04, -0.02,
                -0.02, 0.96, 0.06,
                0.0, -0.02, 1.02,
            ],
            saturation: 0.85,
            contrast: 0.1,
            sharpness: 0.3,
            noise_reduction: 0.15,
        }
    }
    
    // Fuji PRO Neg Hi
    pub fn fuji_pro_neg_hi() -> Self {
        Self {
            brand: CameraBrand::Fuji,
            model: "通用".into(),
            profile_name: "Fuji PRO Neg Hi".into(),
            tone_curve_shadows: 0.05,
            tone_curve_midtones: 0.0,
            tone_curve_highlights: -0.1,
            color_matrix: [
                1.04, -0.02, -0.02,
                -0.01, 0.97, 0.04,
                0.0, -0.01, 1.01,
            ],
            saturation: 0.9,
            contrast: 0.05,
            sharpness: 0.25,
            noise_reduction: 0.15,
        }
    }
    
    // Fuji ACROS (黑白)
    pub fn fuji_acros() -> Self {
        Self {
            brand: CameraBrand::Fuji,
            model: "通用".into(),
            profile_name: "Fuji ACROS/黑白".into(),
            tone_curve_shadows: 0.1,
            tone_curve_midtones: 0.0,
            tone_curve_highlights: -0.05,
            color_matrix: [
                0.299, 0.587, 0.114,
                0.299, 0.587, 0.114,
                0.299, 0.587, 0.114,
            ],
            saturation: 0.0,
            contrast: 0.15,
            sharpness: 0.4,
            noise_reduction: 0.2,
        }
    }
    
    /// 获取所有预设的相机配置文件
    pub fn all_presets() -> Vec<CameraProfile> {
        vec![
            Self::canon_standard(),
            Self::canon_portrait(),
            Self::canon_landscape(),
            Self::nikon_standard(),
            Self::nikon_portrait(),
            Self::nikon_landscape(),
            Self::sony_standard(),
            Self::fuji_provia(),
            Self::fuji_velvia(),
            Self::fuji_astia(),
            Self::fuji_classic_chrome(),
            Self::fuji_pro_neg_hi(),
            Self::fuji_acros(),
        ]
    }
    
    /// 转换为 WGSL shader 可用的 uniform 数据
    pub fn to_uniform_data(&self) -> [f32; 20] {
        let mut data = [0.0f32; 20];
        data[0] = self.tone_curve_shadows;
        data[1] = self.tone_curve_midtones;
        data[2] = self.tone_curve_highlights;
        data[3] = self.color_matrix[0];
        data[4] = self.color_matrix[1];
        data[5] = self.color_matrix[2];
        data[6] = self.color_matrix[3];
        data[7] = self.color_matrix[4];
        data[8] = self.color_matrix[5];
        data[9] = self.color_matrix[6];
        data[10] = self.color_matrix[7];
        data[11] = self.color_matrix[8];
        data[12] = self.saturation;
        data[13] = self.contrast;
        data[14] = self.sharpness;
        data[15] = self.noise_reduction;
        data[16] = 0.0; // padding
        data[17] = 0.0;
        data[18] = 0.0;
        data[19] = 0.0;
        data
    }
}

/// 根据 EXIF 相机型号自动匹配最佳配置文件
pub fn detect_camera_profile(exif_make: &str, exif_model: &str) -> CameraProfile {
    let make_lower = exif_make.to_lowercase();
    let model_lower = exif_model.to_lowercase();
    
    match make_lower.as_str() {
        "canon" => {
            if model_lower.contains("eos r") || model_lower.contains("5d") || model_lower.contains("1d") {
                CameraProfile::canon_standard()
            } else {
                CameraProfile::canon_standard()
            }
        }
        "nikon corporation" | "nikon" => {
            if model_lower.contains("z") || model_lower.contains("d8") {
                CameraProfile::nikon_standard()
            } else {
                CameraProfile::nikon_standard()
            }
        }
        "sony" => CameraProfile::sony_standard(),
        "fujifilm" | "fuji" => CameraProfile::fuji_provia(),
        "panasonic" => CameraProfile::canon_standard(), // 使用通用
        "olympus" => CameraProfile::canon_standard(),
        "leica" => CameraProfile::canon_standard(),
        "hasselblad" => CameraProfile::canon_standard(),
        "pentax" => CameraProfile::canon_standard(),
        _ => CameraProfile::canon_standard(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_all_presets_are_valid() {
        let presets = CameraProfile::all_presets();
        assert!(!presets.is_empty());
        for preset in &presets {
            assert!(preset.saturation >= 0.0);
            assert!(preset.contrast >= -1.0 && preset.contrast <= 1.0);
        }
    }
    
    #[test]
    fn test_uniform_data_size() {
        let profile = CameraProfile::canon_standard();
        let data = profile.to_uniform_data();
        assert_eq!(data.len(), 20);
    }
}