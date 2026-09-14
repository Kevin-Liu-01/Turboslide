import { defineConfig } from 'vitest/config';

// The package runs under the root `packages/*` project list (root vitest.config.ts) and alone
// from this folder (`cd packages/identity && ../../node_modules/.bin/vitest run`, the B3
// acceptance command of MILESTONES-3). No environment beyond Node: the package is browser safe
// but its tests exercise pure functions.
export default defineConfig({
  test: {
    name: 'identity',
    include: ['src/**/*.test.ts'],
  },
});
