import { expect, test } from '../../fixtures';
import {boardTokens, cloneBoardCard, expectPileCount, getElementOrientation, openCardMenu, playCreature} from '../../harness';

test('testExileTooltip', async ({ page }) => {
  const card = await playCreature(page);
  await card.click({ button: 'right' });
  const tooltipRow = page.getByText('ExileS');
  await tooltipRow.waitFor({ state: 'visible' });
  await tooltipRow.click();
  await expectPileCount(page, 'exile', 1);
});

test('testDiscardTooltip', async ({ page }) => {
  const card = await playCreature(page);
  await card.click({ button: 'right' });
  const tooltipRow = page.getByText('DiscardD');
  await tooltipRow.waitFor({ state: 'visible' });
  await tooltipRow.click();
  await expectPileCount(page, 'discard', 1);
});

test('testDeckTooltip', async ({ page }) => {
  const card = await playCreature(page);
  await card.click({ button: 'right' });
  const tooltipRow = page.getByText('To deck topT');
  await tooltipRow.waitFor({ state: 'visible' });
  await tooltipRow.click();

  await expectPileCount(page, 'deck', 93);
});

test('testHandTooltip', async ({ page }) => {
  const eighthHandCard = page.locator('.hand-cards .hand-card').nth(7);
  await expect(eighthHandCard).toBeVisible();

  const card = await playCreature(page);
  await expect(eighthHandCard).toBeHidden();

  await card.click({ button: 'right' });
  const tooltipRow = page.getByText('HandH');
  await tooltipRow.waitFor({ state: 'visible' });
  await tooltipRow.click();

  await expect(eighthHandCard).toBeVisible();
});

test('testInteractiveTooltip', async ({ page }) => {
  // Address every card by id, never by boardCards().nth(): playing a card can
  // add related token *card* nodes (a Goblin/Treasure share the battlefield-card
  // testid) and node order follows Y.Map iteration, so indices are unstable.
  // `playCreature` returns the id-addressed node of the card we actually played;
  // `cloneBoardCard` returns each clone by diffing the card-id set. (This was the
  // flake — ~1 in 6 plays spawned a related token card and shifted every index.)
  const firstBoardCard = await playCreature(page);

  expect(await getElementOrientation(firstBoardCard)).toBe('portrait');

  await openCardMenu(page, firstBoardCard);
  await page.getByText('TapSpace').click();
  expect(await getElementOrientation(firstBoardCard)).toBe('landscape');

  await openCardMenu(page, firstBoardCard);
  await page.getByText('Untap allX').click();
  expect(await getElementOrientation(firstBoardCard)).toBe('portrait');

  await openCardMenu(page, firstBoardCard);
  await page.getByText('FlipF').click();
  const cardImgSrc = await firstBoardCard.locator('img').getAttribute('src');
  expect(cardImgSrc === '/assets/card-back.png')

  // copy first card to make second card; copy second card to make third card
  const secondBoardCard = await cloneBoardCard(page, firstBoardCard);
  const thirdBoardCard = await cloneBoardCard(page, secondBoardCard);
  await expect(thirdBoardCard).toBeVisible();

  // delete third card
  await openCardMenu(page, thirdBoardCard);
  await page.getByText('DeleteBack').click();
  await expect(thirdBoardCard).toBeHidden();

  // move second card to hand
  await openCardMenu(page, secondBoardCard);
  await page.getByText('HandH').click();
  await expect(secondBoardCard).toBeHidden();

  // 'addCounter' spawns a "+1/+1" keyword token at the card's position (see
  // executeBattlefieldCardAction) rather than an in-card counter overlay.
  // Done last: the spawned token sits on top of the card and would intercept
  // pointer events for any further right-clicks on it.
  const tokensBefore = await boardTokens(page).count();
  await openCardMenu(page, firstBoardCard);
  await page.getByText('+1 counterU').click();
  await expect(boardTokens(page)).toHaveCount(tokensBefore + 1);
  const counterToken = boardTokens(page).last();
  await expect(counterToken).toHaveText('1');
  await counterToken.click();
  await expect(counterToken).toHaveText('2');
});

test('testRemoveCounterContextMenuItem', async ({ page }) => {
  const card = await playCreature(page);
  const tokensBefore = await boardTokens(page).count();
  await card.click({ button: 'right' });
  await page.getByText('-1 counterI').click();
  await expect(boardTokens(page)).toHaveCount(tokensBefore + 1);
  const counterToken = boardTokens(page).last();
  await expect(counterToken).toHaveText('-1');
});
