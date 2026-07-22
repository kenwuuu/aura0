import { describe, expect, it } from 'vitest';
import {
  deckNameFromContentDisposition,
  extractMtgGoldfishDeck,
  splitOnBlankLine,
} from './mtggoldfish';
import { toDecklistText } from './importedDeck';
import { parseDecklistWithStats } from '@/features/deck-manager/DeckListParser';
// Captured from mtggoldfish.com/deck/download/7264010 and /5778970.
import standardExport from './__fixtures__/mtggoldfishStandard.txt?raw';
import commanderExport from './__fixtures__/mtggoldfishCommander.txt?raw';

const cardsIn = (deck: { cards: Array<{ quantity: number; section: string }> }, section: string) =>
  deck.cards.filter((card) => card.section === section).reduce((sum, c) => sum + c.quantity, 0);

describe('splitOnBlankLine', () => {
  it('splits deck from sideboard at the blank line', () => {
    expect(splitOnBlankLine('4 Sol Ring\n\n2 Pithing Needle')).toEqual({
      main: '4 Sol Ring',
      sideboard: '2 Pithing Needle',
    });
  });

  it('treats a list with no blank line as all deck', () => {
    expect(splitOnBlankLine('4 Sol Ring\n2 Forest')).toEqual({
      main: '4 Sol Ring\n2 Forest',
      sideboard: '',
    });
  });

  // Otherwise a leading newline would push the whole deck into the sideboard.
  it('ignores blank lines before the first card', () => {
    expect(splitOnBlankLine('\n\n4 Sol Ring\n2 Forest')).toEqual({
      main: '\n\n4 Sol Ring\n2 Forest',
      sideboard: '',
    });
  });
});

describe('extractMtgGoldfishDeck', () => {
  it('reads the deck and its blank-line-separated sideboard', () => {
    const deck = extractMtgGoldfishDeck('4 Sol Ring\n2 Forest\n\n2 Pithing Needle', 'My Deck');

    expect(deck.name).toBe('My Deck');
    expect(deck.source).toBe('mtggoldfish');
    expect(deck.cards).toEqual([
      { name: 'Sol Ring', quantity: 4, section: 'main' },
      { name: 'Forest', quantity: 2, section: 'main' },
      { name: 'Pithing Needle', quantity: 2, section: 'sideboard' },
    ]);
  });

  it('marks no commander, because the export does not say', () => {
    const deck = extractMtgGoldfishDeck('1 Kozilek, Butcher of Truth\n1 Sol Ring', 'Voltron');
    expect(deck.cards.every((card) => card.section === 'main')).toBe(true);
  });

  it.each([
    ['a doctype', '<!DOCTYPE html>\n<html><body>Gone</body></html>'],
    ['an html tag', '<html lang="en"><body>Log in</body></html>'],
  ])('rejects a download that is really a web page (%s)', (_label, body) => {
    expect(() => extractMtgGoldfishDeck(body, 'x')).toThrow(/couldn't be read/i);
  });

  it('throws when the export holds no cards', () => {
    expect(() => extractMtgGoldfishDeck('  \n\n  ', 'x')).toThrow(/no cards we can import/i);
  });
});

/**
 * The blank line is the only thing marking MTGGoldfish's sideboard — there is no
 * header. Getting it wrong doesn't fail loudly: it quietly imports a 60-card
 * deck as 75 cards, which is why these assert exact counts against real exports.
 */
describe('extractMtgGoldfishDeck on real exports', () => {
  it('splits a Standard deck into exactly 60 and 15', () => {
    const deck = extractMtgGoldfishDeck(standardExport, 'Mite-y Green');

    expect(cardsIn(deck, 'main')).toBe(60);
    expect(cardsIn(deck, 'sideboard')).toBe(15);
  });

  it('reads a Commander deck as 100 cards with no sideboard', () => {
    const deck = extractMtgGoldfishDeck(commanderExport, 'Kozilek Voltron');

    expect(cardsIn(deck, 'main')).toBe(100);
    expect(cardsIn(deck, 'sideboard')).toBe(0);
  });

  it('round-trips the Standard deck back through the decklist parser', () => {
    const deck = extractMtgGoldfishDeck(standardExport, 'Mite-y Green');
    const parsed = parseDecklistWithStats(toDecklistText(deck));

    expect(parsed.items.reduce((sum, item) => sum + item.count, 0)).toBe(60);
    expect(parsed.excluded.reduce((sum, item) => sum + item.count, 0)).toBe(15);
  });
});

describe('deckNameFromContentDisposition', () => {
  it('reads the name from the RFC 5987 filename*', () => {
    expect(
      deckNameFromContentDisposition(
        "attachment; filename=\"Deck - $50 Kozilek Voltron.txt\"; filename*=UTF-8''Deck%20-%20%2450%20Kozilek%20Voltron.txt",
      ),
    ).toBe('$50 Kozilek Voltron');
  });

  it('falls back to the plain filename parameter', () => {
    expect(deckNameFromContentDisposition('attachment; filename="Deck - Mite-y Green.txt"')).toBe(
      'Mite-y Green',
    );
  });

  it.each([
    ['a missing header', null],
    ['a header with no filename', 'attachment'],
    ['a filename that is only the prefix', 'attachment; filename="Deck - .txt"'],
  ])('falls back to a placeholder for %s', (_label, header) => {
    expect(deckNameFromContentDisposition(header)).toBe('MTGGoldfish deck');
  });
});
