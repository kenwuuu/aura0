import { describe, it, expect, beforeEach } from 'vitest';
import * as Y from 'yjs';
import { executeBattlefieldCardAction } from './battlefieldCardActions';
import { getActionLog } from '@/features/action-log/actionLog';
import { useGameInstance } from '@/app/stores/gameInstanceStore';
import { seedGame } from '@/test/seedGame';
import { YDOC_PLAYER, YSTATE_PLAYER_NAME } from '@/constants';
import type { WhiteboardCard } from './types';
import type { KeywordToken } from '@/features/keyword-tokens/types';

function makeWhiteboardCard(overrides: Partial<WhiteboardCard> = {}): WhiteboardCard {
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
    zIndex: 1,
    ownerId: 'p1',
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
    ...overrides,
  };
}

function setPlayerName(doc: Y.Doc, playerId: string, name: string): void {
  doc.getMap(YDOC_PLAYER(playerId)).set(YSTATE_PLAYER_NAME, name);
}

describe('executeBattlefieldCardAction', () => {
  let boardDoc: Y.Doc;
  let yCards: Y.Map<WhiteboardCard>;
  let yTokens: Y.Map<KeywordToken>;

  beforeEach(() => {
    boardDoc = new Y.Doc();
    yCards = boardDoc.getMap('cards');
    yTokens = boardDoc.getMap('tokens');
  });

  describe('untapAll', () => {
    it('untaps every tapped card owned by the acting player and logs once', () => {
      yCards.set('card-1', makeWhiteboardCard({ id: 'card-1', ownerId: 'p1', isTapped: true }));
      yCards.set('card-2', makeWhiteboardCard({ id: 'card-2', ownerId: 'p1', isTapped: true }));

      executeBattlefieldCardAction('untapAll', '', yCards, yTokens, 'p1');

      expect(yCards.get('card-1')!.isTapped).toBe(false);
      expect(yCards.get('card-2')!.isTapped).toBe(false);
      const log = getActionLog(boardDoc).toArray();
      expect(log.filter((e) => e.type === 'untap_all')).toHaveLength(1);
    });

    it('does not touch cards owned by other players', () => {
      yCards.set('card-1', makeWhiteboardCard({ id: 'card-1', ownerId: 'opponent', isTapped: true }));

      executeBattlefieldCardAction('untapAll', '', yCards, yTokens, 'p1');

      expect(yCards.get('card-1')!.isTapped).toBe(true);
    });
  });

  describe('tap', () => {
    it('toggles isTapped and logs the tapped state', () => {
      yCards.set('card-1', makeWhiteboardCard({ isTapped: false }));

      executeBattlefieldCardAction('tap', 'card-1', yCards, yTokens, 'p1');

      expect(yCards.get('card-1')!.isTapped).toBe(true);
      const log = getActionLog(boardDoc).toArray();
      expect(log.some((e) => e.type === 'tap' && e.text.includes('tapped'))).toBe(true);
    });

    it('logs "untapped" when toggling an already-tapped card', () => {
      yCards.set('card-1', makeWhiteboardCard({ isTapped: true }));

      executeBattlefieldCardAction('tap', 'card-1', yCards, yTokens, 'p1');

      expect(yCards.get('card-1')!.isTapped).toBe(false);
      const log = getActionLog(boardDoc).toArray();
      expect(log.some((e) => e.type === 'tap' && e.text.includes('untapped'))).toBe(true);
    });

    it("names the owner when tapping another player's card", () => {
      setPlayerName(boardDoc, 'p2', 'Alice');
      yCards.set('card-1', makeWhiteboardCard({ ownerId: 'p2', isTapped: false }));

      executeBattlefieldCardAction('tap', 'card-1', yCards, yTokens, 'p1');

      const log = getActionLog(boardDoc).toArray();
      const entry = log.find((e) => e.type === 'tap');
      expect(entry!.text).toBe("tapped Alice's Lightning Bolt");
      expect(entry!.actorId).toBe('p1');
    });
  });

  describe('flip', () => {
    it('flipping face down does not reveal the card name', () => {
      yCards.set('card-1', makeWhiteboardCard({ isFlipped: false, name: 'Lightning Bolt' }));

      executeBattlefieldCardAction('flip', 'card-1', yCards, yTokens, 'p1');

      expect(yCards.get('card-1')!.isFlipped).toBe(true);
      const log = getActionLog(boardDoc).toArray();
      const entry = log.find((e) => e.type === 'flip');
      expect(entry!.text).not.toContain('Lightning Bolt');
      expect(entry!.text).toContain('face down');
    });

    it('flipping face up reveals the card name', () => {
      yCards.set('card-1', makeWhiteboardCard({ isFlipped: true, name: 'Lightning Bolt' }));

      executeBattlefieldCardAction('flip', 'card-1', yCards, yTokens, 'p1');

      expect(yCards.get('card-1')!.isFlipped).toBe(false);
      const log = getActionLog(boardDoc).toArray();
      const entry = log.find((e) => e.type === 'flip');
      expect(entry!.text).toContain('Lightning Bolt');
      expect(entry!.text).toContain('face up');
    });

    it("names the owner when flipping another player's card face down, without revealing its name", () => {
      setPlayerName(boardDoc, 'p2', 'Alice');
      yCards.set('card-1', makeWhiteboardCard({ ownerId: 'p2', isFlipped: false, name: 'Lightning Bolt' }));

      executeBattlefieldCardAction('flip', 'card-1', yCards, yTokens, 'p1');

      const log = getActionLog(boardDoc).toArray();
      const entry = log.find((e) => e.type === 'flip');
      expect(entry!.text).not.toContain('Lightning Bolt');
      expect(entry!.text).toBe("flipped Alice's card face down");
    });

    it("names the owner and card when flipping another player's card face up", () => {
      setPlayerName(boardDoc, 'p2', 'Alice');
      yCards.set('card-1', makeWhiteboardCard({ ownerId: 'p2', isFlipped: true, name: 'Lightning Bolt' }));

      executeBattlefieldCardAction('flip', 'card-1', yCards, yTokens, 'p1');

      const log = getActionLog(boardDoc).toArray();
      const entry = log.find((e) => e.type === 'flip');
      expect(entry!.text).toBe("flipped Alice's Lightning Bolt face up");
    });
  });

  describe('copy', () => {
    it('creates a new card offset from the original, above the highest zIndex', () => {
      yCards.set('card-1', makeWhiteboardCard({ id: 'card-1', x: 10, y: 10, zIndex: 3, ownerId: 'p1' }));
      yCards.set('card-2', makeWhiteboardCard({ id: 'card-2', x: 0, y: 0, zIndex: 5, ownerId: 'p2' }));

      executeBattlefieldCardAction('copy', 'card-1', yCards, yTokens, 'p1');

      const copies = Array.from(yCards.values()).filter((c) => c.id !== 'card-1' && c.id !== 'card-2');
      expect(copies).toHaveLength(1);
      const copy = copies[0];
      expect(copy.x).toBe(30);
      expect(copy.y).toBe(30);
      expect(copy.zIndex).toBe(6);
      expect(copy.ownerId).toBe('p1');
      const log = getActionLog(boardDoc).toArray();
      expect(log.some((e) => e.type === 'copy')).toBe(true);
    });

    it('keeps cascading when the same card is copied repeatedly', () => {
      yCards.set('card-1', makeWhiteboardCard({ id: 'card-1', x: 10, y: 10, ownerId: 'p1' }));

      executeBattlefieldCardAction('copy', 'card-1', yCards, yTokens, 'p1');
      executeBattlefieldCardAction('copy', 'card-1', yCards, yTokens, 'p1');
      executeBattlefieldCardAction('copy', 'card-1', yCards, yTokens, 'p1');

      const copies = Array.from(yCards.values())
        .filter((c) => c.id !== 'card-1')
        .sort((a, b) => a.x - b.x);
      expect(copies.map((c) => [c.x, c.y])).toEqual([
        [30, 30],
        [50, 50],
        [70, 70],
      ]);
    });

    it('continues the cascade past a card that already sits in the next slot', () => {
      yCards.set('card-1', makeWhiteboardCard({ id: 'card-1', x: 10, y: 10, ownerId: 'p1' }));
      yCards.set('blocker', makeWhiteboardCard({ id: 'blocker', x: 30, y: 30, ownerId: 'p1' }));

      executeBattlefieldCardAction('copy', 'card-1', yCards, yTokens, 'p1');

      const copy = Array.from(yCards.values()).find((c) => c.id !== 'card-1' && c.id !== 'blocker')!;
      expect([copy.x, copy.y]).toEqual([50, 50]);
    });

    it("names the owner when copying another player's card", () => {
      setPlayerName(boardDoc, 'p2', 'Alice');
      yCards.set('card-1', makeWhiteboardCard({ id: 'card-1', ownerId: 'p2', name: 'Lightning Bolt' }));

      executeBattlefieldCardAction('copy', 'card-1', yCards, yTokens, 'p1');

      const log = getActionLog(boardDoc).toArray();
      const entry = log.find((e) => e.type === 'copy');
      expect(entry!.text).toBe("copied Alice's Lightning Bolt");
    });
  });

  describe('addCounter', () => {
    it('spawns a +1/+1 token centered on the card', () => {
      yCards.set('card-1', makeWhiteboardCard({ x: 100, y: 100 }));

      executeBattlefieldCardAction('addCounter', 'card-1', yCards, yTokens, 'p1');

      const tokens = Array.from(yTokens.values());
      expect(tokens).toHaveLength(1);
      expect(tokens[0].title).toBe('+1/+1');
      expect(tokens[0].attachedTo).toBe('card-1');
    });
  });

  describe('removeCounter', () => {
    it('spawns a -1/-1 token centered on the card', () => {
      yCards.set('card-1', makeWhiteboardCard({ x: 100, y: 100 }));

      executeBattlefieldCardAction('removeCounter', 'card-1', yCards, yTokens, 'p1');

      const tokens = Array.from(yTokens.values());
      expect(tokens).toHaveLength(1);
      expect(tokens[0].title).toBe('-1/-1');
      expect(tokens[0].attachedTo).toBe('card-1');
    });
  });

  describe('delete', () => {
    it('removes the card, detaches its tokens, and logs the removal', () => {
      yCards.set('card-1', makeWhiteboardCard({ name: 'Lightning Bolt' }));
      yTokens.set('token-1', makeToken({ attachedTo: 'card-1' }));

      executeBattlefieldCardAction('delete', 'card-1', yCards, yTokens, 'p1');

      expect(yCards.get('card-1')).toBeUndefined();
      expect(yTokens.get('token-1')!.attachedTo).toBeUndefined();
      const log = getActionLog(boardDoc).toArray();
      expect(log.some((e) => e.type === 'delete' && e.text.includes('Lightning Bolt'))).toBe(true);
    });

    it("names the owner when removing another player's card", () => {
      setPlayerName(boardDoc, 'p2', 'Alice');
      yCards.set('card-1', makeWhiteboardCard({ ownerId: 'p2', name: 'Lightning Bolt' }));

      executeBattlefieldCardAction('delete', 'card-1', yCards, yTokens, 'p1');

      const log = getActionLog(boardDoc).toArray();
      const entry = log.find((e) => e.type === 'delete');
      expect(entry!.text).toBe("removed Alice's Lightning Bolt");
    });
  });

  describe('moveTo* actions', () => {
    // The moveTo* cases delegate to battlefieldActions' granular move
    // functions, which log through useGameInstance.getState().yDoc — so
    // (unlike the other describe blocks above) these need a real seeded
    // yDoc/player/playerId on the store, and yCards/yTokens on that SAME doc
    // (matching production, where cards-on-board/tokens/player-state all live
    // in one Y.Doc).
    function seedMoveTest(playerId = 'p1') {
      const { yDoc, player } = seedGame({ playerId });
      const localCards = yDoc.getMap<WhiteboardCard>('cards');
      const localTokens = yDoc.getMap<KeywordToken>('tokens');
      useGameInstance.getState().setYDoc(yDoc);
      useGameInstance.getState().setPlayer(player);
      useGameInstance.getState().setPlayerId(playerId);
      return { yDoc, player, playerId, yCards: localCards, yTokens: localTokens };
    }

    it('moveToHand removes the card from the board and places it in the player hand pile', () => {
      const { yDoc, player, playerId, yCards, yTokens } = seedMoveTest();
      yCards.set('card-1', makeWhiteboardCard({ ownerId: playerId, name: 'Lightning Bolt' }));

      executeBattlefieldCardAction('moveToHand', 'card-1', yCards, yTokens, playerId);

      expect(yCards.get('card-1')).toBeUndefined();
      expect(player.getState().hand.some((c) => c.name === 'Lightning Bolt')).toBe(true);
      const log = getActionLog(yDoc).toArray();
      expect(log.some((e) => e.type === 'move_to_pile' && e.text.includes('hand'))).toBe(true);
    });

    it('moveToDiscard places the card in the discard pile', () => {
      const { player, playerId, yCards, yTokens } = seedMoveTest();
      yCards.set('card-1', makeWhiteboardCard({ ownerId: playerId, name: 'Lightning Bolt' }));

      executeBattlefieldCardAction('moveToDiscard', 'card-1', yCards, yTokens, playerId);

      expect(player.getState().discardPile.some((c) => c.name === 'Lightning Bolt')).toBe(true);
    });

    it('moveToExile places the card in the exile pile', () => {
      const { player, playerId, yCards, yTokens } = seedMoveTest();
      yCards.set('card-1', makeWhiteboardCard({ ownerId: playerId, name: 'Lightning Bolt' }));

      executeBattlefieldCardAction('moveToExile', 'card-1', yCards, yTokens, playerId);

      expect(player.getState().exilePile.some((c) => c.name === 'Lightning Bolt')).toBe(true);
    });

    it('moveToDeckTop puts the card on top of the deck', () => {
      const { yDoc, player, playerId, yCards, yTokens } = seedMoveTest();
      yCards.set('card-1', makeWhiteboardCard({ ownerId: playerId, name: 'Lightning Bolt' }));

      executeBattlefieldCardAction('moveToDeckTop', 'card-1', yCards, yTokens, playerId);

      expect(player.getDeck().peekTop()!.name).toBe('Lightning Bolt');
      const log = getActionLog(yDoc).toArray();
      expect(log.some((e) => e.type === 'move_to_pile' && e.text.includes('top of deck'))).toBe(true);
    });

    it('moveToDeckBottom puts the card on the bottom of the deck', () => {
      const { yDoc, player, playerId, yCards, yTokens } = seedMoveTest();
      yCards.set('card-1', makeWhiteboardCard({ ownerId: playerId, name: 'Lightning Bolt' }));

      executeBattlefieldCardAction('moveToDeckBottom', 'card-1', yCards, yTokens, playerId);

      expect(player.getDeck().peekBottom()!.name).toBe('Lightning Bolt');
      const log = getActionLog(yDoc).toArray();
      expect(log.some((e) => e.type === 'move_to_pile' && e.text.includes('bottom of deck'))).toBe(true);
    });

    it('detaches tokens from the moved card', () => {
      const { playerId, yCards, yTokens } = seedMoveTest();
      yCards.set('card-1', makeWhiteboardCard({ ownerId: playerId }));
      yTokens.set('token-1', makeToken({ attachedTo: 'card-1' }));

      executeBattlefieldCardAction('moveToHand', 'card-1', yCards, yTokens, playerId);

      expect(yTokens.get('token-1')!.attachedTo).toBeUndefined();
    });
  });
});
