import { create } from 'zustand';
import { Progress } from '../components/ui/AppProperties';
import { ExportState, ImportState, Status } from '../components/ui/ExportImportProperties';

export interface ExternalEditSession {
  source: string;
  output: string;
  format: string;
  jpegQuality: number;
}

interface ProcessState {
  exportState: ExportState;
  importState: ImportState;
  isIndexing: boolean;
  indexingProgress: Progress;
  thumbnails: Record<string, string>;
  thumbnailProgress: Progress;
  aiModelDownloadStatus: string | null;
  copiedFilePaths: Array<string>;
  isCopied: boolean;
  isPasted: boolean;
  initialFileToOpen: string | null;
  externalEditSession: ExternalEditSession | null;

  setProcess: (state: Partial<ProcessState> | ((state: ProcessState) => Partial<ProcessState>)) => void;
  setExportState: (updater: Partial<ExportState> | ((state: ExportState) => Partial<ExportState>)) => void;
  setImportState: (updater: Partial<ImportState> | ((state: ImportState) => Partial<ImportState>)) => void;
}

let exportTimeout: ReturnType<typeof setTimeout> | undefined;
let importTimeout: ReturnType<typeof setTimeout> | undefined;
let copyTimeout: ReturnType<typeof setTimeout> | undefined;
let pasteTimeout: ReturnType<typeof setTimeout> | undefined;

let exportTimeoutValid = false;
let importTimeoutValid = false;
let copyTimeoutValid = false;
let pasteTimeoutValid = false;

export function destroyTimeouts() {
  clearTimeout(exportTimeout);
  clearTimeout(importTimeout);
  clearTimeout(copyTimeout);
  clearTimeout(pasteTimeout);
  exportTimeoutValid = false;
  importTimeoutValid = false;
  copyTimeoutValid = false;
  pasteTimeoutValid = false;
}

export const useProcessStore = create<ProcessState>((set, get) => ({
  exportState: { errorMessage: '', progress: { current: 0, total: 0 }, status: Status.Idle },
  importState: { errorMessage: '', path: '', progress: { current: 0, total: 0 }, status: Status.Idle },
  isIndexing: false,
  indexingProgress: { current: 0, total: 0 },
  thumbnails: {},
  thumbnailProgress: { current: 0, total: 0 },
  aiModelDownloadStatus: null,
  copiedFilePaths: [],
  isCopied: false,
  isPasted: false,
  initialFileToOpen: null,
  externalEditSession: null,

  setProcess: (updater) => {
    set((prev) => {
      const nextState = typeof updater === 'function' ? updater(prev) : updater;
      return { ...prev, ...nextState };
    });

    const state = get();
    if (state.isCopied) {
      clearTimeout(copyTimeout);
      copyTimeoutValid = false;
      copyTimeoutValid = true;
      copyTimeout = setTimeout(() => {
        if (copyTimeoutValid) set({ isCopied: false });
      }, 1000);
    }
    if (state.isPasted) {
      clearTimeout(pasteTimeout);
      pasteTimeoutValid = false;
      pasteTimeoutValid = true;
      pasteTimeout = setTimeout(() => {
        if (pasteTimeoutValid) set({ isPasted: false });
      }, 1000);
    }
  },

  setExportState: (updater) => {
    set((prev) => ({
      exportState: { ...prev.exportState, ...(typeof updater === 'function' ? updater(prev.exportState) : updater) },
    }));

    const status = get().exportState.status;

    clearTimeout(exportTimeout);
    exportTimeoutValid = false;

    if ([Status.Success, Status.Error, Status.Cancelled].includes(status)) {
      exportTimeoutValid = true;
      exportTimeout = setTimeout(() => {
        if (!exportTimeoutValid) return;
        set((prev) => ({
          exportState: {
            ...prev.exportState,
            status: Status.Idle,
            errorMessage: '',
            progress: { current: 0, total: 0 },
          },
        }));
      }, 5000);
    }
  },

  setImportState: (updater) => {
    set((prev) => ({
      importState: { ...prev.importState, ...(typeof updater === 'function' ? updater(prev.importState) : updater) },
    }));

    const status = get().importState.status;

    clearTimeout(importTimeout);
    importTimeoutValid = false;

    if ([Status.Success, Status.Error, Status.Cancelled].includes(status)) {
      importTimeoutValid = true;
      importTimeout = setTimeout(() => {
        if (!importTimeoutValid) return;
        set((prev) => ({
          importState: {
            ...prev.importState,
            status: Status.Idle,
            errorMessage: '',
            progress: { current: 0, total: 0 },
          },
        }));
      }, 5000);
    }
  },
}));
