// The principal record's backends and the store selection (gslides-parity SPEC-3 7.1;
// docs/CLOUDFLARE.md 4.2): the `ts_principal` table on D1 when the account database is the
// Worker's (`TURBOSLIDE_ACCOUNTS=d1`), one database for every instance, so a name typed on one
// instance is the name on the next (the row `realtime.departed-guest.name-stable`); Redis hosted
// through the key value store of @turboslide/identity/principal over the client the redis tier
// hands the server; and a JSON file per principal under `.turboslide/principals/` on a checkout.
// Every backend keeps the 90 day sliding TTL. An expired file or row is removed on the read that
// finds it. Ids are made file safe by replacing every character outside `[A-Za-z0-9_-]`, which
// touches only the agent form `agent:<tokenId>`; the three prefixes keep the names apart.
//
// The D1 store writes little on purpose (CLOUDFLARE.md 4.1, `cost.d1.writes`): `touch` writes
// `last_seen_at` only when the stored stamp is older than an hour, and `get` serves a record from
// a 2 s per instance cache, so the identity reads of a request after the first cost no statement.
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Kysely } from 'kysely';

import type { KvClient, PrincipalRecord, PrincipalStore } from '@turboslide/identity/principal';
import {
  isPrincipalExpired,
  kvPrincipalStore,
  newPrincipalRecord,
  parsePrincipalRecord,
  principalExpiresAt,
} from '@turboslide/identity/principal';

import type { AuthDatabase } from './schema.ts';

export const PRINCIPALS_DIR = 'principals';

export function principalFileName(principalId: string): string {
  return `${principalId.replace(/[^A-Za-z0-9_-]/g, '_')}.json`;
}

/** The parsed file, `missing` when there is none, `invalid` when the bytes are not JSON. */
function readJson(
  path: string,
): { state: 'ok'; value: unknown } | { state: 'missing' | 'invalid' } {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return { state: 'missing' };
  }
  try {
    return { state: 'ok', value: JSON.parse(text) };
  } catch {
    return { state: 'invalid' };
  }
}

function writeJsonAtomic(path: string, value: unknown): void {
  const tmp = `${path}.${process.pid}.${Date.now().toString(36)}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, path);
}

function unlinkQuiet(path: string): void {
  try {
    unlinkSync(path);
  } catch {
    // Already gone.
  }
}

/** `<dir>/<principalId>.json` per record; the TTL is the record's own `lastSeenAt` plus 90 days. */
export function filePrincipalStore(dir: string): PrincipalStore {
  const pathOf = (principalId: string): string => join(dir, principalFileName(principalId));
  const store: PrincipalStore = {
    async get(principalId, now = new Date()) {
      const path = pathOf(principalId);
      const read = readJson(path);
      if (read.state !== 'ok') {
        if (read.state === 'invalid') unlinkQuiet(path);
        return null;
      }
      const record = parsePrincipalRecord(read.value);
      if (record === null || record.principalId !== principalId) {
        unlinkQuiet(path);
        return null;
      }
      if (isPrincipalExpired(record, now)) {
        unlinkQuiet(path);
        return null;
      }
      return record;
    },
    async put(record) {
      mkdirSync(dir, { recursive: true });
      writeJsonAtomic(pathOf(record.principalId), record);
    },
    async touch(principalId, now = new Date(), create = false) {
      const existing = await store.get(principalId, now);
      const record = existing ?? (create ? newPrincipalRecord(principalId, now) : null);
      if (record === null) return null;
      const touched: PrincipalRecord = { ...record, lastSeenAt: now.toISOString() };
      await store.put(touched);
      return touched;
    },
    async delete(principalId) {
      unlinkQuiet(pathOf(principalId));
    },
  };
  return store;
}

// ------------------------------------------------------------------------------------------
// The D1 store (docs/CLOUDFLARE.md 4.2)

/** `touch` rewrites `last_seen_at` only when the stored stamp is older than this. */
export const PRINCIPAL_TOUCH_MIN_GAP_MS = 60 * 60 * 1000;
/** How long a read record is served from the instance's memory before D1 is asked again. */
export const PRINCIPAL_READ_CACHE_MS = 2_000;

export type D1PrincipalStoreOptions = {
  now?: () => number;
  /** The read cache's life; 0 turns it off (a test). */
  cacheMs?: number;
};

/**
 * The store over `ts_principal`: `get` is one indexed row (the primary key), `put` one upsert,
 * `touch` one row at most once an hour per principal, `delete` one row. The record is the JSON of
 * the `PrincipalRecord`; `expires_at` is its `lastSeenAt` plus the TTL, so the read filters an
 * expired row without parsing it and removes it on the read that finds it.
 */
export function d1PrincipalStore(
  db: Kysely<AuthDatabase>,
  options: D1PrincipalStoreOptions = {},
): PrincipalStore {
  const clock = options.now ?? (() => Date.now());
  const cacheMs = options.cacheMs ?? PRINCIPAL_READ_CACHE_MS;
  const cache = new Map<string, { at: number; record: PrincipalRecord | null }>();
  const remember = (principalId: string, record: PrincipalRecord | null): void => {
    if (cacheMs > 0) cache.set(principalId, { at: clock(), record });
  };
  const rowOf = (record: PrincipalRecord) => ({
    principal_id: record.principalId,
    record: JSON.stringify(record),
    last_seen_at: Date.parse(record.lastSeenAt),
    expires_at: principalExpiresAt(record),
  });
  const write = async (record: PrincipalRecord): Promise<void> => {
    const row = rowOf(record);
    await db
      .insertInto('ts_principal')
      .values(row)
      .onConflict((oc) =>
        oc.column('principal_id').doUpdateSet({
          record: row.record,
          last_seen_at: row.last_seen_at,
          expires_at: row.expires_at,
        }),
      )
      .execute();
    remember(record.principalId, record);
  };
  const read = async (principalId: string, now: Date): Promise<PrincipalRecord | null> => {
    const hit = cache.get(principalId);
    if (hit !== undefined && clock() - hit.at < cacheMs) {
      if (hit.record !== null && isPrincipalExpired(hit.record, now)) return null;
      return hit.record;
    }
    const row = await db
      .selectFrom('ts_principal')
      .select(['record', 'expires_at'])
      .where('principal_id', '=', principalId)
      .executeTakeFirst();
    if (row === undefined) {
      remember(principalId, null);
      return null;
    }
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(row.record);
    } catch {
      parsed = null;
    }
    const record = parsePrincipalRecord(parsed);
    if (
      record === null ||
      record.principalId !== principalId ||
      Number(row.expires_at) <= now.getTime() ||
      isPrincipalExpired(record, now)
    ) {
      await db.deleteFrom('ts_principal').where('principal_id', '=', principalId).execute();
      remember(principalId, null);
      return null;
    }
    remember(principalId, record);
    return record;
  };
  const store: PrincipalStore = {
    get: (principalId, now = new Date()) => read(principalId, now),
    put: (record) => write(record),
    async touch(principalId, now = new Date(), create = false) {
      const existing = await read(principalId, now);
      if (existing === null) {
        if (!create) return null;
        const fresh = newPrincipalRecord(principalId, now);
        await write(fresh);
        return fresh;
      }
      /* the hourly rule (CLOUDFLARE.md 4.1): a record seen within the hour is handed back as
         stored; the TTL has 90 days of slack for an hour of staleness */
      if (now.getTime() - Date.parse(existing.lastSeenAt) < PRINCIPAL_TOUCH_MIN_GAP_MS)
        return existing;
      const touched: PrincipalRecord = { ...existing, lastSeenAt: now.toISOString() };
      await write(touched);
      return touched;
    },
    async delete(principalId) {
      await db.deleteFrom('ts_principal').where('principal_id', '=', principalId).execute();
      cache.delete(principalId);
    },
  };
  return store;
}

// ------------------------------------------------------------------------------------------
// The selection

const D1_BINDING = Symbol.for('turboslide.studio.principals.d1');

function d1Holder(): Record<symbol, PrincipalStore | undefined> {
  return globalThis as unknown as Record<symbol, PrincipalStore | undefined>;
}

/**
 * Binds the process's D1 principal store, so every `selectPrincipalStore` caller of the process
 * (the identity runtime, the room's state) reads one table on the `d1` engine. The identity
 * runtime binds it when the process runtime is built (identity.ts `identityRuntime`), in the
 * shape of R1's `bindIdentityRedis`; a store built for a test runtime binds nothing. `undefined`
 * unbinds.
 */
export function bindPrincipalD1(store: PrincipalStore | undefined): void {
  d1Holder()[D1_BINDING] = store;
}

export function boundPrincipalD1(): PrincipalStore | undefined {
  return d1Holder()[D1_BINDING];
}

export type PrincipalStoreSelection = {
  /** A Redis shaped client when the deployment has one (the `redis` tier); else the file store. */
  kv?: KvClient;
  /** The state folder (`.turboslide/`); the file store lives under `<stateDir>/principals/`. */
  stateDir: string;
  /** The account database when it is D1; else the process binding (`bindPrincipalD1`) is read at the call. */
  d1?: Kysely<AuthDatabase>;
};

/**
 * D1 when the account database is the Worker's (given, or bound to the process), Redis when a
 * client is given, else the file store under the state folder. The store picks at each call, so
 * a store built before the identity runtime bound D1 follows it.
 */
export function selectPrincipalStore(selection: PrincipalStoreSelection): {
  store: PrincipalStore;
  kind: 'd1' | 'redis' | 'file';
} {
  if (selection.d1) return { store: d1PrincipalStore(selection.d1), kind: 'd1' };
  const own: PrincipalStore = selection.kv
    ? kvPrincipalStore(selection.kv)
    : filePrincipalStore(join(selection.stateDir, PRINCIPALS_DIR));
  const pick = (): PrincipalStore => boundPrincipalD1() ?? own;
  const store: PrincipalStore = {
    get: (principalId, now) => pick().get(principalId, now),
    put: (record) => pick().put(record),
    touch: (principalId, now, create) => pick().touch(principalId, now, create),
    delete: (principalId) => pick().delete(principalId),
  };
  return {
    store,
    kind: boundPrincipalD1() !== undefined ? 'd1' : selection.kv ? 'redis' : 'file',
  };
}
