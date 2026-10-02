// The test binding vitest.config.ts adds beside the Worker's own (the plugin's D1 guide): the
// migrations of migrations/ as the plugin read them, applied by setup.ts.
import type { D1Migration } from 'cloudflare:test';

declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}

export {};
