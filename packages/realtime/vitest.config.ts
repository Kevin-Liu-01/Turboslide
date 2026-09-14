import { defineConfig } from 'vitest/config';

// The package's own vitest config, so `../../node_modules/.bin/vitest run` runs from this
// directory; the root `pnpm test` still includes the package through its `projects` glob. The
// pre install alias rows of the round three day one (the package.json is the integrator's) were
// removed at merge 1 once `pnpm install` linked zod, @turboslide/schema and @turboslide/store here.
export default defineConfig({
  test: {
    name: 'realtime',
    include: ['src/**/*.test.ts', 'client/**/*.test.ts'],
  },
});
