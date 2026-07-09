import path from "path";
import { sentryVitePlugin } from "@sentry/vite-plugin";

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite'

// Deploys run through Cloudflare Workers Builds, which sets WORKERS_CI_COMMIT_SHA
// natively; the build command also exports it as VITE_APP_VERSION so it reaches
// client code via import.meta.env (Vite's VITE_ prefix convention). CF_PAGES_COMMIT_SHA
// is kept as a fallback for the legacy Pages build. Read whichever is present so this
// resolves the same version main.ts registers with Sentry/PostHog, keeping sourcemap
// uploads matched to the release the browser reports.
const appVersion =
  process.env.VITE_APP_VERSION ||
  process.env.WORKERS_CI_COMMIT_SHA ||
  process.env.CF_PAGES_COMMIT_SHA;

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
    rollupOptions: {
      input: {
        // Marketing landing page for first-time visitors — the site root.
        main: path.resolve(__dirname, 'index.html'),
        // Game app (boots straight into the whiteboard) at /play.html.
        play: path.resolve(__dirname, 'play.html'),
        // Task-3 spike: the real board on a networking-free instance, /demo.html.
        demo: path.resolve(__dirname, 'demo.html'),
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});