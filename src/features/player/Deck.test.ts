import { describe, it, expect } from 'vitest';
import { Deck } from './Deck';
import { Card } from './types';

// Deck is only ever used to seed the initial card list at Player construction
// (`new Deck()` / `new Deck(cards)`, then `.getCards()`). Runtime pile mutation
// (draw/shuffle/add/remove) all goes through CardPile — see CardPile.test.ts —
// so only the constructor and getCards() are exercised here.
describe('Deck', () => {
  describe('Constructor', () => {
    describe('with no arguments', () => {
      it('should create an empty deck when initialized with no cards', () => {
        const deck = new Deck();
        expect(deck.getCardCount()).toBe(0);
        expect(deck.getCards()).toEqual([]);
      });
    });

    describe('with numDummyCards', () => {
      it('should create deck with specified number of dummy cards', () => {
        const deck = new Deck(undefined, 10);
        expect(deck.getCardCount()).toBe(10);
      });

      it('should initialize dummy cards with sequential card numbers starting from 1', () => {
        const deck = new Deck(undefined, 5);
        const cards = deck.getCards();

        expect(cards[0].cardNumber).toBe(1);
        expect(cards[1].cardNumber).toBe(2);
        expect(cards[2].cardNumber).toBe(3);
        expect(cards[3].cardNumber).toBe(4);
        expect(cards[4].cardNumber).toBe(5);
      });

      it('should initialize dummy cards with default properties', () => {
        const deck = new Deck(undefined, 3);
        const cards = deck.getCards();

        cards.forEach((card) => {
          expect(card.x).toBe(100);
          expect(card.y).toBe(100);
          expect(card.rotation).toBe(0);
          expect(card.isTapped).toBe(false);
          expect(card.isFlipped).toBe(false);
          expect(card.counters).toEqual([]);
          expect(card.id).toMatch(/^card-/);
        });
      });

      it('should give each dummy card a unique ID', () => {
        const deck = new Deck(undefined, 10);
        const cards = deck.getCards();
        const ids = cards.map(c => c.id);
        const uniqueIds = new Set(ids);

        expect(uniqueIds.size).toBe(10);
      });

      it('should create 0 cards when numDummyCards is 0', () => {
        const deck = new Deck(undefined, 0);
        expect(deck.getCardCount()).toBe(0);
      });
    });

    describe('with provided cards array', () => {
      it('should initialize with provided cards', () => {
        const cards: Card[] = [
          { id: 'card-1', cardNumber: 1, x: 0, y: 0, rotation: 0, isTapped: false, isFlipped: false, counters: [] },
          { id: 'card-2', cardNumber: 2, x: 0, y: 0, rotation: 0, isTapped: false, isFlipped: false, counters: [] },
          { id: 'card-3', cardNumber: 3, x: 0, y: 0, rotation: 0, isTapped: false, isFlipped: false, counters: [] },
        ];

        const deck = new Deck(cards);
        expect(deck.getCardCount()).toBe(3);
      });

      it('should regenerate unique IDs for all cards to prevent collisions', () => {
        const cards: Card[] = [
          { id: 'same-id', cardNumber: 1, x: 0, y: 0, rotation: 0, isTapped: false, isFlipped: false, counters: [] },
          { id: 'same-id', cardNumber: 2, x: 0, y: 0, rotation: 0, isTapped: false, isFlipped: false, counters: [] },
        ];

        const deck = new Deck(cards);
        const deckCards = deck.getCards();

        expect(deckCards[0].id).not.toBe('same-id');
        expect(deckCards[1].id).not.toBe('same-id');
        expect(deckCards[0].id).not.toBe(deckCards[1].id);
      });

      it('should preserve card properties except ID', () => {
        const cards: Card[] = [
          {
            id: 'old-id',
            cardNumber: 42,
            name: 'Lightning Bolt',
            x: 50,
            y: 100,
            rotation: 90,
            isTapped: true,
            isFlipped: true,
            counters: [1, 2, 3],
          },
        ];

        const deck = new Deck(cards);
        const deckCards = deck.getCards();

        expect(deckCards[0].id).not.toBe('old-id');
        expect(deckCards[0].cardNumber).toBe(42);
        expect(deckCards[0].name).toBe('Lightning Bolt');
        expect(deckCards[0].x).toBe(50);
        expect(deckCards[0].y).toBe(100);
        expect(deckCards[0].rotation).toBe(90);
        expect(deckCards[0].isTapped).toBe(true);
        expect(deckCards[0].isFlipped).toBe(true);
        expect(deckCards[0].counters).toEqual([1, 2, 3]);
      });

      it('should ignore numDummyCards when cards array is provided', () => {
        const cards: Card[] = [
          { id: 'card-1', cardNumber: 1, x: 0, y: 0, rotation: 0, isTapped: false, isFlipped: false, counters: [] },
        ];

        const deck = new Deck(cards, 100); // numDummyCards should be ignored
        expect(deck.getCardCount()).toBe(1);
      });

      it('should use numDummyCards when cards array is empty', () => {
        const deck = new Deck([], 5);
        expect(deck.getCardCount()).toBe(5);
      });
    });
  });

  describe('getCards()', () => {
    it('should return a copy of the cards array', () => {
      const deck = new Deck(undefined, 5);
      const cards1 = deck.getCards();
      const cards2 = deck.getCards();

      // Should be equal but not the same reference
      expect(cards1).toEqual(cards2);
      expect(cards1).not.toBe(cards2);
    });

    it('should not allow mutation of internal deck state', () => {
      const deck = new Deck(undefined, 5);
      const cards = deck.getCards();

      // Mutate the returned array
      cards.pop();

      // Deck should still have all cards
      expect(deck.getCardCount()).toBe(5);
    });

    it('should return empty array for empty deck', () => {
      const deck = new Deck();
      expect(deck.getCards()).toEqual([]);
    });
  });
});
