// The document read path of the Blob mirror (gslides-parity SPEC-5-amendments A3 item 2; B7): no
// time window decides whether a read trusts the mirror. A read serves the mirror without a head
// call only while the mirror's revision is the one the room last delivered to this instance
// (`noteDelivered`); before any delivery, after a forced sync that moved it and whenever the
// watch poll runs, the store's head is read; a write always reads the head and commits with
// ifMatch. Until round five a 750 ms window let a write admitted against the mirror meet a
// store one revision ahead (build-4/hotfix-4.md 3.6, 3.7).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WORKED_DECK, WORKED_SLIDES } from '@turboslide/schema/fixtures';
import { canonicalJson } from '@turboslide/schema/json';
import type { Author, Mutation } from '@turboslide/schema/mutations';

import { memoryBlobClient } from './blob-fake.ts';
import type { FakeBlobClient } from './blob-fake.ts';
import { openBlobStore, pushDeckDir } from './blob-store.ts';
import type { BlobStore } from './blob-store.ts';

const kevin: Author = { kind: 'human', name: 'kevin' };
const maya: Author = { kind: 'human', name: 'maya' };

function setSize(value: number): Mutation {
  return { op: 'block.set', slideId: 'content-rule', blockId: 'list', path: '/size', value };
}

describe('the Blob mirror’s read path (A3 item 2)', () => {
  let root: string;
  let fake: FakeBlobClient;
  let a: BlobStore;
  let b: BlobStore;
  const heads = (): number => fake.calls.filter((call) => call.op === 'head').length;

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'turboslide-blob-sync-'));
    const seed = join(root, 'seed', 'gt-brand');
    mkdirSync(join(seed, 'slides'), { recursive: true });
    writeFileSync(join(seed, 'deck.json'), canonicalJson(WORKED_DECK));
    for (const slide of WORKED_SLIDES)
      writeFileSync(join(seed, 'slides', `${slide.id}.json`), canonicalJson(slide));
    fake = memoryBlobClient();
    await pushDeckDir(fake, 'gt-brand', seed, { overwrite: false });
    a = openBlobStore({ client: fake, deckId: 'gt-brand', dir: join(root, 'a', 'gt-brand') });
    b = openBlobStore({ client: fake, deckId: 'gt-brand', dir: join(root, 'b', 'gt-brand') });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('reads the head on every read until the room delivers a revision, then serves the mirror at that revision', async () => {
    await a.read();
    fake.calls.length = 0;
    await a.read();
    await a.read();
    // no delivery yet: every read is one head call, never a time window
    expect(heads()).toBe(2);
    expect(a.deliveredRevision()).toBeNull();
    a.noteDelivered(412);
    fake.calls.length = 0;
    await a.read();
    await a.records();
    await a.revision();
    // the mirror holds the delivered revision: no head call
    expect(heads()).toBe(0);
    expect(a.deliveredRevision()).toBe(412);
  });

  it('reads the head again once a higher revision is delivered, and a lower one moves nothing', async () => {
    await a.read();
    a.noteDelivered(412);
    // another instance commits 413
    const written = await b.write({ baseRevision: 412, author: maya, mutations: [setSize(22)] });
    expect(written.ok).toBe(true);
    fake.calls.length = 0;
    // the mirror still says 412 and 412 was delivered: the read is served as it stands
    expect((await a.read()).document.deck.revision).toBe(412);
    expect(heads()).toBe(0);
    // the room announces 413 (a frame with a higher revision): the next read pulls (the head
    // for the rule, then the pull's own head for the etag proof)
    a.noteDelivered(413);
    expect((await a.read()).document.deck.revision).toBe(413);
    expect(heads()).toBeGreaterThanOrEqual(1);
    // a late frame of an earlier revision changes nothing
    a.noteDelivered(412);
    expect(a.deliveredRevision()).toBe(413);
    fake.calls.length = 0;
    await a.read();
    expect(heads()).toBe(0);
  });

  it('always reads the head on a forced sync, on the watch poll and on a write', async () => {
    await a.read();
    a.noteDelivered(412);
    await b.write({ baseRevision: 412, author: maya, mutations: [setSize(22)] });
    fake.calls.length = 0;
    const forced = await a.sync(true);
    expect(forced).toMatchObject({ present: true, pulled: true, revision: 413 });
    expect(heads()).toBeGreaterThanOrEqual(1);
    // the watch poll: a change on another instance reaches the listener without a delivery
    await b.write({ baseRevision: 413, author: maya, mutations: [setSize(24)] });
    const seen: number[] = [];
    const stop = a.watch((event) => {
      if (event.revision !== null) seen.push(event.revision);
    });
    const until = Date.now() + 8000;
    while (seen.length === 0 && Date.now() < until)
      await new Promise((resolve) => setTimeout(resolve, 50));
    stop();
    expect(seen).toEqual([414]);
    // a write reads the head with its etag and commits with ifMatch: it never trusts the mirror
    const moved = await b.write({ baseRevision: 414, author: maya, mutations: [setSize(22)] });
    expect(moved).toMatchObject({ ok: true, revision: 415 });
    a.noteDelivered(414);
    const stale = await a.write({ baseRevision: 414, author: kevin, mutations: [setSize(20)] });
    expect(stale).toMatchObject({ ok: false, code: 'conflict', currentRevision: 415 });
    const fresh = await a.write({ baseRevision: 415, author: kevin, mutations: [setSize(20)] });
    expect(fresh).toMatchObject({ ok: true, revision: 416 });
  });

  it('carries the writing tab and its batch on the record when the write names an origin', async () => {
    await a.read();
    const clientId = 'a'.repeat(32);
    const written = await a.write(
      { baseRevision: 412, author: kevin, mutations: [setSize(22)] },
      { origin: { clientId, opIds: [`${clientId}:7`, `${clientId}:8`] } },
    );
    expect(written).toMatchObject({ ok: true, revision: 413 });
    await b.sync(true);
    const records = await b.records();
    expect(records[records.length - 1]).toMatchObject({
      revision: 413,
      clientId,
      opIds: [`${clientId}:7`, `${clientId}:8`],
    });
    // a write without an origin carries neither field
    const plain = await b.write({ baseRevision: 413, author: maya, mutations: [setSize(24)] });
    expect(plain.ok).toBe(true);
    const last = (await b.records()).find((record) => record.revision === 414);
    expect(last?.clientId).toBeUndefined();
    expect(last?.opIds).toBeUndefined();
  });
});
