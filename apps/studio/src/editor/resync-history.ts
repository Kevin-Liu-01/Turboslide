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
