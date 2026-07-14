struct CameraProfileUniform {
    tone_curve_shadows: f32,
    tone_curve_midtones: f32,
    tone_curve_highlights: f32,
    color_matrix_0: f32,
    color_matrix_1: f32,
    color_matrix_2: f32,
    color_matrix_3: f32,
    color_matrix_4: f32,
    color_matrix_5: f32,
    color_matrix_6: f32,
    color_matrix_7: f32,
    color_matrix_8: f32,
    saturation: f32,
    contrast: f32,
    sharpness: f32,
    noise_reduction: f32,
    _pad0: f32,
    _pad1: f32,
    _pad2: f32,
    _pad3: f32,
}

@group(0) @binding(0) var input_texture: texture_2d<f32>;
@group(0) @binding(1) var output_texture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> profile: CameraProfileUniform;

fn apply_tone_curve(x: f32) -> f32 {
    let shadows = profile.tone_curve_shadows;
    let midtones = profile.tone_curve_midtones;
    let highlights = profile.tone_curve_highlights;
    
    // S-curve: lift shadows, adjust midtones, compress highlights
    var y = x;
    if x < 0.5 {
        y = x * (1.0 + shadows * 2.0 * (1.0 - x * 2.0));
    } else {
        y = 1.0 - (1.0 - x) * (1.0 + highlights * 2.0 * (1.0 - (1.0 - x) * 2.0));
    }
    // Midtone adjustment
    y = y + midtones * 0.2 * (1.0 - abs(x - 0.5) * 2.0);
    return clamp(y, 0.0, 1.0);
}

fn apply_color_matrix(rgb: vec3<f32>) -> vec3<f32> {
    return vec3<f32>(
        profile.color_matrix_0 * rgb.r + profile.color_matrix_1 * rgb.g + profile.color_matrix_2 * rgb.b,
        profile.color_matrix_3 * rgb.r + profile.color_matrix_4 * rgb.g + profile.color_matrix_5 * rgb.b,
        profile.color_matrix_6 * rgb.r + profile.color_matrix_7 * rgb.g + profile.color_matrix_8 * rgb.b,
    );
}

fn apply_saturation(rgb: vec3<f32>) -> vec3<f32> {
    let luminance = dot(rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
    return mix(vec3<f32>(luminance), rgb, profile.saturation);
}

fn apply_contrast(rgb: vec3<f32>) -> vec3<f32> {
    let mid = 0.5;
    return (rgb - mid) * (1.0 + profile.contrast) + mid;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let dims = textureDimensions(input_texture);
    if id.x >= dims.x || id.y >= dims.y {
        return;
    }
    
    let tex_coord = vec2<f32>(f32(id.x), f32(id.y));
    var color = textureLoad(input_texture, vec2<i32>(i32(id.x), i32(id.y)), 0);
    
    // Apply color matrix
    color.rgb = apply_color_matrix(color.rgb);
    
    // Apply tone curve
    color.r = apply_tone_curve(color.r);
    color.g = apply_tone_curve(color.g);
    color.b = apply_tone_curve(color.b);
    
    // Apply contrast
    color.rgb = apply_contrast(color.rgb);
    
    // Apply saturation
    color.rgb = apply_saturation(color.rgb);
    
    // Clamp
    color.rgb = clamp(color.rgb, vec3<f32>(0.0), vec3<f32>(1.0));
    
    textureStore(output_texture, vec2<i32>(i32(id.x), i32(id.y)), color);
}