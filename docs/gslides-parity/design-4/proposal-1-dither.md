# Proposal 1, the dither is the identity

Design-4 proposal 1 of 3 for the Turboslide identity and the /home page, written 2026-09-13 against `main` at 28cb63b (the checkout at the time of writing; the round's brief names 61b16e4, and none of the files this proposal reads changed between the two). Brand designer 1, angle "key dither": the mark and every brand surface are built from the 8 by 8 Bayer matrix and two tones; shaders appear only as dithered captures; the result is monochrome, technical, agent friendly and reads at 16 px.

Everything in this document exists as a file under `docs/gslides-parity/design-4/dither/` and was produced by the scripts in that folder from the repository's own arithmetic (`packages/effects/src/bayer.ts`, `pipeline.ts`, `png1.ts`, `metrics.ts`), rendered with the repository's sharp 0.35.0, playwright-core 1.62.1 and Chrome for Testing 147 (`chromium-1217`), and checked with Pillow 12.3.0. Nothing was installed and nothing was committed. Rules followed: plain technical English, sentence case, no em dashes, no metaphors, no trailing periods on headings, complete sentences, Title Case on buttons only. Every external fact is cited through the research-4 report that read it, with the report's section; the sources and their dates are in those reports.

## 0 Decisions in one page

1. The mark is a slide with its title plate cut from a dithered picture: a square on an 8 by 8 grid, the body less a window at columns 1 to 4 and rows 4 to 6, the body filled by a density field that is solid at the window's edge and falls to 25 percent at the far corner, thresholded by the deck's own Bayer permutation. At 16 px the field collapses to the solid form (a square with a window), so the favicon is two colours and one path; from 48 px the cells appear. One construction, every size (section 1).
2. The favicon set is research-4 report 02's list, built: `favicon.ico` with 16, 32 and 48 px BMP entries (15,086 bytes, decoded by Pillow with 0 differing pixels), `icon.svg` with a titanium base and a `prefers-color-scheme` block, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, the two maskable icons, the monochrome icon and `manifest.webmanifest` (section 2).
3. No accent. Every `--pt-` token keeps its name and value; the identity adds ten `--ts-` tokens for the dither cell, the mark size, the /home type ladder, the hero's hold time and the plate (section 3).
4. Dithers appear where a picture would be: the mark from 48 px, the /home hero, empty states, the Not found page, anonymous avatars, the progress fill's edge, the README hero and the Open Graph card. They never appear on menus, toolbars, panels, dialogs, text, icons, controls, thumbnails, the workspace, the present surround or the customer's sheet (section 3.6).
5. Shaders appear only as dithered captures. The /home hero is three frozen frames of `paper:liquid-metal` (shape `none`) at 4.0, 5.5 and 7.0 seconds, cut through the two tone screen at 2 px cells and cut in sequence every four seconds; no WebGL, no shader library and no gray fade on the page (section 4).
6. The /home page is research-4 report 05's nine sections with its copy, the fifteen README screenshots, the measured numbers of reports 03 and 04, and the honest closing sentence about what is still slow. The mock is `dither/home.html` with the real token file; the 1440 px full page screenshot is `previews/home.png` (section 4).
7. The chrome changes are five: the title row's mark at 24 px solid as a router Link to /decks, the /decks app bar lockup at 16 px and 22 px type, the Not found page and empty states with a two tone figure, the print bar's 20 px mark, and the CLI banner as four lines of block characters. The MCP server keeps its name `turboslide` and its title "Turboslide" (section 5).
8. Accessibility: ink on paper 20.1:1, paper ink on ink 18.0:1, `--pt-ink-2` 10.9:1 and 10.6:1; titanium is never body text; the mark's alt text is "Turboslide" and every decorative dither is `aria-hidden` or `role="img"` with a sentence; reduced motion stops the hero on frame one (section 6).
9. Ownership: a brand builder, a home builder, a perf builder, an integrator and a verifier, with the files each one owns and the checks that accept the build (section 7).

## 1 The mark

### 1.1 What it is

A slide, and the plate cut from it. On a 1600 by 900 sheet the GT openers put a dithered picture under the whole slide and a title plate lower left, and `plateClear` measures that no lit cell intrudes into the plate (`packages/effects/src/metrics.ts`, `PLATE_BOXES.opener`). The mark is that composition at its smallest: a square body, a rectangular window in its lower left where the plate would be, and the picture as the Bayer screen. The window is the ground showing through, which is the Prototemplate rule for corner notches ("the ground showing through", `Prototemplate/DESIGN.md` section 2; research-4 report 01 section 6.3 item 14 allows it as construction).

The construction, in `dither/mark.mjs`:

- Grid: 8 by 8 cells. The window is columns 1 to 4 and rows 4 to 6 (`WINDOW = [1, 5, 4, 7]`), so the body keeps a one cell rail on the left and the bottom and the window is 4 by 3 cells. The window is 50 percent of the width and 37.5 percent of the height, at 12.5 percent from the left and the bottom.
- Field: `field(u, v) = 1 - 0.75 * (distance from the window rectangle / distance of the far corner)`, so the density is 1 along the window's edge (the plate edge stays crisp) and 0.25 at the top right corner (the far corner is still marked by cells; 0.5 would be a checkerboard and 0 would dissolve the square's silhouette).
- Threshold: the deck's own permutation and test, `tone > (bayer8(y, x) + 0.5) / 64` (`packages/effects/src/bayer.ts`), so the mark's cells are the same cells the pipeline would light for that field.
- Cell count N per side: a multiple of 8. At N = 8 every body cell is ink (the solid form). N = 16 gives 2 px cells at 32 px, N = 24 at 48 px, N = 32 at 64 px, N = 64 at 512 px with 8 px cells. A raster is always drawn at its own cell grid and never resampled, which is report 02's measured rule (section 5.4: a cell under 1 output pixel is a gradient, a cell of 2 output pixels reads as a screen).

The solid form is one path on a 16 unit box: `M0 0h16v16H0z M2 8h8v6H2z`, even odd. It is what the favicon, the title row mark and the terminal banner draw.

### 1.2 Why this form

- It is the product. The composition is the one every GT opener uses and the one the exporter measures (`plateClear`), so the mark explains the pipeline before the word does.
- It survives 16 px because the small form is solid and has two features at 2 px each (the rail under the window and the rail beside it), which is report 02's threshold for a 16 px drawing (section 5.2: strokes of at least 1 px, 2 px preferred).
- It carries the dither at 48 px and above without any second drawing: the field is the identity, the solid form is its 50 percent threshold.
- It is not a triangle, a cube, a Z, a roundel, a chevron pair or a speed line, and it is monochrome, so none of report 01's confusion cases apply (section 6.3 item 12). Google's presentation icon is a portrait rectangle with a centred white rectangle and a colour; this is a square with a lower left window and no colour (Google's trademark rule against copying the look and feel is report 01 section 2.16, GO1).
- It reads as a form before a letter, so a page in Japanese or Arabic carries it without a Latin word beside it (report 01 item 13).

### 1.3 The sizes, measured

| Use | Size | N | Cell | File | Bytes | Colours |
| --- | --- | --- | --- | --- | --- | --- |
| Favicon, title row, terminal | 16 px | 8 | solid | `previews/mark-16-paper.png` | 111 | 2 |
| /decks app bar, /home navigation | 16 px | 8 | solid | `mark-small.svg` | 544 | currentColor |
| Title row | 24 px | 8 | solid (3 px cells) | `mark-small.svg` | | |
| ICO 32 entry, small lockups | 32 px | 16 | 2 px | `mark-32.svg`, `previews/mark-32-paper.png` | 3,074 and 220 | 2 |
| Wordmark mark, ICO 48 entry | 48 px | 24 | 2 px | `wordmark.svg` | 6,787 | |
| Not found, README stacked lockup | 64 px | 32 | 2 px | `previews/mark-64-paper.png` | 426 | 2 |
| Touch icon tile | 180 px tile, 128 px mark | 32 | 4 px | `icons/apple-touch-icon.png` | 1,397 | 2 |
| Manifest icons | 192 and 512 tiles | 40, 56 | 4 and 8 px | `icons/icon-192.png`, `icons/icon-512.png` | 367 and 1,123 | 2 |
| The full mark | 512 px | 64 | 8 px | `mark.svg`, `previews/mark-512-paper.png` | 38,590 and 8,345 | 2 |

Every preview PNG was checked for its colour count with sharp: the 16, 32 and 512 px marks contain exactly two colours (ink `#070707` and paper `#ffffff`, or paper ink `#f2f2f0` and ink), which is report 01's acceptance item 5.

The 180 px preview is the touch icon tile (a 128 px mark with 4 px cells on a 26 px margin) because 180 is not a multiple of 8 and the mark's cells must land on device pixels; iOS rescales and masks the tile anyway (report 02 section 2.2).

The previews for the judges: `previews/mark-sizes.png` (16, 32, 64, the 180 tile and 512 at half, on paper and on ink), `previews/mark-16-paper-8x.png` and `previews/mark-32-paper-8x.png` (nearest upscales), and `previews/favicon-tab-strips.png` (the 16 px icon on a light and a dark tab strip beside grey boxes standing for other sites' icons).

### 1.4 The wordmark and the lockups

`wordmark.svg`: the 24 cell mark at 48 px beside the word set at 66 px in Inter 500 with `cv11` and `ss01` and `letter-spacing: -0.025em`, a 16 px gap, the mark's bottom on the baseline and its top at the cap height (Inter's cap height is 1490 of 2048 units, 0.7275 em, so 66 px gives 48.0 px). The word measured 287.06 px wide in Chromium with the repository's `InterVariable.woff2`, and the file is 354 by 66 units. The word is live text in the SVG and everywhere in the product (report 01 item 5); the previews `previews/wordmark-paper.png`, `previews/wordmark-ink.png` and `previews/wordmark-paper-3x.png` were rendered by Chromium with that font.

The rule for a lockup at any size: the mark's height is the cap height of the word (0.7275 em), the gap is one third of the mark, the mark is solid below 48 px and cellular from 48 px with 2 px cells at 48 to 64 px, 4 px cells at 128 to 256 px and 8 px cells at 512 px. The horizontal lockup at 22 px type therefore uses the 16 px solid mark (the /decks app bar, the /home navigation and footer); the stacked lockup for the README hero is the 64 px mark over the word at 66 px (`previews/lockup-stacked-ink.png`). A comparison of solid, 16 cell and 32 cell marks at 44 px type on both device scale factors is what fixed the 48 px threshold: at 32 px the 16 cell mark shows the 8 by 8 tile twice across and reads as noise beside 44 px letters; at 48 px three tiles across read as a picture.

Never: a gradient, a second colour, a 2.5D rendering, a rounded corner, an outline, a rotation, or "Turbo" set apart from "slide". The word is "Turboslide", one capital (report 01 section 6.1). `PROPER_NOUNS` in `packages/theme/src/copy.ts` gains "Turboslide".

### 1.5 The GT mark

The GT mark stays where it is content of the `gt-ink-paper` theme: the sheet's wordmark and counter, the `mark` block, the closing plate, the icon picker's `gt-mark` symbol, the GT template thumbnails and the Themes panel (report 01 section 6.5). It leaves the title row, the /decks app bar, the favicon, the README, the CLI banner and the Not found page. The sprite is unchanged.

## 2 The favicon set and the Open Graph card

### 2.1 The files, built

All under `dither/icons/`, produced by `dither/build-assets.mjs` from `mark.mjs` (the brand builder turns that script into `scripts/build-icons.ts` with the output under `apps/studio/public/`, report 02 section 6).

| Path | Size | Bytes | What it is |
| --- | --- | --- | --- |
| `favicon.ico` | 16, 32, 48 | 15,086 | Three 32 bit BMP entries with AND masks (report 02 section 6.3). Pillow lists `{(16, 16), (32, 32), (48, 48)}` and every entry decodes to 0 differing pixels against its source PNG |
| `favicon-16.png`, `-32`, `-48` | | 116, 228, 303 | The ICO's sources: the mark in titanium on transparent, solid at 16, 2 px cells at 32 and 48 |
| `icon.svg` | 16 unit grid | 628 | The solid form; a `<style>` with the titanium base and `@media (prefers-color-scheme: light)` ink, `dark` paper ink |
| `apple-touch-icon.png` | 180 | 1,397 | An opaque ink tile with the paper ink mark at 128 px, 4 px cells, no corners of its own |
| `icon-192.png`, `icon-512.png` | 192, 512 | 367, 1,123 | Manifest `any` icons: the ink tile, the mark at 160 and 448 px |
| `icon-mask-192.png`, `icon-mask-512.png` | 192, 512 | 323, 841 | Manifest `maskable` icons: the mark at 96 and 256 px, inside the 40 percent safe circle (a 256 px square's corner is 181 px from the centre, the circle's radius is 205) |
| `icon-mono-512.png` | 512 | 7,460 | The solid form as alpha, for the `monochrome` purpose |
| `manifest.webmanifest` | | 973 | `name`, `short_name`, `start_url: /home`, `display: standalone`, `background_color` and `theme_color #070707`, the five icons with one purpose each |

Why titanium for the tab icon's base: Safari renders an SVG favicon's base colours and ignores the media block (report 02 section 2.1, T2), and an ICO has no scheme. An ink mark disappears on a dark strip and a paper mark on a light one, and my mark is a figure with a window, so no two colour drawing reads on both strips as Linear's does. Titanium `#8a8f98` is the token the sheet already uses for the same reason (the GT wordmark on every slide is titanium so it sits on both twins, `packages/render/src/stage.ts`). Measured contrast: 3.25:1 on a white active tab, 3.71:1 on Chrome's dark strip `#35363a`, 4.95:1 on `#202124`, 2.48:1 on Chrome's light inactive strip `#dee1e6`. Where the media block is honoured (Chrome, Firefox, report 02 section 2.1) the icon is ink on light and paper ink on dark at 20:1 and 18:1. `previews/favicon-tab-strips.png` shows both cases on both strips.

The head tags are report 02 section 4.1 verbatim, with two values from this proposal: `theme-color` is `#070707` and follows `--pt-paper` when the theme changes, and `start_url` is `/home`. The cache rules of report 02 section 8 apply unchanged.

### 2.2 The Open Graph card

`previews/og.png`, 1200 by 630, 37,716 bytes, rendered by Chromium from `dither/og.html` at device scale factor 1 (report 02 section 6.4: the card comes from the product's own raster path and no second text engine is involved). It is the mark at card size: the picture is the hero's 7.0 second frame through the screen at 10 px cells (`assets/og-screen-dark.png`, 120 by 63 cells, 1,956 bytes, 22.2 percent lit), so a 552 px feed card still shows 4.6 px cells and a 360 px unfurl 3 px, both above report 02's 2 px floor (section 5.4); the plate is cut from it at the mark's proportions (left 150 px, width 600, bottom 79, height 236) and carries the 48 px mark, the word at 66 px and the one sentence; the address sits top left on its own plate. Nothing that matters is within 48 px of an edge, so X's 2:1 crop keeps it (report 02 section 2.5).

The per deck image of report 02 section 7 (the deck's first slide at 1120 by 630 with an 80 px column) gains the same plate rule: the column is `--pt-panel-ink` with the 48 px mark, and no text is drawn in the function.

`og:image:alt`: "The Turboslide mark and name on a plate cut from a two tone dithered liquid metal frame".

## 3 The brand tokens

### 3.1 What stays

Every `--pt-` token in `packages/chrome/src/tokens.css` keeps its name and value, including `--pt-radius: 6px` as the one corner (the Search pill and the segmented controls) and the six durations. `PORTED_FROM.json` and `turboslide lint --chrome` stay valid. `git diff` on the token file is empty in the accepted build (report 01 acceptance item 9).

### 3.2 What arrives

Ten `--ts-` tokens, declared in `apps/studio/src/styles.css` beside the `--pt-` import, read by the /home page, the Not found page and the empty states. They read the `--pt-` tokens and never redefine them.

| Token | Value | What it is |
| --- | --- | --- |
| `--ts-cell` | `2px` | One dither cell at 1x. Twins are 1600 by 900 with 2 px cells; a surface shows a twin at that size and crops it, never scales it |
| `--ts-mark` | `24px` | The title row mark |
| `--ts-h1`, `--ts-h2`, `--ts-h3` | `56px`, `32px`, `20px` | The /home ladder, weight 500, `-0.025em` on h1 and h2, `-0.01em` on h3; scaled from the sheet's `LADDER` (`packages/theme/src/tokens.ts`) under the 500 weight cap. At 760 px and below h1 is 40 and h2 26 |
| `--ts-lead`, `--ts-body`, `--ts-small` | `20px`, `15px`, `13px` | The /home body ladder; 13 px is the chrome size and the smallest text on the page |
| `--ts-hero-hold` | `4000ms`, `0ms` under reduced motion | How long a hero frame holds before the cut to the next |
| `--ts-dur-cut` | `0ms` | The change between two 1-bit frames is a cut; a fade between them produces gray |
| `--ts-plate` | `var(--pt-paper)` | The plate is the ground showing through; it draws no rule |

Radii: none new; the mark, the plates, the cards and the hero are square. Motion: the six `--pt-dur-*` tokens and the hero hold are the whole vocabulary; nothing on /home animates on load; the hero's three frames change by a cut and never by a fade; `prefers-reduced-motion` sets the hold to 0 ms and the page shows frame one; a hidden tab pauses the cut.

### 3.3 The one accent decision

Against. Prototemplate is monochrome by directive (a single face, four absolute colours, one spectral accent per page as a controlled edge, `Prototemplate/DESIGN.md` section 1), Turboslide's chrome draws from the nine sheet tokens and `--pt-panel-ink` only (SPEC 2.2), and every reference in report 01 that reads as technical and fast is monochrome first (section 0 item 1). The dither is the accent: it is where the eye goes, it carries tone in two colours, and adding a hue beside it would make the hue the identity and the dither a texture. GT blue `#2f5ce0` remains available inside a captured frame on a slide through the `brand-blue` preset (`packages/materials/src/presets.ts`) and never reaches chrome or /home. The four semantic hues stay inside the sheet on icons.

### 3.4 Light and dark

Both appearances are first class and dark is the stored default (`THEME_BOOT_SCRIPT`, `packages/viewer/src/theme.ts`). Every dithered asset is a twin pair: the light twin is the negative of the dark one, cell for cell (`invertBits`, `packages/effects/src/image.ts`), encoded through the pipeline's 1-bit encoder with the exact ink and paper of each theme (`encodePng1` with a two entry palette, `png1.ts`). The mark is `currentColor`, so it needs no twin. The tab icon follows the operating system while the page follows its stored theme, which report 01 accepts (section 6.4 item 17); `theme-color` follows the page.

A note the verifier should keep: the first light twins of this proposal were encoded with the palette reversed and were visually identical to the dark twins; the mistake showed only in the light screenshot. The acceptance check in section 7.3 therefore compares the ink fraction of the two twins, which must sum to one (measured now: dark 0.7083 ink, light 0.2917 ink for the 7.0 second frame).

### 3.5 Type

Inter is the one face. Display is weight 500 with `cv11` and `ss01` at every size; body is weight 400; monospace (`--pt-mono`) is an instrument for commands, paths and ids inside hairline boxes and never the voice (report 01 section 4.3). Numbers are tabular (`tnum`) in the numbers strip and the speed rows. Titanium is never used for text under 19 px; the fact line under the hero buttons and every caption are `--pt-ink-2`.

### 3.6 Where dithers and shaders appear, and where they never do

| Surface | Dither | Shader | The rule, as built |
| --- | --- | --- | --- |
| The mark at 48 px and above | Yes, the construction of section 1 | No | Solid below 48 px |
| /home hero | Yes: three captured frames as twins at 2 px cells, cut every 4 s | Captured only; no live mount on /home | Section 4.2; a still frame under reduced motion |
| Empty states (no presentations, empty trash, no results) | Yes, a 320 by 180 crop of a twin at 1:1 in a `--pt-edge` frame | No | Title, one sentence, one primary action; `chrome.html` |
| Not found | Yes, the 64 px mark (32 cells) | No | `chrome.html` |
| Anonymous avatars and presence chips | Yes, a 24 px ink square of 8 by 8 cells at 3 px whose tier is `hash(author) mod 48 + 8` | No | The name stands beside it in words; `chrome.html` |
| Progress | Yes, a length bar of ink cells whose leading 16 cells are the deck's ramp (`rampInk`, `packages/effects/src/ramp.ts`) | No | The track is one 1 px `--pt-hair-soft` line; the threshold map is fixed and the length moves |
| README hero and the Open Graph card | Yes | Captured only | Sections 2.2 and 5 |
| Present mode surround | No | No | Flat `--pt-panel-ink` (build deviation B6) |
| Menus, toolbar, panels, dialogs, snackbars, tooltips | No | No | The line law and 13 px text |
| Text, icons, form controls | No | No | Heroicons stay solid |
| Filmstrip thumbnails, layout tiles, the workspace around the sheet | No | No | A thumbnail shows the slide's pixels; the workspace is flat `--pt-plate` |
| The sheet | Only as content the user placed | Only as content | The identity never draws on the customer's slide |

Cells never shimmer: a dither in motion changes the tone under a fixed threshold map (the hero's three frames are three tone fields under one screen), and nothing re-seeds per frame (report 01 section 3.2 principle 5).

## 4 The /home page

### 4.1 The mock and its screenshots

`dither/home.html` (81,627 bytes) is static HTML that links the real token file `packages/chrome/src/tokens.css` by relative path, the studio's `InterVariable.woff2` by relative path, the fifteen README screenshots under `docs/readme/` by relative path, and the hero twins under `dither/assets/`. It stamps `data-theme` with the product's own rule (`gt-theme` in localStorage, default dark, `prefers-color-scheme` never consulted) and carries a Light and Dark button that writes the same key.

Screenshots by Playwright with Chrome for Testing 147 at device scale factor 1, `reducedMotion: reduce`, after `document.fonts.ready`:

| File | Viewport | Page height | Facts checked |
| --- | --- | --- | --- |
| `previews/home.png` | 1440, dark | 10,423 px | `document.fonts.check('500 20px Inter')` true; every image decoded; `--pt-ink` resolves to `#f2f2f0` |
| `previews/home-light.png` | 1440, light | 11,123 px | the same, `--pt-ink` `#070707`; the hero shows the light twins and the paper plate |
| `previews/home-390.png` | 390, dark | 20,049 px | no horizontal overflow (the first shot came out 470 px wide because the navigation links did not collapse; the mock now hides them under 760 px) |

Opening the mock from disk in a browser: Chrome loads the token file and the pictures from `file://` but blocks the font from another `file://` path, so start Chrome with `--allow-file-access-from-files` (what the shoot did) or serve the repository root over HTTP; otherwise the page falls back to Helvetica Neue.

### 4.2 The hero

The live page shows a 1600 by 900 two tone twin at its own cells (`background-size: 1600px 900px`, `image-rendering: pixelated`), cropped by the viewport to a 640 px band, with the plate lower left at the rail carrying the h1, the sentence, the three buttons and the fact line. Three frames cut in sequence every `--ts-hero-hold`; under reduced motion or a hidden tab the first frame stands.

The frames are real captures. A script mirroring `packages/materials/src/capture.ts` served `@paper-design/shaders` 0.0.78's dist from memory on a fixed origin through Playwright's request routing, mounted `liquidMetalFragmentShader` with `ShaderMount` at speed 0, minimum pixel ratio 2 and the 3200 by 1800 cap, set the frame to 4000, 5500 and 7000 ms (`MATERIAL_ANCHORS`), and screenshotted the canvas at 3200 by 1800 on ANGLE Metal (renderer string "ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Max, Unspecified Version)"). The recipe: `u_colorBack #000000`, `u_colorTint #ffffff`, `u_softness 0.05`, `u_shiftRed 0`, `u_shiftBlue 0`, `u_contour 0.6`, `u_repetition 3`, `u_distortion 0.07`, `u_angle 70`, `u_scale 1`, `u_shape none`. That is the deck's recorded liquid metal recipe (`LIQUID_METAL_DECK`, `presets.ts`) on the whole canvas instead of the diamond or the sphere, so it is the GT material family without repeating the Prototemplate and Glyphfield opener. Each frame then ran through `twoToneScreenTypeScript` (`pipeline.ts`, the reference stage order with the pinned Lanczos3) with autocontrast 0.5, black point 160, white point 250 and gamma 1.5, was scaled 2x nearest and encoded as 1-bit PNGs:

| Frame | Lit fraction (dark twin) | Dark twin | Light twin |
| --- | --- | --- | --- |
| 4000 ms | 0.3006 | `assets/hero-1-dark.png`, 14,428 bytes | `assets/hero-1-light.png`, 14,419 bytes |
| 5500 ms | 0.3075 | `assets/hero-2-dark.png`, 14,736 bytes | `assets/hero-2-light.png`, 14,721 bytes |
| 7000 ms | 0.2917 | `assets/hero-3-dark.png`, 14,480 bytes | `assets/hero-3-light.png`, 14,471 bytes |

The recipe, the renderer, the treatment and the anchors are recorded in `assets/hero.recipe.json`, the shape `material.capture` writes as a sidecar. `assets/hero-frame-continuous.jpg` is the 7.0 second frame before the screen, for the proposal only. The three lit fractions sit inside the GT twins' range of 2.4 to 43.6 percent (research-3 report 06 section 1.3); the tone sweep that chose them is in the scratchpad (`sheet-hero.png`, `sheet-hero2.png`: black 0 to 160, gamma 1 to 1.6, lit 0.29 to 0.59).

Why no live shader on /home: the angle says shaders appear only as captures; the three twins of one theme are 43.6 KB against the 1.12 MB `index` chunk that carries Paper's `ShaderMount` and 73 KB of GLSL on every route today (report 04 section 2.1); no GPU work runs on the product page; and the cut between frames is the only motion, which is the "cells never shimmer" rule. When the build lands, the builder runs `turboslide material capture paper:liquid-metal --uniforms <the recipe> --anchor 4000,5500,7000 --two-tone --plate lower-left` against a deck folder and copies the twins to `apps/studio/public/brand/`, so the page's frames come from the product's own action rather than from this proposal's script.

### 4.3 The sections and the copy

The nine sections of report 05 section 5, in its order, with its copy (section 6) and these changes:

- Hero: the sentence, the three buttons (New Presentation to `/new`, Open the GT Deck to `/deck/gt-brand`, GitHub) and the fact line are report 05's; the credit line "Material: liquid metal, Paper Shaders, three frames through the two tone screen" is added because the asset licence rule wants the credit on the plate (research-3 report 06 section 1.3).
- Numbers strip: the six figures of report 05 section 6.2.
- The product shot: `01-new-presentation.jpg` in dark and `13-editor-light.jpg` in light, framed in `--pt-edge` on `--pt-panel-ink`, then "Google Slides' frame, on every slide a canvas" with `06-canvas-rotation.jpg` and the three claims.
- What it does: the twelve cards of report 05 section 6.4 in a grid whose seams are one 1 px `--pt-hair-soft` gap, eight with screenshots and the Charts card with `03-insert-menu.jpg` (the Chart submenu), the Text, Tables and Quality gates cards with `i-list-bullet`, `i-squares-2x2` and `i-check-circle` from the theme sprite (report 05 named `i-bars-3-bottom-left`, `i-table-cells` and `i-check-badge`, which are not in `sprite-ids.json`); `05-filmstrip-menu.jpg` and `15-grid-view.jpg` follow as a captioned pair, so all fifteen shots are on the page.
- Dithers and shaders: report 05 section 6.5's three sentences and caption with `12-slideshow-dither.jpg`, then a three cell strip that is this proposal's argument: the continuous frame, the same frame through the screen at 1:1, and the mark at 128 px with the caption "The mark is the same construction: a slide, a plate cut from the picture, the screen filling the rest".
- Why it is fast: report 05 section 6.6's eight rows with the file that makes each true, the placeholder `[baseline: /home to /new, warm]` replaced by report 03's measured "858 ms from a hover on a home page card to a rendered editor sheet, measured on production on 2026-09-13" (section 1), and the Rust row extended by one sentence, "The hosted studio runs the TypeScript copy today", because report 04 section 3 finds the crate nowhere on production. The closing sentence names what is still slow with report 04's numbers (the home page at 2.8 s median and 8.7 s worst, cold thumbnails at seven to nine seconds, one slide at a time per instance).
- For agents: report 05 section 6.7's six rows with the commands in `--pt-mono` inside hairline boxes on `--pt-plate`.
- Compared with Google Slides: report 05 section 6.8's twelve rows including the rows where Turboslide has less.
- Footer: the four groups of report 05 section 6.9 and the closing line.

Every heading is sentence case without a period; every button is Title Case; no em dash, exclamation mark, eyebrow or metaphor word from `METAPHOR_WORDS` appears (a grep of the file for the em dash character and the list finds none).

### 4.4 The type, the seams, the responsive rule

The page uses the ladder of section 3.2 and nothing else. Every seam is one 1 px rule in one of the three roles (structural `--pt-hair` on section edges and the grid's outer border, row `--pt-hair-soft` between rows and cells, frame `--pt-edge` around screenshots), drawn once: the card grid and the numbers strip are grids with a 1 px gap over a `--pt-hair-soft` ground so no two cells draw the same line. Under 1100 px the speed rows drop to two columns and the numbers to three; under 760 px everything is one column, the hero is 520 px with the plate across the bottom, the four navigation links hide and the New Presentation button and the appearance button stay.

### 4.5 What the live route does that the mock cannot

- The buttons are router `Link`s with `preload: 'intent'`, so `/deck/gt-brand`'s loader runs on hover (report 03 section 3.1); `/new` is an `ssr: false` route whose editor graph the page should not carry, so the New Presentation link stays a document navigation and is the candidate for a Speculation Rules `prerender` once `/new` gates its session and watch loop on `document.prerendering` (report 03 section 3.1).
- The page is server rendered, indexable and stays out of `NOINDEX_ROUTES` (report 05 section 10); `head()` sets the title, the description and the Open Graph tags of section 2.
- The screenshots are copied to `apps/studio/public/home/` at build time with content hashes, and the hero twins to `apps/studio/public/brand/`, with `immutable` cache headers through `routeRules` (report 02 section 8).
- `scripts/hosted-smoke.mjs` gains a `/home` row (200, the hero sentence present) and `scripts/tooltip-audit.mjs` walks the page; every link and button on the mock already carries a `title` with its name and one sentence.

## 5 The app chrome changes

`dither/chrome.html` mocks each surface with the real tokens; `previews/chrome.png` (1280 px, dark) and `previews/chrome-light.png` are its shots.

1. The title row (`packages/chrome/src/TitleRow.tsx` line 273): `GtMark width={31} height={20}` becomes `TurboslideMark size={24}` (solid, 3 px cells on the 8 grid), inside a router `Link` supplied by the editor as a render prop so the chrome package stays free of the router and the 6.2 s document reload of report 03 section 1 goes away. The tooltip stays "Turboslide home" with its sentence ("Every presentation on this Turboslide", `menus/model.ts` line 471). `TurboslideMark.tsx` is a sibling of `GtMark.tsx` in `packages/chrome/src` that draws the solid path below 48 px and the cell rects from `markBits(N)` at and above it; `PORTED_FROM.json` records it as Turboslide's own.
2. The /decks app bar (`apps/studio/src/routes/decks.index.tsx` lines 530 to 537, `decks.css` `.ts-appbar-brand`): the mark at 16 px solid and the word at 22 px (cap height 16.0 px), one Link to /decks, gap 10 px; the tooltip "Turboslide. Your presentations." stays. The bar gains a plain link "About Turboslide" to /home at the right of the search pill, which answers report 05's open question 6 without moving the mark's target: the mark goes to the files page, the words go to the product page.
3. The Not found page (`__root.tsx` `NotFound`): the 64 px mark (32 cells), the heading, the sentence, New Presentation and Your Presentations as `.pt-ib` buttons. Empty states (no presentations, empty trash, no results) get a 320 by 180 crop of a hero twin at 1:1 in a `--pt-edge` frame, a title, one sentence and at most one primary action.
4. The present surfaces: the slideshow's surround stays flat `--pt-panel-ink` with no mark; the presenter window's document title becomes "<deck title>, Presenter view, Turboslide" as today and its head takes the icon set. The print bar (`/print/:deckId`, `print.css` `.ts-print-bar`) gains the 20 px mark before "Print settings and preview"; nothing else on the print surfaces changes.
5. The CLI banner: `turboslide --version` prints `markBlocks(8)` (four lines of U+2580, U+2584 and U+2588 from the same bitmap as the favicon) beside the word, the version, the hosted address, the action count and the effects backend `describeBackends().selected` names (`packages/effects/src/select.ts`); `turboslide info` prints the 16 cell variant (eight lines) beside the deck facts. No colour, so `NO_COLOR` changes nothing. The block text is in `chrome.html` and in this document:

```
████████  Turboslide 0.1.0
████████  https://turboslide.vercel.app
█    ███  105 actions, effects backend: typescript
█▄▄▄▄███  deck gt-brand at revision 31
```

6. The MCP server: `SERVER_NAME` stays `turboslide` and the title "Turboslide" (`packages/mcp/src/server.ts` line 108); the manifest's `name: 'turboslide'` and the four skill names are unchanged (`packages/agent/src/generate/manifest.ts`). The identity adds nothing to a protocol name.
7. The README (owned by another workflow this round): the stacked lockup as the hero (`previews/lockup-stacked-ink.png` is the reference), the dark twins for every picture because GitHub's ground is light (report 01 item 33), and the first sentence stays the description the head tags reuse.
8. The Open Graph card and the head: section 2.

## 6 Accessibility

Contrast, computed with the WCAG relative luminance formula on the token values:

| Pair | Ratio | Where it is used |
| --- | --- | --- |
| `--pt-ink` `#070707` on `--pt-paper` `#ffffff` | 20.14:1 | Headings and body, light |
| `--pt-ink` `#f2f2f0` on `--pt-paper` `#070707` (dark) | 17.97:1 | Headings and body, dark |
| `--pt-ink-2` `#3a3d44` on paper | 10.88:1 | Captions, the fact line, secondary copy, light |
| `--pt-ink-2` `#b9bcc3` on ink | 10.59:1 | The same, dark |
| Ink on `--pt-plate` composited `#f6f6f6` | 18.64:1 | Commands in hairline boxes, light |
| `--pt-panel-text` on `--pt-panel-ink` | 14.41:1 | The CLI banner box |
| `--pt-titanium` `#8a8f98` on paper | 3.25:1 | The tab icon base only; never text under 19 px |
| `--pt-titanium` on ink | 6.20:1 | The same |

Rules: titanium never sets text below 19 px on /home or in the new surfaces (the fact line and every caption are `--pt-ink-2`); the smallest text is 13 px; the plate under the hero heading is opaque paper, so the heading never sits on cells; a two tone crop used as a figure carries `role="img"` and one sentence, or `aria-hidden="true"` when it is decoration (the hero frames are `aria-hidden`; the plate's text is the content); the mark's alt text is "Turboslide" (`<title>` inside every SVG, `aria-label` on the links "Turboslide home"); the hero's cut respects `prefers-reduced-motion` (the hold becomes 0 ms and frame one stands) and pauses when the tab is hidden; nothing flashes (three cuts per twelve seconds, well under any threshold); every button and link has a visible focus outline (`.pt-ib:focus-visible`, 1 px ink); the theme button's label names the appearance it switches to; the hero picture's credit is text on the page. The icon set's base is a graphic at 3.25:1 to 4.95:1 on the strips that ignore the media block, which meets the 3:1 floor for non text on the active tab and the dark strip and falls to 2.48:1 on Chrome's light inactive strip; the media block gives 20:1 and 18:1 where it is honoured.

## 7 File ownership and acceptance

### 7.1 Who owns what

| Role | Files | Deliverable |
| --- | --- | --- |
| Brand builder | `packages/theme/brand/turboslide-mark.svg` (from `dither/mark.svg`, `mark-small.svg`), `packages/theme/brand/site.ts`, `packages/theme/brand/og-template.html` (from `dither/og.html`), `scripts/build-icons.ts` (from `dither/build-assets.mjs`), `apps/studio/public/{favicon.ico,icon.svg,apple-touch-icon.png,manifest.webmanifest,robots.txt,icons/*,og/turboslide.png}`, `packages/chrome/src/TurboslideMark.tsx`, `packages/chrome/src/TitleRow.tsx` line 273, `apps/studio/src/routes/decks.index.tsx` lines 530 to 537 and `decks.css`, `apps/studio/src/routes/__root.tsx` head and `NotFound`, `packages/theme/src/copy.ts` `PROPER_NOUNS`, `packages/chrome/src/menus/strings.ts` new strings, `apps/cli/src/commands/version.ts` banner, `PORTED_FROM.json`, `vite.deploy.config.ts` `routeRules` | The mark in every chrome surface, the icon set served from the CDN, the card |
| Home builder | `apps/studio/src/routes/home.tsx`, `home.css` (from `dither/home.html`), `apps/studio/public/home/*.jpg` (the fifteen shots, content hashed), `apps/studio/public/brand/hero-{1,2,3}-{dark,light}.png` produced by `turboslide material capture` with the recipe of `assets/hero.recipe.json`, `apps/studio/e2e/home.spec.ts`, `scripts/hosted-smoke.mjs` row | The /home route, indexable, with the honest numbers |
| Perf builder | `apps/studio/src/router.tsx`, `apps/studio/src/routes/new.tsx` line 13 and the chunk graph so /home carries no editor or shader code, the title row's Link render prop, `preload: 'viewport'` on the deck cards, the Speculation Rules script for `/new` | /home under 400 KB decoded JavaScript (report 03 section 3.2's estimate), the editor to /decks transition under 1 s |
| Integrator | `scripts/check.mjs` steps (the icon build `--check`, the Vercel output assertion), `docs/gslides-parity/BUILD-STATUS-3.md`, the merge order (brand, then home, then perf), `THIRD_PARTY_NOTICES.md` unchanged (no new dependency) | One tree that builds and deploys to a preview |
| Verifier | `docs/gslides-parity/verification-4/` | The checks of 7.3 with screenshots and numbers |

### 7.2 What this proposal hands over

| Path (under `docs/gslides-parity/design-4/dither/`) | What it is |
| --- | --- |
| `mark.mjs` | The generator: `WINDOW`, `FIELD_END`, `markBits(N)`, `markPath`, `cellRects`, `markSvg`, `markBlocks`; imports `bayer8` from the effects package |
| `mark.svg`, `mark-small.svg`, `mark-32.svg`, `wordmark.svg`, `icon.svg` | The SVG sources |
| `build-assets.mjs` | Builds the previews, the icon set, the ICO, the manifest, the size sheet and the tab strips |
| `icons/*` | The icon set of section 2.1 |
| `assets/hero-{1,2,3}-{dark,light}.png`, `assets/hero.recipe.json`, `assets/hero-frame-continuous.jpg`, `assets/og-screen-{dark,light}.png` | The hero twins, their recipe, the reference frame, the card's screen |
| `home.html`, `chrome.html`, `og.html` | The mocks |
| `previews/home.png`, `home-light.png`, `home-390.png`, `chrome.png`, `chrome-light.png`, `og.png` | The page shots |
| `previews/mark-{512,180,64,32,16}-{paper,ink}.png`, `mark-sizes.png`, `mark-16-paper-8x.png`, `mark-32-paper-8x.png`, `favicon-tab-strips.png`, `wordmark-{paper,ink}.png`, `wordmark-paper-3x.png`, `lockup-stacked-ink.png` | The mark previews |

### 7.3 Acceptance

The build is accepted when, on a preview deployment of the merged tree:

1. `node scripts/hosted-smoke.mjs <url>` passes with rows for `/favicon.ico` (200, `image/vnd.microsoft.icon` or `image/x-icon`, `x-vercel-cache: HIT` on the second request), `/icon.svg`, `/apple-touch-icon.png`, `/manifest.webmanifest` (`application/manifest+json`), `/icons/icon-512.png`, `/og/turboslide.png` and `/home` (200, the hero sentence present). No probe reaches the function (report 02 section 8).
2. `pnpm build:icons --check` reproduces every file in `apps/studio/public` from `packages/theme/brand/turboslide-mark.svg` with 0 differing pixels (the ICO decoded by the script's reader), and `.vercel/output/config.json` carries one route per cache rule.
3. The 16 px PNGs and the ICO's 16 px entry contain exactly two colours; the 32 px and larger marks dither through `turboslide asset dither --verify-cells` to themselves at every cell (report 01 acceptance item 5).
4. Six tab screenshots (Chrome, Firefox, Safari, each with the OS light and dark) show the icon on both strips; the titanium base where the media block is ignored, ink or paper where it is honoured.
5. The hero twins on the deployment are byte identical to `turboslide material capture` output for the recipe in `assets/hero.recipe.json` on the same GPU backend, their ink fractions sum to 1.0 per frame, and `/home` loads no chunk containing `ShaderMount`.
6. `turboslide lint --chrome` passes at 1440, 1280 and 390 in both themes with `/home`, `/decks` and the Not found page in its list; no computed colour in chrome resolves outside the `--pt-` set; `git diff packages/chrome/src/tokens.css` is empty.
7. `node scripts/tooltip-audit.mjs --base <origin>` exits 0 with the new mark's tooltip on the title row and the app bar; the default view words test and the copy lints pass on every string of `/home` and the new strings.
8. `/deck/gt-brand` serves `og:image` that decodes to two colours plus the plate column; `/home` serves the site card.
9. The README's hero, the npm page and `turboslide --version` carry the same mark; the banner is byte identical with `NO_COLOR=1`.
10. Lighthouse on `/home`: the largest contentful paint element is the hero plate's text or the first twin; no layout shift from the hero (the band has a fixed height); the accessibility score has no contrast failure.
11. Report 04's baseline, re-run: the editor to /decks transition under 1 s (a Link in place of a document load), `/home` cold LCP under 1 s on the same connection, and the number stated on the page for the card to editor transition replaced by the new measurement if it changed.

### 7.4 Decisions for Kevin

1. No accent, anywhere in chrome or on /home (section 3.3). Confirm.
2. The tab icon's base colour is titanium so one raster reads on both strips where the scheme block is ignored; the alternative is ink on a paper tile with a 1 px margin, which cannot be drawn on the 8 grid at 16 px. Confirm titanium.
3. The hero is three captured frames cut every four seconds and no live shader on /home. The alternative in report 01 (a live `ShaderMount` after the twin has painted) costs the shader chunk on the product page. Confirm the captures.
4. `start_url` and the app bar's About link point to `/home`; the title row's and the app bar's marks keep pointing to `/decks`. Confirm the split.
5. The touch and manifest tiles are ink with the paper ink mark (the default appearance); the inverse is one line in the build script. Confirm ink.
6. The Not found page and the empty states use a crop of the hero twin as their figure; a dedicated two tone photograph would be a `material.capture` or `asset add --two-tone` job later. Confirm the crop for now.
7. The README hero uses the stacked lockup (mark over word) and the dark twins. Confirm.

## 8 Sources

Research-4 reports in this repository, all dated 2026-09-13, and the sections used: report 01 `01-brand-references.md` sections 0, 1.2, 1.3, 2.16, 2.17, 3.2, 3.3, 4.3, 5, 6.1 to 6.10, 7 and 8 (the brief, the confusion cases, the dither principles, the acceptance list); report 02 `02-icon-favicon-og-production.md` sections 1, 2.1, 2.2, 2.3, 2.4, 2.5, 3, 4, 5, 6, 7 and 8 (the file list, the head tags, the 16 px arithmetic, the resampling measurements, the ICO structure, the cache rules); report 03 `03-performance-techniques.md` sections 1, 2, 3.1, 3.2 and 4 (the 858 ms and 6.2 s transitions, the 2.66 MB graph, the honest speed story); report 04 `04-performance-baseline.md` sections 2.1, 3, 9 and 10 (the chunk list, where the crate runs, the ranked waits, the claim table); report 05 `05-home-page-content.md` sections 5, 6, 7, 8, 9, 10 and 11 (the section order, the copy, the screenshot map, the claims map). Research-3 report 06 `06-backgrounds-and-dithers.md` section 1 (the pipeline, the twins' ranges, the capture job). The web sources behind those facts are listed in each report's sources section with the date read; this proposal read no web page itself.

Repository files read at 28cb63b: `AGENTS.md`; `README.md`; `docs/native.md`; `packages/chrome/src/tokens.css`, `GtMark.tsx`, `TitleRow.tsx`, `TitleRow.css`, `menus/model.ts` lines 470 to 474; `packages/theme/src/tokens.ts`, `copy.ts`, `sprite.ts`, `theme.ts`, `assets/sprite.svg`, `assets/sprite-ids.json`, `gt-ink-paper/sheet.css`; `packages/effects/src/bayer.ts`, `pipeline.ts`, `two-tone.ts`, `select.ts`, `metrics.ts`, `ramp.ts`, `tone.ts`, `resample.ts`, `image.ts`, `png1.ts`; `packages/materials/src/catalog.ts`, `presets.ts`, `capture.ts`, `paper.ts`, `mount.ts`; `packages/headless/src/launch.ts` (the ANGLE flags); `packages/render/src/stage.ts`; `packages/mcp/src/server.ts`; `packages/agent/src/generate/manifest.ts`; `packages/fonts/src/inter.css`; `crates/turboslide-native/Cargo.toml`, `src/lib.rs`; `apps/studio/src/routes/__root.tsx`, `decks.index.tsx`, `decks.css`, `print.css`, `styles.css`; `apps/studio/vite.deploy.config.ts`; `apps/cli/src/cli.ts`, `commands/version.ts`; `decks/gt-brand/deck.json` (the sixteen two tone assets); `/Users/kevinliu/repos/Prototemplate/DESIGN.md` sections 1 and 2; `node_modules/.pnpm/@paper-design+shaders@0.0.78` (the dist layout, the exports, the `ShaderMount` constructor).

Measurements made for this proposal, all on 2026-09-13 on this machine (Apple M5 Max, macOS, Node 24.13.0): the candidate sheets (`scratchpad/dither/sheet-candidates.png`, `sheet-windows.png`, `sheet-lockup-dpr1.png`, `sheet-lockup-dpr2.png`); the ten material captures and their twins (`sheet-captures.png`); the hero tone sweeps (`sheet-hero.png`, `sheet-hero2.png`); the word width in Chromium (287.06 px at 66 px); the ICO decode with Pillow (0 differing pixels at three sizes); the colour counts of every PNG; the contrast ratios of section 6; the page screenshots and their font and image checks of section 4.1.
