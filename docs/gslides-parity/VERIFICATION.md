# Google Slides parity verification

The verifier's record of the Google Slides parity round (`docs/gslides-parity/SPEC.md`, section
numbers below refer to it; the build plan is `docs/gslides-parity/MILESTONES.md`), pass 2, written
2026-09-12 after the fix round, on the shared checkout at `/Users/kevinliu/repos/Turboslide`:
`main` at `14da621` plus the uncommitted working tree of the six builders, the integrator and the
five fixers (187 files modified, 1 deleted, 102 untracked paths; the tree as it stood at 09:05 PDT
is what was verified, and nothing in it was edited by the verifier except the files this role
owns). Pass 1 (05:04 PDT, the same day) found 20 findings; the fixers' reports for findings 1 to
4, 6 to 9, 11, 12, 14 and 16 to 18 and 20 were not trusted: every claim below was rerun by the
verifier. Kevin's directive, verbatim: "so i think when we land here we should be on a new slide,
but its a template with repeated kind of slide templates you can use. but otherwise it has all the
features and exact behaviors of google slides... then clean up our interface and make it so much
easier to use, remember this is actually going to be used by majority sales in our org", and "keep
going on all of these and dont stop until literally all google slides features are supported with
full agent queryability and editability esp on locals".

Every number here comes from this machine (Node 24.13.0, pnpm 11.15.1, Chrome for Testing
147.0.7727.15 on ANGLE Metal, Apple M5 Max, pdftoppm 26.08.0, no LibreOffice, the Prototemplate
checkout present) or from the preview deployment named in section 7, and the sentence says which.
The dev server for every browser step was the verifier's own on 4321, started from `apps/studio`
with the studio's Vite config plus `server.hmr: false` and `server.watch: null` (a scratch config
outside the checkout), so a live edit elsewhere on the shared tree could not reload a page under
test (the integrator measured 48 hot updates and 7 page reloads during the fix round on a
watching server); it was stopped at the end. The files are under
`docs/gslides-parity/verification/` (section 12 lists them).

## 1. The verdict in one paragraph

The fix round landed. Of pass 1's 20 findings, 17 are closed on the merged tree and proven here:
`tsc -b` is clean, the 12 package suites pass (1,338 tests) and `pnpm test` passes (149 files,
1,486 tests, 3 skipped), the contracts are current, every Insert row writes a block on a slide
with a body, the title field keeps what is typed, Full screen hides the bars, Upload from computer
opens the file chooser, the current slide follows a removal by the index rule, Edit > Cut, Copy and
Paste act on the selected card, the speaker notes field carries its tooltip, the chip's order key
is Google's Cmd Up and Cmd Down, the stdio MCP server serves `deck_import_slides` and `deck_set`,
the chrome lint's editor states apply at every width, the ten tasks pass 12 of 12 with every count
at or under the Here column, and the AGENTS.md and SPEC amendments are recorded. The parity audit
on the dev server reads 1,004 pass, 3 fail, 170 skipped (pass 1: 974, 32, 170); the three misses
are pass 1's recorded deviation for Border color and Border weight (finding 3 below) and one
timing gap in the verifier's own context reader, since fixed (its cause, that the first write from
`/new` cannot be undone, is finding 4). `pnpm check` is not 21 of 21: step 3 fails on the
uncommitted contracts until the ship step's commit (as in pass 1), and step 19 fails on 30 files,
18 of them the committed research and design documents of pass 1's finding 13, two the fixers'
own notes (finding 1). Section 2 has every step; section 9 lists the findings with their owners;
section 10 is the list for Kevin. Two things are not proven in this pass and are findings of
severity 2 rather than claims: the audit against the preview was stopped before its last three phases
(finding 15), and check step 21 fails two keyboard tests when the machine is busy
(finding 16). Two severity 2 defects remain in the product: Arrange > Order disabled on grammar
slides against SPEC 4.3 (finding 2) and the format step (finding 1). Nothing of severity 3
remains.

## 2. `pnpm check`, 21 steps

`node scripts/check.mjs` was run in full at 09:18 PDT; the runner stops at the first failing step,
so the chain was continued with `--from 4` and `--from 20` after steps 3 and 19 failed (the logs:
`verification/check/check-steps-1-to-3.log`, `check-steps-4-to-21.log`, `check-steps-20-to-21.log`).
Steps 17, 18, 20 and 21 reused the verifier's dev server on 4321.

| Step                         | Result | Numbers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 install                    | pass   | 0.3 s, frozen lockfile, nothing to add                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2 routes                     | pass   | 0.7 s; `routeTree.gen.ts` knows `/new`, `/decks/trash`, `/print/$deckId`, `/present/$deckId`                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 3 contracts                  | fail   | 1.0 s: `pnpm generate:contracts` answers "14 files current" and `git diff --exit-code` fails because the regenerated files are uncommitted until the ship step (13 files, 15,170 insertions, 4,148 deletions against `14da621`; the same state pass 1 and the integrator recorded). `manifest.json` now counts 69 actions and lists `deck_set`                                                                                                                                                                                                                 |
| 4 `tsc -b`                   | pass   | 2.7 s, 0 errors (pass 1: 4 errors on `deck.set`); `tsc -b --force` by hand: 0 errors in 11.8 s                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 5 `pnpm test`                | pass   | 22.9 s: 149 files, 1,486 passed, 3 skipped (pass 1: 7 failed in 5 files)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 6 build and client bundle    | pass   | 4.7 s; marker in 0 of 41 client text files, 1 of 72 server files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 7 to 8 import                | pass   | 0.9 s: 85 slides, 8 sections, 0 html escape blocks; `git status` shows the import reproduced the committed deck byte for byte                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 9 validate                   | pass   | 0.8 s: `gt-brand` 85 slides, 0 errors, 46 warnings (the `ext` rows, as before); by hand `decks/fixture/gslides` 7 slides, 0 errors, 0 warnings; `decks/templates/blank` 1 slide, 0 errors                                                                                                                                                                                                                                                                                                                                                                      |
| 10 to 11 render              | pass   | 17.8 s; 170 records, no page errors                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 12 compare to shoot          | pass   | 52.5 s: 170 pairs compared, 0 over budget, worst 0.408 percent, mean 0.016 percent against the 0.5 percent budget                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 13 to 14 sheet               | pass   | 3.6 s; 85 cells per theme                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 15 lint                      | pass   | 8.3 s (`.turboslide/lint.json`); by hand `lint all --layers static` on the GT deck: 124 findings, 99 at severity 1 and 25 at severity 2, the count B1 measured at `8c7056c` (`verification/check/lint-static.json`)                                                                                                                                                                                                                                                                                                                                            |
| 16 build the standalone file | pass   | 2.7 s under the 16 MB budget                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 17 viewer spec               | pass   | 18.1 s: 6 of 6                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 18 chrome lint               | pass   | 104.3 s: `/deck/gt-brand` 24 audits, `/edit/gt-brand` 24 with `editorGrid,editorMenu,editorPanel`, `/new` 24 with the same states, `/decks` 6; 0 with findings, 0 states unapplied in all 78 (pass 1's finding 16, the Theme button at 390 px, is closed: the panel state enters through Cmd+Option+Shift+H)                                                                                                                                                                                                                                                   |
| 19 format                    | fail   | 9.9 s: 30 files are not prettier clean: the 18 documents of pass 1's finding 13 (`SPEC.md`, six `design/*.md`, eleven `research/*.md`, all committed at `14da621`), `build/b1.md` and `build/b3.md` (written unformatted in the fix round), and 10 generated evidence files under `verification/` (the verifier's; formatted afterwards, and the audit now formats its own report). Finding 1                                                                                                                                                                  |
| 20 parity audit              | fail   | 277.5 s: 1,004 pass, 4 fail, 170 skipped (section 3): Border color and Border weight (finding 3, a recorded deviation) and Arrange > Order > Bring to front and Bring forward disabled on a grammar slide where SPEC 4.3 enables them (finding 2). Pass 1: 974 pass, 32 fail                                                                                                                                                                                                                                                                                   |
| 21 the parity round's specs  | fail   | two runs in the chain, both while the preview audit's browser shared the machine: 112.6 s, 43 of 44 (task 5: after Ctrl+M `data-active` stayed on `breaks` for 5 s while the title row read "Saving…"); then 116.8 s, 42 of 44 (task 5 again, and text-editing's heading commit read "The copy test now A" for "The copy test A"). The same ten-tasks spec passed 12 of 12 in the verifier's dedicated run at 09:14 on a quiet machine (section 4), and `text-editing` 6 of 6 in the first chain run. Finding 16; a quiet rerun did not fit before this record |

The per package suites, run one package at a time before the chain (`node_modules/.bin/vitest run`
in each, `verification/check/unit-sweep.log`): schema 183, lint 62, store 93, cli 69 with 1
skipped, agent 134, mcp 34, chrome 275, render 201, export 88, render-worker 7, viewer 171, import
21: 1,338 tests, 0 failures (pass 1 had 7). `apps/studio/src/server/root.test.ts` (B5's sweep of
the temp volume) is in no vitest project; run through a scratch config with `root: apps/studio` it
passes 6 of 6 (B5 request 6 stands: the root config should list it).

## 3. The parity audit (SPEC 14.4)

`scripts/gslides-parity-audit.mjs` (the verifier's) opens `/new`, creates a scratch deck through
the draft's first write, walks every menu of `packages/chrome/src/menus/model.ts`, runs every
enabled row's effect on that deck in four states (a fresh deck; a Title and body slide added for
the Insert rows that place a block; two slides for Move slide and Delete slide; a selected
paragraph with inserted shape, line, picture and table blocks), checks the toolbar order in six
states, the right-click menus, the shortcuts, the retired keys, the default view's words, and runs
`scripts/tooltip-audit.mjs --strict` on `/new`, the scratch deck and `/decks`; then it walks
`/edit/gt-brand` read only and trashes and deletes the scratch deck through File > Move to trash
and the trash page's Delete forever. `node scripts/gslides-parity-audit.mjs --base <origin> --out
<json>` exits 1 on any miss; `--report` records without failing; `--quick` skips the effects;
`--phases`, `--deck` and `--effects` narrow a rerun.

What changed in the script this pass, each from a request in the fixers' notes or a gap the
rerun showed: an absolute `--out` is written where it says (B3 request 4; the integrator's run had
left a report under `<checkout>/private/…`); the Full screen check reads the bars' height and the
Show the menus chevron while the menu bar is hidden by design, and the row's check after Esc (B3
request 3); the eleven Insert rows that place a block run on a Title and body slide added for them
when the current slide has no slot (B3 request 2; the grammar's Title and Statement kinds take no
block, finding 8), and the evidence names the draw tool the stage armed; after Delete slide and
after Undo of New slide and Duplicate slide the current slide must be the one at the removed
slide's index, clamped, and `slide.get` must answer for it (integrator request 8.4 item 2); the
Order rows' expected state on a grammar slide comes from the selected block's place in its slot
(SPEC 4.3), not from the shell's own predicate; the context reader waits for the toolbar's Undo
button before reading it and reads a missing button as disabled; the scratch deck is trashed and
deleted even when a phase throws (an "Audit scratch" deck at revision 17 had been left in
`decks/` by an earlier run); and the report is prettier formatted for check step 19.

Run by hand against the dev server (2026-09-12 09:05 PDT, 292 s, before the Order rows and
context reader changes; `verification/parity-audit.json` holds the later run of check step 20):
1,004 pass, 3 fail, 170 skipped (a skipped row is a `now` row whose predicate disables it in the
audited state, or a row under such a container, so it was not activated; pass 1: 974, 32, 170).
Per menu, the rows on the fresh scratch deck:

| Menu       | Now rows passing         | Later stubs correct | Omitted rows absent |
| ---------- | ------------------------ | ------------------- | ------------------- |
| Title row  | 8 of 8                   | 2 of 2              | 7 of 7              |
| File       | 27 of 27                 | 1 of 1              | 10 of 10            |
| Edit       | 9 of 10                  | 1 of 1              | 0 of 0              |
| View       | 23 of 23                 | 3 of 3              | 6 of 6              |
| Insert     | 22 of 22                 | 5 of 5              | 18 of 18            |
| Format     | 41 of 41 (3 unreachable) | 9 of 9              | 10 of 10            |
| Slide      | 12 of 12 (3 unreachable) | 2 of 2              | 0 of 0              |
| Arrange    | 4 of 4 (14 unreachable)  | 3 of 3              | 1 of 1              |
| Tools      | 14 of 14                 | 2 of 2              | 8 of 8              |
| Extensions | 2 of 2                   | 0 of 0              | 6 of 6              |
| Help       | 3 of 3                   | 1 of 1              | 4 of 4              |

"Unreachable" rows sit under a container the fresh state disables (Change background on a Title
slide, Replace image with nothing selected, the Arrange rows on a grammar slide with nothing
selected); with a paragraph selected the Arrange rows read 8 of 8 and Edit 10 of 10, and on
`/edit/gt-brand`, whose first slide is a picture layout, Slide reads 15 of 15 and Edit 10 of 10.
The one Edit miss on the fresh deck is Edit > Undo: the row read disabled while the verifier's
context said enabled because the toolbar's Undo button had not rendered when the context was read
(a missing button counted as enabled; fixed in the script). The probe that settled it
(`verification/check/undo-after-first-write.mjs` and `.txt`) is finding 4: after the draft's first
write both Undo controls are disabled and Cmd+Z leaves the heading in place.

What the effects phase established (119 effect rows pass, 2 fail, 69 skipped as disabled in their
state; pass 1: 99, 12 and 15, 2), with the evidence in the report:

- Pass 1's findings 3 to 9 reproduce as fixed. Last edit and Show all comments carry
  `data-menu-item` (title row 8 of 8; Last edit opens Version history). Typing "Audit renamed"
  into the title field writes "Audit renamed" (revision 1 to 2). Full screen hides the menu bar
  and the toolbar (height 0), shows the Show the menus chevron, and Esc restores both with the row
  unchecked; Ctrl+Shift+F does the same from a keydown. Insert > Image > Upload from computer
  opens the OS file chooser (one file). On a Title and body slide every Insert row writes: Text
  box, Rectangle, Rounded rectangle, Ellipse, Arrow, Line, Arrow, Rule each arm the stage's tool
  and a click on an empty spot of the sheet writes one block (blocks 3 to 4, revision n to n+1);
  Table opens the 20 by 20 grid dialog and the first cell writes a table; Icon and Material open
  their pickers and the first option writes. After Undo of New slide and Duplicate slide the
  current slide is the one at index 0 (the original) and `slide.get` answers; after Delete slide
  on two slides the current slide is the one now at the deleted slide's index. Edit > Duplicate,
  Copy, Cut (with the "Slide deleted" snackbar), Paste (the slide returns) and Delete act on the
  selected card from the menu bar.
- Every dialog of SPEC 12 opens from its row with its title, traps focus, closes on Esc and
  returns focus to the opener; every panel opens by title; the writes land (New slide, Duplicate
  slide, Delete slide, Skip slide with the dimmed card and the "Unskip slide" relabel, Apply
  layout from the grid, Move slide up, to end, down and to beginning on two slides, Bold, the
  sizes, the alignments, the spacings, Numbered and Bulleted list, Clear formatting after Bold,
  Duplicate, Link); the downloads and renders run (Plain Text, the bundle, JPEG, PNG, Web page,
  Move to trash and Delete forever); the toggles flip and their DOM follows; Zoom steps and sets;
  Slideshow, Start from beginning and Presenter view enter present mode and leave on Esc.
- The toolbar's `data-control` order matches SPEC 3.1 with nothing selected on `/new`, the scratch
  deck and `gt-brand`, and SPEC 3.2 to 3.6 with a text block, a shape, a line, a picture and a
  table cell selected. The filmstrip's right-click menu is in the order of SPEC 4.2 on both decks;
  the empty canvas and the text block menus are in the order of SPEC 4.3.
- Shortcuts: 27 of 27 (the ten access keys and the 17 chords of SPEC 10.1 from a real keydown).
  Every retired letter (`s [ d e p f g b r ? j l k h`) leaves the shell unchanged on both decks.
- The default view of `/new`, the scratch deck, `gt-brand` and `/decks` carries none of the
  eighteen words of SPEC 12, in its text or its tooltip names. The tooltip audit under `--strict`
  passes on `/new`, the scratch editor and `/decks` (0 missing, 0 title only; pass 1's finding
  11, the speaker notes textarea, is closed).

The two remaining effect misses are Format > Borders & lines > Border color and Border weight on a
selected paragraph, which answer "Use the toolbar control to pick a value" and write nothing
(finding 3, pass 1's finding 10, a recorded deviation).

Check step 20's run of the same script with the Order rows and context reader changes (09:25
PDT, 277 s, the committed `verification/parity-audit.json`): 1,004 pass, 4 fail, 170 skipped.
Edit > Undo now passes in every state (the reader waits for the toolbar). The two new misses are
Arrange > Order > Bring to front and Bring forward with the paragraph `p1` selected at place 5 of
5 in its slot on the Title and body slide: SPEC 4.3 enables them there (`block.move` one place
within the slot on a grammar slide) and the rows read disabled, while Send backward and Send to
back read disabled as they should for the last block (finding 2). Every other row and effect
reads as in the 09:05 run.

## 4. The ten tasks (SPEC 11.2)

`apps/studio/e2e/ten-tasks.spec.ts` (the integrator's; every task now opens the deck as the
editor's default author, the sales user, and two tests were added for the removal rule and the
Edit menu's clipboard) drives the Here column of SPEC 11.2 and counts the presses. Run under the
verifier's config at 1440 by 900 with a screenshot per task (`verification/ten-tasks/`:
`ten-tasks.json` with the counts, `playwright-report.json`, `playwright-list.log`, `task-NN.png`):
12 of 12 in 45.6 s.

| #   | Task                                                      | Here (SPEC 11.2)  | Measured          | Result                                                          |
| --- | --------------------------------------------------------- | ----------------- | ----------------- | --------------------------------------------------------------- |
| 1   | Open the right deck                                       | 1 click           | 1 click           | pass (1.0 s), `task-01.png`                                     |
| 2   | Make a copy for a prospect and rename it                  | 3 clicks, 1 key   | 3 clicks, 1 key   | pass (4.8 s), `task-02.png`                                     |
| 3   | Retype the customer name on the cover and across the deck | 4 clicks, 3 keys  | 4 clicks, 3 keys  | pass (1.5 s; the rename's write settled in 3 ms), `task-03.png` |
| 4   | Swap a logo                                               | 1 drop            | 1 drop            | pass (6.4 s), `task-04.png`                                     |
| 5   | Add, duplicate, delete, reorder                           | 1 press each      | 1 click, 3 keys   | pass (7.1 s; Ctrl+M, Cmd+D, Delete, one drag), `task-05.png`    |
| 6   | Hide slides that do not apply                             | 5 clicks          | 5 clicks          | pass (5.4 s), `task-06.png`                                     |
| 7   | Update the pricing table and the big number               | 2 clicks, 21 keys | 2 clicks, 12 keys | pass (3.2 s), `task-07.png`                                     |
| 8   | Write a talk track                                        | 1 click           | 1 click           | pass (5.7 s), `task-08.png`                                     |
| 9   | Present over a call                                       | 2 clicks          | 2 clicks          | pass (1.9 s), `task-09.png`                                     |
| 10  | Send a PDF or a link                                      | 6 clicks          | 6 clicks          | pass (1.5 s), `task-10.png`                                     |

All ten meet their counts (pass 1: eight; task 3 timed out in `settled()` and task 5 was flaky).
The integrator's cause for task 3 is confirmed by the rerun: the spec's second author was refused
by the cover's lease and the route re-sent the refused write in a loop; with one author the write
settles in 3 ms. The two added tests pass: "the current slide follows a removal" (1.7 s) and
"Edit > Copy, Paste and Cut from the menu bar act on the selected slide card" (4.7 s).

## 5. The local agent walk (task item 5)

On a temp decks folder holding a link to `decks/templates` and `decks/gt-brand`, with
`TURBOSLIDE_DECKS_DIR` pointing at it, `turboslide deck create "Agent walk" --from blank` made
`agent-walk` (1 slide, 4 starter assets, revision 0), and every command below exited 0 with the
deck validating after each write (`verification/agent-walk/cli-walk.log`, 30 commands and 10
validates driven by `cli-walk.sh`; pass 1: 27 commands, `deck set` failing on `/defaults`):

| Action              | Command                                                                                                                                                                                        | Result                                                                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `slide.new`         | `slide new --layout big-number --after title`                                                                                                                                                  | `big-number-1` after `title`, revision 1                                                                                         |
| `slide.duplicate`   | `slide duplicate big-number-1`                                                                                                                                                                 | `big-number-1-2`, revision 4                                                                                                     |
| `block.duplicate`   | `block duplicate big-number-1 --blocks p1`                                                                                                                                                     | `p1-2`, revision 5                                                                                                               |
| `text.replaceAll`   | `text replace Acme Globex`                                                                                                                                                                     | 5 occurrences on 2 slides, revision 6                                                                                            |
| `slide.applyLayout` | `slide apply-layout big-number-1 title`                                                                                                                                                        | applied, 0 findings, revision 7                                                                                                  |
| `slide.skip`        | `slide skip big-number-1`, `--off`, then on again                                                                                                                                              | revisions 8, 9, 10; `slides` shows `skip: true`                                                                                  |
| `slide.import`      | `slide import gt-brand title --after title`                                                                                                                                                    | `title-2` imported, 0 assets copied, revision 11                                                                                 |
| `export.text`       | `export txt --include-skipped` and without                                                                                                                                                     | 4 slides, 264 B; 3 slides, 216 B                                                                                                 |
| `deck.copy`         | `deck copy agent-walk --name "Agent walk copy" --slides title,big-number-1 --remove-notes`                                                                                                     | `agent-walk-copy`, 2 slides, 4 assets, revision 0                                                                                |
| `deck.list`         | `deck list`, `deck list --include-trashed`                                                                                                                                                     | 2 decks; 1 after the trash; 2 with `--include-trashed`                                                                           |
| `deck.trash`        | `deck trash agent-walk-copy`                                                                                                                                                                   | `trashedAt` set                                                                                                                  |
| `deck.restore`      | `deck restore agent-walk-copy`                                                                                                                                                                 | `trashedAt: null`                                                                                                                |
| `deck.remove`       | `deck remove agent-walk-copy --confirm`                                                                                                                                                        | removed; `deck list` shows 1                                                                                                     |
| `deck.set`          | `deck set /defaults/appearance light`, `deck set /defaults/counter off`, `deck set /defaults/counter --unset`, `deck set --unset /defaults/appearance`, `deck set /title "Agent walk renamed"` | revisions 12, 13, 14, 15, 16; `deck.json` then reads `defaults: {}` and the new title, and validates (pass 1's finding 1 closed) |
| `view.zoom`         | no CLI transport (`window`, `mcp`)                                                                                                                                                             | exercised through the window API by the parity audit (Fit, 50%, 100%, 200%, In, Out)                                             |

The same deck through the MCP stdio server (`turboslide mcp --deck <dir>`, the client of
`verification/agent-walk/mcp-stdio-walk.mjs`, results in `mcp-stdio-walk.jsonl`): 45 tools listed
(pass 1: 43); 13 of the 14 names present, `deck_set_zoom` absent by design (a window action);
`deck_new_slide`, `deck_duplicate_slide`, `deck_skip_slide`, `deck_apply_layout`,
`deck_import_slides` (the `thesis` statement slide of `gt-brand` came over; pass 1's finding 12
closed), `deck_duplicate_block`, `deck_replace_text` (4 replacements on 2 slides),
`deck_export_text`, `deck_list`, `deck_copy`, `deck_trash`, `deck_list` with `includeTrashed`,
`deck_restore`, `deck_set` (`/defaults/appearance` light, revision 24) and `deck_list_slides` each
answered `isError: false` with the structured output of the action: 16 calls, 0 failures, exit 0.
`deck.remove` has no `mcp` transport by design (its doc says the Trash page calls it).

## 6. The exports (task item 6)

`decks/fixture/gslides` (7 slides: a table, a numbered list, paragraph breaks, links, an empty
prompt, a skipped slide, notes) through `apps/cli/bin/turboslide.mjs` on this machine
(`verification/exports/`, every command and its output in `exports.log`):

| Export                   | Command                                               | Result                                                                                                                                                                                                                                                        |
| ------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Perfect (flatten)        | `export decks/fixture/gslides --mode flatten --out …` | light and dark, 6 pages of 7 each (the skipped slide left out), `perfect true`, `passed true`, worst decoded mismatch 0.000 percent, 8 hyperlinks written, 229,099 and 229,410 B, notes left out (decision 15.2)                                              |
| `export check` (flatten) | `export check …/gs-flatten`                           | both files valid, 51 parts, 62 relationships checked, 0 invalid, 0 undeclared parts                                                                                                                                                                           |
| Editable text (native)   | `export decks/fixture/gslides --mode native --out …`  | the table slide's `table` block native (one `a:tbl`), 10 hyperlinks, `passed true`, 40,893 and 41,308 B; the per cell 3 px budget is the verify loop's under LibreOffice, which this machine does not have (B2 recorded the same)                             |
| `export check` (native)  | `export check …/gs-native`                            | both files valid, 47 parts, 58 relationships checked, 0 invalid                                                                                                                                                                                               |
| PDF                      | `export pdf decks/fixture/gslides --verify --out …`   | `gslides-light.pdf` 203,032 B, 6 pages at 960 by 540 pt (13.333 by 7.5 in; `pdfinfo` agrees: Pages 6, 960 x 540 pts), Inter embedded, gate pdftoppm at 3200 by 1800, 0 pages over the 0.1 percent target, worst page `breaks` at 0.035 percent, `passed true` |
| TXT                      | `export txt decks/fixture/gslides`                    | 6 slides as text, 689 B                                                                                                                                                                                                                                       |

LibreOffice and Preview were not opened: neither is installed on this machine, so "opened in
LibreOffice" and "opened in Preview" of MILESTONES stay unproven here; `export check` (python-pptx
and the package rules) and `pdfinfo` are the readers that ran. The results equal pass 1's.

## 7. The preview deployment (task item 7)

`vercel deploy --yes --archive=tgz` from the repository root at 09:03 PDT (31.0 MB uploaded, the
build on Vercel's 4 core Linux machine in iad1, 24 s): preview
`https://turboslide-mbd18o072-kl01s-projects.vercel.app`, inspect
`https://vercel.com/kl01s-projects/turboslide/C5YUCXUyGqUtvtYA3z6i45cYLKe4`
(`verification/preview-deploy.txt`). The client build still prints the `node:fs`, `node:path` and
`node:zlib` externalization warnings for `packages/lint/src/rendered/bitmap.ts` and `png.ts`
(finding 12). `vercel env pull` wrote the development environment to a scratch file outside the
checkout; a small wrapper read `VERCEL_OIDC_TOKEN` from it and set it on the probes; the file was
deleted afterwards and the token was never printed.

`node scripts/hosted-smoke.mjs --base <preview>` with the Trusted Sources header
(`verification/preview-smoke.txt`): 10 of 10 rows pass. `/` 307 to `/new` with `x-robots-tag:
noindex` (1001 ms), `/new` 200 with the shell marks and `noindex` (295 ms), `/deck/gt-brand` 200
with 0 `notes` keys (2042 ms), `/edit/gt-brand` 200 (146 ms), `/decks` 200 with 14 cards (3492
ms), `/decks/trash` 200 (325 ms), `/print/gt-brand` 200 with 85 pages (270 ms), `/present/gt-brand`
200 (275 ms), the twin `cover-fumadocs.png` 200 image/png 335,538 B (239 ms), `/api/agent` 401
(the bearer rule). Against the local server the same script passes 10 of 10
(`verification/local-smoke.txt`).

The parity audit against the preview (`node scripts/gslides-parity-audit.mjs --base <preview>
--out verification/parity-audit-preview.json`, the Trusted Sources header on every request of the
browser context, the scratch deck `untitled-20260912-xf9j` created through the draft's first
write in the Blob store): 708 pass, 11 fail, 136 skipped in 695 s (pass 1: 666, 51, 137 in 1,272 s).
The run had reached the tail states phase when the verifier closed its browser at 09:37 to meet
this record's deadline, so its last two rows are infrastructure (`page.$` on a closed browser and
the cleanup that could not run); the scratch deck was then trashed and deleted through the
preview's `/api/actions/deck.trash` (revision 77) and `deck.remove` with the host's bearer token
and the Trusted Sources header (`verification/preview-cleanup.txt`), and `deck.list` afterwards
shows the 14 decks that were there before, the scratch deck absent with and without
`includeTrashed`. The per menu table on the preview's fresh deck equals the local one of section 3
(title 8 of 8, File 27 of 27, Edit 9 of 10, View 23 of 23, Insert 22 of 22, Format 41 of 41, Slide
12 of 12, Arrange 4 of 4, Tools 14 of 14, Extensions 2 of 2, Help 3 of 3; every Later stub and
every Omit row as declared), and the fifteen File rows, the Page setup stub and the Undo row that
pass 1 read while the remote page was still confirming the first write all pass now except Undo,
which reads as finding 4 does locally. The 9 product rows that miss on the preview are the same as
locally: Edit > Undo on the fresh deck (finding 4), Arrange > Order > Bring to front and Bring
forward on the grammar slide (finding 2), Border color and Border weight (finding 3), plus four
remote timing rows the local run does not have: the app icon's click and the bundle download
timed out on cold function renders, Slide > Skip slide met a page reload (`window.turboslide`
undefined for one read) and Slide > Apply layout's grid did not open within 30 s on the same
reload. Every fix of the fix round that the run reached reproduces on the preview: the title row
hooks, the title field, Full screen, Upload from computer, the eleven Insert rows on the Title and
body slide, the index rule after New slide, Duplicate slide and Delete slide, Edit > Cut, Copy and
Paste on the selected card. No `ENOSPC` was seen during the run's renders, exports and builds
(finding 20 of pass 1; the sweep's day of downloads is not what one audit exercises).

## 8. The builders' acceptance commands, rerun

Every command is from MILESTONES.md, run on the merged tree by the verifier after the fix round.

- B1 (document, layouts, actions, lint, store): schema 183 of 183, lint 62 of 62, store 93 of 93,
  cli 69 of 69 with 1 skipped (the new `mcp.test.ts` and `deck-set.test.ts` included), agent 134
  of 134, mcp 34 of 34 (pass 1's findings 1, 2 and 12 closed); `generate:contracts --check` "every
  committed contract is current", `git diff --exit-code` fails until the commit; `validate` on
  `gt-brand` (85 slides, 0 errors, 46 warnings), `decks/fixture/gslides` (7 slides, 0 errors) and
  `decks/templates/blank` (1 slide, 0 errors) exit 0; `lint all --layers static` on the GT deck
  gives 124 findings (99 at severity 1, 25 at severity 2), the count B1 measured at `8c7056c`; the
  temp deck walk of the acceptance ran as section 5 says; `migrations.test.ts` is in the schema
  suite.
- B2 (renderer and export): render 201 of 201, export 88 of 88, render-worker 7 of 7; the fixture
  exports of section 6; steps 10 to 12 in section 2.
- B3 (chrome shell): chrome 275 of 275 (pass 1: 260; the 15 new tests cover the Insert intents,
  the pickers, compact mode with the real CSS, the title field and the title row hooks); `pnpm
build` and `check-client-bundle` pass (step 6); the chrome lint on `/new`, `/edit/gt-brand` and
  `/decks` is step 18 (0 findings in 78 audits); the tooltip audit under `--strict` has 0 misses on
  `/new`, the editor and `/decks` (the audit's step 8); 0 tooltips in the default view carry an
  action id or a JSON pointer (the audit's word check over every `data-tip`).
- B4 (filmstrip, canvas, text): viewer 171 of 171; the chrome components in the 275 (the NotesPane
  and the Overlay chip tests included); `text-editing`, `filmstrip` and `undo` are in step 21 and
  section 8.1.
- B5 (routes, home, files): `landing`, `home` and `deck-transfer` are in step 21; `curl
/deck/gt-brand` carries 0 `notes` keys and `/` answers 307 with `x-robots-tag: noindex` (both
  smoke tables); the hosted smoke against the preview passes 10 of 10; `root.test.ts` 6 of 6 under
  a scratch vitest config (the sweep is B5's fix for pass 1's finding 20; section 7 says what the
  preview showed).
- B6 (present): `present` and `viewer` are in steps 21 and 17.
- Integrator: `pnpm check` is not 21 of 21 (steps 3 and 19, section 2); the contracts are current
  but uncommitted; `AGENTS.md` carries the deviations list with the SPEC 7.9 amendments and the
  builders' deviations, `docs/spec/SPEC.md` carries the six amendments, the four `skills/*/SKILL.md`
  name the fourteen actions in prose and stay under the 50 line cap (46, 33, 38, 36 lines),
  `BUILD-STATUS.md` has the merge 2 and fix round sections and deviations 4 to 10 (pass 1's
  finding 14 closed); `decks/templates/gt-brand/template.json` carries the 21 archetypes.

### 8.1 The other end to end specs

`node_modules/.bin/playwright test apps/studio/e2e/undo.spec.ts apps/studio/e2e/editor.spec.ts
apps/studio/e2e/window-api.spec.ts apps/studio/e2e/agent-http.spec.ts` against the dev server:
15 of 15 pass in 28.8 s (`verification/check/e2e-rest.log`; pass 1: 14 of 15). `undo.spec.ts`
(ten mutations and ten Cmd Z leave the document byte identical) passes; `agent-http` 5 of 5 and
`window-api` 3 of 3 pass; `editor.spec.ts` 6 of 6, its last test now "Cmd Down on the focused move
chip sends the block one place back in its slot as one block.move" (B4 updated the test because
SPEC 10.2 retires Alt with an arrow; pass 1's finding 18 closed, and the block order sign that
had inverted in `Editor.tsx` is back to `14da621`'s).

## 9. Findings

Severity 3 blocks the round, 2 must be fixed before the ship step, 1 is recorded. The owner is the
builder who owns the file in MILESTONES.md. Pass 1's 20 findings: 1 to 9, 11, 12, 14, 16, 17, 18
and 19 are closed and proven above (19, task 5's flakiness, did not recur in the two runs here and
the integrator's server log attributes it to a live edit's page reload); 10, 13, 15 and 20 carry
over below with their new numbers.

1. Severity 2, check step 19 (`pnpm format:check`) fails on 30 files. Eighteen are the committed
   documents of pass 1's finding 13 (`docs/gslides-parity/SPEC.md`, the six `design/*.md`, the
   eleven `research/*.md`, all at `14da621`; the integrator's decision: `pnpm format` on them or a
   `.prettierignore` line for the folder). Two are the fixers' notes written this round without a
   format pass: `docs/gslides-parity/build/b1.md` (B1) and `build/b3.md` (B3). Ten were the
   verifier's generated evidence (`verification/parity-audit.json`, the export reports, the
   Playwright report, the undo probe), formatted since; the audit now formats its report, and the
   `.prettierignore` should list `docs/gslides-parity/verification/**/*.json` so a regenerated
   report cannot fail the step again (integrator). Without this step 19 blocks 21 of 21.
2. Severity 2, Arrange > Order is disabled on every grammar slide: `canOrder` in
   `packages/chrome/src/editor-shell.ts` (line 394, B3) reads `freeform && block !== undefined &&
placed.length > 1`, so Bring to front, Bring forward, Send backward and Send to back, and the
   same rows in the canvas right-click menu, are greyed on a Title and body slide with a block
   selected, while SPEC 4.3 says Order moves the block one place within its slot there
   (`block.move`, Now) and disables only the moves with no effect. The audit reads it with `p1` at
   place 5 of 5: Bring to front and Bring forward disabled where the SPEC enables them (2 misses;
   Send backward and Send to back are correctly disabled for the last block). Cmd+Up and Cmd+Down
   write from the stage and from the chip (B4's fix for pass 1's finding 18), so the keys work and
   the menu does not; B4 recorded the same as a request to B3 (`build/b4.md` 7.3). Predicate on a
   grammar slide with one selected block: forward and front when the block is not first in its
   slot, backward and back when it is not last; the plan writes `block.move`.
3. Severity 1, Format > Borders & lines > Border color and Border weight answer "Use the toolbar
   control to pick a value" on a selected paragraph and write nothing (`menuActionPlan`,
   `packages/chrome/src/editor-shell.ts`, B3; pass 1's finding 10, unchanged in the fix round).
   Google opens the colour and weight pickers from the menu. The two rows are the audit's two
   effect misses; the sentence names the next step, so a sales user is not stuck, and the finding
   stays a recorded deviation until the rows open the toolbar's plate.
4. Severity 1, the first write from `/new` cannot be undone. The probe
   (`verification/check/undo-after-first-write.mjs`, its output in `.txt`) types the heading
   through the draft's first `slide.update`, waits for the address to become `/edit/<id>` and "All
   changes saved", and for 12 s reads the toolbar's Undo `aria-disabled="true"`, then opens Edit
   and reads Edit > Undo disabled; Cmd+Z leaves revision 1 and the heading "Undo probe". The hand
   off from `/new` (`apps/studio/src/routes/new.tsx`, B5) to the editor route
   (`apps/studio/src/routes/edit.$deckId.tsx`, integrator) starts the editor with an empty history.
   Google lets the first edit on a new presentation be undone; SPEC 11.1 does not name the case.
   Carry the draft's history across the hand off, or record the difference.
5. Severity 1, on a hosted studio without a Blob store the hosting notice covers the first row of
   Insert > Image. Reproduced by the verifier on a dev server with `TURBOSLIDE_STORE=tmp`
   (`verification/check/banner-tmp-store.txt`): `.ts-banner` ("Edits are kept on this server
   instance only and do not persist until a Blob store is connected…", `z-index: 19`) sits at y 64
   to 95.5; the Upload from computer row of the open Insert > Image submenu sits at y 80 to 108;
   `document.elementFromPoint` at the row's centre is the banner and Playwright's trial click is
   refused. The banner is mounted beside the fixed `.pt-viewer` (`apps/studio/src/routes/
edit.$deckId.tsx` near line 3047 and `edit.$deckId.css`, integrator), so it paints over every menu
   plate, tooltip and dialog inside the viewer regardless of their z-index (B3 measured the same
   and tried a z-index on `.ts-menu`, which cannot help from inside the stacking context). The
   preview and production run on Blob and never show the banner, which is why pass 1 did not meet
   it. Mount the notice in the editor's banner slot (`.ts-shell-banner`, the grid row under the
   toolbar) or at `top: var(--ts-top-h)` when the editor shell is on.
6. Severity 1, `pnpm lint` (`eslint .`) does not complete: the whole tree run stops with a heap
   out of memory at 4 GB after 35 s (`eslint-all.err` in the verifier's scratchpad; the type aware
   rules over the monorepo). Over this round's changed TypeScript files alone, eslint reports 19
   errors and 11 warnings: `packages/chrome/src/editor-shell.ts` 4 errors (unnecessary type
   assertions at 589, 692, 1119; an unnecessary conditional at 642) and 5 `no-shadow` warnings,
   `packages/chrome/src/__tests__/editor-shell.test.ts` 8 errors and `editor-shell-render.test.tsx`
   4 errors and 1 warning (B3); `apps/cli/src/commands/deck.ts` 1 error (an always false
   conditional at 207) and 1 warning and `slide.ts` 2 warnings (B1); `apps/studio/src/routes/
edit.$deckId.tsx` 2 `import/no-duplicates` errors (`@turboslide/schema/src/deck.ts` imported twice,
   lines 76 and 82) and 2 warnings (integrator). eslint is not a check step; recorded for the
   owners and for the integrator's tooling (a heap budget on the `lint` script, or per package
   runs). With `NODE_OPTIONS=--max-old-space-size=12288` the whole tree run completes in about a
   minute: 112 errors and 20 warnings in 70 of 2,612 files, 39 unnecessary type assertions, 32
   unnecessary conditionals, 20 `no-shadow`, 14 `import/no-duplicates`; the files with errors
   include ones untouched by this round (`packages/headless/src/context.ts`,
   `packages/export/src/verify/diff.ts`, `packages/lint/src/static/asset.ts`), so the tree was not
   eslint clean at `14da621` either and no builder is behind a gate here.
7. Severity 1, check step 3's `git diff --exit-code` fails until the ship step commits the 13
   regenerated contract files (15,170 insertions, 4,148 deletions against `14da621`);
   `generate:contracts` itself answers "14 files current". Not a defect; recorded so the number
   reads right.
8. Severity 1, a Title slide (and a Statement) takes no block: the grammar's fixed kinds carry no
   slot, so on the draft of `/new` and on a fresh deck Insert > Text box arms the tool and a click
   on the sheet writes nothing, and the Table, Icon and Material pickers show "Table needs a layout
   with a body. Apply Title and body or Blank first" (B3's deviation 7.2 item 1; the audit now runs
   these rows on a Title and body slide added for them). Google accepts a text box on every slide.
   A grammar decision for Kevin (section 10). B3's request to B4 stands: the draw tool should say
   the same sentence when it finishes on a slide without a slot instead of disarming silently.
9. Severity 1, the Table picker is a Dialog (focus trap, Esc, focus return) with Google's 20 by 20
   hover grid and size caption inside it, not a dynamic submenu plate as SPEC 2.4 reads (B3's
   deviation 7.2 item 2).
10. Severity 1, Edit > Cut from the menu bar shows the "Slide deleted" snackbar with Undo, the same
    as the filmstrip's right-click Cut, while Google shows no snackbar for Cut (integrator decision
    8.2 item 3; a later round can drop it from both paths).
11. Severity 1, Edit > Select all from the menu bar with the filmstrip focused answers the fallback
    sentence because `SidebarEdit` exposes no input for its selection (integrator decision 8.2 item
    4; request to B4 for a `selected` input or a `selectAll` handle, `packages/chrome/src/
Sidebar.tsx`). The filmstrip's own Cmd+A works when it has focus.
12. Severity 1, the preview build's client bundle still names `node:fs`, `node:path` and
    `node:zlib` from `packages/lint/src/rendered/bitmap.ts` and `png.ts` (Vite externalizes them;
    the namespace imports keep the page booting). The rendered rules never run in a page; a client
    safe entry for `@turboslide/lint/run` would take them out of the graph (B1's files; pass 1's
    finding 15, unchanged).
13. Severity 1, a lease outlives the tab that took it, ten minutes at most: releasing it on
    `pagehide` needs a request that survives the page (the server function client cannot set
    `keepalive`; the hosted `/api/actions` route wants the bearer token), so the conflict card with
    the holder and Force is the recovery (integrator, recorded in AGENTS.md). A sales user who
    closes a tab mid edit and reopens the deck as another author within ten minutes meets the
    card.
14. Severity 1, the verifier's own tool left two artifacts in the checkout before this pass: an
    "Audit scratch" deck (`decks/untitled-20260912-y53x`, revision 17, untracked) from an audit run
    whose cleanup did not run after a thrown phase, and a report under `<checkout>/private/…` from
    the absolute `--out` bug (B3 request 4). Both removed; the script now resolves `--out` as given
    and trashes and deletes the scratch deck from its catch path too (section 3).
15. Severity 1, the parity audit against the preview did not run to its end: the verifier closed
    its browser in the tail states phase to meet this record's deadline (708 pass, 11 fail, 136
    skipped in 695 s; section 7), so the text block state on the preview holds the rows and 16 of
    its effects but not the tooltip audit, the read-only walk of `/edit/gt-brand` or the home page
    walk, and the audit did not exit 0 there. The ship step reruns `node
scripts/gslides-parity-audit.mjs --base <preview>` under the token to its end (about 21 min in
    pass 1); the four remote timing rows (the app icon, the bundle download, Skip slide and Apply
    layout on a page reload) are the preview's function cold starts, not the shell (verifier).
16. Severity 2, two keyboard tests of check step 21 fail when the machine is busy and pass when it
    is quiet. Task 5 of `apps/studio/e2e/ten-tasks.spec.ts`: after Ctrl+M the new `split-1` exists
    in `slide.list` and the filmstrip's `data-active` stays on `breaks` for 5 s while the title row
    still reads "Saving…" (`verification/check/task-5-check21-failure.md`); `selectSoon` in
    `apps/studio/src/routes/edit.$deckId.tsx` (integrator) selects once and retries once after a
    frame, and its own comment records the new slide staying unselected one run in five before the
    retry, so a loaded frame loses the selection for good. `text-editing.spec.ts` "Enter breaks a
    paragraph… commits in a heading" (B4): the heading committed "The copy test now A" for "The
    copy test A" in the second run only. Both failed in the two chain runs made while the preview
    audit's browser shared the machine and both passed in the quiet dedicated runs (12 of 12 at
    09:14; 6 of 6 in the first chain run); pass 1's finding 19 was the same task 5 symptom. Keep the
    selection intent until the filmstrip renders the id (the route), and give the heading commit an
    explicit settle (the spec), so step 21 does not depend on an idle machine.

Recorded, not defects: `slide.moveSlide.down` is disabled on the last slide and `edit.paste` is
disabled while nothing was copied (both as the model predicts); `deck.remove` has no MCP transport
by design; `view.zoom` has no CLI transport by design; the `deck_set_zoom` tool is a window action
the stdio server cannot serve; the local smoke's twin row reads `image/png 0 B` because the dev
server streams the file without a length header (the preview reads 335,538 B).

## 10. What Kevin must do

1. Decide the ship step: with findings 1 and 2 fixed (a format pass over 20 documents and a
   `.prettierignore` line; the Order rows' predicate on grammar slides), `pnpm check` reaches 21
   of 21 once the contracts are committed; nothing of severity 3 remains.
2. The grammar decision behind finding 8: should a Title slide (and a Statement) take a floating
   text box, a table, an icon or a material, as Google's title slide does, or should the first
   insert turn the slide into Title and body? Until then the pickers name the two layouts that
   take blocks.
3. The product decisions the fix round took, each recorded in AGENTS.md and BUILD-STATUS.md and
   flippable later: the post-removal selection by index (deviation 10; the audit checks the rule,
   not Google), a lease refusal shown as the conflict card, Cut from the menu with the "Slide
   deleted" snackbar (finding 10), the first write from `/new` not undoable (finding 4), Border
   color and Border weight as a sentence rather than a picker (finding 3).
4. The deviations recorded for you (SPEC 15.11), now in `AGENTS.md` and `BUILD-STATUS.md`: SPEC
   2.12's tally; SPEC 4.3's two Format options exceptions; SPEC 14.4 item 2's sentence span; Hide
   the menus on the toolbar row; B4's right-click inside an editing run; B4's `section.set` for a
   multi card drag; B6's ink surround and eight control present bar; B2's PDF gate at 3200 by 1800;
   the six SPEC 7.9 amendments; the index rule.
5. The SPEC 15 defaults this round took, each flippable later: ruled statement lists for Bulleted
   list (15.1), notes off by default in the PPTX download (15.2), Italic and Underline as stubs
   (15.3), Rotation as a stub (15.4), the right panel closed on a fresh presentation (15.5),
   placeholder strings in existing decks left alone (15.6), Help Turboslide improve as a stub with
   no destination (15.7), Transition as disabled stubs (15.9), Title only and Section title and
   description kept in the grid (15.10).
6. After the push: trash the test decks on the production home page and delete them forever from
   `/decks/trash` (15.8); the preview's home page lists 14 decks today.
7. The two readers this machine lacks: open one Perfect and one Editable text export of
   `decks/fixture/gslides` (`verification/exports/gs-flatten`, `gs-native`) in LibreOffice or
   PowerPoint, and `gs-pdf/gslides-light.pdf` in Preview, and confirm the table, the paragraph
   breaks and the slide links read as the reports say.

## 11. Commands run

All from `/Users/kevinliu/repos/Turboslide` on 2026-09-12 (PDT), by the verifier; nothing in the
tree outside `scripts/gslides-parity-audit.mjs`, `docs/gslides-parity/VERIFICATION.md` and
`docs/gslides-parity/verification/` was edited, and no git write command, `pnpm install` (outside
check step 1), `pnpm add`, `pnpm exec` (outside `check.mjs`), `pnpm build` (outside check step 6)
or Docker command ran. The dev server on 4321 and every browser the verifier started were stopped
at the end; ports 3005 and 4401 (another session's `vite preview` from 2026-09-10) were not touched.

| Command                                                                                                                                                                 | Result                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `node_modules/.bin/tsc -b`; `tsc -b --force`                                                                                                                            | exit 0, 0 errors (0.1 s incremental; 11.8 s forced)                                         |
| `node_modules/.bin/vitest run` in each of 12 packages; the studio `root.test.ts` under a scratch config                                                                 | 1,338 passed, 1 skipped; 6 passed (section 2)                                               |
| `node packages/agent/src/generate/main.ts --check`                                                                                                                      | every committed contract is current                                                         |
| `node apps/cli/bin/turboslide.mjs validate` on the three decks; `lint all --layers static --json`                                                                       | 0 errors each; 124 findings                                                                 |
| `node scripts/gslides-parity-audit.mjs --base http://localhost:4321 --out docs/gslides-parity/verification/parity-audit.json` (09:05)                                   | 1,004 pass, 3 fail, 170 skipped, exit 1 (section 3)                                         |
| `node scripts/check.mjs`; `--from 4`; `--from 20`                                                                                                                       | section 2                                                                                   |
| `node_modules/.bin/playwright test --config .turboslide/verifier/playwright.ten-tasks.config.ts apps/studio/e2e/ten-tasks.spec.ts` (1440 by 900, a screenshot per task) | 12 of 12 in 45.6 s (section 4)                                                              |
| `node_modules/.bin/playwright test apps/studio/e2e/{undo,editor,window-api,agent-http}.spec.ts`                                                                         | 15 of 15 in 28.8 s (section 8.1)                                                            |
| `W=<scratch> bash verification/agent-walk/cli-walk.sh`; `node verification/agent-walk/mcp-stdio-walk.mjs <scratch>`                                                     | 30 commands and 10 validates, exit 0 each; 45 tools, 16 calls ok, 0 failures (section 5)    |
| the six exports of section 6                                                                                                                                            | exit 0 each                                                                                 |
| `vercel deploy --yes --archive=tgz`; `vercel env pull <scratch file> --environment=development`                                                                         | the preview of section 7; the file deleted after the probes                                 |
| `node scripts/hosted-smoke.mjs --base <preview>` under the token; `node scripts/hosted-smoke.mjs http://localhost:4321`                                                 | 10 of 10 each                                                                               |
| `node scripts/gslides-parity-audit.mjs --base <preview> --out docs/gslides-parity/verification/parity-audit-preview.json` under the token                               | section 7                                                                                   |
| `node verification/check/undo-after-first-write.mjs`                                                                                                                    | the first write is not undoable (finding 4); the probe's deck trashed and deleted           |
| `node_modules/.bin/prettier --check` over the fix round's 51 changed files; `eslint` over its 35 TypeScript files; `eslint .`                                           | 2 documents unformatted; 19 errors, 11 warnings; heap out of memory at 4 GB (findings 1, 6) |
| `git grep -n '<<<<<<<'` outside `*.md`                                                                                                                                  | 0 conflict markers                                                                          |

## 12. The files

- `verification/parity-audit.json` and `parity-audit.log`: the audit's report and its printed
  summary on the dev server (check step 20's run), one row per check with its evidence.
- `verification/parity-audit-preview.json` and `parity-audit-preview.log`: the run against the
  preview (section 7).
- `verification/ten-tasks/`: `ten-tasks.json` (the counts the spec wrote), `playwright-report.json`,
  `playwright-list.log`, `task-NN.png` (one screenshot per task at 1440 by 900) and the two `extra-*`
  screenshots of the added tests.
- `verification/agent-walk/`: the CLI walk (`cli-walk.sh`, `cli-walk.log`) and the MCP walk
  (`mcp-stdio-walk.mjs`, `mcp-stdio-walk.jsonl`).
- `verification/exports/`: `exports.log` (every command and its output), and per mode the
  `export-report*.json`, the light and dark `.pptx`, the `check/` folder with the `export check`
  output and the Quick Look images (`gs-flatten`, `gs-native`); `gs-pdf/` with the report, the
  PDF and the gate's difference images; `gslides.txt.json` (the TXT with its byte count).
- `verification/check/`: `check-steps-1-to-3.log`, `check-steps-4-to-21.log`,
  `check-steps-20-to-21.log`, `unit-sweep.log`, `e2e-rest.log`, `lint-static.json`,
  `undo-after-first-write.mjs` and `.txt`, and pass 1's `chrome-lint.log`, `task-3-replay.txt` and
  step logs kept for the record.
- `verification/preview-deploy.txt`, `preview-smoke.txt`, `local-smoke.txt`: the deployment lines
  and the two smoke tables.
