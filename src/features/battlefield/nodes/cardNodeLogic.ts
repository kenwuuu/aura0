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

/**
 * A card is *hidden* face-down when it's flipped but has no real back image —
 * so it shows the generic card back and its true (front) identity is concealed.
 * This is the only case worth peeking: a double-faced card flipped to its back
 * is showing a real, public face, not hiding anything. The card object tells us
 * directly — `images.back` is only populated for double-faced cards.
 */
export function isHiddenFacedown(card: Pick<Card, 'isFlipped' | 'images'>): boolean {
  return !!card.isFlipped && !card.images?.back?.normal;
}

/**
 * Total rotation in degrees: the card's own base rotation plus its state tilt.
 * Tapped (90°) and summoning-sick (45°) are mutually exclusive — a card is in
 * exactly one physical position — so tap wins if both flags are somehow set.
 */
export function resolveCardRotation(card: Pick<Card, 'rotation' | 'isTapped' | 'isSick'>): number {
  const stateTilt = card.isTapped ? 90 : card.isSick ? 45 : 0;
  return (card.rotation ?? 0) + stateTilt;
}
