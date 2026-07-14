import { expect, test } from '../../fixtures';
import {
  expectHandCount,
  expectPileCount,
  handCards,
  importDeck,
  openPileViewer,
  pileTile,
  pileViewerCards,
  waitForPileViewerReady,
} from '../../harness';

/**
 * A deck list with a sideboard, of the shape real exports use: the deck, a blank
 * line, a SIDEBOARD header, then the sideboard cards.
 *
 * The deck is 20 cards so it still holds cards after the 7-card opening hand is
 * dealt — a 4-card deck is drawn to empty on load, and an empty deck has no
 * viewer to open. Only two distinct names, so the import is two card lookups.
 *
 * Deliberately not a legal 60/100, so the import passes through the unusual-size
 * warning — `importDeck` clicks through it.
 */
const DECK_WITH_SIDEBOARD = `10 Lightning Bolt
10 Mountain

SIDEBOARD:
1 Pyroblast
1 Drill Too Deep`;

test('testSideboardImportsIntoItsOwnPile', async ({ page }) => {
  await importDeck(page, 'Sideboard Deck', DECK_WITH_SIDEBOARD);

  // The sideboard cards are imported, and they are NOT in the deck: the 20 deck
  // cards go to the deck (less the opening hand) and the 2 sideboard cards sit in
  // their own pile rather than inflating the deck to 22.
  await expectPileCount(page, 'sideboard', 2);
  await expectPileCount(page, 'deck', 13); // 20 - 7 opening hand
});

test('testSideboardViewerOpensAndShowsItsCards', async ({ page }) => {
  await importDeck(page, 'Sideboard Deck', DECK_WITH_SIDEBOARD);

  await openPileViewer(page, 'sideboard');
  await waitForPileViewerReady(page);

  await expect(pileViewerCards(page)).toHaveCount(2);
});

test('testSideboardCardMovesToHand', async ({ page }) => {
  // The wish / companion path: a card comes off the sideboard into hand.
  await importDeck(page, 'Sideboard Deck', DECK_WITH_SIDEBOARD);
  const handBefore = await handCards(page).count();

  await openPileViewer(page, 'sideboard');
  await waitForPileViewerReady(page);
  await pileViewerCards(page).first().click({ button: 'right' });
  await page.keyboard.press('h');

  await expectPileCount(page, 'sideboard', 1);
  await expectHandCount(page, handBefore + 1);
});

test('testDeckCardMovesToSideboard', async ({ page }) => {
  // Sideboarding between games, the other direction: deck -> sideboard.
  await importDeck(page, 'Sideboard Deck', DECK_WITH_SIDEBOARD);

  await openPileViewer(page, 'deck');
  await waitForPileViewerReady(page);
  await pileViewerCards(page).first().click({ button: 'right' });
  await page.keyboard.press('b');

  await expectPileCount(page, 'sideboard', 3);
});

test('testSideboardPileSitsLeftOfTheDeck', async ({ page }) => {
  // The layout promise: beside the deck, and clear of discard/exile so the space
  // next to them stays usable battlefield.
  const sideboard = await pileTile(page, 'sideboard').boundingBox();
  const deck = await pileTile(page, 'deck').boundingBox();
  const discard = await pileTile(page, 'discard').boundingBox();

  expect(sideboard).not.toBeNull();
  expect(sideboard!.x).toBeLessThan(deck!.x);
  // Same row as the deck, above the discard pile.
  expect(Math.abs(sideboard!.y - deck!.y)).toBeLessThan(5);
  expect(sideboard!.y).toBeLessThan(discard!.y);
});
