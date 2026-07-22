import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'react-toastify';
import { useEditorStore } from '../store/useEditorStore';
import { useLibraryStore } from '../store/useLibraryStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { Invokes } from '../components/ui/AppProperties';
import { INITIAL_ADJUSTMENTS, normalizeLoadedAdjustments } from '../utils/adjustments';

export function useImageLoader(cachedEditStateRef: React.RefObject<any>) {
  const selectedImage = useEditorStore((s) => s.selectedImage);
  const adjustments = useEditorStore((s) => s.adjustments);
  const histogram = useEditorStore((s) => s.histogram);
  const waveform = useEditorStore((s) => s.waveform);
  const finalPreviewUrl = useEditorStore((s) => s.finalPreviewUrl);
  const uncroppedAdjustedPreviewUrl = useEditorStore((s) => s.uncroppedAdjustedPreviewUrl);
  const originalSize = useEditorStore((s) => s.originalSize);
  const previewSize = useEditorStore((s) => s.previewSize);
  const hasRenderedFirstFrame = useEditorStore((s) => s.hasRenderedFirstFrame);

  const setEditor = useEditorStore((s) => s.setEditor);
  const resetHistory = useEditorStore((s) => s.resetHistory);
  const setLibrary = useLibraryStore((s) => s.setLibrary);
  const appSettings = useSettingsStore((s) => s.appSettings);

  const isWgpuActive = appSettings?.useWgpuRenderer !== false && selectedImage?.isReady && hasRenderedFirstFrame;

  useEffect(() => {
    if (selectedImage && !selectedImage.isReady && selectedImage.path) {
      let isEffectActive = true;

      const loadMetadataEarly = async () => {
        try {
          useEditorStore.getState().patchesSentToBackend.clear();
          try {
            await invoke('clear_session_caches');
          } catch (e) {
            console.warn('Cache clear failed:', e);
          }

          const metadata: any = await invoke(Invokes.LoadMetadata, { path: selectedImage.path });
          if (!isEffectActive) return;

          let initialAdjusts;
          if (metadata.adjustments && !metadata.adjustments.is_null) {
            initialAdjusts = normalizeLoadedAdjustments(metadata.adjustments);
          } else {
            initialAdjusts = { ...INITIAL_ADJUSTMENTS };
          }

          setEditor({ adjustments: initialAdjusts });
          resetHistory(initialAdjusts);
        } catch (err) {
          console.error('Failed to load metadata early:', err);
        }
      };

      const loadFullImageData = async () => {
        setLibrary({ isViewLoading: true });
        try {
          const loadImageResult: any = await invoke(Invokes.LoadImage, { path: selectedImage.path });
          if (!isEffectActive) return;

          const { width, height } = loadImageResult;
          setEditor({ originalSize: { width, height } });

          if (appSettings?.editorPreviewResolution) {
            const maxSize = appSettings.editorPreviewResolution;
            const aspectRatio = width / height;

            if (width > height) {
              const pWidth = Math.min(width, maxSize);
              const pHeight = Math.round(pWidth / aspectRatio);
              setEditor({ previewSize: { width: pWidth, height: pHeight } });
            } else {
              const pHeight = Math.min(height, maxSize);
              const pWidth = Math.round(pHeight * aspectRatio);
              setEditor({ previewSize: { width: pWidth, height: pHeight } });
            }
          } else {
            setEditor({ previewSize: { width: 0, height: 0 } });
          }

          // Preserve existing thumbnailUrl/originalUrl as display fallback.
          // When wgpu is enabled, the backend may return WGPU_RENDER instead of
          // image data. We must keep a displayable image URL for fallback.
          const existingThumbnailUrl = selectedImage.thumbnailUrl;

          setEditor((state) => {
            if (state.selectedImage && state.selectedImage.path === selectedImage.path) {
              return {
                selectedImage: {
                  ...state.selectedImage,
                  exif: loadImageResult.exif,
                  height: loadImageResult.height,
                  isRaw: loadImageResult.is_raw,
                  isReady: true,
                  metadata: loadImageResult.metadata,
                  // Keep thumbnailUrl for fallback display when wgpu fails
                  originalUrl: existingThumbnailUrl,
                  width: loadImageResult.width,
                },
              };
            }
            return state;
          });

          // Generate an initial CPU-based preview as fallback when wgpu is enabled.
          // This ensures the editor displays an image immediately, even if wgpu
          // takes longer to initialize (common on Windows with some GPU drivers).
          if (appSettings?.useWgpuRenderer !== false) {
            try {
              const previewResult: ArrayBuffer | null = await invoke(Invokes.GeneratePreviewForPath, {
                path: selectedImage.path,
                previewResolution: appSettings?.editorPreviewResolution || 1920,
              });
              if (previewResult && previewResult.byteLength > 0 && isEffectActive) {
                const textDecoder = new TextDecoder();
                const previewPrefix = textDecoder.decode(previewResult.slice(0, 11));
                // Only use as fallback if it's actual image data (not WGPU_RENDER)
                if (previewPrefix !== 'WGPU_RENDER') {
                  const blob = new Blob([previewResult], { type: 'image/jpeg' });
                  const url = URL.createObjectURL(blob);
                  // Only set as fallback if wgpu hasn't rendered yet
                  if (!useEditorStore.getState().hasRenderedFirstFrame) {
                    setEditor((state) => {
                      const prevUrl = state.finalPreviewUrl;
                      if (prevUrl && prevUrl.startsWith('blob:')) {
                        setTimeout(() => URL.revokeObjectURL(prevUrl), 100);
                      }
                      return { finalPreviewUrl: url };
                    });
                  } else {
                    URL.revokeObjectURL(url);
                  }
                }
              }
            } catch (err) {
              console.warn('Initial preview generation failed (non-critical):', err);
            }
          }

          setEditor((state) => {
            if (!state.adjustments.aspectRatio && !state.adjustments.crop) {
              const safeHeight = loadImageResult.height || 1;
              return {
                adjustments: { ...state.adjustments, aspectRatio: loadImageResult.width / safeHeight },
              };
            }
            return state;
          });
        } catch (err) {
          if (isEffectActive) {
            console.error('Failed to load image:', err);
            toast.error(`Failed to load image: ${err}`);
            setEditor({ selectedImage: null });
          }
        } finally {
          setLibrary({ isViewLoading: false });
        }
      };

      const loadAll = async () => {
        await loadMetadataEarly();
        if (isEffectActive) {
          await loadFullImageData();
        }
      };

      loadAll();

      return () => {
        isEffectActive = false;
      };
    }
  }, [
    selectedImage?.path,
    selectedImage?.isReady,
    appSettings?.editorPreviewResolution,
    resetHistory,
    setEditor,
    setLibrary,
  ]);

  useEffect(() => {
    if (selectedImage?.path && selectedImage.isReady && (finalPreviewUrl || isWgpuActive)) {
      cachedEditStateRef.current = {
        adjustments,
        histogram,
        waveform,
        finalPreviewUrl,
        uncroppedPreviewUrl: uncroppedAdjustedPreviewUrl,
        selectedImage,
        originalSize,
        previewSize,
      };
    } else {
      cachedEditStateRef.current = null;
    }
  }, [
    selectedImage,
    adjustments,
    histogram,
    waveform,
    finalPreviewUrl,
    uncroppedAdjustedPreviewUrl,
    originalSize,
    previewSize,
    isWgpuActive,
    cachedEditStateRef,
  ]);
}
