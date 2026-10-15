// The storage migration in one window (HR-K1#4b; docs/hosting.md section 10) on the fake stores:
// each step and each refusal, the fail closed layout read, the dual read record of the migration
// before HR-K1#4b, a deployment that shares the public store, the rollback of a switch, rekey,
// delete and its preconditions, and the keyed twins. The race simulation is migrate-sim.test.ts,
// the copy's throughput migrate-copy.test.ts.
import { describe, expect, it } from 'vitest';

import { legacyAssetKey, newAssetKey, newDeckRecord } from '@turboslide/schema/access';
import { MIGRATION_STEPS as SCHEMA_MIGRATION_STEPS } from '@turboslide/schema/actions';

import { blobAccessStore } from './access-store.ts';
import type { BlobClient } from './blob-store.ts';
import { memoryBlobClient } from './blob-fake.ts';
import {
  DELETE_AFTER_SWITCH_MS,
  FREEZE_HOLD_MS,
  FREEZE_LIMIT_MS,
  LIST_LAG_MS,
  MIGRATION_META,
  MIGRATION_PLAN,
  MIGRATION_PROGRESS,
  MIGRATION_STEPS,
  OLDER_DEPLOYMENT_ROW,
  OPEN_AFTER_MS,
  REKEY_SETTLE_MS,
  StorageLayoutError,
  isPublicPath,
  keyedTwinsClient,
  publicDocuments,
  putLayoutRecord,
  runMigrationStep,
  splitBlobClient,
  twinKeyResolver,
} from './migrate.ts';
import type { MigrationOptions, MigrationResult, MigrationStep } from './migrate.ts';
import { sharesPublicStore } from './select.ts';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const T0 = Date.parse('2026-10-15T20:00:00.000Z');
const NOW = new Date(T0).toISOString();
const text = (got: { bytes: Uint8Array } | null): string | null =>
  got === null ? null : decoder.decode(got.bytes);
const body = (value: string) => encoder.encode(value);

/** The documents and public objects of a production store, every root unit included. */
const SEED: Record<string, string> = {
  'decks/gt-brand/deck.json': '{"id":"gt-brand"}',
  'decks/gt-brand/slides/s1.json': '{"id":"s1"}',
  'decks/gt-brand/versions/1.json': '{"n":1}',
  'decks/gt-brand/.turboslide/copies/a.json': '{}',
  'decks/gt-brand/assets/mark.ab12.png': 'png-mark',
  'decks/q4/deck.json': '{"id":"q4"}',
  'decks/q4/assets/photo.cd34.webp': 'webp-photo',
  'decks/index.json': '{"decks":2}',
  'users/u1/decks.json': '{"decks":["gt-brand"]}',
  'links/abc.json': '{"deck":"gt-brand"}',
  'templates/t1/deck.json': '{"id":"t1"}',
  'system/flags.json': '{}',
  'index/decks.json': '[]',
  'builds/b1/page.html': '<p>',
  'vitals/v.json': '{}',
  'top.json': '{"top":true}',
  'exports/q4/job/deck.pdf': '%PDF',
  'bundles/q4.zip': 'PK',
  'u/AvatarKey/a-64.webp': 'avatar',
  'd/q4/PublicKey0000000000000/assets/photo.cd34.webp': 'webp-photo',
};
const DOCUMENTS = Object.keys(SEED).filter((path) => !isPublicPath(path));

function world(options: { shared?: boolean; seed?: boolean } = {}) {
  const t = { now: T0 };
  const clock = () => t.now;
  const at = () => new Date(t.now).toISOString();
  const legacy = memoryBlobClient('https://public.local', { now: at });
  const documents = memoryBlobClient('https://private.local', { now: at });
  const clients = { legacy, documents };
  const shared = options.shared === true;
  const run = (step: MigrationStep, extra: MigrationOptions = {}): Promise<MigrationResult> =>
    runMigrationStep(clients, step, {
      clock,
      sleep: async (ms) => {
        t.now += ms;
      },
      abortAfter: () => new AbortController().signal,
      sharedPublicStore: shared,
      concurrency: 4,
      ...extra,
    });
  const instance = () =>
    splitBlobClient(clients, { ttlMs: 0, now: clock, sharedPublicStore: shared });
  return {
    t,
    clock,
    legacy,
    documents,
    clients,
    run,
    instance,
    later: (ms: number) => {
      t.now += ms;
    },
    async seed() {
      for (const [path, value] of Object.entries(SEED))
        await legacy.put(path, body(value), { overwrite: true });
      legacy.calls.length = 0;
    },
    progress: () =>
      JSON.parse(
        text(
          documents.blobs.has(MIGRATION_PROGRESS)
            ? { bytes: documents.blobs.get(MIGRATION_PROGRESS)!.bytes }
            : null,
        ) ?? '{}',
      ) as Record<string, unknown>,
    meta: () =>
      JSON.parse(decoder.decode(documents.blobs.get(MIGRATION_META)!.bytes)) as Record<
        string,
        unknown
      >,
    /** document puts and removals that reached the public store */
    publicWrites: () =>
      legacy.calls.filter((c) => (c.op === 'put' || c.op === 'del') && !isPublicPath(c.pathname)),
  };
}
type World = ReturnType<typeof world>;

/** The window from the counts to the switch; copy runs until it answers done. */
async function window(w: World, copy: MigrationOptions = {}) {
  const counts = await w.run('plan');
  const frozen = await w.run('freeze');
  w.t.now = Date.parse(frozen.settlesAt ?? '');
  const plan = await w.run('plan');
  const copies: MigrationResult[] = [];
  do copies.push(await w.run('copy', copy));
  while (!copies.at(-1)?.done && copies.length < 20);
  w.later(LIST_LAG_MS);
  const verify = await w.run('verify');
  const switched = await w.run('switch');
  return { counts, frozen, plan, copies, verify, switched };
}

const opens = (w: World, switched: MigrationResult) => {
  w.t.now = Date.parse(switched.switchedAt ?? '') + OPEN_AFTER_MS;
};

describe('the paths and the plan', () => {
  it('routes twins, keyed twins, avatars, exports and bundles public, and every other path is a document', () => {
    expect(isPublicPath('decks/q4/assets/a.png')).toBe(true);
    expect(isPublicPath('d/q4/key/assets/a.png')).toBe(true);
    expect(isPublicPath('u/AbCd/a-64.webp')).toBe(true);
    expect(isPublicPath('exports/q4/job/deck.pptx')).toBe(true);
    expect(isPublicPath('bundles/q4.zip')).toBe(true);
    for (const path of ['decks/q4/deck.json', 'users/u/decks.json', 'links/a.json', 'top.json'])
      expect(isPublicPath(path)).toBe(false);
    expect([...MIGRATION_STEPS]).toEqual([...SCHEMA_MIGRATION_STEPS]);
  });

  it('counts every document of the public store, the root units and the top files included', async () => {
    const w = world();
    await w.seed();
    expect((await publicDocuments(w.legacy)).map((e) => e.pathname)).toEqual([...DOCUMENTS].sort());
    const counts = await w.run('plan');
    expect(counts).toMatchObject({
      step: 'plan',
      state: 'v1',
      done: true,
      processed: DOCUMENTS.length,
    });
    expect(counts.note).toMatch(
      new RegExp(
        `^counts: ${DOCUMENTS.length} public documents of \\d+ bytes listed in \\d+ ms; the private store holds 0$`,
      ),
    );
    // a layout record before the progress, so the store never holds migration.json alone
    expect(w.meta()).toMatchObject({ state: 'v1', layout: 'v1', failed: [OLDER_DEPLOYMENT_ROW] });
    expect(w.progress()).toMatchObject({ planned: { run: null, count: DOCUMENTS.length } });
    expect(w.documents.blobs.has(MIGRATION_PLAN)).toBe(false);
    // the lease is given back
    expect(w.progress().busyUntil).toBeUndefined();
  });
});

describe('the layout read', () => {
  it('reads v1 only on a store that never held a record, and fails closed otherwise', async () => {
    const w = world();
    await w.seed();
    expect(text(await w.instance().get('links/abc.json'))).toBe(SEED['links/abc.json']);
    // migration.json without meta.json: every request fails with 503 until the record reads
    await w.documents.put(MIGRATION_PROGRESS, body('{"schemaVersion":1}'), { overwrite: true });
    const refused = w.instance().get('links/abc.json');
    await expect(refused).rejects.toBeInstanceOf(StorageLayoutError);
    await expect(refused).rejects.toMatchObject({ status: 503, retryAfter: 5 });
    await w.documents.del([MIGRATION_PROGRESS]);
    // a root listing that names the record while its read answers absent
    const listed: BlobClient = {
      ...w.documents,
      files: async () => [{ pathname: MIGRATION_META, url: '', size: 1, version: '"x"' }],
    };
    await expect(
      splitBlobClient({ legacy: w.legacy, documents: listed }, { ttlMs: 0 }).get('links/abc.json'),
    ).rejects.toThrow(/read absent while the store lists meta.json/);
    // bytes that are no record, and a read that fails
    await w.documents.put(MIGRATION_META, body('[1]'), { overwrite: true });
    await expect(w.instance().get('links/abc.json')).rejects.toBeInstanceOf(StorageLayoutError);
    await putLayoutRecord(w.documents, { state: 'v1' });
    w.documents.failNextGet(MIGRATION_META, new Error('fetch failed'));
    const one = w.instance();
    await expect(one.get('links/abc.json')).rejects.toBeInstanceOf(StorageLayoutError);
    expect(text(await one.get('links/abc.json'))).toBe(SEED['links/abc.json']);
    // once a process read a record, an absence is a failed read
    await w.documents.del([MIGRATION_META]);
    await expect(one.get('links/abc.json')).rejects.toThrow(/absent after this process read it/);
  });

  it('reads the dual read record of the migration before HR-K1#4b as that code did', async () => {
    const w = world({ shared: true });
    await w.seed();
    const old = {
      schemaVersion: 1,
      layout: 'v1',
      step: 'rekey',
      decks: ['gt-brand'],
      dualRead: true,
      rollback: false,
    };
    await w.documents.put(MIGRATION_META, body(JSON.stringify(old)), { overwrite: true });
    await w.documents.put('users/u1/decks.json', body('mine'), { overwrite: true });
    const preview = w.instance();
    // private first, the public store when absent there
    expect(text(await preview.get('users/u1/decks.json'))).toBe('mine');
    expect(text(await preview.get('links/abc.json'))).toBe(SEED['links/abc.json']);
    expect((await preview.list('users/')).map((e) => e.pathname)).toEqual(['users/u1/decks.json']);
    // written and removed on the private store alone
    await preview.put('links/new.json', body('new'), { overwrite: false });
    await preview.del(['users/u1/decks.json']);
    expect(w.documents.blobs.has('links/new.json')).toBe(true);
    expect(text(await preview.get('users/u1/decks.json'))).toBe(SEED['users/u1/decks.json']);
    expect(w.publicWrites()).toEqual([]);
    // layout v2, and a rolled back window
    await w.documents.put(
      MIGRATION_META,
      body(JSON.stringify({ ...old, layout: 'v2', dualRead: false })),
      { overwrite: true },
    );
    expect(text(await w.instance().get('links/abc.json'))).toBeNull();
    await w.documents.put(MIGRATION_META, body(JSON.stringify({ ...old, rollback: true })), {
      overwrite: true,
    });
    expect(text(await w.instance().get('users/u1/decks.json'))).toBe(SEED['users/u1/decks.json']);
  });
});

describe('the split client', () => {
  it('refuses every document write on a store that shares the public one before its switch', async () => {
    const w = world({ shared: true });
    await w.seed();
    const preview = w.instance();
    const put = preview.put('decks/q4/deck.json', body('x'), { overwrite: true });
    await expect(put).rejects.toMatchObject({
      name: 'StorageFrozenError',
      status: 503,
      retryAfter: 30,
    });
    await expect(
      preview.del(['decks/q4/deck.json', 'decks/q4/assets/photo.cd34.webp']),
    ).rejects.toMatchObject({ name: 'StorageFrozenError' });
    // reads and the public paths go on
    expect(text(await preview.get('decks/q4/deck.json'))).toBe(SEED['decks/q4/deck.json']);
    await preview.put('exports/q4/job/new.pdf', body('%PDF'), { overwrite: true });
    expect(w.legacy.blobs.has('exports/q4/job/new.pdf')).toBe(true);
    expect(w.publicWrites()).toEqual([]);
    expect(sharesPublicStore({ VERCEL_ENV: 'preview' })).toBe(true);
    expect(sharesPublicStore({ VERCEL_ENV: 'production', BLOB_READ_WRITE_TOKEN: 't' })).toBe(false);
    expect(sharesPublicStore({ BLOB_READ_WRITE_TOKEN: 't' })).toBe(true);
    expect(sharesPublicStore({})).toBe(false);
  });

  it('writes the record so that deployments from before HR-K1#4b read v2 on a shared store', async () => {
    for (const shared of [false, true]) {
      const w = world({ shared });
      await w.seed();
      await w.run('freeze');
      expect(w.meta()).toMatchObject({
        state: 'v1',
        layout: shared ? 'v2' : 'v1',
        dualRead: false,
        rollback: false,
        failed: [OLDER_DEPLOYMENT_ROW],
      });
    }
  });
});

describe('the window', () => {
  it('moves every document under one freeze, then reads and writes the private store', async () => {
    const w = world();
    await w.seed();
    // a slow public store, so the copy needs several calls of its budget
    const get = w.legacy.get.bind(w.legacy);
    w.legacy.get = async (path, options) => {
      w.later(1_000);
      return get(path, options);
    };
    const app = w.instance();
    const frozen = await w.run('freeze');
    expect(frozen).toMatchObject({ state: 'v1', frozen: true });
    expect(Date.parse(frozen.settlesAt ?? '')).toBe(T0 + 20_000 + 4 * 60_000);
    expect(Date.parse(frozen.expiresAt ?? '')).toBe(
      Date.parse(frozen.settlesAt ?? '') + FREEZE_HOLD_MS,
    );
    // every document write is refused with the freeze's sentence; reads go on from the public store
    await expect(
      app.put('decks/q4/deck.json', body('x'), { overwrite: true }),
    ).rejects.toMatchObject({
      name: 'StorageFrozenError',
      message: expect.stringMatching(/^Saving is paused while the documents move between stores/),
    });
    expect(text(await app.get('decks/q4/deck.json'))).toBe(SEED['decks/q4/deck.json']);
    await expect(w.run('plan')).rejects.toThrow(/the freeze settles at/);
    await expect(w.run('copy')).rejects.toThrow(/settles at/);
    w.t.now = Date.parse(frozen.settlesAt ?? '');
    await expect(w.run('copy')).rejects.toThrow(/no plan of record/);
    const plan = await w.run('plan');
    expect(plan.note).toMatch(/^the plan of record: 14 public documents/);
    const copies: MigrationResult[] = [];
    do copies.push(await w.run('copy', { budgetMs: 15_000, concurrency: 1 }));
    while (!copies.at(-1)?.done && copies.length < 20);
    expect(copies.length).toBeGreaterThan(2);
    expect(copies.at(-1)).toMatchObject({ done: true, remaining: 0, rowCount: 0 });
    expect(copies.reduce((sum, c) => sum + c.processed, 0)).toBe(DOCUMENTS.length);
    // the copy never writes the public store
    expect(w.publicWrites()).toEqual([]);
    await expect(w.run('verify')).rejects.toThrow(/run verify after it/);
    await expect(w.run('switch')).rejects.toThrow(/no clean verify/);
    w.later(LIST_LAG_MS);
    expect(await w.run('verify')).toMatchObject({
      done: true,
      clean: true,
      processed: DOCUMENTS.length,
    });
    const switched = await w.run('switch');
    expect(switched).toMatchObject({ state: 'v2', frozen: true });
    // every document is private with its bytes and etag; the public objects stayed
    for (const path of DOCUMENTS) {
      expect(w.documents.blobs.get(path)?.version, path).toBe(w.legacy.blobs.get(path)?.version);
      expect(text(await app.get(path)), path).toBe(SEED[path]);
    }
    for (const path of Object.keys(SEED).filter(isPublicPath))
      expect(w.documents.blobs.has(path)).toBe(false);
    // writes open OPEN_AFTER_MS after the switch, on the private store
    await expect(
      app.put('decks/q4/deck.json', body('v2'), { overwrite: true }),
    ).rejects.toMatchObject({ name: 'StorageFrozenError' });
    opens(w, switched);
    await app.put('decks/q4/deck.json', body('v2'), { overwrite: true });
    expect(text(await w.documents.get('decks/q4/deck.json'))).toBe('v2');
    expect(text(await w.legacy.get('decks/q4/deck.json'))).toBe(SEED['decks/q4/deck.json']);
    expect(w.publicWrites()).toEqual([]);
    await expect(w.run('freeze')).rejects.toThrow(/switched to layout v2/);
    await expect(w.run('plan')).rejects.toThrow(/nothing to plan/);
  });

  it('tries a 429 and a 5xx again, and a document that keeps failing is a row the next call tries first', async () => {
    const w = world();
    await w.seed();
    const frozen = await w.run('freeze');
    w.t.now = Date.parse(frozen.settlesAt ?? '');
    await w.run('plan');
    w.legacy.failNextGet(
      'links/abc.json',
      Object.assign(new Error('Vercel Blob: Too many requests'), { retryAfter: 2 }),
    );
    w.documents.failNextPut(
      'users/u1/decks.json',
      new Error('Vercel Blob: The blob service is currently not available. Please try again.'),
    );
    let refusals = 0;
    const put = w.documents.put.bind(w.documents);
    w.documents.put = async (path, bytes, options) => {
      if (path === 'system/flags.json' && refusals < 7) {
        refusals += 1;
        throw new Error('fetch failed');
      }
      return put(path, bytes, options);
    };
    const first = await w.run('copy');
    expect(first).toMatchObject({
      done: false,
      remaining: 1,
      rowCount: 1,
      rows: ['system/flags.json: fetch failed'],
    });
    expect(first.retries).toBe(2 + 4);
    expect(w.progress()).toMatchObject({ copied: DOCUMENTS.length, failed: ['system/flags.json'] });
    const second = await w.run('copy');
    expect(second).toMatchObject({ done: true, remaining: 0, processed: 1, rowCount: 0 });
    w.later(LIST_LAG_MS);
    expect((await w.run('verify')).clean).toBe(true);
  });

  it('removes a private copy the plan does not name, except on a shared store', async () => {
    for (const shared of [false, true]) {
      const w = world({ shared });
      await w.seed();
      // a copy of an earlier run whose public document left since
      await w.documents.put('links/gone.json', body('old'), { overwrite: true });
      await window(w);
      expect(w.documents.blobs.has('links/gone.json')).toBe(shared);
    }
  });

  it('ends the freeze by itself when verify finds a write the freeze did not stop', async () => {
    const w = world();
    await w.seed();
    const frozen = await w.run('freeze');
    w.t.now = Date.parse(frozen.settlesAt ?? '');
    await w.run('plan');
    await w.run('copy');
    // a writer outside the freeze (a checkout on the public token): the public store moved
    await w.legacy.put('links/abc.json', body('outside'), { overwrite: true });
    await w.documents.put('links/stray.json', body('x'), { overwrite: true });
    w.later(LIST_LAG_MS);
    const verify = await w.run('verify');
    expect(verify).toMatchObject({ done: false, clean: false, state: 'v1', frozen: false });
    expect(verify.rows).toEqual([
      expect.stringMatching(/^public links\/abc.json: planned "\w+", found "\w+"$/),
      'private links/stray.json: not planned',
    ]);
    expect(w.progress().endedAt).toMatch(/verify found 2 differences/);
    await expect(w.run('switch')).rejects.toThrow(/no freeze of this run/);
    await w.instance().put('links/abc.json', body('v1 again'), { overwrite: true });
    expect(text(await w.legacy.get('links/abc.json'))).toBe('v1 again');
  });

  it('moves the end of a freeze while its calls come, never past its limit, and ends it by itself after', async () => {
    const w = world();
    await w.seed();
    const frozen = await w.run('freeze');
    const since = T0;
    w.t.now = Date.parse(frozen.settlesAt ?? '') + 8 * 60_000;
    const plan = await w.run('plan');
    expect(Date.parse(plan.expiresAt ?? '')).toBe(w.t.now + FREEZE_HOLD_MS);
    let last: MigrationResult | Error = plan;
    let reached = 0;
    while (!(last instanceof Error)) {
      reached = Date.parse(last.expiresAt ?? '');
      expect(reached).toBeLessThanOrEqual(since + FREEZE_LIMIT_MS);
      w.later(8 * 60_000);
      last = await w.run('copy').catch((error: Error) => error);
    }
    // the end reached the limit, and the call that came within 90 s of it ended the run
    expect(reached).toBe(since + FREEZE_LIMIT_MS);
    expect(String(last)).toMatch(/the run is over/);
    expect(w.meta().frozen).toBeUndefined();
    // a run whose operator stops: the freeze ends on its own and writes go to the public store
    const stopped = world();
    await stopped.seed();
    const s = await stopped.run('freeze');
    stopped.t.now = Date.parse(s.expiresAt ?? '');
    await stopped.instance().put('links/abc.json', body('after'), { overwrite: true });
    expect(text(await stopped.legacy.get('links/abc.json'))).toBe('after');
  });

  it('ends a freeze with unfreeze, which takes no lease and keeps the state; other steps wait for the lease', async () => {
    const w = world();
    await w.seed();
    await w.run('freeze');
    const progress = { ...w.progress(), busyUntil: new Date(T0 + 60_000).toISOString() };
    await w.documents.put(MIGRATION_PROGRESS, body(JSON.stringify(progress)), { overwrite: true });
    await expect(w.run('plan')).rejects.toThrow(/another call holds the migration/);
    await expect(w.run('freeze')).rejects.toThrow(/another call holds the migration/);
    expect(await w.run('unfreeze')).toMatchObject({ state: 'v1', frozen: false, done: true });
    expect(w.progress()).toMatchObject({
      busyUntil: progress.busyUntil,
      endedAt: expect.stringMatching(/unfreeze$/),
    });
    await w.instance().put('links/abc.json', body('open'), { overwrite: true });
    expect(text(await w.legacy.get('links/abc.json'))).toBe('open');
  });

  it('refuses a second freeze, a plan of another freeze, and a switch after a copy that followed the verify', async () => {
    const w = world();
    await w.seed();
    const frozen = await w.run('freeze');
    await expect(w.run('freeze')).rejects.toThrow(/a freeze runs until/);
    w.t.now = Date.parse(frozen.settlesAt ?? '');
    await w.run('plan');
    await w.run('copy');
    w.later(LIST_LAG_MS);
    await w.run('verify');
    await w.run('copy');
    await expect(w.run('switch')).rejects.toThrow(/no clean verify after the last copy/);
    // a new freeze makes the plan of the last one stale
    await w.run('unfreeze');
    const again = await w.run('freeze');
    w.t.now = Date.parse(again.settlesAt ?? '');
    await expect(w.run('copy')).rejects.toThrow(/plan of record is not of this freeze/);
  });
});

describe('the rollback of a switch', () => {
  it('copies back every write made on v2, removes what v2 removed, and names the v1 writes it met', async () => {
    const w = world();
    await w.seed();
    const { switched } = await window(w);
    opens(w, switched);
    const app = w.instance();
    await app.put('decks/q4/deck.json', body('v2 edit'), { overwrite: true });
    await app.put('links/new.json', body('v2 new'), { overwrite: false });
    await app.del(['templates/t1/deck.json']);
    await app.put('decks/q4/assets/new.ef56.png', body('twin'), { overwrite: false });
    // two writers that still ran v1 on the public store
    await w.legacy.put('links/abc.json', body('stray v1'), { overwrite: true });
    await w.legacy.put('system/stray.json', body('stray new'), { overwrite: true });
    const first = await w.run('rollback');
    expect(first).toMatchObject({ state: 'v2', frozen: true, done: false });
    await expect(app.put('links/new.json', body('x'), { overwrite: true })).rejects.toMatchObject({
      name: 'StorageFrozenError',
    });
    expect(text(await app.get('links/new.json'))).toBe('v2 new');
    await expect(w.run('rollback')).rejects.toThrow(/settles at/);
    w.t.now = Date.parse(first.settlesAt ?? '');
    const back = await w.run('rollback');
    expect(back).toMatchObject({ state: 'v1', frozen: true, done: true });
    expect(back.rows.sort()).toEqual([
      'links/abc.json: a v1 write since the switch, replaced by the v2 one',
      'system/stray.json: a v1 write since the switch, kept',
    ]);
    expect(text(await w.legacy.get('decks/q4/deck.json'))).toBe('v2 edit');
    expect(text(await w.legacy.get('links/new.json'))).toBe('v2 new');
    expect(text(await w.legacy.get('links/abc.json'))).toBe(SEED['links/abc.json']);
    expect(w.legacy.blobs.has('templates/t1/deck.json')).toBe(false);
    expect(w.legacy.blobs.has('system/stray.json')).toBe(true);
    // v1 again: the reads move first, the writes OPEN_AFTER_MS later, both on the public store
    expect(text(await app.get('links/new.json'))).toBe('v2 new');
    await expect(app.put('links/new.json', body('x'), { overwrite: true })).rejects.toMatchObject({
      name: 'StorageFrozenError',
    });
    w.later(OPEN_AFTER_MS);
    await app.put('links/new.json', body('v1 again'), { overwrite: true });
    expect(text(await w.legacy.get('links/new.json'))).toBe('v1 again');
    expect(text(await w.documents.get('links/new.json'))).toBe('v2 new');
  });

  it('refuses on a shared store, before a switch, and after delete began', async () => {
    const shared = world({ shared: true });
    await shared.seed();
    await window(shared);
    await expect(shared.run('rollback')).rejects.toThrow(/runs on production alone/);
    const before = world();
    await before.seed();
    await before.run('freeze');
    await expect(before.run('rollback')).rejects.toThrow(/after a recorded switch/);
    const deleted = world();
    await deleted.seed();
    await window(deleted);
    const progress = { ...deleted.progress(), deleteStartedAt: NOW };
    await deleted.documents.put(MIGRATION_PROGRESS, body(JSON.stringify(progress)), {
      overwrite: true,
    });
    await expect(deleted.run('rollback')).rejects.toThrow(/delete began at/);
  });

  it('ends a failed rollback with unfreeze, back on v2', async () => {
    const w = world();
    await w.seed();
    await window(w);
    await w.run('rollback');
    expect(await w.run('unfreeze')).toMatchObject({ state: 'v2', frozen: false });
  });
});

describe('rekey', () => {
  const OWNER = 'usr_owner';

  async function keyed() {
    const w = world();
    await w.seed();
    // gt-brand's record holds the derived key; q4's a key of its own, readable by URL on v1
    await blobAccessStore(w.legacy).write(
      'gt-brand',
      newDeckRecord('gt-brand', OWNER, legacyAssetKey('gt-brand'), NOW),
    );
    await blobAccessStore(w.legacy).write(
      'q4',
      newDeckRecord('q4', OWNER, 'PublicKey0000000000000', NOW),
    );
    const { switched } = await window(w);
    opens(w, switched);
    return w;
  }

  it("gives each deck a key of the environment's own, its twins copied under it first", async () => {
    const w = await keyed();
    const keys = ['GtBrandKey000000000000', 'Q4OwnKey00000000000000'];
    const minted: string[] = [];
    const first = await w.run('rekey', {
      newKey: () => (minted.push(keys[minted.length] ?? 'x'), keys[minted.length - 1] ?? 'x'),
    });
    expect(first).toMatchObject({ done: true, processed: 2, rowCount: 0 });
    const records = blobAccessStore(w.documents);
    expect((await records.read('gt-brand'))?.record.assetKey).toBe(keys[0]);
    const q4Key = (await records.read('q4'))?.record.assetKey;
    expect(q4Key).toBe(keys[1]);
    expect(text(await w.legacy.get(`d/gt-brand/${keys[0]}/assets/mark.ab12.png`))).toBe('png-mark');
    expect(text(await w.legacy.get(`d/q4/${keys[1]}/assets/photo.cd34.webp`))).toBe('webp-photo');
    // the public records keep their keys; the private ones are the environment's own
    expect((await blobAccessStore(w.legacy).read('q4'))?.record.assetKey).toBe(
      'PublicKey0000000000000',
    );
    // the rollback waits for a pass after the twin key caches
    expect(first.rekeyAfter).not.toBeNull();
    await expect(w.run('rollback')).rejects.toThrow(/run rekey from/);
    // an instance that still read the old key wrote a twin at the old place
    await w.legacy.put('decks/gt-brand/assets/late.9a9a.png', body('late'), { overwrite: false });
    const early = await w.run('rekey', {
      newKey: () => {
        throw new Error('no new key');
      },
    });
    expect(early.rekeyAfter).toBe(first.rekeyAfter);
    w.t.now = Date.parse(first.rekeyAfter ?? '');
    const settled = await w.run('rekey', {
      newKey: () => {
        throw new Error('no new key');
      },
    });
    expect(settled).toMatchObject({ done: true, rekeyAfter: null, rowCount: 0 });
    expect(text(await w.legacy.get(`d/gt-brand/${keys[0]}/assets/late.9a9a.png`))).toBe('late');
    expect(REKEY_SETTLE_MS).toBe(10 * 60_000 + 120_000);
  });

  it('refuses before the switch and while frozen', async () => {
    const w = world();
    await w.seed();
    await expect(w.run('rekey')).rejects.toThrow(/after a recorded switch/);
    await window(w);
    await expect(w.run('rekey')).rejects.toThrow(/frozen/);
  });
});

describe('delete', () => {
  it('waits for its preconditions, then removes the old twins of keyed decks and each public document of the plan', async () => {
    const w = world();
    await w.seed();
    await blobAccessStore(w.legacy).write(
      'gt-brand',
      newDeckRecord('gt-brand', 'usr_o', legacyAssetKey('gt-brand'), NOW),
    );
    const { switched } = await window(w);
    const switchedAt = Date.parse(switched.switchedAt ?? '');
    opens(w, switched);
    const backup = new Date(switchedAt + 3_600_000).toISOString();
    const rekey = await w.run('rekey', { newKey: () => 'GtBrandKey000000000000' });
    await expect(w.run('delete', { backupAt: backup })).rejects.toThrow(
      /run verify on layout v2 first/,
    );
    // a writer that ran v1 after the switch
    await w.legacy.put('links/abc.json', body('stray v1'), { overwrite: true });
    const verify = await w.run('verify');
    expect(verify.rows).toEqual([
      expect.stringMatching(
        /^links\/abc.json: planned "\w+", found "\w+"; written on the public store since the switch/,
      ),
    ]);
    await expect(w.run('delete', { backupAt: backup })).rejects.toThrow(/run rekey until a pass/);
    w.t.now = Date.parse(rekey.rekeyAfter ?? '');
    expect(await w.run('rekey')).toMatchObject({ rekeyAfter: null });
    await expect(w.run('delete', { backupAt: backup })).rejects.toThrow(
      /waits a day after the switch/,
    );
    w.t.now = switchedAt + DELETE_AFTER_SWITCH_MS;
    await expect(w.run('delete')).rejects.toThrow(/--i-have-a-backup/);
    await expect(w.run('delete', { backupAt: 'yesterday' })).rejects.toThrow(/wants an ISO time/);
    await expect(w.run('delete', { backupAt: new Date(switchedAt).toISOString() })).rejects.toThrow(
      /at or before the switch/,
    );
    await expect(
      w.run('delete', { backupAt: new Date(w.t.now + 1).toISOString() }),
    ).rejects.toThrow(/later than now/);
    const gone = await w.run('delete', { backupAt: backup });
    expect(gone).toMatchObject({
      done: true,
      rows: [expect.stringMatching(/^links\/abc.json: .*; delete kept it$/)],
    });
    expect(text(await w.legacy.get('d/gt-brand/GtBrandKey000000000000/assets/mark.ab12.png'))).toBe(
      'png-mark',
    );
    for (const path of Object.keys(SEED)) {
      const kept = isPublicPath(path) && path !== 'decks/gt-brand/assets/mark.ab12.png';
      expect(w.legacy.blobs.has(path), path).toBe(kept || path === 'links/abc.json');
    }
    // every document still reads from the private store
    for (const path of DOCUMENTS) expect(text(await w.instance().get(path)), path).toBe(SEED[path]);
    await expect(w.run('rollback')).rejects.toThrow(/delete began/);
    const shared = world({ shared: true });
    await shared.seed();
    await window(shared);
    await expect(shared.run('delete', { backupAt: backup })).rejects.toThrow(
      /runs on production alone/,
    );
  });
});

describe("a preview's window on the shared public store", () => {
  it('snapshots the public documents from the dual read record, never writing the public store', async () => {
    const w = world({ shared: true });
    await w.seed();
    const old = { schemaVersion: 1, layout: 'v1', dualRead: true, rollback: false, decks: [] };
    await w.documents.put(MIGRATION_META, body(JSON.stringify(old)), { overwrite: true });
    await w.documents.put('users/u1/decks.json', body('preview list'), { overwrite: true });
    await w.documents.put('links/preview.json', body('preview link'), { overwrite: true });
    const preview = w.instance();
    const frozen = await w.run('freeze');
    expect(w.meta()).toMatchObject({ state: 'dual', layout: 'v2' });
    await expect(preview.put('links/x.json', body('x'), { overwrite: true })).rejects.toMatchObject(
      { name: 'StorageFrozenError' },
    );
    expect(text(await preview.get('links/preview.json'))).toBe('preview link');
    w.t.now = Date.parse(frozen.settlesAt ?? '');
    await w.run('plan');
    // production goes on writing the public store during the preview's window: the copy takes a
    // version written after the plan (the read of the planned etag gives up), and production
    // writes that document again after the copy
    await w.legacy.put('decks/index.json', body('production before the copy'), { overwrite: true });
    await w.run('copy');
    await w.legacy.put('decks/index.json', body('production after the copy'), { overwrite: true });
    expect(text(await w.documents.get('decks/index.json'))).toBe('production before the copy');
    await w.legacy.put('links/abc.json', body('production edit'), { overwrite: true });
    await w.legacy.del(['vitals/v.json']);
    await w.legacy.put('links/later.json', body('production new'), { overwrite: true });
    w.later(LIST_LAG_MS);
    const verify = await w.run('verify');
    expect(verify).toMatchObject({ clean: true, done: true });
    expect(verify.note).toMatch(
      /^3 planned documents the other environment changed or removed since the plan; 1 more public documents; 15 private documents$/,
    );
    const switched = await w.run('switch');
    opens(w, switched);
    expect(text(await preview.get('users/u1/decks.json'))).toBe(SEED['users/u1/decks.json']);
    expect(text(await preview.get('links/preview.json'))).toBe('preview link');
    expect(text(await preview.get('links/later.json'))).toBeNull();
    await preview.put('links/x.json', body('x'), { overwrite: true });
    expect(w.documents.blobs.has('links/x.json')).toBe(true);
    const production = new Set([
      'decks/index.json',
      'links/abc.json',
      'vitals/v.json',
      'links/later.json',
    ]);
    expect(w.publicWrites().filter((c) => !production.has(c.pathname))).toEqual([]);
  });
});

describe('a twin removal on a shared store', () => {
  it('leaves only from under a key the public record does not hold, never from the old place', async () => {
    const store = memoryBlobClient('https://public.local');
    for (const path of ['decks/x/assets/a.png', 'd/x/PUBLIC/assets/a.png', 'd/x/MINE/assets/a.png'])
      await store.put(path, body('a'), { overwrite: true });
    const removing = async (key: string) => {
      const keyOf = async () => key;
      await keyedTwinsClient(store, keyOf, { sharedKeyOf: async () => 'PUBLIC' }).del([
        'decks/x/assets/a.png',
      ]);
    };
    await removing('PUBLIC');
    expect([...store.blobs.keys()].sort()).toEqual([
      'd/x/MINE/assets/a.png',
      'd/x/PUBLIC/assets/a.png',
      'decks/x/assets/a.png',
    ]);
    await removing('MINE');
    expect([...store.blobs.keys()].sort()).toEqual([
      'd/x/PUBLIC/assets/a.png',
      'decks/x/assets/a.png',
    ]);
  });
});

describe('the keyed twins (hardening K1#3)', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9, 9]);

  function keyed(key: string | null, store = memoryBlobClient('https://store.public.local')) {
    const keyOf = twinKeyResolver(async (deckId) => {
      return deckId === 'fresh' && key !== null
        ? { deckId, assetKey: key }
        : { deckId, assetKey: legacyAssetKey(deckId) };
    });
    return { store, client: keyedTwinsClient(store, keyOf) };
  }

  it("writes a new deck's twin under its key, and the URL cannot be derived from the id and the name", async () => {
    const key = newAssetKey();
    const { store, client } = keyed(key);
    const put = await client.put('decks/fresh/assets/logo.ab12cd34.png', png, {
      overwrite: false,
      contentType: 'image/png',
    });
    // the caller's name comes back; the object and its URL are the keyed ones
    expect(put.pathname).toBe('decks/fresh/assets/logo.ab12cd34.png');
    expect(put.url).toBe(`https://store.public.local/d/fresh/${key}/assets/logo.ab12cd34.png`);
    expect(put.url).toContain(key);
    expect([...store.blobs.keys()]).toEqual([`d/fresh/${key}/assets/logo.ab12cd34.png`]);
    // nothing answers at the address the id and the file name make
    expect(await store.head('decks/fresh/assets/logo.ab12cd34.png')).toBeNull();
    // the caller reads, lists and removes it by its own name
    expect((await client.head('decks/fresh/assets/logo.ab12cd34.png'))?.url).toBe(put.url);
    expect((await client.get('decks/fresh/assets/logo.ab12cd34.png'))?.bytes).toEqual(png);
    expect((await client.list('decks/fresh/assets/')).map((e) => e.pathname)).toEqual([
      'decks/fresh/assets/logo.ab12cd34.png',
    ]);
    expect((await client.list('decks/fresh/')).map((e) => e.pathname)).toEqual([
      'decks/fresh/assets/logo.ab12cd34.png',
    ]);
    await client.del(['decks/fresh/assets/logo.ab12cd34.png']);
    expect(store.blobs.size).toBe(0);
  });

  it('passes a deck without a key, documents and other prefixes through unchanged', async () => {
    const { store, client } = keyed(null);
    await client.put('decks/old/assets/a.png', png, { overwrite: false });
    await client.put('decks/fresh/deck.json', png, { overwrite: true });
    await client.put('exports/fresh/job/x.pdf', png, { overwrite: true });
    expect([...store.blobs.keys()].sort()).toEqual([
      'decks/fresh/deck.json',
      'decks/old/assets/a.png',
      'exports/fresh/job/x.pdf',
    ]);
    expect((await client.head('decks/old/assets/a.png'))?.url).toBe(
      'https://store.public.local/decks/old/assets/a.png',
    );
  });

  it('reads a twin left at the old place until it moves, and the key wins a listing', async () => {
    const key = newAssetKey();
    const { store, client } = keyed(key);
    // written before the key, under the old name
    await store.put('decks/fresh/assets/left.png', png, { overwrite: false });
    await store.put('decks/fresh/assets/both.png', png, { overwrite: false });
    await store.put(`d/fresh/${key}/assets/both.png`, png, { overwrite: false });
    expect((await client.get('decks/fresh/assets/left.png'))?.entry.url).toBe(
      'https://store.public.local/decks/fresh/assets/left.png',
    );
    const listed = await client.list('decks/fresh/assets/');
    expect(listed.map((e) => [e.pathname, e.url])).toEqual([
      ['decks/fresh/assets/both.png', `https://store.public.local/d/fresh/${key}/assets/both.png`],
      ['decks/fresh/assets/left.png', 'https://store.public.local/decks/fresh/assets/left.png'],
    ]);
    // a removal by name takes both places
    await client.del(['decks/fresh/assets/both.png', 'decks/fresh/assets/left.png']);
    expect(store.blobs.size).toBe(0);
  });

  it('reads a key once per deck, and a failed read is asked again', async () => {
    let fail = true;
    const reads: string[] = [];
    const keyOf = twinKeyResolver(async (deckId) => {
      reads.push(deckId);
      if (fail) throw new Error('store down');
      return { deckId, assetKey: 'AbCdEfGhIjKlMnOpQrStUv' };
    });
    await expect(keyOf('fresh')).rejects.toThrow('store down');
    fail = false;
    expect(await Promise.all([keyOf('fresh'), keyOf('fresh')])).toEqual([
      'AbCdEfGhIjKlMnOpQrStUv',
      'AbCdEfGhIjKlMnOpQrStUv',
    ]);
    expect(await keyOf('fresh')).toBe('AbCdEfGhIjKlMnOpQrStUv');
    expect(reads).toEqual(['fresh', 'fresh']);
  });

  it('keeps the keyed twins public on the split client', async () => {
    const key = newAssetKey();
    const legacy = memoryBlobClient('https://public.local');
    const documents = memoryBlobClient('https://private.local');
    await putLayoutRecord(documents, { state: 'v2' });
    const split = splitBlobClient({ legacy, documents }, { ttlMs: 0 });
    const twins = keyedTwinsClient(
      split,
      twinKeyResolver(async () => ({ deckId: 'fresh', assetKey: key })),
    );
    await twins.put('decks/fresh/assets/x.png', png, { overwrite: false });
    expect([...legacy.blobs.keys()]).toEqual([`d/fresh/${key}/assets/x.png`]);
    expect(documents.blobs.has(`d/fresh/${key}/assets/x.png`)).toBe(false);
  });
});

// Hardening K1#4 (docs/hardening/HARDENING.md 4.1; DATA-2): `rekey` gives every deck with a record
// a random key of its own, copies its twins under `d/<id>/<assetKey>/` verified by etag and only
// then writes the key; `delete` makes a last copy of any twin written at the old place since and
// removes `decks/<id>/assets/`; a deck without a record keeps its twins; a re-run changes nothing.
