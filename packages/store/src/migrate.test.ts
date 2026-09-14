// The storage layout v2 migration on the fake (gslides-parity SPEC-3 11.5; MILESTONES-3 B2 day 6):
// plan, copy, verify, cutover and delete move two decks' documents from the public store to the
// private one byte for byte with their etags verified and the twins left where they are; the
// split client reads through during the dual read window and writes private from the plan on;
// the public documents leave in batches of at most 50; a rollback before the cutover flips the
// reads back; the seeded deck's bytes never change.
import { describe, expect, it } from 'vitest';

import { WORKED_DECK, WORKED_SLIDES } from '@turboslide/schema/fixtures';
import { canonicalJson } from '@turboslide/schema/json';

import { memoryBlobClient } from './blob-fake.ts';
import type { FakeBlobClient } from './blob-fake.ts';
import {
  DELETE_BATCH,
  isPublicPath,
  readMeta,
  runMigrationStep,
  splitBlobClient,
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
