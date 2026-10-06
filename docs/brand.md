# The Turboslide identity

The record of the identity since Round 1 of the next program (`docs/NEXT.md` 4.1, the binding
specification). Round 1 replaced round four's dither mark with a mark in General Translation's
speed register and mapped the GT brand deck of 2026-10-01 (Prototemplate `deck/`, read at
`speed-marks` 4c23522) onto every surface a seller meets. Written by lane B1 on 2026-10-02 against
`next/round1`. Every number below is computed from `packages/theme/src/brand.ts`, read back from a
file `scripts/build-brand.ts` wrote, or cited with its source and date.

The identity is one mark, one lockup, one icon set, one card with one mood picture, one token sheet
and one build script. The mark and the word are ink on paper in both appearances. The one colour
in the chrome is the selection's GT blue (section 11).

## 1. The register decision

Kevin's question 1 (`docs/NEXT.md` section 7) asked whether Turboslide joins the GT speed register.
Its default is yes, and Kevin approved every default on 2026-10-01. The three brand judges split:
judge 1 chose direction C by one point, and judges 2 and 3 chose direction B (NEXT.md 4.1.2). The
program took B's square monogram on C's page grammar with A's grafts.

No direction had drawn that combination, so lane B1 drew a sheet first
(`docs/gslides-parity/round1/sheet.md`). The sheet builds B's monogram from rectangles the way
Prototemplate's `scripts/build-speed-marks.mjs` 94 to 142 builds the GT T, with no Inter outline.
A fresh judge scored it 40 of 50 (`docs/gslides-parity/round1/sheet-judge.md`): fidelity 9,
product 8, legibility 7, restraint 8 and buildability 8. That total is higher than every total any
judge gave A (36, 32, 34), B (34, 33, 38) or C (37, 33, 35). The verdict was to build it with
fixes 1 to 3 before the push. Fix 1 is the hinted placement at the 16 px cap (section 3), fix 2 is
the size floor (section 3) and fix 3 is the sheet pages' lockup margin.

The name check of section 17 found no speed mark sold as Turboslide, so the fallback of NEXT.md
4.1.2 (round four's square) was not taken.

Question 2 asked whether the product shows brand B's outlined weight 800 wordmark. Its default is
no: the word is live Inter 500 everywhere (DECK-GRAMMAR line 20), and the sheet's
`pictures/question2.png` shows both. The outline step of round four
(`packages/theme/scripts/outline-wordmark.py`) and its file `wordmark-outlines.svg` are retired.

Round four's mark was a slide with a plate cut from it, drawn through the deck's Bayer screen. Its
record said it borrowed no speed glyph. That rule is withdrawn: the GT register chosen on
2026-09-29 is built on speed bars and a forward slant (Prototemplate `src/lib/marks.ts` 73 to 92),
and the Turboslide mark now shares its construction.

## 2. The mark

A T with three bars under its left arm. It is five rectangles in an upright space, sheared by
tan(12 degrees) so that x becomes x minus 0.2126 times y, with the 8 unit cut from y 96 to 104
applied to the geometry. Each rectangle becomes one or two parallelograms, seven in all. The units
are the GT monogram's: a cap of 120 units from the cap line at y 40 to the baseline at y 160. The
weights are the GT T's and the bar heights are the GT bars'.

| Rectangle  | x, y, width, height (upright units) | What it is                                                                           |
| ---------- | ----------------------------------- | ------------------------------------------------------------------------------------ |
| crossbar   | 22, 40, 134, 30                     | The T's arm, 50 units on each side of the stem                                       |
| stem       | 72, 40, 34, 120                     | The cut splits it at y 96 to 104                                                     |
| top bar    | 0, 40, 24, 30                       | Runs the arm 22 units past its left end and overlaps it by 2                         |
| middle bar | -4, 82, 64, 36                      | Centred on the cut, so the cut leaves two lines of 14 units; ends 12 before the stem |
| bottom bar | 16, 130, 44, 30                     | Ends 12 units before the stem                                                        |

`MARK_RECTS` in `brand.ts` holds the five rectangles. `MARK_PATH` is the master path in units,
242 bytes, with the sha256 `3e95914b621faf3bee9b73421ac62b264ee384c165346025c09dec99c154190a`
(`MARK_PATH_SHA256`). `brand.test.ts` and `scripts/build-brand.ts --check` rebuild the path from the
rectangles and compare it and its digest, so the build needs no font tool. The box after the shear
is 176.58 by 120 units, an aspect of 1.4715 (`MARK_ASPECT`), and `mark.svg` carries the view box
`-33.1 36 184.6 128`, the box with 4 units of clear space.

The bars stop 12 units before the stem, where the register's bars lead into the first letter. At 32
px and smaller, bars that run into the stem read as a reversed E (brand-b 59), and NEXT.md 4.1.2
takes that finding as written.

The mark is one path in `currentColor` with no mask, no id and no font. It never takes a gradient,
a second colour, a rounded corner, an outline or a rotation.

## 3. The sizes

`TurboslideMark` and every file draw one of three forms, chosen by `markStep(size)`:

- Under 24 px: the 16 px rows (`ROWS16`), the one hand drawing.
- From 24 px to under 32 px: the 24 px square with the vector at a 16 px cap, every horizontal edge
  on a whole row.
- From 32 px: the vector at the size itself, its cap the whole pixels whose box fits the square's
  width (`capAt`), every horizontal edge on a whole row.

Any other requested size snaps to one of these, so no surface draws the mark at a 10 or 13 px cap
(sheet-judge.md fix 2).

### The 16 px rows

At 16 px the slant and the 8 unit cut fall between pixels, so the form is set as whole pixels on a
12 px cap in rows 2 to 13. This is the one hand drawing, recorded here as the deviation from
DECK-GRAMMAR line 53, which says a mark is never redrawn by hand. Columns 1 and 14 stay clear for
the tile's frame and its 1 px margin.

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

The crossbar is three rows from column 3 to 13, with the top bar folded into a left arm of 5 px
against a right arm of 3 px. The stem is 3 px and steps one pixel left after the cut and again at
the bottom bar: the slant as two steps over the cap, where tan(12 degrees) gives 2.55 px. The cut
is one clear row through the stem and the middle bar. The bars start at column 2 and end one pixel
before the stem, so they step 5, 4 and 3 px. The rows draw 72 ink pixels. `ROWS16_PATH` is their
path, 192 bytes, with the sha256
`b21e4d461ce314206d0ba3bae1e952c458d4cd07d56cdca82421467a21fae72b`. The rows draw with
`shape-rendering: crispEdges`; the vector does not.

### The hinted placement

Drawn at a 16 px cap with plain scaling, the two middle lines are 1.87 px and the cut 1.07 px, so
on a 1x screen the lines draw grey and the cut through the stem does not show (sheet-judge.md,
legibility). `hintedRows(cap)` moves each horizontal edge to a whole row before the shear and keeps
every rectangle and the slant. At the 16 px cap the rows are:

| Rows (from the cap line) | What they hold                               |
| ------------------------ | -------------------------------------------- |
| 0 to 4                   | The crossbar and the top bar                 |
| 4 to 5                   | The gap                                      |
| 5 to 7                   | The middle bar's first line                  |
| 7 to 8                   | The cut, through the stem and the middle bar |
| 8 to 10                  | The middle bar's second line                 |
| 10 to 12                 | The gap                                      |
| 12 to 16                 | The bottom bar                               |

A 1 px cut cannot be centred on a 16 px cap. The cut sits on row 7, half a pixel above mid cap,
the first of the judge's two variants (`sheet-judge/16cap.png`). Every vector placement is hinted
the same way at its own cap. `hinted: false` draws the plain scaled vector for a comparison
picture only.

| Requested size | Drawn                           | Cap and cap line           |
| -------------- | ------------------------------- | -------------------------- |
| under 24 px    | The 16 px rows                  | 12 px, rows 2 to 13        |
| 24 to 31 px    | The 24 px square, hinted vector | 16 px, cap line on row 4   |
| 32 px          | Hinted vector                   | 21 px, cap line on row 6   |
| 48 px          | Hinted vector                   | 32 px, cap line on row 8   |
| 64 px          | Hinted vector                   | 43 px, cap line on row 11  |
| 180 px         | Hinted vector                   | 122 px, cap line on row 29 |

The title row draws `size={24}` in its 32 px link box (`TitleRow.tsx`) and Not found `size={64}`.
The `/decks` bar and the `/home` navigation draw the 24 px placement beside the 22 px word once
`AppBarBrand.tsx` and the `/home` navigation pass 24 (`round1/build/b1.md` requests 1 and 2), and
the print bar once it passes 24 (request 3).

## 4. The lockup

The lockup follows brand A's rules (`docs/gslides-parity/next/brand-a.md` 32 to 43): the word's cap
equals the mark's cap, the baselines meet, and the gap from the mark's ink to the word's T is half
the cap. The word is live text in Inter 500 with `font-feature-settings: 'cv11', 'ss01'`, tracked
-0.01 em from 16 to 27 px and -0.025 em at 28 px and above. `PROPER_NOUNS` in
`packages/theme/src/copy.ts` carries "Turboslide" so the sentence case lint keeps its capital.

Inter's cap height is 1490 of 2048 units, 0.727539 em. The mark is therefore 0.727539 em tall and
1.070570 em wide. The T's left side bearing at weight 500 moves with Inter's optical size axis,
which Chrome sets to the font size in px between 14 and 32. The sheet measured it from rendered
pixels (`docs/gslides-parity/round1/sheet/marks/bearing.json`, load 19.60):

| opsz                          | 14  | 16  | 18  | 20  | 22  | 24  | 26  | 28  | 30  | 32  |
| ----------------------------- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| The T's left bearing, of 2048 | 90  | 86  | 82  | 76  | 72  | 68  | 61  | 57  | 53  | 49  |

The space after the mark is half the cap less that bearing. The product draws one lockup size: the
22 px word beside the 24 px placement (`.ts-brand-lockup` in `packages/chrome/src/brand.css`,
`AppBarBrand.tsx`). There the cap is 16.0 px, the bearing 72 units (0.77 px) and the square leaves
0.23 px right of the mark's ink, so the flex gap is 7 px. Both links are 24 px tall with their
content centred, so the word's baseline lands on row 20 of the box with the mark's.

The 22 px word is the smallest lockup. An 18 px word would ask for a 13 px cap, which the size
steps do not draw. The README pair and the card draw the lockup at a 66 px word (a 48 px cap)
with the mark's box and the baseline on whole pixels (sheet-judge.md fix 9);
`packages/theme/brand/wordmark.svg` is that lockup with the word as live text.

## 5. The tile and the icon set

Every raster the `prefers-color-scheme` block cannot reach (the `favicon.ico` entries, Safari's base
rendering of `icon.svg`, Windows) is the mark in ink on an opaque paper plate with a 1 px frame in
the edge composite: `#656565` on paper and `#888887` on ink (`TILE_COLORS`). Where the block is
honoured, `icon.svg` swaps to paper ink on an ink plate with the `#888887` frame. The 16 px tile
carries the rows; the 32 px tile the hinted vector at a 16 px cap on row 8; the 48 px tile a 24 px
cap on row 12 (`TILE_SIZES`).

The set under `apps/studio/public/`, written by `node scripts/build-brand.ts` on 2026-10-02 and
served as static files, so every icon, manifest and card request is a CDN answer:

| File                                           | What it is                                                                                            | Bytes               |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------- |
| `favicon.ico`                                  | Three 32 bit BMP entries on the paper tile: the rows at 16 px, the hinted vector at 32 and 48         | 15,086              |
| `icon.svg`                                     | The 16 px tile with the rows, the `prefers-color-scheme: dark` block and `crispEdges`                 | 1,201               |
| `apple-touch-icon.png`                         | 180 px, the paper mark at a 76 px cap on the ink square, opaque, no corners                           | 1,381               |
| `icons/icon-192.png`, `icon-512.png`           | The `any` icons, the paper mark on the ink square at an 81 and a 215 px cap                           | 1,358 and 3,409     |
| `icons/icon-mask-192.png`, `icon-mask-512.png` | The `maskable` icons, the mark inside the 40 percent safe circle at a 69 and a 184 px cap             | 1,170 and 2,970     |
| `icons/icon-mono-512.png`                      | The `monochrome` icon, the mark as alpha                                                              | 3,831               |
| `icons/icon-dark-192.png`, `icon-dark-512.png` | The ink mark on the paper plate, the inverse of the manifest icons                                    | 1,353 and 3,386     |
| `manifest.webmanifest`                         | `start_url` `/home`, `background_color` and `theme_color` `#ffffff`, five icons with one purpose each | 955                 |
| `robots.txt`                                   | `Allow: /og/`; `Disallow` for `/new`, `/decks/trash`, `/print/` and `/edit/`                          | 99                  |
| `brand/mood-earth-dark.jpg`, `-light.jpg`      | The card's mood picture (section 6), 1600 by 900 greyscale                                            | 179,545 and 179,587 |
| `og/turboslide.png`                            | The card (section 6), 1200 by 630                                                                     | section 6           |
| `brand-manifest.json`                          | The path, bytes, sha256 and kind of every output                                                      |                     |

The manifest's colours are the paper `#ffffff` (A's graft, NEXT.md 4.1.2; the row
`decks.manifest.paper`), so an installed app opens on white. Production answered `#070707` for
both on 2026-10-02 before this push.

Every raster except the 16 px tile is the vector drawn by the build's own coverage rasterizer: the
union of the quads, sixteen sub rows per pixel row, exact spans across. Every pixel is therefore a
blend of the plate and the ink, and the bytes are deterministic. `mark-geometry.json` records per
raster the size, the form, the cap, the cap line, the ink and the colour count read back from the
file (the 16 px entry: 72 ink pixels, three colours).

The head (`apps/studio/src/routes/__root.tsx`) takes every fact from `SITE` in
`packages/theme/brand/site.ts`: the description, the card's alt text, the origin rule, the theme
colours, the icon and twin paths, the mood pictures, the manifest and the robots rules.

## 6. The Open Graph card

`og/turboslide.png`, 1200 by 630, rendered by Chromium from `packages/theme/brand/og-template.html`
at device scale factor 1. The picture is NASA's Blue Marble (`MOOD_PICTURES.earth`, public domain,
section 8) at object-fit cover in the dark appearance. A paper plate sits lower right, the mood
slide's place on the deck (Prototemplate `deck/slides/06-mood-earth.html`), 56 px from the right
and bottom edges and 528 px wide, clear of the Earth in the picture's left half. It carries the
lockup at a 66 px word, the description's first sentence, the address `www.turboslide.com` in
Inter and the credit "Image: NASA, Reto Stöckli, 2007, public domain" at 15 px in titanium.
Nothing that matters is within 48 px of an edge, which X's 2:1 crop allows. `og:image:alt` is
`SITE.imageAlt`. Every route serves this card; the deck route's own card is lane B2's (NEXT.md
4.1.3 item 12).

The card file is also the GitHub social preview for Kevin's setting K7 (NEXT.md 3.1): the
repository's Settings, the "Social preview" section, Edit, then "Upload an image". GitHub asks for a
PNG, JPG or GIF under 1 MB and crops to 2:1; the build fails a card over 1 MB.

## 7. The CLI banner

`turboslide --version` (`apps/cli/src/commands/banner.ts`) prints the 16 px rows' mark area
(rows 2 to 13, columns 2 to 13) as half block characters (U+2580, U+2584, U+2588), two pixel rows
to a line, six lines, from `markBlocks()` in `brand.ts`. The first four lines carry the word and
the version, the address, the action count with the effects backend, and the fourth fact; the last
two glyph lines stand alone. No colour is written, so the output is byte identical with
`NO_COLOR=1`. `turboslide info` prints the same header before the deck facts.

The version is the release's, stamped in `apps/cli/package.json` (NEXT.md 4.1.3 item 6): the
calendar version YYYY.MMDD.N of the newest entry of `docs/updates.md`, where MMDD is the entry's
month times 100 plus its day and N counts that day's entries from the oldest, so a second release
on one day sorts after the first. `banner.test.ts` compares the two and refuses `0.0.0`, so the
push that writes a release's entry stamps the version with it. It read `2026.1001.3` at push 3,
the third entry dated 2026-10-01.

```
 ███████████  Turboslide <version>
 ▀▀▀▀▀███▀▀▀  https://www.turboslide.com
▄▄▄▄▄ ███     <n> actions, effects backend: <selected>
▄▄▄▄ ▄▄▄      checkout <path>
     ███
███ ███
```

## 8. The picture credits

Mood pictures appear on the card, Not found, the empty `/decks` state and the Sign in plate. On
`/home` since the landing round (Kevin's answer 1 to `docs/LANDING.md` section 7, 2026-10-02) the
Blue Marble prints in the hero's first screen as its field, with its credit on the hero slide, and
since the landing's second pass (`docs/LANDING.md` 2.6, question 14, 2026-10-03) the Louisbourg
lighthouse is the canvas band's picture in place of the Rosetta Stone, which leaves `/home`; the
landing's fixture deck and the page's stills are copies and prints of the two files below, each
listed with them. A picture whose licence was not read on its source
page stays out of the repository and the product. Lane B4 read each licence on 2026-10-02 between
08:57Z and 09:01Z from the picture's source page or its record there (`round1/build/b4.md`, "The
licence read"; the raw reads under `round1/build/b4/licence/`). Prototemplate's
`deck/shots/OPENERS.md` was not used as a licence source. The brand lint's credits check (lane B5)
reads this table: a picture counts as credited when one row names its asset id or its path in
backticks and states its licence.

| Picture                                                  | Files                                                                                                                                                                                                                                                                                                                                                                                                | Credit                                                                         | Licence as the source states it                                                                                          | Source page                                                                                                                                      |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| The Blue Marble, `mood-earth`                            | `decks/gt-brand/assets/mood-earth-{light,dark}.jpg`, `decks/templates/blank/assets/mood-earth-{light,dark}.jpg`, `apps/studio/public/brand/mood-earth-dark.jpg`, `apps/studio/public/brand/mood-earth-light.jpg`, `apps/studio/home-deck/assets/mood-earth-{light,dark}.jpg` (the landing's fixture; the hero's field is its print, inlined in `/home`'s document by `scripts/build-home-assets.ts`) | Image: NASA, Reto Stöckli, 2007, public domain                                 | Public domain (PD-USGov-NASA); attribution not required                                                                  | https://commons.wikimedia.org/wiki/File:Blue_Marble_Western_Hemisphere.jpg                                                                       |
| The Rosetta Stone, `mood-rosetta`                        | `decks/gt-brand/assets/mood-rosetta-{light,dark}.jpg`                                                                                                                                                                                                                                                                                                                                                | Photograph: Hans Hillewaert, CC BY-SA 4.0                                      | CC BY-SA 4.0, Hans Hillewaert, own work; attribution required                                                            | https://commons.wikimedia.org/wiki/File:Rosetta_Stone.JPG                                                                                        |
| A proto-cuneiform tablet, `mood-tablet`                  | `decks/gt-brand/assets/mood-tablet-{light,dark}.jpg`                                                                                                                                                                                                                                                                                                                                                 | Photograph: The Metropolitan Museum of Art, Open Access, public domain         | CC0 (the Met's donation of photograph DP293245); the Met's collection API reads `isPublicDomain: true` for object 327385 | https://commons.wikimedia.org/wiki/File:Cuneiform_tablet-_administrative_account_with_entries_concerning_malt_and_barley_groats_MET_DP293245.jpg |
| Karahisari's calligraphy, `mood-calligraphy`             | `decks/gt-brand/assets/mood-calligraphy-{light,dark}.jpg`                                                                                                                                                                                                                                                                                                                                            | Calligraphy: Ahmed Karahisari, 16th century, public domain                     | Public domain (PD-Art, PD-old-auto-expired, death year 1556)                                                             | https://commons.wikimedia.org/wiki/File:Ahmed_Karahisari_-_Karalama_(calligraphy_exercise)_-_Google_Art_Project.jpg                              |
| Johnson's grammar, `mood-johnson`                        | `decks/gt-brand/assets/mood-johnson-{light,dark}.jpg`                                                                                                                                                                                                                                                                                                                                                | Image: Samuel Johnson, 1755, scanned by the Wellcome Collection, public domain | Public domain: the Creative Commons Public Domain Mark 1.0 in the item's rights field                                    | https://archive.org/details/b30451541_0001                                                                                                       |
| The Louisbourg lighthouse, `mood-lighthouse`             | `decks/gt-brand/assets/mood-lighthouse-{light,dark}.jpg`, `apps/studio/home-deck/assets/mood-lighthouse-{light,dark}.jpg` (the landing's fixture, slide 6), `apps/studio/public/home/lighthouse-still-{wide,narrow}-*.webp` and `apps/studio/public/home/lighthouse-tone-*.jpg` (the canvas band's print and its tone map)                                                                           | Photograph: Ken Heaton, CC BY-SA 4.0                                           | CC BY-SA 4.0, Ken Heaton; attribution required                                                                           | https://commons.wikimedia.org/wiki/File:Louisbourg_Lighthouse,_waves_breaking_in_a_fall_storm_1.jpg                                              |
| The Compact Oxford English Dictionary, `mood-dictionary` | `decks/gt-brand/assets/mood-dictionary-{light,dark}.jpg`                                                                                                                                                                                                                                                                                                                                             | Photograph: Cullen328, CC BY-SA 4.0                                            | CC BY-SA 4.0, Cullen328; attribution required                                                                            | https://commons.wikimedia.org/wiki/File:Compact_Oxford_English_Dictionary_2.jpg                                                                  |
| The Prashna Upanishad page, `mood-devanagari`            | `decks/gt-brand/assets/mood-devanagari-{light,dark}.jpg`                                                                                                                                                                                                                                                                                                                                             | Photograph: Ms Sarah Welch, CC BY-SA 4.0                                       | CC BY-SA 4.0, Ms Sarah Welch; attribution required                                                                       | https://commons.wikimedia.org/wiki/File:Prashna_Upanishad_sample_manuscript_page,_Sanskrit,_Devanagari_script.jpg                                |
| The glossed Alexandreis, `mood-gloss`                    | `decks/gt-brand/assets/mood-gloss-{light,dark}.jpg`                                                                                                                                                                                                                                                                                                                                                  | Image: MS f Med. 23, Boston Public Library, public domain                      | Public domain in the United States: No Copyright - United States (rightsstatements.org), contributed through the DPLA    | https://commons.wikimedia.org/wiki/File:Alexandreis_with_gloss_-_in_Latin_-_DPLA_-_98b56ea1ebec780d88ec0bdfa6750159_(page_69).jpg                |
| The Eastern Telegraph chart, `mood-cable`                | `decks/gt-brand/assets/mood-cable-{light,dark}.jpg`                                                                                                                                                                                                                                                                                                                                                  | Map: Eastern Telegraph Company, 1901, public domain                            | Public domain in the United States (PD-US); author unknown                                                               | https://commons.wikimedia.org/wiki/File:1901_Eastern_Telegraph_cables.png                                                                        |
| Hokusai's wave, `mood-wave`                              | `decks/gt-brand/assets/mood-wave-{light,dark}.jpg`                                                                                                                                                                                                                                                                                                                                                   | Print: Katsushika Hokusai, about 1831, public domain                           | Public domain (PD-Art, PD-old-auto-expired, death year 1849)                                                             | https://commons.wikimedia.org/wiki/File:Tsunami_by_hokusai_19th_century.jpg                                                                      |
| Bowen's compass rose, `mood-compass`                     | `decks/gt-brand/assets/mood-compass-{light,dark}.jpg`                                                                                                                                                                                                                                                                                                                                                | Engraving: Emanuel Bowen, 1748, public domain                                  | Public domain (PD-Art, PD-old-100), provided by Geographicus                                                             | https://commons.wikimedia.org/wiki/File:1748_Bowen_Mariner%E2%80%99s_Compass_and_Armillary_Sphere_-_Geographicus_-_CircleofWinds-bowen-1747.jpg  |

Notes on the table:

- The 1897 Oxford English Dictionary page, the dictionary slide of the Prototemplate deck, states no
  licence on its source page (https://archive.org/details/oxforddictionaryv3p1unse_a5h6: no rights,
  licence URL or copyright status). It stays out of the repository and the product until a scan
  whose page states a licence is read. The Turboslide decks keep the Compact OED photograph above.
- A dithered copy of a CC BY-SA 4.0 photograph is an adaptation: it carries the credit and is shared
  under CC BY-SA 4.0. Of the four, only the lighthouse is used outside the decks: on `/home`'s
  canvas band, whose slide carries its credit on the plate.
- The gloss carries No Copyright - United States, which says the item is free of copyright under
  United States law and may be protected elsewhere. The manuscript is of about 1250.
- The landing's opener field (`apps/studio/home-deck/assets/field-{light,dark}.png`, the export
  band's slide 7, and its print `apps/studio/public/home/field-still-*.webp`) is drawn by
  `scripts/build-home-assets.ts` from a formula (direction B's `openerTone`); it is not a mood
  picture and its plate credits it "Drawn in Turboslide".
- The landing's slide 8 (`apps/studio/home-deck/assets/pattern-{light,dark}.png`, an Animated
  pattern's still frame captured by the CLI's `material capture paper:dithering`, and its served
  frames `apps/studio/public/home/pattern-still-*.webp`) is a Paper Shaders material rendered in
  Turboslide (Apache-2.0); it is not a mood picture and carries its material credit.
- The openers and the closing picture are General Translation's own renders of Prototemplate
  directions and of Paper Shaders materials (Apache-2.0, read 2026-10-02 09:01Z). They are not mood
  pictures and carry their material credits.
- Slide 13's eleven reference thumbnails (`ref-*.jpg`) carry the one line "The photographs come from
  Wikimedia Commons" and no licence per file. Their licences were not read; they are a finding for
  Kevin (`round1/build/b4.md`).

## 9. The 2026-10-01 deck mapped to Turboslide

Each rule of `P:deck/DECK-GRAMMAR.md` (P is the Prototemplate checkout) with the Turboslide surface
it governs and the lane of Round 1 that carries it (NEXT.md 4.1.3 and 4.1.6).

| The deck's rule                                                                         | Turboslide                                                                                                                                                     | Lane          |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Inter is the only typeface; display weight 500 at most (lines 20, 24)                   | `--pt-display` and `--pt-text` resolve to Inter; the lockup's word is live Inter 500                                                                           | B1, B5 lint   |
| Sentence case headings with no trailing period; Title Case only on buttons (22)         | Menu rows, tooltips and headings in sentence case; every button label in Title Case                                                                            | B3a, B2c, B3b |
| Straight technical English, no metaphors, no em dashes, no exclamation marks (23)       | The forbidden words list of `packages/chrome/src/menus/strings.ts`; the words push                                                                             | B3a           |
| Paper and ink tokens, a dark token remap (27, 28)                                       | `packages/chrome/src/tokens.css`, with the deviations of section 10                                                                                            | B3b           |
| No accent colour on text, lines or fills (29)                                           | The chrome draws none; the selection's GT blue is the one exception (section 11, question 3)                                                                   | B3b           |
| Semantic colour on icons only, four hues (30)                                           | Status icons in the shell's per theme hues (section 10)                                                                                                        | B3b           |
| Code on the `#101010` panel; monospace nowhere else (31)                                | The `/home` command on the panel; the brand lint's monospace check                                                                                             | B2a, B5       |
| Two rails, two rules and crosses on the sheet (lines 12 to 14)                          | C's page grammar: the 1104 px column with one rail on each side, 9 px crosses where a seam meets a rail, the 58 px bar, the hatch strip; the blank slide plain | B2a, B2b, B4a |
| Lists are ruled rows; no cards with shadows, no rounded corners, no gradients (39)      | `/decks` as ruled rows; the Share dialog's rows; square chrome with `--pt-radius` on the search field and segmented controls and 8 px on Slideshow             | B2b, B3b      |
| Heroicons 20 solid, in a key cell or at the start of a row (40)                         | The facts rows on `/home`; no icon before a heading                                                                                                            | B2a           |
| Diagrams: 11 px square markers, no large arrowheads, labels at 18 px or more (42 to 48) | The `/home` diagrams                                                                                                                                           | B2a           |
| Speed marks built by the generator, never redrawn by hand (50 to 53)                    | The Turboslide monogram built from rectangles by the same construction; the 16 px rows are the one hand drawing (section 3)                                    | B1            |
| Full picture and mood slides with a plate and a credit (8)                              | The mood picture on the card; Not found and the empty `/decks` state; the Sign in plate in Round 3                                                             | B1, B2b, B2c  |
| Every slide checked in both themes (60 to 63)                                           | Every surface in both appearances; the slide keeps its deck's appearance on the stage, the filmstrip, the presenter and the `/deck` view                       | B3b           |
| The avoid list (slide 39): no sparkles, no smooth scroll                                | Assist as the word alone; no `scroll-behavior: smooth`                                                                                                         | B3b           |

## 10. The tokens and the recorded deviations

`packages/chrome/src/brand.css`, imported once by `__root.tsx` after `tokens.css`, declares sixteen
`--ts-` identity tokens on `:root`. `packages/theme/src/brand.ts` mirrors them as `BRAND_TOKENS`
and `BRAND_TOKENS_NARROW`, and `brand.test.ts` asserts the sheet and the data agree. The values are
C's build table read against the deck's type ladder (slide 29) and shell numbers (slide 49), lane
B2's request:

| Token         | Value             | At and under 720 px | Read by                                                   |
| ------------- | ----------------- | ------------------- | --------------------------------------------------------- |
| `--ts-cell`   | `2px`             |                     | Every dithered twin, shown at 2 px cells and never scaled |
| `--ts-mark`   | `24px`            |                     | The title row mark                                        |
| `--ts-h1`     | `3.7rem`          | `2.5rem`            | The `/home` display size                                  |
| `--ts-h2`     | `2.25rem`         |                     | Band headings                                             |
| `--ts-h3`     | `1.375rem`        |                     | Subheads                                                  |
| `--ts-title`  | `1.125rem`        |                     | Row titles                                                |
| `--ts-lead`   | `17px`            |                     | Leads                                                     |
| `--ts-body`   | `16px`            |                     | Body text                                                 |
| `--ts-small`  | `14px`            |                     | Facts, links, source lines                                |
| `--ts-label`  | `13px`            |                     | Labels                                                    |
| `--ts-figure` | `40px`            | `32px`              | The numbers row, `tabular-nums`                           |
| `--ts-rail`   | `1104px`          |                     | The column between the rails                              |
| `--ts-gutter` | `40px`            | `16px`              | The column's gutter                                       |
| `--ts-nav-h`  | `58px`            |                     | The navigation bar                                        |
| `--ts-cross`  | `9px`             |                     | The cross where a seam meets a rail                       |
| `--ts-plate`  | `var(--pt-paper)` |                     | The plate is the ground showing through and draws no rule |

The layout's one breakpoint is 1023 px (`BRAND_LAYOUT_MAX_PX`, slide 49).

Turboslide's `--pt-` tokens differ from the deck's in these places, each for a measured reason that
`tokens.css` states beside the value (question 32 records them as deviations):

| Token                                            | The deck                         | Turboslide                    | Why                                                                                                                                          |
| ------------------------------------------------ | -------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `--pt-titanium`, light                           | `#8a8f98`                        | `#6f747d`                     | The chrome's secondary text reads 4.70:1 on paper; the deck's value is 3.25:1, under SC 1.4.3's 4.5:1 (`docs/archive/rounds/PRODUCT.md` 3.1) |
| `--pt-plate`, light                              | ink at 0.035                     | ink at 0.06                   | The hover ground composites `#f0f0f0`, 1.14:1; 0.035 read 1.08:1 and a hover changed almost nothing                                          |
| `--pt-plate`, dark                               | ink at 0.035                     | ink at 0.08                   | The same step on the ink ground                                                                                                              |
| `--pt-field`, `--pt-disabled`                    | none                             | ink at 0.44; `#8a8f98`        | An input's boundary at 3.1:1 (SC 1.4.11); a disabled control's text apart from ink-2                                                         |
| `--pt-hair-on-ink`, `--pt-plate-on-ink`, `-open` | none                             | paper tints over ink          | The line and the grounds over the solid ink of the Slideshow split button (`docs/archive/rounds/RETURN.md` 4.1)                              |
| The status hues                                  | one value per hue in both themes | one value per theme           | The deck's amber `#f0a020` is 2.15:1 on paper; the shell's `#c47d00` is 3.34:1, with the lifted hues on ink (lane B3b, push 10)              |
| `--pt-select`                                    | none                             | `#2f5ce0` in both appearances | Section 11                                                                                                                                   |

The sheet theme of the slides (`packages/theme/src/gt-ink-paper/sheet.css`) keeps the deck's own
values, so a slide is the deck's in both appearances.

### The design round's chrome tokens (2026-10-05)

The design round (`docs/DESIGN.md` sections 2 to 6, push DR-D1#1) adds these to `tokens.css`. The
numbers are data in `packages/theme/src/scale.ts`, and `scale.test.ts` pins the file to them.

| Token or class                                             | Value                                                       | Deviation from the deck and why                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--pt-radius-sm`, `--pt-radius`, `--pt-radius-lg`          | 4, 6 and 8 px                                               | DECK-GRAMMAR.md 40 squares every corner. The chrome takes General Translation's UI ladder instead (decision C4, question 1): 4 px chips, 6 px controls and small floating plates, 8 px windows. Slides, thumbnails, rails, the selection ring and everything on a slide stay square |
| `--pt-ring`, `.pt-float`, `.pt-window`, `.pt-kbd`          | a 1 px paper gap and a 1 px `--pt-hair-soft` line           | The deck draws no shadows; a floating plate separates by its `--pt-edge` frame and the ring, with no blur and no offset (decision C5)                                                                                                                                               |
| `--ts-layer-stage` to `--ts-layer-skip`                    | 0, 10, 20 to 90                                             | None in the deck. Ten stacking layers for the chrome's floating surfaces, applied through the top layer by `packages/chrome/src/Layer.ts` (decision C1)                                                                                                                             |
| `--pt-numerals`, `.pt-num`                                 | `tabular-nums`; `tabular-nums slashed-zero` on codes        | The deck sets figures per slide. The chrome writes Inter's tabular figures through one token wherever a number aligns or changes in place (decision C9)                                                                                                                             |
| `--pt-thumb`                                               | ink at 0.44 in both appearances, 3.12:1 and 3.97:1          | Was ink at 0.32 (2.17:1 and 2.58:1), under the 3:1 of WCAG 2.2 SC 1.4.11 for the scrollbar thumb                                                                                                                                                                                    |
| The scrollbar (`::-webkit-scrollbar` at the root, Firefox) | an 8 px gutter, a 4 px thumb with round ends, 6 px on hover | Every scroller draws one bar with no class (decision C11); the deck's `head.html` 188 to 198 carries a Firefox gate that never applies, reported to Prototemplate in the round's ship note                                                                                          |
| `.pt-icon`                                                 | Inter's default glyphs                                      | The chrome leaves the deck's alternates `cv11` and `ss01`, which belong to the General Translation theme's slides (decision C6, question 8)                                                                                                                                         |

The brand lint (`packages/lint/src/brand/`) reads the new rules: `css/z-index`, `css/no-shadow`,
`css/scrollbar`, `css/numerals` and `css/chrome-alternates` report from DR-D1#1 and fail from
DR-D1#5; `css/radius` accepts the three rungs.

## 11. The selection colour

The canvas selection ring, the eight resize handles and the rotation handle, the marquee, the hover
outline, the crop frame and its handles, the group box and the selection chip read `--pt-select`.
Since Round 1 it is GT blue `#2f5ce0` in both appearances, with `#ffffff` text on the chip through
`--pt-select-text` (question 3; `SELECTION_COLORS` in `brand.ts`; the row
`chrome.selection.gt-blue`). The snap guides keep `--pt-guide`, `#d6336c` in the light appearance
and `#f0397a` in the dark. The remote collaborator outlines keep round three's six hues. The
exports, the deck content, the menus, the card and the README draw no blue.

`/home` since the landing round (Kevin's answer 3 to `docs/LANDING.md` section 7, 2026-10-02)
draws `#2f5ce0` only while something is being worked on: the live selection ring, its handles and
chip, the snap guide, the Tailor highlight, the lifted filmstrip slide's outline, an open menu
row's ground (the menus band's miniature, since the second pass) and the focus ring, never at rest
and never by an automatic motion (the agent's ring and flag are ink in both terminals' runs) (rows `decks.home.capture-plain` and `home.hero.select`). The page's snap guides
draw in the selection blue where the editor draws `--pt-guide`, a recorded deviation (LANDING.md
question 3, A's risk 3). The text caret is the browser's in the text's colour, as the editor's. An
example kit may carry a colour outside paper and ink when it is labelled as a customer's kit
(answer 4): the Globex swatch's ground `#0a1b38` (the first pass named the kit Fenwick; the second
pass's kits band returns C's Globex, question 15), which holds the ring at 3.04:1.

The blue holds at least 3:1 against the paper and the ink of each appearance (SC 1.4.11), so a ring
reads on a white slide and on a dark photograph: 5.63:1 on `#ffffff`, 3.58:1 on `#070707` and
5.03:1 on `#f2f2f0`. The chip's white text on it is 5.63:1 (SC 1.4.3). `brand.test.ts` computes
each ratio. The tokens land in `tokens.css` and `Overlay.css` in lane B3b's push 10.

## 12. Accessibility record

Contrast is computed by the WCAG relative luminance formula on the token values
(`relativeLuminance` and `contrastRatio` in `brand.ts`), against SC 1.4.3 Contrast (Minimum) and
SC 1.4.11 Non-text Contrast of WCAG 2.2
(https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html and
https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html). SC 1.4.3 exempts text that is
part of a logo or brand name.

| Pair                                                         | Light   | Dark    | Where                                                       | Criterion                    |
| ------------------------------------------------------------ | ------- | ------- | ----------------------------------------------------------- | ---------------------------- |
| `--pt-ink` on `--pt-paper`                                   | 20.14:1 | 17.97:1 | Headings, body, the mark on its plate                       | 1.4.3, passes 4.5:1          |
| `--pt-ink-2` on paper                                        | 10.88:1 | 10.59:1 | Captions, the card's address, secondary copy                | 1.4.3, passes 4.5:1          |
| `--pt-titanium` on paper                                     | 4.70:1  | 6.20:1  | The chrome's secondary text; the deck's `#8a8f98` is 3.25:1 | 1.4.3, passes 4.5:1          |
| The tile's frame (`#656565` on paper, `#888887` on ink)      | 5.83:1  | 5.68:1  | The tile's edge                                             | 1.4.11, passes 3:1           |
| The frame against Chrome's tab strips (`#dee1e6`, `#202124`) | 4.45:1  | 4.54:1  | The tile's edge on both strips                              | 1.4.11, passes 3:1           |
| `--pt-select` `#2f5ce0` on `#ffffff`                         | 5.63:1  | 5.63:1  | The selection ring on a white slide                         | 1.4.11, passes 3:1           |
| `--pt-select` `#2f5ce0` on `#070707`                         | 3.58:1  | 3.58:1  | The selection ring on a dark photograph                     | 1.4.11, passes 3:1           |
| `--pt-guide` on `#ffffff`                                    | 4.62:1  | 3.77:1  | A snap guide on a white slide                               | 1.4.11, passes 3:1           |
| `--pt-guide` on `#070707`                                    | 4.36:1  | 5.34:1  | A snap guide on a dark photograph                           | 1.4.11, passes 3:1           |
| The chip's `#ffffff` text on `#2f5ce0`                       | 5.63:1  | 5.63:1  | The selection chip                                          | 1.4.3, passes 4.5:1 at 13 px |

The mark's alt text is "Turboslide"; alone the mark is `role="img"`, beside the word it is
`aria-hidden` so the name is read once. The card's credit is 15 px titanium on the dark plate.

## 13. Light and dark

Both appearances are first class. Every identity asset exists in both: `currentColor` for the
mark, the scheme block for the tab icon, twins for the pictures, the two `theme-color` values. The
tab icon follows the operating system while the page follows its stored theme. The README's
`<picture>` shows `docs/readme/brand/lockup-dark.png` (paper on ink) by default on GitHub's light
ground and `lockup-light.png` (ink on paper) for a reader with GitHub's dark theme. Both are the
lockup at a 66 px word rendered at 2x by `node scripts/build-brand.ts --readme`.

## 14. The GT mark

The GT mark stays content of the `gt-ink-paper` theme and the GT template: the sheet's wordmark
band and counter on a GT deck (`GT_BAND`, `packages/render/src/stage.ts`), the `mark` block, the
closing plate, the icon picker's `gt-mark` symbol, the GT template card on `/decks` and the Themes
panel. Since hotfix H6 the blank template draws no GT mark and no GT wordmark band. The chrome draws
the Turboslide mark everywhere it draws a product mark; the `/deck` view's sidebar, the viewer
toolbar and the filmstrip move from `GtMark` to `TurboslideMark` in lane B3b's push 12 (the row
`chrome.mark.one-product-mark`).

## 15. The build script and its records

`node scripts/build-brand.ts` (also `pnpm build:brand`) runs through Node's type stripping with no
new dependency and no font tool. It writes the SVG sources under `packages/theme/brand/`
(`mark.svg` the master drawing, `mark-small.svg` the rows, `mark-24.svg` the 24 px placement,
`icon-tile.svg`, `wordmark.svg` the lockup with the word as live text), `og-template.html`, the icon
set, the manifest, `robots.txt`, the mood picture copies, `mark-geometry.json`, the card and
`brand-manifest.json`. The flags:

- `--readme`: the README lockup pair under `docs/readme/brand/`.
- `--facts`: `packages/theme/brand/facts.json`, the counts `/home` and the README state, read from
  the tree.
- `--capture`: the two tone twins under `apps/studio/public/brand/` and `hero.recipe.json`. Byte
  identity holds only on a Mac with ANGLE Metal, so the twins are committed and compared by bytes.
- `--check` (`pnpm check` step 29): the committed `MARK_PATH` against a rebuild from `MARK_RECTS`
  and both sha256 digests, the rows' path likewise, then every file against the manifest by bytes
  and sha256, a rebuild compared by pixels for the rasters and the ICO's decoded entries and by
  bytes for text, the file facts (three ICO entries at 16, 32 and 48 with the 16 px entry at three
  colours, the scheme block in `icon.svg`, the opaque touch icon, the manifest's paper colours and
  one purpose per icon, the maskable marks inside the safe circle, alpha only on the monochrome
  icon), the twins' palette, the card's size and its pixels when the local browser is the
  `chromium-1217` build, `mark-geometry.json`, and `facts.json` against the tree.

Edit the generator or `brand.ts`, never a generated file.

## 16. Repository metadata

The GitHub repository's homepage, description and social preview are Kevin's settings (K5 and K7 of
NEXT.md 3.1); no lane changes them. `gh repo view` read the homepage as the old project address at
2026-10-02 04:20Z and `usesCustomOpenGraphImage` as false. The commands, from the repository root
with `gh` logged in as Kevin:

```
gh repo edit Kevin-Liu-01/Turboslide --homepage https://www.turboslide.com
gh repo edit Kevin-Liu-01/Turboslide --description "Turboslide is a slides editor in the browser with Google Slides' menus and shortcuts, an agent surface and a PowerPoint export"
```

The social preview is `apps/studio/public/og/turboslide.png` (section 6), uploaded by hand under the
repository's Settings, Social preview.

## 17. The name check

Run on 2026-10-01 between 22:00 and 22:20 PDT by lane B1 with web search, the USPTO's TSDR status
pages, Apple's public search API, npm's registry search and the GitHub search API
(`docs/gslides-parity/round1/sheet.md`, "The name check"). No product sold as Turboslide or Turbo
Slide was found with a speed mark, and no software product named Turboslide was found besides this
one.

| Mark        | Record                                                       | Owner                                   | Status                     | Goods                                                      |
| ----------- | ------------------------------------------------------------ | --------------------------------------- | -------------------------- | ---------------------------------------------------------- |
| TURBOSLIDE  | Registration 3761186, serial 77797872, registered 2010-03-16 | Olympia Tools International, Covina, CA | Live, renewed 2020-10-07   | Class 8, utility knives; standard characters               |
| TURBOSLIDE  | Serial 77854924, filed 2009-10-22                            | JPJ Investment Holding Co.              | Dead, abandoned 2010-05-11 | Class 8, knives; standard characters                       |
| TURBO-SLIDE | Registration 5018456, serial 86423077, registered 2016-08-09 | Rytec Corporation, Jackson, WI          | Live                       | Class 19, high speed industrial doors; standard characters |
| TURBO-SLIDE | Serial 86517133, filed 2015-01-28                            | Rytec Corporation                       | Dead, abandoned 2015-12-03 | Industrial sliding doors                                   |

No record under any of the three spellings was found in class 9 (software) or class 42 (software
services). The two live registrations are standard character marks for knives and for doors, so
neither claims a design. A filing by Turboslide in classes 9 and 42 would still meet them, which is
a question for counsel. The products sold under the name (TurboHarp's harmonicas, two water slides,
a playground slide, Rytec's door, a Second Life slide viewer, an Android game and a Google Slides
extension named TurboAnimator) carry no speed mark. The software marks named Turbo in thesvg.org's
registry (Turborepo, Turbopack, Hotwire Turbo, TurboSquid) use no slanted letters, cut or speed
bars. Stock art of a T with speed lines is sold, so the form is common; the Turboslide mark shares
its cut and its weights with the GT bar monogram.

## 18. Sources

- `docs/NEXT.md` sections 3, 4.0, 4.1, 5, 6 and 7, read in full on 2026-10-02.
- `docs/gslides-parity/round1/sheet.md` and `sheet-judge.md`, with the sheet's pictures and
  `sheet-judge/16cap.png`.
- `docs/gslides-parity/round1/build/b2.md`, `b3b.md`, `b4.md` and `b5.md`, the day 0 requests to
  lane B1.
- `P:deck/DECK-GRAMMAR.md` (66 lines), `P:deck/slides/06-mood-earth.html` and
  `P:scripts/build-speed-marks.mjs` 94 to 142, at Prototemplate `speed-marks` 4c23522.
- The tree on 2026-10-02: `packages/theme/src/brand.ts`, `packages/theme/brand/site.ts`,
  `packages/theme/brand/mark-geometry.json`, `packages/chrome/src/{brand.css,tokens.css}`,
  `apps/studio/public/{brand-manifest.json,manifest.webmanifest}`.
- https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html and
  https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html.
