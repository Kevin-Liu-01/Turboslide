// The identity database and where it comes from (gslides-parity SPEC-3 2.5, 7.3, 11.4;
// research 03 D1, D2): Postgres behind `DATABASE_URL` (Neon through the Marketplace, which
// this round does not install; the dialect is Kysely's over `pg` and is exercised against the
// SQLite engine's behaviour and the schema builder only), `node:sqlite` behind
// `TURBOSLIDE_AUTH_DB` on a checkout, and none otherwise, in which case the studio runs anonymous
// only and the Sign in row is absent (7.3). One place decides, from the environment alone, in the
// shape of `selectStore` and `selectRealtime`, and never prints a URL: `DATABASE_URL` carries a
// password.
import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';

import { migrateTurboslideTables } from './schema.ts';
import type { AuthDatabase } from './schema.ts';
import { NodeSqliteDialect } from './sqlite-dialect.ts';

export const AUTH_DB_VARIABLE = 'TURBOSLIDE_AUTH_DB';
export const DATABASE_URL_VARIABLE = 'DATABASE_URL';

/** The sentence the Sign in row's absence stands on (SPEC-3 7.3), for the facts and the log. */
export const NO_DATABASE_NOTICE =
  'Sign in needs a database on this deployment; the studio runs anonymous only';

export type Env = Readonly<Record<string, string | undefined>>;

export type AuthDbSelection =
  | { kind: 'postgres'; reason: string }
  | { kind: 'sqlite'; path: string; reason: string }
  | { kind: 'none'; reason: string };

function isSet(value: string | undefined): value is string {
  return value !== undefined && value !== '';
}

/**
 * The engine for this process: Postgres when `DATABASE_URL` is set, SQLite when
 * `TURBOSLIDE_AUTH_DB` names a file (relative to `root`, the repository root or the overlay),
 * none otherwise. A hosted process may not name a SQLite file: its filesystem does not outlive
 * the instance (03 D1), so the variable is refused there with a TypeError.
 */
export function selectAuthDb(
  env: Env = process.env,
  root: string = process.cwd(),
): AuthDbSelection {
  if (isSet(env[DATABASE_URL_VARIABLE]))
    return { kind: 'postgres', reason: `${DATABASE_URL_VARIABLE} is set` };
  const file = env[AUTH_DB_VARIABLE];
  if (isSet(file)) {
    if (isSet(env.VERCEL))
      throw new TypeError(
        `${AUTH_DB_VARIABLE} names a SQLite file, which a hosted instance cannot keep; set ${DATABASE_URL_VARIABLE} instead`,
      );
    return {
      kind: 'sqlite',
      path: isAbsolute(file) ? file : resolve(root, file),
      reason: `${AUTH_DB_VARIABLE}=${file}`,
    };
  }
  return {
    kind: 'none',
    reason: `neither ${DATABASE_URL_VARIABLE} nor ${AUTH_DB_VARIABLE} is set`,
  };
}

export type AuthDb = {
  kind: 'sqlite' | 'postgres';
  db: Kysely<AuthDatabase>;
  /** The raw SQLite handle, for the synchronous key lookup of tokens.ts; absent on Postgres. */
  sqlite?: DatabaseSync;
  close: () => Promise<void>;
};

/** Opens the selected engine; `none` is the caller's to handle (there is nothing to open). */
export function openAuthDb(selection: Exclude<AuthDbSelection, { kind: 'none' }>): AuthDb {
  if (selection.kind === 'sqlite') {
    mkdirSync(dirname(selection.path), { recursive: true });
    const sqlite = new DatabaseSync(selection.path);
    sqlite.exec('pragma journal_mode = wal');
    sqlite.exec('pragma busy_timeout = 5000');
    sqlite.exec('pragma foreign_keys = on');
    const db = new Kysely<AuthDatabase>({ dialect: new NodeSqliteDialect(sqlite) });
    return { kind: 'sqlite', db, sqlite, close: () => db.destroy() };
  }
  const pool = new pg.Pool({ connectionString: process.env[DATABASE_URL_VARIABLE], max: 4 });
  const db = new Kysely<AuthDatabase>({ dialect: new PostgresDialect({ pool }) });
  return { kind: 'postgres', db, close: () => db.destroy() };
}

/** Creates Turboslide's own tables; better-auth's are migrated by better-auth.ts. */
export async function migrateAuthDb(auth: AuthDb): Promise<void> {
  await migrateTurboslideTables(auth.db);
}

/** An in memory SQLite database with every Turboslide table, for tests. */
export async function memoryAuthDb(): Promise<AuthDb> {
  const sqlite = new DatabaseSync(':memory:');
  const db = new Kysely<AuthDatabase>({ dialect: new NodeSqliteDialect(sqlite) });
  const auth: AuthDb = { kind: 'sqlite', db, sqlite, close: () => db.destroy() };
  await migrateAuthDb(auth);
  return auth;
}
