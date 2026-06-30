import * as Y from 'yjs';
import * as Sentry from '@sentry/browser';
import posthog from 'posthog-js';
import { Card } from './types';
import { Deck } from './Deck';
import { PlayerState, PlayerConfig, CustomCounter } from './types';
import {
  YDOC_CARDS_ON_BOARD,
  YSTATE_DISCARD_PILE,
  YSTATE_HEALTH,
  YSTATE_HAND,
  YSTATE_EXILE_PILE,
  YDOC_PLAYER,
  YSTATE_CUSTOM_COUNTERS,
  YSTATE_DECK, YDOC_KEYWORD_TOKENS,
  YSTATE_PLAYER_NAME,
  YSTATE_JOINED_AT,
  YSTATE_CAN_VIEW_HAND,
} from "@/constants";
import { getStoredPlayerName, setStoredPlayerName } from "@/infrastructure/networking/persistence";
import {PileType} from '@/features/game-dock/components';
import { CardPile } from './CardPile';
import {SavedDeck} from "@/features/player/types";
import {trackHealthChange} from "@/infrastructure/analytics/PosthogFunctions"
import { logAction } from '@/features/action-log/actionLog';

export class Player {
  private playerId: string;
  private yDoc: Y.Doc;
  public yPlayerState: Y.Map<any>;
  private yCardsOnBoard: Y.Map<any>; // Battlefield cards
  private yTokens: Y.Map<any>; // Keyword tokens on battlefield
  private config: PlayerConfig;
  private deck: CardPile;
  private hand: CardPile;
  private exile: CardPile;
  private discard: CardPile;
  private scry: CardPile;
  private piles: Record<PileType, CardPile>;

  // Tracks own-hand size to detect remote merges that clobber local hand state.
  private lastHandLen: number = 0;

  // posthog
  private healthEventTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    playerId: string,
    yDoc: Y.Doc,
    initialDeckCards: Deck | null = null,
    config: Partial<PlayerConfig> = {}
  ) {
    this.playerId = playerId;
    this.yDoc = yDoc;
    this.config = {
      initialHealth: config.initialHealth ?? 40,
    };

    this.yPlayerState = yDoc.getMap(YDOC_PLAYER(playerId));
    this.yCardsOnBoard = yDoc.getMap(YDOC_CARDS_ON_BOARD); // Store reference to battlefield
    this.yTokens = yDoc.getMap(YDOC_KEYWORD_TOKENS); // Store reference to keyword tokens

    // Initialize state first so yPlayerState has the arrays
    const deck = initialDeckCards ?? new Deck();
    this.initializeState(deck);

    // Seed this player's display name into their own Yjs state so peers see it.
    // The local player owns this state, so localStorage (the name that follows the
    // user across rooms) is authoritative; fall back to a short slice of the ID.
    this.yPlayerState.set(YSTATE_PLAYER_NAME, getStoredPlayerName() ?? this.getDefaultName());

    // Create CardPile instances that reference yPlayerState
    this.deck = new CardPile(this.yPlayerState, YSTATE_DECK);
    this.hand = new CardPile(this.yPlayerState, YSTATE_HAND);
    this.exile = new CardPile(this.yPlayerState, YSTATE_EXILE_PILE);
    this.discard = new CardPile(this.yPlayerState, YSTATE_DISCARD_PILE);
    this.scry = new CardPile(this.yPlayerState, 'scry');

    this.piles = {
      hand: this.hand,
      deck: this.deck,
      discard: this.discard,
      exile: this.exile,
      scry: this.scry,
    };

    this.lastHandLen = this.hand.getCards().length;
    this.watchForHandClobber();
  }

  /**
   * The local player is the sole author of their own hand, so a *non-local*
   * transaction (IndexedDB restore or a peer) that shrinks it is the signature
   * of a CRDT merge clobbering local state — e.g. seeding empty defaults into a
   * not-yet-synced doc on refresh (fixed by awaiting whenSynced() in bootstrap,
   * before constructing Player). If it ever happens again, surface it loudly
   * rather than silently losing the player's hand.
   */
  private watchForHandClobber(): void {
    this.yPlayerState.observe((event, transaction) => {
      if (!event.keysChanged.has(YSTATE_HAND)) return;
      const newLen = ((this.yPlayerState.get(YSTATE_HAND) ?? []) as Card[]).length;
      const prevLen = this.lastHandLen;
      this.lastHandLen = newLen;

      if (!transaction.local && newLen < prevLen) {
        const origin = (transaction.origin as any)?.constructor?.name ?? String(transaction.origin);
        console.error(
          `[Aura] Hand clobbered by remote merge: ${prevLen} -> ${newLen} cards (origin: ${origin})`,
        );
        posthog.capture('hand_clobbered', {
          prev_hand_size: prevLen,
          new_hand_size: newLen,
          origin,
        });
        Sentry.captureMessage('Hand clobbered by remote merge', {
          level: 'error',
          extra: {
            playerId: this.playerId,
            prevHandSize: prevLen,
            newHandSize: newLen,
            origin,
          },
        });
      }
    });
  }

  private initializeState(initialDeckCards: Deck): void {
    if (!this.yPlayerState.has(YSTATE_HEALTH)) {
      this.yPlayerState.set(YSTATE_HEALTH, this.config.initialHealth);
      this.yPlayerState.set(YSTATE_DECK, initialDeckCards.getCards());
      this.yPlayerState.set(YSTATE_HAND, []);
      this.yPlayerState.set(YSTATE_EXILE_PILE, []);
      this.yPlayerState.set(YSTATE_DISCARD_PILE, []);
      this.yPlayerState.set('scry', []);
      this.yPlayerState.set(YSTATE_CUSTOM_COUNTERS, []);
      this.yPlayerState.set('deckRevealCount', 0); // 0=hidden, -1=all, N>0=top N cards
    }
    // Write joinedAt once — determines stable seat order across all peers.
    // Written separately so reconnecting players keep their original seat.
    if (!this.yPlayerState.has(YSTATE_JOINED_AT)) {
      this.yPlayerState.set(YSTATE_JOINED_AT, Date.now());
    }
  }

  // Deprecated: CardPile now syncs directly to yPlayerState
  // Keeping for backward compatibility but it's a no-op
  public syncToYState(): void {
    // CardPile instances now sync automatically to yPlayerState
    // This method is kept for backward compatibility but does nothing
  }

  private getDefaultName(): string {
    return this.playerId.slice(0, 9);
  }

  public getName(): string {
    return (this.yPlayerState.get(YSTATE_PLAYER_NAME) as string | undefined) ?? this.getDefaultName();
  }

  /**
   * Update this player's display name. Syncs to other peers via Yjs and persists
   * locally so the name follows the user across rooms and reloads. Empty/whitespace
   * names fall back to the default (short player ID).
   */
  public setName(name: string): void {
    const trimmed = name.trim();
    const newName = trimmed.length > 0 ? trimmed : this.getDefaultName();
    this.yPlayerState.set(YSTATE_PLAYER_NAME, newName);
    setStoredPlayerName(newName);
  }

  public getState(): PlayerState {
    return {
      id: this.playerId,
      name: this.getName(),
      health: this.yPlayerState.get(YSTATE_HEALTH) ?? this.config.initialHealth,
      hand: this.yPlayerState.get(YSTATE_HAND) ?? [],
      exilePile: this.yPlayerState.get(YSTATE_EXILE_PILE) ?? [],
      discardPile: this.yPlayerState.get(YSTATE_DISCARD_PILE) ?? [],
      deck: this.yPlayerState.get(YSTATE_DECK) ?? [],
      customCounters: this.yPlayerState.get(YSTATE_CUSTOM_COUNTERS) ?? [],
    };
  }

  public async loadNewDeck(newDeck: SavedDeck): Promise<void> {
    // Replace deck cards with new deck
    this.deck.setCards(newDeck.cards);

    // get cards
    const deckCards: Card[] = this.deck.getCards();

    if (deckCards.length > 0) {  // TODO: change logic based on if deck is commander or not
      // move commander to hand
      const commander: Card = deckCards[deckCards.length - 1];
      this.deck.removeCardById(commander.id);
      this.deck.addCardToTop(commander);
      this.drawCard(false); // opening hand draws suppressed; deck-load is its own event

      this.deck.shuffle();

      // draw 7 — suppressed from action log; deck-load is its own event
      for (let i = 0; i < 7; i++) {
        this.drawCard(false);
        await new Promise(r => setTimeout(r, 20));
      }
    }
  }

  public drawCard(logToActionLog = true): Card | null {
    const card: Card | null = this.deck.drawCard();
    if (!card) return null;

    this.hand.addCardToTop(card);
    this.syncToYState();

    posthog.capture('card_drawn', {
      hand_size: this.hand.getCards().length,
      deck_size: this.deck.getCards().length,
    });

    if (logToActionLog) {
      logAction(this.yDoc, {
        actorId: this.playerId,
        type: 'draw',
        text: 'drew a card',
      });
    }

    return card;
  }

  // move board to hand. move hand, discard, and exile to deck. keep deck loaded. reset health
  // equivalent to resetting in IRL game
  public reset() {
    posthog.capture('game_reset');
    // Step 1: Move all battlefield cards owned by this player back to deck
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

    // Remove all keyword tokens owned by this player from battlefield
    this.yTokens.forEach((token: any, tokenId: string) => {
      if (token.ownerId === this.playerId) {
        this.yTokens.delete(tokenId);
      }
    });

    // Step 2: Move all cards from hand, discard, and exile back to deck
    [...battlefieldCards, ...this.hand.getCards(), ...this.discard.getCards(), ...this.exile.getCards()].forEach(card => {
      this.deck.addCardToBottom(card);
    });

    // Step 3: Clear all piles
    this.hand.clear();
    this.discard.clear();
    this.exile.clear();

    // Step 4: Reset health to initial value
    this.yPlayerState.set(YSTATE_HEALTH, this.config.initialHealth);

    // Step 5: Shuffle deck and sync
    this.deck.shuffle();
    this.syncToYState();
  }

  public removeCardFromHand(cardId: string): Card | null {
    const card: Card | null = this.hand.removeCardById(cardId);
    this.syncToYState();
    return card;
  }

  public removeCardFromPileById(cardId: string, pileType: PileType): Card | null {
    let result: Card | null = this.piles[pileType].removeCardById(cardId);
    this.syncToYState();
    return result;
  }

  public drawCardFromPile(pileType: 'deck' | 'discard' | 'exile'): Card | null {
    let result: Card | null = this.piles[pileType].drawCard();
    this.syncToYState();
    return result;
  }

  public placeCardInPile(card: Card, pileType: PileType, position: number = Infinity): void {
    // Places card on top of pile by default
    this.piles[pileType].placeCardAtPosition(card, position);
    this.syncToYState();
  }

  public setHealth(health: number): void {
    this.yPlayerState.set(YSTATE_HEALTH, health);
  }

  /** Toggle whether opponents can view this player's hand cards. */
  public setAllowViewHand(allow: boolean): void {
    this.yPlayerState.set(YSTATE_CAN_VIEW_HAND, allow);
  }

  public getAllowViewHand(): boolean {
    return (this.yPlayerState.get(YSTATE_CAN_VIEW_HAND) as boolean | undefined) ?? false;
  }

  public modifyHealth(delta: number): void {
    const currentHealth: number = this.yPlayerState.get(YSTATE_HEALTH) ?? this.config.initialHealth;
    this.yPlayerState.set(YSTATE_HEALTH, currentHealth + delta);

    if (this.healthEventTimer) clearTimeout(this.healthEventTimer);
    this.healthEventTimer = setTimeout(() => {
      const newHealth = this.yPlayerState.get(YSTATE_HEALTH) as number;
      trackHealthChange(newHealth);
      // Debounced log: rapid +/- presses collapse into a single entry.
      logAction(this.yDoc, {
        actorId: this.playerId,
        type: 'health',
        text: `life total is now ${newHealth}`,
      });
      this.healthEventTimer = null;
    }, 1000);
  }

  public shuffleDeck(): void {
    this.deck.shuffle();
    logAction(this.yDoc, {
      actorId: this.playerId,
      type: 'shuffle',
      text: 'shuffled their deck',
    });
  }

  public mulligan(cardsToDraw: number = 7): void {
    const handSizeBefore = this.hand.getCards().length;
    posthog.capture('mulligan_taken', {
      hand_size_before: handSizeBefore,
      cards_to_draw: cardsToDraw,
    });
    logAction(this.yDoc, {
      actorId: this.playerId,
      type: 'mulligan',
      text: `took a mulligan (drew ${cardsToDraw} cards)`,
    });

    // Move all cards from hand back to deck
    this.hand.getCards().forEach((card: Card) => {
      this.deck.addCardToBottom(card);
    });

    // Clear hand
    this.hand.clear();

    // Shuffle deck
    this.deck.shuffle();

    // Draw new hand — suppress per-draw log entries; the mulligan event above covers it.
    for (let i: number = 0; i < cardsToDraw; i++) {
      this.drawCard(false);
    }
  }

  public getId(): string {
    return this.playerId;
  }

  public getDeckCards(): Card[] {
    return this.deck.getCards();
  }

  public getDeck(): CardPile {
    return this.deck;
  }

  public getHand(): CardPile {
    return this.hand;
  }

  public getExilePile(): CardPile {
    return this.exile;
  }

  public getDiscardPile(): CardPile {
    return this.discard;
  }

  public getScryPile(): CardPile {
    return this.scry;
  }

  public moveCardToDeckTop(card: Card): void {
    this.deck.addCardToTop(card);
    this.syncToYState();
  }

  public moveCardToDeckBottom(card: Card): void {
    this.deck.addCardToBottom(card);
    this.syncToYState();
  }

  public onStateChange(callback: (state: PlayerState) => void): void {
    this.yPlayerState.observe(() => {
      callback(this.getState());
    });
  }

  public addCustomCounter(title: string, icon: string): void {
    const counters = this.yPlayerState.get(YSTATE_CUSTOM_COUNTERS) ?? [];
    const newCounter: CustomCounter = {
      id: `counter-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      title,
      icon,
      value: 0,
    };
    this.yPlayerState.set(YSTATE_CUSTOM_COUNTERS, [...counters, newCounter]);
  }

  public modifyCustomCounter(counterId: string, delta: number): void {
    const counters = this.yPlayerState.get(YSTATE_CUSTOM_COUNTERS) ?? [];
    const updatedCounters = counters.map((counter: CustomCounter) =>
      counter.id === counterId
        ? { ...counter, value: counter.value + delta }
        : counter
    );
    this.yPlayerState.set(YSTATE_CUSTOM_COUNTERS, updatedCounters);
  }

  public removeCustomCounter(counterId: string): void {
    const counters = this.yPlayerState.get(YSTATE_CUSTOM_COUNTERS) ?? [];
    const updatedCounters = counters.filter((counter: CustomCounter) => counter.id !== counterId);
    this.yPlayerState.set(YSTATE_CUSTOM_COUNTERS, updatedCounters);
  }

  public reorderHand(newOrder: Card[]): void {
    this.yPlayerState.set('hand', newOrder);
  }

  public flipHandCard(cardId: string): void {
    const hand = this.hand.getCards();
    const card = hand.find(c => c.id === cardId);
    if (card) {
      const updatedCard = { ...card, isFlipped: !card.isFlipped };
      const updatedHand = hand.map(c => c.id === cardId ? updatedCard : c);
      this.yPlayerState.set('hand', updatedHand);
    }
  }

  public getYPlayerState(): Y.Map<any> {
    return this.yPlayerState;
  }
}