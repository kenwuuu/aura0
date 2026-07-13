import { Page, expect } from '@playwright/test';
import { boardCard, boardCardNode, pileCount, handCards, healthInput, transformPosition } from './pageObjects';
import { PileKind } from './selectors';

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
