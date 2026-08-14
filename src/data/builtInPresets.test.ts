import { describe, it, expect } from 'vitest';
import { BUILT_IN_PRESETS } from './builtInPresets';

describe('BUILT_IN_PRESETS', () => {
  it('contains a non-empty set of presets', () => {
    expect(BUILT_IN_PRESETS.length).toBeGreaterThan(0);
  });

  it('gives every preset a unique id', () => {
    const ids = BUILT_IN_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every preset a non-empty name and localized name', () => {
    for (const preset of BUILT_IN_PRESETS) {
      expect(preset.name.trim(), `name of ${preset.id}`).not.toBe('');
      expect(preset.nameZh.trim(), `nameZh of ${preset.id}`).not.toBe('');
    }
  });

  it('uses only supported preset types', () => {
    const validTypes = new Set(['portrait', 'color', 'ai-color', 'combined']);
    for (const preset of BUILT_IN_PRESETS) {
      expect(validTypes.has(preset.type), `type of ${preset.id}`).toBe(true);
    }
  });

  it('gives every preset a non-empty category', () => {
    for (const preset of BUILT_IN_PRESETS) {
      expect(preset.category.trim(), `category of ${preset.id}`).not.toBe('');
    }
  });

  it('gives every preset at least one adjustment value', () => {
    for (const preset of BUILT_IN_PRESETS) {
      const { portrait, ...rest } = preset.adjustments;
      const nonPortraitKeys = Object.keys(rest);
      const hasPortraitKeys = !!portrait && Object.keys(portrait).length > 0;
      expect(
        nonPortraitKeys.length > 0 || hasPortraitKeys,
        `preset ${preset.id} has no adjustments`,
      ).toBe(true);
    }
  });

  it('portrait presets carry portrait adjustments', () => {
    for (const preset of BUILT_IN_PRESETS) {
      if (preset.type === 'portrait') {
        expect(preset.adjustments.portrait, `portrait adjustments of ${preset.id}`).toBeTruthy();
        expect(Object.keys(preset.adjustments.portrait || {}).length, `portrait of ${preset.id}`).toBeGreaterThan(0);
      }
    }
  });

  it('color presets carry non-portrait adjustments', () => {
    for (const preset of BUILT_IN_PRESETS) {
      if (preset.type === 'color') {
        const { portrait: _portrait, ...rest } = preset.adjustments;
        expect(Object.keys(rest).length, `color adjustments of ${preset.id}`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps percentage adjustments within the 0-100 range', () => {
    const numericKeys: Array<[string, string]> = [
      ['portrait', 'skinSmoothingStrength'],
      ['portrait', 'skinSmoothingDetailPreserve'],
      ['portrait', 'teethWhitenBrightness'],
      ['portrait', 'eyeBrightenAmount'],
      ['portrait', 'eyeEnlargeAmount'],
      ['portrait', 'faceSlimAmount'],
      ['portrait', 'jawAmount'],
    ];
    for (const preset of BUILT_IN_PRESETS) {
      const portrait = preset.adjustments.portrait;
      if (!portrait) continue;
      for (const [section, key] of numericKeys) {
        const value = portrait[key as keyof typeof portrait] as number | undefined;
        if (value === undefined) continue;
        expect(Math.abs(value), `${preset.id}.${section}.${key}`).toBeLessThanOrEqual(100);
      }
    }
  });
});
