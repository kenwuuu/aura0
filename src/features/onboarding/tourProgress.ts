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
  // Copying the link is the honest signal we control; a peer actually arriving
  // is even better, and skips the step for anyone who shared the URL some other way.
  invite: (s) => s.roomLinkCopied || s.playerCount > 1,
  // Informational — nothing to observe, so it waits on its button.
  history: () => false,
};

export function isStepComplete(id: TourStepId, snapshot: TourSnapshot): boolean {
  return COMPLETION[id](snapshot);
}
