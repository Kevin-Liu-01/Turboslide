# Lane RT, the realtime write path and the document core: wave 2 build notes

The lane's wave 2 pushes of `docs/hardening/HARDENING.md` (4.6, 5, 6.2): HR-RT#1, #2, #3, #4, #5a, #6a, #6b, #6c, #7, #8, #9 and #14, with HR-RT#5b coded and held for the preview's shadow week. They close RELIABILITY-1, RELIABILITY-2 (F1), RELIABILITY-6 (server), RELIABILITY-8 to 11, RUST-1 (behind the flag), RUST-2 (server) and CRIT-M17's admission half. Rust phase 0 is all TypeScript: no backend port this round (1.3 item 6, Kevin's answer). Every pin is a unit, route, Worker or store test (4.0: a fault between the Worker and the function is a test, and no push enters a matrix row before HR-0, which is not on `origin/main`); ports 4858 and 8858 served the lane's local do rig for the realtime rows (below), stopped before the lane returned.

The lane worked in `/Users/kevinliu/repos/Turboslide-harden` on `harden/wave2` beside the RC, O and PS lanes. Each push was built and read in the tree, its files were copied into the lane's scratch folder once its tests passed, and each commit was made under the git lock from those copies (`git hash-object` and `git update-index`), so a commit holds that push and nothing of a later push or of another lane's uncommitted work in the same file. The copies were checked against `HEAD` before each commit: they replace no line another lane committed.

## The commits

| Push     | Commit                                   | Closes                              | Ships                                                                    |
| -------- | ---------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------ |
| HR-RT#1  | `2b72f85c7`                              | RELIABILITY-1, fixes 1 to 3         | now                                                                      |
| HR-RT#2  | `f9c0af448`                              | RELIABILITY-2, F1                   | now                                                                      |
| HR-RT#3  | `175520448`                              | RUST-2, server half                 | now                                                                      |
| HR-RT#4  | `cc31d2512`                              | RELIABILITY-1, fix 5                | now                                                                      |
| HR-RT#5a | `c1cb1a288`                              | RUST-1 behind the flag, CRIT-M17    | now (section 5 has it after HR-RC#9, which is not in the log; request 4) |
| HR-RT#6a | `305e555b7`                              | RELIABILITY-8, the open list        | now                                                                      |
| HR-RT#6b | `85e655e29`                              | RELIABILITY-8, the alarm            | now                                                                      |
| HR-RT#6c | `395457be7`                              | RELIABILITY-8, the sweep            | now                                                                      |
| HR-RT#7  | `7afca5766`                              | RELIABILITY-10                      | now                                                                      |
| HR-RT#8  | `8554e795f`                              | RELIABILITY-9                       | now                                                                      |
| HR-RT#9  | `543bc8b44`                              | RELIABILITY-11                      | now                                                                      |
| HR-RT#14 | `fb507f8b5`                              | RELIABILITY-6, server half          | now                                                                      |
| HR-RT#5b | none: `docs/hardening/build/RT-5b.patch` | RUST-1 production default, CRIT-W10 | after seven days of zero disagreements on the preview                    |

Each commit's body names its files, its pins and their readings with the load.

## HR-RT#1, a lost checkpoint answer commits its words once

The route had no defence against a retry of a checkpoint it had committed: the retry's revision was stale, the route answered 409, and the object's `readmit` read its own records as foreign, moved its tail past itself and posted it again. Every word of that checkpoint was in the store twice.

- Fix 1, the route (`apps/studio/src/server/checkpoint.ts` `planCheckpoint`). A store at the object's revision commits every entry. A store that moved is read once: when every record above the object's revision names only entries of this post in its origin, those records are the post's own first attempt, and their entries are answered from the log. The rest are committed after them, matched entry by entry by client and op id (`originKey`, now in `@turboslide/realtime/coalesce` and shared with the object), so a retry whose run grew since the first attempt commits only the new entries. Any other record above the revision is still a 409. The spec's sketch ("`commitWrite` takes the object's revision as `baseRevision`") would have met the store's stale base check for every run the first attempt did not commit, and the store's own origin check answers a whole run when any one of its op ids matches, which drops the entries a grown run added. The route's work moved into `answerCheckpoint`, so a test drives it over a Blob store.
- Fix 2, the object (`apps/realtime-worker/src/deck-room.ts` `readmit`). A record above the object's revision whose origin names entries of the tail is the object's own: those entries stay below the new `covered`, are not posted again, and their records are not among what the rest is moved past. This is the path when a foreign write landed after the lost checkpoint, or when the route is older than fix 1.
- Fix 3. `commitRuns` starts a run only while `request.signal` stands; a call that is gone answers 503 and its retry is answered from the log.

The tmp store writes no `origin` on its records (`file-store.ts`), so fix 1 and fix 2 act on the Blob store, which every hosted deployment uses; the local tmp tier keeps the old behaviour. `packages/store` is the PS lane's.

Readings: `apps/realtime-worker/test/lost-answer.test.ts` 3 of 3 at load 103 (10:44); with fix 2 taken out 2 of 3 fail (revision 2 and the word twice; the foreign case posts both entries again). `apps/studio/src/server/checkpoint-route.test.ts` 5 of 5 at load 100 (10:47); with the old rule (409 whenever the revision differs) 3 of 5 fail.

## HR-RT#2, a resent POST keeps its author's letters in order (F1)

`packages/realtime/src/room-core.ts` `landedPastAnswered`: when an entry is answered from the log, its rows leave the landed set and the rows that landed before it are moved past the entry as its client wrote it (`landedPast`); `Landed` rows carry the seq they came from. The memory and redis tiers (`admitOps`), the blob tier (`admitOnBlob`, where one record can answer several entries of one POST) and the object's `admit` call it.

The verifier's harness was gone with its scratch folder, so the three lossy properties were written again into `apps/studio/src/editor/two-typers.test.ts`: the row's words on the cover, two people, three rounds, seeds 10,001 to 10,060. A lost answer throws after the room admitted the POST and before the stream brought the entry; in the ordered worlds a delivered answer waits behind the stream's events, and a stream drop loses what the stream carried, the answers with it, and the room client reopens on its own wait. The client's resend backoff, reopen wait, gap watch and hello hold run in these worlds; the presence heartbeat does not.

| Property, 60 orders                                 | Without F1's fix | With it (the ceiling) |
| --------------------------------------------------- | ---------------: | --------------------: |
| A quarter of POST answers lost after admission      |               34 |                    16 |
| The same, the answers ordered behind the stream     |               32 |                    10 |
| Stream drops, the answers ordered behind the stream |               28 |                    11 |

Read twice with the same counts at load 141 to 190 (11:26 to 11:32). The reds that remain are the residual R of `word-fix.md` (in seed 10004 here, "ua2" lost; in 10001, "ub2" cut to "ub"), HR-RC#9's to take to 0. The two expectations of `blob-admission.test.ts` that pinned F1 now read the fixed placement. The whole two typers file, 2,000 earlier orders included: 8 of 8 in 14 min at load 80 to 190.

## HR-RT#3, one rule for a whole Text rewrite

`packages/schema/src/transform.ts` `rewritesText` is the one rule, by question 12's default: the admission's rule for `slide.set` (a field's whole value rewrites that field alone; the notes, the layout and a field's face rewrite nothing) and for `slide.replace` (a block that survives keeps its typing), the schema's prefix rule for `block.set`. The switch names every op and ends in a `never` check that throws. `room-core.ts` imports it; the comment anchors keep their own rule as `anchorRewritten`. The table test (`packages/realtime/src/rewrite-rule.test.ts`, 31 of 31) is typed by op, so a new mutation is a type error until its row is written; HR-RC#2 has since extended it to the browser's rebase.

## HR-RT#4, a checkpoint call commits for 15 s at most

The object asks for the bound with `x-turboslide-checkpoint-bounded` and the route starts runs for at most `CHECKPOINT_BUDGET_MS` (15,000), answering `toSeq`, the last seq it handled. A header and not a body field: `checkpointBodySchema` is strict, so a body field would be a 400 from a route one release older, and the guard deploys the Worker before the app. The object covers up to `toSeq`, keeps the oldest uncommitted time, and arms its alarm 50 ms out; a flush and the last close call until the tail is covered (`checkpointTail`, at most 8 calls).

Reading (`checkpoint-route.test.ts`, every Blob call delayed 160 ms, 40 runs of two alternating authors): the first call answered `toSeq` 19 after 16,488 ms with its longest run 711 ms, and the next calls committed the other 21 runs once, every word once. Load 77 to 99 (11:52), so the time is a record; the pin is the bound of the budget plus the last run and the count of records.

## HR-RT#5a, the incremental admission behind `TURBOSLIDE_ADMISSION`

- `applyMutationsTouched` (`reduce.ts`): for a list of slide level ops, the manifest and the slide map copied shallowly and the named slides cloned; anything else falls back to the deep `applyMutations`, which every other caller keeps.
- `validateTouched` (`validate.ts`): the touched slides through `validateSlide`, an opener's place, the slide's references into the manifest (`slideReferenceIssues`, which `validateDeck` now calls too), and the manifest when the title rule moved it.
- `landCandidate(…, { mode, onDisagree })` in `room-core.ts`; `full`, `incremental` and `shadow` (full decides, incremental beside it).
- The object reads `TURBOSLIDE_ADMISSION` (production `full`, preview `shadow` in `wrangler.jsonc`); a disagreement is a line at error with the deck and the op kinds and one more in D1 `rt_flags` `admission.disagree`, which `/health` answers as `admission: { mode, disagree }`. The function's rooms read the same variable from their environment, `full` when unset; a disagreement is a line at error there.
- The Worker suite runs in `shadow` (`vitest.config.ts`): every typed entry of every Worker test is placed both ways.

| Reading                                                                                    | Value                                                                                                           | Load (local time)          |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `admission.incremental-parity`, GT, the default 150 sequences of 4 entries                 | 600 entries, 244 refused on purpose, 0 differences                                                              | 58 to 182 (12:04 to 12:11) |
| The same on the 850 slide copy, the default 15                                             | 60 entries, 28 refused, 0 differences                                                                           | same                       |
| The push's reading, 2,000 sequences on GT and 100 on the copy                              | GT: 8,000 entries, 3,121 refused, 0 differences (1,215 s); x10: 400 entries, 161 refused, 0 differences (753 s) | 49 to 190 (12:58 to 13:27) |
| `cost.admission.cpu-per-entry`, incremental, smallest of three rounds of 200 typed entries | 0.631 ms GT, 0.754 ms x10 (budget 1 ms)                                                                         | 58 (12:11)                 |
| The same, `full`, beside it                                                                | 26.80 ms GT, 192.80 ms x10                                                                                      | 58                         |
| The Worker suite in `shadow`                                                               | 85 of 85, 0 `admission.disagree` lines                                                                          | 52 to 61 (13:05 to 13:07)  |

The 2,000 sequence reading on the 850 slide copy was cut to 100: one entry there costs about 1.6 s of full validation and comparison at this machine's load, so 8,000 entries would take hours. The incremental CPU is above the prototype's 0.051 ms: `validateSlide` of the content slide (0.23 ms) and the reducer's splice with its Text parse (0.17 ms) are most of it, which HR-RT#16's Text memo (wave 3) is for.

## HR-RT#6a, #6b and #6c, a tail always has a committer

- 6a: `releaseClosed` lets a deck go (doc rows, alarm, `rt_open`) only with nothing uncommitted. A close that leaves a tail marks `closePending`, and the checkpoint that later covers it with no socket open lets the deck go then. A socketless object an agent writes to keeps its doc rows, as before.
- 6b: the alarm never throws for a failed checkpoint; it logs at error with the deck and arms itself at `checkpointBackoffMs` (2 s doubling, ten minutes at most). A failed close does the same.
- 6c: a cron every five minutes (`triggers.crons`, production and preview) runs `sweepOpenDecks`, which pokes each object `rt_open` names (eight at a time, at most 500); the object checkpoints a tail older than two minutes at once. `GET /control/open` answers each open deck's `head`, `covered`, `ageMs` and `sockets` from its object. The sweep and the open list live in `control.ts`, not in the entry module: on `wrangler dev` the Workers runtime refused to start with them exported from `index.ts` ("Incorrect type for map entry 'SWEEP_DECKS_MAX': the provided value is not of type 'function or ExportedHandler'"), which the vitest plugin does not check and which would have failed the production Worker's deploy. `index.ts` now carries a comment saying so.

## HR-RT#7, a 404 keeps the tail unless the deck is gone for good

The route answers 404 `gone` only for a deck the store does not hold (`checkpointErrorReply`: a `DeckGoneError`, or any error once `hasStoredDeck` says the deck is gone) and 500 for every other error, 500 too when the store cannot say. The check runs on the error path alone, so the normal checkpoint makes no extra store call; the route does not throw `DeckGoneError` itself. The object lets a tail go only when the checkpoint route says `gone` and the seed route answers 404 too, both for at least a minute (`DECK_GONE_CONFIRM_MS`, an addition to the spec: a deck made seconds ago can read as missing on an instance that has not seen it, RELIABILITY-18). The tail then moves to the object's `dead_letters` table, kept 30 days, readable under the bearer at `GET /rooms/:id/dead-letters`.

## HR-RT#8, a comment is covered once the sidecar took it

A sidecar write that throws answers 503 and the object keeps the entries; the edits of the call are answered from the log on the retry. The applier's own idempotence (a redelivered add or reply is a no-op, `comments-store.ts`) keeps a retry from being refused, which is why the build does not set the applier's `strict` (strict throws on any refusal, and a retry loop would follow). A comment the reducer refused is named in `refusedComments`, and the object keeps it as a dead letter and logs it at error.

## HR-RT#9, a refused run goes back to its author

The route answers a run the store refused 409 `{ refused: true, skipped }` to an object that names its protocol, and the 200 it answered before to an older object. The object sends each refused entry's author a `reject` with the text and "This change was not saved: the store refused it. Make it again.", removes the entry from the log, keeps it as a dead letter, reads its document from the store again and tells every tab to `resync`. The object names `ROOM_PROTOCOL` and `CURRENT_SCHEMA_VERSION` in `x-turboslide-protocol` and `x-turboslide-schema-version` (headers for HR-RT#4's reason; the constants sit in `frames.ts` beside the bounded header, so `protocol.ts` was not changed), and a route of an older build answers 503 `upgrade_pending`, which the object waits on through its backoff.

## HR-RT#14, the recovered writes check asks the object

`POST /rooms/:id/held` answers which op ids the object's log holds (through `findEntry`, the unique index); the do channel's `held` throws when the object does not answer; `heldOf` in `write.ts` adds the object's answer to the records' on the do tier and throws on a failed read where it answered none held. The client half (offer nothing until the check answers, Apply with the persisted op ids) is HR-RC#6.

## HR-RT#5b, held

`docs/hardening/build/RT-5b.patch` changes production's `TURBOSLIDE_ADMISSION` to `incremental` in `apps/realtime-worker/wrangler.jsonc`, `full` the switch back. It applies on top of HR-RT#6c. It waits for seven days of `shadow` on the preview reading 0 on `/health`'s `admission.disagree`, counted from the day HR-RT#5a reaches the preview Worker, and for the bench test of HR-RT#5a green on that day. The function's rooms read the variable from the Vercel environment, which nobody set, so they stay `full`; on production the do tier's object is the admission that matters.

## The local do rig

The Worker under `wrangler dev` on 8858 (local D1 with the migrations, the object in `shadow`) and the studio's dev server on 4858 with `TURBOSLIDE_REALTIME=do`, one process for both browsers, the tmp store, `TURBOSLIDE_LOCAL_OPEN=1`, `TURBOSLIDE_AUTH_RATE_LIMIT=off`, the fake Google client and test secrets minted for the run into 600 files, never printed. The tmp store writes no record origin, so this run reads the new route headers, the bounded call, the open list and the release on close, and not HR-RT#1's answer from the log, which the Blob store tests read.

`node scripts/probes/core-gate.mjs --base http://localhost:4858 --only realtime --tier do --room-host 127.0.0.1:8858`, 13:18 to 13:41, load 126 at the start and 62 at the end: 16 rows, 10 passed and 6 failed, retries zero. Passed: `realtime.title.two-typers`, `reload.loses-nothing`, `reconnect.loses-nothing`, `caret.offset-after-merge`, `selection.outline-within-300ms`, `agent.write-announced`, `share-link.every-instance`, `follow.for-everyone`, `caret.dims-and-leaves`, `card.chip-painted`. The six reds are all time bounds read at loads over 24, so records and not verdicts, the same rows `word-fix.md` read red on the do pair at load 95 to 125: `keystroke.within-300ms` (362 to 587 ms), `caret.within-300ms` (311 and 406 ms), `block.drag-live` (a jump later than 300 ms), `join.chip-within-1s`, `pointer.second-browser` (300 ms) and `departed-guest.name-stable` (reloads at 4,064 and 5,071 ms against 3 s). After the run `/health` read `admission: { mode: 'shadow', disagree: 0 }` and `/control/open` listed no deck: every typed entry of the run was placed both ways with no disagreement, and every closed deck let go.

## Checks at the end

`tsc -b` over the workspace with every push in the tree: exit 0, 10 min 30 s at load 50 to 150 (12:46 to 12:57), and again after the last change, exit 0 at load 102 (13:42). The Worker suite: 85 of 85 at load 102 to 160 (13:42 to 13:45). Brand lint in enforce mode: 0 open findings, exit 1 on one stale acceptance in `packages/chrome/src/dialogs/ImportSlides.tsx`, a file no RT push touches (PS.md reads the same). The competitor guard, `core-matrix.test.mjs`, `what-works.test.mjs` and `docs-index.test.mjs`: 62 of 62; `what-works.mjs --check` current. The studio tests beside the changes (checkpoint route, held, resend, blob admission, checkpointer, write, comments, room): 80 of 80 at load 47 (12:56). `packages/realtime`: 251 of 251 at load 73 to 170. Prettier over every file of the lane: clean (the four test files committed unformatted in HR-RT#1, #2 and #4 are formatted in HR-RT#5a's commit; `checkpoint.ts`, `checkpoint-route.test.ts` and `test/lib.ts` in HR-RT#7's).

## Requests

1. To the RC lane (HR-RC#9): the three lossy properties' ceilings of `two-typers.test.ts` are 16, 10 and 11 of 60; RC#9 takes each to 0. The reds are listed by seed with `TWO_TYPERS_LOSSY_SEEDS` unset, the first three of each printed by the test.
2. To the RC lane: CRIT-M17's second half, the room client tests with deep frozen base documents, is in `packages/realtime/client/**`, the RC lane's files this wave. `admission-decks.ts` exports `deepFreeze`.
3. To HR-0: the row `sync.resend.keeps-own-order` (RT#2) enters with HR-0, read on its local server; the lost answer is dropped with `page.route` (4.0).
4. To the orchestrator: section 5 has HR-RT#5a (#34) wait on HR-RC#9 (#32). RC#9 was not in the log at 14:00 after the lane waited for it, so RT#5a and the lane's later pushes were committed in the lane's order ahead of it: RT#5a is inert on production (`full`), the preview runs `shadow`, and the RC lane's working files for RC#9 (the room client, `two-typers.test.ts`) are disjoint from RT#5a's. RC#9 ships after HR-RT#14 in branch order unless the ship step decides otherwise.
5. To the orchestrator: HR-RT#5b is the patch above, for the ship step after the shadow week. Setting `TURBOSLIDE_ADMISSION` on Vercel for the function's tiers is a Vercel setting, not done.
6. To the orchestrator and lane PS: PS.md request 1 (a read of the newest records for the checkpoint's `knownCovered`) touches `checkpoint.ts`; it is not in wave 2 and was not done.
7. To the orchestrator: HR-RT#6c's `triggers.crons` is set on the Worker by its deploy (the guard's `wrangler deploy` for production and the preview), with no dashboard step; it is one of the account's cron triggers (Workers Free allows five). The guard can read the sweep through `GET /control/open` (`ageMs` per open deck) on each push.
8. A finding outside this round's pushes: the object's `/rooms/:id/comment` route answers 500 when the checkpoint after the admission fails, although the comment is in the log and lands on the retry. The function's comment write (`packages/realtime/src/do.ts` `serverComment`) reads the 500 as a failure, and a comment sent again adds a second thread. Severity 2; for a later push.
