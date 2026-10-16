// The error body of the agent HTTP surface (SPEC 7.1 error classes, SPEC 11 `unknown_field`):
// one shape for every refusal, `{ error: { name, status, message, ... } }`, the same fields the
// MCP tool error carries (packages/mcp/src/tools.ts toolErrorBody) so a client parses one form.
// A ConflictError carries the current document and the lease holder (409), malformed input the
// code and a JSON pointer (400), a declared but unimplemented action its milestone (501).
import { ConflictError, NotImplementedError, errorStatus } from '@turboslide/schema/errors';

import { InvalidInputError } from '../dispatch.ts';

/** The machine-readable reasons beyond the error class name. */
export type HttpErrorCode =
  | 'unknown_field'
  | 'invalid_input'
  | 'unauthorized'
  /** a device key past its expiry (HR-SA#5): the CLI asks for `turboslide login` again */
  | 'key_expired'
  | 'payload_too_large'
  | 'not_json'
  | 'unknown_action'
  | 'not_on_http'
  | 'method_not_allowed'
  | 'no_session'
  | 'unknown_deck'
  /** an Idempotency-Key that is not 1 to 255 visible ASCII characters (hardening HR-O#6) */
  | 'invalid_idempotency_key'
  /** an Idempotency-Key on a writing action that does not take one (dispatch.ts takesIdempotencyKey) */
  | 'idempotency_not_supported'
  /** an Idempotency-Key a request with another action or body already used */
  | 'idempotency_key_reused';

export type HttpError = {
  name: string;
  status: number;
  message: string;
  code?: HttpErrorCode;
  /** A JSON pointer to the field a 400 is about; `/` for the input itself. */
  pointer?: string;
  action?: string;
  currentRevision?: number;
  /** The current document, so the caller's re-read is free after a 409 (SPEC 7.1). */
  current?: unknown;
  holder?: unknown;
  milestone?: string;
};

export type HttpErrorBody = { error: HttpError };

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

/** The body for a thrown error, following the error classes of SPEC 7.1. */
export function errorBodyOf(error: unknown, action?: string): HttpErrorBody {
  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : 'Error';
  const body: HttpError = { name, status: errorStatus(error), message };
  if (action !== undefined) body.action = action;
  if (error instanceof InvalidInputError) {
    body.code = error.code;
    body.pointer = error.pointer;
  }
  if (error instanceof ConflictError) {
    body.currentRevision = error.currentRevision;
    if (error.current !== undefined) body.current = error.current;
    if (error.holder !== undefined) body.holder = error.holder;
  }
  if (error instanceof NotImplementedError) body.milestone = error.milestone;
  return { error: body };
}

export function jsonResponse(
  value: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(value), { status, headers: { ...JSON_HEADERS, ...headers } });
}

/** A Response for a thrown error. */
export function errorResponse(error: unknown, action?: string): Response {
  const body = errorBodyOf(error, action);
  return jsonResponse(body, body.error.status);
}

/** A refusal the transport itself makes, before or instead of a dispatch. */
export function refuse(
  status: number,
  code: HttpErrorCode,
  message: string,
  extra: Partial<HttpError> = {},
): Response {
  const name =
    status === 400
      ? 'TypeError'
      : status === 404
        ? 'RangeError'
        : status === 409
          ? 'ConflictError'
          : 'Error';
  return jsonResponse({ error: { name, status, message, code, ...extra } }, status);
}
