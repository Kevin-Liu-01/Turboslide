# Judge 2, the document, the renderer, the exports and present mode

Judge 2 of 3 for design-5, written 2026-09-14 against `main` at `d5d7f07`. The angle is the engineer who owns the block document, the string renderer, the PPTX, PDF, HTML, ODP and SVG exports and present mode: one truth, the OOXML post processes, the honesty of the import mapping, the Perfect still rule, the fixtures, and whether six builders can land the round in ten days without touching each other's files.

The three proposals were read in full. Every claim that decides a score was checked against the research reports (R01, R04, R05, R09, R11) or against the code at `d5d7f07` with `git show`. Nothing was run, installed or committed; the working tree's round four edits were not read as code.

## Scores

| Proposal | Fidelity | Ease for sales | Architecture fit | Export fidelity | Buildability | Total |
| --- | --- | --- | --- | --- | --- | --- |
| Proposal 1, Google faithful | 9 | 6 | 6 | 7 | 5 | 33 |
| Proposal 2, sales first | 7 | 9 | 7 | 7 | 6 | 36 |
| Proposal 3, architecture | 7 | 6 | 10 | 9 | 6 | 38 |

Winner: proposal 3, with the grafts of section 4 and the rejections of section 5.

## 1. What the three agree on

The proposals share the shape the research fixed and none of it is reopened here: `SlideBase.transition` and `SlideBase.animations` in play order; the fifteen Google types stored as nine effects plus a direction; `compileMotion` in `packages/render/src/motion.ts` as the one schedule; the still rule (every object at rest in every still); the OOXML post process modules `ids.ts`, `transition.ts`, `timing.ts`, `media.ts`, `math.ts` in the order strip, adjusts, columns, connectors, alt text, media, equations, grouping, slide name, hidden title, renumber, transition, timing (the current order in `pptx/build.ts` at `d5d7f07` is strip, adjusts, columns, connectors, alt text, grouping, slide name, hidden title, so the insertion points are right); the `MediaBlock` of R05 3 and the `MediaAsset` union of R11 1.4; media through the post process and never `addMedia`; R04's reader with canvas slides and the row based report; R08's `Deck.page` with the height rule; `printLayout()` shared by the print route and the PDF; the ODP writer (R09 path a) verified through the LibreOffice loop (path c) with path b as the container oracle; the SVG writer from the scene; nspell, Temml, the `themeEdits` record with `themeCss(deck)`, `ts-plate`, chat as transient room traffic, and every one of the 21 Later rows of `model.ts` flipping except Email collaborators and Viewers. The differences below are the differences that matter to the document and the exports.

## 2. Where the proposals differ, checked

### 2.1 The `spd` fallback and the default durations

R01 6.2 records LibreOffice's exporter as the public reference for the `spd` fallback (at or under 500 ms fast, under 1000 ms med, at or over 1000 ms slow) and says "The design should keep the same thresholds". R05 5 wrote its own mapping (under 750 fast, under 1500 med, else slow) and marked it a Turboslide mapping. Proposal 3 follows R01 and says so in 0.9; proposals 1 and 2 follow R05. The reference implementation is the one the container leg reads back with, so proposal 3's thresholds are the ones a round trip can verify. R01 6.5 records PowerPoint's own samples at 500 ms for Fade, Fly and Spin; proposals 2 and 3 default a new animation to 500 ms and proposal 1 to 1000 ms, so proposal 1's untouched deck looks slower than a PowerPoint authored one.

### 2.2 The scene as the one reader

`Scene` at `d5d7f07` has grown by optional fields every round (`lines?`, `tables?`, `charts?`, `background?`, each "absent on a scene measured before"), and `SceneLine.paragraph` is already the `.para` index the writer turns into `a:p` breaks. Proposal 3 extends the type the same way (`page`, `transition`, `schedule`, `media[]`, `equations[]`, `language`, `themeCss`, `SceneLine.baseline`) and makes `extractScenes` the one reader for the pptx, odp and svg writers, so a fourth writer reads the same object and the ODP writer never opens the deck folder. Proposals 1 and 2 say the ODP is "fed by the same scenes" without naming the fields, which leaves each writer to derive the schedule, the media paths and the OMML on its own. For the exports owner this is the largest difference between the three.

### 2.3 How the show finds a block

`renderSlide` at `d5d7f07` writes `data-block` only under the editor's `blockAttrs` option. A standalone HTML file and the show need an id on every block root to apply `is-hidden` and the effect classes. Proposal 3 states the rule (`data-block` whenever `blockAttrs` or motion is set, one id with four spellings: `data-block`, `ts:<slide>#<block>`, `xml:id`, `blockId`). Proposals 1 and 2 leave the standalone script's addressing unstated.

### 2.4 The paragraph count

Proposal 1 takes the count from `parseText`; proposal 3 passes `paragraphs(blockId)` from the renderer's `.para` spans in the browser and from `SceneLine.paragraph` in the exporter, the count the writer already emits as `a:p`. Both are one truth; proposal 3's is the one that matches the `p:pRg` indexes the timing writer needs by construction.

### 2.5 Nested groups

`groupShapes` at `d5d7f07` already nests by the `@group keys` list in the object name (`groupKeysOf`), and R04 5.9 holds nested `p:grpSp` as `ext.pptxGroupPath`. Proposal 3 widens `Position.group` to a path `slug(/slug)*`, which lands on the writer and the importer as they are. Proposal 1 adds `SlideBase.groups?: { id, parent?, name? }[]` beside the tag and proposal 2 adds `slide.groups?: Record<tag, { parent? }>`; both need a translation from the record to the key list before the writer can nest.

### 2.6 Dangling animations and slide conversion

Proposal 3 has `block.remove` and `slide.replace` drop the animations whose block is gone as a reducer normalization, and states that adding motion to a grammar slide writes `slide.set` and never converts the slide to a canvas (nothing moves). Proposal 2 leaves the dangling entry to a validator finding "with a fix that removes the row"; proposal 1 marks it invalid at severity 2. Neither says whether Insert > Animation on a heading of a grammar slide converts the slide under SPEC-2 1's first manipulation rule. For the document owner the normalization and the no conversion rule are load bearing.

### 2.7 Chat's transport

`entryKindSchema` at `d5d7f07` is `z.enum(['edit', 'comment'])`, so the operation stream already carries a non document entry kind. Proposals 2 and 3 add one `chat` entry kind on the stream for every tier. Proposal 1 runs two transports (a room message type held in memory or a Redis list on those tiers, and an ops stream entry on the blob tier), which is two code paths for one feature.

### 2.8 The still rule as a gate

All three state the rule. Only proposal 3's motion e2e asserts the Perfect export report of the motion fixture is `perfect: true` with its page rasters equal to the resting renders within `PAGE_RASTER_BUDGETS.perfect`, and that the GT deck's flatten bytes are unchanged. Proposal 1 asserts "the JPEG of slide 2 shows every object"; proposal 2 asserts the Perfect file shows every object at rest in the container leg. Proposal 1's residual line naming the objects whose still state differs from their last step state (a Disappear, an audio under Hide icon) is the one agent facing improvement the others lack.

### 2.9 Fixtures

Proposal 3 builds dedicated fixtures: `decks/fixture/motion` (eleven slides covering the eight transitions, the fifteen effects in a mixed trigger order, By paragraph on a text box and a list, an `auto` video and a `click` audio), `decks/fixture/equation` (one block per symbol group and per OMML object), `fixtures/media`, `decks/fixture/{page-4-3,page-16-10}`. Proposal 2 makes the `sales-pitch` template the motion, media and import fixture; a template's copy will change and every change then moves three gates, and a template carrying "a media block placeholder, Play on click" needs a sourceless media block the schema of R05 3 does not define. Proposal 1 names the fixtures per test without a motion deck that covers every kind.

### 2.10 Present mode coverage

SPEC-2 12 lists three present toolbar stubs: Auto-play, the pen and downloads inside the show. Proposal 1 designs all three (the pen's strokes over the stage mirrored as `stroke` messages, the Download dialog over the show's surround, `penStub` and `downloadStub` retiring). Proposals 2 and 3 design Auto-play only and leave the pen and the in-show downloads as they are, which is a parity gap in the surface this judge owns.

### 2.11 Reflection and Recolor in the file

Proposal 1 writes native `a:reflection` and `a:duotone` in the Editable text export. PowerPoint's reflection is its own renderer; the mask gradient Turboslide draws is not its curve, so the Editable text file would differ from the still for an effect whose look Turboslide defines. Proposals 2 and 3 bake both into the 2x picture raster (SPEC-2 12's note: "a CSS reflection is a second raster") and keep the importer mapping `a:reflection` and `a:duotone` onto the fields, which is pixel identical to the renderer and loses only the effect's editability in PowerPoint.

### 2.12 Import defaults and the fidelity number

Proposal 2 explains what `adopt` and `keep` change (the blacks, whites and greys only; a brand blue stays a hex in both) and makes `adopt` the default for both entry points so a near black follows the appearance switch. Proposal 3 adds a visual number reported and not gated (each fixture's source rendered by LibreOffice against the imported deck's render, pixelmatch at 0.1) beside the kept, substituted and dropped counts. Both belong in the round.

### 2.13 Ownership

Proposal 1 estimates 628 agent-hours with day by day deliverables per builder, the only proposal with numbers, but its ownership overlaps: B3 and B4 both own `canvas.ts` and `freeform.ts`; B1 and B4 both edit `pptx/build.ts`; B4 and B6 both own `pptx/masters.ts`; B3 and B4 share `Gestures.tsx`. Proposal 2 has the integrator own `menus/model.ts`, `strings.ts` and the `actions.ts` header with a day 0 schema merge, the cleanest shared file rule, but B4 (theme, equation, dither, the crate, Reflection and Recolor, nested groups) and B5 (page, print, ODP, SVG, the shape interpreter, the per deck card) are heavy and B4's nested groups need `freeform.ts`, which B5 owns. Proposal 3 lists the typed seams every builder types against (the `compileMotion` contract, `data-block` and `data-media`, the `Scene` fields, `printLayout`'s signature, `Preferences`, the post process order, `THEME_IDS`, the media controller's `play(blockId)`), the clearest inter builder contract of the three, but splits `model.ts` rows across B1, B5 and B6, has four builders fill `scene/extract.ts`, and loads B6 with the equation block, the theme mode, the second theme and every deferred engineering item plus the shape interpreter, which is close to half the round on one builder.

## 3. Scoring notes per proposal

### Proposal 1, Google faithful (33)

Fidelity 9: the most complete Google surface, including the pen and in-show downloads, the Dictionary as a panel, Import theme into an "In this presentation" list capped at five, File > New in a new tab, Star with a Starred view, the drawing box with a Turboslide recogniser, nine building block categories from the union of Google's page and the press. Ease for sales 6: eight templates with real copy help, but the 1000 ms default, the extra surface and the Wiktionary proxy are not a seller's needs. Architecture fit 6: the Scene is not extended, `SlideBase.groups` and `importedThemes` are new structures, chat runs on two transports, no rule for dangling animations or slide conversion. Export fidelity 7: the right modules and order, the residual naming resting objects, but R05's `spd` thresholds, the 1000 ms default, native reflection, and nothing on equations in the SVG, ODP or TXT. Buildability 5: the heaviest scope and the overlapping ownership.

### Proposal 2, sales first (36)

Fidelity 7: no pen or in-show downloads, gallery categories Work, Brand and Blank in place of Google's documented three, Dictionary as a link; otherwise every row. Ease for sales 9: the scenarios are the right ones and each lands on a concrete control; the Plate theme with an empty corner, the picture in the corner slot, Fade preset on the work templates, By paragraph on the pricing rows, the 3 per page leave behind, the asset key prefix from day one, the "Messages are not saved" first line, the next step preview in the presenter console. Architecture fit 7: the day 0 schema merge, one media controller, one chat entry kind, but the Scene is not extended, the template is the fixture, the sourceless media placeholder is undefined, and `slide.groups` needs translation to the writer's key list. Export fidelity 7: the 500 ms default, baked reflection, the `media: embed | poster` option, but R05's `spd` thresholds and nothing on equations outside the PPTX. Buildability 6: the cleanest shared file rule, but two overloaded builders and the asset key route change added to B2.

### Proposal 3, architecture (38)

Fidelity 7: no pen or in-show downloads, the drawing box omitted as a recognition service, Dictionary as a link, the Later count claimed at 2 where the container makes it 3. Ease for sales 6: a twelve slide starter in both themes and `motion.compile` answering "what plays on the third click", but no preset motion on the templates and no sales narrative. Architecture fit 10: the schema table with the meaning when absent, the validator code, the writer and the consumers per field; `MUTATION_OPS` unchanged; the `deck.set` pointer set kept closed to `/page`; the Scene as the one reader; one id with four spellings; the reducer normalization; motion never converting a slide; the path spelling of groups on the existing writer. Export fidelity 9: LibreOffice's `spd` thresholds, the 500 ms default, the timing writer reading the scene's schedule, equations addressed in every export (OMML with the PNG fallback, a raster `<image>` in the SVG, a raster frame in the ODP, `alt` in TXT), the Perfect identity assertion in the e2e, the fidelity table with a reported visual number, `presentation:transition-speed` and the preset ids pinned from the container probe. Buildability 6: the best fixtures and seams, but B6 is overloaded and two shared files are touched by several builders.

## 4. Grafts onto proposal 3

1. From proposal 1: the pen and downloads inside the show (section 1.4 of proposal 1), retiring `penStub` and `downloadStub` beside `autoPlayStub`; the strokes ride the presenter channel as `stroke` messages and nothing is stored. B1 owns them.
2. From proposal 1: the Editable text residual line naming every object whose still state differs from its state after the last step, so an agent sees the still rule applied.
3. From proposal 1: Import theme writes a `ThemeRecord` into an "In this presentation" list on the deck (at most five, Google's cap) and applying a record writes `themeEdits`, instead of Import theme overwriting `themeEdits` directly; the list is one additive field with a validator code under `theme`.
4. From proposal 1: hour estimates and day by day deliverables per builder in `MILESTONES-5.md`, and the shape interpreter moved from B6 to B4 (the page, print, ODP and SVG builder, whose writers need it), as proposal 1 places it.
5. From proposal 2: the integrator owns `menus/model.ts`, `strings.ts` and the shared header of `actions.ts` for the whole round, with the builders' rows landed on day 0 and every later change a request; `scene/extract.ts` is B1's file and the other builders' scene fields land through requests, never direct edits.
6. From proposal 2: the asset key prefix `d/<deckId>/<assetKey>/<file>` for media on restricted decks built in the round (R11's recommendation), with the picture precedent as the interim and the Share dialog sentence while it lasts.
7. From proposal 2: `adopt` as the default theme mode for both import entry points with its stated reason, and the report's per font family run counts.
8. From proposal 2: the `sales-starter` template carries a Fade transition at 1000 ms on every slide and a By paragraph Appear on click on the pricing rows, as a template, not as a fixture; the fixtures stay proposal 3's dedicated decks.
9. From proposal 2: the Chat panel's first line "Messages are not saved. Leave a comment for something that should stay", and the presenter console's next step preview as a `turboslide: true` addition on Kevin's list (the clone one step ahead is the same class layer the show applies, so it costs no second render path).
10. From proposal 3 itself, made explicit in SPEC-5: the rebalanced B6 owns the equation block, the theme mode and the second theme; the deferred engineering items split by file owner (the twin variant and the deck index to B2, Reflection and Recolor and nested groups to B3 beside the importer's rows for them, the dither families and the crate to B4 after the shape interpreter, the WebSocket flag, the vitals route and the Lighthouse job to the integrator).

## 5. Rejections

1. Proposal 1's and 2's `spd` thresholds (750 and 1500 ms); the round uses LibreOffice's (R01 6.2), which the container leg can read back.
2. Proposal 1's 1000 ms default for a new animation; 500 ms is what PowerPoint's own files write (R01 6.5).
3. Proposal 1's native `a:reflection` and `a:duotone` in the Editable text export; both bake into the 2x raster and the importer keeps mapping the native elements onto the fields.
4. Proposal 1's two chat transports; one `chat` entry kind on the operation stream for every tier.
5. Proposal 1's `SlideBase.groups` record and proposal 2's `slide.groups` record; the path spelling of `Position.group` lands on `groupShapes` and `ext.pptxGroupPath` as they are.
6. Proposal 2's use of the `sales-pitch` template as the motion, media and import fixture, and its sourceless media placeholder; a template is content, a fixture is a gate, and a media block always names a source.
7. Proposal 2's gallery categories Work, Brand and Blank; the page keeps Google's documented Personal, Work and Education flagged unverified, with Turboslide's decks placed under them.
8. Proposal 1's and 2's drawing box recogniser for the special characters dialog; the box is a handwriting recognition service in Google and the round has no service to stand in for it. One line for Kevin if he wants a Turboslide recogniser later.
9. Proposal 1's Wiktionary panel through a server proxy as the default; the Look up link ships and the panel is Kevin's decision 2 of R10, as proposals 2 and 3 have it.
10. Proposal 3's split ownership of `model.ts` and `scene/extract.ts` and its B6 load, replaced by grafts 4, 5 and 10.

## 6. Checks the winner must keep

- `compileMotion` is pure and tested in Node; the show, the standalone script, `ooxml/timing.ts` and `odp/motion.ts` are tested against the same schedule snapshot of `decks/fixture/motion`.
- `renderSlide` never reads `animations` except to emit the filmstrip glyph's attribute, and `data-block` is present on every block root wherever motion may play.
- The motion e2e asserts the Perfect report `perfect: true`, the resting rasters within `PAGE_RASTER_BUDGETS.perfect`, and the GT deck's flatten bytes unchanged.
- The import fidelity table (kept, substituted, dropped per fixture, the worst position delta, the reported visual number) lands in `verification-5/import-fidelity.json` and every substituted or dropped row is named in the expected report.
- `MUTATION_OPS` is unchanged; every new field is optional with a defined meaning when absent; `schemaVersion` stays 1; `migrate` is the identity.
- Check steps 32 to 36 as proposal 3 lists them, with the container leg's motion, media, ODP and equation assertions in step 25.

## 7. Sources

`docs/gslides-parity/design-5/proposal-1-google.md`, `proposal-2-sales.md`, `proposal-3-architecture.md` (read in full); `docs/gslides-parity/research-5/01-google-motion.md` sections 6.2, 6.5 and 8; `04-pptx-import-feasibility.md` section 5.9; `05-motion-media-export.md` sections 4 and 5; `09-odp-and-svg-downloads.md` section 2.4; `11-media-pipeline-and-playback.md` section 2 rule 6; `02-media-templates-import-page.md` section b.1; `03-later-rows-and-edit-theme.md` section 4.7; `SPEC-2.md` section 12; `SPEC-3.md` section 17; `SPEC-4.md` section 7. Code at `d5d7f07` read with `git show`: `packages/export/src/scene/types.ts`, `packages/export/src/pptx/build.ts`, `packages/export/src/ooxml/groups.ts`, `packages/realtime/src/protocol.ts`, `packages/schema/src/actions.ts` (`ACTION_GROUPS`, `Milestone`, `deck.set`), `packages/schema/src/mutations.ts`, `packages/render/src/slide.ts`, `packages/chrome/src/menus/model.ts` (the 21 `later(` rows).
