import { test, expect } from '../fixtures';
import {
  boardToken,
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
  // Each left click adds +1. Assert between clicks so react-flow doesn't
  // coalesce them (a raw dblclick only lands one increment).
  await token.click();
  await expect(token).toHaveText('2');
  await token.click();
  await expect(token).toHaveText('3');
  await token.click();
  await expect(token).toHaveText('4');
});

test('testDecrementTokenOnBoard', async ({ page }) => {
  await dragCountedTokenToBoard(page);
  const token = boardToken(page);
  await expect(token).toHaveText('1');
  await token.click({ button: 'right' });
  await expect(token).toHaveText('0');
  await token.click({ button: 'right' });
  await expect(token).toHaveText('-1');
});

test('testCopyGameLink', async ({ page }) => {
  await page.getByRole('button', { name: 'COPY GAME LINK' }).click();
  await page.waitForTimeout(50);

  // Read from clipboard
  const clipboardText = await page.evaluate(async () => {
    return navigator.clipboard.readText();
  });

  expect(clipboardText).toBe(page.url());
});
