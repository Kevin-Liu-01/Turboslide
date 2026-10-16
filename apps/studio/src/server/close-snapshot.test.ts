import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WORKED_DECK, WORKED_SLIDES } from '@turboslide/schema/fixtures';
import { canonicalJson } from '@turboslide/schema/json';
import type { Author } from '@turboslide/schema/mutations';
import { memoryBlobClient } from '@turboslide/store/blob-fake';
import type { FakeBlobClient } from '@turboslide/store/blob-fake';
import { openBlobStore, pushDeckDir } from '@turboslide/store/blob-store';
import type { BlobStore } from '@turboslide/store/blob-store';
import { etagMd5, snapshotPath } from '@turboslide/store/snapshots';

// Hardening PS#4 (docs/hardening/HARDENING.md 4.9; PERF-3 item 2): a commit stores the snapshot
// on every tenth record, and the deck's last close stores the current one. On the do tier the
// last close is the object's checkpoint post with `closed: true`; the route asks the store for
// the snapshot then. The route runs here over a Blob store on the in-memory fake, with the room,
// the bearer and the thumbnail scheduler stood in.

const DECK = 'gt-brand';
const agent: Author = { kind: 'agent', name: 'agent', runId: 'a' };

let store: BlobStore;
vi.mock('./room', () => ({
  roomFor: () => Promise.resolve({ store }),
  realtimeTier: () => 'do',
}));
vi.mock('./root', () => ({ hasStoredDeck: () => Promise.resolve(true) }));
vi.mock('./room-bearer', () => ({ roomBearerMatches: () => true }));
vi.mock('./card-thumb', () => ({ flushCardThumb: () => false, scheduleCardThumb: () => {} }));
vi.mock('./comments', () => ({
  commentsApplierFor: () => ({ apply: () => Promise.resolve({ revision: 0, threadIds: [] }) }),
  shiftEntriesFor: () => Promise.resolve([]),
}));

const { Route } = await import('../routes/api/decks.$deckId.checkpoint');
type Handler = (input: { params: { deckId: string }; request: Request }) => Promise<Response>;
const post = (Route.options as unknown as { server: { handlers: { POST: Handler } } }).server
  .handlers.POST;

let root: string;
let fake: FakeBlobClient;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'turboslide-close-snapshot-'));
  const seed = join(root, 'seed', DECK);
  mkdirSync(join(seed, 'slides'), { recursive: true });
  writeFileSync(join(seed, 'deck.json'), canonicalJson(WORKED_DECK));
  for (const slide of WORKED_SLIDES)
    writeFileSync(join(seed, 'slides', `${slide.id}.json`), canonicalJson(slide));
  fake = memoryBlobClient();
  await pushDeckDir(fake, DECK, seed, { overwrite: false });
  store = openBlobStore({
    client: fake,
    deckId: DECK,
    dir: join(root, 'mirror', DECK),
    syncTtlMs: 0,
  });
  // two commits: record 1 stores its snapshot, record 2 does not (SNAPSHOT_EVERY_RECORDS)
  for (const size of [22, 24]) {
    const outcome = await store.write({
      baseRevision: await store.revision(),
      author: agent,
      mutations: [
        { op: 'block.set', slideId: 'content-rule', blockId: 'list', path: '/size', value: size },
      ],
    });
    if (!outcome.ok) throw new Error(outcome.message);
  }
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

/** Whether the store holds the snapshot the current manifest names. */
async function headSnapshotStored(): Promise<boolean> {
  const head = await fake.head(`decks/${DECK}/deck.json`);
  const key = head === null ? null : etagMd5(head.version);
  return key !== null && (await fake.head(`decks/${DECK}/${snapshotPath(key)}`)) !== null;
}

function checkpoint(closed: boolean): Promise<Response> {
  return post({
    params: { deckId: DECK },
    request: new Request(`http://localhost/api/decks/${DECK}/checkpoint`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fromSeq: 1, toSeq: 0, entries: [], ...(closed ? { closed } : {}) }),
    }),
  });
}

describe('hardening PS#4: the last close stores the current snapshot', () => {
  it('a checkpoint post without `closed` stores none, the last close stores it', async () => {
    expect(await headSnapshotStored()).toBe(false);
    expect((await checkpoint(false)).status).toBe(200);
    expect(await headSnapshotStored()).toBe(false);
    expect((await checkpoint(true)).status).toBe(200);
    expect(await headSnapshotStored()).toBe(true);
    // a second close finds it stored and puts nothing
    const puts = fake.calls.filter((call) => call.op === 'put').length;
    expect((await checkpoint(true)).status).toBe(200);
    expect(fake.calls.filter((call) => call.op === 'put')).toHaveLength(puts);
  });
});
