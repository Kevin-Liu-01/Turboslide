// The comments sidecar (gslides-parity SPEC-3 2.2, 5.2, 0.52; MILESTONES-3 B2 day 5): the same
// edit on the file path (FileStore.write's onWrite hook under the lock) and on the stream path
// (the comment.shift ops the admission emits, applied by the checkpointer) writes identical
// thread bytes; the Blob push commits on index.json with ifMatch and re-applies after a pull when
// another instance moved it first; index.revision is monotone across two writers; a tombstone
// keeps the replies and a restore lifts it.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { CommentOp, Thread } from '@turboslide/schema/comments';
import type { DeckDocument } from '@turboslide/schema/deck';
import { WORKED_DECK, WORKED_SLIDES, workedDocument } from '@turboslide/schema/fixtures';
import { canonicalJson } from '@turboslide/schema/json';
import type { Author, Mutation } from '@turboslide/schema/mutations';
import { validateDocument } from '@turboslide/schema/validate';

import type { BlobClient } from './blob-store.ts';
import { deckPrefix } from './blob-store.ts';
import { memoryBlobClient } from './blob-fake.ts';
import {
  applyAndPush,
  applyCommentOps,
  fileCommentsOnWrite,
  pullSidecar,
  readIndex,
  readSidecar,
  readThread,
  shiftOps,
} from './comments-store.ts';
import { openFileStore, slidePath } from './file-store.ts';

const DECK = 'gt-brand';
const NOW = '2026-09-13T10:00:00.000Z';
const LATER = '2026-09-13T10:00:01.000Z';
const maya: Author = {
  kind: 'human',
  name: 'Maya',
  principalId: 'anon_0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b',
};
const T1 = '01j8z2kmayaq4e0s7r9x2v8b3c';
const T2 = '01j8z2kmayaq4e0s7r9x2v8b3d';
const T3 = '01j8z2kmayaq4e0s7r9x2v8b3e';
const C2 = '01j8z2kmayaq4e0s7r9x2v8c01';

function writeRawDeck(dir: string): void {
  mkdirSync(join(dir, 'slides'), { recursive: true });
  writeFileSync(join(dir, 'deck.json'), canonicalJson(WORKED_DECK));
  for (const slide of WORKED_SLIDES) writeFileSync(slidePath(dir, slide.id), canonicalJson(slide));
}

function normalized(): DeckDocument {
  const result = validateDocument(workedDocument());
  if (!result.ok || result.deck === null) throw new Error('fixture');
  return { deck: result.deck, slides: result.slides };
}

/** A text thread on "post" in the content rule paragraph (plain offsets 6 to 10). */
function textThread(id: string): Thread {
  return {
    id,
    deckId: DECK,
    anchor: {
      kind: 'text',
      slideId: 'content-rule',
      blockId: 'p1',
      path: '/text',
      range: [6, 10],
      quoted: 'post',
    },
    comment: {
      id,
      author: { principalId: maya.principalId as string, label: 'Maya', kind: 'human' },
      createdAt: NOW,
      body: { text: 'Say which post', mentions: [] },
    },
    replies: [],
    createdAt: NOW,
    updatedAt: NOW,
    revision: 0,
  };
}

function blockThread(id: string, text = 'Check this'): Thread {
  return {
    ...textThread(id),
    anchor: { kind: 'block', slideId: 'content-rule', blockId: 'list' },
    comment: { ...textThread(id).comment, body: { text, mentions: [] } },
  };
}

const add = (thread: Thread): CommentOp => ({ op: 'add', thread });

const splice: Mutation = {
  op: 'text.splice',
  slideId: 'content-rule',
  blockId: 'p1',
  path: '/text',
  at: 0,
  remove: 0,
  insert: 'A ',
};

describe('the comments sidecar', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'turboslide-comments-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('writes identical thread bytes for the same edit on the file path and on the stream path (0.52)', async () => {
    const fileDir = join(root, 'file', DECK);
    const streamDir = join(root, 'stream', DECK);
    writeRawDeck(fileDir);
    writeRawDeck(streamDir);
    applyCommentOps(fileDir, DECK, [add(textThread(T1))], NOW);
    applyCommentOps(streamDir, DECK, [add(textThread(T1))], NOW);

    // the file path: the store's hook shifts the anchor inside the write lock
    const store = openFileStore({
      dir: fileDir,
      now: () => LATER,
      onWrite: fileCommentsOnWrite(fileDir, DECK, () => LATER),
    });
    const base = (await store.read()).document.deck.revision;
    const written = await store.write({ author: maya, baseRevision: base, mutations: [splice] });
    expect(written.ok).toBe(true);

    // the stream path: the admission derives the shift ops, the checkpointer applies them
    const before = normalized();
    const after = (await store.read()).document;
    const ops = shiftOps(streamDir, DECK, before, after, [splice]);
    expect(ops).toEqual([
      {
        op: 'shift',
        threadId: T1,
        anchor: {
          kind: 'text',
          slideId: 'content-rule',
          blockId: 'p1',
          path: '/text',
          range: [8, 12],
          quoted: 'post',
        },
      },
    ]);
    applyCommentOps(streamDir, DECK, ops, LATER);

    const fileBytes = readFileSync(join(fileDir, 'comments', `${T1}.json`));
    const streamBytes = readFileSync(join(streamDir, 'comments', `${T1}.json`));
    expect(Buffer.compare(fileBytes, streamBytes)).toBe(0);
    expect(readThread(fileDir, T1)?.anchor).toMatchObject({ range: [8, 12] });
    expect(readIndex(fileDir, DECK).revision).toBe(2);
    expect(
      Buffer.compare(
        readFileSync(join(fileDir, 'comments', 'index.json')),
        readFileSync(join(streamDir, 'comments', 'index.json')),
      ),
    ).toBe(0);
  });

  it('leaves the sidecar alone when a write moves no anchor', async () => {
    const dir = join(root, DECK);
    writeRawDeck(dir);
    applyCommentOps(dir, DECK, [add(blockThread(T1))], NOW);
    const indexBefore = readFileSync(join(dir, 'comments', 'index.json'));
    const store = openFileStore({
      dir,
      now: () => LATER,
      onWrite: fileCommentsOnWrite(dir, DECK, () => LATER),
    });
    const written = await store.write({
      author: maya,
      baseRevision: (await store.read()).document.deck.revision,
      mutations: [
        {
          op: 'block.set',
          slideId: 'content-rule',
          blockId: 'h',
          path: '/text',
          value: 'The content rule, restated',
        },
      ],
    });
    expect(written.ok).toBe(true);
    expect(Buffer.compare(readFileSync(join(dir, 'comments', 'index.json')), indexBefore)).toBe(0);
  });

  it('keeps index.revision monotone across two writers and skips a redelivered add', () => {
    const dir = join(root, DECK);
    writeRawDeck(dir);
    const first = applyCommentOps(dir, DECK, [add(blockThread(T1))], NOW);
    expect(first.index.revision).toBe(1);
    const second = applyCommentOps(
      dir,
      DECK,
      [
        add(blockThread(T2, 'Second')),
        {
          op: 'reply',
          threadId: T1,
          comment: { ...blockThread(C2).comment, body: { text: 'Agreed', mentions: [] } },
        },
      ],
      LATER,
    );
    expect(second.index.revision).toBe(3);
    expect(second.threads.map((thread) => thread.id).sort()).toEqual([T1, T2]);
    const again = applyCommentOps(dir, DECK, [add(blockThread(T1))], LATER);
    expect(again.threads).toEqual([]);
    expect(again.refused).toEqual([]);
    expect(readIndex(dir, DECK).revision).toBe(3);
    const other = applyCommentOps(
      dir,
      DECK,
      [add({ ...blockThread(T1), createdAt: LATER })],
      LATER,
    );
    expect(other.refused[0]?.error.status).toBe(409);
    const sidecar = readSidecar(dir, DECK);
    expect(sidecar.threads.get(T1)?.replies).toHaveLength(1);
    expect(sidecar.index.threads.find((row) => row.id === T1)?.count).toBe(2);
    expect(sidecar.authors[maya.principalId as string]).toEqual({ label: 'Maya', kind: 'human' });
  });

  it('tombstones a comment, keeps the replies and restores inside the window', () => {
    const dir = join(root, DECK);
    writeRawDeck(dir);
    applyCommentOps(
      dir,
      DECK,
      [
        add(blockThread(T1)),
        { op: 'reply', threadId: T1, comment: { ...blockThread(C2).comment } },
      ],
      NOW,
    );
    const by = maya.principalId as string;
    applyCommentOps(
      dir,
      DECK,
      [{ op: 'delete', threadId: T1, commentId: T1, by, at: LATER }],
      LATER,
    );
    let thread = readThread(dir, T1);
    expect(thread?.comment.deleted).toEqual({ by, at: LATER });
    expect(thread?.replies).toHaveLength(1);
    expect(readIndex(dir, DECK).threads[0]?.count).toBe(1);
    applyCommentOps(
      dir,
      DECK,
      [{ op: 'delete', threadId: T1, commentId: T1, by, at: LATER, restore: true }],
      LATER,
    );
    thread = readThread(dir, T1);
    expect(thread?.comment.deleted).toBeUndefined();
    expect(readIndex(dir, DECK).threads[0]?.count).toBe(2);
    expect(readIndex(dir, DECK).revision).toBe(4);
  });

  it('pushes with ifMatch on index.json and re-applies after a pull when another instance moved it', async () => {
    const client = memoryBlobClient();
    const dirA = join(root, 'a', DECK);
    const dirB = join(root, 'b', DECK);
    writeRawDeck(dirA);
    writeRawDeck(dirB);
    const a = await applyAndPush(client, DECK, dirA, [add(blockThread(T1))], NOW);
    expect(a.index.revision).toBe(1);
    expect(client.blobs.has(`${deckPrefix(DECK)}comments/index.json`)).toBe(true);

    // B reads the store's index, then A commits again before B's push: B's ifMatch fails, B pulls and retries
    let raced = false;
    const racing: BlobClient = {
      ...client,
      head: async (pathname) => {
        const entry = await client.head(pathname);
        if (!raced && pathname.endsWith('comments/index.json')) {
          raced = true;
          await applyAndPush(client, DECK, dirA, [add(blockThread(T3, 'Third'))], LATER);
        }
        return entry;
      },
    };
    const b = await applyAndPush(racing, DECK, dirB, [add(blockThread(T2, 'Second'))], LATER);
    expect(raced).toBe(true);
    expect(b.index.revision).toBe(3);
    expect(b.index.threads.map((row) => row.id).sort()).toEqual([T1, T2, T3]);
    for (const id of [T1, T2, T3])
      expect(client.blobs.has(`${deckPrefix(DECK)}comments/${id}.json`)).toBe(true);
    const stored = JSON.parse(
      new TextDecoder().decode(client.blobs.get(`${deckPrefix(DECK)}comments/index.json`)?.bytes),
    ) as { revision: number; threads: { id: string; etag?: string }[] };
    expect(stored.revision).toBe(3);
    expect(
      stored.threads.every((row) => typeof row.etag === 'string' && row.etag.startsWith('"')),
    ).toBe(true);

    // a third mirror pulls the whole sidecar and reads the same threads
    const dirC = join(root, 'c', DECK);
    writeRawDeck(dirC);
    const pulled = await pullSidecar(client, DECK, dirC);
    expect(pulled?.revision).toBe(3);
    expect(readSidecar(dirC, DECK).threads.size).toBe(3);
    expect(
      Buffer.compare(
        readFileSync(join(dirC, 'comments', `${T2}.json`)),
        readFileSync(join(dirB, 'comments', `${T2}.json`)),
      ),
    ).toBe(0);
  });
});

// The proven pull (the focus round, VERIFICATION.md pass 2 F-comments-reply): a reply pushed by
// one instance overwrites the thread file and the index; another instance that pulls through the
// CDN's copy of those files reads the thread from before the reply and lists no reply. The pull
// proves the index against `head()` and reads each thread by the index's rows, never by the prefix
// listing (which lags by up to a minute); the fake's `holdGet()` is the CDN and `holdList()` the
// listing.
describe('the proven pull (pass 2)', () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'turboslide-comments-pull-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const freshFrom = (client: ReturnType<typeof memoryBlobClient>) => async (url: string) => {
    const pathname = url.slice(client.base.length + 1).split('?')[0] ?? '';
    const stored = client.blobs.get(pathname);
    return stored === undefined ? null : new Uint8Array(stored.bytes);
  };
  const noSleep = async (): Promise<void> => undefined;

  it('lists the reply another instance pushed while the plain reads still answer the thread from before it', async () => {
    const client = memoryBlobClient();
    const options = { fetchFresh: freshFrom(client), sleep: noSleep };
    const dirA = join(root, 'a', DECK);
    const dirB = join(root, 'b', DECK);
    writeRawDeck(dirA);
    writeRawDeck(dirB);
    await applyAndPush(client, DECK, dirA, [add(blockThread(T1))], NOW, 4, options);
    // B read the sidecar once (the add's read back); the CDN now holds these bodies
    expect((await pullSidecar(client, DECK, dirB, options))?.revision).toBe(1);
    expect(readSidecar(dirB, DECK).threads.get(T1)?.replies).toHaveLength(0);
    client.holdGet();
    client.holdList();
    const reply: CommentOp = {
      op: 'reply',
      threadId: T1,
      comment: {
        id: T2,
        author: { principalId: maya.principalId as string, label: 'Maya', kind: 'human' },
        createdAt: LATER,
        body: { text: 'Done', mentions: [] },
      },
    };
    await applyAndPush(client, DECK, dirA, [reply], LATER, 4, options);
    // the plain client still answers the index and the thread from before the reply
    const plainIndex = await client.get(`${deckPrefix(DECK)}comments/index.json`);
    expect(
      (JSON.parse(new TextDecoder().decode(plainIndex?.bytes)) as { revision: number }).revision,
    ).toBe(1);
    // B pulls: the proven reads answer the reply
    const pulled = await pullSidecar(client, DECK, dirB, options);
    expect(pulled?.revision).toBe(2);
    const thread = readSidecar(dirB, DECK).threads.get(T1);
    expect(thread?.replies.map((r) => r.body.text)).toEqual(['Done']);
    expect(
      Buffer.compare(
        readFileSync(join(dirB, 'comments', `${T1}.json`)),
        readFileSync(join(dirA, 'comments', `${T1}.json`)),
      ),
    ).toBe(0);
    client.releaseGet();
    client.releaseList();
  });

  it('lists the thread another instance pushed from the immutable copies when the plain reads and the url read all lag (C2-F7)', async () => {
    const client = memoryBlobClient();
    // the url read with the query lags like the plain read (the cycle 2 preview's function edge)
    const options = { fetchFresh: async () => null, retries: 0, sleep: noSleep };
    const dirA = join(root, 'e', DECK);
    const dirB = join(root, 'f', DECK);
    writeRawDeck(dirA);
    writeRawDeck(dirB);
    await applyAndPush(client, DECK, dirA, [add(blockThread(T1))], NOW, 4, options);
    expect((await pullSidecar(client, DECK, dirB, options))?.revision).toBe(1);
    client.holdGet();
    client.holdList();
    // the Insert menu route's thread, added on instance A after B read the sidecar once
    await applyAndPush(client, DECK, dirA, [add(blockThread(T2))], LATER, 4, options);
    const plainIndex = await client.get(`${deckPrefix(DECK)}comments/index.json`);
    expect(
      (JSON.parse(new TextDecoder().decode(plainIndex?.bytes)) as { revision: number }).revision,
    ).toBe(1);
    // B pulls: the index and the new thread come from their copies under the deck's state folder
    const pulled = await pullSidecar(client, DECK, dirB, options);
    expect(pulled?.revision).toBe(2);
    expect([...readSidecar(dirB, DECK).threads.keys()].sort()).toEqual([T1, T2].sort());
    expect(
      [...client.blobs.keys()].filter((key) =>
        key.startsWith(`${deckPrefix(DECK)}.turboslide/copies/`),
      ).length,
    ).toBeGreaterThanOrEqual(4);
    client.releaseGet();
    client.releaseList();
  });

  it('removes a local thread the store does not name and answers null when the store holds no sidecar', async () => {
    const client = memoryBlobClient();
    const options = { fetchFresh: freshFrom(client), sleep: noSleep };
    const dir = join(root, 'c', DECK);
    writeRawDeck(dir);
    mkdirSync(join(dir, 'comments'), { recursive: true });
    writeFileSync(join(dir, 'comments', `${T3}.json`), '{}');
    expect(await pullSidecar(client, DECK, dir, options)).toBeNull();
    expect(readSidecar(dir, DECK).threads.size).toBe(0);
    await applyAndPush(
      client,
      DECK,
      join(root, 'd', DECK),
      [add(blockThread(T1))],
      NOW,
      4,
      options,
    );
    writeFileSync(join(dir, 'comments', `${T3}.json`), '{}');
    expect((await pullSidecar(client, DECK, dir, options))?.threads.map((r) => r.id)).toEqual([T1]);
    expect(readSidecar(dir, DECK).threads.has(T3)).toBe(false);
  });
});
