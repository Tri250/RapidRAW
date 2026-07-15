import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWaveformControls } from '../useWaveformControls';
import { useEditorStore } from '../../store/useEditorStore';
import { useSettingsStore } from '../../store/useSettingsStore';

vi.mock('../../store/useEditorStore', () => ({
  useEditorStore: vi.fn(),
}));

vi.mock('../../store/useSettingsStore', () => ({
  useSettingsStore: vi.fn(),
}));

const mockSetEditor = vi.fn();
const mockHandleSettingsChange = vi.fn();

const mockEditorState = {
  isWaveformVisible: false,
  activeWaveformChannel: 'luma',
  waveformHeight: 220,
  setEditor: mockSetEditor,
};

const mockSettingsState = {
  appSettings: {
    theme: 'dark',
    lastRootPath: null,
    isWaveformVisible: false,
    waveformHeight: 220,
    activeWaveformChannel: 'luma',
  },
  handleSettingsChange: mockHandleSettingsChange,
};

describe('useWaveformControls', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockSetEditor.mockImplementation((updater) => {
      const newState = typeof updater === 'function' ? updater(mockEditorState) : updater;
      Object.assign(mockEditorState, newState);
    });

    (useEditorStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: any) => {
      if (selector) return selector(mockEditorState);
      return mockEditorState;
    });

    (useEditorStore as any).getState = () => mockEditorState;

    mockHandleSettingsChange.mockResolvedValue(undefined);

    (useSettingsStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: any) => {
      if (selector) return selector(mockSettingsState);
      return mockSettingsState;
    });

    (useSettingsStore as any).getState = () => mockSettingsState;
  });

  afterEach(() => {
    mockEditorState.isWaveformVisible = false;
    mockEditorState.activeWaveformChannel = 'luma';
    mockEditorState.waveformHeight = 220;
    mockSettingsState.appSettings.isWaveformVisible = false;
    mockSettingsState.appSettings.waveformHeight = 220;
    mockSettingsState.appSettings.activeWaveformChannel = 'luma';
  });

  describe('返回值结构', () => {
    it('返回所有预期的状态字段和函数', () => {
      const { result } = renderHook(() => useWaveformControls());

      const keys = Object.keys(result.current);
      const expectedKeys = [
        'isResizingWaveform',
        'onToggleWaveform',
        'setActiveWaveformChannel',
        'setWaveformHeight',
        'handleWaveformResize',
      ];

      expect(keys).toEqual(expect.arrayContaining(expectedKeys));
      expect(keys.length).toBe(expectedKeys.length);
    });

    it('所有函数都是函数类型', () => {
      const { result } = renderHook(() => useWaveformControls());

      expect(typeof result.current.onToggleWaveform).toBe('function');
      expect(typeof result.current.setActiveWaveformChannel).toBe('function');
      expect(typeof result.current.setWaveformHeight).toBe('function');
      expect(typeof result.current.handleWaveformResize).toBe('function');
    });

    it('isResizingWaveform 是布尔类型', () => {
      const { result } = renderHook(() => useWaveformControls());
      expect(typeof result.current.isResizingWaveform).toBe('boolean');
    });
  });

  describe('初始状态', () => {
    it('isResizingWaveform 初始为 false', () => {
      const { result } = renderHook(() => useWaveformControls());
      expect(result.current.isResizingWaveform).toBe(false);
    });
  });

  describe('onToggleWaveform', () => {
    it('切换波形可见性从 false 到 true', () => {
      mockEditorState.isWaveformVisible = false;
      mockSettingsState.appSettings.isWaveformVisible = false;

      const { result } = renderHook(() => useWaveformControls());

      act(() => {
        result.current.onToggleWaveform();
      });

      expect(mockSetEditor).toHaveBeenCalledWith({ isWaveformVisible: true });
      expect(mockHandleSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ isWaveformVisible: true }));
    });

    it('切换波形可见性从 true 到 false', () => {
      mockEditorState.isWaveformVisible = true;
      mockSettingsState.appSettings.isWaveformVisible = true;

      const { result } = renderHook(() => useWaveformControls());

      act(() => {
        result.current.onToggleWaveform();
      });

      expect(mockSetEditor).toHaveBeenCalledWith({ isWaveformVisible: false });
      expect(mockHandleSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ isWaveformVisible: false }));
    });

    it('多次切换波形可见性', () => {
      mockEditorState.isWaveformVisible = false;
      mockSettingsState.appSettings.isWaveformVisible = false;

      const { result } = renderHook(() => useWaveformControls());

      act(() => {
        result.current.onToggleWaveform();
      });
      expect(mockSetEditor).toHaveBeenLastCalledWith({ isWaveformVisible: true });

      mockEditorState.isWaveformVisible = true;
      mockSettingsState.appSettings.isWaveformVisible = true;

      act(() => {
        result.current.onToggleWaveform();
      });
      expect(mockSetEditor).toHaveBeenLastCalledWith({ isWaveformVisible: false });
    });

    it('当 appSettings 为 null 时不调用 handleSettingsChange', () => {
      mockSettingsState.appSettings = null as any;
      mockEditorState.isWaveformVisible = false;

      const { result } = renderHook(() => useWaveformControls());

      act(() => {
        result.current.onToggleWaveform();
      });

      expect(mockSetEditor).toHaveBeenCalledWith({ isWaveformVisible: true });
      expect(mockHandleSettingsChange).not.toHaveBeenCalled();

      mockSettingsState.appSettings = {
        theme: 'dark',
        lastRootPath: null,
      };
    });
  });

  describe('setActiveWaveformChannel', () => {
    it('设置活动波形通道为 red', () => {
      const { result } = renderHook(() => useWaveformControls());

      act(() => {
        result.current.setActiveWaveformChannel('red');
      });

      expect(mockSetEditor).toHaveBeenCalledWith({ activeWaveformChannel: 'red' });
      expect(mockHandleSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ activeWaveformChannel: 'red' }));
    });

    it('设置活动波形通道为 green', () => {
      const { result } = renderHook(() => useWaveformControls());

      act(() => {
        result.current.setActiveWaveformChannel('green');
      });

      expect(mockSetEditor).toHaveBeenCalledWith({ activeWaveformChannel: 'green' });
      expect(mockHandleSettingsChange).toHaveBeenCalledWith(
        expect.objectContaining({ activeWaveformChannel: 'green' }),
      );
    });

    it('设置活动波形通道为 blue', () => {
      const { result } = renderHook(() => useWaveformControls());

      act(() => {
        result.current.setActiveWaveformChannel('blue');
      });

      expect(mockSetEditor).toHaveBeenCalledWith({ activeWaveformChannel: 'blue' });
    });

    it('设置活动波形通道为 luma', () => {
      const { result } = renderHook(() => useWaveformControls());

      act(() => {
        result.current.setActiveWaveformChannel('luma');
      });

      expect(mockSetEditor).toHaveBeenCalledWith({ activeWaveformChannel: 'luma' });
    });

    it('当 appSettings 为 null 时不调用 handleSettingsChange', () => {
      mockSettingsState.appSettings = null as any;

      const { result } = renderHook(() => useWaveformControls());

      act(() => {
        result.current.setActiveWaveformChannel('red');
      });

      expect(mockSetEditor).toHaveBeenCalledWith({ activeWaveformChannel: 'red' });
      expect(mockHandleSettingsChange).not.toHaveBeenCalled();

      mockSettingsState.appSettings = {
        theme: 'dark',
        lastRootPath: null,
      };
    });
  });

  describe('setWaveformHeight', () => {
    it('设置波形高度为指定值', () => {
      const { result } = renderHook(() => useWaveformControls());

      act(() => {
        result.current.setWaveformHeight(300);
      });

      expect(mockSetEditor).toHaveBeenCalledWith({ waveformHeight: 300 });
    });

    it('设置波形高度为最小值 150', () => {
      const { result } = renderHook(() => useWaveformControls());

      act(() => {
        result.current.setWaveformHeight(150);
      });

      expect(mockSetEditor).toHaveBeenCalledWith({ waveformHeight: 150 });
    });

    it('设置波形高度为最大值 450', () => {
      const { result } = renderHook(() => useWaveformControls());

      act(() => {
        result.current.setWaveformHeight(450);
      });

      expect(mockSetEditor).toHaveBeenCalledWith({ waveformHeight: 450 });
    });

    it('设置波形高度为默认值 220', () => {
      const { result } = renderHook(() => useWaveformControls());

      act(() => {
        result.current.setWaveformHeight(220);
      });

      expect(mockSetEditor).toHaveBeenCalledWith({ waveformHeight: 220 });
    });

    it('多次设置不同的波形高度', () => {
      const { result } = renderHook(() => useWaveformControls());

      act(() => {
        result.current.setWaveformHeight(200);
      });
      expect(mockSetEditor).toHaveBeenLastCalledWith({ waveformHeight: 200 });

      act(() => {
        result.current.setWaveformHeight(300);
      });
      expect(mockSetEditor).toHaveBeenLastCalledWith({ waveformHeight: 300 });

      act(() => {
        result.current.setWaveformHeight(250);
      });
      expect(mockSetEditor).toHaveBeenLastCalledWith({ waveformHeight: 250 });
    });
  });

  describe('handleWaveformResize', () => {
    let mockSetPointerCapture: ReturnType<typeof vi.fn>;
    let mockHasPointerCapture: ReturnType<typeof vi.fn>;
    let mockReleasePointerCapture: ReturnType<typeof vi.fn>;
    let mockDiv: HTMLDivElement;

    beforeEach(() => {
      mockSetPointerCapture = vi.fn();
      mockHasPointerCapture = vi.fn().mockReturnValue(true);
      mockReleasePointerCapture = vi.fn();

      mockDiv = document.createElement('div');
      mockDiv.setPointerCapture = mockSetPointerCapture;
      mockDiv.hasPointerCapture = mockHasPointerCapture;
      mockDiv.releasePointerCapture = mockReleasePointerCapture;

      document.documentElement.style.touchAction = '';
      document.documentElement.style.userSelect = '';
    });

    const createPointerEvent = (clientY: number, pointerId = 1, button = 0, pointerType = 'mouse') => {
      const event = new PointerEvent('pointerdown', {
        clientY,
        pointerId,
        button,
        pointerType,
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, 'currentTarget', { value: mockDiv, writable: false });
      return event as unknown as React.PointerEvent<HTMLDivElement>;
    };

    it('鼠标右键点击不触发调整大小', () => {
      const { result } = renderHook(() => useWaveformControls());

      const event = createPointerEvent(100, 1, 2, 'mouse');

      act(() => {
        result.current.handleWaveformResize(event);
      });

      expect(result.current.isResizingWaveform).toBe(false);
      expect(mockSetPointerCapture).not.toHaveBeenCalled();
    });

    it('鼠标左键开始调整大小', () => {
      mockEditorState.waveformHeight = 220;

      const { result } = renderHook(() => useWaveformControls());

      const event = createPointerEvent(100, 1, 0, 'mouse');

      act(() => {
        result.current.handleWaveformResize(event);
      });

      expect(result.current.isResizingWaveform).toBe(true);
      expect(mockSetPointerCapture).toHaveBeenCalledWith(1);
      expect(document.documentElement.style.touchAction).toBe('none');
      expect(document.documentElement.style.userSelect).toBe('none');
    });

    it('触摸输入开始调整大小', () => {
      mockEditorState.waveformHeight = 220;

      const { result } = renderHook(() => useWaveformControls());

      const event = createPointerEvent(100, 2, 0, 'touch');

      act(() => {
        result.current.handleWaveformResize(event);
      });

      expect(result.current.isResizingWaveform).toBe(true);
    });

    it('指针移动时更新波形高度', () => {
      mockEditorState.waveformHeight = 220;

      const { result } = renderHook(() => useWaveformControls());

      const downEvent = createPointerEvent(100, 1, 0, 'mouse');

      act(() => {
        result.current.handleWaveformResize(downEvent);
      });

      act(() => {
        const moveEvent = new PointerEvent('pointermove', {
          clientY: 150,
          pointerId: 1,
          bubbles: true,
          cancelable: true,
        });
        document.dispatchEvent(moveEvent);
      });

      expect(mockSetEditor).toHaveBeenCalledWith({ waveformHeight: 270 });
    });

    it('向上拖动减小波形高度', () => {
      mockEditorState.waveformHeight = 220;

      const { result } = renderHook(() => useWaveformControls());

      const downEvent = createPointerEvent(200, 1, 0, 'mouse');

      act(() => {
        result.current.handleWaveformResize(downEvent);
      });

      act(() => {
        const moveEvent = new PointerEvent('pointermove', {
          clientY: 150,
          pointerId: 1,
          bubbles: true,
          cancelable: true,
        });
        document.dispatchEvent(moveEvent);
      });

      expect(mockSetEditor).toHaveBeenCalledWith({ waveformHeight: 170 });
    });

    it('波形高度不低于最小值 150', () => {
      mockEditorState.waveformHeight = 220;

      const { result } = renderHook(() => useWaveformControls());

      const downEvent = createPointerEvent(200, 1, 0, 'mouse');

      act(() => {
        result.current.handleWaveformResize(downEvent);
      });

      act(() => {
        const moveEvent = new PointerEvent('pointermove', {
          clientY: 0,
          pointerId: 1,
          bubbles: true,
          cancelable: true,
        });
        document.dispatchEvent(moveEvent);
      });

      expect(mockSetEditor).toHaveBeenCalledWith({ waveformHeight: 150 });
    });

    it('波形高度不超过最大值 450', () => {
      mockEditorState.waveformHeight = 220;

      const { result } = renderHook(() => useWaveformControls());

      const downEvent = createPointerEvent(100, 1, 0, 'mouse');

      act(() => {
        result.current.handleWaveformResize(downEvent);
      });

      act(() => {
        const moveEvent = new PointerEvent('pointermove', {
          clientY: 1000,
          pointerId: 1,
          bubbles: true,
          cancelable: true,
        });
        document.dispatchEvent(moveEvent);
      });

      expect(mockSetEditor).toHaveBeenCalledWith({ waveformHeight: 450 });
    });

    it('不同 pointerId 的移动事件不影响高度', () => {
      mockEditorState.waveformHeight = 220;

      const { result } = renderHook(() => useWaveformControls());

      const downEvent = createPointerEvent(100, 1, 0, 'mouse');

      act(() => {
        result.current.handleWaveformResize(downEvent);
      });

      const callCountBefore = mockSetEditor.mock.calls.length;

      act(() => {
        const moveEvent = new PointerEvent('pointermove', {
          clientY: 200,
          pointerId: 99,
          bubbles: true,
          cancelable: true,
        });
        document.dispatchEvent(moveEvent);
      });

      expect(mockSetEditor.mock.calls.length).toBe(callCountBefore);
    });

    it('指针释放后结束调整大小', () => {
      mockEditorState.waveformHeight = 220;

      const { result } = renderHook(() => useWaveformControls());

      const downEvent = createPointerEvent(100, 1, 0, 'mouse');

      act(() => {
        result.current.handleWaveformResize(downEvent);
      });

      expect(result.current.isResizingWaveform).toBe(true);

      act(() => {
        const upEvent = new PointerEvent('pointerup', {
          clientY: 150,
          pointerId: 1,
          bubbles: true,
          cancelable: true,
        });
        document.dispatchEvent(upEvent);
      });

      expect(result.current.isResizingWaveform).toBe(false);
      expect(mockReleasePointerCapture).toHaveBeenCalledWith(1);
      expect(mockHandleSettingsChange).toHaveBeenCalled();
    });

    it('不同 pointerId 的释放事件不结束调整', () => {
      mockEditorState.waveformHeight = 220;

      const { result } = renderHook(() => useWaveformControls());

      const downEvent = createPointerEvent(100, 1, 0, 'mouse');

      act(() => {
        result.current.handleWaveformResize(downEvent);
      });

      expect(result.current.isResizingWaveform).toBe(true);

      act(() => {
        const upEvent = new PointerEvent('pointerup', {
          clientY: 150,
          pointerId: 99,
          bubbles: true,
          cancelable: true,
        });
        document.dispatchEvent(upEvent);
      });

      expect(result.current.isResizingWaveform).toBe(true);
    });

    it('指针取消事件也能结束调整大小', () => {
      mockEditorState.waveformHeight = 220;

      const { result } = renderHook(() => useWaveformControls());

      const downEvent = createPointerEvent(100, 1, 0, 'mouse');

      act(() => {
        result.current.handleWaveformResize(downEvent);
      });

      expect(result.current.isResizingWaveform).toBe(true);

      act(() => {
        const cancelEvent = new PointerEvent('pointercancel', {
          clientY: 150,
          pointerId: 1,
          bubbles: true,
          cancelable: true,
        });
        document.dispatchEvent(cancelEvent);
      });

      expect(result.current.isResizingWaveform).toBe(false);
    });

    it('调整大小后恢复 touchAction 和 userSelect 样式', () => {
      mockEditorState.waveformHeight = 220;

      const { result } = renderHook(() => useWaveformControls());

      document.documentElement.style.touchAction = 'auto';
      document.documentElement.style.userSelect = 'text';

      const downEvent = createPointerEvent(100, 1, 0, 'mouse');

      act(() => {
        result.current.handleWaveformResize(downEvent);
      });

      expect(document.documentElement.style.touchAction).toBe('none');
      expect(document.documentElement.style.userSelect).toBe('none');

      act(() => {
        const upEvent = new PointerEvent('pointerup', {
          clientY: 150,
          pointerId: 1,
          bubbles: true,
          cancelable: true,
        });
        document.dispatchEvent(upEvent);
      });

      expect(document.documentElement.style.touchAction).toBe('auto');
      expect(document.documentElement.style.userSelect).toBe('text');
    });

    it('当 waveformHeight 为 0 时使用默认值 256', () => {
      mockEditorState.waveformHeight = 0 as any;

      const { result } = renderHook(() => useWaveformControls());

      const downEvent = createPointerEvent(100, 1, 0, 'mouse');

      act(() => {
        result.current.handleWaveformResize(downEvent);
      });

      act(() => {
        const moveEvent = new PointerEvent('pointermove', {
          clientY: 110,
          pointerId: 1,
          bubbles: true,
          cancelable: true,
        });
        document.dispatchEvent(moveEvent);
      });

      expect(mockSetEditor).toHaveBeenCalledWith({ waveformHeight: 266 });
    });

    it('当 appSettings 为 null 时调整结束不保存设置', () => {
      mockEditorState.waveformHeight = 220;
      mockSettingsState.appSettings = null as any;

      const { result } = renderHook(() => useWaveformControls());

      const downEvent = createPointerEvent(100, 1, 0, 'mouse');

      act(() => {
        result.current.handleWaveformResize(downEvent);
      });

      act(() => {
        const upEvent = new PointerEvent('pointerup', {
          clientY: 150,
          pointerId: 1,
          bubbles: true,
          cancelable: true,
        });
        document.dispatchEvent(upEvent);
      });

      expect(result.current.isResizingWaveform).toBe(false);
      expect(mockHandleSettingsChange).not.toHaveBeenCalled();

      mockSettingsState.appSettings = {
        theme: 'dark',
        lastRootPath: null,
      };
    });

    it('hasPointerCapture 返回 false 时仍能正常结束', () => {
      mockEditorState.waveformHeight = 220;
      mockHasPointerCapture.mockReturnValue(false);

      const { result } = renderHook(() => useWaveformControls());

      const downEvent = createPointerEvent(100, 1, 0, 'mouse');

      act(() => {
        result.current.handleWaveformResize(downEvent);
      });

      expect(() => {
        act(() => {
          const upEvent = new PointerEvent('pointerup', {
            clientY: 150,
            pointerId: 1,
            bubbles: true,
            cancelable: true,
          });
          document.dispatchEvent(upEvent);
        });
      }).not.toThrow();

      expect(result.current.isResizingWaveform).toBe(false);
    });

    it('目标元素没有 setPointerCapture 方法时不报错', () => {
      mockEditorState.waveformHeight = 220;
      const divWithoutCapture = document.createElement('div');

      const { result } = renderHook(() => useWaveformControls());

      const event = new PointerEvent('pointerdown', {
        clientY: 100,
        pointerId: 1,
        button: 0,
        pointerType: 'mouse',
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, 'currentTarget', { value: divWithoutCapture, writable: false });

      expect(() => {
        act(() => {
          result.current.handleWaveformResize(event as unknown as React.PointerEvent<HTMLDivElement>);
        });
      }).not.toThrow();

      expect(result.current.isResizingWaveform).toBe(true);
    });
  });

  describe('函数引用稳定性', () => {
    it('onToggleWaveform 在重新渲染时保持引用稳定', () => {
      const { result, rerender } = renderHook(() => useWaveformControls());
      const firstRef = result.current.onToggleWaveform;
      rerender();
      expect(result.current.onToggleWaveform).toBe(firstRef);
    });

    it('setActiveWaveformChannel 在重新渲染时保持引用稳定', () => {
      const { result, rerender } = renderHook(() => useWaveformControls());
      const firstRef = result.current.setActiveWaveformChannel;
      rerender();
      expect(result.current.setActiveWaveformChannel).toBe(firstRef);
    });

    it('setWaveformHeight 在重新渲染时保持引用稳定', () => {
      const { result, rerender } = renderHook(() => useWaveformControls());
      const firstRef = result.current.setWaveformHeight;
      rerender();
      expect(result.current.setWaveformHeight).toBe(firstRef);
    });

    it('handleWaveformResize 在重新渲染时保持引用稳定', () => {
      const { result, rerender } = renderHook(() => useWaveformControls());
      const firstRef = result.current.handleWaveformResize;
      rerender();
      expect(result.current.handleWaveformResize).toBe(firstRef);
    });
  });

  describe('独立渲染隔离', () => {
    it('不同的 hook 实例状态独立', () => {
      const { result: result1 } = renderHook(() => useWaveformControls());
      const { result: result2 } = renderHook(() => useWaveformControls());

      expect(result1.current.isResizingWaveform).toBe(false);
      expect(result2.current.isResizingWaveform).toBe(false);
    });
  });
});
