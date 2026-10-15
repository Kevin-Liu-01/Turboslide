// The simulation of the storage migration's window (HR-K1#4b; docs/hosting.md section 10), on the
// fake stores in virtual time: one public store shared by production and the preview, a private
// store each, three production instances and two preview instances, each with its own layout
// cache and a clock skewed by up to 3 s, writing, removing and reading documents while each
// environment's operator runs the window (and on production, sometimes, the rollback), stops at a
// random step, or ends the run with unfreeze. Every store call takes a random time; a document
// write past DOCUMENT_WRITE_CAP_MS fails at its client and lands up to LANDING_MS later. Checked
// per seed:
//   1. no accepted write is lost: each document reads, at the end, as the last accepted write of
//      its environment that landed, or a write that failed at its client and landed after it
//      (the preview: from its switch on, since its window takes the public documents);
//   2. nothing reads a private store's documents before its switch (production; a preview that
//      started on v1), and a preview never writes a public document;
//   3. no production instance writes a public document after the switch, until a rollback ends;
//   4. every freeze ends: no record's freeze lasts past FREEZE_LIMIT_MS, and at the end no record
//      refuses writes;
//   5. a rollback restores every write made on v2 (1 read after the rollback);
//   6. no document write of an instance lands while a freeze holds after its settle, nor from a
//      switch until its writes open.
// `node packages/store/src/migrate-sim.ts <from> <to>` runs the seeds in [from, to) and prints one
// JSON line; migrate-sim.test.ts runs a share of them.
import { memoryBlobClient } from './blob-fake.ts';
import type { FakeBlobClient } from './blob-fake.ts';
import type { BlobCallOptions, BlobClient, BlobEntry, BlobPutOptions } from './blob-store.ts';
import {
  DOCUMENT_WRITE_CAP_MS,
  FREEZE_LIMIT_MS,
  LANDING_MS,
  LIST_LAG_MS,
  MIGRATION_META,
  OPEN_AFTER_MS,
  closedAt,
  isMigrationPath,
  isPublicPath,
  readLayout,
  runMigrationStep,
  splitBlobClient,
} from './migrate.ts';
import type { MigrationResult, MigrationStep } from './migrate.ts';

// ---------------------------------------------------------------------------------------------
// Virtual time

export type VirtualTime = {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  /** a signal that aborts `ms` from now in virtual time */
  abortAfter: (ms: number) => AbortSignal;
  /** runs `main` to its end, moving the clock to the next timer whenever nothing else can run */
  run: <T>(main: () => Promise<T>) => Promise<T>;
};

export function virtualTime(start: number): VirtualTime {
  let now = start;
  let seq = 0;
  const heap: { at: number; seq: number; fire: () => void }[] = [];
  const less = (a: number, b: number) => {
    const x = heap[a]!;
    const y = heap[b]!;
    return x.at < y.at || (x.at === y.at && x.seq < y.seq);
  };
  const swap = (a: number, b: number) => {
    [heap[a], heap[b]] = [heap[b]!, heap[a]!];
  };
  const push = (at: number, fire: () => void) => {
    heap.push({ at, seq: seq++, fire });
    for (let i = heap.length - 1; i > 0 && less(i, (i - 1) >> 1); i = (i - 1) >> 1)
      swap(i, (i - 1) >> 1);
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (top === undefined || last === undefined || heap.length === 0) return top;
    heap[0] = last;
    for (let i = 0; ;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < heap.length && less(l, m)) m = l;
      if (r < heap.length && less(r, m)) m = r;
      if (m === i) return top;
      swap(i, m);
      i = m;
    }
  };
  return {
    now: () => now,
    sleep: (ms) => new Promise((resolve) => push(now + Math.max(0, ms), resolve)),
    abortAfter(ms) {
      const controller = new AbortController();
      push(now + ms, () => controller.abort(new DOMException('The budget ended', 'TimeoutError')));
      return controller.signal;
    },
    async run(main) {
      let settled: { value?: unknown; error?: unknown; failed: boolean } | undefined;
      main().then(
        (value) => (settled = { value, failed: false }),
        (error: unknown) => (settled = { error, failed: true }),
      );
      // a resolved nextTick runs once every microtask queued before it has run, chains included,
      // with no turn of the event loop (a turn costs about a millisecond on a loaded Mac)
      const flush = () => new Promise<void>((resolve) => process.nextTick(resolve));
      for (;;) {
        await flush();
        await flush();
        if (settled !== undefined) break;
        const next = pop();
        if (next === undefined) throw new Error('virtual time: the work waits and no timer is set');
        now = Math.max(now, next.at);
        next.fire();
      }
      if (settled.failed) throw settled.error;
      return settled.value as never;
    },
  };
}

/** A small seeded generator (mulberry32). */
export function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------------------------
// The world

type Env = 'prod' | 'preview';
type Who = Env | 'op-prod' | 'op-preview';
type Store = 'public' | 'prod' | 'preview';
type Op = { env: Env; path: string; value: string | null; accepted: boolean };
type Landed = {
  seq: number;
  who: Who;
  store: Store;
  path: string;
  value: string | null;
  at: number;
  op?: Op;
};

const DOCS = [
  'decks/a/deck.json',
  'decks/a/slides/s1.json',
  'decks/b/deck.json',
  'decks/index.json',
  'users/u1/decks.json',
  'links/l1.json',
  'links/l2.json',
  'templates/t1.json',
  'top.json',
];
const T0 = Date.parse('2026-10-15T20:00:00.000Z');
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type SimReport = {
  seed: number;
  violations: string[];
  /** what the seed did: each operator's last step and outcome, and the writes */
  story: string[];
  writes: number;
  refused: number;
  ms: number;
};

export async function simulate(seed: number): Promise<SimReport> {
  const started = Date.now();
  // thousands of refusals a seed: their stacks are most of the time otherwise
  const stackTraceLimit = Error.stackTraceLimit;
  Error.stackTraceLimit = 0;
  try {
    return await simulateOne(seed, started);
  } finally {
    Error.stackTraceLimit = stackTraceLimit;
  }
}

async function simulateOne(seed: number, started: number): Promise<SimReport> {
  const rng = random(seed * 7919 + 13);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rng() * list.length)]!;
  const between = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo));
  const vt = virtualTime(T0);
  const iso = () => new Date(vt.now()).toISOString();
  const stores: Record<Store, FakeBlobClient> = {
    public: memoryBlobClient('https://public.local', { now: iso }),
    prod: memoryBlobClient('https://prod.local', { now: iso }),
    preview: memoryBlobClient('https://preview.local', { now: iso }),
  };
  const landed: Landed[] = [];
  const reads: { who: Who; store: Store; path: string; at: number }[] = [];
  const records: { store: Store; at: number; raw: Record<string, unknown> }[] = [];
  const story: string[] = [];
  const violations: string[] = [];
  let seq = 0;
  let writes = 0;
  let refused = 0;
  const hot = { until: 0 };

  for (const path of DOCS.slice(0, 7))
    await stores.public.put(path, encoder.encode(`seed:${path}`), { overwrite: true });
  // the preview's record: the dual read window of the migration before HR-K1#4b, or none
  const dualPreview = rng() < 0.5;
  if (dualPreview) {
    const old = { schemaVersion: 1, layout: 'v1', dualRead: true, rollback: false, decks: [] };
    await stores.preview.put(MIGRATION_META, encoder.encode(JSON.stringify(old)), {
      overwrite: true,
    });
    await stores.preview.put('users/u1/decks.json', encoder.encode('preview:old'), {
      overwrite: true,
    });
    await stores.preview.put('links/preview.json', encoder.encode('preview:own'), {
      overwrite: true,
    });
  }
  story.push(dualPreview ? 'preview from the dual read record' : 'preview from no record');

  /** One store as one caller sees it: every call takes its time, and a write lands when it applies. */
  const timed = (store: Store, who: Who, ctx: { op?: Op }): BlobClient => {
    const inner = stores[store];
    const instance = who === 'prod' || who === 'preview';
    const lag = (kind: 'read' | 'write') => {
      const r = rng();
      if (r < 0.7) return between(20, 300);
      if (r < 0.95) return between(300, 3_000);
      return between(3_000, kind === 'write' ? 20_000 : 8_000);
    };
    const aborted = () =>
      Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });
    const read = async <T>(
      path: string,
      signal: AbortSignal | undefined,
      run: () => Promise<T>,
    ) => {
      await vt.sleep(lag('read'));
      if (signal?.aborted) throw aborted();
      reads.push({ who, store, path, at: vt.now() });
      return run();
    };
    const note = (path: string, value: string | null, op: Op | undefined) => {
      landed.push({ seq: seq++, who, store, path, value, at: vt.now(), ...(op ? { op } : {}) });
    };
    const apply = async (path: string, bytes: Uint8Array, options: BlobPutOptions, op?: Op) => {
      const entry = await inner.put(path, bytes, { ...options, signal: undefined });
      if (path === MIGRATION_META)
        records.push({ store, at: vt.now(), raw: JSON.parse(decoder.decode(bytes)) as never });
      else if (!isMigrationPath(path)) note(path, decoder.decode(bytes), op);
      return entry;
    };
    return {
      head: (path, options) => read(path, options?.signal, () => inner.head(path)),
      get: (path, options?: BlobCallOptions) => read(path, options?.signal, () => inner.get(path)),
      list: (prefix, options) => read(`${prefix}*`, options?.signal, () => inner.list(prefix)),
      folders: (prefix, options) =>
        read(`${prefix}*`, options?.signal, () => inner.folders(prefix)),
      files: (prefix, options) =>
        read('<files>', options?.signal, () => inner.files?.(prefix) ?? Promise.resolve([])),
      async put(path, bytes, options): Promise<BlobEntry> {
        const op = ctx.op;
        const ms = lag('write');
        if (instance && !isPublicPath(path) && rng() < 0.01) {
          // the client gives up at its deadline; the store applies the request it got later
          const lands = DOCUMENT_WRITE_CAP_MS + between(1, LANDING_MS);
          void vt.sleep(lands).then(() => apply(path, bytes, options, op).catch(() => undefined));
          await vt.sleep(DOCUMENT_WRITE_CAP_MS);
          throw aborted();
        }
        await vt.sleep(ms);
        if (options.signal?.aborted) {
          // a write the budget cut can still land
          if (rng() < 0.5) await apply(path, bytes, options, op).catch(() => undefined);
          throw aborted();
        }
        return apply(path, bytes, options, op);
      },
      async del(paths, options) {
        const op = ctx.op;
        await vt.sleep(lag('write'));
        if (options?.signal?.aborted) throw aborted();
        await inner.del(paths);
        for (const path of paths) if (!isMigrationPath(path)) note(path, null, op);
      },
    };
  };

  // ------------------------------------------------------------------- the instances and writers
  const skew = () => between(-3_000, 3_001);
  type Instance = { env: Env; client: BlobClient; ctx: { op?: Op }; name: string };
  const instances: Instance[] = [];
  for (const [env, count] of [
    ['prod', 3],
    ['preview', 2],
  ] as const) {
    for (let i = 0; i < count; i += 1) {
      const ctx: { op?: Op } = {};
      const offset = skew();
      const client = splitBlobClient(
        { legacy: timed('public', env, ctx), documents: timed(env, env, ctx) },
        { now: () => vt.now() + offset, sharedPublicStore: env === 'preview' },
      );
      instances.push({ env, client, ctx, name: `${env}${i}` });
    }
  }
  const ops: Op[] = [];
  const done = { operators: 0 };
  const writer = async (instance: Instance) => {
    let n = 0;
    while (done.operators < 2) {
      await vt.sleep(vt.now() < hot.until ? between(200, 2_000) : between(10_000, 60_000));
      const path = pick(DOCS);
      const r = rng();
      if (r < 0.3) {
        await instance.client.get(path).catch(() => undefined);
        continue;
      }
      const value = r < 0.85 ? `${instance.name}:${n++}` : null;
      const op: Op = { env: instance.env, path, value, accepted: false };
      instance.ctx.op = op;
      ops.push(op);
      writes += 1;
      try {
        if (value === null) await instance.client.del([path]);
        else await instance.client.put(path, encoder.encode(value), { overwrite: true });
        op.accepted = true;
      } catch (error) {
        if ((error as Error).name === 'StorageFrozenError') refused += 1;
      } finally {
        instance.ctx.op = undefined;
      }
    }
  };

  // ------------------------------------------------------------------------------ the operators
  const operator = async (env: Env) => {
    const who: Who = env === 'prod' ? 'op-prod' : 'op-preview';
    const offset = skew();
    const clock = () => vt.now() + offset;
    const clients = { legacy: timed('public', who, {}), documents: timed(env, who, {}) };
    const shared = env === 'preview';
    // the step after which this operator stops for good, if it does
    const stopAfter = rng() < 0.2 ? between(0, 6) : 99;
    const abandon = rng() < 0.1;
    let steps = 0;
    const call = async (step: MigrationStep): Promise<MigrationResult> => {
      // the writers race each record write of the window: the freeze, the switch, a rollback's
      hot.until = vt.now() + 15_000;
      for (let tries = 0; ; tries += 1) {
        try {
          return await runMigrationStep(clients, step, {
            clock,
            sleep: vt.sleep,
            abortAfter: vt.abortAfter,
            budgetMs: between(20_000, 120_000),
            concurrency: between(1, 5),
            sharedPublicStore: shared,
          });
        } catch (error) {
          const message = (error as Error).message;
          if (
            tries > 40 ||
            !/holds the migration|settles at|run verify after it|did not answer|aborted/.test(
              message,
            )
          )
            throw error;
          await vt.sleep(15_000);
        }
      }
    };
    const until = async (iso: string | null) => {
      if (iso !== null) await vt.sleep(Math.max(0, Date.parse(iso) - clock()) + 1_000);
    };
    const step = async (name: MigrationStep) => {
      if (steps++ > stopAfter) throw new Error(`stopped before ${name}`);
      return call(name);
    };
    try {
      await vt.sleep(env === 'prod' ? between(0, 60_000) : between(0, 600_000));
      await step('plan');
      const frozen = await step('freeze');
      await until(frozen.settlesAt);
      await step('plan');
      for (let i = 0; ; i += 1) {
        const copy = await step('copy');
        if (copy.done) break;
        if (i > 20) throw new Error('copy did not end');
      }
      await vt.sleep(LIST_LAG_MS + 1_000);
      const verify = await step('verify');
      if (!verify.clean) return story.push(`${env}: verify found ${verify.rowCount} rows`);
      if (abandon) {
        await step('unfreeze');
        return story.push(`${env}: unfroze before the switch`);
      }
      await step('switch');
      story.push(`${env}: switched`);
      if (env === 'preview' || rng() < 0.3) return;
      await vt.sleep(between(30_000, 300_000));
      const first = await step('rollback');
      await until(first.settlesAt);
      for (let i = 0; i < 10; i += 1) if ((await step('rollback')).done) break;
      story.push(`${env}: rolled back`);
    } catch (error) {
      story.push(`${env}: ${(error as Error).message}`);
    } finally {
      done.operators += 1;
    }
  };

  await vt.run(async () => {
    await Promise.all([
      operator('prod'),
      operator('preview'),
      ...instances.map((instance) => writer(instance)),
    ]);
    // every freeze ends by itself; then the stores settle
    await vt.sleep(FREEZE_LIMIT_MS + OPEN_AFTER_MS + LANDING_MS + 60_000);
  });

  // ------------------------------------------------------------------------------ the checks
  const end = vt.now();
  const fail = (line: string) => violations.push(line);
  const recordsOf = (store: Store) => records.filter((r) => r.store === store);
  for (const r of records) {
    const frozen = r.raw.frozen as { since: string; expiresAt: string } | undefined;
    if (frozen && Date.parse(frozen.expiresAt) - Date.parse(frozen.since) > FREEZE_LIMIT_MS)
      fail(`4: ${r.store} wrote a freeze past its limit at ${r.at - T0}`);
  }
  const switchAt = (store: Store): number | null =>
    recordsOf(store).find((r) => r.raw.state === 'v2')?.at ?? null;
  const rollbackAt = (store: Store): number | null => {
    const switched = switchAt(store);
    return (
      recordsOf(store).find((r) => switched !== null && r.at > switched && r.raw.state === 'v1')
        ?.at ?? null
    );
  };
  for (const env of ['prod', 'preview'] as const) {
    const { record } = await readLayout(stores[env], new AbortController().signal);
    if (closedAt(record, end)) fail(`4: ${env} still refuses writes at the end`);
    const switched = switchAt(env);
    const fresh = splitBlobClient(
      { legacy: stores.public, documents: stores[env] },
      { now: () => end, sharedPublicStore: env === 'preview' },
    );
    // 1 and 5: no accepted write is lost
    for (const path of DOCS) {
      const final = await fresh
        .get(path)
        .then((got) => (got === null ? null : decoder.decode(got.bytes)));
      const mine = landed.filter(
        (l) =>
          l.op?.env === env &&
          l.path === path &&
          (env === 'prod' || (switched !== null && l.at > switched)),
      );
      const last = mine.filter((l) => l.op?.accepted).at(-1);
      if (last === undefined) continue;
      const allowed = new Set([
        last.value,
        ...mine.filter((l) => l.seq > last.seq && !l.op?.accepted).map((l) => l.value),
      ]);
      if (!allowed.has(final))
        fail(
          `1: ${env} ${path} reads ${final} at the end; its last accepted write was ${last.value} at ${last.at - T0} on ${last.store}`,
        );
    }
    // 2: no read of the private store's documents before its switch
    if (env === 'prod' || !dualPreview) {
      const early = reads.find(
        (r) =>
          r.who === env &&
          r.store === env &&
          r.path !== '<files>' &&
          !isMigrationPath(r.path) &&
          (switched === null || r.at < switched),
      );
      if (early !== undefined)
        fail(
          `2: ${env} read ${early.path} from its private store at ${early.at - T0}, before its switch`,
        );
    }
  }
  const previewPublic = landed.find(
    (l) =>
      (l.who === 'preview' || l.who === 'op-preview') &&
      l.store === 'public' &&
      !isPublicPath(l.path),
  );
  if (previewPublic !== undefined)
    fail(
      `2: the preview wrote the public document ${previewPublic.path} at ${previewPublic.at - T0}`,
    );
  // 6: no write lands while a settled freeze holds, nor between a switch and its open
  for (const env of ['prod', 'preview'] as const) {
    const mine = recordsOf(env);
    mine.forEach((record, i) => {
      const next = mine[i + 1]?.at ?? end;
      const frozen = record.raw.frozen as { settlesAt: string; expiresAt: string } | undefined;
      const opensAt =
        typeof record.raw.opensAt === 'string' ? Date.parse(record.raw.opensAt) - 3_000 : null;
      const from = frozen ? Math.max(record.at, Date.parse(frozen.settlesAt)) : record.at;
      const to = frozen
        ? Math.min(next, Date.parse(frozen.expiresAt) - 3_000)
        : Math.min(next, opensAt ?? record.at);
      const inside = landed.find(
        (l) => l.who === env && l.at > from && l.at < to && !isPublicPath(l.path),
      );
      if (inside !== undefined)
        fail(
          `6: a ${env} write of ${inside.path} landed at ${inside.at - T0}, inside the closed record written at ${record.at - T0}`,
        );
    });
  }
  // 3: no production instance writes a public document from the switch until a rollback ends
  const switched = switchAt('prod');
  if (switched !== null) {
    const back = rollbackAt('prod') ?? Number.POSITIVE_INFINITY;
    const late = landed.find(
      (l) =>
        l.who === 'prod' &&
        l.store === 'public' &&
        !isPublicPath(l.path) &&
        l.at > switched &&
        l.at < back,
    );
    if (late !== undefined)
      fail(
        `3: a production instance wrote ${late.path} to the public store at ${late.at - T0}, after the switch at ${switched - T0}`,
      );
  }
  return { seed, violations, story, writes, refused, ms: Date.now() - started };
}

/** The seeds in [from, to), with the violations and the time. */
export async function simulateSeeds(from: number, to: number) {
  const failed: SimReport[] = [];
  const stories = new Map<string, number>();
  let writes = 0;
  let refused = 0;
  const began = Date.now();
  for (let seed = from; seed < to; seed += 1) {
    const report = await simulate(seed);
    writes += report.writes;
    refused += report.refused;
    for (const line of report.story) stories.set(line, (stories.get(line) ?? 0) + 1);
    if (report.violations.length > 0) failed.push(report);
  }
  return {
    from,
    to,
    failed,
    writes,
    refused,
    stories: Object.fromEntries(stories),
    ms: Date.now() - began,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [from = '0', to = '100'] = process.argv.slice(2);
  const result = await simulateSeeds(Number(from), Number(to));
  console.log(
    JSON.stringify({
      ...result,
      failed: result.failed.slice(0, 5),
      failedCount: result.failed.length,
    }),
  );
}
