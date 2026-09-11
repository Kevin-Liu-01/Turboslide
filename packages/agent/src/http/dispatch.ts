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
import { authorize, requestAuthor, requestDeckId, requestForce } from './auth.ts';
import type { Env } from './auth.ts';
import { errorResponse, jsonResponse, refuse } from './errors.ts';

/** Request bodies are capped at 1 MB for writes and 25 MB for asset uploads (SPEC 11). */
export const WRITE_BODY_LIMIT = 1024 * 1024;
export const ASSET_BODY_LIMIT = 25 * 1024 * 1024;

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
