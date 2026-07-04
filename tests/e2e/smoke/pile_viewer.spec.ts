import { test, expect } from '../fixtures';
import { openPileViewer, waitForPileViewerReady, pileViewer, pileViewerCards } from '../harness';

test('opening the deck pile viewer renders all cards', { tag: '@smoke' }, async ({ page }) => {
  await openPileViewer(page, 'deck');
  await expect(pileViewer(page, 'deck')).toBeVisible();
  await waitForPileViewerReady(page);
  await expect(pileViewerCards(page)).toHaveCount(92);
});
