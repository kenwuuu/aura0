import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Y from 'yjs';
import { CardPile } from './CardPile';
import { makeCard, makeCards } from '@/test/factories';
import { seededRandom } from '@/test/seededRandom';

// CardPile is the class every runtime pile (deck/hand/exile/discard/scry) is
// actually built from — Player.ts wires one up per zone over a shared
// yPlayerState map. Deck.ts (tested separately) only ever seeds the initial
// card list; it is never mutated at runtime.
describe('CardPile', () => {
  let yDoc: Y.Doc;
  let yPlayerState: Y.Map<any>;
  let pile: CardPile;

  beforeEach(() => {
    yDoc = new Y.Doc();
    yPlayerState = yDoc.getMap('player-1');
    pile = new CardPile(yPlayerState, 'deck');
  });

  describe('getCards() / getCardCount()', () => {
    it('is empty when the key has never been set', () => {
      expect(pile.getCards()).toEqual([]);
      expect(pile.getCardCount()).toBe(0);
    });

    it('reflects cards set directly on the Yjs map (peer sync)', () => {
      const cards = makeCards(3);
      yPlayerState.set('deck', cards);

      expect(pile.getCardCount()).toBe(3);
      expect(pile.getCards()).toEqual(cards);
    });

    it('returns a copy, not a live reference', () => {
      yPlayerState.set('deck', makeCards(2));
      const cards = pile.getCards();
      cards.pop();

      expect(pile.getCardCount()).toBe(2);
    });
  });

  describe('addCardToTop() / addCardToBottom() / placeCardAtPosition()', () => {
    it('adds to the end of the array (top, drawn first)', () => {
      const card = makeCard();
      pile.addCardToTop(card);

      expect(pile.getCards()).toEqual([card]);
      expect(pile.drawCard()).toEqual(card);
    });

    it('adds to the start of the array (bottom, drawn last)', () => {
      const bottom = makeCard();
      const top = makeCard();
      pile.addCardToBottom(bottom);
      pile.addCardToTop(top);

      expect(pile.getCards()).toEqual([bottom, top]);
    });

    it('inserts at an arbitrary index', () => {
      const cards = makeCards(3);
      yPlayerState.set('deck', cards);
      const inserted = makeCard();

      pile.placeCardAtPosition(inserted, 1);

      expect(pile.getCards()[1]).toEqual(inserted);
      expect(pile.getCardCount()).toBe(4);
    });
  });

  describe('drawCard()', () => {
    it('pops the last card and persists the remainder', () => {
      const [first, second] = makeCards(2);
      yPlayerState.set('deck', [first, second]);

      expect(pile.drawCard()).toEqual(second);
      expect(pile.getCards()).toEqual([first]);
    });

    it('returns null when empty', () => {
      expect(pile.drawCard()).toBeNull();
    });
  });

  describe('removeCardById() / removeCard()', () => {
    it('removes the matching card and returns it', () => {
      const [a, b, c] = makeCards(3);
      yPlayerState.set('deck', [a, b, c]);

      expect(pile.removeCardById(b.id)).toEqual(b);
      expect(pile.getCards()).toEqual([a, c]);
    });

    it('returns null when the id is not present', () => {
      yPlayerState.set('deck', makeCards(1));
      expect(pile.removeCardById('missing')).toBeNull();
    });

    it('removeCard() delegates to removeCardById() by the card object id', () => {
      const [a, b] = makeCards(2);
      yPlayerState.set('deck', [a, b]);

      expect(pile.removeCard(a)).toEqual(a);
      expect(pile.getCards()).toEqual([b]);
    });
  });

  describe('clear()', () => {
    it('empties the pile', () => {
      yPlayerState.set('deck', makeCards(4));
      pile.clear();

      expect(pile.getCards()).toEqual([]);
    });
  });

  describe('setCards()', () => {
    it('replaces the entire pile contents', () => {
      yPlayerState.set('deck', makeCards(2));
      const replacement = makeCards(5);

      pile.setCards(replacement);

      expect(pile.getCards()).toEqual(replacement);
    });
  });

  describe('getCardAt() / peekTop() / peekBottom()', () => {
    it('indexes bottom-to-top, with peekTop/peekBottom at the ends', () => {
      const cards = makeCards(3);
      yPlayerState.set('deck', cards);

      expect(pile.getCardAt(0)).toEqual(cards[0]);
      expect(pile.getCardAt(2)).toEqual(cards[2]);
      expect(pile.peekBottom()).toEqual(cards[0]);
      expect(pile.peekTop()).toEqual(cards[2]);
    });

    it('returns null for an out-of-range index or an empty pile', () => {
      expect(pile.getCardAt(0)).toBeNull();
      expect(pile.peekTop()).toBeNull();
      expect(pile.peekBottom()).toBeNull();
    });
  });

  describe('shuffle()', () => {
    it('preserves the exact card multiset', () => {
      const cards = makeCards(10);
      yPlayerState.set('deck', cards);

      pile.shuffle();

      const shuffledIds = pile.getCards().map(c => c.id).sort();
      const originalIds = cards.map(c => c.id).sort();
      expect(shuffledIds).toEqual(originalIds);
    });

    it('changes the order — pinned via a seeded RNG so the assertion is deterministic, not probabilistic', () => {
      const cards = makeCards(10);
      yPlayerState.set('deck', cards);
      const originalOrder = cards.map(c => c.id);

      // A seeded PRNG makes the resulting permutation fully deterministic and
      // reproducible — no reliance on true randomness landing on a new order.
      const randomSpy = vi.spyOn(Math, 'random').mockImplementation(seededRandom(42));
      pile.shuffle();
      randomSpy.mockRestore();

      const shuffledOrder = pile.getCards().map(c => c.id);
      expect(shuffledOrder).not.toEqual(originalOrder);
    });

    it('is a no-op on an empty or single-card pile', () => {
      expect(() => pile.shuffle()).not.toThrow();

      const only = makeCard();
      yPlayerState.set('deck', [only]);
      pile.shuffle();
      expect(pile.getCards()).toEqual([only]);
    });
  });

  describe('multiple zones share independent state', () => {
    it('does not leak writes between piles keyed on the same map', () => {
      const hand = new CardPile(yPlayerState, 'hand');
      pile.addCardToTop(makeCard({ id: 'deck-card' }));
      hand.addCardToTop(makeCard({ id: 'hand-card' }));

      expect(pile.getCards().map(c => c.id)).toEqual(['deck-card']);
      expect(hand.getCards().map(c => c.id)).toEqual(['hand-card']);
    });
  });
});
