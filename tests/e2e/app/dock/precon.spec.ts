import { expect, test } from '../../fixtures';
import {
  expectHandCount,
  expectPileCount,
  openDeckSelection,
  preconRow,
  preconRows,
  preconSearch,
  selectPrecon,
} from '../../harness';

/**
 * A stable single-commander precon. Its full card list resolves against the live
 * card API by set+collector, so loading it deals a 7-card opening hand plus the
 * one auto-drawn commander (8), leaving 92 in the deck.
 */
const ABZAN_ARMOR = 'abzan-armor-tarkir-dragonstorm-commander';

test('testPreconCatalogRendersAndFilters', async ({ page }) => {
  await openDeckSelection(page);

  // The catalog loads and shows many decks...
  await expect(preconRows(page).first()).toBeVisible();
  expect(await preconRows(page).count()).toBeGreaterThan(50);

  // ...and the search box narrows to a single deck.
  await preconSearch(page).fill('Abzan Armor');
  await expect(preconRow(page, ABZAN_ARMOR)).toBeVisible();
  await expect(preconRows(page)).toHaveCount(1);
});

test('testSelectingPreconLoadsItIntoTheGame', async ({ page }) => {
  // The fixture boots on the default deck (8-card opening hand). Choosing a precon
  // replaces it: the commander is auto-drawn (7 + 1 = 8 in hand) and the other 92
  // cards land in the deck pile.
  await selectPrecon(page, ABZAN_ARMOR);

  await expectHandCount(page, 8);
  await expectPileCount(page, 'deck', 92);

  // Proof the precon path ran end to end (buildPreconDeck -> onDeckSelected ->
  // loadDeck): the ephemeral, namespaced id is recorded as last-loaded.
  const lastLoaded = await page.evaluate(() => localStorage.getItem('aura-last-loaded-deck'));
  expect(lastLoaded).toBe(`precon:${ABZAN_ARMOR}`);
});
