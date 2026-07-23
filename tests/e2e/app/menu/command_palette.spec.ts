/**
 * E2e coverage for the ⌘K command palette (src/app/command-palette/) and its
 * integration with the unified Help modal (src/app/HelpModal.tsx).
 *
 * Exercises the three things unit tests can't reach end to end: the global
 * keyboard binding, a runnable game action dispatching real game state, and the
 * "Open Help" navigation command driving the shared overlay across components.
 */
import { test, expect } from '../../fixtures';
import {
  commandPalette,
  commandPaletteButton,
  expectHandCount,
} from '../../harness';

test('⌘K opens the palette and a game command draws a card', async ({ page }) => {
  // Default fixture state: a loaded deck with an 8-card opening hand.
  await expectHandCount(page, 8);

  // `ControlOrMeta` mirrors react-hotkeys-hook's `mod` — ⌘ on macOS, Ctrl
  // elsewhere — so this matches whichever platform runs the suite.
  await page.keyboard.press('ControlOrMeta+k');
  await expect(commandPalette(page)).toBeVisible();

  await page.getByPlaceholder(/search actions and shortcuts/i).fill('draw');
  await page.getByRole('option', { name: /draw a card/i }).click();

  // The palette closes and the action really ran against game state.
  await expect(commandPalette(page)).not.toBeVisible();
  await expectHandCount(page, 9);
});

test('the toolbar launcher opens the palette; Escape closes it', async ({ page }) => {
  await commandPaletteButton(page).click();
  await expect(commandPalette(page)).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(commandPalette(page)).not.toBeVisible();
});

test('the "Open Help" command opens the unified Help modal at its Shortcuts tab', async ({ page }) => {
  await page.keyboard.press('ControlOrMeta+k');
  await expect(commandPalette(page)).toBeVisible();

  await page.getByPlaceholder(/search actions and shortcuts/i).fill('help');
  await page.getByRole('option', { name: /open help/i }).click();

  const help = page.getByRole('dialog', { name: /help & shortcuts/i });
  await expect(help).toBeVisible();

  // The Shortcuts tab renders live from the hotkey catalog.
  await help.getByRole('tab', { name: /shortcuts/i }).click();
  await expect(help.getByText('Tap card')).toBeVisible();
  await expect(help.getByText('Space')).toBeVisible();
});
