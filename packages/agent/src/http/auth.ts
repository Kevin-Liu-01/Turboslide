// Authentication and the request facts of the agent HTTP surface (SPEC 11 "Security"): the
// surface is open only on localhost in dev; every other host needs the bearer token the
// deployment sets in TURBOSLIDE_TOKEN, and a deployment that forgot to set one refuses every
// request off localhost rather than serving them open. The host is read from X-Forwarded-Host
// first (a proxy in front of the studio) and then Host, so an instance behind a reverse proxy is
// judged by the name the client used. The author and the `force` flag arrive as headers or query
// parameters because the action inputs are strict objects and carry neither.
import { timingSafeEqual } from 'node:crypto';

import { SLUG_PATTERN } from '@turboslide/schema/ids';
import type { Author } from '@turboslide/schema/mutations';
import { parseAuthor } from '@turboslide/schema/mutations';

export const TOKEN_ENV = 'TURBOSLIDE_TOKEN';
export const AUTHOR_HEADER = 'x-turboslide-author';
export const FORCE_HEADER = 'x-turboslide-force';
export const DECK_QUERY = 'deck';
export const FORCE_QUERY = 'force';
export const AUTHOR_QUERY = 'author';

/** The author a request without a name writes as (SPEC 7.2 names agent:<runId> for agents). */
export const DEFAULT_HTTP_AUTHOR = 'agent:http';

export type Env = Record<string, string | undefined>;

/** The host the client addressed: X-Forwarded-Host, then Host, then the request URL. */
export function requestHost(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-host');
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? '';
  const host = request.headers.get('host');
  if (host) return host.trim();
  try {
    return new URL(request.url).host;
  } catch {
    return '';
  }
}

/** localhost, 127.0.0.1, ::1 and *.localhost, with or without a port. */
export function isLocalHost(host: string): boolean {
  const trimmed = host.trim().toLowerCase();
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(trimmed);
  const bare =
    bracketed?.[1] ?? (trimmed.split(':').length === 2 ? trimmed.replace(/:\d+$/, '') : trimmed);
  return (
    bare === 'localhost' ||
    bare === '127.0.0.1' ||
    bare === '::1' ||
    bare === '0.0.0.0' ||
    bare.endsWith('.localhost')
  );
}

export function bearerToken(request: Request): string | undefined {
  const header = request.headers.get('authorization');
  if (!header) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || undefined;
}

function sameToken(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export type AuthResult =
  | { ok: true; mode: 'localhost' | 'token' }
  | { ok: false; status: 401; code: 'unauthorized'; message: string };

/**
 * The rule: with TURBOSLIDE_TOKEN set, every request carries `Authorization: Bearer <token>`;
 * without it, only requests addressed to localhost are served.
 */
export function authorize(request: Request, env: Env = process.env): AuthResult {
  const token = env[TOKEN_ENV];
  const host = requestHost(request);
  if (token !== undefined && token !== '') {
    const given = bearerToken(request);
    if (given !== undefined && sameToken(given, token)) return { ok: true, mode: 'token' };
    return {
      ok: false,
      status: 401,
      code: 'unauthorized',
      message: 'bearer token required: send Authorization: Bearer <TURBOSLIDE_TOKEN>',
    };
  }
  if (isLocalHost(host)) return { ok: true, mode: 'localhost' };
  return {
    ok: false,
    status: 401,
    code: 'unauthorized',
    message: `the agent surface is open only on localhost; this instance (host ${host || 'unknown'}) has no TURBOSLIDE_TOKEN set, so requests off localhost are refused`,
  };
}

/** What the manifest reports about authentication on this instance. */
export function authSummary(env: Env = process.env): {
  required: boolean;
  env: string;
  localhostOpen: boolean;
} {
  const required = env[TOKEN_ENV] !== undefined && env[TOKEN_ENV] !== '';
  return { required, env: TOKEN_ENV, localhostOpen: !required };
}

/** The author from the x-turboslide-author header or ?author=, else the fallback. */
export function requestAuthor(request: Request, fallback: string = DEFAULT_HTTP_AUTHOR): Author {
  const header = request.headers.get(AUTHOR_HEADER)?.trim();
  if (header) return parseAuthor(header);
  const query = new URL(request.url).searchParams.get(AUTHOR_QUERY)?.trim();
  return parseAuthor(query || fallback);
}

function truthy(value: string | null | undefined): boolean {
  if (value === null || value === undefined) return false;
  const v = value.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === '';
}

/** `?force=1` or `x-turboslide-force: 1` (SPEC 6.7 `force`). */
export function requestForce(request: Request): boolean {
  const url = new URL(request.url);
  if (url.searchParams.has(FORCE_QUERY)) return truthy(url.searchParams.get(FORCE_QUERY));
  return truthy(request.headers.get(FORCE_HEADER));
}

/** `?deck=<id>`; RangeError when it is not a slug. */
export function requestDeckId(request: Request, fallback?: string): string | undefined {
  const value = new URL(request.url).searchParams.get(DECK_QUERY);
  if (value === null || value === '') return fallback;
  if (!SLUG_PATTERN.test(value))
    throw new RangeError(`deck must be a slug, got ${JSON.stringify(value)}`);
  return value;
}
