/**
 * Tour step completion — derived from game state, never from a callback.
 *
 * Every predicate here describes a *state* ("a card I own is on the board"),
 * not the route the player took to reach it. `placeCardOnBattlefield` is already
 * the shared path for playing from hand and from a pile, and a hotkey play lands
 * in the same `yCards` map — so a new way to play a card satisfies the `play`
 * step for free, rather than needing a `tour.notify()` call that the next
 * play-path would forget to add.
 *
 * Completion is measured against a baseline taken when the *step* became active
 * (see StepBaseline), not when the tour started — otherwise a step can silently
 * require the player to do the thing twice.
 *
 * Pure: no DOM, no React, no stores. Feed it a Y.Doc and it tells you where the
 * player is.
 */
import * as Y from 'yjs';
import { YDOC_CARDS_ON_BOARD, YDOC_PLAYER, YSTATE_HAND } from '@/constants';
import type { WhiteboardCard } from '@/features/battlefield/types';
import type { Card } from '@/features/player';
import type { StepBaseline, TourSnapshot, TourStepId } from './types';

function myBoardCards(yDoc: Y.Doc, playerId: string): WhiteboardCard[] {
  return [...yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD).values()].filter(
    (card) => card.ownerId === playerId,
  );
}

function handSize(yDoc: Y.Doc, playerId: string): number {
  return ((yDoc.getMap(YDOC_PLAYER(playerId)).get(YSTATE_HAND) ?? []) as Card[]).length;
}

/** The counts a step is measured against. Taken the moment a step becomes active. */
export function readCounts(yDoc: Y.Doc, playerId: string): StepBaseline {
  const board = myBoardCards(yDoc, playerId);
  return {
    handSize: handSize(yDoc, playerId),
    boardCardCount: board.length,
    tappedCardCount: board.filter((card) => card.isTapped).length,
  };
}

export function buildTourSnapshot(params: {
  yDoc: Y.Doc;
  playerId: string;
  baseline: StepBaseline;
  roomLinkCopied: boolean;
  playerCount: number;
}): TourSnapshot {
  const { yDoc, playerId, baseline, roomLinkCopied, playerCount } = params;

  return {
    myBoardCards: myBoardCards(yDoc, playerId),
    handSize: handSize(yDoc, playerId),
    baseline,
    roomLinkCopied,
    playerCount,
  };
}

const COMPLETION: Record<TourStepId, (s: TourSnapshot) => boolean> = {
  play: (s) => s.myBoardCards.length > s.baseline.boardCardCount,
  tap: (s) => s.myBoardCards.filter((c) => c.isTapped).length > s.baseline.tappedCardCount,
  // Strictly greater than the hand *this step* started with, so playing a card
  // out of hand can never read as a draw, and drawing back up to the hand you
  // began the tour with still counts.
  draw: (s) => s.handSize > s.baseline.handSize,
  // Copying the link, and ONLY copying the link.
  //
  // This used to also complete on `playerCount > 1`, on the theory that a peer
  // arriving meant the player had clearly invited someone. It fires for all sorts
  // of reasons that have nothing to do with them: a duplicate tab, a socket that
  // hasn't finished closing after a reload — and, worst of all, simply *being the
  // friend who was invited*. Anyone who joins an existing room starts at 2 players,
  // so `invite` completed the instant it appeared, which (being the last step)
  // ended the whole tour and marked it done forever. The step was never seen.
  //
  // A predicate for "the player did X" must not be satisfiable by other people.
  invite: (s) => s.roomLinkCopied,
  // Informational — nothing to observe, so it waits on its button.
  history: () => false,
};

export function isStepComplete(id: TourStepId, snapshot: TourSnapshot): boolean {
  return COMPLETION[id](snapshot);
}
