import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '../useEditorStore';
import { INITIAL_ADJUSTMENTS } from '../../utils/adjustments';
import { ToolType } from '../../components/panel/right/Masks';

describe('useEditorStore', () => {
  beforeEach(() => {
    useEditorStore.setState(useEditorStore.getInitialState());
  });

  describe('初始状态验证', () => {
    it('selectedImage 为 null', () => {
      const state = useEditorStore.getState();
      expect(state.selectedImage).toBeNull();
    });

    it('adjustments 是 INITIAL_ADJUSTMENTS', () => {
      const state = useEditorStore.getState();
      expect(state.adjustments).toEqual(INITIAL_ADJUSTMENTS);
    });

    it('previewOverride 为 null', () => {
      const state = useEditorStore.getState();
      expect(state.previewOverride).toBeNull();
    });

    it('history 有一个元素（INITIAL_ADJUSTMENTS）', () => {
      const state = useEditorStore.getState();
      expect(state.history).toHaveLength(1);
      expect(state.history[0]).toEqual(INITIAL_ADJUSTMENTS);
    });

    it('historyIndex 为 0', () => {
      const state = useEditorStore.getState();
      expect(state.historyIndex).toBe(0);
    });

    it('各种布尔值默认值正确', () => {
      const state = useEditorStore.getState();
      expect(state.showOriginal).toBe(false);
      expect(state.isWaveformVisible).toBe(false);
      expect(state.isSliderDragging).toBe(false);
      expect(state.isRotationActive).toBe(false);
      expect(state.isStraightenActive).toBe(false);
      expect(state.isWbPickerActive).toBe(false);
      expect(state.isGeneratingAiMask).toBe(false);
      expect(state.isGeneratingAi).toBe(false);
      expect(state.isAIConnectorConnected).toBe(false);
      expect(state.isMaskControlHovered).toBe(false);
      expect(state.hasRenderedFirstFrame).toBe(false);
    });

    it('zoom 为 1', () => {
      const state = useEditorStore.getState();
      expect(state.zoom).toBe(1);
    });

    it('各种尺寸默认为 { width: 0, height: 0 }', () => {
      const state = useEditorStore.getState();
      expect(state.displaySize).toEqual({ width: 0, height: 0 });
      expect(state.previewSize).toEqual({ width: 0, height: 0 });
      expect(state.baseRenderSize).toEqual({ width: 0, height: 0 });
      expect(state.originalSize).toEqual({ width: 0, height: 0 });
    });

    it('brushSettings 有默认值', () => {
      const state = useEditorStore.getState();
      expect(state.brushSettings).toEqual({
        size: 50,
        feather: 50,
        tool: ToolType.Brush,
      });
    });

    it('patchesSentToBackend 是空 Set', () => {
      const state = useEditorStore.getState();
      expect(state.patchesSentToBackend).toBeInstanceOf(Set);
      expect(state.patchesSentToBackend.size).toBe(0);
    });

    it('其他初始状态验证', () => {
      const state = useEditorStore.getState();
      expect(state.finalPreviewUrl).toBeNull();
      expect(state.uncroppedAdjustedPreviewUrl).toBeNull();
      expect(state.transformedOriginalUrl).toBeNull();
      expect(state.interactivePatch).toBeNull();
      expect(state.histogram).toBeNull();
      expect(state.waveform).toBeNull();
      expect(state.activeWaveformChannel).toBe('luma');
      expect(state.waveformHeight).toBe(220);
      expect(state.activeMaskContainerId).toBeNull();
      expect(state.activeMaskId).toBeNull();
      expect(state.activeAiPatchContainerId).toBeNull();
      expect(state.activeAiSubMaskId).toBeNull();
      expect(state.overlayMode).toBe('thirds');
      expect(state.overlayRotation).toBe(0);
      expect(state.liveRotation).toBeNull();
      expect(state.copiedSectionAdjustments).toBeNull();
      expect(state.copiedMask).toBeNull();
      expect(state.copiedAdjustments).toBeNull();
    });
  });

  describe('setEditor action', () => {
    it('可以用对象设置状态', () => {
      const { setEditor } = useEditorStore.getState();
      setEditor({ zoom: 2, showOriginal: true });

      const state = useEditorStore.getState();
      expect(state.zoom).toBe(2);
      expect(state.showOriginal).toBe(true);
    });

    it('可以用函数设置状态（接收当前 state）', () => {
      const { setEditor } = useEditorStore.getState();
      setEditor({ zoom: 2 });

      setEditor((state) => ({
        zoom: state.zoom + 1,
      }));

      const state = useEditorStore.getState();
      expect(state.zoom).toBe(3);
    });

    it('函数式更新可以访问多个状态字段', () => {
      const { setEditor } = useEditorStore.getState();
      setEditor({ zoom: 2, showOriginal: true });

      setEditor((state) => ({
        zoom: state.zoom * 2,
        showOriginal: !state.showOriginal,
      }));

      const state = useEditorStore.getState();
      expect(state.zoom).toBe(4);
      expect(state.showOriginal).toBe(false);
    });

    it('对象式更新不会影响其他字段', () => {
      const { setEditor } = useEditorStore.getState();
      const originalZoom = useEditorStore.getState().zoom;
      const originalShowOriginal = useEditorStore.getState().showOriginal;

      setEditor({ isSliderDragging: true });

      const state = useEditorStore.getState();
      expect(state.isSliderDragging).toBe(true);
      expect(state.zoom).toBe(originalZoom);
      expect(state.showOriginal).toBe(originalShowOriginal);
    });
  });

  describe('pushHistory action', () => {
    it('添加新历史记录', () => {
      const { pushHistory } = useEditorStore.getState();
      const newAdjustments = { ...INITIAL_ADJUSTMENTS, exposure: 1 };

      pushHistory(newAdjustments);

      const state = useEditorStore.getState();
      expect(state.history).toHaveLength(2);
      expect(state.history[1]).toEqual(newAdjustments);
    });

    it('historyIndex 移动到最后', () => {
      const { pushHistory } = useEditorStore.getState();
      const newAdjustments = { ...INITIAL_ADJUSTMENTS, exposure: 1 };

      pushHistory(newAdjustments);

      const state = useEditorStore.getState();
      expect(state.historyIndex).toBe(1);
    });

    it('如果当前不在历史末尾，会砍掉后面的历史', () => {
      const { pushHistory, undo } = useEditorStore.getState();
      const adj1 = { ...INITIAL_ADJUSTMENTS, exposure: 1 };
      const adj2 = { ...INITIAL_ADJUSTMENTS, exposure: 2 };
      const adj3 = { ...INITIAL_ADJUSTMENTS, exposure: 3 };

      pushHistory(adj1);
      pushHistory(adj2);
      undo();

      const stateBefore = useEditorStore.getState();
      expect(stateBefore.history).toHaveLength(3);
      expect(stateBefore.historyIndex).toBe(1);

      pushHistory(adj3);

      const stateAfter = useEditorStore.getState();
      expect(stateAfter.history).toHaveLength(3);
      expect(stateAfter.historyIndex).toBe(2);
      expect(stateAfter.history[0]).toEqual(INITIAL_ADJUSTMENTS);
      expect(stateAfter.history[1]).toEqual(adj1);
      expect(stateAfter.history[2]).toEqual(adj3);
    });

    it('超过 50 条时会淘汰最旧的', () => {
      const { pushHistory } = useEditorStore.getState();

      for (let i = 0; i < 55; i++) {
        pushHistory({ ...INITIAL_ADJUSTMENTS, exposure: i + 1 });
      }

      const state = useEditorStore.getState();
      expect(state.history).toHaveLength(50);
      expect(state.historyIndex).toBe(49);
      expect(state.history[0].exposure).toBe(6);
      expect(state.history[49].exposure).toBe(55);
    });

    it('正好 50 条时不淘汰', () => {
      const { pushHistory } = useEditorStore.getState();

      for (let i = 0; i < 49; i++) {
        pushHistory({ ...INITIAL_ADJUSTMENTS, exposure: i + 1 });
      }

      const state = useEditorStore.getState();
      expect(state.history).toHaveLength(50);
      expect(state.history[0]).toEqual(INITIAL_ADJUSTMENTS);
      expect(state.history[49].exposure).toBe(49);
    });
  });

  describe('undo action', () => {
    it('有历史时可以撤销，historyIndex 减 1', () => {
      const { pushHistory, undo } = useEditorStore.getState();
      const newAdjustments = { ...INITIAL_ADJUSTMENTS, exposure: 1 };

      pushHistory(newAdjustments);
      undo();

      const state = useEditorStore.getState();
      expect(state.historyIndex).toBe(0);
    });

    it('adjustments 更新为对应历史', () => {
      const { pushHistory, undo, redo } = useEditorStore.getState();
      const newAdjustments = { ...INITIAL_ADJUSTMENTS, exposure: 1 };

      pushHistory(newAdjustments);
      undo();
      redo();
      undo();

      const state = useEditorStore.getState();
      expect(state.adjustments).toEqual(INITIAL_ADJUSTMENTS);
    });

    it('已经在最开始时不能再撤销', () => {
      const { undo } = useEditorStore.getState();

      undo();
      undo();

      const state = useEditorStore.getState();
      expect(state.historyIndex).toBe(0);
      expect(state.adjustments).toEqual(INITIAL_ADJUSTMENTS);
    });

    it('多次撤销可以回到更早的历史', () => {
      const { pushHistory, undo } = useEditorStore.getState();
      const adj1 = { ...INITIAL_ADJUSTMENTS, exposure: 1 };
      const adj2 = { ...INITIAL_ADJUSTMENTS, exposure: 2 };
      const adj3 = { ...INITIAL_ADJUSTMENTS, exposure: 3 };

      pushHistory(adj1);
      pushHistory(adj2);
      pushHistory(adj3);

      undo();
      undo();

      const state = useEditorStore.getState();
      expect(state.historyIndex).toBe(1);
      expect(state.adjustments).toEqual(adj1);
    });
  });

  describe('redo action', () => {
    it('有后续历史时可以重做', () => {
      const { pushHistory, undo, redo } = useEditorStore.getState();
      const newAdjustments = { ...INITIAL_ADJUSTMENTS, exposure: 1 };

      pushHistory(newAdjustments);
      undo();
      redo();

      const state = useEditorStore.getState();
      expect(state.historyIndex).toBe(1);
    });

    it('redo 后 adjustments 更新为对应历史', () => {
      const { pushHistory, undo, redo } = useEditorStore.getState();
      const newAdjustments = { ...INITIAL_ADJUSTMENTS, exposure: 1 };

      pushHistory(newAdjustments);
      undo();
      redo();

      const state = useEditorStore.getState();
      expect(state.adjustments).toEqual(newAdjustments);
    });

    it('已经在最新时不能再重做', () => {
      const { pushHistory, undo, redo } = useEditorStore.getState();
      const newAdjustments = { ...INITIAL_ADJUSTMENTS, exposure: 1 };

      pushHistory(newAdjustments);
      undo();
      redo();
      redo();
      redo();

      const state = useEditorStore.getState();
      expect(state.historyIndex).toBe(1);
      expect(state.adjustments).toEqual(newAdjustments);
    });

    it('多次重做可以回到最新的历史', () => {
      const { pushHistory, undo, redo } = useEditorStore.getState();
      const adj1 = { ...INITIAL_ADJUSTMENTS, exposure: 1 };
      const adj2 = { ...INITIAL_ADJUSTMENTS, exposure: 2 };
      const adj3 = { ...INITIAL_ADJUSTMENTS, exposure: 3 };

      pushHistory(adj1);
      pushHistory(adj2);
      pushHistory(adj3);

      undo();
      undo();
      undo();

      redo();
      redo();
      redo();

      const state = useEditorStore.getState();
      expect(state.historyIndex).toBe(3);
      expect(state.adjustments).toEqual(adj3);
    });
  });

  describe('resetHistory action', () => {
    it('重置历史为单个初始状态', () => {
      const { pushHistory, resetHistory } = useEditorStore.getState();
      const newAdjustments = { ...INITIAL_ADJUSTMENTS, exposure: 1 };

      pushHistory(newAdjustments);
      pushHistory({ ...INITIAL_ADJUSTMENTS, exposure: 2 });

      resetHistory(INITIAL_ADJUSTMENTS);

      const state = useEditorStore.getState();
      expect(state.history).toHaveLength(1);
      expect(state.history[0]).toEqual(INITIAL_ADJUSTMENTS);
    });

    it('historyIndex 归零', () => {
      const { pushHistory, resetHistory } = useEditorStore.getState();
      const newAdjustments = { ...INITIAL_ADJUSTMENTS, exposure: 1 };

      pushHistory(newAdjustments);
      resetHistory(INITIAL_ADJUSTMENTS);

      const state = useEditorStore.getState();
      expect(state.historyIndex).toBe(0);
    });

    it('adjustments 更新为初始状态', () => {
      const { pushHistory, resetHistory } = useEditorStore.getState();
      const newAdjustments = { ...INITIAL_ADJUSTMENTS, exposure: 1 };

      pushHistory(newAdjustments);
      resetHistory(INITIAL_ADJUSTMENTS);

      const state = useEditorStore.getState();
      expect(state.adjustments).toEqual(INITIAL_ADJUSTMENTS);
    });

    it('可以使用自定义初始状态重置', () => {
      const { pushHistory, resetHistory } = useEditorStore.getState();
      const customInitial = { ...INITIAL_ADJUSTMENTS, exposure: 5 };

      pushHistory({ ...INITIAL_ADJUSTMENTS, exposure: 1 });
      resetHistory(customInitial);

      const state = useEditorStore.getState();
      expect(state.history).toHaveLength(1);
      expect(state.history[0]).toEqual(customInitial);
      expect(state.adjustments).toEqual(customInitial);
      expect(state.historyIndex).toBe(0);
    });
  });

  describe('goToHistoryIndex action', () => {
    it('有效索引可以跳转', () => {
      const { pushHistory, goToHistoryIndex } = useEditorStore.getState();
      const adj1 = { ...INITIAL_ADJUSTMENTS, exposure: 1 };
      const adj2 = { ...INITIAL_ADJUSTMENTS, exposure: 2 };

      pushHistory(adj1);
      pushHistory(adj2);

      goToHistoryIndex(1);

      const state = useEditorStore.getState();
      expect(state.historyIndex).toBe(1);
      expect(state.adjustments).toEqual(adj1);
    });

    it('跳转到 0 索引', () => {
      const { pushHistory, goToHistoryIndex } = useEditorStore.getState();
      const adj1 = { ...INITIAL_ADJUSTMENTS, exposure: 1 };

      pushHistory(adj1);
      goToHistoryIndex(0);

      const state = useEditorStore.getState();
      expect(state.historyIndex).toBe(0);
      expect(state.adjustments).toEqual(INITIAL_ADJUSTMENTS);
    });

    it('跳转到最后一个索引', () => {
      const { pushHistory, goToHistoryIndex } = useEditorStore.getState();
      const adj1 = { ...INITIAL_ADJUSTMENTS, exposure: 1 };
      const adj2 = { ...INITIAL_ADJUSTMENTS, exposure: 2 };

      pushHistory(adj1);
      pushHistory(adj2);

      goToHistoryIndex(2);

      const state = useEditorStore.getState();
      expect(state.historyIndex).toBe(2);
      expect(state.adjustments).toEqual(adj2);
    });

    it('无效索引（负数）不改变状态', () => {
      const { pushHistory, goToHistoryIndex } = useEditorStore.getState();
      const adj1 = { ...INITIAL_ADJUSTMENTS, exposure: 1 };

      pushHistory(adj1);

      const stateBefore = useEditorStore.getState();
      goToHistoryIndex(-1);

      const stateAfter = useEditorStore.getState();
      expect(stateAfter.historyIndex).toBe(stateBefore.historyIndex);
      expect(stateAfter.adjustments).toEqual(stateBefore.adjustments);
    });

    it('无效索引（超范围）不改变状态', () => {
      const { pushHistory, goToHistoryIndex } = useEditorStore.getState();
      const adj1 = { ...INITIAL_ADJUSTMENTS, exposure: 1 };

      pushHistory(adj1);

      const stateBefore = useEditorStore.getState();
      goToHistoryIndex(5);

      const stateAfter = useEditorStore.getState();
      expect(stateAfter.historyIndex).toBe(stateBefore.historyIndex);
      expect(stateAfter.adjustments).toEqual(stateBefore.adjustments);
    });

    it('无效索引（等于 history.length）不改变状态', () => {
      const { pushHistory, goToHistoryIndex } = useEditorStore.getState();
      const adj1 = { ...INITIAL_ADJUSTMENTS, exposure: 1 };

      pushHistory(adj1);

      const stateBefore = useEditorStore.getState();
      goToHistoryIndex(stateBefore.history.length);

      const stateAfter = useEditorStore.getState();
      expect(stateAfter.historyIndex).toBe(stateBefore.historyIndex);
      expect(stateAfter.adjustments).toEqual(stateBefore.adjustments);
    });
  });
});
