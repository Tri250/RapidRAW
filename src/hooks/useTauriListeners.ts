import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { convertFileSrc } from '@tauri-apps/api/core';
import { toast } from 'react-toastify';
import { Status } from '../components/ui/ExportImportProperties';
import { ImageFile, Progress, CullingSuggestions } from '../components/ui/AppProperties';
import { ChannelConfig } from '../components/adjustments/Curves';
import { WaveformData } from '../components/ui/AppProperties';
import { useProcessStore, ExternalEditSession } from '../store/useProcessStore';
import { useEditorStore } from '../store/useEditorStore';
import { useUIStore } from '../store/useUIStore';
import { useLibraryStore } from '../store/useLibraryStore';

interface TauriListenerProps {
  refreshAllFolderTrees: () => void;
  handleSelectSubfolder: (
    path: string | null,
    isNewRoot?: boolean,
    preloadedImages?: ImageFile[],
    expandParents?: boolean,
  ) => void;
  refreshImageList: () => void;
  markGenerated: (path: string) => void;
}

export function useTauriListeners({
  refreshAllFolderTrees,
  handleSelectSubfolder,
  refreshImageList,
  markGenerated,
}: TauriListenerProps) {
  const refs = useRef({ refreshAllFolderTrees, handleSelectSubfolder, refreshImageList, markGenerated });

  useEffect(() => {
    refs.current = { refreshAllFolderTrees, handleSelectSubfolder, refreshImageList, markGenerated };
  });

  const thumbnailBuffer = useRef<Record<string, string>>({});
  const ratingBuffer = useRef<Record<string, number>>({});
  const editStatusBuffer = useRef<Record<string, boolean>>({});
  const flushHandle = useRef<number | null>(null);

  useEffect(() => {
    let isEffectActive = true;

    const flushThumbnailBatch = () => {
      flushHandle.current = null;
      if (!isEffectActive) return;

      const pendingThumbs = thumbnailBuffer.current;
      const pendingRatings = ratingBuffer.current;
      const pendingEdits = editStatusBuffer.current;

      thumbnailBuffer.current = {};
      ratingBuffer.current = {};
      editStatusBuffer.current = {};

      if (Object.keys(pendingThumbs).length > 0) {
        useProcessStore.getState().setProcess((state) => ({
          thumbnails: { ...state.thumbnails, ...pendingThumbs },
        }));
      }

      if (Object.keys(pendingRatings).length > 0 || Object.keys(pendingEdits).length > 0) {
        useLibraryStore.getState().setLibrary((state) => ({
          imageRatings: { ...state.imageRatings, ...pendingRatings },
          imageList:
            Object.keys(pendingEdits).length > 0
              ? state.imageList.map((img) =>
                  pendingEdits[img.path] !== undefined ? { ...img, is_edited: pendingEdits[img.path] } : img,
                )
              : state.imageList,
        }));
      }
    };

    const scheduleFlush = () => {
      if (flushHandle.current !== null) return;
      flushHandle.current = requestAnimationFrame(flushThumbnailBatch);
    };

    const unlistenFns: Array<() => void> = [];
    const listenerPromises: Array<Promise<void>> = [];

    const registerListener = (promise: Promise<() => void>) => {
      promise.then((unlisten) => {
        unlistenFns.push(unlisten);
      });
      listenerPromises.push(promise.then(() => {}));
    };

    registerListener(
      listen('preview-update-uncropped', (event: { payload: unknown }) => {
        if (isEffectActive)
          useEditorStore.getState().setEditor({ uncroppedAdjustedPreviewUrl: event.payload as string | null });
      }),
    );
    registerListener(
      listen('histogram-update', (event: { payload: { path: string; data: unknown } }) => {
        if (isEffectActive && event.payload.path === useEditorStore.getState().selectedImage?.path) {
          useEditorStore.getState().setEditor({ histogram: event.payload.data as ChannelConfig | null });
        }
      }),
    );
    registerListener(
      listen('open-with-file', (event: { payload: unknown }) => {
        if (isEffectActive) useProcessStore.getState().setProcess({ initialFileToOpen: event.payload as string });
      }),
    );
    registerListener(
      listen('external-edit-session', (event: { payload: unknown }) => {
        if (isEffectActive)
          useProcessStore.getState().setProcess({ externalEditSession: event.payload as ExternalEditSession | null });
      }),
    );
    registerListener(
      listen('waveform-update', (event: { payload: { path: string; data: unknown } }) => {
        if (isEffectActive && event.payload.path === useEditorStore.getState().selectedImage?.path) {
          useEditorStore.getState().setEditor({ waveform: event.payload.data as WaveformData | null });
        }
      }),
    );
    registerListener(
      listen('thumbnail-progress', (event: { payload: { current: number; total: number } }) => {
        if (isEffectActive)
          useProcessStore
            .getState()
            .setProcess({ thumbnailProgress: { current: event.payload.current, total: event.payload.total } });
      }),
    );
    registerListener(
      listen('thumbnail-generation-complete', () => {
        if (isEffectActive) useProcessStore.getState().setProcess({ thumbnailProgress: { current: 0, total: 0 } });
      }),
    );
    registerListener(
      listen(
        'thumbnail-generated',
        (event: {
          payload: { path: string; thumbnailPath?: string; rating?: number; is_edited?: boolean; data?: string };
        }) => {
          if (!isEffectActive) return;
          const { path, thumbnailPath, rating, is_edited, data } = event.payload;

          if (data && typeof data === 'string' && (data.startsWith('data:image') || data.startsWith('blob:'))) {
            thumbnailBuffer.current[path] = data;
            refs.current.markGenerated(path);
          } else if (thumbnailPath) {
            let resolvedUrl: string | null = null;
            try {
              resolvedUrl = convertFileSrc(thumbnailPath, 'asset');
            } catch {
              resolvedUrl = null;
            }
            if (!resolvedUrl) {
              try {
                resolvedUrl = convertFileSrc(thumbnailPath);
              } catch {
                resolvedUrl = null;
              }
            }
            if (!resolvedUrl) {
              // Tauri 2.x asset:// protocol fallback – normalize absolute paths
              const normalizedPath = thumbnailPath.startsWith('/')
                ? `asset://localhost${thumbnailPath}`
                : `asset://localhost/${thumbnailPath}`;
              resolvedUrl = normalizedPath;
            }
            thumbnailBuffer.current[path] = resolvedUrl;
            refs.current.markGenerated(path);
          }
          if (rating !== undefined) {
            ratingBuffer.current[path] = rating;
          }
          if (is_edited !== undefined) {
            editStatusBuffer.current[path] = is_edited;
          }
          if (thumbnailPath || data || rating !== undefined || is_edited !== undefined) {
            scheduleFlush();
          }
        },
      ),
    );
    registerListener(
      listen(
        'image-metadata-loaded',
        (event: { payload: { path: string; rating?: number; is_edited?: boolean; tags?: string[] } }) => {
          if (!isEffectActive) return;
          const { path, rating, is_edited, tags } = event.payload;

          useLibraryStore.getState().setLibrary((state) => ({
            imageRatings: { ...state.imageRatings, [path]: rating ?? 0 },
            imageList: state.imageList.map((img) =>
              img.path === path ? { ...img, is_edited: is_edited ?? img.is_edited, tags: tags ?? img.tags } : img,
            ),
          }));
        },
      ),
    );
    registerListener(
      listen('ai-model-download-start', (event: { payload: unknown }) => {
        if (isEffectActive)
          useProcessStore.getState().setProcess({ aiModelDownloadStatus: event.payload as string | null });
      }),
    );
    registerListener(
      listen('ai-model-download-finish', () => {
        if (isEffectActive) useProcessStore.getState().setProcess({ aiModelDownloadStatus: null });
      }),
    );
    registerListener(
      listen('indexing-started', () => {
        if (isEffectActive)
          useProcessStore.getState().setProcess({ isIndexing: true, indexingProgress: { current: 0, total: 0 } });
      }),
    );
    registerListener(
      listen('indexing-progress', (event: { payload: unknown }) => {
        if (isEffectActive)
          useProcessStore.getState().setProcess({ indexingProgress: event.payload as Progress | undefined });
      }),
    );
    registerListener(
      listen('indexing-finished', () => {
        if (isEffectActive) {
          useProcessStore.getState().setProcess({ isIndexing: false, indexingProgress: { current: 0, total: 0 } });
          const currentPath = useLibraryStore.getState().currentFolderPath;
          if (currentPath) {
            refs.current.refreshImageList();
          }
        }
      }),
    );
    registerListener(
      listen('batch-export-progress', (event: { payload: unknown }) => {
        if (isEffectActive)
          useProcessStore.getState().setExportState({ progress: event.payload as Progress | undefined });
      }),
    );
    registerListener(
      listen('export-complete', (event: { payload: unknown }) => {
        if (isEffectActive) {
          const exportedPaths: string[] = Array.isArray(event.payload) ? event.payload : [];
          useProcessStore.getState().setExportState({
            status: Status.Success,
            lastExportedFilePath: exportedPaths.length > 0 ? exportedPaths[exportedPaths.length - 1] : null,
          });
        }
      }),
    );
    registerListener(
      listen('export-error', (event: { payload: unknown }) => {
        if (isEffectActive)
          useProcessStore.getState().setExportState({
            status: Status.Error,
            errorMessage: typeof event.payload === 'string' ? event.payload : 'Unknown error',
          });
      }),
    );
    registerListener(
      listen('export-cancelled', () => {
        if (isEffectActive) useProcessStore.getState().setExportState({ status: Status.Cancelled });
      }),
    );
    registerListener(
      listen('import-start', (event: { payload: { total: number } }) => {
        if (isEffectActive)
          useProcessStore.getState().setImportState({
            errorMessage: '',
            path: '',
            progress: { current: 0, total: event.payload.total },
            status: Status.Importing,
          });
      }),
    );
    registerListener(
      listen('import-progress', (event: { payload: { path: string; current: number; total: number } }) => {
        if (isEffectActive)
          useProcessStore.getState().setImportState({
            path: event.payload.path,
            progress: { current: event.payload.current, total: event.payload.total },
          });
      }),
    );
    registerListener(
      listen('import-complete', () => {
        if (isEffectActive) {
          useProcessStore.getState().setImportState({ status: Status.Success });
          refs.current.refreshAllFolderTrees();
          const importTargetFolder = useUIStore.getState().importTargetFolder;
          const currentPath = useLibraryStore.getState().currentFolderPath;
          const targetPath = importTargetFolder || currentPath;
          if (targetPath) {
            refs.current.handleSelectSubfolder(targetPath, false);
          }
        }
      }),
    );
    registerListener(
      listen('import-error', (event: { payload: unknown }) => {
        if (isEffectActive)
          useProcessStore.getState().setImportState({
            status: Status.Error,
            errorMessage: typeof event.payload === 'string' ? event.payload : 'Unknown error',
          });
      }),
    );
    registerListener(
      listen('denoise-progress', (event: { payload: unknown }) => {
        if (isEffectActive)
          useUIStore.getState().setUI((state) => ({
            denoiseModalState: { ...state.denoiseModalState, progressMessage: event.payload as string },
          }));
      }),
    );
    registerListener(
      listen('denoise-complete', (event: { payload: unknown }) => {
        if (isEffectActive) {
          const payload = event.payload as Record<string, unknown> | string | null;
          const isObject = typeof payload === 'object' && payload !== null;
          useUIStore.getState().setUI((state) => ({
            denoiseModalState: {
              ...state.denoiseModalState,
              isProcessing: false,
              previewBase64: isObject ? ((payload as Record<string, unknown>).denoised as string) : payload,
              originalBase64: isObject ? ((payload as Record<string, unknown>).original as string) : null,
              progressMessage: null,
            },
          }));
        }
      }),
    );
    registerListener(
      listen('denoise-error', (event: { payload: unknown }) => {
        if (isEffectActive) {
          useUIStore.getState().setUI((state) => ({
            denoiseModalState: {
              ...state.denoiseModalState,
              isProcessing: false,
              error: String(event.payload),
              progressMessage: null,
            },
          }));
        }
      }),
    );
    registerListener(
      listen('wgpu-frame-ready', (event: { payload: { path?: string } }) => {
        if (isEffectActive && event.payload?.path === useEditorStore.getState().selectedImage?.path) {
          useEditorStore.getState().setEditor({ hasRenderedFirstFrame: true });
        }
      }),
    );
    registerListener(
      listen('panorama-progress', (event: { payload: unknown }) => {
        if (isEffectActive) {
          useUIStore.getState().setUI((state) => {
            if (state.panoramaModalState.finalImageBase64 || state.panoramaModalState.error) return state;
            return {
              panoramaModalState: { ...state.panoramaModalState, progressMessage: event.payload as string | null },
            };
          });
        }
      }),
    );
    registerListener(
      listen('panorama-complete', (event: { payload: { base64: string } }) => {
        if (isEffectActive) {
          useUIStore.getState().setUI((state) => ({
            panoramaModalState: {
              ...state.panoramaModalState,
              error: null,
              finalImageBase64: event.payload.base64,
              isProcessing: false,
              progressMessage: null,
            },
          }));
        }
      }),
    );
    registerListener(
      listen('panorama-error', (event: { payload: unknown }) => {
        if (isEffectActive) {
          useUIStore.getState().setUI((state) => ({
            panoramaModalState: {
              ...state.panoramaModalState,
              error: String(event.payload),
              finalImageBase64: null,
              isProcessing: false,
              progressMessage: null,
            },
          }));
        }
      }),
    );
    registerListener(
      listen('panorama-warning', (event: { payload: unknown }) => {
        if (isEffectActive) {
          toast.warning(String(event.payload), { autoClose: 5000 });
        }
      }),
    );
    registerListener(
      listen('hdr-progress', (event: { payload: unknown }) => {
        if (isEffectActive) {
          useUIStore.getState().setUI((state) => {
            if (state.hdrModalState.finalImageBase64 || state.hdrModalState.error) return state;
            return {
              hdrModalState: {
                ...state.hdrModalState,
                progressMessage: event.payload as string | null,
              },
            };
          });
        }
      }),
    );
    registerListener(
      listen('hdr-complete', (event: { payload: { base64: string } }) => {
        if (isEffectActive) {
          useUIStore.getState().setUI((state) => ({
            hdrModalState: {
              ...state.hdrModalState,
              error: null,
              finalImageBase64: event.payload.base64,
              isProcessing: false,
              progressMessage: 'Hdr Ready',
            },
          }));
        }
      }),
    );
    registerListener(
      listen('hdr-error', (event: { payload: unknown }) => {
        if (isEffectActive) {
          useUIStore.getState().setUI((state) => ({
            hdrModalState: {
              ...state.hdrModalState,
              error: String(event.payload),
              finalImageBase64: null,
              isProcessing: false,
              progressMessage: 'An error occurred.',
            },
          }));
        }
      }),
    );
    registerListener(
      listen('culling-start', (event: { payload: unknown }) => {
        if (isEffectActive) {
          useUIStore.getState().setUI((state) => ({
            cullingModalState: {
              ...state.cullingModalState,
              isOpen: true,
              progress: { current: 0, total: event.payload as number, stage: 'Initializing...' },
              suggestions: null,
              error: null,
            },
          }));
        }
      }),
    );
    registerListener(
      listen('culling-progress', (event: { payload: unknown }) => {
        if (isEffectActive) {
          useUIStore.getState().setUI((state) => ({
            cullingModalState: {
              ...state.cullingModalState,
              progress: event.payload as { current: number; total: number; stage: string } | null,
            },
          }));
        }
      }),
    );
    registerListener(
      listen('culling-complete', (event: { payload: unknown }) => {
        if (isEffectActive) {
          useUIStore.getState().setUI((state) => ({
            cullingModalState: {
              ...state.cullingModalState,
              progress: null,
              suggestions: event.payload as CullingSuggestions | null,
            },
          }));
        }
      }),
    );
    registerListener(
      listen('culling-error', (event: { payload: unknown }) => {
        if (isEffectActive) {
          useUIStore.getState().setUI((state) => ({
            cullingModalState: { ...state.cullingModalState, progress: null, error: String(event.payload) },
          }));
        }
      }),
    );

    return () => {
      isEffectActive = false;
      if (flushHandle.current !== null) {
        cancelAnimationFrame(flushHandle.current);
        flushHandle.current = null;
      }
      thumbnailBuffer.current = {};
      ratingBuffer.current = {};
      // Track which unlisten functions have already been called to prevent double-invocation
      const calledFns = new Set<() => void>();
      const callUnlisten = (fn: () => void) => {
        if (!calledFns.has(fn)) {
          calledFns.add(fn);
          fn();
        }
      };
      // Call any unlisten functions that have already resolved
      unlistenFns.forEach((unlisten) => callUnlisten(unlisten));
      // For promises that haven't resolved yet, call unlisten once they do,
      // with a timeout fallback to ensure cleanup even for slow resolves
      const CLEANUP_TIMEOUT = 3000;
      listenerPromises.forEach((p) => {
        let settled = false;
        const tryCleanup = () => {
          if (settled) return;
          settled = true;
          // Call any unlisten functions that were stored since the initial sweep
          unlistenFns.forEach((unlisten) => callUnlisten(unlisten));
        };
        const timeoutId = setTimeout(tryCleanup, CLEANUP_TIMEOUT);
        p.then(() => {
          clearTimeout(timeoutId);
          tryCleanup();
        }).catch(() => {
          clearTimeout(timeoutId);
        });
      });
    };
  }, []);
}
