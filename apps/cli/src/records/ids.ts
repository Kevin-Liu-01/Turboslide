// The identifiers the records carry (gslides-parity SPEC-3 5.1, 0.15, 6.1): thread and comment
// ids as 26 character lower case Crockford base32 ULIDs (time ordered, so a list sorted by id is
// sorted by creation; the random half from the platform's CSPRNG), the `lnk_` and `req_` record
// ids, share tokens of 22 base64url characters (132 bits) and their `sha256:<hex>` stored form,
// and the 22 character asset key of the public store. Nothing here prints a token: the callers
// show a share token once, in the answer, and store the hash.
import { createHash, randomBytes } from 'node:crypto';

const CROCKFORD = '0123456789abcdefghjkmnpqrstvwxyz';

/** A ULID (26 characters, lower case): 48 bits of time, 80 random bits; monotonic within one process at one millisecond. */
export function ulid(now: number = Date.now()): string {
  let time = now;
  let out = '';
  for (let i = 0; i < 10; i += 1) {
    out = CROCKFORD.charAt(time % 32) + out;
    time = Math.floor(time / 32);
  }
  const random = randomBytes(10);
  let bits = 0;
  let buffer = 0;
  let tail = '';
  for (const byte of random) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      tail += CROCKFORD.charAt((buffer >> bits) & 31);
    }
  }
  return (out + tail).slice(0, 26);
}

/** `lnk_<id>`, `req_<id>`: 16 base64url characters after the prefix. */
export function recordId(prefix: 'lnk' | 'req'): string {
  return `${prefix}_${randomBytes(12).toString('base64url')}`;
}

/** A share token: 22 base64url characters (132 bits, SPEC-3 0.15). */
export function shareToken(): string {
  return randomBytes(17).toString('base64url').slice(0, 22);
}

/** The 22 character public store segment of a deck (SPEC-3 6.1 assetKey). */
export function assetKey(): string {
  return shareToken();
}

/** The stored form of a token: never the token. */
export function hashToken(token: string): string {
  return `sha256:${createHash('sha256').update(token).digest('hex')}`;
}
