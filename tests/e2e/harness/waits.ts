import { Page, expect } from '@playwright/test';
import { pileViewerGrid, healthInputs } from './pageObjects';

/**
 * Wait for the pile viewer's card grid to finish its micro-batch render
 * (5 cards / 25ms — see PileViewerReact.tsx). Replaces the old
 * `waitForTimeout(500)` fallback with the actual `data-rendering-complete`
 * signal set by CardGrid once `visibleCardCount >= total`.
 */
export async function waitForPileViewerReady(page: Page): Promise<void> {
  await expect(pileViewerGrid(page)).toHaveAttribute('data-rendering-complete', 'true', {
    timeout: 10000,
  });
}

/**
 * Wait for a second (or Nth) peer's state to arrive over the real transport — the Yjs
 * websocket relay, not WebRTC (see two_player_sync.spec.ts). Polls a DOM-observable
 * post-sync condition — one `health-value` input renders per seated player (see
 * usePlaymatNodes.ts), so its count only reaches `expectedPlayerCount` once the remote
 * player's Yjs map has synced in. Never a fixed sleep: real transport timing is exactly
 * the class of bug (the hand-disappearing race) this tier exists to catch.
 *
 * If this starts timing out across the suite, suspect the relay before the app: it is the
 * one dependency every multiplayer spec shares.
 */
export async function waitForSync(page: Page, expectedPlayerCount: number): Promise<void> {
  await expect(healthInputs(page)).toHaveCount(expectedPlayerCount, { timeout: 15000 });
}
