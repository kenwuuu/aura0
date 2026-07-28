import { describe, it, expect } from 'vitest';
import { decklistTextForEditing } from './savedDeckText';
import { parseDecklist } from './DeckListParser';
import type { Card, SavedDeck } from '@/features/player/types';

/** A saved card. Only the fields a decklist can carry actually matter here. */
const card = (name: string | undefined, overrides: Partial<Card> = {}): Card =>
  ({ id: `id-${name}-${Math.random()}`, name, ...overrides }) as Card;

/** `count` copies of a card, the way a saved deck really stores duplicates. */
const copies = (count: number, name: string, overrides: Partial<Card> = {}): Card[] =>
  Array.from({ length: count }, () => card(name, overrides));

const deck = (parts: Partial<SavedDeck>): SavedDeck =>
  ({
    metadata: { id: 'd1', name: 'Test', source: 'scryfall', cardCount: 0 },
    cards: [],
    ...parts,
  }) as SavedDeck;

describe('decklistTextForEditing', () => {
  it('reopens the list the deck was imported from, verbatim', () => {
    const original = 'Deck\n1 Sol Ring (ELD) 10\n4 Lightning Bolt';

    const text = decklistTextForEditing(
      // Cards that disagree with the text prove which one is the source of
      // truth: the saved text wins, printings and all.
      deck({ decklistText: original, cards: copies(1, 'Something Else') }),
    );

    expect(text).toBe(original);
  });

  it('falls back to the cards when the deck predates saved decklists', () => {
    const text = decklistTextForEditing(deck({ cards: copies(4, 'Lightning Bolt') }));

    expect(text).toBe('Deck\n4 Lightning Bolt');
  });

  it('treats a blank saved list as no list at all', () => {
    const text = decklistTextForEditing(
      deck({ decklistText: '   \n  ', cards: copies(1, 'Sol Ring') }),
    );

    expect(text).toBe('Deck\n1 Sol Ring');
  });

  it('counts duplicate cards back into quantities', () => {
    const text = decklistTextForEditing(
      deck({ cards: [...copies(20, 'Mountain'), ...copies(4, 'Lightning Bolt')] }),
    );

    expect(text).toBe('Deck\n20 Mountain\n4 Lightning Bolt');
  });

  it('puts commanders under a Commander header so they are drawn again', () => {
    const text = decklistTextForEditing(
      deck({
        cards: [...copies(1, 'Atraxa', { commander: true }), ...copies(2, 'Forest')],
      }),
    );

    expect(text).toBe('Commander\n1 Atraxa\n\nDeck\n2 Forest');
  });

  it('keeps the sideboard in its own section rather than folding it into the deck', () => {
    const text = decklistTextForEditing(
      deck({ cards: copies(1, 'Forest'), sideboard: copies(3, 'Pithing Needle') }),
    );

    expect(text).toBe('Deck\n1 Forest\n\nSideboard\n3 Pithing Needle');
  });

  it('drops a card with no name, having nothing to write and nothing to look up', () => {
    const text = decklistTextForEditing(
      deck({ cards: [card(undefined), ...copies(1, 'Sol Ring'), card('   ')] }),
    );

    expect(text).toBe('Deck\n1 Sol Ring');
  });

  // The whole point of the rebuild is that it goes back through the importer, so
  // what matters is not the string but that the parser reads it back unchanged.
  it('round-trips through the parser the importer will use', () => {
    const text = decklistTextForEditing(
      deck({
        cards: [
          ...copies(1, 'Atraxa, Praetors’ Voice', { commander: true }),
          ...copies(20, 'Forest'),
        ],
      }),
    );

    expect(parseDecklist(text)).toEqual([
      expect.objectContaining({
        count: 1,
        name: 'Atraxa, Praetors’ Voice',
        commander: true,
        section: 'commander',
      }),
      expect.objectContaining({ count: 20, name: 'Forest', section: 'main' }),
    ]);
  });
});
