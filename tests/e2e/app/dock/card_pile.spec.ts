import { expect, test } from '../../fixtures';
import {
  dragBoardCardToHand,
  dragBoardCardToPile,
  expectHandCount,
  expectPileCount,
  handCards,
  playCreature,
} from '../../harness';

test('testDragBattlefieldCardToDeck', async ({ page }) => {
  const card = await playCreature(page);
  await expectPileCount(page, 'deck', 92);
  await dragBoardCardToPile(page, card, 'deck');
  await expectPileCount(page, 'deck', 93);
});

test('testDragBattlefieldCardToExile', async ({ page }) => {
  const card = await playCreature(page);
  await expectPileCount(page, 'exile', 0);
  await dragBoardCardToPile(page, card, 'exile');
  await expectPileCount(page, 'exile', 1);
});

test('testDragBattlefieldCardToDiscard', async ({ page }) => {
  const card = await playCreature(page);
  await expectPileCount(page, 'discard', 0);
  await dragBoardCardToPile(page, card, 'discard');
  await expectPileCount(page, 'discard', 1);
});

test('testDragBattlefieldCardToHand', async ({ page }) => {
  await expectHandCount(page, 8);
  const card = await playCreature(page);
  await expectHandCount(page, 7);

  await dragBoardCardToHand(page, card);
  await expect(handCards(page)).toHaveCount(8);
});
