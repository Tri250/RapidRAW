import { create } from 'zustand';
import {
  ImageFile,
  Panel,
  PanelRegion,
  SwitcherPlacement,
  UiVisibility,
  CullingSuggestions,
} from '../components/ui/AppProperties';

const RIGHT_PANEL_ORDER = [
  Panel.Metadata,
  Panel.Adjustments,
  Panel.Color,
  Panel.Portrait,
  Panel.Crop,
  Panel.Masks,
  Panel.Ai,
  Panel.Presets,
  Panel.Export,
];

export type { SwitcherPlacement };

export interface CollapsibleSectionsState {
  basic: boolean;
  color: boolean;
  curves: boolean;
  details: boolean;
  effects: boolean;
}

export interface ConfirmModalState {
  confirmText?: string;
  confirmVariant?: string;
  isOpen: boolean;
  message?: string;
  onConfirm?(): void;
  title?: string;
}

export interface CollageModalState {
  isOpen: boolean;
  sourceImages: ImageFile[];
}

export interface PanoramaModalState {
  error: string | null;
  finalImageBase64: string | null;
  isOpen: boolean;
  isProcessing: boolean;
  progressMessage: string | null;
  stitchingSourcePaths: Array<string>;
}

export interface HdrModalState {
  error: string | null;
  finalImageBase64: string | null;
  isOpen: boolean;
  isProcessing: boolean;
  progressMessage: string | null;
  stitchingSourcePaths: Array<string>;
}

export interface DenoiseModalState {
  isOpen: boolean;
  isProcessing: boolean;
  previewBase64: string | null;
  originalBase64?: string | null;
  error: string | null;
  targetPaths: string[];
  progressMessage: string | null;
  isRaw: boolean;
}

export interface NegativeConversionModalState {
  isOpen: boolean;
  targetPaths: Array<string>;
}

export interface CullingModalState {
  isOpen: boolean;
  suggestions: CullingSuggestions | null;
  progress: { current: number; total: number; stage: string } | null;
  error: string | null;
  pathsToCull: Array<string>;
}

export type PanelLayout = Record<PanelRegion, Panel[]>;
export type ActivePanels = Record<PanelRegion, Panel | null>;
export type PanelSwitcherPlacement = Record<PanelRegion, SwitcherPlacement>;

interface UIState {
  // View & Layout
  activeView: string;
  isFullScreen: boolean;
  isWindowFullScreen: boolean;
  isInstantTransition: boolean;
  isLayoutReady: boolean;
  uiVisibility: UiVisibility;
  isLibraryExportPanelVisible: boolean;

  // Dimensions
  leftPanelWidth: number;
  rightPanelWidth: number;
  bottomPanelHeight: number;
  compactEditorPanelHeightOverride: number | null;

  // Right Panel (legacy)
  activeRightPanel: Panel | null;
  renderedRightPanel: Panel | null;
  slideDirection: number;
  collapsibleSectionsState: CollapsibleSectionsState;

  // Panel Layout System
  panelLayout: PanelLayout;
  activePanels: ActivePanels;
  panelSwitcherPlacement: PanelSwitcherPlacement;
  activeLayoutDragItem: Panel | null;
  leftTopHeight: number;
  rightTopHeight: number;

  // Modals & Dialogs
  isCreateFolderModalOpen: boolean;
  isRenameFolderModalOpen: boolean;
  isRenameFileModalOpen: boolean;
  renameTargetPaths: Array<string>;
  isImportModalOpen: boolean;
  isCopyPasteSettingsModalOpen: boolean;
  importTargetFolder: string | null;
  importSourcePaths: Array<string>;
  folderActionTarget: string | null;

  // Album Modals
  isCreateAlbumModalOpen: boolean;
  isAddToAlbumModalOpen: boolean;
  isCreateAlbumGroupModalOpen: boolean;
  isRenameAlbumModalOpen: boolean;
  isSmartAlbumModalOpen: boolean;
  albumActionTarget: string | null;

  // Complex Modal States
  confirmModalState: ConfirmModalState;
  panoramaModalState: PanoramaModalState;
  hdrModalState: HdrModalState;
  negativeModalState: NegativeConversionModalState;
  denoiseModalState: DenoiseModalState;
  cullingModalState: CullingModalState;
  collageModalState: CollageModalState;

  // Actions
  setUI: (updater: Partial<UIState> | ((state: UIState) => Partial<UIState>)) => void;
  setRightPanel: (panel: Panel | null) => void;
  setActivePanel: (region: PanelRegion, panel: Panel) => void;
  movePanelToIndex: (panel: Panel, region: PanelRegion, newIndex: number) => void;
  setPanelSwitcherPlacement: (region: PanelRegion, placement: SwitcherPlacement) => void;
  setActiveLayoutDragItem: (panel: Panel | null) => void;
  customEscapeHandler: (() => void) | null;
  setCustomEscapeHandler: (handler: (() => void) | null) => void;
}

const DEFAULT_PANEL_LAYOUT: PanelLayout = {
  [PanelRegion.LeftTop]: [Panel.FolderTree],
  [PanelRegion.LeftBottom]: [],
  [PanelRegion.RightTop]: [Panel.Adjustments, Panel.Color, Panel.Portrait, Panel.Crop, Panel.Masks, Panel.Ai],
  [PanelRegion.RightBottom]: [Panel.Metadata, Panel.Presets, Panel.Export],
};

const DEFAULT_ACTIVE_PANELS: ActivePanels = {
  [PanelRegion.LeftTop]: Panel.FolderTree,
  [PanelRegion.LeftBottom]: null,
  [PanelRegion.RightTop]: Panel.Adjustments,
  [PanelRegion.RightBottom]: Panel.Metadata,
};

const DEFAULT_SWITCHER_PLACEMENT: PanelSwitcherPlacement = {
  [PanelRegion.LeftTop]: 'left',
  [PanelRegion.LeftBottom]: 'left',
  [PanelRegion.RightTop]: 'right',
  [PanelRegion.RightBottom]: 'right',
};

export const useUIStore = create<UIState>((set, get) => ({
  activeView: 'library',
  isFullScreen: false,
  isWindowFullScreen: false,
  isInstantTransition: false,
  isLayoutReady: false,
  uiVisibility: { folderTree: true, filmstrip: true },
  isLibraryExportPanelVisible: false,

  leftPanelWidth: 256,
  rightPanelWidth: 320,
  bottomPanelHeight: 144,
  compactEditorPanelHeightOverride: null,

  activeRightPanel: Panel.Adjustments,
  renderedRightPanel: Panel.Adjustments,
  slideDirection: 1,
  collapsibleSectionsState: { basic: true, color: false, curves: true, details: false, effects: false },

  panelLayout: DEFAULT_PANEL_LAYOUT,
  activePanels: DEFAULT_ACTIVE_PANELS,
  panelSwitcherPlacement: DEFAULT_SWITCHER_PLACEMENT,
  activeLayoutDragItem: null,
  leftTopHeight: 400,
  rightTopHeight: 400,

  isCreateFolderModalOpen: false,
  isRenameFolderModalOpen: false,
  isRenameFileModalOpen: false,
  renameTargetPaths: [],
  isImportModalOpen: false,
  isCopyPasteSettingsModalOpen: false,
  importTargetFolder: null,
  importSourcePaths: [],
  folderActionTarget: null,

  isCreateAlbumModalOpen: false,
  isAddToAlbumModalOpen: false,
  isCreateAlbumGroupModalOpen: false,
  isRenameAlbumModalOpen: false,
  isSmartAlbumModalOpen: false,
  albumActionTarget: null,

  confirmModalState: { isOpen: false },
  panoramaModalState: {
    error: null,
    finalImageBase64: null,
    isOpen: false,
    isProcessing: false,
    progressMessage: '',
    stitchingSourcePaths: [],
  },
  hdrModalState: {
    error: null,
    finalImageBase64: null,
    isOpen: false,
    isProcessing: false,
    progressMessage: '',
    stitchingSourcePaths: [],
  },
  negativeModalState: { isOpen: false, targetPaths: [] },
  denoiseModalState: {
    isOpen: false,
    isProcessing: false,
    previewBase64: null,
    error: null,
    targetPaths: [],
    progressMessage: null,
    isRaw: false,
  },
  cullingModalState: { isOpen: false, suggestions: null, progress: null, error: null, pathsToCull: [] },
  collageModalState: { isOpen: false, sourceImages: [] },

  setUI: (updater) => set((state) => (typeof updater === 'function' ? updater(state) : updater)),

  setRightPanel: (panelId) => {
    const current = get().activeRightPanel;
    if (panelId === current) {
      set({ activeRightPanel: null });
    } else {
      const currentIndex = current ? RIGHT_PANEL_ORDER.indexOf(current) : -1;
      const newIndex = panelId ? RIGHT_PANEL_ORDER.indexOf(panelId) : -1;
      set({
        slideDirection: newIndex > currentIndex ? 1 : -1,
        activeRightPanel: panelId,
        renderedRightPanel: panelId,
      });
    }
  },

  setActivePanel: (region, panel) => {
    set((state) => ({
      activePanels: { ...state.activePanels, [region]: panel },
      // Sync legacy right panel for compatibility
      ...(region === PanelRegion.RightTop || region === PanelRegion.RightBottom
        ? { activeRightPanel: panel, renderedRightPanel: panel }
        : {}),
    }));
  },

  movePanelToIndex: (panel, region, newIndex) => {
    set((state) => {
      const currentPanels = [...state.panelLayout[region]];
      const oldIndex = currentPanels.indexOf(panel);
      if (oldIndex === -1) return state;
      currentPanels.splice(oldIndex, 1);
      const clampedIndex = Math.min(newIndex, currentPanels.length);
      currentPanels.splice(clampedIndex, 0, panel);
      return {
        panelLayout: { ...state.panelLayout, [region]: currentPanels },
      };
    });
  },

  setPanelSwitcherPlacement: (region, placement) => {
    set((state) => ({
      panelSwitcherPlacement: { ...state.panelSwitcherPlacement, [region]: placement },
    }));
  },

  setActiveLayoutDragItem: (panel) => {
    set({ activeLayoutDragItem: panel });
  },

  customEscapeHandler: null,
  setCustomEscapeHandler: (handler) => set({ customEscapeHandler: handler }),
}));
