/**
 * Pure viewer-routing logic for a battlefield pile — no React, no Zustand.
 *
 * Extracted from `PileNode` so the durable rule (which pile-viewer a click
 * should open, and when an opponent's hand is gated) is unit-testable in
 * isolation and survives the design-system rewrite of the node's markup.
 */

import type { OpenPileRequest } from '@/features/game-dock/pileViewerOpenStore';
import type { PileKind } from './PileNode';

export interface PileNodeState {
  ownerId: string;
  isLocal: boolean;
  pileKind: PileKind;
  /** Relevant for opponent hand pile — gates display and opening. */
  allowViewHand: boolean;
}

/** An opponent's hand pile is view-gated unless they've allowed it. */
export function isHandViewDisabled(
  state: Pick<PileNodeState, 'isLocal' | 'pileKind' | 'allowViewHand'>,
): boolean {
  return state.pileKind === 'hand' && !state.isLocal && !state.allowViewHand;
}

/** Which pile-viewer open request (if any) a click on this pile should fire. */
export function resolvePileOpenRequest(state: PileNodeState): OpenPileRequest | null {
  if (isHandViewDisabled(state)) return null;

  if (state.isLocal) {
    if (state.pileKind === 'hand') return null;
    return { scope: 'local', pile: state.pileKind };
  }

  if (state.pileKind === 'exile' || state.pileKind === 'discard' || state.pileKind === 'hand') {
    return { scope: 'opponent', playerId: state.ownerId, pile: state.pileKind };
  }
  return null;
}
