import { expect, test } from '../../fixtures';
import {
  expectHandCount,
  expectPileCount,
  importDeck,
  openPileViewer,
  pileTile,
  pileViewerCards,
  waitForPileViewerReady,
} from '../../harness';

/** Cards dealt to the opening hand on import. */
const OPENING_HAND = 7;

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

/** The same deck, but with no sideboard section — the common case. */
const DECK_WITHOUT_SIDEBOARD = `10 Lightning Bolt
10 Mountain`;

test('testNoSideboardTileWhenDeckImportsWithoutOne', async ({ page }) => {
  // Most decks have no sideboard, so an empty sideboard tile is just clutter that
  // fences off battlefield space — it must not be rendered at all.
  await importDeck(page, 'Plain Deck', DECK_WITHOUT_SIDEBOARD);

  await expectPileCount(page, 'deck', 20 - OPENING_HAND); // import settled
  await expect(pileTile(page, 'sideboard')).toHaveCount(0);
});

test('testSideboardImportsIntoItsOwnPile', async ({ page }) => {
  await importDeck(page, 'Sideboard Deck', DECK_WITH_SIDEBOARD);

  // The sideboard cards are imported, and they are NOT in the deck: the 20 deck
  // cards go to the deck (less the opening hand) and the 2 sideboard cards sit in
  // their own pile rather than inflating the deck to 22.
  await expectPileCount(page, 'sideboard', 2);
  await expectPileCount(page, 'deck', 20 - OPENING_HAND);
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

  // Wait for the opening hand to finish dealing before acting on the sideboard.
  // `handCards(page).count()` is a one-shot query that does not retry, so using it
  // to snapshot a baseline races the deal and can capture a half-dealt hand — the
  // card then moves correctly but is measured against a baseline short by however
  // many cards were still in flight.
  await expectHandCount(page, OPENING_HAND);

  await openPileViewer(page, 'sideboard');
  await waitForPileViewerReady(page);
  await pileViewerCards(page).first().click({ button: 'right' });
  await page.keyboard.press('h');

  await expectPileCount(page, 'sideboard', 1);
  await expectHandCount(page, OPENING_HAND + 1);
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
  // next to them stays usable battlefield. Import a deck with a sideboard first —
  // the tile only exists once the sideboard holds cards.
  await importDeck(page, 'Sideboard Deck', DECK_WITH_SIDEBOARD);
  await expectPileCount(page, 'sideboard', 2);

  const sideboard = await pileTile(page, 'sideboard').boundingBox();
  const deck = await pileTile(page, 'deck').boundingBox();
  const discard = await pileTile(page, 'discard').boundingBox();

  expect(sideboard).not.toBeNull();
  expect(sideboard!.x).toBeLessThan(deck!.x);
  // Same row as the deck, above the discard pile.
  expect(Math.abs(sideboard!.y - deck!.y)).toBeLessThan(5);
  expect(sideboard!.y).toBeLessThan(discard!.y);
});
