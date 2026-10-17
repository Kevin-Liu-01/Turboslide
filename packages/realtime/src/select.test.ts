// Tier selection from the environment (SPEC-3 2.5; docs/CLOUDFLARE.md 3.6.1): the explicit
// choice, the Worker's host, Vercel without the Worker, and a checkout; the tiers are memory, blob
// and do (the Redis tier left in HR-C#8), and the reason never carries the secret or the bearer.
import { describe, expect, it } from 'vitest';

import { REALTIME_TIERS } from './channel.ts';
import { BLOB_TIER_NOTICE, selectRealtime } from './select.ts';

const ROOM = {
  TURBOSLIDE_ROOM_HOST: 'turboslide-realtime-preview.fake.workers.dev',
  TURBOSLIDE_ROOM_SECRET: 'room-secret-value-0000000000000000000000000000000000000000',
  TURBOSLIDE_ROOM_BEARER: 'room-bearer-value-0000000000000000000000000000000000000000',
};
const REDIS_URL = 'rediss://default:secret-password@fake.upstash.io:6379';

describe('selectRealtime', () => {
  it('lists the tiers memory, blob and do', () => {
    expect(REALTIME_TIERS).toEqual(['memory', 'blob', 'do']);
  });

  it('runs memory on a checkout, and a REDIS_URL selects nothing', () => {
    expect(selectRealtime({})).toEqual({
      tier: 'memory',
      reason: 'one process',
      room: false,
      notice: null,
    });
    expect(selectRealtime({ REDIS_URL }).tier).toBe('memory');
  });

  it('falls to blob on Vercel without a Worker and says so', () => {
    expect(selectRealtime({ VERCEL: '1' })).toEqual({
      tier: 'blob',
      reason: 'VERCEL without TURBOSLIDE_ROOM_HOST',
      room: false,
      notice: BLOB_TIER_NOTICE,
    });
    expect(selectRealtime({ VERCEL: '1', REDIS_URL }).tier).toBe('blob');
  });

  it('selects do from the Worker host and never prints a secret', () => {
    const selected = selectRealtime({ VERCEL: '1', ...ROOM });
    expect(selected).toEqual({
      tier: 'do',
      reason: 'TURBOSLIDE_ROOM_HOST is set',
      room: true,
      notice: null,
    });
    const printed = JSON.stringify(selected);
    expect(printed).not.toContain('room-secret-value');
    expect(printed).not.toContain('room-bearer-value');
  });

  it('refuses a host without the secret and the bearer, and a forced do without all three', () => {
    expect(() => selectRealtime({ TURBOSLIDE_ROOM_HOST: ROOM.TURBOSLIDE_ROOM_HOST })).toThrow(
      /TURBOSLIDE_ROOM_SECRET, TURBOSLIDE_ROOM_BEARER are not/,
    );
    expect(() =>
      selectRealtime({
        TURBOSLIDE_REALTIME: 'do',
        TURBOSLIDE_ROOM_HOST: ROOM.TURBOSLIDE_ROOM_HOST,
      }),
    ).toThrow(/TURBOSLIDE_REALTIME=do needs TURBOSLIDE_ROOM_SECRET, TURBOSLIDE_ROOM_BEARER/);
    expect(selectRealtime({ TURBOSLIDE_REALTIME: 'do', ...ROOM })).toMatchObject({
      tier: 'do',
      reason: 'TURBOSLIDE_REALTIME=do',
      room: true,
      notice: null,
    });
  });

  it('lets TURBOSLIDE_REALTIME win and refuses a wrong word, redis among them', () => {
    // the hand row of docs/CLOUDFLARE.md 2.1: the Worker's database with a local channel
    expect(selectRealtime({ TURBOSLIDE_REALTIME: 'memory', ...ROOM })).toMatchObject({
      tier: 'memory',
      reason: 'TURBOSLIDE_REALTIME=memory',
      room: true,
    });
    expect(selectRealtime({ TURBOSLIDE_REALTIME: 'blob' }).notice).toBe(BLOB_TIER_NOTICE);
    expect(() => selectRealtime({ TURBOSLIDE_REALTIME: 'redis', REDIS_URL })).toThrow(
      /must be one of memory, blob, do, got "redis"/,
    );
    expect(() => selectRealtime({ TURBOSLIDE_REALTIME: 'ably' })).toThrow(
      /must be one of memory, blob, do/,
    );
  });
});
