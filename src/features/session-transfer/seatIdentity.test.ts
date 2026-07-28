import { describe, it, expect } from 'vitest';
import { seatIdentityFor, seatHeadline, describeInPlay, isAmbiguous } from './seatIdentity';
import { emptyZones, toCardRef, type SeatSnapshot, type CardRef } from './sessionSnapshot';
import { makeCard, makeCards } from '@/test/factories';

function seat(overrides: Partial<SeatSnapshot> = {}): SeatSnapshot {
  return {
    seatId: 'alice',
    name: 'Alice',
    color: '#ff0000',
    joinedAt: 1,
    health: 40,
    customCounters: [],
    deckRevealCount: 0,
    allowViewHand: false,
    zones: emptyZones(),
    ...overrides,
  };
}

const boardCard = (name: string, ownerId: string): CardRef =>
  toCardRef(makeCard({ name, ...{ ownerId } }), { board: true });

describe('seatIdentityFor', () => {
  it('carries the deck name — what the player themselves called it', () => {
    const identity = seatIdentityFor(seat({ deckName: 'Krenko Goblins' }), []);

    expect(identity.deckName).toBe('Krenko Goblins');
    expect(seatHeadline(identity)).toBe('Krenko Goblins');
  });

  it('finds the commander wherever it ended up', () => {
    // It starts in the deck, is auto-drawn to hand on load, and often ends up on
    // the battlefield — so a zone-specific search would miss it most of the game.
    const inHand = seatIdentityFor(
      seat({ zones: { ...emptyZones(), hand: [toCardRef(makeCard({ name: 'Krenko', commander: true }))] } }),
      [],
    );
    const onBoard = seatIdentityFor(seat(), [
      toCardRef(makeCard({ name: 'Krenko', commander: true, ...{ ownerId: 'alice' } }), { board: true }),
    ]);

    expect(inHand.commanders).toEqual(['Krenko']);
    expect(onBoard.commanders).toEqual(['Krenko']);
  });

  it('lists both partners', () => {
    const identity = seatIdentityFor(
      seat({
        zones: {
          ...emptyZones(),
          hand: [
            toCardRef(makeCard({ name: 'Tymna', commander: true })),
            toCardRef(makeCard({ name: 'Thrasios', commander: true })),
          ],
        },
      }),
      [],
    );

    expect(identity.commanders).toEqual(['Tymna', 'Thrasios']);
  });

  it('lists only the cards this seat has in play', () => {
    const board = [boardCard('Sol Ring', 'alice'), boardCard('Counterspell', 'bob')];

    expect(seatIdentityFor(seat(), board).inPlay).toEqual(['Sol Ring']);
  });

  it('never exposes hand contents — the thing the picker exists to protect', () => {
    const identity = seatIdentityFor(
      seat({ zones: { ...emptyZones(), hand: makeCards(3).map((c) => toCardRef(c)) } }),
      [],
    );

    expect(identity.handCount).toBe(3);
    expect(JSON.stringify(identity)).not.toContain('Lightning Bolt');
  });

  it('counts the zones without naming what is in them', () => {
    const identity = seatIdentityFor(
      seat({
        zones: {
          ...emptyZones(),
          deck: makeCards(97).map((c) => toCardRef(c)),
          hand: makeCards(7).map((c) => toCardRef(c)),
        },
      }),
      [],
    );

    expect(identity.deckCount).toBe(97);
    expect(identity.handCount).toBe(7);
  });
});

describe('seatHeadline', () => {
  const identity = (over: Partial<SeatSnapshot>, board: CardRef[] = []) =>
    seatIdentityFor(seat(over), board);

  it('prefers the deck name over everything else', () => {
    const withBoth = identity({
      deckName: 'Krenko Goblins',
      zones: { ...emptyZones(), hand: [toCardRef(makeCard({ name: 'Krenko', commander: true }))] },
    });

    expect(seatHeadline(withBoth)).toBe('Krenko Goblins');
  });

  it('falls back to the commander when the deck has no name', () => {
    const withCommander = identity({
      zones: { ...emptyZones(), hand: [toCardRef(makeCard({ name: 'Krenko', commander: true }))] },
    });

    expect(seatHeadline(withCommander)).toBe('Krenko');
  });

  it('falls back to what is on the battlefield', () => {
    expect(seatHeadline(identity({}, [boardCard('Sol Ring', 'alice')]))).toBe('Sol Ring');
  });

  it('falls back to the life total rather than rendering nothing', () => {
    expect(seatHeadline(identity({ health: 33 }))).toBe('33 life');
  });
});

describe('describeInPlay', () => {
  it('names a short board in full', () => {
    expect(describeInPlay(['Sol Ring', 'Llanowar Elves'])).toBe('Sol Ring, Llanowar Elves');
  });

  it('summarises a wide board so the row still fits', () => {
    expect(describeInPlay(['A', 'B', 'C', 'D', 'E'])).toBe('A, B, C, and 2 more');
  });

  it('says nothing about an empty board', () => {
    expect(describeInPlay([])).toBe('');
  });
});

describe('isAmbiguous', () => {
  const withDeck = (seatId: string, deckName?: string, health = 40) =>
    seatIdentityFor(seat({ seatId, deckName, health }), []);

  it('flags two seats a player could not tell apart', () => {
    // This is exactly when someone guesses — and a guess is what reveals a hand.
    const seats = [withDeck('alice', undefined, 40), withDeck('bob', undefined, 40)];

    expect(isAmbiguous(seats[0], seats)).toBe(true);
  });

  it('leaves distinguishable seats alone', () => {
    const seats = [withDeck('alice', 'Krenko Goblins'), withDeck('bob', 'Atraxa Superfriends')];

    expect(isAmbiguous(seats[0], seats)).toBe(false);
  });

  it('does not flag a seat against itself', () => {
    const seats = [withDeck('alice', 'Krenko Goblins')];

    expect(isAmbiguous(seats[0], seats)).toBe(false);
  });

  it('separates two unnamed decks by life total', () => {
    const seats = [withDeck('alice', undefined, 40), withDeck('bob', undefined, 33)];

    expect(isAmbiguous(seats[0], seats)).toBe(false);
  });
});
