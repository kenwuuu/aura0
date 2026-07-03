import path from "path";
import { sentryVitePlugin } from "@sentry/vite-plugin";

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    // Only upload source maps when a real Sentry auth token is configured —
    // otherwise CI/agent builds (which run `vite build` just to verify it
    // compiles) would spam the production Sentry project with WIP releases.
    ...(process.env.SENTRY_AUTH_TOKEN
      ? [sentryVitePlugin({ org: "ken-zw", project: "javascript-react" })]
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