// `POST /api/x/errors` (hardening HR-O#2a, RELIABILITY-14; docs/hardening/HARDENING.md 4.8): the
// browser's error reports reach the function's log. The body is one line of
// `@turboslide/report/line` (a kind, a route, a message and the head of a stack, at most 4 KB);
// the route reads it with `readReportLine`, which scrubs every field again, and writes one JSON
// line at error with the build this deployment serves. No answer body: 204.
//
// The bounds: a body over 4 KB answers 413 before it is read whole; one address sends at most
// ERRORS_PER_ADDRESS lines a minute (429 past it), so a page in a loop cannot fill the log; and
// past LOGGED_PER_MINUTE lines in a minute an instance logs one line in SAMPLE_PAST_BUDGET, with
// the rate on the line, so a burst from many browsers stays readable and bounded. The address is
// the limiter's key alone and never enters the line. The CSRF filter of headers.ts covers the
// route (`/api/x/` except the CSP reports), so another site cannot post into it from a browser.
import { REPORT_LINE_MAX_BYTES, readReportLine } from '@turboslide/report/line';
import type { ReportLine } from '@turboslide/report/line';

import { buildCommit } from './build-commit';
import { clientAddress } from './headers';
import { memoryLimiter } from './ratelimit';
import type { RateLimiter } from './ratelimit';

/** Lines one address may send in a minute. */
export const ERRORS_PER_ADDRESS = 30;
/** Lines an instance logs in a minute before it samples. */
export const LOGGED_PER_MINUTE = 300;
/** Past the budget, one line in this many is logged. */
export const SAMPLE_PAST_BUDGET = 10;

const MINUTE_MS = 60_000;

/** The JSON line the log receives for one report. */
export type ReportLogLine = ReportLine & {
  t: string;
  source: 'client';
  event: 'client.error';
  build: string | null;
  /** present when the line stands for this many (the sampling past the budget) */
  sampled?: number;
};

export type ClientErrorDeps = {
  limiter: RateLimiter;
  log: (line: string) => void;
  now: () => number;
  build: () => string | null;
};

/** This instance's minute of logged lines (the sampling past LOGGED_PER_MINUTE). */
const minute = { startedAt: 0, logged: 0, seen: 0 };

function defaultDeps(): ClientErrorDeps {
  return {
    limiter: addressLimiter,
    log: (line) => console.error(line),
    now: () => Date.now(),
    build: () => buildCommit(),
  };
}

const addressLimiter = memoryLimiter();

/** Whether this line is logged, and the rate it stands for when it is a sample. */
function sample(now: number): { log: boolean; sampled?: number } {
  if (now - minute.startedAt >= MINUTE_MS) {
    minute.startedAt = now;
    minute.logged = 0;
    minute.seen = 0;
  }
  minute.seen += 1;
  if (minute.logged < LOGGED_PER_MINUTE) {
    minute.logged += 1;
    return { log: true };
  }
  if (minute.seen % SAMPLE_PAST_BUDGET === 0) return { log: true, sampled: SAMPLE_PAST_BUDGET };
  return { log: false };
}

/** Forgets the minute's sampling window (tests). */
export function resetClientErrorWindow(): void {
  minute.startedAt = 0;
  minute.logged = 0;
  minute.seen = 0;
}

function empty(status: number, headers: Record<string, string> = {}): Response {
  return new Response(null, { status, headers: { 'cache-control': 'no-store', ...headers } });
}

/**
 * The route's handler: 204 with the line logged (or sampled out), 400 for a body that is not a
 * line, 413 past 4 KB, 429 past the address's minute.
 */
export async function acceptClientError(
  request: Request,
  deps: ClientErrorDeps = defaultDeps(),
): Promise<{ response: Response; line: ReportLine | null }> {
  const address = clientAddress(request) ?? 'unknown';
  const admitted = await deps.limiter.limit(
    `client-error:${address}`,
    ERRORS_PER_ADDRESS,
    MINUTE_MS,
  );
  if (!admitted.ok) return { response: empty(429, { 'retry-after': '60' }), line: null };
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > REPORT_LINE_MAX_BYTES) return { response: empty(413), line: null };
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > REPORT_LINE_MAX_BYTES)
    return { response: empty(413), line: null };
  const line = readReportLine(text);
  if (line === null) return { response: empty(400), line: null };
  const now = deps.now();
  const decision = sample(now);
  if (decision.log) {
    const out: ReportLogLine = {
      t: new Date(now).toISOString(),
      source: 'client',
      event: 'client.error',
      build: deps.build(),
      ...line,
      ...(decision.sampled !== undefined ? { sampled: decision.sampled } : {}),
    };
    deps.log(JSON.stringify(out));
  }
  return { response: empty(204), line };
}
