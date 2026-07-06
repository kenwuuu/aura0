/**
 * Tests for gameInstanceStore's battlefield card-movement actions.
 *
 * Uses a real Y.Doc + Player (seedGame) — never mocked. TokenService is the one
 * true I/O boundary here (it talks to card lookup), so it's faked.
 */
import { describe, it, expect } from 'vitest';
import { useGameInstance } from './gameInstanceStore';
import { seedGame } from '@/test/seedGame';
import { makeCard } from '@/test/factories';
import { YDOC_CARDS_ON_BOARD } from '@/constants';
import type { WhiteboardCard } from '@/features/battlefield/types';
import type { TokenService } from '@/infrastructure/cards';

function fakeTokenService(): TokenService {
  return {
    createTokensForCard: async () => ({ tokens: [], errors: [] }),
  } as unknown as TokenService;
}

describe('gameInstanceStore.moveCardFromBattlefield', () => {
  it('removes the card from the board and places it in the local hand', () => {
    const { yDoc, player, playerId } = seedGame();
    useGameInstance.getState().setYDoc(yDoc);
    useGameInstance.getState().setPlayer(player);
    useGameInstance.getState().setPlayerId(playerId);

    const yCards = yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD);
    const card = makeCard({ id: 'card-1', name: 'Lightning Bolt' });
    yCards.set(card.id, { ...card, zIndex: 1, ownerId: playerId });

    useGameInstance.getState().moveCardFromBattlefield(card.id, 'hand');

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

    useGameInstance.getState().moveCardFromBattlefield(card.id, 'hand');

    expect(yCards.has(card.id)).toBe(true);
    expect(player.getState().hand).toHaveLength(0);
  });
});

describe('gameInstanceStore.playCardFromHand', () => {
  it('removes the card from hand and places it on the board at the converted position', async () => {
    const card = makeCard({ id: 'card-3' });
    const { yDoc, player, playerId } = seedGame({ hand: [card] });
    useGameInstance.getState().setYDoc(yDoc);
    useGameInstance.getState().setPlayer(player);
    useGameInstance.getState().setPlayerId(playerId);
    useGameInstance.getState().setTokenService(fakeTokenService());
    useGameInstance.getState().setScreenToFlowPosition(({ x, y }) => ({ x, y }));

    await useGameInstance.getState().playCardFromHand(card.id, 200, 300);

    expect(player.getState().hand).toHaveLength(0);
    const placed = yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD).get(card.id);
    expect(placed).toBeDefined();
    expect(placed!.ownerId).toBe(playerId);
  });

  it('does nothing if the card is not in hand', async () => {
    const { yDoc, player, playerId } = seedGame();
    useGameInstance.getState().setYDoc(yDoc);
    useGameInstance.getState().setPlayer(player);
    useGameInstance.getState().setPlayerId(playerId);
    useGameInstance.getState().setTokenService(fakeTokenService());
    useGameInstance.getState().setScreenToFlowPosition(({ x, y }) => ({ x, y }));

    await useGameInstance.getState().playCardFromHand('missing-card', 0, 0);

    expect(yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD).size).toBe(0);
  });
});

describe('gameInstanceStore.playCardFromPile', () => {
  it('places a pile card on the board without requiring it to be in hand', async () => {
    const card = makeCard({ id: 'card-4', name: 'Opt' });
    const { yDoc, player, playerId } = seedGame();
    useGameInstance.getState().setYDoc(yDoc);
    useGameInstance.getState().setPlayer(player);
    useGameInstance.getState().setPlayerId(playerId);
    useGameInstance.getState().setTokenService(fakeTokenService());
    useGameInstance.getState().setScreenToFlowPosition(({ x, y }) => ({ x, y }));

    await useGameInstance.getState().playCardFromPile(card);

    const placed = yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD).get(card.id);
    expect(placed).toBeDefined();
    expect(placed!.ownerId).toBe(playerId);
    // The card was never in hand or any pile — playCardFromPile doesn't touch those.
    expect(player.getState().hand).toHaveLength(0);
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

    await useGameInstance.getState().playCardFromPile(card);

    expect(yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD).get(card.id)).toBeDefined();
  });
});
