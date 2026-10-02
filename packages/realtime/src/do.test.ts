// The do channel over a fake fetch (docs/CLOUDFLARE.md 3.6.1): the bearer on every call, the
// routes and their bodies, the flag off /health with its 60 s cache and the three failure rule,
// and the TypeError on everything the object owns.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { DO_FLAG_CACHE_MS, doChannel, isDoChannel } from './do.ts';

const here = dirname(fileURLToPath(import.meta.url));

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };

function fakeFetch(answer: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    for (const [key, value] of new Headers(init?.headers)) headers[key] = value;
    const call: Call = {
      url: String(input),
      method: init?.method ?? 'GET',
      headers,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    return answer(call);
  }) as typeof fetch;
  return { fetchFn, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('doChannel', () => {
  it('imports no node: module', () => {
    const source = readFileSync(join(here, 'do.ts'), 'utf8');
    expect(source).not.toMatch(/from 'node:/);
    expect(readFileSync(join(here, 'frames.ts'), 'utf8')).not.toMatch(/from 'node:/);
  });

  it('carries the bearer on every call and posts the routes of 3.6.2', async () => {
    const { fetchFn, calls } = fakeFetch((call) => {
      if (call.url.endsWith('/document')) return new Response(null, { status: 204 });
      if (call.url.endsWith('/roster')) return json({ clients: [] });
      if (call.url.endsWith('/flush')) return json({ ok: true, revision: 3, covered: 7, head: 7 });
      if (call.url.endsWith('/write'))
        return json({ ok: false, code: 'conflict', message: 'stale', currentRevision: 4 }, 409);
      return json({ ok: true });
    });
    const channel = doChannel({ host: 'rooms.test', bearer: 'the-bearer', fetch: fetchFn });
    expect(isDoChannel(channel)).toBe(true);
    expect(channel.origin).toBe('https://rooms.test');
    await channel.publish('gt-brand', { type: 'access', revision: 2 });
    expect(await channel.presence.roster('gt-brand')).toEqual([]);
    expect(await channel.document('gt-brand')).toBeNull();
    expect(await channel.flush('gt-brand')).toEqual({ ok: true, revision: 3, covered: 7, head: 7 });
    const write = await channel.serverWrite('gt-brand', {
      author: { kind: 'agent', name: 'bootstrap' },
      clientId: 'agent:x',
      mutations: [],
      baseRevision: 1,
      strict: true,
    });
    expect(write).toMatchObject({ ok: false, code: 'conflict', currentRevision: 4 });
    await channel.external('gt-brand', {
      revision: 5,
      author: { kind: 'human', name: 'K' },
      note: '',
    });
    await channel.accessChanged('gt-brand', ['anon_1']);
    expect(calls.map((call) => `${call.method} ${new URL(call.url).pathname}`)).toEqual([
      'POST /rooms/gt-brand/publish',
      'GET /rooms/gt-brand/roster',
      'GET /rooms/gt-brand/document',
      'POST /rooms/gt-brand/flush',
      'POST /rooms/gt-brand/write',
      'POST /rooms/gt-brand/external',
      'POST /rooms/gt-brand/access-changed',
    ]);
    for (const call of calls) expect(call.headers.authorization).toBe('Bearer the-bearer');
    expect(calls[0]?.body).toEqual({ event: { type: 'access', revision: 2 } });
    expect(calls[6]?.body).toEqual({ principalIds: ['anon_1'] });
  });

  it('reads the realtime flag off /health, caches it 60 s and reads off after three failures', async () => {
    let realtime: 'on' | 'off' = 'on';
    let fail = false;
    let t = 1_000_000;
    const { fetchFn, calls } = fakeFetch(() => {
      if (fail) throw new Error('unreachable');
      return json({ ok: true, protocol: 1, commit: 'abc', realtime, appOrigin: 'http://a' });
    });
    const channel = doChannel({
      host: '127.0.0.1:8791',
      bearer: 'b',
      insecure: true,
      fetch: fetchFn,
      now: () => t,
    });
    expect(channel.origin).toBe('http://127.0.0.1:8791');
    expect(await channel.flag('realtime')).toBe(true);
    realtime = 'off';
    expect(await channel.flag('realtime')).toBe(true); // cached
    t += DO_FLAG_CACHE_MS;
    expect(await channel.flag('realtime')).toBe(false);
    expect(calls.filter((call) => call.url.endsWith('/health'))).toHaveLength(2);
    expect(calls.every((call) => call.headers.authorization === undefined)).toBe(true);
    realtime = 'on';
    t += DO_FLAG_CACHE_MS;
    expect(await channel.flag('realtime')).toBe(true);
    fail = true;
    t += DO_FLAG_CACHE_MS;
    expect(await channel.flag('realtime')).toBe(true);
    expect(await channel.flag('realtime')).toBe(true);
    expect(await channel.flag('realtime')).toBe(false);
    expect(await channel.flag('presence')).toBe(true);
  });

  it('throws a TypeError on what the object owns and has no bus', async () => {
    const channel = doChannel({
      host: 'rooms.test',
      bearer: 'b',
      fetch: fakeFetch(() => json({})).fetchFn,
    });
    expect(channel.bus).toBeUndefined();
    await expect(channel.append('gt-brand', 0, [])).rejects.toThrow(/not on the do tier/);
    await expect(channel.head('gt-brand')).rejects.toThrow(TypeError);
    expect(() => channel.subscribe('gt-brand', () => {})).toThrow(/not on the do tier/);
    await expect(channel.presence.set('gt-brand', 'c', {} as never, 1)).rejects.toThrow(TypeError);
    await expect(channel.lock('k', 't', 1)).rejects.toThrow(TypeError);
  });
});
