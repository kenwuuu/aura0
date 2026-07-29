import { test, expect } from '../fixtures';
import { contextMenuRow, pileTile } from '../harness';

/**
 * Piles used to show a hover tooltip listing their hotkeys (HotkeyTooltip).
 * That's gone now that every pile has a real right-click context menu with
 * the same actions — these tests cover the menu instead.
 */

test('testDeckContextMenu', async ({ page }) => {
  await pileTile(page, 'deck').click({ button: 'right' });
  // By action id, not label: "Draw" and "Draw X" both live on the deck menu.
  await expect(contextMenuRow(page, 'draw')).toBeVisible();
  await expect(contextMenuRow(page, 'shuffle')).toBeVisible();
  await expect(contextMenuRow(page, 'mulligan')).toBeVisible();
});

test('the deck menu offers the library actions that used to be toolbar-only', async ({ page }) => {
  await pileTile(page, 'deck').click({ button: 'right' });
  for (const action of ['drawX', 'scry', 'surveil', 'mill']) {
    await expect(contextMenuRow(page, action), `deck menu should offer ${action}`).toBeVisible();
  }
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
