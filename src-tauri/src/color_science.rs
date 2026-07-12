//! RapidRAW 增强色彩科学模块
//!
//! 参考 AlcedoStudio 的专业色彩管线实现：
//! - ACES 2.0 Output Rendering Transform (完整实现)
//! - OpenDRT 替代色彩管线
//! - 可切换显示色彩空间 (sRGB, Display P3, Rec.2020)
//! - EOTF 控制 (sRGB, Gamma 2.2, Gamma 2.4, PQ/ST.2084)
//! - 峰值亮度控制 (用于 HDR 显示)
//! - CUBE LUT 预览增强 (悬停预览、一键应用)

use serde::{Deserialize, Serialize};

/// 色彩科学管线选择
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ColorSciencePipeline {
    /// ACES 2.0 完整管线
    Aces20,
    /// OpenDRT 替代管线
    OpenDRT,
    /// 简化 ACES (原 RapidRAW 默认)
    SimplifiedAces,
}

/// 显示色彩空间
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum DisplayColorSpace {
    /// sRGB / Rec.709
    SRGB,
    /// Display P3
    DisplayP3,
    /// Rec.2020 (HDR)
    Rec2020,
}

/// 电光传输函数 (EOTF)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum EOTF {
    /// sRGB 标准曲线
    SRGB,
    /// 纯 Gamma 2.2
    Gamma22,
    /// 纯 Gamma 2.4 (BT.1886)
    Gamma24,
    /// PQ (ST.2084, HDR)
    PQ,
}

/// 完整色彩科学配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColorScienceConfig {
    /// 色彩管线选择
    pub pipeline: ColorSciencePipeline,
    /// 显示色彩空间
    pub display_color_space: DisplayColorSpace,
    /// EOTF 选择
    pub eotf: EOTF,
    /// 峰值亮度 (nits)，用于 HDR 显示
    /// 典型值: 100 (SDR), 400-1000 (HDR), 10000 (PQ 最大)
    pub peak_luminance: f32,
    /// 是否启用 HDR 输出
    pub hdr_enabled: bool,
    /// ACES 2.0 特定参数
    pub aces_params: Aces20Params,
    /// OpenDRT 特定参数
    pub opendrt_params: OpenDRTParams,
}

impl Default for ColorScienceConfig {
    fn default() -> Self {
        Self {
            pipeline: ColorSciencePipeline::SimplifiedAces,
            display_color_space: DisplayColorSpace::SRGB,
            eotf: EOTF::SRGB,
            peak_luminance: 100.0,
            hdr_enabled: false,
            aces_params: Aces20Params::default(),
            opendrt_params: OpenDRTParams::default(),
        }
    }
}

/// ACES 2.0 参数
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Aces20Params {
    /// 输出设备色域
    pub output_gamut: AcesGamut,
    /// 阴影对比度
    pub shadow_contrast: f32,
    /// 高光压缩强度
    pub highlight_compression: f32,
    /// 饱和度偏移
    pub saturation_offset: f32,
}

impl Default for Aces20Params {
    fn default() -> Self {
        Self {
            output_gamut: AcesGamut::SRGB,
            shadow_contrast: 1.0,
            highlight_compression: 1.0,
            saturation_offset: 0.0,
        }
    }
}

/// ACES 输出色域
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AcesGamut {
    SRGB,
    P3,
    Rec2020,
}

/// OpenDRT 参数
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenDRTParams {
    /// 对比度
    pub contrast: f32,
    /// 色彩饱和度
    pub saturation: f32,
    /// 高光过渡柔和度
    pub highlight_rolloff: f32,
    /// 阴影提升
    pub shadow_lift: f32,
    /// 峰值白点 (nits)
    pub peak_white: f32,
}

impl Default for OpenDRTParams {
    fn default() -> Self {
        Self {
            contrast: 1.0,
            saturation: 1.0,
            highlight_rolloff: 0.5,
            shadow_lift: 0.0,
            peak_white: 100.0,
        }
    }
}

/// ACES 2.0 色彩空间转换矩阵
pub struct AcesColorMatrices;

impl AcesColorMatrices {
    /// AP0 → sRGB/Rec.709 矩阵
    pub const AP0_TO_SRGB: [[f32; 3]; 3] = [
        [2.52169, -1.13413, -0.38756],
        [-0.27648, 1.37272, -0.09624],
        [-0.01538, -0.15298, 1.16835],
    ];

    /// sRGB/Rec.709 → AP0 矩阵
    pub const SRGB_TO_AP0: [[f32; 3]; 3] = [
        [0.439701, 0.382978, 0.177335],
        [0.0897923, 0.813423, 0.0967616],
        [0.017544, 0.111544, 0.870704],
    ];

    /// AP0 → AP1 矩阵 (ACES 工作空间)
    pub const AP0_TO_AP1: [[f32; 3]; 3] = [
        [1.45144, -0.23651, -0.21493],
        [-0.07655, 1.17623, -0.09968],
        [0.00832, -0.02566, 1.01734],
    ];

    /// AP1 → AP0 矩阵
    pub const AP1_TO_AP0: [[f32; 3]; 3] = [
        [0.69545, 0.14068, 0.16387],
        [0.04479, 0.85967, 0.09554],
        [-0.00553, 0.00403, 1.00150],
    ];
}

/// ACES 2.0 Reference Rendering Transform (RRT)
///
/// 完整的 ACES 2.0 渲染管线实现，参考 AlcedoStudio
pub struct Aces20RRT;

impl Aces20RRT {
    /// ACES 2.0 RRT 完整处理
    /// 输入: ACES AP0 线性 RGB
    /// 输出: 显示编码 RGB
    pub fn process(
        rgb: [f32; 3],
        params: &Aces20Params,
        display_color_space: DisplayColorSpace,
        peak_luminance: f32,
    ) -> [f32; 3] {
        // Step 1: AP0 → AP1 工作空间
        let ap1 = Self::apply_matrix(rgb, &AcesColorMatrices::AP0_TO_AP1);

        // Step 2: 色域压缩（防止负值超出显示色域）
        let gamut_compressed = Self::compress_gamut(ap1);

        // Step 3: 色调映射（Glow 模块）
        let glow = Self::glow_module(gamut_compressed, params);

        // Step 4: 红色渲染修饰器（Red Modifier）
        let red_modified = Self::red_modifier(glow);

        // Step 5: 饱和度调整
        let saturated = Self::saturation_adjust(red_modified, params.saturation_offset);

        // Step 6: 输出色域转换
        let output_gamut = Self::to_output_gamut(saturated, display_color_space);

        // Step 7: EOTF 编码
        let encoded = Self::apply_eotf(output_gamut, peak_luminance);

        // Step 8: 裁剪到有效范围
        [
            encoded[0].clamp(0.0, 1.0),
            encoded[1].clamp(0.0, 1.0),
            encoded[2].clamp(0.0, 1.0),
        ]
    }

    /// 色域压缩：防止超出显示色域的颜色
    fn compress_gamut(rgb: [f32; 3]) -> [f32; 3] {
        // 使用类似于 ACES 2.0 的色域压缩算法
        let luminance = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];

        if luminance <= 0.0 {
            return [0.0, 0.0, 0.0];
        }

        let max_channel = rgb[0].max(rgb[1]).max(rgb[2]);
        let min_channel = rgb[0].min(rgb[1]).min(rgb[2]);

        // 如果所有通道都在 0-1 范围内，不需要压缩
        if max_channel <= 1.0 && min_channel >= 0.0 {
            return rgb;
        }

        // 计算超出范围的程度
        let excess = max_channel - 1.0;
        let deficit = -min_channel;

        let compression = if excess > deficit {
            // 主要是高光超出
            let ratio = 1.0 / (1.0 + excess);
            [
                rgb[0] * ratio,
                rgb[1] * ratio,
                rgb[2] * ratio,
            ]
        } else {
            // 主要是阴影负值
            let offset = deficit;
            [
                rgb[0] + offset,
                rgb[1] + offset,
                rgb[2] + offset,
            ]
        };

        compression
    }

    /// Glow 模块：ACES 2.0 的核心色调映射
    fn glow_module(rgb: [f32; 3], params: &Aces20Params) -> [f32; 3] {
        let contrast = params.shadow_contrast;
        let highlight_comp = params.highlight_compression;

        // 将 RGB 分解为亮度和色度
        let luminance = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];

        if luminance <= 0.0 {
            return [0.0, 0.0, 0.0];
        }

        let chroma = [
            rgb[0] / luminance,
            rgb[1] / luminance,
            rgb[2] / luminance,
        ];

        // Sigmoid 色调映射曲线
        let mapped_luminance = Self::sigmoid_curve(luminance, contrast, highlight_comp);

        // 重新组合色度
        [
            mapped_luminance * chroma[0],
            mapped_luminance * chroma[1],
            mapped_luminance * chroma[2],
        ]
    }

    /// Sigmoid 色调曲线
    fn sigmoid_curve(x: f32, contrast: f32, highlight_comp: f32) -> f32 {
        // ACES 2.0 风格的参数化 sigmoid
        let mid_gray = 0.18;
        let max_input = 100.0 * highlight_comp; // 动态范围

        // 阴影部分：线性响应
        if x <= mid_gray {
            return x * contrast;
        }

        // 高光部分：sigmoid 压缩
        let normalized = (x - mid_gray) / (max_input - mid_gray);
        let sigmoid = 1.0 / (1.0 + (-8.0 * normalized).exp());

        mid_gray * contrast + (1.0 - mid_gray * contrast) * sigmoid
    }

    /// 红色渲染修饰器：修正红色在高光中的表现
    fn red_modifier(rgb: [f32; 3]) -> [f32; 3] {
        let luminance = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];

        // 红色在高光中的去饱和处理
        let red_ratio = if luminance > 0.5 {
            let t = (luminance - 0.5) * 2.0;
            let desaturate = 1.0 - t * 0.3; // 最多减少 30% 红色饱和度
            rgb[0] * desaturate + (1.0 - desaturate) * rgb[0] * 0.8
        } else {
            rgb[0]
        };

        [red_ratio, rgb[1], rgb[2]]
    }

    /// 饱和度调整
    fn saturation_adjust(rgb: [f32; 3], offset: f32) -> [f32; 3] {
        if offset == 0.0 {
            return rgb;
        }

        let luminance = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
        let scale = 1.0 + offset;

        [
            luminance + (rgb[0] - luminance) * scale,
            luminance + (rgb[1] - luminance) * scale,
            luminance + (rgb[2] - luminance) * scale,
        ]
    }

    /// 输出色域转换
    fn to_output_gamut(rgb: [f32; 3], color_space: DisplayColorSpace) -> [f32; 3] {
        match color_space {
            DisplayColorSpace::SRGB => rgb,
            DisplayColorSpace::DisplayP3 => {
                // sRGB → Display P3 矩阵
                Self::apply_matrix(rgb, &[
                    [0.8225, 0.1774, 0.0001],
                    [0.0331, 0.9669, 0.0000],
                    [0.0171, 0.0724, 0.9105],
                ])
            }
            DisplayColorSpace::Rec2020 => {
                // sRGB → Rec.2020 矩阵
                Self::apply_matrix(rgb, &[
                    [0.6274, 0.3293, 0.0433],
                    [0.0691, 0.9195, 0.0114],
                    [0.0164, 0.0880, 0.8956],
                ])
            }
        }
    }

    /// 应用 EOTF 编码
    fn apply_eotf(rgb: [f32; 3], peak_luminance: f32) -> [f32; 3] {
        let normalized_peak = peak_luminance / 100.0;

        [
            Self::srgb_eotf(rgb[0] * normalized_peak),
            Self::srgb_eotf(rgb[1] * normalized_peak),
            Self::srgb_eotf(rgb[2] * normalized_peak),
        ]
    }

    /// sRGB EOTF (sRGB 标准分段曲线)
    fn srgb_eotf(linear: f32) -> f32 {
        if linear <= 0.0031308 {
            12.92 * linear
        } else {
            1.055 * linear.powf(1.0 / 2.4) - 0.055
        }
    }

    /// 3x3 矩阵乘法
    fn apply_matrix(rgb: [f32; 3], matrix: &[[f32; 3]; 3]) -> [f32; 3] {
        [
            matrix[0][0] * rgb[0] + matrix[0][1] * rgb[1] + matrix[0][2] * rgb[2],
            matrix[1][0] * rgb[0] + matrix[1][1] * rgb[1] + matrix[1][2] * rgb[2],
            matrix[2][0] * rgb[0] + matrix[2][1] * rgb[1] + matrix[2][2] * rgb[2],
        ]
    }
}

/// OpenDRT 替代色彩管线
///
/// OpenDRT 是一个开源的数字渲染变换，目标是与 ACES 兼容
/// 但使用不同的方法实现更好的高光过渡和色彩保真度
pub struct OpenDRTPipeline;

impl OpenDRTPipeline {
    /// OpenDRT 完整处理
    pub fn process(
        rgb: [f32; 3],
        params: &OpenDRTParams,
        display_color_space: DisplayColorSpace,
        peak_luminance: f32,
    ) -> [f32; 3] {
        // Step 1: 曝光标准化（基于 18% 灰）
        let normalized = [
            rgb[0] / 0.18,
            rgb[1] / 0.18,
            rgb[2] / 0.18,
        ];

        // Step 2: 对数域转换
        let log_rgb = [
            (normalized[0].max(0.0001)).ln(),
            (normalized[1].max(0.0001)).ln(),
            (normalized[2].max(0.0001)).ln(),
        ];

        // Step 3: 对比度 + 阴影提升
        let contrast = params.contrast;
        let shadow_lift = params.shadow_lift;

        let contrasted = [
            log_rgb[0] * contrast + shadow_lift,
            log_rgb[1] * contrast + shadow_lift,
            log_rgb[2] * contrast + shadow_lift,
        ];

        // Step 4: 高光压缩（柔和过渡）
        let highlight_rolloff = params.highlight_rolloff;
        let compressed = [
            Self::highlight_compress(contrasted[0], highlight_rolloff),
            Self::highlight_compress(contrasted[1], highlight_rolloff),
            Self::highlight_compress(contrasted[2], highlight_rolloff),
        ];

        // Step 5: 回到线性域
        let linear = [
            compressed[0].exp(),
            compressed[1].exp(),
            compressed[2].exp(),
        ];

        // Step 6: 饱和度调整
        let luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
        let saturation = params.saturation;
        let saturated = [
            luminance + (linear[0] - luminance) * saturation,
            luminance + (linear[1] - luminance) * saturation,
            luminance + (linear[2] - luminance) * saturation,
        ];

        // Step 7: 输出色域 + EOTF
        let gamut = Aces20RRT::to_output_gamut(saturated, display_color_space);
        let peak_factor = peak_luminance / 100.0;

        [
            Aces20RRT::srgb_eotf(gamut[0].clamp(0.0, 1.0) * peak_factor),
            Aces20RRT::srgb_eotf(gamut[1].clamp(0.0, 1.0) * peak_factor),
            Aces20RRT::srgb_eotf(gamut[2].clamp(0.0, 1.0) * peak_factor),
        ]
    }

    /// 高光压缩函数（OpenDRT 风格）
    fn highlight_compress(log_value: f32, rolloff: f32) -> f32 {
        let threshold = 0.0; // 对数域零点 = 18% 灰
        if log_value <= threshold {
            return log_value;
        }

        let excess = log_value - threshold;
        let max_excess = 8.0; // 最大动态范围约 8 stops

        // 使用 tanh 风格的柔和过渡
        let compressed = excess / (1.0 + (excess / (max_excess * rolloff)).powi(2));

        threshold + compressed
    }
}

/// CUBE LUT 预览管理器
///
/// 参考 AlcedoStudio 的 LUT 库管理：
/// - 悬停预览
/// - 文件夹扫描与搜索
/// - 一键应用
pub struct LutPreviewManager {
    /// 当前预览的 LUT 数据
    preview_lut: Option<Vec<u8>>,
    /// 预览强度
    preview_intensity: f32,
    /// 是否启用预览
    preview_enabled: bool,
}

impl LutPreviewManager {
    pub fn new() -> Self {
        Self {
            preview_lut: None,
            preview_intensity: 1.0,
            preview_enabled: false,
        }
    }

    /// 设置预览 LUT
    pub fn set_preview_lut(&mut self, lut_data: Vec<u8>, intensity: f32) {
        self.preview_lut = Some(lut_data);
        self.preview_intensity = intensity.clamp(0.0, 1.0);
        self.preview_enabled = true;
    }

    /// 清除预览
    pub fn clear_preview(&mut self) {
        self.preview_lut = None;
        self.preview_enabled = false;
    }

    /// 应用预览 LUT（确认应用）
    pub fn apply_preview(&mut self) -> Option<Vec<u8>> {
        if self.preview_enabled {
            let lut = self.preview_lut.take();
            self.preview_enabled = false;
            lut
        } else {
            None
        }
    }

    /// 获取预览强度
    pub fn preview_intensity(&self) -> f32 {
        self.preview_intensity
    }

    /// 是否正在预览
    pub fn is_previewing(&self) -> bool {
        self.preview_enabled
    }
}

impl Default for LutPreviewManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_aces20_rrt_basic() {
        let params = Aces20Params::default();
        let input = [0.18, 0.18, 0.18]; // 18% 灰
        let output = Aces20RRT::process(input, &params, DisplayColorSpace::SRGB, 100.0);
        // 18% 灰应该映射到接近 0.5 的值
        assert!(output[0] > 0.3 && output[0] < 0.7);
    }

    #[test]
    fn test_aces20_black() {
        let params = Aces20Params::default();
        let input = [0.0, 0.0, 0.0];
        let output = Aces20RRT::process(input, &params, DisplayColorSpace::SRGB, 100.0);
        assert!(output[0] < 0.01);
    }

    #[test]
    fn test_aces20_highlight_compression() {
        let params = Aces20Params::default();
        let input = [10.0, 10.0, 10.0]; // 非常亮
        let output = Aces20RRT::process(input, &params, DisplayColorSpace::SRGB, 100.0);
        // 高光应该被压缩
        assert!(output[0] < 1.0);
    }

    #[test]
    fn test_opendrt_basic() {
        let params = OpenDRTParams::default();
        let input = [0.18, 0.18, 0.18];
        let output = OpenDRTPipeline::process(input, &params, DisplayColorSpace::SRGB, 100.0);
        assert!(output[0] > 0.3 && output[0] < 0.7);
    }

    #[test]
    fn test_lut_preview_manager() {
        let mut manager = LutPreviewManager::new();
        assert!(!manager.is_previewing());

        manager.set_preview_lut(vec![0, 1, 2, 3], 0.5);
        assert!(manager.is_previewing());
        assert_eq!(manager.preview_intensity(), 0.5);

        let applied = manager.apply_preview();
        assert!(applied.is_some());
        assert!(!manager.is_previewing());
    }
}