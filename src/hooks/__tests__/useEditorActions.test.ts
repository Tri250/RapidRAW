import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useEditorActions, debouncedSetHistory, debouncedSave } from '../useEditorActions';
import { INITIAL_ADJUSTMENTS, Adjustments, PasteMode } from '../../utils/adjustments';
import { Invokes } from '../../components/ui/AppProperties';
import { useEditorStore } from '../../store/useEditorStore';
import { useLibraryStore } from '../../store/useLibraryStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useProcessStore } from '../../store/useProcessStore';

const mockInvoke = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: any[]) => mockInvoke(...args),
}));

vi.mock('lodash.debounce', () => ({
  default: (fn: any) => {
    const debounced: any = (...args: any[]) => fn(...args);
    debounced.cancel = () => {};
    debounced.flush = () => {};
    return debounced;
  },
}));

vi.mock('react-toastify', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('../../utils/ImageLRUCache', () => ({
  globalImageCache: {
    delete: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    has: vi.fn(),
  },
}));

const createMockAdjustments = (overrides: Partial<Adjustments> = {}): Adjustments => {
  return {
    ...JSON.parse(JSON.stringify(INITIAL_ADJUSTMENTS)),
    ...overrides,
  };
};

const mockSelectedImage = {
  path: '/test/image.jpg',
  width: 1920,
  height: 1080,
  isReady: true,
  name: 'image.jpg',
};

describe('useEditorActions', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(undefined);

    vi.clearAllMocks();

    useEditorStore.setState({
      selectedImage: mockSelectedImage,
      adjustments: createMockAdjustments(),
      history: [createMockAdjustments()],
      historyIndex: 0,
      previewOverride: null,
      copiedAdjustments: null,
      originalSize: { width: 1920, height: 1080 },
      baseRenderSize: { width: 800, height: 600 },
    });

    useLibraryStore.setState({
      multiSelectedPaths: [],
      libraryActivePath: null,
      libraryActiveAdjustments: createMockAdjustments(),
    });

    useSettingsStore.setState({
      appSettings: {
        copyPasteSettings: {
          mode: PasteMode.Merge,
          includedAdjustments: ['exposure', 'contrast'],
          knownAdjustments: ['exposure', 'contrast'],
        },
      } as any,
      osPlatform: 'linux',
    });

    useProcessStore.setState({
      isCopied: false,
      isPasted: false,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('返回值结构', () => {
    it('返回所有预期的函数', () => {
      const { result } = renderHook(() => useEditorActions());

      const keys = Object.keys(result.current);
      const expectedKeys = [
        'setAdjustments',
        'handleRotate',
        'handleAutoAdjustments',
        'handleLutSelect',
        'setLutPreviewOverride',
        'handleResetAdjustments',
        'handleCopyAdjustments',
        'handlePasteAdjustments',
        'handleZoomChange',
      ];

      expect(keys).toEqual(expect.arrayContaining(expectedKeys));
      expect(keys.length).toBe(expectedKeys.length);
    });

    it('所有返回值都是函数类型', () => {
      const { result } = renderHook(() => useEditorActions());

      expect(typeof result.current.setAdjustments).toBe('function');
      expect(typeof result.current.handleRotate).toBe('function');
      expect(typeof result.current.handleAutoAdjustments).toBe('function');
      expect(typeof result.current.handleLutSelect).toBe('function');
      expect(typeof result.current.setLutPreviewOverride).toBe('function');
      expect(typeof result.current.handleResetAdjustments).toBe('function');
      expect(typeof result.current.handleCopyAdjustments).toBe('function');
      expect(typeof result.current.handlePasteAdjustments).toBe('function');
      expect(typeof result.current.handleZoomChange).toBe('function');
    });
  });

  describe('setAdjustments - 应用调整', () => {
    it('使用对象参数更新调整值', () => {
      const { result } = renderHook(() => useEditorActions());

      act(() => {
        result.current.setAdjustments({ exposure: 0.5 });
      });

      const state = useEditorStore.getState();
      expect(state.adjustments.exposure).toBe(0.5);
    });

    it('使用函数参数更新调整值', () => {
      const { result } = renderHook(() => useEditorActions());

      act(() => {
        result.current.setAdjustments((prev) => ({
          ...prev,
          exposure: prev.exposure + 0.3,
        }));
      });

      const state = useEditorStore.getState();
      expect(state.adjustments.exposure).toBe(0.3);
    });

    it('合并部分调整到现有调整中', () => {
      useEditorStore.setState({
        adjustments: createMockAdjustments({ exposure: 0.5, contrast: 0.3 }),
      });

      const { result } = renderHook(() => useEditorActions());

      act(() => {
        result.current.setAdjustments({ brightness: 0.2 });
      });

      const state = useEditorStore.getState();
      expect(state.adjustments.exposure).toBe(0.5);
      expect(state.adjustments.contrast).toBe(0.3);
      expect(state.adjustments.brightness).toBe(0.2);
    });
  });

  describe('handleRotate - 旋转图片', () => {
    it('顺时针旋转 90 度', () => {
      useEditorStore.setState({
        selectedImage: mockSelectedImage,
        adjustments: createMockAdjustments({ orientationSteps: 0 }),
      });

      const { result } = renderHook(() => useEditorActions());

      act(() => {
        result.current.handleRotate(90);
      });

      const state = useEditorStore.getState();
      expect(state.adjustments.orientationSteps).toBe(1);
      expect(state.adjustments.rotation).toBe(0);
    });

    it('逆时针旋转 90 度', () => {
      useEditorStore.setState({
        selectedImage: mockSelectedImage,
        adjustments: createMockAdjustments({ orientationSteps: 0 }),
      });

      const { result } = renderHook(() => useEditorActions());

      act(() => {
        result.current.handleRotate(-90);
      });

      const state = useEditorStore.getState();
      expect(state.adjustments.orientationSteps).toBe(3);
      expect(state.adjustments.rotation).toBe(0);
    });

    it('旋转 360 度后回到初始状态', () => {
      useEditorStore.setState({
        selectedImage: mockSelectedImage,
        adjustments: createMockAdjustments({ orientationSteps: 0 }),
      });

      const { result } = renderHook(() => useEditorActions());

      act(() => {
        result.current.handleRotate(90);
        result.current.handleRotate(90);
        result.current.handleRotate(90);
        result.current.handleRotate(90);
      });

      const state = useEditorStore.getState();
      expect(state.adjustments.orientationSteps).toBe(0);
    });

    it('旋转时翻转 aspectRatio', () => {
      useEditorStore.setState({
        selectedImage: mockSelectedImage,
        adjustments: createMockAdjustments({
          orientationSteps: 0,
          aspectRatio: 16 / 9,
        }),
      });

      const { result } = renderHook(() => useEditorActions());

      act(() => {
        result.current.handleRotate(90);
      });

      const state = useEditorStore.getState();
      expect(state.adjustments.aspectRatio).toBeCloseTo(9 / 16);
    });

    it('没有选中图片时旋转不报错', () => {
      useEditorStore.setState({
        selectedImage: null,
        adjustments: createMockAdjustments({ orientationSteps: 0 }),
      });

      const { result } = renderHook(() => useEditorActions());

      expect(() => {
        act(() => {
          result.current.handleRotate(90);
        });
      }).not.toThrow();
    });
  });

  describe('handleAutoAdjustments - 自动调整', () => {
    it('成功应用自动调整', async () => {
      const autoAdjustments = {
        exposure: 0.5,
        contrast: 0.3,
        brightness: 0.2,
      };

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.CalculateAutoAdjustments) {
          return Promise.resolve(autoAdjustments);
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => useEditorActions());

      await act(async () => {
        await result.current.handleAutoAdjustments();
      });

      const state = useEditorStore.getState();
      expect(state.adjustments.exposure).toBe(0.5);
      expect(state.adjustments.contrast).toBe(0.3);
      expect(mockInvoke).toHaveBeenCalledWith(Invokes.CalculateAutoAdjustments);
    });

    it('选中图片未就绪时不调用后端', async () => {
      useEditorStore.setState({
        selectedImage: { ...mockSelectedImage, isReady: false },
      });

      const { result } = renderHook(() => useEditorActions());

      await act(async () => {
        await result.current.handleAutoAdjustments();
      });

      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('没有选中图片时不调用后端', async () => {
      useEditorStore.setState({ selectedImage: null });

      const { result } = renderHook(() => useEditorActions());

      await act(async () => {
        await result.current.handleAutoAdjustments();
      });

      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('自动调整失败时显示错误提示', async () => {
      const toast = await import('react-toastify');
      const toastErrorSpy = vi.spyOn(toast.toast, 'error');

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.CalculateAutoAdjustments) {
          return Promise.reject(new Error('Auto adjust failed'));
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => useEditorActions());

      await act(async () => {
        await result.current.handleAutoAdjustments();
      });

      expect(toastErrorSpy).toHaveBeenCalled();
      toastErrorSpy.mockRestore();
    });
  });

  describe('handleLutSelect - 选择 LUT', () => {
    it('成功加载 LUT 文件', async () => {
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'load_and_parse_lut') {
          return Promise.resolve({ size: 33 });
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => useEditorActions());

      await act(async () => {
        await result.current.handleLutSelect('/path/to/lut.cube');
      });

      const state = useEditorStore.getState();
      expect(state.adjustments.lutPath).toBe('/path/to/lut.cube');
      expect(state.adjustments.lutName).toBe('lut.cube');
      expect(state.adjustments.lutSize).toBe(33);
      expect(state.adjustments.lutIntensity).toBe(100);
      expect(state.adjustments.sectionVisibility.effects).toBe(true);
      expect(mockInvoke).toHaveBeenCalledWith('load_and_parse_lut', { path: '/path/to/lut.cube' });
    });

    it('LUT 加载失败时显示错误提示', async () => {
      const toast = await import('react-toastify');
      const toastErrorSpy = vi.spyOn(toast.toast, 'error');

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'load_and_parse_lut') {
          return Promise.reject(new Error('LUT load failed'));
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => useEditorActions());

      await act(async () => {
        await result.current.handleLutSelect('/bad/path.cube');
      });

      expect(toastErrorSpy).toHaveBeenCalled();
      toastErrorSpy.mockRestore();
    });

    it('Android 平台上处理 content:// URI', async () => {
      useSettingsStore.setState({
        osPlatform: 'android',
        appSettings: {
          copyPasteSettings: {
            mode: PasteMode.Merge,
            includedAdjustments: ['exposure'],
          },
        } as any,
      });

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'load_and_parse_lut') {
          return Promise.resolve({ size: 33 });
        }
        if (cmd === 'resolve_android_content_uri_name') {
          return Promise.resolve('My LUT.cube');
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => useEditorActions());

      await act(async () => {
        await result.current.handleLutSelect('content://com.example/lut.cube');
      });

      const state = useEditorStore.getState();
      expect(state.adjustments.lutName).toBe('My LUT.cube');
    });
  });

  describe('setLutPreviewOverride - 设置 LUT 预览覆盖', () => {
    it('设置 LUT 预览覆盖', () => {
      useEditorStore.setState({
        adjustments: createMockAdjustments({ lutIntensity: 80 }),
      });

      const { result } = renderHook(() => useEditorActions());

      act(() => {
        result.current.setLutPreviewOverride('/path/to/preview.cube');
      });

      const state = useEditorStore.getState();
      expect(state.previewOverride).not.toBeNull();
      expect(state.previewOverride?.lutPath).toBe('/path/to/preview.cube');
      expect(state.previewOverride?.lutName).toBe('preview.cube');
      expect(state.previewOverride?.lutIntensity).toBe(80);
    });

    it('传入 null 时清除预览覆盖', () => {
      useEditorStore.setState({
        previewOverride: createMockAdjustments({ lutPath: '/some.cube' }),
      });

      const { result } = renderHook(() => useEditorActions());

      act(() => {
        result.current.setLutPreviewOverride(null);
      });

      const state = useEditorStore.getState();
      expect(state.previewOverride).toBeNull();
    });
  });

  describe('handleResetAdjustments - 重置调整', () => {
    it('重置单张图片的调整', async () => {
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.ResetAdjustmentsForPaths) {
          return Promise.resolve();
        }
        return Promise.resolve();
      });

      useLibraryStore.setState({
        multiSelectedPaths: ['/test/image.jpg'],
      });

      const { result } = renderHook(() => useEditorActions());

      await act(async () => {
        result.current.handleResetAdjustments();
      });

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith(
          Invokes.ResetAdjustmentsForPaths,
          expect.objectContaining({ paths: ['/test/image.jpg'] }),
        );
      });
    });

    it('重置指定路径的调整', async () => {
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.ResetAdjustmentsForPaths) {
          return Promise.resolve();
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => useEditorActions());

      await act(async () => {
        result.current.handleResetAdjustments(['/custom/path.jpg']);
      });

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith(
          Invokes.ResetAdjustmentsForPaths,
          expect.objectContaining({ paths: ['/custom/path.jpg'] }),
        );
      });
    });

    it('没有选中路径时不执行重置', () => {
      useLibraryStore.setState({
        multiSelectedPaths: [],
      });

      const { result } = renderHook(() => useEditorActions());

      act(() => {
        result.current.handleResetAdjustments();
      });

      expect(mockInvoke).not.toHaveBeenCalledWith(Invokes.ResetAdjustmentsForPaths);
    });

    it('重置当前选中图片时重置历史记录', async () => {
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.ResetAdjustmentsForPaths) {
          return Promise.resolve();
        }
        return Promise.resolve();
      });

      useEditorStore.setState({
        selectedImage: mockSelectedImage,
        history: [createMockAdjustments(), createMockAdjustments({ exposure: 0.5 })],
        historyIndex: 1,
      });

      useLibraryStore.setState({
        multiSelectedPaths: ['/test/image.jpg'],
      });

      const { result } = renderHook(() => useEditorActions());

      await act(async () => {
        result.current.handleResetAdjustments();
      });

      await waitFor(() => {
        const state = useEditorStore.getState();
        expect(state.history.length).toBe(1);
        expect(state.historyIndex).toBe(0);
      });
    });

    it('重置失败时显示错误提示', async () => {
      const toast = await import('react-toastify');
      const toastErrorSpy = vi.spyOn(toast.toast, 'error');

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.ResetAdjustmentsForPaths) {
          return Promise.reject(new Error('Reset failed'));
        }
        return Promise.resolve();
      });

      useLibraryStore.setState({
        multiSelectedPaths: ['/test/image.jpg'],
      });

      const { result } = renderHook(() => useEditorActions());

      await act(async () => {
        result.current.handleResetAdjustments();
      });

      await waitFor(() => {
        expect(toastErrorSpy).toHaveBeenCalled();
      });

      toastErrorSpy.mockRestore();
    });
  });

  describe('handleCopyAdjustments - 复制调整', () => {
    it('从当前选中图片复制调整', async () => {
      useEditorStore.setState({
        selectedImage: mockSelectedImage,
        adjustments: createMockAdjustments({ exposure: 0.5, contrast: 0.3 }),
      });

      const { result } = renderHook(() => useEditorActions());

      await act(async () => {
        await result.current.handleCopyAdjustments();
      });

      const state = useEditorStore.getState();
      expect(state.copiedAdjustments).toBeDefined();
      expect(useProcessStore.getState().isCopied).toBe(true);
    });

    it('从指定路径复制调整', async () => {
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.LoadMetadata) {
          return Promise.resolve({
            adjustments: {
              exposure: 0.8,
              contrast: 0.6,
              is_null: false,
            },
          });
        }
        return Promise.resolve();
      });

      useEditorStore.setState({
        selectedImage: null,
      });

      useLibraryStore.setState({
        libraryActivePath: '/other/image.jpg',
      });

      const { result } = renderHook(() => useEditorActions());

      await act(async () => {
        await result.current.handleCopyAdjustments('/other/image.jpg');
      });

      expect(mockInvoke).toHaveBeenCalledWith(Invokes.LoadMetadata, {
        path: '/other/image.jpg',
      });

      const state = useEditorStore.getState();
      expect(state.copiedAdjustments).toBeDefined();
    });

    it('没有可复制的源时不复制', async () => {
      useEditorStore.setState({
        selectedImage: null,
      });

      useLibraryStore.setState({
        libraryActivePath: null,
        multiSelectedPaths: [],
      });

      const { result } = renderHook(() => useEditorActions());

      await act(async () => {
        await result.current.handleCopyAdjustments();
      });

      const state = useEditorStore.getState();
      expect(state.copiedAdjustments).toBeNull();
    });

    it('加载元数据失败时显示错误提示', async () => {
      const toast = await import('react-toastify');
      const toastErrorSpy = vi.spyOn(toast.toast, 'error');

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.LoadMetadata) {
          return Promise.reject(new Error('Load failed'));
        }
        return Promise.resolve();
      });

      useEditorStore.setState({
        selectedImage: null,
      });

      useLibraryStore.setState({
        libraryActivePath: '/bad/path.jpg',
      });

      const { result } = renderHook(() => useEditorActions());

      await act(async () => {
        await result.current.handleCopyAdjustments();
      });

      expect(toastErrorSpy).toHaveBeenCalled();
      toastErrorSpy.mockRestore();
    });
  });

  describe('handlePasteAdjustments - 粘贴调整', () => {
    beforeEach(() => {
      useEditorStore.setState({
        selectedImage: mockSelectedImage,
        adjustments: createMockAdjustments(),
        copiedAdjustments: createMockAdjustments({ exposure: 0.5, contrast: 0.3, brightness: 0.2 }),
      });
    });

    it('粘贴调整到当前图片', async () => {
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.ApplyAdjustmentsToPaths) {
          return Promise.resolve();
        }
        if (cmd === Invokes.LoadMetadata) {
          return Promise.resolve({
            adjustments: { lensMaker: null, lensModel: null, lensDistortionParams: null },
          });
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => useEditorActions());

      await act(async () => {
        result.current.handlePasteAdjustments();
      });

      expect(useProcessStore.getState().isPasted).toBe(true);
    });

    it('粘贴调整到指定路径', async () => {
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.ApplyAdjustmentsToPaths) {
          return Promise.resolve();
        }
        return Promise.resolve();
      });

      useEditorStore.setState({
        selectedImage: null,
        copiedAdjustments: createMockAdjustments({ exposure: 0.5 }),
      });

      useLibraryStore.setState({
        multiSelectedPaths: ['/path1.jpg', '/path2.jpg'],
      });

      const { result } = renderHook(() => useEditorActions());

      await act(async () => {
        result.current.handlePasteAdjustments(['/custom.jpg']);
      });

      expect(mockInvoke).toHaveBeenCalledWith(
        Invokes.ApplyAdjustmentsToPaths,
        expect.objectContaining({ paths: ['/custom.jpg'] }),
      );
    });

    it('没有复制的调整时不粘贴', () => {
      useEditorStore.setState({
        copiedAdjustments: null,
      });

      const { result } = renderHook(() => useEditorActions());

      act(() => {
        result.current.handlePasteAdjustments();
      });

      expect(mockInvoke).not.toHaveBeenCalledWith(Invokes.ApplyAdjustmentsToPaths);
    });

    it('没有设置时不粘贴', () => {
      useSettingsStore.setState({
        appSettings: null,
      });

      const { result } = renderHook(() => useEditorActions());

      act(() => {
        result.current.handlePasteAdjustments();
      });

      expect(mockInvoke).not.toHaveBeenCalledWith(Invokes.ApplyAdjustmentsToPaths);
    });

    it('Merge 模式只粘贴非默认值', async () => {
      useSettingsStore.setState({
        appSettings: {
          copyPasteSettings: {
            mode: PasteMode.Merge,
            includedAdjustments: ['exposure', 'contrast', 'brightness'],
          },
        } as any,
      });

      useEditorStore.setState({
        selectedImage: mockSelectedImage,
        adjustments: createMockAdjustments(),
        copiedAdjustments: createMockAdjustments({
          exposure: 0.5,
          contrast: 0,
          brightness: 0.2,
        }),
      });

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.LoadMetadata) {
          return Promise.resolve({
            adjustments: { lensMaker: null, lensModel: null, lensDistortionParams: null },
          });
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => useEditorActions());

      await act(async () => {
        result.current.handlePasteAdjustments();
      });

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith(
          Invokes.ApplyAdjustmentsToPaths,
          expect.objectContaining({
            adjustments: expect.objectContaining({
              exposure: 0.5,
              brightness: 0.2,
            }),
          }),
        );
      });
    });

    it('Replace 模式粘贴所有包含的调整', async () => {
      useSettingsStore.setState({
        appSettings: {
          copyPasteSettings: {
            mode: PasteMode.Replace,
            includedAdjustments: ['exposure', 'contrast', 'brightness'],
          },
        } as any,
      });

      useEditorStore.setState({
        selectedImage: mockSelectedImage,
        adjustments: createMockAdjustments(),
        copiedAdjustments: createMockAdjustments({
          exposure: 0.5,
          contrast: 0,
          brightness: 0.2,
        }),
      });

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.LoadMetadata) {
          return Promise.resolve({
            adjustments: { lensMaker: null, lensModel: null, lensDistortionParams: null },
          });
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => useEditorActions());

      await act(async () => {
        result.current.handlePasteAdjustments();
      });

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith(
          Invokes.ApplyAdjustmentsToPaths,
          expect.objectContaining({
            adjustments: expect.objectContaining({
              exposure: 0.5,
              contrast: 0,
              brightness: 0.2,
            }),
          }),
        );
      });
    });

    it('粘贴失败时显示错误提示', async () => {
      const toast = await import('react-toastify');
      const toastErrorSpy = vi.spyOn(toast.toast, 'error');

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.ApplyAdjustmentsToPaths) {
          return Promise.reject(new Error('Paste failed'));
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => useEditorActions());

      await act(async () => {
        result.current.handlePasteAdjustments();
      });

      await waitFor(() => {
        expect(toastErrorSpy).toHaveBeenCalled();
      });

      toastErrorSpy.mockRestore();
    });
  });

  describe('handleZoomChange - 缩放变化', () => {
    beforeEach(() => {
      useEditorStore.setState({
        originalSize: { width: 1920, height: 1080 },
        baseRenderSize: { width: 800, height: 600 },
        adjustments: createMockAdjustments({ orientationSteps: 0 }),
      });
    });

    it('设置指定的缩放值', () => {
      const { result } = renderHook(() => useEditorActions());

      act(() => {
        result.current.handleZoomChange(1.5);
      });

      const state = useEditorStore.getState();
      expect(state.zoom).toBeGreaterThan(0);
    });

    it('fitToWindow 模式下计算合适的缩放', () => {
      const { result } = renderHook(() => useEditorActions());

      act(() => {
        result.current.handleZoomChange(1, true);
      });

      const state = useEditorStore.getState();
      expect(state.zoom).toBe(1);
    });

    it('缩放值有最小限制', () => {
      const { result } = renderHook(() => useEditorActions());

      act(() => {
        result.current.handleZoomChange(0.01);
      });

      const state = useEditorStore.getState();
      expect(state.zoom).toBeGreaterThan(0);
    });

    it('缩放值有最大限制', () => {
      const { result } = renderHook(() => useEditorActions());

      act(() => {
        result.current.handleZoomChange(10);
      });

      const state = useEditorStore.getState();
      const maxTransformZoom = (2.0 * 1920) / 800;
      expect(state.zoom).toBeLessThanOrEqual(maxTransformZoom);
    });

    it('旋转 90 度时正确计算缩放', () => {
      useEditorStore.setState({
        originalSize: { width: 1920, height: 1080 },
        baseRenderSize: { width: 800, height: 600 },
        adjustments: createMockAdjustments({ orientationSteps: 1 }),
      });

      const { result } = renderHook(() => useEditorActions());

      act(() => {
        result.current.handleZoomChange(1, true);
      });

      const state = useEditorStore.getState();
      expect(state.zoom).toBeGreaterThan(0);
    });
  });

  describe('debouncedSetHistory - 防抖历史记录', () => {
    it('是一个函数', () => {
      expect(typeof debouncedSetHistory).toBe('function');
    });

    it('调用后更新历史记录', () => {
      const newAdj = createMockAdjustments({ exposure: 0.5 });
      const initialHistoryLength = useEditorStore.getState().history.length;

      act(() => {
        debouncedSetHistory(newAdj);
      });

      const state = useEditorStore.getState();
      expect(state.history.length).toBe(initialHistoryLength + 1);
      expect(state.history[state.historyIndex].exposure).toBe(0.5);
    });
  });

  describe('debouncedSave - 防抖保存', () => {
    it('是一个函数', () => {
      expect(typeof debouncedSave).toBe('function');
    });

    it('调用后触发保存', async () => {
      const newAdj = createMockAdjustments({ exposure: 0.5 });

      await act(async () => {
        debouncedSave('/test/image.jpg', newAdj);
      });

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith(
          Invokes.SaveMetadataAndUpdateThumbnail,
          expect.objectContaining({ path: '/test/image.jpg' }),
        );
      });
    });

    it('保存失败时记录错误并显示提示', async () => {
      const toast = await import('react-toastify');
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const toastErrorSpy = vi.spyOn(toast.toast, 'error');

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.SaveMetadataAndUpdateThumbnail) {
          return Promise.reject(new Error('Save failed'));
        }
        return Promise.resolve();
      });

      const newAdj = createMockAdjustments({ exposure: 0.5 });

      await act(async () => {
        debouncedSave('/test/image.jpg', newAdj);
      });

      await waitFor(() => {
        expect(toastErrorSpy).toHaveBeenCalled();
      });

      consoleErrorSpy.mockRestore();
      toastErrorSpy.mockRestore();
    });
  });
});
