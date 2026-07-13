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

/** PostHog answers: a payload arrived, and `flags` is how it evaluates. */
const flagsDeliver = (flags: Record<string, boolean | undefined>) => {
  onFeatureFlags.mockImplementation((cb) => {
    cb([], {});
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
