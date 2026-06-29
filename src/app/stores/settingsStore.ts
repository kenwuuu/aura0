/**
 * Persisted user preferences store.
 *
 * The single source of truth for all user-configurable settings that should
 * survive page reloads. Stored in localStorage under the 'aura:settings' key
 * (matching the `aura:` namespace used throughout infrastructure/networking).
 *
 * Add new preferences here — the `partialize` option ensures only durable
 * fields are persisted (ephemeral UI state can live alongside them safely).
 *
 * Migration note: on first load we seed handZoom from the legacy 'hand-zoom'
 * key (previously written by FloatingHand) and previewZoom from 'card-preview-zoom'
 * (previously written by cardPreviewStore), so existing users keep their values.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Card } from '@/features/player/types';

// --- Zoom bounds (duplicated from their original homes so the store is self-contained) ---
export const HAND_ZOOM_MIN = 0.5;
export const HAND_ZOOM_MAX = 2;
export const PREVIEW_ZOOM_MIN = 0.5;
export const PREVIEW_ZOOM_MAX = 2.5;

function clampHandZoom(z: number): number {
  return Math.max(HAND_ZOOM_MIN, Math.min(HAND_ZOOM_MAX, z));
}
function clampPreviewZoom(z: number): number {
  return Math.max(PREVIEW_ZOOM_MIN, Math.min(PREVIEW_ZOOM_MAX, z));
}

/** Reads a legacy localStorage float or returns the given fallback. */
function legacyFloat(key: string, fallback: number): number {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  const n = parseFloat(raw);
  return isNaN(n) ? fallback : n;
}

interface SettingsStore {
  handZoom: number;
  previewZoom: number;
  setHandZoom: (zoom: number) => void;
  setPreviewZoom: (zoom: number) => void;
  // Ephemeral demo state — set while Display settings is open so the main window
  // shows live-resizing sample cards for users with an empty hand or no hovered card.
  demoHandCards: Card[] | null;
  setDemoHandCards: (cards: Card[] | null) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      // Default from legacy key so existing users don't lose their preference.
      handZoom: clampHandZoom(legacyFloat('hand-zoom', 1)),
      previewZoom: clampPreviewZoom(legacyFloat('card-preview-zoom', 1)),
      setHandZoom: (zoom) => set({ handZoom: clampHandZoom(zoom) }),
      setPreviewZoom: (zoom) => set({ previewZoom: clampPreviewZoom(zoom) }),
      demoHandCards: null,
      setDemoHandCards: (cards) => set({ demoHandCards: cards }),
    }),
    {
      name: 'aura:settings',
      // Only persist user preferences — demo state is always ephemeral.
      partialize: (state) => ({ handZoom: state.handZoom, previewZoom: state.previewZoom }),
    },
  ),
);
