import { Page } from '@playwright/test';

/**
 * Block PostHog entirely for this page, purely for hygiene: without this,
 * every automated run fires real analytics events (`deck_imported`, etc.)
 * into production PostHog. The Yjs transport is no longer decided by a
 * PostHog flag (see forceWebRtcTransport below), so this no longer affects
 * transport determinism.
 *
 * Must be called before `page.goto()` — PostHog initializes synchronously on
 * app load, so the route needs to exist before the first request fires.
 */
export async function blockAnalytics(page: Page): Promise<void> {
  await page.route('https://us.i.posthog.com/**', (route) => route.abort());
}

/**
 * Force the `webrtc` transport by seeding settingsStore's persisted
 * localStorage entry before the app boots. The app now defaults to
 * `websocket` (src/app/stores/settingsStore.ts), but the real-transport smoke
 * tests need both peers on `webrtc` (public signaling servers) rather than
 * depending on the externally-hosted websocket relay's availability.
 *
 * Must be called before `page.goto()` — bootstrapGame() reads this
 * synchronously on app load.
 */
export async function forceWebRtcTransport(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem(
      'aura:settings',
      JSON.stringify({ state: { networkTransport: 'webrtc' }, version: 0 }),
    );
  });
}
