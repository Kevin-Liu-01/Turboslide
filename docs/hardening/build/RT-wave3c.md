# Lane RT, wave 3c: build notes

Running notes (a restart continues from here). Worktree `/Users/kevinliu/repos/Turboslide-harden5`, branch `harden/wave3c` from `origin/main` `8c9465b6`. Ports: studio 4858, Worker 8858. Scratch: `scratchpad/rt3c/`.

## State at the restart of 2026-10-15 17:30Z

The lane's first run (2026-10-12 21:50Z to 23:50Z) left work in the tree and no notes; the scratch folder was wiped by a reboot since. Found in the tree:

- HR-RT#10: `packages/realtime/src/room-core.ts` (deck cap), `deck-cap-fixture.ts`, `deck-cap.test.ts`, `apps/realtime-worker/test/deck-cap.test.ts`, `apps/studio/src/server/deck-cap.test.ts`.
- HR-RT#11: `apps/realtime-worker/src/deck-room.ts` (`DeadlineError`, `AppCallError.deadline`), `test/lib.ts` (`hangTimes`), `test/callbacks.test.ts`.
- HR-RT#15: `apps/studio/src/server/origins.ts` (`resyncReadSince`), `write.ts` (`bounded`), `resync-read.test.ts`. (`apps/studio/src/editor/resync-answer.test.ts` and `controller.tsx` are lane RC's HR-RC#7 and #8, not this lane's.)
- HR-RT#18: `scripts/hosting/worker-hash.mjs` and its test; `/health`'s `bundle` and the guard patch not yet.
- Not started: HR-RT#12, HR-RT#13, request 8 of RT.md (the comment route's 500), PS.md request 1 (`knownCovered`).

`origin/main` moved to `0ee4e86c` (19 GF commits, none in this lane's files). Waves 3a, 3b and K1#4b are on their branches, not on `origin/main`. K1#4b (`ad94e765`) edits `AppCallError.reach` beside HR-RT#11 (a seed 503 does not count); wave 3b's HR-O#6 edits the object's server write and `room.ts`'s `admitServerWrite`.

## Restart log (2026-10-15)

- 17:40Z. Reproductions run from untracked harnesses, removed before the lane returns: `packages/realtime/rt3c-main/` (origin/main's `room-core.ts`, imports pointed at `../src`) and `apps/realtime-worker/rt3c-main/` (origin/main's `src/`, a copy of `wrangler.jsonc`, a vitest config of its own; the tests use the tree's `test/lib.ts`). Neither is in a package's test include.
- RT#10 before (origin/main room-core): an insert of 100 kB into a deck 64 kB under 25 MB lands in `full`, `incremental` and `shadow`, the deck over the cap; 1 of 1, load 120 to 220. After: `packages/realtime` `deck-cap.test.ts` 7 of 7 (load 119 to 247), Worker `deck-cap.test.ts` 1 of 1 and studio `deck-cap.test.ts` 1 of 1 (load 266 to 548).
- RT#11 before (origin/main Worker): two flushes whose checkpoint hangs to the 25 s deadline write `rt_flags.callbacks` as `failing:`; 1 of 1, load 186 to 317. After: `test/callbacks.test.ts` 1 of 1 (two 200 ms deadlines leave the row unwritten and `/health` ok; two lost connections write `failing:<ms>:0`; the next answer writes `ok:`). The debug lines the first run left in the test were removed.
- RT#12 before (origin/main Worker): with every INSERT, UPDATE and DELETE of the object's SQL throwing the daily cap's error, three ops answer 500 and the callbacks row stays unwritten, `/health` `callbacks: ok`; 1 of 1, load 577.

## Restart of 2026-10-16 00:28Z

The second run (2026-10-15 17:30Z to about 23:10Z) built every wave 3c push of the lane but RT.md request 8 and PS.md request 1, took their readings (logs in `scratchpad/rt3c/`), and committed none: its `tsc -b` at 23:08Z stopped on lane O's `watch.ts` (`@turboslide/report/alert` not linked), no RT file among the errors. Readings found in the logs, all from the tree as it stands:

- RT#10: `packages/realtime` `deck-cap.test.ts` 7 of 7; the Worker `deck-cap.test.ts` 1 of 1; the studio `deck-cap.test.ts` 1 of 1.
- RT#11: `test/callbacks.test.ts` 1 of 1.
- RT#12 before: `rt3c-main/rt12.repro.test.ts` 1 of 1 (three ops 500, the row unwritten, `/health` ok), load 577. After: `test/storage-failure.test.ts` 2 of 2.
- RT#13 before: `rt3c-main/rt13.repro.test.ts` 1 of 1 (tables and alarm left after the sockets closed; no purge route). After: `test/purge.test.ts` 3 of 3, studio `purge-room.test.ts` 2 of 2, `do.test.ts` 7 of 7.
- RT#15: `resync-read.test.ts` and `write.test.ts` 11 of 11.
- RT#18: `worker-hash.test.mjs` 5 of 5; the hash of the production dry run twice, equal (`2921f108…`, 22 s); `wrangler types` regenerated `worker-configuration.d.ts`; the dry run binds `TURBOSLIDE_BUNDLE_HASH`.
- The Worker suite with every RT push in the tree: 97 of 98, 25 of 27 files; the red file and test are lane O's (`alert.test.ts` without its package link, `switches.test.ts` before O#4's control.ts rule). Load not recorded.
- `packages/realtime` whole: 174 of 175; the red is `blob.test.ts` "one head of the pulse per tick" (4 heads, at least 6 wanted), a count of timer ticks at a load of several hundred, in a file no RT push touches.

Plan of this run: prettier (`sql.ts`, `resync-read.test.ts` reformatted), one `tsc -b` over the lane's projects, then commit RT#10, #11, #12, #13, #15 and #18 in that order, each from a staged copy of the shared files that holds only that push's hunks (`git hash-object -w` and `git update-index --cacheinfo`, the working tree untouched), then build request 8 and PS request 1. The scratch `tsc.lock` dated 23:30Z had no `tsc -b` process alive at 00:30Z.

## Finish run of 2026-10-16 02:23Z

Kevin's order of 2026-10-16: build and commit, no test runs, servers or browsers; the only checks
are compile checks, generators and the formatter. The tree held every push above uncommitted.

- `prettier --check` over the lane's 30 files: clean.
- `tsc -b packages/realtime` 02:31Z to 02:40Z (load about 120): exit 0. `tsc -p apps/realtime-worker
--noEmit` 02:42Z to 02:49Z: exit 0. `tsc -p apps/studio --noEmit` 02:42Z to 02:54Z: one error,
  `write.ts` 677, in lane PS's uncommitted HR-PS#5 loader (`roomFacts`), no line of this lane.
- Lane O committed HR-O#3 and HR-O#4 at 02:5xZ, before RT#13 and RT#18, each with its own hunks of
  `index.ts`, `control.ts` and `test/health.test.ts`. The `/health` comment of RT#18 names `alerts`.
- `wrangler types --include-runtime=false --strict-vars=false` in this tree, which has no
  `.dev.vars`, drops the secret declarations; `worker-configuration.d.ts` keeps the earlier run's
  regeneration (`TURBOSLIDE_BUNDLE_HASH` added, nothing else).
- Each push was staged by hunk under `.git-lock-finish` (`room.ts` hunk 4 alone for RT#13; the
  `deck-room.ts` field hunk split between RT#11, #12 and #13). RT#15's `write.ts` is HEAD's file with
  this push's four changes; lane PS's HR-PS#5 rewrite of the loader stays in the tree on top of it.
- The reproduction harnesses `packages/realtime/rt3c-main/` and `apps/realtime-worker/rt3c-main/`
  are removed.
- Request 8 (the comment route's 500): `httpComment` catches a checkpoint that fails after the
  admission, arms the retry (`retryCheckpointLater`) and answers ok with `covered` below `seq`, so
  the function's `serverComment` does not send the comment again. Pinned by a case in
  `test/comments-landing.test.ts` (one failed checkpoint: 200, `covered` 0; the flush covers it,
  head 1). Not run in this pass. `httpWrite` has the same shape (an agent's write answers 500 when
  the checkpoint after its admission fails); its answer promises a record, so it is left for a
  decision, not changed here.
- PS.md request 1, for `knownCovered` alone: `DeckStore.newestRecords` (optional), which the Blob
  mirror answers from the records above its log floor when one carries `ops` and otherwise by
  reading the log down one `LOG_FLOOR_RECORDS` batch at a time; `knownCovered` reads it where the
  store has it, else `records()`. Pinned by a case in `packages/store/src/hosted.test.ts`, not run.
  `tsc -b packages/store` 03:08Z to 03:09Z exit 0; `tsc -p apps/studio --noEmit` 03:09Z to 03:17Z
  exit 0. The other three callers PS.md names (the room's open, the seed route, the loader's
  version list) are not changed.
- `tsc -p apps/realtime-worker --noEmit` after request 8: 03:04Z to 03:05Z, exit 0.

## Progress

- [x] HR-RT#10 `a401571ae`
- [x] HR-RT#11 `8e21a5f62`
- [x] HR-RT#12 `6c9a5469a`
- [x] HR-RT#13 `fe3b8f117`
- [x] HR-RT#15 `b800e7ee3`
- [x] HR-RT#18 `629ef3992` (the tree half; `guard-worker-hash.patch` waits on Kevin, question 5)
- [x] Request 8 (comment 500) `5253d7f1e`
- [x] PS request 1 (`knownCovered`) `e0bb198ab`

## Requests

1. To Kevin (question 5): apply `docs/hardening/build/guard-worker-hash.patch` to `gt-follow.sh`.
   HR-RT#18's tree half ships without it; `/health` answers an empty `bundle` until a deploy
   passes the hash.
2. To the integrator: the tests this run did not run, by Kevin's order: `packages/realtime`
   `deck-cap.test.ts` and `do.test.ts`; the Worker's `deck-cap`, `callbacks`, `storage-failure`,
   `purge`, `bundle`, `health` and `comments-landing` tests; the studio's `deck-cap`,
   `purge-room`, `resync-read` and `write` tests; `scripts/hosting/worker-hash.test.mjs`;
   `packages/store` `hosted.test.ts`. The earlier runs' readings of all but the last two cases
   (request 8, PS request 1) are above.
3. To the orchestrator: `httpWrite` (an agent's write through the object) answers 500 when the
   checkpoint after its admission fails, and an agent that retries writes twice. Its answer
   promises the record, so the fix needs a decision (answer the seq without a record, or wait on
   the retry); not in this wave.
4. To lane PS or the orchestrator: PS.md request 1's other three callers (the room's open
   `coveredSeq`, the seed route, the loader's version list) can read `newestRecords` too, each
   with its own reading of what the newest records must reach.
