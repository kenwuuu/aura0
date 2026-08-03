import { describe, it, expect } from 'vitest';
import {
  findConflicts,
  formatKey,
  formatKeyBinding,
  getCatalogBindings,
  normalizeKeyCode,
  resolveBindings,
  serializeKeyEvent,
} from './bindings';
import { HOTKEY_PRESETS, HotkeyPreset, PRESET_ORDER, type HotkeyPresetId } from './presets';
import { HOTKEYS } from './hotkeys';

/** A keydown as `serializeKeyEvent` consumes it. */
function keyEvent(code: string, mods: Partial<Record<'ctrl' | 'alt' | 'shift' | 'meta', boolean>> = {}) {
  return {
    code,
    ctrlKey: !!mods.ctrl,
    altKey: !!mods.alt,
    shiftKey: !!mods.shift,
    metaKey: !!mods.meta,
  };
}

describe('resolveBindings', () => {
  it('falls back to the catalog for anything a preset does not mention', () => {
    // Untap *is* the catalog, so its diff is empty and everything falls through.
    expect(resolveBindings(HotkeyPreset.Untap)).toEqual(getCatalogBindings());
  });

  it('applies a preset diff over the catalog', () => {
    const bindings = resolveBindings(HotkeyPreset.Default);
    expect(bindings.draw).toEqual(['d']);          // moved from 'c'
    expect(bindings.moveToDiscard).toEqual(['g']); // moved from 'd'
    expect(bindings.flip).toEqual(['f']);          // untouched, from the catalog
  });

  it('lets a user override beat the preset', () => {
    const bindings = resolveBindings(HotkeyPreset.Default, { draw: ['q'] });
    expect(bindings.draw).toEqual(['q']);
    // Everything else still follows the preset.
    expect(bindings.moveToDiscard).toEqual(['g']);
  });

  it('includes every catalog action, so callers can index without a fallback', () => {
    const bindings = resolveBindings(HotkeyPreset.Moxfield);
    for (const hotkey of HOTKEYS) {
      expect(bindings[hotkey.action], `${hotkey.action} missing`).toBeDefined();
    }
  });
});

/**
 * The load-bearing test for the whole preset feature.
 *
 * A preset diff is a *cycle*, not a set of independent edits: in `default`, `D`
 * is only free for Draw because Discard vacated it for `G`. Drop that one line
 * and `D` fires two actions. Nothing else in the codebase would notice.
 */
describe('preset integrity', () => {
  /** Actions that share a key on purpose — see SHARED_KEY_ACTIONS in bindings.ts. */
  const SHARED = new Set(['delete', 'tokenDelete']);

  it.each(PRESET_ORDER)('binds every key to at most one action in %s', (preset) => {
    const bindings = resolveBindings(preset);
    const owners = new Map<string, string>();

    for (const [action, keys] of Object.entries(bindings)) {
      if (SHARED.has(action)) continue;
      for (const key of keys) {
        const existing = owners.get(key);
        expect(
          existing,
          `"${key}" is bound to both ${existing} and ${action} in the ${preset} preset`,
        ).toBeUndefined();
        owners.set(key, action);
      }
    }
  });

  it.each(PRESET_ORDER)('only names real catalog actions in %s', (preset) => {
    const known = new Set(HOTKEYS.map((h) => h.action));
    for (const action of Object.keys(HOTKEY_PRESETS[preset])) {
      expect(known.has(action), `${preset} rebinds unknown action "${action}"`).toBe(true);
    }
  });

  it.each(PRESET_ORDER)('never rebinds a pointer-only action in %s', (preset) => {
    // An action with no catalog keys has no `useHotkeys` registration either, so
    // a key assigned to it would be silently dead.
    const keyless = new Set(HOTKEYS.filter((h) => h.keys.length === 0).map((h) => h.action));
    for (const action of Object.keys(HOTKEY_PRESETS[preset])) {
      expect(keyless.has(action), `${preset} binds pointer-only action "${action}"`).toBe(false);
    }
  });

  it('keeps the mnemonic promise of the Default preset', () => {
    const b = resolveBindings(HotkeyPreset.Default);
    expect(b.draw).toEqual(['d']);
    expect(b.untapAll).toEqual(['u']);
    expect(b.shuffle).toEqual(['s']);
    expect(b.moveToDiscard).toEqual(['g']);
    expect(b.moveToExile).toEqual(['e']);
    expect(b.copy).toEqual(['c']);
  });

  it('matches Moxfield where Moxfield documents a key', () => {
    // Transcribed from moxfield.com/help/help-articles/shortcuts.
    const b = resolveBindings(HotkeyPreset.Moxfield);
    expect(b.draw).toEqual(['d']);
    expect(b.shuffle).toEqual(['s']);
    expect(b.untapAll).toEqual(['u']);
    expect(b.tap).toEqual(['t']);
    expect(b.copy).toEqual(['x']);
    expect(b.moveToDiscard).toEqual(['g']);
    expect(b.moveToExile).toEqual(['e']);
    expect(b.moveToHand).toEqual(['h']);
    expect(b.moveToDeckTop).toEqual(['l']);
    expect(b.moveToDeckBottom).toEqual(['shift+l']);
  });

  it('keeps life on +/- in Moxfield rather than taking its arrow alternate', () => {
    // Moxfield lists "Up or +" for life, but ↑/↓ are our keyword-token +1/-1.
    const b = resolveBindings(HotkeyPreset.Moxfield);
    expect(b.gainHealth).not.toContain('arrowup');
    expect(b.tokenIncrement).toEqual(['arrowup']);
  });
});

describe('normalizeKeyCode', () => {
  // Mirrors react-hotkeys-hook v5's internal mapKey; if these drift, bindings
  // silently stop matching.
  it.each([
    ['KeyD', 'd'],
    ['KeyX', 'x'],
    ['Digit1', '1'],
    ['Space', 'space'],
    ['Backspace', 'backspace'],
    ['ArrowUp', 'arrowup'],
    ['Equal', 'equal'],
    ['Minus', 'minus'],
    ['BracketRight', 'bracketright'],
    ['Delete', 'delete'],
  ])('normalizes %s to %s', (code, expected) => {
    expect(normalizeKeyCode(code)).toBe(expected);
  });

  it('produces the key strings the catalog already ships', () => {
    // Proof the normalization matches what was hand-written for rhk: every
    // single-token catalog binding must be reachable from some physical code.
    expect(normalizeKeyCode('Equal')).toBe('equal');
    expect(normalizeKeyCode('Minus')).toBe('minus');
    expect(normalizeKeyCode('Space')).toBe('space');
  });
});

describe('serializeKeyEvent', () => {
  it('serializes a plain key', () => {
    expect(serializeKeyEvent(keyEvent('KeyD'))).toBe('d');
  });

  it('serializes modifiers in a stable order', () => {
    expect(serializeKeyEvent(keyEvent('KeyL', { shift: true }))).toBe('shift+l');
    expect(serializeKeyEvent(keyEvent('KeyA', { ctrl: true, shift: true, meta: true, alt: true })))
      .toBe('ctrl+alt+shift+meta+a');
  });

  it('returns null while only a modifier is held, so capture keeps waiting', () => {
    expect(serializeKeyEvent(keyEvent('ShiftLeft', { shift: true }))).toBeNull();
    expect(serializeKeyEvent(keyEvent('ControlRight', { ctrl: true }))).toBeNull();
    expect(serializeKeyEvent(keyEvent('MetaLeft', { meta: true }))).toBeNull();
  });

  it('round-trips a recorded key back through the catalog format', () => {
    // Recording shift and = must produce the same string the catalog hand-wrote
    // for "+1 life", or rebinding to + would not fire.
    expect(serializeKeyEvent(keyEvent('Equal', { shift: true }))).toBe('shift+equal');
    expect(HOTKEYS.find((h) => h.action === 'gainHealth')?.keys).toContain('shift+equal');
  });
});

describe('formatKey', () => {
  it.each([
    ['d', 'D'],
    ['space', 'Space'],
    ['backspace', 'Back'],
    ['arrowup', '↑'],
    ['arrowdown', '↓'],
    ['equal', '='],
    ['minus', '-'],
    ['bracketright', ']'],
    ['bracketleft', '['],
  ])('renders %s as %s', (binding, expected) => {
    expect(formatKey(binding)).toBe(expected);
  });

  it('renders a shifted pair as the shifted character, not the modifier', () => {
    expect(formatKey('shift+equal')).toBe('+');
    expect(formatKey('shift+minus')).toBe('_');
  });

  it('renders a shifted letter with the modifier glyph', () => {
    expect(formatKey('shift+l')).toBe('⇧L');
  });
});

describe('formatKeyBinding', () => {
  it('joins alternates the way the catalog used to hard-code them', () => {
    // The catalog's old display string for gainHealth was literally '+  or  ='.
    expect(formatKeyBinding(['shift+equal', 'equal'])).toBe('+  or  =');
    expect(formatKeyBinding(['minus', 'shift+minus'])).toBe('-  or  _');
  });

  it('renders an unbound action as empty', () => {
    expect(formatKeyBinding([])).toBe('');
    expect(formatKeyBinding(undefined)).toBe('');
  });
});

describe('findConflicts', () => {
  const bindings = resolveBindings(HotkeyPreset.Untap);

  it('reports the action already holding a key', () => {
    expect(findConflicts(bindings, 'draw', 'f')).toEqual(['flip']);
  });

  it('says nothing when the key is free', () => {
    expect(findConflicts(bindings, 'draw', 'j')).toEqual([]);
  });

  it('ignores the action being rebound', () => {
    expect(findConflicts(bindings, 'draw', 'c')).toEqual([]);
  });

  it('exempts the delete/tokenDelete pair that has always shared Backspace', () => {
    // Both are Backspace by design — disjoint hover targets, one handler.
    expect(findConflicts(bindings, 'delete', 'backspace')).toEqual([]);
    expect(findConflicts(bindings, 'tokenDelete', 'backspace')).toEqual([]);
    // And they don't pollute anyone else's conflict list either.
    expect(findConflicts(bindings, 'draw', 'backspace')).toEqual([]);
  });
});
