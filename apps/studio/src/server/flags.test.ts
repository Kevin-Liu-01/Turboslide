import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { FLAG_DEFAULTS, FLAG_NAMES } from '@turboslide/schema/access';

import {
  FLAG_CACHE_MS,
  FLAG_OFF_MEANS,
  FLAG_REFUSALS,
  FlagOffError,
  assertFlag,
  bindFlags,
  fileFlagStore,
  flagOn,
  flagTable,
  readFlagFile,
  requireFlag,
  setFlag,
  writeFlagFile,
} from './flags';
import { setSecurityLogSink } from './log';
import type { SecurityLine } from './log';

// The kill switches of gslides-parity SPEC-3 8.12: twelve flags, a 5 s cache, the file store of
// a checkout, the defaults table when the reader fails (realtime off, everything else on), and
// the 503 with a sentence when a switch is off.

const tmp = mkdtempSync(join(tmpdir(), 'turboslide-flags-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const lines: SecurityLine[] = [];
setSecurityLogSink((line) => lines.push(line));

afterEach(() => {
  lines.length = 0;
  bindFlags({ read: null, write: null, now: () => Date.now() });
});

describe('the table', () => {
  it('names twelve flags, each with a default, a meaning and a refusal sentence', () => {
    expect(FLAG_NAMES).toHaveLength(12);
    for (const name of FLAG_NAMES) {
      expect(typeof FLAG_DEFAULTS[name]).toBe('boolean');
      expect(FLAG_OFF_MEANS[name].length).toBeGreaterThan(10);
      expect(FLAG_REFUSALS[name]).not.toMatch(/[—]/);
    }
    expect(FLAG_DEFAULTS.realtime).toBe(false);
    expect(FLAG_REFUSALS.readOnly).toBe('This presentation is read only right now');
  });
});

describe('the file store of a checkout', () => {
  it('reads absent names at their default and writes one name at a time', async () => {
    const dir = join(tmp, 'a');
    expect(readFlagFile(dir)).toEqual({});
    const store = fileFlagStore(dir);
    expect(await store.read('exports')).toBe(true);
    expect(await store.read('realtime')).toBe(false);
    await store.write('exports', false);
    await store.write('realtime', true);
    expect(readFlagFile(dir)).toEqual({ exports: false, realtime: true });
    writeFlagFile({ comments: false, nonsense: true } as never, dir);
    expect(readFlagFile(dir)).toEqual({ comments: false });
  });
});

describe('flagOn, the cache and the defaults', () => {
  it('caches a read for 5 s and asks again after', async () => {
    let t = 1_000_000;
    let reads = 0;
    bindFlags({
      read: (name) => {
        reads += 1;
        return Promise.resolve(name !== 'exports');
      },
      now: () => t,
    });
    expect(await flagOn('exports')).toBe(false);
    expect(await flagOn('exports')).toBe(false);
    expect(reads).toBe(1);
    t += FLAG_CACHE_MS - 1;
    await flagOn('exports');
    expect(reads).toBe(1);
    t += 2;
    await flagOn('exports');
    expect(reads).toBe(2);
    const table = await flagTable();
    expect(table.exports).toBe(false);
    expect(table.comments).toBe(true);
  });

  it('takes the default of the table when the reader fails and logs redis.unavailable once per read', async () => {
    bindFlags({ read: () => Promise.reject(new Error('ECONNREFUSED')), now: () => 5 });
    expect(await flagOn('realtime')).toBe(false);
    expect(await flagOn('exports')).toBe(true);
    expect(await flagOn('readOnly')).toBe(true);
    expect(lines.filter((line) => line.event === 'redis.unavailable')).toHaveLength(3);
  });
});

describe('requireFlag and setFlag', () => {
  it('answers 503 with the sentence and Retry-After when a switch is off, null when on', async () => {
    const dir = join(tmp, 'b');
    const store = fileFlagStore(dir);
    bindFlags({ read: store.read, write: store.write, now: () => 0 });
    expect(await requireFlag('exports')).toBeNull();
    await setFlag('exports', false, 'usr_admin');
    expect(lines.find((line) => line.event === 'flag.changed')).toMatchObject({
      killSwitch: 'exports',
      reason: 'off',
      identity: 'usr_admin',
    });
    const refused = await requireFlag('exports', { deckId: 'q4', action: 'export.run' });
    expect(refused?.status).toBe(503);
    expect(refused?.headers.get('retry-after')).toBe('60');
    const body = (await refused?.json()) as { error: string; message: string; flag: string };
    expect(body).toEqual({ error: 'unavailable', message: FLAG_REFUSALS.exports, flag: 'exports' });
    expect(lines.find((line) => line.event === 'flag.refused')).toMatchObject({
      killSwitch: 'exports',
      deckId: 'q4',
      action: 'export.run',
      status: 503,
    });
    await expect(assertFlag('exports')).rejects.toBeInstanceOf(FlagOffError);
    await setFlag('exports', true);
    expect(await requireFlag('exports')).toBeNull();
  });
});
