// The principal record's file backend and the store selection (gslides-parity SPEC-3 7.1):
// Redis hosted through the key value store of @turboslide/identity/principal over the client the
// realtime tier hands the server, and a JSON file per principal under `.turboslide/principals/`
// on a checkout, both with the 90 day sliding TTL. An expired file is removed on the read that
// finds it. Ids are made file safe by replacing every character outside `[A-Za-z0-9_-]`, which
// touches only the agent form `agent:<tokenId>`; the three prefixes keep the names apart.
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { KvClient, PrincipalRecord, PrincipalStore } from '@turboslide/identity/principal';
import {
  isPrincipalExpired,
  kvPrincipalStore,
  newPrincipalRecord,
  parsePrincipalRecord,
} from '@turboslide/identity/principal';

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

export type PrincipalStoreSelection = {
  /** A Redis shaped client when the deployment has one (the `redis` tier); else the file store. */
  kv?: KvClient;
  /** The state folder (`.turboslide/`); the file store lives under `<stateDir>/principals/`. */
  stateDir: string;
};

/** Redis when a client is given, else the file store under the state folder. */
export function selectPrincipalStore(selection: PrincipalStoreSelection): {
  store: PrincipalStore;
  kind: 'redis' | 'file';
} {
  if (selection.kv) return { store: kvPrincipalStore(selection.kv), kind: 'redis' };
  return { store: filePrincipalStore(join(selection.stateDir, PRINCIPALS_DIR)), kind: 'file' };
}
