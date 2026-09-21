/**
 * The palette's scoring is a silent failure surface: nothing throws when junk
 * outranks the row you wanted, the wrong item is just selected and Enter does
 * the wrong thing. These assert the relevance floor and the populations it
 * separates — the *selection* it produces is pinned in
 * `tests/e2e/app/menu/palette_help_search.spec.ts`, because cmdk's ordering only
 * happens in a real DOM.
 */
import { describe, it, expect } from 'vitest';
import { defaultFilter } from 'cmdk';
import { HELP_SECTIONS } from '@/app/content/help/sections';
import {
  MIN_MATCH_SCORE,
  helpRowValue,
  isHelpRowValue,
  paletteFilter,
} from './paletteFilter';

const deckActions = HELP_SECTIONS.find((s) => s.id === 'deck-actions')!;
const HELP_DECK_ACTIONS = helpRowValue(deckActions.group, deckActions.title);
const DECK_KEYWORDS = [...deckActions.keywords];

describe('paletteFilter relevance floor', () => {
  it('drops fuzzy coincidences that share no meaningful text', () => {
    // Real measurements from the palette before the floor existed: "scry"
    // returned 13 rows, of which these were most of the noise.
    expect(paletteFilter('Import a deck', 'scry', ['choose deck', 'load deck', 'library'])).toBe(0);
    expect(paletteFilter('Join our Discord', 'scry', ['help', 'community', 'support'])).toBe(0);
    expect(paletteFilter('Import a deck', 'mill', ['choose deck', 'load deck', 'library'])).toBe(0);
    expect(paletteFilter('Copy game link', 'mill', ['invite', 'share', 'room', 'url'])).toBe(0);
  });

  it('keeps typo tolerance', () => {
    // The floor sits below the weakest *real* match, not above it — a dropped
    // character must still find its row.
    expect(paletteFilter('Shuffle deck', 'shufle', [])).toBeGreaterThan(0);
    expect(paletteFilter('Move card to discard', 'discrd', [])).toBeGreaterThan(0);
  });

  it('sits in the gap between the two populations', () => {
    // Pins the actual separation rather than the constant, so retuning the
    // floor without re-measuring goes red.
    const weakestReal = Math.min(
      defaultFilter('Shuffle deck', 'shufle'),
      defaultFilter('Move card to discard', 'discrd'),
    );
    const strongestNoise = Math.max(
      defaultFilter('Import a deck', 'mill', ['choose deck', 'load deck', 'library']),
      defaultFilter('Copy game link', 'mill', ['invite', 'share', 'room', 'url']),
    );

    expect(strongestNoise).toBeLessThan(MIN_MATCH_SCORE);
    expect(weakestReal).toBeGreaterThan(MIN_MATCH_SCORE);
  });

  it('leaves a surviving score exactly as cmdk ranked it', () => {
    // The floor decides membership; it must not reshape the ordering above it.
    expect(paletteFilter('Shuffle deck', 'shuffle', ['randomize'])).toBe(
      defaultFilter('Shuffle deck', 'shuffle', ['randomize']),
    );
  });
});

describe('help rows', () => {
  it('matches a section on a curated keyword its title never mentions', () => {
    // Scry has no keystroke and no runnable command, so the guide is the only
    // place it exists in the product.
    expect(paletteFilter(HELP_DECK_ACTIONS, 'scry', DECK_KEYWORDS)).toBeGreaterThan(0);
    expect(paletteFilter(HELP_DECK_ACTIONS, 'scry', [])).toBe(0);
  });

  it('identifies help rows case- and whitespace-insensitively', () => {
    expect(isHelpRowValue(HELP_DECK_ACTIONS)).toBe(true);
    expect(isHelpRowValue(`  ${HELP_DECK_ACTIONS.toUpperCase()}  `)).toBe(true);
    expect(isHelpRowValue('Draw a card')).toBe(false);
    expect(isHelpRowValue('Some group › Not a real section')).toBe(false);
  });

  it('gives every section a value that round-trips', () => {
    for (const section of HELP_SECTIONS) {
      expect(isHelpRowValue(helpRowValue(section.group, section.title))).toBe(true);
    }
  });
});

describe('cmdk keyword scoring (the assumption help rows lean on)', () => {
  // #164's plan called for replacing the filter with one that scores each
  // keyword separately, because cmdk supposedly scores value+keywords as one
  // blob and dilutes a row's own title. That is false at cmdk 1.1.1 — it
  // already scores terms independently and deliberately caps a keyword match
  // below a title match. Hand-rolling max-over-terms would score keywords on
  // the title scale and destroy that. If an upgrade changes this, these fail
  // and say so, rather than the alias layer (Track A) quietly getting worse the
  // more terms it gains.
  it('does not dilute a title match when unrelated keywords are added', () => {
    const noise = Array.from({ length: 20 }, (_, i) => `unrelated-term-${i}`);
    expect(defaultFilter('Shuffle deck', 'shuffle', noise)).toBe(
      defaultFilter('Shuffle deck', 'shuffle'),
    );
  });

  it('scores a keyword match below a title match', () => {
    expect(defaultFilter('Shuffle deck', 'randomize', ['randomize'])).toBeLessThan(
      defaultFilter('Shuffle deck', 'shuffle'),
    );
  });

  it('matches on a keyword the title does not contain', () => {
    expect(defaultFilter('Shuffle deck', 'randomize', ['randomize'])).toBeGreaterThan(0);
    expect(defaultFilter('Shuffle deck', 'randomize')).toBe(0);
  });
});
