# The two typers word fix

Hotfix of 2026-10-07 on `hotfix/two-typers-word`, cut from `origin/main` at `19bd3de7`, in the worktree `Turboslide-wordfix`. The row is `realtime.title.two-typers` (`apps/studio/e2e/core/realtime.spec.ts`): A and B type a word each into one title within 200 ms, then a second word each, three rounds, and every word must be in both browsers once. Production's build `6973fa9f` lost a word in 1 of 5 readings on the do tier, `19bd3de7` in 2 of 7, and previews of the blob tier in 5 of 7 and 6 of 8. Every lost word was one of a pair typed together.

Nothing was pushed or deployed and no setting was changed. The servers were local: wrangler dev on 8781 and the node servers on 4781 to 4783, all stopped before the note was written.

## What loses a word

There were four mechanisms. Each was read in a simulation that replays a title edit from the keystroke to both tabs through the room's own admission, and each has a test that fails without its fix. The simulation is `apps/studio/src/editor/two-typers.test.ts`. It runs the InlineText session rules, the controller's commit and conversion, real room clients and room.ts `admitOps` on the memory tier, and a scheduler that interleaves keystrokes, bursts, Escapes, the cover's measure, posts and deliveries.

1. **The admission read a POST's later entries in the wrong frame (server; every tier).** A tab sends its pending bursts as the entries of one POST, and under load one POST often carries two bursts of one word (" t", then "a1"). The admission moved every entry past what had landed since the POST's base, as the other writers wrote it. The second entry was written after the first, so its offsets count the first entry's letters. With B's " tb1" landed at A's point, A's " t" keeps the left by the run rule, and "a1" at offset +2 was compared with B's insert at +0 and pushed past it. Both browsers then read " t tb1a1". This is request R2-F3a of the realtime round, which was never landed. The fake room had the fix, so the existing simulation passed while production lost words. Fix: `landedPast` in `packages/realtime/src/room-core.ts` moves the landed rows past each entry before the next entry is transformed: each row meets the entry as it stands after the rows before it, and takes the other side of the entry's tie. It is called in room.ts `admitOps` and its retry, `admitOnBlob`, and the Durable Object's `admit` and `readmit` (`apps/realtime-worker/src/deck-room.ts`).
2. **The Escape's last letters waited for the cover's measure (client, controller).** When the title has wrapped, the Escape writes the shrunk size. That write converts the cover to a canvas after an async measure (controller.tsx `convertThenCommit`), and it carried the letters typed since the last burst. If another person's write landed during the measure, the letters went out at offsets the title no longer had (" t2a2 ua" for " ta2 ua2"). If that write had converted the cover first, the letters were a field run on a canvas, the write was refused, and the letters were lost (" ua2" read " ua"). Fix: `fieldRunsFirst` in `apps/studio/src/editor/convert-first.ts`. The controller's `commit` now writes the typed letters at once, on the cover as it stands, and the conversion carries the size alone after its measure. Marks are not split and still ride the conversion.
3. **A pending field run was not moved past a word on the canvas block (client, room client).** After another person's conversion, their words are block runs (`/text`), while this tab's pending letters may still be field runs (`/heading`). The room client's bridge read a remote field run onto the canvas but never the op's own field run. The op kept its offset in front of the remote word and was then posted on the newer base, where the room placed it inside the word (" ua1b2 tb2 u"). Fix: `applyEntry` in `packages/realtime/client/room-client.ts` reads both sides on the canvas, with the canvas taken from the whole entry and the document.
4. **The run end stayed on the field after a conversion (client, room client).** The run rule (channel.ts `runTieSide`) needs the tab to know where its own last insert ended. That point was keyed by the field's address, so after a conversion the tab's next letter on the block declared nothing. It tied after a third person's word at its point and left the word it continued (" ta2 ua tc2 uc22" for " ua2"). Fix: `advanceRunEnds` moves a field's run end to the block the canvas made of it, at the same offset, whether the conversion is the tab's own or another person's.

The string diffs the realtime round's notes suspected (`textBurstMutation`, `absorbedText`) did not lose a word in any order the simulation produced once the four fixes above were in. Their ambiguity at a shared first character and last digit is already resolved by the session's caret (`caretPlaced`) and by the splices the room client hands the absorb, both landed in the realtime round's fix round 3. The three-person runs start some typists at word edges in the middle of the title, so the simulation exercises those paths too.

## Compatibility

The protocol did not change. Mechanism 1 is on the server, so a tab of the old build gets the correct placement as soon as the server deploys. Mechanisms 2 to 4 are in the tab, and an old tab keeps them until it reloads. An old tab stays consistent with the room either way, because every copy applies the entries the room answers, and needs no resync.

## The files

- `packages/realtime/src/room-core.ts`: `landedPast`, plus `movedPast` shared with `transformEntry` (a pure refactor of its loop body).
- `apps/studio/src/server/room.ts`: `admitOps`, its `appendWithRetry` callback and `admitOnBlob`'s `place` call `landedPast`; the function is re-exported.
- `apps/realtime-worker/src/deck-room.ts`: `admit` and `readmit` call `landedPast`, and `readmit` moves the later entries past the undo of a refused one, as `admit` does.
- `packages/realtime/client/room-client.ts`: `advanceRunEnds` carries a field's run end across a conversion; `applyEntry` reads the op and the entry on the canvas.
- `apps/studio/src/editor/convert-first.ts` and `controller.tsx`: `fieldRunsFirst` and the split commit.
- `packages/realtime/client/fake-transport.ts`: the fake room's admission uses room-core's `transformEntry` and `landedPast`, which replace its own copies, and takes an `admit` option so a test can run a real admission over its channel.

## The tests

Each test below was read red without its fix and green with it.

- `apps/studio/src/editor/two-typers.test.ts`:
  - Two scripted reproductions over the real `admitOps`. The first is one POST of two entries after the other person's word landed at its point; it read "Realtime title tb1 ta1 t tb2a2" before. The second is another person's conversion landing during the cover's measure; it read A's write refused and " ta2" lost before.
  - Three seeded property runs, 2,000 interleavings by default: 400 orders on a body text, 800 of the row on the cover (two people, three rounds, the title converted at its wrap), and 800 of three people at the same and nearby points of the cover. `TWO_TYPERS_SEEDS=<n>` widens each run.
  - The tree before the fix, run through this harness at 200 seeds per run, read 10 of 200 body orders, 23 of 200 cover orders and 45 of 200 three-person orders red.
  - The fixes in the order they were found: with the admission fix alone, 3 of 200 cover orders were red (all in round 3, after the conversion), and the run end carry made them 0. The three-person run then read 25 of 150 red, the bridge fix brought that to 5, and the Escape split to 0 of 300. Seed 374 of 800 needed the run end carry as well.
  - With every fix in, all 2,000 default orders are green.
- `apps/studio/src/server/blob-admission.test.ts`: the blob tier's two entry POST.
- `apps/realtime-worker/test/room.test.ts`: the object's two entry frame over the socket.
- `apps/studio/src/server/concurrent-conversion.test.ts`: the test's copy of the admission loop calls `landedPast`, plus a case where the word's letters ride its conversion and the next entry. The case read "t tb2a2" without `landedPast` and without its canvas reading.
- `packages/realtime/client/room-client.test.ts`: the op's field run moved past a word on another person's canvas block (it read "B Two type tars" before), and the run end carried across a conversion.
- `apps/studio/src/editor/convert-first.test.ts`: `fieldRunsFirst`.

## The readings

The load is the one-minute load average of the machine, which other sessions' jobs drive. A lost word is a content failure at any load. The latency bounds of the rows are the rows' own, recorded beside the load.

**The unit tests of every package touched.**
- `packages/realtime` (`vitest run packages/realtime`): 17 files, 193 tests green.
- `apps/realtime-worker` (its own vitest under the Workers pool, with test secrets in a local `.dev.vars`): 6 files, 46 tests green.
- `apps/studio` (`vitest run --project studio`, load 100 to 380): 113 of 116 files green. The three red tests were the three-person run at seed 374, before the run end carry was restored (green after), and `authorize.test.ts` and `index-facts.test.ts`, which hit their 5 s timeouts at load 376 and pass with `--testTimeout 120000`.
- `tsc -b` on `packages/realtime`, `apps/studio` and `apps/realtime-worker`: clean.
- `scripts/lint-packages.mjs --changed --base HEAD`: no finding on a changed line. The 58 findings in these files sit on lines this change does not touch.

**The simulation, final tree** (`two-typers.test.ts` at its default seeds, 19:28 to 19:42, load 97 to 123): 5 of 5 green, 2,000 orders, 838 s.

**The two process do run** (docs/CLOUDFLARE.md 5.4). This used the node-server build of this tree on 4781 and 4782 over one tmp overlay, with `TURBOSLIDE_REALTIME=do`, `TURBOSLIDE_ROOM_HOST=127.0.0.1:8781` and `TURBOSLIDE_ROOM_INSECURE=1`, against `wrangler dev` of `apps/realtime-worker` on 8781 with a local D1. All secrets were test values of 40 or more characters.

`core-gate.mjs --tier do --only realtime --base http://localhost:4781 --second-base http://localhost:4782`, 19:28 to 19:40, load 95 to 116: 16 rows judged, 11 passed, 5 failed. `realtime.title.two-typers` passed. The five reds are the rows' latency bounds:

| Row | Reading | Bound |
| --- | --- | --- |
| `realtime.keystroke.within-300ms` | A 420 ms, D 518 ms, G 416 ms, H 586 ms, I 485 ms | 300 ms |
| `realtime.block.drag-live` | a jump later than the bound after the release | 300 ms |
| `realtime.agent.write-announced` | the agent banner later than the bound after the write | 1 s |
| `realtime.pointer.second-browser` | the pointer later than the bound after the move | 300 ms |
| `realtime.caret.dims-and-leaves` | the caret gone later than the bound after B closed its tab | 2 s |

No character was lost or doubled in any row. The matrix's own `today` column lists four of the five as broken and the pointer row as not driven before this change.

**`realtime.title.two-typers`, ten readings on the do pair** (A on 4781, B on 4782; 19:18 to 19:28, load 93 to 105): every word once in both browsers and both browsers equal, ten of ten. Two readings passed whole. Eight failed only on the row's last assertion, "both words within 500 ms, three rounds", which runs after the word checks:

| Reading | Over the 500 ms bound |
| --- | --- |
| 1 | ta2 666 ms |
| 2 | ta3 514 ms |
| 3 | tb1 618, ub1 524, ta1 506 ms |
| 4 | ua2 703 ms |
| 6 | ub2 535, ua2 522 ms |
| 7 | ta2 801, ua2 578 ms |
| 8 | ub1 590 ms |
| 9 | ta1 591, ta2 618 ms |

**`realtime.title.two-typers`, ten readings on the memory tier** (one node server on 4783, `TURBOSLIDE_REALTIME=memory`; 19:11 to 19:17, load 91 to 99): ten of ten passed whole, 25 to 43 s each.

**A trap of the rig.** The first readings used `http://127.0.0.1:<port>` bases. Every one of them passed the row's word assertions, then hung in the spec's teardown until the 300 s and 180 s timeouts. The spec's `statusOf` reads the deck through Playwright's `APIRequestContext`. That context sent no `__Host-ts_id` cookie (`Secure`) to `http://127.0.0.1`, so the server minted a new anonymous id. Its `Set-Cookie` then replaced the owner's id in the shared jar, and the owner's next load of `/edit/<id>` read View only. On `http://localhost` the cookie travels, and the walk's presence setup and every teardown worked. Run the local pair on `localhost`.

## What is left

- A tab of the build before this fix keeps mechanisms 2 to 4 until it reloads. The server fix covers mechanism 1 for it. No protocol field changed.
- On the local do pair, the latency rows above miss their bounds at load 95 to 116, as they did before this change. The memory tier met the two typers row's 500 ms bound in all ten readings.
- `textBurstMutation` and `absorbedText` still compute a splice as a diff of two strings when the session has no caret or splice to place it by: a re-send outside a session, or an announce without the room client's splices. No order the simulation produced reached that path with a word at stake.
