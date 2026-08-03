import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { getCommands, RUNNABLE_ACTION_IDS } from './commands';
import { useOverlayStore } from '@/app/stores/overlayStore';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { useConfirmStore } from '@/app/stores/confirmStore';
import { YDOC_PLAYER, YSTATE_JOINED_AT, YSTATE_PLAYER_NAME } from '@/constants';

// Mock at the action boundary — the executors are covered by their own tests;
// here we only assert the palette wires the right call to each command.
//
// `toolbarPlacement` is deliberately NOT mocked: resolving a row's declared
// `toolbar.target` into the MenuTarget it dispatches against is the thing under
// test for catalog-derived rows. Stubbing it would leave "Exile Top acts on the
// deck, not the board" unproven.
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

  describe('keyless catalog actions', () => {
    // These carry `key: ''`, so `getHotkeysGroupedByZone` drops them from every
    // shortcut list in the app. Until the palette derived its rows from the
    // catalog they were unreachable from ⌘K entirely.
    it.each(['scry', 'surveil', 'mill', 'drawX', 'pass', 'revealHand', 'randomDiscard', 'resetDeck'])(
      'offers %s as a runnable command',
      (action) => {
        expect(byId(action)).toBeDefined();
        expect(byId(action).section).toBe('Game');
        expect(byId(action).shortcut).toBeUndefined();
      },
    );

    it('dispatches a board-targeted row against the board', () => {
      byId('scry').run();
      expect(dispatchGameAction).toHaveBeenCalledWith('scry', expect.objectContaining({ kind: 'board' }));
    });

    it('dispatches a deck-targeted row against the deck pile', () => {
      // "Exile Top" is plain `moveToExile` aimed at the deck — the same action
      // and executor the deck node lists as just "Exile". Getting the target
      // wrong here would exile a board card instead of the top of the library,
      // which is why the placement is declared rather than assumed.
      byId('moveToExile').run();
      expect(dispatchGameAction).toHaveBeenCalledWith('moveToExile', {
        kind: 'pile',
        pileType: 'deck',
      });
    });

    it('uses the toolbar label where the catalog has one', () => {
      expect(byId('moveToExile').label).toBe('Exile Top');
      expect(byId('viewPile').label).toBe('View Deck');
    });

    it('omits rows the palette cannot actually run', () => {
      // `createToken` dispatches nothing — it's a drag-to-board grid, and there
      // is nothing to drag out of a palette row.
      expect(getCommands().find((c) => c.id === 'createToken')).toBeUndefined();
      // `createLabel` is disabled ("Coming soon"); a palette lists what you can
      // do, so it's dropped rather than shown inert.
      expect(getCommands().find((c) => c.id === 'createLabel')).toBeUndefined();
    });

    it('still offers the rows that have no toolbar placement at all', () => {
      // Health and add-card act on the player, so `toolbar.target`'s board/deck
      // split says nothing about them — they'd vanish if the palette derived
      // its list from placements alone.
      for (const action of ['addCard', 'gainHealth', 'loseHealth']) {
        expect(byId(action)).toBeDefined();
      }
    });
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
