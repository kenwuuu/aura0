/**
 * Cascade placement — the one rule that keeps a card from landing exactly on
 * top of another and becoming invisible.
 *
 * Two paths put a card down at a position that something may already occupy:
 * copying a card (`battlefieldCardActions`, which offsets from the source, so
 * copy #2 of the same card would repeat copy #1's spot) and playing a card from
 * a pile (`battlefieldActions`, where every such play aims at the same viewport
 * centre). Both walk the same down-right diagonal, solitaire-style, until they
 * reach a free slot — so the rule and its step size live here once rather than
 * being re-derived per call site.
 *
 * Deliberately NOT applied to a card dragged out of hand: there the drop point
 * is the player's own aim, and stacking cards on purpose (an aura onto a
 * creature, overlapping lands) has to keep working.
 */

import * as Y from 'yjs';
import type { WhiteboardCard } from './types';

/** Down-right step between two cards in a cascade. */
export const CASCADE_OFFSET = 20;

/** Give up after this many candidate slots, so a pathological board can never
 * spin here — the card just lands on the last slot tried. */
const CASCADE_MAX_STEPS = 100;

/**
 * The first slot at or after `start` that no card occupies, stepping down-right
 * by `CASCADE_OFFSET`. Positions within 1px count as the same slot.
 *
 * Callers that must always move (a copy, which would be hidden under its
 * source) pass a `start` already offset by `CASCADE_OFFSET`; callers that
 * should stay put when the spot is free (a pile play) pass their target
 * position.
 */
export function firstFreeCascadeSlot(
  yCards: Y.Map<WhiteboardCard>,
  start: { x: number; y: number },
): { x: number; y: number } {
  const cards = Array.from(yCards.values());
  const isOccupied = (x: number, y: number) =>
    cards.some((c) => Math.abs(c.x - x) < 1 && Math.abs(c.y - y) < 1);

  let { x, y } = start;
  for (let step = 0; step < CASCADE_MAX_STEPS; step++) {
    if (!isOccupied(x, y)) break;
    x += CASCADE_OFFSET;
    y += CASCADE_OFFSET;
  }
  return { x, y };
}
