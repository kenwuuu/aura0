import { describe, expect, it } from 'vitest';
import { parseDeckUrl, upstreamApiUrl } from './deckUrls';

describe('parseDeckUrl', () => {
  it('extracts the deck id from a deck page URL with a slug', () => {
    expect(parseDeckUrl('https://archidekt.com/decks/24569510/group_hugs')).toEqual({
      source: 'archidekt',
      deckId: '24569510',
    });
  });

  it.each([
    ['no slug', 'https://archidekt.com/decks/24569510'],
    ['trailing slash', 'https://archidekt.com/decks/24569510/'],
    ['www subdomain', 'https://www.archidekt.com/decks/24569510/group_hugs'],
    ['http scheme', 'http://archidekt.com/decks/24569510'],
    ['no scheme', 'archidekt.com/decks/24569510/group_hugs'],
    ['query string', 'https://archidekt.com/decks/24569510/group_hugs?tab=view'],
    ['fragment', 'https://archidekt.com/decks/24569510/group_hugs#cards'],
    ['the API URL itself', 'https://archidekt.com/api/decks/24569510/'],
    ['surrounding whitespace', '  https://archidekt.com/decks/24569510/group_hugs  '],
  ])('accepts %s', (_label, input) => {
    expect(parseDeckUrl(input)).toEqual({ source: 'archidekt', deckId: '24569510' });
  });

  it.each([
    ['a lookalike domain', 'https://evilarchidekt.com/decks/24569510'],
    ['a lookalike of TappedOut', 'https://nottappedout.net/mtg-decks/my-deck/'],
    ['a site we do not support', 'https://moxfield.com/decks/abc123'],
    ['an Archidekt page that is not a deck', 'https://archidekt.com/search/decks'],
    ['a TappedOut page that is not a deck', 'https://tappedout.net/users/someone/'],
    ['a non-numeric Archidekt deck id', 'https://archidekt.com/decks/not-a-number'],
    ['empty input', ''],
    ['not a URL at all', 'Sol Ring'],
  ])('rejects %s', (_label, input) => {
    expect(parseDeckUrl(input)).toBeNull();
  });

  it.each([
    ['a deck page', 'https://tappedout.net/mtg-decks/05-06-24-here-kitty-kitty/'],
    ['no trailing slash', 'https://tappedout.net/mtg-decks/05-06-24-here-kitty-kitty'],
    ['the txt export URL', 'https://tappedout.net/mtg-decks/05-06-24-here-kitty-kitty/?fmt=txt'],
    ['www subdomain', 'https://www.tappedout.net/mtg-decks/05-06-24-here-kitty-kitty/'],
    ['no scheme', 'tappedout.net/mtg-decks/05-06-24-here-kitty-kitty/'],
  ])('recognizes a TappedOut deck link (%s)', (_label, input) => {
    expect(parseDeckUrl(input)).toEqual({
      source: 'tappedout',
      deckId: '05-06-24-here-kitty-kitty',
    });
  });

  it.each([
    ['a deck page', 'https://www.mtggoldfish.com/deck/5778970'],
    ['the download URL', 'https://www.mtggoldfish.com/deck/download/5778970'],
    ['no www', 'https://mtggoldfish.com/deck/5778970'],
    ['a trailing slug', 'https://www.mtggoldfish.com/deck/5778970#paper'],
  ])('recognizes an MTGGoldfish deck link (%s)', (_label, input) => {
    expect(parseDeckUrl(input)).toEqual({ source: 'mtggoldfish', deckId: '5778970' });
  });

  it.each([
    ['an MTGGoldfish page that is not a deck', 'https://www.mtggoldfish.com/metagame/standard'],
    ['an MTGGoldfish archetype', 'https://www.mtggoldfish.com/archetype/standard-mono-red'],
    ['an MTGGoldfish lookalike', 'https://notmtggoldfish.com/deck/5778970'],
  ])('rejects %s', (_label, input) => {
    expect(parseDeckUrl(input)).toBeNull();
  });

  it('recognizes an EDHREC deck preview', () => {
    expect(parseDeckUrl('https://edhrec.com/deckpreview/cwQ2LtjwVkLxbpcC8vWWHg')).toEqual({
      source: 'edhrec',
      deckId: 'cwQ2LtjwVkLxbpcC8vWWHg',
    });
  });

  // The hash is base64url, so - and _ have to survive.
  it('recognizes a deck preview hash containing - and _', () => {
    expect(parseDeckUrl('https://edhrec.com/deckpreview/zUjqocRu97PGV2G-R73wAg')).toEqual({
      source: 'edhrec',
      deckId: 'zUjqocRu97PGV2G-R73wAg',
    });
  });

  // Both the average-deck page and the commander page a player is more likely to
  // be looking at resolve to the same average deck.
  it.each([
    ['the average-decks page', 'https://edhrec.com/average-decks/gluntch-the-bestower'],
    ['the commander page', 'https://edhrec.com/commanders/gluntch-the-bestower'],
  ])('recognizes %s as an EDHREC average deck', (_label, input) => {
    expect(parseDeckUrl(input)).toEqual({
      source: 'edhrec-average',
      deckId: 'gluntch-the-bestower',
    });
  });

  it.each([
    ['an EDHREC page that is not a deck', 'https://edhrec.com/articles/some-article'],
    ['an EDHREC lookalike', 'https://notedhrec.com/deckpreview/abc'],
  ])('rejects %s', (_label, input) => {
    expect(parseDeckUrl(input)).toBeNull();
  });

  // The slug becomes part of a URL we then request, so it must not be able to
  // carry path separators or traversal out of /mtg-decks/.
  it('does not let a slug escape its path', () => {
    expect(parseDeckUrl('https://tappedout.net/mtg-decks/../../admin/')).toBeNull();
    expect(parseDeckUrl('https://tappedout.net/mtg-decks/a/b/c/')).toEqual({
      source: 'tappedout',
      deckId: 'a',
    });
  });

  // The textarea this feeds holds decklists far more often than URLs, so the
  // parser has to stay silent on ordinary lists rather than half-matching one.
  it('rejects a pasted decklist, even one that mentions the site', () => {
    expect(parseDeckUrl('1 Sol Ring\n1 Gluntch, the Bestower')).toBeNull();
    expect(parseDeckUrl('// from https://archidekt.com/decks/24569510\n1 Sol Ring')).toBeNull();
  });
});

describe('upstreamApiUrl', () => {
  it('builds the Archidekt API URL from the deck id', () => {
    expect(upstreamApiUrl({ source: 'archidekt', deckId: '24569510' })).toBe(
      'https://archidekt.com/api/decks/24569510/',
    );
  });

  it('builds the EDHREC deck preview page URL from the hash', () => {
    expect(upstreamApiUrl({ source: 'edhrec', deckId: 'cwQ2LtjwVkLxbpcC8vWWHg' })).toBe(
      'https://edhrec.com/deckpreview/cwQ2LtjwVkLxbpcC8vWWHg',
    );
  });

  it('builds the EDHREC average-deck JSON URL from the slug', () => {
    expect(upstreamApiUrl({ source: 'edhrec-average', deckId: 'gluntch-the-bestower' })).toBe(
      'https://json.edhrec.com/pages/average-decks/gluntch-the-bestower.json',
    );
  });

  it('builds the MTGGoldfish download URL from the deck id', () => {
    expect(upstreamApiUrl({ source: 'mtggoldfish', deckId: '5778970' })).toBe(
      'https://www.mtggoldfish.com/deck/download/5778970',
    );
  });

  it('builds the TappedOut plain-text export URL from the slug', () => {
    expect(upstreamApiUrl({ source: 'tappedout', deckId: 'here-kitty-kitty' })).toBe(
      'https://tappedout.net/mtg-decks/here-kitty-kitty/?fmt=txt',
    );
  });
});
