# The fresh judge's scores of the Round 1 brand sheet

Written by the fresh brand judge of Round 1 (docs/NEXT.md 4.1.2) on 2026-10-02 between 01:30 and 01:50 PDT. The tree is `/Users/kevinliu/repos/Turboslide-next` on `next/round1` at 0b6df8d4 (`T:` below). The brand source is Prototemplate on `speed-marks` at 4c23522 (`P:` below), read only. The sheet is `T:docs/gslides-parity/round1/sheet.md` with its pictures under `sheet/pictures/`, uncommitted at this reading. The one minute load average (uptime) read 15.33 at 01:30, 24.05 at 01:38 and 23.18 at 01:39. No number in this note is a timing.

No product file was edited, nothing was committed, no dev server or Playwright run was started, no deck was created and no deployment was opened. The only files this judge wrote are this note and `sheet-judge/16cap.png` with the script that drew it, `sheet-judge/hint.py`.

## What was read and looked at

- `T:docs/NEXT.md` sections 3, 4.0, 4.1, 5, 6 and 7 in full.
- `T:docs/gslides-parity/round1/sheet.md` in full, and `T:docs/gslides-parity/round1/build/B1.md`.
- The three judges in full: `T:docs/gslides-parity/next/brand-judge-1.md`, `brand-judge-2.md` and `brand-judge-3.md`, with their rubrics and score tables.
- `T:docs/gslides-parity/next/brand-b.md` 20 to 125 and `brand-b/pictures/marks-light.png`; `brand-a.md` 28 to 46.
- `P:deck/DECK-GRAMMAR.md` (66 lines), the avoid list `P:deck/slides/39-avoid.html` 9 to 17, `P:deck/slides/16-mark.html` 1 to 12, `P:src/lib/marks.ts` 70 to 110 (the register's rules) and `P:scripts/build-speed-marks.mjs` 60 to 145 (the GT monogram's rectangles).
- The sheet's generated files: `sheet/marks/monogram.svg`, `tile-16.svg`, `tile-32.svg`, `app-icon-180.svg` and `geometry.json`; the page sources `sheet/pages/editor.html` 1 to 80, `decks.html` 44 to 95, and the `.lk-mark` rules and lockup spans of every page; `sheet/build-sheet.mjs` 225 to 262 (the icon sprite, read from `T:packages/chrome/src/icons.tsx`); `sheet/pictures/measure.json`.
- All 17 pictures the sheet lists, each opened with the Read tool. Crops of the title row, the `/decks` lockup, the tab icon, the 32 px tile and the tab strips were enlarged by nearest neighbour with Pillow 12.3.0 in the session scratchpad and looked at.

## The rubric

The five criteria of the three judges, each out of 10:

- Fidelity: the rules of `P:deck/DECK-GRAMMAR.md`, the avoid list, the speed register of `P:src/lib/marks.ts` 73 to 104, and slide 16 line 8 (a product carries its own mark under the same rules).
- Product: the name and one identity on every surface a seller meets; the relation to General Translation.
- Legibility: the mark at 16 px and in the title row, and the pages on a phone, in both themes.
- Restraint: nothing extra and nothing decorative on the seller's path.
- Buildability: what B1's push has to write, test and regenerate.

## Scores

| Criterion | Score | A (judges 1, 2, 3) | B (judges 1, 2, 3) | C (judges 1, 2, 3) |
| --- | ---: | --- | --- | --- |
| Fidelity | 9 | 8, 8, 8 | 6, 6, 7 | 7, 7, 8 |
| Product | 8 | 6, 5, 5 | 8, 8, 9 | 7, 6, 6 |
| Legibility | 7 | 7, 6, 7 | 8, 8, 8 | 8, 6, 8 |
| Restraint | 8 | 7, 6, 7 | 7, 7, 8 | 7, 6, 6 |
| Buildability | 8 | 8, 7, 7 | 5, 4, 6 | 8, 8, 7 |
| Total of 50 | 40 | 36, 32, 34 | 34, 33, 38 | 37, 33, 35 |

## Fidelity 9

What follows the deck:

- The monogram is built the way `P:scripts/build-speed-marks.mjs` 94 to 142 builds the GT T. It uses rectangles on the 120 unit cap, the shear x minus tan(12 degrees) times y, and the cut at y 96 to 104 applied to the geometry. The stroke weights are the GT T's (crossbar 30, stem 34) and the bars are the GT bars' heights (30, 36 and 30). I checked the path in `sheet/marks/monogram.svg` against `geometry.json`: the middle bar ends 12 units before the sheared stem at y 82, and the cut is centred on y 100, mid cap height.
- The register's rules hold where brand B's did not. The T is wider than tall: the crossbar runs 134 units, plus the 22 unit top bar, on a 120 unit cap. The cut sits at mid cap height, where B's sat 3.81 units low (brand-judge-1 89). The file is one path in `currentColor` with no font, mask or id.
- `construction-light.png` and `construction-dark.png` set the GT bar monogram and the Turboslide monogram at one 80 px cap. The two share the skew, the cut, the crossbar and the bar heights. The product therefore has its own mark under the same rules (slide 16 line 8), which A broke.
- The word is live Inter 500 (DECK-GRAMMAR 20).
- The pages draw C's grammar. `decks-1440-light.png` and `decks-1440-dark.png` show the 1104 px column between rails at x 168 and x 1271, the 58 px bar, 9 px crosses where the seams meet the rails, the hatch strip after "Start a new presentation", ruled rows with 64 by 36 framed thumbnails, Title Case on Sign In, and the 6 px radius on the search field alone.
- The editor pictures keep square chrome with Slideshow at 8 px and its label first, Assist as a word with no sparkle, and "Theme" on the toolbar.
- Monospace appears only on the `#101010` panel of `cli-banner.png`.
- The construction outlines use ink-2 on the plate, and no accent touches a line (DECK-GRAMMAR 29).

What costs the point:

- The 16 px rows are a drawing made by hand, against DECK-GRAMMAR 53. The sheet records it as the one deviation, as NEXT.md 4.1.2 asks.
- The middle and bottom bars stop 12 units before the stem, where the register's bars lead into the first letter (`marks.ts` "bars"). This is brand B's finding that bars run into the stem read as a reversed E at 32 px and smaller (brand-b 59), and NEXT.md 4.1.2 takes it as written.
- No mood material is drawn. The Sign in picture cell is an empty plate until B4 reads a licence.
- In the `/decks` bar, the ink of "Sign In" ends 9 px left of the ink of "Template gallery" and the row lines, which end on the column's content edge. DECK-GRAMMAR 66 names misaligned columns as a defect. This is fix 4.

## Product 8

- One mark serves the tab icon, the 32 px tile, the touch icon, the title row's home link, the `/decks` bar, the Sign in plate and the CLI banner (`marks.png`, `editor-1440-light.png`, `decks-1440-light.png`, `signin-1440-light.png`, `cli-banner.png`). A seller learns one identity.
- The Sign in plate now names the product at its head (`signin-1440-light.png`). Judges 2 and 3 docked B and C for a dialog headed by the glyph alone.
- The name check ran on the day and found no speed mark sold as Turboslide (sheet.md 156 to 195). The two live registrations are standard character marks for knives and for doors. This was judge 3's first condition (brand-judge-3 130).
- The family tie to General Translation is drawn in the construction picture. No surface on the sheet names General Translation; the footer sentence is B2's `/home` work and `/home` is not on the sheet.
- What costs the points: judges 2 and 3 chose B for the name read on the first screen of `/home`, which B's outlined weight 800 wordmark carried (brand-judge-2 172; brand-judge-3 113). Question 2's default drops that outline, and `question2.png` shows the trade. The editor's title row shows the mark alone at a size where its bars are soft on a 1x screen (legibility below). At 390 px "Sign In" moves into More (`editor-390-light.png`), so an anonymous visitor on a phone has no visible way to sign in from the editor.

## Legibility 7

- The 16 px rows decode to three colours and read as a T with bars in the light and the dark tab strip (`marks.png`, the tab strips; my 12x crops of both).
- The 180 px touch icon and the 32 px mark at a 21 px cap read in both themes (`marks.png`).
- The lockup holds at the 22 px and 18 px words in both themes (`lockup-light.png`, `lockup-dark.png`). The measured caps are equal and the baselines meet at 66 px and below (`measure.json`).
- The phone editor keeps the deck name at 154.7 px against the 96 px bound, with Slideshow, Share and More inside 382 px, and one Menus key, in both themes (`editor-390-light.png`, `editor-390-dark.png`).
- The CLI glyph reads as the same T with bars (`cli-banner.png`).

What costs the points:

- At the 16 px cap, the two middle lines (14 units, 1.87 px) and the cut (8 units, 1.07 px) fall between pixel rows. On a 1x screen they draw grey, and the cut through the stem does not show. This placement is the most used in the product: the title row's home link (`editor-1440-light.png`, `editor-1440-dark.png`, `editor-390-*.png`), the `/decks` lockup (`decks-1440-*.png`, `decks-390-light.png`), the Sign in head (`signin-*.png`) and the 32 px tile (`marks.png`, "Tile, 32 px"), which a 2x screen uses for the tab. The sheet names this itself (sheet.md 152) and draws no hinted placement. Judge 3 asked for one before the build round (brand-judge-3 131). My test below shows a hinted placement fixes it.
- At the 14 px word the mark has a 10 px cap, with 1.2 px lines and a 0.7 px cut, and reads as a smudge (`lockup-light.png`, "Word 14 px").
- `decks-390-light.png` truncates the search field's placeholder to "Searc...".
- The sheet has no phone picture in dark for `/decks` or Sign in, so half of "on a phone in both themes" is not shown. Brand B drew both (`brand-b/pictures/decks-390-dark.png`, `signin-390-dark.png`).
- Brand B scored 8 from all three judges with its title row mark at a 20.6 px cap, where its lines were 2.4 px and its cut 1.4 px (brand-b risk 6). This sheet sets the title row mark at a 16 px cap, so its lines and cut are thinner than B's were.

### The 16 px cap test

`sheet-judge/16cap.png` (31 KB) is a scratch raster made with Pillow, without a browser. It draws the sheet's seven parallelograms at a 16 px cap in a 24 px box, with coverage from 16x supersampling, beside two hinted placements, at 1x and 8x on paper and on ink. The hinted placements keep every rectangle and the shear, and set only the middle bar and the cut on whole rows of the 16 px cap. The crossbar is rows 0 to 4, the first line 2 rows, the cut 1 row, the second line 2 rows and the bottom bar rows 12 to 16. The two variants differ in where the 1 px cut sits: 0.5 px above or 0.5 px below mid cap. A 1 px cut cannot be centred on a 16 px cap.

- Calibration: the raster's ink per row, from the crossbar to the bottom bar, is 20, 20, 20, 20, 5, 8, 12, 6, 6, 12, 8, 4, 10, 10, 10, 10. The editor picture's own home link reads 20, 20, 20, 20, 4, 8, 12, 6, 6, 12, 8, 4, 10, 10, 10, 10 (`editor-1440-light.png`, x 10 to 42, y 14 to 30). The raster therefore matches Chrome's drawing to one unit in one row.
- Pixels with partial coverage (luminance 40 to 215) in the 24 px box: 73 for the sheet's placement, 32 and 33 for the two hinted ones. The remaining partial pixels are the slanted edges.
- At 8x the hinted placements show two solid 2 px lines and a 1 px cut through both the bars and the stem. The sheet's placement shows grey bands and no cut in the stem.

The script is `sheet-judge/hint.py`. It needs Inter instanced to a TTF beside it as `inter-400.ttf` for the labels (fontTools 4.63.0, `instantiateVariableFont` at wght 400 and opsz 14), and it reads `editor-1440-light.png` for the calibration.

## Restraint 8

- The editor default view carries no Last edit words, no sparkle and no identity chip, and Assist is a word (`editor-1440-light.png`, `editor-1440-dark.png`). Judges 1 and 2 docked C for its chip and its Last edit words.
- Sign in has one method, one sentence on working without an account, one foot sentence on what Google gives, and no Cancel button (`signin-1440-light.png`). This takes judge 3's graft 5 and judge 1's graft 7.
- `/decks` is a bar, two tiles, a hatch strip and four ruled rows (`decks-1440-light.png`).
- The mark is one colour and nothing on the sheet is decorative.
- What costs the points: on the Sign in plate the picture cell takes 280 of 720 px and holds only a sentence about lane B4 and its licence read (`signin-1440-light.png`, `signin-1440-dark.png`, `signin-390-light.png`). Under question 5's default that cell will hold a mood picture, which judges 2 and 3 wanted off Sign in (brand-judge-2 191; brand-judge-3 124). The sheet cannot show how that plate reads. The mark is also heavier than the live word beside it: its stem is 28 percent of its cap. That is the GT T's proportion, and A's lockup had the same contrast, so I count it as a small cost.

## Buildability 8

- The mark is 7 parallelograms, 242 bytes of path data with a sha256, from a generator under 100 lines. No fontkit and no fontTools step is needed, and the wordmark outline step can retire. This is judge 3's graft 1, which turned B's buildability from 4 to 6 into A's and C's level.
- The sheet lists every file the push changes with its owner, and it writes the change in an unowned file (`AppBarBrand.tsx` 75) as a request to the integrator in `build/B1.md`.
- What costs the points: `packages/theme/src/brand.ts` 48 to 286 and `brand.test.ts` are rewritten, and every icon, the ICO, the card and the README pictures are regenerated. Two drawings, the vector and the 16 px rows, have to change together (brand-b risk 5), and fix 1 adds a third. The lockup's gap changes with Inter's optical size, so the CSS needs one margin per lockup size (sheet.md 97 to 106). The page stylesheet the sheet built still carries the superseded fontkit margin as its class default (fix 3). `packages/chrome/src/__tests__/brand-chrome.test.tsx` is claimed as B1's, but NEXT.md 4.1.6 does not list it (fix 10).

## Whether the combination beats A, B and C

Yes, on the total, against every score each judge gave. The sheet's 40 is above A's 36, 32 and 34, B's 34, 33 and 38, and C's 37, 33 and 35. The three-judge means were A 34, B 35 and C 35 (NEXT.md 4.1.2).

By criterion:

- Against A it is higher on fidelity, product and restraint, equal on buildability, and equal to judges 1 and 3 on legibility. It keeps A's lockup rules and the speed register while it gives the product its own mark.
- Against B it is higher on fidelity, restraint and buildability. It is equal to judges 1 and 2 on product and one point under judge 3. It is one point under all three on legibility, because the title row mark is smaller and its middle lines and cut draw grey at 1x. Fix 1 closes that point.
- Against C it is higher on fidelity, product, restraint and buildability, and one point under judges 1 and 3 on legibility for the same reason.

These totals are mine against theirs, so they compare five criteria read by different judges. The comparison within each criterion above is the part I would rely on.

## Verdict

Build it with the fixes. The name check found no speed mark sold as Turboslide, so NEXT.md 4.1.2's fallback to C's mark does not apply. Fixes 1 to 3 change what B1's push writes, so they come before the push. Fixes 4 to 10 belong to the sheet's second pass before Kevin reads it with questions 1 and 2, or to the lanes named.

## Fixes

Before B1 pushes the mark:

1. The 16 px cap placement draws soft. In `marks.png` ("24 px at 4x", "Tile, 32 px" at 4x), `editor-1440-light.png`, `editor-1440-dark.png`, `editor-390-light.png`, `editor-390-dark.png`, `decks-1440-light.png`, `decks-1440-dark.png`, `decks-390-light.png`, `signin-1440-light.png`, `signin-1440-dark.png`, `signin-390-light.png` and the 22 px row of `lockup-light.png` and `lockup-dark.png`, the middle lines draw grey and the cut does not show at 1x. Generate a hinted placement for the 16 px cap from the same rectangles: the crossbar 4 rows, a 1 row gap, a 2 row line, a 1 row cut, a 2 row line, a 2 row gap and the 4 row bottom bar (or the mirror with the cut 0.5 px low; `sheet-judge/16cap.png`). Draw it in `marks.png` at 1x and 4x beside today's placement in both themes. Use it for `TurboslideMark` at 24 px and in the 32 px tile, and record it in `docs/brand.md` beside the 16 px rows, with the 0.5 px offset of its cut. If Kevin keeps the soft placement, record that choice there instead.
2. No size floor. `lockup-light.png` and `lockup-dark.png` draw the 14 px word with a 10 px cap mark, and `T:apps/studio/src/routes/print.$deckId.tsx` 247 draws `size={20}`, a 13 px cap. Set the steps in `TurboslideMark`: the rows at 16 px, the hinted placement at 24 px, the vector from 32 px, and any other size snapped to one of these. Name the smallest lockup (the 18 px word, or the 22 px word if the 18 px row reads soft after fix 1), and drop the 14 px row from the lockup page or draw it with the rows.
3. The stale lockup margin. Every page under `sheet/pages/` sets `.lk-mark { margin-right: 0.315918em }`, which is the fontkit bearing of 98 units that sheet.md 106 superseded. Each lockup overrides it inline, so the pictures are right, but CSS copied from the page would carry the wrong value. Set the class default to 0.328613em, the 22 px value that `brand.css` gets.

The sheet's second pass, before Kevin's read:

4. `decks-1440-light.png`, `decks-1440-dark.png` and `decks-390-light.png`: "Sign In" carries `padding: 0 8px` (`decks.html`, `.signin`), so its last ink column is x 1222 where the last ink column of "Template gallery" and of the row lines is x 1231 (348 against 357 at 390 px, read from the pictures at the half threshold). Give it `margin-right: -8px`, as `.close` has on the Sign in plate, so the bar's right edge meets "Template gallery" and the rows. B2's `/decks` push reads the same rule.
5. `decks-390-light.png`: the search field truncates its placeholder to "Searc...". Under 480 px draw a 36 px search key with the magnifying glass, or a placeholder that fits.
6. Add `decks-390-dark.png` and `signin-390-dark.png`, so the phone is shown in both themes.
7. `signin-1440-light.png`, `signin-1440-dark.png` and `signin-390-light.png`: the picture cell shows a sentence that names lane B4 and its licence read inside the plate. Draw one picture whose licence B4 has read with its credit, or move that sentence outside the plate as a caption of the sheet, so the plate shows only product words when Kevin answers question 5.
8. `measure.json`: the three `/decks` pictures were rendered again at 01:27:38, after `measure.json` was written at 01:27:15. They are 53,505, 55,605 and 29,747 bytes on disk against 53,490, 55,596 and 29,736 recorded. Sheet.md 5 gives the last renders' load as 18.85 to 20.48, and `measure.json` records 18.85 to 19.35. Write the measure again from the final renders, or record the second render and its load.
9. The README pair and the card, which B1's push renders at large sizes: at the 120 px word the word's ink sits one pixel below the mark's (sheet.md 118), because the mark's box lands on a fractional row. Place the mark's box on a whole pixel row in those renders.
10. `T:docs/gslides-parity/round1/build/B1.md`: add `packages/chrome/src/__tests__/brand-chrome.test.tsx` as a request to the integrator, or confirm it with the integrator as part of `TurboslideMark.tsx`. NEXT.md 4.1.6 does not list it, and the sheet's file table (sheet.md 209) claims it.

## Notes for Kevin and the lanes

- Question 1: the sheet supports the default. The rectangle construction removes the three faults the judges found in B's mark: the Inter outlines widened through their counters, the cut off mid cap, and the letters narrower than tall. It keeps what judges 2 and 3 valued, one T with bars from the tab to the terminal.
- Question 2: `question2.png` supports the default. In the 58 px bar at a 16 px cap the live Inter 500 word reads more cleanly than B's weight 800 outline. The outline's cut and its notched bowls do not hold at that size. The outline's case is the large first screen of `/home`, which the sheet does not draw.
- The 16 px rows draw the bottom bar 2 rows tall against the crossbar's 3, where the vector sets both at 30 units. The other split, both bars 3 rows with gaps of 1 and 2 rows, was not among the four candidates in `ROWS16_CANDIDATES`. B1 may draw it beside the chosen rows in the push's pictures. I do not ask for it as a fix.
- At 390 px "Sign In" moves into More. NEXT.md 4.1.3 items 13 and 18 do not say where it goes on a phone. B3b's `chrome.title-row.phone` row bounds the name at 96 px, so the name can give up about 58 px. "Sign In" needs about 68 px in the row (44 px of ink at 1440, 8 px of padding on each side and an 8 px gap), so it fits only if another key also moves. B3b should choose, and its note should say why.
- The selection colour `#2f5ce0` (question 3) is defined in the pages' tokens but drawn on no picture. The card and the README head are not drawn either. Both are read in B1's push pictures, as NEXT.md 4.1.7 sets for the preview.
- The empty picture cell leaves question 5 for the Sign in plate open. Judge 3 kept mood pictures off Sign in, and Kevin's auth plate rule keeps the plate (NEXT.md 4.1.2).

## Not read and not done

- No browser, dev server, Playwright run or gate was started. The 16 px cap test is a Pillow raster, calibrated against one row profile of the sheet's own picture. B1 should confirm fix 1 in Chrome at device scale factor 1.
- `sheet/mark-lib.mjs`, `sheet/preview.mjs`, `sheet/measure-bearing.mjs` and the rest of `sheet/build-sheet.mjs` were not read. `bearing.json` was not checked against Inter.
- The name check's sources were not fetched again. Its tables are the sheet's reading of 2026-10-01 22:00 to 22:20 PDT.
- The tree's `brand.ts`, `brand.css`, `TurboslideMark.tsx`, `AppBarBrand.tsx` and `banner.ts` were not opened. The file table of sheet.md 197 to 218 was checked only against NEXT.md 4.1.6.
- The brand directions' pictures other than `brand-b/pictures/marks-light.png` were not opened again. Each direction is compared through the judges' scores and their notes.
