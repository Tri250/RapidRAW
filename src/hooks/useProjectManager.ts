import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Invokes } from '../components/ui/AppProperties';

export interface EditVersion {
  id: string;
  image_hash: string;
  parent_id: string | null;
  adjustments_json: string;
  name: string;
  created_at: number;
  is_current: boolean;
}

export interface ThumbnailData {
  image_hash: string;
  data_base64: string;
  width: number;
  height: number;
  format: string;
}

export interface AiLabel {
  image_hash: string;
  label: string;
  confidence: number;
  model: string;
}

export interface ProjectStatistics {
  total_versions: number;
  unique_images: number;
  avg_versions_per_image: number;
  total_labels: number;
  // Future-proofing — the backend may enrich this over time.
  total_images?: number;
  total_thumbnails?: number;
  images_with_versions?: number;
  images_with_labels?: number;
}

// Standalone functions so the project-manager module can be driven both
// from React components (via the hook below) and from non-React contexts
// like initialization flows or auto-save handlers.

export const openProject = (dbPath: string): Promise<string> =>
  invoke(Invokes.ProjectOpen, { dbPath }) as Promise<string>;

export const closeProject = (): Promise<void> => invoke(Invokes.ProjectClose) as Promise<void>;

export const createEditVersion = (
  dbPath: string,
  imageHash: string,
  adjustments: string,
  name: string,
  parentId?: string,
): Promise<EditVersion> =>
  invoke(Invokes.ProjectCreateEditVersion, {
    dbPath,
    imageHash,
    parentId: parentId ?? null,
    adjustments,
    name,
  }) as Promise<EditVersion>;

export const listVersions = (dbPath: string, imageHash: string): Promise<EditVersion[]> =>
  invoke(Invokes.ProjectListVersions, { dbPath, imageHash }) as Promise<EditVersion[]>;

export const getCurrentVersion = (dbPath: string, imageHash: string): Promise<EditVersion | null> =>
  invoke(Invokes.ProjectGetCurrentVersion, { dbPath, imageHash }) as Promise<EditVersion | null>;

export const setCurrentVersion = (dbPath: string, versionId: string): Promise<void> =>
  invoke(Invokes.ProjectSetCurrentVersion, { dbPath, versionId }) as Promise<void>;

export const storeThumbnail = (
  dbPath: string,
  imageHash: string,
  dataBase64: string,
  width: number,
  height: number,
  format: string,
): Promise<void> =>
  invoke(Invokes.ProjectStoreThumbnail, {
    dbPath,
    imageHash,
    dataBase64,
    width,
    height,
    format,
  }) as Promise<void>;

export const getThumbnail = (dbPath: string, imageHash: string): Promise<ThumbnailData | null> =>
  invoke(Invokes.ProjectGetThumbnail, { dbPath, imageHash }) as Promise<ThumbnailData | null>;

export const addAiLabel = (
  dbPath: string,
  imageHash: string,
  label: string,
  confidence: number = 1.0,
  model: string = 'manual',
): Promise<void> =>
  invoke(Invokes.ProjectAddAiLabel, {
    dbPath,
    imageHash,
    label,
    confidence,
    model,
  }) as Promise<void>;

export const getLabels = (dbPath: string, imageHash: string): Promise<AiLabel[]> =>
  invoke(Invokes.ProjectGetLabels, { dbPath, imageHash }) as Promise<AiLabel[]>;

export const searchLabels = (dbPath: string, labelQuery: string): Promise<AiLabel[]> =>
  invoke(Invokes.ProjectSearchLabels, { dbPath, labelQuery }) as Promise<AiLabel[]>;

export const getStatistics = (dbPath: string): Promise<ProjectStatistics> =>
  invoke(Invokes.ProjectGetStatistics, { dbPath }) as Promise<ProjectStatistics>;

export const exportParquet = (dbPath: string, outputPath: string): Promise<number> =>
  invoke(Invokes.ProjectExportParquet, { dbPath, outputPath }) as Promise<number>;

export function useProjectManager() {
  const openProjectCb = useCallback((dbPath: string) => openProject(dbPath), []);
  const closeProjectCb = useCallback(() => closeProject(), []);
  const createEditVersionCb = useCallback(
    (dbPath: string, imageHash: string, adjustments: string, name: string, parentId?: string) =>
      createEditVersion(dbPath, imageHash, adjustments, name, parentId),
    [],
  );
  const listVersionsCb = useCallback((dbPath: string, imageHash: string) => listVersions(dbPath, imageHash), []);
  const getCurrentVersionCb = useCallback(
    (dbPath: string, imageHash: string) => getCurrentVersion(dbPath, imageHash),
    [],
  );
  const setCurrentVersionCb = useCallback(
    (dbPath: string, versionId: string) => setCurrentVersion(dbPath, versionId),
    [],
  );
  const storeThumbnailCb = useCallback(
    (dbPath: string, imageHash: string, dataBase64: string, width: number, height: number, format: string) =>
      storeThumbnail(dbPath, imageHash, dataBase64, width, height, format),
    [],
  );
  const getThumbnailCb = useCallback((dbPath: string, imageHash: string) => getThumbnail(dbPath, imageHash), []);
  const addAiLabelCb = useCallback(
    (dbPath: string, imageHash: string, label: string, confidence: number = 1.0, model: string = 'manual') =>
      addAiLabel(dbPath, imageHash, label, confidence, model),
    [],
  );
  const getLabelsCb = useCallback((dbPath: string, imageHash: string) => getLabels(dbPath, imageHash), []);
  const searchLabelsCb = useCallback((dbPath: string, labelQuery: string) => searchLabels(dbPath, labelQuery), []);
  const getStatisticsCb = useCallback((dbPath: string) => getStatistics(dbPath), []);
  const exportParquetCb = useCallback((dbPath: string, outputPath: string) => exportParquet(dbPath, outputPath), []);

  return {
    openProject: openProjectCb,
    closeProject: closeProjectCb,
    createEditVersion: createEditVersionCb,
    listVersions: listVersionsCb,
    getCurrentVersion: getCurrentVersionCb,
    setCurrentVersion: setCurrentVersionCb,
    storeThumbnail: storeThumbnailCb,
    getThumbnail: getThumbnailCb,
    addAiLabel: addAiLabelCb,
    getLabels: getLabelsCb,
    searchLabels: searchLabelsCb,
    getStatistics: getStatisticsCb,
    exportParquet: exportParquetCb,
  };
}
