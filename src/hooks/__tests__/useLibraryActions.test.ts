import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLibraryActions } from '../useLibraryActions';
import { ImageFile, AlbumItem, Album, AlbumGroup, SortDirection, RawStatus } from '../../components/ui/AppProperties';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('react-toastify', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('../../store/useLibraryStore', () => ({
  useLibraryStore: vi.fn(),
}));

vi.mock('../../store/useEditorStore', () => ({
  useEditorStore: vi.fn(),
}));

vi.mock('../../store/useUIStore', () => ({
  useUIStore: vi.fn(),
}));

vi.mock('../../store/useSettingsStore', () => ({
  useSettingsStore: vi.fn(),
}));

vi.mock('../../utils/ImageLRUCache', () => ({
  globalImageCache: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    clear: vi.fn(),
  },
}));

vi.mock('../useSortedLibrary', () => ({
  computeSortedLibrary: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';
import { toast } from 'react-toastify';
import { useLibraryStore } from '../../store/useLibraryStore';
import { useEditorStore } from '../../store/useEditorStore';
import { useUIStore } from '../../store/useUIStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { globalImageCache } from '../../utils/ImageLRUCache';
import { computeSortedLibrary } from '../useSortedLibrary';

const mockImageFile = (overrides: Partial<ImageFile> = {}): ImageFile => ({
  is_edited: false,
  modified: 1000000,
  path: '/test/image.jpg',
  rating: 0,
  tags: null,
  exif: null,
  is_virtual_copy: false,
  is_cloud_placeholder: false,
  ...overrides,
});

const createLibraryState = (overrides: any = {}) => {
  const state = {
    rootPaths: [],
    currentFolderPath: null,
    expandedFolders: new Set<string>(),
    folderTrees: [],
    pinnedFolderTrees: [],
    albumTree: [] as AlbumItem[],
    activeAlbumId: null,
    expandedAlbumGroups: new Set<string>(),
    imageList: [] as ImageFile[],
    imageRatings: {} as Record<string, number>,
    multiSelectedPaths: [] as string[],
    selectionAnchorPath: null as string | null,
    libraryActivePath: null as string | null,
    libraryActiveAdjustments: {} as any,
    sortCriteria: { key: 'name', order: SortDirection.Ascending },
    filterCriteria: { colors: [], rating: 0, rawStatus: RawStatus.All },
    searchCriteria: { tags: [], text: '', mode: 'OR' as const },
    isTreeLoading: false,
    isViewLoading: false,
    libraryScrollTop: 0,
    listColumnWidths: {},
    setLibrary: vi.fn((updater: any) => {
      const newState = typeof updater === 'function' ? updater(state) : updater;
      Object.assign(state, newState);
    }),
    clearSelection: vi.fn(),
    setFilterCriteria: vi.fn(),
    setSearchCriteria: vi.fn(),
    setSortCriteria: vi.fn(),
    ...overrides,
  };
  return state;
};

const createEditorState = (overrides: any = {}) => ({
  selectedImage: null,
  adjustments: {} as any,
  previewOverride: null,
  history: [{}],
  historyIndex: 0,
  finalPreviewUrl: null,
  uncroppedAdjustedPreviewUrl: null,
  transformedOriginalUrl: null,
  interactivePatch: null,
  showOriginal: false,
  histogram: null,
  waveform: null,
  isWaveformVisible: false,
  activeWaveformChannel: 'luma',
  waveformHeight: 220,
  isSliderDragging: false,
  zoom: 1,
  displaySize: { width: 0, height: 0 },
  previewSize: { width: 0, height: 0 },
  baseRenderSize: { width: 0, height: 0 },
  originalSize: { width: 0, height: 0 },
  isRotationActive: false,
  overlayMode: 'thirds',
  overlayRotation: 0,
  isStraightenActive: false,
  isWbPickerActive: false,
  liveRotation: null,
  brushSettings: null,
  activeMaskContainerId: null,
  activeMaskId: null,
  activeAiPatchContainerId: null,
  activeAiSubMaskId: null,
  isMaskControlHovered: false,
  isGeneratingAiMask: false,
  isGeneratingAi: false,
  isAIConnectorConnected: false,
  hasRenderedFirstFrame: false,
  patchesSentToBackend: new Set<string>(),
  copiedSectionAdjustments: null,
  copiedMask: null,
  copiedAdjustments: null,
  setEditor: vi.fn((updater: any) => {}),
  pushHistory: vi.fn(),
  undo: vi.fn(),
  redo: vi.fn(),
  resetHistory: vi.fn(),
  goToHistoryIndex: vi.fn(),
  ...overrides,
});

const createUIState = (overrides: any = {}) => ({
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
  activeRightPanel: null,
  renderedRightPanel: null,
  slideDirection: 1,
  collapsibleSectionsState: { basic: true, color: false, curves: true, details: false, effects: false },
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
  isCreateAlbumGroupModalOpen: false,
  isRenameAlbumModalOpen: false,
  albumActionTarget: null,
  isConfigurePresetModalOpen: false,
  isLensCorrectionModalOpen: false,
  isTransformModalOpen: false,
  confirmModalState: { isOpen: false },
  panoramaModalState: { isOpen: false },
  hdrModalState: { isOpen: false },
  negativeModalState: { isOpen: false },
  denoiseModalState: { isOpen: false },
  cullingModalState: { isOpen: false },
  collageModalState: { isOpen: false },
  setUI: vi.fn(),
  setRightPanel: vi.fn(),
  customEscapeHandler: null,
  setCustomEscapeHandler: vi.fn(),
  ...overrides,
});

const createSettingsState = (overrides: any = {}) => ({
  appSettings: {
    pinnedFolders: [],
    enableFolderImageCounts: false,
  } as any,
  theme: 'default',
  supportedTypes: {
    raw: ['cr2', 'nef', 'arw'],
    nonRaw: ['jpg', 'jpeg', 'png'],
  },
  osPlatform: '',
  initPlatform: vi.fn(),
  isAndroid: vi.fn(() => false),
  setAppSettings: vi.fn(),
  setTheme: vi.fn(),
  setSupportedTypes: vi.fn(),
  handleSettingsChange: vi.fn(async () => {}),
  ...overrides,
});

describe('useLibraryActions', () => {
  let libraryState: ReturnType<typeof createLibraryState>;
  let editorState: ReturnType<typeof createEditorState>;
  let uiState: ReturnType<typeof createUIState>;
  let settingsState: ReturnType<typeof createSettingsState>;

  beforeEach(() => {
    vi.clearAllMocks();

    libraryState = createLibraryState();
    editorState = createEditorState();
    uiState = createUIState();
    settingsState = createSettingsState();

    vi.mocked(useLibraryStore).mockImplementation((selector: any) => {
      if (typeof selector === 'function') return selector(libraryState);
      return libraryState;
    });
    (useLibraryStore as any).getState = () => libraryState;

    vi.mocked(useEditorStore).mockImplementation((selector: any) => {
      if (typeof selector === 'function') return selector(editorState);
      return editorState;
    });
    (useEditorStore as any).getState = () => editorState;

    vi.mocked(useUIStore).mockImplementation((selector: any) => {
      if (typeof selector === 'function') return selector(uiState);
      return uiState;
    });
    (useUIStore as any).getState = () => uiState;

    vi.mocked(useSettingsStore).mockImplementation((selector: any) => {
      if (typeof selector === 'function') return selector(settingsState);
      return settingsState;
    });
    (useSettingsStore as any).getState = () => settingsState;

    vi.mocked(invoke).mockResolvedValue(undefined);
    vi.mocked(globalImageCache.get).mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('hook 返回值结构', () => {
    it('返回一个包含所有操作函数的对象', () => {
      const { result } = renderHook(() => useLibraryActions());

      expect(typeof result.current).toBe('object');
      expect(result.current).toHaveProperty('handleRate');
      expect(result.current).toHaveProperty('handleSetColorLabel');
      expect(result.current).toHaveProperty('handleTagsChanged');
      expect(result.current).toHaveProperty('handleUpdateExif');
      expect(result.current).toHaveProperty('handleClearSelection');
      expect(result.current).toHaveProperty('handleLibraryImageSingleClick');
      expect(result.current).toHaveProperty('handleImageClick');
      expect(result.current).toHaveProperty('refreshAllFolderTrees');
      expect(result.current).toHaveProperty('handleTogglePinFolder');
      expect(result.current).toHaveProperty('handleCreateAlbumItem');
      expect(result.current).toHaveProperty('handleRenameAlbumItem');
    });

    it('所有返回值都是函数', () => {
      const { result } = renderHook(() => useLibraryActions());

      expect(typeof result.current.handleRate).toBe('function');
      expect(typeof result.current.handleSetColorLabel).toBe('function');
      expect(typeof result.current.handleTagsChanged).toBe('function');
      expect(typeof result.current.handleUpdateExif).toBe('function');
      expect(typeof result.current.handleClearSelection).toBe('function');
      expect(typeof result.current.handleLibraryImageSingleClick).toBe('function');
      expect(typeof result.current.handleImageClick).toBe('function');
      expect(typeof result.current.refreshAllFolderTrees).toBe('function');
      expect(typeof result.current.handleTogglePinFolder).toBe('function');
      expect(typeof result.current.handleCreateAlbumItem).toBe('function');
      expect(typeof result.current.handleRenameAlbumItem).toBe('function');
    });
  });

  describe('handleRate', () => {
    it('对多选图片设置评分', () => {
      libraryState.multiSelectedPaths = ['/img1.jpg', '/img2.jpg'];
      libraryState.imageRatings = {};

      const { result } = renderHook(() => useLibraryActions());

      act(() => {
        result.current.handleRate(5);
      });

      expect(libraryState.setLibrary).toHaveBeenCalled();
      const updater = (libraryState.setLibrary as any).mock.calls[0][0];
      const newState = updater(libraryState);
      expect(newState.imageRatings['/img1.jpg']).toBe(5);
      expect(newState.imageRatings['/img2.jpg']).toBe(5);
    });

    it('对单张选中图片设置评分', () => {
      libraryState.multiSelectedPaths = [];
      editorState.selectedImage = { path: '/img1.jpg' } as any;

      const { result } = renderHook(() => useLibraryActions());

      act(() => {
        result.current.handleRate(3);
      });

      expect(libraryState.setLibrary).toHaveBeenCalled();
    });

    it('使用传入的 paths 参数', () => {
      libraryState.multiSelectedPaths = [];
      editorState.selectedImage = null;

      const { result } = renderHook(() => useLibraryActions());

      act(() => {
        result.current.handleRate(4, ['/custom.jpg']);
      });

      expect(libraryState.setLibrary).toHaveBeenCalled();
    });

    it('没有选中图片时不做任何操作', () => {
      libraryState.multiSelectedPaths = [];
      editorState.selectedImage = null;

      const { result } = renderHook(() => useLibraryActions());

      act(() => {
        result.current.handleRate(5);
      });

      expect(libraryState.setLibrary).not.toHaveBeenCalled();
    });

    it('再次设置相同评分时取消评分（设为0）', () => {
      libraryState.multiSelectedPaths = ['/img1.jpg'];
      libraryState.imageRatings = { '/img1.jpg': 5 };

      const { result } = renderHook(() => useLibraryActions());

      act(() => {
        result.current.handleRate(5);
      });

      const updater = (libraryState.setLibrary as any).mock.calls[0][0];
      const newState = updater(libraryState);
      expect(newState.imageRatings['/img1.jpg']).toBe(0);
    });

    it('调用 invoke 设置评分', () => {
      libraryState.multiSelectedPaths = ['/img1.jpg'];

      const { result } = renderHook(() => useLibraryActions());

      act(() => {
        result.current.handleRate(5);
      });

      expect(invoke).toHaveBeenCalled();
    });

    it('invoke 失败时显示错误提示', async () => {
      libraryState.multiSelectedPaths = ['/img1.jpg'];
      vi.mocked(invoke).mockRejectedValueOnce(new Error('Test error'));

      const { result } = renderHook(() => useLibraryActions());

      act(() => {
        result.current.handleRate(5);
      });

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(toast.error).toHaveBeenCalled();
    });
  });

  describe('handleSetColorLabel', () => {
    it('设置颜色标签', async () => {
      libraryState.multiSelectedPaths = ['/img1.jpg'];
      libraryState.imageList = [mockImageFile({ path: '/img1.jpg', tags: [] })];
      libraryState.libraryActivePath = '/img1.jpg';

      const { result } = renderHook(() => useLibraryActions());

      await act(async () => {
        await result.current.handleSetColorLabel('red');
      });

      expect(invoke).toHaveBeenCalled();
      expect(libraryState.setLibrary).toHaveBeenCalled();
    });

    it('对已有的相同颜色标签取消设置', async () => {
      libraryState.multiSelectedPaths = ['/img1.jpg'];
      libraryState.imageList = [mockImageFile({ path: '/img1.jpg', tags: ['color:red'] })];
      libraryState.libraryActivePath = '/img1.jpg';
      editorState.selectedImage = { path: '/img1.jpg' } as any;

      const { result } = renderHook(() => useLibraryActions());

      await act(async () => {
        await result.current.handleSetColorLabel('red');
      });

      expect(invoke).toHaveBeenCalled();
    });

    it('没有选中图片时不做任何操作', async () => {
      libraryState.multiSelectedPaths = [];
      editorState.selectedImage = null;

      const { result } = renderHook(() => useLibraryActions());

      await act(async () => {
        await result.current.handleSetColorLabel('red');
      });

      expect(invoke).not.toHaveBeenCalled();
    });

    it('使用传入的 paths 参数', async () => {
      libraryState.multiSelectedPaths = [];
      editorState.selectedImage = null;
      libraryState.imageList = [mockImageFile({ path: '/custom.jpg', tags: [] })];
      libraryState.libraryActivePath = '/custom.jpg';

      const { result } = renderHook(() => useLibraryActions());

      await act(async () => {
        await result.current.handleSetColorLabel('blue', ['/custom.jpg']);
      });

      expect(invoke).toHaveBeenCalled();
    });

    it('设置 null 移除颜色标签', async () => {
      libraryState.multiSelectedPaths = ['/img1.jpg'];
      libraryState.imageList = [mockImageFile({ path: '/img1.jpg', tags: ['color:red'] })];
      libraryState.libraryActivePath = '/img1.jpg';

      const { result } = renderHook(() => useLibraryActions());

      await act(async () => {
        await result.current.handleSetColorLabel(null);
      });

      expect(invoke).toHaveBeenCalled();
    });

    it('invoke 失败时显示错误提示', async () => {
      libraryState.multiSelectedPaths = ['/img1.jpg'];
      libraryState.imageList = [mockImageFile({ path: '/img1.jpg', tags: [] })];
      libraryState.libraryActivePath = '/img1.jpg';
      vi.mocked(invoke).mockRejectedValueOnce(new Error('Test error'));

      const { result } = renderHook(() => useLibraryActions());

      await act(async () => {
        await result.current.handleSetColorLabel('red');
      });

      expect(toast.error).toHaveBeenCalled();
    });
  });

  describe('handleTagsChanged', () => {
    it('更新图片标签', () => {
      libraryState.imageList = [mockImageFile({ path: '/img1.jpg', tags: null })];

      const { result } = renderHook(() => useLibraryActions());

      act(() => {
        result.current.handleTagsChanged(['/img1.jpg'], [{ tag: 'landscape', isUser: true }]);
      });

      expect(libraryState.setLibrary).toHaveBeenCalled();
      const updater = (libraryState.setLibrary as any).mock.calls[0][0];
      const newState = updater(libraryState);
      expect(newState.imageList[0].tags).toContain('user:landscape');
    });

    it('保留颜色标签', () => {
      libraryState.imageList = [mockImageFile({ path: '/img1.jpg', tags: ['color:red'] })];

      const { result } = renderHook(() => useLibraryActions());

      act(() => {
        result.current.handleTagsChanged(['/img1.jpg'], [{ tag: 'nature', isUser: false }]);
      });

      const updater = (libraryState.setLibrary as any).mock.calls[0][0];
      const newState = updater(libraryState);
      expect(newState.imageList[0].tags).toContain('color:red');
      expect(newState.imageList[0].tags).toContain('nature');
    });

    it('空标签数组但保留颜色标签', () => {
      libraryState.imageList = [mockImageFile({ path: '/img1.jpg', tags: ['color:red', 'nature'] })];

      const { result } = renderHook(() => useLibraryActions());

      act(() => {
        result.current.handleTagsChanged(['/img1.jpg'], []);
      });

      const updater = (libraryState.setLibrary as any).mock.calls[0][0];
      const newState = updater(libraryState);
      expect(newState.imageList[0].tags).toEqual(['color:red']);
    });

    it('没有颜色标签且空标签数组时设置为 null', () => {
      libraryState.imageList = [mockImageFile({ path: '/img1.jpg', tags: ['nature'] })];

      const { result } = renderHook(() => useLibraryActions());

      act(() => {
        result.current.handleTagsChanged(['/img1.jpg'], []);
      });

      const updater = (libraryState.setLibrary as any).mock.calls[0][0];
      const newState = updater(libraryState);
      expect(newState.imageList[0].tags).toBeNull();
    });

    it('用户标签添加 user: 前缀', () => {
      libraryState.imageList = [mockImageFile({ path: '/img1.jpg', tags: null })];

      const { result } = renderHook(() => useLibraryActions());

      act(() => {
        result.current.handleTagsChanged(['/img1.jpg'], [
          { tag: 'mytag', isUser: true },
          { tag: 'systemtag', isUser: false },
        ]);
      });

      const updater = (libraryState.setLibrary as any).mock.calls[0][0];
      const newState = updater(libraryState);
      expect(newState.imageList[0].tags).toContain('user:mytag');
      expect(newState.imageList[0].tags).toContain('systemtag');
    });

    it('标签排序', () => {
      libraryState.imageList = [mockImageFile({ path: '/img1.jpg', tags: null })];

      const { result } = renderHook(() => useLibraryActions());

      act(() => {
        result.current.handleTagsChanged(['/img1.jpg'], [
          { tag: 'zebra', isUser: false },
          { tag: 'apple', isUser: false },
        ]);
      });

      const updater = (libraryState.setLibrary as any).mock.calls[0][0];
      const newState = updater(libraryState);
      expect(newState.imageList[0].tags[0]).toBe('apple');
      expect(newState.imageList[0].tags[1]).toBe('zebra');
    });
  });

  describe('handleUpdateExif', () => {
    it('更新图片 EXIF 信息', async () => {
      libraryState.multiSelectedPaths = ['/img1.jpg'];
      libraryState.imageList = [mockImageFile({ path: '/img1.jpg', exif: null })];
      editorState.selectedImage = { path: '/img1.jpg', exif: null } as any;

      const { result } = renderHook(() => useLibraryActions());

      await act(async () => {
        await result.current.handleUpdateExif(undefined, { Artist: 'Test' });
      });

      expect(invoke).toHaveBeenCalled();
      expect(libraryState.setLibrary).toHaveBeenCalled();
      expect(editorState.setEditor).toHaveBeenCalled();
    });

    it('使用传入的 paths 参数', async () => {
      libraryState.multiSelectedPaths = [];
      editorState.selectedImage = null;
      libraryState.imageList = [mockImageFile({ path: '/custom.jpg', exif: null })];

      const { result } = renderHook(() => useLibraryActions());

      await act(async () => {
        await result.current.handleUpdateExif(['/custom.jpg'], { Artist: 'Test' });
      });

      expect(invoke).toHaveBeenCalled();
    });

    it('没有选中图片时不做任何操作', async () => {
      libraryState.multiSelectedPaths = [];
      editorState.selectedImage = null;

      const { result } = renderHook(() => useLibraryActions());

      await act(async () => {
        await result.current.handleUpdateExif(undefined, { Artist: 'Test' });
      });

      expect(invoke).not.toHaveBeenCalled();
    });

    it('处理虚拟副本路径（去除 ?vc= 后缀）', async () => {
      libraryState.multiSelectedPaths = ['/img1.jpg?vc=1'];
      libraryState.imageList = [mockImageFile({ path: '/img1.jpg', exif: null })];
      editorState.selectedImage = null;

      const { result } = renderHook(() => useLibraryActions());

      await act(async () => {
        await result.current.handleUpdateExif(undefined, { Artist: 'Test' });
      });

      expect(invoke).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ paths: ['/img1.jpg'] }),
      );
    });

    it('更新缓存中的图片', async () => {
      libraryState.multiSelectedPaths = ['/img1.jpg'];
      libraryState.imageList = [mockImageFile({ path: '/img1.jpg', exif: null })];
      editorState.selectedImage = null;

      const cachedEntry = { selectedImage: { exif: {} } };
      vi.mocked(globalImageCache.get).mockReturnValue(cachedEntry as any);

      const { result } = renderHook(() => useLibraryActions());

      await act(async () => {
        await result.current.handleUpdateExif(undefined, { Artist: 'Test' });
      });

      expect(globalImageCache.set).toHaveBeenCalled();
    });

    it('invoke 失败时显示错误提示', async () => {
      libraryState.multiSelectedPaths = ['/img1.jpg'];
      libraryState.imageList = [mockImageFile({ path: '/img1.jpg', exif: null })];
      vi.mocked(invoke).mockRejectedValueOnce(new Error('Test error'));

      const { result } = renderHook(() => useLibraryActions());

      await act(async () => {
        await result.current.handleUpdateExif(undefined, { Artist: 'Test' });
      });

      expect(toast.error).toHaveBeenCalled();
    });
  });

  describe('handleClearSelection', () => {
    it('有选中图片时保留当前图片的选择', () => {
      editorState.selectedImage = { path: '/img1.jpg' } as any;

      const { result } = renderHook(() => useLibraryActions());

      act(() => {
        result.current.handleClearSelection();
      });

      expect(libraryState.setLibrary).toHaveBeenCalledWith({
        multiSelectedPaths: ['/img1.jpg'],
      });
    });

    it('没有选中图片时清空选择', () => {
      editorState.selectedImage = null;

      const { result } = renderHook(() => useLibraryActions());

      act(() => {
        result.current.handleClearSelection();
      });

      expect(libraryState.setLibrary).toHaveBeenCalledWith({
        multiSelectedPaths: [],
        libraryActivePath: null,
      });
    });
  });

  describe('handleLibraryImageSingleClick', () => {
    it('单击设置选中状态', () => {
      libraryState.multiSelectedPaths = [];
      libraryState.selectionAnchorPath = null;
      libraryState.libraryActivePath = null;

      const { result } = renderHook(() => useLibraryActions());

      act(() => {
        result.current.handleLibraryImageSingleClick('/img1.jpg', {
          ctrlKey: false,
          metaKey: false,
          shiftKey: false,
        });
      });

      expect(libraryState.setLibrary).toHaveBeenCalled();
    });

    it('Ctrl+单击添加到多选', () => {
      libraryState.multiSelectedPaths = ['/img1.jpg'];
      libraryState.selectionAnchorPath = '/img1.jpg';
      libraryState.libraryActivePath = '/img1.jpg';

      const { result } = renderHook(() => useLibraryActions());

      act(() => {
        result.current.handleLibraryImageSingleClick('/img2.jpg', {
          ctrlKey: true,
          metaKey: false,
          shiftKey: false,
        });
      });

      expect(libraryState.setLibrary).toHaveBeenCalled();
    });

    it('Shift+单击进行范围选择', () => {
      libraryState.multiSelectedPaths = ['/img1.jpg'];
      libraryState.selectionAnchorPath = '/img1.jpg';
      libraryState.libraryActivePath = '/img1.jpg';

      vi.mocked(computeSortedLibrary).mockReturnValue([
        mockImageFile({ path: '/img1.jpg' }),
        mockImageFile({ path: '/img2.jpg' }),
        mockImageFile({ path: '/img3.jpg' }),
      ]);

      const { result } = renderHook(() => useLibraryActions());

      act(() => {
        result.current.handleLibraryImageSingleClick('/img3.jpg', {
          ctrlKey: false,
          metaKey: false,
          shiftKey: true,
        });
      });

      expect(computeSortedLibrary).toHaveBeenCalled();
      expect(libraryState.setLibrary).toHaveBeenCalled();
    });
  });

  describe('handleImageClick', () => {
    it('调用 handleImageSelect 回调', () => {
      const handleImageSelect = vi.fn();
      libraryState.selectionAnchorPath = null;
      libraryState.libraryActivePath = null;

      const { result } = renderHook(() => useLibraryActions(handleImageSelect));

      act(() => {
        result.current.handleImageClick('/img1.jpg', {
          ctrlKey: false,
          metaKey: false,
          shiftKey: false,
        });
      });

      expect(handleImageSelect).toHaveBeenCalledWith('/img1.jpg');
    });

    it('没有 handleImageSelect 回调时不报错', () => {
      libraryState.selectionAnchorPath = null;
      libraryState.libraryActivePath = null;

      const { result } = renderHook(() => useLibraryActions());

      act(() => {
        result.current.handleImageClick('/img1.jpg', {
          ctrlKey: false,
          metaKey: false,
          shiftKey: false,
        });
      });

      expect(libraryState.setLibrary).toHaveBeenCalled();
    });

    it('编辑器中有选中图片时使用其作为 shift 锚点', () => {
      editorState.selectedImage = { path: '/img1.jpg' } as any;
      libraryState.selectionAnchorPath = null;
      libraryState.libraryActivePath = null;

      vi.mocked(computeSortedLibrary).mockReturnValue([
        mockImageFile({ path: '/img1.jpg' }),
        mockImageFile({ path: '/img2.jpg' }),
      ]);

      const { result } = renderHook(() => useLibraryActions());

      act(() => {
        result.current.handleImageClick('/img2.jpg', {
          ctrlKey: false,
          metaKey: false,
          shiftKey: true,
        });
      });

      expect(computeSortedLibrary).toHaveBeenCalled();
    });
  });

  describe('refreshAllFolderTrees', () => {
    it('刷新文件夹树', async () => {
      libraryState.rootPaths = ['/root1'];
      libraryState.expandedFolders = new Set(['/root1/sub']);
      settingsState.appSettings.enableFolderImageCounts = false;
      settingsState.appSettings.pinnedFolders = [];

      vi.mocked(invoke).mockResolvedValueOnce([]);

      const { result } = renderHook(() => useLibraryActions());

      await act(async () => {
        await result.current.refreshAllFolderTrees();
      });

      expect(invoke).toHaveBeenCalled();
      expect(libraryState.setLibrary).toHaveBeenCalled();
    });

    it('刷新固定文件夹树', async () => {
      libraryState.rootPaths = [];
      libraryState.expandedFolders = new Set();
      settingsState.appSettings.pinnedFolders = ['/pinned'];
      settingsState.appSettings.enableFolderImageCounts = true;

      vi.mocked(invoke).mockResolvedValueOnce([]);

      const { result } = renderHook(() => useLibraryActions());

      await act(async () => {
        await result.current.refreshAllFolderTrees();
      });

      expect(invoke).toHaveBeenCalled();
    });

    it('没有 rootPaths 时不调用文件夹树刷新', async () => {
      libraryState.rootPaths = [];
      libraryState.expandedFolders = new Set();
      settingsState.appSettings.pinnedFolders = [];

      const { result } = renderHook(() => useLibraryActions());

      await act(async () => {
        await result.current.refreshAllFolderTrees();
      });

      expect(libraryState.setLibrary).toHaveBeenCalledWith({
        folderTrees: [],
        pinnedFolderTrees: [],
      });
    });

    it('invoke 失败时打印错误', async () => {
      libraryState.rootPaths = ['/root'];
      libraryState.expandedFolders = new Set();
      settingsState.appSettings.pinnedFolders = [];
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(invoke).mockRejectedValueOnce(new Error('Test error'));

      const { result } = renderHook(() => useLibraryActions());

      await act(async () => {
        await result.current.refreshAllFolderTrees();
      });

      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('handleTogglePinFolder', () => {
    it('固定文件夹', async () => {
      settingsState.appSettings.pinnedFolders = [];
      libraryState.expandedFolders = new Set();

      vi.mocked(invoke).mockResolvedValueOnce([]);

      const { result } = renderHook(() => useLibraryActions());

      await act(async () => {
        await result.current.handleTogglePinFolder('/new-folder');
      });

      expect(settingsState.handleSettingsChange).toHaveBeenCalled();
      expect(invoke).toHaveBeenCalled();
    });

    it('取消固定文件夹', async () => {
      settingsState.appSettings.pinnedFolders = ['/folder1', '/folder2'];
      libraryState.expandedFolders = new Set();

      vi.mocked(invoke).mockResolvedValueOnce([]);

      const { result } = renderHook(() => useLibraryActions());

      await act(async () => {
        await result.current.handleTogglePinFolder('/folder1');
      });

      expect(settingsState.handleSettingsChange).toHaveBeenCalled();
      const newSettings = (settingsState.handleSettingsChange as any).mock.calls[0][0];
      expect(newSettings.pinnedFolders).toEqual(['/folder2']);
    });

    it('appSettings 为 null 时直接返回', async () => {
      settingsState.appSettings = null;

      const { result } = renderHook(() => useLibraryActions());

      await act(async () => {
        await result.current.handleTogglePinFolder('/folder');
      });

      expect(settingsState.handleSettingsChange).not.toHaveBeenCalled();
    });

    it('invoke 失败时显示错误提示', async () => {
      settingsState.appSettings.pinnedFolders = [];
      libraryState.expandedFolders = new Set();
      vi.mocked(invoke).mockRejectedValueOnce(new Error('Test error'));

      const { result } = renderHook(() => useLibraryActions());

      await act(async () => {
        await result.current.handleTogglePinFolder('/folder');
      });

      expect(toast.error).toHaveBeenCalled();
    });
  });

  describe('handleCreateAlbumItem', () => {
    beforeEach(() => {
      vi.stubGlobal('crypto', {
        randomUUID: vi.fn().mockReturnValue('test-uuid'),
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('创建相册', async () => {
      libraryState.albumTree = [];
      uiState.albumActionTarget = null;

      vi.mocked(invoke).mockResolvedValueOnce(undefined);
      vi.mocked(invoke).mockResolvedValueOnce([]);

      const { result } = renderHook(() => useLibraryActions());

      await act(async () => {
        await result.current.handleCreateAlbumItem('New Album', 'album');
      });

      expect(invoke).toHaveBeenCalledTimes(2);
      expect(libraryState.setLibrary).toHaveBeenCalled();
    });

    it('创建相册组', async () => {
      libraryState.albumTree = [];
      uiState.albumActionTarget = null;

      vi.mocked(invoke).mockResolvedValueOnce(undefined);
      vi.mocked(invoke).mockResolvedValueOnce([]);

      const { result } = renderHook(() => useLibraryActions());

      await act(async () => {
        await result.current.handleCreateAlbumItem('New Group', 'group');
      });

      expect(invoke).toHaveBeenCalledTimes(2);
    });

    it('在目标组中创建相册', async () => {
      const groupId = 'group-1';
      libraryState.albumTree = [
        { type: 'group', id: groupId, name: 'Group', children: [] } as AlbumGroup,
      ];
      uiState.albumActionTarget = groupId;

      vi.mocked(invoke).mockResolvedValueOnce(undefined);
      vi.mocked(invoke).mockResolvedValueOnce([]);

      const { result } = renderHook(() => useLibraryActions());

      await act(async () => {
        await result.current.handleCreateAlbumItem('New Album', 'album');
      });

      expect(invoke).toHaveBeenCalled();
    });

    it('目标是相册时在其父组中创建', async () => {
      const albumId = 'album-1';
      const groupId = 'group-1';
      libraryState.albumTree = [
        {
          type: 'group',
          id: groupId,
          name: 'Group',
          children: [{ type: 'album', id: albumId, name: 'Album', images: [] }],
        } as AlbumGroup,
      ];
      uiState.albumActionTarget = albumId;

      vi.mocked(invoke).mockResolvedValueOnce(undefined);
      vi.mocked(invoke).mockResolvedValueOnce([]);

      const { result } = renderHook(() => useLibraryActions());

      await act(async () => {
        await result.current.handleCreateAlbumItem('New Album', 'album');
      });

      expect(invoke).toHaveBeenCalled();
    });

    it('invoke 失败时显示错误提示', async () => {
      libraryState.albumTree = [];
      uiState.albumActionTarget = null;
      vi.mocked(invoke).mockRejectedValueOnce(new Error('Test error'));

      const { result } = renderHook(() => useLibraryActions());

      await act(async () => {
        await result.current.handleCreateAlbumItem('New Album', 'album');
      });

      expect(toast.error).toHaveBeenCalled();
    });
  });

  describe('handleRenameAlbumItem', () => {
    it('重命名相册项目', async () => {
      const albumId = 'album-1';
      libraryState.albumTree = [
        { type: 'album', id: albumId, name: 'Old Name', images: [] } as Album,
      ];
      uiState.albumActionTarget = albumId;

      vi.mocked(invoke).mockResolvedValueOnce(undefined);
      vi.mocked(invoke).mockResolvedValueOnce([]);

      const { result } = renderHook(() => useLibraryActions());

      await act(async () => {
        await result.current.handleRenameAlbumItem('New Name');
      });

      expect(invoke).toHaveBeenCalledTimes(2);
      expect(libraryState.setLibrary).toHaveBeenCalled();
    });

    it('重命名嵌套组中的相册', async () => {
      const albumId = 'album-1';
      libraryState.albumTree = [
        {
          type: 'group',
          id: 'group-1',
          name: 'Group',
          children: [{ type: 'album', id: albumId, name: 'Old Name', images: [] }],
        } as AlbumGroup,
      ];
      uiState.albumActionTarget = albumId;

      vi.mocked(invoke).mockResolvedValueOnce(undefined);
      vi.mocked(invoke).mockResolvedValueOnce([]);

      const { result } = renderHook(() => useLibraryActions());

      await act(async () => {
        await result.current.handleRenameAlbumItem('New Name');
      });

      expect(invoke).toHaveBeenCalled();
    });

    it('没有 albumActionTarget 时直接返回', async () => {
      uiState.albumActionTarget = null;

      const { result } = renderHook(() => useLibraryActions());

      await act(async () => {
        await result.current.handleRenameAlbumItem('New Name');
      });

      expect(invoke).not.toHaveBeenCalled();
    });

    it('invoke 失败时显示错误提示', async () => {
      const albumId = 'album-1';
      libraryState.albumTree = [
        { type: 'album', id: albumId, name: 'Old Name', images: [] } as Album,
      ];
      uiState.albumActionTarget = albumId;
      vi.mocked(invoke).mockRejectedValueOnce(new Error('Test error'));

      const { result } = renderHook(() => useLibraryActions());

      await act(async () => {
        await result.current.handleRenameAlbumItem('New Name');
      });

      expect(toast.error).toHaveBeenCalled();
    });
  });

  describe('多选操作', () => {
    it('Ctrl+单击取消已选中的图片', () => {
      libraryState.multiSelectedPaths = ['/img1.jpg', '/img2.jpg'];
      libraryState.selectionAnchorPath = '/img1.jpg';
      libraryState.libraryActivePath = '/img1.jpg';

      const { result } = renderHook(() => useLibraryActions());

      act(() => {
        result.current.handleLibraryImageSingleClick('/img1.jpg', {
          ctrlKey: true,
          metaKey: false,
          shiftKey: false,
        });
      });

      expect(libraryState.setLibrary).toHaveBeenCalled();
    });

    it('取消选择所有图片后 libraryActivePath 设为 null', () => {
      libraryState.multiSelectedPaths = ['/img1.jpg'];
      libraryState.selectionAnchorPath = '/img1.jpg';
      libraryState.libraryActivePath = '/img1.jpg';

      const { result } = renderHook(() => useLibraryActions());

      act(() => {
        result.current.handleLibraryImageSingleClick('/img1.jpg', {
          ctrlKey: true,
          metaKey: false,
          shiftKey: false,
        });
      });

      expect(libraryState.setLibrary).toHaveBeenCalled();
    });
  });

  describe('边界情况', () => {
    it('handleRate 空 paths 数组不做操作', () => {
      const { result } = renderHook(() => useLibraryActions());

      act(() => {
        result.current.handleRate(5, []);
      });

      expect(libraryState.setLibrary).not.toHaveBeenCalled();
    });

    it('handleSetColorLabel 空 paths 数组不做操作', async () => {
      const { result } = renderHook(() => useLibraryActions());

      await act(async () => {
        await result.current.handleSetColorLabel('red', []);
      });

      expect(invoke).not.toHaveBeenCalled();
    });

    it('handleUpdateExif 空 paths 数组不做操作', async () => {
      const { result } = renderHook(() => useLibraryActions());

      await act(async () => {
        await result.current.handleUpdateExif([], { Artist: 'Test' });
      });

      expect(invoke).not.toHaveBeenCalled();
    });

    it('handleTagsChanged 空 changedPaths 数组不报错', () => {
      libraryState.imageList = [];

      const { result } = renderHook(() => useLibraryActions());

      act(() => {
        result.current.handleTagsChanged([], [{ tag: 'test', isUser: false }]);
      });

      expect(libraryState.setLibrary).toHaveBeenCalled();
    });
  });
});
