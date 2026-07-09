import { test, expect } from '../fixtures';
import {
  boardToken,
  clickTokenHalf,
  dragCountedTokenToBoard,
  drawOpeningHand,
  expectHealth,
  openTokenGrid,
  playCreature,
  tokenGrid,
  tokenGridItems,
} from '../harness';

test('testPlayerDraws8CardsOnLoad', async ({ page }) => {
  await drawOpeningHand(page);
});

test('testPlayerStartsWith40Health', async ({ page }) => {
  await expectHealth(page, 40);
});

test('testChooseDeck', async ({ page }) => {
  await page.getByRole('button', { name: '📚 Choose Deck' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByText('Krenko', { exact: false }).first().click();
  await expect(dialog).toBeHidden();
});

test('testDragCardToBoard', async ({ page }) => {
  const card = await playCreature(page);
  await expect(card).toBeVisible();
});

test('testDragTokenToBoard', async ({ page }) => {
  await dragCountedTokenToBoard(page);
  await expect(boardToken(page)).toBeVisible();
});

// Regression: the Token grid used to vanish the instant the mouse crossed the
// "Token" menu item on its way to the grid. The popover's anchor is that menu
// item; Radix Menu focuses the item on pointermove, which pulled focus out of
// the just-opened popover and its non-modal dismissable layer closed the grid.
// Reproduce the real pointer travel — over the item, then into the grid — and
// assert the grid stays open and interactive. `.click()`/`.dragTo()` never
// caught this because they warp to the target without a settling hover.
test('testTokenGridSurvivesPointerTravel', async ({ page }) => {
  await openTokenGrid(page);
  const grid = tokenGrid(page);
  const item = page.getByRole('menuitem', { name: 'Token', exact: true });

  // Settle on the menu item (this is what re-focuses it and used to dismiss).
  const ib = (await item.boundingBox())!;
  await page.mouse.move(ib.x + ib.width / 2, ib.y + ib.height / 2, { steps: 4 });
  await expect(grid).toBeVisible();

  // Travel into the grid and hover a token — it must remain interactive.
  const gb = (await grid.boundingBox())!;
  await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2, { steps: 10 });
  await tokenGridItems(page).first().hover();
  await expect(grid).toBeVisible();

  // An outside click still closes it — we only suppressed the focus-based dismiss.
  await page.mouse.click(2, 2);
  await expect(grid).toBeHidden();
});

test('testIncrementTokenOnBoard', async ({ page }) => {
  await dragCountedTokenToBoard(page);
  const token = boardToken(page);
  await expect(token).toHaveText('1');
  // Clicking the top half adds +1. Assert between clicks so react-flow
  // doesn't coalesce them (a raw dblclick only lands one increment).
  await clickTokenHalf(token, 'top');
  await expect(token).toHaveText('2');
  await clickTokenHalf(token, 'top');
  await expect(token).toHaveText('3');
  await clickTokenHalf(token, 'top');
  await expect(token).toHaveText('4');
});

test('testDecrementTokenOnBoard', async ({ page }) => {
  await dragCountedTokenToBoard(page);
  const token = boardToken(page);
  await expect(token).toHaveText('1');
  // Clicking the bottom half subtracts 1 (right-click now opens the token's
  // context menu instead of decrementing — see testTokenContextMenu below).
  await clickTokenHalf(token, 'bottom');
  await expect(token).toHaveText('0');
  await clickTokenHalf(token, 'bottom');
  await expect(token).toHaveText('-1');
});

test('testTokenContextMenu', async ({ page }) => {
  await dragCountedTokenToBoard(page);
  const token = boardToken(page);

  await token.click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: /Delete token/ })).toBeVisible();

  await page.getByRole('menuitem', { name: /Delete token/ }).click();
  await expect(token).toBeHidden();
});

test('testCopyGameLink', async ({ page }) => {
  await page.getByRole('button', { name: 'COPY ROOM LINK' }).click();
  await page.waitForTimeout(50);

  // Read from clipboard
  const clipboardText = await page.evaluate(async () => {
    return navigator.clipboard.readText();
  });

  expect(clipboardText).toBe(page.url());
});
