# Landing research for the design round

The landing researcher's note of the design round (key `landing`, port 4653), written on 2026-10-05 from 15:36 to 16:40 PDT in the worktree `/Users/kevinliu/repos/Turboslide-design` on `design/round` at `0d75ab90`. It answers Kevin's item 3 for `/home` ("make the landing look a lot better with a lot better ui surfaces and aesthetics and less just a bunch of text, make things look cleaner while also showing more info and using correct stuff and using our proper icons") and carries items 1, 4 and 5 where they reach the landing: the rounding of tooltips, menus and boxes, Rasmus Andersson's Inter with tabular figures, and custom scrollbars ("also make and use custom scrollbars").

What ran: production `https://www.turboslide.com/home` was read with GET requests only, through the worktree's `playwright-core` 1.62.1 and `curl`, at 1440 by 900 and 390 by 844 in both appearances, band by band; no record was written to production. The mocks are static HTML under `docs/gslides-parity/design-round/landing/mock/`, served from the worktree by a static server on `localhost:4653` (stopped before return) and rendered by the same `playwright-core`. No product source was edited, no dev server ran, nothing was committed. The one minute load average read 457, 320, 354, 240, 131 at the readings of 15:36, 15:38, 15:41, 15:47 and 16:08; the only timing reading here (the terminal's line count over 24 s, F2) was taken at load 240 and is not a verdict.

Files written: this note; the mocks (`mock/mock.css`, `mock/sprite.js`, `mock/slides.js`, `mock/dither.js`, `mock/01-nav-hero.html` to `mock/14-scrollbars.html`); 56 mock pictures and 24 production pictures under `docs/gslides-parity/design-round/landing/`, each a JPEG under 200,000 B, each looked at before it is cited.

## 1. Findings

Every band was shot on production (`prod-<band>-<appearance>-<width>.jpg`); the readings are in `prod-read.json` and `prod-read-2.json` in the scratchpad and quoted here.

### F1. The navigation is six boxed or bare text controls and no icon

- Production draws "Documentation", "Light", "Dark", "Pause Motion", "Sign In" and "New Presentation" as text. Light (pressed) and Pause Motion carry a 1 px box, Dark and Sign In none, so the bar reads as four kinds of button (`prod-first-light-1440.jpg`). Computed: every control `border-radius: 0px`, heights 32, 32, 32, 32 and 36 px.
- At 390 the bar takes two rows, 104 px, with the lockup reduced to the mark (`prod-header-dark-390.jpg`, `prod-first-dark-390.jpg`).
- The appearance control is a page copy of a product control: `HomeNav.tsx` 39 to 54 and 77 to 86 draw a Light and Dark pair, while the editor's one shared control is `packages/chrome/src/ThemeButton.tsx` (the ◐ and ◑ glyph, lines 21 to 28). This breaks Kevin's rule of one shared component on every surface.
- Pause Motion (`HomeNav.tsx` 88 to 100, `copy.ts` 114) is a 114 px text button with two labels; Heroicons 20 solid has `pause` and `play`, and the chrome set has `play` but not `pause` (`packages/chrome/src/icons.tsx` 135).

### F2. The hero is mostly words, and its terminal is often empty

- The hero band holds 345 words at rest at 1440 (text of the band including the terminal) and 81 words of page prose (outside the slide, the terminal and the menus). The h1 is nine words on three locked lines at 96 px (`copy.ts` 124, `home.css` 543 to 552).
- The terminal clears on every Restore step (`live/hero-stage.ts` 30 to 31, 342, 409, `clear: id === 'restore'`) and then types four steps of one to four lines each. Sampled every 250 ms for 24 s at load 240: 93 samples, 22 percent at five lines or fewer of its 22 slots, 42 percent at eleven or fewer, mean 14.1 (`prod-hero-light-1440.jpg` and `prod-hero-dark-1440.jpg` show two lines in a 408 px panel). This is the "mostly empty" panel of Kevin's screenshot.
- The step tabs carry a second line of CLI words (`HomeHero.tsx` 174 to 177, `home.css` 840): "version restore", "slide new", "block set", "block set". Two tabs read the same words, and the words are command fragments a seller cannot use.
- The caption "A staged loop of 19 seconds, recorded from the CLI. Press a step to play it, or click the slide's title to move it." sits under the tabs (`copy.ts` 165 to 166), with "Undo" as a bare text button beside it (`HomeHero.tsx` 180 to 187).
- The editor frame draws the title row and the menu names but not the toolbar, Slideshow, Share, the presence chips or the notes row, so it reads as a sketch of the editor and not as the editor.

### F3. The numbers row is four sentences

Four figures at 32 px in tabular figures, each with a sentence of 7 to 9 words (46 words, `prod-numbers-light-1440.jpg`, `copy.ts` 188 to 212). No icon, no place in the editor except as prose ("Insert > Shape draws them from PowerPoint's preset definitions.").

### F4. The miniature's menus are not the editor's menus

- The editor draws an icon on every menu row; the landing's miniature draws an empty 16 px column (`prod-menus-insert-open-light-1440.jpg` against the editor's `docs/gslides-parity/next/brand-surfaces/menu-insert-1440-light.png`). `live/menus.ts` (1,751 lines) and `menus.generated.ts` carry no icon name.
- 9 of the 13 Insert rows are drawn in the disabled colour because the page does not run them, so the open menu looks broken.
- The lead is 34 words naming the nine menus (`copy.ts` 238). At 390 the miniature shows a "Menus" row and a status sentence (`prod-menus-light-390.jpg`).

### F5. The canvas band ends in two rows of text

The lighthouse is strong; under it two ruled rows read "Layout · Mood · Undo" and "Command · Each gesture prints its CLI command." (`prod-canvas-light-1440.jpg`, `copy.ts` 357 to 371). The second row is a placeholder sentence at rest.

### F6. Tailor is a form without its dialog

The Replace, With and count rows float beside the h2 without the dialog the editor draws; "Move Up" and "Move Down" sit as bare text under thumbnail 2 (`prod-tailor-light-1440.jpg`).

### F7. The kits grid draws its slide numbers inside the previous thumbnail

`HomeKits.tsx` 75 gives the grid's numbers the class `ts-home-thumb-n`, which `home.css` 1314 to 1322 places at `left: -22px`. In a five column grid with 16 px gaps the numbers 2 to 5 and 7 to 9 land 6 px inside the previous thumbnail (read: number 2 at x 394, its thumbnail at x 416, thumbnail 1 ending at x 400). Only 1 and 6 read; the others show as fragments at the thumbnails' top right corners (`prod-kits-grid-zoom-light-1440.jpg`, `prod-kits-light-1440.jpg`, `prod-kits-dark-1440.jpg`). `editing.css` 472 defines `.ts-kit-thumb-n` for this grid and nothing uses it.

### F8. The agents band repeats words and draws boxed text chips

The lead holds three figures (`copy.ts` 268); the four chips are boxed text with no icon; Version history's rows read "Recorded" three times; the console's resting screen is the CLI's ISO timestamps and `agent:landing` (`prod-agents-light-1440.jpg`, `prod-agents-dark-390.jpg`).

### F9. The Present band is half empty

The left column holds the h2, two lines and two buttons and then 400 px of nothing; the right column is the slide and nine ruled rows of slide titles (`prod-present-light-1440.jpg`). The presenter view, the product's best surface for this claim, is not shown.

### F10. The export band ends in three rows of text

"Perfect · Each page is one picture, 3200 by 1800. The worst GT deck page differs from its screenshot by 0.003%. · Read the record", "Editable text · Text boxes stay text boxes.", "PDF · Text stays text. · Download the PDF" (`prod-export-light-1440.jpg`). The product's Download dialog says the same in its own strings (`packages/chrome/src/dialogs/Download.tsx` 225 to 235, 401 to 404).

### F11. The patterns band shows one pattern of 17

Two near identical slides with labels (`prod-patterns-light-1440.jpg`). The product ships a still of each of the 17 patterns (`packages/materials/previews/*.webp`, 60,760 B for the 17 base stills at 320 by 200).

### F12. The features table draws three icons the editor does not, and a doubled line at 390

- Icons against `packages/chrome/src/menus/model.ts`: Tailor is `pencil-square` on the page and `chat` (chat-bubble-left-right) on the editor's row (2579 to 2581), the same glyph as Comments; Share is `user-group` on the page and `link` on the editor's button (893 to 894); Presenter view is `presentation-chart-bar`, which is not in the chrome's set, where the editor's Slideshow is `present`, the `play` glyph (866 to 867). The page's list is `copy.ts` 495 to 500.
- The where cell of Share reads "Share", the name again.
- At 390 the last row draws three rules: `home.css` 1765 to 1767 (`.ts-features tbody tr:last-child > *`, specificity 0,2,2) outranks the phone reset at 2367 to 2370, so the key cell and the where cell each keep a 0.22 rule under the row's own 0.1 rule (`prod-features-lastrow-zoom-dark-390.jpg`, `prod-features-dark-390.jpg`).

### F13. The close and the footer

The close is clean (`prod-close-light-1440.jpg`); its h2 is six words and its lead three sentences (`copy.ts` 510). The footer is one row of text links (`prod-footer-light-1440.jpg`).

### F14. Type

- The face is already Rasmus Andersson's Inter: `packages/fonts/src/inter.css` 1 to 7 loads InterVariable from the rsms/inter v4.1 release, one request of 352,240 B on `/home`, and `document.fonts` reads "Inter 100 900 normal".
- The look Kevin calls General Translation's comes from two stylistic sets, `'cv11', 'ss01'` (single storey a, open digits), set on the h1, every h2 and the lockup (`home.css` 107, 290, 546; `mood.css` 66; `page-frame.css` 32) and in the shared `DISPLAY` token (`packages/theme/src/tokens.ts` 241, pinned by `tokens.test.ts` 88 and 98), which 30 files under `packages/chrome/src` repeat. Computed on production: h1 and h2 `font-feature-settings: "cv11", "ss01"`.
- Figures are tabular where they align today: the numbers row, the frame and slide counters, Version history's time cell (computed `tabular-nums`).

### F15. Rounding

No element on production `/home` draws a radius (computed over every element at 1440 light: none). The chrome has one corner token, `--pt-radius: 6px` (`packages/chrome/src/tokens.css` 130), used on the search field and segmented controls, and 8 px on Slideshow (`TitleRow.css` 221); its menus, tooltips and dialogs are square (`Menu.css` 29, `Tooltip.css` 22, `Dialog.css` 81). General Translation's own ladder is `--radius: 0.5rem` with 6 and 4 px steps (gt-cloud `packages/ui/src/css/shared.css` 85 to 87 and 235), and the brand deck's pictures of the GT site show 6 px buttons, a 6 px search pill and a 6 to 8 px code panel (Prototemplate `deck/shots/detail-nav-actions-light.jpg`, `gt-home-light.jpg`, `detail-code-panel-light.jpg`). LANDING.md 2.0 "Shape" and `grammar.css` 8 say square everywhere.

### F16. Scrollbars

The page has two scroll regions and styles neither with the shared scrollbar: the miniature's filmstrip uses the browser's thin scrollbar (`editing.css` 110), and the hero filmstrip at 390 hides its scrollbar (`home.css` 2092 to 2105), so the row gives no sign that it scrolls. The document's scrollbar is the system's (computed `scrollbar-width: auto`, `scrollbar-color: auto` on the root). The shared `.pt-scroll` and `.pt-scroll-x` (`packages/chrome/src/tokens.css` 199 to 282) are loaded on `/home` and used by nothing there.

### F17. Icons in use

On production `/home`: the Turboslide mark 41 times (frame, slides and thumbnails), `command-line` 4 (the features row and Version history's author cell), `bars-3`, `pencil-square`, `swatch`, `chat-bubble-left-right`, `clock`, `user-group`, `presentation-chart-bar`, `arrow-down-tray`, `cube` once each, and the GT mark in the footer. Every one sits in a key cell; the navigation, the hero, the chips, the buttons, the dialogs and the menus draw none. The product's set is Heroicons 20 solid only, about 120 names in `packages/chrome/src/icons.tsx` (the shell's one family; the GT mark and the theme glyph are its exceptions), with drawn glyphs where Heroicons has none (shapes, lines, Word art, the cursor). The set holds `sparkles` and `cursor-arrow-rays`, which the avoid list keeps off `/home`; no mock uses them.

### F18. Budgets as read

| Measure | Read on production | Line | Room |
| --- | --- | --- | --- |
| Document, decoded | 93,681 B | 100,000 B | 6,319 B |
| Document, brotli as Vercel served it | 22,694 B | 20,000 B at the build's level (question 21 read 18,549 B) | over as served; the row reads the build |
| Page's own script after a full scroll, 25 chunks without the people band | 315,526 B decoded, 104,874 B gzip -9 each alone | 360,000 B and 120,000 B | 44,474 B and 15,126 B before the people band ships |
| Live core | not re-read; the state gives 66 B of room under 20,480 B gzip | 20,480 B gzip | 66 B |
| Pictures over the band walk | 57,133 B | 200,000 B | 142,867 B |
| Page height | 12,169 px at 1440, 12,261 at 390 | 14,000 and 15,000 | |

### F19. Words

Page prose outside slides, terminals, menus and the table, per band at rest at 1440: hero 81, numbers 46, menus 39, canvas 35, Tailor 38, kits 42, agents 85, Present 62, export 62, patterns 34, features 6, close 32; 562 in all (`read-prod.mjs`'s count).

### F20. Outside the landing, seen on the way

The Share dialog's "Copy link" is a button in sentence case (`packages/chrome/src/menus/strings.ts` 433), against Title Case on buttons. The editor's Tools > Tailor for a customer row draws the Comments glyph (model.ts 2581).

## 2. Proposals, band by band

The principle: draw each claim as the product draws it, so the surface carries the information and the words shrink to a short heading and one sentence. Every mock uses the brand's tokens (`packages/chrome/src/tokens.css` values, both appearances), Rasmus Andersson's Inter with no stylistic sets, tabular figures wherever numbers align, Heroicons 20 solid from the product's set, the radius ladder of question 2 (6 px controls, menus and tooltips; 8 px windows and dialogs; 4 px key chips; 0 on slides and thumbnails), the shared scrollbar, no eyebrows, no sparkle or robot glyphs, and no smooth scrolling. A mock shows an interaction state where the state is the point (an open menu, a hovered tooltip, a selection, the loupe); at rest the page keeps LANDING.md's rule that nothing blue is drawn. The mocks are research files and never served.

Measured on the mocks: page prose about 300 words for the same bands (361 with the navigation, the footer and the two people band, by the same count as F19), and an estimated page of 11,230 px at 1440 and 14,180 at 390 with eleven interludes, under the 14,000 and 15,000 ceilings.

### P1. Navigation: icon controls, one row at every width

Pictures: `mock-01-nav-hero-light-1440.jpg`, `mock-01-nav-hero-dark-1440.jpg`, `mock-01-nav-hero-light-390.jpg`, `mock-01-nav-hero-dark-390.jpg`.

- The lockup; "Documentation" as a link; a hairline; the shared `ThemeButton` (the ◐ glyph, one control in place of the Light and Dark pair); a motion toggle as a 32 px icon button with Heroicons `pause` and `play` and the name "Pause motion" in the shared tooltip; a hairline; "Sign In" without a box; "New Presentation" solid. At 390 one 58 px row: the mark, the two icon controls, Sign In and New Presentation; Documentation moves to the footer.
- Files: `HomeNav.tsx` (the appearance group and the motion button), `copy.ts` 104 to 114, `home.css` navigation rules, `icons.generated.css` (two masks), `packages/chrome/src/icons.tsx` (add `pause` from Heroicons 20 solid), `packages/chrome/src/Tooltip.css` (a CSS plate on `[data-tip]` for static pages, the same plate as `.pt-tip`, so the landing and the editor share one tooltip look without the 21 KB `Tooltip.tsx` in the route chunk).
- Cost: page CSS about +1,300 B decoded (two masks at about 650 B each, as `icons.generated.css` reads 8,410 B for 13), document about -250 B (three buttons become two); the boot script's pressed-state line shrinks; the live core unchanged. `ThemeButton` in the route chunk costs `ToolButton` and `ThemeButton` (about 7 KB of source, est. 2 to 3 KB minified) against about 18 KB of room under the 70 KB route line; the cheaper equal is the same ◐ glyph as a page button with the shared `.pt-ib` class.
- Rows: the layout shift row keeps the Sign In slot drawn at its width; `home.nav` controls keep their `data-control` ids.

### P2. Hero: a shorter h1, the editor as the editor draws it, a terminal that is never empty

Pictures: `mock-01-nav-hero-light-1440.jpg`, `mock-01-nav-hero-dark-1440.jpg`, `mock-01-nav-hero-light-390.jpg`, `mock-01-nav-hero-dark-390.jpg`.

- h1 "Presentations for people and agents" at 76 px on two lines (question 1), with one sentence and the two buttons beside it at 1440, so the stage starts at y 330 where it starts at y 487 today.
- The editor frame with the product's title row (mark, deck title, Saved, presence chips, comments, the Slideshow split button with its play glyph, Share with its lock), the menu row, the toolbar row drawn with the product's icons (search, new slide, undo, redo, print, paint format, zoom, select, text, image, shape, line, comment, Background, Layout, Theme), the filmstrip, the slide and the notes row with the counter in tabular figures. Undo is the toolbar's undo, so the bare "Undo" leaves.
- The terminal keeps the transcript: a Restore appends its lines and the panel scrolls to its end inside `.pt-scroll`, so it is never cleared. The four step tabs move into the panel's foot as four rows (a done glyph in the status green, the playing row with its 2 px countdown rule, each row's length in tabular seconds), and the caption folds into the panel's head as "Recorded from the CLI, 19 s" with a pause button. The CLI fragments under the tabs leave.
- Files: `copy.ts` 124 to 166 (h1, lead, step labels, caption), `HomeHero.tsx` 160 to 190, `live/hero-stage.ts` 342 and 409 (drop the clear; scroll to end), `home.css` hero rules 543 to 560 and 801 to 845.
- Cost: document about +3,000 B decoded (the title row's extra cells, the toolbar's 16 cells as `i.ts-icon` markers of about 60 B, the notes row), about -400 B (the caption, the tabs' CLI words, Undo), net about +2,600 B of the 6,319 B of room. Page CSS about +9,000 B decoded and 2,500 B brotli for 14 toolbar and title glyphs as masks (question 3 offers the sprite file instead, 0 B in CSS). Live core: deleting the clear path pays for the scroll to end (about 60 B); the core's 66 B of room holds. LCP stays the h1, now two lines.

### P3. The numbers row: figure, icon and place

Pictures: `mock-02-numbers-light-1440.jpg`, `mock-02-numbers-dark-1440.jpg`, `mock-02-numbers-light-390.jpg`, `mock-02-numbers-dark-390.jpg`.

Each cell: a Heroicon (`command-line`, `squares-2x2`, `cube`, `square-2-stack`), the figure at 44 px in tabular figures, the noun, and its place in the editor as a menu path (Slide › Apply layout, Insert › Animated pattern, Insert › Shape). The 193 cell carries the CLI 180, MCP 169 and HTTP 177 chips, which leave the agents lead, so each figure is still said once. 46 words become 18. Files: `HomeNumbers.tsx`, `copy.ts` 188 to 212, `icons.generated.css` (two masks). Cost: CSS about +1,300 B; document about -150 B.

### P4. Menus: the editor's rows with their icons

Pictures: `mock-03-menus-light-1440.jpg`, `mock-03-menus-dark-1440.jpg`, `mock-03-menus-light-390.jpg`, `mock-03-menus-dark-390.jpg`.

- Every row carries the icon `model.ts` gives it, drawn in ink as the editor draws it; only rows the editor itself disables (Link and Comment without a selection) are grey. A row the page does not run answers in the status bar ("This row runs in the editor.") instead of being greyed at rest. h2 "Google Slides' menus", one sentence.
- At 390 the open menu sits in the flow under the Menus key, so the window grows and nothing is clipped.
- Files: V2's build module that writes `menus.generated.ts` (add each row's `icon`), `live/menus.ts` (draw the icon cell), `copy.ts` 238.
- Cost: `menus.generated.ts` about +1,500 B decoded. The paths: about 45 distinct glyphs. As path strings in the menus chunk they add about 18,000 B decoded and 6,000 B gzip, which takes the chunk (48,202 B) over its 56 KB line. The proposal is one content hashed SVG sprite under `/home/` requested on the first menu open and referenced as `<use href>`: about 14 KB decoded, 0 B of script, inside the 142 KB of picture room.

### P5. Canvas: the Format options panel in place of the two rows

Pictures: `mock-04-canvas-light-1440.jpg`, `mock-04-canvas-dark-1440.jpg`, `mock-04-canvas-light-390.jpg`, `mock-04-canvas-dark-390.jpg`.

Beside the lighthouse, the product's Format options panel: Position and size (X, Y, Width, Height, Rotation in tabular figures, live from the replica), Layout (Mood or Canvas), and Command (the CLI line in Inter). The fields show what a drag changed without a sentence. Files: `HomeCanvas.tsx`, `live/objects.ts` and `live/log.ts` (write the readout), `copy.ts` 357 to 371. Cost: canvas band chunk about +1,500 B decoded; document about +600 B for the panel's labels.

### P6. Tailor: the product's dialog and snackbar

Pictures: `mock-05-tailor-light-1440.jpg`, `mock-05-tailor-dark-1440.jpg`, `mock-05-tailor-light-390.jpg`, `mock-05-tailor-dark-390.jpg`.

The rows become the Tailor dialog as the editor draws it (title, Replace, With, the count, Cancel and Apply, in `TAILOR` strings), the filmstrip runs across the top with the Tailor highlight on each name, and Apply's result is the product's snackbar ("Tailored for Globex: 13 places on 6 slides" with Undo). Move Up and Move Down move into the thumbnails' hover and focus. Files: `HomeTailor.tsx`, `live/tailor.ts`, `editing.css`. Cost: CSS about +800 B; document about +200 B.

### P7. Kits: the Brand kit panel, and the numbers fixed

Pictures: `mock-06-kits-light-1440.jpg`, `mock-06-kits-dark-1440.jpg`, `mock-06-kits-light-390.jpg`, `mock-06-kits-dark-390.jpg`.

The panel lists the three kits with their swatches and the six colours with their hex values in tabular figures, the Background field among them, and a contrast readout ("Text on background reads 15.2 to 1", computed: `#f4f1ea` on `#0a1b38` is 15.18:1). The deck grid shows three columns with each number above its thumbnail. The numbering fix alone is one class: `HomeKits.tsx` 75 takes `ts-kit-thumb-n` (`editing.css` 472). Cost: kits chunk about +1,000 B (the six values are already in `live/theme.ts`); CSS about +700 B.

### P8. Agents: the product's Version history

Pictures: `mock-07-agents-light-1440.jpg`, `mock-07-agents-dark-1440.jpg`, `mock-07-agents-light-390.jpg`, `mock-07-agents-dark-390.jpg`.

The rows are the editor's Version history panel: a Today group, a "Recorded from the CLI" group in place of three "Recorded" cells, the author chip with its glyph, the change in the `HISTORY` words, the time or the version in tabular figures, the current row on the plate, and the scrubber with Restore This Version in its head. The chips carry icons (`command-line`, `arrow-path`, `pencil-square`, `eye-slash`). The console shows the recorded answers (`chips.generated.ts` 103, 213). The lead loses its three figures to the numbers row. Files: `HomeAgents.tsx`, `agents.css`, `live/versions.ts`, `live/history.ts`, `copy.ts` 264 to 291. Cost: CSS about +2,000 B with four masks; document about -100 B.

### P9. Two people: the Share dialog beside the two screens

Pictures: `mock-08-people-light-1440.jpg`, `mock-08-people-dark-1440.jpg`, `mock-08-people-light-390.jpg`, `mock-08-people-dark-390.jpg`.

The band opens with the product's Share dialog in its own strings (General access, Anyone with the link, "Anyone with this link can edit", the link field, Copy link, the people with their roles and the slide each is on, Done) beside Maya's and Sam's screens with the ink outlines, flags, caret and the Following plate. h2 "Share a link and edit together". It stays gated on the presence rows (LANDING.md question 13). Cost: its chunk about +1,500 B.

### P10. Present: the presenter view

Pictures: `mock-09-present-light-1440.jpg`, `mock-09-present-dark-1440.jpg`, `mock-09-present-light-390.jpg`, `mock-09-present-dark-390.jpg`.

Present (with its play glyph and the ⌘↵ key chip) and Print This Deck (printer glyph) under the h2; the figure is the presenter view as `show.ts` draws it: the timer in tabular figures with pause, Exit, the current slide, the next slide with "3 / 9", the notes, Previous and Next. The nine title rows leave (the show keeps its list). Files: `HomePresent.tsx`, `live/show.ts` (export the view's still), `copy.ts` 385. Cost: present chunk about +1,500 B; document about -300 B.

### P11. Export: the Download dialog and the readout

Pictures: `mock-10-export-light-1440.jpg`, `mock-10-export-dark-1440.jpg`, `mock-10-export-light-390.jpg`, `mock-10-export-dark-390.jpg`.

The three ruled rows become the product's Download dialog in its strings (Microsoft PowerPoint with the Perfect and Editable text segments, PDF Document, one slide per page) and the 0.003% figure as a readout with the done glyph. The seam's labels gain their glyphs (`photo`, `document-text`); the loupe is the floating plate with its two windows and its readout in tabular figures. Files: `HomeExport.tsx`, `live/seam.ts`, `copy.ts` 401. Cost: CSS about +1,500 B; document about +100 B.

### P12. Patterns: the 17 stills

Pictures: `mock-11-patterns-light-1440.jpg`, `mock-11-patterns-dark-1440.jpg`, `mock-11-patterns-light-390.jpg`, `mock-11-patterns-dark-390.jpg`.

Under the live and still pair, the Insert › Animated pattern picker as a grid of the 17 product stills with their names (`packages/materials/previews/<id>.webp`, the files the editor's Shader gallery shows), in a `.pt-scroll-x` row at 390. Cost: 60,760 B of pictures at most, requested with the band (picture room 142,867 B); each `img` carries width and height, so CLS stays 0. Dark twins are a question (the stills are drawn on ink).

### P13. Features: the editor's icons, two columns, key chips

Pictures: `mock-12-features-light-1440.jpg`, `mock-12-features-dark-1440.jpg`, `mock-12-features-light-390.jpg`, `mock-12-features-dark-390.jpg`.

Two columns of five rows at 1440, each an icon well, the name, the menu path as crumbs and the shortcut as key chips. Every icon is read from `model.ts` at build so it cannot drift (Share `link`, Slideshow and presenter view `play`); Tailor keeps `pencil-square` once the editor's row takes it (question 6). The 390 doubled line goes with the cell rule's specificity (`home.css` 1765). Cost: CSS about +600 B; document unchanged.

### P14. Close and footer

Pictures: `mock-13-close-footer-light-1440.jpg`, `mock-13-close-footer-dark-1440.jpg`, `mock-13-close-footer-light-390.jpg`, `mock-13-close-footer-dark-390.jpg`.

The mark, "Start a presentation", one line ("No account needed. The first edit saves it."), the two buttons. The footer gains Documentation from the 390 navigation and the external glyph after links that leave the site (the deck's `.ic.ext`). Cost: about -60 B.

### P15. Scrollbars: the shared one, on every scroll region of the landing

Pictures: `mock-14-scrollbars-light-720-2x.jpg`, `mock-14-scrollbars-dark-720-2x.jpg` (at two times), `mock-14-scrollbars-light-390-2x.jpg`, `mock-14-scrollbars-dark-390-2x.jpg`.

- `.pt-scroll-x` on the hero filmstrip at 390 in place of the hidden scrollbar (`home.css` 2092 to 2105), and on the patterns row at 390; `.pt-scroll` on the miniature's filmstrip (`editing.css` 110), the agents console's screen and the hero terminal; on the ink panels the thumb is paper at 0.3, a variant added to `tokens.css` beside the rule, not a page copy.
- The document: `html:has(.ts-home-page) { scrollbar-color: var(--pt-thumb) transparent; scrollbar-width: thin; }`, native scrolling with the brand's thumb. On phones the system's overlay scrollbar stays.
- Cost: about 250 B of CSS; 0 B of script.

### P16. Type, rounding and icons across the page

- Inter with no stylistic sets on the landing: drop `'cv11', 'ss01'` from `home.css` 107, 290 and 546, `mood.css` 66 and `page-frame.css` 32, and from `DISPLAY` in `packages/theme/src/tokens.ts` 241 with its tests, so the landing and the app set Rasmus Andersson's default glyphs (the foundation lane's change; the landing takes it from the token). Tabular figures stay on every aligned number and are added to the timer, the hex values, the coordinates and the version cells. 0 B.
- The radius ladder through the shared components (`.pt-ib`, `Menu.css`, `Tooltip.css`, `Dialog.css`, the key chip), and LANDING.md 2.0 "Shape" and `grammar.css` 8 restated: windows and dialogs 8 px, controls, menus and tooltips 6 px, key chips 4 px, slides, thumbnails, rails and seams square.
- Icons: Heroicons 20 solid in controls and dialogs as the product draws them, not only in key cells (LANDING.md 2.0 "Shape" restated), read from the product's set and `model.ts`.

### Cost summary

| Proposal | Document, decoded | Page CSS | Script | Pictures |
| --- | --- | --- | --- | --- |
| P1 navigation | -250 B | +1,300 B | route chunk +0 to +3 KB | 0 |
| P2 hero | +2,600 B | +9,000 B (or 0 with the sprite of question 3) | core about 0 | 0 |
| P3 numbers | -150 B | +1,300 B | 0 | 0 |
| P4 menus | 0 | 0 | menus chunk +1,500 B | sprite about 14 KB on first open |
| P5 canvas | +600 B | +400 B | canvas chunk +1,500 B | 0 |
| P6 Tailor | +200 B | +800 B | 0 | 0 |
| P7 kits | 0 | +700 B | kits chunk +1,000 B | 0 |
| P8 agents | -100 B | +2,000 B | 0 | 0 |
| P9 people | 0 | +600 B | people chunk +1,500 B | 0 |
| P10 Present | -300 B | +800 B | present chunk +1,500 B | 0 |
| P11 export | +100 B | +1,500 B | 0 | 0 |
| P12 patterns | +300 B | +300 B | 0 | 60,760 B |
| P13 features | 0 | +600 B | 0 | 0 |
| P14 close | -60 B | 0 | 0 | 0 |
| P15 scrollbars | 0 | +250 B | 0 | 0 |
| In all, est. | about +3,000 B of 6,319 B room | about +19,550 B decoded, est. +5,500 B brotli (or about +10,500 B and +3,000 B with the sprite) | about +8,000 B decoded and +2,800 B gzip of 44,474 B and 15,126 B | about 75 KB of 142,867 B |

These are estimates from the files named; every one is read on a build before its push. The page CSS line is 16 KB brotli for `home.css`, the lane files, `grammar.css`, `selection.css` and `print.css` (LANDING.md 4.1); its current reading is not in this note, so P2's masks are the item to measure first.

## 3. Pictures

Production, 2026-10-05 15:38 to 15:47 PDT: `prod-first-light-1440.jpg`, `prod-first-dark-390.jpg`, `prod-header-dark-390.jpg`, `prod-hero-light-1440.jpg`, `prod-hero-dark-1440.jpg`, `prod-hero-dark-390.jpg`, `prod-numbers-light-1440.jpg`, `prod-menus-insert-open-light-1440.jpg`, `prod-menus-light-390.jpg`, `prod-canvas-light-1440.jpg`, `prod-tailor-light-1440.jpg`, `prod-kits-light-1440.jpg`, `prod-kits-dark-1440.jpg`, `prod-kits-grid-zoom-light-1440.jpg` (two times), `prod-agents-light-1440.jpg`, `prod-agents-dark-390.jpg`, `prod-present-light-1440.jpg`, `prod-export-light-1440.jpg`, `prod-patterns-light-1440.jpg`, `prod-features-light-1440.jpg`, `prod-features-dark-390.jpg`, `prod-features-lastrow-zoom-dark-390.jpg` (three times), `prod-close-light-1440.jpg`, `prod-footer-light-1440.jpg`.

Mocks, 2026-10-05 16:08 to 16:30 PDT: `mock-<nn>-<band>-<light|dark>-<1440|390>.jpg` for 01 nav and hero, 02 numbers, 03 menus, 04 canvas, 05 Tailor, 06 kits, 07 agents, 08 people, 09 Present, 10 export, 11 patterns, 12 features, 13 close and footer, and `mock-14-scrollbars-<light|dark>-<720|390>-2x.jpg`.

All under `docs/gslides-parity/design-round/landing/`.

## 4. Questions only Kevin can answer

| # | Question | Default |
| --: | --- | --- |
| 1 | The h1 "Presentations for people and agents" (five words, two lines) in place of "Build the pitch, present it and send the link" (nine words, three lines)? | Yes |
| 2 | The radius ladder on the landing and in the chrome it shares: 8 px windows and dialogs, 6 px controls, menus and tooltips, 4 px key chips, square slides, thumbnails, rails and seams (General Translation's `--radius` 0.5rem ladder; LANDING.md 2.0 "Square corners everywhere" and BRAND.md's "no rounded corners" give way)? | Yes |
| 3 | The landing's toolbar and menu icons as one content hashed SVG sprite under `/home/` (about 14 KB, fetched on first use, 0 B of script or CSS) in place of CSS masks in the page stylesheet? | Yes |
| 4 | Heroicons in controls, chips, dialogs and menu rows on `/home`, as the editor draws them, beyond LANDING.md's "only in key cells"? | Yes |
| 5 | The theme control on `/home` is the editor's ◐ glyph button (one control that toggles), not the Light and Dark pair? | Yes |
| 6 | The editor's Tools > Tailor for a customer row takes `pencil-square`, so Tailor and Comments stop sharing a glyph, and the landing reads every feature icon from `model.ts`? | Yes |
| 7 | The 17 pattern stills on `/home` (60,760 B, requested with the band), with dark twins later? | Yes, light stills in both appearances until twins exist |
| 8 | "Original Inter" means Inter with no stylistic sets (the double storey a and the closed digits), dropping `cv11` and `ss01` from the display token across the app? | Yes |
| 9 | The page's own scrollbar takes the brand's thumb colour (native scrolling, thin), and every scroll region on `/home` uses the shared `.pt-scroll`? | Yes |
| 10 | Documentation leaves the 390 navigation for the footer, so the bar is one 58 px row at every width? | Yes |
