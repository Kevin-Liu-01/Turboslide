# The Turboslide identity

The record of the identity round four shipped (`docs/gslides-parity/SPEC-4.md` section 1, the
binding specification; `docs/gslides-parity/design-4/proposal-1-dither.md`, the winning proposal;
`research-4/01-brand-references.md` and `02-icon-favicon-og-production.md`, the facts behind it).
Written by the documents builder (B5) on 2026-09-14 against the working tree after merge 1
(`main` at `d5d7f07` plus the day 0 and day 1 files of `docs/gslides-parity/build-4/`); every
number below is either computed from `packages/theme/src/brand.ts` on that tree, read from a file
the build wrote, or cited with its source and date. Where an asset had not landed when this
document was written, the section says so and names the day of `MILESTONES-4.md` that produces
it; the ship step's reader should treat such a line as a check to run rather than a fact to repeat.

The identity is one mark, one wordmark, one icon set, one card, one token sheet and one build
script. The mark is the product's own composition: a slide and the plate cut from it, drawn
through the deck's own Bayer screen. There is no accent colour anywhere in the chrome, on `/home`,
on the card or in this repository's README: the identity is paper and ink (SPEC-4 0.3). The one
blue in the product is the canvas selection colour, which is an editor affordance outside the
brand (section 10).

## 1. The mark

A slide and the plate cut from it. Every GT opener puts a two tone picture under the whole 1600 by
900 sheet and a title plate lower left, and `plateClear` (`packages/effects/src/metrics.ts`,
`PLATE_BOXES.opener` is `[137, 500, 740, 271]`) measures that no lit cell intrudes into the plate.
The mark is that composition at its smallest.

Construction, from `packages/theme/src/brand.ts` (moved from `design-4/dither/mark.mjs`, the one
geometry source; `TurboslideMark.tsx`, `scripts/build-brand.ts` and the CLI banner import it and
nothing else computes the mark):

- Grid: 8 by 8 cells. `WINDOW = [1, 5, 4, 7]`, so columns 1 to 4 and rows 4 to 6 are the window,
  the body keeps a one cell rail on the left and the bottom, and the window is 4 by 3 cells: 50
  percent of the width and 37.5 percent of the height, 12.5 percent from the left and the bottom.
- Field: `field(u, v) = 1 - 0.75 * (windowDistance(u, v) / D_MAX)`, density 1 along the window's
  edge and 0.25 at the far corner (`FIELD_END = 0.25`; `D_MAX` is 0.625, the top right corner). A
  far corner at 0.5 would be a checkerboard and 0 would dissolve the silhouette.
- Threshold: the pipeline's own test, `tone > (bayer8(y, x) + 0.5) / 64`, with `bayer8` from
  `packages/effects/src/bayer.ts`, so the mark's cells are the cells the two tone pipeline would
  light for that field.
- `markBits(N)` for N a multiple of 8. At N = 8 every body cell is ink: 52 of 64 cells, the solid
  form. At N = 32 the field lights 610 of 1,024 cells (832 body cells); at N = 64 it lights 2,400
  of 4,096 (3,328 body cells). A raster is drawn on its own cell grid and never resampled
  (R02 5.4).
- `markPath(unit)`: the solid form as one even odd path on a 16 unit box, `M0 0h16v16H0z M2 8h8v6H2z`
  at `unit = 2`, an area of 208 of 256 units. It is what the favicon, the title row, the app bar,
  the print bar and the terminal draw. SPEC-4 6.4's "208 ink cells" is this area; `brand.test.ts`
  pins both readings (`b1.md` 1.2 item 1).
- `cellRects(image)`: the lit cells as row runs of `<rect>` elements, so `mark.svg` at 64 cells is
  a few hundred elements instead of 4,000.
- `markBlocks(N)`: the bitmap as half block characters (U+2580, U+2584, U+2588), two grid rows per
  text line, for the terminal banner (section 11).

The sizes, one threshold for every surface (SPEC-4 0.5): solid below 64 px, cellular from 64 px.

| Use                                               | Size           | N         | Cells                                     | Colours in the raster              |
| ------------------------------------------------- | -------------- | --------- | ----------------------------------------- | ---------------------------------- |
| Favicon, `icon.svg`, app bar, print bar, terminal | 16 px          | 8         | solid                                     | 3 on the tile; 2 on a clear ground |
| Title row                                         | 24 px          | 8         | solid (integer edges at 3, 12, 15 and 21) | 2                                  |
| ICO 32 and 48 px entries, the horizontal lockup   | 32 and 48 px   | 8         | solid                                     | 3 on the tile                      |
| Not found, the stacked lockup, the README         | 64 px          | 32        | 2 px                                      | 2                                  |
| Touch icon tile (180 px tile, 128 px mark)        | 128 px         | 32        | 4 px                                      | 2                                  |
| Manifest icons (192 and 512 px tiles)             | 160 and 448 px | 40 and 56 | 4 and 8 px                                | 2                                  |
| The full mark, the card                           | 512 px         | 64        | 8 px                                      | 2                                  |

The mark never takes a gradient, a second colour, a 2.5D rendering, a rounded corner, an outline
or a rotation. It is `currentColor` wherever it stands alone; the tile adds the plate and the frame
in the host's colours. It is not a triangle, a cube, a Z, a roundel, a chevron pair, a speed line or a
yellow rectangle with a white rectangle (R01 6.3 item 12), and it borrows no sliding or speed
glyph that could recall the harmonica, the door or the playground slide sold under the same word
(R01 section 5). It reads as a form before a letter, so a page in another script carries it
without a Latin word beside it.

## 2. The tile

Every raster the `prefers-color-scheme` block cannot reach (the `favicon.ico` entries, Safari's base
rendering of `icon.svg`, Windows) is the mark in ink on an opaque paper plate with a 1 px frame in
the edge composite: `#656565` on paper and `#888887` on ink (`TILE_COLORS` in `brand.ts`; SPEC-4
0.4, proposal 3's tile applied to proposal 1's form). Where the block is honoured the SVG swaps to
paper ink on an ink plate with the `#888887` frame. The titanium base of the proposal is out: it
measured 2.48:1 on Chrome's light inactive strip. The 16 px entry therefore holds three colours
(plate, frame, ink), which amends R01 acceptance item 5 from two colours to three at 16 px; the
verifier's six tab screenshots (SPEC-4 6.5) are the proof.

The tile geometry (`TILE_SIZES`): the 16 px tile carries a 12 px mark at (2, 2), the 32 px tile a
24 px mark at (4, 4), the 48 px tile a 40 px mark at (4, 4). A 12 px mark puts the 16 unit path's
window edge at 1.5 px, so that one size is hinted once (`solidWindow(12)`): rails of 2 px on the
left and the bottom, a window 6 px wide and 4 px tall at (2, 6). The 24 and 40 px marks keep the
arithmetic (1.5 and 2.5 px per unit). SPEC-4 0.50 allows a hint after a raster shows a soft edge;
here the arithmetic showed it before any raster, and the three ICO entries decode to three
colours each with no anti aliased pixel (`b1.md` 1.2 item 2).

`packages/theme/brand/mark-geometry.json`, written by the build and compared on every `--check`,
records per raster the tile size, the mark size, the cell count per side, the cell size in pixels,
the lit cells and the colour count read back from the file: the ICO entries 120, 468 and 1,300 lit
cells at 3 colours on a paper plate; the touch icon 9,760 at 4 px cells on an ink plate; the 192 px
icons 15,136 at 4 px; the 512 px icons 117,824 at 8 px; the maskable icons 5,392 (96 px mark, 2 px
cells) and 38,400 (256 px mark, 4 px cells) inside the 40 percent safe circle; the monochrome icon
163,072 (the 448 px solid form as alpha).

## 3. The wordmark and the lockups

The wordmark is the word Turboslide in Inter, weight 500, `font-feature-settings: 'cv11', 'ss01'`,
`letter-spacing: -0.025em` at 28 px and above, `-0.01em` from 16 to 27 px, 0 under 16 px (R01 6.2
item 5). It is live text everywhere the page has text; `PROPER_NOUNS` in
`packages/theme/src/copy.ts` carries "Turboslide" so the sentence case lint keeps its capital in a
heading.

- Horizontal (`packages/theme/brand/wordmark.svg`): the mark's height is the cap height of the word
  (Inter's cap height is 1490 of 2048 units, 0.7275 em, so 66 px type gives 48.0 px), the gap one
  third of the mark, baselines aligned, the mark solid at 48 px. The word measured 287.06 px at
  66 px in Chromium with the repository's `InterVariable.woff2` (proposal 1 section 1.4). For the
  README, npm and the card, where no font can be assumed, `wordmark-outlines.svg` carries the word
  as outlines taken from `packages/fonts/assets/InterVariable.woff2` by fontTools with Inter's own
  pair kerning applied (T to u at minus 197 units; `packages/theme/scripts/outline-wordmark.py`
  under the fonts venv).
- Stacked (`lockup-stacked.svg`): the 64 px cellular mark centred over the word at 66 px, clear
  space equal to the mark's height. The README hero and the Not found page.
- The horizontal lockup at 22 px type (the `/decks` app bar, the `/home` navigation and footer)
  uses the 16 px solid mark with a 10 px gap (`AppBarBrand.tsx`, `.ts-brand-lockup` in
  `brand.css`).

State on 2026-09-14: `wordmark.svg`, `wordmark-outlines.svg`, `lockup-stacked.svg`,
`packages/theme/scripts/outline-wordmark.py` and the README lockup PNGs landed between 10:37 and
10:39 while this document was being written (B1's day 3 work). The two PNGs
(`docs/readme/brand/lockup-stacked-{dark,light}.png`, written by
`node scripts/build-brand.ts --readme`) are 832 by 580 px, a 2x raster of a 416 by 290 CSS px
lockup, read back with sharp on 2026-09-14: the dark file's ground is `#070707` (the dark
appearance twin, paper mark and word on ink) and the light file's `#ffffff`; the README's
`<picture>` shows the dark file by default at `width="416"` and the light file under
`prefers-color-scheme: dark` (section 13).

## 4. The GT mark

The GT mark stays content of the `gt-ink-paper` theme: the sheet's wordmark and counter
(`packages/render/src/stage.ts`), the `mark` block, the closing plate, the icon picker's
`gt-mark` symbol, the GT template card on `/decks` and the Themes panel. It leaves the title row,
the `/decks` app bar, the print bar, the favicon, the README, the CLI banner and the Not found
page. The sprite is unchanged and the Turboslide mark is not added to it (R01 6.5 item 23). No
Turboslide wordmark appears on any sheet (SPEC-4 1.3).

## 5. The icon set and the head

The set of SPEC-4 0.13 under `apps/studio/public/`, written by `node scripts/build-brand.ts` and
served at the `handle: filesystem` step so every icon, manifest and card request is a CDN answer
and never a function invocation with an HTML 404 (R02 section 1 measured the 404s on production
before this round). As built on 2026-09-14 (`brand-manifest.json` records the bytes and the
sha256 of every file):

| File                                           | What it is                                                                                                                                                                       | Bytes       |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `favicon.ico`                                  | Three 32 bit BMP entries at 16, 32 and 48 px, the paper tile, three colours each                                                                                                 | 15,086      |
| `icon.svg`                                     | The tile with the `prefers-color-scheme: dark` block and `shape-rendering="crispEdges"`                                                                                          | 957         |
| `apple-touch-icon.png`                         | 180 px, the ink tile with the 128 px mark at 4 px cells, opaque, no corners                                                                                                      | 753         |
| `icons/icon-192.png`, `icon-512.png`           | The `any` icons, the ink tile with the 160 and 448 px marks                                                                                                                      | 257 and 460 |
| `icons/icon-mask-192.png`, `icon-mask-512.png` | The `maskable` icons, the mark inside the 40 percent safe circle                                                                                                                 | 292 and 422 |
| `icons/icon-mono-512.png`                      | The `monochrome` icon, the solid form as alpha                                                                                                                                   | 3,083       |
| `icons/icon-dark-192.png`, `icon-dark-512.png` | The paper plate with the ink mark, the inverse of the manifest icons, for a `<picture>` on a light ground                                                                        | 257 and 460 |
| `manifest.webmanifest`                         | `name` and `short_name` Turboslide, the description, `start_url` `/home`, `display` standalone, `background_color` and `theme_color` `#070707`, five icons with one purpose each | 971         |
| `robots.txt`                                   | `Allow: /og/`; `Disallow` for `/new`, `/decks/trash`, `/print/` and `/edit/`                                                                                                     | 99          |
| `brand-manifest.json`                          | The path, bytes and sha256 of every output                                                                                                                                       | 2,571       |
| `og/turboslide.png`                            | The card (section 6), 1200 by 630, 29,818 bytes as landed on 2026-09-14                                                                                                          |             |

`icon-dark-*` is the paper plate with the ink mark, the inverse of the ink tile manifest icons, per
SPEC-4 1.5 step 2; proposal 2 named the two files the other way round (`b1.md` 1.2 item 6). The
README's `<picture>` (section 15 of `README.md`) uses the lockup PNGs rather than these icons.

The head (`apps/studio/src/routes/__root.tsx` `head()`, SPEC-4 1.6, R02 4.1): the description,
`application-name` and `apple-mobile-web-app-title`; one `theme-color` meta carrying `#070707` in
the server's HTML, set by a boot script after `<HeadContent />` to the stamped theme's `--pt-paper`
(`#ffffff` in the light appearance); `og:site_name`, `og:type`, `og:locale`, `og:title`,
`og:description`, `og:image` with its type, width, height and alt, and the `twitter:*` set with
`summary_large_image`; two icon links, `/favicon.ico` with `sizes="32x32"` first and `/icon.svg`
second; the touch icon; the manifest. The card's address is `SITE.origin()`, which reads
`TURBOSLIDE_PUBLIC_ORIGIN` else the production origin, so a preview without the variable carries
production's card address (the same file). `/edit/$deckId` joined `NOINDEX_ROUTES` because the
`'data-only'` route of SPEC-4 0.34 puts the dehydrated document in the HTML; `/home` stays
indexable.

Every fact the head carries comes from one object, `SITE` in `packages/theme/brand/site.ts`
(`@turboslide/theme/brand/site`): the description, the alt text, the origin rule, the theme
colours, the icon and twin paths, the manifest and the robots rules, so the head, the manifest,
the card and `robots.txt` never drift apart.

## 6. The Open Graph card

`og/turboslide.png`, 1200 by 630, rendered by Chromium from `packages/theme/brand/og-template.html`
(SPEC-4 1.7): the picture is the hero's frame through the screen at 10 px cells (120 by 63 cells,
`og-screen-dark.png`), so a 552 px feed card still shows 4.6 px cells and a 360 px unfurl 3 px,
above R02's 2 px floor; the plate is cut from it at the mark's proportions (left 150 px, width
600, bottom 79, height 236) and carries the 48 px solid mark, the word at 66 px as outlines and
the one sentence; the address sits top left on its own plate; nothing that matters is within 48 px
of an edge (X's 2:1 crop, R02 2.5). `og:image:alt` is `SITE.imageAlt`: "The Turboslide mark and
name on a plate cut from a two tone dithered liquid metal frame". The card decodes to two colours
plus the plate's ink and paper and the `--pt-ink-2` sentence, which the verifier records. Every
route serves this static card; `/deck/$deckId` sets `og:title` and `og:url` from its loader and
keeps the static image. A per deck card is round five's (SPEC-4 0.48).

State on 2026-09-14: the eight twins under `apps/studio/public/brand/` (`hero-`, `figure-`,
`notfound-` and `og-screen-`, each dark and light) and the card landed at 10:37 and 10:38 while
this document was being written (B1's day 2 work). Read back with sharp: `hero-dark.png` and
`hero-light.png` are 1600 by 900 with two colours each, the dark twin's ground `#070707` and the
light twin's `#ffffff`, 13,679 and 13,689 bytes; the card is 1200 by 630 at 29,818 bytes, under the
1 MB rule. The recipe and the anchor scan are `packages/theme/brand/hero.recipe.json`; the colour
count of the card is the verifier's to record (`b1.md` carries B1's own numbers when its day 2
section lands).

## 7. The tokens

`packages/chrome/src/brand.css`, imported once by `__root.tsx` after `tokens.css`, declares the
eleven `--ts-` identity tokens on `:root`; `packages/theme/src/brand.ts` mirrors them as
`BRAND_TOKENS` and `BRAND_TOKENS_NARROW`, and `brand.test.ts` asserts the sheet and the data
agree, the pattern of `tokens.ts` and `tokens.test.ts` (SPEC-4 0.8, 1.8). No colour, no radius,
no duration: the six `--pt-dur-*` durations stay the whole motion vocabulary.

| Token         | Value             | Under 760 px | Read by                                                                                                                                     |
| ------------- | ----------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `--ts-cell`   | `2px`             | `2px`        | Every dithered surface: a twin is 1600 by 900 at 2 px cells, shown at that size with `image-rendering: pixelated` and cropped, never scaled |
| `--ts-mark`   | `24px`            |              | The title row mark                                                                                                                          |
| `--ts-h1`     | `56px`            | `40px`       | The `/home` display size, line height 1.05, tracking -0.025em, weight 500                                                                   |
| `--ts-h2`     | `32px`            | `26px`       | Band headings, line height 1.12                                                                                                             |
| `--ts-h3`     | `20px`            |              | Card and row titles, line height 1.25, tracking -0.01em                                                                                     |
| `--ts-lead`   | `20px`            | `18px`       | The hero sentence and section leads, line height 1.45                                                                                       |
| `--ts-body`   | `15px`            |              | Body text on `/home` and Not found, line height 1.55                                                                                        |
| `--ts-small`  | `13px`            |              | The chrome size: facts, links, source lines, footer                                                                                         |
| `--ts-figure` | `40px`            | `32px`       | The numbers strip, `tabular-nums`                                                                                                           |
| `--ts-rail`   | `1120px`          |              | The content width of `/home`, the width the `/decks` page already uses                                                                      |
| `--ts-plate`  | `var(--pt-paper)` |              | The plate is the ground showing through and draws no rule                                                                                   |

`brand.css` also carries the two `::view-transition-*` rules of SPEC-4 0.40 (the old root fades
over `--pt-dur-leave`, the new over `--pt-dur-enter`, which the reduced motion block already sets
to 0 ms), the `.ts-mark` and `.ts-tile` classes `TurboslideMark.tsx` uses, the app bar lockup
classes and the Not found frame. Every `--pt-` token keeps its name and value; the one addition to
`tokens.css` is the selection block of section 10, and the acceptance gate reads
`git diff d5d7f07 -- packages/chrome/src/tokens.css` differs by that block only.
`apps/studio/src/styles.css` declares none of the eleven identity tokens (round three's ten
`--ts-` presence tokens stay there).

## 8. Where dithers and shaders appear, and where they never do

| Surface                                                     | Dither                                                                            | Shader                                  | The rule, as built                                                       |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------ |
| The mark at 64 px and above                                 | Yes, the construction of section 1                                                | No                                      | Solid below 64 px                                                        |
| `/home` hero                                                | Yes, one captured frame as twins at 2 px cells, still                             | Captured only; no live mount this round | The plate is opaque, so no cell sits under text                          |
| Empty states (no presentations, empty trash, no results)    | Yes, a 320 by 180 crop of the figure twin at 1:1 in a `--pt-edge` frame           | No                                      | Title, one sentence, at most one primary action (`EmptyFigure.tsx`)      |
| Not found                                                   | Yes, the 64 px mark over the notfound twin's crop                                 | No                                      | `__root.tsx` `NotFound`                                                  |
| The loading curtain (`EditorSkeleton`, `PresenterSkeleton`) | Yes, the figure twin where the sheet will be and the ramp as the progress texture | No                                      | Replaced by the sheet; never shown between slides                        |
| Progress (`Progress.tsx`)                                   | Yes, the leading sixteen cells of the fill are `rampInk` behind `--ts-cell`       | No                                      | The threshold map is fixed and the length moves                          |
| Presence chips and anonymous authors                        | Round three's identity mark (SPEC-3 4.1)                                          | No                                      | Not this round's                                                         |
| README hero and the card                                    | Yes                                                                               | Captured only                           | Sections 6 and 15                                                        |
| Present mode surround                                       | No                                                                                | No                                      | Flat `--pt-panel-ink`                                                    |
| Menus, toolbar, panels, dialogs, snackbars, tooltips        | No                                                                                | No                                      | The line law and 13 px text                                              |
| Text, icons, form controls                                  | No                                                                                | No                                      | Heroicons stay solid                                                     |
| Filmstrip thumbnails, layout tiles, the workspace           | No                                                                                | No                                      | A thumbnail shows the slide's pixels; the workspace is flat `--pt-plate` |
| The sheet                                                   | Only as content the user placed                                                   | Only as content                         | The identity never draws on the customer's slide                         |

Cells never shimmer: nothing re-seeds a threshold map, and the identity animates nothing (R01 3.2
principle 5). The hero is still this round (SPEC-4 0.6); the live monochrome mount is round five's
(section 17).

## 9. The app chrome

| Surface              | Round three                                           | Round four                                                                                                                                                                                   | State on 2026-09-14                                                                              |
| -------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Title row            | The GT mark at 31 by 20 px in a plain `<a href>`      | `TurboslideMark size={24}`, solid, inside the `linkComponent` the studio passes (the router's `Link`, `preload: 'intent'`); the label, the tooltip and `data-control="title.home"` unchanged | The component landed at merge 1 (`TitleHomeLink`); B3 fills the slot in `EditorRoot` on day 3    |
| The `/decks` app bar | The GT mark beside the word in one `Link` to `/decks` | `AppBarBrand`: the 16 px mark as one link to `/decks` (`appbar.home`), the word as a second link to `/home` with the tooltip "About Turboslide" (`appbar.about`)                             | The component landed at merge 1; B3 mounts it on day 3                                           |
| The GT template card | The GT mark at 56 by 36 px                            | Unchanged: the card shows the GT mark because it is the GT template                                                                                                                          | none                                                                                             |
| Empty states         | One sentence, "No presentations yet. Start one above" | `EmptyFigure` over the title, the sentence and one New Presentation button; the same on the trash and for no search match                                                                    | The component landed at merge 1; the figure twins landed on 2026-09-14; B3 mounts it on day 3    |
| Not found            | An `h1` and one paragraph                             | The 64 px mark over the notfound twin's crop, the heading "Not found", one sentence, `.pt-ib` buttons to `/new`, `/decks` and `/home` with tooltips                                          | Landed at merge 1; the About Turboslide button is a plain anchor until B2's `/home` route exists |
| Print preview        | The GT mark at 25 by 16 px in `.ts-print-title`       | `TurboslideMark size={20}` before the title; the pages unchanged                                                                                                                             | B1's day 5                                                                                       |
| The present surfaces | Flat `--pt-panel-ink`                                 | Unchanged; the presenter's head takes the icon set through the root route                                                                                                                    | none                                                                                             |
| The loading curtain  | Round three's skeletons                               | The figure twin where the sheet will be and the deck's ramp as the progress texture; the boxes stay the final frame's (the layout shift gate stays at zero)                                  | B1's day 2 (the picture), `apps/studio/src/components/{EditorSkeleton,PresenterSkeleton}.tsx`    |
| Progress             | The ink fill on the track                             | The fill's leading sixteen cells are the deck's ramp (`rampInk`, one cell row) applied as a mask on the fill's end; the fill moves with `translateX` and the track clips it                  | Landed at merge 1; the track keeps the port's 2 px (`b1.md` 1.2 item 5)                          |
| The browser tab      | `{ rel: 'icon', href: 'data:,' }`                     | The set of section 5 and the head of section 5                                                                                                                                               | Landed at merge 1                                                                                |

`TurboslideMark.tsx` draws `markPath(2)` below 64 px and the cells of `markBits(N)` from 64 px,
`currentColor`, `shape-rendering="crispEdges"`, `role="img" aria-label="Turboslide"` alone and
`aria-hidden` beside a word; the size is written as `width` and `height` attributes so a sheet's
rule wins over them (the title row reads `--ts-mark`). `PORTED_FROM.json` records it,
`AppBarBrand.tsx`, `EmptyFigure.tsx` and `brand.css` as Turboslide's own. `GtMark.tsx` stays for
the sheet's content.

## 10. The selection colour is an editor affordance

Kevin's directive (d) asked that the canvas boxes turn blue so they stop blending into the
background. The orchestrator's ruling 1 over SPEC-4 0.3 places that colour outside the brand:
`--pt-select` (`#1a73e8` in the light appearance, `#3d86f0` in the dark) and `--pt-guide`
(`#d6336c`, `#f0397a`) are the only additions to `packages/chrome/src/tokens.css`. The readers are
the canvas selection ring, the eight resize handles and the rotation handle with its stem, the
marquee, the hover outline, the crop frame and its handles, the group box and the selection chip
(`Overlay.css`, `Marquee.css`) and the snap guides (`Guides.css`). The remote collaborator outlines
keep round three's six hues; the exports, the deck content, the menus, `/home`, the card and the
README stay paper and ink. The chrome lint's `select` and `guides` scopes
(`packages/lint/src/chrome.ts`) are the allow list: a border or an outline in either colour
anywhere else is a finding.

Each value holds at least 3:1 against both the paper and the ink of its appearance (WCAG 2.2
SC 1.4.11, section 12), so a ring reads on a white slide and on a dark photograph whichever
appearance the chrome is in; the chip's text holds 4.5:1 (SC 1.4.3). The numbers are in section
12; `SELECTION_COLORS` in `brand.ts` records the values and `brand.test.ts` computes the ratios.
The screenshot pair before and after, on a dark photograph and on a white slide, is
`docs/gslides-parity/build-4/b1-selection/`.

## 11. The CLI banner and the MCP name

`turboslide --version` (a flag parsed in `apps/cli/src/cli.ts` before the command table, handled by
`apps/cli/src/commands/banner.ts`; B1's day 3) prints `markBlocks(8)` beside the word, the version,
the hosted address, the action count from `ACTION_IDS.length` and `effects backend:
<describeBackends().selected>`, which says what this machine runs (`native` on a checkout that
built the addon, `typescript` on a Vercel build until SPEC-4 0.38 lands); `turboslide info` prints
the same header before the deck facts. No colour is used, so the banner is byte identical with
`NO_COLOR=1`. The block glyph, computed from `brand.ts` on 2026-09-14:

```
████████  Turboslide <version>
████████  https://turboslide.vercel.app
█    ███  <n> actions, effects backend: <selected>
█▄▄▄▄███  checkout <path>
```

`packages/mcp/src/server.ts` keeps `SERVER_NAME` `turboslide` and the title "Turboslide"; its
`INSTRUCTIONS` gain one sentence naming `/home` and `/llms.txt` (SPEC-4 0.18). The agent
manifest's `name` and the four skill names are unchanged: the identity adds nothing to a protocol
name.

## 12. Accessibility record

Contrast is computed by the WCAG relative luminance formula on the token values
(`relativeLuminance` and `contrastRatio` in `packages/theme/src/brand.ts`; every ratio below was
recomputed with those functions on 2026-09-14 and matches `brand.test.ts`), against two success
criteria of WCAG 2.2, read on 2026-09-14 by this document's author:

- SC 1.4.3 Contrast (Minimum), https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html:
  text and images of text at least 4.5:1, large scale text at least 3:1, and "Text that is part
  of a logo or brand name has no contrast requirement" (the logotype exemption). The page names
  itself "Understanding Success Criterion 1.4.3: Contrast (Minimum)" under the WCAG 2.2
  Understanding Docs. Proposal 3 read the same page on 2026-09-13.
- SC 1.4.11 Non-text Contrast, https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html:
  visual information required to identify user interface components and states, and parts of
  graphics required to understand the content, at least 3:1 against adjacent colours, with the
  exceptions for inactive components, user agent styled components and graphics whose
  presentation is essential. The page names itself "Understanding Success Criterion 1.4.11:
  Non-text Contrast" under the WCAG 2.2 Understanding Docs.

| Pair                                                         | Light   | Dark    | Where                                                                                                       | Criterion                    |
| ------------------------------------------------------------ | ------- | ------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `--pt-ink` on `--pt-paper`                                   | 20.14:1 | 17.97:1 | Headings, body, the mark on its plate                                                                       | 1.4.3, passes 4.5:1          |
| `--pt-ink-2` on paper                                        | 10.88:1 | 10.59:1 | Captions, the fact line, source lines, secondary copy                                                       | 1.4.3, passes 4.5:1          |
| Ink on `--pt-plate` composited (`#f6f6f6`)                   | 18.64:1 |         | Commands in hairline boxes                                                                                  | 1.4.3, passes 4.5:1          |
| `--pt-panel-text` on `--pt-panel-ink`                        | 14.69:1 | 14.69:1 | The present toolbar (the 0.87 white composited on `#101010` is `#e0e0e0`; SPEC-4 1.12 rounds it to 14.41:1) | 1.4.3, passes 4.5:1          |
| The tile's frame (`#656565` on paper, `#888887` on ink)      | 5.83:1  | 5.68:1  | A graphical object                                                                                          | 1.4.11, passes 3:1           |
| The frame against Chrome's tab strips (`#dee1e6`, `#202124`) | 4.45:1  | 4.54:1  | The tile's edge on both strips                                                                              | 1.4.11, passes 3:1           |
| The paper plate against Safari's dark strip                  | 15.2:1  |         | The tile reads without its frame (proposal 3 section 6)                                                     | 1.4.11, passes 3:1           |
| `--pt-titanium` on paper                                     | 3.25:1  | 6.20:1  | Never text under 19 px on the new surfaces                                                                  | 1.4.3 large text only        |
| `--pt-select` on `#ffffff`                                   | 4.51:1  | 3.58:1  | The selection ring on a white slide                                                                         | 1.4.11, passes 3:1           |
| `--pt-select` on `#070707`                                   | 4.47:1  | 5.63:1  | The selection ring on a dark photograph                                                                     | 1.4.11, passes 3:1           |
| `--pt-guide` on `#ffffff`                                    | 4.62:1  | 3.77:1  | A snap guide on a white slide                                                                               | 1.4.11, passes 3:1           |
| `--pt-guide` on `#070707`                                    | 4.36:1  | 5.34:1  | A snap guide on a dark photograph                                                                           | 1.4.11, passes 3:1           |
| The selection chip's text on `--pt-select`                   | 4.51:1  | 5.63:1  | Paper text on the light blue, ink text on the dark blue                                                     | 1.4.3, passes 4.5:1 at 13 px |

Rules (SPEC-4 1.12): the smallest text on `/home` is 13 px; the hero plate is opaque paper, so no
heading sits on cells; a two tone crop used as a figure carries `role="img"` and one sentence, a
decorative twin `aria-hidden="true"`; the mark's alt text is "Turboslide" and the link's
`aria-label` "Turboslide home"; every button and link has a visible focus outline
(`.pt-ib:focus-visible`, 1 px ink; links a 2 px offset); nothing on `/home` moves except the
`.pt-ib` colour transitions the tokens already define, and the reduced motion block zeroes them;
the appearance control names the appearance it switches to; `theme-color` follows the stored
theme; every control carries the Tooltip primitive; the numbers use `tabular-nums`. The verifier
reads the 20 px print bar raster and the 24 px title row raster at 1x and 2x for soft edges
(SPEC-4 0.50); the 24 px mark has integer edges by arithmetic (1.5 units per pixel puts the window
at 3, 12, 15 and 21 px).

## 13. Light and dark

Both appearances are first class; dark is the stored default (`THEME_BOOT_SCRIPT`, the `gt-theme`
key). Every identity asset exists in both: twins for pictures, `currentColor` for the mark, the
scheme block for the tile, the two `theme-color` values. The tab icon follows the operating system
while the page follows its stored theme (R01 6.4 item 17). The README's images are the dark twins
because GitHub's ground is light (R01 6.9 item 33), inside a `<picture>` whose light source is the
light twin for a reader with GitHub's dark theme.

## 14. The build script and its records

`node scripts/build-brand.ts` (also `pnpm build:brand`; `pnpm build:brand -- --check` for the
check) runs through Node's type stripping with no new dependency: sharp, pixelmatch and
playwright-core are in the catalog. Its steps (SPEC-4 1.5):

1. Import `markBits` and `markPath` from `@turboslide/theme/brand`; write the SVG sources under
   `packages/theme/brand/` (`mark.svg` at 64 cells on a 512 unit box, `mark-small.svg` as the 16
   unit path, `icon-tile.svg` with the scheme block).
2. Rasterize each PNG at its target size on its own cell grid, the paper tile for 16, 32 and 48,
   the ink tile for the touch and manifest icons, the paper plate for the `icon-dark-*` inverse.
   The two colour PNGs are written by `encodePng1` (`packages/effects/src/png1.ts`) with the
   theme's exact palette (`#070707` and `#f2f2f0` on the dark twin, `#ffffff` and `#070707` on the
   light), so the bytes are deterministic; the touch icon and the monochrome icon by sharp.
3. Write `favicon.ico` with three 32 bit BMP entries and AND masks (the design copy's writer round
   trips in Pillow with zero differing pixels).
4. Write the maskable icons (the mark inside the 40 percent safe circle), the monochrome icon,
   `manifest.webmanifest` and `robots.txt` from `site.ts`.
5. Under `--capture` (B1's day 2): `turboslide material capture paper:liquid-metal` with the
   recipe of `hero.recipe.json`, the anchor scan of SPEC-4 0.7 over 0 to 10 s in 500 ms steps
   choosing the frame with the fewest lit cells under `PLATE_BOXES.opener`, the cut at black 160,
   white 250, gamma 1.5 at 2 px cells, the light twin as `invertBits` of the dark, and the check
   that the two twins' ink fractions sum to 1.0 per frame; frame one becomes `hero-{dark,light}.png`,
   frames two and three `figure-*` and `notfound-*`, and the card's 10 px cell screen
   `og-screen-*`. The twins are committed assets with their recipe: byte identity holds only on a
   Mac with ANGLE Metal, so `--check` compares them by bytes against the committed files.
6. Render `og-template.html` to `og/turboslide.png` through `@turboslide/headless` at 1200 by 630
   and device scale factor 1; fail over 1 MB; compare under `--check` only when the local browser
   is the `chromium-1217` build.
7. Write `brand-manifest.json` (path, bytes, sha256 per output) and `mark-geometry.json` (per
   size: the cell size, the lit cells, the colour count read back from the PNG); under `--facts`
   write `packages/theme/brand/facts.json` with the counts of SPEC-4 0.25 from the tree (landed
   on 2026-09-14: 169 actions, 146 MCP tools, 153 OpenAPI paths, 21 layouts, 135 shape presets,
   17 materials, 31 check steps, 3,369 parity rows, the export's worst page mismatch, the licence,
   and the measured rows of the verifier's baseline run with their date).
8. `--check`: rebuild into a temporary directory and compare (pixels for PNGs and the ICO's
   decoded entries at threshold 0, bytes for text), assert the facts of SPEC-4 6.4 (three ICO
   entries at 16, 32 and 48 with three colours each; the scheme block and `crispEdges` in
   `icon.svg`; the 180 px opaque touch icon; two colours on the manifest and dark icons with the
   maskable marks inside the safe circle; alpha only on the monochrome icon; the manifest's
   `start_url` and one purpose per icon; the twins' palette and ink fraction sum), and exit 1
   naming the first path that differs.

`--check` is `pnpm check` step 29 and ran green at merge 1 ("16 files match the manifest, the
rebuild and the facts of SPEC-4 6.4"). `apps/studio/src/brand-files.test.ts` (B1's day 5) asserts
the same file list exists with the manifest's sizes, so a deleted icon fails `pnpm test` before
the build runs. Edit the generator, never a generated file.

## 15. Repository metadata

The GitHub repository's description, topics and social preview are Kevin's manual step (SPEC-4
section 8 decision 14; the orchestrator's account boundary: no sign up, no paid resource, no DNS
change). The description and topics refresh may run through `gh repo edit` in the ship step; the
social preview image is an upload in the repository settings, which no script can do.

The description, exact:

```
Turboslide: an agent native slides editor with Google Slides' behaviours, a canvas on every slide and a pixel identical PowerPoint export
```

The topics, exact, ten of them:

```
slides, presentations, google-slides, pptx, tanstack-start, mcp, agents, bayer-dither, paper-shaders, rust
```

The `rust` topic is true of the tree (the crate `crates/turboslide-native` and its parity test).
It licenses no sentence claiming the studio is built on that language: SPEC-4 0.26 forbids that
phrase on every surface, and no document in this repository writes it.

Read on 2026-09-14 with `gh repo view Kevin-Liu-01/Turboslide`: the description is "Agent native
slides editor with Google Slides' structure and behaviours, a canvas where everything moves,
shader materials and dithers, and pixel identical PPTX export."; the topics are `agent-native`,
`canvas-editor`, `cli`, `design-system`, `dithering`, `export`, `google-slides`, `mcp`,
`mcp-server`, `powerpoint`, `pptx`, `presentation-editor`, `presentations`, `react`, `shaders`,
`slides`, `tanstack-start`, `typescript`, `vercel`, `vite`; the homepage is the pre hosting round
address `https://studio-delta-six-40.vercel.app`, which should become
`https://turboslide.vercel.app`. The commands for the ship step, from the repository root with
`gh` logged in as Kevin:

```
gh repo edit Kevin-Liu-01/Turboslide --description "Turboslide: an agent native slides editor with Google Slides' behaviours, a canvas on every slide and a pixel identical PowerPoint export" --homepage https://turboslide.vercel.app
gh repo edit Kevin-Liu-01/Turboslide --remove-topic agent-native,canvas-editor,cli,design-system,dithering,export,mcp-server,powerpoint,presentation-editor,react,shaders,typescript,vercel,vite
gh repo edit Kevin-Liu-01/Turboslide --add-topic agents,bayer-dither,paper-shaders,rust
```

The second command removes the topics that are not in the list of ten; the six that are already
set (`slides`, `presentations`, `google-slides`, `pptx`, `tanstack-start`, `mcp`) stay. Kevin may
keep more topics; the ten are the identity's.

The social preview file is `apps/studio/public/og/turboslide.png` (section 6), uploaded by hand:
the repository's Settings tab, the "Social preview" section, Edit, then "Upload an image...".
GitHub's page "Customizing your repository's social media preview", read on 2026-09-14, says the
image "should be a PNG, JPG, or GIF file under 1 MB in size" and recommends "at least 640 by 320
pixels (1280 by 640 pixels for best display)"; the card is 1200 by 630 and the build fails over
1 MB, so the same file serves the card and the preview. GitHub crops the preview to 2:1, which
the card's 48 px safe margin allows (R02 2.5).

## 16. The alternates

The build is parameterised on `packages/theme/brand/` and `packages/theme/src/brand.ts` (SPEC-4
0.10, 0.11, 0.51), so a different mark costs the brand builder's files and nothing else: the tile,
the tokens, the build, the page and the plan stand. Two judges chose proposal 1 (47 and 45 points);
one chose proposal 2 made monochrome (47 against 46 for proposal 1); proposal 3 scored 43 and 44.
Kevin can override the pick (SPEC-4 section 8 decision 1); the candidates by name, each with its
generator in the repository:

| Candidate                                                         | Form                                                                                                                                                                                                                                           | Generator and previews                                                                                                                |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Proposal 1, the dither mark (shipped)                             | Section 1: the square less the plate window, the density field through the deck's Bayer permutation                                                                                                                                            | `docs/gslides-parity/design-4/dither/mark.mjs` (moved into `brand.ts`), `dither/previews/mark-sizes.png`, `favicon-tab-strips.png`    |
| Proposal 2, the slide frame and T with the ramp panel (J2's pick) | A 16:9 frame for the slide, its top edge thickened into a T's crossbar, the stem dividing the slide into a paper panel and a panel carrying the deck's dither ramp (`rampInk`), 317 cells lit on the 64 unit master drawing                    | `design-4/shader/tools/make-mark.mjs`, `shader/previews/marks-sheet.png`, `confusion-sheet.png`, `shader/previews/mark-geometry.json` |
| Proposal 3, the Inter T tile with the dissolving foot             | The letter T of the wordmark, measured from `InterVariable.woff2` at weight 500 (cap height 1490 of 2048 units, the T 1170.5 wide, the stem 223), the foot of the stem dissolving into paper through the 8 by 8 screen; solid from 16 to 48 px | `design-4/type/tools/build-marks.mjs`, `type/mark.svg`, `mark-small.svg`, `type/previews/tab-strip.png`, `marks-sheet.png`            |

What the round kept from the alternates: proposal 3's framed tile as the tab icon (section 2) and
its contrast method (section 12); proposal 2's build records (`brand-manifest.json`,
`mark-geometry.json`, the outlined wordmark) and the anchor scan that picks the hero frame. The
re-rendered variant sheets with a measured reason each (`packages/theme/brand/previews/variants/`)
landed with the previews (the size sheet, the 8x upscales at 16 and 32 px on paper and on the
tile, the tab strips at 1x and 2x, the confusion sheet, the hero scan, the raster edge check) on
2026-09-14 while this document was being written.

Decisions recorded for Kevin beside the pick (SPEC-4 section 8): no accent anywhere in chrome or
on `/home`; the still hero against the live monochrome mount; the three colour tile at 16 px and
the solid 32 and 48 px ICO entries against a cellular 48 px lockup mark; the title row's mark to
`/decks` and the app bar's word to `/home` with `start_url` `/home`; the `monochrome` manifest
icon kept.

## 17. What stays for round five

Recorded here without naming a round on any product surface (SPEC-4 section 7): the live
monochrome hero (`paper:liquid-metal` in the `ink-paper` preset mounted after the largest
contentful paint on an idle callback over the still twin, never under reduced motion, on a hidden
document, without WebGL2 or under 900 px), only after the shader split has landed and a second
measurement shows `/home` under 600 KB of JavaScript with the deferred chunk counted; the per deck
card `/og/deck/:deckId.png` with `s-maxage` per revision and a budget row; a Turboslide branded
second sheet theme and what a blank presentation's sheet corner shows (recommended against); a
320 px twin variant for the filmstrip's clones.

## 18. Sources

- `docs/gslides-parity/SPEC-4.md` sections 0 (0.2 to 0.23, 0.50 to 0.52), 1, 5 and 8, read in
  full on 2026-09-14.
- `docs/gslides-parity/design-4/proposal-1-dither.md` sections 1.3, 5 and 6; `proposal-2-shader.md`
  section 1.1; `proposal-3-type.md` sections 1.1, 1.2 and 6; the judges' totals as SPEC-4's
  preamble records them.
- `docs/gslides-parity/research-4/01-brand-references.md` sections 5, 6.4, 6.9 and 8;
  `02-icon-favicon-og-production.md` section 8 (the cache rules).
- `docs/gslides-parity/build-4/b1.md` section 1 (what landed on day 1, the readings, the contrast
  numbers, the screenshot record).
- The tree on 2026-09-14: `packages/theme/src/brand.ts`, `packages/theme/brand/site.ts`,
  `packages/theme/brand/mark-geometry.json`, `packages/chrome/src/{brand.css,tokens.css}`,
  `apps/studio/public/{brand-manifest.json,manifest.webmanifest,robots.txt}`,
  `apps/studio/src/routes/__root.tsx`.
- https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html and
  https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html, read 2026-09-14.
- https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview,
  read 2026-09-14.
- `gh repo view Kevin-Liu-01/Turboslide --json description,repositoryTopics,homepageUrl`, run
  2026-09-14.
