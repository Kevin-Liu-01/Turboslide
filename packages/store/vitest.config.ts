import { defineConfig } from 'vitest/config';

// The package's own vitest config, so `pnpm --filter @turboslide/store test` runs from this
// directory; the root `pnpm test` still includes the package through its `projects` glob.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
