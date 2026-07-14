/**
 * The onboarding tour (issue #74).
 *
 * The load-bearing assertion here is the one about pointer events. The tour's
 * `play` step asks the player to drag a card from the hand to the board — two
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
  drawCard,
  floatingPanel,
  handCards,
  phoneHudActionLogToggle,
  playHandCardToBoard,
  settingsButton,
  tourBackButton,
  tourBubble,
  tourNextButton,
  tourOverlay,
  tourPlacement,
  tourSkipButton,
  zoomControls,
  PHONE_VIEWPORT,
} from '../harness';

// Every other spec suppresses the tour (fixtures.ts) — this one is why the
// switch exists.
test.use({ onboardingTour: true });

/** The tour starts behind the 1.5s feature-flag fallback, so it never races the app. */
async function waitForTour(page: import('@playwright/test').Page) {
  await expect(tourOverlay(page)).toBeVisible({ timeout: 5000 });
}

test.describe('onboarding tour', () => {
  test('a new player is shown the tour, starting with "play a card"', async ({ page }) => {
    await waitForTour(page);
    expect(await currentTourStep(page)).toBe('play');
  });

  test('phone copy names the long-press; desktop copy does not', async ({ page }) => {
    await page.setViewportSize(PHONE_VIEWPORT);
    await waitForTour(page);
    await expect(tourBubble(page)).toContainText(/long press/i);

    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(tourBubble(page)).not.toContainText(/long press/i);
    await expect(tourBubble(page)).toContainText(/drag one up onto the board/i);
  });

  test('the bubble sits above the hand for the hand step, and up top for the rest', async ({ page }) => {
    await page.setViewportSize(PHONE_VIEWPORT);
    await waitForTour(page);

    // `play` is the only step whose action happens in the hand, so it's the only
    // one that sits down there — below the board, above the cards.
    expect(await tourPlacement(page)).toBe('aboveHand');
    const handTop = (await handCards(page).first().boundingBox())!.y;
    const bubble = (await tourBubble(page).boundingBox())!;
    expect(bubble.y + bubble.height).toBeLessThanOrEqual(handTop);
    expect(bubble.y + bubble.height).toBeGreaterThan(handTop - 60);

    await playHandCardToBoard(page);
    await expect.poll(() => currentTourStep(page), { timeout: 3000 }).toBe('tap');

    // `tap` happens on the board, so the bubble gets out of the way.
    expect(await tourPlacement(page)).toBe('top');
    const topBubble = (await tourBubble(page).boundingBox())!;
    expect(topBubble.y).toBeLessThan(handTop / 2);
  });

  test('the bubble clears the board chrome instead of sitting on top of it', async ({ page }) => {
    const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
      a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

    // Phone: the HUD column runs down the left, settings + zoom down the right.
    // A full-width bubble covered both. It's pointer-events:none so they still
    // *worked*, but it looked broken.
    await page.setViewportSize(PHONE_VIEWPORT);
    await waitForTour(page);
    await playHandCardToBoard(page); // -> `tap`, which is a `top`-placed step
    await expect.poll(() => currentTourStep(page), { timeout: 3000 }).toBe('tap');
    expect(await tourPlacement(page)).toBe('top');

    const phoneBubble = (await tourBubble(page).boundingBox())!;
    for (const chrome of [phoneHudActionLogToggle(page), settingsButton(page), zoomControls(page)]) {
      const box = await chrome.boundingBox();
      if (box) expect(overlaps(phoneBubble, box)).toBe(false);
    }

    // Desktop: the Game Actions panel sits directly under the toolbar.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(200);
    const deskBubble = (await tourBubble(page).boundingBox())!;
    for (const panel of [floatingPanel(page, 'game-actions-toolbar'), floatingPanel(page, 'action-log')]) {
      const box = await panel.boundingBox();
      if (box) expect(overlaps(deskBubble, box)).toBe(false);
    }
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
    await expect.poll(() => currentTourStep(page), { timeout: 3000 }).toBe('tap');
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

  test('the tap step names a gesture that actually taps (a plain click does not)', async ({ page }) => {
    await waitForTour(page);
    const card = await playHandCardToBoard(page);
    await expect.poll(() => currentTourStep(page), { timeout: 3000 }).toBe('tap');

    // The copy used to say "click the card", which does nothing at all — there is
    // no left-click-to-tap path. Prove that, so the copy can't drift back to it.
    await card.click();
    await page.waitForTimeout(600);
    expect(await currentTourStep(page)).toBe('tap');

    await expect(tourBubble(page)).toContainText(/space/i);
    await expect(tourBubble(page)).toContainText(/right-click/i);

    await card.hover();
    await page.keyboard.press('Space');
    await expect.poll(() => currentTourStep(page), { timeout: 3000 }).toBe('draw');
  });

  test('ONE draw finishes the draw step, even though a card was played first', async ({ page }) => {
    await waitForTour(page);

    // Regression. The hand opens at 8; playing a card drops it to 7. When `draw`
    // was measured against the hand the *tour* started with (8) rather than the
    // hand the *step* started with (7), drawing back up to 8 wasn't growth — so
    // the first draw did nothing and the step silently needed a second one.
    const card = await playHandCardToBoard(page);
    await expect.poll(() => currentTourStep(page), { timeout: 3000 }).toBe('tap');

    // Tapping is Space-while-hovering (or the context menu) — there is no
    // left-click-to-tap, which is exactly what the step's copy now says.
    await card.hover();
    await page.keyboard.press('Space');
    await expect.poll(() => currentTourStep(page), { timeout: 3000 }).toBe('draw');

    const handBefore = await handCards(page).count();
    await drawCard(page);
    await expect(handCards(page)).toHaveCount(handBefore + 1);

    await expect.poll(() => currentTourStep(page), { timeout: 3000 }).toBe('invite');
  });

  test('Back re-opens a finished step without the game bouncing you straight out of it', async ({ page }) => {
    await waitForTour(page);
    await playHandCardToBoard(page);
    await expect.poll(() => currentTourStep(page), { timeout: 3000 }).toBe('tap');

    await tourBackButton(page).click();
    expect(await currentTourStep(page)).toBe('play');

    // The card is still on the board, so `play` is still satisfied. Without the
    // reviewing guard the watcher would immediately re-complete it and fling the
    // player back to `tap` — making Back look broken.
    await page.waitForTimeout(800);
    expect(await currentTourStep(page)).toBe('play');

    // Forward is the player's job while reviewing.
    await tourNextButton(page).click();
    expect(await currentTourStep(page)).toBe('tap');
  });

  test('there is no Back button on the first step', async ({ page }) => {
    await waitForTour(page);
    await expect(tourBackButton(page)).toBeHidden();
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
