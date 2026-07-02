/**
 * Test data factories — one source of truth for building domain objects in tests.
 *
 * Prefer these over inline literals so a shape change lands in one place. Every
 * factory takes `overrides` so a test states only the fields it cares about.
 */

import type { Card } from '@/features/player/types';
import type { KeywordToken } from '@/features/keyword-tokens/types';

let cardSeq = 0;

/** A battlefield/hand card with sensible defaults. Override only what the test asserts on. */
export function makeCard(overrides: Partial<Card> = {}): Card {
  cardSeq += 1;
  return {
    id: `card-${cardSeq}`,
    cardNumber: cardSeq,
    name: 'Lightning Bolt',
    images: {
      front: { normal: 'https://img/front-normal.png' },
      back: { normal: 'https://img/back-normal.png' },
    },
    x: 0,
    y: 0,
    rotation: 0,
    isTapped: false,
    isFlipped: false,
    counters: [],
    ...overrides,
  };
}

/** `n` distinct cards. Pass `overrides` (or a per-index function) to customize. */
export function makeCards(
  n: number,
  overrides: Partial<Card> | ((index: number) => Partial<Card>) = {},
): Card[] {
  return Array.from({ length: n }, (_, i) =>
    makeCard(typeof overrides === 'function' ? overrides(i) : overrides),
  );
}

let tokenSeq = 0;

/** A battlefield keyword token with sensible defaults. Override only what the test asserts on. */
export function makeToken(overrides: Partial<KeywordToken> = {}): KeywordToken {
  tokenSeq += 1;
  return {
    id: `token-${tokenSeq}`,
    ownerId: 'p1',
    x: 0,
    y: 0,
    zIndex: 0,
    rotation: 0,
    title: 'Flying',
    backgroundColor: '#123456',
    count: 1,
    ...overrides,
  };
}
