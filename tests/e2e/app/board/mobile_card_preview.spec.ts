import { expect, test } from '../../fixtures';
import {
  cardPreview,
  handCard,
  handCards,
  handCardsContainer,
  touchTap,
  visibleHandCard,
  whiteboard,
} from '../../harness';

/**
 * Touch card-preview behaviour, exercised on hand cards. On touch the preview is
 * driven entirely by taps (the hover handlers go inert — see
 * src/shared/pointerInput.ts): the first tap on a card previews it, a second tap
 * on the same card opens its menu, a tap on a different card switches the
 * preview, and a range of gestures dismiss it. Preview and menu are never both
 * visible.
 *
 * Hand cards are the reliable surface for this on a desktop test runner: they
 * aren't react-flow nodes and aren't under the mouse. Taps go through `touchTap`
 * (raw `touchscreen.tap` coordinates) rather than `locator.tap()`, which would
 * first move the real mouse onto the card and fire a hover that pollutes the
 * touch-vs-hover logic — a dual-input artifact a real phone never produces. The
 * same two-tap machine backs battlefield and pile-viewer cards (see
 * useContextMenuTap.test.tsx), but simulated-touch fires compat
 * mouseenter/contextmenu on react-flow nodes, so those surfaces are pinned by
 * unit tests instead.
 *
 * `hasTouch` makes Playwright dispatch real touch → pointer events with
 * `pointerType: 'touch'`, which is what the preview/tap logic keys off of.
 */
test.use({ hasTouch: true });

/** A point on the empty board — upper-left is clear of the mats/piles that
 * cluster low/center on a fresh room (mirrors mobile_tap_context_menu.spec). */
async function emptyBoardPoint(page: Parameters<typeof whiteboard>[0]) {
  const box = await whiteboard(page).boundingBox();
  if (!box) throw new Error('Whiteboard has no bounding box (not rendered/visible).');
  return { x: box.x + box.width * 0.15, y: box.y + box.height * 0.15 };
}

test('tapping a hand card shows its preview and opens no menu', async ({ page }) => {
  const { cardId } = await visibleHandCard(page);

  await touchTap(page, handCard(page, cardId));

  await expect(cardPreview(page)).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /^Discard\b/ })).toBeHidden();
});

test('tapping the same hand card again opens its menu and dismisses the preview', async ({ page }) => {
  const { cardId } = await visibleHandCard(page);

  await touchTap(page, handCard(page, cardId));
  await expect(cardPreview(page)).toBeVisible();

  await touchTap(page, handCard(page, cardId));
  await expect(page.getByRole('menuitem', { name: /^Discard\b/ })).toBeVisible();
  await expect(cardPreview(page)).toBeHidden();
});

test('tapping a different hand card switches the preview instead of opening a menu', async ({ page }) => {
  const { cardId: idA } = await visibleHandCard(page);
  const ids = await handCards(page).evaluateAll((els) =>
    els.map((e) => (e as HTMLElement).dataset.cardId),
  );
  const idB = ids.find((id) => id && id !== idA);
  if (!idB) throw new Error('Need a second hand card for the switch case.');

  await touchTap(page, handCard(page, idA));
  await expect(cardPreview(page)).toBeVisible();

  // Tapping a *different* card is a fresh first tap: the preview stays up
  // (switched to card B) and no menu opens — that only happens on a second tap
  // of the *same* card.
  await touchTap(page, handCard(page, idB));
  await expect(cardPreview(page)).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /^Discard\b/ })).toBeHidden();
});

test('tapping the empty board dismisses a shown preview without opening a menu', async ({ page }) => {
  const { cardId } = await visibleHandCard(page);
  await touchTap(page, handCard(page, cardId));
  await expect(cardPreview(page)).toBeVisible();

  const { x, y } = await emptyBoardPoint(page);
  await page.touchscreen.tap(x, y);

  await expect(cardPreview(page)).toBeHidden();
  // "Untap all" is a board-menu row — its absence proves the empty-board tap
  // dismissed the preview rather than summoning the board menu in its place.
  await expect(page.getByRole('menuitem', { name: /^Untap all\b/ })).toBeHidden();
});

test('scrolling the hand dismisses a shown preview', async ({ page }) => {
  const { cardId } = await visibleHandCard(page);
  await touchTap(page, handCard(page, cardId));
  await expect(cardPreview(page)).toBeVisible();

  // A touch swipe that scrolls the hand strip fires a scroll event; drive that
  // event directly (a stationary tap never scrolls, so there's no swipe helper).
  await handCardsContainer(page).evaluate((el) => {
    el.scrollLeft += 40;
    el.dispatchEvent(new Event('scroll'));
  });

  await expect(cardPreview(page)).toBeHidden();
});
