import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { parseDecklistWithStats } from './DeckListParser';

/**
 * Regression tests against real deck lists players actually pasted, exported from
 * PostHog into tests/fixtures/deck-imports/ (see scripts/export-deck-import-corpus.py).
 *
 * These exist because the parser's real failures all came from formats nobody
 * would think to write by hand — a commander header in curly quotes, a command
 * zone with no blank line to close it, a sideboard header with padding under it.
 * Hand-written fixtures kept passing while ~9% of live imports dumped the
 * player's entire deck into their opening hand. The assertions below are
 * therefore invariants over *every* list in the corpus, not golden outputs: they
 * must hold for formats we haven't seen yet, which is the whole point.
 */

const FIXTURES = ['illegal-size-imports.txt', 'commander-section-imports.txt'];

// Labels the parser treats as section headers. If one of these ever comes back
// as a *card*, a header stopped being recognized and is being imported.
const SECTION_LABELS = new Set([
  'commander', 'commanders', 'command zone', 'deck', 'decklist', 'main',
  'maindeck', 'main deck', 'mainboard', 'sideboard', 'side board', 'maybeboard',
  'maybe board', 'companion', 'tokens', 'token', 'considering', 'wishlist',
]);

type Deck = { label: string; text: string };

function loadCorpus(fixture: string): Deck[] {
  const file = path.join(process.cwd(), 'tests/fixtures/deck-imports', fixture);
  const raw = readFileSync(file, 'utf8');

  // Deck bodies contain blank lines, so blocks are delimited by the header line.
  const marks = [...raw.matchAll(/^===== (DECK \d+) \|.*=====$/gm)];
  return marks.map((mark, i) => ({
    label: `${fixture} ${mark[1]}`,
    text: raw
      .slice(mark.index! + mark[0].length + 1, i + 1 < marks.length ? marks[i + 1].index! : raw.length)
      .replace(/\n$/, ''),
  }));
}

/** Strip the decoration a header can carry, so "\"Commander\"" reads as a label. */
function asLabel(name: string): string {
  return name
    .trim()
    .replace(/^["'“”‘’[]+|["'“”‘’\]]+$/g, '')
    .replace(/:\s*$/, '')
    .trim()
    .toLowerCase();
}

describe.each(FIXTURES)('real-world corpus: %s', (fixture) => {
  const decks = loadCorpus(fixture);

  it('has decks to test', () => {
    expect(decks.length).toBeGreaterThan(0);
  });

  it('never lets the command zone swallow the deck', () => {
    // A command zone holds at most two cards (partners, or commander plus
    // background). Player draws every commander-tagged card into the opening
    // hand, so an unbounded command zone means an unbounded opening hand — this
    // is the assertion that would have caught the 45 live imports that shipped
    // a player's whole deck to their hand.
    const offenders = decks
      .map((deck) => {
        const commanders = parseDecklistWithStats(deck.text)
          .items.filter((item) => item.commander)
          .reduce((sum, item) => sum + item.count, 0);
        return { label: deck.label, commanders };
      })
      .filter((deck) => deck.commanders > 2);

    expect(offenders).toEqual([]);
  });

  it('never imports a section header as a card', () => {
    // A header the parser fails to recognize falls through to the
    // quantity-less-card rule and is imported as a card, inflating the deck by
    // one. That is how `"Commander"` (quoted) became a 101-card deck.
    const offenders = decks.flatMap((deck) =>
      parseDecklistWithStats(deck.text)
        .items.filter((item) => SECTION_LABELS.has(asLabel(item.name)))
        .map((item) => `${deck.label}: imported ${JSON.stringify(item.name)} as a card`),
    );

    expect(offenders).toEqual([]);
  });
});

describe('real-world corpus: commander sections', () => {
  const decks = loadCorpus('commander-section-imports.txt');

  it('still finds a commander in every list that declares one', () => {
    // The flip side of the bound above: closing the command zone too eagerly
    // would silently cost players their commander auto-draw. Every list in this
    // corpus carries a commander header, so every one must yield a commander.
    const missing = decks
      .filter((deck) => !parseDecklistWithStats(deck.text).items.some((item) => item.commander))
      .map((deck) => deck.label);

    expect(missing).toEqual([]);
  });
});
