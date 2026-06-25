/**
 * PileViewer Open Store
 *
 * Zustand store providing a request-based seam so components outside the dock
 * (e.g. board PileNode) can open a PileViewer without coupling to GameResourcesDock.
 *
 * Flow:
 *   PileNode click → open({ scope: 'local', pile: 'deck' })
 *   GameResourcesDock subscribes → calls its existing viewPile() → clears request
 *
 *   OpponentPileNode click → open({ scope: 'opponent', playerId, pile: 'exile' })
 *   OpponentPileViewers subscribes → opens read-only viewer → clears request
 */
import { create } from 'zustand';

export type LocalPileOpenRequest = {
  scope: 'local';
  pile: 'deck' | 'exile' | 'discard';
};

export type OpponentPileOpenRequest = {
  scope: 'opponent';
  playerId: string;
  pile: 'exile' | 'discard' | 'hand';
};

export type OpenPileRequest = LocalPileOpenRequest | OpponentPileOpenRequest;

interface PileViewerOpenStore {
  request: OpenPileRequest | null;
  open: (req: OpenPileRequest) => void;
  clear: () => void;
}

export const usePileViewerOpenStore = create<PileViewerOpenStore>((set) => ({
  request: null,
  open: (req) => set({ request: req }),
  clear: () => set({ request: null }),
}));
