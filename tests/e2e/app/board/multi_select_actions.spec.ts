import { expect, test } from '../../fixtures';
import {
  boxSelectNodes,
  centerOf,
  getElementOrientation,
  mouseDrag,
  openCardMenu,
  parkMouseAwayFromBoard,
  playCreature,
  whiteboard,
} from '../../harness';
import type { Locator, Page } from '@playwright/test';

// A card carries `data-selected=""` on its node while part of the react-flow
// multi-selection (see CardNode). These read the affordance the ring draws from.
const expectSelected = (card: Locator) => expect(card).toHaveAttribute('data-selected', '');
const expectNotSelected = (card: Locator) => expect(card).not.toHaveAttribute('data-selected', '');

/**
 * Play `n` cards and fan them into a horizontal row *above* the board centre so
 * each is individually clickable. Cards drop at the centre stacked on top of one
 * another (and clones cascade only +20px), so without separating them Playwright
 * can't address a specific card — a neighbour intercepts the pointer. The row
 * sits above the drop point so the next play always lands on empty board.
 */
async function playFannedRow(page: Page, n: number): Promise<Locator[]> {
  const cards: Locator[] = [];
  const centres: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const card = await playCreature(page);
    const box = await card.boundingBox();
    if (!box) throw new Error('played card has no bounding box');
    const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const dx = (i - (n - 1) / 2) * box.width * 1.8;
    const to = { x: from.x + dx, y: from.y - box.height * 1.6 };
    await mouseDrag(page, from, to);
    cards.push(card);
    centres.push(await centerOf(card));
  }
  return cards;
}

/** Left-click a card to select it, ⌘/Ctrl+click the rest to add them. */
async function selectCards(page: Page, [first, ...rest]: Locator[]): Promise<void> {
  await parkMouseAwayFromBoard(page);
  await first.click();
  for (const card of rest) await card.click({ modifiers: ['ControlOrMeta'] });
}

test('⌘/Ctrl+click builds a visible multi-selection', async ({ page }) => {
  const [a, b, c] = await playFannedRow(page, 3);
  await selectCards(page, [a, b]);

  await expectSelected(a);
  await expectSelected(b);
  await expectNotSelected(c);
});

test('a context-menu action applies to every selected card', async ({ page }) => {
  const [a, b, c] = await playFannedRow(page, 3);
  await selectCards(page, [a, b]);
  expect(await getElementOrientation(a)).toBe('portrait');
  expect(await getElementOrientation(b)).toBe('portrait');

  // Right-click a member of the group and Tap → the whole group taps.
  await openCardMenu(page, a);
  await page.getByText('TapSpace').click();

  expect(await getElementOrientation(a)).toBe('landscape');
  expect(await getElementOrientation(b)).toBe('landscape');
  // The unselected card is untouched.
  expect(await getElementOrientation(c)).toBe('portrait');
});

test('acting on a card outside the selection affects only that card', async ({ page }) => {
  const [a, b, c] = await playFannedRow(page, 3);
  await selectCards(page, [a, b]);

  // Right-click the UNSELECTED card → Tap acts on it alone (membership rule).
  await openCardMenu(page, c);
  await page.getByText('TapSpace').click();

  expect(await getElementOrientation(c)).toBe('landscape');
  expect(await getElementOrientation(a)).toBe('portrait');
  expect(await getElementOrientation(b)).toBe('portrait');
});

test('a group stays selected after being dragged', async ({ page }) => {
  const [a, b] = await playFannedRow(page, 2);
  await selectCards(page, [a, b]);

  // Grab one member and drag: react-flow moves the whole selection together.
  // Before the fix, the drag-stop Yjs commit rebuilt the nodes and wiped the
  // selection — this asserts it survives.
  const from = await centerOf(a);
  await mouseDrag(page, from, { x: from.x + 60, y: from.y + 120 });

  await expectSelected(a);
  await expectSelected(b);
});

test('Shift box-select groups the cards it encloses', async ({ page }) => {
  const [a, b] = await playFannedRow(page, 2);
  await boxSelectNodes(page, [a, b]);

  await expectSelected(a);
  await expectSelected(b);
});

test('a menu action fans out over a box-selected group without dismissing the box', async ({ page }) => {
  const [a, b, c] = await playFannedRow(page, 3);
  await boxSelectNodes(page, [a, b]);
  await expectSelected(a);
  await expectSelected(b);

  // react-flow's box-select leaves a selection overlay covering the group. If it
  // weren't click-through, this right-click would land on the overlay (not the
  // card) and nothing would tap. Acting straight after box-select — no click to
  // dismiss the box first — is the whole point of the assertion.
  await openCardMenu(page, a);
  await page.getByText('TapSpace').click();

  expect(await getElementOrientation(a)).toBe('landscape');
  expect(await getElementOrientation(b)).toBe('landscape');
  expect(await getElementOrientation(c)).toBe('portrait');
});

test('a Space hotkey taps every card in a box-selected group', async ({ page }) => {
  const [a, b, c] = await playFannedRow(page, 3);
  await boxSelectNodes(page, [a, b]);
  await expectSelected(a);
  await expectSelected(b);

  // Tap via the Space hotkey (not the menu). Keyboard actions route through the
  // hovered card, so this checks that a box-selected card is hoverable through
  // the selection overlay — the right-click menu path never needed hover.
  await a.hover();
  await page.keyboard.press('Space');

  expect(await getElementOrientation(a)).toBe('landscape');
  expect(await getElementOrientation(b)).toBe('landscape');
  expect(await getElementOrientation(c)).toBe('portrait');
});

test('a Space hotkey taps the whole selection with nothing hovered', async ({ page }) => {
  const [a, b, c] = await playFannedRow(page, 3);
  await selectCards(page, [a, b]);

  // Park the cursor off every card so no hoverTarget is set, then tap. A selected
  // group must accept the action whether or not the cursor is over a member —
  // before, the battlefield hotkeys were disabled with nothing hovered.
  await parkMouseAwayFromBoard(page);
  await page.keyboard.press('Space');

  expect(await getElementOrientation(a)).toBe('landscape');
  expect(await getElementOrientation(b)).toBe('landscape');
  expect(await getElementOrientation(c)).toBe('portrait');
});

test('a move hotkey fans over the selection with nothing hovered', async ({ page }) => {
  const [a, b, c] = await playFannedRow(page, 3);
  await selectCards(page, [a, b]);

  // Discard (D) with nothing hovered removes every selected card from the board;
  // the unselected card stays put.
  await parkMouseAwayFromBoard(page);
  await page.keyboard.press('d');

  await expect(a).toHaveCount(0);
  await expect(b).toHaveCount(0);
  await expect(c).toHaveCount(1);
});

test('clicking empty board clears the selection', async ({ page }) => {
  const [a, b] = await playFannedRow(page, 2);
  await selectCards(page, [a, b]);

  // A left-click on empty pane (the drop point below the row is clear)
  // deselects everything (react-flow default).
  const board = await whiteboard(page).boundingBox();
  if (!board) throw new Error('#whiteboard not found');
  await page.mouse.click(board.x + board.width / 2, board.y + board.height / 2);

  await expectNotSelected(a);
  await expectNotSelected(b);
});
