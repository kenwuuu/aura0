/**
 * E2e coverage for the toolbar's "New Game" button (src/features/room/NewGameButton.tsx):
 * opens a confirmation modal (Cancel leaves the current room untouched), and
 * on confirm navigates to a brand new room — the same fresh-room experience
 * as entering the app at the root URL.
 */
import { test, expect } from '../../fixtures';
import { newGameButton } from '../../harness';

test('New Game shows a confirmation, and Cancel leaves the room untouched', async ({ page }) => {
  const originalUrl = page.url();

  await newGameButton(page).click();
  const dialog = page.getByRole('dialog', { name: 'Start a New Game?' });
  await expect(dialog).toBeVisible({ timeout: 3000 });

  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).not.toBeVisible({ timeout: 3000 });
  expect(page.url()).toBe(originalUrl);
});

test('New Game confirm navigates to a fresh room', async ({ page }) => {
  const originalUrl = page.url();

  await newGameButton(page).click();
  const dialog = page.getByRole('dialog', { name: 'Start a New Game?' });
  await dialog.getByRole('button', { name: 'New Game' }).click();

  // A real page navigation happens here (not an SPA route change) — the app
  // re-bootstraps from scratch on the new room, same as a first-time visit.
  await expect(page.getByTestId('health-value')).toHaveValue('40', { timeout: 15000 });
  expect(page.url()).not.toBe(originalUrl);
  expect(new URL(page.url()).searchParams.get('room')).toBeTruthy();
});
