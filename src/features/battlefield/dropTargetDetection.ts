/**
 * Pure DOM-attribute lookup for "what pile/hand did a board card get dropped on?"
 *
 * Extracted from `BattlefieldCanvas` so the rule is unit-testable without a
 * react-flow canvas. Board `PileNode`s and the `FloatingHand` overlay both mark
 * themselves with `data-pile-type`/`data-pile-owner`, so a single attribute walk
 * finds any drop target regardless of which DOM subtree it lives in (react-flow
 * node vs. fixed-position overlay).
 */

import type { PileType } from '@/features/player';

export interface PileDropTarget {
  pileType: Exclude<PileType, 'scry'>;
  /** ownerId from data-pile-owner, or null if the element didn't carry one. */
  ownerId: string | null;
}

export function findDropTarget(element: Element | null): PileDropTarget | null {
  let current = element as HTMLElement | null;
  while (current) {
    const pt = current.dataset?.pileType;
    if (pt === 'exile' || pt === 'discard' || pt === 'deck' || pt === 'hand') {
      return { pileType: pt, ownerId: current.dataset?.pileOwner ?? null };
    }
    current = current.parentElement;
  }
  return null;
}
