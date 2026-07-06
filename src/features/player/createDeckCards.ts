import { Card } from './types';
import { makeCardId } from '@/shared/utils/ids';

/**
 * Regenerate ids for a set of cards, e.g. when loading a saved deck, so
 * multiple players (or reloads) using the same deck list never collide on id.
 */
export function createDeckCards(cards: Card[]): Card[] {
  return cards.map(card => ({ ...card, id: makeCardId() }));
}
