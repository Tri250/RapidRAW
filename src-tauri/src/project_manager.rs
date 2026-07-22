use anyhow::{Context, Result};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::Path;

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS edit_versions (
    id            TEXT PRIMARY KEY,
    image_hash    TEXT NOT NULL,
    parent_id     TEXT,
    adjustments   TEXT NOT NULL,
    name          TEXT NOT NULL,
    created_at    INTEGER NOT NULL,
    is_current    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS thumbnails (
    image_hash    TEXT PRIMARY KEY,
    data          BLOB NOT NULL,
    width         INTEGER NOT NULL,
    height        INTEGER NOT NULL,
    format        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_labels (
    image_hash    TEXT NOT NULL,
    label         TEXT NOT NULL,
    confidence    REAL NOT NULL,
    model         TEXT NOT NULL,
    PRIMARY KEY (image_hash, label, model)
);

CREATE TABLE IF NOT EXISTS collections (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    query         TEXT NOT NULL,
    created_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_edit_versions_image_hash
    ON edit_versions(image_hash);

CREATE INDEX IF NOT EXISTS idx_edit_versions_is_current
    ON edit_versions(image_hash, is_current);

CREATE INDEX IF NOT EXISTS idx_ai_labels_label
    ON ai_labels(label);

CREATE INDEX IF NOT EXISTS idx_ai_labels_image_hash
    ON ai_labels(image_hash);
"#;

// ---------------------------------------------------------------------------
// ProjectDb
// ---------------------------------------------------------------------------

/// SQLite-backed project database storing edit versions, thumbnails, AI labels,
/// and smart collections for a RAW photo editor.
pub struct ProjectDb {
    conn: Connection,
}

impl ProjectDb {
    /// Open (or create) the project database at `path`, ensuring the schema is
    /// up to date.
    pub fn open(path: &Path) -> Result<Self> {
        let conn = Connection::open(path)
            .with_context(|| format!("Failed to open project database at {:?}", path))?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
            .context("Failed to set pragmas")?;
        conn.execute_batch(SCHEMA)
            .context("Failed to initialise schema")?;
        Ok(Self { conn })
    }

    /// Return a reference to the underlying connection for advanced usage.
    pub fn connection(&self) -> &Connection {
        &self.conn
    }
}

// ---------------------------------------------------------------------------
// EditVersion
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EditVersion {
    pub id: String,
    pub image_hash: String,
    pub parent_id: Option<String>,
    pub adjustments_json: String,
    pub name: String,
    pub created_at: i64,
    pub is_current: bool,
}

impl EditVersion {
    fn from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get("id")?,
            image_hash: row.get("image_hash")?,
            parent_id: row.get("parent_id")?,
            adjustments_json: row.get("adjustments")?,
            name: row.get("name")?,
            created_at: row.get("created_at")?,
            is_current: row.get::<_, i32>("is_current")? != 0,
        })
    }
}

/// Create a new edit version. The first version for an image will
/// automatically be marked as current.
pub fn create_version(
    db: &ProjectDb,
    id: &str,
    image_hash: &str,
    parent_id: Option<&str>,
    adjustments_json: &str,
    name: &str,
    created_at: i64,
) -> Result<EditVersion> {
    // Determine whether this is the first version for the image.
    let count: i64 = db
        .connection()
        .query_row(
            "SELECT COUNT(*) FROM edit_versions WHERE image_hash = ?1",
            params![image_hash],
            |r| r.get(0),
        )
        .context("Failed to count existing versions")?;

    let is_current = if count == 0 { 1 } else { 0 };

    db.connection()
        .execute(
            "INSERT INTO edit_versions (id, image_hash, parent_id, adjustments, name, created_at, is_current)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![id, image_hash, parent_id, adjustments_json, name, created_at, is_current],
        )
        .with_context(|| format!("Failed to insert edit version '{}'", id))?;

    Ok(EditVersion {
        id: id.to_string(),
        image_hash: image_hash.to_string(),
        parent_id: parent_id.map(String::from),
        adjustments_json: adjustments_json.to_string(),
        name: name.to_string(),
        created_at,
        is_current: is_current != 0,
    })
}

/// Retrieve a single edit version by its id.
pub fn get_version(db: &ProjectDb, id: &str) -> Result<Option<EditVersion>> {
    let mut stmt = db
        .connection()
        .prepare(
            "SELECT id, image_hash, parent_id, adjustments, name, created_at, is_current
             FROM edit_versions WHERE id = ?1",
        )
        .context("Failed to prepare get_version")?;

    let mut rows = stmt.query(params![id])?;
    match rows.next()? {
        Some(row) => Ok(Some(EditVersion::from_row(row)?)),
        None => Ok(None),
    }
}

/// List every edit version for a given image, ordered by creation time.
pub fn list_versions_for_image(db: &ProjectDb, image_hash: &str) -> Result<Vec<EditVersion>> {
    let mut stmt = db
        .connection()
        .prepare(
            "SELECT id, image_hash, parent_id, adjustments, name, created_at, is_current
             FROM edit_versions WHERE image_hash = ?1 ORDER BY created_at ASC",
        )
        .context("Failed to prepare list_versions_for_image")?;

    let rows = stmt
        .query_map(params![image_hash], |row| EditVersion::from_row(row))
        .context("Failed to execute list_versions_for_image")?;

    let mut versions = Vec::new();
    for v in rows {
        versions.push(v?);
    }
    Ok(versions)
}

/// Return the currently active version for an image, if any.
pub fn get_current_version(db: &ProjectDb, image_hash: &str) -> Result<Option<EditVersion>> {
    let mut stmt = db
        .connection()
        .prepare(
            "SELECT id, image_hash, parent_id, adjustments, name, created_at, is_current
             FROM edit_versions WHERE image_hash = ?1 AND is_current = 1",
        )
        .context("Failed to prepare get_current_version")?;

    let mut rows = stmt.query(params![image_hash])?;
    match rows.next()? {
        Some(row) => Ok(Some(EditVersion::from_row(row)?)),
        None => Ok(None),
    }
}

/// Mark `id` as the current version for its image, unsetting any previous
/// current version for the same image.
pub fn set_current_version(db: &ProjectDb, id: &str) -> Result<()> {
    let image_hash: String = db
        .connection()
        .query_row(
            "SELECT image_hash FROM edit_versions WHERE id = ?1",
            params![id],
            |r| r.get(0),
        )
        .context("Version not found")?;

    db.connection()
        .execute(
            "UPDATE edit_versions SET is_current = 0 WHERE image_hash = ?1",
            params![image_hash],
        )
        .context("Failed to clear current version flag")?;

    db.connection()
        .execute(
            "UPDATE edit_versions SET is_current = 1 WHERE id = ?1",
            params![id],
        )
        .context("Failed to set new current version")?;

    Ok(())
}

/// Clone an existing version, creating a new row with a new id. The clone
/// starts as non-current.
pub fn clone_version(
    db: &ProjectDb,
    source_id: &str,
    new_id: &str,
    new_name: &str,
    created_at: i64,
) -> Result<EditVersion> {
    let src = get_version(db, source_id)?
        .with_context(|| format!("Source version '{}' not found", source_id))?;

    create_version(
        db,
        new_id,
        &src.image_hash,
        Some(source_id),
        &src.adjustments_json,
        new_name,
        created_at,
    )
}

// ---------------------------------------------------------------------------
// ThumbnailCache
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Thumbnail {
    pub image_hash: String,
    pub data: Vec<u8>,
    pub width: i32,
    pub height: i32,
    pub format: String,
}

/// Store a thumbnail blob for the given image hash.
pub fn store_thumbnail(
    db: &ProjectDb,
    image_hash: &str,
    data: &[u8],
    width: i32,
    height: i32,
    format: &str,
) -> Result<()> {
    db.connection()
        .execute(
            "INSERT OR REPLACE INTO thumbnails (image_hash, data, width, height, format)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![image_hash, data, width, height, format],
        )
        .with_context(|| format!("Failed to store thumbnail for '{}'", image_hash))?;
    Ok(())
}

/// Retrieve a previously stored thumbnail.
pub fn get_thumbnail(db: &ProjectDb, image_hash: &str) -> Result<Option<Thumbnail>> {
    let mut stmt = db
        .connection()
        .prepare(
            "SELECT image_hash, data, width, height, format FROM thumbnails WHERE image_hash = ?1",
        )
        .context("Failed to prepare get_thumbnail")?;

    let mut rows = stmt.query(params![image_hash])?;
    match rows.next()? {
        Some(row) => Ok(Some(Thumbnail {
            image_hash: row.get(0)?,
            data: row.get(1)?,
            width: row.get(2)?,
            height: row.get(3)?,
            format: row.get(4)?,
        })),
        None => Ok(None),
    }
}

/// Check whether a thumbnail exists for the given image hash.
pub fn has_thumbnail(db: &ProjectDb, image_hash: &str) -> Result<bool> {
    let count: i64 = db
        .connection()
        .query_row(
            "SELECT COUNT(*) FROM thumbnails WHERE image_hash = ?1",
            params![image_hash],
            |r| r.get(0),
        )
        .context("Failed to check thumbnail existence")?;
    Ok(count > 0)
}

// ---------------------------------------------------------------------------
// AiLabel
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiLabel {
    pub image_hash: String,
    pub label: String,
    pub confidence: f64,
    pub model: String,
}

/// Add (or replace) an AI-generated label for an image.
pub fn add_label(
    db: &ProjectDb,
    image_hash: &str,
    label: &str,
    confidence: f64,
    model: &str,
) -> Result<()> {
    db.connection()
        .execute(
            "INSERT OR REPLACE INTO ai_labels (image_hash, label, confidence, model)
             VALUES (?1, ?2, ?3, ?4)",
            params![image_hash, label, confidence, model],
        )
        .with_context(|| {
            format!(
                "Failed to add label '{}' for '{}' via '{}'",
                label, image_hash, model
            )
        })?;
    Ok(())
}

/// Get all labels for a given image.
pub fn get_labels_for_image(db: &ProjectDb, image_hash: &str) -> Result<Vec<AiLabel>> {
    let mut stmt = db
        .connection()
        .prepare(
            "SELECT image_hash, label, confidence, model
             FROM ai_labels WHERE image_hash = ?1 ORDER BY confidence DESC",
        )
        .context("Failed to prepare get_labels_for_image")?;

    let rows = stmt
        .query_map(params![image_hash], |row| {
            Ok(AiLabel {
                image_hash: row.get(0)?,
                label: row.get(1)?,
                confidence: row.get(2)?,
                model: row.get(3)?,
            })
        })
        .context("Failed to execute get_labels_for_image")?;

    let mut labels = Vec::new();
    for l in rows {
        labels.push(l?);
    }
    Ok(labels)
}

/// Search for images that have been tagged with a given label (case-insensitive
/// substring match).
pub fn search_by_label(db: &ProjectDb, label_query: &str) -> Result<Vec<AiLabel>> {
    let pattern = format!("%{}%", label_query);
    let mut stmt = db
        .connection()
        .prepare(
            "SELECT image_hash, label, confidence, model
             FROM ai_labels WHERE label LIKE ?1 ORDER BY confidence DESC",
        )
        .context("Failed to prepare search_by_label")?;

    let rows = stmt
        .query_map(params![pattern], |row| {
            Ok(AiLabel {
                image_hash: row.get(0)?,
                label: row.get(1)?,
                confidence: row.get(2)?,
                model: row.get(3)?,
            })
        })
        .context("Failed to execute search_by_label")?;

    let mut labels = Vec::new();
    for l in rows {
        labels.push(l?);
    }
    Ok(labels)
}

/// Return every unique label across all images and models.
pub fn get_all_unique_labels(db: &ProjectDb) -> Result<Vec<String>> {
    let mut stmt = db
        .connection()
        .prepare("SELECT DISTINCT label FROM ai_labels ORDER BY label ASC")
        .context("Failed to prepare get_all_unique_labels")?;

    let rows = stmt
        .query_map([], |row| row.get(0))
        .context("Failed to execute get_all_unique_labels")?;

    let mut labels = Vec::new();
    for l in rows {
        labels.push(l?);
    }
    Ok(labels)
}

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Collection {
    pub id: String,
    pub name: String,
    pub query: String,
    pub created_at: i64,
}

/// Create a new smart collection.
pub fn create_collection(
    db: &ProjectDb,
    id: &str,
    name: &str,
    query: &str,
    created_at: i64,
) -> Result<Collection> {
    db.connection()
        .execute(
            "INSERT INTO collections (id, name, query, created_at) VALUES (?1, ?2, ?3, ?4)",
            params![id, name, query, created_at],
        )
        .with_context(|| format!("Failed to create collection '{}'", id))?;

    Ok(Collection {
        id: id.to_string(),
        name: name.to_string(),
        query: query.to_string(),
        created_at,
    })
}

/// List all collections, ordered by name.
pub fn list_collections(db: &ProjectDb) -> Result<Vec<Collection>> {
    let mut stmt = db
        .connection()
        .prepare("SELECT id, name, query, created_at FROM collections ORDER BY name ASC")
        .context("Failed to prepare list_collections")?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Collection {
                id: row.get(0)?,
                name: row.get(1)?,
                query: row.get(2)?,
                created_at: row.get(3)?,
            })
        })
        .context("Failed to execute list_collections")?;

    let mut collections = Vec::new();
    for c in rows {
        collections.push(c?);
    }
    Ok(collections)
}

/// Delete a collection by id.
pub fn delete_collection(db: &ProjectDb, id: &str) -> Result<bool> {
    let affected = db
        .connection()
        .execute("DELETE FROM collections WHERE id = ?1", params![id])
        .context("Failed to delete collection")?;
    Ok(affected > 0)
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Global handle for the currently open project database.
/// Since Tauri commands take simple parameters, we use a global Mutex
/// for the DB connection.
use std::sync::Mutex as StdMutex;

static PROJECT_DB: StdMutex<Option<ProjectDb>> = StdMutex::new(None);

fn with_db<F, T>(f: F) -> Result<T, String>
where
    F: FnOnce(&ProjectDb) -> anyhow::Result<T>,
{
    let guard = PROJECT_DB.lock().unwrap();
    let db = guard
        .as_ref()
        .ok_or_else(|| "No project database is currently open".to_string())?;
    f(db).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn project_open(db_path: String) -> Result<String, String> {
    let path = Path::new(&db_path);
    let db = ProjectDb::open(path).map_err(|e| format!("Failed to open project DB: {}", e))?;
    let mut guard = PROJECT_DB.lock().unwrap();
    *guard = Some(db);
    Ok(format!("Project database opened: {}", db_path))
}

#[tauri::command]
pub fn project_close() -> Result<(), String> {
    let mut guard = PROJECT_DB.lock().unwrap();
    *guard = None;
    Ok(())
}

#[tauri::command]
pub fn project_create_edit_version(
    db_path: String,
    image_hash: String,
    parent_id: Option<String>,
    adjustments: String,
    name: String,
) -> Result<serde_json::Value, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let created_at = chrono::Utc::now().timestamp();
    let version = with_db(|db| {
        create_version(
            db,
            &id,
            &image_hash,
            parent_id.as_deref(),
            &adjustments,
            &name,
            created_at,
        )
    })?;
    serde_json::to_value(version).map_err(|e| format!("Serialization error: {}", e))
}

#[tauri::command]
pub fn project_list_versions(
    db_path: String,
    image_hash: String,
) -> Result<Vec<serde_json::Value>, String> {
    let versions = with_db(|db| list_versions_for_image(db, &image_hash))?;
    versions
        .iter()
        .map(|v| serde_json::to_value(v).map_err(|e| format!("Serialization error: {}", e)))
        .collect()
}

#[tauri::command]
pub fn project_get_current_version(
    db_path: String,
    image_hash: String,
) -> Result<serde_json::Value, String> {
    let version = with_db(|db| get_current_version(db, &image_hash))?;
    match version {
        Some(v) => serde_json::to_value(v).map_err(|e| format!("Serialization error: {}", e)),
        None => Ok(serde_json::Value::Null),
    }
}

#[tauri::command]
pub fn project_set_current_version(
    db_path: String,
    version_id: String,
) -> Result<(), String> {
    with_db(|db| set_current_version(db, &version_id))
}

#[tauri::command]
pub fn project_store_thumbnail(
    db_path: String,
    image_hash: String,
    data_base64: String,
    width: u32,
    height: u32,
    format: String,
) -> Result<(), String> {
    use base64::{Engine as _, engine::general_purpose};
    let data = general_purpose::STANDARD
        .decode(&data_base64)
        .map_err(|e| format!("Failed to decode base64 thumbnail data: {}", e))?;
    with_db(|db| {
        store_thumbnail(db, &image_hash, &data, width as i32, height as i32, &format)
    })
}

#[tauri::command]
pub fn project_get_thumbnail(
    db_path: String,
    image_hash: String,
) -> Result<serde_json::Value, String> {
    use base64::{Engine as _, engine::general_purpose};
    let thumb = with_db(|db| get_thumbnail(db, &image_hash))?;
    match thumb {
        Some(t) => {
            let data_b64 = general_purpose::STANDARD.encode(&t.data);
            Ok(serde_json::json!({
                "image_hash": t.image_hash,
                "data_base64": data_b64,
                "width": t.width,
                "height": t.height,
                "format": t.format,
            }))
        }
        None => Ok(serde_json::Value::Null),
    }
}

#[tauri::command]
pub fn project_add_ai_label(
    db_path: String,
    image_hash: String,
    label: String,
    confidence: f64,
    model: String,
) -> Result<(), String> {
    with_db(|db| {
        add_label(db, &image_hash, &label, confidence, &model)
    })
}

#[tauri::command]
pub fn project_get_labels(
    db_path: String,
    image_hash: String,
) -> Result<Vec<serde_json::Value>, String> {
    let labels = with_db(|db| get_labels_for_image(db, &image_hash))?;
    labels
        .iter()
        .map(|l| serde_json::to_value(l).map_err(|e| format!("Serialization error: {}", e)))
        .collect()
}

#[tauri::command]
pub fn project_search_labels(
    db_path: String,
    label_query: String,
) -> Result<Vec<serde_json::Value>, String> {
    let labels = with_db(|db| search_by_label(db, &label_query))?;
    labels
        .iter()
        .map(|l| serde_json::to_value(l).map_err(|e| format!("Serialization error: {}", e)))
        .collect()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use tempfile::NamedTempFile;

    fn test_db() -> ProjectDb {
        let tf = NamedTempFile::new().unwrap();
        let path = tf.path();
        ProjectDb::open(path).unwrap()
    }

    #[test]
    fn test_create_and_get_version() {
        let db = test_db();
        let v = create_version(
            &db,
            "v1",
            "hash_a",
            None,
            r#"{"exposure":1.0}"#,
            "Original",
            1000,
        )
        .unwrap();
        assert_eq!(v.id, "v1");
        assert!(v.is_current);

        let fetched = get_version(&db, "v1").unwrap().unwrap();
        assert_eq!(fetched.name, "Original");
    }

    #[test]
    fn test_set_current_version() {
        let db = test_db();
        create_version(&db, "v1", "hash_a", None, "{}", "V1", 1000).unwrap();
        create_version(&db, "v2", "hash_a", Some("v1"), "{}", "V2", 2000).unwrap();

        let current = get_current_version(&db, "hash_a").unwrap().unwrap();
        assert_eq!(current.id, "v1"); // first one auto-current

        set_current_version(&db, "v2").unwrap();
        let current = get_current_version(&db, "hash_a").unwrap().unwrap();
        assert_eq!(current.id, "v2");
    }

    #[test]
    fn test_clone_version() {
        let db = test_db();
        create_version(&db, "v1", "hash_a", None, r#"{"contrast":0.5}"#, "V1", 1000).unwrap();
        let cloned = clone_version(&db, "v1", "v1_copy", "V1 Copy", 3000).unwrap();
        assert_eq!(cloned.parent_id, Some("v1".to_string()));
        assert_eq!(cloned.adjustments_json, r#"{"contrast":0.5}"#);
        assert!(!cloned.is_current);
    }

    #[test]
    fn test_thumbnail_roundtrip() {
        let db = test_db();
        assert!(!has_thumbnail(&db, "hash_a").unwrap());
        store_thumbnail(&db, "hash_a", &[1, 2, 3], 64, 48, "webp").unwrap();
        assert!(has_thumbnail(&db, "hash_a").unwrap());

        let thumb = get_thumbnail(&db, "hash_a").unwrap().unwrap();
        assert_eq!(thumb.data, vec![1, 2, 3]);
        assert_eq!(thumb.width, 64);
    }

    #[test]
    fn test_ai_labels() {
        let db = test_db();
        add_label(&db, "h1", "landscape", 0.95, "mobilenet").unwrap();
        add_label(&db, "h1", "sunset", 0.80, "mobilenet").unwrap();
        add_label(&db, "h2", "landscape", 0.90, "resnet").unwrap();

        let labels = get_labels_for_image(&db, "h1").unwrap();
        assert_eq!(labels.len(), 2);
        assert_eq!(labels[0].label, "landscape"); // higher confidence first

        let found = search_by_label(&db, "land").unwrap();
        assert_eq!(found.len(), 2); // h1 + h2

        let unique = get_all_unique_labels(&db).unwrap();
        assert_eq!(unique, vec!["landscape", "sunset"]);
    }

    #[test]
    fn test_collections() {
        let db = test_db();
        create_collection(&db, "c1", "Sunsets", "label:sunset", 1000).unwrap();
        create_collection(&db, "c2", "Landscapes", "label:landscape", 2000).unwrap();

        let cols = list_collections(&db).unwrap();
        assert_eq!(cols.len(), 2);
        // alphabetically ordered
        assert_eq!(cols[0].name, "Landscapes");

        assert!(delete_collection(&db, "c1").unwrap());
        assert!(!delete_collection(&db, "c1").unwrap()); // already gone
        assert_eq!(list_collections(&db).unwrap().len(), 1);
    }
}
