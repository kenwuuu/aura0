import * as Y from 'yjs';
import * as Sentry from '@sentry/browser';
import posthog from 'posthog-js';
import { Card, PileType, PUBLIC_PILES } from './types';
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
  YSTATE_PLAYER_COLOR,
  YSTATE_JOINED_AT,
  YSTATE_CAN_VIEW_HAND,
  YSTATE_SCRY,
  YSTATE_SIDEBOARD,
  YSTATE_DECK_REVEAL_COUNT,
} from "@/constants";
import { getStoredPlayerName, setStoredPlayerName } from "@/infrastructure/networking/persistence";
import { describeTransactionOrigin } from "@/infrastructure/networking/transactionOrigin";
import { colorFromPlayerId } from './playerColor';
import { CardPile } from './CardPile';
import {SavedDeck} from "@/features/player/types";
import {trackHealthChange, trackPlayerCounterChange} from "@/infrastructure/analytics/PosthogFunctions"
import { logAction, cardLogName } from '@/features/action-log/actionLog';
import { makeCounterId } from '@/shared/utils/ids';
import { toBaseCard } from './toBaseCard';
import { resolvePlayerName } from '@/shared/utils/resolvePlayerName';

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
  private sideboard: CardPile;
  private piles: Record<PileType, CardPile>;

  // Tracks own-hand size to detect remote merges that clobber local hand state.
  private lastHandLen: number = 0;

  // Debounced action-log bookkeeping for health/counter changes. Keyed by
  // target playerId (health) or counterId (counters, already globally unique
  // via makeCounterId — no separate per-target keying needed) so rapid +/-
  // presses on different targets never clobber each other's pending entry.
  private healthEventTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private healthBeforeBurst: Map<string, number> = new Map();
  private counterEventTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private counterBeforeBurst: Map<string, number> = new Map();

  constructor(
    playerId: string,
    yDoc: Y.Doc,
    initialDeckCards: Card[] | null = null,
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
    const isFirstJoin = this.initializeState(initialDeckCards ?? []);

    // Seed this player's display name into their own Yjs state so peers see it.
    // The local player owns this state, so localStorage (the name that follows the
    // user across rooms) is authoritative; fall back to a short slice of the ID.
    this.yPlayerState.set(YSTATE_PLAYER_NAME, getStoredPlayerName() ?? this.getDefaultName());
    // Seed a stable identity color. Deterministic from playerId so it's consistent
    // without needing localStorage. A future picker can call setColor() to override.
    this.yPlayerState.set(YSTATE_PLAYER_COLOR, colorFromPlayerId(playerId));

    // Create CardPile instances that reference yPlayerState
    this.deck = new CardPile(this.yPlayerState, YSTATE_DECK);
    this.hand = new CardPile(this.yPlayerState, YSTATE_HAND);
    this.exile = new CardPile(this.yPlayerState, YSTATE_EXILE_PILE);
    this.discard = new CardPile(this.yPlayerState, YSTATE_DISCARD_PILE);
    this.scry = new CardPile(this.yPlayerState, YSTATE_SCRY);
    this.sideboard = new CardPile(this.yPlayerState, YSTATE_SIDEBOARD);

    this.piles = {
      hand: this.hand,
      deck: this.deck,
      discard: this.discard,
      exile: this.exile,
      scry: this.scry,
      sideboard: this.sideboard,
    };

    this.lastHandLen = this.hand.getCards().length;
    this.watchForHandClobber();

    // Announce the player's arrival to the room. Gated on the same once-per-room
    // condition as joinedAt, so a refresh or a reconnect — which restores the
    // existing player state rather than creating it — never re-announces them.
    if (isFirstJoin) {
      logAction(this.yDoc, {
        actorId: playerId,
        type: 'join',
        text: 'joined the game',
        // Soft green: an arrival is worth spotting in a wall of card moves.
        tone: 'rgba(130,220,170,0.95)',
      });
    }
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
        const origin = describeTransactionOrigin(transaction.origin);
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

  /**
   * @returns true when this player is entering the room for the first time
   *          (no prior state in the doc), false on a refresh/reconnect.
   */
  private initializeState(initialDeckCards: Card[]): boolean {
    if (!this.yPlayerState.has(YSTATE_HEALTH)) {
      this.yPlayerState.set(YSTATE_HEALTH, this.config.initialHealth);
      this.yPlayerState.set(YSTATE_DECK, initialDeckCards);
      this.yPlayerState.set(YSTATE_HAND, []);
      this.yPlayerState.set(YSTATE_EXILE_PILE, []);
      this.yPlayerState.set(YSTATE_DISCARD_PILE, []);
      this.yPlayerState.set(YSTATE_SCRY, []);
      this.yPlayerState.set(YSTATE_SIDEBOARD, []);
      this.yPlayerState.set(YSTATE_CUSTOM_COUNTERS, []);
      this.yPlayerState.set(YSTATE_DECK_REVEAL_COUNT, 0);
    }
    // Write joinedAt once — determines stable seat order across all peers.
    // Written separately so reconnecting players keep their original seat.
    const isFirstJoin = !this.yPlayerState.has(YSTATE_JOINED_AT);
    if (isFirstJoin) {
      this.yPlayerState.set(YSTATE_JOINED_AT, Date.now());
    }
    return isFirstJoin;
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

  public getColor(): string {
    return (this.yPlayerState.get(YSTATE_PLAYER_COLOR) as string | undefined) ?? colorFromPlayerId(this.playerId);
  }

  /** Override the identity color. Syncs to peers via Yjs. */
  public setColor(color: string): void {
    this.yPlayerState.set(YSTATE_PLAYER_COLOR, color);
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
      sideboard: this.yPlayerState.get(YSTATE_SIDEBOARD) ?? [],
      customCounters: this.yPlayerState.get(YSTATE_CUSTOM_COUNTERS) ?? [],
    };
  }

  public getSideboardCards(): Card[] {
    return this.sideboard.getCards();
  }

  public async loadNewDeck(newDeck: SavedDeck): Promise<void> {
    // Replace deck cards with new deck
    this.deck.setCards(newDeck.cards);
    // A deck saved before sideboards existed has no `sideboard` — that's an
    // empty sideboard, not a missing one. Set it either way, so loading a deck
    // without one clears whatever the previous deck left behind.
    this.sideboard.setCards(newDeck.sideboard ?? []);

    // get cards
    const deckCards: Card[] = this.deck.getCards();

    if (deckCards.length === 0) {
      return;
    }

    // Auto-draw the commander(s) into the opening hand. Commanders are flagged
    // at import time from a COMMANDER section header (see DeckListParser); a
    // deck with none — a standard deck, or a list pasted without headers —
    // just gets a normal 7-card opening hand.
    const commanders = deckCards.filter((card) => card.commander);
    for (const commander of commanders) {
      this.deck.removeCardById(commander.id);
      this.deck.addCardToTop(commander);
      this.drawCard(false); // opening hand draws suppressed; deck-load is its own event
    }

    this.deck.shuffle();

    // draw 7 — suppressed from action log; deck-load is its own event
    for (let i = 0; i < 7; i++) {
      this.drawCard(false);
      await new Promise(r => setTimeout(r, 20));
    }
  }

  public drawCard(logToActionLog = true): Card | null {
    const card: Card | null = this.deck.drawCard();
    if (!card) return null;

    this.hand.addCardToTop(card);

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
        battlefieldCards.push(toBaseCard(card));
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

    // Step 2: Move all cards from hand, discard, and exile back to deck.
    // The sideboard is deliberately absent: it is not part of the deck, so
    // sweeping it in here would turn a 60-card deck into a 75-card one on every
    // reset. It survives a reset untouched, the way it survives a game.
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
  }

  public removeCardFromHand(cardId: string): Card | null {
    const card: Card | null = this.hand.removeCardById(cardId);
    return card;
  }

  public removeCardFromPileById(cardId: string, pileType: PileType): Card | null {
    let result: Card | null = this.piles[pileType].removeCardById(cardId);
    return result;
  }

  public drawCardFromPile(pileType: PileType): Card | null {
    let result: Card | null = this.piles[pileType].drawCard();
    return result;
  }

  /** Peek the top card of a pile without removing it — for callers that decide
   * whether/where to move it via movePileCard(). */
  public peekTopOfPile(pileType: PileType): Card | null {
    return this.piles[pileType].peekTop();
  }

  public placeCardInPile(card: Card, pileType: PileType, position: number = Infinity): void {
    // Places card on top of pile by default
    this.piles[pileType].placeCardAtPosition(card, position);
  }

  /**
   * Replace a pile's contents with a reordered copy of the same cards — the
   * persistence path for pile-viewer drag-to-reorder (the sibling of
   * reorderHand for the non-hand piles). Callers pass the new stored order.
   */
  public reorderPile(pileType: PileType, newOrder: Card[]): void {
    this.piles[pileType].setCards(newOrder);
  }

  /**
   * Move a card from one pile to another as a single logged action.
   * Centralizes the remove+place+log sequence that pile-viewer callbacks and
   * hotkeys both need, so no caller can move a card without it being logged.
   */
  public movePileCard(card: Card, from: PileType, to: PileType, position: number = Infinity): void {
    this.piles[from].removeCardById(card.id);
    this.piles[to].placeCardAtPosition(card, position);

    const name = this.logNameForMove(card, from, to);
    const text = to === 'deck'
      ? `put ${name} on ${position === 0 ? 'bottom' : 'top'} of deck`
      : `moved ${name} to ${to}`;
    logAction(this.yDoc, { actorId: this.playerId, type: 'move_to_pile', text });
  }

  /**
   * What to call a card in the shared log when it moves between two piles.
   *
   * A sideboard is private: opponents may know how many cards are in it, but
   * never which. The action log is broadcast to every peer, so naming a card on
   * its way into or out of the sideboard would leak exactly what the zone is
   * meant to hide — and unlike a face-down card, there's no in-game moment that
   * ever reveals it.
   *
   * The exception is a move whose other end is a zone opponents can already see
   * (exile, discard) or the battlefield: the move itself puts the card in plain
   * sight, so withholding the name buys no privacy and only makes the log lie
   * about a card everyone is looking at.
   */
  private logNameForMove(card: Card, from: PileType, to: PileType): string {
    const touchesSideboard = from === 'sideboard' || to === 'sideboard';
    const revealedByMove = PUBLIC_PILES.has(from) || PUBLIC_PILES.has(to);
    if (touchesSideboard && !revealedByMove) {
      return 'a card';
    }
    return cardLogName(card);
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

  /** This player's own state map, or a specific opponent's, keyed the same way. */
  private getPlayerStateMap(targetPlayerId: string): Y.Map<any> {
    return targetPlayerId === this.playerId ? this.yPlayerState : this.yDoc.getMap(YDOC_PLAYER(targetPlayerId));
  }

  /**
   * Modify a player's health — the local player by default, or a specific
   * opponent's when targetPlayerId is given (the only mutation the local
   * player is allowed to make on someone else's state, since there's no
   * per-opponent Player instance). Debounces the action-log entry so rapid
   * +/- presses collapse into a single entry, keyed per target so pressing
   * two players' health widgets in the same window logs both independently.
   */
  public modifyHealth(delta: number, targetPlayerId: string = this.playerId): void {
    const map = this.getPlayerStateMap(targetPlayerId);
    const currentHealth: number = map.get(YSTATE_HEALTH) ?? this.config.initialHealth;
    const newHealth = currentHealth + delta;
    map.set(YSTATE_HEALTH, newHealth);

    // Capture the health at the start of the burst, not just the immediately-preceding call.
    if (!this.healthBeforeBurst.has(targetPlayerId)) this.healthBeforeBurst.set(targetPlayerId, currentHealth);

    const existingTimer = this.healthEventTimers.get(targetPlayerId);
    if (existingTimer) clearTimeout(existingTimer);

    this.healthEventTimers.set(targetPlayerId, setTimeout(() => {
      const finalHealth = map.get(YSTATE_HEALTH) as number;
      const before = this.healthBeforeBurst.get(targetPlayerId);
      if (targetPlayerId === this.playerId) {
        trackHealthChange(finalHealth);
        logAction(this.yDoc, {
          actorId: this.playerId,
          type: 'health',
          text: `changed their life from ${before} to ${finalHealth}`,
        });
      } else {
        const targetName = resolvePlayerName(this.yDoc, targetPlayerId);
        logAction(this.yDoc, {
          actorId: this.playerId,
          type: 'health',
          text: `changed ${targetName}'s life from ${before} to ${finalHealth}`,
        });
      }
      this.healthEventTimers.delete(targetPlayerId);
      this.healthBeforeBurst.delete(targetPlayerId);
    }, 500));
  }

  public shuffleDeck(): void {
    this.deck.shuffle();
    logAction(this.yDoc, {
      actorId: this.playerId,
      type: 'shuffle',
      text: 'shuffled their deck',
    });
  }

  /** Draw N cards from the top of the deck into hand. */
  public drawCards(n: number): void {
    let drawn = 0;
    for (let i = 0; i < n; i++) {
      if (this.drawCard(false)) drawn++;
    }
    if (drawn > 0) {
      logAction(this.yDoc, {
        actorId: this.playerId,
        type: 'draw',
        text: `drew ${drawn} card${drawn === 1 ? '' : 's'}`,
      });
    }
  }

  /** Mill the top N cards from the deck into the discard pile. */
  public mill(n: number): void {
    let milled = 0;
    for (let i = 0; i < n; i++) {
      const card = this.deck.drawCard();
      if (!card) break;
      this.discard.addCardToTop(card);
      milled++;
    }
    if (milled > 0) {
      logAction(this.yDoc, {
        actorId: this.playerId,
        type: 'mill',
        text: `milled ${milled} card${milled === 1 ? '' : 's'}`,
      });
    }
  }

  /** Move the top card of the deck to exile. */
  public exileTopOfDeck(): void {
    const card = this.deck.drawCard();
    if (!card) return;
    this.exile.addCardToTop(card);
    logAction(this.yDoc, {
      actorId: this.playerId,
      type: 'move_to_pile',
      text: `exiled ${cardLogName(card)} from the top of their deck`,
    });
  }

  /** Discard a random card from hand. */
  public randomDiscard(): void {
    const hand = this.hand.getCards();
    if (hand.length === 0) return;
    const idx = Math.floor(Math.random() * hand.length);
    const card = hand[idx];
    this.hand.removeCardById(card.id);
    this.discard.addCardToTop(card);
    logAction(this.yDoc, {
      actorId: this.playerId,
      type: 'random_discard',
      text: `randomly discarded ${cardLogName(card)}`,
    });
  }

  /** Move all cards from the discard pile to exile. */
  public exileAllDiscard(): void {
    const cards = this.discard.getCards();
    if (cards.length === 0) return;
    this.discard.clear();
    cards.forEach((card) => this.exile.addCardToTop(card));
    logAction(this.yDoc, {
      actorId: this.playerId,
      type: 'move_to_pile',
      text: `exiled all ${cards.length} card${cards.length === 1 ? '' : 's'} from discard`,
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
  }

  public moveCardToDeckBottom(card: Card): void {
    this.deck.addCardToBottom(card);
  }

  public onStateChange(callback: (state: PlayerState) => void): void {
    this.yPlayerState.observe(() => {
      callback(this.getState());
    });
  }

  /** Add a custom counter — the local player's by default, or a specific opponent's. */
  public addCustomCounter(title: string, icon: string, targetPlayerId: string = this.playerId): void {
    const map = this.getPlayerStateMap(targetPlayerId);
    const counters = map.get(YSTATE_CUSTOM_COUNTERS) ?? [];
    const newCounter: CustomCounter = {
      id: makeCounterId(),
      title,
      icon,
      value: 0,
    };
    map.set(YSTATE_CUSTOM_COUNTERS, [...counters, newCounter]);
  }

  /**
   * Modify a custom counter's value — the local player's by default, or a
   * specific opponent's. Debounces the action-log entry so rapid +/- presses
   * collapse into one entry; counterId is globally unique (makeCounterId), so
   * no separate per-target keying is needed for the debounce bookkeeping.
   */
  public modifyCustomCounter(counterId: string, delta: number, targetPlayerId: string = this.playerId): void {
    const map = this.getPlayerStateMap(targetPlayerId);
    const counters = map.get(YSTATE_CUSTOM_COUNTERS) ?? [];
    const counter = counters.find((c: CustomCounter) => c.id === counterId);
    if (!counter) return;

    const updatedCounters = counters.map((c: CustomCounter) =>
      c.id === counterId
        ? { ...c, value: c.value + delta }
        : c
    );
    map.set(YSTATE_CUSTOM_COUNTERS, updatedCounters);

    // Capture the value at the start of the burst, not just the immediately-preceding call.
    if (!this.counterBeforeBurst.has(counterId)) {
      this.counterBeforeBurst.set(counterId, counter.value);
    }

    const existingTimer = this.counterEventTimers.get(counterId);
    if (existingTimer) clearTimeout(existingTimer);

    // Debounced log: rapid +/- presses collapse into a single entry.
    this.counterEventTimers.set(counterId, setTimeout(() => {
      const latest = (map.get(YSTATE_CUSTOM_COUNTERS) ?? [])
        .find((c: CustomCounter) => c.id === counterId);
      const previousValue = this.counterBeforeBurst.get(counterId);
      if (latest && previousValue !== undefined) {
        const text = targetPlayerId === this.playerId
          ? `changed ${latest.title} from ${previousValue} to ${latest.value}`
          : `changed ${resolvePlayerName(this.yDoc, targetPlayerId)}'s ${latest.title} from ${previousValue} to ${latest.value}`;
        if (targetPlayerId === this.playerId) trackPlayerCounterChange(latest.title, latest.value);
        logAction(this.yDoc, { actorId: this.playerId, type: 'counter', text });
      }
      this.counterEventTimers.delete(counterId);
      this.counterBeforeBurst.delete(counterId);
    }, 500));
  }

  /** Remove a custom counter — the local player's by default, or a specific opponent's. */
  public removeCustomCounter(counterId: string, targetPlayerId: string = this.playerId): void {
    const map = this.getPlayerStateMap(targetPlayerId);
    const counters = map.get(YSTATE_CUSTOM_COUNTERS) ?? [];
    const updatedCounters = counters.filter((counter: CustomCounter) => counter.id !== counterId);
    map.set(YSTATE_CUSTOM_COUNTERS, updatedCounters);

    const pendingTimer = this.counterEventTimers.get(counterId);
    if (pendingTimer) clearTimeout(pendingTimer);
    this.counterEventTimers.delete(counterId);
    this.counterBeforeBurst.delete(counterId);
  }

  public reorderHand(newOrder: Card[]): void {
    this.yPlayerState.set(YSTATE_HAND, newOrder);
  }

  public flipHandCard(cardId: string): void {
    const hand = this.hand.getCards();
    const card = hand.find(c => c.id === cardId);
    if (card) {
      const updatedCard = { ...card, isFlipped: !card.isFlipped };
      const updatedHand = hand.map(c => c.id === cardId ? updatedCard : c);
      this.yPlayerState.set(YSTATE_HAND, updatedHand);
    }
  }

  public getYPlayerState(): Y.Map<any> {
    return this.yPlayerState;
  }
}