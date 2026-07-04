import { test } from '../fixtures';
import { playCreature, moveBetweenZones } from '../harness';

test('moving a battlefield card into a resource pile', { tag: '@smoke' }, async ({ page }) => {
  const card = await playCreature(page);
  await moveBetweenZones(page, card, 'exile');
});
