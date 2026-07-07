/**
 * E2e for the networking-free board demo (`/demo.html`, the task-3 spike).
 *
 * Deliberately does NOT use the game `fixtures` `test` — that navigates to `/`
 * (the marketing landing page) and waits for a full networked game to boot. The
 * demo is a standalone entry with no networking, so we drive it with the base
 * Playwright `test` and reuse the harness page objects / interactions.
 *
 * The demo is a great e2e target precisely because it's deterministic: no
 * y-webrtc, no signaling server, a hand-seeded board — so these assertions
 * exercise the real BattlefieldCanvas + GameActionsToolbar + hand-drag layer
 * without WebRTC flakiness.
 */
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { boardCards, handCards, playHandCardToBoard, drawCard } from '../harness';

const SEEDED_BOARD_CARDS = 4;
const OPENING_HAND = 5;

/** How many battlefield cards are currently tapped (rotated 90°). */
function tappedCount(page: Page): Promise<number> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid="battlefield-card"]'))
      .filter((el) => /rotate\(90deg\)/.test((el as HTMLElement).style.transform))
      .length,
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto('/demo.html');
  await expect(boardCards(page)).toHaveCount(SEEDED_BOARD_CARDS);
  await expect(handCards(page)).toHaveCount(OPENING_HAND);
});

test('seeds a board with two tapped cards', async ({ page }) => {
  expect(await tappedCount(page)).toBe(2);
});

test('Untap All untaps every tapped card', async ({ page }) => {
  await page.getByTestId('game-actions-toolbar').getByRole('button', { name: 'Untap All' }).click();
  await expect.poll(() => tappedCount(page)).toBe(0);
});

test('Draw moves a card from the deck into the hand', async ({ page }) => {
  await drawCard(page);
  await expect(handCards(page)).toHaveCount(OPENING_HAND + 1);
});

test('a hand card can be played onto the board', async ({ page }) => {
  await playHandCardToBoard(page); // asserts the played node becomes visible
  await expect(handCards(page)).toHaveCount(OPENING_HAND - 1);
  // Board grows by at least the played card (some cards also spawn a token).
  await expect(boardCards(page)).not.toHaveCount(SEEDED_BOARD_CARDS);
  expect(await boardCards(page).count()).toBeGreaterThan(SEEDED_BOARD_CARDS);
});
