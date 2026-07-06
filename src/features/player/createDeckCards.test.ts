import { describe, it, expect } from 'vitest';
import { createDeckCards } from './createDeckCards';
import { Card } from './types';

describe('createDeckCards', () => {
  it('regenerates unique IDs for all cards to prevent collisions', () => {
    const cards: Card[] = [
      { id: 'same-id', cardNumber: 1, x: 0, y: 0, rotation: 0, isTapped: false, isFlipped: false, counters: [] },
      { id: 'same-id', cardNumber: 2, x: 0, y: 0, rotation: 0, isTapped: false, isFlipped: false, counters: [] },
    ];

    const deckCards = createDeckCards(cards);

    expect(deckCards[0].id).not.toBe('same-id');
    expect(deckCards[1].id).not.toBe('same-id');
    expect(deckCards[0].id).not.toBe(deckCards[1].id);
  });

  it('preserves card properties except ID', () => {
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

    const deckCards = createDeckCards(cards);

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

  it('returns an empty array for an empty input', () => {
    expect(createDeckCards([])).toEqual([]);
  });

  it('returns a new array, not the same input reference', () => {
    const cards: Card[] = [
      { id: 'card-1', cardNumber: 1, x: 0, y: 0, rotation: 0, isTapped: false, isFlipped: false, counters: [] },
    ];
    expect(createDeckCards(cards)).not.toBe(cards);
  });
});
