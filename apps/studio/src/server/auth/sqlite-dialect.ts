// A Kysely dialect over Node's built in SQLite (gslides-parity SPEC-3 2.5, 7.3; research 03
// D1, D2): the identity tables of a checkout live in one file under `.turboslide/`
// (`TURBOSLIDE_AUTH_DB`), opened with `node:sqlite`'s `DatabaseSync`, so `pnpm dev` needs no
// native addon and no service. Kysely ships a dialect for better-sqlite3 only, whose statements
// carry a `reader` flag `node:sqlite` does not, so this file is the small driver Kysely needs:
// one connection, one statement at a time (SQLite is single writer), the statement kind read
// from the SQL, booleans bound as integers and dates as ISO strings because `node:sqlite` binds
// neither. Postgres (behind `DATABASE_URL`) uses Kysely's own dialect over `pg` (db.ts).
import { DatabaseSync } from 'node:sqlite';

import { CompiledQuery, SqliteAdapter, SqliteIntrospector, SqliteQueryCompiler } from 'kysely';
import type {
  DatabaseConnection,
  DatabaseIntrospector,
  Dialect,
  DialectAdapter,
  Driver,
  Kysely,
  QueryCompiler,
  QueryResult,
} from 'kysely';

/** Statements that answer rows: a select, a common table expression, a pragma, or any `returning`. */
const READS = /^\s*(select|with|pragma|explain)\b/i;
const RETURNING = /\breturning\b/i;

type Bindable = null | number | bigint | string | Uint8Array;

/** The parameter forms `node:sqlite` binds: booleans become 0 and 1, dates ISO strings, undefined null. */
export function bindable(value: unknown): Bindable {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'string')
    return value;
  if (value instanceof Uint8Array) return value;
  if (Buffer.isBuffer(value)) return new Uint8Array(value);
  return JSON.stringify(value);
}

class NodeSqliteConnection implements DatabaseConnection {
  readonly #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  executeQuery<O>(compiledQuery: CompiledQuery): Promise<QueryResult<O>> {
    const { sql, parameters } = compiledQuery;
    const statement = this.#db.prepare(sql);
    const bound = parameters.map(bindable);
    if (READS.test(sql) || RETURNING.test(sql)) {
      const rows = statement.all(...bound) as O[];
      return Promise.resolve({ rows });
    }
    const result = statement.run(...bound);
    return Promise.resolve({
      rows: [],
      numAffectedRows: BigInt(result.changes),
      insertId: BigInt(result.lastInsertRowid),
    });
  }

  // eslint-disable-next-line require-yield
  async *streamQuery<O>(): AsyncIterableIterator<QueryResult<O>> {
    throw new Error('streaming is not supported over node:sqlite');
  }
}

class NodeSqliteDriver implements Driver {
  readonly #db: DatabaseSync;
  readonly #connection: NodeSqliteConnection;
  #queue: Promise<void> = Promise.resolve();

  constructor(db: DatabaseSync) {
    this.#db = db;
    this.#connection = new NodeSqliteConnection(db);
  }

  init(): Promise<void> {
    return Promise.resolve();
  }

  /** One statement at a time: callers queue on the single connection, released in order. */
  acquireConnection(): Promise<DatabaseConnection> {
    const previous = this.#queue;
    let release: () => void = () => undefined;
    this.#queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    (this.#connection as NodeSqliteConnection & { release?: () => void }).release = release;
    return previous.then(() => this.#connection);
  }

  async beginTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw('begin'));
  }

  async commitTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw('commit'));
  }

  async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw('rollback'));
  }

  releaseConnection(connection: DatabaseConnection): Promise<void> {
    (connection as NodeSqliteConnection & { release?: () => void }).release?.();
    return Promise.resolve();
  }

  destroy(): Promise<void> {
    this.#db.close();
    return Promise.resolve();
  }
}

export class NodeSqliteDialect implements Dialect {
  readonly #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  createDriver(): Driver {
    return new NodeSqliteDriver(this.#db);
  }

  createQueryCompiler(): QueryCompiler {
    return new SqliteQueryCompiler();
  }

  createAdapter(): DialectAdapter {
    return new SqliteAdapter();
  }

  // Kysely's introspector is typed over any database; the identity tables are typed in schema.ts
  createIntrospector(db: Kysely<never>): DatabaseIntrospector {
    return new SqliteIntrospector(db);
  }
}
