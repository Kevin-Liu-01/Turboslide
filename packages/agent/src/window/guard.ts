// The window transport's nonce guard (gslides-parity SPEC-3 0.32, 6.6, 8.13; report 10 F47): the
// share, comment, invite, access, notification, account, publish and admin handlers are refused
// through `window.turboslide.studio.invoke` unless the call carries the page's nonce, a value the
// owner mints at boot and holds in a closure (never on `window`, never in describe()). A script
// that runs in the origin (the reason the `html` block is sandboxed and sanitized) can therefore
// not loosen a deck's access or post a comment as the victim through the automation surface; the
// editor's own dialogs reach the same handlers through the owner's dispatcher, which knows the
// nonce. The refusal is one fixed sentence and never names the nonce. Agents drive these actions
// over the HTTP and MCP transports with a key (SPEC-3 3.10), which the guard does not touch.
// Framework free.

/** The action id prefixes and ids the guard covers (the same list apps/studio/src/server/agent-actions.ts holds). */
export const NONCE_GUARDED_PREFIXES: ReadonlyArray<string> = [
  'share.',
  'comment.',
  'notification.',
  'admin.',
  'account.',
  'deck.publish',
  'deck.unpublish',
];

/** The input field that carries the nonce; stripped before the handler sees the input. */
export const NONCE_FIELD = '__nonce';

/** The refusal, in the words of SPEC-3 6.8: no internal noun, no hint at the value. */
export const NONCE_REFUSAL = 'This action is available from the presentation’s own controls';

export function isNonceGuarded(action: string): boolean {
  return NONCE_GUARDED_PREFIXES.some((prefix) =>
    prefix.endsWith('.') ? action.startsWith(prefix) : action === prefix,
  );
}

/** A 128 bit nonce as base64url; the owner mints one per page and keeps it in a closure. */
export function mintPageNonce(random: (bytes: Uint8Array) => Uint8Array = fillRandom): string {
  const bytes = random(new Uint8Array(16));
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fillRandom(bytes: Uint8Array): Uint8Array {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.getRandomValues) {
    const filled = new Uint8Array(bytes.length);
    c.getRandomValues(filled);
    bytes.set(filled);
    return bytes;
  }
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return bytes;
}

/** Constant time equality on two short strings. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type GuardResult = { ok: true; input: unknown } | { ok: false; error: Error };

/**
 * Checks one invocation: an unguarded action passes as it is; a guarded one passes when the input
 * carries the page's nonce under `__nonce`, which is removed before the handler runs; otherwise
 * the fixed refusal as an Error (never a RangeError, so a caller cannot mistake it for an unknown
 * action).
 */
export function guardInvocation(nonce: string, action: string, input: unknown): GuardResult {
  if (!isNonceGuarded(action)) return { ok: true, input };
  if (typeof input === 'object' && input !== null && !Array.isArray(input)) {
    const record = input as Record<string, unknown>;
    const given = record[NONCE_FIELD];
    if (typeof given === 'string' && same(given, nonce)) {
      const { [NONCE_FIELD]: _nonce, ...rest } = record;
      return { ok: true, input: rest };
    }
  }
  return { ok: false, error: new Error(NONCE_REFUSAL) };
}

/**
 * The nonce holder an owner keeps: `withNonce(input)` stamps an input for the owner's own
 * dispatcher path, `guard(action, input)` checks a call from the automation surface. The nonce
 * itself never leaves the closure.
 */
export type PageNonce = {
  withNonce: (input: unknown) => unknown;
  guard: (action: string, input: unknown) => GuardResult;
};

export function createPageNonce(nonce: string = mintPageNonce()): PageNonce {
  return {
    withNonce: (input) =>
      typeof input === 'object' && input !== null && !Array.isArray(input)
        ? { ...(input as Record<string, unknown>), [NONCE_FIELD]: nonce }
        : { [NONCE_FIELD]: nonce },
    guard: (action, input) => guardInvocation(nonce, action, input),
  };
}
