/**
 * Hotkey Store (Zustand)
 *
 * Tracks the single thing the user is currently hovering plus modal state, so
 * the hotkey layer can decide which contextual shortcuts are live.
 *
 * Previously this held six parallel `hoveredXId` fields plus an `activeContext`
 * that every setter had to keep in sync; they collapse to one `hoverTarget`
 * (only one surface can be hovered at a time). The public `setHoveredX` setters
 * are kept so imperative callers (battlefield/dock/pile-viewer) don't change.
 */

import { create } from 'zustand';
import { HotkeyContext } from '@/features/hotkeys/hotkeys';

export type HoverKind = 'battlefield' | 'hand' | 'pile' | 'token' | 'pileViewer';
export type PileType = 'deck' | 'exile' | 'discard';

export interface HoverTarget {
  kind: HoverKind;
  /** Card id, token id, or — for `kind: 'pile'` — the pile type. */
  id: string;
  /** Set when `kind === 'pile'`. */
  pileType?: PileType;
  /** Set when `kind === 'pileViewer'` — gates which pile moves are valid. */
  context?: HotkeyContext;
}

interface HotkeyStore {
  // What the user is currently hovering (only one surface at a time).
  hoverTarget: HoverTarget | null;

  // Modal states (disable hotkeys / switch scopes when modals are open).
  isModalOpen: boolean;
  addCardModalOpen: boolean;

  // Actions
  setHoveredBattlefieldCard: (cardId: string | null) => void;
  setHoveredHandCard: (cardId: string | null) => void;
  setHoveredPile: (pileType: PileType | null) => void;
  setHoveredToken: (tokenId: string | null) => void;
  setHoveredPileViewerCard: (cardId: string | null, context: HotkeyContext | null) => void;
  setModalOpen: (isOpen: boolean) => void;
  setAddCardModalOpen: (isOpen: boolean) => void;
  reset: () => void;
}

export const useHotkeyStore = create<HotkeyStore>((set) => ({
  hoverTarget: null,
  isModalOpen: false,
  addCardModalOpen: false,

  setHoveredBattlefieldCard: (cardId) =>
    set({ hoverTarget: cardId ? { kind: 'battlefield', id: cardId } : null }),

  setHoveredHandCard: (cardId) =>
    set({ hoverTarget: cardId ? { kind: 'hand', id: cardId } : null }),

  setHoveredPile: (pileType) =>
    set({ hoverTarget: pileType ? { kind: 'pile', id: pileType, pileType } : null }),

  setHoveredToken: (tokenId) =>
    set({ hoverTarget: tokenId ? { kind: 'token', id: tokenId } : null }),

  setHoveredPileViewerCard: (cardId, context) =>
    set({
      hoverTarget:
        cardId && context ? { kind: 'pileViewer', id: cardId, context } : null,
    }),

  setModalOpen: (isOpen) => set({ isModalOpen: isOpen }),

  setAddCardModalOpen: (isOpen) => set({ addCardModalOpen: isOpen }),

  reset: () => set({ hoverTarget: null }),
}));
