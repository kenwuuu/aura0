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
 * Pure: no DOM, no React, no stores. Feed it a Y.Doc and it tells you where the
 * player is.
 */
import * as Y from 'yjs';
import { YDOC_CARDS_ON_BOARD, YDOC_PLAYER, YSTATE_HAND } from '@/constants';
import type { WhiteboardCard } from '@/features/battlefield/types';
import type { Card } from '@/features/player';
import type { TourSnapshot, TourStepId } from './types';

export function buildTourSnapshot(params: {
  yDoc: Y.Doc;
  playerId: string;
  baselineHandSize: number;
  roomLinkCopied: boolean;
  playerCount: number;
}): TourSnapshot {
  const { yDoc, playerId, baselineHandSize, roomLinkCopied, playerCount } = params;

  const boardCards = [...yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD).values()];
  const hand = (yDoc.getMap(YDOC_PLAYER(playerId)).get(YSTATE_HAND) ?? []) as Card[];

  return {
    myBoardCards: boardCards.filter((card) => card.ownerId === playerId),
    handSize: hand.length,
    baselineHandSize,
    roomLinkCopied,
    playerCount,
  };
}

const COMPLETION: Record<TourStepId, (s: TourSnapshot) => boolean> = {
  play: (s) => s.myBoardCards.length > 0,
  tap: (s) => s.myBoardCards.some((card) => card.isTapped),
  // Strictly greater, so playing a card out of hand can never read as a draw.
  draw: (s) => s.handSize > s.baselineHandSize,
  // Copying the link is the honest signal we control; a peer actually arriving
  // is even better, and skips the step for anyone who shared the URL some other way.
  invite: (s) => s.roomLinkCopied || s.playerCount > 1,
  // Informational — nothing to observe, so they wait on their button.
  history: () => false,
  'learn-more': () => false,
};

export function isStepComplete(id: TourStepId, snapshot: TourSnapshot): boolean {
  return COMPLETION[id](snapshot);
}
