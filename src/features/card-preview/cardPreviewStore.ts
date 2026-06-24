/**
 * Card preview state (replaces the imperative CardPreview class).
 *
 * Holds the currently-previewed card, its visibility, the latest cursor
 * position (for left/right placement), and the persisted preview zoom level
 * (key `card-preview-zoom`). The React `CardPreview` component renders from this
 * store; the still-imperative board and hotkey handlers drive it via
 * `getState().show/hide/updatePosition`.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Card } from '@/features/player/types';

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 2.5;

const clampZoom = (zoom: number): number => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));

interface CardPreviewStore {
  card: Card | null;
  isVisible: boolean;
  mouseX: number;
  mouseY: number;
  zoom: number;
  show: (card: Card) => void;
  hide: () => void;
  updatePosition: (x: number, y: number) => void;
  setZoom: (zoom: number) => void;
  adjustZoom: (delta: number) => void;
  resetZoom: () => void;
}

export const useCardPreviewStore = create<CardPreviewStore>()(
  persist(
    (set, get) => ({
      card: null,
      isVisible: false,
      mouseX: 0,
      mouseY: 0,
      zoom: 1,
      show: (card) => set({ card, isVisible: true }),
      hide: () => set({ card: null, isVisible: false }),
      updatePosition: (x, y) => set({ mouseX: x, mouseY: y }),
      setZoom: (zoom) => set({ zoom: clampZoom(zoom) }),
      adjustZoom: (delta) => set({ zoom: clampZoom(get().zoom + delta) }),
      resetZoom: () => set({ zoom: 1 }),
    }),
    {
      name: 'card-preview-zoom',
      // Only the zoom level is durable; card/visibility/cursor are ephemeral.
      partialize: (state) => ({ zoom: state.zoom }),
    }
  )
);