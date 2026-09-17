import posthog from 'posthog-js';
import type { NetworkTransport } from '@/infrastructure/networking/YjsNetworkFactory';
import type { TourVariant } from '@/features/onboarding/types';

const NETWORK_TRANSPORT_FLAG = 'network-transport-websocket';
const MANUAL_TRANSPORT_OVERRIDE_FLAG = 'network-transport-manual-override';
const FLAG_RESOLUTION_TIMEOUT_MS = 1500;

/**
 * Where we land when PostHog never answers — blocked by an ad-blocker, offline,
 * or just slower than the timeout. WebSocket is the transport that connects
 * without peer negotiation, so an unreachable PostHog degrades to "it still
 * connects" rather than blocking room join.
 */
const TRANSPORT_WITHOUT_FLAGS: NetworkTransport = 'websocket';

/**
 * Whether PostHog actually delivered a flag payload. This is *not* the same
 * question as "is the flag in the payload": a flag that is off — disabled, or
 * rolled out to 0%, or deleted — is simply absent from the response, and
 * `isFeatureEnabled` reports an absent flag as `undefined`, the very same value
 * it returns when nothing loaded at all. Callers below need to tell those apart,
 * because one means "the flag said no" and the other means "we never heard".
 */
let flagsLoaded = false;

/**
 * Resolves — once PostHog's flags have loaded, or the timeout fires, whichever
 * comes first — to whether a payload actually arrived. Memoized so every caller
 * in a session races the same clock instead of each starting (and needing) its
 * own timeout.
 */
let flagsReady: Promise<void> | null = null;
function whenFlagsReady(): Promise<boolean> {
  if (!flagsReady) {
    flagsReady = new Promise((resolve) => {
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      setTimeout(settle, FLAG_RESOLUTION_TIMEOUT_MS);
      posthog.onFeatureFlags((_flags, _variants, context) => {
        // Three ways in, and only one of them is a payload:
        //
        //   context = { errorsLoading: false }  the flags request came back  -> a payload
        //   context = { errorsLoading: true }   the request failed           -> not a payload
        //   context = undefined                 PostHog is replaying whatever it already
        //                                       holds, without having fetched anything
        //
        // That last one is the trap. PostHog omits the context entirely when it invokes the
        // callback from its existing state — and when the request never landed (ad-blocker,
        // offline, a blocked route in e2e) that state is an *empty flag set*. Testing only
        // `!context?.errorsLoading` reads the missing context as "loaded fine", so we would
        // believe a payload arrived, find every flag `undefined`, and take that for "the flag
        // said no". For the transport flag, "no" means WebRTC — so an ad-blocked player would
        // silently join over a different transport than everyone else and see an empty room.
        // Require PostHog to affirmatively tell us the load went fine.
        if (context && !context.errorsLoading) flagsLoaded = true;
        settle();
      });
    });
  }
  // Read after the wait, never before — a payload that lands late still counts.
  return flagsReady.then(() => flagsLoaded);
}

/**
 * Resolves which Yjs network transport to use *by default* (i.e. absent a
 * manual override — see isManualTransportOverrideEnabled below), via the
 * `network-transport-websocket` PostHog flag.
 *
 * The flag being off means WebRTC, however it was turned off: disabled outright
 * or dropped to a 0% rollout. Only a flag that is on — or a PostHog we never
 * heard back from — means WebSocket.
 */
export async function resolveNetworkTransport(): Promise<NetworkTransport> {
  if (!(await whenFlagsReady())) return TRANSPORT_WITHOUT_FLAGS;
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
  if (!(await whenFlagsReady())) return false;
  return posthog.isFeatureEnabled(MANUAL_TRANSPORT_OVERRIDE_FLAG) ?? false;
}

const TOUR_ENABLED_FLAG = 'onboarding-tour-enabled';

/**
 * Whether to show the first-run tour at all.
 *
 * Ships at 100% — the tour has no holdout, so its "control" is the funnel as it
 * stood before release. This exists as a kill switch: drop the rollout to 0% and
 * the tour is gone without a deploy. Dropping it *below* 100% later turns it into
 * a real randomized holdout, which is the only way to actually measure the tour's
 * effect (see the note in features/onboarding/CLAUDE.md).
 *
 * A PostHog we never heard from falls back to **on**. The failure we care about is
 * an ad-blocked new player silently getting no onboarding at all; showing the tour
 * to someone whose flags didn't load is harmless.
 */
export async function isTourEnabled(): Promise<boolean> {
  if (!(await whenFlagsReady())) return true;
  return posthog.isFeatureEnabled(TOUR_ENABLED_FLAG) ?? true;
}

const TOUR_STEP_ORDER_FLAG = 'onboarding-tour-step-order';

/**
 * Which arm of the onboarding step-order experiment this player is in.
 *
 * A PostHog we never heard from falls back to `control` rather than delaying the
 * tour — a first-time visitor staring at an unexplained board for 1.5s is a worse
 * outcome than one unbalanced assignment. Any variant we don't recognize is also
 * `control`, so a typo in the PostHog UI can't strand players in a tour with no
 * steps.
 *
 * To add an arm: add a key to STEP_ORDERS (tourSteps.ts) and add the matching
 * variant to this flag.
 */
export async function resolveTourStepOrder(): Promise<TourVariant> {
  if (!(await whenFlagsReady())) return 'control';
  return posthog.getFeatureFlag(TOUR_STEP_ORDER_FLAG) === 'draw_first' ? 'draw_first' : 'control';
}

/** Test seam: drops the memoized flag-resolution race between test cases. */
export function resetFlagResolutionForTests(): void {
  flagsReady = null;
  flagsLoaded = false;
}
