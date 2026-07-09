/**
 * Characterization tests for the extracted executors, written before
 * `useAllGameHotkeys` is refactored to call `dispatchGameAction` — they pin
 * down the exact behavior of the inline closures (`handMove`/`pileMove`/
 * `tokenOp`/the global-shortcut bodies) being extracted, over a real
 * `Y.Doc`/`Player` (never mocked), so the refactor can be verified against
 * them instead of by hand.
 *
 * `mulligan` is intentionally not covered here: `triggerConfirmation` mounts
 * a real dialog via a bare `createRoot` outside RTL's render/cleanup cycle,
 * so driving it in a logic-tier test would leak DOM across tests. It was
 * never unit-tested before this extraction either — no regression in
 * coverage, just not adding a leaky one.
 */
import { describe, it, expect, vi } from 'vitest';
import { dispatchGameAction } from './gameActions';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { useHotkeyStore } from '@/app/stores/hotkeyStore';
import { usePileViewerHotkeyStore } from '@/features/game-dock/pileViewerHotkeyStore';
import { HotkeyContext } from './hotkeys';
import { getActionLog } from '@/features/action-log/actionLog';
import { seedGame } from '@/test/seedGame';
import { YDOC_KEYWORD_TOKENS } from '@/constants';
import type { KeywordToken } from '@/features/keyword-tokens/types';
import type { Card } from '@/features/player';

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'card-1',
    cardNumber: 1,
    name: 'Lightning Bolt',
    x: 0,
    y: 0,
    rotation: 0,
    isTapped: false,
    isFlipped: false,
    counters: [],
    ...overrides,
  };
}

function makeToken(overrides: Partial<KeywordToken> = {}): KeywordToken {
  return {
    id: 'token-1',
    title: 'Flying',
    backgroundColor: '#000',
    ownerId: 'p1',
    x: 0,
    y: 0,
    zIndex: 0,
    rotation: 0,
    count: 1,
    ...overrides,
  };
}

/** Seed a real Y.Doc + Player onto gameInstanceStore, the same DI mechanism
 * every executor reads from. */
function seed(playerId = 'p1') {
  const { yDoc, player } = seedGame({ playerId });
  useGameInstance.getState().setYDoc(yDoc);
  useGameInstance.getState().setPlayer(player);
  useGameInstance.getState().setPlayerId(playerId);
  useGameInstance.getState().setScreenToFlowPosition((p) => p);
  return { yDoc, player, playerId };
}

describe('dispatchGameAction', () => {
  describe('battlefieldCard target', () => {
    it('delegates to executeBattlefieldCardAction', () => {
      const { yDoc, playerId } = seed();
      const yCards = yDoc.getMap('cards-on-board');
      yCards.set('card-1', { ...makeCard(), zIndex: 1, ownerId: playerId });

      dispatchGameAction('tap', { kind: 'battlefieldCard', id: 'card-1' });

      expect((yCards.get('card-1') as any).isTapped).toBe(true);
    });
  });

  describe('handCard target', () => {
    it('flip toggles isFlipped and hides the card preview', () => {
      const { player } = seed();
      player.placeCardInPile(makeCard({ isFlipped: false }), 'hand');

      dispatchGameAction('flip', { kind: 'handCard', id: 'card-1' });

      expect(player.getState().hand[0].isFlipped).toBe(true);
    });

    it('moveToDiscard moves the card from hand to discard', () => {
      const { player } = seed();
      player.placeCardInPile(makeCard(), 'hand');

      dispatchGameAction('moveToDiscard', { kind: 'handCard', id: 'card-1' });

      expect(player.getState().hand).toHaveLength(0);
      expect(player.getState().discardPile.some((c) => c.id === 'card-1')).toBe(true);
    });

    it('moveToExile moves the card from hand to exile', () => {
      const { player } = seed();
      player.placeCardInPile(makeCard(), 'hand');

      dispatchGameAction('moveToExile', { kind: 'handCard', id: 'card-1' });

      expect(player.getState().exilePile.some((c) => c.id === 'card-1')).toBe(true);
    });

    it('moveToDeckTop puts the card on top of the deck', () => {
      const { player } = seed();
      player.placeCardInPile(makeCard(), 'hand');

      dispatchGameAction('moveToDeckTop', { kind: 'handCard', id: 'card-1' });

      expect(player.getDeck().peekTop()!.id).toBe('card-1');
    });

    it('moveToDeckBottom puts the card on the bottom of the deck', () => {
      const { player } = seed();
      player.placeCardInPile(makeCard({ id: 'existing' }), 'deck');
      player.placeCardInPile(makeCard(), 'hand');

      dispatchGameAction('moveToDeckBottom', { kind: 'handCard', id: 'card-1' });

      expect(player.getDeck().peekBottom()!.id).toBe('card-1');
    });

    it('a card id that is not actually in hand is a no-op', () => {
      const { player } = seed();

      expect(() => dispatchGameAction('moveToDiscard', { kind: 'handCard', id: 'missing' })).not.toThrow();
      expect(player.getState().discardPile).toHaveLength(0);
    });
  });

  describe('pile target', () => {
    it('moveToHand moves the top card of the deck to hand', () => {
      const { player } = seed();
      player.placeCardInPile(makeCard({ id: 'bottom' }), 'deck');
      player.placeCardInPile(makeCard({ id: 'top' }), 'deck');

      dispatchGameAction('moveToHand', { kind: 'pile', pileType: 'deck' });

      expect(player.getState().hand.some((c) => c.id === 'top')).toBe(true);
      expect(player.getDeck().peekTop()!.id).toBe('bottom');
    });

    it('moving into the same pile is a no-op', () => {
      const { player } = seed();
      player.placeCardInPile(makeCard(), 'deck');

      dispatchGameAction('moveToDeckTop', { kind: 'pile', pileType: 'deck' });

      expect(player.getDeck().getCards()).toHaveLength(1);
    });

    it('an empty pile is a no-op', () => {
      const { player } = seed();

      expect(() => dispatchGameAction('moveToHand', { kind: 'pile', pileType: 'discard' })).not.toThrow();
      expect(player.getState().hand).toHaveLength(0);
    });

    it('draw (a global action surfaced on the deck pile menu) routes to the board executor', () => {
      const { player } = seed();
      player.placeCardInPile(makeCard(), 'deck');

      dispatchGameAction('draw', { kind: 'pile', pileType: 'deck' });

      expect(player.getState().hand.some((c) => c.id === 'card-1')).toBe(true);
    });
  });

  describe('token target', () => {
    it('tokenIncrement increases the count and logs it', () => {
      const { yDoc, playerId } = seed();
      const yTokens = yDoc.getMap<KeywordToken>(YDOC_KEYWORD_TOKENS);
      yTokens.set('token-1', makeToken({ ownerId: playerId, count: 1 }));

      dispatchGameAction('tokenIncrement', { kind: 'token', id: 'token-1' });

      expect(yTokens.get('token-1')!.count).toBe(2);
      const log = getActionLog(yDoc).toArray();
      expect(log.some((e) => e.type === 'token_count')).toBe(true);
    });

    it('tokenDecrement decreases the count', () => {
      const { yDoc, playerId } = seed();
      const yTokens = yDoc.getMap<KeywordToken>(YDOC_KEYWORD_TOKENS);
      yTokens.set('token-1', makeToken({ ownerId: playerId, count: 2 }));

      dispatchGameAction('tokenDecrement', { kind: 'token', id: 'token-1' });

      expect(yTokens.get('token-1')!.count).toBe(1);
    });

    it('tokenDecrement below 1 deletes the token instead of going to 0', () => {
      const { yDoc, playerId } = seed();
      const yTokens = yDoc.getMap<KeywordToken>(YDOC_KEYWORD_TOKENS);
      yTokens.set('token-1', makeToken({ ownerId: playerId, count: 1 }));

      dispatchGameAction('tokenDecrement', { kind: 'token', id: 'token-1' });

      expect(yTokens.get('token-1')).toBeUndefined();
      const log = getActionLog(yDoc).toArray();
      expect(log.some((e) => e.type === 'delete')).toBe(true);
    });

    it('tokenDelete removes the token and logs it', () => {
      const { yDoc, playerId } = seed();
      const yTokens = yDoc.getMap<KeywordToken>(YDOC_KEYWORD_TOKENS);
      yTokens.set('token-1', makeToken({ ownerId: playerId }));

      dispatchGameAction('tokenDelete', { kind: 'token', id: 'token-1' });

      expect(yTokens.get('token-1')).toBeUndefined();
    });

    it('a non-owner cannot modify the token', () => {
      const { yDoc } = seed('p1');
      const yTokens = yDoc.getMap<KeywordToken>(YDOC_KEYWORD_TOKENS);
      yTokens.set('token-1', makeToken({ ownerId: 'p2', count: 1 }));

      dispatchGameAction('tokenIncrement', { kind: 'token', id: 'token-1' });

      expect(yTokens.get('token-1')!.count).toBe(1);
    });
  });

  describe('health target', () => {
    it('gainHealth adds 1 life', () => {
      const { player } = seed();
      const before = player.getState().health;

      dispatchGameAction('gainHealth', { kind: 'health' });

      expect(player.getState().health).toBe(before + 1);
    });

    it('loseHealth subtracts 1 life', () => {
      const { player } = seed();
      const before = player.getState().health;

      dispatchGameAction('loseHealth', { kind: 'health' });

      expect(player.getState().health).toBe(before - 1);
    });
  });

  describe('board target', () => {
    it('draw draws a card from the deck', () => {
      const { player } = seed();
      player.placeCardInPile(makeCard(), 'deck');

      dispatchGameAction('draw', { kind: 'board', x: 0, y: 0 });

      expect(player.getState().hand.some((c) => c.id === 'card-1')).toBe(true);
    });

    it('shuffle shuffles the deck without changing its size', () => {
      const { player } = seed();
      for (let i = 0; i < 5; i++) player.placeCardInPile(makeCard({ id: `c${i}` }), 'deck');
      const before = player.getDeck().getCards().length;

      dispatchGameAction('shuffle', { kind: 'board', x: 0, y: 0 });

      expect(player.getDeck().getCards()).toHaveLength(before);
    });

    it('addCard opens the add-card modal', () => {
      seed();
      expect(useHotkeyStore.getState().addCardModalOpen).toBe(false);

      dispatchGameAction('addCard', { kind: 'board', x: 0, y: 0 });

      expect(useHotkeyStore.getState().addCardModalOpen).toBe(true);
    });

    it('gainHealth/loseHealth delegate through the same health executor', () => {
      const { player } = seed();
      const before = player.getState().health;

      dispatchGameAction('gainHealth', { kind: 'board', x: 0, y: 0 });

      expect(player.getState().health).toBe(before + 1);
    });

    it('untapAll untaps every card the local player owns', () => {
      const { yDoc, playerId } = seed();
      const yCards = yDoc.getMap('cards-on-board');
      yCards.set('card-1', { ...makeCard(), zIndex: 1, ownerId: playerId, isTapped: true });

      dispatchGameAction('untapAll', { kind: 'board', x: 0, y: 0 });

      expect((yCards.get('card-1') as any).isTapped).toBe(false);
    });

    it('addCounter spawns a +1/+1 token at the given screen position', () => {
      const { yDoc } = seed();
      const yTokens = yDoc.getMap<KeywordToken>(YDOC_KEYWORD_TOKENS);

      dispatchGameAction('addCounter', { kind: 'board', x: 50, y: 50 });

      const tokens = Array.from(yTokens.values());
      expect(tokens).toHaveLength(1);
      expect(tokens[0].title).toBe('+1/+1');
    });

    it('removeCounter spawns a -1/-1 token at the given screen position', () => {
      const { yDoc } = seed();
      const yTokens = yDoc.getMap<KeywordToken>(YDOC_KEYWORD_TOKENS);

      dispatchGameAction('removeCounter', { kind: 'board', x: 50, y: 50 });

      const tokens = Array.from(yTokens.values());
      expect(tokens).toHaveLength(1);
      expect(tokens[0].title).toBe('-1/-1');
    });
  });

  describe('pileViewerCard target', () => {
    it('routes to the registered pile-viewer action handler', () => {
      seed();
      const handler = vi.fn();
      usePileViewerHotkeyStore.getState().setActionHandler(handler);

      dispatchGameAction('moveToHand', { kind: 'pileViewerCard', id: 'card-1', context: HotkeyContext.DeckCard });

      expect(handler).toHaveBeenCalledWith('moveToHand', 'card-1');
    });

    it('is a no-op when no pile viewer is open', () => {
      seed();

      expect(() =>
        dispatchGameAction('moveToHand', { kind: 'pileViewerCard', id: 'card-1', context: HotkeyContext.DeckCard }),
      ).not.toThrow();
    });
  });
});
