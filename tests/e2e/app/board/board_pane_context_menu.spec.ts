import { expect, test } from '../../fixtures';
import { expectHandCount, expectPileCount, getElementOrientation, playCreature, whiteboard } from '../../harness';

/** A point inside the whiteboard with no card/pile/token/mat under it —
 * player mats and piles sit low/center (a typical tabletop layout), so the
 * upper-left area of the canvas is clear on a fresh room. */
async function emptyBoardPoint(page: Parameters<typeof whiteboard>[0]) {
  const box = await whiteboard(page).boundingBox();
  if (!box) throw new Error('Whiteboard has no bounding box (not rendered/visible).');
  return { x: box.x + box.width * 0.15, y: box.y + box.height * 0.15 };
}

test('right-clicking empty board opens the global actions menu', async ({ page }) => {
  const { x, y } = await emptyBoardPoint(page);

  await page.mouse.click(x, y, { button: 'right' });

  await expect(page.getByRole('menuitem', { name: /^Draw\b/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /^Untap all\b/ })).toBeVisible();

  // Deck-pile actions (Shuffle/Mulligan) and per-player health (+1/-1 life)
  // are not empty-board actions — they stay off this menu (they live on the
  // deck and health-node menus respectively).
  await expect(page.getByRole('menuitem', { name: /^Shuffle\b/ })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: /^Mulligan\b/ })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: /^\+1 life\b/ })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: /^-1 life\b/ })).toHaveCount(0);
});

test('board pane menu offers Create token in place of "-1/-1 counter"', async ({ page }) => {
  const { x, y } = await emptyBoardPoint(page);

  await page.mouse.click(x, y, { button: 'right' });

  // The drag-to-board token grid took the "-1/-1 counter" slot; the "+1/+1"
  // ("Counter") row is untouched.
  await expect(page.getByRole('menuitem', { name: /^Counter\b/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /-1\/-1 counter/ })).toHaveCount(0);

  // "Create token" hosts the same drag-to-board grid as the toolbar's Create ▾
  // menu — clicking it opens the popover (real-browser check of the nested
  // Popover-in-DropdownMenu, which happy-dom can't faithfully reproduce).
  await page.getByRole('menuitem', { name: /^Create token\b/ }).click();
  await expect(page.getByText(/drag a token onto the board/i)).toBeVisible();
});

test('Draw from the board pane menu draws a card', async ({ page }) => {
  await expectHandCount(page, 8);
  await expectPileCount(page, 'deck', 92);
  const { x, y } = await emptyBoardPoint(page);

  await page.mouse.click(x, y, { button: 'right' });
  await page.getByRole('menuitem', { name: /^Draw\b/ }).click();

  await expectHandCount(page, 9);
  await expectPileCount(page, 'deck', 91);
});

test('Untap all from the board pane menu untaps every owned card', async ({ page }) => {
  const card = await playCreature(page);
  expect(await getElementOrientation(card)).toBe('portrait');

  await card.click({ button: 'right' });
  await page.getByRole('menuitem', { name: /^Tap\b/ }).click();
  expect(await getElementOrientation(card)).toBe('landscape');

  const { x, y } = await emptyBoardPoint(page);
  await page.mouse.click(x, y, { button: 'right' });
  await page.getByRole('menuitem', { name: /^Untap all\b/ }).click();

  expect(await getElementOrientation(card)).toBe('portrait');
});
