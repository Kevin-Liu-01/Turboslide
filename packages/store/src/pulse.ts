// The deck pulse (the focus round, cycle 3 fix round; VERIFICATION.md C3-F1, C3-F2; the blob tier
// budget of the cycle 3 prompt). Vercel Blob is a rate limited, billed API and the server polls it
// the way a client polls the server, on a budget: per open deck per instance at most one timed
// store call every HOSTED_POLL_MS while a client stream of the deck is open here, and none when no
// stream is open. Cycle 3 made about two a second (the 1 s manifest head, the 2 s presence record
// head, the 2 s comments index head) and the store answered 429 "Too many requests" under the
// walks (C3-F2), which the deadlines turned into the stall of C3-F1. One record per deck,
// `decks/<id>/.turboslide/pulse.json`, folds the three signals into one head: every writer of the
// deck (a commit of the manifest, a push of the presence record, a push of the comments index)
// overwrites it after its own write landed, so its etag moves whenever any of the three moved. A
// poller heads the pulse once per tick; on a moved etag it reads the three heads and pulls what
// moved, on an unchanged etag it reads nothing else. The body is a nonce: two writers never
// compute one body, so a second writer's put never hides the first's change from a poller that
// reads the etag afterwards. Every fifteenth tick heads the manifest instead of the pulse (a
// writer that stopped between its commit and its pulse put is caught within 30 s; the presence
// and comments pushes are in-process paths that write the pulse right after, and a presence row
// is refreshed anyway before its TTL). Node free, so the realtime package's blob channel imports
// it; the callers pass a bounded client (blob-store.ts boundedBlobClient), so a hung put ends at
// its deadline.
//
// The sync round (docs/SYNC.md 3.10, 4.5; audit-costs item 12) makes the tick two paced: 2 s
// while the deck is in use on this instance (an op landed here in the last 30 s) or somebody
// else is in the roster (a colleague's edit may land any second), 10 s when the one tab is
// alone and quiet. A colleague's arrival moves the pulse through their presence push, so the
// quiet poller reads it within one quiet tick, finds the second roster row and returns to the
// 2 s tick, inside the 35 s chip bound of `collab.presence-chips`; `pollTickMs` is the rule.
import type { BlobClient, BlobEntry } from './blob-store.ts';

/** The hosted poll interval per open deck per instance while the deck is in use: one head of the pulse per tick (SPEC-3 2.5, amended). */
export const HOSTED_POLL_MS = 2000;
/** The tick when the one tab is alone in the roster and no op landed on this instance lately (docs/SYNC.md 3.10). */
export const HOSTED_POLL_QUIET_MS = 10_000;
/** How long after an op landed on this instance the deck counts as in use, so the tick stays at HOSTED_POLL_MS. */
export const POLL_ACTIVE_WINDOW_MS = 30_000;
/** The most a poll waits after the store answered 429 or a 5xx: the backoff doubles from HOSTED_POLL_MS to here. */
export const POLL_BACKOFF_MAX_MS = 60_000;
/** Every this many ticks the poll heads the manifest instead of the pulse (a writer that stopped before its pulse put). */
export const PULSE_SAFETY_TICKS = 15;
/** The most timed store calls a minute one open deck costs one instance at rest: 60 s over the tick, one call per tick. */
export const POLL_CALLS_PER_MINUTE_MAX = 30;

export type PollTickInput = {
  /** the clock now, in ms */
  now: number;
  /** when an op last landed on this instance for the deck, in ms; 0 or absent when none did */
  lastOpAt?: number;
  /**
   * how many tabs keep the deck company: the roster rows other instances' tabs set, a second row
   * of this instance's tabs, or a second stream of the deck open on this instance (blob.ts
   * `nextTickMs` says why a second tab of the same instance counts: its POST may commit on
   * another instance)
   */
  others: number;
  /** the tick while in use; HOSTED_POLL_MS by default (the tests shorten it) */
  activeMs?: number;
  /** the tick when alone and quiet; HOSTED_POLL_QUIET_MS by default */
  quietMs?: number;
  /** the window an op keeps the deck in use for; POLL_ACTIVE_WINDOW_MS by default */
  activeWindowMs?: number;
  /**
   * whether `others` is a reading of the record: a proven read of the presence record, or of its
   * absence (presence-store.ts `proven`). False before the first read and while the record's
   * body cannot be read (the public store's edge on a just written record answers 403 for a
   * while, and the read used to count as an empty record): a tab whose company is unknown is
   * never counted alone. Absent, the roster is taken as read.
   */
  rosterKnown?: boolean;
};

/**
 * The wait before the next poll of one deck on one instance (docs/SYNC.md 3.10): the active tick
 * while an op landed here inside the window, the deck has company (`others`: another
 * instance's row, a second own row, or a second stream on this instance) or the roster is not
 * known yet (`rosterKnown` false), the quiet tick otherwise. Both stay under
 * POLL_CALLS_PER_MINUTE_MAX, one call per tick (pulse.test.ts pins the arithmetic).
 */
export function pollTickMs(input: PollTickInput): number {
  const activeMs = input.activeMs ?? HOSTED_POLL_MS;
  const quietMs = input.quietMs ?? HOSTED_POLL_QUIET_MS;
  const windowMs = input.activeWindowMs ?? POLL_ACTIVE_WINDOW_MS;
  const lastOpAt = input.lastOpAt ?? 0;
  const inUse = lastOpAt > 0 && input.now - lastOpAt < windowMs;
  const company = input.others > 0;
  const unknown = input.rosterKnown === false;
  return inUse || company || unknown ? activeMs : Math.max(activeMs, quietMs);
}

export const PULSE_FILE = 'pulse.json';

/** What last moved the deck's pulse. */
export type PulseSource = 'deck' | 'presence' | 'comments';

/**
 * `decks/<id>/.turboslide/pulse.json`: under the deck's state folder, which the mirror never pulls
 * (blob-store.ts `isMirroredDocument` leaves `.turboslide/` out) and a deck removal deletes with
 * the prefix. Spelled here without blob-store.ts `deckPrefix` and file-store.ts `STATE_DIR`, whose
 * modules import `node:fs`; pulse.test.ts asserts the three agree.
 */
export function pulsePath(deckId: string): string {
  return `decks/${deckId}/.turboslide/${PULSE_FILE}`;
}

export type PulseWriteOptions = {
  /** the clock, ISO 8601; the wall clock by default */
  now?: () => string;
  /** the nonce; a random UUID by default */
  nonce?: () => string;
};

/** The pulse body: what moved, when, and a nonce so two writers never store one body. */
export function pulseBytes(source: PulseSource, at: string, nonce: string): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({ v: 1, source, at, nonce }));
}

/**
 * Overwrites the deck's pulse after a write landed. Best effort: a put that fails answers null and
 * the caller never fails its own write on it (the safety tick and the next write cover the gap);
 * the caller passes a bounded client, so the put ends at its deadline.
 */
export async function putPulse(
  client: BlobClient,
  deckId: string,
  source: PulseSource,
  options: PulseWriteOptions = {},
): Promise<BlobEntry | null> {
  const at = (options.now ?? (() => new Date().toISOString()))();
  const nonce = (options.nonce ?? (() => crypto.randomUUID()))();
  try {
    return await client.put(pulsePath(deckId), pulseBytes(source, at, nonce), {
      overwrite: true,
      contentType: 'application/json',
    });
  } catch {
    return null;
  }
}

/** The pulse's version (its etag), or null when the store holds none for the deck. */
export async function headPulse(client: BlobClient, deckId: string): Promise<string | null> {
  const entry = await client.head(pulsePath(deckId));
  return entry === null ? null : entry.version;
}

// ---------------------------------------------------------------------------------------------
// The store's refusals a caller backs off from

/**
 * A store error that means "not now", never "not there": the store's deadline
 * (`BlobTimeoutError`, blob-store.ts), the SDK's 429 (`BlobServiceRateLimited`, which carries
 * `retryAfter` in seconds), its 5xx (`BlobServiceNotAvailable`, `BlobUnknownError`) and a network
 * failure of the fetch underneath. The SDK's classes are anonymous (their `name` is `Error`), so
 * the messages are read (blob-vercel.ts reads them the same way for a missing blob). A caller
 * that meets one backs off and tells its listeners; a route answers 503 with `retry-after`, never
 * `not_found` (VERIFICATION C3-F2: the walk read a 429 as "The room answered 404").
 */
export function isStoreBusy(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === 'BlobTimeoutError') return true;
  if (typeof (error as { retryAfter?: unknown }).retryAfter === 'number') return true;
  // the SDK's `get` answering a status other than 200 and 404 ("Failed to fetch blob: 403
  // Forbidden", the public store's edge on a just written file of a fresh deck, VERIFICATION
  // C3S-F4): the blob is there by the manifest's word and the edge is not serving it yet, so
  // the answer is "not now" and a route says so instead of the framework's 500
  return /too many requests|currently not available|unknown error, please visit|failed to fetch blob|fetch failed|network|socket hang up|ECONNRESET|ETIMEDOUT|EAI_AGAIN/i.test(
    error.message,
  );
}

/** The wait the store asked for, in ms (the 429's `retry-after`); null when it named none. */
export function storeRetryAfterMs(error: unknown): number | null {
  if (!(error instanceof Error)) return null;
  const seconds = (error as { retryAfter?: unknown }).retryAfter;
  if (typeof seconds === 'number' && seconds > 0) return seconds * 1000;
  const named = /try again in (\d+) seconds/i.exec(error.message);
  return named === null ? null : Number(named[1]) * 1000;
}

/**
 * The wait before the next poll after `failures` refusals in a row: the tick doubled per
 * failure up to POLL_BACKOFF_MAX_MS, and never under what the store asked for.
 */
export function pollBackoffMs(
  failures: number,
  tickMs: number = HOSTED_POLL_MS,
  askedMs: number | null = null,
): number {
  const doubled = Math.min(POLL_BACKOFF_MAX_MS, tickMs * 2 ** Math.max(0, failures));
  return Math.min(POLL_BACKOFF_MAX_MS, Math.max(doubled, askedMs ?? 0));
}
