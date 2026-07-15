import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import posthog from 'posthog-js';
import {
  isManualTransportOverrideEnabled,
  resetFlagResolutionForTests,
  resolveNetworkTransport,
} from './FeatureFlags';

// Spies, not vi.mock: `src/test/setup.ts` imports settingsStore, which imports
// this module, so posthog-js is already resolved by the time a test file's
// module mock would register — the mock would silently never reach the code
// under test. Spying on the shared posthog singleton does reach it.
const onFeatureFlags = vi.spyOn(posthog, 'onFeatureFlags');
const isFeatureEnabled = vi.spyOn(posthog, 'isFeatureEnabled');

/**
 * PostHog answers: a payload arrived, and `flags` is how it evaluates.
 *
 * The context matters as much as the flags. posthog-js hands every handler a context when
 * it delivers a response (`{ errorsLoading: false }` here), and *omits* it when it merely
 * replays state it already holds — see `flagsReplayEmptyState`. Passing no context here
 * would be simulating the wrong call.
 */
const flagsDeliver = (flags: Record<string, boolean | undefined>) => {
  onFeatureFlags.mockImplementation((cb) => {
    cb([], {}, { errorsLoading: false });
    return () => {};
  });
  // A flag that is off — disabled, deleted, or 0%-rollout — is absent from the
  // payload, and posthog-js reports an absent flag as `undefined`.
  isFeatureEnabled.mockImplementation((key: string) => flags[key]);
};

/** PostHog never answers: ad-blocker, offline, or slower than the timeout. */
const flagsNeverLoad = () => {
  onFeatureFlags.mockImplementation(() => () => {});
  isFeatureEnabled.mockReturnValue(undefined);
};

/**
 * PostHog replays the state it already holds, with no context — its behaviour when a handler
 * registers after it thinks flags are settled. If the request never landed (ad-blocker,
 * offline, a blocked route in e2e) the state it replays is an *empty flag set*.
 *
 *   onFeatureFlags(cb) { this.addFeatureFlagsHandler(cb); if (this.receivedFlags) cb(flags, variants); }
 *
 * Two args, no third. This is the shape that made an ad-blocked player pick a different
 * transport from everyone else.
 */
const flagsReplayEmptyState = () => {
  onFeatureFlags.mockImplementation((cb) => {
    cb([], {});
    return () => {};
  });
  isFeatureEnabled.mockReturnValue(undefined);
};

beforeEach(() => {
  resetFlagResolutionForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('resolveNetworkTransport', () => {
  it('uses websocket when the flag is on', async () => {
    flagsDeliver({ 'network-transport-websocket': true });

    await expect(resolveNetworkTransport()).resolves.toBe('websocket');
  });

  it('uses webrtc when the flag evaluates false (an active flag at 0% rollout)', async () => {
    flagsDeliver({ 'network-transport-websocket': false });

    await expect(resolveNetworkTransport()).resolves.toBe('webrtc');
  });

  it('uses webrtc when the flag is switched off, so it is absent from the payload', async () => {
    // The regression this guards. A disabled flag is omitted from the payload
    // entirely, which posthog-js reports as `undefined`. Reading that as "not
    // false" pinned every client to websocket however the flag was set.
    flagsDeliver({});

    await expect(resolveNetworkTransport()).resolves.toBe('webrtc');
  });

  it('falls back to websocket when PostHog never answers, rather than blocking room join', async () => {
    vi.useFakeTimers();
    flagsNeverLoad();

    const transport = resolveNetworkTransport();
    await vi.advanceTimersByTimeAsync(1500);

    await expect(transport).resolves.toBe('websocket');
  });

  it('falls back to websocket when the flag payload fails to load', async () => {
    onFeatureFlags.mockImplementation((cb) => {
      cb([], {}, { errorsLoading: true });
      return () => {};
    });
    isFeatureEnabled.mockReturnValue(undefined);

    await expect(resolveNetworkTransport()).resolves.toBe('websocket');
  });

  it('falls back to websocket when PostHog replays an empty flag set with no context', async () => {
    // The bug this guards, and it was not theoretical: it made two_player_sync flaky and,
    // in the field, would strand an ad-blocked player.
    //
    // PostHog omits the context when it replays state it already holds, and with the request
    // blocked that state is empty. The old check — `!context?.errorsLoading` — read the
    // missing context as "loaded cleanly", so we believed a payload had arrived, saw the
    // transport flag come back `undefined`, and took that for "the flag said no": WebRTC.
    // Everyone whose flags *did* load was on WebSocket. Two transports, one room, and the
    // players cannot see each other.
    //
    // "We never heard back" must land on the same fallback as an outright failure.
    flagsReplayEmptyState();

    await expect(resolveNetworkTransport()).resolves.toBe('websocket');
  });
});

describe('isManualTransportOverrideEnabled', () => {
  it('is enabled when the flag is on', async () => {
    flagsDeliver({ 'network-transport-manual-override': true });

    await expect(isManualTransportOverrideEnabled()).resolves.toBe(true);
  });

  it('is disabled when the flag is absent from the payload', async () => {
    flagsDeliver({});

    await expect(isManualTransportOverrideEnabled()).resolves.toBe(false);
  });

  it('is disabled when PostHog never answers, so a stale saved override is ignored', async () => {
    vi.useFakeTimers();
    flagsNeverLoad();

    const enabled = isManualTransportOverrideEnabled();
    await vi.advanceTimersByTimeAsync(1500);

    await expect(enabled).resolves.toBe(false);
  });
});
