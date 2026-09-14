import { defineConfig } from 'vitest/config';

// The studio's unit tests (src/**/*.test.ts: root.test.ts and, since the Google Slides parity
// round three, the server/auth, authorize, headers and tokens tests). Runs alone as
// `cd apps/studio && ../../node_modules/.bin/vitest run` and under the root `pnpm test` through
// the root vitest.config.ts project list. The e2e/*.spec.ts files are Playwright's
// (playwright.config.ts) and are excluded here on purpose.
export default defineConfig({
  test: {
    name: 'studio',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
