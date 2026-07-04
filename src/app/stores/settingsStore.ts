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
import type { NetworkTransport } from '@/infrastructure/networking/YjsNetworkFactory';
import { isManualTransportOverrideEnabled, resolveNetworkTransport } from '@/infrastructure/analytics/FeatureFlags';

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
  // When true, battlefield cards/tokens always snap to the grid while dragging.
  // When false, the snap-to-grid hotkey (hold Alt) still works per-drag.
  snapToGridEnabled: boolean;
  setSnapToGridEnabled: (enabled: boolean) => void;
  // Ephemeral demo state — set while Display settings is open so the main window
  // shows live-resizing sample cards for users with an empty hand or no hovered card.
  demoHandCards: Card[] | null;
  setDemoHandCards: (cards: Card[] | null) => void;
  // Manual override of which Yjs transport to connect with. Persisted, so it
  // survives reloads. null means "no manual preference" — defer to the
  // network-transport-websocket PostHog flag (see getEffectiveNetworkTransport).
  networkTransport: NetworkTransport | null;
  setNetworkTransport: (transport: NetworkTransport | null) => void;
  // Overrides networkTransport for the current tab only (never persisted) —
  // for "try WebRTC just for this session" without changing the saved default.
  sessionNetworkTransportOverride: NetworkTransport | null;
  setSessionNetworkTransportOverride: (transport: NetworkTransport | null) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      // Default from legacy key so existing users don't lose their preference.
      handZoom: clampHandZoom(legacyFloat('hand-zoom', 1)),
      previewZoom: clampPreviewZoom(legacyFloat('card-preview-zoom', 1)),
      setHandZoom: (zoom) => set({ handZoom: clampHandZoom(zoom) }),
      setPreviewZoom: (zoom) => set({ previewZoom: clampPreviewZoom(zoom) }),
      snapToGridEnabled: false,
      setSnapToGridEnabled: (enabled) => set({ snapToGridEnabled: enabled }),
      demoHandCards: null,
      setDemoHandCards: (cards) => set({ demoHandCards: cards }),
      networkTransport: null,
      setNetworkTransport: (transport) => set({ networkTransport: transport }),
      sessionNetworkTransportOverride: null,
      setSessionNetworkTransportOverride: (transport) => set({ sessionNetworkTransportOverride: transport }),
    }),
    {
      name: 'aura:settings',
      // Only persist durable user preferences — demo state and the session-only
      // transport override are deliberately excluded so they reset on reload.
      partialize: (state) => ({
        handZoom: state.handZoom,
        previewZoom: state.previewZoom,
        snapToGridEnabled: state.snapToGridEnabled,
        networkTransport: state.networkTransport,
      }),
    },
  ),
);

/**
 * The transport to actually connect with. A manual override (session, then
 * saved) wins, but only if the network-transport-manual-override flag allows
 * it — otherwise (flag off, or no override set) falls back to whatever
 * network-transport-websocket decides.
 */
export async function getEffectiveNetworkTransport(): Promise<NetworkTransport> {
  if (await isManualTransportOverrideEnabled()) {
    const state = useSettingsStore.getState();
    const manual = state.sessionNetworkTransportOverride ?? state.networkTransport;
    if (manual) return manual;
  }
  return resolveNetworkTransport();
}
