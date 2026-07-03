import { Page, Locator, expect } from '@playwright/test';
import { boardCard, pileTile, whiteboard, deckImportOpenButton, deckImportModal, boardTokens } from './pageObjects';
import { TESTID, PileKind } from './selectors';

async function centerOf(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Element has no bounding box (not rendered/visible).');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
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
 * Center point + id of a hand card that is actually clickable. The hand
 * overflows and horizontally clips, so `boundingBox()` alone is not enough — a
 * clipped card still reports a box but isn't hittable. Hit-tests with
 * `elementFromPoint` and picks the hittable card closest to viewport center.
 */
export async function visibleHandCard(
  page: Page,
): Promise<{ x: number; y: number; cardId: string }> {
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
// they're the ones that show an editable count overlay. They live in the
// bottom row of the token drawer, some under the hand.
const COUNTED_TOKEN_TITLES = ['COLORLESS', 'WHITE', 'BLUE', 'RED', 'GREEN', 'BLACK'];

/**
 * Open the token drawer and drag a counted token onto the board. Picks a
 * counted token that isn't occluded by the floating hand. The resulting token
 * node starts with count 1 and can be clicked (+1) / right-clicked (-1).
 *
 * Deliberately uses `.dragTo()` — drawer token templates are native HTML5
 * `draggable` elements, not dnd-kit/react-flow, so the raw mouse recipe
 * doesn't apply here. This is the one sanctioned `.dragTo()` use in the suite.
 */
export async function dragCountedTokenToBoard(page: Page): Promise<void> {
  const before = await boardTokens(page).count();
  await page.locator('[class*="hoverIndicator"]').hover({ force: true });
  await page.waitForTimeout(400);
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
