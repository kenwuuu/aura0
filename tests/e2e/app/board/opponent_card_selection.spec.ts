import { expect, test } from '../../fixtures';
import {
  boardCard,
  boardCardNode,
  boxSelectNodes,
  centerOf,
  connectSecondPlayer,
  expectCardPositionsAgree,
  getElementOrientation,
  mouseDrag,
  parkMouseAwayFromBoard,
  playCreature,
  revealOnBoard,
  transformPosition,
} from '../../harness';
import type { Locator, Page } from '@playwright/test';

/**
 * The board is one shared table: anyone may move, tap, or select anyone's cards.
 * `draggable` was opened up for opponents' cards long before `selectable` was, so
 * a Shift box-drag used to skip every opponent card inside its own rectangle —
 * and with it every group action, which routes through the selection. Two
 * browsers is the only way to see that: with one player every card is your own,
 * so the owner-only branch never runs.
 */

const expectSelected = (card: Locator) => expect(card).toHaveAttribute('data-selected', '');

/**
 * Alice and Bob each play a creature, and Alice zooms out until Bob's is on
 * screen. Seats are stacked vertically (bottom row / top row of one column, see
 * boardWorld.ts) and each player's camera auto-fits to their *own* mat, so
 * Bob's card starts at a negative `y` for Alice — off screen, where a click
 * silently hits nothing. Returns both cards as Alice sees them.
 */
async function twoPlayerBoard(page: Page, bob: Page): Promise<{ mine: Locator; theirs: Locator }> {
  const mine = await playCreature(page);
  const theirCardId = (await (await playCreature(bob)).getAttribute('data-card-id'))!;

  const theirs = boardCard(page, theirCardId);
  await expect(theirs, "alice should see bob's card").toBeVisible({ timeout: 10000 });
  // Margin, not just "on screen": the box-select rectangle has to *start* on
  // empty pane 30px up-and-left of the topmost card, and at the first zoom level
  // that puts Bob's card on screen at all it sits flush against the top edge —
  // so that corner lands on the toolbar and react-flow never sees the gesture.
  await revealOnBoard(page, theirs, "bob's card", { margin: 140 });
  return { mine, theirs };
}

test.describe('opponent cards on the shared board', () => {
  test('a Shift box-select takes in an opponent card, and the group action taps it', async ({ page }) => {
    const bob = await connectSecondPlayer(page);
    try {
      const { mine, theirs } = await twoPlayerBoard(page, bob);
      expect(await getElementOrientation(theirs)).toBe('portrait');

      await boxSelectNodes(page, [mine, theirs]);
      await expectSelected(mine);
      await expectSelected(theirs);

      // Tap the whole group with nothing hovered. The opponent's card has to
      // rotate on *both* screens: on Alice's because the group action fanned out
      // over it, and on Bob's because that is a real Yjs write, not a local
      // affordance.
      await parkMouseAwayFromBoard(page);
      await page.keyboard.press('Space');

      expect(await getElementOrientation(mine)).toBe('landscape');
      expect(await getElementOrientation(theirs)).toBe('landscape');
      const theirCardId = (await theirs.getAttribute('data-card-id'))!;
      await expect
        .poll(() => getElementOrientation(boardCard(bob, theirCardId)), {
          timeout: 10000,
          message: 'bob never saw his own card tapped',
        })
        .toBe('landscape');
    } finally {
      await bob.context().close();
    }
  });

  test('dragging the group carries the opponent card, and its owner sees it land there', async ({ page }) => {
    const bob = await connectSecondPlayer(page);
    try {
      const { mine, theirs } = await twoPlayerBoard(page, bob);
      const theirCardId = (await theirs.getAttribute('data-card-id'))!;
      const before = await transformPosition(boardCardNode(page, theirCardId));

      await boxSelectNodes(page, [mine, theirs]);
      await expectSelected(theirs);

      // Grab Alice's own card: react-flow drags every selected node together, so
      // the opponent's card travels with it.
      const from = await centerOf(mine);
      await mouseDrag(page, from, { x: from.x + 70, y: from.y + 40 });

      const after = await transformPosition(boardCardNode(page, theirCardId));
      expect(before, 'card should have a board-space position before the drag').not.toBeNull();
      expect(after, 'card should have a board-space position after the drag').not.toBeNull();
      expect(
        Math.hypot(after!.x - before!.x, after!.y - before!.y),
        "the opponent's card should have moved with the group",
      ).toBeGreaterThan(20);

      await expectCardPositionsAgree(page, bob, theirCardId);
    } finally {
      await bob.context().close();
    }
  });
});
