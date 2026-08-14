import { describe, it, expect } from 'vitest';
import { THEMES, DEFAULT_THEME_ID, type ThemeProps } from './themes';
import { Theme } from '../components/ui/AppProperties';

describe('THEMES', () => {
  it('defines every supported theme', () => {
    const ids = THEMES.map((t) => t.id).sort();
    expect(ids).toEqual([Theme.Dark, Theme.Grey, Theme.Light].sort());
  });

  it('has unique theme ids and names', () => {
    const ids = THEMES.map((t) => t.id);
    const names = THEMES.map((t) => t.name);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it('every theme has a name and a splash image', () => {
    for (const theme of THEMES) {
      expect(theme.name, theme.id).toBeTruthy();
      expect(theme.splashImage, theme.id).toMatch(/^\/splash-.+\.jpg$/);
    }
  });

  it('every theme defines the same set of CSS variables', () => {
    const keySets = THEMES.map((t) => Object.keys(t.cssVariables).sort());
    const first = keySets[0];
    for (const keys of keySets.slice(1)) {
      expect(keys, 'CSS variable key set must be identical across themes').toEqual(first);
    }
  });

  it('every CSS variable value is a non-empty string', () => {
    for (const theme of THEMES) {
      for (const [key, value] of Object.entries(theme.cssVariables) as Array<[string, string]>) {
        expect(typeof value, `${theme.id}.${key}`).toBe('string');
        expect(value.length, `${theme.id}.${key}`).toBeGreaterThan(0);
      }
    }
  });

  it('the dark theme has the correct contrast values', () => {
    const dark = THEMES.find((t) => t.id === Theme.Dark)!;
    expect(dark.cssVariables['--app-bg-primary']).toBe('rgb(12, 12, 18)');
    expect(dark.cssVariables['--app-text-primary']).toBe('rgb(230, 234, 238)');
  });

  it('DEFAULT_THEME_ID resolves to a defined theme', () => {
    expect(THEMES.some((t: ThemeProps) => t.id === DEFAULT_THEME_ID)).toBe(true);
  });
});
