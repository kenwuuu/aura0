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
  /**
   * Rows every *card inside a pile viewer* offers, whatever pile it came from.
   *
   * The per-pile contexts above are shared by two surfaces: the board pile node
   * ('exile' is both the exile PileNode's menu and an exile-viewer card's menu).
   * So a row that belongs to a picked card — but must never appear on the pile
   * node, which acts blind on the top card — cannot be expressed by them. This
   * context is appended for every pile-viewer card (see
   * `getMenuActionsForTarget`) and reached by no other target kind.
   */
  PileViewerCard: 'pileviewercard',
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
 * - `Capture`    — Settings is recording a new binding. **Nothing is registered
 *   under this scope, and that is the point**: it is the "no game hotkeys" state,
 *   expressed as a scope so the never-empty rule above still holds.
 *
 *   It has to exist because the Settings modal is not one of the surfaces that
 *   sets `isModalOpen` (only the pile viewer, AddCard and the command palette
 *   are), so board hotkeys stay live while Settings is open. Without it,
 *   pressing `D` to *record* it would also draw a card.
 */
export const HotkeyScope = {
  Board: 'board',
  PileViewer: 'pile-viewer',
  Capture: 'capture',
} as const;

export type HotkeyScope = typeof HotkeyScope[keyof typeof HotkeyScope];

/** Which of the toolbar's three rows an action sits in. */
export type ToolbarSurface = 'button' | 'actions' | 'create';

/**
 * Where an action appears in the Game Actions toolbar, if at all.
 *
 * The toolbar is the catalog's third surface (the keyboard and the context
 * menus are the other two) and the only one with **no hover**: nothing is under
 * the cursor when you click "Mill". So a placement has to name the target its
 * dispatch runs against, which `context` cannot express — `context` says which
 * menus show a row, not what a targetless click acts on.
 */
export interface ToolbarPlacement {
  surface: ToolbarSurface;
  /**
   * The `MenuTarget` kind a toolbar click dispatches against.
   * - `'board'` — the target-free globals (Draw, Shuffle, Scry…).
   * - `'deck'`  — rows that act blind on the top of your library. "Exile Top"
   *   is plain `moveToExile` aimed at the deck pile: the same action, and the
   *   same executor, that the deck node lists as just "Exile".
   */
  target: 'board' | 'deck';
  /**
   * Sort key within `surface`. Sparse, so an insert doesn't renumber its
   * neighbours. This exists because catalog order is *semantic* — it drives
   * context-menu row order, grouped by zone — while the toolbar's Actions ▾ is
   * grouped for a different reader (deck manipulation, then hand, then the
   * destructive reset). One array can't sort both, so the toolbar carries its
   * own key rather than bending the catalog's.
   */
  order: number;
  /**
   * Toolbar label, when `shortDescription` doesn't survive losing its target.
   * Next to the deck node, "Exile" is unambiguous; alone in a toolbar it isn't,
   * so that row reads "Exile Top" there. Defaults to `shortDescription`.
   */
  label?: string;
}

export interface Hotkey {
  key: string; // Display name for UI (e.g., "Space", "+  or  =")
  keys: string[]; // Actual key bindings for react-hotkeys-hook (e.g., ["space"], ["+", "="])
  /**
   * Which context menus offer this row. Empty means none — a toolbar-only
   * action (Pass, Reset Deck) that no surface hovers, and so has no menu to
   * belong to. Note this is independent of `keys`; see the CLAUDE.md in this
   * directory.
   */
  context: HotkeyContext[];
  shortDescription: string;
  longDescription: string;
  action: string; // Unique action identifier (e.g., "tap", "draw", "addCounter")
  /**
   * Rendered in the danger style by every surface that draws catalog rows — the
   * context menu (`GameContextMenu`) and the toolbar's dropdowns
   * (`GameActionsToolbar`). Reserved for actions that discard state the player
   * can't get back.
   */
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
  /** Toolbar placement, if this action is offered there. See ToolbarPlacement. */
  toolbar?: ToolbarPlacement;
  /** Rendered but non-interactive — an action that isn't built yet. */
  disabled?: boolean;
  /** Shown beside a disabled row (e.g. "Coming soon"). */
  disabledReason?: string;
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
    // The toolbar aims this at the deck. It was previously a second action
    // called "Look at Top", which opened the *whole* deck viewer despite the
    // name — same store call, same result, misleading label.
    toolbar: { surface: 'actions', target: 'deck', order: 50, label: 'View Deck' },
  },
  // Global shortcuts (work anywhere)
  {
    key: 'C',
    keys: ['c'],
    context: ['global', 'deck'],
    shortDescription: 'Draw',
    longDescription: 'Draw',
    action: 'draw',
    toolbar: { surface: 'button', target: 'board', order: 20 },
  },
  {
    // Toolbar-only: there is no surface to hover for "it's your turn now", so
    // it carries no context and no key — it only ever logs.
    key: '',
    keys: [],
    context: [],
    shortDescription: 'Pass',
    longDescription: 'Pass the turn to the next player',
    action: 'pass',
    toolbar: { surface: 'button', target: 'board', order: 30 },
  },
  // Deck-library actions. Each reads or spends the top of your library, so all
  // four carry the 'deck' context and appear on the deck node's menu as well as
  // in the toolbar — they were toolbar-only until the registries were unified.
  {
    key: '',
    keys: [],
    context: ['deck'],
    shortDescription: 'Draw X',
    longDescription: 'Draw a chosen number of cards',
    action: 'drawX',
    toolbar: { surface: 'actions', target: 'board', order: 10 },
  },
  {
    key: '',
    keys: [],
    context: ['deck'],
    shortDescription: 'Scry',
    longDescription: 'Look at the top cards and reorder or bottom them',
    action: 'scry',
    toolbar: { surface: 'actions', target: 'board', order: 20 },
  },
  {
    key: '',
    keys: [],
    context: ['deck'],
    shortDescription: 'Surveil',
    longDescription: 'Look at the top cards and keep or bin them',
    action: 'surveil',
    toolbar: { surface: 'actions', target: 'board', order: 30 },
  },
  {
    key: '',
    keys: [],
    context: ['deck'],
    shortDescription: 'Mill',
    longDescription: 'Put a chosen number of cards from your deck into the discard',
    action: 'mill',
    toolbar: { surface: 'actions', target: 'board', order: 35 },
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
  {
    // Pointer-only (no key binding), pile-viewer cards only: puts the *picked*
    // card straight onto the battlefield face down (manifest, cloak, foretell,
    // "exile face down until…"), skipping the hand — the card stays hidden, so
    // routing it through the hand would show it in your own hand for no reason
    // and lose the whole point. Face-down play is only ever a deliberate pick,
    // never a blind top-of-pile action, which is why this lives in the
    // pile-viewer-card context rather than beside `playToBattlefield`.
    key: '',
    keys: [],
    context: ['pileviewercard'],
    shortDescription: 'Play to board facedown',
    longDescription: 'Play this card to the battlefield face down',
    action: 'playFacedown',
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
    toolbar: { surface: 'actions', target: 'board', order: 80 },
  },
  {
    key: 'M',
    keys: ['m'],
    context: ['deck'],
    shortDescription: 'Mulligan',
    longDescription: 'Mulligan (draw new hand)',
    action: 'mulligan',
    toolbar: { surface: 'actions', target: 'board', order: 90 },
  },
  // Hand-and-whole-game actions. Toolbar-only (empty `context`): none of them
  // acts on a hoverable surface, so no menu has a place for them.
  {
    key: '',
    keys: [],
    context: [],
    shortDescription: 'Random Discard',
    longDescription: 'Discard a random card from your hand',
    action: 'randomDiscard',
    toolbar: { surface: 'actions', target: 'board', order: 60 },
  },
  {
    key: '',
    keys: [],
    context: [],
    shortDescription: 'Reveal Hand',
    longDescription: 'Toggle whether opponents can see your hand',
    action: 'revealHand',
    toolbar: { surface: 'actions', target: 'board', order: 70 },
  },
  {
    key: '',
    keys: [],
    context: [],
    shortDescription: 'Reset Deck',
    longDescription: 'Return every zone to your deck, shuffle, and reset health',
    action: 'resetDeck',
    toolbar: { surface: 'actions', target: 'board', order: 100 },
    // Wipes the board, every pile and your health in one click. It sits at the
    // bottom of Actions ▾ directly under ordinary rows like Shuffle, so the
    // colour is the only thing distinguishing "reorder my library" from "throw
    // the game away". The confirm dialog is the backstop, not the warning.
    destructive: true,
  },
  // Create ▾. `createToken` performs no dispatch — the toolbar renders it as a
  // sub-popover hosting the drag-to-board keyword grid (see CreateTokenGridItem)
  // — but it lives here so the Create row is described in one place like
  // everything else.
  {
    key: '',
    keys: [],
    context: [],
    shortDescription: 'Counter',
    longDescription: 'Drag a keyword counter onto the board',
    action: 'createToken',
    toolbar: { surface: 'create', target: 'board', order: 10 },
  },
  {
    key: '',
    keys: [],
    context: [],
    shortDescription: 'Token Card',
    longDescription: 'Search for a token card and put it onto the battlefield',
    action: 'createTokenCard',
    toolbar: { surface: 'create', target: 'board', order: 20 },
  },
  {
    key: '',
    keys: [],
    context: [],
    shortDescription: 'Label',
    longDescription: 'Place a text label on the board',
    action: 'createLabel',
    toolbar: { surface: 'create', target: 'board', order: 30 },
    disabled: true,
    disabledReason: 'Coming soon',
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
    longDescription: 'Untap all your cards and clear summoning sickness',
    action: 'untapAll',
    toolbar: { surface: 'button', target: 'board', order: 10, label: 'Untap All' },
  },
  {
    // Zzz = summoning-sick creature that can't act yet. Tilts the card 45°;
    // mutually exclusive with tap (see the `sick`/`tap` executors).
    key: 'Z',
    keys: ['z'],
    context: ['battlefield'],
    shortDescription: 'Summoning sick',
    longDescription: 'Tilt card 45° to mark summoning sickness',
    action: 'sick',
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
    // Reveals a facedown card's hidden face in *your local preview only* —
    // nothing is written to Yjs, so opponents see nothing. `touchMenuOnly`
    // because on desktop a plain hover already auto-peeks your own hidden cards
    // (see CardNode.showPreview); the menu row exists only for touch, which has
    // no hover. No key binding (like `viewPile`). GameContextMenu only shows the
    // row on your own hidden-facedown cards; `executePeek` gates it the same way.
    key: '',
    keys: [],
    context: ['battlefield'],
    shortDescription: 'Peek',
    longDescription: 'Peek at your facedown card (only you can see it)',
    action: 'peek',
    touchMenuOnly: true,
  },
  {
    key: 'U',
    keys: ['u'],
    context: ['global', 'battlefield'],
    shortDescription: '+1 counter',
    longDescription: 'Spawn +1/+1 counter token at cursor',
    action: 'addCounter',
  },
  {
    key: 'I',
    keys: ['i'],
    context: ['global', 'battlefield'],
    shortDescription: '-1 counter',
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
    // Aimed at the deck, this *is* the old toolbar action "Exile Top" — it was a
    // separate `exileTopOfDeck` implementation of the identical move.
    toolbar: { surface: 'actions', target: 'deck', order: 40, label: 'Exile Top' },
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

/** A catalog entry that the toolbar offers, narrowed so `toolbar` is present. */
export type ToolbarHotkey = Hotkey & { toolbar: ToolbarPlacement };

/**
 * The toolbar's entries for one of its surfaces, in `toolbar.order`.
 *
 * The third reader of `HOTKEYS`, after `resolveBindings` (keyboard) and
 * `getMenuActionsForTarget` (context menus). Before these registries were
 * unified the toolbar had its own parallel list with its own `perform()`
 * bodies, and the two drifted exactly as you'd expect: the toolbar's Mulligan
 * skipped the confirmation the M key showed, and "Exile Top"/"Look at Top" were
 * second implementations of rows the deck node already had.
 */
export function getToolbarActions(surface: ToolbarSurface): ToolbarHotkey[] {
  return HOTKEYS
    .filter((h): h is ToolbarHotkey => h.toolbar?.surface === surface)
    .sort((a, b) => a.toolbar.order - b.toolbar.order);
}

/** A named group of hotkeys for the shortcut-reference UI (Help modal's
 *  Shortcuts tab and the command palette's read-only reference section). */
export interface HotkeyZone {
  zone: string;
  hotkeys: Hotkey[];
}

/**
 * Display order + which `HotkeyContext`s qualify a hotkey for each zone. Many
 * keys (D/S/T/Y/B/H, flip, the counters) belong to several contexts; the zone
 * order below is a *priority* — each key is shown once, under the first zone it
 * qualifies for. Order is chosen for discoverability, not internal structure:
 * the shared card-movement keys (D=discard, S=exile, …) land under Hand, where a
 * player reaches for them most, rather than being buried under Battlefield.
 */
const ZONE_ORDER: Array<{ zone: string; contexts: HotkeyContext[] }> = [
  { zone: 'Global', contexts: [HotkeyContext.Global] },
  { zone: 'Hand', contexts: [HotkeyContext.Hand] },
  { zone: 'Battlefield', contexts: [HotkeyContext.Battlefield] },
  {
    zone: 'Piles',
    contexts: [
      HotkeyContext.Deck,
      HotkeyContext.Exile,
      HotkeyContext.Discard,
      HotkeyContext.Sideboard,
      HotkeyContext.DeckCard,
      HotkeyContext.Scry,
      HotkeyContext.PileViewerCard,
    ],
  },
  { zone: 'Tokens', contexts: [HotkeyContext.KeywordToken, HotkeyContext.KeywordTokenStack] },
  { zone: 'Life', contexts: [HotkeyContext.Health] },
];

/**
 * Group the catalog into ordered, deduplicated zones for the shortcut
 * reference. Pointer-only rows (empty `key`, e.g. `viewPile`) are omitted since
 * there is no keystroke to show, and each action appears in exactly one zone
 * (see `ZONE_ORDER`). Reads live from `HOTKEYS`, so the reference can never
 * drift from the actual bindings.
 */
export function getHotkeysGroupedByZone(): HotkeyZone[] {
  const seen = new Set<string>();
  const groups: HotkeyZone[] = [];
  for (const { zone, contexts } of ZONE_ORDER) {
    const hotkeys = HOTKEYS.filter(
      (h) =>
        h.key !== '' &&
        !seen.has(h.action) &&
        contexts.some((c) => h.context.includes(c)),
    );
    hotkeys.forEach((h) => seen.add(h.action));
    if (hotkeys.length > 0) groups.push({ zone, hotkeys });
  }
  return groups;
}

// `getKeyBindingsForAction` used to live here, returning a catalog entry's
// `keys` straight to react-hotkeys-hook. It is gone deliberately rather than
// left unused: since bindings became customizable, the catalog is only the
// *fallback* layer under the player's preset and overrides, so a caller reading
// it directly would quietly bind the Untap keys for someone on Default or
// Moxfield — a bug that works perfectly on the author's machine.
//
// Read bindings through `useEffectiveBindings()` (or `getEffectiveBindings()`
// outside React) in `useHotkeyBindings.ts`.

/**
 * The catalog entry for an action, or `undefined` if there is no such action.
 *
 * Used by the Help guide to render a `` `key:<action>` `` span as the action's
 * live `key` (see `app/content/help/sections.ts`), so prose can name a shortcut
 * without hardcoding the letter. Note the caller must also check `key !== ''`:
 * plenty of catalog entries are menu- or toolbar-only and have no binding to
 * print.
 */
export function getHotkeyByAction(action: string): Hotkey | undefined {
  return HOTKEYS.find((h) => h.action === action);
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
  | { kind: 'health'; ownerId: string }
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
      // Shared viewer-card rows first (they're the notable ones), then the
      // pile's own move set. Whether a row can actually do anything in *this*
      // viewer still depends on the callbacks it was given — GameContextMenu
      // drops the ones the open viewer can't perform.
      return [
        ...getHotkeysForContext(HotkeyContext.PileViewerCard),
        ...getHotkeysForContext(target.context),
      ];
  }
}