// The editor's leave warning (gslides-parity SPEC-3 0.7, 3.6), outside EditorRoot so the rule is
// unit tested (leave-warning.test.ts); EditorRoot registers the listener on `beforeunload`.

import { REFUSALS } from '@turboslide/chrome/menus/strings';
import { heldBursts } from '@turboslide/viewer/InlineText';

import type { EditorBackend } from './backend';
import type { EditorSnapshot } from './controller';

/**
 * The writes of this tab the server has not acknowledged: the room client's pending operations
 * (the controller's own count before the room attaches), the deck writes that run on the server,
 * such as a picture upload, which the room counts only once they come back, and the text sessions
 * holding typed keys their burst has not written yet (`held`, InlineText heldBursts; the burst
 * waits TEXT_BURST_MS after the last key).
 */
export function unsavedWrites(
  snapshot: Pick<EditorSnapshot, 'sync' | 'pending' | 'serverWrites'>,
  held: number = heldBursts(),
): number {
  return (snapshot.sync?.pending ?? snapshot.pending) + snapshot.serverWrites + held;
}

/**
 * The `beforeunload` listener that asks for the browser's leave prompt while operations of this
 * tab are pending, so a reload or a navigation does not drop a write the server has not
 * acknowledged. The tab backend (/try, docs/SITE.md D3) saves nothing beyond the tab, so on it a
 * leave never asks, whatever the tab has in flight.
 */
export function leaveWarning(
  backend: Pick<EditorBackend, 'kind'>,
  pending: () => number,
): (event: BeforeUnloadEvent) => void {
  return (event) => {
    if (backend.kind === 'tab' || pending() <= 0) return;
    event.preventDefault();
    event.returnValue = REFUSALS.leaveAnyway;
  };
}
