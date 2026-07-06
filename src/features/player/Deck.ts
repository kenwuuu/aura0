import { Card } from './types';
import { makeCardId } from '@/shared/utils/ids';

export class Deck {
  private cards: Card[] = [];

  constructor(cards?: Card[], numDummyCards?: number) {
    // Use provided cards if available, otherwise initialize with blank cards
    if (cards && cards.length > 0) {
      // Regenerate unique IDs for all cards to prevent collisions when multiple players use the same deck
      this.cards = cards.map(card => ({
        ...card,
        id: makeCardId(),
      }));
    } else {
      this.initializeDeckWithDummyCards(numDummyCards);
    }
  }

  private initializeDeckWithDummyCards(numDummyCards: number = 0): void {
    for (let i = 0; i < numDummyCards; i++) {
      this.cards.push({
        id: makeCardId(),
        cardNumber: i + 1, // Start from 1
        x: 100,
        y: 100,
        rotation: 0,
        isTapped: false,
        isFlipped: false,
        counters: [],
      });
    }
  }

  public getCards(): Card[] {
    return [...this.cards];
  }

  public getCardCount(): number {
    return this.cards.length;
  }
}