import { env } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';

import { ROOM_PROTOCOL } from '@turboslide/realtime/frames';

import list from '../src/db-statements.json';
import { UNLISTED_ROWS_MAX, countUnlisted, statementDigest } from '../src/db.ts';
import worker from '../src/index.ts';
import { mint } from './lib.ts';

// AUTH-3: the accounts database routes take their own bearer and run only the statements of the
// allowlist. The router is called with an env of the test's own (the bindings plus the values a
// case needs: a Worker before the database bearer, a rotation in flight, the report mode), so each
// case reads the rule it names. Every value here is a test value.

type Overrides = Partial<Record<keyof Env, string>>;

const ROOM = env.TURBOSLIDE_ROOM_BEARER;
const DB = env.TURBOSLIDE_DB_BEARER;

function call(
  path: string,
  init: { method?: string; bearer?: string; body?: unknown; authorization?: string } = {},
  overrides: Overrides = {},
): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (init.authorization !== undefined) headers.authorization = init.authorization;
  else if (init.bearer !== undefined) headers.authorization = `Bearer ${init.bearer}`;
  return worker.fetch(
    new Request(`https://rooms.test${path}`, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      headers,
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    }),
    { ...env, ...overrides } as Env,
  );
}

const VERSION_READ = { sql: 'select "v" from "ts_schema" where "k" = ?', params: ['turboslide'] };

async function health(overrides: Overrides = {}): Promise<{ db: string; statements: string }> {
  return (await (await call('/health', {}, overrides)).json()) as {
    db: string;
    statements: string;
  };
}

describe('the database bearer (AUTH-3)', () => {
  it('opens /db alone: the room bearer is refused there, and the database bearer opens no room or control route', async () => {
    expect((await call('/db/query', { bearer: DB, body: VERSION_READ })).status).toBe(200);
    expect(
      (await call('/db/batch', { bearer: DB, body: { statements: [VERSION_READ] } })).status,
    ).toBe(200);
    expect((await call('/db/query', { bearer: ROOM, body: VERSION_READ })).status).toBe(401);
    expect(
      (await call('/db/batch', { bearer: ROOM, body: { statements: [VERSION_READ] } })).status,
    ).toBe(401);
    expect((await call('/db/query', { body: VERSION_READ })).status).toBe(401);
    for (const path of ['/control/flags', '/control/open', '/rooms/gt-brand/roster'])
      expect((await call(path, { bearer: DB })).status, path).toBe(401);
    // the counters read no database: either bearer
    expect((await call('/db/counters', { bearer: ROOM })).status).toBe(200);
    expect((await call('/db/counters', { bearer: DB })).status).toBe(200);
    expect((await health()).db).toBe('own');
  });

  it('a Worker without the database bearer takes the room bearer on /db, and /health says fallback', async () => {
    const before = { TURBOSLIDE_DB_BEARER: '' };
    expect((await call('/db/query', { bearer: ROOM, body: VERSION_READ }, before)).status).toBe(
      200,
    );
    expect((await call('/db/query', { bearer: DB, body: VERSION_READ }, before)).status).toBe(401);
    expect((await health(before)).db).toBe('fallback');
  });

  it('during a rotation the previous database bearer opens /db until it is deleted; the room bearer never does', async () => {
    const rotating = {
      TURBOSLIDE_DB_BEARER: 'test-db-bearer-next-000000000000000000000000000000000000000000',
      TURBOSLIDE_DB_BEARER_PREVIOUS: DB,
    };
    expect((await call('/db/query', { bearer: DB, body: VERSION_READ }, rotating)).status).toBe(
      200,
    );
    expect(
      (
        await call(
          '/db/query',
          { bearer: rotating.TURBOSLIDE_DB_BEARER, body: VERSION_READ },
          rotating,
        )
      ).status,
    ).toBe(200);
    expect((await call('/db/query', { bearer: ROOM, body: VERSION_READ }, rotating)).status).toBe(
      401,
    );
    expect((await health(rotating)).db).toBe('rotating');
    const done = { TURBOSLIDE_DB_BEARER: rotating.TURBOSLIDE_DB_BEARER };
    expect((await call('/db/query', { bearer: DB, body: VERSION_READ }, done)).status).toBe(401);
  });

  it('during a rotation the previous room bearer opens the room and control routes, and only those', async () => {
    const rotating = {
      TURBOSLIDE_ROOM_BEARER: 'test-room-bearer-next-0000000000000000000000000000000000000000',
      TURBOSLIDE_ROOM_BEARER_PREVIOUS: ROOM,
    };
    expect((await call('/control/flags', { bearer: ROOM }, rotating)).status).toBe(200);
    expect(
      (await call('/control/flags', { bearer: rotating.TURBOSLIDE_ROOM_BEARER }, rotating)).status,
    ).toBe(200);
    expect((await call('/control/flags', { bearer: 'something-else' }, rotating)).status).toBe(401);
    expect((await call('/db/query', { bearer: ROOM, body: VERSION_READ }, rotating)).status).toBe(
      401,
    );
  });

  it('during a rotation a ticket signed with the previous room secret still verifies', async () => {
    const previous = env.TURBOSLIDE_ROOM_SECRET;
    const next = 'test-room-secret-next-0000000000000000000000000000000000000000';
    const ticket = await mint({ deck: 'gt-brand', cid: 'd'.repeat(32), v: ROOM_PROTOCOL });
    const ops = (overrides: Overrides): Promise<Response> =>
      worker.fetch(
        new Request('https://rooms.test/rooms/gt-brand/ops', {
          method: 'POST',
          headers: {
            authorization: `Ticket ${ticket}`,
            origin: env.TURBOSLIDE_APP_ORIGIN,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ ops: [] }),
        }),
        { ...env, ...overrides } as Env,
      );
    expect((await ops({ TURBOSLIDE_ROOM_SECRET: next })).status).toBe(401);
    expect(
      (await ops({ TURBOSLIDE_ROOM_SECRET: next, TURBOSLIDE_ROOM_SECRET_PREVIOUS: previous }))
        .status,
    ).not.toBe(401);
  });
});

describe('the statement allowlist (AUTH-3)', () => {
  const seed = async (): Promise<string> => {
    const token = `tok-${crypto.randomUUID()}`;
    const user = `usr-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    await env.ACCOUNTS.prepare(
      'insert into "user" (id, name, email, emailVerified, createdAt, updatedAt) values (?, ?, ?, 1, ?, ?)',
    )
      .bind(user, 'A', `${user}@example.test`, now, now)
      .run();
    await env.ACCOUNTS.prepare(
      'insert into "session" (id, expiresAt, token, createdAt, updatedAt, userId) values (?, ?, ?, ?, ?, ?)',
    )
      .bind(`ses-${user}`, '2099-01-01T00:00:00.000Z', token, now, now, user)
      .run();
    return token;
  };

  it('refuses select * from session and every statement outside the list with 403, and runs none of them', async () => {
    const token = await seed();
    for (const sql of [
      'select * from session',
      'select * from "session"',
      'select token from session where 1 = 1',
      'select "primary".* from (select * from "session" where "session"."token" = ? or 1 = 1) as "primary"',
      'select "primary".* from (select * from "session" where "session"."token" = ?) as "primary"; select * from "session"',
      "select k, v from rt_flags where k = 'realtime'",
      'create table t_probe (id integer primary key)',
      'create trigger t_copy after insert on "session" begin insert into "ts_mail" (id) values (new.token); end',
      'drop table "session"',
      'delete from "session"',
      'update "session" set "expiresAt" = ? where "session"."token" = ? or 1 = 1',
      'update "user" set "name" = (select group_concat("token") from "session") where "id" = ?',
      "pragma table_info('session')",
    ]) {
      const response = await call('/db/query', { bearer: DB, body: { sql, params: [token] } });
      expect(response.status, sql).toBe(403);
      const text = await response.text();
      expect(text, sql).not.toContain(token);
      const body = JSON.parse(text) as { error: string; digest: string };
      expect(body.error).toBe('statement_not_allowed');
      expect(body.digest).toMatch(/^[0-9a-f]{12}$/);
    }
    // nothing ran: the session row stands and no table was made
    const still = await env.ACCOUNTS.prepare('select count(*) as n from "session" where token = ?')
      .bind(token)
      .first<{ n: number }>();
    expect(still?.n).toBe(1);
    const made = await env.ACCOUNTS.prepare(
      "select count(*) as n from sqlite_master where name in ('t_probe', 't_copy')",
    ).first<{ n: number }>();
    expect(made?.n).toBe(0);
  });

  it('a batch with one unlisted statement runs none of its statements', async () => {
    const response = await call('/db/batch', {
      bearer: DB,
      body: {
        statements: [
          {
            sql: 'insert into "ts_quota" ("key", "count", "resetAt") values (?, ?, ?)',
            params: ['batch:probe', 1, '2099-01-01T00:00:00.000Z'],
          },
          { sql: 'delete from "session"' },
        ],
      },
    });
    expect(response.status).toBe(403);
    expect(((await response.json()) as { index: number }).index).toBe(1);
    const row = await env.ACCOUNTS.prepare('select count(*) as n from ts_quota where key = ?')
      .bind('batch:probe')
      .first<{ n: number }>();
    expect(row?.n).toBe(0);
  });

  it('runs a listed statement: the session by its token, with a column list of its own on a write', async () => {
    const token = await seed();
    const read = await call('/db/query', {
      bearer: DB,
      body: {
        sql: 'select "primary".* from (select * from "session" where "session"."token" = ?) as "primary"',
        params: [token],
      },
    });
    expect(read.status).toBe(200);
    expect(((await read.json()) as { results: { token: string }[] }).results[0]?.token).toBe(token);
    const write = await call('/db/query', {
      bearer: DB,
      body: {
        sql: 'update "session" set "userAgent" = ? where "session"."token" = ? returning *',
        params: ['probe', token],
      },
    });
    expect(write.status).toBe(200);
  });

  it('the report mode runs an unlisted statement and logs it; /health names the mode', async () => {
    const report = { TURBOSLIDE_DB_STATEMENTS: 'report' };
    const response = await call(
      '/db/query',
      { bearer: DB, body: { sql: 'select v from rt_flags where k = ?', params: ['realtime'] } },
      report,
    );
    expect(response.status).toBe(200);
    expect((await health(report)).statements).toBe('report');
    expect((await health()).statements).toBe('enforce');
  });

  it('the list carries no schema statement, no pragma and no read of the schema table, and is sorted', () => {
    for (const statement of list.statements) {
      expect(statement, statement).not.toMatch(
        /^\s*(create|alter|drop|pragma|attach|detach|vacuum|reindex|analyze|begin|commit|rollback|savepoint|release)\b/i,
      );
      expect(statement, statement).not.toMatch(/sqlite_master|sqlite_schema|pragma_/i);
      expect(statement, statement).not.toContain(';');
    }
    expect([...list.statements].sort()).toEqual(list.statements);
  });
});

describe('the count of the statements outside the list (HR-K2#3)', () => {
  type Unlisted = {
    shapes: number;
    rows: { digest: string; kind: string; table: string | null; refused: number; ran: number }[];
  };

  const unlistedRows = async (bearer = DB): Promise<Unlisted> => {
    const response = await call('/control/db-unlisted', { bearer });
    expect(response.status).toBe(200);
    return (await response.json()) as Unlisted;
  };

  it('counts a refused statement per call under its digest, with no text and no parameter anywhere', async () => {
    const marker = `probe-${crypto.randomUUID()}`;
    const sql = `select * from "session" where "token" = ? and '${marker}' = '${marker}'`;
    const secret = `param-${crypto.randomUUID()}`;
    const lines: string[] = [];
    const warn = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
    });
    try {
      const first = await call('/db/query', { bearer: DB, body: { sql, params: [secret] } });
      expect(first.status).toBe(403);
      const { digest } = (await first.json()) as { digest: string };
      expect(
        (await call('/db/query', { bearer: DB, body: { sql, params: [secret] } })).status,
      ).toBe(403);
      const row = (await unlistedRows()).rows.find((r) => r.digest === digest);
      expect(row).toMatchObject({ kind: 'select', table: 'session', refused: 2, ran: 0 });
      const stored = JSON.stringify(
        (await env.ACCOUNTS.prepare('select * from ts_db_unlisted').all()).results,
      );
      expect(stored).not.toContain(marker);
      expect(stored).not.toContain(secret);
      expect(lines.join('\n')).toContain(digest);
      expect(lines.join('\n')).not.toContain(marker);
      expect(lines.join('\n')).not.toContain(secret);
    } finally {
      warn.mockRestore();
    }
  });

  it('the report mode runs an unlisted statement and counts it once as run', async () => {
    const report = { TURBOSLIDE_DB_STATEMENTS: 'report' };
    const sql = `select v from rt_flags where k = ? and ${Date.now()} > 0`;
    const response = await call(
      '/db/query',
      { bearer: DB, body: { sql, params: ['realtime'] } },
      report,
    );
    expect(response.status).toBe(200);
    const digest = await statementDigest(sql);
    expect((await unlistedRows()).rows.find((r) => r.digest === digest)).toMatchObject({
      refused: 0,
      ran: 1,
    });
  });

  it('opens to the database bearer alone, and to the room bearer only on a Worker without one', async () => {
    expect((await call('/control/db-unlisted', { bearer: ROOM })).status).toBe(401);
    expect((await call('/control/db-unlisted')).status).toBe(401);
    expect((await call('/control/db-unlisted', { bearer: DB })).status).toBe(200);
    const before = { TURBOSLIDE_DB_BEARER: '' };
    expect((await call('/control/db-unlisted', { bearer: ROOM }, before)).status).toBe(200);
  });

  it('keeps at most UNLISTED_ROWS_MAX rows; a known digest still counts past that', async () => {
    await env.ACCOUNTS.prepare('delete from ts_db_unlisted').run();
    await countUnlisted(env.ACCOUNTS, {
      digest: 'known0000000',
      kind: 'select',
      table: null,
      outcome: 'refused',
    });
    const fill = [];
    for (let i = 1; i < UNLISTED_ROWS_MAX; i += 1)
      fill.push(
        env.ACCOUNTS.prepare(
          'insert into ts_db_unlisted (digest, kind, tbl, refused, ran, first_at, last_at) values (?, ?, null, 1, 0, 0, 0)',
        ).bind(`fill${String(i).padStart(8, '0')}`, 'select'),
      );
    await env.ACCOUNTS.batch(fill);
    await countUnlisted(env.ACCOUNTS, {
      digest: 'new000000000',
      kind: 'select',
      table: null,
      outcome: 'refused',
    });
    await countUnlisted(env.ACCOUNTS, {
      digest: 'known0000000',
      kind: 'select',
      table: null,
      outcome: 'refused',
    });
    const { shapes, rows } = await unlistedRows();
    expect(shapes).toBe(UNLISTED_ROWS_MAX);
    expect(rows.find((r) => r.digest === 'new000000000')).toBeUndefined();
    expect(rows.find((r) => r.digest === 'known0000000')?.refused).toBe(2);
  });
});
