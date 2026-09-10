// Error classes shared by every transport (SPEC 7.1): TypeError for malformed input with the Zod
// path, RangeError for an unknown action, label or id, ConflictError (HTTP 409) for a stale
// baseRevision or a held lease with the holder attached, plain Error for renderer and codec
// failures. NotImplementedError (HTTP 501) is what the dispatcher returns for actions declared in
// the table whose implementation lands in a later milestone (MILESTONES M1 item 3).
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

/** The HTTP status an error class maps to on the agent transport. */
export function errorStatus(error: unknown): number {
  if (error instanceof ConflictError) return 409;
  if (error instanceof NotImplementedError) return 501;
  if (error instanceof TypeError) return 400;
  if (error instanceof RangeError) return 404;
  return 500;
}
