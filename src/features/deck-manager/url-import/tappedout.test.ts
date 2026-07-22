import { describe, expect, it } from 'vitest';
import { deckNameFromSlug, extractTappedOutDeck } from './tappedout';
import { toDecklistText } from './importedDeck';
import { parseDecklistWithStats } from '@/features/deck-manager/DeckListParser';
// Captured from tappedout.net/mtg-decks/05-06-24-here-kitty-kitty/?fmt=txt.
// Its job is to fail loudly if the export format changes.
import realExport from './__fixtures__/tappedoutDeck.txt?raw';

describe('extractTappedOutDeck', () => {
  it('reads a plain decklist as the deck', () => {
    const deck = extractTappedOutDeck('my-deck', '1 Sol Ring\n12 Forest');

    expect(deck.source).toBe('tappedout');
    expect(deck.cards).toEqual([
      { name: 'Sol Ring', quantity: 1, section: 'main' },
      { name: 'Forest', quantity: 12, section: 'main' },
    ]);
  });

  it("routes the export's Sideboard section to the sideboard", () => {
    const deck = extractTappedOutDeck(
      'my-deck',
      '1 Sol Ring\n\nSideboard:\n1 Kaheera, the Orphanguard',
    );

    expect(deck.cards).toEqual([
      { name: 'Sol Ring', quantity: 1, section: 'main' },
      { name: 'Kaheera, the Orphanguard', quantity: 1, section: 'sideboard' },
    ]);
  });

  // The export marks no command zone. Inventing one would deal a card the player
  // never chose into their opening hand.
  it('marks no commander, because the export does not say', () => {
    const deck = extractTappedOutDeck('my-deck', '1 Arahbo, Roar of the World\n1 Sol Ring');
    expect(deck.cards.every((card) => card.section === 'main')).toBe(true);
  });

  // A private or missing deck answers with a web page rather than a list, and a
  // page full of markup would otherwise import as a heap of nonsense "cards".
  it.each([
    ['a doctype', '<!DOCTYPE html>\n<html><body>Not found</body></html>'],
    ['an html tag', '<html lang="en"><body>Login required</body></html>'],
  ])('rejects a response that is really a web page (%s)', (_label, body) => {
    expect(() => extractTappedOutDeck('my-deck', body)).toThrow(/couldn't be read/i);
  });

  it('throws when the export holds no cards', () => {
    expect(() => extractTappedOutDeck('my-deck', '   \n\n')).toThrow(/no cards we can import/i);
  });
});

describe('extractTappedOutDeck on a real export', () => {
  // Per-test, so a throw reports as a failure rather than as an empty suite.
  const deck = () => extractTappedOutDeck('05-06-24-here-kitty-kitty', realExport);

  it('imports the whole list', () => {
    expect(deck().cards.length).toBeGreaterThan(80);
  });

  it('picks up the sideboard the export declares', () => {
    expect(deck().cards).toContainEqual({
      name: 'Kaheera, the Orphanguard',
      quantity: 1,
      section: 'sideboard',
    });
  });

  it('round-trips back through the decklist parser', () => {
    const parsed = parseDecklistWithStats(toDecklistText(deck()));
    const mainCount = deck().cards.filter((card) => card.section === 'main').length;

    expect(parsed.items).toHaveLength(mainCount);
    expect(parsed.excluded.map((item) => item.name)).toEqual(['Kaheera, the Orphanguard']);
  });
});

describe('deckNameFromSlug', () => {
  it('turns a slug into a readable name', () => {
    expect(deckNameFromSlug('here-kitty-kitty')).toBe('Here Kitty Kitty');
  });

  it('drops the date TappedOut prefixes onto a slug', () => {
    expect(deckNameFromSlug('05-06-24-here-kitty-kitty')).toBe('Here Kitty Kitty');
  });

  // Only a date-shaped prefix is dropped, so a deck that really starts with a
  // number keeps it.
  it('keeps a leading number that is not a date', () => {
    expect(deckNameFromSlug('117-of-the-time-it-works')).toBe('117 Of The Time It Works');
  });

  it('falls back when the slug carries no words', () => {
    expect(deckNameFromSlug('---')).toBe('TappedOut deck');
  });
});
