import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useFileOperations } from '../useFileOperations';
import { Invokes, ImageFile } from '../../components/ui/AppProperties';
import { Status } from '../../components/ui/ExportImportProperties';
import { useLibraryStore } from '../../store/useLibraryStore';
import { useEditorStore } from '../../store/useEditorStore';
import { useUIStore } from '../../store/useUIStore';
import { useProcessStore } from '../../store/useProcessStore';
import { useSettingsStore } from '../../store/useSettingsStore';

const mockInvoke = vi.hoisted(() => vi.fn());
const mockOpen = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: any[]) => mockInvoke(...args),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: (...args: any[]) => mockOpen(...args),
}));

vi.mock('react-toastify', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
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

vi.mock('../../store/useProcessStore', () => ({
  useProcessStore: vi.fn(),
}));

vi.mock('../../store/useSettingsStore', () => ({
  useSettingsStore: vi.fn(),
}));

import { toast } from 'react-toastify';

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
    albumTree: [] as any[],
    activeAlbumId: null,
    expandedAlbumGroups: new Set<string>(),
    imageList: [] as ImageFile[],
    imageRatings: {} as Record<string, number>,
    multiSelectedPaths: [] as string[],
    selectionAnchorPath: null as string | null,
    libraryActivePath: null as string | null,
    libraryActiveAdjustments: {} as any,
    sortCriteria: { key: 'name', order: 'asc' },
    filterCriteria: { colors: [], rating: 0, rawStatus: 'all' },
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
  renameTargetPaths: [] as string[],
  isImportModalOpen: false,
  isCopyPasteSettingsModalOpen: false,
  importTargetFolder: null as string | null,
  importSourcePaths: [] as string[],
  folderActionTarget: null as string | null,
  isCreateAlbumModalOpen: false,
  isCreateAlbumGroupModalOpen: false,
  isRenameAlbumModalOpen: false,
  albumActionTarget: null,
  isConfigurePresetModalOpen: false,
  isLensCorrectionModalOpen: false,
  isTransformModalOpen: false,
  confirmModalState: { isOpen: false } as any,
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

const createProcessState = (overrides: any = {}) => ({
  exportState: { errorMessage: '', progress: { current: 0, total: 0 }, status: Status.Idle },
  importState: { errorMessage: '', path: '', progress: { current: 0, total: 0 }, status: Status.Idle },
  isIndexing: false,
  indexingProgress: { current: 0, total: 0 },
  thumbnails: {},
  thumbnailProgress: { current: 0, total: 0 },
  aiModelDownloadStatus: null,
  copiedFilePaths: [] as string[],
  isCopied: false,
  isPasted: false,
  initialFileToOpen: null,
  externalEditSession: null,
  setProcess: vi.fn((updater: any) => {}),
  setExportState: vi.fn(),
  setImportState: vi.fn(),
  ...overrides,
});

const createSettingsState = (overrides: any = {}) => ({
  appSettings: {
    pinnedFolders: [],
    enableFolderImageCounts: false,
    rootFolders: [],
  } as any,
  theme: 'default',
  supportedTypes: {
    raw: ['cr2', 'nef', 'arw'],
    nonRaw: ['jpg', 'jpeg', 'png'],
  },
  osPlatform: 'linux',
  initPlatform: vi.fn(),
  isAndroid: vi.fn(() => false),
  setAppSettings: vi.fn(),
  setTheme: vi.fn(),
  setSupportedTypes: vi.fn(),
  handleSettingsChange: vi.fn(async () => {}),
  ...overrides,
});

describe('useFileOperations', () => {
  let libraryState: ReturnType<typeof createLibraryState>;
  let editorState: ReturnType<typeof createEditorState>;
  let uiState: ReturnType<typeof createUIState>;
  let processState: ReturnType<typeof createProcessState>;
  let settingsState: ReturnType<typeof createSettingsState>;

  const mockRefreshImageList = vi.fn();
  const mockRefreshAllFolderTrees = vi.fn();
  const mockHandleImageSelect = vi.fn();
  const mockHandleBackToLibrary = vi.fn();

  const sortedImageList: ImageFile[] = [];

  const renderFileOperationsHook = () => {
    return renderHook(() =>
      useFileOperations(
        mockRefreshImageList,
        mockRefreshAllFolderTrees,
        mockHandleImageSelect,
        mockHandleBackToLibrary,
        sortedImageList,
      ),
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(undefined);
    mockOpen.mockReset();
    mockOpen.mockResolvedValue(null);
    mockRefreshImageList.mockReset();
    mockRefreshImageList.mockResolvedValue(undefined);
    mockRefreshAllFolderTrees.mockReset();
    mockRefreshAllFolderTrees.mockResolvedValue(undefined);
    mockHandleImageSelect.mockReset();
    mockHandleBackToLibrary.mockReset();

    libraryState = createLibraryState();
    editorState = createEditorState();
    uiState = createUIState();
    processState = createProcessState();
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

    vi.mocked(useProcessStore).mockImplementation((selector: any) => {
      if (typeof selector === 'function') return selector(processState);
      return processState;
    });
    (useProcessStore as any).getState = () => processState;

    vi.mocked(useSettingsStore).mockImplementation((selector: any) => {
      if (typeof selector === 'function') return selector(settingsState);
      return settingsState;
    });
    (useSettingsStore as any).getState = () => settingsState;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('hook 返回值结构', () => {
    it('返回一个包含所有操作函数的对象', () => {
      const { result } = renderFileOperationsHook();

      expect(typeof result.current).toBe('object');
      expect(result.current).toHaveProperty('executeDelete');
      expect(result.current).toHaveProperty('handleDeleteSelected');
      expect(result.current).toHaveProperty('handleCreateFolder');
      expect(result.current).toHaveProperty('handleRenameFolder');
      expect(result.current).toHaveProperty('handleSaveRename');
      expect(result.current).toHaveProperty('handleRenameFiles');
      expect(result.current).toHaveProperty('handleStartImport');
      expect(result.current).toHaveProperty('startImportFiles');
      expect(result.current).toHaveProperty('handleImportClick');
      expect(result.current).toHaveProperty('handlePasteFiles');
    });

    it('所有返回值都是函数', () => {
      const { result } = renderFileOperationsHook();

      expect(typeof result.current.executeDelete).toBe('function');
      expect(typeof result.current.handleDeleteSelected).toBe('function');
      expect(typeof result.current.handleCreateFolder).toBe('function');
      expect(typeof result.current.handleRenameFolder).toBe('function');
      expect(typeof result.current.handleSaveRename).toBe('function');
      expect(typeof result.current.handleRenameFiles).toBe('function');
      expect(typeof result.current.handleStartImport).toBe('function');
      expect(typeof result.current.startImportFiles).toBe('function');
      expect(typeof result.current.handleImportClick).toBe('function');
      expect(typeof result.current.handlePasteFiles).toBe('function');
    });
  });

  describe('executeDelete - 文件删除', () => {
    it('空路径数组时直接返回不执行操作', async () => {
      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.executeDelete([]);
      });

      expect(mockInvoke).not.toHaveBeenCalled();
      expect(mockRefreshImageList).not.toHaveBeenCalled();
    });

    it('pathsToDelete 为 null/undefined 时直接返回', async () => {
      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.executeDelete(null as any);
      });

      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('成功删除单张图片（库视图）', async () => {
      libraryState.libraryActivePath = '/test/img1.jpg';
      libraryState.multiSelectedPaths = ['/test/img1.jpg'];

      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.executeDelete(['/test/img1.jpg']);
      });

      expect(mockInvoke).toHaveBeenCalledWith('delete_files_from_disk', {
        paths: ['/test/img1.jpg'],
      });
      expect(mockRefreshImageList).toHaveBeenCalled();
    });

    it('成功删除多张图片', async () => {
      libraryState.libraryActivePath = '/test/img2.jpg';

      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.executeDelete(['/test/img1.jpg', '/test/img3.jpg']);
      });

      expect(mockInvoke).toHaveBeenCalledWith('delete_files_from_disk', {
        paths: ['/test/img1.jpg', '/test/img3.jpg'],
      });
      expect(mockRefreshImageList).toHaveBeenCalled();
    });

    it('includeAssociated 为 true 时调用 delete_files_with_associated', async () => {
      libraryState.libraryActivePath = '/test/img1.jpg';

      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.executeDelete(['/test/img1.jpg'], { includeAssociated: true });
      });

      expect(mockInvoke).toHaveBeenCalledWith('delete_files_with_associated', {
        paths: ['/test/img1.jpg'],
      });
    });

    it('删除当前选中图片时选择下一张图片', async () => {
      const sortedList = [
        mockImageFile({ path: '/test/img1.jpg' }),
        mockImageFile({ path: '/test/img2.jpg' }),
        mockImageFile({ path: '/test/img3.jpg' }),
      ];
      libraryState.libraryActivePath = '/test/img2.jpg';

      const { result } = renderHook(() =>
        useFileOperations(
          mockRefreshImageList,
          mockRefreshAllFolderTrees,
          mockHandleImageSelect,
          mockHandleBackToLibrary,
          sortedList,
        ),
      );

      await act(async () => {
        await result.current.executeDelete(['/test/img2.jpg']);
      });

      expect(libraryState.setLibrary).toHaveBeenCalledWith(
        expect.objectContaining({
          multiSelectedPaths: ['/test/img3.jpg'],
          libraryActivePath: '/test/img3.jpg',
        }),
      );
    });

    it('删除最后一张图片时选择上一张图片', async () => {
      const sortedList = [
        mockImageFile({ path: '/test/img1.jpg' }),
        mockImageFile({ path: '/test/img2.jpg' }),
        mockImageFile({ path: '/test/img3.jpg' }),
      ];
      libraryState.libraryActivePath = '/test/img3.jpg';

      const { result } = renderHook(() =>
        useFileOperations(
          mockRefreshImageList,
          mockRefreshAllFolderTrees,
          mockHandleImageSelect,
          mockHandleBackToLibrary,
          sortedList,
        ),
      );

      await act(async () => {
        await result.current.executeDelete(['/test/img3.jpg']);
      });

      expect(libraryState.setLibrary).toHaveBeenCalledWith(
        expect.objectContaining({
          multiSelectedPaths: ['/test/img2.jpg'],
          libraryActivePath: '/test/img2.jpg',
        }),
      );
    });

    it('删除所有图片后清空选择', async () => {
      const sortedList = [mockImageFile({ path: '/test/img1.jpg' })];
      libraryState.libraryActivePath = '/test/img1.jpg';

      const { result } = renderHook(() =>
        useFileOperations(
          mockRefreshImageList,
          mockRefreshAllFolderTrees,
          mockHandleImageSelect,
          mockHandleBackToLibrary,
          sortedList,
        ),
      );

      await act(async () => {
        await result.current.executeDelete(['/test/img1.jpg']);
      });

      expect(libraryState.setLibrary).toHaveBeenCalledWith(
        expect.objectContaining({
          multiSelectedPaths: [],
          libraryActivePath: null,
        }),
      );
    });

    it('编辑器中删除当前编辑的图片时切换到下一张', async () => {
      const sortedList = [mockImageFile({ path: '/test/img1.jpg' }), mockImageFile({ path: '/test/img2.jpg' })];
      editorState.selectedImage = { path: '/test/img1.jpg' } as any;

      const { result } = renderHook(() =>
        useFileOperations(
          mockRefreshImageList,
          mockRefreshAllFolderTrees,
          mockHandleImageSelect,
          mockHandleBackToLibrary,
          sortedList,
        ),
      );

      await act(async () => {
        await result.current.executeDelete(['/test/img1.jpg']);
      });

      expect(mockHandleImageSelect).toHaveBeenCalledWith('/test/img2.jpg');
    });

    it('编辑器中删除最后一张图片时返回图库', async () => {
      const sortedList = [mockImageFile({ path: '/test/img1.jpg' })];
      editorState.selectedImage = { path: '/test/img1.jpg' } as any;

      const { result } = renderHook(() =>
        useFileOperations(
          mockRefreshImageList,
          mockRefreshAllFolderTrees,
          mockHandleImageSelect,
          mockHandleBackToLibrary,
          sortedList,
        ),
      );

      await act(async () => {
        await result.current.executeDelete(['/test/img1.jpg']);
      });

      expect(mockHandleBackToLibrary).toHaveBeenCalled();
    });

    it('处理带虚拟副本路径的删除（?vc= 后缀）', async () => {
      editorState.selectedImage = { path: '/test/img1.jpg?vc=1' } as any;
      libraryState.libraryActivePath = '/test/img1.jpg?vc=1';

      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.executeDelete(['/test/img1.jpg']);
      });

      expect(mockInvoke).toHaveBeenCalled();
      expect(mockHandleBackToLibrary).toHaveBeenCalled();
    });

    it('删除失败时显示错误提示', async () => {
      libraryState.libraryActivePath = '/test/img1.jpg';
      mockInvoke.mockRejectedValueOnce(new Error('Delete failed'));
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.executeDelete(['/test/img1.jpg']);
      });

      expect(toast.error).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('未删除活动图片时保留活动路径不变', async () => {
      libraryState.libraryActivePath = '/test/img2.jpg';

      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.executeDelete(['/test/img1.jpg']);
      });

      expect(libraryState.setLibrary).toHaveBeenCalledWith(
        expect.objectContaining({
          multiSelectedPaths: ['/test/img2.jpg'],
          libraryActivePath: '/test/img2.jpg',
        }),
      );
    });
  });

  describe('handleDeleteSelected - 删除选中项', () => {
    it('没有选中项时直接返回', () => {
      libraryState.multiSelectedPaths = [];

      const { result } = renderFileOperationsHook();

      act(() => {
        result.current.handleDeleteSelected();
      });

      expect(uiState.setUI).not.toHaveBeenCalled();
    });

    it('单张图片删除时显示确认对话框', () => {
      libraryState.multiSelectedPaths = ['/test/img1.jpg'];
      libraryState.imageList = [mockImageFile({ path: '/test/img1.jpg' })];

      const { result } = renderFileOperationsHook();

      act(() => {
        result.current.handleDeleteSelected();
      });

      expect(uiState.setUI).toHaveBeenCalled();
      const callArg = (uiState.setUI as any).mock.calls[0][0];
      expect(callArg.confirmModalState.isOpen).toBe(true);
      expect(callArg.confirmModalState.title).toBe('Confirm Delete');
      expect(callArg.confirmModalState.confirmText).toBe('Delete Selected Only');
    });

    it('多张图片删除时显示确认对话框', () => {
      libraryState.multiSelectedPaths = ['/test/img1.jpg', '/test/img2.jpg'];

      const { result } = renderFileOperationsHook();

      act(() => {
        result.current.handleDeleteSelected();
      });

      expect(uiState.setUI).toHaveBeenCalled();
      const callArg = (uiState.setUI as any).mock.calls[0][0];
      expect(callArg.confirmModalState.message).toContain('2 images');
    });

    it('有虚拟副本时显示特殊确认对话框', () => {
      libraryState.multiSelectedPaths = ['/test/img1.jpg'];
      libraryState.imageList = [
        mockImageFile({ path: '/test/img1.jpg' }),
        mockImageFile({ path: '/test/img1.jpg?vc=1' }),
      ];

      const { result } = renderFileOperationsHook();

      act(() => {
        result.current.handleDeleteSelected();
      });

      const callArg = (uiState.setUI as any).mock.calls[0][0];
      expect(callArg.confirmModalState.title).toBe('Delete Image and All Virtual Copies?');
      expect(callArg.confirmModalState.confirmText).toBe('Delete All');
    });

    it('确认后调用 executeDelete', () => {
      libraryState.multiSelectedPaths = ['/test/img1.jpg'];
      libraryState.imageList = [mockImageFile({ path: '/test/img1.jpg' })];

      const { result } = renderFileOperationsHook();

      act(() => {
        result.current.handleDeleteSelected();
      });

      const callArg = (uiState.setUI as any).mock.calls[0][0];
      expect(typeof callArg.confirmModalState.onConfirm).toBe('function');

      act(() => {
        callArg.confirmModalState.onConfirm();
      });

      expect(mockInvoke).toHaveBeenCalled();
    });
  });

  describe('handleCreateFolder - 创建文件夹', () => {
    it('成功创建文件夹', async () => {
      uiState.folderActionTarget = '/test/parent';

      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.handleCreateFolder('New Folder');
      });

      expect(mockInvoke).toHaveBeenCalledWith(Invokes.CreateFolder, {
        path: '/test/parent/New Folder',
      });
      expect(mockRefreshAllFolderTrees).toHaveBeenCalled();
    });

    it('文件夹名去除首尾空格', async () => {
      uiState.folderActionTarget = '/test/parent';

      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.handleCreateFolder('  Trimmed  ');
      });

      expect(mockInvoke).toHaveBeenCalledWith(Invokes.CreateFolder, {
        path: '/test/parent/Trimmed',
      });
    });

    it('空文件夹名不创建', async () => {
      uiState.folderActionTarget = '/test/parent';

      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.handleCreateFolder('');
      });

      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('只有空格的文件夹名不创建', async () => {
      uiState.folderActionTarget = '/test/parent';

      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.handleCreateFolder('   ');
      });

      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('没有 folderActionTarget 时不创建', async () => {
      uiState.folderActionTarget = null;

      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.handleCreateFolder('New Folder');
      });

      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('创建失败时显示错误提示', async () => {
      uiState.folderActionTarget = '/test/parent';
      mockInvoke.mockRejectedValueOnce(new Error('Create failed'));

      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.handleCreateFolder('New Folder');
      });

      expect(toast.error).toHaveBeenCalled();
    });
  });

  describe('handleRenameFolder - 重命名文件夹', () => {
    it('成功重命名文件夹', async () => {
      uiState.folderActionTarget = '/test/oldname';

      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.handleRenameFolder('newname');
      });

      expect(mockInvoke).toHaveBeenCalledWith(Invokes.RenameFolder, {
        path: '/test/oldname',
        newName: 'newname',
      });
      expect(mockRefreshAllFolderTrees).toHaveBeenCalled();
    });

    it('重命名后更新 rootPaths', async () => {
      uiState.folderActionTarget = '/test/oldroot';
      libraryState.rootPaths = ['/test/oldroot', '/other/root'];

      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.handleRenameFolder('newroot');
      });

      expect(libraryState.setLibrary).toHaveBeenCalledWith(
        expect.objectContaining({
          rootPaths: ['/test/newroot', '/other/root'],
        }),
      );
      expect(settingsState.handleSettingsChange).toHaveBeenCalled();
    });

    it('重命名后更新 currentFolderPath', async () => {
      uiState.folderActionTarget = '/test/oldfolder';
      libraryState.currentFolderPath = '/test/oldfolder/subfolder';

      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.handleRenameFolder('newfolder');
      });

      expect(libraryState.setLibrary).toHaveBeenCalledWith(
        expect.objectContaining({
          currentFolderPath: '/test/newfolder/subfolder',
        }),
      );
    });

    it('重命名后更新 pinnedFolders', async () => {
      uiState.folderActionTarget = '/test/oldpinned';
      settingsState.appSettings.pinnedFolders = ['/test/oldpinned', '/other/pinned'];

      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.handleRenameFolder('newpinned');
      });

      expect(settingsState.handleSettingsChange).toHaveBeenCalled();
      const newSettings = (settingsState.handleSettingsChange as any).mock.calls[0][0];
      expect(newSettings.pinnedFolders).toContain('/test/newpinned');
      expect(newSettings.pinnedFolders).toContain('/other/pinned');
    });

    it('新名称去除首尾空格', async () => {
      uiState.folderActionTarget = '/test/oldname';

      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.handleRenameFolder('  trimmed  ');
      });

      expect(mockInvoke).toHaveBeenCalledWith(Invokes.RenameFolder, {
        path: '/test/oldname',
        newName: 'trimmed',
      });
    });

    it('空名称不执行重命名', async () => {
      uiState.folderActionTarget = '/test/oldname';

      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.handleRenameFolder('');
      });

      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('只有空格的名称不执行重命名', async () => {
      uiState.folderActionTarget = '/test/oldname';

      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.handleRenameFolder('   ');
      });

      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('没有 folderActionTarget 时不重命名', async () => {
      uiState.folderActionTarget = null;

      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.handleRenameFolder('newname');
      });

      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('重命名失败时显示错误提示', async () => {
      uiState.folderActionTarget = '/test/oldname';
      mockInvoke.mockRejectedValueOnce(new Error('Rename failed'));

      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.handleRenameFolder('newname');
      });

      expect(toast.error).toHaveBeenCalled();
    });
  });

  describe('handleSaveRename - 保存重命名', () => {
    it('成功重命名文件', async () => {
      uiState.renameTargetPaths = ['/test/old.jpg'];
      mockInvoke.mockResolvedValueOnce(['/test/new.jpg']);

      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.handleSaveRename('new_{index:000}');
      });

      expect(mockInvoke).toHaveBeenCalledWith(Invokes.RenameFiles, {
        nameTemplate: 'new_{index:000}',
        paths: ['/test/old.jpg'],
      });
      expect(mockRefreshImageList).toHaveBeenCalled();
      expect(uiState.setUI).toHaveBeenCalledWith({ renameTargetPaths: [] });
    });

    it('批量重命名文件', async () => {
      uiState.renameTargetPaths = ['/test/img1.jpg', '/test/img2.jpg'];
      mockInvoke.mockResolvedValueOnce(['/test/new1.jpg', '/test/new2.jpg']);

      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.handleSaveRename('new_{index:000}');
      });

      expect(mockInvoke).toHaveBeenCalledWith(Invokes.RenameFiles, {
        nameTemplate: 'new_{index:000}',
        paths: ['/test/img1.jpg', '/test/img2.jpg'],
      });
      expect(libraryState.setLibrary).toHaveBeenCalledWith({
        multiSelectedPaths: ['/test/new1.jpg', '/test/new2.jpg'],
      });
    });

    it('重命名当前编辑的图片时切换到新路径', async () => {
      uiState.renameTargetPaths = ['/test/old.jpg'];
      editorState.selectedImage = { path: '/test/old.jpg' } as any;
      mockInvoke.mockResolvedValueOnce(['/test/new.jpg']);

      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.handleSaveRename('new_{index:000}');
      });

      expect(mockHandleImageSelect).toHaveBeenCalledWith('/test/new.jpg');
    });

    it('重命名 libraryActivePath 时更新活动路径', async () => {
      uiState.renameTargetPaths = ['/test/old.jpg'];
      libraryState.libraryActivePath = '/test/old.jpg';
      mockInvoke.mockResolvedValueOnce(['/test/new.jpg']);

      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.handleSaveRename('new_{index:000}');
      });

      expect(libraryState.setLibrary).toHaveBeenCalledWith({
        libraryActivePath: '/test/new.jpg',
      });
    });

    it('重命名后新路径不存在时返回图库', async () => {
      uiState.renameTargetPaths = ['/test/old.jpg'];
      editorState.selectedImage = { path: '/test/old.jpg' } as any;
      mockInvoke.mockResolvedValueOnce([null]);

      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.handleSaveRename('new_{index:000}');
      });

      expect(mockHandleBackToLibrary).toHaveBeenCalled();
    });

    it('空 renameTargetPaths 时只清空状态', async () => {
      uiState.renameTargetPaths = [];

      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.handleSaveRename('template');
      });

      expect(mockInvoke).not.toHaveBeenCalled();
      expect(uiState.setUI).toHaveBeenCalledWith({ renameTargetPaths: [] });
    });

    it('空 nameTemplate 时不执行重命名', async () => {
      uiState.renameTargetPaths = ['/test/old.jpg'];

      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.handleSaveRename('');
      });

      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('重命名失败时显示错误提示', async () => {
      uiState.renameTargetPaths = ['/test/old.jpg'];
      mockInvoke.mockRejectedValueOnce(new Error('Rename failed'));

      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.handleSaveRename('newname');
      });

      expect(toast.error).toHaveBeenCalled();
    });
  });

  describe('handleRenameFiles - 触发重命名对话框', () => {
    it('设置重命名目标路径并打开对话框', () => {
      const { result } = renderFileOperationsHook();

      act(() => {
        result.current.handleRenameFiles(['/test/img1.jpg', '/test/img2.jpg']);
      });

      expect(uiState.setUI).toHaveBeenCalledWith({
        renameTargetPaths: ['/test/img1.jpg', '/test/img2.jpg'],
        isRenameFileModalOpen: true,
      });
    });

    it('空路径数组不打开对话框', () => {
      const { result } = renderFileOperationsHook();

      act(() => {
        result.current.handleRenameFiles([]);
      });

      expect(uiState.setUI).not.toHaveBeenCalled();
    });

    it('null/undefined 路径不打开对话框', () => {
      const { result } = renderFileOperationsHook();

      act(() => {
        result.current.handleRenameFiles(null as any);
      });

      expect(uiState.setUI).not.toHaveBeenCalled();
    });
  });

  describe('startImportFiles - 开始导入文件', () => {
    it('成功开始导入', async () => {
      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.startImportFiles(['/source/img1.jpg', '/source/img2.jpg'], '/dest/folder', {
          someSetting: true,
        });
      });

      expect(mockInvoke).toHaveBeenCalledWith(Invokes.ImportFiles, {
        destinationFolder: '/dest/folder',
        settings: { someSetting: true },
        sourcePaths: ['/source/img1.jpg', '/source/img2.jpg'],
      });
    });

    it('空 sourcePaths 时不导入', async () => {
      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.startImportFiles([], '/dest/folder', {});
      });

      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('空 destinationFolder 时不导入', async () => {
      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.startImportFiles(['/img.jpg'], '', {});
      });

      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('导入失败时设置错误状态', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('Import failed'));
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.startImportFiles(['/img.jpg'], '/dest', {});
      });

      expect(processState.setImportState).toHaveBeenCalled();
      const callArg = (processState.setImportState as any).mock.calls[0][0];
      expect(callArg.status).toBe(Status.Error);
      expect(callArg.errorMessage).toContain('Import failed');
      consoleErrorSpy.mockRestore();
    });
  });

  describe('handleStartImport - 从 UI 状态开始导入', () => {
    it('从 UI 状态获取参数并开始导入', async () => {
      uiState.importTargetFolder = '/dest/folder';
      uiState.importSourcePaths = ['/source/img1.jpg'];

      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.handleStartImport({ setting: 'value' });
      });

      expect(mockInvoke).toHaveBeenCalledWith(Invokes.ImportFiles, {
        destinationFolder: '/dest/folder',
        settings: { setting: 'value' },
        sourcePaths: ['/source/img1.jpg'],
      });
    });

    it('没有 importTargetFolder 时不导入', async () => {
      uiState.importTargetFolder = null;

      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.handleStartImport({});
      });

      expect(mockInvoke).not.toHaveBeenCalled();
    });
  });

  describe('handleImportClick - 导入点击', () => {
    it('打开文件选择对话框', async () => {
      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.handleImportClick('/target/folder');
      });

      expect(mockOpen).toHaveBeenCalled();
    });

    it('选择有效文件后打开导入对话框', async () => {
      mockOpen.mockResolvedValueOnce(['/source/img1.jpg', '/source/img2.png']);

      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.handleImportClick('/target/folder');
      });

      expect(uiState.setUI).toHaveBeenCalledWith(
        expect.objectContaining({
          importSourcePaths: ['/source/img1.jpg', '/source/img2.png'],
          importTargetFolder: '/target/folder',
          isImportModalOpen: true,
        }),
      );
    });

    it('选择不受支持的文件时显示错误', async () => {
      mockOpen.mockResolvedValueOnce(['/source/file.txt']);

      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.handleImportClick('/target/folder');
      });

      expect(toast.error).toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Unsupported file format'));
    });

    it('混合有效和无效文件时显示错误并不导入', async () => {
      mockOpen.mockResolvedValueOnce(['/source/img.jpg', '/source/file.txt']);

      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.handleImportClick('/target/folder');
      });

      expect(toast.error).toHaveBeenCalled();
      expect(uiState.setUI).not.toHaveBeenCalledWith(expect.objectContaining({ isImportModalOpen: true }));
    });

    it('选择 null 时不做任何操作', async () => {
      mockOpen.mockResolvedValueOnce(null);

      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.handleImportClick('/target/folder');
      });

      expect(uiState.setUI).not.toHaveBeenCalled();
    });

    it('空数组时不做任何操作', async () => {
      mockOpen.mockResolvedValueOnce([]);

      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.handleImportClick('/target/folder');
      });

      expect(uiState.setUI).not.toHaveBeenCalled();
    });

    it('Android 平台上直接开始导入', async () => {
      settingsState.osPlatform = 'android';
      mockOpen.mockResolvedValueOnce(['content://media/img1.jpg']);
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'resolve_android_content_uri_name') {
          return Promise.resolve('img1.jpg');
        }
        return Promise.resolve();
      });

      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.handleImportClick('/target/folder');
      });

      expect(mockInvoke).toHaveBeenCalledWith(Invokes.ImportFiles, expect.anything());
    });

    it('Android 上解析 URI 失败时使用原路径', async () => {
      settingsState.osPlatform = 'android';
      mockOpen.mockResolvedValueOnce(['content://media/img1.jpg']);
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'resolve_android_content_uri_name') {
          return Promise.reject(new Error('Resolve failed'));
        }
        return Promise.resolve();
      });
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.handleImportClick('/target/folder');
      });

      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('对话框打开失败时记录错误', async () => {
      mockOpen.mockRejectedValueOnce(new Error('Dialog failed'));
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.handleImportClick('/target/folder');
      });

      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('handlePasteFiles - 粘贴文件', () => {
    it('成功复制文件', async () => {
      processState.copiedFilePaths = ['/source/img1.jpg', '/source/img2.jpg'];
      libraryState.currentFolderPath = '/dest/folder';

      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.handlePasteFiles('copy');
      });

      expect(mockInvoke).toHaveBeenCalledWith(Invokes.CopyFiles, {
        sourcePaths: ['/source/img1.jpg', '/source/img2.jpg'],
        destinationFolder: '/dest/folder',
      });
      expect(mockRefreshImageList).toHaveBeenCalled();
    });

    it('成功移动文件', async () => {
      processState.copiedFilePaths = ['/source/img1.jpg'];
      libraryState.currentFolderPath = '/dest/folder';

      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.handlePasteFiles('move');
      });

      expect(mockInvoke).toHaveBeenCalledWith(Invokes.MoveFiles, {
        sourcePaths: ['/source/img1.jpg'],
        destinationFolder: '/dest/folder',
      });
      expect(processState.setProcess).toHaveBeenCalledWith({ copiedFilePaths: [] });
      expect(libraryState.setLibrary).toHaveBeenCalledWith({ multiSelectedPaths: [] });
      expect(mockRefreshAllFolderTrees).toHaveBeenCalled();
      expect(mockRefreshImageList).toHaveBeenCalled();
    });

    it('默认模式为 copy', async () => {
      processState.copiedFilePaths = ['/source/img1.jpg'];
      libraryState.currentFolderPath = '/dest/folder';

      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.handlePasteFiles();
      });

      expect(mockInvoke).toHaveBeenCalledWith(Invokes.CopyFiles, expect.anything());
    });

    it('空 copiedFilePaths 时不粘贴', async () => {
      processState.copiedFilePaths = [];
      libraryState.currentFolderPath = '/dest/folder';

      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.handlePasteFiles('copy');
      });

      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('没有 currentFolderPath 时不粘贴', async () => {
      processState.copiedFilePaths = ['/source/img1.jpg'];
      libraryState.currentFolderPath = null;

      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.handlePasteFiles('copy');
      });

      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('粘贴失败时显示错误提示', async () => {
      processState.copiedFilePaths = ['/source/img1.jpg'];
      libraryState.currentFolderPath = '/dest/folder';
      mockInvoke.mockRejectedValueOnce(new Error('Paste failed'));

      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.handlePasteFiles('copy');
      });

      expect(toast.error).toHaveBeenCalled();
    });
  });

  describe('错误处理', () => {
    it('executeDelete 错误时记录 console.error', async () => {
      libraryState.libraryActivePath = '/test/img1.jpg';
      mockInvoke.mockRejectedValueOnce(new Error('Test error'));
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.executeDelete(['/test/img1.jpg']);
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to delete files:', expect.any(Error));
      consoleErrorSpy.mockRestore();
    });

    it('handleCreateFolder 错误时显示 toast 错误', async () => {
      uiState.folderActionTarget = '/test/parent';
      mockInvoke.mockRejectedValueOnce(new Error('Create error'));

      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.handleCreateFolder('folder');
      });

      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Failed to create folder'));
    });

    it('handleRenameFolder 错误时显示 toast 错误', async () => {
      uiState.folderActionTarget = '/test/old';
      mockInvoke.mockRejectedValueOnce(new Error('Rename error'));

      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.handleRenameFolder('new');
      });

      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Failed to rename folder'));
    });

    it('handleSaveRename 错误时显示 toast 错误', async () => {
      uiState.renameTargetPaths = ['/test/old.jpg'];
      mockInvoke.mockRejectedValueOnce(new Error('Rename error'));

      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.handleSaveRename('new');
      });

      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Failed to rename files'));
    });

    it('handlePasteFiles copy 模式错误时显示 toast 错误', async () => {
      processState.copiedFilePaths = ['/img.jpg'];
      libraryState.currentFolderPath = '/dest';
      mockInvoke.mockRejectedValueOnce(new Error('Copy error'));

      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.handlePasteFiles('copy');
      });

      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Failed to copy files'));
    });

    it('handlePasteFiles move 模式错误时显示 toast 错误', async () => {
      processState.copiedFilePaths = ['/img.jpg'];
      libraryState.currentFolderPath = '/dest';
      mockInvoke.mockRejectedValueOnce(new Error('Move error'));

      const { result } = renderFileOperationsHook();

      await act(async () => {
        await result.current.handlePasteFiles('move');
      });

      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Failed to move files'));
    });
  });
});
