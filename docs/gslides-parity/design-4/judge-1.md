# Judge 1 of 3, the brand designer

Written 2026-09-13 against the three proposals in `docs/gslides-parity/design-4/` and the performance plan beside them. I judged as a brand designer who has shipped identities for developer tools: I read every proposal in full, opened every preview PNG and every home page screenshot with the image reader (the full page shots sliced into 1,600 px bands so nothing was judged from a thumbnail), and checked the claims I could check with Pillow and grep before scoring. Rules followed: plain technical English, sentence case, no em dashes, no metaphors, no trailing periods on headings, full sentences.

## 0 The result in one page

| Proposal | Distinctiveness | Legibility at 16 px | Fit with Prototemplate | Technical and agent signal | Home page | Buildability | Total |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1, the dither is the identity | 7 | 7 | 9 | 8 | 8 | 8 | 47 |
| 2, the shader is the identity | 5 | 6 | 6 | 8 | 7 | 7 | 39 |
| 3, type first | 6 | 9 | 9 | 6 | 7 | 6 | 43 |

The winner is proposal 1. Its mark is the only one of the three that is the same construction at every size and the only one that carries the product's argument (a slide, a plate, the screen) at 16 px and at 512 px without a second drawing; its hero and its Open Graph card are the strongest dithered pictures in the round; and it stays inside Prototemplate with no accent and no new duration or radius. It has two defects that the grafts below fix: the titanium tab icon disappears among the grey placeholder icons on both strips wherever the scheme block is ignored, and the three frame cut every four seconds on the hero is motion the product does not need.

Proposal 3 is the runner up and the source of the most useful grafts: the opaque framed tile that reads on every strip, the still hero, and the discipline of its contrast and accessibility tables. Its display wordmark with the dissolving T is the single most elegant asset in the round, and it cannot travel into proposal 1 without making two marks.

Proposal 2 has the best tooling and the most agent facing surfaces, and the weakest mark: a 16:9 frame divided by a stem reads as a split view or columns glyph before it reads as a T or a slide, and its one accent puts a blue gradient blob on the product page, which is the look Kevin's brand directives exclude.

## 1 What I checked before scoring

Measured on this machine with Pillow 12.3.0 and grep on 2026-09-13:

- Colour counts. Proposal 1's 16, 32 and 512 px rasters and its `favicon-16.png` hold exactly two colours; proposal 2's the same; proposal 3's 16, 32 and 64 px rasters and its 20 and 24 px tiles hold three (plate, frame, letter), as its section 1.4 discloses, and its 512 px outline holds 13 because the letter is anti aliased at that size. Every `favicon.ico` decodes to entries at 16, 32 and 48 with the colour count its proposal states.
- Twin polarity. The lit fractions of each proposal's dark and light hero twins sum to 1.0 (proposal 1: 0.3006 and 0.6994; proposal 2: 0.1762 and 0.8238; proposal 3: 0.1648 and 0.8352), so the light twin is the negative of the dark one in every case, which is proposal 1's own acceptance item 7.3.5.
- Symbols. `bayer8`, `bayerThreshold` and `BAYER8_THRESHOLDS` exist in `packages/effects/src/bayer.ts`; `rampInk` in `ramp.ts`; `PLATE_BOXES` and `plateClear` in `metrics.ts`; `describeBackends` in `select.ts`; `twoToneScreenTypeScript`, `invertBits` and `encodePng1` in `pipeline.ts`, `image.ts` and `png1.ts`; `GT_PALETTE.blue` is `#2f5ce0` in `packages/materials/src/presets.ts` and `SEMANTIC.info` is the same value in `packages/theme/src/tokens.ts`. `docs/native.md` line 236 carries the 52, 20 and 23 ms figures every proposal quotes.
- Today's chrome. `TitleRow.tsx` line 273 renders `<GtMark width={31} height={20} />` inside a plain `<a href>`; `decks.index.tsx` lines 532 to 535 render the GT mark in `.ts-appbar-brand`; `__root.tsx` line 44 still ships `{ rel: 'icon', href: 'data:,' }`. The three proposals describe the same starting point correctly.
- Records. Proposal 2's `dither-record.json` names `backend: "native"` at 94 ms with 9,846 lit cells under the plate box (its own warning); proposal 3's `hero-report.json` names `backend: "typescript"` at 179.6 ms; proposal 1's `hero.recipe.json` records the liquid metal uniforms, the 3200 by 1800 capture and the ANGLE Metal renderer string.

## 2 Proposal 1, the dither is the identity

### 2.1 The mark

At 512 px (`dither/previews/mark-512-paper.png`) the mark is the best large drawing in the round: a square whose density falls from solid at the window's edge to a quarter at the far corner, thresholded by the deck's own permutation, with the plate cut out of the lower left. It is a picture of what the pipeline does to a GT opener, and it is the composition `plateClear` measures. The size sheet (`mark-sizes.png`) shows one construction from 16 to 512 with the cells appearing at 48, and the 8x nearest upscales confirm that the 16 px form is one even odd path with 2 px features and no isolated pixel.

At 16 to 24 px the mark is a black square with a white rectangle in its lower left. It is legible and it is two colours, and it reads as a form (a slide with a plate) rather than as a letter, which is what the brief asked for translation survival. It also reads, to a viewer who does not know the deck, as a picture in picture glyph or a notched stop button. That is the cost of a construction that has no letter in it, and I weigh it as a real cost: the title row and the tab are where the mark lives most of the day.

The wordmark (`wordmark-paper-3x.png`) sets the 24 cell mark at 48 px beside the word at 66 px. At that size the cells read as dust beside crisp Inter; the proposal's own test found 32 px to be noise and drew the line at 48, and my reading is that the line belongs at 64. The stacked lockup on ink (`lockup-stacked-ink.png`) at 64 px is fine.

### 2.2 The tab icon

`favicon-tab-strips.png` is the honest picture of the proposal's one legibility problem. The titanium ICO on the light strip and on the dark strip is a grey square with a lighter notch, and it sits beside the grey placeholder squares that stand for other sites' icons at the same value. Where the scheme block is honoured the SVG is ink on light and paper on dark and reads well; where it is not (Safari, and Windows for the ICO) the tab carries a grey square that a rep will not pick out of a strip of grey squares. The proposal states the contrast (3.25:1 on white, 2.48:1 on Chrome's light inactive strip) and defends the choice by the GT wordmark's titanium on the sheet, but the sheet's titanium sits alone on a plate and the tab's titanium sits among other icons. Proposal 3's opaque framed tile solves this and is the first graft.

### 2.3 The home page

The hero (`home.png` band 1, `home-light.png` band 1) is the strongest picture of the round: three liquid metal frames cut at black 160, white 250, gamma 1.5 into twins at 29 to 31 percent lit, with real blacks, real whites and contour bands, and the plate cut out of the picture at the mark's proportions so the composition on the page is the mark at page size. The light twin is a true negative and the light hero holds. On the 390 px shot the hero band collapses to a 160 px strip of dither over the plate and the page has no overflow.

The three frame cut every four seconds is the one thing on the page I would remove. A cut between two full width 1-bit frames is a change of most of the pixels in a 1,440 by 640 band, three times per twelve seconds, on a page whose only other motion is a button's colour. It is under every flash threshold and it stops under reduced motion, but a product page for a sales org does not need a hero that changes under the reader, and directive (a) and the performance plan's decision to prerender `/home` both argue for a page that is done at first paint. Frame one alone is the hero.

The rest of the page is complete and honest: the numbers strip, the twelve cards with all fifteen screenshots, the pipeline strip whose third cell is the mark beside the frame and its screen (the proposal's argument made visible), the eight speed rows with a file under each number, the Rust row ending "The hosted studio runs the TypeScript copy today", the closing sentence naming the 2.8 s median and 8.7 s worst home page, the agent rows in hairline boxes, the comparison table with the rows where Turboslide has less, the footer. One small defect: the material credit line at the bottom right of the hero sits on the dither without a plate in the dark shot and is hard to read.

### 2.4 The chrome mocks

`chrome.png` and `chrome-light.png` cover the title row, the app bar lockup at 16 px solid and 22 px type, Not found with the 64 px mark, the empty state with a 320 by 180 crop of the twin in an edge frame, anonymous avatars as 24 px Bayer tiers keyed by author hash, the progress bar whose leading sixteen cells are the deck's ramp, the flat present surround, the print bar and the four line block banner. Every surface uses the real tokens and the line law holds. The avatar squares and the ramp edge are the two best agent facing details in the round because they are the product's own arithmetic used as chrome, and they stay out of menus and controls.

### 2.5 Scores

- Distinctiveness 7. Distinctive at every size as a construction; generic at 16 px as a shape; the best large mark and the best Open Graph card in the round.
- Legibility at 16 px 7. Two colours, 2 px features, legible on both strips where the scheme block is honoured; a grey square among grey squares where it is not.
- Fit with Prototemplate 9. No accent, every `--pt-` token unchanged, ten `--ts-` tokens for the ladder and the cell, the plate as the ground showing through, the line law obeyed in every mock, dark and light as negative twins.
- Technical and agent signal 8. The mark encodes the pipeline; the banner is the favicon's bitmap; the avatars and the progress edge are the deck's arithmetic; the agent rows and the honest Rust sentence are on the page.
- Home page 8. The best hero and the most complete page; the four second cut and the unplated credit line cost it.
- Buildability 8. `mark.mjs` and `build-assets.mjs` are in the repository folder and produce every asset from `bayer8`; the ICO round trips; the recipe is recorded; the live page reproduces the twins through `material capture`. The acceptance item that asks for byte identical twins "on the same GPU backend" holds only on a Mac with ANGLE Metal, and the builder should record the twins as committed assets with their recipe rather than as a build output regenerated on CI.

## 3 Proposal 2, the shader is the identity

### 3.1 The mark

The construction is a 16:9 frame whose top edge is the crossbar of a T and whose stem divides the slide, with `rampInk` filling the right panel from ink at the stem to paper at the frame. It is generated per size on that size's pixel grid (`mark-geometry.json`), every raster holds two colours, and the confusion sheet separates it from the five forms report 01 names. Those are real virtues and the tooling behind them is the best in the round.

The form does not read as the proposal wants it to. At 512 px (`mark-512-paper.png`) the crossbar is 32 px on a 16 px frame, so the top edge is only twice the other edges and the eye reads a divided rectangle, not a letter; the paper left panel and the textured right panel read as a before and after, a toggle, or a split view. At 16 px (`mark-16-paper.png`, and the 6x enlargement on `marks-sheet.png`) the drawing is a 1 px frame with a 2 px stem: two small boxes side by side, which is the columns or split view glyph of every layout toolbar. The confusion sheet does not include that glyph, and it is the collision that matters. The proposal names the risk itself (section 8, risk 2: "may read as a two pane window or a media player").

The wordmark lockup (`wordmark-paper.png`) is long because the mark is wide, and the frame at cap height beside the word reads as a checkbox and a swatch. The title row and app bar mocks (`title-row-mock.png`, `appbar-mock.png`) show the same reading in situ.

### 3.2 The accent and the live hero

The proposal argues for one accent, `#2f5ce0`, confined to material frames, and shows it in the live hero (`hero-live.jpg`, `home-live.png`) and the third pipeline figure. The argument is careful: the hue already exists as `SEMANTIC.info` and `GT_PALETTE.blue`, it is confined by rule and by lint, and it is one line to remove. Prototemplate's own rule allows one spectral accent per page.

I reject it on the evidence of the picture. The live state is a continuous tone blue liquid metal field filling a 1,440 by 640 band: a gradient blob, which is the look Kevin's brand directives of 2026-08-11 exclude ("no AI gradient or glass look", recorded in research-4 report 01 section 1.6 and in the questionnaire directives). The still twin is two tone and fine; the live layer is the one surface in the three proposals that a viewer would describe as a gradient hero. It also costs the shader chunk on `/home`, which the performance plan's section 8 budgets at 600 KB of decoded JavaScript, and the check's Resource Timing count would include a deferred Paper Shaders chunk that loads before the measurement ends. The accent's second effect is that the hero, the README and the social image would carry GT's blue, so the product's colour would be GT's colour, which the proposal names as intended and I read as a reason to keep Turboslide monochrome beside a blue deck.

The dark hero twin (`hero-dark.png`, white point 120, 17.6 percent lit) is also the weakest of the three cuts: large fields of the picture sit near 50 percent density and read as checkerboard rather than as tone, where proposal 1's cut at black 160 gives bands of solid ink and paper with the screen only at the edges.

### 3.3 The home page and the chrome

The page (`home.png`, 9,248 px) is the densest and the most Vercel like in finish: a 1,120 rail, monospace source lines under every number in the numbers strip and the speed rows (acceptance 10 of report 01 made visible, and the best single idea for the copy in the round), the pipeline in three frames, three specimens (the empty state, the loading curtain with the ramp as progress texture, the anonymous author squares), the honest closing sentence that names that "no Rust build ships with the deploy". The hero plate as a floating opaque card over the twin is clean and the 390 px shot holds. The "Show the live material" button is a judges' control and the proposal says so.

The chrome changes match proposals 1 and 3 (the title row Link through a render prop, the app bar, the print bar, the curtain) and the mark's geometry moves into `packages/theme/src/brand.ts` so the component, the build script and the banner draw one form, which is the right shape for the build.

### 3.4 Scores

- Distinctiveness 5. The construction is rigorous and the form is generic: a columns glyph at 16 px, a split panel at 512.
- Legibility at 16 px 6. Two colours on an opaque plate, so it reads on every strip; a 1 px frame is thin and the two boxes are small.
- Fit with Prototemplate 6. Every `--pt-` token unchanged and the `brand.css` and `brand.ts` parity test is a good pattern; the live blue hero is against the brand directives and puts a hue on the product page.
- Technical and agent signal 8. Per size geometry records, a brand manifest with hashes, a dither record naming the backend, source lines under every figure, the curtain and the author squares.
- Home page 7. Dense and honest; the hero twin is muddy and the live state is a gradient.
- Buildability 7. The most complete tooling; the anchor scan for the plate is deferred (9,846 lit cells under the plate today), the accent needs a lint exclusion, and the live mount fights the `/home` budget.

## 4 Proposal 3, type first

### 4.1 The mark

The T of Inter Display Medium with the lowest 40 percent of its stem cut by the deck's screen (`mark-512-paper.png`, `mark-bare-512-ink.png`) is the most elegant single asset in the round. The tiers nest by construction, the cell count across the stem is four, and the display wordmark (`wordmark-display-ink.png`) carries the cut in its own first letter, so the name and the mark are one drawing at display size. The rejected variants (the 16:9 counter in the o, the doubled line T) were drawn and rejected on evidence, and the hint scaled to 512 shows why the outline is needed above 128.

Below 64 px the cut cannot exist, and the proposal is honest about it: the tile is a solid T on a framed plate. That means the favicon, the title row at 20 px and the app bar at 24 px, which are the identity's daily surfaces, carry a letter T in a box. It is the most legible small mark in the round and the least distinctive: a framed T is the favicon of a great many text tools, and nothing in it says slides, dither or pipeline. The identity is distinctive from 64 px up and ordinary below.

### 4.2 The tile and the tab strip

`tab-strip.png` is the most convincing tab strip test in the round: the paper tile with a 1 px edge frame beside grey placeholders on Chrome light, the ink tile through the scheme block on Chrome dark, and the paper tile on Safari's dark strip where the base colours render. The letter reads in all three. The frame is the third colour at 16 px and a disclosed deviation from report 01 acceptance item 5, made for a reason that the strip mock proves. This is the graft proposal 1 needs.

### 4.3 The home page

The hero (`home.png` band 1) is the best typography in the round: the display wordmark at 560 px with its cut T, the one sentence as a 56 px h1 in three lines, a lead that names the audience (a sales team and the agents beside it), three buttons and the fact line, all on an opaque plate of at most 760 px. The twin behind it is a mesh gradient in the ink and paper preset cut at black 80, white 250, gamma 1.5 to 16.5 percent lit; the proposal chose the calmest of three recipes because the picture sits behind type. The picture is calm to the point of reading as a grey field with one bright corner, and half of the hero band is a 50 percent checker. Directive (b) asks for awesome dithers and shaders on the brand surfaces, and this hero shows the least of both. The full width editor shot under the hero, the numbers strip, the twelve cards with paired screenshots so all fifteen appear, the pipeline row (the Blue Marble, the frame, the screen at 1:1), the speed rows with files in parentheses, the agent rows and the comparison table are all correct and complete. The appearance control sits in the footer, which is Vercel's placement and not where a rep looks for it; the editor's View menu has it too, so nothing is lost.

The still hero is a deliberate deviation from report 01 section 6.7's allowed live mount, argued from directive (a) and SPEC 5.4's frozen frame contract, and I agree with the argument: it is the same reason I would remove proposal 1's cut cycle, and it matches the performance plan's decision to prerender `/home`.

### 4.4 Buildability

The favicon set is real and verified, the contrast table cites WCAG 2.2 by URL and date, the hero recipe is recorded with its plate metric, and the chrome table names today's line and the proposed change for every surface. The handover has one gap that matters: section 9 places every script (the Inter measurement, the kerned word positions, `build-marks.mjs` with the ICO writer, `hero.mjs`, the sheets and the contrast script) in the session scratchpad and "none in the repository", and the scratchpad is wiped at the date change. Proposals 1 and 2 hand over their generators in the repository folder; proposal 3 hands over outputs and the description of how they were made. The 20 and 24 px hand hints are also deferred to the builder (the chrome mock shows the unhinted worst case on purpose), and the outline drawing above 128 px is a second drawing beside the hint.

### 4.5 Scores

- Distinctiveness 6. The dissolving T is the most elegant large mark and wordmark in the round; the small tile is a framed T that many text tools already use.
- Legibility at 16 px 9. A letter at 2 px strokes on an opaque framed plate, proven on three strips.
- Fit with Prototemplate 9. Inter is the mark; no accent; the frame role of the line law is the tile; the calmest hero; no dither on progress because progress is chrome.
- Technical and agent signal 6. The cut is the pipeline's argument and the banner is the hint's bitmap, but the page shows the least dither and no shader capture beyond one calm frame, and there are no agent facing chrome details beyond the agent rows.
- Home page 7. The best typography and the weakest picture; complete and honest copy.
- Buildability 6. Real assets, real tests, and the generators left in a directory that will be gone tomorrow.

## 5 Grafts into the winning proposal

1. From proposal 3: the opaque framed tile for every raster the scheme block cannot reach. The `favicon.ico` entries, the Safari case of `icon.svg`'s base colours and the Windows case become the proposal 1 mark in ink on a paper plate with a 1 px frame in the edge composite (`#656565` on paper, `#888887` on ink), and the ICO stays paper for both strips. The titanium base goes. The 16 px entry then holds three colours, which amends report 01 acceptance item 5 the way proposal 3 amends it, and the six tab screenshots in the verifier's list decide it.
2. From proposal 3: a still hero. Frame one of the three liquid metal captures is the hero; the other two frames stay in the repository as the empty state and Not found figures so the captures are not wasted. `--ts-hero-hold` and `--ts-dur-cut` leave the token list. This aligns `/home` with the performance plan's prerender decision (section 6) and with directive (a).
3. From proposal 2: the `brand.css` and `brand.ts` pair with a parity test, in place of proposal 1's `--ts-` tokens declared in `apps/studio/src/styles.css`. The mark's `markBits(N)` and `markPath` move into `packages/theme/src/brand.ts` so `TurboslideMark.tsx`, `scripts/build-icons.ts` and the CLI banner draw one form from one source, which is what proposal 2 section 3.2 specifies.
4. From proposal 2: `brand-manifest.json` with bytes and SHA-256 per icon file as the `--check` record, and `mark-geometry.json`'s per size record (cell size, lit cells, colour count) written by the build so the acceptance item about two colours is asserted by reading the PNGs back.
5. From proposal 2: a monospace source line under every number on `/home` (the numbers strip and the speed rows), which turns report 01 acceptance item 10 into something a reader can see.
6. From proposal 2: the loading curtain (the figure twin at integer cells where the sheet will be, the ramp as the progress texture) as the `pendingComponent` picture the performance plan's section 3.5 skeleton draws while the editor loads.
7. From proposal 2: `icon-dark-192.png` and `icon-dark-512.png` for the README's `<picture>` element.
8. Within proposal 1: raise the cellular threshold in lockups from 48 to 64 px, so the horizontal wordmark at 66 px type carries the solid 48 px mark and the cells appear only at 64 px and above where three tiles across read as a picture. Give the hero's material credit line a plate or move it under the band.
9. From proposal 3: the WCAG 2.2 citations by URL and date in the accessibility section, and the 20 and 24 px rasters hand hinted, which proposal 1's even odd path already gives at 24 px (3 px cells) but should be checked at 20 px in the print bar.

## 6 Rejections

1. Proposal 2's accent and live hero. The blue liquid metal band is a gradient hero on a monochrome product page, against the brand directives, and it costs the shader chunk on `/home` against the 600 KB budget. The still twin was the argument; the live layer was the risk.
2. Proposal 2's mark. A frame divided by a stem reads as a columns or split view glyph at 16 px and as a divided panel at 512, and its T reading depends on a crossbar only twice the frame's stroke.
3. Proposal 1's three frame cut cycle on the hero (replaced by graft 2).
4. Proposal 1's titanium base tab icon (replaced by graft 1).
5. Proposal 3's framed T as the product's primary small mark. It is the most legible tile in the round and the least distinctive, and adopting it beside proposal 1's mark would give the product two marks.
6. Proposal 3's hero recipe. The mesh gradient at 16.5 percent lit is a grey field; if a calm picture is wanted behind type, the plate is already opaque and the picture can carry contrast.
7. Proposal 3's handover of the generators in the session scratchpad. Anything the build needs lives under `docs/gslides-parity/design-4/` or it does not exist tomorrow.
8. Proposal 3's footer only appearance control on `/home`; the control belongs in the navigation beside New Presentation, where proposal 1 puts it.

## 7 The performance plan

I read all 1,121 lines of `performance-plan.md` and checked the code it cites.

Verified against the checkout: `HostedDecks.list` at `packages/store/src/blob-store.ts` lines 1105 to 1115 runs `sync(true)` on every deck four at a time before `listDeckHeads`; the write at lines 688 to 742 runs `head`, `pullLeases`, `putSnapshot`, `putDocument('deck.json')`, `putDocument(slide)` and `putDocument(record)` in sequence; `decks.trash.tsx` lines 54 to 56 define `refresh` as an awaited `router.invalidate()` and lines 63 and 88 await it under the busy state; `new.tsx` line 13 imports the whole edit route module as a namespace; `TitleRow.tsx` lines 265 to 274 render the home mark in a plain `<a href>`; `useStudioSession.ts` lines 80 to 86 loop on `pollStudioSession` with a sleep only in the catch branch; `packages/agent/src/http/sessions.ts` lines 197 to 199 resolve `[]` at once for an unknown id; `warmThumbnails` runs at `edit.$deckId.tsx` line 2213 (the plan says 2210); `.gitignore` lines 22 to 25 ignore `*.node` and `packages/native/wasm/*`; `router.tsx` sets `defaultPreload: 'intent'` and `defaultPreloadStaleTime: 0`. `design-4/perf-budget.mjs` is 1,115 lines and reads `VERCEL_OIDC_TOKEN` into a header without printing it. I could not run Prettier (no `pnpm exec` in this role), so "Prettier clean" is the author's claim.

Findings:

1. One mis-citation. Section 5's code splitting row calls the `lazyDialog()` helper "the one case AGENTS.md's dynamic import rule allows". Turboslide's `AGENTS.md` carries no dynamic import rule (grep finds none); the rule the author has in mind is in another repository's instructions. The row should name the rule it applies or drop the reference.
2. A spec deviation that needs Kevin's decision before the build, not after. Section 3.2 makes the editor's filmstrip clone first and capture never, and records that SPEC 5.5 says static thumbnails replace live clones from M3; the plan defers the deviation to `BUILD-STATUS` "when it ships". The gain is the largest in the plan (2.4 to 3.8 s to one frame) and the argument is measured, so the decision should be put to Kevin in this round's decision list.
3. The `/home` JavaScript budget and the brand proposals disagree. Section 8 sets `/home` at 600 KB decoded and the check counts every same origin script the page loads; proposal 2's deferred `ShaderMount` (about 250 to 300 KB decoded) would land inside that count. The plan's own section 6 prerenders `/home` with no loader. The consistent choice is a still hero (proposals 1 and 3, and graft 2 above), or the check must state that it counts only scripts loaded before the ready mark.
4. Section 3.8's cost model is stated for Blob and not for compute. One event stream per tab holds a function invocation for up to 780 s on fluid compute; the plan states the Blob head per 3 s per tab and the reconnect every 13 minutes, and should state how many concurrent streams one instance carries and what a day of open tabs costs against the `_serverFn` storm it replaces (176 to 700 invocations per minute today), so Kevin's Redis decision has both numbers.
5. Section 3.9 commits about 1 MB of binaries (the 274 KB wasm and the 770 KB Linux addon) to a public repository as build outputs. The plan covers integrity (a check step rebuilds and diffs when cargo is present; the SHA-256 is reviewed) and names the untested `linux-x64-gnu` addon with `TURBOSLIDE_EFFECTS_BACKEND=typescript` as the pin. The one thing missing is the pull request rule: a change to a committed binary must arrive with the CI job's rebuild in the same commit, or the diff step is the only defence.
6. The honest speed story is consistent across the four documents. Section 4's table marks "Built on Rust" as never and the wasm and addon rows as after; all three brand proposals end their Rust row with the sentence that the hosted studio runs the TypeScript stages today. The `/home` copy the winner ships must move those rows from "today" to "after" only when section 3.9 lands, and the plan's rule (present tense only for rows marked today) is the right gate.
7. The local profile's ceilings are calibrated for one machine and CI's scaling factor is deferred to the first run. Until two CI runs agree, the `local` profile should be report only in `pnpm check`, as section 8 already does for the fps and the LCP element, so a slow runner cannot fail the chain on the day the step lands.
8. Section 3.1 depends on TanStack Start streaming a deferred promise through `<Await>` under the Nitro Vercel preset; the plan cites the guide (S8) and does not name a test that proves streaming reaches the client on Vercel. The `home.spec.ts` case it names (the Recent row in the server's HTML, the list after) is that test if it runs against a preview and not only against `vite preview`.
9. Section 3.4's coalescing of `block.set /pos` and `slide.set /notes` bursts changes how many version records an arrow nudge sequence writes while keeping one undo entry per gesture; the plan states the rule's limits and the `adoptExternal` reader's dependence on records, and the `undo.spec.ts` assertion (ten nudges, ten undo entries, fewer records) is the right test.
10. The production runs are recorded with times, budgets met and the failures ranked (58 of 121 at 21:34 to 21:36 UTC; `decks->edit` 453 ms in page, `edit->decks` 4,481 ms as a document load, `/decks` first byte 4,171 ms cold, 176 server function calls per minute idle, 16 of 16 twins re-fetched, 5,654 nodes for 85 cards). The raw JSON is in the session scratchpad, which is wiped at the date change; the verifier should copy both files under `verification-4/` now rather than after the changes land.

## 8 Files read

Proposals and assets: `docs/gslides-parity/design-4/proposal-1-dither.md`, `proposal-2-shader.md`, `proposal-3-type.md` and every PNG, SVG, JSON and HTML under `dither/`, `shader/` and `type/` named in this document; `performance-plan.md`; `perf-budget.mjs` (size and the token handling). Product context: `AGENTS.md`, `packages/chrome/src/tokens.css`, `packages/chrome/src/TitleRow.tsx`, `apps/studio/src/routes/__root.tsx`, `decks.index.tsx`, `decks.trash.tsx`, `new.tsx`, `apps/studio/src/router.tsx`, `apps/studio/src/components/useStudioSession.ts`, `packages/agent/src/http/sessions.ts`, `packages/store/src/blob-store.ts` (the list and write ranges), `packages/effects/src/{bayer,ramp,metrics,select,pipeline,image,png1}.ts`, `packages/materials/src/presets.ts`, `packages/theme/src/tokens.ts`, `docs/native.md` line 236, `.gitignore`; `docs/gslides-parity/research-4/01-brand-references.md` sections 0, 1 and 8; `/Users/kevinliu/repos/Prototemplate/DESIGN.md` (the accent lines). Screenshot slices for this judgement are in the session scratchpad under `judge1/` and are not part of the repository.
