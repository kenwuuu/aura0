/**
 * The command-palette action registry — the palette's runnable "Actions".
 *
 * A third surface over the same game-action catalog the keyboard and context
 * menus read (see `src/features/hotkeys/CLAUDE.md`): the "Game" commands
 * dispatch through `dispatchGameAction` exactly as the hotkeys do, so they can
 * never drift. "Navigation" commands call the shared, extracted helpers
 * (`copyRoomLink`, `requestNewGame`) and the `overlayStore`, so those can't
 * drift from the toolbar buttons either.
 *
 * The runnable "Game" rows are DERIVED from the catalog, not listed here: the
 * palette and the game-actions toolbar share the problem of having no hover, and
 * #198 already solved it by making each entry declare the target its click
 * dispatches against. See `catalogGameActions`.
 *
 * Anything that needs a hovered card/pile (Tap, Flip, the move family) has no
 * meaning without a target and stays on the card. Those still appear in the
 * palette's read-only shortcut reference, which excludes whatever is runnable
 * here (see `RUNNABLE_ACTION_IDS`).
 */
import { HOTKEYS, getToolbarActions, type ToolbarHotkey } from '@/features/hotkeys/hotkeys';
import { dispatchGameAction } from '@/features/hotkeys/gameActions';
import { dispatchPlacedAction } from '@/features/hotkeys/toolbarPlacement';
import { useOverlayStore } from '@/app/stores/overlayStore';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { useSettingsModalStore } from '@/app/stores/settingsModalStore';
import { useTourStore } from '@/features/onboarding';
import { copyRoomLink } from '@/features/room/copyRoomLink';
import { requestNewGame } from '@/features/room/startNewGame';
import { getDepartedPlayers, requestRemovePlayer } from '@/features/player/removePlayer';

// Duplicated (two-line) from Toolbar so the palette has no reason to import from
// it; if these ever grow, hoist them to a shared constants module.
const DISCORD_URL = 'https://discord.gg/PgH2gVZYKq';
const KOFI_URL = 'https://ko-fi.com/Z8Z11OOHFX';

export interface AppCommand {
  id: string;
  label: string;
  /** Extra fuzzy-search terms beyond the label. */
  keywords?: string[];
  section: 'Game' | 'Players' | 'Navigation';
  /** Display badge for the bound key, if any (e.g. "C"). */
  shortcut?: string;
  run: () => void;
}

/** Global game actions run without a hover target: a screen-centre point is
 *  handed to the board executor (draw/shuffle/etc. ignore it). */
function boardTarget() {
  return {
    kind: 'board' as const,
    x: typeof window !== 'undefined' ? window.innerWidth / 2 : 0,
    y: typeof window !== 'undefined' ? window.innerHeight / 2 : 0,
  };
}

/**
 * Catalog entries the palette can't run, and why.
 *
 * `createToken` performs no dispatch at all: the toolbar renders it as a
 * sub-popover hosting the drag-to-board keyword grid, and there is nothing to
 * drag from a palette row. A row that opened a grid you then had to drag out of
 * would be worse than no row. (Its grid stays reachable from the toolbar's
 * Create ▾ and the empty-board menu, and "Counters and keyword markers" in
 * the guide explains it.)
 */
const NOT_RUNNABLE_FROM_PALETTE: ReadonlySet<string> = new Set(['createToken']);

/**
 * Runnable game rows, derived from the catalog rather than listed here.
 *
 * The palette and the game-actions toolbar have the same shape of problem —
 * neither has a hover, so neither can read a target off the cursor — and #198
 * already solved it by making each entry declare the target its click dispatches
 * against (`ToolbarPlacement`). So the palette reads the same declarations
 * through `getToolbarActions` and dispatches through the same
 * `dispatchPlacedAction`. It is a *view* of the catalog, not a fourth copy.
 *
 * This is what makes **Scry, Surveil, Mill, Draw X, Pass, Reveal Hand, Random
 * Discard, Reset Deck, Exile Top and View Deck** runnable from ⌘K. All of
 * them carry `key: ''`, so they appear in no shortcut list anywhere — until now
 * the palette could not offer them and the guide was the only place in the
 * product they existed.
 *
 * `disabled` rows are dropped rather than shown greyed out: a palette is a list
 * of things you can do, and cmdk has no affordance that reads as "listed but
 * inert" (that was the old reference rows' whole problem).
 */
function catalogGameActions(): ToolbarHotkey[] {
  return (['button', 'actions', 'create'] as const)
    .flatMap((surface) => getToolbarActions(surface))
    .filter((h) => !h.disabled && !NOT_RUNNABLE_FROM_PALETTE.has(h.action));
}

/**
 * Palette wording for rows whose toolbar label is too terse to search for.
 *
 * The toolbar can be terse because its rows sit under "Actions ▾" with the
 * board in view; a palette row is read cold, next to "Import a deck". Only rows
 * that genuinely read wrong alone are overridden — anything absent uses the
 * catalog's own label, so this shrinks as labels improve rather than growing
 * into a second registry.
 */
const PALETTE_LABELS: Record<string, string> = {
  draw: 'Draw a card',
  mulligan: 'Mulligan (draw a new hand)',
  pass: 'Pass the turn',
  shuffle: 'Shuffle deck',
};

/** Extra search terms per action, for words a player would type that the label
 *  doesn't contain. */
const PALETTE_KEYWORDS: Record<string, string[]> = {
  draw: ['draw'],
  drawX: ['draw multiple', 'draw cards'],
  scry: ['scry', 'top of library', 'look at top'],
  surveil: ['surveil', 'bin', 'graveyard'],
  mill: ['mill', 'discard from deck'],
  mulligan: ['redraw', 'new hand'],
  untapAll: ['untap'],
  pass: ['end turn', 'next player', 'priority'],
  revealHand: ['show hand', 'hidden', 'privacy'],
  randomDiscard: ['discard at random'],
  resetDeck: ['restart', 'game two', 'start over'],
  moveToExile: ['exile top'],
  viewPile: ['view deck', 'search library', 'look through'],
  createTokenCard: ['token', 'create token', 'treasure'],
  addCard: ['add card', 'search', 'outside the game'],
  gainHealth: ['life', 'health'],
  loseHealth: ['life', 'health', 'damage'],
};

/**
 * Runnable rows with no toolbar placement.
 *
 * These act on the player rather than the board or the deck, so the
 * board/deck split in `ToolbarPlacement` has nothing to say about them —
 * `executeHealthAction` and the add-card modal ignore the target entirely. They
 * would simply vanish if the palette derived its list from placements alone.
 */
const PALETTE_ONLY_ACTIONS: Array<{ action: string; label: string }> = [
  { action: 'addCard', label: 'Add any card' },
  { action: 'gainHealth', label: 'Gain 1 life' },
  { action: 'loseHealth', label: 'Lose 1 life' },
];

/** Action ids that are runnable here — the shortcut reference excludes these so
 *  a command never appears twice (once runnable, once as a bare key). */
export const RUNNABLE_ACTION_IDS: ReadonlySet<string> = new Set([
  ...catalogGameActions().map((h) => h.action),
  ...PALETTE_ONLY_ACTIONS.map((c) => c.action),
]);

/** Build the runnable command list. A function (not a constant) because it
 *  reads `window` for the board target and the live `HOTKEYS` key badges. */
export function getCommands(): AppCommand[] {
  const overlay = useOverlayStore.getState();

  const game: AppCommand[] = [
    ...catalogGameActions().map((hotkey) => ({
      id: hotkey.action,
      label: PALETTE_LABELS[hotkey.action] ?? hotkey.toolbar.label ?? hotkey.shortDescription,
      keywords: PALETTE_KEYWORDS[hotkey.action],
      section: 'Game' as const,
      shortcut: hotkey.key || undefined,
      // The same call the toolbar makes, so a row cannot mean one thing there
      // and something else here.
      run: () => dispatchPlacedAction(hotkey),
    })),
    ...PALETTE_ONLY_ACTIONS.map(({ action, label }) => ({
      id: action,
      label,
      keywords: PALETTE_KEYWORDS[action],
      section: 'Game' as const,
      shortcut: HOTKEYS.find((h) => h.action === action)?.key || undefined,
      run: () => dispatchGameAction(action, boardTarget()),
    })),
  ];

  // One "Remove <name>" command per player who has left the room. Built live
  // from the doc + awareness (via the game instance), so it's empty when nobody
  // has departed and updates as players come and go. The health-widget menu is
  // the other entry point; both call the same `requestRemovePlayer`.
  const { yDoc, awareness, playerId } = useGameInstance.getState();
  const players: AppCommand[] =
    yDoc && awareness && playerId
      ? getDepartedPlayers(yDoc, awareness, playerId).map(({ playerId: pid, name }) => ({
          id: `remove-player-${pid}`,
          label: `Remove ${name}`,
          keywords: ['kick', 'remove player', 'left', 'departed', name],
          section: 'Players' as const,
          run: () => requestRemovePlayer(pid),
        }))
      : [];

  const nav: AppCommand[] = [
    {
      id: 'nav-import-deck',
      label: 'Import a deck',
      keywords: ['choose deck', 'load deck', 'library'],
      section: 'Navigation',
      run: () => overlay.open('deckSelection'),
    },
    {
      id: 'nav-help',
      label: 'Open Help',
      keywords: ['instructions', 'guide', 'faq', 'shortcuts'],
      section: 'Navigation',
      run: () => overlay.open('help'),
    },
    {
      id: 'nav-settings',
      label: 'Open Settings',
      keywords: ['preferences', 'options', 'zoom', 'profile', 'name', 'color'],
      section: 'Navigation',
      run: () => useSettingsModalStore.getState().open(),
    },
    {
      id: 'nav-replay-tour',
      label: 'Replay the tour',
      keywords: ['onboarding', 'tutorial', 'walkthrough', 'how to play'],
      section: 'Navigation',
      run: () => useTourStore.getState().requestReplay(),
    },
    {
      id: 'nav-copy-link',
      label: 'Copy game link',
      keywords: ['invite', 'share', 'room', 'url'],
      section: 'Navigation',
      run: () => void copyRoomLink(),
    },
    {
      id: 'nav-new-game',
      label: 'New game',
      keywords: ['reset', 'new room', 'restart'],
      section: 'Navigation',
      run: () => requestNewGame(),
    },
    {
      id: 'nav-discord',
      label: 'Join our Discord',
      keywords: ['help', 'community', 'support'],
      section: 'Navigation',
      run: () => window.open(DISCORD_URL, '_blank', 'noopener,noreferrer'),
    },
    {
      id: 'nav-kofi',
      label: 'Support on Ko-fi',
      keywords: ['donate', 'tip', 'support'],
      section: 'Navigation',
      run: () => window.open(KOFI_URL, '_blank', 'noopener,noreferrer'),
    },
  ];

  return [...game, ...players, ...nav];
}
