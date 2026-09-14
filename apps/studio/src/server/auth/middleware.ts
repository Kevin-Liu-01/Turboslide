// The request middleware that mints the identity cookie on the first request (gslides-parity
// SPEC-3 7.1): `principalMiddleware()` joins `requestMiddleware` in apps/studio/src/start.ts
// ahead of the CSRF middleware (b3.md request R3). It reads the cookie, mints one when the
// request carries none and no bearer, and sets it through the framework so the header lands on
// whatever response the handler returns. Routes and server functions read the principal with
// `readPrincipal(getRequest(), secret)` from session.ts; nothing is put on the request context.
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
