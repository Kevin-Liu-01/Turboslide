// The action dispatcher (SPEC 7.1): one entry point every transport calls. It validates the input
// against the action's Zod schema (TypeError with the Zod path), rejects an unknown action
// (RangeError), answers NotImplementedError for an action declared in the table with no handler
// registered yet (MILESTONES M1 item 3), and validates the handler's output. Handlers are
// registered by the packages that implement them; the file store, the renderer and the linter
// register theirs in the CLI (M1) and the studio (M2 onward).
import type { ActionId, ActionSpec } from '@turboslide/schema/actions';
import { ACTIONS, isActionId } from '@turboslide/schema/actions';
import { NotImplementedError } from '@turboslide/schema/errors';
import type { Author } from '@turboslide/schema/mutations';

export type ActionContext = {
  author: Author;
  /** The deck directory or store the transport resolved. */
  deckDir?: string;
};

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
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        const path = first === undefined ? '' : `/${first.path.map(String).join('/')}`;
        throw new TypeError(
          `${id}: invalid input at ${path || '/'}: ${first?.message ?? 'invalid'}`,
        );
      }
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
