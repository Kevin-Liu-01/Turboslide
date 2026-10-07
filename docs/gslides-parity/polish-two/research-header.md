# Polish two: the landing's header, hero and font

The header researcher's notes for the polish two round, written on 2026-10-07 in the worktree `/Users/kevinliu/repos/Turboslide-polish2` on `polish2/round` at `f2d48868` (the design round's whole tree). Nothing was committed and no product file was edited. Kevin's words this answers: "are we using the correct rasmus inter? please do. also remove the pause unpause button in top bar ... also fix the header, the right side paragraph + the buttons is too tall."

How the readings were taken. The studio's dev server ran on port 4713 with the round's recipe (tmp store, memory realtime, mail capture, the fake Google client), and Playwright 1.62.1 with its Chromium read `/home` at 1440 by 900, 1280 by 800, 1024 by 768, 768 by 1024 and 390 by 844 in both appearances, plus 320 by 640 for the navigation, with `gt-theme` set before the first paint. Each reading waited for `main[data-hydrated]` and `document.fonts.ready`. Line positions come from text ranges and Inter's own metrics read with fontTools from `packages/fonts/assets/InterVariable-latin.woff2` (2,048 units to the em, ascender 1,984, descender -494, cap height 1,490, x height 1,118, `USE_TYPO_METRICS` set). The proposed layout was drawn on the same page with an injected stylesheet and the proposed words, then measured the same way. The one minute load was 60 to 165 throughout (the machine's other sessions); these are layout readings, and no timing in this file is a verdict. The server was stopped and its scratch store removed before this file was written. The raw readings are `research-header/measure.json`; the scripts were in the session scratchpad.

Contents: 1 the navigation, 2 the hero, 3 the pause control, 4 the font, 5 proposals with their costs, 6 questions only Kevin can answer, sources.

## 1. The navigation

### 1.1 Where each control sits today

One 58 px row at every width (`HomeNav.tsx` 79 to 132; `home.css` 270 to 389). Readings in CSS px, left and right edges:

| Width | Lockup                        | Documentation | Theme button | Pause and play | Sign In (its 68 px slot) | New Presentation |
| ----- | ----------------------------- | ------------- | ------------ | -------------- | ------------------------ | ---------------- |
| 1440  | 208 to 343.5                  | 720.4 to 852  | 877 to 909   | 913 to 945     | 990 to 1058              | 1082 to 1232     |
| 1280  | 128 to 263.5                  | 640.4 to 772  | 797 to 829   | 833 to 865     | 910 to 978               | 1002 to 1152     |
| 1024  | 56 to 191.5                   | 456.4 to 588  | 613 to 645   | 649 to 681     | 726 to 794               | 818 to 968       |
| 768   | 56 to 191.5                   | 215.5 to 347  | 372 to 404   | 408 to 440     | 470 to 538               | 562 to 712       |
| 390   | 16 to 40 (the mark alone)     | in the footer | 59 to 91     | 95 to 127      | 148 to 216               | 224 to 374       |
| 320   | 16 to 40                      | in the footer | 48 to 80     | 84 to 116      | 78 to 146                | 154 to 304       |

The two icon controls are 32 px squares at y 13 to 45; New Presentation is 36 px tall at y 11 to 47; the hairlines are 1 by 20 px at 864 and 957 (1440). The same numbers hold in light and dark.

### 1.2 Findings

1. **The pause and play control is the 32 px icon square after the theme button** (`HomeNav.tsx` 108 to 113, `MotionToggle` 44 to 77; `motion.css` 11 to 27). The hero terminal's head draws a second one for the same page wide state (`HomeHero.tsx` 244), at 1200 to 1228, y 323 at 1440. Both answer the boot script's one click listener (`boot.ts` 133) and the live core's `syncButtons` (`live/motion.ts` 449 to 453), so removing the navigation's leaves a working control in the hero. Pictures: `research-header/hero-1440-light.jpg`, `research-header/hero-1440-dark.jpg`.
2. **The inline script that sets `aria-pressed` before hydration reads only the first toggle** (`HomeNav.tsx` 36 to 37, `document.querySelector('[data-motion-toggle]')`). Today that is the navigation's. When it leaves, the script must move after the last toggle and use `querySelectorAll`, or a visitor who paused on an earlier visit hears the hero's toggle as not pressed until the live core loads. The glyph is right either way: CSS draws it from `html[data-motion]`.
3. **At 320 px the pause glyph and a hairline are drawn under Sign In.** The links group shrinks below its content (`min-width: 0`, `home.css` 308 to 314), so the pause square (84 to 116) and the hairline (124) sit inside the Sign In button (83 to 146). The row needs 379 px at 8 px gaps (the links group's 81 px of icons and hairline) and the viewport has 320. Picture: `research-header/nav-320-light-today.jpg`. Removing the pause control frees 36 px (343 px needed); hiding the hairline as well leaves 330, still 10 px over at 8 px gaps.
4. **The theme button draws an empty square from the first paint until hydration, at every width and in both appearances.** `home.css` 358 to 363 hides `.pt-theme-glyph` while `main` lacks `data-hydrated`, because the shared `ThemeButton` (`packages/chrome/src/ThemeButton.tsx` 44 to 75) picks ◐ or ◑ from React state that starts at dark. The root boot script already sets `html[data-theme]` before the first paint (`__root.tsx` 69), so CSS could draw the right glyph from the first frame. Readings: glyph `visibility: hidden` at DOMContentLoaded in all ten cases; hydration came 0.8 s after DOMContentLoaded on a warm dev server and 5.8 s on the first, cold load (load over 100, so only an order of magnitude); without script the square stays empty for good. This is the empty slot Kevin's preview showed at 1440 dark. Pictures: `research-header/nav-1440-dark-before-hydration.jpg`, `research-header/nav-1440-dark-hydrated.jpg`, `research-header/nav-1440-dark-no-script.jpg`. The server markup also names the button "Switch to light" for every visitor, so a light visitor's name is wrong until hydration.
5. **The Sign In slot is empty until hydration by design** (68 px reserved, `home.css` 365 to 376), so its arrival moves nothing.
6. **The docs link leaves the site** (`copy.ts` 90 to 97: GitHub's `docs/README.md`, with the external glyph). The docs page lane replaces it; the navigation's link then loses its external glyph. Nothing else in the bar depends on it.

## 2. The hero

### 2.1 What is too tall

`.ts-hero-head` is a two column grid with `align-items: end` (`home.css` 588 to 593): the h1 in `minmax(0, 1fr)` and the side in `minmax(0, 384px)` with a 48 px gap. The side has `min-height: 186px` and `padding-bottom: 4px` (611 to 618) so that a four line lead (four lines of 29.45 px, the 24 px gap, the 40 px buttons, the 4 px foot) holds one height in Inter and in 'Inter Fallback'. The h1 is `clamp(40px, 5.28vw, 76px)` on two lines with `line-height: 1` (596 to 605). The lead is 19 px at a 341 px measure (625 to 628) and reads "Turboslide is a slides editor in the browser. It has a CLI and an MCP server, so agents edit the same deck. No account is needed." (the visit sentence, `copy.ts` 122 to 126, then `HERO_ROUND.lead`, `design-copy.ts` 23): 26 words and 129 characters on the first visit, 26 and 133 on the second, 24 and 130 on the third.

Readings (cap and baseline from Inter's metrics; negative means above):

| Width | h1 size | h1 box | Side box     | Side over the h1 | Lead lines | Lead's first cap to the h1's first cap | Buttons' foot to the h1's last baseline | Stage top |
| ----- | ------- | ------ | ------------ | ---------------- | ---------- | -------------------------------------- | --------------------------------------- | --------- |
| 1440  | 76 px   | 152    | 186          | +34              | 4          | -36.5                                  | +6.4                                    | 317       |
| 1280  | 67.6 px | 135.2  | 186          | +50.8            | 4          | -52.3                                  | +5.1                                    | 317       |
| 1024  | 54.1 px | 108.1  | 186          | +77.9            | 4          | -77.1                                  | +3.7                                    | 317       |
| 768   | 40.6 px | 81.1   | 156.3, under | (one column)     | 3          |                                        |                                         | 392.4     |
| 390   | 42.6 px | 85.3   | 198.4, under | (one column)     | 3          |                                        |                                         | 430.6     |
| 320   | 34.3 px | 68.6   | 223.2, under | (one column)     | 4          |                                        |                                         | 438.8     |

Findings:

1. **The right column is 34 px taller than the headline at 1440, 51 px at 1280 and 78 px at 1024**, and the lead's first line starts 36.5, 52.3 and 77.1 px above the headline's cap height. This is what Kevin saw. The cause is the four line lead and the 186 px floor that holds it, against an h1 that shrinks with the viewport while the side does not. Pictures: `research-header/hero-1440-light.jpg`, `research-header/hero-1280-light.jpg`, `research-header/hero-1024-light.jpg`.
2. **The h1 shrinks where it has room.** The column's content is 1,024 px wide from a 1,136 px viewport up (`min(1024, viewport - 112)`), so the h1's 592 px column holds 76 px type from 1,136 px. The `5.28vw` term reaches 76 px only at 1,439 px, so the h1 is 67.6 px at 1280 and 60 px at 1136 with 24 px or more to spare.
3. **The h1 is smaller at 768 than on a phone**: 40.6 px at 768 (the clamp's floor region) against 42.6 px at 390 (`min(44px, 100cqi / 8.4)`, `home.css` 2733 to 2737). Crossing 720 px the h1 drops from 44 to 40 px. Picture: `research-header/hero-768-dark.jpg`.
4. **At 768 the lead's last line is one word** ("needed.", 71 px) at the 560 px measure. Picture: `research-header/hero-768-dark.jpg`.
5. **The buttons' foot sits 4 to 6 px under the h1's last baseline** and the buttons' text baseline 8.6 px above it at 1440. Neither edge of the side lines up with a line of the headline.
6. **At 390 the side is 198.4 px under an 85.3 px h1** (three lines of 16 px, then two stacked 44 px buttons), and New Presentation appears twice in the first screen (the navigation's and the hero's). Picture: `research-header/hero-390-light.jpg`.
7. **The h1 is LCP and two locked lines** (`decks.home.seller-lead`, `home.hero.font-swap`); any fix keeps both. The font swap row (`e2e/core/home/design.ts` 1921 to 2079) requires the same boxes and the same line breaks in Inter and in 'Inter Fallback' for each of the three visit sentences at 1440, 390 and 320.

### 2.2 The measure, tested in both faces

To fit two lines beside a two line headline, the lead has to drop to about 70 characters. Every candidate was set in Inter and in 'Inter Fallback' (Arial with the size and metric overrides of `packages/fonts/src/inter.css` 165 to 171) for each of the three visit sentences (words per line, Inter then the fallback):

| Lead after the visit sentence                                                   | Size and measure | Lines (visits 1, 2, 3) | Same breaks in both faces | Breaks                  |
| ------------------------------------------------------------------------------- | ---------------- | ---------------------- | ------------------------- | ----------------------- |
| Today's ("It has a CLI and an MCP server, so agents edit the same deck. No ...") | 19 px at 341     | 4, 4, 4                | yes                       | 7,8,7,4 / 5,9,7,5 / 4,8,7,5 |
| Today's                                                                         | 19 px at 384     | 3, 4, 4                | no                        |                         |
| "No account is needed."                                                         | 19 px at 372     | 2, 2, 2                | yes                       | 7,5 / 6,6 / 4,6         |
| "No account is needed."                                                         | 19 px at 384     | 2, 2, 2                | no (visit 1: 8,4 and 7,5) |                         |
| "No account is needed."                                                         | 16 px at 358     | 2, 2, 2                | yes                       | 9,3 / 7,5 / 5,5         |
| "No account is needed."                                                         | 16 px at 288     | 2, 2, 3                | yes                       | 7,5 / 5,7 / 4,5,1       |
| "Agents edit the same deck from the CLI."                                       | 17 px at 384     | 2, 2, 2                | no (visit 3: 6,8 and 5,9) |                         |
| "Agents edit the same deck from the CLI."                                       | 19 px at 372     | 3, 3, 3                | yes                       | 7,7,2 / 6,7,3 / 4,6,4   |
| "Agents edit the same deck. No account is needed."                              | 19 px at 372     | 3, 3, 3                | yes                       | 7,7,3 / 6,7,4 / 4,6,5   |

Only "No account is needed." after the visit sentence holds two lines with the same breaks in both faces at 19 px (372 px), at 390 (16 px, 358 px) and at 320 (16 px, 288 px; the third visit takes three lines there, as today's lead takes four). Its words: 12, 12 and 10; characters 67, 71 and 68. The sentence that leaves ("It has a CLI and an MCP server, so agents edit the same deck.") is said on the same screen by the terminal's head ("Agent, Recorded from the CLI, 19 s") and below it by the numbers row's CLI, MCP and HTTP chips (DESIGN.md 8.3).

### 2.3 The proposed hero, drawn and measured

The page drawn with the stylesheet of 5.2 and the lead "Turboslide is a slides editor in the browser. No account is needed.":

| Width | h1 size              | h1 box | Side box     | Side over the h1 | Lead lines (widths)  | Lead's first cap to the h1's first cap | Buttons' foot to the h1's last baseline | Stage top (change) |
| ----- | -------------------- | ------ | ------------ | ---------------- | -------------------- | -------------------------------------- | --------------------------------------- | ------------------ |
| 1440  | 76 px                | 152    | 152          | 0                | 2 (292, 278)         | -0.2                                   | +0.1                                    | 283 (-34)          |
| 1280  | 76 px                | 152    | 152          | 0                | 2 (292, 278)         | -0.2                                   | +0.1                                    | 283 (-34)          |
| 1024  | 61.6 px              | 123.8  | 123.8        | 0                | 2 (292, 278)         | +0.2                                   | +1.1                                    | 254.8 (-62)        |
| 768   | 64 px, one column    | 128    | 122.9, under | (one column)     | 2 (292, 278)         |                                        |                                         | 405.9 (+13.5)      |
| 390   | 42.6 px              | 85.3   | 169.6, under | (one column)     | 2 (345, 143)         |                                        |                                         | 401.8 (-28.8)      |
| 320   | 34.3 px              | 68.6   | 169.6, under | (one column)     | 2 (250, 238)         |                                        |                                         | 385.2 (-53.6)      |

At 1440 and 1280 the lead's two lines sit beside "Presentations for" with their first cap on its cap, and the buttons sit beside "people and agents" with their foot on its baseline; the space between them is 40.2 px. At 1024 the same alignment holds with 16 px between them (the floor), and the foot lands 1.1 px under the baseline. The hero head's height is set by the h1 alone (two lines at `line-height: 1`), so it is the same in both faces whatever the lead does, which is stricter than today's 186 px floor. Pictures: `research-header/proposed-hero-1440-light.jpg`, `research-header/proposed-hero-1440-dark.jpg`, `research-header/proposed-hero-1024-light.jpg`, `research-header/proposed-hero-768-light.jpg`, `research-header/proposed-hero-390-dark.jpg`, `research-header/proposed-hero-320-light.jpg`.

The h1's lines in the fallback face, measured for the swap: at 76 px "people and agents" is 567.6 px in Inter and 617.8 in the fallback, so the fallback's second line runs 25.8 px into the 48 px gap during the swap (as it does at 1440 today; `white-space: nowrap`, nothing moves); at 61.6 px it is 460 and 500.8 in a 480 px column (20.8 px into the gap); at 64 px in one column 478 and 520.3 in 608 px or more.

## 3. The pause control

### 3.1 What the rules ask

- LANDING.md's motion rule, Kevin's pick (LANDING.md 26 and 53; 3.1 and 3.2 at 458 to 477): loops start when their band is in view and pause when it leaves, the tab hides or the visitor presses Pause Motion; the choice is remembered across visits (`localStorage` `ts-home-motion`); under reduced motion nothing loops, every still shows, and the control is hidden.
- WCAG 2.2.2 Pause, Stop, Hide (the W3C Understanding document, read 2026-10-07): moving content that starts on its own, lasts over five seconds and sits beside other content needs a way to pause, stop or hide it. The document gives no rule for where the control sits. As a best practice it asks to "provide a single mechanism" that affects every moving element on the page. It does not count a reduced motion preference as the mechanism, so a visible control stays for visitors without the preference.
- The page's loops that last over five seconds: the hero's staged run (about 19.1 s), the eleven interludes (12 s cycles, forever while in view), the two people (about 14 s) and the pattern's shader (continuous). Every one shot motion ends within 2.4 s (LANDING.md 3.10, 543 to 545).
- The landing research of 2026-10-02 (`docs/gslides-parity/landing/research-openai.md` 126) read Sol's "Pause animation" control on the moving object itself, shown on hover or focus with a pointer, always on touch, and hidden under reduced motion.

### 3.2 Findings

1. **The hero terminal's toggle is already the page's single mechanism**: it toggles `html[data-motion]`, every loop and the CSS guard follow that attribute (`motion.css` 29 to 34), and the choice is stored. With the navigation's gone it is the 13th Tab stop (today the navigation's is the 5th and the terminal's the 14th: skip link, lockup, Documentation, theme, pause, Sign In, New Presentation, the hero's two buttons, the frame's Undo, its filmstrip row, the slide's title and subtitle, then the terminal's pause).
2. **Under reduced motion the terminal's toggle still shows** (1200 to 1228 at 1440, aria-pressed false), because the hiding rule names the navigation only: `@media (prefers-reduced-motion: reduce) { header .ts-motion-toggle.pt-ib { display: none; } }` (`motion.css` 568 to 573). LANDING.md 3.2 says the control is hidden under reduced motion. Picture: `research-header/reduced-1440-terminal-head.jpg`.
3. **Below 1,136 px the terminal sits under the frame** (its head at y 819 at 1024, 894 at 768, 828 at 390), so in a one column stage the hero's toggle is below the first screen. The hero's loop runs only while the stage is at least half in view, so the toggle is near the loop it pauses, but a visitor reading an interlude further down has no control in view.
4. **The rows that pin the navigation's toggle**: `e2e/core/home/motion.ts` 547 (`header [data-motion-toggle]`), 749 to 757 ("right after the theme button, in the navigation") and 1087 (hidden under reduced motion, the header's only); `e2e/core/home/design.ts` 169 and 279 to 285. The words that place it: LANDING.md 2.1 (183 to 188), 3.2 (472), 3.10 (545, "early in the Tab order"); DESIGN.md 8.1 (546 to 549).

### 3.3 Where it goes

Three places were weighed. The hero terminal's head (it exists, next to the first loop). The footer, as a text button at the end of the closing line (one place every reader can reach, and the last thing on the page). A control on each moving band (the eleven interludes, the people band, the patterns band): the interludes are decorative fields marked `aria-hidden`, and eleven buttons on them add the clutter Kevin asked to remove from the bar. The proposal (5.1) keeps the terminal's, adds the footer's, and leaves the per band controls as an option for the people and patterns bands only (question 2). All of them drive the one page wide state, which is what WCAG's best practice asks. Pictures of the footer placement (a mock drawn on the page; the button's size follows the footer's 14 px links): `research-header/proposed-footer-1440-light.jpg`, `research-header/proposed-footer-390-dark.jpg`.

Reduced motion keeps working as it does: `live/motion.ts` starts no loop and plays no one shot motion under the preference, every still shows from the first paint, and the stored `ts-home-motion` choice has nothing to pause. The one change is that every `.ts-motion-toggle` hides under the preference, the terminal's and the footer's included.

## 4. The font

### 4.1 The face and its features

- The files are the official Inter 4.1 by Rasmus Andersson. `packages/fonts/assets/InterVariable.woff2` and the Latin subset `InterVariable-latin.woff2` both read "Version 4.001;git-9221beed3" in the name table, axes `opsz` 14 to 32 (default 14) and `wght` 100 to 900 (default 400); the full file's SHA-256 starts `693b77d4f32ee9b8`, as DESIGN.md 4.1 records. The Latin subset keeps 42 features: aalt, calt, case, ccmp, cpsp, cv01 to cv13, dlig, dnom, frac, kern, locl, mark, mkmk, numr, ordn, pnum, salt, sinf, ss01 to ss08, subs, sups, tnum, zero (the full file adds cv14).
- `/home` loads only the upright Latin subset (`document.fonts`: one Inter face `loaded`, U+0000-00FF and the rest of DESIGN.md 4.4's range; the italic and the other subsets `unloaded`).
- Production, read by the orchestrator: the same file, with cv11 (single storey a) and ss01 (open digits) still switched on in 19 rules of the shared chrome stylesheet until the design round's pushes land. That is the "General Translation Inter" look Kevin noticed. On this branch those rules are gone.

### 4.2 Every place outside the General Translation theme that still switches on a stylistic set or character variant

Searched with `git grep` for `cv\d\d`, `ss0\d`, `font-feature-settings`, `fontFeatureSettings`, `--display-features` and `font-variant-alternates` across the tree (tests, e2e specs and the font catalog's feature lists set apart), then read on the page.

| File and line                                                             | What it does                                                                                                                                         | Reading                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/studio/src/routes/home.css` 500 to 511                               | `.ts-sheet .ts-home-h1, .ts-home-h2, .ts-home-h3 { font-feature-settings: var(--display-features) }`: the page deck's slide headings                   | Correct by DESIGN.md 8.0 (the page deck's slides are in the General Translation theme and keep its alternates); the kits band sets `--display-features: normal` for every other kit (`themes.generated.ts`). On the page: every element with cv11 and ss01 is a slide heading (21 at 1440, 20 at 390, 24 with the whole page loaded; 0 outside a slide). The declaration reads the theme's token from a page file, which the lint passes because it is a `var()` |
| `packages/identity/src/marks-render.ts` 353                                | The people marks' initials, `style="font-feature-settings:'cv11','ss01'"`, drawn in the editor's presence chips through `packages/chrome/src/presence/mark-svg.ts` 7 | Outside the theme and outside the lint's roots. The initials are capitals (`marks.ts` 63 to 66), so cv11 changes nothing; ss01 opens a digit in a label mark                                                                                                                              |
| `scripts/build-brand.ts` 655, generating `packages/theme/brand/og-template.html` 31 | The social card's `body { font-feature-settings: 'cv11', 'ss01' }`                                                                                   | The card's sentence ("Turboslide is a slides editor in the browser ...") prints the single storey a in `apps/studio/public/og/turboslide.png`                                                                                                                                                |
| `scripts/build-brand.ts` 597, generating `packages/theme/brand/wordmark.svg` 1 to 2 and `og-template.html` 110 | The lockup's word "Turboslide" with cv11 and ss01                                                                                                    | No glyph of "Turboslide" changes under either feature; the declaration remains                                                                                                                                                                                                             |
| `packages/render/src/theme-css.ts` 106 to 107, 339 to 340                  | Writes `--display-features` per theme: cv11 and ss01 for General Translation's Inter, `normal` otherwise                                              | The theme's own mapping                                                                                                                                                                                                                                                                    |
| `packages/import/src/composite.ts` 409                                     | A comment on imported headings keeping the display features                                                                                          | Comment                                                                                                                                                                                                                                                                                    |
| `packages/fonts/src/export.ts` 5, 76, 160; `packages/export/src/pptx/fonts-map.ts` 8 to 9, 36, 156 to 164 | The PowerPoint export's Inter Display Alternates face for General Translation's headings                                                             | The theme's export                                                                                                                                                                                                                                                                         |

Inside the theme, as DESIGN.md 4.2 wants: `packages/theme/src/gt-ink-paper/sheet.css` 40 and 279, `packages/theme/src/tokens.ts` 236 to 246, `packages/theme/src/themes.ts` 40. No other stylistic set or character variant (ss02 to ss08, cv01 to cv10, cv12, cv13, salt) is switched on anywhere outside tests. `/decks` computes no element with a feature list; `/decks/templates` one, a slide.

### 4.3 Tabular figures

Every number on `/home` that sits in a column or changes in place computes `font-variant-numeric: tabular-nums` through `--pt-numerals` (DESIGN.md 4.5): the hero filmstrip's numbers (9), the counter "1 / 9", "Recorded from the CLI, 19 s", the step lengths ("2.5 s"), the numbers row's figures (4) and chips (3), the miniature's count and filmstrip (10), Format options' outputs (5), the Tailor count, the version caption and history times (5), the slide rows (9), the kits' thumbnails (9). Four runs with digits compute `normal`, all prose or monospace: the terminal's transcript (`--pt-mono`, every glyph one width), "Set the rows of slide 5", the people caption "A staged loop of 14 seconds", the export readout "Each page is one picture, 3200 by 1800." No change is needed.

### 4.4 Optical sizing

`font-optical-sizing: auto` (`home.css` 25; also Chromium's default) maps Inter's `opsz` axis to the size in px. Measured by width: "Presentations for" at 76 px is 520.7 px with `auto` and with `opsz` pinned at 32, and 567.7 px with `none` and with `opsz` pinned at 14, so the h1 draws Inter's display design. The lead's first sentence at 19 px is 372.6 px with `auto` and with `opsz` 19 (383.1 at 14, 345.4 at 32), so text sizes draw their own optical size. No change is needed. One more reading, a design choice for Kevin: the h1 adds `letter-spacing: -0.042em` (and the h2 -0.034em) on top of the display optical size, where the General Translation theme's display tracking is -0.025em (`tokens.ts` 241).

### 4.5 The brand lint today

`css/chrome-alternates` (`packages/lint/src/brand/css.ts` 181 to 182 and 375 to 383; `source.ts` 83, 384 to 387 and 752 to 757; owners `config.ts` 151 to 155) fails on `cv11` or `ss01` in a `font-feature-settings` (or a custom property whose name holds "feature") outside the theme's three files. It reads only `LINT_ROOTS` (`config.ts` 173 to 178: `packages/chrome/src`, `packages/viewer/src`, `packages/viewer/standalone`, `apps/studio/src`), only those two tags, and never `font-variant-alternates`. It missed `marks-render.ts` 353 and `build-brand.ts` 597 and 655 because they are outside its roots. The browser rows that read computed features (`e2e/core/design-pages.ts` 441 to 450, `chrome-surfaces.ts` 1638 to 1669, `home/design.ts` 337 to 338) test `/cv11|ss01/` only.

## 5. Proposals and their costs

### 5.1 The pause control leaves the bar

1. `HomeNav.tsx`: remove `<MotionToggle />` (112) and its `PRESSED_SCRIPT` block (36 to 37, 114 to 116); the icons group holds the theme button alone. `MotionToggle` stays exported where it is or moves to its own file.
2. `HomeFooter.tsx`: add the toggle as a text button at the end of the closing line, reading "Pause Motion" and "Play Motion" (Title Case, a button), with the `pause` and `play` glyphs; `data-control="home.foot.motion"`. `MotionToggle` takes a `label` flag that draws the two words in one grid cell, shown by `html[data-motion]` as the glyphs are, so its width never changes on a press. The inline pressed script moves after it and sets every `[data-motion-toggle]` with `querySelectorAll`.
3. `motion.css` 568 to 573: hide every `.ts-motion-toggle` under reduced motion (today the rule names the header's alone); 11 to 14: the display rule names `.ts-motion-toggle.pt-ib`.
4. No change to `boot.ts` or `live/motion.ts`: both already answer any `[data-motion-toggle]`.
5. Rows: `home.motion.pause` checks the hero terminal's and the footer's toggles drive one state and that no toggle is in `header`; `home.motion.reduced` checks every toggle hidden (it fails today on the terminal's, finding 3.2.2); `home/design.ts` 169 and 279 to 285 read the terminal's toggle.
6. Words: LANDING.md 2.1, 3.2 and 3.10, DESIGN.md 8.1, and a line in `copy.ts` or `design-copy.ts` for the two button labels.

Cost: the document loses the navigation's button and script (about 600 B) and gains the footer's (about 700 B); CSS about +150 B decoded; no script bytes. One file each in the landing lane (`HomeNav.tsx`, `HomeFooter.tsx`, `motion.css`, `design-copy.ts`) and three e2e files. Option, if Kevin wants a control on each demonstration (question 2): the same 28 px icon toggle in the head of the people band's pair and of the patterns band (`HomePeople.tsx`, `HomePatterns.tsx`, their CSS), about 200 B of document each, no script.

### 5.2 The hero

In `home.css` (the landing lane's file), replacing 588 to 632 and the hero lines of the 1023 and 719 blocks:

```css
/* the h1 at 76 px wherever its column is 592 px wide (the content is 1,024 px from a 1,136 px
   viewport), scaled with the content under it; the side spans the h1's ink */
.ts-hero-head {
  container-type: inline-size;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 384px);
  align-items: stretch;
  gap: 24px 48px;
  --ts-h1: min(76px, (100cqi - 432px) * 0.12838);
}

.ts-h1 {
  font-size: var(--ts-h1);
  /* the rest as today */
}

/* the lead's first cap on the h1's first cap (0.1362 em under the h1's box, less the lead's
   own 7.82 px at 19 px on 1.55), the buttons' foot on the h1's last baseline (0.1362 em above
   its box's foot): Inter's ascender 1,984, cap 1,490 and descender -494 at 2,048 units */
.ts-hero-side {
  display: grid;
  align-content: space-between;
  gap: 16px;
  min-width: 0;
  padding: calc(var(--ts-h1) * 0.1362 - 7.82px) 0 calc(var(--ts-h1) * 0.1362);
}

.ts-hero-lead {
  max-width: 372px;
}

@media (max-width: 1023px) {
  .ts-hero-head {
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
    --ts-h1: 64px;
  }
  .ts-hero-side {
    align-content: start;
    gap: 24px;
    padding: 0;
  }
}

@media (max-width: 719px) {
  .ts-hero-head {
    --ts-h1: min(44px, 100cqi / 8.4);
  }
  .ts-hero-lead {
    font-size: 16px;
    max-width: none;
  }
}
```

and `design-copy.ts` 23: `lead: 'No account is needed.'`.

What it gives, per width (2.3): the side never taller than the headline from 1024 px up (0 px over, against 34 to 78 today); the lead's first cap within 0.2 px of the h1's first cap and the buttons' foot within 1.1 px of its last baseline; the h1 at 76 px from 1,136 px (67.6 px at 1280 today), 61.6 px at 1024, 64 px in one column from 720 to 1023 (40 to 54 px today, so the phone inversion leaves); the lead at 12, 12 or 10 words on two lines with the same breaks in both faces; the stage 34 px higher at 1440 and 1280, 62 px higher at 1024, 13.5 px lower at 768, 29 px higher at 390.

Cost: about 20 lines of CSS changed in `home.css` (net under +100 B decoded), one string in `design-copy.ts` (the document 62 B shorter), nothing in the live core. The 186 px floor and its comment leave: from 1024 px up the head's height is the h1's two lines in either face, and under 1024 px the lead's two lines break the same way in both faces (2.2). Rows: `home.hero.font-swap` reads the new boxes (the probe of 2.2 says the breaks agree at 1440, 390 and 320 for all three visits); `decks.home.seller-lead` and `copy.test.ts` read the constant and pass unchanged; DESIGN.md 8.2 ("so the stage starts near y 330") and LANDING.md 2.2 restate the lead and the stage's place. The LCP stays the h1 (it grows at 1024 to 1439, and the lead paints less area at 390). A simpler alternative for the alignment is CSS `text-box: trim-both cap alphabetic` on the h1 and the lead, which removes the two constants; it is not yet in every browser the page supports, and a browser without it would draw a different head height, so it is not the default.

### 5.3 The navigation

1. One hairline: remove the hairline after Documentation (`HomeNav.tsx` 107, `.is-links` in `home.css` 2675 to 2678), so the bar reads Documentation, the theme button, a hairline, Sign In, New Presentation (question 3). Drawn in every proposed picture above.
2. Under 360 px: `.ts-product-nav-row { gap: 4px }` and no hairline. With the pause control gone the row then needs 318 px of 320 (lockup 24, theme 32, Sign In 68, New Presentation 150, two 16 px sides, three 4 px gaps), and nothing draws under Sign In. About 80 B of CSS. `research-header/proposed-hero-320-light.jpg` shows the bar with the 8 px gap still in place, where the hairline touches Sign In; the 4 px gap and the hidden hairline remove that.
3. The theme glyph from the first paint (finding 1.2.4), in the shared component so the editor's toolbar (`Toolbar.tsx` 585) gets it too: `ThemeButton.tsx` renders both glyphs, `<span class="pt-theme-glyph is-light">◐</span><span class="pt-theme-glyph is-dark">◑</span>`, and `ToolButton.css` shows one with `:root[data-theme='dark'] .pt-theme-glyph.is-light, :root:not([data-theme='dark']) .pt-theme-glyph.is-dark { display: none }`; `home.css` 358 to 363 leaves. The accessible name becomes one that is true for every visitor before hydration ("Dark or light", the tooltip's own words), or is set by the same inline script that sets the pause control's pressed state. Cost: about 120 B of CSS, 30 B of markup per button, one e2e row (`home.nav.theme-first-paint`: with script blocked after the boot, the glyph is visible and matches `html[data-theme]` in both appearances). Owner: the chrome package's lane, since `ThemeButton` is shared.

### 5.4 The font

1. `packages/identity/src/marks-render.ts` 353: drop the `style` attribute; the initials draw Inter's defaults. Cost: one attribute; the identity package's tests restate any snapshot of the SVG.
2. `scripts/build-brand.ts` 597 and 655: drop `font-feature-settings` from the wordmark's word and the social card's body, then regenerate `packages/theme/brand/wordmark.svg`, `og-template.html` and `apps/studio/public/og/turboslide.png` with the script. The card's a letters change from single storey to Inter's default (question 6). Cost: the regeneration and the PNG's bytes.
3. The lint rule, one rule in place of `css/chrome-alternates` (named `css/stylistic-sets`, or the old id kept so `ACCEPTED` and the reports do not change): it fails on any stylistic set (`ss01` to `ss20`), character variant (`cv01` to `cv99`), `salt`, `swsh` or `aalt` in a `font-feature-settings` value, in a custom property whose name holds "feature", in a JSX `fontFeatureSettings` and in an inline `style` string, and on any `font-variant-alternates` other than `normal`, outside `ALTERNATES_OWNERS`. It also fails on `var(--display-features)` in a selector that is not scoped to a slide (`.ts-sheet`), which keeps `home.css` 510 legal and stops the theme's token being read by page chrome. Its roots add `packages/identity/src` and `scripts/build-brand.ts` (and `packages/theme/brand/` for the generated HTML and SVG, read as text). Numeric features stay with `css/numerals` (`tnum` and `zero` through `--pt-numerals`), and `case`, `calt` and `kern` are not stylistic sets. Cost: `source.ts` `hasAlternates` widened to `/\b(?:ss\d\d|cv\d\d|salt|swsh|aalt)\b/` (applied only inside a feature value, as today), the CSS rule's property check widened, `config.ts` roots for this rule, the message, and about eight test cases in `css.test.ts` and `source.test.ts` (ss02 in a chrome rule fails, cv05 in an inline style fails, `font-variant-alternates: stylistic(x)` fails, `var(--display-features)` under `.ts-sheet` passes and outside it fails, the theme's sheet passes, `marks-render.ts`'s attribute fails until 5.4.1 lands). The three browser rows widen their regex the same way. The rule enforces from the push that lands 5.4.1 and 5.4.2.
4. No change for tabular figures or optical sizing (4.3, 4.4).

## 6. Questions only Kevin can answer

1. **The lead's words.** Two lines beside the headline leave room for the visit sentence and one short sentence. Default: "Turboslide is a slides editor in the browser. No account is needed." (the CLI and MCP sentence leaves; the terminal and the numbers row say it on the same screen). Other choice: keep a sentence about agents and drop "No account is needed.", which needs the third visit sentence shortened to hold two lines in both faces.
2. **Where the pause control goes.** Default: the hero terminal's head (as today) and a "Pause Motion" text button at the end of the footer's closing line, both driving the one page wide state, both hidden under reduced motion. Other choice: also a 28 px toggle in the people band's and the patterns band's own heads.
3. **One hairline or two in the bar.** Default: one, before Sign In (Documentation and the theme button on its left, Sign In and New Presentation on its right).
4. **The hero's alignment.** Default: the lead's first cap on the h1's first cap and the buttons' foot on its last baseline (40 px between the lead and the buttons at 1440). Other choice: the side aligned at the foot only with a 24 px gap, so the lead starts 16 px under the h1's cap line.
5. **The h1's sizes.** Default: 76 px from 1,136 px, scaled to 61.6 px at 1024, 64 px in one column from 720 to 1023, the phone sizes as today.
6. **The social card and the wordmark in the original Inter.** Default: yes, cv11 and ss01 leave both, so General Translation's alternates live only in its theme.
7. **New Presentation twice on a phone's first screen** (the bar's and the hero's). Default: keep both.
8. **The h1's tracking.** -0.042em on Inter's display optical size, against the theme's -0.025em. Default: keep it.

## Sources

- The tree at `f2d48868`: `apps/studio/src/components/home/HomeNav.tsx`, `HomeHero.tsx`, `HomeFooter.tsx`, `copy.ts`, `design-copy.ts`, `boot.ts`, `live/motion.ts`, `motion.css`, `themes.generated.ts`; `apps/studio/src/routes/home.css`, `__root.tsx`; `packages/chrome/src/ThemeButton.tsx`, `ToolButton.css`, `Toolbar.tsx`, `tokens.css`, `presence/mark-svg.ts`; `packages/fonts/src/inter.css`, `packages/fonts/assets/`; `packages/identity/src/marks-render.ts`, `marks.ts`; `packages/theme/src/gt-ink-paper/sheet.css`, `tokens.ts`, `themes.ts`; `packages/theme/brand/`; `packages/render/src/theme-css.ts`; `scripts/build-brand.ts`; `packages/lint/src/brand/config.ts`, `css.ts`, `source.ts`; `apps/studio/e2e/core/home/motion.ts`, `design.ts`, `e2e/core/decks.spec.ts`, `design-pages.ts`, `chrome-surfaces.ts`.
- `docs/LANDING.md` 2.1, 2.2, 3.1 to 3.10, 5; `docs/DESIGN.md` 4.1 to 4.5, 8.0 to 8.2; `docs/gslides-parity/landing/research-openai.md` 126.
- W3C, Understanding Success Criterion 2.2.2 Pause, Stop, Hide, https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html, read 2026-10-07 (data, read for its rule text and techniques).
- Readings: `docs/gslides-parity/polish-two/research-header/measure.json` and the pictures named above, all PNG or JPEG under 200,000 B, each looked at before it was cited.
