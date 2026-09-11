import { defineConfig } from 'vitest/config';

// The app's own vitest config, so `pnpm --filter @turboslide/render-worker test` runs from this
// directory; the root config lists apps/render-worker as a project as well.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    testTimeout: 60_000,
  },
});
