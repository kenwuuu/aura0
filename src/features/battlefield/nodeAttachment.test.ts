/**
 * Tests for nodeAttachment helpers.
 *
 * Uses real Y.Doc instances (no mocks) to mirror project conventions.
 */
import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { nodeCenter, nodeContainsPoint, findParent, attachedChildren, NODE_SIZES } from './nodeAttachment';
import { WhiteboardCard } from './types';
import { KeywordToken } from '@/features/keyword-tokens/types';
import { CARD_WIDTH, CARD_HEIGHT } from '@/constants';

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

const TOKEN_W = NODE_SIZES.token.width;
const TOKEN_H = NODE_SIZES.token.height;

// ── nodeCenter ────────────────────────────────────────────────────────────────

describe('nodeCenter', () => {
  it('returns the center of a token node', () => {
    expect(nodeCenter({ x: 10, y: 20 }, 'token')).toEqual({
      x: 10 + TOKEN_W / 2,
      y: 20 + TOKEN_H / 2,
    });
  });

  it('returns the center of a card node', () => {
    expect(nodeCenter({ x: 100, y: 200 }, 'card')).toEqual({
      x: 100 + CARD_WIDTH / 2,
      y: 200 + CARD_HEIGHT / 2,
    });
  });

  it('returns origin for an unknown node type (zero-size fallback)', () => {
    const pos = { x: 5, y: 7 };
    expect(nodeCenter(pos, 'unknown')).toEqual(pos);
  });
});

// ── nodeContainsPoint ─────────────────────────────────────────────────────────

describe('nodeContainsPoint', () => {
  const cardPos = { x: 100, y: 100 };

  it('returns true for a point clearly inside the card', () => {
    expect(nodeContainsPoint(cardPos, 'card', { x: 110, y: 120 })).toBe(true);
  });

  it('returns false for a point clearly outside the card', () => {
    expect(nodeContainsPoint(cardPos, 'card', { x: 50, y: 50 })).toBe(false);
  });

  it('returns true for a point on the top-left corner (inclusive)', () => {
    expect(nodeContainsPoint(cardPos, 'card', { x: 100, y: 100 })).toBe(true);
  });

  it('returns true for a point on the bottom-right corner (inclusive)', () => {
    expect(nodeContainsPoint(cardPos, 'card', { x: 100 + CARD_WIDTH, y: 100 + CARD_HEIGHT })).toBe(true);
  });

  it('returns false for a point one pixel outside the right edge', () => {
    expect(nodeContainsPoint(cardPos, 'card', { x: 100 + CARD_WIDTH + 1, y: 120 })).toBe(false);
  });

  it('returns false for a point one pixel outside the bottom edge', () => {
    expect(nodeContainsPoint(cardPos, 'card', { x: 110, y: 100 + CARD_HEIGHT + 1 })).toBe(false);
  });
});

// ── findParent ────────────────────────────────────────────────────────────────

describe('findParent', () => {
  it('returns undefined when no candidates exist', () => {
    const yDoc = new Y.Doc();
    const yCards = yDoc.getMap<WhiteboardCard>('cards');
    expect(findParent({ x: 100, y: 100 }, 'token', yCards, 'card')).toBeUndefined();
  });

  it('returns the card id when the token center is inside', () => {
    const yDoc = new Y.Doc();
    const yCards = yDoc.getMap<WhiteboardCard>('cards');
    yCards.set('c1', makeCard({ id: 'c1', x: 100, y: 100, zIndex: 1 }));
    // Token at 110,110 → center at ~125,125, inside card at 100..163, 100..188
    expect(findParent({ x: 110, y: 110 }, 'token', yCards, 'card')).toBe('c1');
  });

  it('returns undefined when the token center is outside all candidates', () => {
    const yDoc = new Y.Doc();
    const yCards = yDoc.getMap<WhiteboardCard>('cards');
    yCards.set('c1', makeCard({ id: 'c1', x: 100, y: 100, zIndex: 1 }));
    expect(findParent({ x: 500, y: 500 }, 'token', yCards, 'card')).toBeUndefined();
  });

  it('returns the topmost (highest zIndex) card when centers overlap two cards', () => {
    const yDoc = new Y.Doc();
    const yCards = yDoc.getMap<WhiteboardCard>('cards');
    yCards.set('c1', makeCard({ id: 'c1', x: 100, y: 100, zIndex: 1 }));
    yCards.set('c2', makeCard({ id: 'c2', x: 100, y: 100, zIndex: 5 }));
    expect(findParent({ x: 110, y: 110 }, 'token', yCards, 'card')).toBe('c2');
  });

  it('ignores a card whose bounds the token center just misses', () => {
    const yDoc = new Y.Doc();
    const yCards = yDoc.getMap<WhiteboardCard>('cards');
    yCards.set('c1', makeCard({ id: 'c1', x: 100, y: 100, zIndex: 1 }));
    // Token positioned so its center is one pixel outside the right edge
    const tokenX = 100 + CARD_WIDTH - TOKEN_W / 2 + 1;
    expect(findParent({ x: tokenX, y: 110 }, 'token', yCards, 'card')).toBeUndefined();
  });
});

// ── attachedChildren ──────────────────────────────────────────────────────────

describe('attachedChildren', () => {
  it('returns an empty array when no nodes are attached', () => {
    const yDoc = new Y.Doc();
    const yTokens = yDoc.getMap<KeywordToken>('tokens');
    yTokens.set('t1', makeToken({ id: 't1', attachedTo: undefined }));
    expect(attachedChildren('c1', yTokens)).toHaveLength(0);
  });

  it('returns nodes attached to the given parent', () => {
    const yDoc = new Y.Doc();
    const yTokens = yDoc.getMap<KeywordToken>('tokens');
    yTokens.set('t1', makeToken({ id: 't1', attachedTo: 'c1' }));
    yTokens.set('t2', makeToken({ id: 't2', attachedTo: 'c2' }));
    yTokens.set('t3', makeToken({ id: 't3', attachedTo: 'c1' }));
    const result = attachedChildren('c1', yTokens);
    expect(result).toHaveLength(2);
    expect(result.map((t) => t.id).sort()).toEqual(['t1', 't3']);
  });

  it('does not return free-floating nodes (attachedTo undefined)', () => {
    const yDoc = new Y.Doc();
    const yTokens = yDoc.getMap<KeywordToken>('tokens');
    yTokens.set('t1', makeToken({ id: 't1' }));
    expect(attachedChildren('c1', yTokens)).toHaveLength(0);
  });
});
