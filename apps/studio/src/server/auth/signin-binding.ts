// The browser that asked (docs/hardening/HARDENING.md HR-SA#2a; AUTH-4 in
// docs/hardening/research/auth-verify.md): a sign in mail's link and its six digit code sign in
// only the browser that asked for the mail. The request for the mail sets a short lived cookie
// that names the address under the library's secret; the link's verify and the code's sign in
// run only when the browser carries that cookie for the address. A link opened in another
// browser does not sign in there and writes nothing: it lands on /signin, which asks for the
// eight character code the asking browser shows beside "Check your email". The code is a MAC of
// the link's token, so it is worth nothing without the link, and the link is worth nothing in a
// second browser without the code. Before this, opening someone else's link signed the opener's
// browser into that account and the session hook joined the browser's decks to it.
//
// One better-auth plugin: an after hook on the two mail requests sets the cookie (and answers
// the code to the asking page), a before hook on the two verifies refuses or redirects, and
// `/sign-in/pair` takes the code in the second browser and sets the cookie there.
import { createHash, createHmac } from 'node:crypto';

import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthEndpoint, createAuthMiddleware, isAPIError } from 'better-auth/api';

import { safeEqual } from '@turboslide/identity/safe-equal';

/** The cookie's name; a hosted deployment adds `__Host-`, so no other host can set it. */
export const BINDING_COOKIE = 'ts.signin_browser';
/** The page a link opened in another browser lands on; it asks for the code. */
export const CONFIRM_QUERY = 'confirm';
/** The code's alphabet: no 0, 1, I or O, as the device code reads. */
export const PAIR_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const PAIR_LENGTH = 8;
/** Addresses one browser can be waiting on at once; the oldest leaves first. */
export const BINDINGS_PER_BROWSER = 3;
/** The refusal's code when a verify runs in a browser that did not ask. */
export const OTHER_BROWSER = 'OTHER_BROWSER';
export const WRONG_PAIR_CODE = 'WRONG_PAIR_CODE';
/** Wrong codes one address may try in ten minutes before the link has to be asked for again. */
export const PAIR_TRIES = 10;
export const PAIR_PATH = '/sign-in/pair';

const MAIL_PATHS = new Set(['/sign-in/magic-link', '/email-otp/send-verification-otp']);
const VERIFY_LINK = '/magic-link/verify';
const VERIFY_CODE = '/sign-in/email-otp';

export function bindingCookieName(hosted: boolean): string {
  return hosted ? `__Host-${BINDING_COOKIE}` : BINDING_COOKIE;
}

function mac(secret: string, purpose: string, body: string): Buffer {
  return createHmac('sha256', secret).update(`turboslide ${purpose}\n${body}`).digest();
}

/** One entry of the cookie: the expiry in base 36 and a MAC of the address and the expiry. */
function entryFor(secret: string, email: string, exp: number): string {
  const stamp = exp.toString(36);
  const sum = mac(secret, 'sign in browser', `${email.toLowerCase()}\n${stamp}`)
    .toString('base64url')
    .slice(0, 22);
  return `${stamp}.${sum}`;
}

function entriesOf(value: string | null | undefined): string[] {
  if (typeof value !== 'string' || value === '') return [];
  return value.split('~').filter((entry) => /^[0-9a-z]{1,12}\.[A-Za-z0-9_-]{22}$/.test(entry));
}

function expiryOf(entry: string): number {
  return Number.parseInt(entry.slice(0, entry.indexOf('.')), 36);
}

/** True when the cookie names the address under this secret and has not expired. */
export function browserAsked(
  secret: string,
  value: string | null | undefined,
  email: string,
  now: number = Date.now(),
): boolean {
  let found = false;
  for (const entry of entriesOf(value)) {
    const exp = expiryOf(entry);
    // every entry is compared, so the time does not say which one matched
    const same = safeEqual(entry, entryFor(secret, email, exp));
    if (same && exp > now) found = true;
  }
  return found;
}

/** The cookie with the address added for `ttlS` seconds: unexpired entries kept, newest first. */
export function withBinding(
  secret: string,
  value: string | null | undefined,
  email: string,
  ttlS: number,
  now: number = Date.now(),
): string {
  const exp = Math.floor(now / 1000) * 1000 + ttlS * 1000;
  const kept = entriesOf(value).filter((entry) => expiryOf(entry) > now);
  return [entryFor(secret, email, exp), ...kept].slice(0, BINDINGS_PER_BROWSER).join('~');
}

/** The code the asking browser shows for the link's token: eight characters of the alphabet. */
export function pairCodeFor(secret: string, token: string): string {
  const bytes = mac(secret, 'sign in pair', token);
  let code = '';
  for (let i = 0; i < PAIR_LENGTH; i += 1) code += PAIR_ALPHABET[(bytes[i] ?? 0) % 32];
  return code;
}

/** A typed code as the server compares it: letters and digits, upper case. */
export function cleanPairCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** The verification row's key of a link token (the magic link plugin's `storeToken: 'hashed'`). */
export function storedTokenOf(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('base64url');
}

/* the code of the link a mail request minted, from the plugin's send callback to its after hook:
   one request's endpoint and hooks share the request's context object */
const pairCodes = new WeakMap<object, string>();

/** Called by `sendMagicLink` with its context and the token: the after hook answers the code. */
export function notePairCode(
  ctx: { context: object & { secret: string } } | undefined,
  token: string,
): void {
  if (ctx === undefined) return;
  pairCodes.set(ctx.context, pairCodeFor(ctx.context.secret, token));
}

type VerificationRow = { value: string; expiresAt: Date | string };

async function linkAddress(
  adapter: { findVerificationValue: (identifier: string) => Promise<VerificationRow | null> },
  token: string,
  now: number,
): Promise<string | null> {
  const row = await adapter.findVerificationValue(storedTokenOf(token));
  if (row === null || new Date(row.expiresAt).getTime() <= now) return null;
  try {
    const parsed = JSON.parse(row.value) as { email?: unknown };
    return typeof parsed.email === 'string' ? parsed.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Where a link opened in another browser lands: /signin with the token and the return path. */
export function confirmAddress(
  baseURL: string,
  signInPage: string,
  token: string,
  callbackURL: string | undefined,
): string {
  const base = new URL(baseURL);
  const target = new URL(signInPage, base.origin);
  target.searchParams.set(CONFIRM_QUERY, token);
  if (callbackURL !== undefined && callbackURL !== '') {
    try {
      const back = new URL(decodeURIComponent(callbackURL), base.origin);
      if (back.origin === base.origin)
        target.searchParams.set('next', `${back.pathname}${back.search}${back.hash}`);
    } catch {
      // the return path is the page's default
    }
  }
  return target.toString();
}

export type SignInBindingOptions = {
  hosted: boolean;
  /** how long the cookie names the address: the life of the mail's link and code */
  ttlS: number;
  /** the sign in page (`/signin`) */
  signInPage: string;
  now?: () => number;
};

/** The plugin. Goes before the TanStack Start cookie plugin, which must stay last. */
export function signInBinding(options: SignInBindingOptions): BetterAuthPlugin {
  const now = options.now ?? (() => Date.now());
  const name = bindingCookieName(options.hosted);
  const cookieOptions = {
    httpOnly: true,
    // a link opened from a mail is a top level navigation from another site: Lax sends the cookie
    sameSite: 'lax' as const,
    secure: options.hosted,
    path: '/',
    maxAge: options.ttlS,
  };
  return {
    id: 'turboslide-sign-in-browser',
    endpoints: {
      signInPair: createAuthEndpoint(
        PAIR_PATH,
        { method: 'POST', requireHeaders: true },
        async (ctx) => {
          const body = (ctx.body ?? {}) as { token?: unknown; code?: unknown };
          const token = typeof body.token === 'string' ? body.token : '';
          const code = typeof body.code === 'string' ? cleanPairCode(body.code) : '';
          const email =
            token === '' ? null : await linkAddress(ctx.context.internalAdapter, token, now());
          if (email === null)
            throw new APIError('BAD_REQUEST', {
              code: 'INVALID_TOKEN',
              message: 'That link was used or has expired.',
            });
          if (!safeEqual(code, pairCodeFor(ctx.context.secret, token)))
            throw new APIError('FORBIDDEN', {
              code: WRONG_PAIR_CODE,
              message: 'That code does not match.',
            });
          ctx.setCookie(
            name,
            withBinding(ctx.context.secret, ctx.getCookie(name), email, options.ttlS, now()),
            cookieOptions,
          );
          return ctx.json({ status: true });
        },
      ),
    },
    hooks: {
      before: [
        {
          matcher: (ctx) => ctx.path === VERIFY_LINK || ctx.path === VERIFY_CODE,
          handler: createAuthMiddleware(async (ctx) => {
            const cookie = ctx.getCookie(name);
            if (ctx.path === VERIFY_CODE) {
              const email = (ctx.body as { email?: unknown } | undefined)?.email;
              if (typeof email !== 'string') return;
              if (browserAsked(ctx.context.secret, cookie, email.toLowerCase(), now())) return;
              throw new APIError('FORBIDDEN', {
                code: OTHER_BROWSER,
                message: 'Enter the code in the browser that asked for it.',
              });
            }
            const query = (ctx.query ?? {}) as { token?: unknown; callbackURL?: unknown };
            if (typeof query.token !== 'string' || query.token === '') return;
            const email = await linkAddress(ctx.context.internalAdapter, query.token, now());
            // a used or expired link: the library's own answer (INVALID_TOKEN) stands
            if (email === null) return;
            if (browserAsked(ctx.context.secret, cookie, email, now())) return;
            const callbackURL =
              typeof query.callbackURL === 'string' ? query.callbackURL : undefined;
            if (callbackURL === undefined)
              throw new APIError('FORBIDDEN', {
                code: OTHER_BROWSER,
                message: 'Open the link in the browser that asked for it.',
              });
            throw ctx.redirect(
              confirmAddress(ctx.context.baseURL, options.signInPage, query.token, callbackURL),
            );
          }),
        },
      ],
      after: [
        {
          matcher: (ctx) => MAIL_PATHS.has(ctx.path ?? ''),
          handler: createAuthMiddleware(async (ctx) => {
            const returned = ctx.context.returned;
            if (returned === undefined || isAPIError(returned)) return;
            const email = (ctx.body as { email?: unknown } | undefined)?.email;
            if (typeof email !== 'string') return;
            ctx.setCookie(
              name,
              withBinding(
                ctx.context.secret,
                ctx.getCookie(name),
                email.toLowerCase(),
                options.ttlS,
                now(),
              ),
              cookieOptions,
            );
            const pair = pairCodes.get(ctx.context);
            if (pair === undefined || typeof returned !== 'object' || returned === null) return;
            return ctx.json({ ...(returned as Record<string, unknown>), pair });
          }),
        },
      ],
    },
    rateLimit: [
      {
        pathMatcher: (path: string) => path === PAIR_PATH,
        window: 600,
        max: PAIR_TRIES,
      },
    ],
  };
}
