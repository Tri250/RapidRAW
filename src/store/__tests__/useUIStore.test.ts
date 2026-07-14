import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from '../useUIStore';
import { Panel } from '../../components/ui/AppProperties';

describe('useUIStore', () => {
  beforeEach(() => {
    useUIStore.setState(useUIStore.getInitialState());
  });

  describe('初始状态验证', () => {
    it('activeView 为 library', () => {
      const state = useUIStore.getState();
      expect(state.activeView).toBe('library');
    });

    it('isFullScreen 为 false', () => {
      const state = useUIStore.getState();
      expect(state.isFullScreen).toBe(false);
    });

    it('isWindowFullScreen 为 false', () => {
      const state = useUIStore.getState();
      expect(state.isWindowFullScreen).toBe(false);
    });

    it('isInstantTransition 为 false', () => {
      const state = useUIStore.getState();
      expect(state.isInstantTransition).toBe(false);
    });

    it('isLayoutReady 为 false', () => {
      const state = useUIStore.getState();
      expect(state.isLayoutReady).toBe(false);
    });

    it('uiVisibility 默认值正确', () => {
      const state = useUIStore.getState();
      expect(state.uiVisibility).toEqual({ folderTree: true, filmstrip: true });
    });

    it('isLibraryExportPanelVisible 为 false', () => {
      const state = useUIStore.getState();
      expect(state.isLibraryExportPanelVisible).toBe(false);
    });

    it('leftPanelWidth 默认值为 256', () => {
      const state = useUIStore.getState();
      expect(state.leftPanelWidth).toBe(256);
    });

    it('rightPanelWidth 默认值为 320', () => {
      const state = useUIStore.getState();
      expect(state.rightPanelWidth).toBe(320);
    });

    it('bottomPanelHeight 默认值为 144', () => {
      const state = useUIStore.getState();
      expect(state.bottomPanelHeight).toBe(144);
    });

    it('compactEditorPanelHeightOverride 为 null', () => {
      const state = useUIStore.getState();
      expect(state.compactEditorPanelHeightOverride).toBeNull();
    });

    it('activeRightPanel 为 Adjustments', () => {
      const state = useUIStore.getState();
      expect(state.activeRightPanel).toBe(Panel.Adjustments);
    });

    it('renderedRightPanel 为 Adjustments', () => {
      const state = useUIStore.getState();
      expect(state.renderedRightPanel).toBe(Panel.Adjustments);
    });

    it('slideDirection 为 1', () => {
      const state = useUIStore.getState();
      expect(state.slideDirection).toBe(1);
    });

    it('collapsibleSectionsState 默认值正确', () => {
      const state = useUIStore.getState();
      expect(state.collapsibleSectionsState).toEqual({
        basic: true,
        color: false,
        curves: true,
        details: false,
        effects: false,
      });
    });

    it('各种 modal 状态默认值正确', () => {
      const state = useUIStore.getState();
      expect(state.isCreateFolderModalOpen).toBe(false);
      expect(state.isRenameFolderModalOpen).toBe(false);
      expect(state.isRenameFileModalOpen).toBe(false);
      expect(state.renameTargetPaths).toEqual([]);
      expect(state.isImportModalOpen).toBe(false);
      expect(state.isCopyPasteSettingsModalOpen).toBe(false);
      expect(state.importTargetFolder).toBeNull();
      expect(state.importSourcePaths).toEqual([]);
      expect(state.folderActionTarget).toBeNull();
      expect(state.isCreateAlbumModalOpen).toBe(false);
      expect(state.isCreateAlbumGroupModalOpen).toBe(false);
      expect(state.isRenameAlbumModalOpen).toBe(false);
      expect(state.albumActionTarget).toBeNull();
      expect(state.isConfigurePresetModalOpen).toBe(false);
      expect(state.isLensCorrectionModalOpen).toBe(false);
      expect(state.isTransformModalOpen).toBe(false);
    });

    it('confirmModalState 默认值正确', () => {
      const state = useUIStore.getState();
      expect(state.confirmModalState).toEqual({ isOpen: false });
    });

    it('panoramaModalState 默认值正确', () => {
      const state = useUIStore.getState();
      expect(state.panoramaModalState).toEqual({
        error: null,
        finalImageBase64: null,
        isOpen: false,
        isProcessing: false,
        progressMessage: '',
        stitchingSourcePaths: [],
      });
    });

    it('hdrModalState 默认值正确', () => {
      const state = useUIStore.getState();
      expect(state.hdrModalState).toEqual({
        error: null,
        finalImageBase64: null,
        isOpen: false,
        isProcessing: false,
        progressMessage: '',
        stitchingSourcePaths: [],
      });
    });

    it('negativeModalState 默认值正确', () => {
      const state = useUIStore.getState();
      expect(state.negativeModalState).toEqual({
        isOpen: false,
        targetPaths: [],
      });
    });

    it('denoiseModalState 默认值正确', () => {
      const state = useUIStore.getState();
      expect(state.denoiseModalState).toEqual({
        isOpen: false,
        isProcessing: false,
        previewBase64: null,
        error: null,
        targetPaths: [],
        progressMessage: null,
        isRaw: false,
      });
    });

    it('cullingModalState 默认值正确', () => {
      const state = useUIStore.getState();
      expect(state.cullingModalState).toEqual({
        isOpen: false,
        suggestions: null,
        progress: null,
        error: null,
        pathsToCull: [],
      });
    });

    it('collageModalState 默认值正确', () => {
      const state = useUIStore.getState();
      expect(state.collageModalState).toEqual({
        isOpen: false,
        sourceImages: [],
      });
    });

    it('customEscapeHandler 为 null', () => {
      const state = useUIStore.getState();
      expect(state.customEscapeHandler).toBeNull();
    });
  });

  describe('setUI action', () => {
    it('可以用对象设置状态', () => {
      const state = useUIStore.getState();
      state.setUI({ activeView: 'editor', isFullScreen: true });
      const newState = useUIStore.getState();
      expect(newState.activeView).toBe('editor');
      expect(newState.isFullScreen).toBe(true);
    });

    it('可以用函数设置状态', () => {
      const state = useUIStore.getState();
      state.setUI((prevState) => ({
        leftPanelWidth: prevState.leftPanelWidth + 100,
        rightPanelWidth: prevState.rightPanelWidth + 50,
      }));
      const newState = useUIStore.getState();
      expect(newState.leftPanelWidth).toBe(356);
      expect(newState.rightPanelWidth).toBe(370);
    });

    it('对象设置不会影响其他状态', () => {
      const state = useUIStore.getState();
      const originalView = state.activeView;
      state.setUI({ isFullScreen: true });
      const newState = useUIStore.getState();
      expect(newState.activeView).toBe(originalView);
      expect(newState.isFullScreen).toBe(true);
    });

    it('函数设置可以访问之前的状态', () => {
      const state = useUIStore.getState();
      state.setUI({ isLayoutReady: true });
      state.setUI((prevState) => ({
        isInstantTransition: prevState.isLayoutReady,
      }));
      const newState = useUIStore.getState();
      expect(newState.isInstantTransition).toBe(true);
    });
  });

  describe('setRightPanel action', () => {
    it('点击相同 panel 会关闭（设为 null）', () => {
      const state = useUIStore.getState();
      expect(state.activeRightPanel).toBe(Panel.Adjustments);
      state.setRightPanel(Panel.Adjustments);
      const newState = useUIStore.getState();
      expect(newState.activeRightPanel).toBeNull();
    });

    it('切换到后面的 panel 时 slideDirection 为 1', () => {
      const state = useUIStore.getState();
      state.setRightPanel(Panel.Crop);
      const newState = useUIStore.getState();
      expect(newState.activeRightPanel).toBe(Panel.Crop);
      expect(newState.renderedRightPanel).toBe(Panel.Crop);
      expect(newState.slideDirection).toBe(1);
    });

    it('切换到前面的 panel 时 slideDirection 为 -1', () => {
      const state = useUIStore.getState();
      state.setRightPanel(Panel.Metadata);
      const newState = useUIStore.getState();
      expect(newState.activeRightPanel).toBe(Panel.Metadata);
      expect(newState.renderedRightPanel).toBe(Panel.Metadata);
      expect(newState.slideDirection).toBe(-1);
    });

    it('设置为 null 时的行为', () => {
      const state = useUIStore.getState();
      state.setRightPanel(null);
      const newState = useUIStore.getState();
      expect(newState.activeRightPanel).toBeNull();
      expect(newState.renderedRightPanel).toBeNull();
      expect(newState.slideDirection).toBe(-1);
    });

    it('activeRightPanel 和 renderedRightPanel 同时更新', () => {
      const state = useUIStore.getState();
      state.setRightPanel(Panel.Export);
      const newState = useUIStore.getState();
      expect(newState.activeRightPanel).toBe(Panel.Export);
      expect(newState.renderedRightPanel).toBe(Panel.Export);
    });

    it('从 null 切换到 panel 时方向正确', () => {
      const state = useUIStore.getState();
      state.setRightPanel(null);
      const afterNullState = useUIStore.getState();
      expect(afterNullState.activeRightPanel).toBeNull();
      afterNullState.setRightPanel(Panel.Adjustments);
      const newState = useUIStore.getState();
      expect(newState.activeRightPanel).toBe(Panel.Adjustments);
      expect(newState.slideDirection).toBe(1);
    });

    it('从 null 切换到第一个 panel 时方向为 1', () => {
      const state = useUIStore.getState();
      state.setRightPanel(null);
      const afterNullState = useUIStore.getState();
      afterNullState.setRightPanel(Panel.Metadata);
      const newState = useUIStore.getState();
      expect(newState.activeRightPanel).toBe(Panel.Metadata);
      expect(newState.slideDirection).toBe(1);
    });

    it('切换到最后一个 panel 时方向正确', () => {
      const state = useUIStore.getState();
      state.setRightPanel(Panel.Export);
      const newState = useUIStore.getState();
      expect(newState.activeRightPanel).toBe(Panel.Export);
      expect(newState.slideDirection).toBe(1);
    });

    it('从最后一个 panel 切换到前面的 panel 方向为 -1', () => {
      const state = useUIStore.getState();
      state.setRightPanel(Panel.Export);
      const exportState = useUIStore.getState();
      exportState.setRightPanel(Panel.Presets);
      const newState = useUIStore.getState();
      expect(newState.activeRightPanel).toBe(Panel.Presets);
      expect(newState.slideDirection).toBe(-1);
    });
  });

  describe('setCustomEscapeHandler action', () => {
    it('设置自定义 handler', () => {
      const state = useUIStore.getState();
      const mockHandler = () => {};
      state.setCustomEscapeHandler(mockHandler);
      const newState = useUIStore.getState();
      expect(newState.customEscapeHandler).toBe(mockHandler);
    });

    it('设置为 null', () => {
      const state = useUIStore.getState();
      const mockHandler = () => {};
      state.setCustomEscapeHandler(mockHandler);
      const stateWithHandler = useUIStore.getState();
      expect(stateWithHandler.customEscapeHandler).toBe(mockHandler);
      stateWithHandler.setCustomEscapeHandler(null);
      const newState = useUIStore.getState();
      expect(newState.customEscapeHandler).toBeNull();
    });

    it('可以设置不同的 handler', () => {
      const state = useUIStore.getState();
      const handler1 = () => {};
      const handler2 = () => {};
      state.setCustomEscapeHandler(handler1);
      const state1 = useUIStore.getState();
      expect(state1.customEscapeHandler).toBe(handler1);
      state1.setCustomEscapeHandler(handler2);
      const state2 = useUIStore.getState();
      expect(state2.customEscapeHandler).toBe(handler2);
    });
  });
});
