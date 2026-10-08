// A D1 shaped fake of the realtime Worker's two database routes (docs/CLOUDFLARE.md 3.6.2) over
// `node:sqlite`, for the unit rows of d1-proxy-dialect.ts and identity.ts: a `fetch` that answers
// `POST /db/query { sql, params }` with `{ success, results, meta }` and `POST /db/batch
// { statements }` with the array of answers, under the same bearer rule the Worker applies
// (`Authorization: Bearer`, 401 otherwise), so the dialect is exercised end to end with no network
// and no Worker. The meta is what SQLite gives this process: `changes` and `last_row_id` from the
// statement's run, `rows_read` as the rows returned and `rows_written` as the changes, since
// `node:sqlite` counts no scanned rows; the real counts come from the Worker's D1 and the local
// `wrangler dev` run of the lane. The fake can be told to refuse or to hang, for the row that
// maps a dead proxy onto an anonymous request (CLOUDFLARE.md 4.3). Given the Worker's
// allowlist (`allowed`, AUTH-3), it refuses an unlisted statement with the Worker's 403
// `statement_not_allowed` and keeps its text in `refused`, so a test reads what the Worker would
// refuse. Test code; nothing of the studio's runtime imports it.
import { DatabaseSync } from 'node:sqlite';

import { statementAllowed } from '@turboslide/realtime/d1-statements';

/** Statements that answer rows, as sqlite-dialect.ts reads them. */
const READS = /^\s*(select|with|pragma|explain)\b/i;
const RETURNING = /\breturning\b/i;

export type FakeD1Behaviour = {
  /** Refuse every call with this status (and the sentence) instead of running it. */
  refuse?: { status: number; error: string } | null;
  /** Never answer: the call hangs until the caller's deadline. */
  hang?: boolean;
  /** Answer nothing for this long, then fail the way a passed deadline fails (a short test's hang). */
  hangMs?: number;
  /** Answer a body that is not the contract's shape. */
  malformed?: boolean;
};

export type FakeD1 = {
  sqlite: DatabaseSync;
  fetch: typeof fetch;
  /** The statements seen, in order; parameters are never kept, as the Worker never logs them. */
  statements: string[];
  /** The statements refused as unlisted, when the fake was given an allowlist. */
  refused: string[];
  /** The calls to each route. */
  calls: { query: number; batch: number; unauthorized: number };
  behaviour: FakeD1Behaviour;
  reset(): void;
};

type Statement = { sql: string; params: unknown[] };

function runOne(sqlite: DatabaseSync, statement: Statement) {
  const prepared = sqlite.prepare(statement.sql);
  const params = statement.params.map((p) => (p === undefined ? null : p)) as (
    null | number | bigint | string | Uint8Array
  )[];
  if (READS.test(statement.sql) || RETURNING.test(statement.sql)) {
    const results = prepared.all(...params) as Record<string, unknown>[];
    return {
      success: true,
      results,
      meta: {
        changes: 0,
        last_row_id: 0,
        rows_read: results.length,
        rows_written: 0,
        duration: 0.1,
      },
    };
  }
  const run = prepared.run(...params);
  return {
    success: true,
    results: [],
    meta: {
      changes: Number(run.changes),
      last_row_id: Number(run.lastInsertRowid),
      rows_read: 0,
      rows_written: Number(run.changes),
      duration: 0.1,
    },
  };
}

function isStatement(value: unknown): value is Statement {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { sql?: unknown }).sql === 'string' &&
    Array.isArray((value as { params?: unknown }).params)
  );
}

/**
 * The fake over a database (an in memory one by default); `bearer` is the value the routes
 * expect. The same `fetch` serves every URL whose path is one of the two routes, whatever the
 * origin, so a dialect built with any host reaches it.
 */
export function fakeD1(
  bearer: string,
  sqlite: DatabaseSync = new DatabaseSync(':memory:'),
  options: { allowed?: ReadonlySet<string> } = {},
): FakeD1 {
  /** The Worker's refusal of an unlisted statement (apps/realtime-worker/src/db.ts), or null. */
  const refusal = (sqls: string[]): Response | null => {
    if (options.allowed === undefined) return null;
    const index = sqls.findIndex((sql) => !statementAllowed(sql, options.allowed!));
    if (index === -1) return null;
    fake.refused.push(sqls[index]!);
    return Response.json(
      {
        error: 'statement_not_allowed',
        message: `statement ${index} is not in the accounts allowlist`,
        index,
      },
      { status: 403 },
    );
  };
  const fake: FakeD1 = {
    sqlite,
    statements: [],
    refused: [],
    calls: { query: 0, batch: 0, unauthorized: 0 },
    behaviour: {},
    reset() {
      fake.statements.length = 0;
      fake.refused.length = 0;
      fake.calls = { query: 0, batch: 0, unauthorized: 0 };
      fake.behaviour = {};
    },
    fetch: async (input, init) => {
      const url = new URL(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      );
      const headers = new Headers(init?.headers);
      if (url.pathname === '/db/query') fake.calls.query += 1;
      else if (url.pathname === '/db/batch') fake.calls.batch += 1;
      if (fake.behaviour.hang === true) {
        await new Promise<void>((resolve) => {
          init?.signal?.addEventListener('abort', () => resolve(), { once: true });
        });
        const reason = init?.signal?.reason;
        throw reason instanceof Error ? reason : new DOMException('aborted', 'TimeoutError');
      }
      if (fake.behaviour.hangMs !== undefined) {
        await new Promise<void>((resolve) => setTimeout(resolve, fake.behaviour.hangMs));
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      }
      if (headers.get('authorization') !== `Bearer ${bearer}`) {
        fake.calls.unauthorized += 1;
        return Response.json({ error: 'unauthorized' }, { status: 401 });
      }
      if (fake.behaviour.refuse) {
        return Response.json(
          { error: fake.behaviour.refuse.error },
          { status: fake.behaviour.refuse.status },
        );
      }
      let body: unknown;
      try {
        body = JSON.parse(typeof init?.body === 'string' ? init.body : '');
      } catch {
        return Response.json({ error: 'the body is not JSON' }, { status: 400 });
      }
      if (fake.behaviour.malformed === true) return Response.json({ nothing: true });
      try {
        if (url.pathname === '/db/query') {
          if (!isStatement(body))
            return Response.json({ error: 'sql and params' }, { status: 400 });
          fake.statements.push(body.sql);
          const refused = refusal([body.sql]);
          if (refused !== null) return refused;
          return Response.json(runOne(sqlite, body));
        }
        if (url.pathname === '/db/batch') {
          const statements = (body as { statements?: unknown }).statements;
          if (!Array.isArray(statements) || !statements.every(isStatement))
            return Response.json({ error: 'statements' }, { status: 400 });
          const refused = refusal(statements.map((s) => s.sql));
          if (refused !== null) {
            fake.statements.push(...statements.map((s) => s.sql));
            return refused;
          }
          /* D1's batch is one transaction: all or nothing */
          sqlite.exec('begin');
          try {
            const answers = statements.map((s) => {
              fake.statements.push(s.sql);
              return runOne(sqlite, s);
            });
            sqlite.exec('commit');
            return Response.json(answers);
          } catch (error) {
            sqlite.exec('rollback');
            throw error;
          }
        }
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message.slice(0, 300) : 'statement failed' },
          { status: 400 },
        );
      }
      return new Response('Not found', { status: 404 });
    },
  };
  return fake;
}
