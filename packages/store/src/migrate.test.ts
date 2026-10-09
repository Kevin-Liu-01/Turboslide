// The storage layout v2 migration on the fake (gslides-parity SPEC-3 11.5; MILESTONES-3 B2 day 6):
// plan, copy, verify, cutover and delete move two decks' documents from the public store to the
// private one byte for byte with their etags verified and the twins left where they are; the
// split client reads through during the dual read window and writes private from the plan on;
// the public documents leave in batches of at most 50; a rollback before the cutover flips the
// reads back; the seeded deck's bytes never change.
import { describe, expect, it } from 'vitest';

import { WORKED_DECK, WORKED_SLIDES } from '@turboslide/schema/fixtures';
import { canonicalJson } from '@turboslide/schema/json';

import { blobAccessStore } from './access-store.ts';
import { memoryBlobClient } from './blob-fake.ts';
import type { FakeBlobClient } from './blob-fake.ts';
import { legacyAssetKey, newAssetKey, newDeckRecord } from '@turboslide/schema/access';
import { MIGRATION_STEPS as SCHEMA_MIGRATION_STEPS } from '@turboslide/schema/actions';

import {
  DELETE_BATCH,
  MIGRATION_STEPS,
  emptyMeta,
  isPublicPath,
  keyedTwinsClient,
  readMeta,
  runMigrationStep,
  splitBlobClient,
  twinKeyResolver,
  writeMeta,
} from './migrate.ts';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const NOW = '2026-09-13T10:00:00.000Z';

async function seedDeck(
  client: FakeBlobClient,
  deckId: string,
  slides: number,
): Promise<Map<string, Uint8Array>> {
  const bytes = new Map<string, Uint8Array>();
  const putJson = async (path: string, value: unknown): Promise<void> => {
    const body = encoder.encode(canonicalJson(value));
    bytes.set(path, body);
    await client.put(path, body, { overwrite: false, contentType: 'application/json' });
  };
  const prefix = `decks/${deckId}/`;
  await putJson(`${prefix}deck.json`, { ...WORKED_DECK, id: deckId });
  for (const slide of WORKED_SLIDES.slice(0, slides))
    await putJson(`${prefix}slides/${slide.id}.json`, slide);
  await putJson(`${prefix}versions/1.json`, { n: 1, revision: 1, mutations: [] });
  for (let i = 0; i < 60; i += 1)
    await putJson(`${prefix}snapshots/${String(i).padStart(32, '0')}.json`, {
      deck: { id: deckId, n: i },
    });
  await putJson(`${prefix}leases.json`, { leases: [] });
  await putJson(`${prefix}access.json`, { schemaVersion: 1, deckId, owner: null });
  await putJson(`${prefix}comments/index.json`, {
    schemaVersion: 1,
    deckId,
    revision: 0,
    updatedAt: NOW,
    threads: [],
  });
  const twin = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  bytes.set(`${prefix}assets/mark.png`, twin);
  await client.put(`${prefix}assets/mark.png`, twin, {
    overwrite: false,
    contentType: 'image/png',
  });
  return bytes;
}

describe('the storage migration', () => {
  it('routes twins and exports to the public store and everything else to the documents store', () => {
    expect(isPublicPath('decks/q4/assets/a.png')).toBe(true);
    expect(isPublicPath('d/q4/key/a.png')).toBe(true);
    expect(isPublicPath('exports/q4/job/deck.pptx')).toBe(true);
    // the picture avatars (docs/archive/rounds/PEOPLE.md 4.3): public, so an <img> loads them by URL
    expect(isPublicPath('u/AbCdEfGhIjKlMnOpQrStUv/0123abcd-64.webp')).toBe(true);
    expect(isPublicPath('decks/q4/deck.json')).toBe(false);
    expect(isPublicPath('decks/q4/access.json')).toBe(false);
    expect(isPublicPath('users/anon_x/decks.json')).toBe(false);
    expect(isPublicPath('meta.json')).toBe(false);
  });

  it('migrates two decks byte for byte through plan, copy, verify, cutover and delete', async () => {
    const legacy = memoryBlobClient('https://public.local', { now: () => NOW });
    const documents = memoryBlobClient('https://private.local', {
      now: () => '2026-09-13T11:00:00.000Z',
    });
    const gt = await seedDeck(legacy, 'gt-brand', 3);
    const other = await seedDeck(legacy, 'q4-review', 2);
    await legacy.put('decks/templates/blank/deck.json', encoder.encode('{}'), { overwrite: false });
    const clients = { legacy, documents };
    const split = splitBlobClient(clients, { ttlMs: 0 });

    // before a plan: layout v1, everything on the public store
    expect(await readMeta(documents)).toBeNull();
    expect((await split.head('decks/gt-brand/deck.json'))?.pathname).toBe(
      'decks/gt-brand/deck.json',
    );

    const plan = await runMigrationStep(clients, 'plan', { now: () => NOW });
    expect(plan).toMatchObject({
      step: 'plan',
      processed: 2,
      done: true,
      dualRead: true,
      failed: [],
    });
    expect((await readMeta(documents))?.decks).toEqual(['gt-brand', 'q4-review']);

    // the dual read window: a document written now goes private and reads back; the public copy is still read
    await split.put('decks/q4-review/slides/new.json', encoder.encode('{"id":"new"}'), {
      overwrite: false,
    });
    expect(documents.blobs.has('decks/q4-review/slides/new.json')).toBe(true);
    expect(legacy.blobs.has('decks/q4-review/slides/new.json')).toBe(false);
    expect(decoder.decode((await split.get('decks/gt-brand/deck.json'))?.bytes)).toBe(
      decoder.decode(gt.get('decks/gt-brand/deck.json')),
    );
    expect((await split.list('decks/q4-review/')).map((entry) => entry.pathname)).toContain(
      'decks/q4-review/slides/new.json',
    );
    expect((await split.list('decks/q4-review/')).map((entry) => entry.pathname)).toContain(
      'decks/q4-review/assets/mark.png',
    );

    const copy1 = await runMigrationStep(clients, 'copy', { batch: 1, now: () => NOW });
    expect(copy1).toMatchObject({ step: 'copy', cursor: 'gt-brand', processed: 1, done: false });
    const copy2 = await runMigrationStep(clients, 'copy', { batch: 1, now: () => NOW });
    expect(copy2).toMatchObject({
      step: 'copy',
      cursor: 'q4-review',
      processed: 1,
      done: true,
      failed: [],
    });
    // every document is private with the same bytes and etag; the twins did not move
    for (const [path, body] of [...gt, ...other]) {
      if (isPublicPath(path)) {
        expect(documents.blobs.has(path)).toBe(false);
        continue;
      }
      const stored = documents.blobs.get(path);
      expect(stored, path).toBeDefined();
      expect(Buffer.compare(Buffer.from(stored!.bytes), Buffer.from(body)), path).toBe(0);
      expect(stored!.version).toBe(legacy.blobs.get(path)?.version);
    }
    expect(documents.blobs.has('decks/templates/blank/deck.json')).toBe(false);
    // a copy run again is idempotent
    const again = await runMigrationStep(clients, 'copy', { batch: 5, now: () => NOW });
    expect(again).toMatchObject({ processed: 2, done: true, failed: [] });

    // a cutover before verify refuses with the unverified decks
    const early = await runMigrationStep(clients, 'cutover', { now: () => NOW });
    expect(early.done).toBe(false);
    expect(early.failed).toEqual(['gt-brand: not verified', 'q4-review: not verified']);

    const verify = await runMigrationStep(clients, 'verify', { batch: 5, now: () => NOW });
    expect(verify).toMatchObject({
      step: 'verify',
      processed: 2,
      verified: 2,
      failed: [],
      done: true,
    });

    const cutover = await runMigrationStep(clients, 'cutover', { now: () => NOW });
    expect(cutover).toMatchObject({ step: 'cutover', done: true, dualRead: false, verified: 2 });
    expect((await readMeta(documents))?.layout).toBe('v2');
    // after the cutover a public only document is invisible; the twins still read
    await legacy.put('decks/gt-brand/slides/ghost.json', encoder.encode('{}'), {
      overwrite: false,
    });
    expect(await split.head('decks/gt-brand/slides/ghost.json')).toBeNull();
    expect(await split.head('decks/gt-brand/assets/mark.png')).not.toBeNull();
    expect((await split.list('decks/gt-brand/')).map((entry) => entry.pathname)).not.toContain(
      'decks/gt-brand/slides/ghost.json',
    );

    legacy.calls.length = 0;
    const del1 = await runMigrationStep(clients, 'delete', { batch: 1, now: () => NOW });
    expect(del1).toMatchObject({ step: 'delete', cursor: 'gt-brand', done: false });
    const del2 = await runMigrationStep(clients, 'delete', { batch: 1, now: () => NOW });
    expect(del2).toMatchObject({ step: 'delete', cursor: 'q4-review', done: true });
    const dels = legacy.calls.filter((call) => call.op === 'del');
    expect(dels.length).toBeGreaterThan(2); // 68 documents per deck leave in batches, never one call
    for (const [path] of [...gt, ...other]) {
      expect(legacy.blobs.has(path), path).toBe(isPublicPath(path));
    }
    expect(legacy.blobs.has('decks/templates/blank/deck.json')).toBe(true);
    // the migrated deck reads byte for byte through the split client
    expect(decoder.decode((await split.get('decks/gt-brand/deck.json'))?.bytes)).toBe(
      decoder.decode(gt.get('decks/gt-brand/deck.json')),
    );
    expect(DELETE_BATCH).toBe(50);
    await expect(runMigrationStep(clients, 'rollback', { now: () => NOW })).rejects.toThrow(
      /cutover happened/,
    );
  });

  it('reports a copy whose etag differs, and a rollback before the cutover flips the reads back', async () => {
    const legacy = memoryBlobClient('https://public.local', { now: () => NOW });
    const documents = memoryBlobClient('https://private.local', { now: () => NOW });
    await seedDeck(legacy, 'q4-review', 1);
    const clients = { legacy, documents };
    await runMigrationStep(clients, 'plan', { now: () => NOW });
    // a private document that differs from the public one and is not newer does not verify
    await documents.put(
      'decks/q4-review/versions/1.json',
      encoder.encode('{"n":1,"tampered":true}'),
      { overwrite: false },
    );
    await runMigrationStep(clients, 'copy', { now: () => NOW });
    const verify = await runMigrationStep(clients, 'verify', { now: () => NOW });
    expect(verify.verified).toBe(0);
    expect(verify.failed[0]).toMatch(/versions\/1\.json has etag/);
    const cutover = await runMigrationStep(clients, 'cutover', { now: () => NOW });
    expect(cutover.done).toBe(false);

    const split = splitBlobClient(clients, { ttlMs: 0 });
    expect(decoder.decode((await split.get('decks/q4-review/versions/1.json'))?.bytes)).toContain(
      'tampered',
    );
    const rollback = await runMigrationStep(clients, 'rollback', { now: () => NOW });
    expect(rollback).toMatchObject({ step: 'rollback', done: true, dualRead: false });
    expect((await readMeta(documents))?.rollback).toBe(true);
    // reads and writes go public again
    expect(
      decoder.decode((await split.get('decks/q4-review/versions/1.json'))?.bytes),
    ).not.toContain('tampered');
    await split.put('decks/q4-review/slides/after.json', encoder.encode('{}'), {
      overwrite: false,
    });
    expect(legacy.blobs.has('decks/q4-review/slides/after.json')).toBe(true);
    await expect(runMigrationStep(clients, 'copy', { now: () => NOW })).rejects.toThrow(
      /rolled back/,
    );
  });
});

// Hardening K1#3 (docs/hardening/HARDENING.md 4.1; DATA-2): a keyed deck's twins live under
// `d/<id>/<assetKey>/` on the public store while every caller keeps naming them
// `decks/<id>/assets/<file>`; a deck without a key passes through; the record's key is read once.
describe('the keyed twins (hardening K1#3)', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9, 9]);

  function keyed(key: string | null, store = memoryBlobClient('https://store.public.local')) {
    const keyOf = twinKeyResolver(async (deckId) => {
      return deckId === 'fresh' && key !== null
        ? { deckId, assetKey: key }
        : { deckId, assetKey: legacyAssetKey(deckId) };
    });
    return { store, client: keyedTwinsClient(store, keyOf) };
  }

  it("writes a new deck's twin under its key, and the URL cannot be derived from the id and the name", async () => {
    const key = newAssetKey();
    const { store, client } = keyed(key);
    const put = await client.put('decks/fresh/assets/logo.ab12cd34.png', png, {
      overwrite: false,
      contentType: 'image/png',
    });
    // the caller's name comes back; the object and its URL are the keyed ones
    expect(put.pathname).toBe('decks/fresh/assets/logo.ab12cd34.png');
    expect(put.url).toBe(`https://store.public.local/d/fresh/${key}/assets/logo.ab12cd34.png`);
    expect(put.url).toContain(key);
    expect([...store.blobs.keys()]).toEqual([`d/fresh/${key}/assets/logo.ab12cd34.png`]);
    // nothing answers at the address the id and the file name make
    expect(await store.head('decks/fresh/assets/logo.ab12cd34.png')).toBeNull();
    // the caller reads, lists and removes it by its own name
    expect((await client.head('decks/fresh/assets/logo.ab12cd34.png'))?.url).toBe(put.url);
    expect((await client.get('decks/fresh/assets/logo.ab12cd34.png'))?.bytes).toEqual(png);
    expect((await client.list('decks/fresh/assets/')).map((e) => e.pathname)).toEqual([
      'decks/fresh/assets/logo.ab12cd34.png',
    ]);
    expect((await client.list('decks/fresh/')).map((e) => e.pathname)).toEqual([
      'decks/fresh/assets/logo.ab12cd34.png',
    ]);
    await client.del(['decks/fresh/assets/logo.ab12cd34.png']);
    expect(store.blobs.size).toBe(0);
  });

  it('passes a deck without a key, documents and other prefixes through unchanged', async () => {
    const { store, client } = keyed(null);
    await client.put('decks/old/assets/a.png', png, { overwrite: false });
    await client.put('decks/fresh/deck.json', png, { overwrite: true });
    await client.put('exports/fresh/job/x.pdf', png, { overwrite: true });
    expect([...store.blobs.keys()].sort()).toEqual([
      'decks/fresh/deck.json',
      'decks/old/assets/a.png',
      'exports/fresh/job/x.pdf',
    ]);
    expect((await client.head('decks/old/assets/a.png'))?.url).toBe(
      'https://store.public.local/decks/old/assets/a.png',
    );
  });

  it('reads a twin left at the old place until it moves, and the key wins a listing', async () => {
    const key = newAssetKey();
    const { store, client } = keyed(key);
    // written before the key, under the old name
    await store.put('decks/fresh/assets/left.png', png, { overwrite: false });
    await store.put('decks/fresh/assets/both.png', png, { overwrite: false });
    await store.put(`d/fresh/${key}/assets/both.png`, png, { overwrite: false });
    expect((await client.get('decks/fresh/assets/left.png'))?.entry.url).toBe(
      'https://store.public.local/decks/fresh/assets/left.png',
    );
    const listed = await client.list('decks/fresh/assets/');
    expect(listed.map((e) => [e.pathname, e.url])).toEqual([
      ['decks/fresh/assets/both.png', `https://store.public.local/d/fresh/${key}/assets/both.png`],
      ['decks/fresh/assets/left.png', 'https://store.public.local/decks/fresh/assets/left.png'],
    ]);
    // a removal by name takes both places
    await client.del(['decks/fresh/assets/both.png', 'decks/fresh/assets/left.png']);
    expect(store.blobs.size).toBe(0);
  });

  it('reads a key once per deck, and a failed read is asked again', async () => {
    let fail = true;
    const reads: string[] = [];
    const keyOf = twinKeyResolver(async (deckId) => {
      reads.push(deckId);
      if (fail) throw new Error('store down');
      return { deckId, assetKey: 'AbCdEfGhIjKlMnOpQrStUv' };
    });
    await expect(keyOf('fresh')).rejects.toThrow('store down');
    fail = false;
    expect(await Promise.all([keyOf('fresh'), keyOf('fresh')])).toEqual([
      'AbCdEfGhIjKlMnOpQrStUv',
      'AbCdEfGhIjKlMnOpQrStUv',
    ]);
    expect(await keyOf('fresh')).toBe('AbCdEfGhIjKlMnOpQrStUv');
    expect(reads).toEqual(['fresh', 'fresh']);
  });

  it('keeps the keyed twins public on the split client', async () => {
    const key = newAssetKey();
    const legacy = memoryBlobClient('https://public.local');
    const documents = memoryBlobClient('https://private.local');
    await writeMeta(documents, { ...emptyMeta(NOW), layout: 'v2' });
    const split = splitBlobClient({ legacy, documents }, { ttlMs: 0 });
    const twins = keyedTwinsClient(
      split,
      twinKeyResolver(async () => ({ deckId: 'fresh', assetKey: key })),
    );
    await twins.put('decks/fresh/assets/x.png', png, { overwrite: false });
    expect([...legacy.blobs.keys()]).toEqual([`d/fresh/${key}/assets/x.png`]);
    expect(documents.blobs.has(`d/fresh/${key}/assets/x.png`)).toBe(false);
  });
});

// Hardening K1#4 (docs/hardening/HARDENING.md 4.1; DATA-2): `rekey` gives every deck with a record
// a random key of its own, copies its twins under `d/<id>/<assetKey>/` verified by etag and only
// then writes the key; `delete` makes a last copy of any twin written at the old place since and
// removes `decks/<id>/assets/`; a deck without a record keeps its twins; a re-run changes nothing.
describe('the rekey step (hardening K1#4)', () => {
  const KEY = 'Rk7Qw2Zp9LmX4cVb8NtY3a';

  async function twoDecks() {
    const legacy = memoryBlobClient('https://public.local', { now: () => NOW });
    const documents = memoryBlobClient('https://private.local', {
      now: () => '2026-09-13T11:00:00.000Z',
    });
    const gt = await seedDeck(legacy, 'gt-brand', 2);
    const q4 = await seedDeck(legacy, 'q4-review', 2);
    const extra = new Uint8Array([7, 7, 7]);
    await legacy.put('decks/q4-review/assets/photo.ab12.webp', extra, { overwrite: false });
    q4.set('decks/q4-review/assets/photo.ab12.webp', extra);
    // the seed deck holds no record; the other deck's is a real one with the derived key
    await legacy.del(['decks/gt-brand/access.json']);
    await blobAccessStore(legacy).write(
      'q4-review',
      newDeckRecord('q4-review', 'usr_owner', legacyAssetKey('q4-review'), NOW),
    );
    return { legacy, documents, clients: { legacy, documents }, gt, q4 };
  }

  it('lists rekey between verify and cutover, as the action schema does', () => {
    expect([...MIGRATION_STEPS]).toEqual([...SCHEMA_MIGRATION_STEPS]);
    expect(MIGRATION_STEPS.indexOf('rekey')).toBe(MIGRATION_STEPS.indexOf('verify') + 1);
  });

  it('copies the twins under a new key byte for byte, then writes the key; a re-run is a no-op', async () => {
    const { legacy, clients, q4 } = await twoDecks();
    await runMigrationStep(clients, 'plan', { now: () => NOW });
    // a deck is rekeyed once its documents are copied and verified
    const early = await runMigrationStep(clients, 'rekey', { now: () => NOW, newKey: () => KEY });
    expect(early.failed).toEqual([
      'gt-brand: not verified; run copy and verify first',
      'q4-review: not verified; run copy and verify first',
    ]);
    await runMigrationStep(clients, 'copy', { now: () => NOW });
    await runMigrationStep(clients, 'verify', { now: () => NOW });
    const keys: string[] = [];
    const rekey = await runMigrationStep(clients, 'rekey', {
      now: () => NOW,
      newKey: () => {
        keys.push(KEY);
        return KEY;
      },
    });
    expect(rekey).toMatchObject({ step: 'rekey', processed: 2, verified: 1, done: true });
    expect(rekey.failed).toEqual([]);
    expect(keys).toEqual([KEY]);
    // the record names the key now
    const stored = await blobAccessStore(splitBlobClient(clients, { ttlMs: 0 })).read('q4-review');
    expect(stored?.record.assetKey).toBe(KEY);
    // every twin under the key, equal bytes and etag; the old copies stay until delete
    for (const name of ['mark.png', 'photo.ab12.webp']) {
      const from = `decks/q4-review/assets/${name}`;
      const to = `d/q4-review/${KEY}/assets/${name}`;
      expect(legacy.blobs.get(to)?.bytes).toEqual(q4.get(from));
      expect(legacy.blobs.get(to)?.version).toBe(legacy.blobs.get(from)?.version);
    }
    // the seed deck has no record and keeps its twins where they are
    expect([...legacy.blobs.keys()].some((path) => path.startsWith('d/gt-brand/'))).toBe(false);
    // a second pass mints nothing and writes nothing
    const before = new Map([...legacy.blobs].map(([path, blob]) => [path, blob.version]));
    const again = await runMigrationStep(clients, 'rekey', {
      now: () => NOW,
      newKey: () => {
        throw new Error('a keyed deck takes no new key');
      },
    });
    expect(again.failed).toEqual([]);
    expect(new Map([...legacy.blobs].map(([path, blob]) => [path, blob.version]))).toEqual(before);
  });

  it('reads the twins through the keyed client after rekey, and delete moves a late twin then removes the old place', async () => {
    const { legacy, documents, clients } = await twoDecks();
    await runMigrationStep(clients, 'plan', { now: () => NOW });
    await runMigrationStep(clients, 'copy', { now: () => NOW });
    await runMigrationStep(clients, 'verify', { now: () => NOW });
    await runMigrationStep(clients, 'rekey', { now: () => NOW, newKey: () => KEY });
    // an instance that still read the deck as unkeyed wrote a twin at the old place
    const late = new Uint8Array([5, 4, 3]);
    await legacy.put('decks/q4-review/assets/late.cd34.png', late, { overwrite: false });
    const cutover = await runMigrationStep(clients, 'cutover', { now: () => NOW });
    expect(cutover.done).toBe(true);
    const deleted = await runMigrationStep(clients, 'delete', { now: () => NOW, batch: 5 });
    expect(deleted.failed).toEqual([]);
    const paths = [...legacy.blobs.keys()];
    expect(paths.filter((path) => path.startsWith('decks/q4-review/'))).toEqual([]);
    expect(paths.filter((path) => path.startsWith(`d/q4-review/${KEY}/assets/`)).sort()).toEqual([
      `d/q4-review/${KEY}/assets/late.cd34.png`,
      `d/q4-review/${KEY}/assets/mark.png`,
      `d/q4-review/${KEY}/assets/photo.ab12.webp`,
    ]);
    // the seed deck keeps its twins at their old place
    expect(legacy.blobs.has('decks/gt-brand/assets/mark.png')).toBe(true);
    // the deployment's client reads the deck's twins by their manifest names, under the key
    const split = splitBlobClient({ legacy, documents }, { ttlMs: 0 });
    const records = blobAccessStore(split);
    const client = keyedTwinsClient(
      split,
      twinKeyResolver(async (deckId) => (await records.read(deckId))?.record ?? null),
    );
    expect((await client.get('decks/q4-review/assets/late.cd34.png'))?.bytes).toEqual(late);
    expect((await client.head('decks/q4-review/assets/mark.png'))?.url).toBe(
      `https://public.local/d/q4-review/${KEY}/assets/mark.png`,
    );
  });

  it('fails a deck whose keyed copy holds other bytes, and leaves its record unkeyed', async () => {
    const { legacy, clients } = await twoDecks();
    await legacy.put(`d/q4-review/${KEY}/assets/mark.png`, new Uint8Array([0]), {
      overwrite: false,
    });
    await runMigrationStep(clients, 'plan', { now: () => NOW });
    await runMigrationStep(clients, 'copy', { now: () => NOW });
    await runMigrationStep(clients, 'verify', { now: () => NOW });
    const rekey = await runMigrationStep(clients, 'rekey', { now: () => NOW, newKey: () => KEY });
    expect(rekey.failed).toEqual([
      expect.stringMatching(
        /^q4-review: d\/q4-review\/Rk7Qw2Zp9LmX4cVb8NtY3a\/assets\/mark\.png has etag/,
      ),
    ]);
    const stored = await blobAccessStore(splitBlobClient(clients, { ttlMs: 0 })).read('q4-review');
    expect(stored?.record.assetKey).toBe(legacyAssetKey('q4-review'));
  });
});
