import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { getCommands, RUNNABLE_ACTION_IDS } from './commands';
import { useOverlayStore } from '@/app/stores/overlayStore';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { useConfirmStore } from '@/app/stores/confirmStore';
import { YDOC_PLAYER, YSTATE_JOINED_AT, YSTATE_PLAYER_NAME } from '@/constants';

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

  it('has no Players section until someone has left the room', () => {
    // No game instance wired in → no departed players.
    expect(getCommands().filter((c) => c.section === 'Players')).toHaveLength(0);
  });

  it('lists a Remove command per departed player, wired to the confirm flow', () => {
    const yDoc = new Y.Doc();
    const seat = (id: string, name: string) => {
      const m = yDoc.getMap(YDOC_PLAYER(id));
      m.set(YSTATE_JOINED_AT, 1);
      m.set(YSTATE_PLAYER_NAME, name);
    };
    seat('me', 'Me');
    seat('gone', 'Ghosty');
    const aw = new Awareness(yDoc);
    aw.setLocalStateField('playerId', 'me'); // only the local player is online

    const gs = useGameInstance.getState();
    gs.setYDoc(yDoc);
    gs.setAwareness(aw);
    gs.setPlayerId('me');

    const players = getCommands().filter((c) => c.section === 'Players');
    expect(players).toHaveLength(1);
    expect(players[0].id).toBe('remove-player-gone');
    expect(players[0].label).toBe('Remove Ghosty');

    players[0].run();
    expect(useConfirmStore.getState().request?.title).toBe('Remove Ghosty?');
  });
});
