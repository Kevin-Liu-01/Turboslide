# Lane RC, the realtime client: wave 2 build notes

The lane's wave 2 pushes of `docs/hardening/HARDENING.md` (5, 8.2), in the lane's order: HR-RC#1, #2, #9, #4, #5a, #5b, #5d, #6, #3 and #5c, and HR-RC#10 for a finding of this round. They close RELIABILITY-2's residual R (CRIT-M1) and the verifier's D, RELIABILITY-3, 4, 5, 6 (client), 7 and RUST-2 (client), and a room client test pins CRIT-M17's browser half. Every pin is a unit, simulation or route test: no push enters a matrix row before HR-0, which is not on `origin/main`, so each push names the row it proposes for HR-0. The studio on 4860 and the Worker on 8860 served the lane's local runs and pictures; both were stopped before the lane returned.

The lane worked in `/Users/kevinliu/repos/Turboslide-harden` on `harden/wave2` beside the RT, O and PS lanes. Most pushes change `packages/realtime/client/room-client.ts`, and they were built together in the tree. Each push's version of a shared file was kept as a copy in the lane's scratch folder once its tests passed, read again alone on the commit before it (red without the push, green with it), and committed under the git lock from that copy (`git hash-object` and `git update-index`), so a commit holds that push and nothing of a later one. No commit replaces a line another lane committed.

## The commits

| Push             | Commit      | Closes                               | Waits on (section 5), all in the log                     | Ships |
| ---------------- | ----------- | ------------------------------------ | -------------------------------------------------------- | ----- |
| HR-RC#10         | `f3e0461bc` | the finding below (severity 2)       | nothing                                                  | now   |
| HR-RC#1          | `86b97b9e5` | RELIABILITY-3 (F3)                   | HR-RT#2 `f9c0af448`                                      | now   |
| HR-RC#2          | `5d27c8179` | RUST-2, client half                  | HR-RC#1, HR-RT#3 `175520448`                             | now   |
| HR-RC#9          | `9cda1bd5f` | RELIABILITY-2 residual R, D, CRIT-M1 | HR-RC#2                                                  | now   |
| HR-RC#3          | `ae1e14d3f` | RELIABILITY-4 (F2)                   | HR-RC#2, DROPDOWNS DD-C#2 (`87e2d8f6e` on `origin/main`) | now   |
| HR-RC#4          | `6d6837121` | RELIABILITY-7                        | HR-RT#5a `c1cb1a288`                                     | now   |
| HR-RC#5a         | `f9d1338ee` | RELIABILITY-5, the offsets           | HR-RC#4                                                  | now   |
| HR-RC#5b         | `745d878b3` | RELIABILITY-5, past the window       | HR-RC#5a                                                 | now   |
| HR-RC#5d         | `58c3fbd0f` | RELIABILITY-5, the cap               | HR-RC#5b                                                 | now   |
| HR-RC#6          | `a0beddeaa` | RELIABILITY-6, client half           | HR-RC#5d, HR-RT#14 `fb507f8b5`                           | now   |
| HR-RC#5c         | `48b2518c9` | RELIABILITY-5, the old queue         | HR-RC#6, DROPDOWNS DD-C#2                                | now   |
| HR-RC (CRIT-M17) | `d594eaaf1` | CRIT-M17, the room client tests      | nothing (a test file alone)                              | now   |

Each commit's body names its files, its tests and their readings with the load. Two places where the branch's order differs from section 5's: HR-RT#5a (#34) sits ahead of HR-RC#9 (#32) in the branch (RT.md request 4: their files are disjoint), and HR-RC#3 (#51) sits ahead of HR-RC#4 (#35) because it waits only on HR-RC#2 and DD-C#2, both earlier, and shares no file with HR-RC#4 to #6.

## HR-RC#10, a viewer keeps receiving live edits after a comment

The finding, severity 2, older than wave 2 and on `origin/main` `f7e97039`. The room's reader filter (`room-core.ts` `filterEventForReader`, used by the stream route, the replay and the Durable Object's fan out) left an entry out of a reader's stream when the reader may not read it: a comment for a viewer without the comments switch (the default), and an edit of the speaker notes alone for a viewer or a commenter. A tab moves its position one seq at a time, so it held every later entry above the gap and waited for good; the gap watch's reopen replayed the same gap.

The filter now sends such an entry as `hiddenEntry`: its seq, revision, writer ids and time, no mutations, no comment, and its op id in `covers`, the shape `protocol.ts` `hasPayload` accepts, so a tab of the build on production today moves past it too. The client applies nothing for it.

Before the fix, on the local do tier (studio on 4860 with `TURBOSLIDE_REALTIME=do`, Worker on 8860): a viewer link holder read "Before comment" 15 s after the owner's comment and a title edit, at position 20 with the head at 33 (load 272); a commenter after a notes edit read the same at 21 with the head at 32 (load 206). After: the viewer read "After comment" at position 5 with the head at 5 (load 134), the commenter at 27 with the head at 27 (load 154). `hidden-entries.test.ts` 6 of 6. Proposed row: `realtime.viewer.edits-after-comment`.

## HR-RC#1, an undo moves past another person's insert as the tab placed it

`transformSince` moved an inverse past every remote entry as the room wrote it. The room placed this person's run to the left of the other person's insert at the same offset, so the room's copy of that insert pushed the undo onto the other person's word. `applyEntry` now keeps each remote entry's mutations as the tab placed them (`placed`), and `transformSince` moves the inverse past those: the frame of the document the inverse was recorded on.

The undo property in `two-typers.test.ts` (two people, two rounds, 300 seeded orders from 10,001): 0 of 300 with the fix (load 183 to 188), 100 of 300 without it. Proposed row: `realtime.undo.keeps-other-word`.

## HR-RC#2, one rule for a whole Text rewrite in the room client

The room client's own `rewritesText` disagreed with the admission: a `slide.set` of a title font or of speaker notes dropped every pending text op of the slide, and a `block.set` of a parent pointer kept an op the room refuses. The copy is gone; the room client reads `rewritesText` from `@turboslide/schema/transform`, the rule `room-core.ts` reads. RT#3's table test reads the room client's `transformPast` on every row: 31 of 31, and 4 of 31 red against the old copy. Proposed row: `collab.typing-survives-font-change`.

## HR-RC#9, a lost answer's resend keeps its author's words once

Read first with a trace of every post, answer and stream event (seeds 10004, 10010, 10021, 10022 and 10109; the trace stayed out of the tree). The side was the room client in all five mechanisms, and the server needed no change:

1. Ops moved by a remote entry were copied, so a lost answer cleared `inflight` on the old object and the queued copy stayed in flight for good. Ops now move in place.
2. An op the room admitted above a gap stayed in flight and the next op went alone on a base below it. An unsent op now goes with every pending op before it; the room answers those from its log by op id (RT#2).
3. A POST whose answer was lost was resent under the next client id after a reconnect, which the room reads as a new write. Such an op waits for the hello of a stream opened after the failure.
4. D: a hello below the position was read as a reset although a POST answer had moved the position since. A hello is a reset only below the position the stream was opened at.
5. A reconnect's hello made ops the room had admitted unsent again. An admitted op keeps its seq and is never resent under another id.

The three lossy properties, seeds 10,001 to 10,060: 0 of 60 each (load 38 to 47). At 600 seeds: 0 of 600 each (862 s, load 156 to 55); before mechanism 5, lost answers read 4 of 600. RT#2's ceilings of 16, 10 and 11 are gone; the properties require 0 at any seed count, and `TWO_TYPERS_LOSSY_FROM` moves the first seed so one red seed reads alone.

## HR-RC#3, a Backspace just before another person's word leaves the word

InlineText's `absorbedText` moved the end of the unflushed local change past a remote change that began exactly at that end. An end equal to the remote point now stays before it (`keepsEnd`, `shiftEnd`); an insertion at the point keeps its rule. `inline-text.test.ts` 70 of 70, the new case red with the old shift ("Realtime title tq" for "Realtime title tq tb1"). Proposed row: `realtime.backspace.keeps-other-word`.

## HR-RC#4, a change past the slide cap is refused at once

The batcher stopped at the first op that did not fit an ops POST and returned with the batch empty, so the op was never sent or refused and every op after it waited. `apply` now refuses a change whose mutations pass an ops POST or whose slide passes `CAPS.slideMaxBytes` by the admission's own measure (`room-core.ts` `slideBytes`), before anything changes: the author reads "This slide would pass 200 kB. Split the text into another slide." on the card that keeps the change's text. The batcher refuses an op no POST can carry and sends the ops after it. Proposed row: `sync.oversize-change.refused`.

## HR-RC#5a, #5b, #5d and #5c, a saved queue

- **#5a, the offsets.** A queue saves its position and tier. The page opens its stream from the oldest position of a saved queue of its tier (within `BASE_SEQ_WINDOW`), keeps the entries up to its own position as a backlog it never applies, and Apply moves each queue's ops past every entry since the queue's position by the rule the stream moves the tab's own pending ops (`bridgePast`, one function for both). An entry that names a queue op by id settles it. Proposed row: `sync.persisted.apply-after-remote-edit`.
- **#5b, past the window.** A queue the page cannot place (no position, another tier, past the window) comes back as text on the card with "This change was saved in this browser before newer edits. Copy its text to add it again."; nothing of it is applied.
- **#5d, the cap.** The store's trim drops landed entries first and never a pending one. A change that would take the saved queue past 1 MB is refused with "Unsaved changes are full. Reconnect to save them." and every queued op is kept.
- **#5c, the old queue.** The store keeps queues older than 24 hours. They are offered after the fresh ones as text: "Unsaved changes from Oct 7" with Discard and Copy Text, no Apply. Proposed row: `sync.persisted.old-queue-offered`.

## HR-RC#6, the offer waits for the held check

A failed held check was read as nothing held. `askHeld` asks again with waits from 2 s doubling to 30 s, and nothing is offered meanwhile. Each queue keeps its held ops, so Apply settles them by their entries in order and the ops written after them stay on them. Proposed row: `sync.persisted.no-double-apply`.

Not done as specified: "Apply re-sends with the persisted op ids". An ops POST carries op ids under its own client id (`protocol.ts` `opsPostSchema`), so the room would refuse the old ids, and the old client id's binding has lapsed. The same dedupe by op id happens on the client (the held check, then the entries since the queue's position). The window left: a POST of the closed tab that the room admits after the new page's held check and its catch up. Request 2.

## CRIT-M17, the room client on frozen documents

RT.md request 2. `frozen-base.test.ts` deep freezes the start document, each document the client hands to `onChange`, and each answer of `onResync`, with `deepFreeze` from `src/admission-decks.ts`, the helper RT#5a's parity test uses. It types over a remote entry, undoes, resyncs and applies a saved queue: 1 of 1, three runs (load 65). With an in-place write put in for the check, the local apply throws "Cannot assign to read only property 'text'" and an in-place remote write leaves the tab behind until the 5 s timeout.

## Pictures

Each was opened before it was cited. JPEG, at 1440 and 390 in both appearances, 19,953 to 116,638 B. All on 4860, memory tier, `TURBOSLIDE_LOCAL_OPEN=1`.

- HR-RC#4, `docs/hardening/RC/oversize-{1440,390}-{light,dark}.jpg`: the card over the editor with the sentence and the pasted text after a 225 kB splice into the title; the title row reads "Last edit just now".
- HR-RC#5b, `docs/hardening/RC/persisted-card-{1440,390}-{light,dark}.jpg`: a queue with no position, the plate "1 unsaved change from this browser", Apply, and the card with the sentence and "Second quarter results"; the title untouched.
- HR-RC#5d, `docs/hardening/RC/queue-full-{1440,390}-{light,dark}.jpg`: offline, six 170 kB lead splices queued and three refused: "3 changes were not applied" with the sentence and each change's text.
- HR-RC#5c, `docs/hardening/RC/old-queue-{1440,390}-{light,dark}.jpg`: a queue saved 30 hours earlier, the plate "Unsaved changes from Oct 10" with Discard and Copy Text. In the same browser Copy Text put the queue's words on the clipboard, Discard took the plate away, and a reload offered nothing.

## Checks at the end

At `48b2518c9` (HR-RC#5c), from 15:49: `packages/realtime` 266 of 266 (load 60 to 77, 15:49 to 15:52); the Worker 85 of 85 (load 68); `packages/viewer` 555 of 555 (load 71). `two-typers.test.ts` whole: 9 of 9 in 640 s (15:53 to 16:04, load 71 to 55), the undo property and the three lossy properties at 60 seeds included. At `d594eaaf1`: the room client tests (`packages/realtime/client`, frozen-base included) 100 of 100 (15:58, load 102 to 89), and `tsc -b` over the workspace: exit 0 (15:55, 22 s, load 58 to 63). Each commit's body has `tsc -b` read with that push in place (exit 0 for every push but HR-RC#4, whose one error sat in a test of HR-RC#5a that its commit does not carry) and prettier clean on its files. The competitor guard read 9 of 9 at HR-RC#10 and #5c. Brand lint in enforce mode, read at HR-RC#10, #1, #3 and #5c, found 0 open findings and exits 1 on the stale ImportSlides acceptance of `origin/main` (integrator.md request 2).

## Notes

- Words typed into a text in the 100 ms before a burst leaves the editable are in no queue, so a reload in that window loses them. A browser drive on 4860 (memory tier, load 141 to 163) typed a title word and reloaded 95 to 143 ms later, ten rounds: six words never left the page, and no word was doubled. In six earlier rounds at 110 to 200 ms, once the next page offered "1 unsaved change from this browser" and Apply left the word in the title once. This is InlineText's burst, not the saved queue. Request 3.
- A POST after a lost answer now carries every pending op before its new ones (HR-RC#9, mechanism 2), and each tier answers those from its log by op id. The size and time of such a POST were not measured on a hosted tier.
- In one picture run, before a reload, a new deck's title read "Quarterly review review" once. It did not happen again in later runs, and nothing in the lane's pushes writes a title.

## Requests

1. To HR-0: enter the lane's proposed rows, read on HR-0's local server: `realtime.viewer.edits-after-comment` (HR-RC#10), `realtime.undo.keeps-other-word` (#1), `collab.typing-survives-font-change` (#2), `realtime.backspace.keeps-other-word` (#3), `sync.oversize-change.refused` (#4), `sync.persisted.apply-after-remote-edit` (#5a), `sync.persisted.no-double-apply` (#6) and `sync.persisted.old-queue-offered` (#5c).
2. To RT: the room cannot dedupe a resend of a closed tab's queue by its saved op ids, because an ops POST's op ids must carry its own client id. A rule that admits a saved queue's ops under their old ids (a field naming the old client id, checked against the principal that bound it) would close the last window of HR-RC#6.
3. To the orchestrator: a later push for InlineText's pre-burst keystrokes (Notes, first item), for example a flush of the open burst on `pagehide`. `InlineText.tsx` is a DROPDOWNS file; DD-C#2 is on `origin/main`.
4. To the orchestrator, for the integrator: integrator.md request 2 (the stale brand lint acceptance) still stands; the lane's reads of the lint found 0 open findings.
