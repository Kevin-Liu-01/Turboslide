// The hosted backends against one seed: the DeckStore contract runs over FileStore and over
// BlobStore (an in-memory Blob fake, two store instances standing in for two function
// instances), the Blob races end in one commit and one conflict, and the tmp and blob
// collections materialize the seed, list, open, create and serve twins the same way.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ConflictError } from '@turboslide/schema/errors';
import { WORKED_DECK, WORKED_SLIDES } from '@turboslide/schema/fixtures';
import { canonicalJson } from '@turboslide/schema/json';
import type { Author, Mutation } from '@turboslide/schema/mutations';

import { memoryBlobClient } from './blob-fake.ts';
import type { FakeBlobClient } from './blob-fake.ts';
import { openBlobStore, pushDeckDir } from './blob-store.ts';
import type { BlobStore } from './blob-store.ts';
import { openFileStore } from './file-store.ts';
import { openHostedDecks } from './hosted.ts';
import type { HostedDecks } from './hosted.ts';
import { directorySeed, materializeSeed } from './seed.ts';
import { NOT_PERSISTENT_NOTICE, selectStore } from './select.ts';
import type { DeckStore, StoreEvent } from './store.ts';

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
  }): Promise<{ fake: FakeBlobClient; a: BlobStore; b: BlobStore }> {
    const fake = memoryBlobClient();
    await pushDeckDir(fake, 'gt-brand', join(seedRoot, 'gt-brand'), { overwrite: false });
    const a = openBlobStore({
      client: fake,
      deckId: 'gt-brand',
      dir: join(root, 'mirror-a', 'gt-brand'),
      now,
      syncTtlMs: 0,
      pollMs: 20,
    });
    const b = openBlobStore({
      client: fake,
      deckId: 'gt-brand',
      dir: join(root, 'mirror-b', 'gt-brand'),
      now,
      syncTtlMs: 0,
      pollMs: 20,
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
  });
});

/** The stored pathnames under a prefix, sorted. */
function blobsOf(client: FakeBlobClient, prefix: string): string[] {
  return [...client.blobs.keys()].filter((key) => key.startsWith(prefix)).sort();
}
