import { describe, expect, it } from 'vitest';
import { parseDecklist } from '../DeckListParser';
import { ImportedCard, ImportedDeck, printing, toDecklistText } from './importedDeck';

function deck(...cards: ImportedCard[]): ImportedDeck {
  return { name: 'Test Deck', source: 'moxfield', cards };
}

function main(name: string, extra: Partial<ImportedCard> = {}): ImportedCard {
  return { name, quantity: 1, section: 'main', ...extra };
}

describe('printing', () => {
  it('normalizes what a source gave into the two fields', () => {
    expect(printing('eld', '10')).toEqual({ setCode: 'eld', collectorNumber: '10' });
  });

  it('trims surrounding whitespace', () => {
    expect(printing(' eld ', ' 10 ')).toEqual({ setCode: 'eld', collectorNumber: '10' });
  });

  it.each([undefined, null, '', '   ', 42])('reads %p as no printing', (value) => {
    expect(printing(value, '10')).toEqual({});
  });

  it('keeps a set code that names no collector number', () => {
    expect(printing('spm', null)).toEqual({ setCode: 'spm' });
  });

  // A collector number identifies nothing without the set it belongs to, and the
  // bySet lookup needs both — so a lone one is dropped rather than carried.
  it('drops a collector number with no set code', () => {
    expect(printing(null, '10')).toEqual({});
  });
});

describe('toDecklistText printings', () => {
  it('writes the printing after the card name', () => {
    const text = toDecklistText(deck(main('Sol Ring', { setCode: 'eld', collectorNumber: '10' })));

    expect(text).toBe('Deck\n1 Sol Ring (eld) 10');
  });

  it('writes the set code alone when there is no collector number', () => {
    expect(toDecklistText(deck(main('Spider-Punk', { setCode: 'spm' })))).toBe(
      'Deck\n1 Spider-Punk (spm)',
    );
  });

  it('writes a bare line for a card with no printing', () => {
    expect(toDecklistText(deck(main('Sol Ring')))).toBe('Deck\n1 Sol Ring');
  });

  /**
   * A printing the parser cannot read back is worse than no printing: the suffix
   * does not get dropped on the way back, it stays welded to the card's name and
   * takes the name lookup down with it. So the emitter drops it instead.
   */
  describe('printings the format cannot carry', () => {
    it('omits a set code too long to read back as one', () => {
      expect(
        toDecklistText(deck(main('Sol Ring', { setCode: 'longsetcode', collectorNumber: '10' }))),
      ).toBe('Deck\n1 Sol Ring');
    });

    it('omits a collector number that would read as an annotation', () => {
      expect(
        toDecklistText(deck(main('Sol Ring', { setCode: 'eld', collectorNumber: '[Ramp]' }))),
      ).toBe('Deck\n1 Sol Ring');
    });
  });
});

/**
 * The contract that makes URL imports worth anything: text is the only channel
 * between an adapter and the card lookup, so whatever a source told us about a
 * printing has to survive being written down and read back. Asserting on the
 * emitter alone would pass happily while the parser read the line differently.
 */
describe('round trip through the text format', () => {
  it.each([
    ['a plain printing', main('Sol Ring', { setCode: 'eld', collectorNumber: '10' })],
    ['a four-letter set code', main('Command Beacon', { setCode: 'plst', collectorNumber: 'C15-56' })],
    ['an alphanumeric collector number', main('Zagoth Triome', { setCode: 'piko', collectorNumber: '259p' })],
    ['a set code with a digit', main('Aether Vial', { setCode: '2x2', collectorNumber: '391' })],
    ['a card whose own name has parentheses', main('B.F.M. (Big Furry Monster)', { setCode: 'unh', collectorNumber: '28' })],
  ])('survives %s', (_label, card) => {
    const [parsed] = parseDecklist(toDecklistText(deck(card)));

    expect(parsed).toEqual(
      expect.objectContaining({
        name: card.name,
        setCode: card.setCode,
        collectorNumber: card.collectorNumber,
      }),
    );
  });

  it('leaves the name intact when a printing was dropped as unreadable', () => {
    const card = main('Sol Ring', { setCode: 'longsetcode', collectorNumber: '10' });
    const [parsed] = parseDecklist(toDecklistText(deck(card)));

    expect(parsed).toEqual({ count: 1, name: 'Sol Ring', tags: ['deck'], section: 'main' });
  });

  it('keeps a double-faced name whole in the text, and fronts it on the way back', () => {
    const card = main('Bala Ged Recovery // Bala Ged Sanctuary', {
      setCode: 'plst',
      collectorNumber: 'ZNR-180',
    });

    const text = toDecklistText(deck(card));
    expect(text).toContain('Bala Ged Recovery // Bala Ged Sanctuary (plst) ZNR-180');

    // The parser reduces it to the front face, which is what the card API indexes.
    expect(parseDecklist(text)[0]).toEqual(
      expect.objectContaining({
        name: 'Bala Ged Recovery',
        setCode: 'plst',
        collectorNumber: 'ZNR-180',
      }),
    );
  });
});
