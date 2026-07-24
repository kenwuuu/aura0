import { describe, it, expect } from 'vitest';
import {
  getMenuActionsForTarget,
  getHotkeysForContext,
  getHotkeysGroupedByZone,
  HOTKEYS,
  HotkeyContext,
} from './hotkeys';

/**
 * The context menu and the keyboard layer read the same `HOTKEYS` table, so a
 * hotkey whose `context` list omits a surface still *fires* there (the key
 * handler is global) while its menu row silently never renders. That drift is
 * invisible until someone right-clicks and finds the row missing — which is
 * exactly what happened to "To deck top"/"To deck bottom" in the deck viewer:
 * `T`/`Y` worked, their rows did not exist.
 *
 * These pin the move set each pile-viewer surface must offer by right-click.
 */
describe('pile-viewer context menus', () => {
  it('a deck-viewer card offers the full move set, including both deck moves', () => {
    const actions = getMenuActionsForTarget({
      kind: 'pileViewerCard',
      id: 'card-1',
      context: HotkeyContext.DeckCard,
    }).map((hotkey) => hotkey.action);

    // The two that were missing.
    expect(actions).toContain('moveToDeckTop');
    expect(actions).toContain('moveToDeckBottom');
    // The three that were already there — kept so a regression that drops the
    // whole deckcard context can't pass by removing everything.
    expect(actions).toEqual(
      expect.arrayContaining(['moveToHand', 'moveToDiscard', 'moveToExile']),
    );
  });

  it('every pile-viewer surface can send a card to the top or bottom of the deck', () => {
    // A card sitting in any pile viewer must be able to go back to the deck;
    // the scry viewer's whole purpose is ordering the top of the library.
    for (const context of [
      HotkeyContext.DeckCard,
      HotkeyContext.Discard,
      HotkeyContext.Exile,
      HotkeyContext.Scry,
    ]) {
      const actions = getHotkeysForContext(context).map((hotkey) => hotkey.action);

      expect(actions, `${context} should offer moveToDeckTop`).toContain('moveToDeckTop');
      expect(actions, `${context} should offer moveToDeckBottom`).toContain('moveToDeckBottom');
    }
  });
});

/**
 * `getHotkeysGroupedByZone` backs the shortcut reference (Help modal's
 * Shortcuts tab + the command palette). It must show every keyboard-bound
 * action exactly once and land the common keys where a player would look.
 */
describe('getHotkeysGroupedByZone', () => {
  const groups = getHotkeysGroupedByZone();
  const zoneOf = (action: string) =>
    groups.find((g) => g.hotkeys.some((h) => h.action === action))?.zone;

  it('lists every keyboard-bound action exactly once', () => {
    const flat = groups.flatMap((g) => g.hotkeys.map((h) => h.action));
    expect(new Set(flat).size, 'no action appears in two zones').toBe(flat.length);

    // Every catalog entry that has a key to press must be reachable.
    const keyboardActions = HOTKEYS.filter((h) => h.key !== '').map((h) => h.action);
    expect(new Set(flat)).toEqual(new Set(keyboardActions));
  });

  it('omits pointer-only rows that have no keystroke to show', () => {
    // `viewPile` is a menu-only row (empty `key`/`keys`) — nothing to reference.
    const flat = groups.flatMap((g) => g.hotkeys.map((h) => h.action));
    expect(flat).not.toContain('viewPile');
  });

  it('groups keys where a player reaches for them', () => {
    expect(zoneOf('draw')).toBe('Global');
    expect(zoneOf('untapAll')).toBe('Global');
    // Shared card-movement keys surface under Hand, not buried under Battlefield.
    expect(zoneOf('moveToDiscard')).toBe('Hand');
    expect(zoneOf('moveToSideboard')).toBe('Hand');
    expect(zoneOf('tap')).toBe('Battlefield');
    expect(zoneOf('shuffle')).toBe('Piles');
    expect(zoneOf('tokenIncrement')).toBe('Tokens');
    expect(zoneOf('gainHealth')).toBe('Life');
  });

  it('preserves the declared zone order and drops empty zones', () => {
    expect(groups.map((g) => g.zone)).toEqual([
      'Global',
      'Hand',
      'Battlefield',
      'Piles',
      'Tokens',
      'Life',
    ]);
  });
});
