import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, test, vi } from 'vitest';

import type { StatementList } from '@turboslide/realtime/d1-statements';

import { fakeD1 } from './auth/d1-fake';
import type { FakeD1 } from './auth/d1-fake';
import { memoryAuthDb, openAuthDb } from './auth/db';
import type { AuthDb } from './auth/db';
import { REPORT_ROWS_PER_DAY, bindReportCounts, countReport, reportCounter } from './reports';

// The daily counts of hardening HR-O#2c (RELIABILITY-14) over a local D1: a database made by the
// Worker's migrations alone behind the D1 fake, which refuses what the Worker's allowlist
// (apps/realtime-worker/src/db-statements.json) does not hold, so a statement the list lacks
// fails here as it would on the Worker. Every value is a test value.

const BEARER = 'o2c-test-database-bearer-0000000000000000000000000000000000000000';
const MIGRATIONS = fileURLToPath(new URL('../../../realtime-worker/migrations/', import.meta.url));
const LIST = fileURLToPath(
  new URL('../../../realtime-worker/src/db-statements.json', import.meta.url),
);

const T = Date.parse('2026-10-12T21:00:00.000Z');
const DAY = 86_400_000;

function localD1(): { fake: FakeD1; db: AuthDb } {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith('.sql'))
    .sort())
    sqlite.exec(readFileSync(join(MIGRATIONS, file), 'utf8'));
  const allowed = new Set((JSON.parse(readFileSync(LIST, 'utf8')) as StatementList).statements);
  const fake = fakeD1(BEARER, sqlite, { allowed });
  const db = openAuthDb(
    { kind: 'd1', host: '127.0.0.1:8868', insecure: true, reason: 'test' },
    { TURBOSLIDE_DB_BEARER: BEARER },
    { fetch: fake.fetch },
  );
  return { fake, db };
}

function rows(fake: FakeD1, day: string) {
  return fake.sqlite
    .prepare('select kind, route, key, count from ts_reports where day = ? order by key')
    .all(day);
}

afterEach(() => {
  bindReportCounts(null);
  vi.restoreAllMocks();
});

describe('the report counts on D1 (HR-O#2c)', () => {
  test('two lines of one kind on one day read a count of 2, through statements the Worker allows', async () => {
    const { fake, db } = localD1();
    const counter = reportCounter(db);
    await counter.count({ kind: 'error', route: '/decks', key: 'TypeError: x is undefined' }, T);
    await counter.count({ kind: 'error', route: '/decks', key: 'TypeError: x is undefined' }, T);
    await counter.count({ kind: 'csp', route: '/deck/$', key: 'script-src inline' }, T);
    expect(rows(fake, '2026-10-12')).toEqual([
      { kind: 'error', route: '/decks', key: 'TypeError: x is undefined', count: 2 },
      { kind: 'csp', route: '/deck/$', key: 'script-src inline', count: 1 },
    ]);
    expect(fake.refused).toEqual([]);
    await db.close();
  });

  test('a day holds 500 rows: a new key past them is not stored, a known key still counts', async () => {
    const { fake, db } = localD1();
    const insert = fake.sqlite.prepare(
      'insert into ts_reports (day, kind, route, key, count) values (?, ?, ?, ?, 1)',
    );
    for (let i = 0; i < REPORT_ROWS_PER_DAY; i += 1)
      insert.run('2026-10-12', 'error', '/', `fault ${i}`);
    const counter = reportCounter(db);
    await counter.count({ kind: 'error', route: '/', key: 'a new fault' }, T);
    await counter.count({ kind: 'error', route: '/', key: 'fault 7' }, T);
    const count = (key: string) =>
      fake.sqlite
        .prepare('select count from ts_reports where day = ? and key = ?')
        .get('2026-10-12', key);
    expect(count('a new fault')).toBeUndefined();
    expect(count('fault 7')).toEqual({ count: 2 });
    // the next day starts empty
    await counter.count({ kind: 'error', route: '/', key: 'a new fault' }, T + DAY);
    expect(rows(fake, '2026-10-13')).toHaveLength(1);
    await db.close();
  });

  test('countReport prunes the days past 30 once a day per instance', async () => {
    const { fake, db } = localD1();
    fake.sqlite
      .prepare('insert into ts_reports (day, kind, route, key, count) values (?, ?, ?, ?, 4)')
      .run('2026-09-11', 'error', '/', 'old');
    fake.sqlite
      .prepare('insert into ts_reports (day, kind, route, key, count) values (?, ?, ?, ?, 4)')
      .run('2026-09-12', 'error', '/', 'kept');
    bindReportCounts(() => db);
    expect(await countReport({ kind: 'rejection', route: '/decks', key: 'x' }, T)).toBe(true);
    expect(fake.sqlite.prepare('select day from ts_reports order by day').all()).toEqual([
      { day: '2026-09-12' },
      { day: '2026-10-12' },
    ]);
    const deletes = () => fake.statements.filter((sql) => sql.startsWith('delete')).length;
    expect(deletes()).toBe(1);
    await countReport({ kind: 'rejection', route: '/decks', key: 'x' }, T + 60_000);
    expect(deletes()).toBe(1);
    expect(fake.refused).toEqual([]);
    await db.close();
  });

  test('a database that refuses is one log line and never a throw', async () => {
    const { fake, db } = localD1();
    fake.behaviour.refuse = { status: 503, error: 'unavailable' };
    bindReportCounts(() => db);
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await countReport({ kind: 'error', route: '/', key: 'x' }, T)).toBe(false);
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0]?.[0])).toContain('report.count.failed');
    await db.close();
  });

  test('a checkout’s SQLite makes the table on first use and counts the same way', async () => {
    const db = await memoryAuthDb();
    const counter = reportCounter(db);
    await counter.count({ kind: 'route', route: '/edit/$deckId', key: 'Error: boom' }, T);
    await counter.count({ kind: 'route', route: '/edit/$deckId', key: 'Error: boom' }, T);
    expect(db.sqlite!.prepare('select count from ts_reports').get()).toEqual({ count: 2 });
    await db.close();
  });
});
