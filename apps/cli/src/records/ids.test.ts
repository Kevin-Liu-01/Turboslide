// The identifiers of the side records (gslides-parity SPEC-3 5.1, 6.1): ULIDs sort by time and
// are Crockford base32, `lnk_` and `req_` record ids carry 16 base64url characters, share tokens
// are 22 characters of base64url from 16 random bytes and hash to a `sha256:` prefix the record
// stores in place of the token, and the asset key of a deck is another 22 character token.
import { describe, expect, test } from 'vitest';

import { assetKey, hashToken, recordId, shareToken, ulid } from './ids.ts';

describe('record ids', () => {
  test('ulid is 26 Crockford characters, monotonic by time and unique', () => {
    const a = ulid(1_000_000);
    const b = ulid(2_000_000);
    expect(a).toMatch(/^[0-9a-hjkmnp-tv-z]{26}$/);
    expect(a.slice(0, 10) < b.slice(0, 10)).toBe(true);
    const many = new Set(Array.from({ length: 2000 }, () => ulid()));
    expect(many.size).toBe(2000);
  });

  test('record ids carry their prefix, tokens are 22 base64url characters and hash with the sha256 prefix', () => {
    expect(recordId('lnk')).toMatch(/^lnk_[A-Za-z0-9_-]{16}$/);
    expect(recordId('req')).toMatch(/^req_[A-Za-z0-9_-]{16}$/);
    expect(recordId('lnk')).not.toBe(recordId('lnk'));
    const token = shareToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(shareToken()).not.toBe(token);
    const hash = hashToken(token);
    expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(hashToken(token)).toBe(hash);
    expect(hashToken(shareToken())).not.toBe(hash);
    expect(assetKey()).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });
});
