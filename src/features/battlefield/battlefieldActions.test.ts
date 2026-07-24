/**
 * Tests for battlefieldActions' battlefield card-movement actions.
 *
 * Uses a real Y.Doc + Player (seedGame) — never mocked. TokenService is the one
 * true I/O boundary here (it talks to card lookup), so it's faked.
 */
import { describe, it, expect } from 'vitest';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { moveCardFromBattlefield, playCardFromHand, playCardFromPile } from './battlefieldActions';
import { seedGame } from '@/test/seedGame';
import { makeCard } from '@/test/factories';
import { YDOC_CARDS_ON_BOARD } from '@/constants';
import type { WhiteboardCard } from './types';
import type { TokenService } from '@/infrastructure/cards';

function fakeTokenService(): TokenService {
  return {
    createTokensForCard: async () => ({ tokens: [], errors: [] }),
  } as unknown as TokenService;
}

describe('battlefieldActions.moveCardFromBattlefield', () => {
  it('removes the card from the board and places it in the local hand', () => {
    const { yDoc, player, playerId } = seedGame();
    useGameInstance.getState().setYDoc(yDoc);
    useGameInstance.getState().setPlayer(player);
    useGameInstance.getState().setPlayerId(playerId);

    const yCards = yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD);
    const card = makeCard({ id: 'card-1', name: 'Lightning Bolt' });
    yCards.set(card.id, { ...card, zIndex: 1, ownerId: playerId });

    moveCardFromBattlefield(card.id, 'hand');

    expect(yCards.has(card.id)).toBe(false);
    expect(player.getState().hand.some((c) => c.id === card.id)).toBe(true);
  });

  it('ignores a card owned by another player', () => {
    const { yDoc, player, playerId } = seedGame();
    useGameInstance.getState().setYDoc(yDoc);
    useGameInstance.getState().setPlayer(player);
    useGameInstance.getState().setPlayerId(playerId);

    const yCards = yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD);
    const card = makeCard({ id: 'card-2' });
    yCards.set(card.id, { ...card, zIndex: 1, ownerId: 'opponent' });

    moveCardFromBattlefield(card.id, 'hand');

    expect(yCards.has(card.id)).toBe(true);
    expect(player.getState().hand).toHaveLength(0);
  });
});

describe('battlefieldActions.playCardFromHand', () => {
  it('removes the card from hand and places it on the board at the converted position', async () => {
    const card = makeCard({ id: 'card-3' });
    const { yDoc, player, playerId } = seedGame({ hand: [card] });
    useGameInstance.getState().setYDoc(yDoc);
    useGameInstance.getState().setPlayer(player);
    useGameInstance.getState().setPlayerId(playerId);
    useGameInstance.getState().setTokenService(fakeTokenService());
    useGameInstance.getState().setScreenToFlowPosition(({ x, y }) => ({ x, y }));

    await playCardFromHand(card.id, 200, 300);

    expect(player.getState().hand).toHaveLength(0);
    const placed = yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD).get(card.id);
    expect(placed).toBeDefined();
    expect(placed!.ownerId).toBe(playerId);
  });

  it('never cascades a hand drop — the drop point is deliberate', async () => {
    const first = makeCard({ id: 'drop-1' });
    const second = makeCard({ id: 'drop-2' });
    const { yDoc, player, playerId } = seedGame({ hand: [first, second] });
    useGameInstance.getState().setYDoc(yDoc);
    useGameInstance.getState().setPlayer(player);
    useGameInstance.getState().setPlayerId(playerId);
    useGameInstance.getState().setTokenService(fakeTokenService());
    useGameInstance.getState().setScreenToFlowPosition(({ x, y }) => ({ x, y }));

    // Two drags to the exact same point: both cards land there, stacked. The
    // pile-play cascade must not leak into this path — stacking cards by hand
    // (an aura onto a creature, overlapping lands) is deliberate, and
    // `hand_drag_position.spec.ts` guards the same invariant end-to-end.
    await playCardFromHand(first.id, 200, 300);
    await playCardFromHand(second.id, 200, 300);

    const yCards = yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD);
    const a = yCards.get('drop-1')!;
    const b = yCards.get('drop-2')!;
    expect([b.x, b.y]).toEqual([a.x, a.y]);
  });

  it('does nothing if the card is not in hand', async () => {
    const { yDoc, player, playerId } = seedGame();
    useGameInstance.getState().setYDoc(yDoc);
    useGameInstance.getState().setPlayer(player);
    useGameInstance.getState().setPlayerId(playerId);
    useGameInstance.getState().setTokenService(fakeTokenService());
    useGameInstance.getState().setScreenToFlowPosition(({ x, y }) => ({ x, y }));

    await playCardFromHand('missing-card', 0, 0);

    expect(yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD).size).toBe(0);
  });
});

describe('battlefieldActions.playCardFromPile', () => {
  it('places a pile card on the board without requiring it to be in hand', async () => {
    const card = makeCard({ id: 'card-4', name: 'Opt' });
    const { yDoc, player, playerId } = seedGame();
    useGameInstance.getState().setYDoc(yDoc);
    useGameInstance.getState().setPlayer(player);
    useGameInstance.getState().setPlayerId(playerId);
    useGameInstance.getState().setTokenService(fakeTokenService());
    useGameInstance.getState().setScreenToFlowPosition(({ x, y }) => ({ x, y }));

    await playCardFromPile(card);

    const placed = yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD).get(card.id);
    expect(placed).toBeDefined();
    expect(placed!.ownerId).toBe(playerId);
    // The card was never in hand or any pile — playCardFromPile doesn't touch those.
    expect(player.getState().hand).toHaveLength(0);
  });

  it('cascades cards played onto an occupied spot, like a K-hotkey copy', async () => {
    const { yDoc, player, playerId } = seedGame();
    useGameInstance.getState().setYDoc(yDoc);
    useGameInstance.getState().setPlayer(player);
    useGameInstance.getState().setPlayerId(playerId);
    useGameInstance.getState().setTokenService(fakeTokenService());
    useGameInstance.getState().setScreenToFlowPosition(({ x, y }) => ({ x, y }));

    // Every play lands at the same viewport-center position, so without the
    // cascade all three would be buried under each other.
    const first = makeCard({ id: 'play-1' });
    const second = makeCard({ id: 'play-2' });
    const third = makeCard({ id: 'play-3' });
    await playCardFromPile(first);
    await playCardFromPile(second);
    await playCardFromPile(third);

    const yCards = yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD);
    const a = yCards.get('play-1')!;
    const b = yCards.get('play-2')!;
    const c = yCards.get('play-3')!;
    expect([b.x - a.x, b.y - a.y]).toEqual([20, 20]);
    expect([c.x - a.x, c.y - a.y]).toEqual([40, 40]);
  });

  it('leaves a card at the requested position when nothing is there', async () => {
    const { yDoc, player, playerId } = seedGame();
    useGameInstance.getState().setYDoc(yDoc);
    useGameInstance.getState().setPlayer(player);
    useGameInstance.getState().setPlayerId(playerId);
    useGameInstance.getState().setTokenService(fakeTokenService());
    useGameInstance.getState().setScreenToFlowPosition(({ x, y }) => ({ x, y }));

    const parked = makeCard({ id: 'parked' });
    await playCardFromPile(parked);
    const yCards = yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD);
    const { x, y } = yCards.get('parked')!;
    // Move it out of the landing spot — the next play must not be offset.
    yCards.set('parked', { ...yCards.get('parked')!, x: x + 500, y: y + 500 });

    await playCardFromPile(makeCard({ id: 'next' }));

    expect([yCards.get('next')!.x, yCards.get('next')!.y]).toEqual([x, y]);
  });

  it('falls back to a default position when no board is mounted yet', async () => {
    const card = makeCard({ id: 'card-5' });
    const { yDoc, player, playerId } = seedGame();
    useGameInstance.getState().setYDoc(yDoc);
    useGameInstance.getState().setPlayer(player);
    useGameInstance.getState().setPlayerId(playerId);
    useGameInstance.getState().setTokenService(fakeTokenService());
    // screenToFlowPosition intentionally left unset (null), as it is before
    // BattlefieldCanvas mounts.

    await playCardFromPile(card);

    expect(yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD).get(card.id)).toBeDefined();
  });
});
