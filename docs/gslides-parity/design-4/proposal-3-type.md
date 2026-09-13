# Proposal 3, type: the Turboslide identity and the /home page

Brand designer 3 of 3 for the Turboslide round four, written 2026-09-13 against `main` at 28cb63b (the checkout's head on that date; research-4 reports 01 to 05 cite 61b16e4 and 28cb63b of the same day). The angle is type first: the wordmark carries the identity, the mark is the letter T alone on a pixel grid, and dithers and shaders are surfaces behind type. Everything below was drawn, rendered and measured in this checkout; the files are under `docs/gslides-parity/design-4/type/` and the scripts that made them are named in section 9. Rules followed: plain technical English, sentence case, no em dashes, no metaphors, headings without trailing periods, full sentences. No Google or Vercel artwork is used or proposed.

Kevin's directive (b), verbatim: "also make a custom turboslide icon and favicon and everything and custom ui aesthetic and branding that uses awesome bayer dithers and shaders and unique beautiful ui like a modern clean but also technical and agent-supporting vercel and opinionated and better and turbo-fast (and explain why its turbofast, like built on rust?) vercel-ified version of google slides almost. and give it a /home page too". Directive (a) ("make transitions between different websites and doing stuff in the slides so much faster and more performant") binds this proposal where the identity costs bytes or paint: section 3.6 and section 4.5.

## 0. The decisions in one page

1. The mark is the letter. Turboslide's mark is the T of Inter Display Medium (InterVariable 4.001 at `opsz` 32 and `wght` 500, the face the product already ships) with the lowest 40 percent of its stem cut by the deck's 8 by 8 Bayer screen: four cells across the stem, the tone falling from 1 to 0.25 so the tiers nest. It is one colour, `currentColor`, and it has no second drawing: the wordmark's own T carries the same cut at display sizes, so the mark is literally the first letter of the name (`type/mark.svg`, `type/wordmark-display.svg`).
2. Below 128 px the mark is a bitmap hint of that letter on a 16 unit grid: cap 12, width 10, stem 2, arm 2, the proportions of the measured glyph (0.786, 0.150 and 0.131 of the cap) rounded to the cell. At 16 and 32 px it is solid; at 64 px the foot shows 2 px cells; from 128 px the outline takes over (`type/mark-small.svg`, section 1.2). A dither that cannot exist at 16 px is not faked there; the mark carries the screen as the rule of its construction and shows it where a cell is at least 2 px.
3. The tile is the icon. The letter sits on an opaque plate with a 1 px frame in the edge composite (`#656565` on paper, `#888887` on ink), the Prototemplate card: the plate reads on a same coloured tab strip because of the frame, Safari's base rendering reads on a dark strip because the plate is opaque, and the tile at 20 and 24 px is what replaces the GT mark in the title row and the app bar (`type/icon.svg`, `type/favicon/`).
4. The wordmark is Inter, live. "Turboslide" is set in Inter at weight 500 with `cv11` and `ss01` and tracking of -0.025em at 28 px and above, as live, selectable text wherever the page has text. The two exceptions are images by nature: the display wordmark for the OG card and the README hero, where the T carries the cut, and the CLI banner, where the hint becomes half blocks. Two variants were drawn and rejected on evidence (section 1.5): a 16:9 counter cut into the o, and a doubled line T in the GT mark's grammar.
5. No accent. The chrome stays ink and paper; no `--pt-` token changes name or value; the identity adds `--ts-` tokens for the /home type ladder, the dither surface and the page measure only (section 3). The one filled button is the accent, as it is in the shell today.
6. Dithers are pictures, cut by the product's own pipeline. The /home hero is a 1600 by 900 two tone twin cut from a captured Paper Shaders frame (`paper:mesh-gradient` in the `ink-paper` preset) by `twoToneScreenTypeScript`, the deck's permutation, 2 px cells, twins per theme, 3.7 KB and 4.3 KB as PNG. It is shown at its natural size and never scaled between integers. It appears on /home, in the empty states, on the Not found page, in the README and on the OG card; it never appears in menus, toolbars, panels, dialogs, text, icons, thumbnails, the workspace, the present surround or the sheet (section 3.5).
7. The /home hero is still. The captured twin is the first and the only paint; no shader mounts on /home. This is a deliberate deviation from research-4/01 section 6.7, which allows a live mount: the shader library is 73 KB of GLSL inside the 1.1 MB index chunk today (research-4/04 section 2.1) and the performance plan moves it out of the home route; a live hero would pull it back and would break the frozen frame contract of SPEC 5.4 that keeps the viewer from ever paying for a shader. A live layer is offered as an option for Kevin with its cost stated (section 8, decision 3).
8. The speed story is the mechanisms with their numbers, each tied to a file (section 4.5), in the words research-4/05 section 6.6 drafted and research-4/04 section 10 checked; the page states where the Rust crate runs and where it does not, and it names what is still slow.
9. Every `--pt-` token, the line law, `--pt-radius: 6px` as the one corner, Inter at 13 px in the chrome, the six durations and the reduced motion block stay as they are. The mark, the tile, the cards and the plates are square.
10. The GT mark leaves the chrome and stays on the sheet, in the `mark` block, on the closing plate, in the icon picker and on the GT template card, because those are content of `gt-ink-paper` (research-4/01 section 6.5).

## 1. The mark

### 1.1 What it is and why

A type first identity has one asset that everything else derives from: the name set in the face. Turboslide's face is Inter, and the product's whole look is Inter, paper, ink and 1 px rules; a mark drawn from anything else would be the one object in the product that is not made of the product. So the mark is the letter T from the wordmark, and the only thing added to the letter is the product's own texture: the 8 by 8 Bayer screen that cuts every picture in the GT deck. The foot of the stem dissolves into the paper through nested tiers, which is what the two tone pipeline does to every photograph and every shader frame: ink becoming paper by threshold. The letter reads first, the cut second, and the cut is the argument for the pipeline.

The proportions are measured, not drawn. `InterVariable.woff2` was instantiated at `opsz` 32 and `wght` 500 with fontTools (the static instance is in the scratchpad, section 9) and scanned: cap height 1490 units of 2048, the T 1170.5 wide (x 48.2 to 1218.7), the stem 223 wide (x 523 to 746), the arm 195 tall (y 1295 to 1490). Width is 0.786 of the cap, the stem 0.150, the arm 0.131.

### 1.2 The three sizes of the one letter

| Range | Drawing | Cells | Files |
| --- | --- | --- | --- |
| 128 px and above | The outline: Inter's T path clipped above the ramp, the ramp a 4 by 9 grid of square cells across the stem (cell 55.75 font units, the stem's width over four); 9 rows cover 502 of the 1295 unit stem, 39 percent | 14.4 px at 512, 5.4 px at 192, 4.5 px at 180, 3.6 px in the display wordmark at 132 px type | `mark.svg` (512, `currentColor`), `wordmark-display.svg` |
| 64 px | The hint with cells: crossbar 10 by 2 units, stem 2 by 10, the lowest 4 units of the stem a 4 by 8 grid of 2 px cells | 2 px | rendered from the hint by `hintRects` (section 9) |
| 16 to 48 px | The hint, solid: the same grid, no cells (a 2 px cell would leave 8 cells across the tile, which research-4/02 section 5.4 measured as noise) | none | `mark-small.svg`, `icon.svg`, `favicon.ico` |

The tone of the ramp falls linearly from 1 at the top row to 0.25 at the foot; a cell is lit when `tone * 255 > bayerThreshold(row, col)` with the deck's permutation from `packages/effects/src/bayer.ts`, so the rows are nested tiers by construction (Prototemplate `DESIGN.md` section 7) and every size shows the same order of cells. Nothing shimmers because nothing moves: the mark is never animated.

The hint's numbers: on the 16 unit grid the crossbar is x 3 to 13, y 2 to 4; the stem x 7 to 9, y 4 to 14. At 16 px that is 40 ink pixels (10 by 2 plus 2 by 10), 2 px strokes, no anti aliasing: the 16, 32 and 48 px rasters contain exactly three colours (plate, frame, ink), measured with Pillow on the written files (section 9). At 20 and 24 px (the title row and the app bar) the unit is 1.25 and 1.5 px and the edges anti alias; the brand builder hints those two sizes by hand as research-4/02 section 5.2 asks (at 20: crossbar 12 by 2 at y 3, stem 2 by 12; at 24: crossbar 14 by 3 at y 3, stem 3 by 15), and the mock in `previews/chrome-mocks.png` shows the unhinted version so the judges see the worst case.

### 1.3 The tile

The plate is `--pt-paper`, the frame 1 px in the composite of `--pt-edge` on that paper (`#656565` light, `#888887` dark, from `packages/theme/src/tokens.ts` `composite`), the letter `--pt-ink`. The frame is the frame role of the line law (SPEC 2.2: thumbnails, page frames, grid tiles), so the tile reads as a slide thumbnail with a title, which is the product. The frame stays 1 px at every size because a rule in chrome is 1 px; at 512 it is a hairline and the maskable variant drops it. On iOS the plate is masked by the system, so the touch icon carries no frame.

Why a plate at all: research-4/02 section 2.1 established that Safari renders an SVG favicon's base colours and ignores its media query, and that Android draws `any` icons on white. A transparent ink T disappears on Safari's dark strip; an opaque paper tile does not. `previews/tab-strip.png` shows the three cases at 2x (Chrome light, Chrome dark through the media block, Safari dark with the base colours) beside grey placeholder icons; `tab-strip-1x.png` is the 1x device.

### 1.4 The tests the brief set, and the results

| Test (research-4/01 section 6.3) | Result |
| --- | --- |
| One colour, `currentColor`, reads on paper and ink | Yes: `mark.svg` and `mark-small.svg` carry `fill="currentColor"`; the tile adds the plate and the frame as the host's colours. |
| Square box, 8 by 8 grid, cell edges on device pixels at 16, 32, 64, 180, 512 | Yes on a 16 unit grid, which is the 8 by 8 grid halved so the stem can be 2 units and centred; 16, 32, 48, 64, 192 and 512 are exact multiples; 180 uses a 10 px unit with a 10 px pad. |
| Solid at 16, cellular from 32 | Solid at 16, 32 and 48; cellular from 64. The report's "from 32" would put 1 px cells four across a 4 px stem, which research-4/02 section 5.4 measured as noise; the first honest cell is 2 px, which is the 64 px tile. |
| No confusion with a triangle, a cube, a Z, a rectangle in a rectangle, a roundel, a chevron pair | `previews/marks-sheet.png`, last row: the 32 px tile beside grey silhouettes of those forms. A letter on a framed card shares no silhouette with any of them. |
| Translation survival | The stacked lockup with the word replaced by any script still shows a framed T; the T is read as a form (a letter on a card) before it is read as Latin. The mark never depends on the word beside it. |
| No 2.5D, gradient, shadow or rounded corner | None. The tile is square; `--pt-radius` is not used on any identity asset. |
| The 16 px PNG contains only two colours | Three: plate, frame, ink. The frame is the third by design (research-4/01 section 6.4 item 16 proposes exactly this tile for the ICO). The acceptance test in section 7 counts three. |

### 1.5 Tested and rejected

Both variants are rendered in `previews/marks-sheet.png` and `previews/variants/`.

- The slide counter (`variants/o-slide-counter.png`): the o of the display wordmark with a 16:9 counter, 584 by 328 font units in the counter's box. Rejected. It breaks Inter's rhythm in the one word that carries the identity, it reads as a screen glyph and therefore as a monitor icon, and it is invisible under 40 px, which is where the wordmark lives in the product (the app bar at 20 px). The brief named it; the drawing settles it.
- The doubled line T (`variants/doubled-T-16-paper.png` and siblings): the T drawn as two hairlines with a gap, the GT mark's thread grammar (Prototemplate `DESIGN.md` section 5). Rejected. At 16 px on a 1x screen the two 1 px lines and their 1 px gap close into one grey stroke (the sheet shows the 8x enlargement; at 1x it is the same 3 px), and the form is the GT mark's own, which stays on the sheet as content of the deck theme.
- The cell T scaled to 512 (`variants/hint-512-paper.png`), for comparison: it reads as a pixel font glyph, the register research-4/01 section 3.3 excludes. The outline from 128 px is the answer; the hint is only what the small sizes need.

### 1.6 The lockups

Two lockups, as research-4/01 section 6.2 item 8 asks, plus the display wordmark:

- Horizontal (`wordmark.svg`, `wordmark-ink.svg`): the tile at 64, a gap of 0.4 tile, the word in Inter Display Medium at 66 px so its cap height equals the T's 12 units, tracking -0.025em, baseline on the tile's 14th unit. Glyph positions come from Chromium (kerned; the T to u pair kerns -0.096 em at this weight), outlines from fontTools, so the SVG is the same word the browser sets. The word's total width at 1000 px type is 4349.4 px with the tracking, 4599.4 without.
- Stacked (`wordmark-stacked.svg`, `-ink`): the tile above the word, centred, a gap of 0.375 tile. For the README hero and the Not found page.
- Display (`wordmark-display.svg`, `-ink`): the word alone with its T carrying the cut. For the OG card and the /home hero at 96 px and above; at 96 px type the cells are 2.6 px. The clear space around any lockup is the tile's height. No rule sits between the tile and the word.

In the product the word is live text beside a tile: `.ts-appbar-brand` on /decks already sets Inter 500 at 20 px with -0.01em, and it keeps that; only the tile changes.

## 2. The favicon set and the social image

The set follows research-4/02 section 3 file for file; the files in `type/favicon/` are the real outputs of the build described there, produced by `build-marks.mjs` with sharp 0.35.0 and verified with Pillow.

| Path | Bytes | Content |
| --- | --- | --- |
| `favicon.ico` | 15,086 | Three 32 bit BMP entries with AND masks at 16, 32 and 48; the paper tile with the frame and the solid hint; Pillow lists the three sizes and each entry decodes to exactly three colours. Paper for both strips, because Safari and Windows take one drawing. |
| `icon.svg` | 478 | The 16 unit hint on the paper plate with the 1 px frame, `shape-rendering="crispEdges"`, and the `@media (prefers-color-scheme: dark)` block that swaps to the ink plate, `#888887` frame and `#f2f2f0` letter. |
| `apple-touch-icon.png` | 1,251 | 180 by 180, opaque ink plate, no frame, the outline letter at a 10 px unit with a 10 px pad, cells 4.5 px. |
| `icon-192.png`, `icon-512.png` | 532, 1,984 | The ink tile with the frame and the outline letter; palette PNGs. |
| `icon-mask-192.png`, `icon-mask-512.png` | 529, 2,051 | Maskable: the letter at 12 of 16 units inside a 24 px pad at 192 and a 64 px pad at 512, so the cap is 288 px, the width 226 px and the diagonal 367 px inside the 409 px safe circle; the plate bleeds, no frame. |
| `manifest.webmanifest` | 834 | `name` and `short_name` Turboslide, `start_url` `/home`, `display` standalone, `background_color` and `theme_color` `#070707`, the four icons with one `purpose` each. |

Not produced: the `monochrome` icon (research-4/02 decision 6; cheap to add, support unverified) and `robots.txt` (the round's integrator owns it). The head tags are research-4/02 section 4.1 verbatim, with one `theme-color` kept equal to `--pt-paper` by the boot script and the appearance control (`#070707` dark, `#ffffff` light), and no `media` attribute on the icon links: the SVG carries its own block, as research-4/02 section 2.1 decided.

The Open Graph image (`previews/og.png`, 1200 by 630) is an ink card: the display wordmark at 640 px wide on the left, the hero sentence of research-4/05 in Inter at 30 px, the address in `--pt-mono` at 20 px in titanium, and a Bayer ramp band on the right at 12 px cells, the size research-4/02 section 5.4 measured as safe at a 360 px unfurl. The band is texture; the word and the sentence carry the message, and everything that matters stays 72 px from the edges so X's 2:1 crop removes nothing. The per deck card of research-4/02 section 7 (the first slide rendered at 1120 by 630 beside an 80 px column carrying the tile) keeps the same column and the same ink.

## 3. The brand tokens

### 3.1 What stays

Every `--pt-` token in `packages/chrome/src/tokens.css` keeps its name and value: the nine sheet tokens and `--pt-thumb`, `--pt-scrim`, `--pt-panel-ink` and `--pt-panel-text`, the row heights, the widths, `--pt-radius: 6px` as the one corner in chrome, the three font stacks, the six durations and the two easings, the reduced motion block. `turboslide lint --chrome` and `PORTED_FROM.json` stay valid; `git diff` on the file is empty. The line law is unchanged and /home obeys it: sections open with `--pt-hair` (structural), rows are ruled in `--pt-hair-soft`, pictures are framed in `--pt-edge`, and `--pt-ink` appears on a border only as focus or the solid button.

### 3.2 What arrives, the `--ts-` tokens

Declared in `apps/studio/src/styles.css` (research-4/01 section 6.6 item 24 puts the ladder there) and exported as data from `packages/theme/brand/tokens.ts` for the icon build and the OG template, so the two cannot drift. The mockup `type/home.html` declares them on `:root` and uses nothing else.

| Token | Value | Use |
| --- | --- | --- |
| `--ts-h1`, `--ts-h1-lh` | 56px, 1.05 | The hero sentence; 36px under 640 px |
| `--ts-h2`, `--ts-h2-lh` | 32px, 1.12 | Section headings; 26px under 640 px |
| `--ts-h3`, `--ts-h3-lh` | 20px, 1.25 | Card and row titles |
| `--ts-lead`, `--ts-lead-lh` | 20px, 1.45 | Section leads; 18px under 640 px |
| `--ts-body`, `--ts-body-lh` | 15px, 1.55 | Body copy on /home and the Not found page |
| `--ts-small` | 13px | Captions, the app bar links, the mono blocks: the chrome size |
| `--ts-figure` | 40px | The numbers strip; 32px under 640 px |
| `--ts-track-display`, `--ts-track-mid` | -0.025em, -0.01em | Tracking at 28 px and above; 16 to 27 px |
| `--ts-twin`, `--ts-twin-size` | the hero twin per theme, 1600px 900px | The dither surface: always drawn at its natural size, anchored, cropped; `image-rendering: pixelated` |
| `--ts-cell` | 2px | The cell, for the empty state figure crops and any future ramp |
| `--ts-page`, `--ts-measure`, `--ts-gutter` | 1120px, 62ch, 24px | The column (the width `.ts-home-page` already uses), the measure, the gutter |

No new colour, no new radius, no new duration. Weight never exceeds 500 anywhere the tokens are used; `font-feature-settings: 'cv11', 'ss01'` is set on headings for consistency with the chrome (`.pt-icon`, `.ts-appbar-brand`), though neither feature changes a letter of the word Turboslide.

### 3.3 The accent decision: none

Arguments for one accent were weighed: Vercel, PlanetScale and Zed each allow one (research-4/01 sections 2.1, 2.5, 2.14), and a spectral colour gives a call to action somewhere to go. Against: the deck is one ink on one paper and its openers prove that a filled ink plate and a hairline are enough hierarchy; the chrome already has its accent, the one solid button (`.pt-ib.is-solid`, ink on paper, paper on ink); GT blue `#2f5ce0` exists in the product as the `brand-blue` material preset and belongs to the customer's slide, so a Turboslide accent in the same hue would claim the customer's colour and a different hue would put two accents on one screen; and Kevin's brand directives forbid the gradient and glass looks that an accent tends to invite. The decision is no accent, and it is testable: `lint --chrome` gains the rule that no computed colour in chrome or on /home resolves outside the `--pt-` set (research-4/01 section 6.6 item 25).

### 3.4 Light and dark

Both appearances are first class. Every asset has a twin: the tile inverts (the SVG's media block, the ink PNGs for the manifest, the paper ICO for both strips), the wordmarks come in paper and ink files, the hero twin swaps by `data-theme` through `--ts-twin`, the editor screenshot under the hero swaps between `01-new-presentation.jpg` and `13-editor-light.jpg`. Dark stays the stored default (`THEME_BOOT_SCRIPT`), the tab icon follows the operating system, and the README uses the ink twins because GitHub's ground is light. The /home mockup carries the appearance control in its footer (Vercel's placement); it writes `gt-theme`, the key the boot script reads, so the choice holds across the studio.

### 3.5 Where dithers and shaders appear, and where they never do

| Surface | Dither | Shader | How |
| --- | --- | --- | --- |
| The mark at 64 px and above | The foot of the stem, nested tiers | No | Section 1.2; never animated |
| The /home hero | The captured twin, 1600 by 900, natural size, anchored bottom right | Captured only; no live mount (decision 7) | `--ts-twin`; the copy sits on a `--pt-paper` plate because the pipeline's own metric found 8,855 lit cells under the heading's box (`previews/hero-report.json`) |
| Empty states: no presentations, empty trash, no search match | A 320 by 180 crop of the hero twin at 1:1 cells in a `--pt-edge` frame | No | `previews/chrome-mocks.png`; Geist's structure: a title, one sentence, one action |
| Not found | The stacked lockup at 64 and the same figure | No | Section 5 |
| README hero and OG card | The ink twin; the 12 px band on the card | Captured only | Section 2 |
| Present mode surround | No | No | Flat `--pt-panel-ink` (gslides-parity build deviation B6); the slide alone |
| Menus, toolbar, panels, dialogs, snackbars, tooltips, controls, text, icons | No | No | The line law and 13 px text |
| The workspace around the sheet, filmstrip thumbnails, layout tiles | No | No | Flat `--pt-plate`; a thumbnail shows the slide's own pixels |
| Progress and loading | No | No | The 1 px `--pt-hair-soft` track and the ink fill stay; research-4/01 allows a ramp texture here and this proposal declines it, because a progress bar is chrome and the dither is a picture |
| Avatars and presence chips | No | No | There are no accounts; an author is named in words (research-3/03) |
| The sheet | Only as content the user placed | Only as content | The identity never draws on the customer's slide |

The cell rule for every surface: a twin is drawn at its natural size or at an integer multiple; CSS crops, never scales; `image-rendering: pixelated` is set; at a device pixel ratio of 2 a 2 px cell is 4 device pixels. The empty state figure is a `background-position` crop of the same 3.7 KB file the hero uses, so the whole identity's picture budget is one PNG per theme.

### 3.6 Motion

The six `--pt-dur-*` durations are the whole vocabulary, and only transform and opacity move. On /home nothing animates but the `.pt-ib` colour transitions the tokens file already defines, and the reduced motion block sets those to 0 ms. There is no splash, no logo animation, no page transition library, no smooth scrolling (`scroll-behavior: auto` is set explicitly), no hero that blocks paint, and the mark is never animated. The perceived speed of a transition comes from prefetching and from drawing less (section 4.5), not from motion.

## 4. The /home page

### 4.1 The file and the screenshot

`type/home.html` is the full mockup: it links the real `packages/chrome/src/tokens.css` by relative path, loads the repository's `InterVariable.woff2` (under a second family name so a checkout renders it and a machine without the file falls back to the stack; the build uses `--pt-display`), runs the studio's theme boot script verbatim, and references the fifteen README screenshots under `docs/readme/` by relative path. `previews/home.png` is the Playwright screenshot at 1440 wide, full page, dark (9,652 px tall); `home-light.png` is the light twin; `home-390.png` is the page at 390 wide. Shot with Chrome for Testing 147 from the repository's `playwright-core`, `--allow-file-access-from-files` so the local font and pictures load.

### 4.2 The order

Research-4/05 section 5 fixed nine sections; the page keeps them and their copy, with the changes listed in 4.3.

1. The app bar: the tile at 24, the live word at 20 px, four links (Your presentations, Documentation, For agents, GitHub), the one solid New Presentation button at the right; one `--pt-hair` under it.
2. The hero: the twin at its natural size anchored bottom right, the copy on a `--pt-paper` plate of at most 760 px (the opener plate grammar of the deck): the display wordmark at 560 px wide, the one sentence as the h1 at 56 px ("Google Slides' behaviours, a canvas on every slide, and a PowerPoint that matches the screen."), a lead of three clauses, three buttons (New Presentation, Open the GT Deck, GitHub) and the fact line ("No account. Open source under the MIT licence. Hosted at turboslide.vercel.app."). The second button opens the viewer, as research-4/05 decision 1 recommends.
3. The editor in one picture, full width under the hero: `01-new-presentation.jpg`, swapped for `13-editor-light.jpg` in the light appearance, with one caption.
4. The numbers strip: 105, 21, 135, 0.003 %, 17, MIT, each with one line, ruled by `--pt-hair-soft` verticals.
5. Google Slides' frame, on every slide a canvas: three ruled rows beside `06-canvas-rotation.jpg`.
6. What it does: twelve cards in four rows of three in the README's order. Eleven carry screenshots (the shell card pairs `02` with `05`, the viewer card pairs `14` with `15`, so all fifteen shots appear on the page); three carry a Heroicon from the theme sprite on a `--pt-plate` tile (`i-bars-3-bottom-left`, `i-table-cells`, `i-check-badge`).
7. Dithers and shaders, from the deck to the interface: three figures, the Blue Marble slide (`12`), the captured mesh gradient frame (`previews/hero-frame.jpg`) and a 1:1 crop of its twin, then the honest paragraph about the three implementations.
8. Why it is fast: eight ruled rows (title, two sentences, the number with its file) and the closing sentence naming what is still slow.
9. For agents: six ruled rows (label, sentence, the command in a `--pt-mono` hairline box) and the bearer token sentence.
10. Compared with Google Slides: the twelve row table of research-4/05 section 6.8, the rows where Turboslide has less included.
11. The footer: four link groups, the closing line ("Turboslide is General Translation's slides editor. Google Slides is a product of Google LLC."), the tile with the word, and the appearance control.

### 4.3 The copy, and what changed from research-4/05

The words are research-4/05 section 6 with these edits: the hero h1 is the report's shorter alternative sentence, because 56 px type and a 760 px plate hold three lines and the long sentence would take five; the lead under it is new and says who the page is for (a sales team and the agents beside it) in one sentence with three clauses; the shell card's two sentences and every other card are the report's; the Rust row ends with "The hosted studio runs the TypeScript copy today", which research-4/05 section 8.2 requires; the "Routes load before the click" row carries the numbers research-4/04 section 5 measured (399 ms to a ready editor for a one slide presentation, 723 ms for the 85 slide GT deck, warm, from the card's click) instead of the report's placeholder, and the closing sentence carries research-4/04's numbers (0.9 s cold and 0.4 s warm to the first paint of /new, 2.8 s median for the presentations page, 2.4 to 3.8 s to a thumbnail after an edit). The section 6.5 paragraph gains one sentence saying the picture behind the heading was cut by the same pipeline from a shader frame, which is true of the mockup and of the build. Every string was checked against the copy lints: no em dash, no exclamation mark, no word of `METAPHOR_WORDS`, no "X, not Y" pair, headings without trailing periods, sentence case with the proper nouns, Title Case on buttons only, full sentences in body text.

### 4.4 The hero twin, how it was made and what the live page uses

`hero.mjs` (section 9) served the `@paper-design/shaders` 0.0.78 dist through Playwright request routing at a fixed origin, the way `packages/materials/src/capture.ts` does, mounted `meshGradientFragmentShader` at 1600 by 900 with `u_colors` `#070707, #070707, #8a8f98, #f2f2f0` (the `ink-paper` preset's roles: ink ground, titanium and paper figures), distortion 0.6, swirl 0.15, `u_offsetX` 0.4, frame 6800 ms, speed 0, on ANGLE Metal (the renderer string is in `previews/hero-report.json`), and took the canvas as a PNG. The frame then went through `twoToneScreenTypeScript` (`packages/effects/src/pipeline.ts`) with blur 1.2, autocontrast 0.5, black 80, white 250, gamma 1.5, dark ground polarity, the 8 by 8 screen at 2 px cells; `invertBits` made the light twin, `scaleNearest` the 1600 by 900 sheets, `encodePng1` the two palette PNGs. The lit fraction is 0.1648; the whole TypeScript stage set took 179.6 ms on the M5 Max at this size (that number includes the blur, the fit and the tone stages and is not the 52 ms screen alone that `docs/native.md` reports). Two calmer recipes were tried before this one (lit fractions 0.50 and 0.30); the calmest was chosen because the picture sits behind type.

What the live page uses: the same two files, as static assets under `apps/studio/public/brand/`, with `immutable` caching once their names carry a hash; the build script re-cuts them from the recorded recipe (`hero-report.json` holds every parameter) so the twin is reproducible and the recipe key can be checked. The frozen frame is the whole hero (decision 7). If Kevin wants motion, the option is `paper:dithering` mounted after `load` on the main thread with the `ink-paper` colours and a 2 px cell, never under reduced motion, paused off screen by Paper's own observer, with the still twin as the first paint; its cost is the shader library on the home route and a visible change of texture at the moment it starts, because Paper's dithering uses the standard Bayer matrix and its own pattern, not the deck's permutation over a mesh gradient (section 8, decision 3).

### 4.5 Why it is fast, and what the identity does for directive (a)

The eight rows of the page are research-4/05 section 6.6 checked against research-4/04 section 10 and research-4/03 section 4. The identity's own contribution to speed is measurable:

- The hero picture is 3,715 bytes dark and 4,315 bytes light, one request each, cacheable for a year once hashed; the empty states reuse the same file. A shader hero would cost the 73 KB of GLSL plus the mount.
- The favicon set turns four function invocations per visit into CDN hits: research-4/02 section 1 measured `/favicon.ico`, `/apple-touch-icon.png`, `/manifest.webmanifest` and `/home` answering HTML 404 from the function today.
- The wordmark is live text: no image request in the app bar or the title row; the tile is an inline SVG of 40 pixels' worth of path.
- Nothing on /home animates or blocks paint; the largest contentful paint element is the hero plate's text or the twin, both in the first flush of a server rendered route.
- The title row's mark becomes a router `Link` to `/decks` (research-4/03 section 3.1 measured the plain anchor at 6.2 s for the editor to home transition), and `/home` links use `preload: 'intent'`.

## 5. The app chrome changes

| Surface | Today | Proposed | File |
| --- | --- | --- | --- |
| Title row | `<GtMark width={31} height={20} />` in a plain `<a href="/decks">` | `<TurboslideMark size={20} />`, the tile with the frame, as the router `Link` to `/decks` passed in by the editor (the chrome package stays free of the router); tooltip name "Turboslide home", doc "Every presentation on this Turboslide" (the existing `title.appIcon` item) | `packages/chrome/src/TitleRow.tsx` line 273; new `packages/chrome/src/TurboslideMark.tsx`; `PORTED_FROM.json` records it as Turboslide's own |
| App bar on /decks and /decks/trash | GT mark at 30 by 19 beside "Turboslide" | The tile at 24 beside the same live word; the brand links to `/home` | `apps/studio/src/routes/decks.index.tsx` line 535, `decks.trash.tsx`, `decks.css` |
| Template strip on /decks | GT mark at 56 by 36 on the GT card | Unchanged: the GT card shows the GT mark because it is the GT template | `decks.index.tsx` line 596 |
| Empty state on /decks | The sentence "No presentations yet. Start one above" | The figure (a 320 by 180 crop of the twin in a `--pt-edge` frame), the title "No presentations yet", one sentence, one New Presentation button | `decks.index.tsx` line 656, `menus/strings.ts` `HOME.empty` |
| Not found | An h1 and one paragraph | The stacked lockup at 64, "Not found", the paragraph with links to /home, /new and /decks, the figure | `apps/studio/src/routes/__root.tsx` `NotFound` |
| Present surround and Slideshow | Flat `--pt-panel-ink` | Unchanged; the presenter window's title stays "…, Presenter view, Turboslide" | `packages/viewer/src/present/*.css` |
| Print preview | A bar with the title, the layout control and the checkbox | The tile at 16 px at the bar's left; the pages unchanged (they are content) | `apps/studio/src/routes/print.$deckId.tsx`, `print.css` |
| The browser tab | `data:,` | The favicon set and head tags of section 2; `theme-color` follows the stored theme | `__root.tsx` `head()`, `apps/studio/public/` |
| CLI banner | None (`--help` prints usage; there is no version banner) | `turboslide --version` and `turboslide info` open with the hint as half blocks and the word in plain text; identical under `NO_COLOR` | `apps/cli/src/cli.ts`; `type/banner.txt` is the text |
| MCP server | `SERVER_NAME = 'turboslide'`, `title: 'Turboslide'` | Unchanged names; the `instructions` text gains one sentence naming `/home` and `/llms.txt` | `packages/mcp/src/server.ts` line 35 |
| README | Opens with the editor screenshot | The horizontal lockup in its ink twin above the h1 (a PNG rendered from `wordmark-ink.svg` at 2x), then the screenshot; the OG card of section 2 is the repository's social preview | `README.md` (owned by another workflow this round; a request, not an edit) |
| The sheet, the `mark` block, the closing plate, the icon picker | The GT mark | Unchanged | gslides-parity SPEC-2 1.6 |

The banner, from `type/banner.txt`:

```
   ██████████        Turboslide 0.1.0
       ██            the studio at https://turboslide.vercel.app
       ██            105 actions on the CLI, MCP, HTTP and the window API
       ██            deck gt-brand at revision 31
       ██
       ██
```

The blocks are the hint's bitmap, two grid rows per text row, so the banner and the favicon are one drawing.

## 6. Accessibility

Contrast, computed from the token values with the WCAG relative luminance formula (`contrast.mjs`, section 9), against the thresholds of WCAG 2.2 SC 1.4.3 (4.5:1 for text, 3:1 for large text at 18 point or 14 point bold; "Text that is part of a logo or brand name has no contrast requirement", read 2026-09-13 at https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) and SC 1.4.11 (3:1 for user interface components and graphical objects):

| Pair | Light | Dark | Verdict |
| --- | --- | --- | --- |
| `--pt-ink` on `--pt-paper` (body, headings, the letter on the tile) | 20.14 | 17.97 | Passes every level |
| `--pt-ink-2` on paper (leads, captions, card text) | 10.88 | 10.59 | Passes AAA |
| `--pt-titanium` on paper (the OG address, the sheet's captions) | 3.25 | 6.20 | Fails 4.5:1 on light paper: titanium is used on /home only at 20 px in the ink OG card and never for body text; the light page uses `--pt-ink-2` for secondary text |
| The frame (edge composite) on paper | 5.83 | 5.68 | Passes 3:1 for a graphical object |
| The frame against Chrome's tab strip (`#dee1e6` light, `#202124` dark) | 4.45 | 4.54 | The tile's edge reads on both strips |
| `--pt-panel-text` on `--pt-panel-ink` (the present toolbar) | 14.41 | 14.41 | Passes |
| The paper plate against the dark strip (Safari's base rendering) | 15.2 | | The tile reads without its frame |

Other rules the design meets:

- The mark's alt text is "Turboslide" wherever it stands for the product (`role="img" aria-label="Turboslide"` in the SVG sources; `alt="Turboslide"` on the lockup images). In the title row the link carries `aria-label="Turboslide home"` and the tooltip; beside the live word the tile is `aria-hidden` so the name is read once.
- Focus is visible: the shell's 1 px `--pt-ink` outline on every control (`tokens.css` `.pt-ib:focus-visible`), and the mockup's links inherit the underline on hover and the outline on focus.
- Reduced motion: the six durations go to 0 ms in `tokens.css`; nothing else on /home moves; the twin is a still picture in every setting; `scroll-behavior: auto` is explicit. MDN records `prefers-reduced-motion` as Baseline widely available since January 2020 and advises to "Tone down the animation to avoid vestibular motion triggers" (read 2026-09-13 at https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion).
- Text never sits on the dither: the hero copy is on an opaque `--pt-paper` plate, which is the deck's own rule (`plateClear`), and the pipeline's metric on the hero twin (8,855 lit cells under the heading's box before the plate) is recorded in `previews/hero-report.json` as the reason.
- The appearance control is a `role="group"` of two buttons with `aria-pressed`, and the stored choice is the same key the editor's View > Appearance writes.
- The page reads in order without its pictures: every screenshot has an alt sentence, the figure crops are `role="img"` with a label, and the icon tiles are decorative beside a heading.
- Type sizes: nothing on /home is under 13 px; body is 15 px; the chrome size stays 13 px elsewhere.

Inter's own facts, read 2026-09-13 at https://rsms.me/inter/: the display optical size has "clean lines, smooth curves and delicate details for excellent rhythm of large text"; `cv11` is the "Single-story a" and `ss01` the "Open digits"; "Weights range from a delicate thin 100 all the way up to a heavy 900"; the licence is the SIL Open Font License 1.1. The wordmark uses weight 500 of the display size, under the deck's 500 cap.

## 7. File ownership and acceptance for the build

Five builders, as the brief names them. Files not listed here are not touched by this identity.

### 7.1 The brand builder

Owns: `packages/theme/brand/turboslide-mark.svg` (the source with `small` and `large` groups, from `type/mark-small.svg` and `type/mark.svg`), `packages/theme/brand/tokens.ts` (the `--ts-` values as data, the hint geometry, the ramp parameters, the frame composites), `packages/theme/brand/og-template.html`, `packages/theme/brand/site.ts`, `scripts/build-icons.ts` (research-4/02 section 6, with the ICO writer of `build-marks.mjs`), `apps/studio/public/` (the set of section 2 and the two hero twins), `packages/chrome/src/TurboslideMark.tsx`, the `TitleRow.tsx` and `decks.index.tsx` mark changes, `apps/studio/src/routes/__root.tsx` head tags and the Not found page, the CLI banner in `apps/cli/src/cli.ts`, the MCP `instructions` sentence, the empty state on /decks.

Accepted when: `node scripts/build-icons.ts --check` exits 0 and rebuilds byte identical files; the 16, 32 and 48 px rasters and the ICO entries decode to exactly three colours (plate, frame, ink) with the T at 40 ink pixels at 16; the 64 px tile's ink runs are all even lengths (2 px cells on the grid); the outline rasters' cells are at least 4 px; `icon.svg` carries the media block and no `media` attribute exists on the icon links; the tooltip audit finds the title row's mark with its tooltip; the banner renders identically with `NO_COLOR`; `git diff` on `packages/chrome/src/tokens.css` is empty.

### 7.2 The home builder

Owns: `apps/studio/src/routes/home.tsx` and `home.css` (server rendered, indexable, outside `NOINDEX_ROUTES`), the `--ts-` tokens in `apps/studio/src/styles.css`, the copy of section 4.3 in `packages/chrome/src/menus/strings.ts` or a `home/strings.ts`, the screenshots' move into `apps/studio/public/home/` (or a route that serves `docs/readme/`), the appearance control, `apps/studio/e2e/home.spec.ts`.

Accepted when: `/home` answers 200 with the hero sentence and the fifteen pictures; `turboslide lint --chrome` passes at 1440, 1280 and 390 in both themes with `/home` in its page list; the default view words test and the copy lints pass on every string; every button and link carries the Tooltip primitive or the audit excludes the page by rule; the twin is served with a hashed name and `immutable`; the light and dark screenshots match `previews/home.png` and `home-light.png` in structure (the judge loop's visual consistency lens reads the pairs); no computed colour on the page resolves outside the `--pt-` set.

### 7.3 The performance builder

Owns: the title row's mark as a router `Link` (a link component passed into the chrome), `preload: 'intent'` on every link to `/home`, `/new`, `/deck` and `/decks`, the route split that keeps the shader library and the shape table off `/home` (research-4/03 section 3.2), the `routeRules` cache headers for the icon set and the twins (research-4/02 section 8), the `theme-color` update in `applyTheme`.

Accepted when: `/home` ships at most 600 KB of decoded JavaScript (research-4/03 section 5 budget); the editor to `/decks` transition is a same document navigation under 800 ms warm; the icon files answer `x-vercel-cache: HIT` on the second request; Lighthouse's largest contentful paint element on `/home` is text or the twin; the LCP of `/home` is under 1.2 s on a cold browser cache against production.

### 7.4 The integrator

Owns: `PORTED_FROM.json` (the new component), `PROPER_NOUNS` in `packages/theme/src/copy.ts` (gains Turboslide), the default view words test's new failures ("Slides clone", "Google Slides alternative"), `scripts/check.mjs` (the `build:icons --check` step beside step 3 and the `config.json` route assertions), `scripts/hosted-smoke.mjs` (rows for `/home`, `/favicon.ico`, `/icon.svg`, `/manifest.webmanifest`, `/og/turboslide.png`), `robots.txt`, the README request to the README workflow (the lockup and the social preview), `manifest.webmanifest` `start_url` set to `/home`.

Accepted when: `pnpm check` passes with the new steps; `node scripts/hosted-smoke.mjs <url>` passes with the new rows; the README workflow has the lockup PNG and the OG PNG with their alt texts.

### 7.5 The verifier

Owns: `docs/gslides-parity/verification-4/` with the six tab screenshots (Chrome, Firefox, Safari on light and dark strips), the 16 px colour count, the confusion sheet at 32 px, the `/home` shots at three widths in both themes, the OG decode (two colours plus the plate and the band's 12 px cells), the `theme-color` check against the computed `--pt-paper`, the banner under `NO_COLOR`, the timing rows of 7.3 measured against the preview deploy, and a re-run of the copy lints over the page's strings.

Accepted when every row of research-4/01 section 8 passes with the two amendments this proposal makes (three colours at 16 px; cells from 64 px), and the deviation of decision 7 (no live hero) is recorded as Kevin's decision or reversed by it.

## 8. Decisions for Kevin

1. The links: the title row's tile goes to `/decks` (Google's app icon goes to the files page) and the app bar's tile and word on `/decks` go to `/home`. Research-4/05 decision 6 asked which; this is the proposal's answer.
2. Three colours at 16 px. The framed tile deviates from research-4/01 acceptance item 5 (two colours) by one colour, the frame, for the reason in section 1.3. Confirm the frame or drop it and accept a transparent tile that disappears on Safari's dark strip.
3. A still hero. Decision 7 keeps the shader library off `/home`; the alternative is the live `paper:dithering` layer of section 4.4 at the stated cost. Confirm still, or fund the live layer after the route split lands.
4. Titanium on light paper measures 3.25:1 and stays off body text on `/home`; on the sheet it remains the deck's caption colour. Confirm that the identity does not change the sheet's use of it.
5. The appearance control's placement in the footer of `/home`, Vercel's placement, against the editor's View > Appearance menu item. Confirm, or move it to the app bar.
6. The README's opening: a lockup above the h1, which the README workflow owns this round.
7. Whether `/home` becomes the `start_url` of the manifest and the target of `/` in a later round; today `/` stays a 307 to `/new` by directive.

## 9. Files, scripts and measurements

Assets, under `docs/gslides-parity/design-4/type/`:

- `mark.svg` (the outline mark at 512, `currentColor`), `mark-small.svg` (the hint, 16 units), `icon.svg` (the favicon with the media block), `wordmark.svg` and `wordmark-ink.svg` (horizontal), `wordmark-stacked.svg` and `-ink.svg`, `wordmark-display.svg` and `-ink.svg`, `banner.txt`, `home.html`.
- `favicon/`: `favicon.ico`, `icon.svg`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `icon-mask-192.png`, `icon-mask-512.png`, `manifest.webmanifest`.
- `previews/`: `mark-{512,180,64,32,16}-{paper,ink}.png`, `mark-bare-512-{paper,ink}.png`, `tile-{20,24}-{paper,ink}.png` and `@2x`, `wordmark*.png`, `marks-sheet.png`, `tab-strip.png` and `tab-strip-1x.png`, `chrome-mocks.png`, `og.png`, `hero-dark.png`, `hero-light.png`, `hero-frame.jpg`, `hero-report.json`, `home.png`, `home-light.png`, `home-390.png`, `variants/` (the rejected drawings).

Scripts, in the session scratchpad (`/private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad/type3/`), none in the repository and none run through pnpm:

- `inter_measure.py`: fontTools 4.63.0 instantiates `InterVariable.woff2` at `opsz` 32, `wght` 500, writes the static TTF and the glyph outlines and bounds of T, u, r, b, o, s, l, i, d, e; the scan of the T's stem and arm and the o's counter (`t-geometry.json`).
- `measure-word.mjs`: Chromium sets "Turboslide" at 1000 px with tracking -0.025em and `cv11`, `ss01`, the font embedded as a data URI, and reports each glyph's kerned x position (`word-positions.json`).
- `build-marks.mjs`: the SVG sources, the tile rasters with sharp 0.35.0, the variants, the favicon set with its ICO writer, the banner; reads `packages/effects/src/bayer.ts` through Node's type stripping for the thresholds.
- `hero.mjs`: the Paper Shaders capture through Playwright request routing and the two tone cut through `packages/effects/src/pipeline.ts`, `resample.ts`, `image.ts`, `png1.ts` and `metrics.ts`; three recipes, the calmest chosen.
- `sheets.mjs` and `shoot-home.mjs`: the sheet HTML files and every screenshot, Chrome for Testing 147 at `chromium-1217`.
- `contrast.mjs`: the contrast table of section 6 from the token values and the composites.

Measurements made for this proposal on 2026-09-13 (Apple M5 Max, macOS, Node 24.13.0): the Inter Display Medium T geometry (section 1.1); the kerned positions (section 1.6); the raster colour counts (Pillow 12.3.0: 16, 32, 48 px at three colours; the ICO's three entries listed and decoded); the hero capture renderer and timing (`hero-report.json`); the contrast ratios (section 6); the page heights of the screenshots (section 4.1).

Repository files read: research-4 reports 01 to 05 with their scripts; `AGENTS.md`; `README.md`; `docs/spec/SPEC.md` sections 2 and 3; `docs/gslides-parity/SPEC.md` section 1; `docs/gslides-parity/SPEC-2.md` section 1; `docs/hosting.md`; `docs/native.md`; `packages/theme/**` (tokens.ts, copy.ts, the sprite); `packages/chrome/src/tokens.css`, `TitleRow.tsx`, `GtMark.tsx`, `PORTED_FROM.json`, `menus/model.ts`, `menus/strings.ts`; `packages/effects/src/**`; `packages/materials/src/catalog.ts`, `presets.ts`, `mount.ts`, `capture.ts`; `crates/turboslide-native/Cargo.toml`, `src/lib.rs`; `packages/mcp/src/server.ts`; `apps/cli/src/main.ts`, `cli.ts`, `commands/version.ts`; `apps/studio/vite.deploy.config.ts`, `src/router.tsx`, `src/routes/__root.tsx`, `decks.index.tsx`, `decks.css`, `styles.css`, `print.$deckId.tsx`, `present.$deckId.tsx`; `packages/viewer/src/theme.ts`, `present/*.css`; `packages/fonts/src/inter.css`, `export/fonts.json`; `Prototemplate/DESIGN.md` sections 2, 5, 7 and 9; the fifteen screenshots under `docs/readme/`.

Web pages read on 2026-09-13: https://rsms.me/inter/ (Inter Display, `cv11`, `ss01`, the weight range, the licence); https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html (the 4.5:1 and 3:1 thresholds, the logotype exemption); https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion (the two values, the guidance, the Baseline status). Every other external fact is cited through the research-4 reports by section and carries their source keys and dates.
