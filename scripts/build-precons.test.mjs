import { describe, it, expect } from 'vitest';
import { slugify, parseFileName, extractColors, deckFromRows, parseCsvRows } from './build-precons.mjs';

describe('slugify', () => {
  it('kebab-cases, folds accents, and expands &', () => {
    expect(slugify('Breed Lethality Commander 2016')).toBe('breed-lethality-commander-2016');
    expect(slugify("Angels They're Just Like Us & Cooler")).toBe('angels-they-re-just-like-us-and-cooler');
    expect(slugify('Warhammer 40,000 Commander')).toBe('warhammer-40-000-commander');
  });
});

describe('parseFileName', () => {
  it('splits `<name> (<set> Precon Decklist)` on the paren group', () => {
    expect(parseFileName('Breed Lethality (Commander 2016 Precon Decklist).csv')).toEqual({
      name: 'Breed Lethality',
      set: 'Commander 2016',
    });
  });

  it('keeps a comma inside the deck name', () => {
    expect(
      parseFileName('Heads I Win, Tails You Lose (Secret Lair Commander 2021 Precon Decklist).csv'),
    ).toEqual({ name: 'Heads I Win, Tails You Lose', set: 'Secret Lair Commander 2021' });
  });
});

describe('extractColors', () => {
  it('parses the Python-list color identity into WUBRG order', () => {
    expect(extractColors("['B', 'G', 'W']")).toEqual(['W', 'B', 'G']);
    expect(extractColors('[]')).toEqual([]);
    expect(extractColors("['R', 'U']")).toEqual(['U', 'R']);
  });
});

// Minimal fixture exercising every rule: quoted-comma name, a commander row,
// a basic land with quantity > 1, a dropped token (empty boardType), and a
// dropped sideboard row.
const HEADER =
  'quantity,boardType,info.name,info.set,info.cn,info.scryfall_id,info.color_identity';
const CSV = [
  HEADER,
  '1.0,commanders,"Felothar, the Steadfast",tdc,4,id-felothar,"[\'W\', \'B\', \'G\']"',
  '1.0,mainboard,Sol Ring,tdc,105,id-solring,[]',
  '5.0,mainboard,Forest,tdc,110,id-forest,[]',
  ',,Bird,ttdc,2,id-bird,[]',
  '1.0,sideboard,Extra Card,tdc,200,id-extra,[]',
].join('\n');

describe('deckFromRows', () => {
  const { list, summary } = deckFromRows(parseCsvRows(CSV), 'Test Deck', 'Test Set');

  it('keeps only mainboard + commander rows (drops tokens and sideboard)', () => {
    expect(list.cards.map((c) => c.name)).toEqual([
      'Felothar, the Steadfast',
      'Sol Ring',
      'Forest',
    ]);
  });

  it('flags the commander row and parses integral quantities', () => {
    const felothar = list.cards.find((c) => c.name.startsWith('Felothar'));
    const forest = list.cards.find((c) => c.name === 'Forest');
    expect(felothar).toMatchObject({ commander: true, setCode: 'tdc', collectorNumber: '4' });
    expect(forest).toMatchObject({ commander: false, quantity: 5 });
  });

  it('sums quantity (not row count) for cardCount and unions commander colors', () => {
    expect(summary.cardCount).toBe(7); // 1 + 1 + 5
    expect(summary.colors).toEqual(['W', 'B', 'G']);
    expect(summary.commanderNames).toEqual(['Felothar, the Steadfast']);
    expect(summary.setCode).toBe('tdc');
  });
});
