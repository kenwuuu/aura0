import { Page } from '@playwright/test';

/**
 * Block PostHog entirely for this page. Two independent reasons:
 *
 * 1. Determinism: `resolveNetworkTransport()` (FeatureFlags.ts) picks the Yjs transport from
 *    a PostHog flag. Blocking PostHog sends every session down the no-payload fallback, which
 *    is `websocket` — so both peers agree, which is the whole point: a multiplayer spec needs
 *    the two browsers on the *same* transport, and two clients that disagree cannot see each
 *    other at all. (They race a local relay, not the deployed one — see playwright.config.ts.)
 * 2. Hygiene: without this, every automated run fires real analytics events
 *    (`deck_imported`, etc.) into production PostHog.
 *
 * Blocking alone did not use to be enough, and the way it failed is worth remembering. PostHog
 * invokes its flags callback with no context when it replays state it already holds, and
 * FeatureFlags read that missing context as "loaded fine" — so a blocked page would sometimes
 * decide the flags *had* arrived, read the absent transport flag as "off", and pick WebRTC
 * while its peer sat on WebSocket. That is what made the two-player specs flaky, and it was a
 * real bug for ad-blocked players, not a test artifact. Fixed in FeatureFlags.ts; pinned by
 * "falls back to websocket when PostHog replays an empty flag set with no context".
 *
 * Must be called before `page.goto()` — PostHog initializes synchronously on
 * app load, so the route needs to exist before the first request fires.
 */
export async function blockAnalytics(page: Page): Promise<void> {
  await page.route('https://us.i.posthog.com/**', (route) => route.abort());
}
