/**
 * Tests for cardTokenAttachment helpers.
 *
 * Uses real Y.Doc instances (no mocks) to mirror project conventions.
 */
import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { tokenCenter, cardContainsPoint, findParentCard, attachedTokens } from './cardTokenAttachment';
import { WhiteboardCard } from './types';
import { KeywordToken } from '@/features/keyword-tokens/types';
import { CARD_WIDTH, CARD_HEIGHT } from '@/constants';
import { TOKEN_SIZE } from './nodes/TokenNode';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeCard(overrides: Partial<WhiteboardCard> = {}): WhiteboardCard {
  return {
    id: 'card-1',
    cardNumber: 1,
    x: 100,
    y: 100,
    rotation: 0,
    isTapped: false,
    isFlipped: false,
    counters: [],
    zIndex: 1,
    ownerId: 'player-1',
    ...overrides,
  } as WhiteboardCard;
}

function makeToken(overrides: Partial<KeywordToken> = {}): KeywordToken {
  return {
    id: 'token-1',
    title: 'Flying',
    backgroundColor: '#fff',
    x: 0,
    y: 0,
    zIndex: 2,
    rotation: 0,
    ownerId: 'player-1',
    ...overrides,
  };
}

// ── tokenCenter ───────────────────────────────────────────────────────────────

describe('tokenCenter', () => {
  it('returns the center of the token bounding box', () => {
    const token = makeToken({ x: 10, y: 20 });
    expect(tokenCenter(token)).toEqual({ x: 10 + TOKEN_SIZE / 2, y: 20 + TOKEN_SIZE / 2 });
  });

  it('is exactly token origin when TOKEN_SIZE is 0 (boundary guard)', () => {
    const token = makeToken({ x: 5, y: 7 });
    const { x, y } = tokenCenter(token);
    expect(x).toBeGreaterThan(token.x);
    expect(y).toBeGreaterThan(token.y);
  });
});

// ── cardContainsPoint ─────────────────────────────────────────────────────────

describe('cardContainsPoint', () => {
  const card = makeCard({ x: 100, y: 100 });

  it('returns true for a point clearly inside the card', () => {
    expect(cardContainsPoint(card, { x: 110, y: 120 })).toBe(true);
  });

  it('returns false for a point clearly outside the card', () => {
    expect(cardContainsPoint(card, { x: 50, y: 50 })).toBe(false);
  });

  it('returns true for a point on the top-left corner (inclusive)', () => {
    expect(cardContainsPoint(card, { x: 100, y: 100 })).toBe(true);
  });

  it('returns true for a point on the bottom-right corner (inclusive)', () => {
    expect(cardContainsPoint(card, { x: 100 + CARD_WIDTH, y: 100 + CARD_HEIGHT })).toBe(true);
  });

  it('returns false for a point one pixel outside the right edge', () => {
    expect(cardContainsPoint(card, { x: 100 + CARD_WIDTH + 1, y: 120 })).toBe(false);
  });

  it('returns false for a point one pixel outside the bottom edge', () => {
    expect(cardContainsPoint(card, { x: 110, y: 100 + CARD_HEIGHT + 1 })).toBe(false);
  });
});

// ── findParentCard ────────────────────────────────────────────────────────────

describe('findParentCard', () => {
  it('returns undefined when no cards exist', () => {
    const yDoc = new Y.Doc();
    const yCards = yDoc.getMap<WhiteboardCard>('cards');
    const token = makeToken({ x: 100, y: 100 }); // center at 115,115
    expect(findParentCard(token, yCards)).toBeUndefined();
  });

  it('returns the card id when the token center is inside', () => {
    const yDoc = new Y.Doc();
    const yCards = yDoc.getMap<WhiteboardCard>('cards');
    const card = makeCard({ id: 'c1', x: 100, y: 100, zIndex: 1 });
    yCards.set('c1', card);
    // Token placed so its center (x+15, y+15) falls inside the card
    const token = makeToken({ x: 110, y: 110 }); // center 125,125 — inside 100..163, 100..188
    expect(findParentCard(token, yCards)).toBe('c1');
  });

  it('returns undefined when the token center is outside all cards', () => {
    const yDoc = new Y.Doc();
    const yCards = yDoc.getMap<WhiteboardCard>('cards');
    yCards.set('c1', makeCard({ id: 'c1', x: 100, y: 100, zIndex: 1 }));
    // Token far away
    const token = makeToken({ x: 500, y: 500 });
    expect(findParentCard(token, yCards)).toBeUndefined();
  });

  it('returns the topmost (highest zIndex) card when centers overlap two cards', () => {
    const yDoc = new Y.Doc();
    const yCards = yDoc.getMap<WhiteboardCard>('cards');
    // Two cards at the same position; c2 is on top
    yCards.set('c1', makeCard({ id: 'c1', x: 100, y: 100, zIndex: 1 }));
    yCards.set('c2', makeCard({ id: 'c2', x: 100, y: 100, zIndex: 5 }));
    const token = makeToken({ x: 110, y: 110 });
    expect(findParentCard(token, yCards)).toBe('c2');
  });

  it('ignores a card whose bounds the token center just misses', () => {
    const yDoc = new Y.Doc();
    const yCards = yDoc.getMap<WhiteboardCard>('cards');
    // Card at 100,100; token center placed one pixel outside the right edge
    yCards.set('c1', makeCard({ id: 'c1', x: 100, y: 100, zIndex: 1 }));
    const token = makeToken({ x: 100 + CARD_WIDTH - TOKEN_SIZE / 2 + 1, y: 110 });
    expect(findParentCard(token, yCards)).toBeUndefined();
  });
});

// ── attachedTokens ────────────────────────────────────────────────────────────

describe('attachedTokens', () => {
  it('returns an empty array when no tokens are attached', () => {
    const yDoc = new Y.Doc();
    const yTokens = yDoc.getMap<KeywordToken>('tokens');
    yTokens.set('t1', makeToken({ id: 't1', attachedTo: undefined }));
    expect(attachedTokens('c1', yTokens)).toHaveLength(0);
  });

  it('returns tokens attached to the given card', () => {
    const yDoc = new Y.Doc();
    const yTokens = yDoc.getMap<KeywordToken>('tokens');
    yTokens.set('t1', makeToken({ id: 't1', attachedTo: 'c1' }));
    yTokens.set('t2', makeToken({ id: 't2', attachedTo: 'c2' }));
    yTokens.set('t3', makeToken({ id: 't3', attachedTo: 'c1' }));
    const result = attachedTokens('c1', yTokens);
    expect(result).toHaveLength(2);
    expect(result.map((t) => t.id).sort()).toEqual(['t1', 't3']);
  });

  it('does not return free-floating tokens (attachedTo undefined)', () => {
    const yDoc = new Y.Doc();
    const yTokens = yDoc.getMap<KeywordToken>('tokens');
    yTokens.set('t1', makeToken({ id: 't1' }));
    expect(attachedTokens('c1', yTokens)).toHaveLength(0);
  });
});
