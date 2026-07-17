import { describe, it, expect } from 'vitest';
import {
  FileFormats,
  FILE_FORMATS,
  ExportSettings,
  WatermarkAnchor,
  ExportState,
  Status,
  WatermarkSettings,
} from '../../ui/ExportImportProperties';
import { BUILT_IN_PRESETS, BuiltInPreset } from '../../../data/builtInPresets';
import { PresetListType, UserPreset } from '../../../hooks/usePresets';
import { useEditorStore } from '../../../store/useEditorStore';
import { useUIStore } from '../../../store/useUIStore';
import {
  INITIAL_ADJUSTMENTS,
  INITIAL_PORTRAIT_ADJUSTMENTS,
  normalizeLoadedAdjustments,
  Adjustments,
} from '../../../utils/adjustments';
import { Preset } from '../../ui/AppProperties';
import { Panel } from '../../ui/AppProperties';

// ============================================================
// 1. Export 导出模块
// ============================================================
describe('Export 模块', () => {
  describe('FileFormats 枚举', () => {
    it('包含 Jpeg', () => {
      expect(FileFormats.Jpeg).toBe('jpeg');
    });
    it('包含 Png', () => {
      expect(FileFormats.Png).toBe('png');
    });
    it('包含 Tiff', () => {
      expect(FileFormats.Tiff).toBe('tiff');
    });
    it('包含 Webp', () => {
      expect(FileFormats.Webp).toBe('webp');
    });
    it('包含 Jxl', () => {
      expect(FileFormats.Jxl).toBe('jxl');
    });
    it('包含 Cube', () => {
      expect(FileFormats.Cube).toBe('cube');
    });
  });

  describe('FILE_FORMATS 数组', () => {
    it('每个格式有 id, name, extensions', () => {
      for (const fmt of FILE_FORMATS) {
        expect(fmt).toHaveProperty('id');
        expect(fmt).toHaveProperty('name');
        expect(fmt).toHaveProperty('extensions');
        expect(Array.isArray(fmt.extensions)).toBe(true);
        expect(fmt.extensions.length).toBeGreaterThan(0);
      }
    });

    it('包含至少 6 种格式', () => {
      expect(FILE_FORMATS.length).toBeGreaterThanOrEqual(6);
    });
  });

  describe('ExportSettings 接口完整性', () => {
    it('具有所有必需字段', () => {
      const settings: ExportSettings = {
        filenameTemplate: null,
        jpegQuality: 90,
        keepMetadata: true,
        preserveTimestamps: false,
        resize: null,
        stripGps: true,
        watermark: null,
      };
      expect(settings).toHaveProperty('filenameTemplate');
      expect(settings).toHaveProperty('jpegQuality');
      expect(settings).toHaveProperty('keepMetadata');
      expect(settings).toHaveProperty('preserveTimestamps');
      expect(settings).toHaveProperty('resize');
      expect(settings).toHaveProperty('stripGps');
      expect(settings).toHaveProperty('watermark');
    });

    it('支持可选字段 exportMasks, preserveFolders, resize', () => {
      const settings: ExportSettings = {
        filenameTemplate: '{original_filename}_edited',
        jpegQuality: 85,
        keepMetadata: false,
        preserveTimestamps: true,
        preserveFolders: true,
        resize: { mode: 'longEdge', value: 2048, dontEnlarge: true },
        stripGps: false,
        exportMasks: true,
        watermark: null,
      };
      expect(settings.exportMasks).toBe(true);
      expect(settings.preserveFolders).toBe(true);
      expect(settings.resize).not.toBeNull();
      expect(settings.resize!.mode).toBe('longEdge');
      expect(settings.resize!.value).toBe(2048);
      expect(settings.resize!.dontEnlarge).toBe(true);
    });
  });

  describe('WatermarkAnchor 枚举', () => {
    it('包含 9 个锚点位置', () => {
      const anchorValues = Object.values(WatermarkAnchor);
      expect(anchorValues.length).toBe(9);
    });

    it('包含所有位置: TopLeft, TopCenter, TopRight, CenterLeft, Center, CenterRight, BottomLeft, BottomCenter, BottomRight', () => {
      expect(WatermarkAnchor.TopLeft).toBe('topLeft');
      expect(WatermarkAnchor.TopCenter).toBe('topCenter');
      expect(WatermarkAnchor.TopRight).toBe('topRight');
      expect(WatermarkAnchor.CenterLeft).toBe('centerLeft');
      expect(WatermarkAnchor.Center).toBe('center');
      expect(WatermarkAnchor.CenterRight).toBe('centerRight');
      expect(WatermarkAnchor.BottomLeft).toBe('bottomLeft');
      expect(WatermarkAnchor.BottomCenter).toBe('bottomCenter');
      expect(WatermarkAnchor.BottomRight).toBe('bottomRight');
    });
  });

  describe('ExportState', () => {
    it('包含 status, progress, errorMessage', () => {
      const state: ExportState = {
        status: Status.Idle,
        progress: { total: 0 },
        errorMessage: '',
      };
      expect(state).toHaveProperty('status');
      expect(state).toHaveProperty('progress');
      expect(state).toHaveProperty('errorMessage');
    });
  });

  describe('Status 枚举', () => {
    it('包含 Idle', () => {
      expect(Status.Idle).toBe('idle');
    });
    it('包含 Exporting', () => {
      expect(Status.Exporting).toBe('exporting');
    });
    it('包含 Success', () => {
      expect(Status.Success).toBe('success');
    });
    it('包含 Error', () => {
      expect(Status.Error).toBe('error');
    });
    it('包含 Cancelled', () => {
      expect(Status.Cancelled).toBe('cancelled');
    });
  });

  describe('Resize 结构', () => {
    it('支持 longEdge 模式', () => {
      const resize = { mode: 'longEdge', value: 2048, dontEnlarge: true };
      expect(resize.mode).toBe('longEdge');
    });
    it('支持 shortEdge 模式', () => {
      const resize = { mode: 'shortEdge', value: 1024, dontEnlarge: false };
      expect(resize.mode).toBe('shortEdge');
    });
    it('支持 width 模式', () => {
      const resize = { mode: 'width', value: 1920, dontEnlarge: true };
      expect(resize.mode).toBe('width');
    });
    it('支持 height 模式', () => {
      const resize = { mode: 'height', value: 1080, dontEnlarge: false };
      expect(resize.mode).toBe('height');
    });
  });

  describe('WatermarkSettings 结构', () => {
    it('包含 path, anchor, scale, spacing, opacity', () => {
      const watermark: WatermarkSettings = {
        path: '/path/to/watermark.png',
        anchor: WatermarkAnchor.BottomRight,
        scale: 10,
        spacing: 5,
        opacity: 75,
      };
      expect(watermark).toHaveProperty('path');
      expect(watermark).toHaveProperty('anchor');
      expect(watermark).toHaveProperty('scale');
      expect(watermark).toHaveProperty('spacing');
      expect(watermark).toHaveProperty('opacity');
    });
  });
});

// ============================================================
// 2. Presets 预设模块
// ============================================================
describe('Presets 预设模块', () => {
  describe('BUILT_IN_PRESETS', () => {
    it('是一个非空数组', () => {
      expect(Array.isArray(BUILT_IN_PRESETS)).toBe(true);
      expect(BUILT_IN_PRESETS.length).toBeGreaterThan(0);
    });

    it('每个预设包含 id, name, nameZh, type, category, adjustments', () => {
      for (const preset of BUILT_IN_PRESETS) {
        expect(preset).toHaveProperty('id');
        expect(preset).toHaveProperty('name');
        expect(preset).toHaveProperty('nameZh');
        expect(preset).toHaveProperty('type');
        expect(preset).toHaveProperty('category');
        expect(preset).toHaveProperty('adjustments');
        expect(typeof preset.id).toBe('string');
        expect(typeof preset.name).toBe('string');
        expect(typeof preset.nameZh).toBe('string');
        expect(typeof preset.adjustments).toBe('object');
      }
    });

    it('type 只允许 portrait, color, ai-color, combined', () => {
      const validTypes = ['portrait', 'color', 'ai-color', 'combined'];
      for (const preset of BUILT_IN_PRESETS) {
        expect(validTypes).toContain(preset.type);
      }
    });

    it('所有 id 唯一', () => {
      const ids = BUILT_IN_PRESETS.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('Preset 类型', () => {
    it('presetType 支持 portrait, color, ai-color, combined, tool, style', () => {
      const validPresetTypes: Preset['presetType'][] = [
        'portrait',
        'color',
        'ai-color',
        'combined',
        'tool',
        'style',
      ];
      for (const pt of validPresetTypes) {
        expect(typeof pt).toBe('string');
      }
    });
  });

  describe('PresetListType', () => {
    it('包含 Preset 和 Folder', () => {
      expect(PresetListType.Preset).toBe('preset');
      expect(PresetListType.Folder).toBe('folder');
    });
  });

  describe('UserPreset 类型结构', () => {
    it('可以构造包含 preset 的 UserPreset', () => {
      const userPreset: UserPreset = {
        preset: {
          id: 'test-id',
          name: 'Test Preset',
          adjustments: { exposure: 5 },
        },
      };
      expect(userPreset.preset).toBeDefined();
      expect(userPreset.preset!.id).toBe('test-id');
    });

    it('可以构造包含 folder 的 UserPreset', () => {
      const userPreset: UserPreset = {
        folder: {
          id: 'folder-id',
          name: 'My Folder',
          children: [],
        },
      };
      expect(userPreset.folder).toBeDefined();
      expect(userPreset.folder!.name).toBe('My Folder');
    });
  });
});

// ============================================================
// 3. Store (Zustand) 模块
// ============================================================
describe('Store (Zustand) 模块', () => {
  describe('useEditorStore', () => {
    it('初始状态包含 adjustments 等于 INITIAL_ADJUSTMENTS', () => {
      const state = useEditorStore.getState();
      expect(state.adjustments).toEqual(INITIAL_ADJUSTMENTS);
    });

    it('初始状态 selectedImage 为 null', () => {
      const state = useEditorStore.getState();
      expect(state.selectedImage).toBeNull();
    });

    it('初始状态 isSliderDragging 为 false', () => {
      const state = useEditorStore.getState();
      expect(state.isSliderDragging).toBe(false);
    });

    it('初始状态 history 为 [INITIAL_ADJUSTMENTS]', () => {
      const state = useEditorStore.getState();
      expect(state.history).toHaveLength(1);
      expect(state.history[0]).toEqual(INITIAL_ADJUSTMENTS);
    });

    it('setEditor 方法正常工作（对象式）', () => {
      useEditorStore.getState().setEditor({ isSliderDragging: true });
      expect(useEditorStore.getState().isSliderDragging).toBe(true);
      // 还原
      useEditorStore.getState().setEditor({ isSliderDragging: false });
      expect(useEditorStore.getState().isSliderDragging).toBe(false);
    });

    it('setEditor 方法正常工作（函数式）', () => {
      useEditorStore.getState().setEditor((state) => ({ isSliderDragging: !state.isSliderDragging }));
      expect(useEditorStore.getState().isSliderDragging).toBe(true);
      // 还原
      useEditorStore.getState().setEditor({ isSliderDragging: false });
    });
  });

  describe('useUIStore', () => {
    it('初始状态 activeRightPanel 存在', () => {
      const state = useUIStore.getState();
      expect(state.activeRightPanel).toBeDefined();
    });

    it('初始状态 activeRightPanel 为 Panel.Adjustments', () => {
      const state = useUIStore.getState();
      expect(state.activeRightPanel).toBe(Panel.Adjustments);
    });
  });

  describe('Adjustments 在 store 中的更新不产生引用问题', () => {
    it('更新 adjustments 后不影响 INITIAL_ADJUSTMENTS', () => {
      const snapshotBefore = JSON.stringify(INITIAL_ADJUSTMENTS);
      useEditorStore.getState().setEditor({
        adjustments: { ...INITIAL_ADJUSTMENTS, exposure: 100 },
      });
      expect(useEditorStore.getState().adjustments.exposure).toBe(100);
      // INITIAL_ADJUSTMENTS 不应被修改
      expect(JSON.stringify(INITIAL_ADJUSTMENTS)).toBe(snapshotBefore);
      // 还原
      useEditorStore.getState().setEditor({ adjustments: INITIAL_ADJUSTMENTS });
    });

    it('连续两次获取 adjustments 快照是独立的', () => {
      useEditorStore.getState().setEditor({ adjustments: INITIAL_ADJUSTMENTS });
      const snap1 = useEditorStore.getState().adjustments;
      useEditorStore.getState().setEditor({
        adjustments: { ...INITIAL_ADJUSTMENTS, contrast: 50 },
      });
      const snap2 = useEditorStore.getState().adjustments;
      expect(snap1.contrast).toBe(0);
      expect(snap2.contrast).toBe(50);
      // 还原
      useEditorStore.getState().setEditor({ adjustments: INITIAL_ADJUSTMENTS });
    });
  });
});

// ============================================================
// 4. normalizeLoadedAdjustments 完整性
// ============================================================
describe('normalizeLoadedAdjustments', () => {
  it('对缺失 aiPatches 的补全为 []', () => {
    const result = normalizeLoadedAdjustments({} as Adjustments);
    expect(result.aiPatches).toEqual([]);
  });

  it('对缺失 masks 的补全为 []', () => {
    const result = normalizeLoadedAdjustments({} as Adjustments);
    expect(result.masks).toEqual([]);
  });

  it('对缺失 portrait 的补全', () => {
    const result = normalizeLoadedAdjustments({} as Adjustments);
    expect(result.portrait).toEqual(INITIAL_PORTRAIT_ADJUSTMENTS);
  });

  it('对缺失 colorCalibration 的补全', () => {
    const result = normalizeLoadedAdjustments({} as Adjustments);
    expect(result.colorCalibration).toEqual(INITIAL_ADJUSTMENTS.colorCalibration);
  });

  it('对缺失 curves/pointCurves/parametricCurve 的补全', () => {
    const result = normalizeLoadedAdjustments({} as Adjustments);
    // curves 应该是默认的线性曲线
    expect(result.curves).toEqual(INITIAL_ADJUSTMENTS.curves);
    expect(result.pointCurves).toEqual(INITIAL_ADJUSTMENTS.pointCurves);
    expect(result.parametricCurve).toEqual(INITIAL_ADJUSTMENTS.parametricCurve);
  });

  it('对缺失 hsl 的补全', () => {
    const result = normalizeLoadedAdjustments({} as Adjustments);
    expect(result.hsl).toEqual(INITIAL_ADJUSTMENTS.hsl);
  });

  it('对缺失 sectionVisibility 的补全', () => {
    const result = normalizeLoadedAdjustments({} as Adjustments);
    expect(result.sectionVisibility).toEqual(INITIAL_ADJUSTMENTS.sectionVisibility);
  });

  it('对缺失 crop 的补全为 null', () => {
    const result = normalizeLoadedAdjustments({} as Adjustments);
    expect(result.crop).toBeNull();
  });

  it('normalizeLoadedAdjustments(null) 返回 INITIAL_ADJUSTMENTS', () => {
    const result = normalizeLoadedAdjustments(null as unknown as Adjustments);
    expect(result).toEqual(INITIAL_ADJUSTMENTS);
  });

  it('normalizeLoadedAdjustments({}) 返回补全后的完整对象', () => {
    const result = normalizeLoadedAdjustments({} as Adjustments);
    // 关键字段应与 INITIAL_ADJUSTMENTS 一致
    expect(result.exposure).toBe(0);
    expect(result.contrast).toBe(0);
    expect(result.saturation).toBe(0);
    expect(result.temperature).toBe(0);
    expect(result.crop).toBeNull();
    expect(result.aiPatches).toEqual([]);
    expect(result.masks).toEqual([]);
    expect(result.portrait).toEqual(INITIAL_PORTRAIT_ADJUSTMENTS);
    expect(result.colorCalibration).toEqual(INITIAL_ADJUSTMENTS.colorCalibration);
    expect(result.hsl).toEqual(INITIAL_ADJUSTMENTS.hsl);
    expect(result.sectionVisibility).toEqual(INITIAL_ADJUSTMENTS.sectionVisibility);
  });

  it('normalizeLoadedAdjustments 对已有值不覆盖', () => {
    const loaded = {
      exposure: 5,
      contrast: 20,
      temperature: -10,
      crop: { unit: '%', width: 50, height: 50, x: 25, y: 25 } as any,
      aiPatches: [{ id: 'patch-1', prompt: 'test', isLoading: false, invert: false, name: 'Test', patchData: null, subMasks: [], visible: true }],
      masks: [],
    } as Partial<Adjustments>;
    const result = normalizeLoadedAdjustments(loaded as Adjustments);
    expect(result.exposure).toBe(5);
    expect(result.contrast).toBe(20);
    expect(result.temperature).toBe(-10);
    expect(result.crop).toEqual(loaded.crop);
    expect(result.aiPatches).toHaveLength(1);
    expect(result.aiPatches[0].id).toBe('patch-1');
  });

  it('对部分 portrait 字段的补全不覆盖已有值', () => {
    const loaded = {
      portrait: {
        skinSmoothingStrength: 30,
      },
    } as Partial<Adjustments>;
    const result = normalizeLoadedAdjustments(loaded as Adjustments);
    expect(result.portrait.skinSmoothingStrength).toBe(30);
    // 未提供的 portrait 字段应使用默认值
    expect(result.portrait.eyeBrightenAmount).toBe(INITIAL_PORTRAIT_ADJUSTMENTS.eyeBrightenAmount);
    expect(result.portrait.faceSlimAmount).toBe(INITIAL_PORTRAIT_ADJUSTMENTS.faceSlimAmount);
  });

  it('对部分 colorCalibration 字段的补全不覆盖已有值', () => {
    const loaded = {
      colorCalibration: {
        redHue: 10,
      },
    } as Partial<Adjustments>;
    const result = normalizeLoadedAdjustments(loaded as Adjustments);
    expect(result.colorCalibration.redHue).toBe(10);
    expect(result.colorCalibration.shadowsTint).toBe(INITIAL_ADJUSTMENTS.colorCalibration.shadowsTint);
  });

  it('对部分 hsl 字段的补全不覆盖已有值', () => {
    const loaded = {
      hsl: {
        reds: { hue: 5, saturation: 10, luminance: 0 },
      },
    } as Partial<Adjustments>;
    const result = normalizeLoadedAdjustments(loaded as Adjustments);
    expect(result.hsl.reds.hue).toBe(5);
    expect(result.hsl.reds.saturation).toBe(10);
    // 其他颜色通道保持默认
    expect(result.hsl.blues).toEqual(INITIAL_ADJUSTMENTS.hsl.blues);
  });

  it('对部分 sectionVisibility 字段的补全不覆盖已有值', () => {
    const loaded = {
      sectionVisibility: {
        basic: false,
      },
    } as Partial<Adjustments>;
    const result = normalizeLoadedAdjustments(loaded as Adjustments);
    expect(result.sectionVisibility.basic).toBe(false);
    expect(result.sectionVisibility.curves).toBe(INITIAL_ADJUSTMENTS.sectionVisibility.curves);
  });

  it('对 undefined 的处理等同于缺失', () => {
    const loaded = { aiPatches: undefined, masks: undefined } as unknown as Adjustments;
    const result = normalizeLoadedAdjustments(loaded);
    expect(result.aiPatches).toEqual([]);
    expect(result.masks).toEqual([]);
  });
});
