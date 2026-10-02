// The room ticket's verification and the bearer compare (docs/CLOUDFLARE.md 3.3): the Worker
// verifies the HMAC-SHA256 the function signed with `crypto.subtle` (the runtime's verify is the
// constant time compare), then the claims' shape, the protocol version window, the deck, the
// origin and the expiry. The codec (base64url, the split, the claims schema) is
// @turboslide/realtime/frames, shared with the minter in apps/studio room-ticket.ts, so the two
// hosts agree byte for byte. A bearer is compared through SHA-256 digests and
// `crypto.subtle.timingSafeEqual`, so a wrong length leaks nothing. No `node:` import: this file
// runs in the Worker, in the object and in node (the unit test).
import { ROOM_PROTOCOL, parseTicketClaims, splitTicket } from '@turboslide/realtime/frames';
import type { TicketClaims } from '@turboslide/realtime/frames';

export type TicketRefusal =
  'shape' | 'signature' | 'claims' | 'version' | 'deck' | 'origin' | 'expired';

export type TicketVerdict =
  { ok: true; claims: TicketClaims } | { ok: false; reason: TicketRefusal };

export type TicketCheck = {
  /** the deck of the path; the claim must name it */
  deck: string;
  /** the request's `Origin`; null skips the check (the Worker's bearer routes never do) */
  origin: string | null;
  /** the clock in ms */
  now: number;
  /** the protocol version the Worker runs; `v` may be this or the one before (3.3) */
  protocol?: number;
  /** how far past `exp` a ticket still verifies (a socket already open: TICKET_GRACE_MS) */
  graceMs?: number;
};

const encoder = new TextEncoder();
const keys = new Map<string, Promise<CryptoKey>>();

/** A copy of the bytes over their own ArrayBuffer, the shape the Web Crypto calls take. */
function bufferOf(bytes: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(out).set(bytes);
  return out;
}

/** The HMAC key of a secret, imported once per isolate. */
function hmacKey(secret: string): Promise<CryptoKey> {
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

/** Signs claims text the way the function does (for the tests and the drive; the function uses node:crypto). */
export async function signClaims(claimsText: string, secret: string): Promise<Uint8Array> {
  const mac = await crypto.subtle.sign(
    'HMAC',
    await hmacKey(secret),
    bufferOf(encoder.encode(claimsText)),
  );
  return new Uint8Array(mac);
}

/** The ticket's verdict: the MAC first, so nothing of a forged token is parsed before it verifies. */
export async function verifyTicket(
  token: string,
  secret: string,
  check: TicketCheck,
): Promise<TicketVerdict> {
  const split = splitTicket(token);
  if (split === null) return { ok: false, reason: 'shape' };
  const key = await hmacKey(secret);
  const signed = await crypto.subtle.verify(
    'HMAC',
    key,
    bufferOf(split.mac),
    bufferOf(split.signed),
  );
  if (!signed) return { ok: false, reason: 'signature' };
  const claims = parseTicketClaims(split.claimsText);
  if (claims === null) return { ok: false, reason: 'claims' };
  const protocol = check.protocol ?? ROOM_PROTOCOL;
  if (claims.v !== protocol && claims.v !== protocol - 1) return { ok: false, reason: 'version' };
  if (claims.deck !== check.deck) return { ok: false, reason: 'deck' };
  if (check.origin !== null && claims.org !== check.origin) return { ok: false, reason: 'origin' };
  if (claims.exp + (check.graceMs ?? 0) < check.now) return { ok: false, reason: 'expired' };
  return { ok: true, claims };
}

/** The token of an `Authorization: <scheme> <token>` header, or null. */
export function authorizationToken(
  header: string | null,
  scheme: 'Bearer' | 'Ticket',
): string | null {
  if (header === null) return null;
  const space = header.indexOf(' ');
  if (space <= 0) return null;
  if (header.slice(0, space).toLowerCase() !== scheme.toLowerCase()) return null;
  const token = header.slice(space + 1).trim();
  return token === '' ? null : token;
}

/** Constant time equality of two equal length byte strings: every byte is read whatever the first difference. */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/** Constant time equality of two secrets through their digests (the Workers best practice): the digests are equal length, so nothing of the lengths leaks. */
export async function secretsMatch(given: string | null, expected: string): Promise<boolean> {
  if (given === null || expected === '') return false;
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', bufferOf(encoder.encode(given))),
    crypto.subtle.digest('SHA-256', bufferOf(encoder.encode(expected))),
  ]);
  return timingSafeEqual(new Uint8Array(a), new Uint8Array(b));
}
