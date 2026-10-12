// The request middleware that mints the identity cookie on the first request (gslides-parity
// SPEC-3 7.1): `principalMiddleware()` joins `requestMiddleware` in apps/studio/src/start.ts
// ahead of the CSRF middleware (b3.md request R3). It reads the cookie, mints one when the
// request carries none and no bearer, and sets it through the framework so the header lands on
// whatever response the handler returns. Routes and server functions read the principal through
// room.ts `requestIdentity` (authorize.ts `requestContext` for the server functions), which takes
// the principal bound here before the cookie; nothing is put on the request context.
import { createMiddleware } from '@tanstack/react-start';
import { setCookie } from '@tanstack/react-start/server';

import { stateDir } from '../root';
import { sessionSecret } from './secret.ts';
import {
  ANON_COOKIE,
  ANON_COOKIE_MAX_AGE_S,
  bindRequestPrincipal,
  ensurePrincipal,
} from './session.ts';

let cached: string | undefined;

/** The process wide session secret, resolved once (secret.ts says where it comes from). */
export function studioSessionSecret(): string {
  if (cached === undefined) {
    const hosted = process.env.VERCEL !== undefined && process.env.VERCEL !== '';
    cached = sessionSecret(process.env, hosted ? undefined : stateDir()).secret;
  }
  return cached;
}

export function principalMiddleware() {
  return createMiddleware({ type: 'request' }).server(async ({ request, next }) => {
    // a request with a bearer: the key is read by its hash before the routes' synchronous checks
    // when this instance has not read it within KEY_CACHE_MS (HR-SA#6, AUTH-5; auth/tokens.ts)
    if (request.headers.get('authorization') !== null) await primeBearer(request);
    const ensured = await ensurePrincipal(request, studioSessionSecret());
    if (ensured !== null) bindRequestPrincipal(request, ensured);
    if (ensured?.minted && ensured.setCookie) {
      const value = ensured.setCookie.split(';')[0]?.slice(ensured.cookieName.length + 1) ?? '';
      setCookie(ensured.cookieName, value, {
        path: '/',
        maxAge: ANON_COOKIE_MAX_AGE_S,
        httpOnly: true,
        sameSite: 'lax',
        secure: ensured.cookieName === ANON_COOKIE,
      });
    }
    return next();
  });
}

/**
 * The merge question before the pages that list or open decks (HR-SA#2b; verifier pass 2,
 * regression finding 1): a document load of such a page by a signed in browser whose decks made
 * before the sign in wait for an answer goes to /signin with the page as `next` (307), where the
 * question is asked; the answer returns to the page. A runtime that cannot answer lets the
 * request through, as an unanswered store does in `linkOrAsk`.
 */
/**
 * Primes the identity runtime's key store for the request's bearer (HR-SA#6). The runtime loads
 * here, as mergeAskMiddleware loads it, so identity.ts stays out of this module's graph; a store
 * that cannot be read leaves the request to the routes, which refuse an unread key.
 */
async function primeBearer(request: Request): Promise<void> {
  try {
    const [{ identityRuntime }, { bearerToken }] = await Promise.all([
      import('./identity.ts'),
      import('@turboslide/agent/http/auth'),
    ]);
    const bearer = bearerToken(request);
    if (bearer !== undefined && bearer !== '') await identityRuntime().keys.prime(bearer);
  } catch {
    // the routes answer the request as they would with a cold store
  }
}

export function mergeAskMiddleware() {
  return createMiddleware({ type: 'request' }).server(async ({ request, next, pathname }) => {
    let location: string | null = null;
    try {
      // the runtime's module loads with the first request, as start.ts loads this one: room.ts and
      // authorize.ts import this file for the session secret, and identity.ts stays out of their graph
      const { identityRuntime, mergeAskLocation } = await import('./identity.ts');
      location = await mergeAskLocation(identityRuntime(), request, pathname);
    } catch {
      location = null;
    }
    if (location === null) return next();
    return new Response(null, {
      status: 307,
      headers: { location, 'cache-control': 'no-store' },
    });
  });
}
