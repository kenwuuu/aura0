import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { YDOC_CARDS_ON_BOARD, YDOC_PLAYER, YSTATE_HAND } from '@/constants';
import type { WhiteboardCard } from '@/features/battlefield/types';
import type { Card } from '@/features/player';
import { buildTourSnapshot, isStepComplete, readCounts } from './tourProgress';
import type { StepBaseline } from './types';

const ME = 'player-me';
const OPPONENT = 'player-them';

const NO_BASELINE: StepBaseline = { handSize: 0, boardCardCount: 0, tappedCardCount: 0 };

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

function hand(n: number): Card[] {
  return Array.from({ length: n }, (_, i) => makeCard(`h${i}`));
}

function snapshot(yDoc: Y.Doc, over: { baseline?: StepBaseline; roomLinkCopied?: boolean; playerCount?: number } = {}) {
  return buildTourSnapshot({
    yDoc,
    playerId: ME,
    baseline: over.baseline ?? NO_BASELINE,
    roomLinkCopied: over.roomLinkCopied ?? false,
    playerCount: over.playerCount ?? 1,
  });
}

describe('readCounts', () => {
  it('counts only the local player’s board cards', () => {
    const yDoc = seedDoc({
      board: [
        makeBoardCard('a', ME),
        makeBoardCard('b', ME, { isTapped: true }),
        makeBoardCard('c', OPPONENT, { isTapped: true }),
      ],
      hand: hand(3),
    });

    expect(readCounts(yDoc, ME)).toEqual({ handSize: 3, boardCardCount: 2, tappedCardCount: 1 });
  });

  it('reads an empty doc as all zeroes', () => {
    expect(readCounts(new Y.Doc(), ME)).toEqual({ handSize: 0, boardCardCount: 0, tappedCardCount: 0 });
  });
});

describe('buildTourSnapshot', () => {
  it('counts only board cards the local player owns', () => {
    const yDoc = seedDoc({ board: [makeBoardCard('a', ME), makeBoardCard('b', OPPONENT)] });
    expect(snapshot(yDoc).myBoardCards.map((c) => c.id)).toEqual(['a']);
  });

  it('reads hand size from the local player state', () => {
    expect(snapshot(seedDoc({ hand: hand(2) })).handSize).toBe(2);
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

    it('needs a NEW card — cards already on the board when the step began do not count', () => {
      // Replaying the tour mid-game: one card is already down.
      const yDoc = seedDoc({ board: [makeBoardCard('a', ME)] });
      const baseline = readCounts(yDoc, ME);

      expect(isStepComplete('play', snapshot(yDoc, { baseline }))).toBe(false);

      yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD).set('b', makeBoardCard('b', ME));
      expect(isStepComplete('play', snapshot(yDoc, { baseline }))).toBe(true);
    });
  });

  describe('tap', () => {
    it('is incomplete while the played card is untapped', () => {
      const yDoc = seedDoc({ board: [makeBoardCard('a', ME, { isTapped: false })] });
      expect(isStepComplete('tap', snapshot(yDoc))).toBe(false);
    });

    it("completes once one of the player's board cards is tapped", () => {
      const yDoc = seedDoc({ board: [makeBoardCard('a', ME, { isTapped: true })] });
      expect(isStepComplete('tap', snapshot(yDoc))).toBe(true);
    });

    it("does NOT complete on an opponent's tapped card", () => {
      const yDoc = seedDoc({ board: [makeBoardCard('b', OPPONENT, { isTapped: true })] });
      expect(isStepComplete('tap', snapshot(yDoc))).toBe(false);
    });

    it('needs a NEWLY tapped card — one already tapped when the step began does not count', () => {
      const yDoc = seedDoc({ board: [makeBoardCard('a', ME, { isTapped: true })] });
      const baseline = readCounts(yDoc, ME);

      expect(isStepComplete('tap', snapshot(yDoc, { baseline }))).toBe(false);

      yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD).set('b', makeBoardCard('b', ME, { isTapped: true }));
      expect(isStepComplete('tap', snapshot(yDoc, { baseline }))).toBe(true);
    });
  });

  describe('draw', () => {
    it('is incomplete while the hand is still at its baseline', () => {
      const yDoc = seedDoc({ hand: hand(7) });
      expect(isStepComplete('draw', snapshot(yDoc, { baseline: { ...NO_BASELINE, handSize: 7 } }))).toBe(false);
    });

    it('completes on the FIRST draw after a card was played (regression: it used to need two)', () => {
      // The tour opens with 8 cards. The player plays one, so the hand is at 7
      // by the time the draw step appears — that 7 is the baseline, not the 8
      // they started the tour with. Drawing back up to 8 IS a draw.
      const yDoc = seedDoc({ board: [makeBoardCard('a', ME)], hand: hand(7) });
      const baseline = readCounts(yDoc, ME);
      expect(baseline.handSize).toBe(7);

      yDoc.getMap(YDOC_PLAYER(ME)).set(YSTATE_HAND, hand(8));

      expect(isStepComplete('draw', snapshot(yDoc, { baseline }))).toBe(true);
    });

    it('stays incomplete if the hand SHRINKS (playing a card is not drawing one)', () => {
      const yDoc = seedDoc({ hand: hand(6) });
      expect(isStepComplete('draw', snapshot(yDoc, { baseline: { ...NO_BASELINE, handSize: 7 } }))).toBe(false);
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
      const yDoc = seedDoc({ board: [makeBoardCard('a', ME, { isTapped: true })], hand: hand(9) });
      const s = snapshot(yDoc, { roomLinkCopied: true, playerCount: 4 });

      expect(isStepComplete('history', s)).toBe(false);
    });
  });
});
