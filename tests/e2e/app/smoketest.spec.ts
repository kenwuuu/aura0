import { expect, test } from '../fixtures';
import {
  boardCards,
  expectPileCount,
  importOneCardDeck,
  playCreature,
} from '../harness';

test('testImportDeck', async ({ page }) => {
  // import a one-card deck
  await importOneCardDeck(page, '1x Krenko', 'krenko, mob boss');

  const cards = boardCards(page);

  // Play Krenko — it spawns its related Goblin token as a second board card.
  await playCreature(page);
  await expect(cards).toHaveCount(2, { timeout: 10000 });

  // Right-click opens the action menu.
  await cards.last().click({ button: 'right' });
  await expect(page.getByText('KCopy/clone')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.mouse.move(200, 200);

  // Clone twice → four cards to distribute to the four destinations.
  const cloneTopCard = async () => {
    await cards.last().click({ button: 'right' });
    await page.getByText('KCopy/clone').click();
  };
  await cloneTopCard();
  await expect(cards).toHaveCount(3);
  await cloneTopCard();
  await expect(cards).toHaveCount(4);

  // Move a board card to a destination via its context menu.
  const moveTopCard = async (menuText: string) => {
    await cards.last().click({ button: 'right' });
    await page.getByText(menuText).click();
  };

  await moveTopCard('SExile');
  await expectPileCount(page, 'exile', 1);

  await moveTopCard('DDiscard');
  await expectPileCount(page, 'discard', 1);

  await moveTopCard('TTo deck top');
  await expectPileCount(page, 'deck', 1);

  await moveTopCard('HHand');
  await expect(page.locator('.hand-cards .hand-card')).toHaveCount(1);

  // All four cards have left the battlefield.
  await expect(cards).toHaveCount(0);
});
