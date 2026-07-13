import { test, expect } from '../../fixtures';
import {
  boardCardNode,
  centerOf,
  connectSecondPlayer,
  dragBoardCardWatchedBy,
  expectCardPositionsAgree,
  peerCursors,
  playCreature,
  transformPosition,
} from '../../harness';

/**
 * Live cursors and live card drags are streamed over Yjs awareness and painted
 * with an ease (see `peerMotion.ts`) rather than applied as raw jumps. Both are
 * invisible to unit tests — the whole mechanism is "one browser sees what
 * another browser is doing right now" — so they are guarded here.
 */
test.describe('live peer motion', () => {
  test("a peer's cursor tracks their real movement", async ({ page }) => {
    const bob = await connectSecondPlayer(page);
    try {
      const cursor = peerCursors(bob).first();
      await page.mouse.move(700, 500);
      await expect(cursor, "bob should see alice's cursor").toBeVisible({ timeout: 10000 });

      const seen = new Set<string>();
      for (let i = 0; i < 10; i++) {
        await page.mouse.move(600 + i * 30, 400 + i * 12);
        await bob.waitForTimeout(60);
        const at = await transformPosition(cursor);
        if (at) seen.add(`${Math.round(at.x)},${Math.round(at.y)}`);
      }

      // Ten moves along a straight line; a frozen or un-painted cursor would
      // report the same spot every time.
      expect(seen.size, 'cursor should move, not sit still').toBeGreaterThan(5);
    } finally {
      await bob.context().close();
    }
  });

  test('a peer sees a card move during the drag, and lands where it was dropped', async ({ page }) => {
    const bob = await connectSecondPlayer(page);
    try {
      const card = await playCreature(page);
      const cardId = (await card.getAttribute('data-card-id'))!;
      await expect(boardCardNode(bob, cardId)).toBeVisible({ timeout: 10000 });

      const from = await centerOf(card);
      const observed = await dragBoardCardWatchedBy(
        page,
        card,
        { x: from.x + 260, y: from.y - 140 },
        bob,
        cardId,
      );

      // Positions are committed to Yjs only on drag-stop. If the awareness
      // stream broke, bob would see nothing until the drop and every sample
      // here would be identical.
      const distinct = new Set(
        observed.filter(Boolean).map((p) => `${Math.round(p!.x)},${Math.round(p!.y)}`),
      );
      expect(distinct.size, 'bob should see the card move mid-drag, not just at the drop').toBeGreaterThan(5);

      await expectCardPositionsAgree(page, bob, cardId);
    } finally {
      await bob.context().close();
    }
  });
});
