import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

import { memoryAuthDb } from './db.ts';
import type { AuthDb } from './db.ts';
import {
  BOOTSTRAP_ACTION,
  checkKeyInput,
  checkoutToken,
  dbApiKeyStore,
  hashSecret,
  isKeyLive,
  isKeySecret,
  keyStart,
  localTokenRequired,
  memoryApiKeyStore,
  mintSecret,
  noApiKeyStore,
  parseScopes,
  resolveBearerSync,
} from './tokens.ts';
import type { ApiKeyStore } from './tokens.ts';

const open: AuthDb[] = [];
const dirs: string[] = [];
afterEach(async () => {
  while (open.length > 0) await open.pop()?.close();
  while (dirs.length > 0) rmSync(dirs.pop() ?? '', { recursive: true, force: true });
});

const NOW = new Date('2026-09-13T12:00:00.000Z');

describe('secrets', () => {
  test('a minted secret is ts_ plus 43 base64url characters, hashed with sha256 at rest', () => {
    const secret = mintSecret();
    expect(secret.startsWith('ts_')).toBe(true);
    expect(secret).toHaveLength(46);
    expect(isKeySecret(secret)).toBe(true);
    expect(isKeySecret('ts_short')).toBe(false);
    expect(isKeySecret('not-a-key')).toBe(false);
    expect(hashSecret(secret)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSecret(secret)).not.toContain(secret.slice(3, 20));
    expect(keyStart(secret)).toBe(secret.slice(3, 9));
    expect(mintSecret()).not.toBe(secret);
  });

  test('the key input rules: a name of 1 to 80, one scope or more from the six, a future expiry', () => {
    expect(() => checkKeyInput({ userId: 'u', name: ' ', scopes: ['read'] })).toThrow(TypeError);
    expect(() => checkKeyInput({ userId: 'u', name: 'x'.repeat(81), scopes: ['read'] })).toThrow(
      TypeError,
    );
    expect(() => checkKeyInput({ userId: 'u', name: 'ci', scopes: [] })).toThrow(TypeError);
    expect(() => checkKeyInput({ userId: 'u', name: 'ci', scopes: ['root' as never] })).toThrow(
      TypeError,
    );
    expect(() =>
      checkKeyInput({ userId: 'u', name: 'ci', scopes: ['read'], expiresAt: 'yesterday' }),
    ).toThrow(TypeError);
    expect(() =>
      checkKeyInput({
        userId: 'u',
        name: 'ci',
        scopes: ['read'],
        expiresAt: '2020-01-01T00:00:00Z',
        now: NOW,
      }),
    ).toThrow(TypeError);
    expect(parseScopes('["read","export","bogus"]')).toEqual(['read', 'export']);
    expect(parseScopes('not json')).toEqual([]);
  });
});

async function stores(): Promise<[string, ApiKeyStore][]> {
  const auth = await memoryAuthDb();
  open.push(auth);
  return [
    ['memory', memoryApiKeyStore(() => NOW)],
    ['sqlite', dbApiKeyStore(auth, () => NOW)],
  ];
}

describe('the key store', () => {
  test('creates, lists without secrets, resolves live keys, revokes once, expires', async () => {
    for (const [name, store] of await stores()) {
      const { record, secret } = await store.create({
        userId: 'usr1',
        name: 'ci',
        scopes: ['read', 'export', 'read'],
        now: NOW,
      });
      expect(record.scopes, name).toEqual(['read', 'export']);
      expect(record.start).toBe(keyStart(secret));
      expect(JSON.stringify(await store.list('usr1'))).not.toContain(secret);
      expect((await store.list('usr1')).map((k) => k.id)).toEqual([record.id]);
      expect(await store.list('usr2')).toEqual([]);
      expect(store.resolveSync(secret)?.id).toBe(record.id);
      expect((await store.resolve(secret))?.id).toBe(record.id);
      expect(store.resolveSync(mintSecret())).toBeNull();
      expect(store.resolveSync('nonsense')).toBeNull();
      expect(store.countSync()).toBe(1);
      // the owner's key alone can be revoked by the owner; a second revoke is null
      expect(await store.revoke(record.id, 'usr2')).toBeNull();
      const revoked = await store.revoke(record.id, 'usr1', NOW);
      expect(revoked?.revokedAt).toBe(NOW.toISOString());
      expect(store.resolveSync(secret)).toBeNull();
      expect(await store.revoke(record.id)).toBeNull();
      expect(store.countSync()).toBe(1);
      // an expired key is not live
      const expiring = await store.create({
        userId: 'usr1',
        name: 'short',
        scopes: ['read'],
        expiresAt: '2026-09-13T12:00:01.000Z',
        now: NOW,
      });
      expect(store.resolveSync(expiring.secret)?.id).toBe(expiring.record.id);
      expect(isKeyLive(expiring.record, new Date('2026-09-13T12:00:02.000Z'))).toBe(false);
      await store.touch(expiring.record.id, NOW);
      expect((await store.get(expiring.record.id))?.lastUsedAt).toBe(NOW.toISOString());
    }
  });
});

describe('the bearer rule', () => {
  test('an API key resolves, an unknown or revoked one is refused, and nothing is none', async () => {
    const store = memoryApiKeyStore(() => NOW);
    const { record, secret } = await store.create({ userId: 'usr1', name: 'ci', scopes: ['read'] });
    expect(resolveBearerSync(secret, { env: {}, keys: store })).toEqual({
      kind: 'api-key',
      record,
    });
    expect(resolveBearerSync(mintSecret(), { env: {}, keys: store })).toEqual({
      kind: 'refused',
      reason: 'unknown_key',
    });
    expect(resolveBearerSync(undefined, { env: {}, keys: store })).toEqual({ kind: 'none' });
    expect(resolveBearerSync('', { env: {}, keys: store })).toEqual({ kind: 'none' });
    expect(resolveBearerSync('garbage', { env: {}, keys: store })).toEqual({
      kind: 'refused',
      reason: 'not_a_key',
    });
    await store.revoke(record.id);
    expect(resolveBearerSync(secret, { env: {}, keys: store })).toEqual({
      kind: 'refused',
      reason: 'unknown_key',
    });
  });

  test('the static bearer is the bootstrap: every action while no key exists, bootstrap alone after', async () => {
    const env = { TURBOSLIDE_TOKEN: 'fake-static-bearer-for-tests' };
    const store = memoryApiKeyStore(() => NOW);
    expect(resolveBearerSync('fake-static-bearer-for-tests', { env, keys: store })).toEqual({
      kind: 'bootstrap',
      bootstrapOnly: false,
    });
    expect(
      resolveBearerSync('fake-static-bearer-for-tests', { env, keys: noApiKeyStore() }),
    ).toEqual({
      kind: 'bootstrap',
      bootstrapOnly: false,
    });
    await store.create({ userId: 'usr1', name: 'first', scopes: ['admin'] });
    expect(resolveBearerSync('fake-static-bearer-for-tests', { env, keys: store })).toEqual({
      kind: 'bootstrap',
      bootstrapOnly: true,
    });
    expect(resolveBearerSync('wrong', { env, keys: store })).toEqual({
      kind: 'refused',
      reason: 'not_a_key',
    });
    expect(BOOTSTRAP_ACTION).toBe('admin.bootstrap');
  });

  test('the per checkout token is minted once, mode 0600, announced once, and accepted as a bearer', () => {
    const dir = mkdtempSync(join(tmpdir(), 'turboslide-token-'));
    dirs.push(dir);
    const lines: string[] = [];
    const first = checkoutToken(dir, (line) => lines.push(line));
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(first);
    expect(readFileSync(join(dir, 'token'), 'utf8').trim()).toBe(first);
    expect(statSync(join(dir, 'token')).mode & 0o777).toBe(0o600);
    const second = checkoutToken(dir, (line) => lines.push(line));
    expect(second).toBe(first);
    expect(lines).toHaveLength(1);
    expect(resolveBearerSync(first, { env: {}, checkoutToken: first })).toEqual({
      kind: 'checkout',
    });
    expect(resolveBearerSync(first, { env: {} })).toEqual({ kind: 'refused', reason: 'not_a_key' });
  });

  test('requiring the checkout token is opt in this round, and TURBOSLIDE_LOCAL_OPEN wins', () => {
    expect(localTokenRequired({})).toBe(false);
    expect(localTokenRequired({ TURBOSLIDE_LOCAL_TOKEN: 'require' })).toBe(true);
    expect(
      localTokenRequired({ TURBOSLIDE_LOCAL_TOKEN: 'require', TURBOSLIDE_LOCAL_OPEN: '1' }),
    ).toBe(false);
  });
});
