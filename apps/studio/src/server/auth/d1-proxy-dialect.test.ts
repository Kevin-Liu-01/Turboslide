import { DatabaseSync } from 'node:sqlite';

import { Kysely, sql } from 'kysely';
import { afterEach, describe, expect, test } from 'vitest';

import { fakeD1 } from './d1-fake.ts';
import type { FakeD1 } from './d1-fake.ts';
import {
  D1ProxyClient,
  D1ProxyDialect,
  D1ProxyError,
  bindable,
  isD1ProxyError,
  roomOrigin,
  statementKind,
  toQueryResult,
} from './d1-proxy-dialect.ts';
import {
  AUTH_SCHEMA_VERSION,
  TURBOSLIDE_TABLES,
  markSchemaCurrent,
  migrateTurboslideTables,
  schemaIsCurrent,
} from './schema.ts';
import type { AuthDatabase } from './schema.ts';

// The D1 proxy dialect (docs/CLOUDFLARE.md 4.2, 4.3 "the proxy dialect's bindable mapping and
// statement kinds against a fake /db/query"): every row runs against d1-fake.ts, a D1 shaped
// fetch over node:sqlite, with no network and no Worker. The two values below are test values.

const BEARER = 'r4-test-room-bearer-0000000000000000000000000000000000000000';
const HOST = 'rooms.test.invalid';

const open: Kysely<AuthDatabase>[] = [];
afterEach(async () => {
  while (open.length > 0) await open.pop()?.destroy();
});

function over(
  fake: FakeD1,
  timeoutMs = 10_000,
): { db: Kysely<AuthDatabase>; dialect: D1ProxyDialect } {
  const dialect = new D1ProxyDialect({ host: HOST, bearer: BEARER, fetch: fake.fetch, timeoutMs });
  const db = new Kysely<AuthDatabase>({ dialect });
  open.push(db);
  return { db, dialect };
}

describe('the parameter mapping and the statement kinds', () => {
  test('bindable: booleans 0 and 1, dates ISO strings, undefined null, bigints numbers, objects JSON, blobs refused', () => {
    expect(bindable(true)).toBe(1);
    expect(bindable(false)).toBe(0);
    expect(bindable(new Date('2026-10-01T10:00:00.000Z'))).toBe('2026-10-01T10:00:00.000Z');
    expect(bindable(undefined)).toBeNull();
    expect(bindable(null)).toBeNull();
    expect(bindable('x')).toBe('x');
    expect(bindable(7)).toBe(7);
    expect(bindable(7n)).toBe(7);
    expect(bindable(2n ** 60n)).toBe((2n ** 60n).toString());
    expect(bindable({ a: 1 })).toBe('{"a":1}');
    expect(() => bindable(new Uint8Array([1]))).toThrow(TypeError);
  });

  test('statementKind reads the first word, a leading common table expression included', () => {
    expect(statementKind('select 1')).toBe('read');
    expect(statementKind('  SELECT * from "user"')).toBe('read');
    expect(statementKind('with t as (select 1) select * from t')).toBe('read');
    expect(statementKind('pragma table_info(x)')).toBe('read');
    expect(statementKind('insert into t values (1)')).toBe('write');
    expect(statementKind('update t set a = 1')).toBe('write');
    expect(statementKind('delete from t')).toBe('write');
    expect(statementKind('create table if not exists t (a)')).toBe('schema');
    expect(statementKind('alter table t add column b')).toBe('schema');
    expect(statementKind('drop table t')).toBe('schema');
    expect(statementKind('begin')).toBe('other');
  });

  test('roomOrigin is https, or http when the checkout says insecure, and refuses an empty host', () => {
    expect(roomOrigin('turboslide-realtime.kk23907751.workers.dev')).toBe(
      'https://turboslide-realtime.kk23907751.workers.dev',
    );
    expect(roomOrigin('127.0.0.1:8794', true)).toBe('http://127.0.0.1:8794');
    expect(roomOrigin('https://a.b/', false)).toBe('https://a.b');
    expect(() => roomOrigin('  ')).toThrow(TypeError);
  });

  test('toQueryResult maps results, changes and last_row_id; a zero last_row_id is no insert id', () => {
    expect(toQueryResult({ results: [{ a: 1 }], meta: { changes: 0, last_row_id: 0 } })).toEqual({
      rows: [{ a: 1 }],
      numAffectedRows: 0n,
    });
    expect(toQueryResult({ results: null, meta: { changes: 1, last_row_id: 42 } })).toEqual({
      rows: [],
      numAffectedRows: 1n,
      insertId: 42n,
    });
    expect(toQueryResult({})).toEqual({ rows: [] });
  });
});

describe('the dialect over a fake /db/query', () => {
  test('migrates the Turboslide tables through the proxy, then reads, writes, returns and counts', async () => {
    const fake = fakeD1(BEARER);
    const { db, dialect } = over(fake);
    await migrateTurboslideTables(db);
    const tables = (
      fake.sqlite.prepare("select name from sqlite_master where type = 'table'").all() as {
        name: string;
      }[]
    ).map((row) => row.name);
    for (const name of TURBOSLIDE_TABLES) expect(tables).toContain(name);
    const inserted = await db
      .insertInto('ts_quota')
      .values({ key: 'k', count: 1, resetAt: '2026-01-01T00:00:00.000Z' })
      .returning('key')
      .executeTakeFirst();
    expect(inserted).toEqual({ key: 'k' });
    const updated = await db
      .updateTable('ts_quota')
      .set({ count: 2 })
      .where('key', '=', 'k')
      .executeTakeFirst();
    expect(Number(updated.numUpdatedRows)).toBe(1);
    const raw = await sql<{ n: number }>`select count(*) as n from ts_quota`.execute(db);
    expect(Number(raw.rows[0]?.n)).toBe(1);
    /* booleans and dates reach the fake as 1 and an ISO string: a user row the library's shape */
    await sql`create table if not exists probe (flag integer, at text, id integer primary key autoincrement)`.execute(
      db,
    );
    const made =
      await sql`insert into probe (flag, at) values (${true}, ${new Date('2026-10-01T00:00:00.000Z')})`.execute(
        db,
      );
    expect(made.insertId).toBe(1n);
    expect(fake.sqlite.prepare('select flag, at from probe').all()).toEqual([
      { flag: 1, at: '2026-10-01T00:00:00.000Z' },
    ]);
    const counters = dialect.client.counters();
    expect(counters.calls).toBe(fake.calls.query + fake.calls.batch);
    expect(counters.statements).toBe(fake.statements.length);
    /* the count is the one read; the insert with its returning clause counts as a write */
    expect(counters.reads).toBeGreaterThanOrEqual(1);
    expect(counters.writes).toBeGreaterThanOrEqual(3);
    expect(counters.schema).toBeGreaterThanOrEqual(TURBOSLIDE_TABLES.length);
    expect(counters.rowsWritten).toBeGreaterThanOrEqual(3);
    expect(counters.failures).toBe(0);
    /* every statement went as one POST with the bearer and no parameter in the URL */
    expect(fake.calls.unauthorized).toBe(0);
  });

  test('the introspector lists the tables and their columns in one statement and one batch', async () => {
    const fake = fakeD1(BEARER);
    const { db } = over(fake);
    await migrateTurboslideTables(db);
    fake.reset();
    const tables = await db.introspection.getTables();
    expect(tables.map((t) => t.name)).toEqual([...TURBOSLIDE_TABLES].sort());
    const quota = tables.find((t) => t.name === 'ts_quota');
    /* the declared types as SQLite reports them; a text primary key is nullable in SQLite's eyes */
    expect(
      quota?.columns.map((c) => [
        c.name,
        c.dataType.toLowerCase(),
        c.isNullable,
        c.hasDefaultValue,
      ]),
    ).toEqual([
      ['key', 'text', true, false],
      ['count', 'integer', false, true],
      ['resetAt', 'text', false, false],
    ]);
    expect(fake.calls).toEqual({ query: 1, batch: 1, unauthorized: 0 });
    expect(fake.statements.filter((s) => s.includes('pragma_table_info'))).toHaveLength(
      TURBOSLIDE_TABLES.length,
    );
  });

  test('transactions are refused, since D1 has none and nothing in the folder opens one', async () => {
    const fake = fakeD1(BEARER);
    const { db } = over(fake);
    await migrateTurboslideTables(db);
    await expect(
      db.transaction().execute(async (trx) => {
        await trx
          .insertInto('ts_quota')
          .values({ key: 'rolled', count: 1, resetAt: 'x' })
          .execute();
      }),
    ).rejects.toThrow(/interactive transactions/);
    expect(fake.sqlite.prepare('select count(*) as n from ts_quota').get()).toEqual({ n: 0 });
  });

  test('the schema version row: absent reads not current, written reads current, another version not', async () => {
    const fake = fakeD1(BEARER);
    const { db } = over(fake);
    expect(await schemaIsCurrent(db)).toBe(false);
    await migrateTurboslideTables(db);
    expect(await schemaIsCurrent(db)).toBe(false);
    await markSchemaCurrent(db);
    expect(await schemaIsCurrent(db)).toBe(true);
    fake.sqlite.prepare("update ts_schema set v = 'older' where k = 'turboslide'").run();
    expect(await schemaIsCurrent(db)).toBe(false);
    await markSchemaCurrent(db);
    expect(fake.sqlite.prepare('select v from ts_schema').all()).toEqual([
      { v: AUTH_SCHEMA_VERSION },
    ]);
  });
});

describe('the store error (CLOUDFLARE.md 4.3, 3.8)', () => {
  test('a refusal is a D1ProxyError with the status and the sentence, never a parameter', async () => {
    const fake = fakeD1(BEARER);
    const { db, dialect } = over(fake);
    await migrateTurboslideTables(db);
    fake.behaviour.refuse = { status: 503, error: 'the database is over its daily rows' };
    const error = await db
      .selectFrom('ts_quota')
      .select('key')
      .where('key', '=', 'secret-parameter-value')
      .executeTakeFirst()
      .catch((e: unknown) => e);
    expect(isD1ProxyError(error)).toBe(true);
    const proxy = error as D1ProxyError;
    expect(proxy.kind).toBe('refused');
    expect(proxy.status).toBe(503);
    expect(proxy.message).toContain('503');
    expect(proxy.message).toContain('over its daily rows');
    expect(proxy.message).not.toContain('secret-parameter-value');
    expect(dialect.client.counters().failures).toBe(1);
  });

  test('a wrong bearer is refused with 401 and a timed out call is a timeout error inside the deadline', async () => {
    const fake = fakeD1(BEARER);
    const wrong = new Kysely<AuthDatabase>({
      dialect: new D1ProxyDialect({ host: HOST, bearer: 'not-the-bearer', fetch: fake.fetch }),
    });
    open.push(wrong);
    const refused = await sql`select 1`.execute(wrong).catch((e: unknown) => e);
    expect((refused as D1ProxyError).status).toBe(401);
    expect(fake.calls.unauthorized).toBe(1);
    const { db } = over(fake, 150);
    fake.behaviour.hang = true;
    const t = Date.now();
    const timedOut = await sql`select 1`.execute(db).catch((e: unknown) => e);
    expect(isD1ProxyError(timedOut)).toBe(true);
    expect((timedOut as D1ProxyError).kind).toBe('timeout');
    expect(Date.now() - t).toBeLessThan(5_000);
  });

  test('a network failure and a malformed answer are store errors too', async () => {
    const dead = new D1ProxyClient({
      host: HOST,
      bearer: BEARER,
      fetch: () => Promise.reject(new TypeError('fetch failed')),
    });
    const network = await dead.query('select 1', []).catch((e: unknown) => e);
    expect((network as D1ProxyError).kind).toBe('network');
    const fake = fakeD1(BEARER);
    fake.behaviour.malformed = true;
    const client = new D1ProxyClient({ host: HOST, bearer: BEARER, fetch: fake.fetch });
    const malformed = await client
      .batch([{ sql: 'select 1', params: [] }])
      .catch((e: unknown) => e);
    expect((malformed as D1ProxyError).kind).toBe('malformed');
  });

  test('the client refuses an empty bearer at construction', () => {
    expect(() => new D1ProxyClient({ host: HOST, bearer: '' })).toThrow(TypeError);
  });
});

describe('the fake itself', () => {
  test('answers the contract: results and meta for a read, changes and last_row_id for a write', async () => {
    const fake = fakeD1(BEARER, new DatabaseSync(':memory:'));
    const client = new D1ProxyClient({ host: HOST, bearer: BEARER, fetch: fake.fetch });
    await client.query('create table t (id integer primary key autoincrement, a text)', []);
    const write = await client.query('insert into t (a) values (?)', ['x']);
    expect(write.meta).toMatchObject({ changes: 1, last_row_id: 1, rows_written: 1 });
    const read = await client.query('select a from t where a = ?', ['x']);
    expect(read.results).toEqual([{ a: 'x' }]);
    expect(read.meta).toMatchObject({ rows_read: 1 });
    const batch = await client.batch([
      { sql: 'insert into t (a) values (?)', params: ['y'] },
      { sql: 'select count(*) as n from t', params: [] },
    ]);
    expect(batch[1]?.results).toEqual([{ n: 2 }]);
  });
});
