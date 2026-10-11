// The checkpoint route's work over a Blob store (checkpoint.ts `answerCheckpoint`; docs/CLOUDFLARE.md
// 3.5, 3.6.1): the store is the tree's BlobStore over the in-memory Blob fake with the worked deck
// pushed, so every record carries its origin as on production. The hardening round's pins of the
// route live here (docs/hardening/HARDENING.md 4.6): a post retried after its answer was lost is
// answered from the log and leaves the store at one revision (HR-RT#1).
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

import { answerCheckpoint } from './checkpoint';
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
  return { op: 'text.splice', slideId: SLIDE, blockId: BLOCK, path: '/text', at, remove: 0, insert };
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
});
