import {expect, test} from "../../fixtures";
import {Page} from "playwright/test";
import {Locator} from "@playwright/test";

async function dragHandCardToLocator(locator: Locator, page: Page) {
  await page.locator('div').filter({hasText: '#'}).nth(4).dragTo(locator);
  await expect(page.locator('div').filter({hasText: '#'}).nth(3)).toBeVisible();
}

export async function getElementOrientation(
  locator: Locator
): Promise<"portrait" | "landscape" | "square"> {
  const box = await locator.boundingBox();

  if (!box) {
    throw new Error("Element not found or not visible.");
  }

  const { width, height } = box;

  if (width > height) return "landscape";
  if (height > width) return "portrait";
  return "square";
}

test('testExileTooltip', async ({ page }) => {
  expect(page.getByText('Exile0'));

  await dragHandCardToLocator(page.locator('#whiteboard'), page);
  const boardCard = page.locator('div').filter({ hasText: '#' }).nth(3);
  await boardCard.click();
  const tooltipRow = page.getByText('SExile');
  await tooltipRow.waitFor({ state: 'visible' });
  await tooltipRow.click();
  await expect(page.getByText('Exile1')).toBeVisible();
});

test('testDiscardTooltip', async ({ page }) => {
  expect(page.getByText('Discard0'));

  await dragHandCardToLocator(page.locator('#whiteboard'), page);
  const boardCard = page.locator('div').filter({ hasText: '#' }).nth(3);
  await boardCard.click();
  const tooltipRow = page.getByText('DDiscard');
  await tooltipRow.waitFor({ state: 'visible' });
  await tooltipRow.click();
  await expect(page.getByText('Discard1')).toBeVisible();
});

test('testDeckTooltip', async ({ page }) => {
  expect(page.getByText('Deck92'));

  await dragHandCardToLocator(page.locator('#whiteboard'), page);
  const boardCard = page.locator('div').filter({ hasText: '#' }).nth(3);
  await boardCard.click();
  const tooltipRow = page.getByText('TTo deck top');
  await tooltipRow.waitFor({ state: 'visible' });
  await tooltipRow.click();

  await expect(page.getByText('Deck93')).toBeVisible();
});

test('testHandTooltip', async ({ page }) => {
  const eighthHandCard = page.locator('.hand-cards .hand-card').nth(7);
  await expect(eighthHandCard).toBeVisible();

  await dragHandCardToLocator(page.locator('#whiteboard'), page);
  await expect(eighthHandCard).toBeHidden();

  const boardCard = page.locator('div').filter({ hasText: '#' }).nth(3);
  await boardCard.click();
  const tooltipRow = page.getByText('HHand');
  await tooltipRow.waitFor({ state: 'visible' });
  await tooltipRow.click();

  await expect(eighthHandCard).toBeVisible();
});

test('testInteractiveTooltip', async ({ page }) => {
  const firstBoardCard = page.locator('.player-board .card').nth(0);
  const secondBoardCard = page.locator('.player-board .card').nth(1);
  const thirdBoardCard = page.locator('.player-board .card').nth(2);
  
  await dragHandCardToLocator(page.locator('#whiteboard'), page);
  
  expect(await getElementOrientation(firstBoardCard)).toBe('portrait');

  await firstBoardCard.click();
  await page.getByText('Tap/Untap').click();
  expect(await getElementOrientation(firstBoardCard)).toBe('landscape');

  await firstBoardCard.click();
  await page.getByText('XUntap all').click();
  expect(await getElementOrientation(firstBoardCard)).toBe('portrait');

  await firstBoardCard.click();
  await page.getByText('FFlip').click();
  const cardImgSrc = await firstBoardCard.locator('img').getAttribute('src');
  expect(cardImgSrc === '/assets/card-back.png')

  await firstBoardCard.click();
  await page.getByText('U+1 counter').click();
  await page.getByTitle('Decrease counter').waitFor({ state: 'visible' });
  await page.getByTitle('Decrease counter').click();

  await firstBoardCard.click();
  await page.getByText('I-1 counter').click();
  await page.getByTitle('Increase counter').waitFor({ state: 'visible' });
  await page.getByTitle('Increase counter').click();

  // copy first card to make second card.
  // copy second card to make third card
  await firstBoardCard.click();
  await page.getByText('KCopy/clone').click();
  await secondBoardCard.waitFor({ state: 'visible' });
  await secondBoardCard.click();
  await page.getByText('KCopy/clone').click();
  await thirdBoardCard.waitFor({ state: 'visible' });
  await expect(thirdBoardCard).toBeVisible();

  // delete third card
  await thirdBoardCard.click();
  await page.getByText('BackDelete').click();
  await expect(thirdBoardCard).toBeHidden();

  // move second card to hand
  await secondBoardCard.click();
  await page.getByText('HHand').click();
  await expect(secondBoardCard).toBeHidden();
});

// this test always passes regardless if we expect Visible or Hidden
// we want to get this working eventually
test.skip('testTooltipDoesNotAppearAfterDrag', async ({ page }) => {
  expect(page.getByText('Deck92'));

  const tooltipText = page.getByText('SpaceTap/Untap');

  // Drag card to board. Click card and check for tooltip text
  await dragHandCardToLocator(page.locator('#whiteboard'), page);
  const boardCard: Locator = page.locator('div').filter({ hasText: '#' }).nth(3);

  const box = await boardCard.boundingBox();

  // Drag card
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + 100, box!.y + 100); // drag to new position
  await page.mouse.move(box!.x - 100, box!.y - 100); // drag to new position
  await expect(tooltipText).toBeHidden();
  await page.mouse.up();

  // Confirm that tooltip text doesn't show up. Wait for visible because if
  // we don't, Playwright expect resolves faster than the tooltip can render
  await page.waitForTimeout(200);
  await expect(tooltipText).toBeVisible();
});
