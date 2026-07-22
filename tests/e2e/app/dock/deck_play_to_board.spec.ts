/**
 * E2e coverage for the deck's "Play to board" action — the top card of the deck
 * goes straight onto the battlefield, skipping the hand — reachable both from
 * the deck pile's right-click menu and from the `P` hotkey while the deck is
 * hovered.
 *
 * The cascade assertion is deliberately "no two cards share a position" rather
 * than an exact +20/+20 delta: playing a card can also spawn *related token*
 * card nodes (see `boardCardIds`), so the offset between two consecutive plays
 * isn't a fixed number here. The exact geometry is pinned in
 * `battlefieldActions.test.ts`; what matters on screen is that a run of plays
 * never buries one card under another.
 */
import { expect, test } from '../../fixtures';
import {
  boardCardIds,
  boardCardNode,
  expectHandCount,
  expectPileCount,
  pileTile,
  transformPosition,
} from '../../harness';

/** Right-click the deck pile and click its "Play to board" row. */
async function playTopOfDeckViaMenu(page: import('@playwright/test').Page): Promise<void> {
  const menu = page.locator('[data-game-context-menu]');
  await menu.waitFor({ state: 'detached' });
  await pileTile(page, 'deck').click({ button: 'right' });
  await menu.waitFor({ state: 'visible' });
  await page.getByText('Play to boardP').click();
  await menu.waitFor({ state: 'detached' });
}

test('the deck menu plays the top card straight to the board', async ({ page }) => {
  await expectPileCount(page, 'deck', 92);
  await expectHandCount(page, 8);
  const before = new Set(await boardCardIds(page));

  await playTopOfDeckViaMenu(page);

  await expectPileCount(page, 'deck', 91);
  // Straight to the battlefield — the hand is never involved.
  await expectHandCount(page, 8);
  await expect(async () => {
    const added = (await boardCardIds(page)).filter((id) => !before.has(id));
    expect(added.length).toBeGreaterThan(0);
  }).toPass({ timeout: 5000 });
});

test('the P hotkey plays the top card while the deck is hovered', async ({ page }) => {
  await pileTile(page, 'deck').hover();
  await page.keyboard.press('p');

  await expectPileCount(page, 'deck', 91);
  await expectHandCount(page, 8);
  await expect(async () => {
    expect((await boardCardIds(page)).length).toBeGreaterThan(0);
  }).toPass({ timeout: 5000 });
});

test('cards played in a row cascade instead of stacking on one spot', async ({ page }) => {
  await pileTile(page, 'deck').hover();
  await page.keyboard.press('p');
  await page.keyboard.press('p');
  await page.keyboard.press('p');

  await expectPileCount(page, 'deck', 89);

  await expect(async () => {
    const ids = await boardCardIds(page);
    expect(ids.length).toBeGreaterThanOrEqual(3);
    const positions = await Promise.all(
      ids.map(async (id) => transformPosition(boardCardNode(page, id))),
    );
    const placed = positions.filter((p): p is { x: number; y: number } => p !== null);
    expect(placed).toHaveLength(ids.length);
    const distinct = new Set(placed.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`));
    expect(distinct.size).toBe(placed.length);
  }).toPass({ timeout: 5000 });
});
