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

## Verifier

The verifier's pass of 2026-10-07, 20:30 to 22:00 PDT, on `486b10b2` in the same worktree. Nothing was pushed or deployed and no setting was changed. The rig was the verifier's own: `wrangler dev` of `apps/realtime-worker` on 8781 over a copy of its config with its own local state and its own test secrets (64 hex characters each, never a real one), and the node-server build of this commit on 4781 and 4782 over one tmp overlay with `TURBOSLIDE_REALTIME=do` and `TURBOSLIDE_ROOM_HOST=127.0.0.1:8781`. All of it was stopped before this note was committed. The machine's one-minute load, from other sessions' jobs, ran from 65 to 468 during the pass.

**Verdict: ready to ship.** The four mechanisms are fixed. No reading of this pass lost or doubled a word that the tree before the fix kept, and every comparison with `19bd3de7` reads the same number of red orders or fewer. The pass found three word-loss mechanisms that the hotfix does not touch (F1 to F3 below). Each one exists on production today, `realtime.title.two-typers` does not exercise any of them, and each needs its own fix. F2 was read in two browsers on this build.

### Readings

**`realtime.title.two-typers` on the do pair**, A on 4781 and B on 4782, 13 runs. Twelve were driven. In all twelve, every word was in both browsers once and the two browsers were equal. None passed whole: each failed the row's last assertion, the 500 ms bound, which runs after the word assertions. Run 9 also hit the test's 300 s timeout after its word assertions held. Run 10 was not driven: at load 468 the title's run did not appear within 20 s of setup.

| Run | Load at start | Slowest word in the other browser |
| --- | --- | --- |
| 1 | 64.9 | 956 ms |
| 2 | 91.2 | 878 ms |
| 3 | 95.7 | 792 ms |
| 4 | 100.1 | 1,097 ms |
| 5 | 113.5 | 682 ms |
| 6 | 106.5 | 512 ms |
| 7 | 99.7 | 1,146 ms |
| 8 | 137.7 | 2,237 ms |
| 9 | 157.2 | 3,843 ms |
| 10 | 468.0 | not driven |
| 11 | 241.5 | 2,342 ms |
| 12 | 202.5 | 2,764 ms |
| 13 | 153.1 | 2,944 ms |

**`core-gate.mjs --tier do --only realtime --second-base http://localhost:4782`**, 21:27 to 21:40, load 125 at the start and 95 at the end: 16 rows judged, 11 passed and 5 failed. `realtime.title.two-typers` passed whole, as did `reload.loses-nothing`, `reconnect.loses-nothing`, `caret.offset-after-merge`, `block.drag-live`, `join.chip-within-1s`, `follow.for-everyone`, `selection.outline-within-300ms`, `share-link.every-instance`, `departed-guest.name-stable` and `card.chip-painted`. All five reds are latency bounds: `keystroke.within-300ms` (374 to 721 ms; its every-letter-once assertions run first and held), `caret.within-300ms` (311 to 349 ms), `agent.write-announced` (1 s), `pointer.second-browser` (300 ms) and `caret.dims-and-leaves` (2 s).

**`tsc -b`** over the workspace (load 202 to 275): exit 0.

**Unit tests.**
- `packages/realtime`: 187 of 193 green at load 165 to 195. The six reds were timeouts (`run-tie.test.ts` at 6.4 s, four poll-pace tests in `blob.test.ts`, the room client's 2,000-entry resync). Their three files then read 92 of 92 green at load 168 to 221.
- `apps/realtime-worker`: 46 of 46 green.
- `apps/studio` without `two-typers.test.ts`: 888 of 892 green at load 100 to 124. `authorize.test.ts`, `flags.test.ts` and `auth/actions.test.ts` were 5 s timeouts and read 37 of 37 green with `--testTimeout 120000`. `index-facts.test.ts` read red twice, also with the long timeout: "expected { variant: 'glyph', salt: 7 } to be undefined". The test's 5 s link-grant cache window expires under this load before its second read, and nothing in its import graph is in this diff.

**The fixer's simulation, widened** (`TWO_TYPERS_SEEDS=2400`: seeds 1 to 2,400 in each of its three property runs, 7,200 orders): 5 of 5 tests green, every order green, 4,948 s from 20:47 to 22:09 at load 86 to 468.

**The verifier's simulation.** This is the fixer's harness with what it does not drive: Backspace typos, deletes of the deck's own letters, POST answers lost after admission, stream drops and reopens, the `19bd3de7` room client and controller commit, an undo after the merge, and seeds from 10,001. The same file was also run against the tree before the fix (the `19bd3de7` `admitOps`, room client and commit) for each comparison. On the row's own shapes it reads that tree red ("ta3 ua tb3 ub33"), so it sees the class the hotfix fixes.

| Property | `486b10b2` | `19bd3de7` | Mechanism of the reds |
| --- | --- | --- | --- |
| Cover, two people, three rounds | 0 of 400 | 6 of 100 | the four fixed |
| Three people, three rounds, early wrap, mixed points | 0 of 400 | 15 of 100 | the four fixed |
| One tab on the `19bd3de7` client and commit beside a new tab, new admission | 200 of 200 converged | not run | |
| Both tabs on the `19bd3de7` client, new admission | 200 of 200 converged | not run | |
| A Backspace typo inside every word, two and three people | 32 of 300 | 65 of 300 | F2 |
| One person deletes the deck's letters at the others' point | 22 of 300 | 50 of 300 | F2 |
| Undo of one person's last round after the merge | 115 of 300 | 123 of 300 | F3 |
| A quarter of POST answers lost after admission | 52 of 60 | 53 of 60 | F1, then R |
| The same, the answer ordered behind the stream (the socket) | 48 of 60 | 52 of 60 | F1 |
| Stream drops, answers ordered behind the stream | 29 of 60 | 39 of 60 | F1, D |
| Stream drops, answers apart from the stream | 35 of 60 | 35 of 60 (`19bd3de7` client) | D, F1 |

### Findings

None of these is caused by `486b10b2`. The reproductions are written out below; their files are kept in the verifier's session scratchpad (`wordfix-verify/harness/`, wiped on reboot) and are not committed.

**F1. A resent POST's new entries are moved past the POST's own first entry (server: `admitOps`, `admitOnBlob` and the object's `admit`; pre-existing).** A retried POST answers an op id already in the log from the log and skips it before `transformEntry`, but that entry's rows stay in the landed set. The new entries after it were written on top of it, so they are moved past their own author's letters. Reproduction on the memory tier, a body text reading "Realtime title": a POST on base 0 with A:1 (splice at 14, " t") is admitted as seq 1 and its answer is lost. The tab resends on base 0 with A:1 again and A:2 (run, splice at 16, "a1"). A:1 is answered from the log. A:2 is moved past seq 1 to 18 and refused with "text.splice: 18 plus 0 is outside a text of 16 characters", and the text stays "Realtime title t". With " t" at 8 and "a1" at 10, the text reads "Realtime t ta1itle". On the object, an ops frame on base 0 with "t" at 0 is acknowledged; the frame resent on base 0 with "t" at 0 and "a1" at 1 places "a1" at 2. `19bd3de7` reads the same. The room client resends its unsettled ops on its last base after any `postOps` that threw: a lost HTTP answer, a 5xx after the append, or a socket closed after admission (`transport.ts` rejectAcks), resent over the HTTP belt. The loss happens when the stream has not brought the tab's own entry first. The suggested fix: when an entry is answered from the log and its seq is above the base, take its rows out of the landed set and move the rows that landed before it past it with `landedPast`. A diagnostic copy of `admitOps` with that change brought the lost-answer property from 52 to 24 of 60, and the ordered drop property from 29 to 14 of 60.

**F2. The session's absorb swallows a word that lands right after a letter the person just deleted or replaced (client: InlineText `absorbedText`; pre-existing).** `absorbedText` moves the end of the unflushed local change with `shift(local.end)`. An end equal to the point where another person's insertion landed is moved past the insertion, so the local delete or replace covers the other person's word. The next burst then writes the removal to the document. Reproduction with the real function: `absorbedSession({ base: 'Realtime title tqx', raw: 'Realtime title tq', trimmed: 'Realtime title tq', remote: 'Realtime title tqx tb1', selection: [17, 17], splices: [{ at: 18, remove: 0, insert: ' tb1' }] })` returns 'Realtime title tq' where 'Realtime title tq tb1' is expected. With base '…ubx', raw '…ub1' and " ta1" landing at 22, it returns '…ub1', and the harness's next burst writes `[21, 4, '']`: A's " ta" is removed and A's "1" reads as B's. In two browsers on this build (the do pair, load 86 to 103), B typed " b<i>x". Once the "x" was in A's document, A opened the title at its end and typed " a<i>w", and B pressed Backspace 100 to 850 ms later and typed "yqqqq". Two of six attempts lost A's word in both browsers: "b2yqqqq2w" for " b2yqqqq a2w", and " a5w" was gone. The row types no Backspace, so it does not see this. The note's line that the string diffs lost no word holds only for typing that inserts.

**F3. The undo of a person's own word is moved onto the other person's word typed at the same point (client: room-client `transformSince`, which undo-bursts `stepBursts` calls; pre-existing).** `transformSince` moves an inverse past every remote entry after the burst's clock as if both were written on one document, with the default tie. The room placed the person's run to the left of the other insert at that offset (the run rule), so the inverse moves onto the other person's letters. Reproduction from the harness's undo seed 10014, a body text with two people: A's bursts are " t" at 30 (run), "a2" at 32 and " ua2" at 34. B's " tb2" at 30 landed as seq 5 before A's " t" (seq 6), and the room kept A's word left of it: "…ua1 ta2 ua2 tb2 ub2". A's undo inverses [30, 2], [32, 2] and [34, 4] are moved to [34, 2], [36, 2] and [34, 4], and the result reads "…ua1 ta2 ub2". A's " ta2" stays and B's " tb2" is gone. 115 of 300 undo orders read red on this commit and 123 of 300 on `19bd3de7`.

**R. A residual under lost answers that this pass did not isolate.** With F1 fixed in the diagnostic copy, 24 of 60 lost-answer orders stay red, and 26 of 60 with the `19bd3de7` client. In seed 10004 the tab resends " u" at 23 and "a1" at 25 on base 3 without the op ("1", admitted as seq 4, its answer lost) whose letter they count, and the room refuses both as outside the text. The pass did not read the mechanism.

**D. A stale hello in the harness's drop mode with answers apart from the stream.** A reopened stream's hello names a position below the one the tab's POST answers already reached. The client reads it as a reset (`event.seq < seq`), resyncs, and applies the replay over a document that already holds it ("tc1 ucc1 uc1"). This needs the hello to arrive after the answer of a later POST, which the socket's single ordered channel excludes for frames sent on it. The harness's resync answer is a model of the store read, so this is reported as unconfirmed. The `19bd3de7` client reads the same 35 of 60.

### Notes on the diff

- `landedPast` was also read on the paths the fixer's tests do not name. On a refused entry, the undo rows appended after the landed set moved past the entry are in the frame the next entry was written in. The retry callback moves the rows past the placed candidates, and `readmit` past the log's own order. No defect was found.
- Read from `recordEdit` and not driven in a browser: after this change the Escape's typed letters join the typing group (a text-run key) and the conversion is its own history entry. The first Cmd+Z after a converting Escape takes back the size and the conversion, and the second takes back the word. Before, the Escape's last letters rode the conversion's entry. No letter is lost either way.
