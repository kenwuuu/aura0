import { expect, test } from '../../fixtures';
import {
  boardToken,
  boardTokens,
  cardPreview,
  connectSecondPlayer,
  dragCountedTokenToBoard,
  parkMouseAwayFromBoard,
  revealPile,
  pileTile,
  pileViewer,
  playCreature,
  touchTap,
  visibleHandCard,
  handCard,
  waitForPileViewerReady,
  whiteboard,
} from '../../harness';

/**
 * Touch devices have no right-click, so the context menu — the primary way to
 * act on a card/token/pile on mobile — used to be unreachable. These specs
 * cover the touch equivalent.
 *
 * Card surfaces use a two-tap gesture, in the order that matches what you're
 * usually there to do:
 *  - hand card: tap 1 previews, tap 2 opens the menu (you're identifying a card)
 *  - battlefield card: tap 1 opens the menu, tap 2 previews (you're acting on one)
 * See mobile_card_preview.spec.ts for the full preview behaviour.
 *
 * Non-card surfaces (tokens, piles, the empty board) have no preview and open
 * their menu on a single tap. An opponent's pile has no menu at all, so its tap
 * falls through to opening their viewer.
 *
 * Tap-opened menus anchor to the *item*, not to the touch point — a finger
 * covers what it touches, so a menu opened at the touch point lands on top of
 * the card you just tapped and makes it untappable (which is what blocked the
 * battlefield card's second tap).
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

test('a second tap on a hand card opens its context menu (first tap previews)', async ({ page }) => {
  const { cardId } = await visibleHandCard(page);

  // First tap previews the card — no menu yet.
  await touchTap(page, handCard(page, cardId));
  await expect(cardPreview(page)).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /^Discard\b/ })).toBeHidden();

  // Second tap on the same card opens its menu.
  await touchTap(page, handCard(page, cardId));
  await expect(page.getByRole('menuitem', { name: /^Discard\b/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /^Exile\b/ })).toBeVisible();
  // "Tap" is a battlefield-only row — its absence proves this is the hand menu.
  await expect(page.getByRole('menuitem', { name: /^Tap\b/ })).toBeHidden();
});

test('tapping the empty board opens the global-actions menu', async ({ page }) => {
  const { x, y } = await emptyBoardPoint(page);

  await page.touchscreen.tap(x, y);

  await expect(page.getByRole('menuitem', { name: /^Draw\b/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /^Untap all\b/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /^\+1 counter\b/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /^-1 counter\b/ })).toBeVisible();
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

/**
 * An opponent's pile carries no menu (you have no actions on it), so it passes a
 * `null` target and the tap detector opts out entirely — the tap is left alone
 * and falls through to the pile's own click, which opens their viewer. Pinned
 * because it's easy to mistake "no menu" for "does nothing": narrowing the
 * board-pane tap listener (which used to hijack node taps and open the board
 * menu over them) must not take this tap with it.
 */
test('tapping an opponent pile still opens their viewer, with no menu', async ({ page }) => {
  const second = await connectSecondPlayer(page);
  // The opponent's own view is the reliable way to learn their player id: their
  // deck is local *to them*, and only a local deck renders the Draw button.
  const opponentId = await second
    .locator('[data-testid="pile"][data-pile-type="deck"]:has(.draw-button)')
    .getAttribute('data-pile-owner');
  expect(opponentId).toBeTruthy();

  // Their mat starts off-screen (the board auto-fits to *our* mat), so zoom out
  // until their discard pile is actually tappable. Without this the tap lands on
  // empty space and the test passes for the wrong reason — `boundingBox()` still
  // reports a box for an off-screen node, so nothing errors.
  const theirDiscard = await revealPile(page, 'discard', opponentId!);

  await touchTap(page, theirDiscard);

  // The viewer opened. It can only be *theirs* — the tapped tile's own click
  // handler is what opens it, scoped to that tile's owner.
  await expect(pileViewer(page, 'discard')).toBeVisible();
  // …and no menu was summoned: not theirs (an opponent pile has no actions, so
  // it passes a null target) and not the board's.
  await expect(page.getByRole('menuitem', { name: /^View\b/ })).toBeHidden();
  await expect(page.getByRole('menuitem', { name: /^Untap all\b/ })).toBeHidden();
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

  // A battlefield card is two-tap, but **menu-first** — the reverse of a hand
  // card. On the board you're usually reaching for an action (tap, flip,
  // counter), so the menu leads and the preview is the follow-up.
  //
  // The dual-input artifact to neutralise is the mouse `playCreature` leaves
  // parked on the card it just dragged — see `parkMouseAwayFromBoard`.
  //
  // Two things regressed here before and are worth holding. (1) The pane's
  // touch-tap listener used to claim node taps as empty-board taps
  // (`.react-flow__pane` is an *ancestor* of every node, so `closest()`
  // matches), hijacking the gesture before the card ever saw it. (2) The
  // menu-open check must be snapshotted at pointer-down: the menu is a Radix
  // dismissable layer and the second tap is an outside pointer-down that closes
  // it, so reading the store at pointer-up sees "nothing open" and re-opens the
  // menu forever instead of advancing to the preview. happy-dom has no Radix
  // layer, so only this e2e spec can catch that one.
  test('first tap on a battlefield card opens its menu, second swaps it for the preview', async ({ page }) => {
    const card = await playCreature(page);
    await parkMouseAwayFromBoard(page);

    // First tap opens the menu — no preview.
    await touchTap(page, card);
    await expect(page.getByRole('menuitem', { name: /^Tap\b/ })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /^Flip\b/ })).toBeVisible();
    await expect(cardPreview(page)).toBeHidden();
    // "Draw" is an empty-board row, absent from a card's menu — its absence
    // proves the pane's tap listener didn't claim this node tap and summon the
    // board menu in the card's place, which is exactly what it used to do.
    await expect(page.getByRole('menuitem', { name: /^Draw\b/ })).toBeHidden();

    // Second tap on the same card swaps the menu for its preview.
    await touchTap(page, card);
    await expect(cardPreview(page)).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /^Tap\b/ })).toBeHidden();

    // A third tap goes back to the menu — the two toggle.
    await touchTap(page, card);
    await expect(page.getByRole('menuitem', { name: /^Tap\b/ })).toBeVisible();
    await expect(cardPreview(page)).toBeHidden();
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
