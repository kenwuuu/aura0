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
import { describe, it, expect, vi, afterEach } from 'vitest';
import { dispatchGameAction } from './gameActions';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { useHotkeyStore } from '@/app/stores/hotkeyStore';
import { useConfirmStore } from '@/app/stores/confirmStore';
import { useSettingsStore } from '@/app/stores/settingsStore';
import { useCardPreviewStore } from '@/features/card-preview/cardPreviewStore';
import { usePileViewerHotkeyStore } from '@/features/game-dock/pileViewerHotkeyStore';
import { usePileViewerOpenStore } from '@/features/game-dock/pileViewerOpenStore';
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

    // The membership rule: an action fans out over the multi-selection only when
    // the acted-on card is itself part of it (Finder/Explorer convention).
    describe('multi-select fan-out', () => {
      afterEach(() => useHotkeyStore.getState().setSelectedCardIds(new Set()));

      function seedThreeCards() {
        const { yDoc, playerId } = seed();
        const yCards = yDoc.getMap('cards-on-board');
        for (const id of ['card-1', 'card-2', 'card-3']) {
          yCards.set(id, { ...makeCard({ id }), zIndex: 1, ownerId: playerId });
        }
        return { yCards };
      }
      const tapped = (yCards: any, id: string) => (yCards.get(id) as any).isTapped === true;

      it('acts on every selected card when the target is a member of the group', () => {
        const { yCards } = seedThreeCards();
        useHotkeyStore.getState().setSelectedCardIds(new Set(['card-1', 'card-2', 'card-3']));

        dispatchGameAction('tap', { kind: 'battlefieldCard', id: 'card-2' });

        expect(tapped(yCards, 'card-1')).toBe(true);
        expect(tapped(yCards, 'card-2')).toBe(true);
        expect(tapped(yCards, 'card-3')).toBe(true);
      });

      it('acts on only the target card when it is NOT part of the selection', () => {
        const { yCards } = seedThreeCards();
        useHotkeyStore.getState().setSelectedCardIds(new Set(['card-1', 'card-2']));

        dispatchGameAction('tap', { kind: 'battlefieldCard', id: 'card-3' });

        expect(tapped(yCards, 'card-3')).toBe(true);
        expect(tapped(yCards, 'card-1')).toBe(false);
        expect(tapped(yCards, 'card-2')).toBe(false);
      });

      it('acts on only the target card when there is no selection', () => {
        const { yCards } = seedThreeCards();

        dispatchGameAction('tap', { kind: 'battlefieldCard', id: 'card-1' });

        expect(tapped(yCards, 'card-1')).toBe(true);
        expect(tapped(yCards, 'card-2')).toBe(false);
      });

      it('fans a batch move out over the whole group', () => {
        const { yDoc, player, playerId } = seed();
        const yCards = yDoc.getMap('cards-on-board');
        for (const id of ['card-1', 'card-2']) {
          yCards.set(id, { ...makeCard({ id }), zIndex: 1, ownerId: playerId });
        }
        useHotkeyStore.getState().setSelectedCardIds(new Set(['card-1', 'card-2']));

        dispatchGameAction('moveToDiscard', { kind: 'battlefieldCard', id: 'card-1' });

        expect(yCards.has('card-1')).toBe(false);
        expect(yCards.has('card-2')).toBe(false);
        const discard = player.getState().discardPile.map((c) => c.id);
        expect(discard).toContain('card-1');
        expect(discard).toContain('card-2');
      });

      it('untapAll is never looped, even with a selection', () => {
        const { yDoc, playerId } = seed();
        const yCards = yDoc.getMap('cards-on-board');
        for (const id of ['card-1', 'card-2']) {
          yCards.set(id, { ...makeCard({ id }), zIndex: 1, ownerId: playerId, isTapped: true });
        }
        useHotkeyStore.getState().setSelectedCardIds(new Set(['card-1', 'card-2']));

        expect(() => dispatchGameAction('untapAll', { kind: 'battlefieldCard', id: 'card-1' })).not.toThrow();

        expect(tapped(yCards, 'card-1')).toBe(false);
        expect(tapped(yCards, 'card-2')).toBe(false);
      });
    });

    /**
     * Delete is gated behind a confirmation because it's the only battlefield
     * action that destroys a card outright (moveTo* always leaves it in a
     * pile) and there is no undo stack. These drive the real confirmStore —
     * with no ConfirmDialogManager mounted the request just sits there, so
     * `request.onConfirm()` stands in for clicking Delete.
     */
    describe('delete confirmation', () => {
      afterEach(() => {
        useSettingsStore.setState({ confirmCardDelete: true });
        useConfirmStore.setState({ request: null });
        useHotkeyStore.getState().setSelectedCardIds(new Set());
      });

      function seedOneCard(overrides: Partial<Card> = {}) {
        const { yDoc, playerId } = seed();
        const yCards = yDoc.getMap('cards-on-board');
        yCards.set('card-1', { ...makeCard(overrides), zIndex: 1, ownerId: playerId });
        return { yCards };
      }

      it('leaves the card on the board until the prompt is answered', () => {
        const { yCards } = seedOneCard();

        dispatchGameAction('delete', { kind: 'battlefieldCard', id: 'card-1' });

        expect(yCards.has('card-1')).toBe(true);
        expect(useConfirmStore.getState().request?.title).toBe('Delete card?');
      });

      it('deletes once confirmed', () => {
        const { yCards } = seedOneCard();

        dispatchGameAction('delete', { kind: 'battlefieldCard', id: 'card-1' });
        useConfirmStore.getState().request!.onConfirm();

        expect(yCards.has('card-1')).toBe(false);
      });

      it('names the card in the prompt', () => {
        seedOneCard();

        dispatchGameAction('delete', { kind: 'battlefieldCard', id: 'card-1' });

        expect(useConfirmStore.getState().request?.description).toContain('Lightning Bolt');
      });

      // The prompt must not leak the identity of a face-down card — it may be
      // an opponent's, and cardLogName is what keeps the action log honest too.
      it('keeps a face-down card anonymous in the prompt', () => {
        seedOneCard({ isFlipped: true });

        dispatchGameAction('delete', { kind: 'battlefieldCard', id: 'card-1' });

        const { description } = useConfirmStore.getState().request!;
        expect(description).not.toContain('Lightning Bolt');
        expect(description).toContain('a face-down card');
      });

      it('asks once for the whole group and deletes all of it on confirm', () => {
        const { yDoc, playerId } = seed();
        const yCards = yDoc.getMap('cards-on-board');
        for (const id of ['card-1', 'card-2', 'card-3']) {
          yCards.set(id, { ...makeCard({ id }), zIndex: 1, ownerId: playerId });
        }
        useHotkeyStore.getState().setSelectedCardIds(new Set(['card-1', 'card-2', 'card-3']));

        dispatchGameAction('delete', { kind: 'battlefieldCard', id: 'card-2' });

        expect(useConfirmStore.getState().request?.title).toBe('Delete 3 cards?');
        useConfirmStore.getState().request!.onConfirm();
        expect(yCards.size).toBe(0);
      });

      it('deletes immediately with no prompt when the preference is off', () => {
        const { yCards } = seedOneCard();
        useSettingsStore.setState({ confirmCardDelete: false });

        dispatchGameAction('delete', { kind: 'battlefieldCard', id: 'card-1' });

        expect(yCards.has('card-1')).toBe(false);
        expect(useConfirmStore.getState().request).toBeNull();
      });

      it('onSuppress turns the preference off, so the next delete is immediate', () => {
        const { yCards } = seedOneCard();

        dispatchGameAction('delete', { kind: 'battlefieldCard', id: 'card-1' });
        // What ConfirmDialogManager does when "Don't ask again" is ticked.
        const { onSuppress, onConfirm } = useConfirmStore.getState().request!;
        onSuppress!();
        onConfirm();
        expect(useSettingsStore.getState().confirmCardDelete).toBe(false);

        yCards.set('card-2', { ...makeCard({ id: 'card-2' }), zIndex: 1, ownerId: 'p1' });
        dispatchGameAction('delete', { kind: 'battlefieldCard', id: 'card-2' });

        expect(yCards.has('card-2')).toBe(false);
      });

      it('still deletes a keyword token without asking', () => {
        const { yDoc, playerId } = seed();
        const yTokens = yDoc.getMap<KeywordToken>(YDOC_KEYWORD_TOKENS);
        yTokens.set('token-1', makeToken({ ownerId: playerId }));

        dispatchGameAction('tokenDelete', { kind: 'token', id: 'token-1' });

        expect(yTokens.has('token-1')).toBe(false);
        expect(useConfirmStore.getState().request).toBeNull();
      });
    });

    describe('peek', () => {
      it('previews your own facedown card as its front face without mutating the board', () => {
        const { yDoc, playerId } = seed();
        const yCards = yDoc.getMap('cards-on-board');
        yCards.set('card-1', { ...makeCard({ isFlipped: true }), zIndex: 1, ownerId: playerId });

        dispatchGameAction('peek', { kind: 'battlefieldCard', id: 'card-1' });

        const preview = useCardPreviewStore.getState();
        expect(preview.isVisible).toBe(true);
        expect(preview.card?.id).toBe('card-1');
        // The previewed copy is unflipped so the front face renders...
        expect(preview.card?.isFlipped).toBe(false);
        // ...but the shared board card stays face-down to everyone.
        expect((yCards.get('card-1') as any).isFlipped).toBe(true);
      });

      it("does not peek an opponent's facedown card (would leak hidden info)", () => {
        const { yDoc } = seed('p1');
        const yCards = yDoc.getMap('cards-on-board');
        yCards.set('card-1', { ...makeCard({ isFlipped: true }), zIndex: 1, ownerId: 'p2' });

        dispatchGameAction('peek', { kind: 'battlefieldCard', id: 'card-1' });

        expect(useCardPreviewStore.getState().isVisible).toBe(false);
      });

      it('does not peek a face-up card (nothing hidden to reveal)', () => {
        const { yDoc, playerId } = seed();
        const yCards = yDoc.getMap('cards-on-board');
        yCards.set('card-1', { ...makeCard({ isFlipped: false }), zIndex: 1, ownerId: playerId });

        dispatchGameAction('peek', { kind: 'battlefieldCard', id: 'card-1' });

        expect(useCardPreviewStore.getState().isVisible).toBe(false);
      });

      it('does not peek a double-faced card showing its real back (a public face)', () => {
        const { yDoc, playerId } = seed();
        const yCards = yDoc.getMap('cards-on-board');
        yCards.set('card-1', {
          ...makeCard({ isFlipped: true, images: { front: { normal: 'f.png' }, back: { normal: 'b.png' } } }),
          zIndex: 1,
          ownerId: playerId,
        });

        dispatchGameAction('peek', { kind: 'battlefieldCard', id: 'card-1' });

        expect(useCardPreviewStore.getState().isVisible).toBe(false);
      });
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

    it('playToBattlefield puts the top card of the deck on the board, skipping the hand', () => {
      const { yDoc, player } = seed();
      player.placeCardInPile(makeCard({ id: 'bottom' }), 'deck');
      player.placeCardInPile(makeCard({ id: 'top' }), 'deck');

      dispatchGameAction('playToBattlefield', { kind: 'pile', pileType: 'deck' });

      expect(yDoc.getMap('cards-on-board').has('top')).toBe(true);
      expect(player.getDeck().peekTop()!.id).toBe('bottom');
      expect(player.getState().hand).toHaveLength(0);
    });

    it('playToBattlefield on an empty pile is a no-op', () => {
      const { yDoc } = seed();

      expect(() => dispatchGameAction('playToBattlefield', { kind: 'pile', pileType: 'deck' })).not.toThrow();
      expect(yDoc.getMap('cards-on-board').size).toBe(0);
    });

    it('viewPile requests the local pile viewer (the touch-tap "View" row)', () => {
      seed();
      usePileViewerOpenStore.getState().clear();

      dispatchGameAction('viewPile', { kind: 'pile', pileType: 'exile' });

      expect(usePileViewerOpenStore.getState().request).toEqual({ scope: 'local', pile: 'exile' });
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

    it('tokenDecrement to 0 keeps the token (no longer deletes it at zero)', () => {
      const { yDoc, playerId } = seed();
      const yTokens = yDoc.getMap<KeywordToken>(YDOC_KEYWORD_TOKENS);
      yTokens.set('token-1', makeToken({ ownerId: playerId, count: 1 }));

      dispatchGameAction('tokenDecrement', { kind: 'token', id: 'token-1' });

      expect(yTokens.get('token-1')!.count).toBe(0);
      const log = getActionLog(yDoc).toArray();
      expect(log.some((e) => e.type === 'token_count')).toBe(true);
      expect(log.some((e) => e.type === 'delete')).toBe(false);
    });

    it('tokenDecrement can take the count below 0 (matches the click path)', () => {
      const { yDoc, playerId } = seed();
      const yTokens = yDoc.getMap<KeywordToken>(YDOC_KEYWORD_TOKENS);
      yTokens.set('token-1', makeToken({ ownerId: playerId, count: 0 }));

      dispatchGameAction('tokenDecrement', { kind: 'token', id: 'token-1' });

      expect(yTokens.get('token-1')!.count).toBe(-1);
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

      dispatchGameAction('gainHealth', { kind: 'health', ownerId: 'p1' });

      expect(player.getState().health).toBe(before + 1);
    });

    it('loseHealth subtracts 1 life', () => {
      const { player } = seed();
      const before = player.getState().health;

      dispatchGameAction('loseHealth', { kind: 'health', ownerId: 'p1' });

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
