# Polish two, lane N: the navigation and the hero

Lane N of `docs/POLISH-2.md` (section 3, the rows of 6.3 and 6.6), in the worktree
`/Users/kevinliu/repos/Turboslide-polish2` on `polish2/round`. One section per push: the items, the
files, the rows with their readings and the one minute load beside them, the pictures (under
`docs/gslides-parity/polish-two/n/`, each opened and looked at) and the deviations. The dev server
is the lane's, port 4722, with the round's recipe (`TURBOSLIDE_STORE=tmp`, the memory realtime
tier, `TURBOSLIDE_LOCAL_OPEN=1`, captured mail, the auth rate limit off, the fake Google pair, a
sqlite identity database under `apps/studio/.turboslide/`) on `vite.no-watch.config.ts`; the
node-server build is served on 4732 with the same environment and `TURBOSLIDE_MAIL=off`, the
production mode. No timing in this file is a verdict: the one minute load was 130 to 520 through
the lane's runs (other sessions' jobs), over the line of 24. Bytes, counts, boxes and colours do
not move with load.

The tree is shared with lanes F, A and D while they work, so every server and build of this lane
ran their uncommitted edits too. Where a reading depends on that, the section says so.

## P2-N#1: the pause control leaves the bar

Items (docs/POLISH-2.md 3.1, 3.2; C8, C9): the bar draws no motion toggle; the hero terminal's
28 px icon toggle stays (the 13th Tab stop, read on 4722: skip link, lockup, Documentation, theme,
Sign In, New Presentation, the hero's two buttons, the frame's four stops, then the toggle); the
footer's closing line ends with a text button, `data-control="home.foot.motion"`, the `pause` or
`play` glyph with "Pause Motion" or "Play Motion", both labels in one grid cell so its width is
134.3 px in both states, named "Pause motion" with `aria-pressed`; one inline script after the
footer's toggle sets every toggle's `aria-pressed` from `html[data-motion]` as the document parses;
every `.ts-motion-toggle` hides under reduced motion (the terminal's showed before); the bar keeps
one hairline, before Sign In; under 360 px the row's gap is 4 px and the hairline hides. The
terminal's toggle takes `flex: 0 0 28px`, since the head's words squeezed it to 27.6 px at 320 (the
row read it). `MotionToggle` stays in `HomeNav.tsx` and takes a `label` flag.

Files: `apps/studio/src/components/home/HomeNav.tsx`, `HomeFooter.tsx`, `design-copy.ts`
(`MOTION_BUTTON`), `motion.css`; `apps/studio/src/routes/home.css` (the bar's rules, the footer's
closing row, the 360 px block, the terminal toggle's flex); `apps/studio/e2e/core/home.spec.ts`
(the `header` module), `home/header.ts` (new: `home.nav.no-pause`, `home.nav.fits-320`),
`home/motion.ts` (the two toggles in `home.motion.pause`, every toggle hidden in
`home.motion.reduced`, the other rows press the terminal's toggle), `home/design.ts`
(`home.nav.icons`: the bar's order with one hairline and no toggle); `docs/LANDING.md` 2.1, 3.2,
3.10; `docs/gslides-parity/focus/core-matrix.json` and `README.md`'s block.

Rows, on the dev server 4722 (the gate's tables under `.turboslide/n/`, the scratch runs of the
two new rows through `header.ts`'s exported drivers before the matrix held them):

| Row | Reading | Load |
| --- | --- | --- |
| `home.nav.no-pause` (new) | passed: 1440, 1024, 768, 390 and 320 in both appearances, no toggle in the header, the terminal's 28 by 28, the footer's 134.3 by 32 reading Pause Motion and then Play Motion at 134.3; each press flips `html[data-motion]` and both `aria-pressed` by the next frame; a stored pause reads both pressed at `DOMContentLoaded` with no live core and both draw `play`; under reduced motion neither shows | 134.7 to 117.7 |
| `home.nav.fits-320` (new) | passed: 58 px at 320, 359, 360, 390, 720, 1024 and 1440 in both appearances; gap 4 px and no hairline at 320 and 359; the last edge at 304 (320), 343 (359), 344 (360), 374 (390); no overlap and nothing inside Sign In | 117.7 |
| `home.nav.icons` (restated) | passed | 134.7 |
| `home.motion.reduced` (restated) | passed | 134.7 |
| `home.motion.pause` (restated) | not read: load 147.7, the functional checks passed (both toggles named, the footer's press, both pressed, the label, the stored pause with both pressed and both `play` glyphs, Play from the terminal's toggle, storage that throws, both hidden under reduced motion) | 147.7 |

The first gate run of `home.motion.pause` failed on the driver: Playwright's `toHaveText` read both
labels of the footer's button ("Pause MotionPlay Motion"); the driver now reads the label that is
visible. The scratch runs before the byte cut below passed the same way.

The node-server build (shared tree, 15:06 to 15:08, load 120.7 to 111.1), served on 4732 with mail
off, `core-gate --only specs` on the seven home budget rows (`--allow-scratch`: lane A's
`decks/e2e-accounts` sat under `decks/`; these rows read `/home` alone):

| Row | Reading |
| --- | --- |
| `home.budget.bytes-first` | failed on the document alone: 100,579 B decoded (line 100,000), 16,994 B brotli; the page CSS 18,613 B brotli (line 20,000); the route chunk 41,072 B decoded, 9,112 B brotli; no picture before `load` |
| `home.budget.bytes-page` | passed |
| `home.budget.live-module` | passed (55,749 B decoded, 19,820 B gzip) |
| `home.budget.shared` | passed (reported: the shared vendor chunk 1,428,094 B, lane D's work in progress) |
| `home.budget.lcp` | not read: load 104.7 (the h1 is the element at 1440; at 390 the warm reading named the lead) |
| `home.budget.frame`, `home.budget.main-thread` | not read: load 103.9 (the boot script 984 B) |

The document: this push's own change is -51 B against the design round's tree. Read from the built
document: the footer's wrapper, button and script add 723 B; the bar's hairline after
Documentation (69 B), its toggle (326 B) and its script (242 B) leave, then the theme button's
wrapper span (68 B with its close) and 69 B of the script were cut once the first build read the
line crossed. The rest of the crossing is the shared tree's, read by diffing the two builds of this
lane: the second added a `ThemeButton` chunk's modulepreload (80 B) and a `ToolButton` stylesheet
link (103 B net with the vendor stylesheet's new name) once lane A's `/signin` imported the shared
theme button, and 81 B of router manifest; the first already carried a vendor stylesheet link and
the docs routes' manifest from lane D's work. Request P2-N-2 names it. The line is not raised.

`check-client-bundle.mjs` on that build failed the largest chunk and every route's preload ceiling
on the shared vendor chunk (1,428,094 B, lane D's work in progress; lane A's request A-R1 names
it); `/home` preloads 12 chunks and no docs module.

Other gates: `tsc -b apps/studio` exit 0 (the full `tsc -b` at 12:24 failed only on lane D's
`src/docs/source.ts` then); the landing's unit tests (`vitest run --project studio
apps/studio/src/components/home`) 17 files, 106 tests passed; the studio project's unit tests
failed only on 5 s test timeouts at load 150 to 300 (`assets.test.ts`, `pattern.test.ts`,
`agent-actions.test.ts`, `authorize.test.ts`, `index-facts.test.ts`, `auth/actions.test.ts`, a
different set each run, none in this push's files); the brand lint in enforce mode 0 open findings;
`competitor.test.ts` 9 passed; `build-home-assets.ts --check` 67 outputs match; prettier clean.

Pictures (`n/`): the bar `n1-bar-<1440|1024|768|390|320>-<light|dark>.jpg`; the footer
`n1-footer-<1440|390>-<light|dark>.jpg` and `-paused.jpg`; the terminal's head under reduced motion
`n1-terminal-<1440|390>-<light|dark>-reduced.jpg`. Each was opened: one hairline before Sign In at
every width from 360, the mark, the theme button, Sign In and New Presentation clear of each other
at 320, Pause Motion ending on the column's edge at 1440 and on its own line at 390 with its glyph on
the text's edge, Play Motion with the play glyph after the press, no toggle in the terminal's head
under reduced motion.

Deviations: the theme button's wrapper span `.ts-product-nav-icons` left (its rule moved to
`.ts-product-nav .ts-product-nav-icon`), to give bytes back to the document's line; the pressed
script is a `for` loop without a `try`; `HomeNav` keeps an unused `_props` until request P2-N-1
lands. The footer's toggle is a `.pt-ib` with its 10 px sides in the gutter (`margin-right: -10px`
from 720 px, `margin-left: -10px` under it) so its word sits on the column's edge.

After the commit (3f8ff6e2), with both rows in the matrix, `core-gate --only specs --rows
home.nav.no-pause,home.nav.fits-320` on 4722 passed both with zero retries (15:18 to 15:27, load
131.3 to 229.3).

## P2-N#2: the theme glyph from the first paint

Items (docs/POLISH-2.md 3.3; C10, Q27): the shared `ThemeButton` renders both half discs, `.pt-
theme-glyph.is-light` ◐ and `.is-dark` ◑, and `ToolButton.css` shows the one `html[data-theme]`
names, so the server's markup draws the right glyph before any script runs and a press changes no
markup; the React state, the MutationObserver and the `readTheme` import left. The icon button
(the bar's, `label` false) is named "Dark or light", its tooltip's words, for every visitor; the
labelled button (the editor's toolbar) is named "Theme", its visible word. `home.css`'s rule that
hid the glyph until hydration left. One more rule in the bar: `.ts-product-nav-signin a` draws no
underline, since lane A's work in the tree turns Sign In into a link to `/signin` (C13) and the
first hydrated pictures showed it underlined.

Files: `packages/chrome/src/ThemeButton.tsx`, `ToolButton.css`,
`packages/chrome/src/__tests__/theme-button.test.tsx` (new: the server markup's two glyphs and the
name, the same markup across presses while `html[data-theme]` flips, the labelled button's name,
the CSS rule); `apps/studio/src/routes/home.css`; `apps/studio/e2e/core/home/header.ts`
(`home.nav.theme-first-paint`), `home/design.ts` (`home.nav.icons` reads the tooltip "Dark or
light"); `docs/LANDING.md` 2.1; the matrix and README's block.

Rows, on 4722:

| Row | Reading | Load |
| --- | --- | --- |
| `home.nav.theme-first-paint` (new) | passed: with the module scripts aborted (the page not hydrated) the bar draws one glyph, ◐ on the light page and ◑ on the dark one at 1440 and 390, named "Dark or light"; without script ◐ on the light page at both widths; hydrated and after each of two presses the glyph follows `html[data-theme]` | 123.2 to 119.3 |
| `home.nav.icons` (as restated in P2-N#1, the tooltip now "Dark or light") | passed through core-gate, zero retries | 119.3 |

The node-server build (shared tree, 15:41 to 15:47, load 98.3 to 132.4) on 4732 with mail off:
`home.budget.bytes-page`, `live-module` and `shared` passed; `lcp`, `frame` and `main-thread` not
read (load 94 to 96); `bytes-first` failed on the document alone, 100,650 B decoded (16,993 B
brotli), the page CSS 18,551 B brotli and the route chunk 41,068 B decoded, 9,079 B brotli. This
push adds 71 B to the document, all in the theme button (the second glyph span, the `is-light`
class, the name "Dark or light" two bytes shorter than "Switch to light" in the label and the
tooltip), read by diffing this build's document against P2-N#1's; with P2-N#1's -51 B lane N's
pushes stand at +20 B against the design round's tree, and P2-N#3's lead gives 62 B back.
`check-client-bundle.mjs` reads every ceiling crossed on the shared vendor chunk (1,430,014 B).
Other gates: `tsc -p apps/studio --noEmit` reports one error, in lane A's work in progress
(`e2e/core/auth-plate.ts` 1134), and `tsc -b packages/chrome` one, in lane A's `TitleRow.tsx` 544;
none in this push's files. The chrome package's unit tests: `theme-button.test.tsx` 4 passed; the
whole package at load 278 failed 17 tests, the sign in ones in lane A's work in progress and the
rest 5 s timeouts (the eight other files pass with a 60 s timeout: 133 tests). Brand lint in
enforce mode 0 open findings; `competitor.test.ts` passed; prettier clean.

Pictures (`n/`): `n2-bar-<1440|390>-<light|dark>-before-hydration.jpg` (the module scripts
aborted), `-no-script.jpg` (JavaScript off) and `-hydrated.jpg` (the tooltip "Dark or light" shown
by the pointer). Each was opened: ◐ on the light page and ◑ on the dark one before hydration, ◐ on
the light page without script whatever the system's appearance, the plate after hydration, and
Sign In without an underline.

Deviation: the labelled button carries `aria-label="Theme"`, its visible word, where 3.3 says it
carries none: the toolbar's tier three hides the word with `display: none` (`Toolbar.css` 332), and
a button whose only text is hidden and whose glyphs are `aria-hidden` would have no name. The name
equals the visible label, so WCAG 2.5.3 holds. Request P2-N-3: `apps/studio/e2e/home-page.spec.ts`
152 and 156 still expect "Switch to ...".
