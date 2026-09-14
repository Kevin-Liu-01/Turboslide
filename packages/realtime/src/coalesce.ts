// The checkpointer's coalescing rules (gslides-parity SPEC-3 0.51; report 02 7.1, 7.8), pure:
// the entries a checkpoint commits are grouped per author and per contiguous run, and inside a
// run consecutive `text.splice` on one run of one Text fold into one splice, consecutive
// `block.set` (and `slide.set`, `deck.set`) of one pointer fold into the last value, so a drag's
// `pos` sets become the final box and a typing burst becomes one insert. Each group is one
// `Write` whose inverse the reducer computes; because a group holds one author's consecutive
// work only, undoing the record undoes that author's work and nothing else (the two author test
// in coalesce.test.ts). Comment entries are never coalesced; the checkpointer writes them to the
// sidecar in order (SPEC-3 5.2). No `node:`.
import type { Author } from '@turboslide/schema/mutations';

import type { Entry, RoomMutation, TextSpliceMutation } from './channel.ts';

/** One Write the checkpointer commits: an author's contiguous run of the stream. */
export type CoalescedWrite = {
  author: Author;
  clientId: string;
  fromSeq: number;
  toSeq: number;
  /** the op ids the write covers, for the two level acknowledgement */
  opIds: string[];
  mutations: RoomMutation[];
};

/** Two authors are one when kind, name, runId and principalId agree (SPEC-3 2.4). */
export function sameWriter(a: Author, b: Author): boolean {
  const pa = (a as { principalId?: unknown }).principalId;
  const pb = (b as { principalId?: unknown }).principalId;
  return a.kind === b.kind && a.name === b.name && a.runId === b.runId && pa === pb;
}

function isSplice(mutation: RoomMutation): mutation is TextSpliceMutation {
  return mutation.op === 'text.splice';
}

function samePointer(a: RoomMutation, b: RoomMutation): boolean {
  if (a.op !== b.op) return false;
  switch (a.op) {
    case 'block.set':
      return (
        b.op === 'block.set' &&
        a.slideId === b.slideId &&
        a.blockId === b.blockId &&
        a.path === b.path
      );
    case 'slide.set':
      return b.op === 'slide.set' && a.slideId === b.slideId && a.path === b.path;
    case 'deck.set':
      return b.op === 'deck.set' && a.path === b.path;
    default:
      return false;
  }
}

function sameText(a: TextSpliceMutation, b: TextSpliceMutation): boolean {
  return a.slideId === b.slideId && a.blockId === b.blockId && a.path === b.path;
}

/**
 * Folds `next` into `prev` when the two splices are one gesture on one Text: typing forward at
 * the end of the previous insert, a backspace inside it, a run of forward deletes at one offset
 * or a run of backspaces walking left. Anything else answers null and stays a second splice.
 */
export function mergeSplices(
  prev: TextSpliceMutation,
  next: TextSpliceMutation,
): TextSpliceMutation | null {
  if (!sameText(prev, next)) return null;
  const end = prev.at + prev.insert.length;
  // typing on: the caret sits at the end of what was inserted
  if (next.remove === 0 && next.at === end) return { ...prev, insert: prev.insert + next.insert };
  // a backspace or a replacement inside the previous insert
  if (next.at >= prev.at && next.at + next.remove <= end && next.remove > 0) {
    const head = prev.insert.slice(0, next.at - prev.at);
    const tail = prev.insert.slice(next.at - prev.at + next.remove);
    return { ...prev, insert: head + next.insert + tail };
  }
  // a run of forward deletes at one offset
  if (prev.insert === '' && next.insert === '' && next.at === prev.at && next.remove > 0)
    return { ...prev, remove: prev.remove + next.remove };
  // a run of backspaces walking left
  if (
    prev.insert === '' &&
    next.insert === '' &&
    next.at + next.remove === prev.at &&
    next.remove > 0
  )
    return { ...prev, at: next.at, remove: prev.remove + next.remove };
  return null;
}

/** Appends a mutation to a run's list, folding it into the last one when the rules allow. */
export function foldMutation(list: RoomMutation[], mutation: RoomMutation): void {
  const last = list[list.length - 1];
  if (last !== undefined) {
    if (isSplice(last) && isSplice(mutation)) {
      const merged = mergeSplices(last, mutation);
      if (merged !== null) {
        list[list.length - 1] = merged;
        return;
      }
    } else if (samePointer(last, mutation)) {
      // the last value wins the pointer (SPEC-3 3.5); a drag's pos sets become the final box
      list[list.length - 1] = mutation;
      return;
    }
  }
  list.push(mutation);
}

/**
 * Groups edit entries into one Write per author per contiguous run and folds each run's
 * mutations. Entries arrive in stream order; a change of author or client starts a new run.
 * Comment entries are skipped (the checkpointer writes them separately).
 */
export function coalesceEntries(entries: ReadonlyArray<Entry>): CoalescedWrite[] {
  const out: CoalescedWrite[] = [];
  let current: CoalescedWrite | undefined;
  for (const entry of entries) {
    if (entry.kind !== 'edit' || entry.mutations === undefined) continue;
    if (
      current === undefined ||
      current.clientId !== entry.clientId ||
      !sameWriter(current.author, entry.author)
    ) {
      current = {
        author: entry.author,
        clientId: entry.clientId,
        fromSeq: entry.seq,
        toSeq: entry.seq,
        opIds: [],
        mutations: [],
      };
      out.push(current);
    }
    current.toSeq = entry.seq;
    current.opIds.push(entry.opId);
    for (const mutation of entry.mutations) foldMutation(current.mutations, mutation);
  }
  return out;
}

/** Applies a splice to a plain string, the offsets rule of SPEC-3 3.1; the tests check folds with it. */
export function spliceString(text: string, splice: TextSpliceMutation): string {
  return text.slice(0, splice.at) + splice.insert + text.slice(splice.at + splice.remove);
}
