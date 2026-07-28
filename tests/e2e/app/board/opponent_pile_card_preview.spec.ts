import { expect, test } from '../../fixtures';
import {
  cardPreview,
  centerOf,
  connectSecondPlayer,
  mouseDrag,
  pileCount,
  pileTile,
  pileViewer,
  pileViewerCards,
  playCreature,
  revealOnBoard,
  waitForPileViewerReady,
} from '../../harness';

/**
 * The card preview must pop up on hover in EVERY pile viewer, not just the local
 * deck. It auto-dismisses by watching a Yjs map for the hovered card's presence;
 * the bug was that every viewer watched the *local* player's map, so an opponent
 * viewer — whose cards live in the opponent's map — found nothing and hid the
 * preview the instant it appeared. Only two real browsers exercise that path:
 * with one player every pile is your own, so the wrong-map branch never runs.
 */
test.describe('opponent pile viewer card preview', () => {
  test("hovering a card in an opponent's discard viewer shows the preview", async ({ page }) => {
    const bob = await connectSecondPlayer(page);
    try {
      // Bob's stable player id (also his pile nodes' `data-pile-owner`). With two
      // seats every page shows two of each pile, so every lookup must be owner-scoped.
      const bobId = await bob.evaluate(() => localStorage.getItem('aura:playerId'));
      expect(bobId, "bob's player id").toBeTruthy();

      // Bob drops a creature into his OWN discard pile (scoped drag, not the
      // unscoped harness helper which is ambiguous with two seats on the board).
      const bobCard = await playCreature(bob);
      await mouseDrag(bob, await centerOf(bobCard), await centerOf(pileTile(bob, 'discard', bobId!)));
      await expect(pileCount(bob, 'discard', bobId!)).toHaveAttribute('data-pile-count', '1');

      // Alice opens Bob's discard from the shared board and hovers the card.
      const bobDiscard = pileTile(page, 'discard', bobId!);
      await expect(bobDiscard, "alice should see bob's discard pile once it syncs").toBeVisible({
        timeout: 15000,
      });
      await revealOnBoard(page, bobDiscard, "bob's discard pile");
      await bobDiscard.click();

      await expect(pileViewer(page, 'discard')).toBeVisible();
      await waitForPileViewerReady(page);

      // The preview is portaled to <body> above the modal; hovering the card must
      // make it appear and — crucially — keep it up, not flash and vanish.
      await pileViewerCards(page).first().hover();
      await expect(cardPreview(page)).toBeVisible();
    } finally {
      await bob.context().close();
    }
  });
});
