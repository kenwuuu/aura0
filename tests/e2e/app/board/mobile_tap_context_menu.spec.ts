import { expect, test } from '../../fixtures';
import {
  boardToken,
  boardTokens,
  dragCountedTokenToBoard,
  pileTile,
  pileViewer,
  playCreature,
  visibleHandCard,
  handCard,
  waitForPileViewerReady,
  whiteboard,
} from '../../harness';

/**
 * Touch devices have no right-click, so the context menu — the primary way to
 * act on a card/token/pile on mobile — used to be unreachable. These specs
 * cover the touch equivalent: a tap opens the same menu a right-click does.
 *
 * `hasTouch` makes Playwright's touchscreen (`locator.tap()` /
 * `page.touchscreen.tap`) dispatch real touch → pointer events with
 * `pointerType: 'touch'`, which is exactly what the tap detector keys off of.
 */
test.use({ hasTouch: true });

/** A point on the empty board — upper-left is clear of the mats/piles that
 * cluster low/center on a fresh room (mirrors board_pane_context_menu.spec). */
async function emptyBoardPoint(page: Parameters<typeof whiteboard>[0]) {
  const box = await whiteboard(page).boundingBox();
  if (!box) throw new Error('Whiteboard has no bounding box (not rendered/visible).');
  return { x: box.x + box.width * 0.15, y: box.y + box.height * 0.15 };
}

test('tapping a hand card opens its context menu', async ({ page }) => {
  const { cardId } = await visibleHandCard(page);

  await handCard(page, cardId).tap();

  await expect(page.getByRole('menuitem', { name: /^Discard\b/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /^Exile\b/ })).toBeVisible();
  // "Tap" is a battlefield-only row — its absence proves this is the hand menu.
  await expect(page.getByRole('menuitem', { name: /^Tap\b/ })).toBeHidden();
});

test('tapping the empty board opens the global-actions menu', async ({ page }) => {
  const { x, y } = await emptyBoardPoint(page);

  await page.touchscreen.tap(x, y);

  await expect(page.getByRole('menuitem', { name: /^Draw\b/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /^Shuffle\b/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /^Untap all\b/ })).toBeVisible();
});

test('tapping the empty board while a menu is open dismisses it (no re-open)', async ({ page }) => {
  // Open a menu first (the deck pile's — a fixed-position node, reachable on
  // every browser), then tap empty space. "Untap all" is a board-only row,
  // absent from the pile menu, so its absence proves the board menu wasn't
  // summoned in the dismissed menu's place.
  await pileTile(page, 'deck').tap({ position: { x: 31, y: 18 } });
  await expect(page.getByRole('menuitem', { name: /^View\b/ })).toBeVisible();

  const { x, y } = await emptyBoardPoint(page);
  await page.touchscreen.tap(x, y);

  await expect(page.getByRole('menuitem', { name: /^View\b/ })).toBeHidden();
  await expect(page.getByRole('menuitem', { name: /^Untap all\b/ })).toBeHidden();

  // A second tap on empty space — now with nothing open — does summon it.
  await page.touchscreen.tap(x, y);
  await expect(page.getByRole('menuitem', { name: /^Untap all\b/ })).toBeVisible();
});

test('tapping a pile opens its menu, and "View" opens the viewer', async ({ page }) => {
  // Tap the top of the deck tile (clear of its own "Draw" button).
  await pileTile(page, 'deck').tap({ position: { x: 31, y: 18 } });

  // A tap opens the menu rather than opening the viewer directly.
  await expect(page.getByRole('menuitem', { name: /^View\b/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /^Draw\b/ })).toBeVisible();
  await expect(pileViewer(page, 'deck')).toBeHidden();

  // The new "View" row still gets the viewer, one extra tap away.
  await page.getByRole('menuitem', { name: /^View\b/ }).tap();
  await expect(pileViewer(page, 'deck')).toBeVisible();
  await waitForPileViewerReady(page);
});

/**
 * These tap a node that was just played/dragged onto the battlefield.
 *
 * Skipped on Firefox only: react-flow's board auto-fit drops a freshly-placed
 * node at the top-left corner of a fresh, empty room — underneath the toolbar —
 * so the node's centre isn't tap-hittable there. That's a board-layout/harness
 * artifact of the empty test room, not a tap-handling defect: the same gesture
 * opens menus fine for hand cards, piles, and the empty board on Firefox (see
 * the specs above), and the feature works on the two engines that actually back
 * touch devices — Chromium (Chrome/Android/Edge) and WebKit (Safari/iOS).
 */
test.describe('tapping freshly-placed board nodes', () => {
  test.skip(
    ({ browserName }) => browserName === 'firefox',
    "Firefox board auto-fit hides fresh nodes under the toolbar in an empty room (harness artifact); the tap gesture itself is covered on Firefox by the hand-card/pile/empty-board specs.",
  );

  test('tapping a battlefield card opens its context menu', async ({ page }) => {
    const card = await playCreature(page);

    await card.tap();

    await expect(page.getByRole('menuitem', { name: /^Tap\b/ })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /^Flip\b/ })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /^Delete\b/ })).toBeVisible();
  });

  test('tapping a token opens its menu instead of adjusting the count', async ({ page }) => {
    await dragCountedTokenToBoard(page);
    const token = boardToken(page);

    await token.tap();

    // The menu opened…
    await expect(page.getByRole('menuitem', { name: /^Delete token\b/ })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /^\+1\b/ })).toBeVisible();
    // …and the tap did NOT run the left-click +/- (which would change the count
    // to 2, or delete the token by taking it to 0).
    await expect(boardTokens(page)).toHaveCount(1);
    await expect(token).toContainText('1');
  });
});
