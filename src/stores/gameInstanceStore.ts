/**
 * Game Instance Store
 *
 * Zustand store that holds references to the main game instances.
 * This allows hotkey handlers and other React components to access
 * game instances without prop drilling.
 */

import { create } from 'zustand';
import * as Y from 'yjs';
import type { Player } from '@/features/player';
import type { Card } from '@/features/player/types';
import type { RoomManager } from '@/features/room';
import { YDOC_CARDS_ON_BOARD } from '@/constants';
import { DeckPersistenceService } from '@/infrastructure/persistence';
import type { WhiteboardCard } from '@/features/battlefield/types';

interface GameInstanceStore {
  // Game instances
  yDoc: Y.Doc | null;
  player: Player | null;
  playerId: string | null;
  roomManager: RoomManager | null;

  // Setters
  setYDoc: (yDoc: Y.Doc) => void;
  setPlayer: (player: Player) => void;
  setPlayerId: (playerId: string) => void;
  setRoomManager: (roomManager: RoomManager) => void;

  // Card movements off the battlefield (replaces the old window CustomEvent bus).
  // Callers (battlefieldCardActions) already remove the card from the board; these
  // place it into the local player's destination pile.
  moveCardToHand: (card: Card) => void;
  moveCardToDiscard: (card: Card) => void;
  moveCardToExile: (card: Card) => void;
  moveCardToDeckTop: (card: Card) => void;
  moveCardToDeckBottom: (card: Card) => void;

  // Add a card to the battlefield (writes to yCards)
  addCardToBoard: (card: Card, ownerId: string) => void;

  // Reset all instances (useful for cleanup)
  reset: () => void;
}

export const useGameInstance = create<GameInstanceStore>((set, get) => ({
  // Initial state
  yDoc: null,
  player: null,
  playerId: null,
  roomManager: null,

  // Setters
  setYDoc: (yDoc) => set({ yDoc }),
  setPlayer: (player) => set({ player }),
  setPlayerId: (playerId) => set({ playerId }),
  setRoomManager: (roomManager) => set({ roomManager }),

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
  }),
}));
