import { describe, it, expect } from 'vitest';
import {
  INITIAL_PORTRAIT_ADJUSTMENTS,
  INITIAL_ADJUSTMENTS,
  normalizeLoadedAdjustments,
} from './adjustments';

describe('INITIAL_PORTRAIT_ADJUSTMENTS', () => {
  it('has all required fields with default zero values', () => {
    expect(INITIAL_PORTRAIT_ADJUSTMENTS.skinSmoothingStrength).toBe(0);
    expect(INITIAL_PORTRAIT_ADJUSTMENTS.faceSlimAmount).toBe(0);
    expect(INITIAL_PORTRAIT_ADJUSTMENTS.eyeEnlargeAmount).toBe(0);
    expect(INITIAL_PORTRAIT_ADJUSTMENTS.lipstickColor).toBe('#cc2244');
    expect(INITIAL_PORTRAIT_ADJUSTMENTS.blemishSpots).toEqual([]);
  });
});

describe('INITIAL_ADJUSTMENTS', () => {
  it('contains portrait sub-object', () => {
    expect(INITIAL_ADJUSTMENTS.portrait).toBeDefined();
    expect(INITIAL_ADJUSTMENTS.portrait.skinSmoothingStrength).toBe(0);
  });
});

describe('normalizeLoadedAdjustments', () => {
  it('returns defaults for null input', () => {
    const result = normalizeLoadedAdjustments(null as any);
    expect(result.portrait.skinSmoothingStrength).toBe(0);
  });

  it('preserves loaded portrait values', () => {
    const loaded = {
      ...INITIAL_ADJUSTMENTS,
      portrait: {
        ...INITIAL_PORTRAIT_ADJUSTMENTS,
        skinSmoothingStrength: 50,
      },
    };
    const result = normalizeLoadedAdjustments(loaded as any);
    expect(result.portrait.skinSmoothingStrength).toBe(50);
  });
});
