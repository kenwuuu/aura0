import { expect, test } from '../fixtures';
import { boardCards, contextMenuRow, expectPileCount, importOneCardDeck, playCreature } from '../harness';

test('testImportDeck', async ({ page }) => {
  // import a one-card deck
  await importOneCardDeck(page, '1x Krenko', 'krenko, mob boss');

  const cards = boardCards(page);

  // Play Krenko — it spawns its related Goblin token as a second board card.
  await playCreature(page);
  await expect(cards).toHaveCount(2, { timeout: 10000 });

  // Right-click opens the action menu.
  await cards.last().click({ button: 'right' });
  await expect(contextMenuRow(page, 'copy')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.mouse.move(200, 200);

  // Clone twice → four cards to distribute to the four destinations.
  const cloneTopCard = async () => {
    await cards.last().click({ button: 'right' });
    await contextMenuRow(page, 'copy').click();
  };
  await cloneTopCard();
  await expect(cards).toHaveCount(3);
  await cloneTopCard();
  await expect(cards).toHaveCount(4);

  // Move a board card to a destination via its context menu. Waits for the
  // previous menu instance to fully close first — right-clicking again while
  // Radix is still mid-close-animation from the last selection can race the
  // new open, leaving `getByText` waiting on a menu that never (re)appears.
  const moveTopCard = async (action: string) => {
    await expect(page.getByRole('menu')).toBeHidden();
    await cards.last().click({ button: 'right' });
    await contextMenuRow(page, action).click();
  };

  await moveTopCard('moveToExile');
  await expectPileCount(page, 'exile', 1);

  await moveTopCard('moveToDiscard');
  await expectPileCount(page, 'discard', 1);

  await moveTopCard('moveToDeckTop');
  await expectPileCount(page, 'deck', 1);

  await moveTopCard('moveToHand');
  await expect(page.locator('.hand-cards .hand-card')).toHaveCount(1);

  // All four cards have left the battlefield.
  await expect(cards).toHaveCount(0);
});
