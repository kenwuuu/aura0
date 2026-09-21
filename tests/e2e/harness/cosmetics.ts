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
 * A real code, minted by `scripts/foil-code.mjs` and written down.
 *
 * There is no list of issued codes to mock and no endpoint to intercept — a
 * code is valid because its check digits agree with its body, so the specs type
 * the same string a buyer would and the shipped validator answers it. That also
 * makes these specs the tripwire for a salt rotation: change the scheme in
 * `foilCode.ts` and redemption fails here, loudly, which is exactly what
 * invalidating every code already in a buyer's inbox should feel like.
 */
export const VALID_FOIL_CODE = 'FOIL-9YEVN-Y6A';

/**
 * Correctly shaped, wrong check digits — one character off {@link VALID_FOIL_CODE}.
 *
 * A mistyped code, rather than obvious junk: junk would be rejected by the
 * pattern alone and would never exercise the check digits at all.
 */
export const MISTYPED_FOIL_CODE = 'FOIL-9YEVN-Y6B';
