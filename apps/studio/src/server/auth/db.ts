// The identity database and where it comes from (gslides-parity SPEC-3 2.5, 7.3, 11.4;
// research 03 D1, D2; docs/CLOUDFLARE.md 4.1, 4.2): D1 through the realtime Worker's bearer
// routes behind `TURBOSLIDE_ACCOUNTS=d1` (the hosted engine of the Cloudflare move; the dialect
// is d1-proxy-dialect.ts over `TURBOSLIDE_ROOM_HOST` and `TURBOSLIDE_DB_BEARER`, or the room
// bearer where the database bearer is not set yet), `node:sqlite` behind `TURBOSLIDE_AUTH_DB` on a
// checkout, and none otherwise, in which case the studio runs anonymous only and the Sign in row
// is absent (7.3). The Postgres dialect behind `DATABASE_URL`, never set on either Vercel project,
// left in hardening HR-C#8 (CLEANUP-6). One place decides, from the environment alone, in the
// shape of `selectStore` and `selectRealtime`, and never prints a bearer: the database bearer
// reaches the account database (CLOUDFLARE.md 3.3, AUTH-3). The `d1` kind says nothing
// about the realtime tier: a server may run `TURBOSLIDE_ACCOUNTS=d1` with `TURBOSLIDE_REALTIME`
// forced to `memory` (the hand row of CLOUDFLARE.md 2.1).
import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { Kysely } from 'kysely';

import {
  D1ProxyDialect,
  DB_BEARER_VARIABLE,
  ROOM_BEARER_VARIABLE,
  ROOM_HOST_VARIABLE,
  ROOM_INSECURE_VARIABLE,
  d1Binding,
} from './d1-proxy-dialect.ts';
import type { D1Like, D1ProxyCounters } from './d1-proxy-dialect.ts';
import { migrateTurboslideTables } from './schema.ts';
import type { AuthDatabase } from './schema.ts';
import { NodeSqliteDialect } from './sqlite-dialect.ts';

export const AUTH_DB_VARIABLE = 'TURBOSLIDE_AUTH_DB';
/** `d1` selects the Worker's D1 through the proxy (docs/CLOUDFLARE.md 4.2); no other value exists. */
export const ACCOUNTS_VARIABLE = 'TURBOSLIDE_ACCOUNTS';
export const ACCOUNTS_D1 = 'd1';
/** The Postgres variable HR-C#8 retired; `selectAuthDb` refuses it unless D1 is selected. */
const RETIRED_DATABASE_URL = 'DATABASE_URL';

/** The sentence the Sign in row's absence stands on (SPEC-3 7.3), for the facts and the log. */
export const NO_DATABASE_NOTICE =
  'Sign in needs a database on this deployment; the studio runs anonymous only';

export type Env = Readonly<Record<string, string | undefined>>;

export type AuthDbSelection =
  | { kind: 'd1'; host: string; insecure: boolean; reason: string }
  | { kind: 'sqlite'; path: string; reason: string }
  | { kind: 'none'; reason: string };

function isSet(value: string | undefined): value is string {
  return value !== undefined && value !== '';
}

/** The bearer the D1 proxy sends: the database bearer, else the room bearer (a Worker before AUTH-3's rotation takes it). */
export function dbBearerOf(env: Env): string {
  const own = env[DB_BEARER_VARIABLE];
  return isSet(own) ? own : (env[ROOM_BEARER_VARIABLE] ?? '');
}

/**
 * The engine for this process: D1 through the Worker when `TURBOSLIDE_ACCOUNTS=d1` (it needs
 * `TURBOSLIDE_ROOM_HOST` and `TURBOSLIDE_DB_BEARER` or `TURBOSLIDE_ROOM_BEARER`, else a TypeError at the first request in
 * the shape of the SQLite refusal; the bearer is read at open time and never kept in the
 * selection), SQLite when `TURBOSLIDE_AUTH_DB` names a file (relative to `root`, the repository
 * root or the overlay), none otherwise. A hosted process may not name a SQLite file: its
 * filesystem does not outlive the instance (03 D1), so the variable is refused there with a
 * TypeError. The explicit `TURBOSLIDE_ACCOUNTS` wins over `TURBOSLIDE_AUTH_DB`, so a checkout
 * keeps its `TURBOSLIDE_AUTH_DB` row while it tries the Worker's D1. `DATABASE_URL` selected
 * Postgres until HR-C#8; without `TURBOSLIDE_ACCOUNTS=d1` it is refused with a TypeError, so a
 * deployment that still sets it fails loudly instead of running with no accounts database.
 */
export function selectAuthDb(
  env: Env = process.env,
  root: string = process.cwd(),
): AuthDbSelection {
  const accounts = env[ACCOUNTS_VARIABLE]?.trim().toLowerCase();
  if (isSet(accounts)) {
    if (accounts !== ACCOUNTS_D1)
      throw new TypeError(
        `${ACCOUNTS_VARIABLE} takes ${ACCOUNTS_D1} and nothing else, not ${JSON.stringify(accounts)}`,
      );
    const host = env[ROOM_HOST_VARIABLE];
    if (!isSet(host) || dbBearerOf(env) === '')
      throw new TypeError(
        `${ACCOUNTS_VARIABLE}=${ACCOUNTS_D1} needs ${ROOM_HOST_VARIABLE} and ${DB_BEARER_VARIABLE} (or ${ROOM_BEARER_VARIABLE} before the database bearer is set), the realtime Worker's host and bearer (docs/CLOUDFLARE.md 4.2)`,
      );
    const insecure = env[ROOM_INSECURE_VARIABLE] === '1' || env[ROOM_INSECURE_VARIABLE] === 'true';
    return {
      kind: 'd1',
      host: host.trim(),
      insecure,
      reason: `${ACCOUNTS_VARIABLE}=${ACCOUNTS_D1} over ${ROOM_HOST_VARIABLE}=${host.trim()}`,
    };
  }
  if (isSet(env[RETIRED_DATABASE_URL]))
    throw new TypeError(
      `${RETIRED_DATABASE_URL} is no longer read (HR-C#8): Postgres accounts are gone; set ${ACCOUNTS_VARIABLE}=${ACCOUNTS_D1} instead`,
    );
  const file = env[AUTH_DB_VARIABLE];
  if (isSet(file)) {
    if (isSet(env.VERCEL))
      throw new TypeError(
        `${AUTH_DB_VARIABLE} names a SQLite file, which a hosted instance cannot keep; set ${ACCOUNTS_VARIABLE}=${ACCOUNTS_D1} instead`,
      );
    return {
      kind: 'sqlite',
      path: isAbsolute(file) ? file : resolve(root, file),
      reason: `${AUTH_DB_VARIABLE}=${file}`,
    };
  }
  return {
    kind: 'none',
    reason: `neither ${ACCOUNTS_VARIABLE} nor ${AUTH_DB_VARIABLE} is set`,
  };
}

export type AuthDb = {
  kind: 'sqlite' | 'd1';
  db: Kysely<AuthDatabase>;
  /** The raw SQLite handle, for the synchronous key lookup of tokens.ts; absent on D1. */
  sqlite?: DatabaseSync;
  /** The proxy's per process counters on the `d1` kind (`cost.d1.*`, docs/CLOUDFLARE.md 2.2). */
  counters?: () => D1ProxyCounters;
  /**
   * The binding shaped facade over the same client on the `d1` kind, for better-auth's `database`
   * option: the library then runs its own D1 dialect and D1 index introspector for its tables
   * (d1-proxy-dialect.ts, the header's second shape).
   */
  d1?: D1Like;
  close: () => Promise<void>;
};

/**
 * Opens the selected engine; `none` is the caller's to handle (there is nothing to open). The
 * `d1` kind reads the bearer from `env` here, so no selection object ever carries it.
 */
export function openAuthDb(
  selection: Exclude<AuthDbSelection, { kind: 'none' }>,
  env: Env = process.env,
  options: { fetch?: typeof fetch } = {},
): AuthDb {
  if (selection.kind === 'd1') {
    const bearer = dbBearerOf(env);
    const dialect = new D1ProxyDialect({
      host: selection.host,
      bearer,
      insecure: selection.insecure,
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    });
    const db = new Kysely<AuthDatabase>({ dialect });
    return {
      kind: 'd1',
      db,
      counters: () => dialect.client.counters(),
      d1: d1Binding(dialect.client),
      close: () => db.destroy(),
    };
  }
  mkdirSync(dirname(selection.path), { recursive: true });
  const sqlite = new DatabaseSync(selection.path);
  sqlite.exec('pragma journal_mode = wal');
  sqlite.exec('pragma busy_timeout = 5000');
  sqlite.exec('pragma foreign_keys = on');
  const db = new Kysely<AuthDatabase>({ dialect: new NodeSqliteDialect(sqlite) });
  return { kind: 'sqlite', db, sqlite, close: () => db.destroy() };
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
