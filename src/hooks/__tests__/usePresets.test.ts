import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { usePresets, PresetListType, UserPreset } from '../usePresets';
import { INITIAL_ADJUSTMENTS, Adjustments } from '../../utils/adjustments';
import { Invokes, Preset } from '../../components/ui/AppProperties';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('lodash.debounce', () => ({
  default: (fn: any) => {
    const debounced = (...args: any[]) => fn(...args);
    debounced.cancel = () => {};
    debounced.flush = () => {};
    return debounced;
  },
}));

const mockInvoke = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: any[]) => mockInvoke(...args),
}));

Object.defineProperty(globalThis, 'crypto', {
  value: {
    randomUUID: () => `test-uuid-${Math.random().toString(36).substr(2, 9)}`,
  },
  writable: true,
  configurable: true,
});

const createMockAdjustments = (overrides: Partial<Adjustments> = {}): Adjustments => {
  return {
    ...JSON.parse(JSON.stringify(INITIAL_ADJUSTMENTS)),
    ...overrides,
  };
};

const createMockPreset = (overrides: Partial<Preset> = {}): Preset => ({
  id: 'preset-1',
  name: 'Test Preset',
  adjustments: { exposure: 0.5, contrast: 0.3 },
  includeMasks: false,
  includeCropTransform: false,
  presetType: 'style',
  ...overrides,
});

const createMockUserPreset = (preset: Preset): UserPreset => ({ preset });

const createMockFolder = (id: string, name: string, children: Preset[] = []): UserPreset => ({
  folder: { id, name, children },
});

describe('usePresets', () => {
  const mockAdjustments = createMockAdjustments({ exposure: 0.5, contrast: 0.3 });

  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === Invokes.LoadPresets) {
        return Promise.resolve([]);
      }
      return Promise.resolve();
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('返回值结构', () => {
    it('返回所有预期的字段和函数', async () => {
      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const keys = Object.keys(result.current);
      const expectedKeys = [
        'addFolder',
        'addPreset',
        'configurePreset',
        'deleteItem',
        'duplicatePreset',
        'exportPresetsToFile',
        'importPresetsFromFile',
        'importLegacyPresetsFromFile',
        'isLoading',
        'movePreset',
        'overwritePreset',
        'presets',
        'refreshPresets',
        'renameItem',
        'reorderItems',
        'sortAllPresetsAlphabetically',
      ];

      expect(keys).toEqual(expect.arrayContaining(expectedKeys));
      expect(keys.length).toBe(expectedKeys.length);
    });

    it('所有函数都是函数类型', async () => {
      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(typeof result.current.addFolder).toBe('function');
      expect(typeof result.current.addPreset).toBe('function');
      expect(typeof result.current.configurePreset).toBe('function');
      expect(typeof result.current.deleteItem).toBe('function');
      expect(typeof result.current.duplicatePreset).toBe('function');
      expect(typeof result.current.exportPresetsToFile).toBe('function');
      expect(typeof result.current.importPresetsFromFile).toBe('function');
      expect(typeof result.current.importLegacyPresetsFromFile).toBe('function');
      expect(typeof result.current.movePreset).toBe('function');
      expect(typeof result.current.overwritePreset).toBe('function');
      expect(typeof result.current.refreshPresets).toBe('function');
      expect(typeof result.current.renameItem).toBe('function');
      expect(typeof result.current.reorderItems).toBe('function');
      expect(typeof result.current.sortAllPresetsAlphabetically).toBe('function');
    });

    it('presets 是数组', async () => {
      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(Array.isArray(result.current.presets)).toBe(true);
    });

    it('isLoading 是布尔值', async () => {
      const { result } = renderHook(() => usePresets(mockAdjustments));

      expect(typeof result.current.isLoading).toBe('boolean');
    });
  });

  describe('初始加载', () => {
    it('初始 isLoading 为 true，加载完成后为 false', async () => {
      const { result } = renderHook(() => usePresets(mockAdjustments));

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('调用 LoadPresets 从后端加载预设', async () => {
      renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith(Invokes.LoadPresets);
      });
    });

    it('加载预设后正确设置 presets 状态', async () => {
      const mockPresets: UserPreset[] = [
        createMockUserPreset(createMockPreset({ id: 'p1', name: 'Preset 1' })),
        createMockFolder('f1', 'Folder 1', [createMockPreset({ id: 'p2', name: 'Preset 2' })]),
      ];

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.LoadPresets) {
          return Promise.resolve(mockPresets);
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.presets).toHaveLength(2);
      });

      expect(result.current.presets[0].preset?.id).toBe('p1');
      expect(result.current.presets[1].folder?.id).toBe('f1');
      expect(result.current.presets[1].folder?.children).toHaveLength(1);
    });

    it('加载失败时预设列表为空', async () => {
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.LoadPresets) {
          return Promise.reject(new Error('Load failed'));
        }
        return Promise.resolve();
      });

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.presets).toEqual([]);
      consoleErrorSpy.mockRestore();
    });

    it('refreshPresets 重新加载预设', async () => {
      const mockPresets1: UserPreset[] = [createMockUserPreset(createMockPreset({ id: 'p1', name: 'Preset 1' }))];
      const mockPresets2: UserPreset[] = [
        createMockUserPreset(createMockPreset({ id: 'p2', name: 'Preset 2' })),
        createMockUserPreset(createMockPreset({ id: 'p3', name: 'Preset 3' })),
      ];

      let callCount = 0;
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.LoadPresets) {
          callCount++;
          return Promise.resolve(callCount === 1 ? mockPresets1 : mockPresets2);
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.presets).toHaveLength(1);
      });

      await act(async () => {
        await result.current.refreshPresets();
      });

      expect(result.current.presets).toHaveLength(2);
      expect(result.current.presets[0].preset?.id).toBe('p2');
    });
  });

  describe('addPreset - 创建新预设', () => {
    it('创建根级别的 style 预设', async () => {
      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let newPreset: any;
      act(() => {
        newPreset = result.current.addPreset('My Preset');
      });

      expect(result.current.presets).toHaveLength(1);
      expect(result.current.presets[0].preset?.name).toBe('My Preset');
      expect(result.current.presets[0].preset?.presetType).toBe('style');
      expect(newPreset.name).toBe('My Preset');
      expect(newPreset.id).toBeDefined();
    });

    it('创建 tool 类型预设，只保存非默认值', async () => {
      const adjustments = createMockAdjustments({
        exposure: 0.5,
        contrast: 0,
      });

      const { result } = renderHook(() => usePresets(adjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.addPreset('Tool Preset', null, false, false, 'tool');
      });

      const preset = result.current.presets[0].preset;
      expect(preset?.presetType).toBe('tool');
      expect(preset?.adjustments.exposure).toBe(0.5);
      expect(preset?.adjustments.contrast).toBeUndefined();
    });

    it('在文件夹中创建预设', async () => {
      const initialPresets: UserPreset[] = [createMockFolder('folder-1', 'My Folder')];

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.LoadPresets) {
          return Promise.resolve(initialPresets);
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.addPreset('Folder Preset', 'folder-1');
      });

      const folder = result.current.presets[0].folder;
      expect(folder?.children).toHaveLength(1);
      expect(folder?.children[0].name).toBe('Folder Preset');
    });

    it('包含蒙版时保存蒙版设置', async () => {
      const adjustments = createMockAdjustments({
        masks: [{ id: 'mask-1', name: 'Mask 1' }],
      } as any);

      const { result } = renderHook(() => usePresets(adjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.addPreset('Mask Preset', null, true);
      });

      const preset = result.current.presets[0].preset;
      expect(preset?.includeMasks).toBe(true);
      expect(preset?.adjustments.masks).toBeDefined();
    });

    it('不包含蒙版时排除蒙版设置', async () => {
      const adjustments = createMockAdjustments({
        masks: [{ id: 'mask-1', name: 'Mask 1' }],
      } as any);

      const { result } = renderHook(() => usePresets(adjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.addPreset('No Mask Preset', null, false);
      });

      const preset = result.current.presets[0].preset;
      expect(preset?.includeMasks).toBe(false);
      expect(preset?.adjustments.masks).toBeUndefined();
    });

    it('包含裁剪变换时保存几何设置', async () => {
      const adjustments = createMockAdjustments({
        crop: { x: 0, y: 0, width: 100, height: 100 },
      } as any);

      const { result } = renderHook(() => usePresets(adjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.addPreset('Crop Preset', null, false, true);
      });

      const preset = result.current.presets[0].preset;
      expect(preset?.includeCropTransform).toBe(true);
      expect(preset?.adjustments.crop).toBeDefined();
    });

    it('不包含裁剪变换时排除几何设置', async () => {
      const adjustments = createMockAdjustments({
        crop: { x: 0, y: 0, width: 100, height: 100 },
      } as any);

      const { result } = renderHook(() => usePresets(adjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.addPreset('No Crop Preset', null, false, false);
      });

      const preset = result.current.presets[0].preset;
      expect(preset?.includeCropTransform).toBe(false);
      expect(preset?.adjustments.crop).toBeUndefined();
    });

    it('创建预设后保存到后端', async () => {
      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.addPreset('Save Test');
      });

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith(
          Invokes.SavePresets,
          expect.objectContaining({ presets: expect.any(Array) }),
        );
      });
    });
  });

  describe('addFolder - 创建文件夹', () => {
    it('创建新文件夹', async () => {
      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.addFolder('New Folder');
      });

      expect(result.current.presets).toHaveLength(1);
      expect(result.current.presets[0].folder?.name).toBe('New Folder');
      expect(result.current.presets[0].folder?.children).toEqual([]);
    });

    it('文件夹插入在预设之前', async () => {
      const initialPresets: UserPreset[] = [createMockUserPreset(createMockPreset({ id: 'p1', name: 'Preset 1' }))];

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.LoadPresets) {
          return Promise.resolve(initialPresets);
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.addFolder('New Folder');
      });

      expect(result.current.presets[0].folder).toBeDefined();
      expect(result.current.presets[1].preset?.id).toBe('p1');
    });

    it('空列表时文件夹添加到末尾', async () => {
      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.addFolder('First Folder');
      });

      expect(result.current.presets).toHaveLength(1);
      expect(result.current.presets[0].folder?.name).toBe('First Folder');
    });

    it('创建文件夹后保存到后端', async () => {
      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.addFolder('Save Folder');
      });

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith(
          Invokes.SavePresets,
          expect.objectContaining({ presets: expect.any(Array) }),
        );
      });
    });
  });

  describe('deleteItem - 删除项目', () => {
    it('删除根级别预设', async () => {
      const initialPresets: UserPreset[] = [
        createMockUserPreset(createMockPreset({ id: 'p1', name: 'Preset 1' })),
        createMockUserPreset(createMockPreset({ id: 'p2', name: 'Preset 2' })),
      ];

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.LoadPresets) {
          return Promise.resolve(initialPresets);
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.deleteItem('p1');
      });

      expect(result.current.presets).toHaveLength(1);
      expect(result.current.presets[0].preset?.id).toBe('p2');
    });

    it('删除文件夹', async () => {
      const initialPresets: UserPreset[] = [
        createMockFolder('f1', 'Folder 1'),
        createMockUserPreset(createMockPreset({ id: 'p1', name: 'Preset 1' })),
      ];

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.LoadPresets) {
          return Promise.resolve(initialPresets);
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.deleteItem('f1');
      });

      expect(result.current.presets).toHaveLength(1);
      expect(result.current.presets[0].preset?.id).toBe('p1');
    });

    it('删除文件夹中的预设', async () => {
      const initialPresets: UserPreset[] = [
        createMockFolder('f1', 'Folder 1', [
          createMockPreset({ id: 'p1', name: 'Preset 1' }),
          createMockPreset({ id: 'p2', name: 'Preset 2' }),
        ]),
      ];

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.LoadPresets) {
          return Promise.resolve(initialPresets);
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.deleteItem('p1');
      });

      const folder = result.current.presets[0].folder;
      expect(folder?.children).toHaveLength(1);
      expect(folder?.children[0].id).toBe('p2');
    });

    it('删除不存在的 id 不改变列表', async () => {
      const initialPresets: UserPreset[] = [createMockUserPreset(createMockPreset({ id: 'p1', name: 'Preset 1' }))];

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.LoadPresets) {
          return Promise.resolve(initialPresets);
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.deleteItem('nonexistent');
      });

      expect(result.current.presets).toHaveLength(1);
    });

    it('删除后保存到后端', async () => {
      const initialPresets: UserPreset[] = [createMockUserPreset(createMockPreset({ id: 'p1', name: 'Preset 1' }))];

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.LoadPresets) {
          return Promise.resolve(initialPresets);
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.deleteItem('p1');
      });

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith(Invokes.SavePresets, expect.objectContaining({ presets: [] }));
      });
    });
  });

  describe('renameItem - 重命名项目', () => {
    it('重命名根级别预设', async () => {
      const initialPresets: UserPreset[] = [createMockUserPreset(createMockPreset({ id: 'p1', name: 'Old Name' }))];

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.LoadPresets) {
          return Promise.resolve(initialPresets);
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.renameItem('p1', 'New Name');
      });

      expect(result.current.presets[0].preset?.name).toBe('New Name');
    });

    it('重命名文件夹', async () => {
      const initialPresets: UserPreset[] = [createMockFolder('f1', 'Old Folder')];

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.LoadPresets) {
          return Promise.resolve(initialPresets);
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.renameItem('f1', 'New Folder');
      });

      expect(result.current.presets[0].folder?.name).toBe('New Folder');
    });

    it('重命名文件夹中的预设', async () => {
      const initialPresets: UserPreset[] = [
        createMockFolder('f1', 'Folder 1', [createMockPreset({ id: 'p1', name: 'Old Name' })]),
      ];

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.LoadPresets) {
          return Promise.resolve(initialPresets);
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.renameItem('p1', 'New Name');
      });

      expect(result.current.presets[0].folder?.children[0].name).toBe('New Name');
    });

    it('重命名不存在的 id 不改变列表', async () => {
      const initialPresets: UserPreset[] = [createMockUserPreset(createMockPreset({ id: 'p1', name: 'Preset 1' }))];

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.LoadPresets) {
          return Promise.resolve(initialPresets);
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.renameItem('nonexistent', 'New Name');
      });

      expect(result.current.presets[0].preset?.name).toBe('Preset 1');
    });

    it('重命名后保存到后端', async () => {
      const initialPresets: UserPreset[] = [createMockUserPreset(createMockPreset({ id: 'p1', name: 'Old' }))];

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.LoadPresets) {
          return Promise.resolve(initialPresets);
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.renameItem('p1', 'New');
      });

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith(
          Invokes.SavePresets,
          expect.objectContaining({ presets: expect.any(Array) }),
        );
      });
    });
  });

  describe('configurePreset - 配置预设', () => {
    it('更新预设名称', async () => {
      const initialPresets: UserPreset[] = [createMockUserPreset(createMockPreset({ id: 'p1', name: 'Old Name' }))];

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.LoadPresets) {
          return Promise.resolve(initialPresets);
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.configurePreset('p1', 'New Name', false, false, 'style');
      });

      expect(result.current.presets[0].preset?.name).toBe('New Name');
    });

    it('从 style 切换到 tool 类型时移除默认值', async () => {
      const presetWithDefaults = createMockPreset({
        id: 'p1',
        name: 'Style Preset',
        presetType: 'style',
        adjustments: {
          exposure: 0.5,
          contrast: 0,
          brightness: 0,
        },
      });

      const initialPresets: UserPreset[] = [createMockUserPreset(presetWithDefaults)];

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.LoadPresets) {
          return Promise.resolve(initialPresets);
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.configurePreset('p1', 'Tool Preset', false, false, 'tool');
      });

      const preset = result.current.presets[0].preset;
      expect(preset?.presetType).toBe('tool');
      expect(preset?.adjustments.exposure).toBe(0.5);
      expect(preset?.adjustments.contrast).toBeUndefined();
      expect(preset?.adjustments.brightness).toBeUndefined();
    });

    it('从 tool 切换到 style 类型时添加缺失的默认值', async () => {
      const toolPreset = createMockPreset({
        id: 'p1',
        name: 'Tool Preset',
        presetType: 'tool',
        adjustments: {
          exposure: 0.5,
        },
      });

      const initialPresets: UserPreset[] = [createMockUserPreset(toolPreset)];

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.LoadPresets) {
          return Promise.resolve(initialPresets);
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.configurePreset('p1', 'Style Preset', false, false, 'style');
      });

      const preset = result.current.presets[0].preset;
      expect(preset?.presetType).toBe('style');
      expect(preset?.adjustments.exposure).toBe(0.5);
    });

    it('配置文件夹中的预设', async () => {
      const initialPresets: UserPreset[] = [
        createMockFolder('f1', 'Folder 1', [createMockPreset({ id: 'p1', name: 'Old Name' })]),
      ];

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.LoadPresets) {
          return Promise.resolve(initialPresets);
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.configurePreset('p1', 'New Name', false, false, 'style');
      });

      expect(result.current.presets[0].folder?.children[0].name).toBe('New Name');
    });

    it('预设不存在时返回 null', async () => {
      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let resultValue: any;
      act(() => {
        resultValue = result.current.configurePreset('nonexistent', 'Name', false, false, 'style');
      });

      expect(resultValue).toBeNull();
    });

    it('配置后保存到后端', async () => {
      const initialPresets: UserPreset[] = [createMockUserPreset(createMockPreset({ id: 'p1', name: 'Old' }))];

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.LoadPresets) {
          return Promise.resolve(initialPresets);
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.configurePreset('p1', 'New', false, false, 'style');
      });

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith(
          Invokes.SavePresets,
          expect.objectContaining({ presets: expect.any(Array) }),
        );
      });
    });
  });

  describe('overwritePreset - 覆盖预设', () => {
    it('用当前调整值覆盖预设', async () => {
      const initialPreset = createMockPreset({
        id: 'p1',
        name: 'Original',
        adjustments: { exposure: 0, contrast: 0 },
      });

      const initialPresets: UserPreset[] = [createMockUserPreset(initialPreset)];

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.LoadPresets) {
          return Promise.resolve(initialPresets);
        }
        return Promise.resolve();
      });

      const adjustments = createMockAdjustments({ exposure: 0.8, contrast: 0.5 });
      const { result } = renderHook(() => usePresets(adjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.overwritePreset('p1');
      });

      const preset = result.current.presets[0].preset;
      expect(preset?.adjustments.exposure).toBe(0.8);
      expect(preset?.adjustments.contrast).toBe(0.5);
    });

    it('覆盖文件夹中的预设', async () => {
      const initialPresets: UserPreset[] = [
        createMockFolder('f1', 'Folder 1', [
          createMockPreset({ id: 'p1', name: 'Preset', adjustments: { exposure: 0 } }),
        ]),
      ];

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.LoadPresets) {
          return Promise.resolve(initialPresets);
        }
        return Promise.resolve();
      });

      const adjustments = createMockAdjustments({ exposure: 0.9 });
      const { result } = renderHook(() => usePresets(adjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.overwritePreset('p1');
      });

      expect(result.current.presets[0].folder?.children[0].adjustments.exposure).toBe(0.9);
    });

    it('预设不存在时返回 null', async () => {
      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let resultValue: any;
      act(() => {
        resultValue = result.current.overwritePreset('nonexistent');
      });

      expect(resultValue).toBeNull();
    });
  });

  describe('duplicatePreset - 复制预设', () => {
    it('复制根级别预设', async () => {
      const initialPresets: UserPreset[] = [createMockUserPreset(createMockPreset({ id: 'p1', name: 'Original' }))];

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.LoadPresets) {
          return Promise.resolve(initialPresets);
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.duplicatePreset('p1');
      });

      expect(result.current.presets).toHaveLength(2);
      expect(result.current.presets[0].preset?.id).toBe('p1');
      expect(result.current.presets[1].preset?.name).toBe('Original Copy');
      expect(result.current.presets[1].preset?.id).not.toBe('p1');
    });

    it('复制文件夹中的预设', async () => {
      const initialPresets: UserPreset[] = [
        createMockFolder('f1', 'Folder 1', [createMockPreset({ id: 'p1', name: 'Original' })]),
      ];

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.LoadPresets) {
          return Promise.resolve(initialPresets);
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.duplicatePreset('p1');
      });

      const folder = result.current.presets[0].folder;
      expect(folder?.children).toHaveLength(2);
      expect(folder?.children[0].id).toBe('p1');
      expect(folder?.children[1].name).toBe('Original Copy');
    });

    it('复制的预设保留调整值', async () => {
      const initialPresets: UserPreset[] = [
        createMockUserPreset(
          createMockPreset({
            id: 'p1',
            name: 'Original',
            adjustments: { exposure: 0.5, contrast: 0.3 },
          }),
        ),
      ];

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.LoadPresets) {
          return Promise.resolve(initialPresets);
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.duplicatePreset('p1');
      });

      const duplicated = result.current.presets[1].preset;
      expect(duplicated?.adjustments.exposure).toBe(0.5);
      expect(duplicated?.adjustments.contrast).toBe(0.3);
    });

    it('预设不存在时返回 null', async () => {
      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let resultValue: any;
      act(() => {
        resultValue = result.current.duplicatePreset('nonexistent');
      });

      expect(resultValue).toBeNull();
    });
  });

  describe('movePreset - 移动预设', () => {
    it('将根级别预设移动到文件夹中', async () => {
      const initialPresets: UserPreset[] = [
        createMockFolder('f1', 'Folder 1'),
        createMockUserPreset(createMockPreset({ id: 'p1', name: 'Preset 1' })),
      ];

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.LoadPresets) {
          return Promise.resolve(initialPresets);
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.movePreset('p1', 'f1');
      });

      expect(result.current.presets).toHaveLength(1);
      expect(result.current.presets[0].folder?.children).toHaveLength(1);
      expect(result.current.presets[0].folder?.children[0].id).toBe('p1');
    });

    it('将预设从文件夹移动到根级别', async () => {
      const initialPresets: UserPreset[] = [
        createMockFolder('f1', 'Folder 1', [createMockPreset({ id: 'p1', name: 'Preset 1' })]),
      ];

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.LoadPresets) {
          return Promise.resolve(initialPresets);
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.movePreset('p1', null);
      });

      expect(result.current.presets[0].folder?.children).toHaveLength(0);
      expect(result.current.presets[1].preset?.id).toBe('p1');
    });

    it('在文件夹之间移动预设', async () => {
      const initialPresets: UserPreset[] = [
        createMockFolder('f1', 'Folder 1', [createMockPreset({ id: 'p1', name: 'Preset 1' })]),
        createMockFolder('f2', 'Folder 2'),
      ];

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.LoadPresets) {
          return Promise.resolve(initialPresets);
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.movePreset('p1', 'f2');
      });

      expect(result.current.presets[0].folder?.children).toHaveLength(0);
      expect(result.current.presets[1].folder?.children).toHaveLength(1);
      expect(result.current.presets[1].folder?.children[0].id).toBe('p1');
    });

    it('预设不存在时不做任何操作', async () => {
      const initialPresets: UserPreset[] = [createMockFolder('f1', 'Folder 1')];

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.LoadPresets) {
          return Promise.resolve(initialPresets);
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const presetsBefore = JSON.parse(JSON.stringify(result.current.presets));

      act(() => {
        result.current.movePreset('nonexistent', 'f1');
      });

      expect(result.current.presets).toEqual(presetsBefore);
    });
  });

  describe('reorderItems - 重新排序项目', () => {
    it('重新排序根级别项目', async () => {
      const initialPresets: UserPreset[] = [
        createMockUserPreset(createMockPreset({ id: 'p1', name: 'Preset 1' })),
        createMockUserPreset(createMockPreset({ id: 'p2', name: 'Preset 2' })),
        createMockUserPreset(createMockPreset({ id: 'p3', name: 'Preset 3' })),
      ];

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.LoadPresets) {
          return Promise.resolve(initialPresets);
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.reorderItems('p1', 'p3');
      });

      expect(result.current.presets[0].preset?.id).toBe('p2');
      expect(result.current.presets[1].preset?.id).toBe('p3');
      expect(result.current.presets[2].preset?.id).toBe('p1');
    });

    it('重新排序文件夹中的项目', async () => {
      const initialPresets: UserPreset[] = [
        createMockFolder('f1', 'Folder 1', [
          createMockPreset({ id: 'p1', name: 'Preset 1' }),
          createMockPreset({ id: 'p2', name: 'Preset 2' }),
          createMockPreset({ id: 'p3', name: 'Preset 3' }),
        ]),
      ];

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.LoadPresets) {
          return Promise.resolve(initialPresets);
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.reorderItems('p1', 'p3');
      });

      const children = result.current.presets[0].folder?.children;
      expect(children?.[0].id).toBe('p2');
      expect(children?.[1].id).toBe('p3');
      expect(children?.[2].id).toBe('p1');
    });

    it('id 不存在时不改变顺序', async () => {
      const initialPresets: UserPreset[] = [
        createMockUserPreset(createMockPreset({ id: 'p1', name: 'Preset 1' })),
        createMockUserPreset(createMockPreset({ id: 'p2', name: 'Preset 2' })),
      ];

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.LoadPresets) {
          return Promise.resolve(initialPresets);
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const presetsBefore = JSON.parse(JSON.stringify(result.current.presets));

      act(() => {
        result.current.reorderItems('nonexistent', 'p2');
      });

      expect(result.current.presets).toEqual(presetsBefore);
    });
  });

  describe('sortAllPresetsAlphabetically - 字母排序', () => {
    it('按字母顺序排序根级别预设', async () => {
      const initialPresets: UserPreset[] = [
        createMockUserPreset(createMockPreset({ id: 'p3', name: 'Zebra' })),
        createMockUserPreset(createMockPreset({ id: 'p1', name: 'Apple' })),
        createMockUserPreset(createMockPreset({ id: 'p2', name: 'Mango' })),
      ];

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.LoadPresets) {
          return Promise.resolve(initialPresets);
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.sortAllPresetsAlphabetically();
      });

      const presetNames = result.current.presets.map((p) => p.preset?.name);
      expect(presetNames).toEqual(['Apple', 'Mango', 'Zebra']);
    });

    it('按字母顺序排序文件夹并排在预设前面', async () => {
      const initialPresets: UserPreset[] = [
        createMockUserPreset(createMockPreset({ id: 'p1', name: 'Apple Preset' })),
        createMockFolder('f2', 'Zebra Folder'),
        createMockFolder('f1', 'Apple Folder'),
      ];

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.LoadPresets) {
          return Promise.resolve(initialPresets);
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.sortAllPresetsAlphabetically();
      });

      expect(result.current.presets[0].folder?.name).toBe('Apple Folder');
      expect(result.current.presets[1].folder?.name).toBe('Zebra Folder');
      expect(result.current.presets[2].preset?.name).toBe('Apple Preset');
    });

    it('排序文件夹内的预设', async () => {
      const initialPresets: UserPreset[] = [
        createMockFolder('f1', 'Folder 1', [
          createMockPreset({ id: 'p3', name: 'Zebra' }),
          createMockPreset({ id: 'p1', name: 'Apple' }),
          createMockPreset({ id: 'p2', name: 'Mango' }),
        ]),
      ];

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.LoadPresets) {
          return Promise.resolve(initialPresets);
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.sortAllPresetsAlphabetically();
      });

      const children = result.current.presets[0].folder?.children;
      expect(children?.[0].name).toBe('Apple');
      expect(children?.[1].name).toBe('Mango');
      expect(children?.[2].name).toBe('Zebra');
    });

    it('排序后保存到后端', async () => {
      const initialPresets: UserPreset[] = [
        createMockUserPreset(createMockPreset({ id: 'p2', name: 'B' })),
        createMockUserPreset(createMockPreset({ id: 'p1', name: 'A' })),
      ];

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.LoadPresets) {
          return Promise.resolve(initialPresets);
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.sortAllPresetsAlphabetically();
      });

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith(
          Invokes.SavePresets,
          expect.objectContaining({ presets: expect.any(Array) }),
        );
      });
    });
  });

  describe('importPresetsFromFile - 从文件导入预设', () => {
    it('成功导入预设', async () => {
      const importedPresets: UserPreset[] = [
        createMockUserPreset(createMockPreset({ id: 'imported-1', name: 'Imported 1' })),
      ];

      mockInvoke.mockImplementation((cmd: string, args: any) => {
        if (cmd === Invokes.LoadPresets) {
          return Promise.resolve([]);
        }
        if (cmd === Invokes.HandleImportPresetsFromFile) {
          expect(args.filePath).toBe('/path/to/presets.json');
          return Promise.resolve(importedPresets);
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.importPresetsFromFile('/path/to/presets.json');
      });

      expect(result.current.presets).toHaveLength(1);
      expect(result.current.presets[0].preset?.id).toBe('imported-1');
    });

    it('导入失败时抛出错误', async () => {
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.LoadPresets) {
          return Promise.resolve([]);
        }
        if (cmd === Invokes.HandleImportPresetsFromFile) {
          return Promise.reject(new Error('Import failed'));
        }
        return Promise.resolve();
      });

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await expect(result.current.importPresetsFromFile('/bad/path.json')).rejects.toThrow('Import failed');
      });

      consoleErrorSpy.mockRestore();
    });

    it('导入期间设置 isLoading', async () => {
      let resolveImport: (value: any) => void;
      const importPromise = new Promise((resolve) => {
        resolveImport = resolve;
      });

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.LoadPresets) {
          return Promise.resolve([]);
        }
        if (cmd === Invokes.HandleImportPresetsFromFile) {
          return importPromise;
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.importPresetsFromFile('/path.json');
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(true);
      });

      act(() => {
        resolveImport!([]);
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });
  });

  describe('importLegacyPresetsFromFile - 导入旧版预设', () => {
    it('成功导入旧版预设', async () => {
      const importedPresets: UserPreset[] = [
        createMockUserPreset(createMockPreset({ id: 'legacy-1', name: 'Legacy 1' })),
      ];

      mockInvoke.mockImplementation((cmd: string, args: any) => {
        if (cmd === Invokes.LoadPresets) {
          return Promise.resolve([]);
        }
        if (cmd === Invokes.HandleImportLegacyPresetsFromFile) {
          expect(args.filePath).toBe('/path/to/legacy.json');
          return Promise.resolve(importedPresets);
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.importLegacyPresetsFromFile('/path/to/legacy.json');
      });

      expect(result.current.presets).toHaveLength(1);
      expect(result.current.presets[0].preset?.id).toBe('legacy-1');
    });

    it('导入失败时抛出错误', async () => {
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.LoadPresets) {
          return Promise.resolve([]);
        }
        if (cmd === Invokes.HandleImportLegacyPresetsFromFile) {
          return Promise.reject(new Error('Legacy import failed'));
        }
        return Promise.resolve();
      });

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await expect(result.current.importLegacyPresetsFromFile('/bad/path.json')).rejects.toThrow(
          'Legacy import failed',
        );
      });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('exportPresetsToFile - 导出预设到文件', () => {
    it('成功导出预设', async () => {
      mockInvoke.mockImplementation((cmd: string, args: any) => {
        if (cmd === Invokes.LoadPresets) {
          return Promise.resolve([]);
        }
        if (cmd === Invokes.HandleExportPresetsToFile) {
          expect(args.presetsToExport).toHaveLength(2);
          expect(args.filePath).toBe('/export/path.json');
          return Promise.resolve();
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const presetsToExport: UserPreset[] = [
        createMockUserPreset(createMockPreset({ id: 'e1', name: 'Export 1' })),
        createMockUserPreset(createMockPreset({ id: 'e2', name: 'Export 2' })),
      ];

      await act(async () => {
        await result.current.exportPresetsToFile(presetsToExport, '/export/path.json');
      });

      expect(mockInvoke).toHaveBeenCalledWith(
        Invokes.HandleExportPresetsToFile,
        expect.objectContaining({
          presetsToExport: expect.any(Array),
          filePath: '/export/path.json',
        }),
      );
    });

    it('导出失败时抛出错误', async () => {
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.LoadPresets) {
          return Promise.resolve([]);
        }
        if (cmd === Invokes.HandleExportPresetsToFile) {
          return Promise.reject(new Error('Export failed'));
        }
        return Promise.resolve();
      });

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await expect(result.current.exportPresetsToFile([], '/bad/path.json')).rejects.toThrow('Export failed');
      });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('持久化 - SavePresets', () => {
    it('添加预设后调用 SavePresets', async () => {
      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.addPreset('Test');
      });

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith(
          Invokes.SavePresets,
          expect.objectContaining({
            presets: expect.arrayContaining([
              expect.objectContaining({
                preset: expect.objectContaining({ name: 'Test' }),
              }),
            ]),
          }),
        );
      });
    });

    it('保存失败时打印错误', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.LoadPresets) {
          return Promise.resolve([]);
        }
        if (cmd === Invokes.SavePresets) {
          return Promise.reject(new Error('Save failed'));
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.addPreset('Test');
      });

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalled();
      });

      consoleErrorSpy.mockRestore();
    });
  });

  describe('PresetListType 枚举', () => {
    it('包含正确的枚举值', () => {
      expect(PresetListType.Folder).toBe('folder');
      expect(PresetListType.Preset).toBe('preset');
    });
  });

  describe('多操作组合', () => {
    it('创建文件夹然后添加预设到文件夹', async () => {
      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.addFolder('My Folder');
      });

      const folderId = result.current.presets[0].folder?.id!;

      act(() => {
        result.current.addPreset('Folder Preset', folderId);
      });

      expect(result.current.presets).toHaveLength(1);
      expect(result.current.presets[0].folder?.children).toHaveLength(1);
      expect(result.current.presets[0].folder?.children[0].name).toBe('Folder Preset');
    });

    it('复制预设然后重命名副本', async () => {
      const initialPresets: UserPreset[] = [createMockUserPreset(createMockPreset({ id: 'p1', name: 'Original' }))];

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === Invokes.LoadPresets) {
          return Promise.resolve(initialPresets);
        }
        return Promise.resolve();
      });

      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let duplicated: any;
      act(() => {
        duplicated = result.current.duplicatePreset('p1');
      });

      act(() => {
        result.current.renameItem(duplicated.id, 'Renamed Copy');
      });

      expect(result.current.presets[1].preset?.name).toBe('Renamed Copy');
    });

    it('创建多个预设然后删除其中一个', async () => {
      const { result } = renderHook(() => usePresets(mockAdjustments));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      let p1: any, p2: any, p3: any;
      act(() => {
        p1 = result.current.addPreset('Preset 1');
      });
      act(() => {
        p2 = result.current.addPreset('Preset 2');
      });
      act(() => {
        p3 = result.current.addPreset('Preset 3');
      });

      expect(result.current.presets).toHaveLength(3);

      act(() => {
        result.current.deleteItem(p2.id);
      });

      expect(result.current.presets).toHaveLength(2);
      expect(result.current.presets[0].preset?.id).toBe(p1.id);
      expect(result.current.presets[1].preset?.id).toBe(p3.id);
    });
  });
});
