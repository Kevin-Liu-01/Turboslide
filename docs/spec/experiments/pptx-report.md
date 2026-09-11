# Turboslide export fidelity experiment: PPTX

Written 2026-09-10 for Kevin Liu. Everything in this directory was generated on this machine during the experiment; nothing under `/Users/kevinliu/repos` was modified. All measurements below come from the scripts listed in section 8 and the JSON files they wrote under `out/`. Where a claim is about a renderer that is not on this machine, it carries a URL and is marked as unverified here.

Environment: macOS 26.4, Node 24.13.0, pnpm 11.15.1, pptxgenjs 4.0.1, jszip 3.10.2, pixelmatch 7.2.0, pngjs 7.0.0, playwright-core 1.62.0 (loaded through `createRequire` from `/Users/kevinliu/gt/gt-cloud-wt-diagrams/apps/redesign/package.json`), Chrome for Testing 147.0.7727.15 (the `chromium-1217` build), Python 3.14.6 with Pillow 12.3.0, and a uv venv at `.venv` with python-pptx 1.0.2, lxml 6.1.3, fontTools 4.65.0 and brotli. cargo 1.98.1 and Go 1.26.5 are installed and were not needed for this experiment.

## 1. Summary

1. pptxgenjs 4.0.1 emits everything the deck's text needs except weight and kerning: `sz` in hundredths of a point (`2640` for 44 px), negative tracking (`spc="-66"` for -0.025 em at 44 px), exact pitch (`<a:spcPts val="1980"/>` for 33 px), zero insets, top anchor, soft line breaks (`<a:br/>`) and no autofit element unless `fit` is set. Every value was read back from the package XML (section 4.2).
2. Two deviations pptxgenjs forces: weight 500 has no attribute (only `b="1"`), so the medium cut must travel as its own family name (`Inter Medium` here), and every `spc` comes with `kern="0"`, which turns kerning off. Losing kerning costs under 1 percent on a mixed-case heading and 9.1 percent on an all-caps 88 px line in Inter (section 4.5). A post-process that deletes `kern="0"` fixes the second.
3. Geometry round-trips exactly. The page is 12,192,000 by 6,858,000 EMU when the layout is defined as 13.333333 in (13.3333 gives 12,191,970). python-pptx reads the heading box back at 1.1417, 1.075, 11.07, 0.4033 in, which is the browser's `getBoundingClientRect` divided by 120.
4. PNG alpha survives the package byte for byte (sha256 match, IHDR color type 6) and Apple's QuickLook renderer honors it: the four corner pixels of every icon box are the paper color in both themes.
5. LibreOffice is not installed (no `soffice`, no `/Applications/LibreOffice.app`, no cask), and neither PowerPoint nor Keynote is. macOS QuickLook (`qlmanage`) is the only PPTX renderer here, so the diff in section 4.3 is QuickLook against Chromium, first slide only, at 1600 by 902 pixels. Against the browser render, slide 1 mismatches 2.13 percent of pixels (light) and 2.58 percent (dark); hairlines land within 1 px of the browser's rows; the first text baseline lands within 1 px. Almost all of the remaining mismatch is font substitution.
6. Inter is not installed on this Mac, so every renderer substituted. Chromium with bare `font-family: Inter` draws Times (its standard font), the deck's own stack falls to Helvetica Neue, and QuickLook drew a Times-class serif for both `Inter` and `Inter Medium`. Measured against Inter at the same size and tracking, Helvetica Neue is 3.9 percent wider on the heading and 1.9 percent narrower on the body line; Times is 5.3 and 11.7 percent narrower. Line breaks would move without the explicit `<a:br/>` breaks (section 4.4).
7. Two-tone dithers go grey under any resampling. QuickLook renders its thumbnail at 1600 by 902, a 0.2 percent vertical stretch, and 17.96 percent of the picture's cells came out grey with 71.99 percent cell-exact, identically for a 1-bit palette PNG, an 8-bit palette PNG, RGB and RGBA, as the slide background or as a picture (section 4.7). The encoding does not matter; the scale does.
8. Custom geometry needs no second library: pptxgenjs `points` produced a `custGeom` with 4 `moveTo`, 128 `lnTo` and 4 `close` for the GT mark path, and python-pptx exposes the same through `build_freeform`. Neither writes a fill rule (`<a:path w= h=>` has no `fill` attribute), so the mark's counters are still unverified in PowerPoint.
9. Font embedding needs raw OOXML. pptxgenjs issue #176 is closed without an implementation and python-pptx issue #355 is open with no API. `embed-font.py` wraps the deck's Inter Variable TTF in an EOT header and injects `ppt/fonts/font1.fntdata`, the font relationship, the `application/x-fontdata` content type and `<p:embeddedFontLst>`; python-pptx reopens the result and QuickLook still renders it, but QuickLook ignores the embedded font (its render differs from the plain file in 495 of 360,000 sampled pixels). PowerPoint acceptance is unverified here.
10. Paper Shaders ships Apache-2.0 (LICENSE and NOTICE in both `@paper-design/shaders` and `@paper-design/shaders-react` 0.0.78). The vanilla package imports in bare Node (69 exports, 18 ms) but `ShaderMount` throws `Paper Shaders: parent element must be an HTMLElement` without a DOM node and `Paper Shaders: WebGL is not supported in this browser` without a `webgl2` context, and it also uses `ResizeObserver`, `IntersectionObserver`, `visualViewport` and `requestAnimationFrame`. headless-gl only implements WebGL 1. Headless Chromium renders it: 43 ms to first frame on this Mac's GPU through ANGLE Metal, 42 ms with SwiftShader software rendering (`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`), a 3200 by 1800 canvas for a 1600 by 900 element (section 4.11).

## 2. What was built

Two files per theme, `out/turboslide-light.pptx` and `out/turboslide-dark.pptx` (106,897 and 106,751 bytes), with identical geometry and three slides each, plus `-opener-first` variants (the opener as slide 1) because QuickLook only renders the first slide.

- Slide 1, the text plus ruled table archetype on paper: a slide master `DECK_PAPER` carrying the two rails, the two rules and the four registration crosses as 0.6 pt lines in composite colors (light `#D2D2D2` hair, `#A1A1A1` cross; dark `#3B3B3A`, `#5B5B5B`), a 44 px h2 in `Inter Medium` with `spc -66`, a 22 px paragraph with three soft breaks copied from the browser, a four-row `.rows` table as five hairlines plus key and value text boxes, the Heroicons check circle in `#12a37a` as a 60 by 60 RGBA PNG (799 bytes) placed at 20 by 20 px, the counter, and speaker notes.
- Slide 2, the Brand opener: the two-tone `opener-brand` twin as the slide background (`p:bg` blip fill, palette PNG 5,035 bytes light and 4,890 bytes dark), the rails and crosses as alpha lines (`<a:alpha val="18000"/>` and `38000`) because they cross the picture, a paper rectangle at the plate box measured from the DOM (137, 538.94, 740 by 232.06 px), two paper chips under the wordmark and counter positions, the 72 px `.big` word with `spc -108`, the sentence with one soft break, the 15 px credit with `spc 9`, and notes.
- Slide 3, probes read back by `inspect-xml.mjs`: negative and positive `charSpacing`, `lineSpacing` and `lineSpacingMultiple`, `bold`, `transparency: 100` text, `fit: 'shrink'`, `strike`, an RGBA alpha ramp plain and with `transparency: 50` over black, an alpha line, and the GT mark as `custGeom` from the deck's own `M/L/Z` path (136 points).

Assets: `assets/opener-brand-{light,dark}-2tone.png` cut from `deck/shots/opener-brand-light.jpg` and `opener-brand.jpg` at threshold 128 (the JPEGs are 99.7 percent at the extremes; 0.30 percent of pixels were mid-tone and snapped), with the deck's exact paper and ink in a two-entry palette; `assets/check-circle-ok@3x.png` screenshotted from the deck's sprite with `omitBackground`; `assets/alpha-ramp.png` (64 by 64 RGBA); `fonts/InterVariable.ttf` decoded from `deck/fonts/deck-fonts.css`.

Pipeline: `render.mjs` assembles each slide with the deck's `parts/head.html` CSS (the `<style>` block up to the viewer chrome divider plus the stage rules), renders at 1600 by 900 in both themes, and writes `out/measure.json` from `getBoundingClientRect` and `Range.getClientRects` (line boxes grouped by top, text split at line boundaries with a per-character caret walk). `build-pptx.mjs` converts px to inches at 120 px per inch and to points at 0.6 pt per px and emits the PPTX. `inspect-xml.mjs` unzips and greps the DrawingML. `qlmanage -t -s 1600` renders the first slide. `compare.mjs` diffs with pixelmatch at threshold 0.1 and measures ink bounding boxes per region.

## 3. Renderers on this machine

| Renderer                                                                | Present | Used                                             |
| ----------------------------------------------------------------------- | ------- | ------------------------------------------------ |
| LibreOffice (`soffice`, `/Applications/LibreOffice.app`, Homebrew cask) | No      | No                                               |
| Microsoft PowerPoint                                                    | No      | No                                               |
| Keynote                                                                 | No      | No                                               |
| macOS QuickLook (`/usr/bin/qlmanage`)                                   | Yes     | Yes, first slide only, 1600 by 902 px thumbnails |
| Chromium (Chrome for Testing 147 through playwright-core)               | Yes     | Yes, the reference render                        |
| `pdftoppm` (poppler)                                                    | Yes     | Not needed without a PDF                         |

LibreOffice install, not run: `brew install --cask libreoffice` (cask version 26.8.0 on 2026-09-10, https://formulae.brew.sh/cask/libreoffice). Then the verification loop this experiment could not run: `soffice --headless --convert-to pdf --outdir out out/turboslide-light.pptx` (https://help.libreoffice.org/latest/en-US/text/shared/guide/start_parameters.html), then `pdftoppm -r 120 -png out/turboslide-light.pdf out/lo` so the 13.333 in page comes out 1600 px wide, then `node compare.mjs` pointed at those PNGs. Install a static Inter and an `Inter Medium` face first, or every text box renders in a substitute; LibreOffice 26.8 is the first release with variable font support (https://blog.documentfoundation.org/blog/2026/08/26/libreoffice-26-8/), so static instances stay the safe path. LibreOffice 25.8 also changed how it decides which fonts to embed when it writes PPTX (https://wiki.documentfoundation.org/Special:MyLanguage/ReleaseNotes/25.8); whether it reads `.fntdata` on import is not documented in the pages I could reach.

## 4. Measurements

### 4.1 Browser measurement to PPTX geometry

Sheet 1600 by 900 px on 13.333333 by 7.5 in: 1 px = 1/120 in = 0.6 pt = 7,620 EMU.

| Element              | Browser box (px)                                                                           | Computed style                                           | Emitted                                                                                                                       | XML                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| h2 "Export fidelity" | 137, 129, 1326 by 48.39                                                                    | Inter 500, 44 px, -1.1 px tracking, 48.4 px line         | x 1.14167 in, y 1.075 in, 26.4 pt, charSpacing -0.66, lineSpacing 29.04                                                       | `sz="2640" spc="-66" kern="0"`, `<a:spcPts val="2904"/>`, `typeface="Inter Medium"` |
| p1 (three lines)     | 137, 195.39, 767.58 by 99; lines at y 198.39, 231.39, 264.39, widths 742.17, 724.41, 152.5 | Inter 400, 22 px, normal tracking, 33 px line            | 13.2 pt, lineSpacing 19.8, two `softBreakBefore` runs                                                                         | `sz="1320"`, `<a:spcPts val="1980"/>`, two `<a:br/>`                                |
| `.rows`              | 137, 436.19, 1326 by 249; rows 62 px tall at y 437.19, 499.19, 561.19, 623.19              | keys Inter 500, 20 px, -0.2 px; values 20 px, 29 px line | five 0.6 pt lines at y 436.69, 498.69, 560.69, 622.69, 684.69 px; keys 12 pt charSpacing -0.12; values 12 pt lineSpacing 17.4 | `sz="1200" spc="-12"`, `<a:spcPts val="1740"/>`, `<a:ln w="7620">`                  |
| icons                | 137, 458.19 (and +62 per row), 20 by 20                                                    | `#12a37a`                                                | `addImage` 3x PNG at the svg box                                                                                              | `<p:pic>` times 4, media byte-identical                                             |
| counter "01 / 02"    | 1480.78, 862, 47.22 by 16                                                                  | Inter 400, 13 px, 0.26 px tracking, titanium             | 7.8 pt, charSpacing 0.156                                                                                                     | `sz="780" spc="16"`                                                                 |
| `.big` "Brand"       | 163, 560.94, 688 by 76.31                                                                  | Inter 500, 72 px, -1.8 px, 76.32 px line                 | 43.2 pt, charSpacing -1.08, lineSpacing 45.792                                                                                | `sz="4320" spc="-108"`, `<a:spcPts val="4579"/>`                                    |
| p2 (two lines)       | 163, 651.25, 688 by 66                                                                     | 22 px, 33 px line                                        | one soft break                                                                                                                | one `<a:br/>`                                                                       |
| credit               | 163, 729.25, 688 by 21.75                                                                  | 15 px, 0.15 px tracking, titanium                        | 9 pt, charSpacing 0.09, lineSpacing 13.05                                                                                     | `sz="900" spc="9"`, `<a:spcPts val="1305"/>`                                        |
| plate                | 137, 538.94, 740 by 232.06 (`fit-content`, max 740)                                        | paper                                                    | rect 1.14167, 4.49117, 6.16667, 1.93383 in, `line: { type: 'none' }`                                                          | `prst="rect"`, `<a:ln></a:ln>`                                                      |
| chips                | 66, 858, 40 by 30 and 1474, 856, 60 by 28                                                  | paper                                                    | two rects                                                                                                                     |                                                                                     |
| rails and crosses    | 1 px at 56 (center 56.5) and 1543.5; crosses 11 px at 51                                   | `--hair` 0.18, `--cross` 0.38                            | master lines 0.6 pt on paper; per-slide alpha lines over the picture                                                          | `<a:ln w="7620">`, `<a:alpha val="18000"/>` and `38000` on slide 2                  |

Every box is `getBoundingClientRect` divided by 120 with 0.02 in of width slack on text boxes so no renderer wraps early. Text boxes carry `margin: 0`, `valign: 'top'`, `align: 'left'`, `paraSpaceBefore: 0`, `paraSpaceAfter: 0` and no `fit`.

### 4.2 What landed in the XML (out/xml-findings.json)

| Question              | Answer                                                                                                                     | Evidence                                                                                                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page size             | 12,192,000 by 6,858,000 EMU with `defineLayout` width 13.333333                                                            | `<p:sldSz cx="12192000" cy="6858000"/>`; 13.3333 had produced `cx="12191970"`                                                                                                   |
| Letter spacing        | Emitted, negative included, in hundredths of a point                                                                       | `spc="-66"`, `spc="-108"`, `spc="-12"`, `spc="9"`, `spc="16"`; the source is a truthiness check (`opts.charSpacing ? spc=... kern="0" : ''`), so `charSpacing: 0` emits nothing |
| Kerning               | Disabled on every tracked run                                                                                              | `kern="0"` accompanies every `spc`                                                                                                                                              |
| Exact line pitch      | Emitted in hundredths of a point                                                                                           | `<a:lnSpc><a:spcPts val="1980"/></a:lnSpc>`; `lineSpacingMultiple: 1.5` emits `<a:spcPct val="150000"/>`                                                                        |
| Insets and anchor     | Zero insets, top anchor                                                                                                    | `<a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0" anchor="t">` with no children                                                                           |
| Autofit               | None unless asked                                                                                                          | no `normAutofit` or `spAutoFit` on slides 1 and 2; `fit: 'shrink'` emits a bare `<a:normAutofit/>` (renderer-dependent scaling)                                                 |
| Weight                | Only the bold flag                                                                                                         | `b="1"` on the probe; the 500 weight is carried by `typeface="Inter Medium"`                                                                                                    |
| Soft line breaks      | `softBreakBefore` emits `<a:br/>` inside one paragraph                                                                     | 2 on slide 1, 1 on slide 2                                                                                                                                                      |
| Line alpha            | Emitted                                                                                                                    | `<a:ln w="7620"><a:solidFill><a:srgbClr val="070707"><a:alpha val="18000"/></a:srgbClr></a:solidFill>`                                                                          |
| Shape with no outline | `line: { type: 'none' }`                                                                                                   | `line: { width: 0 }` had produced `<a:ln w="12700">` because pptxgenjs defaults a falsy width to 1 pt                                                                           |
| Image transparency    | `<a:alphaModFix amt="50000"/>` for `transparency: 50`                                                                      | probe slide                                                                                                                                                                     |
| Invisible text layer  | `transparency: 100` emits `<a:alpha val="0"/>` on the run color                                                            | probe slide (the flatten mode text layer)                                                                                                                                       |
| Strike                | `strike="sngStrike"`; thickness and color are not controllable                                                             | probe slide                                                                                                                                                                     |
| Custom geometry       | `<a:custGeom>` with `<a:path w="2218334" h="1410005">`, 4 `moveTo`, 128 `lnTo`, 4 `close`, no `fill` attribute on the path | probe slide; python-pptx classifies the shape as FREEFORM (5)                                                                                                                   |
| Background picture    | `<p:bg><p:bgPr><a:blipFill dpi="0" rotWithShape="1"><a:blip r:embed="rId1"/>...<a:stretch><a:fillRect/></a:stretch>`       | slide 2                                                                                                                                                                         |
| Media integrity       | Every PNG byte-identical to the source (sha256 match)                                                                      | palette PNG IHDR color type 3, icon and alpha ramp color type 6                                                                                                                 |
| Master                | 12 lines at `w="7620"` on a `FFFFFF` (or `070707`) background in `slideLayout2.xml`                                        | `defineSlideMaster` objects                                                                                                                                                     |
| Notes                 | three `notesSlideN.xml` parts                                                                                              | `addNotes`                                                                                                                                                                      |
| Embedded fonts        | none from pptxgenjs                                                                                                        | `embeddedFontLst` absent until `embed-font.py`                                                                                                                                  |

python-pptx 1.0.2 reopens both files: 3 slides, 16 auto shapes plus 4 pictures on slide 1, 19 auto shapes on slide 2, 10 auto shapes, 2 pictures and 1 freeform on slide 3; heading read back at 26.4 pt, face `Inter Medium`, box 1.1417, 1.075, 11.07, 0.4033 in.

### 4.3 QuickLook against the browser (out/compare.json)

QuickLook thumbnails are 1600 by 902; the best crop offset was 0 in every case. pixelmatch threshold 0.1, antialiasing not ignored.

| Pair                         | Mismatched pixels   | Percent |
| ---------------------------- | ------------------- | ------- |
| slide 1 light                | 30,726 of 1,440,000 | 2.134   |
| slide 1 dark                 | 37,188              | 2.583   |
| slide 2 light (opener first) | 230,961             | 16.039  |

Per-region ink bounding boxes (pixels far from the region's background), browser versus QuickLook:

| Region  | Browser ink box       | QuickLook ink box     | dx, dy | Width delta                                                                | Region mismatch |
| ------- | --------------------- | --------------------- | ------ | -------------------------------------------------------------------------- | --------------- |
| h2      | 140, 137, 252 by 41   | 137, 136, 251 by 40   | -3, -1 | -0.4 percent (a serif at -0.66 pt tracking happens to match Inter's width) | 1.88 percent    |
| p1      | 138, 202, 740 by 88   | 137, 203, 645 by 84   | -1, +1 | -12.8 percent (substituted face)                                           | 7.61 percent    |
| rows    | 139, 459, 1227 by 205 | 140, 458, 1109 by 206 | +1, -1 | -9.6 percent (substituted face)                                            | 4.55 percent    |
| counter | 1482, 865, 44 by 10   | 1485, 866, 31 by 7    | +3, +1 | -29.6 percent                                                              | 5.83 percent    |
| big     | 168, 573, 177 by 53   | 163, 571, 168 by 51   | -5, -2 | -5.1 percent                                                               | 3.94 percent    |
| p2      | 163, 659, 681 by 49   | 162, 659, 592 by 48   | -1, 0  | -13.1 percent                                                              | 5.66 percent    |
| credit  | 165, 734, 353 by 14   | 164, 735, 304 by 13   | -1, +1 | -13.9 percent                                                              | 4.88 percent    |

Hairline rows (a column scan at x = 177): browser 436, 498, 560, 622, 684; QuickLook light 437, 498 and 499, 560 and 561, 622, 684; dark 436 and 437, 498 and 499, 560 and 561, 622 and 623, 684. A 0.6 pt line is exactly 1.0 px at this scale and QuickLook antialiases it across two rows when its center is not on a pixel boundary. Rails show the same behavior in the diff images.

Icon alpha: the corner pixels of every icon box in the QuickLook render are (255, 255, 255) in the light file and (7, 7, 7) in the dark file, so the RGBA icon composited over paper in both themes.

First baseline: the vertical ink offsets are -1 to +1 px for every text region on paper, so QuickLook places the first line of a box with exact `spcPts` pitch where Chromium places it, within a pixel, for these sizes. This is one renderer's calibration constant; PowerPoint's is unmeasured.

Slide 2's 16 percent is the dither (section 4.7) plus the serif substitution. The plate and chips are at their DOM positions in the render (the plate's EMU geometry is exact by construction and was read back by python-pptx); an ink-box measurement over the dithered ground is not reliable and is not reported.

### 4.4 Font substitution when Inter is not installed

Inter is not a system font on this Mac (`fc-list` finds no Inter; `~/Library/Fonts` holds only Arial Unicode). The deck embeds it as a base64 woff2, which only the browser reference uses.

Chromium (out/font-fallback.json, 44 px weight 500 sample, advance widths):

| Stack                                                     | Width   | Resolves to                                                                      |
| --------------------------------------------------------- | ------- | -------------------------------------------------------------------------------- |
| `Inter` alone, not installed, not embedded                | 902.97  | Times (the same width as `Times` and `serif`; Chromium's standard font on macOS) |
| the deck's `'Inter', 'Helvetica Neue', Arial, sans-serif` | 1021.47 | Helvetica Neue                                                                   |
| `Helvetica`, `Arial`, `sans-serif`                        | 987.97  | Helvetica                                                                        |
| `system-ui`                                               | 955.45  | San Francisco                                                                    |

Widths of the experiment's own text with Inter loaded versus substitutes, same size, tracking and features (out/font-widths.json):

| Sample                                     | Inter  | Helvetica Neue | Helvetica, Arial | Times  | system-ui |
| ------------------------------------------ | ------ | -------------- | ---------------- | ------ | --------- |
| h2 "Export fidelity", 500 44 px, -0.025 em | 254.75 | +3.91 percent  | -2.80            | -5.26  | -2.10     |
| body line, 400 22 px                       | 918.41 | -1.86          | -2.94            | -11.73 | -6.12     |
| key "Verification", 500 20 px, -0.01 em    | 103.86 | -3.82          | -8.10            | -11.40 | -4.74     |

A 2 to 4 percent width change moves line breaks in a 56 ch paragraph; the exporter's explicit `<a:br/>` breaks and 0.02 in slack are what keep the layout when the face changes, and the box then only looks wrong, it does not reflow.

QuickLook drew a serif for `Inter` and for `Inter Medium` (no bold, since no `b="1"`). Ink widths through the same CoreText path in Chromium (out/font-identify.json): QuickLook heading 251 px and widest body line 645 px; Times 242 and 653, Times New Roman 241 and 654, New York 242 and 653, Baskerville 236 and 658, Hoefler Text 256 and 696, Charter 256 and 718, Georgia 262 and 719, Palatino 265 and 724, Helvetica 244 and 720, Arial 245 and 720, Helvetica Neue 262 and 729. The QuickLook face is in the Times class (within 1.5 to 3.7 percent of Times on both samples; every other candidate is 8 to 13 percent off on the body line). qlmanage does not report the face by name.

PowerPoint and LibreOffice, documented, not testable here: PowerPoint for Windows consults the `FontSubstitutes` registry table and otherwise falls back to the theme font, usually Calibri, and Home > Replace Fonts shows the substituted names (https://www.indezine.com/products/powerpoint/learn/textandfonts/find-substituted-fonts.html); the generated theme's fonts are Calibri Light and Calibri (pptxgenjs writes them into `theme1.xml`). LibreOffice runs the request through fontconfig on Linux, the system matcher on macOS, and its own `VCL.xcu` substitution tables on Windows, and exposes a replacement table under Options > Fonts (https://help.libreoffice.org/latest/en-US/text/shared/optionen/01010700.html, https://design.blog.documentfoundation.org/2016/10/21/dealing-with-missing-fonts/). The only way to stop substitution in the file itself is embedding (section 4.9); the practical route for CI is installing the export font set on the render machine.

### 4.5 Kerning and OpenType features (out/kern-probe.json)

pptxgenjs writes `kern="0"` with every `spc`. In Inter, with the deck's tracking and features on:

| Sample                          | Kerning on | Kerning off | Delta                     | Without `cv11`, `ss01` |
| ------------------------------- | ---------- | ----------- | ------------------------- | ---------------------- |
| h2 "Export fidelity", 500 44 px | 254.75     | 252.39      | -2.36 px (-0.93 percent)  | 0                      |
| h1 "Typography", 500 88 px      | 444.27     | 456.14      | +11.87 px (+2.67 percent) | -4.57 px               |
| h1 "AVATAR WAVE", 500 88 px     | 549.25     | 599.16      | +49.91 px (+9.09 percent) | 0                      |
| big "Brand", 500 72 px          | 184.23     | 184.81      | +0.58 px                  | -3.73 px               |
| body line, 400 22 px            | 745.30     | 748.17      | +2.87 px (+0.39 percent)  | -3.13 px               |

Two consequences for the exporter: strip `kern="0"` in a post-process (DrawingML `kern` is the minimum size at which kerning applies, so removing the attribute or setting `kern="1200"` restores it above 12 pt: https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.runproperties), and accept that `cv11` and `ss01` cannot be requested in DrawingML at all, so a heading in PowerPoint is a few pixels different in width and shows the double-storey a and closed digits unless a feature-frozen font is installed.

### 4.6 PNG alpha and palette

Alpha is preserved by the package: `ppt/media/image-1-1.png` (the icon) and `image-3-1.png` (the ramp) are byte-identical to the sources with IHDR color type 6. QuickLook composited the icons correctly in both themes (section 4.3). The `transparency` option on `addImage` adds `<a:alphaModFix amt="50000"/>` on top of the PNG's own alpha.

A note on producing the two-color PNG: Pillow's `'1'` to `'P'` conversion writes white as index 255, so a two-entry palette makes the picture black. `Image.frombytes('P', size, indices)` with explicit 0 and 1 indices is the correct construction; the final light twin is 1,146,484 paper and 293,516 ink pixels in 5,035 bytes.

### 4.7 Dithers under scaling (dither-variants.mjs)

Six one-slide files with the same 1600 by 900 two-tone picture: 1-bit palette as background and as picture, 8-bit palette, RGB and RGBA as background, RGB as picture. QuickLook rendered all six identically: 71.99 percent of cells exact, 17.96 percent of pixels grey, because its 1600 by 902 thumbnail stretches the picture by 0.22 percent vertically. The PNG encoding is irrelevant; any non-integer mapping between picture pixels and device pixels greys 1-bit cells, which is the risk report 04 predicted (its item 7) and the reason the deck's viewer uses `image-rendering: pixelated`. In PowerPoint and Slides the zoom is never 1:1, so dithers will look grey at most zoom levels no matter what the exporter does. Rendering the dither at 3x or 4x reduces the grey fraction and does not remove it.

### 4.8 Custom geometry

pptxgenjs `addShape('custGeom', { points })` converts the deck's GT mark path (`M`, `L`, `Z` only, four subpaths) into `<a:custGeom>` with `<a:pathLst><a:path w="2218334" h="1410005">` and 136 points. python-pptx exposes the same through `SlideShapes.build_freeform()` and `FreeformBuilder.add_line_segments`, `move_to`, `convert_to_shape` (https://python-pptx.readthedocs.io/en/latest/api/shapes.html), so no second library is needed for geometry. Neither writes a fill rule; DrawingML's `a:path` has `fill`, `stroke` and `extrusionOk` attributes and no even-odd option, so the mark's counters (the inner G and T cuts) depend on how the renderer treats self-overlapping subpaths. QuickLook renders only the first slide, so the probe slide's mark was not rendered here. Until PowerPoint confirms the counters, the mark stays a PNG (report 04 section 8).

### 4.9 Font embedding

- pptxgenjs: no feature; issue #176 (2017) proposed `panose` attributes, an embedded font list in `presentation.xml` and `.fntdata` parts, and closed without an implementation (https://github.com/gitbrent/PptxGenJS/issues/176).
- python-pptx: no API; issue #355 (2018) is open (https://github.com/scanny/python-pptx/issues/355); the only mention of embedded fonts in its source is the content type constant in `pptx/opc/spec.py`.
- Raw OOXML, done here in `embed-font.py`: `fonts/InterVariable.ttf` (879,708 bytes, decoded from the deck's woff2) wrapped in an EOT header per the W3C submission, version `0x00020001`, no MicroType Express compression and no XOR (https://www.w3.org/submissions/EOT/), written as `ppt/fonts/font1.fntdata` (879,932 bytes); `[Content_Types].xml` gains `<Default Extension="fntdata" ContentType="application/x-fontdata"/>` (pandoc issue 11492 documents PowerPoint reporting a corrupt file when that default is missing: https://github.com/jgm/pandoc/issues/11492); `ppt/_rels/presentation.xml.rels` gains a relationship of type `http://schemas.openxmlformats.org/officeDocument/2006/relationships/font`; `ppt/presentation.xml` gains `<p:embeddedFontLst><p:embeddedFont><p:font typeface="Inter" pitchFamily="34" charset="0"/><p:regular r:id="rIdFont1"/></p:embeddedFont></p:embeddedFontLst>` after `<p:notesSz>`. PowerPoint requires each embedded typeface to be unique and every listed font to be used in the presentation (https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oe376/e3870782-1f40-4ef1-a3a8-01ee13661283). PowerPoint's own `.fntdata` parts are EOT files (https://en.wikipedia.org/wiki/Embedded_OpenType).
- Result: `out/turboslide-light-embedded.pptx` (572,477 bytes) reopens in python-pptx and renders in QuickLook, and QuickLook ignores the font (495 of 360,000 sampled pixels differ from the plain file's render, all antialiasing). Whether PowerPoint accepts an uncompressed EOT wrapping a variable TTF is unverified; static instances cut with `fontTools.varLib.instancer` are the safer payload, and the `Inter Medium` face needs its own `<p:embeddedFont>` entry. The font permits it: `fsType` is 0 (installable embedding).

### 4.10 The deck font, decoded

`deck/fonts/deck-fonts.css` holds one 352,240 byte woff2 that decodes to Inter Variable 4.001 (`git-9221beed3`): unitsPerEm 2048, ascender 1984, descender -494, lineGap 0 in both `hhea` and `OS/2` typo metrics with `USE_TYPO_METRICS` set, so the normal line height is 1.21 em; cap height 1490 (0.7275 em); axes `opsz` 14 to 32 (default 14) and `wght` 100 to 900; nine named instances all at opsz 14; GSUB features include `cv11`, `ss01`, `tnum`, `calt`, `case`. This confirms report 04's numbers and the reason the deck's 15 to 31 px text has no static equivalent.

### 4.11 Paper Shaders

License as shipped: `@paper-design/shaders` 0.0.78 and `@paper-design/shaders-react` 0.0.78 both carry `"license": "Apache-2.0"`, the full Apache License 2.0 text in `LICENSE`, and a `NOTICE` reading "Paper Shaders, Copyright 2026 Paper, Powered by Paper Shaders: https://shaders.paper.design" (paths: `/Users/kevinliu/repos/glyphfield/node_modules/.pnpm/@paper-design+shaders@0.0.78/node_modules/@paper-design/shaders/{LICENSE,NOTICE}` and `.../@paper-design/shaders-react/{LICENSE,NOTICE}`). The repository states the same license (https://github.com/paper-design/shaders). Apache 2.0 means Turboslide can ship, modify and sell renders and must carry the LICENSE and NOTICE text in its distribution.

Headless rendering (node-shaders-import.mjs, shader-headless.mjs, out/shader-headless.json):

- Bare Node: `import` succeeds (69 exports, 18 ms; the base package has zero dependencies and no module-level DOM access). `new ShaderMount(null, ...)` throws `Paper Shaders: parent element must be an HTMLElement`; a fake element whose canvas returns no `webgl2` context throws `Paper Shaders: WebGL is not supported in this browser`. The mount also creates a `<style>` in `ownerDocument.head`, prepends a `<canvas>`, and wires `ResizeObserver`, `IntersectionObserver`, `visualViewport` and `requestAnimationFrame`; several shaders (`gem-smoke`, `liquid-metal`, `heatmap`) also build textures on a `2d` canvas. headless-gl (`gl`) implements WebGL 1.0.3 only (https://www.npmjs.com/package/gl, https://github.com/stackgl/headless-gl/issues/109), and the fragment shaders are `#version 300 es`. So the vanilla package needs a browser or a browser-grade DOM plus WebGL2.
- Headless Chromium 147 through Playwright, mesh gradient at 1600 by 900 CSS px: default launch got `ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Max)` and rendered a 3200 by 1800 canvas (the mount's minimum pixel ratio of 2) in 43 ms from mount to a readable frame; `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader` got `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0)))` in 42 ms with the same pixels. Chromium's SwiftShader is the documented path for GPU-less machines (https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md); Chrome 137 removed the automatic fallback, so CI needs the `--enable-unsafe-swiftshader` switch (https://developer.chrome.com/blog/supercharge-web-ai-testing). Screenshots are in `out/shader-*.png`. This is the bridge report 04 describes: freeze a frame in the browser, screenshot at 2x, place it as a PNG.

## 5. Fidelity table

Verified means read back from the XML or measured in a render on this machine. Risk uses report 04's vocabulary: low is antialiasing only, medium is a measurable difference calibration removes, high is a visible difference or a missing feature.

| Deck element                                    | PPTX construct (pptxgenjs)                                                          | Verified here                          | Renderer result here (QuickLook)                                       | Risk                                                                                        | Mode                         |
| ----------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------- |
| Body, lead, caption, row text                   | text box, `sz` centipoints, `spcPts` pitch, `margin: 0`, `<a:br/>` per browser line | XML exact; baseline within 1 px        | correct position, substituted face                                     | low with the font installed; medium without                                                 | native                       |
| Headings h2, `.big`                             | same plus `spc -66` and `-108`, face `Inter Medium`                                 | XML exact                              | correct position, substituted face, no kerning                         | medium: `kern="0"` must be stripped; `cv11`, `ss01` impossible; weight needs a named family | native                       |
| Rails, rules, crosses                           | master lines `w="7620"` in composite color; alpha lines over pictures               | XML exact; within 1 px                 | rendered, antialiased over two rows                                    | low                                                                                         | native                       |
| Counter                                         | text box `sz="780" spc="16"`                                                        | XML exact                              | rendered                                                               | low                                                                                         | native                       |
| Plate and paper chips over a full-bleed picture | rectangles at DOM boxes with `type: 'none'` outline; picture as `p:bg` blip         | XML exact; geometry read back          | rendered at place                                                      | low for geometry                                                                            | native plate, raster picture |
| Two-tone dither                                 | palette PNG background or picture                                                   | byte-identical                         | 71.99 percent cell-exact, 17.96 percent grey at a 0.22 percent stretch | medium and unavoidable at non-1:1 zoom                                                      | raster                       |
| Ruled tables `.rows`                            | five hairlines plus key and value text boxes                                        | XML exact; lines within 1 px           | rendered                                                               | low                                                                                         | native                       |
| Semantic icons                                  | RGBA PNG at 3x                                                                      | byte-identical; alpha honored          | rendered over paper in both themes                                     | low                                                                                         | raster                       |
| Ruled lists `.plain` strike                     | `strike="sngStrike"`                                                                | XML                                    | not rendered (probe slide)                                             | medium: strike color and thickness not controllable                                         | native                       |
| GT mark, inline diagrams                        | `custGeom` possible (136 points); PNG safe                                          | XML; FREEFORM read back                | not rendered (probe slide)                                             | medium: no fill rule                                                                        | raster by default            |
| Shader materials                                | frozen frame PNG from headless Chromium                                             | rendered in 43 ms, GPU and SwiftShader | n/a                                                                    | low                                                                                         | raster                       |
| Speaker notes                                   | `addNotes`                                                                          | three notes parts                      | n/a                                                                    | low                                                                                         | native                       |
| Invisible text layer (flatten mode)             | `transparency: 100` gives `<a:alpha val="0"/>`                                      | XML                                    | not rendered                                                           | low                                                                                         | native over raster           |
| Font embedding                                  | raw OOXML `.fntdata` post-process                                                   | package valid, python-pptx reopens     | QuickLook ignores it                                                   | high until PowerPoint confirms                                                              | n/a                          |
| Weight 500                                      | none                                                                                | n/a                                    | serif regular drawn                                                    | medium: separate family name                                                                | n/a                          |
| Autofit                                         | never set                                                                           | no element emitted by default          | n/a                                                                    | low as long as `fit` stays unset                                                            | n/a                          |

Google Slides was not exercised (no OAuth in this session). Report 04 sections 6 and 8 stand: no letter spacing field in `TextStyle`, `lineSpacing` only as a percentage of the font's normal pitch, images by public URL, no custom geometry (https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations.pages/text).

## 6. Defects found in this experiment's own pipeline

These are the traps a real exporter will hit; each cost a rebuild here.

1. `Range.getClientRects()` on a `.rows` key returns the inline `<svg>` rect as its own line group with empty text; take the group that carries text, or the key box comes out empty (the first QuickLook render had no key labels).
2. The deck's `.sheet` is a stacking context (`z-index: 1`); without it the opener image at `z-index: -1` paints under the paper and the reference shows a blank slide.
3. A page written into `out/` cannot use `src="assets/..."`; the alt text rendered where the picture should be until the paths were absolute.
4. `document.fonts.ready` resolves before a lazily used `@font-face` loads; `document.fonts.load('500 44px Inter')` must be awaited or Inter measurements are Times.
5. Pillow `'1'` to `'P'` maps white to index 255 (section 4.6).
6. pptxgenjs `line: { width: 0 }` means 1 pt; `line: { type: 'none' }` means none.
7. `defineLayout` at 13.3333 in is 30 EMU short of PowerPoint's widescreen page.

## 7. Not verified here

- Any PowerPoint, Keynote or LibreOffice rendering, including the first-baseline constant with `spcPts`, the treatment of the uncompressed EOT `.fntdata`, `custGeom` counters, and `normAutofit` behavior.
- Google Slides API output, its Inter build and optical size, and its default text inset.
- Which face QuickLook used by name (Times-class by measurement).
- Whether LibreOffice reads `.fntdata` on PPTX import.
- The report also did not test SVG `addImage` in Node (pptxgenjs writes a broken PNG fallback per issue #401; icons and marks were rasterized instead).

## 8. How to reproduce

```
cd /private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad/turboslide/experiments/pptx
pnpm install                       # pptxgenjs, jszip, pixelmatch, pngjs
node render.mjs                    # out/ref-slide{1,2}-{light,dark}.png, out/measure.json, assets/check-circle-ok@3x.png, out/font-fallback.json
node build-pptx.mjs && OPENER_FIRST=1 node build-pptx.mjs
node inspect-xml.mjs               # out/xml-findings.json
qlmanage -t -s 1600 -o out out/turboslide-light.pptx out/turboslide-light-opener-first.pptx out/turboslide-dark.pptx
node compare.mjs                   # out/compare.json, out/diff-*.png, out/ql-*-cropped.png
node font-probe.mjs && node font-identify.mjs && node kern-probe.mjs
node dither-variants.mjs && qlmanage -t -s 1600 -o out out/dither-*.pptx
node node-shaders-import.mjs && node shader-headless.mjs
.venv/bin/python embed-font.py     # needs: uv venv .venv && uv pip install --python .venv/bin/python python-pptx lxml fonttools brotli
```

Files: `slide1.html`, `slide2.html` (the reference slides), `render.mjs`, `build-pptx.mjs`, `inspect-xml.mjs`, `compare.mjs`, `font-probe.mjs`, `font-identify.mjs`, `kern-probe.mjs`, `dither-variants.mjs`, `node-shaders-import.mjs`, `shader-headless.mjs`, `embed-font.py`, `assets/`, `fonts/InterVariable.ttf`, `out/` (PPTX files, renders, diffs, JSON findings).

## 9. Sources

Local, read only: `/Users/kevinliu/repos/Prototemplate/deck/parts/head.html`, `parts/tail.html`, `slides/01-opener-brand.html`, `shots/opener-brand.jpg`, `shots/opener-brand-light.jpg`, `shots/OPENERS.md`, `fonts/deck-fonts.css`, `shoot-slide.mjs`; `/Users/kevinliu/repos/glyphfield/node_modules/.pnpm/@paper-design+shaders@0.0.78/...` and `@paper-design/shaders-react` (LICENSE, NOTICE, package.json, dist/shader-mount.js); `node_modules/pptxgenjs/dist/pptxgen.es.js` in this directory (lines 5417 to 5470 custGeom, 5481 to 5490 line, 5832 to 5835 lnSpc, 5944 spc, 6040 to 6075 bodyPr and autofit, 786 genXmlColorSelection, 2190 to 2210 line defaults); research report `04-export-fidelity.md`.

Web:

- pptxgenjs: https://gitbrent.github.io/PptxGenJS/docs/api-text.html, https://raw.githubusercontent.com/gitbrent/PptxGenJS/master/src/gen-xml.ts, https://github.com/gitbrent/PptxGenJS/issues/176, https://github.com/gitbrent/PptxGenJS/issues/401
- python-pptx: https://python-pptx.readthedocs.io/en/latest/api/shapes.html, https://github.com/scanny/python-pptx/issues/355
- OOXML: https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.runproperties, https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oe376/e3870782-1f40-4ef1-a3a8-01ee13661283
- Embedded fonts: https://www.w3.org/submissions/EOT/, https://en.wikipedia.org/wiki/Embedded_OpenType, https://github.com/jgm/pandoc/issues/11492
- Font substitution: https://www.indezine.com/products/powerpoint/learn/textandfonts/find-substituted-fonts.html, https://help.libreoffice.org/latest/en-US/text/shared/optionen/01010700.html, https://design.blog.documentfoundation.org/2016/10/21/dealing-with-missing-fonts/
- LibreOffice: https://formulae.brew.sh/cask/libreoffice, https://help.libreoffice.org/latest/en-US/text/shared/guide/start_parameters.html, https://blog.documentfoundation.org/blog/2026/08/26/libreoffice-26-8/, https://wiki.documentfoundation.org/Special:MyLanguage/ReleaseNotes/25.8
- QuickLook: https://ss64.com/mac/qlmanage.html
- Paper Shaders and WebGL: https://github.com/paper-design/shaders, https://www.npmjs.com/package/gl, https://github.com/stackgl/headless-gl/issues/109, https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md, https://developer.chrome.com/blog/supercharge-web-ai-testing
- Playwright screenshots (`omitBackground`, element screenshots): https://playwright.dev/docs/api/class-page#page-screenshot
- pixelmatch: https://github.com/mapbox/pixelmatch
- Google Slides text style: https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations.pages/text
- Inter: https://rsms.me/inter/
