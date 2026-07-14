import { BrowserContext, Page } from '@playwright/test';

/** The key `visitCount.ts` counts visits under. */
const VISIT_COUNT_KEY = 'aura-visit-count';

/** Enough prior visits that `isOnboardingAudience()` says no. */
const RETURNING_PLAYER_VISIT_COUNT = '99';

/**
 * Make a browser look like someone who has played before, so the first-run tour stays away.
 *
 * Every fresh Playwright context has empty localStorage, which is exactly what the tour
 * reads to decide it has found a brand-new player. So a context is opted *out* by default
 * (see `tests/e2e/fixtures.ts`) and only `onboarding_tour.spec.ts` opts back in — otherwise
 * the tour would render over every spec in the suite.
 *
 * Prefer a whole `BrowserContext` over a single `Page`: a page-level init script does not
 * reach the *other* pages in that context, so a second tab boots as a new player again. This
 * is not hypothetical — it is why the second player of `connectSecondPlayer` used to get a
 * tour nobody asked for.
 *
 * Must be an init script rather than a post-`goto` write: bootstrap reads the visit count
 * before React mounts, and re-reads it on every reload.
 */
export async function markReturningPlayer(target: Page | BrowserContext): Promise<void> {
  await target.addInitScript(
    ([key, count]) => {
      localStorage.setItem(key, count);
    },
    [VISIT_COUNT_KEY, RETURNING_PLAYER_VISIT_COUNT] as const,
  );
}
