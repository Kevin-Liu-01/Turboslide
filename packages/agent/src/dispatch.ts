// The action dispatcher (SPEC 7.1): one entry point every transport calls. It validates the input
// against the action's Zod schema (InvalidInputError, a TypeError with the Zod path, the
// `unknown_field` code and a JSON pointer), rejects an unknown action (RangeError), answers NotImplementedError for an action declared in the table with no handler
// registered yet (MILESTONES M1 item 3), and validates the handler's output. Handlers are
// registered by the packages that implement them; the file store, the renderer and the linter
// register theirs in the CLI (M1) and the studio (M2 onward).
import type { ActionId, ActionSpec } from '@turboslide/schema/actions';
import { ACTIONS, isActionId } from '@turboslide/schema/actions';
import { NotImplementedError } from '@turboslide/schema/errors';
import type { Author } from '@turboslide/schema/mutations';
import type { z } from 'zod';

export type ActionContext = {
  author: Author;
  /** The deck directory or store the transport resolved. */
  deckDir?: string;
  /** Skip the lease check on a write (SPEC 6.7 `force`); the HTTP and MCP transports set it from the request. */
  force?: boolean;
};

/** Why an input was refused: an unknown field (SPEC 11 `unknown_field`) or any other schema failure. */
export type InputErrorCode = 'unknown_field' | 'invalid_input';

/**
 * Malformed input (SPEC 7.1: TypeError with the Zod path), with the machine-readable code and the
 * JSON pointer the HTTP and MCP error bodies carry. `name` stays TypeError so every transport's
 * error mapping (errorStatus, the CLI's exit 2) is unchanged.
 */
export class InvalidInputError extends TypeError {
  readonly code: InputErrorCode;
  /** A JSON pointer to the offending field; `/` for the input itself. */
  readonly pointer: string;
  readonly issues: z.core.$ZodIssue[];

  constructor(action: string, issues: z.core.$ZodIssue[]) {
    const first = issues[0];
    const unknown = issues.find((issue) => issue.code === 'unrecognized_keys');
    const path = first === undefined ? [] : first.path.map(String);
    let pointer = `/${path.join('/')}`;
    let code: InputErrorCode = 'invalid_input';
    if (unknown !== undefined && 'keys' in unknown && Array.isArray(unknown.keys)) {
      code = 'unknown_field';
      pointer = `/${[...unknown.path.map(String), String(unknown.keys[0] ?? '')].join('/')}`;
    }
    super(`${action}: invalid input at ${pointer}: ${first?.message ?? 'invalid'}`);
    this.name = 'TypeError';
    this.code = code;
    this.pointer = pointer;
    this.issues = issues;
  }
}

export type ActionHandler = (input: unknown, context: ActionContext) => Promise<unknown> | unknown;

export type Dispatcher = {
  register: (id: ActionId, handler: ActionHandler) => void;
  has: (id: ActionId) => boolean;
  /** The ids with a handler registered, in table order. */
  implemented: () => ActionId[];
  dispatch: (id: string, input: unknown, context: ActionContext) => Promise<unknown>;
  spec: (id: string) => ActionSpec;
};

export function createDispatcher(): Dispatcher {
  const handlers = new Map<ActionId, ActionHandler>();
  const spec = (id: string): ActionSpec => {
    if (!isActionId(id)) throw new RangeError(`Unknown action "${id}"`);
    return ACTIONS[id];
  };
  return {
    register(id, handler) {
      handlers.set(id, handler);
    },
    has(id) {
      return handlers.has(id);
    },
    implemented() {
      return (Object.keys(ACTIONS) as ActionId[]).filter((id) => handlers.has(id));
    },
    spec,
    async dispatch(id, input, context) {
      const action = spec(id);
      const parsed = action.input.safeParse(input);
      if (!parsed.success) throw new InvalidInputError(id, parsed.error.issues);
      const handler = handlers.get(action.id);
      if (handler === undefined) throw new NotImplementedError(action.id, action.milestone);
      const output = await handler(parsed.data, context);
      const checked = action.output.safeParse(output);
      if (!checked.success) {
        const first = checked.error.issues[0];
        throw new Error(
          `${id}: the handler returned an invalid result at /${first?.path.map(String).join('/') ?? ''}: ${first?.message ?? 'invalid'}`,
        );
      }
      return checked.data;
    },
  };
}
