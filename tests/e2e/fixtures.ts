import {test as base, expect, Locator} from '@playwright/test';
import { blockAnalytics } from './harness/network';
import { markReturningPlayer } from './harness/onboarding';

async function closeIfVisible(locator: Locator) {
  // Only try the click if the locator exists in the DOM
  if (await locator.isVisible().catch(() => false)) {
    await locator.click({ trial: true }).catch(() => {});
    await locator.click();
    await locator.waitFor({ state: 'detached', timeout: 2000 }).catch(() => {});
  }
}

// Random string generator to avoid running into any real game rooms
function generateRandomString(length: number): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

export const test = base.extend<{ onboardingTour: boolean }>({
  /**
   * Whether this spec wants the first-run tour. Off by default: a fresh context
   * has empty localStorage, which makes every test a brand-new player, and the
   * tour would otherwise appear in all of them. Opt in with
   * `test.use({ onboardingTour: true })` — see app/onboarding_tour.spec.ts.
   *
   * This governs *this* context only. A second player is a separate context and
   * opts out on its own — see `connectSecondPlayer`.
   */
  onboardingTour: [false, { option: true }],

  page: async ({ page, onboardingTour }, use) => {
    // The whole context, not just this page: `openDuplicateTab` opens a second page
    // here, and a page-level script would leave that tab booting as a new player.
    if (!onboardingTour) await markReturningPlayer(page.context());

    await blockAnalytics(page);

    // Neutralize CSS animations/transitions across the whole context before the
    // app loads. `playwright.config.ts` sets `reducedMotion: 'reduce'`, but the
    // app's Tailwind `animate-in`/`slide-in-*` menu classes aren't gated on that
    // media query, so the Radix context menu still slide/zoom-animates open. On a
    // loaded CI runner its box never settles inside Playwright's stability window
    // before the click times out — the `element is not stable` / `detached from
    // the DOM` flake that hits every context-menu item click (card_tooltips,
    // smoketest, tooltips…). Forcing zero-duration paints menus in their final
    // position immediately, so the item click lands. Context-level (not page)
    // because `openDuplicateTab` opens a second page that must be covered too.
    await page.context().addInitScript(() => {
      const inject = () => {
        if ((window as unknown as { __e2eNoAnim?: boolean }).__e2eNoAnim) return;
        const root = document.head ?? document.documentElement;
        if (!root) return;
        const style = document.createElement('style');
        style.setAttribute('data-e2e-no-animations', '');
        style.textContent =
          '*, *::before, *::after {' +
          'animation-duration: 0s !important; animation-delay: 0s !important;' +
          'animation-iteration-count: 1 !important;' +
          'transition-duration: 0s !important; transition-delay: 0s !important;' +
          'scroll-behavior: auto !important; }';
        root.appendChild(style);
        (window as unknown as { __e2eNoAnim?: boolean }).__e2eNoAnim = true;
      };
      inject();
      document.addEventListener('DOMContentLoaded', inject);
    });

    await page.goto(`/?room=${generateRandomString(30)}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.clear());

    // Close modals using your helper (in proper order)
    await closeIfVisible(page.getByRole('button', { name: '× Close' }));
    await closeIfVisible(page.getByRole('button', { name: 'Got it' }));

    // Wait until the app is fully ready: default deck loaded (40 health, 8-card
    // opening hand). `#local-dock` no longer exists post-board-redesign — health
    // and hand cards are now react-flow board nodes (see tests/e2e/harness/).
    await expect(page.getByTestId('health-value')).toHaveValue('40');
    await expect(page.locator('[data-testid="hand-card"]')).toHaveCount(8);

    // Provide the prepared page to the test
    await use(page);
  },
});

export { expect };