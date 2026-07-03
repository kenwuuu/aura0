import { test, expect } from '../fixtures';
import { drawOpeningHand, importOneCardDeck } from '../harness';

test('app boots with the default deck and can import a new one', { tag: '@smoke' }, async ({ page }) => {
  // Fresh session: default deck already loaded (fixtures gate on this), confirm
  // the opening-hand contract explicitly as its own assertion.
  await drawOpeningHand(page);

  // Importing a deck replaces the hand with a fresh draw from the new list.
  await importOneCardDeck(page, '1x Krenko', 'krenko, mob boss');
  await expect(page.getByRole('dialog')).toBeHidden();
});
