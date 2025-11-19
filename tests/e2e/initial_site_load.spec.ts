import { test, expect } from '@playwright/test';

test('testPlayerDraws8CardsOnLoad', async ({ page }) => {
  await page.goto('http://localhost:5173/?room=mtg-playwright');
  const patchNotesBtn = page.getByRole('button', { name: '×', exact: true });
  if (await patchNotesBtn.count() > 0) {
    await patchNotesBtn.click();
  }
  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(page.getByText('92')).toBeVisible();
});

test('testDragCardToBoard', async ({ page }) => {
  await page.goto('http://localhost:5173/?room=mtg-playwright');
  const patchNotesBtn = page.getByRole('button', { name: '×', exact: true });
  if (await patchNotesBtn.count() > 0) {
    await patchNotesBtn.click();
  }
  await page.getByRole('button', { name: 'Got it' }).click();
  await page.locator('div').filter({ hasText: '#' }).nth(4).dragTo(page.locator('#whiteboard'));
  await expect(page.locator('div').filter({ hasText: '#' }).nth(3)).toBeVisible();
});

test('testDragTokenToBoard', async ({ page }) => {
  await page.goto('http://localhost:5173/?room=mtg-playwright');
  const patchNotesBtn = page.getByRole('button', { name: '×', exact: true });
  if (await patchNotesBtn.count() > 0) {
    await patchNotesBtn.click();
  }
  await page.getByRole('button', { name: 'Got it' }).click();

});

