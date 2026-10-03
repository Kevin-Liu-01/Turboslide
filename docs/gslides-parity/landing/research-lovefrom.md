# LoveFrom research for the Turboslide landing

This note studies the web work of LoveFrom, the creative collective Jony Ive founded in 2019 with Marc Newson, and turns its craft into rules and ideas for the Turboslide landing (`/home`). It covers lovefrom.com (captured with Playwright at 1440 by 900 and 390 by 844, with its code read for exact timings), two other web surfaces LoveFrom designed (the web edition of *Make Something Wonderful* and the Steve Jobs Archive home), and design press on their type, identity and objects.

Written 2026-10-02, finished at 16:10 PDT. The captures ran at 15:58 to 16:03 PDT with the machine's one minute load average between 50 and 60 (other pipelines were running and the load did not fall under 30 in 27 minutes of five minute waits). Each capture was one short browser run. Timer driven events were measured 5 to 15 ms later than the values in the code, which is the expected lateness under that load; the code's values are the reference and the measured values confirm them.

Every claim about lovefrom.com was read on 2026-10-02 from https://www.lovefrom.com/ and its files (the HTML, `/assets/main-D-Rvg7Ti.css`, `/assets/start-CoP_39B5.css`, `/assets/start-CmwIa23E.js`, `/assets/bearBlob_original-Bwu2wEcI.js`, `/fonts/LF-Serif-Roman-Var.woff2`) and from https://www.lovefrom.com/jony. Claims about the book were read on 2026-10-02 from https://book.stevejobsarchive.com/ and about the archive from https://stevejobsarchive.com/. Press sources are listed with their URL and date in section 13; all were read on 2026-10-02. Fetched pages were treated as data.

## 1. What the site is

- Two pages. https://www.lovefrom.com/robots.txt allows `/` and `/jony` and disallows everything else; every other path tried (`/work`, `/about`, `/marc`) serves the home page.
- The home page is one word on a near white ground: "LoveFrom," set in their own serif, centred on the viewport. The `<title>` is "LoveFrom," and the description is one sentence: "LoveFrom is a creative collective of designers, architects, musicians, filmmakers, writers, engineers and artists."
- There is no navigation bar, footer, project list, image, contact address, cookie banner or call to action. The only control is a round info glyph in the top right corner (centred 22 px from the top and right edges). It opens a panel of three short paragraphs whose one link, "Jony Ive", opens `/jony`, a plain biography in one centred column.
- The page has a defined still for print: a print stylesheet hides everything and writes "LoveFrom," at 60 pt in the middle of the sheet.
- LoveFrom also designed the web edition of *Make Something Wonderful*, whose credits page reads "Designed by LoveFrom" and "Typeset in LoveFrom Serif" (book.stevejobsarchive.com), and the Steve Jobs Archive home is set in a face named `LoveFromSJA` (stevejobsarchive.com; Fast Company, 2023, says a condensed bold cut of LoveFrom Serif was made for the archive's site).
- Since July 2025 LoveFrom has held "deep design and creative responsibilities across OpenAI" (openai.com/sam-and-jony, update of 2025-07-09, read through a search summary because the page returned 403). Kevin's two references are therefore partly the same studio.

## 2. Typography

- One typeface: LoveFrom Serif, a revival of Baskerville drawn by Antonio Cavedoni with Chris Wilson and the engineer Patch Kessler (Fast Company, 2023-05-01; Wallpaper*, 2023-04-28). Its spacing is adjusted with optical size, and Kessler built a tool that renders the outlines as continuous curves (Wallpaper*, 2023-04-28).
- The roman file has one variation axis, optical size (`opsz` 12 to 48, default 48), and the features `calt`, `liga` and `ss01` (read from the font's `fvar` and `GSUB` tables with fontTools). The site sets `font-optical-sizing: auto`, so the 100 px wordmark and the 35 px panel each get the cut drawn for their size. Only the wordmark turns on `ss01`.
- Both font files load with `font-display: block` and the body stays at `opacity: 0` until the script marks the page ready, so a fallback face is never shown and nothing reflows after the page appears.
- One weight, 400, on lovefrom.com. Hierarchy comes from size, place and italic. The book adds `wght` 500 for its titles and 420 for captions; the archive home uses 400 throughout.
- Italic is the link. `a.nav-link` is italic, black, never underlined, `cursor: default`, and on hover fades to 50 percent ink over `0.5s ease-out`. There is no other link or button style.
- Measured sizes:

  | Element | 1440 by 900 | 390 by 844 | Rule |
  | --- | --- | --- | --- |
  | Wordmark | 99.85 px, box 467 by 108 px | 54.6 px, box 255 by 59 px | 14 vw under 640 px; 89.6 px at 640, 92.2 px at 768 and 1024, 95.6 px at 1366, 145.6 px at 2240, interpolated between; capped at 20 dvh under 768 px and 28 dvh above |
  | Panel text | 35 px on 42 px | 35 px on 42 px | CSS default `min(32px, 5.75vw)` on 1.33; a script (`fontScaler`) resizes it so the three paragraphs fill one screen; measure capped at 25.5 em |
  | `/jony` text | 35 px on 46 px, column 541 px wide | 22 px on 29 px | one size for the whole page; paragraphs 1 em apart; page padded 77 px and 60.6 px |
  | Archive h1 | 54 px on 70.2 px, tracking -1.08 px (-0.02 em) | 24.6 px, -0.02 em | weight 400; h2 42 px at -0.02 em |
  | Book text | 25.3 px on 37.95 px | 17.4 px on 26.1 px | `max(min(14px + .75vw, 50px), 14.5px + .75vw)` on 1.5; 16 px under 350 px |

- The wordmark size barely changes from 640 to 1366 px wide and only grows on very large screens. The cap by viewport height keeps a short landscape window from crowding it.
- Line breaks are set by hand. Every line of the panel and of `/jony` is its own `<span>` with `white-space: nowrap; display: block`, so the rag is composed. `/jony` has 54 lines of 15 to 33 characters (mean 25), broken at sense: "Born in London, / he moved to California / in 1992 to join Apple." The archive home breaks its h1 by hand too, with different breaks on the phone.
- Optical centring. A centred line that ends in a stop or comma carries the class `vc` (`padding-left: .2em`, 7 px at 35 px; 14 of the 54 lines on `/jony`), which moves the line right so its ink sits on the centre axis. The book hangs its opening quotation marks outside the measure (`text-indent: -.71ch` on pullquotes).
- Disciplines are listed one per line in alphabetical order (architects, artists, engineers, filmmakers, graphic designers, industrial designers, interaction designers, motion designers, musicians, sound designers, type designers, writers), without bullets or commas.

## 3. Colour, ground and space

- Two values on lovefrom.com: ink `#000000` on paper `#fafafa` (`--color-background`, `theme-color` and the manifest's `background_color`), plus 50 percent ink for hover and `#e0e0e0` for selection on `/jony`. No accent colour.
- The book uses a mid grey ground for its cover, `#f1f1f1` for its pages, black behind photographs, and one blue for notes and page numbers (Arun, 2023-06-04).
- One axis. Everything on lovefrom.com is centred on the vertical centre line; there is no column grid. In landscape the wordmark's box is centred on the viewport; in portrait the wrapper is lifted by 0.47 em so the word reads optically centred.
- One thing per screen. The home shows the word and nothing else. The panel replaces the word: the word fades out in 290 ms as the panel rises, and fades back after the panel leaves.
- At 1440 by 900 the wordmark covers about 4 percent of the viewport (467 by 108 px).
- The archive home separates its blocks with full width hairline rules and small rounded "Learn more" buttons (stevejobsarchive.com, 1440 by 900 capture).

## 4. Motion

Sections 4a to 4c come from the code. Section 4d is what the captures measured: a log written on every animation frame of the page's state (text, opacity, transforms), and the 25 fps screen video resampled at 50 ms for the frame strips.

### 4a. The opening, from the code

1. The comma element mounts first and blinks as a text cursor: CSS `blink`, 1 s, infinite, opacity 0 from 0 to 40 percent of the cycle, rising to 1 by 49 percent and holding to 100 percent (400 ms off, a 90 ms rise, 510 ms on). It blinks for at least 2500 ms (`cursorAnimationDelay`), longer if the bear's engine has not loaded.
2. "LoveFrom" is typed one letter per timer at 0, 230, 410, 610, 1270, 1490, 1660 and 1900 ms (`cursorFrames`). The gaps are 230, 180, 200, 660, 220, 170 and 240 ms: an uneven rhythm with one long pause between "Love" and "From".
3. With the last letter the comma's Lottie plays. The first visit always gets `comma3`, bundled in the script: 60 fps, 408 frames (6.8 s) on a 2000 by 2000 board. The cursor turns into a dot that rises and lands as a full stop, hops once, then swings into a comma: rotation keys of -42, 164, -17, 4 and 0 degrees at frames 166, 204, 274, 316 and 354 (segments of 633, 1167, 700 and 633 ms), each segment on its own strong ease in and out (out tangents x 0.7 and 0.42 at y 0, in tangents x 0.5 to 0.6 at y 1). The settle is keyed by hand with decreasing amplitude.
4. The bear starts a fixed delay after the comma begins (`bearDelay`, 1.92 to 4.33 s by comma; 3.5 s for `comma3`), and the info glyph appears with it.
5. Thirteen comma animations exist. Each visit plays the next one in order (an index and a date in `localStorage` key `lf_ch`); after more than two days away the index is random; when storage fails it is always the first. A returning visitor sees a different comma, and nothing within one visit is random.

### 4b. The panel and the glyph, from the code

- The panel moves on hand written per frame springs (`tn`): velocity += (target - position) x stiffness x dt, then velocity x= damping^dt. Arrival: stiffness 45, damping 4e-6 per second. Simulated at 60 fps over 900 px it is half way at 267 ms, 90 percent at 600 ms and at rest at 1.6 s, with no overshoot (damping ratio about 0.93). Exit: stiffness 100, damping 1e-6, 90 percent gone at 283 ms; its overshoot falls below the window edge and is never seen.
- Every line of the panel after the first rides its own spring (stiffness 60, damping 3e-7) and starts 40 px further behind than the line above (`secondarySpringSpacing`), so the paragraph arrives with open leading and closes up as it lands.
- Line opacity follows position: a line entering at the bottom edge is at 35 percent of its ink (`opacityFloorIn`) and reaches full ink as it rises; leaving, the floor is 15 percent.
- The glyph turns 225 degrees between "i" and "x" on an anime.js spring (mass 1, stiffness 16, damping 6: damping ratio 0.75, 90 percent at 698 ms, 2.8 percent overshoot). Its strokes morph on a stiffer spring (200, 30: ratio 1.06, 90 percent at 298 ms, no overshoot); stem eased `linear`, cross `inCubic`, dot `inQuint`. It appears on (200, 20: 90 percent at 187 ms, 4 percent overshoot) and hides on (mass 0.1, 100, 10: 90 percent at 218 ms, no overshoot). A press scales it to 0.95.
- The bear is a procedural SVG drawing (0.8 MB of script for the original bear, 2.0 MB for a second "iceberg" bear; no canvas or WebGL). Its engine treats each letter of "LoveFrom," as an object (`getAllKeys` returns L, o, v, e, F, r, o, m and the comma). Its own eases are sine in and out, a cosine S curve and an exponential "zeno" ease. Fast Company describes the bear as able to "sniff and follow your cursor" before walking over the letters (Fast Company, 2024-09-25).

### 4c. The book cover, from its CSS

- `drop`: the Polaroid rises from 100 vh below to its place over 6 s on `cubic-bezier(0.455, 0.03, 0.2, 1)`, a slow start and a very long settle.
- `develop` (opacity 0 to 1) on three stacked exposures of the photograph: 8 s on `cubic-bezier(0.16, 1, 0.3, 1)` from 3 s and 12 s on `cubic-bezier(0.7, 0, 0.84, 0)` from 2 s, so the picture gains contrast the way an instant print does. The title develops over 4 s from 6 s and the subtitle over 4 s from 8 s. The cover is complete at about 14 s.
- Interface transitions are short: the navigation bar slides on `transform .45s cubic-bezier(.2,0,0,1)`; opacity transitions are 0.2 to 0.4 s.
- On the desktop the pages snap one per screen (`scroll-snap-type: y mandatory`, measured at 1440 by 900; it measured `none` at 390 by 844), the scroll bar is hidden, and a chapter scrubber replaces it (Arun, 2023-06-04, and the CSS).

### 4d. Measured

| Event | 1440 by 900 | 390 by 844 | Code |
| --- | --- | --- | --- |
| Script takes over (static word cleared, cursor mounted) | 135 ms after navigation | 154 ms | after the font check |
| Cursor blink period | rises at 538, 1538, 2537 ms (1.000 s) | same | 1 s |
| First letter | 2805 ms | 2842 ms | 2500 ms delay plus start up |
| Letters after the first | +242, +417, +615, +1282, +1500, +1666, +1908 ms | +236, +412, +611, +1270, +1495, +1662, +1904 ms | +230, +410, +610, +1270, +1490, +1660, +1900 ms |
| Comma Lottie | 4713 to 11505 ms (6.79 s) | 4746 to 11544 ms | 408 frames at 60 fps |
| Info glyph and bear | 8213 ms (3.50 s after the comma) | 8246 ms | `bearDelay` 3.5 s |
| Panel arrival, 900 px (button) | 50 percent at 249 ms, 90 at 558, 99 at 899, rest at 1356; no overshoot | 50 percent at 251 ms, 90 at 558 | simulated 267 and 600 ms |
| Word fade out during arrival | 290 ms | 290 ms | tied to panel progress |
| Panel exit (button) | gone in 342 ms, half at about 150 ms | gone in about 340 ms | simulated 150 and 283 ms |
| Word fade back | from 210 ms; 70 percent by 450 ms; full at 1.4 s | same | |
| Glyph press | scale down to 0.940 about 350 ms after the press, back up to 1.012 (1.2 percent overshoot) at 725 ms | same | |

- On the phone a 300 px swipe tossed the panel to the top: lines 2 and 3 started 40 and 80 px behind and closed up by about 700 ms, and the first line rose from 4 percent to full ink (mobile-swipe-strip.png).
- Dragging past the top stop moved the panel 262 px beyond it; on release it returned to the stop in about 1.3 s with no overshoot.
- A swipe down took the panel off in about 730 ms and the word faded back.
- In headless Chromium, wheel input over the word (6 and 10 ticks of 60 to 80 px) did not open the panel; the glyph did. The code has a wheel interpreter for the panel, so this note does not claim how wheel input behaves in a desktop browser.
- The bear entered from the right edge at 8.2 s, reached the comma at about 19 s and climbed onto the word; the letters under its feet sank below the baseline (desktop-bear-letters.png).

## 5. Interaction

- Page scrolling is off on the home page (`html { overflow: hidden; overscroll-behavior: none }`). Touch drags and the glyph move the panel between three stops (off screen, top and, when the panel is taller than the screen, bottom); a release tosses it to the nearest stop on its springs.
- The glyph is the one control, 35 px, with a press response, a rotation and a stroke morph.
- `user-select: none` on the body and `maximum-scale=1, user-scalable=no` in the viewport tag: text cannot be selected and the page cannot be pinch zoomed.
- The code reads `prefers-reduced-motion` only to report it to Sentry (`reduced_motion` in the runtime context); nothing on the page changes for it. The typing, the comma and the bear play for every visitor.
- The book remembers the last page read and returns the reader to it, and its chapter scrubber zooms out to show the whole book while moving between chapters (Arun, 2023-06-04).

## 6. Copy register

- Short declarative sentences in the present tense, with no praise of themselves: "LoveFrom is a creative collective." "Founded by Jony Ive with Marc Newson." "Jony Ive is a designer."
- The biography states facts in order (birthplace, move, role, products, patents, honours, the founding, where he lives), one sense unit per line.
- The identity's flourish is punctuation. Peter Saville proposed the comma; Wallpaper* quotes him saying it "performs this kind of inclusive act" (Wallpaper*, 2023-04-28), and Fast Company reports Ive describing it as about the beginning (Fast Company, 2023-05-01). The 2021 launch statement was signed "love & fury" (The Loop, 2021-10-12).

## 7. Restraint: what they leave out

- No work. The site shows no project, client, image or award. The made thing on the page is the page itself: the word is typed, the comma is animated, the bear walks.
- No navigation, footer, social links, newsletter, contact, careers or legal pages.
- No accent colour, second typeface, bold, underline or icon set; one glyph.
- One link on the home page.
- Press reads the slow pace as strategy: no website until two years after founding, the typeface shared after four years, the bear after five (Fast Company, 2024-09-25).

## 8. How they show a made object

- On lovefrom.com the object is built in front of the visitor and the sequence ends on the still mark. The visitor watches the identity being made: the cursor, the typed word, the full stop that becomes a comma.
- *Make Something Wonderful*: the cover Polaroid rises into place and develops like an instant print (section 4c); photographs and documents sit one per page on black (book-cover-strip.png, book-cover-done-1440.png).
- Ferrari Luce: the interior and its interface were shown first, in San Francisco on 2026-02-09, and the exterior on 2026-05-25, so each part was seen on its own (designcompass, 2026-02-10; Driven to Write, 2026-05-27). The interior is described part by part: glass, aluminium and leather, physical buttons and dials, an OLED cluster with analogue needles, a key with E Ink (designcompass, 2026-02-10). The launch photographs are dark studio pictures in deep shadow (Driven to Write, 2026-05-27).
- Linn Sondek LP12-50: the changes are listed exactly: machined metal hinges, a round power switch machined from aluminium, curved edges on the top plate and arm board, a new lid badge, a plinth of compressed beech (Linn, 2023-07-06). Ive's framing was respectful evaluation of an icon (Surface, 2023-07-12).
- Moncler: the jackets shipped with small paper models of the garments that show how the layers attach (Dezeen, 2024-09-24, through a search summary). The mechanism is explained by a model of itself.

## 9. What a Turboslide landing must leave out

These parts of LoveFrom's craft break Kevin's standing rules or plain accessibility:

- Page scroll turned off and the panel driven by drag and wheel springs. The avoid list forbids scroll hijacking and inertia.
- `scroll-behavior: smooth` on `html` (set on both pages) and the book's mandatory scroll snap.
- Springs with overshoot (the glyph's 2.8 and 4 percent, the press's 1.2 percent, the comma's keyed swing). The GT motion brief allows no bounce, elastic or back overshoot (Prototemplate `motion/MOTION.md`, "Motion").
- Ignoring `prefers-reduced-motion`, blocking pinch zoom, blocking text selection.
- A mascot. The brand's marks are type and rectangles; a character would add a second voice.
- Their serif, wordmark, bear, comma, copy and photographs. The landing studies their methods only.
- A serif voice is not proposed here. LoveFrom's serif is their identity; Turboslide's equivalent device is Inter's optical size axis and its exact metrics (idea 4).

## 10. Rules a product landing can use

Each rule names where it was seen.

1. One subject per screen. The first screen holds one made thing and nothing that competes with it (the home page: the word alone; the panel replaces it).
2. Build the subject in front of the reader once, then stop on a still that is a finished composition. The full word is on screen 4.7 s after navigation, and the still is the wordmark.
3. Time it like a person. Uneven gaps (170 to 240 ms) with one long pause at the word boundary (660 ms) read as typing; a constant interval reads as a machine.
4. Reward the return visit. Advance a variant per visit in order, store it per browser, choose at random only after a long absence, and fall back to the first variant when storage fails (the thirteen commas).
5. Size display type from both viewport dimensions: a width based size capped by a share of the height (the wordmark: 14 vw to 6.5 vw by band, capped at 20 to 28 dvh).
6. Hold display sizes nearly constant from tablet to laptop and grow them only on very large screens (89.6 px at 640 px to 95.6 px at 1366 px), so hand set lines keep their breaks.
7. Compose the important line breaks by hand at sense boundaries and lock them (one `nowrap` span per line), with a second set for the phone (the archive h1).
8. Correct the optics of a line: move a centred line that ends in a stop by 0.2 em (`.vc`) and hang an opening quotation mark outside the measure (`text-indent: -.71ch`).
9. One weight for the page; hierarchy by size, place and one typographic device for links (italic). Use the typeface's optical sizes (`font-optical-sizing: auto` on an `opsz` axis) and tighten tracking at display sizes (the archive's -0.02 em at 42 and 54 px).
10. Two values: ink and paper, with half ink for hover.
11. Content arrives on a near critical spring or an expo out curve and does not bounce (the panel: 50 percent at 249 ms, 90 percent at 558 ms, no overshoot).
12. Paragraphs land as paragraphs: each line follows the line above with a short lag and stays dim until it reaches reading position (the panel's line springs and opacity floors).
13. A photograph develops over seconds on long curves, and nothing the reader needs waits for it (the book's Polaroid: 6 s rise, 8 to 12 s develop).
14. Show a made object in parts, each on its own and plainly lit (the Luce interior four months before the exterior; the book's photographs one per page on black).
15. Explain a mechanism with a small working model of itself (Moncler's paper models).
16. State what changed as an exact list of parts, without adjectives (the LP12-50).
17. Sign the work on the work: "Designed by LoveFrom" and "Typeset in LoveFrom Serif" on the book's last page.
18. Give the page a defined still for print and for any visitor who does not get the motion (the print stylesheet's wordmark).
19. Leave out what does not carry the subject: no project grid, no logo wall, one link.

## 11. Ideas for the Turboslide landing

Each idea is written in Turboslide's grammar: Inter, paper and ink tokens, selection blue `#2f5ce0` as the one interface colour, the one rail law, ruled rows, Heroicons solid, the dither field and the mood pictures, no smooth scrolling or scroll capture, and `prefers-reduced-motion: reduce` showing the finished still at once.

1. The hero builds a real slide. The 16:9 sheet's rails draw out of their crosses (0.6 s, expo out, as the motion brief does), then the slide's title types into its title box on a person's rhythm (recorded gaps of 170 to 240 ms, a 600 ms pause between words) behind a selection blue caret that blinks 400 ms off and 510 ms on until Inter has loaded. The body arrives as ruled rows, one row per 0.5 s beat, and the sequence stops on the real render of the slide. The typed title is the page's h1, so the claim and the demonstration are one object. Reduced motion shows the finished slide at once.
2. A different deck on each visit. Four to six worked decks (the GT brand deck, a pitch, a lesson, a report) take turns in the hero: the index advances by one per visit in `localStorage`, is random after two days away, and is the first deck when storage throws. Within a visit nothing is random.
3. The mark is the living part. In the navigation lockup the five rectangle monogram assembles one rectangle per typing beat once per visit, each rectangle landing on a whole pixel row with no overshoot, then holds. No mascot.
4. Size the h1 from both dimensions, for example `min(88px, 6.1vw, 11.5svh)`, held near constant from 768 to 1366 px. Leave Inter's optical size axis on auto (`opsz` 14 to 32 in `packages/fonts/assets/InterVariable.woff2`) so display sizes get the display cut, and set tracking per size in the token table.
5. Hand set the hero and each band's one sentence: explicit breaks for the 1104 px column and for the phone (two span sets switched at 720 px), and `text-wrap: balance` for every other paragraph.
6. One subject per band. Each of the six bands (canvas, menus, present, export, agents, licence) shows one live object, a heading and one sentence, with its facts as ruled rows under it.
7. Paragraphs land as paragraphs. When a band first enters the viewport (an IntersectionObserver; no scroll linked transforms), its lines arrive 60 ms apart, 12 px to 0 on expo out over 600 ms, and then stay put. No overshoot.
8. Develop the mood picture through the dither. On first view the band's photograph raises its Bayer tone from 0 cell by cell over 2 to 4 s (the deck's own tone mix, `GTDither.mix`), the dither's counterpart of the book's Polaroid. One per page, with no alpha fade.
9. Show the editor in parts. Each band's object is the real component cropped to one part (the Insert menu, the filmstrip, the presenter view) on paper with a hairline border, without a device frame or shadow, one part per band in the manner of the Luce reveal.
10. A small working model of itself. The agents band holds a miniature deck and one ruled row per MCP call; pressing Run applies the call to the slide in front of the reader. The export band turns the same slide into its PPTX and PDF previews.
11. Exact facts in place of adjectives: the numbers band and every band's rows state counts and names (menus at parity, file types exported, tools exposed to agents).
12. Sign the hero deck: its last slide reads "Made in Turboslide. Set in Inter."
13. Press feedback on Title Case buttons: scale 0.98 on press over 120 ms and back on release, with no spring overshoot.
14. A defined still: a print stylesheet for `/home` that prints the hero slide alone on a 16:9 page.
15. Selection blue appears in the hero only as the caret and the selection ring around the slide object being built, in the way LoveFrom's page uses only ink and half ink.

## 12. Pictures

All under `docs/gslides-parity/landing/lovefrom/`, PNG under 400 KB each, plus two short WebM clips.

| File | What it shows |
| --- | --- |
| `desktop-typing-strip.png` | 1440 by 900, nine frames from 150 ms before the first letter to the last letter at 1908 ms |
| `desktop-comma-strip.png` | the comma's Lottie, ten frames from 0 to 6000 ms after the last letter |
| `desktop-bear-strip.png` | the bear from its entry at 8.2 s to 22 s |
| `desktop-bear-letters.png` | four stills of the bear on the letters, the letters sinking under it |
| `desktop-panel-open-strip.png` | the glyph pressed: the word fades and the panel rises, nine frames from 0 to 1400 ms |
| `desktop-panel-close-strip.png` | pressed again: the panel leaves and the word returns, nine frames from 0 to 1400 ms |
| `mobile-intro-strip.png` | 390 by 844, the opening from -200 ms to 8.5 s after the first letter |
| `mobile-swipe-strip.png` | 390 by 844, one swipe: the lines trail and brighten as the panel rises |
| `desktop-home-1440.png`, `mobile-home-390.png` | the finished home page at both sizes |
| `desktop-panel-1440.png`, `mobile-panel-390.png` | the open panel at both sizes |
| `desktop-jony-1440.png`, `mobile-jony-390.png`, `desktop-jony-scroll-strip.png` | `/jony` at both sizes and at scroll positions 0, 900, 1800 and 2700 px |
| `book-cover-strip.png` | *Make Something Wonderful* cover, ten frames from 0.5 to 14 s |
| `book-cover-done-1440.png`, `book-quote-page-1440.png` | the finished cover and the next page |
| `sja-home-1440.png`, `sja-home-scroll-1440.png` | the Steve Jobs Archive home at the top and one screen down |
| `desktop-opening.webm` | the opening from 2.3 s to 20.5 s, cropped to the word |
| `desktop-panel.webm` | the panel opening and closing, 5 s |

## 13. Sources

All read on 2026-10-02.

- LoveFrom home and files: https://www.lovefrom.com/ (with `/assets/start-CmwIa23E.js`, `/assets/start-CoP_39B5.css`, `/assets/main-D-Rvg7Ti.css`, `/assets/bearBlob_original-Bwu2wEcI.js`, `/fonts/LF-Serif-Roman-Var.woff2`)
- LoveFrom biography page: https://www.lovefrom.com/jony
- LoveFrom robots file: https://www.lovefrom.com/robots.txt
- *Make Something Wonderful*, web edition: https://book.stevejobsarchive.com/
- Steve Jobs Archive home: https://stevejobsarchive.com/
- Mark Wilson, Fast Company, 2024-09-25, on LoveFrom's brand, the bear and the slow pace (mirror; fastcompany.com returned 403): https://fastcompany.co.za/co-design/2024-09-25-inside-the-jony-ive-brand-building-process-after-apple
- Fast Company, 2023-05-01, on LoveFrom Serif (mirror): https://fastcompany.co.za/co-design/2023-05-01-inside-the-joni-ive-secretive-studio/
- Jonathan Bell, Wallpaper*, 2023-04-28, on LoveFrom Serif and the comma: https://www.wallpaper.com/design-interiors/corporate-design-branding/lovefrom-serif-a-modern-interpretation-of-baskerville-created-by-jony-ives-lovefrom
- John Gruber, Daring Fireball, 2023-06-29, on LoveFrom Serif: https://daringfireball.net/linked/2023/06/29/lovefrom-serif
- The Loop, 2021-10-12, on the site's launch and its comma sequences: https://www.loopinsight.com/2021/10/12/jony-ive-and-marc-newson-put-up-a-web-site/
- MacTrast, 2021-10-12, on the site's launch: https://www.mactrast.com/2021/10/jony-ives-design-firm-lovefrom-finally-debuts-its-minimalist-website/
- Arun, 2023-06-04, on the design of *Make Something Wonderful*: https://arun.is/blog/make-something-wonderful/
- Jongmin Park, designcompass, 2026-02-10, on the Ferrari Luce interior: https://designcompass.org/en/2026/02/10/the-ferrari-luce-designed-by-jony-ive/
- S.V. Robinson, Driven to Write, 2026-05-27, on the Ferrari Luce exterior and its photographs: https://driventowrite.com/2026/05/27/luce-a-ferrari-like-no-other-or-just-a-car-not-like-a-ferrari/
- Linn, 2023-07-06, on the LP12-50: https://www.linn.co.uk/blog/the-story-behind-linn-and-lovefroms-collaboration-on-the-sondek-lp12-50
- Ryan Waddoups, Surface, 2023-07-12, on the LP12-50: https://www.surfacemag.com/articles/linn-lovefrom-sondek-lp12-50-turntable/
- Dezeen, 2024-09-24, on the Moncler collection (search summary only): https://www.dezeen.com/2024/09/24/jony-ive-lovefrom-moncler-outerwear-collection/amp/
- OpenAI, "A letter from Sam & Jony", 2025-05-21 with the 2025-07-09 update (search summary only; the page returned 403): https://openai.com/sam-and-jony/
- John Gruber, Daring Fireball, 2025-05-21, on the io announcement: https://daringfireball.net/linked/2025/05/21/sam-and-jony-io
- GT motion brief (local, read only): `/Users/kevinliu/repos/Prototemplate/motion/MOTION.md`, section "Motion"
- Inter's axes (local): `packages/fonts/assets/InterVariable.woff2` read with fontTools (`opsz` 14 to 32, `wght` 100 to 900)
