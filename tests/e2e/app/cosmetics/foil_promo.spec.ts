import { expect } from '@playwright/test';
import { test } from '../../fixtures';
import { openFreshTab, settingsNavButton } from '../../harness';

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

test.describe('the foil store promo', () => {
  test.use({ foilStorePromo: true });

  test('opens Settings on Cosmetics for a long-time player', async ({ page }) => {
    const fresh = await openFreshTab(page, 'promo-opens-on-arrival');

    await expect(storeButton(fresh)).toBeVisible();
    await expect(settingsNavButton(fresh, 'Cosmetics')).toBeVisible();
  });

  test('does not come back on the next load', async ({ page }) => {
    const fresh = await openFreshTab(page, 'promo-shows-once');
    await expect(storeButton(fresh)).toBeVisible();

    // The marker is written when it opens rather than when it closes, so a
    // player who reloaded with the modal up has still seen it. This is the line
    // between a prompt and a nag, and only a real reload against real storage
    // can see it.
    await fresh.reload({ waitUntil: 'networkidle' });

    await expect(storeButton(fresh)).toBeHidden();
  });
});

test.describe('without the promo', () => {
  test('the store stays shut for everyone else', async ({ page }) => {
    // The default every other spec in the suite runs under. If this ever fails,
    // the whole suite is about to start rendering Settings over itself.
    const fresh = await openFreshTab(page, 'promo-suppressed-by-default');

    await expect(storeButton(fresh)).toBeHidden();
  });
});
