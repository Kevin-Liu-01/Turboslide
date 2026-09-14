// The identity database's tables as Kysely reads them (gslides-parity SPEC-3 7.3, 7.4, 7.7;
// research 03 D2, E2, F): better-auth's core tables (`user`, `session`, `account`,
// `verification`) and its device authorization table, which the library migrates itself
// (db.ts runs `getMigrations`), and Turboslide's own tables, migrated here with Kysely's schema
// builder so one statement set serves SQLite and Postgres:
//
//   ts_alias       anonymousId -> userId, the link written when a signed in session first arrives
//                  in a browser that carried an anonymous cookie (7.4); history is never rewritten
//   ts_api_key     the agent tokens (7.7): a `ts_` key hashed with SHA-256 at rest, its owner, its
//                  scopes, expiry, last use and revocation. The same columns better-auth's API
//                  key plugin keeps, so a later swap to `@better-auth/api-key` reads the rows
//   ts_profile     what better-auth's user row does not hold: the admin flag, the avatar choice,
//                  the avatar key prefix and the deletion stamp (7.4, 7.6)
//   ts_mail        the captured outgoing mail under TURBOSLIDE_MAIL=capture (11.4), read by
//                  admin.mail.list
//   ts_quota       small counters with a reset time (avatar uploads per identity per day, device
//                  code attempts), so a second instance sees the same count
//
// Booleans are integers and dates ISO strings in every table, on both engines, so a row reads the
// same whatever the dialect (node:sqlite binds neither type).
import type { Kysely } from 'kysely';

export type UserTable = {
  id: string;
  name: string;
  email: string;
  emailVerified: number | boolean;
  image: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

export type SessionTable = {
  id: string;
  expiresAt: string | Date;
  token: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  ipAddress: string | null;
  userAgent: string | null;
  userId: string;
};

export type AccountTable = {
  id: string;
  accountId: string;
  providerId: string;
  userId: string;
  accessToken: string | null;
  refreshToken: string | null;
  idToken: string | null;
  accessTokenExpiresAt: string | Date | null;
  refreshTokenExpiresAt: string | Date | null;
  scope: string | null;
  password: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

export type VerificationTable = {
  id: string;
  identifier: string;
  value: string;
  expiresAt: string | Date;
  createdAt: string | Date;
  updatedAt: string | Date;
};

export type AliasTable = {
  anonymousId: string;
  userId: string;
  linkedAt: string;
};

export type ApiKeyTable = {
  id: string;
  name: string;
  prefix: string;
  /** The first six characters after the prefix, so a list can name a key without its secret. */
  start: string;
  /** sha256 hex of the whole key. */
  hash: string;
  userId: string;
  /** A JSON array of scopes. */
  scopes: string;
  enabled: number;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
};

export type ProfileTable = {
  userId: string;
  admin: number;
  /** The avatar choice as JSON (SPEC-3 7.6), null for the default. */
  avatar: string | null;
  /** The random 128 bit prefix of the picture files, rotated on every change (10 F43). */
  avatarKey: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MailTable = {
  id: string;
  kind: string;
  toAddress: string;
  subject: string;
  text: string;
  html: string | null;
  /** A JSON object of the headers the mail carried (List-Unsubscribe and its companion). */
  headers: string;
  createdAt: string;
};

export type QuotaTable = {
  key: string;
  count: number;
  resetAt: string;
};

export type AuthDatabase = {
  user: UserTable;
  session: SessionTable;
  account: AccountTable;
  verification: VerificationTable;
  ts_alias: AliasTable;
  ts_api_key: ApiKeyTable;
  ts_profile: ProfileTable;
  ts_mail: MailTable;
  ts_quota: QuotaTable;
};

/** The names of Turboslide's own tables, in creation order. */
export const TURBOSLIDE_TABLES = [
  'ts_alias',
  'ts_api_key',
  'ts_profile',
  'ts_mail',
  'ts_quota',
] as const;

/** Creates Turboslide's tables when they are missing; idempotent on both engines. */
export async function migrateTurboslideTables(db: Kysely<AuthDatabase>): Promise<void> {
  await db.schema
    .createTable('ts_alias')
    .ifNotExists()
    .addColumn('anonymousId', 'text', (col) => col.primaryKey())
    .addColumn('userId', 'text', (col) => col.notNull())
    .addColumn('linkedAt', 'text', (col) => col.notNull())
    .execute();
  await db.schema
    .createIndex('ts_alias_user')
    .ifNotExists()
    .on('ts_alias')
    .column('userId')
    .execute();
  await db.schema
    .createTable('ts_api_key')
    .ifNotExists()
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('prefix', 'text', (col) => col.notNull())
    .addColumn('start', 'text', (col) => col.notNull())
    .addColumn('hash', 'text', (col) => col.notNull().unique())
    .addColumn('userId', 'text', (col) => col.notNull())
    .addColumn('scopes', 'text', (col) => col.notNull())
    .addColumn('enabled', 'integer', (col) => col.notNull().defaultTo(1))
    .addColumn('expiresAt', 'text')
    .addColumn('lastUsedAt', 'text')
    .addColumn('createdAt', 'text', (col) => col.notNull())
    .addColumn('updatedAt', 'text', (col) => col.notNull())
    .addColumn('revokedAt', 'text')
    .execute();
  await db.schema
    .createIndex('ts_api_key_user')
    .ifNotExists()
    .on('ts_api_key')
    .column('userId')
    .execute();
  await db.schema
    .createTable('ts_profile')
    .ifNotExists()
    .addColumn('userId', 'text', (col) => col.primaryKey())
    .addColumn('admin', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('avatar', 'text')
    .addColumn('avatarKey', 'text')
    .addColumn('deletedAt', 'text')
    .addColumn('createdAt', 'text', (col) => col.notNull())
    .addColumn('updatedAt', 'text', (col) => col.notNull())
    .execute();
  await db.schema
    .createTable('ts_mail')
    .ifNotExists()
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('kind', 'text', (col) => col.notNull())
    .addColumn('toAddress', 'text', (col) => col.notNull())
    .addColumn('subject', 'text', (col) => col.notNull())
    .addColumn('text', 'text', (col) => col.notNull())
    .addColumn('html', 'text')
    .addColumn('headers', 'text', (col) => col.notNull().defaultTo('{}'))
    .addColumn('createdAt', 'text', (col) => col.notNull())
    .execute();
  await db.schema
    .createTable('ts_quota')
    .ifNotExists()
    .addColumn('key', 'text', (col) => col.primaryKey())
    .addColumn('count', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('resetAt', 'text', (col) => col.notNull())
    .execute();
}

/** An ISO stamp from a value either engine returns for a date column. */
export function stampOf(value: string | Date | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : value;
}

/** A boolean from a value either engine returns for a boolean column. */
export function flagOf(value: number | boolean | null | undefined): boolean {
  return value === true || value === 1;
}
