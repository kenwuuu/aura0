/**
 * Pure presentation logic for a battlefield card — no React, no DOM.
 *
 * Extracted from `CardNode` so the durable behavior (which face shows, how tap
 * rotation composes) is unit-testable in isolation and survives the design-system
 * rewrite of the node's markup.
 */

import { DEFAULT_CARD_BACK } from '@/constants';
import type { Card } from '@/features/player/types';

export interface CardFace {
  /** Image URL to render, or `null` when there's no front image (show a placeholder). */
  src: string | null;
  /** Accessible alt text for the face. */
  alt: string;
}

/** Resolve which image + alt a card shows, honoring flip state and fallbacks. */
export function resolveCardFace(
  card: Pick<Card, 'isFlipped' | 'images' | 'name' | 'cardNumber'>,
): CardFace {
  if (card.isFlipped) {
    return { src: card.images?.back?.normal || DEFAULT_CARD_BACK, alt: 'Card Back' };
  }
  return {
    src: card.images?.front?.normal || null,
    alt: card.name || `Card #${card.cardNumber}`,
  };
}

/** Total rotation in degrees: the card's own rotation plus 90° when tapped. */
export function resolveCardRotation(card: Pick<Card, 'rotation' | 'isTapped'>): number {
  return (card.rotation ?? 0) + (card.isTapped ? 90 : 0);
}
