# Google Slides parity round two, verification

The verifier's record of the Google Slides parity round two (`docs/gslides-parity/SPEC-2.md`,
section numbers below refer to it; the build plan is `docs/gslides-parity/MILESTONES-2.md`; the
round one record is `docs/gslides-parity/VERIFICATION.md`), pass 2, written 2026-09-12 and 13
(PDT) after the fix round, on the shared checkout at `/Users/kevinliu/repos/Turboslide`: `main` at
`a65b313` plus the uncommitted working tree of the six builders, the integrator and the three
fixers (`git status` at the start: 402 paths, nothing committed; the untracked `.github/`
untouched). Pass 1 (the same day) found 14 findings and left this document with its sections 1
to 6 unwritten; pass 2 reran everything and writes the whole document. Nothing in the tree was
edited by the verifier except the files this role owns (`scripts/gslides-parity-audit.mjs`, this
document and `docs/gslides-parity/verification-2/`). No report was trusted: every claim below was
rerun here. Kevin's directives of the round, verbatim: "so i think when we land here we should be
on a new slide, but its a template with repeated kind of slide templates you can use. but
otherwise it has all the features and exact behaviors of google slides", "keep going on all of
these and dont stop until literally all google slides features are supported with full agent
queryability and editability esp on locals", and "we must, must must be able to drag and move
around ANYTHING, including backgrounds and shaders but all text in the same exact way the google
slides is like a canvas. bring in ALL the canvas features".

Every number here comes from this machine (Node 24.13.0, Chrome for Testing 147.0.7727.15 on
ANGLE Metal, Apple silicon, Docker 29.5.2 with the `turboslide-render-worker` image rebuilt by
check step 25 and carrying LibreOffice, the Prototemplate checkout and the fonts venv present) or
from the preview deployment named in section 8, and the sentence says which. The dev server for
every browser step was the verifier's own on 4321 (`TURBOSLIDE_EXPORT_BATCH=3 vite dev --port
4321 --strictPort` from `apps/studio`, the file store, its log capped at 2 MB), started when
nothing listened there and stopped at the end; the check chain reused it. The files are under
`docs/gslides-parity/verification-2/` (section 13 lists them).

## 1. Verdict

The fix round closed pass 1's severity 3 findings 1, 2 and 5 and the severity 2 findings 6, 7 and 11, and left finding 3 as decided; the tree is better than pass 1's and it is not shippable as it stands. Two new severity 3 findings block the round: the re-imported GT deck no longer equals its committed template byte for byte, so check step 5 fails on `packages/store` (finding 15), and the MCP stdio server's `tools/list` is 27 MB, more than any stock client's 10 MB read buffer, so no MCP client can use the local transport (finding 16). `pnpm check` is not 25 of 25: steps 3 (as written on the uncommitted tree), 5, 19 (this document before it was rewritten), 20, 21 and 25 fail (section 2); step 24, the fidelity gate, passes at 0.262 percent worst. The parity audit reads 2,128 of 2,135 rows pass locally with the seven misses in two product findings (10 and 17); the canvas walk passes 40 of 43 steps with three product misses (17, 18, 19) and the CLI's conversion equal to the editor's on five slides; the agent walk passes 47 of 47 on the CLI and 38 of 40 over MCP once the buffer is widened; the exports are perfect and valid locally and in the container, whose native verify misses the three blocks B2 named; the preview serves every page, its batched Perfect export of the GT deck takes 239.5 s at 784.2 MiB, and its audit reads 2,090 pass with 31 misses of which 22 are the remote run's own. The round two Playwright specs of step 21 have never run green on the merged tree (finding 28). Sections 10 and 11 list the findings and what Kevin decides.

## 2. `pnpm check` (task item 2, SPEC-2 11.1)

`node scripts/check.mjs` was run in full and, where a step stopped the chain, continued from the
next step (`--from 4`, `--from 6`, `--from 20`, `--from 21`), so every one of the 25 steps ran on
the merged tree against the verifier's server (`verification-2/check/check-full.log`,
`check-from-4.log`, `check-from-6.log`, `check-from-20.log`, `check-from-21.log`). The chain is
not 25 of 25:

| Step | Command (abridged)                                                                  | Result                                                                                                                                                                                                                                                                                                                           |
| ---- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `pnpm install --frozen-lockfile`                                                    | ok, 0.9 s (already up to date)                                                                                                                                                                                                                                                                                                   |
| 2    | `tsr generate`                                                                      | ok, 1.6 s                                                                                                                                                                                                                                                                                                                        |
| 3    | contracts generated and `git diff --exit-code`                                      | FAIL as written on the uncommitted tree: `generate:contracts: 14 files current`, then the diff of the uncommitted generated files fails (round one's and the hosting round's record; it passes once the ship step commits them)                                                                                                  |
| 4    | `tsc -b`                                                                            | ok, 0.4 s                                                                                                                                                                                                                                                                                                                        |
| 5    | `pnpm test` (the root vitest run)                                                   | FAIL after 75.2 s: 181 files, 1,982 passed, 3 failed, 3 skipped; the failures are `packages/store` `templates.test.ts` (finding 15) and both tests of `apps/cli` `mcp.test.ts` by timeout at 5 s and 30 s under the root run's load (findings 13 and 16)                                                                         |
| 6    | `pnpm build && check-client-bundle`                                                 | ok, 6.0 s (cached turbo build; the bundle check passes)                                                                                                                                                                                                                                                                          |
| 7    | `turboslide import <Prototemplate> --into gt-brand`                                 | ok, 1.1 s; idempotent on this tree (`git status` on `decks/gt-brand` lists the same 24 paths before and after, revision 25 kept)                                                                                                                                                                                                 |
| 8    | 85 slides, 8 sections, 0 html blocks                                                | ok                                                                                                                                                                                                                                                                                                                               |
| 9    | `turboslide validate decks/gt-brand`                                                | ok, 0.9 s                                                                                                                                                                                                                                                                                                                        |
| 10   | `turboslide render all --theme light,dark`                                          | ok, 18.3 s                                                                                                                                                                                                                                                                                                                       |
| 11   | 170 records, no page error                                                          | ok                                                                                                                                                                                                                                                                                                                               |
| 12   | `compare-to-shoot.mjs --max-mismatch 0.005`                                         | ok, 53.4 s: 170 pairs, 170 compared, 0 over budget, worst 0.408 percent, mean 0.016 percent                                                                                                                                                                                                                                      |
| 13   | `turboslide sheet all`                                                              | ok, 3.8 s                                                                                                                                                                                                                                                                                                                        |
| 14   | the two sheets with 85 cells                                                        | ok                                                                                                                                                                                                                                                                                                                               |
| 15   | `turboslide lint all --json`                                                        | ok, 8.2 s                                                                                                                                                                                                                                                                                                                        |
| 16   | `turboslide build --budget 16`                                                      | ok, 2.8 s                                                                                                                                                                                                                                                                                                                        |
| 17   | `playwright test viewer.spec.ts`                                                    | ok, 24.6 s: 6 passed                                                                                                                                                                                                                                                                                                             |
| 18   | `turboslide lint --chrome` on `/deck`, `/edit`, `/new`, `/decks` at 1440, 1280, 390 | ok, 141.5 s: 24, 24, 24 and 6 audits over three widths and two themes, 0 with findings, 0 states unapplied                                                                                                                                                                                                                       |
| 19   | `pnpm format:check`                                                                 | FAIL after 58.8 s on one file, `docs/gslides-parity/VERIFICATION-2.md` as pass 1 left it; the rewritten document is prettier formatted (`--only 19` rerun: ok in 21.0 s (`verification-2/check/check-only-19.log`))                                                                                                              |
| 20   | `gslides-parity-audit.mjs --out docs/gslides-parity/verification/parity-audit.json` | FAIL after 529.5 s: 2,128 pass, 7 fail, 382 skipped, the same seven rows as the verifier's run (section 3: `format.dropShadow` on a paragraph, finding 10; the six group state rows, finding 17); the step writes round one's `verification/parity-audit.json` (finding 20), restored afterwards from a copy                     |
| 21   | the 15 Playwright specs                                                             | FAIL after 462.5 s: 66 tests, 54 passed, 6 failed, 6 did not run (7.7 min); the failures in `canvas.spec.ts`, `charts.spec.ts`, `objects.spec.ts`, `present.spec.ts`, `tables.spec.ts` and `text-styles.spec.ts` (below and finding 28); the six files alone afterwards: 17 tests, 1 passed, 7 failed, 9 did not run in 16.8 min |
| 22   | the fixture in both modes with `export check`, the flatten report perfect           | ok, 44.8 s: the native export 26 slides in both themes, `passed: true`, `export check` valid with the round two line (section 7); the flatten export `perfect: true` on both files                                                                                                                                               |
| 23   | `turboslide fonts build --check`                                                    | ok, 58.8 s: 0 stale files, version 4.001+gt.2                                                                                                                                                                                                                                                                                    |
| 24   | `canvas-fidelity.mjs` over the GT deck and the templates                            | ok, 105.5 s: 171 slides converted, 342 pairs, 0 over budget, worst 0.262 percent (`gt-brand/directions` dark), mean 0.004 percent (pass 1's finding 1 closed)                                                                                                                                                                    |
| 25   | Docker build and `export --mode native --verify` in the image                       | FAIL after 477.1 s: the image rebuilt (`COPY . .` fresh, 30 GT Inter faces, LibreOffice 25.2.3.2), the native verify `passed: false` in both themes on the three misses B2 named plus `lines#decorated` and both tables, which the same command on the same image did not repeat afterwards (section 7, finding 24)              |

The fifteen specs of step 21 (`verification-2/check/check-from-21.log`): `ten-tasks.spec.ts` 12 of 12 (task 5 in 14.8 s, the budgeted step), `text-editing.spec.ts` 6 of 6 ("Enter … commits in a heading" included), `filmstrip.spec.ts`, `home.spec.ts`, `landing.spec.ts`, `gslides-actions.spec.ts` (4 of 4, the fix round's Arrange test included), `deck-transfer.spec.ts`, `hygiene.spec.ts`, `export-batch.spec.ts` (the 27 slide fixture in 9 batches at `TURBOSLIDE_EXPORT_BATCH=3`) pass; `present.spec.ts` fails one test (`data-total` "26" for "6", finding 27); `canvas.spec.ts` fails at its bring to front step (19 writes expected, 18 read, then a 30 s predicate timeout); `charts.spec.ts` fails on the inserted chart's `pos.y` (184 for 180, finding 26); `objects.spec.ts` fails selecting the rotated text box (`handle.text.move` not visible); `tables.spec.ts` fails on a strict mode violation (two elements for `table/rows/1/cells/1`); `text-styles.spec.ts` fails on the painted heading's marks; the six tests that did not run are the siblings of the failed serial tests. Rerun alone on the verifier's server after the chain (`verification-2/check/e2e-six-rerun.log`): `canvas.spec.ts` hangs ten minutes in `version.list` at line 368, `charts.spec.ts` and `objects.spec.ts` fail the same way, `present.spec.ts` fails two tests (the total and `?screen=1`), `tables.spec.ts` fails its first test (24 cell runs for 12), `text-styles.spec.ts` fails its first (5 writes for 6). Finding 28 has the reading.

## 3. The parity audit (task item 1, SPEC-2 11.1 step 20)

`scripts/gslides-parity-audit.mjs` is pass 1's extension of the round one audit to the round two
rows: every row of SPEC-2 section 4 (the flipped rows, the dynamic submenus and their children,
the new tails and context menus, the chords of section 9), the Format options sections per
selection type (section 5), the picker picks writing their actions, and the object states of 6.1
(a text block, a shape, a line, a picture, a table cell, a chart, a group, a covering picture
object and a guide). Pass 2 added six observers the first full run showed missing (section 12
names them) and changed nothing in what a row must do. The coverage check over the model: all 270
`now` rows of `packages/chrome/src/menus/model.ts` (338 rows: 270 Now, 22 Later, 46 Omit) are
read by id in the report, in every audited state.

The full run against the verifier's server (every phase, the tooltip audit included; the report at
`verification-2/parity-audit.json`, the log at `verification-2/audit/parity-audit-local.log`):
**2,128 pass, 7 fail, 382 skipped in 491 s, exit 1**. The first full run of the pass
(`audit/parity-audit-local-run1.json`, 634 s) read 2,117 pass and 18 fail; eleven of the eighteen
were the script's own observers (Show ruler alternates its label instead of `aria-checked`; the
word art insert converts a Title slide, so the block count grows by four; GitHub answers
`/issues/new` with a login redirect carrying the URL in `return_to`; the four legacy shape rows are
drawn as plate tiles; Curve and Polyline take a click per point and Enter, Scribble a drag; an
object is taken by its frame corner, because a click 12 px inside a shape with text places the
caret) and were fixed in the script, not the product. The seven that remain are the product's:

| Section                 | Row                                         | Evidence                                                                                                                                                                               | Finding |
| ----------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `effects:textBlock2`    | `format.dropShadow` on a paragraph          | Format options opened; section `shadow` absent                                                                                                                                         | 10 (B3) |
| `toolbar:objects`       | `group.chip`, `toolbar.group`, `group.ring` | after Arrange > Group of the shape and the line and a click on the shape: chip "Shape", the shape tail, no `role="group"` ring (the shape holds a Text, so the click enters the caret) | 17 (B4) |
| `contextMenu:objects`   | `group`                                     | the shape's menu, not the group's                                                                                                                                                      | 17 (B4) |
| `formatOptions:objects` | `sections.group`                            | the shape's sections (Shape shown; Size and Position alone wanted)                                                                                                                     | 17 (B4) |
| `effects:objects`       | `arrange.regroup`                           | no write (the ungrouped set was never a group selection)                                                                                                                               | 17 (B4) |

The rows pass 1 listed as findings 5, 6 and 7 pass now: `rows:twoObjects` reads Group, Ungroup,
Regroup, Align and Distribute enabled and Insert > Link disabled with two objects selected;
`effects:shape format.changeShape` picks `hexagon` from the right-click plate and writes
`shape.set` (rectangle to hexagon); `effects:shape arrange.align.bottom` lands the bottom edge at
900 (`pos.y` 780). `key.selectAll` passes in the audit because the audited object is the slide's
first (finding 18 explains why the walk's fails). The guide's right-click menu opens with Delete
guide and Edit guides and Delete guide writes `deck.guides` (pass 1's two timeouts there were the
script's). The default view words (35 checks), the retired keys (14 on the scratch deck and 14 on
`gt-brand`), the shortcuts (27 on the scratch deck, 10 on objects, 7 on a text range) and the
tooltip audit (`scripts/tooltip-audit.mjs --strict` on `/new`, `/edit/<scratch>` and `/decks`)
pass. The scratch deck was trashed and deleted through the product at the end; `decks/` holds no
`untitled-*`.

Totals per menu, the `now` rows enabled and observed in each state (`x/y (n unreachable)`: y rows
audited, n disabled by their predicate in that state and reported as skipped):

| State      | title | file  | edit  | view  | insert    | format     | slide | arrange   | tools | extensions | help |
| ---------- | ----- | ----- | ----- | ----- | --------- | ---------- | ----- | --------- | ----- | ---------- | ---- |
| scratch    | 8/8   | 27/27 | 11/11 | 30/30 | 33/33 (4) | 66/66 (33) | 12/12 | 8/8 (18)  | 14/14 | 2/2        | 4/4  |
| textBlock  | 8/8   | 27/27 | 11/11 | 30/30 | 33/33 (4) | 75/75 (24) | 12/12 | 25/25 (2) | 14/14 | 2/2        | 4/4  |
| shape      | 8/8   | 27/27 | 11/11 | 30/30 | 33/33 (4) | 75/75 (24) | 12/12 | 24/24 (2) | 14/14 | 2/2        | 4/4  |
| image      | 8/8   | 27/27 | 11/11 | 30/30 | 33/33 (4) | 75/75 (24) | 12/12 | 24/24 (2) | 14/14 | 2/2        | 4/4  |
| twoObjects | 8/8   | 27/27 | 11/11 | 30/30 | 33/33 (4) | 75/75 (24) | 12/12 | 24/24 (2) | 14/14 | 2/2        | 4/4  |
| gt-brand   | 8/8   | 27/27 | 11/11 | 30/30 | 33/33 (4) | 66/66 (33) | 12/12 | 8/8 (18)  | 14/14 | 2/2        | 4/4  |

Every Later row is present, disabled and carries the stub sentence (2/2, 3/3, 2/2, 5/5, 1/1, 2/2,
2/2 per menu in every state); every Omit row is absent by id and label (7, 8, 6, 7, 8, 6, 4). The
Format options sections per selection type (`formatOptions:objects`): text `size, position,
layout, textFitting, text, altText`; shape adds `colour, shadow, shape, block`; line `size,
position, layout, shadow, line, altText`; image `size, position, layout, picture, adjustments,
shadow, altText`; table `size, position, layout, textFitting, text, shadow, table, altText`; chart
`size, position, shadow, chart, altText`, all in SPEC-2 section 5's order and with no section the
type must not show; the group row is finding 17's. The same rows list the generated controls
without the Tooltip primitive (finding 22).

## 4. The canvas walk (task item 4, SPEC-2 11.8)

`docs/gslides-parity/verification-2/canvas-walk.mjs` (the verifier's, pass 1's script run to its
end for the first time in this pass and corrected where it drove the product wrong: the `lint.run`
input, the shape plate's tile ids, a picture whose east edge lies past the 1440 px viewport resized
by its west handle, the marquee started on empty sheet, the guide line sampled on the last step of
the drag, the copy validated by the CLI because `validate.run` has no window handler, the
committed deck compared by content). Chrome for Testing at 1440 by 900 through `packages/headless`
launch, one page, on the verifier's server; the GT deck copied through `deck.copy` (the committed
deck is never written), every gesture followed by a read of the server's version log:
**40 of 43 steps pass in 39 s**, 19 screenshots under `verification-2/canvas-walk/`, the report at
`canvas-walk/canvas-walk.json`, no page error. The three misses are findings 17, 18 and 19.

| Slide                  | Step                                             | Result | Evidence                                                                                                                                                                                                                                                      |
| ---------------------- | ------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `opener-brand`         | drag picture                                     | pass   | 1 write; first mutation slide.replace (kind opener -> content, layout freeform, grammar opener, 5 objects); pos {"x":0,"y":0,"w":1600,"h":900,"z":0} -> {"x":57,"y":40,"w":1600,"h":900,"z":0}; snap guides sampled 1                                         |
| `opener-brand`         | picture object at the bottom                     | pass   | picture {"x":57,"y":40,"w":1600,"h":900,"z":0} type picture side lower-left                                                                                                                                                                                   |
| `opener-brand`         | off-sheet finding at severity 2                  | pass   | 1 freeform/off-sheet finding(s) [2]                                                                                                                                                                                                                           |
| `opener-brand`         | resize picture                                   | pass   | 1 write; w 1600 -> 1680 (w handle); size readout "1680 × 900"                                                                                                                                                                                                 |
| `opener-brand`         | bring forward (Cmd+Up)                           | pass   | 1 write; z 0 -> 1                                                                                                                                                                                                                                             |
| `opener-brand`         | send to back (Cmd+Shift+Down)                    | pass   | 1 write; z 1 -> 0 (lowest 0)                                                                                                                                                                                                                                  |
| `opener-brand`         | click the plate while the photograph is selected | FAIL   | chip "Box" (wanted Group: the plate is a group tagged plate)                                                                                                                                                                                                  |
| `opener-brand`         | drag the plate (group)                           | pass   | 1 write; chip "Group"; 4 members moved together true; snap guides sampled 1                                                                                                                                                                                   |
| `opener-brand`         | rotate h                                         | pass   | 1 write; rotate 15; angle readout "15°"                                                                                                                                                                                                                       |
| `mood-earth`           | crop the picture                                 | FAIL   | 1 write(s) on entering crop mode, 1 on Enter (first mutation block.set); chip "Drag the handles to crop. Press Enter to finish"; trim {"left":0.1,"right":0,"top":0,"bottom":0}                                                                               |
| `title`                | drag heading                                     | pass   | 1 write; first mutation slide.replace (kind title -> content, layout freeform, grammar title, 3 objects); pos {"x":137,"y":420.4375,"w":901.453125,"h":89.75,"z":1} -> {"x":176,"y":446,"w":901.453125,"h":89.75,"z":1}; snap guides sampled 2                |
| `title`                | drag mark                                        | pass   | 1 write; mark {"x":137,"y":288.4375,"w":132,"h":84,"z":0} -> {"x":176,"y":312,"w":132,"h":84,"z":0}                                                                                                                                                           |
| `thesis`               | drag big                                         | pass   | 1 write; first mutation slide.replace (kind statement -> content, layout freeform, grammar statement, 1 objects); pos {"x":311.15625,"y":411.84375,"w":977.6875,"h":76.3125,"z":0} -> {"x":347,"y":436,"w":977.6875,"h":76.3125,"z":0}; snap guides sampled 1 |
| `books-and-templates`  | drag p1                                          | pass   | 1 write; first mutation slide.replace (kind content -> content, layout freeform, grammar content, 3 objects); pos {"x":137,"y":195.390625,"w":1326,"h":66,"z":1} -> {"x":173,"y":219,"w":1326,"h":66,"z":1}; snap guides sampled 1                            |
| `books-and-templates`  | draw a rectangle                                 | pass   | 1 write; shape shape rect at {"x":900,"y":520,"w":220,"h":140,"z":3}                                                                                                                                                                                          |
| `books-and-templates`  | rotate shape                                     | pass   | 1 write; rotate 15; angle readout "15°"                                                                                                                                                                                                                       |
| `books-and-templates`  | draw an ellipse                                  | pass   | 1 write; shape shape-2 ellipse at {"x":1280,"y":520,"w":200,"h":140,"z":4}                                                                                                                                                                                    |
| `books-and-templates`  | draw an elbow connector between the shapes       | pass   | 1 write; connector shape-3 elbow connect {"start":{"block":"shape","site":3},"end":{"block":"shape-2","site":1}}; sites sampled while drawing 8                                                                                                               |
| `books-and-templates`  | move a shape, the connector follows              | pass   | 1 write with 2 mutation(s) on shape-3; connector pos {"x":1120,"y":590,"w":160,"h":1,"z":5} -> {"x":1056,"y":590,"w":224,"h":40,"z":5}                                                                                                                        |
| `books-and-templates`  | marquee from empty sheet                         | pass   | chip "4 objects"; no write                                                                                                                                                                                                                                    |
| `books-and-templates`  | Cmd+A selects every object                       | FAIL   | chip "null" over 6 objects                                                                                                                                                                                                                                    |
| `books-and-templates`  | group two objects (Cmd+Option+G)                 | pass   | 1 write; group group                                                                                                                                                                                                                                          |
| `books-and-templates`  | move the group                                   | pass   | 1 write; chip "Group"; both members moved by -36.00, -30.00                                                                                                                                                                                                   |
| `books-and-templates`  | View > Show ruler                                | pass   | rulers 2; numerals 14 and 8                                                                                                                                                                                                                                   |
| `books-and-templates`  | drag a guide out of the ruler                    | pass   | 1 write; guides {"x":[600],"y":[]} (was null); guide line drawn true; readout while dragging "5.00 in"                                                                                                                                                        |
| `books-and-templates`  | snap to the guide                                | pass   | 1 write; p1.x 173 -> 600 (guide at 600); snap lines sampled while dragging 1                                                                                                                                                                                  |
| `books-and-templates`  | zoom to 200 percent and pan                      | pass   | sheet 1130 -> 3202 px wide; Zoom box "200%"; scrollable true; Space+drag scrollLeft 1036 -> 1236                                                                                                                                                              |
| `books-and-templates`  | duplicate (Cmd+D)                                | pass   | 1 write; objects 6 -> 8; copy shape-2-2 at {"x":1260,"y":506,"w":200,"h":140,"z":6,"group":"group-2"}                                                                                                                                                         |
| `books-and-templates`  | Tab through objects                              | pass   | selection p1 -> pair -> shape -> shape-2; z order h, p1, pair, shape, shape-2, shape-3, shape-2-2, shape-2-3                                                                                                                                                  |
| `books-and-templates`  | Align > Left with one object aligns to the slide | pass   | 1 write; p1.x 0                                                                                                                                                                                                                                               |
| `books-and-templates`  | Center on page > Horizontally                    | pass   | 1 write; centre 800                                                                                                                                                                                                                                           |
| `opener-prototemplate` | drag picture                                     | pass   | 1 write; first mutation slide.replace (kind opener -> content, layout freeform, grammar opener, 5 objects); pos {"x":0,"y":0,"w":1600,"h":900,"z":0} -> {"x":57,"y":35,"w":1600,"h":900,"z":0}; snap guides sampled 2                                         |
| `opener-prototemplate` | resize picture                                   | pass   | 1 write; w 1600 -> 1680 (w handle); size readout "1680 × 900"                                                                                                                                                                                                 |
| `opener-prototemplate` | the shader re-mounts at the object box           | pass   | live canvas 1184x634 vs wrapper 1184x634; pos {"x":-23,"y":35,"w":1680,"h":900,"z":0} (ratio 1.867)                                                                                                                                                           |
| `deck`                 | untouched slides byte identical                  | pass   | 79 slides compared; 0 differ                                                                                                                                                                                                                                  |
| `deck`                 | the committed GT deck is not written             | pass   | 98 files of decks/gt-brand unchanged by the walk (0 changed); git status lists 24 path(s) there from before the walk (the fix round's re-import); 85 slides in the copy                                                                                       |
| `deck`                 | the copy validates (turboslide validate)         | pass   | exit 0: verifier-canvas-mtzer06t: 85 slides, 0 error(s), 46 warning(s)                                                                                                                                                                                        |
| `deck`                 | lint on the walked slides                        | pass   | 0 findings above severity 2; layout/freeform on 6 of 6 walked slides, sentence "This slide is arranged by hand; Apply layout re-flows it"                                                                                                                     |
| `cli`                  | to-canvas opener-brand equals the editor         | pass   | 5 objects identical (1.6 s for 5 ids, one launch)                                                                                                                                                                                                             |
| `cli`                  | to-canvas title equals the editor                | pass   | 3 objects identical (1.6 s for 5 ids, one launch)                                                                                                                                                                                                             |
| `cli`                  | to-canvas thesis equals the editor               | pass   | 1 objects identical (1.6 s for 5 ids, one launch)                                                                                                                                                                                                             |
| `cli`                  | to-canvas opener-prototemplate equals the editor | pass   | 5 objects identical (1.6 s for 5 ids, one launch)                                                                                                                                                                                                             |
| `cli`                  | to-canvas books-and-templates equals the editor  | pass   | 3 objects identical (1.6 s for 5 ids, one launch)                                                                                                                                                                                                             |

The conversions the walk recorded (`canvas-walk/<slideId>.conversion.json`, the `pos` of every
object of the five slides converted by a drag) against `turboslide slide to-canvas
opener-brand,title,thesis,opener-prototemplate,books-and-templates --deck <fresh copy> --json`
(one browser launch for the five ids, 1.6 s): identical on every object of every slide (5, 3, 1, 5
and 3 objects), the 1/64 px values included (`title` heading `{ x: 137, y: 420.4375,
w: 901.453125, h: 89.75, z: 1 }`). This is SPEC-2 1.3's identity in Chromium, and task item 5's
comparison.

## 5. The conversion, kind by kind

What the walk's first gesture on each kind wrote (the `slide.replace` at the head of the one
`slide.update`, then the gesture's `block.set /pos`):

| Slide                  | Kind before | Objects after                                                                                                                              | The gesture and its write                                                                                                                     |
| ---------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `opener-brand`         | opener      | `picture` at `0,0,1600,900` z 0 (`side: lower-left`), the `plate` box z 1 and `h`, `p1`, `credit` z 2 to 4, all five tagged `group: plate` | the photograph dragged 60, 40: `pos` 57, 40 (snapped), one write, `freeform/off-sheet` at 2                                                   |
| `mood-earth`           | mood        | the same five objects                                                                                                                      | a double click into crop mode, then the west crop handle and Enter (finding 19)                                                               |
| `title`                | title       | `mark` z 0, `heading` z 1, `lead` z 2 at the measured boxes (1/64 px)                                                                      | the heading dragged 40, 24: `pos` 137, 420.4375 to 176, 446; then the mark dragged                                                            |
| `thesis`               | statement   | `big` z 0 at `311.15625, 411.84375, 977.6875, 76.3125` (the resolved measure)                                                              | the big line dragged 40, 24                                                                                                                   |
| `books-and-templates`  | content     | `h`, `p1`, `pair` z 0 to 2 (`grammar.kind` content, `template` cols)                                                                       | `p1` dragged 40, 24; then the shapes, the connector, the group, the guide, the zoom                                                           |
| `opener-prototemplate` | opener      | the picture object whose asset is the liquid metal material                                                                                | dragged 60, 40, then widened 80 px by the west handle: the shader canvas re-mounts at the new box (1184 by 634 CSS px, ratio 1.867, off 16:9) |

Every slide the walk did not touch (79 of 85) reads back byte identical (canonical JSON) with its
committed file; the 98 JSON files of `decks/gt-brand` are unchanged by the walk (the 24 paths
`git status` lists there are the fix round's re-import, present before the walk); the copy
validates (85 slides, 0 errors, 46 warnings, the `ext` notes); `lint.run` on the six walked slides
reports nothing above severity 2 and `layout/freeform` at 1 on each with the sentence "This slide
is arranged by hand; Apply layout re-flows it".

## 6. The local agent walk (task item 5, SPEC-2 section 3)

`docs/gslides-parity/verification-2/agent-walk.mjs` (the verifier's; pass 2 fixed six of its
expectations that read the schema or a no-op wrong, section 12) runs every round two command through
`turboslide <command> --json --deck <temp copy of decks/fixture/gslides>` with `turboslide validate`
after each write, then the round two tools over a `turboslide mcp` stdio server on a second copy.
Report `verification-2/agent-walk/agent-walk.json`, log `agent-walk/agent-walk.log`; the copies
lived in a temp directory and were removed. **CLI 47 of 47 pass; MCP 39 of 40 pass**, the one
miss being finding 16 (the tool list over the stock client's buffer); an earlier run's
`deck_distribute_table` miss was the walk's own choice of rows that carry no height (a no-op by
the action's rule) and the final script passes `total`, as the CLI form does. Every canvas write on the CLI opens one
headless sheet page; on the idle third run (`agent-walk/agent-walk-run3.log`): `slide to-canvas
title` 2.1 s, `block set styles#h /pos` on a grammar slide 1.5 s (the slide converted in the same
revision, every object positioned), `diagram insert autofit --kind process --count 4` 1.4 s
(converted, nine objects in one group), `slide set-layout background-color --type freeform` 1.4 s
(`grammar.layout` stack kept), `block insert title --pos` 0.8 s, the median plain write 0.69 s
(the cost SPEC-2 0.104 asked B1 to record); the final run, made while the preview audit and a
container verify loaded the machine, read 9.2, 9.9, 7.8, 7.1 and 4.4 s for the same five, so the
table below carries load numbers and the idle run's are the cost.

| Command                                                                                              | Result | Time    | Evidence                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------- | ------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `turboslide slide to-canvas title --json`                                                            | pass   | 9188 ms | exit 0 in 9188 ms; revision 1 -> 2; converted true; template title; grammar title; pos within 1 px of the committed canvas-title true, exact false (th |
| `turboslide slide measure styles --json`                                                             | pass   | 9318 ms | exit 0 in 9318 ms; revision 2 -> 2; boxes for h, p1, justified; fit for 3 blocks; revision unchanged true                                              |
| `turboslide block insert title --slot main --pos 200,200,480,64 --file <tmp> --json`                 | pass   | 4442 ms | exit 0 in 4442 ms; revision 2 -> 3; note at {"x":200,"y":200,"w":480,"h":64,"z":3} (z one above the highest)                                           |
| `turboslide block set styles#h /pos {"x":137,"y":129,"w":600,"h":80} --json`                         | pass   | 9886 ms | exit 0 in 9886 ms; revision 3 -> 4; styles converted in one revision (4); h at {"x":137,"y":129,"w":600,"h":80}; every object positioned               |
| `turboslide block rotate rotated#tilted --by 90 --json`                                              | pass   | 4912 ms | exit 0 in 4912 ms; revision 4 -> 5; tilted rotate 37 -> 127                                                                                            |
| `turboslide block flip rotated#arrow --axis h --json`                                                | pass   | 3406 ms | exit 0 in 3406 ms; revision 5 -> 6; arrow flip h -> none                                                                                               |
| `turboslide block group shapes --blocks hex,right --as pair --json`                                  | pass   | 3636 ms | exit 0 in 3636 ms; revision 6 -> 7; hex and right carry group pair                                                                                     |
| `turboslide block ungroup shapes --group pair --json`                                                | pass   | 3557 ms | exit 0 in 3557 ms; revision 7 -> 8; groups left: 0                                                                                                     |
| `turboslide block regroup shapes --blocks hex,right --as pair --json`                                | pass   | 3665 ms | exit 0 in 3665 ms; revision 8 -> 9; hex group pair                                                                                                     |
| `turboslide block order rotated#photo --move back --json`                                            | pass   | 3695 ms | exit 0 in 3695 ms; revision 9 -> 10; photo z 0 (lowest 0)                                                                                              |
| `turboslide deck guides --add-vertical 400 --json`                                                   | pass   | 3640 ms | exit 0 in 3640 ms; revision 10 -> 11; guides {"x":[400,800],"y":[450]}                                                                                 |
| `turboslide deck guides --clear --json`                                                              | pass   | 3640 ms | exit 0 in 3640 ms; revision 11 -> 12; guides null                                                                                                      |
| `turboslide text style styles#p1 /text --range 0:4 --italic --color red --json`                      | pass   | 3538 ms | exit 0 in 3538 ms; revision 12 -> 13; text "[A ru]{i c:red}n in [italic]{i}, one [underlined]{u}, one [s"                                              |
| `turboslide text list bullets#bullets --marker bullet --items 0 --level 4 --json`                    | pass   | 3582 ms | exit 0 in 3582 ms; revision 13 -> 14; marker bullet; item 0 level 4                                                                                    |
| `turboslide text spacing styles#p1 --line 1.5 --json`                                                | pass   | 4051 ms | exit 0 in 4051 ms; revision 14 -> 15; typography {"leading":1.5}                                                                                       |
| `turboslide text columns styles#p1 2 --json`                                                         | pass   | 3490 ms | exit 0 in 3490 ms; revision 15 -> 16; columns 2                                                                                                        |
| `turboslide text indent styles#p1 --in --json`                                                       | pass   | 3180 ms | exit 0 in 3180 ms; revision 16 -> 17; indent 64                                                                                                        |
| `turboslide text case styles#p1 /text --range 0:5 upper --json`                                      | pass   | 3559 ms | exit 0 in 3559 ms; revision 17 -> 18; text "[A RU]{i c:red}N in [italic]{i}, one [un"                                                                  |
| `turboslide text insert styles#p1 /text --at 2 → --json`                                             | pass   | 3785 ms | exit 0 in 3785 ms; revision 18 -> 19; text "[A →RU]{i c:red}N in [italic]{i}, one [u"                                                                  |
| `turboslide chart set-data chart-bar#chart --file <tmp> --json`                                      | pass   | 3730 ms | exit 0 in 3730 ms; revision 19 -> 20; categories ["North","South"]; series 1                                                                           |
| `turboslide chart set-kind chart-bar#chart pie --json`                                               | pass   | 4083 ms | exit 0 in 4083 ms; revision 20 -> 21; kind pie                                                                                                         |
| `turboslide table merge table#table --from 1,1 --to 2,2 --json`                                      | pass   | 3358 ms | exit 0 in 3358 ms; revision 21 -> 22; spans [{"row":1,"column":1,"rows":2,"columns":2}]                                                                |
| `turboslide table unmerge table#table --at 1,1 --json`                                               | pass   | 3373 ms | exit 0 in 3373 ms; revision 22 -> 23; spans []                                                                                                         |
| `turboslide table insert-rows table#table --at 1 --count 2 --below --json`                           | pass   | 3511 ms | exit 0 in 3511 ms; revision 23 -> 24; rows 6                                                                                                           |
| `turboslide table delete-columns table#table --from 3 --to 3 --json`                                 | pass   | 3775 ms | exit 0 in 3775 ms; revision 24 -> 25; columns 3                                                                                                        |
| `turboslide table distribute table#table rows --total 320 --json`                                    | pass   | 3511 ms | exit 0 in 3511 ms; revision 25 -> 26; row heights [53,53,53,53,53,53]                                                                                  |
| `turboslide table cell-style table#table --at 0,0 --border-weight 0 --json`                          | pass   | 3489 ms | exit 0 in 3489 ms; revision 26 -> 27; cells [{"row":0,"column":0,"border":{"weight":0}}]                                                               |
| `turboslide shape set shapes#hex --kind hexagon --dash dot --json`                                   | pass   | 3403 ms | exit 0 in 3403 ms; revision 27 -> 28; shape hexagon dash dot                                                                                           |
| `turboslide line set lines#decorated --end fillArrow --json`                                         | pass   | 3186 ms | exit 0 in 3186 ms; revision 28 -> 29; lineEnd fillArrow                                                                                                |
| `turboslide line set lines#decorated --connect-end b:2 --json`                                       | pass   | 3559 ms | exit 0 in 3559 ms; revision 29 -> 30; connect {"end":{"block":"b","site":2}}; pos {"x":137,"y":236,"w":600,"h":8,"z":1} -> {"x":137,"y":240,"w":683,"h |
| `turboslide block set lines#b /pos {"x":760,"y":540,"w":240,"h":120,"z":3} --json`                   | pass   | 3026 ms | exit 0 in 3026 ms; revision 30 -> 31; decorated {"x":137,"y":240,"w":683,"h":380,"z":1} -> {"x":137,"y":240,"w":743,"h":420,"z":1}; the fixture's elbo |
| `turboslide block crop image-tools#trimmed --left 0.1 --right 0 --top 0 --bottom 0 --json`           | pass   | 2936 ms | exit 0 in 2936 ms; revision 31 -> 32; trim {"left":0.1,"right":0,"top":0,"bottom":0}                                                                   |
| `turboslide block mask image-tools#adjusted ellipse --json`                                          | pass   | 3114 ms | exit 0 in 3114 ms; revision 32 -> 33; mask ellipse                                                                                                     |
| `turboslide block adjust image-tools#masked --brightness 0.2 --json`                                 | pass   | 3070 ms | exit 0 in 3070 ms; revision 33 -> 34; adjust {"brightness":0.2}                                                                                        |
| `turboslide block reset-image image-tools#trimmed --json`                                            | pass   | 3073 ms | exit 0 in 3073 ms; revision 34 -> 35; trim null mask none                                                                                              |
| `turboslide block alt shapes#hex A hexagon --json`                                                   | pass   | 3104 ms | exit 0 in 3104 ms; revision 35 -> 36; alt "A hexagon"                                                                                                  |
| `turboslide block shadow shapes#hex --on --json`                                                     | pass   | 2974 ms | exit 0 in 2974 ms; revision 36 -> 37; shadow {}                                                                                                        |
| `turboslide block autofit canvas-title#shrink shrink --apply --json`                                 | pass   | 6921 ms | exit 0 in 6921 ms; revision 37 -> 38; autofit shrink; size 26 -> 24 (the ladder stepped down in the same revision)                                     |
| `turboslide block set canvas-title#padded /valign middle --json`                                     | pass   | 3785 ms | exit 0 in 3785 ms; revision 38 -> 39; valign middle                                                                                                    |
| `turboslide block set canvas-title#padded /padding {"top":8,"right":16,"bottom":8,"left":16} --json` | pass   | 3021 ms | exit 0 in 3021 ms; revision 39 -> 40; padding {"top":8,"right":16,"bottom":8,"left":16}                                                                |
| `turboslide slide background styles --color plate --json`                                            | pass   | 3146 ms | exit 0 in 3146 ms; revision 40 -> 41; background {"color":"plate"}                                                                                     |
| `turboslide deck background --color plate --json`                                                    | pass   | 3068 ms | exit 0 in 3068 ms; revision 41 -> 42; defaults.background {"color":"plate"}                                                                            |
| `turboslide diagram insert autofit --kind process --count 4 --json`                                  | pass   | 7752 ms | exit 0 in 7752 ms; revision 42 -> 43; autofit converted (freeform); 13 objects; groups process                                                         |
| `turboslide slide set-layout background-color --type freeform --json`                                | pass   | 7131 ms | exit 0 in 7131 ms; revision 43 -> 44; layout freeform; grammar {"type":"stack","gap":22}; 2 objects positioned                                         |
| `turboslide info --json`                                                                             | pass   | 2661 ms | exit 0 in 2661 ms; revision 44 -> 44; counts {"slides":27,"sections":2,"assets":1,"kinds":{"content":26,"statement":1},"canvas":17,"charts":3,"guides" |
| `turboslide slides --json`                                                                           | pass   | 3047 ms | exit 0 in 3047 ms; revision 44 -> 44; 17 canvas slides of 27; e.g. {"id":"title","n":1,"section":"Fixture","sectionId":"fixture","title":"Export fixtu |
| `turboslide lint all --json`                                                                         | pass   | 3255 ms | exit 0 in 3255 ms; revision 44 -> 44; 44 findings, 0 at severity 3                                                                                     |

The MCP half: with the SDK's stock stdio client (`@modelcontextprotocol/sdk` 1.30.0, its
`StdioClientTransport` at the default 10 MB read buffer) the session dies on `tools/list`
(`McpError -32000: Connection closed` after `ReadBuffer exceeded maximum size of 10485760 bytes`,
finding 16); reconnected with a 64 MB buffer the list is 81 tools and 25.9 MB of JSON, and the 36
round two tools are served and run:

| Tool                                                        | Result | Evidence                                                                                                                |
| ----------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------- |
| `tools/list fits the stock client buffer (10 MB)`           | FAIL   | McpError: MCP error -32001: Request timed out; transport errors:                                                        |
| `tools/list over a 64 MB buffer (the walk continues on it)` | pass   | 81 tools; the JSON of the list is 25.9 MB                                                                               |
| `the 36 round two tools are served`                         | pass   | 81 tools; missing none                                                                                                  |
| `deck_slide_to_canvas`                                      | pass   | 1424 ms; isError false; revision 1 -> 2; title converted; heading {"x":137,"y":420.4375,"w":901.453125,"h":89.75,"z":1} |
| `deck_set_guides`                                           | pass   | 12 ms; isError false; revision 2 -> 3; guides {"x":[400,800],"y":[450]}                                                 |
| `deck_rotate_block`                                         | pass   | 62 ms; isError false; revision 3 -> 4; rotate 52                                                                        |
| `deck_flip_block`                                           | pass   | 67 ms; isError false; revision 4 -> 5; flip hv                                                                          |
| `deck_group_blocks`                                         | pass   | 63 ms; isError false; revision 5 -> 6; group pair                                                                       |
| `deck_ungroup_blocks`                                       | pass   | 66 ms; isError false; revision 6 -> 7; group none                                                                       |
| `deck_regroup_blocks`                                       | pass   | 70 ms; isError false; revision 7 -> 8; group pair                                                                       |
| `deck_style_text`                                           | pass   | 72 ms; isError false; revision 8 -> 9; text "[A ru]{u}n in [italic]{i}, one [underlined]{u}, on"                        |
| `deck_set_case`                                             | pass   | 65 ms; isError false; revision 9 -> 10; text "[A RU]{u}N in [italic]{i}, one"                                           |
| `deck_insert_text`                                          | pass   | 62 ms; isError false; revision 10 -> 11; text "[A→ RU]{u}N in [italic]{i}, on"                                          |
| `deck_set_list`                                             | pass   | 68 ms; isError false; revision 11 -> 12; marker number preset digit-alpha-roman                                         |
| `deck_set_spacing`                                          | pass   | 61 ms; isError false; revision 12 -> 13; typography {"spaceBefore":8}                                                   |
| `deck_set_columns`                                          | pass   | 62 ms; isError false; revision 13 -> 14; columns 2                                                                      |
| `deck_indent_text`                                          | pass   | 66 ms; isError false; revision 14 -> 15; indent 64                                                                      |
| `deck_set_chart_data`                                       | pass   | 68 ms; isError false; revision 15 -> 16; categories ["A","B"]                                                           |
| `deck_set_chart_kind`                                       | pass   | 65 ms; isError false; revision 16 -> 17; kind line                                                                      |
| `deck_merge_cells`                                          | pass   | 71 ms; isError false; revision 17 -> 18; spans [{"row":1,"column":1,"rows":2,"columns":2}]                              |
| `deck_unmerge_cells`                                        | pass   | 63 ms; isError false; revision 18 -> 19; spans 0                                                                        |
| `deck_insert_rows`                                          | pass   | 57 ms; isError false; revision 19 -> 20; rows 5                                                                         |
| `deck_insert_columns`                                       | pass   | 57 ms; isError false; revision 20 -> 21; columns 5                                                                      |
| `deck_delete_rows`                                          | pass   | 57 ms; isError false; revision 21 -> 22; rows 4                                                                         |
| `deck_delete_columns`                                       | pass   | 58 ms; isError false; revision 22 -> 23; columns 4                                                                      |
| `deck_distribute_table`                                     | pass   | 58 ms; isError false; revision 23 -> 24; row heights [80,80,80,80]                                                      |
| `deck_style_cells`                                          | pass   | 58 ms; isError false; revision 24 -> 25; cells [{"row":0,"column":0,"fill":"plate"}]                                    |
| `deck_set_shape`                                            | pass   | 60 ms; isError false; revision 25 -> 26; dash dash                                                                      |
| `deck_set_line`                                             | pass   | 61 ms; isError false; revision 26 -> 27; lineEnd openDiamond                                                            |
| `deck_crop_image`                                           | pass   | 58 ms; isError false; revision 27 -> 28; trim {"left":0.2,"right":0,"top":0,"bottom":0}                                 |
| `deck_mask_image`                                           | pass   | 58 ms; isError false; revision 28 -> 29; mask hexagon                                                                   |
| `deck_adjust_image`                                         | pass   | 58 ms; isError false; revision 29 -> 30; adjust {"contrast":0.3}                                                        |
| `deck_reset_image`                                          | pass   | 59 ms; isError false; revision 30 -> 31; trim null                                                                      |
| `deck_set_alt_text`                                         | pass   | 86 ms; isError false; revision 31 -> 32; alt "An arrow"                                                                 |
| `deck_set_shadow`                                           | pass   | 67 ms; isError false; revision 32 -> 33; shadow {"opacity":0.3,"angle":45}                                              |
| `deck_set_autofit`                                          | pass   | 922 ms; isError false; revision 33 -> 34; autofit shrink; size 26 -> 24                                                 |
| `deck_set_slide_background`                                 | pass   | 57 ms; isError false; revision 34 -> 35; background {"color":"plate"}                                                   |
| `deck_set_background`                                       | pass   | 9 ms; isError false; revision 35 -> 36; defaults.background {"color":"ink"}                                             |
| `deck_insert_diagram`                                       | pass   | 960 ms; isError false; revision 36 -> 37; autofit converted; 11 objects                                                 |
| `the MCP copy validates after every tool`                   | pass   | validate exit 0; revision 37                                                                                            |

## 7. The exports and the container (task item 6, SPEC-2 11.3)

Local, from the merged tree (check step 22 in `verification-2/check/check-from-22.log`; the PDF
in `verification-2/export/pdf.log`):

| Export                                                                                   | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `turboslide export decks/fixture/gslides --mode native --out .turboslide/gs-native`      | 26 slides in light and dark (the fixture's 27th, `skipped`, left out), geometry in bounds, `passed: true`, 146 parts, 15.9 s; `export check` valid on both files: 200 shapes, 0 out of bounds, 26 of 26 titles, and the round two line "1 italic run(s), 6 rotated, 16 group(s), 3 chart part(s), 4 attached connector(s), 1 numCol, 1 avLst, 2 table(s) with 3 merged cell(s)"; python-pptx reopens 26 slides and 166 shapes; 173 relationships, 0 invalid |
| `turboslide export decks/fixture/gslides --mode flatten --out .turboslide/gs-flatten`    | `perfect: true` on both files (the step's own assertion), `export check` valid; step 22 ok in 44.8 s for the four commands                                                                                                                                                                                                                                                                                                                                  |
| `turboslide export decks/fixture/gslides --format pdf --verify --out .turboslide/gs-pdf` | 26 pages at 960 by 540 pt (13.333 by 7.5 in), 847,969 bytes, `passed: true`; the gate at 3200 by 1800 against the 2x render: 25 pages under the 0.1 percent target, page 14 (`word-art`) at 0.103 percent (under the 0.5 fail line, the residual B2 recorded), pictures on 5 pages compared apart (worst `shadow` 3.450 percent inside its boxes); `verification-2/export/pdf.log`                                                                          |
| `node scripts/compare-to-shoot.mjs --deck decks/gt-brand …` (check step 12)              | 170 pairs, 170 compared, 0 over budget, worst 0.408 percent, mean 0.016 percent, 53.4 s: the GT deck's render is unchanged against the Prototemplate shoot                                                                                                                                                                                                                                                                                                  |
| `turboslide fonts build --check` (check step 23)                                         | 0 stale files, version 4.001+gt.2, 58.8 s                                                                                                                                                                                                                                                                                                                                                                                                                   |

In the container (check step 25 rebuilt `turboslide-render-worker` from the tree with `docker
build`, `COPY . .` fresh over the cached base layers, then ran the native verify; the image holds
B2's fix round: `catmullRomSegments`, `CELL_FIRST_BASELINE_PX`, `decorationCentered`,
`CELL_RULE_INSET_PX` and the theme's `.table` without `tabular-nums` are all in `/app`;
`verification-2/check/check-from-22.log`, the experiment logs under `verification-2/container/`):

| Command in the image                                                                                                                                                                                                                                                                                | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| step 25: `turboslide export decks/fixture/gslides --mode native --verify --out /work/gs-native`                                                                                                                                                                                                     | `passed: false` in both themes, 477.1 s with the build: the misses B2 named (`styles#p1` dw -11 light and -10 dark, `shapes#plus` dx 29 dy 29 dw -58, `word-art#art` dark dw -548) and, against B2's fix round record, `lines#decorated` dx -5 dy -1 dw 4 in both themes and both tables missing the per cell 3 px budget by dx 18 to 25 (`table-merge` in both themes, `table` in dark, one cell dx -245 dw 263), so both were rewritten as ruled rows and the gated file holds no `a:tbl` |
| the same command on the same image, the machine otherwise idle (`container/step25-rerun.log`)                                                                                                                                                                                                       | `passed: false` in both themes, 194.7 s, on the three misses B2 named alone: `styles#p1` dx 1 dy -1 dw -11 (light) and -10 (dark) against the text budget 3, 1, 3; `shapes#plus` dx 29 dy 29 dw -58 against the line budget 1, 1, 1; `word-art#art` (dark) dw -548 against 3, 1, 3; both tables stay `a:tbl` (no fallback), `lines#decorated` in budget; 26 pages, 200 shapes, 3 custGeom per file, LibreOffice 25.2.3.2, pdftocairo 25.03.0                                                |
| `--theme light` over the full deck, its first 13 and its last 13 slides; the six miss slides in both themes and in dark alone (`container/bisect-light.log`, `experiment-two-themes.log`, `experiment-image-vs-mounted.log`, the last with the tree's `packages/` and `decks/` mounted over `/app`) | every run reads the same three misses and nothing else (the last 13 slides `passed: true`); the image and the mounted tree agree                                                                                                                                                                                                                                                                                                                                                            |     |
| `turboslide export decks/fixture/gslides --mode flatten --verify --out /work/gs-flatten-rerun` (`container/flatten-and-check.log`)                                                                                                                                                                  | `perfect: true`, `passed: true`; verify passed for 26 slides in light (122.9 s) and dark (100.8 s), geometry in bounds, 26 palette PNG pages per file (1.54 and 1.55 MiB), worst decoded mismatch 0.000 percent; 387.6 s                                                                                                                                                                                                                                                                    |
| `turboslide export check /work/gs-native-rerun` in the image                                                                                                                                                                                                                                        | both files valid: 146 parts, 26 slides, 26 notes parts, "1 italic run(s), 6 rotated, 16 group(s), 3 chart part(s), 4 attached connector(s), 1 numCol, 1 avLst, 2 table(s) with 3 merged cell(s)", 173 relationships, 0 invalid (python-pptx not run in the image; it ran locally in step 22: 26 slides, 166 shapes)                                                                                                                                                                         |     |

The per block misses of the native verify in the container on the idle rerun, both themes (`dx`, `dy`, `dw` in px against the text budget of 3 horizontal and 1 vertical, lines 1):

| Slide      | Theme       | Block  | dx, dy, dw            | Budget       | Cause (B2's fix round record)                                                                                                                  |
| ---------- | ----------- | ------ | --------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `styles`   | light, dark | `p1`   | 1, -1, -11 (-10 dark) | text 3, 1, 3 | the superscript and subscript runs at 0.75 em on the sheet, 58 percent in LibreOffice; a viewer constant, not chased                           |
| `shapes`   | light, dark | `plus` | 29, 29, -58           | line 1, 1, 1 | `shapePath` in `packages/schema/src/shapes.ts` is still the rectangle stub of merge 1, so the sheet draws the plus as its box (B1, request R9) |
| `word-art` | dark        | `art`  | 0, 0, -548            | text 3, 1, 3 | LibreOffice draws no outline on a run; the paper outline on the ink fill leaves no ink past the cut                                            |

The chain's own step 25 run added `lines#decorated` dx -5 dy -1 dw 4 in both themes and the two tables out of the per cell budget by dx 18 to 25 (`table-merge` both themes, `table` dark, one cell dx -245 dw 263), which sent both tables to the ruled rows fallback; none of the five later runs on the same image repeats it, and it ran while the verifier's Playwright rerun loaded the machine (finding 24).

SPEC-2 11.3 asks for the native report's `passed` true or every miss named with its budget; they
are named here (finding 4 and finding 24). No PowerPoint is installed on this machine; the manual
checklist of `docs/export-verification.md` is listed for Kevin in section 11. The python-pptx
read-back is part of `export check` (26 slides, 166 shapes).

## 8. The preview deployment (task item 7)

`vercel deploy --yes --archive=tgz` from the repository root at 23:44 PDT
(`verification-2/preview/deploy.log`, 58 s of CLI time):
`https://turboslide-jtl13hz0t-kl01s-projects.vercel.app`, built on Vercel from the uploaded tree
(never `--prod`). The build log warns three times that the client build externalizes `node:fs`,
`node:path` and `node:zlib` "imported by packages/lint/src/rendered/bitmap.ts" and `png.ts`
(finding 25); the deployment served every page. The preview sits behind Vercel Authentication, so
every request carries the project's development token in the Trusted Sources header (`vercel env
pull` into the session scratchpad, outside the checkout; never printed), and the agent routes carry
the bearer of `~/.config/turboslide/hosts.json` (the pulled preview value is the 11 character stand
in of finding 12; the 64 character token answers 200 with the OIDC header and `/api/agent` answers
401 without a bearer: SPEC 11 holds on the preview).

`node scripts/hosted-smoke.mjs <preview> --token-env TURBOSLIDE_TOKEN --export-batch`
(`verification-2/preview/hosted-smoke-batch.log`), 12 of 12 in 4 min 9 s:

| Path                                        | Status | ms      | Result | Detail                                                                                                                                                                                                             |
| ------------------------------------------- | ------ | ------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/`                                         | 307    | 1,577   | pass   | location /new; x-robots-tag noindex                                                                                                                                                                                |
| `/new`                                      | 200    | 288     | pass   | 24,563 chars; 3 of 3 shell marks; noindex                                                                                                                                                                          |
| `/deck/gt-brand`                            | 200    | 2,192   | pass   | 381,249 chars; 0 notes keys                                                                                                                                                                                        |
| `/edit/gt-brand`                            | 200    | 114     | pass   | 24,649 chars; 3 of 3 shell marks                                                                                                                                                                                   |
| `/decks`                                    | 200    | 3,727   | pass   | 14 cards                                                                                                                                                                                                           |
| `/decks/trash`                              | 200    | 592     | pass   | 27,471 chars                                                                                                                                                                                                       |
| `/print/gt-brand`                           | 200    | 294     | pass   | 85 pages                                                                                                                                                                                                           |
| `/present/gt-brand`                         | 200    | 110     | pass   | 24,941 chars                                                                                                                                                                                                       |
| `/decks/gt-brand/assets/cover-fumadocs.png` | 200    | 229     | pass   | image/png 335,538 B                                                                                                                                                                                                |
| `/api/agent`                                | 401    | 294     | pass   | bearer rule                                                                                                                                                                                                        |
| `deck.info` snapshots                       | 200    | 257     | pass   | 0 snapshots, revision 31 (no write since the deploy)                                                                                                                                                               |
| export batched                              | 200    | 239,540 | pass   | plan r31: 85 slides in 2 batches of 60 (2.0 s); batch 0: 60 slides in 94.1 s; batch 1: 25 slides in 39.9 s; merge: 85 pages in 101.9 s, peak 784.2 MiB, `perfect: true`, `gt-brand-light.pptx` 16,275,876 B stored |

The batched Perfect export of the 85 slide GT deck therefore takes 239.5 s (4 min) of wall time on
the preview (pass 1: 263.4 s; B6: 264.8 s) with a peak of 784.2 MiB against the 3009 MB function
(SPEC-2 0.44), every batch under the 240 s budget (the slowest 94.1 s).

`node scripts/gslides-parity-audit.mjs --base <preview> --out docs/gslides-parity/verification-2/parity-audit-preview.json` with the OIDC header (`verification-2/audit/parity-audit-preview.log`): **2,090 pass, 31 fail, 384 skipped in 3,315 s** (55 min against the remote host, against 491 s locally), exit 1. Of the 31: the seven product rows of the local run (`format.dropShadow`, the six group state rows; findings 10 and 17); `key.selectAll` reading "Title" over 7 objects, the anchor state of finding 18; eight default view word checks that pass on the dev server (finding 29); the tooltip audit on the Vercel toolbar's injected link (finding 30); and fourteen rows the remote run itself lost: `title.appIcon` (a 4 s click timeout on the `/decks` link), `file.download.html` (the page navigated away and the execution context was destroyed) with the three `insert.chart.*` rows that followed it without `window.turboslide`, `file.download.zip` (no download within 30 s), `slide.deleteSlide` (the snackbar read empty), `format.text.strikethrough` (no block selected when the row ran), `format.image.resetImage` (disabled in that state), the four shape plate picks and the round two states after 50 minutes (30 s hover and click timeouts on an unresponsive page). Every one of the 2,090 passing rows read the same on the preview as locally: the menus, the Later stubs, the Omit rows, the retired keys, the tails, the context menus, the Format options sections and the 36 round two effects that ran before the page slowed. The audit's scratch deck was trashed and deleted on the preview at the end.

## 9. The builders' acceptance commands, rerun

`node_modules/.bin/tsc -b` exits 0 on the whole tree (3.7 s incremental; check step 4 again 0.4
s). Per package `node_modules/.bin/vitest run`, one package at a time before anything else ran
(`verification-2/check/unit-sweep.log`, the same `unit-sweep.sh` as pass 1):

| Package              | Result                                                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `packages/schema`    | 16 files, 304 passed (303 plus B1's align case)                                                                      |
| `packages/lint`      | 9 files, 65 passed                                                                                                   |
| `packages/store`     | 8 files, 98 passed, 1 failed: `templates.test.ts` "slide files equal decks/gt-brand byte for byte" (finding 15)      |
| `packages/agent`     | 11 files, 171 passed                                                                                                 |
| `apps/cli`           | 14 files, 85 passed, 1 skipped (32 s; `mcp.test.ts` inside its budgets when run alone)                               |
| `packages/mcp`       | 5 files, 34 passed                                                                                                   |
| `packages/fonts`     | 2 files, 8 passed                                                                                                    |
| `apps/render-worker` | 1 file, 8 passed                                                                                                     |
| `packages/headless`  | 4 files, 25 passed, 1 skipped                                                                                        |
| `packages/viewer`    | 25 files, 224 passed                                                                                                 |
| `packages/chrome`    | 46 files, 411 passed (410 plus the Change shape plate test)                                                          |
| `packages/render`    | 7 files, 275 passed (the 14 snapshots of pass 1's finding 2 updated by B2 and read; 4 more for the decoration model) |
| `packages/export`    | 18 files, 132 passed (16 files and 122 in pass 1; `pptx/shapes.test.ts` and `pptx/table.test.ts` new)                |

So 1,840 tests pass and 1 fails per package (pass 1: 1,814 and 14). In the root run of check step
5 (181 files, 1,988 tests in 74 s) three fail: the same `templates.test.ts` case and both tests of
`apps/cli/src/commands/mcp.test.ts` by timeout (5 s on `createDeckServer` building the tool list,
30 s on `deck_import_slides`; findings 13 and 16), which pass per package.

The other acceptance rows of MILESTONES-2:

| Row                                                                                      | Result                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1: `pnpm generate:contracts` current                                                    | check step 3: `generate:contracts: 14 files current`; the `git diff --exit-code` that follows fails as written until the ship step commits the generated files (round one's record, unchanged)                                                                         |
| B1: `turboslide validate decks/gt-brand`, `decks/fixture/gslides`                        | check step 9 ok; the fixture 27 slides, 0 errors, 0 warnings (the agent walk validates its copy after each of 47 writes); the walk's GT copy 85 slides, 0 errors, 46 warnings                                                                                          |
| B1: `turboslide lint all --json`                                                         | check step 15 ok                                                                                                                                                                                                                                                       |
| B1: `turboslide fonts build --check`                                                     | check step 23 ok (the venv present)                                                                                                                                                                                                                                    |
| B1: the CLI walk of every new command in a temp deck                                     | section 6: 47 of 47                                                                                                                                                                                                                                                    |
| B2: `render all` and compare-to-shoot                                                    | check steps 10 to 12 ok: 170 records, no page error, 170 pairs at worst 0.408 percent                                                                                                                                                                                  |
| B2: `scripts/canvas-fidelity.mjs` over the GT deck and the templates                     | check step 24 ok: 171 slides, 342 pairs, 0 over budget, worst 0.262 percent (`gt-brand/directions` dark), mean 0.004 percent (pass 1's finding 1 closed: the script measures, converts and compares per theme)                                                         |
| B2: the fixture in both modes with `export check`, the PDF, the container                | section 7                                                                                                                                                                                                                                                              |
| B3: chrome lint at three widths, the tooltip audit, the default view words               | check step 18 ok; the tooltip audit passes inside the parity audit; 35 default view checks pass                                                                                                                                                                        |
| B4, B5: the Playwright specs of step 21                                                  | section 2                                                                                                                                                                                                                                                              |
| B6: `node scripts/lint-packages.mjs`                                                     | exit 1: 232 errors over 20 packages, 10 above `tooling/eslint-config/baseline.json` (pass 1: 255 and 10; the integrator's files at 0); `--changed` exit 1 (281 changed files in 16 packages, 11 with findings)                                                         |
| B6: `hygiene.spec.ts`, `export-batch.spec.ts`, the budgeted specs three times under load | `hygiene` and `export-batch` pass in check step 21; the two budgeted tests passed once there under the chain's own load (task 5 in 14.8 s, "Enter … commits in a heading" green); the three runs beside an export loop that B6 recorded were not repeated in this pass |

The eslint counts against the baseline (`verification-2/check/lint-packages.log`; pass 1's count
in the last column):

| Package              | Files | Errors | Warnings | Baseline | Pass 1 |
| -------------------- | ----- | ------ | -------- | -------- | ------ |
| `apps/cli`           | 67    | 24     | 12       | 10       | 24     |
| `apps/render-worker` | 13    | 1      | 0        | 1        | 1      |
| `apps/studio`        | 76    | 11     | 0        | 8        | 37     |
| `packages/agent`     | 39    | 0      | 0        | 0        | 0      |
| `packages/chrome`    | 186   | 113    | 20       | 45       | 113    |
| `packages/effects`   | 22    | 0      | 0        | 0        | 0      |
| `packages/export`    | 67    | 17     | 2        | 9        | 14     |
| `packages/fonts`     | 6     | 2      | 0        | 0        | 2      |
| `packages/headless`  | 23    | 10     | 0        | 6        | 10     |
| `packages/import`    | 17    | 0      | 1        | 0        | 0      |
| `packages/lint`      | 45    | 7      | 1        | 7        | 7      |
| `packages/materials` | 12    | 4      | 1        | 4        | 4      |
| `packages/mcp`       | 12    | 0      | 0        | 0        | 0      |
| `packages/native`    | 9     | 3      | 0        | 0        | 3      |
| `packages/render`    | 42    | 2      | 0        | 1        | 2      |
| `packages/schema`    | 57    | 18     | 1        | 5        | 18     |
| `packages/store`     | 28    | 2      | 0        | 3        | 2      |
| `packages/theme`     | 13    | 0      | 0        | 0        | 0      |
| `packages/viewer`    | 68    | 18     | 2        | 0        | 18     |
| root                 | 12    | 0      | 0        | 0        | 0      |

`apps/studio` fell from 37 to 11 (the integrator's files; the 11 are the `invoke` casts in B3's,
B4's and B5's five specs, `integrator.md` section 16); `packages/export` rose from 14 to 17 with
B2's fix round; the runner also notes `packages/store 2 < 3`, a baseline to lower.

## 10. Findings

Severity 3 blocks the round, 2 must be fixed before the ship step, 1 is recorded. The owner is
the builder who owns the file in MILESTONES-2.md "Owns"; the integrator owns the route, the
scripts named in its row and the documents. Findings 1 to 14 are pass 1's, each with its state
after the fix round; 15 to 23 are new in this pass. Every finding names the command that shows it.

1. Closed. Check step 24 passes: `scripts/canvas-fidelity.mjs` measures, converts and compares
   per theme; 171 slides, 342 pairs, 0 over budget, worst 0.262 percent (`gt-brand/directions`
   dark), mean 0.004 percent; the five GT code panel slides read 0.000 percent in both themes.
2. Closed. `packages/render` passes at 7 files, 275 tests; the 14 snapshots were read and updated
   by B2 (`b2.md` "Fix round").
3. Closed as decided, with a consequence (finding 15). The integrator kept `BlockBase.alt` and
   re-imported the GT deck once; check step 7 is idempotent on the tree (`git status` unchanged
   before and after, revision 25 kept) and the ship step commits the 24 paths.
4. Reduced to three named misses (B2's fix round, section 7): in the container the native
   verify still answers `passed: false` in both themes, on `shapes#plus` (dx 29, dy 29, dw -58
   against the line budget 1; B1's interpreter, request R9), `styles#p1` (dw -11 light, -10 dark
   against text 3; the superscript size a viewer constant) and `word-art#art` in dark (dw -548;
   LibreOffice draws no run outline); the two tables stay `a:tbl` with 3 merged cells and every
   cell is in budget. SPEC-2 11.3 accepts the misses named with their budgets; they are.
5. Closed. The stage signals its multi selection (`onMultiSelectionChange`); with two objects
   Arrange > Group, Align enabled, Ungroup and Distribute disabled, Insert > Link disabled; with
   three Distribute enabled (the audit's `rows:twoObjects`, the integrator's e2e test).
6. Closed. Change shape ▸ and Mask image ▸ draw the shell's plates in the right-click menus and
   close on a pick (the audit picks `hexagon` and writes `shape.set`).
7. Closed. Align > Bottom with one object lands the bottom edge at 900 (the audit reads `pos.y`
   780; B1's `resolveAlignTarget`, the snap kept for the selection's shared edge only).
8. Open, reduced. 232 errors over 20 packages, 10 above the baseline (was 255); the integrator's
   files are clean; the rest is listed per file and owner in `integrator.md` section 16 and the
   B1, B2, B3, B4, B5 rows of section 9's table here. `node scripts/lint-packages.mjs --changed`
   exits 1. SPEC-2 8.4.
9. Open (B3, not in the fix round). Format > Text > Italic, Underline, Strikethrough,
   Superscript, Subscript and the Capitalization rows write nothing and say nothing on an empty
   placeholder; `textStylePlan` in `editor-shell.ts` is unchanged since pass 1. Not retested in
   the browser this pass (the audit gives the placeholder a sentence first); the code path is the
   same.
10. Open (B3, not in the fix round). Drop shadow in a paragraph's right-click menu opens Format
    options without a Drop shadow section (`effects:textBlock2 format.dropShadow`, reproduced in
    both full runs of the audit).
11. Closed. `.prettierignore` covers `docs/gslides-parity/verification-2/**/*.json`.
12. Open (for Kevin and `docs/hosting.md`). `vercel env pull --environment=preview` still returns
    an 11 character `TURBOSLIDE_TOKEN`; the deployment accepts the 64 character value of
    `~/.config/turboslide/hosts.json` (section 8).
13. Open (B1). `apps/cli/src/commands/mcp.test.ts` keeps its 5 s and 30 s budgets and both tests
    timed out in the root run of check step 5 (75 s for 1,988 tests) while passing alone in 32 s
    with the suite; the 5 s one times out inside `createDeckServer`, which builds the 27 MB tool
    list of finding 16, so the two findings share a cause.
14. Open (B1). The fixture's `canvas-title`, `canvas-opener` and `background-picture` keep the
    integer `pos` the CLI wrote before R2 (`canvas-title` 7 objects, 0 fractional; the agent walk's
    `slide to-canvas title` reads within 1 px and not byte for byte).
15. Severity 3, check step 5 fails on `packages/store/src/templates.test.ts` "slide files equal
    decks/gt-brand byte for byte and hold no html block": the fix round's re-import wrote `alt`
    before `type` in 22 slide files of `decks/gt-brand`, and `decks/templates/gt-brand/slides/*.json`
    keep the committed order, so the template no longer equals the deck (`agent-api.json` is the
    first diff: `dia1`'s `alt` key moved). Finding 3's resolution needs the same re-serialization
    of the 22 template files (or the template re-cut at revision 25 with `template.json` naming
    it), and BUILD-STATUS-2's sentence "the GT deck and both templates are byte identical to
    `a65b313`" is no longer true for the deck. Integrator (the decision) with B1 (the files).
    `cd packages/store && ../../node_modules/.bin/vitest run src/templates.test.ts` shows it.
16. Severity 3, the MCP stdio server's `tools/list` answer is 27.2 MB for 81 tools (median tool
    478 KB; every tool's `inputSchema` inlines the 256 KB block union under
    `definitions/__schema0`), while the SDK's stdio client reads a message into a buffer capped at
    10 MB (`STDIO_DEFAULT_MAX_BUFFER_SIZE` in `@modelcontextprotocol/sdk` 1.30.0), so every stock
    MCP client closes the session after `initialize` (`McpError -32000: Connection closed`,
    `ReadBuffer exceeded maximum size of 10485760 bytes`; the server logs "connection closed").
    A raw JSON-RPC client reads the list, so the server is correct and oversized. The committed
    `packages/agent/generated/mcp-tools.json` is 1.26 MB for 88 tools (595 KB as JSON), so the
    generator dereferences what the live server inlines. Kevin's directive (2) asks for agent
    editability "esp on locals"; the stdio transport is the local one. B1 (`packages/mcp/src/tools.ts`,
    the schema serialization per tool) with the integrator (`packages/agent/src/generate/mcp.ts`).
    `docs/gslides-parity/verification-2/agent-walk.mjs` records both connections; the probe
    `scratchpad/probe-mcp4.mjs` measured the sizes.
17. Severity 2, a click on a grouped object does not select the group when the click lands in a
    member's text surface or while another object is selected (SPEC-2 6.1 row 14: "a click on a
    member selects the group; a double click selects the member alone"). Measured on the walk's
    copy and in probes: the converted opener's plate box clicked while the photograph is selected
    reads "Box" (from nothing: "Group", 4 rings); the plate's heading clicked reads "Title" (the
    caret opens, Esc leaves the member); a grouped `rect` with a Text clicked 2 px inside its
    frame opens the caret and reads "Shape" (the same shape without a Text reads "Group"). The
    audit's six group rows (section 3) are this finding. B4 (`packages/viewer/src/Editor.tsx`: the
    caret path of a press inside text and the press while another object is selected both skip
    `selectObjects`, whose `expandGroups` widens to the group).
18. Severity 2, Cmd+A on the canvas keeps only the selected object unless that object is the
    first in the slide's object order (SPEC-2 6.1 row 5). The walk (`p1` selected on
    `books-and-templates`, converted, 6 objects): the chip stays; the probes: chip "Title", one
    ring, on the unconverted and on the converted slide; the audit's row passes with the first
    object selected ("7 objects"). Cause in `Editor.tsx`: `selectAll` makes the first object the
    anchor and puts the rest in `extra`; the effect that ends a multi selection when "an anchor the
    page changed from outside the group" is not in `extra` then clears `extra`, because the new
    anchor is not in the list it just set. B4.
19. Severity 2, or a deviation for Kevin: a double click on the photograph of an unconverted
    picture kind writes the conversion as its own revision before crop mode opens (`Editor.tsx`
    `onDoubleClick`: `pendingCrop` then `toCanvas()`), and the crop's Enter is a second write
    (`block.set /trim`, `/pos`), so the gesture is two writes and Esc out of crop mode leaves a
    converted slide with no crop. SPEC-2 1.1 says a mode entry never writes and 7.1 one write per
    gesture; `b4.md` section 3 does not list it. On a slide already converted the entry writes
    nothing (B4's `canvas.spec.ts` step 5 crops after a drag). B4.
20. Severity 1, `scripts/check.mjs` step 20 writes the parity audit to
    `docs/gslides-parity/verification/parity-audit.json`, round one's committed report, where
    MILESTONES-2 "Verifier" names `verification-2/parity-audit.json`; every full check overwrites
    a committed round one file (restored here from a copy after the run). Integrator.
21. Severity 1, `validate.run` is in the action table with every transport and the editor's
    window API has no handler for it (`NotImplementedError: validate.run is declared in the action
table and lands in M1`), so `window.turboslide.studio.invoke('validate.run')` throws where the
    CLI's `validate` answers. Integrator (the `on(...)` table) or B1 (the transports list).
22. Severity 1, Format options controls without the Tooltip primitive (`data-tip`), read by the
    audit while each type was selected: text `role`, `tone`, `typography.align`,
    `typography.columns`; shape `arrowheads`, `orientation`, `typography.align`,
    `typography.columns`, `fill`, `stroke`, `color`; image `fit`, `crop`, `captionSize`; table
    `border.weight`, `border.color`; chart `kind`, `numberFormat` (all `block.<id>.<field>`).
    AGENTS.md wants the primitive on every control; `scripts/tooltip-audit.mjs --strict` passes,
    so it does not open the inspector's generated controls (the verifier's script). B3 (the
    inspector modules), verifier (the audit's scope).
23. Severity 1, the audit's `formatOptions` rows read a `layout` section for text, shape, line,
    image and table objects that SPEC-2 section 5's table does not list; it is drawn between
    Position and Text fitting and carries no forbidden word. Recorded, not failed; B3 to name it
    in the section table or drop it.
24. Severity 2, check step 25's native verify in the container is load sensitive: in the chain
    (`check-from-22.log`, 477.1 s with the build, run while the verifier's six spec Playwright
    rerun held the machine) it read `passed: false` with `lines#decorated` dx -5 dy -1 dw 4 in
    both themes and both tables missing the per cell 3 px budget by dx 18 to 25 (`table-merge`
    both themes, `table` dark, one cell dx -245 dw 263), so both were rewritten as ruled rows;
    the same command on the same image afterwards (`container/step25-rerun.log`, 194.7 s, the
    machine otherwise idle) passes both tables as `a:tbl` and the decorated line and misses the
    three B2 named (`styles#p1`, `shapes#plus`, `word-art#art` dark). The full light deck, its two
    halves and the six miss slides in both themes read the same three (`container/bisect-light.log`,
    `experiment-two-themes.log`, `experiment-image-vs-mounted.log`). The horizontal cell shifts
    are the size of a font's advance, which points at the sheet page's readiness before the verify
    screenshots under load (`packages/headless/src/ready.ts` `waitForReady`, `packages/export/src/verify`).
    B2. Until it is deterministic the chain's step 25 can fail on a loaded machine while the
    gated file is correct.
25. Severity 1, the preview's client build warns three times that `node:fs`, `node:path` and
    `node:zlib` are "externalized for browser compatibility, imported by
    packages/lint/src/rendered/bitmap.ts" and `png.ts` (`preview/deploy.log`): the client graph
    still reaches the rendered lint layer's Node modules through `@turboslide/lint`, and only
    Vite's externalization keeps them out of the bundle; `scripts/check-client-bundle.mjs` (step 6)
    passes because the externalized specifiers leave no `node:` string behind. B6 (the client safe
    lint entry, SPEC-2 8.3) with the integrator (`server/lint-rendered.ts`).
26. Severity 2, Insert > Chart > Bar lands the chart at `pos.y` 184, not the centred 180
    (`charts.spec.ts:169`, the same in the chain and alone: "Expected 180, Received 184"): the
    centred insert (960 by 540 at 320, 180) is snapped to the 8 px grid after the centring, the
    pattern of pass 1's finding 7 on the insert path, while SPEC-2 6.1 row 31 has Snap to > Grid
    off by default and the fixture's `chart-bar` sits at 180. B3 (`insertBlockPlan`) or B4
    (`centredBox`, the insert's snap), whichever snaps.
27. Severity 2, `apps/studio/e2e/present.spec.ts` is stale against the round two fixture: its
    `PLAY` is the hand written list of round one's six unskipped slides while `seedDeck()` copies
    `decks/fixture/gslides` at 27 slides, so `data-total` reads "26" against "6" (`present.spec.ts:266`,
    the same in the chain and alone); alone the `?screen=1` test then fails too (the presenter
    address stays `/present/e2e-present?screen=1`). SPEC-2 0.42 asks every count to derive from
    11.2's total. B1 (the fixture grew) with B6 (the spec's owner in round one).
28. Severity 2, the round two specs of check step 21 have never run green on the merged tree: B5
    recorded that `tables.spec.ts` and `charts.spec.ts` "did not run to green" (no editor booted
    on a dev server in stage 2), the integrator's merge 2 ran only `gslides-actions`, `hygiene`,
    `ten-tasks`, `text-editing`, `window-api` and `undo`, and pass 1 never reached step 21. In the
    chain 6 of 66 fail and 6 do not run (54 pass, 7.7 min); the six files alone read 1 pass, 7
    fail, 9 not run in 16.8 min with the failures moving between runs. Beside findings 26 and 27:
    `canvas.spec.ts` (B4) expected 19 writes and read 18 after Cmd+Shift+Up in the chain and hung
    ten minutes in `version.list` at line 368 alone; `objects.spec.ts:198` (B4) finds no
    `handle.text.move` after the text box was rotated by the handle (the frame corner of a rotated
    box lies outside it); `tables.spec.ts` (B5) counts 24 cell runs for 12 and hits a strict mode
    violation on one `data-run`, because `.pt-viewer [data-run^="table/rows/"]` also matches the
    filmstrip's live clone thumbnails (`LiveClone.tsx`, round one; 26 `.ts-sheet` roots in the
    editor's document); `text-styles.spec.ts` (B4) counts 5 writes for 6 at line 179 and reads
    extra marks at line 315. The verifier's own walk (section 4) drives the same gestures through
    the window API and the overlay and passes 40 of 43, so the product behind most of these rows
    works and the specs need their locators and counts; findings 17 to 19 are the product rows
    the walk shows. Every builder of a step 21 spec (B4, B5, B6), then the integrator for step 21.
29. Severity 1, the default view words check fails on the preview and passes on the dev server
    (`parity-audit-preview.json`, `defaultViewWords`, 8 of 35): "freeform" as a line of the
    editor's text in five states, "Measure (ch)" as the label and tooltips of the paragraph's
    measure field in the Block section ("p1: Measure (ch) up"), "Copies the MCP address" as a
    tooltip outside Tools > Advanced, and two matches the word list should not count, the special
    character name "Heavy round tipped rightwards arrow" and the GT slide titles "Open source and
    platform" and "The agent API" carried by the filmstrip's card tooltips. Whether the first three
    come from the production build or from a panel the remote run left open is not isolated here;
    B3 for the three words, the verifier for the two false positives of `forbiddenWordsIn`.
30. Severity 1, `scripts/tooltip-audit.mjs --strict` exits 1 on the preview because the Vercel
    preview toolbar injects an `<a>` "Skip to content" (geist classes, `opacity-0`,
    `pointer-events-none`) into every page; it is not the product's and the audit passes on the
    dev server. The verifier's script should skip elements outside the app root, or the preview
    audit should carry `--skip-tooltip-audit`; recorded, not a product miss.

## 11. What Kevin must do

1. Decide the ship gate: `pnpm check` is not 25 of 25 on this tree (section 2). Two steps fail on
   an idle machine, step 3 as written on the uncommitted generated files (as in every round) and
   step 5 on finding 15 and the two `mcp.test.ts` budgets; step 20 fails on findings 10 and 17.
   Findings 15 and 16 are severity 3: the template's byte identity with the re-imported deck, and
   the MCP stdio tool list no stock client can read. Findings 17 to 19 are the canvas defects a
   sales user meets (a grouped text object's click, Cmd+A, the crop entry).
2. The canvas decisions that scope or extend Google (SPEC-2 0.106), all built as written: the
   theme elements (the wordmark, the counter, the rails, the two paper chips, the paper ground)
   stay fixed until Slide > Edit theme, as Google's master elements do (1.6); the workspace around
   the sheet takes the marquee, the deselect click and the empty canvas menu, and a picture object
   covering the sheet appends Change background and Guides ▸ to its own menu (0.100; the audit's
   `contextMenu:coversSheet` reads the appended rows); the editor's and the CLI's `pos` are
   identical in Chromium only (0.104; section 4 compares them on five slides); an object crossing
   the slide's edge is a severity 2 `freeform/off-sheet` finding rather than a refusal (0.96; the
   walk's photograph).
3. The Google facts SPEC-2 section 13 lists as unverified by a public page, built on the research
   reports' reading: the rotation handle's position and the 15 degree Shift snap (built: "15°" on
   the heading and the shape); the group double click; Regroup; the bullet preset grid's count;
   Tab outside a list; the crop handles' colour; the Insert menu's exact order; whether Size &
   rotation offers flip buttons; whether Cmd+, and Cmd+. reach the page in Chrome on macOS; the
   size readout while resizing (built: "1680 × 900" on the photograph); the guide dragged out of
   the ruler (built: "5.00 in" while dragging, `deck.guides` 600); Align acting on one object
   (built as align to the slide: `p1.x` 0); where a pasted object lands on the same slide (built:
   16 px right and down; Cmd+D's copy at +16, +16); Cmd+A with no caret selecting every object
   (built, finding 18 narrows it); Ctrl+scroll and the pinch zooming the canvas (built); the
   Cmd+Option rotate alias; whether a marquee takes crossed or covered objects (built: crossed;
   the walk's marquee took 4 objects); the undimmed part of an object past the slide's edge on
   the workspace (built: undimmed, the walk's screenshots 02 and 19); font sizes under a group
   resize (built: unchanged); the rotated snap by the bounding box (built).
4. The chords the round could not bind as Google does: Select none has no two key sequence, it
   is Edit > Select none; Cmd+, may open Chrome's settings before the page sees it and the
   shortcuts dialog says so; Cmd+Option+Left and Right rotate only when the browser lets the
   keydown through, Option+Left and Right always do.
5. Format > Text > Font stays Inter; the title, statement and picture kinds' heading, lead and
   big fields keep the grammar's fixed sizes until a slide converts (SPEC-2 0.41); a converted
   slide's texts carry `shrink` (the walk's conversions).
6. The presets whose formulas the interpreter could not evaluate: B2's fix round records that
   `shapePath`, `textInset` and `sites` in `packages/schema/src/shapes.ts` are still the
   rectangle stubs of merge 1 (`b2.md` request R9): `shapes.test.ts` evaluates all 135 presets
   against the stub, so the sheet draws every preset as its box while LibreOffice draws the ECMA
   geometry (`shapes#plus` in section 7). Pass 1's item 6 said "none"; that was wrong, and the
   interpreter is a build gap for B1, not an approximation.
7. The deviations the builders recorded for you this round, listed in AGENTS.md and
   BUILD-STATUS-2.md: the measured `pos` at 1/64 px (B2 R2); the theme of the converting surface
   (R3; the fidelity script now runs per theme); the picture object as the PPTX slide background
   only while it covers the sheet (R4); a curve as Catmull-Rom cubics (B2 F3, closer than the
   spec's polyline); the table block in proportional numerals (B2 F1, against SPEC 7.3's
   "tabular"); the decoration model (F4); a rotated table written unrotated; the PDF's `word-art`
   page at 0.103 percent; no `cellRange` target from the stage; Cmd Up and Down on a grammar
   slide's block reorder within its slot; the handle and the keys write `block.set /pos`; the
   point tools end on Enter or the first point; "Line type" for "Line kind"; seventeen round one
   lint proposals pinned as a ceiling; the fixture's `diagram` slide as the template's output;
   Cmd+D through the store action; several cards in one write; the devtools off under
   automation; `selectSoon` at most twice; the replacement slide after a removal; a lease refusal
   as a conflict card. New in this pass for your call: finding 19 (the crop entry's write) and
   the group click rule of finding 17 against Google's own (a click on a selected group's member
   selects the member in Google; SPEC-2 says a double click).
8. The readers this machine lacks: open one Perfect and one Editable text export of
   `decks/fixture/gslides` (`.turboslide/gs-flatten`, `.turboslide/gs-native`, the container's
   under `.turboslide/container/`) in PowerPoint and `gs-pdf/gslides-light.pdf` in Preview, and
   confirm the italic runs, the rotated shapes, the groups, the merged table and the three charts
   read as the reports say (`docs/export-verification.md`'s manual checklist).
9. After the ship step: the previews hold no scratch deck (the audit trashes and deletes its
   own; the walks remove their copies); the production home page lists 14 decks.

## 12. Commands run

All from `/Users/kevinliu/repos/Turboslide` on 2026-09-12 and 13 (PDT), by the verifier; nothing
in the tree outside `scripts/gslides-parity-audit.mjs`, this document and
`docs/gslides-parity/verification-2/` was edited (check step 7 re-imported `decks/gt-brand` and
changed nothing on this tree; check step 20 rewrote round one's
`docs/gslides-parity/verification/parity-audit.json`, restored from a copy taken before the run,
finding 20; the audit's and the walks' scratch decks were trashed and deleted through the product
or removed from `decks/`), and no git write command, `pnpm install` (outside check step 1), `pnpm
add`, `pnpm exec` (outside `check.mjs`) or `pnpm build` (outside check step 6) ran. Docker ran for
check step 25 and the container verification only. The token of `~/.config/turboslide/hosts.json`
and the pulled preview environment were read into process environments and never printed. The
dev server for every browser step was the verifier's own on 4321 (`vite dev --port 4321
--strictPort` from `apps/studio` with `TURBOSLIDE_EXPORT_BATCH=3`, the file store, the log capped
at 2 MB; check steps 17 to 21 reused it), started after nothing listened there and stopped at the
end; `.turboslide/e2e.lock` was held for the browser phase and removed.

| Command                                                                                                                                                                                                                                                                     | Result                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `node_modules/.bin/tsc -b`                                                                                                                                                                                                                                                  | exit 0 in 3.7 s                                                                                                                   |
| `zsh docs/gslides-parity/verification-2/check/unit-sweep.sh` (13 packages, one at a time)                                                                                                                                                                                   | 1,840 passed, 2 skipped, 1 failed in `packages/store` (section 9)                                                                 |
| `node docs/gslides-parity/verification-2/agent-walk.mjs` (four runs; the last with the script's six expectation fixes)                                                                                                                                                      | CLI 47 of 47, MCP 39 of 40 (section 6)                                                                                            |
| `node scripts/lint-packages.mjs`; `--changed`; `node_modules/.bin/prettier --check .`                                                                                                                                                                                       | 232 errors, 10 packages above the baseline, exit 1; `--changed` exit 1; prettier flags only this document before it was rewritten |
| `vercel env pull <scratchpad>/env.preview --environment=preview --yes`                                                                                                                                                                                                      | the OIDC token for the protection header, outside the checkout (`TURBOSLIDE_TOKEN` there 11 characters, finding 12)               |
| `node <scratchpad>/probe-guide-menu.mjs`, `probe-plate-crop.mjs`, `probe-group2.mjs`, `probe-group3.mjs`, `probe-group4.mjs`, `probe-mcp{,2,3,4}.mjs`                                                                                                                       | the verifier's live probes behind findings 16 to 19 and the audit's script fixes (section 12's paragraph below)                   |
| `node docs/gslides-parity/verification-2/canvas-walk.mjs --base http://localhost:4321 --out docs/gslides-parity/verification-2/canvas-walk` (five runs, the last as recorded)                                                                                               | 40 of 43 in 39 s; the CLI's conversion identical on five slides (section 4)                                                       |
| `node scripts/gslides-parity-audit.mjs --base http://localhost:4321 --out docs/gslides-parity/verification-2/parity-audit.json` (two full runs)                                                                                                                             | 2,117/18/382 in 634 s, then 2,128/7/382 in 491 s after six script fixes; exit 1 (section 3)                                       |
| `node scripts/check.mjs`; `--from 4`; `--from 6`; `--from 21`                                                                                                                                                                                                               | section 2                                                                                                                         |
| `node_modules/.bin/playwright test` on the six failed specs of step 21, alone, under `.turboslide/e2e.lock` on the verifier's server                                                                                                                                        | 1 passed, 7 failed, 9 did not run in 16.8 min (section 2, finding 28)                                                             |
| `docker run … turboslide export decks/fixture/gslides --mode native --verify` (step 25's command again), the `--theme light` full deck and halves, the six miss slides in both themes and in dark, the mounted tree, `--mode flatten --verify`, `export check` in the image | section 7                                                                                                                         |
| `node apps/cli/bin/turboslide.mjs export decks/fixture/gslides --format pdf --verify --out .turboslide/gs-pdf`                                                                                                                                                              | section 7                                                                                                                         |
| `vercel deploy --yes --archive=tgz`                                                                                                                                                                                                                                         | `https://turboslide-jtl13hz0t-kl01s-projects.vercel.app` in 58 s of CLI time (section 8)                                          |
| `node scripts/hosted-smoke.mjs <preview> --token-env TURBOSLIDE_TOKEN --export-batch` (the `hosts.json` bearer, the OIDC header)                                                                                                                                            | 12 of 12 in 4 min 9 s; the batched GT export in 239.5 s at 784.2 MiB peak (section 8)                                             |
| `node scripts/gslides-parity-audit.mjs --base <preview> --out docs/gslides-parity/verification-2/parity-audit-preview.json` (the OIDC header)                                                                                                                               | section 8                                                                                                                         |
| `node scripts/check.mjs --only 19` after this document was written and formatted                                                                                                                                                                                            | ok in 21.0 s: the tree is prettier clean with this document rewritten (`check-only-19.log`)                                       |     |

The probes (scratchpad scripts, not kept in the tree; each copies the GT deck through `deck.copy`
or the fixture into a temp folder and removes it): `probe-guide-menu.mjs` right-clicked the guide
at 800 (the menu opens with Delete guide and Edit guides) and pressed Cmd+A on `p1` (chip "Title");
`probe-plate-crop.mjs` clicked the converted opener's plate box from nothing ("Group", 4 rings),
its heading ("Title", 1 ring), counted the writes of a double click into crop mode (1,
`slide.replace`) and of the Enter (1, `/trim` and `/pos`), and pressed Cmd+A on an unconverted
slide ("Title"); `probe-group2.mjs` clicked the plate box with the photograph selected ("Box"),
again ("Box"), from nothing ("Group"), a member with the group selected ("Title"), Shift+clicked
two blocks on an unconverted slide ("2 objects") and pressed Cmd+A on the converted slide
("Title"); `probe-group3.mjs` grouped a shape and a line and two shapes through `block.group`
and clicked a shape from nothing ("Group", 2 rings, kept on a second member's click);
`probe-group4.mjs` clicked a grouped `rect` carrying a Text at its frame corner with another
object selected ("Shape", the caret open) and at its centre from nothing (the same), then drew a
scribble by a 20 step drag (one write, 21 points) and a curve by three clicks and Enter (one
write, 3 points); `probe-mcp.mjs` to `probe-mcp4.mjs` connected the SDK client (closed on
`tools/list`), drove the server with raw JSON-RPC lines (answers `initialize` and `tools/list`
and stays up), read the `ReadBuffer exceeded` transport error, and measured the list (27,161,224
bytes, 81 tools, the largest `deck_update_slide` 884 KB, the median 478 KB,
`inputSchema/definitions/__schema0/oneOf` 256 KB in each).

## 13. Files under `docs/gslides-parity/verification-2/`

| File                                                                                                                                                                                                          | What                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `parity-audit.json`                                                                                                                                                                                           | the full local audit (2,128 pass, 7 fail, 382 skipped), MILESTONES-2's path                                   |
| `parity-audit-preview.json`                                                                                                                                                                                   | the audit against the preview deployment (section 8)                                                          |
| `audit/parity-audit-local.log`, `audit/parity-audit-local-run1.{log,json}`, `audit/parity-audit-preview.log`                                                                                                  | the two local runs' logs and the first run's report; the preview run's log                                    |
| `audit/objects-dev-run{1,2,3,4}.log`, `audit/parity-audit-objects-dev{,2,3,4}.json`                                                                                                                           | pass 1's four partial runs while the extension was written                                                    |
| `canvas-walk.mjs`, `canvas-walk.log`, `canvas-walk-run{1,2,3,4,5}.log`                                                                                                                                        | the walk's script, its final log and the five earlier runs' logs                                              |
| `canvas-walk/canvas-walk.json`, `canvas-walk/NN-*.png` (19), `canvas-walk/<slideId>.conversion.json` (5)                                                                                                      | the walk's report, screenshots and recorded conversions                                                       |
| `agent-walk.mjs`, `agent-walk/agent-walk.json`, `agent-walk/agent-walk.log`, `agent-walk/agent-walk-run{1,2}.log`                                                                                             | the agent walk's script, report and logs                                                                      |
| `check/tsc.log`, `check/unit-sweep.sh`, `check/unit-sweep.log`, `check/lint-packages.log`, `check/lint-packages-changed.log`, `check/prettier-check.log`                                                      | the static gates                                                                                              |
| `check/check-full.log`, `check/check-from-{4,6,20,21,22}.log`, `check/e2e-six-rerun.log`                                                                                                                      | the check chain and the six specs rerun alone (section 2)                                                     |
| `check/check-serverless.log`, `check/fidelity/*.diff.png`                                                                                                                                                     | pass 1's partial chain and the five fidelity diffs that finding 1 closed                                      |
| `container/step25-rerun.log`, `container/bisect-light.log`, `container/experiment-two-themes.log`, `container/experiment-image-vs-mounted.log`, `container/flatten-and-check.log`, `container/reports/*.json` | the container runs of this pass (section 7); `container/build.log` and `container/verify.log` are pass 1's    |
| `export/pdf.log`, `export/pdf-pass1.log`, `export/reports/*.json`                                                                                                                                             | the PDF export of this pass and of pass 1, the export reports (section 7)                                     |
| `preview/deploy.log`, `preview/hosted-smoke-batch.log`, `preview/*-pass1.log`                                                                                                                                 | the preview deployment and the smoke rows of this pass (section 8); pass 1's three logs kept as `*-pass1.log` |
