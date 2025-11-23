import { test, expect } from './fixtures';

test.skip('testPlayerDraws8CardsOnLoad', async ({ page }) => {
  await expect(page.getByText('92')).toBeVisible();
});

test('testPlayerStartsWith40Health', async ({ page }) => {
  await expect(page.getByText('40')).toBeVisible();
});

test.skip('testChooseDeck', async ({ page }) => {
  await page.getByRole('button', { name: '📚 Choose Deck' }).click();
  await page.getByText('Krenko100 cardsscryfallLast modified: 11/11/2025 04:21 AM🗑️').click();
});

test.skip('testDragCardToBoard', async ({ page }) => {
  await page.locator('div').filter({ hasText: '#' }).nth(4).dragTo(page.locator('#whiteboard'));
  await expect(page.locator('div').filter({ hasText: '#' }).nth(3)).toBeVisible();
});

test.skip('testDragTokenToBoard', async ({ page }) => {

});

