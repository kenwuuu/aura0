/**
 * Card preview state (replaces the imperative CardPreview class).
 *
 * Holds the currently-previewed card, its visibility, and the latest cursor
 * position (for left/right placement). The React `CardPreview` component renders
 * from this store; the still-imperative board and hotkey handlers drive it via
 * `getState().show/hide/updatePosition`.
 *
 * Preview zoom level has moved to `useSettingsStore` (src/app/stores/settingsStore.ts)
 * where it is persisted alongside other user preferences.
 */

import { create } from 'zustand';
import type { Card } from '@/features/player/types';

interface CardPreviewStore {
  card: Card | null;
  isVisible: boolean;
  mouseX: number;
  mouseY: number;
  show: (card: Card) => void;
  hide: () => void;
  updatePosition: (x: number, y: number) => void;
}

export const useCardPreviewStore = create<CardPreviewStore>()((set) => ({
  card: null,
  isVisible: false,
  mouseX: 0,
  mouseY: 0,
  show: (card) => set({ card, isVisible: true }),
  hide: () => set({ card: null, isVisible: false }),
  updatePosition: (x, y) => set({ mouseX: x, mouseY: y }),
}));
