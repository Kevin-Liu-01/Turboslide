# Direction C: the playground

Landing designer C's note for the landing workflow. Kevin wrote on 2026-10-02: "make the landing much better inspired off of lovefrom and openai brand and make the landing much more interactive and showing off features featuring the best of graphic and motion design". Direction C answers the "interactive" and "showing off features" parts most literally: the landing is a working deck, and the visitor edits it.

Written 2026-10-02 from 16:34 to 17:50 PDT in the worktree `/Users/kevinliu/repos/Turboslide-landing` on `landing/redesign` at `2108dad4`. Nothing outside `docs/gslides-parity/landing/` was written; no product source was edited, no git write command ran, nothing was pushed or deployed, no other worktree was opened, and no dev server was started (the prototype is a static page). Prototemplate was read only. The machine's one minute load stayed between 41 and 225 during the work (three pipelines in other worktrees); every Playwright run was one short page at a time, and the timing numbers below carry the load they ran at.

- Prototype: `docs/gslides-parity/landing/direction-c/index.html`, with `landing.css`, `landing.js`, `tones.js` and `fonts/inter-subset.css` beside it. It opens from `file://` and fetches nothing at run time.
- Pictures: `docs/gslides-parity/landing/direction-c/shots/` (section 10).
- Harness: the Playwright and compositing scripts ran from the session scratchpad and are not in the tree.

## 1. The idea

The first screen is a slide, and the slide is live. The page's h1, "Build the pitch, present it and send the link", is the title text box of that slide, drawn in the GT deck's grammar over the Blue Marble printed through the product's 8 by 8 Bayer screen. The visitor can select it, drag it, resize it, rotate it, double click and type into it, and restyle the whole deck with a brand kit, with the product's selection grammar and the product's sentence ("The first drag turns the slide into a canvas. Undo puts the layout back"). Below it, every section is a small working instrument for one feature, and all of them hold the same five slide deck: the menus band is the editor in miniature with Google's nine menus that really change the deck; the present band runs the show with a timer, notes and the next slide; the export band lays a seam over a slide so the visitor can drag between "one picture per slide" and "text stays text"; the agents band is a command line whose real CLI forms change the slide above it; and Version history, at the end, lists every change the visitor and the agent made, by author, with a slider, Play, Restore and Undo. Nothing is saved and nothing leaves the tab. The page is the product's argument made by the product's own gestures: one deck, edited by a person, by the menus and by an agent, then presented and printed, with every change named.

## 2. The sections in order, with their copy

The copy follows the page's rules: sentence case headings with no trailing period, Title Case on buttons, short declarative sentences, no em dash, no exclamation mark, none of the words `copy.ts` refuses. The figures are `packages/theme/brand/facts.json` (written 2026-09-29) and are written into the prototype by value, with a comment naming the file; the product reads them through `HomeFacts`.

### 2.0 Navigation (58 px, the seam under it)

The 24 px mark and "Turboslide" (a link to the top), Documentation, the appearance group Light and Dark (`aria-pressed`, written to `gt-theme` before first paint, as `HomeNav.tsx` does), the 64 px Sign In slot (empty here), New Presentation (solid). Two rows under 720 px, as on the branch.

### 2.1 Hero: the playground slide

- Tool row: Undo, Redo (Heroicons `arrow-uturn-left` and `arrow-uturn-right` from `packages/chrome/src/icons.tsx`), Reset; "Brand kit" with three kits, GT, Kestrel and Globex, each a swatch of its ground and ink; a Background field ("#0b1d3a" as the placeholder) that previews as you type and applies on Enter, the product's behaviour in the drive of `research-product.md` 5.4.
- The slide (1600 by 900 units, drawn at the column's 1024 px): the deck's rails and crosses, the Blue Marble field, and the plate lower right holding the title, "This slide runs in the page. Nothing you change here is saved." and "Image: NASA, Reto Stöckli, 2007, public domain". The wordmark (the mark at 18 units, titanium) bottom left, the counter bottom right.
- Status row under the slide: "Click the title to select it. Double click to type." (on a touch screen: "Tap the title to select it, then drag it. Swipe the slide sideways to see all of it."), and on the right the selection readout in tabular figures, for example "Title · x 789 · y 362 · 0°".
- Under it, two columns. Left: "Turboslide is a slides editor in the browser. It has Google Slides' menus and shortcuts. No account is needed." (the one `SITE.description`), New Presentation, Open the Example Deck. Right, three ruled rows with Heroicons in the key cells:
  - Move: "Drag, resize or rotate the title. The first drag turns the slide into a canvas."
  - Type: "Double click a text box to type in it. The title of this slide is the heading of this page."
  - Restyle: "A brand kit sets the colours of every slide at once. Type a colour to try your own."

Sentences the hero says as the visitor works: "Drag to move it. The squares resize it and the circle turns it. Double click to type." / "The slide is a canvas now. Undo puts the layout back." (with an Undo link) / "The heading changed here and in every instrument below. They all show this deck." / "The Globex kit set the colours of all 5 slides." / "The background of every slide is #3d2b1f now." / "The deck is back where it started."

### 2.2 The numbers row (still on purpose), then the hatch strip

"22 layouts" / "A new slide starts from one of these layouts." · "193 actions" / "Agents run the same actions as the editor over the CLI, MCP and HTTP." · "0.003%" (a link to `docs/pptx.md`) / "The worst page of the example PowerPoint export differs from the screen by this share." These are today's branch strings.

### 2.3 The menus are Google's

- Lead: "File, Edit, View, Insert, Format, Slide, Arrange, Tools and Help are in Google's order, with Google's shortcuts. Every row below changes the deck on this page."
- Instrument: the editor in miniature. A title row (the mark, the deck's name "Pitch for Kestrel", "5 slides", Search the menus, Slideshow), the menu bar, the filmstrip, the stage on the workspace plate (opened on slide 2, the plan), an optional speaker notes field, and a status row ("Open a menu and choose a row. Undo puts the deck back.").
- The rows are the product's top level rows in Google's order with Google's shortcut forms (symbols on a Mac, words elsewhere, as `menus/keys.ts` prints them). Rows that change the deck: Download > PDF document (prints the deck), Download > Plain text (downloads a real `.txt`), Rename, Version history > Name current version and See version history, Print; Undo, Redo, Cut, Copy, Paste, Delete, Duplicate, Find and replace; Slideshow, Grid view, Show speaker notes, Show filmstrip, Full screen; Text box, Shape > Rectangle and Oval, Table, New slide; Text > Bold and Underline, Align & indent > Left, Center and Right, Clear formatting; New slide, Duplicate slide, Delete slide, Skip slide (Unskip slide when skipped), Move slide, Change background, Change theme; Order, Align, Center on page, Rotate; Tailor for a customer; Search the menus, Keyboard shortcuts. Audio, Video and Transition are drawn disabled with the product's own reason. The remaining rows say what they do in the editor in one sentence, for example "Share opens the Share dialog. People and links sit in ruled rows."
- Tools > Tailor for a customer uses the product's words from `packages/chrome/src/panels/assist-strings.ts`: the title, the lead "Rename the customer, swap the pictures named after the old one and skip the slides they should not see, as one change", Replace and With, the live count ("4 places on 2 slides") and the result "Tailored for Globex: 4 places on 2 slides" with Undo.

### 2.4 Present from the browser

- Lead: "Slideshow starts on the current slide. Presenter view keeps the timer, the notes and the next slide beside it. Skipped slides leave the show."
- Instrument: Present (solid) and Full Screen, then "The arrow keys change the slide. Esc ends the show."; the audience screen on black and the presenter column (Timer, Next slide, Notes, previous and next, "Slide 2 of 4, 1 skipped"). The show ends on "The end of the show. Escape closes it."

### 2.5 Export to PDF and PowerPoint

- Lead: "File > Download writes a PDF or a PowerPoint file. Drag the seam to see what each kind of PowerPoint file holds."
- Instrument: the lighthouse slide drawn twice under a seam. Left of the seam, "One picture, 1600 by 900"; right of it, each text box outlined ("Text box") and the picture marked ("Picture"). Labels under it: Picture pages, Editable text.
- Ruled rows: Picture pages: "Each slide is one picture of the screen. On the example deck the worst page differs from the screen by 0.003%." Editable text: "Text boxes stay text boxes. PowerPoint sets the words with its own type engine." PDF: "Each slide is one page. Print This Deck makes a PDF of the slides on this page." Then Print This Deck.

### 2.6 Agents run the same actions

- Lead: "Every editor action is a command. Agents run the same 193 actions over the CLI, MCP and HTTP. The commands below change the slide above them."
- Instrument: the slide the last command touched, with the agent's ring and its chip "Pitch agent"; three ruled rows, Last write ("None yet. Press a command below or type one."), Author ("Pitch agent, an agent token on this deck."), History ("Each write is a version of its own. Undo takes it back."); then the `#101010` panel, the one monospace on the page: tabs CLI, MCP and HTTP, the note "This page runs eleven of the commands. The CLI runs all 193.", the output log, the prompt `$ turboslide`, and seven commands to press, each with a plain sentence: `slide get title` (Reads slide 1 as JSON), `tailor --replace "Kestrel=Globex"` (Renames the customer on every slide), `block rotate title#h --to 8`, `slide background title --color "#0b1d3a"`, `block set title#h /text "Present it and send the link"`, `slide skip mood`, `version list`. Typed commands work too, with Up to recall and Tab to complete; `help` lists the eleven; anything else answers "turboslide: this page does not run ... Type help for the eleven it runs."

### 2.7 Every change has an author

- Lead: "Version history names each change by person or by agent. Drag the slider to see the deck at any version. Restore brings it back, and Undo returns."
- Instrument: the slide at the chosen version, the scrubber (Play, the slider with a tick per version, ink ticks for the visitor's, Restore This Version), a caption ("Slide 3 at 5:16 PM, by Maya Chen."), and the ruled list, newest first: an author chip (initials for a person, "You" filled in ink, the `command-line` Heroicon for an agent), the change, the author line ("Pitch agent, an agent, through MCP. The Blue Marble on slide 1 and the lighthouse on slide 4") and the time ("Current" on the newest). The deck arrives with five seeded versions (Maya Chen made it, the Pitch agent inserted two pictures over MCP, Sam Ortiz wrote the title, the Assistant added the numbers slide, Maya Chen wrote the speaker notes); every change on the page joins them.

### 2.8 Free under the MIT license, then the footer

"Run it from a checkout or deploy it to Vercel. The code is on GitHub." and GitHub, beside the mark at 220 px drawn from its seven pieces. Footer: the lockup, New presentation, Your presentations, Documentation, GitHub, License, and "Turboslide is made by General Translation. Google Slides is a product of Google LLC."

### 2.9 The deck the page holds

Five slides in the GT deck's grammar: 1 the cover (Blue Marble, the h1, the plate); 2 "The plan for Kestrel" (ruled rows, Week 1 to Week 3); 3 "193" over "Actions for Kestrel and its agents"; 4 "Louisbourg lighthouse" (the mood slide with its plate and "Photograph: Ken Heaton, CC BY-SA 4.0"); 5 the mark, "Made in Turboslide", "Set in Inter." (LoveFrom's "sign the work on the work"). Each has a line of speaker notes. Each instrument opens on its own slide so the page shows the whole deck: the hero on 1, the menus on 2, Present on 1, Export on 4, the agent on 1, Version history on 3.

Copy count: 410 words in headings, leads, rows, the numbers, the plate sentence and the footer (the branch holds 344); the instruments' interface labels come on top. Page height 6,544 px at 1440 and 7,947 at 390.

## 3. The interactions

Every one of these works in the prototype and was driven by Playwright (section 10 lists the strips).

| Where | Gesture | What happens |
| --- | --- | --- |
| Hero slide | Click or tap an object; Tab reaches each object | The 1 px ring in `#2f5ce0`, the chip naming it ("Title", "Text", "Credit"), eight 11 px squares on paper with a blue ring, the 12 px rotation ring on a 13.5 px stem (the values of `packages/chrome/src/Overlay.css`); the readout |
| Hero slide | Drag | Follows the pointer 1:1. Snaps to the sheet's centre lines and the content margins with a 1 px guide; Alt suspends snapping. The first move measures the layout and turns the slide into a canvas: one change, one Undo |
| Hero slide | Drag a square | Resizes in the object's own axes, rotated or not, keeping the opposite edge |
| Hero slide | Drag the ring | Rotates; Shift turns in 15 degree steps; the readout shows the angle |
| Hero slide | Double click, or Enter on a focused object | Types in place (`contenteditable="plaintext-only"`, the caret in `#2f5ce0`); every keystroke reaches every view of the deck below; Enter or Escape finishes and writes one version |
| Hero slide | Arrow keys, Shift for 40 units; Alt plus Left or Right | Nudge, rotate by 15 degrees; held keys coalesce into one version |
| Hero tools and keys | Undo, Redo, Reset; Cmd or Ctrl Z, Shift Z, Y | The store's snapshots; Reset returns to the seed deck and its five versions |
| Hero tools | GT, Kestrel, Globex; Background field | Six colour roles change on every slide, the ground, the words and the field's ink on one curve; the field previews while typing and applies on Enter, Escape or leaving the field puts it back |
| Phone hero | Tap, then drag; swipe the slide sideways | The slide keeps a 560 px reading size and opens on the plate; the first tap selects, the next touch drags, so a swipe over the slide still scrolls |
| Menus | Click a title; hover while open; Left, Right, Up, Down, Enter, Escape, Tab | Google's menu behaviour: plates, submenus, the keyboard path; under 720 px one Menus key lists the nine menus and drills in |
| Menus | The rows of 2.3; the editor's shortcuts while focus is inside it (Cmd Z, Cmd Shift Z, Cmd D, Ctrl M, Cmd B, Cmd U, Cmd Shift L, E, R, Cmd X, C, V, Cmd Enter, Cmd /, Option /) | They change the deck; dialogs for Tailor, Find and replace, Search the menus, Rename, Name current version |
| Menus | Filmstrip, Grid view, speaker notes | Choose a slide; the notes field writes the notes Presenter view shows |
| Present | Present, Full Screen, a click on the screen, the arrow keys, Space, Page Down, Home, End, Escape | The show in place or in full screen (the Fullscreen API on the audience screen), the timer, the next slide, the notes; skipped slides leave the show |
| Export | Drag the seam anywhere on the slide; the handle is a `role="slider"` with arrows, Page Up, Page Down, Home, End | The two kinds of PowerPoint page under one seam |
| Export | Print This Deck; the browser's own Print | The page's print stylesheet prints the visitor's deck, one 16 by 9 page per slide (`shots/print-deck.jpg`) |
| Agents | Press a command; type one; Up and Down; Tab; CLI, MCP, HTTP | The command runs against the deck, prints its echo in the chosen transport (`tools/call` JSON with the real tool name, or `POST /api/actions/...` with the real path) and its JSON, writes a version authored by the agent, and the ring travels to the change |
| Version history | The slider; a row; Play and Stop; Restore This Version; Undo | The deck at any version; Play steps through all of them; Restore writes a version; Undo in its caption or anywhere returns |
| Footer | The lockup | Goes to the top with no smoothing |

## 4. The motion table

The same table heads `landing.css`; every duration is a token there and every token is 0 ms under `prefers-reduced-motion: reduce`.

| What moves | Duration | Easing | Trigger |
| --- | --- | --- | --- |
| Hover ground, button colour | 120 ms | ease-out | pointer over, focus |
| Press on a Title Case button | 120 ms, scale 0.98 | ease-out | `:active` |
| Selection ring and handles appear | 120 ms opacity | ease-out | a click on an object |
| Menu plate and submenu | 160 ms, 4 px rise | arrive | click, hover while open, keys |
| Status sentence, agent output rows, new version rows | 160 ms, 6 px rise | arrive | after an action |
| Drag, resize, rotate, seam drag | none, 1:1 with the pointer | none | pointer; no inertia, no spring |
| Keyboard nudge, undo, redo, slide changes in the show | none, a cut | none | keys and clicks |
| Hero field develops | 1500 ms, cells switch in Bayer order | tone (smoothstep) | after `load` and one idle callback, capped at 1500 ms; once |
| Brand kit change | 500 ms, ground, words and field ink together | tone (smoothstep) | a kit or an entered colour |
| Band seam draws out of its cross | 600 ms | arrive | the band 20 percent in view, once |
| Heading rises through its clip | 600 ms | arrive | the same, at 0 ms |
| Lead, rows and instrument rise 16 px | 620 ms, 55 ms apart, from 500 ms | arrive | the same |
| Export seam shows it moves | 600 ms, 82 to 50 percent | move | the export band in view, once, 1100 ms after it enters |
| Agent ring travels to the change | 300 ms plus half a millisecond per pixel, 300 to 700 ms | move | a command runs |
| Version Play | one version per 900 ms, cuts | linear progress line | Play; any touch of the slider stops it |
| Presenter timer | 1 s steps | linear (a process) | Present |
| Mark sting | 600 ms per piece, 70 ms apart, after 300 ms, seven pieces | arrive | the license band in view, once |
| Light and Dark | none, a cut | none | the appearance buttons |

Easings: arrive `cubic-bezier(0.16, 1, 0.3, 1)` (expo.out), arrive soft `cubic-bezier(0.25, 1, 0.5, 1)` (power3.out), move `cubic-bezier(0.65, 0, 0.35, 1)` (power2.inOut), tone `cubic-bezier(0.333, 0, 0.667, 1)` (smoothstep), process linear: the curves of `research-motion.md` 4.3, which come from Prototemplate `motion/MOTION.md`. No bounce, overshoot, blur, shadow, smooth scrolling, scroll capture or inertia; nothing loops on its own, so no Pause Motion control is needed (the timer and Play run only after a press). The first viewport paints final: the h1 is text from the first frame and the LCP element; only the field develops, after load. A band below the fold is armed by script, so a page without script, a crawler and a reduced motion reader get the final markup; a band never replays when scrolled back to. A view that turns to another slide cuts; only a kit change on the same slide mixes.

Reduced motion: the field is drawn at its final tone at once, no band arms, the kit change, the seam and the ring cut, the mark stands still (`shots/strip-reduced-motion.jpg`; `document.getAnimations()` held one zero length animation in that run). The interactions all still work.

## 5. What is live product code and what is staged

No JavaScript module of the product runs in the prototype; it is a static page. What it carries from the product, by value:

- The 8 by 8 Bayer permutation and threshold rule of `packages/effects/src/bayer.ts`, ported line for line; one buffer pixel per 2 px cell, upscaled by CSS with `image-rendering: pixelated` (the deck's `--ts-cell: 2px`).
- The pictures: tone grids recovered from the GT deck's own two tone files `decks/gt-brand/assets/mood-earth-light.jpg` and `mood-lighthouse-light.jpg` (averaged per 2 px cell, blurred by 1.1 cells, 640 by 360 grayscale JPEG, 21,006 and 29,555 bytes), screened again at the size each view draws. Credits as the deck gives them.
- Inter: `packages/fonts/assets/InterVariable.woff2` subset with fontTools to Latin, the copy's punctuation and the menu key glyphs, both axes kept (61,128 bytes against 352,240), and the product's metric matched `Inter Fallback` face byte for byte from `packages/fonts/src/inter.css`.
- The mark: `packages/theme/brand/mark.svg` (the seven pieces, the sting draws them) and `mark-24.svg` (the nav, the slide wordmark).
- Tokens: `packages/chrome/src/tokens.css` and `brand.css` by value under the same names (paper, ink, hairlines, the `#101010` panel, `#2f5ce0`, the type ladder, the 1104 px column, the 58 px bar, the 9 px cross).
- The selection grammar of `packages/chrome/src/Overlay.css`: ring, chip, squares, rotation ring and stem.
- Heroicons 20 solid from `packages/theme/assets/sprite.svg` and `packages/chrome/src/icons.tsx`.
- Menu labels, order and shortcuts from `packages/chrome/src/menus/model.ts`, displayed the way `menus/keys.ts` prints them; the disabled rows' reasons.
- The Tailor words from `packages/chrome/src/panels/assist-strings.ts` (`TAILOR.lead`, `count`, `done`).
- The CLI usage forms from `packages/agent/generated/cli.json`, the MCP tool names and argument names from `mcp-tools.json` (`deck_get_slide`, `deck_tailor` with `replacements`, `deck_rotate_block`, `deck_update_block` with a JSON pointer `path`, `deck_set_slide_background`, `deck_skip_slide`, `deck_new_slide`, `deck_version_list`, `deck_version_restore`, `deck_replace_text`), the HTTP paths from `openapi.json` (`/api/actions/text.replaceAll`, `deck.tailor`, `block.rotate`, `block.set`, `slide.setBackground`, `slide.skip`, `slide.new`, `slide.get`, `version.list`, `version.restore`).
- The shape of `turboslide slide get` (recorded from the worktree's CLI against `decks/gt-brand` on 2026-10-02, read only) and the `turboslide --version` banner (`product/cli-version.txt`, the checkout line left out).
- The facts of the numbers row and the leads (`facts.json`).
- The slide grammar of Prototemplate `deck/DECK-GRAMMAR.md` and `parts/head.html` (rails at 56, crosses, the plate at 22, 26 and 20 units of padding, h1 88, h2 44, p 22, credit 15, rows 20).

Staged, and named as staged here:

- The slide renderer: a port of the deck grammar for five slide kinds, in units of the slide's own width (`--u: calc(100cqw / 1600)`), not `packages/render`.
- The JSON a write command prints (`{ "ok": true, "author": "agent:pitch-agent", "action": ..., ... }`): the shape is invented; only `slide get` is recorded.
- The five seeded versions and their authors (Maya Chen, Sam Ortiz, the Pitch agent, the Assistant). Version history lists one row per change; the product groups by 15 minute windows (`packages/chrome/src/versions-model.ts`).
- The Kestrel and Globex kits (Globex's `#0b1d3a` and `#f4f1ea` are the product drive's values, `research-product.md` 5.4) and the colour derivation of a typed background.
- The one sentence notes on the menu rows the page does not run; the presenter view drawn in place beside the audience (the product's is a second window).

## 6. The budget

### 6.1 Weight

Every byte the page loads, five files and no other request:

| File | Raw | gzip -9 | brotli 11 | What it holds |
| --- | ---: | ---: | ---: | --- |
| `index.html` | 33,073 | 8,554 | 7,200 | the markup, the static hero slide, the Heroicons sprite (10,568) |
| `landing.css` | 49,898 | 10,714 | 9,258 | 33,219 raw and 6,533 brotli minified; most of the raw size is comments |
| `fonts/inter-subset.css` | 82,498 | 62,513 | 61,670 | the 61,128 byte woff2 as a data URI (a page on `file://` may not fetch a font) and the fallback face |
| `landing.js` | 126,395 | 35,002 | 29,867 | 77,105 raw and 23,946 brotli minified with the tree's esbuild 0.28.1 |
| `tones.js` | 68,038 | 49,578 | 49,101 | the two tone JPEGs (50,561 bytes) as data URIs |
| Total | 359,902 | 166,361 | 157,096 | |

`fonts/InterVariable-subset.woff2` (61,128 bytes) sits beside the stylesheet as the file the product would serve; the prototype does not request it.

Against the `/home` budgets (`research-current.md` 6.2): fonts 61 KB against 120 KB; images before the first scroll 21 KB (the earth tone; the lighthouse is 30 KB more) against 300 KB at either device scale, since the field is drawn, not shipped; the page's own script 77 KB decoded, minified. The product's shared entry chunk (1,176,073 bytes decoded) is not in the prototype and is the reason the product `/home` is already over its 600 KB script budget; this direction needs the entry split of `audit-performance.md` item 1 first (section 8).

### 6.2 Main thread and paint, first screen

`perf.mjs` from the scratchpad: fresh context, Chromium from the worktree's `playwright-core`, `file://`, light, device scale 1, metrics from the DevTools protocol 3.2 s after `load` (so they include the 1.5 s develop), LCP and CLS from `PerformanceObserver`. Medians.

| Reading | When (PDT) and load | FCP | LCP (element) | Load event | Script | All tasks | Layout | Style | Long tasks | One field frame |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| 1440 by 900, 5 runs | 17:36, 64.6 to 66.5 | 20 ms | 56 ms (h1) | 57 ms | 99 ms | 191 ms | 21 ms | 11 ms | none | 0.36 ms |
| 390 by 844, 3 runs | 17:36, 62.8 to 64.2 | 40 ms | 68 ms (the lead) | 65 ms | 50 ms | 134 ms | 21 ms | 11 ms | none | 0.13 ms |
| 1440 by 900, CPU 4x, 3 runs | 17:36, 60.1 to 60.9 | 148 ms | 288 ms (h1) | 303 ms | 377 ms | 812 ms | 130 ms | 60 ms | 73 to 82 ms, and 51 to 55 ms | 1.58 ms |

Phases (`performance.measure` marks in the script, 17:37): at 1x the script starts at 39 ms, the hero is drawn and live 14.1 ms later, and the menus instrument (inside the 800 px mount margin at 1440) mounts in 10.5 ms; at 4x the hero takes 60.8 ms in one 69 ms task and the menus mount 35.3 ms. A field frame at the hero's 512 by 288 cells costs 0.36 ms (1.58 ms at 4x), so the 1500 ms develop is about 90 frames and 32 ms of main thread in total. CLS is 0 at 1440 and 390 over the load and a full scroll (`cls.mjs`, after the metric matched fallback face replaced a font swap that measured 0.0001 to 0.0018, and a touch sentence moved into CSS that measured 0.0055 at 390). Idle main thread after the develop: 0, nothing runs until the visitor acts.

These numbers ran on a machine at a load of 60 to 66 and are upper bounds; the file is served from disk, so they say nothing about the network.

## 7. LoveFrom's and OpenAI's craft, in Turboslide's grammar

Every claim about a site below is from the researchers' notes, which read the sites on 2026-10-02 and cite each file.

- The made thing is the page. LoveFrom's home shows no work, only its word being typed and the comma made in front of the reader (https://www.lovefrom.com/, read 2026-10-02; `research-lovefrom.md` sections 7 and 8). Here the made thing is a slide built and then handed over: the field develops through the Bayer screen once (LoveFrom's Polaroid that develops over seconds on long curves, https://book.stevejobsarchive.com/, read 2026-10-02, `research-lovefrom.md` 4c, translated into the deck's tone mix), and the heading the visitor reads is the text box they can move.
- Explain a mechanism with a small working model of itself (LoveFrom's Moncler paper models, Dezeen 2024-09-24, read 2026-10-02 through a search summary, `research-lovefrom.md` 8). Each band is that model: the menus band is the editor, the export band is the two kinds of PowerPoint page under a seam, the agents band is the command line.
- Sign the work on the work ("Designed by LoveFrom", "Typeset in LoveFrom Serif" on the book's credits page, https://book.stevejobsarchive.com/, read 2026-10-02). The deck's last slide reads "Made in Turboslide" and "Set in Inter.", and the license band draws the mark from its pieces.
- A defined still for print (lovefrom.com's print stylesheet, `research-lovefrom.md` 1). Printing this page prints the visitor's deck, one slide per page.
- One weight, hierarchy by size and place, two values with half ink for hover (`research-lovefrom.md` 10 rules 9 and 10). Inter at weight 500 on every heading, paper and ink, the hairlines, one interface colour.
- What LoveFrom does that this direction refuses: page scroll off, wheel and drag springs, overshoot, ignoring reduced motion, blocking zoom and selection, a mascot (`research-lovefrom.md` 9). Drags here follow the pointer with no inertia; nothing bounces; reduced motion is honoured; the page scrolls natively.
- The working product in the first screen with one real input (openai.com's composer, https://openai.com/, read 2026-10-02, `research-openai.md` 4 and 10 rule 1). Here the input is a slide.
- A title present at first paint that never waits for imagery (Astra's title waits for its canvas and stayed black at 390 in the capture, https://openai.com/index/gpt-6-astra/, read 2026-10-02, `research-openai.md` 9). The h1 is the LCP at 56 ms; the field develops after `load`.
- Working viewers of real output (Astra's two slide viewers with previous, next and a counter, `research-openai.md` 4 item 2). Present and Version history are viewers of the visitor's own deck.
- The cursor as the brand's central figure (the Point, Wallpaper 2025-02-04, read 2026-10-02, `research-openai.md` 6), translated as idea 2 of `research-openai.md` 11: Turboslide's selection frame is its point; it settles on the hero's title and travels, as the agent's ring, to whatever a command changed.
- Arrivals on one long settle curve, short ordered staggers, nothing that moves with scroll, loops none (`research-openai.md` 7 and 10 rules 5 and 6); captions that say what the reader sees (rule 12): the agent rows name the write, the author and the transport, and the terminal says it runs eleven of the 193 actions.
- At phone width, interface crops keep their reading size and run past the edge (Codex, https://openai.com/codex/, read 2026-10-02, `research-openai.md` 4 item 4). The phone hero keeps the slide at 560 px and opens on the plate.
- What OpenAI does that this direction refuses: the date and tags line above a title (an eyebrow), em dashes in copy, auto advancing tabs (`research-openai.md` 9 and 8).
- The motion system is `research-motion.md` section 4 (Prototemplate `motion/MOTION.md` and `deck/slides/38-motion.html`): the 0.5 s beat, the 600 ms line draw out of a cross, the 620 ms 16 px rise 55 ms apart, the tone mix for anything dithered, a once only entrance armed by script, the critically damped spring refused in favour of no inertia at all.

## 8. What it would take in the product

The direction keeps `/home` prerendered: the first paint is final HTML, and each instrument mounts after `load` when its band nears the viewport.

### 8.1 Files

- `apps/studio/src/routes/home.tsx`, `home.css`: the new composition and the motion tokens of section 4; `home-meta.ts` unchanged.
- `apps/studio/src/components/home/`:
  - `home-deck.json` (the five slide fixture; or `decks/home/` so the CLI can run against it) and `deck-store.ts` (the store, snapshots, versions, undo; pure, unit tested).
  - `slide-dom.ts`: the client renderer for the fixture's kinds, with a parity test against `packages/render`'s `renderSlide` output at build (box geometry per block within 1 unit, and a pixel diff through the verify loop's DSSIM). The first paint of every slide is `renderSlide`'s own HTML, rendered at build by `scripts/build-home-assets.ts` and inlined with `sheet.css` (8.4 KB gzip, `research-product.md` 2.2).
  - `field.ts`: the canvas field on `BAYER8_THRESHOLDS` imported from `@turboslide/effects/bayer` (534 bytes gzip, `research-product.md` 2.2), tone grids written at build from the deck's two tone assets.
  - `Playground.tsx` (hero editor, the selection overlay reusing `Overlay.css`'s classes), `MenusInstrument.tsx`, `PresentInstrument.tsx`, `ExportSeam.tsx`, `AgentConsole.tsx`, `VersionsInstrument.tsx`, `home-motion.ts` (the one band observer and the timelines), each a lazily imported chunk keyed on its band.
  - `copy.ts` and `copy.test.ts`: the strings of section 2 under the existing lint; `facts.ts` for every count.
- Build data: a `scripts/build-home-assets.ts --menus` step that reads `packages/chrome/src/menus/model.ts` and writes the nine menus' rows, keys (through `keys.ts`), default view filter and each row's `doc` sentence into a JSON the menus instrument loads, so the page can never drift from the editor's menus; a `--record-cli` step that runs the seven example commands against the fixture in a tmp store and records their real JSON, so the agent console prints recorded output and computes only typed variants in the recorded shape.
- `packages/fonts`: a `/home` subset (the 61 KB one here) with the full face loaded on the first edit, so typed text outside Latin-1 renders in Inter.
- Tests: `apps/studio/e2e/home-page.spec.ts` rewritten on purpose for the rules of `research-current.md` 5.7 (motion rules, the ShaderMount test kept, page height, words), and new rows for each instrument: the first drag converts and one Undo restores, the kit reaches every slide, every wired menu row changes the deck, Present skips skipped slides, the seam's keyboard, each agent command and its version row, Restore and Undo, reduced motion final frames, CLS 0 at 1440 and 390 in both appearances, and the load budget.

### 8.2 Size

About 5 pipeline days with five lanes, roughly 9 lane days: the store, the client renderer with its parity test and the field (2 lane days); the hero editor (1.5); the menus instrument generated from the model, with its dialogs (1.5); Present, the export seam and print (1); the agent console with recorded outputs and Version history (1.5); motion, reduced motion, phone layout, copy and the spec rewrite (1); integration, captures and a verifier pass (1, partly serial). The prerequisite is the entry chunk split of `audit-performance.md` item 1, its own round, because the product `/home` decodes 1,235 KB of script today against a 600 KB budget.

## 9. Risks

1. Script budget. The product `/home` is 635 KB over its decoded script budget before this direction adds about 77 KB of minified page script; without the entry split the page gets heavier, not lighter.
2. Two renderers. The page draws slides with its own small renderer so it can re-render edits without shipping `renderSlide` (173 KB gzip). If the parity test is not built, the landing's slides will drift from the product's.
3. Staged output read as fact. The write commands' JSON and the seeded versions are invented here; shipping them would misstate the product. The build must record the CLI's real output.
4. The heading is editable. A visitor can rewrite, rotate or drag the page's h1 in their own tab. Crawlers and screen readers get the prerendered sentence, and nothing persists, but it is an unusual h1 and Kevin should decide it.
5. Brand rulings this direction asks for: the dithered Blue Marble on the first screen (`docs/NEXT.md` question 5 is Kevin's; POLISH.md 3.3 says no dither on the page); customer kit colours (Globex navy) drawn on `/home` when the visitor picks them, where `docs/brand.md` section 11 says `/home` draws no blue; guides drawn in the selection blue, where the editor draws them in `--pt-guide` magenta; the press scale on buttons, which the chrome does not use.
6. Words and length. 410 words of copy against the 350 row, plus the instruments' labels; 6,544 px at 1440 against the 5,000 px row (7,947 at 390 is under 8,500). Both rows need rewriting with a reason, or the copy cut.
7. Long task at 4x CPU. Startup is one 69 ms task at 4x (script evaluation plus the hero), over the 50 ms line and under the 100 ms long animation frame budget; the lazily imported instrument chunks of 8.1 fix it.
8. Touch. The first tap selects and the next touch drags, so a swipe still scrolls; it has to be learned, and the phone hero scrolls sideways inside the column, which some visitors will miss despite the sentence.
9. Menus that only describe. About a third of the rows answer with a sentence about the editor. If they read as a fake, the band should list only the rows the page runs, generated from the model.
10. Full screen on iPhone. Safari on iPhone has no element full screen; Full Screen must hide there.
11. Realtime and two people are not shown, on purpose: the production table was not green when `research-product.md` was written.
12. Fonts. The `/home` subset covers Latin-1; a visitor typing beyond it sees the fallback until the full face loads.
13. Timing numbers are upper bounds from a loaded machine.

## 10. Pictures

All under `/Users/kevinliu/repos/Turboslide-landing/docs/gslides-parity/landing/direction-c/shots/`, each under 400 KB. Strip times are real elapsed time where marked "real time" and seeked animation time where marked "seeked" (every Web Animation, CSS transition and transition of a registered colour paused and set to that time).

| File | What it shows |
| --- | --- |
| `page-1440-light-first.jpg`, `page-1440-dark-first.jpg` | The first screen at 1440 by 900 after the field has developed |
| `page-1440-light-full.png`, `page-1440-dark-full.png` | The whole page at 1440 (6,544 px, scaled to 1200 wide, 32 colours) |
| `page-390-light-first.jpg`, `page-390-dark-first.jpg` | The first screen at 390 by 844 with touch: two row bar, the slide opened on the plate |
| `page-390-light-full.jpg`, `page-390-dark-full.jpg` | The whole page at 390 |
| `page-1440-light-reduced-first.jpg` | The first screen under reduced motion, final at once |
| `strip-hero-develop.jpg` | The field develops, 0 to 1500 ms, nine frames (seeked) |
| `strip-hero-drag.jpg` | Select, drag to the centre guide, release into a canvas, resize, rotate with Shift (345 degrees), Undo three times (real time) |
| `strip-hero-type.jpg` | Double click, type "Pitch Kestrel on Friday", Enter, the menus' editor and Version history showing it (real time) |
| `strip-hero-kit.jpg` | Globex at 0, 100, 200, 300, 400, 500 ms (seeked), then a typed `#3d2b1f` previewing and Enter |
| `strip-band-enter.jpg` | A band's entrance, 0 to 1200 ms (seeked) |
| `strip-menus.jpg` | File, File > Download, Insert, Text box, Tailor with its count, Apply, Skip slide, Search the menus (real time) |
| `strip-present.jpg` | Present, the timer, four slides with one skipped, the end, Escape (real time) |
| `strip-export-seam.jpg` | The seam's travel 82 to 50 percent (seeked), then drags to 15 and 88 percent |
| `strip-agents.jpg` | Tailor, then a rotate whose ring travels at 0, 150, 300, 450 ms (seeked), a background, an MCP skip |
| `strip-versions.jpg` | The newest versions, the slider at versions 1 and 3, Play, Restore This Version, Undo (real time) |
| `strip-mark-sting.jpg` | The mark drawn from its seven pieces, 0 to 1320 ms (seeked) |
| `strip-phone.jpg` | 390 with touch: opened on the plate, a tap, the Globex kit, the Menus key, Insert, a text box (real time) |
| `strip-reduced-motion.jpg` | Reduced motion: the field final at ready, a band final, a kit change cut, the mark still |
| `print-deck.jpg` | The page printed to PDF after the Globex kit: five 16 by 9 pages |

## Sources

- Research notes of this workflow, all written 2026-10-02: `research-lovefrom.md`, `research-openai.md`, `research-product.md`, `research-motion.md`, `research-current.md`, and their pictures (looked at: `current/pictures/branch-1440-light-first.jpg`, `product/frames/canvas-strip.jpg`, `product/frames/brand-strip.jpg`, `motion/strips/turboslide-system-demo.jpg`, `openai/stills-desktop-heroes.jpg`, `lovefrom/desktop-typing-strip.png`).
- Sites, through those notes, each read 2026-10-02: https://www.lovefrom.com/, https://book.stevejobsarchive.com/, https://openai.com/, https://openai.com/index/gpt-6-astra/, https://openai.com/codex/, https://www.wallpaper.com/tech/openai-has-undergone-its-first-ever-rebrand-giving-fresh-life-to-chatgpt-interactions, https://www.dezeen.com/2024/09/24/jony-ive-lovefrom-moncler-outerwear-collection/amp/.
- The tree at `2108dad4`: `packages/chrome/src/tokens.css`, `brand.css`, `Overlay.css`, `icons.tsx`, `menus/model.ts`, `menus/keys.ts`, `panels/assist-strings.ts`, `versions-model.ts`; `packages/effects/src/bayer.ts`; `packages/fonts/assets/InterVariable.woff2`, `packages/fonts/src/inter.css`; `packages/theme/brand/mark.svg`, `mark-24.svg`, `facts.json`; `packages/theme/assets/sprite.svg`; `packages/agent/generated/cli.json`, `mcp-tools.json`, `openapi.json`; `decks/gt-brand/slides/*.json` and `assets/mood-*`; `apps/studio/src/components/home/copy.ts`, `grammar.css`, `routes/home.css`.
- The CLI, read only, 2026-10-02: `turboslide slide get mood-earth --json --deck decks/gt-brand`.
- Prototemplate, read only: `deck/DECK-GRAMMAR.md`, `deck/parts/head.html`, `deck/slides/06-mood-earth.html`, `motion/kit/dither.js`.
