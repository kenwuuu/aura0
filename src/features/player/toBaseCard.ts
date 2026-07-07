import { Card } from './types';

/**
 * Strip battlefield-only fields (zIndex, ownerId) from a board card, leaving
 * the base Card shape a Player pile expects. Generic over the extra fields so
 * this doesn't need to import battlefield's WhiteboardCard type.
 */
export function toBaseCard(card: Card & Record<'zIndex' | 'ownerId', unknown>): Card {
  const { zIndex, ownerId, ...baseCard } = card;
  return baseCard;
}
