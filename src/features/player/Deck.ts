import { Card } from './types';

export class Deck {
  private cards: Card[] = [];

  constructor(cards?: Card[], numDummyCards?: number) {
    // Use provided cards if available, otherwise initialize with blank cards
    if (cards && cards.length > 0) {
      // Regenerate unique IDs for all cards to prevent collisions when multiple players use the same deck
      this.cards = cards.map(card => ({
        ...card,
        id: `card-${Math.random().toString(36).substring(2, 11)}`,
      }));
    } else {
      this.initializeDeckWithDummyCards(numDummyCards);
    }
  }

  private initializeDeckWithDummyCards(numDummyCards: number = 0): void {
    for (let i = 0; i < numDummyCards; i++) {
      this.cards.push({
        id: `card-${Math.random().toString(36).substring(2, 11)}`,
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