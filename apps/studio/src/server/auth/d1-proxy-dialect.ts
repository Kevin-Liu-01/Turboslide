// A Kysely dialect over the realtime Worker's D1 routes (docs/CLOUDFLARE.md 4.1, 4.2, 3.6.2):
// the account database is D1 `turboslide-accounts`, bound to the Worker as `ACCOUNTS`, and a D1
// binding exists inside a Worker alone, so the Vercel function reaches it through the Worker's
// bearer routes. Every `executeQuery` posts one compiled statement, `{ sql, params }`, to
// `POST /db/query` under `Authorization: Bearer <TURBOSLIDE_ROOM_BEARER>` on
// `TURBOSLIDE_ROOM_HOST` (the channel's host and bearer, shared on purpose: one Worker, one
// bearer, 3.3) with a 10 s deadline, and maps the answer's `results`, `meta.changes` and
// `meta.last_row_id` onto Kysely's result; several statements that do not depend on each other
// go to `POST /db/batch` as one transaction (the introspector's per table reads). The SQLite
// grammar is Kysely's own (`SqliteQueryCompiler`, `SqliteAdapter`), the one better-auth takes
// under `type: 'sqlite'`. No streaming; `begin`, `commit` and `rollback` are refused, because D1
// has no interactive transactions and nothing in this folder opens one (research-d1-auth.md 2.2).
// `bindable` stays in front of D1 (booleans become 0 and 1, dates ISO strings, undefined null) as
// sqlite-dialect.ts binds them, until D1's own binding rules are read (research-d1-auth.md 8.5).
//
// better-auth's own tables ride a second shape over the same client: `d1Binding(client)` is a
// D1 binding shaped object (`prepare().bind().all()`, `batch()`, `exec()`), which the library
// recognises as D1 and serves with its own D1 dialect and its own index introspector
// (@better-auth/kysely-adapter `createKyselyAdapter`, research-d1-auth.md 2.1). The reason is a
// fact read on `wrangler dev`'s D1 on 2026-10-01: the library's generic SQLite index read
// (`getMigrations`, a join of `sqlite_master` against `pragma_index_list(tables.name)` and
// `pragma_index_info(index_list.name)`) is refused by D1 with `not authorized: SQLITE_AUTH`,
// while its D1 introspector's `PRAGMA index_list('t')` and `SELECT * FROM pragma_table_info(?)`
// statements pass. Turboslide's tables and the seed stay on the Kysely of this dialect.
//
// A refused or timed out call throws `D1ProxyError`, a store error the identity runtime maps to
// anonymous for that request after one retry (identity.ts `accountSession`). The counters sum
// `meta.rows_read` and `meta.rows_written` per process for the cost rows `cost.d1.reads` and
// `cost.d1.writes` (2.2); the Worker's `GET /db/counters` is the measured path. Nothing here logs
// a statement, a parameter or the bearer.
import { SqliteAdapter, SqliteQueryCompiler } from 'kysely';
import type {
  CompiledQuery,
  ColumnMetadata,
  DatabaseConnection,
  DatabaseIntrospector,
  DatabaseMetadataOptions,
  Dialect,
  DialectAdapter,
  Driver,
  Kysely,
  QueryCompiler,
  QueryResult,
  SchemaMetadata,
  TableMetadata,
} from 'kysely';

export const ROOM_HOST_VARIABLE = 'TURBOSLIDE_ROOM_HOST';
export const ROOM_BEARER_VARIABLE = 'TURBOSLIDE_ROOM_BEARER';
/** `1` on a checkout: the Worker under `wrangler dev` answers plain http. */
export const ROOM_INSECURE_VARIABLE = 'TURBOSLIDE_ROOM_INSECURE';
/** The deadline of one statement over the proxy (docs/CLOUDFLARE.md 4.2). */
export const D1_QUERY_TIMEOUT_MS = 10_000;
export const D1_QUERY_PATH = '/db/query';
export const D1_BATCH_PATH = '/db/batch';
export const D1_COUNTERS_PATH = '/db/counters';

/** `https://<host>`, or `http://<host>` when the checkout says the Worker is insecure. */
export function roomOrigin(host: string, insecure = false): string {
  const trimmed = host
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
  if (trimmed === '') throw new TypeError(`${ROOM_HOST_VARIABLE} is empty`);
  return `${insecure ? 'http' : 'https'}://${trimmed}`;
}

export type StatementKind = 'read' | 'write' | 'schema' | 'other';

/** The kind of a statement, from its first word; for the counters and never for the mapping. */
export function statementKind(sql: string): StatementKind {
  const word =
    /^\s*(?:with\b[\s\S]*?\b)?(select|insert|update|delete|replace|create|alter|drop|pragma|explain)\b/i
      .exec(sql)?.[1]
      ?.toLowerCase();
  switch (word) {
    case 'select':
    case 'pragma':
    case 'explain':
      return 'read';
    case 'insert':
    case 'update':
    case 'delete':
    case 'replace':
      return 'write';
    case 'create':
    case 'alter':
    case 'drop':
      return 'schema';
    default:
      return 'other';
  }
}

/** The parameter forms carried to D1 as JSON: booleans 0 and 1, dates ISO strings, undefined null, objects JSON. */
export type D1Bindable = null | number | string;

export function bindable(value: unknown): D1Bindable {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number' || typeof value === 'string') return value;
  if (typeof value === 'bigint')
    return value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER)
      ? Number(value)
      : value.toString();
  if (value instanceof Uint8Array || ArrayBuffer.isView(value) || value instanceof ArrayBuffer)
    throw new TypeError(
      'a blob parameter is not carried over the D1 proxy; the identity tables hold none',
    );
  return JSON.stringify(value);
}

export type D1Meta = {
  changes?: number | null;
  last_row_id?: number | null;
  rows_read?: number | null;
  rows_written?: number | null;
  duration?: number | null;
};

/** One answer of `POST /db/query`, and one element of `POST /db/batch`'s array (CLOUDFLARE.md 3.6.2). */
export type D1QueryAnswer = {
  success?: boolean;
  results?: unknown[] | null;
  meta?: D1Meta | null;
  error?: string;
};

export type D1ProxyErrorKind = 'refused' | 'timeout' | 'network' | 'malformed';

/** The store error of the proxy: the route's status and the Worker's sentence, never a parameter. */
export class D1ProxyError extends Error {
  readonly status: number;
  readonly kind: D1ProxyErrorKind;

  constructor(kind: D1ProxyErrorKind, status: number, message: string) {
    super(message);
    this.name = 'D1ProxyError';
    this.kind = kind;
    this.status = status;
  }
}

export function isD1ProxyError(error: unknown): error is D1ProxyError {
  return error instanceof D1ProxyError || (error instanceof Error && error.name === 'D1ProxyError');
}

export type D1ProxyCounters = {
  /** Calls to `/db/query` and `/db/batch`. */
  calls: number;
  statements: number;
  reads: number;
  writes: number;
  schema: number;
  rowsRead: number;
  rowsWritten: number;
  durationMs: number;
  failures: number;
};

export type D1ProxyConfig = {
  host: string;
  bearer: string;
  insecure?: boolean;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

export type D1Statement = { sql: string; params: D1Bindable[] };

/** The HTTP client of the two routes; one per `AuthDb`, shared by the dialect and the introspector. */
export class D1ProxyClient {
  readonly origin: string;
  readonly #bearer: string;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;
  readonly #counters: D1ProxyCounters = {
    calls: 0,
    statements: 0,
    reads: 0,
    writes: 0,
    schema: 0,
    rowsRead: 0,
    rowsWritten: 0,
    durationMs: 0,
    failures: 0,
  };

  constructor(config: D1ProxyConfig) {
    if (config.bearer === '') throw new TypeError(`${ROOM_BEARER_VARIABLE} is empty`);
    this.origin = roomOrigin(config.host, config.insecure ?? false);
    this.#bearer = config.bearer;
    this.#fetch = config.fetch ?? ((input, init) => fetch(input, init));
    this.#timeoutMs = config.timeoutMs ?? D1_QUERY_TIMEOUT_MS;
  }

  counters(): D1ProxyCounters {
    return { ...this.#counters };
  }

  /** One statement through `POST /db/query`. */
  async query(sql: string, params: D1Bindable[]): Promise<D1QueryAnswer> {
    const answer = await this.#post(D1_QUERY_PATH, { sql, params });
    if (Array.isArray(answer) || typeof answer !== 'object' || answer === null)
      throw new D1ProxyError('malformed', 200, 'the /db/query answer is not an object');
    this.#count([sql], [answer as D1QueryAnswer]);
    return answer as D1QueryAnswer;
  }

  /** Several statements through `POST /db/batch`, one transaction, the answers in order. */
  async batch(statements: D1Statement[]): Promise<D1QueryAnswer[]> {
    if (statements.length === 0) return [];
    const answer = await this.#post(D1_BATCH_PATH, { statements });
    const list = Array.isArray(answer)
      ? answer
      : typeof answer === 'object' &&
          answer !== null &&
          Array.isArray((answer as { results?: unknown }).results)
        ? ((answer as { results: unknown[] }).results as unknown[])
        : null;
    if (list === null || list.length !== statements.length)
      throw new D1ProxyError(
        'malformed',
        200,
        `the /db/batch answer carries ${list === null ? 'no list' : `${list.length} answers`} for ${statements.length} statements`,
      );
    this.#count(
      statements.map((s) => s.sql),
      list as D1QueryAnswer[],
    );
    return list as D1QueryAnswer[];
  }

  #count(sqls: string[], answers: D1QueryAnswer[]): void {
    this.#counters.calls += 1;
    for (let i = 0; i < sqls.length; i += 1) {
      const kind = statementKind(sqls[i] ?? '');
      this.#counters.statements += 1;
      if (kind === 'read') this.#counters.reads += 1;
      else if (kind === 'write') this.#counters.writes += 1;
      else if (kind === 'schema') this.#counters.schema += 1;
      const meta = answers[i]?.meta;
      this.#counters.rowsRead += Number(meta?.rows_read ?? 0) || 0;
      this.#counters.rowsWritten += Number(meta?.rows_written ?? 0) || 0;
      this.#counters.durationMs += Number(meta?.duration ?? 0) || 0;
    }
  }

  async #post(path: string, body: unknown): Promise<unknown> {
    let response: Response;
    try {
      response = await this.#fetch(`${this.origin}${path}`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.#bearer}`,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
    } catch (error) {
      this.#counters.failures += 1;
      const timedOut =
        error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      throw new D1ProxyError(
        timedOut ? 'timeout' : 'network',
        0,
        timedOut
          ? `the D1 proxy did not answer ${path} within ${this.#timeoutMs} ms`
          : `the D1 proxy at ${this.origin} was not reached: ${error instanceof Error ? error.name : 'error'}`,
      );
    }
    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = text === '' ? null : JSON.parse(text);
    } catch {
      parsed = null;
    }
    if (!response.ok) {
      this.#counters.failures += 1;
      /* the Worker's refusal body is `{ error: <code>, message: <sentence> }` (apps/realtime-worker
         src/db.ts); the sentence first, the code when there is none */
      const body =
        typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
      const sentence =
        typeof body.message === 'string'
          ? body.message
          : typeof body.error === 'string'
            ? body.error
            : response.statusText || 'refused';
      throw new D1ProxyError(
        'refused',
        response.status,
        `the D1 proxy answered ${response.status} on ${path}: ${sentence.slice(0, 300)}`,
      );
    }
    if (parsed === null) {
      this.#counters.failures += 1;
      throw new D1ProxyError(
        'malformed',
        response.status,
        `the D1 proxy answered ${path} with no JSON`,
      );
    }
    return parsed;
  }
}

// ------------------------------------------------------------------------------------------
// The binding shaped facade for better-auth (the header's second shape)

/** The result shape of a D1 statement, as the library's D1 dialect reads it (`results`, `meta`). */
export type D1LikeResult = {
  success: true;
  results: unknown[];
  meta: D1Meta & Record<string, unknown>;
};

export type D1LikeStatement = {
  readonly sql: string;
  readonly params: D1Bindable[];
  bind(...values: unknown[]): D1LikeStatement;
  all(): Promise<D1LikeResult>;
  run(): Promise<D1LikeResult>;
  first(column?: string): Promise<unknown>;
  raw(): Promise<unknown[][]>;
};

/** The three methods the library's adapter tests for (`batch`, `exec`, `prepare`) and nothing more. */
export type D1Like = {
  prepare(sql: string): D1LikeStatement;
  batch(statements: D1LikeStatement[]): Promise<D1LikeResult[]>;
  exec(sql: string): Promise<{ count: number; duration: number }>;
};

function likeResult(answer: D1QueryAnswer): D1LikeResult {
  return {
    success: true,
    results: Array.isArray(answer.results) ? answer.results : [],
    meta: { ...(answer.meta ?? {}) },
  };
}

function likeStatement(client: D1ProxyClient, sql: string, params: D1Bindable[]): D1LikeStatement {
  const statement: D1LikeStatement = {
    sql,
    params,
    bind: (...values) => likeStatement(client, sql, values.map(bindable)),
    all: async () => likeResult(await client.query(sql, params)),
    run: async () => likeResult(await client.query(sql, params)),
    first: async (column) => {
      const row = (await client.query(sql, params)).results?.[0] as
        Record<string, unknown> | undefined;
      if (row === undefined) return null;
      return column === undefined ? row : (row[column] ?? null);
    },
    raw: async () =>
      ((await client.query(sql, params)).results ?? []).map((row) =>
        Object.values(row as Record<string, unknown>),
      ),
  };
  return statement;
}

/**
 * A D1 binding shaped object over the client, for better-auth's `database` option on the `d1`
 * engine: its `prepare(sql).bind(...).all()` is one `/db/query`, its `batch()` one `/db/batch`
 * (one transaction), its `exec()` one statement (the library never calls it; the Worker has no
 * exec route, so several statements joined by `;` are refused here).
 */
export function d1Binding(client: D1ProxyClient): D1Like {
  return {
    prepare: (sql) => likeStatement(client, sql, []),
    batch: async (statements) => {
      const answers = await client.batch(statements.map((s) => ({ sql: s.sql, params: s.params })));
      return answers.map(likeResult);
    },
    exec: async (sql) => {
      if (sql.trim().replace(/;\s*$/, '').includes(';'))
        throw new TypeError('exec over the D1 proxy takes one statement');
      const t = Date.now();
      await client.query(sql, []);
      return { count: 1, duration: Date.now() - t };
    },
  };
}

/** Kysely's result from one D1 answer: the rows, the changes and the last row id. */
export function toQueryResult<O>(answer: D1QueryAnswer): QueryResult<O> {
  const rows = (Array.isArray(answer.results) ? answer.results : []) as O[];
  const changes = answer.meta?.changes;
  const lastRowId = answer.meta?.last_row_id;
  return {
    rows,
    ...(changes !== undefined && changes !== null ? { numAffectedRows: BigInt(changes) } : {}),
    ...(lastRowId !== undefined && lastRowId !== null && lastRowId !== 0
      ? { insertId: BigInt(lastRowId) }
      : {}),
  };
}

class D1ProxyConnection implements DatabaseConnection {
  readonly #client: D1ProxyClient;

  constructor(client: D1ProxyClient) {
    this.#client = client;
  }

  async executeQuery<O>(compiledQuery: CompiledQuery): Promise<QueryResult<O>> {
    const answer = await this.#client.query(
      compiledQuery.sql,
      compiledQuery.parameters.map(bindable),
    );
    return toQueryResult<O>(answer);
  }

  // eslint-disable-next-line require-yield
  async *streamQuery<O>(): AsyncIterableIterator<QueryResult<O>> {
    throw new Error('streaming is not supported over the D1 proxy');
  }
}

const NO_TRANSACTIONS =
  'D1 has no interactive transactions; the proxy refuses begin, commit and rollback (docs/CLOUDFLARE.md 4.2)';

class D1ProxyDriver implements Driver {
  readonly #connection: D1ProxyConnection;

  constructor(client: D1ProxyClient) {
    this.#connection = new D1ProxyConnection(client);
  }

  init(): Promise<void> {
    return Promise.resolve();
  }

  /** Stateless over HTTP: every caller gets the one connection and calls run concurrently. */
  acquireConnection(): Promise<DatabaseConnection> {
    return Promise.resolve(this.#connection);
  }

  beginTransaction(): Promise<void> {
    return Promise.reject(new Error(NO_TRANSACTIONS));
  }

  commitTransaction(): Promise<void> {
    return Promise.reject(new Error(NO_TRANSACTIONS));
  }

  rollbackTransaction(): Promise<void> {
    return Promise.reject(new Error(NO_TRANSACTIONS));
  }

  releaseConnection(): Promise<void> {
    return Promise.resolve();
  }

  destroy(): Promise<void> {
    return Promise.resolve();
  }
}

type SqliteMasterRow = { name: string; type: string; sql: string | null };
type PragmaColumnRow = {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: unknown;
  pk: number;
};

/**
 * The introspector better-auth's `getMigrations` reads at boot, in the shape of the installed
 * adapter's own D1 introspector (research-d1-auth.md 2.1): the tables from `sqlite_master` in one
 * statement, then every table's columns through `pragma_table_info(?)` in one batch, since
 * Kysely's SQLite introspector joins a common table expression against
 * `pragma_table_info(tl.name)`, a form no D1 page confirms.
 */
class D1ProxyIntrospector implements DatabaseIntrospector {
  readonly #client: D1ProxyClient;

  constructor(client: D1ProxyClient) {
    this.#client = client;
  }

  getSchemas(): Promise<SchemaMetadata[]> {
    return Promise.resolve([]);
  }

  async getTables(
    options: DatabaseMetadataOptions = { withInternalKyselyTables: false },
  ): Promise<TableMetadata[]> {
    const listed = await this.#client.query(
      `select name, type, sql from sqlite_master where type in ('table', 'view') and name not like 'sqlite_%' and name not like '_cf_%'${
        options.withInternalKyselyTables
          ? ''
          : " and name not in ('kysely_migration', 'kysely_migration_lock')"
      } order by name`,
      [],
    );
    const tables = (listed.results ?? []) as SqliteMasterRow[];
    if (tables.length === 0) return [];
    const columns = await this.#client.batch(
      tables.map((table) => ({ sql: 'select * from pragma_table_info(?)', params: [table.name] })),
    );
    return tables.map((table, index) => {
      const info = (columns[index]?.results ?? []) as PragmaColumnRow[];
      let autoIncrementCol = table.sql
        ?.split(/[(),]/)
        .find((it) => it.toLowerCase().includes('autoincrement'))
        ?.trimStart()
        .split(/\s+/)[0]
        ?.replace(/["`]/g, '');
      if (autoIncrementCol === undefined) {
        const pk = info.filter((row) => row.pk > 0);
        if (pk.length === 1 && pk[0]!.type.toLowerCase() === 'integer')
          autoIncrementCol = pk[0]!.name;
      }
      const columnsOf: ColumnMetadata[] = info.map((col) => ({
        name: col.name,
        dataType: col.type,
        isNullable: !col.notnull,
        isAutoIncrementing: col.name === autoIncrementCol,
        hasDefaultValue: col.dflt_value !== null && col.dflt_value !== undefined,
      }));
      return {
        name: table.name,
        isView: table.type === 'view',
        isForeign: false,
        columns: columnsOf,
      };
    });
  }
}

export class D1ProxyDialect implements Dialect {
  readonly client: D1ProxyClient;

  constructor(config: D1ProxyConfig | D1ProxyClient) {
    this.client = config instanceof D1ProxyClient ? config : new D1ProxyClient(config);
  }

  createDriver(): Driver {
    return new D1ProxyDriver(this.client);
  }

  createQueryCompiler(): QueryCompiler {
    return new SqliteQueryCompiler();
  }

  createAdapter(): DialectAdapter {
    return new SqliteAdapter();
  }

  // Kysely's introspector is typed over any database; the identity tables are typed in schema.ts
  createIntrospector(_db: Kysely<never>): DatabaseIntrospector {
    return new D1ProxyIntrospector(this.client);
  }
}
