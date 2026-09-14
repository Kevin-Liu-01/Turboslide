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
//
// Round three (gslides-parity SPEC-3 16.1 step 26, 16.3): the two browser specs run two contexts
// in one worker against one dev server on the memory channel; when this config starts the server
// itself it runs with the environment step 26 names (the memory channel, a checkout auth
// database under .turboslide/, captured mail), so no spec needs a service.
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
          env: {
            TURBOSLIDE_REALTIME: 'memory',
            TURBOSLIDE_AUTH_DB: '.turboslide/auth.sqlite',
            TURBOSLIDE_MAIL: 'capture',
            // the localhost agent surface stays open for the specs whatever TURBOSLIDE_LOCAL_TOKEN
            // says, and the library's sign in limiter is off for a spec run (b3.md R12)
            TURBOSLIDE_LOCAL_OPEN: '1',
            TURBOSLIDE_AUTH_RATE_LIMIT: 'off',
            // obviously fake secrets for the identity cookie and the export download URLs
            TURBOSLIDE_SESSION_SECRET: 'playwright-session-secret-0000000000000000000000',
            TURBOSLIDE_DOWNLOAD_SECRET: 'playwright-download-secret-000000000000000000',
          },
          url: baseURL,
          reuseExistingServer: true,
          timeout: 120_000,
          stdout: 'ignore',
          stderr: 'pipe',
        },
      }),
});
