/**
 * Uses a real Y.Doc (never mocked), per the repo's Yjs testing convention.
 */
import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { seedDemoBoard } from './seedDemoBoard';
import { makeCard } from '@/test/factories';
import { YDOC_CARDS_ON_BOARD } from '@/constants';
import { seatOrigin } from '@/features/battlefield/boardWorld';
import type { WhiteboardCard } from '@/features/battlefield/types';

const PLAYER = 'demo-player';

function fourCards() {
  return [0, 1, 2, 3].map((i) => makeCard({ id: `demo-card-${i}`, cardNumber: i + 1 }));
}

function boardCards(yDoc: Y.Doc): WhiteboardCard[] {
  return Array.from(yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD).values());
}

describe('seedDemoBoard', () => {
  it('seeds the four given cards onto the board owned by the player', () => {
    const yDoc = new Y.Doc();
    seedDemoBoard(yDoc, PLAYER, fourCards());

    const cards = boardCards(yDoc);
    expect(cards).toHaveLength(4);
    expect(cards.every((c) => c.ownerId === PLAYER)).toBe(true);
  });

  it('taps alternating cards (2nd and 4th) and leaves the rest untapped', () => {
    const yDoc = new Y.Doc();
    const input = fourCards();
    seedDemoBoard(yDoc, PLAYER, input);

    const yCards = yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD);
    expect(yCards.get('demo-card-0')!.isTapped).toBe(false);
    expect(yCards.get('demo-card-1')!.isTapped).toBe(true);
    expect(yCards.get('demo-card-2')!.isTapped).toBe(false);
    expect(yCards.get('demo-card-3')!.isTapped).toBe(true);
  });

  it('places cards relative to the seat-0 mat origin', () => {
    const yDoc = new Y.Doc();
    seedDemoBoard(yDoc, PLAYER, fourCards());

    const origin = seatOrigin(0);
    const first = yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD).get('demo-card-0')!;
    // First slot is +70/+70 from the origin (see seedDemoBoard layout).
    expect(first.x).toBe(origin.x + 70);
    expect(first.y).toBe(origin.y + 70);
  });

  it('is idempotent — a second call does not double-seed', () => {
    const yDoc = new Y.Doc();
    seedDemoBoard(yDoc, PLAYER, fourCards());
    seedDemoBoard(yDoc, PLAYER, fourCards());
    expect(boardCards(yDoc)).toHaveLength(4);
  });

  it('seeds only as many cards as provided (no undefined slots)', () => {
    const yDoc = new Y.Doc();
    seedDemoBoard(yDoc, PLAYER, [makeCard({ id: 'only-one' })]);
    const cards = boardCards(yDoc);
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe('only-one');
  });
});
