// Which way an undo or redo step is written (controller.tsx `undoOnce`, `redoOnce`, `undoToOnce`):
// through the room like any edit, or through the server function the way a version restore is.
// Framework free, so the rule is unit tested (undo-route.test.ts).
import { OPS_POST_MAX_BYTES } from '@turboslide/realtime/protocol';
import type { Mutation } from '@turboslide/schema/mutations';

/** The room client keeps this much of an ops post for the envelope (room-client.ts `flush`). */
const POST_ENVELOPE_BYTES = 1024;

/** The bytes of a step as the room client counts an op (room-client.ts `bytesOf`). */
export function stepBytes(mutations: readonly Mutation[]): number {
  return new TextEncoder().encode(JSON.stringify(mutations)).byteLength;
}

/**
 * True when a step goes through the server function: the entry's own write was a server first
 * write (a version restore, whose reducer needs the version log; its redo has gone this way since
 * the product round), or the step is larger than one ops post carries.
 *
 * The undo of a restore is the diff from the restored version back to the deck as it stood, every
 * slide added since that version in full. On the 30 slide walk deck it is hundreds of kilobytes,
 * and the room client never sends an op over OPS_POST_MAX_BYTES: the op stayed pending, the deck
 * read Saving for good with the restore undone on this page alone, and every later write of the
 * tab waited behind it (VERIFICATION.md "Realtime round, pass 3" P3-3, `versions.undo-restore`;
 * build/r3/fix3/restore-undo.mjs read an undo of 329,456 bytes stay pending). The server function
 * takes the step whole, the room admits it as one entry, and the tab reloads at its revision, as
 * it does after the restore.
 */
export function stepTravelsServerFirst(
  forward: readonly Mutation[],
  step: readonly Mutation[],
): boolean {
  if (forward.some((mutation) => mutation.op === 'version.restore')) return true;
  return stepBytes(step) > OPS_POST_MAX_BYTES - POST_ENVELOPE_BYTES;
}
