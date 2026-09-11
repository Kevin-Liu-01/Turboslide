import { defineConfig } from 'vitest/config';

// One vitest run for the whole workspace (root `pnpm test`). Every folder under packages/ and
// apps/cli is a project; a package that needs another environment (jsdom for @turboslide/viewer
// and @turboslide/chrome) adds its own vitest.config.ts and vitest picks it up in place.
// apps/studio is covered by Playwright (playwright.config.ts), not by vitest.
export default defineConfig({
  test: {
    projects: [
      'packages/*',
      'apps/cli',
      'apps/render-worker',
      {
        test: {
          name: 'scripts',
          root: '.',
          include: ['scripts/**/*.test.mjs'],
        },
      },
    ],
  },
});
