// The control tables and the Worker's own counters (docs/CLOUDFLARE.md 3.6.2 `src/control.ts`):
// `rt_flags` holds the runtime switches, `realtime` among them, read by the router every 30 s per
// isolate (3.8 item 1: `off` refuses upgrades with 4503 and stamps the forwarded requests so an
// awake object flushes and closes); `rt_open` is a row per deck with sockets or uncommitted
// entries, written by the object at its first socket's open and deleted at the last close's
// commit, listed by `GET /control/open` for the drain. Both tables are made by
// migrations/0001_control.sql and never here; a missing table reads as `unset`. The counters are
// per isolate (the dashboard stays the account's figure of record; build/r1.md R1-R5d).

export type RealtimeFlag = 'on' | 'off' | 'unset';

/**
 * Whether the deck objects reach the app (3.8; VERIFICATION.md realtime pass 1 finding 7): an
 * object whose seed or checkpoint calls fail for the deployment's reason (no answer, a redirect,
 * 401, 403, a seed route's 5xx; deck-room.ts `AppCallError.reach`) twice in a row writes `rt_flags.callbacks` as `failing:<ms>:<status>`, and one
 * whose call answers after that writes `ok:<ms>`. `/health` reads `failing` while the stamp is
 * younger than CALLBACKS_FAILING_TTL_MS, and the function's flag reads off then, so its
 * instance hands the tabs to the blob tier as for an unreachable Worker (3.8 item 4); the stamp
 * running out lets the instance try the Worker again.
 */
export type CallbacksState = 'ok' | 'failing';

/** How long the router trusts the flag it read (3.6.2: "30 s cache per isolate"). */
export const FLAG_CACHE_MS = 30_000;
/** How long a `failing` stamp of the callbacks row holds without a new one. */
export const CALLBACKS_FAILING_TTL_MS = 120_000;

const flagCache: { at: number; value: RealtimeFlag; callbacks: string | null } = {
  at: -Infinity,
  value: 'unset',
  callbacks: null,
};

async function readControlRows(db: D1Database, now: number): Promise<void> {
  if (now - flagCache.at < FLAG_CACHE_MS) return;
  let value: RealtimeFlag = 'unset';
  let callbacks: string | null = null;
  try {
    const result = await db
      .prepare("SELECT k, v FROM rt_flags WHERE k IN ('realtime', 'callbacks')")
      .all<{ k: string; v: string }>();
    for (const row of result.results) {
      if (row.k === 'realtime') value = row.v === 'on' ? 'on' : row.v === 'off' ? 'off' : 'unset';
      else if (row.k === 'callbacks') callbacks = row.v;
    }
  } catch {
    value = 'unset';
  }
  flagCache.at = now;
  flagCache.value = value;
  flagCache.callbacks = callbacks;
}

/** The `realtime` row of `rt_flags`, cached; `unset` when the table or the row is missing. */
export async function realtimeFlag(db: D1Database, now = Date.now()): Promise<RealtimeFlag> {
  await readControlRows(db, now);
  return flagCache.value;
}

/** The callbacks state as `/health` answers it: `failing` while a failing stamp is younger than its TTL. */
export function callbacksStateOf(value: string | null, now: number): CallbacksState {
  if (value === null) return 'ok';
  const [word, at] = value.split(':');
  if (word !== 'failing') return 'ok';
  const stamp = Number(at);
  return Number.isFinite(stamp) && now - stamp < CALLBACKS_FAILING_TTL_MS ? 'failing' : 'ok';
}

/** Whether the deck objects reach the app, cached with the realtime flag. */
export async function callbacksState(db: D1Database, now = Date.now()): Promise<CallbacksState> {
  await readControlRows(db, now);
  return callbacksStateOf(flagCache.callbacks, now);
}

/** The object's word on its app calls (`failing` with the status that failed, or `ok`); one upsert. */
export async function noteCallbacks(
  db: D1Database,
  state: CallbacksState,
  now: number,
  status?: number,
): Promise<void> {
  const value = state === 'failing' ? `failing:${now}:${status ?? 0}` : `ok:${now}`;
  await db
    .prepare(
      'INSERT INTO rt_flags (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v',
    )
    .bind('callbacks', value)
    .run();
  dropFlagCache();
}

/** The `rt_flags` row of the admission's disagreements (HR-RT#5a), a count kept as text. */
export const ADMISSION_DISAGREE_FLAG = 'admission.disagree';

/** Adds `count` to the disagreements of `shadow` (deck-room.ts `noteDisagreements`); one upsert. */
export async function noteAdmissionDisagreements(db: D1Database, count: number): Promise<void> {
  await db
    .prepare(
      'INSERT INTO rt_flags (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = CAST(CAST(v AS INTEGER) + ? AS TEXT)',
    )
    .bind(ADMISSION_DISAGREE_FLAG, String(count), count)
    .run();
}

/** The disagreements of `shadow` so far, as `/health` answers them; 0 without the row or the table. */
export async function admissionDisagreements(db: D1Database): Promise<number> {
  try {
    const row = await db
      .prepare('SELECT v FROM rt_flags WHERE k = ?')
      .bind(ADMISSION_DISAGREE_FLAG)
      .first<{ v: string }>();
    const count = Number(row?.v ?? 0);
    return Number.isInteger(count) && count >= 0 ? count : 0;
  } catch {
    return 0;
  }
}

/** Forgets the cached flag (a `POST /control/flags` on this isolate; the tests). */
export function dropFlagCache(): void {
  flagCache.at = -Infinity;
}

/** Every row of `rt_flags`, or null when the table is missing. */
export async function readFlags(db: D1Database): Promise<Record<string, string> | null> {
  try {
    const result = await db
      .prepare('SELECT k, v FROM rt_flags ORDER BY k')
      .all<{ k: string; v: string }>();
    const out: Record<string, string> = {};
    for (const row of result.results) out[row.k] = row.v;
    return out;
  } catch {
    return null;
  }
}

const FLAG_KEY = /^[a-z][A-Za-z0-9]{0,31}$/;
const FLAG_VALUE = /^[A-Za-z0-9_.:-]{1,64}$/;

/** Upserts the given flags; a key or a value outside the grammar is refused with a TypeError. */
export async function writeFlags(db: D1Database, flags: Record<string, string>): Promise<void> {
  const statements: D1PreparedStatement[] = [];
  for (const [key, value] of Object.entries(flags)) {
    if (!FLAG_KEY.test(key)) throw new TypeError(`${JSON.stringify(key)} is not a flag name`);
    if (!FLAG_VALUE.test(value))
      throw new TypeError(`${JSON.stringify(value)} is not a flag value`);
    statements.push(
      db
        .prepare(
          'INSERT INTO rt_flags (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v',
        )
        .bind(key, value),
    );
  }
  if (statements.length > 0) await db.batch(statements);
  dropFlagCache();
}

/** The object notes its first socket (an `rt_open` row); a missing table is logged by the caller and not an error. */
export async function noteOpen(db: D1Database, deckId: string, now: number): Promise<void> {
  await db
    .prepare('INSERT OR REPLACE INTO rt_open (deck_id, opened_at) VALUES (?, ?)')
    .bind(deckId, now)
    .run();
}

/** The object's last socket closed and its tail is committed: the row goes. */
export async function noteClosed(db: D1Database, deckId: string): Promise<void> {
  await db.prepare('DELETE FROM rt_open WHERE deck_id = ?').bind(deckId).run();
}

/** The decks with sockets or uncommitted entries (`GET /control/open`), oldest open first. */
export async function openDecks(
  db: D1Database,
): Promise<{ deckId: string; openedAt: number }[] | null> {
  try {
    const result = await db
      .prepare('SELECT deck_id, opened_at FROM rt_open ORDER BY opened_at')
      .all<{ deck_id: string; opened_at: number }>();
    return result.results.map((row) => ({ deckId: row.deck_id, openedAt: row.opened_at }));
  } catch {
    return null;
  }
}

/** The tail of one open deck as its object answers it (deck-room.ts `openState`; HR-RT#6c). */
export type OpenDeck = {
  deckId: string;
  openedAt: number;
  head: number;
  covered: number;
  /** how long the oldest uncommitted entry has waited; 0 with nothing uncommitted */
  ageMs: number;
  sockets: number;
};

/** One object's own route as the router calls it (index.ts `objectsOf`): the answer's JSON. */
export type ObjectCall = (
  deckId: string,
  tail: string,
  method: 'GET' | 'POST',
) => Promise<Record<string, unknown>>;

/** How many objects one sweep or one `/control/open` reads at once. */
const OPEN_DECKS_AT_ONCE = 8;
/** How many open decks one sweep reaches at most (HR-RT#6c). */
export const SWEEP_DECKS_MAX = 500;

/** Calls `run` over `rows`, OPEN_DECKS_AT_ONCE at a time, in order. */
async function inChunks<T, R>(rows: readonly T[], run: (row: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let at = 0; at < rows.length; at += OPEN_DECKS_AT_ONCE)
    out.push(...(await Promise.all(rows.slice(at, at + OPEN_DECKS_AT_ONCE).map(run))));
  return out;
}

const numberOf = (value: unknown): number => (typeof value === 'number' ? value : 0);

/**
 * The open list with each deck's tail (HR-RT#6c): `GET /control/open` answers the head, the
 * covered seq and the age of the oldest uncommitted entry of every object `rt_open` names, so
 * the drain and an external check read which decks hold uncommitted work and for how long.
 */
export async function openStates(
  decks: readonly { deckId: string; openedAt: number }[],
  call: ObjectCall,
): Promise<OpenDeck[]> {
  return inChunks(decks, async (row) => {
    try {
      const state = await call(row.deckId, 'open-state', 'GET');
      return {
        ...row,
        head: numberOf(state['head']),
        covered: numberOf(state['covered']),
        ageMs: numberOf(state['ageMs']),
        sockets: numberOf(state['sockets']),
      };
    } catch {
      return { ...row, head: 0, covered: 0, ageMs: 0, sockets: 0 };
    }
  });
}

/**
 * The sweep (RELIABILITY-8, hardening HR-RT#6c; `triggers.crons` every five minutes in
 * wrangler.jsonc, index.ts `scheduled`): every object `rt_open` names is poked, and one whose
 * oldest uncommitted entry waited more than two minutes checkpoints at once (deck-room.ts
 * `httpSweep`), so a tail never depends on the object's alarm alone; an object with nothing to
 * do lets a stale row go.
 */
export async function sweepOpenDecks(
  db: D1Database,
  call: ObjectCall,
): Promise<{ swept: number; poked: number; failed: number }> {
  const decks = (await openDecks(db)) ?? [];
  let poked = 0;
  let failed = 0;
  await inChunks(decks.slice(0, SWEEP_DECKS_MAX), async (row) => {
    try {
      const answer = await call(row.deckId, 'sweep', 'POST');
      if (answer['poked'] === true) poked += 1;
    } catch (error) {
      failed += 1;
      console.error(
        JSON.stringify({
          level: 'error',
          message: 'the sweep did not reach the object',
          deck: row.deckId,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  });
  const swept = Math.min(decks.length, SWEEP_DECKS_MAX);
  if (poked > 0 || failed > 0 || decks.length > SWEEP_DECKS_MAX)
    console.log(
      JSON.stringify({ level: 'info', message: 'sweep', open: decks.length, swept, poked, failed }),
    );
  return { swept, poked, failed };
}

/** The router's request counts by class since this isolate started (`cost.worker.requests`). */
export const workerCounters = {
  startedAt: Date.now(),
  upgrades: 0,
  upgradesRefused: 0,
  ticketPosts: 0,
  bearerCalls: 0,
  dbCalls: 0,
  controlCalls: 0,
  health: 0,
  options: 0,
  other: 0,
};
