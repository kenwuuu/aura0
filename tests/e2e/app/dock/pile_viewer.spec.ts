import { expect, test } from '../../fixtures';
import { Page } from '@playwright/test';
import {
  expectPileCount,
  handCards,
  mouseDrag,
  openPileViewer,
  pileTile,
  pileViewerCards,
  pileViewerGrid,
  waitForPileViewerReady,
} from '../../harness';

/** The second card in an open pile viewer — any card works identically for these tests. */
function secondCard(page: Page) {
  return pileViewerCards(page).nth(1);
}

/**
 * Hover the deck pile (not the viewer) and press a move-to-pile hotkey N
 * times. 'd' moves the top card to discard, 's' to exile — these are the
 * pile-hover hotkeys (HotkeyContext.Deck), distinct from the pile-viewer's
 * per-card hotkeys of the same letters.
 */
async function millCardsFromDeck(page: Page, key: 'd' | 's', count: number) {
  await pileTile(page, 'deck').hover();
  for (let i = 0; i < count; i++) {
    await page.keyboard.press(key);
  }
}

test('testDeckViewerCardToExileHotkey', async ({ page }) => {
  await openPileViewer(page, 'deck');
  await waitForPileViewerReady(page);
  await secondCard(page).click({ button: 'right' });
  await page.keyboard.press('s');
  await expectPileCount(page, 'exile', 1);
});

test('testDeckViewerCardToExileTooltip', async ({ page }) => {
  await openPileViewer(page, 'deck');
  await waitForPileViewerReady(page);
  await secondCard(page).click({ button: 'right' });
  await page.getByText('SExile').click();
  await expectPileCount(page, 'exile', 1);
});

test('testDeckViewerCardToDiscardHotkey', async ({ page }) => {
  await openPileViewer(page, 'deck');
  await waitForPileViewerReady(page);
  await secondCard(page).click({ button: 'right' });
  await page.keyboard.press('d');
  await expectPileCount(page, 'discard', 1);
});

test('testDeckViewerCardToDiscardTooltip', async ({ page }) => {
  await openPileViewer(page, 'deck');
  await waitForPileViewerReady(page);
  await secondCard(page).click({ button: 'right' });
  await page.getByText('DDiscard').click();
  await expectPileCount(page, 'discard', 1);
});

test('testDeckViewerCardToHandHotkey', async ({ page }) => {
  await openPileViewer(page, 'deck');
  await waitForPileViewerReady(page);
  await secondCard(page).click({ button: 'right' });
  const ninthHandCard = handCards(page).nth(8);
  await expect(ninthHandCard).toBeHidden();
  await page.keyboard.press('h');
  await expect(ninthHandCard).toBeVisible();
});

test('testDeckViewerCardToHandTooltip', async ({ page }) => {
  await expect(page.getByRole('dialog', { name: 'Search Deck' })).toBeHidden();
  await openPileViewer(page, 'deck');
  await waitForPileViewerReady(page);
  const ninthHandCard = handCards(page).nth(8);

  await secondCard(page).click({ button: 'right' });
  await expect(ninthHandCard).toBeHidden();
  await page.getByText('HHand').click();
  await expect(ninthHandCard).toBeVisible();

  await expect(page.getByRole('dialog', { name: 'Search Deck' })).toBeVisible();
});

test('testDeckViewerCardToDeckTopHotkey', async ({ page }) => {
  await openPileViewer(page, 'deck');
  await waitForPileViewerReady(page);
  await expectPileCount(page, 'deck', 92);

  // move card to deck top (reshuffling within deck)
  await secondCard(page).click({ button: 'right' });
  await page.keyboard.press('t');

  // Deck count should remain the same (92)
  await expectPileCount(page, 'deck', 92);
});

test('testDeckViewerCardToDeckTopTooltip', async ({ page }) => {
  await openPileViewer(page, 'deck');
  await waitForPileViewerReady(page);
  await expectPileCount(page, 'deck', 92);

  await secondCard(page).click({ button: 'right' });
  await page.getByText('TTo deck top').click();

  await expectPileCount(page, 'deck', 92);
});

test('testDeckViewerCardToDeckBottomHotkey', async ({ page }) => {
  await openPileViewer(page, 'deck');
  await waitForPileViewerReady(page);
  await expectPileCount(page, 'deck', 92);

  await secondCard(page).click({ button: 'right' });
  await page.keyboard.press('y');

  await expectPileCount(page, 'deck', 92);
});

test('testDeckViewerCardToDeckBottomTooltip', async ({ page }) => {
  await openPileViewer(page, 'deck');
  await waitForPileViewerReady(page);
  await expectPileCount(page, 'deck', 92);

  await secondCard(page).click({ button: 'right' });
  await page.getByText('YTo deck bottom').click();

  await expectPileCount(page, 'deck', 92);
});

// ── Discard pile viewer ──────────────────────────────────────────────────────

test('testDiscardViewerCardToExileHotkey', async ({ page }) => {
  await millCardsFromDeck(page, 'd', 7);
  await expectPileCount(page, 'exile', 0);
  await expectPileCount(page, 'discard', 7);

  await openPileViewer(page, 'discard');
  await waitForPileViewerReady(page);
  await secondCard(page).click({ button: 'right' });
  await page.keyboard.press('s');
  await expectPileCount(page, 'exile', 1);
});

test('testDiscardViewerCardToExileTooltip', async ({ page }) => {
  await millCardsFromDeck(page, 'd', 7);
  await expectPileCount(page, 'exile', 0);
  await expectPileCount(page, 'discard', 7);

  await openPileViewer(page, 'discard');
  await waitForPileViewerReady(page);
  await secondCard(page).click({ button: 'right' });
  await page.getByText('SExile').click();
  await expectPileCount(page, 'exile', 1);
});

test('testDiscardViewerCardToDeckTopHotkeys', async ({ page }) => {
  await millCardsFromDeck(page, 'd', 7);
  await expectPileCount(page, 'discard', 7);

  await openPileViewer(page, 'discard');
  await waitForPileViewerReady(page);

  // move 2 cards to deck top
  await secondCard(page).click({ button: 'right' });
  await page.keyboard.press('t');
  await waitForPileViewerReady(page);
  await secondCard(page).click({ button: 'right' });
  await page.keyboard.press('t');

  await expectPileCount(page, 'deck', 87);
});

test('testDiscardViewerCardToDeckTopTooltip', async ({ page }) => {
  await millCardsFromDeck(page, 'd', 7);
  await expectPileCount(page, 'discard', 7);

  await openPileViewer(page, 'discard');
  await waitForPileViewerReady(page);

  await secondCard(page).click({ button: 'right' });
  await page.getByText('TTo deck top').click();
  await waitForPileViewerReady(page);
  await secondCard(page).click({ button: 'right' });
  await page.getByText('TTo deck top').click();

  await expectPileCount(page, 'deck', 87);
});

test('testDiscardViewerCardToDeckBottomHotkeys', async ({ page }) => {
  await millCardsFromDeck(page, 'd', 7);
  await expectPileCount(page, 'discard', 7);

  await openPileViewer(page, 'discard');
  await waitForPileViewerReady(page);

  await secondCard(page).click({ button: 'right' });
  await page.keyboard.press('y');
  await waitForPileViewerReady(page);
  await secondCard(page).click({ button: 'right' });
  await page.keyboard.press('y');

  await expectPileCount(page, 'deck', 87);
});

test('testDiscardViewerCardToDeckBottomTooltip', async ({ page }) => {
  await millCardsFromDeck(page, 'd', 7);
  await expectPileCount(page, 'discard', 7);

  await openPileViewer(page, 'discard');
  await waitForPileViewerReady(page);

  await secondCard(page).click({ button: 'right' });
  await page.getByText('YTo deck bottom').click();
  await waitForPileViewerReady(page);
  await secondCard(page).click({ button: 'right' });
  await page.getByText('YTo deck bottom').click();

  await expectPileCount(page, 'deck', 87);
});

test('testDiscardViewerCardToHandHotkey', async ({ page }) => {
  await millCardsFromDeck(page, 'd', 7);
  await expectPileCount(page, 'discard', 7);

  await openPileViewer(page, 'discard');
  await waitForPileViewerReady(page);
  const ninthHandCard = handCards(page).nth(8);

  await secondCard(page).click({ button: 'right' });
  await expect(ninthHandCard).toBeHidden();
  await page.keyboard.press('h');
  await expect(ninthHandCard).toBeVisible();
});

test('testDiscardViewerCardToHandTooltip', async ({ page }) => {
  await millCardsFromDeck(page, 'd', 7);
  await expectPileCount(page, 'discard', 7);

  await openPileViewer(page, 'discard');
  await waitForPileViewerReady(page);
  const ninthHandCard = handCards(page).nth(8);

  await secondCard(page).click({ button: 'right' });
  await expect(ninthHandCard).toBeHidden();
  await page.getByText('HHand').click();
  await expect(ninthHandCard).toBeVisible();
});

// ── Exile pile viewer ────────────────────────────────────────────────────────

test('testExileViewerCardToDiscardHotkey', async ({ page }) => {
  await millCardsFromDeck(page, 's', 7);
  await expectPileCount(page, 'discard', 0);
  await expectPileCount(page, 'exile', 7);

  await openPileViewer(page, 'exile');
  await waitForPileViewerReady(page);
  await secondCard(page).click({ button: 'right' });
  await page.keyboard.press('d');
  await expectPileCount(page, 'discard', 1);
});

test('testExileViewerCardToDiscardTooltip', async ({ page }) => {
  await millCardsFromDeck(page, 's', 7);
  await expectPileCount(page, 'exile', 7);

  await openPileViewer(page, 'exile');
  await waitForPileViewerReady(page);
  await secondCard(page).click({ button: 'right' });
  await page.getByText('DDiscard').click();
  await expectPileCount(page, 'discard', 1);
});

test('testExileViewerCardToDeckTopHotkey', async ({ page }) => {
  await millCardsFromDeck(page, 's', 7);
  await expectPileCount(page, 'exile', 7);

  await openPileViewer(page, 'exile');
  await waitForPileViewerReady(page);
  await secondCard(page).click({ button: 'right' });
  await page.keyboard.press('t');

  await expectPileCount(page, 'deck', 86);
});

test('testExileViewerCardToDeckTopTooltip', async ({ page }) => {
  await millCardsFromDeck(page, 's', 7);
  await expectPileCount(page, 'exile', 7);

  await openPileViewer(page, 'exile');
  await waitForPileViewerReady(page);
  await secondCard(page).click({ button: 'right' });
  await page.getByText('TTo deck top').click();

  await expectPileCount(page, 'deck', 86);
});

test('testExileViewerCardToDeckBottomHotkey', async ({ page }) => {
  await millCardsFromDeck(page, 's', 7);
  await expectPileCount(page, 'exile', 7);

  await openPileViewer(page, 'exile');
  await waitForPileViewerReady(page);

  await secondCard(page).click({ button: 'right' });
  await page.keyboard.press('y');
  await waitForPileViewerReady(page);
  await secondCard(page).click({ button: 'right' });
  await page.keyboard.press('y');

  await expectPileCount(page, 'deck', 87);
});

test('testExileViewerCardToDeckBottomTooltip', async ({ page }) => {
  await millCardsFromDeck(page, 's', 7);
  await expectPileCount(page, 'exile', 7);

  await openPileViewer(page, 'exile');
  await waitForPileViewerReady(page);

  await secondCard(page).click({ button: 'right' });
  await page.getByText('YTo deck bottom').click();
  await waitForPileViewerReady(page);
  await secondCard(page).click({ button: 'right' });
  await page.getByText('YTo deck bottom').click();

  await expectPileCount(page, 'deck', 87);
});

test('testExileViewerCardToHandHotkey', async ({ page }) => {
  await millCardsFromDeck(page, 's', 7);
  await expectPileCount(page, 'exile', 7);

  await openPileViewer(page, 'exile');
  await waitForPileViewerReady(page);
  const ninthHandCard = handCards(page).nth(8);

  await secondCard(page).click({ button: 'right' });
  await expect(ninthHandCard).toBeHidden();
  await page.keyboard.press('h');
  await expect(ninthHandCard).toBeVisible();
});

test('testExileViewerCardToHandTooltip', async ({ page }) => {
  await millCardsFromDeck(page, 's', 7);
  await expectPileCount(page, 'exile', 7);

  await openPileViewer(page, 'exile');
  await waitForPileViewerReady(page);
  const ninthHandCard = handCards(page).nth(8);

  await secondCard(page).click({ button: 'right' });
  await expect(ninthHandCard).toBeHidden();
  await page.getByText('HHand').click();
  await expect(ninthHandCard).toBeVisible();
});

// ── Scry pile viewer ─────────────────────────────────────────────────────────
// Scry only supports Discard/Deck-top/Deck-bottom (no Exile/Hand) — see
// PileViewerReact.getSubtitle().

async function openScry(page: Page, count: number) {
  await page.getByTestId('game-actions-toolbar').getByText('Actions').click();
  await page.getByRole('menuitem', { name: 'Scry' }).click();
  await page.getByRole('dialog').locator('input').fill(String(count));
  await page.getByRole('dialog').getByRole('button', { name: 'Scry' }).click();
  await expect(page.getByRole('dialog', { name: 'Scry and Surveil' })).toBeVisible({ timeout: 5000 });
}

test('testScryViewerCardToDiscardHotkey', async ({ page }) => {
  await expectPileCount(page, 'discard', 0);
  await expectPileCount(page, 'deck', 92);

  await openScry(page, 10);
  await secondCard(page).click({ button: 'right' });
  await page.keyboard.press('d');
  await expectPileCount(page, 'discard', 1);
});

test('testScryViewerCardToDiscardTooltip', async ({ page }) => {
  await expectPileCount(page, 'discard', 0);
  await expectPileCount(page, 'deck', 92);

  await openScry(page, 10);
  await secondCard(page).click({ button: 'right' });
  await page.getByText('DDiscard').click();
  await expectPileCount(page, 'discard', 1);
});

test('testScryViewerCardToDeckTopHotkey', async ({ page }) => {
  await expectPileCount(page, 'deck', 92);
  await openScry(page, 10);
  // Scrying 10 cards should remove 10 cards from deck
  await expectPileCount(page, 'deck', 82);

  await secondCard(page).click({ button: 'right' });
  await page.keyboard.press('t');

  // Deck count increases by 1 (moving from scry to deck top)
  await expectPileCount(page, 'deck', 83);
});

test('testScryViewerCardToDeckTopTooltip', async ({ page }) => {
  await expectPileCount(page, 'deck', 92);
  await openScry(page, 10);
  await expectPileCount(page, 'deck', 82);

  await secondCard(page).click({ button: 'right' });
  await page.getByText('TTo deck top').click();

  await expectPileCount(page, 'deck', 83);
});

test('testScryViewerCardToDeckBottomHotkey', async ({ page }) => {
  await expectPileCount(page, 'deck', 92);
  await openScry(page, 10);
  await expectPileCount(page, 'deck', 82);

  await secondCard(page).click({ button: 'right' });
  await page.keyboard.press('y');

  await expectPileCount(page, 'deck', 83);
});

test('testScryViewerDragAndDropReordering', async ({ page }) => {
  await expectPileCount(page, 'deck', 92);
  // Scry 5 cards for easier testing
  await openScry(page, 5);
  await waitForPileViewerReady(page);
  await expect(pileViewerCards(page)).toHaveCount(5);

  const getCardOrder = async () => {
    return await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const grid = dialog?.querySelector('.deck-pile-viewer-grid');
      const items = grid?.children || [];

      return Array.from(items).map((item) => {
        const cardGridItem = item.querySelector('[data-card-id]');
        const img = cardGridItem?.querySelector('img');
        return img?.alt;
      });
    });
  };

  const initialCardNames = await getCardOrder();
  expect(initialCardNames).toHaveLength(5);

  const gridItems = pileViewerGrid(page).locator('> div');

  // Drag the first card (index 0) to the third position (index 2)
  const firstBox = await gridItems.nth(0).boundingBox();
  const thirdBox = await gridItems.nth(2).boundingBox();
  if (!firstBox || !thirdBox) throw new Error('Could not get card bounding boxes');
  await mouseDrag(
    page,
    { x: firstBox.x + firstBox.width / 2, y: firstBox.y + firstBox.height / 2 },
    { x: thirdBox.x + thirdBox.width / 2, y: thirdBox.y + thirdBox.height / 2 },
  );

  const orderAfterFirstDrag = await getCardOrder();
  expect(orderAfterFirstDrag[0]).toBe(initialCardNames[1]);
  expect(orderAfterFirstDrag[1]).toBe(initialCardNames[2]);
  expect(orderAfterFirstDrag[2]).toBe(initialCardNames[0]);
  expect(orderAfterFirstDrag[3]).toBe(initialCardNames[3]);
  expect(orderAfterFirstDrag[4]).toBe(initialCardNames[4]);

  // Second drag: drag the card at position 4 to position 1
  const fifthBox = await gridItems.nth(4).boundingBox();
  const secondBox = await gridItems.nth(1).boundingBox();
  if (!fifthBox || !secondBox) throw new Error('Could not get card bounding boxes for second drag');
  await mouseDrag(
    page,
    { x: fifthBox.x + fifthBox.width / 2, y: fifthBox.y + fifthBox.height / 2 },
    { x: secondBox.x + secondBox.width / 2, y: secondBox.y + secondBox.height / 2 },
  );

  const finalOrder = await getCardOrder();
  expect(finalOrder[0]).toBe(initialCardNames[1]);
  expect(finalOrder[1]).toBe(initialCardNames[4]);
  expect(finalOrder[2]).toBe(initialCardNames[2]);
  expect(finalOrder[3]).toBe(initialCardNames[0]);
  expect(finalOrder[4]).toBe(initialCardNames[3]);
});

test('testPileViewerDoesNotCloseAfterClickingTooltip', async ({ page }) => {
  await expect(page.getByRole('dialog', { name: 'Search Deck' })).toBeHidden();
  await openPileViewer(page, 'deck');
  await waitForPileViewerReady(page);
  await secondCard(page).click({ button: 'right' });
  await page.getByText('HHand').click();
  await expect(page.getByRole('dialog', { name: 'Search Deck' })).toBeVisible();
});

test('testPileViewerDoesNotCloseAfterMovingCardToDeckTop', async ({ page }) => {
  // Regression: selecting a context-menu action used to close the pile
  // viewer (Radix Dialog dismiss, then a focus-trap/portal interaction that
  // could swallow the click entirely) even though the equivalent hotkey
  // stays open. Exercise it from the discard viewer, where "to deck top"
  // actually fires — from the deck viewer's own menu it's a no-op, so a
  // silently-blocked action and a real one are indistinguishable.
  await millCardsFromDeck(page, 'd', 7);
  await expectPileCount(page, 'discard', 7);

  await openPileViewer(page, 'discard');
  await waitForPileViewerReady(page);
  await secondCard(page).click({ button: 'right' });
  await page.getByText('TTo deck top').click();

  await expect(page.getByRole('dialog', { name: 'Discard Pile' })).toBeVisible();
  await expectPileCount(page, 'discard', 6);
});

// SUSPECTED PRODUCT BUG (as of this writing): CardGridItemReact has the same
// onMouseEnter/onMouseLeave-only hover wiring as the hand row did before the
// HandCardsContainer fix, in a grid that reflows on removal. Confirmed via a
// left-click (which — like a real click — moves focus off the viewer's
// auto-focused search input, the only way any per-card hotkey fires at all):
// hover card 2, press 'd' twice with no mouse movement between presses, and
// only the first press registers — the second silently no-ops because
// hoverTarget still points at the now-gone card id. The existing
// right-click-based hotkey tests in this file don't catch it because
// right-click's context-menu popover opening/closing happens to force an
// incidental hit-test refresh — but that's timing-dependent, not a fix: with
// `--repeat-each=3 --retries=0` the right-click path itself flaked 1/3 runs
// with the identical symptom (discard count stuck at 1, not 2).
test.skip('pressing a hotkey twice on a viewer card without moving the mouse moves both', async ({ page }) => {
  await openPileViewer(page, 'deck');
  await waitForPileViewerReady(page);

  await pileViewerCards(page).nth(1).click();
  await page.keyboard.press('d');
  await page.keyboard.press('d');

  await expectPileCount(page, 'discard', 2);
});
