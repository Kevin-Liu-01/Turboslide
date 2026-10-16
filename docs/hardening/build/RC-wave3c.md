# Lane RC, wave 3c: build notes

Worktree `/Users/kevinliu/repos/Turboslide-harden5`, branch `harden/wave3c`. The lane's wave 3c pushes are HR-RC#7 (RELIABILITY-17, client half) and HR-RC#8 (RELIABILITY-18). An earlier run built both in the tree and committed neither; this run split them by push and committed them on 2026-10-15 (PDT).

## The commits

| Push    | Commit      | Closes                  | Waits on (section 5)                        | Ships          |
| ------- | ----------- | ----------------------- | ------------------------------------------- | -------------- |
| HR-RC#7 | `cdd2050be` | RELIABILITY-17 (client) | HR-RT#15 (push 66), not yet committed by RT | after HR-RT#15 |
| HR-RC#8 | `9001495cb` | RELIABILITY-18          | HR-RC#7                                     | after HR-RC#7  |

HR-RC#7 compiles without HR-RT#15: `resyncAnswerOf` in `controller.tsx` takes `bounded?: unknown` beside `EditorDeck`'s `origins` and `room`. On the do tier the read's `bounded` comes from HR-RT#15's loader, so the integrator puts HR-RC#7 after it.

## What each push changes

- HR-RC#7. `room-client.ts`: a 409 `resync` on a tier whose seq is not the revision, with the head within `REPLAY_MAX_ENTRIES`, catches up through the stream (it waits for a replay in progress, or reopens from the position and holds for the hello) instead of reloading. `ResyncAnswer.position` (the loader's `room.seq` and `room.tier`) becomes the tab's position on the same tier. A document at another position than the tab's counts as bounded. Past the bound, typed text, posted or not, returns to its author as a card; an admitted op stays; a change without text never posted stays and re-folds. `controller.tsx`: `resyncAnswerOf` reads origins, `bounded` and the position off the parsed payload. Tests: `client/do-resync.test.ts` (new), `room-client.test.ts` (the bounded case), `apps/studio/src/editor/resync-answer.test.ts` (new).
- HR-RC#8. `room-client.ts`: `NOT_FOUND_RETRY_MAX` (5 retries, about 15 s) becomes `NOT_FOUND_RETRY_MS` (60 s of 404s in a row on the backoff ladder); past it the option `hasStoredDeck` is asked, and the ops return only when it answers false. `controller.tsx`: `hasStoredDeck` reads the editor loader, which heads the store first (`write.ts` calls `hasStoredDeck`). Test: `not-found-retry.test.ts` on a test clock (404 for 25 s then 200 returns nothing to the author).

## Checks in this run

The workflow allowed compile checks only; no test ran in this run.

- `tsc -p packages/realtime` with both pushes: exit 0.
- `tsc -p apps/studio` with both pushes (and the other lanes' uncommitted files in the tree): exit 0.
- HR-RC#7 alone: the client folder copied with HR-RC#7's `room-client.ts` and `origin/main`'s `not-found-retry.test.ts`, type checked against `packages/realtime/src`: exit 0. The same copy with HR-RC#8's test reported the two expected errors, so the check reads the files.
- Prettier: clean on the six files.

## Left for the integrator

- The room client tests (`packages/realtime/client`, `do-resync.test.ts` and `not-found-retry.test.ts` above all) and `apps/studio` `resync-answer.test.ts` at each push head.
- The earlier run's repro harnesses (`packages/realtime/rc3c-main`, `rc3c-7`, `rc3c-pre`, untracked) were moved out of the tree.
