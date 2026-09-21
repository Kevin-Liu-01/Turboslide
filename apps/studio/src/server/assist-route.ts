import type { Author } from '@turboslide/schema/mutations';
import { SLUG_PATTERN } from '@turboslide/schema/ids';
import {
  ConflictError,
  ForbiddenError,
  NotImplementedError,
  errorStatus,
} from '@turboslide/schema/errors';

import type { ShadowedDecision } from './authorize';
import { denialBody } from './authorize';
import { FLAG_REFUSALS } from './flags';
import type { QuotaContext, RateLimitedError } from './ratelimit';
import { rateLimitedResponse } from './ratelimit';
import type { RequestIdentity, RouteRefusal } from './room';

/**
 * The assist route's logic (docs/PRODUCT.md 6.3, 6.4; build/b6.md R4 and R9): `POST
 * /api/assist?deck=<id>` with `{ action: 'assist.propose' | 'assist.accept', input }` from the
 * seller's page (the session cookie) or an agent (the bearer). Not a `createServerFn`, because
 * TanStack Start posts every server function to `/_serverFn/<id>` and firewall rule R1 counts
 * them as one path; this route has its own path (R22), its own function directory (a 60 s
 * `maxDuration`, vite.deploy.config.ts) and its own quotas. In order: the request rules (same
 * origin unless a bearer, `application/json`, one JSON object under 1 MB), the deck id as a slug,
 * `authorize()` with the request's identity (`comment` to propose, so a link visitor who may only
 * read sees the panel disabled; `write` to accept), the `assist` switch, the `readOnly` switch on
 * a write, the two assist quotas on a propose (`checkAssistQuotas`), then the action through the
 * deck dispatcher under the caller's author (B6's `registerAssistActions` handlers, which read
 * the model configuration and the card secret themselves). Every refusal is one JSON object
 * `{ error: <code>, message: <sentence> }` the panel shows as it is; the model's latency and a
 * provider's 5xx answer 502 with `retry-after` and never a stack. One log line per call names the
 * action, the status, the time, the deck and the identity label, never the deck text (6.5; B6's
 * `logAssistLine` carries the tokens).
 *
 * The runtime seams (the identity, the decision, the flags, the quotas, the dispatcher) are
 * injected so `assist-route.test.ts` drives every refusal and the happy path over fakes; the route
 * file `routes/api/assist.ts` binds the real ones.
 */

export const ASSIST_ROUTE_PATH = '/api/assist';
export const ASSIST_BODY_MAX_BYTES = 1024 * 1024;
export const ASSIST_ACTIONS = ['assist.propose', 'assist.accept'] as const;
export type AssistAction = (typeof ASSIST_ACTIONS)[number];

export function isAssistAction(value: unknown): value is AssistAction {
  return (ASSIST_ACTIONS as readonly unknown[]).includes(value);
}

/** The capability each action needs (6.3, 6.7): commenters and editors propose, editors accept. */
export function assistCapability(action: AssistAction): 'comment' | 'write' {
  return action === 'assist.accept' ? 'write' : 'comment';
}

export type AssistRouteDeps = {
  identity: (request: Request) => Promise<RequestIdentity>;
  decide: (
    identity: RequestIdentity,
    deckId: string,
    capability: 'comment' | 'write',
    action: AssistAction,
  ) => Promise<ShadowedDecision>;
  flagOn: (name: 'assist' | 'readOnly') => Promise<boolean>;
  quotas: (ctx: QuotaContext) => Promise<RateLimitedError | null>;
  tierOf: (identity: RequestIdentity) => QuotaContext['tier'];
  authorOf: (identity: RequestIdentity) => Author;
  /** runs the action on the deck's dispatcher under the author; a RangeError names a missing deck */
  dispatch: (
    deckId: string,
    action: AssistAction,
    input: unknown,
    author: Author,
  ) => Promise<unknown>;
  refuseCrossSite: (request: Request) => RouteRefusal | null;
  refuseNonJson: (request: Request) => RouteRefusal | null;
  readJsonBody: (
    request: Request,
    maxBytes: number,
  ) => Promise<{ ok: true; value: unknown; bytes: number } | { ok: false; refusal: RouteRefusal }>;
  log?: (line: string) => void;
  now?: () => number;
};

function json(value: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(value, { status, headers: { 'cache-control': 'no-store', ...headers } });
}

/** The answer for an error the dispatcher or the module threw: one code, one sentence, never a stack. */
export function assistErrorResponse(error: unknown): Response {
  const named = error as { name?: unknown; status?: unknown; body?: unknown; message?: unknown };
  const message = error instanceof Error ? error.message : String(error);
  if (named.name === 'DeniedError' && typeof named.status === 'number')
    return json(named.body ?? { error: 'forbidden' }, named.status);
  if (named.name === 'AssistUnavailableError')
    return json({ error: 'unavailable', message }, 503, { 'retry-after': '60' });
  if (named.name === 'ModelCallError')
    return json({ error: 'model', message }, 502, { 'retry-after': '5' });
  if (error instanceof ConflictError) {
    return json(
      {
        error: 'conflict',
        message,
        ...(error.currentRevision !== undefined ? { currentRevision: error.currentRevision } : {}),
        ...(error.current !== undefined ? { current: error.current } : {}),
        ...(error.holder !== undefined ? { holder: error.holder } : {}),
      },
      409,
    );
  }
  // the module's own refusals of a card (forged, foreign): the sentence, under the code every
  // denial carries
  if (error instanceof ForbiddenError) return json({ error: 'forbidden', message }, 403);
  if (error instanceof NotImplementedError)
    return json(
      { error: 'not_implemented', message: 'The assistant is not on this server yet' },
      501,
    );
  if (error instanceof RangeError) return json({ error: 'unknown_deck', message }, 404);
  if (error instanceof TypeError) return json({ error: 'invalid_input', message }, 400);
  const status = errorStatus(error);
  return json(
    {
      error: 'error',
      message: status >= 500 ? 'The assistant could not answer; try again' : message,
    },
    status,
    status >= 500 ? { 'retry-after': '5' } : {},
  );
}

/** The one handler of the route: every refusal a Response, the action's answer as JSON. */
export async function handleAssistRequest(
  request: Request,
  deps: AssistRouteDeps,
): Promise<Response> {
  const started = (deps.now ?? (() => Date.now()))();
  const log = deps.log ?? ((line: string) => console.error(`turboslide assist: ${line}`));
  if (request.method !== 'POST')
    return json({ error: 'method', message: 'This route takes POST' }, 405, { allow: 'POST' });
  // a page must be the studio's own origin; a bearer agent sends no Sec-Fetch-Site and no Origin
  if (request.headers.get('authorization') === null) {
    const cross = deps.refuseCrossSite(request);
    if (cross !== null) return json({ error: cross.code, message: cross.message }, cross.status);
  }
  const type = deps.refuseNonJson(request);
  if (type !== null) return json({ error: type.code, message: type.message }, type.status);
  const body = await deps.readJsonBody(request, ASSIST_BODY_MAX_BYTES);
  if (!body.ok)
    return json({ error: body.refusal.code, message: body.refusal.message }, body.refusal.status);
  if (typeof body.value !== 'object' || body.value === null || Array.isArray(body.value))
    return json({ error: 'invalid_input', message: 'The body wants one JSON object' }, 400);
  const { action, input } = body.value as { action?: unknown; input?: unknown };
  if (!isAssistAction(action))
    return json(
      { error: 'invalid_input', message: 'action must be assist.propose or assist.accept' },
      400,
    );
  if (typeof input !== 'object' || input === null || Array.isArray(input))
    return json({ error: 'invalid_input', message: 'input wants one JSON object' }, 400);
  const url = new URL(request.url);
  const deckId = url.searchParams.get('deck') ?? '';
  if (!SLUG_PATTERN.test(deckId))
    return json({ error: 'unknown_deck', message: 'deck must name a presentation' }, 404);
  const identity = await deps.identity(request);
  const capability = assistCapability(action);
  const decision = await deps.decide(identity, deckId, capability, action);
  if (!decision.ok) return json(denialBody(decision, capability), decision.status);
  if (!(await deps.flagOn('assist')))
    return json({ error: 'unavailable', message: FLAG_REFUSALS.assist, flag: 'assist' }, 503, {
      'retry-after': '60',
    });
  if (action === 'assist.accept' && !(await deps.flagOn('readOnly')))
    return json({ error: 'unavailable', message: FLAG_REFUSALS.readOnly, flag: 'readOnly' }, 503, {
      'retry-after': '60',
    });
  if (action === 'assist.propose') {
    const refused = await deps.quotas({
      identity: identity.identity,
      tier: deps.tierOf(identity),
      deckId,
      action,
      transport: 'route',
    });
    if (refused !== null) return rateLimitedResponse(refused);
  }
  let status = 200;
  try {
    const answer = await deps.dispatch(deckId, action, input, deps.authorOf(identity));
    return json(answer ?? {}, 200);
  } catch (error) {
    const response = assistErrorResponse(error);
    status = response.status;
    return response;
  } finally {
    const ms = (deps.now ?? (() => Date.now()))() - started;
    log(`${action} ${status} ${ms} ms deck=${deckId} identity=${identity.identity}`);
  }
}
