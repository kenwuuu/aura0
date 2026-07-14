/**
 * The onboarding tour (issue #74).
 *
 * The load-bearing assertion here is the one about pointer events. The tour's
 * first step asks the player to drag a card from the hand to the board — two
 * disjoint regions — so an overlay that captures pointers anywhere between them
 * eats the drop and strands the player on a step they cannot complete. A tour
 * that renders beautifully and blocks the drag is worse than no tour, and no
 * unit test can see it (pointer-events is a false-green in happy-dom).
 *
 * PostHog is blocked by the fixture (`blockAnalytics`), so the step-order flag
 * always falls back to `control` — which also means these specs exercise the
 * "PostHog never answered" path on every run.
 */
import { test, expect } from '../fixtures';
import {
  boardCards,
  currentTourStep,
  handCards,
  playHandCardToBoard,
  tourOverlay,
  tourSkipButton,
  PHONE_VIEWPORT,
} from '../harness';

/** The tour starts behind the 1.5s feature-flag fallback, so it never races the app. */
async function waitForTour(page: import('@playwright/test').Page) {
  await expect(tourOverlay(page)).toBeVisible({ timeout: 5000 });
}

// Every other spec suppresses the tour (fixtures.ts) — this one is why the
// switch exists.
test.use({ onboardingTour: true });

test.describe('onboarding tour', () => {
  test('a new player is shown the tour, starting with "play a card"', async ({ page }) => {
    await waitForTour(page);
    expect(await currentTourStep(page)).toBe('play');
  });

  test('phone copy names the long-press; desktop copy does not', async ({ page }) => {
    await page.setViewportSize(PHONE_VIEWPORT);
    await waitForTour(page);
    await expect(tourOverlay(page)).toContainText(/long press/i);

    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(tourOverlay(page)).not.toContainText(/long press/i);
    await expect(tourOverlay(page)).toContainText(/drag it to the board/i);
  });

  test('the overlay does not block the hand-to-board drag, and the drag advances the step', async ({ page }) => {
    await waitForTour(page);
    expect(await currentTourStep(page)).toBe('play');
    await expect(boardCards(page)).toHaveCount(0);

    // `playHandCardToBoard` picks its card with `document.elementFromPoint`, so a
    // tour overlay that captured pointers over the hand would make it throw
    // "No clickable hand card found" — and it drags with real incremental travel,
    // which a teleporting `dragTo()` would not (docs/testing/e2e.md).
    await playHandCardToBoard(page);

    // The card actually landed — nothing intercepted the drop.
    await expect(boardCards(page)).toHaveCount(1);
    // ...and the tour noticed, with no Next button anywhere in sight.
    await expect
      .poll(() => currentTourStep(page), { timeout: 3000 })
      .toBe('tap');
  });

  test('the step does not advance until the action actually happens', async ({ page }) => {
    await waitForTour(page);

    // Sit on the step doing nothing. A tour that advances on a timer, or on any
    // stray click, would move on here.
    await page.mouse.click(5, 5);
    await page.waitForTimeout(1000);

    expect(await currentTourStep(page)).toBe('play');
    await expect(boardCards(page)).toHaveCount(0);
  });

  test('skip dismisses the tour, and it stays gone across a reload', async ({ page }) => {
    await waitForTour(page);

    await tourSkipButton(page).click();
    await expect(tourOverlay(page)).toBeHidden();

    await page.reload({ waitUntil: 'networkidle' });
    await expect(handCards(page)).toHaveCount(8);
    // Give it well past the flag-fallback window to (not) appear.
    await page.waitForTimeout(2500);
    await expect(tourOverlay(page)).toBeHidden();
  });
});
