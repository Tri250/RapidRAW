use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use anyhow::{Result, anyhow};
use image::imageops::{self, FilterType};
use image::{
    DynamicImage, GenericImageView, GrayImage, ImageBuffer, Luma, Rgb, Rgb32FImage, Rgba, RgbaImage,
};
use ndarray::{Array, Array4, IxDyn};
use ort::session::Session;
use ort::value::Tensor;

use crate::MutexResilient;

fn get_execution_providers() -> Vec<ort::execution_providers::ExecutionProviderDispatch> {
    use ort::execution_providers::*;
    let mut eps = Vec::new();

    #[cfg(target_os = "windows")]
    {
        eps.push(DirectMLExecutionProvider::default().build());
        eps.push(CUDAExecutionProvider::default().build());
    }

    #[cfg(target_os = "macos")]
    {
        eps.push(CoreMLExecutionProvider::default().build());
    }

    #[cfg(target_os = "linux")]
    {
        eps.push(CUDAExecutionProvider::default().build());
        eps.push(ROCmExecutionProvider::default().build());
    }

    #[cfg(target_os = "android")]
    {
        // Attempt NNAPI for on-device NPU/GPU acceleration on Android.
        // Falls back to CPU if NNAPI is unavailable on the device.
        eps.push(NNAPIExecutionProvider::default().build());
    }

    eps.push(CPUExecutionProvider::default().build());
    eps
}
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::Emitter;
use tauri::Manager;
use tokenizers::Tokenizer;
use tokio::sync::Mutex as TokioMutex;

/// Default mirror base URL for HuggingFace model downloads.
/// For Chinese users, set to "https://hf-mirror.com" or other domestic CDN.
/// Leave empty to use the default HuggingFace URLs directly.
const DEFAULT_HF_MIRROR_BASE: &str = "https://hf-mirror.com";

/// Environment variable to override the HuggingFace mirror base URL at runtime.
const HF_MIRROR_ENV_VAR: &str = "RAPIDRAW_HF_MIRROR";

fn resolve_model_url(original_url: &str) -> String {
    let mirror_base = std::env::var(HF_MIRROR_ENV_VAR)
        .ok()
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| DEFAULT_HF_MIRROR_BASE.to_string());

    if mirror_base.is_empty() {
        return original_url.to_string();
    }

    // Replace huggingface.co with the mirror domain
    original_url.replace(
        "https://huggingface.co/",
        &format!("{}/", mirror_base.trim_end_matches('/')),
    )
}

const ENCODER_URL: &str = "https://huggingface.co/CyberTimon/RapidRAW-Models/resolve/main/sam_vit_b_01ec64_encoder.onnx?download=true";
const DECODER_URL: &str = "https://huggingface.co/CyberTimon/RapidRAW-Models/resolve/main/sam_vit_b_01ec64_decoder.onnx?download=true";
const ENCODER_FILENAME: &str = "sam_vit_b_01ec64_encoder.onnx";
const DECODER_FILENAME: &str = "sam_vit_b_01ec64_decoder.onnx";
const SAM_INPUT_SIZE: u32 = 1024;
const ENCODER_SHA256: &str = "16ab73d9c824886f0de2938c19df22fb9ec3deebfd0de58e65177e479213d7d1";
const DECODER_SHA256: &str = "85d0d672cf5b7fe763edcde429e5533e62f674af4b15c7d688b7673b0ef00bf7";

const U2NETP_URL: &str =
    "https://huggingface.co/CyberTimon/RapidRAW-Models/resolve/main/u2net.onnx?download=true";
const U2NETP_FILENAME: &str = "u2net.onnx";
const U2NETP_INPUT_SIZE: u32 = 320;
const U2NETP_SHA256: &str = "8d10d2f3bb75ae3b6d527c77944fc5e7dcd94b29809d47a739a7a728a912b491";

const SKYSEG_URL: &str = "https://huggingface.co/CyberTimon/RapidRAW-Models/resolve/main/skyseg-u2net.onnx?download=true";
const SKYSEG_FILENAME: &str = "skyseg_u2net.onnx";
const SKYSEG_LEGACY_FILENAME: &str = "skyseg-u2net.onnx";
const SKYSEG_INPUT_SIZE: u32 = 320;
const SKYSEG_SHA256: &str = "ab9c34c64c3d821220a2886a4a06da4642ffa14d5b30e8d5339056a089aa1d39";

const CLIP_MODEL_URL: &str =
    "https://huggingface.co/CyberTimon/RapidRAW-Models/resolve/main/clip_model.onnx?download=true";
const CLIP_MODEL_FILENAME: &str = "clip_model.onnx";
const CLIP_TOKENIZER_URL: &str = "https://huggingface.co/CyberTimon/RapidRAW-Models/resolve/main/clip_tokenizer.json?download=true";
const CLIP_TOKENIZER_FILENAME: &str = "clip_tokenizer.json";
const CLIP_MODEL_SHA256: &str = "57879bb1c23cdeb350d23569dd251ed4b740a96d747c529e94a2bb8040ac5d00";

const DENOISE_URL: &str = "https://huggingface.co/CyberTimon/RapidRAW-Models/resolve/main/nind_denoise_utnet_684.onnx?download=true";
const DENOISE_FILENAME: &str = "nind_denoise_utnet_684.onnx";
const DENOISE_SHA256: &str = "ee3586279d514df557ff3f7dec6df37fafc51ba5d3a3435b2cc9ac2d9017e7fe";

const LAMA_URL: &str =
    "https://huggingface.co/CyberTimon/RapidRAW-Models/resolve/main/lama_fp16.onnx?download=true";
const LAMA_FILENAME: &str = "lama_fp16.onnx";
const LAMA_SHA256: &str = "2d6be6277c400d6f1b91819737f7c3da935e5c63d1b521d393be1196a2bfa82c";

const DEPTH_URL: &str = "https://huggingface.co/CyberTimon/RapidRAW-Models/resolve/main/depth_anything_v2_vits.onnx?download=true";
const DEPTH_FILENAME: &str = "depth_anything_v2_vits.onnx";
const DEPTH_INPUT_SIZE: u32 = 518;
const DEPTH_SHA256: &str = "d2b11a11c1d4a12b47608fa65a17ee9a4c605b55ee1730c8e3b526304f2562be";

const SCRFD_FILENAME: &str = "scrfd_10g_bnkps.onnx";
const SCRFD_URL: &str =
    "https://huggingface.co/datasets/Alltitude/insightface/resolve/main/scrfd_10g_bnkps.onnx";

const FACE_LANDMARK_106_FILENAME: &str = "2d106det.onnx";
const FACE_LANDMARK_106_URL: &str =
    "https://huggingface.co/datasets/Alltitude/insightface/resolve/main/2d106det.onnx";

/// Check if there is sufficient available memory for AI model loading.
/// `required_mb` is the minimum required memory in MB.
fn check_available_memory(required_mb: u64) -> anyhow::Result<()> {
    #[cfg(target_os = "android")]
    {
        // On Android, read /proc/meminfo for available memory
        if let Ok(meminfo) = std::fs::read_to_string("/proc/meminfo") {
            for line in meminfo.lines() {
                if line.starts_with("MemAvailable:") {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if parts.len() >= 2 {
                        if let Ok(kb) = parts[1].parse::<u64>() {
                            let available_mb = kb / 1024;
                            if available_mb < required_mb {
                                return Err(anyhow::anyhow!(
                                    "设备内存不足（可用 {}MB，需要 {}MB）。建议关闭后台应用后重试。",
                                    available_mb,
                                    required_mb
                                ));
                            }
                        }
                    }
                    break;
                }
                // Also check MemAvailable's predecessor: MemFree + Cached
                if line.starts_with("MemFree:") {
                    // Will be used as fallback if MemAvailable not found
                }
            }
        }
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = required_mb; // No memory check on non-Android platforms
    }
    Ok(())
}

/// Format an OOM-related error with a user-friendly message.
fn format_oom_error(model_name: &str, error: &dyn std::fmt::Display) -> String {
    let error_str = error.to_string();
    let is_oom = error_str.to_lowercase().contains("out of memory")
        || error_str.to_lowercase().contains("oom")
        || error_str.to_lowercase().contains("alloc")
        || error_str.to_lowercase().contains("memory");

    if is_oom {
        format!(
            "加载{}失败：设备内存不足。建议关闭后台应用后重试。（详情：{}）",
            model_name, error_str
        )
    } else {
        format!("加载{}失败：{}", model_name, error_str)
    }
}

pub struct ClipModels {
    pub model: Mutex<Session>,
    pub tokenizer: Tokenizer,
}

#[derive(Clone)]
pub struct ImageEmbeddings {
    pub path_hash: String,
    pub embeddings: Array<f32, IxDyn>,
    pub original_size: (u32, u32),
}

#[derive(Clone)]
pub struct CachedDepthMap {
    pub path_hash: String,
    pub depth_image: GrayImage,
    pub original_size: (u32, u32),
}

/// Per-model AI state. Each ONNX model is stored independently so it can be
/// downloaded and loaded lazily on first use without blocking the others.
/// This fixes the previous behaviour where `get_or_init_ai_models` serially
/// downloaded all 5 models (SAM encoder/decoder, U²-Net, sky seg, depth)
/// before any single AI feature became usable — e.g. the small U²-Net
/// foreground mask was blocked behind the large SAM encoder download.
pub struct AiState {
    pub sam_encoder: Option<Arc<Mutex<Session>>>,
    pub sam_decoder: Option<Arc<Mutex<Session>>>,
    pub u2netp: Option<Arc<Mutex<Session>>>,
    pub sky_seg: Option<Arc<Mutex<Session>>>,
    pub depth_anything: Option<Arc<Mutex<Session>>>,
    pub denoise_model: Option<Arc<Mutex<Session>>>,
    pub clip_models: Option<Arc<ClipModels>>,
    pub lama_model: Option<Arc<Mutex<Session>>>,
    pub embeddings: Option<ImageEmbeddings>,
    pub depth_map: Option<CachedDepthMap>,
    pub face_landmark_detector: Option<Arc<Mutex<crate::face_landmark::FaceLandmarkDetector>>>,
}

impl Default for AiState {
    fn default() -> Self {
        Self {
            sam_encoder: None,
            sam_decoder: None,
            u2netp: None,
            sky_seg: None,
            depth_anything: None,
            denoise_model: None,
            clip_models: None,
            lama_model: None,
            embeddings: None,
            depth_map: None,
            face_landmark_detector: None,
        }
    }
}

/// Logical model identifiers used for status reporting and prefetch ordering.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AiModelId {
    SamEncoder,
    SamDecoder,
    U2net,
    SkySeg,
    Depth,
    Denoise,
    Lama,
    Clip,
    FaceLandmark,
}

impl AiModelId {
    /// All model ids in prefetch priority order (small/cheap models first so
    /// basic on-device features become usable ASAP on Android).
    pub fn prefetch_order() -> &'static [AiModelId] {
        &[
            AiModelId::U2net,
            AiModelId::SkySeg,
            AiModelId::Denoise,
            AiModelId::Depth,
            AiModelId::Lama,
            AiModelId::SamEncoder,
            AiModelId::SamDecoder,
            AiModelId::Clip,
            AiModelId::FaceLandmark,
        ]
    }

    pub fn display_name(&self) -> &'static str {
        match self {
            AiModelId::SamEncoder => "SAM Encoder",
            AiModelId::SamDecoder => "SAM Decoder",
            AiModelId::U2net => "Foreground Model",
            AiModelId::SkySeg => "Sky Model",
            AiModelId::Depth => "Depth Model",
            AiModelId::Denoise => "Denoise Model",
            AiModelId::Lama => "Inpainting Model",
            AiModelId::Clip => "CLIP Model",
            AiModelId::FaceLandmark => "Face Landmark Model",
        }
    }
}

fn edt_1d(f: &mut [f32], v: &mut [usize], z: &mut [f32], d: &mut [f32]) {
    let n = f.len();
    if n == 0 {
        return;
    }
    let mut k = 0;
    v[0] = 0;
    z[0] = f32::NEG_INFINITY;
    z[1] = f32::INFINITY;
    for q in 1..n {
        let mut s = ((f[q] + (q * q) as f32) - (f[v[k]] + (v[k] * v[k]) as f32))
            / (2.0 * (q as f32 - v[k] as f32));
        while s <= z[k] {
            if k == 0 {
                break;
            }
            k -= 1;
            s = ((f[q] + (q * q) as f32) - (f[v[k]] + (v[k] * v[k]) as f32))
                / (2.0 * (q as f32 - v[k] as f32));
        }
        k += 1;
        v[k] = q;
        z[k] = s;
        z[k + 1] = f32::INFINITY;
    }
    k = 0;
    for (q, d_q) in d[..n].iter_mut().enumerate() {
        while z[k + 1] < q as f32 {
            k += 1;
        }
        let diff = q as f32 - v[k] as f32;
        *d_q = diff * diff + f[v[k]];
    }
    f.copy_from_slice(&d[..n]);
}

fn edt_2d(grid: &[bool], width: usize, height: usize) -> Vec<f32> {
    let area = width * height;
    let mut f = vec![0.0; area];
    for i in 0..area {
        f[i] = if grid[i] { 1e10 } else { 0.0 };
    }

    let max_dim = width.max(height);
    let mut v = vec![0; max_dim];
    let mut z = vec![0.0; max_dim + 1];
    let mut d = vec![0.0; max_dim];

    for y in 0..height {
        let start = y * width;
        let end = start + width;
        edt_1d(&mut f[start..end], &mut v, &mut z, &mut d);
    }

    let mut col = vec![0.0; height];
    for x in 0..width {
        for y in 0..height {
            col[y] = f[y * width + x];
        }
        edt_1d(&mut col, &mut v, &mut z, &mut d);
        for y in 0..height {
            f[y * width + x] = col[y];
        }
    }

    f.into_iter().map(|v| v.sqrt()).collect()
}

fn get_models_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf> {
    let models_dir = app_handle.path().app_data_dir()?.join("models");
    if !models_dir.exists() {
        fs::create_dir_all(&models_dir)?;
    }
    Ok(models_dir)
}

fn persist_downloaded_asset(dest: &Path, bytes: &[u8]) -> Result<()> {
    if bytes.is_empty() {
        return Err(anyhow::anyhow!(
            "Downloaded asset for {} was empty",
            dest.display()
        ));
    }

    let parent = dest.parent().ok_or_else(|| {
        anyhow::anyhow!(
            "Cannot determine parent directory for downloaded asset {}",
            dest.display()
        )
    })?;
    fs::create_dir_all(parent)?;

    let file_name = dest
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| anyhow::anyhow!("Invalid downloaded asset path {}", dest.display()))?;
    let tmp_path = dest.with_file_name(format!(".{}.download", file_name));

    {
        let mut file = fs::File::create(&tmp_path)?;
        if let Err(e) = file.write_all(bytes) {
            let _ = fs::remove_file(&tmp_path);
            return Err(e.into());
        }
        if let Err(e) = file.sync_all() {
            let _ = fs::remove_file(&tmp_path);
            return Err(e.into());
        }
    }

    if let Err(e) = fs::rename(&tmp_path, dest).or_else(|rename_error| -> std::io::Result<()> {
        if dest.exists() {
            fs::remove_file(dest)?;
            fs::rename(&tmp_path, dest)?;
            Ok(())
        } else {
            Err(rename_error)
        }
    }) {
        let _ = fs::remove_file(&tmp_path);
        return Err(e.into());
    }
    Ok(())
}

/// Build a list of candidate URLs to try for a model download.
/// Priority order:
/// 1. User-configured mirror (via RAPIDRAW_HF_MIRROR env var or DEFAULT_HF_MIRROR_BASE)
/// 2. Chinese domestic mirror (hf-mirror.com) - fastest for CN users
/// 3. Original HuggingFace URL (last resort for non-CN users)
fn build_download_candidates(original_url: &str) -> Vec<String> {
    let mut candidates = Vec::new();

    // 1. User-configured or environment-based mirror (highest priority)
    let resolved = resolve_model_url(original_url);
    if resolved != original_url {
        candidates.push(resolved.clone());
    }

    // 2. Also try hf-mirror.com directly (as fallback or if mirror_base is empty)
    if original_url.contains("huggingface.co") {
        let cn_mirror = original_url.replace("https://huggingface.co/", "https://hf-mirror.com/");
        if !candidates.contains(&cn_mirror) {
            candidates.push(cn_mirror);
        }
    }

    // 3. Original HuggingFace URL (last resort)
    candidates.push(original_url.to_string());

    candidates
}

async fn download_model_with_retries(url: &str, dest: &Path) -> Result<()> {
    let candidates = build_download_candidates(url);
    let max_attempts_per_host = 3;
    let mut last_error = None;

    // Maximum model file size: 1 GB on desktop, 500 MB on Android.
    // Prevents OOM from loading extremely large files into memory on
    // memory-constrained mobile devices.
    #[cfg(target_os = "android")]
    const MAX_MODEL_SIZE: usize = 500 * 1024 * 1024;
    #[cfg(not(target_os = "android"))]
    const MAX_MODEL_SIZE: usize = 1024 * 1024 * 1024;

    for candidate in &candidates {
        for attempt in 1..=max_attempts_per_host {
            log::info!(
                "Downloading model from {} (attempt {}/{})...",
                candidate,
                attempt,
                max_attempts_per_host
            );

            let client = reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(300))
                .connect_timeout(std::time::Duration::from_secs(30))
                .build()
                .unwrap_or_else(|_| reqwest::Client::new());

            match client.get(candidate).send().await {
                Ok(response) => {
                    if response.status().is_success() {
                        // Check Content-Length header before downloading to avoid
                        // downloading files that are obviously too large.
                        if let Some(content_length) = response.content_length() {
                            if content_length as usize > MAX_MODEL_SIZE {
                                log::warn!(
                                    "Download from {} reports {} bytes, exceeds max {} bytes",
                                    candidate,
                                    content_length,
                                    MAX_MODEL_SIZE
                                );
                                last_error = Some(format!(
                                    "File too large ({} MB exceeds {} MB limit)",
                                    content_length / (1024 * 1024),
                                    MAX_MODEL_SIZE / (1024 * 1024)
                                ));
                                continue;
                            }
                        }
                        match response.bytes().await {
                            Ok(bytes) => {
                                if bytes.len() < 1024 {
                                    // Too small to be a real model file; likely an error page.
                                    log::warn!(
                                        "Download from {} returned only {} bytes, treating as failure",
                                        candidate,
                                        bytes.len()
                                    );
                                    last_error = Some(format!(
                                        "Download from {} returned only {} bytes",
                                        candidate,
                                        bytes.len()
                                    ));
                                } else if bytes.len() > MAX_MODEL_SIZE {
                                    log::warn!(
                                        "Downloaded {} bytes from {}, exceeds {} byte limit",
                                        bytes.len(),
                                        candidate,
                                        MAX_MODEL_SIZE
                                    );
                                    last_error = Some(format!(
                                        "Downloaded file too large ({} MB)",
                                        bytes.len() / (1024 * 1024)
                                    ));
                                } else {
                                    return persist_downloaded_asset(dest, &bytes);
                                }
                            }
                            Err(e) => {
                                log::warn!(
                                    "Failed to read bytes from {} (attempt {}): {}",
                                    candidate,
                                    attempt,
                                    e
                                );
                                last_error = Some(format!("Failed to read response bytes: {}", e));
                            }
                        }
                    } else {
                        log::warn!(
                            "Download from {} failed with HTTP {} (attempt {})",
                            candidate,
                            response.status(),
                            attempt
                        );
                        last_error = Some(format!("HTTP {}", response.status()));
                    }
                }
                Err(e) => {
                    log::warn!(
                        "Request to {} failed (attempt {}): {}",
                        candidate,
                        attempt,
                        e
                    );
                    last_error = Some(format!("{}", e));
                }
            }

            if attempt < max_attempts_per_host {
                let backoff = std::time::Duration::from_secs(2u64.pow(attempt));
                log::info!("Retrying download in {:?}...", backoff);
                tokio::time::sleep(backoff).await;
            }
        }
    }

    #[cfg(target_os = "android")]
    {
        return Err(anyhow::anyhow!(
            "模型下载失败，请检查网络连接。建议：1. 切换网络重试；2. 前往「设置-通用-AI设置」配置模型镜像地址（推荐 hf-mirror.com）；3. 使用 Wi-Fi 网络。最后错误: {}",
            last_error.unwrap_or_else(|| "Unknown".to_string())
        ));
    }
    #[cfg(not(target_os = "android"))]
    {
        return Err(anyhow::anyhow!(
            "Model download failed after exhausting all mirrors and retries. Last error: {}",
            last_error.unwrap_or_else(|| "Unknown".to_string())
        ));
    }
}

async fn download_model(url: &str, dest: &Path) -> Result<()> {
    download_model_with_retries(url, dest).await
}

fn verify_sha256(path: &Path, expected_hash: &str) -> Result<bool> {
    if !path.exists() {
        return Ok(false);
    }
    let mut file = fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0; 8192];
    loop {
        let n = file.read(&mut buffer)?;
        if n == 0 {
            break;
        }
        hasher.update(&buffer[..n]);
    }
    let hash = hasher.finalize();
    let hex_hash = hex::encode(hash);
    Ok(hex_hash == expected_hash)
}

fn promote_legacy_model_filename(
    models_dir: &Path,
    expected_filename: &str,
    legacy_filename: &str,
    expected_hash: &str,
) -> Result<()> {
    let expected_path = models_dir.join(expected_filename);
    if expected_path.exists() {
        return Ok(());
    }

    let legacy_path = models_dir.join(legacy_filename);
    if !legacy_path.exists() || !verify_sha256(&legacy_path, expected_hash)? {
        return Ok(());
    }

    fs::rename(&legacy_path, &expected_path).or_else(|rename_error| -> std::io::Result<()> {
        if expected_path.exists() {
            Ok(())
        } else {
            Err(rename_error)
        }
    })?;
    Ok(())
}

async fn download_and_verify_model(
    app_handle: &tauri::AppHandle,
    models_dir: &Path,
    filename: &str,
    url: &str,
    expected_hash: &str,
    model_name: &str,
) -> Result<()> {
    let dest_path = models_dir.join(filename);
    if filename == SKYSEG_FILENAME {
        promote_legacy_model_filename(
            models_dir,
            SKYSEG_FILENAME,
            SKYSEG_LEGACY_FILENAME,
            SKYSEG_SHA256,
        )?;
    }
    let is_valid = verify_sha256(&dest_path, expected_hash)?;

    if !is_valid {
        if dest_path.exists() {
            println!("Model {} has incorrect hash. Re-downloading.", model_name);
            fs::remove_file(&dest_path)?;
        }
        let _ = app_handle.emit("ai-model-download-start", model_name);
        let download_result = download_model(url, &dest_path).await;
        let _ = app_handle.emit("ai-model-download-finish", model_name);
        download_result?;

        if !verify_sha256(&dest_path, expected_hash)? {
            return Err(anyhow::anyhow!(
                "Failed to verify model {} after download. Hash mismatch.",
                model_name
            ));
        }
    }
    Ok(())
}

/// Manifest entry for a single ONNX model.
struct ModelManifest {
    id: AiModelId,
    filename: &'static str,
    url: &'static str,
    sha256: &'static str,
    display_name: &'static str,
    required_mem_mb: u64,
}

fn manifest_for(id: AiModelId) -> Option<ModelManifest> {
    Some(match id {
        AiModelId::SamEncoder => ModelManifest {
            id,
            filename: ENCODER_FILENAME,
            url: ENCODER_URL,
            sha256: ENCODER_SHA256,
            display_name: "SAM Encoder",
            required_mem_mb: 500,
        },
        AiModelId::SamDecoder => ModelManifest {
            id,
            filename: DECODER_FILENAME,
            url: DECODER_URL,
            sha256: DECODER_SHA256,
            display_name: "SAM Decoder",
            required_mem_mb: 200,
        },
        AiModelId::U2net => ModelManifest {
            id,
            filename: U2NETP_FILENAME,
            url: U2NETP_URL,
            sha256: U2NETP_SHA256,
            display_name: "Foreground Model",
            required_mem_mb: 200,
        },
        AiModelId::SkySeg => ModelManifest {
            id,
            filename: SKYSEG_FILENAME,
            url: SKYSEG_URL,
            sha256: SKYSEG_SHA256,
            display_name: "Sky Model",
            required_mem_mb: 200,
        },
        AiModelId::Depth => ModelManifest {
            id,
            filename: DEPTH_FILENAME,
            url: DEPTH_URL,
            sha256: DEPTH_SHA256,
            display_name: "Depth Model",
            required_mem_mb: 300,
        },
        AiModelId::Denoise => ModelManifest {
            id,
            filename: DENOISE_FILENAME,
            url: DENOISE_URL,
            sha256: DENOISE_SHA256,
            display_name: "Denoise Model",
            required_mem_mb: 200,
        },
        AiModelId::Lama => ModelManifest {
            id,
            filename: LAMA_FILENAME,
            url: LAMA_URL,
            sha256: LAMA_SHA256,
            display_name: "Inpainting Model",
            required_mem_mb: 200,
        },
        // CLIP and FaceLandmark are not plain single-file ONNX models handled
        // by the generic loader; they have dedicated init functions.
        AiModelId::Clip | AiModelId::FaceLandmark => return None,
    })
}

impl AiState {
    fn get_onnx_model(&self, id: AiModelId) -> Option<&Arc<Mutex<Session>>> {
        match id {
            AiModelId::SamEncoder => self.sam_encoder.as_ref(),
            AiModelId::SamDecoder => self.sam_decoder.as_ref(),
            AiModelId::U2net => self.u2netp.as_ref(),
            AiModelId::SkySeg => self.sky_seg.as_ref(),
            AiModelId::Depth => self.depth_anything.as_ref(),
            AiModelId::Denoise => self.denoise_model.as_ref(),
            AiModelId::Lama => self.lama_model.as_ref(),
            AiModelId::Clip | AiModelId::FaceLandmark => None,
        }
    }

    fn set_onnx_model(&mut self, id: AiModelId, val: Arc<Mutex<Session>>) {
        match id {
            AiModelId::SamEncoder => self.sam_encoder = Some(val),
            AiModelId::SamDecoder => self.sam_decoder = Some(val),
            AiModelId::U2net => self.u2netp = Some(val),
            AiModelId::SkySeg => self.sky_seg = Some(val),
            AiModelId::Depth => self.depth_anything = Some(val),
            AiModelId::Denoise => self.denoise_model = Some(val),
            AiModelId::Lama => self.lama_model = Some(val),
            AiModelId::Clip | AiModelId::FaceLandmark => {}
        }
    }

    /// True if a model is already loaded into memory (ready for inference).
    pub fn is_model_loaded(&self, id: AiModelId) -> bool {
        match id {
            AiModelId::SamEncoder => self.sam_encoder.is_some(),
            AiModelId::SamDecoder => self.sam_decoder.is_some(),
            AiModelId::U2net => self.u2netp.is_some(),
            AiModelId::SkySeg => self.sky_seg.is_some(),
            AiModelId::Depth => self.depth_anything.is_some(),
            AiModelId::Denoise => self.denoise_model.is_some(),
            AiModelId::Lama => self.lama_model.is_some(),
            AiModelId::Clip => self.clip_models.is_some(),
            AiModelId::FaceLandmark => self.face_landmark_detector.is_some(),
        }
    }
}

/// Resolve a model file path: prefer an already-downloaded & verified copy in
/// the app data dir, then a bundled resource (small models shipped in the app
/// bundle/APK), falling back to a network download.
async fn ensure_model_file(
    app_handle: &tauri::AppHandle,
    models_dir: &Path,
    filename: &str,
    url: &str,
    expected_hash: &str,
    display_name: &str,
) -> Result<PathBuf> {
    let dest = models_dir.join(filename);
    if verify_sha256(&dest, expected_hash)? {
        return Ok(dest);
    }

    // Bundled resource (small models shipped in the app bundle / APK so basic
    // on-device AI works on first launch without a network download).
    if let Some(bundled) = bundled_model_path(app_handle, filename) {
        if verify_sha256(&bundled, expected_hash)? {
            // Copy into the writable models dir so the ONNX session always
            // reads from a stable, writable path (resource_dir may be read-only).
            let _ = fs::copy(&bundled, &dest);
            if verify_sha256(&dest, expected_hash)? {
                return Ok(dest);
            }
        }
    }

    download_and_verify_model(
        app_handle,
        models_dir,
        filename,
        url,
        expected_hash,
        display_name,
    )
    .await?;
    Ok(dest)
}

fn bundled_model_path(app_handle: &tauri::AppHandle, filename: &str) -> Option<PathBuf> {
    let resource_dir = app_handle.path().resource_dir().ok()?;
    let candidate = resource_dir.join("models").join(filename);
    if candidate.exists() {
        Some(candidate)
    } else {
        None
    }
}

/// Lazily download (if needed) and load a single ONNX model into its own slot
/// in [`AiState`]. Each AI feature initialises only the model(s) it requires,
/// so a small model (e.g. U²-Net) becomes usable without waiting for the large
/// SAM encoder to download — the root cause of "models downloading, can't be
/// fully used" on Android.
pub async fn get_or_init_onnx_model(
    app_handle: &tauri::AppHandle,
    ai_state_mutex: &Mutex<Option<AiState>>,
    ai_init_lock: &TokioMutex<()>,
    id: AiModelId,
) -> Result<Arc<Mutex<Session>>> {
    // Fast path: already loaded.
    {
        let lock = ai_state_mutex.lock_resilient();
        if let Some(arc) = lock.as_ref().and_then(|s| s.get_onnx_model(id).cloned()) {
            return Ok(arc);
        }
    }

    let _guard = ai_init_lock.lock().await;

    // Re-check after acquiring the init lock.
    {
        let lock = ai_state_mutex.lock_resilient();
        if let Some(arc) = lock.as_ref().and_then(|s| s.get_onnx_model(id).cloned()) {
            return Ok(arc);
        }
    }

    let m = manifest_for(id)
        .ok_or_else(|| anyhow!("Model {:?} is not a single-file ONNX model", id))?;
    let models_dir = get_models_dir(app_handle)?;

    let model_path = ensure_model_file(
        app_handle,
        &models_dir,
        m.filename,
        m.url,
        m.sha256,
        m.display_name,
    )
    .await?;

    let _ = ort::init().with_name("AI").commit();
    check_available_memory(m.required_mem_mb)?;

    let session = Session::builder()
        .map_err(|e| anyhow::Error::msg(format_oom_error(m.display_name, &e)))?
        .with_execution_providers(get_execution_providers())
        .map_err(|e| anyhow::Error::msg(format_oom_error(m.display_name, &e)))?
        .commit_from_file(&model_path)
        .map_err(|e| anyhow::Error::msg(format_oom_error(m.display_name, &e)))?;

    crate::register_exit_handler();

    let arc = Arc::new(Mutex::new(session));
    let mut lock = ai_state_mutex.lock_resilient();
    if let Some(state) = lock.as_mut() {
        state.set_onnx_model(id, arc.clone());
    } else {
        let mut state = AiState::default();
        state.set_onnx_model(id, arc.clone());
        *lock = Some(state);
    }

    Ok(arc)
}

/// Check whether a model's file is already present locally (downloaded in the
/// app data dir or bundled as a resource), without loading it. Used by the
/// status query command and the prefetch routine.
pub fn is_model_file_present(app_handle: &tauri::AppHandle, id: AiModelId) -> bool {
    match id {
        AiModelId::Clip => {
            file_present(app_handle, CLIP_MODEL_FILENAME, CLIP_MODEL_SHA256)
                && file_present(app_handle, CLIP_TOKENIZER_FILENAME, "")
        }
        AiModelId::FaceLandmark => {
            file_present(app_handle, SCRFD_FILENAME, "")
                && file_present(app_handle, FACE_LANDMARK_106_FILENAME, "")
        }
        _ => {
            if let Some(m) = manifest_for(id) {
                file_present(app_handle, m.filename, m.sha256)
            } else {
                false
            }
        }
    }
}

fn file_present(app_handle: &tauri::AppHandle, filename: &str, expected_hash: &str) -> bool {
    if let Ok(models_dir) = get_models_dir(app_handle) {
        let dest = models_dir.join(filename);
        if dest.exists() {
            if expected_hash.is_empty() {
                return true;
            }
            if let Ok(true) = verify_sha256(&dest, expected_hash) {
                return true;
            }
        }
    }
    if let Some(bundled) = bundled_model_path(app_handle, filename) {
        if expected_hash.is_empty() {
            return bundled.exists();
        }
        if let Ok(true) = verify_sha256(&bundled, expected_hash) {
            return true;
        }
    }
    false
}

/// Download (without loading) a single model file if missing. Used by the
/// background prefetch routine so models are fetched ahead of use.
pub async fn prefetch_model_file(app_handle: &tauri::AppHandle, id: AiModelId) -> Result<()> {
    let models_dir = get_models_dir(app_handle)?;

    match id {
        AiModelId::Clip => {
            ensure_model_file(
                app_handle,
                &models_dir,
                CLIP_MODEL_FILENAME,
                CLIP_MODEL_URL,
                CLIP_MODEL_SHA256,
                "CLIP Model",
            )
            .await?;
            // Tokenizer has no published sha256; download only if missing.
            let tokenizer_path = models_dir.join(CLIP_TOKENIZER_FILENAME);
            if !tokenizer_path.exists() {
                let _ = app_handle.emit("ai-model-download-start", "CLIP Tokenizer");
                let r = download_model(CLIP_TOKENIZER_URL, &tokenizer_path).await;
                let _ = app_handle.emit("ai-model-download-finish", "CLIP Tokenizer");
                r?;
            }
        }
        AiModelId::FaceLandmark => {
            download_model_if_missing(
                app_handle,
                &models_dir,
                SCRFD_FILENAME,
                SCRFD_URL,
                "Face Detection Model",
            )
            .await
            .map_err(|e| anyhow!(e))?;
            download_model_if_missing(
                app_handle,
                &models_dir,
                FACE_LANDMARK_106_FILENAME,
                FACE_LANDMARK_106_URL,
                "Face Landmark Model",
            )
            .await
            .map_err(|e| anyhow!(e))?;
        }
        _ => {
            if let Some(m) = manifest_for(id) {
                ensure_model_file(
                    app_handle,
                    &models_dir,
                    m.filename,
                    m.url,
                    m.sha256,
                    m.display_name,
                )
                .await?;
            }
        }
    }
    Ok(())
}

pub async fn get_or_init_denoise_model(
    app_handle: &tauri::AppHandle,
    ai_state_mutex: &Mutex<Option<AiState>>,
    ai_init_lock: &TokioMutex<()>,
) -> Result<Arc<Mutex<Session>>> {
    if let Some(denoise_model) = ai_state_mutex
        .lock_resilient()
        .as_ref()
        .and_then(|state| state.denoise_model.clone())
    {
        return Ok(denoise_model);
    }

    let _guard = ai_init_lock.lock().await;

    if let Some(denoise_model) = ai_state_mutex
        .lock_resilient()
        .as_ref()
        .and_then(|state| state.denoise_model.clone())
    {
        return Ok(denoise_model);
    }

    let models_dir = get_models_dir(app_handle)?;
    download_and_verify_model(
        app_handle,
        &models_dir,
        DENOISE_FILENAME,
        DENOISE_URL,
        DENOISE_SHA256,
        "NIND Denoise Model",
    )
    .await?;

    let _ = ort::init().with_name("AI-Denoise").commit();

    check_available_memory(200)?;

    let model_path = models_dir.join(DENOISE_FILENAME);
    let session = Session::builder()
        .map_err(|e| anyhow::Error::msg(format_oom_error("Denoise Model", &e)))?
        .with_execution_providers(get_execution_providers())
        .map_err(|e| anyhow::Error::msg(format_oom_error("Denoise Model", &e)))?
        .commit_from_file(model_path)
        .map_err(|e| anyhow::Error::msg(format_oom_error("Denoise Model", &e)))?;
    let denoise_model = Arc::new(Mutex::new(session));

    crate::register_exit_handler();

    let mut ai_state_lock = ai_state_mutex.lock_resilient();
    if let Some(state) = ai_state_lock.as_mut() {
        state.denoise_model = Some(denoise_model.clone());
    } else {
        *ai_state_lock = Some(AiState {
            denoise_model: Some(denoise_model.clone()),
            ..AiState::default()
        });
    }

    Ok(denoise_model)
}

pub async fn get_or_init_clip_models(
    app_handle: &tauri::AppHandle,
    ai_state_mutex: &Mutex<Option<AiState>>,
    ai_init_lock: &TokioMutex<()>,
) -> Result<Arc<ClipModels>> {
    if let Some(clip_models) = ai_state_mutex
        .lock_resilient()
        .as_ref()
        .and_then(|state| state.clip_models.clone())
    {
        return Ok(clip_models);
    }

    let _guard = ai_init_lock.lock().await;

    if let Some(clip_models) = ai_state_mutex
        .lock_resilient()
        .as_ref()
        .and_then(|state| state.clip_models.clone())
    {
        return Ok(clip_models);
    }

    let models_dir = get_models_dir(app_handle)?;

    download_and_verify_model(
        app_handle,
        &models_dir,
        CLIP_MODEL_FILENAME,
        CLIP_MODEL_URL,
        CLIP_MODEL_SHA256,
        "CLIP Model",
    )
    .await?;

    let clip_tokenizer_path = models_dir.join(CLIP_TOKENIZER_FILENAME);
    if !clip_tokenizer_path.exists() {
        let _ = app_handle.emit("ai-model-download-start", "CLIP Tokenizer");
        let download_result = download_model(CLIP_TOKENIZER_URL, &clip_tokenizer_path).await;
        let _ = app_handle.emit("ai-model-download-finish", "CLIP Tokenizer");
        download_result?;
    }

    let _ = ort::init().with_name("AI-Tagging").commit();

    check_available_memory(200)?;

    let clip_model_path = models_dir.join(CLIP_MODEL_FILENAME);
    let model = Mutex::new(
        Session::builder()
            .map_err(|e| anyhow::Error::msg(format_oom_error("CLIP Model", &e)))?
            .with_execution_providers(get_execution_providers())
            .map_err(|e| anyhow::Error::msg(format_oom_error("CLIP Model", &e)))?
            .commit_from_file(clip_model_path)
            .map_err(|e| anyhow::Error::msg(format_oom_error("CLIP Model", &e)))?,
    );
    let tokenizer =
        Tokenizer::from_file(clip_tokenizer_path).map_err(|e| anyhow::anyhow!(e.to_string()))?;

    crate::register_exit_handler();

    let clip_models = Arc::new(ClipModels { model, tokenizer });

    let mut ai_state_lock = ai_state_mutex.lock_resilient();
    if let Some(state) = ai_state_lock.as_mut() {
        state.clip_models = Some(clip_models.clone());
    } else {
        *ai_state_lock = Some(AiState {
            clip_models: Some(clip_models.clone()),
            ..AiState::default()
        });
    }

    Ok(clip_models)
}

pub async fn get_or_init_lama_model(
    app_handle: &tauri::AppHandle,
    ai_state_mutex: &Mutex<Option<AiState>>,
    ai_init_lock: &TokioMutex<()>,
) -> Result<Arc<Mutex<Session>>> {
    if let Some(lama_model) = ai_state_mutex
        .lock_resilient()
        .as_ref()
        .and_then(|state| state.lama_model.clone())
    {
        return Ok(lama_model);
    }

    let _guard = ai_init_lock.lock().await;

    if let Some(lama_model) = ai_state_mutex
        .lock_resilient()
        .as_ref()
        .and_then(|state| state.lama_model.clone())
    {
        return Ok(lama_model);
    }

    let models_dir = get_models_dir(app_handle)?;
    download_and_verify_model(
        app_handle,
        &models_dir,
        LAMA_FILENAME,
        LAMA_URL,
        LAMA_SHA256,
        "Inpainting Model",
    )
    .await?;

    let _ = ort::init().with_name("AI-Inpainting").commit();

    // Memory threshold check before loading LaMa inpainting model
    check_available_memory(200)?; // Require at least 200MB available

    let model_path = models_dir.join(LAMA_FILENAME);
    let session = Session::builder()
        .map_err(|e| anyhow::Error::msg(format_oom_error("Inpainting Model", &e)))?
        .with_execution_providers(get_execution_providers())
        .map_err(|e| anyhow::Error::msg(format_oom_error("Inpainting Model", &e)))?
        .commit_from_file(model_path)
        .map_err(|e| anyhow::Error::msg(format_oom_error("Inpainting Model", &e)))?;
    let lama_model = Arc::new(Mutex::new(session));

    crate::register_exit_handler();

    let mut ai_state_lock = ai_state_mutex.lock_resilient();
    if let Some(state) = ai_state_lock.as_mut() {
        state.lama_model = Some(lama_model.clone());
    } else {
        *ai_state_lock = Some(AiState {
            lama_model: Some(lama_model.clone()),
            ..AiState::default()
        });
    }

    Ok(lama_model)
}

async fn download_model_if_missing(
    app_handle: &tauri::AppHandle,
    models_dir: &Path,
    filename: &str,
    url: &str,
    model_name: &str,
) -> Result<(), String> {
    let dest_path = models_dir.join(filename);
    if dest_path.exists() {
        return Ok(());
    }
    let _ = app_handle.emit("ai-model-download-start", model_name);
    let result = download_model(url, &dest_path)
        .await
        .map_err(|e| e.to_string());
    let _ = app_handle.emit("ai-model-download-finish", model_name);
    result
}

pub async fn get_or_init_face_landmark_detector(
    app_handle: &tauri::AppHandle,
    ai_state_mutex: &Mutex<Option<AiState>>,
    ai_init_lock: &TokioMutex<()>,
) -> Result<Arc<Mutex<crate::face_landmark::FaceLandmarkDetector>>, String> {
    if let Some(detector) = ai_state_mutex
        .lock_resilient()
        .as_ref()
        .and_then(|state| state.face_landmark_detector.clone())
    {
        return Ok(detector);
    }

    let _guard = ai_init_lock.lock().await;

    if let Some(detector) = ai_state_mutex
        .lock_resilient()
        .as_ref()
        .and_then(|state| state.face_landmark_detector.clone())
    {
        return Ok(detector);
    }

    let models_dir = get_models_dir(app_handle).map_err(|e| e.to_string())?;

    download_model_if_missing(
        app_handle,
        &models_dir,
        SCRFD_FILENAME,
        SCRFD_URL,
        "Face Detection Model",
    )
    .await?;

    download_model_if_missing(
        app_handle,
        &models_dir,
        FACE_LANDMARK_106_FILENAME,
        FACE_LANDMARK_106_URL,
        "Face Landmark Model",
    )
    .await?;

    let _ = ort::init().with_name("AI-FaceLandmark").commit();

    check_available_memory(300).map_err(|e| e.to_string())?;

    let scrfd_path = models_dir.join(SCRFD_FILENAME);
    let landmark_path = models_dir.join(FACE_LANDMARK_106_FILENAME);

    let detector = crate::face_landmark::FaceLandmarkDetector::new(&scrfd_path, &landmark_path)
        .map_err(|e| format_oom_error("Face Detection", &e))?;
    let detector = Arc::new(Mutex::new(detector));

    crate::register_exit_handler();

    let mut ai_state_lock = ai_state_mutex.lock_resilient();
    if let Some(state) = ai_state_lock.as_mut() {
        state.face_landmark_detector = Some(detector.clone());
    } else {
        *ai_state_lock = Some(AiState {
            face_landmark_detector: Some(detector.clone()),
            ..AiState::default()
        });
    }

    Ok(detector)
}

#[derive(Clone, Copy)]
struct TileParams {
    cs: usize,
    ucs: usize,
    overlap: usize,
    pad: usize,
}

impl TileParams {
    const fn new(cs: usize, ucs: usize, overlap: usize) -> Self {
        Self {
            cs,
            ucs,
            overlap,
            pad: (cs - ucs) / 2,
        }
    }
}

const TILE_BALANCED: TileParams = TileParams::new(504, 480, 6);
const TILE_FASTER: TileParams = TileParams::new(504, 504, 0);
const TILE_HIGHER_QUALITY: TileParams = TileParams::new(504, 448, 12);

fn select_tile_params(quality_0_1: f32) -> TileParams {
    let q = quality_0_1.clamp(0.0, 1.0);
    if q <= 0.25 {
        TILE_FASTER
    } else if q >= 0.75 {
        TILE_HIGHER_QUALITY
    } else {
        TILE_BALANCED
    }
}

#[inline]
fn mirror_coord(c: i32, size: i32) -> i32 {
    if c < 0 {
        (-c).min(size - 1)
    } else if c >= size {
        (2 * size - 1 - c).max(0)
    } else {
        c
    }
}

fn extract_tile_mirror(img: &Rgb32FImage, x0: i32, y0: i32, cs: usize) -> Array4<f32> {
    let (w, h) = (img.width() as i32, img.height() as i32);
    let mut arr = Array4::zeros((1, 3, cs, cs));
    for dy in 0..cs as i32 {
        for dx in 0..cs as i32 {
            let sx = mirror_coord(x0 + dx, w);
            let sy = mirror_coord(y0 + dy, h);
            let px = img.get_pixel(sx as u32, sy as u32);
            arr[[0, 0, dy as usize, dx as usize]] = px[0];
            arr[[0, 1, dy as usize, dx as usize]] = px[1];
            arr[[0, 2, dy as usize, dx as usize]] = px[2];
        }
    }
    arr
}

struct SeamlessBlend {
    ud0: usize,
    ud1: usize,
    ud2: usize,
    ud3: usize,
    absx0: usize,
    absy0: usize,
    fswidth: usize,
    fsheight: usize,
    overlap: usize,
}

fn apply_seamless(tile: &mut Array4<f32>, blend: &SeamlessBlend) {
    let SeamlessBlend {
        ud0,
        ud1,
        ud2,
        ud3,
        absx0,
        absy0,
        fswidth,
        fsheight,
        overlap,
    } = *blend;
    let ol = overlap;
    if absx0 > 0 {
        for c in 0..3 {
            for y in ud1..ud3 {
                for x in ud0..(ud0 + ol).min(ud2) {
                    tile[[0, c, y, x]] *= 0.5;
                }
            }
        }
    }
    if absy0 > 0 {
        for c in 0..3 {
            for y in ud1..(ud1 + ol).min(ud3) {
                for x in ud0..ud2 {
                    tile[[0, c, y, x]] *= 0.5;
                }
            }
        }
    }
    if absx0 + (ud2 - ud0) < fswidth && ol > 0 {
        let right_start = (ud2 as i32 - ol as i32).max(ud0 as i32) as usize;
        for c in 0..3 {
            for y in ud1..ud3 {
                for x in right_start..ud2 {
                    tile[[0, c, y, x]] *= 0.5;
                }
            }
        }
    }
    if absy0 + (ud3 - ud1) < fsheight && ol > 0 {
        let bottom_start = (ud3 as i32 - ol as i32).max(ud1 as i32) as usize;
        for c in 0..3 {
            for y in bottom_start..ud3 {
                for x in ud0..ud2 {
                    tile[[0, c, y, x]] *= 0.5;
                }
            }
        }
    }
}

fn run_native_denoise(
    img: &Rgb32FImage,
    session: &Mutex<Session>,
    accumulator: &mut [f32],
    width: usize,
    height: usize,
    app_handle: &tauri::AppHandle,
    params: TileParams,
) -> Result<()> {
    let w = width as i32;
    let h = height as i32;
    let step = params.ucs.saturating_sub(params.overlap).max(1);
    let iperhl = (width.saturating_sub(params.ucs) as f64 / step as f64).ceil() as usize;
    let ipervl = (height.saturating_sub(params.ucs) as f64 / step as f64).ceil() as usize;
    let total = (iperhl + 1) * (ipervl + 1);

    for i in 0..total {
        let yi = i / (iperhl + 1);
        let xi = i % (iperhl + 1);
        let x0 =
            params.ucs as i32 * xi as i32 - params.overlap as i32 * xi as i32 - params.pad as i32;
        let y0 =
            params.ucs as i32 * yi as i32 - params.overlap as i32 * yi as i32 - params.pad as i32;

        if i % 10 == 0 {
            let pct = (i as f32 / total as f32) * 100.0;
            let _ = app_handle.emit("denoise-progress", format!("Denoising… {:.0}%", pct));
        }

        let crop = extract_tile_mirror(img, x0, y0, params.cs);
        let input_values = crop.as_standard_layout().to_owned();
        let t_input = Tensor::from_array(input_values)?;

        let out = {
            let mut sess = session.lock_resilient();
            let outputs = sess.run(ort::inputs![t_input])?;
            let arr = outputs[0].try_extract_array::<f32>()?.to_owned();
            arr.into_dimensionality::<ndarray::Ix4>()
                .map_err(|e| anyhow::anyhow!("Unexpected output shape: {}", e))?
        };

        let x1pad = (0i32).max(x0 + params.cs as i32 - w) as usize;
        let y1pad = (0i32).max(y0 + params.cs as i32 - h) as usize;
        let ud0 = params.pad;
        let ud1 = params.pad;
        let ud2 = params.cs - params.pad.max(x1pad);
        let ud3 = params.cs - params.pad.max(y1pad);
        let absx0 = (x0 + params.pad as i32).max(0) as usize;
        let absy0 = (y0 + params.pad as i32).max(0) as usize;

        let mut tile = out;
        apply_seamless(
            &mut tile,
            &SeamlessBlend {
                ud0,
                ud1,
                ud2,
                ud3,
                absx0,
                absy0,
                fswidth: width,
                fsheight: height,
                overlap: params.overlap,
            },
        );

        for cy in 0..(ud3 - ud1) {
            for cx in 0..(ud2 - ud0) {
                let gx = absx0 + cx;
                let gy = absy0 + cy;
                if gx < width && gy < height {
                    let base = (gy * width + gx) * 3;
                    accumulator[base] += tile[[0, 0, ud1 + cy, ud0 + cx]].clamp(0.0, 1.0);
                    accumulator[base + 1] += tile[[0, 1, ud1 + cy, ud0 + cx]].clamp(0.0, 1.0);
                    accumulator[base + 2] += tile[[0, 2, ud1 + cy, ud0 + cx]].clamp(0.0, 1.0);
                }
            }
        }
    }
    Ok(())
}

fn accumulator_to_rgb32f(acc: &[f32], width: u32, height: u32) -> Rgb32FImage {
    let mut out = Rgb32FImage::new(width, height);
    for (i, p) in out.pixels_mut().enumerate() {
        let i3 = i * 3;
        *p = Rgb([
            acc[i3].clamp(0.0, 1.0),
            acc[i3 + 1].clamp(0.0, 1.0),
            acc[i3 + 2].clamp(0.0, 1.0),
        ]);
    }
    out
}

pub fn run_ai_denoise(
    rgb_img: &Rgb32FImage,
    intensity: f32,
    session: &Mutex<Session>,
    app_handle: &tauri::AppHandle,
) -> Result<DynamicImage> {
    let (width, height) = rgb_img.dimensions();
    let params = select_tile_params(intensity);

    let _ = app_handle.emit("denoise-progress", "Denoising (AI NIND)...");
    let mut accumulator = vec![0.0f32; width as usize * height as usize * 3];
    run_native_denoise(
        rgb_img,
        session,
        &mut accumulator,
        width as usize,
        height as usize,
        app_handle,
        params,
    )?;

    let out_img_buffer = accumulator_to_rgb32f(&accumulator, width, height);
    Ok(DynamicImage::ImageRgb32F(out_img_buffer))
}

pub fn run_lama_inpainting(
    image: &DynamicImage,
    mask: &GrayImage,
    lama_session: &Mutex<Session>,
) -> Result<RgbaImage> {
    let (w, h) = image.dimensions();

    // Inpainting bug fix #2: consistent zero-dimension handling.
    // Previously we returned Ok(RgbaImage::new(0,0)) which callers would try
    // to `.to_rgba8()` or splat back onto the source canvas (0-dim buffer
    // confuses downstream code on Android).  Return a clear Err so the
    // generative-replace / heal pipeline falls back gracefully.
    if w == 0 || h == 0 {
        return Err(anyhow::anyhow!("Image has zero dimensions"));
    }
    let (mw, mh) = mask.dimensions();
    if mw == 0 || mh == 0 {
        return Err(anyhow::anyhow!("Mask has zero dimensions"));
    }
    // Defensive dimension alignment — inpainting model operates on the
    // source image spatial domain, so mismatched sizes would either panic
    // via get_pixel out-of-bounds or silently write to wrong texels.
    if mw != w || mh != h {
        return Err(anyhow::anyhow!(
            "Inpainting mask dimensions {}x{} do not match image {}x{}",
            mw,
            mh,
            w,
            h
        ));
    }

    let (mut min_x, mut min_y) = (w, h);
    let (mut max_x, mut max_y) = (0u32, 0u32);
    let mut has_mask = false;

    for (x, y, p) in mask.enumerate_pixels() {
        if p[0] > 0 {
            min_x = min_x.min(x);
            min_y = min_y.min(y);
            max_x = max_x.max(x);
            max_y = max_y.max(y);
            has_mask = true;
        }
    }

    if !has_mask {
        return Ok(image.to_rgba8());
    }

    let mask_w = max_x - min_x + 1;
    let mask_h = max_y - min_y + 1;

    let pad_x = 128.max((mask_w as f32 * 1.5) as u32);
    let pad_y = 128.max((mask_h as f32 * 1.5) as u32);

    let x0 = min_x.saturating_sub(pad_x);
    let y0 = min_y.saturating_sub(pad_y);
    let x1 = (max_x + pad_x).min(w.saturating_sub(1));
    let y1 = (max_y + pad_y).min(h.saturating_sub(1));

    let crop_w = x1 - x0 + 1;
    let crop_h = y1 - y0 + 1;

    if crop_w == 0 || crop_h == 0 {
        return Ok(image.to_rgba8());
    }

    let rgba = image.to_rgba8();

    let cropped_img = imageops::crop_imm(&rgba, x0, y0, crop_w, crop_h).to_image();
    let cropped_mask = imageops::crop_imm(mask, x0, y0, crop_w, crop_h).to_image();

    let max_dim_limit: u32 = 768;
    let needs_downscale = crop_w > max_dim_limit || crop_h > max_dim_limit;

    let (fw, fh, inf_img, inf_mask) = if needs_downscale {
        let scale = max_dim_limit as f32 / crop_w.max(crop_h) as f32;

        let scaled_w = (crop_w as f32 * scale).round().max(1.0) as u32;
        let scaled_h = (crop_h as f32 * scale).round().max(1.0) as u32;

        (
            scaled_w,
            scaled_h,
            imageops::resize(&cropped_img, scaled_w, scaled_h, FilterType::Lanczos3),
            imageops::resize(&cropped_mask, scaled_w, scaled_h, FilterType::Triangle),
        )
    } else {
        (crop_w, crop_h, cropped_img.clone(), cropped_mask.clone())
    };

    let align = 64u32;
    let mut tensor_dim = fw.max(fh);
    if tensor_dim % align != 0 {
        tensor_dim += align - (tensor_dim % align);
    }
    let tensor_dim = tensor_dim.max(align) as usize;

    let mut img_tensor = Array::<f32, _>::zeros((1, 3, tensor_dim, tensor_dim));
    let mut msk_tensor = Array::<f32, _>::zeros((1, 1, tensor_dim, tensor_dim));

    for y in 0..tensor_dim {
        for x in 0..tensor_dim {
            let sx = (x as u32).min(fw.saturating_sub(1));
            let sy = (y as u32).min(fh.saturating_sub(1));

            let p = inf_img.get_pixel(sx, sy);
            let m = inf_mask.get_pixel(sx, sy)[0];

            img_tensor[[0, 0, y, x]] = p[0] as f32 / 255.0;
            img_tensor[[0, 1, y, x]] = p[1] as f32 / 255.0;
            img_tensor[[0, 2, y, x]] = p[2] as f32 / 255.0;
            msk_tensor[[0, 0, y, x]] = if m > 0 { 1.0 } else { 0.0 };
        }
    }

    let t_img = Tensor::from_array(img_tensor.into_dyn().as_standard_layout().into_owned())?;
    let t_msk = Tensor::from_array(msk_tensor.into_dyn().as_standard_layout().into_owned())?;

    let output_tensor = {
        let mut session = lama_session.lock_resilient();
        let outputs = session.run(ort::inputs!["image" => t_img, "mask" => t_msk])?;
        outputs[0].try_extract_array::<f32>()?.to_owned()
    };

    let mut result_inf = RgbaImage::new(fw, fh);
    for y in 0..fh {
        for x in 0..fw {
            let r = (output_tensor[[0, 0, y as usize, x as usize]] * 255.0).clamp(0.0, 255.0) as u8;
            let g = (output_tensor[[0, 1, y as usize, x as usize]] * 255.0).clamp(0.0, 255.0) as u8;
            let b = (output_tensor[[0, 2, y as usize, x as usize]] * 255.0).clamp(0.0, 255.0) as u8;
            result_inf.put_pixel(x, y, Rgba([r, g, b, 255]));
        }
    }

    let result_crop = if needs_downscale {
        imageops::resize(&result_inf, crop_w, crop_h, FilterType::Lanczos3)
    } else {
        result_inf
    };

    let mut final_image = image.to_rgba8();

    for y in 0..crop_h {
        for x in 0..crop_w {
            let m = cropped_mask.get_pixel(x, y)[0];
            if m > 0 {
                let alpha = m as f32 / 255.0;
                let p = result_crop.get_pixel(x, y);
                let gx = x0 + x;
                let gy = y0 + y;
                let orig = final_image.get_pixel(gx, gy);

                let r = (p[0] as f32 * alpha + orig[0] as f32 * (1.0 - alpha)) as u8;
                let g = (p[1] as f32 * alpha + orig[1] as f32 * (1.0 - alpha)) as u8;
                let b = (p[2] as f32 * alpha + orig[2] as f32 * (1.0 - alpha)) as u8;

                final_image.put_pixel(gx, gy, Rgba([r, g, b, 255]));
            }
        }
    }

    Ok(final_image)
}

pub fn generate_image_embeddings(
    image: &DynamicImage,
    encoder: &Mutex<Session>,
) -> Result<ImageEmbeddings> {
    let (orig_width, orig_height) = image.dimensions();

    let long_side = orig_width.max(orig_height) as f32;
    let scale = SAM_INPUT_SIZE as f32 / long_side;
    let new_width = (orig_width as f32 * scale).round() as u32;
    let new_height = (orig_height as f32 * scale).round() as u32;

    let resized_image = image.resize(new_width, new_height, FilterType::Triangle);
    let rgb_image = resized_image.into_rgb8();
    let (actual_width, actual_height) = rgb_image.dimensions();
    let raw_pixels = rgb_image.as_raw();

    let mut input_tensor: Array<u8, _> =
        Array::zeros((1, 3, SAM_INPUT_SIZE as usize, SAM_INPUT_SIZE as usize));

    let w_usize = actual_width as usize;
    for y in 0..(actual_height as usize) {
        for x in 0..w_usize {
            let idx = (y * w_usize + x) * 3;
            input_tensor[[0, 0, y, x]] = raw_pixels[idx];
            input_tensor[[0, 1, y, x]] = raw_pixels[idx + 1];
            input_tensor[[0, 2, y, x]] = raw_pixels[idx + 2];
        }
    }

    let input_tensor_dyn = input_tensor.into_dyn();
    let input_values = input_tensor_dyn.as_standard_layout();
    let input_tensor_ort = Tensor::from_array(input_values.into_owned())?;
    let mut session = encoder.lock_resilient();
    let outputs = session.run(ort::inputs![input_tensor_ort])?;

    let embeddings = outputs[0].try_extract_array::<f32>()?.to_owned();

    Ok(ImageEmbeddings {
        path_hash: "".to_string(),
        embeddings: embeddings.into_dyn(),
        original_size: (orig_width, orig_height),
    })
}

pub fn run_sam_decoder(
    decoder: &Mutex<Session>,
    embeddings: &ImageEmbeddings,
    start_point: (f64, f64),
    end_point: (f64, f64),
) -> Result<GrayImage> {
    let (orig_width, orig_height) = embeddings.original_size;

    // Guard: if point coordinates are invalid (NaN/inf) or result in empty
    // point arrays, return an empty (all-black) mask instead of panicking
    // when constructing zero-length ndarray shapes.
    if start_point.0.is_nan()
        || start_point.1.is_nan()
        || end_point.0.is_nan()
        || end_point.1.is_nan()
        || start_point.0.is_infinite()
        || start_point.1.is_infinite()
        || end_point.0.is_infinite()
        || end_point.1.is_infinite()
    {
        return Ok(GrayImage::new(orig_width, orig_height));
    }

    let long_side = orig_width.max(orig_height) as f64;
    let scale = SAM_INPUT_SIZE as f64 / long_side;

    let iters = 2;

    let is_point =
        (start_point.0 - end_point.0).abs() < 1e-6 && (start_point.1 - end_point.1).abs() < 1e-6;
    let mut point_coords = Vec::new();
    let mut point_labels = Vec::new();

    if is_point {
        point_coords.push((
            (start_point.0 * scale) as f32,
            (start_point.1 * scale) as f32,
        ));
        point_labels.push(1.0f32);
    } else {
        let x1 = (start_point.0.min(end_point.0) * scale) as f32;
        let y1 = (start_point.1.min(end_point.1) * scale) as f32;
        let x2 = (start_point.0.max(end_point.0) * scale) as f32;
        let y2 = (start_point.1.max(end_point.1) * scale) as f32;
        point_coords.push((x1, y1));
        point_coords.push((x2, y2));
        point_labels.push(2.0f32);
        point_labels.push(3.0f32);
    }

    // Guard: if point arrays are somehow empty, return an empty mask.
    if point_coords.is_empty() {
        return Ok(GrayImage::new(orig_width, orig_height));
    }

    let mut mask_input = Array::zeros((1, 1, 256, 256)).into_dyn();
    let mut has_mask_input = 0.0f32;

    let orig_im_size =
        Array::from_shape_vec((2,), vec![orig_height as f32, orig_width as f32])?.into_dyn();

    let mut final_mask_data: Vec<u8> = Vec::new();
    let mut final_w = 0;
    let mut final_h = 0;

    for i in 0..iters {
        let pc_len = point_coords.len();
        let pl_len = point_labels.len();

        let coords_flat: Vec<f32> = point_coords.iter().flat_map(|&(x, y)| vec![x, y]).collect();
        let coords_array = Array::from_shape_vec((1, pc_len, 2), coords_flat)?.into_dyn();
        let labels_array = Array::from_shape_vec((1, pl_len), point_labels.clone())?.into_dyn();

        let t_embeddings = Tensor::from_array(
            embeddings
                .embeddings
                .clone()
                .as_standard_layout()
                .into_owned(),
        )?;
        let t_point_coords = Tensor::from_array(coords_array.as_standard_layout().into_owned())?;
        let t_point_labels = Tensor::from_array(labels_array.as_standard_layout().into_owned())?;
        let t_mask_input =
            Tensor::from_array(mask_input.clone().as_standard_layout().into_owned())?;
        let t_has_mask = Tensor::from_array(
            Array::from_elem((1,), has_mask_input)
                .into_dyn()
                .as_standard_layout()
                .into_owned(),
        )?;
        let t_orig_im_size =
            Tensor::from_array(orig_im_size.clone().as_standard_layout().into_owned())?;

        let mask_tensor = {
            let mut session = decoder.lock_resilient();
            let outputs = session.run(ort::inputs![
                t_embeddings,
                t_point_coords,
                t_point_labels,
                t_mask_input,
                t_has_mask,
                t_orig_im_size
            ])?;
            outputs[0].try_extract_array::<f32>()?.to_owned()
        };

        let mask_dims = mask_tensor.shape();
        let h = mask_dims[2];
        let w = mask_dims[3];
        let area = h * w;

        let mask_slice = mask_tensor.as_slice().ok_or_else(|| {
            anyhow!("Failed to extract mask tensor data - tensor may not be contiguous")
        })?;
        let first_mask_slice = &mask_slice[0..area];

        if i == iters - 1 {
            final_mask_data = first_mask_slice
                .iter()
                .map(|&val| if val > 0.0 { 255 } else { 0 })
                .collect();
            final_w = w;
            final_h = h;
            break;
        }

        let mut binary_mask = vec![false; area];
        let mut mask_area = 0.0;
        let mut min_x = w;
        let mut min_y = h;
        let mut max_x = 0;
        let mut max_y = 0;

        for (idx, &val) in first_mask_slice.iter().enumerate() {
            if val > 0.0 {
                binary_mask[idx] = true;
                let x = idx % w;
                let y = idx / w;
                min_x = min_x.min(x);
                max_x = max_x.max(x);
                min_y = min_y.min(y);
                max_y = max_y.max(y);
                mask_area += 1.0;
            }
        }

        if mask_area == 0.0 || min_x > max_x {
            final_mask_data = first_mask_slice
                .iter()
                .map(|&val| if val > 0.0 { 255 } else { 0 })
                .collect();
            final_w = w;
            final_h = h;
            break;
        }

        let dt_in = edt_2d(&binary_mask, w, h);
        let mut max_in = 0.0;
        let mut pos_idx = 0;
        for (idx, &v) in dt_in.iter().enumerate() {
            if v > max_in {
                max_in = v;
                pos_idx = idx;
            }
        }
        let pos_y = pos_idx / w;
        let pos_x = pos_idx % w;

        let mut rev_mask = vec![false; area];
        for (idx, is_true) in binary_mask.iter().enumerate() {
            rev_mask[idx] = !is_true;
        }
        let mut dt_out = edt_2d(&rev_mask, w, h);

        for y in 0..h {
            for x in 0..w {
                if x < min_x || x > max_x || y < min_y || y > max_y {
                    dt_out[y * w + x] = 0.0;
                }
            }
        }

        let mut max_out = 0.0;
        let mut neg_idx = 0;
        for (idx, &v) in dt_out.iter().enumerate() {
            if v > max_out {
                max_out = v;
                neg_idx = idx;
            }
        }
        let neg_y = neg_idx / w;
        let neg_x = neg_idx % w;

        point_coords.clear();
        point_labels.clear();

        point_coords.push(((pos_x as f64 * scale) as f32, (pos_y as f64 * scale) as f32));
        point_labels.push(1.0);
        point_coords.push(((neg_x as f64 * scale) as f32, (neg_y as f64 * scale) as f32));
        point_labels.push(0.0);
        point_coords.push(((min_x as f64 * scale) as f32, (min_y as f64 * scale) as f32));
        point_labels.push(2.0);
        point_coords.push(((max_x as f64 * scale) as f32, (max_y as f64 * scale) as f32));
        point_labels.push(3.0);

        let mut gaus_dt = vec![0.0f32; area];
        let variance = (mask_area / 4.0_f32).max(1.0_f32);
        for (idx, &is_true) in binary_mask.iter().enumerate() {
            if is_true {
                let diff = dt_in[idx] - max_in;
                gaus_dt[idx] = (-(diff * diff) / variance).exp();
            }
        }

        let mask_f32_vec: Vec<f32> = first_mask_slice
            .iter()
            .map(|&v| if v > 0.0 { 15.0 } else { -15.0 })
            .collect();

        let img_mask_f32 =
            ImageBuffer::<Luma<f32>, Vec<f32>>::from_raw(w as u32, h as u32, mask_f32_vec)
                .ok_or_else(|| {
                    anyhow!("Failed to create mask image buffer - dimension mismatch")
                })?;
        let img_gaus_f32 = ImageBuffer::<Luma<f32>, Vec<f32>>::from_raw(
            w as u32, h as u32, gaus_dt,
        )
        .ok_or_else(|| anyhow!("Failed to create gaussian image buffer - dimension mismatch"))?;

        let resized_mask = imageops::resize(&img_mask_f32, 256, 256, FilterType::Triangle);
        let resized_gaus = imageops::resize(&img_gaus_f32, 256, 256, FilterType::Triangle);

        let rm_raw = resized_mask.as_raw();
        let rg_raw = resized_gaus.as_raw();
        let mut mask_input_flat = vec![0.0f32; 256 * 256];

        for i in 0..(256 * 256) {
            let m_val = rm_raw[i];
            let mut g_val = rg_raw[i];
            if g_val <= 0.0 {
                g_val = 1.0;
            }
            mask_input_flat[i] = m_val * g_val;
        }

        mask_input = Array::from_shape_vec((1, 1, 256, 256), mask_input_flat)
            .map_err(|e| anyhow::anyhow!("Mask input shape mismatch: {}", e))?
            .into_dyn();
        has_mask_input = 1.0;
    }

    let gray_mask = GrayImage::from_raw(final_w as u32, final_h as u32, final_mask_data)
        .ok_or_else(|| anyhow::anyhow!("Failed to create mask image from raw data"))?;

    let feathered_mask = image::imageops::blur(&gray_mask, 2.0);

    Ok(feathered_mask)
}

pub fn run_sky_seg_model(
    image: &DynamicImage,
    sky_seg_session: &Mutex<Session>,
) -> Result<GrayImage> {
    let (orig_width, orig_height) = image.dimensions();

    let resized_image = image.resize(SKYSEG_INPUT_SIZE, SKYSEG_INPUT_SIZE, FilterType::Triangle);
    let (resized_w, resized_h) = resized_image.dimensions();
    let resized_rgb = resized_image.into_rgb8();
    let raw_pixels = resized_rgb.as_raw();

    let paste_x = ((SKYSEG_INPUT_SIZE - resized_w) / 2) as usize;
    let paste_y = ((SKYSEG_INPUT_SIZE - resized_h) / 2) as usize;

    let mut input_tensor: Array<f32, _> =
        Array::zeros((1, 3, SKYSEG_INPUT_SIZE as usize, SKYSEG_INPUT_SIZE as usize));

    let mean = [0.485, 0.456, 0.406];
    let std = [0.229, 0.224, 0.225];

    let rw = resized_w as usize;
    let rh = resized_h as usize;

    for y in 0..rh {
        for x in 0..rw {
            let idx = (y * rw + x) * 3;
            let dest_y = y + paste_y;
            let dest_x = x + paste_x;

            input_tensor[[0, 0, dest_y, dest_x]] =
                (raw_pixels[idx] as f32 / 255.0 - mean[0]) / std[0];
            input_tensor[[0, 1, dest_y, dest_x]] =
                (raw_pixels[idx + 1] as f32 / 255.0 - mean[1]) / std[1];
            input_tensor[[0, 2, dest_y, dest_x]] =
                (raw_pixels[idx + 2] as f32 / 255.0 - mean[2]) / std[2];
        }
    }

    let input_tensor_dyn = input_tensor.into_dyn();
    let t_input = Tensor::from_array(input_tensor_dyn.as_standard_layout().into_owned())?;

    let mut session = sky_seg_session.lock_resilient();
    let outputs = session.run(ort::inputs![t_input])?;
    let output_tensor = outputs[0].try_extract_array::<f32>()?.to_owned();
    let out_slice = output_tensor.as_slice().ok_or_else(|| {
        anyhow!("Failed to extract output tensor data - tensor may not be contiguous")
    })?;

    let mut min_val = f32::MAX;
    let mut max_val = f32::MIN;
    for &v in out_slice {
        min_val = min_val.min(v);
        max_val = max_val.max(v);
    }

    let range = max_val - min_val;
    let scale = if range > 1e-6 { 255.0 / range } else { 0.0 };

    let usize_size = SKYSEG_INPUT_SIZE as usize;
    let mut cropped_mask_data = Vec::with_capacity(rw * rh);

    for y in 0..rh {
        let src_y = y + paste_y;
        for x in 0..rw {
            let src_x = x + paste_x;
            let val = out_slice[src_y * usize_size + src_x];
            let pixel = if range > 1e-6 {
                ((val - min_val) * scale) as u8
            } else {
                0
            };
            cropped_mask_data.push(pixel);
        }
    }

    let cropped_mask = GrayImage::from_raw(resized_w, resized_h, cropped_mask_data)
        .ok_or_else(|| anyhow::anyhow!("Failed to create mask from Sky Segmentation output"))?;

    let final_mask = imageops::resize(&cropped_mask, orig_width, orig_height, FilterType::Triangle);

    Ok(final_mask)
}

pub fn run_u2netp_model(
    image: &DynamicImage,
    u2netp_session: &Mutex<Session>,
) -> Result<GrayImage> {
    let (orig_width, orig_height) = image.dimensions();

    let resized_image = image.resize(U2NETP_INPUT_SIZE, U2NETP_INPUT_SIZE, FilterType::Triangle);
    let (resized_w, resized_h) = resized_image.dimensions();
    let resized_rgb = resized_image.into_rgb8();
    let raw_pixels = resized_rgb.as_raw();

    let paste_x = ((U2NETP_INPUT_SIZE - resized_w) / 2) as usize;
    let paste_y = ((U2NETP_INPUT_SIZE - resized_h) / 2) as usize;

    let mut input_tensor: Array<f32, _> =
        Array::zeros((1, 3, U2NETP_INPUT_SIZE as usize, U2NETP_INPUT_SIZE as usize));

    let mean = [0.485, 0.456, 0.406];
    let std = [0.229, 0.224, 0.225];

    let rw = resized_w as usize;
    let rh = resized_h as usize;

    for y in 0..rh {
        for x in 0..rw {
            let idx = (y * rw + x) * 3;
            let dest_y = y + paste_y;
            let dest_x = x + paste_x;

            input_tensor[[0, 0, dest_y, dest_x]] =
                (raw_pixels[idx] as f32 / 255.0 - mean[0]) / std[0];
            input_tensor[[0, 1, dest_y, dest_x]] =
                (raw_pixels[idx + 1] as f32 / 255.0 - mean[1]) / std[1];
            input_tensor[[0, 2, dest_y, dest_x]] =
                (raw_pixels[idx + 2] as f32 / 255.0 - mean[2]) / std[2];
        }
    }

    let input_tensor_dyn = input_tensor.into_dyn();
    let t_input = Tensor::from_array(input_tensor_dyn.as_standard_layout().into_owned())?;

    let mut session = u2netp_session.lock_resilient();
    let outputs = session.run(ort::inputs![t_input])?;
    let output_tensor = outputs[0].try_extract_array::<f32>()?.to_owned();
    let out_slice = output_tensor.as_slice().ok_or_else(|| {
        anyhow!("Failed to extract output tensor data - tensor may not be contiguous")
    })?;

    let mut min_val = f32::MAX;
    let mut max_val = f32::MIN;
    for &v in out_slice {
        min_val = min_val.min(v);
        max_val = max_val.max(v);
    }

    let range = max_val - min_val;
    let scale = if range > 1e-6 { 255.0 / range } else { 0.0 };

    let usize_size = U2NETP_INPUT_SIZE as usize;
    let mut cropped_mask_data = Vec::with_capacity(rw * rh);

    for y in 0..rh {
        let src_y = y + paste_y;
        for x in 0..rw {
            let src_x = x + paste_x;
            let val = out_slice[src_y * usize_size + src_x];
            let pixel = if range > 1e-6 {
                ((val - min_val) * scale) as u8
            } else {
                0
            };
            cropped_mask_data.push(pixel);
        }
    }

    let cropped_mask = GrayImage::from_raw(resized_w, resized_h, cropped_mask_data)
        .ok_or_else(|| anyhow::anyhow!("Failed to create mask from U-2-Netp output"))?;

    let final_mask = imageops::resize(&cropped_mask, orig_width, orig_height, FilterType::Triangle);

    Ok(final_mask)
}

pub fn run_depth_anything_model(
    image: &DynamicImage,
    depth_session: &Mutex<Session>,
) -> Result<GrayImage> {
    let (orig_width, orig_height) = image.dimensions();
    if orig_width == 0 || orig_height == 0 {
        anyhow::bail!("Input image has zero dimensions for depth estimation");
    }

    let resized_image = image.resize(DEPTH_INPUT_SIZE, DEPTH_INPUT_SIZE, FilterType::Triangle);
    let (resized_w, resized_h) = resized_image.dimensions();
    let resized_rgb = resized_image.into_rgb8();
    let raw_pixels = resized_rgb.as_raw();

    let paste_x = ((DEPTH_INPUT_SIZE - resized_w) / 2) as usize;
    let paste_y = ((DEPTH_INPUT_SIZE - resized_h) / 2) as usize;

    let mut input_tensor: Array<f32, _> =
        Array::zeros((1, 3, DEPTH_INPUT_SIZE as usize, DEPTH_INPUT_SIZE as usize));

    let mean = [0.485, 0.456, 0.406];
    let std = [0.229, 0.224, 0.225];

    let rw = resized_w as usize;
    let rh = resized_h as usize;

    for y in 0..rh {
        for x in 0..rw {
            let idx = (y * rw + x) * 3;
            let dest_y = y + paste_y;
            let dest_x = x + paste_x;

            input_tensor[[0, 0, dest_y, dest_x]] =
                (raw_pixels[idx] as f32 / 255.0 - mean[0]) / std[0];
            input_tensor[[0, 1, dest_y, dest_x]] =
                (raw_pixels[idx + 1] as f32 / 255.0 - mean[1]) / std[1];
            input_tensor[[0, 2, dest_y, dest_x]] =
                (raw_pixels[idx + 2] as f32 / 255.0 - mean[2]) / std[2];
        }
    }

    let input_tensor_dyn = input_tensor.into_dyn();
    let t_input = Tensor::from_array(input_tensor_dyn.as_standard_layout().into_owned())?;

    let mut session = depth_session.lock_resilient();
    let outputs = session.run(ort::inputs![t_input])?;
    let output_tensor = outputs[0].try_extract_array::<f32>()?.to_owned();
    let out_slice = output_tensor.as_slice().ok_or_else(|| {
        anyhow!("Failed to extract output tensor data - tensor may not be contiguous")
    })?;

    let usize_size = DEPTH_INPUT_SIZE as usize;

    let mut min_val = f32::MAX;
    let mut max_val = f32::MIN;
    for y in 0..rh {
        let src_y = y + paste_y;
        for x in 0..rw {
            let src_x = x + paste_x;
            let val = out_slice[src_y * usize_size + src_x];
            min_val = min_val.min(val);
            max_val = max_val.max(val);
        }
    }

    let range = max_val - min_val;
    let scale = if range > 1e-6 { 255.0 / range } else { 0.0 };

    let mut cropped_depth_data = Vec::with_capacity(rw * rh);

    for y in 0..rh {
        let src_y = y + paste_y;
        for x in 0..rw {
            let src_x = x + paste_x;
            let val = out_slice[src_y * usize_size + src_x];
            let pixel = if range > 1e-6 {
                ((val - min_val) * scale) as u8
            } else {
                0
            };
            cropped_depth_data.push(pixel);
        }
    }

    let depth_map = GrayImage::from_raw(resized_w, resized_h, cropped_depth_data)
        .ok_or_else(|| anyhow::anyhow!("Failed to create mask from Depth output"))?;

    let final_depth = imageops::resize(&depth_map, orig_width, orig_height, FilterType::Triangle);

    Ok(final_depth)
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct AiSubjectMaskParameters {
    pub start_x: f64,
    pub start_y: f64,
    pub end_x: f64,
    pub end_y: f64,
    #[serde(default, rename = "mask_data_base64", alias = "maskDataBase64")]
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
    #[serde(default, rename = "mask_data_base64", alias = "maskDataBase64")]
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
    #[serde(default, rename = "mask_data_base64", alias = "maskDataBase64")]
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
    #[serde(default, rename = "mask_data_base64", alias = "maskDataBase64")]
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
