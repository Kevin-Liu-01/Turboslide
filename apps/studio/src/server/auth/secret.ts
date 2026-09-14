// The secret the identity cookie is sealed under (gslides-parity SPEC-3 7.1, 11.4): the value of
// TURBOSLIDE_SESSION_SECRET, which every hosted environment sets and which differs between
// preview and production. On a checkout the secret is generated once and kept under
// `.turboslide/session-secret` (research 03 D2), so `pnpm dev` needs no variable and the cookie
// survives a restart. Hosted without the variable, the secret is derived from TURBOSLIDE_TOKEN by
// HMAC so every instance agrees and the token itself never leaves the process; the deployment
// is told once through a warning that names the variable. Nothing here prints a secret.
import { createHmac, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { SESSION_SECRET_VARIABLE } from './session.ts';

export const SESSION_SECRET_FILE = 'session-secret';
export const SESSION_SECRET_MIN_LENGTH = 32;

export type SecretEnv = Readonly<Record<string, string | undefined>>;

export type SecretSource = 'env' | 'file' | 'derived';

let warned = false;

/**
 * The session secret and where it came from. `dir` is the state folder (`.turboslide/`) a
 * checkout keeps the generated secret in; hosted callers pass none.
 */
export function sessionSecret(
  env: SecretEnv = process.env,
  dir?: string,
  warn: (message: string) => void = (message) => console.warn(message),
): { secret: string; source: SecretSource } {
  const fromEnv = env[SESSION_SECRET_VARIABLE];
  if (fromEnv !== undefined && fromEnv !== '') {
    if (fromEnv.length < SESSION_SECRET_MIN_LENGTH)
      throw new Error(
        `${SESSION_SECRET_VARIABLE} must be at least ${SESSION_SECRET_MIN_LENGTH} characters`,
      );
    return { secret: fromEnv, source: 'env' };
  }
  const hosted = env.VERCEL !== undefined && env.VERCEL !== '';
  if (!hosted && dir !== undefined) {
    const path = join(dir, SESSION_SECRET_FILE);
    if (existsSync(path)) {
      const stored = readFileSync(path, 'utf8').trim();
      if (stored.length >= SESSION_SECRET_MIN_LENGTH) return { secret: stored, source: 'file' };
    }
    const generated = randomBytes(32).toString('hex');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path, `${generated}\n`, { mode: 0o600 });
    return { secret: generated, source: 'file' };
  }
  const token = env.TURBOSLIDE_TOKEN;
  if (token !== undefined && token !== '') {
    if (!warned) {
      warned = true;
      warn(
        `${SESSION_SECRET_VARIABLE} is not set; the identity cookie is sealed under a value derived from TURBOSLIDE_TOKEN until it is (docs/hosting.md)`,
      );
    }
    return {
      secret: createHmac('sha256', token).update('turboslide identity cookie').digest('hex'),
      source: 'derived',
    };
  }
  throw new Error(
    `${SESSION_SECRET_VARIABLE} is not set and no state folder was given; set it on this deployment`,
  );
}

/** Resets the one time warning, for tests. */
export function resetSecretWarning(): void {
  warned = false;
}
