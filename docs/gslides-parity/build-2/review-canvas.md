# Review of the canvas amendment

Reviewer's report on the amended `docs/gslides-parity/SPEC-2.md` (sections 0.69 to 0.95, 1, 2.1, 2.6, 2.10, 3, 4, 5, 6, 9 to 13) and `docs/gslides-parity/MILESTONES-2.md`, written 2026-09-12 against `main` at `a65b313` with the stopped attempt's working tree. Every fact below was read in this checkout: the two documents in full, `SPEC.md` sections 0, 2.3, 2.6, 2.7, 3.1, 4.3, 5.5, 5.6, 7.1, 7.7, 10, 13 and 15, `AGENTS.md`, `docs/freeform.md`, the research reports R02 (sections 6, 11, 12), R04 (B3, B7), R05 (A1, A2, A5, A10, B7, B11, C1 to C7, D), R08 (A5 to A11, A14, A20, A21), R09 (findings, A1 to A5), and the source files each finding names. Severity 3 must be fixed before the build starts, 2 should be fixed, 1 is recorded.

Lenses, as the task set them: (a) a Google canvas behaviour of R05, R09, R02 section 6 or R08 Part A that section 6 omits or waters down; (b) a slide kind, block type or element the conversion does not make draggable, or whose conversion is not lossless; (c) a gesture without its action, CLI usage and MCP name, or a conversion the CLI cannot reproduce identically; (d) a field without renderer, Perfect, Editable text and lint rows; (e) contradictions with SPEC.md, AGENTS.md, one truth, optional fields at version 1, the perfect export invariant; (f) ownership overlaps or paths that do not exist; (g) risks unnamed.

## Verified facts the findings rest on

- `packages/render/src/slide.ts` `renderFreeform` writes `z-index: order + 1` on every `.free` wrapper. `packages/theme/src/gt-ink-paper/stage.css` line 60: `.ts-sheet .slide { position: absolute; inset: 57px; padding: 72px 80px }` with no `z-index`; `sheet.css` line 137: `.slide > .in { position: relative }` with no `z-index`. Neither creates a stacking context. `sheet.css` line 61: `.ts-sheet .frame { z-index: 2 }`; `.wordmark` and `.counter` (lines 116 to 136) are positioned with `z-index` auto. `packages/render/src/stage.ts` line 48 renders the frame, the slides, then the wordmark and the counter. `block-css.ts` line 15 draws the kinds' photograph at `z-index: -1`.
- `packages/schema/src/position.ts`: `w` and `h` are `z.number().positive()`. `packages/render/src/blocks/prompt.ts` line 52: `renderTextOrPrompt` returns `''` for an empty Text when prompts are off. `packages/schema/src/layouts.ts` line 234: the Title layout's `make` returns `heading: ''` and `lead: ''`. `packages/viewer/src/Editor.tsx` line 509: the editor stage draws the prompts of empty placeholders.
- `packages/headless/src/ready.ts` lines 2 to 3: `waitForReady` waits for every face the slide uses, every visible image decoded and the dither canvases drawn. `packages/render/src/blocks/context.ts` `twinAttrs` writes `data-light` and `data-dark` only; no `width` or `height` attribute is written on an `<img>`.
- `packages/schema/src/validate.ts` line 372: `issue('ext', 1, file, …, 'ext data kept at /ext/… (SPEC 4.1)')` for every `ext` pointer on a slide.
- `packages/render/src/block-css.ts` line 77: `.ts-sheet .material { aspect-ratio: 16 / 9 }`; lines 74 to 76: `.material-fig` is a grid with a figcaption. Lines 148 to 151 give `.free > .box`, `svg.shape`, `.rule-h`, `.rule-v` their box size; nothing gives `.material-fig` or `.material` the box. `slide.ts` lines 139 to 147: a picture kind's material recipe is `pictureRecipeAttr(source, twoTone, slide.plate.side)`.
- `apps/studio/vite.deploy.config.ts` lines 128 to 132: `functions: { maxDuration: 300 }` for everything but `/api/export/**`, `/api/render/**` and `/_serverFn/**`; `apps/studio/src/server/render.ts` line 25: headless Chromium never runs inside the web app, the CLI runs as a child process.
- `decks/gt-brand/slides/mark.json` and `decks/templates/gt-brand/slides/mark.json` hold a block with id `mark`. The GT deck's four material assets are `liquid-metal-diamond`, `opener-blog`, `opener-developer-experience` and `opener-prototemplate`; three openers carry a material photograph.
- `packages/chrome/src/menus/toolbar-tails.ts` line 505: `GROUP_TAIL = [...fillAndBorder('group'), FORMAT_OPTIONS]` already exists in the working tree; no row of SPEC-2 says what a fill or border write on a group writes.
- R02 section 6 and 11 (Google help 99753, verified): typed zoom accepts 25 to 1600. R05 C6 (S1, S6, S60): grouped objects can lie outside the slide bounds; formatting applied to a group applies to all members. R05 A10 (S15, S38, S66): a connector is rerouted by dragging a handle to another anchor.
- Every path MILESTONES-2 names exists or is marked new, with the exception in finding 15 (`packages/theme/src/tokens.ts` unowned, review 29). `packages/viewer/package.json` depends on `@turboslide/render`, so B4's `canvas-measure.ts` can import `renderSlide`.

## Severity 3, fix before the build

### 1. The canvas walk and the fixture move the full-sheet photograph off the sheet, which `freeform/off-sheet` (3) gates

11.8 step 1 drags one object of every kind 40 px right and 24 px down, "the photograph" included; 1.2 places the photograph at `pos: { x: 0, y: 0, w: 1600, h: 900 }`, so after the drag `x + w` is 1640 and `y + h` is 924 and `offSheet` (`packages/schema/src/freeform.ts`) is true. 11.2 `canvas-opener` is "the photograph … moved 40 px right and trimmed". 1.4 keeps `freeform/off-sheet` at severity 3, "the gate" (docs/freeform.md section 6). 11.8 step 7 asserts `lint.run` reports "no new finding above severity 1 on the converted slides"; 11.2 says "no slide over the lint gate"; B1's acceptance says the GT count is not higher. The four statements cannot all hold. Google also lets objects lie past the slide (R05 C6, verified) and clips them in the show; a bleed picture dragged a few pixels is the first thing a person does with a background photograph, and a rotated object's visual bounds leave `pos` in every case.

Fix: split the rule. `freeform/off-sheet` stays 3 when a box lies wholly outside the sheet (nothing of it shows) and becomes severity 2 when a box crosses the sheet's edge, with the sales sentence "Part of this object is past the slide's edge and will not show"; the renderer clips at the sheet (state where: `.ts-sheet` or the stage's `overflow: hidden`), Perfect is clipped by construction and Editable text writes the box as is (PowerPoint clips too). Then 11.8 step 7 reads "no finding above severity 2" and 11.2's `canvas-opener` stays as written. The alternative, if the gate must stay at 3: the walk moves the photograph by `block.crop` and never by `pos`, and `canvas-opener` is "trimmed" only; say which.

### 2. The hidden render measures empty placeholders without prompts and does not wait for images, so the first drag on the fresh Title slide writes a zero height box

1.3: the editor renders the slide "with `renderSlide` (`blockAttrs: true`, the current theme, no prompts)", "awaits `document.fonts.ready`" and measures. `renderTextOrPrompt` returns `''` for an empty Text when prompts are off, so the fresh presentation's Title slide (`heading: ''`, `lead: ''` from `layouts.ts` `make`, the slide directive (1) lands on) renders an empty `<h1>` and an empty `<p>`, whose boxes have height 0; `toCanvas` writes `pos.h: 0`, `positionObjectSchema` refuses it (`h` is positive, severity 3, code `position`) and the first drag of the mark fails. The editor stage draws those prompts (`Editor.tsx` line 509), so the measured box also differs from what the person sees. Images: the headless path's `waitForReady` decodes every visible image and draws the dither canvases before measuring; the editor path waits for fonts only; an `img.shot` carries no `width` or `height` attribute, so a figure's box is the caption's height until the twin loads, and the editor and the CLI write different `pos` on every figure slide, which breaks 0.72's identity and 11.8 item 4. The same holds for `dither` canvases and a material's frozen frame.

Fix: both paths measure with `prompts: true` (the placeholder keeps the prompt's box, as Google's placeholders keep their box while empty) and `CanvasBoxes` records which boxes came from a prompt so `toCanvas` can write `autofit: 'shrink'` and a minimum height of one line box; the editor's hidden render awaits the same readiness as headless (fonts, every `img.decode()` under the root, the dither draw), shared as one exported `awaitSheetReady(root)` in `measure-dom.ts` that `ready.ts` also calls; `canvas.test.ts` and `canvas-measure.test.ts` add an empty Title slide and a figure slide; 1.3 says both.

### 3. The picture object paints over the wordmark and the counter, and every object from the third up paints over the frame

`renderFreeform` gives each wrapper `z-index: order + 1`; `.slide` and `.in` create no stacking context, so those z-indexes compete in the stage's context with `.frame` (z-index 2) and with `.wordmark` and `.counter` (positioned, z auto, painted after the slides). The kinds keep the photograph under the wordmark and the counter with `z-index: -1` and put paper chips under both; the converted picture object at `z-index: 1` covers the wordmark, the counter and the chips it is meant to sit under, and any object at paint order 2 or higher covers the rails, rules and crosses that draw over every grammar slide. Step 24 (`canvas-fidelity.mjs`) fails on every picture kind and on any content slide whose third block crosses a rail, and 0.75 ("theme level stays theme level") has no stacking rule behind it. The chips rule is affected too: `.ts-chips` is `inset: -57px; z-index: -1` relative to `.slide`; inside the picture wrapper (the sheet box) it needs `inset: 0` and a z-index above the image, which 1.4 does not name.

Fix: 1.4 names the rule: `.ts-sheet .slide > .in` (or `.slide`) gets `isolation: isolate` so object z-indexes stay inside the slide, and the frame, the wordmark and the counter keep painting over every object on every slide; the picture object needs no negative z; `.ts-sheet .free > .ts-chips { inset: 0; z-index: 1 }` after `img.picture-img`; the render snapshot of a converted opener asserts the wordmark and counter boxes are not covered (or the fidelity script's per kind diff proves it). Check that `isolation` does not change a grammar slide's pixels (it should not: no grammar block sets a z-index) and that the `.opener-img` at `z-index: -1` still paints under `.in` inside the isolated context.

## Severity 2, should fix

### 4. `ext.grammar` fires the validator's `ext` issue on every converted slide, against 0.76 and SPEC 7.1 rule 2, with an engineering message

`validate.ts` line 372 emits `ext data kept at /ext/grammar (SPEC 4.1)` at severity 1 for any `ext` pointer on a slide. 0.76 says no rule fires for a conversion; SPEC 7.1 rule 2 says nothing in the round writes `ext`; 2.9 amends rule 3 and not rule 2. Check slides would show the message, which carries a JSON pointer and a spec citation, beside `layout/freeform`; `default-view-words.test.ts` now greps lint messages and would catch it if validator issues reach the panel. `grammarRecord()` in `Freeform.tsx` also has to duck type the record because `ext` is never validated.

Fix: make the record a first class optional field, `SlideBase.canvas?: CanvasRecord` (or `grammar?`), validated by its own schema and excluded from `extPointers`; every field stays optional at version 1 and the migration test is unaffected; `toCanvas` and `fromCanvas` read it; 2.9 gains the amendment to SPEC 7.1 rule 2; `canvas.test.ts` asserts a converted slide validates with no issue.

### 5. A picture object that covers the sheet leaves no empty sheet: no marquee, no click to deselect, no empty canvas menu

6.1 row 3 starts the marquee "on empty sheet", row 5 deselects on "a click on empty sheet", 4.3's `emptyCanvas` menu (Change background, Guides ▸, New slide, Apply layout) opens from the slide background. On a converted Section header, Caption or Closing, and on any slide after Change background > Choose image, the picture object covers the sheet at the bottom of the stack, so every press lands on it and drags it; the right-click shows the `image` menu and Change background is unreachable from the canvas. Google never meets this because its background image is not an object; directive (3) makes it one, so the spec has to name the escape.

Fix: the stage outside the sheet (Google's grey workspace) is a marquee origin, a deselect target and opens the `emptyCanvas` menu; the `image` context menu of a picture object that covers the sheet at the bottom of the stack appends the slide rows (Change background, Guides ▸) after a divider; a press on the covering picture object with Cmd held starts a marquee instead of a drag is the alternative; record the choice in section 6 and list it for Kevin.

### 6. Zoom stops at 400 percent where Google types 25 to 1600

R02 section 6 and 11 (Google help 99753, verified): "Typed zoom accepts 25 to 1600". 0.81 and 6.1 row 27 record Google's range and keep SPEC 3.1's 400 without a reason; directive (3) asks for all the canvas features and the stage already scrolls while zoomed (row 28).

Fix: the Zoom box accepts 25 to 1600, the ladder gains 800 and 1600, and `view.zoom` clamps at 1600; or record the cap as a decision for Kevin in VERIFICATION-2 with the reason (a 25600 px stage) and the tooltip stays free of the number.

### 7. Groups: a format write on a group, a group resize and a group flip have no write

R05 C6 (S60, verified): formatting applied to a group applies to all members; `GROUP_TAIL` in the working tree already offers Fill color, Border color, Border weight and Border dash on a group, and section 4.2 lists no group tail and section 5 no group case for the Colour, Text and Drop shadow sections. Row 14 says resize, flip and order "act on every member" and gives one write for a move and a rotation only: a group resize has to scale every member's `pos` about the union box (Google scales geometry and keeps font sizes, unverified); a group flip has to toggle each member's `flip` and mirror its `x` or `y` about the union centre; the tail's writes are `block.set` per member in one `slide.update`.

Fix: add the rows to 6.1 (or 6.2's group paragraph): "a group resize writes every member's `pos` scaled by the union's x and y factors, typography untouched; a group flip toggles each member's flip and mirrors its position about the union centre; a fill, border, dash, shadow or text write with a group selected is one `slide.update` of `block.set` per member; Format options on a group shows Size & rotation, Position, Colour, Text and Drop shadow applied to every member"; the group tail's controls in 4.2; `canvas.test.ts` (viewer) asserts the member positions after a resize and a flip.

### 8. Rerouting a connector by dragging an existing end onto another shape is missing

R05 A10 (S15, S66, verified): "reroute a connector by dragging a handle to another anchor". 6.2 says the two end handles of a line "drag the ends and write `pos` and `orientation`"; row 20 and 6.2's draw tool paragraph record `connect` only while a line tool is armed, so a drawn connector attaches and a dragged one detaches or never attaches.

Fix: the end handle of any line kind snaps to the connection sites of the shape under the pointer with the 6 px rings shown, and the gesture end writes `line.set` with `connect.start` or `connect.end` set or cleared in the same write as `pos` and `orientation`; `connect.test.ts` and `objects.spec.ts` cover a reroute; the Line section's Detach stays.

### 9. The identity of the editor's and the CLI's `pos` holds in Chromium only, and the http and MCP paths launch a browser per canvas write

0.72 and 11.8 item 4 assert the editor and the CLI write identical `pos`. The editor measures in the person's browser; Safari and Firefox lay out text at different fractional advances, the statement's measure is in `ch`, and integer rounding then differs by a pixel; only Playwright's Chromium is proven. On the http transport `/api/actions/**` runs under the base function (300 s, default memory; `vite.deploy.config.ts` line 128) and `server/render.ts` says headless Chromium never runs inside the web app: `withCanvas` on http either launches Chromium in that function or shells out to the CLI per write, and neither is named; the MCP stdio server launches a browser for every `block.set /pos` on a grammar slide, and `slide.toCanvas` over twenty slides launches twenty unless the browser is shared.

Fix: 0.72 and 11.8 state "identical in Chromium; another browser may differ by a pixel and the walk proves Chromium"; 1.6 names the http path (the render worker route under `HEAVY`, or the CLI child process as `render.slide` uses) and one shared browser per action call (`slide.toCanvas` with several ids, one launch); B1 records the per write cost in `build-2/b1.md`; `SERVER_SIDE_WINDOW_ACTIONS` stays off for the canvas writes on the window transport, as written.

### 10. A material keeps a 16:9 aspect ratio and its caption under `.free`, so a resized shader does not re-mount at the box

`block-css.ts` line 77: `.ts-sheet .material { aspect-ratio: 16 / 9 }` and `.material-fig` is a grid with a figcaption; `.free > .box` and `svg.shape` take the box, `.material-fig` and `.material` do not, so a material block's shader plays at 16:9 inside a box of another ratio and the caption adds height, against 0.94 ("resizing a shader is a `block.set /pos` and nothing else") and 11.8 step 5. A picture kind's material recipe is built with `slide.plate.side` (`slide.ts` line 147); the `picture` block has no plate, so the converted photograph's recipe has no side and the frozen frame and the live shader may compose differently.

Fix: 1.4 names `.ts-sheet .free > .material-fig, .ts-sheet .free > .material { width: 100%; height: 100%; aspect-ratio: auto }` with the caption drawn inside the box's bottom or dropped under `.free`; `PictureBlock` gains an optional `side?: PlateSide` (or the renderer reads `ext.grammar.fields.plate.side`) that `pictureRecipeAttr` takes, so the converted photograph plays the same frame; the walk's step 5 asserts the `.ts-material-live` bounds equal the `pos` box at the stage scale.

### 11. The theme level exclusion of 0.75 is a scoping of directive (3) that the list for Kevin omits

Kevin: "drag and move around ANYTHING, including backgrounds". 0.75 keeps the wordmark, the counter, the rails, the chips and the paper ground fixed until Edit theme (round three) and 12 has the stub clause. The verifier's list for Kevin (MILESTONES-2 Verifier item 5) names the unverified Google facts and the untouched fixed sizes and not this exclusion; `build-2/canvas-amendment.md`'s open points do not name it either.

Fix: add it to VERIFICATION-2's list for Kevin and to the amendment note's open points, with the Edit theme design note and the one sentence that Google's master elements behave the same.

### 12. Snapping, align, distribute, the marquee, `off-sheet` and connector sites under rotation are undefined

Every geometry in section 6 reads `pos` (an axis aligned box); a rotated object's visible edges and its bounding box are elsewhere. Row 7's snap lines, the equal spacing guides, `block.align`, `block.distribute`, `marqueeHits`, `freeform/overlap`, `freeform/off-sheet` and 2.4.7's `sites()` (unrotated coordinates) say nothing about a rotated object, and Google snaps the rotated bounding box (unverified).

Fix: one paragraph in 2.1.1: the axis aligned bounding box of the rotated `pos` box is what snapping, align, distribute, the marquee, `off-sheet` and the overlay ring use; a target's connection sites are rotated about its centre before `followConnectors` places an end; `rotate.test.ts` and `snap-freeform.test.ts` cover a 37 degree box.

## Severity 1, recorded

13. Counts: 11.2 says "26 pages in the PDF" for 27 slides while 0.42 says 27 pages; 11.8 step 6 says the rulers' numeral count "equals 13 and 7", which is true only if the origin carries no numeral (0 to 13 is 14). State the origin.
14. 1.2 says `mark` is free "on every stored slide of the GT deck and the templates"; `decks/gt-brand/slides/mark.json` and the template's `mark.json` hold a block `mark`. Harmless (a content slide's conversion creates no mark block), but the test as written fails; assert the ids on the kinds whose conversion creates them.
15. Ownership: `packages/theme/src/tokens.ts` stays unowned (review 29) although the rulers and guides add `--pt-` tokens; two modules are named `Guides.tsx` (the viewer's snap lines, the chrome's deck guides), so name the chrome one `DeckGuides.tsx`.
16. The picture object draws at `object-fit: cover`, so an edge handle re-crops where Google stretches (R05 A2); `asset/stretched` is the reason. State it in 2.6.4 and list it for Kevin.
17. Cmd+click toggles selection (row 2) and Cmd+drag suppresses the guides (row 7); Shift+click adds and Shift+drag constrains. State the press against drag rule (3 px, as the marquee) in rows 2 and 7.
18. 1.6's list of what converts omits a dropped image file and a pasted image (`insertPicture` with a point exists); Google's drop on the slide border sets the background (R05 A2). Add the drop as an insert that converts, and record the border drop as omitted or as Change background.
19. SPEC 5.5 says a grammar source to Blank runs `toFreeform`; with every kind convertible, Apply layout > Blank on a title, statement or picture kind should be the measured `toCanvas`. 2.9 item 9 does not say so.
20. Order on a grammar slide: 1.6 says Arrange > Order converts; the overlay chip's Alt+Up (`onHandleOrder`) reorders within the slot today. State one rule for the key, the row and the chip.
21. Review 34 stands: 2.6.2's deck default background on an unconverted picture kind paints `.slide-bg` under `.in`, over the photograph at `z-index: -1`. Exclude the kinds while unconverted.
22. Review 42 stands: the mask's adjust handles and the double click to reposition inside a mask (R05 B11) and the autofit icon beside a new text box (R09 A5) are absent from row 19 and 6.2.
23. The ruler drag out that creates a guide is unverified for Google (row 29 says so) but is not marked `turboslide: true` in the shortcuts dialog or the tooltip; mark it or drop it.
24. The plate `box` of a converted picture kind records `padding` although its children are separate objects; harmless, but say it exists for `fromCanvas` only, or drop it.

## What the amendment gets right, briefly

One document form for an arranged slide and the removal of the overlay layer; the block by block conversion with `ext.grammar` recording the kind's fields so `fromCanvas` and Apply layout re-flow; one measurer function on a 1x page for both paths; the conversion travelling in the gesture's write as one undo step; the picture object as the bottom of one stack; the fidelity step 24 as the proof of pixel losslessness; the connector attachment shipping now; Google's rotate keys with the alias noted; the unverified facts listed for Kevin; every gesture of section 6 paired with an action, a CLI usage and an MCP name except the group cases of finding 7 and the reroute of finding 8.

## Lens index

- (a) omitted or watered down: 6, 7, 8, 18, 22.
- (b) draggability and losslessness: 2, 3, 10, 14, 24.
- (c) gestures without actions, conversions the CLI cannot reproduce: 2, 7, 8, 9.
- (d) fields without rows: 4.
- (e) contradictions: 1, 4, 13, 19, 20, 21.
- (f) ownership and paths: 15.
- (g) risks unnamed: 3, 5, 9, 10, 11, 12, 16, 17, 23.
