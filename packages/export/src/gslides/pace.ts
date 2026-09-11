// Quota pacing and backoff (SPEC 8.3): the Slides API allows 60 write requests and 60 read
// requests per minute per user and answers 429 on excess. The pacer keeps a sliding window per
// bucket and waits for the oldest call to age out before the next one goes; `run` retries a call
// that fails with 429 or a 5xx with exponential backoff, honoring Retry-After when the response
// carries one, and rethrows every other error at once. The clock and the sleep are injectable so
// the unit test runs without waiting.
export type PaceBucket = 'write' | 'read';

export type PacerOptions = {
  /** Calls per window per bucket; default 60 writes and 60 reads. */
  limits?: Partial<Record<PaceBucket, number>>;
  windowMs?: number;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** A jitter source in [0, 1); default Math.random. Tests pass () => 0. */
  jitter?: () => number;
  log?: (line: string) => void;
};

export type PacerStats = {
  calls: Record<PaceBucket, number>;
  waits: number;
  waitedMs: number;
  retries: number;
};

export const DEFAULT_LIMITS: Record<PaceBucket, number> = { write: 60, read: 60 };
export const DEFAULT_WINDOW_MS = 60_000;
export const DEFAULT_MAX_ATTEMPTS = 6;
export const DEFAULT_BASE_DELAY_MS = 1_000;
export const DEFAULT_MAX_DELAY_MS = 64_000;

/** The HTTP status of an error from googleapis (gaxios), fetch or a plain object, or undefined. */
export function statusOf(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const e = error as { status?: unknown; code?: unknown; response?: { status?: unknown } };
  const candidates = [e.status, e.response?.status, e.code];
  for (const c of candidates) {
    const n = typeof c === 'string' ? Number(c) : c;
    if (typeof n === 'number' && Number.isInteger(n) && n >= 100 && n <= 599) return n;
  }
  return undefined;
}

/** Retry-After in milliseconds when the error's response carries the header. */
export function retryAfterMs(error: unknown, now: number = Date.now()): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const headers = (error as { response?: { headers?: unknown } }).response?.headers;
  let value: unknown;
  if (headers && typeof (headers as Headers).get === 'function')
    value = (headers as Headers).get('retry-after');
  else if (headers && typeof headers === 'object')
    value = (headers as Record<string, unknown>)['retry-after'];
  if (typeof value !== 'string' || value.length === 0) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : Math.max(0, at - now);
}

export function isRetryable(error: unknown): boolean {
  const status = statusOf(error);
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

/** The backoff before attempt `attempt` (1-based, after the first failure): base * 2^(attempt-1), capped, plus jitter. */
export function backoffMs(
  attempt: number,
  options: { baseDelayMs?: number; maxDelayMs?: number; jitter?: () => number } = {},
): number {
  const base = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const max = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const raw = Math.min(max, base * 2 ** Math.max(0, attempt - 1));
  const jitter = (options.jitter ?? Math.random)();
  return Math.round(raw * (0.5 + jitter / 2));
}

export class RatePacer {
  private readonly limits: Record<PaceBucket, number>;
  private readonly windowMs: number;
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly jitter: () => number;
  private readonly log: (line: string) => void;
  private readonly stamps: Record<PaceBucket, number[]> = { write: [], read: [] };
  private queue: Promise<void> = Promise.resolve();
  readonly stats: PacerStats = { calls: { write: 0, read: 0 }, waits: 0, waitedMs: 0, retries: 0 };

  constructor(options: PacerOptions = {}) {
    this.limits = { ...DEFAULT_LIMITS, ...options.limits };
    this.windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
    this.maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
    this.now = options.now ?? (() => Date.now());
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.jitter = options.jitter ?? Math.random;
    this.log = options.log ?? (() => {});
  }

  /** How long the next call of a bucket must wait, in ms; 0 when a slot is free. */
  waitFor(bucket: PaceBucket): number {
    const now = this.now();
    const stamps = this.stamps[bucket];
    while (stamps.length > 0 && (stamps[0] as number) <= now - this.windowMs) stamps.shift();
    if (stamps.length < this.limits[bucket]) return 0;
    return Math.max(0, (stamps[0] as number) + this.windowMs - now);
  }

  /** Waits for a slot in the bucket and takes it. Calls are serialized so two callers never share a slot. */
  acquire(bucket: PaceBucket): Promise<void> {
    const next = this.queue.then(async () => {
      const wait = this.waitFor(bucket);
      if (wait > 0) {
        this.stats.waits += 1;
        this.stats.waitedMs += wait;
        this.log(`pace: ${bucket} quota reached, waiting ${Math.ceil(wait / 1000)} s`);
        await this.sleep(wait);
      }
      this.stamps[bucket].push(this.now());
      this.stats.calls[bucket] += 1;
    });
    this.queue = next.catch(() => {});
    return next;
  }

  /** Runs a call under the bucket's quota, retrying 429 and 5xx with backoff. */
  async run<T>(bucket: PaceBucket, label: string, call: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
      await this.acquire(bucket);
      try {
        return await call();
      } catch (error) {
        if (!isRetryable(error) || attempt >= this.maxAttempts) throw error;
        const status = statusOf(error);
        const delay =
          retryAfterMs(error, this.now()) ??
          backoffMs(attempt, {
            baseDelayMs: this.baseDelayMs,
            maxDelayMs: this.maxDelayMs,
            jitter: this.jitter,
          });
        this.stats.retries += 1;
        this.log(
          `pace: ${label} answered ${status ?? 'an error'}; retry ${attempt} of ${this.maxAttempts - 1} in ${Math.ceil(delay / 1000)} s`,
        );
        await this.sleep(delay);
      }
    }
  }
}
