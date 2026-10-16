import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import worker from '../src/index.ts';

// The bundle a deploy uploaded, on /health (RELIABILITY-16; hardening HR-RT#18): a Worker deploy
// closes every editor's socket, and the guard deployed the production Worker on every push that
// was not docs only. The deploy passes `--var TURBOSLIDE_BUNDLE_HASH:<hash>`
// (scripts/hosting/worker-hash.mjs), `/health` answers it as `bundle`, and the guard's patch
// (docs/hardening/build/guard-worker-hash.patch) deploys only when the push's hash differs. The
// router is called with an env of the test's own, as a deploy with the variable would set it.

async function bundleOf(overrides: Partial<Record<keyof Env, string>>): Promise<unknown> {
  const response = await worker.fetch(new Request('https://rooms.test/health'), {
    ...env,
    ...overrides,
  } as Env);
  return ((await response.json()) as { bundle?: unknown }).bundle;
}

describe('/health bundle (HR-RT#18)', () => {
  it('answers the hash the deploy passed, and empty when it passed none', async () => {
    const hash = 'a'.repeat(64);
    expect(await bundleOf({ TURBOSLIDE_BUNDLE_HASH: hash })).toBe(hash);
    expect(await bundleOf({})).toBe('');
  });
});
