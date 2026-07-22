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
    ['a different site', 'https://moxfield.com/decks/abc123'],
    ['an Archidekt page that is not a deck', 'https://archidekt.com/search/decks'],
    ['a non-numeric deck id', 'https://archidekt.com/decks/not-a-number'],
    ['empty input', ''],
    ['not a URL at all', 'Sol Ring'],
  ])('rejects %s', (_label, input) => {
    expect(parseDeckUrl(input)).toBeNull();
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
});
