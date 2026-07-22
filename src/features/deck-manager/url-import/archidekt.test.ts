import { describe, expect, it } from 'vitest';
import { ArchidektDeckResponse, extractArchidektDeck } from './archidekt';
import { toDecklistText } from './importedDeck';
import { parseDecklistWithStats } from '@/features/deck-manager/DeckListParser';
import realDeck from './__fixtures__/archidektDeck.json';

/** Build a response with one category list and the given cards. */
function deckResponse(
  cards: Array<{ name: string; quantity?: number; categories?: string[] }>,
  categories: Array<{ name: string; includedInDeck: boolean }> = [],
): ArchidektDeckResponse {
  return {
    name: 'Test Deck',
    categories,
    cards: cards.map((card) => ({
      quantity: card.quantity ?? 1,
      categories: card.categories ?? [],
      card: { oracleCard: { name: card.name } },
    })),
  };
}

describe('extractArchidektDeck', () => {
  it('reads the deck name and card quantities', () => {
    const deck = extractArchidektDeck(
      deckResponse([
        { name: 'Sol Ring' },
        { name: 'Forest', quantity: 12 },
      ]),
    );

    expect(deck.name).toBe('Test Deck');
    expect(deck.source).toBe('archidekt');
    expect(deck.cards).toEqual([
      { name: 'Sol Ring', quantity: 1, section: 'main' },
      { name: 'Forest', quantity: 12, section: 'main' },
    ]);
  });

  it('routes cards in a Commander category to the command zone', () => {
    const deck = extractArchidektDeck(
      deckResponse([
        { name: 'Gluntch, the Bestower', categories: ['Commander'] },
        { name: 'Sol Ring', categories: ['Ramp'] },
      ]),
    );

    expect(deck.cards).toContainEqual({
      name: 'Gluntch, the Bestower',
      quantity: 1,
      section: 'commander',
    });
    expect(deck.cards).toContainEqual({ name: 'Sol Ring', quantity: 1, section: 'main' });
  });

  // `includedInDeck: false` is the only signal for a maybeboard — the category
  // names are free text, so a deck can call it anything.
  it('treats categories excluded from the deck as a maybeboard', () => {
    const deck = extractArchidektDeck(
      deckResponse(
        [
          { name: 'Sol Ring', categories: ['Ramp'] },
          { name: 'Mana Crypt', categories: ['Thinking about it'] },
        ],
        [
          { name: 'Ramp', includedInDeck: true },
          { name: 'Thinking about it', includedInDeck: false },
        ],
      ),
    );

    expect(deck.cards).toContainEqual({ name: 'Mana Crypt', quantity: 1, section: 'maybeboard' });
  });

  it('maps an excluded Sideboard category to the sideboard, not the maybeboard', () => {
    const deck = extractArchidektDeck(
      deckResponse(
        [{ name: 'Pithing Needle', categories: ['Sideboard'] }],
        [{ name: 'Sideboard', includedInDeck: false }],
      ),
    );

    expect(deck.cards).toEqual([
      { name: 'Pithing Needle', quantity: 1, section: 'sideboard' },
    ]);
  });

  // Being set aside has to outrank the commander tag: a commander dealt from the
  // maybeboard would land in the player's opening hand.
  it('keeps an excluded card out of the command zone even if tagged Commander', () => {
    const deck = extractArchidektDeck(
      deckResponse(
        [{ name: 'Gluntch, the Bestower', categories: ['Maybeboard', 'Commander'] }],
        [{ name: 'Maybeboard', includedInDeck: false }],
      ),
    );

    expect(deck.cards[0].section).toBe('maybeboard');
  });

  it('skips custom cards that carry no oracle card', () => {
    const response: ArchidektDeckResponse = {
      name: 'Test Deck',
      cards: [
        { quantity: 1, categories: [], card: { oracleCard: null } },
        { quantity: 1, categories: [], card: { oracleCard: { name: 'Sol Ring' } } },
      ],
    };

    expect(extractArchidektDeck(response).cards).toEqual([
      { name: 'Sol Ring', quantity: 1, section: 'main' },
    ]);
  });

  it.each([
    ['an empty card list', { name: 'Empty', cards: [] }],
    ['a missing card list', { name: 'Private' }],
    ['only unusable entries', { name: 'Custom', cards: [{ quantity: 1, card: null }] }],
  ])('throws on %s', (_label, response) => {
    expect(() => extractArchidektDeck(response as ArchidektDeckResponse)).toThrow(
      /no cards we can import/i,
    );
  });

  it('falls back to a placeholder when the deck is unnamed', () => {
    const response = deckResponse([{ name: 'Sol Ring' }]);
    response.name = '   ';
    expect(extractArchidektDeck(response).name).toBe('Archidekt deck');
  });
});

describe('extractArchidektDeck on a real API response', () => {
  // Captured from archidekt.com/api/decks/24569510/ and trimmed to seven cards.
  // Its job is to fail loudly if the undocumented response shape changes.
  //
  // Extracted per-test rather than in the describe body: an extractor that threw
  // during collection would report as "no tests", and an empty suite reads as
  // success at a glance.
  const deck = () => extractArchidektDeck(realDeck as ArchidektDeckResponse);

  it('reads the deck name', () => {
    expect(deck().name).toBe('Group hugs');
  });

  it('finds the commander', () => {
    const commanders = deck().cards.filter((card) => card.section === 'commander');
    expect(commanders).toEqual([
      { name: 'Gluntch, the Bestower', quantity: 1, section: 'commander' },
    ]);
  });

  it('keeps the full "A // B" name for double-faced cards', () => {
    expect(deck().cards.map((card) => card.name)).toContain(
      'Bala Ged Recovery // Bala Ged Sanctuary',
    );
  });
});

/**
 * The round trip is the contract that matters: URL imports reach the card lookup
 * through the same text parser as a pasted list, so anything this renders has to
 * parse back to the sections it came from.
 */
describe('toDecklistText round trip through the decklist parser', () => {
  it('preserves the command zone, deck, and sideboard', () => {
    const deck = extractArchidektDeck(
      deckResponse(
        [
          { name: 'Gluntch, the Bestower', categories: ['Commander'] },
          { name: 'Sol Ring', categories: ['Ramp'] },
          { name: 'Forest', quantity: 12, categories: ['Land'] },
          { name: 'Pithing Needle', categories: ['Sideboard'] },
          { name: 'Mana Crypt', categories: ['Maybe'] },
        ],
        [
          { name: 'Sideboard', includedInDeck: false },
          { name: 'Maybe', includedInDeck: false },
        ],
      ),
    );

    const parsed = parseDecklistWithStats(toDecklistText(deck));

    expect(parsed.items.filter((item) => item.commander).map((item) => item.name)).toEqual([
      'Gluntch, the Bestower',
    ]);
    expect(parsed.items.filter((item) => !item.commander).map((item) => item.name)).toEqual([
      'Sol Ring',
      'Forest',
    ]);
    expect(parsed.items.find((item) => item.name === 'Forest')?.count).toBe(12);
    expect(parsed.excluded.map((item) => item.name)).toEqual(['Pithing Needle', 'Mana Crypt']);
  });

  // Every line carries a quantity precisely so this can't happen: the parser
  // classifies a leading digit as a card before it tries to match a header.
  it('does not let a card named like a section header become one', () => {
    const deck = extractArchidektDeck(
      deckResponse([
        { name: 'Counters' },
        { name: 'Lands' },
        { name: 'Commander' },
        { name: 'Sideboard' },
      ]),
    );

    const parsed = parseDecklistWithStats(toDecklistText(deck));

    expect(parsed.items.map((item) => item.name)).toEqual([
      'Counters',
      'Lands',
      'Commander',
      'Sideboard',
    ]);
    expect(parsed.excluded).toEqual([]);
  });

  it('omits sections that have no cards', () => {
    const deck = extractArchidektDeck(deckResponse([{ name: 'Sol Ring' }]));
    expect(toDecklistText(deck)).toBe('Deck\n1 Sol Ring');
  });
});
