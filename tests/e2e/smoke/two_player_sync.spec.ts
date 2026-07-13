import { test, expect } from '../fixtures';
import { boardCard, connectSecondPlayer, playCreature } from '../harness';

test('a card played by one player appears on the other player\'s board over real WebRTC', { tag: ['@smoke', '@canary'] }, async ({ page }) => {
  const bob = await connectSecondPlayer(page);
  try {
    const card = await playCreature(page);
    const cardId = await card.getAttribute('data-card-id');
    expect(cardId).toBeTruthy();
    await expect(boardCard(bob, cardId!)).toBeVisible({ timeout: 10000 });
  } finally {
    await bob.context().close();
  }
});
