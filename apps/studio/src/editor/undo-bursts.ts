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

/** The open typing group (SPEC 7.2.15): its history entry, the Text it names and its last keystroke's clock. */
export type TypingGroup = { entryId: number; key: string; at: number };

/**
 * The keystrokes since the last burst: the first one's clock and the last one's, as the controller
 * reads them from the document's keydown (the printable keys, Backspace, Delete and Enter, no
 * shortcut). Null `first` means no key fell since the last burst (a paste, a mark toggle, a
 * write from the window API), and the burst's own clock stands in for both.
 */
export type KeyClock = { first: number | null; last: number };

/**
 * The typing group a burst joins, or null when it starts an entry of its own. SPEC 7.2.15 words the
 * rule by keystrokes: keystrokes on one Text inside 400 ms fold into one Cmd Z. Before the polish
 * round's fix round 2 the controller compared the clocks of the bursts' commits instead, and a
 * burst is written only 100 ms after the keys pause (InlineText TEXT_BURST_MS), so two bursts of one
 * continuous title were 580 to 1400 ms apart whenever a key gap over 100 ms fell mid word and one
 * Cmd+Z took back the second burst alone (VERIFICATION.md "Polish round, pass 2" finding 3: the
 * split followed the draft's first write because that write is the first burst). The gap read here
 * is the one between the last group's last keystroke and this burst's first keystroke, so a title
 * typed at human speed is one Cmd+Z whichever save lands while the keys fall, and a pause over the
 * window still starts a new step, as Google's does. The burst's clock `nowMs` stands in for a
 * missing keystroke clock (a paste, a toggle, an agent's write).
 */
export function typingGroupFor(
  last: TypingGroup | null,
  key: string | null,
  keys: KeyClock,
  nowMs: number,
  windowMs: number,
): number | null {
  if (key === null || last === null || last.key !== key) return null;
  const startedAt = keys.first ?? nowMs;
  return startedAt - last.at < windowMs ? last.entryId : null;
}

/** The group after a burst landed in `entryId`: keyed by the burst's Text, clocked at its last keystroke (else its commit). */
export function typingGroupAfter(
  entryId: number,
  key: string | null,
  keys: KeyClock,
  nowMs: number,
): TypingGroup | null {
  if (key === null) return null;
  return { entryId, key, at: keys.first === null ? nowMs : keys.last };
}
