import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Invokes } from '../components/ui/AppProperties';

export interface AutoLabelResult {
  label: string;
  confidence: number;
}

export interface VocabularyEntry {
  label: string;
  embedding: number[];
}

export interface LabelingStats {
  totalImages: number;
  totalLabels: number;
  vocabularySize: number;
}

export function useAiLabeling() {
  const initLabeling = useCallback(
    async (vocabularyJson?: string, similarityThreshold?: number): Promise<void> => {
      await invoke(Invokes.AiLabelingInit, { vocabularyJson, similarityThreshold });
    },
    [],
  );

  const autoLabel = useCallback(
    async (imageHash: string, maxLabels: number = 10, minConfidence: number = 0.5): Promise<AutoLabelResult[]> => {
      return invoke(Invokes.AiLabelingAutoLabel, { imageHash, maxLabels, minConfidence }) as Promise<AutoLabelResult[]>;
    },
    [],
  );

  const searchByText = useCallback(
    async (query: string, limit: number = 20): Promise<any[]> => {
      return invoke(Invokes.AiLabelingSearchByText, { query, limit }) as Promise<any[]>;
    },
    [],
  );

  const findSimilar = useCallback(
    async (imageHash: string, limit: number = 10): Promise<any[]> => {
      return invoke(Invokes.AiLabelingFindSimilar, { imageHash, limit }) as Promise<any[]>;
    },
    [],
  );

  const getStats = useCallback(async (): Promise<LabelingStats> => {
    return invoke(Invokes.AiLabelingGetStats) as Promise<LabelingStats>;
  }, []);

  const isInitialized = useCallback(async (): Promise<boolean> => {
    return invoke(Invokes.AiLabelingIsInitialized) as Promise<boolean>;
  }, []);

  const reset = useCallback(async (): Promise<void> => {
    await invoke(Invokes.AiLabelingReset);
  }, []);

  const addVocabularyEntry = useCallback(
    async (label: string, embedding: number[]): Promise<void> => {
      await invoke(Invokes.AiLabelingAddVocabularyEntry, { label, embedding });
    },
    [],
  );

  const removeVocabularyEntry = useCallback(
    async (label: string): Promise<void> => {
      await invoke(Invokes.AiLabelingRemoveVocabularyEntry, { label });
    },
    [],
  );

  const getVocabularyLabels = useCallback(async (): Promise<string[]> => {
    return invoke(Invokes.AiLabelingGetVocabularyLabels) as Promise<string[]>;
  }, []);

  const addImageEmbedding = useCallback(
    async (imageHash: string, embedding: number[], labels: string[]): Promise<void> => {
      await invoke(Invokes.AiLabelingAddImageEmbedding, { imageHash, embedding, labels });
    },
    [],
  );

  const removeImage = useCallback(
    async (imageHash: string): Promise<void> => {
      await invoke(Invokes.AiLabelingRemoveImage, { imageHash });
    },
    [],
  );

  const searchByEmbedding = useCallback(
    async (embedding: number[], limit: number = 10): Promise<any[]> => {
      return invoke(Invokes.AiLabelingSearchByEmbedding, { embedding, limit }) as Promise<any[]>;
    },
    [],
  );

  const searchByLabel = useCallback(
    async (label: string, limit: number = 20): Promise<any[]> => {
      return invoke(Invokes.AiLabelingSearchByLabel, { label, limit }) as Promise<any[]>;
    },
    [],
  );

  const batchAutoLabel = useCallback(
    async (imageHashes: string[], maxLabels: number = 5, minConfidence: number = 0.5): Promise<Record<string, AutoLabelResult[]>> => {
      return invoke(Invokes.AiLabelingBatchAutoLabel, { imageHashes, maxLabels, minConfidence }) as Promise<Record<string, AutoLabelResult[]>>;
    },
    [],
  );

  const addManualLabel = useCallback(
    async (imageHash: string, label: string, confidence: number = 1.0): Promise<void> => {
      await invoke(Invokes.AiLabelingAddManualLabel, { imageHash, label, confidence });
    },
    [],
  );

  const removeLabel = useCallback(
    async (imageHash: string, label: string): Promise<void> => {
      await invoke(Invokes.AiLabelingRemoveLabel, { imageHash, label });
    },
    [],
  );

  const getLabels = useCallback(
    async (imageHash: string): Promise<AutoLabelResult[]> => {
      return invoke(Invokes.AiLabelingGetLabels, { imageHash }) as Promise<AutoLabelResult[]>;
    },
    [],
  );

  return {
    initLabeling,
    autoLabel,
    searchByText,
    findSimilar,
    getStats,
    isInitialized,
    reset,
    addVocabularyEntry,
    removeVocabularyEntry,
    getVocabularyLabels,
    addImageEmbedding,
    removeImage,
    searchByEmbedding,
    searchByLabel,
    batchAutoLabel,
    addManualLabel,
    removeLabel,
    getLabels,
  };
}
