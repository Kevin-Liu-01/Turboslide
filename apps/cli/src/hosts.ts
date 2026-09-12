// The hosts file (docs/deck-transfer.md; SPEC 11: secrets live outside the repository): the
// bearer tokens `turboslide deck push` and `deck pull` send to hosted studios, kept per origin in
// ~/.config/turboslide/hosts.json (XDG_CONFIG_HOME/turboslide when set; TURBOSLIDE_CONFIG_DIR
// for tests), mode 0600, never under the checkout. A token given once with --token is saved and
// read back on the next call; TURBOSLIDE_TOKEN in the environment and --token both outrank the
// file. Nothing here prints a token.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type HostRecord = { token: string; savedAt: string };
export type HostsFile = { version: 1; hosts: Record<string, HostRecord> };

export const HOSTS_FILE = 'hosts.json';
export const TOKEN_ENV = 'TURBOSLIDE_TOKEN';

export type TokenSource = 'flag' | 'env' | 'hosts' | 'none';

/** ~/.config/turboslide, or XDG_CONFIG_HOME/turboslide, or TURBOSLIDE_CONFIG_DIR. */
export function configDir(env: NodeJS.ProcessEnv = process.env): string {
  if (env.TURBOSLIDE_CONFIG_DIR) return env.TURBOSLIDE_CONFIG_DIR;
  if (env.XDG_CONFIG_HOME) return join(env.XDG_CONFIG_HOME, 'turboslide');
  return join(env.HOME ?? homedir(), '.config', 'turboslide');
}

export function hostsPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(configDir(env), HOSTS_FILE);
}

/** The origin a studio URL names, lower case, no path and no trailing slash; a TypeError otherwise. */
export function normalizeHost(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new TypeError(
      `"${url}" is not a URL; pass the studio's address, such as https://turboslide.vercel.app`,
    );
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new TypeError(`"${url}" must be an http or https URL`);
  }
  return parsed.origin.toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The file's contents; an empty table when it is missing or unreadable. */
export function readHosts(env: NodeJS.ProcessEnv = process.env): HostsFile {
  const path = hostsPath(env);
  if (!existsSync(path)) return { version: 1, hosts: {} };
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch {
    return { version: 1, hosts: {} };
  }
  if (!isRecord(raw) || !isRecord(raw.hosts)) return { version: 1, hosts: {} };
  const hosts: Record<string, HostRecord> = {};
  for (const [origin, record] of Object.entries(raw.hosts)) {
    if (isRecord(record) && typeof record.token === 'string' && record.token !== '') {
      hosts[origin] = {
        token: record.token,
        savedAt: typeof record.savedAt === 'string' ? record.savedAt : '',
      };
    }
  }
  return { version: 1, hosts };
}

/** Saves the token for an origin (mode 0600, the folder 0700) and returns the file's path. */
export function saveHostToken(
  url: string,
  token: string,
  env: NodeJS.ProcessEnv = process.env,
  now: () => string = () => new Date().toISOString(),
): string {
  if (token.trim() === '') throw new TypeError('the token must not be empty');
  const origin = normalizeHost(url);
  const file = readHosts(env);
  file.hosts[origin] = { token: token.trim(), savedAt: now() };
  const path = hostsPath(env);
  mkdirSync(configDir(env), { recursive: true, mode: 0o700 });
  const partial = `${path}.${process.pid}.part`;
  writeFileSync(partial, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
  renameSync(partial, path);
  return path;
}

/** The saved token for an origin, or undefined. */
export function savedToken(url: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  return readHosts(env).hosts[normalizeHost(url)]?.token;
}

/** --token, then TURBOSLIDE_TOKEN, then the hosts file. */
export function resolveToken(
  url: string,
  flag: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): { token: string | undefined; source: TokenSource } {
  if (flag !== undefined && flag.trim() !== '') return { token: flag.trim(), source: 'flag' };
  if (env[TOKEN_ENV]) return { token: env[TOKEN_ENV], source: 'env' };
  const saved = savedToken(url, env);
  return saved === undefined
    ? { token: undefined, source: 'none' }
    : { token: saved, source: 'hosts' };
}
