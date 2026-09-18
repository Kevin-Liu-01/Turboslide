import { defineConfig } from 'vitest/config';

// One vitest run for the whole workspace (root `pnpm test`). Every folder under packages/ and
// apps/cli is a project; a package that needs another environment (jsdom for @turboslide/viewer
// and @turboslide/chrome) adds its own vitest.config.ts and vitest picks it up in place.
// apps/studio's browser behaviour is covered by Playwright (playwright.config.ts); its server unit
// tests (src/**/*.test.ts, apps/studio/vitest.config.ts) run here since the Google Slides parity
// round three. packages/realtime and packages/identity are picked up by the packages/* glob.
export default defineConfig({
  test: {
    projects: [
      'packages/*',
      'apps/cli',
      'apps/render-worker',
      'apps/studio',
      {
        test: {
          name: 'scripts',
          root: '.',
          // docs/readme/what-works.test.mjs pins the README section against the matrix (b5.md R3)
          include: ['scripts/**/*.test.mjs', 'docs/readme/**/*.test.mjs'],
        },
      },
    ],
  },
});
