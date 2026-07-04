import { Page, expect } from '@playwright/test';
import { boardCard, pileCount, handCards, healthInput } from './pageObjects';
import { PileKind } from './selectors';

/** Assert a specific card (by id) is present on the battlefield. */
export async function expectBoardToContainCard(page: Page, cardId: string): Promise<void> {
  await expect(boardCard(page, cardId)).toBeVisible();
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
