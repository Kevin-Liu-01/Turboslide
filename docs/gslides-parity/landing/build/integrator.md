# The landing build: the integrator

## Landing, day 0

Written by the integrator on 2026-10-02 from 19:58 to 20:50 PDT in `/Users/kevinliu/repos/Turboslide-landing` on `landing/redesign` at `dc7ce0da`. Read in full before writing: `docs/LANDING.md` (every section), `docs/NEXT.md` 4.0 and 4.1, `docs/FOCUS.md` 6 (6.1 to 6.4), Prototemplate `deck/DECK-GRAMMAR.md` (read only), `AGENTS.md`, prototype A (`docs/gslides-parity/landing/direction-a/`, its markup, its shots and its probes' names), B's `openerTone` and earth tone source, C's kits (`direction-c/landing.js` 265 to 300), and the tree files each section below cites. Nothing was fetched from the network. No server and no Playwright ran; my ports 4545 and 4555 stayed unused. Four estimates ran in the session scratchpad with the tree's `sharp` 0.35.4 and `@turboslide/effects/bayer` (sections 2 and 6). The load average read 14.9, 18.9 and 23.2 at 20:15 PDT; no time was measured, so this note quotes no time reading.

This note fixes what `docs/LANDING.md` 6.3 asks before any lane writes code: every row with its bound and driver (section 5), the push list with each push's lane and files (section 7), the shared files and their order (section 8), the interfaces the lanes share (section 4), the assets and their build (section 6), and Kevin's answers to LANDING.md section 7 with what each changes (sections 1 to 3). Where this note and LANDING.md differ, this note is the later decision and names its reason. Everything else in LANDING.md stands as written.

### 1. Kevin's answers to LANDING.md section 7

The orchestrator took these from Kevin's message of 2026-10-02 ("much more interactive", "the best of graphic and motion design").

|   # | Answer                                                                                                                                                                                                            | What it changes                                                                                                                                                                  |
| --: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|   1 | Yes. The dithered Blue Marble develops in `/home`'s first screen as the hero's field                                                                                                                              | Section 2: the hero's field, H5, slide 6 becomes the Rosetta Stone, slide 7 the opener field's slide; rows `home.motion.hero`, `home.canvas.log`, `home.motion.in-view` restated |
|   2 | Yes. LANDING.md section 3 replaces `docs/POLISH.md` 3.2 "Nothing animates" and 3.3 item 3 for `/home`, with every still under reduced motion                                                                      | L1 edits `docs/POLISH.md` section 3 in push 1                                                                                                                                    |
|   3 | Yes. `#2f5ce0` appears only as the live selection, the snap guide, the Tailor highlight, the lifted outline and the focus ring, never at rest; the page's snap guides draw in it                                  | L1 records it in `docs/brand.md` 11 in push 1, with the guide colour as a deviation from the editor's `--pt-guide` (A risk 3)                                                   |
|   4 | Yes. An example kit may carry a colour outside paper and ink, labelled as a customer's kit                                                                                                                        | Section 3: Fenwick takes C's navy, one step darker; the label rule; `home.tailor.theme` restated                                                                                |
|   5 | Yes. The pictures row's ceiling is 7,500 px at 1440                                                                                                                                                               | `decks.home.pictures-three-widths`: under 7,500 px at 1440 and 8,500 at 390                                                                                                      |
|   6 | Open the Example Deck opens the GT brand deck                                                                                                                                                                     | `/deck/gt-brand`; no write to any store; the fixture stays outside `decks/`                                                                                                      |
|   7 | Yes. The landing ships before Round 2's entry chunk split, with `home.budget.shared` as a measure row                                                                                                            | The ship follows Round 1's push 21 (LANDING.md 6.8)                                                                                                                             |
|   8 | Keep the spec's default                                                                                                                                                                                           | `/` still answers 307 to `/new`                                                                                                                                                  |
|   9 | Yes. One true subtitle per return visit                                                                                                                                                                           | The three sentences of LANDING.md 2.2, in order                                                                                                                                 |
|  10 | Yes. `home.budget.bytes-first` gates the document at 80 KB decoded and 20 KB brotli while the renderer's CSS is inline, then at 52 KB decoded                                                                     | `decks.home.load-budget` keeps reporting the document against 60 KB as a measure row until audit item 13 lands                                                                 |

### 2. What answer 1 changes

LANDING.md 7 gave the yes branch in one line: "the Blue Marble develops in the hero over 1,500 ms (the h1 stays final and the LCP), band 4 takes the Rosetta Stone and band 6 the opener field's slide". This section fixes the rest of it.

#### 2.1 The page deck

| # | Id           | Layout    | Picture                                                     | Band                                | Selectable objects (`data-object`), chip word                                                  |
| -: | ------------ | --------- | ----------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1 | `title`      | title     | none in the file; the page prints the Blue Marble (2.2)    | hero                                | `title#heading` (Title), `title#lead` (Subtitle)                                               |
| 2 | `plan`       | statement | none                                                        | Tailor stage at rest                | none                                                                                           |
| 3 | `gets`       | rows      | none                                                        | Present at rest                     | none                                                                                           |
| 4 | `ships`      | statement | none                                                        | Tailor filmstrip                    | none                                                                                           |
| 5 | `next-steps` | rows      | none                                                        | agents (and the filmstrip)          | none; the run writes `next-steps#h` and `next-steps#rows`                                      |
| 6 | `rosetta`    | mood      | `mood-rosetta`, the Rosetta Stone                           | canvas (band 4)                     | `rosetta#h` (Heading), `rosetta#p1` (Text), `rosetta#credit` (Credit), `rosetta#plate` (Plate) |
| 7 | `field`      | mood      | `field`, the opener field                                   | export (band 6), the show, the print | none                                                                                           |
| 8 | `close`      | closing   | as the closing layout needs (L1)                            | close                               | none                                                                                           |

- The block ids are the renderer's: the title kind writes `data-block="heading"` on its `h1` and the lead as `lead` (`packages/render/src/slide.ts` 318 to 345); a mood plate's blocks are `h`, `p1` and `credit` (`decks/gt-brand/slides/mood-rosetta.json`). `rosetta#plate` names the plate. After `slide to-canvas rosetta` the blocks may take other ids; the build reads them from the converted temporary deck into `deck.generated.ts` (`canvasBlock`), and the Command row prints those.
- Slide 6's plate is the spec's former slide 7 plate: "The Rosetta Stone" / "One decree of 196 BC in three scripts." / "Photograph: Hans Hillewaert, CC BY-SA 4.0". Alt text: "The Rosetta Stone, a decree of 196 BC in three scripts".
- Slide 7's plate (default words; L1 may change them under LANDING.md 2.12's rules): "The opener field" / "A lit sphere drawn from a formula and printed through an 8 by 8 screen at 2 px cells." / "Drawn in Turboslide". Its picture is `apps/studio/home-deck/assets/field-{light,dark}.png`, written once by `build-home-assets.ts --stills` from B's `openerTone` without its noise term (`direction-b/landing.js` 412 to 432: the sphere's centre at 1340 by 1160 units, radius 860, lit from the upper left) and committed with the fixture, whose sha256 covers it. Alt text: "The opener field, a lit sphere printed in dots".
- The fixture holds seven slides (every one but `next-steps`); the run, its three commands and the page deck are as LANDING.md 2.0 and 2.4 say.
- No picture is the subject of two bands: the Blue Marble is the hero's, the strip's field is the strip's, the Rosetta Stone is band 4's and the opener field is band 6's (LANDING.md 1.6).
- The files the CLI writes carry slide 1 as a title layout without the Earth, as they carried it without the opener field before. The show and Print This Deck draw slide 1 with the hero's still and credit.

#### 2.2 The hero's field

- The tone: `home-deck/assets/mood-earth-light.jpg` blurred back to tone (A's method, a Gaussian of 3.2 px, `direction-a.md` 126). The light print inks a cell where 1 minus the luminance, inside the disc, exceeds `(bayer8(row, col) + 0.5) / 64` (`packages/effects/src/bayer.ts`); outside the disc the cell is paper.
- The geometry (`deck.generated.ts` `heroDisc`): the disc's centre at 1380 by 1240 units and its radius 760, so the planet's northern limb rises in the lower right of the sheet where B's opener sphere sat; the source disc (its centre and radius found from its own pixels) is scaled onto it. At B's own geometry (1340, 1160, 860) the disc ran under the title's second and third lines and the clear zone cut a notch from the planet (day 0 picture, scratchpad). L1 may move the disc to meet one rule, which `--stills` checks: no clear zone covers more than 5 percent of the disc's cells on the sheet.
- The clear zone: the title, the subtitle, the mark, the counter and the credit line each draw a ground in the kit's paper 24 units beyond their box, so type never sits on dither; the zone moves with its box, and the field prints again under the old place on release in one frame (LANDING.md 2.2).
- The dark print: on a ground darker than its text (the dark appearance, the Fenwick kit) a field draws the disc's cells XOR the ink still. That equals the print of the luminance through the complementary screen `63 - m`, so the Earth never shows as its negative. The same rule serves slides 6 and 7, whose extent is the whole sheet (their dark print is the light print's complement), so each dithered picture on the page is one file or one still (section 6).
- The still: inlined in the document once, `slides.generated.ts` `HOME_FIELD_STILLS.hero` (the ink cells and the disc cells, at 512 by 288 cells for 720 px and over and 179 by 100 under). Measured on day 0 with `direction-b/img/earth-tone.jpg` as a stand in tone source: 3,268 B of base64 for the ink and 596 B for the disc at 512 by 288, 752 B and 292 B at 179 by 100, 4,908 B in all, against LANDING.md's estimate of about 2.7 KB for the opener field. That is about 2.2 KB more decoded and 1.7 KB more brotli in the document. The gate of `home.budget.bytes-first` stays at Kevin's 80 KB decoded and 20 KB brotli (answer 10). L1 reads the document in push 1; a reading over the line is a red gate row that goes to Kevin, and the bound does not move.
- H5 under answer 1: the Blue Marble develops from the inlined still over 1,500 ms (`--ts-d-gather`) on the tone curve. A cell of the still lights when `smoothstep(p)` reaches its threshold `(m + 0.5) / 64` divided by the ink density of its 8 by 8 neighbourhood in the still, so every region reaches its own tone together and every inked cell is lit at the end. Nothing is requested for it. It starts after `load` and one idle callback and never later than T0 + 3.0 s. Past T0 + 3.0 s `field.ts` sets the still at once, and the boot script's timer sets the still at T0 + 3.0 s when the live module has not started the develop. LANDING.md's 4 s moves to 3.0 s so that the 1,500 ms develop ends inside T0 + 4.5 s (3.7).
- The h1 is final in the first frame and is the LCP element. The field's box is a CSS mask and a canvas, which are never LCP candidates; `home.budget.lcp` reads it.
- Under reduced motion, without script and for a crawler, the first paint holds the still at full tone.
- The credit: `docs/brand.md` 8 gains the hero's row (L1, push 1). The field's box carries `role="img"` with the name "The Blue Marble, NASA's photograph of the Earth". The line "Image: NASA, Reto Stöckli, 2007, public domain" sits on slide 1 in the slide's credit style, in the sheet's bottom margin on paper, as slide content the page draws (`copy.ts` `SLIDES.heroCredit`, outside the page's word count like every slide's words); the show and the print draw it with slide 1.

#### 2.3 Bands 4 and 6

- Band 4 (LANDING.md 2.6) works on slide 6, the Rosetta Stone. C1 is the Rosetta Stone developing over 2,400 ms from its tone map (`canvas-tone`). The Command row prints `turboslide slide to-canvas rosetta`, then `turboslide block set rosetta#<block> /pos '{"x":612,"y":388,"w":520,"h":96}'` and `turboslide block rotate rosetta#<block> --to 15`, with `<block>` from `canvasBlock`. Measured on day 0 from the deck's own two tone print: the tone map 11,421 B at JPEG quality 80 against 26 KB, the 2 px still 3,502 B at 1024 by 576 against 24 KB.
- Band 6 (LANDING.md 2.8) shows slide 7, the opener field's slide, from the Perfect and Editable text files. The export band shows the files as the CLI wrote them at build (the GT kit, both appearances); it does not follow the kit or the visitor's edits, because it shows the files. The show and the print follow both.

### 3. Answer 4: the example kits

| Kit     | Ground (Background)      | Text      | Captions  | Hints     | Primary and Accent | Label                       |
| ------- | ------------------------ | --------- | --------- | --------- | ------------------ | --------------------------- |
| GT      | the deck's own in the page's appearance | | | |                    | The GT brand deck's own kit |
| Kestrel | `#f3efe6`                | `#1f1b16` | `#4d463c` | `#6e665a` | `#1f1b16`          | An example customer's kit   |
| Fenwick | `#0a1b38`                | `#f4f1ea` | `#c9cbd3` | `#8d97ab` | `#f4f1ea`          | An example customer's kit   |

- The six variables are the roles of `packages/schema/src/brand.ts` 26 to 37 (Text `ink`, Background `paper`, Captions `ink-2`, Hints `titanium`, Primary `blue`, Accent `accent`). Primary and Accent take the kit's text colour, so no third hue enters a slide. A kit fixes its colours in both appearances, as a customer theme does.
- Fenwick is C's navy one step darker: `#0b1d3a` holds the selection ring `#2f5ce0` at 2.98:1, under the 3:1 of SC 1.4.11; `#0a1b38` holds it at 3.04:1. Against `#0a1b38` the text reads 15.18:1, the captions 10.57:1 and the hints 5.83:1. Kestrel reads 14.92, 8.11 and 4.93:1, and the ring 4.91:1 (computed on day 0 with the WCAG formula of `packages/render/src/theme-css.ts` 160 to 170).
- The label: the key cell reads "Example kits". Each swatch's tooltip (`data-tip`) names its owner: "GT. The GT brand deck's own colors.", "Kestrel. An example customer's colors.", "Fenwick. An example customer's colors." After a change the status reads "The GT kit set the colors of 8 slides." or "Fenwick, an example customer's kit, set the colors of 8 slides." (Kestrel the same). These are page copy shown only after a press, outside the count at rest and under every rule of LANDING.md 2.12.
- At rest the one colour outside paper and ink on `/home` is the Fenwick swatch's ground; `#2f5ce0` is never drawn at rest (answer 3).
- Writing a kit: `live/theme.ts` (L2) sets the six variables as inline custom properties on every `[data-home-slides]` root and on the show's and the print's slides, and sets `main[data-page-kit]`; GT removes them. The fields fill their still's box with the sheet's `--ink`, so a kit or an appearance change prints every field again in one frame with no script.

### 4. The interfaces the lanes share

#### 4.1 The DOM

| Attribute                                                                                              | Element                                                                    | Written by    | Read by                  |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | ------------- | ------------------------ |
| `main#top.ts-product[data-page="home"]`, `[data-hydrated]`                                             | the page root                                                              | L1            | all                      |
| `main[data-live="ready"]`                                                                              | set once every registration started                                        | L2 (`index.ts`) | drivers                |
| `main[data-page-kit="gt\|kestrel\|fenwick"]`                                                           | the kit in force                                                           | L2            | L4, drivers              |
| `[data-band="hero\|field\|agents\|tailor\|canvas\|present\|export\|parts\|close"]`                     | each `section`, labelled by its h2; `field` is the strip, `aria-hidden`    | L1            | all                      |
| `[data-home-slides][data-slide="<id>"][data-instance="<instance>"][data-counter="n / 8"]`              | the root of each server rendered slide instance (`slides.generated.ts`)    | L1 (build)    | all                      |
| `[data-object="<slide>#<block>"]` with `tabindex="0"` and `aria-roledescription="text box"`            | each selectable object's wrapper                                           | L1 (build)    | L2                       |
| `[data-field="hero\|strip\|canvas"]`, `[data-field-state="developing\|still"]`, `--ts-still`, `--ts-still-disc` | a field's box: the still as a mask over the kit's ink, then its canvas | L1; state by L4 and the boot script | L4  |
| `[data-agent-run]`, `[data-step]`, `[data-cmd]`, `[data-transports]`, `[data-panel]`, `[data-history]`, `[data-history-row]` | Run, the step label, the typed line's input, the tablist, the slot list, Version history and its rows | L1 | L3 |
| `[data-tailor-to]`, `[data-tailor-apply]`, `[data-tailor-count]`, `[data-kit="gt\|kestrel\|fenwick"]`, `[data-filmstrip]`, `[data-thumb="<slide id>"]`, `[data-stage]`, `[data-snackbar]` | the Tailor band (`data-kit` on the swatches) | L1 | L2 |
| `[data-layout-row]`, `[data-log]`                                                                      | the canvas band's Layout row and the Command row's `code`                  | L1            | L2                       |
| `[data-undo="hero\|tailor\|canvas"]`                                                                   | the three Undo buttons                                                     | L1            | L2                       |
| `[data-present]`, `[data-slide-list]`, `[data-slide-row="<id>"]`, `[data-print]`, `[data-show]`, `[data-show-stage]` | the Present band, its list, Print This Deck, the show dialog and its stage | L1 (the show by L3) | L3      |
| `[data-seam]`, `[data-pdf]`                                                                            | the seam's slider handle (its root carries `--seam-cut`) and Download the PDF | L1         | L3                       |
| `[data-mark-piece="0".."6"]`                                                                           | the close slide's seven mark pieces                                        | L1 (build)    | L4                       |
| `[data-announce]`                                                                                      | one polite live region per band                                            | L1            | L2, L3, L4               |
| `html.ts-intro`                                                                                        | the hero's start pose                                                      | the boot script (L4) | L1's CSS (H1), L4 |

- The Run button's hook is `[data-agent-run]` in place of LANDING.md 6.3's `[data-run]`, because `renderSlide` writes `data-run` on every text run when `blockAttrs` is on (`packages/render/src/slide.ts` 334), and `[data-run]` would match the slides' own text. A page hook never reuses a renderer attribute (`data-block`, `data-type`, `data-run`, `data-theme`, `data-dither*`, `data-light`, `data-dark`). The swatches keep LANDING.md's `[data-kit]` and the page's kit in force is `main[data-page-kit]`.
- The fields are named by their place, `hero`, `strip` and `canvas`, in place of LANDING.md's `opener|strip|earth`, because answer 1 moved the pictures.
- Every slide instance outside the hero has its heading elements rewritten to `div` by the build, so the page has one h1 (the hero's title, `id="ts-product-h1"`) and one h2 per band (`home.page.order`).

#### 4.2 The generated files

Written by L1's build and never edited by hand. The integrator landed their types with placeholder values on day 0 (section 10).

| File                                                        | Exports                                                                                       | Read by                                                                       | Chunk                                                    |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------- |
| `src/components/home/deck.generated.ts`                     | `HomeSlideId`, `SheetBox`, `HomeObjectId`, `HomeObject`, `HomeSlideFacts`, `FieldDisc`, `HOME_DECK` | the route's components, the live module                                  | route (shared)                                           |
| `src/components/home/slides.generated.ts`                   | `HOME_SLIDES_SENTINEL`, `HomeInstanceId`, `HOME_SLIDE_HTML`, `FieldStill`, `HOME_FIELD_STILLS` | `HomeSheet` and `HomeField` behind `import.meta.env.SSR`                      | server only                                              |
| `src/components/home/live-slides.generated.ts`              | `LIVE_SLIDE_HTML` (slide 7, slide 5's two earlier written states)                             | the live module alone                                                         | live                                                     |
| `src/components/home/run.generated.ts`                      | `HomeRun`, `RunStep`, `TypedRecording`, `PanelText`, `HOME_RUN`                               | `HomeAgents` behind `import.meta.env.SSR`; `live/agents.ts`                   | live (server for the resting markup)                     |
| `src/components/home/boot.generated.ts`                     | `BOOT_SCRIPT`, `BOOT_SHA256`, `VISIT_GAPS`, `GapTable`                                        | `src/routes/home.tsx` inlines `BOOT_SCRIPT`; the tests read `VISIT_GAPS`      | route (the string)                                       |
| `src/components/home/assets.json`, `assets.ts`              | `HomeAssetRole`, `HomeAsset`, `HOME_ASSETS`, `homeAsset(role, appearance)`                    | the route's components (hashed paths), the live module, `assets.test.ts`      | route (shared)                                           |
| `src/components/home/facts-data.ts`                         | as today, plus `menus` and `cliCommands` (LANDING.md 6.1)                                     | `facts.ts`                                                                    | route                                                    |

- Two files are added to LANDING.md 6.1's list: `deck.generated.ts` and `live-slides.generated.ts`. Rollup places a module in one chunk; a module imported by the route and by the live module goes into the route chunk whole. One `slides.generated.ts` holding the client safe facts and slide 7's markup would therefore put slide 7 in the route chunk and break `home.budget.bytes-first` and its sentinel. So the facts the route needs, the markup only the server needs and the markup only the live module needs are three files.
- Server only content reaches the document through `dangerouslySetInnerHTML` on an element that renders `''` on the client with `suppressHydrationWarning` (LANDING.md 2.0's `HomeSheet` rule). That covers the slides, the stills (a server only `<style>` setting `--ts-still` and `--ts-still-disc` on each `[data-field]`), the agents panel's resting screen and the MCP and HTTP tab panels. React leaves such an element alone after hydration, and the live module rewrites it.
- `--check` compares every generated file with its sources' sha256 and fails on a stub, so push 1 cannot ship a placeholder.

#### 4.3 `panel-format.ts` (landed on day 0, L1's file)

`PANEL_WIDTHS` (`wide` 64 columns and 14 slots, `narrow` 44 and 22), `CONTINUATION_INDENT` (4), `BANNER_INDENT` (14), `NAME_MAX` (24), `PanelOverflowError`, `wrapLine(line, columns, { indent?, overlong?: 'throw' | 'break' })`, `formatLines(lines, width, options?)`, `formatScreen(lines, width, options?)` (throws past the slots), `splitWords(line)` (`{ ok: true, words }` or `{ ok: false, reason: 'unclosed-quote' }`), `escapeDoubleQuoted`, `escapeSingleQuotedJson`, `quoteWord`, `substituteName(command, from, to)` and `substituteAnswer(answer, from, to)`. The build formats every screen with `overlong: 'throw'`; the live module echoes a typed line with `overlong: 'break'`. `panel-format.test.ts` holds the wrap, the slot, the POSIX split and the escaping rules for Northwind, `O'Neil & Co` and `"Q" $5`.

#### 4.4 The store (landed on day 0, L2's file)

`live/state.ts` exports `Band`, `UndoBand` (`hero`, `tailor`, `canvas`), `Author`, `KitId`, `AgentStep`, `HistoryRow`, `HomeDeckState` (`order`, `poses`, `texts`, `canvas`, `customer`, `kit`, `agentStep`, `history`), `Change` (`band`, `author`, `words`, `at?`, `next`, `undo`, `coalesce?`, `run?`), `StoreEvent`, `HomeStore` (`get`, `commit`, `undo(band)`, `canUndo(band)`, `subscribe`), `COALESCE_MS` (700), `restState(deck, runRowWords)` and `createHomeStore(initial, now?)`. Rules every band follows:

- Every change goes through `commit`; nothing else writes the page deck. Version history, the counters, the show and the print read `get` and `subscribe`.
- `undo(band)` takes the newest change of that band only and takes its Version history row away (a cut). The agents, Present and export bands have no Undo, and their changes carry `undo: null`. Run Again commits one change with `words: null` that sets `agentStep` to 0, the order to `HOME_DECK.startOrder` and removes the rows marked `run`.
- A change's `undo` restores the absolute values it read before it applied, so a burst merged by `coalesce` undoes to the state before its first change.
- The words of a row, the same in `copy.ts` `HISTORY` (generated text, outside the count, under the copy rules):

| Change                           | Band    | Author | Words                                                     |
| -------------------------------- | ------- | ------ | --------------------------------------------------------- |
| Drag or a burst of nudges        | hero, canvas | You | "Moved the title on slide 1"                         |
| Resize                           | hero, canvas | You | "Resized the heading on slide 6"                     |
| Turn                             | hero, canvas | You | "Turned the heading on slide 6 to 15 degrees"        |
| Typing in an object              | hero, canvas | You | "Edited the subtitle on slide 1"                     |
| Tailor                           | tailor  | You    | "Tailored for Globex"                                     |
| A kit                            | tailor  | You    | "Set the Kestrel kit"                                     |
| A filmstrip move                 | tailor  | You    | "Moved slide 2 to place 4"                                |
| A typed `tailor` in the panel    | agents  | Agent  | "Tailored for Globex"                                     |
| Step 1, 2, 3                     | agents  | Agent  | `run.generated.ts` `history`: "Added slide 5 with the Ruled rows layout", "Set the title of slide 5", "Set the rows of slide 5" |

The object names are "the title", "the subtitle", "the heading", "the text", "the credit" and "the plate"; the slide number is the slide's place when the change was made. The layout name in step 1 is the layout's label from `packages/schema/src/layouts.ts`. A typed line in the panel goes through the CLI's transport, so its row names Agent.

#### 4.5 Motion

- The tokens are in `grammar.css` since day 0 (section 10): the four curves and the eleven durations of LANDING.md 3.1 on `:root`, all durations 0 ms under `prefers-reduced-motion: reduce`. Holds, clocks and input windows are not tokens and are not zeroed: the flag's 800 ms, the 24 ms clock, the 34 to 60 ms key gaps, the 700 ms nudge step, the 400 ms gesture end and the 350 ms press.
- `live/motion.ts` is L4's. Its helpers land in push 2 as L4's commit before L2's, because pushes 2 to 6 animate through them; push 7 adds the observer. The signatures are fixed now:

```ts
export type DurationToken =
  | 'fast' | 'state' | 'row' | 'settle' | 'ground' | 'exit' | 'beat' | 'line' | 'lit' | 'gather' | 'develop';
export type CurveToken = 'arrive' | 'move' | 'tone' | 'fade';
export type SequenceBand = Band | 'field' | 'close';
/** --ts-d-<token> in ms from getComputedStyle(document.documentElement), times slowFactor() */
export function ms(token: DurationToken): number;
/** the CSS value of --ts-ease-<token> */
export function ease(token: CurveToken): string;
/** 3t^2 - 2t^3, the tone curve in script */
export function smoothstep(t: number): number;
export function reduced(): boolean;
/** 10 with ?slow=10, else 1 (3.5) */
export function slowFactor(): number;
/**
 * One Web Animation from the tokens; null under reduced motion or at 0 ms, with the last keyframe
 * set at once. On its end it commits its styles and cancels, so document.getAnimations() is empty
 * at rest (home.motion.rest); it is tracked so finishBand and finishAll end it.
 */
export function play(
  el: Element, keyframes: Keyframe[], token: DurationToken, curve: CurveToken,
  band: SequenceBand, delayMs?: number,
): Animation | null;
/** registers a running script sequence (a rAF loop, timers); finish() must set its end state */
export function sequence(band: SequenceBand, finish: () => void): { done(): void };
/** any new input on a band finishes its running sequences first (3.5) */
export function finishBand(band: SequenceBand): void;
/** a hidden tab or a change of reduced motion (3.5) */
export function finishAll(): void;
/**
 * Push 7. threshold 0.35, once, unobserved after. arm() sets the hidden first pose and is called
 * only when the element is below the viewport at first observation; above it, nothing plays.
 */
export function onceInView(el: Element, arm: () => void, play: () => void): void;
```

- `requestAnimationFrame` runs only while a field prints or a sequence runs; nothing loops; positions move by `transform` only (LANDING.md 3.4, 3.5).

#### 4.6 The live module's registration

`live/index.ts` is L2's; L3 and L4 add their lines in push order (LANDING.md 6.4). The signatures are fixed now:

```ts
export type LiveContext = {
  root: HTMLElement; // main#top
  band: HTMLElement; // the section[data-band] the registration names
  store: HomeStore;
  announce(text: string): void; // the band's [data-announce]
};
export type Registration = { band: 'hero' | 'field' | Band | 'close'; start(ctx: LiveContext): void };
/** in push order: hero and canvas (2), tailor (3), agents and history (4), present (5), export (6), fields, mark and motion (7) */
const REGISTRATIONS: readonly Registration[];
/** creates the store from restState, starts each registration whose band is on the page, then sets main[data-live="ready"] */
export function startLive(root: HTMLElement): void;
```

- One registration failing is caught and the others still start.
- The route's line (L1's `home.tsx`, landing in push 2 from L4's day 0 request): after `load`, one `requestIdleCallback` with `timeout: 1500` (a `setTimeout` of 0 where it is absent), then `import('../components/home/live/index')` and `startLive(main)`. Never before `load`; one chunk request.
- The bands' markup is their end state without the live module (pushes 1 to 6); the module only acts on input and on the in view motions of push 7.

#### 4.7 The boot script

`src/components/home/boot.ts` is L4's; `build-home-assets.ts --boot` writes `boot.generated.ts`; `home.tsx` inlines it as an empty string until push 7. Before the first paint it reads reduced motion, picks the visit sentence (`ts-home-visit` in `localStorage`, an index from 0 to 2, the next each visit, wrapping, the first when storage throws), sets it as the subtitle's text, and adds `ts-intro` to `html` unless reduced motion is set. Then it reads T0 (the later of the first paint and `document.fonts.ready`, capped at 800 ms after the first paint), types H2 to H4 from its gap table, ends the sequence on a key, a press or a wheel in the hero, and at T0 + 3.0 s sets `[data-field="hero"]` to `still` when no develop has started (answer 1). It reads no layout and is at most 1.5 KB minified. It exposes `window.tsHomeBoot = { t0: number | null, ended: boolean, end(): void }`, which `live/hero.ts` and `field.ts` read and the drivers wait on.

#### 4.8 The copy table

`copy.ts` is L1's and is rewritten in push 1 with these groups and keys, so the live module and the boot script read names that will not move. Generated text (`canvas.log`, `HISTORY`, the panel's lines) and slide content (`SLIDES`) are outside the word count and under every rule of LANDING.md 2.12. `DEFAULT_VIEW_EXEMPT` becomes `['meta', 'agents', 'canvas.log', 'parts']`.

| Group      | Keys                                                                                                                                                                                                                        | Read by         |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `NAV`      | `skip`, `lockup`, `docs`, `light`, `dark`, `signIn`, `newPresentation`                                                                                                                                                      | L1              |
| `HERO`     | `h1Lines` (three), `visit` (three, at most 50 characters each), `caption.pointer`, `caption.touchWide`, `caption.touchNarrow`, `undo`, `lead`, `buttons.newPresentation`, `buttons.openDeck`                              | L1, L4 (boot)   |
| `SLIDES`   | `heroCredit`, `heroFieldAlt`, `rosettaAlt`, `fieldAlt`                                                                                                                                                                      | L1, L3          |
| `AGENTS`   | `h2`, `lead`, `run.again`, `run.step(n)`, `stepLabel(n, total)`, `caption(seconds)`, `historyLabel`, `recorded`, `tabs.cli`, `tabs.mcp`, `tabs.http`, `panel.placeholder`, `panel.refusal(runs, total)`, `panel.requestOnly`, `panel.unclosedQuote`, `panel.longName` | L1, L3 |
| `TAILOR`   | `h2`, `lead`, `examplesKey`, `placeholder`, `empty`, `kits.<id>.name`, `kits.<id>.tip`, `kitStatus(kit, slides)`, `moveUp`, `moveDown` (the dialog's own words are the product's `TAILOR` of `@turboslide/chrome/panels/assist-strings`) | L1, L2 |
| `CANVAS`   | `h2`, `lead`, `layoutKey`, `layout.mood`, `layout.canvas`, `commandKey`, `commandRest`, `log.toCanvas(slide)`, `log.pos(slide, block, box)`, `log.rotate(slide, block, degrees)`                                           | L1, L2          |
| `PRESENT`  | `h2`, `lead`, `present`, `print`, `show.previous`, `show.next`, `show.exit`, `counter(n, total)` ("3 / 8"), `stageName(n, total)` ("Slide 3 of 8")                                                                         | L1, L3          |
| `EXPORT`   | `h2`, `lead`, `labels.perfect`, `labels.editable`, `rows.perfect`, `rows.editable`, `rows.pdf` (each `key`, `sentence`, `link`), `slider(percent)`                                                                         | L1, L3          |
| `PARTS`    | `h2`, `rows` (eight: `id`, `icon`, `key`, `where`, `figure(facts)`)                                                                                                                                                         | L1              |
| `CLOSE`    | `h2`, `lead`, `buttons.newPresentation`, `buttons.openDeck`                                                                                                                                                                 | L1              |
| `HISTORY`  | `moved(name, n)`, `resized(name, n)`, `turned(name, n, degrees)`, `edited(name, n)`, `tailored(name)`, `kit(name)`, `slideMoved(from, to)`                                                                                  | L2, L3          |
| `ANNOUNCE` | `slideAdded(n)`, `slideMoved(from, to)`, `showCounter(n, total)`                                                                                                                                                            | L2, L3          |
| `FOOTER`, `META` | as today                                                                                                                                                                                                              | L1              |

#### 4.9 The driver

- `apps/studio/e2e/core/home.spec.ts` is L4's and lands in push 1. It imports the seven lane modules `e2e/core/home/{page,objects,tailor,agents,present,export,motion}.ts`, calls each module's `rows()` in that order, and calls `coverage(import.meta.filename, [...every module's ROWS])` (`e2e/core/lib.ts` 40), so a row with no test reads "no test" and never passes.
- Each module exports `ROWS: readonly string[]` and `rows(): void`, and declares its tests with `test(title(id), ...)`. In push 1 L4 creates the six modules other than `page.ts` with `ROWS = []` and an empty `rows()`; each owner fills its own module in its push.
- `title(id)` throws on an id the matrix does not hold (`e2e/core/matrix.ts` 35 to 38), which stops the whole driver. So a module declares a row's test only in the push that enters the row in `core-matrix.json`.
- The rules of a core spec hold (`docs/FOCUS.md` 6.1): no fixture, no disk, no environment variable but `PLAYWRIGHT_BASE_URL` and `VERCEL_OIDC_TOKEN`, everything observed through the page and the network, retries 0. `/home` writes no store, so no row needs a teardown.

### 5. The rows

#### 5.1 The 37 `home.*` rows

Feature `decks` for every row (`AREA_FEATURE.home = 'decks'`, unparkable), driver `core/home.spec.ts`, today as LANDING.md 6.7 gives it. The row enters `core-matrix.json` in the push named. Changes from LANDING.md 6.7 are marked with the answer that made them. Measure rows carry `measure: true`, no severity, and are driven like any row (a measure row nobody drives is "no step" and fails the run).

| Id | Push | Module | Today, severity | Interaction and bound |
| -- | ---: | ------ | --------------- | --------------------- |
| `home.page.order` | 1 | `page.ts` | broken, 2 | At 1440 and 390 in both appearances: the nav, the hero sheet, the field strip, then the bands of 2.4 to 2.10 in order, each with one h2, then the footer; one h1 |
| `home.page.markup-final` | 1 | `page.ts` | broken, 2 | With script blocked, the paint at 1440 and 390 equals the hydrated page after every one shot motion finished, within 0.5 percent of pixels, the field and picture boxes included (their stills are in the markup or the band's request); no band shows an empty frame |
| `home.hero.type` | 1 | `page.ts` | broken, 2 | The h1 is the hero slide's title at 150 units (96 px ± 1 at a 1,024 px sheet), weight 500, -0.042 em, three lines "Build the pitch," "present it and" "send the link"; under 720 px it sits above the sheet at 40 px; every h2 is 54 px at 1440 and 30 px at 390; visible text uses weights 400 and 500 only; no sheet wider than a thumbnail draws a frame, so each side of the column shows two vertical lines at every full width sheet |
| `home.parts.table` | 1 | `page.ts` | broken, 1 | "Turboslide today" draws eight ruled rows with a Heroicon solid in each key cell, the where cell and a figure equal to `facts-data.ts` (9, 22, 135, 17, 180, 169, 177, MIT on today's tree) |
| `home.budget.bytes-first` | 1 | `page.ts` | broken, 2 | Cold at 1440 ×1, ×2 and 390: no picture requested before the first scroll; the document at most 80 KB decoded and 20 KB brotli (52 KB decoded once audit item 13 lands, answer 10), the hero's Blue Marble still inlined in it (answer 1, about 4.9 KB of base64 on day 0); the page's CSS at most 14 KB brotli; the route chunk at most 70 KB decoded and 22 KB brotli with no `data-home-slides` in it; the page's own bytes at most 70 KB over the wire |
| `home.budget.bytes-page` | 1 | `page.ts` | broken, 1 | After a full native scroll: the page's pictures at most 160 KB at ×1 and ×2 (slide 6's Rosetta Stone still at most 24 KB, its tone map at most 26 KB, slide 7's Perfect picture at most 60 KB, the Editable text picture part at most 32 KB, in the shown appearance), the page's own script at most 120 KB decoded, the page's own bytes at most 240 KB over the wire; nothing under `/home/` requested twice; no PDF and no slide 7 still requested |
| `home.budget.shared` | 1 | `page.ts` | not driven, measure | Report the shared entry chunk against 600 KB decoded, and the font against 120 KB with exactly one font request on `/home` (answer 7) |
| `home.budget.lcp` | 1 | `page.ts` | not driven, measure | The LCP element is the h1 and the hero's field is never the LCP element (answer 1); LCP at most 400 ms cold at 1440 ×1, ×2 and 390 on the preview, at most 200 ms warm; read at a load under 20 |
| `home.a11y.skip-and-contrast` | 1 | `page.ts` | broken, 1 | The skip link is the first Tab stop and moves focus to the hero; no text at rest falls under 4.5:1 (3:1 at 24 px and over) in either appearance |
| `home.hero.select` | 2 | `objects.ts` | broken, 2 | A click or Tab on the hero title draws the 1 px ring in `#2f5ce0`, eight square handles, the stem, the knob and the chip "Title" within 50 ms; no blue is drawn on the page before it (answer 3) |
| `home.hero.edit` | 2 | `objects.ts` | broken, 2 | Dragging the title 160 px follows the pointer within one frame and snaps within 6 px of the centre line with a 1 px guide in `#2f5ce0` (answer 3); a second click or Enter types at the pointer; Escape ends; Undo restores the words and then the place, the return on the move curve within 700 ms by transform; on touch the first tap only selects; on release the field prints again with the clear zone under the title's new place in one frame (answer 1) |
| `home.canvas.gestures` | 2 | `objects.ts` | broken, 2 | On slide 6, the Rosetta Stone (answer 1): resize by the east handle with the opposite edge fixed at any rotation; Shift turns in 15 degree steps with the angle in the chip; a drag off the plate turns the Layout row to Canvas; Undo three times returns every object and the row reads Mood |
| `home.canvas.log` | 2 | `objects.ts` | broken, 2 | Each gesture's end prints, within 450 ms, one line on the band's Command row (Inter, in a `code` element; no second `#101010` panel) in a form of `cli.json`: `turboslide slide to-canvas rosetta` before the first, then `turboslide block set rosetta#<block> /pos '<json>'` or `turboslide block rotate rosetta#<block> --to <degrees>` with `<block>` from `canvasBlock` (answer 1) and the gesture's values in whole slide units; no line breaks inside a token at 390; the live region reads it |
| `home.objects.keyboard` | 2 | `objects.ts` | broken, 2 | Tab reaches each object of slides 1 and 6; arrows nudge 1 unit and Shift 10 (`packages/viewer/src/keys.ts` 164, 165), nudges within 700 ms are one undo step; Option or Alt with Left or Right turns 15 degrees and with Shift 1 degree; Enter edits; Escape returns focus to the object; `[`, `]` and S do nothing |
| `home.budget.live-module` | 2 | `objects.ts` | broken, 1 | The live module is one request of at most 15 KB gzip and 48 KB decoded, made after `load` and one idle callback and never before `load`; it carries slide 7's HTML (the opener field's slide, answer 1) and slide 5's earlier states, and no other slide markup |
| `home.tailor.apply` | 3 | `tailor.ts` | broken, 2 | Typing Globex and pressing Apply or Enter replaces every Northwind in the deck's text and notes within 1 s; the count reads `TAILOR.count` and equals the CLI's recorded answer for the deck the page holds (with and without slide 5); the snackbar reads `TAILOR.result` with Undo and leaves by a cut; Undo restores every name; an empty field answers "Type a customer name first."; the field takes at most 24 characters |
| `home.tailor.theme` | 3 | `tailor.ts` | broken, 2 | The Kestrel swatch sets the six kit variables on every slide of the page deck within 500 ms; sampled every 40 ms, no text box's text falls under 4.5:1 against its ground; the show then draws Kestrel; GT restores; Fenwick sets `#0a1b38`, `#f4f1ea`, `#c9cbd3` and `#8d97ab` and the selection ring holds 3:1 on it; each swatch's tooltip and the kit sentence name GT the deck's own kit and Kestrel and Fenwick example customers' kits; at rest the one colour outside paper and ink on `/home` is the Fenwick swatch's ground and no `#2f5ce0` is drawn (answers 3 and 4); the row's key reads Example kits |
| `home.tailor.filmstrip` | 3 | `tailor.ts` | broken, 1 | Dragging slide 2 to place 4 lifts it with a 2 px outline, the others make room in 200 ms and it settles in 240 ms; every counter on the page renumbers; Cmd or Ctrl with Up or Down and Move Up or Move Down move the focused slide; Undo returns it; on touch a 350 ms press lifts it |
| `home.agents.rest` | 4 | `agents.ts` | broken, 2 | At first paint the agents band shows the transcript of the three recorded commands and answers in the panel's slots (14 at 1440, 22 at 390) with no line cut or wider than the panel, slide 5 written and three Agent rows; every counter reads n / 8 |
| `home.agents.run` | 4 | `agents.ts` | broken, 2 | Run Again cuts to the run's start (the banner screen, counters n / 7) and plays step 1; each press plays one step, from the press to the flag leaving, within 5 s with the fixture's name and with a 24 character name (the command at 24 ms a character, a JSON value whole, the answer, the ink ring travelling within 700 ms by transform, the change landing); the caption's figure equals `run.generated.ts`'s total rounded to the second; after step 3 every counter reads n / 8; focus stays on Run throughout |
| `home.agents.typed` | 4 | `agents.ts` | broken, 2 | `help` lists the five commands; `tailor --replace Northwind=Initech` renames as Tailor does and prints the recording for the deck the page holds; a step out of order prints the CLI's recorded refusal; anything else prints "This page runs 5 of the CLI's 180 commands." with 180 from `cli.json`; for the names `O'Neil & Co` and `"Q" $5` every printed command splits to the recording's argument list with the name replaced; Up recalls the last line |
| `home.agents.transports` | 4 | `agents.ts` | broken, 1 | The CLI, MCP and HTTP tabs (tabs with tab panels, arrow keys) show each command as `turboslide ...`, as `tools/call` with the tool name of `mcp-tools.json` and `baseRevision`, and as `POST /api/actions/<id>` of `openapi.json`; the MCP and HTTP panels print no answer and end with "Request only. The CLI tab shows the recorded answer." |
| `home.agents.history` | 4 | `agents.ts` | broken, 1 | Every change on the page adds one Version history row within 200 ms naming You or Agent with its Heroicon, the change in the words of section 4.4 and the time in "6:45 PM" form; an Undo takes its row away |
| `home.agents.recorded` | 4 | `agents.ts` | broken, 2 | The three steps' printed commands and answers equal `run.generated.ts`, whose CLI version equals the banner's and whose fixture sha equals `apps/studio/home-deck`'s; every MCP and HTTP body equals `run.generated.ts` and validates against the tool's `inputSchema` and the operation's request body schema (`build-home-assets.ts --check`) |
| `home.present.show` | 5 | `present.ts` | broken, 2 | Present, or Cmd+Enter (Ctrl+F5 off macOS) with the band half in view and no text field focused, opens the show on the slide chosen in the list within 800 ms with focus on the stage; keys page with a cut; Space and Enter go forward on the stage and press a focused Previous or Exit; the counter, notes and timer show; the slides carry the visitor's changes, slide 1 with the hero's Blue Marble and its credit (answer 1); Escape returns within 400 ms with focus on Present; S opens nothing |
| `home.present.focus` | 5 | `present.ts` | broken, 2 | On open focus is on the show's stage; Tab cycles among Previous, Next and Exit and never reaches the page behind |
| `home.present.print` | 5 | `present.ts` | broken, 1 | Print This Deck and Cmd or Ctrl+P print the page deck as the visitor left it, one 16 by 9 page per slide (eight pages under print emulation); with the live module absent, the hero slide alone |
| `home.export.seam` | 6 | `export.ts` | broken, 2 | Dragging the seam follows the pointer 1:1 with no inertia; a click sets it; the left side decodes to the pixels of slide 7's picture part in the Perfect file (the opener field's slide, answer 1; `assets.json`) and its label's size equals that picture's; the right side's text boxes sit at the Editable text file's `a:off` and `a:ext` within 1 px at the sheet's scale, hold its `a:t` runs and are selectable; the labels read Perfect and Editable text; the handle is a slider with arrows 2, Shift 10, Home and End |
| `home.export.figure` | 6 | `export.ts` | broken, 1 | The Perfect row's figure equals `facts.json` `export` and its sentence compares the picture with its screenshot; the link goes to `docs/pptx.md`; Download the PDF downloads a PDF of 8 pages whose sha256 is in `assets.json`, requested only on the click; no text on the page reads "pixel for pixel" |
| `home.motion.hero` | 7 | `motion.ts` | broken, 1 | The hero sequence plays once: rails 600 ms at 0, 60, 120 and 180 ms; the caret appears with the first key at T0 + 700 ms, holds solid with no blink and leaves by a cut 400 ms after the last key; the subtitle types; the Blue Marble develops from the inlined still over 1,500 ms, starting no later than T0 + 3.0 s, or its still shows at once at T0 + 3.0 s (answer 1); each of the three sentences ends by T0 + 4.5 s by its gap table and as measured; a key, press or wheel in the hero ends it at once; the h1 never moves; no visit sentence exceeds 50 characters; a return visit shows the next sentence with no text swapped after the first paint |
| `home.motion.in-view` | 7 | `motion.ts` | broken, 1 | F1 (1,500 ms), C1 (the Rosetta Stone, 2,400 ms, answer 1), E1 (600 ms) and K1 (930 ms) play once at 35 percent in view and never again on scrolling back; a band above the viewport at first observation renders final |
| `home.motion.rest` | 7 | `motion.ts` | broken, 2 | After every band has played: 0 `requestAnimationFrame` calls in 2 s, `document.getAnimations()` empty and at most 2 ms of task time a second at the top, middle and bottom; no element animates `left`, `top`, `width` or `height` |
| `home.motion.reduced` | 7 | `motion.ts` | broken, 2 | Under reduce: `document.getAnimations()` empty after the load, a full scroll and each interaction; every field drawn at final tone at once; Undo, the show, the ring and the kit cut; every interaction works |
| `home.motion.hidden-tab` | 7 | `motion.ts` | broken, 1 | A sequence running when the tab hides finishes at its end state |
| `home.budget.frame` | 7 | `motion.ts` | not driven, measure | A field frame (the hero's develop, the gather, the Rosetta develop) at most 2 ms at 1x and 8 ms at 4x CPU; a band entering at most 10 ms at 1x and 35 ms at 4x; read at a load under 20 |
| `home.budget.main-thread` | 7 | `motion.ts` | not driven, measure | Before LCP no page code runs but the boot script (at most 1.5 KB, at most 5 ms at 1x) and script task time is at most 120 ms at 1x; the live module's boot at most 20 ms at 1x and 60 ms at 4x; task time from `load` to 6.5 s after at most 150 ms at 1x; no task over 50 ms from page code; read at a load under 20 |
| `home.a11y.keyboard-walk` | 7 | `motion.ts` | broken, 2 | A Tab walk of the whole page reaches every control and object in reading order with a visible focus indicator and never enters a hidden control; no key without a modifier acts unless focus is on what it changes (SC 2.1.4); Cmd or Ctrl+Z with focus outside an editing band changes nothing |

Evidence for each row is LANDING.md 6.7's. Each row's `note` reads "docs/LANDING.md 6.7; bound fixed in docs/gslides-parity/landing/build/integrator.md, Landing day 0, 5.1".

#### 5.2 The 13 restated `decks.home.*` rows

Driver `core/decks.spec.ts`, rewritten by L1 in push 1; the ids, features and severities stay.

| Id | Interaction and bound |
| -- | --------------------- |
| `decks.home.seller-lead` | The h1 reads "Build the pitch, present it and send the link"; in a fresh context the hero slide's subtitle reads "Turboslide is a slides editor in the browser."; the second hero button reads Open the Example Deck and opens `/deck/gt-brand` (answer 6) |
| `decks.home.copy-rules` | `copy.test.ts` passes with LANDING.md 2.12's rules; the page copy outside the slides, the panels, Version history's rows and the product's strings holds under 350 words at rest |
| `decks.home.pictures-three-widths` | At 1440, 1280 and 390 in both appearances nothing is wider than the viewport, the slides sit at the widths of LANDING.md section 2, and the page is under 7,500 px at 1440 and 8,500 at 390 (answer 5) |
| `decks.home.load-budget` | Measure, as today, with LANDING.md 4.1's numbers in its note; the document against 60 KB decoded until audit item 13 lands (answer 10) |
| `decks.home.layout-shift` | CLS 0 at the three widths in both appearances over the load, the hero sequence (the develop included), a full scroll, every in view motion and each interaction's end state |
| `decks.home.grammar` | As today, plus "no sheet wider than a thumbnail draws a frame" |
| `decks.home.capture-plain` | No selection ring, chip, handle, caret or guide is drawn at rest (the driver reads the page itself; the captures are retired) |
| `decks.home.product-pictures` | Every slide on `/home` is the `renderSlide` output of the page deck built from `apps/studio/home-deck` at the shipped commit, and every picture is a file part or a still in `assets.json` or an inlined still of `slides.generated.ts` (`build-home-assets.ts --check` exits 0); the test no longer runs `shots.test.ts` |
| `decks.home.new-presentation` | As today, and the close band's New Presentation reaches `/new` the same way |
| `decks.home.your-presentations`, `decks.home.links-and-card`, `decks.home.copy`, `decks.home.phone` | Unchanged |

#### 5.3 Checks outside the matrix, read in each push's note

`node scripts/build-home-assets.ts --check` exits 0; the home vitest files (`copy`, `facts`, `assets`, `panel-format`, `live/state`) pass; the brand lint exits 0 in enforce mode (radius, `scroll-behavior`, monospace outside the one `/home` code surface, the one rail, the credits); `e2e/home-page.spec.ts`'s ShaderMount test passes; `node scripts/check.mjs` at the push's tree.

### 6. The assets and their build

| Asset | Where | Built by | Bound | Requested |
| ----- | ----- | -------- | ----- | --------- |
| The hero's Blue Marble still: ink and disc, 512 by 288 and 179 by 100 cells, 1 bit PNG | inlined, `slides.generated.ts` | `--stills` from `home-deck/assets/mood-earth-light.jpg` | counted in the document (about 4.9 KB of base64 on day 0) | never |
| The field strip's still: 512 by 80 and 179 by 48 cells | inlined, `slides.generated.ts` | `--stills` | counted in the document | never |
| `canvas-still`: slide 6's Rosetta Stone print, one two colour lossless WebP mask (the dark print is its complement) | `public/home/` | `--stills` from `home-deck/assets/mood-rosetta-light.jpg` | 24 KB (3.5 KB on day 0) | with the band, one viewport ahead |
| `canvas-tone`: the Rosetta Stone's tone map, 640 by 360 grey JPEG | `public/home/` | `--stills` | 26 KB (11.4 KB on day 0 at quality 80) | when C1's observer arms below the viewport |
| `field-still`: slide 7's opener field print, one mask | `public/home/` | `--stills` from `home-deck/assets/field-light.png` | 24 KB | only when the show reaches slide 7 or `beforeprint` fires |
| `export-perfect`, light and dark: slide 7's picture part of the Perfect file (3200 by 1800), or lossless WebP of the same pixels when smaller | `public/home/` | `--export` (`turboslide export pptx --mode flatten`) | 60 KB each | with the band |
| `export-editable`, light and dark: the Editable text file's picture part for slide 7 | `public/home/` | `--export` (`--mode native`, read with `jszip`) | 32 KB each | with the band |
| `pdf`, light and dark: the page deck, 8 pages | `public/home/` | `--export` (`turboslide export pdf`) | none | only on the click |
| `field-light.png`, `field-dark.png` | `apps/studio/home-deck/assets/` | `--stills`, once, committed | in the fixture's sha256 | never served |
| `mood-earth-{light,dark}.jpg`, `mood-rosetta-{light,dark}.jpg` | `apps/studio/home-deck/assets/` | copied from `decks/gt-brand/assets/` | credited in `docs/brand.md` 8 | never served |

- Every dithered picture the page shows is a mask over a box filled with the sheet's `--ink`, so a kit or an appearance change prints it again with no script. A light ground uses the light print and a dark ground its complement within the picture's extent (section 2.2).
- Every served file is content hashed and `immutable` (`vite.deploy.config.ts` 197); `assets.json` records its bytes, sha256, size, decoded pixel sha256, part sha256 and page count; `assets.test.ts` checks every file under `public/home/` against it and every inlined still against its source. The old captures (`hero-*`, `canvas-*`, `menus-*`) leave in push 1.
- The flags of `scripts/build-home-assets.ts` are LANDING.md 6.1's: `--run`, `--slides`, `--stills`, `--export`, `--boot`, `--facts`, `--check`. `--export` drives headless Chromium through the CLI's exporter and runs where the CLI's export runs; `--check` needs no browser. The build runs the CLI as `node apps/cli/bin/turboslide.mjs` (the orchestrator's rules forbid `pnpm exec`).
- Nothing is added to any `package.json` for the landing: `sharp`, `jszip`, the CLI and `@turboslide/effects` are in the tree already, and LANDING.md adds no dependency. The day 0 `pnpm install` therefore did not run. `packages/chrome/package.json` gains one export line, `"./panels/assist-strings"`, in push 3 (L2); a workspace export needs no install.

### 7. The push list

Each push is one mechanism and enters its own rows (section 5). The commit key is the push's: `L1#1`, `L2#2`, `L2#3`, `L3#4`, `L3#5`, `L3#6`, `L4#7`. A push that carries another lane's hunk has one commit per lane under the same key, the hunk first, each lane committing only its own paths.

| # | Key | Lane and commits | Files | Rows entered |
| -: | --- | ---------------- | ----- | ------------ |
| 0 | `L1#0` | Integrator, on day 0 | Section 10 | none |
| 1 | `L1#1` | L4's hunk, then L1 | L4: `scripts/probes/core-matrix.mjs` (`AREA_FEATURE.home = 'decks'`, `'core/home.spec.ts'` in `CORE_SPEC_DRIVERS`), `scripts/probes/core-matrix.test.mjs`, `apps/studio/e2e/core/home.spec.ts`, the six empty modules `e2e/core/home/{objects,tailor,agents,present,export,motion}.ts`, `apps/studio/e2e/home-page.spec.ts` restated. L1: `src/routes/home.tsx` (with the boot script's inline line, empty until push 7), `home.css`, the components of LANDING.md 6.1, `copy.ts`, `copy.test.ts`, `facts.ts`, `facts.test.ts`, `grammar.css` (the rest of its changes), `selection.css`, `print.css`, `assets.test.ts`, the generated files of 4.2, `apps/studio/home-deck/**`, `public/home/**`, `scripts/build-home-assets.ts`, the retirements, `e2e/core/decks.spec.ts`, `e2e/core/home/page.ts`, `packages/lint/src/brand/config.ts` (the `/home` entry), `docs/POLISH.md` 3, `docs/brand.md` 8 and 11, `core-matrix.json` | 5.1 push 1 (nine), the 13 restated rows |
| 2 | `L2#2` | L4's hunk, L1's line, then L2 | L4: `live/motion.ts` (the helpers of 4.5). L1: `src/routes/home.tsx` (the lazy import line of 4.6). L2: `live/index.ts`, `live/state.ts`, `live/state.test.ts`, `live/objects.ts`, `live/log.ts`, `e2e/core/home/objects.ts`, `core-matrix.json` | 5.1 push 2 (six) |
| 3 | `L2#3` | L2 | `live/tailor.ts`, `live/theme.ts`, `live/filmstrip.ts`, `live/index.ts` (its lines), `packages/chrome/package.json` (one export line), `e2e/core/home/tailor.ts`, `core-matrix.json` | 5.1 push 3 (three) |
| 4 | `L3#4` | L3 | `live/agents.ts`, `live/history.ts`, `live/index.ts` (L3's lines), `e2e/core/home/agents.ts`, `core-matrix.json` | 5.1 push 4 (six) |
| 5 | `L3#5` | L3 | `live/show.ts`, `live/print.ts`, `live/index.ts` (L3's lines), `e2e/core/home/present.ts`, `core-matrix.json` | 5.1 push 5 (three) |
| 6 | `L3#6` | L3 | `live/seam.ts` (exports `hint()` for E1), `live/index.ts` (L3's line), `e2e/core/home/export.ts`, `core-matrix.json` | 5.1 push 6 (two) |
| 7 | `L4#7` | L4 | `src/components/home/boot.ts`, `boot.generated.ts` (regenerated with `--boot`), `live/field.ts`, `live/hero.ts`, `live/mark.ts`, `live/motion.ts` (the observer, the hidden tab, the reduced change), `live/index.ts` (L4's lines and E1's wiring to `seam.ts` `hint()`), `e2e/core/home/motion.ts`, `core-matrix.json` | 5.1 push 7 (eight) |

- The commit form: `until mkdir /Users/kevinliu/repos/Turboslide-landing/.turboslide/git.lock 2>/dev/null; do sleep 3; done`, then `git -c user.email=kevin@generaltranslation.com -c user.name="Kevin Liu" add <your paths>` and `commit` with the subject starting with the key, a body naming the items, files and rows with their readings, and the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; then `rmdir` the lock, also on failure. Never rebase, reset, amend another's commit, push or switch branches.
- The ship (LANDING.md 6.8) follows Round 1's push 21 and is a later step; push 1 replaces B2a's `/home` on production.

### 8. The shared files and their order

| File | Owner and order |
| ---- | --------------- |
| `live/index.ts` | L2 owns; L3 (pushes 4 to 6) and L4 (push 7) add their registration lines in push order |
| `live/state.ts` | L2 owns; the interface of 4.4 is fixed; L3 and L4 read it and ask L2 for a change |
| `live/motion.ts` | L4 owns; its helpers land in push 2 before L2's commit, its observer in push 7; L2 and L3 read it |
| `src/routes/home.tsx` | L1 owns; the boot script's inline line lands in push 1 (empty until push 7), the lazy import line in push 2, both from L4's day 0 request recorded here |
| `panel-format.ts` | L1 owns, landed on day 0; L3 imports it and asks L1 for changes |
| `grammar.css` | L1 owns; L4's token block landed on day 0 |
| `copy.ts` | L1 owns; the keys of 4.8 are fixed; L2, L3 and L4 ask L1 for a new key |
| `boot.generated.ts` | written by L1's build; L4 regenerates it with `--boot` in push 7 |
| `e2e/core/home.spec.ts` | L4 owns; it imports all seven modules from push 1, so no lane edits it |
| `packages/lint/src/brand/config.ts` | L1 owns the one `/home` entry, in push 1 |
| `scripts/probes/core-matrix.mjs` and its test | L4 owns; its two lines land in push 1 |
| `docs/gslides-parity/focus/core-matrix.json` | each push enters its own rows |

### 9. Gates, locks, ports and the load rule

- Per push (LANDING.md 6.6 item 1): the push's rows and every `home.*` row entered before it through `scripts/probes/core-gate.mjs` against a localhost server on `vite.no-watch.config.ts` with a scratch `--lock` folder; `node scripts/build-home-assets.ts --check`; the home vitest files; the brand lint in enforce mode; `node scripts/check.mjs`.
- A dev server: from `apps/studio`, `TURBOSLIDE_STORE=tmp TURBOSLIDE_OVERLAY_DIR=.turboslide/<key>-overlay TURBOSLIDE_REALTIME=memory TURBOSLIDE_LOCAL_OPEN=1 TURBOSLIDE_SESSION_SECRET=<32 or more characters> TURBOSLIDE_DOWNLOAD_SECRET=<32 or more characters> node_modules/.bin/vite dev --port <your port> --strictPort` (`-c vite.no-watch.config.ts` for gates), on the lane's own ports from its prompt, stopped before the lane returns. Playwright holds `.turboslide/e2e.lock`. The integrator's ports are 4545 and 4555. Never 4471 to 4534 or 8791 to 8809, and never another worktree.
- The load rule: timing and budget readings only at a one minute load average under 20 (measure rows) or 24 (interaction bounds); otherwise wait in detached five minute sleeps or record "not read: load". Bytes and counts do not move with load.
- Pictures: under `docs/gslides-parity/landing/build/<key>/`, PNG or JPEG under 400 KB each, both appearances at 1440 and 390, each beside prototype A's matching picture (LANDING.md 8). A surface that does not match, or reads plain, crowded or broken, is not done.

### 10. Landed on day 0 (`L1#0`)

The shared scaffolding LANDING.md assigns to day 0, nothing else:

- The generated shapes with placeholder values (6.3): `deck.generated.ts`, `slides.generated.ts`, `live-slides.generated.ts`, `run.generated.ts`, `boot.generated.ts`, `assets.ts` and `assets.json`, under `apps/studio/src/components/home/`.
- `panel-format.ts` and `panel-format.test.ts` (6.4: L1 lands it on day 0 with the generated shapes).
- L4's motion token block in `grammar.css` (6.4).
- `live/state.ts` with `live/state.test.ts` (6.4: the interface fixed on day 0), written so L3 and L4 type against it now.
- This note.

Read on the day 0 tree: `vitest run` over `panel-format.test.ts` and `live/state.test.ts` passed 16 of 16; `tsc` with the studio's `tsconfig.json` over the ten new TypeScript files exited 0; `prettier --write` formatted them. Nothing imports the new files yet, so the page is unchanged.

The files LANDING.md does not assign to day 0 are fixed here as interfaces and written by their owners: `live/index.ts` (L2, push 2), `live/motion.ts` (L4, push 2), the driver and its modules (L4 and each owner, push 1 on), the route's two lines (L1, pushes 1 and 2).

The size, restated: LANDING.md 6.5's 9 lane days, plus about half a day for answer 1 (L1: the Earth still, the disc rule and slide 7's field picture; L4: the develop from the still), so 9.5 lane days; about 3 days of wall time for the lanes, then half a day for the merge, the whole local matrix, the preview and seven guard checks.

### 11. For Kevin, from day 0

1. Answer 1 costs about 2.2 KB more of the document than LANDING.md costed (4,908 B of base64 for the Earth's stills against about 2.7 KB for the opener field). The gate stays at your 80 KB and 20 KB. If push 1 reads over it, the row is red and comes back to you.
2. Fenwick's navy is `#0a1b38`, one step darker than C's `#0b1d3a`, so the blue selection ring keeps 3:1 on it (3.04 against 2.98).
3. Slide 7's plate words ("The opener field", one sentence, "Drawn in Turboslide") are this note's default and L1 may change them.
4. Slide 1 in the downloaded PDF and PowerPoint files has no Earth, because the title layout has no picture; the page, the show and the print draw it.
