# Landing judge 3: the brand and the build

Judge 3 of three for the landing workflow. Kevin wrote on 2026-10-02: "make the landing much better inspired off of lovefrom and openai brand and make the landing much more interactive and showing off features featuring the best of graphic and motion design". This judge reads the three directions through Kevin's brand and the build. The checks cover the brand deck's rules and the avoid list, the copy register, both themes and the phone, reduced motion, page weight and LCP, accessibility (keyboard, focus, contrast, captions), and how much of each direction the product can build in three to four pipeline days with live product code where promised.

Written 2026-10-02 from 18:09 to 18:40 PDT in the worktree `/Users/kevinliu/repos/Turboslide-landing` on `landing/redesign` at `2108dad4`. Nothing outside `docs/gslides-parity/landing/` was written. No product source was edited, no git write command ran, nothing was pushed or deployed and no dev server was started (all three prototypes run from `file://`). No site was fetched. Every claim about lovefrom.com or openai.com below comes from the research notes, which read those sites on 2026-10-02 and name each URL.

## 1. Verdict

| Direction | Craft | Inspiration | Features | Brand | Buildable | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A, quiet object | 8 | 8 | 7 | 9 | 9 | **41** |
| B, demonstration | 8 | 9 | 8 | 7 | 6 | **38** |
| C, the playground | 7 | 7 | 9 | 6 | 5 | **34** |

**Winner: Direction A.** It keeps every brand rule without asking for more exceptions than the motion ask itself needs. Blue appears only while the visitor works on something. Nothing loops, and the page runs nothing at idle. The first viewport is final type, and the page script is the smallest of the three (13.4 KB brotli, 87 KB in total with the font and the tone map). The authors' own plan fits the pipeline window: about 7 lane days, roughly 3 days of wall time. Its weakness is the other half of Kevin's sentence. At 1440 the first screen is a white title slide (`direction-a/shots/first-1440-light.png`), and the dither appears in one band only, so A gives the least graphic and motion design of the three. The grafts in section 6 add that back from B and C without bringing in their loops, their colour leaks or their second renderer.

## 2. How this judge checked

- Read the five research notes and the three direction notes in full, and opened every picture each direction listed with the Read tool.
- Ran my own probes against each prototype from `file://` with the worktree's `playwright-core` (Chromium 1217), one short run at a time. The one minute load was 51.7 to 67.1 the whole time; it never fell under 30, as for every other lane today. Timings are upper bounds, but byte counts and structure checks do not depend on load. The scripts and their raw output are in `judge-3/` and `judge-3/raw/`:
  - `audit.mjs`: twelve runs, one per direction for 1440 light, 1440 dark, 390 light and 1440 under `prefers-reduced-motion: reduce`. Each run checks the text (em dashes, exclamation marks, banned words, headings), the fonts (any face besides Inter, and where monospace sits), chromatic colours at rest, text contrast against the blended background, accessible names, live regions, a 45 step Tab walk with focus ring detection, `requestAnimationFrame` calls a second at idle before and after a native wheel scroll, running animations, horizontal overflow and phone target sizes.
  - `ka.mjs`, `ka2.mjs`, `kb.mjs`, `kc.mjs`: each direction driven by keyboard only, from one widget to the next. Results are in sections 3 to 5.
  - `lcp.mjs`: FCP, LCP element and CLS at 1440 and 390.
- Byte counts were measured again from disk with Node's brotli at quality 11, counting every file `index.html` references at load.
- Checked each direction's CLI forms against `packages/agent/generated/cli.json`, the counts against `packages/theme/brand/facts.json`, the Animated pattern label against `packages/chrome/src/menus/model.ts` 1665, and the Tailor strings against `packages/chrome/src/panels/assist-strings.ts` 62 and 81.

What every direction gets right, confirmed by the probes:
- No em dash, en dash or exclamation mark in the rendered text.
- None of `copy.ts`'s forbidden words, "realtime" included. No trailing period on a heading.
- `scroll-behavior: auto`, pinch zoom allowed and text selection allowed.
- Inter is the only face, and every monospace line sits on the `#101010` panel.
- No console or page error, and no network request.
- No text outside the slides falls under 4.5:1 (or 3:1 for large text) in either appearance.
- CLS of at most 0.00003. LCP is text at 36 to 76 ms.
- No horizontal scroll at 390.
- Under reduce, idle `requestAnimationFrame` calls are 0.
- Every CLI command form used is real (`slide new --layout`, `slide patch --set`, `block set <slide>#<block> <path> <value>`, `block rotate --to`, `tailor --replace`, `version restore`, `version list`, `slide background --color`, `slide skip`, `slide get`, `slide to-canvas`), and the layouts `rows`, `split` and `mood` exist. The JSON answers are written for the page in all three, and each note says so.

| Probe reading (my runs, load 52 to 67) | A | B | C |
| --- | --- | --- | --- |
| Bytes at load, brotli 11 (font included) | 87,015 | 93,854 (+25 KB tone, +54 KB rasters later) | 157,194 |
| Page script, brotli | 13,408 | 19,872 (14,184 minified) | 29,965 (23,946 minified) |
| LCP at 1440 / 390 | 56 ms h1 / 52 ms band 2 sentence | 76 ms h1 line / 60 ms lead | 52 ms h1 / 36 ms lead |
| CLS over load and 6 s | 0 / 0 | 0.00003 / 0.00001 | 0 / 0 |
| Page height at 1440 / 390 (row: 5,000 / 8,500) | 5,772 / 5,912 | 7,898 / 8,924 | 6,544 / 7,988 |
| Rendered words, all text on the page | 496 | 1,002 | 717 |
| Page copy by the authors' count (row: 350) | 345 | 516 | 410 |
| rAF calls a second at idle after a full scroll | 0 | 0 (one CSS caret blink still running) | 0 |
| rAF while the hero plays | 0 after 4.9 s | 120 (hero and field), 0 with Pause Motion | 0 after the 1.5 s develop |
| `getAnimations()` under reduce, after a scroll | 0 | 0 | 2, both finished |
| Chromatic colour at rest | blue only on the snap guides' hidden layer | blue ring, chip, guides and caret in the autoplaying hero | navy `#0b1d3a` swatch, blue thumbnail outline, amber `#f0a020` for terminal errors |
| Tab stops with no detected ring | 0 apart from slide objects, which draw the editor's selection on focus (`judge-3/a-key-focus.png`) | the terminal input, which draws a blue border on its row (`judge-3/b-typed.png`) | 0 apart from slide objects, which draw the selection on focus |
| Skip link | no | yes | no |

## 3. Direction A, quiet object (41)

**Craft 8.** The hero slide in `first-1440-light.png` and `first-1440-dark.png` holds the h1 inside the deck's sheet, with rails, crosses, the mark and the counter. Both appearances are exact. At 390 the slide holds a 27 px reading floor and the buttons go full width (`first-390-light.png`). In `hero-intro.png` the rails draw out of their crosses and the subtitle is typed behind the caret, and the sequence ends at 4.9 s. `mood-develop-light.png` and `-dark.png` develop the lighthouse through the Bayer screen on smoothstep, and it is the most beautiful single frame on any of the three pages. `canvas-edit.png` shows the Layout row reading Mood, then Canvas, then Mood again after Undo, which is the product's sentence made visible. By keyboard (`ka.mjs`), Tab reaches the hero title and draws the ring, handles, chip and knob. Arrows nudge it, Enter edits, Escape returns focus to the object, Cmd+Z undoes the words and then the move, and `]` turns it by 15 degrees. Tailor works with Enter and answers an empty field with "Type a customer name first". Cmd+Right moves a filmstrip slide. S opens the show, the arrows page it, and Escape returns focus to Present.

Two keyboard defects were found:
1. **Run drops keyboard focus.** `[data-run]` sets `disabled` while a step plays, so the focused button loses focus to `body`. Pressing Enter three times ran one step, and focus stayed on `body` (`ka2.mjs`). A keyboard visitor has to Tab back from the top to reach Run again. Fix: use `aria-disabled` and ignore presses while a step runs.
2. **The show does not keep focus.** It is `role="dialog" aria-modal="true"`, but Tab leaves it after three stops. The arrow keys then stop paging, Escape lands on the footer, and the page scrolls away from the show (`judge-3/a-show.png`). Fix: keep Tab inside the show, or drop `aria-modal`.

Other points:
- The first screen at 1440 is a white slide with a title and a lot of empty sheet. It reads as quiet to the point of plain, which is the weakness `research-current.md` 4.4 named for today's page.
- The "Materials" row says "Shader backgrounds". Round 1 renamed the seller's noun to Animated pattern (`model.ts` 1665).
- The lighthouse plate's paragraph is GT's text (A risk 10).

**Inspiration 8.** A translates LoveFrom's method into the product's own unit: the hero builds one made object once and stops on a still (rules 1 and 2 of `research-lovefrom.md`, from https://www.lovefrom.com/ read 2026-10-02). The caret uses LoveFrom's 400, 90 and 510 ms blink. The book's Polaroid develop becomes the Bayer tone mix (https://book.stevejobsarchive.com/ read 2026-10-02). There is one subject per band, the work is signed on the work ("Made in Turboslide. Set in Inter."), a print still is defined, and each return visit gets the next subtitle. From OpenAI it takes the working product in the first screen (https://openai.com/ read 2026-10-02) and a working viewer (the show). Nothing of theirs is copied. A does not take OpenAI's showcase devices (countdowns, chapter fields), so the OpenAI half is thinner than in B.

**Features 7.** Tailor for a customer, the product research's first ranked feature, is live and uses the product's own count and snackbar sentences. The canvas edit is live. The agent run uses real command forms and builds a slide that renumbers every counter. Version history names You or Agent. The show presents the visitor's own edits. The brand kit, the export proof, the menus and the animated patterns are missing, so a visitor sees five of the eight ranked features.

**Brand 9.**
- Blue appears only while something is selected, typed, guided, tailored or lifted, and on focus rings.
- There is one `#101010` panel, there are no loops, and the dither stays off the first screen at 1440. At 390 the lighthouse field just enters the bottom of the first screen (`first-390-light.png`), which question 5 should be asked about.
- Rows are ruled, and Heroicons sit in the parts table's key cells only.
- 345 words of page copy.
- A still asks for three rulings, and names them in its risk 1: POLISH.md 3.2, POLISH.md 3.3 item 3 and brand.md section 11.

**Buildable 9.**
- The authors' own estimate is about 7 lane days over four lanes, roughly 3 days of wall time.
- One lazily imported live module of about 15 KB gzip. Slides come from `renderSlide` at build, the tone map and the CLI recording are made at build, and facts come through `HomeFacts`.
- Height is 5,772 px against the 5,000 row. The authors propose 96 px band padding, which gives about 5,430 px, or raising the row.
- In production the first paint should not wait for Inter behind an opacity hold, as lovefrom.com's does. Over a network that hold can push LCP past the 400 ms budget. Preload the 40 KB subset and keep the metric fallback face (A risk 6).

## 4. Direction B, demonstration (38)

**Craft 8.**
- The 95 px three line h1 is strong type (`b-1440-light-first.png`).
- The strips are the best produced of the three: `b-strip-hero-agent.png` with ten timed frames, `b-strip-canvas-gestures.png` and `b-strip-people.png`.
- Keyboard works throughout (`kb.mjs`). A typed `tailor --replace Acme=Initech` changed the deck and answered "Tailored for Initech: 13 places on 6 slides". `frobnicate` answers with a plain error, and `help` lists the four commands. Arrow keys on the gesture slide print `block set review#title /pos ...` in the actions panel (`judge-3/b-gesture-keys.png`). The presenter pages by keys and leaves out slide 4. The export seam is a slider with Home and End. Pause Motion takes rAF to 0 a second with no running animation. There is a skip link, the terminal input is labelled, and a polite live region reads each action.

Defects found:
- The terminal breaks JSON in the middle of tokens ("revis / ion", "s / plit"; `judge-3/b-typed.png`).
- At 1440 the h1 leaves the right third of the first screen empty, and the editor frame is cut by the fold (`b-1440-light-first.png`).
- The step tabs use `role="tab"` without tab panels, and all four are in the Tab order.
- A CSS caret keeps blinking after it scrolls off screen (`afterScroll.running` in `raw/b-390-light.json`).

**Inspiration 9.** This is the best translation of both references:
- Astra's star field, which gathers into the next chapter's shape (https://openai.com/index/gpt-6-astra/ read 2026-10-02), becomes the Bayer field gathering into a selection frame, name flags, play, pages and a seam, a sphere and ruled rows, by tone mixing on one cell grid (`b-strip-field-glyphs.png`).
- Astra's honest captions and countdown tabs become "A staged sequence of 17 seconds" and a 2 px countdown rule on each step.
- Sol's Pause animation (https://openai.com/index/introducing-gpt-6-1-sol/ read 2026-10-02) becomes Pause Motion.
- LoveFrom's uneven typing rhythm becomes the line between a person (70 to 240 ms a key) and an agent (a constant 24 ms). The rhythm alone tells them apart, and it is the best single idea in the three notes.

**Features 8.** B has the broadest set: agents live in the terminal, Tailor, gestures that print the action each one writes, presence, presenter view with skip, export comparison, animated patterns and a ten row feature table with real menu paths. Three of them overstate what is shown:
- The people band shows presence that production's realtime rows have not passed (`research-product.md` 1).
- The loupe reports "0 of 196 pixels differ" while comparing one Chromium screenshot with itself (B section 5).
- The patterns band is the page's Bayer field standing in for the Paper shader, so the 17 patterns are not what a visitor sees.

**Brand 7.**
- Six loops: hero 17 s, people 14 s, gestures 7.6 s, show 4 s, fields 12 s and the pattern. Pause Motion covers them, but Kevin turned down the busy first dashboard pass (memory: dashboard deck grammar).
- Blue is drawn at rest in the autoplaying hero ring, chip and guides.
- The lead "The PowerPoint file matches the screen pixel for pixel" is contradicted by the 0.003% row under it (194 of 5,760,000 px differ, `facts.json` `export`).
- 516 words against 350, 7,898 px against 5,000, and two monospace panels.
- On the other side: Inter only, a ruled table, Heroicons in key cells, a clean reduced motion page (`b-1440-light-reduced-full.jpg`) and honest staged captions.

**Buildable 6.** The authors' estimate is 13 lane days over five lanes, which fills the window. The surface is wide:
- The terminal parser.
- Staged editor chrome that needs a visual parity check against `packages/chrome` on every ship (B risk 3).
- Build time export rasters through `export pptx --mode flatten --verify` and pdftocairo.
- `ShaderMount` with the spec test rewritten.
- The field engine with the field governor for phones.
- The people band held until realtime passes.
- Main thread with the hero running was 68 ms a second against the motion research's 60 ms ceiling (B section 6.2).
- The height and word rows both have to be rewritten.

## 5. Direction C, the playground (34)

**Craft 7.**
- The first screen is the most striking graphic of the three: the dithered Blue Marble with the h1 as the slide's title box (`page-1440-light-first.jpg`, `page-1440-dark-first.jpg`).
- The brand kit change mixes ground, words and field ink on one 500 ms smoothstep (`strip-hero-kit.jpg`), and Print This Deck prints the visitor's own deck (`print-deck.jpg`).
- Keyboard works (`kc.mjs`). The menubar uses a roving tabindex, ArrowRight to Tools, Enter and ArrowDown reach Tailor for a customer, and the dialog takes focus. The hero takes arrows, Alt+Right turns by 15 degrees, and Cmd+Z three times restores the h1. The present instrument pages to "The end of the show". The version slider takes Home.

Defects found:
- The agent ring stays axis aligned around a title the agent turned by 12 degrees, so the words run outside it and the subtitle crosses its edge (`judge-3/c-agents-typed.png`).
- The MCP answer prints raw floats such as `"x": 763.4885764499121`.
- At 390 the hero slide is wider than the column and opens scrolled sideways, so the visitor has to swipe to see it (`page-390-light-first.jpg`, C risk 8).
- The h1 carries `aria-label="Title: Build the pitch, ..."`, which changes the page heading's accessible name.
- Headings rise through a clip as each band enters (`strip-band-enter.jpg`), so type moves on scroll where A and B keep it still.

**Inspiration 7.** C translates the Moncler paper models (Dezeen 2024-09-24 through `research-lovefrom.md` 8): the page works as a small model of itself. OpenAI's Point becomes the selection frame that travels as the agent's ring (Wallpaper 2025-02-04 through `research-openai.md` 6). The develop, the signed last slide and the print still are taken well. LoveFrom's restraint and one subject per screen are the least present of the three: the hero carries a tool row of Undo, Redo, Reset, three kits and a colour field.

**Features 9.** C has the deepest real interaction:
- About 60 menu rows that change the deck, with Google's order and shortcut forms.
- The brand kit and a typed background colour.
- Tailor with the product's words, Skip slide, Search the menus, and a real `.txt` download.
- Present with full screen.
- An export seam that explains the two kinds of PowerPoint page honestly.
- An agent console with the real MCP tool names and HTTP paths.
- Version history with a slider, Play, Restore and Undo.

People are left out on purpose, which is the honest call. The menus lead says "Every row below changes the deck on this page", but by C's own count about a third of the rows answer with a sentence (C risk 9).

**Brand 6.**
- The dithered Blue Marble on the first screen needs Kevin's answer to question 5.
- The Globex kit draws navy over every slide on `/home`, where brand.md section 11 says the page draws no blue.
- Terminal errors use amber `#f0a020`, a colour outside paper, ink and the selection blue.
- Static annotations in the export seam are blue filled chips ("One picture, 1600 by 900", "Text box", "Picture"; `strip-export-seam.jpg`), so blue marks labels as well as live selection.
- The agents band's terminal is the largest monospace block of the three.
- The `cursor-arrow-rays` Heroicon on the Move row reads close to a sparkle burst.

**Buildable 5.** The authors' own estimate is about 5 pipeline days, over the three to four day window. C needs a second slide renderer (`slide-dom.ts`) with a parity test against `renderSlide` (C risk 2), a deck store with versions, a menus instrument generated from `model.ts` with its dialogs, and eleven agent commands in three transports. Page script is 77 KB minified (24 KB brotli), the largest of the three.

## 6. The winner and what to graft onto it

The landing to build is Direction A's page with these grafts. Each one keeps A's rules: no loop, blue only while something is worked on, a still under reduced motion and the first viewport final.

1. **From B: the person and agent typing rhythm.** In A's agents band, Version history and the agent's writes use B's two clocks: a person at 70 to 240 ms a key with longer gaps at spaces, and the agent at a constant 24 ms. The two authors read apart before any label does.
2. **From B: each gesture prints its action.** On A's mood slide, the end of each move, resize or turn writes the CLI line an agent would send (`slide to-canvas`, `block set <slide>#<block> /pos '{...}'`, `block rotate --to`) under the slide. The line goes on the band's ruled row with a polite live region, so monospace stays on the one `#101010` panel. This ties band 2 to band 4 and costs only text.
3. **From B: a staged caption on every staged part.** "A staged run of three commands. The answers are recorded from the CLI." goes under A's Run, in the manner of Astra's captions (`research-openai.md` 8).
4. **From B: one field gather, once.** One Bayer field gathers into the selection frame between the hero and the mood band (`b-strip-field-gather.png`), plays once at 35 percent in view with no drift loop, and is drawn gathered under reduce. It is abstract, so question 5 is unaffected. This gives A the graphic moment its first scroll lacks, at one canvas and no idle cost.
5. **From B: the opener field in the hero, optional.** The hero sheet carries the GT opener's abstract field, raising its tone from 0 over one beat after `load` (B's `b-strip-hero-field.png` without the drift). It answers "the best of graphic design" in the first screen, and the h1 stays the LCP.
6. **From B: menu paths in the parts table.** A's "Turboslide today" rows gain B's menu path column, read from `model.ts` at build (Tools > Tailor for a customer, Slide > Change theme, Insert > Animated pattern, File > Download, Slideshow > Presenter view). The Materials row becomes "Animated patterns".
7. **From C: the brand kit.** Three swatches over A's Northwind filmstrip set the theme's CSS variables on every slide at once on one 500 ms tone mix (C's `strip-hero-kit.jpg`). This is ranked feature 4 in `research-product.md` 6 and costs under 2 KB. Kevin has to rule on customer colours on `/home`: they are deck content, but brand.md section 11 forbids blue there, and a navy kit is blue.
8. **From C: the export seam explaining the two kinds of PowerPoint page.** "One picture, 1600 by 900" sits against "Text stays text" over the lighthouse slide, with a `role="slider"` handle, beside A's 0.003% row and its link. The labels are drawn in ink. This shows the export mechanism without B's 0 pixel loupe.
9. **From C: Print This Deck.** A's print still becomes the visitor's deck, one 16 by 9 page per slide.
10. **From C: CLI, MCP and HTTP tabs on A's panel,** showing the same write with the real tool name (`deck_tailor`, `deck_update_block`) and path (`POST /api/actions/deck.tailor`), which A's copy already names.
11. **From B: a skip link.**

Fixes A needs before or during the build:
- `aria-disabled` on Run, and focus kept inside the show (section 3).
- Height under 5,000 px at 1440, or the row raised on purpose.
- A landing fixture deck so the lighthouse plate says Turboslide's words.
- Inter preloaded in place of the opacity hold.
- Grafts 2 and 3 replace any hand written JSON with output recorded at build.

Not to take: B's six loops and its people band before production's realtime rows pass; B's loupe, until it compares two real rasters; B's "pixel for pixel" lead; C's second renderer; C's amber; blue chips on static labels; the dithered mood picture on the first screen until Kevin answers question 5.

## 7. Rulings Kevin owns

All three directions reverse the same three standing rules and say so: POLISH.md 3.2 "Nothing animates", POLISH.md 3.3 item 3 "no dither on the page", and brand.md section 11 "/home draws no blue" (here blue is the live selection only). The grafts add:
- Customer kit colours on `/home` (graft 7).
- The hero's abstract field (graft 5).

The prerequisites stand for every direction:
- The entry chunk split of `audit-performance.md` item 1 (1,176,073 bytes decoded on every route).
- The Inter subset of item 10.

Without them no direction can pass `decks.home.load-budget` on the product, however small its own script.

## 8. Files

- This note: `docs/gslides-parity/landing/judge-3.md`.
- Probes: `docs/gslides-parity/landing/judge-3/audit.mjs`, `ka.mjs`, `ka2.mjs`, `kb.mjs`, `kc.mjs`, `lcp.mjs`. They write pictures to the session scratchpad; the copies are listed below.
- Raw readings: `docs/gslides-parity/landing/judge-3/raw/*.json` (12 audit runs).
- Pictures, PNG under 400 KB each:

| File | What it shows |
| --- | --- |
| `judge-3/a-key-focus.png` | A's hero title reached by Tab, with the editor's selection |
| `judge-3/a-show.png` | A's show after three Tabs: focus has left the dialog and sits in the footer |
| `judge-3/b-typed.png` | B's terminal after typed `tailor`, `slide new`, an unknown command and `help`, with JSON broken mid-token |
| `judge-3/b-gesture-keys.png` | B's gesture slide after arrow keys, with the printed actions |
| `judge-3/c-agents-typed.png` | C's agent ring axis aligned around a turned title, and the MCP answer's raw floats |
| `judge-3/c-menus-tailor.png` | C's Tailor for a customer opened from Tools by keyboard |
