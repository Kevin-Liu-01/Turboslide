import { defineConfig } from 'vitest/config';

// The package's own vitest config, so `pnpm --filter @turboslide/mcp test` runs from this
// directory without picking up the root config's project list; the root `pnpm test` still
// includes this package through its `projects` glob.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
