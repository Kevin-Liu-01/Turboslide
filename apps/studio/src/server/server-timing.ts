import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * The `server-timing` header (docs/NEXT.md 3.2 H9; audit-performance 82 and item 5): every
 * document and server function answer names the store reads the request waited on, one entry per
 * read with its duration, a `cold` entry with the instance's age and the request's ordinal on the
 * instance (1 is the instance's first request, the cold start), a `facts` entry per read of the
 * session facts cache naming a hit or a miss (auth/identity.ts `accountSession`), and a `total`
 * entry with the time to the answer's headers. The 4.8 s editor first byte, the 14 s listing and
 * the HTTP 500 of the audit get named the next time they happen.
 *
 * One collector per request rides an AsyncLocalStorage that the global headers middleware opens
 * (headers.ts `securityHeadersMiddleware`), so a reader anywhere under the request records into
 * it without a parameter; outside a request `timed` runs the work and records nothing. Server
 * only: the module imports node:async_hooks, so a module the browser loads reaches it through a
 * dynamic import inside a server handler (write.ts does).
 */

/** One entry of the header: a metric name, a duration in milliseconds, an optional description. */
export type TimingEntry = { name: string; dur?: number; desc?: string };

export type RequestTiming = {
  /** `performance.now()` when the request entered the middleware */
  startedAt: number;
  entries: TimingEntry[];
};

/** The most entries one answer carries: a request that reads more is summarized by its first ones. */
export const MAX_TIMING_ENTRIES = 40;

/* on globalThis, so the middleware and a handler that reached this module through another chunk
   or a dev server reload share one store and one count per process (root.ts keeps its runtime the
   same way) */
const shared = globalThis as typeof globalThis & {
  __turboslideServerTiming?: { storage: AsyncLocalStorage<RequestTiming>; served: number };
};
shared.__turboslideServerTiming ??= { storage: new AsyncLocalStorage<RequestTiming>(), served: 0 };
const state = shared.__turboslideServerTiming;
const storage = state.storage;

/** The instance's first moment: the process start, which a cold function pays for. */
const PROCESS_STARTED_AT = Date.now() - Math.round(process.uptime() * 1000);

/** A fresh collector for one request. */
export function newRequestTiming(now: number = performance.now()): RequestTiming {
  return { startedAt: now, entries: [] };
}

/** Runs `work` with `timing` as the request's collector and answers what it answers. */
export function withRequestTiming<T>(timing: RequestTiming, work: () => T): T {
  return storage.run(timing, work);
}

/** The request's collector, or undefined outside a request. */
export function currentTiming(): RequestTiming | undefined {
  return storage.getStore();
}

/** Records one entry on the request's collector; a no op outside a request or past the cap. */
export function noteTiming(entry: TimingEntry): void {
  const timing = storage.getStore();
  if (timing === undefined || timing.entries.length >= MAX_TIMING_ENTRIES) return;
  timing.entries.push(entry);
}

/**
 * Runs one store read and records its duration under `name`, failed or not (a read that threw is
 * marked `desc="failed"`, so a 500 still names the read that broke).
 */
export async function timed<T>(name: string, work: () => Promise<T>): Promise<T> {
  const timing = storage.getStore();
  if (timing === undefined) return work();
  const started = performance.now();
  try {
    const value = await work();
    noteTiming({ name, dur: performance.now() - started });
    return value;
  } catch (error) {
    noteTiming({ name, dur: performance.now() - started, desc: 'failed' });
    throw error;
  }
}

/** The instance's age in milliseconds and this request's ordinal on it, counted once per request. */
export function instanceFacts(now: number = Date.now()): { ageMs: number; request: number } {
  state.served += 1;
  return { ageMs: Math.max(0, now - PROCESS_STARTED_AT), request: state.served };
}

/** A metric name as the header's token grammar allows: letters, digits and `-_.` alone. */
export function metricName(name: string): string {
  const token = name.replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '');
  return token === '' ? 'read' : token;
}

/** A description as a quoted string: quotes and backslashes escaped, control characters dropped. */
function quoted(value: string): string {
  return `"${value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/["\\]/g, (c) => `\\${c}`)}"`;
}

/** One entry as the header writes it: `name;dur=12.3;desc="..."`. */
export function formatEntry(entry: TimingEntry): string {
  const parts = [metricName(entry.name)];
  if (entry.dur !== undefined && Number.isFinite(entry.dur))
    parts.push(`dur=${Math.max(0, Math.round(entry.dur * 10) / 10)}`);
  if (entry.desc !== undefined && entry.desc !== '') parts.push(`desc=${quoted(entry.desc)}`);
  return parts.join(';');
}

/**
 * The header's value for a request: the recorded reads in the order they ended, then `cold` with
 * the instance's age and the request's ordinal, then `total` with the time to the headers.
 */
export function serverTimingValue(
  timing: RequestTiming,
  facts: { ageMs: number; request: number },
  now: number = performance.now(),
): string {
  const entries: TimingEntry[] = [
    ...timing.entries,
    { name: 'cold', dur: facts.ageMs, desc: `request ${facts.request}` },
    { name: 'total', dur: now - timing.startedAt },
  ];
  return entries.map(formatEntry).join(', ');
}
