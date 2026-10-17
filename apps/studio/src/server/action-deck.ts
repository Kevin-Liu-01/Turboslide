// The deck a call to /api/actions runs on. Most actions run on the deck `?deck=` names, or on the
// instance's default deck when it names none. The share and publish actions (group `share`) and
// `admin.assignOwner` also name their deck in the input's `id`, and their handlers act on the
// dispatcher's deck, not on `id`. So for these actions the input's `id` is the deck when `?deck=`
// is absent, and a call whose `?deck=` and `id` differ is refused. Before this, a share write that
// named its deck only in `id` ran on gt-brand, the default deck. `named` says whether the call
// named its deck either way: a write that did not is refused before any deck opens
// (agent-gate.ts writesBoundDeck), and only a read runs on the default.
import { ACTIONS } from '@turboslide/schema/actions';
import { SLUG_PATTERN } from '@turboslide/schema/ids';

/** The actions whose input `id` is the deck their handler acts on. */
export const DECK_ID_ACTIONS: ReadonlySet<string> = new Set(
  Object.values(ACTIONS)
    .filter((spec) => spec.group === 'share' || spec.id === 'admin.assignOwner')
    .map((spec) => spec.id),
);

type ActionDeck = { ok: true; deckId: string; named: boolean } | { ok: false; message: string };

/**
 * The deck of one call: `query` is the raw `?deck=` value, `input` the parsed body (undefined when
 * it did not parse), `fallback` the instance's default deck. An `id` that is not a slug is left to
 * the action's schema, which refuses it before a handler runs.
 */
export function actionDeck(
  action: string,
  query: string | null,
  input: unknown,
  fallback: string,
): ActionDeck {
  const queried = query === null || query === '' ? undefined : query;
  const byQuery = (): ActionDeck => ({
    ok: true,
    deckId: queried ?? fallback,
    named: queried !== undefined,
  });
  if (!DECK_ID_ACTIONS.has(action)) return byQuery();
  const id =
    typeof input === 'object' && input !== null ? (input as Record<string, unknown>).id : undefined;
  const named = typeof id === 'string' && SLUG_PATTERN.test(id) ? id : undefined;
  if (named === undefined) return byQuery();
  if (queried !== undefined && queried !== named)
    return {
      ok: false,
      message: `${action} names deck "${named}" in its input and "${queried}" in ?deck=; name one deck`,
    };
  return { ok: true, deckId: named, named: true };
}
