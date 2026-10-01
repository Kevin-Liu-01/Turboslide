import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

// The Worker's tests run inside the Workers runtime under @cloudflare/vitest-plugin, reading the
// entry, the compatibility date and the bindings from wrangler.jsonc (the plugin's guide and its
// configuration page, https://developers.cloudflare.com/workers/testing/vitest-integration/,
// read 2026-10-01). Run as `pnpm --filter @turboslide/realtime-worker test`; the root vitest
// project list leaves this app out on purpose, since its runner starts workerd.
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } })],
  test: {
    name: 'realtime-worker',
    include: ['test/**/*.test.ts'],
  },
});
