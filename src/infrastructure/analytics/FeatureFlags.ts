import posthog from 'posthog-js';
import type { NetworkTransport } from '@/infrastructure/networking/YjsNetworkFactory';

const NETWORK_TRANSPORT_FLAG = 'network-transport-websocket';
const FLAG_RESOLUTION_TIMEOUT_MS = 1500;

/**
 * Resolves which Yjs network transport to use, via the `network-transport-websocket`
 * PostHog flag. PostHog loads flags asynchronously over the network, so this races
 * that load against a timeout — a slow or unreachable PostHog falls back to the
 * default WebRTC transport rather than blocking room join.
 */
export function resolveNetworkTransport(): Promise<NetworkTransport> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (transport: NetworkTransport) => {
      if (settled) return;
      settled = true;
      resolve(transport);
    };

    setTimeout(() => settle('webrtc'), FLAG_RESOLUTION_TIMEOUT_MS);
    posthog.onFeatureFlags(() => {
      settle(posthog.isFeatureEnabled(NETWORK_TRANSPORT_FLAG) ? 'websocket' : 'webrtc');
    });
  });
}
