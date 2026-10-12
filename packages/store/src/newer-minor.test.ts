// RELIABILITY-19 (hardening HR-O#5) through the store: a deck a newer release wrote, with fields
// this release does not know on a slide of a higher `schemaMinor`, opens, saves and keeps them;
// removing that slide writes a record whose inverse holds the slide, and the log reads back; a
// record of an older shape (an unversioned slide in a slide.insert) replays through the chain.
// The wave 3b verify's finding 1: a write whose record carries a block or a section with a kept
// field (a block.remove, a restore's section.set) commits whole with a stamped record on the file
// and the Blob stores, a record that cannot be written changes no file, and a Blob mirror a local
// apply left part way is discarded before the instance's next write.
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WORKED_DECK, WORKED_SLIDES } from '@turboslide/schema/fixtures';
import { canonicalJson } from '@turboslide/schema/json';
import type { Author } from '@turboslide/schema/mutations';
import { validateDocument } from '@turboslide/schema/validate';

import { memoryBlobClient } from './blob-fake.ts';
import { openBlobStore, pushDeckDir } from './blob-store.ts';
import { openFileStore, slidePath } from './file-store.ts';
import type { FileStore } from './file-store.ts';
import { parseVersionRecord, readVersions, versionRecordText } from './versions.ts';

type Json = Record<string, unknown>;
const agent: Author = { kind: 'agent', name: 'agent', runId: 'o5' };

/** The worked deck as this release writes it: normalized, canonical. */
function normalized(): { deck: Json; slides: Json[] } {
  const result = validateDocument({
    deck: structuredClone(WORKED_DECK),
    slides: Object.fromEntries(WORKED_SLIDES.map((slide) => [slide.id, structuredClone(slide)])),
  });
  if (!result.ok || result.deck === null) throw new Error('fixture');
  const json = (value: unknown): Json => JSON.parse(canonicalJson(value)) as Json;
  return { deck: json(result.deck), slides: Object.values(result.slides).map(json) };
}

/** `object` with `entries` placed right after the key `after`. */
function withAfter(object: Json, after: string, entries: Json): Json {
  const out: Json = {};
  for (const [key, value] of Object.entries(object)) {
    out[key] = value;
    if (key === after) Object.assign(out, entries);
  }
  return out;
}

/** content-rule as a release of minor 1 writes it, with a slide field and a block field it added. */
function newer(slide: Json): Json {
  const stamped = withAfter(withAfter(slide, 'schemaVersion', { schemaMinor: 1 }), 'kind', {
    futureFrame: { inset: 12 },
  });
  const slots = stamped.slots as { left: Json[] };
  const heading = slots.left[0];
  if (heading === undefined) throw new Error('fixture');
  slots.left[0] = withAfter(heading, 'type', { futureShadow: 'soft' });
  return stamped;
}

describe('a deck a newer minor wrote (RELIABILITY-19)', () => {
  let root: string;
  let dir: string;
  let store: FileStore;
  let newerText: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'turboslide-o5-'));
    dir = join(root, 'decks', 'gt-brand');
    mkdirSync(join(dir, 'slides'), { recursive: true });
    const { deck, slides } = normalized();
    writeFileSync(join(dir, 'deck.json'), canonicalJson(deck));
    for (const slide of slides) {
      const text = canonicalJson(slide.id === 'content-rule' ? newer(slide) : slide);
      if (slide.id === 'content-rule') newerText = text;
      writeFileSync(slidePath(dir, String(slide.id)), text);
    }
    store = openFileStore({ dir, now: () => '2026-10-12T05:00:00.000Z' });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('opens, and says which fields it kept', async () => {
    const read = await store.read();
    expect(read.ok, read.issues.map((row) => row.message).join('; ')).toBe(true);
    expect(read.issues.filter((row) => row.code === 'kept').map((row) => row.pointer)).toEqual([
      '/futureFrame',
      '/slots/left/0/futureShadow',
    ]);
  });

  it('saves a change to the slide and writes the fields back unchanged', async () => {
    const outcome = await store.write({
      baseRevision: 412,
      author: agent,
      mutations: [
        { op: 'block.set', slideId: 'content-rule', blockId: 'p1', path: '/text', value: 'Short.' },
      ],
    });
    expect(outcome.ok, outcome.ok ? '' : outcome.message).toBe(true);
    const expected = JSON.parse(newerText) as Json;
    const p1 = (expected.slots as { left: Json[] }).left[1];
    if (p1 === undefined) throw new Error('fixture');
    p1.text = 'Short.';
    expect(readFileSync(slidePath(dir, 'content-rule'), 'utf8')).toBe(canonicalJson(expected));
  });

  it('removes the slide, keeps it whole in the record, and restores it byte equal', async () => {
    const removed = await store.write({
      baseRevision: 412,
      author: agent,
      mutations: [{ op: 'slide.remove', slideId: 'content-rule' }],
    });
    expect(removed.ok, removed.ok ? '' : removed.message).toBe(true);
    const records = readVersions(dir);
    const record = records.at(-1);
    const inverse = record?.inverse[0];
    expect(inverse?.op).toBe('slide.insert');
    expect(inverse?.op === 'slide.insert' && inverse.slide).toMatchObject({
      schemaMinor: 1,
      futureFrame: { inset: 12 },
    });
    // undo is a forward write of the inverse (SPEC 6.7)
    const restored = await store.write({
      baseRevision: 413,
      author: agent,
      mutations: record?.inverse ?? [],
    });
    expect(restored.ok, restored.ok ? '' : restored.message).toBe(true);
    expect(readFileSync(slidePath(dir, 'content-rule'), 'utf8')).toBe(newerText);
  });
});

describe('a version record through the documents chain (RELIABILITY-19)', () => {
  const base = {
    n: 3,
    revision: 5,
    baseRevision: 4,
    author: agent,
    note: '',
    createdAt: '2026-10-12T05:00:00.000Z',
  };

  it('stamps an unversioned slide a slide.insert holds', () => {
    const slide = normalized().slides.find((row) => row.id === 'content-rule');
    if (slide === undefined) throw new Error('fixture');
    delete slide.schemaVersion;
    const text = JSON.stringify({
      ...base,
      mutations: [{ op: 'slide.insert', sectionId: 'brand', slide }],
      inverse: [{ op: 'slide.remove', slideId: 'content-rule' }],
    });
    const record = parseVersionRecord(text, 'versions/3.json');
    const insert = record.mutations[0];
    expect(insert?.op === 'slide.insert' && insert.slide.schemaVersion).toBe(1);
  });

  it('reads a record a newer minor stamped, keeps its field, and writes it back byte equal', () => {
    const text = canonicalJson({
      ...base,
      mutations: [],
      inverse: [],
      schemaMinor: 1,
      futureCause: 'import',
    });
    const record = parseVersionRecord(text, 'versions/3.json');
    expect(versionRecordText(record)).toBe(text);
  });

  it('still refuses a field it does not know on a record of its own minor', () => {
    const text = JSON.stringify({ ...base, mutations: [], inverse: [], futureCause: 'import' });
    expect(() => parseVersionRecord(text, 'versions/3.json')).toThrow(/not a version record/);
  });
});

/** The ids of a slide's left slot, in order. */
function leftIds(slide: unknown): string[] {
  return ((slide as { slots: { left?: { id: string }[] } }).slots.left ?? []).map((b) => b.id);
}

/** The text of a block of a slide's left slot. */
function leftText(slide: unknown, blockId: string): string | undefined {
  const left = (slide as { slots: { left?: { id: string; text?: string }[] } }).slots.left ?? [];
  return left.find((block) => block.id === blockId)?.text;
}

describe('a write whose record carries a kept field (the wave 3b verify, finding 1)', () => {
  let root: string;
  let dir: string;
  let newerText: string;
  const now = (): string => '2026-10-12T05:00:00.000Z';

  /** The worked deck with content-rule of minor 1; `manifest` stamps deck.json and its first section. */
  function seed(manifest = false): void {
    const { deck, slides } = normalized();
    const stamped = manifest ? withAfter(deck, 'schemaVersion', { schemaMinor: 1 }) : deck;
    if (manifest) {
      const sections = stamped.sections as Json[];
      sections[0] = { ...sections[0], futureSection: 'kept' };
    }
    writeFileSync(join(dir, 'deck.json'), canonicalJson(stamped));
    for (const slide of slides) {
      const text = canonicalJson(slide.id === 'content-rule' ? newer(slide) : slide);
      if (slide.id === 'content-rule') newerText = text;
      writeFileSync(slidePath(dir, String(slide.id)), text);
    }
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'turboslide-o5-fix-'));
    dir = join(root, 'seed', 'gt-brand');
    mkdirSync(join(dir, 'slides'), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('FileStore: removes the block, stamps the record with the minor, and the undo puts it back byte equal', async () => {
    seed();
    const store = openFileStore({ dir, now });
    const removed = await store.write({
      baseRevision: 412,
      author: agent,
      mutations: [{ op: 'block.remove', slideId: 'content-rule', blockId: 'h' }],
    });
    expect(removed.ok, removed.ok ? '' : removed.message).toBe(true);
    expect(leftIds(JSON.parse(readFileSync(slidePath(dir, 'content-rule'), 'utf8')))).toEqual([
      'p1',
    ]);
    expect(JSON.parse(readFileSync(join(dir, 'deck.json'), 'utf8')).revision).toBe(413);
    const record = readVersions(dir).at(-1);
    expect(record?.schemaMinor).toBe(1);
    expect(record?.inverse[0]).toMatchObject({
      op: 'block.insert',
      block: { futureShadow: 'soft' },
    });
    const restored = await store.write({
      baseRevision: 413,
      author: agent,
      mutations: record?.inverse ?? [],
    });
    expect(restored.ok, restored.ok ? '' : restored.message).toBe(true);
    expect(readFileSync(slidePath(dir, 'content-rule'), 'utf8')).toBe(newerText);
    // and the log reads back whole: the document at the first record is the one before both
    const before = await store.documentAt(0);
    expect(leftIds(before.slides['content-rule'])).toEqual(['h', 'p1']);
  });

  it('FileStore: a restore across a section field of a newer manifest commits whole', async () => {
    seed(true);
    const store = openFileStore({ dir, now });
    const latest = await store.write({
      baseRevision: 412,
      author: agent,
      mutations: [
        {
          op: 'block.set',
          slideId: 'content-rule',
          blockId: 'p1',
          path: '/text',
          value: 'Latest words',
        },
      ],
    });
    expect(latest.ok, latest.ok ? '' : latest.message).toBe(true);
    const moved = await store.write({
      baseRevision: 413,
      author: agent,
      mutations: [{ op: 'slide.move', slideId: 'content-rule', sectionId: 'website' }],
    });
    expect(moved.ok, moved.ok ? '' : moved.message).toBe(true);
    // version 0 is the deck as seeded: its restore sets p1 back and moves the sections back
    const restore = await store.write({
      baseRevision: 414,
      author: agent,
      mutations: [{ op: 'version.restore', n: 1 }],
    });
    expect(restore.ok, restore.ok ? '' : restore.message).toBe(true);
    const read = await store.read();
    expect(read.document.deck.revision).toBe(415);
    expect(leftText(read.document.slides['content-rule'], 'p1')).toBe('Latest words');
    const manifest = JSON.parse(readFileSync(join(dir, 'deck.json'), 'utf8')) as Json;
    expect((manifest.sections as Json[])[0]).toMatchObject({ futureSection: 'kept' });
    expect(readVersions(dir).map((record) => record.schemaMinor)).toEqual([1, 1, 1]);
  });

  it('FileStore: a record that cannot be written changes no file', async () => {
    seed();
    const store = openFileStore({ dir, now });
    const slideBefore = readFileSync(slidePath(dir, 'content-rule'), 'utf8');
    const deckBefore = readFileSync(join(dir, 'deck.json'), 'utf8');
    // an ops range out of order is refused by the record's schema, after the reducer accepted
    await expect(
      store.write(
        {
          baseRevision: 412,
          author: agent,
          mutations: [{ op: 'block.remove', slideId: 'content-rule', blockId: 'p1' }],
        },
        { ops: { fromSeq: 9, toSeq: 2 } },
      ),
    ).rejects.toThrow();
    expect(readFileSync(slidePath(dir, 'content-rule'), 'utf8')).toBe(slideBefore);
    expect(readFileSync(join(dir, 'deck.json'), 'utf8')).toBe(deckBefore);
    expect(readVersions(dir)).toEqual([]);
  });

  describe('the Blob store, two instances', () => {
    const open = (client: ReturnType<typeof memoryBlobClient>, name: string) =>
      openBlobStore({
        client,
        deckId: 'gt-brand',
        dir: join(root, name, 'gt-brand'),
        now,
        syncTtlMs: 0,
        pollMs: 20,
        snapshotGraceMs: 0,
      });

    it('a removal of a block with a kept field reaches the peer with its record, and the undo restores it', async () => {
      seed();
      const client = memoryBlobClient(undefined, { now });
      await pushDeckDir(client, 'gt-brand', dir, { overwrite: false });
      const a = open(client, 'mirror-a');
      const b = open(client, 'mirror-b');
      const removed = await a.write({
        baseRevision: 412,
        author: agent,
        mutations: [{ op: 'block.remove', slideId: 'content-rule', blockId: 'h' }],
      });
      expect(removed.ok, removed.ok ? '' : removed.message).toBe(true);
      const peer = (await b.read()).document;
      expect(peer.deck.revision).toBe(413);
      expect(leftIds(peer.slides['content-rule'])).toEqual(['p1']);
      const records = await b.records();
      expect(records.map((record) => [record.n, record.schemaMinor])).toEqual([[1, 1]]);
      const undo = await b.write({
        baseRevision: 413,
        author: agent,
        mutations: records[0]?.inverse ?? [],
      });
      expect(undo.ok, undo.ok ? '' : undo.message).toBe(true);
      const body = await client.get('decks/gt-brand/slides/content-rule.json');
      expect(body === null ? null : new TextDecoder().decode(body.bytes)).toBe(newerText);
    });

    it('a restore-shaped write with a section field commits on the instance and the peer reads it', async () => {
      seed(true);
      const client = memoryBlobClient(undefined, { now });
      await pushDeckDir(client, 'gt-brand', dir, { overwrite: false });
      const a = open(client, 'mirror-a');
      const b = open(client, 'mirror-b');
      const latest = await a.write({
        baseRevision: 412,
        author: agent,
        mutations: [
          {
            op: 'block.set',
            slideId: 'content-rule',
            blockId: 'h',
            path: '/text',
            value: 'Latest words',
          },
        ],
      });
      expect(latest.ok, latest.ok ? '' : latest.message).toBe(true);
      const sections = structuredClone((await a.read()).document.deck.sections);
      const brand = sections[0];
      if (brand === undefined) throw new Error('fixture');
      brand.slideIds = [...brand.slideIds.slice(0, -2), ...brand.slideIds.slice(-2).reverse()];
      const restore = await a.write({
        baseRevision: 413,
        author: agent,
        mutations: [
          {
            op: 'block.set',
            slideId: 'content-rule',
            blockId: 'h',
            path: '/text',
            value: 'Older words',
          },
          { op: 'section.set', sections },
        ],
      });
      expect(restore.ok, restore.ok ? '' : restore.message).toBe(true);
      const peer = (await b.read()).document;
      expect(peer.deck.revision).toBe(414);
      expect(leftText(peer.slides['content-rule'], 'h')).toBe('Older words');
      const body = await client.get('decks/gt-brand/slides/content-rule.json');
      expect(
        body === null ? null : leftText(JSON.parse(new TextDecoder().decode(body.bytes)), 'h'),
      ).toBe('Older words');
      expect((await b.records()).map((record) => record.mutations.map((m) => m.op))).toEqual([
        ['block.set'],
        ['block.set', 'section.set'],
      ]);
    });

    // a fault part way through the local apply (here the manifest cannot be written after the slide
    // and the record were): the mirror is discarded, so the instance's next write starts from the
    // store and never publishes the half applied slide. Root writes a read-only file, so it skips
    it.skipIf(process.getuid?.() === 0)(
      'a local apply that fails part way leaves nothing the next write publishes',
      async () => {
        seed();
        const client = memoryBlobClient(undefined, { now });
        await pushDeckDir(client, 'gt-brand', dir, { overwrite: false });
        const a = open(client, 'mirror-a');
        const b = open(client, 'mirror-b');
        await a.read();
        const mirrorDeck = join(root, 'mirror-a', 'gt-brand', 'deck.json');
        chmodSync(mirrorDeck, 0o444);
        await expect(
          a.write({
            baseRevision: 412,
            author: agent,
            mutations: [{ op: 'block.remove', slideId: 'content-rule', blockId: 'p1' }],
          }),
        ).rejects.toThrow();
        if (existsSync(mirrorDeck)) chmodSync(mirrorDeck, 0o644);
        const next = await a.write({
          baseRevision: 412,
          author: agent,
          mutations: [
            {
              op: 'block.set',
              slideId: 'content-rule',
              blockId: 'h',
              path: '/text',
              value: 'Next.',
            },
          ],
        });
        expect(next.ok, next.ok ? '' : next.message).toBe(true);
        const peer = (await b.read()).document;
        expect(peer.deck.revision).toBe(413);
        expect(leftIds(peer.slides['content-rule'])).toEqual(['h', 'p1']);
        expect(leftText(peer.slides['content-rule'], 'h')).toBe('Next.');
        expect((await b.records()).map((record) => record.n)).toEqual([1]);
      },
    );
  });
});
