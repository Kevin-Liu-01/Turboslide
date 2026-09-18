import type { Mutation } from '@turboslide/schema/mutations';

/**
 * One burst of a typing group (SPEC 7.2.15: keystrokes on one Text inside 400 ms fold into one
 * history entry): the room client's clock at the burst's apply and how many mutations it added to
 * the entry's forward list and to its inverse.
 */
export type Burst = { at: number; forward: number; inverse: number };

/**
 * An undo or redo of a typing group moved past what landed since, burst by burst (the cycle 3
 * stream fix round, s2.md S2-R3). The group kept one clock, the first burst's, while every later
 * burst's inverse joined the entry, so a remote entry that landed between two bursts was already
 * in the document the reducer computed the later inverse against and the undo transformed that
 * inverse past it a second time. Each burst's segment is transformed from its own clock here: the
 * inverse list holds the bursts newest first (`group.inverse.unshift`), the forward list oldest
 * first (`group.mutations.push`). When the counts do not add up to the list (an entry the round
 * did not record burst by burst) the whole list is transformed from the first burst's clock, as
 * before.
 */
export function stepBursts(
  bursts: readonly Burst[],
  mutations: readonly Mutation[],
  side: 'forward' | 'inverse',
  transformSince: (mutations: Mutation[], at: number) => Mutation[],
): Mutation[] {
  const first = bursts[0];
  if (first === undefined) return [...mutations];
  const ordered = side === 'forward' ? [...bursts] : [...bursts].reverse();
  const total = ordered.reduce((sum, burst) => sum + burst[side], 0);
  if (total !== mutations.length) return transformSince([...mutations], first.at);
  const out: Mutation[] = [];
  let offset = 0;
  for (const burst of ordered) {
    const segment = mutations.slice(offset, offset + burst[side]);
    offset += burst[side];
    if (segment.length === 0) continue;
    out.push(...transformSince(segment, burst.at));
  }
  return out;
}
