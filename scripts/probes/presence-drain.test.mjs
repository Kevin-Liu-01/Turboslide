import { describe, expect, it } from 'vitest';

import { immutableCopyPath } from '../../packages/store/src/access-store.ts';
import { memoryBlobClient } from '../../packages/store/src/blob-fake.ts';
import { presencePath, presenceRecordBytes } from '../../packages/store/src/presence-store.ts';
import { deckIdOfFolder, drainOnce, lineOf, liveRowsOf, parseArgs } from './presence-drain.mjs';

// The drain of docs/HOSTING-MOVE.md section 5 step 5 over an in-memory store
// (packages/store/src/blob-fake.ts): the live rows of a roster, the tombstone rule, a folder
// without a manifest skipped, the proven read through the copy, and the count over the store.
// No token and no network.

const NOW = Date.parse('2026-09-21T20:00:00Z');
const enc = (text) => new TextEncoder().encode(text);
const client = (clientId) => clientId.padEnd(32, '0');

function record(rows, left = []) {
  return presenceRecordBytes(
    new Map(
      rows.map(([id, at, expiresAt]) => [
        client(id),
        { at, expiresAt, state: { clientId: client(id), clock: 1 } },
      ]),
    ),
    new Map(left.map(([id, at]) => [client(id), { at }])),
  );
}

describe('liveRowsOf', () => {
  it('counts the rows whose expiry is ahead and reads a tombstone at or after the row as gone', () => {
    const bytes = record(
      [
        ['a', NOW - 5000, NOW + 25_000],
        ['b', NOW - 40_000, NOW - 10_000],
        ['c', NOW - 5000, NOW + 25_000],
        ['d', NOW - 5000, NOW + 25_000],
      ],
      [
        ['c', NOW - 1000],
        ['d', NOW - 9000],
      ],
    );
    expect(liveRowsOf(bytes, NOW)).toEqual([client('a'), client('d')]);
  });

  it('reads unparseable bytes as no rows', () => {
    expect(liveRowsOf(enc('not json'), NOW)).toEqual([]);
    expect(liveRowsOf(enc('{"v":2}'), NOW)).toEqual([]);
  });
});

describe('deckIdOfFolder', () => {
  it('names the deck of a folder under decks/ and nothing else', () => {
    expect(deckIdOfFolder('decks/q4-review/')).toBe('q4-review');
    expect(deckIdOfFolder('decks/')).toBeNull();
    expect(deckIdOfFolder('exports/q4-review/')).toBeNull();
    expect(deckIdOfFolder('decks/q4-review/versions/')).toBeNull();
  });
});

describe('drainOnce', () => {
  it('counts the live rows of every deck with a manifest and skips the leftovers', async () => {
    const fake = memoryBlobClient();
    const put = (pathname, bytes) => fake.put(pathname, bytes, { overwrite: true });
    await put('decks/live/deck.json', enc('{"deck":1}'));
    await put(
      presencePath('live'),
      record([
        ['a', NOW - 5000, NOW + 25_000],
        ['b', NOW - 5000, NOW + 25_000],
      ]),
    );
    await put('decks/quiet/deck.json', enc('{"deck":2}'));
    await put(presencePath('quiet'), record([['c', NOW - 60_000, NOW - 30_000]]));
    await put('decks/empty/deck.json', enc('{"deck":3}'));
    // a removed deck's leftovers: a roster with no manifest beside it
    await put(presencePath('gone'), record([['z', NOW - 5000, NOW + 25_000]]));
    const reading = await drainOnce(fake, NOW);
    expect(reading).toEqual({
      at: new Date(NOW).toISOString(),
      decks: 3,
      live: [{ deckId: 'live', rows: 2 }],
      count: 2,
    });
    expect(fake.calls.filter((c) => c.op === 'folders')).toHaveLength(1);
    expect(fake.calls.filter((c) => c.op === 'list')).toHaveLength(0);
    expect(fake.calls.filter((c) => c.op === 'put' || c.op === 'del').length).toBe(6);
    expect(lineOf(reading)).toBe(
      `presence-drain: 2 live rows across 3 decks at ${new Date(NOW).toISOString()}`,
    );
  });

  it('reads the roster through the proof: the copy under the version when the body is stale', async () => {
    const fake = memoryBlobClient();
    const put = (pathname, bytes) => fake.put(pathname, bytes, { overwrite: true });
    await put('decks/d/deck.json', enc('{"deck":1}'));
    await put(presencePath('d'), record([]));
    // the host keeps serving the empty roster after the row is set: head() names the new
    // version, get() answers the old body, and the copy under the new version proves the row
    fake.holdGet();
    const fresh = record([['a', NOW - 5000, NOW + 25_000]]);
    const written = await put(presencePath('d'), fresh);
    await put(immutableCopyPath(presencePath('d'), written.version), fresh);
    const reading = await drainOnce(fake, NOW);
    expect(reading).toEqual({
      at: new Date(NOW).toISOString(),
      decks: 1,
      live: [{ deckId: 'd', rows: 1 }],
      count: 1,
    });
    const copyReads = fake.calls.filter(
      (c) => c.op === 'get' && c.pathname === immutableCopyPath(presencePath('d'), written.version),
    );
    expect(copyReads).toHaveLength(1);
  });

  it('answers zero over an empty store and over a store with no decks', async () => {
    const fake = memoryBlobClient();
    expect((await drainOnce(fake, NOW)).count).toBe(0);
    await fake.put('exports/x.pptx', enc('x'), { overwrite: true });
    const reading = await drainOnce(fake, NOW);
    expect(reading).toEqual({ at: new Date(NOW).toISOString(), decks: 0, live: [], count: 0 });
  });
});

describe('parseArgs', () => {
  it('reads the flags and refuses an unknown one', () => {
    expect(parseArgs([])).toEqual({ wait: false, untilMinutes: 30, json: null });
    expect(parseArgs(['--wait', '--until', '5', '--json', 'out.json'])).toEqual({
      wait: true,
      untilMinutes: 5,
      json: 'out.json',
    });
    expect(() => parseArgs(['--nope'])).toThrow(/unknown argument/);
    expect(() => parseArgs(['--until', 'x'])).toThrow(/minutes/);
  });
});
