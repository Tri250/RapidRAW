import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { fireEvent } from '@testing-library/dom';
import { useKeyboardShortcuts } from '../useKeyboardShortcuts';
import { ImageFile, Panel, ExifOverlay } from '../../components/ui/AppProperties';
import { useEditorStore } from '../../store/useEditorStore';
import { useLibraryStore } from '../../store/useLibraryStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useUIStore } from '../../store/useUIStore';
import { useProcessStore } from '../../store/useProcessStore';
import { useEditorActions } from '../useEditorActions';
import { useLibraryActions } from '../useLibraryActions';
import { normalizeCombo } from '../../utils/keyboardUtils';

vi.mock('../useEditorActions');
vi.mock('../useLibraryActions');

const mockUseEditorActions = vi.mocked(useEditorActions);
const mockUseLibraryActions = vi.mocked(useLibraryActions);

const createMockImageFile = (path: string, index: number = 0): ImageFile =>
  ({
    path,
    name: `image-${index}.jpg`,
    width: 1920,
    height: 1080,
    isReady: true,
    size: 1000000,
    modified: Date.now(),
    created: Date.now(),
    tags: [],
  }) as ImageFile;

const mockImages: ImageFile[] = [
  createMockImageFile('/test/img1.jpg', 0),
  createMockImageFile('/test/img2.jpg', 1),
  createMockImageFile('/test/img3.jpg', 2),
];

const defaultProps = {
  sortedImageList: mockImages,
  handleBackToLibrary: vi.fn(),
  handleDeleteSelected: vi.fn(),
  handleImageSelect: vi.fn(),
  handlePasteFiles: vi.fn(),
  handleToggleFullScreen: vi.fn(),
  handleZoomChange: vi.fn(),
};

describe('useKeyboardShortcuts', () => {
  const mockHandleRotate = vi.fn();
  const mockHandleCopyAdjustments = vi.fn();
  const mockHandlePasteAdjustments = vi.fn();
  const mockHandleRate = vi.fn();
  const mockHandleSetColorLabel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    mockUseEditorActions.mockReturnValue({
      handleRotate: mockHandleRotate,
      handleCopyAdjustments: mockHandleCopyAdjustments,
      handlePasteAdjustments: mockHandlePasteAdjustments,
    } as any);

    mockUseLibraryActions.mockReturnValue({
      handleRate: mockHandleRate,
      handleSetColorLabel: mockHandleSetColorLabel,
    } as any);

    useEditorStore.setState({
      selectedImage: null,
      adjustments: { masks: [], aiPatches: [] } as any,
      history: [{ masks: [], aiPatches: [] } as any],
      historyIndex: 0,
      showOriginal: false,
      isWaveformVisible: false,
      originalSize: { width: 1920, height: 1080 },
      displaySize: { width: 800, height: 600 },
      baseRenderSize: { width: 800, height: 600 },
      isStraightenActive: false,
      activeMaskContainerId: null,
      activeMaskId: null,
      activeAiPatchContainerId: null,
      activeAiSubMaskId: null,
      brushSettings: null,
      undo: vi.fn(),
      redo: vi.fn(),
      setEditor: vi.fn((updater) => {
        const state = useEditorStore.getState();
        const newState = typeof updater === 'function' ? updater(state) : updater;
        useEditorStore.setState(newState);
      }),
    });

    useLibraryStore.setState({
      multiSelectedPaths: [],
      libraryActivePath: '/test/img1.jpg',
      setLibrary: vi.fn((updater) => {
        const state = useLibraryStore.getState();
        const newState = typeof updater === 'function' ? updater(state) : updater;
        useLibraryStore.setState(newState);
      }),
    });

    useSettingsStore.setState({
      appSettings: {
        keybinds: {},
        exifOverlay: ExifOverlay.Off,
      } as any,
      osPlatform: 'linux',
      handleSettingsChange: vi.fn(),
    });

    useUIStore.setState({
      isCreateFolderModalOpen: false,
      isRenameFolderModalOpen: false,
      isRenameFileModalOpen: false,
      isImportModalOpen: false,
      isCopyPasteSettingsModalOpen: false,
      confirmModalState: { isOpen: false },
      panoramaModalState: { isOpen: false },
      cullingModalState: { isOpen: false },
      collageModalState: { isOpen: false },
      denoiseModalState: { isOpen: false },
      negativeModalState: { isOpen: false },
      isFullScreen: false,
      activeRightPanel: null,
      customEscapeHandler: null,
      setRightPanel: vi.fn(),
    });

    useProcessStore.setState({
      copiedFilePaths: [],
      setProcess: vi.fn((updater) => {
        const state = useProcessStore.getState();
        const newState = typeof updater === 'function' ? updater(state) : updater;
        useProcessStore.setState(newState);
      }),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('事件监听器注册与清理', () => {
    it('应该在挂载时注册 keydown 事件监听器', () => {
      const addSpy = vi.spyOn(window, 'addEventListener');
      renderHook(() => useKeyboardShortcuts(defaultProps));
      expect(addSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
      addSpy.mockRestore();
    });

    it('应该在卸载时移除 keydown 事件监听器', () => {
      const removeSpy = vi.spyOn(window, 'removeEventListener');
      const { unmount } = renderHook(() => useKeyboardShortcuts(defaultProps));
      unmount();
      expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
      removeSpy.mockRestore();
    });
  });

  describe('Modal 打开时快捷键不触发', () => {
    it('当有 modal 打开时不应触发快捷键', () => {
      useUIStore.setState({ confirmModalState: { isOpen: true } });
      renderHook(() => useKeyboardShortcuts(defaultProps));
      fireEvent.keyDown(window, { code: 'KeyF', ctrlKey: false });
      expect(defaultProps.handleToggleFullScreen).not.toHaveBeenCalled();
    });

    it.each([
      ['isCreateFolderModalOpen', { isCreateFolderModalOpen: true }],
      ['isRenameFolderModalOpen', { isRenameFolderModalOpen: true }],
      ['isRenameFileModalOpen', { isRenameFileModalOpen: true }],
      ['isImportModalOpen', { isImportModalOpen: true }],
      ['isCopyPasteSettingsModalOpen', { isCopyPasteSettingsModalOpen: true }],
      ['panoramaModalState', { panoramaModalState: { isOpen: true } }],
      ['cullingModalState', { cullingModalState: { isOpen: true } }],
      ['collageModalState', { collageModalState: { isOpen: true } }],
      ['denoiseModalState', { denoiseModalState: { isOpen: true } }],
      ['negativeModalState', { negativeModalState: { isOpen: true } }],
    ])('当 %s 打开时不应触发快捷键', (_name, stateUpdate) => {
      useUIStore.setState(stateUpdate);
      renderHook(() => useKeyboardShortcuts(defaultProps));
      fireEvent.keyDown(window, { code: 'KeyF' });
      expect(defaultProps.handleToggleFullScreen).not.toHaveBeenCalled();
    });
  });

  describe('输入框聚焦时快捷键不触发', () => {
    it('当 INPUT 元素聚焦时不应触发快捷键', () => {
      renderHook(() => useKeyboardShortcuts(defaultProps));
      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();
      fireEvent.keyDown(input, { code: 'KeyF' });
      expect(defaultProps.handleToggleFullScreen).not.toHaveBeenCalled();
      document.body.removeChild(input);
    });

    it('当 TEXTAREA 元素聚焦时不应触发快捷键', () => {
      renderHook(() => useKeyboardShortcuts(defaultProps));
      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);
      textarea.focus();
      fireEvent.keyDown(textarea, { code: 'KeyF' });
      expect(defaultProps.handleToggleFullScreen).not.toHaveBeenCalled();
      document.body.removeChild(textarea);
    });
  });

  describe('内置快捷键 (builtinShortcuts)', () => {
    describe('Escape 键', () => {
      it('当 isStraightenActive 为 true 时，Escape 应关闭 straighten', () => {
        const setEditorSpy = vi.fn();
        useEditorStore.setState({
          selectedImage: { path: '/test/img1.jpg' } as any,
          isStraightenActive: true,
          setEditor: setEditorSpy,
        });
        renderHook(() => useKeyboardShortcuts(defaultProps));
        fireEvent.keyDown(window, { code: 'Escape' });
        expect(setEditorSpy).toHaveBeenCalledWith({ isStraightenActive: false });
      });

      it('当有 customEscapeHandler 时，应调用 customEscapeHandler', () => {
        const customHandler = vi.fn();
        useUIStore.setState({ customEscapeHandler: customHandler });
        renderHook(() => useKeyboardShortcuts(defaultProps));
        fireEvent.keyDown(window, { code: 'Escape' });
        expect(customHandler).toHaveBeenCalled();
      });

      it('当 activeAiSubMaskId 存在时，应清除它', () => {
        const setEditorSpy = vi.fn();
        useEditorStore.setState({
          selectedImage: { path: '/test/img1.jpg' } as any,
          activeAiSubMaskId: 'sub-mask-1',
          setEditor: setEditorSpy,
        });
        renderHook(() => useKeyboardShortcuts(defaultProps));
        fireEvent.keyDown(window, { code: 'Escape' });
        expect(setEditorSpy).toHaveBeenCalledWith({ activeAiSubMaskId: null });
      });

      it('当 activeAiPatchContainerId 存在时，应清除它', () => {
        const setEditorSpy = vi.fn();
        useEditorStore.setState({
          selectedImage: { path: '/test/img1.jpg' } as any,
          activeAiPatchContainerId: 'patch-1',
          setEditor: setEditorSpy,
        });
        renderHook(() => useKeyboardShortcuts(defaultProps));
        fireEvent.keyDown(window, { code: 'Escape' });
        expect(setEditorSpy).toHaveBeenCalledWith({ activeAiPatchContainerId: null });
      });

      it('当 activeMaskId 存在时，应清除它', () => {
        const setEditorSpy = vi.fn();
        useEditorStore.setState({
          selectedImage: { path: '/test/img1.jpg' } as any,
          activeMaskId: 'mask-1',
          setEditor: setEditorSpy,
        });
        renderHook(() => useKeyboardShortcuts(defaultProps));
        fireEvent.keyDown(window, { code: 'Escape' });
        expect(setEditorSpy).toHaveBeenCalledWith({ activeMaskId: null });
      });

      it('当 activeMaskContainerId 存在时，应清除它', () => {
        const setEditorSpy = vi.fn();
        useEditorStore.setState({
          selectedImage: { path: '/test/img1.jpg' } as any,
          activeMaskContainerId: 'container-1',
          setEditor: setEditorSpy,
        });
        renderHook(() => useKeyboardShortcuts(defaultProps));
        fireEvent.keyDown(window, { code: 'Escape' });
        expect(setEditorSpy).toHaveBeenCalledWith({ activeMaskContainerId: null });
      });

      it('当活动面板是 Crop 时，应切换到 Adjustments', () => {
        const setRightPanelSpy = vi.fn();
        useUIStore.setState({ activeRightPanel: Panel.Crop, setRightPanel: setRightPanelSpy });
        useEditorStore.setState({ selectedImage: { path: '/test/img1.jpg' } as any });
        renderHook(() => useKeyboardShortcuts(defaultProps));
        fireEvent.keyDown(window, { code: 'Escape' });
        expect(setRightPanelSpy).toHaveBeenCalledWith(Panel.Adjustments);
      });

      it('当全屏时，应退出全屏', () => {
        useUIStore.setState({ isFullScreen: true });
        useEditorStore.setState({ selectedImage: { path: '/test/img1.jpg' } as any });
        renderHook(() => useKeyboardShortcuts(defaultProps));
        fireEvent.keyDown(window, { code: 'Escape' });
        expect(defaultProps.handleToggleFullScreen).toHaveBeenCalled();
      });

      it('当有选中图片且不在全屏时，应返回图库', () => {
        useEditorStore.setState({ selectedImage: { path: '/test/img1.jpg' } as any });
        renderHook(() => useKeyboardShortcuts(defaultProps));
        fireEvent.keyDown(window, { code: 'Escape' });
        expect(defaultProps.handleBackToLibrary).toHaveBeenCalled();
      });
    });

    describe('方向键导航（图库模式）', () => {
      it('ArrowRight 应导航到下一张图片', () => {
        const setLibrarySpy = vi.fn();
        useLibraryStore.setState({
          libraryActivePath: '/test/img1.jpg',
          setLibrary: setLibrarySpy,
        });
        renderHook(() => useKeyboardShortcuts(defaultProps));
        fireEvent.keyDown(window, { code: 'ArrowRight' });
        expect(setLibrarySpy).toHaveBeenCalledWith({
          libraryActivePath: '/test/img2.jpg',
          multiSelectedPaths: ['/test/img2.jpg'],
        });
      });

      it('ArrowDown 应导航到下一张图片', () => {
        const setLibrarySpy = vi.fn();
        useLibraryStore.setState({
          libraryActivePath: '/test/img1.jpg',
          setLibrary: setLibrarySpy,
        });
        renderHook(() => useKeyboardShortcuts(defaultProps));
        fireEvent.keyDown(window, { code: 'ArrowDown' });
        expect(setLibrarySpy).toHaveBeenCalledWith({
          libraryActivePath: '/test/img2.jpg',
          multiSelectedPaths: ['/test/img2.jpg'],
        });
      });

      it('ArrowLeft 应导航到上一张图片', () => {
        const setLibrarySpy = vi.fn();
        useLibraryStore.setState({
          libraryActivePath: '/test/img2.jpg',
          setLibrary: setLibrarySpy,
        });
        renderHook(() => useKeyboardShortcuts(defaultProps));
        fireEvent.keyDown(window, { code: 'ArrowLeft' });
        expect(setLibrarySpy).toHaveBeenCalledWith({
          libraryActivePath: '/test/img1.jpg',
          multiSelectedPaths: ['/test/img1.jpg'],
        });
      });

      it('ArrowUp 应导航到上一张图片', () => {
        const setLibrarySpy = vi.fn();
        useLibraryStore.setState({
          libraryActivePath: '/test/img2.jpg',
          setLibrary: setLibrarySpy,
        });
        renderHook(() => useKeyboardShortcuts(defaultProps));
        fireEvent.keyDown(window, { code: 'ArrowUp' });
        expect(setLibrarySpy).toHaveBeenCalledWith({
          libraryActivePath: '/test/img1.jpg',
          multiSelectedPaths: ['/test/img1.jpg'],
        });
      });

      it('导航到最后一张后应循环到第一张', () => {
        const setLibrarySpy = vi.fn();
        useLibraryStore.setState({
          libraryActivePath: '/test/img3.jpg',
          setLibrary: setLibrarySpy,
        });
        renderHook(() => useKeyboardShortcuts(defaultProps));
        fireEvent.keyDown(window, { code: 'ArrowRight' });
        expect(setLibrarySpy).toHaveBeenCalledWith({
          libraryActivePath: '/test/img1.jpg',
          multiSelectedPaths: ['/test/img1.jpg'],
        });
      });

      it('导航到第一张前应循环到最后一张', () => {
        const setLibrarySpy = vi.fn();
        useLibraryStore.setState({
          libraryActivePath: '/test/img1.jpg',
          setLibrary: setLibrarySpy,
        });
        renderHook(() => useKeyboardShortcuts(defaultProps));
        fireEvent.keyDown(window, { code: 'ArrowLeft' });
        expect(setLibrarySpy).toHaveBeenCalledWith({
          libraryActivePath: '/test/img3.jpg',
          multiSelectedPaths: ['/test/img3.jpg'],
        });
      });

      it('当有选中图片时方向键不应触发图库导航', () => {
        const setLibrarySpy = vi.fn();
        useEditorStore.setState({ selectedImage: { path: '/test/img1.jpg' } as any });
        useLibraryStore.setState({ setLibrary: setLibrarySpy });
        renderHook(() => useKeyboardShortcuts(defaultProps));
        fireEvent.keyDown(window, { code: 'ArrowRight' });
        expect(setLibrarySpy).not.toHaveBeenCalled();
      });

      it('当 libraryActivePath 为 null 时不导航', () => {
        const setLibrarySpy = vi.fn();
        useLibraryStore.setState({ libraryActivePath: null, setLibrary: setLibrarySpy });
        renderHook(() => useKeyboardShortcuts(defaultProps));
        fireEvent.keyDown(window, { code: 'ArrowRight' });
        expect(setLibrarySpy).not.toHaveBeenCalled();
      });

      it('当排序列表为空时不导航', () => {
        const setLibrarySpy = vi.fn();
        useLibraryStore.setState({
          libraryActivePath: '/test/img1.jpg',
          setLibrary: setLibrarySpy,
        });
        renderHook(() => useKeyboardShortcuts({ ...defaultProps, sortedImageList: [] }));
        fireEvent.keyDown(window, { code: 'ArrowRight' });
        expect(setLibrarySpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('组合键快捷键 (comboMap)', () => {
    describe('修饰键组合', () => {
      it('Ctrl+组合键应该能正确匹配', () => {
        const setLibrarySpy = vi.fn();
        useLibraryStore.setState({ setLibrary: setLibrarySpy });
        renderHook(() => useKeyboardShortcuts(defaultProps));
        fireEvent.keyDown(window, { code: 'KeyA', ctrlKey: true });
        expect(setLibrarySpy).toHaveBeenCalledWith({
          multiSelectedPaths: expect.arrayContaining(['/test/img1.jpg', '/test/img2.jpg', '/test/img3.jpg']),
        });
      });

      it('Shift+组合键应该能正确匹配', () => {
        renderHook(() => useKeyboardShortcuts(defaultProps));
        fireEvent.keyDown(window, { code: 'Digit1', shiftKey: true });
        expect(mockHandleSetColorLabel).toHaveBeenCalledWith('red');
      });

      it('Ctrl+Shift+组合键应该能正确匹配', () => {
        const setProcessSpy = vi.fn();
        useLibraryStore.setState({ multiSelectedPaths: ['/test/img1.jpg'] });
        useProcessStore.setState({ setProcess: setProcessSpy });
        renderHook(() => useKeyboardShortcuts(defaultProps));
        fireEvent.keyDown(window, { code: 'KeyC', ctrlKey: true, shiftKey: true });
        expect(setProcessSpy).toHaveBeenCalledWith({ copiedFilePaths: ['/test/img1.jpg'] });
      });

      it('Alt+修饰键应该能被识别', () => {
        const event = { code: 'KeyA', altKey: true, ctrlKey: false, shiftKey: false, metaKey: false } as KeyboardEvent;
        const result = normalizeCombo(event, 'linux');
        expect(result).toContain('alt');
      });

      it('Meta 键在非 macOS 上应被视为 Ctrl', () => {
        const event = { code: 'KeyA', metaKey: true, ctrlKey: false, shiftKey: false, altKey: false } as KeyboardEvent;
        const result = normalizeCombo(event, 'linux');
        expect(result).toContain('ctrl');
      });
    });

    describe('快捷键触发与 shouldFire 条件', () => {
      it('open_image - 在图库模式下按 Enter 应打开图片', () => {
        useLibraryStore.setState({ libraryActivePath: '/test/img1.jpg' });
        renderHook(() => useKeyboardShortcuts(defaultProps));
        fireEvent.keyDown(window, { code: 'Enter' });
        expect(defaultProps.handleImageSelect).toHaveBeenCalledWith('/test/img1.jpg');
      });

      it('open_image - 当已有选中图片时不应触发', () => {
        useEditorStore.setState({ selectedImage: { path: '/test/img1.jpg' } as any });
        renderHook(() => useKeyboardShortcuts(defaultProps));
        fireEvent.keyDown(window, { code: 'Enter' });
        expect(defaultProps.handleImageSelect).not.toHaveBeenCalled();
      });

      it('select_all - 当有图片列表时应全选', () => {
        const setLibrarySpy = vi.fn();
        useLibraryStore.setState({ setLibrary: setLibrarySpy });
        renderHook(() => useKeyboardShortcuts(defaultProps));
        fireEvent.keyDown(window, { code: 'KeyA', ctrlKey: true });
        expect(setLibrarySpy).toHaveBeenCalledTimes(2);
      });

      it('select_all - 当列表为空时不应触发', () => {
        const setLibrarySpy = vi.fn();
        useLibraryStore.setState({ setLibrary: setLibrarySpy });
        renderHook(() => useKeyboardShortcuts({ ...defaultProps, sortedImageList: [] }));
        fireEvent.keyDown(window, { code: 'KeyA', ctrlKey: true });
        expect(setLibrarySpy).not.toHaveBeenCalled();
      });

      it('preview_prev - 有选中图片时应切换到上一张', () => {
        useEditorStore.setState({ selectedImage: { path: '/test/img2.jpg' } as any });
        renderHook(() => useKeyboardShortcuts(defaultProps));
        fireEvent.keyDown(window, { code: 'ArrowLeft' });
        expect(defaultProps.handleImageSelect).toHaveBeenCalledWith('/test/img1.jpg');
      });

      it('preview_next - 有选中图片时应切换到下一张', () => {
        useEditorStore.setState({ selectedImage: { path: '/test/img1.jpg' } as any });
        renderHook(() => useKeyboardShortcuts(defaultProps));
        fireEvent.keyDown(window, { code: 'ArrowRight' });
        expect(defaultProps.handleImageSelect).toHaveBeenCalledWith('/test/img2.jpg');
      });

      it('zoom_in_step - 有选中图片时应放大', () => {
        useEditorStore.setState({
          selectedImage: { path: '/test/img1.jpg' } as any,
          originalSize: { width: 1920, height: 1080 },
          displaySize: { width: 960, height: 540 },
        });
        renderHook(() => useKeyboardShortcuts(defaultProps));
        fireEvent.keyDown(window, { code: 'ArrowUp' });
        expect(defaultProps.handleZoomChange).toHaveBeenCalled();
      });

      it('zoom_out_step - 有选中图片时应缩小', () => {
        useEditorStore.setState({
          selectedImage: { path: '/test/img1.jpg' } as any,
          originalSize: { width: 1920, height: 1080 },
          displaySize: { width: 960, height: 540 },
        });
        renderHook(() => useKeyboardShortcuts(defaultProps));
        fireEvent.keyDown(window, { code: 'ArrowDown' });
        expect(defaultProps.handleZoomChange).toHaveBeenCalled();
      });

      it('rotate_left - 有选中图片时应左旋', () => {
        useEditorStore.setState({ selectedImage: { path: '/test/img1.jpg' } as any });
        renderHook(() => useKeyboardShortcuts(defaultProps));
        fireEvent.keyDown(window, { code: 'BracketLeft' });
        expect(mockHandleRotate).toHaveBeenCalledWith(-90);
      });

      it('rotate_right - 有选中图片时应右旋', () => {
        useEditorStore.setState({ selectedImage: { path: '/test/img1.jpg' } as any });
        renderHook(() => useKeyboardShortcuts(defaultProps));
        fireEvent.keyDown(window, { code: 'BracketRight' });
        expect(mockHandleRotate).toHaveBeenCalledWith(90);
      });

      it('undo - 有历史记录时应撤销', () => {
        const undoSpy = vi.fn();
        useEditorStore.setState({
          selectedImage: { path: '/test/img1.jpg' } as any,
          historyIndex: 1,
          undo: undoSpy,
        });
        renderHook(() => useKeyboardShortcuts(defaultProps));
        fireEvent.keyDown(window, { code: 'KeyZ', ctrlKey: true });
        expect(undoSpy).toHaveBeenCalled();
      });

      it('undo - historyIndex 为 0 时不应触发', () => {
        const undoSpy = vi.fn();
        useEditorStore.setState({
          selectedImage: { path: '/test/img1.jpg' } as any,
          historyIndex: 0,
          undo: undoSpy,
        });
        renderHook(() => useKeyboardShortcuts(defaultProps));
        fireEvent.keyDown(window, { code: 'KeyZ', ctrlKey: true });
        expect(undoSpy).not.toHaveBeenCalled();
      });

      it('redo - 有后续历史时应重做', () => {
        const redoSpy = vi.fn();
        useEditorStore.setState({
          selectedImage: { path: '/test/img1.jpg' } as any,
          history: [
            { masks: [], aiPatches: [] } as any,
            { masks: [], aiPatches: [] } as any,
            { masks: [], aiPatches: [] } as any,
          ],
          historyIndex: 0,
          redo: redoSpy,
        });
        renderHook(() => useKeyboardShortcuts(defaultProps));
        fireEvent.keyDown(window, { code: 'KeyY', ctrlKey: true });
        expect(redoSpy).toHaveBeenCalled();
      });

      it('toggle_fullscreen - 有选中图片时应切换全屏', () => {
        useEditorStore.setState({ selectedImage: { path: '/test/img1.jpg' } as any });
        renderHook(() => useKeyboardShortcuts(defaultProps));
        fireEvent.keyDown(window, { code: 'KeyF' });
        expect(defaultProps.handleToggleFullScreen).toHaveBeenCalled();
      });

      it('show_original - 有选中图片时应切换显示原图', () => {
        const setEditorSpy = vi.fn();
        useEditorStore.setState({
          selectedImage: { path: '/test/img1.jpg' } as any,
          showOriginal: false,
          setEditor: setEditorSpy,
        });
        renderHook(() => useKeyboardShortcuts(defaultProps));
        fireEvent.keyDown(window, { code: 'KeyB' });
        expect(setEditorSpy).toHaveBeenCalledWith({ showOriginal: true });
      });

      it('rate_0 到 rate_5 应触发评分', () => {
        renderHook(() => useKeyboardShortcuts(defaultProps));

        const rateKeys: [string, number][] = [
          ['Digit0', 0],
          ['Digit1', 1],
          ['Digit2', 2],
          ['Digit3', 3],
          ['Digit4', 4],
          ['Digit5', 5],
        ];

        for (const [code, rating] of rateKeys) {
          mockHandleRate.mockClear();
          fireEvent.keyDown(window, { code });
          expect(mockHandleRate).toHaveBeenCalledWith(rating);
        }
      });

      it('color_label 快捷键应触发颜色标签设置', () => {
        renderHook(() => useKeyboardShortcuts(defaultProps));

        const colorKeys: [string, string | null][] = [
          ['Digit0', null],
          ['Digit1', 'red'],
          ['Digit2', 'yellow'],
          ['Digit3', 'green'],
          ['Digit4', 'blue'],
          ['Digit5', 'purple'],
        ];

        for (const [code, color] of colorKeys) {
          mockHandleSetColorLabel.mockClear();
          fireEvent.keyDown(window, { code, shiftKey: true });
          expect(mockHandleSetColorLabel).toHaveBeenCalledWith(color);
        }
      });

      it('delete_selected - 没有活动遮罩时应删除选中项', () => {
        useEditorStore.setState({
          activeMaskContainerId: null,
          activeAiPatchContainerId: null,
        });
        renderHook(() => useKeyboardShortcuts(defaultProps));
        fireEvent.keyDown(window, { code: 'Delete' });
        expect(defaultProps.handleDeleteSelected).toHaveBeenCalled();
      });

      it('delete_selected - 有活动遮罩时不应触发删除选中项', () => {
        useEditorStore.setState({
          activeMaskContainerId: 'mask-1',
          activeAiPatchContainerId: null,
        });
        renderHook(() => useKeyboardShortcuts(defaultProps));
        fireEvent.keyDown(window, { code: 'Delete' });
        expect(defaultProps.handleDeleteSelected).not.toHaveBeenCalled();
      });
    });

    describe('面板切换快捷键', () => {
      it('toggle_adjustments - 应切换到 Adjustments 面板', () => {
        const setRightPanelSpy = vi.fn();
        useUIStore.setState({ setRightPanel: setRightPanelSpy });
        useEditorStore.setState({ selectedImage: { path: '/test/img1.jpg' } as any });
        renderHook(() => useKeyboardShortcuts(defaultProps));
        fireEvent.keyDown(window, { code: 'KeyD' });
        expect(setRightPanelSpy).toHaveBeenCalledWith(Panel.Adjustments);
      });

      it('toggle_crop_panel - 应切换到 Crop 面板', () => {
        const setRightPanelSpy = vi.fn();
        useUIStore.setState({ setRightPanel: setRightPanelSpy });
        useEditorStore.setState({ selectedImage: { path: '/test/img1.jpg' } as any });
        renderHook(() => useKeyboardShortcuts(defaultProps));
        fireEvent.keyDown(window, { code: 'KeyR' });
        expect(setRightPanelSpy).toHaveBeenCalledWith(Panel.Crop);
      });

      it('toggle_masks - 应切换到 Masks 面板', () => {
        const setRightPanelSpy = vi.fn();
        useUIStore.setState({ setRightPanel: setRightPanelSpy });
        useEditorStore.setState({ selectedImage: { path: '/test/img1.jpg' } as any });
        renderHook(() => useKeyboardShortcuts(defaultProps));
        fireEvent.keyDown(window, { code: 'KeyM' });
        expect(setRightPanelSpy).toHaveBeenCalledWith(Panel.Masks);
      });

      it('toggle_ai - 应切换到 Ai 面板', () => {
        const setRightPanelSpy = vi.fn();
        useUIStore.setState({ setRightPanel: setRightPanelSpy });
        useEditorStore.setState({ selectedImage: { path: '/test/img1.jpg' } as any });
        renderHook(() => useKeyboardShortcuts(defaultProps));
        fireEvent.keyDown(window, { code: 'KeyK' });
        expect(setRightPanelSpy).toHaveBeenCalledWith(Panel.Ai);
      });

      it('toggle_presets - 应切换到 Presets 面板', () => {
        const setRightPanelSpy = vi.fn();
        useUIStore.setState({ setRightPanel: setRightPanelSpy });
        useEditorStore.setState({ selectedImage: { path: '/test/img1.jpg' } as any });
        renderHook(() => useKeyboardShortcuts(defaultProps));
        fireEvent.keyDown(window, { code: 'KeyP' });
        expect(setRightPanelSpy).toHaveBeenCalledWith(Panel.Presets);
      });

      it('toggle_metadata - 应切换到 Metadata 面板', () => {
        const setRightPanelSpy = vi.fn();
        useUIStore.setState({ setRightPanel: setRightPanelSpy });
        useEditorStore.setState({ selectedImage: { path: '/test/img1.jpg' } as any });
        renderHook(() => useKeyboardShortcuts(defaultProps));
        fireEvent.keyDown(window, { code: 'KeyI' });
        expect(setRightPanelSpy).toHaveBeenCalledWith(Panel.Metadata);
      });

      it('toggle_export - 应切换到 Export 面板', () => {
        const setRightPanelSpy = vi.fn();
        useUIStore.setState({ setRightPanel: setRightPanelSpy });
        useEditorStore.setState({ selectedImage: { path: '/test/img1.jpg' } as any });
        renderHook(() => useKeyboardShortcuts(defaultProps));
        fireEvent.keyDown(window, { code: 'KeyE' });
        expect(setRightPanelSpy).toHaveBeenCalledWith(Panel.Export);
      });

      it('toggle_analytics - 应切换波形显示', () => {
        const setEditorSpy = vi.fn();
        useEditorStore.setState({
          selectedImage: { path: '/test/img1.jpg' } as any,
          isWaveformVisible: false,
          setEditor: setEditorSpy,
        });
        renderHook(() => useKeyboardShortcuts(defaultProps));
        fireEvent.keyDown(window, { code: 'KeyA' });
        expect(setEditorSpy).toHaveBeenCalledWith({ isWaveformVisible: true });
      });
    });

    describe('复制/粘贴调整', () => {
      it('copy_adjustments - 应调用 handleCopyAdjustments', () => {
        useEditorStore.setState({ selectedImage: { path: '/test/img1.jpg' } as any });
        renderHook(() => useKeyboardShortcuts(defaultProps));
        fireEvent.keyDown(window, { code: 'KeyC', ctrlKey: true });
        expect(mockHandleCopyAdjustments).toHaveBeenCalled();
      });

      it('paste_adjustments - 应调用 handlePasteAdjustments', () => {
        useEditorStore.setState({ selectedImage: { path: '/test/img1.jpg' } as any });
        renderHook(() => useKeyboardShortcuts(defaultProps));
        fireEvent.keyDown(window, { code: 'KeyV', ctrlKey: true });
        expect(mockHandlePasteAdjustments).toHaveBeenCalled();
      });
    });
  });

  describe('用户自定义快捷键', () => {
    it('应使用用户自定义的快捷键配置', () => {
      useSettingsStore.setState({
        appSettings: {
          keybinds: {
            toggle_fullscreen: ['KeyG'],
          },
        } as any,
        osPlatform: 'linux',
      });
      useEditorStore.setState({ selectedImage: { path: '/test/img1.jpg' } as any });
      renderHook(() => useKeyboardShortcuts(defaultProps));
      fireEvent.keyDown(window, { code: 'KeyG' });
      expect(defaultProps.handleToggleFullScreen).toHaveBeenCalled();
    });

    it('默认快捷键在用户自定义后不应再触发', () => {
      useSettingsStore.setState({
        appSettings: {
          keybinds: {
            toggle_fullscreen: ['KeyG'],
          },
        } as any,
        osPlatform: 'linux',
      });
      useEditorStore.setState({ selectedImage: { path: '/test/img1.jpg' } as any });
      renderHook(() => useKeyboardShortcuts(defaultProps));
      fireEvent.keyDown(window, { code: 'KeyF' });
      expect(defaultProps.handleToggleFullScreen).not.toHaveBeenCalled();
    });
  });

  describe('按键匹配逻辑', () => {
    it('不匹配的按键不应触发任何操作', () => {
      const setEditorSpy = vi.fn();
      useEditorStore.setState({
        selectedImage: { path: '/test/img1.jpg' } as any,
        setEditor: setEditorSpy,
      });
      renderHook(() => useKeyboardShortcuts(defaultProps));
      fireEvent.keyDown(window, { code: 'KeyX' });
      expect(setEditorSpy).not.toHaveBeenCalled();
      expect(defaultProps.handleToggleFullScreen).not.toHaveBeenCalled();
    });

    it('缺少修饰键时不应触发组合快捷键', () => {
      const undoSpy = vi.fn();
      useEditorStore.setState({
        selectedImage: { path: '/test/img1.jpg' } as any,
        historyIndex: 1,
        undo: undoSpy,
      });
      renderHook(() => useKeyboardShortcuts(defaultProps));
      fireEvent.keyDown(window, { code: 'KeyZ' });
      expect(undoSpy).not.toHaveBeenCalled();
    });
  });

  describe('preventDefault 行为', () => {
    it('触发快捷键时应调用 preventDefault', () => {
      useEditorStore.setState({ selectedImage: { path: '/test/img1.jpg' } as any });
      renderHook(() => useKeyboardShortcuts(defaultProps));
      const event = new KeyboardEvent('keydown', { code: 'KeyF', cancelable: true });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      window.dispatchEvent(event);
      expect(preventDefaultSpy).toHaveBeenCalled();
      preventDefaultSpy.mockRestore();
    });
  });

  describe('sortedImageList 更新', () => {
    it('sortedImageList 更新后应使用新的列表', () => {
      const { rerender } = renderHook((props) => useKeyboardShortcuts(props), {
        initialProps: defaultProps,
      });

      const newImages = [createMockImageFile('/test/new1.jpg', 0), createMockImageFile('/test/new2.jpg', 1)];
      const newProps = { ...defaultProps, sortedImageList: newImages };

      act(() => {
        rerender(newProps);
      });

      const setLibrarySpy = vi.fn();
      useLibraryStore.setState({
        libraryActivePath: '/test/new1.jpg',
        setLibrary: setLibrarySpy,
      });

      fireEvent.keyDown(window, { code: 'ArrowRight' });
      expect(setLibrarySpy).toHaveBeenCalledWith({
        libraryActivePath: '/test/new2.jpg',
        multiSelectedPaths: ['/test/new2.jpg'],
      });
    });
  });

  describe('画笔大小调整', () => {
    it('brush_size_up - 在 Masks 面板中应增大画笔', () => {
      const setEditorSpy = vi.fn();
      useEditorStore.setState({
        selectedImage: { path: '/test/img1.jpg' } as any,
        brushSettings: { size: 50 },
        setEditor: setEditorSpy,
      });
      useUIStore.setState({ activeRightPanel: Panel.Masks });
      renderHook(() => useKeyboardShortcuts(defaultProps));
      fireEvent.keyDown(window, { code: 'ArrowUp', ctrlKey: true });
      expect(setEditorSpy).toHaveBeenCalledWith({
        brushSettings: { size: 60 },
      });
    });

    it('brush_size_down - 在 Masks 面板中应减小画笔', () => {
      const setEditorSpy = vi.fn();
      useEditorStore.setState({
        selectedImage: { path: '/test/img1.jpg' } as any,
        brushSettings: { size: 50 },
        setEditor: setEditorSpy,
      });
      useUIStore.setState({ activeRightPanel: Panel.Masks });
      renderHook(() => useKeyboardShortcuts(defaultProps));
      fireEvent.keyDown(window, { code: 'ArrowDown', ctrlKey: true });
      expect(setEditorSpy).toHaveBeenCalledWith({
        brushSettings: { size: 40 },
      });
    });

    it('brush_size_up - 不在 Masks 面板时不应触发', () => {
      const setEditorSpy = vi.fn();
      useEditorStore.setState({
        selectedImage: { path: '/test/img1.jpg' } as any,
        brushSettings: { size: 50 },
        setEditor: setEditorSpy,
      });
      useUIStore.setState({ activeRightPanel: Panel.Adjustments });
      renderHook(() => useKeyboardShortcuts(defaultProps));
      fireEvent.keyDown(window, { code: 'ArrowUp', ctrlKey: true });
      expect(setEditorSpy).not.toHaveBeenCalled();
    });
  });

  describe('toggle_crop 行为', () => {
    it('当活动面板是 Crop 时，应切换 straighten 状态', () => {
      const setEditorSpy = vi.fn();
      useEditorStore.setState({
        selectedImage: { path: '/test/img1.jpg' } as any,
        isStraightenActive: false,
        setEditor: setEditorSpy,
      });
      useUIStore.setState({ activeRightPanel: Panel.Crop });
      renderHook(() => useKeyboardShortcuts(defaultProps));
      fireEvent.keyDown(window, { code: 'KeyS' });
      expect(setEditorSpy).toHaveBeenCalledWith({ isStraightenActive: true });
    });

    it('当活动面板不是 Crop 时，应切换到 Crop 面板并激活 straighten', () => {
      const setEditorSpy = vi.fn();
      const setRightPanelSpy = vi.fn();
      useEditorStore.setState({
        selectedImage: { path: '/test/img1.jpg' } as any,
        setEditor: setEditorSpy,
      });
      useUIStore.setState({ activeRightPanel: Panel.Adjustments, setRightPanel: setRightPanelSpy });
      renderHook(() => useKeyboardShortcuts(defaultProps));
      fireEvent.keyDown(window, { code: 'KeyS' });
      expect(setRightPanelSpy).toHaveBeenCalledWith(Panel.Crop);
      expect(setEditorSpy).toHaveBeenCalledWith({ isStraightenActive: true });
    });
  });

  describe('toggle_library_exif', () => {
    it('在图库模式下应循环切换 EXIF 叠加模式', () => {
      const handleSettingsChangeSpy = vi.fn();
      useSettingsStore.setState({
        appSettings: { exifOverlay: ExifOverlay.Off } as any,
        handleSettingsChange: handleSettingsChangeSpy,
      });
      renderHook(() => useKeyboardShortcuts(defaultProps));
      fireEvent.keyDown(window, { code: 'KeyT' });
      expect(handleSettingsChangeSpy).toHaveBeenCalledWith(expect.objectContaining({ exifOverlay: ExifOverlay.Hover }));
    });

    it('在编辑模式下不应触发 toggle_library_exif', () => {
      const handleSettingsChangeSpy = vi.fn();
      useEditorStore.setState({ selectedImage: { path: '/test/img1.jpg' } as any });
      useSettingsStore.setState({
        appSettings: { exifOverlay: ExifOverlay.Off } as any,
        handleSettingsChange: handleSettingsChangeSpy,
      });
      renderHook(() => useKeyboardShortcuts(defaultProps));
      fireEvent.keyDown(window, { code: 'KeyT' });
      expect(handleSettingsChangeSpy).not.toHaveBeenCalled();
    });
  });

  describe('zoom 相关快捷键', () => {
    beforeEach(() => {
      useEditorStore.setState({
        selectedImage: { path: '/test/img1.jpg' } as any,
        originalSize: { width: 1920, height: 1080 },
        displaySize: { width: 960, height: 540 },
        baseRenderSize: { width: 800, height: 600 },
      });
    });

    it('zoom_fit - 应触发适应窗口缩放', () => {
      renderHook(() => useKeyboardShortcuts(defaultProps));
      fireEvent.keyDown(window, { code: 'Digit0', ctrlKey: true });
      expect(defaultProps.handleZoomChange).toHaveBeenCalledWith(0, true);
    });

    it('zoom_100 - 应触发 100% 缩放', () => {
      renderHook(() => useKeyboardShortcuts(defaultProps));
      fireEvent.keyDown(window, { code: 'Digit1', ctrlKey: true });
      expect(defaultProps.handleZoomChange).toHaveBeenCalledWith(1.0);
    });

    it('zoom_in - 应放大（乘以 1.2）', () => {
      renderHook(() => useKeyboardShortcuts(defaultProps));
      fireEvent.keyDown(window, { code: 'Equal', ctrlKey: true });
      expect(defaultProps.handleZoomChange).toHaveBeenCalled();
    });

    it('zoom_out - 应缩小（除以 1.2）', () => {
      renderHook(() => useKeyboardShortcuts(defaultProps));
      fireEvent.keyDown(window, { code: 'Minus', ctrlKey: true });
      expect(defaultProps.handleZoomChange).toHaveBeenCalled();
    });

    it('cycle_zoom - 应触发循环缩放', () => {
      renderHook(() => useKeyboardShortcuts(defaultProps));
      fireEvent.keyDown(window, { code: 'Space' });
      expect(defaultProps.handleZoomChange).toHaveBeenCalled();
    });
  });

  describe('可打印字符处理', () => {
    it('单个字母键应能匹配快捷键', () => {
      useEditorStore.setState({ selectedImage: { path: '/test/img1.jpg' } as any });
      renderHook(() => useKeyboardShortcuts(defaultProps));
      fireEvent.keyDown(window, { code: 'KeyF' });
      expect(defaultProps.handleToggleFullScreen).toHaveBeenCalled();
    });

    it('数字键应能匹配评分快捷键', () => {
      renderHook(() => useKeyboardShortcuts(defaultProps));
      fireEvent.keyDown(window, { code: 'Digit5' });
      expect(mockHandleRate).toHaveBeenCalledWith(5);
    });
  });

  describe('macOS 平台差异', () => {
    it('macOS 上 Meta+Backspace 应映射为 Delete 键', () => {
      const event = {
        code: 'Backspace',
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
      } as KeyboardEvent;
      const result = normalizeCombo(event, 'macos');
      expect(result).toContain('Delete');
    });

    it('macOS 上 Ctrl+Backspace 也应映射为 Delete 键', () => {
      const event = {
        code: 'Backspace',
        ctrlKey: true,
        metaKey: false,
        shiftKey: false,
        altKey: false,
      } as KeyboardEvent;
      const result = normalizeCombo(event, 'macos');
      expect(result).toContain('Delete');
    });

    it('macOS 上普通 Backspace 不应映射为 Delete', () => {
      const event = {
        code: 'Backspace',
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        altKey: false,
      } as KeyboardEvent;
      const result = normalizeCombo(event, 'macos');
      expect(result).not.toContain('Delete');
    });
  });
});
