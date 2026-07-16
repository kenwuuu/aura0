import { expect, test } from '../../fixtures';
import { PHONE_VIEWPORT, boardTokens, whiteboard } from '../../harness';

/**
 * On desktop, "Create counter" opens a side popover you drag tokens out of.
 * Touch can't do HTML5 drag and the ~7-column grid doesn't fit beside a menu on
 * a 390px screen (it used to clip ~140px off the right edge). On phone it's
 * instead a bottom-sheet tray over the hand, with tap-to-add tokens (a fluid
 * 3×7 grid that shrinks to fit the width).
 *
 * Layout, so it runs on the normal harness at a phone viewport.
 */
test.use({ hasTouch: true });

/** Upper-left of the board — clear of the mats/piles that cluster low/center. */
async function emptyBoardPoint(page: Parameters<typeof whiteboard>[0]) {
  const box = await whiteboard(page).boundingBox();
  if (!box) throw new Error('Whiteboard has no bounding box (not rendered/visible).');
  return { x: box.x + box.width * 0.15, y: box.y + box.height * 0.15 };
}

async function openTokenTray(page: Parameters<typeof whiteboard>[0]) {
  const { x, y } = await emptyBoardPoint(page);
  await page.touchscreen.tap(x, y);
  const createToken = page.getByRole('menuitem', { name: /^Create counter\b/ });
  await expect(createToken).toBeVisible();
  await createToken.tap();
  await expect(page.getByTestId('mobile-token-tray')).toBeVisible();
}

test('the token tray stays within the screen on a phone', async ({ page }) => {
  await page.setViewportSize(PHONE_VIEWPORT);
  await openTokenTray(page);

  // The sheet — not the full-screen catcher — is what must fit horizontally and
  // sit at the bottom (over the hand).
  const sheet = page.getByTestId('mobile-token-tray-sheet');
  const box = await sheet.boundingBox();
  if (!box) throw new Error('Token tray sheet has no bounding box.');

  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(PHONE_VIEWPORT.width + 1);
  // Anchored to the bottom edge.
  expect(box.y + box.height).toBeGreaterThanOrEqual(PHONE_VIEWPORT.height - 2);

  await expect(page.getByText('Tap to add a counter')).toBeVisible();
});

test('tapping a token in the tray adds it to the board and closes the tray', async ({ page }) => {
  await page.setViewportSize(PHONE_VIEWPORT);
  await expect(boardTokens(page)).toHaveCount(0);

  await openTokenTray(page);

  // Tap the first token in the tray.
  await page.locator('[data-testid="mobile-token-tray"] [role="button"]').first().tap();

  await expect(boardTokens(page)).toHaveCount(1);
  await expect(page.getByTestId('mobile-token-tray')).toBeHidden();
});
