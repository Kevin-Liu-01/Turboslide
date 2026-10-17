import { createCsrfMiddleware, createStart } from '@tanstack/react-start';
import type { AnyRequestMiddleware } from '@tanstack/react-start';

/**
 * The Start instance (SPEC 11 "server functions use createCsrfMiddleware()"; MILESTONES M4 item
 * 1; gslides-parity SPEC-3 7.1, 8.7, 8.8). The request middleware runs in this order on every
 * request, server routes, SSR and server functions alike:
 *
 * 1. `principalMiddleware()` (B3, server/auth/middleware.ts) mints the sealed identity cookie on
 *    the first request without one, so the first document request already has a principal and
 *    every server function after it derives its author from the session (SPEC-3 7.1, 8.2).
 * 2. `securityHeadersMiddleware()` mints the request's CSP nonce and request id into the context
 *    and sets the headers of SPEC-3 8.8 on the answer: HSTS on https, nosniff, the frame rule with
 *    the `/embed` exception, the referrer rule with the `/s/*` exception, the permissions policy,
 *    COOP, CORP on the asset routes, `no-store` on every API answer, and the nonce based CSP as
 *    `Content-Security-Policy-Report-Only` (`TURBOSLIDE_CSP=enforce` after the report weeks).
 * 3. `contentTypeMiddleware()` refuses a body on a JSON route that is not `application/json`
 *    (415), so a cross site form POST never reaches a handler (SPEC-3 8.7; report 04 F13).
 * 4. The CSRF middleware validates Sec-Fetch-Site, Origin or Referer on every server function and
 *    on the routes `csrfFilter` names (the stream, ops and presence routes, comments, share,
 *    access, `/api/x/*`, avatar, notify, auth, `/device`; `/s/*` on unsafe methods only). The agent
 *    surface (/api/actions, /api/agent, /mcp) stays a bearer surface with the browser `Origin`
 *    refusal of server/headers.ts, because agents send no Origin.
 * 5. `mergeAskMiddleware()` (server/auth/middleware.ts) sends a document load of a page that lists
 *    or opens decks to /signin while the browser's merge question is open (HR-SA#2b), so a sign
 *    in from the editor's own window is asked too.
 *
 * The middlewares are server modules (the cookie reads the state folder, the headers module reads
 * node:crypto) and this file is imported by the client entry as well (hydrateStart reads the
 * start options), so they load behind `import.meta.env.SSR` inside the options function: the
 * browser gets an empty list and no node module enters its graph (measured: the editor failed at
 * packages/store/src/lease.ts "node:fs has been externalized" through
 * start.ts > auth/middleware.ts > root.ts when the imports were static).
 */
async function serverRequestMiddleware(): Promise<AnyRequestMiddleware[]> {
  const [{ mergeAskMiddleware, principalMiddleware }, headers] = await Promise.all([
    import('./server/auth/middleware'),
    import('./server/headers'),
  ]);
  await bindServerSeams();
  return [
    principalMiddleware(),
    headers.securityHeadersMiddleware(),
    headers.contentTypeMiddleware(),
    createCsrfMiddleware({
      filter: (ctx) => headers.csrfFilter(ctx),
      failureResponse: (ctx) => headers.csrfFailure(ctx),
    }),
    mergeAskMiddleware(),
  ];
}

/**
 * The seams bound once per server process (the integrator at merge 2; gslides-parity SPEC-3 6.2,
 * 6.4, 6.7, 8.3, 8.13): `authorize()` reads the access record through B2's access store
 * (b2.md R13), the identity runtime finds a share link and lists a caller's decks through the
 * store (b3.md R14a), and an accounts database many instances share (D1) binds the one limiter
 * over its `ts_limits` table for the quotas and the download nonce set (HR-SA#3); hosted without
 * one, the limiter stays in memory per instance and the process logs that once (b4.md section 3).
 * The Redis and Upstash binds left in HR-C#8. Idempotent: binding twice rebinds the same seams.
 */
async function bindServerSeams(): Promise<void> {
  // the room module is loaded here for its side effect, the pulse rule of every commit of the
  // process (room.ts `setPulseRule`, HR-PS#3), before a request reaches a store
  const [authorize, access, identity, root, , ratelimit, tokens, index] = await Promise.all([
    import('./server/authorize'),
    import('./server/access'),
    import('./server/auth/identity'),
    import('./server/root'),
    import('./server/room'),
    import('./server/ratelimit'),
    import('./server/tokens'),
    import('./server/index'),
  ]);
  authorize.bindAuthorize({ loadRecord: access.loadAccessRecord });
  identity.bindIdentityHooks({
    // the link hash index names the deck and one record read answers, read past this instance's
    // cache when the exchange asks (VERIFICATION-3 finding 34 F1 and F2; server/access.ts); a
    // miss falls back to the scan of every stored deck's record
    findShareLink: (hash, options) => access.findShareLink(hash, options),
    deckIndex: (principalId, view) => index.accountDecks({ principalId, admin: false }, view),
    // before an account's rows go, its decks move to the trash and its grants on other decks, its
    // deck index and its picture files go (HR-SD#2); one function, so it is bound once
    beforeDelete: (await import('./server/auth/account-delete')).beforeAccountDelete,
  });
  // The one limiter (HR-SA#3, AUTH-8): when the accounts engine is one many instances share (D1
  // on both Vercel projects), the quotas and the download tokens' spent set count in its
  // `ts_limits` table, as better-auth's sign in limits do (identity.ts builds it with the runtime).
  // A runtime that cannot be built (a SQLite file named on a hosted process, a half set D1 pair)
  // is the identity paths' to report, as before, and the limiter stays in memory
  let limits: ReturnType<typeof identity.identityRuntime>['limits'] = null;
  try {
    limits = identity.identityRuntime().limits;
  } catch {
    limits = null;
  }
  if (limits !== null) {
    ratelimit.bindRateLimiter(limits);
    tokens.bindSpentSet(tokens.limiterSpentSet(limits));
  }
  // On the platform with none of them: Fluid compute runs several instances, the quotas count per
  // instance and do not hold (VERIFICATION-3 finding 17); one `config.degraded` line names the
  // variables, and the WAF rules carry the limits. A checkout is one process, tmp store or not.
  const platform = process.env.VERCEL !== undefined && process.env.VERCEL !== '';
  ratelimit.warnPerInstanceQuotas(root.isHosted() && platform);
}

export const startInstance = createStart(async () => ({
  requestMiddleware: import.meta.env.SSR ? await serverRequestMiddleware() : [],
}));
