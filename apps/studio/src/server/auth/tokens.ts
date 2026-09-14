// Agent tokens (gslides-parity SPEC-3 0.23, 7.7; research 09 6.1; report 04 F12): a key is
// `ts_` followed by 32 random bytes in base64url, kept as its SHA-256 at rest with a name, an
// owner, its scopes, an expiry, its last use and a revocation stamp, in the ts_api_key table
// (the columns better-auth's API key plugin keeps, so the rows survive a later swap to
// `@better-auth/api-key`, which this checkout does not carry; b3.md). A token's rights are its
// owner's role intersected with its scopes (`decide()` in packages/identity); this module only
// resolves the bearer to its record and its owner.
//
// The resolver is synchronous on purpose: `requireAgentAuth(request)` (server/auth.ts) is called
// without an await by the routes that exist, and `node:sqlite` reads synchronously. Postgres has
// no synchronous read, so its store answers from a cache refreshed every five seconds and after
// every write in this process; a revocation on another instance lands within that window, the
// same class as the kill switch cache of SPEC-3 0.33.
//
// `TURBOSLIDE_TOKEN` stays the bootstrap admin token: valid for every action while no key record
// exists (today's deployments), for `admin.bootstrap` alone once one does (09 6.1). The per
// checkout token of `.turboslide/token` (7.7) is minted on the first boot of a checkout, printed
// once, and accepted as a bearer on localhost; whether it is required there is
// `TURBOSLIDE_LOCAL_TOKEN=require` this round (b3.md, deviations), `TURBOSLIDE_LOCAL_OPEN=1`
// keeps a test run open either way.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Kysely } from 'kysely';

import type { Scope } from '@turboslide/schema/access';
import { SCOPES } from '@turboslide/schema/access';

import type { AuthDb } from './db.ts';
import type { ApiKeyTable, AuthDatabase } from './schema.ts';

export const TOKEN_PREFIX = 'ts_';
export const TOKEN_BYTES = 32;
export const KEY_NAME_MAX = 80;
export const KEY_ID_BYTES = 12;
/** How often the Postgres store re-reads its keys, and the least gap between two lastUsedAt writes. */
export const KEY_CACHE_MS = 5_000;
export const LAST_USED_MIN_GAP_MS = 60_000;

export type ApiKeyRecord = {
  id: string;
  name: string;
  prefix: string;
  start: string;
  userId: string;
  scopes: Scope[];
  enabled: boolean;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
};

export type CreateKeyInput = {
  userId: string;
  name: string;
  scopes: readonly Scope[];
  expiresAt?: string | null;
  now?: Date;
};

export type ApiKeyStore = {
  create: (input: CreateKeyInput) => Promise<{ record: ApiKeyRecord; secret: string }>;
  list: (userId: string) => Promise<ApiKeyRecord[]>;
  get: (tokenId: string) => Promise<ApiKeyRecord | null>;
  /** Revokes a key; with `userId` only the owner's keys; null when there is no such live key. */
  revoke: (tokenId: string, userId?: string, now?: Date) => Promise<ApiKeyRecord | null>;
  /** The live record of a secret, or null. */
  resolve: (secret: string) => Promise<ApiKeyRecord | null>;
  /** The same, without an await (the route rule); null while a Postgres cache is cold. */
  resolveSync: (secret: string) => ApiKeyRecord | null;
  /** Stamps `lastUsedAt` at most once a minute per key. */
  touch: (tokenId: string, now?: Date) => Promise<void>;
  /** How many keys were ever minted (revoked ones count: the bootstrap rule is one way). */
  countSync: () => number;
};

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

/** A fresh secret: the prefix and 32 random bytes, 46 characters. */
export function mintSecret(random: (n: number) => Uint8Array = (n) => randomBytes(n)): string {
  return `${TOKEN_PREFIX}${base64url(random(TOKEN_BYTES))}`;
}

export function isKeySecret(value: string): boolean {
  return (
    value.startsWith(TOKEN_PREFIX) && /^[A-Za-z0-9_-]{43}$/.test(value.slice(TOKEN_PREFIX.length))
  );
}

/** sha256 hex of the whole secret, the stored form. */
export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

/** The first six characters after the prefix, so a list can name a key without its secret. */
export function keyStart(secret: string): string {
  return secret.slice(TOKEN_PREFIX.length, TOKEN_PREFIX.length + 6);
}

export function newKeyId(random: (n: number) => Uint8Array = (n) => randomBytes(n)): string {
  return `tok_${base64url(random(KEY_ID_BYTES))}`;
}

export function isKeyLive(record: ApiKeyRecord, now: Date = new Date()): boolean {
  if (!record.enabled || record.revokedAt !== null) return false;
  if (record.expiresAt !== null && Date.parse(record.expiresAt) <= now.getTime()) return false;
  return true;
}

export function parseScopes(value: string): Scope[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((s): s is Scope => (SCOPES as readonly unknown[]).includes(s));
}

/** Refuses a name outside 1 to 80 code points or a scope outside the six (SPEC-3 0.23). */
export function checkKeyInput(input: CreateKeyInput): void {
  const name = input.name.trim();
  if (name.length === 0 || [...name].length > KEY_NAME_MAX)
    throw new TypeError(`the key name must be 1 to ${KEY_NAME_MAX} characters`);
  if (input.scopes.length === 0) throw new TypeError('a key needs at least one scope');
  for (const scope of input.scopes)
    if (!(SCOPES as readonly string[]).includes(scope))
      throw new TypeError(`unknown scope ${JSON.stringify(scope)}`);
  if (input.expiresAt !== undefined && input.expiresAt !== null) {
    const t = Date.parse(input.expiresAt);
    if (!Number.isFinite(t)) throw new TypeError('expiresAt must be an ISO date');
    if (t <= (input.now ?? new Date()).getTime()) throw new TypeError('expiresAt is in the past');
  }
}

function rowToRecord(row: ApiKeyTable): ApiKeyRecord {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    start: row.start,
    userId: row.userId,
    scopes: parseScopes(row.scopes),
    enabled: row.enabled === 1,
    expiresAt: row.expiresAt,
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    revokedAt: row.revokedAt,
  };
}

async function insertKey(
  db: Kysely<AuthDatabase>,
  input: CreateKeyInput,
): Promise<{ record: ApiKeyRecord; secret: string }> {
  checkKeyInput(input);
  const now = (input.now ?? new Date()).toISOString();
  const secret = mintSecret();
  const row: ApiKeyTable = {
    id: newKeyId(),
    name: input.name.trim(),
    prefix: TOKEN_PREFIX,
    start: keyStart(secret),
    hash: hashSecret(secret),
    userId: input.userId,
    scopes: JSON.stringify([...new Set(input.scopes)]),
    enabled: 1,
    expiresAt: input.expiresAt ?? null,
    lastUsedAt: null,
    createdAt: now,
    updatedAt: now,
    revokedAt: null,
  };
  await db.insertInto('ts_api_key').values(row).execute();
  return { record: rowToRecord(row), secret };
}

/**
 * The store over the identity database. SQLite reads the key synchronously through the raw
 * handle; Postgres keeps a cache of every live key, refreshed every KEY_CACHE_MS and after each
 * write here.
 */
export function dbApiKeyStore(auth: AuthDb, now: () => Date = () => new Date()): ApiKeyStore {
  const { db } = auth;
  const cache = new Map<string, ApiKeyRecord>();
  let cachedCount = 0;
  let refreshedAt = 0;
  let refreshing: Promise<void> | null = null;
  const lastTouch = new Map<string, number>();

  const refresh = (): Promise<void> => {
    refreshing ??= (async () => {
      const rows = await db.selectFrom('ts_api_key').selectAll().execute();
      cache.clear();
      for (const row of rows) cache.set(row.hash, rowToRecord(row));
      cachedCount = rows.length;
      refreshedAt = now().getTime();
    })().finally(() => {
      refreshing = null;
    });
    return refreshing;
  };
  const refreshIfStale = (): void => {
    if (auth.kind === 'sqlite') return;
    if (now().getTime() - refreshedAt >= KEY_CACHE_MS) void refresh().catch(() => undefined);
  };
  if (auth.kind === 'postgres') void refresh().catch(() => undefined);

  const syncRow = (hash: string): ApiKeyRecord | null => {
    if (auth.sqlite !== undefined) {
      try {
        const row = auth.sqlite.prepare('select * from ts_api_key where hash = ?').get(hash) as
          ApiKeyTable | undefined;
        return row === undefined ? null : rowToRecord(row);
      } catch {
        // the table is not there yet (a request before the migration ran): no key
        return null;
      }
    }
    refreshIfStale();
    return cache.get(hash) ?? null;
  };

  const store: ApiKeyStore = {
    async create(input) {
      const created = await insertKey(db, input);
      if (auth.kind === 'postgres') await refresh();
      return created;
    },
    async list(userId) {
      const rows = await db
        .selectFrom('ts_api_key')
        .selectAll()
        .where('userId', '=', userId)
        .orderBy('createdAt', 'asc')
        .execute();
      return rows.map(rowToRecord);
    },
    async get(tokenId) {
      const row = await db
        .selectFrom('ts_api_key')
        .selectAll()
        .where('id', '=', tokenId)
        .executeTakeFirst();
      return row === undefined ? null : rowToRecord(row);
    },
    async revoke(tokenId, userId, at = now()) {
      const existing = await store.get(tokenId);
      if (existing === null || existing.revokedAt !== null) return null;
      if (userId !== undefined && existing.userId !== userId) return null;
      const stamp = at.toISOString();
      await db
        .updateTable('ts_api_key')
        .set({ revokedAt: stamp, enabled: 0, updatedAt: stamp })
        .where('id', '=', tokenId)
        .execute();
      if (auth.kind === 'postgres') await refresh();
      return { ...existing, revokedAt: stamp, enabled: false, updatedAt: stamp };
    },
    async resolve(secret) {
      if (!isKeySecret(secret)) return null;
      const row = await db
        .selectFrom('ts_api_key')
        .selectAll()
        .where('hash', '=', hashSecret(secret))
        .executeTakeFirst();
      if (row === undefined) return null;
      const record = rowToRecord(row);
      return isKeyLive(record, now()) ? record : null;
    },
    resolveSync(secret) {
      if (!isKeySecret(secret)) return null;
      const record = syncRow(hashSecret(secret));
      return record !== null && isKeyLive(record, now()) ? record : null;
    },
    async touch(tokenId, at = now()) {
      const last = lastTouch.get(tokenId) ?? 0;
      if (at.getTime() - last < LAST_USED_MIN_GAP_MS) return;
      lastTouch.set(tokenId, at.getTime());
      await db
        .updateTable('ts_api_key')
        .set({ lastUsedAt: at.toISOString() })
        .where('id', '=', tokenId)
        .execute();
    },
    countSync() {
      if (auth.sqlite !== undefined) {
        try {
          const row = auth.sqlite.prepare('select count(*) as n from ts_api_key').get() as
            { n: number | bigint } | undefined;
          return Number(row?.n ?? 0);
        } catch {
          return 0;
        }
      }
      refreshIfStale();
      return cachedCount;
    },
  };
  return store;
}

/** An in memory store with the same rules, for tests and a database free process. */
export function memoryApiKeyStore(now: () => Date = () => new Date()): ApiKeyStore {
  const rows = new Map<string, ApiKeyTable>();
  const record = (row: ApiKeyTable): ApiKeyRecord => rowToRecord(row);
  const store: ApiKeyStore = {
    create(input) {
      checkKeyInput(input);
      const stamp = (input.now ?? now()).toISOString();
      const secret = mintSecret();
      const row: ApiKeyTable = {
        id: newKeyId(),
        name: input.name.trim(),
        prefix: TOKEN_PREFIX,
        start: keyStart(secret),
        hash: hashSecret(secret),
        userId: input.userId,
        scopes: JSON.stringify([...new Set(input.scopes)]),
        enabled: 1,
        expiresAt: input.expiresAt ?? null,
        lastUsedAt: null,
        createdAt: stamp,
        updatedAt: stamp,
        revokedAt: null,
      };
      rows.set(row.id, row);
      return Promise.resolve({ record: record(row), secret });
    },
    list: (userId) =>
      Promise.resolve(
        [...rows.values()]
          .filter((row) => row.userId === userId)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          .map(record),
      ),
    get: (tokenId) => Promise.resolve(rows.has(tokenId) ? record(rows.get(tokenId)!) : null),
    revoke(tokenId, userId, at = now()) {
      const row = rows.get(tokenId);
      if (row === undefined || row.revokedAt !== null) return Promise.resolve(null);
      if (userId !== undefined && row.userId !== userId) return Promise.resolve(null);
      const stamp = at.toISOString();
      row.revokedAt = stamp;
      row.enabled = 0;
      row.updatedAt = stamp;
      return Promise.resolve(record(row));
    },
    resolve: (secret) => Promise.resolve(store.resolveSync(secret)),
    resolveSync(secret) {
      if (!isKeySecret(secret)) return null;
      const hash = hashSecret(secret);
      for (const row of rows.values())
        if (row.hash === hash) {
          const rec = record(row);
          return isKeyLive(rec, now()) ? rec : null;
        }
      return null;
    },
    touch(tokenId, at = now()) {
      const row = rows.get(tokenId);
      if (row !== undefined) row.lastUsedAt = at.toISOString();
      return Promise.resolve();
    },
    countSync: () => rows.size,
  };
  return store;
}

/** A store for a process without a database: no keys, so the static bearer keeps its round one meaning. */
export function noApiKeyStore(): ApiKeyStore {
  const refused = (): Promise<never> =>
    Promise.reject(new RangeError('API keys need a database on this deployment (SPEC-3 7.3)'));
  return {
    create: refused,
    list: () => Promise.resolve([]),
    get: () => Promise.resolve(null),
    revoke: () => Promise.resolve(null),
    resolve: () => Promise.resolve(null),
    resolveSync: () => null,
    touch: () => Promise.resolve(),
    countSync: () => 0,
  };
}

// ------------------------------------------------------------------------------------------
// The bearer rule

export const STATIC_TOKEN_ENV = 'TURBOSLIDE_TOKEN';
export const LOCAL_TOKEN_MODE_ENV = 'TURBOSLIDE_LOCAL_TOKEN';
export const LOCAL_OPEN_ENV = 'TURBOSLIDE_LOCAL_OPEN';
export const CHECKOUT_TOKEN_FILE = 'token';
export const BOOTSTRAP_ACTION = 'admin.bootstrap';

export type BearerResolution =
  | { kind: 'api-key'; record: ApiKeyRecord }
  | { kind: 'bootstrap'; bootstrapOnly: boolean }
  | { kind: 'checkout' }
  | { kind: 'none' }
  | { kind: 'refused'; reason: 'unknown_key' | 'not_a_key' };

export type BearerDeps = {
  env?: Readonly<Record<string, string | undefined>>;
  keys?: ApiKeyStore | null;
  /** The per checkout token, when the process runs on a checkout. */
  checkoutToken?: string | null;
};

function sameSecret(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * What a bearer is: an API key record, the static bootstrap bearer (with whether it is now
 * confined to `admin.bootstrap`), the per checkout token, none, or a refusal. Synchronous.
 */
export function resolveBearerSync(
  bearer: string | undefined,
  deps: BearerDeps = {},
): BearerResolution {
  const env = deps.env ?? process.env;
  if (bearer === undefined || bearer === '') return { kind: 'none' };
  const keys = deps.keys ?? null;
  if (isKeySecret(bearer)) {
    const record = keys?.resolveSync(bearer) ?? null;
    return record === null
      ? { kind: 'refused', reason: 'unknown_key' }
      : { kind: 'api-key', record };
  }
  const staticToken = env[STATIC_TOKEN_ENV];
  if (staticToken !== undefined && staticToken !== '' && sameSecret(bearer, staticToken))
    return { kind: 'bootstrap', bootstrapOnly: (keys?.countSync() ?? 0) > 0 };
  if (
    deps.checkoutToken !== undefined &&
    deps.checkoutToken !== null &&
    sameSecret(bearer, deps.checkoutToken)
  )
    return { kind: 'checkout' };
  return { kind: 'refused', reason: 'not_a_key' };
}

/**
 * The per checkout token (SPEC-3 7.7): read from `<stateDir>/token`, minted on the first call
 * (64 hex characters, mode 0600) and handed to `announce` once so the person who started the dev
 * server sees it; never logged afterwards.
 */
export function checkoutToken(
  stateDir: string,
  announce: (line: string) => void = () => undefined,
): string {
  const path = join(stateDir, CHECKOUT_TOKEN_FILE);
  if (existsSync(path)) {
    const stored = readFileSync(path, 'utf8').trim();
    if (stored.length >= 32) return stored;
  }
  const minted = randomBytes(32).toString('hex');
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(path, `${minted}\n`, { mode: 0o600 });
  announce(
    `turboslide: the agent surface of this checkout takes the token in ${path} as its bearer (SPEC-3 7.7); it is printed once, here, and never again: ${minted}`,
  );
  return minted;
}

/** Whether a checkout's localhost surface requires the per checkout token this round. */
export function localTokenRequired(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  if (env[LOCAL_OPEN_ENV] === '1' || env[LOCAL_OPEN_ENV] === 'true') return false;
  return env[LOCAL_TOKEN_MODE_ENV]?.trim().toLowerCase() === 'require';
}
