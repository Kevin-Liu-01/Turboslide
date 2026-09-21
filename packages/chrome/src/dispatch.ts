// The one way the editor chrome writes (SPEC 7.1: a designer's click and an agent's call take the
// same path through the same validator with the same baseRevision). Every component in this
// package that changes the document takes a `dispatch` and calls it with an action id from the
// action table and that action's input; nothing here touches a document, a store or a server.
// The studio supplies the dispatcher (@turboslide/agent createDispatcher with its client-side
// handlers, which run applyWrite for optimism and then the server function writeDeck, SPEC 6.7).
import type { ActionId } from '@turboslide/schema/actions';

/** Dispatches one action; resolves with the action's validated output or rejects with its error. */
export type EditorDispatch = (action: ActionId, input: unknown) => Promise<unknown>;

/** What a writing component needs: the revision it read (sent as baseRevision) and the dispatcher. */
export type EditorWriter = {
  revision: number;
  dispatch: EditorDispatch;
};

/**
 * The label a component shows for an author: "Assistant" for an agent (docs/PRODUCT.md 6.1; the
 * run id stays in a tooltip through `authorRunId`), the name for a person. Before the product
 * round this read `agent:<runId>`, the developer's word, on every seller surface (audit-assist 15).
 */
export function authorName(author: { kind: 'human' | 'agent'; name: string; runId?: string }) {
  return author.kind === 'agent' ? 'Assistant' : author.name;
}

/** The developer's word for an agent author, for a tooltip: `agent:<runId>`; undefined for a person. */
export function authorRunId(author: {
  kind: 'human' | 'agent';
  name: string;
  runId?: string;
}): string | undefined {
  return author.kind === 'agent' ? `agent:${author.runId ?? author.name}` : undefined;
}
