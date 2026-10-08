// The accounts database routes (docs/CLOUDFLARE.md 3.6.2 `src/db.ts`, 4.1): the Vercel
// function's Kysely dialect posts one compiled statement per `executeQuery` to `POST /db/query`
// and a transaction's statements to `POST /db/batch`, under the database bearer the router
// verified (index.ts `dbBearerOk`); the Worker runs them on the bound D1
// (`env.ACCOUNTS.prepare(sql).bind(...params).all()`, `batch()` is one transaction) and answers
// `{ results, meta }` with D1's own `meta` (`changes`, `last_row_id`, `rows_read`,
// `rows_written`, `duration`). The sums ride `GET /db/counters` for `cost.d1.*`.
//
// AUTH-3: a statement runs only when its skeleton is in db-statements.json, the texts
// apps/studio/src/server/auth/record-statements.test.ts records from the accounts code
// (@turboslide/realtime/d1-statements has the skeleton rule). Anything else, `select * from
// session` among it, answers 403 `statement_not_allowed`; a batch with one such statement runs
// none. `TURBOSLIDE_DB_STATEMENTS=report` (a Worker secret, docs/hosting.md 13.8) runs an unlisted
// statement and logs it instead: the hand switch for a statement the recording missed, set with
// no deploy and deleted once the list carries it. The logging rule of 3.3 holds: a statement's
// kind, its first table name and the first 12 hex characters of its text's SHA-256, never the
// text or its parameters.
import { statementAllowed } from '@turboslide/realtime/d1-statements';

import list from './db-statements.json';

export type DbStatement = { sql: string; params?: unknown[] };

/** `enforce` refuses an unlisted statement; `report` runs it and logs it (the hand switch). */
export type StatementMode = 'enforce' | 'report';

export const dbCounters = {
  queries: 0,
  batches: 0,
  statements: 0,
  rowsRead: 0,
  rowsWritten: 0,
  refused: 0,
  unlisted: 0,
};

/** The allowlist's skeletons, read once per isolate. */
export const ALLOWED_STATEMENTS: ReadonlySet<string> = new Set(list.statements);

/** The mode the Worker's `TURBOSLIDE_DB_STATEMENTS` names; anything but `report` enforces. */
export function statementMode(value: string | undefined): StatementMode {
  return value?.trim().toLowerCase() === 'report' ? 'report' : 'enforce';
}

const encoder = new TextEncoder();

/** The first 12 hex characters of the text's SHA-256: enough to find the call site, nothing of the text. */
export async function statementDigest(sql: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(sql)));
  return [...digest.slice(0, 6)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The refusal of the statements that are not in the list, or null when every one may run. In
 * `report` mode nothing is refused and each unlisted statement is logged.
 */
async function unlisted(statements: DbStatement[], mode: StatementMode): Promise<Response | null> {
  for (let index = 0; index < statements.length; index += 1) {
    const sql = statements[index]!.sql;
    if (statementAllowed(sql, ALLOWED_STATEMENTS)) continue;
    const shape = statementShape(sql);
    const digest = await statementDigest(sql);
    if (mode === 'report') {
      dbCounters.unlisted += 1;
      console.warn(
        JSON.stringify({
          message: 'db.statement.unlisted',
          kind: shape.kind,
          table: shape.table,
          digest,
        }),
      );
      continue;
    }
    dbCounters.refused += 1;
    console.warn(
      JSON.stringify({
        message: 'db.statement.refused',
        kind: shape.kind,
        table: shape.table,
        digest,
        index,
      }),
    );
    return json(
      {
        error: 'statement_not_allowed',
        message: `statement ${index} is not in the accounts allowlist (digest ${digest})`,
        digest,
        index,
      },
      403,
    );
  }
  return null;
}

/** The statement's kind and the first table it names, for a log line (3.3's logging rule). */
export function statementShape(sql: string): { kind: string; table: string | null } {
  const trimmed = sql.trim();
  const kind = (/^[A-Za-z]+/.exec(trimmed)?.[0] ?? 'unknown').toLowerCase();
  const table =
    /\b(?:from|into|update|table(?: if not exists| if exists)?|join)\s+["`]?([A-Za-z_][A-Za-z0-9_]*)/i.exec(
      trimmed,
    )?.[1] ?? null;
  return { kind, table };
}

function isStatement(value: unknown): value is DbStatement {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as { sql?: unknown; params?: unknown };
  if (typeof row.sql !== 'string' || row.sql.trim() === '' || row.sql.length > 100_000)
    return false;
  if (row.params !== undefined && !Array.isArray(row.params)) return false;
  return true;
}

/** A bound D1 value: strings, numbers, null, booleans as 0 and 1 (the dialect's `bindable` keeps the rest). */
function bindable(value: unknown): unknown {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  if (value === undefined) return null;
  return value;
}

type Answer = { results: unknown[]; meta: D1Meta | Record<string, never> };

function answerOf(result: D1Result<unknown>): Answer {
  const meta = result.meta;
  dbCounters.rowsRead += meta.rows_read ?? 0;
  dbCounters.rowsWritten += meta.rows_written ?? 0;
  return { results: result.results, meta };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/** `POST /db/query { sql, params }`. */
export async function dbQuery(
  db: D1Database,
  body: unknown,
  mode: StatementMode = 'enforce',
): Promise<Response> {
  if (!isStatement(body))
    return json({ error: 'invalid', message: 'the body is { sql, params? }' }, 400);
  const refusal = await unlisted([body], mode);
  if (refusal !== null) return refusal;
  dbCounters.queries += 1;
  dbCounters.statements += 1;
  try {
    const result = await db
      .prepare(body.sql)
      .bind(...(body.params ?? []).map(bindable))
      .all();
    return json(answerOf(result));
  } catch (error) {
    const shape = statementShape(body.sql);
    console.error(
      JSON.stringify({
        message: 'db query failed',
        kind: shape.kind,
        table: shape.table,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return json(
      {
        error: 'd1',
        message: error instanceof Error ? error.message : String(error),
        kind: shape.kind,
      },
      500,
    );
  }
}

/** `POST /db/batch { statements: [{ sql, params? }] }`: one transaction, the answers in order. */
export async function dbBatch(
  db: D1Database,
  body: unknown,
  mode: StatementMode = 'enforce',
): Promise<Response> {
  const statements = (body as { statements?: unknown })?.statements;
  if (
    !Array.isArray(statements) ||
    statements.length === 0 ||
    statements.length > 100 ||
    !statements.every(isStatement)
  )
    return json(
      { error: 'invalid', message: 'the body is { statements: [{ sql, params? }] }, 1 to 100' },
      400,
    );
  const refusal = await unlisted(statements, mode);
  if (refusal !== null) return refusal;
  dbCounters.batches += 1;
  dbCounters.statements += statements.length;
  try {
    const results = await db.batch(
      statements.map((statement) =>
        db.prepare(statement.sql).bind(...(statement.params ?? []).map(bindable)),
      ),
    );
    return json({ results: results.map(answerOf) });
  } catch (error) {
    const first =
      statements[0] === undefined
        ? { kind: 'unknown', table: null }
        : statementShape(statements[0].sql);
    console.error(
      JSON.stringify({
        message: 'db batch failed',
        statements: statements.length,
        first,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return json(
      { error: 'd1', message: error instanceof Error ? error.message : String(error) },
      500,
    );
  }
}

/** `GET /db/counters`: the sums since this isolate started. */
export function dbCountersAnswer(): Response {
  return json({ ...dbCounters });
}
