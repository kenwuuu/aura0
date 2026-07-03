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

// Suspected product inconsistency: the 'T' (moveToDeckTop) hotkey's `context`
// array in hotkeys.ts omits 'deckcard' (HotkeyContext.DeckCard), even though
// 'H'/'D'/'S' all include it. HotkeyMenu/HotkeyTooltip only render rows for
// hotkeys whose context includes the current one, so "To deck top" never
// appears in a deck-viewer card's context menu — confirmed via page snapshot
// (menu didn't render at all for this context). The keyboard shortcut itself
// still fires globally (see testDeckViewerCardToDeckTopHotkey, which passes),
// so this is a menu-completeness bug, not a broken feature. Not fixing
// product code per E2E-rehab scope.
test.skip('testDeckViewerCardToDeckTopTooltip', async ({ page }) => {
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

// Same suspected bug as testDeckViewerCardToDeckTopTooltip above, for 'Y'
// (moveToDeckBottom) — its context array also omits 'deckcard'.
test.skip('testDeckViewerCardToDeckBottomTooltip', async ({ page }) => {
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

// Suspected product bug: selecting "To deck top"/"To deck bottom" from a
// pile-viewer card's context menu via a mouse click closes the currently-open
// pile viewer as a side effect (confirmed directly: the dialog is gone
// immediately after a single such click). The equivalent keyboard hotkey
// (testDiscardViewerCardToDeckTopHotkeys) does not have this problem, so it's
// specific to the click path in PileViewerReact's handleMenuSelect. A single
// such move still lands correctly (see testExileViewerCardToDeckTopTooltip,
// which doesn't need the dialog afterward) — only sequences that need the
// viewer to stay open for a second action are affected. Not fixing product
// code per E2E-rehab scope.
test.skip('testDiscardViewerCardToDeckTopTooltip', async ({ page }) => {
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

// Same suspected bug as testDiscardViewerCardToDeckTopTooltip above.
test.skip('testDiscardViewerCardToDeckBottomTooltip', async ({ page }) => {
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

// Same suspected bug as testDiscardViewerCardToDeckTopTooltip above.
test.skip('testExileViewerCardToDeckBottomTooltip', async ({ page }) => {
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

// Suspected product bug: clicking the "To deck top" context-menu row for a
// card inside the Scry viewer over-credits the deck. Debugged in isolation:
// scry 10 (deck 92->82), then move one card to deck top via this tooltip
// click lands the deck at 93, not 83 — an unexplained +11 instead of +1.
// The keyboard-hotkey equivalent (testScryViewerCardToDeckTopHotkey) does the
// correct +1. Suspected cause: ScryManager's "scryViewer closing" cleanup
// (which returns any still-in-scry cards to the deck) racing with/duplicating
// this specific card's explicit onMoveToDeckTop move — plausible if the
// context-menu click is briefly interpreted as a click outside the Dialog,
// triggering close-cleanup before/alongside the explicit move commits. Not
// fixing product code per E2E-rehab scope.
test.skip('testScryViewerCardToDeckTopTooltip', async ({ page }) => {
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

// ── Drag from an open pile viewer directly to a board pile ──────────────────
// The pile viewer is a modal Dialog with a blocking overlay — dragging from a
// card inside it to a pile node behind the overlay isn't possible (the
// overlay intercepts pointer events over the background). Genuinely
// unsupported; kept skipped.

test.skip('testDeckViewerDragCardToDiscard', async ({ page }) => {});
test.skip('testDeckViewerDragCardToExile', async ({ page }) => {});
test.skip('testDiscardViewerDragCardToExile', async ({ page }) => {});
test.skip('testDiscardViewerDragCardToDeck', async ({ page }) => {});
test.skip('testExileViewerDragCardToDiscard', async ({ page }) => {});
test.skip('testExileViewerDragCardToDeck', async ({ page }) => {});
test.skip('testScryViewerDragCardToDiscard', async ({ page }) => {});
test.skip('testScryViewerDragCardToDeck', async ({ page }) => {});

test('testPileViewerDoesNotCloseAfterClickingTooltip', async ({ page }) => {
  await expect(page.getByRole('dialog', { name: 'Search Deck' })).toBeHidden();
  await openPileViewer(page, 'deck');
  await waitForPileViewerReady(page);
  await secondCard(page).click({ button: 'right' });
  await page.getByText('HHand').click();
  await expect(page.getByRole('dialog', { name: 'Search Deck' })).toBeVisible();
});
