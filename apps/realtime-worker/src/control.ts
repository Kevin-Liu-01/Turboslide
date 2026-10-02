// The control tables and the Worker's own counters (docs/CLOUDFLARE.md 3.6.2 `src/control.ts`):
// `rt_flags` holds the runtime switches, `realtime` among them, read by the router every 30 s per
// isolate (3.8 item 1: `off` refuses upgrades with 4503 and stamps the forwarded requests so an
// awake object flushes and closes); `rt_open` is a row per deck with sockets or uncommitted
// entries, written by the object at its first socket's open and deleted at the last close's
// commit, listed by `GET /control/open` for the drain. Both tables are made by
// migrations/0001_control.sql and never here; a missing table reads as `unset`. The counters are
// per isolate (the dashboard stays the account's figure of record; build/r1.md R1-R5d).

export type RealtimeFlag = 'on' | 'off' | 'unset';

/** How long the router trusts the flag it read (3.6.2: "30 s cache per isolate"). */
export const FLAG_CACHE_MS = 30_000;

const flagCache: { at: number; value: RealtimeFlag } = { at: -Infinity, value: 'unset' };

/** The `realtime` row of `rt_flags`, cached; `unset` when the table or the row is missing. */
export async function realtimeFlag(db: D1Database, now = Date.now()): Promise<RealtimeFlag> {
  if (now - flagCache.at < FLAG_CACHE_MS) return flagCache.value;
  let value: RealtimeFlag = 'unset';
  try {
    const row = await db
      .prepare('SELECT v FROM rt_flags WHERE k = ?')
      .bind('realtime')
      .first<{ v: string }>();
    if (row?.v === 'on') value = 'on';
    else if (row?.v === 'off') value = 'off';
  } catch {
    value = 'unset';
  }
  flagCache.at = now;
  flagCache.value = value;
  return value;
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
