import { test, expect } from '../../fixtures';
import { whiteboard } from '../../harness';

/**
 * Regression: a second right-click at a new spot, while the context menu is
 * still open, must move the menu there — it used to stay pinned at the first
 * click. The menu anchors to a fixed zero-size trigger span at (x, y); once
 * Radix's Popper has positioned an open menu it doesn't re-anchor when that span
 * merely moves (it only recomputes on scroll/resize), so the menu is remounted
 * on a new point to force a fresh position.
 */
test('the board context menu follows a second right-click', async ({ page }) => {
  const box = (await whiteboard(page).boundingBox())!;
  const p1 = { x: box.x + box.width * 0.2, y: box.y + box.height * 0.2 };
  const p2 = { x: box.x + box.width * 0.7, y: box.y + box.height * 0.6 };

  const menu = page.locator('[data-game-context-menu]');

  // First right-click: menu opens near p1.
  await page.mouse.click(p1.x, p1.y, { button: 'right' });
  await menu.waitFor();
  const b1 = (await menu.boundingBox())!;
  expect(Math.abs(b1.x - p1.x)).toBeLessThan(60);

  // Second right-click elsewhere while the menu is still open.
  await page.mouse.click(p2.x, p2.y, { button: 'right' });
  await expect(async () => {
    const b2 = (await menu.boundingBox())!;
    // Menu moved to p2 (well away from p1).
    expect(Math.abs(b2.x - p2.x)).toBeLessThan(60);
    expect(Math.abs(b2.y - p2.y)).toBeLessThan(120);
  }).toPass({ timeout: 3000 });
});
