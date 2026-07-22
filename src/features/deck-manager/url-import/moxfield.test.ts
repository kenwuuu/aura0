import { describe, expect, it } from 'vitest';
import { extractMoxfieldDeck, MoxfieldDeckResponse } from './moxfield';
import { toDecklistText } from './importedDeck';

/**
 * Shapes here mirror a real `api.moxfield.com/v3/decks/all/<id>` response:
 * boards keyed by name, each holding `cards` keyed by *deck entry* id (not card
 * id), each entry carrying `quantity` and a nested `card.name`.
 */
function deck(boards: MoxfieldDeckResponse['boards']): MoxfieldDeckResponse {
  return { name: 'Test Deck', boards };
}

function board(...cards: Array<[string, number]>) {
  return {
    cards: Object.fromEntries(
      cards.map(([name, quantity], index) => [`entry${index}`, { quantity, card: { name } }]),
    ),
  };
}

describe('extractMoxfieldDeck', () => {
  it('maps each board to the zone Aura understands', () => {
    const result = extractMoxfieldDeck(
      deck({
        mainboard: board(['Sol Ring', 1], ['Forest', 20]),
        commanders: board(['Winota, Joiner of Forces', 1]),
        sideboard: board(['Deafening Silence', 1]),
        maybeboard: board(['Mana Crypt', 1]),
      }),
    );

    expect(result.source).toBe('moxfield');
    expect(result.name).toBe('Test Deck');
    expect(result.cards).toEqual(
      expect.arrayContaining([
        { name: 'Sol Ring', quantity: 1, section: 'main' },
        { name: 'Forest', quantity: 20, section: 'main' },
        { name: 'Winota, Joiner of Forces', quantity: 1, section: 'commander' },
        { name: 'Deafening Silence', quantity: 1, section: 'sideboard' },
        { name: 'Mana Crypt', quantity: 1, section: 'maybeboard' },
      ]),
    );
  });

  /**
   * The reason this source is worth having: Moxfield states which card is the
   * commander, so the command zone survives the round trip through text instead
   * of being inferred from a category name.
   */
  it('renders commanders into the command zone, ahead of the deck', () => {
    const text = toDecklistText(
      extractMoxfieldDeck(
        deck({
          mainboard: board(['Sol Ring', 1]),
          commanders: board(['Winota, Joiner of Forces', 1]),
        }),
      ),
    );

    expect(text).toBe('Commander\n1 Winota, Joiner of Forces\n\nDeck\n1 Sol Ring');
  });

  it('keeps the full "A // B" name of a double-faced card', () => {
    const result = extractMoxfieldDeck(
      deck({ mainboard: board(['Needleverge Pathway // Pillarverge Pathway', 1]) }),
    );

    expect(result.cards[0].name).toBe('Needleverge Pathway // Pillarverge Pathway');
  });

  it('treats a companion as a sideboard card, not a shortlist entry', () => {
    const result = extractMoxfieldDeck(
      deck({ mainboard: board(['Sol Ring', 1]), companions: board(['Lurrus of the Dream-Den', 1]) }),
    );

    expect(result.cards).toContainEqual({
      name: 'Lurrus of the Dream-Den',
      quantity: 1,
      section: 'sideboard',
    });
  });

  it('puts the Oathbreaker signature spell in the command zone', () => {
    const result = extractMoxfieldDeck(
      deck({ mainboard: board(['Sol Ring', 1]), signatureSpells: board(['Brainstorm', 1]) }),
    );

    expect(result.cards).toContainEqual({ name: 'Brainstorm', quantity: 1, section: 'commander' });
  });

  /**
   * Aura builds tokens from the card data it already has. Importing a source's
   * token board would deal the player duplicates they never asked for.
   */
  it('ignores the token board', () => {
    const result = extractMoxfieldDeck(
      deck({ mainboard: board(['Sol Ring', 1]), tokens: board(['Treasure', 3]) }),
    );

    expect(result.cards).toEqual([{ name: 'Sol Ring', quantity: 1, section: 'main' }]);
  });

  /**
   * Moxfield adds boards as new formats appear. An unknown one must not reach
   * the opening hand, but must not vanish either — maybeboard is emitted and
   * then counted as excluded, so the import telemetry still sees it.
   */
  it('files an unrecognized board under the maybeboard rather than the deck', () => {
    const result = extractMoxfieldDeck(
      deck({ mainboard: board(['Sol Ring', 1]), someFutureBoard: board(['Mystery Card', 1]) }),
    );

    expect(result.cards).toContainEqual({
      name: 'Mystery Card',
      quantity: 1,
      section: 'maybeboard',
    });
  });

  it.each([
    ['no boards at all', deck({})],
    ['boards with no cards', deck({ mainboard: { cards: {} } })],
    ['a null board', deck({ mainboard: null })],
    ['entries with no card name', deck({ mainboard: { cards: { a: { quantity: 1, card: {} } } } })],
    [
      'a non-positive quantity',
      deck({ mainboard: { cards: { a: { quantity: 0, card: { name: 'Sol Ring' } } } } }),
    ],
  ])('reports %s as an error the player can act on', (_label, response) => {
    // A private or deleted deck arrives looking exactly like this. Returning an
    // empty deck would import silently and leave the player with nothing.
    expect(() => extractMoxfieldDeck(response)).toThrow(/no cards we can import/i);
  });

  it('falls back to a generic name when the deck has none', () => {
    const result = extractMoxfieldDeck({ boards: { mainboard: board(['Sol Ring', 1]) } });

    expect(result.name).toBe('Moxfield deck');
  });
});
