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
 * Only target-free actions live here — anything that needs a hovered card/pile
 * (Tap, Flip, the move family) has no meaning without a target and stays on the
 * card. Those still appear in the palette's read-only shortcut reference, which
 * excludes whatever is runnable here (see `RUNNABLE_ACTION_IDS`).
 */
import { HOTKEYS } from '@/features/hotkeys/hotkeys';
import { dispatchGameAction } from '@/features/hotkeys/gameActions';
import { useOverlayStore } from '@/app/stores/overlayStore';
import { copyRoomLink } from '@/features/room/copyRoomLink';
import { requestNewGame } from '@/features/room/startNewGame';

// Duplicated (two-line) from Toolbar so the palette has no reason to import from
// it; if these ever grow, hoist them to a shared constants module.
const DISCORD_URL = 'https://discord.gg/PgH2gVZYKq';
const KOFI_URL = 'https://ko-fi.com/Z8Z11OOHFX';

export interface AppCommand {
  id: string;
  label: string;
  /** Extra fuzzy-search terms beyond the label. */
  keywords?: string[];
  section: 'Game' | 'Navigation';
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

/** Game action ids surfaced as runnable palette commands, with palette-friendly
 *  labels. The key badge is read live from `HOTKEYS` so it can't go stale. */
const GAME_COMMANDS: Array<{ action: string; label: string; keywords?: string[] }> = [
  { action: 'draw', label: 'Draw a card', keywords: ['draw'] },
  { action: 'shuffle', label: 'Shuffle deck' },
  { action: 'mulligan', label: 'Mulligan (draw a new hand)', keywords: ['redraw', 'new hand'] },
  { action: 'untapAll', label: 'Untap all your cards', keywords: ['untap'] },
  { action: 'addCard', label: 'Add any card', keywords: ['add card', 'search', 'outside the game'] },
  { action: 'gainHealth', label: 'Gain 1 life', keywords: ['life', 'health'] },
  { action: 'loseHealth', label: 'Lose 1 life', keywords: ['life', 'health', 'damage'] },
];

/** Action ids that are runnable here — the shortcut reference excludes these so
 *  a command never appears twice (once runnable, once as a bare key). */
export const RUNNABLE_ACTION_IDS: ReadonlySet<string> = new Set(
  GAME_COMMANDS.map((c) => c.action),
);

/** Build the runnable command list. A function (not a constant) because it
 *  reads `window` for the board target and the live `HOTKEYS` key badges. */
export function getCommands(): AppCommand[] {
  const overlay = useOverlayStore.getState();

  const game: AppCommand[] = GAME_COMMANDS.map(({ action, label, keywords }) => ({
    id: action,
    label,
    keywords,
    section: 'Game',
    shortcut: HOTKEYS.find((h) => h.action === action)?.key || undefined,
    run: () => dispatchGameAction(action, boardTarget()),
  }));

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

  return [...game, ...nav];
}
