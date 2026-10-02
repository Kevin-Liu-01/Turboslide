# Brand direction B: a Turboslide wordmark in the race-type register

Written by brand designer B of the next program on 2026-10-01 between 19:30 and 20:10 -0700. The tree is `/Users/kevinliu/repos/Turboslide-next` at 94e8a5c3 (`T:` below). The brand source is Prototemplate at 58af25b on the branch speed-marks (`P:` below), read only. The realtime round is `Turboslide-realtime` at 8fdb0c4f, read only. Machine load (uptime): 48.00 at 19:31, 36.52 at 19:53, 85.99 at 20:00 and 111.15 at 20:02. No number in this note is a timing.

Nothing in the tree was edited. Every file this direction made is under `docs/gslides-parity/next/brand-b/`. No server was started and production was not opened.

## The direction

Turboslide gets its own wordmark in the speed register that Kevin chose for GT on 2026-09-29. The register is wide letters, a forward slant, one horizontal cut and speed bars into the first letter (P:src/lib/marks.ts 73 to 104). The letters are Inter's own outlines at weight 800, taken with fontkit from the InterVariable file the product ships. Each letter is widened by cutting it through its counters and inserting straight runs, so every stem keeps Inter's width. The word leans 12 degrees, the GT monogram's skew (P:scripts/build-speed-marks.mjs 94). One cut of 8 units on a 120 unit cap runs through every letter, the GT cut's thickness (P:scripts/build-speed-marks.mjs 108). Three bars lead into the T, and the cut splits the middle bar into two lines as it does in the GT monogram. A square monogram, the same T with its bars moved under the left arm, carries the tab icon, the app icon, the title row and the CLI banner. A separate pixel drawing carries 16 px. Every file is one path in currentColor with no font, no mask and no id. The chrome around it stays on the deck grammar: paper and ink, Inter at 500 or less, one rail on each side, ruled rows, Heroicons, and the declutter of `audit-clutter.md` and `audit-brand-surfaces.md`.

## What was read

- `audit-brand-source.md`, `audit-brand-surfaces.md` and `audit-clutter.md` in this folder, in full.
- P:deck/DECK-GRAMMAR.md (66 lines), P:scripts/build-speed-marks.mjs (443 lines), P:src/lib/marks.ts lines 70 to 110, P:DESIGN.md lines 100 to 146, 170 to 192 and 415 to 440, P:deck/slides/16-mark.html, 17-speed-monogram.html, 18-speed-lockup.html, 25-compression.html, the avoid lines 9 to 17 of 39-avoid.html, the picture P:deck/preview/contact-speed.jpg, and the header of P:src/components/plate/frame/PlateFrame.tsx.
- T:docs/brand.md (540 lines), T:packages/theme/src/brand.ts (324 lines), T:packages/chrome/src/tokens.css lines 1 to 200, T:packages/chrome/src/brand.css lines 1 to 80, T:packages/fonts/src/inter.css lines 1 to 40, T:apps/cli/src/commands/banner.ts lines 1 to 80, T:apps/studio/src/components/home/copy.ts lines 1 to 140, T:packages/theme/brand/site.ts lines 1 to 30, the head of T:README.md, the icon module T:packages/chrome/src/icons.tsx (the entries the mockups use), T:docs/gslides-parity/research-4/01-brand-references.md sections 5 to 7, and the step list of T:scripts/build-brand.ts.
- On the realtime branch: `git diff origin/main...HEAD` of `packages/chrome/src/dialogs/SignIn.tsx` and `accounts.css`, `docs/REALTIME.md` sections 4 and 7, and lines 228 to 243 of `apps/studio/src/server/auth/better-auth.ts`.
- `@better-auth/core` 1.7.4 `src/social-providers/google.ts` lines 172 to 174 in the worktree's node_modules: the default scopes are `email`, `profile` and `openid`.
- https://developers.google.com/identity/branding-guidelines, fetched twice, at 2026-10-02T02:53Z and at about 03:00Z. The page says "Last updated 2026-07-07 UTC". It answered: "The button font is Google Sans Medium."; the light theme is "Fill: #FFFFFF", "Stroke: #747775 | 1px", "Font: #1F1F1F"; the dark theme is "Fill: #131314", "Stroke: #8E918F | 1px", "Font: #E3E3E3"; the G "must be the standard color version (the standard color gradient super G logo) and appear on a white background"; the page also lists "Create your own icon for the button or use an outdated Google 'G' for the button", which I read as a prohibition; the recommended labels include "Continue with Google".

Not read: `docs/CLOUDFLARE.md` on the realtime branch, the rest of `docs/REALTIME.md`, `design-google-login.md`, P:BRAND.md, P:deck/parts/head.html beyond what the audits cite, and production. The trademark marks of Turborepo, Turbopack and the other products named Turboslide were not checked today.

## The marks

The generator is `brand-b/build-marks.mjs` with its geometry in `brand-b/marks-lib.mjs`, modelled on P:scripts/build-speed-marks.mjs. It imports fontkit 2.0.4 from `/Users/kevinliu/repos/Prototemplate/node_modules/fontkit` by absolute path. It reads `T:packages/fonts/assets/InterVariable.woff2`, which `cmp` found byte identical to `P:public/fonts/InterVariable.woff2`. fontkit 2.0.4 cannot instance a variable WOFF2: `getVariation` threw "Cannot read properties of undefined (reading 'tables')", and a WOFF2 built with coordinates threw "this._getPhantomPoints is not a function". The generator therefore decompresses the file once with python3 and fontTools 4.63.0 into the system temp folder and instances that TTF at `wght` 800 and `opsz` 32.

The construction, in the GT monogram's units (cap 120 units from y 40 to the baseline at y 160), with every number from `marks/geometry.json`:

- Weight 800. Inter's stem there is 27.79 units on the 120 unit cap.
- The widening. Each letter with a counter is cut at the x where the curves it crosses are flattest (`flattestX` in marks-lib.mjs) and extended by 300 font units, 0.6 of that for r, and 0.62 of that in each arm of the T. l and i keep their one stem.
- The slant. 12 degrees about the baseline, so the baseline stays put.
- The cut. 8 units, from y 99.81 to 107.81. Its lower edge sits on the top of the e's bar (`cutFor` in marks-lib.mjs). The cut crosses the e's eye, the upper counters of o, b, d and s, and the stems, and it touches no horizontal stroke. On the T it falls 3.81 units below mid cap height.
- The bars of the wordmark. A 22 unit extension of the crossbar, a middle bar 96 units long and 36 units tall centred on the cut, which the cut leaves as two lines of 14 units, and a bottom bar 60 units long as thick as the crossbar (24.64 units). They end 12 units before the T's left end.
- The bars of the monogram. The same three bars under the T's left arm, ending 12 units before the stem, the middle bar reaching 26 units past the arm's end.
- The 16 px drawing. `FAV16` in build-marks.mjs: a 12 px cap on rows 2 to 13, the crossbar 3 rows by 10 px, the stem 3 px stepped one pixel left at the cut and again at row 12, the cut one clear row, the middle bar as two 1 px lines, and the bars 5, 4 and 3 px long, each 1 px clear of the stem.
- The CLI glyph. The 16 px drawing's 12 by 12 area as half blocks (`marks/banner.txt`), six lines tall.

| File | Bytes | What it is |
| --- | --- | --- |
| `marks/wordmark.svg` | 7,278 | The wordmark, one path, box 1121.92 by 123.38 units, aspect 9.09 |
| `marks/monogram.svg` | 632 | The square monogram, one path, aspect 1.44 |
| `marks/favicon-16.svg` | 624 | The 16 px drawing on the paper tile with the 1 px frame and the `prefers-color-scheme` block |
| `marks/icon-tile.svg` | 919 | The vector monogram on the same tile, for 32 px and up |
| `marks/app-icon.svg` | 719 | The paper monogram on an opaque ink square with no corners, for the touch and manifest icons |
| `marks/favicon-16.png`, `favicon-16-dark.png` | 171, 174 | Rendered from favicon-16.svg in each scheme. Each decodes to 3 colors: 127 plate, 69 ink and 60 frame pixels |
| `marks/favicon-32.png`, `favicon-32-dark.png` | 503, 538 | Rendered from icon-tile.svg, antialiased, 49 and 50 colors |
| `marks/apple-touch-icon.png` | 1,754 | Rendered from app-icon.svg at 180 px |
| `marks/banner.txt` | 156 | The CLI glyph |
| `marks/geometry.json` | 760 | The numbers above |

The tile colors are the tree's `TILE_COLORS` (T:packages/theme/src/brand.ts 231 to 234): the frame #656565 on paper and #888887 on ink, 5.83:1 and 5.68:1 (T:docs/brand.md section 12).

How the letters measure after widening, in units before the slant (width by height): T 129.6 by 120.0, u 107.9 by 86.9, r 70.0 by 85.3, b 113.1 by 121.9, o 113.6 by 88.9, s 105.7 by 88.9, l 27.8 by 120.0, i 30.5 by 121.3, d 113.0 by 121.9, e 110.3 by 88.9. Five letters are wider than tall.

`variants.html` (pictures `variants-light.png` and `variants-dark.png`) is the sheet the direction was chosen from: weight 700, 800 and 900; widening 150, 300 and 450; the bars before the T, under the arm into the stem, and under the arm clear of the stem; no cut; no bars; and Inter 500 upright for comparison. The bars run into the stem read as a reversed E at 32 px and smaller, so the square monogram keeps them clear of the stem.

## The rules B adds or changes

Against the deck. None of these touches the avoid list (P:deck/slides/39-avoid.html 9 to 17; P:deck/DECK-GRAMMAR.md 39) or the copy register (DECK-GRAMMAR 22 and 23).

| Rule | What B does | The deck's rule it extends |
| --- | --- | --- |
| The Turboslide mark joins the speed register | Wide, slanted 12 degrees, one 8 unit cut, three bars into the first letter, one color | P:src/lib/marks.ts 73 to 104; DECK-GRAMMAR 50 to 53 |
| The cut on a mixed case word | The cut keeps the GT thickness and sits on the top of the e's bar, 3.81 units under mid cap height, because mid cap height is where the lowercase counters begin | marks.ts "One cut" (line 87): "at mid cap height" |
| Wide letters | Letters with a counter are widened. l, i, r, b and d stay narrower than tall | marks.ts line 77: "Every letter is wider than it is tall" |
| Outline weight | The mark is Inter outlines at weight 800. Live text keeps the 500 cap | DECK-GRAMMAR 20 caps display text at 500. The GT speed marks are outlines of 900 weight faces (build-speed-marks.mjs 29 to 31, 56 to 62) |
| A mark is generated, never drawn by hand | The 16 px drawing is the one hand drawing, written as rows in the generator | DECK-GRAMMAR 53 |
| Two arrangements | The wordmark leads with the bars. The square monogram tucks them under the arm | The GT set has one arrangement per file (DECK-GRAMMAR 52) |
| Present | Slideshow keeps the 8 px corner with the label first and the play glyph after | P:DESIGN.md 430 |
| Google's button | Google's light theme with the standard G in both appearances, the label "Continue with Google" | The brand mark class of the GT docs skill, as `audit-brand-surfaces.md` rank 24 cites it |

Against Turboslide's own record. These are decisions of round four that B overturns, so each needs Kevin's yes.

| Record | It says | B |
| --- | --- | --- |
| T:docs/brand.md 65 to 71 | The mark "is not ... a chevron pair, a speed line" and borrows "no sliding or speed glyph" | Replaced by the speed register |
| T:docs/gslides-parity/research-4/01-brand-references.md 276 and 303 | The same obligation, and item 12's "a speed line" in the confusion list | Same |
| T:docs/brand.md 102 to 106 and research-4/01 lines 291 and 293 | The wordmark is live text in Inter 500 and is never outlines in the code base | The wordmark becomes outlines at weight 800 everywhere it appears. Live text "Turboslide" stays Inter 500 in sentences |
| T:docs/brand.md 22 to 63 | The mark is a slide with a plate window, solid below 64 px and cellular from 64 px | The dither mark retires. The monogram is vector from 24 px, the pixel drawing at 16 px |
| T:docs/brand.md 303 to 318 | The banner glyph is four lines from `markBlocks(8)` | Six lines from the 16 px drawing |

## The surfaces

The mockups are static pages under `brand-b/mockups/`, written by `brand-b/render-mockups.mjs`. They link the product's own sheets by path (`packages/fonts/src/inter.css`, `packages/chrome/src/tokens.css`, `packages/chrome/src/brand.css`), take their icons from `packages/chrome/src/icons.tsx`, and stamp `data-theme` from `?theme=` as the product's boot script does. The sample deck names and dates on `/decks` are mockup data.

- The editor's default view, one slide open. The title row holds the monogram at 22 px, the deck name, Assist as a word with no sparkle glyph, the comments and side panel glyphs, Slideshow with its arrow, Share and Sign In. There is no "Last edit" on a draft nobody edited, no account chip with a generated name, and no pointer toggle (`audit-clutter.md`). The slide is the blank template on the gt-ink-paper sheet without the GT monogram and without the GT wordmark in the band (`audit-brand-surfaces.md` rank 2 and proposal 2). At 390 px the title row keeps the name, an icon Slideshow, Share and a More button, the menu bar keeps five menus and a More button, and the filmstrip moves under the notes.
- `/home`, the first screen. The navigation holds the monogram, Documentation, the appearance control, and New Presentation. GitHub leaves the navigation (`audit-clutter.md`, words to change). The hero is the wordmark across the column, then the heading and the lead from T:apps/studio/src/components/home/copy.ts and two buttons. The column has one rail on each side with 9 px crosses where the seams meet them (`audit-brand-surfaces.md` rank 9). The picture is the editor mockup in an edge frame, so the capture shows no selection blue (rank 13).
- `/decks`. The app bar holds the wordmark, the search pill and Sign In. "Start a new presentation" shows the blank tile and the GT brand deck tile, which keeps the GT mark because it is the GT template (T:docs/brand.md 134 to 139). "Your presentations" is a ruled list of the viewer's own and shared presentations with framed thumbnails, as proposal 1 of `audit-brand-surfaces.md` asks. The caption "Every presentation on this Turboslide is listed here" is gone.
- The Sign in dialog over the editor. The monogram heads a square dialog in the edge frame over the scrim. The heading is "Sign in". One sentence says what signing in gives. Continue with Google is the only method, as REALTIME.md 4.6 sets for `TURBOSLIDE_MAIL=off`. The note says the dialog uses the name and the address of the Google account and reads nothing else afterwards, which follows the default scopes and REALTIME.md 4.6 ("the Google picture is not used"). The passkey row is removed (`audit-brand-surfaces.md` proposal 15), where the realtime branch keeps it greyed (REALTIME.md 4.1).

Each surface was rendered at 1440 by 900 and 390 by 844 in both themes and looked at. What read wrong and was fixed before this note: the Select glyph drew as a square (the icon extractor read past a one line entry); thumbnail titles on `/decks` were cut mid word; "Start a new presentation" wrapped after its second word at 390 px; the paper ground of the mark sheet drew the monogram in the dark token; the CLI banner showed an invented version number; the dark dialog put the G on #131314, which the Google page refuses.

## Files a build round would change

| File | What changes |
| --- | --- |
| T:packages/theme/src/brand.ts | The dither geometry (lines 48 to 286: `WINDOW`, `FIELD_END`, `CELL_THRESHOLD_PX`, `markBits`, `markPath`, `solidWindow`, `TILE_SIZES`, `markBlocks`) gives way to the speed geometry as data: the committed wordmark and monogram paths, the 16 px rows and `markBlocks` from them. `TILE_COLORS`, the contrast functions, `SELECTION_COLORS` and `BRAND_TOKENS` stay. `brand.test.ts` (662 lines) is rewritten around the new facts |
| T:scripts/build-brand.ts | The generator of this folder moves in. The fontTools venv step for the outlines (lines 117, 475 to 528) either takes fontkit as a dev dependency, which the tree does not have today, or ports the widening, slant and cut to the fontTools venv it already uses. It writes `mark.svg`, `mark-small.svg`, `icon-tile.svg`, `wordmark.svg` and `lockup-stacked.svg` under T:packages/theme/brand, the ICO entries (16 px from the drawing, 32 and 48 px from the vector), the touch, manifest, maskable and monochrome icons from the app icon, the card, the README PNGs, `mark-geometry.json` and `brand-manifest.json`. `--check` compares the committed paths, so an Inter update cannot move the mark silently |
| T:packages/theme/brand/ | `og-template.html` sets the wordmark outlines on the plate (it sets the word as outlines from `wordmark-outlines.svg` today), and its address leaves monospace (`audit-brand-surfaces.md` rank 8). `outline-wordmark.py` retires with the old outlines |
| T:apps/studio/public/ | `favicon.ico`, `icon.svg`, `apple-touch-icon.png`, `icons/*.png`, `og/turboslide.png` and `brand-manifest.json`, all regenerated. `manifest.webmanifest` changes only where the icon bytes do |
| T:packages/chrome/src/TurboslideMark.tsx | Draws the monogram path at 24 px and up and the 16 px rows below, named "Turboslide" alone and hidden beside the word |
| T:packages/chrome/src/brand.css | `.ts-mark` sets `shape-rendering: crispEdges` (line 64). Slanted edges stair-step under it, so it moves to the 16 px drawing alone. The lockup rules (lines 89 to 137) become one `.ts-wordmark` rule sized by height |
| T:packages/chrome/src/AppBarBrand.tsx, TitleRow.tsx, TitleRow.css | The app bar shows the wordmark at 18 px tall in place of the mark and the live word. The title row's mark slot (TitleRow.tsx 485, `--ts-mark` 24 px square) becomes 32 by 22 px for the monogram's 1.44 aspect |
| T:packages/chrome/src/Sidebar.tsx, Toolbar.tsx, Filmstrip.tsx | `GtMark` gives way to `TurboslideMark` at Sidebar.tsx 1038 and 1042, Toolbar.tsx 530 and Filmstrip.tsx 1105 and 1109 (`audit-brand-surfaces.md` rank 17) |
| T:apps/studio/src/routes/home.tsx, home.css, components/home/HomeNav.tsx, HomeFooter.tsx, copy.ts | The navigation keeps the monogram (HomeNav.tsx 46 to 51 draws the mark and the live word today), the hero gains the wordmark across the column, the rails and crosses of `audit-brand-surfaces.md` rank 9 arrive, and GitHub leaves `NAV.links` (copy.ts 88). The crispEdges rule at home.css 319 is read against the slanted mark |
| T:README.md | Lines 3 to 6: the `<picture>` points at new dark and light wordmark PNGs with a new alt text |
| T:apps/cli/src/commands/banner.ts, banner.test.ts | `markBlocks` (line 13) returns the six line glyph. The four facts keep their lines and two lines of the glyph stand alone |
| T:docs/brand.md | Sections 1 to 3, 11 and 16 are rewritten for the speed mark, and the rule at lines 65 to 71 is replaced with Kevin's decision |
| T:apps/studio/src/brand-files.test.ts | The file list and sizes follow the new manifest |

## Risks

1. B overturns round four's written rule against speed glyphs (T:docs/brand.md 65 to 71). That rule came from a naming risk: other products sold as Turboslide and Vercel's Turbo marks (research-4/01 line 276). The bars make the mark read as speed, and the name already says speed. Those marks were not checked today.
2. The deck caps display text at weight 500 (DECK-GRAMMAR 20). B treats a mark's outlines as outside that rule, as the GT speed marks are. If Kevin reads the cap as covering marks, the register loses its weight. The lightest weight drawn on the variant sheet is 700.
3. The register's wide rule holds for five of ten letters. r, b, d, l and i are narrower than tall.
4. The cut is placed from the e of Inter 4.1 at weight 800. A change of weight or of the Inter file moves it and the outlines. The build has to commit the paths and check them.
5. Two drawings exist: the vector monogram and the 16 px rows. Both have to change together.
6. The title row draws the monogram file 22 px tall, and its view box is 128 units tall with the padding. On a 1x screen the 14 unit bar lines are then 2.4 px and the cut 1.4 px, so the cut is soft. On a 2x screen they are 4.8 px and 2.8 px. A hinted 24 px drawing is the fallback.
7. Google's page asks for Google Sans Medium on the button and "the standard color gradient super G logo". The mockup sets the label in Inter and draws the four color G, so it does not meet the page as read today. Meeting it brings a second typeface and a gradient into the dialog, against DECK-GRAMMAR 24 and 39. Google's own rendered button is the other way to meet it, and it is a different sign in flow from better-auth's redirect.
8. The realtime round owns the dialog. Its branch draws Continue with Google as a solid ink button with no G (accounts.css `.ts-sign-in-method.is-primary`) and keeps the greyed passkey row. B's dialog differs on both and has to be merged into that lane's work after it ships.
9. The `/decks` mockup assumes the listing shows the viewer's own and shared presentations. That change belongs to another lane (`audit-brand-surfaces.md` proposal 1).
10. The card, the README PNGs and the GitHub social preview have to be regenerated. The social preview is Kevin's manual upload (T:docs/brand.md 431 to 435).
11. fontkit is not a dependency of the tree. The build either adds it or reimplements the steps in the fontTools venv.

## Open for Kevin

1. Whether Turboslide joins the GT speed register (`audit-brand-source.md` open item 2, `audit-brand-surfaces.md` proposal 20). B is the yes.
2. Whether the wordmark's outline weight may exceed 500.
3. Whether Google's button is drawn by Turboslide in Inter with the four color G, drawn to the page's letter with Google Sans and the gradient G, or rendered by Google.
4. Whether the passkey row stays greyed or leaves the dialog until passkeys exist.

## Pictures

All under `brand-b/pictures/`, rendered with playwright-core 1.62.1 from the worktree at device scale factor 1.

- `editor-1440-light.png`, `editor-1440-dark.png`, `editor-390-light.png`, `editor-390-dark.png`
- `home-1440-light.png`, `home-1440-dark.png`, `home-390-light.png`, `home-390-dark.png`
- `decks-1440-light.png`, `decks-1440-dark.png`, `decks-390-light.png`, `decks-390-dark.png`
- `signin-1440-light.png`, `signin-1440-dark.png`, `signin-390-light.png`, `signin-390-dark.png`
- `marks-light.png`, `marks-dark.png`: the wordmark, its construction, both grounds, the monogram by size, Chrome's tab strips and the CLI banner on the code panel
- `variants-light.png`, `variants-dark.png`: the variant sheet

The mark files and their PNGs are under `brand-b/marks/`. To rebuild: `node docs/gslides-parity/next/brand-b/build-marks.mjs --variants`, then `node docs/gslides-parity/next/brand-b/render-mockups.mjs`.
