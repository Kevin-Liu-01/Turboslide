import { defineConfig } from 'vitest/config';

// The package runs under the root `packages/*` project list (root vitest.config.ts) and alone
// from this folder (`cd packages/spelling && ../../node_modules/.bin/vitest run`, the B5
// acceptance command of MILESTONES-5). No environment beyond Node: the Worker path is exercised
// by the studio's e2e specs, the Node path by the tests here.
export default defineConfig({
  test: {
    name: 'spelling',
    include: ['src/**/*.test.ts'],
  },
});
