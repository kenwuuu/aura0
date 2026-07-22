import { describe, it, expect, vi } from 'vitest';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { seedGame } from '@/test/seedGame';
import { makeCard } from '@/test/factories';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { RoomManager } from '@/features/room';
import { YDOC_CARDS_ON_BOARD, YDOC_KEYWORD_TOKENS } from '@/constants';
import { collectBugReportContext } from './bugReportContext';

vi.mock('posthog-js', () => ({ default: { capture: vi.fn() } }));

describe('collectBugReportContext', () => {
  it('reports the game state a bug was filed against', () => {
    const game = seedGame({ hand: [makeCard(), makeCard()], deck: [makeCard(), makeCard(), makeCard()] });
    game.player.placeCardInPile(makeCard(), 'discard');
    game.yDoc.getMap(YDOC_CARDS_ON_BOARD).set('card-1', { id: 'card-1' });
    game.yDoc.getMap(YDOC_KEYWORD_TOKENS).set('token-1', { id: 'token-1' });

    const store = useGameInstance.getState();
    store.setYDoc(game.yDoc);
    store.setPlayer(game.player);
    store.setRoomManager(new RoomManager());
    store.setAwareness(new Awareness(game.yDoc));

    const context = collectBugReportContext('pile-viewer');

    expect(context).toMatchObject({
      surface: 'pile-viewer',
      hand_count: 2,
      deck_count: 3,
      discard_count: 1,
      exile_count: 0,
      board_card_count: 1,
      board_token_count: 1,
    });
    // Awareness always has a local client entry, so the reporter counts as one.
    expect(context.peer_count).toBe(1);
    expect(context.room).toEqual(expect.any(String));
  });

  /**
   * The report filed thirty seconds into a broken boot is the most valuable one
   * there is — it must not be the one that throws.
   */
  it('returns a null snapshot instead of throwing when the game has not booted', () => {
    const context = collectBugReportContext('toolbar');

    expect(context).toEqual({
      surface: 'toolbar',
      room: null,
      peer_count: null,
      hand_count: null,
      deck_count: null,
      discard_count: null,
      exile_count: null,
      board_card_count: null,
      board_token_count: null,
    });
  });

  it('keeps the surface when a game instance throws mid-snapshot', () => {
    const game = seedGame();
    const store = useGameInstance.getState();
    store.setYDoc(game.yDoc);
    store.setPlayer(game.player);
    vi.spyOn(game.player, 'getState').mockImplementation(() => {
      throw new Error('player state unreadable');
    });

    const context = collectBugReportContext('deck-import');

    expect(context.surface).toBe('deck-import');
    expect(context.hand_count).toBeNull();
  });
});
