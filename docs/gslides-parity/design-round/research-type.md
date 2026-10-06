# Type, colour, overlays and scrollbars: research for the design round

The type researcher's report for the design round of 2026-10-05 (worktree
`/Users/kevinliu/repos/Turboslide-design`, branch `design/round` at `0d75ab90`). It answers
Kevin's items 4 and 5 ("use RASMUS INTER ... for numbers and stuff", "use libraries for correct
coloring", "nvm just use rsms inter", "also make and use custom scrollbars") and supplies the
library numbers behind item 1 (layering and rounding of tooltips, dropdowns and other boxes).
Nothing here is committed. No dev server was started on port 4654: every reading is a file, a
bundle size, a font table or a read-only GET of production. Berkeley Mono is not used anywhere,
and no Berkeley Mono file was fetched or copied.

## Summary

1. The product already ships the original Inter. `packages/fonts/assets/InterVariable.woff2` is
   the rsms/inter v4.1 release file byte for byte (sha256 `693b77d4...a8e3`, the same digest as
   `variable/InterVariable.woff2` in the `inter-ui` 4.1.1 package), and v4.1 (2024-11-16) is still
   the latest rsms release. The "GT Inter" names exist only in the PowerPoint export, where
   `scripts/build-fonts.py` cuts per-size instances and renames them `GT Inter Text 22`,
   `GT Inter Display` and so on. What a reader sees as General Translation's Inter in the chrome is
   the brand deck's two alternates, `cv11` (single-storey a) and `ss01` (open digits), set by 87
   rules in 42 files.
2. The font is the largest single download on `/home`: 352,240 B on every route (352,615 B over
   the wire on production, ahead of the shared entry chunk at 330,827 B and the page's own script
   at 115,243 B gzip). A Latin subset cut from the same
   file with every OpenType feature kept is 113,224 B (UI symbols included), 239,016 B less per
   first visit. The editor's italic drops from 387,976 B to 125,592 B. Other scripts load on
   demand through `unicode-range`.
3. Numbers: Inter's own `tnum` is enough. One token and one class (`--pt-numerals`, `.pt-num`)
   replace 108 CSS declarations in 54 files and fix seven places that draw numbers in
   proportional figures today (the rulers, the presenter counter, the dialog and panel counts,
   the presentations list times).
4. Colour: culori 4.0.2 (MIT) at build time generates the ramps in OKLCH from the brand's seeds
   and checks every pair, at 0 B of page script. Radix Colors 3.0.0 does not hold the brand's ink
   (#070707 against gray12 #202020, CIEDE2000 6.3) and is kept only as the model for the twelve
   step roles. Two pairs fail WCAG 2.2 today: the menu key text on a hovered row (4.12:1) and the
   scrollbar thumb (2.17:1 light, 2.58:1 dark). Six files carry their own WCAG contrast function.
5. Overlays: every floating plate goes into the browser's top layer through the `popover`
   attribute and `<dialog>.showModal()` (0 B, Baseline since 2024), which removes the class of
   bug in item 1's screenshot. Placement moves to `@floating-ui/dom` in the editor (7,057 B gzip)
   with `autoUpdate`. Radix primitives (35,001 B gzip for popover, dropdown and tooltip) and
   Floating UI's React package (25,587 B gzip) cost more than the problems they solve here, and
   neither fits the landing's 4,757 B of gzip room.
6. Scrollbars: one CSS scrollbar that every scroller draws by default.
   41 rules in 31 files scroll today and the custom class reaches 17 files. The proposed thumb is
   4 px in an 8 px gutter in `--pt-field` (3.11:1 light, 3.95:1 dark), 0 B of script.
   OverlayScrollbars (14,948 B gzip plus 2,604 B of CSS) is not needed.

## 1. The original Inter

### 1.1 What ships today

| What | Where | Reading |
| --- | --- | --- |
| Upright face | `packages/fonts/assets/InterVariable.woff2`, described in `packages/fonts/src/inter.ts:15-29` | 352,240 B, "Version 4.001;git-9221beed3", axes `opsz` 14 to 32 and `wght` 100 to 900, 2,852 code points, 2,937 glyphs |
| Italic face | `packages/fonts/assets/InterVariable-Italic.woff2`, `inter.ts:36-50` | 387,976 B, same release |
| Provenance | `THIRD_PARTY_NOTICES.md:7-32`, `fonts.json` `source` and `license` | SIL OFL 1.1, no Reserved Font Name in either file, so renamed instances are permitted (OFL condition 3) |
| Web loading | `apps/studio/src/routes/__root.tsx:143-160`, `packages/fonts/src/inter.css:8-21` | the upright is preloaded on every route, the italic is prefetched on `/edit` only |
| Chrome stacks | `packages/chrome/src/tokens.css:133-135` | `--pt-display` and `--pt-text` are `'Inter', 'Inter Fallback', ...`; `--pt-mono` is the system mono stack for code and commands, which stays as it is |
| Slide renderer | `packages/theme/src/gt-ink-paper/sheet.css:40`, `packages/theme/src/tokens.ts:241` | the GT theme's display features are a token, `--display-features: 'cv11', 'ss01'`; a brand kit sets it to `normal` |
| Alternates in chrome | 87 `font-feature-settings: 'cv11', 'ss01'` rules in 42 files under `packages/chrome/src`, `packages/viewer/src` and `apps/studio/src` | the lockup word (`brand.css:131-139`), icon buttons (`tokens.css:418-426`), tooltip names (`Tooltip.css:44`), panel heads |
| PDF export | `packages/export/src/pdf/build.ts:1-20`, `packages/render/src/theme-node.ts:39-80` | Chromium prints the render document, which inlines the full InterVariable; the PDF embeds the original Inter already |
| PowerPoint export | `packages/fonts/export/fonts.json` (`"prefix": "GT Inter"`, line 4), `packages/export/src/pptx/fonts-map.ts:23-26`, `packages/fonts/src/export.ts:156-186` | 34 static TTFs cut from InterVariable: `GT Inter Text 14` to `GT Inter Text 26` (Regular and Medium, upright and italic), `GT Inter Display` (opsz 32, wght 500, `cv11` and `ss01` frozen into the default glyphs), and a `standard` set named `Inter` and `Inter Medium` |
| Export default | `packages/schema/src/export.ts:159-169` and `174-177` | font set `exact` (the GT names) by default; `embedFonts` is `false` by default |

The consequence of the last two rows: a PowerPoint file names `GT Inter Text 22` in its runs and,
by default, carries no font. No machine has a family by that name installed, so PowerPoint,
Keynote and Google Slides substitute. A file that named the upstream families (`Inter`,
`Inter Medium`, `Inter Display Medium`) would render in Inter wherever Inter is installed, and
Google Slides serves Inter itself.

### 1.2 Packages compared

| Source | Version | Upright file used on a Latin page | Features kept | Verdict |
| --- | --- | --- | --- | --- |
| rsms/inter release zip (what the repo vendors) | 4.1, git-9221beed3 | 352,240 B (full) | all 39: `cv01` to `cv14`, `ss01` to `ss08`, `tnum`, `pnum`, `zero`, `case`, `frac`, `sups`, `subs` and the rest | the source of truth; keep it vendored |
| `inter-ui` (npm, MIT packaging of the same release) | 4.1.1 | `variable-latin/InterVariable-subset.woff2`, 99,732 B | 38 (drops `ccmp` and `cv14`), 283 code points | same glyphs; a third party's subset ranges |
| `@fontsource-variable/inter` (Google Fonts build) | 5.3.0, git-66647c0bb | `inter-latin-opsz-normal.woff2`, 72,920 B | 8 only: `calt ccmp dnom frac locl numr pnum tnum` | rejected: no `cv11`, no `ss01`, no `zero`, no `case`, a different build |
| Our own subset of the vendored file (fontTools 4.63 `pyftsubset`, `--layout-features='*'`, both axes) | 4.1 | 113,224 B (Latin plus the UI symbols below) | all 38 that apply to the range, 341 code points | recommended |

The subset is cut by `scripts/build-fonts.py`, which already runs fontTools, so no dependency is
added. Measured file sizes for the upright (italic in brackets):

| `unicode-range` file | Bytes | Loads when |
| --- | --- | --- |
| Latin plus UI symbols: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2190-21FF, U+2212, U+2215, U+22EE-22EF, U+2303, U+2318, U+2325, U+2328, U+232B, U+238B, U+23CE, U+2580-259F, U+25A0-25FF, U+2713, U+26A0, U+FEFF, U+FFFD | 113,224 (125,592) | every page; preloaded |
| Latin Extended | 140,960 | a name or a slide with Polish, Czech, Turkish and similar letters |
| Cyrillic | 55,272 | Cyrillic text |
| Greek | 38,964 | Greek text |
| Vietnamese | 17,032 | Vietnamese text |
| The remaining 1,156 code points (symbols, arrows beyond the block above, circled forms) | 159,012 | the Special characters dialog and slides that use them |

The UI range was chosen by scanning the chrome, viewer and studio sources for characters above
U+007E: 623 distinct characters, most of them in the Special characters dialog's lists. The ones
the chrome draws in its own controls (`⋯ ⋮ ▾ ▸ ✓ ⚠ ↩ ⇥ ● █ ▄ ▀`) are in the Latin file.

### 1.3 Features to turn on

The release names every feature in the font itself (read from the `GSUB` feature parameters):
`cv01` alternate one, `cv02` open four, `cv03` open six, `cv04` open nine, `cv05` lower-case l
with tail, `cv06` simplified u, `cv07` alternate sharp s, `cv08` upper-case i with serif, `cv09`
flat-top three, `cv10` capital G with spur, `cv11` single-storey a, `cv12` compact f, `cv13`
compact t, `cv14` alternate capital sharp S, `ss01` open digits, `ss02` disambiguation, `ss03`
round quotes and commas, `ss04` disambiguation without slashed zero, `ss05` circled characters,
`ss06` squared characters, `ss07` square punctuation, `ss08` square quotes; plus `tnum`, `pnum`,
`zero`, `case`, `frac`, `numr`, `dnom`, `sups`, `subs`, `sinf`, `ordn`, `dlig`, `salt`, `calt`.

Proposal:

- Interface text (chrome, landing, dialogs): Inter's defaults, `calt` on (it raises the colon
  between figures, so `10:45` needs no feature), no character variants.
- Display text: the brand deck's `cv11` and `ss01` (DECK-GRAMMAR.md:21, `head.html` `h1, h2,
  .big`). Whether that stays in the chrome and the landing or moves into the GT theme only is
  question 1.
- Numbers: section 2.
- `font-optical-sizing: auto` stays; one variable file serves text and display.

### 1.4 Byte cost per page

| Route | Today (production, 2026-10-05) | Proposed |
| --- | --- | --- |
| `/home`, `/decks`, `/deck`, `/embed` | 352,240 B, one request, measured with Playwright after a full scroll on `/home` and on `/decks` | 113,224 B |
| `/edit` | 352,240 B plus the italic prefetch, 387,976 B: 740,216 B | 113,224 B plus 125,592 B: 238,816 B |
| A page that draws Cyrillic | inside the 352,240 B | plus 55,272 B on first use |
| Render documents, the standalone file, PDF and PowerPoint export | full file inlined (`theme-node.ts:79-80`, `inter.ts:138-143`) | unchanged: determinism and every script |

On production `/home` (2026-10-05, 55 requests after a full scroll) the font is the largest
response at 352,615 B over the wire, then the shared entry chunk at 330,827 B; every script
together is 454,308 B. `docs/LANDING.md:565` reports the font against a 120 KB line; the subset
meets it. The fallback
face's metrics (`inter.css:29-36`) are unchanged, because subsetting keeps the `hhea` and `OS/2`
tables. One risk: the renderer's measuring code (`packages/viewer/src/canvas-measure.ts`,
`text-fit.ts`) must wait for the faces that cover a slide's text. `document.fonts.load('22px
Inter', text)` resolves the subsets whose ranges the text touches, so the renderer passes the
slide's own text to it.

### 1.5 The PowerPoint and PDF export

The PDF needs no change. For PowerPoint, the per-size cuts exist because the web sets 22 px text
at `opsz` 22 while a static `Inter` is the `opsz` 14 design, which is wider. Measured on the
vendored file with fontTools' instancer, for one 77-character line:

| Size | Web optical size | Upstream static `Inter` against the web line, weight 400 (500) |
| --- | --- | --- |
| 14 px | 14 | 0.00 % (0.00 %) |
| 18 px | 18 | +1.94 % (+1.77 %) |
| 22 px | 22 | +4.00 % (+3.59 %), 29.7 px on a 744 px line |
| 26 px | 26 | +6.13 % (+5.49 %) |
| 44 px and up | 32 | upstream `Inter Display` is the opsz 32 design: 0 % |

The exporter already takes width back as character spacing (`packages/export/src/pptx/face-advance.ts:1-6`,
measured 0.82 % at 27 px today). The same table, filled from the numbers above, lets the text runs
travel under the upstream names. Proposal:

- Default font set: the upstream families `Inter`, `Inter Medium` (text) and `Inter Display`,
  `Inter Display Medium` (44 px and up), with the width difference written as run spacing.
  The upstream static files carry these names in their name table (read from `inter-ui` 4.1.1:
  name ID 1 `Inter Medium`, ID 16 `Inter`, ID 17 `Medium`; `Inter Display Medium`; `fsType` 0).
- The per-size set stays as a second choice, renamed without the GT prefix (question 2).
- A theme whose display text uses `cv11` and `ss01` needs those glyphs frozen into a face,
  because DrawingML has no attribute for a stylistic set. Only the GT theme does; its one frozen
  face takes a name without GT (question 2).
- Decks keep working: a deck stores a font id and no family name, so no stored deck changes.
  Files already exported keep `GT Inter` in their runs; `SHEET_FAMILIES` (`packages/export/src/pptx/text.ts:75`)
  keeps `'GT Inter'` so a re-import of an old file still maps it to Inter.
- Words to change: `ExportMenu.tsx:97-106` ("Three family names: GT Inter Display, Inter, Inter
  Medium"), `schema/src/export.ts:159-169`, `docs/pptx.md:41-44`, `fonts.json` `prefix`.

Cost: one `build-fonts.py` run, a `fonts.json` schema change, the face-advance table rows, and
the export tests that name `GT Inter` (`packages/fonts/src/export.test.ts`, 14 lines;
`packages/export/src/pptx/text.test.ts`, 5; `report.test.ts`, 4; `export-pptx.test.ts`, 3).

## 2. Numbers in Inter

Picture: `research-type/numerals.png` (Inter 4.1 at 30 px, the features side by side, and a
right aligned column in proportional and tabular figures).

What the font offers for figures: `tnum` (tabular, every digit one advance), `pnum`
(proportional, the default), `zero` (slashed zero), `ss01` (open 4, 6 and 9), `ss02` (slashed
zero, serif I, tailed l), `cv01` (alternate one), `cv09` (flat-top three), `case` (case-height
dashes and brackets), `frac`, `sups`, `subs`. `calt` raises the colon between figures without
being asked.

Today: 108 `font-variant-numeric: tabular-nums` declarations in 54 CSS files and 12 in six
TypeScript files, plus `'tnum'` inside `font-feature-settings` in 7 files. Seven places draw
numbers that sit in a column or change in place without tabular figures:

| Place | File and line |
| --- | --- |
| Ruler numerals | `packages/chrome/src/Rulers.css:63-66` (the file has no tabular rule) |
| Presenter slide counter | `packages/viewer/src/present/PresenterConsole.css:106-113` |
| Dialog counts | `packages/chrome/src/Dialog.css:646-649` |
| Format options count | `packages/chrome/src/FormatOptions.css:92-96` |
| Diagram count label | `packages/chrome/src/DiagramPanel.css:22-24` |
| Presentations list times | `apps/studio/src/routes/decks.css:533-535` and `665-667` |

Proposal, in `packages/chrome/src/tokens.css` beside `.pt-scroll` and `.pt-focus`:

```css
:root {
  /* every number that sits in a column or changes in place: counters, slide numbers, sizes and
     positions, times, revisions, byte counts, the landing's numbers row */
  --pt-numerals: tabular-nums;
}

.pt-num {
  font-variant-numeric: var(--pt-numerals);
}

/* identifiers read character by character: revision ids, hex values, share codes */
.pt-num[data-num='code'] {
  font-variant-numeric: tabular-nums slashed-zero;
}
```

`font-variant-numeric` is the right property because it combines with a rule's
`font-feature-settings: 'cv11', 'ss01'`; a second `font-feature-settings` list would replace the
first. The 108 existing declarations become `font-variant-numeric: var(--pt-numerals)` (one
mechanical edit), new elements take the class, and the seven places above get it. Cost: about
0.1 KB of CSS. The slide renderer keeps its own `numerals: 'tabular'` typography field
(`packages/schema/src/typography.ts:232`).

## 3. Colour

### 3.1 Today

Colour literals counted outside comments and tests (`scratchpad/type/colors.mjs`):

| Area | Literals | In token declarations | Direct uses |
| --- | --- | --- | --- |
| `packages/chrome/src` (284 files) | 111 | 48 | 63 |
| `packages/viewer/src` | 14 | 0 | 14 |
| `apps/studio/src` without the landing | 66 | 2 | 64 (33 of them in the logo fixtures) |
| The landing (`components/home`, `routes/home.css`) | 49 | 22 | 27 |
| `packages/theme/src` (the token data) | 98 | 24 | 74 |
| `packages/render/src` | 27 | 0 | 27 |
| `packages/identity/src` | 20 | 0 | 20 |

113 distinct values; the top five are `#070707` (51), `#ffffff` (40), `#2f5ce0` (25), `#8a8f98`
(18) and `#f2f2f0` (18). Against that, `var(--pt-...)` is read 2,682 times, so the chrome is
mostly tokenized; the stray literals are the theme swatches (`ThemesPanel.css:57-160`,
`decks.css:472-478`), two shadows with their own black (`Dialog.css:33`, `inspector/chart.css:238`),
`Overlay.css:350` (`rgba(0, 0, 0, 0.4)`), the panel text dims on the landing (`home.css:952`,
`1014`) and fallbacks.

Two tokens are read and never declared, so their fallback colour is the value:
`--pt-panel-text-2` (`apps/studio/src/components/Slideshow.css:83`) and `--pt-panel-dim`
(`apps/studio/src/routes/home.css:775`).

Six modules carry their own WCAG contrast arithmetic:
`packages/lint/src/rendered/palette.ts:91-100`, `packages/identity/src/hues.ts:83-95`,
`packages/render/src/theme-css.ts:156-166`, `packages/theme/src/brand.ts:462-476`,
`packages/chrome/src/inspector/palette.tsx:97-106` and
`apps/studio/src/components/home/live/paint.ts:78-88` (a seventh luminance in
`apps/studio/src/server/logo-index.ts:892`).

Every pair the chrome draws, both appearances, from `tokens.css` (picture `research-type/ramps.png`,
lower table): of the 32 gated readings (16 per appearance; the disabled text and the hairline are
exempt and only reported), 29 hold. The three that fail sit in two pairs:

| Pair | Light | Dark | Floor |
| --- | --- | --- | --- |
| Menu key text (`--pt-titanium`, `Menu.css:143-144`) on a hovered row (`--pt-plate`, `Menu.css:68-71`) | #6f747d on #f0f0f0, 4.12:1 | 5.36:1 | 4.5:1, SC 1.4.3 |
| Scrollbar thumb (`--pt-thumb`, `tokens.css:61` and `186`) on paper | 2.17:1 | 2.58:1 | 3:1, SC 1.4.11 |

APCA reads the dark appearance's secondary text much weaker than the light one: `--pt-titanium`
is Lc 72.6 on white and Lc 41.8 on #070707, while WCAG 2.2 passes both (4.70:1 and 6.20:1).

### 3.2 Libraries compared

Bundle sizes are esbuild 0.25 minified ESM with React external, gzip level 9 (brotli 11 in
brackets). Bytes do not depend on machine load.

| Library | Licence | What it gives | Size if shipped to a page | Use |
| --- | --- | --- | --- | --- |
| culori 4.0.2 | MIT | OKLCH and OKLab, gamut clamping (`clampChroma`), `wcagContrast`, CIEDE2000, interpolation | whole 23,259 (19,934); `culori/fn` with OKLCH and contrast 6,810; contrast alone 4,282 | recommended, build time and Node: 0 B on pages |
| Radix Colors 3.0.0 | MIT | 31 hand-tuned 12-step scales in light, dark, alpha and P3 | six scale pairs as JS 1,088 | not adopted for values; its step roles are the model |
| colorjs.io 0.7.1 | MIT | the CSS Color 4 reference code, CSS gamut mapping, `contrastAPCA` and `contrastWCAG21` | tree-shaken 19,323 (16,951) | test dependency for APCA readings |
| apca-w3 0.1.9 | "Limited W3 License", AGPL v3 outside the W3 agreement | APCA | 4,355 | rejected: the licence does not fit an MIT repository |

Radix Colors against the brand, nearest step by CIEDE2000 (`ramps.mjs`):

| Brand value | Nearest Radix step | Difference |
| --- | --- | --- |
| ink #070707 | gray12 #202020 | 6.30 |
| ink-2 #3a3d44 | slate12 #1c2024 | 9.60 |
| titanium #8a8f98 | slate9 #8b8d98 | 2.19 |
| GT blue #2f5ce0 | indigo10 #3358d4 | 1.97 |
| green #12a37a | jade9 #29a383 | 2.59 |
| amber #f0a020 | amber8 #e2a336 | 3.79 |
| red #e5484d | red9 #e5484d | 0 (the brand's red is Radix red9) |
| guide #d6336c | crimson10 #df3478 | 2.91 |

A difference above 2 is visible side by side. Adopting Radix values would change the ink, ink-2
and GT blue; Radix publishes its custom-scale generator as a page on radix-ui.com, and the
package has no generator. culori generates scales from the exact seeds.

### 3.3 The generated ramps

Picture: `research-type/ramps.png`. `scratchpad/type/lab/ramps2.mjs` builds, per hue and per
appearance, twelve steps in OKLCH with Radix's roles (1 and 2 grounds, 3 to 5 component grounds,
6 to 8 lines, 9 and 10 solids, 11 and 12 text):

- Step 9 is the seed byte for byte, so the brand values do not move.
- Steps 1 to 8 sit at fixed lightness targets with chroma tapering toward the ends.
- The text steps are solved for their floor: step 11 is the first lightness from the seed that holds
  4.5:1 against step 2, step 12 holds 11:1.
- A hue's glyph role is the seed when it holds 3:1 on paper, else the solved value. For amber on
  white the solver returns #cd8500 (3.02:1), the same move the product round made by hand to
  #c47d00 (`tokens.css:65-73`).
- The neutral ramp keeps paper and ink at its ends and ink-2 at step 11; its step 10, the
  secondary text, is solved against step 3, the hover ground: #686c75 in light (5.26:1 on paper,
  4.53:1 on the generated hover ground #eceef2), which fixes the menu key pair.

Known gap of the draft: in the dark neutral ramp steps 9 and 10 both resolve to #8a8f98, because
titanium already holds 4.5:1 there; question 4 decides whether that step lifts.

### 3.4 One tokens module

- `packages/theme/src/palette.ts`: the seeds (paper, ink, ink-2, titanium, GT blue, green,
  amber, red, guide) per appearance, the roles and their floors (text 4.5:1, boundary and glyph
  3:1, decorative 0). Data only, framework free.
- `scripts/build-colors.ts`: runs culori over `palette.ts` and writes
  `packages/chrome/src/colors.generated.css` (the `--pt-` colour custom properties for `:root`,
  `.ts-overlay[data-theme='light']` and both dark selectors, as sRGB hex with the OKLCH value in
  a comment) and `packages/theme/src/colors.generated.ts` (the same values as data for the export,
  the lint and the identity marks). `tokens.css` keeps every name and imports nothing new; its
  colour block is the generated one.
- `packages/theme/src/colors.test.ts`: every text pair at its WCAG 2.2 floor in both appearances,
  the APCA Lc of each written to the test's output, and the parity assertion the repo already
  uses for `sheet.css` and `tokens.ts` (`tokens.test.ts`).
- `packages/theme/src/contrast.ts`: one WCAG relative luminance and ratio function (about 30
  lines) for the browser paths, pinned in the test against culori's `wcagContrast` over the
  generated pairs. The six copies listed in 3.1 import it. The landing cannot afford culori
  (4,282 B gzip for contrast alone, against 4,757 B of room in the page's own script and 66 B in
  its live core).
- The GT theme's sheet keeps its own values (`sheet.css`, parity with Prototemplate
  `head.html`); the generator reproduces those exactly at their steps, so no slide render moves.

Cost: culori and colorjs.io as devDependencies (catalog pins), 0 B of page script, about 1 KB of
generated CSS that replaces the hand-written colour declarations inside `tokens.css:26-197` (the
sizes, durations and font stacks in that range stay where they are).

## 4. Overlays, focus and outside click

### 4.1 Today

- Placement is written three times: `placeMenu` (`packages/chrome/src/Menu.tsx:140-191`),
  `place` (`packages/chrome/src/Tooltip.tsx:314-337`) and `anchoredAt`
  (`packages/chrome/src/pickers/ColorPlate.tsx:60-72`). Each computes once at open; none follows
  the anchor when a panel scrolls or the window resizes.
- Stacking is a z-index per file: 134 declarations, 26 distinct values, with the floating layers
  at 16 (palette), 20 (help card, export report, name prompt plate `TitleRow.css:497-501`), 21
  (toast, snackbar), 30 (menus, insert, export, roster and account plates `presence.css:237-239`),
  30 plus the level inline (`Menu.tsx:579`, `891`), 34 and 40 (dialog scrim and card), 40
  (tooltip, chart popover), 60 (pickers) and 120 (hover preview). `Menu.tsx:843` and
  `PreviewLayer.tsx:310` portal to the body and the tooltip manager appends its one element to the
  body (`Tooltip.tsx:269`); the other plates are `position: fixed` where they render and stack
  inside whatever stacking context their parent opens. Item 1's screenshot shows the presence
  slot's tooltip ("Who is in this presentation now. Nobody else has it open",
  `PresenceSlot.tsx:87`) and the name prompt plate competing for the same band under the title
  row.
- Outside click: 23 document or window `pointerdown` and `mousedown` listeners in 21 files.
- Focus: `Dialog.tsx:273` traps Tab by hand; menus run their own roving focus.

### 4.2 Options compared

| Option | gzip (brotli) | Stacking | Placement | Dismiss and focus | Migration |
| --- | --- | --- | --- | --- | --- |
| Platform: `popover` attribute, `<dialog>.showModal()`, CSS anchor positioning | 0 | top layer, newest on top, no z-index | CSS `position-anchor`, `position-area`, `position-try-fallbacks` (flip only, no shift along the edge) | `showModal()` makes the page inert, contains Tab, closes on Escape and returns focus; `popover="auto"` adds outside click, which needs DOM ancestry between nested popovers that React portals break | small for stacking (attribute and `showPopover()` in about 16 components); placement depends on the browser floor |
| `@floating-ui/dom` 1.8.0 (computePosition, offset, flip, shift, size, arrow, autoUpdate) | 7,057 (6,362) | none of its own; pairs with the top layer | yes, with `autoUpdate` | none | replace the three functions with one shared `place()` |
| `@floating-ui/react` 0.27.20 (adds useDismiss, FloatingFocusManager, useListNavigation, useTypeahead, safePolygon, FloatingPortal) | 25,587 (22,978) | portal plus z-index | yes | yes | rewrite of `Menu.tsx` (898 lines) and `Tooltip.tsx` (538 lines) behaviour |
| Radix popover, dropdown menu and tooltip 1.1.23, 2.1.24, 1.2.16 | 24,138, 31,513, 19,291; the three 35,001 (31,025) | portal plus z-index | Floating UI inside | DismissableLayer, FocusScope, RovingFocusGroup | replaces the chrome's Menu, Tooltip and plates; the tooltip contract (`data-tip`, `scripts/tooltip-audit.mjs`) and the tooltip's rest and press rules (POLISH 2.6 item 61) would be rebuilt |

Browser support for the platform row: the Popover API is Baseline since 2024 (Chrome 114, Safari
17, Firefox 125). CSS anchor positioning became Baseline newly available in January 2026 when
Firefox 147 shipped it (web.dev, "New to the web platform in January", 2026), after Chrome 125
and Safari 26. Safari 18 and older have no anchor positioning.

Budgets: the landing's own script reads 115,243 B gzip against its 120,000 B line
(`docs/LANDING.md:576`), 4,757 B of room, and its live core has 66 B. Only the platform row fits
there. The editor's preload ceiling is 2,000,000 B decoded (`scripts/check-client-bundle.mjs`),
where 17,476 B decoded for `@floating-ui/dom` is small.

### 4.3 Recommendation

1. Every floating plate enters the top layer: `popover="manual"` and `showPopover()` on the menu
   portal node, the tooltip manager's one element, the roster and account plates, the insert,
   export, font, icon, weight and colour pickers, the chart popover, the sidebar row menu, the
   name prompt plate, the help card, the export report, toasts and snackbars; dialogs become
   `<dialog>` opened with `showModal()`. `manual` keeps today's dismiss code in charge, so nested
   menus behave as they do now. One rule in `tokens.css` resets the browser's popover styles
   (`[popover] { inset: auto; margin: 0; padding: 0; border: 0; background: none; color:
   inherit; overflow: visible; }`) before each plate's own sheet draws it. The 27 z-index
   declarations at 9 and above, the floating layers, go away; what stays is z-index inside the
   stage and the panels. Cost: 0 B.
2. One shared `place(anchor, plate, options)` in `packages/chrome/src` on `@floating-ui/dom`
   with `offset`, `flip`, `shift` (8 px from the viewport edge, the margin all three functions use
   today), `size` (the menus' max height) and `autoUpdate`, used by every plate in the editor.
   The phone submenu rule of `placeMenu` (`Menu.tsx:163-172`) stays as a placement option. Cost:
   7,057 B gzip in the editor's chunk.
3. One shared `useDismiss(ref, onClose)` hook replaces the 21 copies of the outside click
   listener (0 B).
4. The landing uses the platform only: the top layer and, for its demonstration menus, CSS
   anchor positioning with the current script as the fallback where `CSS.supports('anchor-name:
   --a')` is false.
5. CSS anchor positioning replaces `@floating-ui/dom` in the editor once the browser floor drops
   Safari 18 (question 5).

## 5. Scrollbars

Picture: `research-type/scrollbars.png` (today's `.pt-scroll` and the proposed one, light and
dark, at 2x; the lower right box shows the pointer state).

Today: `.pt-scroll` and `.pt-scroll-x` (`packages/chrome/src/tokens.css:199-282`) draw a 2 px
thumb of `--pt-thumb` (ink at 0.32) in a 4 px gutter, applied by class in 17 files. 41
`overflow: auto` or `scroll` rules in 31 files draw the browser's scrollbar or their own: the
menus (`Menu.css:24`), the dialog bodies and lists (`Dialog.css:119`, `324`, `564`, `684`), the
font lists (`FontPicker.css:66`, `176`), the comment list (`comments/comments.css:82`), the
export and insert menus, the zoomed stage (`packages/viewer/src/Editor.css:84`), the presenter
notes and the landing's hero filmstrip (`home.css:2096-2103`, hidden). `inspector/chart.css:72-90`
and `MenuBar.css:57-61` keep their own copies.

Proposal, all in `tokens.css`, 0 B of script:

- The scrollbar applies to every scroller by default: `::-webkit-scrollbar`, `-track`, `-thumb`
  and `-button` rules at the root with zero specificity (`:where(*)`), and for Firefox
  `@supports not selector(::-webkit-scrollbar) { :root { scrollbar-width: thin; scrollbar-color:
  var(--pt-field) transparent; } }`. `.pt-scroll` keeps the overflow and `scrollbar-gutter:
  stable` duties only. The per-file copies above are removed.
- Geometry: an 8 px gutter, a 4 px thumb (2 px transparent border, `background-clip:
  padding-box`), 6 px under the pointer or while dragged, a 32 px minimum length, no track, no
  buttons, the radius from the surfaces round's token (2 px if it has none).
- Colour: `--pt-field` (ink at 0.44: 3.11:1 on white, 3.07:1 on the light hover ground, 3.95:1 on
  the dark paper), `--pt-ink-2` under the pointer. On the ink panels (the agents terminal, the
  presenter) a `--pt-thumb-on-ink` of white at 0.44 (#797979 on #101010, 4.37:1). `--pt-thumb`
  is retired.
- Scrolling stays native, so sticky headers, the filmstrip's drag and reorder, and wheel and
  touch momentum are untouched.

Two facts for whoever builds it. `scrollbar-color` is inherited: a root rule such as the landing
mock's (`design-round/landing/mock/mock.css:67-69`) reaches every descendant, and Chromium 121
and later stop reading `::-webkit-scrollbar` on any box whose `scrollbar-color` or
`scrollbar-width` is not `auto`, which is why `tokens.css:216-221` resets both; the Firefox-only
`@supports` block above avoids it. And Playwright's default headless shell hides scrollbars:
`scrollbars.png` drew thumbs only when launched with `channel: 'chromium'` and
`ignoreDefaultArgs: ['--hide-scrollbars']` and captured without `fullPage`; a full-page capture
drew the gutters and no thumbs.

OverlayScrollbars 2.16.0 (MIT) was measured: 14,948 B gzip of script plus 2,604 B of CSS, one
wrapper element and one initialization per scroller. It draws the same thumb on every operating
system and can hide it at rest. The CSS proposal draws the same thumb in Chromium and Safari and
the thin native one in Firefox; nothing in the request needs the library.

## 6. Measurements and method

| Reading | How | Load (1 minute average) |
| --- | --- | --- |
| Font tables, features, names, sha256 | fontTools 4.63 on the vendored files and the npm packages | 457 at 15:36 |
| Subset sizes | `python3 -m fontTools.subset ... --layout-features='*' --flavor=woff2` | 107 to 154 |
| Advance widths per optical size | `fontTools.varLib.instancer` at opsz 14, 18, 22, 26, 32 and wght 400, 500 | 107 to 154 |
| Production font bytes | Playwright 1.62.1 against `https://www.turboslide.com/home` and `/decks`, response bodies, after 30 wheel steps | 154 at 16:07 |
| Production transfer sizes on `/home` | Playwright `request.sizes()` for every finished request after 30 wheel steps | 213 at 16:17 |
| Library sizes | esbuild 0.25, `--minify --format=esm --platform=browser --target=es2022`, React external, `gzip -9`, brotli 11 | 107 |
| Colour counts and undeclared tokens | `scratchpad/type/colors.mjs`, `scratchpad/type/undeclared.mjs` | 107 |
| Contrast | culori `wcagContrast` and colorjs.io `contrastAPCA` over `tokens.css` values, translucent tokens composited over paper | 107 |

No timing is read in this report, so the load does not void any number here. Scripts and the lab
`package.json` live in
`/private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad/type/`.

## 7. Pictures

- `research-type/numerals.png`: Inter 4.1's numeral features and a column in proportional and
  tabular figures.
- `research-type/ramps.png`: the culori ramps in both appearances, seeds outlined, and the 36
  pairs `tokens.css` draws today with WCAG ratio and APCA Lc.
- `research-type/scrollbars.png`: today's scrollbar and the proposed one, light and dark, at 2x.

## 8. Questions only Kevin can answer

1. The brand deck's alternates `cv11` (single-storey a) and `ss01` (open digits) are set on the
   chrome's and the landing's display text today (87 rules). Keep them there, or keep them only
   inside the GT theme's slides so the product draws Inter's default glyphs? Default: only inside
   the GT theme; the chrome and the landing draw Inter's defaults.
2. Should an exported PowerPoint file name the upstream families (`Inter`, `Inter Medium`,
   `Inter Display`), which any machine with Inter installed and Google Slides can draw, with the
   width difference written as spacing, or keep the per-size cuts as the default for their exact
   widths? Default: upstream names by default; the per-size set stays as a second choice renamed
   `Inter Text 14` to `Inter Text 26`; the GT theme's one frozen display face is named
   `Inter Display Alternates`.
3. The slashed zero: on for identifiers only (revision ids, hex values, share codes), or on every
   figure? Default: identifiers only.
4. The gate is WCAG 2.2. APCA reads the dark appearance's secondary text at Lc 41.8. Lift dark
   `--pt-titanium` from #8a8f98 to #91969f (Lc 45.4, 6.78:1), or leave it? Default: lift it.
5. The browser floor for the editor: does Turboslide support Safari 18 and older? Default: yes
   through 2026, so placement uses `@floating-ui/dom` and CSS anchor positioning waits.
6. The scrollbar: always visible in an 8 px gutter as proposed, or hidden until the pointer moves
   over the scroller? Default: always visible.
