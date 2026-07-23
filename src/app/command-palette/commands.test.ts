import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCommands, RUNNABLE_ACTION_IDS } from './commands';
import { useOverlayStore } from '@/app/stores/overlayStore';

// Mock at the action boundary — these are covered by their own tests; here we
// only assert the palette wires the right call to each command.
const dispatchGameAction = vi.fn();
vi.mock('@/features/hotkeys/gameActions', () => ({
  dispatchGameAction: (...args: unknown[]) => dispatchGameAction(...args),
}));
const copyRoomLink = vi.fn();
vi.mock('@/features/room/copyRoomLink', () => ({
  copyRoomLink: () => copyRoomLink(),
}));
const requestNewGame = vi.fn();
vi.mock('@/features/room/startNewGame', () => ({
  requestNewGame: () => requestNewGame(),
}));

const byId = (id: string) => getCommands().find((c) => c.id === id)!;

describe('command registry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useOverlayStore.setState({ commandPaletteOpen: false, helpOpen: false, deckSelectionOpen: false });
  });

  it('has unique command ids', () => {
    const ids = getCommands().map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('reads game-command key badges live from the catalog', () => {
    expect(byId('draw').shortcut).toBe('C');
    expect(byId('shuffle').shortcut).toBe('V');
    expect(byId('untapAll').shortcut).toBe('X');
  });

  it('RUNNABLE_ACTION_IDS matches exactly the runnable game actions', () => {
    const gameIds = getCommands().filter((c) => c.section === 'Game').map((c) => c.id);
    expect(new Set(RUNNABLE_ACTION_IDS)).toEqual(new Set(gameIds));
  });

  it('a game command dispatches its action against a board target', () => {
    byId('draw').run();
    expect(dispatchGameAction).toHaveBeenCalledTimes(1);
    const [action, target] = dispatchGameAction.mock.calls[0];
    expect(action).toBe('draw');
    expect(target).toMatchObject({ kind: 'board' });
    expect(typeof target.x).toBe('number');
    expect(typeof target.y).toBe('number');
  });

  it('"Import a deck" opens the deck-selection overlay', () => {
    byId('nav-import-deck').run();
    expect(useOverlayStore.getState().deckSelectionOpen).toBe(true);
  });

  it('"Open Help" opens the help overlay', () => {
    byId('nav-help').run();
    expect(useOverlayStore.getState().helpOpen).toBe(true);
  });

  it('nav commands call their extracted helpers', () => {
    byId('nav-copy-link').run();
    expect(copyRoomLink).toHaveBeenCalledTimes(1);
    byId('nav-new-game').run();
    expect(requestNewGame).toHaveBeenCalledTimes(1);
  });
});
