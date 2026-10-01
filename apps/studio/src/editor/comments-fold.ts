// The tab's copy of the comment threads against what the server answers (the comments hotfix of
// 2026-10-01; docs/updates.md "the comments resolve hotfix"). On the blob tier every instance
// reads the sidecar through its own mirror, so a `comment.list` served by an instance that has
// not pulled the index yet can answer a thread at a revision below the one this tab just wrote
// through a comment action (the production gate of the people round: the panel kept the thread
// under Open after Resolve until a reload). Two rules, pure over their arguments:
//
// - A write action's answer carries the thread as the server committed it; it goes into the
//   tab's list at once (`withAnsweredThread`), so the card, the panel and `describe()` read the
//   resolve the moment the server answered it.
// - A list answer never moves a thread backwards: a listed copy below the revision the tab holds
//   is kept at the tab's copy, and a thread the tab holds above the answer's revision that the
//   answer lacks stays (`foldListedThreads`); the fold reports whether the answer was behind, so
//   the controller reads the sidecar again a moment later and converges on the store.
import type { Thread } from '@turboslide/schema/comments';

/** The tab's threads with a write action's answered thread in place of its older copy. */
export function withAnsweredThread(threads: readonly Thread[], thread: Thread): Thread[] {
  const known = threads.find((row) => row.id === thread.id);
  if (known !== undefined && known.revision > thread.revision) return [...threads];
  if (known === undefined) return [...threads, thread];
  return threads.map((row) => (row.id === thread.id ? thread : row));
}

export type ListFold = {
  threads: Thread[];
  /** the revision the tab reads now: the answer's, or the highest thread revision it kept above it */
  revision: number;
  /** true when the answer carried a copy below one the tab holds, or lacked a thread the tab holds above the answer's revision */
  behind: boolean;
};

/**
 * A `comment.list` answer folded over the tab's threads: every listed thread at the higher of
 * the two revisions, plus the tab's threads the answer lacks whose revision is above the answer's
 * (the answer's instance has not read them yet). A thread the tab holds at or below the answer's
 * revision that the answer lacks is gone (deleted past the window, or never the deck's), so it
 * leaves.
 */
export function foldListedThreads(
  known: readonly Thread[],
  answer: { threads: readonly Thread[]; commentsRevision: number },
): ListFold {
  const byId = new Map(known.map((row) => [row.id, row] as const));
  let behind = false;
  let revision = answer.commentsRevision;
  const threads: Thread[] = answer.threads.map((listed) => {
    const mine = byId.get(listed.id);
    if (mine !== undefined && mine.revision > listed.revision) {
      behind = true;
      revision = Math.max(revision, mine.revision);
      return mine;
    }
    return listed;
  });
  const listedIds = new Set(answer.threads.map((row) => row.id));
  for (const mine of known) {
    if (listedIds.has(mine.id)) continue;
    if (mine.revision > answer.commentsRevision) {
      behind = true;
      revision = Math.max(revision, mine.revision);
      threads.push(mine);
    }
  }
  return { threads, revision, behind };
}
