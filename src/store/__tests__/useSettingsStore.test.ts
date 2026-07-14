import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSettingsStore } from '../useSettingsStore';
import { DEFAULT_THEME_ID } from '../../utils/themes';
import { Theme, Invokes, type AppSettings, type SupportedTypes } from '../../components/ui/AppProperties';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-os', () => ({
  platform: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';
import { platform } from '@tauri-apps/plugin-os';

const mockAppSettings: AppSettings = {
  theme: Theme.Light,
  lastRootPath: null,
};

const mockSupportedTypes: SupportedTypes = {
  nonRaw: ['jpg', 'png'],
  raw: ['cr2', 'nef'],
};

describe('useSettingsStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsStore.setState({
      appSettings: null,
      theme: DEFAULT_THEME_ID,
      supportedTypes: null,
      osPlatform: '',
    });
  });

  describe('初始状态', () => {
    it('appSettings 为 null', () => {
      expect(useSettingsStore.getState().appSettings).toBeNull();
    });

    it('theme 为 DEFAULT_THEME_ID', () => {
      expect(useSettingsStore.getState().theme).toBe(DEFAULT_THEME_ID);
    });

    it('supportedTypes 为 null', () => {
      expect(useSettingsStore.getState().supportedTypes).toBeNull();
    });

    it('osPlatform 为空字符串', () => {
      expect(useSettingsStore.getState().osPlatform).toBe('');
    });
  });

  describe('initPlatform', () => {
    it('成功时设置 osPlatform', () => {
      vi.mocked(platform).mockReturnValue('windows');
      useSettingsStore.getState().initPlatform();
      expect(platform).toHaveBeenCalled();
      expect(useSettingsStore.getState().osPlatform).toBe('windows');
    });

    it('失败时设置 osPlatform 为空字符串', () => {
      vi.mocked(platform).mockImplementation(() => {
        throw new Error('platform error');
      });
      useSettingsStore.getState().initPlatform();
      expect(platform).toHaveBeenCalled();
      expect(useSettingsStore.getState().osPlatform).toBe('');
    });

    it('android 平台正确设置', () => {
      vi.mocked(platform).mockReturnValue('android');
      useSettingsStore.getState().initPlatform();
      expect(useSettingsStore.getState().osPlatform).toBe('android');
    });

    it('macos 平台正确设置', () => {
      vi.mocked(platform).mockReturnValue('macos');
      useSettingsStore.getState().initPlatform();
      expect(useSettingsStore.getState().osPlatform).toBe('macos');
    });

    it('linux 平台正确设置', () => {
      vi.mocked(platform).mockReturnValue('linux');
      useSettingsStore.getState().initPlatform();
      expect(useSettingsStore.getState().osPlatform).toBe('linux');
    });
  });

  describe('isAndroid', () => {
    it('osPlatform 为 android 时返回 true', () => {
      useSettingsStore.setState({ osPlatform: 'android' });
      expect(useSettingsStore.getState().isAndroid()).toBe(true);
    });

    it('osPlatform 为 windows 时返回 false', () => {
      useSettingsStore.setState({ osPlatform: 'windows' });
      expect(useSettingsStore.getState().isAndroid()).toBe(false);
    });

    it('osPlatform 为空字符串时返回 false', () => {
      useSettingsStore.setState({ osPlatform: '' });
      expect(useSettingsStore.getState().isAndroid()).toBe(false);
    });

    it('osPlatform 为 macos 时返回 false', () => {
      useSettingsStore.setState({ osPlatform: 'macos' });
      expect(useSettingsStore.getState().isAndroid()).toBe(false);
    });

    it('osPlatform 为 linux 时返回 false', () => {
      useSettingsStore.setState({ osPlatform: 'linux' });
      expect(useSettingsStore.getState().isAndroid()).toBe(false);
    });

    it('osPlatform 为 ios 时返回 false', () => {
      useSettingsStore.setState({ osPlatform: 'ios' });
      expect(useSettingsStore.getState().isAndroid()).toBe(false);
    });
  });

  describe('setAppSettings', () => {
    it('设置 appSettings 为有效值', () => {
      useSettingsStore.getState().setAppSettings(mockAppSettings);
      expect(useSettingsStore.getState().appSettings).toEqual(mockAppSettings);
    });

    it('设置 appSettings 为 null', () => {
      useSettingsStore.getState().setAppSettings(mockAppSettings);
      useSettingsStore.getState().setAppSettings(null);
      expect(useSettingsStore.getState().appSettings).toBeNull();
    });

    it('设置 appSettings 为包含更多字段的对象', () => {
      const fullSettings: AppSettings = {
        ...mockAppSettings,
        aiConnectorAddress: 'http://localhost:8000',
        enableAiTagging: true,
        thumbnailSize: 'medium' as any,
      };
      useSettingsStore.getState().setAppSettings(fullSettings);
      expect(useSettingsStore.getState().appSettings).toEqual(fullSettings);
    });
  });

  describe('setTheme', () => {
    it('设置 theme 为新值', () => {
      useSettingsStore.getState().setTheme(Theme.Light);
      expect(useSettingsStore.getState().theme).toBe(Theme.Light);
    });

    it('设置 theme 为 Dark', () => {
      useSettingsStore.getState().setTheme(Theme.Dark);
      expect(useSettingsStore.getState().theme).toBe(Theme.Dark);
    });

    it('设置 theme 为 Blue', () => {
      useSettingsStore.getState().setTheme(Theme.Blue);
      expect(useSettingsStore.getState().theme).toBe(Theme.Blue);
    });

    it('设置相同的 theme 不改变状态', () => {
      const initialTheme = useSettingsStore.getState().theme;
      useSettingsStore.getState().setTheme(initialTheme);
      expect(useSettingsStore.getState().theme).toBe(initialTheme);
    });
  });

  describe('setSupportedTypes', () => {
    it('设置 supportedTypes 为有效值', () => {
      useSettingsStore.getState().setSupportedTypes(mockSupportedTypes);
      expect(useSettingsStore.getState().supportedTypes).toEqual(mockSupportedTypes);
    });

    it('设置 supportedTypes 为 null', () => {
      useSettingsStore.getState().setSupportedTypes(mockSupportedTypes);
      useSettingsStore.getState().setSupportedTypes(null);
      expect(useSettingsStore.getState().supportedTypes).toBeNull();
    });

    it('设置空数组的 supportedTypes', () => {
      const emptyTypes: SupportedTypes = { nonRaw: [], raw: [] };
      useSettingsStore.getState().setSupportedTypes(emptyTypes);
      expect(useSettingsStore.getState().supportedTypes).toEqual(emptyTypes);
    });
  });

  describe('handleSettingsChange', () => {
    beforeEach(() => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('null 输入时打印错误并返回，不调用 invoke', async () => {
      const initialTheme = useSettingsStore.getState().theme;
      const initialAppSettings = useSettingsStore.getState().appSettings;

      await useSettingsStore.getState().handleSettingsChange(null as any);

      expect(console.error).toHaveBeenCalledWith(
        'handleSettingsChange was called with null settings. Aborting save operation.'
      );
      expect(invoke).not.toHaveBeenCalled();
      expect(useSettingsStore.getState().theme).toBe(initialTheme);
      expect(useSettingsStore.getState().appSettings).toBe(initialAppSettings);
    });

    it('undefined 输入时打印错误并返回，不调用 invoke', async () => {
      const initialTheme = useSettingsStore.getState().theme;
      const initialAppSettings = useSettingsStore.getState().appSettings;

      await useSettingsStore.getState().handleSettingsChange(undefined as any);

      expect(console.error).toHaveBeenCalledWith(
        'handleSettingsChange was called with null settings. Aborting save operation.'
      );
      expect(invoke).not.toHaveBeenCalled();
      expect(useSettingsStore.getState().theme).toBe(initialTheme);
      expect(useSettingsStore.getState().appSettings).toBe(initialAppSettings);
    });

    it('theme 变化时更新 theme', async () => {
      const newSettings: AppSettings = {
        ...mockAppSettings,
        theme: Theme.Blue,
      };

      vi.mocked(invoke).mockResolvedValue(undefined);

      await useSettingsStore.getState().handleSettingsChange(newSettings);

      expect(useSettingsStore.getState().theme).toBe(Theme.Blue);
    });

    it('theme 不变时不更新 theme', async () => {
      useSettingsStore.setState({ theme: Theme.Light });
      const newSettings: AppSettings = {
        ...mockAppSettings,
        theme: Theme.Light,
      };

      vi.mocked(invoke).mockResolvedValue(undefined);

      await useSettingsStore.getState().handleSettingsChange(newSettings);

      expect(useSettingsStore.getState().theme).toBe(Theme.Light);
    });

    it('更新 appSettings', async () => {
      const newSettings: AppSettings = {
        ...mockAppSettings,
        aiConnectorAddress: 'http://test:8000',
        enableAiTagging: true,
      };

      vi.mocked(invoke).mockResolvedValue(undefined);

      await useSettingsStore.getState().handleSettingsChange(newSettings);

      expect(useSettingsStore.getState().appSettings).toEqual(newSettings);
    });

    it('调用 invoke 保存设置', async () => {
      const newSettings: AppSettings = {
        ...mockAppSettings,
        theme: Theme.Dark,
      };

      vi.mocked(invoke).mockResolvedValue(undefined);

      await useSettingsStore.getState().handleSettingsChange(newSettings);

      expect(invoke).toHaveBeenCalledTimes(1);
      expect(invoke).toHaveBeenCalledWith(Invokes.SaveSettings, {
        settings: expect.any(Object),
      });
    });

    it('保存时排除 searchCriteria 字段', async () => {
      const newSettings: AppSettings & { searchCriteria?: any } = {
        ...mockAppSettings,
        theme: Theme.Dark,
      } as any;
      (newSettings as any).searchCriteria = { test: 'value' };

      vi.mocked(invoke).mockResolvedValue(undefined);

      await useSettingsStore.getState().handleSettingsChange(newSettings);

      expect(invoke).toHaveBeenCalledWith(Invokes.SaveSettings, {
        settings: expect.not.objectContaining({
          searchCriteria: expect.anything(),
        }),
      });

      const callArgs = vi.mocked(invoke).mock.calls[0][1] as { settings: any };
      expect(callArgs.settings.searchCriteria).toBeUndefined();
    });

    it('appSettings 中保留 searchCriteria 字段', async () => {
      const newSettings: AppSettings & { searchCriteria?: any } = {
        ...mockAppSettings,
        theme: Theme.Dark,
      } as any;
      (newSettings as any).searchCriteria = { test: 'value' };

      vi.mocked(invoke).mockResolvedValue(undefined);

      await useSettingsStore.getState().handleSettingsChange(newSettings);

      expect(useSettingsStore.getState().appSettings).toEqual(newSettings);
    });

    it('invoke 失败时打印错误', async () => {
      const newSettings: AppSettings = {
        ...mockAppSettings,
        theme: Theme.Dark,
      };

      const mockError = new Error('save failed');
      vi.mocked(invoke).mockRejectedValue(mockError);

      await useSettingsStore.getState().handleSettingsChange(newSettings);

      expect(console.error).toHaveBeenCalledWith('Failed to save settings:', mockError);
    });

    it('invoke 失败时 appSettings 仍然更新', async () => {
      const newSettings: AppSettings = {
        ...mockAppSettings,
        theme: Theme.Dark,
      };

      vi.mocked(invoke).mockRejectedValue(new Error('save failed'));

      await useSettingsStore.getState().handleSettingsChange(newSettings);

      expect(useSettingsStore.getState().appSettings).toEqual(newSettings);
    });

    it('invoke 失败时 theme 仍然更新', async () => {
      const newSettings: AppSettings = {
        ...mockAppSettings,
        theme: Theme.Arctic,
      };

      vi.mocked(invoke).mockRejectedValue(new Error('save failed'));

      await useSettingsStore.getState().handleSettingsChange(newSettings);

      expect(useSettingsStore.getState().theme).toBe(Theme.Arctic);
    });

    it('theme 为空字符串时不更新 theme', async () => {
      const originalTheme = useSettingsStore.getState().theme;
      const newSettings: AppSettings = {
        ...mockAppSettings,
        theme: '' as any,
      };

      vi.mocked(invoke).mockResolvedValue(undefined);

      await useSettingsStore.getState().handleSettingsChange(newSettings);

      expect(useSettingsStore.getState().theme).toBe(originalTheme);
    });

    it('保存设置时保留除 searchCriteria 外的所有字段', async () => {
      const newSettings: AppSettings = {
        theme: Theme.Light,
        lastRootPath: '/test/path',
        aiConnectorAddress: 'http://localhost:8000',
        enableAiTagging: true,
        libraryViewMode: 'flat' as any,
        thumbnailSize: 'medium' as any,
      };

      vi.mocked(invoke).mockResolvedValue(undefined);

      await useSettingsStore.getState().handleSettingsChange(newSettings);

      const callArgs = vi.mocked(invoke).mock.calls[0][1] as { settings: any };
      expect(callArgs.settings.theme).toBe(Theme.Light);
      expect(callArgs.settings.lastRootPath).toBe('/test/path');
      expect(callArgs.settings.aiConnectorAddress).toBe('http://localhost:8000');
      expect(callArgs.settings.enableAiTagging).toBe(true);
      expect(callArgs.settings.libraryViewMode).toBe('flat');
      expect(callArgs.settings.thumbnailSize).toBe('medium');
    });
  });
});
