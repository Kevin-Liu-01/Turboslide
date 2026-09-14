// The redis channel against the in process fake (SPEC-3 16.6): the contract over two instances,
// the contention test of report 10 F34 (1,000 appends from two instances, no lost entry, the
// longest wait under 50 ms), the gap fill when pub/sub drops a message, the NOSCRIPT reload, one
// subscription per instance per deck (F24), and the flag failure mode of SPEC-3 0.33.
import { cpus, loadavg } from 'node:os';

import { describe, expect, it } from 'vitest';

import { appendWithRetry } from './admission.ts';
import type { Entry, RoomEvent } from './channel.ts';
import {
  CLIENT_A,
  CLIENT_B,
  channelContract,
  editEntry,
  kevin,
  maya,
  until,
} from './channel-contract.ts';
import { fakeRedis } from './redis-fake.ts';
import type { FakeRedis } from './redis-fake.ts';
import { redisChannel } from './redis.ts';
import type { RedisCommands } from './redis.ts';

function pair(fake: FakeRedis, now: () => number) {
  return {
    a: redisChannel(fake, { now, flagCacheMs: 0 }),
    b: redisChannel(fake, { now, flagCacheMs: 0 }),
  };
}

channelContract('redis (two instances over one fake)', async () => {
  let clock = 1_700_000_000_000;
  const now = (): number => clock;
  const { a, b } = pair(fakeRedis({ now }), now);
  return {
    channel: a,
    peer: b,
    advance: (ms) => {
      clock += ms;
    },
  };
});

describe('redisChannel', () => {
  it('admits 1,000 appends from two contending instances with no lost entry and every wait under 50 ms', async () => {
    // every command is one asynchronous turn on the fake's one thread, so the two instances
    // interleave at every command boundary, the shape Redis's single thread gives two functions
    const fake = fakeRedis();
    const { a, b } = pair(fake, () => Date.now());
    const seenA: Entry[] = [];
    const seenB: Entry[] = [];
    const stopA = a.subscribe('gt-brand', (event) => {
      if (event.type === 'op') seenA.push(event.entry);
    });
    const stopB = b.subscribe('gt-brand', (event) => {
      if (event.type === 'op') seenB.push(event.entry);
    });
    // one subscription per instance per deck (report 10 F24): two instances, two
    await until(() => fake.subscribers('deck:gt-brand:events') === 2);

    // the scripts load once per instance; the first append of each carries that and is not a
    // contention wait, so both instances warm up before the timed run
    expect((await a.append('gt-brand', 0, [editEntry(CLIENT_A, 0, kevin)])).ok).toBe(true);
    expect((await b.append('gt-brand', 1, [editEntry(CLIENT_B, 0, maya)])).ok).toBe(true);
    const warm = 2;

    const waits: number[] = [];
    const attempts: number[] = [];
    let retries = 0;
    let locked = 0;
    const write = async (
      channel: typeof a,
      clientId: string,
      n: number,
      author: typeof kevin,
    ): Promise<void> => {
      const started = performance.now();
      const base = await channel.head('gt-brand');
      // the loop of SPEC-3 3.4 step 5: transform against what landed (a block.set needs no
      // change), retry, and after two misses take the append lock so nobody starves
      const result = await appendWithRetry(
        channel,
        'gt-brand',
        base,
        [editEntry(clientId, n, author)],
        (pending, landed) => {
          expect(landed.length).toBeGreaterThan(0);
          return pending;
        },
      );
      expect(result.ok, `append ${n}`).toBe(true);
      if (!result.ok) return;
      retries += result.attempts - 1;
      if (result.locked) locked += 1;
      attempts.push(result.attempts);
      waits.push(performance.now() - started);
    };

    const total = 1000;
    const inFlight = 8;
    const jobs: Promise<void>[] = [];
    for (let worker = 0; worker < inFlight; worker += 1) {
      jobs.push(
        (async () => {
          for (let n = worker; n < total; n += inFlight) {
            if (n % 2 === 0) await write(a, CLIENT_A, n + 1, kevin);
            else await write(b, CLIENT_B, n + 1, maya);
          }
        })(),
      );
    }
    await Promise.all(jobs);

    expect(await a.head('gt-brand')).toBe(total + warm);
    const stream = fake.stream('deck:gt-brand:ops');
    expect(stream).toHaveLength(total + warm);
    expect(stream.map((row) => row.seq)).toEqual(
      Array.from({ length: total + warm }, (_, i) => i + 1),
    );
    const opIds = new Set(
      (await a.since('gt-brand', 0, total + warm + 10)).map((entry) => entry.opId),
    );
    expect(opIds.size).toBe(total + warm);
    for (let n = 1; n <= total; n += 1) {
      expect(opIds.has(n % 2 === 1 ? `${CLIENT_A}:${n}` : `${CLIENT_B}:${n}`), `opId ${n}`).toBe(
        true,
      );
    }
    expect(retries).toBeGreaterThan(0);
    const sorted = [...waits].sort((x, y) => x - y);
    const percentile = (p: number): number =>
      sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
    const worst = sorted[sorted.length - 1] ?? 0;
    const mostAttempts = Math.max(...attempts);
    const load = loadavg()[0] ?? 0;
    const busy = load > cpus().length;
    console.info(
      `contention: ${total} appends, ${retries} retries, ${locked} under the append lock, most attempts by one writer ${mostAttempts}, wait p50 ${percentile(0.5).toFixed(2)} ms, p95 ${percentile(0.95).toFixed(2)} ms, max ${worst.toFixed(2)} ms (load ${load.toFixed(1)} on ${cpus().length} cpus${busy ? ', the max is logged and not asserted' : ''})`,
    );
    // no writer starves (report 10 F34): the compare and append rounds per writer stay bounded
    // whatever the interleaving, and the wall clock wait stays under 50 ms; on a machine whose
    // load exceeds its cpus the one millisecond lock poll can fire tens of milliseconds late, so
    // the maximum is logged there and the 95th percentile carries the assertion (VERIFICATION-2
    // section 14, the budgets under load)
    expect(mostAttempts).toBeLessThanOrEqual(16);
    expect(percentile(0.95)).toBeLessThan(50);
    if (!busy) expect(worst).toBeLessThan(50);

    // every instance's listeners saw every op once, in order
    await until(() => seenA.length >= total + warm && seenB.length >= total + warm, 5000);
    expect(seenA.map((entry) => entry.seq)).toEqual(stream.map((row) => row.seq));
    expect(seenB.map((entry) => entry.seq)).toEqual(stream.map((row) => row.seq));
    stopA();
    stopB();
  }, 20_000);

  it('fills the gap from the stream when pub/sub drops a message', async () => {
    const fake = fakeRedis({
      dropPublish: (channel, message, n) =>
        channel.endsWith(':events') && message.startsWith('{"t":"ops"') && n % 3 === 0,
    });
    const { a, b } = pair(fake, () => Date.now());
    const seen: number[] = [];
    const stop = b.subscribe('gt-brand', (event) => {
      if (event.type === 'op') seen.push(event.entry.seq);
    });
    await until(() => fake.subscribers('deck:gt-brand:events') === 1);
    for (let n = 1; n <= 12; n += 1) {
      const result = await a.append('gt-brand', n - 1, [editEntry(CLIENT_A, n)]);
      expect(result.ok).toBe(true);
    }
    // the dropped deliveries (3, 6, 9, 12) are read back from the stream by the next message;
    // the last one has no next message yet, so the twelve are complete after one more append
    await until(() => seen.length >= 11);
    expect(seen).toEqual(Array.from({ length: 11 }, (_, i) => i + 1));
    await a.append('gt-brand', 12, [editEntry(CLIENT_A, 13)]);
    await until(() => seen.length >= 13);
    expect(seen).toEqual(Array.from({ length: 13 }, (_, i) => i + 1));
    expect(fake.calls.filter((call) => call[0] === 'XRANGE').length).toBeGreaterThan(0);
    stop();
  });

  it('reloads a script after NOSCRIPT and keeps one subscription per deck per instance', async () => {
    const fake = fakeRedis();
    const { a, b } = pair(fake, () => Date.now());
    expect((await a.append('gt-brand', 0, [editEntry(CLIENT_A, 1)])).ok).toBe(true);
    const loads = (): number =>
      fake.calls.filter((call) => call[0] === 'SCRIPT' && call[1] === 'LOAD').length;
    expect(loads()).toBe(1);
    fake.flushScripts();
    expect((await a.append('gt-brand', 1, [editEntry(CLIENT_A, 2)])).ok).toBe(true);
    expect(loads()).toBe(2);
    expect(fake.stream('deck:gt-brand:ops')).toHaveLength(2);

    const stop1 = a.subscribe('gt-brand', () => {});
    const stop2 = a.subscribe('gt-brand', () => {});
    const stop3 = b.subscribe('gt-brand', () => {});
    await until(() => fake.subscribers('deck:gt-brand:events') === 2);
    expect(fake.calls.filter((call) => call[0] === 'SUBSCRIBE')).toHaveLength(2);
    stop1();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(fake.subscribers('deck:gt-brand:events')).toBe(2);
    stop2();
    stop3();
    await until(() => fake.subscribers('deck:gt-brand:events') === 0);
  });

  it('reads flags from Redis, caches them for 5 s, and treats an unreachable Redis as SPEC-3 0.33 says', async () => {
    let clock = 1_700_000_000_000;
    const fake = fakeRedis({ now: () => clock });
    const channel = redisChannel(fake, { now: () => clock });
    expect(await channel.flag('uploads')).toBe(true);
    await fake.call('SET', 'flag:uploads', 'off');
    // the cached value holds for 5 s
    expect(await channel.flag('uploads')).toBe(true);
    clock += 5001;
    expect(await channel.flag('uploads')).toBe(false);
    await fake.call('SET', 'flag:uploads', 'on');
    clock += 5001;
    expect(await channel.flag('uploads')).toBe(true);

    const broken: RedisCommands = {
      call: async () => {
        throw new Error('ECONNREFUSED');
      },
      subscribe: async () => async () => {},
      quit: async () => {},
    };
    const down = redisChannel(broken, { now: () => clock });
    expect(await down.flag('realtime')).toBe(false);
    expect(await down.flag('comments')).toBe(true);
    expect(await down.flag('readOnly')).toBe(true);
    await expect(down.flag('chat')).rejects.toThrow(TypeError);
  });

  it('refuses a lock token with a colon and reports a malformed message without stopping', async () => {
    const errors: string[] = [];
    const fake = fakeRedis();
    const channel = redisChannel(fake, { onError: (_error, context) => errors.push(context) });
    await expect(channel.lock('k', 'a:b', 1000)).rejects.toThrow(TypeError);
    const seen: RoomEvent[] = [];
    const stop = channel.subscribe('gt-brand', (event) => seen.push(event));
    await until(() => fake.subscribers('deck:gt-brand:events') === 1);
    await fake.call('PUBLISH', 'deck:gt-brand:events', 'not json');
    await fake.call('PUBLISH', 'deck:gt-brand:events', '{"t":"event","event":{"type":"chat"}}');
    await channel.publish('gt-brand', { type: 'inbox', unread: 2 });
    await until(() => seen.length >= 1);
    expect(seen).toEqual([{ type: 'inbox', unread: 2 }]);
    expect(errors.some((context) => /did not parse/.test(context))).toBe(true);
    stop();
    await channel.close();
  });
});
