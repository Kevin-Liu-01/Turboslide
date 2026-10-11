// The checkpoint route's work over a Blob store (checkpoint.ts `answerCheckpoint`; docs/CLOUDFLARE.md
// 3.5, 3.6.1): the store is the tree's BlobStore over the in-memory Blob fake with the worked deck
// pushed, so every record carries its origin as on production. The hardening round's pins of the
// route live here (docs/hardening/HARDENING.md 4.6): a post retried after its answer was lost is
// answered from the log and leaves the store at one revision (HR-RT#1); a call that asks for the
// bound starts runs for 15 s at most and answers the seq it reached (HR-RT#4); an error is 404
// `gone` only for a deck the store does not hold, and 500 otherwise (HR-RT#7); a sidecar write
// the store did not take answers 503, and a comment the sidecar refused is named (HR-RT#8).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Entry } from '@turboslide/realtime/channel';
import type { DeckDocument } from '@turboslide/schema/deck';
import { WORKED_DECK, WORKED_SLIDES } from '@turboslide/schema/fixtures';
import { canonicalJson } from '@turboslide/schema/json';
import type { Author, Mutation } from '@turboslide/schema/mutations';
import { memoryBlobClient } from '@turboslide/store/blob-fake';
import type { FakeBlobClient } from '@turboslide/store/blob-fake';
import { openBlobStore, pushDeckDir } from '@turboslide/store/blob-store';
import type { BlobStore } from '@turboslide/store/blob-store';

import { CHECKPOINT_BUDGET_MS } from '@turboslide/realtime/frames';
import type { BlobClient } from '@turboslide/store/blob-store';

import { DeckGoneError } from '@turboslide/schema/errors';

import { answerCheckpoint, checkpointErrorReply } from './checkpoint';
import type { CheckpointRouteDeps, CommentsApplier } from './checkpoint';

const DECK = 'gt-brand';
const SLIDE = 'content-rule';
const BLOCK = 'p1';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const A = 'a'.repeat(32);
const B = 'b'.repeat(32);
const AUTHOR_A: Author = { kind: 'human', name: 'Titanium 471', principalId: 'anon_a' };
const AUTHOR_B: Author = { kind: 'human', name: 'Cobalt 118', principalId: 'anon_b' };

function splice(at: number, insert: string): Mutation {
  return {
    op: 'text.splice',
    slideId: SLIDE,
    blockId: BLOCK,
    path: '/text',
    at,
    remove: 0,
    insert,
  };
}

function entry(seq: number, clientId: string, n: number, mutation: Mutation): Entry {
  return {
    seq,
    rev: 0,
    kind: 'edit',
    author: clientId === A ? AUTHOR_A : AUTHOR_B,
    clientId,
    opId: `${clientId}:${n}`,
    mutations: [mutation],
    at: '2026-10-11T10:00:00.000Z',
  };
}

function paragraph(document: DeckDocument): string {
  const slide = document.slides[SLIDE] as unknown as {
    slots: Record<string, { id: string; text?: unknown }[]>;
  };
  const block = Object.values(slide.slots)
    .flat()
    .find((row) => row.id === BLOCK);
  return String(block?.text ?? '');
}

const NO_COMMENTS: CommentsApplier = { apply: async () => ({ revision: 0, threadIds: [] }) };

describe('the checkpoint route over a Blob store', () => {
  let root: string;
  let fake: FakeBlobClient;
  let store: BlobStore;
  let start: string;
  const lines: string[] = [];

  const deps = (extra: Partial<CheckpointRouteDeps> = {}): CheckpointRouteDeps => ({
    store,
    comments: NO_COMMENTS,
    shifts: async () => [],
    log: (line) => lines.push(line),
    ...extra,
  });

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'turboslide-checkpoint-route-'));
    const seed = join(root, 'seed', DECK);
    mkdirSync(join(seed, 'slides'), { recursive: true });
    mkdirSync(join(seed, 'assets'), { recursive: true });
    writeFileSync(join(seed, 'deck.json'), canonicalJson(WORKED_DECK));
    for (const slide of WORKED_SLIDES)
      writeFileSync(join(seed, 'slides', `${slide.id}.json`), canonicalJson(slide));
    for (const asset of Object.values(WORKED_DECK.assets))
      for (const twin of Object.values(asset.twins)) writeFileSync(join(seed, twin), PNG);
    fake = memoryBlobClient();
    await pushDeckDir(fake, DECK, seed, { overwrite: false });
    store = openBlobStore({
      client: fake,
      deckId: DECK,
      dir: join(root, 'mirror', DECK),
      syncTtlMs: 0,
      pollMs: 20,
      snapshotGraceMs: 0,
    });
    start = paragraph((await store.read()).document);
    lines.length = 0;
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('answers the same run posted twice from the first record and leaves the store at one revision', async () => {
    const revision = await store.revision();
    const body = { revision, entries: [entry(1, A, 1, splice(start.length, ' z'))] };
    const first = await answerCheckpoint(deps(), body);
    expect(first.status).toBe(200);
    const committed = first.body['committed'] as { revision: number }[];
    expect(committed).toHaveLength(1);
    expect(first.body['revision']).toBe(revision + 1);
    // the object never read that answer: it posts the same body at its old revision
    const second = await answerCheckpoint(deps(), body);
    expect(second.status).toBe(200);
    expect(second.landed).toBe(0);
    expect((second.body['committed'] as { revision: number }[]).map((r) => r.revision)).toEqual([
      revision + 1,
    ]);
    expect(second.body['revision']).toBe(revision + 1);
    expect(await store.revision()).toBe(revision + 1);
    expect(paragraph((await store.read()).document)).toBe(`${start} z`);
    expect((await store.records()).filter((record) => record.revision > revision)).toHaveLength(1);
  });

  it('commits only the entries a retry adds to the runs its first attempt committed', async () => {
    const revision = await store.revision();
    const end = start.length;
    const a1 = entry(1, A, 1, splice(end, ' a'));
    const b1 = entry(2, B, 1, splice(end + 2, ' b'));
    const first = await answerCheckpoint(deps(), { revision, entries: [a1, b1] });
    expect(first.status).toBe(200);
    expect(await store.revision()).toBe(revision + 2);
    // the retry carries both runs again, B's run grown by one entry since
    const b2 = entry(3, B, 2, splice(end + 4, 'c'));
    const second = await answerCheckpoint(deps(), { revision, entries: [a1, b1, b2] });
    expect(second.status).toBe(200);
    expect(second.landed).toBe(1);
    expect(await store.revision()).toBe(revision + 3);
    expect(paragraph((await store.read()).document)).toBe(`${start} a bc`);
  });

  it('answers 409 when a record above the object’s revision is not its own', async () => {
    const revision = await store.revision();
    const outside = await store.write({
      baseRevision: revision,
      author: { kind: 'agent', name: 'cli' },
      mutations: [splice(0, 'cli ')],
    });
    expect(outside.ok).toBe(true);
    const reply = await answerCheckpoint(deps(), {
      revision,
      entries: [entry(1, A, 1, splice(start.length, ' z'))],
    });
    expect(reply.status).toBe(409);
    expect(reply.body).toMatchObject({ conflict: true, revision: revision + 1 });
    expect(await store.revision()).toBe(revision + 1);
  });

  it('answers 409 when its own lost record and a foreign one are both above its revision', async () => {
    const revision = await store.revision();
    const body = { revision, entries: [entry(1, A, 1, splice(start.length, ' z'))] };
    expect((await answerCheckpoint(deps(), body)).status).toBe(200);
    await store.write({
      baseRevision: revision + 1,
      author: { kind: 'agent', name: 'cli' },
      mutations: [splice(0, 'cli ')],
    });
    const reply = await answerCheckpoint(deps(), body);
    expect(reply.status).toBe(409);
    expect(await store.revision()).toBe(revision + 2);
    expect(paragraph((await store.read()).document)).toBe(`cli ${start} z`);
  });

  it('stops between runs once the object’s call is gone, and the retry commits the rest once', async () => {
    const revision = await store.revision();
    const end = start.length;
    // two authors alternating: four runs, four writes
    const entries = [
      entry(1, A, 1, splice(end, ' a')),
      entry(2, B, 1, splice(end + 2, ' b')),
      entry(3, A, 2, splice(end + 4, ' c')),
      entry(4, B, 2, splice(end + 6, ' d')),
    ];
    const gone = new AbortController();
    let writes = 0;
    const counting = new Proxy(store, {
      get(target, key, receiver) {
        if (key === 'write')
          return async (...args: Parameters<BlobStore['write']>) => {
            const outcome = await target.write(...args);
            writes += 1;
            if (writes === 2) gone.abort();
            return outcome;
          };
        return Reflect.get(target, key, receiver) as unknown;
      },
    });
    const first = await answerCheckpoint(deps({ store: counting, signal: gone.signal }), {
      revision,
      entries,
    });
    expect(first.status).toBe(503);
    expect(await store.revision()).toBe(revision + 2);
    expect(lines.some((line) => line.includes('the call was gone after 2 runs'))).toBe(true);
    const retry = await answerCheckpoint(deps(), { revision, entries });
    expect(retry.status).toBe(200);
    expect(retry.landed).toBe(2);
    expect(await store.revision()).toBe(revision + 4);
    expect(paragraph((await store.read()).document)).toBe(`${start} a b c d`);
  });

  it('starts runs for 15 s at most when asked, answers the seq it reached, and the next calls commit the rest once (HR-RT#4)', async () => {
    // every Blob call waits 160 ms, about a second a record, as reliability.md's S3 measured
    const slow = new Proxy(fake, {
      get(target, key, receiver) {
        const value = Reflect.get(target, key, receiver) as unknown;
        if (typeof value !== 'function') return value;
        return async (...args: unknown[]) => {
          await new Promise((resolve) => setTimeout(resolve, 160));
          return (value as (...rest: unknown[]) => unknown).apply(target, args);
        };
      },
    }) as BlobClient;
    const slowStore = openBlobStore({
      client: slow,
      deckId: DECK,
      dir: join(root, 'mirror-slow', DECK),
      syncTtlMs: 0,
      pollMs: 20,
      snapshotGraceMs: 0,
    });
    let revision = await slowStore.revision();
    const first = revision;
    const end = paragraph((await slowStore.read()).document).length;
    // 40 runs: two authors alternating, one word each
    const entries: Entry[] = [];
    let at = end;
    for (let i = 1; i <= 40; i += 1) {
      const word = ` w${i}`;
      entries.push(entry(i, i % 2 === 1 ? A : B, i, splice(at, word)));
      at += word.length;
    }
    // each run's length, to bound the call by the budget plus the run it started last
    const runs: number[] = [];
    const timed = new Proxy(slowStore, {
      get(target, key, receiver) {
        if (key === 'write')
          return async (...args: Parameters<BlobStore['write']>) => {
            const at0 = Date.now();
            const outcome = await target.write(...args);
            runs.push(Date.now() - at0);
            return outcome;
          };
        return Reflect.get(target, key, receiver) as unknown;
      },
    });
    const started = Date.now();
    const reply = await answerCheckpoint(deps({ store: timed, budgetMs: CHECKPOINT_BUDGET_MS }), {
      revision,
      entries,
    });
    const elapsed = Date.now() - started;
    expect(reply.status).toBe(200);
    const reached = reply.body['toSeq'] as number;
    expect(reached).toBeGreaterThan(0);
    expect(reached).toBeLessThan(40);
    expect(reply.landed).toBe(reached);
    // the call ended at the first run boundary past the budget
    expect(elapsed).toBeLessThan(CHECKPOINT_BUDGET_MS + Math.max(...runs) + 2000);
    lines.push(
      `HR-RT#4 reading: ${reached} of 40 runs in ${elapsed} ms, the longest ${Math.max(...runs)} ms`,
    );
    // the object covers up to `toSeq` and posts the rest at the revision the answer named
    let rest = entries.filter((row) => row.seq > reached);
    revision = reply.body['revision'] as number;
    for (let call = 0; call < 10 && rest.length > 0; call += 1) {
      const next = await answerCheckpoint(
        deps({ store: slowStore, budgetMs: CHECKPOINT_BUDGET_MS }),
        {
          revision,
          entries: rest,
        },
      );
      expect(next.status).toBe(200);
      const through = next.body['toSeq'] as number | undefined;
      rest = through === undefined ? [] : rest.filter((row) => row.seq > through);
      revision = next.body['revision'] as number;
    }
    expect(rest).toEqual([]);
    expect(await slowStore.revision()).toBe(first + 40);
    expect(paragraph((await slowStore.read()).document)).toBe(
      `${start}${entries.map((row) => (row.mutations?.[0] as { insert: string }).insert).join('')}`,
    );
    console.log(lines.filter((line) => line.startsWith('HR-RT#4 reading')).join('\n'));
  }, 600_000);

  it('answers a RangeError of the commit 500, and 404 gone only for a deck the store does not hold (HR-RT#7)', async () => {
    const thrown = new RangeError('text.splice: 99 plus 0 is outside a text of 12 characters');
    const kept = await checkpointErrorReply(thrown, DECK, async () => true);
    expect(kept.status).toBe(500);
    expect(kept.body).toMatchObject({ error: 'checkpoint', message: thrown.message });
    expect(kept.body['gone']).toBeUndefined();
    const missing = await checkpointErrorReply(thrown, DECK, async () => false);
    expect(missing).toMatchObject({ status: 404, body: { error: 'not_found', gone: true } });
    const typed = await checkpointErrorReply(new DeckGoneError(DECK), DECK, async () => true);
    expect(typed).toMatchObject({ status: 404, body: { gone: true } });
    // a store that cannot say keeps the tail: the answer is the retry's 500
    const unknown = await checkpointErrorReply(thrown, DECK, async () => {
      throw new Error('the store did not answer');
    });
    expect(unknown.status).toBe(500);
  });

  it('answers 503 when the sidecar write fails, and the retry lands the comment once and the edit from the log (HR-RT#8)', async () => {
    const revision = await store.revision();
    const comment: Entry = {
      seq: 2,
      rev: 0,
      kind: 'comment',
      author: AUTHOR_A,
      clientId: A,
      opId: `${A}:2`,
      comment: { op: 'resolve', threadId: 't1', at: '2026-10-11T10:00:00.000Z', by: 'anon_a' },
      at: '2026-10-11T10:00:00.000Z',
    };
    const body = { revision, entries: [entry(1, A, 1, splice(start.length, ' z')), comment] };
    let calls = 0;
    const landed: unknown[] = [];
    // the Blob store answers the sidecar's push 503 once, then takes it
    const flaky: CommentsApplier = {
      apply: async (entries) => {
        calls += 1;
        if (calls === 1) throw new Error('Vercel Blob: 503 Service Unavailable');
        landed.push(...entries.map((row) => row.comment));
        return { revision: 7, threadIds: ['t1'] };
      },
    };
    const first = await answerCheckpoint(deps({ comments: flaky }), body);
    expect(first.status).toBe(503);
    expect(first.body).toMatchObject({ error: 'comments' });
    const retry = await answerCheckpoint(deps({ comments: flaky }), body);
    expect(retry.status).toBe(200);
    expect(retry.landed).toBe(0);
    expect(retry.body['comments']).toEqual({ revision: 7, threadIds: ['t1'] });
    expect(landed).toEqual([comment.comment]);
    expect(await store.revision()).toBe(revision + 1);
    expect(paragraph((await store.read()).document)).toBe(`${start} z`);
  });

  it('names a comment the sidecar refused, so the object keeps it as a dead letter (HR-RT#8)', async () => {
    const comment: Entry = {
      seq: 1,
      rev: 0,
      kind: 'comment',
      author: AUTHOR_A,
      clientId: A,
      opId: `${A}:1`,
      comment: { op: 'resolve', threadId: 'missing', at: '2026-10-11T10:00:00.000Z', by: 'anon_a' },
      at: '2026-10-11T10:00:00.000Z',
    };
    const refusing: CommentsApplier = {
      apply: async (entries) => ({
        revision: 3,
        threadIds: [],
        refused: entries.map((row) => ({ op: row.comment, message: 'no thread missing' })),
      }),
    };
    const reply = await answerCheckpoint(deps({ comments: refusing }), {
      revision: await store.revision(),
      entries: [comment],
    });
    expect(reply.status).toBe(200);
    expect(reply.body['refusedComments']).toEqual([`${A}:1`]);
  });
});
