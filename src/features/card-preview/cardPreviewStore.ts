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
 *
 * Dismissal on card movement is centralized: `show()` optionally takes a
 * `PreviewSource` describing where the card was hovered from. `CardPreview`
 * watches that source's Yjs map and auto-hides once the card is no longer
 * present there, so callers that move a card (drag, hotkey, pile-viewer
 * action) don't each need to remember to call `hide()` themselves.
 */

import { create } from 'zustand';
import type * as Y from 'yjs';
import type { Card } from '@/features/player/types';

export interface PreviewSource {
  /** The Yjs map whose mutations should trigger a re-check of `isPresent`. */
  yMap: Y.Map<any>;
  /** Whether the previewed card still exists at the location being watched. */
  isPresent: () => boolean;
}

interface CardPreviewStore {
  card: Card | null;
  source: PreviewSource | null;
  isVisible: boolean;
  mouseX: number;
  mouseY: number;
  show: (card: Card, source?: PreviewSource) => void;
  hide: () => void;
  updatePosition: (x: number, y: number) => void;
}

export const useCardPreviewStore = create<CardPreviewStore>()((set) => ({
  card: null,
  source: null,
  isVisible: false,
  mouseX: 0,
  mouseY: 0,
  show: (card, source) => set({ card, source: source ?? null, isVisible: true }),
  hide: () => set({ card: null, source: null, isVisible: false }),
  updatePosition: (x, y) => set({ mouseX: x, mouseY: y }),
}));
