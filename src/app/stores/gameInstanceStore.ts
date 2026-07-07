/**
 * Game Instance Store
 *
 * Zustand store that holds references to the main game instances.
 * This allows hotkey handlers and other React components to access
 * game instances without prop drilling.
 *
 * Pure DI/service-locator: instances + setters only. Game mutations
 * (moveCardTo*, playCardFromHand/Pile, addCardToBoard, ...) live in
 * features/battlefield/battlefieldActions.ts, which reads its instances from
 * this store's getState() — never put game mutations in Zustand itself.
 */

import { create } from 'zustand';
import * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';
import type { Player } from '@/features/player';
import type { RoomManager } from '@/features/room';
import type { TokenService } from '@/infrastructure/cards';

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

  // screenToFlowPosition: set by BattlefieldCanvas on mount so other components can convert
  // screen coords (e.g. from a dnd-kit drag end) to ReactFlow canvas coordinates.
  screenToFlowPosition: ((point: { x: number; y: number }) => { x: number; y: number }) | null;
  setScreenToFlowPosition: (fn: (point: { x: number; y: number }) => { x: number; y: number }) => void;

  // Reset all instances (useful for cleanup)
  reset: () => void;
}

export const useGameInstance = create<GameInstanceStore>((set) => ({
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

  setScreenToFlowPosition: (fn) => set({ screenToFlowPosition: fn }),

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
