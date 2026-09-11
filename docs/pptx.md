# PPTX export

What "perfect PPTX" means in Turboslide, how the flatten file is built and measured, what the
editable text mode promises, how a file is verified, and what PowerPoint is known to do with it.
Written on 2026-09-11 for Kevin's directive ("instead of exporting to google slides just make it
perfect pptx"), which also removed the Google Slides exporter (SPEC 8.3 is not implemented; the
`gslides` format, its dry run, the `/api/assets/:token` image host, `calibration/slides.json` and
`docs/google-slides.md` are gone, and MILESTONES M6 item 1 is closed as withdrawn). PPTX is the one
export target; PDF lands with the publishing builder.

## The two modes

`turboslide export pptx --mode flatten|native` (`export.run`), one file per theme,
`<deckId>-light.pptx` and `<deckId>-dark.pptx`, plus `<deckId>-both.zip` holding both when both
themes are exported (`--theme both`, the default). Both modes share the page (13.333333 by 7.5
inches, 12,192,000 by 6,858,000 EMU; one sheet pixel is 7,620 EMU), the speaker notes
(`Slide.notes`, the deck default when a slide has none), the slide names and hidden titles below,
the OOXML post-process and the package validation.

**Perfect** (`flatten`, the default; the menu's first option). Every page is the 2x sheet
screenshot of the rendered slide (3200 by 1800) placed as a full-page picture over the slide's text
written as invisible runs (`<a:alpha val="0"/>`), so the page is pixel identical to the web render
in every viewer that draws pictures and the text stays searchable, selectable and extractable. The
screenshot travels in the encoding the raster policy below picks, and the exporter decodes that
encoding again and diffs it against the shot, so the claim is measured before the file is written.
`ExportReport.perfect` is true when every page raster decodes within 0.1 percent of its shot at
pixelmatch threshold 0.1 and the package validated; `--verify` then measures the rendered file
against the web render through LibreOffice (below), the gate that has held since M2 at 0.1
percent per page. No fonts are embedded: the text layer is invisible, so no viewer draws a face,
and a font part PowerPoint rejects is the one part that has made it open a Turboslide file through
its repair dialog.

**Editable text** (`native`). Every text block whose type is in `NATIVE_BLOCK_TYPES` is a text box
at the browser's box with the browser's line breaks, the frame and the ruled rows are hairlines,
the plates and chips are rectangles, and the icons, marks, diagrams, dithers, screenshots and
pictures are PNGs at 2x (icons and marks 3x, diagrams 1x). What it promises is layout, not pixels:
measured in the render worker image on the 85-slide deck in both themes, every one of the 624
gated blocks lands within 3 px horizontally and 1 px vertically of the web render (the M5 gate,
`docs/export-verification.md`), while glyph antialiasing, hinting and the exact face a viewer
resolves are the viewer's. The GT Inter static faces are named in the runs; `--embed-fonts`
(`embedFonts` in `export.run`) embeds them as fntdata parts for a viewer without them installed,
off by default for the repair reason above. The menu calls this mode "Editable text" and states
the tolerance; nothing in it is called identical.

## The raster policy

`packages/export/src/pptx/page-raster.ts` encodes each flatten page under one rule set,
measured against the shot after every encoding:

| Page                                                                                                                                                                                                                              | Encoding                                                                        | Budget                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------ |
| two colors (a dither with no text)                                                                                                                                                                                                | 1-bit palette PNG through the effects encoder, the two exact colors             | exact by construction                                  |
| any page                                                                                                                                                                                                                          | 8-bit palette PNG, libvips quantizer at 256 colors, no dither                   | within 1 percent mismatch, else the truecolor fallback |
| a page with a continuous-tone block (`shot`, `pair`, `tiles`, `details`, `board`, `material`, an opaque `shot` or `html` raster, or a full picture that is not a regenerated two-tone dither) and more than 4,096 distinct colors | JPEG at quality 92 with 4:4:4 chroma, only when it is also smaller than the PNG | within 0.5 percent mismatch                            |
| everything else                                                                                                                                                                                                                   | truecolor PNG (24-bit when the shot is opaque, 32-bit otherwise), zlib 9        | exact                                                  |

The report records the format, the bytes, the color count (capped at 4,097), the mismatched pixel
count and the fraction per page (`slides[].page`), and `perfect` requires every fraction at or
under 0.001, tighter than either encoding budget. Measured on the kept pages of the export test
(slides 01, 08, 33 and 47 in both themes, sharp 0.35.0): the text page of 662 colors quantizes with
0 mismatched pixels at 89 KB (191 KB as the browser's RGBA PNG); the two-tone opener with its
plate and credit (449 colors) at 44 KB (81 KB); the screenshot page of 38,808 colors at 371 KB
with 15 mismatched pixels of 5.76 million (0.0003 percent; 873 KB as RGBA, 467 KB as a JPEG that
loses to the PNG); the photographic opener as a 393 KB JPEG with 0 mismatched pixels (1.43 MB as
RGBA, 764 KB as a palette PNG). A dither never takes the JPEG path: the same two-tone opener is
1.08 MB as a JPEG. The four-slide flatten file fell from 4.66 MB (2.0 MB of it font parts) to
0.93 MB per theme with `perfect` true.

A sheet with translucent pixels (none in the deck) skips the JPEG candidate and keeps its alpha in
the palette or truecolor PNG. `--no-jpeg` on the CLI (`noJpeg` in `exportPptx`) keeps every page a
PNG for a deterministic file.

## Slide names and titles

pptxgenjs names every slide "Slide N" and writes no title placeholder, so PowerPoint's outline,
its selection pane and its accessibility checker had nothing to show. The post-process
(`packages/export/src/ooxml/titles.ts`) writes the slide title (`slideTitle` of the schema: the
override, else the first heading, else "Slide n") into `<p:cSld name>`, inserts one title
placeholder as the first shape of the tree (`<p:ph type="title"/>`, `cNvPr hidden="1"`, the title
as an alpha 0 run in the heading's face, size and color at the heading's text box, inside the page
so the geometry read-back stays in bounds), and rewrites the `TitlesOfParts` of `docProps/app.xml`
so the file properties list the titles. This is what PowerPoint's own "Add hidden slide title"
command produces, except that PowerPoint places the box above the page. python-pptx reads the
names as `slide.name` and the titles as `slide.shapes.title.text`; the export test asserts both
against the deck.

## The OOXML post-process and the package validation

After pptxgenjs writes the buffer, `packages/export/src/pptx/build.ts` rewrites the package with
jszip: every `kern="0"` attribute is removed (it turns kerning off; SPEC 8.2), every empty
`extLst` is removed (invalid against the schema), the ruled rows are grouped, the slide names and
hidden titles are written, the content types lose the overrides pptxgenjs writes for slide master
parts the package does not hold (one per slide) and gain `image/jpeg` for `.jpg`, the media and
font parts are stored without deflate, and every zip entry carries the DOS epoch as its date (a
1970 date wrapped to 2098 on the stored parts before). `custGeom` is counted, never written: every
shape is a `prstGeom` rectangle or line.

`packages/export/src/ooxml/validate.ts` then walks the zip the way the Open Packaging Conventions
require: every part has a content type through an `Override` or a `Default` for its extension;
every `Override` names a part the package holds; every relationship of every `.rels` part resolves
to a part (external targets skipped) and no relationship id repeats inside one part; the root
`_rels/.rels` names the office document. An issue is a warning that fails `passed` and `perfect`,
and the report's residual states the part and relationship counts.

## Verification

1. `--verify` runs the LibreOffice loop of `docs/export-verification.md` in the render worker
   image: `soffice --headless --convert-to pdf` with lossless image compression, `pdftocairo` at
   3200 by 1800 for a flatten file (1600 by 900 for native), pixelmatch at threshold 0.1 against
   `turboslide render --scale 2` (`--scale 1` for native) at the same revision, regenerated
   two-tone pictures gated against the embedded sheet shot, per-block ink offsets in native mode,
   the EMU geometry read back. Flatten passes under 0.1 percent per page; native passes when every
   block of every all-native slide is within budget.
2. Where macOS provides `qlmanage`, the loop and `export check` also render the first page
   through QuickLook (`packages/export/src/verify/quicklook.ts`), a second renderer with its own
   Office importer. QuickLook substitutes every font it lacks and ignores text alpha (M2), and on
   this machine renders the 960.009 pt page at 1600 by 902, so its picture is recorded in the
   residual (dimensions, time, the mismatch when the sizes agree) and never gated.
   `TURBOSLIDE_NO_QUICKLOOK=1` skips it; `TURBOSLIDE_QLMANAGE` names another binary.
3. `turboslide export check <file.pptx> [--python <bin>] [--no-quick-look] [--json]`
   (`export.check`, `packages/export/src/check.ts`) reads any file back: the zip walk above, the
   page size and every shape's bounds, the checklist counts (`custGeom`, `normAutofit`,
   `kern="0"`), the media parts classed by their bytes (the PNG header's color type and bit depth,
   the JPEG marker) so the formats a flatten file uses are visible, the slide names and title
   placeholders, the embedded fonts, python-pptx reopening the file when an interpreter with the
   module exists (`TURBOSLIDE_PYTHON`, then the workspace's `.turboslide/venv/bin/python`), and
   QuickLook. Exit 0 when the package is valid, the page size is right, every shape is in bounds
   and python-pptx (when it ran) counts the same slides; 1 otherwise; 2 when the file is missing.
4. The export test (`packages/export/src/export-pptx.test.ts`) runs both modes over four deck
   slides in both themes with Chrome for Testing and asserts the perfect flag, the page formats,
   the absence of font parts in the flatten files, the slide names and hidden titles (through the
   XML and through python-pptx), the content types clean and the package validation.

## PowerPoint notes

PowerPoint cannot run headless on Linux, so the PowerPoint pass stays the manual checklist of
`docs/export-verification.md`, updated for this round:

- The repair dialog. Its known triggers in generated files are font parts it rejects (the
  uncompressed EOT wrap is unverified in PowerPoint; the flatten file carries none and the native
  file carries them only under `--embed-fonts`), `kern="0"` and empty `extLst` (stripped),
  content type overrides for missing parts (removed), targets with spaces in media names
  (pptxgenjs avoids them), and relationships to missing parts (the validation fails the report).
- The hidden title. Home, Arrange, Selection Pane lists `ts:<slideId>#title` hidden on every
  slide; Review, Check Accessibility reports no "missing slide title"; the outline view shows the
  titles. A viewer that ignores `hidden` draws an alpha 0 run at the heading's box, which paints
  nothing; in the flatten file the cover picture lies above it in any case.
- The JPEG pages. PowerPoint decodes the JPEG with its own decoder; at quality 92 with 4:4:4
  chroma the error is a few levels per channel, far under the 26 levels pixelmatch's threshold
  0.1 needs to count a pixel. "Compress pictures" on save would re-encode every page and is the
  one action that breaks the perfect claim; the report's hashes name the file that was measured.
- Two-tone pictures read as cells at 100 percent zoom and grey at every other zoom in every
  office application (SPEC 8.6); this is expected.

## Measured on the deck

`decks/gt-brand` at revision 24, 85 slides, both themes, 2026-09-11.

On Kevin's machine (Chrome for Testing 147.0.7727.15 on ANGLE Metal, sharp 0.35.0, no verify):
`turboslide export pptx --mode flatten --theme both` wrote `gt-brand-light.pptx` at 15.68 MiB and
`gt-brand-dark.pptx` at 15.85 MiB (40.75 and 42.42 MiB at the M2 gate, with 4.4 MB of font parts
each) plus `gt-brand-both.zip` at 31.53 MiB, in 180.9 s; `perfect` true in both themes; 170 pages
as 166 palette PNGs and 4 JPEGs (the two photographic openers, `opener-blog` and
`opener-developer-experience`, 384 to 460 KB each with 0 mismatched pixels); 15.38 and 15.55 MiB
of page rasters; the worst decoded mismatch 0.003 percent (`horizon` light, 194 of 5,760,000
pixels; 136 pages at exactly 0); the largest pages `inspirations` at 0.79 MiB and `gem-smoke` at
0.59 MiB, both palette PNGs; 446 parts and 528 relationships per file, valid; 84 content type
overrides for missing slide masters and 423 `kern="0"` attributes removed per file, 0 `custGeom`,
0 empty ext lists; no fonts embedded, 14 families named by the invisible runs.

In the render worker image rebuilt from this tree (image `cee157aeb63d`; Chromium 147.0.7727.0 on
SwiftShader, LibreOffice 25.2.3.2, pdftocairo 25.03.0), the two gates ran as the acceptance lines
name them:

- `turboslide export pptx --mode flatten --theme both --fonts exact --verify`: `gt-brand-light.pptx`
  15.36 MiB, `gt-brand-dark.pptx` 15.52 MiB, `gt-brand-both.zip` 30.88 MiB; `perfect` true and
  `passed` true in both themes; 170 pages as 166 palette PNGs and 4 JPEGs, 139 of them decoding
  with 0 mismatched pixels and the worst at 0.010 percent (dark); through LibreOffice, 133 of the
  170 pages at exactly 0 mismatched pixels against the 2x render, the worst page
  `opener-developer-experience` light at 0.049 percent (a JPEG page; the gate is 0.1), the 30
  regenerated two-tone pictures at most 0.055 percent against the embedded sheet shot; 883
  shapes per file (85 of them the hidden titles), 0 `custGeom`, 0 `normAutofit`, 0 embedded
  fonts, geometry in bounds; 1428.9 s for the export and the three verify passes (the CLI
  verifies each theme's report and then the merged report, which renders both files again).
- `turboslide export pptx --mode native --theme light,dark --fonts exact --verify` (the M5 gate,
  now without font parts by default): `passed` true, 170 pages, 624 gated blocks every one within
  budget (`dx` 0 on 590, +1 on 24, -1 on 10; `dy` 0 on 362, -1 on 247, +1 on 15; `dw` 0 on 422,
  -1 on 151, +1 on 35, -2 on 9, +2 on 7, the M5 distribution unchanged), 56 all-native pages,
  worst page fraction 1.213 percent (`inspirations` dark, informational in this mode);
  `gt-brand-light.pptx` 22.51 MiB and `gt-brand-dark.pptx` 23.61 MiB (28.05 and 29.21 MB with the
  13 embedded faces at M5), 1329 shapes per file, `perfect` false as designed; 481.4 s.
- `turboslide export check` on the light flatten file inside the image: valid, 446 parts, 528
  relationships checked, 0 invalid, 0 undeclared parts, 0 overrides for missing parts, 85 slides
  named and titled, media 83 palette PNGs, 2 JPEGs and 1 truecolor PNG (the wordmark of the
  layout), 15.06 MiB of media; python-pptx and QuickLook absent there. The same command on
  Kevin's machine reopened the file with python-pptx (85 slides, 774 shapes) and rendered the
  first page through QuickLook at 3200 by 1805 in 690 ms.
