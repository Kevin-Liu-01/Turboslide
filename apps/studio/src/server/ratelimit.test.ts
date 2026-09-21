import { afterEach, describe, expect, it } from 'vitest';

import { setSecurityLogSink } from './log';
import type { SecurityLine } from './log';
import {
  ASSIST_DAY_CAP_ENV,
  DECK_CAPS,
  QUOTAS,
  QUOTA_NAMES,
  RateLimitedError,
  assistDayCap,
  bindRateLimiter,
  checkAssistQuotas,
  checkQuota,
  hasUpstash,
  kvLimiter,
  largestPictureBytes,
  memoryLimiter,
  quotaKey,
  quotasShared,
  rateLimitedResponse,
  releaseQuota,
  tierOf,
  upstashLimiter,
  warnPerInstanceQuotas,
} from './ratelimit';
import type { LimiterKv, QuotaContext, UpstashRatelimitLike } from './ratelimit';

// The application quotas of gslides-parity SPEC-3 8.3: the table with its three tiers, the
// memory, kv and Upstash (behind a fake) backends, the 429 with Retry-After and the sentence, and
// the concurrency slots.

const lines: SecurityLine[] = [];
setSecurityLogSink((line) => lines.push(line));

afterEach(() => {
  lines.length = 0;
  bindRateLimiter(undefined);
});

describe('the table', () => {
  it('carries every row of 8.3 with a window, three tiers and a sentence', () => {
    expect(QUOTA_NAMES.length).toBeGreaterThanOrEqual(25);
    for (const name of QUOTA_NAMES) {
      const quota = QUOTAS[name];
      expect(quota.name).toBe(name);
      expect(quota.windowMs).toBeGreaterThanOrEqual(0);
      expect(quota.limits.anonymous).toBeLessThanOrEqual(quota.limits.account);
      expect(quota.sentence).not.toMatch(/[—]|quota|identity|principal/i);
    }
    expect(QUOTAS.writesPerMinutePerDeck.limits).toEqual({
      anonymous: 120,
      account: 240,
      agent: 600,
    });
    expect(QUOTAS.exportsPerDay.limits).toEqual({ anonymous: 5, account: 30, agent: 100 });
    expect(QUOTAS.exportsPerDay.sentence).toBe('You have reached today’s export limit');
    expect(QUOTAS.opsPerMinute.sentence).toBe('Too many changes at once. Try again in a minute');
    expect(DECK_CAPS.slides).toBe(500);
    expect(DECK_CAPS.mutationsPerWrite).toBe(200);
    expect(largestPictureBytes('anonymous')).toBe(25 * 1024 * 1024);
    expect(largestPictureBytes('account')).toBe(50 * 1024 * 1024);
  });

  it('reads the tier from the context and keys per deck where the row says so', () => {
    expect(tierOf({ principal: null })).toBe('anonymous');
    expect(tierOf({ principal: { kind: 'anonymous' } })).toBe('anonymous');
    expect(tierOf({ principal: { kind: 'account' } })).toBe('account');
    expect(tierOf({ principal: null, agent: {} })).toBe('agent');
    expect(quotaKey('writesPerMinutePerDeck', 'anon_1', 'q4')).toBe(
      'anon_1:writesPerMinutePerDeck:q4',
    );
    expect(quotaKey('exportsPerDay', 'anon_1', 'q4')).toBe('anon_1:exportsPerDay');
  });
});

describe('the memory limiter', () => {
  it('counts a fixed window per key and resets when the window ends', async () => {
    let t = 0;
    const limiter = memoryLimiter(() => t);
    for (let i = 0; i < 3; i += 1) expect((await limiter.limit('k', 3, 1000)).ok).toBe(true);
    const refused = await limiter.limit('k', 3, 1000);
    expect(refused).toEqual({ ok: false, remaining: 0, resetAt: 1000 });
    t = 1000;
    expect((await limiter.limit('k', 3, 1000)).ok).toBe(true);
    // a concurrency slot has no window: taken and released
    expect((await limiter.limit('slot', 1, 0)).ok).toBe(true);
    expect((await limiter.limit('slot', 1, 0)).ok).toBe(false);
    await limiter.release?.('slot');
    expect((await limiter.limit('slot', 1, 0)).ok).toBe(true);
  });
});

describe('the kv limiter', () => {
  it('keeps the window in the store with the TTL and counts bytes as cost', async () => {
    const rows = new Map<string, { value: string; ttl: number }>();
    const kv: LimiterKv = {
      get: (key) => Promise.resolve(rows.get(key)?.value ?? null),
      set: (key, value, ttlMs) => {
        rows.set(key, { value, ttl: ttlMs });
        return Promise.resolve();
      },
      del: (key) => {
        rows.delete(key);
        return Promise.resolve();
      },
    };
    let t = 10_000;
    const limiter = kvLimiter(kv, () => t);
    expect((await limiter.limit('bytes', 100, 60_000, 60)).ok).toBe(true);
    expect((await limiter.limit('bytes', 100, 60_000, 50)).ok).toBe(false);
    expect(rows.get('q:bytes')?.ttl).toBe(60_000);
    t += 60_000;
    expect((await limiter.limit('bytes', 100, 60_000, 50)).ok).toBe(true);
    await limiter.release?.('bytes', 50);
    expect((await limiter.limit('bytes', 100, 60_000, 100)).ok).toBe(true);
  });
});

describe('the Upstash limiter behind a fake', () => {
  it('asks one instance per limit and window and falls to memory for a concurrency slot', async () => {
    const made: string[] = [];
    const calls: { id: string; rate?: number }[] = [];
    const factory = (limit: number, windowMs: number): UpstashRatelimitLike => {
      made.push(`${limit}:${windowMs}`);
      const counts = new Map<string, number>();
      return {
        limit: (id, options) => {
          calls.push({ id, ...(options?.rate !== undefined ? { rate: options.rate } : {}) });
          const count = (counts.get(id) ?? 0) + (options?.rate ?? 1);
          counts.set(id, count);
          return Promise.resolve({
            success: count <= limit,
            remaining: Math.max(0, limit - count),
            reset: 99,
          });
        },
      };
    };
    const limiter = upstashLimiter(factory);
    expect((await limiter.limit('a', 2, 60_000)).ok).toBe(true);
    expect((await limiter.limit('a', 2, 60_000)).ok).toBe(true);
    expect(await limiter.limit('a', 2, 60_000)).toEqual({ ok: false, remaining: 0, resetAt: 99 });
    expect((await limiter.limit('b', 2, 60_000, 2)).ok).toBe(true);
    expect(made).toEqual(['2:60000']);
    expect(calls.at(-1)).toEqual({ id: 'b', rate: 2 });
    expect((await limiter.limit('slot', 1, 0)).ok).toBe(true);
    expect((await limiter.limit('slot', 1, 0)).ok).toBe(false);
    expect(made).toHaveLength(1);
    expect(hasUpstash({})).toBe(false);
    expect(
      hasUpstash({ UPSTASH_REDIS_REST_URL: 'https://x', UPSTASH_REDIS_REST_TOKEN: 'fake-t' }),
    ).toBe(true);
  });
});

describe('checkQuota', () => {
  it('admits under the limit, refuses over it with 429, Retry-After and one log line, and refuses a zero tier at once', async () => {
    let t = 0;
    bindRateLimiter(memoryLimiter(() => t));
    const ctx = {
      identity: 'anon_1',
      tier: 'anonymous' as const,
      deckId: 'q4',
      action: 'export.run',
    };
    for (let i = 0; i < 5; i += 1) expect(await checkQuota('exportsPerDay', ctx)).toBeNull();
    const refused = await checkQuota('exportsPerDay', ctx);
    expect(refused).toBeInstanceOf(RateLimitedError);
    expect(refused?.message).toBe('You have reached today’s export limit');
    expect(refused?.retryAfterSeconds).toBeGreaterThan(0);
    const response = rateLimitedResponse(refused!);
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe(String(refused!.retryAfterSeconds));
    expect(await response.json()).toMatchObject({ error: 'rate_limited', quota: 'exportsPerDay' });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      event: 'http.429',
      rule: 'exportsPerDay',
      identity: 'anon_1',
      deckId: 'q4',
      action: 'export.run',
    });
    // an anonymous owner cannot invite (0 per day): refused before any count
    expect(await checkQuota('invitationsPerDay', ctx)).toBeInstanceOf(RateLimitedError);
    // a per deck row keys on the deck: another deck has its own window
    for (let i = 0; i < 120; i += 1)
      expect(await checkQuota('writesPerMinutePerDeck', ctx)).toBeNull();
    expect(await checkQuota('writesPerMinutePerDeck', ctx)).toBeInstanceOf(RateLimitedError);
    expect(await checkQuota('writesPerMinutePerDeck', { ...ctx, deckId: 'other' })).toBeNull();
    // a slot is released
    expect(await checkQuota('exportConcurrency', ctx)).toBeNull();
    expect(await checkQuota('exportConcurrency', ctx)).toBeInstanceOf(RateLimitedError);
    await releaseQuota('exportConcurrency', ctx);
    expect(await checkQuota('exportConcurrency', ctx)).toBeNull();
    t += 25 * 60 * 60 * 1000;
    expect(await checkQuota('exportsPerDay', ctx)).toBeNull();
  });
});

describe('the hosted degraded tier (VERIFICATION-3 finding 17)', () => {
  it('says whether the counters are shared and logs the per instance state once per hosted binding', async () => {
    // a checkout on memory (one process, tmp store or not): not shared, and quiet
    expect(quotasShared()).toBe(false);
    expect(warnPerInstanceQuotas(false)).toBe(false);
    expect(lines).toHaveLength(0);
    // on the platform on memory: one config.degraded line naming the variables, never a value
    expect(warnPerInstanceQuotas(true)).toBe(true);
    expect(warnPerInstanceQuotas(true)).toBe(false);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ event: 'config.degraded' });
    expect(lines[0]?.reason).toContain('REDIS_URL');
    expect(lines[0]?.reason).toContain('UPSTASH_REDIS_REST_URL');
    expect(lines[0]?.reason).toContain('per instance');
    expect(lines[0]?.reason).toContain('firewall/rules.json');
    // a new binding is a new decision: memory again re-arms, a shared backend stays quiet
    bindRateLimiter(memoryLimiter());
    expect(warnPerInstanceQuotas(true)).toBe(true);
    expect(lines).toHaveLength(2);
    const rows = new Map<string, string>();
    const kv: LimiterKv = {
      get: (key) => Promise.resolve(rows.get(key) ?? null),
      set: (key, value) => {
        rows.set(key, value);
        return Promise.resolve();
      },
      del: (key) => {
        rows.delete(key);
        return Promise.resolve();
      },
    };
    bindRateLimiter(kvLimiter(kv));
    expect(quotasShared()).toBe(true);
    expect(warnPerInstanceQuotas(true)).toBe(false);
    expect(lines).toHaveLength(2);
    // the shared backend counts a quota like the memory one does
    const ctx = { identity: 'anon_2', tier: 'anonymous' as const };
    for (let i = 0; i < 5; i += 1) expect(await checkQuota('exportsPerDay', ctx)).toBeNull();
    expect(await checkQuota('exportsPerDay', ctx)).toBeInstanceOf(RateLimitedError);
  });
});

describe('the assist quotas (docs/PRODUCT.md 6.3, 8.3)', () => {
  const ctx = (identity: string, deckId: string): QuotaContext => ({
    identity,
    tier: 'anonymous',
    deckId,
    action: 'assist.propose',
    transport: 'route',
  });

  it('carries the two rows with the tiers and the sentence the specification names', () => {
    expect(QUOTAS.assistCallsPerMinutePerDeck.limits).toEqual({
      anonymous: 6,
      account: 20,
      agent: 60,
    });
    expect(QUOTAS.assistCallsPerMinutePerDeck.perDeck).toBe(true);
    expect(QUOTAS.assistCallsPerDay.limits).toEqual({ anonymous: 20, account: 300, agent: 1_000 });
    expect(QUOTAS.assistCallsPerMinutePerDeck.sentence).toBe(
      'Too many assistant requests. Try again in a minute',
    );
    expect(ASSIST_DAY_CAP_ENV).toBe('TURBOSLIDE_ASSIST_DAY_CAP');
    expect(assistDayCap({})).toBe(20);
    expect(assistDayCap({ TURBOSLIDE_ASSIST_DAY_CAP: '60' })).toBe(60);
    expect(assistDayCap({ TURBOSLIDE_ASSIST_DAY_CAP: 'sixty' })).toBe(20);
    expect(assistDayCap({ TURBOSLIDE_ASSIST_DAY_CAP: '0' })).toBe(20);
  });

  it('refuses the seventh call in a minute on one deck and admits the seventh on another deck', async () => {
    let t = 0;
    bindRateLimiter(memoryLimiter(() => t));
    for (let i = 0; i < 6; i += 1)
      expect(await checkAssistQuotas(ctx('anon_a', 'deck-1'), {})).toBeNull();
    const seventh = await checkAssistQuotas(ctx('anon_a', 'deck-1'), {});
    expect(seventh).toBeInstanceOf(RateLimitedError);
    expect(seventh?.quota).toBe('assistCallsPerMinutePerDeck');
    expect(seventh?.message).toBe('Too many assistant requests. Try again in a minute');
    expect(rateLimitedResponse(seventh as RateLimitedError).status).toBe(429);
    // the minute row is per deck: the same identity on another deck is admitted
    expect(await checkAssistQuotas(ctx('anon_a', 'deck-2'), {})).toBeNull();
    // a refused minute spent no day unit: 7 admitted so far (6 + 1), 13 left of 20
    t = 61_000;
    for (let i = 0; i < 6; i += 1)
      expect(await checkAssistQuotas(ctx('anon_a', 'deck-1'), {})).toBeNull();
    expect(lines.filter((line) => line.event === 'http.429')).toHaveLength(1);
  });

  it('refuses the twenty first call in a day and TURBOSLIDE_ASSIST_DAY_CAP raises the day cap', async () => {
    let t = 0;
    bindRateLimiter(memoryLimiter(() => t));
    // four minutes of six calls each stay under the minute row; the day row counts to 20
    let admitted = 0;
    for (let minute = 0; minute < 4; minute += 1) {
      t = minute * 61_000;
      for (let i = 0; i < 6; i += 1) {
        const refused = await checkAssistQuotas(ctx('anon_b', 'deck-1'), {});
        if (refused === null) admitted += 1;
        else {
          expect(refused.quota).toBe('assistCallsPerDay');
          expect(refused.message).toBe('You have reached today’s limit for the assistant');
        }
      }
    }
    expect(admitted).toBe(20);
    // the deployment that sets the cap: the same identity on a fresh limiter admits 60
    bindRateLimiter(memoryLimiter(() => t));
    let raised = 0;
    for (let minute = 0; minute < 11; minute += 1) {
      t = minute * 61_000;
      for (let i = 0; i < 6; i += 1) {
        if (
          (await checkAssistQuotas(ctx('anon_b', 'deck-1'), {
            TURBOSLIDE_ASSIST_DAY_CAP: '60',
          })) === null
        )
          raised += 1;
      }
    }
    expect(raised).toBe(60);
    // an account is not raised by the variable: the table's 300 stands
    bindRateLimiter(memoryLimiter(() => t));
    const account: QuotaContext = { ...ctx('acct_1', 'deck-1'), tier: 'account' };
    t = 0;
    for (let i = 0; i < 20; i += 1)
      expect(await checkAssistQuotas(account, { TURBOSLIDE_ASSIST_DAY_CAP: '1' })).toBeNull();
  });
});
