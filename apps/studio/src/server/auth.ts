import type { AuthResult } from '@turboslide/agent/http/auth';
import { bearerToken, isLocalHost, requestAuthor, requestHost } from '@turboslide/agent/http/auth';
import { refuseSpoofedLocalhost } from '@turboslide/agent/http/dispatch';
import { bindRequestAuthor } from '@turboslide/agent/http/auth';
import { refuse } from '@turboslide/agent/http/errors';
import { agentPrincipalId } from '@turboslide/identity/ids';
import type { Author } from '@turboslide/schema/mutations';

import { identityRuntime } from './auth/identity.ts';
import type { IdentityRuntime } from './auth/identity.ts';
import { BOOTSTRAP_ACTION, localTokenRequired, resolveBearerSync } from './auth/tokens.ts';

/**
 * The bearer rule of the hosted agent surface (SPEC 11 "Security"; MILESTONES M4 item 1;
 * gslides-parity SPEC-3 0.23, 7.7, 8.2, 8.8) as the studio's routes use it: `/api/actions/:action`,
 * `/api/agent` and `/mcp` call `requireAgentAuth(request)` first and return the refusal it hands
 * back. Round three widens the round one rule (one static bearer, else localhost) in three ways,
 * without an await, because the routes call it synchronously:
 *
 * - A `ts_` API key resolves to its record (server/auth/tokens.ts): the request acts for the
 *   key's owner with the key's scopes, and its author is the record's registered name under
 *   `agent:<tokenId>`, bound to the request so `?author=` and the header's name are ignored and
 *   the header carries a run id only (8.2). A revoked or unknown key answers 401.
 * - `TURBOSLIDE_TOKEN` stays the bootstrap admin token: every action while no key record exists
 *   (today's deployments), `admin.bootstrap` alone once one does (09 6.1).
 * - The localhost rule holds only when every host the request names is local (dispatch.ts,
 *   `TURBOSLIDE_TRUST_PROXY`), and, when `TURBOSLIDE_LOCAL_TOKEN=require` is set, only with the
 *   per checkout token of `.turboslide/token` (7.7; opt in this round, b3.md deviations).
 *
 * `/api/render` and `/api/export` keep their M2 check because the editor's own thumbnails fetch
 * them from the page without a header.
 */

/** The author of a request that names none: the hosted surface is an agent transport (SPEC 7.2). */
export const HTTP_DEFAULT_AUTHOR = 'agent:http';
export const MCP_DEFAULT_AUTHOR = 'agent:mcp-http';

export const BOOTSTRAP_ONLY_MESSAGE =
  'the static bearer is the bootstrap token once an API key exists; sign in with turboslide login and use the key';
export const UNKNOWN_KEY_MESSAGE = 'unknown or revoked API key';
export const LOCAL_TOKEN_MESSAGE =
  'the agent surface of this checkout takes the token in .turboslide/token as its bearer (TURBOSLIDE_LOCAL_TOKEN=require)';

/** `/api/actions/<id>` names the action the request is about; other paths none. */
export function actionOfRequest(request: Request): string | undefined {
  let pathname: string;
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    return undefined;
  }
  const match = /^\/api\/actions\/([^/]+)\/?$/.exec(pathname);
  return match?.[1] === undefined ? undefined : decodeURIComponent(match[1]);
}

/** The round three rule, over an explicit runtime and environment so the unit tests drive it. */
export function agentAuthWith(
  request: Request,
  runtime: Pick<IdentityRuntime, 'env' | 'keys' | 'checkoutToken' | 'hosted'>,
): AuthResult {
  const env = runtime.env;
  const bearer = bearerToken(request);
  const resolved = resolveBearerSync(bearer, {
    env,
    keys: runtime.keys,
    checkoutToken: runtime.checkoutToken,
  });
  switch (resolved.kind) {
    case 'api-key': {
      const author: Author = {
        kind: 'agent',
        name: resolved.record.name,
        principalId: agentPrincipalId(resolved.record.id),
      };
      bindRequestAuthor(request, author);
      return { ok: true, mode: 'token' };
    }
    case 'bootstrap':
      if (resolved.bootstrapOnly && actionOfRequest(request) !== BOOTSTRAP_ACTION)
        return { ok: false, status: 401, code: 'unauthorized', message: BOOTSTRAP_ONLY_MESSAGE };
      return { ok: true, mode: 'token' };
    case 'checkout':
      if (runtime.hosted || !isLocalHost(requestHost(request, env)))
        return {
          ok: false,
          status: 401,
          code: 'unauthorized',
          message: 'the per checkout token is accepted on localhost only',
        };
      return { ok: true, mode: 'localhost' };
    case 'refused':
      return {
        ok: false,
        status: 401,
        code: 'unauthorized',
        message:
          resolved.reason === 'unknown_key'
            ? UNKNOWN_KEY_MESSAGE
            : env.TURBOSLIDE_TOKEN
              ? 'bearer token required: send Authorization: Bearer <TURBOSLIDE_TOKEN> or an API key'
              : 'the bearer is not an API key of this deployment',
      };
    case 'none':
      break;
  }
  // no bearer: the round one rule
  const token = env.TURBOSLIDE_TOKEN;
  if (token !== undefined && token !== '')
    return {
      ok: false,
      status: 401,
      code: 'unauthorized',
      message: 'bearer token required: send Authorization: Bearer <TURBOSLIDE_TOKEN> or an API key',
    };
  const host = requestHost(request, env);
  if (!isLocalHost(host))
    return {
      ok: false,
      status: 401,
      code: 'unauthorized',
      message: `the agent surface is open only on localhost; this instance (host ${host || 'unknown'}) has no TURBOSLIDE_TOKEN set, so requests off localhost are refused`,
    };
  if (!runtime.hosted && localTokenRequired(env))
    return { ok: false, status: 401, code: 'unauthorized', message: LOCAL_TOKEN_MESSAGE };
  return { ok: true, mode: 'localhost' };
}

export function agentAuth(request: Request): AuthResult {
  return agentAuthWith(request, identityRuntime());
}

/** The 401 Response for a refused request, or undefined when the request may proceed. */
export function requireAgentAuth(request: Request): Response | undefined {
  const result = agentAuth(request);
  if (!result.ok) return refuse(result.status, result.code, result.message);
  if (result.mode === 'localhost') {
    // the localhost rule holds only when every host the request names is local (SPEC-3 8.8)
    const spoofed = refuseSpoofedLocalhost(request, identityRuntime().env);
    if (spoofed !== null) return spoofed;
  }
  return undefined;
}

/** The author of an agent request: the bound identity, else the header or query, else the fallback. */
export function agentAuthor(request: Request, fallback: string = HTTP_DEFAULT_AUTHOR): Author {
  return requestAuthor(request, fallback);
}
