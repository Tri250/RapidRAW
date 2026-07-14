import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAndroidBackHandler } from '../useAndroidBackHandler';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useUIStore } from '../../store/useUIStore';

describe('useAndroidBackHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useSettingsStore.setState({
      osPlatform: '',
    });

    useUIStore.setState(useUIStore.getInitialState());

    if ((window as any).__handleAndroidBack) {
      delete (window as any).__handleAndroidBack;
    }
  });

  afterEach(() => {
    if ((window as any).__handleAndroidBack) {
      delete (window as any).__handleAndroidBack;
    }
  });

  describe('hook 返回值结构', () => {
    it('hook 没有返回值（返回 undefined）', () => {
      useSettingsStore.setState({ osPlatform: 'android' });
      const { result } = renderHook(() => useAndroidBackHandler());
      expect(result.current).toBeUndefined();
    });
  });

  describe('Android 平台检测', () => {
    it('Android 平台时注册 __handleAndroidBack', () => {
      useSettingsStore.setState({ osPlatform: 'android' });
      renderHook(() => useAndroidBackHandler());
      expect((window as any).__handleAndroidBack).toBeDefined();
      expect(typeof (window as any).__handleAndroidBack).toBe('function');
    });

    it('非 Android 平台不注册 __handleAndroidBack', () => {
      useSettingsStore.setState({ osPlatform: 'windows' });
      renderHook(() => useAndroidBackHandler());
      expect((window as any).__handleAndroidBack).toBeUndefined();
    });

    it('macOS 平台不注册 __handleAndroidBack', () => {
      useSettingsStore.setState({ osPlatform: 'macos' });
      renderHook(() => useAndroidBackHandler());
      expect((window as any).__handleAndroidBack).toBeUndefined();
    });

    it('linux 平台不注册 __handleAndroidBack', () => {
      useSettingsStore.setState({ osPlatform: 'linux' });
      renderHook(() => useAndroidBackHandler());
      expect((window as any).__handleAndroidBack).toBeUndefined();
    });

    it('空字符串平台不注册 __handleAndroidBack', () => {
      useSettingsStore.setState({ osPlatform: '' });
      renderHook(() => useAndroidBackHandler());
      expect((window as any).__handleAndroidBack).toBeUndefined();
    });
  });

  describe('组件卸载时清理', () => {
    it('Android 平台下组件卸载时删除 __handleAndroidBack', () => {
      useSettingsStore.setState({ osPlatform: 'android' });
      const { unmount } = renderHook(() => useAndroidBackHandler());

      expect((window as any).__handleAndroidBack).toBeDefined();

      act(() => {
        unmount();
      });

      expect((window as any).__handleAndroidBack).toBeUndefined();
    });

    it('非 Android 平台下卸载组件不会出错', () => {
      useSettingsStore.setState({ osPlatform: 'windows' });
      const { unmount } = renderHook(() => useAndroidBackHandler());

      expect(() => {
        act(() => {
          unmount();
        });
      }).not.toThrow();
    });
  });

  describe('模态框关闭逻辑 - 优先级顺序', () => {
    beforeEach(() => {
      useSettingsStore.setState({ osPlatform: 'android' });
      renderHook(() => useAndroidBackHandler());
    });

    it('confirmModalState 打开时，按返回键关闭它', () => {
      useUIStore.setState({
        confirmModalState: { isOpen: true, title: 'Test' },
      });

      act(() => {
        (window as any).__handleAndroidBack();
      });

      expect(useUIStore.getState().confirmModalState.isOpen).toBe(false);
    });

    it('isCreateFolderModalOpen 打开时，按返回键关闭它', () => {
      useUIStore.setState({ isCreateFolderModalOpen: true });

      act(() => {
        (window as any).__handleAndroidBack();
      });

      expect(useUIStore.getState().isCreateFolderModalOpen).toBe(false);
    });

    it('isRenameFolderModalOpen 打开时，按返回键关闭它', () => {
      useUIStore.setState({ isRenameFolderModalOpen: true });

      act(() => {
        (window as any).__handleAndroidBack();
      });

      expect(useUIStore.getState().isRenameFolderModalOpen).toBe(false);
    });

    it('isRenameFileModalOpen 打开时，按返回键关闭它', () => {
      useUIStore.setState({ isRenameFileModalOpen: true });

      act(() => {
        (window as any).__handleAndroidBack();
      });

      expect(useUIStore.getState().isRenameFileModalOpen).toBe(false);
    });

    it('isImportModalOpen 打开时，按返回键关闭它', () => {
      useUIStore.setState({ isImportModalOpen: true });

      act(() => {
        (window as any).__handleAndroidBack();
      });

      expect(useUIStore.getState().isImportModalOpen).toBe(false);
    });

    it('isCopyPasteSettingsModalOpen 打开时，按返回键关闭它', () => {
      useUIStore.setState({ isCopyPasteSettingsModalOpen: true });

      act(() => {
        (window as any).__handleAndroidBack();
      });

      expect(useUIStore.getState().isCopyPasteSettingsModalOpen).toBe(false);
    });

    it('isCreateAlbumModalOpen 打开时，按返回键关闭它', () => {
      useUIStore.setState({ isCreateAlbumModalOpen: true });

      act(() => {
        (window as any).__handleAndroidBack();
      });

      expect(useUIStore.getState().isCreateAlbumModalOpen).toBe(false);
    });

    it('isCreateAlbumGroupModalOpen 打开时，按返回键关闭它', () => {
      useUIStore.setState({ isCreateAlbumGroupModalOpen: true });

      act(() => {
        (window as any).__handleAndroidBack();
      });

      expect(useUIStore.getState().isCreateAlbumGroupModalOpen).toBe(false);
    });

    it('isRenameAlbumModalOpen 打开时，按返回键关闭它', () => {
      useUIStore.setState({ isRenameAlbumModalOpen: true });

      act(() => {
        (window as any).__handleAndroidBack();
      });

      expect(useUIStore.getState().isRenameAlbumModalOpen).toBe(false);
    });

    it('panoramaModalState 打开时，按返回键关闭并重置它', () => {
      useUIStore.setState({
        panoramaModalState: {
          isOpen: true,
          isProcessing: true,
          progressMessage: 'test',
          finalImageBase64: 'test',
          error: 'test',
          stitchingSourcePaths: ['/test.jpg'],
        },
      });

      act(() => {
        (window as any).__handleAndroidBack();
      });

      const state = useUIStore.getState().panoramaModalState;
      expect(state.isOpen).toBe(false);
      expect(state.isProcessing).toBe(false);
      expect(state.progressMessage).toBe('');
      expect(state.finalImageBase64).toBeNull();
      expect(state.error).toBeNull();
      expect(state.stitchingSourcePaths).toEqual([]);
    });

    it('hdrModalState 打开时，按返回键关闭并重置它', () => {
      useUIStore.setState({
        hdrModalState: {
          isOpen: true,
          isProcessing: true,
          progressMessage: 'test',
          finalImageBase64: 'test',
          error: 'test',
          stitchingSourcePaths: ['/test.jpg'],
        },
      });

      act(() => {
        (window as any).__handleAndroidBack();
      });

      const state = useUIStore.getState().hdrModalState;
      expect(state.isOpen).toBe(false);
      expect(state.isProcessing).toBe(false);
      expect(state.progressMessage).toBe('');
      expect(state.finalImageBase64).toBeNull();
      expect(state.error).toBeNull();
      expect(state.stitchingSourcePaths).toEqual([]);
    });

    it('negativeModalState 打开时，按返回键关闭它', () => {
      useUIStore.setState({
        negativeModalState: { isOpen: true, targetPaths: ['/test.jpg'] },
      });

      act(() => {
        (window as any).__handleAndroidBack();
      });

      expect(useUIStore.getState().negativeModalState.isOpen).toBe(false);
    });

    it('denoiseModalState 打开时，按返回键关闭它', () => {
      useUIStore.setState({
        denoiseModalState: {
          isOpen: true,
          isProcessing: false,
          previewBase64: null,
          error: null,
          targetPaths: [],
          progressMessage: null,
          isRaw: false,
        },
      });

      act(() => {
        (window as any).__handleAndroidBack();
      });

      expect(useUIStore.getState().denoiseModalState.isOpen).toBe(false);
    });

    it('cullingModalState 打开时，按返回键关闭并重置它', () => {
      useUIStore.setState({
        cullingModalState: {
          isOpen: true,
          progress: { current: 1, total: 10, stage: 'test' },
          suggestions: null,
          error: 'test',
          pathsToCull: ['/test.jpg'],
        },
      });

      act(() => {
        (window as any).__handleAndroidBack();
      });

      const state = useUIStore.getState().cullingModalState;
      expect(state.isOpen).toBe(false);
      expect(state.progress).toBeNull();
      expect(state.suggestions).toBeNull();
      expect(state.error).toBeNull();
      expect(state.pathsToCull).toEqual([]);
    });

    it('collageModalState 打开时，按返回键关闭并重置它', () => {
      useUIStore.setState({
        collageModalState: {
          isOpen: true,
          sourceImages: [{ path: '/test.jpg' } as any],
        },
      });

      act(() => {
        (window as any).__handleAndroidBack();
      });

      const state = useUIStore.getState().collageModalState;
      expect(state.isOpen).toBe(false);
      expect(state.sourceImages).toEqual([]);
    });

    it('isConfigurePresetModalOpen 打开时，按返回键关闭它', () => {
      useUIStore.setState({ isConfigurePresetModalOpen: true });

      act(() => {
        (window as any).__handleAndroidBack();
      });

      expect(useUIStore.getState().isConfigurePresetModalOpen).toBe(false);
    });

    it('isLensCorrectionModalOpen 打开时，按返回键关闭它', () => {
      useUIStore.setState({ isLensCorrectionModalOpen: true });

      act(() => {
        (window as any).__handleAndroidBack();
      });

      expect(useUIStore.getState().isLensCorrectionModalOpen).toBe(false);
    });

    it('isTransformModalOpen 打开时，按返回键关闭它', () => {
      useUIStore.setState({ isTransformModalOpen: true });

      act(() => {
        (window as any).__handleAndroidBack();
      });

      expect(useUIStore.getState().isTransformModalOpen).toBe(false);
    });

    it('isLibraryExportPanelVisible 打开时，按返回键关闭它', () => {
      useUIStore.setState({ isLibraryExportPanelVisible: true });

      act(() => {
        (window as any).__handleAndroidBack();
      });

      expect(useUIStore.getState().isLibraryExportPanelVisible).toBe(false);
    });
  });

  describe('优先级顺序 - 高优先级模态框先关闭', () => {
    beforeEach(() => {
      useSettingsStore.setState({ osPlatform: 'android' });
      renderHook(() => useAndroidBackHandler());
    });

    it('confirmModalState 优先于 isCreateFolderModalOpen', () => {
      useUIStore.setState({
        confirmModalState: { isOpen: true },
        isCreateFolderModalOpen: true,
      });

      act(() => {
        (window as any).__handleAndroidBack();
      });

      expect(useUIStore.getState().confirmModalState.isOpen).toBe(false);
      expect(useUIStore.getState().isCreateFolderModalOpen).toBe(true);
    });

    it('isCreateFolderModalOpen 优先于 isRenameFolderModalOpen', () => {
      useUIStore.setState({
        isCreateFolderModalOpen: true,
        isRenameFolderModalOpen: true,
      });

      act(() => {
        (window as any).__handleAndroidBack();
      });

      expect(useUIStore.getState().isCreateFolderModalOpen).toBe(false);
      expect(useUIStore.getState().isRenameFolderModalOpen).toBe(true);
    });

    it('isRenameFolderModalOpen 优先于 isRenameFileModalOpen', () => {
      useUIStore.setState({
        isRenameFolderModalOpen: true,
        isRenameFileModalOpen: true,
      });

      act(() => {
        (window as any).__handleAndroidBack();
      });

      expect(useUIStore.getState().isRenameFolderModalOpen).toBe(false);
      expect(useUIStore.getState().isRenameFileModalOpen).toBe(true);
    });

    it('panoramaModalState 优先于 hdrModalState', () => {
      useUIStore.setState({
        panoramaModalState: {
          isOpen: true,
          isProcessing: false,
          progressMessage: '',
          finalImageBase64: null,
          error: null,
          stitchingSourcePaths: [],
        },
        hdrModalState: {
          isOpen: true,
          isProcessing: false,
          progressMessage: '',
          finalImageBase64: null,
          error: null,
          stitchingSourcePaths: [],
        },
      });

      act(() => {
        (window as any).__handleAndroidBack();
      });

      expect(useUIStore.getState().panoramaModalState.isOpen).toBe(false);
      expect(useUIStore.getState().hdrModalState.isOpen).toBe(true);
    });

    it('多次按返回键依次关闭各层级模态框', () => {
      useUIStore.setState({
        confirmModalState: { isOpen: true },
        isCreateFolderModalOpen: true,
        isRenameFolderModalOpen: true,
      });

      act(() => {
        (window as any).__handleAndroidBack();
      });
      expect(useUIStore.getState().confirmModalState.isOpen).toBe(false);
      expect(useUIStore.getState().isCreateFolderModalOpen).toBe(true);
      expect(useUIStore.getState().isRenameFolderModalOpen).toBe(true);

      act(() => {
        (window as any).__handleAndroidBack();
      });
      expect(useUIStore.getState().confirmModalState.isOpen).toBe(false);
      expect(useUIStore.getState().isCreateFolderModalOpen).toBe(false);
      expect(useUIStore.getState().isRenameFolderModalOpen).toBe(true);

      act(() => {
        (window as any).__handleAndroidBack();
      });
      expect(useUIStore.getState().confirmModalState.isOpen).toBe(false);
      expect(useUIStore.getState().isCreateFolderModalOpen).toBe(false);
      expect(useUIStore.getState().isRenameFolderModalOpen).toBe(false);
    });
  });

  describe('无模态框时派发 Escape 键事件', () => {
    beforeEach(() => {
      useSettingsStore.setState({ osPlatform: 'android' });
      renderHook(() => useAndroidBackHandler());
    });

    it('没有模态框打开时，派发 Escape 键盘事件', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

      act(() => {
        (window as any).__handleAndroidBack();
      });

      expect(dispatchSpy).toHaveBeenCalledTimes(1);
      const dispatchedEvent = dispatchSpy.mock.calls[0][0] as KeyboardEvent;
      expect(dispatchedEvent).toBeInstanceOf(KeyboardEvent);
      expect(dispatchedEvent.key).toBe('Escape');
      expect(dispatchedEvent.code).toBe('Escape');
      expect(dispatchedEvent.bubbles).toBe(true);
      expect(dispatchedEvent.cancelable).toBe(true);

      dispatchSpy.mockRestore();
    });

    it('模态框打开时不派发 Escape 事件', () => {
      useUIStore.setState({ isCreateFolderModalOpen: true });
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

      act(() => {
        (window as any).__handleAndroidBack();
      });

      expect(dispatchSpy).not.toHaveBeenCalled();

      dispatchSpy.mockRestore();
    });
  });

  describe('多次调用 hook', () => {
    it('多次渲染 hook，__handleAndroidBack 仍然存在', () => {
      useSettingsStore.setState({ osPlatform: 'android' });
      const { rerender } = renderHook(() => useAndroidBackHandler());

      expect((window as any).__handleAndroidBack).toBeDefined();
      const firstHandler = (window as any).__handleAndroidBack;

      act(() => {
        rerender();
      });

      expect((window as any).__handleAndroidBack).toBeDefined();
    });

    it('多个组件实例使用 hook，卸载第一个会删除全局函数', () => {
      useSettingsStore.setState({ osPlatform: 'android' });

      const { unmount: unmount1 } = renderHook(() => useAndroidBackHandler());
      renderHook(() => useAndroidBackHandler());

      expect((window as any).__handleAndroidBack).toBeDefined();

      act(() => {
        unmount1();
      });

      // 由于 hook 使用同一个全局变量，卸载任何一个都会删除它
      // 因为 effect 依赖数组为空，第二个 hook 不会重新设置
      expect((window as any).__handleAndroidBack).toBeUndefined();
    });
  });

  describe('confirmModalState 的函数式更新', () => {
    it('关闭 confirmModalState 时保留其他属性', () => {
      useSettingsStore.setState({ osPlatform: 'android' });
      renderHook(() => useAndroidBackHandler());

      useUIStore.setState({
        confirmModalState: {
          isOpen: true,
          title: 'Test Title',
          message: 'Test Message',
          confirmText: 'OK',
          confirmVariant: 'primary',
        },
      });

      act(() => {
        (window as any).__handleAndroidBack();
      });

      const state = useUIStore.getState().confirmModalState;
      expect(state.isOpen).toBe(false);
      expect(state.title).toBe('Test Title');
      expect(state.message).toBe('Test Message');
      expect(state.confirmText).toBe('OK');
      expect(state.confirmVariant).toBe('primary');
    });
  });

  describe('negativeModalState 的函数式更新', () => {
    it('关闭 negativeModalState 时保留 targetPaths', () => {
      useSettingsStore.setState({ osPlatform: 'android' });
      renderHook(() => useAndroidBackHandler());

      useUIStore.setState({
        negativeModalState: {
          isOpen: true,
          targetPaths: ['/path1.jpg', '/path2.jpg'],
        },
      });

      act(() => {
        (window as any).__handleAndroidBack();
      });

      const state = useUIStore.getState().negativeModalState;
      expect(state.isOpen).toBe(false);
      expect(state.targetPaths).toEqual(['/path1.jpg', '/path2.jpg']);
    });
  });

  describe('denoiseModalState 的函数式更新', () => {
    it('关闭 denoiseModalState 时保留其他属性', () => {
      useSettingsStore.setState({ osPlatform: 'android' });
      renderHook(() => useAndroidBackHandler());

      useUIStore.setState({
        denoiseModalState: {
          isOpen: true,
          isProcessing: true,
          previewBase64: 'preview',
          originalBase64: 'original',
          error: 'error',
          targetPaths: ['/test.jpg'],
          progressMessage: 'progress',
          isRaw: true,
        },
      });

      act(() => {
        (window as any).__handleAndroidBack();
      });

      const state = useUIStore.getState().denoiseModalState;
      expect(state.isOpen).toBe(false);
      expect(state.isProcessing).toBe(true);
      expect(state.previewBase64).toBe('preview');
      expect(state.originalBase64).toBe('original');
      expect(state.error).toBe('error');
      expect(state.targetPaths).toEqual(['/test.jpg']);
      expect(state.progressMessage).toBe('progress');
      expect(state.isRaw).toBe(true);
    });
  });
});
