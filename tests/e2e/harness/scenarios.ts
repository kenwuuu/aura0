import { Page, Locator, expect } from '@playwright/test';
import { healthInput, handCards, pileCount } from './pageObjects';
import { PileKind } from './selectors';
import { importDeck, playHandCardToBoard, dragBoardCardToPile } from './interactions';
import { waitForSync } from './waits';
import { expectPileCount, expectHandCount } from './assertions';
import { blockAnalytics } from './network';

/**
 * Import a single-card deck and confirm it landed: one card in the opening
 * hand. Named cards resolve through the Aura/Scryfall lookup, same as a real
 * user pasting a decklist.
 */
export async function importOneCardDeck(
  page: Page,
  deckName: string,
  cardName: string,
): Promise<void> {
  await importDeck(page, deckName, `1 ${cardName}`);
  await expectHandCount(page, 1);
}

/** Confirm the fresh-session opening hand: 8 cards drawn, 92 left in the deck. */
export async function drawOpeningHand(page: Page): Promise<void> {
  await expectHandCount(page, 8);
  await expectPileCount(page, 'deck', 92);
}

/** Play a card from hand onto the battlefield and confirm it rendered there. */
export async function playCreature(page: Page): Promise<Locator> {
  const card = await playHandCardToBoard(page);
  await expect(card).toBeVisible();
  return card;
}

/** Drag a battlefield card into a resource pile and confirm the pile count incremented. */
export async function moveBetweenZones(page: Page, card: Locator, kind: PileKind): Promise<void> {
  const beforeAttr = await pileCount(page, kind).getAttribute('data-pile-count');
  const before = Number(beforeAttr ?? '0');
  await dragBoardCardToPile(page, card, kind);
  await expectPileCount(page, kind, before + 1);
}

/**
 * The refresh maneuver that reproduces the persistence-vs-sync race
 * (notes.md: a fresh local re-init can briefly write an empty hand before
 * remote/persisted sync data lands). Reloads and waits for the app shell to
 * be interactive again; callers assert their own pre/post state.
 */
export async function reloadAndResync(page: Page): Promise<void> {
  await page.reload({ waitUntil: 'networkidle' });
  await expect(healthInput(page)).toBeVisible({ timeout: 15000 });
}

/**
 * Open the same room in a second tab of the *same* browser context — sharing
 * localStorage, and so resolving to the same player id. That is the duplicate
 * replica the tab lock exists to prevent, and it is only reproducible in one
 * context: `connectSecondPlayer` opens a separate context, which is a different
 * player and perfectly legal.
 *
 * Returns the second tab *without* waiting for a game, because the whole point
 * is that it should not get one — callers assert what it shows instead.
 */
export async function openDuplicateTab(page: Page): Promise<Page> {
  // The fixture clears localStorage *after* the app booted, so the player id the
  // first tab is running on is no longer on disk for a second tab to read. Reload
  // to regenerate and persist it — a second tab is only a duplicate if it
  // resolves to the same player.
  await reloadAndResync(page);

  const duplicate = await page.context().newPage();
  await blockAnalytics(duplicate);
  await duplicate.goto(page.url(), { waitUntil: 'networkidle' });
  return duplicate;
}

/**
 * Open a second browser context in the same room (real WebRTC, not a mock
 * transport — that's what makes this tier catch sync-timing bugs). Waits for
 * both sides to see two seated players before returning.
 */
export async function connectSecondPlayer(page: Page): Promise<Page> {
  const browser = page.context().browser();
  if (!browser) throw new Error('No browser available to open a second context.');
  const context = await browser.newContext();
  const second = await context.newPage();
  await blockAnalytics(second);
  await second.goto(page.url(), { waitUntil: 'networkidle' });
  await expect(healthInput(second)).toHaveValue('40', { timeout: 15000 });
  await expect(handCards(second)).toHaveCount(8, { timeout: 15000 });
  await waitForSync(page, 2);
  await waitForSync(second, 2);
  return second;
}
