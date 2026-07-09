/**
 * E2e for the draggable HUD windows (FloatingPanel / useDraggablePanel):
 * the game actions toolbar and the action log. Verifies real-browser drag,
 * position persistence across reload (via the settings store), that the
 * action log's collapse chevron still works without starting a drag, and
 * that neither panel can be dragged under the top menu bar.
 */
import { test, expect } from '../fixtures';
import type { Locator } from '@playwright/test';
import { mouseDrag, toolbar } from '../harness';

const TOOLBAR = '[data-floating-panel="game-actions-toolbar"]';
const LOG = '[data-floating-panel="action-log"]';

async function centerOf(locator: Locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error('element has no box');
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

test('the toolbar drags to a new position and persists across reload', async ({ page }) => {
  const panel = page.locator(TOOLBAR);
  const before = await panel.boundingBox();
  if (!before) throw new Error('toolbar not found');

  // The panel moves by the pointer delta, so offset the target from where we
  // grab (the handle centre), not from the panel's box origin.
  const from = await centerOf(page.locator(`${TOOLBAR} [title="Drag to move"]`));
  await mouseDrag(page, from, { x: from.x + 200, y: from.y + 220 });

  const after = await panel.boundingBox();
  expect(Math.round(after!.x - before.x)).toBeGreaterThan(150);
  expect(Math.round(after!.y - before.y)).toBeGreaterThan(150);

  // Persisted (settings store) — survives a reload.
  await page.reload();
  const reloaded = await page.locator(TOOLBAR).boundingBox();
  expect(Math.abs(reloaded!.x - after!.x)).toBeLessThan(3);
});

test('the action log drags by its header, and the chevron still collapses it', async ({ page }) => {
  const panel = page.locator(LOG);
  const before = await panel.boundingBox();
  if (!before) throw new Error('action log not found');

  // The header (first child) doubles as the drag handle.
  const from = await centerOf(panel.locator('> div').first());
  await mouseDrag(page, from, { x: from.x + 220, y: from.y + 140 });
  const after = await panel.boundingBox();
  expect(Math.round(after!.x - before.x)).toBeGreaterThan(150);

  // The collapse chevron toggles without moving the panel.
  const posBefore = await panel.boundingBox();
  await page.getByRole('button', { name: 'Collapse action log' }).click();
  await expect(page.getByRole('button', { name: 'Expand action log' })).toBeVisible();
  const posAfter = await panel.boundingBox();
  expect(Math.abs(posAfter!.x - posBefore!.x)).toBeLessThan(2);
});

test('the toolbar cannot be dragged under the top menu bar', async ({ page }) => {
  const bar = await toolbar(page).boundingBox();
  if (!bar) throw new Error('top menu bar not found');
  const panel = page.locator(TOOLBAR);
  const before = await panel.boundingBox();
  if (!before) throw new Error('toolbar panel not found');

  // Aim well above the bar's bottom edge, with a sideways nudge too, so a
  // passing y-assertion can't just mean the whole drag froze.
  const from = await centerOf(page.locator(`${TOOLBAR} [title="Drag to move"]`));
  await mouseDrag(page, from, { x: from.x + 100, y: 5 });

  const after = await panel.boundingBox();
  expect(Math.round(after!.x - before.x)).toBeGreaterThan(50);
  expect(after!.y).toBeGreaterThanOrEqual(Math.round(bar.y + bar.height) - 2);
});

test('the action log cannot be dragged under the top menu bar', async ({ page }) => {
  const bar = await toolbar(page).boundingBox();
  if (!bar) throw new Error('top menu bar not found');
  const panel = page.locator(LOG);
  const before = await panel.boundingBox();
  if (!before) throw new Error('action log not found');

  const from = await centerOf(panel.locator('> div').first());
  await mouseDrag(page, from, { x: from.x + 100, y: 5 });

  const after = await panel.boundingBox();
  expect(Math.round(after!.x - before.x)).toBeGreaterThan(50);
  expect(after!.y).toBeGreaterThanOrEqual(Math.round(bar.y + bar.height) - 2);
});
