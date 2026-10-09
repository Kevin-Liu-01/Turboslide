// The one constant time comparison of the codebase (docs/hardening/HARDENING.md HR-SA#1;
// CLEANUP-1, CRIT-M8). Every MAC, grant, ticket, bearer and cron secret the studio, the agent
// package, the realtime Worker and the render worker check goes through this file, and a test in
// safe-equal.test.ts holds that no other source file calls a timing safe compare of its own.
// Strings are compared as their UTF-8 bytes, so two strings of the same length but different
// byte lengths (32 `é` against 32 hex characters) answer false instead of throwing, which
// `node:crypto`'s compare did. A length difference answers at once: the lengths of a MAC and of
// a digest are public, and a caller that must hide a secret's length compares digests. No
// `node:` import, so the browser, the function, the Worker and node share this file.

const encoder = new TextEncoder();

/** True when the two byte strings are equal. Every byte is read whatever the first difference. */
export function safeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < a.byteLength; i += 1) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/** True when the two strings have the same UTF-8 bytes. Never throws. */
export function safeEqual(a: string, b: string): boolean {
  return safeEqualBytes(encoder.encode(a), encoder.encode(b));
}
