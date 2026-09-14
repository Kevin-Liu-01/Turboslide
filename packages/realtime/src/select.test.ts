// Tier selection from the environment (SPEC-3 2.5): the explicit choice, the Redis URL, Vercel
// without one, and a checkout; the reason never carries the URL.
import { describe, expect, it } from 'vitest';

import { BLOB_TIER_NOTICE, selectRealtime } from './select.ts';

const URL = 'rediss://default:secret-password@fake.upstash.io:6379';

describe('selectRealtime', () => {
  it('runs memory on a checkout and redis when REDIS_URL is set', () => {
    expect(selectRealtime({})).toEqual({
      tier: 'memory',
      reason: 'one process',
      redis: false,
      notice: null,
    });
    const redis = selectRealtime({ REDIS_URL: URL });
    expect(redis).toMatchObject({ tier: 'redis', redis: true, notice: null });
    expect(JSON.stringify(redis)).not.toContain('secret-password');
    expect(JSON.stringify(redis)).not.toContain('upstash');
  });

  it('falls to blob on Vercel without Redis and says so', () => {
    expect(selectRealtime({ VERCEL: '1' })).toEqual({
      tier: 'blob',
      reason: 'VERCEL without REDIS_URL',
      redis: false,
      notice: BLOB_TIER_NOTICE,
    });
    expect(selectRealtime({ VERCEL: '1', REDIS_URL: URL }).tier).toBe('redis');
  });

  it('lets TURBOSLIDE_REALTIME win and refuses a wrong word or redis without a URL', () => {
    expect(selectRealtime({ TURBOSLIDE_REALTIME: 'memory', REDIS_URL: URL })).toMatchObject({
      tier: 'memory',
      reason: 'TURBOSLIDE_REALTIME=memory',
      redis: true,
    });
    expect(selectRealtime({ TURBOSLIDE_REALTIME: 'blob' }).notice).toBe(BLOB_TIER_NOTICE);
    expect(() => selectRealtime({ TURBOSLIDE_REALTIME: 'redis' })).toThrow(/needs REDIS_URL/);
    expect(() => selectRealtime({ TURBOSLIDE_REALTIME: 'ably' })).toThrow(
      /must be one of memory, redis, blob/,
    );
  });
});
