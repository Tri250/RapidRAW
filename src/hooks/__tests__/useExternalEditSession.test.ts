import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useExternalEditSession } from '../useExternalEditSession';
import { useProcessStore } from '../../store/useProcessStore';
import { useEditorStore } from '../../store/useEditorStore';
import { Status } from '../../components/ui/ExportImportProperties';
import { Invokes } from '../../components/ui/AppProperties';
import { INITIAL_ADJUSTMENTS } from '../../utils/adjustments';

const mockInvoke = vi.hoisted(() => vi.fn());
const mockExit = vi.hoisted(() => vi.fn());
const mockDebouncedSaveFlush = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: any[]) => mockInvoke(...args),
}));

vi.mock('@tauri-apps/plugin-process', () => ({
  exit: (...args: any[]) => mockExit(...args),
}));

vi.mock('../useEditorActions', () => ({
  debouncedSave: {
    flush: () => mockDebouncedSaveFlush(),
  },
}));

const mockSelectedImage = {
  path: '/test/source.jpg',
  width: 1920,
  height: 1080,
  isRaw: false,
  isReady: true,
  originalUrl: null,
  thumbnailUrl: 'thumb.jpg',
  exif: {},
};

const mockExternalEditSession = {
  source: '/test/source.jpg',
  output: '/test/output.jpg',
  format: 'jpeg',
  jpegQuality: 90,
};

describe('useExternalEditSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(undefined);
    mockExit.mockReset();
    mockDebouncedSaveFlush.mockReset();

    useProcessStore.setState({
      initialFileToOpen: null,
      externalEditSession: null,
      exportState: {
        errorMessage: '',
        progress: { current: 0, total: 0 },
        status: Status.Idle,
      },
    });

    useEditorStore.setState({
      selectedImage: null,
      adjustments: JSON.parse(JSON.stringify(INITIAL_ADJUSTMENTS)),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('返回值结构', () => {
    it('返回预期的属性', () => {
      const handleImageSelect = vi.fn();
      const { result } = renderHook(() => useExternalEditSession(handleImageSelect));

      expect(result.current).toHaveProperty('externalEditSession');
      expect(result.current).toHaveProperty('isFinishing');
      expect(result.current).toHaveProperty('finishExternalEdit');
    });

    it('返回值类型正确', () => {
      const handleImageSelect = vi.fn();
      const { result } = renderHook(() => useExternalEditSession(handleImageSelect));

      expect(typeof result.current.finishExternalEdit).toBe('function');
      expect(typeof result.current.isFinishing).toBe('boolean');
    });

    it('初始状态正确', () => {
      const handleImageSelect = vi.fn();
      const { result } = renderHook(() => useExternalEditSession(handleImageSelect));

      expect(result.current.externalEditSession).toBeNull();
      expect(result.current.isFinishing).toBe(false);
    });
  });

  describe('initialFileToOpen - 初始文件打开', () => {
    it('设置 initialFileToOpen 后调用 handleImageSelect', () => {
      const handleImageSelect = vi.fn();
      renderHook(() => useExternalEditSession(handleImageSelect));

      act(() => {
        useProcessStore.getState().setProcess({ initialFileToOpen: '/test/initial.jpg' });
      });

      expect(handleImageSelect).toHaveBeenCalledWith('/test/initial.jpg');
    });

    it('打开初始文件后清除 initialFileToOpen', () => {
      const handleImageSelect = vi.fn();
      renderHook(() => useExternalEditSession(handleImageSelect));

      act(() => {
        useProcessStore.getState().setProcess({ initialFileToOpen: '/test/initial.jpg' });
      });

      expect(useProcessStore.getState().initialFileToOpen).toBeNull();
    });

    it('initialFileToOpen 为 null 时不调用 handleImageSelect', () => {
      const handleImageSelect = vi.fn();
      renderHook(() => useExternalEditSession(handleImageSelect));

      expect(handleImageSelect).not.toHaveBeenCalled();
    });
  });

  describe('externalEditSession - 外部编辑会话', () => {
    it('设置 externalEditSession 后调用 handleImageSelect', () => {
      const handleImageSelect = vi.fn();
      renderHook(() => useExternalEditSession(handleImageSelect));

      act(() => {
        useProcessStore.getState().setProcess({ externalEditSession: mockExternalEditSession });
      });

      expect(handleImageSelect).toHaveBeenCalledWith('/test/source.jpg');
    });

    it('设置 externalEditSession 后 isFinishing 重置为 false', () => {
      const handleImageSelect = vi.fn();
      const { result } = renderHook(() => useExternalEditSession(handleImageSelect));

      act(() => {
        useProcessStore.getState().setProcess({ externalEditSession: mockExternalEditSession });
      });

      expect(result.current.isFinishing).toBe(false);
    });

    it('hook 返回正确的 externalEditSession', () => {
      const handleImageSelect = vi.fn();
      const { result } = renderHook(() => useExternalEditSession(handleImageSelect));

      act(() => {
        useProcessStore.getState().setProcess({ externalEditSession: mockExternalEditSession });
      });

      expect(result.current.externalEditSession).toEqual(mockExternalEditSession);
    });

    it('externalEditSession 为 null 时不调用 handleImageSelect', () => {
      const handleImageSelect = vi.fn();
      renderHook(() => useExternalEditSession(handleImageSelect));

      expect(handleImageSelect).not.toHaveBeenCalled();
    });
  });

  describe('finishExternalEdit - 完成外部编辑', () => {
    beforeEach(() => {
      useEditorStore.setState({
        selectedImage: mockSelectedImage,
        adjustments: JSON.parse(JSON.stringify(INITIAL_ADJUSTMENTS)),
      });
      useProcessStore.setState({
        externalEditSession: mockExternalEditSession,
      });
    });

    it('调用 debouncedSave.flush', async () => {
      const handleImageSelect = vi.fn();
      const { result } = renderHook(() => useExternalEditSession(handleImageSelect));

      await act(async () => {
        await result.current.finishExternalEdit();
      });

      expect(mockDebouncedSaveFlush).toHaveBeenCalled();
    });

    it('设置 isFinishing 为 true', async () => {
      const handleImageSelect = vi.fn();
      const { result } = renderHook(() => useExternalEditSession(handleImageSelect));

      await act(async () => {
        await result.current.finishExternalEdit();
      });

      expect(result.current.isFinishing).toBe(true);
    });

    it('设置导出状态为 Exporting', async () => {
      const handleImageSelect = vi.fn();
      const { result } = renderHook(() => useExternalEditSession(handleImageSelect));

      await act(async () => {
        await result.current.finishExternalEdit();
      });

      const state = useProcessStore.getState();
      expect(state.exportState.status).toBe(Status.Exporting);
      expect(state.exportState.progress).toEqual({ current: 0, total: 1 });
    });

    it('调用 invoke 导出图片', async () => {
      const handleImageSelect = vi.fn();
      const { result } = renderHook(() => useExternalEditSession(handleImageSelect));

      await act(async () => {
        await result.current.finishExternalEdit();
      });

      expect(mockInvoke).toHaveBeenCalledWith(
        Invokes.ExportImages,
        expect.objectContaining({
          paths: ['/test/source.jpg'],
          outputFolderOrFile: '/test/output.jpg',
          isExplicitFilePath: true,
          baseOriginFolders: [],
          outputFormat: 'jpeg',
          currentEditPath: '/test/source.jpg',
        }),
      );
    });

    it('导出设置包含正确的 jpegQuality', async () => {
      const handleImageSelect = vi.fn();
      const { result } = renderHook(() => useExternalEditSession(handleImageSelect));

      await act(async () => {
        await result.current.finishExternalEdit();
      });

      expect(mockInvoke).toHaveBeenCalledWith(
        Invokes.ExportImages,
        expect.objectContaining({
          exportSettings: expect.objectContaining({
            jpegQuality: 90,
            keepMetadata: true,
            preserveTimestamps: false,
            preserveFolders: false,
            stripGps: false,
            exportMasks: false,
          }),
        }),
      );
    });

    it('没有 externalEditSession 时不执行导出', async () => {
      useProcessStore.setState({ externalEditSession: null });
      const handleImageSelect = vi.fn();
      const { result } = renderHook(() => useExternalEditSession(handleImageSelect));

      await act(async () => {
        await result.current.finishExternalEdit();
      });

      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('没有选中图片时不执行导出', async () => {
      useEditorStore.setState({ selectedImage: null });
      const handleImageSelect = vi.fn();
      const { result } = renderHook(() => useExternalEditSession(handleImageSelect));

      await act(async () => {
        await result.current.finishExternalEdit();
      });

      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('导出失败时设置错误状态', async () => {
      mockInvoke.mockRejectedValue(new Error('Export failed'));
      const handleImageSelect = vi.fn();
      const { result } = renderHook(() => useExternalEditSession(handleImageSelect));

      await act(async () => {
        await result.current.finishExternalEdit();
      });

      await waitFor(() => {
        const state = useProcessStore.getState();
        expect(state.exportState.status).toBe(Status.Error);
        expect(state.exportState.errorMessage).toBe('Export failed');
      });
    });

    it('导出失败时 isFinishing 重置为 false', async () => {
      mockInvoke.mockRejectedValue(new Error('Export failed'));
      const handleImageSelect = vi.fn();
      const { result } = renderHook(() => useExternalEditSession(handleImageSelect));

      await act(async () => {
        await result.current.finishExternalEdit();
      });

      await waitFor(() => {
        expect(result.current.isFinishing).toBe(false);
      });
    });

    it('错误为字符串时直接使用错误消息', async () => {
      mockInvoke.mockRejectedValue('String error message');
      const handleImageSelect = vi.fn();
      const { result } = renderHook(() => useExternalEditSession(handleImageSelect));

      await act(async () => {
        await result.current.finishExternalEdit();
      });

      await waitFor(() => {
        const state = useProcessStore.getState();
        expect(state.exportState.errorMessage).toBe('String error message');
      });
    });
  });

  describe('导出状态监听', () => {
    beforeEach(() => {
      useEditorStore.setState({
        selectedImage: mockSelectedImage,
      });
      useProcessStore.setState({
        externalEditSession: mockExternalEditSession,
      });
    });

    it('导出成功且 isFinishing 为 true 时调用 exit(0)', async () => {
      const handleImageSelect = vi.fn();
      const { result } = renderHook(() => useExternalEditSession(handleImageSelect));

      await act(async () => {
        await result.current.finishExternalEdit();
      });

      act(() => {
        useProcessStore.getState().setExportState({ status: Status.Success });
      });

      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('导出成功但 isFinishing 为 false 时不调用 exit', () => {
      const handleImageSelect = vi.fn();
      renderHook(() => useExternalEditSession(handleImageSelect));

      act(() => {
        useProcessStore.getState().setExportState({ status: Status.Success });
      });

      expect(mockExit).not.toHaveBeenCalled();
    });

    it('导出错误且 isFinishing 为 true 时重置 isFinishing', async () => {
      const handleImageSelect = vi.fn();
      const { result } = renderHook(() => useExternalEditSession(handleImageSelect));

      await act(async () => {
        await result.current.finishExternalEdit();
      });

      act(() => {
        useProcessStore.getState().setExportState({
          status: Status.Error,
          errorMessage: 'test error',
        });
      });

      expect(result.current.isFinishing).toBe(false);
    });

    it('导出取消且 isFinishing 为 true 时重置 isFinishing', async () => {
      const handleImageSelect = vi.fn();
      const { result } = renderHook(() => useExternalEditSession(handleImageSelect));

      await act(async () => {
        await result.current.finishExternalEdit();
      });

      act(() => {
        useProcessStore.getState().setExportState({ status: Status.Cancelled });
      });

      expect(result.current.isFinishing).toBe(false);
    });

    it('导出中时不调用 exit 也不重置 isFinishing', async () => {
      const handleImageSelect = vi.fn();
      const { result } = renderHook(() => useExternalEditSession(handleImageSelect));

      await act(async () => {
        await result.current.finishExternalEdit();
      });

      act(() => {
        useProcessStore.getState().setExportState({
          status: Status.Exporting,
          progress: { current: 5, total: 10 },
        });
      });

      expect(mockExit).not.toHaveBeenCalled();
      expect(result.current.isFinishing).toBe(true);
    });

    it('isFinishing 为 false 时不响应导出状态变化', () => {
      const handleImageSelect = vi.fn();
      const { result } = renderHook(() => useExternalEditSession(handleImageSelect));

      act(() => {
        useProcessStore.getState().setExportState({ status: Status.Success });
      });

      expect(mockExit).not.toHaveBeenCalled();
      expect(result.current.isFinishing).toBe(false);
    });
  });

  describe('handleImageSelect ref 更新', () => {
    it('handleImageSelect 变化时更新 ref', () => {
      const handleImageSelect1 = vi.fn();
      const handleImageSelect2 = vi.fn();

      const { rerender } = renderHook(({ callback }) => useExternalEditSession(callback), {
        initialProps: { callback: handleImageSelect1 },
      });

      rerender({ callback: handleImageSelect2 });

      act(() => {
        useProcessStore.getState().setProcess({ initialFileToOpen: '/test.jpg' });
      });

      expect(handleImageSelect2).toHaveBeenCalledWith('/test.jpg');
      expect(handleImageSelect1).not.toHaveBeenCalled();
    });
  });

  describe('多会话场景', () => {
    it('切换会话时重置 isFinishing', async () => {
      useEditorStore.setState({
        selectedImage: mockSelectedImage,
        adjustments: JSON.parse(JSON.stringify(INITIAL_ADJUSTMENTS)),
      });

      const handleImageSelect = vi.fn();
      const { result } = renderHook(() => useExternalEditSession(handleImageSelect));

      act(() => {
        useProcessStore.getState().setProcess({ externalEditSession: mockExternalEditSession });
      });

      await act(async () => {
        await result.current.finishExternalEdit();
      });

      await waitFor(() => {
        expect(result.current.isFinishing).toBe(true);
      });

      const newSession = {
        source: '/test/source2.jpg',
        output: '/test/output2.jpg',
        format: 'png',
        jpegQuality: 80,
      };

      act(() => {
        useProcessStore.getState().setProcess({ externalEditSession: newSession });
      });

      expect(result.current.isFinishing).toBe(false);
      expect(result.current.externalEditSession).toEqual(newSession);
    });

    it('新会话会调用 handleImageSelect 加载新图片', () => {
      const handleImageSelect = vi.fn();
      renderHook(() => useExternalEditSession(handleImageSelect));

      act(() => {
        useProcessStore.getState().setProcess({ externalEditSession: mockExternalEditSession });
      });

      expect(handleImageSelect).toHaveBeenCalledTimes(1);
      expect(handleImageSelect).toHaveBeenCalledWith('/test/source.jpg');

      const newSession = {
        source: '/test/source2.jpg',
        output: '/test/output2.jpg',
        format: 'png',
        jpegQuality: 80,
      };

      act(() => {
        useProcessStore.getState().setProcess({ externalEditSession: newSession });
      });

      expect(handleImageSelect).toHaveBeenCalledTimes(2);
      expect(handleImageSelect).toHaveBeenLastCalledWith('/test/source2.jpg');
    });
  });
});
