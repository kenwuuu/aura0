/**
 * E2e tests for the GameActionsToolbar and pile-viewer action buttons.
 *
 * Covers:
 * - Toolbar buttons: Untap All, Draw, Pass
 * - Actions dropdown: Draw X, Mill, Exile Top, Random Discard, Shuffle, Mulligan,
 *   Scry, Surveil, View Deck, Reveal Hand, Reset Deck
 * - Create dropdown: Token (grid visible), Token Card (search modal), Label (disabled)
 * - PileViewer: "Close & Shuffle" in deck viewer, "Exile All" in discard viewer
 */

import { test, expect } from '../fixtures';
import { Page } from '@playwright/test';
import { expectHandCount, expectPileCount, handCards, openPileViewer } from '../harness';

// ── Helpers ──────────────────────────────────────────────────────────────────

function toolbar(page: Page) {
  return page.getByTestId('game-actions-toolbar');
}

// ── Toolbar: Untap All ────────────────────────────────────────────────────────

test('toolbar Untap All logs the action', async ({ page }) => {
  await toolbar(page).getByText('Untap All').click();
  // Confirm action log mentions "untapped all cards"
  await expect(page.locator('text=untapped all cards')).toBeVisible({ timeout: 3000 });
});

// ── Toolbar: Draw ─────────────────────────────────────────────────────────────

test('toolbar Draw draws a card and logs', async ({ page }) => {
  // Get initial hand count (typically 8 after deck load draws 7 + commander)
  const initialHand = await handCards(page).count();
  await toolbar(page).getByText('Draw').click();
  await expect(handCards(page)).toHaveCount(initialHand + 1, { timeout: 3000 });
  await expect(page.locator('text=drew a card')).toBeVisible({ timeout: 3000 });
});

// ── Toolbar: Pass ─────────────────────────────────────────────────────────────

test('toolbar Pass logs a "passed their turn" message', async ({ page }) => {
  await toolbar(page).getByText('Pass').click();
  await expect(page.locator('text=passed their turn')).toBeVisible({ timeout: 3000 });
});

// ── Actions: Draw X ───────────────────────────────────────────────────────────

test('Actions > Draw X draws the specified number of cards', async ({ page }) => {
  const initialHand = await handCards(page).count();
  await toolbar(page).getByText('Actions').click();
  await page.getByRole('menuitem', { name: 'Draw X' }).click();
  // NumberPrompt: change value to 3
  await page.getByRole('dialog').locator('input').fill('3');
  await page.getByRole('dialog').getByRole('button', { name: 'Draw' }).click();
  await expectHandCount(page, initialHand + 3);
  await expect(page.locator('text=drew 3 cards')).toBeVisible({ timeout: 3000 });
});

// ── Actions: Scry ─────────────────────────────────────────────────────────────

test('Actions > Scry opens scry pile viewer', async ({ page }) => {
  await toolbar(page).getByText('Actions').click();
  await page.getByRole('menuitem', { name: 'Scry' }).click();
  // NumberPrompt
  await expect(page.getByRole('dialog', { name: 'Scry' })).toBeVisible({ timeout: 3000 });
  await page.getByRole('dialog').getByRole('button', { name: 'Scry' }).click();
  // Scry pile viewer opens (titled "Scry and Surveil")
  await expect(page.getByRole('dialog', { name: 'Scry and Surveil' })).toBeVisible({ timeout: 5000 });
  await page.keyboard.press('Escape');
  await expect(page.locator('text=scried 1')).toBeVisible({ timeout: 3000 });
});

// ── Actions: Surveil ──────────────────────────────────────────────────────────

test('Actions > Surveil opens surveil pile viewer', async ({ page }) => {
  await toolbar(page).getByText('Actions').click();
  await page.getByRole('menuitem', { name: 'Surveil' }).click();
  await expect(page.getByRole('dialog', { name: 'Surveil' })).toBeVisible({ timeout: 3000 });
  await page.getByRole('dialog').getByRole('button', { name: 'Surveil' }).click();
  await expect(page.getByRole('dialog', { name: 'Scry and Surveil' })).toBeVisible({ timeout: 5000 });
  await page.keyboard.press('Escape');
  await expect(page.locator('text=surveiled 1')).toBeVisible({ timeout: 3000 });
});

// ── Actions: Mill ─────────────────────────────────────────────────────────────

test('Actions > Mill moves cards from deck to discard', async ({ page }) => {
  await expectPileCount(page, 'discard', 0);
  await toolbar(page).getByText('Actions').click();
  await page.getByRole('menuitem', { name: 'Mill' }).click();
  await page.getByRole('dialog').locator('input').fill('2');
  await page.getByRole('dialog').getByRole('button', { name: 'Mill' }).click();
  await expectPileCount(page, 'discard', 2);
  await expect(page.locator('text=milled 2 cards')).toBeVisible({ timeout: 3000 });
});

// ── Actions: Exile Top ────────────────────────────────────────────────────────

test('Actions > Exile Top moves top deck card to exile', async ({ page }) => {
  await expectPileCount(page, 'exile', 0);
  await toolbar(page).getByText('Actions').click();
  await page.getByRole('menuitem', { name: 'Exile Top' }).click();
  await expectPileCount(page, 'exile', 1);
});

// ── Actions: Shuffle ─────────────────────────────────────────────────────────

test('Actions > Shuffle logs a shuffle', async ({ page }) => {
  await toolbar(page).getByText('Actions').click();
  await page.getByRole('menuitem', { name: 'Shuffle' }).click();
  await expect(page.locator('text=shuffled their deck')).toBeVisible({ timeout: 3000 });
});

// ── Actions: Mulligan ─────────────────────────────────────────────────────────

/**
 * The toolbar used to mulligan outright while the `M` key and the deck menu both
 * asked first — the drift that came out of the toolbar owning a second copy of
 * this action. Now all three dispatch one executor, so the toolbar confirms too.
 */
test('Actions > Mulligan confirms, then returns hand and redraws 7', async ({ page }) => {
  await toolbar(page).getByText('Actions').click();
  await page.getByRole('menuitem', { name: 'Mulligan' }).click();

  // triggerConfirmation's dialog is keyboard-driven; M is mulligan's confirm key.
  await expect(page.getByRole('dialog').filter({ hasText: 'Mulligan?' })).toBeVisible({ timeout: 3000 });
  await expect(page.locator('text=took a mulligan')).toBeHidden();

  await page.keyboard.press('m');

  await expect(page.locator('text=took a mulligan')).toBeVisible({ timeout: 3000 });

  // Still commander + 7. The commander is in the command zone, not the library,
  // so a mulligan redraws around it — a hand of 7 would mean Krenko got
  // shuffled into the deck where he can never be cast.
  await expectHandCount(page, 8);
});

// ── Actions: Reset Deck ───────────────────────────────────────────────────────

test('Actions > Reset Deck confirms, then restarts with a fresh opening hand', async ({ page }) => {
  // Build up some non-deck state: one card milled to discard, one exiled.
  await toolbar(page).getByText('Actions').click();
  await page.getByRole('menuitem', { name: 'Mill' }).click();
  await page.getByRole('dialog').locator('input').fill('1');
  await page.getByRole('dialog').getByRole('button', { name: 'Mill' }).click();
  await expectPileCount(page, 'discard', 1);

  await toolbar(page).getByText('Actions').click();
  await page.getByRole('menuitem', { name: 'Exile Top' }).click();
  await expectPileCount(page, 'exile', 1);

  await toolbar(page).getByText('Actions').click();
  await page.getByRole('menuitem', { name: 'Reset Deck' }).click();

  const dialog = page.getByRole('dialog', { name: 'Reset Deck?' });
  await expect(dialog).toBeVisible({ timeout: 3000 });
  await dialog.getByRole('button', { name: 'Reset' }).click();
  await expect(dialog).not.toBeVisible({ timeout: 3000 });

  // The milled and exiled cards go back, and the player is dealt a new opening
  // hand — 8 for the default deck (Krenko + 7), the same as on first boot.
  await expectHandCount(page, 8);
  await expectPileCount(page, 'discard', 0);
  await expectPileCount(page, 'exile', 0);
});

test('Actions > Reset Deck Cancel leaves state untouched', async ({ page }) => {
  await toolbar(page).getByText('Actions').click();
  await page.getByRole('menuitem', { name: 'Reset Deck' }).click();

  const dialog = page.getByRole('dialog', { name: 'Reset Deck?' });
  await expect(dialog).toBeVisible({ timeout: 3000 });
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).not.toBeVisible({ timeout: 3000 });

  await expectHandCount(page, 8);
});

// ── Actions: View Deck ────────────────────────────────────────────────────────

// Was "Look at Top", which opened the whole deck viewer regardless of the name.
// It is now the deck-targeted toolbar placement of the deck node's own "View".
test('Actions > View Deck opens deck viewer', async ({ page }) => {
  await toolbar(page).getByText('Actions').click();
  await page.getByRole('menuitem', { name: 'View Deck' }).click();
  await expect(page.getByRole('dialog', { name: 'Search Deck' })).toBeVisible({ timeout: 5000 });
  await page.keyboard.press('Escape');
});

// ── Actions: Random Discard ───────────────────────────────────────────────────

test('Actions > Random Discard discards a hand card', async ({ page }) => {
  // Ensure hand has cards
  if ((await handCards(page).count()) === 0) {
    await toolbar(page).getByText('Draw').click();
  }
  await expectPileCount(page, 'discard', 0);
  await toolbar(page).getByText('Actions').click();
  await page.getByRole('menuitem', { name: 'Random Discard' }).click();
  await expectPileCount(page, 'discard', 1);
  await expect(page.locator('text=randomly discarded')).toBeVisible({ timeout: 3000 });
});

// ── Actions: Reveal Hand ──────────────────────────────────────────────────────

test('Actions > Reveal Hand logs reveal', async ({ page }) => {
  await toolbar(page).getByText('Actions').click();
  await page.getByRole('menuitem', { name: 'Reveal Hand' }).click();
  await expect(page.locator('text=revealed their hand')).toBeVisible({ timeout: 3000 });
});

/**
 * Reveal Hand is the only stateful item in the Actions menu, so it is the one
 * users genuinely reopen the menu to toggle back off — which is what made it the
 * sharpest case of the dismiss-layer bug: reopening a non-modal DropdownMenu
 * right after selecting an item, Radix treated the trigger's own pointerdown as
 * an outside interaction and closed the menu again, so the second click was
 * swallowed. `keepTriggerInteractionsInside` (GameActionsToolbar.tsx) fixes it.
 *
 * This test used to sleep 250ms before reopening ("if we click actions again too
 * quickly, it fails") — that sleep was the bug, not a timing quirk. It is
 * deliberately absent: reopening immediately is the regression this guards.
 */
test('Actions > Reveal Hand toggles back off — the menu reopens immediately after a select', async ({ page }) => {
  await toolbar(page).getByText('Actions').click();
  await page.getByRole('menuitem', { name: 'Reveal Hand' }).click();
  await expect(page.locator('text=revealed their hand')).toBeVisible({ timeout: 3000 });

  await toolbar(page).getByText('Actions').click();
  await page.getByRole('menuitem', { name: 'Reveal Hand' }).click();
  await expect(page.locator('text=stopped revealing their hand')).toBeVisible({ timeout: 3000 });
});

// ── Create: Counter ───────────────────────────────────────────────────────────

test('Create > Counter opens the ability-token grid', async ({ page }) => {
  await toolbar(page).getByText('Create').click();
  await page.getByRole('menuitem', { name: 'Counter', exact: true }).click();
  // Keyword token grid should appear in a popover
  await expect(page.locator('text=Drag a counter onto the board')).toBeVisible({ timeout: 3000 });
});

// ── Create: Token Card ────────────────────────────────────────────────────────

test('Create > Token Card opens search modal', async ({ page }) => {
  await toolbar(page).getByText('Create').click();
  await page.getByRole('menuitem', { name: 'Token Card' }).click();
  await expect(page.getByRole('dialog', { name: 'Create Token Card' })).toBeVisible({ timeout: 3000 });
  await page.keyboard.press('Escape');
});

// ── Create: Label (disabled) ──────────────────────────────────────────────────

test('Create > Label is disabled', async ({ page }) => {
  await toolbar(page).getByText('Create').click();
  const labelItem = page.getByRole('menuitem', { name: 'Label' });
  await expect(labelItem).toBeVisible({ timeout: 2000 });
  // Radix renders data-disabled as a bare/empty attribute (presence, not the
  // string "true") — assert via aria-disabled instead, which does carry "true".
  await expect(labelItem).toHaveAttribute('aria-disabled', 'true');
});

// ── PileViewer: Close & Shuffle ───────────────────────────────────────────────

test('Deck viewer has Close & Shuffle button that closes and logs shuffle', async ({ page }) => {
  await openPileViewer(page, 'deck');
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
  const shuffleBtn = page.getByRole('button', { name: 'Close & Shuffle' });
  await expect(shuffleBtn).toBeVisible({ timeout: 3000 });
  await shuffleBtn.click();
  // Dialog should close
  await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 3000 });
  // Log entry for shuffle
  await expect(page.locator('text=shuffled their deck')).toBeVisible({ timeout: 3000 });
});

// ── PileViewer: Exile All ─────────────────────────────────────────────────────

test('Discard viewer Exile All moves all cards to exile', async ({ page }) => {
  // First mill some cards so discard isn't empty
  await toolbar(page).getByText('Actions').click();
  await page.getByRole('menuitem', { name: 'Mill' }).click();
  await page.getByRole('dialog').locator('input').fill('3');
  await page.getByRole('dialog').getByRole('button', { name: 'Mill' }).click();
  await expectPileCount(page, 'discard', 3);
  await expectPileCount(page, 'exile', 0);

  // Open discard viewer
  await openPileViewer(page, 'discard');
  await expect(page.getByRole('dialog', { name: 'Discard Pile' })).toBeVisible({ timeout: 5000 });
  const exileAllBtn = page.getByRole('button', { name: 'Exile All' });
  await expect(exileAllBtn).toBeVisible({ timeout: 3000 });
  await exileAllBtn.click();

  // Discard should be empty; exile should have 3 cards
  await expectPileCount(page, 'discard', 0);
  await expectPileCount(page, 'exile', 3);
});
