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

  it('builds the TappedOut plain-text export URL from the slug', () => {
    expect(upstreamApiUrl({ source: 'tappedout', deckId: 'here-kitty-kitty' })).toBe(
      'https://tappedout.net/mtg-decks/here-kitty-kitty/?fmt=txt',
    );
  });
});
