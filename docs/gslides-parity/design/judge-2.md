# Judge 2: the document, renderer, linter and export owner

Written 2026-09-11 against Turboslide `main` at `8c7056c`. Judge 2 of 3 for the Google Slides parity round. The standpoint is the engineer who owns the block document (`packages/schema`), the string renderer (`packages/render`), the grammar linter (`packages/lint`) and both PPTX modes (`packages/export`). The questions asked of every proposal: does it keep one truth (the studio, the viewer, the CLI, MCP, the linter and both exports read the same document and agree on what it means), is every new object exportable in Perfect and in Editable text, are the schema changes and migrations sound, and can four to six builders ship it in one round without breaking `pnpm check`.

## What was read and what was verified in the code

The three proposals were read in full: `proposal-1-faithful.md` (663 lines), `proposal-2-sales.md` (873 lines) and `proposal-3-architecture.md` (670 lines). Research reports R02, R03, R06, R07, R09, R10 and R11 were read where a proposal leaned on them for a document or export claim.

Code facts checked at `8c7056c`, because the proposals disagree about them or build on them:

- `packages/schema/src/text.ts`: `textSchema` is `z.string()` with one refinement that refuses `\n` and `\r`. An empty string passes. The parser has three run flags, `b`, `gt` and `link`; there is no italic, no break token.
- `packages/schema/src/position.ts`: `Position` is `{ x, y, w, h, z? }`, a `strictObject`. No angle, no flip, no fit.
- `packages/schema/src/blocks.ts`: `BlockBase` is `{ id, ext?, pos? }`. `box` and `shape` are separate block types; `shape` has no text. `SHAPE_KINDS` is five kinds. `shot.crop` is `'top' | 'center'`; `shot.border` is a boolean.
- `packages/schema/src/deck.ts`: `SCHEMA_VERSION` is 1 and is a `z.literal` on every slide and the manifest. `deckSchema` is a `strictObject` with `defaults: { notes? }` only and no `ext`; `theme` is the enum `THEMES`. `SlideBase` has `ext` and no `skip`. Unknown keys are `unknown_field` at severity 3 (`validate.ts`), so every new field is a schema change, not an `ext` convenience. An `ext` entry on a slide is reported at severity 1 on every read (`ext data kept at ...`).
- `packages/schema/src/migrations.ts`: one migration exists (stamp 0 to 1); `migrate` reports `ahead` when a file claims a newer version, and `validateDeck` then refuses the slide.
- `packages/schema/src/mutations.ts` and `reduce.ts`: `text.replace` is declared and implemented in the reducer (range replace on a string path); `slide.replace` exists and returns the old slide as its inverse. `locateBlock` searches top level blocks of the slots or the plate only. `DECK_SET_ROOTS` is `title`, `theme`, `defaults`.
- `packages/schema/src/actions.ts`: 54 action ids (the brief's 62 is wrong; every proposal noticed). `slide.insert`, `slide.setLayout`, `block.order` exist.
- `packages/schema/src/export.ts`: `ExportFormat` already names `pdf` with no builder; `NATIVE_BLOCK_TYPES` holds twelve types including `text`, `box`, `shape`, `rule`.
- `packages/export/src/scene/measure.ts` and `types.ts`: text is measured from `[data-run]` elements through `Range.getClientRects` (axis aligned boxes), shapes from the svg's box; `SceneRect.role` includes `box` and `shape`; `SceneText.group` and `SceneRule.group` already feed `ooxml/groups.ts`, which wraps shapes whose object names share an `@key` suffix in one `<p:grpSp>`.
- `packages/export/src/pptx/text.ts`: one `softBreakBefore` per browser line; `strike`, `hyperlink` with a hairline underline; flatten writes `transparency: 100`. pptxgenjs is 4.0.1 and its type file exposes `addTable`, `rotate`, `flipH`, `flipV`, `line.dashType`, `hyperlink.slide`, `bullet`, `indentLevel`, `breakLine` and `fit`, so Proposal 3's pptxgenjs claims hold.
- `packages/fonts/export/fonts.json`: the one source font, `InterVariable.woff2`, has axes `opsz` and `wght` only. There is no italic axis and no italic cut in `packages/fonts/export/` (18 upright instances). `scripts/build-fonts.py` mentions italic once, to clear the fsSelection bit.
- `packages/chrome/src/slide-templates.ts`: fifteen templates in the React package, importing `IconName` from the chrome `icons` module; `PLACEHOLDER` holds the sixteen contrast pair strings. `packages/store`, `apps/cli`, `packages/mcp` and `packages/agent` do not depend on `@turboslide/chrome` (their `package.json` files), and SPEC 3.3 rule 3 forbids it.
- `decks/`: zero slide files carry a `box` block and zero carry a placeholder string, so a migration that rewrites either touches nothing in the repository (the Blob store's test decks were not read).
- `packages/viewer/src/InlineText.tsx`: `Enter` commits, `Escape` restores the original markup, `BR` nodes are dropped at commit, `spellcheck` is set false.
- `scripts/check.mjs`: 19 steps; step 3 diffs the generated contracts, step 12 is compare to shoot at 0.5 percent on the GT deck, step 15 lints every slide, step 18 is the chrome lint at three widths in two themes. `packages/agent/src/__tests__/coverage.test.ts` requires every action id to be named in at least one test file and to carry an example that parses.
- `docs/EDITOR-DEPTH-STATUS.md` section 10: the Perfect export of 85 slides takes 190 to 222 s inside the 300 s function.

## Findings per proposal

### Proposal 1, the faithful clone

What it gets right in my lane: every object model row in section 7 names its Perfect and Editable text path; skip, background, counter, guides, dash, vertical alignment, block links and the table block are additive optional fields with sound paths; the layout data moves out of chrome into `packages/schema/src/layouts/`; the `pos.group` tag is the cheapest group model that still exports (the `groupShapes` post process already keys on a name suffix, and the blocks stay flat, so `locateBlock`, the validator's `pos` rule and the measurer are untouched); risk 11 (table cells flood the copy linter) is a real defect the other two miss; the menu model as data with a generated completeness test and a shortcuts fixture is the right acceptance shape.

Where it breaks one truth or misjudges the cost:

1. `ext.parked` (section 5.4 step 3). Blocks that do not fit Title slide or Main point are moved under `ext` with a notice. Nothing renders `ext`, `blockTexts` does not read it, the linter does not see it, neither export carries it, `slide.list` does not report it, and the validator flags every slide that carries `ext` at severity 1. That is content in the document with no surface, which is the definition of a second truth. The reps' path is fine (Undo), but the document is not.
2. `placeholder` role on `BlockBase` plus `placeholders: true` on the slide (section 7 row 1). The block type and its position already say what a block is, and Proposals 2 and 3 derive the same mapping without a field. A role field is a second description that every agent and every migration must keep in step; it also has no export or lint meaning.
3. `fit` on `pos` with grow and shrink at render time (section 7). `renderSlide` is a string renderer with no DOM; it cannot measure text to grow a box or step a size. Proposal 3 has the sound form: the editor measures and writes explicit `pos.h` or `typography.size`, and the document stays explicit.
4. `theme.variant` (section 5.1). `theme` is the `THEMES` enum on the manifest; turning it into an object breaks every reader of `deck.theme` and the export's theme selection. `defaults.appearance` or `defaults.theme` (Proposals 2 and 3) is additive.
5. Italic as "a fifth rule" this round (section 7, 2.5). The source font has no `ital` axis and the export set has no italic cut, so italic is a second source font (InterVariable Italic), an OFL check, `build-fonts.py`, `fonts.json`, `fonts-map.ts` (`EXPORT_WEIGHTS`), the studio's `@font-face`, the parser, the renderer, `InlineText` and the scene style. The proposal budgets "an Inter italic instance in fonts.json". It is a round of its own, and it contradicts SPEC 4.2. Later stub.
6. Rotation (section 7) is shipped without a word on the measurer: `Range.getClientRects` returns rotated quads and the verify loop's per block ink boxes assume axis aligned text. Proposal 3 at least names the transform off measurement. Neither belongs in this round (see the rejections).
7. Scope. Eleven fields, two blocks, nine actions, italic, rotation, groups, charts, tables, the presenter console, Publish to the web with pinned versions, view tokens, trash, and a designed PPTX importer, over six builders. The cut line (B6 plus rotation, group and chart rows of B2) is named, which is honest, but the round as written is not one round.

Fidelity is the highest of the three: Print stays on the toolbar in Google's position, the first eleven layouts carry Google's names in Google's order, the Download list is Google's with Google's labels, and unverified Google facts are marked at the point of use.

### Proposal 2, sales first

What it gets right in my lane: the document changes are the smallest set that closes the ten tasks, and every one is additive (`skip`, `defaults.theme`, `defaults.counter`, `trashedAt`, `numbered` on `plain`, the `table` block, the paragraph break scoped to four Text pointers and cells); empty Text plus a live prompt is the right placeholder model (an empty string already passes `textSchema`, and the renderer's `live` option already exists in `RenderOptions`); the table block names a fallback (the ruled rows construction of SPEC 8.2) if `addTable` drifts past budget; charts, autofit, groups, guides and free crop are deferred with reasons; the Download dialog defaults strip notes and skipped slides and say so; PDF has a fallback (the browser's print); the paragraph break's blast radius is bounded (`rows`, `plain`, headings and slide fields stay one line); the ten tasks are counted against today and against Google; appendix B gives the builders one vocabulary.

Where it is wrong or under specified in my lane:

1. The layout list stays in `packages/chrome/src/slide-templates.ts` (section 5.1, B1's file list) while `slide.applyLayout` and `slide.import` are actions with CLI and MCP transports and the Sales starter is a store template. The store, the CLI and the MCP server cannot import the React package (SPEC 3.3 rule 3; none of them depends on `@turboslide/chrome` today). The list must move to `packages/schema` as Proposals 1 and 3 do, or the actions cannot be implemented on every transport.
2. `ext.layout` as the layout identity (section 5.3, row 7.19). Every templated slide would carry `ext`, and `validateSlide` reports `ext data kept at /ext/layout` at severity 1 on every read, so the lint count of a fresh deck rises by one per slide and the escape hatch becomes a first class field in disguise. A first class optional field on `SlideBase` (for example `template?: string`, since `ContentSlide.layout` is taken by the grammar layout) is the sound form. Row 7.13's `ext.guides` on the deck has the same problem plus one more: the manifest has no `ext` at all.
3. B1 owns `packages/schema`, `packages/render`, `packages/lint`, the chrome templates and the store templates. That is the whole parity chain in one builder, which is the round's long pole and its single point of failure; Proposal 3's split (document first, renderer and export second) is the right shape.
4. Tab in the last table cell appends a row (row 7.5). R11 marks Google's behaviour unverified and the array write makes a row cheap, but an accidental Tab at the end of a pricing table grows the document; a toast with Undo is needed if it ships.
5. Rotation is omitted rather than shipped later (section 2.7). For the document that is the right call this round; for the menu a disabled Arrange > Rotate with a tooltip keeps Google's position and costs nothing. Small.
6. "Title only" is not offered (section 5.2). Fidelity, not my lane, but a `split` with an empty body is one template entry.

Everything else in section 7 checks out against the code: `skip` on `SlideBase`, `numbered` as a tabular numeral run in the existing text box export, the slide link forms `#s/<id>` mapped to `hyperlink.slide` (pptxgenjs has it), `deck.defaults.counter` honoured by the frame's counter, the view payload stripping (`apps/studio/src/server/decks.ts` line 119 carries `notes` today, as R10 B8 says).

### Proposal 3, document and export first

What it gets right in my lane: this is the only proposal that treats the parity chain as the design. Every object in sections 7.2 to 7.6 names its field, renderer rule, lint rule, Perfect path, Editable text path with the pptxgenjs option (all verified present in the 4.0.1 types), and what is refused. Autofit is explicit editor writes, which is the only form a string renderer can honour. `text.replace` is implemented for a coalesced undo (SPEC 6.7 asked for it; the reducer already has the case). The layout list moves to `packages/schema/src/layouts.ts` so the CLI, MCP, the editor and `template.json` read one table. `slide.new`, `slide.skip`, `slide.duplicate`, `block.duplicate`, `deck.list`, `deck.copy`, `deck.trash`, `deck.restore`, `deck.remove`, `export.text` and `view.zoom` are first class actions, so the CLI and MCP gain them with the menu item. The PDF path is designed on the render worker with a `pdftoppm` verify, which matches SPEC 3.3 rule 7. Perfect is correctly stated as needing no new writer for a visual change as long as new text renders through `data-run`. The GT deck's compare to shoot gate on every branch is the right regression proof. The dependency order (B1 first, two days) is right.

Where it overreaches or is unsound:

1. The box to shape fold (7.1 step 2) is a non additive type removal. It touches `blocks.ts`, `catalog.ts`, `export.ts` (`NATIVE_BLOCK_TYPES`), the renderer's primitives, `SceneRect.role`, `lint/static/export-non-native.ts`, the chrome Insert menu and palette data, `docs/freeform.md`, the skills references and the render snapshots, for zero stored `box` blocks. Two ways to write a rectangle with text is a real smell, but folding them is a cleanup round, not a parity round, and it forces the schema bump.
2. Migration step 3 rewrites the fifteen placeholder strings to empty (7.1). A migration that changes content is a content edit run silently on read; a deck whose author typed one of those sentences on purpose loses it on the next save with no version note. Render the known strings as prompts in live mode, or leave them; do not rewrite them in `migrate`.
3. The nested `group` block with relative child positions (7.2). The freeform round's invariant is that `pos` lives on top level blocks only (`validate.ts` line 193), `locateBlock` searches top level lists, `freeform/overlap` and `freeform/off-sheet` read top level boxes, and the measurer tags `[data-block]` leaves. A nested group changes all four and adds relative coordinates to the document. Proposal 1's flat tag exports through the same `grpSp` post process at a fraction of the cost. Groups are not in the ten tasks; defer.
4. Charts now, with "the values are drawn as text with `data-run` so the numbers are searchable" (7.5). The measurer walks `[data-run]` carriers with `Range.getClientRects`; the `dia` block's SVG text is a raster today and no code path measures SVG `<text>`. The claim is unproven. If a chart ships, its text is a raster and the report says so, or the measurer gains SVG text support first.
5. Transitions with a new `<p:transition>` OOXML writer and present mode animation (7.6). R07 says do not invest; the writer, the present animation and the reduced motion path are new work for a feature no rep asked for. Later stub in the Motion panel.
6. Rotation and flip with the transform off measurement (7.2). The design is sound and the risk is named (risk 2), but the verify loop's per block ink boxes, the off sheet lint, both writers and the viewer's overlay all change, for an Arrange item R07 does not list. Later.
7. 24 shape presets with 24 SVG path generators and `SceneShapeKind` mappings (7.2). Not in the ten tasks. Later, additive.
8. The size. Section 12 risk 10 says it: the largest round the repo has had. The cut line (B1, B2, B4) is right, but the proposal as written needs two rounds.
9. Print leaves the toolbar head and compact mode hides the title row (sections 1 and 3.1); the layout labels are GT words where Google has a name ("Head over body" for Title and body). Fidelity, not my lane, noted for the synthesis.

Apply layout refusing when content would be lost (5.3) is honest for the document and stricter than Google; Proposal 2's drop with a named Undo toast keeps the rep moving and keeps the document consistent through one `slide.replace`. Either is acceptable to me; the synthesis should pick one and say so.

## Scores

Each criterion 1 to 10. Total is the sum.

| Proposal | Fidelity to Google Slides | Ease for sales users | Architecture fit | Buildability in one round | Aesthetic fit with Prototemplate | Total |
| --- | --- | --- | --- | --- | --- | --- |
| Proposal 1, faithful | 9 | 7 | 5 | 4 | 7 | 32 |
| Proposal 2, sales first | 7 | 9 | 7 | 7 | 8 | 38 |
| Proposal 3, architecture | 8 | 7 | 8 | 5 | 7 | 35 |

Notes on the numbers. Proposal 1's architecture score carries `ext.parked`, the `placeholder` role, `fit` on `pos`, `theme.variant` and the italic cost; its buildability is the scope. Proposal 2's architecture score loses two points for the layout list left in chrome and the `ext.layout` identity, both graft fixable; its buildability is the best because the document changes are additive and bounded and every large item names a fallback. Proposal 3's architecture score is the highest method with three unsound moves (the fold, the content rewrite, the nested group); its buildability is the size.

## Winner

Proposal 2 wins, with Proposal 3's document method as the mandatory spine of the synthesis. Proposal 2 is the one that ships in one round without breaking `pnpm check`: every field is optional and additive at `schemaVersion` 1, the one large new object (the table) has a stated export fallback, PDF has a fallback, and the deferred items (charts, groups, autofit, guides, rotation, italic) are exactly the ones whose export or measurement path is unproven today. Its two architectural mistakes (the layout list in chrome, `ext.layout`) are corrected by taking Proposal 3's `packages/schema/src/layouts.ts` and a first class `template` field. Proposal 3 is the better document design and the worse round: its migration bundles a type removal and a content rewrite the round does not need, and its group block breaks an invariant four packages rely on. Proposal 1 is the best map of Google and the weakest document.

## Grafts the synthesis must keep

From Proposal 3:

1. The layout list moves to `packages/schema/src/layouts.ts`, framework free, one ordered table with a `make` per entry, read by the New slide arrow, the Layout button, Slide > Apply layout, the filmstrip menu, `template.json`, `turboslide slide new --layout` and the MCP tool. Chrome imports it; the store, the CLI and MCP import it; nothing imports chrome.
2. `slide.new` as an action over `slide.insert`, so the CLI and MCP insert a layout by id with empty texts.
3. Section 7's table form as the acceptance document for the document and export builders: for every new field, the renderer rule, the lint rule, the Perfect path, the Editable text path with the pptxgenjs option, and what is refused with the reason. New text renders through `data-run` or it is not searchable in Perfect.
4. `text.replace` used by `InlineText` with the 400 ms coalescing pause, so one Cmd+Z removes one burst of typing (SPEC 6.7).
5. Autofit, when it ships, as explicit editor writes to `pos.h` and `typography.size`, never as a render time behaviour.
6. `deck.list`, `slide.skip`, `slide.duplicate`, `block.duplicate`, `export.text` and `view.zoom` as first class actions beside Proposal 2's seven, each with the coverage test the contracts step requires.
7. The PDF builder on the render worker (`renderStandalone` output, `@page { size: 13.333in 7.5in; margin: 0 }`, one sheet per page, `pdftoppm` verify) as the implementation of Proposal 2's PDF item, with Proposal 2's fallback to the browser's print if it misses the gate.
8. The migration test that asserts the GT deck and the template change by nothing (or by the version stamp alone if a stamp is chosen), and compare to shoot on every builder's branch.
9. `defaults.appearance` (or Proposal 2's `defaults.theme`) in the manifest's `defaults`, read by present mode, thumbnails and the export default.
10. Skipped slides removed from present mode, `/deck`, `/embed`, thumbnails' play list, PDF and PPTX unless asked, and the Share dialog stating it.

From Proposal 1:

11. The menu model as data with a generated completeness test, a shortcuts fixture test against R04, and the default view words test (no lint, source, lease, revision, grammar, freeform, kind or toolchain outside Tools).
12. The copy linter skips table cells (risk 11), or a 20 cell pricing table produces 20 findings in Check slides.
13. Theme starter pictures copied into every new deck so Section header, Caption and Closing work on a blank deck (Proposal 2 section 6.1 agrees).
14. If groups ship at all, the flat `pos.group` tag, exported through the existing `groupShapes` post process; not a nested block.
15. Block `link` on `BlockBase` with the relative slide forms and the export as `hyperlink` on the shape or picture, alongside Proposal 2's `#s/<slideId>` run link.

From Proposal 2, kept as the skeleton:

16. Empty Text plus a live prompt as the placeholder model; `copy/empty-placeholder` at severity 1 so Check slides still names unfinished slides.
17. The `table` block with Tab and Shift+Tab in `InlineText`, the nine row and column commands as `block.set` writes, `addTable` in Editable text behind a per cell verify budget, and the ruled rows construction as the fallback.
18. `numbered` on `plain` as the numbered list; the bullet glyph stays a grammar decision for Kevin.
19. The paragraph break scoped to `paragraph`, `text`, `box` and table cell Texts, with `rows`, `plain`, headings and slide fields one line, as a SPEC 4.2 amendment; a second `multilineTextSchema` rather than a change to `textSchema`, so `text.replace` and every other Text keep the one line rule.
20. Download defaults that strip notes and skipped slides, with the two checkboxes.

## What must not ship

1. Proposal 1's `ext.parked`: content in `ext` that no renderer, linter, exporter or listing reads. Apply layout drops with a named Undo toast (Proposal 2) or refuses (Proposal 3); it never hides.
2. Proposal 1's `placeholder` role field and `placeholders: true` slide flag: a second description of what a block is. Roles derive from block type and order.
3. Proposal 1's `fit` on `pos` with render time grow and shrink: the string renderer cannot measure.
4. Proposal 1's `theme.variant`: turns the `theme` enum into an object and breaks every reader. Use `defaults.appearance`.
5. Italic this round (Proposal 1): the source font has no italic axis and the export set no italic cut; it is a font build, a licence check, a parser rule, a renderer rule and a scene style at once. Later stub with the tooltip.
6. Proposal 3's box to shape fold and the removal of the `box` type: a non additive rewrite across render, export, lint, chrome, skills, docs and snapshots for zero stored box blocks. Its own round, if ever.
7. Proposal 3's migration step that rewrites placeholder strings to empty: a content edit inside `migrate`. Handle known placeholder strings at render time in live mode, or leave them.
8. Proposal 3's nested `group` block: breaks the top level `pos` invariant of the validator, `locateBlock`, the freeform lint and the measurer. Groups are deferred; if needed, the flat tag.
9. Rotation and flip this round (Proposals 1 and 3): the measurer, the verify ink boxes, the off sheet lint and both writers change for a gesture outside the ten tasks. Arrange > Rotate present and disabled with a tooltip.
10. Transitions with a `<p:transition>` writer and present mode animation (Proposal 3): R07 says do not invest. Later stub.
11. Charts now (Proposals 1 and 3): the searchable labels claim rests on SVG text measurement that does not exist. Later, or raster text with the report saying so.
12. Thirteen or twenty four new shape presets now (Proposals 1 and 3): not in the ten tasks; additive later.
13. Proposal 2's `ext.layout` and `ext.guides`: `ext` fires a severity 1 issue per slide and the manifest has no `ext`. A first class optional `template?: string` on `SlideBase`; guides as `Deck.guides` when they ship.
14. Proposal 2's layout list left in `packages/chrome`: SPEC 3.3 rule 3. Move it to schema.
15. Proposal 1's PPTX importer inside this round (all three agree it is later; Proposal 1 designs it in detail and names it later, which is fine as a document, not as work).
16. A `schemaVersion` bump for its own sake. With the rejections above every field the round adds is optional, so the round stays at version 1 with no migration and no `ahead` refusals for a stale client. If the integrator prefers the stamp, the migration is stamp only and the 86 GT deck files are re-stamped in one commit so step 15's lint count does not gain 86 `migrated` rows.

## The document scope I would hand the builders

Fields, all optional, all at `schemaVersion` 1: `Slide.skip?: true`; `Slide.template?: string` (the layout id); `Deck.defaults.appearance?: 'light' | 'dark'`; `Deck.defaults.counter?: 'on' | 'off' | 'skip-title'`; `Deck.trashedAt?: string` (added to `DECK_SET_ROOTS` or written by the store); `PlainBlock.numbered?: true`; `BlockBase.link?: string | { slide: SlideId | 'next' | 'previous' | 'first' | 'last' }`; the `table` block capped 20 by 20 with `data-run` per cell; a `multilineTextSchema` on `paragraph.text`, `text.text`, `box.text` and table cells. Validator rules: `table` size, `skip` anywhere, `template` any slide. Lint: `copy/empty-placeholder` (1), `table/size` (3), the copy rules skipping cells. Renderer: prompts in `live` mode only, `\n` as `<br>` in the four Texts, the table grid in the `.rows` idiom, the numeral in the key position, the `<a>` wrapper for block links active outside the editor. Export: skipped slides and notes behind `includeSkipped` and `includeNotes`, empty Texts skipped, `addTable` behind the per cell budget with the rows construction as the fallback, `hyperlink` on runs and shapes, PDF on the worker, TXT from `blockTexts` and `slideTexts`, JPEG from the render route. Actions: `slide.new`, `slide.duplicate`, `slide.skip`, `slide.applyLayout`, `slide.import`, `block.duplicate`, `text.replaceAll`, `deck.list`, `deck.copy`, `deck.trash`, `deck.restore`, `deck.remove`, `export.text`, `view.zoom`, each with a test the coverage test finds. Gates: step 3 contracts current, step 12 compare to shoot under 0.5 percent, step 15's GT lint count not higher, `turboslide export check` valid in both modes on a fixture deck with one of every new object.

## Decisions for Kevin that the document cannot make

1. SPEC 4.2 line 316 ("No line breaks inside a string except in panel.code"): amend to allow a paragraph break in `paragraph`, `text`, `box` and table cell Texts.
2. SPEC 8.2 ("Rows are five hairlines plus key and value boxes, never a PPTX table"): scope the sentence to `rows`; the new `table` block is a PPTX table in Editable text.
3. SPEC 2.1 ("Ruled rows and lists instead of bullets"): whether Bulleted list makes a ruled list (Proposal 2) or a glyph bullet (`marker`, Proposal 3). The numbered form ships either way.
4. Italic, rotation, transitions and shape presets: later stubs this round under the reasons above; each reopens a written rule when it ships.
5. Apply layout on a busy slide: drop with a named Undo toast (Proposal 2) or refuse with a count (Proposal 3).

## Sources

Proposals: `docs/gslides-parity/design/proposal-1-faithful.md`, `proposal-2-sales.md`, `proposal-3-architecture.md`, read in full 2026-09-11. Research reports read for the claims checked: `docs/gslides-parity/research/02-editor-surface.md` (section 4.1, the toolbar head with Print), `03-home-themes-layouts-io.md` (b.2 layout names, finding 3 on apply layout), `06-turboslide-inventory.md` (section 2 keys, section 4 templates), `07-sales-users.md` (top tasks, frustrations on transitions), `09-canvas-text-editing-model.md` (findings 2 and 7, Part B), `10-identity-sharing-and-presence.md` (A15, B6, B8, B9, C3), `11-tables-charts-and-numbers.md` (summary items 2, 3, 6; the 20 by 20 cap from Google help 1696711; charts as images from the Slides API `sheetsChart`).

Repository files read at `8c7056c` on 2026-09-11: `packages/schema/src/{text,position,migrations,mutations,deck,blocks,export,reduce,validate,catalog,actions}.ts`, `packages/schema/src/rules.json`, `packages/export/src/scene/{types,measure}.ts`, `packages/export/src/pptx/{build,text}.ts`, `packages/export/src/ooxml/groups.ts`, `packages/export/src/verify/budgets.ts`, `packages/lint/src/static/{copy,export-non-native}.ts`, `packages/render/src/{slide,text}.ts`, `packages/viewer/src/InlineText.tsx`, `packages/chrome/src/{slide-templates.ts,package.json}`, `packages/store/src/{templates,hosted,store,blob-store}.ts`, `packages/fonts/export/fonts.json`, `packages/agent/src/__tests__/coverage.test.ts`, `apps/studio/src/routes/index.tsx`, `apps/studio/src/server/decks.ts`, `scripts/check.mjs` (`--list`), `node_modules/.pnpm/pptxgenjs@4.0.1/node_modules/pptxgenjs/types/index.d.ts`, `docs/spec/SPEC.md` (2.1, 3.3, 4.2, 6.7 to 6.10, 8.2, 8.5, 8.6), `docs/freeform.md` (sections 1, 2, 4, 7), `docs/EDITOR-DEPTH-STATUS.md` (section 10), `docs/pptx.md` (headings), `AGENTS.md` (parity chains).
