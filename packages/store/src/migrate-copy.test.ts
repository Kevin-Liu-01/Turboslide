// The copy's throughput (HR-K1#4b; docs/hosting.md 10): 40,000 documents copied by the window's
// copy calls (240 s budgets) from a public fake whose reads take 50 ms to a private fake whose puts
// take 200 ms (the rehearsal of 2026-10-11 measured about 200 ms a document copied one at a time),
// which answers 1 percent of puts with a 429 that asks for a second, 0.5 percent with a 5xx, and
// every put over 48 in flight with a 429. In virtual time (migrate-sim.ts), so the test takes
// seconds; the times it prints are the copy's own.
import { writeFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { memoryBlobClient } from './blob-fake.ts';
import type { BlobClient } from './blob-store.ts';
import { DEFAULT_CONCURRENCY, FREEZE_LIMIT_MS, LIST_LAG_MS, runMigrationStep } from './migrate.ts';
import type { MigrationResult, MigrationStep } from './migrate.ts';
import { random, virtualTime } from './migrate-sim.ts';

const DOCUMENTS = 40_000;
const T0 = Date.parse('2026-10-15T20:00:00.000Z');

async function copyAt(concurrency: number) {
  const vt = virtualTime(T0);
  const rng = random(concurrency);
  const iso = () => new Date(vt.now()).toISOString();
  const legacy = memoryBlobClient('https://public.local', { now: iso });
  const documents = memoryBlobClient('https://private.local', { now: iso });
  for (let i = 0; i < DOCUMENTS; i += 1) {
    const path = `decks/d${Math.floor(i / 40)}/versions/${i % 40}.json`;
    await legacy.put(path, new TextEncoder().encode(`{"n":${i}}`), { overwrite: true });
  }
  let inFlight = 0;
  let refused = 0;
  const slowPublic: BlobClient = {
    ...legacy,
    get: async (path, options) => {
      await vt.sleep(50);
      return legacy.get(path, options);
    },
  };
  const slowPrivate: BlobClient = {
    ...documents,
    put: async (path, bytes, options) => {
      if (!path.startsWith('decks/')) return documents.put(path, bytes, options);
      inFlight += 1;
      try {
        await vt.sleep(200);
        const r = rng();
        if (inFlight > 48 || r < 0.01) {
          refused += 1;
          throw Object.assign(new Error('Vercel Blob: Too many requests, try again in 1 seconds'), {
            retryAfter: 1,
          });
        }
        if (r < 0.015) throw new Error('Vercel Blob: The blob service is currently not available.');
        return await documents.put(path, bytes, options);
      } finally {
        inFlight -= 1;
      }
    },
  };
  const clients = { legacy: slowPublic, documents: slowPrivate };
  const run = (step: MigrationStep) =>
    runMigrationStep(clients, step, {
      clock: vt.now,
      sleep: vt.sleep,
      abortAfter: vt.abortAfter,
      concurrency,
    });
  return vt.run(async () => {
    const frozen = await run('freeze');
    await vt.sleep(Date.parse(frozen.settlesAt ?? '') - vt.now());
    await run('plan');
    const began = vt.now();
    const calls: MigrationResult[] = [];
    do calls.push(await run('copy'));
    while (!calls.at(-1)?.done && calls.length < 200);
    const copyMs = vt.now() - began;
    await vt.sleep(LIST_LAG_MS);
    const verify = await run('verify');
    return {
      concurrency,
      copyMs,
      calls: calls.length,
      retries: calls.reduce((sum, c) => sum + c.retries, 0),
      refused,
      rows: calls.reduce((sum, c) => sum + c.rowCount, 0),
      clean: verify.clean,
      perSecond: Math.round(DOCUMENTS / (copyMs / 1000)),
    };
  });
}

describe('the copy of 40,000 documents at 200 ms a put, with 429s and 5xxs', () => {
  it('fits the freeze at the default concurrency, and the table of concurrencies', async () => {
    const readings: Awaited<ReturnType<typeof copyAt>>[] = [];
    for (const concurrency of [8, 16, 32, 64]) readings.push(await copyAt(concurrency));
    // COPY_READINGS names a file the table goes to (docs/hosting.md 10 quotes it)
    const table = readings
      .map(
        (r) =>
          `${r.concurrency} in flight: ${Math.round(r.copyMs / 1000)} s in ${r.calls} calls, ${r.perSecond} a second, ${r.retries} retries (${r.refused} refused), rows ${r.rows}, verify ${r.clean ? 'clean' : 'not clean'}`,
      )
      .join('\n');
    if (process.env.COPY_READINGS) writeFileSync(process.env.COPY_READINGS, `${table}\n`);
    for (const r of readings) expect(r.clean).toBe(true);
    const chosen = readings.find((r) => r.concurrency === DEFAULT_CONCURRENCY);
    // the settle, the plan, the copy, the listing lag and verify inside the freeze's limit
    expect(chosen?.copyMs).toBeLessThan(FREEZE_LIMIT_MS - 10 * 60_000);
    // twice the requests in flight is faster until the store's limit refuses them
    const at = (n: number) => readings.find((r) => r.concurrency === n)?.copyMs ?? 0;
    expect(at(16)).toBeLessThan(at(8));
    expect(at(32)).toBeLessThan(at(16));
  }, 600_000);
});
