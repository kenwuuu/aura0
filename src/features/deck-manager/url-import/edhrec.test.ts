import { describe, expect, it } from 'vitest';
import { extractEdhrecAverageDeck, extractEdhrecDeckPreview } from './edhrec';
import { toDecklistText } from './importedDeck';
import { parseDecklistWithStats } from '@/features/deck-manager/DeckListParser';
// Captured from edhrec.com/deckpreview/cwQ2LtjwVkLxbpcC8vWWHg (trimmed to the
// script tag the adapter reads) and json.edhrec.com/pages/average-decks/*.
import deckPreviewPage from './__fixtures__/edhrecDeckPreview.html?raw';
import averageDeck from './__fixtures__/edhrecAverageDeck.json';
import averagePartners from './__fixtures__/edhrecAveragePartners.json';

/** Wrap deck data the way a Next.js page ships it. */
function pageWith(data: unknown): string {
  return `<!doctype html><html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(
    { props: { pageProps: { data } } },
  )}</script></body></html>`;
}

const sections = (deck: { cards: Array<{ name: string; section: string }> }, section: string) =>
  deck.cards.filter((card) => card.section === section).map((card) => card.name);

describe('extractEdhrecDeckPreview', () => {
  it('reads the decklist and marks the commander EDHREC names', () => {
    const deck = extractEdhrecDeckPreview(
      pageWith({
        header: 'Deck with Gluntch, the Bestower',
        commanders: ['Gluntch, the Bestower'],
        deck: ['1 Gluntch, the Bestower', '1 Sol Ring', '12 Forest'],
      }),
    );

    expect(deck.name).toBe('Deck with Gluntch, the Bestower');
    expect(deck.source).toBe('edhrec');
    expect(deck.cards).toEqual([
      { name: 'Gluntch, the Bestower', quantity: 1, section: 'commander' },
      { name: 'Sol Ring', quantity: 1, section: 'main' },
      { name: 'Forest', quantity: 12, section: 'main' },
    ]);
  });

  // EDHREC lists commanders first today. Matching on name rather than position
  // means that staying true is not something the import depends on.
  it('marks the commander wherever it sits in the list', () => {
    const deck = extractEdhrecDeckPreview(
      pageWith({
        commanders: ['Gluntch, the Bestower'],
        deck: ['1 Sol Ring', '1 Gluntch, the Bestower', '1 Forest'],
      }),
    );

    expect(sections(deck, 'commander')).toEqual(['Gluntch, the Bestower']);
  });

  it('marks both commanders of a partner deck', () => {
    const deck = extractEdhrecDeckPreview(
      pageWith({
        commanders: ['Thrasios, Triton Hero', 'Tymna the Weaver'],
        deck: ['1 Thrasios, Triton Hero', '1 Tymna the Weaver', '1 Sol Ring'],
      }),
    );

    expect(sections(deck, 'commander')).toEqual(['Thrasios, Triton Hero', 'Tymna the Weaver']);
  });

  it.each([
    ['a page with no data script', '<html><body>Nothing here</body></html>'],
    ['a script holding invalid JSON', '<script id="__NEXT_DATA__">{ not json</script>'],
    ['a page whose data has no deck', pageWith({ header: 'Empty', commanders: [] })],
  ])('rejects %s', (_label, html) => {
    expect(() => extractEdhrecDeckPreview(html)).toThrow(/EDHREC/i);
  });
});

// Extracted inside each test rather than in the describe body: a parser that
// throws during collection would report as "no tests" — an empty suite reads as
// success at a glance, where a failing test cannot be mistaken for one.
describe('extractEdhrecDeckPreview on a real page', () => {
  const realDeck = () => extractEdhrecDeckPreview(deckPreviewPage);

  it('reads the deck name', () => {
    expect(realDeck().name).toBe('Deck with Captain America, Team Leader');
  });

  it('imports exactly 100 cards', () => {
    expect(realDeck().cards.reduce((sum, card) => sum + card.quantity, 0)).toBe(100);
  });

  it('puts the commander in the command zone, and only the commander', () => {
    expect(sections(realDeck(), 'commander')).toEqual(['Captain America, Team Leader']);
  });

  it('round-trips back through the decklist parser', () => {
    const parsed = parseDecklistWithStats(toDecklistText(realDeck()));
    expect(parsed.items.filter((item) => item.commander).map((item) => item.name)).toEqual([
      'Captain America, Team Leader',
    ]);
    expect(parsed.items.reduce((sum, item) => sum + item.count, 0)).toBe(100);
  });
});

describe('extractEdhrecAverageDeck', () => {
  it('reads a real average deck and marks its commander', () => {
    const deck = extractEdhrecAverageDeck(averageDeck);

    expect(deck.source).toBe('edhrec-average');
    expect(deck.name).toBe('Average Deck for Gluntch, the Bestower');
    expect(deck.cards.reduce((sum, card) => sum + card.quantity, 0)).toBe(100);
    expect(sections(deck, 'commander')).toEqual(['Gluntch, the Bestower']);
  });

  // The commander here comes from the card the page is *about*, not from a
  // `commanders` array — and for partners that is two names.
  it('marks both partners of a partner average deck', () => {
    const deck = extractEdhrecAverageDeck(averagePartners);

    expect(sections(deck, 'commander')).toEqual([
      'Thrasios, Triton Hero',
      'Tymna the Weaver',
    ]);
  });

  // A double-faced commander and a partner pair both put two names on the card,
  // and only the name that matches a real deck line may be marked — otherwise a
  // back face would be dealt into the opening hand as a second commander.
  //
  // The decklist parser reduces "A // B" to its front face, so the face names
  // are what actually has to match here — matching only the full name would
  // leave a double-faced commander sitting in the library.
  it('marks a double-faced commander once, by its front face', () => {
    const deck = extractEdhrecAverageDeck({
      header: 'Average Deck for Brallin, Skyshark Rider',
      deck: ['1 Jace, Vryn\'s Prodigy // Jace, Telepath Unbound', '1 Sol Ring'],
      container: {
        json_dict: {
          card: {
            name: "Jace, Vryn's Prodigy // Jace, Telepath Unbound",
            names: ["Jace, Vryn's Prodigy", 'Jace, Telepath Unbound'],
          },
        },
      },
    });

    expect(sections(deck, 'commander')).toEqual(["Jace, Vryn's Prodigy"]);
  });

  it('throws when the document carries no decklist', () => {
    expect(() => extractEdhrecAverageDeck({ header: 'Nothing' })).toThrow(/no decklist/i);
  });
});
