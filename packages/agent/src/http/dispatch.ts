// POST /api/actions/:action (SPEC 3.4, 7.1; MILESTONES M4 item 1): the HTTP transport over the
// same dispatcher the MCP server and the window API use. This module is framework free: it takes
// a web-standard Request and returns a Response, so the studio route is a two-line adapter and
// the unit tests need no server. The request is authorized (auth.ts), the action must be declared
// and offered on the http transport, the body is capped (1 MB for writes, SPEC 11) and parsed as
// one JSON object, the author and `force` come from the headers or the query, and every error
// becomes the one body shape of errors.ts with the status of the error class. GET describes the
// action (its schemas, transports and whether a handler is registered) so an agent can read one
// endpoint before calling it.
import type { ActionId, ActionSpec } from '@turboslide/schema/actions';
import { ACTIONS, isActionId } from '@turboslide/schema/actions';
import type { Author } from '@turboslide/schema/mutations';
import { z } from 'zod';

import type { ActionContext, Dispatcher } from '../dispatch.ts';
import { authorize, isLocalHost, requestAuthor, requestDeckId, requestForce } from './auth.ts';
import type { Env } from './auth.ts';
import { errorResponse, jsonResponse, refuse } from './errors.ts';

/** Request bodies are capped at 1 MB for writes and 25 MB for asset uploads (SPEC 11). */
export const WRITE_BODY_LIMIT = 1024 * 1024;
export const ASSET_BODY_LIMIT = 25 * 1024 * 1024;

/**
 * Forwarded host trust (gslides-parity SPEC-3 8.8, 11.4; report 04 F11). `X-Forwarded-Host` is
 * the name a proxy says the client used. On Vercel the platform sets it and it equals `Host`; on
 * the `node-server` preset behind a proxy that forwards client headers, or on any deployment that
 * forgot its token, a client can send `X-Forwarded-Host: localhost` and open the agent surface,
 * because the localhost rule of auth.ts believes the header. The rule here: without
 * `TURBOSLIDE_TRUST_PROXY=1` a forwarded host can narrow the answer (a public name refuses) and
 * never widen it (a local name is ignored and `Host` decides); with it the forwarded host is the
 * host. The check runs beside `authorize()` in handleActionRequest and in the studio's routes.
 */
export const TRUST_PROXY_ENV = 'TURBOSLIDE_TRUST_PROXY';

export function trustsProxy(env: Env = process.env): boolean {
  const value = env[TRUST_PROXY_ENV]?.trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

/** The first `X-Forwarded-Host` entry, or undefined. */
export function forwardedHost(request: Request): string | undefined {
  const value = request.headers.get('x-forwarded-host');
  if (!value) return undefined;
  const first = value.split(',')[0]?.trim();
  return first === undefined || first === '' ? undefined : first;
}

/** `Host`, then the request URL's host: the name the listening socket saw. */
export function socketHost(request: Request): string {
  const host = request.headers.get('host');
  if (host) return host.trim();
  try {
    return new URL(request.url).host;
  } catch {
    return '';
  }
}

/**
 * The host the request is judged by: the forwarded host when the proxy is trusted; otherwise the
 * socket's host, unless the forwarded host names a public address, which refuses (the narrowing
 * direction is always safe).
 */
export function effectiveHost(request: Request, env: Env = process.env): string {
  const forwarded = forwardedHost(request);
  const socket = socketHost(request);
  if (trustsProxy(env)) return forwarded ?? socket;
  if (forwarded !== undefined && !isLocalHost(forwarded)) return forwarded;
  return socket;
}

/** True when the request may use the open localhost rule: every host it names is local. */
export function isLocalRequest(request: Request, env: Env = process.env): boolean {
  return isLocalHost(effectiveHost(request, env));
}

/**
 * The refusal for a request auth.ts admitted on the localhost rule through a forwarded header
 * the deployment does not trust (a spoofed `X-Forwarded-Host: localhost` over a public `Host`),
 * or null when the request is local by every name it carries.
 */
export function refuseSpoofedLocalhost(request: Request, env: Env = process.env): Response | null {
  if (isLocalRequest(request, env)) return null;
  return refuse(
    401,
    'unauthorized',
    `the agent surface is open only on localhost; this instance (host ${socketHost(request) || 'unknown'}) has no ${'TURBOSLIDE_TOKEN'} set, so requests off localhost are refused`,
  );
}

/** The actions whose bodies may carry an upload and get the larger cap. */
const ASSET_ACTIONS: ReadonlySet<ActionId> = new Set<ActionId>(['asset.add', 'asset.capture']);

export function bodyLimitFor(spec: ActionSpec): number {
  return ASSET_ACTIONS.has(spec.id) ? ASSET_BODY_LIMIT : WRITE_BODY_LIMIT;
}

export type DispatchEvent = {
  action: ActionId;
  author: Author;
  deckId: string | undefined;
  force: boolean;
  status: number;
  ms: number;
};

export type ActionRequestOptions = {
  dispatcher: Dispatcher;
  env?: Env;
  /** The deck a request without ?deck= addresses. */
  defaultDeck?: string;
  /** Resolves a deck id to the deck directory the handlers read; RangeError for an unknown deck. */
  deckDir?: (deckId: string) => string;
  /** The author of a request that names none; DEFAULT_HTTP_AUTHOR otherwise. */
  defaultAuthor?: string;
  /** Called after every dispatch, for the request log. */
  onDispatch?: (event: DispatchEvent) => void;
};

export type ReadBodyResult = { ok: true; value: unknown } | { ok: false; response: Response };

/** Reads the body as one JSON object under the cap; an empty body is `{}`. */
export async function readJsonBody(request: Request, limit: number): Promise<ReadBodyResult> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(declared) && declared > limit) {
    return {
      ok: false,
      response: refuse(413, 'payload_too_large', `body over ${limit} bytes`),
    };
  }
  const text = await request.text();
  if (Buffer.byteLength(text) > limit) {
    return {
      ok: false,
      response: refuse(413, 'payload_too_large', `body over ${limit} bytes`),
    };
  }
  if (text.trim() === '') return { ok: true, value: {} };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, response: refuse(400, 'not_json', `body is not JSON: ${reason}`) };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {
      ok: false,
      response: refuse(400, 'not_json', 'body must be one JSON object, the action input'),
    };
  }
  return { ok: true, value: parsed };
}

function schemaOf(schema: z.ZodType, io: 'input' | 'output'): Record<string, unknown> {
  const { $schema: _dropped, ...rest } = z.toJSONSchema(schema, {
    target: 'draft-2020-12',
    io,
    unrepresentable: 'any',
  });
  return rest;
}

/** GET /api/actions/:action: the action's contract and whether this instance implements it. */
export function describeAction(spec: ActionSpec, implemented: boolean): Record<string, unknown> {
  return {
    id: spec.id,
    label: spec.label,
    doc: spec.doc,
    group: spec.group,
    mutates: spec.mutates,
    transports: spec.transports,
    milestone: spec.milestone,
    implemented,
    method: 'POST',
    path: `/api/actions/${spec.id}`,
    ...(spec.cli !== undefined ? { cli: spec.cli.usage } : {}),
    ...(spec.mcp !== undefined ? { mcp: spec.mcp } : {}),
    bodyLimit: bodyLimitFor(spec),
    input: schemaOf(spec.input, 'input'),
    output: schemaOf(spec.output, 'output'),
    example: spec.example,
  };
}

/**
 * Serves one request to /api/actions/:action. Never throws: every failure is a Response with the
 * error body, so the route can return it as is.
 */
export async function handleActionRequest(
  request: Request,
  actionId: string,
  options: ActionRequestOptions,
): Promise<Response> {
  const env = options.env ?? process.env;
  const auth = authorize(request, env);
  if (!auth.ok) return refuse(auth.status, auth.code, auth.message);
  if (auth.mode === 'localhost') {
    // the localhost rule holds only when every host the request names is local (SPEC-3 8.8)
    const spoofed = refuseSpoofedLocalhost(request, env);
    if (spoofed !== null) return spoofed;
  }
  if (!isActionId(actionId)) {
    return refuse(404, 'unknown_action', `Unknown action "${actionId}"; GET /api/agent lists them`);
  }
  const spec = ACTIONS[actionId];
  if (!spec.transports.includes('http')) {
    return refuse(
      404,
      'not_on_http',
      `${actionId} is not offered on the http transport (it runs on ${spec.transports.join(', ')})`,
    );
  }
  if (request.method === 'GET' || request.method === 'HEAD') {
    return jsonResponse(describeAction(spec, options.dispatcher.has(spec.id)));
  }
  if (request.method !== 'POST') {
    return refuse(
      405,
      'method_not_allowed',
      `${request.method} is not allowed; POST the input as JSON, or GET the contract`,
      {
        action: actionId,
      },
    );
  }
  let author: Author;
  let deckId: string | undefined;
  let deckDir: string | undefined;
  try {
    author = requestAuthor(request, options.defaultAuthor);
    deckId = requestDeckId(request, options.defaultDeck);
    deckDir = deckId !== undefined && options.deckDir ? options.deckDir(deckId) : undefined;
  } catch (error) {
    return errorResponse(error, actionId);
  }
  const body = await readJsonBody(request, bodyLimitFor(spec));
  if (!body.ok) return body.response;
  const force = requestForce(request);
  const context: ActionContext = {
    author,
    ...(deckDir !== undefined ? { deckDir } : {}),
    ...(force ? { force: true } : {}),
  };
  const started = performance.now();
  let response: Response;
  try {
    const output = await options.dispatcher.dispatch(spec.id, body.value, context);
    response = jsonResponse(output);
  } catch (error) {
    response = errorResponse(error, actionId);
  }
  options.onDispatch?.({
    action: spec.id,
    author,
    deckId,
    force,
    status: response.status,
    ms: Math.round(performance.now() - started),
  });
  return response;
}
