import { expect, test } from '../../fixtures';
import {
  PHONE_VIEWPORT,
  handCards,
  openPileViewer,
  pileDestinationBar,
  pileDestinationCount,
  pileDestinationTarget,
  pileViewer,
  pileViewerCards,
  waitForPileViewerReady,
} from '../../harness';

/**
 * Tap-to-select + destination bar (design 1a), covered on both desktop and
 * phone. The load-bearing assertion is that a *batch* moves: two selected cards
 * both land in the hand from a single destination tap, and the bar clears.
 */

test.describe('pile viewer selection — desktop', () => {
  test('select two cards then move the batch to hand', async ({ page }) => {
    await openPileViewer(page, 'deck');
    await waitForPileViewerReady(page);

    const handBefore = await handCards(page).count();
    const cards = pileViewerCards(page);
    await cards.nth(0).click();
    await cards.nth(1).click();

    await expect(pileDestinationBar(page)).toBeVisible();
    await expect(pileDestinationCount(page)).toHaveText('2 SELECTED');

    await pileDestinationTarget(page, 'moveToHand').click();

    // Both selected cards moved to the hand (batch), and the bar cleared.
    await expect(pileDestinationBar(page)).toHaveCount(0);
    await expect(handCards(page)).toHaveCount(handBefore + 2);
  });
});

test.describe('pile viewer selection — phone', () => {
  test.use({ viewport: PHONE_VIEWPORT });

  test('full-screen shell selects and batch-moves to hand', async ({ page }) => {
    await openPileViewer(page, 'deck');
    await waitForPileViewerReady(page);

    // The 1a shell is full-screen — the viewer fills the viewport width.
    const box = await pileViewer(page).boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(PHONE_VIEWPORT.width - 1);

    const handBefore = await handCards(page).count();
    const cards = pileViewerCards(page);
    await cards.nth(0).click();
    await cards.nth(1).click();

    await expect(pileDestinationCount(page)).toHaveText('2 SELECTED');
    await pileDestinationTarget(page, 'moveToHand').click();

    await expect(pileDestinationBar(page)).toHaveCount(0);
    await expect(handCards(page)).toHaveCount(handBefore + 2);
  });
});
