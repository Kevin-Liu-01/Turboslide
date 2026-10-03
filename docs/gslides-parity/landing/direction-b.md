# Direction B: demonstration

Landing designer B's note for the landing workflow. Kevin wrote on 2026-10-02: "make the landing much better inspired off of lovefrom and openai brand and make the landing much more interactive and showing off features featuring the best of graphic and motion design". Direction B leans on OpenAI's launch pages. Big type carries the page, and the product is shown working in staged sequences.

Written 2026-10-02 from 16:34 PDT in the worktree `/Users/kevinliu/repos/Turboslide-landing` on `landing/redesign` at `2108dad4`. Nothing outside `docs/gslides-parity/landing/` was written, no git write command ran, nothing was pushed or deployed, and no dev server was started (the prototype runs from file:// and needs none). Claims about LoveFrom's and OpenAI's sites are the researchers' readings of 2026-10-02 and carry the URL they read (`research-lovefrom.md`, `research-openai.md`); this lane fetched nothing from the network.

The prototype: `docs/gslides-parity/landing/direction-b/index.html`, with `landing.css`, `landing.js`, `fonts/` and `img/` beside it. Open it from the file system in a browser; it makes no network request at run time.

## 1. The idea

The page states the product in very large type and then shows it working. Each band is one statement heading, one or two sentences, and a demonstration a visitor can watch or take over. In the hero, an agent types four real Turboslide commands into a terminal and the example deck changes beside it: a slide appears, its title is set, every "Acme" becomes "Globex", and the deck is restored. The bands below show a slide whose objects the visitor drags, resizes and rotates while a panel prints the action each gesture writes. Then come two people typing on one slide, a presenter view driven by the arrow keys, and an export compared with the screen pixel by pixel under a loupe. The last demonstration is an animated pattern with its still frame. Every staged sequence is short, starts when half of it is on screen, stops when the visitor touches it, and says on the page that it is staged and how long it runs. One material ties the page together: the Bayer dither field. Between bands it gathers into the glyph of the next chapter, on the opener slide it raises its tone from zero, and in the Blue Marble picture it develops cell by cell. The page ends on its densest evidence, a ruled table of features with the menu path to each, and then the mark draws its seven bars once and holds.

## 2. The sections in order, with their copy

The copy is in full. Headings are sentence case without a trailing period, buttons are Title Case, and every count is a value of `packages/theme/brand/facts.json` (the page's script sets each `data-fact` element from one object, the shape `facts-data.ts` already has). The words on the example slides are the example deck's content, not the page's claims.

| # | Band | Copy |
| --- | --- | --- |
| 0 | Navigation (58 px, in the column, seam under it) | The mark and "Turboslide" (a link to the top). "Documentation". The Light and Dark pair. "Pause Motion" (it reads "Play Motion" while pressed; hidden under reduced motion, where nothing moves). "New Presentation" (solid). On a phone: two rows, the lockup with New Presentation, then Documentation with the switches. |
| 1 | Hero | h1, set by hand in three lines on desktop: "Build the pitch, / present it and / send the link". Lead: "Turboslide is a slides editor in the browser. It has Google Slides' menus and shortcuts. No account is needed." Buttons: "New Presentation", "Open the Example Deck". |
| 1a | The agent stage | An editor frame titled "Onboarding plan" ("All changes saved", Slideshow, Share, the nine menus in Google's order, a filmstrip of five slides) beside a terminal on the `#101010` panel. The terminal opens on `turboslide --version` and its three lines. Four step tabs, each with a 2 px countdown rule: "New Slide" (`slide new --layout split`), "Set the Title" (`block set pricing#title`), "Tailor for Globex" (`tailor --replace Acme=Globex`), "Restore" (`version restore 25`). Caption: "A staged sequence of 17 seconds. An agent runs four Turboslide commands on the example deck. Type in the terminal to run one yourself." Buttons: "Pause", "Replay". Snackbars in the product's words: "An agent added slide 6", "An agent changed slide 6", "Tailored for Globex: 14 places on 6 slides", each with "Undo". |
| 2 | Numbers (still on purpose) | "193 actions: Every menu row is an action. Agents run the same actions over the CLI, MCP and HTTP." "22 layouts: A new slide starts from one of these layouts." "17 patterns: Insert > Animated pattern draws one in the theme's colors." "135 shapes: Every shape preset is drawn from its PowerPoint definition." |
| 3 | Field: the selection frame | (no words; `aria-hidden`) |
| 4 | Everything on a slide moves | Lead: "Drag, resize and rotate any object. The first drag turns the slide into a canvas. Undo puts the layout back." A slide ("One release for every region", "Acme's sellers in every region open the same deck on the same day.", the Blue Marble) beside an actions panel that opens on "Waiting for a gesture on the slide." Caption: "Each gesture writes one action. The panel prints the command an agent would send for the same change." Button: "Undo". Credit: "The Blue Marble. Image: NASA, Reto Stöckli, 2007, public domain." |
| 5 | Field: two carets with name flags | |
| 6 | Two people edit the same slide | Lead: "Share an editor link. Each person's outline, caret and name show on the other screen. Follow keeps your view on the slide the other person is on." Labels pinned to the two rails: "Maya's screen", "Sam's screen". Flags: "Sam · guest", "Maya". Plate: "Following Sam" with "Stop". Caption: "A staged sequence of 14 seconds, drawn with the editor's own presence marks. Click a text box on either screen to type as that person." Buttons: "Pause", "Replay". |
| 7 | Field: play | |
| 8 | Present from the browser | Lead: "Slideshow starts on the current slide. Presenter view opens in a second window with the timer, the notes and the next slide. A skipped slide stays out of the show." The presenter view (timer, "Slide 1 of 4", "Previous", "Next", "Next slide", "Speaker notes") and the "Audience screen". Caption: "Slide 4 is skipped, so the show goes from slide 3 to slide 5. Use the arrow keys or the buttons." |
| 9 | Field: two pages and a seam | |
| 10 | Export to PDF and PowerPoint | Lead: "File > Download writes a PDF or a PowerPoint file. The PowerPoint file matches the screen pixel for pixel." Labels pinned to the rails: "In the browser", "In the PowerPoint file". Loupe: "Browser", "PowerPoint file", "{n} of 196 pixels differ at x {x}, y {y}." Caption: "Drag the handle to compare the two. Hold the pointer on the slide to see both at ten times their size." Fact row: "0.003%: The worst page of the example deck's PowerPoint export differs from the screen by this share. Read the record" (the link to `docs/pptx.md`, the row `home.export.record` keeps). |
| 11 | Field: a lit sphere | |
| 12 | Animated patterns in the theme's colors | Lead: "Insert > Animated pattern adds one of 17 patterns to a slide. It moves in the editor and in the show. Every export carries its still frame." Pair: "Moving", "Still Frame". Caption: "The still frame is the picture the PDF and the PowerPoint file carry." The slide: "Questions from Acme", "Thank you for the time today." |
| 13 | Field: ruled rows | |
| 14 | Features and where to find them | Ten ruled rows, a Heroicon in each key cell: Menus, File to Help, "The menus and shortcuts are Google's, in Google's order." Tailor for a customer, Tools, "One customer name is replaced on every slide and in the notes as one change." Brand kit, Slide > Change theme, "Six colors, the faces and the logo apply to every slide." Comments, Insert > Comment, "A comment sits on an object, a text range or the slide, and can be assigned." Version history, File > Version history, "Each version names its author, a person or an agent." Share, Share, "An editor link or a viewer link opens the deck in the browser." Presenter view, Slideshow > Presenter view, "The timer, the notes and the next slide in a second window." Download, File > Download, "PowerPoint and PDF files that match the screen." Animated pattern, Insert > Animated pattern, "17 patterns in the theme's colors." Agents, CLI, MCP and HTTP, "193 actions, 169 MCP tools and 177 HTTP paths." |
| 15 | Free under the MIT license | Lead: "Run it from a checkout or deploy it to Vercel. The code is on GitHub." Button: "GitHub" (with the external glyph). The mark at 300 px, drawn once. |
| 16 | Footer | The lockup, "New presentation", "Your presentations", "Documentation", "GitHub", "License", then "Turboslide is made by General Translation. Google Slides is a product of Google LLC." |

The menu paths in the table were read from `packages/chrome/src/menus/model.ts` on this branch: `tools.tailor` (2579), `slide.changeTheme` opening the Brand kit panel (2244), `insert.comment` (1636), the File > Version history submenu (1118 to 1125), `title.share` (893), `title.slideshow.presenterView` (871), File > Download (1035 to 1041), and `insert.shader`, whose label is "Animated pattern" (1665). Insert > Animated pattern is a Turboslide row in the default view. Its Shader row in Change background is parked, so the page names only the Insert row.

Words: the copy the page writes (navigation, headings, leads, captions, buttons, numbers, the table, the footer) is 516 (424 of them headings, leads, numbers, the fact row and the table; captions, credits and figure labels add 144) words. The example slides, the staged chrome and the terminal add the rest. `decks.home.copy-rules` asks under 350. The demonstrations need their captions, so this direction asks for the rule to count headings, leads and the table and to leave captions and figure labels out, with a ceiling of 450.

Checked by script on the page's text (section 11): no em dash, no exclamation mark, none of `FORBIDDEN_WORDS`, `FORBIDDEN_PHRASES` or `REPORT_WORDS` of `apps/studio/src/components/home/copy.ts`. "realtime" never appears, and the people band says nothing about speed.

## 3. The interactions

Every one works in the prototype. "Staged" means the page plays a written sequence; "live" means the page does the thing in front of the visitor.

| Where | What the visitor does | What happens | Keyboard | Under reduced motion |
| --- | --- | --- | --- | --- |
| Navigation | Presses Light or Dark | The appearance changes and is stored as `gt-theme` (the key the product's boot script reads); the fields redraw in the new ink | Tab, Enter | Same |
| Navigation | Presses Pause Motion | Every loop, every field and the caret stop; the choice holds for the session | Tab, Enter | Hidden: nothing moves |
| Hero stage | Watches | Staged: the 17 s sequence, typing at a constant 24 ms a key, then the deck changing | | Not played; the first state shows |
| Hero stage | Presses a step tab | The loop stops for good; the steps before land at once, the chosen step plays once | Tab, Enter | The step lands at once |
| Hero stage | Types a command and presses Enter | Live: `slide new [--layout x]`, `block set <slide>#title /text "..."`, `tailor --replace X=Y` (any names), `version restore [n]`, `help`; the deck changes and the terminal prints a JSON line; an unknown command prints a plain error | The input is a labelled field | Same, with no cuts |
| Hero stage | Presses Undo on a snackbar | The last write is undone | Tab, Enter | Same |
| Hero stage | Presses a filmstrip card | That slide shows on the stage | Tab, Enter | Same |
| Hero stage | Presses Pause or Replay | The loop holds, or restarts from 0 | Tab, Enter | Pause disabled; Replay shows the end state |
| Gestures | Presses an object | Live: the ring, eight square handles, the rotation stem and the role chip (Title, Text, Image) in `#2f5ce0` | Tab focuses an object | Same |
| Gestures | Drags | The object follows the pointer; its centre snaps to the slide's middle column or row within 12 units, and the guide shows | Arrow keys move by 4 units, Shift by 40 | Same |
| Gestures | Drags a handle | Resize in the object's own frame, the opposite side fixed, at any rotation | | Same |
| Gestures | Drags the stem | Rotation with a degree readout; Shift steps by 15 degrees | | Same |
| Gestures | Ends any gesture | The panel prints `turboslide slide to-canvas review` (the first time) and `turboslide block set review#<id> /pos '{...}'` or `turboslide block rotate review#<id> --to <deg>`, each with its JSON answer | One action per burst of keys, 400 ms after the last | Same |
| Gestures | Presses Undo | Every object moves home on the move curve and the log clears | Tab, Enter | Objects jump home |
| Gestures | Leaves it alone | Staged: a pointer drags the picture to the middle row and turns the title by 8 degrees, 7.6 s, until the first touch | | Not played |
| Two people | Watches | Staged: Sam's chip arrives, his outline and flag land on the subtitle, he types with a person's uneven gaps and Maya's screen trails by one key; Maya selects the title and types; she follows Sam to a new slide; Stop | | Not played; the still is Sam's words on both screens with his outline and flag on Maya's |
| Two people | Clicks a text box on either screen and types | Live in the page: that screen shows the blue selection, the other shows the person's ink outline, flag and caret, and the words follow 120 ms behind | Enter ends | Same |
| Present | Watches | Staged: the show advances every 4 s while in view, the rule on Next fills, the timer counts | | Not played |
| Present | Presses Next, Previous or the keys | Live: both screens change together; slide 4 is skipped; the timer keeps counting | Focus the presenter: Right, Space, PageDown, Left, PageUp, Home, End | Same, with no cuts |
| Export | Drags the handle | Live: the line between the browser render and the exported page moves | The handle is a slider: arrows by 2, Shift by 10, Home, End | Same |
| Export | Holds the pointer on the slide | Live: a loupe shows 14 by 14 pixels of each raster at ten times and counts the pixels that differ; on touch it follows a held finger | | Same |
| Patterns | Presses Moving or Still Frame | The pattern moves, or holds the frame an export carries | Tab, Enter | Always the still frame |
| Feature table | Hovers a row | The row's ground changes in 120 ms | | Same |
| Buttons | Presses | The ground changes and the button scales to 0.98 for 120 ms | | No scale |

## 4. The motion table

The same table heads `landing.css`. The curves are the motion researcher's tokens (`research-motion.md` 4.3), which are the GT films' `expo.out`, `power2.inOut` and smoothstep; the durations follow its 4.2.

| Name | Value | What moves |
| --- | --- | --- |
| `--ease-arrive` | `cubic-bezier(0.16, 1, 0.3, 1)` (expo.out) | Arrivals: the selection ring, the card entering, the seam's first sweep, the mark's bars |
| `--ease-move` | `cubic-bezier(0.65, 0, 0.35, 1)` (power2.inOut) | An object moved by a sequence or by Undo, the demonstration's pointer |
| `--ease-tone` | `cubic-bezier(0.333, 0, 0.667, 1)` (smoothstep; the script uses the same polynomial) | Every dither tone mix, the Tailor marks settling |
| `--ease-out` | `cubic-bezier(0.2, 0, 0, 1)` (the product's `--pt-ease`) | Chrome state: chips, flags, the snackbar, the Following plate |
| linear | | Processes: the step countdown rules, the show's 4 s rule, typing, the timer |
| `--d-press` | 120 ms | Hover and press grounds, the 0.98 press |
| `--d-state` | 180 ms | Chips, flags, outlines, the snackbar, the plate, the selection ring's opacity |
| `--d-cut` | 280 ms | A slide change on a stage: opacity 0.7 to 1 with 2 percent travel (the Astra viewer's Next, 280 ms) |
| `--d-card` | 300 ms | A filmstrip card entering: 8 px rise |
| move | 300 + distance / 2 ms, 300 to 700 ms | Undo sending objects home; the demonstration's moves run 450 to 800 ms |
| `--d-tone` | 500 ms, one beat | The opener's field raising its tone from 0 |
| gather | 1500 ms, hold to 7 s, thin over 1.5 s, rest to 12 s | A chapter field gathering into its glyph |
| develop | 2000 ms | The Blue Marble raising its tone from 0 |
| `--d-mark` | 600 ms a bar, 60 ms apart, seven bars | The mark drawing itself once |
| `--d-caret` | 1060 ms, `steps(1)` | The caret blink |
| agent typing | 24 ms a character, constant | The agent's commands |
| person typing | 70 to 240 ms a character, 300 to 460 ms at a space | Sam and Maya |
| step countdown | the step's length (4.2 to 4.4 s), linear | The 2 px rule over the active step |
| show advance | 4000 ms, linear | The presenter view's automatic Next |
| opener drift | the noise slides one cell every 400 ms, so the field redraws 2.5 times a second | The opener's field while in view (under 3 percent of tone a beat) |
| pattern | 24 frames a second while in view | The animated pattern; Still Frame holds the frame at time 0 |
| field frames | 30 frames a second while a strip is in view, at most two fields at once | The chapter fields |
| positions | transform only | Rings, objects, the demonstration's pointer and the seam move by `transform`, never by `left` or `top`, so nothing counts as a layout shift |

The terminals hold one fixed slot per line and the script writes text into the slots. A new line never adds a box or moves one, and a polite live region reads each action of the gesture band to a screen reader.

What never moves: the h1 and every heading, the leads, the numbers row, the feature table, the navigation, the rails and seams, and the page itself (native scroll, `scroll-behavior: auto`, no reveal on prose).

Loops: the hero (17 s), the people (14 s), the gesture demonstration (7.6 s), the show (4 s a slide), the fields (12 s) and the pattern. A demonstration plays only when half of it is visible and the tab is visible, at most one at a time, and never again after the visitor touched it. At most two fields draw at once. The first screen is still until the load event and an idle callback (at most 1.5 s), so the h1 is the largest paint and nothing in the first viewport moves before it.

Reduced motion (`prefers-reduced-motion: reduce`): every CSS duration is 0, no loop starts, the caret does not blink, each field draws one still (the opener at full tone, the strips gathered, the pattern at its export frame, the Blue Marble developed), the people band shows its still, Pause Motion is hidden, and every step and control still works at once. `b-1440-light-reduced-full.jpg` is that page. Checked on 2026-10-03 at 01:09 UTC: under `reduce`, at 390 by 844, `document.getAnimations()` is empty after the load and a full scroll, and Pause Motion is hidden. The check found a person's caret still blinking, because its rule came after the reduced block. The reduced block now sits last in the stylesheet.

## 5. What is live product code and what is staged

Nothing in the prototype imports the product's code: it is a static page. The table says what each part stands for and what the build would use.

| Part | In the prototype | In the product |
| --- | --- | --- |
| The slides | HTML written in the deck's grammar (1600 by 900 sheet, rails and rules at 56, crosses, plate, the ladder's sizes) in container units, one copy per slide, cloned for thumbnails, the show and the comparison | Rendered at build by `renderSlide` from a fixture deck made for the landing, inlined with `sheet.css` (8.4 KB gzip; `research-product.md` 2.2). The renderer never ships to the browser |
| The editor frame in the hero | Staged chrome in the product's grammar: title row, menus, filmstrip, the selection ring, the snackbar | The same staged chrome, built from `packages/chrome/src/tokens.css` so the two cannot drift, or the real chrome's title row captured at build |
| The terminal | Real command syntax from the action table (`slide new`, `block set`, `tailor`, `version restore`, `--version`); the JSON lines are written for the prototype | The outputs captured at build by running the CLI on a copy of the fixture deck, as the product researcher captured `--version` and `info --json` |
| Tailor | Live text replacement over the page's slides, with the places and slides counted from them | The same operation `deck.tailor` applies to text; the build can run it once and check the counts |
| Gestures | Live in the page: pointer and keyboard, snap, resize in the rotated frame, rotation with Shift steps | Page code with the editor's handle look; the printed commands are real CLI forms with the `pos` record of `packages/schema` |
| Two people | Staged sequence; the visitor's typing is mirrored inside the page | Staged until the realtime rows read green on production (`research-product.md` section 1); the marks match the product's (chip, ink flag, outline, caret, Following plate) |
| Present | Live presenter and audience in the page, slide 4 skipped | Page code over the build's slides; the real show is one click away |
| Export | The left side is the live HTML slide; the right side and both loupe rasters are one Chromium screenshot of the same slide standing in for the exported page, so the loupe reads 0 | The verify loop's two rasters: `turboslide render --scale 1` and the page of `export pptx --mode flatten --verify` (pdftocairo at 1600 by 900, `docs/export-verification.md`), content hashed under `public/home/` |
| Animated pattern | The page's Bayer field standing in for Paper's dithering shader | `ShaderMount` with one fragment shader imported directly (6 to 8 KB gzip, `research-product.md` 2.2), paused off screen, its still frame under reduced motion |
| The fields | The page's Bayer engine: one buffer pixel per cell, an 8 by 8 matrix, CSS draws the cells square | The same engine (the matrix is `@turboslide/effects/bayer`, 534 B gzip) in one module |
| The facts | One object holding the values of `facts.json` | `HomeFacts` through `facts-data.ts`, as today |
| The capture handle | `window.__ts`, a manual clock for the strips | Left out |

## 6. The budget

Measured on 2026-10-02 (PDT) on the prototype as it stands: bytes on disk at 18:06, and the main thread in three cold loads at each width at 18:01 to 18:05 (2026-10-03 01:01 to 01:05 UTC). The tool was `capb/measure.mjs`: Chrome for Testing 1217 through the worktree's `playwright-core`, headless, device scale 1, the light appearance, a fresh context per load, `Performance.getMetrics` for the main thread, and `PerformanceObserver` for LCP, CLS and long tasks. Each load ran four phases: load, 3 s of first screen, 3 s with the hero running, then a full scroll in native 600 px wheel steps every 300 ms, back to the top, Pause Motion, and 3 s still. The one minute load was 53 to 58, so paint and script numbers are upper bounds. Raw rows: `shots/measure-1440.json` and `shots/measure-390.json`.

### 6.1 Weight

| File | Raw | gzip | brotli | When it loads |
| --- | ---: | ---: | ---: | --- |
| `index.html` (every band's markup, the slides, the sprite) | 39,023 | 8,805 | 7,251 | First screen |
| `landing.css` | 41,420 | 9,648 | 8,367 | First screen |
| the same, minified with esbuild 0.28.1 | 27,605 | 6,592 | 5,894 | |
| `landing.js` (deferred) | 82,513 | 22,986 | 19,872 | First screen |
| the same, minified | 41,865 | 15,694 | 14,184 | |
| `fonts/inter-latin.woff2` (Inter, Latin subset, `opsz` and `wght` kept) | 57,864 | | | Production's font file |
| `fonts/inter-latin.css` (the same font as a data URI, because file:// refuses a font file) | 77,746 | 58,929 | 58,331 | First screen in the prototype |
| `img/earth-tone.jpg` (the Blue Marble, 800 by 450, greyscale) | 28,630 | | | Production's tone source |
| `img/earth-tone.js` (the same as a data URI, so the canvas may read it from file://) | 38,472 | 25,311 | 25,024 | Within 400 px of the gesture band |
| `img/export-page-light.png`, `-dark.png` (1600 by 900) | 31,425 and 33,837 | | | Lazy, the shown appearance only |
| `img/export-pages.js` (both rasters as data URIs for the loupe under file://) | 87,493 | 54,411 | 53,592 | On the first hover of the loupe; production reads the PNGs |

Requests: 4 for the first screen (`index.html`, `fonts/inter-latin.css`, `landing.css`, `landing.js`), and 6 after a full scroll (`img/earth-tone.js`, `img/export-page-light.png`). No picture loads in the first screen. Every slide, chart field and glyph is drawn by the page.

In production terms, the first screen is about 85 KB over the wire: HTML 7.3, CSS 5.9 and script 14.2 KB brotli, plus the 57.9 KB font. After a full scroll it is about 146 KB, adding the 28.6 KB tone source and one 31.4 KB raster. Production `/home` today is 994 KB over the wire and 1,959 KB decoded (`research-current.md` 6.1). This page's own script is 14 KB brotli against `home-*.js` today at 18 KB. The catch is that inside the product every route also loads the shared 1,176 KB entry chunk until its split lands (risk 1).

### 6.2 Main thread and stability

Median of three loads (worst in brackets), in milliseconds:

| Reading | 1440 by 900 (load 53.35, 56.20, 55.27) | 390 by 844 (load 57.00, 56.64, 57.92) |
| --- | --- | --- |
| FCP | 132 (172) | 92 (100) |
| LCP | 152 (220); the h1's first line | 124 (132); the lead |
| Main thread to the load event, all tasks | 93 (143) | 78 (89) |
| of it script, layout, style | 38 (73), 28 (37), 9 (9) | 25 (34), 29 (29), 8 (8) |
| Load to 3 s (the idle callback, the field's first beat, the hero's first command), all tasks / script | 255 (262) / 29 (69) | 75 (76) / 13 (13) |
| Hero running, per second, all tasks / script | 68 (81) / 7 (7) | 21 (22) / 3 (3) |
| Full scroll with every band playing as it enters, per second, all tasks / script | 117 (193) / 51 (136) | 77 (78) / 25 (25) |
| Pause Motion, per second | 0 / 0 (no frame callback runs) | 0 / 0 |
| Long tasks | none in two loads; 470 and 53 in one (load 53, during the scroll) | none |
| CLS over the load, 6 s of the first screen and a full scroll | 0 in all three (one entry of 0.00003 at the font's arrival in two) | 0 in all three (one entry of 0.00001 at the font's arrival) |

How it got there, all in the prototype now:
- Bands below the fold set up only within 800 px of the viewport. That took the first long task from 82 to 94 ms down to none.
- The opener's field tone is precomputed, and the field redraws only when its drift steps, every 400 ms. Every field writes one 32 bit value per cell. A CPU profile of 3 s with the hero running went from about 250 ms of script to about 16.
- Positions change by `transform`, and the terminals write text into fixed line slots. That took CLS from 0.0031 to 0 at 1440.
- The phone's filmstrip row reserves its height. That took the phone's one 0.0021 entry to 0.

Against the standing budgets (`research-current.md` 6.2): LCP under 400 ms holds at both widths, with the h1 or the lead as the element. Images before the first scroll are 0 bytes. CLS is 0. The motion research's ceiling of 60 ms a second at idle with a field drifting (`research-motion.md` 4.9) is met for script (7) and slightly exceeded for all tasks (68) on a machine at a load of 55. Its "no long task from motion code" holds in five of six loads. Script and fonts can only be judged inside the product, after the prerequisites of section 8.

## 7. How it carries LoveFrom's and OpenAI's craft into Turboslide's grammar

From OpenAI's launch pages (`research-openai.md`, every page read on 2026-10-02):

- The working product in the first screen, with one thing moving. https://openai.com/ opens on the real composer, and its only motion is the example prompt changing every 2.6 s (section 4.1). Here the first screen holds the editor and a terminal with a real input, and the one motion is the agent's typing. It starts after load, when the stage is half on screen.
- Big type carried by being alone. OpenAI headings are weight 500, tracking tightens with size, and the title has empty ground around it (https://openai.com/index/introducing-gpt-6-1-sol/, section 3). Here the h1 is 95 px at 1440 (`clamp(40px, min(6.6vw, 12.4svh), 96px)`), weight 500, -0.042em, set by hand in three lines with nothing beside it. Every band heading is 54 px, with one ladder below it (22, 19, 16, 14, 13).
- Evidence after a statement, never two pieces stacked (the rhythm of https://openai.com/index/gpt-6-astra/, section 5). Every band is a heading, one or two sentences, then one demonstration in a wider frame.
- Honest captions on recordings. Astra's read "This is a 15-second condensed playback of…" (section 4.3). Here every staged sequence says "A staged sequence of N seconds" on the page.
- Tabs that advance on their own carry a countdown and stop when touched (Astra's 6 s chart tabs, section 8). Here the four step tabs carry a 2 px rule that fills over each step, and a press stops the loop for good.
- The two-part title pinned to the two edges (Sol and Astra, section 3). Here "Maya's screen" and "Sam's screen", and "In the browser" and "In the PowerPoint file", sit on the two rails with the demonstration between them. The two words are the two sides of the thing compared.
- One material that assembles into each chapter's shape. Astra's star field gathers into a cursor before the computer use chapter and into the Blossom before the evaluation table (section 5). Here the dither field gathers into the selection frame, two name flags, play, two pages with a seam, a lit sphere and ruled rows. It moves by tone mixing on one cell grid, never by alpha.
- Loops that seam on a rest state (section 7). The hero ends restored to its first deck, the people loop ends with both screens on slide 1, and a field cycle ends scattered.
- A pause or replay for everything that moves (Sol's Pause animation, Astra's Replay, section 8). Here that is Pause Motion in the bar and Pause and Replay under each sequence.
- Charts and tables hold still, and the page ends on its densest evidence (Astra's ruled evaluation table, sections 4.6 and 5). Here the numbers row and the feature table never move, and the table is the last band before the license.
- Not taken: OpenAI's date and tag line over a title (an eyebrow), its em dashes, and its photography or characters.

From LoveFrom (`research-lovefrom.md`, https://www.lovefrom.com/ and its files read on 2026-10-02):

- Time it like a person. The wordmark is typed with gaps of 170 to 240 ms and a 660 ms pause between words (section 4a). Here the people band types with uneven gaps of 70 to 240 ms and a longer pause at each space, while the agent types at a constant 24 ms a key. The rhythm alone tells a person from an agent.
- Build the subject once in front of the reader and stop on a still (section 10, rule 2). The mark draws its seven bars once, in reading order, and holds; it never loops.
- A photograph develops over seconds. The book's Polaroid develops over 8 to 12 s on long curves (https://book.stevejobsarchive.com/, section 4c). Here the Blue Marble raises its tone from zero over 2 s, its cells switching in Bayer order, the dither's equivalent of a print developing.
- Explain a mechanism with a small working model of itself (the Moncler paper models, section 8). The gesture slide prints the action each gesture writes, and the export band lets the visitor compare the two renders directly. Neither is described in a sentence.
- Exact facts in place of adjectives, the LP12-50's list of parts (section 8). The feature table names the menu path to each feature, and every number comes from `facts.json`.
- One subject per screen, and a defined still for any visitor who does not get the motion (sections 3 and 10). Each band holds one demonstration, and the reduced motion page shows each one's still.
- Hand set breaks (section 2). The h1's three lines are composed for the 1104 px column; other text uses `text-wrap: balance` and `pretty`.
- Not taken: scroll locked to a panel, springs with overshoot, the comma, the bear, the serif, and ignoring reduced motion. Direction B does not propose LoveFrom's serif: it is their identity, and Inter's optical size axis (kept in the subset, `opsz` 14 to 32) gives the display sizes their own cut.

In Turboslide's own grammar throughout: Inter only (a Latin subset of `packages/fonts/assets/InterVariable.woff2` with both axes), paper and ink tokens, `#2f5ce0` only on the selection ring, its handles and chip, the snap guide, the caret, the seam handle, the step focus and the Tailor marks. Kevin has the product researcher's open question on the guide's magenta token (section 8 there); the prototype draws guides in the one interface colour. The page keeps one rail on each side of the 1104 px column, seams with crosses, ruled rows instead of boxed cards, and Heroicons solid only in the table's key cells. Monospace appears only on the `#101010` panels. There are no eyebrows, no sparkle or robot glyph, no em dash and no exclamation mark.

## 8. What it would take to build in the product

The order matters: the budget first, then the bands, then the rows.

1. The budget (prerequisites, `research-current.md` 6.3). The entry chunk split of `audit-performance.md` item 1 (1,176 KB decoded on every route today) and an Inter subset for `/home` (item 10; this prototype's subset with both axes is 57,864 bytes against 352,240). Without them the page has no script or font room. Size: the audit's own lanes, not this one.
2. Build time assets, in `scripts/build-home-assets.ts`:
   - a fixture deck `decks/fixture/landing-onboarding/` (the five slides, the sixth the agent adds, the gesture slide, the pattern slide);
   - `--slides`, which renders each slide with `renderSlide` to `apps/studio/src/components/home/slides.json`;
   - `--transcripts`, which runs the four commands and `--version` against a tmp copy of the fixture and records their output in `transcripts.json`;
   - `--export`, which renders the comparison slide and runs `export pptx --mode flatten --verify` to keep the two 1600 by 900 rasters per appearance, content hashed under `apps/studio/public/home/`;
   - a 960 by 540 greyscale tone source of the Blue Marble (credited, `docs/brand.md` section 8).
3. Components under `apps/studio/src/components/home/`: `HomeAgentStage.tsx`, `HomeGestures.tsx`, `HomePeople.tsx`, `HomePresent.tsx` (rewritten), `HomeExport.tsx` (rewritten), `HomePatterns.tsx`, `HomeFeatures.tsx`, `FieldStrip.tsx` and `HomeMark.tsx`. Motion lives in `home/motion/`: `clock.ts` (one frame clock and the loop scheduler), `seq.ts` (the timeline), `bayer-field.ts` (the engine over `@turboslide/effects/bayer`), `tones.ts` and `glyphs.ts`. The motion modules load after the load event as one deferred chunk of about 14 KB brotli, the prototype's measured size (41,865 bytes minified). The pattern band imports `ShaderMount` and one fragment directly, never through `@turboslide/materials/mount` (181 KB gzip).
4. Strings in `copy.ts` and its lint. Motion tokens in `home.css`, with the motion table at its head. `grammar.css` unchanged.
5. The rows and tests that encode "nothing animates" are rewritten on purpose (section 9).

Size: about 13 lane days, which is three to four pipeline days with five lanes. Lane A: assets and fixture, 2 days. Lane B: the agent stage and terminal, 2.5. Lane C: gestures and people, 3. Lane D: present, export and patterns, 3. Lane E: fields, mark, table, copy and the rows, 2.5. A verifier pass and the captures follow. This assumes the budget prerequisites have landed.

## 9. The rules and rows this direction changes

| Rule today | Where | What direction B asks for |
| --- | --- | --- |
| "Nothing animates" | `docs/POLISH.md` 3.2; `home.css` header; `HomeHero.tsx` header | The motion table of section 4 as the rule, with a still for every motion under reduced motion |
| No script carries `ShaderMount` | `home-page.spec.ts` 637 to 660 | A byte ceiling instead: the pattern band's chunk under 10 KB gzip, loaded on intersection |
| Under 350 words, one picture per section | `decks.home.copy-rules` | 450, counting headings, leads and the table; captions and figure labels outside the count |
| Under 5,000 px at 1440 | `decks.home.pictures-three-widths` | 8,200 at 1440 and 9,500 at 390; the prototype is 7,898 and 8,924 |
| CLS 0 | `decks.home.layout-shift` | Kept, measured over the load, the loops and a full scroll (section 6) |
| No dither on the page; mood pictures off the first screen | POLISH.md 3.3 item 3; NEXT.md question 5 | The dither field as the page's material, which is Kevin's question. The Blue Marble sits below the first screen, so question 5 holds as written. The first screen's field is abstract |
| The capture shows no selection ring | `decks.home.capture-plain` | Kept for captures. The live ring is the product's interface colour on purpose |
| New rows | | `decks.home.motion.reduced` (no animation created and every still drawn under reduce), `decks.home.motion.pause` (Pause Motion stops every loop within a frame), `decks.home.motion.offscreen` (no frame callback while every demonstration is off screen), `decks.home.demo.keyboard` (every interaction of section 3 by keyboard), `decks.home.demo.staged-captions` (every staged sequence says so) |

## 10. Risks

1. The budget. `/home` is already over its 600 KB script and 120 KB font ceilings before any motion (`research-current.md` 6.3). This direction adds about 14 KB brotli of script and needs the entry chunk split and the font subset to land first. On today's tree it cannot pass `decks.home.load-budget`.
2. Staged demonstrations read as claims. The people band shows presence that production's realtime rows have not read green, and the export loupe reads 0 in the prototype because both rasters are the same render. The captions say "staged", and the copy never mentions speed. Kevin may still prefer to hold the people band until the production table is green, or to show it only on a deployment where it is.
3. Drift between staged chrome and the product. The current page's capture already drifted: the old mark, the Assist sparkle and a guest label (`research-current.md` 4.3). Staged chrome needs a visual parity check against `packages/chrome` on every ship.
4. Fabricated outputs. The prototype's JSON lines are written by hand. They must be replaced by captured output before anything ships, or the terminal shows a contract the CLI does not keep.
5. Length and attention. The page is 7,898 px at 1440. Six demonstrations is more than most visitors finish; the hero and the gesture band carry the page if the rest is skipped.
6. Cost on slow phones. At most one demonstration and two fields draw at once, and every loop pauses off screen and on a hidden tab. A low-end phone still pays per field frame (section 6), so the build needs the field governor of Prototemplate `DESIGN.md` section 11: drop to coarser cells, or stop the drift, when a frame costs more than 4 ms.
7. Reduced motion and pausing are easy to regress. WCAG 2.2.2 requires the pause for anything moving longer than 5 s, and the new rows of section 9 hold it.
8. The front door. `/` still answers 307 to `/new`, so the landing is reached only by link (`research-current.md` 4.8). That is Kevin's routing decision.
9. The measurements here ran on a machine at a one minute load of 51 to 69 for the final captures and 53 to 58 for the measurements (an early review pass ran at 132 to 154), with three other pipelines running. Main thread numbers are upper bounds.

## 11. Pictures

All under `docs/gslides-parity/landing/direction-b/shots/`, each under 400 KB. Full pages are JPEG (desktop scaled to 1200 px wide, phones at 390 px); first screens and strips are palette PNG. Strip times are timeline time when the label says so: the page's manual clock advanced every running tick by exact milliseconds, and CSS transitions of at most 300 ms were given 350 ms to settle before each frame. Interaction strips are real time from the first input, read from `performance.now()`. The full pages show every band in the state it holds once the visitor has reached it (`window.__ts.settle()`: the strips gathered, the Blue Marble developed).

| File | What it shows |
| --- | --- |
| `b-1440-light-first.png`, `b-1440-dark-first.png` | The first screen at 1440 by 900, about 2.6 s after load: the h1, the lead and buttons, and the stage with the agent's first command |
| `b-1440-light-full.jpg`, `b-1440-dark-full.jpg` | The whole page at 1440 (7,898 px), scaled to 1200 px wide |
| `b-390-light-first.png`, `b-390-dark-first.png` | The first screen at 390 by 844: the two row bar, the stacked hero, the stage with the filmstrip under the slide |
| `b-390-light-full.jpg`, `b-390-dark-full.jpg` | The whole page at 390 (8,924 px), at 1:1 |
| `b-1440-light-reduced-full.jpg` | The whole page under `prefers-reduced-motion: reduce`: every still, and Pause Motion hidden |
| `b-strip-hero-agent.png` | The hero's 17 s sequence, ten frames of timeline time |
| `b-strip-hero-field.png` | The opener's field raising its tone from 0 over one beat, then drifting, eight frames |
| `b-strip-hero-step.png` | Pressing Tailor for Globex: the loop stops, steps 1 and 2 land, step 3 plays once, six frames |
| `b-strip-hero-typed.png` | The visitor types `turboslide tailor --replace Acme=Initech`, then `slide new`, then Undo on the snackbar, seven frames in real time |
| `b-strip-canvas-develop.png` | The Blue Marble developing through its dither over 2 s, seven frames |
| `b-strip-canvas-demo.png` | The gesture demonstration: the picture to the middle row, the title turned by 8 degrees, Undo, ten frames |
| `b-strip-canvas-gestures.png` | The visitor's select, drag with the centre guide, resize, Shift rotate, Undo and arrow keys, with the printed actions, eight frames in real time |
| `b-strip-people.png` | Two people: the chip, the outline and flag, the typing on two clocks, Follow and Stop, ten frames |
| `b-strip-people-typing.png` | The visitor types as Maya, then as Sam, six frames in real time |
| `b-strip-present-auto.png` | The show advancing every 4 s with its rule on Next, slide 4 skipped, seven frames |
| `b-strip-present-keys.png` | The arrow keys and Previous, the skip from 3 to 5, the timer, six frames in real time |
| `b-strip-export-sweep.png` | The seam sweeping in once on expo.out, six frames |
| `b-strip-export-compare.png` | The visitor drags the seam, holds the loupe over the heading and a row (0 of 196 pixels differ), Home and End, six frames in real time |
| `b-strip-pattern.png` | The animated pattern over 8 s, then Still Frame, seven frames |
| `b-strip-field-gather.png` | A chapter field gathering into the selection frame, holding and thinning, ten frames over the 12 s cycle |
| `b-strip-field-glyphs.png` | The six chapter fields gathered, each the glyph of the band after it |
| `b-strip-mark.png` | The mark drawing its seven bars, eight frames over 1 s |
| `measure-1440.json`, `measure-390.json`, `load-log.txt` | The measured rows of section 6 and the one minute load at every run |

No WebM was made: the strips carry the timings, and the machine's load argued against video encodes.

The scripts that made them are in the session scratchpad (`capb/lib.mjs`, `raster.mjs`, `check.mjs`, `shots.mjs`, `strips.mjs`, `measure.mjs`), using the worktree's `playwright-core` with Chrome for Testing 1217 and sharp. `shots/load-log.txt` records the one minute load at the start and end of every run.

