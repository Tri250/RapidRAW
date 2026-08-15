// WIP: some GPU pipeline helper functions are implemented but not yet
// wired into all call sites. Remove this allow once integration is complete.
#![allow(dead_code)]

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

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

    // Safety: replace any NaN/Inf with zero before processing
    if isnan(rgb.r) || isnan(rgb.g) || isnan(rgb.b) {
        rgb = vec3<f32>(0.0);
    }
    rgb = clamp(rgb, vec3<f32>(-65504.0), vec3<f32>(65504.0));

    // --- Exposure: multiply by 2^exposure ---
    let exp_factor = pow(2.0, adjustments.exposure);
    rgb = rgb * exp_factor;

    // --- Contrast: (value - 0.5) * contrast + 0.5 ---
    let contrast_factor = 1.0 + adjustments.contrast;
    rgb = (rgb - 0.5) * contrast_factor + 0.5;

    // --- Highlights / Shadows (tone-range masks) ---
    let luminance = max(dot(rgb, vec3<f32>(0.2126, 0.7152, 0.0722)), 0.0);

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
    let temp_shift = adjustments.temperature;
    let tint_shift = adjustments.tint;
    rgb.r = rgb.r * (1.0 + temp_shift * 0.1);
    rgb.b = rgb.b * (1.0 - temp_shift * 0.1);
    rgb.g = rgb.g * (1.0 + tint_shift * 0.05);

    // --- Saturation / Vibrance (HSL-based) ---
    let hsl = rgb_to_hsl(rgb);
    var new_sat = hsl.g;
    new_sat = new_sat + adjustments.vibrance * (1.0 - new_sat);
    new_sat = new_sat + adjustments.saturation;
    new_sat = clamp(new_sat, 0.0, 1.0);
    rgb = hsl_to_rgb(vec3<f32>(hsl.r, new_sat, hsl.b));

    // --- Dehaze / Haze (with safe division) ---
    let dehaze_factor = 1.0 + adjustments.dehaze;
    let haze_factor = max(1.0 + adjustments.haze, 0.01);
    rgb = (rgb - 0.5) * (dehaze_factor / haze_factor) + 0.5;

    // --- Clarity: local contrast boost (approximated globally) ---
    let clarity_boost = 1.0 + adjustments.clarity * 0.1;
    let lum_dot = max(dot(rgb, vec3<f32>(0.2126, 0.7152, 0.0722)), 0.0);
    rgb = mix(vec3<f32>(lum_dot), rgb, clarity_boost);

    // --- Sharpness (approximate: boost local contrast) ---
    let sharp_boost = 1.0 + adjustments.sharpness * 0.3;
    let lum2 = max(dot(rgb, vec3<f32>(0.2126, 0.7152, 0.0722)), 0.0);
    rgb = mix(vec3<f32>(lum2), rgb, sharp_boost);

    // --- Vignette: radial darkening ---
    let uv_x = (f32(x) + 0.5) / max(f32(params.width), 1.0);
    let uv_y = (f32(y) + 0.5) / max(f32(params.height), 1.0);
    let dist = distance(vec2<f32>(uv_x, uv_y), vec2<f32>(0.5, 0.5));
    let vig = 1.0 - adjustments.vignette * smoothstep(0.3, 0.9, dist);
    rgb = rgb * vig;

    // --- Grain (pseudo-random using pixel position) ---
    if adjustments.grain_amount > 0.0 {
        let seed = f32(x) * 127.1 + f32(y) * 311.7;
        let noise = fract(sin(seed) * 43758.5453123) - 0.5;
        rgb = rgb + noise * adjustments.grain_amount * 0.15;
    }

    // Final NaN/Inf guard: replace any non-finite values with mid-gray
    if isnan(rgb.r) || isnan(rgb.g) || isnan(rgb.b) {
        rgb = vec3<f32>(0.5);
    }

    // Clamp and write
    rgb = clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0));
    textureStore(output_image, vec2<i32>(i32(x), i32(y)), vec4<f32>(rgb, clamp(color.a, 0.0, 1.0)));
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

const MAX_TEXTURE_CACHE_SIZE: usize = 4;
const MAX_TOTAL_TEXTURE_CACHE_SIZE: usize = 16;
/// Hard cap on total memory held by the pooled textures (RGBA8 = 4 bytes/px).
/// Guards against OOM when processing very large images by evicting the oldest
/// entries once the combined footprint exceeds this budget.
const MAX_TOTAL_TEXTURE_CACHE_BYTES: u64 = 512 * 1024 * 1024; // 512 MB

struct TextureCacheEntry {
    texture: wgpu::Texture,
    view: wgpu::TextureView,
    size_bytes: u64,
}

// wgpu resources are designed to be shared across threads.
unsafe impl Send for TextureCacheEntry {}
unsafe impl Sync for TextureCacheEntry {}

/// RAII guard that releases a pooled texture back to the cache on drop.
struct TextureGuard<'a> {
    entry: Option<TextureCacheEntry>,
    pipeline: &'a GpuPipeline,
}

impl<'a> TextureGuard<'a> {
    fn new(pipeline: &'a GpuPipeline, device: &wgpu::Device, width: u32, height: u32) -> Self {
        Self {
            entry: Some(pipeline.acquire_texture(device, width, height)),
            pipeline,
        }
    }

    fn texture(&self) -> &wgpu::Texture {
        &self.entry.as_ref().unwrap().texture
    }

    fn view(&self) -> &wgpu::TextureView {
        &self.entry.as_ref().unwrap().view
    }
}

impl<'a> Drop for TextureGuard<'a> {
    fn drop(&mut self) {
        if let Some(entry) = self.entry.take() {
            self.pipeline.release_texture(entry);
        }
    }
}

pub struct GpuPipeline {
    device: Arc<wgpu::Device>,
    queue: Arc<wgpu::Queue>,
    bind_group_layout: wgpu::BindGroupLayout,
    pipeline_cache: wgpu::ComputePipeline,
    texture_cache: Mutex<HashMap<(u32, u32), Vec<TextureCacheEntry>>>,
    total_cached_textures: Mutex<usize>,
    total_cached_bytes: Mutex<u64>,
}

impl Drop for GpuPipeline {
    fn drop(&mut self) {
        if let Ok(mut cache) = self.texture_cache.lock() {
            cache.clear();
        }
        if let Ok(mut count) = self.total_cached_textures.lock() {
            *count = 0;
        }
        if let Ok(mut bytes) = self.total_cached_bytes.lock() {
            *bytes = 0;
        }
    }
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
            texture_cache: Mutex::new(HashMap::new()),
            total_cached_textures: Mutex::new(0),
            total_cached_bytes: Mutex::new(0),
        })
    }

    /// Get a pooled output texture or create a new one if none available.
    fn acquire_texture(&self, device: &wgpu::Device, width: u32, height: u32) -> TextureCacheEntry {
        let key = (width, height);
        {
            if let Ok(mut cache) = self.texture_cache.lock() {
                if let Some(entries) = cache.get_mut(&key) {
                    if let Some(entry) = entries.pop() {
                        if let Ok(mut count) = self.total_cached_textures.lock() {
                            *count = count.saturating_sub(1);
                        }
                        if let Ok(mut bytes) = self.total_cached_bytes.lock() {
                            *bytes = bytes.saturating_sub(entry.size_bytes);
                        }
                        return entry;
                    }
                }
            }
        }

        let texture_size = (width as u64)
            .checked_mul(height as u64)
            .and_then(|v| v.checked_mul(4))
            .unwrap_or(0);

        let texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("Cached Output Texture"),
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::STORAGE_BINDING | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        });
        let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
        TextureCacheEntry {
            texture,
            view,
            size_bytes: texture_size,
        }
    }

    /// Return a texture to the cache for reuse.
    fn release_texture(&self, entry: TextureCacheEntry) {
        let key = (entry.texture.width(), entry.texture.height());

        let (total_count, total_bytes) = (
            self.total_cached_textures.lock().map(|c| *c).unwrap_or(0),
            self.total_cached_bytes.lock().map(|b| *b).unwrap_or(0),
        );

        // Enforce both the entry-count cap and the total byte budget. We must
        // free room for the incoming texture before inserting it.
        let incoming_bytes = entry.size_bytes;
        let would_exceed_bytes =
            total_bytes.saturating_add(incoming_bytes) > MAX_TOTAL_TEXTURE_CACHE_BYTES;
        let at_count_cap = total_count >= MAX_TOTAL_TEXTURE_CACHE_SIZE;

        if at_count_cap || would_exceed_bytes {
            // Evict cached entries (oldest first) until both limits are satisfied.
            if let Ok(mut cache) = self.texture_cache.lock() {
                let mut evicted_bytes = 0u64;
                let mut evicted_count = 0usize;
                let keys: Vec<(u32, u32)> = cache.keys().cloned().collect();
                'outer: for k in keys {
                    if let Some(entries) = cache.get_mut(&k) {
                        while entries.pop().is_some() {
                            evicted_count += 1;
                        }
                    }
                    // Recompute the byte total by scanning the cache.
                    let mut cur_bytes = 0u64;
                    for entries in cache.values() {
                        for e in entries {
                            cur_bytes = cur_bytes.saturating_add(e.size_bytes);
                        }
                    }
                    let cur_count = total_count.saturating_sub(evicted_count);
                    if cur_count < MAX_TOTAL_TEXTURE_CACHE_SIZE
                        && cur_bytes.saturating_add(incoming_bytes) <= MAX_TOTAL_TEXTURE_CACHE_BYTES
                    {
                        break 'outer;
                    }
                }
                evicted_bytes = total_bytes.saturating_sub({
                    let mut b = 0u64;
                    for entries in cache.values() {
                        for e in entries {
                            b = b.saturating_add(e.size_bytes);
                        }
                    }
                    b
                });
                if let Ok(mut count) = self.total_cached_textures.lock() {
                    *count = count.saturating_sub(evicted_count);
                }
                if let Ok(mut bytes) = self.total_cached_bytes.lock() {
                    *bytes = bytes.saturating_sub(evicted_bytes);
                }
            }
        }

        // Re-check the byte budget after eviction; if the incoming texture alone
        // exceeds the budget, drop it entirely rather than caching it.
        let (new_count, new_bytes) = (
            self.total_cached_textures.lock().map(|c| *c).unwrap_or(0),
            self.total_cached_bytes.lock().map(|b| *b).unwrap_or(0),
        );
        if new_bytes.saturating_add(incoming_bytes) > MAX_TOTAL_TEXTURE_CACHE_BYTES {
            return;
        }

        if let Ok(mut cache) = self.texture_cache.lock() {
            let entries = cache.entry(key).or_insert_with(Vec::new);
            if entries.len() < MAX_TEXTURE_CACHE_SIZE && new_count < MAX_TOTAL_TEXTURE_CACHE_SIZE {
                entries.push(entry);
                if let Ok(mut count) = self.total_cached_textures.lock() {
                    *count = count.saturating_add(1);
                }
                if let Ok(mut bytes) = self.total_cached_bytes.lock() {
                    *bytes = bytes.saturating_add(incoming_bytes);
                }
            }
        }
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
    let expected_len = (width as usize)
        .checked_mul(height as usize)
        .and_then(|v| v.checked_mul(4))
        .ok_or_else(|| anyhow::anyhow!("Image dimensions overflow: {}x{}", width, height))?;

    if image_data.len() != expected_len {
        return Err(anyhow::anyhow!(
            "Image data length mismatch: expected {} bytes for {}x{}, got {} bytes",
            expected_len,
            width,
            height,
            image_data.len()
        ));
    }

    let device = pipeline.device.clone();
    let queue = pipeline.queue.clone();

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

    // --- Acquire pooled output storage texture (RAII: auto-release on scope exit) ---
    let output_guard = TextureGuard::new(pipeline, device, width, height);
    let output_view = output_guard.view();

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
                resource: wgpu::BindingResource::TextureView(output_view),
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
            texture: output_guard.texture(),
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

    // Texture is automatically released back to cache when output_guard is dropped.

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

use once_cell::sync::Lazy;

/// Global singleton handle so the GPU pipeline is initialized once and reused
/// across all `gpu_apply_adjustments` calls.
static GPU_PIPELINE_HANDLE: Lazy<GpuPipelineHandle> = Lazy::new(|| GpuPipelineHandle::new());

/// Returns true if the global GPU pipeline was successfully initialized.
/// On failure, the error is cached so subsequent probes don't re-attempt the
/// expensive GPU init sequence on every call (which could take seconds on
/// misbehaving drivers or headless VMs).
pub fn is_gpu_pipeline_ready() -> bool {
    GPU_PIPELINE_HANDLE.is_ready()
}

/// Tauri command: probe whether the lightweight GPU adjustment pipeline is
/// available on this machine (adapter + device successfully initialized).
/// Lets the frontend decide whether to expose GPU-accelerated quick-adjust
/// entry points (e.g. ACES color science tools) without triggering a lazy
/// init failure on every call.
///
/// `GpuPipeline::init` uses `pollster::block_on` internally to drive wgpu's
/// async adapter/device requests. Running that on the UI/main thread freezes
/// the webview and, on Windows (DX12 backend), can deadlock the message loop
/// and crash the app when the settings panel opens. We therefore run the
/// probe on a blocking worker thread and `await` the result so the main
/// thread stays responsive. On Android, wgpu init is disabled entirely
/// (short-circuit to `false`) to avoid ANR.
#[tauri::command]
pub async fn is_gpu_adjustment_pipeline_ready() -> bool {
    #[cfg(target_os = "android")]
    {
        false
    }
    #[cfg(not(target_os = "android"))]
    {
        tokio::task::spawn_blocking(is_gpu_pipeline_ready)
            .await
            .unwrap_or(false)
    }
}

/// Tauri command: clear any cached failure state and force a fresh GPU init
/// probe on the next call. Exposed as a "重新检测" (re-test) entry point so
/// users can retry after a driver update or dock/undock without restarting.
///
/// On Android, the GPU pipeline is disabled, so this is a no-op.
#[tauri::command]
pub async fn reset_gpu_adjustment_pipeline() {
    #[cfg(not(target_os = "android"))]
    {
        let _ = tokio::task::spawn_blocking(|| GPU_PIPELINE_HANDLE.reset()).await;
    }
}

/// Three-state pipeline cache:
/// - `Uninit`: never attempted
/// - `Ready(pipeline)`: successfully initialized
/// - `Failed(error)`: initialization failed; cached to avoid retry storms
pub enum PipelineState {
    Uninit,
    Ready(GpuPipeline),
    Failed(String),
}

pub struct GpuPipelineHandle {
    inner: Arc<std::sync::Mutex<PipelineState>>,
}

impl GpuPipelineHandle {
    /// Create a new empty handle.
    pub fn new() -> Self {
        Self {
            inner: Arc::new(std::sync::Mutex::new(PipelineState::Uninit)),
        }
    }

    /// Lazily initialize the pipeline on first use, returning a locked guard.
    /// Failures are cached so the expensive init sequence only runs once.
    pub fn get_or_init(&self) -> Result<std::sync::MutexGuard<'_, PipelineState>> {
        let mut guard = self.inner.lock().unwrap_or_else(|e| {
            log::warn!("Mutex poisoned");
            e.into_inner()
        });
        if matches!(*guard, PipelineState::Uninit) {
            match GpuPipeline::init() {
                Ok(p) => *guard = PipelineState::Ready(p),
                Err(e) => {
                    let msg = format!("{:?}", e);
                    log::warn!("GPU pipeline init failed: {}", msg);
                    *guard = PipelineState::Failed(msg);
                }
            }
        }
        Ok(guard)
    }

    /// Quick readiness check without acquiring the full guard semantics.
    /// Triggers lazy init on first call, then returns cached state.
    pub fn is_ready(&self) -> bool {
        match self.get_or_init() {
            Ok(guard) => matches!(*guard, PipelineState::Ready(_)),
            Err(_) => false,
        }
    }

    /// Reset to uninitialized state, clearing any cached failure. The next
    /// `get_or_init` / `is_ready` call will re-attempt initialization.
    pub fn reset(&self) {
        let mut guard = self.inner.lock().unwrap_or_else(|e| {
            log::warn!("Mutex poisoned");
            e.into_inner()
        });
        *guard = PipelineState::Uninit;
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
    // Android: GPU adjustment pipeline is disabled to avoid ANR from wgpu
    // init on the main thread. Return the original image unchanged so the
    // caller can gracefully degrade.
    #[cfg(target_os = "android")]
    {
        return Ok(image_data_base64);
    }

    #[cfg(not(target_os = "android"))]
    {
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

        // Try to get or init the GPU pipeline from the global singleton.
        // get_or_init never returns Err (failures are cached as Failed state),
        // but we still need to inspect the cached state to decide what to do.
        let guard = match GPU_PIPELINE_HANDLE.get_or_init() {
            Ok(g) => g,
            Err(e) => {
                log::warn!(
                    "GPU pipeline initialization failed, returning original image: {}",
                    e
                );
                return Ok(image_data_base64);
            }
        };

        let pipeline = match &*guard {
            PipelineState::Ready(p) => p,
            PipelineState::Failed(msg) => {
                log::warn!("GPU pipeline unavailable (cached failure): {}", msg);
                return Err(format!("GPU pipeline unavailable: {}", msg));
            }
            PipelineState::Uninit => {
                // Should not happen — get_or_init transitions out of Uninit.
                return Err("GPU pipeline not initialized".to_string());
            }
        };

        // Call apply_adjustments — if GPU fails, return error so the caller
        // can fall back to the CPU rendering path instead of silently returning
        // the unadjusted original image.
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
    } // #[cfg(not(target_os = "android"))]
}
