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

import {
  PRINCIPALS_DIR,
  filePrincipalStore,
  principalFileName,
  selectPrincipalStore,
} from './principal.ts';

const tmp = mkdtempSync(join(tmpdir(), 'turboslide-principals-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

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
