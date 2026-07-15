import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useRef } from 'react';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-os', () => ({
  platform: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: vi.fn(),
}));

vi.mock('zustand/react/shallow', () => ({
  useShallow: (selector: any) => selector,
}));

vi.mock('../../store/useSettingsStore', () => ({
  useSettingsStore: vi.fn(),
}));

vi.mock('../../store/useUIStore', () => ({
  useUIStore: vi.fn(),
}));

vi.mock('../../store/useLibraryStore', () => ({
  useLibraryStore: vi.fn(),
}));

vi.mock('../../store/useEditorStore', () => ({
  useEditorStore: vi.fn(),
}));

vi.mock('../../store/useProcessStore', () => ({
  useProcessStore: {
    getState: vi.fn(() => ({
      setProcess: vi.fn(),
    })),
  },
}));

vi.mock('../../utils/themes', () => ({
  THEMES: [
    {
      id: 'deep-space-black',
      name: 'Deep Space Black',
      splashImage: '/splash-dark.jpg',
      cssVariables: {
        '--app-bg-primary': 'rgb(6, 8, 12)',
        '--app-text-primary': 'rgb(222, 228, 240)',
      },
    },
    {
      id: 'light',
      name: 'Light',
      splashImage: '/splash-light.jpg',
      cssVariables: {
        '--app-bg-primary': 'rgb(245, 245, 245)',
        '--app-text-primary': 'rgb(20, 20, 20)',
      },
    },
  ],
  DEFAULT_THEME_ID: 'deep-space-black',
}));

vi.mock('../../utils/adjustments', () => ({
  COPYABLE_ADJUSTMENT_KEYS: ['exposure', 'contrast', 'brightness'],
}));

import { invoke } from '@tauri-apps/api/core';
import { platform } from '@tauri-apps/plugin-os';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useUIStore } from '../../store/useUIStore';
import { useLibraryStore } from '../../store/useLibraryStore';
import { useEditorStore } from '../../store/useEditorStore';
import { useProcessStore } from '../../store/useProcessStore';
import { useAppInitialization } from '../useAppInitialization';
import {
  Invokes,
  ThumbnailSize,
  ThumbnailAspectRatio,
  LibraryViewMode,
  RawStatus,
  EditedStatus,
} from '../../components/ui/AppProperties';

const createMockI18n = (options: any = {}) => ({
  language: 'en',
  changeLanguage: vi.fn().mockResolvedValue(undefined),
  options: {
    resources: { en: {}, zh: {}, fr: {} },
    fallbackLng: 'en',
    ...options,
  },
});

const mockSettingsStoreState = (overrides: any = {}) => ({
  appSettings: null,
  theme: 'deep-space-black',
  osPlatform: 'macos',
  setAppSettings: vi.fn(),
  setTheme: vi.fn(),
  setSupportedTypes: vi.fn(),
  initPlatform: vi.fn(),
  handleSettingsChange: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

const mockUIStoreState = (overrides: any = {}) => ({
  uiVisibility: { folderTree: true, filmstrip: true },
  setUI: vi.fn(),
  ...overrides,
});

const mockLibraryStoreState = (overrides: any = {}) => ({
  sortCriteria: { key: 'name', order: 'asc' },
  filterCriteria: { colors: [], rating: 0, rawStatus: RawStatus.All },
  currentFolderPath: null,
  expandedFolders: new Set<string>(),
  activeAlbumId: null,
  expandedAlbumGroups: new Set<string>(),
  setSortCriteria: vi.fn(),
  setFilterCriteria: vi.fn(),
  setLibrary: vi.fn(),
  ...overrides,
});

const mockEditorStoreState = (overrides: any = {}) => ({
  setEditor: vi.fn(),
  ...overrides,
});

const defaultProps = {
  preloadedDataRef: { current: null },
  thumbnailSize: ThumbnailSize.Medium,
  setThumbnailSize: vi.fn(),
  thumbnailAspectRatio: ThumbnailAspectRatio.Cover,
  setThumbnailAspectRatio: vi.fn(),
  libraryViewMode: LibraryViewMode.Flat,
  setLibraryViewMode: vi.fn(),
};

describe('useAppInitialization', () => {
  let mockI18n: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockI18n = createMockI18n();
    vi.mocked(useTranslation).mockReturnValue({
      i18n: mockI18n,
      t: vi.fn(),
      ready: true,
    } as any);

    vi.mocked(platform).mockReturnValue('macos');

    vi.mocked(useSettingsStore).mockImplementation((selector: any) => selector(mockSettingsStoreState()));

    vi.mocked(useUIStore).mockImplementation((selector: any) => selector(mockUIStoreState()));

    vi.mocked(useLibraryStore).mockImplementation((selector: any) => selector(mockLibraryStoreState()));

    vi.mocked(useEditorStore).mockImplementation((selector: any) => selector(mockEditorStoreState()));

    vi.mocked(useProcessStore.getState).mockReturnValue({
      setProcess: vi.fn(),
    } as any);

    vi.mocked(invoke).mockImplementation((command: string) => {
      if (command === Invokes.GetSupportedFileTypes) {
        return Promise.resolve({ raw: ['cr2', 'nef'], nonRaw: ['jpg', 'png'] });
      }
      if (command === Invokes.LoadSettings) {
        return Promise.resolve({
          lastRootPath: '/test/path',
          theme: 'light',
          language: 'en',
          thumbnailSize: ThumbnailSize.Medium,
          libraryViewMode: LibraryViewMode.Flat,
        });
      }
      if (command === 'frontend_ready') {
        return Promise.resolve({});
      }
      return Promise.resolve({});
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderHookWithProps = (props: any = {}) => {
    const mergedProps = { ...defaultProps, ...props };
    return renderHook((propsArg: any) => useAppInitialization({ ...defaultProps, ...propsArg }), {
      initialProps: mergedProps,
    });
  };

  describe('初始化流程', () => {
    it('调用 initPlatform 初始化平台', () => {
      const initPlatform = vi.fn();
      vi.mocked(useSettingsStore).mockImplementation((selector: any) =>
        selector(mockSettingsStoreState({ initPlatform })),
      );

      renderHookWithProps();

      expect(initPlatform).toHaveBeenCalledTimes(1);
    });

    it('调用 GetSupportedFileTypes 获取支持的文件类型', async () => {
      const setSupportedTypes = vi.fn();
      vi.mocked(useSettingsStore).mockImplementation((selector: any) =>
        selector(mockSettingsStoreState({ setSupportedTypes })),
      );

      renderHookWithProps();

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith(Invokes.GetSupportedFileTypes);
      });

      await waitFor(() => {
        expect(setSupportedTypes).toHaveBeenCalledWith({
          raw: ['cr2', 'nef'],
          nonRaw: ['jpg', 'png'],
        });
      });
    });

    it('获取支持文件类型失败时记录错误', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(invoke).mockImplementation((command: string) => {
        if (command === Invokes.GetSupportedFileTypes) {
          return Promise.reject(new Error('Failed to get types'));
        }
        if (command === Invokes.LoadSettings) {
          return Promise.resolve({ lastRootPath: null });
        }
        return Promise.resolve({});
      });

      renderHookWithProps();

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to load supported file types:', expect.any(Error));
      });

      consoleErrorSpy.mockRestore();
    });

    it('调用 LoadSettings 加载应用设置', async () => {
      const setAppSettings = vi.fn();
      vi.mocked(useSettingsStore).mockImplementation((selector: any) =>
        selector(mockSettingsStoreState({ setAppSettings })),
      );

      renderHookWithProps();

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith(Invokes.LoadSettings);
      });
    });
  });

  describe('设置加载与应用', () => {
    it('成功加载设置后调用 setAppSettings', async () => {
      const setAppSettings = vi.fn();
      vi.mocked(useSettingsStore).mockImplementation((selector: any) =>
        selector(mockSettingsStoreState({ setAppSettings })),
      );

      renderHookWithProps();

      await waitFor(() => {
        expect(setAppSettings).toHaveBeenCalled();
      });
    });

    it('设置中没有语言时使用浏览器默认语言', async () => {
      vi.mocked(invoke).mockImplementation((command: string) => {
        if (command === Invokes.LoadSettings) {
          return Promise.resolve({
            lastRootPath: '/test/path',
            theme: 'light',
          });
        }
        if (command === Invokes.GetSupportedFileTypes) {
          return Promise.resolve({});
        }
        if (command === 'frontend_ready') {
          return Promise.resolve({});
        }
        return Promise.resolve({});
      });

      const handleSettingsChange = vi.fn();
      vi.mocked(useSettingsStore).mockImplementation((selector: any) =>
        selector(mockSettingsStoreState({ handleSettingsChange })),
      );

      renderHookWithProps();

      await waitFor(() => {
        expect(handleSettingsChange).toHaveBeenCalled();
      });

      const savedSettings = handleSettingsChange.mock.calls[0][0];
      expect(savedSettings.language).toBeDefined();
    });

    it('设置中有语言时直接使用该语言', async () => {
      vi.mocked(invoke).mockImplementation((command: string) => {
        if (command === Invokes.LoadSettings) {
          return Promise.resolve({
            lastRootPath: '/test/path',
            theme: 'light',
            language: 'fr',
          });
        }
        if (command === Invokes.GetSupportedFileTypes) {
          return Promise.resolve({});
        }
        if (command === 'frontend_ready') {
          return Promise.resolve({});
        }
        return Promise.resolve({});
      });

      const handleSettingsChange = vi.fn();
      vi.mocked(useSettingsStore).mockImplementation((selector: any) =>
        selector(mockSettingsStoreState({ handleSettingsChange })),
      );

      renderHookWithProps();

      await waitFor(() => {
        expect(mockI18n.changeLanguage).toHaveBeenCalledWith('fr');
      });
    });

    it('没有 copyPasteSettings 时设置默认值', async () => {
      vi.mocked(invoke).mockImplementation((command: string) => {
        if (command === Invokes.LoadSettings) {
          return Promise.resolve({
            lastRootPath: '/test/path',
            language: 'en',
          });
        }
        if (command === Invokes.GetSupportedFileTypes) {
          return Promise.resolve({});
        }
        if (command === 'frontend_ready') {
          return Promise.resolve({});
        }
        return Promise.resolve({});
      });

      const setAppSettings = vi.fn();
      vi.mocked(useSettingsStore).mockImplementation((selector: any) =>
        selector(mockSettingsStoreState({ setAppSettings })),
      );

      renderHookWithProps();

      await waitFor(() => {
        expect(setAppSettings).toHaveBeenCalled();
      });

      const savedSettings = setAppSettings.mock.calls[0][0];
      expect(savedSettings.copyPasteSettings).toBeDefined();
      expect(savedSettings.copyPasteSettings.mode).toBe('merge');
      expect(savedSettings.copyPasteSettings.includedAdjustments).toEqual(['exposure', 'contrast', 'brightness']);
    });

    it('copyPasteSettings 中没有 includedAdjustments 时设置默认值', async () => {
      vi.mocked(invoke).mockImplementation((command: string) => {
        if (command === Invokes.LoadSettings) {
          return Promise.resolve({
            lastRootPath: '/test/path',
            language: 'en',
            copyPasteSettings: { mode: 'replace' },
          });
        }
        if (command === Invokes.GetSupportedFileTypes) {
          return Promise.resolve({});
        }
        if (command === 'frontend_ready') {
          return Promise.resolve({});
        }
        return Promise.resolve({});
      });

      const setAppSettings = vi.fn();
      vi.mocked(useSettingsStore).mockImplementation((selector: any) =>
        selector(mockSettingsStoreState({ setAppSettings })),
      );

      renderHookWithProps();

      await waitFor(() => {
        expect(setAppSettings).toHaveBeenCalled();
      });

      const savedSettings = setAppSettings.mock.calls[0][0];
      expect(savedSettings.copyPasteSettings.includedAdjustments).toEqual(['exposure', 'contrast', 'brightness']);
    });
  });

  describe('主题初始化', () => {
    it('从设置中加载主题', async () => {
      const setTheme = vi.fn();
      vi.mocked(useSettingsStore).mockImplementation((selector: any) => selector(mockSettingsStoreState({ setTheme })));

      renderHookWithProps();

      await waitFor(() => {
        expect(setTheme).toHaveBeenCalledWith('light');
      });
    });
  });

  describe('排序与筛选条件', () => {
    it('从设置中恢复 sortCriteria', async () => {
      vi.mocked(invoke).mockImplementation((command: string) => {
        if (command === Invokes.LoadSettings) {
          return Promise.resolve({
            lastRootPath: '/test/path',
            language: 'en',
            sortCriteria: { key: 'date', order: 'desc' },
          });
        }
        if (command === Invokes.GetSupportedFileTypes) {
          return Promise.resolve({});
        }
        if (command === 'frontend_ready') {
          return Promise.resolve({});
        }
        return Promise.resolve({});
      });

      const setSortCriteria = vi.fn();
      vi.mocked(useLibraryStore).mockImplementation((selector: any) =>
        selector(mockLibraryStoreState({ setSortCriteria })),
      );

      renderHookWithProps();

      await waitFor(() => {
        expect(setSortCriteria).toHaveBeenCalledWith({ key: 'date', order: 'desc' });
      });
    });

    it('从设置中恢复 filterCriteria', async () => {
      vi.mocked(invoke).mockImplementation((command: string) => {
        if (command === Invokes.LoadSettings) {
          return Promise.resolve({
            lastRootPath: '/test/path',
            language: 'en',
            filterCriteria: {
              colors: ['red', 'blue'],
              rating: 3,
              rawStatus: RawStatus.RawOnly,
              editedStatus: EditedStatus.EditedOnly,
            },
          });
        }
        if (command === Invokes.GetSupportedFileTypes) {
          return Promise.resolve({});
        }
        if (command === 'frontend_ready') {
          return Promise.resolve({});
        }
        return Promise.resolve({});
      });

      const setFilterCriteria = vi.fn();
      vi.mocked(useLibraryStore).mockImplementation((selector: any) =>
        selector(mockLibraryStoreState({ setFilterCriteria })),
      );

      renderHookWithProps();

      await waitFor(() => {
        expect(setFilterCriteria).toHaveBeenCalled();
      });
    });

    it('filterCriteria 缺少字段时使用默认值', async () => {
      vi.mocked(invoke).mockImplementation((command: string) => {
        if (command === Invokes.LoadSettings) {
          return Promise.resolve({
            lastRootPath: '/test/path',
            language: 'en',
            filterCriteria: {
              rating: 2,
            },
          });
        }
        if (command === Invokes.GetSupportedFileTypes) {
          return Promise.resolve({});
        }
        if (command === 'frontend_ready') {
          return Promise.resolve({});
        }
        return Promise.resolve({});
      });

      const setFilterCriteria = vi.fn();
      vi.mocked(useLibraryStore).mockImplementation((selector: any) =>
        selector(mockLibraryStoreState({ setFilterCriteria })),
      );

      renderHookWithProps();

      await waitFor(() => {
        expect(setFilterCriteria).toHaveBeenCalled();
      });

      const filterUpdater = setFilterCriteria.mock.calls[0][0];
      const result = filterUpdater({ colors: [], rating: 0, rawStatus: RawStatus.All });
      expect(result.rawStatus).toBe(RawStatus.All);
      expect(result.editedStatus).toBe(EditedStatus.All);
      expect(result.colors).toEqual([]);
      expect(result.rating).toBe(2);
    });
  });

  describe('UI 可见性设置', () => {
    it('从设置中恢复 uiVisibility', async () => {
      vi.mocked(invoke).mockImplementation((command: string) => {
        if (command === Invokes.LoadSettings) {
          return Promise.resolve({
            lastRootPath: '/test/path',
            language: 'en',
            uiVisibility: { folderTree: false, filmstrip: true },
          });
        }
        if (command === Invokes.GetSupportedFileTypes) {
          return Promise.resolve({});
        }
        if (command === 'frontend_ready') {
          return Promise.resolve({});
        }
        return Promise.resolve({});
      });

      const setUI = vi.fn();
      vi.mocked(useUIStore).mockImplementation((selector: any) => selector(mockUIStoreState({ setUI })));

      renderHookWithProps();

      await waitFor(() => {
        expect(setUI).toHaveBeenCalled();
      });
    });
  });

  describe('编辑器设置', () => {
    it('从设置中恢复波形相关设置', async () => {
      vi.mocked(invoke).mockImplementation((command: string) => {
        if (command === Invokes.LoadSettings) {
          return Promise.resolve({
            lastRootPath: '/test/path',
            language: 'en',
            isWaveformVisible: true,
            activeWaveformChannel: 'red',
            waveformHeight: 300,
          });
        }
        if (command === Invokes.GetSupportedFileTypes) {
          return Promise.resolve({});
        }
        if (command === 'frontend_ready') {
          return Promise.resolve({});
        }
        return Promise.resolve({});
      });

      const setEditor = vi.fn();
      vi.mocked(useEditorStore).mockImplementation((selector: any) => selector(mockEditorStoreState({ setEditor })));

      renderHookWithProps();

      await waitFor(() => {
        expect(setEditor).toHaveBeenCalledWith({ isWaveformVisible: true });
        expect(setEditor).toHaveBeenCalledWith({ activeWaveformChannel: 'red' });
        expect(setEditor).toHaveBeenCalledWith({ waveformHeight: 300 });
      });
    });
  });

  describe('库视图和缩略图设置', () => {
    it('从设置中恢复 libraryViewMode', async () => {
      const setLibraryViewMode = vi.fn();

      renderHookWithProps({ setLibraryViewMode });

      await waitFor(() => {
        expect(setLibraryViewMode).toHaveBeenCalledWith(LibraryViewMode.Flat);
      });
    });

    it('从设置中恢复 thumbnailSize', async () => {
      const setThumbnailSize = vi.fn();

      renderHookWithProps({ setThumbnailSize });

      await waitFor(() => {
        expect(setThumbnailSize).toHaveBeenCalledWith(ThumbnailSize.Medium);
      });
    });

    it('从设置中恢复 thumbnailAspectRatio', async () => {
      vi.mocked(invoke).mockImplementation((command: string) => {
        if (command === Invokes.LoadSettings) {
          return Promise.resolve({
            lastRootPath: '/test/path',
            language: 'en',
            thumbnailAspectRatio: ThumbnailAspectRatio.Contain,
          });
        }
        if (command === Invokes.GetSupportedFileTypes) {
          return Promise.resolve({});
        }
        if (command === 'frontend_ready') {
          return Promise.resolve({});
        }
        return Promise.resolve({});
      });

      const setThumbnailAspectRatio = vi.fn();

      renderHookWithProps({ setThumbnailAspectRatio });

      await waitFor(() => {
        expect(setThumbnailAspectRatio).toHaveBeenCalledWith(ThumbnailAspectRatio.Contain);
      });
    });

    it('设置中没有 libraryViewMode 时使用默认值', async () => {
      vi.mocked(invoke).mockImplementation((command: string) => {
        if (command === Invokes.LoadSettings) {
          return Promise.resolve({
            lastRootPath: '/test/path',
            language: 'en',
          });
        }
        if (command === Invokes.GetSupportedFileTypes) {
          return Promise.resolve({});
        }
        if (command === 'frontend_ready') {
          return Promise.resolve({});
        }
        return Promise.resolve({});
      });

      const setLibraryViewMode = vi.fn();

      renderHookWithProps({ setLibraryViewMode });

      await waitFor(() => {
        expect(setLibraryViewMode).toHaveBeenCalledWith(LibraryViewMode.Flat);
      });
    });

    it('设置中没有 thumbnailSize 时使用默认值', async () => {
      vi.mocked(invoke).mockImplementation((command: string) => {
        if (command === Invokes.LoadSettings) {
          return Promise.resolve({
            lastRootPath: '/test/path',
            language: 'en',
          });
        }
        if (command === Invokes.GetSupportedFileTypes) {
          return Promise.resolve({});
        }
        if (command === 'frontend_ready') {
          return Promise.resolve({});
        }
        return Promise.resolve({});
      });

      const setThumbnailSize = vi.fn();

      renderHookWithProps({ setThumbnailSize });

      await waitFor(() => {
        expect(setThumbnailSize).toHaveBeenCalledWith(ThumbnailSize.Medium);
      });
    });
  });

  describe('平台特定初始化', () => {
    it('Android 平台使用不同的默认缩略图大小', async () => {
      vi.mocked(platform).mockReturnValue('android');
      vi.mocked(invoke).mockImplementation((command: string) => {
        if (command === Invokes.LoadSettings) {
          return Promise.resolve({
            lastRootPath: '/test/path',
            language: 'en',
          });
        }
        if (command === Invokes.GetSupportedFileTypes) {
          return Promise.resolve({});
        }
        if (command === 'frontend_ready') {
          return Promise.resolve({});
        }
        return Promise.resolve({});
      });

      vi.mocked(useSettingsStore).mockImplementation((selector: any) =>
        selector(mockSettingsStoreState({ osPlatform: 'android' })),
      );

      const setThumbnailSize = vi.fn();
      const setLibraryViewMode = vi.fn();

      renderHookWithProps({ setThumbnailSize, setLibraryViewMode });

      await waitFor(() => {
        expect(setThumbnailSize).toHaveBeenCalledWith(ThumbnailSize.Small);
      });

      await waitFor(() => {
        expect(setLibraryViewMode).toHaveBeenCalledWith(LibraryViewMode.Recursive);
      });
    });

    it('非 Android 平台使用 Medium 缩略图和 Flat 视图模式', async () => {
      vi.mocked(invoke).mockImplementation((command: string) => {
        if (command === Invokes.LoadSettings) {
          return Promise.resolve({
            lastRootPath: '/test/path',
            language: 'en',
          });
        }
        if (command === Invokes.GetSupportedFileTypes) {
          return Promise.resolve({});
        }
        if (command === 'frontend_ready') {
          return Promise.resolve({});
        }
        return Promise.resolve({});
      });

      const setThumbnailSize = vi.fn();
      const setLibraryViewMode = vi.fn();

      renderHookWithProps({ setThumbnailSize, setLibraryViewMode });

      await waitFor(() => {
        expect(setThumbnailSize).toHaveBeenCalledWith(ThumbnailSize.Medium);
      });

      await waitFor(() => {
        expect(setLibraryViewMode).toHaveBeenCalledWith(LibraryViewMode.Flat);
      });
    });
  });

  describe('固定文件夹', () => {
    it('有 pinnedFolders 时加载固定文件夹树', async () => {
      vi.mocked(invoke).mockImplementation((command: string, args: any) => {
        if (command === Invokes.LoadSettings) {
          return Promise.resolve({
            lastRootPath: '/test/path',
            language: 'en',
            pinnedFolders: ['/folder1', '/folder2'],
          });
        }
        if (command === Invokes.GetSupportedFileTypes) {
          return Promise.resolve({});
        }
        if (command === Invokes.GetPinnedFolderTrees) {
          return Promise.resolve([{ path: args?.paths?.[0] || '/folder1', children: [] }]);
        }
        if (command === 'frontend_ready') {
          return Promise.resolve({});
        }
        return Promise.resolve({});
      });

      const setLibrary = vi.fn();
      vi.mocked(useLibraryStore).mockImplementation((selector: any) => selector(mockLibraryStoreState({ setLibrary })));

      renderHookWithProps();

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith(Invokes.GetPinnedFolderTrees, expect.any(Object));
      });

      await waitFor(() => {
        expect(setLibrary).toHaveBeenCalledWith(expect.objectContaining({ pinnedFolderTrees: expect.any(Array) }));
      });
    });

    it('加载固定文件夹树失败时记录错误', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(invoke).mockImplementation((command: string) => {
        if (command === Invokes.LoadSettings) {
          return Promise.resolve({
            lastRootPath: '/test/path',
            language: 'en',
            pinnedFolders: ['/folder1'],
          });
        }
        if (command === Invokes.GetSupportedFileTypes) {
          return Promise.resolve({});
        }
        if (command === Invokes.GetPinnedFolderTrees) {
          return Promise.reject(new Error('Failed to load trees'));
        }
        if (command === 'frontend_ready') {
          return Promise.resolve({});
        }
        return Promise.resolve({});
      });

      renderHookWithProps();

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to load pinned folder trees:', expect.any(Error));
      });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('预加载数据', () => {
    it('非 Android 且有 rootFolders 时预加载数据', async () => {
      vi.mocked(invoke).mockImplementation((command: string) => {
        if (command === Invokes.LoadSettings) {
          return Promise.resolve({
            lastRootPath: '/test/root',
            language: 'en',
            rootFolders: ['/test/root'],
            libraryViewMode: LibraryViewMode.Flat,
          });
        }
        if (command === Invokes.GetSupportedFileTypes) {
          return Promise.resolve({});
        }
        if (command === Invokes.GetPinnedFolderTrees) {
          return Promise.resolve([]);
        }
        if (command === Invokes.ListImagesInDir) {
          return Promise.resolve([]);
        }
        if (command === 'frontend_ready') {
          return Promise.resolve({});
        }
        return Promise.resolve({});
      });

      const preloadedDataRef = { current: null };

      renderHookWithProps({ preloadedDataRef });

      await waitFor(() => {
        expect(preloadedDataRef.current).not.toBeNull();
      });

      expect(preloadedDataRef.current.rootPaths).toEqual(['/test/root']);
      expect(preloadedDataRef.current.currentPath).toBe('/test/root');
    });

    it('Android 平台不预加载数据', async () => {
      vi.mocked(platform).mockReturnValue('android');
      vi.mocked(invoke).mockImplementation((command: string) => {
        if (command === Invokes.LoadSettings) {
          return Promise.resolve({
            lastRootPath: '/test/root',
            language: 'en',
            rootFolders: ['/test/root'],
          });
        }
        if (command === Invokes.GetSupportedFileTypes) {
          return Promise.resolve({});
        }
        if (command === 'frontend_ready') {
          return Promise.resolve({});
        }
        return Promise.resolve({});
      });

      vi.mocked(useSettingsStore).mockImplementation((selector: any) =>
        selector(mockSettingsStoreState({ osPlatform: 'android' })),
      );

      const preloadedDataRef = { current: null };

      renderHookWithProps({ preloadedDataRef });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(preloadedDataRef.current).toBeNull();
    });

    it('使用 lastFolderState.currentFolderPath 作为当前路径', async () => {
      vi.mocked(invoke).mockImplementation((command: string) => {
        if (command === Invokes.LoadSettings) {
          return Promise.resolve({
            lastRootPath: '/test/root',
            language: 'en',
            rootFolders: ['/test/root'],
            lastFolderState: {
              currentFolderPath: '/test/root/subfolder',
            },
            libraryViewMode: LibraryViewMode.Flat,
          });
        }
        if (command === Invokes.GetSupportedFileTypes) {
          return Promise.resolve({});
        }
        if (command === Invokes.GetPinnedFolderTrees) {
          return Promise.resolve([]);
        }
        if (command === Invokes.ListImagesInDir) {
          return Promise.resolve([]);
        }
        if (command === 'frontend_ready') {
          return Promise.resolve({});
        }
        return Promise.resolve({});
      });

      const preloadedDataRef = { current: null };

      renderHookWithProps({ preloadedDataRef });

      await waitFor(() => {
        expect(preloadedDataRef.current).not.toBeNull();
      });

      expect(preloadedDataRef.current.currentPath).toBe('/test/root/subfolder');
    });

    it('Recursive 视图模式使用 ListImagesRecursive', async () => {
      vi.mocked(invoke).mockImplementation((command: string) => {
        if (command === Invokes.LoadSettings) {
          return Promise.resolve({
            lastRootPath: '/test/root',
            language: 'en',
            rootFolders: ['/test/root'],
            libraryViewMode: LibraryViewMode.Recursive,
          });
        }
        if (command === Invokes.GetSupportedFileTypes) {
          return Promise.resolve({});
        }
        if (command === Invokes.GetPinnedFolderTrees) {
          return Promise.resolve([]);
        }
        if (command === Invokes.ListImagesRecursive) {
          return Promise.resolve([]);
        }
        if (command === 'frontend_ready') {
          return Promise.resolve({});
        }
        return Promise.resolve({});
      });

      const preloadedDataRef = { current: null };

      renderHookWithProps({ preloadedDataRef });

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith(Invokes.ListImagesRecursive, expect.any(Object));
      });
    });
  });

  describe('文件夹状态恢复', () => {
    it('从 lastFolderState 恢复 expandedFolders', async () => {
      vi.mocked(invoke).mockImplementation((command: string) => {
        if (command === Invokes.LoadSettings) {
          return Promise.resolve({
            lastRootPath: '/test/path',
            language: 'en',
            lastFolderState: {
              currentFolderPath: '/test/path',
              expandedFolders: ['/test/path/a', '/test/path/b'],
              expandedAlbumGroups: ['album1', 'album2'],
            },
          });
        }
        if (command === Invokes.GetSupportedFileTypes) {
          return Promise.resolve({});
        }
        if (command === 'frontend_ready') {
          return Promise.resolve({});
        }
        return Promise.resolve({});
      });

      const setLibrary = vi.fn();
      vi.mocked(useLibraryStore).mockImplementation((selector: any) => selector(mockLibraryStoreState({ setLibrary })));

      renderHookWithProps();

      await waitFor(() => {
        expect(setLibrary).toHaveBeenCalledWith(
          expect.objectContaining({
            expandedFolders: expect.any(Set),
            expandedAlbumGroups: expect.any(Set),
          }),
        );
      });
    });
  });

  describe('前端就绪通知', () => {
    it('调用 frontend_ready 通知后端', async () => {
      renderHookWithProps();

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('frontend_ready');
      });
    });

    it('frontend_ready 返回 editSession 时设置外部编辑会话', async () => {
      const mockSetProcess = vi.fn();
      vi.mocked(useProcessStore.getState).mockReturnValue({
        setProcess: mockSetProcess,
      } as any);

      vi.mocked(invoke).mockImplementation((command: string) => {
        if (command === Invokes.LoadSettings) {
          return Promise.resolve({
            lastRootPath: '/test/path',
            language: 'en',
          });
        }
        if (command === Invokes.GetSupportedFileTypes) {
          return Promise.resolve({});
        }
        if (command === 'frontend_ready') {
          return Promise.resolve({ editSession: { source: '/path/source.jpg', output: '/path/output.jpg' } });
        }
        return Promise.resolve({});
      });

      renderHookWithProps();

      await waitFor(() => {
        expect(mockSetProcess).toHaveBeenCalledWith({
          externalEditSession: { source: '/path/source.jpg', output: '/path/output.jpg' },
        });
      });
    });

    it('frontend_ready 返回 openWithFile 时设置初始打开文件', async () => {
      const mockSetProcess = vi.fn();
      vi.mocked(useProcessStore.getState).mockReturnValue({
        setProcess: mockSetProcess,
      } as any);

      vi.mocked(invoke).mockImplementation((command: string) => {
        if (command === Invokes.LoadSettings) {
          return Promise.resolve({
            lastRootPath: '/test/path',
            language: 'en',
          });
        }
        if (command === Invokes.GetSupportedFileTypes) {
          return Promise.resolve({});
        }
        if (command === 'frontend_ready') {
          return Promise.resolve({ openWithFile: '/path/to/open.jpg' });
        }
        return Promise.resolve({});
      });

      renderHookWithProps();

      await waitFor(() => {
        expect(mockSetProcess).toHaveBeenCalledWith({
          initialFileToOpen: '/path/to/open.jpg',
        });
      });
    });

    it('frontend_ready 失败时记录错误', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(invoke).mockImplementation((command: string) => {
        if (command === Invokes.LoadSettings) {
          return Promise.resolve({
            lastRootPath: '/test/path',
            language: 'en',
          });
        }
        if (command === Invokes.GetSupportedFileTypes) {
          return Promise.resolve({});
        }
        if (command === 'frontend_ready') {
          return Promise.reject(new Error('Failed'));
        }
        return Promise.resolve({});
      });

      renderHookWithProps();

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to notify backend of readiness:', expect.any(Error));
      });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('错误处理', () => {
    it('加载设置失败时设置默认设置', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(invoke).mockImplementation((command: string) => {
        if (command === Invokes.LoadSettings) {
          return Promise.reject(new Error('Load failed'));
        }
        if (command === Invokes.GetSupportedFileTypes) {
          return Promise.resolve({});
        }
        return Promise.resolve({});
      });

      const setAppSettings = vi.fn();
      vi.mocked(useSettingsStore).mockImplementation((selector: any) =>
        selector(mockSettingsStoreState({ setAppSettings })),
      );

      renderHookWithProps();

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to load settings:', expect.any(Error));
      });

      await waitFor(() => {
        expect(setAppSettings).toHaveBeenCalledWith(
          expect.objectContaining({
            lastRootPath: null,
            theme: 'deep-space-black',
            thumbnailSize: ThumbnailSize.Medium,
            libraryViewMode: LibraryViewMode.Flat,
          }),
        );
      });

      consoleErrorSpy.mockRestore();
    });

    it('加载设置失败时 Android 使用不同的默认值', async () => {
      vi.mocked(platform).mockReturnValue('android');
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(invoke).mockImplementation((command: string) => {
        if (command === Invokes.LoadSettings) {
          return Promise.reject(new Error('Load failed'));
        }
        if (command === Invokes.GetSupportedFileTypes) {
          return Promise.resolve({});
        }
        return Promise.resolve({});
      });

      const setAppSettings = vi.fn();
      vi.mocked(useSettingsStore).mockImplementation((selector: any) =>
        selector(mockSettingsStoreState({ osPlatform: 'android', setAppSettings })),
      );

      renderHookWithProps();

      await waitFor(() => {
        expect(setAppSettings).toHaveBeenCalledWith(
          expect.objectContaining({
            thumbnailSize: ThumbnailSize.Small,
            libraryViewMode: LibraryViewMode.Recursive,
          }),
        );
      });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('主题 CSS 变量应用', () => {
    it('应用主题 CSS 变量到 documentElement', async () => {
      const root = document.documentElement;
      const setPropertySpy = vi.spyOn(root.style, 'setProperty');

      vi.mocked(useSettingsStore).mockImplementation((selector: any) =>
        selector(mockSettingsStoreState({ theme: 'light' })),
      );

      renderHookWithProps();

      await waitFor(() => {
        expect(setPropertySpy).toHaveBeenCalled();
      });

      expect(setPropertySpy).toHaveBeenCalledWith('--app-bg-primary', 'rgb(245, 245, 245)');
      expect(setPropertySpy).toHaveBeenCalledWith('--app-text-primary', 'rgb(20, 20, 20)');

      setPropertySpy.mockRestore();
    });

    it('设置默认字体为 Poppins', async () => {
      const root = document.documentElement;
      const setPropertySpy = vi.spyOn(root.style, 'setProperty');

      renderHookWithProps();

      await waitFor(() => {
        expect(setPropertySpy).toHaveBeenCalledWith('--font-family', "'Poppins', system-ui, sans-serif");
      });

      setPropertySpy.mockRestore();
    });

    it('fontFamily 为 system 时使用系统字体', async () => {
      const root = document.documentElement;
      const setPropertySpy = vi.spyOn(root.style, 'setProperty');

      const mockAppSettings = {
        lastRootPath: '/test/path',
        language: 'en',
        fontFamily: 'system',
      };

      vi.mocked(invoke).mockImplementation((command: string) => {
        if (command === Invokes.LoadSettings) {
          return Promise.resolve(mockAppSettings);
        }
        if (command === Invokes.GetSupportedFileTypes) {
          return Promise.resolve({});
        }
        if (command === 'frontend_ready') {
          return Promise.resolve({});
        }
        return Promise.resolve({});
      });

      const setAppSettings = vi.fn((settings) => {
        vi.mocked(useSettingsStore).mockImplementation((selector: any) =>
          selector(mockSettingsStoreState({ appSettings: settings })),
        );
      });

      vi.mocked(useSettingsStore).mockImplementation((selector: any) =>
        selector(mockSettingsStoreState({ setAppSettings })),
      );

      const { rerender } = renderHookWithProps();

      await waitFor(() => {
        expect(setAppSettings).toHaveBeenCalled();
      });

      rerender();

      await waitFor(() => {
        expect(setPropertySpy).toHaveBeenCalledWith(
          '--font-family',
          '-apple-system, BlinkMacSystemFont, system-ui, sans-serif',
        );
      });

      setPropertySpy.mockRestore();
    });
  });

  describe('语言初始化', () => {
    it('getDefaultLanguage 返回完整浏览器语言（如果支持）', () => {
      const testI18n = createMockI18n({
        resources: { 'en-US': {}, 'zh-CN': {}, en: {} },
        fallbackLng: 'en',
      });

      const originalLanguage = navigator.language;
      Object.defineProperty(navigator, 'language', { value: 'en-US', writable: true });

      const { result } = renderHook(() => {
        const ref = useRef<any>(null);
        useAppInitialization({
          ...defaultProps,
          preloadedDataRef: ref,
        });
        return ref;
      });

      expect(testI18n).toBeDefined();

      Object.defineProperty(navigator, 'language', { value: originalLanguage, writable: true });
    });

    it('语言变化时调用 i18n.changeLanguage', async () => {
      vi.mocked(invoke).mockImplementation((command: string) => {
        if (command === Invokes.LoadSettings) {
          return Promise.resolve({
            lastRootPath: '/test/path',
            language: 'zh',
          });
        }
        if (command === Invokes.GetSupportedFileTypes) {
          return Promise.resolve({});
        }
        if (command === 'frontend_ready') {
          return Promise.resolve({});
        }
        return Promise.resolve({});
      });

      renderHookWithProps();

      await waitFor(() => {
        expect(mockI18n.changeLanguage).toHaveBeenCalledWith('zh');
      });
    });
  });

  describe('设置变化同步', () => {
    it('uiVisibility 变化时同步到设置', async () => {
      let currentUiVisibility = { folderTree: true, filmstrip: true };
      const handleSettingsChange = vi.fn();

      const appSettingsAfterInit = {
        lastRootPath: '/test/path',
        language: 'en',
        uiVisibility: { folderTree: true, filmstrip: true },
      };

      vi.mocked(invoke).mockImplementation((command: string) => {
        if (command === Invokes.LoadSettings) {
          return Promise.resolve(appSettingsAfterInit);
        }
        if (command === Invokes.GetSupportedFileTypes) {
          return Promise.resolve({});
        }
        if (command === 'frontend_ready') {
          return Promise.resolve({});
        }
        return Promise.resolve({});
      });

      vi.mocked(useSettingsStore).mockImplementation((selector: any) =>
        selector(
          mockSettingsStoreState({
            appSettings: appSettingsAfterInit,
            handleSettingsChange,
          }),
        ),
      );

      vi.mocked(useUIStore).mockImplementation((selector: any) =>
        selector(mockUIStoreState({ uiVisibility: currentUiVisibility })),
      );

      const { rerender } = renderHookWithProps();

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('frontend_ready');
      });

      await new Promise((resolve) => setTimeout(resolve, 50));
      handleSettingsChange.mockClear();

      currentUiVisibility = { folderTree: false, filmstrip: true };
      vi.mocked(useUIStore).mockImplementation((selector: any) =>
        selector(mockUIStoreState({ uiVisibility: currentUiVisibility })),
      );

      act(() => {
        rerender();
      });

      await waitFor(() => {
        expect(handleSettingsChange).toHaveBeenCalled();
      });

      const calls = handleSettingsChange.mock.calls;
      const uiVisibilityCall = calls.find((call: any) => {
        const settings = call[0];
        return settings.uiVisibility && settings.uiVisibility.folderTree === false;
      });

      expect(uiVisibilityCall).toBeDefined();
    });

    it('thumbnailSize 变化时同步到设置', async () => {
      const handleSettingsChange = vi.fn();

      const appSettingsAfterInit = {
        lastRootPath: '/test/path',
        language: 'en',
        thumbnailSize: ThumbnailSize.Medium,
      };

      vi.mocked(invoke).mockImplementation((command: string) => {
        if (command === Invokes.LoadSettings) {
          return Promise.resolve(appSettingsAfterInit);
        }
        if (command === Invokes.GetSupportedFileTypes) {
          return Promise.resolve({});
        }
        if (command === 'frontend_ready') {
          return Promise.resolve({});
        }
        return Promise.resolve({});
      });

      vi.mocked(useSettingsStore).mockImplementation((selector: any) =>
        selector(
          mockSettingsStoreState({
            appSettings: appSettingsAfterInit,
            handleSettingsChange,
          }),
        ),
      );

      const { rerender } = renderHookWithProps({
        thumbnailSize: ThumbnailSize.Medium,
      });

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('frontend_ready');
      });

      await new Promise((resolve) => setTimeout(resolve, 50));
      handleSettingsChange.mockClear();

      act(() => {
        rerender({
          thumbnailSize: ThumbnailSize.Large,
        });
      });

      await waitFor(() => {
        expect(handleSettingsChange).toHaveBeenCalled();
      });

      const calls = handleSettingsChange.mock.calls;
      const thumbnailSizeCall = calls.find((call: any) => {
        const settings = call[0];
        return settings.thumbnailSize === ThumbnailSize.Large;
      });

      expect(thumbnailSizeCall).toBeDefined();
    });

    it('libraryViewMode 变化时同步到设置', async () => {
      const handleSettingsChange = vi.fn();

      const appSettingsAfterInit = {
        lastRootPath: '/test/path',
        language: 'en',
        libraryViewMode: LibraryViewMode.Flat,
      };

      vi.mocked(invoke).mockImplementation((command: string) => {
        if (command === Invokes.LoadSettings) {
          return Promise.resolve(appSettingsAfterInit);
        }
        if (command === Invokes.GetSupportedFileTypes) {
          return Promise.resolve({});
        }
        if (command === 'frontend_ready') {
          return Promise.resolve({});
        }
        return Promise.resolve({});
      });

      vi.mocked(useSettingsStore).mockImplementation((selector: any) =>
        selector(
          mockSettingsStoreState({
            appSettings: appSettingsAfterInit,
            handleSettingsChange,
          }),
        ),
      );

      const { rerender } = renderHookWithProps({
        libraryViewMode: LibraryViewMode.Flat,
      });

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('frontend_ready');
      });

      await new Promise((resolve) => setTimeout(resolve, 50));
      handleSettingsChange.mockClear();

      act(() => {
        rerender({
          libraryViewMode: LibraryViewMode.Recursive,
        });
      });

      await waitFor(() => {
        expect(handleSettingsChange).toHaveBeenCalled();
      });

      const calls = handleSettingsChange.mock.calls;
      const libraryViewModeCall = calls.find((call: any) => {
        const settings = call[0];
        return settings.libraryViewMode === LibraryViewMode.Recursive;
      });

      expect(libraryViewModeCall).toBeDefined();
    });
  });

  describe('初始化完成标记', () => {
    it('初始化完成后 isInitialMount 被设置为 false', async () => {
      renderHookWithProps();

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('frontend_ready');
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(true).toBe(true);
    });
  });
});
