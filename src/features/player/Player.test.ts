import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as Y from 'yjs';
import { Player } from './Player';
import {Card, SavedDeck} from './types';
import {YDOC_CARDS_ON_BOARD} from "@/constants";
import { seededRandom } from '@/test/seededRandom';
import { getActionLog } from '@/features/action-log/actionLog';
import { makeCards } from '@/test/factories';
import { DEFAULT_DECK } from '@/features/deck-manager/defaultDeck';

describe('Player.reset()', () => {
  let yDoc: Y.Doc;
  let player: Player;
  let deck: Card[];
  let playerId: string;

  beforeEach(() => {
    // Create a fresh Y.Doc for each test
    yDoc = new Y.Doc();
    playerId = 'test-player-123';

    deck = makeCards(10);

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
      expect(player.getDeck().getCardCount()).toBe(10);
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
      expect(player.getDeck().getCardCount()).toBe(7);

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
      expect(player.getDeck().getCardCount()).toBe(10); // All cards back in deck
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
        player.placeCardInPile(card1, 'discard');
        player.removeCardFromHand(card1.id);
      }
      if (card2) {
        player.placeCardInPile(card2, 'discard');
        player.removeCardFromHand(card2.id);
      }

      // Move some to exile (and remove from hand)
      if (card3) {
        player.placeCardInPile(card3, 'exile');
        player.removeCardFromHand(card3.id);
      }

      // Keep card4 and card5 in hand
      const stateBefore = player.getState();
      expect(player.getHand().getCardCount()).toBe(2); // card4, card5
      expect(player.getDiscardPile().getCardCount()).toBe(2); // card1, card2
      expect(player.getExilePile().getCardCount()).toBe(1); // card3
      expect(player.getDeck().getCardCount()).toBe(5); // 10 - 5 drawn

      // Reset
      player.reset();

      // Verify all cards back in deck
      const stateAfter = player.getState();
      expect(player.getHand().getCards()).toEqual([]);
      expect(player.getDiscardPile().getCards()).toEqual([]);
      expect(player.getExilePile().getCards()).toEqual([]);
      expect(player.getDeck().getCardCount()).toBe(10); // All 10 cards back
    });
  });

  describe('Reset with cards on battlefield', () => {
    it('should remove player\'s cards from battlefield and return to deck', () => {
      const yCards = yDoc.getMap(YDOC_CARDS_ON_BOARD);

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
        player.removeCardFromHand(card1.id);
      }

      if (card2) {
        const whiteboardCard2 = {
          ...card2,
          zIndex: 2,
          ownerId: playerId,
        };
        yCards.set(card2.id, whiteboardCard2);
        player.removeCardFromHand(card2.id);
      }

      // Verify state before reset
      expect(yCards.size).toBe(2); // 2 cards on battlefield
      expect(player.getState().hand.length).toBe(1); // card3 still in hand
      expect(player.getDeck().getCardCount()).toBe(7); // 10 - 3 drawn

      // Reset
      player.reset();

      // Verify battlefield is cleared of player's cards
      expect(yCards.size).toBe(0);

      // Verify all cards back in deck
      const state = player.getState();
      expect(state.hand).toEqual([]);
      expect(player.getDeck().getCardCount()).toBe(10);
    });

    it('should NOT remove opponent\'s cards from battlefield', () => {
      const yCards = yDoc.getMap(YDOC_CARDS_ON_BOARD);
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
        player.removeCardFromHand(playerCard.id);
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
      const yCards = yDoc.getMap(YDOC_CARDS_ON_BOARD);

      // Draw 8 cards
      const cards = Array.from({ length: 8 }, () => player.drawCard()).filter(Boolean) as Card[];

      // Play 3 to battlefield
      [cards[0], cards[1], cards[2]].forEach((card, index) => {
        yCards.set(card.id, {
          ...card,
          zIndex: index + 1,
          ownerId: playerId,
        });
        player.removeCardFromHand(card.id);
      });

      // Move 2 to discard
      player.placeCardInPile(cards[3], 'discard');
      player.removeCardFromHand(cards[3].id);

      player.placeCardInPile(cards[4], 'discard');
      player.removeCardFromHand(cards[4].id);

      // Move 1 to exile
      player.placeCardInPile(cards[5], 'exile');
      player.removeCardFromHand(cards[5].id);

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
      expect(player.getDeck().getCardCount()).toBe(2); // 10 - 8 drawn

      // Reset
      player.reset();

      // Verify complete reset
      const stateAfter = player.getState();
      expect(yCards.size).toBe(0); // Battlefield cleared
      expect(stateAfter.hand).toEqual([]);
      expect(stateAfter.discardPile).toEqual([]);
      expect(stateAfter.exilePile).toEqual([]);
      expect(stateAfter.health).toBe(40); // Back to initial
      expect(player.getDeck().getCardCount()).toBe(10); // All cards back
    });
  });

  describe('Reset empty state', () => {
    it('should handle reset when no cards have been drawn', () => {
      // Don't draw any cards
      expect(player.getState().hand).toEqual([]);
      expect(player.getDeck().getCardCount()).toBe(10);

      // Reset should work without errors
      player.reset();

      // State should remain valid
      const state = player.getState();
      expect(state.hand).toEqual([]);
      expect(state.discardPile).toEqual([]);
      expect(state.exilePile).toEqual([]);
      expect(state.health).toBe(40);
      expect(player.getDeck().getCardCount()).toBe(10);
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
      expect(player.getDeck().getCardCount()).toBe(0);
      expect(player.getState().hand.length).toBe(10);

      // Reset (which includes shuffle). Pin Math.random so the shuffle's
      // resulting order is deterministic rather than relying on true
      // randomness landing on a different permutation.
      const randomSpy = vi.spyOn(Math, 'random').mockImplementation(seededRandom(42));
      player.reset();
      randomSpy.mockRestore();

      // Deck should have all cards back
      expect(player.getDeck().getCardCount()).toBe(10);

      // Draw cards again - order should be different (shuffled)
      const redrawnCards: Card[] = [];
      card = player.drawCard();
      while (card) {
        redrawnCards.push(card);
        card = player.drawCard();
      }

      const sameOrder = drawnCards.every((c, i) => c.id === redrawnCards[i].id);
      expect(sameOrder).toBe(false);
      expect(redrawnCards.map(c => c.id).sort()).toEqual(drawnCards.map(c => c.id).sort());
    });
  });
});

describe('Player.drawCard()', () => {
  let yDoc: Y.Doc;
  let player: Player;
  let deck: Card[];

  beforeEach(() => {
    yDoc = new Y.Doc();
    deck = makeCards(5);
    player = new Player('test-player', yDoc, deck, { initialHealth: 40 });
  });

  it('should draw a card from deck to hand', () => {
    const card = player.drawCard();

    expect(card).not.toBeNull();
    expect(player.getState().hand.length).toBe(1);
    expect(player.getDeck().getCardCount()).toBe(4);
  });

  it('should return null when deck is empty', () => {
    // Draw all 5 cards
    player.drawCard();
    player.drawCard();
    player.drawCard();
    player.drawCard();
    player.drawCard();

    // Try to draw from empty deck
    const card = player.drawCard();
    expect(card).toBeNull();
    expect(player.getState().hand.length).toBe(5);
    expect(player.getDeck().getCardCount()).toBe(0);
  });

  it('should update Yjs state with drawn card', () => {
    const card = player.drawCard();
    const state = player.getState();

    expect(state.hand).toContainEqual(card);
  });
});

describe('Player.playCardFromHand()', () => {
  let yDoc: Y.Doc;
  let player: Player;

  beforeEach(() => {
    yDoc = new Y.Doc();
    const deck = makeCards(5);
    player = new Player('test-player', yDoc, deck, { initialHealth: 40 });
  });

  it('should remove card from hand and return it', () => {
    const card1 = player.drawCard();
    const card2 = player.drawCard();

    if (card1) {
      const playedCard = player.removeCardFromHand(card1.id);

      expect(playedCard).toEqual(card1);
      expect(player.getState().hand.length).toBe(1);
      expect(player.getState().hand).toContainEqual(card2);
      expect(player.getState().hand).not.toContainEqual(card1);
    }
  });

  it('should return null if card not in hand', () => {
    player.drawCard();

    const playedCard = player.removeCardFromHand('non-existent-id');

    expect(playedCard).toBeNull();
    expect(player.getState().hand.length).toBe(1);
  });
});

describe('Player.moveCardToDiscard()', () => {
  let yDoc: Y.Doc;
  let player: Player;

  beforeEach(() => {
    yDoc = new Y.Doc();
    const deck = makeCards(5);
    player = new Player('test-player', yDoc, deck, { initialHealth: 40 });
  });

  it('should add card to discard pile', () => {
    const card = player.drawCard();

    if (card) {
      player.placeCardInPile(card, 'discard');

      expect(player.getState().discardPile.length).toBe(1);
      expect(player.getState().discardPile).toContainEqual(card);
    }
  });

  it('should handle multiple cards in discard pile', () => {
    const card1 = player.drawCard();
    const card2 = player.drawCard();

    if (card1 && card2) {
      player.placeCardInPile(card1, 'discard');
      player.placeCardInPile(card2, 'discard');

      expect(player.getState().discardPile.length).toBe(2);
      expect(player.getState().discardPile).toContainEqual(card1);
      expect(player.getState().discardPile).toContainEqual(card2);
    }
  });
});

describe('Player.placeCardInPile()', () => {
  let yDoc: Y.Doc;
  let player: Player;

  beforeEach(() => {
    yDoc = new Y.Doc();
    const deck = makeCards(5);
    player = new Player('test-player', yDoc, deck, { initialHealth: 40 });
  });

  it('should add card to exile pile', () => {
    const card = player.drawCard();

    if (card) {
      player.placeCardInPile(card, 'exile');

      expect(player.getState().exilePile.length).toBe(1);
      expect(player.getState().exilePile).toContainEqual(card);
    }
  });

  it('should handle multiple cards in exile pile', () => {
    const card1 = player.drawCard();
    const card2 = player.drawCard();

    if (card1 && card2) {
      player.placeCardInPile(card1, 'exile');
      player.placeCardInPile(card2, 'exile');

      expect(player.getState().exilePile.length).toBe(2);
      expect(player.getState().exilePile).toContainEqual(card1);
      expect(player.getState().exilePile).toContainEqual(card2);
    }
  });
});

describe('Player.setHealth()', () => {
  let yDoc: Y.Doc;
  let player: Player;

  beforeEach(() => {
    yDoc = new Y.Doc();
    const deck = makeCards(5);
    player = new Player('test-player', yDoc, deck, { initialHealth: 40 });
  });

  it('should set health to specific value', () => {
    player.setHealth(25);
    expect(player.getState().health).toBe(25);
  });

  it('should allow setting health to 0', () => {
    player.setHealth(0);
    expect(player.getState().health).toBe(0);
  });

  it('should allow negative health', () => {
    player.setHealth(-5);
    expect(player.getState().health).toBe(-5);
  });
});

describe('Player.modifyHealth()', () => {
  let yDoc: Y.Doc;
  let player: Player;

  beforeEach(() => {
    yDoc = new Y.Doc();
    const deck = makeCards(5);
    player = new Player('test-player', yDoc, deck, { initialHealth: 40 });
  });

  it('should increase health by positive delta', () => {
    player.modifyHealth(5);
    expect(player.getState().health).toBe(45);
  });

  it('should decrease health by negative delta', () => {
    player.modifyHealth(-10);
    expect(player.getState().health).toBe(30);
  });

  it('should handle multiple modifications', () => {
    player.modifyHealth(5);
    player.modifyHealth(-8);
    player.modifyHealth(3);

    expect(player.getState().health).toBe(40); // 40 + 5 - 8 + 3 = 40
  });
});

describe('Player.shuffleDeck()', () => {
  let yDoc: Y.Doc;
  let player: Player;

  beforeEach(() => {
    yDoc = new Y.Doc();
    const deck = makeCards(10);
    player = new Player('test-player', yDoc, deck, { initialHealth: 40 });
  });

  it('should shuffle deck without changing card count', () => {
    const initialCount = player.getDeck().getCardCount();

    player.shuffleDeck();

    expect(player.getDeck().getCardCount()).toBe(initialCount);
  });

  it('should change card order', () => {
    // Draw all cards to record order
    const firstOrder: string[] = [];
    let card = player.drawCard();
    while (card) {
      firstOrder.push(card.id);
      card = player.drawCard();
    }

    // Reset to get cards back. Pin Math.random so the shuffle produces a
    // deterministic, guaranteed-different permutation instead of relying on
    // true randomness happening to land on a new order.
    const randomSpy = vi.spyOn(Math, 'random').mockImplementation(seededRandom(42));
    player.reset();
    randomSpy.mockRestore();

    // Draw again after shuffle
    const secondOrder: string[] = [];
    card = player.drawCard();
    while (card) {
      secondOrder.push(card.id);
      card = player.drawCard();
    }

    const sameOrder = firstOrder.every((id, i) => id === secondOrder[i]);
    expect(sameOrder).toBe(false);
    expect(secondOrder.slice().sort()).toEqual(firstOrder.slice().sort());
  });
});

describe('Player.moveCardToDeckTop()', () => {
  let yDoc: Y.Doc;
  let player: Player;

  beforeEach(() => {
    yDoc = new Y.Doc();
    const deck = makeCards(5);
    player = new Player('test-player', yDoc, deck, { initialHealth: 40 });
  });

  it('should add card to top of deck', () => {
    const card = player.drawCard();
    const initialCount = player.getDeck().getCardCount();

    if (card) {
      player.moveCardToDeckTop(card);

      expect(player.getDeck().getCardCount()).toBe(initialCount + 1);

      // Next drawn card should be the one we put on top
      const drawnCard = player.drawCard();
      expect(drawnCard?.id).toBe(card.id);
    }
  });

  it('should update deck count in Yjs state', () => {
    const card = player.drawCard();
    const countBefore = player.getDeck().getCardCount();

    if (card) {
      player.moveCardToDeckTop(card);
      expect(player.getDeck().getCardCount()).toBe(countBefore + 1);
    }
  });
});

describe('Player.moveCardToDeckBottom()', () => {
  let yDoc: Y.Doc;
  let player: Player;

  beforeEach(() => {
    yDoc = new Y.Doc();
    const deck = makeCards(3);
    player = new Player('test-player', yDoc, deck, { initialHealth: 40 });
  });

  it('should add card to bottom of deck', () => {
    const card = player.drawCard();
    const initialCount = player.getDeck().getCardCount();

    if (card) {
      player.moveCardToDeckBottom(card);

      expect(player.getDeck().getCardCount()).toBe(initialCount + 1);

      // Draw all remaining cards
      player.drawCard();
      player.drawCard();

      // Last drawn card should be the one we put on bottom
      const lastCard = player.drawCard();
      expect(lastCard?.id).toBe(card.id);
    }
  });

  it('should update deck count in Yjs state', () => {
    const card = player.drawCard();
    const countBefore = player.getDeck().getCardCount();

    if (card) {
      player.moveCardToDeckBottom(card);
      expect(player.getDeck().getCardCount()).toBe(countBefore + 1);
    }
  });
});

describe('Player.mulligan()', () => {
  let yDoc: Y.Doc;
  let player: Player;

  beforeEach(() => {
    yDoc = new Y.Doc();
    const deck = makeCards(20);
    player = new Player('test-player', yDoc, deck, { initialHealth: 40 });
  });

  it('should return hand to deck, shuffle, and draw 7', () => {
    // Draw initial hand of 5
    player.drawCard();
    player.drawCard();
    player.drawCard();
    player.drawCard();
    player.drawCard();

    expect(player.getState().hand.length).toBe(5);
    expect(player.getDeck().getCardCount()).toBe(15);

    // Mulligan
    player.mulligan(7);

    expect(player.getState().hand.length).toBe(7);
    expect(player.getDeck().getCardCount()).toBe(13); // 20 - 7
  });

  it('should work with custom draw count', () => {
    // Draw 3 cards
    player.drawCard();
    player.drawCard();
    player.drawCard();

    expect(player.getState().hand.length).toBe(3);

    // Mulligan with custom count
    player.mulligan(5);

    expect(player.getState().hand.length).toBe(5);
    expect(player.getDeck().getCardCount()).toBe(15); // 20 - 5
  });

  it('should shuffle deck during mulligan', () => {
    // Draw 7 cards and record their IDs
    const firstHand: string[] = [];
    for (let i = 0; i < 7; i++) {
      const card = player.drawCard();
      if (card) firstHand.push(card.id);
    }

    // Mulligan (returns cards, shuffles, draws 7). Pin Math.random so the
    // shuffle produces a deterministic, guaranteed-different permutation.
    const randomSpy = vi.spyOn(Math, 'random').mockImplementation(seededRandom(42));
    player.mulligan(7);
    randomSpy.mockRestore();

    // Get new hand IDs
    const secondHand = player.getState().hand.map(c => c.id);

    const sameHand = firstHand.every((id, i) => id === secondHand[i]);
    expect(sameHand).toBe(false);
  });

  it('should clear hand before drawing new cards', () => {
    // Draw 5 cards
    for (let i = 0; i < 5; i++) {
      player.drawCard();
    }

    expect(player.getState().hand.length).toBe(5);

    // Mulligan
    player.mulligan(7);

    // Should have exactly 7 cards, not 5 + 7
    expect(player.getState().hand.length).toBe(7);
  });

  it('should update deck count correctly', () => {
    // Draw 4 cards
    for (let i = 0; i < 4; i++) {
      player.drawCard();
    }

    expect(player.getDeck().getCardCount()).toBe(16);

    // Mulligan draws 7
    player.mulligan(7);

    expect(player.getDeck().getCardCount()).toBe(13); // 20 - 7
  });
});

describe('Player.loadNewDeck()', () => {
  let yDoc: Y.Doc;
  let player: Player;

  beforeEach(() => {
    yDoc = new Y.Doc();
    const deck = makeCards(5);
    player = new Player('test-player', yDoc, deck, { initialHealth: 40 });
  });

  const makeNewDeck = (cards: Card[]): SavedDeck => ({
    metadata: {
      id: '',
      name: 'test deck',
      cardCount: cards.length,
      importedAt: new Date(2020, 10, 23),
      lastModified: new Date(2020, 10, 23),
      source: 'manual',
    },
    cards,
  });

  it('should draw a normal 7-card opening hand when no card is a commander', async () => {
    const newDeckCards: Card[] = Array.from({ length: 10 }, (_, i) => ({
      id: `new-card-${i}`,
      cardNumber: i + 1,
      x: 0,
      y: 0,
      rotation: 0,
      isTapped: false,
      isFlipped: false,
      counters: [],
    }));

    await player.loadNewDeck(makeNewDeck(newDeckCards));

    // No commander flagged: 7 cards in hand, 3 remaining in deck.
    expect(player.getHand().getCardCount()).toBe(7);
    expect(player.getDeck().getCardCount()).toBe(3);
  });

  it('should auto-draw a flagged commander into the opening hand', async () => {
    const newDeckCards: Card[] = Array.from({ length: 10 }, (_, i) => ({
      id: `new-card-${i}`,
      cardNumber: i + 1,
      x: 0,
      y: 0,
      rotation: 0,
      isTapped: false,
      isFlipped: false,
      counters: [],
      commander: i === 3, // an arbitrary card (not the last) is the commander
    }));

    await player.loadNewDeck(makeNewDeck(newDeckCards));

    // Commander + 7 = 8 cards in hand, 2 remaining in deck, and the commander
    // is guaranteed to be in hand (not left to chance in the deck).
    expect(player.getHand().getCardCount()).toBe(8);
    expect(player.getDeck().getCardCount()).toBe(2);
    expect(player.getHand().getCards().some((c) => c.id === 'new-card-3')).toBe(true);
  });

  it('should auto-draw the commander from the default (Krenko) deck', async () => {
    // Guards the bundled default deck against losing its commander flag: the
    // opening hand must be 8 (Krenko + 7), matching the e2e boot assertion.
    await player.loadNewDeck(DEFAULT_DECK);

    expect(player.getHand().getCardCount()).toBe(8);
    expect(player.getDeck().getCardCount()).toBe(92);
    expect(player.getHand().getCards().some((c) => c.name === 'Krenko, Mob Boss')).toBe(true);
  });

  it('should auto-draw multiple commanders (partners)', async () => {
    const newDeckCards: Card[] = Array.from({ length: 12 }, (_, i) => ({
      id: `new-card-${i}`,
      cardNumber: i + 1,
      x: 0,
      y: 0,
      rotation: 0,
      isTapped: false,
      isFlipped: false,
      counters: [],
      commander: i < 2, // two partner commanders
    }));

    await player.loadNewDeck(makeNewDeck(newDeckCards));

    // 2 commanders + 7 = 9 in hand, 3 remaining, both commanders in hand.
    expect(player.getHand().getCardCount()).toBe(9);
    expect(player.getDeck().getCardCount()).toBe(3);
    const handIds = player.getHand().getCards().map((c) => c.id);
    expect(handIds).toContain('new-card-0');
    expect(handIds).toContain('new-card-1');
  });

  it('should shuffle deck after loading', () => {
    const newDeckCards: Card[] = Array.from({ length: 15 }, (_, i) => ({
      id: `card-${i}`,
      cardNumber: i + 1,
      x: 0,
      y: 0,
      rotation: 0,
      isTapped: false,
      isFlipped: false,
      counters: [],
    }));

    const newDeck: SavedDeck = {
      metadata: {
        id: '',
        name: 'test deck',
        cardCount: newDeckCards.length,
        importedAt: new Date(2020, 10, 23),
        lastModified: new Date(2020, 10, 23),
        source: 'manual',
      },
      cards: newDeckCards
    };

    // Load deck (draws commander, then shuffles). Pin Math.random so the
    // shuffle produces a deterministic, guaranteed-different permutation
    // instead of relying on true randomness happening to avoid a sequential run.
    const randomSpy = vi.spyOn(Math, 'random').mockImplementation(seededRandom(42));
    player.loadNewDeck(newDeck);
    randomSpy.mockRestore();

    // Draw all cards to check they were shuffled
    const drawnOrder: number[] = [];
    let card = player.drawCard();
    while (card) {
      drawnOrder.push(card.cardNumber);
      card = player.drawCard();
    }

    // Check if order is NOT sequential (would indicate shuffle happened)
    const isSequential = drawnOrder.every((num, i, arr) =>
      i === 0 || num === arr[i - 1] + 1 || num === arr[i - 1] - 1
    );

    // After shuffle, order should not be sequential
    expect(isSequential).toBe(false);
  });
});

describe('Player.getId()', () => {
  let yDoc: Y.Doc;
  let player: Player;

  beforeEach(() => {
    yDoc = new Y.Doc();
    const deck = makeCards(5);
    player = new Player('test-player-123', yDoc, deck, { initialHealth: 40 });
  });

  it('should return player ID', () => {
    expect(player.getId()).toBe('test-player-123');
  });
});

describe('Player.getDeckCards()', () => {
  let yDoc: Y.Doc;
  let player: Player;

  beforeEach(() => {
    yDoc = new Y.Doc();
    const deck = makeCards(5);
    player = new Player('test-player', yDoc, deck, { initialHealth: 40 });
  });

  it('should return all cards in deck', () => {
    const cards = player.getDeckCards();
    expect(cards.length).toBe(5);
  });

  it('should reflect changes when cards are drawn', () => {
    player.drawCard();
    player.drawCard();

    const cards = player.getDeckCards();
    expect(cards.length).toBe(3);
  });
});

describe('Player.onStateChange()', () => {
  let yDoc: Y.Doc;
  let player: Player;

  beforeEach(() => {
    yDoc = new Y.Doc();
    const deck = makeCards(5);
    player = new Player('test-player', yDoc, deck, { initialHealth: 40 });
  });

  it('should trigger callback when state changes', () => {
    let callbackCalled = false;
    let capturedState: any = null;

    player.onStateChange((state) => {
      callbackCalled = true;
      capturedState = state;
    });

    // Trigger state change
    player.setHealth(30);

    expect(callbackCalled).toBe(true);
    expect(capturedState.health).toBe(30);
  });

  it('should trigger callback on multiple changes', () => {
    let callCount = 0;

    player.onStateChange(() => {
      callCount++;
    });

    player.setHealth(30);
    player.setHealth(25);
    player.drawCard();

    expect(callCount).toBeGreaterThanOrEqual(3);
  });
});

describe('Player.setAllowViewHand() / getAllowViewHand()', () => {
  let player: Player;

  beforeEach(() => {
    const yDoc = new Y.Doc();
    const deck = makeCards(5);
    player = new Player('test-player', yDoc, deck, { initialHealth: 40 });
  });

  it('defaults to false before it is ever set', () => {
    expect(player.getAllowViewHand()).toBe(false);
  });

  it('reflects the value passed to setAllowViewHand', () => {
    player.setAllowViewHand(true);
    expect(player.getAllowViewHand()).toBe(true);

    player.setAllowViewHand(false);
    expect(player.getAllowViewHand()).toBe(false);
  });
});

describe('Player.reorderHand()', () => {
  let player: Player;

  beforeEach(() => {
    const yDoc = new Y.Doc();
    const deck = makeCards(5);
    player = new Player('test-player', yDoc, deck, { initialHealth: 40 });
  });

  it('replaces the hand with the given order', () => {
    player.drawCards(3);
    const [a, b, c] = player.getState().hand;

    player.reorderHand([c, a, b]);

    expect(player.getState().hand.map((card) => card.id)).toEqual([c.id, a.id, b.id]);
  });
});

describe('Player.flipHandCard()', () => {
  let player: Player;

  beforeEach(() => {
    const yDoc = new Y.Doc();
    const deck = makeCards(5);
    player = new Player('test-player', yDoc, deck, { initialHealth: 40 });
  });

  it('toggles isFlipped on the matching hand card', () => {
    player.drawCard();
    const card = player.getState().hand[0];
    expect(card.isFlipped).toBe(false);

    player.flipHandCard(card.id);
    expect(player.getState().hand[0].isFlipped).toBe(true);

    player.flipHandCard(card.id);
    expect(player.getState().hand[0].isFlipped).toBe(false);
  });

  it('leaves the hand untouched when the card id is not found', () => {
    player.drawCard();
    const before = player.getState().hand;

    player.flipHandCard('missing-id');

    expect(player.getState().hand).toEqual(before);
  });
});

describe('Player.movePileCard()', () => {
  let yDoc: Y.Doc;
  let player: Player;

  beforeEach(() => {
    yDoc = new Y.Doc();
    const deck = makeCards(5);
    player = new Player('test-player', yDoc, deck, { initialHealth: 40 });
  });

  it('moves a card from one pile to another and logs the move', () => {
    const card = player.drawCard()!;

    player.movePileCard(card, 'hand', 'discard');

    expect(player.getState().hand).toHaveLength(0);
    expect(player.getState().discardPile).toContainEqual(card);
    const log = getActionLog(yDoc).toArray();
    expect(log.some((e) => e.type === 'move_to_pile' && e.text.includes('discard'))).toBe(true);
  });

  it('logs "top of deck" when moved to deck at the default position', () => {
    const card = player.drawCard()!;

    player.movePileCard(card, 'hand', 'deck');

    expect(player.getDeck().getCards()).toContainEqual(card);
    const log = getActionLog(yDoc).toArray();
    expect(log.some((e) => e.type === 'move_to_pile' && e.text.includes('top of deck'))).toBe(true);
  });

  it('logs "bottom of deck" when moved to deck at position 0', () => {
    const card = player.drawCard()!;

    player.movePileCard(card, 'hand', 'deck', 0);

    expect(player.getDeck().getCards()[0]).toEqual(card);
    const log = getActionLog(yDoc).toArray();
    expect(log.some((e) => e.type === 'move_to_pile' && e.text.includes('bottom of deck'))).toBe(true);
  });
});

describe('Player.drawCardFromPile() / removeCardFromPileById()', () => {
  let player: Player;

  beforeEach(() => {
    const yDoc = new Y.Doc();
    const deck = makeCards(5);
    player = new Player('test-player', yDoc, deck, { initialHealth: 40 });
  });

  it('drawCardFromPile draws the top card from the given pile', () => {
    const deckSizeBefore = player.getDeck().getCardCount();

    const drawn = player.drawCardFromPile('deck');

    expect(drawn).not.toBeNull();
    expect(player.getDeck().getCardCount()).toBe(deckSizeBefore - 1);
  });

  it('drawCardFromPile returns null when the pile is empty', () => {
    while (player.drawCardFromPile('deck') !== null) {
      /* drain the deck */
    }
    expect(player.drawCardFromPile('deck')).toBeNull();
  });

  it('removeCardFromPileById removes a specific card from a named pile', () => {
    const card = player.drawCard()!;
    player.placeCardInPile(card, 'exile');

    const removed = player.removeCardFromPileById(card.id, 'exile');

    expect(removed).toEqual(card);
    expect(player.getState().exilePile).not.toContainEqual(card);
  });

  it('removeCardFromPileById returns null when the id is not present', () => {
    expect(player.removeCardFromPileById('missing-id', 'discard')).toBeNull();
  });
});

describe('Player.addCustomCounter() / modifyCustomCounter() / removeCustomCounter()', () => {
  let yDoc: Y.Doc;
  let player: Player;

  beforeEach(() => {
    yDoc = new Y.Doc();
    const deck = makeCards(5);
    player = new Player('test-player', yDoc, deck, { initialHealth: 40 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('adds a counter with the given title/icon starting at 0', () => {
    player.addCustomCounter('Poison', '☠');

    const counters = player.getState().customCounters;
    expect(counters).toHaveLength(1);
    expect(counters[0]).toMatchObject({ title: 'Poison', icon: '☠', value: 0 });
    expect(counters[0].id).toBeTruthy();
  });

  it('modifies the counter value by delta', () => {
    player.addCustomCounter('Poison', '☠');
    const id = player.getState().customCounters[0].id;

    player.modifyCustomCounter(id, 3);
    expect(player.getState().customCounters[0].value).toBe(3);

    player.modifyCustomCounter(id, -1);
    expect(player.getState().customCounters[0].value).toBe(2);
  });

  it('does nothing when the counter id does not exist', () => {
    player.addCustomCounter('Poison', '☠');
    const before = player.getState().customCounters;

    player.modifyCustomCounter('missing-id', 5);

    expect(player.getState().customCounters).toEqual(before);
  });

  it('logs a single debounced entry after rapid modifications settle', () => {
    vi.useFakeTimers();
    player.addCustomCounter('Poison', '☠');
    const id = player.getState().customCounters[0].id;

    player.modifyCustomCounter(id, 1);
    player.modifyCustomCounter(id, 1);
    player.modifyCustomCounter(id, 1);
    vi.advanceTimersByTime(500);

    const log = getActionLog(yDoc).toArray();
    const entries = log.filter((e) => e.type === 'counter');
    expect(entries).toHaveLength(1);
    expect(entries[0].text).toContain('Poison from 0 to 3');
  });

  it('removes a counter and cancels its pending debounce timer', () => {
    vi.useFakeTimers();
    player.addCustomCounter('Poison', '☠');
    const id = player.getState().customCounters[0].id;
    player.modifyCustomCounter(id, 1);

    player.removeCustomCounter(id);
    vi.advanceTimersByTime(500);

    expect(player.getState().customCounters).toHaveLength(0);
    const log = getActionLog(yDoc).toArray();
    expect(log.filter((e) => e.type === 'counter')).toHaveLength(0);
  });
});
describe('Player join logging', () => {
  let yDoc: Y.Doc;

  beforeEach(() => {
    yDoc = new Y.Doc();
  });

  it('logs an entrance when a player first joins the room', () => {
    new Player('player-a', yDoc, makeCards(5));

    const joins = getActionLog(yDoc).toArray().filter((e) => e.type === 'join');
    expect(joins).toHaveLength(1);
    expect(joins[0].actorId).toBe('player-a');
    expect(joins[0].text).toBe('joined the game');
  });

  it('logs one entrance per player', () => {
    new Player('player-a', yDoc, makeCards(5));
    new Player('player-b', yDoc, makeCards(5));

    const joins = getActionLog(yDoc).toArray().filter((e) => e.type === 'join');
    expect(joins.map((e) => e.actorId)).toEqual(['player-a', 'player-b']);
  });

  it('does not re-announce a player whose state already exists (refresh/reconnect)', () => {
    new Player('player-a', yDoc, makeCards(5));

    // A refresh reconstructs Player over the same synced doc.
    new Player('player-a', yDoc, makeCards(5));

    const joins = getActionLog(yDoc).toArray().filter((e) => e.type === 'join');
    expect(joins).toHaveLength(1);
  });
});
