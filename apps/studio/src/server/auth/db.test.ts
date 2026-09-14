import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { sql } from 'kysely';
import { afterEach, describe, expect, test } from 'vitest';

import { dbAliasStore, memoryAliasStore, mergePrincipalRecords } from './alias.ts';
import { AUTH_DB_VARIABLE, memoryAuthDb, migrateAuthDb, openAuthDb, selectAuthDb } from './db.ts';
import type { AuthDb } from './db.ts';
import { dbCaptureStore, memoryCaptureStore } from './mail/mailer.ts';
import { dbQuotaStore, memoryQuotaStore } from './quota.ts';
import { TURBOSLIDE_TABLES } from './schema.ts';
import { bindable } from './sqlite-dialect.ts';

const ANON = 'anon_9f1c2a3e-4b5d-4e6f-8a9b-0c1d2e3f4a5b';
const ANON2 = 'anon_1f1c2a3e-4b5d-4e6f-8a9b-0c1d2e3f4a5b';

const open: AuthDb[] = [];
const dirs: string[] = [];

afterEach(async () => {
  while (open.length > 0) await open.pop()?.close();
  while (dirs.length > 0) rmSync(dirs.pop() ?? '', { recursive: true, force: true });
});

async function db(): Promise<AuthDb> {
  const auth = await memoryAuthDb();
  open.push(auth);
  return auth;
}

describe('selectAuthDb', () => {
  test('postgres behind DATABASE_URL, sqlite behind TURBOSLIDE_AUTH_DB, none otherwise', () => {
    expect(selectAuthDb({}, '/repo')).toEqual({ kind: 'none', reason: expect.any(String) });
    expect(selectAuthDb({ DATABASE_URL: 'postgres://fake:fake@localhost/fake' }, '/repo')).toEqual({
      kind: 'postgres',
      reason: 'DATABASE_URL is set',
    });
    const sqlite = selectAuthDb({ [AUTH_DB_VARIABLE]: '.turboslide/auth-b3.sqlite' }, '/repo');
    expect(sqlite).toEqual({
      kind: 'sqlite',
      path: '/repo/.turboslide/auth-b3.sqlite',
      reason: 'TURBOSLIDE_AUTH_DB=.turboslide/auth-b3.sqlite',
    });
    expect(selectAuthDb({ [AUTH_DB_VARIABLE]: '/abs/auth.sqlite' }, '/repo')).toMatchObject({
      path: '/abs/auth.sqlite',
    });
  });

  test('a hosted process may not name a sqlite file, and the reason never carries a URL', () => {
    expect(() => selectAuthDb({ VERCEL: '1', [AUTH_DB_VARIABLE]: 'x.sqlite' }, '/repo')).toThrow(
      TypeError,
    );
    const selection = selectAuthDb({ DATABASE_URL: 'postgres://user:secretpw@host/db' }, '/repo');
    expect(JSON.stringify(selection)).not.toContain('secretpw');
  });
});

describe('the node:sqlite dialect', () => {
  test('binds booleans as integers, dates as ISO strings and undefined as null', () => {
    expect(bindable(true)).toBe(1);
    expect(bindable(false)).toBe(0);
    expect(bindable(new Date('2026-09-13T10:00:00.000Z'))).toBe('2026-09-13T10:00:00.000Z');
    expect(bindable(undefined)).toBeNull();
    expect(bindable(null)).toBeNull();
    expect(bindable('x')).toBe('x');
    expect(bindable(7)).toBe(7);
    expect(bindable({ a: 1 })).toBe('{"a":1}');
  });

  test('migrates the five Turboslide tables idempotently and runs reads, writes and returning', async () => {
    const auth = await db();
    await migrateAuthDb(auth);
    const tables = await auth.db.introspection.getTables();
    for (const name of TURBOSLIDE_TABLES) expect(tables.map((t) => t.name)).toContain(name);
    const inserted = await auth.db
      .insertInto('ts_quota')
      .values({ key: 'k', count: 1, resetAt: '2026-01-01T00:00:00.000Z' })
      .returning('key')
      .executeTakeFirst();
    expect(inserted).toEqual({ key: 'k' });
    const updated = await auth.db
      .updateTable('ts_quota')
      .set({ count: 2 })
      .where('key', '=', 'k')
      .executeTakeFirst();
    expect(Number(updated.numUpdatedRows)).toBe(1);
    const raw = await sql<{ n: number }>`select count(*) as n from ts_quota`.execute(auth.db);
    expect(Number(raw.rows[0]?.n)).toBe(1);
    // a transaction rolls back
    await expect(
      auth.db.transaction().execute(async (trx) => {
        await trx
          .insertInto('ts_quota')
          .values({ key: 'rolled', count: 1, resetAt: 'x' })
          .execute();
        throw new Error('stop');
      }),
    ).rejects.toThrow('stop');
    expect(
      await auth.db
        .selectFrom('ts_quota')
        .select('key')
        .where('key', '=', 'rolled')
        .executeTakeFirst(),
    ).toBeUndefined();
  });

  test('openAuthDb creates the folder and the file, and reopens the same data', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'turboslide-auth-db-'));
    dirs.push(dir);
    const selection = selectAuthDb({ [AUTH_DB_VARIABLE]: 'state/auth.sqlite' }, dir);
    if (selection.kind !== 'sqlite') throw new Error('sqlite expected');
    const first = openAuthDb(selection);
    await migrateAuthDb(first);
    await first.db
      .insertInto('ts_alias')
      .values({ anonymousId: ANON, userId: 'u1', linkedAt: 'now' })
      .execute();
    await first.close();
    const second = openAuthDb(selection);
    open.push(second);
    await migrateAuthDb(second);
    const rows = await second.db.selectFrom('ts_alias').selectAll().execute();
    expect(rows).toEqual([{ anonymousId: ANON, userId: 'u1', linkedAt: 'now' }]);
  });
});

describe('the alias store', () => {
  for (const [name, make] of [
    ['memory', async () => memoryAliasStore()],
    ['database', async () => dbAliasStore((await db()).db)],
  ] as const) {
    test(`${name}: links once, resolves, lists in link order, unlinks an account`, async () => {
      const store = await make();
      expect(await store.accountOf(ANON)).toBeNull();
      expect(await store.link(ANON, 'usr1', new Date('2026-01-01T00:00:00Z'))).toBe(true);
      expect(await store.link(ANON, 'usr2', new Date('2026-01-02T00:00:00Z'))).toBe(false);
      expect(await store.accountOf(ANON)).toBe('usr1');
      expect(await store.link(ANON2, 'usr1', new Date('2026-01-03T00:00:00Z'))).toBe(true);
      expect(await store.aliasesOf('usr1')).toEqual([ANON, ANON2]);
      expect(await store.unlinkAll('usr1')).toBe(2);
      expect(await store.accountOf(ANON)).toBeNull();
    });
  }

  test('merging records unions the link grants and keeps the typed name and avatar once', () => {
    const base = {
      label: 'Ink 100',
      avatar: { variant: 'initials' as const },
      notificationSettings: 'forYou' as const,
      livePointers: { collaborators: true, mine: {} },
      createdAt: 'a',
      lastSeenAt: 'a',
    };
    const anonymous = {
      ...base,
      principalId: ANON,
      name: 'Maya',
      avatar: { variant: 'glyph' as const, salt: 3 },
      linkGrants: [{ linkId: 'lnk_a', deckId: 'd1', role: 'editor' as const }],
      livePointers: { collaborators: true, mine: { d1: true } },
    };
    const account = {
      ...base,
      principalId: 'usr_1',
      linkGrants: [
        { linkId: 'lnk_a', deckId: 'd1', role: 'viewer' as const },
        { linkId: 'lnk_b', deckId: 'd2', role: 'commenter' as const },
      ],
      notificationSettings: 'all' as const,
    };
    const merged = mergePrincipalRecords(anonymous, account);
    expect(merged.principalId).toBe('usr_1');
    expect(merged.name).toBe('Maya');
    expect(merged.avatar).toEqual({ variant: 'glyph', salt: 3 });
    expect(merged.notificationSettings).toBe('all');
    expect(merged.linkGrants).toEqual(account.linkGrants);
    expect(merged.livePointers.mine).toEqual({ d1: true });
    // an account that chose keeps its choice
    const chosen = mergePrincipalRecords(anonymous, {
      ...account,
      name: 'Maya Chen',
      avatar: { variant: 'initials', initials: 'MC' },
    });
    expect(chosen.name).toBe('Maya Chen');
    expect(chosen.avatar).toEqual({ variant: 'initials', initials: 'MC' });
  });
});

describe('the quota store', () => {
  for (const [name, make] of [
    ['memory', async () => memoryQuotaStore()],
    ['database', async () => dbQuotaStore((await db()).db)],
  ] as const) {
    test(`${name}: counts inside the window, refuses past the limit, forgets after it`, async () => {
      const store = await make();
      const t0 = new Date('2026-09-13T10:00:00Z');
      expect(await store.take('a', 2, 60_000, t0)).toMatchObject({ ok: true, count: 1 });
      expect(await store.take('a', 2, 60_000, t0)).toMatchObject({ ok: true, count: 2 });
      const third = await store.take('a', 2, 60_000, t0);
      expect(third.ok).toBe(false);
      expect(third.resetAt).toBe('2026-09-13T10:01:00.000Z');
      expect(await store.peek('a', t0)).toBe(3);
      const later = new Date('2026-09-13T10:02:00Z');
      expect(await store.peek('a', later)).toBe(0);
      expect(await store.take('a', 2, 60_000, later)).toMatchObject({ ok: true, count: 1 });
      await store.reset('a');
      expect(await store.peek('a', later)).toBe(0);
    });
  }
});

describe('the capture store over the database', () => {
  test('appends and lists newest first with since and limit', async () => {
    const auth = await db();
    const store = dbCaptureStore(auth.db);
    const memory = memoryCaptureStore();
    for (const [i, s] of ['a', 'b', 'c'].entries()) {
      const mail = {
        id: `m${i}`,
        to: `${s}@example.test`,
        subject: `S ${s}`,
        text: `T ${s}`,
        kind: 'sign-in' as const,
        headers: { 'X-Test': s },
        createdAt: `2026-09-13T10:0${i}:00.000Z`,
      };
      await store.append(mail);
      await memory.append(mail);
    }
    const all = await store.list();
    expect(all.map((m) => m.id)).toEqual(['m2', 'm1', 'm0']);
    expect(all[0]?.headers).toEqual({ 'X-Test': 'c' });
    expect(await store.list({ since: '2026-09-13T10:00:30.000Z', limit: 1 })).toHaveLength(1);
    expect((await memory.list({ since: '2026-09-13T10:00:30.000Z' })).map((m) => m.id)).toEqual([
      'm2',
      'm1',
    ]);
  });
});
