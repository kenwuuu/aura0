import { expect, test } from '../../fixtures';
import {boardCards, boardTokens, expectPileCount, getElementOrientation, playCreature} from '../../harness';

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
  await playCreature(page);

  const firstBoardCard = boardCards(page).nth(0);
  const secondBoardCard = boardCards(page).nth(1);
  const thirdBoardCard = boardCards(page).nth(2);

  expect(await getElementOrientation(firstBoardCard)).toBe('portrait');

  await firstBoardCard.click({ button: 'right' });
  await page.getByText('TapSpace').click();
  expect(await getElementOrientation(firstBoardCard)).toBe('landscape');

  await firstBoardCard.click({ button: 'right' });
  await page.getByText('Untap allX').click();
  expect(await getElementOrientation(firstBoardCard)).toBe('portrait');

  await firstBoardCard.click({ button: 'right' });
  await page.getByText('FlipF').click();
  const cardImgSrc = await firstBoardCard.locator('img').getAttribute('src');
  expect(cardImgSrc === '/assets/card-back.png')

  // copy first card to make second card.
  // copy second card to make third card
  await firstBoardCard.click({ button: 'right' });
  await page.getByText('Copy/cloneK').click();
  await secondBoardCard.waitFor({ state: 'visible' });
  await secondBoardCard.click({ button: 'right' });
  await page.getByText('Copy/cloneK').click();
  await thirdBoardCard.waitFor({ state: 'visible' });
  await expect(thirdBoardCard).toBeVisible();

  // delete third card
  await thirdBoardCard.click({ button: 'right' });
  await page.getByText('DeleteBack').click();
  await expect(thirdBoardCard).toBeHidden();

  // move second card to hand
  await secondBoardCard.click({ button: 'right' });
  await page.getByText('HandH').click();
  await expect(secondBoardCard).toBeHidden();

  // 'addCounter' spawns a "+1/+1" keyword token at the card's position (see
  // executeBattlefieldCardAction) rather than an in-card counter overlay.
  // Done last: the spawned token sits on top of the card and would intercept
  // pointer events for any further right-clicks on it.
  const tokensBefore = await boardTokens(page).count();
  await firstBoardCard.click({ button: 'right' });
  await page.getByText('CounterU').click();
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
  await page.getByText('-1/-1 counterI').click();
  await expect(boardTokens(page)).toHaveCount(tokensBefore + 1);
  const counterToken = boardTokens(page).last();
  await expect(counterToken).toHaveText('-1');
});
