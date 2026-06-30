/**
 * Game Instance Store
 *
 * Zustand store that holds references to the main game instances.
 * This allows hotkey handlers and other React components to access
 * game instances without prop drilling.
 */

import { create } from 'zustand';
import * as Y from 'yjs';
import posthog from 'posthog-js';
import type { Awareness } from 'y-protocols/awareness';
import type { Player } from '@/features/player';
import type { Card } from '@/features/player/types';
import type { RoomManager } from '@/features/room';
import { YDOC_CARDS_ON_BOARD, CARD_WIDTH, CARD_HEIGHT } from '@/constants';
import { DeckPersistenceService } from '@/infrastructure/persistence';
import type { TokenService } from '@/infrastructure/cards';
import type { WhiteboardCard } from '@/features/battlefield/types';
import { logAction, cardLogName } from '@/features/action-log/actionLog';

type BattlefieldDestination = 'hand' | 'exile' | 'discard' | 'deck';

interface GameInstanceStore {
  // Game instances
  yDoc: Y.Doc | null;
  player: Player | null;
  playerId: string | null;
  roomManager: RoomManager | null;
  tokenService: TokenService | null;
  awareness: Awareness | null;

  // Setters
  setYDoc: (yDoc: Y.Doc) => void;
  setPlayer: (player: Player) => void;
  setPlayerId: (playerId: string) => void;
  setRoomManager: (roomManager: RoomManager) => void;
  setTokenService: (tokenService: TokenService) => void;
  setAwareness: (awareness: Awareness) => void;

  // Card movements off the battlefield (replaces the old window CustomEvent bus).
  // Callers (battlefieldCardActions) already remove the card from the board; these
  // place it into the local player's destination pile.
  moveCardToHand: (card: Card) => void;
  moveCardToDiscard: (card: Card) => void;
  moveCardToExile: (card: Card) => void;
  moveCardToDeckTop: (card: Card) => void;
  moveCardToDeckBottom: (card: Card) => void;

  // Drag a card from the battlefield back to a dock pile (replaces the moveCardFromBattlefield window event).
  moveCardFromBattlefield: (cardId: string, destination: BattlefieldDestination) => void;

  // Add a card to the battlefield (writes to yCards)
  addCardToBoard: (card: Card, ownerId: string) => void;

  // screenToFlowPosition: set by BattlefieldCanvas on mount so other components can convert
  // screen coords (e.g. from a dnd-kit drag end) to ReactFlow canvas coordinates.
  screenToFlowPosition: ((point: { x: number; y: number }) => { x: number; y: number }) | null;
  setScreenToFlowPosition: (fn: (point: { x: number; y: number }) => { x: number; y: number }) => void;

  // Play a card from hand onto the battlefield: places the card and spawns any related tokens.
  playCardFromHand: (cardId: string, clientX: number, clientY: number) => Promise<void>;

  // Reset all instances (useful for cleanup)
  reset: () => void;
}

export const useGameInstance = create<GameInstanceStore>((set, get) => ({
  // Initial state
  yDoc: null,
  player: null,
  playerId: null,
  roomManager: null,
  tokenService: null,
  awareness: null,
  screenToFlowPosition: null,

  // Setters
  setYDoc: (yDoc) => set({ yDoc }),
  setPlayer: (player) => set({ player }),
  setPlayerId: (playerId) => set({ playerId }),
  setRoomManager: (roomManager) => set({ roomManager }),
  setTokenService: (tokenService) => set({ tokenService }),
  setAwareness: (awareness) => set({ awareness }),

  // Card movements
  moveCardToHand: (card) => get().player?.placeCardInPile(card, 'hand'),
  moveCardToDiscard: (card) => get().player?.placeCardInPile(card, 'discard'),
  moveCardToExile: (card) => get().player?.placeCardInPile(card, 'exile'),
  moveCardToDeckTop: (card) => {
    const { player, roomManager } = get();
    if (!player) return;
    player.moveCardToDeckTop(card);
    if (roomManager) {
      DeckPersistenceService.saveDeckForRoom(roomManager.getRoomName(), player.getDeck());
    }
  },
  moveCardToDeckBottom: (card) => {
    const { player, roomManager } = get();
    if (!player) return;
    player.moveCardToDeckBottom(card);
    if (roomManager) {
      DeckPersistenceService.saveDeckForRoom(roomManager.getRoomName(), player.getDeck());
    }
  },

  moveCardFromBattlefield: (cardId, destination) => {
    const { yDoc, player, playerId, roomManager } = get();
    if (!yDoc || !player || !playerId) return;
    const yCards = yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD);
    const card = yCards.get(cardId);
    if (!card || card.ownerId !== playerId) return;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { zIndex, ownerId, ...baseCard } = card;
    if (destination === 'deck') {
      player.moveCardToDeckTop(baseCard as any);
      if (roomManager) DeckPersistenceService.saveDeckForRoom(roomManager.getRoomName(), player.getDeck());
    } else {
      player.placeCardInPile(baseCard as any, destination);
    }
    yCards.delete(cardId);
    logAction(yDoc, {
      actorId: playerId,
      type: 'move_to_pile',
      text: `moved ${cardLogName(card)} to ${destination}`,
    });
  },

  setScreenToFlowPosition: (fn) => set({ screenToFlowPosition: fn }),

  playCardFromHand: async (cardId, clientX, clientY) => {
    const { yDoc, player, playerId, screenToFlowPosition, tokenService } = get();
    if (!yDoc || !player || !playerId || !screenToFlowPosition) return;
    const card = player.removeCardFromHand(cardId);
    if (!card) return;

    const position = screenToFlowPosition({ x: clientX, y: clientY });
    const cardX = position.x - CARD_WIDTH / 2;
    const cardY = position.y - CARD_HEIGHT / 2;

    const yCards = yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD);
    let maxZ = 0;
    yCards.forEach((c) => { if (c.zIndex > maxZ) maxZ = c.zIndex; });
    yCards.set(card.id, { ...card, x: cardX, y: cardY, zIndex: maxZ + 1, ownerId: playerId });
    posthog.capture('card_played_to_battlefield', { card_name: card.name, is_flipped: card.isFlipped });

    if (card.isFlipped) {
      logAction(yDoc, {
        actorId: playerId,
        type: 'play_card',
        text: `played a card face down`,
      });
    } else {
      logAction(yDoc, {
        actorId: playerId,
        type: 'play_card',
        text: `played ${card.name}`,
      });
    }

    if (tokenService && card.scryfallId) {
      const result = await tokenService.createTokensForCard(card.scryfallId, { x: cardX, y: cardY });
      result.tokens.forEach((token, i) => {
        yCards.set(token.id, { ...token, zIndex: maxZ + 2 + i, ownerId: playerId });
      });
      if (result.errors.length > 0) {
        console.warn(`Token creation errors for ${card.name}:`, result.errors);
      }
    }
  },

  addCardToBoard: (card, ownerId) => {
    const { yDoc } = get();
    if (!yDoc) return;
    const yCards = yDoc.getMap<WhiteboardCard>(YDOC_CARDS_ON_BOARD);
    let maxZIndex = 0;
    yCards.forEach((c) => { if (c.zIndex > maxZIndex) maxZIndex = c.zIndex; });
    yCards.set(card.id, { ...card, zIndex: maxZIndex + 1, ownerId });
  },

  // Reset
  reset: () => set({
    yDoc: null,
    player: null,
    playerId: null,
    roomManager: null,
    tokenService: null,
    awareness: null,
    screenToFlowPosition: null,
  }),
}));
