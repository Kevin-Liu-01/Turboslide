// The hosted backends against one seed: the DeckStore contract runs over FileStore and over
// BlobStore (an in-memory Blob fake, two store instances standing in for two function
// instances), the Blob races end in one commit and one conflict, and the tmp and blob
// collections materialize the seed, list, open, create and serve twins the same way.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ConflictError } from '@turboslide/schema/errors';
import type { Asset } from '@turboslide/schema/assets';
import { MOOD_EARTH, WORKED_DECK, WORKED_SLIDES } from '@turboslide/schema/fixtures';
import { canonicalJson } from '@turboslide/schema/json';
import type { Author, Mutation } from '@turboslide/schema/mutations';

import { memoryBlobClient } from './blob-fake.ts';
import type { FakeBlobClient } from './blob-fake.ts';
import {
  isMirroredDocument,
  openBlobStore,
  parseThumbPathname,
  pruneThumbs,
  pushDeckDir,
  storedThumbs,
  thumbPathname,
  thumbsPrefix,
} from './blob-store.ts';
import type { BlobStore } from './blob-store.ts';
import { digestAssetName, openFileStore } from './file-store.ts';
import { openHostedDecks } from './hosted.ts';
import type { HostedDecks } from './hosted.ts';
import { directorySeed, materializeSeed } from './seed.ts';
import { NOT_PERSISTENT_NOTICE, selectStore } from './select.ts';
import {
  etagMd5,
  prunableSnapshots,
  retainedSnapshots,
  snapshotKey,
  snapshotPath,
} from './snapshots.ts';
import type { DeckStore, StoreEvent, VersionRecord } from './store.ts';
import { AssetExistsError } from './store.ts';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

const agentA: Author = { kind: 'agent', name: 'agent', runId: 'a' };
const agentB: Author = { kind: 'agent', name: 'agent', runId: 'b' };
const kevin: Author = { kind: 'human', name: 'kevin' };

const setSize = (value: number): Mutation => ({
  op: 'block.set',
  slideId: 'content-rule',
  blockId: 'list',
  path: '/size',
  value,
});

/** The worked deck as a seed folder: the deck, its twins as stub files, and a template cut from it. */
function writeSeedDecks(root: string): void {
  const deck = join(root, 'gt-brand');
  mkdirSync(join(deck, 'slides'), { recursive: true });
  mkdirSync(join(deck, 'assets'), { recursive: true });
  writeFileSync(join(deck, 'deck.json'), canonicalJson(WORKED_DECK));
  for (const slide of WORKED_SLIDES) {
    writeFileSync(join(deck, 'slides', `${slide.id}.json`), canonicalJson(slide));
  }
  for (const asset of Object.values(WORKED_DECK.assets)) {
    for (const twin of Object.values(asset.twins)) writeFileSync(join(deck, twin), PNG);
  }
  const template = join(root, 'templates', 'gt-brand');
  mkdirSync(join(template, 'slides'), { recursive: true });
  writeFileSync(join(template, 'deck.json'), canonicalJson(WORKED_DECK));
  for (const slide of WORKED_SLIDES) {
    writeFileSync(join(template, 'slides', `${slide.id}.json`), canonicalJson(slide));
  }
  writeFileSync(
    join(template, 'template.json'),
    canonicalJson({
      schemaVersion: 1,
      id: 'gt-brand',
      name: 'GT brand deck',
      description: 'the worked deck as a template',
      theme: 'gt-ink-paper',
      deck: 'deck.json',
      slides: 'slides',
      assets: '../../gt-brand/assets',
      sections: [],
      archetypes: [],
    }),
  );
}

type Instances = {
  store: DeckStore;
  /** a second instance over the same storage, as another process or function instance */
  peer: DeckStore;
};

function contract(name: string, setup: () => Promise<Instances>) {
  describe(`DeckStore contract over ${name}`, () => {
    let store: DeckStore;
    let peer: DeckStore;

    beforeEach(async () => {
      ({ store, peer } = await setup());
    });

    it('reads the seed normalized', async () => {
      const read = await store.read();
      expect(read.ok).toBe(true);
      expect(read.document.deck.revision).toBe(412);
      expect(Object.keys(read.document.slides)).toHaveLength(WORKED_SLIDES.length);
      expect(store.id).toBe('gt-brand');
      expect(await peer.revision()).toBe(412);
    });

    it('commits a write that the peer reads back', async () => {
      const outcome = await store.write({
        baseRevision: 412,
        author: agentA,
        mutations: [setSize(22)],
      });
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      expect(outcome.revision).toBe(413);
      expect(outcome.changed).toEqual(['content-rule']);
      expect(outcome.entry).toMatchObject({ n: 1, revision: 413, baseRevision: 412 });
      const seen = await peer.read();
      expect(seen.document.deck.revision).toBe(413);
      const list = seen.document.slides['content-rule'];
      expect(list?.kind === 'content' && list.slots.right?.[0]).toMatchObject({
        id: 'list',
        size: 22,
      });
      expect(await peer.listVersions()).toHaveLength(1);
      expect(await peer.revision()).toBe(413);
    });

    it('returns the current document on a stale baseRevision', async () => {
      await store.write({ baseRevision: 412, author: agentA, mutations: [setSize(22)] });
      const stale = await peer.write({
        baseRevision: 412,
        author: agentB,
        mutations: [setSize(24)],
      });
      expect(stale.ok).toBe(false);
      if (stale.ok || stale.code !== 'conflict') return;
      expect(stale.currentRevision).toBe(413);
      expect(stale.current.deck.revision).toBe(413);
      expect(await store.revision()).toBe(413);
      expect(await store.listVersions()).toHaveLength(1);
    });

    it('refuses an invalid mutation without touching the deck', async () => {
      const outcome = await store.write({
        baseRevision: 412,
        author: agentA,
        mutations: [{ op: 'slide.remove', slideId: 'missing' }],
      });
      expect(outcome.ok).toBe(false);
      expect(!outcome.ok && outcome.code).toBe('invalid');
      expect(await peer.revision()).toBe(412);
      expect(await peer.listVersions()).toEqual([]);
    });

    it('saves named versions and rebuilds history', async () => {
      await store.write({ baseRevision: 412, author: agentA, mutations: [setSize(22)] });
      const named = await store.saveVersion(kevin, 'before the review');
      expect(named).toMatchObject({ n: 2, revision: 413, note: 'before the review' });
      expect((await peer.listVersions()).map((v) => v.n)).toEqual([1, 2]);
      expect((await peer.records()).map((r) => r.baseRevision)).toEqual([412, 413]);
      const before = await peer.documentAt(0);
      expect(before.deck.revision).toBe(412);
      const at = await peer.documentAtRevision(412);
      const list = at.slides['content-rule'];
      expect(list?.kind === 'content' && list.slots.right?.[0]).toMatchObject({ id: 'list' });
      expect(list?.kind === 'content' && list.slots.right?.[0]).not.toMatchObject({ size: 22 });
    });

    it('enforces leases across instances for agents and warns humans', async () => {
      const lease = await store.lease('content-rule', agentA, { minutes: 10 });
      expect(lease.holder).toEqual(agentA);
      expect(await peer.leases()).toHaveLength(1);
      const refused = await peer.write({
        baseRevision: 412,
        author: agentB,
        mutations: [setSize(22)],
      });
      expect(refused.ok).toBe(false);
      if (refused.ok || refused.code !== 'conflict') return;
      expect(refused.holder).toEqual(agentA);
      expect(refused.currentRevision).toBe(412);
      const human = await peer.write({
        baseRevision: 412,
        author: kevin,
        mutations: [setSize(22)],
      });
      expect(human.ok).toBe(true);
      expect(human.ok && human.warnings).toHaveLength(1);
      expect(await store.release('content-rule', agentA)).toMatchObject({
        slideId: 'content-rule',
      });
      expect(await peer.leases()).toEqual([]);
      const allowed = await peer.write({
        baseRevision: 413,
        author: agentB,
        mutations: [setSize(24)],
      });
      expect(allowed.ok).toBe(true);
    });
  });
}

// ---------------------------------------------------------------------------------------------

describe('hosted stores', () => {
  let root: string;
  let seedRoot: string;
  let clock: string;
  const now = (): string => clock;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'turboslide-hosted-'));
    seedRoot = join(root, 'seed');
    writeSeedDecks(seedRoot);
    clock = '2026-09-11T10:00:00.000Z';
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  contract('FileStore', async () => {
    const decks = join(root, 'file', 'decks');
    await materializeSeed(directorySeed(seedRoot), decks);
    const dir = join(decks, 'gt-brand');
    return { store: openFileStore({ dir, now }), peer: openFileStore({ dir, now }) };
  });

  /** Two BlobStores over one fake, each with its own mirror, the seed pushed once. */
  async function blobPair(hooks?: {
    beforeCommit?: () => Promise<void>;
    afterHead?: () => Promise<void>;
  }): Promise<{ fake: FakeBlobClient; a: BlobStore; b: BlobStore }> {
    // the fake stamps uploads with the test clock; the pair prunes with no grace so a test sees
    // the retention rule act (the store's default leaves an unreferenced snapshot alone for 5 min)
    const fake = memoryBlobClient(undefined, { now });
    await pushDeckDir(fake, 'gt-brand', join(seedRoot, 'gt-brand'), { overwrite: false });
    const a = openBlobStore({
      client: fake,
      deckId: 'gt-brand',
      dir: join(root, 'mirror-a', 'gt-brand'),
      now,
      syncTtlMs: 0,
      pollMs: 20,
      snapshotGraceMs: 0,
    });
    const b = openBlobStore({
      client: fake,
      deckId: 'gt-brand',
      dir: join(root, 'mirror-b', 'gt-brand'),
      now,
      syncTtlMs: 0,
      pollMs: 20,
      snapshotGraceMs: 0,
      ...(hooks === undefined ? {} : { hooks }),
    });
    return { fake, a, b };
  }

  contract('BlobStore', async () => {
    const { a, b } = await blobPair();
    return { store: a, peer: b };
  });

  describe('BlobStore', () => {
    it('lays the deck out as files under decks/<id>/ and pulls it into a fresh mirror', async () => {
      const { fake, a } = await blobPair();
      const keys = [...fake.blobs.keys()].sort();
      expect(keys).toContain('decks/gt-brand/deck.json');
      expect(keys).toContain('decks/gt-brand/slides/content-rule.json');
      expect(keys).toContain('decks/gt-brand/assets/mood-earth-light.png');
      expect(keys.filter((key) => key.startsWith('decks/gt-brand/slides/'))).toHaveLength(
        WORKED_SLIDES.length,
      );
      const state = await a.sync();
      expect(state).toMatchObject({ present: true, pulled: true, revision: 412 });
      expect(existsSync(join(a.dir, 'slides', 'title.json'))).toBe(true);
      expect(existsSync(join(a.dir, 'assets'))).toBe(false);
      fake.calls.length = 0;
      await a.read();
      await a.read();
      // an unchanged manifest costs one head per read and no download
      expect(fake.calls.map((call) => call.op)).toEqual(['head', 'head']);
    });

    it('is a RangeError for a deck the store does not hold', async () => {
      const fake = memoryBlobClient();
      const store = openBlobStore({
        client: fake,
        deckId: 'nope',
        dir: join(root, 'm', 'nope'),
        now,
      });
      await expect(store.read()).rejects.toThrow(/No deck nope in the Blob store/);
      expect(await store.sync()).toMatchObject({ present: false });
    });

    it('commits on a fresh document when the listing lags behind head (Vercel Blob list consistency)', async () => {
      const { fake, a, b } = await blobPair();
      await b.sync();
      // the listing freezes at r412; instance a commits r413
      fake.holdList();
      const first = await a.write({ baseRevision: 412, author: agentA, mutations: [setSize(20)] });
      expect(first.ok).toBe(true);
      // instance b: head sees r413, the listing still says r412; its write must land on r413
      const second = await b.write({
        baseRevision: 413,
        author: agentB,
        mutations: [setSize(22)],
      });
      expect(second.ok).toBe(true);
      if (second.ok) expect(second.revision).toBe(414);
      const list = (await b.read()).document.slides['content-rule'];
      expect(list?.kind === 'content' && list.slots.right?.[0]).toMatchObject({ size: 22 });
      expect((await b.records()).map((r) => r.revision)).toEqual([413, 414]);
      fake.releaseList();
      await a.sync(true);
      expect((await a.read()).document.deck.revision).toBe(414);
    });

    it('commits on a fresh document when the CDN still serves the overwritten bodies (Vercel Blob get lag)', async () => {
      const { fake, a, b } = await blobPair();
      await b.sync();
      // b has read r412; a commits r413; from then on get() answers the r412 bodies while head() is current
      fake.holdGet();
      const first = await a.write({ baseRevision: 412, author: agentA, mutations: [setSize(20)] });
      expect(first.ok).toBe(true);
      const second = await b.write({
        baseRevision: 413,
        author: agentB,
        mutations: [setSize(22)],
      });
      expect(second.ok).toBe(true);
      if (second.ok) expect(second.revision).toBe(414);
      // b derived r413 from a's record, so its document carries a's change under its own
      const list = (await b.read()).document.slides['content-rule'];
      expect(list?.kind === 'content' && list.slots.right?.[0]).toMatchObject({ size: 22 });
      expect((await b.records()).map((r) => r.revision)).toEqual([413, 414]);
      fake.releaseGet();
      await a.sync(true);
      expect((await a.read()).document.deck.revision).toBe(414);
    });

    it('turns a lost commit race into a conflict outcome and converges on the winner', async () => {
      const hooks = {
        beforeCommit: async () => {
          // the other instance commits between this instance's local apply and its push; the
          // closure runs after `pair` below is assigned
          const won = await pair.a.write({
            baseRevision: 412,
            author: agentA,
            mutations: [setSize(20)],
          });
          expect(won.ok).toBe(true);
        },
      };
      const pair = await blobPair(hooks);
      const lost = await pair.b.write({
        baseRevision: 412,
        author: agentB,
        mutations: [setSize(22)],
      });
      expect(lost.ok).toBe(false);
      if (lost.ok || lost.code !== 'conflict') return;
      expect(lost.currentRevision).toBe(413);
      expect(lost.message).toMatch(/Another instance wrote revision 413/);
      const list = lost.current.slides['content-rule'];
      expect(list?.kind === 'content' && list.slots.right?.[0]).toMatchObject({ size: 20 });
      // the loser's mirror holds the winner's files, including the version record
      expect((await pair.b.records()).map((r) => r.mutations)).toEqual([[setSize(20)]]);
      expect(await pair.b.revision()).toBe(413);
      expect(JSON.parse(readFileSync(join(pair.b.dir, 'deck.json'), 'utf8'))).toMatchObject({
        revision: 413,
      });
      expect(blobsOf(pair.fake, 'decks/gt-brand/versions/')).toEqual([
        'decks/gt-brand/versions/1.json',
      ]);
    });

    it('answers a commit that landed between the head read and the pull as a conflict, never an error', async () => {
      // b opens a write against revision 412 and reads the store's head; a commits 413 before b
      // pulls; b's pull proves a's document, so its mirror stands past the head it read. Before
      // the fix this was a StaleMirrorError and a 500 on the route (VERIFICATION-3 finding 19).
      let raced = false;
      const hooks = {
        afterHead: async () => {
          // once: the retry below opens a write too, and must not meet a second commit
          if (raced) return;
          raced = true;
          const won = await pair.a.write({
            baseRevision: 412,
            author: agentA,
            mutations: [setSize(20)],
          });
          expect(won.ok).toBe(true);
        },
      };
      const pair = await blobPair(hooks);
      const lost = await pair.b.write({
        baseRevision: 412,
        author: agentB,
        mutations: [setSize(22)],
      });
      expect(lost.ok).toBe(false);
      if (lost.ok || lost.code !== 'conflict') return;
      expect(lost.currentRevision).toBe(413);
      const list = lost.current.slides['content-rule'];
      expect(list?.kind === 'content' && list.slots.right?.[0]).toMatchObject({ size: 20 });
      expect((await pair.b.records()).map((r) => r.mutations)).toEqual([[setSize(20)]]);
      expect(await pair.b.revision()).toBe(413);
      // the loser retries from the current document and lands
      const retry = await pair.b.write({
        baseRevision: 413,
        author: agentB,
        mutations: [setSize(22)],
      });
      expect(retry.ok).toBe(true);
      if (retry.ok) expect(retry.revision).toBe(414);
    });

    it('drops a write the store did not take and re-reads the truth', async () => {
      const { fake, a, b } = await blobPair();
      fake.failNextPut('decks/gt-brand/deck.json', new Error('network down'));
      await expect(
        a.write({ baseRevision: 412, author: agentA, mutations: [setSize(22)] }),
      ).rejects.toThrow(/network down/);
      expect(await b.revision()).toBe(412);
      expect(await a.revision()).toBe(412);
      expect(await a.listVersions()).toEqual([]);
      const retry = await a.write({ baseRevision: 412, author: agentA, mutations: [setSize(22)] });
      expect(retry.ok).toBe(true);
      expect(await b.revision()).toBe(413);
    });

    it('makes a colliding named version a ConflictError', async () => {
      const { a, b } = await blobPair();
      await a.read();
      await b.read();
      await a.saveVersion(kevin, 'first');
      await expect(b.saveVersion(kevin, 'second')).rejects.toBeInstanceOf(ConflictError);
      expect((await b.listVersions()).map((v) => v.note)).toEqual(['first']);
    });

    it('reports another instance’s write over the watch channel by polling', async () => {
      const { a, b } = await blobPair();
      await b.read();
      const events: StoreEvent[] = [];
      const stop = b.watch((event) => events.push(event));
      await a.write({ baseRevision: 412, author: agentA, mutations: [setSize(22)] });
      // the poll runs every 20 ms here; a loaded machine may need several rounds
      const until = Date.now() + 5000;
      while (events.length === 0 && Date.now() < until) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      stop();
      expect(events.length).toBeGreaterThan(0);
      expect(events[0]).toMatchObject({ type: 'change', revision: 413 });
    });

    it('pulls the twins on request only', async () => {
      const { a } = await blobPair();
      expect(await a.pullAssets()).toBe(
        Object.values(WORKED_DECK.assets).reduce(
          (n, asset) => n + Object.keys(asset.twins).length,
          0,
        ),
      );
      expect(existsSync(join(a.dir, 'assets', 'mood-earth-light.png'))).toBe(true);
      expect(await a.pullAssets()).toBe(0);
    });

    /* gslides-parity SPEC-2 8.2, 0.40: immutable per revision documents */

    it('stores the snapshot keyed by the body md5 before deck.json flips, and the record names it', async () => {
      const { fake, a, b } = await blobPair();
      fake.calls.length = 0;
      const outcome = await a.write({
        baseRevision: 412,
        author: agentA,
        mutations: [setSize(22)],
      });
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      // the key is the md5 of the deck.json bytes the write pushed, which is the etag the store answers
      const head = await fake.head('decks/gt-brand/deck.json');
      const key = etagMd5(head!.version)!;
      expect(key).toMatch(/^[0-9a-f]{32}$/);
      expect(snapshotKey(fake.blobs.get('decks/gt-brand/deck.json')!.bytes)).toBe(key);
      expect(outcome.entry.snapshot).toBe(key);
      expect(fake.blobs.has(`decks/gt-brand/${snapshotPath(key)}`)).toBe(true);
      // the write order: the snapshot, then the manifest, then the slides and the record
      const puts = fake.calls.filter((c) => c.op === 'put').map((c) => c.pathname);
      expect(puts.indexOf(`decks/gt-brand/${snapshotPath(key)}`)).toBeLessThan(
        puts.indexOf('decks/gt-brand/deck.json'),
      );
      expect(puts.indexOf('decks/gt-brand/deck.json')).toBeLessThan(
        puts.indexOf('decks/gt-brand/versions/1.json'),
      );
      // the stored record carries the key, so the peer reads it back
      const records = await b.records();
      expect(records.map((r) => r.snapshot)).toEqual([key]);
      // the snapshot is the whole document
      const body = JSON.parse(
        new TextDecoder().decode(fake.blobs.get(`decks/gt-brand/${snapshotPath(key)}`)!.bytes),
      ) as { deck: { revision: number }; slides: Record<string, unknown> };
      expect(body.deck.revision).toBe(413);
      expect(Object.keys(body.slides)).toHaveLength(WORKED_SLIDES.length);
      expect(await a.snapshots()).toBe(1);
    });

    it('pulls the current document from its snapshot with no slide body read, even when the CDN serves stale bodies', async () => {
      const { fake, a, b } = await blobPair();
      await b.sync();
      // a commits r413; from now on get() answers the r412 bodies for every overwritten path while
      // head() is current; the snapshot is a fresh pathname, so its body is never stale
      fake.holdGet();
      const first = await a.write({ baseRevision: 412, author: agentA, mutations: [setSize(20)] });
      expect(first.ok).toBe(true);
      fake.calls.length = 0;
      const seen = await b.read();
      expect(seen.document.deck.revision).toBe(413);
      const list = seen.document.slides['content-rule'];
      expect(list?.kind === 'content' && list.slots.right?.[0]).toMatchObject({ size: 20 });
      const gets = fake.calls.filter((c) => c.op === 'get').map((c) => c.pathname);
      expect(gets.some((p) => p.startsWith('decks/gt-brand/slides/'))).toBe(false);
      expect(gets.some((p) => p === 'decks/gt-brand/deck.json')).toBe(false);
      expect(gets.filter((p) => p.startsWith('decks/gt-brand/snapshots/'))).toHaveLength(1);
      fake.releaseGet();
    });

    it('two racing writers store two snapshots; the winner’s is served and the loser’s is orphaned and pruned', async () => {
      const hooks = {
        beforeCommit: async () => {
          // the other instance commits a millisecond later, as two function instances do; the
          // manifests differ in updatedAt, so the two bodies get two keys
          clock = '2026-09-11T10:00:00.001Z';
          const won = await pair.a.write({
            baseRevision: 412,
            author: agentA,
            mutations: [setSize(20)],
          });
          expect(won.ok).toBe(true);
        },
      };
      const pair = await blobPair(hooks);
      const lost = await pair.b.write({
        baseRevision: 412,
        author: agentB,
        mutations: [setSize(22)],
      });
      expect(lost.ok).toBe(false);
      // two different bodies, two different keys: the loser stored its snapshot and then failed
      // the conditional manifest push, so its snapshot is named by no record and no etag
      const stored = blobsOf(pair.fake, 'decks/gt-brand/snapshots/');
      expect(stored).toHaveLength(2);
      const head = await pair.fake.head('decks/gt-brand/deck.json');
      const winner = etagMd5(head!.version)!;
      expect(stored).toContain(`decks/gt-brand/${snapshotPath(winner)}`);
      const records = await pair.b.records();
      expect(records.map((r) => r.snapshot)).toEqual([winner]);
      // pull() and documentAtRevision(413) serve the winner's document
      const fresh = openBlobStore({
        client: pair.fake,
        deckId: 'gt-brand',
        dir: join(root, 'mirror-c', 'gt-brand'),
        now,
        syncTtlMs: 0,
      });
      const current = (await fresh.read()).document;
      const list = current.slides['content-rule'];
      expect(list?.kind === 'content' && list.slots.right?.[0]).toMatchObject({ size: 20 });
      const at = await fresh.documentAtRevision(413);
      const atList = at.slides['content-rule'];
      expect(atList?.kind === 'content' && atList.slots.right?.[0]).toMatchObject({ size: 20 });
      // the prune removes the orphan and keeps the winner's
      clock = '2026-09-11T10:30:00.000Z';
      expect(await pair.a.pruneSnapshots()).toBe(1);
      expect(blobsOf(pair.fake, 'decks/gt-brand/snapshots/')).toEqual([
        `decks/gt-brand/${snapshotPath(winner)}`,
      ]);
    });

    it('two writers from one revision inside one clock millisecond contest one key; the second answers a conflict and the served document is the first’s', async () => {
      // the key is the md5 of the manifest bytes: the same base, the same updatedAt and other
      // slides give equal manifests and different bodies, so the name is contested and the
      // writer whose body the name holds is the one whose manifest may flip
      let raced = false;
      const hooks = {
        beforeCommit: async () => {
          // the race is staged once; b's retry at the end of the test commits undisturbed
          if (raced) return;
          raced = true;
          const won = await pair.a.write({
            baseRevision: 412,
            author: agentA,
            mutations: [setSize(20)],
          });
          expect(won.ok ? 'ok' : won.message).toBe('ok');
        },
      };
      const pair = await blobPair(hooks);
      const lost = await pair.b.write({
        baseRevision: 412,
        author: agentB,
        mutations: [setSize(22)],
      });
      expect(lost.ok).toBe(false);
      if (lost.ok || lost.code !== 'conflict') return;
      expect(lost.message).toMatch(/its snapshot took the name this write computed/);
      expect(lost.currentRevision).toBe(413);
      expect(blobsOf(pair.fake, 'decks/gt-brand/snapshots/')).toHaveLength(1);
      // the one snapshot is a's body, and every reader gets a's document
      const list = (await pair.b.read()).document.slides['content-rule'];
      expect(list?.kind === 'content' && list.slots.right?.[0]).toMatchObject({ size: 20 });
      expect(blobsOf(pair.fake, 'decks/gt-brand/versions/')).toEqual([
        'decks/gt-brand/versions/1.json',
      ]);
      // a retry from the current document lands
      clock = '2026-09-11T10:00:00.002Z';
      const retry = await pair.b.write({
        baseRevision: 413,
        author: agentB,
        mutations: [setSize(22)],
      });
      expect(retry.ok).toBe(true);
      expect(await pair.a.revision()).toBe(414);
    });

    it('retention keeps the newest records’ snapshots and every named version’s', async () => {
      const { fake, a } = await blobPair();
      let base = 412;
      const keys: string[] = [];
      for (const [i, size] of [20, 22, 24].entries()) {
        clock = `2026-09-11T10:0${i + 1}:00.000Z`;
        const outcome = await a.write({
          baseRevision: base,
          author: agentA,
          mutations: [setSize(size)],
        });
        expect(outcome.ok).toBe(true);
        if (!outcome.ok) return;
        keys.push(outcome.entry.snapshot!);
        base = outcome.revision;
      }
      // a named version at r415 pins the third snapshot; the record's snapshot is the current one
      await a.saveVersion(kevin, 'pinned');
      const records = await a.records();
      // the retention set over a window of one record: the newest write and the named version's
      const retained = retainedSnapshots(records, 1);
      expect([...retained].sort()).toEqual([keys[2]].sort());
      const entries = await fake.list('decks/gt-brand/snapshots/');
      const doomed = prunableSnapshots(entries, 'decks/gt-brand/', retained, {
        now: Date.parse('2026-09-11T11:00:00.000Z'),
        graceMs: 0,
      });
      expect(doomed.sort()).toEqual(
        keys
          .slice(0, 2)
          .map((k) => `decks/gt-brand/${snapshotPath(k)}`)
          .sort(),
      );
      // a snapshot younger than the grace is left alone whatever the records say: at 10:06:30
      // the 10:01 upload has aged past five minutes and the 10:02 one has not
      expect(
        prunableSnapshots(entries, 'decks/gt-brand/', retained, {
          now: Date.parse('2026-09-11T10:06:30.000Z'),
          graceMs: 5 * 60_000,
        }),
      ).toEqual(keys.slice(0, 1).map((k) => `decks/gt-brand/${snapshotPath(k)}`));
      // the store's own prune keeps the last 50 records' snapshots: nothing goes here
      expect(await a.pruneSnapshots()).toBe(0);
      expect(await a.snapshots()).toBe(3);
    });

    it('documentAtRevision reads the record’s snapshot, and replays a record that carries none', async () => {
      // a record written before the round: a FileStore write on the seed folder, pushed as is
      const seedDeck = join(seedRoot, 'gt-brand');
      const legacy = openFileStore({ dir: seedDeck, now });
      const early = await legacy.write({
        baseRevision: 412,
        author: kevin,
        mutations: [setSize(22)],
      });
      expect(early.ok).toBe(true);
      const { fake, a, b } = await blobPair();
      const records = await a.records();
      expect(records).toHaveLength(1);
      expect(records[0]?.snapshot).toBeUndefined();
      // through the replay: the document before the legacy write
      const before = await a.documentAtRevision(412);
      const beforeList = before.slides['content-rule'];
      expect(beforeList?.kind === 'content' && beforeList.slots.right?.[0]).not.toMatchObject({
        size: 22,
      });
      // a round two write: its record names a snapshot and documentAtRevision reads it
      const outcome = await a.write({
        baseRevision: 413,
        author: agentA,
        mutations: [setSize(24)],
      });
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      fake.calls.length = 0;
      await b.sync(true);
      const at = await b.documentAtRevision(414);
      const atList = at.slides['content-rule'];
      expect(atList?.kind === 'content' && atList.slots.right?.[0]).toMatchObject({ size: 24 });
      const gets = fake.calls.filter((c) => c.op === 'get').map((c) => c.pathname);
      expect(gets).toContain(`decks/gt-brand/${snapshotPath(outcome.entry.snapshot!)}`);
      // the legacy record still replays on the peer
      const legacyAt = await b.documentAtRevision(413);
      const legacyList = legacyAt.slides['content-rule'];
      expect(legacyList?.kind === 'content' && legacyList.slots.right?.[0]).toMatchObject({
        size: 22,
      });
      // and a record whose snapshot is gone falls back to the replay
      fake.blobs.delete(`decks/gt-brand/${snapshotPath(outcome.entry.snapshot!)}`);
      const replayed = await b.documentAtRevision(414);
      const replayedList = replayed.slides['content-rule'];
      expect(replayedList?.kind === 'content' && replayedList.slots.right?.[0]).toMatchObject({
        size: 24,
      });
      const typed: VersionRecord[] = await b.records();
      expect(typed.map((r) => r.n)).toEqual([1, 2]);
    });
  });

  // -------------------------------------------------------------------------------------------
  // Round four (gslides-parity SPEC-4 0.29, 0.31, 0.33, 0.35; MILESTONES-4 B4 item 1)

  describe('round four store seams', () => {
    it('writes in four rounds: the head with the leases, the snapshot with the changed bodies, the commit alone, the record last', async () => {
      const { fake, a } = await blobPair();
      await a.sync();
      fake.calls.length = 0;
      const outcome = await a.write({
        baseRevision: 412,
        author: agentA,
        mutations: [setSize(22)],
      });
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      const ops = fake.calls.map((call) => `${call.op} ${call.pathname}`);
      const at = (needle: string) => ops.findIndex((op) => op.startsWith(needle));
      const key = outcome.entry.snapshot!;
      // round one: the head and the leases read, before anything is put
      const firstPut = ops.findIndex((op) => op.startsWith('put '));
      expect(at('head decks/gt-brand/deck.json')).toBeGreaterThanOrEqual(0);
      expect(at('get decks/gt-brand/leases.json')).toBeGreaterThanOrEqual(0);
      expect(at('head decks/gt-brand/deck.json')).toBeLessThan(firstPut);
      expect(at('get decks/gt-brand/leases.json')).toBeLessThan(firstPut);
      // round two: the snapshot and the changed slide body both precede the manifest
      const commit = at('put decks/gt-brand/deck.json');
      expect(at(`put decks/gt-brand/${snapshotPath(key)}`)).toBeLessThan(commit);
      expect(at('put decks/gt-brand/slides/content-rule.json')).toBeLessThan(commit);
      // round three is the commit alone, round four the record: the puts are the two bodies of
      // round two in either order, then the manifest, then the record and nothing else
      const puts = ops.filter((op) => op.startsWith('put '));
      expect(puts.slice(0, -2).sort()).toEqual(
        [
          `put decks/gt-brand/${snapshotPath(key)}`,
          'put decks/gt-brand/slides/content-rule.json',
        ].sort(),
      );
      expect(puts[puts.length - 2]).toBe('put decks/gt-brand/deck.json');
      expect(puts[puts.length - 1]).toBe('put decks/gt-brand/versions/1.json');
      expect(at('put decks/gt-brand/versions/1.json')).toBeGreaterThan(commit);
      expect(ops.filter((op) => op.startsWith('del '))).toEqual([]);
    });

    it('deletes a removed slide body after the commit and before the record', async () => {
      const { fake, a, b } = await blobPair();
      await a.sync();
      fake.calls.length = 0;
      const outcome = await a.write({
        baseRevision: 412,
        author: agentA,
        mutations: [{ op: 'slide.remove', slideId: 'thesis' }],
      });
      expect(outcome.ok).toBe(true);
      const ops = fake.calls.map((call) => `${call.op} ${call.pathname}`);
      const commit = ops.indexOf('put decks/gt-brand/deck.json');
      const del = ops.indexOf('del decks/gt-brand/slides/thesis.json');
      const record = ops.indexOf('put decks/gt-brand/versions/1.json');
      expect(commit).toBeGreaterThanOrEqual(0);
      expect(del).toBeGreaterThan(commit);
      expect(record).toBeGreaterThan(del);
      expect(fake.blobs.has('decks/gt-brand/slides/thesis.json')).toBe(false);
      // the peer reads the document without the slide
      const seen = await b.read();
      expect(seen.document.slides['thesis']).toBeUndefined();
    });

    it('lists the decks from their manifests through origin reads, and opens no mirror for them', async () => {
      const fake = memoryBlobClient();
      const first = collection('blob', join(root, 'overlay-list-1'), fake);
      await first.ready();
      clock = '2026-09-14T11:00:00.000Z';
      await first.create({ name: 'Second deck', from: 'blank' });
      // another instance moves one manifest's title straight in the store
      const stored = fake.blobs.get('decks/second-deck/deck.json')!;
      const manifest = JSON.parse(new TextDecoder().decode(stored.bytes)) as {
        title: string;
        updatedAt: string;
      };
      manifest.title = 'Renamed elsewhere';
      manifest.updatedAt = '2026-09-14T12:00:00.000Z';
      await fake.put(
        'decks/second-deck/deck.json',
        new TextEncoder().encode(JSON.stringify(manifest)),
        { overwrite: true },
      );
      const second = collection('blob', join(root, 'overlay-list-2'), fake);
      await second.ready();
      fake.calls.length = 0;
      const heads = await second.list();
      expect(heads.map((head) => [head.id, head.title])).toEqual([
        ['second-deck', 'Renamed elsewhere'],
        ['gt-brand', WORKED_DECK.title],
      ]);
      const gt = heads.find((head) => head.id === 'gt-brand')!;
      expect(gt).toMatchObject({
        slides: WORKED_SLIDES.length,
        sections: WORKED_DECK.sections.length,
        revision: 412,
        updatedAt: WORKED_DECK.updatedAt,
        createdAt: WORKED_DECK.createdAt,
      });
      // one folders call and one origin read per deck; no head, no list of a deck prefix
      const ops = fake.calls.map((call) => call.op);
      expect(ops.filter((op) => op === 'folders')).toHaveLength(1);
      expect(
        fake.calls
          .filter((call) => call.op === 'get')
          .map((call) => call.pathname)
          .sort(),
      ).toEqual(['decks/gt-brand/deck.json', 'decks/second-deck/deck.json']);
      expect(ops).not.toContain('list');
      expect(ops).not.toContain('head');
      // no mirror was written for the listed decks on this instance
      expect(existsSync(join(second.decksDir, 'second-deck'))).toBe(false);
      // the trash filter reads the manifest's stamp
      await first.trash('second-deck');
      expect((await second.list()).map((head) => head.id)).toEqual(['gt-brand']);
      expect((await second.list({ includeTrashed: true })).map((head) => head.id)).toEqual([
        'second-deck',
        'gt-brand',
      ]);
    });

    it('keeps the thumbnail cache out of the mirror and prunes it to the newest three stamps per slide and theme', async () => {
      const { fake, a } = await blobPair();
      const png = new Uint8Array([1, 2, 3]);
      const stamps = ['aaaa0001', 'aaaa0002', 'aaaa0003', 'aaaa0004'];
      for (const [i, stamp] of stamps.entries()) {
        clock = `2026-09-14T10:0${i}:00.000Z`;
        for (const width of [320, 160])
          await fake.put(thumbPathname('gt-brand', stamp, 'dark', width, 'title'), png, {
            overwrite: true,
          });
        await fake.put(thumbPathname('gt-brand', stamp, 'light', 320, 'title'), png, {
          overwrite: true,
        });
      }
      await fake.put(thumbPathname('gt-brand', 'bbbb0001', 'dark', 320, 'thesis'), png, {
        overwrite: true,
      });
      expect(isMirroredDocument('.thumbs/aaaa0001/dark@320/title.png')).toBe(false);
      expect(
        parseThumbPathname(thumbPathname('gt-brand', 'aaaa0001', 'dark', 320, 'title')),
      ).toEqual({
        deckId: 'gt-brand',
        stamp: 'aaaa0001',
        theme: 'dark',
        width: 320,
        slideId: 'title',
      });
      // a pull sees the cache in the listing and fetches nothing of it
      fake.calls.length = 0;
      await a.sync(true);
      const gets = fake.calls.filter((c) => c.op === 'get').map((c) => c.pathname);
      expect(gets.some((p) => p.includes('/.thumbs/'))).toBe(false);
      // the newest stored thumb of a slide and theme at a width
      const newest = storedThumbs(
        await fake.list(thumbsPrefix('gt-brand')),
        'gt-brand',
        'title',
        'dark',
        320,
      );
      expect(newest.map((row) => row.key.stamp)).toEqual([
        'aaaa0004',
        'aaaa0003',
        'aaaa0002',
        'aaaa0001',
      ]);
      // the prune: the oldest stamp goes at every width; the light theme and the other slide stay
      const doomed = await pruneThumbs(fake, 'gt-brand', 'title', 'dark');
      expect(doomed.sort()).toEqual([
        thumbPathname('gt-brand', 'aaaa0001', 'dark', 160, 'title'),
        thumbPathname('gt-brand', 'aaaa0001', 'dark', 320, 'title'),
      ]);
      expect(fake.blobs.has(thumbPathname('gt-brand', 'aaaa0001', 'light', 320, 'title'))).toBe(
        true,
      );
      expect(fake.blobs.has(thumbPathname('gt-brand', 'bbbb0001', 'dark', 320, 'thesis'))).toBe(
        true,
      );
      expect(fake.blobs.has(thumbPathname('gt-brand', 'aaaa0002', 'dark', 320, 'title'))).toBe(
        true,
      );
      expect(await pruneThumbs(fake, 'gt-brand', 'title', 'dark')).toEqual([]);
    });

    it('fetches a seed deck’s twins from the static source when neither the bundle nor the store holds them (SPEC-4 0.35)', async () => {
      // a seed whose bundle carries no twins (SEED_PATTERN dropped assets/**)
      const bare = join(root, 'seed-bare');
      writeSeedDecks(bare);
      rmSync(join(bare, 'gt-brand', 'assets'), { recursive: true, force: true });
      const fake = memoryBlobClient();
      const fetched: string[] = [];
      const fetchAsset = async (deckId: string, relative: string): Promise<Uint8Array | null> => {
        fetched.push(`${deckId}/${relative}`);
        return relative.endsWith('.png') ? PNG : null;
      };
      const decks = openHostedDecks({
        selection: selectStore({ TURBOSLIDE_STORE: 'blob', BLOB_READ_WRITE_TOKEN: 'test' }),
        workspaceDecksDir: null,
        overlayRoot: join(root, 'overlay-bare'),
        seed: directorySeed(bare),
        blob: fake,
        fetchAsset,
        now,
      });
      await decks.ready();
      // the seed went up with its twins fetched from the static source
      expect(fake.blobs.has('decks/gt-brand/assets/mood-earth-light.png')).toBe(true);
      const twinCount = Object.values(WORKED_DECK.assets).reduce(
        (sum, asset) => sum + Object.keys(asset.twins).length,
        0,
      );
      expect(fetched.filter((row) => row.startsWith('gt-brand/'))).toHaveLength(twinCount);
      // a render's ensureAssets and the template copy find the twins on disk
      await decks.ensureAssets('gt-brand');
      expect(await decks.assetFile('gt-brand', 'mood-earth-light.png')).not.toBeNull();
      clock = '2026-09-14T11:00:00.000Z';
      const created = await decks.create({ name: 'From template', from: 'gt-brand' });
      expect(created.counts.assets).toBe(Object.keys(WORKED_DECK.assets).length);
      expect(
        existsSync(join(decks.decksDir, 'from-template', 'assets', 'mood-earth-light.png')),
      ).toBe(true);
    });
  });

  // -------------------------------------------------------------------------------------------

  type Kind = 'tmp' | 'blob';

  function collection(kind: Kind, overlay: string, fake: FakeBlobClient | null): HostedDecks {
    return openHostedDecks({
      selection:
        kind === 'tmp'
          ? selectStore({ TURBOSLIDE_STORE: 'tmp' })
          : selectStore({ TURBOSLIDE_STORE: 'blob', BLOB_READ_WRITE_TOKEN: 'test' }),
      workspaceDecksDir: null,
      overlayRoot: overlay,
      seed: directorySeed(seedRoot),
      blob: fake,
      now,
    });
  }

  describe.each<Kind>(['tmp', 'blob'])('%s collection', (kind) => {
    let fake: FakeBlobClient | null;
    let decks: HostedDecks;

    beforeEach(() => {
      fake = kind === 'blob' ? memoryBlobClient() : null;
      decks = collection(kind, join(root, 'overlay-1'), fake);
    });

    it('materializes the documents on ready and the twins on demand', async () => {
      await decks.ready();
      expect(existsSync(join(decks.decksDir, 'gt-brand', 'deck.json'))).toBe(true);
      expect(existsSync(join(decks.decksDir, 'templates', 'gt-brand', 'template.json'))).toBe(true);
      expect(existsSync(join(decks.decksDir, 'gt-brand', 'assets'))).toBe(kind === 'blob');
      expect((await decks.list()).map((head) => head.id)).toEqual(['gt-brand']);
      expect(await decks.has('gt-brand')).toBe(true);
      expect(await decks.has('nope')).toBe(false);
      await expect(decks.open('nope')).rejects.toThrow(RangeError);
      const store = await decks.open('gt-brand');
      expect((await store.read()).document.deck.revision).toBe(412);
      const twin = await decks.assetFile('gt-brand', 'mood-earth-light.png');
      expect(twin).toBe(join(decks.decksDir, 'gt-brand', 'assets', 'mood-earth-light.png'));
      expect(readFileSync(twin!)).toEqual(Buffer.from(PNG));
      expect(await decks.assetFile('gt-brand', '../deck.json')).toBeNull();
      expect(await decks.assetFile('gt-brand', 'missing.png')).toBeNull();
    });

    it('creates a deck from the template with the twins and lists it first', async () => {
      clock = '2026-09-11T11:00:00.000Z';
      const created = await decks.create({ name: 'Second deck', from: 'gt-brand' });
      expect(created).toMatchObject({ deckId: 'second-deck', revision: 0 });
      expect(created.counts.slides).toBe(WORKED_SLIDES.length);
      expect(
        existsSync(join(decks.decksDir, 'second-deck', 'assets', 'mood-earth-light.png')),
      ).toBe(true);
      expect((await decks.list()).map((head) => head.id)).toEqual(['second-deck', 'gt-brand']);
      const store = await decks.open('second-deck');
      const outcome = await store.write({
        baseRevision: 0,
        author: kevin,
        mutations: [setSize(22)],
      });
      expect(outcome.ok).toBe(true);
      await expect(decks.create({ name: 'Second deck', from: 'gt-brand' })).rejects.toThrow(
        /exists already/,
      );
      const blank = await decks.create({ name: 'Notes', from: 'blank' });
      expect(blank.counts).toEqual({ slides: 1, sections: 1, assets: 0 });
    });

    it('copies, trashes, restores and removes a deck (gslides-parity SPEC 7.5)', async () => {
      clock = '2026-09-12T05:00:00.000Z';
      const copy = await decks.copy({
        id: 'gt-brand',
        name: 'GT copy',
        slideIds: ['title', 'thesis'],
        removeNotes: true,
      });
      expect(copy).toMatchObject({
        deckId: 'gt-copy',
        sourceDeckId: 'gt-brand',
        revision: 0,
        counts: { slides: 2, sections: 1 },
      });
      expect(existsSync(join(decks.decksDir, 'gt-copy', 'assets', 'mood-earth-light.png'))).toBe(
        true,
      );
      if (fake !== null) {
        expect(blobsOf(fake, 'decks/gt-copy/')).toContain('decks/gt-copy/deck.json');
        expect(blobsOf(fake, 'decks/gt-copy/')).toContain(
          'decks/gt-copy/assets/mood-earth-light.png',
        );
      }
      const copied = await (await decks.open('gt-copy')).read();
      expect(Object.keys(copied.document.slides).sort()).toEqual(['thesis', 'title']);
      expect(copied.document.slides.thesis).not.toHaveProperty('notes');
      expect((await decks.list()).map((head) => head.id)).toEqual(['gt-copy', 'gt-brand']);
      await expect(decks.copy({ id: 'gt-brand', name: 'GT copy' }, 412)).rejects.toThrow(
        /exists already/,
      );
      await expect(decks.copy({ id: 'gt-brand', name: 'Stale' }, 7)).rejects.toThrow(/stale/);

      // the trash: hidden from the list, present with includeTrashed, the revision untouched
      clock = '2026-09-12T05:10:00.000Z';
      const trashed = await decks.trash('gt-copy', 0);
      expect(trashed).toEqual({ id: 'gt-copy', trashedAt: clock, revision: 0 });
      expect((await decks.list()).map((head) => head.id)).toEqual(['gt-brand']);
      const withTrash = await decks.list({ includeTrashed: true });
      expect(withTrash.find((head) => head.id === 'gt-copy')?.trashedAt).toBe(clock);
      expect(await decks.has('gt-copy')).toBe(true);
      const inTrash = await (await decks.open('gt-copy')).read();
      expect(inTrash.document.deck.trashedAt).toBe(clock);
      await expect(decks.trash('gt-copy', 5)).rejects.toThrow(/stale/);
      const restored = await decks.restore('gt-copy', 0);
      expect(restored).toEqual({ id: 'gt-copy', trashedAt: null, revision: 0 });
      expect((await decks.list()).map((head) => head.id)).toEqual(['gt-copy', 'gt-brand']);
      expect((await (await decks.open('gt-copy')).read()).document.deck).not.toHaveProperty(
        'trashedAt',
      );

      // delete forever
      expect(await decks.remove('gt-copy', 0)).toEqual({ id: 'gt-copy', removed: true });
      expect(await decks.has('gt-copy')).toBe(false);
      expect((await decks.list({ includeTrashed: true })).map((head) => head.id)).toEqual([
        'gt-brand',
      ]);
      expect(existsSync(join(decks.decksDir, 'gt-copy'))).toBe(false);
      if (fake !== null) expect(blobsOf(fake, 'decks/gt-copy/')).toEqual([]);
      await expect(decks.remove('gt-copy')).rejects.toThrow(RangeError);
      await expect(decks.open('gt-copy')).rejects.toThrow(RangeError);
    });

    it('describes itself', () => {
      const facts = decks.facts();
      expect(facts.store).toBe(kind);
      expect(facts.seed).toMatch(/^directory:/);
      if (kind === 'tmp') {
        expect(facts.persistent).toBe(false);
        expect(facts.notice).toBe(NOT_PERSISTENT_NOTICE);
        expect(decks.persistent).toBe(false);
      } else {
        expect(facts.persistent).toBe(true);
        expect(facts.notice).toBeNull();
      }
    });
  });

  describe('blob collection across instances', () => {
    it('uploads the seed once, shares created decks and serves twins by URL', async () => {
      const fake = memoryBlobClient();
      const first = collection('blob', join(root, 'overlay-1'), fake);
      await first.ready();
      const seedPuts = fake.calls.filter(
        (call) => call.op === 'put' && call.pathname === 'decks/gt-brand/deck.json',
      );
      expect(seedPuts).toHaveLength(1);
      clock = '2026-09-11T11:00:00.000Z';
      await first.create({ name: 'Second deck', from: 'gt-brand' });

      // another instance: a fresh overlay, no local knowledge, the same store
      const second = collection('blob', join(root, 'overlay-2'), fake);
      await second.ready();
      expect(
        fake.calls.filter(
          (call) => call.op === 'put' && call.pathname === 'decks/gt-brand/deck.json',
        ),
      ).toHaveLength(1);
      expect((await second.list()).map((head) => head.id)).toEqual(['second-deck', 'gt-brand']);
      const store = await second.open('second-deck');
      expect((await store.read()).document.deck.title).toBe('Second deck');
      // the twins of a deck made elsewhere are not on this instance; the store URL serves them
      expect(await second.assetFile('second-deck', 'mood-earth-light.png')).toBeNull();
      expect(await second.assetUrl('second-deck', 'mood-earth-light.png')).toBe(
        `${fake.base}/decks/second-deck/assets/mood-earth-light.png`,
      );
      expect(await second.assetUrl('second-deck', 'missing.png')).toBeNull();
      expect(await second.assetUrl('second-deck', '../deck.json')).toBeNull();

      // a write on the second instance reaches the first
      const outcome = await store.write({
        baseRevision: 0,
        author: kevin,
        mutations: [setSize(22)],
      });
      expect(outcome.ok).toBe(true);
      expect(await (await first.open('second-deck')).revision()).toBe(1);
    });

    it('answers another instance’s later write through open(), where the overlay alone is stale', async () => {
      /* the studio's lint.run and render.slide read the deck this way (apps/studio/src/server/lint.ts,
         render.ts): open() pulls the mirror before read(). A FileStore over the instance's overlay
         folder answers whatever that instance last pulled, which is how the window API's lint.run
         on a deployment counted another instance's writes late (the editor depth round). */
      const fake = memoryBlobClient();
      const first = collection('blob', join(root, 'overlay-1'), fake);
      await first.ready();
      clock = '2026-09-11T11:00:00.000Z';
      await first.create({ name: 'Second deck', from: 'gt-brand' });
      const a = await first.open('second-deck');
      expect((await a.write({ baseRevision: 0, author: kevin, mutations: [setSize(22)] })).ok).toBe(
        true,
      );

      // instance b pulls r1, then a commits r2 behind its back
      const second = collection('blob', join(root, 'overlay-2'), fake);
      await second.ready();
      const seen = await (await second.open('second-deck')).read();
      expect(seen.document.deck.revision).toBe(1);
      expect((await a.write({ baseRevision: 1, author: kevin, mutations: [setSize(24)] })).ok).toBe(
        true,
      );

      // the overlay folder still holds r1: what lint.run read before the fix
      const overlayOnly = await openFileStore({ dir: join(second.decksDir, 'second-deck') }).read();
      expect(overlayOnly.document.deck.revision).toBe(1);
      const staleList = overlayOnly.document.slides['content-rule'];
      expect(staleList?.kind === 'content' && staleList.slots.right?.[0]).toMatchObject({
        size: 22,
      });

      // open() syncs first: the document b lints is a's r2
      const synced = await (await second.open('second-deck')).read();
      expect(synced.document.deck.revision).toBe(2);
      const list = synced.document.slides['content-rule'];
      expect(list?.kind === 'content' && list.slots.right?.[0]).toMatchObject({ size: 24 });
    });

    it('shows one instance’s trash stamp and removal to another', async () => {
      const fake = memoryBlobClient();
      const first = collection('blob', join(root, 'overlay-1'), fake);
      await first.ready();
      clock = '2026-09-11T11:00:00.000Z';
      await first.create({ name: 'Second deck', from: 'gt-brand' });
      const second = collection('blob', join(root, 'overlay-2'), fake);
      await second.ready();
      expect((await second.list()).map((head) => head.id)).toEqual(['second-deck', 'gt-brand']);
      clock = '2026-09-12T06:00:00.000Z';
      await first.trash('second-deck');
      expect((await second.list()).map((head) => head.id)).toEqual(['gt-brand']);
      expect(
        (await second.list({ includeTrashed: true })).find((h) => h.id === 'second-deck')
          ?.trashedAt,
      ).toBe(clock);
      // a write on the second instance still lands on the trashed deck, and keeps the stamp
      const store = await second.open('second-deck');
      const outcome = await store.write({
        baseRevision: 0,
        author: kevin,
        mutations: [setSize(22)],
      });
      expect(outcome.ok).toBe(true);
      expect((await (await first.open('second-deck')).read()).document.deck).toMatchObject({
        revision: 1,
        trashedAt: clock,
      });
      await second.restore('second-deck', 1);
      expect((await first.list()).map((head) => head.id)).toEqual(['second-deck', 'gt-brand']);
      await first.remove('second-deck', 1);
      expect(await second.has('second-deck')).toBe(false);
      expect((await second.list()).map((head) => head.id)).toEqual(['gt-brand']);
    });

    it('refuses to open without a client', () => {
      expect(() => collection('blob', join(root, 'overlay-3'), null)).toThrow(
        /needs a Blob client/,
      );
    });

    it('serves a picture added on one instance from the next (SPEC-3 0.39, report 10 F49)', async () => {
      /* Before putAsset, a hosted asset.add wrote its twin into instance A's overlay only, so the
         record reached the store inside the next deck.json while the bytes never did: instance B
         rendered a broken image and an export on B found nothing under assets/ (report 10 F49,
         the two instance case). The action now puts the bytes through the deck's store before
         the record commits; this case stages the two calls the action makes and reads the twin
         from a second instance that never saw A's disk. It fails at 61b16e4, where putAsset does
         not exist. */
      const fake = memoryBlobClient();
      const first = collection('blob', join(root, 'overlay-1'), fake);
      await first.ready();
      clock = '2026-09-13T09:00:00.000Z';
      await first.create({ name: 'Second deck', from: 'gt-brand' });
      const a = await first.open('second-deck');

      // 1. the bytes go to the store under a digest name, overwrite refused
      const twin = digestAssetName('mood-sea', PNG, '-light.png');
      const put = await a.putAsset(twin, PNG, 'image/png');
      expect(put).toMatchObject({ relative: twin, existed: false });
      expect(put.url).toBe(`${fake.base}/decks/second-deck/${twin}`);
      expect(existsSync(put.path)).toBe(true);
      expect(blobsOf(fake, 'decks/second-deck/assets/')).toContain(`decks/second-deck/${twin}`);
      // the same bytes again are the same file; other bytes under the name are refused and the
      // stored file is untouched (SPEC-3 0.26: nothing on the public store is overwritten)
      expect((await a.putAsset(twin, PNG)).existed).toBe(true);
      await expect(a.putAsset(twin, new Uint8Array([9, 9, 9]))).rejects.toBeInstanceOf(
        AssetExistsError,
      );
      expect(fake.blobs.get(`decks/second-deck/${twin}`)?.bytes).toEqual(PNG);

      // 2. the record commits through the same store, as commitAssets does
      const asset: Asset = {
        ...MOOD_EARTH,
        id: 'mood-sea',
        alt: 'the sea',
        twins: { light: twin, dark: twin },
        size: [4, 4],
      };
      const outcome = await a.write({
        baseRevision: 0,
        author: kevin,
        mutations: [{ op: 'asset.set', asset }],
      });
      expect(outcome.ok).toBe(true);

      // 3. instance B: a fresh overlay, no local knowledge of A's disk
      const second = collection('blob', join(root, 'overlay-2'), fake);
      await second.ready();
      const b = await second.open('second-deck');
      expect((await b.read()).document.deck.assets['mood-sea']?.twins).toEqual({
        light: twin,
        dark: twin,
      });
      expect(await second.assetFile('second-deck', twin.slice('assets/'.length))).toBeNull();
      expect(await second.assetUrl('second-deck', twin.slice('assets/'.length))).toBe(put.url);
      await second.ensureAssets('second-deck');
      const file = await second.assetFile('second-deck', twin.slice('assets/'.length));
      expect(file).not.toBeNull();
      expect(new Uint8Array(readFileSync(file as string))).toEqual(PNG);

      // 4. removal on B is removal everywhere; a miss is never cached, so a twin put after a
      // miss is found on the next request (the editor asks for the image before the record lands)
      const later = digestAssetName('mood-sea', new Uint8Array([7, 7]), '-dark.png');
      expect(await second.assetUrl('second-deck', later.slice('assets/'.length))).toBeNull();
      await a.putAsset(later, new Uint8Array([7, 7]));
      expect(await second.assetUrl('second-deck', later.slice('assets/'.length))).toBe(
        `${fake.base}/decks/second-deck/${later}`,
      );
      await b.removeAsset(twin);
      expect(fake.blobs.has(`decks/second-deck/${twin}`)).toBe(false);
      expect(await first.assetUrl('second-deck', twin.slice('assets/'.length))).toBeNull();
      // the instance that asked before the removal keeps the old address in its URL cache; the
      // store answers 404 there, as it does for any deleted file, and digest names never return
      expect(await second.assetUrl('second-deck', twin.slice('assets/'.length))).toBe(put.url);
    });
  });
});

/** The stored pathnames under a prefix, sorted. */
function blobsOf(client: FakeBlobClient, prefix: string): string[] {
  return [...client.blobs.keys()].filter((key) => key.startsWith(prefix)).sort();
}
