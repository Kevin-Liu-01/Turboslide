# Export verification

How an exported file is checked against the web render (SPEC 8.5), what the render worker image
contains, what the calibration deck measures, and the manual PowerPoint checklist that no headless
renderer can replace. Written for milestone 2 by the render worker, fonts and verify builder.

## What `--verify` does

`turboslide export pptx --mode flatten --theme light,dark --fonts exact --verify` writes the files
and `export-report.json`, then `verifyPptx(reportPath, options)` in
`packages/export/src/verify/report.ts` renders the exported file, not the exporter's intent:

1. `soffice --headless --convert-to pdf:impress_pdf_Export:{...} --outdir <out> <file>.pptx` with
   a private user profile per conversion (`verify/libreoffice.ts`). The filter options ask for
   lossless image compression and no resolution reduction: LibreOffice's default export re-encodes
   slide backgrounds as JPEG (`pdfimages -list` showed `jpeg` on three of five calibration pages),
   which alone cost 0.36 to 0.74 percent mismatched pixels on a text slide.
2. `pdftocairo -png -r 120 -scale-to-x 1600 -scale-to-y 900` for a native file and
   `-scale-to-x 3200 -scale-to-y 1800` for a flatten file, so every page is the pixel size of what
   the slide carries and the diff needs no resampling: a native page is compared with the 1x render,
   where the block budgets are stated; a flatten page carries a 2x sheet raster (SPEC 8.2) and is
   compared with `turboslide render --scale 2` (`FLATTEN_REFERENCE_SCALE` in `verify/report.ts`).
   Measured on the deck during the M2 acceptance: comparing the 2x raster with the 1x render after
   the rasterizer's downsample gave 0.1 to 0.4 percent on every text slide (the glyph edges fringe
   in the diff image) and 0.4 to 12 percent on slides with two-tone pictures, while the same sheet
   shots compared with the 2x render at 2x gave 0.000 percent on text slides. The spec names
   pdftoppm; measured on the
   calibration deck, LibreOffice writes the page as 960.009 by 540 pt (its 1/100 mm unit) with the
   background offset by 0.01 mm, and poppler's Splash backend (pdftoppm) resamples the 1600 by 900
   background across that fraction: a two-tone picture came back 11.4 percent mismatched at 1x and
   29 percent at 2x with a box average, text slides 0.18 to 0.74 percent. The cairo backend at the
   same size reproduced every page to the pixel (0.000 percent on all ten pages, background and
   picture-shape placement alike). pdftoppm remains the fallback when pdftocairo is missing and the
   report's residual names the rasterizer used.
3. Every page is compared with the Turboslide render of the same slide, theme, revision and scale
   (`verify/reference.ts`: `render.json` from a render directory, rendered through the CLI when
   missing or at another revision) with pixelmatch at threshold 0.1 (`verify/diff.ts`). A flatten
   slide with a regenerated two-tone picture (the exporter swaps the 1x twin for a dither
   regenerated at 2x from the one-bit image, SPEC 8.2) has two references: outside the picture's
   box the page is gated on the 2x render; inside it, on the 2x sheet shot the page embeds
   (`work/sheets/<theme>/<nn>-<slideId>@2x.png`, named per slide in the report's `sheet` and
   `pictures`), because the browser at 2x shows a bilinear upscale of the 1x twin that no crisp
   dither can match (measured 19 percent of the opener's pixels, 6.8 percent of a mood slide's).
   Both fractions carry the same 0.1 percent budget and both land in the report
   (`verify.fraction`, `verify.pictureFraction`); cell exactness of the dither against the one-bit
   source is the M5 parity test (SPEC 9). The flatten cover picture is written 0.01 mm (360 EMU)
   below the page's top edge and 0.01 mm shorter: LibreOffice paints picture shapes through its
   1/100 mm drawing layer and a full-page picture at y = 0 resamples the sheet by a fraction of a
   device pixel (measured on the deck's finest page: 6,916 mismatched pixels at y = 0, 0 at
   +0.047 px, worse in every other direction; `calibration.json` `pictureShapeOffset`). A page
   background fill paints exactly without the offset, but QuickLook draws the alpha-0 text layer
   over a background (alpha 0, `a:noFill`, a hidden cover and an `alphaModFix 0` cover all showed
   the text in `qlmanage` thumbnails), so the cover stays a picture shape and carries the offset.
4. Every block of the render record gets an ink box offset: the block's box widened by 6 px, the
   background read from the margin ring around it, the bounding box of the pixels that differ from
   that background in the reference and in the page, and the deltas `dx`, `dy`, `dw`
   (`verify/diff.ts`, the pptx report section 4.3 method). The budgets (`verify/budgets.ts`):
   text within 3 px horizontally and 1 px vertically, lines within 1 px, rasters within 1 px.
5. The package's geometry is read back (`verify/geometry.ts` over `ooxml/geometry.ts`): the page
   must be 12,192,000 by 6,858,000 EMU and no shape may leave it; the pass also counts `custGeom`
   paths, `normAutofit` elements, surviving `kern="0"` attributes and the embedded font list.
6. The report gains `verify` per slide (`mismatch`, `fraction`, `scale`, `pictureMismatch` and
   `pictureFraction` when the slide carries a regenerated picture, `blocks` in sheet px, `ref`,
   `got`, `diff`), `geometryInBounds`, `passed` and `residual` lines prefixed `verify:`. Flatten
   passes when every slide mismatches at most 0.1 percent of its pixels outside regenerated
   pictures and at most 0.1 percent inside them against the embedded sheet; native passes when
   every block of every slide without raster blocks is within budget, and the slides with raster
   blocks are listed.
   `verify/verify-summary.json` beside the report carries the per-file timings, tool versions and
   every block delta with its ink boxes.

The loop also runs on its own: the render worker's `verify` job takes an existing report, and
`packages/export/src/verify/fixture.ts` writes a minimal PPTX by hand (flatten pages with a PNG
background, native text boxes, hairlines, rectangles) for the tests and the calibration run.

The reports are one per theme (`export-report-<theme>.json`) plus the merged `export-report.json`;
`verifyPptx` consumes the report's `slides` in order, one run of pages per `.pptx` it lists, so both
shapes verify. Measured cost in the image: 5 flatten pages convert in about 640 ms, rasterize in
450 ms and diff in 150 ms per file.

## The render worker image

`docker/render-worker.Dockerfile` builds `turboslide-render-worker`:

| Component          | Version                                                                                                                                                       | Note                                                                                                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base               | `node:24-trixie` (Debian 13.6)                                                                                                                                | Node 24.21.0                                                                                                                                                                                                |
| Chrome for Testing | Playwright build `chromium-1217` (the Linux binary reports `Chromium 147.0.7727.0`; the macOS build of the same revision is Chrome for Testing 147.0.7727.15) | the build `shoot-slide.mjs` hard-codes; `TURBOSLIDE_CHROME` points at it, `TURBOSLIDE_GPU=swiftshader`; the headless package's renderer string reads `Chrome for Testing 147.0.7727.0, SwiftShader, Google` |
| LibreOffice        | 25.2.3.2 (`4:25.2.3-2+deb13u6`)                                                                                                                               | the newest in Debian 13's repositories for arm64; TDF's 26.8 builds are x86_64 only, see below                                                                                                              |
| poppler            | 25.03.0                                                                                                                                                       | `pdftocairo` (the rasterizer), `pdftoppm` (fallback), `pdfinfo`                                                                                                                                             |
| Export fonts       | `packages/fonts/export/*.ttf`, 17 faces, 15 named `GT Inter`                                                                                                  | installed under `/usr/local/share/fonts/turboslide`; `fc-list                                                                                                                                               | grep -c "GT Inter"` is 15 |
| The repo           | `pnpm install` inside the image; `turboslide` on PATH                                                                                                         | the CLI runs its TypeScript source through Node's type stripping                                                                                                                                            |

The default command is the job queue (`apps/render-worker/src/main.ts`) on port 4322: `render`,
`sheet`, `export` and `verify` jobs, one at a time, each driving the `turboslide` binary as a child
process; renders are cached under `<work>/cache/<deckId>/<revision>/<theme>@<scale>x/`. The studio
facade routes `/api/render/:slideId` and `/api/export/:deckId` call the worker when
`TURBOSLIDE_WORKER_URL` is set and run the same queue in process otherwise (still over the CLI, so
Chromium and LibreOffice never run inside the web app).

LibreOffice version: the milestone names 26.8, the first release with variable font support
(https://blog.documentfoundation.org/blog/2026/08/26/libreoffice-26-8/). The Document Foundation
publishes Linux packages for x86_64 only, the image is built for the host's architecture (arm64
on Kevin's Mac), and Debian 13 ships 25.2.3, so the image records that version. The static export
set needs no variable font support, which is why the spec cut it (SPEC 8.4). On an x86_64 host the
TDF 26.8 debs can be installed instead; `soffice --version` lands in every report's residual either
way.

## The calibration deck

`packages/export/src/calibration/deck.ts` is a five slide deck: one text block per ladder style
(h1 88, h2 44, lead 26, body 22, cap 15) on paper; a ruled list, a ruled table and references; a
declared diagram with 1 px and 1.5 px hairlines, a plate rectangle, a marker and labels beside a
code panel and two scales; a mood picture (a generated two-tone gradient with the plate quarter
clear) with a 44 px title, a sentence and a 15 px credit; and one image with a border and a caption.
It validates with no blocking issue and renders in both themes without warnings (`deck.test.ts`).

`node packages/export/src/calibration/run.ts --out .turboslide/calibration` inside the image
renders the deck with the CLI at 1x and 2x, writes a flatten fixture per theme (the 2x render as
each page's background, verified at 2x) and a native fixture per theme (one text box per single-line block, in the export
faces, at the rendered box), converts both through LibreOffice, measures the flatten mismatch per
slide and the ink box offset of every native text block by size, reads the geometry back, and runs
`verifyPptx` over a report that lists the flatten files. The numbers go into
`packages/export/src/calibration/calibration.json` by hand with the renderer versions; re-measure
when the font set or a renderer changes.

Measured on 2026-09-10 in the image (LibreOffice 25.2.3.2, pdftocairo 25.03.0, the exact font
set 4.001+gt.1, reference Chrome for Testing 147.0.7727.0 on SwiftShader), recorded in
`calibration.json` under `pptx-libreoffice`:

| Measurement                                           | Value                                                                                                                                                            |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Flatten mismatch, ten pages (five slides, two themes) | 0.000 percent on every page; `verifyPptx` passed, geometry in bounds; the same on the M2 tree with the fixture at 2x (background and comparison at 3200 by 1800) |
| Native first baseline, 15 px (`GT Inter Text 15`)     | 3 px low                                                                                                                                                         |
| Native first baseline, 22 px (`GT Inter Text 22`)     | 5 px low                                                                                                                                                         |
| Native first baseline, 26 px (`GT Inter Text 26`)     | 5 px low                                                                                                                                                         |
| Native first baseline, 44 px (`GT Inter Display`)     | exact                                                                                                                                                            |
| Native first baseline, 88 px (`GT Inter Display`)     | 2 px high                                                                                                                                                        |
| Horizontal offset of every native text box            | 1 px right                                                                                                                                                       |
| Ink width of every native text box                    | within 1 px of the browser's: the installed faces are the faces the browser used                                                                                 |
| Geometry read-back                                    | 10 shapes per native file in bounds; 0 `custGeom`, 0 `normAutofit`                                                                                               |

The first-baseline constants say the text sizes sit 3 to 5 px below the browser's line with exact
`spcPts` pitch and zero insets. The M2 acceptance run measured the same offset on the deck itself
(26 all-native slides, 116 text blocks, `calibration.json` under `firstBaselineModel`): body text
3.5 px low at 22 px, 4 px at 26, 2 px at 15; the 44 px h2 1 px high; the 72 px opener heading 3 to
4 px high; the 88 px title 4 px high. Chromium centres the leading around the glyphs and
LibreOffice puts the whole leading above the baseline, so the offset is
`pitch / 2 - k(size) * size` with k measured per size (0.555 to 0.592; the pure Inter metric,
0.605, drifts by 4 px at 88). `packages/export/src/pptx/baseline.ts` reads the anchors and moves
every Inter text box up by that amount in both modes (`--baseline-target libreoffice`, the
default); `--baseline-target none` writes the boxes at the browser's coordinates for the
PowerPoint pass. The fixture table above sits 1 to 1.5 px more positive than the deck at every
size; the exporter follows the deck. The `pptx-quicklook` target carries the pptx experiment's
numbers (geometry and first baseline within 1 px, the residual is the substituted face);
`pptx-powerpoint` waits for the manual pass below.

## Manual PowerPoint checklist

PowerPoint cannot run headless on Linux, so this pass is scheduled, not automated (SPEC 8.5 step
6). Run it on PowerPoint for Mac and PowerPoint for Windows with the two files of a flatten export
and the light file of a native export at a named revision, and record the results in
`calibration.json` under `pptx-powerpoint` with the PowerPoint build number and the date.

1. EOT acceptance. Open `gt-brand-light.pptx` (native, `--fonts exact`). File opens with no
   repair prompt: the `ppt/fonts/*.fntdata` parts (uncompressed EOT wrapping the static TTFs) and
   the `application/x-fontdata` content type default are accepted. Home > Replace Fonts lists no
   substituted family; the heading uses `GT Inter Display` and body text `GT Inter Text 22` in the
   font box. Record `eotAccepted: true|false` and, when false, the message and which families
   substituted. If PowerPoint refuses the file, retest with a MicroType Express compressed EOT
   before changing the payload.
2. First-baseline constant. On the calibration deck's `cal-text` slide exported native, measure
   the vertical offset of the first line of each text box against the Turboslide render (export
   the slide as PNG at 1600 by 900 from PowerPoint, then `compareBlock` in `verify/diff.ts`, or
   read the ink box by hand). Record `firstBaselineOffsetPx` per size (88, 44, 26, 22, 15). The
   QuickLook value is within 1 px; the exporter adds no correction until PowerPoint's number is
   known.
3. `custGeom` counters. In the M5 native export with the GT mark as custom geometry, the mark's
   counters (the inner G and T cuts) must be open, not filled: DrawingML paths carry no fill rule
   (pptx report section 4.8). Until confirmed the mark stays a PNG; record `custGeomCounters:
'open'|'filled'` when tested.
4. `normAutofit`. Select every text box on three slides (a heading slide, a rows slide, an opener
   plate): Format Shape > Text Box shows "Do not Autofit"; the geometry read-back's
   `normAutofitCount` is 0 for the file. Text never shrinks or reflows; the browser's line breaks
   (`<a:br/>`) hold.
5. Kerning. A heading with an all-caps word: letters are kerned (no `kern="0"` survived the
   post-process; `kernZeroCount` is 0 in the geometry read-back).
6. Two-tone pictures. At 100 percent zoom the dithered opener reads as cells; at any other zoom it
   greys (SPEC 8.6). Record the zoom levels tried; this is expected, not a defect.
7. Notes. The notes pane shows the slide's `notes` on a slide that has them.
8. Save and reopen. Save a copy from PowerPoint and reopen it in python-pptx
   (`.turboslide/venv/bin/python -c "from pptx import Presentation; ..."`): the slide count holds
   and the fonts are still listed. Record whether PowerPoint re-embedded or stripped the fonts.

Keynote and PowerPoint for the web are not expected to honor embedded fonts (SPEC 8.4);
`ExportReport.fonts.substitutedIn` names them. A note of what they showed is welcome but does not
gate anything.

## Fonts

`scripts/build-fonts.py` (run through `turboslide fonts build`, which creates `.turboslide/venv`
from `scripts/requirements.txt`) cuts the export set from `packages/fonts/assets/InterVariable.woff2`
into `packages/fonts/export/`, committed with `fonts.json`: `GT Inter Display` (opsz 32, weight
500, `cv11` and `ss01` frozen into the cmap), `GT Inter Text <size>` and `GT Inter Text <size>
Medium` for 26, 24, 22, 20, 18, 15 and 14, and `Inter` and `Inter Medium` (opsz 14) for
`--fonts standard`. Inter's license (SIL OFL 1.1) declares no Reserved Font Name (checked in name
IDs 0, 7, 13, 14 and `THIRD_PARTY_NOTICES.md`; recorded in `fonts.json` `license`), so the renamed
instances are permitted; the script refuses to rename if a later release declares one. The build
is deterministic (`head.modified` kept from the source); `turboslide fonts build --check` exits 1
when the committed set differs from a fresh build. `fonts.json` lists the faces under `faces` and,
for the PPTX builder's map, under `families` (the same rows).
