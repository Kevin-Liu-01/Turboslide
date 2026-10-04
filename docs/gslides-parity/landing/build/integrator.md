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

## Landing second pass, merge

Written by the integrator of the second pass from 19:58 PDT on 2026-10-03 to 02:37 PDT on 2026-10-04 in `/Users/kevinliu/repos/Turboslide-landing` on `landing/redesign`, which stood at `c4dd5816` (V4's closing seam) when it began. Read before anything else: `docs/LANDING.md` (every section), `AGENTS.md` (dev servers, hosting, installs, ownership), `docs/FOCUS.md` 6.2, the four lane notes `v1.md` to `v4.md` with their requests and closing states, and the orchestrator's reports of V1 to V4. The integrator's ports were 4545 (a dev server on `vite.no-watch.config.ts`, the memory tier, a tmp store) and 4555 (the node-server output of check step 31, the memory tier, a tmp store). Nothing was pushed and nothing changed on Vercel, Cloudflare, GitHub or Google but the one preview deployment below, to Kevin's personal project, never `--prod`. Times are PDT; loads are one minute load averages.

### 1. The requests and their answers

Every request open when its lane closed, the readings each lane sent to Kevin (section 8), and what the integrator's own runs found. A seam commit is named for the push it serves.

| Request | From, to | Answer | Commit |
| --- | --- | --- | --- |
| Q13: `"@paper-design/shaders": "catalog:"` in `apps/studio/package.json` with its lockfile importer line | V4, the integrator | Done. The importer line is written by hand in pnpm's format beside `packages/materials`' line. Check step 1 (`pnpm install --frozen-lockfile`) accepted it at 20:15 and replaced V4's uncommitted link with pnpm's own; the preview's build accepted it ("Lockfile passes supply-chain policies") | `47160fda` V4#19 seam |
| Q20: `people-timing.ts` out of `live/`, so the route imports no live module and `home.present.print`'s bare page hydrates on a dev server | V4, V1 or the integrator | Done: the file is `src/components/home/people-timing.ts` with its four importers. `home.present.print` passed on 4545 at 20:11 and in the run of record | `44858636` V4#20 seam |
| R12 and R13: LANDING.md 2.2 and 2.9 name the build's `version save` before the run (four recorded versions) and the turn chip's `layout/freeform` finding | V3, the integrator | Done in LANDING.md alone; the build has done both since `02b67cb7` | `17da98d1` V3#13 seam |
| R19: copy keys `PRESENT.skipped` and `HISTORY.restoredVersion(n)` | V3, V1 | Done; `agents.ts`, `show.ts`, `versions.ts` and the present driver read the keys, and the casts and fallbacks leave. The words are the fallbacks' | `3b85fbc7` V3#16 seam |
| The export band's seam knob moves by a layout property (CLS 0.000001 to 0.000022 at 1440 in `home.page.bands-after-load`) | V1 and V4, V3 | Done: the handle is as wide as the slide and moves by `transform: translateX(var(--seam-cut))`; it takes no pointer but the knob's. A probe read 0 layout shift entries on the whole page through E1 at 1440 and 390; CLS 0.000000 at both widths in the run of record and on the preview | `fdc961c8` V1#8 seam |
| The push order of the rows entered in V2#11 to V2#14 in `core-matrix.json` | V1, V2 and V3 | Closed by V4 in `35012ebe`; `core-matrix.test.mjs` 37 of 37 at 20:13 | none |
| R16: the day 0 contract (`V0#0`) did not land | V2, the integrator | Closed by record: no `V0#0` commit exists and none is made now. The store's and the band loader's interfaces are V2's hunk of V1#8 (`172b3bda`, `bc3d1242`, `11df4c10`). LANDING.md 6.3's split never happened: the Tailor, canvas, Present and export rules stay in `home.css` beside `editing.css`, `agents.css` and `motion.css`, and `--run` and `--export` live in `scripts/home/run.ts` and `export.ts` called from the entry | none |
| The stage's registration in V1's commit of V1#15 | V2, V1 | Done by V1 in `a8dfb2fc` | none |
| Found by the chain: 15 of V3's files unformatted (check step 19) | the integrator | Formatted, no other change | `8b631835` V3#17 seam |
| Found by the run of record: `home.budget.live-module` red, the core 21,639 B gzip (line 20,480) | the integrator, for V4 and V2 | The interludes' glyphs leave the core for a chunk of their own, imported when the core starts (as V1#15 moved the hero's stage). The core reads 20,365 B gzip on the client build of check step 30; section 5 | `c699900b` V4#18 seam |
| Found by the run of record: `home.hero.edit` red on the build only (the minified `--ts-ease-move` reads `cubic-bezier(.65, 0, .35, 1)`) | the integrator, for V2 | The driver compares the curve with its zeros written | `af9febac` V2#10 seam |
| Found by the run of record: `decks.home.capture-plain` red, "2 selection overlays at rest" | the integrator, for V1 and V4 | A probe named them: the two people band's `.ts-people-marks` layers, the staged presence marks 2.10 draws at rest. The driver leaves them out of the overlay count; the blue check still reads them | `36a2108f` V4#20 seam |
| Found by the chrome lint of `/home` (check step 18's audit, never reached by the chain): two owners on the rails at 390, the miniature's and the two people screens' 1 px sides | the integrator, for V2 and V4 | Their side rules leave under 720 px, as V1 did for the hero frame | `491bab1d` V2#11 seam, `5e08fe48` V4#20 seam |
| Found on the preview: `home.patterns.pair` presses Globex before the kits band's chunk has started | the integrator, for V4 | The press waits for the kits band's box to fill; passed on the preview at 01:46 | `b44a6d6f` V4#19 seam |
| Found by the chrome lint of `/home`: a junction at every hero step tab, `::before` and `::after` of `.ts-hero-step` on one seam | to V1 and Kevin | Not changed; section 8 |  |

### 2. The commits in push order (the ship order)

`07e2811b..b44a6d6f` on `landing/redesign`, by push, each push's commits in history order. "Ships at" is the push's last commit before the next push's first, the sha the guard deploys for that push (LANDING.md 6.6 item 4). The history is linear and nothing was rebased or amended.

| Push | Commits | Ships at |
| --- | --- | --- |
| the specification | `e3708837` V0, `dbe5405a` V0 fix | with V1#8 |
| `V1#8` | `172b3bda` V2's hunk, `bc3d1242` V2's hunk 2, `c0c5ddc0` V3's hunk, `54b07b88` V4's hunk, `1f406d25` V1, `a7672dca` README, `11df4c10` V2's hunk 3 | `11df4c10` |
| `V4#9` | `5ee64cf2` the CORS line, `8ec0ad23` V1's hunk, `c48f8198` V4, `79001704` README, `89e28076` fix | `89e28076` |
| `V2#10` | `a6042ce6` | `a6042ce6` |
| `V2#11` | `e05c78f4` V1's line, `1beea439` V2, `dce46267` README | `dce46267` |
| `V2#12` | `5d4293dc` V1's line, `fb712451` V2, `56acc6a2` README | `56acc6a2` |
| `V3#13` | `1804d0b8` V1's hunk, `02b67cb7` V3, `5ae47130` README | `5ae47130` |
| `V2#14` | `af334525` V2, `eea3c570` README, `6e6004f3` the V2#11 fix, `d154d8b8` V2 seam | `d154d8b8` |
| `V1#15` | `a8dfb2fc` V1, `47cc9e39` README | `47cc9e39` |
| `V3#16` | `56897de0` | `56897de0` |
| `V3#17` | `178ea588` V1's line, `3c431b3e` V3, `11e20a4d` README, `89f9e459` V3 seam | `89f9e459` |
| `V4#18` | `ac44ef60` V1's line, `35012ebe` V4, `70fe3545` README | `70fe3545` |
| `V4#19` | `d8662fca` V1's line, `64546416` V4, `133b81f6` README | not at `133b81f6` (below) |
| `V4#20` | `e33fa9cf` V1's line, `0fe63aa0` V1 seam, `7abbd47e` the V4#18 fix (drivers only), `69469bcf` V4, `8274881e` README, `c4dd5816` V4 seam | held until 2.10's six presence rows read green on production (6.8, question 13) |
| the integrator's seams, in history order | `47160fda` V4#19, `44858636` V4#20, `3b85fbc7` V3#16, `17da98d1` V3#13 (LANDING.md), `fdc961c8` V1#8, `8b631835` V3#17 (Prettier), `c699900b` V4#18, `af9febac` V2#10 (driver), `36a2108f` V4#20 (driver), `491bab1d` V2#11, `5e08fe48` V4#20, `b44a6d6f` V4#19 (driver), then this note's commit | below |

The ship order has one break, for the shipper to decide. V4#19 cannot ship at `133b81f6`: its shader chunk imports `@paper-design/shaders`, which `apps/studio` declares only from `47160fda`, so Vercel's `pnpm install --frozen-lockfile` and build fail there; and every seam above lands after V4#20's commits, which hold the people band (`e33fa9cf` mounts it). Two ways, neither taken here (the integrator does not switch or create branches):

1. Ship V1#8 to V4#18 at their shas, then hold V4#19 with V4#20 until the presence rows read green, and ship `b44a6d6f` (or this note's commit) as one push. The seams for V1#8 to V4#18 (`fdc961c8` the seam's CLS, `3b85fbc7`, `17da98d1`, `8b631835`, `c699900b` the live core's line, `af9febac`, `491bab1d`) then ship with it, so those pushes go live with the reds they fix.
2. A ship branch from `133b81f6` with the nine seams that do not need V4#20 cherry-picked in history order: `47160fda`, `3b85fbc7`, `17da98d1`, `fdc961c8`, `8b631835`, `c699900b`, `af9febac`, `491bab1d`, `b44a6d6f`. `git merge-tree --write-tree` applied all nine onto `133b81f6` with no conflict at 01:48 (tree `1e66172f`, unreferenced commit objects only; no ref moved). That tree was not built or driven; it is V4#19 as the guard would read it. V4#20 then ships from `landing/redesign` when its rows are green, carrying `44858636`, `36a2108f`, `5e08fe48`.

### 3. The chain

On the merged tree at `8b631835` (before the seams the run of record found), loads in brackets.

| Check | Reading |
| --- | --- |
| `node_modules/.bin/tsc -b` | exit 0 at 20:08 (44) in 40 s; again at 01:00 after the check chain's builds left the project references' outputs stale for `tsc -p` (17 s, exit 0); `tsc -p apps/studio --noEmit` clean after each seam |
| vitest, each changed package | `apps/studio` 107 files, 825 of 825; `packages/lint` 15 files, 111 of 111; `scripts/probes/core-matrix.test.mjs` 37 of 37 (20:12 to 20:13, 35 to 42); `src/components/home` 85 of 85 again after the formatting seam and after `c699900b`. Outside the home surface the second pass changes `decks.spec.ts`, `apps/studio/package.json` (Q13), `packages/chrome/package.json` (the first pass's export line) and `packages/lint/src/brand/config.ts` with its `css.test.ts` |
| `node scripts/build-home-assets.ts --check` | exit 0: 33 outputs match their sources, 10 slide instances, 2,356 B of inlined stills, 16 served files (20:14, again after the formatting seam) |
| The brand lint in enforce mode | `node packages/lint/src/brand/main.ts --enforce`: exit 1 on 22 findings in 17 files, none under `/home` and none in a file the branch changed since `2108dad4` (16 `gt-ui/cta-title-case`, 3 `css/mono-outside-code`, 2 `css/no-eyebrow`, 1 `gt-ui/no-smooth-scroll`): the tree's own. Check step 33 (report mode) ok |
| Prettier on every file of the build | the 352 files of `07e2811b..8b631835` that exist: 15 of V3's unformatted, formatted in `8b631835`, then clean; each later seam's files clean |
| `node scripts/check.mjs` | run whole in segments from 20:15 to 21:34 (`--from` the step after each red, since the chain stops at its first red; the tree put back after step 7); below |

| Step | Reading |
| --- | --- |
| 1 | ok in 10.9 s: the lockfile with Q13's line |
| 2 | ok |
| 3 | red, the tree's own: `pnpm generate:contracts` rewrites `packages/lint/fixtures/index.json` for `packages/lint/src/static/speed-marks.test.ts`, which the declutter round's B4b#6 seams (`5c1131b2`, `5ac00c5c`, before the branch's base) added without the index. The generated change was put back |
| 4 | ok (`tsc -b`) |
| 5 | red: 8 of 5,162 tests in 5 files, each the tree's own and each red in the first pass's run of this step: `import.test.ts` (Kevin's Prototemplate checkout holds 95 slides, the test wants 85), `brand.test.ts` "counts the check steps" (`facts.json` 32, the chain 33), `contracts.test.ts` (step 3's index), `brand-actions.test.ts` (3: the CLI's brand kit on a deck folder reads a footer record), `evidence-policy.test.mjs` (2: section 8, to Kevin) |
| 6 | ok (the client build, `check-client-bundle.mjs`, the source greps) |
| 7, 8 | 7 imported Kevin's Prototemplate deck into `decks/gt-brand` (95 slides; 27 tracked files changed, 18 new); 8 red on its 95. The tree was put back (`git checkout -- decks/gt-brand`, the 18 new files moved to the integrator's scratchpad) before step 9, so no later step read the import |
| 9 to 11 | ok |
| 12 | red, the tree's own: `compare-to-shoot` 144 of 170 pairs over budget against the 95 slide deck's shoot |
| 13 to 16 | ok |
| 17 | red, the tree's own: `viewer.spec.ts` 1 of 8 ("the grid mounts clones for the tiles near the viewport alone"), as in the first pass's run |
| 18 | red, the tree's own: the `/edit/gt-brand` audit's `editorMenu` state times out on a click, as in the first pass's run, so the chain never reaches `/home`. The integrator ran the `/home` and Not found audits on 4545 (section 5) |
| 19 | ok: `pnpm format:check` and `what-works.mjs --check` |
| 20 | red, the tree's own: the editor's parity audit, the same 80 failure lines as the first pass's run |
| 21 | red: 23 failed, 35 passed (15.3 min, 25 to 41), the editor's specs; the first pass read 24 and 34 with the same failures and one filmstrip test more |
| 22, 24 | ok; 23 and 25 skipped by the runner (no fonts venv, no Docker) |
| 26 | red: 13 failed, 46 passed, 2 skipped (17.3 min, 25 to 45): accounts (7), comments, dither, presence, security, share, versions-by-author. `home-page.spec.ts` 12 of 12 passed. No code those specs drive changed in the second pass |
| 27 | skipped (nothing on 4344) |
| 28 | ok |
| 29 | red at its first command, the tree's own: `build-brand --check` reads `facts.json` `checkSteps` 32 against 33. The rest of the step run alone: `build-home-assets --check` 33 outputs, `build-definitions --check` current, `check-record` 4 outputs match |
| 30 | ok in 34.0 s (40 of 40 Vercel output assertions); again on the seams' tree at 00:59, 57.2 s |
| 31 | red: `perf-budget` 107 of 148 at loads 39 to 45, so its times are not read: load. Every route's `js decoded` and `largest js` lines read the shared entry chunk (`index-*.js` 1,156 KB; LANDING.md 7 answer 7, Round 2's split); `/home`'s own lines: LCP 128 ms cold and 124 warm on `H1.ts-h1`, CLS 0, pictures 0 KB before ready and 57 KB after a full scroll. Its node-server build is the one the run of record served |
| 32 | stopped at its start at 21:34, when the load fell to 14, and replaced by the run of record on the node-server build (the same driver over every row, section 4), so two whole matrices did not run back to back; recorded as not run in the chain |
| 33 | ok (report mode) |

### 4. The run of record: the whole matrix on the local memory tier

`node scripts/probes/core-gate.mjs --base http://localhost:4555 --tier memory --lock <scratch> --parked docs/gslides-parity/focus/ship-4300058d.json --matrix docs/gslides-parity/landing/build/landing-v2-local-memory.json`, with `.turboslide/e2e.lock` held around it, against check step 31's node-server build of `8b631835` served on 4555 (`node apps/studio/.output/server/index.mjs` with the check runner's server environment: the memory tier, a tmp store, its own overlay and auth database, the build commit stamped). Started 21:34:56 at load 13.7, ended 00:57:23 at load 26.9 (12,147 s): the walk 21:35 to 22:48 (load 10 to 58), the specs 22:48 to 00:27 (load 8 to 37; the `home.*` rows ran from 00:15 to 00:27 at loads 7.5 to 15.9, so every time they judged was read), the cost probe to 00:57.

| Ledger | Rows | Passed | Failed | Not driven | Verdict |
| --- | ---: | ---: | ---: | ---: | --- |
| `landing-v2-local-memory.json` (the walk 711, the specs 432, the cost probe 13) | 1,156 | 970 | 91 | 95 (2 manual), 17 local rows not recorded (no identity database) | failed, retries 0 |

The 68 `home.*` and `decks.home.*` rows: 62 passed and 6 failed.

| Row | Reading in the run of record |
| --- | --- |
| `home.page.order`, `markup-final`, `bands-after-load` | passed: the order with the eleven interludes; without script the first screen differs in 404 of 1,296,000 pixels (0.031 percent) at 1440 and 404 of 329,160 (0.123) at 390, every reserved box the same size; 0 band requests before `load`, no unfilled box in view, CLS 0.000000 at 1440 and 390 |
| `home.hero.type`, `stage`, `lead.visit`, `numbers.row`, `features.table`, `a11y.skip-and-contrast` | passed (the h1 96.00 px, weight 500, -0.0420 em; the frame 644 by 408 and the terminal 364 by 408 at y 488; the visit sentences set 116, 51 and 48 ms before first paints of 136, 68 and 68 ms; 237 and 290 text elements, none under their line) |
| `home.hero.run` | passed: L-H ran 8 ms after it registered (line 500); cycles of 18,786, 18,789 and 18,781 ms against the caption's 19 s |
| `home.hero.select`, `canvas.gestures`, `canvas.log`, `objects.keyboard` | passed |
| `home.hero.edit` | failed on the build alone: the easing text `cubic-bezier(.65, 0, .35, 1)` against `cubic-bezier(0.65, 0, 0.35, 1)` (`af9febac`) |
| `home.menus.bar`, `rows` | passed (Insert > Text box 56 ms, Arrange > Rotate clockwise 74 ms at loads 10 to 11; line 300) |
| `home.tailor.apply`, `filmstrip`, `home.kits.restyle`, `color`, `home.versions.scrub`, `restore` | passed (Kestrel on every slide 41 ms at 10.4; line 500) |
| `home.agents.rest`, `chips`, `typed`, `transports`, `history`, `recorded` | passed (the four chips 3,268 to 4,080 ms from press to the flag leaving, line 5,000; the ring 370 to 692 ms, line 700; at loads 8.7 to 9.5) |
| `home.present.show`, `focus`, `print` | passed (Present to the stage 521 ms, Escape back 415 ms, at 9.1) |
| `home.export.seam`, `figure`, `loupe` | passed (the loupe 0 of 196 at two places in light, 0 and 1 of 196 in dark) |
| `home.motion.develop`, `pause`, `in-view`, `rest`, `reduced`, `hidden-tab`, `home.a11y.keyboard-walk` | passed (the develop 1,507, 1,501 ms; C1 2,400.6 ms, E1 1,103.5 ms; paused: 0 frame callbacks and 0 ms of task a second at the top, middle and bottom; 82 of 82 Tab stops; loads 8.3 to 9.6) |
| `home.interludes.glyphs`, `home.motion.loops`, `offscreen` | passed (eleven interludes; the hold 5,597 ms at 1440 and 5,608 at 390; fourteen loops registered; offscreen 0 frames, 0 timers, 0 ms of task; loads 7.5 to 12.1) |
| `home.patterns.pair` | passed (the shader chunk 7,283 B gzip) |
| `home.people.loop`, `type` | passed (a cycle 14,005 ms; the other screen 122 ms after the last key, line 200; at 8.4 to 8.6) |
| `home.budget.shared`, `lcp`, `frame`, `main-thread` | passed (LCP cold 108 ms and warm 64 at 1440 ×1 on `h1#ts-product-h1` at 15.3; the longest frame callback 0.4 ms at 1x and 1.7 ms at 4x; the boot script 954 B, 3 ms of script before LCP) |
| `home.budget.bytes-first` | failed on the document alone, to Kevin: 95,311 B decoded (line 80,000) and 18,505 B brotli; the route chunk 52,976 B decoded and 13,436 B brotli; the page CSS 14,918 B brotli; own bytes 46,859 B; 0 pictures before `load` |
| `home.budget.bytes-page` | failed on the script alone, to Kevin: the page's own script 335,377 B decoded (line 300,000) and 111,290 B gzip (line 90,000) after a full scroll; 6 pictures, 57,133 B; nothing requested twice |
| `home.budget.live-module` | failed: the core with its imports 61,111 B decoded and 21,639 B gzip (line 20,480); every band chunk under its lines (the largest, `menus`, 48,152 B and 15,870 B gzip) (`c699900b`) |
| `decks.home.new-presentation`, `your-presentations`, `seller-lead`, `copy-rules` (676 words, 12 headings), `product-pictures`, `links-and-card`, `layout-shift` (CLS 0.0000 everywhere), `grammar`, `copy`, `phone`, `pictures-three-widths` (13,053 px at 1440) | passed |
| `decks.home.capture-plain` | failed: "2 selection overlays at rest", the people band's presence marks (`36a2108f`) |
| `decks.home.load-budget` (measure) | failed on its pictures line, to Kevin: the lighthouse's still, 4,592 B in 1 request before the first scroll (line 0); first byte 7 ms, LCP 132 ms on the h1, ready 275 ms, 58,619 B of pictures after a full scroll |

The other 85 reds and 95 not driven rows are the editor's, outside every file the second pass changed (the walk's 45 failures in text, images, arrange, shapes, lines, versions, formatting, decks, inbox, slides, assist, brand, logos, shaders and help, its 48 not driven table rows; the specs' 40 more in assist, chrome, decks, export, images, logos, present, shaders, share, svg and sync, with the assist rows' fixture absent from a local server and the do tier's cost rows not driven on the memory tier). They are for the ship's guard to read on the preview of its commit.

### 5. The seams the run of record found, read after it

- **`home.budget.live-module`** (`c699900b`): the client build of check step 30 at 00:59 on the seam's tree, measured as the row measures (the chunk holding `ts-home-sel-layer` and its static imports, concatenated, gzip level 9; the same method gives the run of record's 61,111 B and 21,639 B on step 31's build of `8b631835`): the core 57,762 B decoded and 20,365 B gzip, 115 B under its line; `glyphs-*.js` 3,856 B and 1,714 B gzip. The core has almost no room left; V2's offer of 15:58 (the kit painter out of the core into the kits chunk through `registerPainter`) is the next way to make some.
- **`home.hero.edit`** (`af9febac`): passed on 4545 at 01:05 (load 43, with the row's own time bounds judged; the row reads no load; `af9febac`'s body says the bounds were not judged, which is wrong).
- **`decks.home.capture-plain`** (`36a2108f`): passed on 4545 at 01:10 (load 37 to 42).
- **The rail junctions at 390** (`491bab1d`, `5e08fe48`): the chrome lint of `/home` at 1440, 1280 and 390 in both appearances on 4545 at 01:14 reads one junction a width, the step tabs' (section 8), and no rail junction; `home.menus.bar`, `rows`, `home.page.markup-final` passed and `home.people.loop`, `type` passed their functional checks with their times not read: load 34 to 38; `decks.home.pictures-three-widths`, `layout-shift`, `grammar` and `phone` passed (01:15 to 01:19). The Not found page's audit: 0 findings.
- **The interludes from their chunk** (`c699900b`) on 4545 at 01:02 to 01:08 (load 37 to 50): `home.page.order`, `bands-after-load`, `home.motion.reduced`, `hidden-tab` passed; `home.motion.develop`, `pause`, `rest`, `home.interludes.glyphs`, `home.motion.loops`, `offscreen` passed their functional checks with their times not read: load.
- **Every home row again, on a build of the seams** (ledger `landing-v2-local-memory-home.json`): once another worktree's dev server had left 4321, check step 31 rebuilt the node-server output from `b44a6d6f` (02:18 to 02:22, load 9 to 15: `perf-budget` 108 of 148, `/home` LCP 88 ms cold and 84 ms warm on the h1, CLS 0, every route's shared entry lines red as before). Served on 4555, `core-gate.mjs --only specs --rows` over the 68 `home.*` and `decks.home.*` rows ran from 02:22:11 to 02:36:57 at loads 6 to 18, a narrowed rerun after the code changes named above: 65 passed and 3 failed, the three of section 8 for Kevin (`home.budget.bytes-first`, the document 95,311 B decoded; `home.budget.bytes-page`, the own script 335,884 B decoded and 111,687 B gzip; `decks.home.load-budget`, the lighthouse's still of 4,592 B before the first scroll). `home.budget.live-module` passed (the core 57,762 B decoded and 20,363 B gzip; `glyphs-*.js` 3,856 B and 1,704 B gzip), and so did `home.hero.edit` and `decks.home.capture-plain` (0 overlays). Times read: `home.budget.lcp` 88, 80 and 96 ms cold and 44, 44 and 40 ms warm at load 5.6; `home.hero.run` cycles of 18,791, 18,793 and 18,790 ms; `home.interludes.glyphs`, the glyphs now from their chunk, holds of 5,622 and 5,603 ms; `home.people.loop` a cycle of 14,006 ms; `home.budget.frame` 0.7 ms at 1x and 2.1 ms at 4x.

### 6. The narrowed preview

**https://turboslide-rmh40rynx-kl01s-projects.vercel.app**, deployed from `8b631835` (the merged tree before the seams the run of record found) with `vercel deploy --yes --archive=tgz` from the worktree's root to `kl01s-projects/turboslide`, Kevin's personal project, as a preview (never `--prod`), 21:35:06 to 21:37:03 PDT, with `TURBOSLIDE_AUTHORIZE=enforce`, `TURBOSLIDE_ASSIST=fixture`, `TURBOSLIDE_LOGO_UPSTREAM=fixture`, `TURBOSLIDE_MAIL=off`, `TURBOSLIDE_REALTIME=blob`, `TURBOSLIDE_PUBLIC_STORE_HOST=ggmycvj7j6224ay5.public.blob.vercel-storage.com` and two per deployment secrets minted inside the command with `openssl rand -hex 32` and never printed. Its build ran `pnpm install --frozen-lockfile` on Q13's lockfile and completed. It is protected: `/home` answers 302 to the login without the header and 200 with `VERCEL_OIDC_TOKEN` (from `vercel env pull .turboslide/vercel-dev.env --environment development --yes`, read through a wrapper, never printed) as `x-vercel-trusted-oidc-idp-token`. Each ledger's `commit` field names the checkout's head when the run started (the drivers' tree), not the deployment's.

| Reading (LANDING.md 6.6 item 3) | When, load | Result |
| --- | --- | --- |
| `home.budget.*`, `home.page.bands-after-load`, `home.patterns.pair`, `decks.home.load-budget`, `decks.home.links-and-card`: `core-gate.mjs --only specs --rows ...`, ledger `landing-v2-preview-narrowed.json` | 01:25:40 to 01:28:58, 15 to 20 | 11 rows, 6 passed, 5 failed. Passed: `decks.home.links-and-card` (10 links, `og:url` www.turboslide.com/home), `home.page.bands-after-load` (0 band requests before `load`, CLS 0.000000 at 1440 and 390), `home.budget.shared` (entry 1,183,913 B decoded, one font of 352,240 B), `home.budget.lcp` (cold 272, 288 and 264 ms and warm 108, 112 and 84 ms on `h1#ts-product-h1` at 1440 ×1, ×2 and 390, at 12 to 12.8; lines 400 and 200), `home.budget.frame` (the longest frame callback 0.4 ms at 1x and 1.9 at 4x, a band entering 0.9 and 3.2 ms, at 15.4 to 15.9), `home.budget.main-thread` (954 B, 4 ms of script before LCP, the longest task 10.4 ms, at 15.4 to 16.9). Failed: `home.budget.bytes-first` (the document 95,311 B decoded, 18,535 B brotli; to Kevin), `home.budget.bytes-page` (the own script 335,377 B decoded and 111,290 B gzip; to Kevin), `home.budget.live-module` (61,111 B and 21,713 B gzip: the deployment predates `c699900b`), `decks.home.load-budget` (measure: first byte 154 ms over its 150 line; LCP 320 ms, ready 461 ms, 0 pictures before the first scroll, 58,619 B after a full scroll, one long animation frame over 100 ms, JavaScript 1,378,179 B decoded reported), `home.patterns.pair` (Globex pressed before the kits band's chunk had started) |
| `home.patterns.pair` again after `b44a6d6f` (the driver; the deployment unchanged), ledger `landing-v2-preview-patterns-rerun.json` | 01:46:00 to 01:46:28, 33 to 38 | passed |
| The `immutable` header on the new `/home/**` files | 21:38 | the 16 files of `assets.json` (the lighthouse's still and tone map, the pattern's two still frames, the two browser rasters, the Perfect and Editable text parts, the two PDFs) answer 200 with `public, max-age=31536000, immutable`, each the bytes `assets.json` records; every `/assets/*` chunk the document names the same; the document `public, max-age=0, must-revalidate`, brotli |
| The speculation rules | 21:38 | `{"prerender":[{"source":"list","urls":["/new"],"eagerness":"moderate"}],"prefetch":[{"source":"list","urls":["/decks","/deck/gt-brand"]}]}` in the document, read by fetch: `home-page.spec.ts`'s test of it sends no OIDC header, so it cannot read a protected preview |
| The hosted smoke (`scripts/hosted-smoke.mjs --base`) | 22:48 to 22:49, 13 to 20 | 38 of 39: `/decks` red ("expected a 200 list naming the deck; 0 card(s)"), the anonymous fetch under `TURBOSLIDE_AUTHORIZE=enforce` lists no deck (`accounts.decks-list-scoped`); `/home` passed (3 of 3 marks), every header, CDN and enforce row passed; the bearer rows skipped (no token on the preview) |
| The guard's seller path: `gt-follow.sh`'s `SPEC_ROWS` and `WALK_AREAS` (decks, text, fonts, versions), run from this worktree with `core-gate.mjs` (the guard's script checks out a worktree of its own) | specs 01:28:58 to 01:33:54; walk 01:33:54 to 01:45:38, 13 to 28 | specs (`landing-v2-preview-seller-specs.json`): 9 rows, 8 passed, `decks.list.open-title` failed (a card's title hidden on `/decks`, red in the run of record too). Walk (`landing-v2-preview-seller-walk.json`): 130 rows, 124 passed, 3 failed (`decks.file.import-slides-deck`, red in the run of record; `versions.show-changes-marks`, a parked row of `ship-4300058d.json`; `fonts.agent.font-list`, whose HTTP half needs a bearer the preview does not hold), 3 not driven (`text.clipboard.paste-without-formatting` manual, `fonts.table.takes-family` a standing row of the guard, `fonts.field.own-face`) |

The hand walk on the seller path (6.6 item 4) is the ship's and was not done here.

### 7. Pictures

`build/integrator/v2-*.jpg`, 32 JPEGs, each under 195,000 B, shot on the preview (`8b631835`) from 01:46 to 02:16 with `.turboslide/integ2-specs/shoot2.mjs` and composed by the integrator's scratch composer, each under its reference picture. The first pass's integrator pictures in the same folder (36 files without the prefix, untracked since 2026-10-03 09:48) are left as they are.

- `v2-page-{light,dark}-{1440,390}.jpg`: the whole page stitched from viewport shots after a full native scroll (13,053 px at 1440, 13,331 at 390), beside prototype B's `b-{1440,390}-{light,dark}-full.jpg`. Every band in section 2's order with its interlude, the instruments filled.
- `v2-strip-hero-*`: L-H at a tenth of speed, a frame every 2 s of loop time beside B's `b-strip-hero-agent.png`: H5 developing at 0.1 s, the rest on slide 1, Restore clearing the terminal at 6 s, slide 5 gone from the filmstrip at "1 / 8", New Slide, Set the Title and Set the Rows on slide 5 with the ink ring and the "Agent" flag, the step tab's countdown filling.
- `v2-strip-field-*`: I1 on the interlude before the canvas band at a tenth of speed beside B's `b-strip-field-gather.png`: the sparse field, the gather into the selection frame's glyph by 1.6 s, the hold, the thinning at 7.5 to 8 s, the field again at 10 s. Where B holds its glyph inside the field, the page's gathered still is the glyph alone (2.4: "the gathered still equals its glyph's cells").
- `v2-strip-agents-*`: Turn the Title at a tenth of speed beside C's `strip-agents.jpg`: the command typed in the console, the answer, the ink ring on slide 5, the title turned under the flag, the Version history row.
- `v2-strip-tailor-*`: Tailor for Globex at a tenth of speed beside A's `tailor-apply.png`: each name lit in reading order and the snackbar.
- `v2-strip-drag-*`: the lighthouse's heading at full speed beside A's `canvas-edit.png`: selected, dragged off the plate with its paper ground, released, Undo's return at 33, 252, 453 and 752 ms.
- `v2-strip-show-*`, `v2-strip-exit-*`: Present at a tenth of speed beside A's `present-show.png`, then Escape back to the band.

### 8. Findings by owner

**To Kevin.**

1. `home.budget.bytes-first` (gate) is red: the document is 95,311 B decoded against the 80,000 line (18,505 to 18,535 B brotli, under its 20,000) on the build and on the preview. It was 85,908 B at V1#8 and 92,173 B at V1#15; the two people and patterns bands' words, boxes and interludes added the rest. The renderer's CSS is 29,283 B of it (audit item 13, question 10: 52 KB once that CSS is a file). 4.1's line was not moved.
2. `home.budget.bytes-page` (gate) is red: the page's own script after a full scroll is 335,377 B decoded (line 300,000) and 111,290 B gzip (line 90,000) on the build and the preview, from V1's 273,460 B and 91,855 B at V1#15. The interludes, the people band (`people-*.js`) and the shader chunk (7,283 B gzip) came after. The largest part is the menus chunk, 48,152 B decoded and 15,870 B gzip, most of it the rows' `doc` sentences that 2.5 requires (V2's proposal: load them on a row's first press). Either 4.1's line moves or the chunks shrink.
3. 4.1 and 4.2 disagree on pictures before the first scroll: in the run of record `decks.home.load-budget` read the lighthouse's still (4,592 B, one request) before the first scroll, as 4.2's one viewport rule requests it with the canvas band fourth in the page; on the preview it read 0 (the request fell after the row's window). Either 4.1 says "0 before `load`" (`home.budget.bytes-first` reads that and passes) or the canvas band's margin is made smaller than one viewport (V4's `field.ts`).
4. The evidence policy (check step 5, `docs/readme/evidence-policy.test.mjs`; NEXT.md 5.3: each tracked picture under 200,000 B, a round folder under 25 MB): `docs/gslides-parity/landing` tracks 477 pictures, 75.3 MB, 158 of them over 200,000 B (the first pass's tree: 281, 40.3 MB, 81 over; the research and direction pictures, then `l2` to `l4`, `v2` to `v4` under the orchestrator's 400 KB rule). This note adds 32 pictures, each under 195,000 B. The policy's way is Round 1's B6a: after the ship, prune the folder's pictures to the ones the notes name and keep the rest in the history.
5. The ship order (section 2): V4#19 cannot ship at `133b81f6` without `47160fda`; choose one of the two ways there.
6. V4#20 stays held until the six presence rows of 2.10 read green on production (6.8, question 13). This merge read none of them on production.
7. The live core is 117 B under its 20 KB gzip line after `c699900b` (20,363 B on the node-server build of `b44a6d6f`); the next feature in the core pushes it over.

**To V1.**

1. The chrome lint of `/home` (check step 18's audit) reads one junction at every width in both appearances: `::before` and `::after` of `.ts-hero-step` draw one seam (the hair track and the ink countdown of 2.2's step tabs). The lint reads them as two owners of one line; its allow list (`CHROME_ALLOW`, pinned by `packages/lint/src/chrome.test.ts`) has no entry for a track with its fill, and drawing the countdown alone (no track) changes 2.2's look. Not changed; a decision for V1 with Kevin. Step 18 never reaches `/home` while its `/edit/gt-brand` audit is red.
2. Your files the integrator changed: `home.css` (`fdc961c8`, the export seam's handle), `copy.ts` (`3b85fbc7`, two keys), `HomePeople.tsx` (`44858636`, the timing import) and `decks.spec.ts` (`36a2108f`, the people marks out of capture-plain's overlay count).

**To V2.** `af9febac` (`home.hero.edit`'s curve text), `491bab1d` (the miniature's side rules under 720 px) and `3b85fbc7` (`versions.ts` reads `HISTORY.restoredVersion`) changed your files. The live core has 117 B of room: your offer of 15:58 (the kit painter into the kits chunk) is the next way to make room. The menus chunk is 15,870 B gzip, 514 B under its 16 KB band line.

**To V3.** Every request to V3 is answered (`fdc961c8` the seam's handle, `3b85fbc7` the copy keys, `17da98d1` R12 and R13, `8b631835` the formatting of fifteen files). Read `fdc961c8`: the handle now spans the slide with `pointer-events: none` and only the knob takes the pointer.

**To V4.** `c699900b` moved the glyphs out of the core (`field.ts` imports `./glyphs` when the core starts); `5e08fe48` (the people screens' side rules under 720 px), `36a2108f` and `b44a6d6f` (`patterns.ts` waits for the kits band) changed your areas. At hold the gathered interlude is the glyph alone, where B's keeps its field (2.4 reads as built).

**To the ship.** Read on the preview of the ship's commit: the editor's reds outside the landing (85 in the run of record, section 4), `decks.list.open-title` (red locally and on this preview), the hosted smoke's `/decks` row under enforce, and the hand walk on the seller path.

**Standing outside the landing.** Check steps 3, 5, 8, 12, 17, 18, 20, 21, 26, 29 and 31's shared entry (section 3); the brand lint's 22 findings; the first pass's untracked `build/integrator/*` pictures and `build/landing-preview-narrowed.json`, which LANDING.md 8 and its sources cite, left untracked.

### 9. At the close

- The integrator's servers on 4545 and 4555 are stopped; the check runner stopped its own on 4321. No `.turboslide/git.lock` or `.turboslide/e2e.lock` is left.
- Scratch decks the chain's runs left under `decks/` (`e2e-comments-musmrsai` from before this merge, `untitled-20261004-3veb`, `-hsb2`, `-0zyz`) and the 18 new files of step 7's import were moved to the integrator's scratchpad, not deleted, so the gate's scratch check passes; `decks/` holds `fixture`, `gt-brand` and `templates`.
- Left untracked as found: `docs/gslides-parity/landing/.overlay-current/`, the first pass's integrator pictures and `build/landing-preview-narrowed.json`.
- The preview deployment stays on Kevin's personal project, behind Vercel Authentication. Nothing was pushed.

## Landing second pass, fix round

Written by the integrator's fixer from 05:04 PDT on 2026-10-04 in `/Users/kevinliu/repos/Turboslide-landing` on `landing/redesign` at `d6f02a18`, for the three findings the orchestrator gave it from `build/verification.md` pass 1: F2 (`home.budget.bytes-first`), F3 (`home.budget.bytes-page`) and F13 (`decks.home.load-budget`), each marked "Kevin decides" by the merge (section 8 above, items 1 to 3) and by the verifier. Read first: `docs/LANDING.md` (every section), this file's merge note, `build/verification.md`, `v1.md`'s readings of the document and the pictures (13:15 on 2026-10-03), the drivers of the three rows (`e2e/core/home/page.ts` 1379 to 1595, `e2e/core/decks.spec.ts` 1911 to 2010 and the load row), `live/field.ts` and `live/index.ts`'s band loader. Port 4555 only: the node-server output check step 31 built from `d6f02a18` at 02:43 (no product file changed since `b44a6d6f`), served with a server environment of its own (the memory tier, a tmp store, `.turboslide/intfix-overlay`, `.turboslide/intfix-auth.sqlite`). Every Playwright run held `.turboslide/e2e.lock`; `core-gate.mjs` took a scratch `--lock`. Nothing was pushed or deployed; the integrator's preview (`8b631835`) was read with the OIDC header from `.turboslide/vercel-dev.env` (never printed), and production's current `/home` was read without one. Probe scripts are under `.turboslide/intfix/` (ignored), their output in the session scratchpad. Times are PDT; loads are one minute load averages (13 to 17 for every timing below, 9 on the preview's row; the machine read 96 at 05:30 from other checkouts' jobs, and nothing was read then).

### 1. What was done

| Finding | Answer | Commit |
| --- | --- | --- |
| F13 (`decks.home.load-budget`), the pictures line: the lighthouse's still before the first scroll | A driver artifact, not the page. The runner's trace (`trace: 'retain-on-failure'`, `playwright.config.ts`, kept by `decks.spec.ts`) takes DOM snapshots, which read every element's computed style, which resolves the canvas band's CSS mask under `content-visibility: auto` and requests its still. `page.ts`'s bytes-first already reads its pictures cold and `home.spec.ts` runs with snapshots off for the same reason; the trace option is worker scoped, so one test cannot turn it off. The row now reads the pictures and the long frames before the first scroll in a node process of its own (`coldHome`), and keeps the runner's own readings as a note line | `32520fc3` V1#8 fix |
| F13, "4.1 and 4.2 disagree" | They do not on the page as built: with the menus band (V2#11) between the hero and the canvas band, the canvas band's box lies past one viewport height at 1440, 1280 and 390, so 4.2's rule requests nothing before the first scroll. `v1.md`'s reading of 13:15 (the print at y 1,749) predates the menus band. LANDING.md 4.2 says so | `191476a6` V1#8 fix |
| F13, the long animation frame on the preview | Read and attributed, not changed: section 2. To Kevin as LANDING.md 7 question 23 | `191476a6` |
| F2 (`home.budget.bytes-first`, the document 95,311 B decoded) | Not changed; no cut within the landing meets 80,000 B without changing the first screen or every route's head (section 3). To Kevin as question 21, with the parts and what each way leaves. 4.1's line does not move | `191476a6` |
| F3 (`home.budget.bytes-page`, the own script 335,884 B decoded and 111,687 B gzip) | Not changed; no chunking meets the gzip line and V2's proposal is about a tenth of the overage (section 3). To Kevin as question 22. 4.1's lines do not move | `191476a6` |

### 2. Readings

- **Pictures before the first scroll, probes** (`.turboslide/intfix/cold.mjs`, `cold-untraced-trace.mjs`; 1440 by 900 dark unless named; `homeOpen`'s steps then 1,500 ms) on 4555 at 05:11 to 05:13, load 13 to 16: traced with snapshots and screenshots, `lighthouse-still-wide-79b80783b6.webp` (4,592 B) from the CSS at 201 to 209 ms in 3 of 3 loads; untraced, 0 pictures in 3 of 3; traced without DOM snapshots or screenshots (`home.spec.ts`'s setting), 0 in 3 of 3; untraced at 390 by 844 (light) and 1280 by 800, 0 in 2 of 2 each; traced at 390 by 844, `lighthouse-still-narrow-c714ece9a4.webp` (972 B) in 2 of 2. On the preview at 05:14 (load 15.7): 0 pictures traced or untraced in 4 of 4 each, as the merge's and the verifier's preview readings found. The canvas band's section begins at y 2,623 at 1440 by 900, 2,587 at 1280 by 800 and 2,871 at 390 by 844 (its reserved box at 2,886, 2,846 and 3,097), past the 1,800, 1,600 and 1,688 px that one viewport height below the view reaches (`.turboslide/intfix/canvas-top.mjs`, 05:46).
- **`decks.home.load-budget` through `core-gate.mjs --only specs --rows decks.home.load-budget`** after `32520fc3`:
  - 4555, 05:33 at load 17.2 to 14.4: passed. First byte 3 ms, LCP 92 ms on `h1#ts-product-h1`, ready 193 ms, 0 pictures before the first scroll read cold (4,592 B in 1 request under the runner's trace in the same run), 58,619 B after a full scroll, 0 long frames over 100 ms read cold, the document 95,311 B, JavaScript 1,390,292 B decoded. Ledger in the scratchpad (`load-budget-1.json`).
  - The preview (`8b631835`, the OIDC header), 05:36 at load 9.1 to 8.9: failed on its long frame line alone, 1 frame of 122 ms read cold; first byte 63 ms, LCP 236 ms on the h1, ready 357 ms, 0 pictures before the first scroll, 58,619 B after a full scroll.
- **The long frame** (`.turboslide/intfix/loaf.mjs`, the frame's `renderStart`, `styleAndLayoutStart`, `blockingDuration` and script entries): on the preview at 05:14 to 05:15 (load 14 to 16), the first frame of every load (11 loads, traced or not) is 107 to 146 ms long, with no script entry and 0 ms of blocking time; in the three loads split by phase, 93 to 106 ms of it come before its render starts and 3 to 33 ms are style and layout. It starts at 72 to 127 ms, as the document arrives, and ends before the LCP (204 to 264 ms). The next frame is the shared entry chunk's module script (`index-*.js`, 50 to 60 ms). On 4555 the same first frame is 60 to 62 ms. Production's current `/home` (the page before the landing, 234 elements) at 05:15: the same first frame at 125, 95 and 214 ms, with no script and 0 ms of blocking time. So the frame belongs to the shared shell's first paint on a deployment (the document and the seven stylesheets it links), not to page code; POLISH.md 3.7's line reads it red on production today.

### 3. The numbers for Kevin (questions 21 and 22)

- **The document** (`/home` from 4555, 95,311 B decoded, 18,550 B brotli at quality 11): the head 35,121 B, of it the renderer's inline CSS 29,283 B (`BLOCK_CSS`, 29,235 B, of which 10,580 B are the source's comments); the hero 23,061 B (the nine filmstrip thumbnails 1,122 to 1,728 B each, 14,270 B together; slide 1; the stills style 2,959 B; the terminal; the step tabs); the numbers row, the eleven interludes and the eleven bands' words and reserved boxes 29,159 B (Tailor 4,367, agents 3,991, kits 3,692, features 3,198, present 2,658, export 2,433, menus 1,918, people 1,543, canvas 1,007, numbers 928, patterns 876, close 765, the interludes about 162 each); the footer, the print hook and the closing scripts 3,919 B. The thumbnails draw their frames, wordmarks and counters at 56 px (nothing hides them), so their markup cannot be thinned without changing the first screen.
  - The renderer's CSS as a file (audit item 13, every route): about 66,150 B, against the 52 KB line answer 10 sets for that case.
  - The inline CSS minified on every route: 16,174 B by lightningcss 1.33 (no warnings), 17,256 B by a comment and whitespace strip, so the document 82,250 to 83,332 B. That saves 12 to 13 KB on every route's document and is worth doing whatever the answer, but it is a change to `__root.tsx` for every route and does not meet 80,000 alone.
- **The page's own script** (4555, 1440 by 900 light after a full wheel scroll, `.turboslide/intfix/scripts.mjs`): 36 files, 335,884 B decoded and 111,687 B gzip (each file gzipped alone at level 9, as the row does). The largest: the menus chunk 48,152 B (15,870 B gzip), the route chunk 52,976 B (15,576), the live core 34,792 B (13,063) with `paint` 16,634 (5,862) and `motion` 6,336 (2,737), the shader's `dithering` 24,500 (7,272), `agents` 17,903 (5,727), `deck.generated` 14,413 (2,153), `show` 13,631 (4,888). The same 36 files concatenated gzip to 97,172 B, so no chunking meets 90,000. The menus rows' `doc` sentences are 84 strings, about 5,300 B of the menus chunk and 1,950 B of its gzip (taken out of the built chunk and measured), not most of it as the merge note read; loading them on first press saves that. Meeting both lines takes about 36 KB of decoded code out of the bands.
- **Read again after this fix round merges.** The other lanes' fixes add code (about 1,000 changed lines in `hero-stage.ts`, `versions.ts`, `pattern.ts`, `show.ts`, `objects.ts`, `menus.ts` and others), so the own script grows, and the live core had 117 B of gzip room under `home.budget.live-module`'s 20,480 B (merge note 8 item 7). On check step 6's client build of `a6eccdac` (06:52, load 8, every lane's fixes committed), the same chunks read about 344,500 B decoded and 115,200 B gzip (each file gzipped alone, read from the build's files rather than a browser scroll), and the live core as `home.budget.live-module` measures it (`live`, `paint`, `motion`) 57,899 B decoded and 20,432 B gzip, 48 B under its line. LANDING.md 7 question 22 carries the new figures. The next merge reads `home.budget.live-module`, `bytes-first` and `bytes-page` on a node-server build of the fixed tree.

### 4. The other fixers' requests, read late in the run

Read at 06:20 to 06:23 PDT, when V1, V2 and V3 had committed their notes and V4 was closing (`793c0bd8`). The requests addressed to the integrator, or to a lane that closed without them:

| Request | From, to | Answer | Commit |
| --- | --- | --- | --- |
| v1.md (05:15): F5's people half, a touch scroll on a people screen stopped P-L | V1, to V4 or the integrator | Done by V4 (`d97fdc70`, `793c0bd8`); nothing here | none |
| R27: a restore of version 2 or 3 keeps slide 5's place, so L-H went on typing over a slide 5 that showed placeholders | V2, to V1 (V1 closed at `b7e74736` without it) | `hero-stage.ts`'s stop signature holds `agentStep` | `ea57d690` V1#15 fix |
| R26: at `agentStep` 1 or 2 `paintNextSteps` wrote the recorded row over the placeholder, and the show's second call drew it there; the Present list named slide 5 at version 2 | V2, to V3 (V3 closed at `6e345953` without it) | `paintNextSteps` leaves the row at step 1 or 2 unless a chip rewrote it; `factsOf` gives slide 5 no title at step 1. The show's second call stays (it now writes what the painters wrote) | `f00fe0d6` V3#16 fix |
| R28: `INNER_HTML_ALLOW`'s comment for `versions.ts` | V2, to V1 | The comment names the runs the file now writes; the list is unchanged (check step 6 ok at 06:52, 49 call sites in the allowlist) | `a6eccdac` V2#14 fix |

Readings, on 4545 (a dev server on `vite.no-watch.config.ts`, the memory tier, a tmp store, `.turboslide/intfix-dev-overlay`; the tree at `793c0bd8` with these changes), probe `.turboslide/intfix/r26.mjs`: at load L-H runs; after Restore This Version on version 2 in the agents band, L-H is in `tsHomeMotion.stopped()` and none runs, also at the top of the page 3 s later; the show's slide 5 reads "Click to add title" over three rows of "Click to add text", as the agents band's and the hero frame's copies do; the Present list's row 5 reads "5" alone, as a new slide's row does. The same in light and dark at 1440 by 900 and 390 by 844. Pictures (`build/integrator/fix1/r26-*.jpg`, each looked at): the show's slide 5 and the Present band in both appearances at both widths. The surface matches the show and list as V3's fix round left them (`build/v3/fix1/`), with slide 5 drawn at the restored version.

Rows through `core-gate.mjs --only specs` on 4545, 06:47 to 06:50 (load 19.6 to 14.6): `home.hero.run`, `home.agents.rest`, `home.agents.chips`, `home.present.focus`, `home.present.print`, `home.versions.scrub` and `home.versions.restore` passed; `home.present.show` failed on its Escape bound alone (421.6 ms against 417), passed at 06:51 (load 13.5) and failed by 0.9 ms at 06:51 (417.9, load 11.9). v3.md's fix round read the same bound at 411 to 422 ms on its fix and 413 to 424 ms on `HEAD` on a dev server, and the verifier passed it on the node-server build; R26 changes no motion. The home vitest files 13 of 13 (87 tests); `tsc -p apps/studio --noEmit` clean; Prettier clean on the changed files.

### 5. Deviations

- F2 and F3 are not fixed: both need Kevin's answer (LANDING.md 7 questions 21 and 22), and 4.1 says the line does not move. F13 is fixed for its pictures line; its long frame line reads red on deployments until Kevin answers question 23.
- The R26 Present list row for an untitled slide 5 shows its number alone, as a new slide's row does; a word for an untitled slide would be new page copy (V1's `copy.ts`), not taken.
- The pictures for F13 are none: the driver and LANDING.md change no surface. The R26 pictures are the show and the Present band after a restore, not a reference match of LANDING.md 8 (no band's look changed).

### 6. At the close

- The servers on 4545 (dev) and 4555 (the node-server output) are stopped. No `.turboslide/git.lock` or `.turboslide/e2e.lock` of this fixer is left.
- Commits: `32520fc3`, `191476a6` (V1#8 fix), `ea57d690` (V1#15 fix), `f00fe0d6` (V3#16 fix), `a6eccdac` (V2#14 fix), then this note with question 22's new figures. Nothing pushed; nothing deployed.
- Left untracked: `.turboslide/intfix/` (the probes, ignored), `.turboslide/intfix-overlay/`, `.turboslide/intfix-dev-overlay/` and `.turboslide/intfix-auth.sqlite` (ignored); the ledgers and logs of this round's runs are in the session scratchpad. The untracked files found at the start are left as found.

## Landing, ship order

Written by the fixer of the landing's last fixes from 08:49 to 10:56 PDT on 2026-10-04 in `/Users/kevinliu/repos/Turboslide-landing` on `landing/redesign`, which stood at `d2a74cd2` (the integrator's fix round note) when it began. Read first: `build/verification.md` "Landing, pass 2" (findings N1 to N8), this file's "Landing second pass, merge" (sections 2 and 8) and "fix round", `docs/LANDING.md` 2.2, 2.8, 2.11, 2.13, 4, 6.6, 6.8 and 7. The orchestrator's steps: N1, N2 and N3, each with its row and pictures; V4#19's dependency moved into V4#19's group so every push builds on its own, and this ship order; the budgets, its decision on LANDING.md 7 questions 21 to 23 for Kevin's picks. Ports: 4547 (a dev server from `apps/studio` until 09:46, then a copy of V4#19's node-server output) and 4557 (the node-server output of check step 31's build command, `NITRO_PRESET=node-server pnpm --filter @turboslide/studio build:deploy`, served with the runner's server environment: the memory tier, a tmp store, `.turboslide/fix3-overlay`, `.turboslide/fix3-auth.sqlite`, `TURBOSLIDE_LOCAL_OPEN=1`, the build commit stamped). Every Playwright run held `.turboslide/e2e.lock` (the gate a scratch `--lock`), every commit and ref change `.turboslide/git.lock`. Nothing was pushed or deployed and no other worktree was touched. Times are PDT; loads are one minute load averages. Other checkouts' jobs held the machine at loads of 26 to 101 from 09:38 to 10:16, so the rows were read again once it fell under 17. The probes are in `.turboslide/fix3/` (ignored); their output, the ledgers and the raw pictures are in the session scratchpad.

### 1. What was done

The commits are named by their hashes on the branch after the rewrite (section 3); "was" is the hash before it.

| Item | Answer | Commit |
| --- | --- | --- |
| N1 (V4): `home.budget.bytes-page` read "requested twice: /home/pattern-still-light-7a43233af0.webp" | `frameOf` made its `new Image()` before the still layer's CSS background had requested the file (the layer sits in the print box under `content-visibility: auto`, so it resolves later), and the layer then requested it again from the HTTP cache. `frameOf` now waits for the layer's own request (`fetched`, the file's resource timing entry read through a `PerformanceObserver`) and decodes the file from the memory cache the layer's style holds. Read on the build at 09:21 (load 10 to 13): 12 loads (light and dark, ×1 and ×2) each read one request, initiator `css`, and both boxes printed | `25e74f62` V4#19 fix (was `4964bf2e`) |
| N3, the patterns band's half | `printStill` prints the frame's cells in the slide's `--ink` on its `--paper` (under GT those are the frame's own `#070707` on `#ffffff` and `#f2f2f0` on `#070707`, read equal), and prints again when a kit or a typed background changes them, so the right side follows a kit as the left side's shader does; `home.patterns.pair` reads the print's two colours under GT and after Globex | `25e74f62` |
| N3 (V3 with V4): under a kit, slide 8 printed in the GT colours | A served file of the role `pattern-mask` (`scripts/home/pattern.ts`): the still frame's dots as one alpha mask for both appearances, refused unless the light and dark twins hold the same dots (481,392 of 5,760,000 pixels) and unless it decodes to them; 1,788 B. The show, the Present display, the print (`show.ts`) and the miniature and the scrubber's view (`paint.ts` `drawStills`) draw slide 8's still through it as every other still is drawn, in the slide's ink over its paper. A browser's print draws no luminance mask and no mask composite (Chromium's PDF of a test page at 09:12 printed both as a whole box of ink, while an alpha mask printed as on the screen), so the exporter's file under a luminance mask was not an answer. `home.present.print` presses Globex first and reads slide 8's printed layer: the mask, `rgb(244, 241, 234)` on `#0a1b38`, loaded before the print | `52500369` V3#16 fix (was `db3aa8f8`), `44e735e5` V3#16 fix (comments) |
| Found while fixing N3: the miniature's slide 8 | `drawStills` gave a large slide 8 the exporter's picture as an alpha mask, so wherever the miniature (or the scrubber's view) showed slide 8 it drew a whole box of ink (`fix3/n3-mini8-before-light-1440.jpg`, reproduced at 09:28 by putting the old still back on the box); it now draws the mask | `52500369` |
| N2 (V1): a stop during the staged Restore left the frame mixed | `paintOrder` writes every root's counter in the filmstrip and the stage by the frame's order, staged or not, and `show` repaints the order for slide 1 as for any slide, so every stop (`toRest`) lands the deck's order with "1 / 9" on the title row and on slide 1's own counter. The cycle's cut back had the same fault on every cycle (slide 1's own counter read "1 / 8" until the next Restore; read at 09:01 on `d2a74cd2`). A loop step whose modules were still loading at a stop no longer starts over the rest state. `home.hero.run` records the shown slide's own counter and gains the stop in the staged Restore by a mouse press (1440 light), a key (1440 dark) and a tap (390 by 844 with touch) | `93c44574` V1#15 fix (was `37b8ef37`) |
| Questions 21 to 23, the budgets | The document's line to 100,000 B decoded; the page's own script's to 360,000 B decoded and 120,000 B gzip; the first lines (80,000; 300,000 and 90,000) kept in LANDING.md as Round 2's goals after its entry chunk split and Inter subset; `decks.home.load-budget` stays a measure row. `page.ts` names the lines with the reason, `core-matrix.json` carries them in the two rows' interactions and notes, LANDING.md 4.1, 6.7 and 7 | `d2fb0dd5` V1#8 fix (was `73b1311d`), `189b5c92` V1#8 fix (section 7, was `de00ebea`) |
| The ship order: V4#19's dependency | The declaration of `@paper-design/shaders` and its lockfile hunk moved to the first commit after V4#19's README, so V4#19's group declares what its shader chunk imports | `f2d513e9` V4#19 seam (was `47160fda`) |
| Found by building V4#19's group alone | `home.hero.run`'s touch case (a V1#15 fix in V4#19's group) reads `tsHomeMotion.stopped()`, which V4#20's commit added: on the first rewrite's V4#19 commit (`9a95db14`, unreferenced now) the row read "m.stopped is not a function" (09:49 to 09:54). The two probe accessors (`stopped()`, `visible()`) are split from V4#20's commit into a V4#19 seam | `62b9fb5b` V4#19 seam (from `69469bcf`) |
| The ship order: one more split | `4c97e47d` (V1#15 fix, the touch tap) carried a build/v1.md hunk written under V4#20's paragraph; its code ships with V4#19's group and the v1.md hunk is a commit of its own in V4#20's group | `d17254dc`, `983fc8a3` |
| This note | build/integrator.md "Landing, ship order" and the pictures under `build/integrator/fix3/` | this note's commit |

### 2. The push list (the ship order)

`07e2811b..189b5c92` on `landing/redesign`, by push, each push's commits in history order. "Ships at" is the push's last commit before the next push's first, the commit the guard deploys for it (LANDING.md 6.6 item 4). Nothing up to `133b81f6` (V4#19's README) was rewritten: pushes V1#8 to V4#18 keep the commits and the ship commits of the merge note's section 2, the trees their lanes built and read. Every commit after `133b81f6` was placed again (section 3): first V4#19's group, which holds V4#19's dependency, the probe seam and every seam and fix that serves a push up to V4#19, then V4#20's group. A seam or fix of pushes V1#8 to V4#18 cannot join its own push's commits without rewriting the thirteen trees before it, so it sits in V4#19's group, the first group after them, and ships with V4#19 at the latest; none waits behind V4#20's presence gate. If the presence rows are red when V4#20's turn comes (6.8, question 13), the ship ends at `44e735e5` with every fix of pushes V1#8 to V4#19 shipped.

| Push | Commits | Ships at |
| --- | --- | --- |
| the specification | `e3708837` V0, `dbe5405a` V0 fix | with V1#8 |
| `V1#8` | `172b3bda` V2's hunk, `bc3d1242` V2's hunk 2, `c0c5ddc0` V3's hunk, `54b07b88` V4's hunk, `1f406d25` V1, `a7672dca` README, `11df4c10` V2's hunk 3 | `11df4c10` |
| `V4#9` | `5ee64cf2` the CORS line, `8ec0ad23` V1's hunk, `c48f8198` V4, `79001704` README, `89e28076` fix | `89e28076` |
| `V2#10` | `a6042ce6` | `a6042ce6` |
| `V2#11` | `e05c78f4` V1's line, `1beea439` V2, `dce46267` README | `dce46267` |
| `V2#12` | `5d4293dc` V1's line, `fb712451` V2, `56acc6a2` README | `56acc6a2` |
| `V3#13` | `1804d0b8` V1's hunk, `02b67cb7` V3, `5ae47130` README | `5ae47130` |
| `V2#14` | `af334525` V2, `eea3c570` README, `6e6004f3` the V2#11 fix, `d154d8b8` V2 seam | `d154d8b8` |
| `V1#15` | `a8dfb2fc` V1, `47cc9e39` README | `47cc9e39` |
| `V3#16` | `56897de0` | `56897de0` |
| `V3#17` | `178ea588` V1's line, `3c431b3e` V3, `11e20a4d` README, `89f9e459` V3 seam | `89f9e459` |
| `V4#18` | `ac44ef60` V1's line, `35012ebe` V4, `70fe3545` README | `70fe3545` |
| `V4#19` | `d8662fca` V1's line, `64546416` V4, `133b81f6` README, then the 32 commits of 2.1 | `44e735e5` |
| `V4#20` | the 15 commits of 2.2, then this note's commit | held until 2.10's six presence rows read green on production (6.8, question 13); then this note's commit |

#### 2.1 V4#19's group after its README

"Serves" is the push the commit's key names (a lane note serves its lane). The first two are the integrator's and this round's seams for V4#19 itself; the order after them is the history's.

| # | Commit | Was | Serves | Subject |
| --: | --- | --- | --- | --- |
| 1 | `f2d513e9` | `47160fda` | V4#19 | apps/studio depends on @paper-design/shaders, so a clean install resolves the pattern's shader chunk |
| 2 | `62b9fb5b` | `69469bcf (first piece)` | V4#19 | tsHomeMotion names the loops stopped for good and each loop's share in view |
| 3 | `b289f6dd` | `7abbd47e` | V4#18 | the motion rows read the page's main thread, not the runner's trace or V8's memory reducer |
| 4 | `ebb03484` | `3b85fbc7` | V3#16 | the copy keys PRESENT.skipped and HISTORY.restoredVersion land, and their readers drop the fallbacks |
| 5 | `656fc7ff` | `17da98d1` | V3#13 | LANDING.md 2.2 and 2.9 name the build's version save before the run and the turn chip's layout/freeform finding |
| 6 | `2047922d` | `fdc961c8` | V1#8 | the export seam's handle moves by a transform, so E1 and a drag shift no layout |
| 7 | `50b60a26` | `8b631835` | V3#17 | V3's files formatted with the repository's Prettier, so check step 19 reads the build clean |
| 8 | `084d619e` | `c699900b` | V4#18 | the interludes' glyphs travel in a chunk of their own, so the live core stays within 4.1's 20 KB gzip |
| 9 | `370d9da9` | `af9febac` | V2#10 | home.hero.edit reads the move curve with its zeros written, so the build's minified token passes |
| 10 | `1077f0e4` | `491bab1d` | V2#11 | the miniature draws no side rules under 720 px, where the column's rails are its sides |
| 11 | `15c17bc5` | `b44a6d6f` | V4#19 | home.patterns.pair presses Globex once the kits band's chunk has filled its box |
| 12 | `de135861` | `32520fc3` | V1#8 | decks.home.load-budget reads the pictures and long frames before the first scroll in a process the runner does not trace |
| 13 | `a8aa72ee` | `191476a6` | V1#8 | LANDING.md 4.2 reads with 4.1 on pictures before the first scroll, and 7 puts the document, the own script and the load row's long frame to Kevin as questions 21 to 23 |
| 14 | `cf068042` | `e9509f6f` | V1#15 | the hero frame's filmstrip draws the deck's order, a slide the deck does not hold hidden |
| 15 | `d17254dc` | `4c97e47d (first piece)` | V1#15 | a scroll on a touch phone leaves the hero's loop playing, and a tap stops it |
| 16 | `63d72fbc` | `5db85768` | V1#8 | the lighthouse's plate sits lower left under 720 px, so the tower shows at 390 |
| 17 | `9e6a82a4` | `c218504e` | V1#15 | one pseudo element draws the step tab's rule, so the chrome lint reads one owner |
| 18 | `4c1ca9e1` | `d2df00fb` | V2#10 | typing in a box that runs past the slide's edge no longer scrolls the slide inside the hero frame |
| 19 | `0eed1a5c` | `ed3c2351` | V2#11 | a submenu that leads to a row the page runs reads in ink |
| 20 | `4774c650` | `61c98a95` | V2#14 | Restore This Version and a typed version restore bring back recorded versions 2 and 3 on every slide 5 |
| 21 | `9c892eef` | `f1393b00` | V2 seam | build/v2.md's fix round of verifier pass 1: F1, F6 and F10, the requests R26 to R28, the rows and the pictures |
| 22 | `3d1feb51` | `13f5486e` | V3#16 | Print This Deck prints slide 8's still frame and loads every picture it prints first |
| 23 | `290f8c92` | `6e345953` | V3#16 | under 1,024 px the show covers the screen, centred, with its bar in the 16 px gutter |
| 24 | `eef7528c` | `a0be34b9` | V4#19 | the patterns band draws both sides on the screen's pixels, so the still frame no longer reads as a moire grid |
| 25 | `14631355` | `ea57d690` | V1#15 | a restore of version 2 or 3 stops the hero's loop for good, as a restore of version 1 does |
| 26 | `700c2b5b` | `f00fe0d6` | V3#16 | the show, the print and the Present list draw slide 5 as a restore of version 2 or 3 left it |
| 27 | `cf98583e` | `a6eccdac` | V2#14 | check.mjs's INNER_HTML_ALLOW comment for versions.ts names the runs it now writes |
| 28 | `25e74f62` | `4964bf2e` | V4#19 | the pattern's still frame is requested once, and the band prints it in the slide's ink and paper |
| 29 | `52500369` | `db3aa8f8` | V3#16 | under a kit, slide 8 prints, shows and edits in the kit's colours through the frame's dots |
| 30 | `93c44574` | `37b8ef37` | V1#15 | any stop of the hero's loop lands the frame at rest, in the deck's order with its own counters |
| 31 | `d2fb0dd5` | `73b1311d` | V1#8 | the document's line rises to 100 KB decoded and the page's own script's to 360 KB and 120 KB gzip |
| 32 | `44e735e5` | `ad008c6e` | V3#16 | the comments on slide 8's mask say who requests it, at 100 columns |

#### 2.2 V4#20's group

The two people band and everything that needs it: V4#20's commits and seams, and the notes whose text follows V4#20's paragraphs (the lane notes' closing states after V4#20 and their fix round sections, the integrator's merge and fix round notes, LANDING.md 7's answers, which follow the fix round note's edit of question 22).

| # | Commit | Was | Serves | Subject |
| --: | --- | --- | --- | --- |
| 1 | `8ab8badc` | `e33fa9cf` | V4#20 | V1's line: the two people band on the page after the agents band, with its interlude |
| 2 | `464bdd17` | `0fe63aa0` | V1 seam | v1.md's closing state after V4#20: V1's commits, the readings that go to Kevin and the open requests |
| 3 | `983fc8a3` | `4c97e47d (second piece)` | V1#15 | build/v1.md asks V4 for the two people band's half of verifier pass 1 finding 2 |
| 4 | `4388bd56` | `69469bcf (second piece)` | V4#20 | two people edit the same slide: Maya's and Sam's screens play B's staged loop with ink presence marks, and a visitor types as either person |
| 5 | `578956ab` | `8274881e` | V4#20 | "What works today" reads the matrix with V4#20's two people rows |
| 6 | `6fdda010` | `c4dd5816` | V4 seam | v4.md's closing state after V4#20: V4's commits, the open requests and the readings for Kevin |
| 7 | `ef392cf1` | `44858636` | V4#20 | people-timing.ts leaves live/, so the route imports no live module and the bare print page hydrates |
| 8 | `3f291d15` | `36a2108f` | V4#20 | decks.home.capture-plain leaves out the two people band's presence marks, which 2.10 draws at rest |
| 9 | `b3b7e23f` | `5e08fe48` | V4#20 | the two people screens draw no side rules under 720 px, where the column's rails are their sides |
| 10 | `865ae528` | `d6f02a18` | V4#20 | build/integrator.md "Landing second pass, merge": the requests answered, the ship order, the chain, the runs and ledgers, the preview, the findings by owner |
| 11 | `5818fdfb` | `b7e74736` | V1#15 | build/v1.md's fix round after verifier pass 1: the four findings, their readings and the request to V4 |
| 12 | `10727c00` | `d97fdc70` | V4#20 | Home and End move the caret in a people screen, and a touch scroll no longer stops the loop |
| 13 | `8b62df11` | `793c0bd8` | V4 fix | build/v4.md's fix round 1: F9, F7 and F5's people half, their causes, readings, rows and pictures |
| 14 | `244dc4fb` | `d2a74cd2` | V1#8 | build/integrator.md "Landing second pass, fix round", and LANDING.md 7 question 22 reads the own script after the fix round |
| 15 | `189b5c92` | `de00ebea` | V1#8 | LANDING.md 7 answers questions 21 to 23 as the orchestrator decided them for Kevin's picks |

#### 2.3 The integrator's seams, by the push they serve

The merge note's thirteen seams and this round's two, each placed with the push it serves: in its push's group for V4#19 and V4#20, and in V4#19's group for the pushes before it (above).

| Serves | Seam | Was | Ships with | What |
| --- | --- | --- | --- | --- |
| V1#8 | `2047922d` | `fdc961c8` | V4#19 (its group) | the export seam's handle moves by a transform, so E1 and a drag shift no layout |
| V2#10 | `370d9da9` | `af9febac` | V4#19 (its group) | home.hero.edit reads the move curve with its zeros written, so the build's minified token passes |
| V2#11 | `1077f0e4` | `491bab1d` | V4#19 (its group) | the miniature draws no side rules under 720 px, where the column's rails are its sides |
| V3#13 | `656fc7ff` | `17da98d1` | V4#19 (its group) | LANDING.md 2.2 and 2.9 name the build's version save before the run and the turn chip's layout/freeform finding |
| V3#16 | `ebb03484` | `3b85fbc7` | V4#19 (its group) | the copy keys PRESENT.skipped and HISTORY.restoredVersion land, and their readers drop the fallbacks |
| V3#17 | `50b60a26` | `8b631835` | V4#19 (its group) | V3's files formatted with the repository's Prettier, so check step 19 reads the build clean |
| V4#18 | `084d619e` | `c699900b` | V4#19 (its group) | the interludes' glyphs travel in a chunk of their own, so the live core stays within 4.1's 20 KB gzip |
| V4#19 | `f2d513e9` | `47160fda` | V4#19 (its group) | apps/studio depends on @paper-design/shaders, so a clean install resolves the pattern's shader chunk |
| V4#19 | `15c17bc5` | `b44a6d6f` | V4#19 (its group) | home.patterns.pair presses Globex once the kits band's chunk has filled its box |
| V4#19 | `62b9fb5b` | `69469bcf (first piece)` | V4#19 (its group) | tsHomeMotion names the loops stopped for good and each loop's share in view |
| V4#20 | `ef392cf1` | `44858636` | V4#20 (its group) | people-timing.ts leaves live/, so the route imports no live module and the bare print page hydrates |
| V4#20 | `3f291d15` | `36a2108f` | V4#20 (its group) | decks.home.capture-plain leaves out the two people band's presence marks, which 2.10 draws at rest |
| V4#20 | `b3b7e23f` | `5e08fe48` | V4#20 (its group) | the two people screens draw no side rules under 720 px, where the column's rails are their sides |
| V4#20 | `865ae528` | `d6f02a18` | V4#20 (its group) | build/integrator.md "Landing second pass, merge": the requests answered, the ship order, the chain, the runs and ledgers, the preview, the findings by owner |

### 3. How the history was rewritten

- By plumbing, with no checkout (`.turboslide/fix3/rewrite2.py`): each commit after `133b81f6` was applied as a cherry-pick (`git merge-tree --write-tree --merge-base=<its parent> <new tip> <commit>`) and written by `git commit-tree` with its own message, author and author date; the committer is Kevin Liu with the time of the rewrite. Every commit applied with no conflict. Two commits are split by path (`4c97e47d` and `69469bcf`, above); each piece's message says so, and the pieces' content is the original's.
- `landing/redesign` moved by `git update-ref` from `ad008c6e` (the last commit before the rewrite) to `6cb0f4d3` at 09:47 (the first rewrite, without the probe seam) and to `189b5c92` at 09:55. The final tree is `e5071705` before and after, so the working tree never changed; `git diff ad008c6e 189b5c92` is empty. No other branch or worktree holds any of these commits (only `landing/redesign` contains `133b81f6`), and nothing was pushed. The commits before the rewrite stay in the reflog (`git reflog landing/redesign`); `git branch <name> ad008c6e` brings them back.
- The notes written before the rewrite (`v1.md` to `v4.md`, `verification.md`, this file's merge and fix round sections, some commit bodies) cite the commits after `133b81f6` by their old hashes. The "Was" columns of 2.1 and 2.2 map each to its commit on the branch; the notes are not edited.

### 4. Every push builds on its own

- **The declarations.** For each push's ship commit (`11df4c10`, `89e28076`, `a6042ce6`, `dce46267`, `56acc6a2`, `5ae47130`, `d154d8b8`, `47cc9e39`, `56897de0`, `89f9e459`, `70fe3545`, the old V4#19 commit `133b81f6` and the new `44e735e5`), the package names imported under `apps/studio/src` against `apps/studio/package.json` (`.turboslide/fix3/declared.py`): every commit reads the same standing set, the root dev dependencies of a few test files and some false matches in SQL strings; `133b81f6` alone adds `@paper-design/shaders` undeclared, and `44e735e5` declares it. `pnpm-lock.yaml`, `package.json`, `pnpm-workspace.yaml` and `apps/studio/package.json` at `44e735e5` are the branch head's, which check step 1 (`pnpm install --frozen-lockfile`) accepted at 20:15 on 2026-10-03 and the preview's build accepted at 21:35.
- **V4#19's ship commit, built alone.** `44e735e5` checked out detached in this worktree at 09:56 (load 47): `node_modules/.bin/tsc -b` exit 0; the home vitest files 13 of 13 (87 tests); `core-matrix.test.mjs` 37 of 37; `what-works.mjs --check` current; `build-home-assets.ts --check` 34 outputs match their sources; Prettier clean on every file the group changes; check step 30 ok (the Vercel build, 40 of 40 output assertions, the shader's `dithering` chunk 7.30 kB gzip); the node-server build exit 0. Its `/home` renders the twelve bands without the two people band, the document 93,606 B.
- **Its rows.** On V4#19's node-server build served on 4557, the 66 home rows of its own matrix at 09:58 to 10:12 (load 48 to 80): 57 passed, 2 failed, 7 not driven ("not read: load", their functional checks passed). Read again at 10:25 to 10:27 (load 6.3 to 8.9) from `44e735e5`'s own drivers against a copy of its build served on 4547: `home.motion.in-view` passed (C1 2,404.8 ms, E1 1,095.8 ms) and `home.interludes.glyphs` passed (ten interludes, the people band's not yet on the page; holds of 5,607.5 ms at 1440 and 5,649.8 ms at 390); at 09:58 to 10:12 the first read a 60 s timeout on the export band's chunk and the second a hold cut by the window, both at loads of 56 to 80. Its other timed rows were not read at a load under 20: a run of them waited for a load under 15 from 10:43 to 10:53 while other checkouts' jobs held 23 to 54, and was stopped.
- **The first attempt.** The first rewrite's V4#19 commit `9a95db14` built and read 10 of 11 narrowed rows at 09:49 to 09:54 (load 38 to 48); `home.hero.run` read "m.stopped is not a function" in its touch case, which the probe seam answers.

### 5. Readings on the branch's tree

The tree of `189b5c92` is the tree the rows below read (`e5071705`; every row ran before or after the rewrite on the same product code: the node-server build of 09:20 served on 4557 until 10:12, and the build of `189b5c92` at 10:13 from then).

| Check | Reading |
| --- | --- |
| `node_modules/.bin/tsc -b` | exit 0 at 09:19 and again on `44e735e5` at 09:56 |
| The home vitest files (`apps/studio`, `vitest run src/components/home`) | 13 files, 87 of 87 (09:20) |
| `node scripts/build-home-assets.ts --check` | exit 0: 34 outputs match their sources, 10 slide instances, 2,356 B of inlined stills, 17 served files (the mask is the seventeenth) |
| The brand lint, enforce (`node packages/lint/src/brand/main.ts --enforce`) | exit 1 on the same 22 findings in 17 files as the verifier's pass 2 (16 `gt-ui/cta-title-case`, 3 `css/mono-outside-code`, 2 `css/no-eyebrow`, 1 `gt-ui/no-smooth-scroll`), none under `/home` (09:35) |
| `scripts/probes/core-matrix.test.mjs`, `what-works.mjs --check`, Prettier on the changed files | 37 of 37; current; clean |

**Every home row on the node-server build.** `core-gate.mjs --only specs --rows <the 68 home.* and decks.home.* ids> --tier memory` against 4557, 09:31:44 to 09:46:19 (ledger `landing-fix3-local-home.json` in the scratchpad), load 15.5 at the start and 43 at the end as other checkouts' jobs began: 56 passed, 1 failed, 11 not driven. `home.lead.visit` failed once on visit 3 ("first paint at null ms": the paint entry was not recorded) and passed at 10:15 (load 34: the visit sentences set at 104.4, 60.6 and 40.8 ms before first paints at 120, 80 and 60 ms). The 11 not driven are the rows that read no time above their load line and say so (`home.motion.in-view`, `rest`, `pause`, `develop`, `home.interludes.glyphs`, `home.motion.loops`, `offscreen`, `home.budget.frame`, `main-thread`, `home.people.loop`, `type`; loads 26 to 46), each with its functional checks passed. The 56 passed include `home.hero.run` (cycles 18,788, 18,792 and 18,791 ms; the cut back "1 / 9" on its own counter; the three stops in the staged Restore at rest), `home.patterns.pair` (the shader chunk 7,283 B gzip; the right side's print in the slide's two colours under GT and Globex's after the press), `home.present.print`, `home.present.show` (its Escape bound read later, below), `decks.home.layout-shift` (CLS 0.0000 at 1440, 1280 and 390 in both appearances) and `decks.home.pictures-three-widths` (13,053 px at 1440).

**The timed rows at a load under 20.** `core-gate.mjs --only specs` over the twenty timed and byte rows (the seven `home.budget.*` rows and `decks.home.load-budget`, the motion and interlude rows, the two people rows, `home.hero.run` and `home.present.show`), 10:17:01 to 10:25:41 at loads 16.2 falling to 8.6 (ledger `landing-fix3-local-timed.json` in the scratchpad): **20 passed**. `home.budget.lcp` cold 128, 168 and 128 ms and warm 72, 76 and 64 ms on the h1 at 1440 ×1, ×2 and 390 (lines 400 and 200, load 16.2 to 16.4); `decks.home.load-budget` (measure) first byte 4 ms, LCP 100 ms, ready 199 ms, 0 pictures before the first scroll read cold, 0 long frames over 100 ms, 58,619 B after a full scroll; `home.budget.frame` the longest frame callback 0.4 ms at 1x and 1.5 ms at 4x, a band entering 1.3 and 3.3 ms (load 10.7 and 8.8); `home.budget.main-thread` the boot script 954 B, 2.3 ms of script before LCP, the longest script task 5.6 ms (8.6); `home.hero.run` L-H 7 ms after it registered, cycles 18,798, 18,785 and 18,794 ms, the cut back "1 / 9" on its own counter, the press, key and tap in the staged Restore at rest; `home.motion.develop` 1,509, 1,504.9 and 1,500.5 ms; `home.motion.in-view` C1 2,403.2 ms and E1 1,098.4 ms; `home.motion.pause` and `rest` 0 frame callbacks and 0 ms of task at the top, middle and bottom; `home.interludes.glyphs` eleven interludes, holds of 5,626.2 and 5,618.9 ms; `home.motion.loops` fourteen loops, each paused 2.5 to 18.1 ms after leaving the view; `home.motion.offscreen` 0 frames, 0 timers, 0 ms of task; `home.people.loop` a cycle of 14,000 ms, Sam's key gaps 81 to 326 ms, a 297 px touch scroll from Maya's screen; `home.people.type` 122 ms; `home.present.show` Present 520 ms and Escape 417 ms against 417 at load 21.7 (N7: 419.7 ms at 20.5 in the narrowed run of 09:23, 416 ms at 34.7 in a rerun at 10:15).

**Every home row again, at the lower load.** The 68 rows at 10:27:12 to 10:42:17 (load 6.7 at the start, with spikes to 52 from other checkouts; ledger `landing-fix3-local-home-2.json`): **65 passed, 0 failed, 3 not driven** at the spikes (`home.budget.main-thread` at 51.9, `home.interludes.glyphs` at 24.6, `home.motion.loops` at 20.7, their functional checks passed), each of which passed in the timed run above. The interaction bounds it read: `home.agents.chips` 2,954 to 4,062 ms from a press to the flag leaving (line 5,000) and rings of 291 to 696 ms (line 700) at 15.1 to 18.8; `home.menus.rows` Insert > Text box 70 ms and Arrange > Rotate clockwise 79 ms (line 300) at 18.5; `home.kits.restyle` Kestrel on every slide 52 ms at 17.9; `home.present.show` Present 518 ms and Escape 415 ms at 12.2; `home.export.loupe` 0 of 196 pixels at two places in light, 0 and 1 of 196 in dark. So every `home.*` and `decks.home.*` row has passed on the branch's tree on the node-server build, the timed ones at a load under 20.

### 6. The budgets

The orchestrator's decision on LANDING.md 7 questions 21 to 23, for Kevin's picks (all seventeen elements of directions A, B and C, B's first screen and looping motion, and much more interaction than the first pass's lines counted): `home.budget.bytes-first` gates the document at 100,000 B decoded (20,000 brotli unchanged); `home.budget.bytes-page` gates the page's own script at 360,000 B decoded and 120,000 B gzip; 80,000, 300,000 and 90,000 stay in LANDING.md 4.1 as Round 2's goals after its entry chunk split and Inter subset; `decks.home.load-budget` stays a measure row, its long animation frame on a deployment reported against `docs/POLISH.md` 3.7's line. The reason is written beside the lines in `page.ts`, in the two rows' interactions and notes in `core-matrix.json`, in LANDING.md 4.1 (a paragraph after the table) and 6.7, and in 7's answers.

Readings on the node-server build (`home.budget.bytes-first` and `bytes-page` read bytes, which do not move with load): the document 95,311 B decoded (line 100,000) and 18,534 to 18,543 B brotli; the route chunk 53,284 B decoded and 13,536 B brotli; the page CSS 15,129 B brotli; own first screen bytes about 47,200 B; 0 pictures before `load`; the page's own script after a full scroll 345,230 B decoded and 115,515 B gzip (lines 360,000 and 120,000) at 1440 ×1 and ×2; 6 pictures, 57,133 B; nothing under `/home/` requested twice; own bytes over the wire about 177,900 B. `home.budget.live-module`: the core with its imports 57,956 B decoded and **20,469 B gzip, 11 B under its 20,480 line** (the verifier's pass 2 read 20,395 B; this round adds to the core the mask's entry in `assets.ts` and `paint.ts`'s lines that give the miniature's slide 8 its mask); every band chunk under its lines (the largest, `menus`, 48,202 B and 15,903 B gzip). Read again at 10:17 (load 16.2 to 17): `home.budget.bytes-first` and `bytes-page` passed with the same bytes (the document 95,311 B decoded and 18,505 to 18,548 B brotli; the own script 345,230 B decoded and 115,515 B gzip); `home.budget.live-module` the core 57,956 B decoded and 20,414 B gzip (the row concatenates the core's three files in the order the page requested them, and that order moves the gzip by up to 55 B: 11 to 66 B of room); `home.budget.shared` the entry chunk 1,183,913 B decoded and one font of 352,240 B, reported.

### 7. Pictures

`build/integrator/fix3/`, 11 JPEGs, each under 200,000 B, shot on the node-server build of the branch's tree on 4557 at 10:14 (motion paused where the still frame is the subject), each looked at:

- `n2-stop-press-light-1440.jpg`, `n2-stop-key-dark-1440.jpg`, `n2-stop-tap-light-390.jpg`: the hero's stage after a mouse press, a key and a tap during the staged Restore: the filmstrip 1 to 9 in the deck's order, slide 1 at "1 / 9", the transcript at rest.
- `n3-print-globex-light-1440.jpg` (the nine printed pages under Globex, the PDF rasterized at 40 dpi; the dark appearance at 390 printed the same pixels) and `n3-print-page8-globex-light-1440.jpg` (page 8 at 100 dpi): slide 8's sphere in cream on navy among eight navy pages.
- `n3-show8-globex-light-1440.jpg`, `n3-show8-globex-dark-390.jpg`: the show's slide 8 still under Globex.
- `n3-patterns-globex-light-1440.jpg`, `n3-patterns-globex-dark-390.jpg`: the patterns band under Globex, both sides in the kit's colours.
- `n3-mini8-before-light-1440.jpg` (the miniature's slide 8 with the old still: a box of ink) and `n3-mini8-globex-light-1440.jpg` (with the mask under Globex).

### 8. What stands

- **For Kevin.** The live core is 11 to 66 B under its 20 KB gzip line (by the order the row reads its three files in); the next line in the core (`live`, `paint`, `motion`) pushes `home.budget.live-module` red. V2's offer (the kit painter out of the core into the kits chunk through `registerPainter`, merge note 5) is the way to make room. V4#20 stays held until 2.10's six presence rows read green on production (6.8, question 13). `home.present.show`'s Escape bound (417 ms) read 416 to 419.7 ms on this round's builds at loads 20.5 to 34.7 and passed at 417 ms at 21.7 (N7, standing).
- **Not in this round's ask, standing from the verifier's pass 2:** N4 (the menus band's lead on the miniature, `editing.css`), N5 (the show's slide moves 11 px at 390 as the notes change, `agents.css`), N6 (a turned title's ring past the frame, `objects.ts`, `selection.css`), N7 (`home.present.show`'s Escape bound of 417 ms has 1 to 3 ms of margin), N8 (the thumbnails' coarse cells), F15 to F22.
- **For the ship.** No preview was deployed in this round: the integrator's preview (`8b631835`) predates every fix since the merge, so the hosted rows of LANDING.md 6.6 item 3 (the byte rows with their new lines, `home.patterns.pair`, `decks.home.load-budget`'s long frame as a measure) are read by the ship on the preview of each push's commit, V4#19's at `44e735e5`.
- **The notes' hashes.** The lane notes and the earlier sections of this file cite the old hashes after `133b81f6`; 2.1 and 2.2 map them.

### 9. At the close

- My node server on 4557 and the copy of V4#19's build on 4547 are stopped by their PIDs; the dev server on 4547 was stopped at 09:46; no browser of mine runs; `.turboslide/e2e.lock` and `.turboslide/git.lock` are free.
- `landing/redesign` is at this note's commit, after `189b5c92`; the worktree is on it with no tracked change. `apps/studio/.output` and `apps/studio/.vercel/output` (ignored) hold builds of the branch's tree (check step 30 ran on it again at 10:54: 40 of 40 output assertions).
- Left untracked and ignored: `.turboslide/fix3/` (the probes, the rewrite scripts), `.turboslide/fix3-overlay*/`, `.turboslide/fix3-auth*.sqlite`. The untracked files found at the start are left as found. The ledgers, logs, raw pictures, the PDFs and the rewrite's maps are in the session scratchpad.
- Nothing was pushed or deployed; no other worktree, port or branch was touched.
