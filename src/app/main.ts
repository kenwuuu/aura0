/**
 * main.ts — application entry point (Phase 5).
 *
 * Replaces `src/index.ts`. Responsibilities:
 *  1. Init Sentry and PostHog (analytics/monitoring must be first).
 *  2. Call `bootstrapGame()` to wire all imperative game singletons and populate stores.
 *  3. Mount the single React root (<App />) into #app-react-root.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/react';
import posthog from 'posthog-js';

import { bootstrapGame } from './bootstrap';
import { App } from './App';
import '../style.css';

// ── PostHog ───────────────────────────────────────────────────────────────────
posthog.init('phc_yVFqMSYG88kEXYf4vcMJgS7YuHpjRyYCD4aWicRXuJtF', {
  api_host: 'https://us.i.posthog.com',
  defaults: '2026-01-30',
});

// Opt out of PostHog if running locally
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
  posthog.opt_out_capturing();
}

// ── Sentry ────────────────────────────────────────────────────────────────────
Sentry.init({
  environment: process.env.NODE_ENV || 'development',
  dsn: 'https://beb5f109e66475063b4650877bc1c6a1@o4510353682006016.ingest.de.sentry.io/4510353685610576',
  // Setting this option to true will send default PII data to Sentry.
  // For example, automatic IP address collection on events
  sendDefaultPii: true,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({
      maskAllText: false,
      blockAllMedia: false,
    }),
  ],
  // Tracing
  tracesSampleRate: 1.0, // Capture 100% of the transactions
  // Set 'tracePropagationTargets' to control for which URLs distributed tracing should be enabled
  tracePropagationTargets: ['localhost', /^https:\/\/yourserver\.io\/api/],
  // Session Replay
  replaysSessionSampleRate: 0.1, // This sets the sample rate at 10%. You may want to change it to 100% while in development and then sample at a lower rate in production.
  replaysOnErrorSampleRate: 1.0, // If you're not already sampling the entire session, change the sample rate to 100% when sampling sessions where errors occur.
  // Enable logs to be sent to Sentry
  enableLogs: true,
});

// ── Bootstrap + React root ────────────────────────────────────────────────────
bootstrapGame()
  .then((ctx) => {
    const rootEl = document.getElementById('app-react-root');
    if (!rootEl) throw new Error('#app-react-root not found in index.html');
    createRoot(rootEl).render(React.createElement(App, ctx));
  })
  .catch((error) => {
    console.error('Failed to initialize app:', error);
    Sentry.captureException(error);
  });
