import * as Y from 'yjs';
import { Card, Deck } from '../deck';
import { PlayerState, PlayerConfig } from './types';

export class Player {
  private playerId: string;
  private yPlayerState: Y.Map<any>;
  private yCardsOnBoard: Y.Map<any>; // Battlefield cards
  private deck: Deck;
  private config: PlayerConfig;

  constructor(
    playerId: string,
    yDoc: Y.Doc,
    deck: Deck,
    config: Partial<PlayerConfig> = {}
  ) {
    this.playerId = playerId;
    this.deck = deck;
    this.config = {
      initialHealth: config.initialHealth ?? 40,
    };

    this.yPlayerState = yDoc.getMap(`player-${playerId}`);
    this.yCardsOnBoard = yDoc.getMap('cards'); // Store reference to battlefield
    this.initializeState();
  }

  private initializeState(): void {
    if (!this.yPlayerState.has('health')) {
      this.yPlayerState.set('health', this.config.initialHealth);
      this.yPlayerState.set('hand', []);
      this.yPlayerState.set('exilePile', []);
      this.yPlayerState.set('discardPile', []);
      this.yPlayerState.set('deckCardCount', this.deck.getCardCount());
    }
  }

  public getState(): PlayerState {
    return {
      id: this.playerId,
      health: this.yPlayerState.get('health') ?? this.config.initialHealth,
      hand: this.yPlayerState.get('hand') ?? [],
      exilePile: this.yPlayerState.get('exilePile') ?? [],
      discardPile: this.yPlayerState.get('discardPile') ?? [],
      deckCardCount: this.yPlayerState.get('deckCardCount') ?? 0,
    };
  }

  public loadNewDeck(newDeck: Deck): void {
    // assign deck
    this.deck = newDeck;

    // get cards
    const deckCards = this.deck.getCards();

    if (deckCards.length > 0) {  // TODO: change logic based on if deck is commander or not
      // bring commander to hand
      const commander = deckCards[deckCards.length - 1];
      this.deck.removeCard(commander.id);
      this.deck.addCardToTop(commander);
      this.drawCard();

      this.deck.shuffleDeck();
    }
  }

  public drawCard(): Card | null {
    const card = this.deck.drawCard();
    if (!card) return null;

    const hand = this.yPlayerState.get('hand') ?? [];
    this.yPlayerState.set('hand', [...hand, card]);
    this.yPlayerState.set('deckCardCount', this.deck.getCardCount());

    return card;
  }

  // move board to hand. move hand, discard, and exile to deck. keep deck loaded. reset health
  // equivalent to resetting in IRL game
  public reset() {
    // Step 1: Move all battlefield cards owned by this player to hand
    const battlefieldCards: Card[] = [];
    this.yCardsOnBoard.forEach((card: any, cardId: string) => {
      if (card.ownerId === this.playerId) {
        // Remove WhiteboardCard-specific properties (zIndex, ownerId) to get base Card
        const { zIndex, ownerId, ...baseCard } = card;
        battlefieldCards.push(baseCard as Card);
        // Remove from battlefield
        this.yCardsOnBoard.delete(cardId);
      }
    });

    // Step 2: Get all cards from hand, discard, and exile
    const hand = this.yPlayerState.get('hand') ?? [];
    const discardPile = this.yPlayerState.get('discardPile') ?? [];
    const exilePile = this.yPlayerState.get('exilePile') ?? [];

    // Step 3: Move all cards (battlefield + hand + discard + exile) back to deck
    [...battlefieldCards, ...hand, ...discardPile, ...exilePile].forEach(card => {
      this.deck.addCardToBottom(card);
    });

    // Step 4: Clear all piles in synced state
    this.yPlayerState.set('hand', []);
    this.yPlayerState.set('discardPile', []);
    this.yPlayerState.set('exilePile', []);

    // Step 5: Reset health to initial value
    this.yPlayerState.set('health', this.config.initialHealth);

    // Step 6: Update deck count and shuffle
    this.yPlayerState.set('deckCardCount', this.deck.getCardCount());
    this.deck.shuffleDeck();
  }

  public playCardFromHand(cardId: string): Card | null {
    const hand = this.yPlayerState.get('hand') ?? [];
    const cardIndex = hand.findIndex((c: Card) => c.id === cardId);

    if (cardIndex === -1) return null;

    const card = hand[cardIndex];
    const newHand = [...hand.slice(0, cardIndex), ...hand.slice(cardIndex + 1)];
    this.yPlayerState.set('hand', newHand);

    return card;
  }

  public moveCardToDiscard(card: Card): void {
    const discardPile = this.yPlayerState.get('discardPile') ?? [];
    this.yPlayerState.set('discardPile', [...discardPile, card]);
  }

  public moveCardToExile(card: Card): void {
    const exilePile = this.yPlayerState.get('exilePile') ?? [];
    this.yPlayerState.set('exilePile', [...exilePile, card]);
  }

  public setHealth(health: number): void {
    this.yPlayerState.set('health', health);
  }

  public modifyHealth(delta: number): void {
    const currentHealth = this.yPlayerState.get('health') ?? this.config.initialHealth;
    this.yPlayerState.set('health', currentHealth + delta);
  }

  public shuffleDeck(): void {
    this.deck.shuffleDeck();
  }

  public mulligan(cardsToDraw: number = 7): void {
    // Move all cards from hand back to deck
    const hand = this.yPlayerState.get('hand') ?? [];
    hand.forEach((card: Card) => {
      this.deck.addCardToBottom(card);
    });

    // Clear hand in synced state
    this.yPlayerState.set('hand', []);

    // Shuffle deck
    this.deck.shuffleDeck();

    // Update deck count
    this.yPlayerState.set('deckCardCount', this.deck.getCardCount());

    // Draw new hand
    for (let i = 0; i < cardsToDraw; i++) {
      this.drawCard();
    }
  }

  public getId(): string {
    return this.playerId;
  }

  public getDeckCards(): Card[] {
    return this.deck.getCards();
  }
  
  public moveCardToDeckTop(card: Card): void {
    this.deck.addCardToTop(card);
    this.yPlayerState.set('deckCardCount', this.deck.getCardCount());
  }

  public moveCardToDeckBottom(card: Card): void {
    this.deck.addCardToBottom(card);
    this.yPlayerState.set('deckCardCount', this.deck.getCardCount());
  }

  public onStateChange(callback: (state: PlayerState) => void): void {
    this.yPlayerState.observe(() => {
      callback(this.getState());
    });
  }
}