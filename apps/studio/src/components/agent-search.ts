/**
 * The search key that opens a viewer or a show page for an agent (`/deck/<id>?agent=1`), in a
 * module that imports nothing: the route validators of /deck, /present and /embed read it, and a
 * route's validator is in the chunk every route loads, so the session hook
 * (`useStudioSession.ts`, with the window API's ready event, the server functions and the
 * schema's error classes behind it) stays in the viewer's own chunk (polish two, P2-V1.4
 * finding 6; SPEC-4 3.12).
 */
export const AGENT_SEARCH_KEY = 'agent';

/**
 * Whether the address asks the page to attach a studio session (docs/archive/rounds/SYNC.md 3.10,
 * open question 3's default): `?agent=1` on /deck, /present and /embed. The route validators call
 * this and the viewer routes pass the answer as the hook's `enabled`, so a seller's show costs no
 * function request after its load and `deck_goto_slide` reaches a viewer tab only when it was
 * opened for an agent.
 */
export function agentSessionRequested(search: Record<string, unknown>): boolean {
  const value = search[AGENT_SEARCH_KEY];
  return value === 1 || value === '1' || value === true;
}
