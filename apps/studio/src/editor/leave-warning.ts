// The editor's leave warning (gslides-parity SPEC-3 0.7, 3.6) and the page lifecycle listeners,
// outside EditorRoot so the rules are unit tested (leave-warning.test.ts); EditorRoot registers
// the listeners `leaveListeners` answers.

import { REFUSALS } from '@turboslide/chrome/menus/strings';
import { flushHeldNotes, heldNotes } from '@turboslide/chrome/NotesPane';
import { flushHeldBursts, heldBursts } from '@turboslide/viewer/InlineText';

import type { EditorBackend } from './backend';
import type { EditorSnapshot } from './controller';

/**
 * The typed text this tab holds and has not written yet: the text sessions' bursts (InlineText
 * heldBursts; the burst waits TEXT_BURST_MS after the last key) and the speaker notes pane's
 * draft (NotesPane heldNotes; NOTES_BURST_MS after the last key).
 */
export function heldTyping(): number {
  return heldBursts() + heldNotes();
}

/** Writes the held typing now: the text sessions' bursts, then the notes pane's draft. */
export function flushHeldTyping(): void {
  flushHeldBursts();
  flushHeldNotes();
}

/**
 * The writes of this tab the server has not acknowledged: the room client's pending operations
 * (the controller's own count before the room attaches), the deck writes that run on the server,
 * such as a picture upload, which the room counts only once they come back, and the typing held
 * before its write (`held`, heldTyping).
 */
export function unsavedWrites(
  snapshot: Pick<EditorSnapshot, 'sync' | 'pending' | 'serverWrites'>,
  held: number = heldTyping(),
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

type LeaveListeners = {
  beforeunload: (event: BeforeUnloadEvent) => void;
  pagehide: () => void;
  pageshow: (event: PageTransitionEvent) => void;
  visibilitychange: () => void;
};

/**
 * The listeners EditorRoot registers on the window and the document. A reload or a navigation
 * fires `pagehide` and nothing else that the room client sees, so `pagehide` writes the held
 * typing (heldTyping: the text sessions' keys of the last 100 ms, the notes typed in the last
 * 400 ms) and then stops the controller: the room client holds the writes as pending operations
 * when it persists them and posts the presence leave with keepalive. A tab turning hidden writes
 * the held typing too, since a phone may discard a hidden tab with no `pagehide`. A page the
 * browser restores from its cache reloads, since its stream and its client id are gone. `flush`,
 * `visibility` and `reload` are the browser's unless a test passes its own.
 */
export function leaveListeners(
  controller: {
    getSnapshot: () => Pick<EditorSnapshot, 'sync' | 'pending' | 'serverWrites'>;
    stop: () => void;
  },
  backend: Pick<EditorBackend, 'kind'>,
  flush: () => void = flushHeldTyping,
  visibility: () => DocumentVisibilityState = () => document.visibilityState,
  reload: () => void = () => window.location.reload(),
): LeaveListeners {
  return {
    beforeunload: leaveWarning(backend, () => unsavedWrites(controller.getSnapshot())),
    pagehide: () => {
      flush();
      controller.stop();
    },
    pageshow: (event) => {
      if (event.persisted) reload();
    },
    visibilitychange: () => {
      if (visibility() === 'hidden') flush();
    },
  };
}
