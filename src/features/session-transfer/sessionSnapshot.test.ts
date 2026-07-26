import { describe, it, expect } from 'vitest';
import { makeCard } from '@/test/factories';
import { toCardRef, fromCardRef, boardCardFromRef, isTokenCard } from './sessionSnapshot';

describe('isTokenCard', () => {
  it('recognises an MTG token by its id prefix', () => {
    expect(isTokenCard({ id: 'token-abc123' })).toBe(true);
    expect(isTokenCard({ id: 'card-abc123' })).toBe(false);
  });
});

describe('toCardRef / fromCardRef', () => {
  it('round-trips identity through a ref', () => {
    const card = makeCard({ id: 'card-1', name: 'Sol Ring', scryfallId: 'sf-1', cardNumber: 12 });

    const restored = fromCardRef(toCardRef(card));

    expect(restored).toMatchObject({
      id: 'card-1',
      name: 'Sol Ring',
      scryfallId: 'sf-1',
      cardNumber: 12,
    });
  });

  it('marks a commander so the opening-hand rule still applies after a restore', () => {
    const ref = toCardRef(makeCard({ commander: true }));

    expect(ref.commander).toBe(true);
    expect(fromCardRef(ref).commander).toBe(true);
  });

  it('takes hydrated art and text over the ref, which carries neither', () => {
    const ref = toCardRef(makeCard({ id: 'card-1', name: 'Sol Ring' }));

    const restored = fromCardRef(ref, {
      images: { front: { normal: 'https://img/sol-ring.png' } },
      oracleText: 'Add {C}{C}.',
      type_line: 'Artifact',
    });

    expect(restored.images?.front?.normal).toBe('https://img/sol-ring.png');
    expect(restored.oracleText).toBe('Add {C}{C}.');
    expect(restored.type_line).toBe('Artifact');
  });

  it('keeps the card when the lookup resolved nothing, rather than losing it', () => {
    // A card that comes back nameless-and-artless is visibly wrong and fixable.
    // A card that silently vanishes changes the game.
    const restored = fromCardRef(toCardRef(makeCard({ name: 'Unresolvable Card' })));

    expect(restored.name).toBe('Unresolvable Card');
    expect(restored.images).toBeUndefined();
  });

  it('restores a pile card at rest, not wherever it last sat on the board', () => {
    const ref = toCardRef(makeCard({ x: 400, y: 300, isTapped: true, rotation: 90 }));

    const restored = fromCardRef(ref);

    expect(restored).toMatchObject({ x: 0, y: 0, rotation: 0, isTapped: false });
  });

  it('restores a board card exactly where it was left', () => {
    const card = makeCard({
      id: 'card-1',
      x: 400,
      y: 300,
      rotation: 90,
      isTapped: true,
      isFlipped: true,
      counters: [3, 1],
      ...{ zIndex: 9, ownerId: 'alice' },
    });

    const restored = boardCardFromRef(toCardRef(card, { board: true }));

    expect(restored).toMatchObject({
      x: 400,
      y: 300,
      rotation: 90,
      isTapped: true,
      isFlipped: true,
      counters: [3, 1],
      zIndex: 9,
      ownerId: 'alice',
    });
  });

  it('copies counters rather than sharing the array with the live card', () => {
    const card = makeCard({ counters: [1] });
    const ref = toCardRef(card, { board: true });

    card.counters.push(99);

    expect(ref.counters).toEqual([1]);
    expect(fromCardRef(ref).counters).toEqual([1]);
  });

  it('omits empty optional fields so the file stays small', () => {
    const ref = toCardRef(makeCard({ counters: [] }), { board: true });

    expect(ref).not.toHaveProperty('counters');
    expect(ref).not.toHaveProperty('commander');
    expect(ref).not.toHaveProperty('isSick');
  });
});
