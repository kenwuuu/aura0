import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'src/**/*.d.ts',
        '**/*.config.ts',
      ],
      // Scoped to the modules with real Tier-1/Tier-2 test investment, not a
      // gamed global number (see claude_plans/test_foundation_progress.md).
      //
      // src/infrastructure/{persistence,networking}/** are deliberately NOT
      // held to a threshold: they're I/O-boundary code (IndexedDB, WebRTC/
      // WebSocket transport) with low unit-test value per the original
      // plan's philosophy — covered by E2E smoke instead, not vitest. See
      // claude_plans/verification_loop_autonomy.md item 5.
      thresholds: {
        'src/features/player/**': { lines: 80, functions: 80 },
        'src/features/battlefield/**': { lines: 80, functions: 80 },
        'src/features/action-log/**': { lines: 80, functions: 80 },
        'src/features/game-actions/**': { lines: 80, functions: 80 },
        'src/infrastructure/cards/CardLookupService.ts': { lines: 90, functions: 90 },
      },
    },
  },
});