import { describe, it, expect, vi } from 'vitest';
import {
  INITIAL_ADJUSTMENTS,
  INITIAL_MASK_ADJUSTMENTS,
  INITIAL_MASK_CONTAINER,
  getDefaultCurves,
  getDefaultParametricCurve,
  normalizeLoadedAdjustments,
  ADJUSTMENT_GROUPS,
  COPYABLE_ADJUSTMENT_KEYS,
  ADJUSTMENT_SECTIONS,
  COLOR_LABELS,
  DEFAULT_PARAMETRIC_CURVE_SETTINGS,
} from '../adjustments';
import { SubMaskMode } from '../../components/panel/right/Masks';

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid'),
}));

describe('COLOR_LABELS', () => {
  it('contains 5 color labels', () => {
    expect(COLOR_LABELS.length).toBe(5);
  });

  it('each label has name and color properties', () => {
    COLOR_LABELS.forEach((label) => {
      expect(label).toHaveProperty('name');
      expect(label).toHaveProperty('color');
      expect(typeof label.name).toBe('string');
      expect(typeof label.color).toBe('string');
    });
  });

  it('contains expected color names', () => {
    const names = COLOR_LABELS.map((l) => l.name);
    expect(names).toContain('red');
    expect(names).toContain('yellow');
    expect(names).toContain('green');
    expect(names).toContain('blue');
    expect(names).toContain('purple');
  });
});

describe('getDefaultCurves', () => {
  it('returns an object with blue, green, luma, red channels', () => {
    const curves = getDefaultCurves();
    expect(curves).toHaveProperty('blue');
    expect(curves).toHaveProperty('green');
    expect(curves).toHaveProperty('luma');
    expect(curves).toHaveProperty('red');
  });

  it('each channel has two points forming a diagonal line', () => {
    const curves = getDefaultCurves();
    const channels = ['blue', 'green', 'luma', 'red'] as const;
    channels.forEach((channel) => {
      expect(curves[channel]).toHaveLength(2);
      expect(curves[channel][0]).toEqual({ x: 0, y: 0 });
      expect(curves[channel][1]).toEqual({ x: 255, y: 255 });
    });
  });

  it('returns a new object on each call', () => {
    const curves1 = getDefaultCurves();
    const curves2 = getDefaultCurves();
    expect(curves1).not.toBe(curves2);
    expect(curves1.blue).not.toBe(curves2.blue);
  });
});

describe('getDefaultParametricCurve', () => {
  it('returns an object with blue, green, luma, red channels', () => {
    const curve = getDefaultParametricCurve();
    expect(curve).toHaveProperty('blue');
    expect(curve).toHaveProperty('green');
    expect(curve).toHaveProperty('luma');
    expect(curve).toHaveProperty('red');
  });

  it('each channel has default parametric curve settings', () => {
    const curve = getDefaultParametricCurve();
    const channels = ['blue', 'green', 'luma', 'red'] as const;
    channels.forEach((channel) => {
      expect(curve[channel]).toEqual(DEFAULT_PARAMETRIC_CURVE_SETTINGS);
    });
  });

  it('returns a new object on each call', () => {
    const curve1 = getDefaultParametricCurve();
    const curve2 = getDefaultParametricCurve();
    expect(curve1).not.toBe(curve2);
    expect(curve1.luma).not.toBe(curve2.luma);
  });
});

describe('INITIAL_MASK_ADJUSTMENTS', () => {
  it('has expected numeric adjustment fields with default 0', () => {
    const numericFields = [
      'blacks',
      'brightness',
      'clarity',
      'colorNoiseReduction',
      'contrast',
      'dehaze',
      'exposure',
      'flareAmount',
      'glowAmount',
      'halationAmount',
      'highlights',
      'hue',
      'lumaNoiseReduction',
      'saturation',
      'shadows',
      'sharpness',
      'structure',
      'temperature',
      'tint',
      'vibrance',
      'whites',
    ];
    numericFields.forEach((field) => {
      expect(INITIAL_MASK_ADJUSTMENTS[field]).toBe(0);
    });
  });

  it('has sharpnessThreshold default of 15', () => {
    expect(INITIAL_MASK_ADJUSTMENTS.sharpnessThreshold).toBe(15);
  });

  it('has colorGrading with default structure', () => {
    expect(INITIAL_MASK_ADJUSTMENTS.colorGrading.balance).toBe(0);
    expect(INITIAL_MASK_ADJUSTMENTS.colorGrading.blending).toBe(50);
    expect(INITIAL_MASK_ADJUSTMENTS.colorGrading.global).toEqual({
      hue: 0,
      saturation: 0,
      luminance: 0,
    });
  });

  it('has hsl with 8 color channels', () => {
    const hslChannels = ['aquas', 'blues', 'greens', 'magentas', 'oranges', 'purples', 'reds', 'yellows'];
    hslChannels.forEach((channel) => {
      expect(INITIAL_MASK_ADJUSTMENTS.hsl[channel]).toEqual({
        hue: 0,
        saturation: 0,
        luminance: 0,
      });
    });
  });

  it('has curves with default structure', () => {
    expect(INITIAL_MASK_ADJUSTMENTS.curves).toBeDefined();
    expect(INITIAL_MASK_ADJUSTMENTS.pointCurves).toBeDefined();
    expect(INITIAL_MASK_ADJUSTMENTS.parametricCurve).toBeDefined();
  });

  it('has curveMode set to point', () => {
    expect(INITIAL_MASK_ADJUSTMENTS.curveMode).toBe('point');
  });

  it('has sectionVisibility with all sections visible', () => {
    expect(INITIAL_MASK_ADJUSTMENTS.sectionVisibility).toEqual({
      basic: true,
      curves: true,
      color: true,
      details: true,
      effects: true,
    });
  });
});

describe('INITIAL_MASK_CONTAINER', () => {
  it('has expected default values', () => {
    expect(INITIAL_MASK_CONTAINER.invert).toBe(false);
    expect(INITIAL_MASK_CONTAINER.name).toBe('New Mask');
    expect(INITIAL_MASK_CONTAINER.opacity).toBe(100);
    expect(INITIAL_MASK_CONTAINER.visible).toBe(true);
    expect(Array.isArray(INITIAL_MASK_CONTAINER.subMasks)).toBe(true);
    expect(INITIAL_MASK_CONTAINER.subMasks).toHaveLength(0);
  });

  it('has adjustments set to INITIAL_MASK_ADJUSTMENTS', () => {
    expect(INITIAL_MASK_CONTAINER.adjustments).toEqual(INITIAL_MASK_ADJUSTMENTS);
  });
});

describe('INITIAL_ADJUSTMENTS', () => {
  it('has aiPatches and masks as empty arrays', () => {
    expect(Array.isArray(INITIAL_ADJUSTMENTS.aiPatches)).toBe(true);
    expect(INITIAL_ADJUSTMENTS.aiPatches).toHaveLength(0);
    expect(Array.isArray(INITIAL_ADJUSTMENTS.masks)).toBe(true);
    expect(INITIAL_ADJUSTMENTS.masks).toHaveLength(0);
  });

  it('has null values for aspectRatio, crop, lens fields', () => {
    expect(INITIAL_ADJUSTMENTS.aspectRatio).toBeNull();
    expect(INITIAL_ADJUSTMENTS.crop).toBeNull();
    expect(INITIAL_ADJUSTMENTS.lensDistortionParams).toBeNull();
    expect(INITIAL_ADJUSTMENTS.lensMaker).toBeNull();
    expect(INITIAL_ADJUSTMENTS.lensModel).toBeNull();
    expect(INITIAL_ADJUSTMENTS.lutData).toBeNull();
    expect(INITIAL_ADJUSTMENTS.lutName).toBeNull();
    expect(INITIAL_ADJUSTMENTS.lutPath).toBeNull();
  });

  it('has lens correction defaults', () => {
    expect(INITIAL_ADJUSTMENTS.lensCorrectionMode).toBe('manual');
    expect(INITIAL_ADJUSTMENTS.lensDistortionAmount).toBe(100);
    expect(INITIAL_ADJUSTMENTS.lensVignetteAmount).toBe(100);
    expect(INITIAL_ADJUSTMENTS.lensTcaAmount).toBe(100);
    expect(INITIAL_ADJUSTMENTS.lensDistortionEnabled).toBe(true);
    expect(INITIAL_ADJUSTMENTS.lensTcaEnabled).toBe(true);
    expect(INITIAL_ADJUSTMENTS.lensVignetteEnabled).toBe(true);
  });

  it('has transform defaults', () => {
    expect(INITIAL_ADJUSTMENTS.transformDistortion).toBe(0);
    expect(INITIAL_ADJUSTMENTS.transformVertical).toBe(0);
    expect(INITIAL_ADJUSTMENTS.transformHorizontal).toBe(0);
    expect(INITIAL_ADJUSTMENTS.transformRotate).toBe(0);
    expect(INITIAL_ADJUSTMENTS.transformAspect).toBe(0);
    expect(INITIAL_ADJUSTMENTS.transformScale).toBe(100);
    expect(INITIAL_ADJUSTMENTS.transformXOffset).toBe(0);
    expect(INITIAL_ADJUSTMENTS.transformYOffset).toBe(0);
  });

  it('has grain defaults', () => {
    expect(INITIAL_ADJUSTMENTS.grainAmount).toBe(0);
    expect(INITIAL_ADJUSTMENTS.grainRoughness).toBe(50);
    expect(INITIAL_ADJUSTMENTS.grainSize).toBe(25);
  });

  it('has vignette defaults', () => {
    expect(INITIAL_ADJUSTMENTS.vignetteAmount).toBe(0);
    expect(INITIAL_ADJUSTMENTS.vignetteFeather).toBe(50);
    expect(INITIAL_ADJUSTMENTS.vignetteMidpoint).toBe(50);
    expect(INITIAL_ADJUSTMENTS.vignetteRoundness).toBe(0);
  });

  it('has boolean defaults', () => {
    expect(INITIAL_ADJUSTMENTS.flipHorizontal).toBe(false);
    expect(INITIAL_ADJUSTMENTS.flipVertical).toBe(false);
    expect(INITIAL_ADJUSTMENTS.showClipping).toBe(false);
  });

  it('has other numeric defaults', () => {
    expect(INITIAL_ADJUSTMENTS.orientationSteps).toBe(0);
    expect(INITIAL_ADJUSTMENTS.rotation).toBe(0);
    expect(INITIAL_ADJUSTMENTS.lutIntensity).toBe(100);
    expect(INITIAL_ADJUSTMENTS.lutSize).toBe(0);
    expect(INITIAL_ADJUSTMENTS.sharpnessThreshold).toBe(15);
    expect(INITIAL_ADJUSTMENTS.centré).toBe(0);
    expect(INITIAL_ADJUSTMENTS.chromaticAberrationBlueYellow).toBe(0);
    expect(INITIAL_ADJUSTMENTS.chromaticAberrationRedCyan).toBe(0);
  });

  it('has toneMapper set to basic', () => {
    expect(INITIAL_ADJUSTMENTS.toneMapper).toBe('basic');
  });

  it('has colorCalibration with default values', () => {
    expect(INITIAL_ADJUSTMENTS.colorCalibration).toEqual({
      shadowsTint: 0,
      redHue: 0,
      redSaturation: 0,
      greenHue: 0,
      greenSaturation: 0,
      blueHue: 0,
      blueSaturation: 0,
    });
  });
});

describe('normalizeLoadedAdjustments', () => {
  describe('null/undefined input', () => {
    it('returns INITIAL_ADJUSTMENTS when input is null', () => {
      const result = normalizeLoadedAdjustments(null as any);
      expect(result).toEqual(INITIAL_ADJUSTMENTS);
    });

    it('returns INITIAL_ADJUSTMENTS when input is undefined', () => {
      const result = normalizeLoadedAdjustments(undefined as any);
      expect(result).toEqual(INITIAL_ADJUSTMENTS);
    });
  });

  describe('empty object input', () => {
    it('returns object with all default values', () => {
      const result = normalizeLoadedAdjustments({} as any);
      expect(result.exposure).toBe(INITIAL_ADJUSTMENTS.exposure);
      expect(result.contrast).toBe(INITIAL_ADJUSTMENTS.contrast);
      expect(result.saturation).toBe(INITIAL_ADJUSTMENTS.saturation);
      expect(result.masks).toEqual([]);
      expect(result.aiPatches).toEqual([]);
      expect(result.curves).toBeDefined();
      expect(result.colorGrading).toBeDefined();
      expect(result.hsl).toBeDefined();
    });
  });

  describe('partial fields input', () => {
    it('merges provided fields with defaults', () => {
      const result = normalizeLoadedAdjustments({
        exposure: 1.5,
        contrast: 20,
        saturation: 10,
      } as any);
      expect(result.exposure).toBe(1.5);
      expect(result.contrast).toBe(20);
      expect(result.saturation).toBe(10);
      expect(result.brightness).toBe(INITIAL_ADJUSTMENTS.brightness);
      expect(result.highlights).toBe(INITIAL_ADJUSTMENTS.highlights);
    });
  });

  describe('masks array normalization', () => {
    it('normalizes masks array with default values', () => {
      const result = normalizeLoadedAdjustments({
        masks: [
          {
            id: 'mask-1',
            name: 'Test Mask',
          },
        ],
      } as any);
      expect(result.masks).toHaveLength(1);
      expect(result.masks[0].id).toBe('mask-1');
      expect(result.masks[0].name).toBe('Test Mask');
      expect(result.masks[0].visible).toBe(true);
      expect(result.masks[0].invert).toBe(false);
      expect(result.masks[0].opacity).toBe(100);
      expect(result.masks[0].adjustments).toBeDefined();
    });

    it('generates uuid for masks without id', () => {
      const result = normalizeLoadedAdjustments({
        masks: [{}],
      } as any);
      expect(result.masks).toHaveLength(1);
      expect(result.masks[0].id).toBe('test-uuid');
    });

    it('normalizes mask adjustments', () => {
      const result = normalizeLoadedAdjustments({
        masks: [
          {
            adjustments: {
              exposure: 2,
              contrast: 30,
            },
          },
        ],
      } as any);
      expect(result.masks[0].adjustments.exposure).toBe(2);
      expect(result.masks[0].adjustments.contrast).toBe(30);
      expect(result.masks[0].adjustments.brightness).toBe(INITIAL_MASK_ADJUSTMENTS.brightness);
    });

    it('normalizes subMasks inside masks', () => {
      const result = normalizeLoadedAdjustments({
        masks: [
          {
            subMasks: [
              {
                id: 'sub-1',
                type: 'brush',
              },
            ],
          },
        ],
      } as any);
      expect(result.masks[0].subMasks).toHaveLength(1);
      expect(result.masks[0].subMasks[0].id).toBe('sub-1');
      expect(result.masks[0].subMasks[0].type).toBe('brush');
      expect(result.masks[0].subMasks[0].visible).toBe(true);
      expect(result.masks[0].subMasks[0].mode).toBe(SubMaskMode.Additive);
      expect(result.masks[0].subMasks[0].invert).toBe(false);
      expect(result.masks[0].subMasks[0].opacity).toBe(100);
    });

    it('handles missing subMasks in mask', () => {
      const result = normalizeLoadedAdjustments({
        masks: [{}],
      } as any);
      expect(result.masks[0].subMasks).toEqual([]);
    });

    it('handles missing adjustments in mask', () => {
      const result = normalizeLoadedAdjustments({
        masks: [{}],
      } as any);
      expect(result.masks[0].adjustments).toBeDefined();
      expect(result.masks[0].adjustments.exposure).toBe(INITIAL_MASK_ADJUSTMENTS.exposure);
    });

    it('normalizes mask colorGrading', () => {
      const result = normalizeLoadedAdjustments({
        masks: [
          {
            adjustments: {
              colorGrading: {
                balance: 10,
                global: { hue: 20, saturation: 30, luminance: 40 },
              },
            },
          },
        ],
      } as any);
      expect(result.masks[0].adjustments.colorGrading.balance).toBe(10);
      expect(result.masks[0].adjustments.colorGrading.global).toEqual({
        hue: 20,
        saturation: 30,
        luminance: 40,
      });
      expect(result.masks[0].adjustments.colorGrading.blending).toBe(50);
    });

    it('normalizes mask hsl', () => {
      const result = normalizeLoadedAdjustments({
        masks: [
          {
            adjustments: {
              hsl: {
                reds: { hue: 10, saturation: 20, luminance: 30 },
              },
            },
          },
        ],
      } as any);
      expect(result.masks[0].adjustments.hsl.reds).toEqual({
        hue: 10,
        saturation: 20,
        luminance: 30,
      });
      expect(result.masks[0].adjustments.hsl.blues).toEqual({
        hue: 0,
        saturation: 0,
        luminance: 0,
      });
    });

    it('normalizes mask sectionVisibility', () => {
      const result = normalizeLoadedAdjustments({
        masks: [
          {
            adjustments: {
              sectionVisibility: {
                basic: false,
              },
            },
          },
        ],
      } as any);
      expect(result.masks[0].adjustments.sectionVisibility.basic).toBe(false);
      expect(result.masks[0].adjustments.sectionVisibility.curves).toBe(true);
    });

    it('deep clones mask curves', () => {
      const inputCurves = {
        red: [
          { x: 0, y: 0 },
          { x: 128, y: 200 },
          { x: 255, y: 255 },
        ],
      };
      const result = normalizeLoadedAdjustments({
        masks: [
          {
            adjustments: {
              curves: inputCurves,
            },
          },
        ],
      } as any);
      expect(result.masks[0].adjustments.curves.red).toHaveLength(3);
      expect(result.masks[0].adjustments.curves.red[1]).toEqual({ x: 128, y: 200 });
      expect(result.masks[0].adjustments.curves.blue).toHaveLength(2);
    });
  });

  describe('aiPatches array normalization', () => {
    it('normalizes aiPatches array with default values', () => {
      const result = normalizeLoadedAdjustments({
        aiPatches: [
          {
            id: 'patch-1',
            name: 'Test Patch',
            prompt: 'test prompt',
          },
        ],
      } as any);
      expect(result.aiPatches).toHaveLength(1);
      expect(result.aiPatches[0].id).toBe('patch-1');
      expect(result.aiPatches[0].name).toBe('Test Patch');
      expect(result.aiPatches[0].prompt).toBe('test prompt');
      expect(result.aiPatches[0].visible).toBe(true);
    });

    it('normalizes subMasks inside aiPatches', () => {
      const result = normalizeLoadedAdjustments({
        aiPatches: [
          {
            subMasks: [
              {
                id: 'sub-1',
                type: 'brush',
                mode: SubMaskMode.Subtractive,
              },
            ],
          },
        ],
      } as any);
      expect(result.aiPatches[0].subMasks).toHaveLength(1);
      expect(result.aiPatches[0].subMasks[0].mode).toBe(SubMaskMode.Subtractive);
      expect(result.aiPatches[0].subMasks[0].visible).toBe(true);
    });

    it('handles missing subMasks in aiPatch', () => {
      const result = normalizeLoadedAdjustments({
        aiPatches: [{}],
      } as any);
      expect(result.aiPatches[0].subMasks).toEqual([]);
    });

    it('handles missing aiPatches', () => {
      const result = normalizeLoadedAdjustments({} as any);
      expect(result.aiPatches).toEqual([]);
    });
  });

  describe('curves/pointCurves/parametricCurve deep cloning', () => {
    it('deep clones curves', () => {
      const inputCurves = {
        red: [
          { x: 0, y: 0 },
          { x: 255, y: 255 },
        ],
        green: [
          { x: 0, y: 0 },
          { x: 128, y: 100 },
          { x: 255, y: 255 },
        ],
      };
      const result = normalizeLoadedAdjustments({ curves: inputCurves } as any);
      expect(result.curves.green).toHaveLength(3);
      expect(result.curves.green[1]).toEqual({ x: 128, y: 100 });
      expect(result.curves.blue).toHaveLength(2);
      expect(result.curves.luma).toHaveLength(2);
    });

    it('deep clones pointCurves', () => {
      const inputPointCurves = {
        red: [
          { x: 0, y: 0 },
          { x: 100, y: 150 },
          { x: 255, y: 255 },
        ],
      };
      const result = normalizeLoadedAdjustments({ pointCurves: inputPointCurves } as any);
      expect(result.pointCurves.red).toHaveLength(3);
      expect(result.pointCurves.red[1]).toEqual({ x: 100, y: 150 });
      expect(result.pointCurves.green).toHaveLength(2);
    });

    it('deep clones parametricCurve', () => {
      const inputParametric = {
        red: {
          shadows: 10,
          highlights: 20,
        },
      };
      const result = normalizeLoadedAdjustments({ parametricCurve: inputParametric } as any);
      expect(result.parametricCurve.red.shadows).toBe(10);
      expect(result.parametricCurve.red.highlights).toBe(20);
      expect(result.parametricCurve.red.darks).toBe(DEFAULT_PARAMETRIC_CURVE_SETTINGS.darks);
      expect(result.parametricCurve.green).toEqual(DEFAULT_PARAMETRIC_CURVE_SETTINGS);
    });

    it('returns default curves when curves is not provided', () => {
      const result = normalizeLoadedAdjustments({} as any);
      expect(result.curves).toEqual(getDefaultCurves());
      expect(result.pointCurves).toEqual(getDefaultCurves());
      expect(result.parametricCurve).toEqual(getDefaultParametricCurve());
    });
  });

  describe('sectionVisibility merge', () => {
    it('merges provided sectionVisibility with defaults', () => {
      const result = normalizeLoadedAdjustments({
        sectionVisibility: {
          basic: false,
          curves: false,
        },
      } as any);
      expect(result.sectionVisibility.basic).toBe(false);
      expect(result.sectionVisibility.curves).toBe(false);
      expect(result.sectionVisibility.color).toBe(true);
      expect(result.sectionVisibility.details).toBe(true);
      expect(result.sectionVisibility.effects).toBe(true);
    });
  });

  describe('colorGrading and hsl merge', () => {
    it('merges colorGrading with defaults', () => {
      const result = normalizeLoadedAdjustments({
        colorGrading: {
          balance: 10,
          shadows: { hue: 20, saturation: 30, luminance: 40 },
        },
      } as any);
      expect(result.colorGrading.balance).toBe(10);
      expect(result.colorGrading.shadows).toEqual({ hue: 20, saturation: 30, luminance: 40 });
      expect(result.colorGrading.blending).toBe(50);
      expect(result.colorGrading.global).toEqual({ hue: 0, saturation: 0, luminance: 0 });
    });

    it('merges hsl with defaults', () => {
      const result = normalizeLoadedAdjustments({
        hsl: {
          reds: { hue: 10, saturation: 20, luminance: 30 },
          blues: { hue: 5, saturation: 15, luminance: 25 },
        },
      } as any);
      expect(result.hsl.reds).toEqual({ hue: 10, saturation: 20, luminance: 30 });
      expect(result.hsl.blues).toEqual({ hue: 5, saturation: 15, luminance: 25 });
      expect(result.hsl.greens).toEqual({ hue: 0, saturation: 0, luminance: 0 });
    });
  });

  describe('lensCorrectionMode and lens fields', () => {
    it('handles lensCorrectionMode correctly', () => {
      const result = normalizeLoadedAdjustments({
        lensCorrectionMode: 'auto',
      } as any);
      expect(result.lensCorrectionMode).toBe('auto');
    });

    it('defaults lensCorrectionMode to manual when not provided', () => {
      const result = normalizeLoadedAdjustments({} as any);
      expect(result.lensCorrectionMode).toBe('manual');
    });

    it('handles lens fields with nullish coalescing', () => {
      const result = normalizeLoadedAdjustments({
        lensMaker: 'Canon',
        lensModel: 'EF 50mm',
        lensDistortionAmount: 80,
      } as any);
      expect(result.lensMaker).toBe('Canon');
      expect(result.lensModel).toBe('EF 50mm');
      expect(result.lensDistortionAmount).toBe(80);
    });

    it('keeps null values for lens fields when explicitly set to null', () => {
      const result = normalizeLoadedAdjustments({
        lensMaker: null,
        lensModel: null,
      } as any);
      expect(result.lensMaker).toBeNull();
      expect(result.lensModel).toBeNull();
    });
  });

  describe('curveMode handling', () => {
    it('uses provided curveMode', () => {
      const result = normalizeLoadedAdjustments({
        curveMode: 'parametric',
      } as any);
      expect(result.curveMode).toBe('parametric');
    });

    it('defaults curveMode to point', () => {
      const result = normalizeLoadedAdjustments({} as any);
      expect(result.curveMode).toBe('point');
    });
  });

  describe('colorCalibration merge', () => {
    it('merges colorCalibration with defaults', () => {
      const result = normalizeLoadedAdjustments({
        colorCalibration: {
          redHue: 10,
          redSaturation: 20,
        },
      } as any);
      expect(result.colorCalibration.redHue).toBe(10);
      expect(result.colorCalibration.redSaturation).toBe(20);
      expect(result.colorCalibration.shadowsTint).toBe(0);
      expect(result.colorCalibration.greenHue).toBe(0);
    });
  });

  describe('sharpnessThreshold handling', () => {
    it('uses provided sharpnessThreshold', () => {
      const result = normalizeLoadedAdjustments({
        sharpnessThreshold: 25,
      } as any);
      expect(result.sharpnessThreshold).toBe(25);
    });

    it('defaults sharpnessThreshold to 15', () => {
      const result = normalizeLoadedAdjustments({} as any);
      expect(result.sharpnessThreshold).toBe(15);
    });
  });

  describe('flareAmount, glowAmount, halationAmount handling', () => {
    it('uses provided creative adjustment values', () => {
      const result = normalizeLoadedAdjustments({
        flareAmount: 50,
        glowAmount: 30,
        halationAmount: 20,
      } as any);
      expect(result.flareAmount).toBe(50);
      expect(result.glowAmount).toBe(30);
      expect(result.halationAmount).toBe(20);
    });

    it('defaults creative adjustment values to 0', () => {
      const result = normalizeLoadedAdjustments({} as any);
      expect(result.flareAmount).toBe(0);
      expect(result.glowAmount).toBe(0);
      expect(result.halationAmount).toBe(0);
    });
  });
});

describe('ADJUSTMENT_GROUPS', () => {
  it('has expected top-level category keys', () => {
    const categories = Object.keys(ADJUSTMENT_GROUPS);
    expect(categories).toContain('basic');
    expect(categories).toContain('color');
    expect(categories).toContain('details');
    expect(categories).toContain('effects');
    expect(categories).toContain('geometry');
    expect(categories).toContain('masks');
  });

  it('each group has label and keys properties', () => {
    Object.values(ADJUSTMENT_GROUPS).forEach((groups) => {
      groups.forEach((group) => {
        expect(group).toHaveProperty('label');
        expect(group).toHaveProperty('keys');
        expect(typeof group.label).toBe('string');
        expect(Array.isArray(group.keys)).toBe(true);
      });
    });
  });

  it('basic category has expected groups', () => {
    const basicLabels = ADJUSTMENT_GROUPS.basic.map((g) => g.label);
    expect(basicLabels).toContain('modals.copyPaste.groups.exposureToneMapper');
    expect(basicLabels).toContain('modals.copyPaste.groups.tone');
    expect(basicLabels).toContain('modals.copyPaste.groups.curves');
  });

  it('color category has expected groups', () => {
    const colorLabels = ADJUSTMENT_GROUPS.color.map((g) => g.label);
    expect(colorLabels).toContain('modals.copyPaste.groups.whiteBalance');
    expect(colorLabels).toContain('modals.copyPaste.groups.presence');
    expect(colorLabels).toContain('modals.copyPaste.groups.colorGrading');
    expect(colorLabels).toContain('modals.copyPaste.groups.colorMixer');
  });
});

describe('COPYABLE_ADJUSTMENT_KEYS', () => {
  it('is an array of strings', () => {
    expect(Array.isArray(COPYABLE_ADJUSTMENT_KEYS)).toBe(true);
    COPYABLE_ADJUSTMENT_KEYS.forEach((key) => {
      expect(typeof key).toBe('string');
    });
  });

  it('contains all keys from ADJUSTMENT_GROUPS', () => {
    const allGroupKeys = Object.values(ADJUSTMENT_GROUPS)
      .flat()
      .flatMap((group) => group.keys);
    expect(COPYABLE_ADJUSTMENT_KEYS.length).toBe(allGroupKeys.length);
    allGroupKeys.forEach((key) => {
      expect(COPYABLE_ADJUSTMENT_KEYS).toContain(key);
    });
  });
});

describe('ADJUSTMENT_SECTIONS', () => {
  it('has expected section keys', () => {
    const sections = Object.keys(ADJUSTMENT_SECTIONS);
    expect(sections).toContain('basic');
    expect(sections).toContain('curves');
    expect(sections).toContain('color');
    expect(sections).toContain('details');
    expect(sections).toContain('effects');
  });

  it('each section is an array of strings', () => {
    Object.values(ADJUSTMENT_SECTIONS).forEach((section) => {
      expect(Array.isArray(section)).toBe(true);
      section.forEach((item) => {
        expect(typeof item).toBe('string');
      });
    });
  });

  it('basic section includes exposure and toneMapper', () => {
    expect(ADJUSTMENT_SECTIONS.basic).toContain('exposure');
    expect(ADJUSTMENT_SECTIONS.basic).toContain('toneMapper');
    expect(ADJUSTMENT_SECTIONS.basic).toContain('brightness');
    expect(ADJUSTMENT_SECTIONS.basic).toContain('contrast');
  });

  it('curves section includes curve-related keys', () => {
    expect(ADJUSTMENT_SECTIONS.curves).toContain('curves');
    expect(ADJUSTMENT_SECTIONS.curves).toContain('pointCurves');
    expect(ADJUSTMENT_SECTIONS.curves).toContain('parametricCurve');
    expect(ADJUSTMENT_SECTIONS.curves).toContain('curveMode');
  });

  it('color section includes color-related keys', () => {
    expect(ADJUSTMENT_SECTIONS.color).toContain('saturation');
    expect(ADJUSTMENT_SECTIONS.color).toContain('temperature');
    expect(ADJUSTMENT_SECTIONS.color).toContain('hsl');
    expect(ADJUSTMENT_SECTIONS.color).toContain('colorGrading');
  });

  it('details section includes detail-related keys', () => {
    expect(ADJUSTMENT_SECTIONS.details).toContain('clarity');
    expect(ADJUSTMENT_SECTIONS.details).toContain('sharpness');
    expect(ADJUSTMENT_SECTIONS.details).toContain('lumaNoiseReduction');
  });

  it('effects section includes effect-related keys', () => {
    expect(ADJUSTMENT_SECTIONS.effects).toContain('grainAmount');
    expect(ADJUSTMENT_SECTIONS.effects).toContain('vignetteAmount');
    expect(ADJUSTMENT_SECTIONS.effects).toContain('glowAmount');
  });
});
