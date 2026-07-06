import path from "path";
import { sentryVitePlugin } from "@sentry/vite-plugin";

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite'

// Cloudflare Pages sets CF_PAGES_COMMIT_SHA natively; VITE_APP_VERSION (set to
// the same value in the Pages build config) is what actually reaches client
// code via import.meta.env, per Vite's VITE_ prefix convention. Read either so
// this resolves the same version main.ts registers with Sentry/PostHog,
// keeping sourcemap uploads matched to the release the browser reports.
const appVersion = process.env.VITE_APP_VERSION || process.env.CF_PAGES_COMMIT_SHA;

export default defineConfig({
  plugins: [
    react(),
    // Only upload source maps when a real Sentry auth token is configured —
    // otherwise CI/agent builds (which run `vite build` just to verify it
    // compiles) would spam the production Sentry project with WIP releases.
    ...(process.env.SENTRY_AUTH_TOKEN
      ? [sentryVitePlugin({
          org: "ken-zw",
          project: "javascript-react",
          release: appVersion ? { name: appVersion } : undefined,
        })]
      : []),
    tailwindcss(),
  ],
  server: {
    port: 5173,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});