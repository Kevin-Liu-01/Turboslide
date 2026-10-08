import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

// The Worker's tests run inside the Workers runtime under @cloudflare/vitest-plugin, reading the
// entry, the compatibility date and the bindings from wrangler.jsonc (the plugin's guide and its
// configuration page, https://developers.cloudflare.com/workers/testing/vitest-integration/,
// read 2026-10-01). Run as `pnpm --filter @turboslide/realtime-worker test`; the root vitest
// project list leaves this app out on purpose, since its runner starts workerd. The D1 migrations
// of migrations/ ride a test binding and test/setup.ts applies them before each file (the
// plugin's D1 guide), so the control tables exist as a deployed Worker has them.
// `R1_WRANGLER_CONFIG` points the plugin at another config file (the lane's local copy of the
// requested bindings until the owner's wrangler.jsonc carries them, build/r1.md R1-R6c). The
// three secrets carry test values here, so the suite runs on a checkout with no `.dev.vars`; a test
// that needs another value (a rotation, a Worker without the database bearer) hands the router
// its own env.
const TEST_SECRETS = {
  TURBOSLIDE_ROOM_SECRET: 'test-room-secret-not-a-deployment-value-0000000000000000000000',
  TURBOSLIDE_ROOM_BEARER: 'test-room-bearer-not-a-deployment-value-0000000000000000000000',
  TURBOSLIDE_DB_BEARER: 'test-db-bearer-not-a-deployment-value-00000000000000000000000000',
};

export default defineConfig(async () => {
  const migrations = await readD1Migrations('./migrations');
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: process.env.R1_WRANGLER_CONFIG ?? './wrangler.jsonc' },
        miniflare: { bindings: { TEST_MIGRATIONS: migrations, ...TEST_SECRETS } },
      }),
    ],
    test: {
      name: 'realtime-worker',
      include: ['test/**/*.test.ts'],
      setupFiles: ['./test/setup.ts'],
      testTimeout: 20_000,
    },
  };
});
