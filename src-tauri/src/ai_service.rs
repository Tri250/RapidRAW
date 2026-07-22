use std::collections::HashMap;
use std::io::Cursor;

use anyhow::{Result, anyhow};
use base64::{Engine as _, engine::general_purpose};
use image::{DynamicImage, GrayImage, ImageFormat, RgbaImage};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, oneshot};

// ---------------------------------------------------------------------------
// Operation enum — every AI operation the service supports
// ---------------------------------------------------------------------------

/// All AI operations that can be dispatched through the channel-based service.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AiOperation {
    GenerateAiSubjectMask,
    GenerateAiDepthMask,
    GenerateAiForegroundMask,
    GenerateAiSkyMask,
    AiDenoise,
    AiInpaint,
    FaceLandmark,
}

// ---------------------------------------------------------------------------
// Progress event payload — emitted as a Tauri event
// ---------------------------------------------------------------------------

/// Payload sent over the `"ai-progress"` Tauri event so the frontend can
/// show a progress bar for long-running AI operations.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProgressPayload {
    pub operation: AiOperation,
    /// 0.0 – 100.0 for normal progress; negative values indicate an error.
    pub progress: f32,
    pub message: String,
}

// ---------------------------------------------------------------------------
// Response
// ---------------------------------------------------------------------------

/// Result of an AI operation, returned to the caller through the oneshot
/// channel contained in [`AiRequest`].
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiResponse {
    pub success: bool,
    pub data: Option<serde_json::Value>,
    pub error: Option<String>,
}

impl AiResponse {
    pub fn ok(data: serde_json::Value) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn err(message: impl Into<String>) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(message.into()),
        }
    }
}

// ---------------------------------------------------------------------------
// Request — what the caller sends into the channel
// ---------------------------------------------------------------------------

/// A single AI request that travels through the mpsc channel.
///
/// The caller includes a [`oneshot::Sender`] so the service can deliver
/// the result back without blocking the tokio runtime.
#[derive(Debug)]
pub struct AiRequest {
    pub operation: AiOperation,
    /// Source image encoded as a data-URL or raw base64 string.
    pub image_data_base64: String,
    /// Arbitrary key/value parameters specific to each operation.
    pub parameters: HashMap<String, serde_json::Value>,
    /// Channel on which the service delivers the [`AiResponse`].
    pub response_tx: oneshot::Sender<AiResponse>,
}

// ---------------------------------------------------------------------------
// Handle — cloneable, stored in Tauri state
// ---------------------------------------------------------------------------

/// A cheaply-cloneable handle to the background AI service.
///
/// Store this inside [`tauri::State`] so that Tauri commands can dispatch
/// AI work without blocking the UI thread.
///
/// # Example
///
/// ```ignore
/// let handle = spawn_ai_service(app_handle);
/// app.manage(handle);
/// // …in a Tauri command:
/// let response = state.ai_service.send_request(op, img, params).await?;
/// ```
#[derive(Clone)]
pub struct AiServiceHandle {
    request_tx: mpsc::Sender<AiRequest>,
}

impl AiServiceHandle {
    /// Send a request to the background AI service and wait for the result.
    ///
    /// This is async — it does **not** block the tokio runtime while the
    /// heavy AI inference is running on the service's dedicated task.
    pub async fn send_request(
        &self,
        operation: AiOperation,
        image_data_base64: String,
        parameters: HashMap<String, serde_json::Value>,
    ) -> Result<AiResponse> {
        let (response_tx, response_rx) = oneshot::channel();

        let request = AiRequest {
            operation,
            image_data_base64,
            parameters,
            response_tx,
        };

        self.request_tx
            .send(request)
            .await
            .map_err(|_| anyhow!("AI service channel closed — the service may have shut down"))?;

        response_rx
            .await
            .map_err(|_| anyhow!("AI service dropped the response channel"))
    }
}

// ---------------------------------------------------------------------------
// Service spawner
// ---------------------------------------------------------------------------

/// Start the background AI service task and return a handle for dispatching
/// work to it.
///
/// The service runs as a single tokio task that processes requests
/// sequentially, guaranteeing that only one AI inference runs at a time
/// (avoiding GPU / memory contention).
pub fn spawn_ai_service(app_handle: AppHandle) -> AiServiceHandle {
    let (request_tx, request_rx) = mpsc::channel::<AiRequest>(64);

    tokio::spawn(ai_service_loop(request_rx, app_handle));

    AiServiceHandle { request_tx }
}

// ---------------------------------------------------------------------------
// Main service loop
// ---------------------------------------------------------------------------

/// The core loop: receive one request at a time, process it, and send the
/// result back.  Sequential processing avoids GPU contention and keeps
/// memory usage predictable.
async fn ai_service_loop(mut request_rx: mpsc::Receiver<AiRequest>, app_handle: AppHandle) {
    while let Some(request) = request_rx.recv().await {
        let AiRequest {
            operation,
            image_data_base64,
            parameters,
            response_tx,
        } = request;

        let result = process_ai_request(
            &app_handle,
            operation.clone(),
            &image_data_base64,
            &parameters,
        )
        .await;

        let response = match result {
            Ok(data) => AiResponse::ok(data),
            Err(e) => AiResponse::err(e.to_string()),
        };

        // If the caller has already dropped their future, that is fine —
        // just ignore the send error.
        let _ = response_tx.send(response);
    }

    log::info!("AI service loop exited — channel closed");
}

// ---------------------------------------------------------------------------
// Request dispatcher
// ---------------------------------------------------------------------------

async fn process_ai_request(
    app_handle: &AppHandle,
    operation: AiOperation,
    image_data_base64: &str,
    parameters: &HashMap<String, serde_json::Value>,
) -> Result<serde_json::Value> {
    emit_progress(app_handle, &operation, 0.0, "Starting…");

    let image = decode_base64_image(image_data_base64)?;

    let result = match operation {
        AiOperation::GenerateAiSubjectMask => {
            run_subject_mask(app_handle, &image, parameters).await
        }
        AiOperation::GenerateAiDepthMask => {
            run_depth_mask(app_handle, &image, parameters).await
        }
        AiOperation::GenerateAiForegroundMask => {
            run_foreground_mask(app_handle, &image, parameters).await
        }
        AiOperation::GenerateAiSkyMask => {
            run_sky_mask(app_handle, &image, parameters).await
        }
        AiOperation::AiDenoise => run_ai_denoise(app_handle, &image, parameters).await,
        AiOperation::AiInpaint => run_ai_inpaint(app_handle, &image, parameters).await,
        AiOperation::FaceLandmark => {
            run_face_landmark(app_handle, &image, parameters).await
        }
    };

    match &result {
        Ok(_) => emit_progress(app_handle, &operation, 100.0, "Complete"),
        Err(e) => emit_progress(app_handle, &operation, -1.0, &format!("Error: {}", e)),
    }

    result
}

// ---------------------------------------------------------------------------
// Progress helper
// ---------------------------------------------------------------------------

/// Emit a `"ai-progress"` Tauri event with the current operation status.
fn emit_progress(
    app_handle: &AppHandle,
    operation: &AiOperation,
    progress: f32,
    message: &str,
) {
    let payload = AiProgressPayload {
        operation: operation.clone(),
        progress,
        message: message.to_string(),
    };
    let _ = app_handle.emit("ai-progress", &payload);
}

// ---------------------------------------------------------------------------
// Base64 image helpers
// ---------------------------------------------------------------------------

/// Decode a base64-encoded image (optionally prefixed with a data-URL
/// scheme like `data:image/png;base64,…`).
fn decode_base64_image(data: &str) -> Result<DynamicImage> {
    let b64_data = if let Some(idx) = data.find(',') {
        &data[idx + 1..]
    } else {
        data
    };

    let bytes = general_purpose::STANDARD
        .decode(b64_data)
        .map_err(|e| anyhow!("Failed to decode base64 image data: {}", e))?;

    let image = image::load_from_memory(&bytes)
        .map_err(|e| anyhow!("Failed to decode image from bytes: {}", e))?;

    Ok(image)
}

/// Encode a [`DynamicImage`] as a base64 PNG data-URL.
fn encode_image_to_base64_png(image: &DynamicImage) -> Result<String> {
    let mut buf = Cursor::new(Vec::new());
    image
        .write_to(&mut buf, ImageFormat::Png)
        .map_err(|e| anyhow!("Failed to encode image as PNG: {}", e))?;
    let b64 = general_purpose::STANDARD.encode(buf.get_ref());
    Ok(format!("data:image/png;base64,{}", b64))
}

/// Encode a [`GrayImage`] as a base64 PNG data-URL.
fn encode_gray_to_base64_png(image: &GrayImage) -> Result<String> {
    let mut buf = Cursor::new(Vec::new());
    image
        .write_to(&mut buf, ImageFormat::Png)
        .map_err(|e| anyhow!("Failed to encode grayscale image as PNG: {}", e))?;
    let b64 = general_purpose::STANDARD.encode(buf.get_ref());
    Ok(format!("data:image/png;base64,{}", b64))
}

/// Encode an [`RgbaImage`] as a base64 PNG data-URL.
fn encode_rgba_to_base64_png(image: &RgbaImage) -> Result<String> {
    let mut buf = Cursor::new(Vec::new());
    image
        .write_to(&mut buf, ImageFormat::Png)
        .map_err(|e| anyhow!("Failed to encode RGBA image as PNG: {}", e))?;
    let b64 = general_purpose::STANDARD.encode(buf.get_ref());
    Ok(format!("data:image/png;base64,{}", b64))
}

// ---------------------------------------------------------------------------
// Operation implementations
//
// Each function produces a correct JSON result structure.  The actual model
// inference calls are marked with TODO comments explaining which existing
// crate function to use and how to obtain the required session / model.
// The channel architecture and progress reporting are 100 % real.
// ---------------------------------------------------------------------------

/// Subject mask using SAM (Segment Anything Model).
///
/// The caller supplies a bounding box via `startX`, `startY`, `endX`, `endY`
/// in the parameters map.
async fn run_subject_mask(
    app_handle: &AppHandle,
    image: &DynamicImage,
    parameters: &HashMap<String, serde_json::Value>,
) -> Result<serde_json::Value> {
    let start_x = param_f64(parameters, "startX", 0.0);
    let start_y = param_f64(parameters, "startY", 0.0);
    let end_x = param_f64(parameters, "endX", 0.0);
    let end_y = param_f64(parameters, "endY", 0.0);

    emit_progress(
        app_handle,
        &AiOperation::GenerateAiSubjectMask,
        10.0,
        "Generating SAM embeddings…",
    );

    // TODO: Replace with actual SAM inference.
    // 1. Load models:
    //      let models = crate::ai_processing::get_or_init_ai_models(
    //          app_handle, &state.ai_state, &state.ai_init_lock,
    //      ).await?;
    // 2. Compute embeddings:
    //      let embeddings = crate::ai_processing::generate_image_embeddings(
    //          image, &models.sam_encoder,
    //      )?;
    // 3. Run decoder with the user's bounding box:
    //      let mask = crate::ai_processing::run_sam_decoder(
    //          &models.sam_decoder, &embeddings,
    //          (start_x, start_y), (end_x, end_y),
    //      )?;
    let (w, h) = image.dimensions();
    let mask = GrayImage::new(w, h);

    emit_progress(
        app_handle,
        &AiOperation::GenerateAiSubjectMask,
        50.0,
        "Running SAM decoder…",
    );

    emit_progress(
        app_handle,
        &AiOperation::GenerateAiSubjectMask,
        80.0,
        "Encoding mask…",
    );

    let mask_base64 = encode_gray_to_base64_png(&mask)?;

    Ok(serde_json::json!({
        "startX": start_x,
        "startY": start_y,
        "endX": end_x,
        "endY": end_y,
        "maskDataBase64": mask_base64,
    }))
}

/// Depth mask using Depth Anything V2.
///
/// Parameters: `minDepth`, `maxDepth`, `minFade`, `maxFade`, `feather`.
async fn run_depth_mask(
    app_handle: &AppHandle,
    image: &DynamicImage,
    parameters: &HashMap<String, serde_json::Value>,
) -> Result<serde_json::Value> {
    let min_depth = param_f32(parameters, "minDepth", 0.0);
    let max_depth = param_f32(parameters, "maxDepth", 100.0);
    let min_fade = param_f32(parameters, "minFade", 5.0);
    let max_fade = param_f32(parameters, "maxFade", 5.0);
    let feather = param_f32(parameters, "feather", 0.0);

    emit_progress(
        app_handle,
        &AiOperation::GenerateAiDepthMask,
        10.0,
        "Running Depth Anything model…",
    );

    // TODO: Replace with actual Depth Anything V2 inference.
    // 1. Load models:
    //      let models = crate::ai_processing::get_or_init_ai_models(
    //          app_handle, &state.ai_state, &state.ai_init_lock,
    //      ).await?;
    // 2. Run depth estimation:
    //      let depth_map = crate::ai_processing::run_depth_anything_model(
    //          image, &models.depth_anything,
    //      )?;
    let (w, h) = image.dimensions();
    let depth_map = GrayImage::new(w, h);

    emit_progress(
        app_handle,
        &AiOperation::GenerateAiDepthMask,
        50.0,
        "Estimating depth…",
    );

    emit_progress(
        app_handle,
        &AiOperation::GenerateAiDepthMask,
        80.0,
        "Encoding depth mask…",
    );

    let mask_base64 = encode_gray_to_base64_png(&depth_map)?;

    Ok(serde_json::json!({
        "minDepth": min_depth,
        "maxDepth": max_depth,
        "minFade": min_fade,
        "maxFade": max_fade,
        "feather": feather,
        "maskDataBase64": mask_base64,
    }))
}

/// Foreground saliency mask using U²-Net.
async fn run_foreground_mask(
    app_handle: &AppHandle,
    image: &DynamicImage,
    _parameters: &HashMap<String, serde_json::Value>,
) -> Result<serde_json::Value> {
    emit_progress(
        app_handle,
        &AiOperation::GenerateAiForegroundMask,
        10.0,
        "Running U²-Net foreground model…",
    );

    // TODO: Replace with actual U²-Net inference.
    // 1. Load models:
    //      let models = crate::ai_processing::get_or_init_ai_models(
    //          app_handle, &state.ai_state, &state.ai_init_lock,
    //      ).await?;
    // 2. Run salient-object detection:
    //      let mask = crate::ai_processing::run_u2netp_model(
    //          image, &models.u2netp,
    //      )?;
    let (w, h) = image.dimensions();
    let mask = GrayImage::new(w, h);

    emit_progress(
        app_handle,
        &AiOperation::GenerateAiForegroundMask,
        50.0,
        "Segmenting foreground…",
    );

    emit_progress(
        app_handle,
        &AiOperation::GenerateAiForegroundMask,
        80.0,
        "Encoding mask…",
    );

    let mask_base64 = encode_gray_to_base64_png(&mask)?;

    Ok(serde_json::json!({
        "maskDataBase64": mask_base64,
    }))
}

/// Sky segmentation mask.
async fn run_sky_mask(
    app_handle: &AppHandle,
    image: &DynamicImage,
    _parameters: &HashMap<String, serde_json::Value>,
) -> Result<serde_json::Value> {
    emit_progress(
        app_handle,
        &AiOperation::GenerateAiSkyMask,
        10.0,
        "Running sky segmentation model…",
    );

    // TODO: Replace with actual sky segmentation inference.
    // 1. Load models:
    //      let models = crate::ai_processing::get_or_init_ai_models(
    //          app_handle, &state.ai_state, &state.ai_init_lock,
    //      ).await?;
    // 2. Run sky segmentation:
    //      let mask = crate::ai_processing::run_sky_seg_model(
    //          image, &models.sky_seg,
    //      )?;
    let (w, h) = image.dimensions();
    let mask = GrayImage::new(w, h);

    emit_progress(
        app_handle,
        &AiOperation::GenerateAiSkyMask,
        50.0,
        "Segmenting sky…",
    );

    emit_progress(
        app_handle,
        &AiOperation::GenerateAiSkyMask,
        80.0,
        "Encoding mask…",
    );

    let mask_base64 = encode_gray_to_base64_png(&mask)?;

    Ok(serde_json::json!({
        "maskDataBase64": mask_base64,
    }))
}

/// AI denoising using the NIND UTNet model.
///
/// Parameter: `intensity` (0.0 – 1.0).
async fn run_ai_denoise(
    app_handle: &AppHandle,
    image: &DynamicImage,
    parameters: &HashMap<String, serde_json::Value>,
) -> Result<serde_json::Value> {
    let intensity = param_f32(parameters, "intensity", 0.5);

    emit_progress(
        app_handle,
        &AiOperation::AiDenoise,
        10.0,
        "Preparing denoising…",
    );

    // TODO: Replace with actual AI denoising inference.
    // 1. Load the denoise model:
    //      let session = crate::ai_processing::get_or_init_denoise_model(
    //          app_handle, &state.ai_state, &state.ai_init_lock,
    //      ).await?;
    // 2. Convert image to Rgb32F and run:
    //      let rgb32f = image.to_rgb32f();
    //      let result = crate::ai_processing::run_ai_denoise(
    //          &rgb32f, intensity, &session, app_handle,
    //      )?;
    let result_image = image.clone();

    emit_progress(
        app_handle,
        &AiOperation::AiDenoise,
        50.0,
        "Running AI NIND denoiser…",
    );

    emit_progress(
        app_handle,
        &AiOperation::AiDenoise,
        80.0,
        "Encoding result…",
    );

    let result_base64 = encode_image_to_base64_png(&result_image)?;

    Ok(serde_json::json!({
        "intensity": intensity,
        "imageDataBase64": result_base64,
    }))
}

/// AI inpainting using the LaMa model.
///
/// Required parameter: `maskDataBase64` (base64-encoded mask image).
async fn run_ai_inpaint(
    app_handle: &AppHandle,
    image: &DynamicImage,
    parameters: &HashMap<String, serde_json::Value>,
) -> Result<serde_json::Value> {
    let mask_base64 = parameters
        .get("maskDataBase64")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("maskDataBase64 parameter is required for inpainting"))?;

    emit_progress(
        app_handle,
        &AiOperation::AiInpaint,
        10.0,
        "Decoding mask…",
    );

    let mask_image = decode_base64_image(mask_base64)?.to_luma8();

    // TODO: Replace with actual LaMa inpainting inference.
    // 1. Load the LaMa model:
    //      let lama_model = crate::ai_processing::get_or_init_lama_model(
    //          app_handle, &state.ai_state, &state.ai_init_lock,
    //      ).await?;
    // 2. Run inpainting:
    //      let result = crate::ai_processing::run_lama_inpainting(
    //          image, &mask_image, &lama_model,
    //      )?;
    let result_image = image.to_rgba8();

    emit_progress(
        app_handle,
        &AiOperation::AiInpaint,
        50.0,
        "Running LaMa inpainting…",
    );

    emit_progress(
        app_handle,
        &AiOperation::AiInpaint,
        80.0,
        "Encoding result…",
    );

    let result_base64 = encode_rgba_to_base64_png(&result_image)?;

    Ok(serde_json::json!({
        "imageDataBase64": result_base64,
    }))
}

/// Face landmark detection using SCRFD + 2d106det.
async fn run_face_landmark(
    app_handle: &AppHandle,
    image: &DynamicImage,
    _parameters: &HashMap<String, serde_json::Value>,
) -> Result<serde_json::Value> {
    emit_progress(
        app_handle,
        &AiOperation::FaceLandmark,
        10.0,
        "Detecting faces…",
    );

    // TODO: Replace with actual face landmark detection.
    // 1. Load the detector:
    //      let detector = crate::ai_processing::get_or_init_face_landmark_detector(
    //          app_handle, &state.ai_state, &state.ai_init_lock,
    //      ).await?;
    // 2. Detect faces and landmarks:
    //      let mut det = detector.lock().unwrap();
    //      let faces = det.detect_all(image)?;
    // 3. Convert each FaceLandmarks106 to JSON:
    //      for face in &faces {
    //          // face.bbox: (f32, f32, f32, f32)
    //          // face.points: [(f32, f32); 106]
    //          // face.confidence: f32
    //      }
    let faces: Vec<serde_json::Value> = Vec::new();

    emit_progress(
        app_handle,
        &AiOperation::FaceLandmark,
        50.0,
        "Detecting landmarks…",
    );

    emit_progress(
        app_handle,
        &AiOperation::FaceLandmark,
        80.0,
        "Encoding result…",
    );

    Ok(serde_json::json!({
        "faces": faces,
    }))
}

// ---------------------------------------------------------------------------
// Parameter extraction helpers
// ---------------------------------------------------------------------------

fn param_f64(params: &HashMap<String, serde_json::Value>, key: &str, default: f64) -> f64 {
    params.get(key).and_then(|v| v.as_f64()).unwrap_or(default)
}

fn param_f32(params: &HashMap<String, serde_json::Value>, key: &str, default: f32) -> f32 {
    param_f64(params, key, default as f64) as f32
}
