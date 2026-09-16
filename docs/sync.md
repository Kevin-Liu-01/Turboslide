# The sync engine

How an edit travels from a tab to the store and to every other tab, and what each party may
assume, after the round five rework (`docs/gslides-parity/SPEC-5-amendments.md` A3, A6, A8; the
build notes are `docs/gslides-parity/build-5/b7.md`). Google Slides is the reference: a single
user never sees a revision conflict, no keystroke is lost, the saved state is confirmed within
about a second, and two tabs converge on one document. The realtime protocol itself is
`docs/gslides-parity/SPEC-3.md` section 3; this document states the rules the rework added and
where each one lives.

## 1. One revision authority

The store's manifest revision is the truth. A write answer (`POST /api/decks/:id/ops`), a stream
frame (`GET /api/decks/:id/stream`) and a document read each carry `revision`, and the client's
`serverRevision` is the highest revision a write answer acknowledged or the stream delivered. The
client never computes a revision.

- `packages/realtime/client/room-client.ts`: `revision` moves in `hello`, in a checkpoint frame
  (never backwards), in the write answer, and, on the blob tier, in an `op` frame, whose `seq` is
  the revision the record made. `SyncStatus.revision` is that number.
- `apps/studio/src/editor/controller.tsx` publishes `serverRevision` from `onStatus` as the larger
  of the room client's revision and what it holds; `describe().state.revision` and every chrome
  write's `baseRevision` read it (`reportedRevision`).
- The status words (`[data-control="deck.saveState"]`) read saved once nothing is pending or
  retained; a chip that shows a revision shows this one, never a number behind the server's.

## 2. No time based document cache on the blob tier

Fluid compute runs several instances, so instance memory is never the truth. Until round five the
Blob mirror served a document for 750 ms after its last head call (`syncTtlMs`), so a write
admitted inside that window met a store one revision ahead (`build-4/hotfix-4.md` 3.6 and 3.7).

- `packages/store/src/blob-store.ts`: `sync()` serves the mirror without a head call only while
  the mirror's revision equals the one the room last delivered to this instance
  (`noteDelivered(revision)`, `deliveredRevision()`); a forced sync, the watch poll and every write
  read the head. `syncTtlMs` is kept in the options type and has no effect.
- `packages/realtime/src/blob.ts`: the channel tells the store the revision it delivered (its own
  commit, a record its poll announced, the position at the first subscribe), so a frame with a
  higher revision moves the cache key.
- `apps/studio/src/server/room.ts` `syncLive`: the live document of a blob tier room is read at
  the store's head on every admission.

The tests are `packages/store/src/blob-sync.test.ts` and `packages/realtime/src/blob.test.ts`.

## 3. Refused writes rebase

A write refused on the blob tier answers 409 with the current revision and, when the client is at
most one ops batch behind, the entries since its base (`since`). The tab applies them as remote
entries (its pending operations move past them with the schema's transform, its own echo settles),
then posts again on the new base, once, without a prompt. A 409 that carries nothing, or one the
client cannot reach the head from, reloads the document as before. Only a true conflict on the same
text shows the conflict card, and the card names the other author.

- `apps/studio/src/server/room.ts` `admitOnBlob`: the 409 body's `since` and `movedSentence`.
- `apps/studio/src/editor/sync/transport.ts`: the browser transport hands `since` back to the room
  client.
- `packages/realtime/client/room-client.ts`: the rebase in `flush`, counted in `SyncStatus.rebased`;
  `onUnplaceable(op, entry)` names the entry that rewrote the text.
- The memory and redis tiers transform a stale base on the server (`admitOps`) and never answer 409.

The unit tests are in `packages/realtime/client/room-client.test.ts` ("round five").

## 4. One write in flight per tab

The checkpointer coalesces, but a tab has at most one ops POST in flight: `flush` waits for the
answer, applies the entries it names, and only then sends the next batch. An answer that names an
operation at or below the tab's position (a replayed POST) settles it instead of leaving it under
Saving. On the blob tier a record the room committed for a tab carries the tab's client id and the
op ids of its batch (`WriteOptions.origin`, `VersionRecord.clientId` and `opIds` in
`packages/store/src/store.ts`), so an op the server already committed is answered with its record
and never appended twice, whichever instance the retry lands on.

## 5. One identity per tab

- One `clientId` per tab, kept in `sessionStorage` and asked for on every stream open (`?client=`);
  the server keeps it when its MAC names this deck and this identity (`bindClient` in `room.ts`)
  and issues a fresh one otherwise. The op counter lives beside it, so a kept id never repeats a
  counter. The earlier ids of a tab ride as `?retire=` and leave the roster before hello.
  (`apps/studio/src/editor/client-ids.ts`: `heldClientId`, `idsToRetire`, `opCounterFor`.)
- One principal per browser: the sealed cookie. The self filter applies on every presence surface
  by client id and by principal id: the roster, the title slot's chips, the filmstrip marks, the
  sheet outlines, the carets and flags, the pointers, follow and the announcements. A tab's own
  earlier id and the same person's other tab are never drawn as a collaborator.
  (`client-ids.ts` `partitionRoster(rows, ownClientIds, currentClientId, ownPrincipalId)`;
  `packages/chrome/src/presence/presence-model.ts` `withoutSelf`, `othersOf`, applied in every
  presence component.)
- The stream's echo of the tab's own operations is applied as an acknowledgement, never drawn as
  a remote change; on the blob tier a record's echo from another instance names the tab and its
  batch as `<clientId>:<first>+<count>` (`packages/realtime/src/op-ids.ts`).
- The headless capture loads a self contained file (`packages/headless`), the thumbnails render
  through the worker's CLI child process, and the render routes read the cookie or the bearer
  without minting a principal (`requestContext` reads; only the room routes' `requestIdentity`
  mints, and the capture never calls them). None of the three joins a room.

## 6. Publication after the commit

The blob tier's write path commits the record, tells the mirror the revision, then publishes the
`op` and `checkpoint` frames with the new revision as their seq and the author's client id. The
room on every instance moves its cache key on a higher revision (section 2).

### The shared roster

The blob tier's presence used to be one roster per instance (`build-4/hotfix-2.md` deviation 2), so
two tabs on different instances disagreed about each other and a leave landed on one instance
only. The first design of round five joined the instances through one shard per instance under
`.turboslide/presence/`, discovered with the store's listing and written by a one second timer.
VERIFICATION-5 finding 14 showed the two facts of the deployment that design cannot live with: the
listing of Vercel Blob lags a write by up to a minute, so a new instance's shard and an updated
shard's version were read late, and a timer on a fluid compute instance with no request in flight
never fires, so the shard write of a leave or a join whose request had already answered never
happened. Since the fix round the roster is one file per deck, `decks/<id>/.turboslide/presence.json`,
read by name (one head call; the body only when the version moved, and read again while it does
not hash to the etag, so a body the CDN served stale is never trusted) and written with a compare
and swap on the store's etag inside the request that changed a row: a presence post writes it when
the last write is older than the spacing (1 s per deck per instance) and schedules the write
otherwise, a leave waits for the spacing and writes every time, and a scheduled write a frozen
instance never made leaves with the next request that touches the deck. The file carries every
instance's live rows (the tab's state, the carrying instance, the time of the tab's last post) and
the leaves of the last two minutes (`left` rows), so the instance that still carries a tab's row in
memory drops it once the tab's leave landed anywhere and tells its streams. The reader merges the
other instances' rows into its memory roster as `presence` and `leave` frames; a row moves to the
instance that saw the newer clock; a leave at or after a row's post is the last word on it unless
the tab posted again after the leave (a reload under the same id); a row older than the roster's
expiry (120 s) is a tab or an instance that went away; a leave announced on the reading instance
is never undone by a row written before it. The hello of a fresh stream reads the file first when
the last poll is older than the cadence (3 s while the deck streams). A closing instance writes the
file without its rows. A store without state files (a checkout's file store under
`TURBOSLIDE_REALTIME=blob`) keeps the per instance roster.

- `packages/store/src/blob-store.ts`: `readStateFile`, `putStateFile`, `deleteStateFile`,
  `listStateFiles`, `StateFile`, `StateFileKnown`, `PutStateFileOptions`,
  `STATE_FILE_READ_RETRIES`.
- `packages/realtime/src/blob.ts`: the presence wrapper, `ROSTER_FILE`, `PRESENCE_SHARD_WRITE_MS`
  (the write spacing), `PRESENCE_SHARD_POLL_MS` (the poll cadence), `ROSTER_WRITE_ATTEMPTS`,
  `isLostWrite`, `BlobChannel.sharedRoster` (`instanceId`, `poll`, `flush`).

The cost per instance while a deck streams: one head call every 3 s (a body read when the version
moved), and one compare and swap (a head, a body, a put) per second at most while rows change (a
heartbeat every 25 s per tab).

### One stream per tab per instance

A tab holds one EventSource. The stream route closes an earlier stream this instance holds under
the same client id before it counts the new one (`room.ts` `StreamCounters.claim`), so a reload or
a reconnect after the network came back never meets the identity cap (four streams per anonymous
identity per instance) on its own dropped streams, which the runtime does not always report as
aborted; the superseded stream posts no leave, since its tab is still here. The leave a closing
stream posts runs inside Vercel's `waitUntil`, so the roster write it makes outlives the response.
On the browser side (`apps/studio/src/editor/sync/transport.ts`) an EventSource that closed for
good after an HTTP answer (a 503 at the cap, a 5xx from a cold function) is opened again after a
backoff (1 s doubling to 30 s, reset by a hello) from the last event id it saw, with the tab's
client id and without the retire list; a network error, which the browser retries itself, opens
nothing. Before the fix round a tab whose stream met one bad answer stopped converging for good
(finding 14's "B did not converge").

### Chat on the blob tier

A chat message is a `chat` entry on the operation stream (SPEC-5 10): never a record, never a
revision. The memory tier holds it in the stream; the blob tier has no stream apart from the
version log, so until the fix round a chat entry was accepted and dropped (VERIFICATION-5 finding
3). Since then a chat entry is a numbered file under the deck's state folder,
`decks/<id>/.turboslide/chat/<n>.json`, appended with a create only put so two instances never
take one number (a taken number is read and the next tried), carrying the entry with `seq` the
revision it was sent at. Every instance's `since` merges the messages after the position into its
page (after the record of the revision they were sent at; a page that filled its limit carries the
messages up to its last record), so `chat.list` on any instance lists a message the moment
`chat.send` answered on another; a read walks past the highest number it knows by name (the
listing is a lower bound on the first read only), at most once per 500 ms per deck per instance.
The poll that reads the roster file while the deck streams reads the chat too and hands new
messages to this instance's streams as `op` frames. A store without state files keeps the chat per
instance. The clear when the last participant leaves is not made on this tier (the roster's truth
across instances is eventual, and a wrong clear would lose a live conversation): the deck's
removal deletes the folder, and a message is gone from `chat.list` when its revision leaves the
2,000 entry window `chat.list` reads.

- `packages/realtime/src/blob.ts`: `CHAT_DIR`, `CHAT_PROBE_MIN_MS`, `CHAT_READ_MAX_FILES`,
  `CHAT_APPEND_ATTEMPTS`; `append` (the chat entries), `since` (the merge), the poll.

## 7. The heartbeat, the hidden tab and the poll backoff

- The presence heartbeat is 25 s (`HEARTBEAT_MS` in `room-client.ts`), under the roster's 30 s
  stale mark; it was 5 s (720 function invocations an hour per open editor). A hidden tab posts no
  heartbeat and posts once when it is shown again (`Visibility`, `documentVisibility`).
- The session poll (`apps/studio/src/components/useStudioSession.ts`) detaches while the tab is
  hidden and re attaches when it is shown; a poll that throws retries after 2 s doubling to 60 s
  (`retryDelayMs`). `docs/sessions-polling.md` holds the cadence's history.
- The stream reads offline after 3 s down without a hello (`OFFLINE_AFTER_MS`);
  `describe().state.sync.offline` says so, and the save words read the retry word.

## 8. The pending mirror and a reload

Every pending operation, sent or not, is written to the pending mirror (IndexedDB) before the page
leaves: `stop()` persists first, then posts the leave with keepalive. After a reload the same tab
(the same client id) replays its own queue without a prompt; another tab's queue is offered on the
plate (`sync.persisted`). A `sent` operation replays under its own op id, which the server answers
with the entry it made if it landed, so nothing is committed twice.

What the mirror cannot hold is text still inside the editable's 100 ms typing burst at the moment
of the reload: the burst must flush on `pagehide` before the room client stops
(`packages/viewer/src/InlineText.tsx`, a request to B4 in `b7.md`).

## 9. The wording rule

The strings "is stale" and "baseRevision" never reach a person. A refused base reads "The
presentation moved to revision N while this change was on its way" (`movedSentence` in
`room.ts`); a conflict card names what happened and who changed the text first. The sync stress
probe reads the state, the snackbar, the toasts and the status row for the old words after every
step; `apps/studio/src/server/room-wording.test.ts` pins the sentence.

## 10. Tests and probes

- `scripts/probes/sync-stress-probe.mjs --base <url> [--quick] [--json <path>]`: fifty rapid edits
  in one tab (each acknowledged at exactly the next revision, no stale words, no lost character),
  one forty character burst, two tabs of one person alternating edits, the presence rows of one
  person in two tabs (nobody) and of another person (exactly one other, forgotten on leave), a
  reload in the middle of a burst, a five second offline window, the final convergence. Check
  step 37 runs it on the node-server build; the hosted smoke runs it against the preview with two
  contexts.
- `scripts/probes/new-write-probe.mjs`: the twelve acknowledged edits of hotfix 2, the reload, and
  the second tab of the same person as nobody in either tab.
- `apps/studio/e2e/sync.spec.ts`: the same rules as Playwright rows on a dev server.
- `packages/realtime/client/room-client.test.ts`, `packages/realtime/src/blob.test.ts` (the shared
  roster across two instances, the leave that undoes a carried row, the listing and CDN lag, the
  chat entries), `packages/store/src/blob-sync.test.ts`, `packages/store/src/blob-state.test.ts`
  (the state files), `apps/studio/src/editor/client-ids.test.ts`,
  `apps/studio/src/editor/sync/transport.test.ts` (the reopen), `apps/studio/src/server/retire-clients.test.ts`,
  `apps/studio/src/server/stream-claims.test.ts` (one stream per tab per instance),
  `apps/studio/src/server/room-wording.test.ts`, `apps/studio/src/components/useStudioSession.test.ts`.

## 11. The numbers

The baseline against `BASE` (main at `d5a1be5`, the memory tier of a checkout) and the numbers
after the rework are in `docs/gslides-parity/build-5/b7.md` sections 7 and 10: the acknowledgement
latency per edit, the propagation latency between tabs, the time to converge after the offline
window, the stale message count and the lost character count.
