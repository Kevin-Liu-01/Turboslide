import { defineConfig } from 'vitest/config';

// The package's own vitest config, so `pnpm --filter @turboslide/mcp test` runs from this
// directory without picking up the root config's project list; the root `pnpm test` still
// includes this package through its `projects` glob.
//
// The test budget is 20 s rather than vitest's 5 s default: tools.test.ts turns the whole action
// table's Zod definitions into JSON Schema (about half a second alone), and under the root
// `pnpm test` beside every package's workers and the check chain's browsers that work passed 5 s
// twice at a machine load of 25 to 32 (the focus round, VERIFICATION F-check5 and C3T.5). The
// full list is built once at module load (tools.test.ts EVERY_TOOL); the budget is the second
// guard, the one apps/cli/vitest.config.ts gives its command tests. No assertion changed.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    testTimeout: 20_000,
  },
});
