import { test, expect } from '../fixtures';
import { pileTile } from '../harness';

test('testTooltipShowsOnDeck', async ({page}) => {
  await pileTile(page, 'deck').hover();
  await expect(page.getByText('Mulligan', { exact: true })).toBeVisible();
});

test('testTooltipShowsOnExile', async ({page}) => {
  await pileTile(page, 'exile').hover();
  await expect(page.getByText('Mulligan', { exact: true })).toBeHidden();
  await expect(page.locator('span').filter({ hasText: 'Exile' })).toBeHidden();
  await expect(page.locator('span').filter({ hasText: 'Discard' })).toBeVisible();
  await expect(page.getByText('To deck top', { exact: true })).toBeVisible();
  await expect(page.getByText('To deck bottom', { exact: true })).toBeVisible();
});

test('testTooltipShowsOnDiscard', async ({page}) => {
  await pileTile(page, 'discard').hover();
  await expect(page.getByText('Mulligan', { exact: true })).toBeHidden();
  await expect(page.locator('span').filter({ hasText: 'Discard' })).toBeHidden();
  await expect(page.locator('span').filter({ hasText: 'Exile' })).toBeVisible();
  await expect(page.getByText('To deck top', { exact: true })).toBeVisible();
  await expect(page.getByText('To deck bottom', { exact: true })).toBeVisible();
});
