// Tier selection from the environment (SPEC-3 2.5; docs/CLOUDFLARE.md 3.6.1): the explicit
// choice, the Worker's host, the Redis URL, Vercel without either, and a checkout; the reason
// never carries the URL, the secret or the bearer.
import { describe, expect, it } from 'vitest';

import { BLOB_TIER_NOTICE, selectRealtime } from './select.ts';

const URL = 'rediss://default:secret-password@fake.upstash.io:6379';
const ROOM = {
  TURBOSLIDE_ROOM_HOST: 'turboslide-realtime-preview.fake.workers.dev',
  TURBOSLIDE_ROOM_SECRET: 'room-secret-value-0000000000000000000000000000000000000000',
  TURBOSLIDE_ROOM_BEARER: 'room-bearer-value-0000000000000000000000000000000000000000',
};

describe('selectRealtime', () => {
  it('runs memory on a checkout and redis when REDIS_URL is set', () => {
    expect(selectRealtime({})).toEqual({
      tier: 'memory',
      reason: 'one process',
      redis: false,
      room: false,
      notice: null,
    });
    const redis = selectRealtime({ REDIS_URL: URL });
    expect(redis).toMatchObject({ tier: 'redis', redis: true, room: false, notice: null });
    expect(JSON.stringify(redis)).not.toContain('secret-password');
    expect(JSON.stringify(redis)).not.toContain('upstash');
  });

  it('falls to blob on Vercel without Redis and without a Worker and says so', () => {
    expect(selectRealtime({ VERCEL: '1' })).toEqual({
      tier: 'blob',
      reason: 'VERCEL without REDIS_URL',
      redis: false,
      room: false,
      notice: BLOB_TIER_NOTICE,
    });
    expect(selectRealtime({ VERCEL: '1', REDIS_URL: URL }).tier).toBe('redis');
  });

  it('selects do from the Worker host before the Redis check and never prints a secret', () => {
    const selected = selectRealtime({ VERCEL: '1', REDIS_URL: URL, ...ROOM });
    expect(selected).toEqual({
      tier: 'do',
      reason: 'TURBOSLIDE_ROOM_HOST is set',
      redis: true,
      room: true,
      notice: null,
    });
    const printed = JSON.stringify(selected);
    expect(printed).not.toContain('room-secret-value');
    expect(printed).not.toContain('room-bearer-value');
    expect(printed).not.toContain('secret-password');
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

  it('lets TURBOSLIDE_REALTIME win and refuses a wrong word or redis without a URL', () => {
    expect(selectRealtime({ TURBOSLIDE_REALTIME: 'memory', REDIS_URL: URL })).toMatchObject({
      tier: 'memory',
      reason: 'TURBOSLIDE_REALTIME=memory',
      redis: true,
    });
    // the hand row of docs/CLOUDFLARE.md 2.1: the Worker's database with a local channel
    expect(selectRealtime({ TURBOSLIDE_REALTIME: 'memory', ...ROOM })).toMatchObject({
      tier: 'memory',
      room: true,
    });
    expect(selectRealtime({ TURBOSLIDE_REALTIME: 'blob' }).notice).toBe(BLOB_TIER_NOTICE);
    expect(() => selectRealtime({ TURBOSLIDE_REALTIME: 'redis' })).toThrow(/needs REDIS_URL/);
    expect(() => selectRealtime({ TURBOSLIDE_REALTIME: 'ably' })).toThrow(
      /must be one of memory, redis, blob, do/,
    );
  });
});
