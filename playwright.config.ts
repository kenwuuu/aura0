import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// import path from 'path';
// dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * The Yjs relay the multiplayer specs sync through. Local, and ours: see the `webServer`
 * note below for why talking to the deployed relay is not an option.
 */
const RELAY_HOST = '127.0.0.1';
const RELAY_PORT = 47965;
const RELAY_URL = `ws://${RELAY_HOST}:${RELAY_PORT}`;

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests/e2e',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* 2 retries when running on CI, 1 retry on local */
  retries: process.env.CI ? 2 : 1,
  /* Opt out of parallel tests on CI. Use 50% of logical cores on local. */
  workers: process.env.CI ? 1 : '50%',
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }]]
    : [['html', { open: 'never' }]],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('')`. Overridable via
       PLAYWRIGHT_BASE_URL to run the @smoke suite against a deployed
       Cloudflare Pages URL post-deploy (see
       .github/workflows/post-deploy-smoke.yml) instead of localhost. */
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173',
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    /* Emulate prefers-reduced-motion so CSS/smooth-scroll animations resolve
       instantly instead of racing fixed-coordinate drags and assertions. */
    reducedMotion: 'reduce',
  },

  /* Configure projects for major browsers. No auth/storageState — the app has none. */
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
        permissions: ['clipboard-read', 'clipboard-write'],
      },
    },

    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        viewport: { width: 1920, height: 1080 },
      },
    },

    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        viewport: { width: 1920, height: 1080 },
        permissions: ['clipboard-read'],
      },
    },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Boot a local relay and a dev server pointed at it — skipped when
     PLAYWRIGHT_BASE_URL points at an already-deployed URL (nothing to boot, and the
     deployed app talks to the real relay, which is the whole point of that tier).

     The relay matters. Multiplayer specs sync over the *websocket* transport, not WebRTC:
     `blockAnalytics` means the PostHog flags never resolve, and `resolveNetworkTransport()`
     falls back to `websocket` when it hasn't heard back. Without a local relay,
     `WebsocketProvider` falls back to `wss://digitalocean-ws-ipv4.aura0.app` — so every
     two-player test was round-tripping through the *production* droplet over the public
     internet. That made the suite fail whenever prod had a bad second (~17-33% on
     `two_player_sync` alone), and put test rooms on the live relay.

     Run it out of `networking/websocket` so it resolves that package's own pinned
     `@y/websocket-server@0.1.1`. The root manifest carries a `^0.1.1` caret, and 0.1.5
     pulls incompatible Yjs 14 prereleases that hand back empty boards — the exact shape of
     the relay outage. Never boot the relay from the root dependency tree. */
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : [
        {
          command: 'node main.js',
          cwd: 'networking/websocket',
          env: { HOST: RELAY_HOST, PORT: String(RELAY_PORT) },
          url: `http://${RELAY_HOST}:${RELAY_PORT}/health`,
          reuseExistingServer: !process.env.CI,
        },
        {
          command: 'npm run dev',
          url: 'http://localhost:5173',
          env: { VITE_WS_SERVER_URL: RELAY_URL },
          // Never reuse. A dev server someone already started with a plain `npm run dev` has
          // no VITE_WS_SERVER_URL, so reusing it would point the whole suite back at the
          // production relay — the bug this config exists to close, and silently, since the
          // tests would still mostly pass. Playwright errors out if 5173 is occupied, which
          // is the loud failure we want. Stop your dev server, or run against it deliberately
          // with `VITE_WS_SERVER_URL=... npm run dev`.
          reuseExistingServer: false,
        },
      ],
});
