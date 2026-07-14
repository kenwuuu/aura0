/**
 * Pure viewer-routing logic for a battlefield pile — no React, no Zustand.
 *
 * Extracted from `PileNode` so the durable rule (which pile-viewer a click
 * should open, and when an opponent's pile is gated) is unit-testable in
 * isolation and survives the design-system rewrite of the node's markup.
 */

import type { OpenPileRequest } from '@/features/game-dock/pileViewerOpenStore';
import type { PileType } from '@/features/player';

export interface PileNodeState {
  ownerId: string;
  isLocal: boolean;
  pileKind: Exclude<PileType, 'scry'>;
  /** Relevant for opponent hand pile — gates display and opening. */
  allowViewHand: boolean;
}

/**
 * Piles whose contents belong to their owner alone. Opponents see the count —
 * that much is public in paper Magic — but can never open them.
 *
 * The hand is the softer case: its owner can opt in and share it
 * (`allowViewHand`). The sideboard has no such opt-in, because there is no point
 * in a game where a sideboard is revealed.
 */
const PRIVATE_PILES = new Set<PileType>(['hand', 'sideboard']);

/** An opponent's private pile is gated — the hand unless they've allowed it, the sideboard always. */
export function isPileViewDisabled(
  state: Pick<PileNodeState, 'isLocal' | 'pileKind' | 'allowViewHand'>,
): boolean {
  if (state.isLocal || !PRIVATE_PILES.has(state.pileKind)) return false;
  return state.pileKind === 'sideboard' || !state.allowViewHand;
}

/** Which pile-viewer open request (if any) a click on this pile should fire. */
export function resolvePileOpenRequest(state: PileNodeState): OpenPileRequest | null {
  if (isPileViewDisabled(state)) return null;

  if (state.isLocal) {
    if (state.pileKind === 'hand') return null;
    return { scope: 'local', pile: state.pileKind };
  }

  if (state.pileKind === 'exile' || state.pileKind === 'discard' || state.pileKind === 'hand') {
    return { scope: 'opponent', playerId: state.ownerId, pile: state.pileKind };
  }
  return null;
}
