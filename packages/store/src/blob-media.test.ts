// The media rows of the blob backend (gslides-parity SPEC-5 0.19, 3.3, 11; R11 2; MILESTONES-5
// B2 days 5 and 7): the keyed prefix a restricted deck's media files live under, the year long
// cache age on every asset put, the key rotation, and the deck index written with `ifMatch`,
// coalesced, read past the threshold and rebuilt by `reindex`.
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WORKED_DECK, WORKED_SLIDES } from '@turboslide/schema/fixtures';
import { canonicalJson } from '@turboslide/schema/json';
import type { Author } from '@turboslide/schema/mutations';

import { memoryBlobClient } from './blob-fake.ts';
import type { FakeBlobClient } from './blob-fake.ts';
import {
  ASSET_CACHE_MAX_AGE_S,
  INDEX_PATHNAME,
  deckHeadOfDocument,
  deckIndexBytes,
  keyedAssetPathname,
  keyedPrefix,
  openBlobStore,
  parseDeckIndex,
  pushDeckDir,
} from './blob-store.ts';
import type { BlobPutOptions } from './blob-store.ts';
import { openHostedDecks } from './hosted.ts';
import type { HostedDecks } from './hosted.ts';
import { directorySeed } from './seed.ts';
import { selectStore } from './select.ts';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const WEBM = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4, 5, 6, 7, 8]);
const KEY_A = 'abcdefghijklmnopqrstuv';
const KEY_B = 'ABCDEFGHIJKLMNOPQRSTUV';
const kevin: Author = { kind: 'human', name: 'kevin' };

function writeSeed(root: string): void {
  const deck = join(root, 'gt-brand');
  mkdirSync(join(deck, 'slides'), { recursive: true });
  mkdirSync(join(deck, 'assets'), { recursive: true });
  writeFileSync(join(deck, 'deck.json'), canonicalJson(WORKED_DECK));
  for (const slide of WORKED_SLIDES)
    writeFileSync(join(deck, 'slides', `${slide.id}.json`), canonicalJson(slide));
  for (const asset of Object.values(WORKED_DECK.assets))
    for (const twin of Object.values(asset.twins)) writeFileSync(join(deck, twin), PNG);
  const template = join(root, 'templates', 'gt-brand');
  mkdirSync(join(template, 'slides'), { recursive: true });
  writeFileSync(join(template, 'deck.json'), canonicalJson(WORKED_DECK));
  for (const slide of WORKED_SLIDES)
    writeFileSync(join(template, 'slides', `${slide.id}.json`), canonicalJson(slide));
  writeFileSync(
    join(template, 'template.json'),
    canonicalJson({ id: 'gt-brand', name: 'GT brand', slides: WORKED_SLIDES.map((s) => s.id) }),
  );
}

/** A fake whose put options are kept, so a test reads the cache age and the precondition. */
function recordingClient(): FakeBlobClient & {
  puts: { pathname: string; options: BlobPutOptions }[];
} {
  const fake = memoryBlobClient();
  const puts: { pathname: string; options: BlobPutOptions }[] = [];
  const put = fake.put.bind(fake);
  return Object.assign(fake, {
    puts,
    put: (pathname: string, bytes: Uint8Array, options: BlobPutOptions) => {
      puts.push({ pathname, options });
      return put(pathname, bytes, options);
    },
  });
}

describe('the keyed prefix (SPEC-5 0.19)', () => {
  it('spells d/<deckId>/<assetKey>/<file> and refuses a key outside the grammar', () => {
    expect(keyedPrefix('talk', KEY_A)).toBe(`d/talk/${KEY_A}/`);
    expect(keyedAssetPathname('talk', KEY_A, 'assets/clip.0123abcd.webm')).toBe(
      `d/talk/${KEY_A}/clip.0123abcd.webm`,
    );
    expect(() => keyedPrefix('talk', 'short')).toThrow(/22 base64url/);
    expect(() => keyedAssetPathname('talk', KEY_A, 'clip.webm')).toThrow(/starts with assets\//);
  });
});

describe('the blob store media rows', () => {
  let root: string;
  let seedRoot: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'turboslide-blob-media-'));
    seedRoot = join(root, 'seed');
    writeSeed(seedRoot);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  async function store(fake: FakeBlobClient) {
    await pushDeckDir(fake, 'gt-brand', join(seedRoot, 'gt-brand'), { overwrite: false });
    const s = openBlobStore({
      client: fake,
      deckId: 'gt-brand',
      dir: join(root, 'mirror', 'gt-brand'),
    });
    await s.sync(true);
    return s;
  }

  it('puts every asset with a year of cache age and a keyed media file under the key with its URL', async () => {
    const fake = recordingClient();
    const s = await store(fake);
    const plain = await s.putAsset('assets/poster.0123abcd.png', PNG, 'image/png');
    expect(plain.url).toBe(`${fake.base}/decks/gt-brand/assets/poster.0123abcd.png`);
    const keyed = await s.putKeyedAsset('assets/clip.0123abcd.webm', WEBM, KEY_A, 'video/webm');
    expect(keyed.url).toBe(`${fake.base}/d/gt-brand/${KEY_A}/clip.0123abcd.webm`);
    expect(keyed.relative).toBe('assets/clip.0123abcd.webm');
    // the mirror holds the file under assets/ (this instance's renderer and exporter read it)
    expect(existsSync(join(s.dir, 'assets', 'clip.0123abcd.webm'))).toBe(true);
    expect(fake.blobs.has('decks/gt-brand/assets/clip.0123abcd.webm')).toBe(false);
    for (const put of fake.puts.filter((p) => p.pathname.includes('0123abcd'))) {
      expect(put.options.cacheControlMaxAge).toBe(ASSET_CACHE_MAX_AGE_S);
      expect(put.options.overwrite).toBe(false);
    }
    expect(await s.keyedAssetUrl('assets/clip.0123abcd.webm', KEY_A)).toBe(keyed.url);
    expect(await s.keyedAssetUrl('assets/clip.0123abcd.webm', KEY_B)).toBeNull();
    // the same bytes again are the same file
    const again = await s.putKeyedAsset('assets/clip.0123abcd.webm', WEBM, KEY_A, 'video/webm');
    expect(again.existed).toBe(true);
  });

  it('rotates a key: every file moves under the new key and the old prefix empties', async () => {
    const fake = memoryBlobClient();
    const s = await store(fake);
    await s.putKeyedAsset('assets/clip.0123abcd.webm', WEBM, KEY_A, 'video/webm');
    await s.putKeyedAsset(
      'assets/tone.89abcdef.wav',
      new Uint8Array([82, 73, 70, 70, 1, 2]),
      KEY_A,
      'audio/wav',
    );
    const moved = await s.rotateAssetKey(KEY_A, KEY_B);
    expect(moved.moved).toEqual(['clip.0123abcd.webm', 'tone.89abcdef.wav']);
    expect([...fake.blobs.keys()].filter((k) => k.startsWith('d/'))).toEqual([
      `d/gt-brand/${KEY_B}/clip.0123abcd.webm`,
      `d/gt-brand/${KEY_B}/tone.89abcdef.wav`,
    ]);
    expect(await s.keyedAssetUrl('assets/clip.0123abcd.webm', KEY_A)).toBeNull();
    expect(await s.keyedAssetUrl('assets/clip.0123abcd.webm', KEY_B)).not.toBeNull();
    // a second rotation from an empty prefix moves nothing and is not an error
    expect(await s.rotateAssetKey(KEY_A, KEY_B)).toEqual({ moved: [] });
  });
});

describe('the deck index on the blob tier (SPEC-5 11)', () => {
  let root: string;
  let seedRoot: string;
  let clock: string;
  const now = (): string => clock;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'turboslide-blob-index-'));
    seedRoot = join(root, 'seed');
    writeSeed(seedRoot);
    clock = '2026-09-15T10:00:00.000Z';
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function collection(fake: FakeBlobClient, threshold = 1): HostedDecks {
    return openHostedDecks({
      selection: selectStore({ TURBOSLIDE_STORE: 'blob', BLOB_READ_WRITE_TOKEN: 'test' }),
      workspaceDecksDir: null,
      overlayRoot: join(root, 'overlay'),
      seed: directorySeed(seedRoot),
      blob: fake,
      now,
      indexReadThreshold: threshold,
    });
  }

  function indexOf(fake: FakeBlobClient) {
    const stored = fake.blobs.get(INDEX_PATHNAME);
    return stored === undefined ? null : parseDeckIndex(stored.bytes);
  }

  it('is written with ifMatch by create, a commit, trash, restore and remove, coalesced per instance', async () => {
    const fake = recordingClient();
    const decks = collection(fake);
    await decks.ready();
    expect(indexOf(fake)).toBeNull();
    await decks.create({ name: 'Talk', from: 'blank' });
    await decks.flushIndex?.();
    const rowOf = (id: string) => indexOf(fake)?.decks.find((row) => row.id === id);
    // the seed's row (gt-brand) landed with the seed upload; the created deck joins it
    expect(
      indexOf(fake)
        ?.decks.map((row) => row.id)
        .sort(),
    ).toEqual(['gt-brand', 'talk']);
    expect(rowOf('talk')).toMatchObject({ title: 'Talk', revision: 0 });
    const firstPut = fake.puts.find((p) => p.pathname === INDEX_PATHNAME);
    expect(firstPut?.options.ifMatch).toBeUndefined();
    // a commit changes the row: the title and the revision follow, and the put names the version it read
    const store = await decks.open('talk');
    const outcome = await store.write({
      author: kevin,
      baseRevision: 0,
      mutations: [{ op: 'deck.set', path: '/title', value: 'Talk, renamed' }],
    });
    expect(outcome.ok).toBe(true);
    await decks.flushIndex?.();
    expect(rowOf('talk')).toMatchObject({ title: 'Talk, renamed', revision: 1 });
    const puts = fake.puts.filter((p) => p.pathname === INDEX_PATHNAME);
    expect(puts).toHaveLength(2);
    expect(puts[1]?.options.ifMatch).toBeDefined();
    // trash and restore stamp the row; remove drops it
    clock = '2026-09-15T10:05:00.000Z';
    await decks.trash('talk');
    await decks.flushIndex?.();
    expect(rowOf('talk')?.trashedAt).toBe(clock);
    await decks.restore('talk');
    await decks.flushIndex?.();
    expect(rowOf('talk')?.trashedAt).toBeUndefined();
    await decks.remove('talk');
    await decks.flushIndex?.();
    expect(indexOf(fake)?.decks.map((row) => row.id)).toEqual(['gt-brand']);
  });

  it('answers the list from one get of the index past the threshold and walks the manifests when the folders disagree', async () => {
    const fake = memoryBlobClient();
    const decks = collection(fake, 1);
    await decks.ready();
    await decks.create({ name: 'Talk', from: 'blank' });
    await decks.create({ name: 'Notes', from: 'blank' });
    await decks.flushIndex?.();
    // gt-brand (the seed, noted by the seed upload), talk and notes: three decks over a threshold
    // of one, so the list is one get of the index and no manifest read
    fake.calls.length = 0;
    const listed = await decks.list();
    expect(listed.map((row) => row.id).sort()).toEqual(['gt-brand', 'notes', 'talk']);
    const gets = fake.calls.filter((call) => call.op === 'get').map((call) => call.pathname);
    expect(gets).toEqual([INDEX_PATHNAME]);
    // a deck removed by another instance (its folder gone) makes the index disagree: the walk answers
    for (const pathname of [...fake.blobs.keys()].filter((k) => k.startsWith('decks/notes/')))
      fake.blobs.delete(pathname);
    fake.calls.length = 0;
    const after = await decks.list();
    expect(after.map((row) => row.id).sort()).toEqual(['gt-brand', 'talk']);
    const walked = fake.calls.filter((call) => call.op === 'get').map((call) => call.pathname);
    expect(walked).toContain('decks/talk/deck.json');
  });

  it('reindex rebuilds the index from every manifest', async () => {
    const fake = memoryBlobClient();
    const decks = collection(fake);
    await decks.ready();
    await decks.create({ name: 'Talk', from: 'blank' });
    await decks.flushIndex?.();
    // a stale index with a wrong title
    const stale = deckIndexBytes({
      schemaVersion: 1,
      updatedAt: clock,
      decks: [
        {
          id: 'talk',
          title: 'Wrong',
          slides: 0,
          sections: 0,
          revision: 9,
          updatedAt: clock,
          createdAt: clock,
        },
      ],
    });
    await fake.put(INDEX_PATHNAME, stale, { overwrite: true, contentType: 'application/json' });
    const result = await decks.reindex?.();
    expect(result).toEqual({ decks: 2 });
    const index = indexOf(fake);
    expect(index?.decks.map((row) => [row.id, row.title]).sort()).toEqual([
      ['gt-brand', WORKED_DECK.title],
      ['talk', 'Talk'],
    ]);
  });

  it('reads a row from a document the way the manifest bytes read it', () => {
    const head = deckHeadOfDocument({ deck: WORKED_DECK, slides: {} });
    expect(head).toMatchObject({
      id: WORKED_DECK.id,
      title: WORKED_DECK.title,
      revision: WORKED_DECK.revision,
      sections: WORKED_DECK.sections.length,
    });
    expect(head.trashedAt).toBeUndefined();
    expect(parseDeckIndex(new TextEncoder().encode('nonsense'))).toBeNull();
  });
});
