// The preview stall of 2026-10-16 (the 96b4fb72 preview): on a deployment with the private store
// and the dual read record of the 2026-10-11 rehearsal, one read of `meta.json` that never settled
// held the split client's shared layout read, and every document call of the instance behind it,
// so each head and list met the 10 s deadline (BLOB_READ_TIMEOUT_MS) until the instance was
// recycled. The store here is the preview's: the public store production seeded, the private store
// holding the old-format record (`layout: 'v1', dualRead: true`), both answering after a latency.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WORKED_DECK, WORKED_SLIDES } from '@turboslide/schema/fixtures';
import { canonicalJson } from '@turboslide/schema/json';

import { memoryBlobClient } from './blob-fake.ts';
import type { FakeBlobClient } from './blob-fake.ts';
import type { BlobCallOptions, BlobClient, BlobStore } from './blob-store.ts';
import { BLOB_READ_TIMEOUT_MS } from './blob-store.ts';
import { keyedClient } from './blob-vercel.ts';
import { openHostedDecks } from './hosted.ts';
import type { HostedDecks } from './hosted.ts';
import { LAYOUT_READ_MS, LAYOUT_TTL_MS, MIGRATION_META, splitBlobClient } from './migrate.ts';
import { directorySeed } from './seed.ts';
import { selectStore } from './select.ts';

const LATENCY_MS = 20;

/** The fake behind a latency; `hangNextMeta` makes the next read of meta.json never settle, signal or not. */
function slowStore(inner: FakeBlobClient): BlobClient & { hangNextMeta: () => void } {
  let hang = false;
  const wait = (signal: AbortSignal | undefined) =>
    new Promise<void>((resolve, reject) => {
      if (signal?.aborted) return reject(signal.reason);
      const timer = setTimeout(resolve, LATENCY_MS);
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(signal.reason);
        },
        { once: true },
      );
    });
  const s = (options?: BlobCallOptions) => options?.signal;
  return {
    hangNextMeta: () => void (hang = true),
    head: async (p, o) => (await wait(s(o)), inner.head(p, o)),
    async get(p, o) {
      if (p === MIGRATION_META && hang) {
        hang = false;
        return new Promise(() => undefined);
      }
      await wait(s(o));
      return inner.get(p, o);
    },
    list: async (p, o) => (await wait(s(o)), inner.list(p, o)),
    folders: async (p, o) => (await wait(s(o)), inner.folders(p, o)),
    put: async (p, b, o) => (await wait(o.signal), inner.put(p, b, o)),
    del: async (p, o) => (await wait(s(o)), inner.del(p, o)),
  };
}

function writeSeed(root: string): void {
  const deck = join(root, 'gt-brand');
  mkdirSync(join(deck, 'slides'), { recursive: true });
  writeFileSync(join(deck, 'deck.json'), canonicalJson(WORKED_DECK));
  for (const slide of WORKED_SLIDES)
    writeFileSync(join(deck, 'slides', `${slide.id}.json`), canonicalJson(slide));
}

/** What `deck.info` reads (apps/studio agent-actions.ts): the document, the log and the snapshots. */
async function deckInfo(decks: HostedDecks): Promise<number> {
  const store = (await decks.open('gt-brand')) as BlobStore;
  const [read] = await Promise.all([store.read(), store.records(), store.snapshots()]);
  return read.document.deck.revision;
}

async function timed<T>(run: () => Promise<T>): Promise<{ ms: number; value?: T; error?: unknown }> {
  const started = Date.now();
  try {
    const value = await run();
    return { ms: Date.now() - started, value };
  } catch (error) {
    return { ms: Date.now() - started, error };
  }
}

describe('a preview on the dual read record', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'turboslide-stall-'));
    writeSeed(join(root, 'seed'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('a read of meta.json that never answers holds no document call past LAYOUT_READ_MS', async () => {
    const publicFake = memoryBlobClient('https://public.blob.local');
    const privateFake = memoryBlobClient('https://private.blob.local');
    const selection = selectStore({ TURBOSLIDE_STORE: 'blob', BLOB_READ_WRITE_TOKEN: 'test' });
    // production (layout v1) seeded the public store
    await openHostedDecks({
      selection,
      workspaceDecksDir: null,
      overlayRoot: join(root, 'production'),
      seed: directorySeed(join(root, 'seed')),
      blob: keyedClient(publicFake),
    }).ready();
    // the record the 2026-10-11 rehearsal left on the preview's private store
    await privateFake.put(
      MIGRATION_META,
      new TextEncoder().encode(
        `${JSON.stringify({ schemaVersion: 1, layout: 'v1', step: 'copy', decks: [], dualRead: true, rollback: false })}\n`,
      ),
      { overwrite: true },
    );
    const legacy = slowStore(publicFake);
    const documents = slowStore(privateFake);
    // the layout cache expires when the test says so, not by waiting LAYOUT_TTL_MS
    let skew = 0;
    const client = keyedClient(
      splitBlobClient(
        { legacy, documents },
        { sharedPublicStore: true, now: () => Date.now() + skew },
      ),
      legacy,
    );
    // layoutBlobClient's composition, behind the collection's boundedBlobClient (10 s reads)
    const decks = openHostedDecks({
      selection,
      workspaceDecksDir: null,
      overlayRoot: join(root, 'preview'),
      seed: directorySeed(join(root, 'seed')),
      blob: async () => client,
    });
    await decks.ready();
    const warm = await timed(() => deckInfo(decks));
    expect(warm.error).toBeUndefined();
    expect(warm.value).toBe(WORKED_DECK.revision);

    // the cached layout expires and its next read never answers
    skew += LAYOUT_TTL_MS + 1;
    documents.hangNextMeta();
    const stalled = await timed(() => deckInfo(decks));
    // the read fails by the layout deadline, not by the 10 s deadline of every call behind it
    expect(stalled.ms).toBeLessThan(LAYOUT_READ_MS + 2_000);
    expect(stalled.ms).toBeLessThan(BLOB_READ_TIMEOUT_MS);

    // and the next request reads the layout again and answers
    const after = await timed(() => deckInfo(decks));
    expect(after.error).toBeUndefined();
    expect(after.value).toBe(WORKED_DECK.revision);
    expect(after.ms).toBeLessThan(2_000);
  }, 60_000);
});
