import { defineConfig } from 'vitest/config';

// The package's own vitest config, so `cd packages/headless && vitest run` runs from this
// directory without picking up the root config's project list (the root `pnpm test` still
// includes this package through its `projects` glob). The browser tests launch Chromium and
// render deck slides, so they take the long timeout.
export default defineConfig({
  test: {
    name: 'headless',
    include: ['src/**/*.test.ts'],
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
});
