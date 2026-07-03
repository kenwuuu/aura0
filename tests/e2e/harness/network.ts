import { Page } from '@playwright/test';

/**
 * Block PostHog entirely for this page. Two independent reasons:
 *
 * 1. Determinism: `resolveNetworkTransport()` (FeatureFlags.ts) races a live
 *    PostHog experiment against a 1.5s timeout to pick the Yjs transport. If
 *    the flag resolves before the timeout, some sessions get routed to the
 *    `websocket` transport instead of `webrtc` — and that relay has been
 *    observed returning Cloudflare 530s. Blocking PostHog forces every
 *    session through the timeout fallback, which is always `webrtc` — the
 *    real-transport smoke test needs both peers to agree on the same
 *    transport, not race a flag.
 * 2. Hygiene: without this, every automated run fires real analytics events
 *    (`deck_imported`, etc.) into production PostHog.
 *
 * Must be called before `page.goto()` — PostHog initializes synchronously on
 * app load, so the route needs to exist before the first request fires.
 */
export async function blockAnalytics(page: Page): Promise<void> {
  await page.route('https://us.i.posthog.com/**', (route) => route.abort());
}
