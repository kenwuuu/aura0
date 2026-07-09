import { test, expect } from '../fixtures';
import { pileTile } from '../harness';

/**
 * Piles used to show a hover tooltip listing their hotkeys (HotkeyTooltip).
 * That's gone now that every pile has a real right-click context menu with
 * the same actions — these tests cover the menu instead.
 */

test('testDeckContextMenu', async ({ page }) => {
  await pileTile(page, 'deck').click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: /^Draw\b/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /^Shuffle\b/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /^Mulligan\b/ })).toBeVisible();
});

test('testExileContextMenu', async ({ page }) => {
  await pileTile(page, 'exile').click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: /^Mulligan\b/ })).toBeHidden();
  await expect(page.getByRole('menuitem', { name: /^Exile\b/ })).toBeHidden();
  await expect(page.getByRole('menuitem', { name: /^Discard\b/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /^To deck top\b/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /^To deck bottom\b/ })).toBeVisible();
});

test('testDiscardContextMenu', async ({ page }) => {
  await pileTile(page, 'discard').click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: /^Mulligan\b/ })).toBeHidden();
  await expect(page.getByRole('menuitem', { name: /^Discard\b/ })).toBeHidden();
  await expect(page.getByRole('menuitem', { name: /^Exile\b/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /^To deck top\b/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /^To deck bottom\b/ })).toBeVisible();
});
