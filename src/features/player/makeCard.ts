import { Card } from './types';
import { makeCardId } from '@/shared/utils/ids';

/** Build a Card with sane defaults (fresh id, origin position, untapped/unflipped, no counters). */
export function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: makeCardId(),
    cardNumber: -1,
    x: 100,
    y: 100,
    rotation: 0,
    isTapped: false,
    isSick: false,
    isFlipped: false,
    counters: [],
    ...overrides,
  };
}
