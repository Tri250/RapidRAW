import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { Invokes } from '../components/ui/AppProperties';

/**
 * On-device (端侧) AI model management.
 *
 * Mirrors the Rust `AiModelId` enum (serde camelCase). Each model is
 * downloaded/loaded independently so basic features become usable without
 * waiting for the large SAM models — see `get_or_init_onnx_model` in
 * `ai_processing.rs`.
 */
export type AiModelId =
  | 'samEncoder'
  | 'samDecoder'
  | 'u2net'
  | 'skySeg'
  | 'depth'
  | 'denoise'
  | 'lama'
  | 'clip'
  | 'faceLandmark';

export interface AiModelStatusEntry {
  id: AiModelId;
  displayName: string;
  /** Already loaded into memory (ready for inference). */
  loaded: boolean;
  /** File present locally (downloaded or bundled); loadable without network. */
  filePresent: boolean;
}

export type AiFeature =
  | 'subjectMask'
  | 'foregroundMask'
  | 'skyMask'
  | 'depthMask'
  | 'denoise'
  | 'inpaint'
  | 'rating'
  | 'faceLandmark';

/** Maps each AI feature to the on-device models it requires. */
const FEATURE_MODELS: Record<AiFeature, AiModelId[]> = {
  subjectMask: ['samEncoder', 'samDecoder'],
  foregroundMask: ['u2net'],
  skyMask: ['skySeg'],
  depthMask: ['depth'],
  denoise: ['denoise'],
  inpaint: ['lama'],
  rating: ['clip'],
  faceLandmark: ['faceLandmark'],
};

export interface PrefetchProgress {
  modelId: AiModelId;
  displayName: string;
  index: number;
  total: number;
  status: 'present' | 'downloading' | 'ready' | 'error';
  error?: string;
}

export interface UseAiModelsResult {
  /** Status per model id. */
  models: Partial<Record<AiModelId, AiModelStatusEntry>>;
  /** Currently prefetching (background download in progress). */
  isPrefetching: boolean;
  /** Latest prefetch progress event (the model currently being fetched). */
  prefetchProgress: PrefetchProgress | null;
  /** Number of models ready (file present) out of total. */
  readyCount: number;
  totalModels: number;
  /** Re-query model status from the backend. */
  refresh: () => Promise<void>;
  /** Trigger background prefetch of all missing models (small models first). */
  prefetch: () => Promise<void>;
  /** True when every model required by `feature` is at least present locally. */
  isFeatureReady: (feature: AiFeature) => boolean;
  /** Human-readable status for a feature: 'ready' | 'downloading' | 'missing'. */
  featureStatus: (feature: AiFeature) => 'ready' | 'downloading' | 'missing';
}

const TOTAL_MODELS = 9;

export function useAiModels(): UseAiModelsResult {
  const [models, setModels] = useState<Partial<Record<AiModelId, AiModelStatusEntry>>>({});
  const [isPrefetching, setIsPrefetching] = useState(false);
  const [prefetchProgress, setPrefetchProgress] = useState<PrefetchProgress | null>(null);

  const refresh = useCallback(async () => {
    try {
      const entries = await invoke<AiModelStatusEntry[]>(Invokes.GetAiModelStatus);
      const map: Partial<Record<AiModelId, AiModelStatusEntry>> = {};
      for (const entry of entries) map[entry.id] = entry;
      setModels(map);
    } catch (e) {
      // Backend may be unavailable (e.g. during teardown); ignore silently.
      console.warn('get_ai_model_status failed', e);
    }
  }, []);

  const prefetch = useCallback(async () => {
    try {
      await invoke(Invokes.PrefetchAiModels);
      setIsPrefetching(true);
    } catch (e) {
      console.warn('prefetch_ai_models failed', e);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const unlisteners: UnlistenFn[] = [];

    // Initial status query.
    refresh();

    listen<PrefetchProgress>('ai-model-prefetch-progress', (event) => {
      if (!active) return;
      const payload = event.payload as PrefetchProgress;
      setPrefetchProgress(payload);
      if (payload.status === 'downloading') setIsPrefetching(true);
      // Refresh status whenever a model transitions to ready/present/error so
      // the UI progressively reflects newly-available models.
      if (payload.status === 'ready' || payload.status === 'present' || payload.status === 'error') {
        refresh();
      }
    }).then((un) => {
      unlisteners.push(un);
      if (!active) un();
    });

    listen<boolean>('ai-model-prefetch-complete', () => {
      if (!active) return;
      setIsPrefetching(false);
      setPrefetchProgress(null);
      refresh();
    }).then((un) => {
      unlisteners.push(un);
      if (!active) un();
    });

    // Also refresh when the legacy per-model download events fire (on-demand
    // loading triggered by clicking an AI feature).
    listen<string>('ai-model-download-finish', () => {
      if (active) refresh();
    }).then((un) => {
      unlisteners.push(un);
      if (!active) un();
    });

    return () => {
      active = false;
      for (const un of unlisteners) un();
    };
  }, [refresh]);

  const readyCount = useMemo(
    () => Object.values(models).filter((m) => m?.filePresent).length,
    [models],
  );

  const isFeatureReady = useCallback(
    (feature: AiFeature): boolean => {
      const required = FEATURE_MODELS[feature];
      return required.every((id) => models[id]?.filePresent);
    },
    [models],
  );

  const featureStatus = useCallback(
    (feature: AiFeature): 'ready' | 'downloading' | 'missing' => {
      if (isFeatureReady(feature)) return 'ready';
      const required = FEATURE_MODELS[feature];
      const downloading = required.some(
        (id) => prefetchProgress?.modelId === id && prefetchProgress.status === 'downloading',
      );
      return downloading ? 'downloading' : 'missing';
    },
    [isFeatureReady, prefetchProgress],
  );

  return {
    models,
    isPrefetching,
    prefetchProgress,
    readyCount,
    totalModels: TOTAL_MODELS,
    refresh,
    prefetch,
    isFeatureReady,
    featureStatus,
  };
}
