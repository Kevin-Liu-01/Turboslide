import { defineConfig } from '@playwright/test';

// Browser tests for apps/studio, run from the repo root as
// `pnpm exec playwright test apps/studio/e2e/viewer.spec.ts` (MILESTONES M1 acceptance).
// The dev server always runs on 4321 (AGENTS.md); an existing server is reused, otherwise
// Playwright starts one and stops it afterwards. One worker: one browser page at a time.
export default defineConfig({
  testDir: 'apps/studio/e2e',
  outputDir: '.turboslide/playwright',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4321',
    viewport: { width: 1440, height: 900 },
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm --filter @turboslide/studio dev',
    url: 'http://localhost:4321',
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
