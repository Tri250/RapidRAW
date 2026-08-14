import { describe, it, expect } from 'vitest';
import {
  INITIAL_PORTRAIT_ADJUSTMENTS,
  INITIAL_ADJUSTMENTS,
  INITIAL_MASK_ADJUSTMENTS,
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

  it('fills in missing curve channels', () => {
    const loaded = {
      ...INITIAL_ADJUSTMENTS,
      curves: {
        luma: [
          { x: 0, y: 0 },
          { x: 255, y: 255 },
        ],
      },
    };
    const result = normalizeLoadedAdjustments(loaded as any);
    expect(result.curves.blue).toEqual([
      { x: 0, y: 0 },
      { x: 255, y: 255 },
    ]);
    expect(result.curves.green).toEqual([
      { x: 0, y: 0 },
      { x: 255, y: 255 },
    ]);
    expect(result.curves.red).toEqual([
      { x: 0, y: 0 },
      { x: 255, y: 255 },
    ]);
    expect(result.curves.luma).toEqual([
      { x: 0, y: 0 },
      { x: 255, y: 255 },
    ]);
  });

  it('fills in missing parametric curve channels', () => {
    const loaded = {
      ...INITIAL_ADJUSTMENTS,
      parametricCurve: {
        luma: { darks: 10 },
      },
    };
    const result = normalizeLoadedAdjustments(loaded as any);
    expect(result.parametricCurve?.luma.darks).toBe(10);
    expect(result.parametricCurve?.blue.darks).toBe(0);
    expect(result.parametricCurve?.blue.split1).toBe(25);
  });

  it('fills in missing sectionVisibility fields', () => {
    const loaded = {
      ...INITIAL_ADJUSTMENTS,
      sectionVisibility: { basic: true },
    };
    const result = normalizeLoadedAdjustments(loaded as any);
    expect(result.sectionVisibility.basic).toBe(true);
    expect(result.sectionVisibility.curves).toBe(true);
    expect(result.sectionVisibility.color).toBe(true);
    expect(result.sectionVisibility.details).toBe(true);
    expect(result.sectionVisibility.effects).toBe(true);
  });

  it('provides default id and subMasks for masks missing them', () => {
    const loaded = {
      ...INITIAL_ADJUSTMENTS,
      masks: [
        {
          adjustments: INITIAL_MASK_ADJUSTMENTS,
          invert: false,
          name: 'test',
          opacity: 100,
          visible: true,
          // id missing
          // subMasks missing
        },
      ],
    };
    const result = normalizeLoadedAdjustments(loaded as any);
    expect(result.masks[0].id).toBeDefined();
    expect(typeof result.masks[0].id).toBe('string');
    expect(result.masks[0].subMasks).toEqual([]);
  });

  it('assigns default subMasks for masks with null/undefined subMasks', () => {
    const loaded = {
      ...INITIAL_ADJUSTMENTS,
      masks: [
        {
          adjustments: INITIAL_MASK_ADJUSTMENTS,
          invert: false,
          name: 'test',
          opacity: 100,
          visible: true,
          id: 'existing-id',
          subMasks: undefined,
        },
      ],
    };
    const result = normalizeLoadedAdjustments(loaded as any);
    expect(result.masks[0].subMasks).toEqual([]);
  });

  it('handles malformed curves data gracefully (e.g., non-array values)', () => {
    const loaded = {
      ...INITIAL_ADJUSTMENTS,
      curves: {
        blue: 'not-an-array', // This should be ignored
        green: null, // This should be ignored
      },
    };
    const result = normalizeLoadedAdjustments(loaded as any);
    expect(result.curves.blue).toEqual([
      { x: 0, y: 0 },
      { x: 255, y: 255 },
    ]);
    expect(result.curves.green).toEqual([
      { x: 0, y: 0 },
      { x: 255, y: 255 },
    ]);
  });

  it('handles malformed mask subMasks array (contains nulls)', () => {
    const loaded = {
      ...INITIAL_ADJUSTMENTS,
      masks: [
        null, // Null mask container should be filtered out
        {
          adjustments: INITIAL_MASK_ADJUSTMENTS,
          invert: false,
          name: 'test',
          opacity: 100,
          visible: true,
          id: 'test-id',
          subMasks: [null, { type: 'brush' }], // Contains a null element
        },
      ],
    };
    const result = normalizeLoadedAdjustments(loaded as any);
    // Should not crash and should filter out null elements
    expect(result.masks.length).toBe(1);
    expect(result.masks[0].subMasks.length).toBe(1); // Only the valid one
  });
});
