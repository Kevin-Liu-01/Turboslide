import { authorize, requestAuthor } from '@turboslide/agent/http/auth';
import type { AuthResult } from '@turboslide/agent/http/auth';
import { refuse } from '@turboslide/agent/http/errors';
import type { Author } from '@turboslide/schema/mutations';

/**
 * The bearer token rule of the hosted agent surface (SPEC 11 "Security"; MILESTONES M4 item 1)
 * as the studio's routes use it: `/api/actions/:action`, `/api/agent` and `/mcp` call
 * `requireAgentAuth(request)` first and return the refusal it hands back. The rule itself lives
 * in @turboslide/agent/http/auth (framework free, unit tested): with TURBOSLIDE_TOKEN set every
 * request carries `Authorization: Bearer <token>`; without it only localhost is served, judged by
 * X-Forwarded-Host then Host. `/api/render` and `/api/export` keep their M2 check (a token when
 * set) because the editor's own thumbnails fetch them from the page without a header; a deployed
 * instance sets the token and the page reaches them through same-origin cookies later (open
 * question 3).
 */

/** The author of a request that names none: the hosted surface is an agent transport (SPEC 7.2). */
export const HTTP_DEFAULT_AUTHOR = 'agent:http';
export const MCP_DEFAULT_AUTHOR = 'agent:mcp-http';

export function agentAuth(request: Request): AuthResult {
  return authorize(request, process.env);
}

/** The 401 Response for a refused request, or undefined when the request may proceed. */
export function requireAgentAuth(request: Request): Response | undefined {
  const result = agentAuth(request);
  if (result.ok) return undefined;
  return refuse(result.status, result.code, result.message);
}

export function agentAuthor(request: Request, fallback: string = HTTP_DEFAULT_AUTHOR): Author {
  return requestAuthor(request, fallback);
}
