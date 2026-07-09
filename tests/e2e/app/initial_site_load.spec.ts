import { test, expect } from '../fixtures';
import {
  boardToken,
  clickTokenHalf,
  dragCountedTokenToBoard,
  drawOpeningHand,
  expectHealth,
  playCreature,
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
