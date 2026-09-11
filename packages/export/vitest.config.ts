import { defineConfig } from 'vitest/config';

// The package's own vitest config, so `pnpm --filter @turboslide/export test` runs from this
// directory without picking up the root config's project list; the root `pnpm test` still includes
// this package through its `projects` glob. The browser test renders four deck slides and needs
// the long timeout.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
});
