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
 *
 * The middlewares are server modules (the cookie reads the state folder, the headers module reads
 * node:crypto) and this file is imported by the client entry as well (hydrateStart reads the
 * start options), so they load behind `import.meta.env.SSR` inside the options function: the
 * browser gets an empty list and no node module enters its graph (measured: the editor failed at
 * packages/store/src/lease.ts "node:fs has been externalized" through
 * start.ts > auth/middleware.ts > root.ts when the imports were static).
 */
async function serverRequestMiddleware(): Promise<AnyRequestMiddleware[]> {
  const [{ principalMiddleware }, headers] = await Promise.all([
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
  ];
}

/**
 * The seams bound once per server process (the integrator at merge 2; gslides-parity SPEC-3 6.2,
 * 6.4, 6.7, 8.3, 8.13): `authorize()` reads the access record through B2's access store
 * (b2.md R13), the identity runtime finds a share link and lists a caller's decks through the
 * store (b3.md R14a), and on the redis tier the rate limiter, the kill switches' reader and the
 * download nonce set ride the same Redis client (b4.md 2.4.3e, 2.4.7); with Upstash REST
 * variables the limiter is the Upstash one; hosted with neither, the limiter stays in memory per
 * instance and the process logs that once (b4.md section 3). Idempotent: binding twice rebinds
 * the same seams.
 */
async function bindServerSeams(): Promise<void> {
  const [authorize, access, identity, links, root, room, ratelimit, tokens, index] =
    await Promise.all([
      import('./server/authorize'),
      import('./server/access'),
      import('./server/auth/identity'),
      import('./server/auth/links'),
      import('./server/root'),
      import('./server/room'),
      import('./server/ratelimit'),
      import('./server/tokens'),
      import('./server/index'),
    ]);
  authorize.bindAuthorize({ loadRecord: access.loadAccessRecord });
  identity.bindIdentityHooks({
    findShareLink: async (hash) => {
      const now = new Date();
      const heads = await root.listStoredDecks();
      for (const head of heads) {
        const record = await access.readAccess(head.id).catch(() => null);
        if (record === null) continue;
        const hit = links.findLinkInRecord(record, hash, now);
        if (hit !== null) return hit;
      }
      // a miss through the cache: the link may have been minted on another instance seconds ago
      // (VERIFICATION-3 finding 34), so one pass past the cache before the 404; an unknown token
      // costs one store read per deck, bounded by the deck count
      for (const head of heads) {
        const stored = await access.readStoredAccessFresh(head.id).catch(() => null);
        if (stored === null) continue;
        const hit = links.findLinkInRecord(stored.record, hash, now);
        if (hit !== null) return hit;
      }
      return null;
    },
    deckIndex: (principalId, view) => index.accountDecks({ principalId, admin: false }, view),
  });
  const redis = room.redisCommands();
  if (redis !== null) {
    const kv = {
      get: async (key: string) => {
        const reply = await redis.call('GET', key);
        return typeof reply === 'string' ? reply : null;
      },
      set: async (key: string, value: string, ttlMs: number) => {
        await redis.call('SET', key, value, 'PX', Math.max(1, Math.round(ttlMs)));
      },
      del: async (key: string) => {
        await redis.call('DEL', key);
      },
    };
    ratelimit.bindRateLimiter(ratelimit.kvLimiter(kv));
    tokens.bindSpentSet(tokens.kvSpentSet(kv));
  }
  if (ratelimit.hasUpstash()) {
    const [{ Ratelimit }, { Redis }] = await Promise.all([
      import('@upstash/ratelimit'),
      import('@upstash/redis'),
    ]);
    const client = Redis.fromEnv();
    ratelimit.bindRateLimiter(
      ratelimit.upstashLimiter(
        (limit, windowMs) =>
          new Ratelimit({
            redis: client,
            limiter: Ratelimit.slidingWindow(
              limit,
              `${Math.max(1, Math.round(windowMs / 1000))} s`,
            ),
            prefix: 'turboslide:q',
          }),
      ),
    );
  }
  // On the platform with neither: Fluid compute runs several instances, the quotas count per
  // instance and do not hold (VERIFICATION-3 finding 17); one `config.degraded` line names the
  // variables, and the WAF rules carry the limits. A checkout is one process, tmp store or not.
  const platform = process.env.VERCEL !== undefined && process.env.VERCEL !== '';
  ratelimit.warnPerInstanceQuotas(root.isHosted() && platform);
}

export const startInstance = createStart(async () => ({
  requestMiddleware: import.meta.env.SSR ? await serverRequestMiddleware() : [],
}));
