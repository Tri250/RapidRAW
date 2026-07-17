import { describe, it, expect } from 'vitest';
import {
  INITIAL_ADJUSTMENTS,
  BasicAdjustment,
  ColorAdjustment,
  ColorGrading,
  DetailsAdjustment,
  ADJUSTMENT_GROUPS,
  normalizeLoadedAdjustments,
  getDefaultCurves,
  getDefaultParametricCurve,
  DEFAULT_PARAMETRIC_CURVE_SETTINGS,
} from '../../utils/adjustments';

// ─────────────────────────────────────────────────────
// 1. Basic 模块默认值
// ─────────────────────────────────────────────────────
describe('Basic 模块默认值', () => {
  it('Exposure 默认值为 0', () => {
    expect(INITIAL_ADJUSTMENTS.exposure).toBe(0);
  });

  it('ToneMapper 默认值为 basic', () => {
    expect(INITIAL_ADJUSTMENTS.toneMapper).toBe('basic');
  });

  it('Brightness 默认值为 0', () => {
    expect(INITIAL_ADJUSTMENTS.brightness).toBe(0);
  });

  it('Contrast 默认值为 0', () => {
    expect(INITIAL_ADJUSTMENTS.contrast).toBe(0);
  });

  it('Highlights 默认值为 0', () => {
    expect(INITIAL_ADJUSTMENTS.highlights).toBe(0);
  });

  it('Shadows 默认值为 0', () => {
    expect(INITIAL_ADJUSTMENTS.shadows).toBe(0);
  });

  it('Whites 默认值为 0', () => {
    expect(INITIAL_ADJUSTMENTS.whites).toBe(0);
  });

  it('Blacks 默认值为 0', () => {
    expect(INITIAL_ADJUSTMENTS.blacks).toBe(0);
  });
});

// ─────────────────────────────────────────────────────
// 2. Color 模块默认值
// ─────────────────────────────────────────────────────
describe('Color 模块默认值', () => {
  it('Temperature 默认值为 0', () => {
    expect(INITIAL_ADJUSTMENTS.temperature).toBe(0);
  });

  it('Tint 默认值为 0', () => {
    expect(INITIAL_ADJUSTMENTS.tint).toBe(0);
  });

  it('Saturation 默认值为 0', () => {
    expect(INITIAL_ADJUSTMENTS.saturation).toBe(0);
  });

  it('Vibrance 默认值为 0', () => {
    expect(INITIAL_ADJUSTMENTS.vibrance).toBe(0);
  });

  it('Hue 默认值为 0', () => {
    expect(INITIAL_ADJUSTMENTS.hue).toBe(0);
  });
});

// ─────────────────────────────────────────────────────
// 3. Details 模块默认值
// ─────────────────────────────────────────────────────
describe('Details 模块默认值', () => {
  it('Clarity 默认值为 0', () => {
    expect(INITIAL_ADJUSTMENTS.clarity).toBe(0);
  });

  it('Structure 默认值为 0', () => {
    expect(INITIAL_ADJUSTMENTS.structure).toBe(0);
  });

  it('Dehaze 默认值为 0', () => {
    expect(INITIAL_ADJUSTMENTS.dehaze).toBe(0);
  });

  it('Centré 默认值为 0', () => {
    expect(INITIAL_ADJUSTMENTS.centré).toBe(0);
  });

  it('Sharpness 默认值为 0', () => {
    expect(INITIAL_ADJUSTMENTS.sharpness).toBe(0);
  });

  it('SharpnessThreshold 默认值为 15', () => {
    expect(INITIAL_ADJUSTMENTS.sharpnessThreshold).toBe(15);
  });

  it('LumaNoiseReduction 默认值为 0', () => {
    expect(INITIAL_ADJUSTMENTS.lumaNoiseReduction).toBe(0);
  });

  it('ColorNoiseReduction 默认值为 0', () => {
    expect(INITIAL_ADJUSTMENTS.colorNoiseReduction).toBe(0);
  });

  it('ChromaticAberrationRedCyan 默认值为 0', () => {
    expect(INITIAL_ADJUSTMENTS.chromaticAberrationRedCyan).toBe(0);
  });

  it('ChromaticAberrationBlueYellow 默认值为 0', () => {
    expect(INITIAL_ADJUSTMENTS.chromaticAberrationBlueYellow).toBe(0);
  });
});

// ─────────────────────────────────────────────────────
// 4. 枚举映射正确性
// ─────────────────────────────────────────────────────
describe('BasicAdjustment 枚举', () => {
  it('所有值正确映射', () => {
    expect(BasicAdjustment.Exposure).toBe('exposure');
    expect(BasicAdjustment.Brightness).toBe('brightness');
    expect(BasicAdjustment.Contrast).toBe('contrast');
    expect(BasicAdjustment.Highlights).toBe('highlights');
    expect(BasicAdjustment.Shadows).toBe('shadows');
    expect(BasicAdjustment.Whites).toBe('whites');
    expect(BasicAdjustment.Blacks).toBe('blacks');
  });

  it('枚举数量为 7', () => {
    expect(Object.keys(BasicAdjustment).length).toBe(7);
  });
});

describe('ColorAdjustment 枚举', () => {
  it('所有值正确映射', () => {
    expect(ColorAdjustment.Temperature).toBe('temperature');
    expect(ColorAdjustment.Tint).toBe('tint');
    expect(ColorAdjustment.Saturation).toBe('saturation');
    expect(ColorAdjustment.Vibrance).toBe('vibrance');
    expect(ColorAdjustment.Hue).toBe('hue');
    expect(ColorAdjustment.Hsl).toBe('hsl');
    expect(ColorAdjustment.ColorGrading).toBe('colorGrading');
    expect(ColorAdjustment.Luminance).toBe('luminance');
  });

  it('枚举数量为 8', () => {
    expect(Object.keys(ColorAdjustment).length).toBe(8);
  });
});

describe('ColorGrading 枚举', () => {
  it('所有值正确映射', () => {
    expect(ColorGrading.Global).toBe('global');
    expect(ColorGrading.Shadows).toBe('shadows');
    expect(ColorGrading.Midtones).toBe('midtones');
    expect(ColorGrading.Highlights).toBe('highlights');
    expect(ColorGrading.Balance).toBe('balance');
    expect(ColorGrading.Blending).toBe('blending');
  });

  it('枚举数量为 6', () => {
    expect(Object.keys(ColorGrading).length).toBe(6);
  });
});

describe('DetailsAdjustment 枚举', () => {
  it('所有值正确映射', () => {
    expect(DetailsAdjustment.Clarity).toBe('clarity');
    expect(DetailsAdjustment.Structure).toBe('structure');
    expect(DetailsAdjustment.Dehaze).toBe('dehaze');
    expect(DetailsAdjustment.Centré).toBe('centré');
    expect(DetailsAdjustment.Sharpness).toBe('sharpness');
    expect(DetailsAdjustment.SharpnessThreshold).toBe('sharpnessThreshold');
    expect(DetailsAdjustment.LumaNoiseReduction).toBe('lumaNoiseReduction');
    expect(DetailsAdjustment.ColorNoiseReduction).toBe('colorNoiseReduction');
    expect(DetailsAdjustment.ChromaticAberrationRedCyan).toBe('chromaticAberrationRedCyan');
    expect(DetailsAdjustment.ChromaticAberrationBlueYellow).toBe('chromaticAberrationBlueYellow');
  });

  it('枚举数量为 10', () => {
    expect(Object.keys(DetailsAdjustment).length).toBe(10);
  });
});

// ─────────────────────────────────────────────────────
// 5. Curves 默认结构完整性
// ─────────────────────────────────────────────────────
describe('Curves 默认结构', () => {
  const channels = ['luma', 'red', 'green', 'blue'] as const;

  it('包含 4 个通道', () => {
    const curves = getDefaultCurves();
    expect(Object.keys(curves)).toEqual(expect.arrayContaining(channels));
    expect(Object.keys(curves).length).toBe(4);
  });

  it.each(channels)('%s 通道起始点为 {0,0}，终止点为 {255,255}', (channel) => {
    const curves = getDefaultCurves();
    const pts = curves[channel];
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[pts.length - 1]).toEqual({ x: 255, y: 255 });
  });

  it('INITIAL_ADJUSTMENTS.curves 与 getDefaultCurves 结构一致', () => {
    const defaultCurves = getDefaultCurves();
    for (const ch of channels) {
      expect(INITIAL_ADJUSTMENTS.curves[ch]).toEqual(defaultCurves[ch]);
    }
  });
});

// ─────────────────────────────────────────────────────
// 6. ParametricCurve 默认结构完整性
// ─────────────────────────────────────────────────────
describe('ParametricCurve 默认结构', () => {
  const channels = ['luma', 'red', 'green', 'blue'] as const;

  it('包含 4 个通道', () => {
    const pc = getDefaultParametricCurve();
    expect(Object.keys(pc)).toEqual(expect.arrayContaining(channels));
    expect(Object.keys(pc).length).toBe(4);
  });

  it.each(channels)('%s 通道字段完整且与 DEFAULT_PARAMETRIC_CURVE_SETTINGS 一致', (channel) => {
    const pc = getDefaultParametricCurve();
    expect(pc[channel]).toEqual(DEFAULT_PARAMETRIC_CURVE_SETTINGS);
  });

  it('DEFAULT_PARAMETRIC_CURVE_SETTINGS 字段值正确', () => {
    expect(DEFAULT_PARAMETRIC_CURVE_SETTINGS.darks).toBe(0);
    expect(DEFAULT_PARAMETRIC_CURVE_SETTINGS.shadows).toBe(0);
    expect(DEFAULT_PARAMETRIC_CURVE_SETTINGS.highlights).toBe(0);
    expect(DEFAULT_PARAMETRIC_CURVE_SETTINGS.lights).toBe(0);
    expect(DEFAULT_PARAMETRIC_CURVE_SETTINGS.whiteLevel).toBe(0);
    expect(DEFAULT_PARAMETRIC_CURVE_SETTINGS.blackLevel).toBe(0);
    expect(DEFAULT_PARAMETRIC_CURVE_SETTINGS.split1).toBe(25);
    expect(DEFAULT_PARAMETRIC_CURVE_SETTINGS.split2).toBe(50);
    expect(DEFAULT_PARAMETRIC_CURVE_SETTINGS.split3).toBe(75);
  });
});

// ─────────────────────────────────────────────────────
// 7. HSL 8 色结构完整性
// ─────────────────────────────────────────────────────
describe('HSL 8 色结构', () => {
  const hslColors = ['reds', 'oranges', 'yellows', 'greens', 'aquas', 'blues', 'purples', 'magentas'] as const;

  it('包含 8 种颜色', () => {
    expect(Object.keys(INITIAL_ADJUSTMENTS.hsl).length).toBe(8);
  });

  it.each(hslColors)('%s 存在且 hue/saturation/luminance 均为 0', (color) => {
    const entry = INITIAL_ADJUSTMENTS.hsl[color];
    expect(entry).toBeDefined();
    expect(entry.hue).toBe(0);
    expect(entry.saturation).toBe(0);
    expect(entry.luminance).toBe(0);
  });
});

// ─────────────────────────────────────────────────────
// 8. ColorGrading 4 区结构完整性
// ─────────────────────────────────────────────────────
describe('ColorGrading 结构', () => {
  const zones = ['global', 'shadows', 'midtones', 'highlights'] as const;

  it('包含 4 个分区', () => {
    const cg = INITIAL_ADJUSTMENTS.colorGrading;
    for (const zone of zones) {
      expect(cg[zone]).toBeDefined();
    }
  });

  it.each(zones)('%s 分区 hue/saturation/luminance 均为 0', (zone) => {
    const entry = INITIAL_ADJUSTMENTS.colorGrading[zone] as any;
    expect(entry.hue).toBe(0);
    expect(entry.saturation).toBe(0);
    expect(entry.luminance).toBe(0);
  });

  it('balance 默认值为 0', () => {
    expect(INITIAL_ADJUSTMENTS.colorGrading.balance).toBe(0);
  });

  it('blending 默认值为 50', () => {
    expect(INITIAL_ADJUSTMENTS.colorGrading.blending).toBe(50);
  });
});

// ─────────────────────────────────────────────────────
// 9. ColorCalibration 7 字段完整性
// ─────────────────────────────────────────────────────
describe('ColorCalibration 结构', () => {
  const expectedFields = [
    'shadowsTint',
    'redHue',
    'redSaturation',
    'greenHue',
    'greenSaturation',
    'blueHue',
    'blueSaturation',
  ] as const;

  it('包含 7 个字段', () => {
    expect(Object.keys(INITIAL_ADJUSTMENTS.colorCalibration).length).toBe(7);
  });

  it.each(expectedFields)('%s 存在且默认值为 0', (field) => {
    expect(INITIAL_ADJUSTMENTS.colorCalibration[field]).toBe(0);
  });
});

// ─────────────────────────────────────────────────────
// 10. normalizeLoadedAdjustments 补全能力
// ─────────────────────────────────────────────────────
describe('normalizeLoadedAdjustments 补全能力', () => {
  it('null 输入返回完整默认值', () => {
    const result = normalizeLoadedAdjustments(null as any);
    expect(result).toEqual(INITIAL_ADJUSTMENTS);
  });

  it('空对象输入返回完整默认值', () => {
    const result = normalizeLoadedAdjustments({} as any);
    expect(result.exposure).toBe(0);
    expect(result.temperature).toBe(0);
    expect(result.clarity).toBe(0);
    expect(result.sharpnessThreshold).toBe(15);
    expect(result.toneMapper).toBe('basic');
  });

  it('部分加载时补全缺失的 basic 字段', () => {
    const loaded = { exposure: 3 } as any;
    const result = normalizeLoadedAdjustments(loaded);
    expect(result.exposure).toBe(3);
    expect(result.brightness).toBe(0);
    expect(result.contrast).toBe(0);
    expect(result.blacks).toBe(0);
  });

  it('部分加载时补全缺失的 color 字段', () => {
    const loaded = { temperature: 50 } as any;
    const result = normalizeLoadedAdjustments(loaded);
    expect(result.temperature).toBe(50);
    expect(result.tint).toBe(0);
    expect(result.saturation).toBe(0);
    expect(result.vibrance).toBe(0);
    expect(result.hue).toBe(0);
  });

  it('部分加载时补全缺失的 details 字段', () => {
    const loaded = { clarity: -30 } as any;
    const result = normalizeLoadedAdjustments(loaded);
    expect(result.clarity).toBe(-30);
    expect(result.structure).toBe(0);
    expect(result.dehaze).toBe(0);
    expect(result.sharpness).toBe(0);
    expect(result.sharpnessThreshold).toBe(15);
  });

  it('补全 hsl 缺失颜色', () => {
    const loaded = { hsl: { reds: { hue: 10, saturation: 20, luminance: 30 } } } as any;
    const result = normalizeLoadedAdjustments(loaded);
    expect(result.hsl.reds.hue).toBe(10);
    expect(result.hsl.reds.saturation).toBe(20);
    expect(result.hsl.reds.luminance).toBe(30);
    // 其余颜色应保留默认
    expect(result.hsl.blues.hue).toBe(0);
    expect(result.hsl.greens.saturation).toBe(0);
  });

  it('补全 colorGrading 缺失分区', () => {
    const loaded = { colorGrading: { highlights: { hue: 120, saturation: 50, luminance: 30 } } } as any;
    const result = normalizeLoadedAdjustments(loaded);
    expect(result.colorGrading.highlights.hue).toBe(120);
    expect(result.colorGrading.shadows.hue).toBe(0);
    expect(result.colorGrading.midtones.saturation).toBe(0);
    expect(result.colorGrading.global.luminance).toBe(0);
    expect(result.colorGrading.balance).toBe(0);
    expect(result.colorGrading.blending).toBe(50);
  });

  it('补全 colorCalibration 缺失字段', () => {
    const loaded = { colorCalibration: { redHue: 30 } } as any;
    const result = normalizeLoadedAdjustments(loaded);
    expect(result.colorCalibration.redHue).toBe(30);
    expect(result.colorCalibration.shadowsTint).toBe(0);
    expect(result.colorCalibration.blueSaturation).toBe(0);
  });

  it('补全 curves 为默认结构', () => {
    const loaded = {} as any;
    const result = normalizeLoadedAdjustments(loaded);
    const defaultCurves = getDefaultCurves();
    expect(result.curves.luma).toEqual(defaultCurves.luma);
    expect(result.curves.red).toEqual(defaultCurves.red);
    expect(result.curves.green).toEqual(defaultCurves.green);
    expect(result.curves.blue).toEqual(defaultCurves.blue);
  });

  it('补全 parametricCurve 为默认结构', () => {
    const loaded = {} as any;
    const result = normalizeLoadedAdjustments(loaded);
    const defaultPC = getDefaultParametricCurve();
    expect(result.parametricCurve.luma).toEqual(defaultPC.luma);
    expect(result.parametricCurve.red).toEqual(defaultPC.red);
  });

  it('补全 sectionVisibility 缺失项', () => {
    const loaded = { sectionVisibility: { basic: false } } as any;
    const result = normalizeLoadedAdjustments(loaded);
    expect(result.sectionVisibility.basic).toBe(false);
    expect(result.sectionVisibility.color).toBe(true);
    expect(result.sectionVisibility.details).toBe(true);
    expect(result.sectionVisibility.curves).toBe(true);
    expect(result.sectionVisibility.effects).toBe(true);
  });
});

// ─────────────────────────────────────────────────────
// 11. ADJUSTMENT_GROUPS 分组 keys 完整性
// ─────────────────────────────────────────────────────
describe('ADJUSTMENT_GROUPS 分组 keys 完整性', () => {
  it('basic 分组包含 exposure + toneMapper 和 6 个 tone 参数 + curves 组', () => {
    const basicKeys = ADJUSTMENT_GROUPS.basic.flatMap((g) => g.keys);
    expect(basicKeys).toContain(BasicAdjustment.Exposure);
    expect(basicKeys).toContain('toneMapper');
    expect(basicKeys).toContain(BasicAdjustment.Brightness);
    expect(basicKeys).toContain(BasicAdjustment.Contrast);
    expect(basicKeys).toContain(BasicAdjustment.Highlights);
    expect(basicKeys).toContain(BasicAdjustment.Shadows);
    expect(basicKeys).toContain(BasicAdjustment.Whites);
    expect(basicKeys).toContain(BasicAdjustment.Blacks);
    expect(basicKeys).toContain('curves');
    expect(basicKeys).toContain('pointCurves');
    expect(basicKeys).toContain('parametricCurve');
    expect(basicKeys).toContain('curveMode');
  });

  it('color 分组包含 temperature/tint, saturation/vibrance, hue, colorGrading, hsl, colorCalibration', () => {
    const colorKeys = ADJUSTMENT_GROUPS.color.flatMap((g) => g.keys);
    expect(colorKeys).toContain(ColorAdjustment.Temperature);
    expect(colorKeys).toContain(ColorAdjustment.Tint);
    expect(colorKeys).toContain(ColorAdjustment.Saturation);
    expect(colorKeys).toContain(ColorAdjustment.Vibrance);
    expect(colorKeys).toContain(ColorAdjustment.Hue);
    expect(colorKeys).toContain(ColorAdjustment.ColorGrading);
    expect(colorKeys).toContain(ColorAdjustment.Hsl);
    expect(colorKeys).toContain('colorCalibration');
  });

  it('details 分组包含所有 DetailsAdjustment 枚举值', () => {
    const detailsKeys = ADJUSTMENT_GROUPS.details.flatMap((g) => g.keys);
    expect(detailsKeys).toContain(DetailsAdjustment.Clarity);
    expect(detailsKeys).toContain(DetailsAdjustment.Structure);
    expect(detailsKeys).toContain(DetailsAdjustment.Dehaze);
    expect(detailsKeys).toContain(DetailsAdjustment.Centré);
    expect(detailsKeys).toContain(DetailsAdjustment.Sharpness);
    expect(detailsKeys).toContain(DetailsAdjustment.SharpnessThreshold);
    expect(detailsKeys).toContain(DetailsAdjustment.LumaNoiseReduction);
    expect(detailsKeys).toContain(DetailsAdjustment.ColorNoiseReduction);
    expect(detailsKeys).toContain(DetailsAdjustment.ChromaticAberrationRedCyan);
    expect(detailsKeys).toContain(DetailsAdjustment.ChromaticAberrationBlueYellow);
  });

  it('details 分组 keys 数量等于 DetailsAdjustment 枚举数量', () => {
    const detailsKeys = ADJUSTMENT_GROUPS.details.flatMap((g) => g.keys);
    expect(detailsKeys.length).toBe(Object.keys(DetailsAdjustment).length);
  });
});

// ─────────────────────────────────────────────────────
// 12. 范围验证（通过 INITIAL_ADJUSTMENTS 默认值在合法范围内的方式确认）
// ─────────────────────────────────────────────────────
describe('默认值在合法范围内', () => {
  const inRange = (val: number, min: number, max: number) => val >= min && val <= max;

  it('Exposure 默认值在 [-5, 5] 范围内', () => {
    expect(inRange(INITIAL_ADJUSTMENTS.exposure, -5, 5)).toBe(true);
  });

  it('ToneMapper 为合法值 agx 或 basic', () => {
    expect(['agx', 'basic']).toContain(INITIAL_ADJUSTMENTS.toneMapper);
  });

  it('Brightness 默认值在 [-100, 100] 范围内', () => {
    expect(inRange(INITIAL_ADJUSTMENTS.brightness, -100, 100)).toBe(true);
  });

  it('Contrast 默认值在 [-100, 100] 范围内', () => {
    expect(inRange(INITIAL_ADJUSTMENTS.contrast, -100, 100)).toBe(true);
  });

  it('Highlights 默认值在 [-100, 100] 范围内', () => {
    expect(inRange(INITIAL_ADJUSTMENTS.highlights, -100, 100)).toBe(true);
  });

  it('Shadows 默认值在 [-100, 100] 范围内', () => {
    expect(inRange(INITIAL_ADJUSTMENTS.shadows, -100, 100)).toBe(true);
  });

  it('Whites 默认值在 [-100, 100] 范围内', () => {
    expect(inRange(INITIAL_ADJUSTMENTS.whites, -100, 100)).toBe(true);
  });

  it('Blacks 默认值在 [-100, 100] 范围内', () => {
    expect(inRange(INITIAL_ADJUSTMENTS.blacks, -100, 100)).toBe(true);
  });

  it('Temperature 默认值在 [-100, 100] 范围内', () => {
    expect(inRange(INITIAL_ADJUSTMENTS.temperature, -100, 100)).toBe(true);
  });

  it('Tint 默认值在 [-100, 100] 范围内', () => {
    expect(inRange(INITIAL_ADJUSTMENTS.tint, -100, 100)).toBe(true);
  });

  it('Saturation 默认值在 [-100, 100] 范围内', () => {
    expect(inRange(INITIAL_ADJUSTMENTS.saturation, -100, 100)).toBe(true);
  });

  it('Vibrance 默认值在 [-100, 100] 范围内', () => {
    expect(inRange(INITIAL_ADJUSTMENTS.vibrance, -100, 100)).toBe(true);
  });

  it('Hue 默认值在 [0, 360] 范围内', () => {
    expect(inRange(INITIAL_ADJUSTMENTS.hue, 0, 360)).toBe(true);
  });

  it('Clarity 默认值在 [-100, 100] 范围内', () => {
    expect(inRange(INITIAL_ADJUSTMENTS.clarity, -100, 100)).toBe(true);
  });

  it('Structure 默认值在 [-100, 100] 范围内', () => {
    expect(inRange(INITIAL_ADJUSTMENTS.structure, -100, 100)).toBe(true);
  });

  it('Dehaze 默认值在 [-100, 100] 范围内', () => {
    expect(inRange(INITIAL_ADJUSTMENTS.dehaze, -100, 100)).toBe(true);
  });

  it('Centré 默认值在 [-100, 100] 范围内', () => {
    expect(inRange(INITIAL_ADJUSTMENTS.centré, -100, 100)).toBe(true);
  });

  it('Sharpness 默认值在 [0, 100] 范围内', () => {
    expect(inRange(INITIAL_ADJUSTMENTS.sharpness, 0, 100)).toBe(true);
  });

  it('SharpnessThreshold 默认值在 [0, 100] 范围内', () => {
    expect(inRange(INITIAL_ADJUSTMENTS.sharpnessThreshold, 0, 100)).toBe(true);
  });

  it('LumaNoiseReduction 默认值在 [0, 100] 范围内', () => {
    expect(inRange(INITIAL_ADJUSTMENTS.lumaNoiseReduction, 0, 100)).toBe(true);
  });

  it('ColorNoiseReduction 默认值在 [0, 100] 范围内', () => {
    expect(inRange(INITIAL_ADJUSTMENTS.colorNoiseReduction, 0, 100)).toBe(true);
  });

  it('ChromaticAberrationRedCyan 默认值在 [-100, 100] 范围内', () => {
    expect(inRange(INITIAL_ADJUSTMENTS.chromaticAberrationRedCyan, -100, 100)).toBe(true);
  });

  it('ChromaticAberrationBlueYellow 默认值在 [-100, 100] 范围内', () => {
    expect(inRange(INITIAL_ADJUSTMENTS.chromaticAberrationBlueYellow, -100, 100)).toBe(true);
  });
});
