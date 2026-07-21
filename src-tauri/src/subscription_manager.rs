use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PresetSubscriptionList {
    pub version: i32,
    pub name: String,
    pub author: String,
    pub build: i32,
    pub presets: Vec<SubscriptionPreset>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SubscriptionPreset {
    #[serde(default)]
    pub id: Option<String>,
    pub name: String,
    #[serde(default)]
    pub cover_path: Option<String>,
    #[serde(default, rename = "galleryImages")]
    pub gallery_images: Option<Vec<String>>,
    #[serde(default)]
    pub author: String,
    #[serde(default)]
    pub creator: Option<String>,
    #[serde(default)]
    pub mode: Option<String>,
    pub adjustments: serde_json::Value,
    #[serde(default, rename = "includeMasks")]
    pub include_masks: Option<bool>,
    #[serde(default, rename = "includeCropTransform")]
    pub include_crop_transform: Option<bool>,
    #[serde(default, rename = "presetType")]
    pub preset_type: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
    #[serde(default)]
    pub is_new: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GalleryPreset {
    pub id: String,
    pub name: String,
    pub creator: String,
    #[serde(default)]
    pub cover_url: Option<String>,
    #[serde(default)]
    pub gallery_urls: Vec<String>,
    pub adjustments: serde_json::Value,
    #[serde(default, rename = "includeMasks")]
    pub include_masks: Option<bool>,
    #[serde(default, rename = "includeCropTransform")]
    pub include_crop_transform: Option<bool>,
    #[serde(default, rename = "presetType")]
    pub preset_type: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
    #[serde(default)]
    pub is_new: bool,
    #[serde(default, rename = "sourceSubscriptionId")]
    pub source_subscription_id: Option<String>,
}

#[derive(Serialize, Debug, Clone)]
pub struct SubscriptionUpdateInfo {
    pub has_update: bool,
    pub remote_build: i32,
    pub local_build: i32,
    pub preset_count: usize,
}

fn get_subscriptions_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    let sub_dir = app_dir.join("subscriptions");
    fs::create_dir_all(&sub_dir).map_err(|e| e.to_string())?;
    Ok(sub_dir)
}

fn hash_url(url: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    url.hash(&mut hasher);
    format!("{:x}", hasher.finish())
}

#[tauri::command]
pub async fn fetch_subscription_presets(url: String) -> Result<PresetSubscriptionList, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(&url)
        .header("User-Agent", "RapidRAW-App")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch subscription: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Server returned error: {}", response.status()));
    }

    let text = response.text().await.map_err(|e| e.to_string())?;

    let list: PresetSubscriptionList =
        serde_json::from_str(&text).map_err(|e| format!("Failed to parse JSON: {}", e))?;

    if list.name.is_empty() || list.author.is_empty() {
        return Err("Subscription missing required fields (name/author)".to_string());
    }

    Ok(list)
}

#[tauri::command]
pub async fn check_subscription_update(
    url: String,
    local_build: i32,
) -> Result<SubscriptionUpdateInfo, String> {
    let list = fetch_subscription_presets(url).await?;

    Ok(SubscriptionUpdateInfo {
        has_update: list.build > local_build,
        remote_build: list.build,
        local_build,
        preset_count: list.presets.len(),
    })
}

#[tauri::command]
pub async fn download_subscription(
    app: tauri::AppHandle,
    url: String,
    sub_id: String,
) -> Result<PresetSubscriptionList, String> {
    let list = fetch_subscription_presets(url).await?;
    let sub_dir = get_subscriptions_dir(&app)?;
    let file_path = sub_dir.join(format!("{}.json", sub_id));

    let json = serde_json::to_string_pretty(&list).map_err(|e| e.to_string())?;
    fs::write(&file_path, json).map_err(|e| e.to_string())?;

    Ok(list)
}

#[tauri::command]
pub fn load_all_subscription_presets(app: tauri::AppHandle) -> Result<Vec<GalleryPreset>, String> {
    let sub_dir = get_subscriptions_dir(&app)?;
    let mut all_presets: Vec<GalleryPreset> = Vec::new();

    if !sub_dir.exists() {
        return Ok(all_presets);
    }

    let entries = fs::read_dir(&sub_dir).map_err(|e| e.to_string())?;

    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();

        if path.extension().and_then(|s| s.to_str()) != Some("json") {
            continue;
        }

        let source_id = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown")
            .to_string();

        let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let list: PresetSubscriptionList =
            serde_json::from_str(&content).map_err(|e| format!("Parse error in {}: {}", path.display(), e))?;

        for (idx, preset) in list.presets.into_iter().enumerate() {
            let id = preset.id.clone().unwrap_or_else(|| format!("{}_preset_{}", source_id, idx));
            let prefixed_id = format!("{}_{}", source_id, id);

            let mut gallery_urls: Vec<String> = Vec::new();
            if let Some(cover) = &preset.cover_path {
                gallery_urls.push(cover.clone());
            }
            if let Some(images) = &preset.gallery_images {
                for img in images {
                    if !gallery_urls.contains(img) {
                        gallery_urls.push(img.clone());
                    }
                }
            }

            all_presets.push(GalleryPreset {
                id: prefixed_id,
                name: preset.name,
                creator: preset.creator.unwrap_or(preset.author),
                cover_url: preset.cover_path,
                gallery_urls,
                adjustments: preset.adjustments,
                include_masks: preset.include_masks,
                include_crop_transform: preset.include_crop_transform,
                preset_type: preset.preset_type,
                description: preset.description,
                tags: preset.tags,
                is_new: preset.is_new,
                source_subscription_id: Some(source_id.clone()),
            });
        }
    }

    // Sort: new presets first, then by name
    all_presets.sort_by(|a, b| {
        let new_cmp = b.is_new.cmp(&a.is_new);
        if new_cmp != std::cmp::Ordering::Equal {
            return new_cmp;
        }
        a.name.cmp(&b.name)
    });

    Ok(all_presets)
}

#[tauri::command]
pub fn delete_subscription_file(app: tauri::AppHandle, sub_id: String) -> Result<(), String> {
    let sub_dir = get_subscriptions_dir(&app)?;
    let file_path = sub_dir.join(format!("{}.json", sub_id));
    if file_path.exists() {
        fs::remove_file(&file_path).map_err(|e| e.to_string())?;
    }
    Ok(())
}
