# Google Slides parity round two, build status

Kept by the integrator (`docs/gslides-parity/MILESTONES-2.md`, "Integrator"). One heading per
builder: what landed, what was cut or is unproven, and the open requests with where they went.
Section numbers refer to `docs/gslides-parity/SPEC-2.md` unless prefixed SPEC. Written at merge 2,
2026-09-12, over `main` at `a65b313`; nothing is committed until the ship step. Full notes:
`docs/gslides-parity/build-2/b1.md` to `b6.md` and `integrator.md` (sections 1 to 7 merge 1,
8 to 12 merge 2). Kevin's directives of the round: every slide is a canvas, every object drags,
resizes, rotates and reorders as in Google Slides, and every canvas capability is an action an
agent runs on the CLI, MCP, HTTP and the window API.

## The tree at merge 2

`node_modules/.bin/tsc -b` exit 0 on the whole tree. Suites per package: schema 303, lint 65,
store 99, agent 171, cli 84 (+1 skipped), mcp 34, render 275, export 122 (browser tests included),
headless 25 (+1 skipped), viewer 224, chrome 410, fonts 8, render worker 8, all passing.
`pnpm generate:contracts` current (`deck.info` gained `counts.snapshots`). The GT deck and both
templates are byte identical to `a65b313`. The editor boots on a dev server again (`/new` settled
in 4.3 s, `/edit/gt-brand` in 1.8 s, no page error), which no stage 2 builder could measure. The
`pnpm check` run and its numbers are in `integrator.md` section 11.

## B1 Document, actions, fonts build, CLI, MCP, lint rules, fixture deck

Landed (stage 1, merged at merge 1; `b1.md`): every field of section 2, the 36 actions of
section 3 (105 in the table), `canvas.ts` (`toCanvas`, `fromCanvas`), `connect.ts`,
`freeform.ts` over the rotated bounding box, `shapes.ts` with the 135 presets and the day two
geometry interpreter, the store actions with `withCanvas` and `withFollow`, every new CLI command
and MCP tool, the Inter italic build (34 faces), the lint rules, the fixture deck at 27 slides,
the canvas and walk tests with the committed conversion recordings.

Changed at merge 2 (the integrator's smallest edits, each marked in the file): `slide measure`
(request I1), `deps.diagrams` bound to B5's `makeDiagram` in `write.ts` and `commands/mcp.ts`
(B1 request 4), the interim measurer of `deps/canvas.ts` replaced by B2's `measureCanvas` and
`measureFit` (R1), `boxPos` at 1/64 px (R2) with the `canvas-walk` recordings re-derived and
`freeform.test.ts` pinning the 1/64 grid, `walk.test.ts` asserting the diagram insert, the
fixture's `diagram` slide rebuilt through `diagram.insert`, `deck.info`'s output schema with
`counts.snapshots`.

Fix round (VERIFICATION-2 finding 3): `BlockBase.alt` puts the key second in every serialized
block, so check step 7 rewrote the committed GT deck (22 slide files, `alt` before `type` on the
`dia` and `dither` blocks, 55 lines, no value changed, revision 24 to 25). The integrator chose
the re-import over a schema key order: the tree holds the re-serialized deck for the ship step to
commit, and a second import on it changes nothing (revision and `importedAt` kept), so the step
is byte identical again.

Cut or unproven: the fixture's `canvas-title`, `canvas-opener` and `background-picture` keep the
integer `pos` the CLI wrote before R2 (valid; re-deriving them needs the original walk's scratch
files). B3 request 4 (seventeen round one lint rules' proposals carry forbidden default view
words; pinned as a ceiling in `default-view-words.test.ts`) stays open for B1. R5 (a nested row
group inside a user group in the fixture) is optional and open.

## B2 Renderer, measurer, export, headless, worker

Landed (stage 2; `b2.md`): `measure-dom.ts` (the one measurer, `awaitSheetReady`,
`MEASURE_PRECISION` 64) and `measureCanvas` and `measureFit` in headless; the renderer for every
round two field (the `picture` block, rotation and flip, the marks, spacing, columns, bullets
and numerals, the shape presets with text, the line kinds, decorations and dashes, word art,
shadows, the background colour layer, the chart svg, merged cells, valign and padding, the plate
rules under `.free[data-group=plate]`, `isolation: isolate`); the export in both modes for every
field with the round two counts in `export check`; the measure job of the render worker (I2);
the Dockerfile with the 34 faces; `scripts/canvas-fidelity.mjs` (check step 24). Round one
snapshots byte identical; compare-to-shoot 170 pairs at worst 0.408 percent; the fixture's
flatten export perfect (26 pages, 0.000 percent decoded mismatch); the native check valid with
the round two line; the PDF at 26 pages with `word-art` at 0.103 percent (target 0.1, fail 0.5).

Fix round (VERIFICATION-2 finding 1): `scripts/canvas-fidelity.mjs` measured once, in light, and
compared both themes, so the R3 pixel failed ten dark pairs of the five GT code panel slides. The
script now measures, converts and compares once per theme, as AGENTS.md states: 171 slides, 342
pairs, 0 over budget, worst 0.262 percent (`directions` dark), mean 0.004 percent, 95.3 s; the
five slides read 0.000 percent in both themes; check step 24 passes.

Requests and where they went: R1 done (merge 2); R2 applied in B1's file (merge 2); R3 decided
(the theme of the surface converting measures; the five GT code panel slides differ by a pixel
between the themes, recorded in AGENTS.md for the verifier); R4 recorded (`slide.background`
holds on `background-picture`, the acceptance sentence's `canvas-opener` picture is moved and
travels as `p:pic`); R5 open, optional; R6 closed (`tsc -b` clean); R7 open for B6 (the merged
report's counts); R8 to the verifier (the container pass).

## B3 Chrome shell

Landed (stage 1 and 2; `b3.md`): the menu model rows of 4.1, the tails of 4.2, the context menus
of 4.3, the keys of section 9, the strings of section 10, the hover grid; then `editor-shell.ts`
with every seam (the canvas methods of `EditorHandle`, `DrawTool` widened, `buildMenuContext`
over the document, `menuActionPlan` for every flipped row, `insertBlockPlan` as positioned
objects, the zoom ladder), Format options rewritten for section 5 with the inspector modules and
`FormatOptionsSlots`, the Zoom box, the tail ops, the pickers, the Background, Custom spacing and
Special characters dialogs, the word art bar, `useEditorKeys` for Cmd+] and Cmd+[, the filmstrip
handle, the icons; 46 files and 410 tests.

Changed at merge 2: `DiagramPanel` mounted in `EditorShell.tsx` (B5 request 3); the route passes
`editor`, `guides`, `view.zoom`, `measuredBoxes` and `formatSlots` and maps the stage's handle
(B3 request 2); `toEditorTool` passes the widened tool through (request 1).

Cut or unproven: the chrome lint at the three widths, the tooltip audit under `--strict` and the
three Playwright specs against the round two shell were blocked for B3 by the client bundle leak,
now closed; check steps 18 and 21 run them on the merged tree (`integrator.md` section 11).
`ShortcutsDialog.tsx` does not print `KeyBinding.note` nor fold an `alias` binding (B3's own
later item). B3 request 6 (the tmp store re-reading a missing deck) is open: the check runs on the
file store, where the specs seed `decks/` directly.

## B4 The canvas, text and the draw tools

Landed (stage 2; `b4.md`): `canvas-measure.ts` (the editor's hidden 1x sheet with the present
document's text defaults), `Freeform.tsx` over `toCanvas` and `fromCanvas`, `Gestures.tsx` with
the canvas handles for every object of every kind, the conversion on the first write through
`commitCanvas`, selection on every kind, groups, crop mode, Option drag duplicates, zoom and pan,
rulers and guides, autofit after a resize, the marks through the run model, `rotate.ts`,
`crop.ts`, `zoom.ts`, `rulers-model.ts`, `marks.ts`, the snap lines with the sheet, the guides
and the equal spacing, the keys of section 9, the chrome's Overlay ring and readouts, `Rulers`
and `DeckGuides`; viewer 224 tests; `canvas.spec.ts`, `objects.spec.ts`, `text-styles.spec.ts`.

Changed at merge 2: `canvas-measure.ts` measures with B2's functions (B4 request 1); the route
wiring of request 2 (the stage props, the handle mapping, the selection facts, the guide menu);
`insertPicture` takes `background: true`; Cmd+D runs `block.duplicate` on every slide kind so
the copy lands after its source (B6 8a); the three specs remove their deck copies; the devtools
stay off for an automated browser (request 6).

Deviations recorded (b4.md section 3, AGENTS.md): Cmd Up and Down on a real block of a grammar
slide reorder within its slot; the handle writes `block.set /pos` where 6.1 names the object
actions; one ladder step of autofit per commit; the point tools end on Enter or the first point;
no `cellRange` target from the stage this round; the clip lift scoped to `.ts-editor`. Unproven
for the verifier: Safari and Firefox; the canvas walk's recordings against the CLI beyond the
title and thesis (`canvas.spec.ts` on the merged tree writes them, `canvas.test.ts` compares).

## B5 Charts, diagrams and tables

Landed (stage 2; `b5.md`): `diagrams.ts` with the six templates and `makeDiagram`,
`table-tools.ts`, `chart-tools.ts`, the Chart data and Table sections with their slot adapters,
the Diagram panel and pickers, the hover grid, `tables.spec.ts` and `charts.spec.ts`; schema
diagrams 83 tests, chrome 71.

Changed at merge 2: `makeDiagram` bound as `deps.diagrams` on the CLI, MCP and studio (request
5); the slots mounted through the route's `formatSlots` with `slide.id` adapted to B3's
`slideId` (request 1); `DiagramPanel` mounted (request 3); the two test mocks typed for `tsc -b`;
the `./inspector/chart` and `./inspector/table` exports (request 7). Requests 2 (the chart tail
ops through `chartTailOptions` and `chartTailPlan`, `insert.chart.<kind>` through
`chartBlockFor`, the table rows through `tablePlan`) landed in B3's day two; request 4 (B4's
`nextCellPointer` over merged cells) is open.

## B6 Hosted export batching, Blob snapshots, lint entry, eslint, e2e budgets, hygiene

Landed (stage 2; `b6.md`): the batched Perfect export (plan, batches, merge; the http forms
`?start=1`, `?batch=`, `?merge=`, `?cancel=`; `runBatchedExport` on the client), the immutable
per revision snapshots with the contention rule, the client safe lint entry and
`check-client-bundle.mjs` over the node builtins, `scripts/lint-packages.mjs` with the baseline,
the e2e budgets, the `/new` first write undo through the browser's own `replaceState`,
`hygiene.spec.ts`, `export-batch.spec.ts`, the hosted smoke rows; store 99 tests; the preview
measurement of the 85 slide GT deck batched export (264.8 s, peak 834.6 MiB, perfect).

Changed at merge 2: `pnpm install --frozen-lockfile` validated the hand written
`@turboslide/export` dependency (request 1); the Download dialog's batched path in
`on('export.run')` (request 2); `selectSoon` re-selects once when the card renders (request 3,
scoped after the first attempt remounted the shell); `deck.info` `counts.snapshots` (request 4);
Edit > Select all and Cut with the filmstrip focused, several cards in one write with no snackbar
(request 5); root `lint` (request 6); SPEC-2 8.2 carries the contention rule (request 7); step 6
asserts the bundle check on the merge 2 build (request 8); the two round one tests of 8a pass
(task 4 through the asset action's wait for its write, test 21 through Cmd+D running the store
action). Open for B2: `themeReport` exported for `merge.ts` (request 9). Open for B3: the
progress phases (request 10). For the verifier: the preview rerun of the batched export
(request 11).

## Integrator

Merge 1 (`integrator.md` sections 1 to 7): the 36 `on(...)` handlers over the store actions, the
hosted measurer facade, the readers' counts, `PLAYWRIGHT_BASE_URL`, the AGENTS.md exception, the
seam exports, the contracts. Merge 2 (sections 8 to 12): the client bundle leak closed
(`server/measure.ts`), the route wiring of the canvas, the bindings on every transport, R1 and
R2, the check steps 21 to 25, the 36 actions spec, the documents. What stays open is listed in
`integrator.md` section 12.

Fix round (`integrator.md` sections 13 to 17, after VERIFICATION-2 pass 1): the fidelity gate
measures per theme and check step 24 passes (finding 1); the stage signals its multi selection
to the route (`onMultiSelectionChange`), so Arrange > Group, Align and Distribute and Insert >
Link read the whole selection (finding 5); the right-click menus draw the shell's dynamic plates
(Change shape ▸, Mask image ▸, the presets, the line rows) and close on a pick (finding 6); the
committed GT deck is re-imported once so step 7 is byte identical again (finding 3); the
integrator's files are eslint clean, the `.vercel` build output ignored, and the other builders'
rows are listed per file for them (finding 8); `.prettierignore` covers `verification-2`
(finding 11). New tests: the Change shape plate in `ContextMenu.test.tsx` and a fourth test in
`gslides-actions.spec.ts` (two and three objects in the Arrange menu, the plate pick writing
`shape.set` and closing the menu).

## Deviations recorded

AGENTS.md "Deviations from the spec, recorded" carries the round two block: the SPEC-2 2.9
amendments as edited into the two specifications and `docs/freeform.md`, and each builder's
recorded deviations (B1 to B6) with the integrator's own at merge 2 (the fixture's diagram slide
as the template's output, the recordings at 1/64 px beside the fixture's integer `pos`, Cmd+D
through the store action, several cards in one write, the quiet lease, the devtools off under
automation, `selectSoon` at most twice, `counts.snapshots`).
