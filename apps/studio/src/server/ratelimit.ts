import { logSecurityEvent } from './log';

/**
 * The application quotas (gslides-parity SPEC-3 0.25, 8.3; report 04 7.5, report 09 8.3, report
 * 10 3.3): counted per identity beside the WAF rules, which count per IP and per region and sit
 * about a third under the intended number. The table is data (`QUOTAS`): one row per quota with
 * the window and the three tiers anonymous, signed in and agent key. A refusal is 429 with
 * `Retry-After` and one sentence the chrome shows (SPEC-3 6.8), logged once as `http.429` with the
 * quota name under `rule`.
 *
 * Backends behind one `RateLimiter` interface: `memoryLimiter` (a fixed window counter per key in
 * this process: the checkout, the `tmp` store, and the fallback), `kvLimiter` over a key value
 * client (B3's `KvClient` shape; `start.ts` binds it over the room's ioredis client on the redis
 * tier, so `REDIS_URL` gives every instance the same counters), and `upstashLimiter` over the
 * `limit()` method of `@upstash/ratelimit`'s `Ratelimit`, typed structurally so the tests drive
 * it against a fake and the account boundary of the round never needs an Upstash database
 * (docs/hosting.md names the variables that turn it on). The limiter is bound once per process
 * (`bindRateLimiter`); the default is memory. Server only.
 *
 * What holds where (VERIFICATION-3 finding 17): a windowed quota counts in the bound backend
 * only. Hosted without `REDIS_URL` and without the Upstash pair (the blob tier, the degraded tier
 * of the round) the backend is memory, every function instance keeps its own counters and Fluid
 * compute spreads one caller's requests across instances, so no windowed quota reaches its limit
 * (measured: 430 anonymous thumbnail renders against the 400 per hour row all answered 200). On
 * that tier the WAF rules of `firewall/rules.json` are the only limits that count across
 * instances, and they limit only after the flip from log mode to their action. The rows that
 * need no counter hold on every tier: a tier limit of 0 (an anonymous invitation or avatar
 * upload) refuses at once, `largestPictureBytes` compares a size, and `DECK_CAPS` are checked
 * against the document. No counter runs over the Blob store on purpose: a `BlobStore.write` per
 * counted request would cost more than the request it counts and Blob commits are about 15 a
 * second across a deployment (docs/hosting.md section 9). `warnPerInstanceQuotas` logs the
 * degraded state once per platform process as `config.degraded` so the log says which variable
 * turns the shared counter on.
 */

export type Tier = 'anonymous' | 'account' | 'agent';

export type QuotaName =
  | 'writesPerMinutePerDeck'
  | 'rendersPerHour'
  | 'exportsPerDay'
  | 'exportConcurrency'
  | 'standaloneBuildsPerDay'
  | 'deckCreatesPerDay'
  | 'bundlesPerDay'
  | 'bundleBytesPerDay'
  | 'commentsPerMinute'
  | 'commentsPerDay'
  | 'picturesPerDay'
  | 'pictureBytesPerDay'
  | 'largestPictureBytes'
  | 'avatarUploadsPerDay'
  | 'materializePerHour'
  | 'materialCapturesPerHour'
  | 'streamOpensPerMinute'
  | 'streamsConcurrent'
  | 'opsPerMinute'
  | 'opsBytesPerMinute'
  | 'presenceBatchesPerSecond'
  | 'invitationsPerDay'
  | 'accessRequestsPerDeckPerDay'
  | 'accessRequestsPerDay'
  | 'linkCreatesPerDeckPerDay'
  | 'mentionMailsPerDay'
  | 'redisCommandsPerDay'
  | 'assistCallsPerMinutePerDeck'
  | 'assistCallsPerDay';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MB = 1024 * 1024;
const GB = 1024 * MB;

export type Quota = {
  name: QuotaName;
  /** The window in milliseconds; 0 for a ceiling that is not a rate (concurrency, a size). */
  windowMs: number;
  limits: Readonly<Record<Tier, number>>;
  /** The sentence the chrome shows; SPEC-3 6.8 fixes the export and the ops one. */
  sentence: string;
  /** Counted per deck as well as per identity. */
  perDeck?: true;
};

const TOO_MANY = 'Too many changes at once. Try again in a minute';
const EXPORT_LIMIT = 'You have reached today’s export limit';
/** The assist's refusal sentence (docs/PRODUCT.md 6.3). */
export const ASSIST_TOO_MANY = 'Too many assistant requests. Try again in a minute';
/** The anonymous day cap of the assist without `TURBOSLIDE_ASSIST_DAY_CAP` (docs/PRODUCT.md 6.3). */
export const ASSIST_DAY_CAP_DEFAULT = 20;

/** SPEC-3 8.3, the "Application quota beside it" column and the three rows without a WAF rule. */
export const QUOTAS: Readonly<Record<QuotaName, Quota>> = {
  writesPerMinutePerDeck: {
    name: 'writesPerMinutePerDeck',
    windowMs: MINUTE,
    limits: { anonymous: 120, account: 240, agent: 600 },
    sentence: TOO_MANY,
    perDeck: true,
  },
  rendersPerHour: {
    name: 'rendersPerHour',
    windowMs: HOUR,
    limits: { anonymous: 400, account: 2_000, agent: 5_000 },
    sentence: 'Too many slide renders this hour. Try again later',
  },
  exportsPerDay: {
    name: 'exportsPerDay',
    windowMs: DAY,
    limits: { anonymous: 5, account: 30, agent: 100 },
    sentence: EXPORT_LIMIT,
  },
  exportConcurrency: {
    name: 'exportConcurrency',
    windowMs: 0,
    limits: { anonymous: 1, account: 1, agent: 2 },
    sentence: 'Another download is still running. Wait for it to finish',
  },
  standaloneBuildsPerDay: {
    name: 'standaloneBuildsPerDay',
    windowMs: DAY,
    limits: { anonymous: 3, account: 20, agent: 50 },
    sentence: EXPORT_LIMIT,
  },
  deckCreatesPerDay: {
    name: 'deckCreatesPerDay',
    windowMs: DAY,
    limits: { anonymous: 5, account: 50, agent: 200 },
    sentence: 'You have reached today’s limit for new presentations',
  },
  bundlesPerDay: {
    name: 'bundlesPerDay',
    windowMs: DAY,
    limits: { anonymous: 2, account: 20, agent: 100 },
    sentence: 'You have reached today’s limit for deck bundles',
  },
  bundleBytesPerDay: {
    name: 'bundleBytesPerDay',
    windowMs: DAY,
    limits: { anonymous: 100 * MB, account: 2 * GB, agent: 10 * GB },
    sentence: 'You have reached today’s limit for deck bundles',
  },
  commentsPerMinute: {
    name: 'commentsPerMinute',
    windowMs: MINUTE,
    limits: { anonymous: 10, account: 30, agent: 60 },
    sentence: 'Too many comments at once. Try again in a minute',
  },
  commentsPerDay: {
    name: 'commentsPerDay',
    windowMs: DAY,
    limits: { anonymous: 200, account: 1_000, agent: 5_000 },
    sentence: 'You have reached today’s comment limit',
  },
  picturesPerDay: {
    name: 'picturesPerDay',
    windowMs: DAY,
    limits: { anonymous: 20, account: 200, agent: 500 },
    sentence: 'You have reached today’s limit for pictures',
  },
  pictureBytesPerDay: {
    name: 'pictureBytesPerDay',
    windowMs: DAY,
    limits: { anonymous: 200 * MB, account: 5 * GB, agent: 10 * GB },
    sentence: 'You have reached today’s limit for pictures',
  },
  largestPictureBytes: {
    name: 'largestPictureBytes',
    windowMs: 0,
    limits: { anonymous: 25 * MB, account: 50 * MB, agent: 50 * MB },
    sentence: 'This picture is too large',
  },
  avatarUploadsPerDay: {
    name: 'avatarUploadsPerDay',
    windowMs: DAY,
    limits: { anonymous: 0, account: 10, agent: 0 },
    sentence: 'Sign in to upload a picture',
  },
  materializePerHour: {
    name: 'materializePerHour',
    windowMs: HOUR,
    limits: { anonymous: 20, account: 100, agent: 500 },
    sentence: 'Too many dithered pictures this hour. Try again later',
  },
  materialCapturesPerHour: {
    name: 'materialCapturesPerHour',
    windowMs: HOUR,
    limits: { anonymous: 10, account: 50, agent: 200 },
    sentence: 'Too many shader captures this hour. Try again later',
  },
  streamOpensPerMinute: {
    name: 'streamOpensPerMinute',
    windowMs: MINUTE,
    limits: { anonymous: 30, account: 60, agent: 60 },
    sentence: TOO_MANY,
  },
  streamsConcurrent: {
    name: 'streamsConcurrent',
    windowMs: 0,
    limits: { anonymous: 4, account: 8, agent: 4 },
    sentence: 'This presentation is open in too many tabs',
  },
  opsPerMinute: {
    name: 'opsPerMinute',
    windowMs: MINUTE,
    limits: { anonymous: 2_400, account: 4_800, agent: 4_800 },
    sentence: TOO_MANY,
  },
  opsBytesPerMinute: {
    name: 'opsBytesPerMinute',
    windowMs: MINUTE,
    limits: { anonymous: 2 * MB, account: 8 * MB, agent: 8 * MB },
    sentence: TOO_MANY,
  },
  presenceBatchesPerSecond: {
    name: 'presenceBatchesPerSecond',
    windowMs: SECOND,
    limits: { anonymous: 15, account: 15, agent: 5 },
    sentence: TOO_MANY,
  },
  invitationsPerDay: {
    name: 'invitationsPerDay',
    windowMs: DAY,
    limits: { anonymous: 0, account: 50, agent: 50 },
    sentence: 'You have reached today’s limit for invitations',
  },
  accessRequestsPerDeckPerDay: {
    name: 'accessRequestsPerDeckPerDay',
    windowMs: DAY,
    limits: { anonymous: 3, account: 3, agent: 3 },
    sentence: 'You have already asked for access to this presentation today',
    perDeck: true,
  },
  accessRequestsPerDay: {
    name: 'accessRequestsPerDay',
    windowMs: DAY,
    limits: { anonymous: 10, account: 20, agent: 20 },
    sentence: 'You have reached today’s limit for access requests',
  },
  linkCreatesPerDeckPerDay: {
    name: 'linkCreatesPerDeckPerDay',
    windowMs: DAY,
    limits: { anonymous: 5, account: 30, agent: 30 },
    sentence: 'Too many links today. Try again tomorrow',
    perDeck: true,
  },
  mentionMailsPerDay: {
    name: 'mentionMailsPerDay',
    windowMs: DAY,
    limits: { anonymous: 0, account: 20, agent: 20 },
    sentence: 'You have reached today’s limit for mention emails',
  },
  redisCommandsPerDay: {
    name: 'redisCommandsPerDay',
    windowMs: DAY,
    limits: { anonymous: 500_000, account: 2_000_000, agent: 2_000_000 },
    sentence: TOO_MANY,
  },
  /* The assist's two rows (docs/PRODUCT.md 6.3; audit-assist 5): a model call is the costliest
     request the product makes, so it is counted per deck per minute and per identity per day.
     On a deployment with anonymous principals every seller is anonymous, so the caps that apply
     are 6 a minute and 20 a day; `TURBOSLIDE_ASSIST_DAY_CAP` raises the anonymous day cap for a
     deployment whose sellers are known (General Translation's sets 60), read at check time by
     `checkAssistQuotas`, so the table's value stays the documented default. */
  assistCallsPerMinutePerDeck: {
    name: 'assistCallsPerMinutePerDeck',
    windowMs: MINUTE,
    limits: { anonymous: 6, account: 20, agent: 60 },
    sentence: ASSIST_TOO_MANY,
    perDeck: true,
  },
  assistCallsPerDay: {
    name: 'assistCallsPerDay',
    windowMs: DAY,
    limits: { anonymous: ASSIST_DAY_CAP_DEFAULT, account: 300, agent: 1_000 },
    sentence: 'You have reached today’s limit for the assistant',
  },
};

/** The variable that raises the anonymous day cap of `assistCallsPerDay` (docs/PRODUCT.md 6.3). */
export const ASSIST_DAY_CAP_ENV = 'TURBOSLIDE_ASSIST_DAY_CAP';

/**
 * The anonymous tier's assist calls per day: the variable when it is a positive integer, else
 * the table's 20. The account and agent tiers keep the table's values.
 */
export function assistDayCap(
  env: Readonly<Record<string, string | undefined>> = process.env,
): number {
  const raw = env[ASSIST_DAY_CAP_ENV];
  if (raw === undefined || raw.trim() === '') return ASSIST_DAY_CAP_DEFAULT;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) return ASSIST_DAY_CAP_DEFAULT;
  return value;
}

export const QUOTA_NAMES: readonly QuotaName[] = Object.keys(QUOTAS) as QuotaName[];

/** The deck caps independent of identity (SPEC-3 8.3), checked at admission and in `applyWrite`. */
export const DECK_CAPS = {
  slides: 500,
  blocksPerSlide: 400,
  slideDocumentBytes: 200 * 1024,
  htmlBlockBytes: 5 * MB,
  documentBytes: 25 * MB,
  publicAssetBytes: 200 * MB,
  continuousSourceBytes: 250 * MB,
  commentBytes: 5 * MB,
  commentsPerThread: 200,
  retainedStreamBytes: 16 * MB,
  uploadsInFlightBytes: 500 * MB,
  mutationsPerWrite: 200,
  namedVersions: 40,
  grantHolders: 600,
  liveLinks: 50,
} as const;

/** The tier of a caller (SPEC-3 8.3 columns): an agent key, a signed in account, else anonymous. */
export function tierOf(ctx: {
  agent?: unknown;
  principal: { kind: 'anonymous' | 'account' } | null;
}): Tier {
  if (ctx.agent !== undefined) return 'agent';
  if (ctx.principal?.kind === 'account') return 'account';
  return 'anonymous';
}

export type LimitResult = {
  ok: boolean;
  /** How many more the window admits; 0 when refused. */
  remaining: number;
  /** When the window resets, in ms since the epoch. */
  resetAt: number;
};

export type RateLimiter = {
  kind: 'memory' | 'kv' | 'upstash';
  /** Counts `cost` against the key's window; `ok: false` when the count passes the limit. */
  limit: (key: string, limit: number, windowMs: number, cost?: number) => Promise<LimitResult>;
  /** Releases a concurrency slot taken with a window of 0. */
  release?: (key: string, cost?: number) => Promise<void>;
};

/** A fixed window counter per key in this process: the checkout, the tmp store, and the fallback. */
export function memoryLimiter(now: () => number = () => Date.now()): RateLimiter & {
  reset: () => void;
} {
  const rows = new Map<string, { count: number; resetAt: number }>();
  return {
    kind: 'memory',
    reset: () => rows.clear(),
    async limit(key, limit, windowMs, cost = 1) {
      const t = now();
      let row = rows.get(key);
      if (row === undefined || (windowMs > 0 && row.resetAt <= t)) {
        row = { count: 0, resetAt: windowMs > 0 ? t + windowMs : Number.MAX_SAFE_INTEGER };
        rows.set(key, row);
      }
      if (row.count + cost > limit) {
        return { ok: false, remaining: 0, resetAt: row.resetAt };
      }
      row.count += cost;
      return { ok: true, remaining: Math.max(0, limit - row.count), resetAt: row.resetAt };
    },
    async release(key, cost = 1) {
      const row = rows.get(key);
      if (row === undefined) return;
      row.count = Math.max(0, row.count - cost);
    },
  };
}

/** The key value client shape the kv limiter needs: B3's `KvClient` (get, set with a TTL, del). */
export type LimiterKv = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlMs: number): Promise<void>;
  del(key: string): Promise<void>;
};

/**
 * A fixed window counter over a key value client, bound on the redis tier over the room's ioredis
 * client (`start.ts`), so every instance of a deployment counts in the same window. Read then
 * write, so two instances racing can admit one extra request per window; the redis tier accepts
 * that, and a deployment with the Upstash pair takes `upstashLimiter` instead. The blob tier
 * binds no kv limiter (the module header says why) and stays on memory.
 */
export function kvLimiter(kv: LimiterKv, now: () => number = () => Date.now()): RateLimiter {
  return {
    kind: 'kv',
    async limit(key, limit, windowMs, cost = 1) {
      const t = now();
      const raw = await kv.get(`q:${key}`);
      let row: { count: number; resetAt: number } | null = null;
      if (raw !== null) {
        try {
          row = JSON.parse(raw) as { count: number; resetAt: number };
        } catch {
          row = null;
        }
      }
      if (row === null || (windowMs > 0 && row.resetAt <= t)) {
        row = { count: 0, resetAt: windowMs > 0 ? t + windowMs : t + 60 * MINUTE };
      }
      if (row.count + cost > limit) return { ok: false, remaining: 0, resetAt: row.resetAt };
      row.count += cost;
      await kv.set(`q:${key}`, JSON.stringify(row), Math.max(1, row.resetAt - t));
      return { ok: true, remaining: Math.max(0, limit - row.count), resetAt: row.resetAt };
    },
    async release(key, cost = 1) {
      const raw = await kv.get(`q:${key}`);
      if (raw === null) return;
      try {
        const row = JSON.parse(raw) as { count: number; resetAt: number };
        row.count = Math.max(0, row.count - cost);
        await kv.set(`q:${key}`, JSON.stringify(row), Math.max(1, row.resetAt - now()));
      } catch {
        await kv.del(`q:${key}`);
      }
    },
  };
}

/**
 * The `limit()` method of `@upstash/ratelimit`'s `Ratelimit` as this module reads it (the
 * package answers `{ success, limit, remaining, reset, pending }`), typed structurally so a fake
 * drives the tests and the real one binds with no adapter.
 */
export type UpstashRatelimitLike = {
  limit: (
    identifier: string,
    options?: { rate?: number },
  ) => Promise<{ success: boolean; remaining: number; reset: number }>;
};

/**
 * `@upstash/ratelimit` behind the interface. One `Ratelimit` instance carries one limit and one
 * window, so the binder passes a factory keyed by quota and the limiter caches an instance per
 * `(limit, windowMs)`; `windowMs` 0 (a concurrency slot) falls to the memory limiter, which the
 * fixed plan cannot express.
 */
export function upstashLimiter(
  factory: (limit: number, windowMs: number) => UpstashRatelimitLike,
  fallback: RateLimiter = memoryLimiter(),
): RateLimiter {
  const instances = new Map<string, UpstashRatelimitLike>();
  return {
    kind: 'upstash',
    async limit(key, limit, windowMs, cost = 1) {
      if (windowMs === 0) return fallback.limit(key, limit, windowMs, cost);
      const id = `${limit}:${windowMs}`;
      let instance = instances.get(id);
      if (instance === undefined) {
        instance = factory(limit, windowMs);
        instances.set(id, instance);
      }
      const answer = await instance.limit(key, cost === 1 ? undefined : { rate: cost });
      return { ok: answer.success, remaining: answer.remaining, resetAt: answer.reset };
    },
    release: (key, cost) => fallback.release?.(key, cost) ?? Promise.resolve(),
  };
}

const LIMITER: unique symbol = Symbol.for('turboslide.studio.rateLimiter');
const WARNED: unique symbol = Symbol.for('turboslide.studio.rateLimiter.warned');

/** The per process state on `globalThis`, so every module instance of a dev server shares it. */
type LimiterGlobals = { [LIMITER]?: RateLimiter; [WARNED]?: boolean };

function store(): LimiterGlobals {
  return globalThis as unknown as LimiterGlobals;
}

/** The process's limiter; memory until `bindRateLimiter` names another. */
export function rateLimiter(): RateLimiter {
  return (store()[LIMITER] ??= memoryLimiter());
}

/**
 * Binds the deployment's limiter (B2's channel or ioredis client, or Upstash); returns the
 * previous one. A new binding is a new decision, so it re-arms `warnPerInstanceQuotas`.
 */
export function bindRateLimiter(next: RateLimiter | undefined): RateLimiter | undefined {
  const previous = store()[LIMITER];
  store()[LIMITER] = next;
  store()[WARNED] = false;
  return previous;
}

/** Whether the bound limiter counts across the instances of a deployment; memory counts in this process alone. */
export function quotasShared(): boolean {
  return rateLimiter().kind !== 'memory';
}

/**
 * The hosted degraded tier (finding 17 of VERIFICATION-3): a process on the memory limiter where
 * the platform runs several instances (`multiInstance`: `VERCEL` set, Fluid compute) counts per
 * instance, so no windowed quota holds and the WAF rules carry the limits. Logged once per
 * process (per binding) as `config.degraded` (the `config-degraded` alert notifies, never pages:
 * the degraded tier is a known state and one line per instance start is the instance count) with
 * the variables that turn a shared counter on, never with a value; `true` when the line was
 * written. A checkout is quiet, tmp store or not: one process, so its memory counter holds.
 */
export function warnPerInstanceQuotas(multiInstance: boolean): boolean {
  if (!multiInstance || quotasShared() || store()[WARNED] === true) return false;
  store()[WARNED] = true;
  logSecurityEvent({
    event: 'config.degraded',
    reason: `${REDIS_URL_ENV} and ${UPSTASH_URL_ENV} unset: the application quotas count per instance and do not hold across instances; the WAF rules of firewall/rules.json carry the limits`,
  });
  return true;
}

/**
 * The environment that turns Upstash on (SPEC-3 8.3, docs/hosting.md): both variables set. This
 * module never imports the package; `bindUpstashFromEnv` in the ship step does, so a checkout and
 * the account boundary of this round never load it.
 */
export const UPSTASH_URL_ENV = 'UPSTASH_REDIS_REST_URL';
export const UPSTASH_TOKEN_ENV = 'UPSTASH_REDIS_REST_TOKEN';
/** The variable of the redis tier; with it `start.ts` binds the kv limiter over the room's client. */
export const REDIS_URL_ENV = 'REDIS_URL';

export function hasUpstash(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return Boolean(env[UPSTASH_URL_ENV]) && Boolean(env[UPSTASH_TOKEN_ENV]);
}

/** The key a quota counts under: the identity, the quota, and the deck when the row is per deck. */
export function quotaKey(name: QuotaName, identity: string, deckId?: string): string {
  const quota = QUOTAS[name];
  return quota.perDeck === true && deckId !== undefined
    ? `${identity}:${name}:${deckId}`
    : `${identity}:${name}`;
}

export type QuotaContext = {
  /** The identity field of the log line: a principal id, `agent:<tokenId>` or `ip:<hash>`. */
  identity: string;
  tier: Tier;
  deckId?: string;
  action?: string;
  requestId?: string;
  transport?: 'window' | 'http' | 'mcp' | 'cli' | 'route';
};

/** The refusal a quota answers: 429 with the sentence and the seconds to wait; `Retry-After` on the Response. */
export class RateLimitedError extends Error {
  readonly status = 429;
  readonly quota: QuotaName;
  readonly retryAfterSeconds: number;

  constructor(quota: QuotaName, retryAfterSeconds: number) {
    super(QUOTAS[quota].sentence);
    this.name = 'RateLimitedError';
    this.quota = quota;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** The JSON body of a 429 (report 09 8.2): `{ error: 'rate_limited' }` plus the sentence. */
export function rateLimitedResponse(error: RateLimitedError): Response {
  return Response.json(
    { error: 'rate_limited', message: error.message, quota: error.quota },
    {
      status: 429,
      headers: {
        'retry-after': String(error.retryAfterSeconds),
        'cache-control': 'no-store',
      },
    },
  );
}

/**
 * Counts one request (or `cost` units, bytes for the byte quotas) against a quota; `null` when
 * admitted, else the RateLimitedError to throw or answer, logged as `http.429` with the quota
 * under `rule`. A limit of 0 for the tier refuses at once with the sentence.
 */
export async function checkQuota(
  name: QuotaName,
  ctx: QuotaContext,
  cost = 1,
  options: { limit?: number } = {},
): Promise<RateLimitedError | null> {
  const quota = QUOTAS[name];
  const limit = options.limit ?? quota.limits[ctx.tier];
  const key = quotaKey(name, ctx.identity, ctx.deckId);
  const result =
    limit <= 0
      ? { ok: false, remaining: 0, resetAt: Date.now() + Math.max(quota.windowMs, 60_000) }
      : await rateLimiter().limit(key, limit, quota.windowMs, cost);
  if (result.ok) return null;
  const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
  logSecurityEvent({
    event: 'http.429',
    status: 429,
    rule: name,
    identity: ctx.identity,
    ...(ctx.deckId !== undefined ? { deckId: ctx.deckId } : {}),
    ...(ctx.action !== undefined ? { action: ctx.action } : {}),
    ...(ctx.requestId !== undefined ? { requestId: ctx.requestId } : {}),
    ...(ctx.transport !== undefined ? { transport: ctx.transport } : {}),
    ...(cost !== 1 ? { bytes: cost } : {}),
  });
  return new RateLimitedError(name, retryAfter);
}

/**
 * The assist's two rows in one call (docs/PRODUCT.md 6.3, 8.3): the per deck minute first, then
 * the day, whose anonymous cap reads `TURBOSLIDE_ASSIST_DAY_CAP`. A refusal names the row that
 * refused; the route and the agent action's handler both call this, so one table holds on every
 * transport. The minute row is counted before the day row so a refused minute never spends a
 * day's unit.
 */
export async function checkAssistQuotas(
  ctx: QuotaContext,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<RateLimitedError | null> {
  const minute = await checkQuota('assistCallsPerMinutePerDeck', ctx);
  if (minute !== null) return minute;
  return checkQuota(
    'assistCallsPerDay',
    ctx,
    1,
    ctx.tier === 'anonymous' ? { limit: assistDayCap(env) } : {},
  );
}

/** `checkQuota` for a server function: throws the RateLimitedError. */
export async function assertQuota(name: QuotaName, ctx: QuotaContext, cost = 1): Promise<void> {
  const refused = await checkQuota(name, ctx, cost);
  if (refused !== null) throw refused;
}

/** Releases a concurrency slot (`exportConcurrency`, `streamsConcurrent`) taken by `checkQuota`. */
export async function releaseQuota(name: QuotaName, ctx: QuotaContext, cost = 1): Promise<void> {
  await rateLimiter().release?.(quotaKey(name, ctx.identity, ctx.deckId), cost);
}

/**
 * The size ceiling of a picture for a tier (SPEC-3 8.5: 25 MB anonymous, 50 MB signed in), a
 * quota with no window; `checkQuota` cannot count it, so callers compare here.
 */
export function largestPictureBytes(tier: Tier): number {
  return QUOTAS.largestPictureBytes.limits[tier];
}
