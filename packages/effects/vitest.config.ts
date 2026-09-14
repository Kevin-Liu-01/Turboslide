import { defineConfig } from 'vitest/config';

// The package's own vitest config, so `cd packages/effects && ../../node_modules/.bin/vitest run`
// (the MILESTONES-3 B5 acceptance row) runs this package alone; without it vitest walked up to the
// root config and read its project list relative to this folder. The root `pnpm test` still picks
// the package up through the packages/* glob.
export default defineConfig({
  test: {
    name: 'effects',
    include: ['src/**/*.test.ts'],
  },
});
