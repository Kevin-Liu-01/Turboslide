// Authentication and the request facts of the agent HTTP surface (SPEC 11 "Security";
// gslides-parity SPEC-3 7.7, 8.2, 8.8): the surface is open only on localhost in dev; every
// other host needs a bearer, and a deployment that forgot to set one refuses every request off
// localhost rather than serving them open. The host is the effective host of dispatch.ts (the
// forwarded name only under TURBOSLIDE_TRUST_PROXY, a public forwarded name refusing either way;
// report 04 F11), so `/mcp`, `/api/actions` and `/api/agent` judge a request by one rule. The
// author and the `force` flag arrive as headers or query parameters because the action inputs
// are strict objects and carry neither; round three binds the author of a resolved identity (an
// API key record, a session) to the request before the dispatcher reads it, so `?author=` and
// the header are ignored for such a request and the header carries a run id only (SPEC-3 0.17,
// 8.2). The studio's resolver (apps/studio/src/server/auth.ts) makes the binding; the round one
// bearer rule below stays for a process without identity records.
import { timingSafeEqual } from 'node:crypto';

import { SLUG_PATTERN } from '@turboslide/schema/ids';
import type { Author } from '@turboslide/schema/mutations';
import { parseAuthor } from '@turboslide/schema/mutations';

// dispatch.ts imports this module too; both sides use function declarations only, so the cycle
// resolves at call time and nothing runs at load
import { effectiveHost } from './dispatch.ts';

export const TOKEN_ENV = 'TURBOSLIDE_TOKEN';
export const AUTHOR_HEADER = 'x-turboslide-author';
export const FORCE_HEADER = 'x-turboslide-force';
export const DECK_QUERY = 'deck';
export const FORCE_QUERY = 'force';
export const AUTHOR_QUERY = 'author';

/** The author a request without a name writes as (SPEC 7.2 names agent:<runId> for agents). */
export const DEFAULT_HTTP_AUTHOR = 'agent:http';

export type Env = Record<string, string | undefined>;

/**
 * The host the client addressed, as dispatch.ts judges it: the forwarded host only under
 * TURBOSLIDE_TRUST_PROXY, a public forwarded name over a local Host refusing either way, else
 * Host, then the request URL.
 */
export function requestHost(request: Request, env: Env = process.env): string {
  return effectiveHost(request, env);
}

/** localhost, 127.0.0.1, ::1 and *.localhost, with or without a port. */
export function isLocalHost(host: string): boolean {
  const trimmed = host.trim().toLowerCase();
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(trimmed);
  const bare =
    bracketed?.[1] ?? (trimmed.split(':').length === 2 ? trimmed.replace(/:\d+$/, '') : trimmed);
  return (
    bare === 'localhost' || bare === '127.0.0.1' || bare === '::1' || bare.endsWith('.localhost')
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
  const host = requestHost(request, env);
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

const BOUND_AUTHORS = new WeakMap<Request, Author>();

/**
 * Binds the author a resolver derived for this request (an API key record's registered name and
 * owner, a session's principal; SPEC-3 0.17, 8.2). `requestAuthor` answers it and ignores
 * `?author=` and the header's name from then on; the header's value is read as the run id only.
 */
export function bindRequestAuthor(request: Request, author: Author): void {
  BOUND_AUTHORS.set(request, author);
}

export function boundAuthor(request: Request): Author | undefined {
  return BOUND_AUTHORS.get(request);
}

const RUN_ID = /^[A-Za-z0-9._-]{1,32}$/;

/** The run id the header names for a bound identity: `agent:<runId>` or a bare id, 1 to 32 of `[A-Za-z0-9._-]`. */
export function requestRunId(request: Request): string | undefined {
  const header = request.headers.get(AUTHOR_HEADER)?.trim();
  if (!header) return undefined;
  const value = header.startsWith('agent:') ? header.slice('agent:'.length) : header;
  return RUN_ID.test(value) ? value : undefined;
}

/**
 * The author of a request: the bound identity when a resolver bound one (its run id from the
 * header), else the x-turboslide-author header or ?author=, else the fallback (round one).
 */
export function requestAuthor(request: Request, fallback: string = DEFAULT_HTTP_AUTHOR): Author {
  const bound = BOUND_AUTHORS.get(request);
  if (bound !== undefined) {
    const runId = requestRunId(request);
    return runId !== undefined && bound.kind === 'agent' ? { ...bound, runId } : bound;
  }
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
