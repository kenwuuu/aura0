import { test, expect } from '../fixtures';
import { expectHandCount, expectPileCount, drawCard, playCreature } from '../harness';

test('drawing a card and playing it to the battlefield', { tag: '@smoke' }, async ({ page }) => {
  await drawCard(page);
  await expectHandCount(page, 9);
  await expectPileCount(page, 'deck', 91);

  const card = await playCreature(page);
  await expect(card).toBeVisible();
});
