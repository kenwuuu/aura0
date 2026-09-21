import { expect } from '@playwright/test';
import { test } from '../../fixtures';
import {
  MISTYPED_FOIL_CODE,
  VALID_FOIL_CODE,
  handCards,
  importDeck,
  reopenInNewTab,
} from '../../harness';

/**
 * Foil overlays on hand cards only.
 *
 * Deliberately not every overlay on the page: the store renders one over its own
 * preview card, so a page-wide count answers "is the store open" as much as "did
 * the cards light up".
 */
const handFoils = (page: import('@playwright/test').Page) =>
  handCards(page).getByTestId('foil-overlay');

/**
 * Redeeming a code, and the retroactive sweep that follows it.
 *
 * The sweep exists because fulfillment is manual: the code arrives hours after
 * the purchase and long after the deck was imported. Unit tests prove the sweep
 * writes to every zone; what only a browser proves is that the cards already on
 * screen repaint, with no reload.
 *
 * Nothing is mocked. The code check is local, so these specs type a real code
 * and get the real answer — there is no endpoint standing between the two for a
 * route handler to stub out.
 */

const DECKLIST = [
  '1 Sol Ring (C21) 263 *F*',
  '1 Arcane Signet (ELD) 331 *F*',
  '1 Command Tower (ELD) 333',
].join('\n');

const openStore = async (page: import('@playwright/test').Page) => {
  await page.keyboard.press('Meta+k');
  await page.getByPlaceholder(/search/i).fill('foil');
  await page.getByRole('option', { name: 'Foil cards' }).click();
};

test.beforeEach(async ({ page }) => {
  await importDeck(page, 'Foil deck', DECKLIST);
  await expect(handCards(page)).toHaveCount(3);
});

test('a good code lights up cards already in hand, without a reload', async ({ page }) => {
  // Nothing shimmers before the purchase, though the foil flags are already
  // on the cards — which is exactly what the sweep will go looking for.
  await expect(handFoils(page)).toHaveCount(0);

  await openStore(page);
  await page.getByLabel('Foil license code').fill(VALID_FOIL_CODE);
  await page.getByRole('button', { name: 'Redeem' }).click();

  await expect(page.getByTestId('foil-unlocked')).toBeVisible();

  // The cards were imported before the code existed. No reload happens here.
  await expect(handFoils(page)).toHaveCount(2);
});

test('a mistyped code changes nothing', async ({ page }) => {
  await openStore(page);
  await page.getByLabel('Foil license code').fill(MISTYPED_FOIL_CODE);
  await page.getByRole('button', { name: 'Redeem' }).click();

  await expect(page.getByRole('alert')).toContainText(/check it against the email/i);
  await expect(handFoils(page)).toHaveCount(0);
});

test('the unlock survives a reload', async ({ page }) => {
  await openStore(page);
  await page.getByLabel('Foil license code').fill(VALID_FOIL_CODE);
  await page.getByRole('button', { name: 'Redeem' }).click();
  await expect(handFoils(page)).toHaveCount(2);

  // A new tab rather than a reload, which is what the assertion below actually
  // claims: a buyer who closes the tab and comes back. It is also the more
  // stable of the two — reloading races the deck load and hangs about one run
  // in ten, where a cold boot into the same room does not.
  const returning = await reopenInNewTab(page);
  await expect(handCards(returning)).toHaveCount(3, { timeout: 15000 });

  // A buyer who closes the tab and comes back must not have to redeem again.
  await expect(handFoils(returning)).toHaveCount(2);
});
