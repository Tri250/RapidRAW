/// AI Labeling Infrastructure
///
/// Provides vector embedding generation, storage, and similarity search
/// for automatic image tagging. Designed to work with CLIP/SigLIP models
/// via the ai_service module, storing results in the project_manager database.

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ──────────── Constants ────────────

/// Default embedding dimension for CLIP ViT-B/32
pub const DEFAULT_EMBEDDING_DIM: usize = 512;

/// Cosine similarity threshold for "relevant" search results
pub const DEFAULT_SIMILARITY_THRESHOLD: f32 = 0.5;

// ──────────── Types ────────────

/// A vector embedding with metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Embedding {
    /// The vector values
    pub vector: Vec<f32>,
    /// Model that generated this embedding (e.g. "clip-vit-b32")
    pub model: String,
    /// Dimension of the vector
    pub dim: usize,
}

/// A labeled image with confidence
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageLabel {
    /// Hash of the source image file
    pub image_hash: String,
    /// Human-readable label (e.g. "sunset", "portrait")
    pub label: String,
    /// Confidence score [0, 1]
    pub confidence: f32,
    /// Model that generated this label
    pub model: String,
}

/// Search result with similarity score
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    /// Hash of the matching image
    pub image_hash: String,
    /// Cosine similarity score [-1, 1]
    pub similarity: f32,
    /// Labels associated with this image
    pub labels: Vec<String>,
}

/// Label vocabulary entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VocabularyEntry {
    pub label: String,
    pub embedding: Vec<f32>,
}

/// The labeling engine that manages embeddings and search
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LabelingEngine {
    /// Image embeddings: image_hash -> Embedding
    pub image_embeddings: HashMap<String, Embedding>,
    /// Text embeddings for vocabulary: label -> Embedding
    pub vocabulary: HashMap<String, Embedding>,
    /// Image-to-labels mapping: image_hash -> Vec<ImageLabel>
    pub image_labels: HashMap<String, Vec<ImageLabel>>,
    /// Similarity threshold for search
    pub similarity_threshold: f32,
}

impl LabelingEngine {
    /// Create a new empty labeling engine
    pub fn new() -> Self {
        Self {
            image_embeddings: HashMap::new(),
            vocabulary: HashMap::new(),
            image_labels: HashMap::new(),
            similarity_threshold: DEFAULT_SIMILARITY_THRESHOLD,
        }
    }

    /// Create with custom similarity threshold
    pub fn with_threshold(threshold: f32) -> Self {
        Self {
            similarity_threshold: threshold,
            ..Self::new()
        }
    }

    // ──────────── Embedding Management ────────────

    /// Store an image embedding
    pub fn add_image_embedding(&mut self, image_hash: &str, embedding: Embedding) {
        self.image_embeddings.insert(image_hash.to_string(), embedding);
    }

    /// Retrieve an image embedding
    pub fn get_image_embedding(&self, image_hash: &str) -> Option<&Embedding> {
        self.image_embeddings.get(image_hash)
    }

    /// Remove an image embedding and its labels
    pub fn remove_image(&mut self, image_hash: &str) {
        self.image_embeddings.remove(image_hash);
        self.image_labels.remove(image_hash);
    }

    /// Number of indexed images
    pub fn image_count(&self) -> usize {
        self.image_embeddings.len()
    }

    // ──────────── Vocabulary Management ────────────

    /// Add a label to the vocabulary with its text embedding
    pub fn add_vocabulary_entry(&mut self, label: &str, embedding: Embedding) {
        self.vocabulary.insert(label.to_string(), embedding);
    }

    /// Remove a label from the vocabulary
    pub fn remove_vocabulary_entry(&mut self, label: &str) {
        self.vocabulary.remove(label);
    }

    /// Number of vocabulary entries
    pub fn vocabulary_size(&self) -> usize {
        self.vocabulary.len()
    }

    /// Get all vocabulary labels
    pub fn vocabulary_labels(&self) -> Vec<&str> {
        self.vocabulary.keys().map(|s| s.as_str()).collect()
    }

    // ──────────── Auto-Labeling ────────────

    /// Automatically label an image by comparing its embedding against the vocabulary.
    /// Returns labels with confidence above the threshold.
    pub fn auto_label_image(
        &mut self,
        image_hash: &str,
        max_labels: usize,
        min_confidence: f32,
    ) -> Vec<ImageLabel> {
        let image_emb = match self.image_embeddings.get(image_hash) {
            Some(e) => e,
            None => return Vec::new(),
        };

        // Compute similarity against all vocabulary entries
        let mut scored_labels: Vec<(String, f32, String)> = self
            .vocabulary
            .iter()
            .map(|(label, vocab_emb)| {
                let sim = cosine_similarity(&image_emb.vector, &vocab_emb.vector);
                (label.clone(), sim, vocab_emb.model.clone())
            })
            .filter(|(_, conf, _)| *conf >= min_confidence)
            .collect();

        // Sort by confidence descending
        scored_labels.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

        // Take top N
        scored_labels.truncate(max_labels);

        let labels: Vec<ImageLabel> = scored_labels
            .into_iter()
            .map(|(label, confidence, model)| ImageLabel {
                image_hash: image_hash.to_string(),
                label,
                confidence,
                model,
            })
            .collect();

        // Store the labels
        self.image_labels.insert(image_hash.to_string(), labels.clone());

        labels
    }

    /// Get labels for an image
    pub fn get_labels(&self, image_hash: &str) -> Vec<&ImageLabel> {
        self.image_labels
            .get(image_hash)
            .map(|v| v.iter().collect())
            .unwrap_or_default()
    }

    /// Manually add a label to an image
    pub fn add_manual_label(&mut self, label: ImageLabel) {
        self.image_labels
            .entry(label.image_hash.clone())
            .or_insert_with(Vec::new)
            .push(label);
    }

    /// Remove a specific label from an image
    pub fn remove_label(&mut self, image_hash: &str, label: &str, model: &str) {
        if let Some(labels) = self.image_labels.get_mut(image_hash) {
            labels.retain(|l| !(l.label == label && l.model == model));
        }
    }

    // ──────────── Search ────────────

    /// Search images by text embedding (e.g. from a natural language query).
    /// Returns images sorted by cosine similarity to the query embedding.
    pub fn search_by_embedding(
        &self,
        query_embedding: &[f32],
        max_results: usize,
    ) -> Vec<SearchResult> {
        let mut results: Vec<SearchResult> = self
            .image_embeddings
            .iter()
            .map(|(hash, emb)| {
                let sim = cosine_similarity(query_embedding, &emb.vector);
                let labels = self
                    .image_labels
                    .get(hash)
                    .map(|v| v.iter().map(|l| l.label.clone()).collect())
                    .unwrap_or_default();
                SearchResult {
                    image_hash: hash.clone(),
                    similarity: sim,
                    labels,
                }
            })
            .filter(|r| r.similarity >= self.similarity_threshold)
            .collect();

        results.sort_by(|a, b| b.similarity.partial_cmp(&a.similarity).unwrap_or(std::cmp::Ordering::Equal));
        results.truncate(max_results);
        results
    }

    /// Search images by a text label (using vocabulary embedding).
    pub fn search_by_text(
        &self,
        query_text: &str,
        max_results: usize,
    ) -> Vec<SearchResult> {
        // First check if we have an exact vocabulary match
        if let Some(vocab_emb) = self.vocabulary.get(query_text) {
            return self.search_by_embedding(&vocab_emb.vector, max_results);
        }

        // Check for partial matches - combine embeddings of matching vocab entries
        let matching_entries: Vec<&Embedding> = self
            .vocabulary
            .iter()
            .filter(|(label, _)| {
                let label_lower = label.to_lowercase();
                let query_lower = query_text.to_lowercase();
                label_lower.contains(&query_lower) || query_lower.contains(&label_lower)
            })
            .map(|(_, emb)| emb)
            .collect();

        if matching_entries.is_empty() {
            return Vec::new();
        }

        // Average the matching embeddings to create a combined query
        let dim = matching_entries[0].vector.len();
        let mut combined = vec![0.0f32; dim];
        for emb in &matching_entries {
            for (i, &v) in emb.vector.iter().enumerate() {
                combined[i] += v;
            }
        }
        let n = matching_entries.len() as f32;
        for v in combined.iter_mut() {
            *v /= n;
        }

        // Normalize the combined vector
        let norm: f32 = combined.iter().map(|v| v * v).sum::<f32>().sqrt();
        if norm > 1e-8 {
            for v in combined.iter_mut() {
                *v /= norm;
            }
        }

        self.search_by_embedding(&combined, max_results)
    }

    /// Search images by label substring.
    pub fn search_by_label(&self, label_query: &str) -> Vec<&ImageLabel> {
        let query_lower = label_query.to_lowercase();
        self.image_labels
            .iter()
            .flat_map(|(_, labels)| labels.iter())
            .filter(|l| l.label.to_lowercase().contains(&query_lower))
            .collect()
    }

    /// Find similar images to a given image.
    pub fn find_similar_images(
        &self,
        image_hash: &str,
        max_results: usize,
    ) -> Vec<SearchResult> {
        let emb = match self.image_embeddings.get(image_hash) {
            Some(e) => e,
            None => return Vec::new(),
        };
        let mut results: Vec<SearchResult> = self
            .image_embeddings
            .iter()
            .filter(|(hash, _)| *hash != image_hash)
            .map(|(hash, other_emb)| {
                let sim = cosine_similarity(&emb.vector, &other_emb.vector);
                let labels = self
                    .image_labels
                    .get(hash)
                    .map(|v| v.iter().map(|l| l.label.clone()).collect())
                    .unwrap_or_default();
                SearchResult {
                    image_hash: hash.clone(),
                    similarity: sim,
                    labels,
                }
            })
            .collect();

        results.sort_by(|a, b| b.similarity.partial_cmp(&a.similarity).unwrap_or(std::cmp::Ordering::Equal));
        results.truncate(max_results);
        results
    }

    // ──────────── Batch Operations ────────────

    /// Batch auto-label all indexed images that don't have labels yet
    pub fn batch_auto_label(&mut self, max_labels_per_image: usize, min_confidence: f32) -> HashMap<String, Vec<ImageLabel>> {
        let unabeled: Vec<String> = self
            .image_embeddings
            .keys()
            .filter(|hash| !self.image_labels.contains_key(*hash))
            .cloned()
            .collect();

        let mut results = HashMap::new();
        for hash in unabeled {
            let labels = self.auto_label_image(&hash, max_labels_per_image, min_confidence);
            if !labels.is_empty() {
                results.insert(hash, labels);
            }
        }
        results
    }

    /// Get statistics about the labeling engine
    pub fn stats(&self) -> LabelingStats {
        let total_labels: usize = self.image_labels.values().map(|v| v.len()).sum();
        let avg_labels = if self.image_labels.is_empty() {
            0.0
        } else {
            total_labels as f64 / self.image_labels.len() as f64
        };
        LabelingStats {
            indexed_images: self.image_embeddings.len(),
            vocabulary_size: self.vocabulary.len(),
            total_labels,
            avg_labels_per_image: avg_labels,
            labeled_images: self.image_labels.len(),
        }
    }
}

impl Default for LabelingEngine {
    fn default() -> Self {
        Self::new()
    }
}

/// Statistics about the labeling engine
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LabelingStats {
    pub indexed_images: usize,
    pub vocabulary_size: usize,
    pub total_labels: usize,
    pub avg_labels_per_image: f64,
    pub labeled_images: usize,
}

// ──────────── Math Utilities ────────────

/// Compute cosine similarity between two vectors.
/// Returns value in [-1, 1]. Returns 0 if either vector is zero.
pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }

    let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();

    if norm_a < 1e-8 || norm_b < 1e-8 {
        return 0.0;
    }

    (dot / (norm_a * norm_b)).clamp(-1.0, 1.0)
}

/// L2 normalize a vector in place
pub fn normalize_vector(v: &mut [f32]) {
    let norm: f32 = v.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm > 1e-8 {
        for x in v.iter_mut() {
            *x /= norm;
        }
    }
}

/// Compute Euclidean distance between two vectors
pub fn euclidean_distance(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() {
        return f32::MAX;
    }
    a.iter()
        .zip(b.iter())
        .map(|(x, y)| (x - y) * (x - y))
        .sum::<f32>()
        .sqrt()
}

/// Compute dot product of two vectors
pub fn dot_product(a: &[f32], b: &[f32]) -> f32 {
    a.iter().zip(b.iter()).map(|(x, y)| x * y).sum()
}

// ──────────── Embedding Utility Functions ────────────

/// Create a random embedding (for testing/initialization)
pub fn random_embedding(dim: usize, model: &str) -> Embedding {
    use std::time::SystemTime;
    let seed = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos() as u64;

    // Simple LCG PRNG for initialization
    let mut state = seed;
    let mut vector = Vec::with_capacity(dim);
    for _ in 0..dim {
        state = state.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        let v = ((state >> 33) as f32) / ((1u64 << 31) as f32) * 2.0 - 1.0;
        vector.push(v);
    }

    // Normalize
    normalize_vector(&mut vector);

    Embedding {
        vector,
        model: model.to_string(),
        dim,
    }
}

/// Create a zero embedding
pub fn zero_embedding(dim: usize, model: &str) -> Embedding {
    Embedding {
        vector: vec![0.0; dim],
        model: model.to_string(),
        dim,
    }
}

/// Average multiple embeddings into one
pub fn average_embeddings(embeddings: &[&Embedding]) -> Option<Embedding> {
    if embeddings.is_empty() {
        return None;
    }

    let dim = embeddings[0].dim;
    let model = embeddings[0].model.clone();
    let mut result = vec![0.0f32; dim];

    for emb in embeddings {
        if emb.dim != dim {
            return None;
        }
        for (i, &v) in emb.vector.iter().enumerate() {
            result[i] += v;
        }
    }

    let n = embeddings.len() as f32;
    for v in result.iter_mut() {
        *v /= n;
    }

    normalize_vector(&mut result);

    Some(Embedding {
        vector: result,
        model,
        dim,
    })
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

use std::sync::Mutex as StdMutex;
use once_cell::sync::Lazy;

static LABELING_ENGINE: Lazy<StdMutex<Option<LabelingEngine>>> =
    Lazy::new(|| StdMutex::new(None));

fn with_engine<F, T>(f: F) -> Result<T, String>
where
    F: FnOnce(&LabelingEngine) -> anyhow::Result<T>,
{
    let guard = LABELING_ENGINE.lock().unwrap();
    let engine = guard
        .as_ref()
        .ok_or_else(|| "Labeling engine is not initialized".to_string())?;
    f(engine).map_err(|e| e.to_string())
}

fn with_engine_mut<F, T>(f: F) -> Result<T, String>
where
    F: FnOnce(&mut LabelingEngine) -> anyhow::Result<T>,
{
    let mut guard = LABELING_ENGINE.lock().unwrap();
    let engine = guard
        .as_mut()
        .ok_or_else(|| "Labeling engine is not initialized".to_string())?;
    f(engine).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ai_labeling_auto_label(
    image_hash: String,
    max_labels: usize,
    min_confidence: f32,
) -> Result<Vec<serde_json::Value>, String> {
    let labels = with_engine_mut(|engine| {
        Ok(engine.auto_label_image(&image_hash, max_labels, min_confidence))
    })?;
    labels
        .iter()
        .map(|l| serde_json::to_value(l).map_err(|e| format!("Serialization error: {}", e)))
        .collect()
}

#[tauri::command]
pub fn ai_labeling_search_by_text(
    query: String,
    max_results: usize,
) -> Result<Vec<serde_json::Value>, String> {
    let results = with_engine(|engine| {
        Ok(engine.search_by_text(&query, max_results))
    })?;
    results
        .iter()
        .map(|r| serde_json::to_value(r).map_err(|e| format!("Serialization error: {}", e)))
        .collect()
}

#[tauri::command]
pub fn ai_labeling_find_similar(
    image_hash: String,
    max_results: usize,
) -> Result<Vec<serde_json::Value>, String> {
    let results = with_engine(|engine| {
        Ok(engine.find_similar_images(&image_hash, max_results))
    })?;
    results
        .iter()
        .map(|r| serde_json::to_value(r).map_err(|e| format!("Serialization error: {}", e)))
        .collect()
}

#[tauri::command]
pub fn ai_labeling_get_stats() -> Result<serde_json::Value, String> {
    let stats = with_engine(|engine| Ok(engine.stats()))?;
    serde_json::to_value(stats).map_err(|e| format!("Serialization error: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cosine_similarity_identical() {
        let a = vec![1.0, 0.0, 0.0];
        assert!((cosine_similarity(&a, &a) - 1.0).abs() < 1e-6);
    }

    #[test]
    fn test_cosine_similarity_orthogonal() {
        let a = vec![1.0, 0.0, 0.0];
        let b = vec![0.0, 1.0, 0.0];
        assert!(cosine_similarity(&a, &b).abs() < 1e-6);
    }

    #[test]
    fn test_cosine_similarity_opposite() {
        let a = vec![1.0, 0.0];
        let b = vec![-1.0, 0.0];
        assert!((cosine_similarity(&a, &b) - (-1.0)).abs() < 1e-6);
    }

    #[test]
    fn test_normalize_vector() {
        let mut v = vec![3.0, 4.0];
        normalize_vector(&mut v);
        let norm: f32 = v.iter().map(|x| x * x).sum::<f32>().sqrt();
        assert!((norm - 1.0).abs() < 1e-6);
    }

    #[test]
    fn test_auto_labeling() {
        let mut engine = LabelingEngine::with_threshold(0.3);

        // Add vocabulary with orthogonal-ish embeddings
        engine.add_vocabulary_entry("sunset", Embedding {
            vector: vec![1.0, 0.0, 0.0],
            model: "test".to_string(),
            dim: 3,
        });
        engine.add_vocabulary_entry("portrait", Embedding {
            vector: vec![0.0, 1.0, 0.0],
            model: "test".to_string(),
            dim: 3,
        });

        // Add image embedding close to "sunset"
        engine.add_image_embedding("img1", Embedding {
            vector: vec![0.9, 0.1, 0.0],
            model: "test".to_string(),
            dim: 3,
        });

        let labels = engine.auto_label_image("img1", 5, 0.3);
        assert!(!labels.is_empty());
        assert_eq!(labels[0].label, "sunset");
        assert!(labels[0].confidence > 0.8);
    }

    #[test]
    fn test_search_by_embedding() {
        let mut engine = LabelingEngine::with_threshold(0.5);

        engine.add_image_embedding("img1", Embedding {
            vector: vec![1.0, 0.0],
            model: "test".to_string(),
            dim: 2,
        });
        engine.add_image_embedding("img2", Embedding {
            vector: vec![0.0, 1.0],
            model: "test".to_string(),
            dim: 2,
        });

        let results = engine.search_by_embedding(&vec![1.0, 0.0], 10);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].image_hash, "img1");
    }

    #[test]
    fn test_find_similar_images() {
        let mut engine = LabelingEngine::new();

        engine.add_image_embedding("img1", Embedding {
            vector: vec![1.0, 0.0, 0.0],
            model: "test".to_string(),
            dim: 3,
        });
        engine.add_image_embedding("img2", Embedding {
            vector: vec![0.95, 0.05, 0.0],
            model: "test".to_string(),
            dim: 3,
        });
        engine.add_image_embedding("img3", Embedding {
            vector: vec![0.0, 0.0, 1.0],
            model: "test".to_string(),
            dim: 3,
        });

        let similar = engine.find_similar_images("img1", 2);
        assert_eq!(similar.len(), 2);
        assert_eq!(similar[0].image_hash, "img2"); // Most similar
        assert!(similar[0].similarity > similar[1].similarity);
    }

    #[test]
    fn test_average_embeddings() {
        let e1 = Embedding {
            vector: vec![1.0, 0.0],
            model: "test".to_string(),
            dim: 2,
        };
        let e2 = Embedding {
            vector: vec![0.0, 1.0],
            model: "test".to_string(),
            dim: 2,
        };
        let avg = average_embeddings(&[&e1, &e2]).unwrap();
        // Should be roughly [0.707, 0.707] (normalized diagonal)
        assert!((avg.vector[0] - 0.707).abs() < 0.01);
        assert!((avg.vector[1] - 0.707).abs() < 0.01);
    }

    #[test]
    fn test_euclidean_distance() {
        let a = vec![0.0, 0.0];
        let b = vec![3.0, 4.0];
        assert!((euclidean_distance(&a, &b) - 5.0).abs() < 1e-6);
    }
}
