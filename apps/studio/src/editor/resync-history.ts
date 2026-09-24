// What a resync does to the tab's undo history (gslides-parity SPEC 6.7; SPEC-3 3.5, 3.6;
// build-4/hotfix-4.md section 3.7). Framework free.

/**
 * Whether a resync brought revisions this tab has not applied. The room client resyncs when a
 * write of this tab is refused as stale (a 409 `resync`), when the stream was reset behind it and
 * when the replay is too far behind. `fresh` is the revision the reloaded document carries and
 * `known` the last revision this tab acknowledged (the controller's `serverRevision`, which
 * follows the room client's acknowledged revision).
 *
 * A resync that lands at or below the known revision brought nothing new. On the blob tier the
 * refused write was based one revision low: the instance that admitted it read its mirror of the
 * deck inside the 750 ms sync window while another instance had committed the tab's previous
 * write, so the store's `ifMatch` refused the base. The tab had already applied every revision up
 * to the head, its history entries and their transform clocks stay valid, and the room client
 * re-sends the refused write after the reload. Clearing the history there threw the redo stack
 * away in the middle of Cmd Z then Cmd Shift Z and named the tab's own write as one that arrived
 * from outside (the editor walk's row 21 and 22 on the preview, hotfix 4 section 3.7).
 *
 * One that lands above the known revision brought entries the tab never applied, past which no
 * history entry can be transformed, so the caller clears the history and shows the external
 * revision banner.
 */
export function resyncBroughtUnseen(fresh: number, known: number): boolean {
  return fresh > known;
}

/**
 * The revision a tab counts as acknowledged once the store has answered its own server side write
 * (asset.add, asset.dither, material.capture, logo.insert: the write runs on the server and the
 * answer carries the revision it committed). On the blob tier the tab reloads at once for that
 * write instead of waiting for the channel's poll, and the reload lands at the answered revision:
 * counted as acknowledged before the reload, it is nothing the tab has not asked for, so
 * `resyncBroughtUnseen` keeps the undo history and shows no banner naming the tab's own write as
 * one that arrived from outside (the features round, ship one: the banner "Revision rN arrived
 * from outside this editor" after asset.add and logo.insert). A reload that lands above it still
 * brought another writer's entries. An answer without a revision, or one below what the tab
 * already acknowledged (a mirror's number), changes nothing.
 */
export function acknowledgeAnswered(known: number, answered: unknown): number {
  return typeof answered === 'number' && Number.isFinite(answered) && answered > known
    ? answered
    : known;
}

/**
 * How long a tab waits for the channel to bring back its own server side write before it reloads
 * on the blob tier. The write (asset.add, asset.dither, material.capture, logo.insert, slide.import;
 * the assist's Accept through its route) commits on whichever instance answered the POST, and the
 * instance holding this tab's stream learns of a commit made elsewhere at its pulse tick: 2 s
 * while the deck is in use there, 10 s when the tab is alone (store/pulse.ts). A commit made on
 * the tab's own instance reaches the stream within milliseconds, inside this wait, and costs no
 * reload; past it the tab reloads at once (room.resync) instead of sitting on the tick (the
 * features round, ship one: assist.rewrite.card-accept-undo read the accepted body 7 s after the
 * route answered, behind a 5 s wait for the entry, on the preview). Under a second, never 5 s.
 */
export const OWN_WRITE_STREAM_WAIT_MS = 250;
/** The most a tab waits for its own server side write to land before it answers anyway. */
export const OWN_WRITE_LANDED_MAX_MS = 15_000;

/**
 * Whether the tab reloads now for its own server side write: the entry has not landed, the room
 * runs on the blob tier (the memory tier's follower streams the write within milliseconds, and a
 * reload there is a read for nothing) and the short wait has run out.
 */
export function resyncsForOwnWrite(input: {
  landed: boolean;
  tier: string | undefined;
  waitedMs: number;
}): boolean {
  return !input.landed && input.tier === 'blob' && input.waitedMs >= OWN_WRITE_STREAM_WAIT_MS;
}
