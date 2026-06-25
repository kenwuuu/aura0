/**
 * Game Instance Store
 *
 * Zustand store that holds references to the main game instances.
 * This allows hotkey handlers and other React components to access
 * game instances without prop drilling.
 */

import { create } from 'zustand';
import type { Player } from '@/features/player';
import type { Card } from '@/features/player/types';
import type { MultiPlayerBoardManager } from '@/features/battlefield';
import type { RoomManager } from '@/features/room';
import { DeckPersistenceService } from '@/infrastructure/persistence';

interface GameInstanceStore {
  // Game instances
  player: Player | null;
  whiteboard: MultiPlayerBoardManager | null;
  playerId: string | null;
  roomManager: RoomManager | null;

  // Setters
  setPlayer: (player: Player) => void;
  setWhiteboard: (whiteboard: MultiPlayerBoardManager) => void;
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

  // Reset all instances (useful for cleanup)
  reset: () => void;
}

export const useGameInstance = create<GameInstanceStore>((set, get) => ({
  // Initial state
  player: null,
  whiteboard: null,
  playerId: null,
  roomManager: null,

  // Setters
  setPlayer: (player) => set({ player }),
  setWhiteboard: (whiteboard) => set({ whiteboard }),
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

  // Reset
  reset: () => set({
    player: null,
    whiteboard: null,
    playerId: null,
    roomManager: null,
  }),
}));