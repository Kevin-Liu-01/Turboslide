import { SELF, env } from 'cloudflare:test';
import { afterEach, describe, expect, it } from 'vitest';

import {
  CALLBACKS_FAILING_TTL_MS,
  callbacksStateOf,
  dropFlagCache,
  noteCallbacks,
} from '../src/control.ts';

// The router's unauthenticated surface (docs/CLOUDFLARE.md 3.6.2): GET /health answers the health
// body with the flag the control table holds, OPTIONS answers CORS for the ticket POSTs, a bearer
// route refuses a wrong bearer in constant time, and everything else is 404. The Worker runs
// inside workerd under @cloudflare/vitest-plugin with the migrations of migrations/ applied by
// test/setup.ts.
describe('the realtime worker router', () => {
  afterEach(async () => {
    await env.ACCOUNTS.prepare(
      "INSERT OR REPLACE INTO rt_flags (k, v) VALUES ('realtime', 'on')",
    ).run();
    await env.ACCOUNTS.prepare("DELETE FROM rt_flags WHERE k = 'callbacks'").run();
    dropFlagCache();
  });

  it('answers GET /health with the health body and the flag of the control table', async () => {
    const response = await SELF.fetch('https://rooms.test/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      protocol: 1,
      commit: '',
      realtime: 'on',
      appOrigin: env.TURBOSLIDE_APP_ORIGIN,
      callbacks: 'ok',
    });
  });

  it('answers callbacks failing while an object stamped its app calls failing in the last two minutes (3.8)', async () => {
    const read = async (): Promise<string> => {
      dropFlagCache();
      return (
        (await (await SELF.fetch('https://rooms.test/health')).json()) as { callbacks: string }
      ).callbacks;
    };
    await noteCallbacks(env.ACCOUNTS, 'failing', Date.now(), 302);
    expect(await read()).toBe('failing');
    // the realtime row stands: the hand off is the function's reading of the two together
    expect(
      ((await (await SELF.fetch('https://rooms.test/health')).json()) as { realtime: string })
        .realtime,
    ).toBe('on');
    await noteCallbacks(env.ACCOUNTS, 'ok', Date.now());
    expect(await read()).toBe('ok');
    // a stamp older than the TTL holds nothing, so an instance tries the Worker again
    await noteCallbacks(env.ACCOUNTS, 'failing', Date.now() - CALLBACKS_FAILING_TTL_MS - 1, 401);
    expect(await read()).toBe('ok');
    expect(callbacksStateOf('failing:x:1', Date.now())).toBe('ok');
    expect(callbacksStateOf(null, Date.now())).toBe('ok');
  });

  it('reads unset when the realtime row is gone and off when it says so, through the 30 s cache drop', async () => {
    await env.ACCOUNTS.prepare("DELETE FROM rt_flags WHERE k = 'realtime'").run();
    dropFlagCache();
    expect(
      ((await (await SELF.fetch('https://rooms.test/health')).json()) as { realtime: string })
        .realtime,
    ).toBe('unset');
    await env.ACCOUNTS.prepare("INSERT INTO rt_flags (k, v) VALUES ('realtime', 'off')").run();
    // cached: still unset until the cache drops
    expect(
      ((await (await SELF.fetch('https://rooms.test/health')).json()) as { realtime: string })
        .realtime,
    ).toBe('unset');
    dropFlagCache();
    expect(
      ((await (await SELF.fetch('https://rooms.test/health')).json()) as { realtime: string })
        .realtime,
    ).toBe('off');
  });

  it('answers OPTIONS with the request origin echoed and the two headers, and 404 elsewhere', async () => {
    const options = await SELF.fetch('https://rooms.test/rooms/gt-brand/ops', {
      method: 'OPTIONS',
      headers: { origin: 'http://localhost:4471' },
    });
    expect(options.status).toBe(204);
    expect(options.headers.get('access-control-allow-origin')).toBe('http://localhost:4471');
    expect(options.headers.get('access-control-allow-headers')).toBe('authorization, content-type');
    expect(options.headers.get('vary')).toBe('origin');
    expect((await SELF.fetch('https://rooms.test/nothing')).status).toBe(404);
    expect((await SELF.fetch('https://rooms.test/rooms/Not%20A%20Slug/roster')).status).toBe(404);
  });

  it('refuses a wrong or missing bearer on the bearer, db and control routes with 401', async () => {
    for (const path of [
      '/rooms/gt-brand/roster',
      '/db/counters',
      '/control/flags',
      '/control/open',
    ]) {
      expect((await SELF.fetch(`https://rooms.test${path}`)).status).toBe(401);
      expect(
        (
          await SELF.fetch(`https://rooms.test${path}`, {
            headers: { authorization: 'Bearer wrong' },
          })
        ).status,
      ).toBe(401);
      expect(
        (
          await SELF.fetch(`https://rooms.test${path}`, {
            headers: { authorization: `Bearer ${env.TURBOSLIDE_ROOM_BEARER}x` },
          })
        ).status,
      ).toBe(401);
    }
  });

  it('reads and writes the control flags and lists the open decks under the bearer', async () => {
    const headers = {
      authorization: `Bearer ${env.TURBOSLIDE_ROOM_BEARER}`,
      'content-type': 'application/json',
    };
    const flags = await (await SELF.fetch('https://rooms.test/control/flags', { headers })).json();
    expect(flags).toEqual({ flags: { realtime: 'on' } });
    const written = await SELF.fetch('https://rooms.test/control/flags', {
      method: 'POST',
      headers,
      body: JSON.stringify({ realtime: 'off' }),
    });
    expect(await written.json()).toEqual({ ok: true, flags: { realtime: 'off' } });
    expect(
      ((await (await SELF.fetch('https://rooms.test/health')).json()) as { realtime: string })
        .realtime,
    ).toBe('off');
    const refused = await SELF.fetch('https://rooms.test/control/flags', {
      method: 'POST',
      headers,
      body: JSON.stringify({ 'bad key': 'x' }),
    });
    expect(refused.status).toBe(400);
    const open = await (await SELF.fetch('https://rooms.test/control/open', { headers })).json();
    expect(open).toEqual({ decks: [] });
    const counters = (await (
      await SELF.fetch('https://rooms.test/control/counters', { headers })
    ).json()) as Record<string, number>;
    expect(counters.health).toBeGreaterThan(0);
    expect(counters.controlCalls).toBeGreaterThan(0);
  });

  it('runs a D1 statement and a batch under the bearer and sums the counters', async () => {
    const headers = {
      authorization: `Bearer ${env.TURBOSLIDE_ROOM_BEARER}`,
      'content-type': 'application/json',
    };
    const query = await SELF.fetch('https://rooms.test/db/query', {
      method: 'POST',
      headers,
      body: JSON.stringify({ sql: 'SELECT k, v FROM rt_flags WHERE k = ?', params: ['realtime'] }),
    });
    expect(query.status).toBe(200);
    const body = (await query.json()) as { results: unknown[]; meta: { rows_read: number } };
    expect(body.results).toEqual([{ k: 'realtime', v: 'on' }]);
    expect(body.meta.rows_read).toBeGreaterThanOrEqual(1);
    const batch = await SELF.fetch('https://rooms.test/db/batch', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        statements: [
          { sql: 'CREATE TABLE IF NOT EXISTS t_probe (id INTEGER PRIMARY KEY, v TEXT)' },
          { sql: 'INSERT INTO t_probe (v) VALUES (?)', params: ['a'] },
          { sql: 'SELECT COUNT(*) AS n FROM t_probe' },
        ],
      }),
    });
    expect(batch.status).toBe(200);
    const results = (await batch.json()) as { results: { results: unknown[] }[] };
    expect(results.results[2]?.results).toEqual([{ n: 1 }]);
    const counters = (await (
      await SELF.fetch('https://rooms.test/db/counters', { headers })
    ).json()) as Record<string, number>;
    expect(counters.queries).toBeGreaterThanOrEqual(1);
    expect(counters.batches).toBeGreaterThanOrEqual(1);
    const bad = await SELF.fetch('https://rooms.test/db/query', {
      method: 'POST',
      headers,
      body: JSON.stringify({ sql: 7 }),
    });
    expect(bad.status).toBe(400);
  });
});
