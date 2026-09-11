/**
 * The JSON boundary of the editor's server functions (write.ts, lint.ts, render.ts): inputs arrive
 * as JSON text and are parsed here before the module's own checks run, so a body that is not JSON
 * is a TypeError with the reason, as the CLI's exit code 2 path reports it (SPEC 7.1, TypeError for
 * malformed input). The result is typed by the caller's expectation and checked field by field by
 * the validator that follows; this function only guarantees an object.
 */
export type Untrusted<T> = { [K in keyof T]?: unknown };

export function parseJsonInput<T extends object>(raw: unknown): T {
  if (typeof raw !== 'string') throw new TypeError('The server function input must be JSON text');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new TypeError(`Invalid JSON input: ${reason}`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new TypeError('The server function input must be a JSON object');
  }
  return parsed as T;
}
