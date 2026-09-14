// The sealed anonymous identity cookie (gslides-parity SPEC-3 0.17, 7.1; research 03 B2): the
// first request without `__Host-ts_id` mints a v4 UUID, seals it under TURBOSLIDE_SESSION_SECRET
// and sets it `Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=400 days`. The principal id is
// `anon_<uuid>`. Two visitors are two people from the first request; clearing cookies makes a new
// visitor, as Google's signed out person is a new animal.
//
// Framework free on purpose: every function takes a Request (or a header string) and returns
// values, so the agent routes, the request middleware (middleware.ts), the `/s/:token` route and
// the unit tests call the same code. The seal is an HMAC-SHA256 over the payload through
// WebCrypto: the id is random and carries nothing secret, so integrity is what the cookie needs
// and encryption would add nothing; the framework's `sealSession` needs the request context
// (`getH3Event()`), which a reader that takes a Request must not (b3.md, stage 1 decision 2).
//
// The `__Host-` prefix needs `Secure`, and browsers accept a Secure cookie from https and from
// localhost. A dev server reached over plain http from another machine cannot set it, so the
// name falls back to `ts_id` there with the same attributes minus `Secure`; the reader accepts
// both names and the hosted deployment only ever sees the prefixed one.
import type { AuthContext, Principal } from '@turboslide/identity/access';
import { anonymousPrincipalId, parsePrincipalId } from '@turboslide/identity/ids';

export const ANON_COOKIE = '__Host-ts_id';
export const ANON_COOKIE_INSECURE = 'ts_id';
/** 400 days, the ceiling browsers apply to Max-Age (research 03 B2). */
export const ANON_COOKIE_MAX_AGE_S = 400 * 24 * 60 * 60;
export const SESSION_SECRET_VARIABLE = 'TURBOSLIDE_SESSION_SECRET';
/** The seal format version, the first segment of the cookie value. */
export const SEAL_VERSION = 'v1';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  const padded =
    text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

const keys = new Map<string, Promise<CryptoKey>>();

function hmacKey(secret: string): Promise<CryptoKey> {
  if (secret.length < 32)
    throw new RangeError(`${SESSION_SECRET_VARIABLE} must be at least 32 characters`);
  let key = keys.get(secret);
  if (key === undefined) {
    key = crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify'],
    );
    keys.set(secret, key);
  }
  return key;
}

export type SealedPrincipal = { principalId: string; issuedAt: number };

/** `v1.<payload>.<mac>` where the payload is `<principalId>.<issuedAt ms>`. */
export async function sealPrincipalCookie(
  principalId: string,
  secret: string,
  issuedAt: number = Date.now(),
): Promise<string> {
  const parsed = parsePrincipalId(principalId);
  if (parsed === null || parsed.kind !== 'anonymous')
    throw new RangeError(
      `the identity cookie carries an anonymous id, got ${JSON.stringify(principalId)}`,
    );
  const payload = encoder.encode(`${principalId}.${Math.trunc(issuedAt)}`);
  const mac = await crypto.subtle.sign(
    'HMAC',
    await hmacKey(secret),
    encoder.encode(`${SEAL_VERSION}.${toBase64Url(payload)}`),
  );
  return `${SEAL_VERSION}.${toBase64Url(payload)}.${toBase64Url(new Uint8Array(mac))}`;
}

/** The id inside a sealed value, or null when the value is malformed or the mac does not verify. */
export async function unsealPrincipalCookie(
  value: string,
  secret: string,
): Promise<SealedPrincipal | null> {
  const parts = value.split('.');
  if (parts.length !== 3 || parts[0] !== SEAL_VERSION) return null;
  const payloadText = parts[1] ?? '';
  const mac = fromBase64Url(parts[2] ?? '');
  const payload = fromBase64Url(payloadText);
  if (mac === null || payload === null || mac.length !== 32) return null;
  const verified = await crypto.subtle.verify(
    'HMAC',
    await hmacKey(secret),
    mac,
    encoder.encode(`${SEAL_VERSION}.${payloadText}`),
  );
  if (!verified) return null;
  const text = decoder.decode(payload);
  const dot = text.lastIndexOf('.');
  if (dot <= 0) return null;
  const principalId = text.slice(0, dot);
  const issuedAt = Number(text.slice(dot + 1));
  const parsed = parsePrincipalId(principalId);
  if (parsed === null || parsed.kind !== 'anonymous' || !Number.isFinite(issuedAt)) return null;
  return { principalId, issuedAt };
}

/** The cookies of a `Cookie` header by name; the first value wins when a name repeats. */
export function parseCookies(header: string | null | undefined): Map<string, string> {
  const out = new Map<string, string>();
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name && !out.has(name)) out.set(name, value);
  }
  return out;
}

function requestHost(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-host');
  if (forwarded) return forwarded.split(',')[0]?.trim().toLowerCase() ?? '';
  const host = request.headers.get('host');
  if (host) return host.trim().toLowerCase();
  try {
    return new URL(request.url).host.toLowerCase();
  } catch {
    return '';
  }
}

function isLocalHost(host: string): boolean {
  const bare = host.replace(/^\[([^\]]+)\](?::\d+)?$/, '$1').replace(/:\d+$/, '');
  return (
    bare === 'localhost' || bare === '127.0.0.1' || bare === '::1' || bare.endsWith('.localhost')
  );
}

/** https (directly or through the proxy header), or a localhost address, which browsers treat as secure. */
export function isSecureRequest(request: Request): boolean {
  const proto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
  if (proto === 'https') return true;
  let scheme = '';
  try {
    scheme = new URL(request.url).protocol;
  } catch {
    scheme = '';
  }
  if (scheme === 'https:') return true;
  return isLocalHost(requestHost(request));
}

/** `__Host-ts_id` on a secure request, `ts_id` on plain http off localhost. */
export function anonymousCookieName(request: Request): string {
  return isSecureRequest(request) ? ANON_COOKIE : ANON_COOKIE_INSECURE;
}

/** The Set-Cookie header value for the identity cookie. */
export function serializeAnonymousCookie(
  name: string,
  value: string,
  maxAgeSeconds: number = ANON_COOKIE_MAX_AGE_S,
): string {
  const attributes = [
    `${name}=${value}`,
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (name === ANON_COOKIE) attributes.push('Secure');
  return attributes.join('; ');
}

/** The Set-Cookie value that clears the identity cookie (Forget this browser mints a new one). */
export function expireAnonymousCookie(name: string): string {
  return serializeAnonymousCookie(name, '', 0);
}

/** The anonymous principal a request carries in a valid sealed cookie, or null. */
export async function readPrincipal(request: Request, secret: string): Promise<Principal | null> {
  const cookies = parseCookies(request.headers.get('cookie'));
  for (const name of [ANON_COOKIE, ANON_COOKIE_INSECURE]) {
    const value = cookies.get(name);
    if (value === undefined) continue;
    const sealed = await unsealPrincipalCookie(value, secret);
    if (sealed !== null) return { id: sealed.principalId, kind: 'anonymous', admin: false };
  }
  return null;
}

export type EnsuredPrincipal = {
  principal: Principal;
  /** True when this request minted the id; `setCookie` then carries the header to send. */
  minted: boolean;
  setCookie?: string;
  cookieName: string;
};

export type EnsureOptions = {
  now?: number;
  /** The UUID source, `crypto.randomUUID` unless a test pins one. */
  randomUUID?: () => string;
};

/**
 * The principal of a request, minting one when the cookie is absent or does not verify. The
 * caller sends `setCookie` when it is set; nothing is minted for a request that carries a bearer
 * (an agent), which has no browser to keep the cookie.
 */
export async function ensurePrincipal(
  request: Request,
  secret: string,
  options: EnsureOptions = {},
): Promise<EnsuredPrincipal | null> {
  const cookieName = anonymousCookieName(request);
  const existing = await readPrincipal(request, secret);
  if (existing !== null) return { principal: existing, minted: false, cookieName };
  if (request.headers.get('authorization')) return null;
  const uuid = (options.randomUUID ?? (() => crypto.randomUUID()))();
  const principalId = anonymousPrincipalId(uuid);
  const value = await sealPrincipalCookie(principalId, secret, options.now ?? Date.now());
  return {
    principal: { id: principalId, kind: 'anonymous', admin: false },
    minted: true,
    setCookie: serializeAnonymousCookie(cookieName, value),
    cookieName,
  };
}

const BOUND = new WeakMap<Request, EnsuredPrincipal>();

/**
 * Binds the principal the request middleware ensured (middleware.ts) to the request, so a route
 * that runs after it reads the same id and never mints a second one for a request whose cookie
 * is on the way out but not yet in: the middleware sets the cookie on the response, the request's
 * `Cookie` header stays as it arrived.
 */
export function bindRequestPrincipal(request: Request, ensured: EnsuredPrincipal): void {
  BOUND.set(request, ensured);
}

export function boundPrincipal(request: Request): EnsuredPrincipal | undefined {
  return BOUND.get(request);
}

/**
 * The AuthContext of a browser request for `decide()` (SPEC-3 6.2): the anonymous principal
 * from the cookie; the account session, the exchanged link grants and the bearer resolution
 * join in later stages (b3.md).
 */
export async function authContextFor(request: Request, secret: string): Promise<AuthContext> {
  const principal = await readPrincipal(request, secret);
  return { principal, linkGrants: [] };
}
