use std::sync::Arc;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use wgpu::util::DeviceExt;

// ---------------------------------------------------------------------------
// WGSL compute shader – embedded as a const string
// ---------------------------------------------------------------------------

const ADJUSTMENT_SHADER: &str = r#"
struct AdjustmentUniforms {
    exposure:     f32,
    contrast:     f32,
    highlights:   f32,
    shadows:      f32,
    whites:       f32,
    blacks:       f32,
    saturation:   f32,
    vibrance:     f32,
    temperature:  f32,
    tint:         f32,
    sharpness:    f32,
    vignette:     f32,
    grain_amount: f32,
    haze:         f32,
    clarity:      f32,
    dehaze:       f32,
}

struct Params {
    width:  u32,
    height: u32,
    _pad1:  u32,
    _pad2:  u32,
}

@group(0) @binding(0) var<uniform> adjustments: AdjustmentUniforms;
@group(0) @binding(1) var<uniform> params: Params;
@group(0) @binding(2) var input_image: texture_2d<f32>;
@group(0) @binding(3) var output_image: texture_storage_2d<rgba8unorm, write>;

// ---- helper functions ----

fn rgb_to_hsl(c: vec3<f32>) -> vec3<f32> {
    let max_c = max(max(c.r, c.g), c.b);
    let min_c = min(min(c.r, c.g), c.b);
    let l = (max_c + min_c) * 0.5;
    var h = 0.0;
    var s = 0.0;
    if max_c != min_c {
        let d = max_c - min_c;
        if l > 0.5 {
            s = d / (2.0 - max_c - min_c);
        } else {
            s = d / (max_c + min_c);
        }
        if max_c == c.r {
            h = (c.g - c.b) / d;
            if c.g < c.b {
                h = h + 6.0;
            }
        } else if max_c == c.g {
            h = (c.b - c.r) / d + 2.0;
        } else {
            h = (c.r - c.g) / d + 4.0;
        }
        h = h / 6.0;
    }
    return vec3<f32>(h, s, l);
}

fn hsl_to_rgb(c: vec3<f32>) -> vec3<f32> {
    if c.y <= 0.0 {
        return vec3<f32>(c.z, c.z, c.z);
    }
    let q = select(c.z * (1.0 + c.y), c.z + c.y - c.z * c.y, c.z < 0.5);
    let p = 2.0 * c.z - q;
    return hue_to_rgb(p, q, c.x);
}

fn hue_to_rgb(p: f32, q: f32, t_in: f32) -> vec3<f32> {
    var t = t_in;
    if t < 0.0 { t = t + 1.0; }
    if t > 1.0 { t = t - 1.0; }
    if t < 1.0 / 6.0 { return p + (q - p) * 6.0 * t; }
    if t < 1.0 / 2.0 { return q; }
    if t < 2.0 / 3.0 { return p + (q - p) * (2.0 / 3.0 - t) * 6.0; }
    return p;
}

// ---- main compute entry point ----

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let x = gid.x;
    let y = gid.y;
    if x >= params.width || y >= params.height {
        return;
    }

    let color = textureLoad(input_image, vec2<i32>(i32(x), i32(y)), 0);
    var rgb = color.rgb;

    // --- Exposure: multiply by 2^exposure ---
    rgb = rgb * pow(2.0, adjustments.exposure);

    // --- Contrast: (value - 0.5) * contrast + 0.5 ---
    let contrast_factor = 1.0 + adjustments.contrast;
    rgb = (rgb - 0.5) * contrast_factor + 0.5;

    // --- Highlights / Shadows (tone-range masks) ---
    let luminance = dot(rgb, vec3<f32>(0.2126, 0.7152, 0.0722));

    // highlights mask: smooth step for bright areas
    let hl_mask = smoothstep(0.4, 0.9, luminance);
    rgb = rgb + adjustments.highlights * hl_mask * (1.0 - rgb);

    // shadows mask: smooth step for dark areas
    let sh_mask = smoothstep(0.6, 0.1, luminance);
    rgb = rgb + adjustments.shadows * sh_mask * rgb;

    // --- Whites / Blacks ---
    let wt_mask = smoothstep(0.5, 1.0, luminance);
    rgb = rgb + adjustments.whites * wt_mask * 0.5;
    let bk_mask = smoothstep(0.5, 0.0, luminance);
    rgb = rgb - adjustments.blacks * bk_mask * 0.5;

    // --- Temperature / Tint (channel-dependent scaling) ---
    // Temperature shifts R/B channels; Tint shifts G channel
    let temp_shift = adjustments.temperature;
    let tint_shift = adjustments.tint;
    rgb.r = rgb.r * (1.0 + temp_shift * 0.1);
    rgb.b = rgb.b * (1.0 - temp_shift * 0.1);
    rgb.g = rgb.g * (1.0 + tint_shift * 0.05);

    // --- Saturation / Vibrance (HSL-based) ---
    let hsl = rgb_to_hsl(rgb);
    var new_sat = hsl.g;
    // Vibrance: less-saturated pixels get more boost
    new_sat = new_sat + adjustments.vibrance * (1.0 - new_sat);
    new_sat = new_sat + adjustments.saturation;
    new_sat = clamp(new_sat, 0.0, 1.0);
    rgb = hsl_to_rgb(vec3<f32>(hsl.r, new_sat, hsl.b));

    // --- Dehaze / Haze ---
    // Simple dehaze: increase contrast and reduce fog
    let dehaze_factor = 1.0 + adjustments.dehaze;
    let haze_factor = 1.0 + adjustments.haze;
    rgb = (rgb - 0.5) * dehaze_factor / haze_factor + 0.5;

    // --- Clarity: local contrast boost (approximated globally) ---
    let clarity_boost = 1.0 + adjustments.clarity * 0.1;
    let lum_dot = dot(rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
    rgb = mix(vec3<f32>(lum_dot), rgb, clarity_boost);

    // --- Sharpness (approximate: boost local contrast) ---
    // Full sharpness needs neighbor samples; here we apply a global
    // micro-contrast boost proportional to the parameter.
    let sharp_boost = 1.0 + adjustments.sharpness * 0.3;
    let lum2 = dot(rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
    rgb = mix(vec3<f32>(lum2), rgb, sharp_boost);

    // --- Vignette: radial darkening ---
    let uv_x = (f32(x) + 0.5) / f32(params.width);
    let uv_y = (f32(y) + 0.5) / f32(params.height);
    let dist = distance(vec2<f32>(uv_x, uv_y), vec2<f32>(0.5, 0.5));
    let vig = 1.0 - adjustments.vignette * smoothstep(0.3, 0.9, dist);
    rgb = rgb * vig;

    // --- Grain (pseudo-random using pixel position) ---
    if adjustments.grain_amount > 0.0 {
        let seed = f32(x) * 127.1 + f32(y) * 311.7;
        let noise = fract(sin(seed) * 43758.5453123) - 0.5;
        rgb = rgb + noise * adjustments.grain_amount * 0.15;
    }

    // Clamp and write
    rgb = clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0));
    textureStore(output_image, vec2<i32>(i32(x), i32(y)), vec4<f32>(rgb, color.a));
}
"#;

// ---------------------------------------------------------------------------
// AdjustmentUniforms – CPU-side mirror of the GPU struct
// ---------------------------------------------------------------------------

#[repr(C)]
#[derive(Debug, Copy, Clone, bytemuck::Pod, bytemuck::Zeroable, Serialize, Deserialize)]
pub struct AdjustmentUniforms {
    pub exposure: f32,
    pub contrast: f32,
    pub highlights: f32,
    pub shadows: f32,
    pub whites: f32,
    pub blacks: f32,
    pub saturation: f32,
    pub vibrance: f32,
    pub temperature: f32,
    pub tint: f32,
    pub sharpness: f32,
    pub vignette: f32,
    pub grain_amount: f32,
    pub haze: f32,
    pub clarity: f32,
    pub dehaze: f32,
}

impl Default for AdjustmentUniforms {
    fn default() -> Self {
        Self {
            exposure: 0.0,
            contrast: 0.0,
            highlights: 0.0,
            shadows: 0.0,
            whites: 0.0,
            blacks: 0.0,
            saturation: 0.0,
            vibrance: 0.0,
            temperature: 0.0,
            tint: 0.0,
            sharpness: 0.0,
            vignette: 0.0,
            grain_amount: 0.0,
            haze: 0.0,
            clarity: 0.0,
            dehaze: 0.0,
        }
    }
}

// ---------------------------------------------------------------------------
// ShaderParams – dimension data passed alongside adjustments
// ---------------------------------------------------------------------------

#[repr(C)]
#[derive(Debug, Copy, Clone, bytemuck::Pod, bytemuck::Zeroable)]
struct ShaderParams {
    width: u32,
    height: u32,
    _pad1: u32,
    _pad2: u32,
}

// ---------------------------------------------------------------------------
// GpuPipeline – manages wgpu device/queue and compiled shader modules
// ---------------------------------------------------------------------------

pub struct GpuPipeline {
    device: Arc<wgpu::Device>,
    queue: Arc<wgpu::Queue>,
    bind_group_layout: wgpu::BindGroupLayout,
    pipeline_cache: wgpu::ComputePipeline,
}

impl GpuPipeline {
    /// Creates a wgpu device and compiles all shaders.
    pub fn init() -> Result<Self> {
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
            backends: wgpu::Backends::all(),
            ..wgpu::InstanceDescriptor::new_without_display_handle()
        });

        let adapter = pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::HighPerformance,
            compatible_surface: None,
            ..Default::default()
        }))
        .context("Failed to find a suitable GPU adapter")?;

        let (device, queue) = pollster::block_on(adapter.request_device(&wgpu::DeviceDescriptor {
            label: Some("GpuPipeline Device"),
            required_features: wgpu::Features::empty(),
            required_limits: wgpu::Limits::downlevel_defaults(),
            experimental_features: wgpu::ExperimentalFeatures::default(),
            memory_hints: wgpu::MemoryHints::Performance,
            trace: wgpu::Trace::Off,
        }))
        .context("Failed to request wgpu device")?;

        let device = Arc::new(device);
        let queue = Arc::new(queue);

        let shader_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Adjustment Compute Shader"),
            source: wgpu::ShaderSource::Wgsl(ADJUSTMENT_SHADER.into()),
        });

        // Bind group layout:
        // 0 - uniform AdjustmentUniforms
        // 1 - uniform ShaderParams
        // 2 - texture_2d (input)
        // 3 - storage_texture (output)
        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("GpuPipeline BGL"),
            entries: &[
                // binding 0 – adjustments uniform buffer
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                // binding 1 – params uniform buffer
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                // binding 2 – input image texture
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: false },
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
                // binding 3 – output storage texture
                wgpu::BindGroupLayoutEntry {
                    binding: 3,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::StorageTexture {
                        access: wgpu::StorageTextureAccess::WriteOnly,
                        format: wgpu::TextureFormat::Rgba8Unorm,
                        view_dimension: wgpu::TextureViewDimension::D2,
                    },
                    count: None,
                },
            ],
        });

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("GpuPipeline Layout"),
            bind_group_layouts: &[Some(&bind_group_layout)],
            immediate_size: 0,
        });

        let pipeline_cache = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: Some("GpuPipeline Compute Pipeline"),
            layout: Some(&pipeline_layout),
            module: &shader_module,
            entry_point: Some("main"),
            compilation_options: Default::default(),
            cache: None,
        });

        Ok(Self {
            device,
            queue,
            bind_group_layout,
            pipeline_cache,
        })
    }

    /// Access the underlying device.
    pub fn device(&self) -> &Arc<wgpu::Device> {
        &self.device
    }

    /// Access the underlying queue.
    pub fn queue(&self) -> &Arc<wgpu::Queue> {
        &self.queue
    }
}

// ---------------------------------------------------------------------------
// apply_adjustments – dispatch the compute shader and read back result
// ---------------------------------------------------------------------------

pub fn apply_adjustments(
    pipeline: &GpuPipeline,
    image_data: &[u8],
    width: u32,
    height: u32,
    uniforms: AdjustmentUniforms,
) -> Result<Vec<u8>> {
    let device = &pipeline.device;
    let queue = &pipeline.queue;

    let texture_size = wgpu::Extent3d {
        width,
        height,
        depth_or_array_layers: 1,
    };

    // --- Create input texture and upload image data ---
    let input_texture = device.create_texture_with_data(
        queue,
        &wgpu::TextureDescriptor {
            label: Some("Adjustment Input Texture"),
            size: texture_size,
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        },
        wgpu::util::TextureDataOrder::MipMajor,
        image_data,
    );
    let input_view = input_texture.create_view(&wgpu::TextureViewDescriptor::default());

    // --- Create output storage texture ---
    let output_texture = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("Adjustment Output Texture"),
        size: texture_size,
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Rgba8Unorm,
        usage: wgpu::TextureUsages::STORAGE_BINDING | wgpu::TextureUsages::COPY_SRC,
        view_formats: &[],
    });
    let output_view = output_texture.create_view(&wgpu::TextureViewDescriptor::default());

    // --- Create uniform buffers ---
    let adjustments_buffer = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("Adjustment Uniforms Buffer"),
        size: std::mem::size_of::<AdjustmentUniforms>() as u64,
        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });
    queue.write_buffer(&adjustments_buffer, 0, bytemuck::bytes_of(&uniforms));

    let params = ShaderParams {
        width,
        height,
        _pad1: 0,
        _pad2: 0,
    };
    let params_buffer = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("Shader Params Buffer"),
        size: std::mem::size_of::<ShaderParams>() as u64,
        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        mapped_at_creation: false,
    });
    queue.write_buffer(&params_buffer, 0, bytemuck::bytes_of(&params));

    // --- Create bind group ---
    let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("Adjustment Bind Group"),
        layout: &pipeline.bind_group_layout,
        entries: &[
            wgpu::BindGroupEntry {
                binding: 0,
                resource: adjustments_buffer.as_entire_binding(),
            },
            wgpu::BindGroupEntry {
                binding: 1,
                resource: params_buffer.as_entire_binding(),
            },
            wgpu::BindGroupEntry {
                binding: 2,
                resource: wgpu::BindingResource::TextureView(&input_view),
            },
            wgpu::BindGroupEntry {
                binding: 3,
                resource: wgpu::BindingResource::TextureView(&output_view),
            },
        ],
    });

    // --- Dispatch compute shader ---
    let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
        label: Some("Adjustment Compute Encoder"),
    });

    {
        let mut compute_pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
            label: Some("Adjustment Compute Pass"),
            timestamp_writes: None,
        });
        compute_pass.set_pipeline(&pipeline.pipeline_cache);
        compute_pass.set_bind_group(0, &bind_group, &[]);
        compute_pass.dispatch_workgroups(width.div_ceil(8), height.div_ceil(8), 1);
    }

    // --- Copy output texture to readback buffer ---
    let unpadded_bytes_per_row = 4 * width;
    let align = wgpu::COPY_BYTES_PER_ROW_ALIGNMENT;
    let padded_bytes_per_row = ((unpadded_bytes_per_row + align - 1) / align) * align;
    let output_buffer_size = (padded_bytes_per_row * height) as u64;

    let readback_buffer = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("Adjustment Readback Buffer"),
        size: output_buffer_size,
        usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        mapped_at_creation: false,
    });

    encoder.copy_texture_to_buffer(
        wgpu::TexelCopyTextureInfo {
            texture: &output_texture,
            mip_level: 0,
            origin: wgpu::Origin3d::ZERO,
            aspect: wgpu::TextureAspect::All,
        },
        wgpu::TexelCopyBufferInfo {
            buffer: &readback_buffer,
            layout: wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(padded_bytes_per_row),
                rows_per_image: Some(height),
            },
        },
        texture_size,
    );

    queue.submit(Some(encoder.finish()));

    // --- Map and read back ---
    let buffer_slice = readback_buffer.slice(..);
    let (tx, rx) = std::sync::mpsc::channel();
    buffer_slice.map_async(wgpu::MapMode::Read, move |result| {
        let _ = tx.send(result);
    });

    device.poll(wgpu::PollType::Wait {
        submission_index: None,
        timeout: Some(std::time::Duration::from_secs(30)),
    })?;

    rx.recv()
        .context("Failed to receive GPU map result")?
        .context("GPU buffer map failed")?;

    let mapped = buffer_slice.get_mapped_range()?;
    let padded_data = mapped.to_vec();
    drop(mapped);
    readback_buffer.unmap();

    // Remove row padding if necessary
    if padded_bytes_per_row == unpadded_bytes_per_row {
        Ok(padded_data)
    } else {
        let mut result = Vec::with_capacity((unpadded_bytes_per_row * height) as usize);
        for chunk in padded_data.chunks(padded_bytes_per_row as usize) {
            result.extend_from_slice(&chunk[..unpadded_bytes_per_row as usize]);
        }
        Ok(result)
    }
}

// ---------------------------------------------------------------------------
// GpuPipelineHandle – thread-safe handle for Tauri state
// ---------------------------------------------------------------------------

pub struct GpuPipelineHandle {
    inner: Arc<std::sync::Mutex<Option<GpuPipeline>>>,
}

impl GpuPipelineHandle {
    /// Create a new empty handle.
    pub fn new() -> Self {
        Self {
            inner: Arc::new(std::sync::Mutex::new(None)),
        }
    }

    /// Lazily initialize the pipeline on first use, returning a locked guard.
    pub fn get_or_init(&self) -> Result<std::sync::MutexGuard<'_, Option<GpuPipeline>>> {
        let mut guard = self.inner.lock().unwrap();
        if guard.is_none() {
            let pipeline = GpuPipeline::init()?;
            *guard = Some(pipeline);
        }
        Ok(guard)
    }
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn gpu_apply_adjustments(
    image_data_base64: String,
    width: u32,
    height: u32,
    exposure: Option<f32>,
    contrast: Option<f32>,
    highlights: Option<f32>,
    shadows: Option<f32>,
    whites: Option<f32>,
    blacks: Option<f32>,
    saturation: Option<f32>,
    vibrance: Option<f32>,
    temperature: Option<f32>,
    tint: Option<f32>,
    sharpness: Option<f32>,
    vignette: Option<f32>,
    grain_amount: Option<f32>,
    haze: Option<f32>,
    clarity: Option<f32>,
    dehaze: Option<f32>,
) -> Result<String, String> {
    use base64::{Engine as _, engine::general_purpose};

    // Decode base64 image data
    let image_data = general_purpose::STANDARD
        .decode(&image_data_base64)
        .map_err(|e| format!("Failed to decode base64 image data: {}", e))?;

    // Build uniforms from options, using defaults for None
    let defaults = AdjustmentUniforms::default();
    let uniforms = AdjustmentUniforms {
        exposure: exposure.unwrap_or(defaults.exposure),
        contrast: contrast.unwrap_or(defaults.contrast),
        highlights: highlights.unwrap_or(defaults.highlights),
        shadows: shadows.unwrap_or(defaults.shadows),
        whites: whites.unwrap_or(defaults.whites),
        blacks: blacks.unwrap_or(defaults.blacks),
        saturation: saturation.unwrap_or(defaults.saturation),
        vibrance: vibrance.unwrap_or(defaults.vibrance),
        temperature: temperature.unwrap_or(defaults.temperature),
        tint: tint.unwrap_or(defaults.tint),
        sharpness: sharpness.unwrap_or(defaults.sharpness),
        vignette: vignette.unwrap_or(defaults.vignette),
        grain_amount: grain_amount.unwrap_or(defaults.grain_amount),
        haze: haze.unwrap_or(defaults.haze),
        clarity: clarity.unwrap_or(defaults.clarity),
        dehaze: dehaze.unwrap_or(defaults.dehaze),
    };

    // Try to get or init the GPU pipeline
    let handle = GpuPipelineHandle::new();
    let guard = match handle.get_or_init() {
        Ok(g) => g,
        Err(_) => {
            // If wgpu init fails, fall back to returning the original data unchanged
            return Ok(image_data_base64);
        }
    };

    let pipeline = match guard.as_ref() {
        Some(p) => p,
        None => return Ok(image_data_base64),
    };

    // Call apply_adjustments
    let result_data = apply_adjustments(pipeline, &image_data, width, height, uniforms)
        .map_err(|e| format!("GPU apply_adjustments failed: {}", e))?;

    // Encode result as base64 PNG
    // The result is raw RGBA8 pixels; encode as PNG using the image crate
    let img = image::RgbaImage::from_raw(width, height, result_data)
        .ok_or_else(|| "Failed to create image from GPU output".to_string())?;
    let dynamic = image::DynamicImage::ImageRgba8(img);
    let mut png_buf = std::io::Cursor::new(Vec::new());
    dynamic
        .write_to(&mut png_buf, image::ImageFormat::Png)
        .map_err(|e| format!("Failed to encode PNG: {}", e))?;

    Ok(general_purpose::STANDARD.encode(png_buf.into_inner()))
}
