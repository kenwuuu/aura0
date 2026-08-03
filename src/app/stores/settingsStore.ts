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
import { HotkeyPreset, type HotkeyPresetId } from '@/features/hotkeys/presets';
import type { HotkeyOverrides } from '@/features/hotkeys/bindings';

// --- Zoom bounds (duplicated from their original homes so the store is self-contained) ---
export const HAND_ZOOM_MIN = 0.5;
export const HAND_ZOOM_MAX = 2;
export const PREVIEW_ZOOM_MIN = 0.5;
export const PREVIEW_ZOOM_MAX = 2.5;

// Bump on any change that should force-reset a persisted preference for all
// users (see `migrate` below and the versioning note in the file header).
const SETTINGS_VERSION = 2;

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
  // When true, deleting a battlefield card asks first. Deleting is the one
  // board action with no undo path back to the card (moveTo* all put it in a
  // pile you can dig it out of), and Backspace is easy to hit by accident, so
  // this defaults ON. The dialog's "Don't ask again" checkbox flips it off.
  confirmCardDelete: boolean;
  setConfirmCardDelete: (enabled: boolean) => void;
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
  // Persisted, so the tour doesn't reappear on every visit; Settings > About
  // offers a "Replay tour" that clears it.
  //
  // An outcome rather than a boolean because "finished the tour" and "bailed out
  // of it" are the two groups the whole feature exists to compare — it's stamped
  // onto every event as a super property (see registerTourOutcome).
  tourOutcome: TourOutcome | null;
  setTourOutcome: (outcome: TourOutcome | null) => void;
  // Which keyboard scheme the player is on. New installs start on `Default`
  // (mnemonic keys); anyone with settings saved before hotkeys were
  // customizable is pinned to `Untap` by the v2 migration, since that is what
  // their fingers already know. See the `migrate` branch below.
  hotkeyPreset: HotkeyPresetId;
  setHotkeyPreset: (preset: HotkeyPresetId) => void;
  // Per-action rebindings layered over the preset, keyed by action id. Sparse:
  // an absent action means "whatever the preset says", which is what lets a
  // preset switch move every key the player hasn't personally claimed.
  hotkeyOverrides: HotkeyOverrides;
  setHotkeyBinding: (action: string, keys: readonly string[]) => void;
  resetHotkeyBinding: (action: string) => void;
  resetAllHotkeys: () => void;
}

/**
 * Upgrade a persisted blob to the current `SETTINGS_VERSION`.
 *
 * Runs once for anyone whose saved version predates it; a fresh install has
 * nothing persisted and never reaches this, which is what makes it the right
 * place to distinguish "existing player" from "new player".
 *
 * - **v1** — the board rewrite changed the default camera framing, so zoom
 *   preferences reset to the new 1.0x baseline.
 * - **v2** — hotkeys became customizable and new installs start on the mnemonic
 *   `Default` scheme. Existing players are pinned to `Untap` instead: eight keys
 *   differ between the two, and `D` flipping from discard to draw is the worst
 *   kind of change, because it still does something — just not what you meant.
 *
 * The v2 branch is load-bearing rather than cosmetic. Zustand's `persist` merges
 * the saved blob *over* the initializer's defaults, and a pre-v2 blob has no
 * `hotkeyPreset` key at all, so without pinning it here every existing player
 * would silently inherit `Default` on their next load.
 *
 * Exported for its test — the failure mode is invisible in the UI (settings look
 * fine; the keys just moved) and only reproducible by hand with a stale blob.
 */
export function migrateSettings(persistedState: unknown, version: number): SettingsStore {
  let state = persistedState as SettingsStore;
  if (version < 1) {
    state = { ...state, handZoom: 1, previewZoom: 1 };
  }
  if (version < 2) {
    state = { ...state, hotkeyPreset: HotkeyPreset.Untap, hotkeyOverrides: {} };
  }
  return state;
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
      confirmCardDelete: true,
      setConfirmCardDelete: (enabled) => set({ confirmCardDelete: enabled }),
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
      hotkeyPreset: HotkeyPreset.Default,
      // Switching preset drops overrides: they were expressed against the old
      // scheme, and keeping them would silently pin a few keys to the preset the
      // player just moved away from.
      setHotkeyPreset: (preset) => set({ hotkeyPreset: preset, hotkeyOverrides: {} }),
      hotkeyOverrides: {},
      setHotkeyBinding: (action, keys) =>
        set((s) => ({ hotkeyOverrides: { ...s.hotkeyOverrides, [action]: [...keys] } })),
      resetHotkeyBinding: (action) =>
        set((s) => {
          const { [action]: _removed, ...rest } = s.hotkeyOverrides;
          return { hotkeyOverrides: rest };
        }),
      resetAllHotkeys: () => set({ hotkeyOverrides: {} }),
    }),
    {
      name: 'aura:settings',
      version: SETTINGS_VERSION,
      migrate: (persistedState, version) => migrateSettings(persistedState, version),
      // Only persist durable user preferences — demo state and the session-only
      // transport override are deliberately excluded so they reset on reload.
      partialize: (state) => ({
        handZoom: state.handZoom,
        previewZoom: state.previewZoom,
        snapToGridEnabled: state.snapToGridEnabled,
        confirmCardDelete: state.confirmCardDelete,
        networkTransport: state.networkTransport,
        panelPositions: state.panelPositions,
        tourOutcome: state.tourOutcome,
        hotkeyPreset: state.hotkeyPreset,
        hotkeyOverrides: state.hotkeyOverrides,
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
