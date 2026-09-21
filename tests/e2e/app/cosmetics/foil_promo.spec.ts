import { expect } from '@playwright/test';
import { test } from '../../fixtures';
import { handCards, openFreshTab, settingsNavButton } from '../../harness';

/**
 * The store opening itself, once, for a player who has been here a while.
 *
 * This is the only thing besides the onboarding tour that opens a modal on load,
 * and the two are mutually exclusive by construction: the tour wants fewer than
 * three prior visits, this wants more than ten. The fixture seeds 99 into every
 * context so the tour stays away, which is why every *other* spec has to opt out
 * of this and why this one opts in.
 *
 * Every test here drives its own load via `openFreshTab`. The shared `page`
 * fixture clears localStorage and dismisses modals after navigating, which is
 * the right thing for specs about a running game and precisely the wrong thing
 * for a spec about what happens during boot.
 *
 * Unit tests own the decision rules; what only a browser proves is that the
 * decision reaches the Settings modal and lands on the right section — the promo
 * opens a section of an existing modal, so "it opened" and "it opened on
 * cosmetics" are different claims.
 */
const storeButton = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: 'Open Ko-fi' });

/**
 * Wait until the app has actually finished booting in this tab.
 *
 * Load-bearing twice over. Before a reload, because reloading a half-booted tab
 * interrupts the deck load and leaves the room with nothing to restore — the
 * page comes back with an empty hand and the spec fails for a reason that has
 * nothing to do with foil. After a reload, because `toBeHidden` passes instantly
 * against a page that has rendered nothing, which would make an absence
 * assertion green whether or not the promo behaved.
 */
async function bootComplete(page: import('@playwright/test').Page): Promise<void> {
  await expect(handCards(page)).toHaveCount(8, { timeout: 15000 });
}

test.describe('the foil store promo', () => {
  test.use({ foilStorePromo: true });

  test('opens Settings on Cosmetics for a long-time player', async ({ page }) => {
    const fresh = await openFreshTab(page, 'promo-opens-on-arrival');

    await expect(storeButton(fresh)).toBeVisible();
    await expect(settingsNavButton(fresh, 'Cosmetics')).toBeVisible();

    // The promo opens over a game that still loads normally underneath it.
    await bootComplete(fresh);
  });

  test('does not come back on the next load', async ({ page }) => {
    const first = await openFreshTab(page, 'promo-shows-once');
    await expect(storeButton(first)).toBeVisible();
    await bootComplete(first);
    await first.close();

    // A second arrival rather than a reload. That is the claim in the player's
    // terms — they come back tomorrow and are not sold to again — and the
    // marker it reads is per-browser storage, which a new tab in the same
    // context shares. Reloading tested the same thing but raced the deck load
    // badly enough to hang about one run in ten.
    const second = await openFreshTab(page, 'promo-shows-once-again');
    await bootComplete(second);

    await expect(storeButton(second)).toBeHidden();
  });
});

test.describe('without the promo', () => {
  test('the store stays shut for everyone else', async ({ page }) => {
    // The default every other spec in the suite runs under. If this ever fails,
    // the whole suite is about to start rendering Settings over itself.
    const fresh = await openFreshTab(page, 'promo-suppressed-by-default');

    // Prove the app is up, then prove the store is not.
    await bootComplete(fresh);
    await expect(storeButton(fresh)).toBeHidden();
  });
});
