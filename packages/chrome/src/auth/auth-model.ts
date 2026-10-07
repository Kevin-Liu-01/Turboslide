/**
 * The auth plate's model (docs/POLISH-2.md 4.2 to 4.4): the states every sign in surface draws,
 * the events that move between them, the reasons a library code names, and the one rule for a
 * return address. Framework free, so the page, the window, the gallery and the tests read one
 * definition. The plate itself is AuthPlate.tsx; the words are auth-words.ts.
 */

/** The deployment's methods, as the server reads them (better-auth.ts `signInMethods`). */
export type AuthMethods = {
  /** the deployment has an identity database; without one no method can complete */
  available: boolean;
  google: boolean;
  github: boolean;
  /** the magic link and the six digit code: a database and a mail sender */
  email: boolean;
};

export const NO_METHODS: AuthMethods = {
  available: false,
  google: false,
  github: false,
  email: false,
};

/** What the plate is for: signing in, or signing in so the command line can be approved (/device). */
export type AuthPurpose = 'sign-in' | 'device';

/** Why a sign in did not complete, from the code the library or the provider sent back. */
export type AuthReason = 'cancelled' | 'expired' | 'link' | 'account' | 'other';

/** What a typed six digit code answered. */
export type CodeProblem = 'code-wrong' | 'code-expired' | 'code-spent';

/** What the address step answered when the mail was refused before it left. */
export type AddressProblem = 'address-invalid' | 'address-quota' | 'request-failed';

/** What a typed device code answered. */
export type DeviceProblem = 'code-wrong' | 'spent' | 'expired';

export type AuthState =
  | {
      step: 'methods';
      /** a provider the browser is leaving for */
      leaving?: 'google' | 'github';
      problem?: AddressProblem;
    }
  | { step: 'sent'; email: string; problem?: CodeProblem | 'address-quota' }
  | { step: 'error'; reason: AuthReason; code: string }
  | { step: 'device'; problem?: DeviceProblem }
  | { step: 'approved'; email: string }
  | { step: 'denied' };

export type AuthEvent =
  | { type: 'leave'; provider: 'google' | 'github' }
  | { type: 'left-failed' }
  | { type: 'address-refused'; problem: AddressProblem }
  | { type: 'sent'; email: string }
  | { type: 'code-refused'; problem: CodeProblem }
  | { type: 'quota' }
  | { type: 'another-address' }
  | { type: 'try-again' }
  | { type: 'device-refused'; problem: DeviceProblem }
  | { type: 'approved'; email: string }
  | { type: 'denied' };

/** The one state machine of every host. */
export function nextState(state: AuthState, event: AuthEvent): AuthState {
  switch (event.type) {
    case 'leave':
      return { step: 'methods', leaving: event.provider };
    case 'left-failed':
      return { step: 'methods', problem: 'request-failed' };
    case 'address-refused':
      return { step: 'methods', problem: event.problem };
    case 'sent':
      return { step: 'sent', email: event.email };
    case 'code-refused':
      return state.step === 'sent' ? { ...state, problem: event.problem } : state;
    case 'quota':
      return state.step === 'sent' ? { ...state, problem: 'address-quota' } : state;
    case 'another-address':
    case 'try-again':
      return { step: 'methods' };
    case 'device-refused':
      return { step: 'device', problem: event.problem };
    case 'approved':
      return { step: 'approved', email: event.email };
    case 'denied':
      return { step: 'denied' };
  }
}

const CANCELLED = new Set(['access_denied']);
const EXPIRED = new Set([
  'state_not_found',
  'state_mismatch',
  'invalid_callback_request',
  'please_restart_the_process',
]);
const LINK = new Set(['invalid_token', 'expired_token', 'attempts_exceeded']);
const ACCOUNT = new Set([
  'account_not_linked',
  'unable_to_link_account',
  'email_not_found',
  "email_doesn't_match",
  'email_does_not_match',
  'account_already_linked_to_different_user',
]);

/** The reason a code names: better-auth's callback codes, Google's `access_denied`, the link's codes. */
export function reasonOf(code: string): AuthReason {
  const key = code.trim().toLowerCase();
  if (CANCELLED.has(key)) return 'cancelled';
  if (EXPIRED.has(key)) return 'expired';
  if (LINK.has(key)) return 'link';
  if (ACCOUNT.has(key)) return 'account';
  return 'other';
}

/**
 * The code as the page may print it: letters, digits, underscores and the apostrophe of
 * `email_doesn't_match`, at most 64 characters, so nothing a link carries reaches the page as markup
 * or as a long string.
 */
export function cleanCode(code: string): string {
  return code.replace(/[^A-Za-z0-9_']/g, '').slice(0, 64);
}

/** The error state of a code, or null when there is no code. */
export function errorState(code: string | null | undefined): AuthState | null {
  if (code === null || code === undefined) return null;
  const clean = cleanCode(code);
  if (clean === '') return null;
  return { step: 'error', reason: reasonOf(clean), code: clean };
}

/** Where a page goes when nothing names a return: the person's presentations. */
export const DEFAULT_NEXT = '/decks';

/**
 * A return address the plate may send a person to: a same origin path that starts with one `/`,
 * with no `//`, no `\`, no scheme, no control character, and not the sign in page itself or an
 * API route (a signed in visitor at `/signin?next=/signin` would be sent in a circle). Anything
 * else reads `/decks`.
 */
export function safeNext(path: string | null | undefined): string {
  if (typeof path !== 'string') return DEFAULT_NEXT;
  const value = path.trim();
  if (!value.startsWith('/') || value.startsWith('//')) return DEFAULT_NEXT;
  if (value.includes('\\') || /[\u0000-\u001f\u007f]/.test(value)) return DEFAULT_NEXT;
  if (/^\/[a-z][a-z0-9+.-]*:/i.test(value)) return DEFAULT_NEXT;
  const pathname = value.split(/[?#]/)[0] ?? '';
  if (/^\/(signin|api)(\/|$)/i.test(pathname)) return DEFAULT_NEXT;
  if (value.length > 512) return DEFAULT_NEXT;
  return value;
}

/** The sign in page's address with a return path, as every Sign In link writes it. */
export function signInHref(next: string): string {
  return `/signin?next=${encodeURIComponent(safeNext(next))}`;
}

/**
 * Where a provider or a magic link lands when the sign in fails (better-auth's
 * `errorCallbackURL`): the sign in page with the same return path, so Cancel at Google comes home
 * to a sentence and Try Again (docs/POLISH-2.md C14). Same origin, so the library's origin check
 * accepts it as it accepts `callbackURL`.
 */
export function errorCallbackURL(next: string): string {
  return signInHref(next);
}

/* the error an editor's address carried (`?error=`), held for the sign in window that opens
   next: the route reads the address, the window reads this once (dialogs/SignIn.tsx) */
let heldError: AuthState | null = null;

/** Holds the error state of a code for the next sign in window; null codes are ignored. */
export function holdSignInError(code: string | null | undefined): AuthState | null {
  heldError = errorState(code);
  return heldError;
}

/** The held error state, once: the next call answers null. */
export function takeHeldSignInError(): AuthState | null {
  const held = heldError;
  heldError = null;
  return held;
}

/** The id a state draws as `data-auth-plate`, the gallery's and the rows' name for it (4.4). */
export function stateId(state: AuthState, methods: AuthMethods, purpose: AuthPurpose): string {
  switch (state.step) {
    case 'methods': {
      if (purpose === 'device') return 'device.sign-in-first';
      if (state.leaving !== undefined) return 'methods.leaving';
      if (!methods.available) return 'methods.none';
      const providers = methods.google || methods.github;
      if (!providers && !methods.email) return 'methods.none';
      if (!providers) return 'methods.email';
      if (methods.google && methods.github && methods.email) return 'methods.all';
      if (methods.email) return 'methods.google-email';
      return 'methods.google';
    }
    case 'sent':
      return state.problem === undefined || state.problem === 'address-quota'
        ? 'email.sent'
        : `email.${state.problem}`;
    case 'error':
      return `error.${state.reason}`;
    case 'device':
      return state.problem === undefined ? 'device.code' : `device.${state.problem}`;
    case 'approved':
      return 'device.approved';
    case 'denied':
      return 'device.denied';
  }
}

/** Whether a state draws any control that can sign in (the methods step on a deployment with one). */
export function offersMethod(methods: AuthMethods): boolean {
  return methods.available && (methods.google || methods.github || methods.email);
}

/**
 * What a refused code exchange answered, from better-auth's email OTP codes (`INVALID_OTP`,
 * `OTP_EXPIRED`, `TOO_MANY_ATTEMPTS`) or their messages ("Invalid OTP", "OTP expired", "Too many
 * attempts"), which is what the editor's exchange throws.
 */
export function codeProblemOf(code: string | undefined, message: string | undefined): CodeProblem {
  const text = `${code ?? ''} ${message ?? ''}`.toLowerCase();
  if (text.includes('expired')) return 'code-expired';
  if (text.includes('too_many') || text.includes('too many')) return 'code-spent';
  return 'code-wrong';
}

/** An exchange's refusal with the library's code, so the plate can say which sentence. */
export class AuthRefusal extends Error {
  readonly code: string;
  readonly status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'AuthRefusal';
    this.status = status;
    this.code = code;
  }
}

/** The code and the message of any error an exchange threw. */
export function refusalOf(error: unknown): { status: number; code: string; message: string } {
  if (error instanceof AuthRefusal)
    return { status: error.status, code: error.code, message: error.message };
  if (error instanceof Error) return { status: 0, code: '', message: error.message };
  return { status: 0, code: '', message: String(error) };
}

/** What a refused mail request answered: an address the library refused, its limit, or anything else. */
export function addressProblemOf(error: unknown): AddressProblem {
  const { status, code, message } = refusalOf(error);
  if (status === 429) return 'address-quota';
  const text = `${code} ${message}`.toLowerCase();
  if (text.includes('email') && (text.includes('invalid') || text.includes('validation')))
    return 'address-invalid';
  return 'request-failed';
}

/** The mails one address may receive in a window (better-auth.ts `MAILS_PER_ADDRESS`), and the window. */
export const MAILS_PER_ADDRESS = 3;
export const MAILS_WINDOW_MS = 10 * 60_000;
/** The wait between two mails to one address, which Send Another counts down. */
export const RESEND_WAIT_MS = 45_000;

/** The mails this browser asked for an address within the window, oldest first. */
export function sendsInWindow(stamps: readonly number[], now: number): number[] {
  return stamps.filter((at) => at <= now && now - at < MAILS_WINDOW_MS).sort((a, b) => a - b);
}

/** Whether one more mail to the address fits the window, given the stamps of the earlier ones. */
export function canSend(stamps: readonly number[], now: number): boolean {
  return sendsInWindow(stamps, now).length < MAILS_PER_ADDRESS;
}

/** The milliseconds until Send Another may send again (0 when it may), from the last send. */
export function resendWait(lastSentAt: number | null, now: number): number {
  if (lastSentAt === null) return 0;
  return Math.max(0, lastSentAt + RESEND_WAIT_MS - now);
}

/** A wait as the countdown prints it: m:ss. */
export function clock(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** A device code as the person types it: letters and digits only, upper case, at most eight. */
export function cleanDeviceCode(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
}

/** A device code in its two groups of four, as the inputs draw it. */
export function deviceGroups(code: string): [string, string] {
  const clean = cleanDeviceCode(code);
  return [clean.slice(0, 4), clean.slice(4, 8)];
}
