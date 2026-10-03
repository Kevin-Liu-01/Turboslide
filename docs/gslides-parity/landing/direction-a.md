# Direction A: quiet object

Landing designer A's note for the `/home` redesign. Kevin wrote on 2026-10-02: "make the landing much better inspired off of lovefrom and openai brand and make the landing much more interactive and showing off features featuring the best of graphic and motion design". Direction A leans on LoveFrom: restraint, open paper, the product shown as a made object, few sections with one idea each, rare and exact motion, and interaction by touching the object itself.

Written 2026-10-02 in the worktree `/Users/kevinliu/repos/Turboslide-landing` on `landing/redesign` at `2108dad4`. Nothing outside `docs/gslides-parity/landing/` was written, no git write command ran, nothing was pushed or deployed. The five research notes beside this one are the sources (`research-lovefrom.md`, `research-openai.md`, `research-product.md`, `research-motion.md`, `research-current.md`, all read on 2026-10-02); every claim about lovefrom.com, openai.com or another site below is theirs, with the URL they read and the date they read it (2026-10-02). No site was fetched for this note.

- Prototype: `docs/gslides-parity/landing/direction-a/index.html` with `a.css`, `a.js`, `tone-lighthouse.js` and `fonts/inter.css` beside it. It opens from `file://` and makes no network request.
- Probes and their results: `docs/gslides-parity/landing/direction-a/probe/`.
- Pictures: `docs/gslides-parity/landing/direction-a/shots/` (section 11).

## 1. The idea

The page is one deck, and every band holds one of its slides as a made object. The hero is a title slide in the GT deck's grammar (the 1600 by 900 sheet, rails and rules at 56 units, crosses, the mark and the counter), and its title is the page's h1, so the claim and the demonstration are the same object. The visitor works on these slides the way the editor works: selects the title and types into it, drags, resizes and rotates the example deck's lighthouse heading, renames the customer on three slides at once, picks a slide up and moves it, watches an agent write a slide through three commands, and finally presents the page itself, with every change they made, in a show that takes over one band. Around each object the page says one heading and one sentence. Motion is slow, exact and rare: the hero builds its slide once, the lighthouse picture develops through the Bayer screen once, the closing slide's mark assembles once; everything else moves only when the visitor moves it.

## 2. The sections in order, with their copy

The copy is final and in Kevin's register: sentence case headings without trailing periods, Title Case buttons, short declarative sentences, no em dashes, no exclamation marks, no metaphors, no "X, not Y" pairs, no eyebrows. The page's own words come to 345 (the hero slide's title and subtitle included; the demo deck's slide text and the terminal panel are content and are not counted; counted by a script over `index.html`), under the 350 of `decks.home.copy-rules`. A script checked the copy against `FORBIDDEN_WORDS`, `FORBIDDEN_PHRASES` and `REPORT_WORDS` of `apps/studio/src/components/home/copy.ts` and found none. Every count is a value of `packages/theme/brand/facts.json` (written 2026-09-29), set by the script from one `FACTS` object as `HomeFacts` does in the product.

| # | Band | What is on it | Copy |
| --- | --- | --- | --- |
| 0 | Navigation | 58 px bar in the 1104 px column: the 24 px mark and the word, Documentation, Light and Dark, New Presentation. At 390 px it takes two rows. | Turboslide · Documentation · Light · Dark · New Presentation |
| 1 | The slide (hero) | A title slide at the column's width (1022 by 575 at 1440). Its title is the page's h1; its subtitle is typed once on the first view. Under it one line and three controls. | Slide: **Turboslide is a slides editor in the browser** / It has Google Slides' menus and shortcuts. No account is needed. Under it: Click the title to select it, then drag it or click again to type. Buttons: Undo, New Presentation, Open the Example Deck |
| 2 | Everything on a slide moves | The example deck's mood slide (`mood-lighthouse`, slide 46 of the GT deck) at the column's width: the Louisbourg lighthouse printed live through the 8 by 8 Bayer screen at 2 px cells, the plate lower right with its heading, text and credit, each an object. | **Everything on a slide moves** / Drag, resize and rotate any object. The first drag turns the slide into a canvas. Undo puts the layout back. Under the slide: Layout Mood (Canvas after a change) · Hold Shift to rotate in 15 degree steps. · Undo |
| 3 | One name on every slide | Tools > Tailor for a customer drawn as ruled rows (Replace, With, the count, Apply, the snackbar with Undo), over a filmstrip of three slides of a customer deck ("Onboarding plan for Northwind", "What Northwind gets", "The first Northwind deck ships in week one") whose slides can be picked up and moved. | **One name on every slide** / Tools > Tailor for a customer replaces the customer's name in every slide's text and notes as one change. Drag a slide to move it. Rows: Replace Northwind · With [Customer name] · 8 places on 3 slides · Apply. After Apply: Tailored for Globex: 8 places on 3 slides · Undo |
| 4 | Agents run the same actions | The `#101010` panel (the page's one monospace) with the CLI's real `--version` banner, Run, a step count; beside it the slide the agent writes (absent until the first command), and Version history as ruled rows naming You or Agent for every change made on the page. | **Agents run the same actions** / Every menu row is one of 193 actions. Agents send the same actions over the CLI, MCP or HTTP, and Version history names who made each change. Panel commands: `slide new --layout rows`, then two `slide patch` writes. Empty history: Changes on this page appear here with their author. |
| 5 | Present from the browser | The current slide of the page's deck and a filmstrip of all of them, as the visitor left them. Present (or S) turns the band into the show: ink ground, the slide on the stage, counter, notes, timer, Previous, Next, Exit. | **Present from the browser** / This page is a deck, with your changes. Present it here and page with the arrow keys. Button: Present, or press S |
| 6 | Turboslide today | Seven ruled rows, a Heroicon solid in each key cell and a figure at the right, the page's densest evidence. | **Turboslide today** / Menus: File to Help in Google's order, with Google's shortcuts. 9 · Layouts: A new slide starts from one of them. 22 · Shapes: Drawn from their PowerPoint definitions. 135 · Actions: The menus, the CLI, 169 MCP tools and 177 HTTP paths call one table. 193 · Export: PDF and PowerPoint. The worst PowerPoint page of the example deck differs from the screen by this share. Read the export record. 0.003% · Materials: Shader backgrounds, each with a still for downloads. 17 · License: Run it from a checkout or deploy it to Vercel. MIT |
| 7 | The close | The deck's last slide, signed: the mark (it assembles once), the word, and "Made in Turboslide. Set in Inter." Under it one heading, one sentence, two buttons, on the centre axis. | **A new presentation needs no account** / New Presentation opens a blank deck in the editor. The first edit saves it. Buttons: New Presentation, Open the Example Deck |
| 8 | Footer | The lockup, four links and the legal line. | Your presentations · Documentation · GitHub · License / Turboslide is made by General Translation. Google Slides is a product of Google LLC. |

The page deck has six slides (hero, mood, the three customer slides, the close) and seven once the agent adds its slide; every counter on the page renumbers itself, and so do the Present filmstrip and the show.

## 3. The interactions

Every one of these works in the prototype and was driven by a script on 2026-10-02 (section 9 lists the run).

1. **Select.** A click (or Tab) on an object of the hero or mood slide draws the editor's selection: a 1 px ring in `#2f5ce0`, eight square handles, the rotation stem and knob, and the role chip ("Title", "Subtitle", "Shape", "Body", "Caption"), in the order and look of the product's own (`research-product.md` 5.1). On a phone the first tap only selects, so the page still scrolls under an unselected box; the selected box takes `touch-action: none` and moves.
2. **Move.** Drag follows the pointer with no easing. Within 6 px of the slide's centre lines or its content margins (137 and 1463 units across, 129 and 771 down) the box snaps and a 1 px guide shows. Alt drags without snapping. Arrow keys nudge 4 units, Shift with an arrow 40; nudges within 700 ms are one undo step.
3. **Resize.** Any of the eight handles; the opposite side stays where it was even on a rotated box (the math works in the box's own axes). Text rewraps live.
4. **Rotate.** The knob turns the box about its centre in whole degrees, in 15 degree steps with Shift; the chip reads the angle while turning. `[` and `]` turn by 15 degrees from the keyboard.
5. **Type in place.** A second click on a selected text box (or Enter) makes it editable at the pointer, with a selection blue caret; Escape or a click elsewhere ends the edit. The hero's h1 is the text being edited.
6. **Undo.** Each band's Undo, or Cmd+Z / Ctrl+Z outside a text field, undoes the last change in the band last touched. A move or a turn returns on the move curve (M8). On the mood slide the first change turns the Layout row from Mood to Canvas, and the last Undo turns it back, the product's sentence made visible.
7. **Tailor for a customer.** Type a name in With and press Apply (or Enter). The count sentence and the result sentence are the product's (`packages/chrome/src/panels/assist-strings.ts` `TAILOR.count`; the snackbar's "Tailored for Globex: 9 places on 8 slides" of `research-product.md` 5.2); the count includes the hidden speaker notes. Names change in reading order and light as selected text (M10). Undo puts the old name back. An empty field answers "Type a customer name first".
8. **Pick a slide up and move it.** Drag a filmstrip slide: it lifts with a 2 px selection outline, the others make room (M11), on release it settles in its new place (M12) and every counter renumbers. On a touch screen a 350 ms press lifts it (so a swipe still scrolls). Ctrl or Cmd with an arrow key moves the focused slide. Undo puts it back.
9. **Run an agent.** Run plays one of three commands: the command is printed, its JSON answer follows a line at a time (M13), and one beat later the slide changes: `slide new` adds slide 6 with the Ruled rows layout (its rails draw out of their crosses, its placeholders read "Click to add title" and "Click to add text"), the first `slide patch` writes the title and text with the agent's ink flag over them (M15), the second fills the three rows. The agent writes the customer's current name, so a visitor who tailored first sees "Week one at Globex". After step 3 the button reads Run Again.
10. **Version history.** Every change on the page, the visitor's and the agent's, lands as a ruled row with the Heroicon, the author ("You" or "Agent"), the change in words ("Moved the heading on slide 2", "Tailored for Globex: 8 places on 3 slides", "Added slide 6 with the Ruled rows layout") and the clock time (M16).
11. **Present.** Present, or S while the band is at least half in view, turns the band into the show (M17, M18). Right, Down, Page Down, Space, Enter or a click go forward; Left, Up, Page Up, Backspace go back; Home and End; Escape or Exit returns (M20). The show is the page's own slides as the visitor left them: the moved title, the turned heading, the customer's name, the agent's slide. The bar shows the counter, the slide's notes and a running timer. The filmstrip's thumbnails choose the slide the show starts on.
12. **Appearance.** Light and Dark buttons store `gt-theme` (the product's key) and the page restyles at once; the lighthouse is printed again in the other appearance's ink and paper (the deck's twins are exact inverses, checked on 2026-10-02: every one of the 1,440,000 pixels differs).
13. **Hover and press.** Grounds change in 120 ms; buttons scale to 0.98 on press (M23, M24). Hover outlines on objects only under `(hover: hover) and (pointer: fine)`.
14. **Keyboard reach.** Every object, filmstrip slide, field and button is reachable with Tab; focus rings are 2 px selection blue. The show is a modal dialog that takes focus and returns it to Present.
15. **Print.** The print stylesheet prints the hero slide alone, the page's defined still (LoveFrom's print wordmark, `research-lovefrom.md` rule 18).

## 4. The motion table

The same table heads `direction-a/a.css`. Curves: arrive `cubic-bezier(0.16, 1, 0.3, 1)` (expo.out), move `cubic-bezier(0.65, 0, 0.35, 1)` (power2.inOut), tone `cubic-bezier(0.333, 0, 0.667, 1)` (smoothstep), fade `ease-out`, process `linear` (`research-motion.md` 4.3, from Prototemplate `motion/MOTION.md`). No bounce, overshoot, blur, glow or scroll link; the page scrolls natively (`scroll-behavior: auto` on `html`).

| Id | What moves | Starts | Duration | Delay or stagger | Easing |
| --- | --- | --- | --- | --- | --- |
| M1 | Hero slide: its two rails and two rules draw out of their crosses | load, fonts ready, two frames | 600 ms per line | 0, 60, 120, 180 ms | arrive |
| M2 | Hero caret appears and blinks once | M1 + 300 ms | 1000 ms cycle: 400 off, 90 rising, 510 on (LoveFrom's cursor, `research-lovefrom.md` 4a) | one cycle | steps |
| M3 | Hero subtitle typed | M1 + 900 ms | 3.6 s: 34 to 60 ms a key (fixed seed), +30 ms at a space, +280 ms after a stop; the last key at 4,510 ms | per key | process |
| M4 | Caret holds on the last letter, then leaves | end of M3 | 400 ms; the sequence ends at 4,910 ms | | steps |
| M5 | Mood picture develops: tone raised from 0 to the picture's, cells switch in Bayer order | the slide 35 percent in view, once | 2400 ms | Bayer order | tone |
| M6 | Selection ring, handles, chip | press or focus | 0 ms (the editor's) | | |
| M7 | Object follows the pointer (move, resize, rotate) | pointer | 0 ms (direct) | | |
| M8 | Undo returns an object to its last place | Undo, Cmd+Z | 300 ms + distance / 2, at most 700 ms | | move |
| M9 | Snap guide | within 6 px of a guide | 0 ms | | |
| M10 | Tailor: each name set and lit as selected text | Apply | lit 900 ms, unlit 160 ms | 55 ms a name, reading order | fade |
| M11 | Filmstrip: the other slides make room | a lifted slide passes a place | 200 ms | | arrive |
| M12 | Filmstrip: the dropped slide settles | release | 240 ms | | arrive |
| M13 | Agent's answer prints | Run | 120 ms a line | 55 ms a line, from 200 ms | fade |
| M14 | Agent's new slide: rails draw out of crosses | answer printed + 500 ms (one beat) | 600 ms a line | 60 ms | arrive |
| M15 | Agent's words land with the agent's flag | answer printed + 500 ms | 160 ms; the flag holds 1800 ms, leaves in 160 ms | | fade |
| M16 | Version history row enters | any change | 200 ms, 8 px | | arrive |
| M17 | Present: the band's ground turns to ink | Present or S | 300 ms | | fade |
| M18 | Present: the slide moves from its place to the stage | Present or S | 500 ms | | move |
| M19 | Present: next or previous slide | keys, click | 0 ms (a cut, as Slideshow) | | |
| M20 | Present: Exit returns the slide to its place | Escape, Exit | 400 ms; ground 300 ms | | move, fade |
| M21 | Present: timer | while showing | 1 s steps | | process |
| M22 | Closing slide: the mark's seven bars arrive from the left | the slide 35 percent in view, once | 600 ms each, 48 units of travel; opacity 120 ms | 70 ms, leftmost first | arrive |
| M23 | Buttons: ground on hover and press | hover, press | 120 ms | | fade |
| M24 | Buttons: press | press | 120 ms, scale 0.98 | | fade |

Rules the table keeps:

- The first screen paints final type. The h1 is in the markup and visible from the first frame (it is the LCP element, section 7). M1 hides only the slide's four hairlines until they draw, and M3 hides only the subtitle's untyped letters with `color: transparent`, so the words are in the accessibility tree and the layout from the first frame. The caret is a 3 unit bar drawn at the end of the typed letters (an outset `box-shadow` on the span: it draws a line, not a shadow), so typing moves no box. A CSS fallback shows the subtitle at 9 s if the script never runs. The first paint itself waits for Inter (at most 800 ms), as lovefrom.com's does, so no fallback face is ever shown.
- Nothing loops. The longest automatic sequence is the hero's, which ends 4,910 ms after it starts (4,320 and 4,840 ms for the two return visit sentences), inside WCAG 2.2.2's five seconds (`research-motion.md` 4.5); any key or press in the hero ends it at once at its end state.
- In-view motions (M5, M22) play once and never replay on scrolling back. M22's hidden first pose is set by the script only when the observer arms below the viewport, so a page without script shows the mark whole. The lighthouse is printed by the script, so without script its slide shows the plate on paper; the product would put a still print (the deck's 2 px twin, cropped) in the markup and let the develop replace it.
- Under `prefers-reduced-motion: reduce` the boot script never sets the intro classes, the duration tokens are 0 ms, no Web Animation is created, the lighthouse is printed at full tone at once, Undo jumps, the show opens and closes with no move, and the mark is drawn still. Colour changes (the Tailor highlight, hover grounds) still happen, without transitions. A change of the setting while the page is open finishes every running animation.
- `?slow=10` multiplies the page's own timers by ten; the frame strips used it with the DevTools protocol slowing CSS and Web Animations by the same factor, so their times are animation time.

## 5. How LoveFrom's and OpenAI's craft becomes Turboslide's own

None of their logos, typefaces, images or copy is in the prototype. What carries over is method.

| Their craft (source) | In Direction A |
| --- | --- |
| LoveFrom's home is one made thing, built in front of the visitor once, then still (`research-lovefrom.md` 1, 8, rules 1 and 2) | The hero is one slide, built once (its hairlines draw, its subtitle is typed) and then still. The thing being made is the product's own unit, a slide, so the page does what the product does |
| LoveFrom types "LoveFrom" on an uneven human rhythm behind a blinking cursor (rule 3; 400 off, 90 rise, 510 on) | The subtitle is typed at 34 to 60 ms a key with a pause after the stop, behind a selection blue caret with the same blink. The caret is the editor's text caret, so the flourish is product behaviour. LoveFrom's 170 to 240 ms a letter suits one word; a sentence at that pace would take 13 s, so the rhythm is a fast typist's and the whole sequence stays under 5 s |
| Thirteen commas, one per visit, in order, random after two days, the first when storage fails (rule 4) | Three true subtitles, one per visit, by the same rule (`ts-a-visit` in `localStorage`); the prerendered page carries the first, the site description |
| One subject per screen; the wordmark is about 4 percent of the screen with nothing competing (rule 1) | Each band is one heading, one sentence and one object. No icons before headings, no cards, no logo wall, no diagram that restates a list |
| The book's Polaroid develops over seconds on long curves; nothing the reader needs waits for it (rule 13) | The lighthouse develops through the Bayer screen over 2.4 s on smoothstep, the brand's tone mix (`motion/MOTION.md` "Texture"), never an alpha fade. Its plate text is there before it |
| Show a made object in parts, each plainly lit (the Luce interior before the exterior; rule 14) | The editor is shown one part per band: the text box, the canvas, the Tailor dialog and filmstrip, the agent's surface, the show. No device frame, no shadow, the sheet mat as the one frame |
| Explain a mechanism with a working model of itself (Moncler's paper models, rule 15) | The page is a model of the product: a six slide deck the visitor edits, tailors, reorders, hands to an agent and presents |
| State what changed as an exact list of parts (the LP12-50, rule 16) | "Turboslide today" is seven ruled rows of exact counts from `facts.json`, and Version history lists every change in words |
| Sign the work on the work (rule 17) | The closing slide reads "Made in Turboslide. Set in Inter." |
| A defined still for print and for visitors without motion (rule 18) | The print stylesheet prints the hero slide alone; reduced motion gets every end state |
| OpenAI's home puts the working product in the first screen, one real input (`research-openai.md` 4.1, rule 1) | The hero slide is a working text box; its title is the h1 the visitor can retype |
| A title arrives once and never waits for imagery (rule 2; Astra's title waiting for its canvas is the counterexample, 9) | The h1 is final markup at first paint and the LCP; only hairlines and untyped letters wait |
| Working viewers of real output with previous, next and a counter (Astra's two slide viewers, 4.2) | The Present band is a working viewer of the page's own slides, with the counter, notes and a timer |
| Big type carries the page by being alone, weight 500, tracking tighter with size (3) | One weight for headings (500), the deck's ladder inside slides (88, 44, 72, 26, 22, 15 units), the page's h2 at 36 px with -0.025 em |
| Charts and tables hold still; the page ends on its densest evidence (rules 6 and 13) | The parts table never animates and closes the content before the signed last slide |
| Every moving thing can be stopped, captions say what a thing is (rules 8, 10, 11) | Nothing loops; the hero sequence stops on any input; each band's sentence says what the object is and what to do with it |
| What not to take: LoveFrom's scroll capture, smooth scrolling, springs with overshoot, the mascot, blocked zoom and selection, ignored reduced motion; OpenAI's date eyebrow and em dashes (`research-lovefrom.md` 9, `research-openai.md` 9) | Native scroll, `scroll-behavior: auto`, no overshoot anywhere, no character, pinch zoom and text selection allowed, reduced motion honoured, no eyebrows, no em dashes |

Inter is the only typeface. A serif voice in LoveFrom's manner is not proposed: the LoveFrom researcher found Inter's own optical size axis (`opsz` 14 to 32 in `InterVariable.woff2`) to be Turboslide's equivalent device, and the prototype's subset keeps that axis so display sizes get Inter's display cut.

## 6. What is live product code and what is staged

Nothing in the prototype imports product code; it is a static page. Each part is marked by what it would be in the product.

| Part | In the prototype | In the product |
| --- | --- | --- |
| Slides | Hand written HTML in the deck's grammar (classes after `Prototemplate deck/parts/head.html`), scaled by container query units: 1 unit = 1/1600 of the sheet | Rendered at build by `renderSlide` from a landing fixture deck and inlined with `sheet.css` (8.4 KB gzip; `research-product.md` 2.2), never the renderer in the browser (173 KB gzip) |
| Mood slide text | The real GT deck slide `mood-lighthouse` (`decks/gt-brand/slides/mood-lighthouse.json`) and its credit | The same slide from the fixture deck |
| Lighthouse picture | `tone-lighthouse.js`: the deck's two tone print (`decks/gt-brand/assets/mood-lighthouse-light.jpg`) blurred back to tone (Gaussian 3.2 px) and stored as a 640 by 360 grey JPEG data URI (20 KB); `a.js` prints it through the 8 by 8 Bayer matrix at 2 px cells | The same, with `@turboslide/effects/bayer` (534 B gzip) for the matrix and the tone map built by `scripts/build-home-assets.ts` |
| Selection, move, resize, rotate, type, guides | A replica in `a.js` (`SheetEditor`), drawn in the product's selection grammar | Staged in the same way: a home only module of about 6 KB gzip, pinned to the editor by a visual test of the ring, handles and chip; the editor itself stays behind Open the Example Deck |
| Tailor | The product's sentences (`TAILOR.count`, the snackbar), a text replace over the page's own `.cust` spans | Staged the same way; `deck.tailor` is the real action, named in the copy |
| Filmstrip move | Live DOM reorder with FLIP | Staged the same way |
| CLI banner | The real output of `turboslide --version` on 2026-10-02 (`product/cli-version.txt`) | The same, captured at build |
| Agent commands and answers | Staged. The commands use real command forms and action ids (`slide new --layout rows`, `slide patch <id> --set <pointer>=<value>`, `slide.new`, `slide.update`, the Ruled rows layout of `packages/schema/src/layouts.ts`), but the JSON answers are written for the page and the third command's object value is not known to be accepted | Recorded from the CLI against a temporary copy of the fixture deck at build, with the recording's sha checked like `facts-data.ts` |
| Version history | A list the page keeps | Staged the same way, in the product's Version history row grammar |
| Present | A show inside the band over clones of the page's slides | Staged; the real Slideshow and Presenter view are in the editor |
| Counts | `FACTS` in `a.js`, copied from `facts.json` | `HomeFacts` from `facts-data.ts` |
| Font | `packages/fonts/assets/InterVariable.woff2` subset to Latin and limited to weights 400 to 500 with fontTools (both axes kept): 39,764 bytes against 352,240, inlined in `fonts/inter.css` as a data URI because a preload cannot cross the `file://` origin | The same subset for `/home` as a preloaded file (`audit-performance` item 10) |
| Mark | `packages/theme/brand/mark.svg` (seven sub-paths split for M22) and `mark-24.svg` | The same files through `packages/theme/brand` |

## 7. The budget

Bytes of the prototype, from disk on 2026-10-02 at 17:50 PDT (brotli at quality 11, as an edge would serve them). There are no picture files: the one picture is a tone map inside a script.

| File | Raw | gzip | brotli |
| --- | ---: | ---: | ---: |
| `index.html` | 26,581 | 7,223 | 5,960 |
| `fonts/inter.css` (the Inter subset as a data URI; the 39,764 byte `InterVariable-latin-400-500.woff2` beside it is the same face as a file) | 53,545 | 40,597 | 40,137 |
| `a.css` | 35,445 | 8,784 | 7,565 |
| `a.js` | 52,007 | 15,311 | 13,408 |
| `tone-lighthouse.js` (the lighthouse as a 640 by 360 tone map, 20,423 bytes of JPEG) | 27,666 | 20,128 | 19,945 |
| Total | 195,244 | 92,043 | 87,015 |

Main thread and paint, measured with `direction-a/probe/perf.mjs` on 2026-10-02 at 17:46 PDT (the final run, after every fix of section 9): three cold loads at each size from `file://`, Chrome for Testing through the worktree's `playwright-core`, device scale 1, the DevTools protocol's `Performance.getMetrics` at the load event and again 6.5 s later (after the hero sequence, 4.9 s, has ended), paint and shift entries from `PerformanceObserver`, and the page's own `requestAnimationFrame` calls counted by a wrapper. The machine's one minute load was 51 to 54 (three pipelines were running in other worktrees; it never fell under 30 in this session, so every run was one short browser run), so time figures are upper bounds; bytes and counts do not move with load. Medians of three, the worst in brackets:

| Reading | 1440 by 900 | 390 by 844 |
| --- | --- | --- |
| First contentful paint | 44 (44) ms | 40 (52) ms |
| Largest contentful paint | 44 (44) ms, the hero's h1 | 40 (52) ms, band 2's sentence (the hero slide is shorter on a phone, so band 2's paragraph is the largest text in view); both are text painted in the first frame |
| Cumulative layout shift | 0 in every run | 0 in every run |
| Long tasks | none | none |
| Main thread at the load event (task / script) | 40 / 8 ms | 40 / 7 (8) ms |
| Main thread for the first screen, load to 6.5 s later (task / script / layout / style) | 98 (100) / 11 (12) / 21 / 12 ms | 173 (177) / 59 / 23 / 14 ms; on a phone the lighthouse band is 35 percent in view in the first screen, so its develop runs then |
| Idle afterwards, 2 s with nothing touched | 1 to 2 ms of task time, 0 animation frame calls, 0 animations held | 1 ms, 0 calls, 0 animations |
| One frame of the develop (M5) | 0.8 ms for 511 by 287 cells | 0.1 ms for 162 by 91 cells |

Layout shift was not zero before two fixes, and the fixes are part of the design: shifts of 0.0028 came from the hero's objects being placed by script after load and from the typed caret moving as an inline box, so the hero's objects now sit in the deck's own flow until the first move pins them, and the caret is drawn on the typed letters; a shift of 0.0002 (desktop) and 0.002 (phone) came from the fallback face being laid out before Inter arrived, so the first paint now waits for Inter as lovefrom.com does (`research-lovefrom.md` 2: the body stays at opacity 0 until the font is ready), for at most 800 ms, with a CSS fallback at 1.2 s.

Against the standing `/home` budgets (`research-current.md` 6.2, from `docs/gslides-parity/next/audit-performance.md` section 5 and row `decks.home.load-budget`): JavaScript 600 KB decoded, of which this page's own code is 80 KB with the tone map (the product would add its shared entry chunk, 1,176,073 bytes decoded today, so the entry chunk split of `audit-performance` item 1 stays a prerequisite); fonts 120 KB, met at 40 KB over the wire; images before the first scroll 300 KB, met with no picture file at all (the first screen is type and hairlines, and the lighthouse is 20 KB of tone printed live); the document under 60 KB, met at 27 KB before the slides are rendered at build (the product's renderer CSS adds 29 KB inline today, audit item 13); LCP under 400 ms, met at 44 ms from `file://`; CLS 0, met; no long animation frame over 100 ms, met (no long task at all). The motion research's budget for motion code after load (`research-motion.md` 4.9: 15 KB gzip, under 10 ms of main thread per band entering, under 2 ms a frame for a field) is met by the script at 15.3 KB gzip and the develop at 0.8 ms a frame; nothing runs at idle.

Page length: 5,719 px at 1440 and 5,819 px at 390, against the 5,000 and 8,500 of `decks.home.pictures-three-widths`. The desktop page is 719 px over; the cause is two slides at the column's full width. Kevin can raise the row's ceiling to 6,000, or the bands can drop to 96 px of padding (about 5,430 px).

## 8. What it would take to build in the product

Files (all in `apps/studio` unless named):

- `src/routes/home.tsx`: the eight bands in this order; keeps the prerender, `main#top.ts-product[data-page="home"]`, `data-hydrated`, the speculation rules and the head.
- `src/components/home/`: new `HomeSlide.tsx` (a build time slide in a stage), `HomeHero.tsx`, `HomeCanvas.tsx` (rewritten), `HomeTailor.tsx`, `HomeAgents.tsx` (rewritten), `HomePresent.tsx` (rewritten), `HomeParts.tsx` (replaces `HomeNumbers.tsx` and the menus and export bands), `HomeClose.tsx` (replaces `HomeLicence.tsx`); `copy.ts` and `copy.test.ts` for the new strings; `facts.ts` gains shapes and materials. Retired: `HomeMenus.tsx`, `HomeExport.tsx`, `diagrams/`, `Shot.tsx` and `shots.json` (no capture on the page), `MoodFigure.tsx` if unused.
- `src/components/home/live/`, one lazily imported client module after hydration (target 15 KB gzip): `objects.ts` (select, move, resize, rotate, type, guides, Undo), `tailor.ts`, `filmstrip.ts`, `agents.ts` (plays the recorded run), `history.ts`, `show.ts`, `develop.ts` (the tone map through `@turboslide/effects/bayer`), `motion.ts` (the motion tokens, in-view once, reduced motion).
- `src/routes/home.css` and `src/components/home/grammar.css`: the motion tokens and table, the selection layer (or an import of the editor's selection CSS from `packages/chrome`), the slide stage.
- `decks/landing/`: the fixture deck (six slides: the hero title, `mood-lighthouse`, the three Northwind slides, the close) with its notes, so the page and a future `/deck/landing` share one source.
- `scripts/build-home-assets.ts`: render the fixture deck's slides with `renderSlide` to inline HTML; write the tone map from `mood-lighthouse-light.jpg`; record the agent run with the CLI on a temporary copy of the fixture deck; write the Inter subset for `/home`; `--check` for all four.
- `e2e/home-page.spec.ts` and `docs/gslides-parity/focus/core-matrix.json`: replace "Nothing animates" (POLISH.md 3.2) with the motion rows of section 4 and their reduced motion stills; new rows for each interaction of section 3 (edit, canvas and Undo, Tailor and Undo, filmstrip move, agent run, show and keys, keyboard reach, reduced motion); keep CLS 0 at 1440 and 390 over a load and a scroll; keep the `ShaderMount` test (no shader is loaded); restate `decks.home.copy-rules` for slide content and raise or keep `decks.home.pictures-three-widths`; `decks.home.capture-plain` retires with the captures.
- Docs: `docs/POLISH.md` section 3 and `docs/brand.md` section 11 (blue on `/home` as the live selection only).

Size: about 7 pipeline days across four lanes, roughly 3 days of wall time: build time slides, the fixture deck, the tone map and the recorded run (1.5 days); the live module for objects, Tailor and the filmstrip (2 days); agents, history, the show and the motion layer with reduced motion and the phone (2 days); spec rows, tests and the copy lint (1.5 days). The entry chunk split and the Inter subset (audit items 1 and 10) are prerequisites outside this count.

## 9. How it was checked

All on 2026-10-02 between 17:00 and 17:50 PDT, from `file://`, one short browser run at a time at a one minute load of 47 to 65 (a spike to 225 at 17:10 was waited out in 30 s steps until it fell under 60 at 17:14; the load never fell under 30 in the session). The scripts are in `direction-a/probe/` (they write frames to the session's scratchpad; the paths at their heads say where).

- `drive.mjs` (result in `probe/drive-result.json`): selects the hero title, drags it, edits it in place and types, undoes both (the title text and the layout come back, the inline position is cleared); selects the lighthouse heading, resizes it, rotates it with Shift (90 degrees), drags it off the plate (Layout reads Canvas); tailors for Globex (8 places on 3 slides, every name replaced, the snackbar in the product's words); drags the first filmstrip slide to the last place (the counters read 3, 4, 5 in the new order); runs the three agent commands (slide 6 written as "Week one at Globex" with its three rows, every counter reads n / 7); reads Version history (six rows naming You and Agent); presses S, two Right arrows (slide 3 of 7 with its notes) and Escape. No console error and no page error.
- `reduced.mjs` (result in `probe/reduced-result.json`): with `prefers-reduced-motion: reduce` the page carries no intro class, the subtitle is whole at 300 ms, `document.getAnimations()` is empty at load, after Tailor, in the show and at the end; the lighthouse is printed at full tone the moment it is scrolled to (`shots/reduced-motion-mood-200ms.png`); the show opens and closes at once; the mark is drawn still.
- `cls.mjs` (result in `probe/cls-result.txt`): no layout shift entry at all at 1440 by 900 and 390 by 844 over the load and the whole hero sequence.
- `perf.mjs` (result in `probe/perf.json`): section 7.
- `strips.mjs` with `compose.py`: the frame strips of section 11. Timed strips ran the page at a tenth of speed (`?slow=10` for the page's timers and the DevTools protocol's `Animation.setPlaybackRate` at 0.1 for CSS and Web Animations), so a frame's label is animation time, true to about 20 ms; strips of gestures are labelled by step.
- `full.mjs`: the full pages and first screens at 1440 by 900 and 390 by 844 in both appearances, after scrolling through the page so the in-view motions have played.
- A script checked the page's words against the copy lint lists of `apps/studio/src/components/home/copy.ts` and counted them (section 2).

What the pictures showed and what was fixed on the way: the agent panel's block letter banner had gaps between its rows (now set at the terminal's line pitch, and smaller on a phone so it does not wrap); the phone's hero buttons wrapped unevenly (now full width); the caret showed before its first blink (now hidden until it); the develop ran ten times too slowly under the capture's slowed clock because it read the frame clock (now the wall clock); the clones in the show kept the Tailor highlight (now cleared); typing after End in the hand broken h1 let Chromium scroll the page by up to 2,000 px (the page now holds its scroll while a box is being typed into); the layout shifts of section 7.

## 10. Risks

1. Three standing decisions are reversed and are Kevin's to make: POLISH.md 3.2 "Nothing animates" (and the rows and tests of `research-current.md` 5.7), POLISH.md 3.3 item 3 "no dither on the page" (the lighthouse band; question 5 is kept, since the mood picture is not on the first screen), and `docs/brand.md` section 11's "/home draws no blue": here `#2f5ce0` appears as the editor's live selection, caret, snap guide, Tailor highlight, lifted slide outline and focus ring, only while something is being worked on (and the hero caret for about 4 s).
2. The h1 lives inside a slide. On a phone the hero slide holds a reading floor (27 px title, 12.5 px subtitle) that `renderSlide` would not produce at 358 px, so the phone hero is a landing only composition, and its subtitle wraps to three lines at 390.
3. The editing is a replica of the editor (ring, handles, chip, rotation knob, guides, nudge steps), not the editor's code, and can drift from it. The editor's snap guide is magenta (`--pt-guide`); the prototype draws it in the selection blue to keep one interface colour, which differs from the product.
4. The agent run is staged. The commands use real forms and action ids, but the JSON answers are written for the page and the third command's object value (`--set '/slots/right/0/items/0={...}'`) is not known to be accepted by `slide patch`. The product has to record the run from the CLI at build.
5. The hero sequence moves on its own for 4.9 s, just inside WCAG 2.2.2's five seconds; a longer return visit sentence or a slower rhythm would cross it. Any key or press in the hero ends it, and reduced motion never starts it, but there is no Pause control. Typing a sentence at 34 to 60 ms a key reads as a fast typist, not as LoveFrom's slow word.
6. The first paint waits for Inter (at most 800 ms, a CSS fallback at 1.2 s). From a local data URI that costs a few milliseconds; over a slow network in the product it could delay the first paint, so the product should preload the 40 KB subset and keep the `Inter Fallback` metrics, and measure CLS again.
7. A returning visitor sees a different subtitle (one of three true sentences); the head, the manifest and the card keep `SITE.description`, and the prerendered page carries it, but the hero then differs from the description on a return.
8. The page is 5,719 px tall at 1440, over the 5,000 px row.
9. The 345 words exclude the demo deck's slide text (about 190 words, the lighthouse plate included); `decks.home.copy-rules` has to be restated to count page copy, or the page is over.
10. The lighthouse plate's paragraph is the GT deck's real text ("The site is held to the same standard"), which reads as GT's, not Turboslide's; a landing fixture deck would give the slide Turboslide's words.
11. Present plays inside the band; it is not Slideshow (no full screen, no presenter window). The copy says "Present it here", but a visitor may take it for the product's show. S is taken while the band is at least half in view and nothing is being typed.
12. Tailor, the filmstrip and the agent act on a page only deck (Northwind); Open the Example Deck opens the 85 slide GT deck, which has none of it (`research-product.md` 8, the fixture deck question).
13. Touch: a filmstrip slide lifts after a 350 ms press so that swipes still scroll; a box must be tapped once before it can be dragged; on the 358 px mood slide the plate's text is about 10 px and its boxes are small targets.
14. The lighthouse prints at 2 px cells on a 1x phone screen (162 by 91 cells) and reads coarse; dense screens get 1 px cells, which was not checked on a device.
15. The Menus figure (9) is a count of Google's menu order, not a value of `facts.json`.
16. Every time in section 7 was measured on a machine at a load of about 50 and from `file://`; on the product the shared entry chunk, the server and the network dominate.

## 11. Pictures

All under `docs/gslides-parity/landing/direction-a/shots/`, PNG or JPEG, each under 400 KB. Frame strips are one row of frames with the time or step under each.

| File | What it shows |
| --- | --- |
| `first-1440-light.png`, `first-1440-dark.png` | The first screen at 1440 by 900: the hero slide with the h1, the line under it and the buttons |
| `first-390-light.png`, `first-390-dark.png` | The first screen at 390 by 844: the two row bar, the hero slide with the reading floor, the stacked buttons |
| `page-1440-light.jpg`, `page-1440-dark.jpg` | The whole page at 1440 (5,719 px, scaled to 1200 px wide), after the in-view motions played |
| `page-390-light.jpg`, `page-390-dark.jpg` | The whole page at 390 (1:1) |
| `hero-intro.png` | M1 to M4: rails out of their crosses, the caret, the typed subtitle, ten frames from 0 to 4,900 ms, cropped to the left 60 percent of the slide, where the words are |
| `hero-edit.png` | M6 to M9: select, drag to the centre guide, release, the caret on a second click, typing, Undo of the words and of the move (160 ms in and settled) |
| `mood-develop-light.png`, `mood-develop-dark.png` | M5: the lighthouse developing through the Bayer screen, nine frames from 0 to 2,400 ms, in both appearances |
| `canvas-edit.png` | M6 to M8 on the mood slide: select, resize, drag off the plate (Layout reads Canvas), rotate with Shift (the chip reads the angle), Undo three times on the move curve (Layout reads Mood) |
| `tailor-apply.png` | M10: Apply, names set 55 ms apart and lit, unlit by 1,200 ms, the snackbar |
| `filmstrip-move.png` | M11 and M12: a slide picked up, the others making room, the drop and the settle |
| `agents-run.png` | M13 to M16: step 1's answer printing and the new slide's rails drawing, Version history's first row, then steps 2 and 3 landed |
| `present-show.png` | M17 to M20: S, the ground turning to ink and the slide moving to the stage (0 to 520 ms), two Right arrows (a cut to slide 3 with "Globex"), Escape (150 and 420 ms) |
| `close-mark.png` | M22: the mark's seven bars arriving, eight frames from 0 to 1,020 ms |
| `phone-hero-touch.png` | 390 by 844 with touch: tap to select, touch drag, release, Undo |
| `reduced-motion-mood-200ms.png` | Reduced motion: the lighthouse band 200 ms after it was scrolled to, printed whole with no develop |

No WebM was made; the strips carry the timings.
