import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { FLAG_DEFAULTS, FLAG_NAMES } from '@turboslide/schema/access';

import {
  FLAG_CACHE_MS,
  FLAG_OFF_MEANS,
  FLAG_REFUSALS,
  LOGO_UPSTREAM_ENV,
  logoUpstreamMode,
  STUDIO_FLAG_DEFAULTS,
  STUDIO_FLAG_NAMES,
  FlagOffError,
  assertFlag,
  bindFlags,
  fileFlagStore,
  flagOn,
  workerFlagStore,
  workerFlagStoreOf,
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
  it('names thirteen flags (the assistant switch among them since the product round), each with a default, a meaning and a refusal sentence', () => {
    expect(FLAG_NAMES).toHaveLength(13);
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

describe('the assist switch (docs/archive/rounds/PRODUCT.md 6.3, 6.4; build/b7.md Product round)', () => {
  it('is known to this server beside the schema’s twelve, on by default, with its meaning and its sentence', async () => {
    expect(STUDIO_FLAG_NAMES).toContain('assist');
    expect(STUDIO_FLAG_DEFAULTS.assist).toBe(true);
    expect(FLAG_OFF_MEANS.assist.length).toBeGreaterThan(10);
    expect(FLAG_REFUSALS.assist).toBe('The assistant is off on this Turboslide');
    // a reader that knows the schema's names alone answers nothing for it: the default, on
    bindFlags({
      read: async (name) => (name === 'assist' ? (undefined as unknown as boolean) : true),
      write: null,
    });
    expect(await flagOn('assist')).toBe(true);
    expect(await requireFlag('assist')).toBeNull();
  });

  it('answers 503 with the sentence when the checkout file turns it off, and reads on again after the flip', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'turboslide-flags-assist-'));
    try {
      const store = fileFlagStore(dir);
      let t = 0;
      bindFlags({ read: store.read, write: store.write, now: () => t, readerCaches: true });
      await setFlag('assist', false, 'kevin');
      const refused = await requireFlag('assist', { deckId: 'q4', action: 'assist.propose' });
      expect(refused?.status).toBe(503);
      expect(await refused?.json()).toEqual({
        error: 'unavailable',
        message: 'The assistant is off on this Turboslide',
        flag: 'assist',
      });
      expect(readFlagFile(dir).assist).toBe(false);
      expect(
        lines.some((line) => line.event === 'flag.refused' && line.killSwitch === 'assist'),
      ).toBe(true);
      await setFlag('assist', true, 'kevin');
      t += FLAG_CACHE_MS + 1;
      expect(await requireFlag('assist')).toBeNull();
      expect((await flagTable()).assist).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// The two deployment variables of the features round (docs/archive/rounds/FEATURES.md 4.7, 4.9; build/b6.md R5):
// read from the environment given, never from the flag reader, with the values the preview sets.
describe('the features round variables', () => {
  it('reads TURBOSLIDE_LOGO_UPSTREAM as network, fixture or down', () => {
    expect(LOGO_UPSTREAM_ENV).toBe('TURBOSLIDE_LOGO_UPSTREAM');
    expect(logoUpstreamMode({})).toBe('network');
    expect(logoUpstreamMode({ [LOGO_UPSTREAM_ENV]: 'fixture' })).toBe('fixture');
    expect(logoUpstreamMode({ [LOGO_UPSTREAM_ENV]: ' Down ' })).toBe('down');
    expect(logoUpstreamMode({ [LOGO_UPSTREAM_ENV]: 'anything else' })).toBe('network');
  });

  it('agrees with logo-index.ts on the name and the three values', async () => {
    const index = await import('./logo-index');
    expect(index.LOGO_UPSTREAM_ENV).toBe(LOGO_UPSTREAM_ENV);
    for (const value of ['', 'fixture', 'down', 'other']) {
      const env = value === '' ? {} : { [LOGO_UPSTREAM_ENV]: value };
      expect(index.logoUpstreamMode(env)).toBe(logoUpstreamMode(env));
    }
  });

  it('no longer reads TURBOSLIDE_SVG_RASTER: the svg branch runs by default (docs/archive/rounds/VECTOR.md 4.7)', async () => {
    const flags = (await import('./flags')) as Record<string, unknown>;
    expect(flags['SVG_RASTER_ENV']).toBeUndefined();
    expect(flags['svgRasterOn']).toBeUndefined();
  });
});

describe('the switches on the Worker’s rt_flags (hardening HR-O#4, RELIABILITY-15)', () => {
  const BEARER = 'o4-test-room-bearer-000000000000000000000000000000000000000000';
  const SWITCHES = new Set<string>(FLAG_NAMES);

  /** The Worker's two flag routes over one table, as control.ts answers them. */
  function fakeWorker() {
    const rows = new Map<string, string>([
      ['realtime', 'on'],
      ['callbacks', 'ok:1'],
    ]);
    const calls = { get: 0, post: 0 };
    let down = false;
    const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname !== '/control/flags')
        return Response.json({ error: 'not_found' }, { status: 404 });
      if ((init?.headers as Record<string, string>)['authorization'] !== `Bearer ${BEARER}`)
        return Response.json({ error: 'bearer' }, { status: 401 });
      if (down) return Response.json({ error: 'worker' }, { status: 503 });
      if ((init?.method ?? 'GET') === 'GET') {
        calls.get += 1;
        return Response.json({ flags: Object.fromEntries(rows) });
      }
      calls.post += 1;
      const body = JSON.parse(String(init?.body)) as Record<string, string>;
      for (const [key, value] of Object.entries(body))
        if (SWITCHES.has(key) && value !== 'on' && value !== 'off')
          return Response.json({ error: 'invalid' }, { status: 400 });
      for (const [key, value] of Object.entries(body)) rows.set(key, value);
      return Response.json({ ok: true, flags: Object.fromEntries(rows) });
    }) as typeof globalThis.fetch;
    return {
      rows,
      calls,
      fetch,
      setDown: (value: boolean) => {
        down = value;
      },
    };
  }

  it('a switch written by one process reads on a second within 5 s, over one table', async () => {
    const worker = fakeWorker();
    let t = 1_000_000;
    const instance = () =>
      workerFlagStore({ host: 'rooms.test', bearer: BEARER, fetch: worker.fetch, now: () => t });
    // the second instance reads first: the switch is on (no row), and that read is kept 5 s
    const second = instance();
    bindFlags({ read: second.read, write: second.write, now: () => t, readerCaches: true });
    expect(await flagOn('readOnly')).toBe(true);
    // the first instance flips it with admin.flag's call
    const first = instance();
    bindFlags({ read: first.read, write: first.write, now: () => t, readerCaches: true });
    await setFlag('readOnly', false, 'usr_admin');
    expect(worker.rows.get('readOnly')).toBe('off');
    // the second instance, its own process state: still the kept read, then the row
    bindFlags({ read: second.read, write: second.write, now: () => t, readerCaches: true });
    t += FLAG_CACHE_MS - 1;
    expect(await flagOn('readOnly')).toBe(true);
    t += 2;
    expect(await flagOn('readOnly')).toBe(false);
    const refused = await requireFlag('readOnly', { action: 'deck.create' });
    expect(refused?.status).toBe(503);
    expect(((await refused?.json()) as { message: string }).message).toBe(FLAG_REFUSALS.readOnly);
  });

  it('one GET answers every switch for 5 s; the realtime switch is the Worker’s own row', async () => {
    const worker = fakeWorker();
    let t = 0;
    const store = workerFlagStore({
      host: 'rooms.test',
      bearer: BEARER,
      fetch: worker.fetch,
      now: () => t,
    });
    bindFlags({ read: store.read, write: store.write, now: () => t, readerCaches: true });
    const table = await flagTable();
    expect(worker.calls.get).toBe(1);
    expect(table.realtime).toBe(true);
    expect(table.exports).toBe(true);
    t += FLAG_CACHE_MS;
    await flagTable();
    expect(worker.calls.get).toBe(2);
  });

  it('a row other than on or off, or none, reads as the default; the write sends on or off', async () => {
    const worker = fakeWorker();
    worker.rows.set('exports', 'of');
    const store = workerFlagStore({ host: 'rooms.test', bearer: BEARER, fetch: worker.fetch });
    expect(await store.read('exports')).toBeUndefined();
    expect(await store.read('comments')).toBeUndefined();
    await store.write('comments', false);
    expect(worker.rows.get('comments')).toBe('off');
    expect(await store.read('comments')).toBe(false);
  });

  it('a Worker that does not answer: every switch at its default, one redis.unavailable line per read', async () => {
    const worker = fakeWorker();
    worker.setDown(true);
    const store = workerFlagStore({ host: 'rooms.test', bearer: BEARER, fetch: worker.fetch });
    bindFlags({ read: store.read, write: store.write, now: () => 7, readerCaches: true });
    expect(await flagOn('readOnly')).toBe(true);
    expect(await flagOn('exports')).toBe(true);
    expect(await flagOn('realtime')).toBe(false);
    const failed = lines.filter((line) => line.event === 'redis.unavailable');
    expect(failed).toHaveLength(3);
    expect(failed[0]).toMatchObject({ reason: 'FlagStoreError', status: 503 });
    await expect(setFlag('readOnly', false)).rejects.toMatchObject({ status: 503 });
  });

  it('is the store of a process that holds the Worker’s host and room bearer', async () => {
    expect(workerFlagStoreOf({})).toBeNull();
    expect(workerFlagStoreOf({ TURBOSLIDE_ROOM_HOST: '127.0.0.1:8868' })).toBeNull();
    const urls: string[] = [];
    const real = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return Response.json({ flags: { readOnly: 'off' } });
    }) as typeof globalThis.fetch;
    try {
      const store = workerFlagStoreOf({
        TURBOSLIDE_ROOM_HOST: '127.0.0.1:8868',
        TURBOSLIDE_ROOM_BEARER: BEARER,
        TURBOSLIDE_ROOM_INSECURE: '1',
      });
      expect(await store?.read('readOnly')).toBe(false);
      expect(urls).toEqual(['http://127.0.0.1:8868/control/flags']);
    } finally {
      globalThis.fetch = real;
    }
  });
});
