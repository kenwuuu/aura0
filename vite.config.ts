import path from "path";
import { sentryVitePlugin } from "@sentry/vite-plugin";

import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite'

/**
 * Serve `/api/deck-import` from the dev server.
 *
 * In production that endpoint is the Cloudflare Worker (see wrangler.jsonc);
 * Vite doesn't run it, so without this, deck-URL import would be the one feature
 * that only works in a built deployment. The Worker's handler is imported
 * directly rather than reimplemented — Node and workerd both provide the
 * `fetch`/`Request`/`Response` it needs — so dev and production cannot drift.
 */
function deckImportApi(): Plugin {
  return {
    name: 'aura-deck-import-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/deck-import', async (req, res) => {
        // Loaded through Vite so the TypeScript is transformed on demand and
        // picks up edits without restarting the dev server.
        const { handleDeckImport } = await server.ssrLoadModule('/src/worker/deckImport.ts');

        const response: Response = await handleDeckImport(
          new Request(new URL(req.url ?? '/', 'http://localhost'), { method: req.method }),
        );

        res.statusCode = response.status;
        response.headers.forEach((value, key) => res.setHeader(key, value));
        res.end(await response.text());
      });
    },
  };
}

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
    deckImportApi(),
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