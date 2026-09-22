import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { memoryBlobClient } from '../packages/store/src/blob-fake.ts';
import {
  copyStore,
  deltaEntries,
  listAll,
  maxAgeOf,
  md5,
  normalizeEtag,
  parseArgs,
  parseSkip,
  planCopy,
  prefixOf,
  readState,
  skipRuleOf,
  verifyStores,
  writeState,
} from './blob-copy.mjs';

// The copy script of docs/HOSTING-MOVE.md section 3 over two in-memory stores
// (packages/store/src/blob-fake.ts): the pass, the resume, the skip rules, the dry run, the verify,
// the delta over the first pass's etags, and the md5 fallback when a put's etag is not the body's
// md5. The fakes stand in for the two real stores; no token and no network.

const DAY = 86_400_000;
const NOW = Date.parse('2026-09-21T12:00:00Z');

/** The script's client over a fake: pages of `pageSize`, a head with a content type and a cache control, a put whose etag `putEtag` may rewrite. */
function fakeStoreClient(fake, { pageSize = 3, putEtag = (etag) => etag } = {}) {
  const contentTypeOf = (pathname) =>
    pathname.endsWith('.json')
      ? 'application/json'
      : pathname.endsWith('.png')
        ? 'image/png'
        : 'application/octet-stream';
  const toEntry = (entry) => ({
    pathname: entry.pathname,
    size: entry.size,
    uploadedAt: entry.uploadedAt,
    etag: entry.version,
  });
  return {
    async *pages(prefix = '') {
      const all = (await fake.list(prefix)).map(toEntry);
      for (let i = 0; i < all.length; i += pageSize) yield all.slice(i, i + pageSize);
    },
    async head(pathname) {
      const entry = await fake.head(pathname);
      return entry === null
        ? null
        : {
            ...toEntry(entry),
            contentType: contentTypeOf(pathname),
            cacheControl: 'public, max-age=2592000',
          };
    },
    async get(pathname) {
      const result = await fake.get(pathname);
      return result === null ? null : { bytes: result.bytes, etag: result.entry.version };
    },
    async put(pathname, bytes, options) {
      const entry = await fake.put(pathname, bytes, {
        overwrite: options.replace === true,
        ...(options.ifMatch === undefined ? {} : { ifMatch: options.ifMatch }),
        contentType: options.contentType,
        cacheControlMaxAge: options.cacheControlMaxAge,
      });
      return { etag: putEtag(entry.version) };
    },
  };
}

const enc = (text) => new TextEncoder().encode(text);

/** A source store the shape of the real one: a deck with its sidecars, exports young and old, the small prefixes. */
async function seedSource() {
  let clock = NOW - 3 * DAY;
  const fake = memoryBlobClient('https://source.blob.local', {
    now: () => new Date(clock).toISOString(),
  });
  const put = (pathname, text) => fake.put(pathname, enc(text), { overwrite: false });
  await put('exports/d2/j2/old.pptx', 'an export three days old');
  await put('decks/d1/.turboslide/presence/aaa.json', '{"rows":[]}');
  clock = NOW - 60_000;
  await put('decks/d1/deck.json', '{"id":"d1","revision":3}');
  await put('decks/d1/slides/s1.json', '{"id":"s1"}');
  await put('decks/d1/assets/a.png', 'png bytes');
  await put('decks/d1/versions/1.json', '{"revision":1}');
  await put('decks/d1/.turboslide/presence.json', '{"rows":[{"id":"x"}]}');
  await put('decks/d1/.turboslide/pulse.json', '{"at":1}');
  await put('exports/d1/j1/file.pptx', 'a fresh export');
  await put('exports/.jobs/j1.json', '{"state":"done"}');
  await put('users/u1.json', '{"decks":["d1"]}');
  await put('links/l1.json', '{"deck":"d1"}');
  await put('index/decks.json', '{"decks":["d1"]}');
  return fake;
}

const RULES = parseSkip('exports-older-than=1d,turboslide-sidecars');

describe('the arguments and the skip rules', () => {
  it('parses the flags of the plan and refuses an unknown rule or a delta without a state', () => {
    const args = parseArgs([
      '--dry-run',
      '--skip',
      'exports-older-than=1d,turboslide-sidecars',
      '--state',
      's.json',
      '--concurrency',
      '4',
    ]);
    expect(args.dryRun).toBe(true);
    expect(args.skip.map((r) => r.label)).toEqual(['exports-older-than=1d', 'turboslide-sidecars']);
    expect(args.concurrency).toBe(4);
    expect(() => parseSkip('presence')).toThrow(/unknown skip rule presence/);
    expect(() => parseArgs(['--delta'])).toThrow(/--delta needs --state/);
  });

  it('skips the sidecars and the exports older than the rule, and keeps the job records', () => {
    const at = (daysAgo) => new Date(NOW - daysAgo * DAY).toISOString();
    expect(
      skipRuleOf({ pathname: 'decks/d1/.turboslide/presence.json', uploadedAt: at(0) }, RULES, NOW),
    ).toBe('turboslide-sidecars');
    expect(
      skipRuleOf(
        { pathname: 'decks/d1/.turboslide/presence/aaa.json', uploadedAt: at(0) },
        RULES,
        NOW,
      ),
    ).toBe('turboslide-sidecars');
    expect(skipRuleOf({ pathname: 'exports/d2/j2/old.pptx', uploadedAt: at(3) }, RULES, NOW)).toBe(
      'exports-older-than=1d',
    );
    expect(
      skipRuleOf({ pathname: 'exports/d1/j1/file.pptx', uploadedAt: at(0.5) }, RULES, NOW),
    ).toBeNull();
    expect(
      skipRuleOf({ pathname: 'exports/.jobs/j1.json', uploadedAt: at(3) }, RULES, NOW),
    ).toBeNull();
    expect(
      skipRuleOf({ pathname: 'decks/d1/deck.json', uploadedAt: at(3) }, RULES, NOW),
    ).toBeNull();
    expect(skipRuleOf({ pathname: 'exports/d2/j2/old.pptx' }, RULES, NOW)).toBeNull(); // no upload time: copied
  });

  it('plans the copied set and counts the skipped set per rule', async () => {
    const source = fakeStoreClient(await seedSource());
    const { copy, skipped } = planCopy(await listAll(source), RULES, NOW);
    expect(copy.map((e) => e.pathname).sort()).toEqual([
      'decks/d1/assets/a.png',
      'decks/d1/deck.json',
      'decks/d1/slides/s1.json',
      'decks/d1/versions/1.json',
      'exports/.jobs/j1.json',
      'exports/d1/j1/file.pptx',
      'index/decks.json',
      'links/l1.json',
      'users/u1.json',
    ]);
    expect(skipped['turboslide-sidecars'].objects).toBe(3);
    expect(skipped['exports-older-than=1d'].objects).toBe(1);
  });

  it('normalizes etags, reads a max age and the prefix', () => {
    expect(normalizeEtag('W/"abc"')).toBe('abc');
    expect(normalizeEtag('"abc"')).toBe('abc');
    expect(maxAgeOf('public, max-age=2592000')).toBe(2592000);
    expect(maxAgeOf('public, max-age=10')).toBe(60);
    expect(maxAgeOf(undefined)).toBeUndefined();
    expect(prefixOf('decks/d1/deck.json')).toBe('decks/');
    expect(prefixOf('index.json')).toBe('index.json');
  });
});

describe('the pass, the resume and the dry run', () => {
  it('copies the copied set under the same pathnames with equal etags, and a second pass copies nothing', async () => {
    const sourceFake = await seedSource();
    const targetFake = memoryBlobClient('https://target.blob.local');
    const source = fakeStoreClient(sourceFake);
    const target = fakeStoreClient(targetFake);
    const { copy } = planCopy(await listAll(source), RULES, NOW);
    const state = {};
    const first = await copyStore({ source, target, entries: copy, concurrency: 3, state });
    expect(first.copied).toBe(9);
    expect(first.already).toBe(0);
    expect(first.differing).toEqual([]);
    expect(first.failed).toEqual([]);
    expect(first.conflicts).toEqual([]);
    expect([...targetFake.blobs.keys()].sort()).toEqual(copy.map((e) => e.pathname).sort());
    for (const entry of copy)
      expect(targetFake.blobs.get(entry.pathname)?.version).toBe(entry.etag);
    expect(targetFake.blobs.has('decks/d1/.turboslide/presence.json')).toBe(false);
    expect(targetFake.blobs.has('exports/d2/j2/old.pptx')).toBe(false);
    expect(Object.keys(state).length).toBe(9);
    // the puts carry the target's content type and max age
    expect(targetFake.calls.filter((c) => c.op === 'put').length).toBe(9);

    const second = await copyStore({ source, target, entries: copy, concurrency: 3, state });
    expect(second.copied).toBe(0);
    expect(second.already).toBe(9);
    expect(targetFake.calls.filter((c) => c.op === 'put').length).toBe(9);
  });

  it('a dry run writes nothing and counts what it would copy', async () => {
    const targetFake = memoryBlobClient('https://target.blob.local');
    const source = fakeStoreClient(await seedSource());
    const target = fakeStoreClient(targetFake);
    const { copy } = planCopy(await listAll(source), RULES, NOW);
    const summary = await copyStore({ source, target, entries: copy, dryRun: true });
    expect(summary.planned).toBe(9);
    expect(summary.plannedBytes).toBeGreaterThan(0);
    expect(summary.copied).toBe(0);
    expect(targetFake.blobs.size).toBe(0);
    expect(targetFake.calls.filter((c) => c.op === 'put').length).toBe(0);
  });

  it('lists an object the target holds with another etag as a conflict and never overwrites it', async () => {
    const targetFake = memoryBlobClient('https://target.blob.local');
    await targetFake.put('decks/d1/deck.json', enc('someone else wrote this'), {
      overwrite: false,
    });
    const source = fakeStoreClient(await seedSource());
    const target = fakeStoreClient(targetFake);
    const { copy } = planCopy(await listAll(source), RULES, NOW);
    const summary = await copyStore({ source, target, entries: copy });
    expect(summary.conflicts).toEqual(['decks/d1/deck.json']);
    expect(summary.copied).toBe(8);
    expect(new TextDecoder().decode(targetFake.blobs.get('decks/d1/deck.json').bytes)).toBe(
      'someone else wrote this',
    );
  });

  it('compares by md5 when the put answers an etag that is not the body hash', async () => {
    const targetFake = memoryBlobClient('https://target.blob.local');
    const source = fakeStoreClient(await seedSource());
    const target = fakeStoreClient(targetFake, { putEtag: (etag) => `${etag.slice(0, -1)}-2"` });
    const { copy } = planCopy(await listAll(source), RULES, NOW);
    const summary = await copyStore({ source, target, entries: copy });
    expect(summary.hashChecked).toBe(9);
    expect(summary.differing).toEqual([]);
    expect(summary.copied).toBe(9);
    expect(md5(targetFake.blobs.get('decks/d1/deck.json').bytes)).toBe(
      normalizeEtag(copy.find((e) => e.pathname === 'decks/d1/deck.json').etag),
    );
  });

  it('counts an object deleted between the listing and the read as vanished, not failed', async () => {
    const sourceFake = await seedSource();
    const source = fakeStoreClient(sourceFake);
    const target = fakeStoreClient(memoryBlobClient('https://target.blob.local'));
    const { copy } = planCopy(await listAll(source), RULES, NOW);
    await sourceFake.del(['users/u1.json']);
    const summary = await copyStore({ source, target, entries: copy });
    expect(summary.vanished).toBe(1);
    expect(summary.copied).toBe(8);
    expect(summary.failed).toEqual([]);
  });
});

describe('verify and delta', () => {
  it('verifies the copied set per prefix, names the skipped set, and reports a source object that moved', async () => {
    const sourceFake = await seedSource();
    const targetFake = memoryBlobClient('https://target.blob.local');
    const source = fakeStoreClient(sourceFake);
    const target = fakeStoreClient(targetFake);
    const { copy } = planCopy(await listAll(source), RULES, NOW);
    const state = {};
    await copyStore({ source, target, entries: copy, state });
    const whole = await verifyStores({ source, target, rules: RULES, now: NOW });
    expect(whole.ok).toBe(true);
    expect(whole.copiedSet).toBe(9);
    expect(whole.skippedRules).toEqual(['exports-older-than=1d', 'turboslide-sidecars']);
    expect(whole.skipped['turboslide-sidecars'].objects).toBe(3);
    expect(whole.prefixes['decks/']).toMatchObject({ expected: 4, found: 4 });
    expect(whole.prefixes['exports/']).toMatchObject({ expected: 2, found: 2 });
    expect(whole.prefixes['users/']).toMatchObject({ expected: 1, found: 1 });
    expect(whole.differing).toEqual([]);

    // a seller edits on the source after the first pass
    await sourceFake.put('decks/d1/deck.json', enc('{"id":"d1","revision":4}'), {
      overwrite: true,
    });
    const moved = await verifyStores({ source, target, rules: RULES, now: NOW });
    expect(moved.ok).toBe(false);
    expect(moved.differing).toEqual(['decks/d1/deck.json (etag differs)']);
    expect(moved.prefixes['decks/']).toMatchObject({ expected: 4, found: 3 });

    // the delta pass copies the moved object over the first pass's copy and nothing else
    const fresh = planCopy(await listAll(source), RULES, NOW).copy;
    const delta = deltaEntries(fresh, state);
    expect(delta.map((e) => e.pathname)).toEqual(['decks/d1/deck.json']);
    const summary = await copyStore({ source, target, entries: delta, delta: true, state });
    expect(summary.copied).toBe(1);
    expect(summary.rewrittenOnTarget).toEqual([]);
    expect((await verifyStores({ source, target, rules: RULES, now: NOW })).ok).toBe(true);
  });

  it('a delta pass leaves an object the target rewrote since the first pass alone and lists it', async () => {
    const sourceFake = await seedSource();
    const targetFake = memoryBlobClient('https://target.blob.local');
    const source = fakeStoreClient(sourceFake);
    const target = fakeStoreClient(targetFake);
    const { copy } = planCopy(await listAll(source), RULES, NOW);
    const state = {};
    await copyStore({ source, target, entries: copy, state });
    await sourceFake.put('decks/d1/slides/s1.json', enc('{"id":"s1","v":2}'), { overwrite: true });
    await targetFake.put('decks/d1/slides/s1.json', enc('{"id":"s1","v":"team"}'), {
      overwrite: true,
    });
    const delta = deltaEntries(planCopy(await listAll(source), RULES, NOW).copy, state);
    const summary = await copyStore({ source, target, entries: delta, delta: true, state });
    expect(summary.copied).toBe(0);
    expect(summary.rewrittenOnTarget).toEqual(['decks/d1/slides/s1.json']);
    expect(new TextDecoder().decode(targetFake.blobs.get('decks/d1/slides/s1.json').bytes)).toBe(
      '{"id":"s1","v":"team"}',
    );
  });

  it('the state file round trips pathnames and etags and nothing else', () => {
    const dir = mkdtempSync(join(tmpdir(), 'blob-copy-'));
    const file = join(dir, 'state.json');
    expect(readState(file)).toEqual({});
    writeState(file, { 'decks/d1/deck.json': 'abc' });
    expect(readState(file)).toEqual({ 'decks/d1/deck.json': 'abc' });
  });
});
