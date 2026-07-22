import { test, expect } from '../../fixtures';
import { whiteboard, boardTokens } from '../../harness';

/**
 * Regression: dragging a token from the empty-board context menu's grid onto the
 * board must create a token.
 *
 * The menu (`GameContextMenu`) preventDefaults mousedown on its content to keep
 * focus on the right-clicked item. The grid lives in a popover that is portaled
 * to <body> but is a React *descendant* of that menu, so React's synthetic-event
 * bubbling carried the grid token's mousedown up to the menu's handler — and
 * preventDefaulting mousedown stops the browser from starting a native HTML5
 * drag. The popover now stops mousedown propagation so the drag can begin.
 *
 * Must use a real mouse press+move: Playwright's `.dragTo()` dispatches
 * `dragstart` directly and never issues the mousedown that was being blocked, so
 * it can't see this bug.
 */
async function emptyBoardPoint(page: Parameters<typeof whiteboard>[0]) {
  const box = await whiteboard(page).boundingBox();
  if (!box) throw new Error('Whiteboard has no bounding box (not rendered/visible).');
  return { x: box.x + box.width * 0.15, y: box.y + box.height * 0.15 };
}

test('dragging a token from the board menu grid creates a token', async ({ page }) => {
  await expect(boardTokens(page)).toHaveCount(0);

  const { x, y } = await emptyBoardPoint(page);
  await page.mouse.click(x, y, { button: 'right' });

  // The token grid is the last item on the empty-board menu (label-agnostic so
  // this survives menu-label copy changes).
  const menu = page.locator('[data-game-context-menu]');
  await menu.waitFor();
  await menu.getByRole('menuitem').last().click();

  const token = page.locator('[data-slot="popover-content"] div[draggable="true"]').first();
  await token.waitFor();
  const b = (await token.boundingBox())!;

  // Real press-drag-release onto the board.
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 12 });
  await page.mouse.up();

  await expect(boardTokens(page)).toHaveCount(1);
});
