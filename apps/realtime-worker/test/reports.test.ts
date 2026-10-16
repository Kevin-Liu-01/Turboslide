import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import list from '../src/db-statements.json';
import worker from '../src/index.ts';

// HR-O#2c (RELIABILITY-14): the two report count statements, as the studio sends them
// (apps/studio/src/server/reports.ts, recorded in db-statements.json), run on D1 through
// `/db/query` against the table migration 0006 makes. Two lines of one kind on one day read a
// count of 2; a known row still counts once the day holds its 500 rows. Every value here is a
// test value.

const DB = env.TURBOSLIDE_DB_BEARER;

function listed(prefix: string): string {
  const sql = list.statements.find((statement) => statement.startsWith(prefix));
  if (sql === undefined) throw new Error(`no listed statement starts with ${prefix}`);
  return sql;
}

const COUNT = listed('insert into "ts_reports"');
const PRUNE = listed('delete from "ts_reports"');

async function query(sql: string, params: unknown[]): Promise<number> {
  const response = await worker.fetch(
    new Request('https://rooms.test/db/query', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${DB}` },
      body: JSON.stringify({ sql, params }),
    }),
    env,
  );
  return response.status;
}

/** One count, in the parameter order of reports.ts: the row, the day's cap, the row again. */
function count(day: string, kind: string, route: string, key: string, cap = 500) {
  return query(COUNT, [day, kind, route, key, day, cap, day, kind, route, key]);
}

async function rowsOf(day: string) {
  return (
    await env.ACCOUNTS.prepare(
      'SELECT kind, route, key, count FROM ts_reports WHERE day = ? ORDER BY key',
    )
      .bind(day)
      .all()
  ).results;
}

describe('the report counts on D1 (HR-O#2c)', () => {
  it('two lines of one kind on one day read a count of 2', async () => {
    expect(await count('2026-10-12', 'error', '/decks', 'TypeError: x')).toBe(200);
    expect(await count('2026-10-12', 'error', '/decks', 'TypeError: x')).toBe(200);
    expect(await count('2026-10-12', 'csp', '/deck/$', 'script-src inline')).toBe(200);
    expect(await rowsOf('2026-10-12')).toEqual([
      { kind: 'error', route: '/decks', key: 'TypeError: x', count: 2 },
      { kind: 'csp', route: '/deck/$', key: 'script-src inline', count: 1 },
    ]);
  });

  it('a full day keeps counting its known rows and takes no new one; the prune removes old days', async () => {
    expect(await count('2026-10-11', 'error', '/', 'known', 1)).toBe(200);
    expect(await count('2026-10-11', 'error', '/', 'new', 1)).toBe(200);
    expect(await count('2026-10-11', 'error', '/', 'known', 1)).toBe(200);
    expect(await rowsOf('2026-10-11')).toEqual([
      { kind: 'error', route: '/', key: 'known', count: 2 },
    ]);
    expect(await query(PRUNE, ['2026-10-12'])).toBe(200);
    expect(await rowsOf('2026-10-11')).toEqual([]);
  });
});
