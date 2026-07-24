import { BrowserContext, Page } from '@playwright/test';

/** The localStorage key `settingsStore`'s zustand `persist` middleware writes. */
const SETTINGS_KEY = 'aura:settings';

/** Must track `SETTINGS_VERSION` in settingsStore.ts, or `migrate` runs on load. */
const SETTINGS_VERSION = 1;

/**
 * Seed a persisted user preference before the app boots.
 *
 * Partial by design: zustand's `persist` shallow-merges the stored blob over the
 * store's defaults, so naming one key overrides only that key and every other
 * setting keeps its default.
 *
 * Must be an init script, not a post-`goto` write — `settingsStore` rehydrates
 * synchronously when the module is first imported, long before React mounts.
 * (`fixtures.ts` clears localStorage after `goto`; that is harmless here because
 * the value is already in memory and nothing reloads the page afterwards.)
 *
 * Whole-context, not page: `openDuplicateTab` and `connectSecondPlayer` open
 * further pages that would otherwise boot with defaults.
 */
async function seedSetting(target: Page | BrowserContext, patch: Record<string, unknown>): Promise<void> {
  await target.addInitScript(
    ([key, version, state]) => {
      localStorage.setItem(key, JSON.stringify({ state, version }));
    },
    [SETTINGS_KEY, SETTINGS_VERSION, patch] as const,
  );
}

/**
 * Turn the "are you sure?" prompt on card delete on or off.
 *
 * It ships **on**, but the suite opts *out* by default (see `deleteConfirmation`
 * in `tests/e2e/fixtures.ts`) so a spec that deletes a card as a setup step gets
 * a plain one-click delete instead of an unexpected modal. Specs that want the
 * real thing opt back in with `test.use({ deleteConfirmation: true })` — see
 * `app/board/delete_confirmation.spec.ts`.
 */
export async function setDeleteConfirmation(
  target: Page | BrowserContext,
  enabled: boolean,
): Promise<void> {
  await seedSetting(target, { confirmCardDelete: enabled });
}
