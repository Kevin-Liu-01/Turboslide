import { defineConfig } from '@playwright/test';

// Browser tests for apps/studio, run from the repo root as
// `pnpm exec playwright test apps/studio/e2e/viewer.spec.ts` (MILESTONES M1 acceptance).
// The dev server always runs on 4321 (AGENTS.md); an existing server is reused, otherwise
// Playwright starts one and stops it afterwards. One worker: one browser page at a time.
//
// Round two of the Google Slides parity build (gslides-parity SPEC-2 0.43, MILESTONES-2
// "Integrator" item 1): a builder runs the specs against their own dev server on their own port
// with `PLAYWRIGHT_BASE_URL=http://localhost:<port>`; the variable becomes `baseURL` and no
// `webServer` is defined, so Playwright never starts or reuses a server on 4321 for that run.
// The specs never overlap on the shared machine: take `.turboslide/e2e.lock` with `mkdir` before
// `playwright test`, `rmdir` it after, and wait while it exists (AGENTS.md, dev server rules).
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:4321';
const external = process.env.PLAYWRIGHT_BASE_URL !== undefined;

export default defineConfig({
  testDir: 'apps/studio/e2e',
  outputDir: '.turboslide/playwright',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL,
    viewport: { width: 1440, height: 900 },
    headless: true,
    trace: 'retain-on-failure',
  },
  ...(external
    ? {}
    : {
        webServer: {
          command: 'pnpm --filter @turboslide/studio dev',
          url: baseURL,
          reuseExistingServer: true,
          timeout: 120_000,
          stdout: 'ignore',
          stderr: 'pipe',
        },
      }),
});
