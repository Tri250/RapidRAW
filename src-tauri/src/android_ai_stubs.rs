//! Android AI 功能占位模块
//!
//! 由于 AI 模型推理依赖 ONNX Runtime 等大型原生库，在 Android 上暂不启用。
//! 本模块提供与桌面端完全一致的命令签名，返回友好的不可用提示，
//! 确保前端调用时不会触发 "command not found" 崩溃。

use serde::{Deserialize, Serialize};

// ============================================================================
// 类型定义（与 ai_processing.rs 保持序列化兼容）
// ============================================================================

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct AiSubjectMaskParameters {
    pub start_x: f64,
    pub start_y: f64,
    pub end_x: f64,
    pub end_y: f64,
    #[serde(default)]
    pub mask_data_base64: Option<String>,
    #[serde(default)]
    pub rotation: Option<f32>,
    #[serde(default)]
    pub flip_horizontal: Option<bool>,
    #[serde(default)]
    pub flip_vertical: Option<bool>,
    #[serde(default)]
    pub orientation_steps: Option<u8>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct AiSkyMaskParameters {
    #[serde(default)]
    pub mask_data_base64: Option<String>,
    #[serde(default)]
    pub rotation: Option<f32>,
    #[serde(default)]
    pub flip_horizontal: Option<bool>,
    #[serde(default)]
    pub flip_vertical: Option<bool>,
    #[serde(default)]
    pub orientation_steps: Option<u8>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct AiForegroundMaskParameters {
    #[serde(default)]
    pub mask_data_base64: Option<String>,
    #[serde(default)]
    pub rotation: Option<f32>,
    #[serde(default)]
    pub flip_horizontal: Option<bool>,
    #[serde(default)]
    pub flip_vertical: Option<bool>,
    #[serde(default)]
    pub orientation_steps: Option<u8>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct AiDepthMaskParameters {
    #[serde(default)]
    pub min_depth: f32,
    #[serde(default)]
    pub max_depth: f32,
    #[serde(default)]
    pub min_fade: f32,
    #[serde(default)]
    pub max_fade: f32,
    #[serde(default)]
    pub feather: f32,
    #[serde(default)]
    pub mask_data_base64: Option<String>,
    #[serde(default)]
    pub rotation: Option<f32>,
    #[serde(default)]
    pub flip_horizontal: Option<bool>,
    #[serde(default)]
    pub flip_vertical: Option<bool>,
    #[serde(default)]
    pub orientation_steps: Option<u8>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct AiEnhanceResult {
    pub success: bool,
    pub output_path: Option<String>,
    pub processing_time_ms: u64,
    pub message: String,
}

const ANDROID_AI_UNAVAILABLE: &str = "AI features are not available on Android in this release.";

// ============================================================================
// AI Masking Stubs
// ============================================================================

#[tauri::command]
pub async fn generate_ai_foreground_mask(
    _js_adjustments: serde_json::Value,
    _rotation: f32,
    _flip_horizontal: bool,
    _flip_vertical: bool,
    _orientation_steps: u8,
) -> Result<AiForegroundMaskParameters, String> {
    Err(ANDROID_AI_UNAVAILABLE.to_string())
}

#[tauri::command]
pub async fn generate_ai_sky_mask(
    _js_adjustments: serde_json::Value,
    _rotation: f32,
    _flip_horizontal: bool,
    _flip_vertical: bool,
    _orientation_steps: u8,
) -> Result<AiSkyMaskParameters, String> {
    Err(ANDROID_AI_UNAVAILABLE.to_string())
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn generate_ai_depth_mask(
    _js_adjustments: serde_json::Value,
    _path: String,
    _min_depth: f32,
    _max_depth: f32,
    _min_fade: f32,
    _max_fade: f32,
    _feather: f32,
    _rotation: f32,
    _flip_horizontal: bool,
    _flip_vertical: bool,
    _orientation_steps: u8,
) -> Result<AiDepthMaskParameters, String> {
    Err(ANDROID_AI_UNAVAILABLE.to_string())
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn generate_ai_subject_mask(
    _js_adjustments: serde_json::Value,
    _path: String,
    _start_point: (f64, f64),
    _end_point: (f64, f64),
    _rotation: f32,
    _flip_horizontal: bool,
    _flip_vertical: bool,
    _orientation_steps: u8,
) -> Result<AiSubjectMaskParameters, String> {
    Err(ANDROID_AI_UNAVAILABLE.to_string())
}

#[tauri::command]
pub async fn precompute_ai_subject_mask(
    _js_adjustments: serde_json::Value,
    _path: String,
) -> Result<(), String> {
    Err(ANDROID_AI_UNAVAILABLE.to_string())
}

// ============================================================================
// AI Connector Stubs
// ============================================================================

#[tauri::command]
pub async fn check_ai_connector_status(_app_handle: tauri::AppHandle) {
    use tauri::Emitter;
    let _ = _app_handle.emit(
        "ai-connector-status-update",
        serde_json::json!({ "connected": false, "reason": "AI connector is not available on Android." }),
    );
}

#[tauri::command]
pub async fn test_ai_connector_connection(_address: String) -> Result<(), String> {
    Err(ANDROID_AI_UNAVAILABLE.to_string())
}

// ============================================================================
// AI Enhancement Stubs
// ============================================================================

#[tauri::command]
pub fn apply_ai_enhance(_image_base64: String, _config_json: String) -> Result<String, String> {
    Err(ANDROID_AI_UNAVAILABLE.to_string())
}

#[tauri::command]
pub fn apply_ai_denoise(_image_base64: String, _strength: f32) -> Result<String, String> {
    Err(ANDROID_AI_UNAVAILABLE.to_string())
}

#[tauri::command]
pub fn apply_ai_upscale(_image_base64: String, _factor: u32) -> Result<String, String> {
    Err(ANDROID_AI_UNAVAILABLE.to_string())
}

// ============================================================================
// Inpainting Stubs
// ============================================================================

#[tauri::command]
pub async fn invoke_generative_replace_with_mask_def(
    _path: String,
    _patch_definition: serde_json::Value,
    _current_adjustments: serde_json::Value,
    _use_fast_inpaint: bool,
    _token: Option<String>,
) -> Result<String, String> {
    Err("Generative replace is not available on Android in this release.".to_string())
}

#[tauri::command]
pub async fn generate_manual_cleanup_patch(
    _patch_definition: serde_json::Value,
    _current_adjustments: serde_json::Value,
    _source_point: (f64, f64),
) -> Result<String, String> {
    Err("Manual cleanup patch generation is not available on Android in this release.".to_string())
}

// ============================================================================
// Tagging Stubs
// ============================================================================

#[tauri::command]
pub async fn start_background_indexing(
    _folder_path: String,
) -> Result<(), String> {
    Err("Background indexing is not available on Android.".to_string())
}

#[tauri::command]
pub fn clear_ai_tags(_root_path: String) -> Result<usize, String> {
    Err("AI tag clearing is not available on Android.".to_string())
}
