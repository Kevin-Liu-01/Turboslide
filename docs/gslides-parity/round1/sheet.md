# Round 1 brand sheet: the speed monogram from rectangles beside the live word

Written by lane B1 on day 0 of Round 1 (docs/NEXT.md 4.1.2) between 2026-10-01 21:45 and 2026-10-02 01:40 PDT. The tree is `/Users/kevinliu/repos/Turboslide-next` on `next/round1` (`T:` below), at 56431c76 when this lane started and at 40164663 when it ended (other lanes' commits). The brand source is Prototemplate on `speed-marks` at 1b00062 (`P:` below), read only. `P:public/marks/bar-monogram.svg` has the sha256 `5257b4d87d23b91b81cd8bda56d8f23250114fc1c624dd43ae94b6b53cc1f59f`, the same file brand A read. Nothing in the product changed and nothing was committed. Every file this lane made is under `T:docs/gslides-parity/round1/sheet/`, apart from this note and the request file `T:docs/gslides-parity/round1/build/B1.md`. No dev server was started, no deck was created and no deployment was opened.

The load rule held the render for about three and a half hours. The one minute load average (uptime) read 40.87 at 21:45, between 43.84 and 81.59 in the five minute readings until 23:52, and 13.93 at 23:57. The first render ran at 23:57 at 15.39, and the selective re-renders and two scratch measurements of the T's bearing ran between 23:58 and 00:00 at 14.21 to 17.89. The load then read between 23.90 and 60.47 from 00:01 to 01:21; the render's own check read 24.14 at 01:21 and held the run. The bearing measurement ran at 01:26 at 19.60 and the last renders at 01:27 between 18.85 and 20.48. Every Playwright run started under 24; nothing in this note is a timing.

## What was read

- `T:docs/NEXT.md` sections 3, 4.0, 4.1, 5, 6 and 7 in full.
- `T:docs/gslides-parity/next/brand-b.md` in full, with `brand-b/build-marks.mjs` (the `FAV16` rows and the banner), `brand-b/marks-lib.mjs` 400 to 491 (the bars and `compose`), `brand-b/marks/geometry.json`, `brand-b/marks/monogram.svg` and the picture `brand-b/pictures/marks-light.png`, `editor-1440-light.png` and `editor-390-light.png`.
- `T:docs/gslides-parity/next/brand-a.md` 1 to 80 (the mark and the lockup at 32 to 43) and `brand-a/marks/lockup-sheet.png`, `brand-a/shots/signin-1440-light.png`.
- `T:docs/gslides-parity/next/brand-c/mock/c-tokens.css` and `c.css` 30 to 75 (the rail, the cross, the hatch), and `brand-c/shots/editor-1440-light.png`, `editor-390-light.png`, `signin-1440-light.png`, `decks-1440-light.png`.
- `T:docs/gslides-parity/next/brand-judge-1.md` 170 to 195 and `brand-judge-3.md` 108 to 135.
- `T:docs/gslides-parity/research-4/01-brand-references.md` 268 to 305 and source line 508 (the round four name check, NM1 to NM3).
- `P:deck/DECK-GRAMMAR.md` (66 lines) and `P:scripts/build-speed-marks.mjs` 1 to 141.
- In the tree: `packages/chrome/src/TurboslideMark.tsx`, `packages/chrome/src/brand.css` 50 to 226, `packages/chrome/src/TitleRow.css` 1 to 95, `packages/chrome/src/tokens.css` (the light and dark token values), `packages/chrome/src/dialogs/SignIn.tsx` 100 to 160, `packages/chrome/src/dialogs/accounts.css` 1 to 80, `packages/chrome/src/AppBarBrand.tsx`, `apps/cli/src/commands/banner.ts`, `packages/theme/src/brand.ts` (the exports and `markBlocks`), `scripts/build-brand.ts` 1 to 60, `apps/studio/src/routes/decks.index.tsx` 780 to 830, the `HOME` strings in `packages/chrome/src/menus/strings.ts`, and `git grep` of every consumer of `TurboslideMark` and of the mark geometry.

## The construction

The generator is `sheet/build-sheet.mjs` with the geometry in `sheet/mark-lib.mjs`. It builds the monogram the way `P:scripts/build-speed-marks.mjs` 94 to 142 builds the GT T: rectangles in an upright space, a shear of tan(12 degrees) (x becomes x minus 0.2126 times y), and the cut applied to the geometry, so each rectangle becomes one or two parallelograms. No Inter outline is used and nothing is widened. The output is 7 parallelograms in one path in `currentColor`, with no mask, no id and no font.

The units are the GT monogram's: a cap of 120 units from y 40 to the baseline at y 160 and the cut from y 96 to 104. The stroke weights are the GT T's: a crossbar 30 units tall and a stem 34 units wide. The bars are the GT bars' heights: 30, 36 and 30 units, with the middle bar centred on the cut so the cut leaves two lines of 14 units. The arrangement is brand B's square form: the three bars under the T's left arm, clear of the stem.

| Rectangle | x, y, w, h (upright units) | What it is |
| --- | --- | --- |
| crossbar | 22, 40, 134, 30 | The T's arm: 50 units on each side of the stem |
| stem | 72, 40, 34, 120 | The cut splits it at y 96 to 104 |
| top bar | 0, 40, 24, 30 | Runs the arm 22 units past its left end, overlapping it by 2, as the GT top bar overlaps the G |
| middle bar | -4, 82, 64, 36 | Reaches 4 units past the top bar and ends 12 units before the stem; the cut leaves two lines of 14 |
| bottom bar | 16, 130, 44, 30 | Ends 12 units before the stem |

The path data is 242 bytes (the file `sheet/marks/monogram.svg` is 385 bytes) with the sha256 `3e95914b621faf3bee9b73421ac62b264ee384c165346025c09dec99c154190a`. Its box after the shear is 176.58 by 120 units, an aspect of 1.47; brand B's monogram was 1.44. Every number is in `sheet/marks/geometry.json`.

Two choices differ from brand B's numbers, and both were made by looking at the browser free preview `sheet/preview.mjs` writes:

1. The weights are the GT T's (crossbar 30, stem 34) where brand B's came from Inter 800 (24.64 and 27.79 to 28.9). The mark then shares its weights with the GT bar monogram it sits beside on slides 17 to 23, and the construction picture sets the two at one cap to show it.
2. The bottom bar starts 16 units after the top bar's end where brand B started it at 28 (relative to the same end). At the GT weight a 30 unit tall bar 32 units long read as a block. At 44 units it reads as a bar, and the three bars step 22, 64 and 44 units long as the GT bars step 22, 82 and 52.

### The 16 px drawing

`ROWS16` in `sheet/mark-lib.mjs` is the one hand drawing, as rows of `#` and `.`. At 16 px the slant and the 8 unit cut fall between pixels, so the form is set as whole pixels on a 12 px cap in rows 2 to 13, with the width squeezed into 12 px (columns 2 to 13):

```
................
................
...###########..
...###########..
...###########..
........###.....
........###.....
..#####.###.....
................
..####.###......
.......###......
.......###......
..###.###.......
..###.###.......
................
................
```

- The crossbar is three rows from column 3 to 13. The top bar folds into a left arm of 5 px against a right arm of 3 px.
- The stem is 3 px, stepped one pixel left after the cut and again at the bottom bar: the slant as two steps over the cap, where tan 12 degrees gives 2.55 px.
- The cut is one clear row through the stem and the middle bar. The middle bar is the two 1 px lines the cut leaves.
- The bars start at column 2, one pixel left of the crossbar, and end one pixel before the stem, so they step 5, 4 and 3 px.
- Columns 1 and 14 stay clear for the tile's frame and its 1 px margin.

Four candidates were drawn and compared at 1x and 8x against the vector at the same cap (`ROWS16_CANDIDATES`): the chosen rows, the bottom bar from column 3 (a 2 by 2 block that read as a dot), the cut on row 7 (the lower gap three rows tall), and the crossbar from column 4 (brand B's, which loses the top bar's run past the arm).

The CLI glyph is these rows' 12 by 12 mark area as half blocks, two pixel rows to a line, six lines (`sheet/marks/banner.txt`):

```
 ███████████
 ▀▀▀▀▀███▀▀▀
▄▄▄▄▄ ███
▄▄▄▄ ▄▄▄
     ███
███ ███
```

### The sizes

"The monogram at N px" on this sheet means the vector drawn in an N px square with its cap in the whole pixels that fit the square's width: a 16 px cap at 24 px, 21 px at 32 px and 122 px at 180 px, the cap line on a whole pixel row. At 16 px the rows draw instead. The 32 px tile draws the vector at a 16 px cap inside the 1 px frame, and the 180 px touch icon draws the paper monogram at a 76 px cap on the ink square. The tab icon and the 32 px tile carry the tree's `TILE_COLORS` (`T:packages/theme/src/brand.ts` 231 to 234) and a `prefers-color-scheme` block.

## The lockup

The lockup follows brand A's rules (`T:docs/gslides-parity/next/brand-a.md` 34 to 43): the word's cap height equals the mark's cap, the baselines meet, and the gap from the mark's crossbar to the word's T is half the cap. The word is live text in Inter 500 with `cv11` and `ss01` and the app bar's tracking of -0.01 em.

Inter's metrics were read with fontkit 2.0.4 from `T:packages/fonts/assets/InterVariable.woff2` (Version 4.001): 2048 units per em, a cap height of 1490, and a T whose left side bearing is 98 units in the default instance (wght 400, opsz 14). fontkit drew nothing.

The T's bearing at weight 500 moves with Inter's optical size axis, which Chrome sets to the font size in px between 14 and 32. `sheet/measure-bearing.mjs` drew the T at 1000 px with the axis pinned and read the leftmost ink column at the half threshold (`sheet/marks/bearing.json`, load 19.60):

| opsz | 14 | 16 | 18 | 20 | 22 | 24 | 26 | 28 | 30 | 32 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| The T's left bearing, units of 2048 | 90 | 86 | 82 | 76 | 72 | 68 | 61 | 57 | 53 | 49 |

The rule as CSS, from those numbers:

| Property | Value | Why |
| --- | --- | --- |
| The mark's height | 0.727539 em | Inter's cap, 1490 of 2048 |
| The mark's width | 1.070570 em | The cap times the aspect 1.4715 |
| The mark's alignment | `vertical-align: baseline` on a view box from y 40 to 160 | The view box's bottom edge is the mark's baseline |
| The space after the mark | 0.328613 em at a 22 px word; 0.319824 em at 14 px, 0.323730 em at 18 px, 0.339844 em from 32 px | Half the cap (0.363770 em) less the T's left bearing at the word's optical size |

The first render used fontkit's 98 units at every size, and the gap measured 41 px against 43.65 px at the 120 px word, 2.65 px short. With the measured table the gap reads within one pixel at every size drawn. A product rule needs one value per lockup size: 0.328613 em for the 22 px word of the `/decks` bar and the Sign in plate.

Read from the rendered pixels of `pictures/lockup-light.png` and `lockup-dark.png` at 1x with the guides hidden, ink at the half threshold (`sheet/pictures/measure.json`, the same readings in both appearances):

| Word | Gap, ink to ink | Half the cap | The mark's cap | The T's cap | The bottom ink rows, mark and word |
| --- | --- | --- | --- | --- | --- |
| 120 px | 44 px | 43.65 px | 87 px | 87 px | 116 and 117 |
| 66 px | 24 px | 24.01 px | 48 px | 48 px | 54 and 54 |
| 22 px | 9 px | 8.00 px | 16 px | 16 px | 22 and 22 |
| 18 px | 7 px | 6.55 px | 13 px | 13 px | 18 and 18 |
| 14 px | 5 px | 5.09 px | 10 px | 10 px | 15 and 15 |

The caps are equal at every size. The baselines meet at 66 px and below. At 120 px the word's ink sits one pixel lower than the mark's: Chrome places the text on a whole pixel baseline and the mark's box at the layout's fractional position.

## The pictures

Every picture is a viewport capture at device scale factor 1, PNG, under 200 KB; the 17 pictures are 1.16 MB in all. Each was looked at after its render.

| Picture | What it shows |
| --- | --- |
| `sheet/pictures/marks.png` | The monogram at 180, 32, 24 px and the 16 px rows at 1x on paper and on ink; the same pixels enlarged (32 and 24 px at 4x, the rows at 8x, and the vector at 16 px at 8x, which shows why the rows exist); the tab icon at 1x and 8x, the 32 px tile at 1x and 4x, the 180 px touch icon; a tab strip at 1x in each appearance |
| `sheet/pictures/construction-light.png`, `construction-dark.png` | The five upright rectangles beside the sheared and cut result with the cap line, the cut band and the baseline; the numbers as ruled rows; the GT bar monogram beside the Turboslide monogram at one 80 px cap |
| `sheet/pictures/lockup-light.png`, `lockup-dark.png` | The lockup at a 120 px word with the shared cap line and baseline and the half cap gap; the lockup at 66, 22, 18 and 14 px; the 24 px home link; the rule's numbers and the measured readings |
| `sheet/pictures/signin-1440-light.png`, `signin-1440-dark.png`, `signin-390-light.png` | The lockup at the head of the Sign in plate over the editor, the heading "Sign in", one sentence, Continue with Google in Google's light and dark themes, the way to keep working without an account, the foot sentence on what Google gives. The picture cell is a plain plate with a caption, because B4 has not read a mood picture's license yet |
| `sheet/pictures/editor-1440-light.png`, `editor-1440-dark.png` | The title row at 1440: the 24 px monogram in its 32 px home box, the deck name, Assist as a word, the comments and side panel glyphs, Slideshow with the label first at 8 px, Share square, Sign In as text; a draft nobody edited shows no Last edit words. The blank slide stays white on dark chrome |
| `sheet/pictures/editor-390-light.png`, `editor-390-dark.png` | The title row at 390: the monogram, the name at 154.7 px (the row's bound is 96), Slideshow as a 32 px key with the 8 px corner, Share and More; one Menus key on the tool row; the filmstrip under the sheet. Sign In moves into More at this width |
| `sheet/pictures/decks-1440-light.png`, `decks-1440-dark.png`, `decks-390-light.png` | The `/decks` bar: the lockup at a 22 px word, the search field at the 6 px radius, Sign In as text, in the 1104 px column with one rail on each side and 9 px crosses at the seams; Start a new presentation, the hatch strip and ruled rows with 64 by 36 framed thumbnails. The deck names and dates are mockup data |
| `sheet/pictures/question2.png` | Question 2 on paper and on ink: brand B's outlined weight 800 wordmark (its own file, `next/brand-b/marks/wordmark.svg`) beside the monogram with the live Inter 500 word, both at a 48 px cap and again in a 58 px bar at a 16 px cap |
| `sheet/pictures/cli-banner.png` | The six line glyph from the rows on the `#101010` panel beside the four facts the banner prints, drawn as the cells a terminal fills for the half block characters |

What read wrong and was fixed before this note:

1. The sizes list of the lockup page drew the word at 15 px in titanium beside a full size mark, because the label rule matched the lockup's own spans. The label selector was narrowed.
2. Two of the construction figure's three guide labels were off the page and the third sat 330 px low, because a coordinate string was concatenated with a number. Fixed.
3. The GT and Turboslide comparison pushed the rows column past the page's right edge. It moved under the figure, at an 80 px cap.
4. The construction outlines and the gap bracket used the selection blue, which DECK-GRAMMAR 29 keeps off lines. They are ink-2 now, on the plate fill.
5. The lockup gap read 41 px against 43.65 px at 120 px (the optical size bearing above). The margin now follows the measured table.
6. The placement matrices rounded the scale to two decimals (0.13 for 0.13333), which drew the 32 px tile's mark 2.5 percent small. They carry five decimals.
7. The CLI glyph set as monospace text showed seams between the block characters, since the browser's block glyphs do not fill a 1.2 line. It is drawn as the terminal's cells.
8. The `/decks` sections lost the column's inner padding and touched the rails. Fixed.
9. The touch icon and the GT template tile had no edge on ink (an ink square on the ink ground). Both carry a hairline frame.
10. The 1440 filmstrip lost its slide number to a phone only class. Fixed.
11. The dark Sign in scrim used a value the tree does not have; the tree keeps one scrim for both appearances (`tokens.css` 150).

What the pictures still show that a judge or Kevin should weigh:

- At 1x the 24 px mark lands its crossbar and bottom bar on whole pixels, and its two middle lines (14 units, 1.9 px) and the cut (1.07 px) are soft. The rows carry 16 px. A hinted 24 px drawing stays the fallback brand-b risk 6 named; this sheet did not draw one.
- The monogram is heavier than the live word beside it: its stem is 28 percent of its cap, the GT T's proportion. Brand A's lockup of the GT bar monogram and the same word has the same contrast.
- No fresh judge has scored this sheet yet; NEXT.md 4.1.2 asks for one before B1 pushes a mark.

## The name check

Run on 2026-10-01 between 22:00 and 22:20 PDT with WebSearch, WebFetch, the USPTO's TSDR status pages, Apple's public search API, npm's registry search and `gh api search/repositories`. Every page was read as data. Brand B and the three judges had not run it (brand-b 20 and 112; brand-judge-3 130).

The result: no product sold as Turboslide or Turbo Slide was found with a speed mark, and no software product named Turboslide was found besides this one. NEXT.md 4.1.2's fallback (C's mark) is therefore not taken, and the default of question 1 stands.

The trademark records. The USPTO's search page (tmsearch.uspto.gov) runs a browser challenge, which this lane did not pass, and the in-app browser refused the address. The records were found through a search page over USPTO data (trademarkelite.com) and each was then read on the USPTO's own TSDR status page:

| Mark | Record | Owner | Status | Goods | Drawing |
| --- | --- | --- | --- | --- | --- |
| TURBOSLIDE | Registration 3761186, serial 77797872, registered 2010-03-16 | Olympia Tools International, Inc., Covina, CA | Live, renewed 2020-10-07 | Class 8, "Hand tools, namely, utility knives" | Standard characters |
| TURBOSLIDE | Serial 77854924, filed 2009-10-22 | JPJ Investment Holding Co., Carson City, NV | Dead, abandoned 2010-05-11 | Class 8, knives and hand operated cutting tools | Standard characters |
| TURBO-SLIDE | Registration 5018456, serial 86423077, registered 2016-08-09 | Rytec Corporation, Jackson, WI | Live | Class 19, non-metal high speed industrial doors | Standard characters |
| TURBO-SLIDE | Serial 86517133, filed 2015-01-28 | Rytec Corporation | Dead, abandoned 2015-12-03 | Industrial and insulated sliding doors | Not read |

The same search listed no record for TURBO SLIDE as two words and no record under any of the three spellings in class 9 (software) or class 42 (software services). The two live registrations are standard character marks for knives and for doors, so neither claims a design. A filing by Turboslide in classes 9 and 42 would still meet them, which is a question for counsel and outside this note.

The products sold under the name, with the page each was read on:

| Product | Seller | What it is | Mark | Source |
| --- | --- | --- | --- | --- |
| The TurboSlide, TurboSlide SSX, TurboSlide PowerBender | TurboHarp (AntakaMatics, Inc.) | Harmonicas with a magnetic slide | No speed mark described | https://turboharp.com/collections/the-turboslide-series |
| TurboSlide | AQUARENA GmbH | A water park body slide | No mark described | https://www.aquarena.com/en/?p=2795 |
| Turboslide | Aqua Magic, Mamaia, Romania | A body water slide | None | https://coasterpedia.net/wiki/Turboslide_(Aqua_Magic) |
| Turbo Slide Playset Accessory | Playground One (Superior Play Systems) | A playground slide | The company's logo | https://superiorplay.com/product/accessories/playground-accessories/slides/turbo-slide/ |
| Turbo-Slide | Rytec Corporation | A high speed freezer door | The name in small caps with ®; the slanted RYTEC logo is the company's | https://www.rytecdoors.com/wp-content/uploads/2023/07/Rytec_Turbo-Slide.pdf |
| Preso-Matic Turbo Slide Show Viewer | Virtually Human Investigations (Second Life) | A slide viewer object inside Second Life, L$ 95, updated 2026-08-27 | The store's round icon | https://marketplace.secondlife.com/p/Preso-Matic-Turbo-Slide-Show-Viewer/486094 |
| Turbo Slide Ball | theappmakerpro | An Android game | Not read | https://play.google.com/store/apps/details?id=com.TheAppMakerpro.TurboSlideBall |
| TurboAnimator for Google Slides | turboanimator.com | A Chrome extension for Google Slides animations, 632 users, 1.5.2 of 2026-09-30 | Not described on the page | https://chromewebstore.google.com/detail/mhdmaokphjlbobmlioagngakkofbchdo |

The stores and registries:

- Apple: the iTunes Search API (`https://itunes.apple.com/search?term=turboslide&entity=software`, and `macSoftware`) returned 20 iOS apps and 0 Mac apps, none named Turboslide; the two word search returned 47 apps, none with "Turbo Slide" in its name.
- Google Play: the search for "turboslide" listed Turbo Slide Ball and no app named Turboslide (`https://play.google.com/store/search?q=turboslide&c=apps`).
- Chrome Web Store: TurboAnimator above; the extension the first web search returned (`mhfdnafbhfglkcjgkgoopjoadaopcomi`) is "Slides - Presentation Remote" by demobo.com.
- npm: `https://registry.npmjs.org/turboslide` answered 404 and the registry search for "turboslide" found 0 packages.
- GitHub: three repositories match: Kevin-Liu-01/Turboslide (this product), ville6000/Turboslider (a jQuery image slider) and pawatkriti-hash/229F_-_TurboSlide (a Unity project with two commits).
- Web search for turboslide.com, turboslide.ai, turboslide.io and "turboslides" found no other product.

The speed register. The software marks named Turbo in thesvg.org's registry (`https://thesvg.org/api/registry.json`, 7,426 entries) were read as SVG source: Turborepo is a ring with a gradient, Turbopack is nested squares with gradient segments, Hotwire Turbo is a cyan geometric form and TurboSquid is an orange squid. None uses wide slanted letters, a cut or speed bars. Generic stock art titled "Letter T Speed Logo Design Element" is sold (Shutterstock item 553768399, seen only through mirror pages; shutterstock.com answered 403), so a T with speed bars is a common stock form. This mark shares its cut and its weights with the GT bar monogram, which ties it to General Translation's set. Whether that is enough to register the mark is a question for counsel.

## The files a B1 build would change

NEXT.md 4.1.3 items 1 to 8 and 4.1.6 name B1's files. With the mark built from rectangles, the build needs no fontkit and no fontTools step for the mark: the generator is the code part of `mark-lib.mjs` (the rectangles, the shear, the cut, the path, the rows and the half blocks, under 100 lines) moved into the tree.

| File | Owner | What changes |
| --- | --- | --- |
| `packages/theme/src/brand.ts` | B1 | The dither geometry (48 to 286: `WINDOW`, `FIELD_END`, `CELL_THRESHOLD_PX`, `PATH_UNITS`, `markBits`, `markPath`, `cellRuns`, `markGrid`, `markSvg`, `solidWindow`, `TILE_SIZES`, `solidBits`, `tileMarkPath`) gives way to the monogram as data: the path, its sha256, `ROWS16`, `markBlocks` from the rows, and a `markAt(size)` placement by whole pixel cap. `MARK_LABEL`, `TILE_COLORS`, the contrast functions, `SELECTION_COLORS` (B3b's request, 321 to 324) and `BRAND_TOKENS` (B2's request, 23 to 35) stay |
| `packages/theme/src/brand.test.ts` | B1 | Rewritten around the new facts: 7 parallelograms, the box, the aspect, the sha256, the rows' shape, the six line banner |
| `scripts/build-brand.ts` | B1 | Writes the files below from `brand.ts`; `--check` compares the committed path with its sha256. The wordmark outline step (`packages/theme/scripts/outline-wordmark.py` under the fonts venv) retires with `wordmark-outlines.svg` if question 2 keeps the live word. B6 rewrites the citation string at 2230 after B1 |
| `packages/theme/brand/` | B1 | `mark.svg`, `mark-small.svg` (the rows), `icon-tile.svg`, `mark-geometry.json` regenerated; `wordmark.svg` and `lockup-stacked.svg` become the monogram with the word as live text; `og-template.html` 88 and 98 set the address in Inter and the lockup on the plate; `site.ts` 114 to 115 set the manifest colours to `#ffffff` |
| `apps/studio/public/` | B1 | `favicon.ico` (16 px from the rows, 32 and 48 px from the vector), `icon.svg` (the tile with the scheme block), `apple-touch-icon.png` and `icons/*.png` (the ink square at the 180 px placement, scaled), `og/turboslide.png`, `brand-manifest.json`; the social preview PNG for K7 |
| `packages/chrome/src/TurboslideMark.tsx` | B1 | Keeps its `size` prop: the vector placed by whole pixel cap at 24 px and up, the rows at 16 px. The `tile` form keeps 16, 32 and 48 px |
| `packages/chrome/src/__tests__/brand-chrome.test.tsx` | B1 (the component's test) | The cells assertions at 64 and 512 px become the vector's |
| `packages/chrome/src/brand.css` | B1 (64, 89 to 137) | `shape-rendering: crispEdges` moves from `.ts-mark` to the rows alone; the lockup rules become one rule sized in em: the mark 0.727539 em tall and 1.070570 em wide on the baseline, then the space from the bearing table (0.328613 em at the 22 px word), the word in Inter 500 |
| `apps/cli/src/commands/banner.ts`, `banner.test.ts` | B1 | `markBlocks` returns the six line glyph; the four facts keep their lines and the last two glyph lines stand alone |
| `README.md` 1 to 16 | B1 | The lockup pair as PNGs from the build, three sentences and the www link |
| `docs/brand.md` | B1 | 65 to 71 record question 1's answer and this sheet; the 16 px rows recorded as the deviation from DECK-GRAMMAR 53; the name check's table |
| `packages/chrome/src/AppBarBrand.tsx` 75 | none named in 4.1.6 | `TurboslideMark size={16}` becomes `size={24}` (the vector at a 16 px cap, the word's cap at 22 px). A request to the integrator, since no lane owns the file |
| `apps/studio/src/components/home/HomeNav.tsx` 50, `HomeFooter.tsx` 21 | B2 | The same size change beside the word, in B2's `/home` push |
| `apps/studio/src/routes/print.$deckId.tsx` 247, `packages/chrome/src/EmptyFigure.tsx` 62 | none named in 4.1.6 | Read at B1's push: `size={20}` draws the vector at a 13 px cap; `EmptyFigure` passes its own size. No change is needed unless the picture reads wrong |

The title row needs no change for the mark: `TitleRow.tsx` 485 draws `size={24}` in the 32 px link box, which is the vector at a 16 px cap.

## To rebuild

From the tree's root: `node docs/gslides-parity/round1/sheet/build-sheet.mjs` writes `sheet/marks/` and `sheet/pages/`, and `--render` adds `sheet/pictures/` and `sheet/pictures/measure.json`. The render refuses to start at a one minute load average of 24 or more. `node docs/gslides-parity/round1/sheet/preview.mjs <out.png>` writes the browser free preview of the form and the 16 px candidates.

## The second pass

Lane B1 made the judge's fixes 1 and 3 to 8 (`sheet-judge.md`) in `sheet/build-sheet.mjs` on 2026-10-02 between 02:44 and 03:09 PDT, during the build of push 2. The full render ran from 03:07:02 to 03:07:07 at a load of 20.47 to 19.31, and `pictures/measure.json` is written from it (fix 8). The marks page's second row then ran past its panel, so the row was narrowed and the page rendered alone at 03:08:58 at a load of 23.76 with `--only=marks`, which leaves `measure.json` as it was: `measure.json` records `marks.png` at 93,474 bytes from the full render, and the file is the later render at 95,730 bytes. No other picture changed after the full render.

- Fix 1: every vector placement on the sheet is the tree's `markPlacement` from `packages/theme/src/brand.ts`, with every horizontal edge on a whole row. At the 16 px cap the crossbar takes rows 0 to 4, the lines rows 5 to 7 and 8 to 10, the cut row 7, half a pixel above mid cap, and the bottom bar rows 12 to 16. `pictures/marks.png` draws "24 px hinted, 4x" beside "24 px plain, 4x" (the first pass's placement) in both appearances; the hinted lines draw solid and the cut shows through the stem. The 32 px tile and the 22 px lockup on the editor, `/decks` and Sign in pages draw the hinted placement, the lockup as the 24 px square with its cap rows as the box and a 7 px gap, the rule of `packages/chrome/src/brand.css`.
- Fix 2 is the product's: `markStep` draws the rows under 24 px, the hinted 24 px square under 32 px and the hinted vector from 32 px, so no surface draws a 10 or 13 px cap. The smallest lockup is the 22 px word (`docs/brand.md` section 4).
- Fix 3: the `.lk-mark` class default margin is the 22 px word's 0.328613 em.
- Fix 4: Sign In on the `/decks` bar carries `margin-right: -8px`, so its ink ends on the column's content edge with Template gallery and the row lines (`decks-1440-*.png`, `decks-390-*.png`).
- Fix 5: under 480 px the search field is a 36 px key with the magnifying glass (`decks-390-*.png`).
- Fix 6: `decks-390-dark.png` and `signin-390-dark.png` are new, so the phone is shown in both appearances.
- Fix 7: the Sign in plate's picture cell carries NASA's Blue Marble (lane B4 read its licence as public domain on its Commons page, `round1/build/b4.md`) with the credit "Image: NASA, Reto Stöckli, 2007, public domain" on a paper strip at its foot, the twins `apps/studio/public/brand/mood-earth-{light,dark}.jpg` that `site.ts` `MOOD_PICTURES` names.
- Fix 9 is the product's: the README pair and the card place the mark's box and the baseline on whole pixel rows (`scripts/build-brand.ts` `lockupGeometry`).
- Fix 10 is request 4 of `round1/build/b1.md`.
