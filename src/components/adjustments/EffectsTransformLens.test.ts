import { describe, it, expect } from 'vitest';
import {
  INITIAL_ADJUSTMENTS,
  normalizeLoadedAdjustments,
  Effect,
  CreativeAdjustment,
  TransformAdjustment,
  LensAdjustment,
  ADJUSTMENT_GROUPS,
} from '../../utils/adjustments';

// ─── 1. Effects 模块 ────────────────────────────────────────────────

describe('Effects - Vignette defaults', () => {
  it('VignetteAmount defaults to 0', () => {
    expect(INITIAL_ADJUSTMENTS.vignetteAmount).toBe(0);
  });
  it('VignetteFeather defaults to 50', () => {
    expect(INITIAL_ADJUSTMENTS.vignetteFeather).toBe(50);
  });
  it('VignetteMidpoint defaults to 50', () => {
    expect(INITIAL_ADJUSTMENTS.vignetteMidpoint).toBe(50);
  });
  it('VignetteRoundness defaults to 0', () => {
    expect(INITIAL_ADJUSTMENTS.vignetteRoundness).toBe(0);
  });
});

describe('Effects - Grain defaults', () => {
  it('GrainAmount defaults to 0', () => {
    expect(INITIAL_ADJUSTMENTS.grainAmount).toBe(0);
  });
  it('GrainRoughness defaults to 50', () => {
    expect(INITIAL_ADJUSTMENTS.grainRoughness).toBe(50);
  });
  it('GrainSize defaults to 25', () => {
    expect(INITIAL_ADJUSTMENTS.grainSize).toBe(25);
  });
});

describe('Effects - Creative (Glow/Halation/Flare) defaults', () => {
  it('GlowAmount defaults to 0', () => {
    expect(INITIAL_ADJUSTMENTS.glowAmount).toBe(0);
  });
  it('HalationAmount defaults to 0', () => {
    expect(INITIAL_ADJUSTMENTS.halationAmount).toBe(0);
  });
  it('FlareAmount defaults to 0', () => {
    expect(INITIAL_ADJUSTMENTS.flareAmount).toBe(0);
  });
});

describe('Effects - LUT defaults', () => {
  it('lutIntensity defaults to 100', () => {
    expect(INITIAL_ADJUSTMENTS.lutIntensity).toBe(100);
  });
  it('lutData defaults to null', () => {
    expect(INITIAL_ADJUSTMENTS.lutData).toBeNull();
  });
  it('lutName defaults to null', () => {
    expect(INITIAL_ADJUSTMENTS.lutName).toBeNull();
  });
  it('lutPath defaults to null', () => {
    expect(INITIAL_ADJUSTMENTS.lutPath).toBeNull();
  });
  it('lutSize defaults to 0', () => {
    expect(INITIAL_ADJUSTMENTS.lutSize).toBe(0);
  });
});

describe('Effect enum values', () => {
  it('contains all expected Effect values', () => {
    const expected = {
      GrainAmount: 'grainAmount',
      GrainRoughness: 'grainRoughness',
      GrainSize: 'grainSize',
      LutData: 'lutData',
      LutIntensity: 'lutIntensity',
      LutName: 'lutName',
      LutPath: 'lutPath',
      LutSize: 'lutSize',
      VignetteAmount: 'vignetteAmount',
      VignetteFeather: 'vignetteFeather',
      VignetteMidpoint: 'vignetteMidpoint',
      VignetteRoundness: 'vignetteRoundness',
    };
    for (const [key, value] of Object.entries(expected)) {
      expect((Effect as any)[key]).toBe(value);
    }
  });

  it('Effect enum count is 12', () => {
    expect(Object.keys(Effect).length).toBe(12);
  });
});

describe('CreativeAdjustment enum values', () => {
  it('contains all expected CreativeAdjustment values', () => {
    const expected = {
      GlowAmount: 'glowAmount',
      HalationAmount: 'halationAmount',
      FlareAmount: 'flareAmount',
    };
    for (const [key, value] of Object.entries(expected)) {
      expect((CreativeAdjustment as any)[key]).toBe(value);
    }
  });

  it('CreativeAdjustment enum count is 3', () => {
    expect(Object.keys(CreativeAdjustment).length).toBe(3);
  });
});

// ─── 2. Transform (Crop & Transform) 模块 ───────────────────────────

describe('Transform - default values', () => {
  it('TransformDistortion defaults to 0', () => {
    expect(INITIAL_ADJUSTMENTS.transformDistortion).toBe(0);
  });
  it('TransformVertical defaults to 0', () => {
    expect(INITIAL_ADJUSTMENTS.transformVertical).toBe(0);
  });
  it('TransformHorizontal defaults to 0', () => {
    expect(INITIAL_ADJUSTMENTS.transformHorizontal).toBe(0);
  });
  it('TransformRotate defaults to 0', () => {
    expect(INITIAL_ADJUSTMENTS.transformRotate).toBe(0);
  });
  it('TransformAspect defaults to 0', () => {
    expect(INITIAL_ADJUSTMENTS.transformAspect).toBe(0);
  });
  it('TransformScale defaults to 100', () => {
    expect(INITIAL_ADJUSTMENTS.transformScale).toBe(100);
  });
  it('TransformXOffset defaults to 0', () => {
    expect(INITIAL_ADJUSTMENTS.transformXOffset).toBe(0);
  });
  it('TransformYOffset defaults to 0', () => {
    expect(INITIAL_ADJUSTMENTS.transformYOffset).toBe(0);
  });
});

describe('Transform - Crop related defaults', () => {
  it('rotation defaults to 0', () => {
    expect(INITIAL_ADJUSTMENTS.rotation).toBe(0);
  });
  it('flipHorizontal defaults to false', () => {
    expect(INITIAL_ADJUSTMENTS.flipHorizontal).toBe(false);
  });
  it('flipVertical defaults to false', () => {
    expect(INITIAL_ADJUSTMENTS.flipVertical).toBe(false);
  });
  it('orientationSteps defaults to 0', () => {
    expect(INITIAL_ADJUSTMENTS.orientationSteps).toBe(0);
  });
  it('crop defaults to null', () => {
    expect(INITIAL_ADJUSTMENTS.crop).toBeNull();
  });
  it('aspectRatio defaults to null', () => {
    expect(INITIAL_ADJUSTMENTS.aspectRatio).toBeNull();
  });
});

describe('TransformAdjustment enum values', () => {
  it('contains all expected TransformAdjustment values', () => {
    const expected = {
      TransformDistortion: 'transformDistortion',
      TransformVertical: 'transformVertical',
      TransformHorizontal: 'transformHorizontal',
      TransformRotate: 'transformRotate',
      TransformAspect: 'transformAspect',
      TransformScale: 'transformScale',
      TransformXOffset: 'transformXOffset',
      TransformYOffset: 'transformYOffset',
    };
    for (const [key, value] of Object.entries(expected)) {
      expect((TransformAdjustment as any)[key]).toBe(value);
    }
  });

  it('TransformAdjustment enum count is 8', () => {
    expect(Object.keys(TransformAdjustment).length).toBe(8);
  });
});

// ─── 3. Lens Correction 模块 ────────────────────────────────────────

describe('Lens Correction - default values', () => {
  it('lensCorrectionMode defaults to manual', () => {
    expect(INITIAL_ADJUSTMENTS.lensCorrectionMode).toBe('manual');
  });
  it('lensMaker defaults to null', () => {
    expect(INITIAL_ADJUSTMENTS.lensMaker).toBeNull();
  });
  it('lensModel defaults to null', () => {
    expect(INITIAL_ADJUSTMENTS.lensModel).toBeNull();
  });
  it('lensDistortionAmount defaults to 100', () => {
    expect(INITIAL_ADJUSTMENTS.lensDistortionAmount).toBe(100);
  });
  it('lensVignetteAmount defaults to 100', () => {
    expect(INITIAL_ADJUSTMENTS.lensVignetteAmount).toBe(100);
  });
  it('lensTcaAmount defaults to 100', () => {
    expect(INITIAL_ADJUSTMENTS.lensTcaAmount).toBe(100);
  });
  it('lensDistortionEnabled defaults to true', () => {
    expect(INITIAL_ADJUSTMENTS.lensDistortionEnabled).toBe(true);
  });
  it('lensTcaEnabled defaults to true', () => {
    expect(INITIAL_ADJUSTMENTS.lensTcaEnabled).toBe(true);
  });
  it('lensVignetteEnabled defaults to true', () => {
    expect(INITIAL_ADJUSTMENTS.lensVignetteEnabled).toBe(true);
  });
  it('lensDistortionParams defaults to null', () => {
    expect(INITIAL_ADJUSTMENTS.lensDistortionParams).toBeNull();
  });
});

describe('LensAdjustment enum values', () => {
  it('contains all expected LensAdjustment values', () => {
    const expected = {
      LensCorrectionMode: 'lensCorrectionMode',
      LensMaker: 'lensMaker',
      LensModel: 'lensModel',
      LensDistortionAmount: 'lensDistortionAmount',
      LensVignetteAmount: 'lensVignetteAmount',
      LensTcaAmount: 'lensTcaAmount',
      LensDistortionParams: 'lensDistortionParams',
      LensDistortionEnabled: 'lensDistortionEnabled',
      LensTcaEnabled: 'lensTcaEnabled',
      LensVignetteEnabled: 'lensVignetteEnabled',
    };
    for (const [key, value] of Object.entries(expected)) {
      expect((LensAdjustment as any)[key]).toBe(value);
    }
  });

  it('LensAdjustment enum count is 10', () => {
    expect(Object.keys(LensAdjustment).length).toBe(10);
  });
});

// ─── 重点测试项 ──────────────────────────────────────────────────────

describe('Enum values match INITIAL_ADJUSTMENTS keys', () => {
  it('every Effect enum value is a key in INITIAL_ADJUSTMENTS', () => {
    for (const value of Object.values(Effect)) {
      expect(value in INITIAL_ADJUSTMENTS).toBe(true);
    }
  });
  it('every CreativeAdjustment enum value is a key in INITIAL_ADJUSTMENTS', () => {
    for (const value of Object.values(CreativeAdjustment)) {
      expect(value in INITIAL_ADJUSTMENTS).toBe(true);
    }
  });
  it('every TransformAdjustment enum value is a key in INITIAL_ADJUSTMENTS', () => {
    for (const value of Object.values(TransformAdjustment)) {
      expect(value in INITIAL_ADJUSTMENTS).toBe(true);
    }
  });
  it('every LensAdjustment enum value is a key in INITIAL_ADJUSTMENTS', () => {
    for (const value of Object.values(LensAdjustment)) {
      expect(value in INITIAL_ADJUSTMENTS).toBe(true);
    }
  });
});

describe('ADJUSTMENT_GROUPS - effects group keys completeness', () => {
  it('effects group contains all Effect enum values', () => {
    const effectsKeys = ADJUSTMENT_GROUPS.effects.flatMap((g) => g.keys);
    for (const value of Object.values(Effect)) {
      expect(effectsKeys).toContain(value);
    }
  });
  it('effects group contains all CreativeAdjustment enum values', () => {
    const effectsKeys = ADJUSTMENT_GROUPS.effects.flatMap((g) => g.keys);
    for (const value of Object.values(CreativeAdjustment)) {
      expect(effectsKeys).toContain(value);
    }
  });
});

describe('ADJUSTMENT_GROUPS - geometry group keys completeness', () => {
  it('geometry group contains crop and aspectRatio keys', () => {
    const geometryKeys = ADJUSTMENT_GROUPS.geometry.flatMap((g) => g.keys);
    expect(geometryKeys).toContain('crop');
    expect(geometryKeys).toContain('aspectRatio');
  });
  it('geometry group contains all TransformAdjustment enum values', () => {
    const geometryKeys = ADJUSTMENT_GROUPS.geometry.flatMap((g) => g.keys);
    for (const value of Object.values(TransformAdjustment)) {
      expect(geometryKeys).toContain(value);
    }
  });
  it('geometry group contains rotation, flipHorizontal, flipVertical, orientationSteps', () => {
    const geometryKeys = ADJUSTMENT_GROUPS.geometry.flatMap((g) => g.keys);
    expect(geometryKeys).toContain('rotation');
    expect(geometryKeys).toContain('flipHorizontal');
    expect(geometryKeys).toContain('flipVertical');
    expect(geometryKeys).toContain('orientationSteps');
  });
  it('geometry group contains most LensAdjustment enum values (excluding LensDistortionParams)', () => {
    const geometryKeys = ADJUSTMENT_GROUPS.geometry.flatMap((g) => g.keys);
    // LensDistortionParams is NOT in the geometry group keys per source code
    const lensKeysInGroup = Object.values(LensAdjustment).filter(
      (v) => v !== LensAdjustment.LensDistortionParams
    );
    for (const key of lensKeysInGroup) {
      expect(geometryKeys).toContain(key);
    }
  });
});

describe('normalizeLoadedAdjustments - effects/geometry/lens data completion', () => {
  it('fills missing effects fields with defaults', () => {
    const loaded = { vignetteAmount: 30 } as any;
    const result = normalizeLoadedAdjustments(loaded);
    expect(result.vignetteAmount).toBe(30);
    expect(result.vignetteFeather).toBe(50);
    expect(result.vignetteMidpoint).toBe(50);
    expect(result.vignetteRoundness).toBe(0);
    expect(result.grainAmount).toBe(0);
    expect(result.grainRoughness).toBe(50);
    expect(result.grainSize).toBe(25);
    expect(result.glowAmount).toBe(0);
    expect(result.halationAmount).toBe(0);
    expect(result.flareAmount).toBe(0);
    expect(result.lutIntensity).toBe(100);
    expect(result.lutData).toBeNull();
    expect(result.lutName).toBeNull();
    expect(result.lutPath).toBeNull();
    expect(result.lutSize).toBe(0);
  });

  it('fills missing transform fields with defaults', () => {
    const loaded = { transformScale: 150 } as any;
    const result = normalizeLoadedAdjustments(loaded);
    expect(result.transformDistortion).toBe(0);
    expect(result.transformVertical).toBe(0);
    expect(result.transformHorizontal).toBe(0);
    expect(result.transformRotate).toBe(0);
    expect(result.transformAspect).toBe(0);
    expect(result.transformScale).toBe(150);
    expect(result.transformXOffset).toBe(0);
    expect(result.transformYOffset).toBe(0);
  });

  it('fills missing crop-related fields with defaults', () => {
    const loaded = { rotation: 90 } as any;
    const result = normalizeLoadedAdjustments(loaded);
    expect(result.rotation).toBe(90);
    expect(result.flipHorizontal).toBe(false);
    expect(result.flipVertical).toBe(false);
    expect(result.orientationSteps).toBe(0);
    expect(result.crop).toBeNull();
    expect(result.aspectRatio).toBeNull();
  });

  it('fills missing lens correction fields with defaults', () => {
    const loaded = {} as any;
    const result = normalizeLoadedAdjustments(loaded);
    expect(result.lensCorrectionMode).toBe('manual');
    expect(result.lensMaker).toBeNull();
    expect(result.lensModel).toBeNull();
    expect(result.lensDistortionAmount).toBe(100);
    expect(result.lensVignetteAmount).toBe(100);
    expect(result.lensTcaAmount).toBe(100);
    expect(result.lensDistortionEnabled).toBe(true);
    expect(result.lensTcaEnabled).toBe(true);
    expect(result.lensVignetteEnabled).toBe(true);
    expect(result.lensDistortionParams).toBeNull();
  });

  it('preserves provided lens values', () => {
    const loaded = {
      lensCorrectionMode: 'auto',
      lensMaker: 'Canon',
      lensModel: '50mm f/1.8',
      lensDistortionAmount: 80,
      lensVignetteAmount: 60,
      lensTcaAmount: 40,
      lensDistortionEnabled: false,
      lensTcaEnabled: false,
      lensVignetteEnabled: false,
    } as any;
    const result = normalizeLoadedAdjustments(loaded);
    expect(result.lensCorrectionMode).toBe('auto');
    expect(result.lensMaker).toBe('Canon');
    expect(result.lensModel).toBe('50mm f/1.8');
    expect(result.lensDistortionAmount).toBe(80);
    expect(result.lensVignetteAmount).toBe(60);
    expect(result.lensTcaAmount).toBe(40);
    expect(result.lensDistortionEnabled).toBe(false);
    expect(result.lensTcaEnabled).toBe(false);
    expect(result.lensVignetteEnabled).toBe(false);
  });

  it('merges partial lensDistortionParams with defaults', () => {
    const loaded = {
      lensDistortionParams: { k1: 0.01, k2: 0.02, k3: 0.003, model: 1, tca_vr: 1.0, tca_vb: 1.0, vig_k1: 0.5, vig_k2: 0.3, vig_k3: 0.1 },
    } as any;
    const result = normalizeLoadedAdjustments(loaded);
    expect(result.lensDistortionParams).toEqual({
      k1: 0.01, k2: 0.02, k3: 0.003, model: 1,
      tca_vr: 1.0, tca_vb: 1.0, vig_k1: 0.5, vig_k2: 0.3, vig_k3: 0.1,
    });
  });

  it('sets lensDistortionParams to null when not provided', () => {
    const loaded = {} as any;
    const result = normalizeLoadedAdjustments(loaded);
    expect(result.lensDistortionParams).toBeNull();
  });

  it('returns INITIAL_ADJUSTMENTS for null input', () => {
    const result = normalizeLoadedAdjustments(null as any);
    expect(result.vignetteAmount).toBe(0);
    expect(result.lensCorrectionMode).toBe('manual');
    expect(result.transformDistortion).toBe(0);
    expect(result.transformScale).toBe(100);
  });
});

describe('lensCorrectionMode valid values', () => {
  it('accepts manual', () => {
    expect(INITIAL_ADJUSTMENTS.lensCorrectionMode).toBe('manual');
  });
  it('accepts auto via normalizeLoadedAdjustments', () => {
    const loaded = { lensCorrectionMode: 'auto' } as any;
    const result = normalizeLoadedAdjustments(loaded);
    expect(result.lensCorrectionMode).toBe('auto');
  });
  it('falls back to manual for falsy values', () => {
    const loaded = { lensCorrectionMode: '' } as any;
    const result = normalizeLoadedAdjustments(loaded);
    expect(result.lensCorrectionMode).toBe('manual');
  });
});

describe('toneMapper valid values and default', () => {
  it('toneMapper defaults to basic', () => {
    expect(INITIAL_ADJUSTMENTS.toneMapper).toBe('basic');
  });
  it('toneMapper can be agx', () => {
    const loaded = { toneMapper: 'agx' } as any;
    const result = normalizeLoadedAdjustments(loaded);
    expect(result.toneMapper).toBe('agx');
  });
  it('toneMapper can be basic', () => {
    const loaded = { toneMapper: 'basic' } as any;
    const result = normalizeLoadedAdjustments(loaded);
    expect(result.toneMapper).toBe('basic');
  });
});
