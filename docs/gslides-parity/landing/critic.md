# Critic of docs/LANDING.md

Written 2026-10-02 from 19:11 to 19:30 PDT by the landing workflow's critic, in the worktree `/Users/kevinliu/repos/Turboslide-landing` on `landing/redesign` at `2108dad4`. Read: `docs/LANDING.md` (mtime 19:10:43, 572 lines), prototype A (`direction-a/index.html`, `a.js`, `a.css`, `shots/page-1440-light.jpg`), the three judges' notes, `research-lovefrom.md`, `research-openai.md`, `research-product.md`, and the tree files the spec cites. Nothing was fetched from the network, no dev server or browser ran, and no product file was edited. One Python estimate of picture bytes ran in the session scratchpad (item 3.5). The one minute load read 33 to 37.

## Verdict

Revise. The page, the motion table and the lanes are mostly complete and on brand. Three items block a build that matches the spec as written.

1. **The agents band's run cannot meet its own bounds.** Step 3 is about 254 characters typed at 24 ms (6.1 s) and then 141 characters landing at 24 ms (3.4 s), so the step alone takes about 11 s and the whole run about 19 s. The spec promises "within 5 s" a step (`home.agents.run`, section 3.7) and a caption of "11 seconds in all". The rest state cannot be drawn either: the banner, three commands and three answers need about 24 lines at 68 columns, and the panel has 12 slots that never scroll or cut. Step 2 also names the wrong block (2.4).
2. **Several claims on the page are false or shown with a stand-in.** "The CLI runs all 193" and "Every menu row is one of 193 actions" are both false in the tree. "One picture, 1600 by 900" has the wrong size. The seam shows "Editable text" with the web render, not the Editable text file. The MCP and HTTP tabs print the CLI's answer. PDF is in the h2 and the lead and never shown (section 2).
3. **The budgets and rows have holes the gates will hit.** Nothing costs the inlined slide HTML or its hydration copy against the 60 KB document and the 70 KB route chunk. Four budgets are marked gate with no row. The nine restated `decks.home.*` rows are driven by `apps/studio/e2e/core/decks.spec.ts`, and no lane owns that file (section 3).

## 1. The agents band (2.4)

- **Step lengths.** Computed from the spec's own values. Commands: `slide new ...` 64 characters (1.5 s), `block set next-steps#title /text "..."` 71 (1.7 s), `block set next-steps#rows /items '<JSON>'` about 254 with the `{key, value}` items of `RowItem` (`packages/schema/src/blocks.ts` 135), 6.1 s. A5 lands the words at 24 ms a character: 25 for step 2 and 141 for step 3 (3.4 s). Add A2's answer lines, the 500 ms beat and A3's ring of up to 700 ms, and the steps run about 3.7 s, 4.1 s and 11 s. Step 3 breaks `home.agents.run` ("each press plays one step within 5 s"). Section 3.7 says the same, and the caption's "11 seconds" does not match the build's own sum. Prototype A printed each command at once and faded the words in over 160 ms (`a.js` 952 to 1043). The 24 ms clocks are the new cost. Fix: type only the command head at 24 ms and print the JSON body at once, or land the rows as one cut. Then restate the caption's figure.
- **The panel at rest.** 2.4 asks for "the three commands and answers" at rest in 12 slots of 20 px, "sized so no slot is ever cut". A's banner alone is 7 lines (`a.js` 1047 to 1055). At 68 columns command 2 takes 2 lines and command 3 takes 4, and each JSON answer takes 3 to 6. A cleared the panel on every step. The spec must choose one: the panel holds the last step only, it scrolls natively, or it has more slots. Under 720 px, command 3 is 6 lines at 44 columns before its answer.
- **Wrong block id.** The `rows` layout's heading is `h` (`packages/schema/src/layouts.ts` 227 and 505 to 520). `next-steps#title` does not exist. The canvas band already uses `earth#h`.
- **Shell quoting.** Slide 5's row "Northwind's sellers get this deck..." sits inside `'<the three rows as JSON>'`. A straight apostrophe ends a single quoted shell string, so the recorded command needs `'\''` or a different value. Tailor substitutes the customer's name into the recorded command, so a name with an apostrophe breaks it again.
- **`--base-revision`.** `packages/agent/generated/cli.json` marks it required on `slide.new`, `block.set` and `deck.tailor`. The intended forms omit it. The spec's fallback ("the lane records the form it accepts") covers this. The panel would then show a different command from the one 2.4 prints, so the caption and the row need the final form.
- **The fixture's slide count is undefined.** `slide new --id next-steps` needs slide 5 absent from the fixture. The rest state, the "n / 8" counters and the Tailor count ("9 places on 4 slides", checked against the CLI "on the fixture") need it present. The spec does not say which deck file the CLI's Tailor count is read from: the fixture before the run or after it.

## 2. Claims the page makes and does not demonstrate

- **"This page runs 5 of the commands. The CLI runs all 193."** `cli.json` lists 180 actions. The 13 that are not on the CLI are `view.goto`, `view.mode`, `view.theme`, `view.present`, `view.zoom`, `source.read`, `source.apply`, `controls.list`, `control.activate`, `control.set`, `artifact.download`, `share.requestAccess` and `account.forget`. Fix: take the figure from `cli.json` through `HomeFacts`.
- **"Every menu row is one of 193 actions."** In `packages/chrome/src/menus/model.ts`, 116 rows call `action(...)`, 36 open a `dialog(...)` and 18 open a `panel(...)`, and about 70 more are routes, toggles and client handlers. The branch's sentence today is "Every editor action is a command" (`apps/studio/src/components/home/copy.ts` 240), and it is true. Keep it.
- **"Agents send the same actions over the CLI, MCP or HTTP"** and the parts row "Actions · Menus, CLI, MCP and HTTP · 193". MCP has 169 tools and HTTP 177 paths (`facts.json`), so not every action reaches every transport. The lead needs "the same table" or the three counts.
- **The MCP and HTTP tabs print the CLI's answer.** In 2.4, "the answer printed is the one recorded" for all three tabs. An MCP `tools/call` answers with a JSON-RPC result, and HTTP answers with its own body. Record each transport's answer at build (the HTTP route runs in the tmp store; `turboslide mcp` runs over stdio), or label those tabs as showing the request only. `home.agents.recorded` checks only the CLI.
- **"One picture, 1600 by 900".** The Perfect page is "the 2x sheet screenshot of the rendered slide (3200 by 1800)" (`docs/pptx.md` 23 to 25). The 194 of 5,760,000 pixels behind the 0.003% figure are a 3200 by 1800 page. `export.run` has a `--raster-scale` flag, so the build can read the true size.
- **"Editable text · Text boxes stay text boxes" is shown with the web render.** The right side of the seam is slide 7's `renderSlide` HTML with outlines drawn on it. The Editable text file (`--mode native`) is never opened. The left side is a screenshot of that same render, so the seam again compares the render with itself. That is the fault judges 1 and 2 named in B's loupe (`judge-2.md` 23; `judge-1.md` 7 graft 3, "drawn from the verify loop's two real rasters ... so a difference could show"). Fix: build the right side from the native file (its text frames drawn through the verify loop's LibreOffice raster, or its `a:t` runs placed at their EMU boxes), and say which file each side came from.
- **The 0.003% sentence.** "Differs from the screen" is read from the exporter's decoded raster against its own shot (`pptx.md` 26 to 33), not from a viewer's render. The `--verify` LibreOffice gate is the reading that compares the file with the screen. Use its figure or describe the measure exactly.
- **PDF.** The h2 is "Export to PDF and PowerPoint" and the lead names a PDF, but nothing on the band shows one. Print This Deck is the browser's print, not File > Download > PDF. Show one PDF page or take PDF out of the h2.
- **"It has Google Slides' menus and shortcuts" in the first screen.** No menu is drawn on the page, which is acceptable: C's menus instrument is excluded and the parts table carries the paths. The shortcuts the page does teach are `[` and `]` to turn and S to present. Neither is a Google Slides shortcut. Either show one real Google shortcut (Cmd or Ctrl+Z already works) or keep the claim to the menus.
- **Menu figure 9.** The source named in 2.9, "the top level of `model.ts`", has 10 entries (`MENUS`, 2739 to 2762). Extensions is parked, so the bar shows 9 (`editor-shell-render.test.tsx` 182 to 186). The build must count `visibleMenus` in the default context, or the row reads 10.
- **The themes.** "Slide > Change theme sets the colors of every slide" is true. The product's row opens the Brand kit panel with six colour fields (`model.ts` 2244), and it has no named presets. GT, Kestrel and Globex are a page replica and should be labelled "replica" as 2.0's Kinds require. "Globex" is also the Tailor example's customer, so one name means two things.
- **Tailor's empty field.** "Type a customer name first" is not the product's string. `TAILOR.nothing` reads "Type a customer name, choose a logo or tick a slide first" (`assist-strings.ts`). 2.5 says the band's strings come from the product.

## 3. Budgets, rows and lanes

- **3.1 Inlined slide HTML is not costed.** About 19 slide instances are on the page: hero 1, agents 1, Tailor stage 1 plus 4 thumbnails, canvas 1, Present 1 plus 8 thumbnails, export 1 and close 1. 2.0 says each is "rendered at build in both appearances and inlined". At 1,133 to 2,230 bytes a slide (`research-product.md` 189) that is about 32 to 64 KB in one appearance and twice that in both. The document's budget is 60 KB decoded, and today's document is already 55.6 KB. `/home` is a hydrated React route, so the same strings also sit in the route chunk (budget 70 KB decoded, 56.8 KB today), or the hydration mismatches. Section 4.1 needs a slide markup line: instances, appearances, bytes, and where the hydration copy lives.
- **3.2 Budgets marked gate with no row.**
  - The live module's 15 KB gzip, 48 KB decoded and its request after `load` and one idle callback.
  - The page's own bytes over the wire, 240 KB for the whole page.
  - The route chunk's 22 KB brotli.
  - "At most 2 ms of task a second" at rest.

  `home.budget.bytes-first`, `bytes-page` and `motion.rest` do not carry these.
- **3.3 Budgets with no number.** "Main thread before LCP: No page motion code; hydration only". "Font: Reported" in the first screen, where the standing figure is 120 KB. `home.budget.main-thread` drops the 60 ms at 4x that 4.1 sets.
- **3.4 The strip still in the first screen.** 2.2 puts the field strip's top edge in the first screen. 2.3 puts its still "in the markup". `home.budget.bytes-first` requires "no picture requested before the first scroll". Either inline the 2 KB still as data in the document and count it there, or loosen the row.
- **3.5 "Lossless two colour WebP" for the PowerPoint picture.** The flatten page raster includes the plate's antialiased Inter, so it is not two colour. My estimate in scratchpad: the Rosetta Stone mood picture alone, Bayer dithered at 2 px cells to 3200 by 1800, is 30,412 B as lossless WebP and 36,168 B as 1 bit PNG. The 60 KB line is plausible for the full page. "Two colour" is wrong, and requantising would no longer be "the picture the PowerPoint file holds".
- **3.6 The restated `decks.home.*` rows have no owned driver.** All 13 are driven by `apps/studio/e2e/core/decks.spec.ts` (138 to 2678, `core-matrix.json`). Push 1 restates nine of them and retires `Shot.tsx` and `shots.json`, which `capture-plain` and `product-pictures` read. No lane lists `decks.spec.ts`. Give it to L1 with push 1.
- **3.7 Files nobody owns.** `HomeSection.tsx`, `PageFrame.tsx` and `page-frame.css` exist in `apps/studio/src/components/home/` and are neither kept nor retired. `assets.test.ts` is named in 6.6 as a home vitest file but is not in 6.1. The brand lint runs in enforce mode, and its configuration (`packages/lint/src/brand/config.ts`: monospace selector entries, overrides) is in no lane. The second `#101010` panel's monospace selector needs an entry there unless it styles `pre` or `code`.
- **3.8 Copy test.** The canvas caption "Each gesture prints the command an agent would send." uses "agent", one of `FORBIDDEN_DEFAULT_VIEW_WORDS`. Only `canvas.log` is exempt, so `copy.test.ts` fails unless the caption's key sits under `canvas.log`.
- **3.9 Panel width.** 68 columns of 14 px monospace is about 571 px, which leaves about 8 px a side inside the 588 px panel. Name the face and the padding, or format at 64 columns.

## 4. Motion

The table in 3.2 gives every listed motion a duration, a curve and a reduced motion rule. What is missing:

- The snackbar's exit. T2 has the entry only. The spec gives no timeout, no leave duration and no curve. If it leaves on a timer, that is a motion that starts on its own and belongs under 3.7.
- Changes the spec does not list. Slide 5 entering and leaving band 3's filmstrip and the counters on Run Again. The run's history rows leaving. The Tailor status sentence. The step label. The skip link appearing. These are presumably cuts. One sentence in 3.4 ("everything not in 3.2 cuts") would close it.
- The hero's first paint is not its end state. The opener field draws only after `load` and one idle callback (2.2, 4.1 "0 bytes"), so the first paint shows paper where the field will be. 2.0's "At rest" rule says every band's first paint is its end state. `home.page.markup-final` passes only because it excludes canvases. Say the hero is the exception, or print a still.
- H3's bound depends on the seed. With 34 to 60 ms a key, a 50 character sentence can end at T0 + 4.1 s and H4 at 4.5 s. A's own hero measured 4.9 s (`judge-3.md` 3). `home.motion.hero` should read the three sentences against their seed.

## 5. Brand and avoid list

- **The one rail.** Judge 1 named three vertical lines on each side of a framed full width sheet (page rail, frame, the slide's rail) as the "ugly border lines" (`judge-1.md` 3). The spec removes the frame from the hero and the close only. Bands 4 and 6 still draw a framed 1,024 px sheet, so the same three lines return twice (visible in `direction-a/shots/page-1440-light.jpg`, the lighthouse band).
- **A second `#101010` panel.** Judge 3's graft 2 puts the gesture line on the band's ruled row "so monospace stays on the one `#101010` panel". The spec makes the log strip a second panel. This is defensible, but it is not what the judge asked for and the spec does not state the change.
- **Keyboard.** S opens the show whenever the band is half in view, without focus. That is a single character shortcut under WCAG 2.2 SC 2.1.4 (Level A). It needs a way to turn it off or remap it, or it must work only while the band's controls have focus. In the show, "Space and Enter go forward" conflicts with a focused Previous or Exit button. Cmd or Ctrl+Z "outside a text field" has no rule for which band's undo it calls.
- Clean: Inter only, no em dash or exclamation mark in the spec (0 found), sentence case headings, Title Case buttons, square corners, Heroicons solid in key cells only (`bars-3`, `squares-2x2`, `cube`, `paint-brush`, `command-line`, `server`, `globe-alt`, `scale`, `user-circle` are all Heroicons 2 names), blue only while something is worked on, no smooth scrolling, no loops, reduced motion everywhere.

## 6. Taken from LoveFrom rather than translated

The hero's opening repeats lovefrom.com's sequence with LoveFrom's own constants.

- The caret blinks with LoveFrom's keyframes: 400 ms off, 90 ms rising, 510 ms on, from `start-CmwIa23E.js` (`research-lovefrom.md` 4a item 1).
- The subtitle is typed behind that caret.
- The per visit sentence rotation uses LoveFrom's rule "by the same rule": in order, random after more than two days away, the first when storage fails (4a item 5, the `lf_ch` key).

Each of these is a code value of theirs, carried over unchanged. Turboslide's editor draws its text caret with the browser (`caret-color` from `tokens.css`) and has no blink of its own. A translation would take the caret from the product, either the selection caret as the editor draws it or one blink on the brand's `--ts-d-*` tokens, and would choose a visit rule for a product reason. Judges 2 and 3 scored this as translated. I read it as the one place where the spec takes LoveFrom's code values rather than its method. Nothing of OpenAI's is copied: the type values (weight 500, -0.042 em) differ from openai.com's -0.03 em, and the field gathers into Turboslide's selection frame, not Astra's cursor.

## 7. What holds

- Every section has copy, layout at 1440 and 390, interaction, motion, a kind and a reduced motion rule. The footer says "unchanged" and needs no more.
- Every picture and probe cited in sections 6.7 and 8 exists, among them `judge-1/type-b-h1.png`, `judge-2/try-b.json`, `judge-3/ka.mjs`, `ka2.mjs` and `audit.mjs`.
- These references were read and are right:
  - the mark's seven pieces (seven subpaths in `mark.svg`; 300 px wide is 208 px tall)
  - the menu paths (`model.ts` 1484, 1665, 2224)
  - the MCP tool names and HTTP paths (`deck_new_slide`, `deck_update_block`, `deck_tailor`, `deck_version_list`; `/api/actions/<id>` for all four)
  - `facts.json` 193, 169, 177, 22, 135, 17 and 0.003
  - the ShaderMount test at `home-page.spec.ts` 637
  - `AREA_FEATURE`, `CORE_SPEC_DRIVERS` and `decks` being unparkable (`core-matrix.mjs` 190, 256, 380)
- The spec says it was written "from 18:39 to 19:40 PDT". The file's mtime is 19:10:43, and the end time was in the future when this note was written.
