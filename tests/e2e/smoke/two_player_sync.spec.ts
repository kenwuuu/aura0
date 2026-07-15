import { test, expect } from '../fixtures';
import { boardCard, connectSecondPlayer, playCreature } from '../harness';

/**
 * Two real browser contexts, one real relay, one real socket each — the tier that catches
 * sync-timing bugs a mocked transport cannot.
 *
 * Not WebRTC, despite what this test was called for a long time. `blockAnalytics` stops the
 * PostHog flags ever resolving, and `resolveNetworkTransport()` falls back to `websocket`
 * when it hasn't heard back — so this syncs over the Yjs websocket relay. Locally and in CI
 * that relay is booted by playwright.config.ts; against a deployed URL (@canary) it is the
 * real one, which is what makes the canary worth running.
 */
test('a card played by one player appears on the other player\'s board over the relay', { tag: ['@smoke', '@canary'] }, async ({ page }) => {
  const bob = await connectSecondPlayer(page);
  try {
    const card = await playCreature(page);
    const cardId = await card.getAttribute('data-card-id');
    expect(cardId).toBeTruthy();
    await expect(boardCard(bob, cardId!)).toBeVisible({ timeout: 10000 });
  } finally {
    await bob.context().close();
  }
});
