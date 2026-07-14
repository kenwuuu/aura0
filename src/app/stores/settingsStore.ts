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
 *
 * Versioning: bump SETTINGS_VERSION and add a branch in `migrate` whenever a
 * change elsewhere invalidates a previously-saved preference (e.g. the 2026-07
 * board rewrite reset zoom to a new 1.0x baseline). `migrate` runs once, on
 * the first load after the bump, for anyone with an older persisted version.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Card } from '@/features/player/types';
import type { NetworkTransport } from '@/infrastructure/networking/YjsNetworkFactory';
import { isManualTransportOverrideEnabled, resolveNetworkTransport } from '@/infrastructure/analytics/FeatureFlags';
import type { TourOutcome } from '@/features/onboarding/types';

// --- Zoom bounds (duplicated from their original homes so the store is self-contained) ---
export const HAND_ZOOM_MIN = 0.5;
export const HAND_ZOOM_MAX = 2;
export const PREVIEW_ZOOM_MIN = 0.5;
export const PREVIEW_ZOOM_MAX = 2.5;

// Bump on any change that should force-reset a persisted preference for all
// users (see `migrate` below and the versioning note in the file header).
const SETTINGS_VERSION = 1;

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
  // Draggable HUD panel positions (toolbar, action log, …), keyed by panel id.
  // Persisted so a player's window layout survives reloads.
  panelPositions: Record<string, { x: number; y: number }>;
  setPanelPosition: (key: string, pos: { x: number; y: number }) => void;
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
  // How the player's first-run tour ended, or null if they haven't finished one.
  // Persisted, so the tour doesn't reappear on every visit; Settings > Display
  // offers a "Replay tour" that clears it.
  //
  // An outcome rather than a boolean because "finished the tour" and "bailed out
  // of it" are the two groups the whole feature exists to compare — it's stamped
  // onto every event as a super property (see registerTourOutcome).
  tourOutcome: TourOutcome | null;
  setTourOutcome: (outcome: TourOutcome | null) => void;
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
      panelPositions: {},
      setPanelPosition: (key, pos) =>
        set((s) => ({ panelPositions: { ...s.panelPositions, [key]: pos } })),
      demoHandCards: null,
      setDemoHandCards: (cards) => set({ demoHandCards: cards }),
      networkTransport: null,
      setNetworkTransport: (transport) => set({ networkTransport: transport }),
      sessionNetworkTransportOverride: null,
      setSessionNetworkTransportOverride: (transport) => set({ sessionNetworkTransportOverride: transport }),
      tourOutcome: null,
      setTourOutcome: (outcome) => set({ tourOutcome: outcome }),
    }),
    {
      name: 'aura:settings',
      version: SETTINGS_VERSION,
      // Runs once for anyone whose persisted version predates SETTINGS_VERSION.
      // v1: board rewrite changed the default camera framing — reset zoom
      // preferences so everyone starts from the new 1.0x baseline.
      migrate: (persistedState, version): SettingsStore => {
        const state = persistedState as SettingsStore;
        if (version < 1) {
          return { ...state, handZoom: 1, previewZoom: 1 };
        }
        return state;
      },
      // Only persist durable user preferences — demo state and the session-only
      // transport override are deliberately excluded so they reset on reload.
      partialize: (state) => ({
        handZoom: state.handZoom,
        previewZoom: state.previewZoom,
        snapToGridEnabled: state.snapToGridEnabled,
        networkTransport: state.networkTransport,
        panelPositions: state.panelPositions,
        tourOutcome: state.tourOutcome,
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
