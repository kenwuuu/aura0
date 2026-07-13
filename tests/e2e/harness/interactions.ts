import { Page, Locator, expect } from '@playwright/test';
import { boardCard, boardCardNode, cardPreview, pileTile, whiteboard, deckImportOpenButton, deckImportModal, boardTokens, transformPosition } from './pageObjects';
import { TESTID, PileKind } from './selectors';

export async function centerOf(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Element has no bounding box (not rendered/visible).');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Tap the centre of an element via the touchscreen at raw coordinates.
 *
 * Unlike `locator.tap()`, this does NOT move the real mouse to the target first.
 * On a desktop runner with `hasTouch`, `locator.tap()`'s mouse move fires
 * `mouseenter` (and can leave a hover preview / flip the last-input-modality
 * signal to mouse) before the touch — a dual-input artifact a real phone never
 * produces, which corrupts anything gated on "the last input was touch" (the
 * card-preview/tap logic). Coordinate-based `touchscreen.tap` is a clean touch.
 */
export async function touchTap(page: Page, locator: Locator): Promise<void> {
  const { x, y } = await centerOf(locator);
  await page.touchscreen.tap(x, y);
}

/**
 * Move the mouse to a point via real incremental travel, not a teleport —
 * see "Simulate real mouse travel for hover-sensitive interactions" in
 * docs/testing/e2e.md. `page.mouse.move(x, y)` (default `steps: 1`) and
 * `locator.click()`/`page.mouse.click()` jump straight to the target and
 * skip the intermediate `mousemove`/`mouseenter`/`mouseleave` events a real
 * cursor crossing the screen would fire — anything gated by hover/focus
 * state (a context menu you then move the mouse across other elements to
 * reach) can pass under a teleporting click while staying broken for a real
 * user. Follow with `page.mouse.down()`/`up()` (add `{ button: 'right' }`
 * for a right-click) rather than `page.mouse.click()`, which would re-jump.
 */
export async function realMouseMoveTo(page: Page, to: { x: number; y: number }, steps = 20): Promise<void> {
  await page.mouse.move(to.x, to.y, { steps });
}

/**
 * Park the real mouse cursor clear of the board and wait for the hover preview
 * it was holding open to clear.
 *
 * A desktop runner with `hasTouch` has *both* a mouse and a touchscreen. Any
 * harness step that uses the mouse — `playCreature` drags a card from hand to
 * board — leaves the cursor sitting on the card it just placed, with the
 * desktop hover preview up for it. A real phone has neither a cursor nor hover.
 * Call this before touch-tapping a board card so the tap begins from the state
 * a touch device is actually in: without it, the first tap finds a preview
 * already open for that very card and behaves like a *second* tap, opening the
 * menu immediately and hiding whatever the first tap was supposed to do.
 *
 * The park point is the far-left edge at mid-height — clear of the board's
 * nodes, of the toolbar along the top, and of the dock along the bottom.
 */
export async function parkMouseAwayFromBoard(page: Page): Promise<void> {
  await realMouseMoveTo(page, { x: 5, y: 400 });
  await expect(cardPreview(page)).toBeHidden();
}

/**
 * Zoom the board out until a pile is actually within the viewport, and return it.
 *
 * A fresh room auto-fits the board to the **local** player's mat, so an
 * opponent's mat sits above the visible area — their discard pile lands at a
 * negative `y`, and a tap at its "centre" hits nothing at all (`boundingBox()`
 * still reports a box, so this fails silently rather than erroring). A real
 * player pans or zooms to see their opponent; the harness zooms, which is
 * deterministic. Any spec that interacts with an opponent's board furniture
 * needs this first.
 */
export async function revealPile(
  page: Page,
  kind: PileKind,
  ownerId: string,
  maxZoomOuts = 6,
): Promise<Locator> {
  const tile = pileTile(page, kind, ownerId);
  const zoomOut = page.getByRole('button', { name: /zoom out/i });
  for (let i = 0; i <= maxZoomOuts; i++) {
    const box = await tile.boundingBox();
    const vp = page.viewportSize();
    if (
      box && vp &&
      box.x >= 0 && box.y >= 0 &&
      box.x + box.width <= vp.width && box.y + box.height <= vp.height
    ) {
      return tile;
    }
    await zoomOut.click();
  }
  throw new Error(
    `The ${kind} pile owned by ${ownerId} never came fully on screen after ${maxZoomOuts} zoom-outs.`,
  );
}

/** A card's aspect ratio flips between portrait (untapped) and landscape
 * (tapped) — used as a DOM-visible proxy for tap state, since there's no
 * dedicated `data-tapped` attribute. */
export async function getElementOrientation(locator: Locator): Promise<'portrait' | 'landscape' | 'square'> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Element not found or not visible.');
  const { width, height } = box;
  if (width > height) return 'landscape';
  if (height > width) return 'portrait';
  return 'square';
}

/**
 * Real-mouse drag from one point to another. Works for both dnd-kit and
 * react-flow node drags: presses, nudges past dnd-kit's 8px activation
 * threshold, moves to the target in steps, then releases. Playwright's
 * `.dragTo()` does NOT drive either of these — it dispatches a single
 * HTML5 drag event sequence that neither library listens for.
 */
export async function mouseDrag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 15, from.y + 15, { steps: 5 }); // exceed 8px threshold
  await page.mouse.move(to.x, to.y, { steps: 15 });
  await page.waitForTimeout(120);
  await page.mouse.up();
  await page.waitForTimeout(350);
}

/**
 * Drag a board card while sampling where an *observer* page is rendering it.
 *
 * Live drag is streamed over Yjs awareness, so the only way to prove a peer sees
 * the card move — rather than just teleport on drop — is to look at the observer
 * mid-gesture. Returns the observer's board-space samples, so a spec can assert
 * on the motion itself rather than only on the final resting place.
 */
export async function dragBoardCardWatchedBy(
  page: Page,
  card: Locator,
  to: { x: number; y: number },
  observer: Page,
  cardId: string,
  samples = 10,
): Promise<({ x: number; y: number } | null)[]> {
  const from = await centerOf(card);
  const observed: ({ x: number; y: number } | null)[] = [];

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 15, from.y + 15, { steps: 5 }); // exceed the drag threshold

  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    await page.mouse.move(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, { steps: 3 });
    // Let the position cross the wire and get painted before we look.
    await observer.waitForTimeout(60);
    observed.push(await transformPosition(boardCardNode(observer, cardId)));
  }

  await page.mouse.up();
  return observed;
}

/**
 * The hand auto-scrolls (smooth) to reveal a newly drawn/added card. If a
 * card's on-screen position is captured while that scroll is still in
 * flight, the coordinates go stale by the time the drag actually presses
 * down — the mouse ends up pressing whatever card has since scrolled under
 * those coordinates, not the one whose id was captured. Wait for
 * `scrollLeft` to stop changing between polls before reading positions.
 */
async function waitForHandScrollSettled(page: Page): Promise<void> {
  await page.evaluate((testid: string) => {
    const el = document.querySelector(`[data-testid="${testid}"]`) as HTMLElement | null;
    if (!el) return;
    delete (el.dataset as any).lastScrollLeft;
  }, TESTID.handCardsContainer);
  await page.waitForFunction((testid: string) => {
    const el = document.querySelector(`[data-testid="${testid}"]`) as HTMLElement | null;
    if (!el) return true;
    const prev = el.dataset.lastScrollLeft;
    el.dataset.lastScrollLeft = String(el.scrollLeft);
    return prev === String(el.scrollLeft);
  }, TESTID.handCardsContainer);
}

/**
 * Center point + id of a hand card that is actually clickable. The hand
 * overflows and horizontally clips, so `boundingBox()` alone is not enough — a
 * clipped card still reports a box but isn't hittable. Hit-tests with
 * `elementFromPoint` and picks the hittable card closest to viewport center.
 */
export async function visibleHandCard(
  page: Page,
): Promise<{ x: number; y: number; cardId: string }> {
  await waitForHandScrollSettled(page);
  const pick = await page.evaluate((testid: string) => {
    const vw = window.innerWidth;
    const cards = [...document.querySelectorAll(`[data-testid="${testid}"]`)];
    let best: { x: number; y: number; cardId: string } | null = null;
    let bestDist = Infinity;
    for (const card of cards) {
      const b = card.getBoundingClientRect();
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      const top = document.elementFromPoint(cx, cy);
      if (top && card.contains(top)) {
        const dist = Math.abs(cx - vw / 2);
        if (dist < bestDist) {
          bestDist = dist;
          best = { x: cx, y: cy, cardId: (card as HTMLElement).dataset.cardId ?? '' };
        }
      }
    }
    return best;
  }, TESTID.handCard);
  if (!pick) throw new Error('No clickable hand card found.');
  return pick;
}

/**
 * Play a card from the hand onto the middle of the battlefield.
 *
 * Returns a locator to the *specific* card node that was played, addressed by
 * its id. This matters because some cards spawn related MTG tokens, which are
 * added as additional card nodes — so index-based lookups are unreliable.
 */
export async function playHandCardToBoard(page: Page): Promise<Locator> {
  const { x, y, cardId } = await visibleHandCard(page);
  const boardBox = await whiteboard(page).boundingBox();
  if (!boardBox) throw new Error('#whiteboard not found.');
  // Middle of the board — clear of the health/pile nodes clustered top-left.
  const to = { x: boardBox.x + boardBox.width / 2, y: boardBox.y + boardBox.height / 2 };
  await mouseDrag(page, { x, y }, to);
  const node = boardCard(page, cardId);
  await expect(node).toBeVisible({ timeout: 5000 });
  return node;
}

/** Drag a battlefield card node onto one of the local player's resource piles. */
export async function dragBoardCardToPile(
  page: Page,
  card: Locator,
  kind: PileKind,
): Promise<void> {
  const from = await centerOf(card);
  const to = await centerOf(pileTile(page, kind));
  await mouseDrag(page, from, to);
}

/** Drag a battlefield card node into the hand. */
export async function dragBoardCardToHand(page: Page, card: Locator): Promise<void> {
  const from = await centerOf(card);
  const to = await centerOf(page.getByTestId(TESTID.handCardsContainer));
  await mouseDrag(page, from, to);
}

// Mana/colour tokens are the only templates that carry a starting count, so
// they're the ones that show an editable count overlay (see
// defaultTokenTemplates.ts). They live in the bottom rows of the grid, some
// under the floating hand.
const COUNTED_TOKEN_TITLES = ['COLORLESS', 'WHITE', 'BLUE', 'RED', 'GREEN', 'BLACK'];

/**
 * Open the toolbar's Create ▾ menu and click the "Token" item to reveal the
 * `KeywordTokenGrid` popover. Resolves once the grid is visible.
 *
 * The popover's anchor IS the menu item, so the Popover and the Radix Menu
 * share a DOM node and their focus managers used to fight: opening the popover
 * grabbed focus, then the menu re-focused the item on the next pointermove,
 * which the popover's non-modal dismissable layer read as focus-outside and
 * closed the grid before the user could reach it (see `TokenSubItem` in
 * `GameActionsToolbar.tsx`, which now prevents open-auto-focus and the
 * focus-outside dismiss). `tokenGridSurvivesPointerTravel` guards that.
 */
export async function openTokenGrid(page: Page): Promise<void> {
  await page.getByTestId('game-actions-toolbar').getByText('Create').click();
  await page.getByRole('menuitem', { name: 'Token', exact: true }).click();
  await page.getByText('Drag a token onto the board').waitFor({ state: 'visible' });
}

/**
 * Open the Token grid and drag a counted token onto the board. Picks a counted
 * token that isn't occluded by the floating hand. The resulting token node
 * starts with count 1 and can be clicked (+1) / right-clicked (-1).
 *
 * Deliberately uses `.dragTo()` — grid token templates are native HTML5
 * `draggable` elements, not dnd-kit/react-flow, so the raw mouse recipe
 * doesn't apply here. This is the one sanctioned `.dragTo()` use in the suite.
 */
export async function dragCountedTokenToBoard(page: Page): Promise<void> {
  const before = await boardTokens(page).count();
  await openTokenGrid(page);
  const alt = await page.evaluate((titles: string[]) => {
    for (const name of titles) {
      const el = [...document.querySelectorAll('div[draggable="true"]')].find(
        (d) => (d.querySelector('img') as HTMLImageElement | null)?.alt === name,
      );
      if (!el) continue;
      const b = el.getBoundingClientRect();
      const top = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
      if (top && el.contains(top)) return name;
    }
    return null;
  }, COUNTED_TOKEN_TITLES);
  if (!alt) throw new Error('No accessible counted token in the drawer.');
  await page.locator(`div[draggable="true"]:has(img[alt="${alt}"])`).dragTo(whiteboard(page));
  await expect(boardTokens(page)).toHaveCount(before + 1, { timeout: 5000 });
}

/** Open a local resource pile's viewer. Follow with `waitForPileViewerReady`. */
export async function openPileViewer(page: Page, kind: PileKind): Promise<void> {
  await pileTile(page, kind).click();
}

/**
 * Click a battlefield token's top half (+1) or bottom half (-1) — the
 * click-to-adjust gesture (see `clickedTopHalf` in tokenNodeLogic.ts).
 * Playwright's default `.click()` targets the element's exact center, which
 * is the boundary between the two halves, so this always needs an explicit
 * `position` a bit off-center in the desired direction.
 */
export async function clickTokenHalf(token: Locator, half: 'top' | 'bottom'): Promise<void> {
  const box = await token.boundingBox();
  if (!box) throw new Error('Token has no bounding box (not rendered/visible).');
  const y = half === 'top' ? box.height * 0.25 : box.height * 0.75;
  await token.click({ position: { x: box.width / 2, y } });
}

/**
 * Draw a card from the deck via the pile's own "Draw" button. Scoped to the
 * deck pile node — the game-actions toolbar has its own same-named "Draw"
 * button, so an unscoped `getByRole('button', { name: 'Draw' })` is ambiguous.
 */
export async function drawCard(page: Page): Promise<void> {
  await pileTile(page, 'deck').getByRole('button', { name: 'Draw' }).click();
}

/**
 * Import a deck via the "Choose Deck" -> "Import New Deck" flow. Opens the
 * dock's deck-import modal, fills the name + decklist, submits, and waits for
 * the modal to close (it self-closes ~1s after a successful import) as the
 * signal that the deck actually landed rather than racing the next action.
 */
export async function importDeck(page: Page, name: string, decklist: string): Promise<void> {
  await deckImportOpenButton(page).click();
  await page.getByText('Import New Deck').click();
  await page.getByRole('textbox', { name: 'Deck Name' }).fill(name);
  await page.getByRole('textbox', { name: 'Deck List' }).fill(decklist);
  await page.getByRole('button', { name: 'Import Deck' }).click();
  await deckImportModal(page).waitFor({ state: 'hidden', timeout: 15000 });
}
