import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { YDOC_CARDS_ON_BOARD, YDOC_PLAYER, YSTATE_HAND } from '@/constants';
import type { WhiteboardCard } from '@/features/battlefield/types';
import type { Card } from '@/features/player';
import { buildTourSnapshot, isStepComplete } from './tourProgress';
import type { TourSnapshot } from './types';

const ME = 'player-me';
const OPPONENT = 'player-them';

function makeCard(id: string, overrides: Partial<Card> = {}): Card {
  return {
    id,
    cardNumber: 1,
    name: `Card ${id}`,
    x: 0,
    y: 0,
    rotation: 0,
    isTapped: false,
    isFlipped: false,
    counters: [],
    ...overrides,
  } as Card;
}

function makeBoardCard(id: string, ownerId: string, overrides: Partial<WhiteboardCard> = {}): WhiteboardCard {
  return { ...makeCard(id), ownerId, zIndex: 1, ...overrides } as WhiteboardCard;
}

/** A real Y.Doc, never a mock — a card on the board is a card in `yCards`. */
function seedDoc(opts: { board?: WhiteboardCard[]; hand?: Card[] } = {}) {
  const yDoc = new Y.Doc();
  const yCards = yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD);
  for (const card of opts.board ?? []) yCards.set(card.id, card);
  yDoc.getMap(YDOC_PLAYER(ME)).set(YSTATE_HAND, opts.hand ?? []);
  return yDoc;
}

function snapshot(yDoc: Y.Doc, over: Partial<Omit<TourSnapshot, 'myBoardCards' | 'handSize'>> = {}) {
  return buildTourSnapshot({
    yDoc,
    playerId: ME,
    baselineHandSize: 0,
    roomLinkCopied: false,
    playerCount: 1,
    ...over,
  });
}

describe('buildTourSnapshot', () => {
  it('counts only board cards the local player owns', () => {
    const yDoc = seedDoc({
      board: [makeBoardCard('a', ME), makeBoardCard('b', OPPONENT)],
    });

    expect(snapshot(yDoc).myBoardCards.map((c) => c.id)).toEqual(['a']);
  });

  it('reads hand size from the local player state', () => {
    const yDoc = seedDoc({ hand: [makeCard('h1'), makeCard('h2')] });

    expect(snapshot(yDoc).handSize).toBe(2);
  });

  it('treats an empty doc as an empty board and empty hand', () => {
    const yDoc = new Y.Doc();

    const s = snapshot(yDoc);
    expect(s.myBoardCards).toEqual([]);
    expect(s.handSize).toBe(0);
  });
});

describe('isStepComplete', () => {
  describe('play', () => {
    it('is incomplete with nothing on the board', () => {
      expect(isStepComplete('play', snapshot(seedDoc()))).toBe(false);
    });

    it('completes once a card the player owns is on the board', () => {
      const yDoc = seedDoc({ board: [makeBoardCard('a', ME)] });
      expect(isStepComplete('play', snapshot(yDoc))).toBe(true);
    });

    it("does NOT complete on an opponent's card", () => {
      const yDoc = seedDoc({ board: [makeBoardCard('b', OPPONENT)] });
      expect(isStepComplete('play', snapshot(yDoc))).toBe(false);
    });
  });

  describe('tap', () => {
    it('is incomplete while the played card is untapped', () => {
      const yDoc = seedDoc({ board: [makeBoardCard('a', ME, { isTapped: false })] });
      expect(isStepComplete('tap', snapshot(yDoc))).toBe(false);
    });

    it('completes once one of the player\'s board cards is tapped', () => {
      const yDoc = seedDoc({
        board: [makeBoardCard('a', ME, { isTapped: false }), makeBoardCard('b', ME, { isTapped: true })],
      });
      expect(isStepComplete('tap', snapshot(yDoc))).toBe(true);
    });

    it("does NOT complete on an opponent's tapped card", () => {
      const yDoc = seedDoc({ board: [makeBoardCard('b', OPPONENT, { isTapped: true })] });
      expect(isStepComplete('tap', snapshot(yDoc))).toBe(false);
    });
  });

  describe('draw', () => {
    it('is incomplete while the hand is still at its baseline', () => {
      const yDoc = seedDoc({ hand: [makeCard('h1')] });
      expect(isStepComplete('draw', snapshot(yDoc, { baselineHandSize: 1 }))).toBe(false);
    });

    it('completes once the hand grows past the baseline', () => {
      const yDoc = seedDoc({ hand: [makeCard('h1'), makeCard('h2')] });
      expect(isStepComplete('draw', snapshot(yDoc, { baselineHandSize: 1 }))).toBe(true);
    });

    it('stays incomplete if the hand SHRINKS (playing a card is not drawing one)', () => {
      const yDoc = seedDoc({ hand: [] });
      expect(isStepComplete('draw', snapshot(yDoc, { baselineHandSize: 1 }))).toBe(false);
    });
  });

  describe('invite', () => {
    it('is incomplete when alone and the link was never copied', () => {
      expect(isStepComplete('invite', snapshot(seedDoc()))).toBe(false);
    });

    it('completes when the room link is copied', () => {
      expect(isStepComplete('invite', snapshot(seedDoc(), { roomLinkCopied: true }))).toBe(true);
    });

    it('completes when someone actually joined, even without copying the link', () => {
      expect(isStepComplete('invite', snapshot(seedDoc(), { playerCount: 2 }))).toBe(true);
    });
  });

  describe('informational steps', () => {
    it('never auto-complete — they advance on their button', () => {
      const yDoc = seedDoc({ board: [makeBoardCard('a', ME, { isTapped: true })], hand: [makeCard('h')] });
      const s = snapshot(yDoc, { roomLinkCopied: true, playerCount: 4 });

      expect(isStepComplete('history', s)).toBe(false);
      expect(isStepComplete('learn-more', s)).toBe(false);
    });
  });
});
