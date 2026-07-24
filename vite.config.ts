import path from "path";
import { readFileSync } from "fs";
import { sentryVitePlugin } from "@sentry/vite-plugin";

import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite'

/**
 * Read `.dev.vars` — the same file `wrangler dev` reads — so a Moxfield import
 * works against the Vite dev server too.
 *
 * Vite has no notion of Worker secrets, and this deliberately isn't `.env`:
 * anything Vite loads from `.env` with a `VITE_` prefix is inlined into the
 * client bundle, which is the one place this value must never appear. Parsed by
 * hand rather than with a dotenv dependency because the format here is one
 * `KEY=value` line.
 */
function readDevVars(root: string): Record<string, string> {
  let contents: string;
  try {
    contents = readFileSync(path.join(root, '.dev.vars'), 'utf8');
  } catch {
    // Absent is normal: only work on a credentialed source needs it, and the
    // endpoint reports its own clear error when a credential is missing.
    return {};
  }

  const vars: Record<string, string> = {};
  for (const line of contents.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) {
      continue;
    }
    const separator = trimmed.indexOf('=');
    if (separator > 0) {
      vars[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim();
    }
  }
  return vars;
}

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
      const devVars = readDevVars(server.config.root);
      // Built once per dev server, not per request: a gate that forgot its clock
      // between requests would enforce nothing.
      let localGate: { reserve(): unknown } | undefined;

      server.middlewares.use('/api/deck-import', async (req, res) => {
        // Loaded through Vite so the TypeScript is transformed on demand and
        // picks up edits without restarting the dev server.
        const { handleDeckImport } = await server.ssrLoadModule('/src/worker/deckImport.ts');
        if (localGate === undefined) {
          const { createLocalGate } = await server.ssrLoadModule('/src/worker/moxfieldGate.ts');
          localGate = createLocalGate();
        }

        // Node models repeated headers as arrays; `Request` wants strings.
        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(req.headers)) {
          if (typeof value === 'string') {
            headers[key] = value;
          } else if (Array.isArray(value)) {
            headers[key] = value.join(', ');
          }
        }

        const response: Response = await handleDeckImport(
          new Request(new URL(req.url ?? '/', 'http://localhost'), {
            method: req.method,
            // Forwarded, not dropped: the endpoint turns away requests that
            // didn't come from Aura's own pages by reading `Sec-Fetch-Site`, so
            // a handler given headerless requests would reject every one of them
            // in dev and nowhere else.
            headers,
          }),
          { MOXFIELD_USER_AGENT: devVars.MOXFIELD_USER_AGENT, localGate },
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