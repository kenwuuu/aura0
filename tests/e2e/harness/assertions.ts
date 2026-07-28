import { Page, expect } from '@playwright/test';
import { boardCard, boardCardNode, pileCount, handCards, healthInput, transformPosition } from './pageObjects';
import { PileKind, TESTID } from './selectors';

/** Assert a specific card (by id) is present on the battlefield. */
export async function expectBoardToContainCard(page: Page, cardId: string): Promise<void> {
  await expect(boardCard(page, cardId)).toBeVisible();
}

/**
 * Assert two players agree on where a card sits in board space.
 *
 * The interesting case is right after a drag: the dragger commits the final
 * position to Yjs and clears the awareness stream in the same breath, so an
 * observer that keeps applying a stale live-drag override — or that drops it a
 * few pixels early — lands somewhere the dragger never put the card. Polls,
 * because the observer eases into the committed position rather than snapping.
 */
export async function expectCardPositionsAgree(
  dragger: Page,
  observer: Page,
  cardId: string,
  tolerancePx = 1,
): Promise<void> {
  await expect
    .poll(
      async () => {
        const here = await transformPosition(boardCardNode(dragger, cardId));
        const there = await transformPosition(boardCardNode(observer, cardId));
        if (!here || !there) return false;
        return Math.abs(here.x - there.x) <= tolerancePx && Math.abs(here.y - there.y) <= tolerancePx;
      },
      { timeout: 10000, message: `observer never settled onto the dragger's position for card ${cardId}` },
    )
    .toBe(true);
}

/**
 * Assert a local pile's count. Reads the dedicated `data-pile-count`
 * attribute rather than the pile's rendered text — the label and count used
 * to be sibling text nodes that Playwright's `textContent()` concatenates
 * (e.g. "Deck92Draw"), which made `toContainText('92')` fragile.
 */
export async function expectPileCount(page: Page, kind: PileKind, count: number): Promise<void> {
  await expect(pileCount(page, kind)).toHaveAttribute('data-pile-count', String(count));
}

/** Assert the local player's hand has exactly `count` cards. */
export async function expectHandCount(page: Page, count: number): Promise<void> {
  await expect(handCards(page)).toHaveCount(count);
}

/** Assert the local player's health value. */
export async function expectHealth(page: Page, value: number): Promise<void> {
  await expect(healthInput(page)).toHaveValue(String(value));
}

/**
 * Start recording `visibility` transitions on React Flow's board-node wrappers.
 * Pair with `expectNoBoardNodeWentHidden`.
 *
 * React Flow hides a node it considers unmeasured — `visibility: hidden`, which
 * is not just invisible but not hit-testable, so the player it vanished on
 * cannot click, hover or drag the card back. `buildNodes` rebuilds every node
 * object from Yjs on every board write, and React Flow only carries a node's
 * measured size forward across objects that are reference-identical; without a
 * dimension hint of our own that meant one write hid the entire board. A flash
 * this leaves behind is invisible to a `toBeVisible()` assertion, which polls
 * and so simply waits it out — catching it needs a `MutationObserver` watching
 * the inline style React Flow writes.
 *
 * The wrapper is React Flow's element, not ours, so we can't put a testid on it;
 * nodes are identified by walking up from the card/token testids we do own.
 */
export async function recordBoardNodeVisibility(page: Page): Promise<void> {
  await page.evaluate((testids) => {
    const w = window as unknown as { __boardVisLog?: { id: string; visibility: string }[] };
    w.__boardVisLog = [];
    const selector = testids.map((t) => `[data-testid="${t}"]`).join(',');

    // Only log transitions — React Flow rewrites the inline style (transform,
    // z-index) constantly, and every one of those is a mutation record.
    const record = (el: Element) => {
      if (!el.matches('.react-flow__node') || !el.querySelector(selector)) return;
      const id = el.getAttribute('data-id') ?? '(unidentified node)';
      const visibility = getComputedStyle(el).visibility;
      const log = w.__boardVisLog!;
      const previous = log.findLast((entry) => entry.id === id);
      if (previous?.visibility === visibility) return;
      log.push({ id, visibility });
    };

    document.querySelectorAll('.react-flow__node').forEach(record);
    new MutationObserver((records) => {
      for (const r of records) if (r.target instanceof Element) record(r.target);
    }).observe(document.querySelector('.react-flow__nodes')!, {
      attributes: true,
      attributeFilter: ['style'],
      subtree: true,
    });
  }, [TESTID.battlefieldCard, TESTID.battlefieldToken]);
}

/**
 * Assert no board card or token was hidden since `recordBoardNodeVisibility`.
 * Reports how many of the nodes on the board went dark, because the failure
 * that matters is "all of them at once", not "one of them".
 */
export async function expectNoBoardNodeWentHidden(page: Page): Promise<void> {
  const log = await page.evaluate(
    () => (window as unknown as { __boardVisLog?: { id: string; visibility: string }[] }).__boardVisLog ?? [],
  );
  const hidden = [...new Set(log.filter((e) => e.visibility === 'hidden').map((e) => e.id))];
  const total = new Set(log.map((e) => e.id)).size;
  expect(
    hidden,
    `${hidden.length} of ${total} board nodes were rendered visibility:hidden — invisible and un-clickable`,
  ).toEqual([]);
}
