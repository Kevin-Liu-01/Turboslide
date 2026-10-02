// The accounts database routes (docs/CLOUDFLARE.md 3.6.2 `src/db.ts`, 4.1): the Vercel
// function's Kysely dialect posts one compiled statement per `executeQuery` to `POST /db/query`
// and a transaction's statements to `POST /db/batch`, under the room bearer the router verified;
// the Worker runs them on the bound D1 (`env.ACCOUNTS.prepare(sql).bind(...params).all()`,
// `batch()` is one transaction) and answers `{ results, meta }` with D1's own `meta` (`changes`,
// `last_row_id`, `rows_read`, `rows_written`, `duration`). The sums ride `GET /db/counters` for
// `cost.d1.*`. The logging rule of 3.3: a statement's kind and its first table name, never its
// parameters.

export type DbStatement = { sql: string; params?: unknown[] };

export const dbCounters = { queries: 0, batches: 0, statements: 0, rowsRead: 0, rowsWritten: 0 };

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
export async function dbQuery(db: D1Database, body: unknown): Promise<Response> {
  if (!isStatement(body))
    return json({ error: 'invalid', message: 'the body is { sql, params? }' }, 400);
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
export async function dbBatch(db: D1Database, body: unknown): Promise<Response> {
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
