import { describe, it, expect } from 'vitest';
import { getMenuActionsForTarget, getHotkeysForContext, HotkeyContext } from './hotkeys';

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
