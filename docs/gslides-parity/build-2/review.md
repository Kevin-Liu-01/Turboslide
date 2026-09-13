# Review of the round two addendum

Reviewer's report on `docs/gslides-parity/SPEC-2.md` and `docs/gslides-parity/MILESTONES-2.md`, written 2026-09-12 against `main` at `a65b313`. Every fact below was read in this checkout: the two documents in full, `SPEC.md` sections 0, 2.4 to 2.7, 3, 4.3, 5.3 to 5.7, 6.7, 7, 10, 12, 13, 14, 15 and 16, `AGENTS.md`, `VERIFICATION.md` sections 9 and 10, the research reports R01 (Edit, Insert, Format, Arrange), R04 (B6, B7), R05 (A5 to A11, B1 to B16, C5 to C7, E1 to E4, unverified), R08 (A6 to A14, A24), R09 (A1 to A5, A12), R11 (A1 to A12), the pptxgenjs 4.0.1 declarations and runtime, and the source files each finding names. Severity 3 must be fixed before the build starts, 2 should be fixed, 1 is recorded.

Lenses, as the task set them: (a) Google behaviour in scope A to E omitted or watered down; (b) a field without a renderer, Perfect, Editable text or lint rule; (c) a UI capability without an action, CLI usage and MCP name; (d) contradictions with SPEC.md, AGENTS.md, the block document's rules or the perfect export invariant; (e) ownership overlaps and paths that do not exist; (f) engineering vocabulary a sales user meets; (g) risks the addendum does not name.

## Verified counts

- `packages/schema/src/actions.ts` `ACTION_IDS` holds 69 ids; the 34 rows of SPEC-2 section 3 make 103. The 34 MCP names are unique against the 55 existing ones.
- The preset list of SPEC-2 2.3 counts 99 + 26 + 4 + 6 = 135, no duplicates. 134 of them are in pptxgenjs's `ShapeType`; `foldedCorner` is not (finding 8).
- `decks/fixture/gslides` holds 7 slides. The 11.2 table lists 18 ids and its `background` row describes two slides (finding 3).
- `packages/fonts/export/fonts.json` holds 17 faces; `BUILD_VERSION` is 1; `reserved_font_name` in `scripts/build-fonts.py` reads name IDs 0, 7, 13, 14 and the notices file.
- `apps/studio/vite.deploy.config.ts` sets `maxDuration: 800, memory: 3009` for `/api/export/**`, `/api/render/**` and `/_serverFn/**`; `SYNC_EXPORT_TIMEOUT_MS` is 780 s (finding 5).
- The root `vitest.config.ts` projects are `packages/*`, `apps/cli`, `apps/render-worker` and `scripts`; apps/studio is not one (finding 9).
- `playwright.config.ts` fixes `baseURL` and `webServer` at 4321 and reads no environment variable (finding 4).

## Severity 3, fix before the build

### 1. The snapshot write order of 8.2 can make a losing writer's body the immutable document of a revision it never committed

`packages/store/src/blob-store.ts` lines 528 to 566: the commit point is `putDocument('deck.json', synced)` with `ifMatch`; the slides and the version record follow. Two instances that both read revision r compute r + 1 and, under 8.2, both store `snapshots/<r+1>.json` with `overwrite: false` before their `deck.json` push. The first snapshot upload wins the name; the `ifMatch` decides who wins the revision; nothing ties the two together. When the snapshot writer loses the `ifMatch`, `snapshots/<r+1>.json` holds a body the store never had, the winner's snapshot upload fails as "exists" and 8.2 says a snapshot that exists already "is left alone", so `pull()`'s fifth path and `documentAtRevision` serve the wrong document "proven by its immutable name". A second gap: 8.2 reads "when deck.json's head names revision r"; `head()` returns an etag, not a revision, and the CDN serves an overwritten `deck.json` body stale (the comment above `pull` records the measurement), so the revision must still be proven by hashing the fetched body to the etag before the snapshot is trusted.

Fix: key the snapshot by the md5 of the `deck.json` bytes the writer is about to push (the etag `head()` reports is the body's md5, measured 2026-09-11): `snapshots/<md5>.json`, `overwrite: false`, stored before `deck.json`. Two racing writers have different bodies and different keys; an identical body is the same document. `pull()` proves the current document with one `head()`: its etag names the snapshot, no body fetch, no revision read. The version record written by the same commit carries `snapshot: <md5>` so `documentAtRevision(r)` reads record r then the snapshot; a record without the key falls back to the replay. Retention prunes snapshots no record within the last 50 and no named version points at. Add the two-writer race to `hosted.test.ts` (the fake already stands in for two instances).

### 2. Autofit contradicts itself between 2.1.5, 0.23, section 5 and section 6

2.1.5 refuses `autofit` on a block without `pos` at severity 3. 0.23 says "placeholders to `shrink`, as Google (R05 A1)" and section 6 says "a placeholder of a layout with `shrink` (the layouts' `make` set it on their text and box blocks; grammar slot blocks have no `pos`, so nothing changes there)". Grammar placeholders are the only placeholders Turboslide has and they have no `pos`, so the layouts' `make` cannot write `shrink` without the validator refusing every new slide, and Google's default (R09 A5: "Shrink text on overflow. This is the default for theme text placeholders") is not delivered anywhere. Section 4.1 enables `format.textFitting` by `textBlockSelected`, which includes a heading or a paragraph on a grammar slide, so the section opens radios that cannot be written. B1 (validator) and B4 (the fit after commit) would build against different rules on day 2.

Fix: choose one and make the four places agree. The Google-faithful choice: `autofit` is allowed without `pos` on heading, paragraph, text and box blocks with the values `none | shrink` (`grow` needs `pos` and stays refused without it); the layouts' `make` writes `shrink` on their text placeholders; the editor's shrink step (the ladder) runs after a commit on grammar slides too and writes `typography.size`; `sheet/overflow` stays the rendered rule for `none`. The alternative: state that grammar placeholders keep the grammar's fixed sizes, drop the "placeholders to shrink" sentence, and gate `format.textFitting` on `positioned`.

### 3. The fixture deck's counts do not add up, and every acceptance line repeats them

11.2 says the deck "grows from 7 to 24 slides" and B1 delivers "17 new slides". The table has 18 rows (`styles`, `objects-title`, `rotated`, `grouped`, `shapes`, `lines`, `word-art`, `shadow`, `background`, `image-tools`, `table-merge`, `chart-bar`, `chart-line`, `chart-pie`, `diagram`, `bullets`, `spacing`, `autofit`), and `background` describes "a content slide with a `plate` background; a title slide with a picture background", two slides. 7 + 19 = 26. The numbers 24, 17, "24 pages", "8 batches and one merge" at `TURBOSLIDE_EXPORT_BATCH=3`, "the 24 fixture slides in both modes" appear in B1, B2, B6, the verifier, 8.1, 11.1 step 22, 11.3, 11.5 and 11.6.

Fix: give every slide one id (split `background` into `background-color` and `background-picture`, or merge), state the total once in 11.2 and derive the rest (26 slides, 9 batches of 3, 26 pages), and replace every literal count in MILESTONES-2 with a reference to 11.2's total.

### 4. The per builder Playwright acceptance lines cannot run as written, and parallel e2e specs write one shared decks folder

`playwright.config.ts` fixes `baseURL: 'http://localhost:4321'` and a `webServer` on 4321 with `reuseExistingServer: true` and reads no environment variable. B3's `[server 4432]`, B4's `[server 4434]`, B5's `[server 4435]` and B6's `[server 4436] playwright test …` lines therefore run against 4321, or start a server there, which AGENTS.md's dev server rule forbids for builders ("No other port, no second server on one checkout"; "Only the studio builder, the integrator and the verifier start it"). MILESTONES-2 names per builder ports without amending that rule. Every dev server on the shared checkout also uses the file store over the same `decks/`, so `objects.spec.ts`, `tables.spec.ts`, `charts.spec.ts` and `hygiene.spec.ts` creating and trashing decks in parallel clobber each other's fixtures and leave untracked decks in `git status` (VERIFICATION.md finding 14 records the audit doing exactly that). AGENTS.md also says "One browser page at a time: the machine is shared", and 8.5's budgets exist because two specs already fail under load.

Fix (integrator, day 1): `playwright.config.ts` reads `PLAYWRIGHT_BASE_URL` (or `TURBOSLIDE_PORT`) and skips `webServer` when it is set; every builder's server line carries `TURBOSLIDE_STORE=tmp` (B6's line already does) so no spec writes `decks/`; the round rules and AGENTS.md's dev server section gain the round's per builder port exception in writing; the milestone order serialises the Playwright runs (B4, B5 and B6 do not run e2e at the same time), or the budgets of 8.5 are measured under that load and not under a parallel export alone.

## Severity 2, should fix

### 5. The function limit in 0.31 and 8.1 is wrong, and the batch size follows from it

The addendum sizes the batch at 20 slides "each a synchronous function call under the 300 s limit". `apps/studio/vite.deploy.config.ts` line 88 sets `HEAVY = { maxDuration: 800, memory: 3009 }` for `/api/export/**`, `/api/render/**` and `/_serverFn/**` (the base function stays at 300 s), `SYNC_EXPORT_TIMEOUT_MS` is 780 s, and round one measured 190 to 222 s for 85 slides (SPEC 6.7). A whole GT deck already fits one call. Batching is still right (a Chromium crash or a slow instance fails one batch, not the file), but the reason and the size must come from measured numbers, and the merge call's memory is the risk the addendum does not name: 85 sheet PNGs at 2x plus the raster PNGs plus the built file in one 3009 MB function, downloaded from Blob inside the limit.

Fix: state the real limits and the measurement; derive `EXPORT_BATCH_SIZE` from the measured seconds per slide with a margin (about 240 s of work per batch, so around 60 slides at 2.5 s), keep `TURBOSLIDE_EXPORT_BATCH` as the override; in 8.1 step 3 stream parts from Blob to disk and build from paths, and record the merge's peak memory on the fixture and the GT deck in VERIFICATION-2.

### 6. The batched export has no retention, no idempotency rule and reads assets at the wrong time

8.1 stores `plan.json`, per slide scenes, sheet PNGs, raster PNGs and regenerated twins under `exports/<deckId>/<jobId>/parts/` and deletes them only through `cancelBatchedExport`. A tab that closes mid job (the common sales case) leaves every part in the store; nothing prunes them. A batch rerun after a failure writes the same paths with an unstated overwrite rule. The plan pins the deck revision through `documentAtRevision` but a picture asset replaced during the download is read at batch time.

Fix: `startBatchedExport` prunes jobs older than 24 h under the deck prefix; `exportBatch` writes parts with `overwrite: true` and answers the same result for a repeat; the plan records each asset's file hash and a batch answers `stale` when a hash moved; the dialog sends `cancelBatchedExport` on `pagehide` as a best effort (a fetch with `keepalive`; the server function client cannot, VERIFICATION.md finding 13 records why).

### 7. Rotation and the two export paths: the measurement and screenshot order is not designed

`packages/export/src/scene/extract.ts` measures the scene and takes the sheet and element screenshots in one page pass (lines 330 to 405). The addendum says the measurer reads boxes "with `.ts-measure` (transform none)" and stops there. Under that class the flatten sheet screenshot would be unrotated (wrong), and without it an element screenshot of a rotated icon or material is the axis aligned box of a rotated image, which pptxgenjs `rotate` then rotates again. `Range.getClientRects()` under a CSS transform returns transformed rects, so line boxes of rotated text need the class too. In the viewer, `measureBoxes` (`packages/viewer/src/Freeform.tsx` line 145) reads `getBoundingClientRect` of `.free` wrappers, which for a rotated wrapper is the bounding box of the rotated shape, so a ring drawn from it is wrong.

Fix: write the order into 1.7 and B2's deliverable: add `.ts-measure` to the sheet root, wait two frames, measure and take the element screenshots of rotated blocks (write `rotate` on them), remove the class, wait two frames, take the flatten sheet screenshot; the viewer's overlay takes the box of a positioned block from `pos` and applies the transform itself, and `measureBoxes` is used for layout blocks only.

### 8. pptxgenjs names in section 2 that the 4.0.1 declarations do not carry

Read in `node_modules/.pnpm/pptxgenjs@4.0.1/node_modules/pptxgenjs/types/index.d.ts` and `dist/pptxgen.cjs.js`:

- `foldedCorner` is not in `ShapeType`; pptxgenjs spells it `folderCorner`. The ECMA preset is `foldedCorner`. `shapes.test.ts` (11.5) asserts "a `prstGeom` pptxgenjs names", so it fails on the one row that is right. Assert against ECMA ST_ShapeType and let the builder pass the ECMA string (the runtime writes `prstGeom prst="<shape>"` for any string).
- `bentConnector3`, `curvedConnector3` and `custGeom` are not in `SHAPE_NAME` or `ShapeType` (zero matches in the declarations); `custGeom` exists at runtime only and `points` is typed on `ShapeProps`. The `addShape` calls of 2.4.1 to 2.4.4 need a cast and a sentence saying so.
- 2.2.13 writes `bullet: { code: '25CF' }` and `{ type: 'number', style: 'arabicPeriod' }`; the fields are `characterCode` and `numberType` (`code` is deprecated since 3.3.0, `style` does not exist). 2.2.12 has `characterCode` right, so the two rows disagree.
- 2.5.3 writes "`transparency` on the image"; `ImageProps` has `altText`, `flipH`, `flipV`, `hyperlink`, `rotate`, `rounding`, `shadow`, `sizing` and no `transparency`. Bake it with sharp (alpha) or write `<a:alphaModFix amt="…"/>` on the blip in the post-process.
- The `zerodigit` numbering preset ("01., a., i.") has no `ST_TextAutonumberScheme` value; export it as `arabicPeriod` and name the substitution in `residual`.
- `legendPos` has no `'b' | 'l' | 'r' | 't'` problem (all four exist), `HAlign` carries `justify`, `underline.style: 'sng'`, `strike: 'sngStrike'`, `outline`, `fit`, `rowspan`, `colspan`, `paraSpaceBefore`, `paraSpaceAfter`, `indentLevel` and `ShadowProps` are as the addendum says.

### 9. `export-batch.test.ts` in apps/studio never runs under `pnpm test`

The root `vitest.config.ts` lists `packages/*`, `apps/cli`, `apps/render-worker` and `scripts` and says "apps/studio is covered by Playwright, not by vitest"; `apps/studio/package.json` has no test script and `apps/studio/src/server/root.test.ts` already runs nowhere. B6's acceptance `cd apps/studio && ../../node_modules/.bin/vitest run export-batch` finds no config and check step 5 never sees the test.

Fix: put the plan, batch and merge logic in a framework free module with its test (`packages/export/src/batch/{plan,merge}.ts` and `.test.ts`, B2's package, or `packages/store/src/export-jobs.ts`, B6's) and keep `apps/studio/src/server/export-batch.ts` as the server function adapter; or the integrator adds `apps/studio` as a vitest project with the node environment and a `test` script. Either way name the owner.

### 10. Day 1 seams B3, B4 and B5 type against are not in a day 1 deliverable

- `packages/chrome/src/menus/model.ts` types `MenuActionId = ActionId | Gs1ActionId` and lists `GS1_ACTION_IDS` so round one's rows could name actions before B1 landed. B3's day 1 rows name 34 ids B1 lands in parallel; without a `GS2_ACTION_IDS` list the chrome does not type check until merge 1 lands both sides at once.
- The seams list says `EditorSelection`, `EditorShellInput.editor`, `TailKind`, `MenuEffect.submenu.dynamic`, `MenuClientHandler` and `DrawTool` change, but B3's day 1 deliverable (item 1) is "data only" and B4 and B5 start typing against them after merge 1. `PANEL_IDS` gains `'diagram'` and `DIALOG_IDS` gains `background`, `customSpacing`, `specialCharacters` (both in `editor-shell.ts`, B3) and neither is named.
- B3's `menuActionPlan` calls B5's `table-tools.ts` and `chart-tools.ts`, which B5 lands after merge 1; their function signatures are not fixed anywhere, so B3 cannot type check its plans until B5 is done.
- `packages/schema/package.json` (integrator) needs `./shapes` and `./diagrams` subpath exports at merge 1 for B3's pickers and B5's panel; the seams list names the modules but the merge 1 checklist does not.

Fix: add to B3 day 1: `GS2_ACTION_IDS` mirroring section 3 (collapsed by the integrator after merge 1), the `editor-shell.ts` type additions, the `PANEL_IDS` and `DIALOG_IDS` entries; add to the seams list the exported signatures of `table-tools.ts` (`tablePlan(block, selection, command): { mutations } | { action, input }`) and `chart-tools.ts`, or let B3 own two stub files B5 fills; add the package.json exports to merge 1.

### 11. `valign` and four sided padding are controls without a field row

4.2 says the Align dropdown "enables Top, Middle, Bottom on a `box`, `shape` or text box with `pos` (`valign` joins `box` and `shape` and `text`…)" and section 5's Text fitting section writes "Padding: Top, Bottom, Left, Right on a box or shape" through `block.set /padding`. `BoxBlock.padding` is one number (`packages/schema/src/blocks.ts` line 173), `ShapeBlock` has none, and no 2.x row gives `valign` or `padding` a validator, renderer, lint, Perfect, Editable text or CLI column, which is the shape section 2 promises for "every change".

Fix: add 2.2.18 `valign?: 'top' | 'middle' | 'bottom'` on box, shape and text with `pos` (CSS `display: flex; flex-direction: column; justify-content`; the measurer reads the line boxes as today; pptxgenjs `valign`; `turboslide block set <slide>#<block> /valign middle`) and 2.2.19 `padding?: number | { top; right; bottom; left }` (CSS padding; the text inset moves the measured box; pptxgenjs `margin` as a four number array; the CLI `block set /padding`).

### 12. Alt text on shapes, charts, lines and text boxes is a control that writes nothing

0.18 keeps alt text on the asset and section 5 shows Alt text for "every block that shows a picture, an icon, a shape, a chart" with the note "a shape or chart with no asset stores nothing and the field says so". Google's alt text is per element (R05 B7: "Description" field, Cmd+Option+Y on every object). A field a sales user types into that saves nothing breaks Kevin's agent parity rule too: the capability exists in the UI and no action carries it. The sentence the field would show also has to avoid "asset".

Fix: add `BlockBase.alt?: string` (optional, additive at version 1); `block.setAlt` writes it on every block that is not a picture and `asset.set` on a picture (two pictures sharing one asset keep sharing one description, as 0.18 records); the export writes `altText` from the block's `alt` for shapes, charts and text boxes (pptxgenjs `altText` exists on shapes, images and charts); `slide.get` returns it.

### 13. `layout/objects` at severity 1 fires on every Google style insert

1.6 makes every slide with a non empty `objects` layer a Check slides finding. 0.8 routes every insert from a draw tool, the Insert menu and the toolbar into `objects` on every non freeform slide. Together they make the Check slides count rise on each Insert > Text box, the first thing a sales user does. The message also reads "a grammar layout keeps the deck on the slot geometry (Apply layout moves content into slots)": "grammar layout", "slot geometry" and "slots" are engineering words in a default view surface (section 12 of SPEC.md lists "grammar" among the forbidden words; the default view words test does not read lint messages, so nothing catches it).

Fix: drop the rule, or fire it only when an object overlaps a layout block or leaves the content box (which `freeform/overlap` and `freeform/off-sheet` already cover), and rewrite the message in plain words: "Slide 4 has 2 objects placed over its layout. Apply layout moves content into the layout's boxes." Extend `default-view-words.test.ts` to lint messages and rule labels.

### 14. Stub clauses and strings carry process vocabulary

Section 12's clauses read "Equations are shapes this round", "Three levels this round", "Numbering starts at 1 in this round", "Comparing versions arrives in a later round", "Autofit defaults and autocorrect arrive in a later round", "Reflection and recolour arrive in a later round", "Media arrives in a later round", "Handouts arrive with the print round". A sales user does not know what a round is; round one used "in the next round" in one clause and the addendum multiplies it. The Equation editor row also stubs an item Google Slides does not have (12 itself says so), which contradicts "present in Google's position".

Fix: reword every clause without "round" ("Turboslide lists have three levels", "Numbering starts at 1", "Equations are inserted as shapes", "Reflection and recolour are not available yet", "Comparing versions is not available yet"); add "round" to `FORBIDDEN_DEFAULT_VIEW_WORDS`; remove the Equation editor row.

### 15. Rewriting the editable element's HTML from the runs loses the caret and the browser's undo stack

Section 6 and 7.2 say the editor "rewrites the editable element's HTML from the runs after each burst so the DOM matches the document" and that `execCommand('italic')` "and the like are not used". `packages/viewer/src/InlineText.tsx` line 760 applies bold with `document.execCommand('bold')` and reads the DOM back through `runsFromNode`; the addendum leaves bold on that path and names no rule for the caret. Replacing `innerHTML` while the user types collapses the selection to the start of the element and empties the browser's undo history (Cmd+Z inside the run then does nothing until the burst commits).

Fix: specify the rewrite: record the selection as plain text offsets into the Text before the rewrite, rewrite only at a burst boundary and only when `serializeRuns(runsFromNode(el))` differs from the canonical string, restore the selection by offsets after, and move bold onto the same path so the five marks behave alike; `inline-text.test.ts` asserts the caret survives a rewrite.

### 16. Cmd+[ and Cmd+] are Chrome's Back and Forward on macOS

Section 9 says the two chords "bind to indent with no collision". In Chrome on macOS they are history navigation; Google intercepts them with `preventDefault`. `packages/chrome/src/useEditorKeys.ts` line 141 returns early for a focused field unless certain modifiers are held, so a Cmd+[ that reaches the browser navigates the tab away from the editor (the deck is saved, the session is not).

Fix: the editor handles Cmd+[ and Cmd+] in every focus state and always calls `preventDefault`, doing nothing when no list item or text block is selected; `editor-keys.test.ts` asserts the default is prevented with focus in the notes pane, the filmstrip and a Format options field.

### 17. eslint `--changed` lints packages, not files

8.4 defines `--changed` as the packages whose files `git diff --name-only main` names, and B6's gate is `node scripts/lint-packages.mjs --changed` exit 0. VERIFICATION.md finding 6 counted 112 errors in 70 files at 12 GB, many in files this round does not touch (`packages/headless/src/context.ts`, `packages/export/src/verify/diff.ts`, `packages/lint/src/static/asset.ts`). Linting whole packages makes the gate unreachable unless every touched package is made clean, which the addendum does not budget.

Fix: `--changed` passes the changed files to eslint (`eslint <files>`), the whole tree run prints per package counts, and `pnpm lint` exits 1 only when a package's count rises above a committed baseline (`tooling/eslint-config/baseline.json`), which VERIFICATION-2 records.

### 18. 135 hand written path generators are not 44 hours of work

B1's estimate covers the schema fields, 34 actions with CLI and MCP, the fonts build, the lint rules, 19 fixture slides and `shapes.ts` with 135 presets each carrying `path(w, h, adjust)`, `textInset` and the guide list. Every one of those geometries is defined in ECMA-376's `presetShapeDefinitions.xml` as guide formulas and path commands, which is how Google (R05 E1 note) and every renderer draw them.

Fix: B1 writes one small interpreter for the ECMA formula language (the `avLst`, `gdLst`, `ahLst`, `rect` and `pathLst` elements; about fifteen operators) over the committed definitions file, so `path`, `textInset` and the `adjust` semantics of 2.3.2 fall out exactly and no preset is `approximate`; record the standard's terms in `THIRD_PARTY_NOTICES.md` (the definitions file is published with ISO/IEC 29500 and is redistributed by LibreOffice and python-pptx). Re-estimate B1 with the interpreter and give `shapes.ts` its own day.

### 19. Bullet levels are capped at three where Google nests deeper

R05 B5 reports five levels and R09 (findings, item 6) nine; the round two scope says "bullets get glyphs and levels". `PlainItem.level?: 1 | 2 | 3` and "Bullet levels 4 to 9" in section 12 water it down.

Fix: `level` 1 to 9, the preset's three glyphs cycling per Google's presets, `indentLevel` to 8 in pptxgenjs, 36 px per level; or record the cap as a decision for Kevin in VERIFICATION-2 rather than a round three item.

### 20. `numbered: true` reading as `marker: 'number'` changes an existing render

2.2.12 says "`numbered: true` reads as marker `number`". The round one numbered list draws a tabular numeral in the key position of the ruled list; Google's numeral form of 2.2.12 draws "1." at 24 px with the preset's numeral per level and no rule. The fixture slide `numbered` and every deck written since round one would change on screen while 0.4 promises the ruled list "keeps every existing deck byte for byte" (the bytes stay, the pixels do not). The GT deck has no `numbered` list, so compare-to-shoot would not catch it.

Fix: `numbered: true` keeps the round one rendering; only `marker: 'number'` draws the preset numerals; the Numbered list button writes `marker` from this round on; the `bullets` fixture slide holds both forms.

### 21. `chart/size` at severity 3 cannot fire

2.8.1's validator refuses more than 12 categories or 6 series; the lint `chart/size` (3) "over the caps" tests the same bound after the validator refused it, so the planted fixture slide cannot exist and `fixtures/index.json` would carry `null` for the rule, which `fixtures.test.ts` refuses.

Fix: make `chart/size` a legibility rule (more than 8 categories in a chart under 960 px wide, or a legend row under 15 px) at severity 2, or drop it and let the validator's message stand.

### 22. Edit > Select none stays a stub although it is one client handler

`edit.selectNone` is in the model as Later and section 12 keeps it there with the clause "Press Esc to clear the selection". R01 verifies the item and its chord (Ctrl+Cmd then U then A). Clearing the selection is a client handler the shell already has the pieces for (`onSelectBlock(undefined)`, the filmstrip's selection), and the round's mandate is every Google item that is not a service.

Fix: `client:selectNone` Now with `hasSelection`; the chord stays unbound with the shortcuts dialog note (a two key sequence is round three), and the row keeps Google's label.

### 23. Word art and the border controls on a text block

R11 A11: on word art "Border color and Border weight buttons apply to the letters". 0.14 makes word art a `text` block with `outline` and 4.2 leaves the text tail's Fill, Border color and Border weight disabled on text blocks ("Headings, paragraphs and text boxes have no fill or border"). Format > Borders & lines > Border color and Border weight (0.27) are enabled by `blockSelected` and would open a picker over a heading with nothing to write.

Fix: on a text block with `outline`, Border color and Border weight write `outline.color` and `outline.width` (and are enabled); the two menu rows take a predicate that holds only for blocks with a border field (`boxSelected | shapeSelected | imageSelected | lineSelected | tableCellSelected | wordArtSelected`).

### 24. A table cell border cannot be removed

2.7.2 types `cells[].border.weight` as `1 | 1.5 | 2` and 2.7.3 the table border the same. Google's Border color palette offers Transparent for cells (R11 A5) and the file model removes a border with `propertyState: NOT_RENDERED`.

Fix: allow `weight: 0` (the shape block already uses 0 for "no border") on `cells[].border` and `table.border`, render as no rule, export as `border: { type: 'none' }`.

### 25. `block.autofit` from the CLI or MCP leaves the document unfitted

2.1.5 and 0.23 say "the CLI writes the mode and the editor fits on the next commit". An agent that writes `autofit: shrink` on a local checkout gets a document whose text still overflows until a human opens the editor and commits, which is the opposite of "full agent queryability and editability esp on locals". The block document's rule (no render time fit) is right; the fit is a measured write, and the measurer exists in the render worker and in headless.

Fix: `block.autofit` gains `apply?: true`: on `window` the editor measures and writes at once; on `http` and `cli` the handler runs the headless measurer on the slide (the same path `render.slide` uses) and writes `pos.h` or the ladder step in the same write; `fix.run` gains the `freeform/overflow` fix that does the same for every finding.

### 26. Connector attachment is the visible half of connectors

Scope B names elbow and curved connectors. Google's connectors attach to shape anchor points and follow the shape (R05 E2 `startConnection`, `endConnection`). 0.12 ships the geometry and section 6 snaps a connector's end to a shape's anchors while drawing but records nothing, so the connector detaches on the first move of the shape. The addendum sends attachment to round three.

Fix: add the field now, additively, so the geometry does not have to change later: `ShapeBlock.connect?: { start?: { block: BlockId; anchor: 0..7 }; end?: … }`; the editor's `slide.update` for a shape move rewrites the attached connectors' `pos` in the same write; export writes `<p:cxnSp>` with `stCxn` and `endCxn` in the post-process. If it stays round three, list it in VERIFICATION-2 for Kevin as a Google behaviour within scope B that is held back.

### 27. The italic font's provenance and the notices file

7.1 says B1 "adds" `InterVariable-Italic.woff2` "from the Inter 4.001 release" and names no URL. The upright was decoded from the Prototemplate deck's `fonts/deck-fonts.css`, which carries no italic (`/Users/kevinliu/repos/Prototemplate/deck/fonts` holds only that file). `THIRD_PARTY_NOTICES.md` still reads "until it is answered, no renamed instance ships", false since M2. The headless readiness loads "every face the slide uses" and the italic face is a new one.

Fix: name the release asset (the rsms/inter v4.001 release zip, `web/InterVariable-Italic.woff2`) and record its sha256 in `fonts.json` `source.italic` and in the notices file; run `reserved_font_name` over the italic file's own name table (7.1 says so; make it a test); correct the notices paragraph; add the italic descriptor to the faces headless waits on (`document.fonts.load('italic 500 44px Inter')`); record the standalone build cost (about 470 KB of base64 for the second file under `turboslide build --budget 16`).

### 28. Groups in the post-process

`packages/export/src/ooxml/groups.ts` matches `<p:sp>` and `<p:pic>` only (`SHAPE_RE`), so a group holding a table or a chart (`p:graphicFrame`) is not wrapped, and the key rule "the part after the last `@`" gives the inner key for `@g:<tag>@<block>/row/<i>`, the reverse of the nesting 2.1.3 wants. A rotated group is written as per member `rotate` and `pos` (the `about: 'selection'` form), which 2.1.3 should say.

Fix: extend the regex to `graphicFrame` and `cxnSp`, define the key order (outer group first, then the row group), state the per member rotation rule, and add the nested case to `ooxml.test.ts`.

## Severity 1, recorded

29. 1.4 says "`packages/theme/src/gt-ink-paper/sheet.css` is untouched by the layer" while B2's Owns says sheet.css gains "`.objects`, `.slide-bg`". Pick one; and `packages/theme/src/tokens.ts` is unowned although the parity test fails when a new constant enters sheet.css without it.
30. 1.4 draws `<div class="objects">` "as the last child" of every slide. Draw it and `.slide-bg` only when non empty so the GT deck's DOM and the render snapshots stay byte identical.
31. Paths: `packages/store/src/blob-store.test.ts` is named "extended" in 11.5 and MILESTONES-2 but does not exist (`hosted.test.ts` does); `fonts.json` is `packages/fonts/export/fonts.json`; `docs/pptx.md` is B2's and the integrator's gate says "docs/pptx.md amended"; `docs/gslides-parity/build-2/` did not exist (created with this file).
32. 8.5 says the budgeted specs run beside `pnpm exec turboslide export`, which the round rules forbid builders; B6's acceptance already writes `node apps/cli/bin/turboslide.mjs`. Fix the sentence.
33. 2.7.1 says "covered cells keep their Text" and `table.merge` says the covered cells' Texts "join the anchor's". Google merges the text into the anchor and unmerge leaves the covered cells empty; state that merge empties them.
34. 2.6.2: a deck default background applies to "every slide without a `background`"; the picture kinds refuse their own and their picture is the background, so exclude opener, mood and closing from the default too.
35. 2.3.3 renders dash on a box with `border-style`; CSS has `dashed` and `dotted` only, not the six values. Draw a box's border as an SVG rect when `dash` is set, or limit box dash to `dash` and `dot`.
36. The chart is inline SVG, not a raster, so `lines/law` (which masks rasters and plated blocks) will read its axes and gridlines as chrome lines, and `dia/*` rules may run over it. Mask `.chart` like a raster or say which rules skip it.
37. `freeform/overflow` names a forbidden word (`freeform` is in `FORBIDDEN_DEFAULT_VIEW_WORDS`) and the rule is not freeform specific. Name it `text/overflow`.
38. The special characters table of about 600 names derives from the Unicode Character Database; the Unicode licence asks for its notice when the data is redistributed. Add it to `THIRD_PARTY_NOTICES.md`.
39. `DESTRUCTIVE_ACTIONS` should also carry `text.case` (lowercase loses capitals) and `chart.setKind` (pie drops series); `block.ungroup` is reversible and can leave.
40. `table.distribute` behaves differently per transport ("the editor passes the total; the CLI clears the widths"). Add `total?: number` to the input so every transport can do the editor's write.
41. `text.style`, `text.case` and `text.insert` take a `range` "in the plain text of the Text"; state that offsets count `\n` between paragraphs and that a range may cross a paragraph break.
42. Text fitting omits Google's Right indent (R05 B7: Left, Right, Special) and the autofit icon Google shows beside a new text box (R09 A5); Mask image omits Google's coloured mask handles and the double click to reposition the picture inside the mask (R05 B11); section 6 names no gesture for typing into a shape (R09 A1: a double click). Record each or add it.
43. Units: Google's Position and Custom spacing dialogs show inches or points; the addendum's fields are px as round one's are. Label the unit in the Custom spacing dialog ("Before (px)").
44. Columns export: one text box with `numCol` and one soft break per browser line rebalances in PowerPoint, so the Editable text lines will not match the screen inside columns. Name it in the report's `residual` and in `docs/pptx.md`.
45. VERIFICATION.md finding 5 (the hosting notice covers the first row of Insert > Image on a tmp store) is not in the round's hygiene list although it is one line in `edit.$deckId.tsx`; add it to the integrator's deliverables. Finding 13 (a lease outliving its tab) stays recorded.
46. 4.1's table omits the `format.changeShape` row that 4.3 and section 10 name, and `altEffect` on `slide.changeBackground` is a new `MenuItem` field the seams list does not mention.
47. "Bend" on connectors, "Points (read only count)" and "Pointer x, Pointer y" are Turboslide fields in Format options; mark them `turboslide: true` or drop the Points count (Google shows a handle, not a number).
48. Google's Format > Text > Font stays "Inter", disabled; the mandate reads "everything Google Slides does". Record the one face as the theme's decision in VERIFICATION-2's list for Kevin, beside the alt text and the connector decisions.
49. 8.1's dialog computes "about 3 minutes left" from batch times; say the estimate is recomputed after every batch and rounds to the half minute as SPEC 6.7 does.
50. The addendum's 13 says the pptxgenjs declarations were read for `IChartOpts.barDir`; the declared type is `string`, so the builder should assert `'bar' | 'col'` in its own type.

## What the addendum gets right, briefly

The overlay layer as a second list beside the grammar layouts (1.1), the flat group tag, the mark span rule with one bracket shape, the explicit autofit writes, the object naming that lets the post-process write `avLst` and `numCol`, the chart as inline SVG with native `addChart`, the diagram as ordinary grouped blocks, the retained round one Later stubs with one clause each, and the 34 actions with a CLI usage and an MCP name for every UI capability except the two named above (alt text on non pictures, autofit applied outside the editor). Section 13's list of unverified Google facts is honest and complete for the surfaces it covers.

## Lens index

- (a) omitted or watered down: 2, 12, 19, 22, 23, 24, 25, 26, 42, 48.
- (b) fields without a rule: 8, 11, 21, 35, 36, 44.
- (c) capabilities without an action: 12, 25, 40.
- (d) contradictions: 2, 3, 13, 20, 29, 30, 32, 33, 34, 46.
- (e) ownership and paths: 4, 9, 10, 29, 31.
- (f) vocabulary: 13, 14, 37, 43, 47.
- (g) risks: 1, 5, 6, 7, 15, 16, 17, 18, 27, 28, 38, 39.
