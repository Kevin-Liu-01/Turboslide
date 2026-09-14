import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';

import { SESSION_SECRET_FILE, resetSecretWarning, sessionSecret } from './secret.ts';

const tmp = mkdtempSync(join(tmpdir(), 'turboslide-secret-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

// Every value here is an obviously fake test value.
const FAKE = 'fake-session-secret-for-tests-0123456789';

describe('sessionSecret', () => {
  test('the variable wins and must be long enough', () => {
    expect(sessionSecret({ TURBOSLIDE_SESSION_SECRET: FAKE }, tmp)).toEqual({
      secret: FAKE,
      source: 'env',
    });
    expect(() => sessionSecret({ TURBOSLIDE_SESSION_SECRET: 'short' }, tmp)).toThrow(/at least 32/);
  });

  test('a checkout generates the file once with mode 0600 and reads it back', () => {
    const dir = join(tmp, 'state');
    const first = sessionSecret({}, dir);
    expect(first.source).toBe('file');
    expect(first.secret).toMatch(/^[0-9a-f]{64}$/);
    const path = join(dir, SESSION_SECRET_FILE);
    expect(existsSync(path)).toBe(true);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(readFileSync(path, 'utf8').trim()).toBe(first.secret);
    expect(sessionSecret({}, dir)).toEqual(first);
  });

  test('hosted without the variable derives from the bearer once with a warning that names the variable only', () => {
    resetSecretWarning();
    const warnings: string[] = [];
    const env = { VERCEL: '1', TURBOSLIDE_TOKEN: 'fake-bearer-token-for-tests' };
    const a = sessionSecret(env, undefined, (m) => warnings.push(m));
    const b = sessionSecret(env, undefined, (m) => warnings.push(m));
    expect(a.source).toBe('derived');
    expect(a.secret).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toEqual(b);
    expect(a.secret).not.toContain('fake-bearer');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('TURBOSLIDE_SESSION_SECRET');
    expect(warnings[0]).not.toContain('fake-bearer');
    // A different bearer is a different secret; hosted never touches the state folder.
    expect(
      sessionSecret({ VERCEL: '1', TURBOSLIDE_TOKEN: 'another-fake-bearer' }, tmp, () => {}).secret,
    ).not.toBe(a.secret);
  });

  test('nothing to derive from is an error that names the variable', () => {
    expect(() => sessionSecret({ VERCEL: '1' }, undefined, () => {})).toThrow(
      /TURBOSLIDE_SESSION_SECRET/,
    );
    expect(() => sessionSecret({}, undefined, () => {})).toThrow(/TURBOSLIDE_SESSION_SECRET/);
  });
});
