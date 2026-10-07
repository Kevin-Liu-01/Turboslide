# Polish two, lane F: the face and the realtime row

Lane F of `docs/POLISH-2.md` (section 2 and 7.1), in `/Users/kevinliu/repos/Turboslide-polish2` on
`polish2/round`. Each push below names its items, its files, its checks with their readings and the
one minute load beside each timing, its pictures and its deviations. A timing read at a load over 24
is not a verdict; bytes, counts, widths and colours do not move with load.

## P2-F#1, day 0

Commit `5d939cf5`. Items 1 to 5 of `docs/POLISH-2.md` 6.1, in `scripts/probes/core-matrix.test.mjs`
alone: `POLISH2_NOTE`, `POLISH2_RETIRED` (empty) and `isPolish2Row`; the count term; the landing
term and the landing block's three filters exclude the round's rows; the realtime block's last five
local rows read `localRows().filter((row) => !isPolish2Row(row))`, and so does the ship test's
`run.local` (the same last-five read, which would also fail once lane A appends its local rows); a
block "polish two" that reads every round row's note, id, driver, feature, local state and place.

| Check                                                                                                           | Reading                                                                                                                                                         | Load       |
| --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `vitest run scripts/probes/core-matrix.test.mjs`                                                                | 40 of 40                                                                                                                                                        | 209        |
| The same file on a scratch copy of the matrix with the 27 rows of 6.2 to 6.5 and the eleven restated notes of 6.6 | 40 of 40; the file before the push fails 4 tests on that copy (the product round's count, the realtime block's two last-five reads, the landing order)         | 209        |
| `core-matrix.test.mjs`, `what-works.test.mjs`, `docs-index.test.mjs`; `what-works.mjs --check`                  | 52 of 52; README.md is current                                                                                                                                  | 162 to 196 |
| `tsc -b`                                                                                                        | 29 min 41 s; two TS6307 errors for files other lanes created during the run (`e2e/core/auth-plate.ts`, `e2e/core/home/header.ts`), none for this push          | 162 to 196 |
| The brand lint, enforce                                                                                         | one open finding, `css/no-eyebrow` in lane A's uncommitted `packages/chrome/src/auth/auth.css`; the competitor guard passed                                    | 189        |
| The whole vitest suite (`vitest run --dir packages/lint` did not narrow the root's projects, so it ran `pnpm test`'s set) | not a verdict: jsdom tests of `packages/chrome` and `apps/studio` timed out at 5 to 9 s each; the run was stopped. Every later unit run names its files by path | 180 to 214 |

No node-server build: the push changes one test file that no build reads.

## P2-F#2, the object id in the two realtime rows

Items of `docs/POLISH-2.md` 2.6. `apps/studio/e2e/core/realtime.spec.ts`: `roomOf(page)` reads the
tab's room frame (`describe().state.sync.room`, polled until the frame arrived); on the do tier
`realtime.join.chip-within-1s` reads A's object and B's in each of the three rounds, asserts each
matches `/^[0-9a-f]{8}$/` and that B's equals A's, and `setup.do.two-instances` asserts the same of
`hello.a.object` and `hello.b.object`. The colos (`sync.status` and the room frames) are in the
`measure` annotation and in no assertion; the header comment says why. The tier of the join row is
read from the page (`sync.tier`), since `sync.status` answers no tier without a bearer. No Worker,
client or contract change. `docs/gslides-parity/focus/core-matrix.json`: the two rows take the
interactions of 6.6 and their notes gain "; restated in polish two, P2-F#2".

The rows ran on the do tier with two origins, as `docs/CLOUDFLARE.md` 5.4 item 2 describes:
`wrangler dev` of `apps/realtime-worker` on 8741 (local D1 and object state under the scratch folder,
the control migrations applied with `--local`, test secrets passed as `--var`), and two vite dev
servers of this tree on 4741 and 4731 (`-c vite.no-watch.config.ts`, one tmp overlay
`.turboslide/f-overlay`, `TURBOSLIDE_REALTIME=do`, `TURBOSLIDE_ROOM_HOST=127.0.0.1:8741`,
`TURBOSLIDE_ROOM_INSECURE=1`), with `core-gate.mjs --only specs --rows
realtime.join.chip-within-1s,setup.do.two-instances --tier do --second-base http://127.0.0.1:4731`.

| Run                                     | `realtime.join.chip-within-1s`                                                                                                                                                                                                                                                                                                                                   | `setup.do.two-instances`                                                                                                                                                                                                                                                                       | Load                     |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| 1, cold servers (`.turboslide/f-gate-f2`) | failed in setup: A's editor was not up within `waitEditor`'s 90 s                                                                                                                                                                                                                                                                                                | failed: the 300 s test budget ran out before any reading                                                                                                                                                                                                                                       | 150 to 330               |
| 2, both editors warmed first (`f-gate-f2b`) | every clause read green: B's chip in A 257, 200 and 177 ms and A's in B 257, 199 and 176 ms after B's editor was ready; instances `938d453f` and `51963ee7`; tier do; the object in A's room frame `1322759e` and in B's `1322759e` in all three rounds; colos recorded, not compared: SJC on every read. Recorded failed: the 300 s budget ran out in the `finally` teardown (File > Move to trash, Delete forever, the 404) and the `afterEach` | every clause read green: instances `938d453f` and `51963ee7`; the object `3ad89944` in both room frames; every word in both 1,133 ms after the later last keystroke; revisions 14 and 14 at the live 14; `sync.seq` 33 and 33, `sync.covered` 33 and 33; colos SJC recorded. Recorded failed for the same teardown timeout | 138 to 229 over 1,070 s |

A timing at a load over 24 is not a verdict, so neither run is one. The object clause, the change of
this push, is not a timing: run 2 read one object id across both origins in every round of the join
row and in the setup row, and no assertion read a colo. On the local memory tier with one origin the
code drives the join row's chip clause and records "no object on this tier", and skips
`setup.do.two-instances` with its one origin reason; that reading is in P2-F#4's section.

Other checks: `tsc -b` exit 0 in 14 min 18 s (load 145 to 500, the tree with this push and P2-F#3's
files); `prettier --check` clean; `vitest run scripts/probes/core-matrix.test.mjs` and the README
check inside the commit's lock (below). No surface changed, so no picture.
