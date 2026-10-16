import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import list from '../src/db-statements.json';
import worker from '../src/index.ts';

// HR-SA#3 (AUTH-8): the one limiter's statements, as the studio sends them
// (apps/studio/src/server/auth/limits.ts, recorded in db-statements.json), run on D1 through
// `/db/query` against the table migration 0005 makes. The take is one upsert: it answers its row
// when it counted and no row when the sum would pass the limit, so two instances share one count
// with no read before the write. Every value here is a test value.

const DB = env.TURBOSLIDE_DB_BEARER;

function listed(prefix: string): string {
  const sql = list.statements.find((statement) => statement.startsWith(prefix));
  if (sql === undefined) throw new Error(`no listed statement starts with ${prefix}`);
  return sql;
}

/** The take with its folded lists written out, as Kysely compiles it for the three columns. */
const TAKE = listed('insert into "ts_limits"').replace(
  '({columns}) values ({values})',
  '("key", "count", "reset_at") values (?, ?, ?)',
);
const READ = listed('select "count", "reset_at" from "ts_limits"');
const RELEASE = listed('update "ts_limits"');
const PRUNE = listed('delete from "ts_limits"');

async function query(sql: string, params: unknown[]): Promise<{ status: number; rows: unknown[] }> {
  const response = await worker.fetch(
    new Request('https://rooms.test/db/query', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${DB}` },
      body: JSON.stringify({ sql, params }),
    }),
    env,
  );
  const body = (await response.json()) as { results?: unknown[] };
  return { status: response.status, rows: body.results ?? [] };
}

/** One take of `cost` against `limit` in a window of `windowMs`, at `now`. */
function take(key: string, cost: number, limit: number, windowMs: number, now: number) {
  return query(TAKE, [key, cost, now + windowMs, now, now, now, limit]);
}

describe('the one limiter on D1 (HR-SA#3)', () => {
  it('counts up to the limit, answers no row past it, and starts a new window once the old one ended', async () => {
    const key = `k-${crypto.randomUUID()}`;
    const t = 1_700_000_000_000;
    expect(await take(key, 1, 2, 60_000, t)).toEqual({
      status: 200,
      rows: [{ count: 1, reset_at: t + 60_000 }],
    });
    expect((await take(key, 1, 2, 60_000, t + 1)).rows).toEqual([
      { count: 2, reset_at: t + 60_000 },
    ]);
    // past the limit: the statement runs and writes nothing, so the answer has no row
    expect(await take(key, 1, 2, 60_000, t + 2)).toEqual({ status: 200, rows: [] });
    expect((await query(READ, [key])).rows).toEqual([{ count: 2, reset_at: t + 60_000 }]);
    // the window ended: a new one starts at the cost
    expect((await take(key, 1, 2, 60_000, t + 60_000)).rows).toEqual([
      { count: 1, reset_at: t + 120_000 },
    ]);
  });

  it('a release gives a slot back and never goes below zero; the prune deletes ended windows', async () => {
    const key = `slot-${crypto.randomUUID()}`;
    const t = 1_700_000_000_000;
    await take(key, 1, 1, 3_600_000, t);
    expect((await take(key, 1, 1, 3_600_000, t + 1)).rows).toEqual([]);
    expect((await query(RELEASE, [1, 1, key])).status).toBe(200);
    expect((await query(RELEASE, [1, 1, key])).status).toBe(200);
    expect((await query(READ, [key])).rows).toEqual([{ count: 0, reset_at: t + 3_600_000 }]);
    expect((await take(key, 1, 1, 3_600_000, t + 2)).rows).toEqual([
      { count: 1, reset_at: t + 3_600_000 },
    ]);
    expect((await query(PRUNE, [t + 3_600_001])).status).toBe(200);
    expect((await query(READ, [key])).rows).toEqual([]);
  });
});
