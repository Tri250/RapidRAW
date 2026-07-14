//! GPU 厂商适配模块
//! 
//! 针对高通 Adreno、ARM Mali、PowerVR 等 GPU 的特定优化

use wgpu::AdapterInfo;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GpuVendor {
    QualcommAdreno,
    ArmMali,
    ImaginationPowerVR,
    Nvidia,
    Amd,
    Intel,
    Apple,
    Unknown,
}

impl GpuVendor {
    /// 从 WGPU AdapterInfo 检测 GPU 厂商
    pub fn from_adapter_info(info: &AdapterInfo) -> Self {
        let name = info.name.to_lowercase();
        let vendor_id = info.vendor;
        
        if name.contains("adreno") || vendor_id == 0x5143 {
            GpuVendor::QualcommAdreno
        } else if name.contains("mali") || vendor_id == 0x13B5 {
            GpuVendor::ArmMali
        } else if name.contains("powervr") || name.contains("rogue") || vendor_id == 0x1010 {
            GpuVendor::ImaginationPowerVR
        } else if name.contains("nvidia") || vendor_id == 0x10DE {
            GpuVendor::Nvidia
        } else if name.contains("amd") || name.contains("radeon") || vendor_id == 0x1002 {
            GpuVendor::Amd
        } else if name.contains("intel") || vendor_id == 0x8086 {
            GpuVendor::Intel
        } else if name.contains("apple") || vendor_id == 0x106B {
            GpuVendor::Apple
        } else {
            GpuVendor::Unknown
        }
    }
    
    /// 获取推荐的 WGSL 编译选项
    pub fn get_shader_compile_options(&self) -> ShaderOptimization {
        match self {
            GpuVendor::QualcommAdreno => ShaderOptimization {
                tile_size: 16,          // Adreno 偏好 16x16 tile
                use_subgroups: true,    // Adreno 支持 subgroup 操作
                prefer_scalar: true,    // Adreno 标量架构
                max_unroll: 4,
                use_16bit_storage: true, // Adreno 支持 fp16 storage
            },
            GpuVendor::ArmMali => ShaderOptimization {
                tile_size: 8,           // Mali 偏好 8x8 tile
                use_subgroups: false,   // Mali subgroup 支持有限
                prefer_scalar: false,   // Mali 向量架构
                max_unroll: 2,
                use_16bit_storage: true,
            },
            GpuVendor::ImaginationPowerVR => ShaderOptimization {
                tile_size: 32,          // PowerVR TBDR 大 tile
                use_subgroups: false,
                prefer_scalar: false,
                max_unroll: 1,          // PowerVR 不推荐展开
                use_16bit_storage: false,
            },
            _ => ShaderOptimization::default(),
        }
    }
    
    /// 获取推荐的 present mode
    pub fn get_present_mode(&self) -> wgpu::PresentMode {
        match self {
            GpuVendor::QualcommAdreno => wgpu::PresentMode::Fifo, // Adreno 稳定
            GpuVendor::ArmMali => wgpu::PresentMode::Fifo,
            _ => wgpu::PresentMode::Fifo,
        }
    }
    
    /// 获取推荐的渲染分辨率缩放（用于性能自适应）
    pub fn get_render_scale_hint(&self) -> f32 {
        match self {
            GpuVendor::QualcommAdreno => 1.0,  // Adreno 性能好，全分辨率
            GpuVendor::ArmMali => 0.75,         // Mali 中端降分辨率
            GpuVendor::ImaginationPowerVR => 0.5, // PowerVR 低端大幅降分辨率
            _ => 1.0,
        }
    }
    
    /// 获取最大纹理尺寸限制
    pub fn get_max_texture_size(&self) -> u32 {
        match self {
            GpuVendor::QualcommAdreno => 16384,
            GpuVendor::ArmMali => 8192,
            GpuVendor::ImaginationPowerVR => 4096,
            _ => 8192,
        }
    }
    
    /// 是否支持 fp16 纹理
    pub fn supports_fp16_textures(&self) -> bool {
        match self {
            GpuVendor::QualcommAdreno => true,
            GpuVendor::ArmMali => true,
            GpuVendor::ImaginationPowerVR => false,
            _ => true,
        }
    }
}

#[derive(Debug, Clone)]
pub struct ShaderOptimization {
    pub tile_size: u32,
    pub use_subgroups: bool,
    pub prefer_scalar: bool,
    pub max_unroll: u32,
    pub use_16bit_storage: bool,
}

impl Default for ShaderOptimization {
    fn default() -> Self {
        Self {
            tile_size: 8,
            use_subgroups: false,
            prefer_scalar: false,
            max_unroll: 1,
            use_16bit_storage: false,
        }
    }
}

/// GPU 性能分析器
pub struct GpuProfiler {
    pub vendor: GpuVendor,
    pub frame_times: Vec<f64>,
    pub average_fps: f64,
    pub min_fps: f64,
    pub max_fps: f64,
    pub dropped_frames: u64,
    pub total_frames: u64,
}

impl GpuProfiler {
    pub fn new(vendor: GpuVendor) -> Self {
        Self {
            vendor,
            frame_times: Vec::with_capacity(120),
            average_fps: 0.0,
            min_fps: f64::MAX,
            max_fps: 0.0,
            dropped_frames: 0,
            total_frames: 0,
        }
    }
    
    /// 记录一帧的渲染时间
    pub fn record_frame(&mut self, frame_time_ms: f64) {
        self.frame_times.push(frame_time_ms);
        self.total_frames += 1;
        
        if frame_time_ms > 33.33 { // 超过 30fps 阈值视为掉帧
            self.dropped_frames += 1;
        }
        
        if self.frame_times.len() > 120 {
            self.frame_times.remove(0);
        }
        
        // 更新统计
        if !self.frame_times.is_empty() {
            let sum: f64 = self.frame_times.iter().sum();
            self.average_fps = 1000.0 / (sum / self.frame_times.len() as f64);
            self.min_fps = self.frame_times.iter().cloned().fold(f64::MAX, f64::min);
            self.max_fps = self.frame_times.iter().cloned().fold(0.0f64, f64::max);
            self.min_fps = 1000.0 / self.max_fps.max(0.001);
            self.max_fps = 1000.0 / self.min_fps.max(0.001);
        }
    }
    
    /// 获取性能报告
    pub fn get_report(&self) -> String {
        format!(
            "GPU: {:?}\nFPS: avg={:.1} min={:.1} max={:.1}\nFrames: {} total, {} dropped ({:.1}%)\n",
            self.vendor,
            self.average_fps,
            self.min_fps,
            self.max_fps,
            self.total_frames,
            self.dropped_frames,
            if self.total_frames > 0 {
                self.dropped_frames as f64 / self.total_frames as f64 * 100.0
            } else {
                0.0
            }
        )
    }
}

/// Tauri 命令: 获取当前 GPU 信息
#[tauri::command]
pub fn get_gpu_info(state: tauri::State<crate::AppState>) -> Result<serde_json::Value, String> {
    let context_lock = state.gpu_context.lock().unwrap();
    if let Some(context) = &*context_lock {
        let vendor = context.vendor;
        let optimization = &context.shader_optimization;
        Ok(serde_json::json!({
            "vendor": format!("{:?}", vendor),
            "renderScaleHint": optimization.tile_size,
            "supportsFp16Textures": GpuVendor::supports_fp16_textures(&vendor),
            "maxTextureSize": GpuVendor::get_max_texture_size(&vendor),
            "shaderOptimization": {
                "tileSize": optimization.tile_size,
                "useSubgroups": optimization.use_subgroups,
                "preferScalar": optimization.prefer_scalar,
                "maxUnroll": optimization.max_unroll,
                "use16bitStorage": optimization.use_16bit_storage,
            },
        }))
    } else {
        Err("GPU context not initialized".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_gpu_vendor_detection() {
        // Test with known GPU names
        let adreno = GpuVendor::from_adapter_info(&wgpu::AdapterInfo {
            name: "Adreno (TM) 650".into(),
            vendor: 0x5143,
            device: 0,
            device_type: wgpu::DeviceType::IntegratedGpu,
            driver: "".into(),
            driver_info: "".into(),
            backend: wgpu::Backend::Vulkan,
        });
        assert_eq!(adreno, GpuVendor::QualcommAdreno);
        
        let mali = GpuVendor::from_adapter_info(&wgpu::AdapterInfo {
            name: "Mali-G78".into(),
            vendor: 0x13B5,
            device: 0,
            device_type: wgpu::DeviceType::IntegratedGpu,
            driver: "".into(),
            driver_info: "".into(),
            backend: wgpu::Backend::Vulkan,
        });
        assert_eq!(mali, GpuVendor::ArmMali);
    }
    
    #[test]
    fn test_profiler() {
        let mut profiler = GpuProfiler::new(GpuVendor::QualcommAdreno);
        profiler.record_frame(16.67); // ~60fps
        profiler.record_frame(16.67);
        profiler.record_frame(50.0);  // dropped frame
        profiler.record_frame(16.67);
        
        let report = profiler.get_report();
        assert!(report.contains("QualcommAdreno"));
        assert!(profiler.dropped_frames == 1);
    }
}