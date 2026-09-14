// Error classes shared by every transport (SPEC 7.1): TypeError for malformed input with the Zod
// path, RangeError for an unknown action, label or id, ConflictError (HTTP 409) for a stale
// baseRevision or a held lease with the holder attached, plain Error for renderer and codec
// failures. NotImplementedError (HTTP 501) is what the dispatcher returns for actions declared in
// the table whose implementation lands in a later milestone (MILESTONES M1 item 3).
// ForbiddenError (403) and GoneError (410) are round three's (gslides-parity SPEC-3 6.2, 6.4): a
// capability the caller lacks on a record, and a revoked publish token.
import type { Author } from './mutations.ts';

export class ConflictError extends Error {
  readonly status = 409;
  readonly currentRevision: number;
  /** the current document, so the caller's re-read is free */
  readonly current: unknown;
  readonly holder: Author | undefined;

  constructor(
    message: string,
    details: { currentRevision: number; current?: unknown; holder?: Author },
  ) {
    super(message);
    this.name = 'ConflictError';
    this.currentRevision = details.currentRevision;
    this.current = details.current;
    this.holder = details.holder;
  }
}

export class NotImplementedError extends Error {
  readonly status = 501;
  readonly action: string;
  readonly milestone: string;

  constructor(action: string, milestone: string) {
    super(`${action} is declared in the action table and lands in ${milestone}`);
    this.name = 'NotImplementedError';
    this.action = action;
    this.milestone = milestone;
  }
}

/**
 * A capability the caller lacks on a deck or a record (gslides-parity SPEC-3 6.2, HTTP 403): the
 * body is `{ error: 'forbidden', capability }` and never names the role the person holds or
 * whether another deck or account exists (6.8).
 */
export class ForbiddenError extends Error {
  readonly status = 403;
  readonly code = 'forbidden';
  readonly capability: string | undefined;

  constructor(message: string, capability?: string) {
    super(message);
    this.name = 'ForbiddenError';
    this.capability = capability;
  }
}

/**
 * A revoked publish token or a stopped link (gslides-parity SPEC-3 6.4, HTTP 410): "This
 * presentation is no longer published".
 */
export class GoneError extends Error {
  readonly status = 410;
  readonly code = 'gone';

  constructor(message: string) {
    super(message);
    this.name = 'GoneError';
  }
}

/** The HTTP status an error class maps to on the agent transport. */
export function errorStatus(error: unknown): number {
  if (error instanceof ConflictError) return 409;
  if (error instanceof NotImplementedError) return 501;
  if (error instanceof ForbiddenError) return 403;
  if (error instanceof GoneError) return 410;
  if (error instanceof TypeError) return 400;
  if (error instanceof RangeError) return 404;
  return 500;
}
