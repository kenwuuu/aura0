import posthog from 'posthog-js';
import type { NetworkTransport } from '@/infrastructure/networking/YjsNetworkFactory';

const NETWORK_TRANSPORT_FLAG = 'network-transport-websocket';
const MANUAL_TRANSPORT_OVERRIDE_FLAG = 'network-transport-manual-override';
const FLAG_RESOLUTION_TIMEOUT_MS = 1500;

/**
 * Resolves once PostHog flags have loaded, or after a timeout — whichever
 * comes first. Memoized so every caller in a session races the same clock
 * instead of each starting (and needing) its own timeout.
 */
let flagsReady: Promise<void> | null = null;
function whenFlagsReady(): Promise<void> {
  if (!flagsReady) {
    flagsReady = new Promise((resolve) => {
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      setTimeout(settle, FLAG_RESOLUTION_TIMEOUT_MS);
      posthog.onFeatureFlags(settle);
    });
  }
  return flagsReady;
}

/**
 * Resolves which Yjs network transport to use *by default* (i.e. absent a
 * manual override — see isManualTransportOverrideEnabled below), via the
 * `network-transport-websocket` PostHog flag. A slow or unreachable PostHog
 * falls back to `webrtc` rather than blocking room join.
 */
export async function resolveNetworkTransport(): Promise<NetworkTransport> {
  await whenFlagsReady();
  return posthog.isFeatureEnabled(NETWORK_TRANSPORT_FLAG) ? 'websocket' : 'webrtc';
}

/**
 * Whether the manual network-transport override (Settings > Network) should
 * be exposed and honored at all, via the `network-transport-manual-override`
 * flag. Gates both the UI's visibility and whether a previously-saved
 * override is applied — if this flag is off, a stale saved preference is
 * ignored rather than silently stranding a user with no visible way to
 * change it back.
 */
export async function isManualTransportOverrideEnabled(): Promise<boolean> {
  await whenFlagsReady();
  return posthog.isFeatureEnabled(MANUAL_TRANSPORT_OVERRIDE_FLAG) ?? false;
}
