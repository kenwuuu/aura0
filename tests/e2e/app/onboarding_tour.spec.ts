/**
 * The onboarding tour (issue #74). Four steps: play, tap, draw, invite.
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
import type { Page } from '@playwright/test';
import {
  boardCards,
  connectSecondPlayer,
  currentTourStep,
  drawCard,
  floatingPanel,
  handCards,
  phoneHudActionLogToggle,
  playHandCardToBoard,
  roomLinkButton,
  settingsButton,
  waitForSync,
  tourBackButton,
  tourBubble,
  tourHalo,
  tourNextButton,
  tourOverlay,
  tourPlacement,
  tourSkipButton,
  tourTail,
  zoomControls,
  PHONE_VIEWPORT,
} from '../harness';

// Every other spec suppresses the tour (fixtures.ts) — this one is why the
// switch exists.
test.use({ onboardingTour: true });

/** The tour starts behind the 1.5s feature-flag fallback, so it never races the app. */
async function waitForTour(page: Page) {
  await expect(tourOverlay(page)).toBeVisible({ timeout: 5000 });
}

/** Tap the card on the board: Space while hovering it. There is no click-to-tap. */
async function tapBoardCard(page: Page, card: ReturnType<typeof boardCards>) {
  await card.hover();
  await page.keyboard.press('Space');
}

/** Walk the control order (play -> tap -> draw) to land on `invite`. */
async function walkToInvite(page: Page) {
  const card = await playHandCardToBoard(page);
  await expect.poll(() => currentTourStep(page), { timeout: 3000 }).toBe('tap');

  await tapBoardCard(page, card);
  await expect.poll(() => currentTourStep(page), { timeout: 3000 }).toBe('draw');

  await drawCard(page);
  await expect.poll(() => currentTourStep(page), { timeout: 3000 }).toBe('invite');
}

function overlaps(a: { x: number; y: number; width: number; height: number }, b: typeof a) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

test.describe('onboarding tour', () => {
  test('a new player is shown the tour, starting with "play a card"', async ({ page }) => {
    await waitForTour(page);
    expect(await currentTourStep(page)).toBe('play');
    await expect(tourBubble(page)).toContainText('1 / 4');
  });

  test('phone copy names the long-press; desktop copy does not', async ({ page }) => {
    await page.setViewportSize(PHONE_VIEWPORT);
    await waitForTour(page);
    await expect(tourBubble(page)).toContainText(/long press/i);

    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(tourBubble(page)).not.toContainText(/long press/i);
    await expect(tourBubble(page)).toContainText(/drag one onto the board/i);
  });

  test('the bubble stays parked above the hand across play, tap and draw', async ({ page }) => {
    await page.setViewportSize(PHONE_VIEWPORT);
    await waitForTour(page);

    expect(await tourPlacement(page)).toBe('aboveHand');
    const handTop = (await handCards(page).first().boundingBox())!.y;
    const atPlay = (await tourBubble(page).boundingBox())!;
    // Sitting on the cards, not floating clear of them.
    expect(atPlay.y + atPlay.height).toBeLessThanOrEqual(handTop);
    expect(atPlay.y + atPlay.height).toBeGreaterThan(handTop - 40);

    // `play` is the only hand step that points at the hand, so it's the only one
    // with a tail.
    expect(await tourTail(page)).toBe('down');

    // It must not hop around between the hand steps — only the words change. And
    // tap/draw act on the *board*, so they drop the tail rather than aim it at the
    // hand, which is not where the player should be looking.
    const card = await playHandCardToBoard(page);
    await expect.poll(() => currentTourStep(page), { timeout: 3000 }).toBe('tap');
    expect(await tourPlacement(page)).toBe('aboveHand');
    expect(await tourTail(page)).toBe('none');

    await tapBoardCard(page, card);
    await expect.poll(() => currentTourStep(page), { timeout: 3000 }).toBe('draw');
    expect(await tourPlacement(page)).toBe('aboveHand');
    expect(await tourTail(page)).toBe('none');
  });

  test('no halo on the hand steps — only the invite step rings a control', async ({ page }) => {
    await waitForTour(page);
    await expect(tourHalo(page)).toBeHidden();

    await walkToInvite(page);
    await expect(tourHalo(page)).toBeVisible();
  });

  test('the invite step drops under the copy-link button and haloes it', async ({ page }) => {
    await page.setViewportSize(PHONE_VIEWPORT);
    await waitForTour(page);
    await walkToInvite(page);

    expect(await tourPlacement(page)).toBe('belowAnchor');

    const link = (await roomLinkButton(page).boundingBox())!;
    const bubble = (await tourBubble(page).boundingBox())!;
    const halo = (await tourHalo(page).boundingBox())!;

    // Bubble sits below the button it points at.
    expect(bubble.y).toBeGreaterThanOrEqual(link.y + link.height);
    expect(bubble.y).toBeLessThan(link.y + link.height + 30);

    // Halo rings the button rather than something else.
    expect(halo.x).toBeLessThanOrEqual(link.x);
    expect(halo.y).toBeLessThanOrEqual(link.y);
    expect(halo.x + halo.width).toBeGreaterThanOrEqual(link.x + link.width);
    expect(halo.y + halo.height).toBeGreaterThanOrEqual(link.y + link.height);
  });

  test('the bubble clears the board chrome instead of sitting on top of it', async ({ page }) => {
    // Phone: the HUD column runs down the left, settings + zoom down the right.
    // A full-width bubble covered both. It's pointer-events:none so they still
    // *worked*, but it looked broken.
    await page.setViewportSize(PHONE_VIEWPORT);
    await waitForTour(page);
    await walkToInvite(page); // `invite` is the step that rides up near them

    const phoneBubble = (await tourBubble(page).boundingBox())!;
    for (const chrome of [phoneHudActionLogToggle(page), settingsButton(page), zoomControls(page)]) {
      const box = await chrome.boundingBox();
      if (box) expect(overlaps(phoneBubble, box)).toBe(false);
    }

    // Desktop: the Game Actions panel sits directly under the toolbar.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(300);
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

    await tapBoardCard(page, card);
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

    await tapBoardCard(page, card);
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

  test('copying the room link finishes the tour', async ({ page }) => {
    await waitForTour(page);
    await walkToInvite(page);

    await roomLinkButton(page).click();

    await expect(tourOverlay(page)).toBeHidden();
  });

  test('the invite step survives another player being in the room', async ({ page }) => {
    // Regression: `invite` used to also complete on `playerCount > 1`. A second
    // client in the room — a duplicate tab, a socket still closing after a reload,
    // or simply the friend you invited — satisfied it the instant it appeared.
    // Being the last step, that ended the tour and marked it done: the step was
    // never seen, and the tour just vanished after the draw.
    await waitForTour(page);
    const bob = await connectSecondPlayer(page);

    try {
      await waitForSync(page, 2);
      await walkToInvite(page);

      // Still there, still waiting on the player to actually copy the link.
      expect(await currentTourStep(page)).toBe('invite');
      await expect(tourOverlay(page)).toBeVisible();
      await page.waitForTimeout(800);
      await expect(tourOverlay(page)).toBeVisible();

      await roomLinkButton(page).click();
      await expect(tourOverlay(page)).toBeHidden();
    } finally {
      await bob.context().close();
    }
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
