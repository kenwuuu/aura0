import { defineConfig, devices } from '@playwright/test';
import { PHONE_VIEWPORT } from './tests/e2e/harness/viewports';

/**
 * Production-build ("preview") E2E lane — DISTINCT from `playwright.config.ts`,
 * which serves the unminified dev bundle.
 *
 * Why this exists: the dev server and the deployed build are different
 * artifacts. Production runs the CSS through Lightning CSS (Tailwind v4's
 * minifier), which can rewrite declarations in ways that change layout — e.g.
 * it once folded the pile viewer's `transform: none; translate: none` reset
 * into a single `transform: translate(0)`, dropping the `translate` reset and
 * flinging the full-screen mobile modal off-screen. That bug was invisible to
 * every dev-server test because they never render the minified CSS. Specs here
 * drive `vite preview` over the real `dist/` so a minifier regression fails CI
 * *before* deploy instead of being spotted by eye on the live site.
 *
 * Run: `npm run test:e2e:preview` (builds + serves + tests in one shot).
 */
export default defineConfig({
  testDir: './tests/e2e/preview',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-preview' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    reducedMotion: 'reduce',
  },

  projects: [
    {
      name: 'phone-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: PHONE_VIEWPORT,
        // A real phone is touch-first; match that so the viewer takes its phone
        // (`usePhoneLayout`) branch, the same one that was rendering off-screen.
        hasTouch: true,
        isMobile: true,
      },
    },
  ],

  /* Build the production bundle, then serve it with `vite preview`. The WS env
     is set at *build* time (Vite inlines it) and points at a local relay that
     is deliberately never booted: these single-player specs load the default
     deck client-side and don't sync, so this just keeps the build from baking
     in — and reaching out to — the production relay. Never reuse a stale server;
     a rebuild each run is what makes the minified CSS under test current. */
  webServer: {
    // `--host 127.0.0.1` pins the bind to IPv4: `vite preview`'s default
    // `localhost` resolves to `::1` on some machines/CI, which the IPv4 `url`
    // poll below can't reach (the server would look like it never started).
    command: 'npm run build && npm run preview -- --port 4173 --strictPort --host 127.0.0.1',
    env: { VITE_WS_SERVER_URL: 'ws://127.0.0.1:47965' },
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
