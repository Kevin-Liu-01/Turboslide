// What a write's promise waits for once the room admitted it (controller.tsx `commitAs`), by who
// dispatched the write. Framework free, so the rule is unit tested (commit-answer.test.ts).

/**
 * `acknowledged`: the revision the write made, which the next write bases on (SPEC-3 3.10). On
 * the memory and do tiers that revision moves at the room's checkpoint (2 s idle, 10 s under
 * activity; ack-wait.ts caps the wait at 15 s); on the blob tier at the ops POST's answer.
 * `admitted`: the room admitted the write and this tab applied its own entry; the answer carries
 * the revision the page reports at that moment.
 */
export type CommitAnswer = 'acknowledged' | 'admitted';

/**
 * The chrome's own dispatch answers its writes at their admission; the window API keeps the
 * acknowledged answer, the base of an agent's next write (SPEC-3 3.10).
 *
 * The shell says a write's sentence, with its Undo, when the dispatch answers: the menu plans of
 * EditorShell.tsx (Slide > Delete slide reads "Slide deleted" with Undo), the layout and background
 * rows. On the memory and do tiers an answer at the checkpoint put "Slide deleted" on screen 2 to
 * 10 s after the delete, over the sentence of a later write: after Slide > Delete slide, Undo and
 * Redo, a Delete of two selected cards said "Deleted 2 slides", and the late "Slide deleted"
 * replaced it, so its Undo took back one slide of the two (VERIFICATION.md "Realtime round,
 * pass 3" P3-1, `slides.delete.two-selected-key-undo`, traced in build/r3/fix3/). The blob tier
 * answers at the ops POST, so production read the sentence at once and the do tier did not.
 *
 * The scope is entered around the synchronous part of a chrome dispatch: the dispatcher calls
 * the handler, which runs until its first await, and a handler commits there. A commit made inside
 * the scope reads `admitted`; one made after an await reads `acknowledged`, the answer every
 * write had before this.
 */
export type AnswerScope = {
  /** runs `run` with every commit inside its synchronous part answering at the admission */
  during: <T>(run: () => T) => T;
  /** the answer a commit made now takes */
  answer: () => CommitAnswer;
};

export function createAnswerScope(): AnswerScope {
  let depth = 0;
  return {
    during(run) {
      depth += 1;
      try {
        return run();
      } finally {
        depth -= 1;
      }
    },
    answer: () => (depth > 0 ? 'admitted' : 'acknowledged'),
  };
}
