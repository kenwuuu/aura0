/**
 * The board must not go dark when someone writes to it.
 *
 * Players reported their whole board — cards, tokens, counters — vanishing while
 * the playmats, health widgets and pile tiles underneath stayed put, and being
 * able to get it back only by asking *another* player to pick a card up and put
 * it down. Both halves of that fall out of one cause: `buildNodes` rebuilds
 * every node object from Yjs on each board write, React Flow only carries a
 * node's measured size across objects that are reference-identical, and a node
 * it thinks is unmeasured renders `visibility: hidden` — invisible *and* not
 * hit-testable, so the player it happened to can't touch their own cards to
 * trigger the rebuild that would bring them back. The synthetic nodes carried an
 * explicit size already, which is why they never flickered.
 *
 * A hidden flash is invisible to `toBeVisible()`, which polls and so waits it
 * out; these assert through `recordBoardNodeVisibility` instead.
 */
import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures';
import {
  playCreature,
  recordBoardNodeVisibility,
  expectNoBoardNodeWentHidden,
  boardCardNode,
  boardTokens,
  centerOf,
  mouseDrag,
  realMouseMoveTo,
  transformPosition,
  whiteboard,
  pressHotkey,
} from '../../harness';

/**
 * Points to drop counter tokens on, well clear of the cards.
 *
 * `u` spawns at the cursor, and `playCreature` leaves both the cursor and the
 * card it just played in the middle of the board — so spawning from there
 * buries the card under its own counters, and a card these specs need to reach
 * then fails on a token intercepting the pointer, for reasons that have nothing
 * to do with what's under test. Off to the right, clear of the mat furniture in
 * the top-left.
 */
async function tokenSpot(page: Page, index: number) {
  const board = await whiteboard(page).boundingBox();
  if (!board) throw new Error('#whiteboard not found.');
  return {
    x: board.x + board.width * 0.72 + (index % 3) * 90,
    y: board.y + board.height * 0.3 + Math.floor(index / 3) * 90,
  };
}

test('a keyword-token write leaves everything already on the board visible', async ({ page }) => {
  await playCreature(page);
  for (const i of [0, 1]) {
    await realMouseMoveTo(page, await tokenSpot(page, i));
    await pressHotkey(page, 'addCounter');
    await expect(boardTokens(page)).toHaveCount(i + 1);
  }

  await recordBoardNodeVisibility(page);

  // One `yTokens.set`. It should disturb nothing already on the board — before
  // the fix it took every node down with it, cards included: the rebuild is per
  // *board*, not per map, so a token write blanks the cards too.
  await realMouseMoveTo(page, await tokenSpot(page, 2));
  await pressHotkey(page, 'addCounter');
  await expect(boardTokens(page)).toHaveCount(3);

  await expectNoBoardNodeWentHidden(page);
});

test('a card write leaves everything already on the board visible', async ({ page }) => {
  const card = await playCreature(page);
  const cardId = (await card.getAttribute('data-card-id'))!;
  await realMouseMoveTo(page, await tokenSpot(page, 0));
  await pressHotkey(page, 'addCounter');
  await expect(boardTokens(page)).toHaveCount(1);

  await recordBoardNodeVisibility(page);

  // Dragging a card commits `yCards.set` on drag-stop — the same write a peer
  // makes when they pick a card up and put it down, which is how the players who
  // reported this got their board back.
  const node = boardCardNode(page, cardId);
  const before = await transformPosition(node);
  const from = await centerOf(card);
  await mouseDrag(page, from, { x: from.x + 160, y: from.y + 40 });
  await expect.poll(() => transformPosition(node)).not.toEqual(before);

  await expectNoBoardNodeWentHidden(page);
});

test('a card stays clickable through a burst of board writes', async ({ page }) => {
  // One card only: a clone cascades just +20px, so it would sit over the
  // original and intercept the trial click below on its own merits.
  const card = await playCreature(page);

  await recordBoardNodeVisibility(page);

  // A busy table writes to the board over and over. Each write used to re-hide
  // every node, so the odds of a click landing on nothing climb with traffic.
  for (let i = 0; i < 6; i++) {
    await realMouseMoveTo(page, await tokenSpot(page, i));
    await pressHotkey(page, 'addCounter');
    await expect(boardTokens(page)).toHaveCount(i + 1);
  }

  await expectNoBoardNodeWentHidden(page);

  // The symptom that actually reached us: a card you can see but can't act on.
  // `click({ trial: true })` runs Playwright's full actionability check —
  // including hit-testing, which `visibility: hidden` fails.
  await card.click({ trial: true, timeout: 3000 });
});
