import { BrowserContext, Page } from '@playwright/test';

/** The localStorage key `cosmeticsStore`'s zustand `persist` middleware writes. */
const COSMETICS_KEY = 'aura:cosmetics';

/** Must track the `version` in cosmeticsStore.ts. */
const COSMETICS_VERSION = 1;

/** The only foil style that exists. Mirrors `FOIL_STYLE_NEBULA`. */
export const FOIL_STYLE = 'nebula';

/**
 * Unlock a cosmetic before the app boots, skipping the purchase flow.
 *
 * Its own key, separate from `aura:settings`, which is exactly why this is a
 * second helper rather than another `seedSetting` caller — see that function's
 * note about an init script wiping sibling fields.
 *
 * Merges rather than replaces, for the same reason: an init script re-runs on
 * every navigation, so a blind `setItem` would discard anything the app
 * persisted during the test — including an entitlement the spec itself just
 * redeemed, which is precisely what a reload spec is trying to observe.
 *
 * Whole-context, not page, so peers opened by `connectSecondPlayer` boot with
 * the same entitlement.
 */
export async function seedCosmeticEntitlement(
  target: Page | BrowserContext,
  styleId: string = FOIL_STYLE,
): Promise<void> {
  await target.addInitScript(
    ([key, version, style]) => {
      let stored: { state?: { entitlements?: Record<string, boolean> }; version?: number } = {};
      try {
        stored = JSON.parse(localStorage.getItem(key as string) ?? '{}') ?? {};
      } catch {
        stored = {};
      }
      localStorage.setItem(
        key as string,
        JSON.stringify({
          state: { entitlements: { ...stored.state?.entitlements, [style as string]: true } },
          version: stored.version ?? version,
        }),
      );
    },
    [COSMETICS_KEY, COSMETICS_VERSION, styleId] as const,
  );
}

/**
 * Answer the Worker's code check without a Worker.
 *
 * The endpoint runs in the Vite dev server during e2e (see `foilCodesApi` in
 * vite.config.ts) but ships with an empty code list, so a spec that typed a real
 * code would fail for the right reason and the wrong test. Routing it here keeps
 * the spec about the redemption flow rather than about which codes are live.
 */
export async function mockFoilCodeCheck(
  target: Page | BrowserContext,
  options: { validCode?: string; fail?: boolean } = {},
): Promise<void> {
  const { validCode = 'FOIL-7X2QF', fail = false } = options;

  await target.route('**/api/foil-codes/redeem', async (route) => {
    if (fail) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
      return;
    }

    const { code } = JSON.parse(route.request().postData() ?? '{}');
    const valid = typeof code === 'string' && code.trim().toUpperCase() === validCode;

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(valid ? { valid: true, style: FOIL_STYLE } : { valid: false }),
    });
  });
}
