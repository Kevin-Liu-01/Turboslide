import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';

import { newPrincipalRecord } from '@turboslide/identity/principal';

import { memoryAuthDb } from './db.ts';
import type { AuthDb } from './db.ts';
import {
  PRINCIPALS_DIR,
  PRINCIPAL_READ_CACHE_MS,
  PRINCIPAL_TOUCH_MIN_GAP_MS,
  bindPrincipalD1,
  boundPrincipalD1,
  d1PrincipalStore,
  filePrincipalStore,
  principalFileName,
  selectPrincipalStore,
} from './principal.ts';

const tmp = mkdtempSync(join(tmpdir(), 'turboslide-principals-'));
const open: AuthDb[] = [];
afterAll(async () => {
  while (open.length > 0) await open.pop()?.close();
  rmSync(tmp, { recursive: true, force: true });
});

const ID = 'anon_9f1c2a3e-4b5d-4e6f-8a9b-0c1d2e3f4a5b';
const T0 = Date.parse('2026-09-13T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

describe('the file store', () => {
  test('file names are safe for the three id forms', () => {
    expect(principalFileName(ID)).toBe(`${ID}.json`);
    expect(principalFileName('usr_01JABC')).toBe('usr_01JABC.json');
    expect(principalFileName('agent:key_7')).toBe('agent_key_7.json');
  });

  test('touch creates, get reads, the TTL slides and an expired file is removed', async () => {
    const dir = join(tmp, 'a');
    const store = filePrincipalStore(dir);
    expect(await store.get(ID, new Date(T0))).toBeNull();
    expect(await store.touch(ID, new Date(T0))).toBeNull();
    const created = await store.touch(ID, new Date(T0), true);
    expect(created?.principalId).toBe(ID);
    const path = join(dir, principalFileName(ID));
    expect(existsSync(path)).toBe(true);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(path, 'utf8')).lastSeenAt).toBe(new Date(T0).toISOString());

    const touched = await store.touch(ID, new Date(T0 + 60 * DAY));
    expect(touched?.lastSeenAt).toBe(new Date(T0 + 60 * DAY).toISOString());
    expect(await store.get(ID, new Date(T0 + 149 * DAY))).not.toBeNull();
    expect(await store.get(ID, new Date(T0 + 150 * DAY))).toBeNull();
    expect(existsSync(path)).toBe(false);
    expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  test('put writes the record as given and delete removes it', async () => {
    const dir = join(tmp, 'b');
    const store = filePrincipalStore(dir);
    const record = newPrincipalRecord(ID, new Date(T0));
    record.name = 'Maya Chen';
    await store.put(record);
    expect(await store.get(ID, new Date(T0))).toEqual(record);
    await store.delete(ID);
    expect(await store.get(ID, new Date(T0))).toBeNull();
    await store.delete(ID);
  });

  test('bad bytes and a record under the wrong name are removed on read', async () => {
    const dir = join(tmp, 'c');
    const store = filePrincipalStore(dir);
    await store.put(newPrincipalRecord(ID, new Date(T0)));
    const path = join(dir, principalFileName(ID));
    writeFileSync(path, '{not json');
    expect(await store.get(ID, new Date(T0))).toBeNull();
    expect(existsSync(path)).toBe(false);
    const other = newPrincipalRecord('anon_1f1c2a3e-4b5d-4e6f-8a9b-0c1d2e3f4a5b', new Date(T0));
    writeFileSync(path, JSON.stringify(other));
    expect(await store.get(ID, new Date(T0))).toBeNull();
    expect(existsSync(path)).toBe(false);
  });

  test('selectPrincipalStore picks D1 when given or bound to the process, Redis when a client exists, else the file store', async () => {
    const stateDir = join(tmp, 'state-d1');
    const auth = await memoryAuthDb();
    open.push(auth);
    expect(selectPrincipalStore({ stateDir, d1: auth.db }).kind).toBe('d1');
    /* the binding, read at the call: a store built before it follows it */
    const before = selectPrincipalStore({ stateDir });
    expect(before.kind).toBe('file');
    bindPrincipalD1(d1PrincipalStore(auth.db, { cacheMs: 0 }));
    try {
      expect(boundPrincipalD1()).toBeDefined();
      expect(selectPrincipalStore({ stateDir }).kind).toBe('d1');
      await before.store.touch(ID, new Date(T0), true);
      expect(auth.db.selectFrom('ts_principal').select('principal_id').execute() !== null).toBe(
        true,
      );
      expect(await auth.db.selectFrom('ts_principal').select('principal_id').execute()).toEqual([
        { principal_id: ID },
      ]);
      expect(existsSync(join(stateDir, PRINCIPALS_DIR, principalFileName(ID)))).toBe(false);
    } finally {
      bindPrincipalD1(undefined);
    }
    expect(selectPrincipalStore({ stateDir }).kind).toBe('file');
  });

  test('selectPrincipalStore picks Redis when a client exists, else the file store under the state folder', async () => {
    const stateDir = join(tmp, 'state');
    const file = selectPrincipalStore({ stateDir });
    expect(file.kind).toBe('file');
    await file.store.touch(ID, new Date(T0), true);
    expect(existsSync(join(stateDir, PRINCIPALS_DIR, principalFileName(ID)))).toBe(true);
    const calls: string[] = [];
    const redis = selectPrincipalStore({
      stateDir,
      kv: {
        async get(key) {
          calls.push(`get ${key}`);
          return null;
        },
        async set(key) {
          calls.push(`set ${key}`);
        },
        async del(key) {
          calls.push(`del ${key}`);
        },
      },
    });
    expect(redis.kind).toBe('redis');
    await redis.store.touch(ID, new Date(T0), true);
    expect(calls).toEqual([`get principal:${ID}`, `set principal:${ID}`]);
  });
});

describe('the D1 store (docs/CLOUDFLARE.md 4.2)', () => {
  test('get is null for a missing or expired row, put upserts, touch creates and rewrites only past an hour, delete removes', async () => {
    const auth = await memoryAuthDb();
    open.push(auth);
    let clock = T0;
    const store = d1PrincipalStore(auth.db, { now: () => clock });
    const rows = () => auth.db.selectFrom('ts_principal').selectAll().execute();
    expect(await store.get(ID, new Date(T0))).toBeNull();
    expect(await store.touch(ID, new Date(T0))).toBeNull();
    const created = await store.touch(ID, new Date(T0), true);
    expect(created?.principalId).toBe(ID);
    expect(created?.lastSeenAt).toBe(new Date(T0).toISOString());
    const stored = await rows();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.last_seen_at).toBe(T0);
    expect(stored[0]?.expires_at).toBe(T0 + 90 * DAY);
    /* inside the hour: the stored record is handed back and no row changes */
    clock = T0 + 10 * 60_000;
    const inside = await store.touch(ID, new Date(clock), true);
    expect(inside?.lastSeenAt).toBe(new Date(T0).toISOString());
    expect((await rows())[0]?.last_seen_at).toBe(T0);
    /* past the hour: the row is rewritten */
    clock = T0 + PRINCIPAL_TOUCH_MIN_GAP_MS + 1;
    const past = await store.touch(ID, new Date(clock), true);
    expect(past?.lastSeenAt).toBe(new Date(clock).toISOString());
    expect((await rows())[0]?.last_seen_at).toBe(clock);
    /* put writes the record as given and the read cache follows it */
    const record = newPrincipalRecord(ID, new Date(clock));
    record.name = 'Maya Chen';
    await store.put(record);
    expect((await store.get(ID, new Date(clock)))?.name).toBe('Maya Chen');
    /* the 2 s cache: a row changed under the store is read after the cache's life */
    await auth.db
      .updateTable('ts_principal')
      .set({ record: JSON.stringify({ ...record, name: 'Written elsewhere' }) })
      .where('principal_id', '=', ID)
      .execute();
    expect((await store.get(ID, new Date(clock)))?.name).toBe('Maya Chen');
    clock += PRINCIPAL_READ_CACHE_MS + 1;
    expect((await store.get(ID, new Date(clock)))?.name).toBe('Written elsewhere');
    /* expiry: 90 days after the last stamp the row reads as missing and leaves */
    const expired = new Date(Date.parse(record.lastSeenAt) + 90 * DAY);
    clock = expired.getTime();
    expect(await store.get(ID, expired)).toBeNull();
    expect(await rows()).toEqual([]);
    await store.put(record);
    await store.delete(ID);
    expect(await rows()).toEqual([]);
    expect(await store.get(ID, new Date(clock))).toBeNull();
  });

  test('a row whose bytes are not a record, or a record under another id, is removed on read', async () => {
    const auth = await memoryAuthDb();
    open.push(auth);
    const store = d1PrincipalStore(auth.db, { cacheMs: 0 });
    await auth.db
      .insertInto('ts_principal')
      .values({ principal_id: ID, record: '{not json', last_seen_at: T0, expires_at: T0 + DAY })
      .execute();
    expect(await store.get(ID, new Date(T0))).toBeNull();
    expect(await auth.db.selectFrom('ts_principal').selectAll().execute()).toEqual([]);
    const other = newPrincipalRecord('anon_1f1c2a3e-4b5d-4e6f-8a9b-0c1d2e3f4a5b', new Date(T0));
    await auth.db
      .insertInto('ts_principal')
      .values({
        principal_id: ID,
        record: JSON.stringify(other),
        last_seen_at: T0,
        expires_at: T0 + DAY,
      })
      .execute();
    expect(await store.get(ID, new Date(T0))).toBeNull();
    expect(await auth.db.selectFrom('ts_principal').selectAll().execute()).toEqual([]);
  });
});
