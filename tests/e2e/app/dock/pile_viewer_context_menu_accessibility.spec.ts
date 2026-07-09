import { expect, test } from '../../fixtures';
import {
  centerOf,
  expectPileCount,
  openPileViewer,
  pileViewerCards,
  realMouseMoveTo,
  waitForPileViewerReady,
} from '../../harness';

/**
 * Regression coverage for a fixed bug: a pile-viewer card's right-click
 * context menu was inaccessible to a real user, even though it opened fine
 * under a teleporting `.click({button:'right'})` + `getByText(...).click()`
 * (the existing coverage in pile_viewer.spec.ts). Per the "Simulate real
 * mouse travel" rule in docs/testing/e2e.md, these drive the whole gesture —
 * hover onto the card, right-click, then travel to a menu row and click it —
 * via real incremental `page.mouse.move(..., { steps })`, not a teleport.
 *
 * Root cause: the pile-viewer Dialog is modal, so its Radix FocusScope is
 * `trapped` and keeps yanking focus back inside the Dialog. Each forced
 * refocus fired a `focusin` that the menu's (non-modal, portaled)
 * DismissableLayer read as a focus-outside interaction and dismissed on — so
 * the menu vanished within the first hop or two of real pointer travel, well
 * before the cursor reached it. A teleporting `.click()` skipped that focus
 * churn, which is why the bug hid from the old coverage. Fixed by
 * `preventDefault`-ing `onFocusOutside` on the menu (GameContextMenu.tsx): a
 * cursor-anchored menu should only dismiss on a real outside pointer-down or
 * Escape, never on focus movement.
 */

function secondCard(page: Parameters<typeof pileViewerCards>[0]) {
  return pileViewerCards(page).nth(1);
}

test('pile-viewer card context menu is reachable via real mouse travel', async ({ page }) => {
  await openPileViewer(page, 'deck');
  await waitForPileViewerReady(page);

  const card = secondCard(page);
  const cardCenter = await centerOf(card);

  // Real travel onto the card (not a teleport), then right-click from there.
  await realMouseMoveTo(page, cardCenter);
  await page.mouse.down({ button: 'right' });
  await page.mouse.up({ button: 'right' });

  const exileItem = page.getByRole('menuitem', { name: /^Exile\b/ });
  await expect(exileItem).toBeVisible();
  const itemCenter = await centerOf(exileItem);

  // Real travel from the card to the menu row — this is the step a
  // teleporting `.click()` skips — then click it.
  await realMouseMoveTo(page, itemCenter);
  await page.mouse.down();
  await page.mouse.up();

  await expectPileCount(page, 'exile', 1);
});

test('pile-viewer card context menu stays open while the mouse travels toward it', async ({ page }) => {
  await openPileViewer(page, 'deck');
  await waitForPileViewerReady(page);

  const card = secondCard(page);
  const cardCenter = await centerOf(card);

  await realMouseMoveTo(page, cardCenter);
  await page.mouse.down({ button: 'right' });
  await page.mouse.up({ button: 'right' });

  const exileItem = page.getByRole('menuitem', { name: /^Exile\b/ });
  await expect(exileItem).toBeVisible();
  const itemCenter = await centerOf(exileItem);

  // Travel most of the way there, in several small hops, asserting the menu
  // is still open after each — isolates *when* it disappears.
  const steps = 6;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await realMouseMoveTo(
      page,
      { x: cardCenter.x + (itemCenter.x - cardCenter.x) * t, y: cardCenter.y + (itemCenter.y - cardCenter.y) * t },
      4,
    );
    await expect(exileItem, `menu row still visible after travel step ${i}/${steps}`).toBeVisible();
  }
});
