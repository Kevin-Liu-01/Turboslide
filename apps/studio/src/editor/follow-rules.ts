// The follow's end rules and the agent banner's gate, pulled out of the controller so a unit test
// reads them (docs/REALTIME.md 2, rows realtime.follow.for-everyone and
// realtime.agent.write-announced; 3.3; docs/gslides-parity/realtime/audit-people.md 1.5, section
// 2, defect 7). Google Slides ends a follow when the follower edits, adds or edits a comment,
// clicks a different slide, enters Slideshow or opens Version history, and when the followed
// person refreshes or leaves (https://support.google.com/docs/answer/12815819, read in
// audit-people.md section 2). Before the realtime round two of the six ended it here: the own
// commit and the followed client's leave. The controller now runs these rules from the one place
// each trigger passes through: `commit` (the edit), `setActiveSlide` (the own click and the
// keyboard, with the follow's own move excepted), the room's comment writes, `setView` (the
// show) and the editor shell's panel (Version history); the `leave` event stays the sixth.
import type { Entry } from '@turboslide/realtime/channel';

/**
 * The comment writes of the room (SPEC-3 5.3) that end a follow; the reads (`comment.list`,
 * `comment.get`, `comment.link`) never do, and neither do the inbox's.
 */
export const FOLLOW_ENDING_COMMENT_ACTIONS: ReadonlySet<string> = new Set([
  'comment.add',
  'comment.reply',
  'comment.edit',
  'comment.delete',
  'comment.resolve',
  'comment.reopen',
  'comment.assign',
  'comment.done',
  'comment.react',
]);

/** True for a room action of this tab that ends its follow. */
export function endsFollowOnAction(action: string): boolean {
  return FOLLOW_ENDING_COMMENT_ACTIONS.has(action);
}

/**
 * A slide change ends the follow unless it is the move the follow itself made: the follow selects
 * the slide the followed person's roster row names, so the shell's report of that slide keeps the
 * follow and every other slide is the follower's own click or key (the roster row is read at the
 * report, so two moves of the followed person in one frame never read as the follower's). Nothing
 * ends while nobody is followed; a followed person with no slide open ends on any own move.
 */
export function endsFollowOnSlide(input: {
  following: string | null;
  followedSlide: string | null;
  slideId: string;
}): boolean {
  if (input.following === null) return false;
  return input.slideId !== input.followedSlide;
}

/** The right panel whose opening ends a follow (Google: "You open Version history"). */
export const FOLLOW_ENDING_PANEL = 'versionHistory';

/** True when the panel just opened; it stays open without ending anything again. */
export function endsFollowOnPanel(
  previous: string | null | undefined,
  next: string | null | undefined,
): boolean {
  return next === FOLLOW_ENDING_PANEL && previous !== FOLLOW_ENDING_PANEL;
}

/** Entering the show ends a follow (Google: "You enter Slideshow mode"); leaving it ends nothing. */
export function endsFollowOnView(
  previous: { present: boolean },
  next: { present: boolean },
): boolean {
  return next.present && !previous.present;
}

/**
 * The entries of a stream event the agent banner announces (docs/REALTIME.md 3.3; docs/PRODUCT.md
 * 6.1 "Outside writes"): an author whose kind is `agent` (since the realtime round the server
 * writes it for every bearer whose caller is an agent, with the token's label as the name and the
 * `x-turboslide-author` run id when the request carried one; the assist's accept and the checkout
 * agent wrote it before), a client id that is not this tab's own (the room's server write carries
 * `agent:<principalId>`, the blob tier's record `store`; a tab's earlier ids count as its own
 * after a reload), and mutations on the entry. An entry whose note this tab's own assist accept
 * wrote is skipped once and its note consumed, so the seller's own accept raises no banner.
 */
export function agentEntriesOf(
  entries: ReadonlyArray<Entry>,
  own: { clientId: string | null; earlierIds: ReadonlyArray<string>; assistNotes: Set<string> },
): Entry[] {
  return entries.filter((entry) => {
    if (entry.note !== undefined && own.assistNotes.delete(entry.note)) return false;
    if (entry.author.kind !== 'agent') return false;
    if (own.clientId !== null && entry.clientId === own.clientId) return false;
    if (own.earlierIds.includes(entry.clientId)) return false;
    return entry.mutations !== undefined && entry.mutations.length > 0;
  });
}
