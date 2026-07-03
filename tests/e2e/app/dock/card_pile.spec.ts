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

// Piles are react-flow nodes now (PileNode), not drop targets for each other —
// pile-to-pile drag was a pre-redesign #local-dock interaction and has no
// equivalent today.
test.skip('testDragExileToDiscard', async ({ page }) => {});
test.skip('testDragDiscardToExile', async ({ page }) => {});
test.skip('testDragDeckToExile', async ({ page }) => {});
test.skip('testDragDeckToDiscard', async ({ page }) => {});
test.skip('testDragExileToDeck', async ({ page }) => {});
test.skip('testDragDiscardToDeck', async ({ page }) => {});
