/**
 * Centralized hotkey configuration
 * Each hotkey has both a short description (for tooltips) and a long description (for the modal)
 */

import type { PileType } from '@/features/player';

export const HotkeyContext = {
  Global: 'global',
  Battlefield: 'battlefield',
  Hand: 'hand',
  Deck: 'deck',
  DeckCard: 'deckcard',
  Exile: 'exile',
  Scry: 'scry',
  Discard: 'discard',
  Sideboard: 'sideboard',
  Health: 'health',
  KeywordToken: 'kwToken',
  KeywordTokenStack: 'kwTokenStack',
  EnemyBattlefieldCard: 'EnemyBattlefieldCard',
} as const;

export type HotkeyContext = typeof HotkeyContext[keyof typeof HotkeyContext];

/**
 * Hotkey scopes for react-hotkeys-hook's <HotkeysProvider>.
 *
 * Exactly one scope is active at a time (never empty — an empty active-scope
 * set makes scoped bindings fall back to "always on" with a console warning):
 * - `Board`      — normal play; all battlefield / hand / pile / token hotkeys.
 * - `PileViewer` — a modal (pile viewer) is open; only its card hotkeys fire.
 */
export const HotkeyScope = {
  Board: 'board',
  PileViewer: 'pile-viewer',
} as const;

export type HotkeyScope = typeof HotkeyScope[keyof typeof HotkeyScope];

export interface Hotkey {
  key: string; // Display name for UI (e.g., "Space", "+  or  =")
  keys: string[]; // Actual key bindings for react-hotkeys-hook (e.g., ["space"], ["+", "="])
  context: HotkeyContext[];
  shortDescription: string;
  longDescription: string;
  action: string; // Unique action identifier (e.g., "tap", "draw", "addCounter")
  /** Rendered in the danger/destructive style in the context menu (GameContextMenu). */
  destructive?: boolean;
  /**
   * Show this row in the context menu only when it was opened by touch (a tap),
   * not by a mouse right-click. Used for the token +1/-1 rows: on desktop the
   * count is adjusted by hovering and clicking the token's top/bottom half (see
   * `TokenNode`), so the menu rows would be redundant — but touch has no hover
   * and swallows the click (`useContextMenuTap`), leaving the menu as the only
   * way to adjust the count there. The keyboard ↑/↓ bindings are unaffected.
   */
  touchMenuOnly?: boolean;
}

export const HOTKEYS: Hotkey[] = [
  // Pointer-only (no key binding): opens the pile's card viewer. Left-click
  // already opens it on desktop; this surfaces the same thing as a menu row so
  // the viewer stays reachable on touch, where a tap opens the menu instead of
  // opening the viewer directly. Kept at the top of the catalog so "View" is
  // the first row on every pile's context menu (above "Draw" on the deck).
  {
    key: '',
    keys: [],
    context: ['deck', 'exile', 'discard', 'sideboard'],
    shortDescription: 'View',
    longDescription: 'View pile contents',
    action: 'viewPile',
  },
  // Global shortcuts (work anywhere)
  {
    key: 'C',
    keys: ['c'],
    context: ['global', 'deck'],
    shortDescription: 'Draw',
    longDescription: 'Draw',
    action: 'draw',
  },
  {
    // Deck-only: takes the top card of the deck straight onto the battlefield,
    // skipping the hand. Not in 'global' — it's a deck-pile action, so it stays
    // off the empty-board menu, and the key only fires while the deck is hovered.
    key: 'P',
    keys: ['p'],
    context: ['deck'],
    shortDescription: 'Play to board',
    longDescription: 'Play the top card of your deck to the battlefield',
    action: 'playToBattlefield',
  },
  // Not in 'global' context: shuffle/mulligan are deck-pile actions, so they
  // stay off the empty-board menu (they remain on the deck menu). The v/m keys
  // still fire — those bindings are registered directly in useAllGameHotkeys,
  // independent of this context list.
  {
    key: 'V',
    keys: ['v'],
    context: ['deck'],
    shortDescription: 'Shuffle',
    longDescription: 'Shuffle deck',
    action: 'shuffle',
  },
  {
    key: 'M',
    keys: ['m'],
    context: ['deck'],
    shortDescription: 'Mulligan',
    longDescription: 'Mulligan (draw new hand)',
    action: 'mulligan',
  },
  {
    // Not in 'deck' context: "Add any card" pulls a card from outside the game,
    // which isn't a deck-pile action, so it stays off the deck menu. It remains
    // on the empty-board (Global) menu, and the 'a' key still works — that
    // binding is registered directly in useAllGameHotkeys, independent of this
    // context list.
    key: 'A',
    keys: ['a'],
    context: ['global'],
    shortDescription: 'Add any card',
    longDescription: 'Add a card from outside of game',
    action: 'addCard',
  },
  // Not in 'global' context: +1/-1 life belong to a player's health node, not
  // the empty-board menu, so they stay off it (they remain on the health-node
  // menu). The +/- keys still adjust life — those bindings are registered
  // directly in useAllGameHotkeys, independent of this context list.
  {
    key: '+  or  =',
    keys: ['shift+equal', 'equal'],
    context: ['health'],
    shortDescription: '+1 life',
    longDescription: 'Gain 1 life',
    action: 'gainHealth',
  },
  {
    key: '-  or  _',
    keys: ['minus', 'shift+minus'],
    context: ['health'],
    shortDescription: '-1 life',
    longDescription: 'Lose 1 life',
    action: 'loseHealth',
  },

  // Battlefield card shortcuts
  {
    key: 'Space',
    keys: ['space'],
    context: ['battlefield'],
    shortDescription: 'Tap',
    longDescription: 'Tap card',
    action: 'tap',
  },
  {
    key: 'X',
    keys: ['x'],
    context: ['global', 'battlefield'],
    shortDescription: 'Untap all',
    longDescription: 'Untap all your cards',
    action: 'untapAll',
  },
  {
    key: 'F',
    keys: ['f'],
    context: ['battlefield', 'hand'],
    shortDescription: 'Flip',
    longDescription: 'Flip card face-down/face-up',
    action: 'flip',
  },
  {
    // Menu-only (no key binding, like `viewPile`): reveals a facedown card's
    // hidden face in *your local preview only* — nothing is written to Yjs, so
    // opponents see nothing. GameContextMenu only shows this row on your own
    // facedown cards; the executor gates it the same way (see `executePeek`).
    key: '',
    keys: [],
    context: ['battlefield'],
    shortDescription: 'Peek',
    longDescription: 'Peek at your facedown card (only you can see it)',
    action: 'peek',
  },
  {
    key: 'U',
    keys: ['u'],
    context: ['global', 'battlefield'],
    shortDescription: 'Counter',
    longDescription: 'Spawn +1/+1 counter token at cursor',
    action: 'addCounter',
  },
  {
    // Not in 'global' context: the empty-board (Global) menu shows the
    // drag-to-board "Create counter" grid in this slot instead (see
    // GameContextMenu). The 'i' key still spawns a -1/-1 counter at the cursor —
    // that binding is registered directly in useAllGameHotkeys, independent of
    // this context list — and the row still appears on the battlefield-card menu.
    key: 'I',
    keys: ['i'],
    context: ['battlefield'],
    shortDescription: '-1/-1 counter',
    longDescription: 'Spawn -1/-1 counter token at cursor',
    action: 'removeCounter',
  },
  {
    key: 'K',
    keys: ['k'],
    context: ['battlefield'],
    shortDescription: 'Copy/clone',
    longDescription: 'Create copy of card',
    action: 'copy',
  },
  {
    key: 'Back', // leaving this icon here: ⌫
    keys: ['backspace'],
    context: ['battlefield'],
    shortDescription: 'Delete',
    longDescription: 'Delete a card',
    action: 'delete',
    destructive: true,
  },
  {
    key: 'H',
    keys: ['h'],
    context: ['battlefield', 'deck', 'exile', 'discard', 'deckcard', 'sideboard'],
    shortDescription: 'Hand',
    longDescription: 'Move card to hand',
    action: 'moveToHand',
  },
  {
    key: '↑',
    keys: ['arrowup'],
    context: ['kwToken'],
    shortDescription: '+1',
    longDescription: '+1',
    action: 'tokenIncrement',
    touchMenuOnly: true,
  },
  {
    key: '↓',
    keys: ['arrowdown'],
    context: ['kwToken'],
    shortDescription: '-1',
    longDescription: '-1',
    action: 'tokenDecrement',
    touchMenuOnly: true,
  },
  {
    key: 'Back',
    keys: ['backspace'],
    context: ['kwToken'],
    shortDescription: 'Delete token',
    longDescription: 'Delete a keyword token',
    action: 'tokenDelete',
    destructive: true,
  },

  // Hand and pile shortcuts
  {
    key: 'D',
    keys: ['d'],
    context: ['battlefield', 'hand', 'exile', 'deck', 'deckcard', 'scry', 'sideboard'],
    shortDescription: 'Discard',
    longDescription: 'Move card to discard',
    action: 'moveToDiscard',
  },
  {
    key: 'S',
    keys: ['s'],
    context: ['battlefield', 'hand', 'deck', 'discard', 'deckcard', 'sideboard'],
    shortDescription: 'Exile',
    longDescription: 'Move card from hand/deck to exile',
    action: 'moveToExile',
  },
  {
    key: 'T',
    keys: ['t'],
    context: ['battlefield', 'hand', 'exile', 'discard', 'deckcard', 'scry', 'sideboard'],
    shortDescription: 'To deck top',
    longDescription: 'Move card from hand/deck to top of deck',
    action: 'moveToDeckTop',
  },
  {
    key: 'Y',
    keys: ['y'],
    context: ['battlefield', 'hand', 'exile', 'discard', 'deckcard', 'scry', 'sideboard'],
    shortDescription: 'To deck bottom',
    longDescription: 'Move card from hand/deck to bottom of deck',
    action: 'moveToDeckBottom',
  },
  {
    // Sideboarding runs both ways: deck → sideboard between games, sideboard →
    // deck (or hand, for a wish or a companion) once play starts. So this is
    // offered from every zone a card can be sitting in, not just the deck.
    key: 'B',
    keys: ['b'],
    context: ['battlefield', 'hand', 'deck', 'exile', 'discard', 'deckcard'],
    shortDescription: 'Sideboard',
    longDescription: 'Move card to sideboard',
    action: 'moveToSideboard',
  },
];

/**
 * Get hotkeys relevant to a specific context
 */
export function getHotkeysForContext(context: HotkeyContext): Hotkey[] {
  return HOTKEYS.filter(hotkey => hotkey.context.includes(context));
}

/**
 * Get all hotkeys with their long descriptions (for the modal)
 */
export function getAllHotkeysWithLongDescriptions(): Array<{ key: string; action: string }> {
  return HOTKEYS.map(hotkey => ({
    key: hotkey.key,
    action: hotkey.longDescription,
  }));
}

/**
 * Get key bindings for a specific action (for react-hotkeys-hook)
 */
export function getKeyBindingsForAction(action: string): string[] {
  const hotkey = HOTKEYS.find((h) => h.action === action);
  return hotkey?.keys ?? [];
}

/**
 * A "what did the user right-click" discriminant for the game context menu.
 * Each variant maps to exactly one `HotkeyContext` (see `getMenuActionsForTarget`),
 * so the menu's rows and the keyboard hotkeys are always reading the same catalog.
 */
export type MenuTarget =
  | { kind: 'battlefieldCard'; id: string }
  | { kind: 'handCard'; id: string }
  | { kind: 'pile'; pileType: Exclude<PileType, 'scry' | 'hand'> }
  | { kind: 'token'; id: string }
  | { kind: 'health' }
  | { kind: 'board'; x: number; y: number }
  | { kind: 'pileViewerCard'; id: string; context: HotkeyContext };

/** Resolve a menu target to the rows its context menu should show. */
export function getMenuActionsForTarget(target: MenuTarget): Hotkey[] {
  switch (target.kind) {
    case 'battlefieldCard':
      return getHotkeysForContext(HotkeyContext.Battlefield);
    case 'handCard':
      return getHotkeysForContext(HotkeyContext.Hand);
    case 'pile':
      return getHotkeysForContext(target.pileType);
    case 'token':
      return getHotkeysForContext(HotkeyContext.KeywordToken);
    case 'health':
      return getHotkeysForContext(HotkeyContext.Health);
    case 'board':
      return getHotkeysForContext(HotkeyContext.Global);
    case 'pileViewerCard':
      return getHotkeysForContext(target.context);
  }
}