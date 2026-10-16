// The caller of the routes that kept their round one bearer check (`/api/render`, `/api/export`
// and the two bundle routes; server/auth.ts says why): the deployment bearer, a page's grant or
// ticket, or, since the post-deploy review of caa20174, an API key. /docs/agents/http tells a
// hosted agent to send the key `turboslide login` saved, and `turboslide deck push` and
// `deck pull` send it, but these routes compared the bearer with TURBOSLIDE_TOKEN alone and
// answered 401 to every key. A key now admits the request and acts as its owner with its scopes
// (auth/identity.ts `requestIdentity`, the identity the agent gate decides for), so `authorize()`
// decides the deck at the route's capability for the key as it does on `/api/actions`.
import { bearerToken } from '@turboslide/agent/http/auth';
import type { AuthContext } from '@turboslide/identity/access';

import { identityRuntime, requestIdentity } from './auth/identity';
import { isKeySecret } from './auth/tokens';
import { requestContext } from './authorize';

/**
 * The context of the live API key a request bears: the key's owner with the key's scopes. Null
 * for every other request: no bearer, the deployment bearer, and an unknown, revoked or expired
 * key, which the route's own check then refuses.
 */
export async function bearerKeyContext(request: Request): Promise<AuthContext | null> {
  const given = bearerToken(request);
  if (given === undefined || !isKeySecret(given)) return null;
  try {
    const identity = await requestIdentity(request, identityRuntime(), { mint: false });
    return identity.kind === 'agent' && identity.agent !== null ? identity.ctx : null;
  } catch {
    return null;
  }
}

/** The caller `authorize()` decides for on these routes: the API key's, else the request's. */
export async function routeCallerContext(request: Request): Promise<AuthContext> {
  return (await bearerKeyContext(request)) ?? (await requestContext(request));
}

/** The 401 sentence of these routes, which name both bearers they take. */
export const ROUTE_BEARER_REQUIRED =
  'bearer token required: send Authorization: Bearer <TURBOSLIDE_TOKEN> or an API key from turboslide login';
