import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useUIStore } from '../store/useUIStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useEditorStore } from '../store/useEditorStore';
import { Invokes } from '../components/ui/AppProperties';

export function useAndroidBackHandler() {
  const osPlatform = useSettingsStore((s) => s.osPlatform);

  useEffect(() => {
    if (osPlatform !== 'android') return;

    (window as any).__handleAndroidBack = () => {
      const ui = useUIStore.getState();

      if (ui.confirmModalState.isOpen) {
        ui.setUI((state: any) => ({ confirmModalState: { ...state.confirmModalState, isOpen: false } }));
        return;
      }
      if (ui.isCreateFolderModalOpen) {
        ui.setUI({ isCreateFolderModalOpen: false });
        return;
      }
      if (ui.isRenameFolderModalOpen) {
        ui.setUI({ isRenameFolderModalOpen: false });
        return;
      }
      if (ui.isRenameFileModalOpen) {
        ui.setUI({ isRenameFileModalOpen: false });
        return;
      }
      if (ui.isImportModalOpen) {
        ui.setUI({ isImportModalOpen: false });
        return;
      }
      if (ui.isCopyPasteSettingsModalOpen) {
        ui.setUI({ isCopyPasteSettingsModalOpen: false });
        return;
      }
      if (ui.isCreateAlbumModalOpen) {
        ui.setUI({ isCreateAlbumModalOpen: false });
        return;
      }
      if (ui.isCreateAlbumGroupModalOpen) {
        ui.setUI({ isCreateAlbumGroupModalOpen: false });
        return;
      }
      if (ui.isRenameAlbumModalOpen) {
        ui.setUI({ isRenameAlbumModalOpen: false });
        return;
      }
      if (ui.panoramaModalState.isOpen) {
        ui.setUI({
          panoramaModalState: {
            isOpen: false,
            isProcessing: false,
            progressMessage: '',
            finalImageBase64: null,
            error: null,
            stitchingSourcePaths: [],
          },
        });
        return;
      }
      if (ui.hdrModalState.isOpen) {
        ui.setUI({
          hdrModalState: {
            isOpen: false,
            isProcessing: false,
            progressMessage: '',
            finalImageBase64: null,
            error: null,
            stitchingSourcePaths: [],
          },
        });
        return;
      }
      if (ui.negativeModalState.isOpen) {
        ui.setUI((state: any) => ({ negativeModalState: { ...state.negativeModalState, isOpen: false } }));
        return;
      }
      if (ui.denoiseModalState.isOpen) {
        ui.setUI((state: any) => ({ denoiseModalState: { ...state.denoiseModalState, isOpen: false } }));
        return;
      }
      if (ui.cullingModalState.isOpen) {
        ui.setUI({
          cullingModalState: { isOpen: false, progress: null, suggestions: null, error: null, pathsToCull: [] },
        });
        return;
      }
      if (ui.collageModalState.isOpen) {
        ui.setUI({ collageModalState: { isOpen: false, sourceImages: [] } });
        return;
      }

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
    };

    // Android low memory handler - release cached images and previews
    (window as any).__handleLowMemory = (level: number) => {
      const editor = useEditorStore.getState();
      // Release cached preview URLs to free memory
      if (level >= 10) { // TRIM_MEMORY_RUNNING_LOW or higher
        if (editor.finalPreviewUrl) {
          URL.revokeObjectURL(editor.finalPreviewUrl);
          editor.setEditor({ finalPreviewUrl: null });
        }
        if (editor.uncroppedAdjustedPreviewUrl) {
          URL.revokeObjectURL(editor.uncroppedAdjustedPreviewUrl);
          editor.setEditor({ uncroppedAdjustedPreviewUrl: null });
        }
        if (editor.transformedOriginalUrl) {
          URL.revokeObjectURL(editor.transformedOriginalUrl);
          editor.setEditor({ transformedOriginalUrl: null });
        }
      }
      // For critical level, also clear waveform/histogram caches
      if (level >= 15) { // TRIM_MEMORY_RUNNING_CRITICAL
        editor.setEditor({ histogram: null, waveform: null });
      }
    };

    // Android app background handler - ensure sidecar is saved immediately
    (window as any).__handleAppBackground = () => {
      const editor = useEditorStore.getState();
      const selectedPath = editor.selectedImage?.path;
      if (selectedPath) {
        // Flush debounced save and do an immediate save to ensure sidecar is persisted
        invoke(Invokes.SaveMetadataAndUpdateThumbnail, {
          path: selectedPath,
          adjustments: editor.adjustments,
        }).catch((err: any) => {
          console.error('Background save failed:', err);
        });
      }
    };

    return () => {
      delete (window as any).__handleAndroidBack;
      delete (window as any).__handleLowMemory;
      delete (window as any).__handleAppBackground;
    };
  }, [osPlatform]);
}
