/**
 * E2e coverage for running keyless catalog actions from the ⌘K palette.
 *
 * These actions carry `key: ''`, so they appear in no shortcut list in the app
 * and the palette could not offer them until it derived its rows from the
 * catalog's `ToolbarPlacement` declarations.
 *
 * Every assertion here is on **game state**, not on the row existing. The unit
 * tests already prove the wiring; what only a browser proves is that a palette
 * row dispatched against the target it declared actually did the thing — and in
 * particular that a deck-targeted row acts on the library rather than the board.
 */
import { test, expect } from '../../fixtures';
import type { Page } from '@playwright/test';
import {
  commandPalette,
  commandPaletteInput,
  expectHandCount,
  expectPileCount,
} from '../../harness';

async function runFromPalette(page: Page, query: string, rowName: RegExp) {
  await page.keyboard.press('ControlOrMeta+k');
  await expect(commandPalette(page)).toBeVisible();
  await commandPaletteInput(page).fill(query);
  await page.getByRole('option', { name: rowName }).first().click();
  await expect(commandPalette(page)).not.toBeVisible();
}

test('Exile Top from the palette exiles the top of the deck', async ({ page }) => {
  // The load-bearing case for `ToolbarPlacement.target`. This row is plain
  // `moveToExile` aimed at the deck; dispatched against the board instead it
  // would exile a battlefield card, and the hand/board would be wrong rather
  // than the pile empty.
  await expectPileCount(page, 'exile', 0);
  await expectHandCount(page, 8);

  await runFromPalette(page, 'exile top', /exile top/i);

  await expectPileCount(page, 'exile', 1);
  await expectHandCount(page, 8);
});

test('Mill from the palette moves cards from deck to discard', async ({ page }) => {
  await expectPileCount(page, 'discard', 0);

  await runFromPalette(page, 'mill', /^mill$/i);
  await page.getByRole('dialog').locator('input').fill('2');
  await page.getByRole('dialog').getByRole('button', { name: 'Mill' }).click();

  await expectPileCount(page, 'discard', 2);
});

test('Scry from the palette opens the scry viewer', async ({ page }) => {
  await runFromPalette(page, 'scry', /^scry$/i);

  await expect(page.getByRole('dialog', { name: 'Scry' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Scry' }).click();
  await expect(page.getByRole('dialog', { name: 'Scry and Surveil' })).toBeVisible();
});

test('Reset Deck from the palette asks first, and confirming restarts the game', async ({ page }) => {
  // Runs through the same confirmation the toolbar shows — the point of sharing
  // one dispatch path is that a destructive row can't lose its gate on a new
  // surface.
  await runFromPalette(page, 'reset', /reset deck/i);

  await expect(page.getByRole('dialog', { name: /reset deck/i })).toBeVisible();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expectHandCount(page, 8);
});

test('a disabled row is not offered at all', async ({ page }) => {
  // `createLabel` is "Coming soon". A palette lists what you can do; an inert
  // row that swallows Enter is what the old reference rows got wrong.
  await page.keyboard.press('ControlOrMeta+k');
  await commandPaletteInput(page).fill('label');

  await expect(page.getByRole('option', { name: /^label$/i })).toHaveCount(0);
});
