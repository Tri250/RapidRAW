import { describe, it, expect } from 'vitest';
import {
  KEYBIND_DEFINITIONS,
  KEYBIND_SECTIONS,
  normalizeCombo,
  codeToDisplayLabel,
  isValidShortcutKey,
  formatKeyCode,
  arraysEqual,
} from './keyboardUtils';

describe('KEYBIND_DEFINITIONS', () => {
  it('contains definitions for all 5 sections', () => {
    const sections = new Set(KEYBIND_DEFINITIONS.map((d) => d.section));
    expect([...sections].sort()).toEqual(['editing', 'library', 'panels', 'rating', 'view']);
  });

  it('has unique action ids', () => {
    const ids = KEYBIND_DEFINITIONS.map((d) => d.action);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every definition references a known section', () => {
    const known = new Set(KEYBIND_SECTIONS.map((s) => s.id));
    for (const def of KEYBIND_DEFINITIONS) {
      expect(known.has(def.section), `section of ${def.action}`).toBe(true);
    }
  });

  it('every defaultCombo is non-empty and uses only valid shortcut keys', () => {
    for (const def of KEYBIND_DEFINITIONS) {
      expect(def.defaultCombo.length, `combo of ${def.action}`).toBeGreaterThan(0);
      for (const key of def.defaultCombo) {
        // ctrl/shift/alt are modifier combo parts, not standalone physical keys
        if (key === 'ctrl' || key === 'shift' || key === 'alt') continue;
        expect(isValidShortcutKey(key), `key "${key}" of ${def.action}`).toBe(true);
      }
    }
  });
});

describe('normalizeCombo', () => {
  function makeEvent(partial: Partial<KeyboardEvent>): KeyboardEvent {
    return {
      code: '',
      key: '',
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: false,
      ...partial,
    } as KeyboardEvent;
  }

  it('normalizes plain letter keys to Key-prefixed codes', () => {
    expect(normalizeCombo(makeEvent({ code: 'KeyA', key: 'a' }))).toEqual(['KeyA']);
    expect(normalizeCombo(makeEvent({ code: 'KeyZ', key: 'z' }))).toEqual(['KeyZ']);
  });

  it('preserves modifier order ctrl, shift, alt', () => {
    expect(normalizeCombo(makeEvent({ code: 'KeyA', key: 'a', ctrlKey: true, shiftKey: true, altKey: true }))).toEqual([
      'ctrl',
      'shift',
      'alt',
      'KeyA',
    ]);
  });

  it('treats metaKey as ctrl on non-mac platforms', () => {
    expect(normalizeCombo(makeEvent({ code: 'KeyB', key: 'b', metaKey: true }))).toEqual(['ctrl', 'KeyB']);
  });

  it('maps Numpad digits to Digit codes', () => {
    expect(normalizeCombo(makeEvent({ code: 'Numpad5', key: '5' }))).toEqual(['Digit5']);
  });

  it('maps NumpadAdd to Equal and NumpadSubtract to Minus', () => {
    expect(normalizeCombo(makeEvent({ code: 'NumpadAdd', key: '+' }))).toEqual(['Equal']);
    expect(normalizeCombo(makeEvent({ code: 'NumpadSubtract', key: '-' }))).toEqual(['Minus']);
  });

  it('maps mac Backspace+cmd to Delete', () => {
    expect(normalizeCombo(makeEvent({ code: 'Backspace', key: 'Backspace', metaKey: true }), 'macos')).toEqual([
      'Delete',
    ]);
  });

  it('keeps plain Backspace as Backspace on non-mac', () => {
    expect(normalizeCombo(makeEvent({ code: 'Backspace', key: 'Backspace' }))).toEqual(['Backspace']);
  });

  it('falls back to the key value when the physical code is unidentified', () => {
    // a single letter key always normalizes to a Key-prefixed code, even if the
    // browser reports an unidentified physical code
    expect(normalizeCombo(makeEvent({ code: 'Unidentified', key: 'x' }))).toEqual(['KeyX']);
  });

  it('drops keys that are not valid shortcut keys', () => {
    expect(normalizeCombo(makeEvent({ code: 'Unidentified', key: 'Unidentified' }))).toEqual([]);
  });

  it('returns empty array when nothing is pressed', () => {
    expect(normalizeCombo(makeEvent({}))).toEqual([]);
  });
});

describe('codeToDisplayLabel', () => {
  it('renders Key codes as uppercase letters', () => {
    expect(codeToDisplayLabel('KeyF')).toBe('F');
  });

  it('renders Digit codes as digits', () => {
    expect(codeToDisplayLabel('Digit3')).toBe('3');
  });

  it('renders Numpad codes', () => {
    expect(codeToDisplayLabel('Numpad7')).toBe('Numpad 7');
  });

  it('maps symbol codes', () => {
    expect(codeToDisplayLabel('ArrowUp')).toBe('↑');
    expect(codeToDisplayLabel('BracketLeft')).toBe('[');
    expect(codeToDisplayLabel('Minus')).toBe('-');
  });

  it('returns null for unknown codes', () => {
    expect(codeToDisplayLabel('Key')).toBe(null);
    expect(codeToDisplayLabel('FakeKey')).toBe(null);
  });
});

describe('isValidShortcutKey', () => {
  it('accepts Key and Digit codes', () => {
    expect(isValidShortcutKey('KeyA')).toBe(true);
    expect(isValidShortcutKey('Digit0')).toBe(true);
  });

  it('accepts function keys', () => {
    expect(isValidShortcutKey('F1')).toBe(true);
    expect(isValidShortcutKey('F12')).toBe(true);
    expect(isValidShortcutKey('F')).toBe(false);
  });

  it('accepts Numpad digits', () => {
    expect(isValidShortcutKey('Numpad0')).toBe(true);
    expect(isValidShortcutKey('Numpad9')).toBe(true);
  });

  it('accepts symbol keys in the map', () => {
    expect(isValidShortcutKey('Space')).toBe(true);
    expect(isValidShortcutKey('Escape')).toBe(true);
  });

  it('rejects invalid keys', () => {
    expect(isValidShortcutKey('Foo')).toBe(false);
    expect(isValidShortcutKey('')).toBe(false);
  });
});

describe('formatKeyCode', () => {
  it('renders ctrl for non-mac and cmd symbol for mac', () => {
    expect(formatKeyCode('ctrl', 'linux')).toBe('Ctrl');
    expect(formatKeyCode('ctrl', 'macos')).toBe('⌘');
  });

  it('renders shift and alt', () => {
    expect(formatKeyCode('shift', 'linux')).toBe('Shift');
    expect(formatKeyCode('alt', 'linux')).toBe('Alt');
    expect(formatKeyCode('alt', 'macos')).toBe('⌥');
  });

  it('renders mac delete specially', () => {
    expect(formatKeyCode('Delete', 'macos')).toBe('Delete / ⌘+⌫');
    expect(formatKeyCode('Delete', 'linux')).toBe('Delete');
  });

  it('renders unknown keys as themselves', () => {
    expect(formatKeyCode('Space', 'linux')).toBe('Space');
    expect(formatKeyCode('NotAKey', 'linux')).toBe('NotAKey');
  });
});

describe('arraysEqual', () => {
  it('compares equal arrays', () => {
    expect(arraysEqual(['ctrl', 'KeyA'], ['ctrl', 'KeyA'])).toBe(true);
  });

  it('compares different-length arrays', () => {
    expect(arraysEqual(['ctrl', 'KeyA'], ['ctrl'])).toBe(false);
  });

  it('compares same-length different-order arrays', () => {
    expect(arraysEqual(['ctrl', 'shift'], ['shift', 'ctrl'])).toBe(false);
  });
});
