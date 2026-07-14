import { describe, it, expect } from 'vitest';
import {
  normalizeCombo,
  codeToDisplayLabel,
  isValidShortcutKey,
  formatKeyCode,
  arraysEqual,
  KEYBIND_DEFINITIONS,
  KEYBIND_SECTIONS,
} from '../keyboardUtils';

describe('KEYBIND_DEFINITIONS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(KEYBIND_DEFINITIONS)).toBe(true);
    expect(KEYBIND_DEFINITIONS.length).toBeGreaterThan(0);
  });

  it('each element has action, description, defaultCombo, section fields', () => {
    KEYBIND_DEFINITIONS.forEach((def) => {
      expect(def).toHaveProperty('action');
      expect(def).toHaveProperty('description');
      expect(def).toHaveProperty('defaultCombo');
      expect(def).toHaveProperty('section');
      expect(typeof def.action).toBe('string');
      expect(typeof def.description).toBe('string');
      expect(Array.isArray(def.defaultCombo)).toBe(true);
    });
  });

  it('section is a valid value', () => {
    const validSections = ['library', 'view', 'rating', 'panels', 'editing'];
    KEYBIND_DEFINITIONS.forEach((def) => {
      expect(validSections).toContain(def.section);
    });
  });
});

describe('KEYBIND_SECTIONS', () => {
  it('contains all 5 sections', () => {
    expect(KEYBIND_SECTIONS.length).toBe(5);
  });

  it('each section has id and label', () => {
    KEYBIND_SECTIONS.forEach((section) => {
      expect(section).toHaveProperty('id');
      expect(section).toHaveProperty('label');
      expect(typeof section.id).toBe('string');
      expect(typeof section.label).toBe('string');
    });
  });

  it('contains all expected section ids', () => {
    const ids = KEYBIND_SECTIONS.map((s) => s.id);
    expect(ids).toContain('library');
    expect(ids).toContain('view');
    expect(ids).toContain('rating');
    expect(ids).toContain('panels');
    expect(ids).toContain('editing');
  });
});

describe('normalizeCombo', () => {
  it('normal key (KeyA) is correctly identified', () => {
    const event = new KeyboardEvent('keydown', { code: 'KeyA' });
    const result = normalizeCombo(event);
    expect(result).toEqual(['KeyA']);
  });

  it('digit key (Digit0) is correctly identified', () => {
    const event = new KeyboardEvent('keydown', { code: 'Digit0' });
    const result = normalizeCombo(event);
    expect(result).toEqual(['Digit0']);
  });

  it('digit key (Digit5) is correctly identified', () => {
    const event = new KeyboardEvent('keydown', { code: 'Digit5' });
    const result = normalizeCombo(event);
    expect(result).toEqual(['Digit5']);
  });

  it('ctrl modifier is correctly added', () => {
    const event = new KeyboardEvent('keydown', { code: 'KeyA', ctrlKey: true });
    const result = normalizeCombo(event);
    expect(result).toEqual(['ctrl', 'KeyA']);
  });

  it('meta modifier is treated as ctrl', () => {
    const event = new KeyboardEvent('keydown', { code: 'KeyA', metaKey: true });
    const result = normalizeCombo(event);
    expect(result).toEqual(['ctrl', 'KeyA']);
  });

  it('shift modifier is correctly added', () => {
    const event = new KeyboardEvent('keydown', { code: 'KeyA', shiftKey: true });
    const result = normalizeCombo(event);
    expect(result).toEqual(['shift', 'KeyA']);
  });

  it('alt modifier is correctly added', () => {
    const event = new KeyboardEvent('keydown', { code: 'KeyA', altKey: true });
    const result = normalizeCombo(event);
    expect(result).toEqual(['alt', 'KeyA']);
  });

  it('multiple modifiers are correctly combined', () => {
    const event = new KeyboardEvent('keydown', {
      code: 'KeyC',
      ctrlKey: true,
      shiftKey: true,
      altKey: true,
    });
    const result = normalizeCombo(event);
    expect(result).toEqual(['ctrl', 'shift', 'alt', 'KeyC']);
  });

  it('macos: Backspace + ctrl converts to Delete', () => {
    const event = new KeyboardEvent('keydown', { code: 'Backspace', ctrlKey: true });
    const result = normalizeCombo(event, 'macos');
    expect(result).toEqual(['Delete']);
  });

  it('macos: Backspace + meta converts to Delete', () => {
    const event = new KeyboardEvent('keydown', { code: 'Backspace', metaKey: true });
    const result = normalizeCombo(event, 'macos');
    expect(result).toEqual(['Delete']);
  });

  it('non-macos: Backspace + ctrl stays as Backspace with ctrl', () => {
    const event = new KeyboardEvent('keydown', { code: 'Backspace', ctrlKey: true });
    const result = normalizeCombo(event, 'windows');
    expect(result).toEqual(['ctrl', 'Backspace']);
  });

  it('Numpad digit keys convert to DigitX', () => {
    for (let i = 0; i <= 9; i++) {
      const event = new KeyboardEvent('keydown', { code: `Numpad${i}` });
      const result = normalizeCombo(event);
      expect(result).toEqual([`Digit${i}`]);
    }
  });

  it('NumpadAdd converts to Equal', () => {
    const event = new KeyboardEvent('keydown', { code: 'NumpadAdd' });
    const result = normalizeCombo(event);
    expect(result).toEqual(['Equal']);
  });

  it('NumpadSubtract converts to Minus', () => {
    const event = new KeyboardEvent('keydown', { code: 'NumpadSubtract' });
    const result = normalizeCombo(event);
    expect(result).toEqual(['Minus']);
  });

  it('invalid key code returns empty array', () => {
    const event = new KeyboardEvent('keydown', { code: 'InvalidCode' });
    const result = normalizeCombo(event);
    expect(result).toEqual([]);
  });

  it('only modifier keys return array of modifiers only', () => {
    const event = new KeyboardEvent('keydown', { code: 'ShiftLeft', shiftKey: true });
    const result = normalizeCombo(event);
    expect(result).toEqual(['shift']);
  });

  it('Space key is valid', () => {
    const event = new KeyboardEvent('keydown', { code: 'Space' });
    const result = normalizeCombo(event);
    expect(result).toEqual(['Space']);
  });

  it('ArrowUp key is valid', () => {
    const event = new KeyboardEvent('keydown', { code: 'ArrowUp' });
    const result = normalizeCombo(event);
    expect(result).toEqual(['ArrowUp']);
  });
});

describe('codeToDisplayLabel', () => {
  it('KeyA displays as A', () => {
    expect(codeToDisplayLabel('KeyA')).toBe('A');
  });

  it('KeyZ displays as Z', () => {
    expect(codeToDisplayLabel('KeyZ')).toBe('Z');
  });

  it('Digit0 displays as 0', () => {
    expect(codeToDisplayLabel('Digit0')).toBe('0');
  });

  it('Digit9 displays as 9', () => {
    expect(codeToDisplayLabel('Digit9')).toBe('9');
  });

  it('Numpad5 displays as Numpad 5', () => {
    expect(codeToDisplayLabel('Numpad5')).toBe('Numpad 5');
  });

  it('Numpad0 displays as Numpad 0', () => {
    expect(codeToDisplayLabel('Numpad0')).toBe('Numpad 0');
  });

  it('Space displays as Space', () => {
    expect(codeToDisplayLabel('Space')).toBe('Space');
  });

  it('ArrowUp displays as ↑', () => {
    expect(codeToDisplayLabel('ArrowUp')).toBe('↑');
  });

  it('ArrowDown displays as ↓', () => {
    expect(codeToDisplayLabel('ArrowDown')).toBe('↓');
  });

  it('ArrowLeft displays as ←', () => {
    expect(codeToDisplayLabel('ArrowLeft')).toBe('←');
  });

  it('ArrowRight displays as →', () => {
    expect(codeToDisplayLabel('ArrowRight')).toBe('→');
  });

  it('Backspace displays as ⌫', () => {
    expect(codeToDisplayLabel('Backspace')).toBe('⌫');
  });

  it('Enter displays as Enter', () => {
    expect(codeToDisplayLabel('Enter')).toBe('Enter');
  });

  it('Delete displays as Delete', () => {
    expect(codeToDisplayLabel('Delete')).toBe('Delete');
  });

  it('unknown code returns null', () => {
    expect(codeToDisplayLabel('UnknownCode')).toBeNull();
  });

  it('empty string returns null', () => {
    expect(codeToDisplayLabel('')).toBeNull();
  });
});

describe('isValidShortcutKey', () => {
  it('KeyA returns true', () => {
    expect(isValidShortcutKey('KeyA')).toBe(true);
  });

  it('KeyZ returns true', () => {
    expect(isValidShortcutKey('KeyZ')).toBe(true);
  });

  it('Digit0 returns true', () => {
    expect(isValidShortcutKey('Digit0')).toBe(true);
  });

  it('Digit9 returns true', () => {
    expect(isValidShortcutKey('Digit9')).toBe(true);
  });

  it('F1 returns true', () => {
    expect(isValidShortcutKey('F1')).toBe(true);
  });

  it('F12 returns true', () => {
    expect(isValidShortcutKey('F12')).toBe(true);
  });

  it('F24 returns true', () => {
    expect(isValidShortcutKey('F24')).toBe(true);
  });

  it('Numpad5 returns true', () => {
    expect(isValidShortcutKey('Numpad5')).toBe(true);
  });

  it('Numpad0 returns true', () => {
    expect(isValidShortcutKey('Numpad0')).toBe(true);
  });

  it('Space returns true', () => {
    expect(isValidShortcutKey('Space')).toBe(true);
  });

  it('ArrowUp returns true', () => {
    expect(isValidShortcutKey('ArrowUp')).toBe(true);
  });

  it('Enter returns true', () => {
    expect(isValidShortcutKey('Enter')).toBe(true);
  });

  it('invalid key returns false', () => {
    expect(isValidShortcutKey('InvalidKey')).toBe(false);
  });

  it('ShiftLeft returns false', () => {
    expect(isValidShortcutKey('ShiftLeft')).toBe(false);
  });

  it('ControlLeft returns false', () => {
    expect(isValidShortcutKey('ControlLeft')).toBe(false);
  });

  it('empty string returns false', () => {
    expect(isValidShortcutKey('')).toBe(false);
  });
});

describe('formatKeyCode', () => {
  it('ctrl on macos displays as ⌘', () => {
    expect(formatKeyCode('ctrl', 'macos')).toBe('⌘');
  });

  it('ctrl on windows displays as Ctrl', () => {
    expect(formatKeyCode('ctrl', 'windows')).toBe('Ctrl');
  });

  it('ctrl on linux displays as Ctrl', () => {
    expect(formatKeyCode('ctrl', 'linux')).toBe('Ctrl');
  });

  it('shift displays as Shift on macos', () => {
    expect(formatKeyCode('shift', 'macos')).toBe('Shift');
  });

  it('shift displays as Shift on windows', () => {
    expect(formatKeyCode('shift', 'windows')).toBe('Shift');
  });

  it('alt on macos displays as ⌥', () => {
    expect(formatKeyCode('alt', 'macos')).toBe('⌥');
  });

  it('alt on windows displays as Alt', () => {
    expect(formatKeyCode('alt', 'windows')).toBe('Alt');
  });

  it('Delete on macos displays as Delete / ⌘+⌫', () => {
    expect(formatKeyCode('Delete', 'macos')).toBe('Delete / ⌘+⌫');
  });

  it('Delete on windows displays as Delete', () => {
    expect(formatKeyCode('Delete', 'windows')).toBe('Delete');
  });

  it('KeyA is converted via codeToDisplayLabel', () => {
    expect(formatKeyCode('KeyA', 'macos')).toBe('A');
    expect(formatKeyCode('KeyA', 'windows')).toBe('A');
  });

  it('Digit0 is converted via codeToDisplayLabel', () => {
    expect(formatKeyCode('Digit0', 'macos')).toBe('0');
    expect(formatKeyCode('Digit0', 'windows')).toBe('0');
  });

  it('Space is converted via codeToDisplayLabel', () => {
    expect(formatKeyCode('Space', 'macos')).toBe('Space');
    expect(formatKeyCode('Space', 'windows')).toBe('Space');
  });

  it('ArrowUp is converted via codeToDisplayLabel', () => {
    expect(formatKeyCode('ArrowUp', 'macos')).toBe('↑');
    expect(formatKeyCode('ArrowUp', 'windows')).toBe('↑');
  });

  it('unknown key returns the key itself', () => {
    expect(formatKeyCode('UnknownKey', 'macos')).toBe('UnknownKey');
    expect(formatKeyCode('UnknownKey', 'windows')).toBe('UnknownKey');
  });
});

describe('arraysEqual', () => {
  it('identical arrays return true', () => {
    expect(arraysEqual(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(true);
  });

  it('same elements different order return false', () => {
    expect(arraysEqual(['a', 'b', 'c'], ['c', 'b', 'a'])).toBe(false);
  });

  it('different arrays return false', () => {
    expect(arraysEqual(['a', 'b'], ['a', 'c'])).toBe(false);
  });

  it('different length arrays return false', () => {
    expect(arraysEqual(['a', 'b', 'c'], ['a', 'b'])).toBe(false);
    expect(arraysEqual(['a'], ['a', 'b'])).toBe(false);
  });

  it('empty arrays return true', () => {
    expect(arraysEqual([], [])).toBe(true);
  });

  it('single element arrays', () => {
    expect(arraysEqual(['KeyA'], ['KeyA'])).toBe(true);
    expect(arraysEqual(['KeyA'], ['KeyB'])).toBe(false);
  });

  it('modifier combo arrays', () => {
    expect(arraysEqual(['ctrl', 'shift', 'KeyC'], ['ctrl', 'shift', 'KeyC'])).toBe(true);
    expect(arraysEqual(['ctrl', 'shift', 'KeyC'], ['ctrl', 'alt', 'KeyC'])).toBe(false);
  });
});
