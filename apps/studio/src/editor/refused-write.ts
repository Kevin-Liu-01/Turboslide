// A refused write's one sentence (docs/archive/rounds/POLISH.md item 102; audit-collab item 7). A structural
// refusal (a slide add, a move, a delete, a resize: nothing typed to keep) is one snackbar
// sentence named by what the write was, with no id and no JSON; the card stays for typed text
// alone, whose words a seller would otherwise lose. The sentence is the one every path says: the
// room client's `onReject` and `onUnplaceable`, the local refusal of a gesture whose slide a
// collaborator deleted first (the loser of docs/archive/rounds/SYNC.md 6.1 `sync.structural.concurrent`), and
// the error the write's caller is thrown, which the chrome's dispatch says in the same snackbar.
// Before this the caller's error carried the room's own words ("The room answered 409", the
// reducer's "No slide …" with its id) and said them over the sentence: the row
// sync.reject.sentence-below-toolbar read "The room answered 409" twice on the enforce preview
// of 2026-09-30 (the polish round's sync fix round 3).
import type { Mutation } from '@turboslide/schema/mutations';

/** The plain text a write carried, for the card's Copy text; '' for a structural write. */
export function refusedText(mutations: ReadonlyArray<Mutation>): string {
  return mutations
    .map((mutation) => {
      if (mutation.op === 'text.splice') return mutation.insert;
      if (mutation.op === 'text.replace') return mutation.text;
      if (mutation.op === 'block.set' && typeof mutation.value === 'string') return mutation.value;
      return '';
    })
    .filter((row) => row !== '')
    .join('\n');
}

/** A refused write that carried no typed text: a slide add, a move, a delete, a resize, a setting. */
export function isStructuralRefusal(mutations: ReadonlyArray<Mutation>): boolean {
  return refusedText(mutations) === '';
}

/**
 * The one sentence of a refused change that carried no typed text (item 102), by what it was. A
 * drag or a handle writes a positioned block's `/pos` (packages/viewer Gestures), so that write
 * is named as the move or the resize it was; `block.move` is the slot and order move.
 */
export function structuralRefusalSentence(mutations: ReadonlyArray<Mutation>): string {
  const ops = new Set(mutations.map((mutation) => mutation.op));
  if (ops.has('slide.insert')) return 'Your new slide was not added. Try again';
  if (ops.has('slide.move')) return 'Your slide was not moved. Try again';
  if (ops.has('slide.remove')) return 'Your slide was not deleted. Try again';
  if (ops.has('block.insert')) return 'Your new object was not added. Try again';
  if (ops.has('block.move')) return 'Your object was not moved. Try again';
  if (ops.has('block.remove')) return 'Your object was not deleted. Try again';
  if (mutations.some((mutation) => mutation.op === 'block.set' && mutation.path === '/pos'))
    return 'Your object was not moved or resized. Try again';
  return 'Your change was not applied. Try again';
}

/**
 * The sentence a refused write's caller is thrown (the chrome's dispatch says it in the
 * snackbar): item 102's for a structural write, so the snackbar shows one sentence however many
 * paths say it; the room's own for typed text, whose card carries it too.
 */
export function refusedWriteSentence(
  rejected: { reason: string; message?: string },
  mutations: ReadonlyArray<Mutation>,
): string {
  if (isStructuralRefusal(mutations)) return structuralRefusalSentence(mutations);
  return rejected.message ?? `The change was not accepted (${rejected.reason})`;
}
