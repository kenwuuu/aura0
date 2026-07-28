/**
 * E2e coverage for the board Timer/Stopwatch node and its three creation
 * surfaces: the toolbar's Create ▾ menu, the ⌘K command palette, and the
 * empty-board context menu. Also drives the node's own controls (Start/Pause,
 * Reset, mode switch, Remove) end to end — the local tick and Yjs round-trip
 * that the isolated unit render can't reach.
 */
import { expect, test } from '../../fixtures';
import { Page } from '@playwright/test';
import { commandPalette, mouseDrag, whiteboard } from '../../harness';

function toolbar(page: Page) {
  return page.getByTestId('game-actions-toolbar');
}

function timerNode(page: Page) {
  return page.getByTestId('timer-node');
}

/** An empty upper-left board point (mats/piles sit low-center on a fresh room). */
async function emptyBoardPoint(page: Page) {
  const box = await whiteboard(page).boundingBox();
  if (!box) throw new Error('Whiteboard has no bounding box.');
  return { x: box.x + box.width * 0.15, y: box.y + box.height * 0.15 };
}

test('Create ▾ > Timer adds a 5:00 timer, and Start counts it down', async ({ page }) => {
  await toolbar(page).getByText('Create').click();
  await page.getByRole('menuitem', { name: 'Timer', exact: true }).click();

  await expect(timerNode(page)).toBeVisible();
  await expect(page.getByTestId('timer-display')).toHaveText('05:00');

  await timerNode(page).getByRole('button', { name: 'Start' }).click();
  await expect(timerNode(page).getByText('COUNTING DOWN')).toBeVisible();
  // The derived clock actually advances (ceil rounding holds 05:00 for <1s).
  await expect(page.getByTestId('timer-display')).not.toHaveText('05:00', { timeout: 3000 });

  // Reset stops it and returns to the configured length.
  await timerNode(page).getByRole('button', { name: 'Reset' }).click();
  await expect(page.getByTestId('timer-display')).toHaveText('05:00');
  await expect(timerNode(page).getByRole('button', { name: 'Start' })).toBeVisible();
});

test('the ⌘K palette can add a timer', async ({ page }) => {
  await page.keyboard.press('ControlOrMeta+k');
  await expect(commandPalette(page)).toBeVisible();

  await page.getByPlaceholder(/search actions and shortcuts/i).fill('timer');
  await page.getByRole('option', { name: /add a timer/i }).click();

  await expect(commandPalette(page)).not.toBeVisible();
  await expect(timerNode(page)).toBeVisible();
});

test('the empty-board context menu can add a timer', async ({ page }) => {
  const { x, y } = await emptyBoardPoint(page);
  await page.mouse.click(x, y, { button: 'right' });

  await page.getByRole('menuitem', { name: /^Add timer\b/ }).click();

  await expect(timerNode(page)).toBeVisible();
});

test('switching to Stopwatch counts up from 00:00', async ({ page }) => {
  await toolbar(page).getByText('Create').click();
  await page.getByRole('menuitem', { name: 'Timer', exact: true }).click();
  await expect(timerNode(page)).toBeVisible();

  await timerNode(page).getByRole('button', { name: 'Stopwatch' }).click();
  await expect(page.getByTestId('timer-display')).toHaveText('00:00');
  // The ±30s controls are countdown-only.
  await expect(timerNode(page).getByRole('button', { name: 'Add 30 seconds' })).toHaveCount(0);

  await timerNode(page).getByRole('button', { name: 'Start' }).click();
  await expect(timerNode(page).getByText('COUNTING UP')).toBeVisible();
});

test('the timer can be dragged to a new spot (node zoom does not break react-flow drag)', async ({ page }) => {
  await toolbar(page).getByText('Create').click();
  await page.getByRole('menuitem', { name: 'Timer', exact: true }).click();
  await expect(timerNode(page)).toBeVisible();

  const before = await timerNode(page).boundingBox();
  if (!before) throw new Error('timer has no bounding box');
  // Grab the header (a non-button drag surface: grip + label, left of the pip/×).
  const from = { x: before.x + before.width * 0.45, y: before.y + before.height * 0.1 };
  await mouseDrag(page, from, { x: from.x + 140, y: from.y + 90 });

  const after = await timerNode(page).boundingBox();
  if (!after) throw new Error('timer has no bounding box after drag');
  // The node's screen position tracks the mouse delta (~140, ~90) regardless of
  // the node's internal zoom — a broken drag would either not move or drift.
  expect(after.x - before.x).toBeGreaterThan(90);
  expect(after.x - before.x).toBeLessThan(200);
  expect(after.y - before.y).toBeGreaterThan(50);
  expect(after.y - before.y).toBeLessThan(150);
});

test('Remove deletes the timer from the board', async ({ page }) => {
  await toolbar(page).getByText('Create').click();
  await page.getByRole('menuitem', { name: 'Timer', exact: true }).click();
  await expect(timerNode(page)).toBeVisible();

  await timerNode(page).getByRole('button', { name: 'Remove timer' }).click();
  await expect(timerNode(page)).toHaveCount(0);
});
