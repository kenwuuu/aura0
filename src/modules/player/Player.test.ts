import { describe, it, expect, beforeEach } from 'vitest';
import * as Y from 'yjs';
import { Player } from './Player';
import { Deck } from '../deck';
import { Card } from '../deck/types';

describe('Player.reset()', () => {
  let yDoc: Y.Doc;
  let player: Player;
  let deck: Deck;
  let playerId: string;

  beforeEach(() => {
    // Create a fresh Y.Doc for each test
    yDoc = new Y.Doc();
    playerId = 'test-player-123';

    // Create a deck with default initialization (60 cards, no commander)
    // This avoids the cards[99] commander logic in Deck constructor
    deck = new Deck({ initialCardCount: 10 });

    // Create player with initial health of 40
    player = new Player(playerId, yDoc, deck, { initialHealth: 40 });
  });

  describe('Initial state', () => {
    it('should start with correct initial state', () => {
      const state = player.getState();
      expect(state.health).toBe(40);
      expect(state.hand).toEqual([]);
      expect(state.discardPile).toEqual([]);
      expect(state.exilePile).toEqual([]);
      expect(state.deckCardCount).toBe(10);
    });
  });

  describe('Reset with cards in hand only', () => {
    it('should move hand cards back to deck and reset health', () => {
      // Draw 3 cards to hand
      player.drawCard();
      player.drawCard();
      player.drawCard();

      // Verify hand has 3 cards
      expect(player.getState().hand.length).toBe(3);
      expect(player.getState().deckCardCount).toBe(7);

      // Modify health
      player.setHealth(15);
      expect(player.getState().health).toBe(15);

      // Reset
      player.reset();

      // Verify reset state
      const state = player.getState();
      expect(state.hand).toEqual([]);
      expect(state.discardPile).toEqual([]);
      expect(state.exilePile).toEqual([]);
      expect(state.health).toBe(40); // Reset to initial
      expect(state.deckCardCount).toBe(10); // All cards back in deck
    });
  });

  describe('Reset with cards in multiple zones', () => {
    it('should move cards from hand, discard, and exile back to deck', () => {
      // Draw 5 cards
      const card1 = player.drawCard();
      const card2 = player.drawCard();
      const card3 = player.drawCard();
      const card4 = player.drawCard();
      const card5 = player.drawCard();

      // Move some to discard (and remove from hand)
      if (card1) {
        player.moveCardToDiscard(card1);
        player.playCardFromHand(card1.id);
      }
      if (card2) {
        player.moveCardToDiscard(card2);
        player.playCardFromHand(card2.id);
      }

      // Move some to exile (and remove from hand)
      if (card3) {
        player.moveCardToExile(card3);
        player.playCardFromHand(card3.id);
      }

      // Keep card4 and card5 in hand
      const stateBefore = player.getState();
      expect(stateBefore.hand.length).toBe(2); // card4, card5
      expect(stateBefore.discardPile.length).toBe(2); // card1, card2
      expect(stateBefore.exilePile.length).toBe(1); // card3
      expect(stateBefore.deckCardCount).toBe(5); // 10 - 5 drawn

      // Reset
      player.reset();

      // Verify all cards back in deck
      const stateAfter = player.getState();
      expect(stateAfter.hand).toEqual([]);
      expect(stateAfter.discardPile).toEqual([]);
      expect(stateAfter.exilePile).toEqual([]);
      expect(stateAfter.deckCardCount).toBe(10); // All 10 cards back
    });
  });

  describe('Reset with cards on battlefield', () => {
    it('should remove player\'s cards from battlefield and return to deck', () => {
      const yCards = yDoc.getMap('cards');

      // Draw 3 cards
      const card1 = player.drawCard();
      const card2 = player.drawCard();
      const card3 = player.drawCard();

      // Play 2 cards to battlefield (simulate what Whiteboard does)
      if (card1) {
        const whiteboardCard1 = {
          ...card1,
          zIndex: 1,
          ownerId: playerId,
        };
        yCards.set(card1.id, whiteboardCard1);
        player.playCardFromHand(card1.id);
      }

      if (card2) {
        const whiteboardCard2 = {
          ...card2,
          zIndex: 2,
          ownerId: playerId,
        };
        yCards.set(card2.id, whiteboardCard2);
        player.playCardFromHand(card2.id);
      }

      // Verify state before reset
      expect(yCards.size).toBe(2); // 2 cards on battlefield
      expect(player.getState().hand.length).toBe(1); // card3 still in hand
      expect(player.getState().deckCardCount).toBe(7); // 10 - 3 drawn

      // Reset
      player.reset();

      // Verify battlefield is cleared of player's cards
      expect(yCards.size).toBe(0);

      // Verify all cards back in deck
      const state = player.getState();
      expect(state.hand).toEqual([]);
      expect(state.deckCardCount).toBe(10);
    });

    it('should NOT remove opponent\'s cards from battlefield', () => {
      const yCards = yDoc.getMap('cards');
      const opponentId = 'opponent-456';

      // Draw player's card
      const playerCard = player.drawCard();

      // Add player's card to battlefield
      if (playerCard) {
        yCards.set(playerCard.id, {
          ...playerCard,
          zIndex: 1,
          ownerId: playerId,
        });
        player.playCardFromHand(playerCard.id);
      }

      // Add opponent's card to battlefield
      const opponentCard: Card = {
        id: 'opponent-card-1',
        cardNumber: 99,
        x: 100,
        y: 100,
        rotation: 0,
        isTapped: false,
        isFlipped: false,
        counters: [],
      };
      yCards.set(opponentCard.id, {
        ...opponentCard,
        zIndex: 2,
        ownerId: opponentId,
      });

      // Verify both cards on battlefield
      expect(yCards.size).toBe(2);

      // Reset player
      player.reset();

      // Verify only player's card removed, opponent's remains
      expect(yCards.size).toBe(1);
      expect(yCards.has('opponent-card-1')).toBe(true);
      expect(yCards.has(playerCard!.id)).toBe(false);
    });
  });

  describe('Reset with complex game state', () => {
    it('should handle full game scenario: battlefield, hand, piles, modified health', () => {
      const yCards = yDoc.getMap('cards');

      // Draw 8 cards
      const cards = Array.from({ length: 8 }, () => player.drawCard()).filter(Boolean) as Card[];

      // Play 3 to battlefield
      [cards[0], cards[1], cards[2]].forEach((card, index) => {
        yCards.set(card.id, {
          ...card,
          zIndex: index + 1,
          ownerId: playerId,
        });
        player.playCardFromHand(card.id);
      });

      // Move 2 to discard
      player.moveCardToDiscard(cards[3]);
      player.playCardFromHand(cards[3].id);

      player.moveCardToDiscard(cards[4]);
      player.playCardFromHand(cards[4].id);

      // Move 1 to exile
      player.moveCardToExile(cards[5]);
      player.playCardFromHand(cards[5].id);

      // Keep cards[6] and cards[7] in hand

      // Modify health
      player.setHealth(12);

      // Verify complex state
      const stateBefore = player.getState();
      expect(yCards.size).toBe(3); // 3 on battlefield
      expect(stateBefore.hand.length).toBe(2); // 2 in hand
      expect(stateBefore.discardPile.length).toBe(2); // 2 in discard
      expect(stateBefore.exilePile.length).toBe(1); // 1 in exile
      expect(stateBefore.health).toBe(12);
      expect(stateBefore.deckCardCount).toBe(2); // 10 - 8 drawn

      // Reset
      player.reset();

      // Verify complete reset
      const stateAfter = player.getState();
      expect(yCards.size).toBe(0); // Battlefield cleared
      expect(stateAfter.hand).toEqual([]);
      expect(stateAfter.discardPile).toEqual([]);
      expect(stateAfter.exilePile).toEqual([]);
      expect(stateAfter.health).toBe(40); // Back to initial
      expect(stateAfter.deckCardCount).toBe(10); // All cards back
    });
  });

  describe('Reset empty state', () => {
    it('should handle reset when no cards have been drawn', () => {
      // Don't draw any cards
      expect(player.getState().hand).toEqual([]);
      expect(player.getState().deckCardCount).toBe(10);

      // Reset should work without errors
      player.reset();

      // State should remain valid
      const state = player.getState();
      expect(state.hand).toEqual([]);
      expect(state.discardPile).toEqual([]);
      expect(state.exilePile).toEqual([]);
      expect(state.health).toBe(40);
      expect(state.deckCardCount).toBe(10);
    });
  });

  describe('Deck shuffling after reset', () => {
    it('should shuffle the deck after reset', () => {
      // Draw all cards in order
      const drawnCards: Card[] = [];
      let card = player.drawCard();
      while (card) {
        drawnCards.push(card);
        card = player.drawCard();
      }

      // All cards drawn
      expect(player.getState().deckCardCount).toBe(0);
      expect(player.getState().hand.length).toBe(10);

      // Reset (which includes shuffle)
      player.reset();

      // Deck should have all cards back
      expect(player.getState().deckCardCount).toBe(10);

      // Draw cards again - order should be different (shuffled)
      // Note: There's a tiny chance they're the same, but very unlikely with 10 cards
      const redrawnCards: Card[] = [];
      card = player.drawCard();
      while (card) {
        redrawnCards.push(card);
        card = player.drawCard();
      }

      // Check that at least one card is in a different position
      // (This tests that shuffle happened, though it's probabilistic)
      const sameOrder = drawnCards.every((c, i) => c.id === redrawnCards[i].id);
      expect(sameOrder).toBe(false); // Very unlikely to be same order after shuffle
    });
  });
});