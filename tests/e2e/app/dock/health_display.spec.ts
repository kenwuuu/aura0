import { test, expect } from '../../fixtures';
import { expectHealth, expectPileCount, keysForAction, pileViewerCards } from '../../harness';

// Life has two bindings each way — the plain key and its shifted twin — and
// these specs exist to prove BOTH fire. Resolved from the player's bindings
// rather than typed as '-'/'_' so the pair keeps meaning "the two alternates"
// whatever they are bound to.
const [loseKey, loseKeyShifted] = keysForAction('loseHealth');
const [gainKeyShifted, gainKey] = keysForAction('gainHealth');

test('testScryDoesNotDuplicateCards', async ({ page }) => {
  await expectPileCount(page, 'deck', 92);

  const scryOnce = async () => {
    await page.getByTestId('game-actions-toolbar').getByText('Actions').click();
    await page.getByRole('menuitem', { name: 'Scry' }).click();
    await page.getByRole('dialog').locator('input').fill('10');
    await page.getByRole('dialog').getByRole('button', { name: 'Scry' }).click();
    await expect(page.getByRole('dialog', { name: 'Scry and Surveil' })).toBeVisible({ timeout: 5000 });
    // Exactly 10 cards revealed, not 20 — a duplication bug would double-count
    // if the scry pile wasn't cleared before drawing the next batch.
    await expect(pileViewerCards(page)).toHaveCount(10);
    await page.keyboard.press('Escape');
  };

  await scryOnce();
  // Closing without resolving returns the scried cards to the deck untouched.
  await expectPileCount(page, 'deck', 92);

  // Repeating the flow should behave identically, not compound.
  await scryOnce();
  await expectPileCount(page, 'deck', 92);
});

test('testLoseHealthButton', async ({ page }) => {
  await expectHealth(page, 40);
  const decrement = page.getByRole('button', { name: 'Decrease health' }).first();
  await decrement.click();
  await expectHealth(page, 39);
  await decrement.click();
  await expectHealth(page, 38);
  await decrement.click();
  await expectHealth(page, 37);
  await decrement.click();
  await expectHealth(page, 36);
});

test('testLoseHealthHotkey1', async ({ page }) => {
  await expectHealth(page, 40);
  await page.keyboard.press(loseKey);
  await expectHealth(page, 39);
  await page.keyboard.press(loseKeyShifted);
  await expectHealth(page, 38);
  await page.keyboard.press(loseKey);
  await expectHealth(page, 37);
  await page.keyboard.press(loseKey);
  await expectHealth(page, 36);
});

test('testLoseHealthHotkey2', async ({ page }) => {
  await expectHealth(page, 40);
  await page.keyboard.press(loseKeyShifted);
  await expectHealth(page, 39);
  await page.keyboard.press(loseKeyShifted);
  await expectHealth(page, 38);
  await page.keyboard.press(loseKeyShifted);
  await expectHealth(page, 37);
  await page.keyboard.press(loseKeyShifted);
  await expectHealth(page, 36);
});

test('testGainHealthButton', async ({ page }) => {
  await expectHealth(page, 40);
  const increment = page.getByRole('button', { name: 'Increase health' }).first();
  await increment.click();
  await expectHealth(page, 41);
  await increment.click();
  await expectHealth(page, 42);
  await increment.click();
  await expectHealth(page, 43);
  await increment.click();
  await expectHealth(page, 44);
});

test('testGainHealthHotkey', async ({ page }) => {
  await expectHealth(page, 40);
  await page.keyboard.press(gainKey);
  await expectHealth(page, 41);
  await page.keyboard.press(gainKey);
  await expectHealth(page, 42);
  await page.keyboard.press(gainKey);
  await expectHealth(page, 43);
  await page.keyboard.press(gainKey);
  await expectHealth(page, 44);
});

test('testGainHealthHotkey2', async ({ page }) => {
  await expectHealth(page, 40);
  await page.keyboard.press(gainKeyShifted);
  await expectHealth(page, 41);
  await page.keyboard.press(gainKeyShifted);
  await expectHealth(page, 42);
  await page.keyboard.press(gainKeyShifted);
  await expectHealth(page, 43);
  await page.keyboard.press(gainKeyShifted);
  await expectHealth(page, 44);
});
