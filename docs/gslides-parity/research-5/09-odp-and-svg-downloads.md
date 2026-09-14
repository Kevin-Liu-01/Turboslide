# Google Slides parity research 09 (round five): ODP and SVG downloads

Written 2026-09-14 against main at d5d7f07 (round three and its hotfix). Every repository fact
below was read with `git show d5d7f07:<path>`; the working tree carries round four's uncommitted
edits and was not consulted. Sibling reports read first: 02 c.1 (Google's download rows and the
Drive export table), 04 section 8 (zip and XML libraries), 05 section 10 (the LibreOffice round
trip leg), 07 sections 5 and 11 (the export package and the hosting limits). External facts carry
a source letter and were read on 2026-09-14; the Sources section lists the URLs. Where no public
page could be read the statement is marked unverified and repeated in the Unverified section.

## How to read this report

Part 1 records what Google's two downloads are and how the receiving applications treat the two
formats. Part 2 is the ODP design: the package, the element table per Turboslide block, the three
build paths and the recommendation, the libraries, the validity check, and the action and dialog
changes. Part 3 is the SVG design for the current slide: the three paths, what the scene carries
per line, the element table, the font modes, the measured sizes, the gates and the action changes.
The report ends with one consolidated library table, the action and dialog changes, the decisions
for Kevin, the unverified list and the sources.

## Summary

1. ODP. Write it in Turboslide (path c of section 2.6): a `packages/export/src/odp/` writer fed by
   the same scenes the PPTX builder reads, zipped with jszip through a new `writeOdfPackage` that
   puts the stored `mimetype` entry first, verified in the render worker container by the loop
   that exists today (`soffice --headless --convert-to pdf` accepts an ODP without an OOXML
   import pass, then pdftocairo and pixelmatch against the 2x render). Both modes exist: Perfect
   is the flatten page raster as a full page `draw:image` over text frames whose runs carry
   LibreOffice's `loext:opacity` text transparency (an ODF extended attribute) and the paper
   colour; Editable text is one `draw:frame` per measured text with the same fixed line pitch and
   first baseline model the PPTX uses, because the model was measured on LibreOffice, which is
   the ODP's own renderer. Cost: about 2,500 to 3,500 lines of TypeScript and tests across ten
   modules, the shape of `pptx/` today; the runtime cost of an export is the scene extraction the
   PPTX already pays, so the hosted budget (780 s, 60 slides per batch, the 4,718,592 byte
   response cap with the 302 fallback) is unchanged. Path b (LibreOffice converting the Editable
   text PPTX to ODP with the `impress8` filter) is a 50 line child process that runs only where
   LibreOffice is installed, so hosted it needs the worker host on Kevin's list; it stays as a
   container oracle whose `content.xml` the check step diffs against the writer's. One
   prerequisite: at d5d7f07 `shapePath`, `textInset` and `sites` in `packages/schema/src/shapes.ts`
   are still the rectangle stubs of SPEC-2 merge 1 (VERIFICATION-2 item 6), so the sheet draws
   every preset as its box; the ODF `draw:enhanced-path` of the 135 presets needs the interpreter
   of SPEC-2 0.57, and until it lands the ODP writes `draw:type="ooxml-<prst>"` with the box path,
   the same box the sheet shows.
2. SVG. Write it from the scene (path b of section 3.1), with the pdftocairo path as a container
   oracle only: one `<text>` per measured line, `<tspan>` per run with `x` and `textLength` from
   the run box and the baseline from the run box top plus Inter's ascent (0.96875 em, read from
   the export faces), shapes and charts as the paths the renderer already emits, icons and the
   mark from the sprite's symbols, rasters as PNG data URIs, the frame and counter from the scene,
   the sheet box as the `viewBox`, a `<title>` and `<desc>`, no scripts and no external
   references. Text travels in one of three modes: `embed` (the InterVariable woff2 inlined as an
   `@font-face` data URI, 470 KB of base64 upright plus 508 KB italic when used, exact in
   browsers), `outline` (glyph paths through fontkit 2.0.4, exact in Illustrator, Inkscape and
   Figma, no searchable text) and `link` (font names only, the smallest file, exact widths held
   by `textLength`). Measured on the brand deck's eight m2 scenes, the SVG without fonts is 1 to
   26 KB for text slides and 342 KB for the closing slide with its 252 KB picture; embed adds the
   470 KB font. Cost: one writer module of about 900 to 1,200 lines plus a `baseline` field in
   `scene/measure.ts`, fontkit in the catalog for outline mode, and a Chromium fidelity gate at
   the PDF gate's values. The action is `render.slide` with `format: 'svg'` and a `text` field;
   the Download row invokes it for the current slide the way the PNG and JPEG rows do.

## 1 What main holds today

- `file.download.odp` and `file.download.svg` are Later with `DOWNLOAD_FORMATS` ("Only PowerPoint,
  PDF, text, pictures and the web page download"), `packages/chrome/src/menus/model.ts` lines 841
  and 858 to 862. SPEC.md section 7's table omitted them with "No ODP writer and no sales demand
  in R07" (line 144) and "The sheet carries rasters (icons, marks, pictures, dithers); an SVG
  wrapping rasters misrepresents the file type" (line 149). SPEC-2 section 12 line 791 and
  SPEC-3 line 270 carry them forward unchanged.
- The Drive export API lists four MIME types for presentations: PPTX, ODP
  (`application/vnd.oasis.opendocument.presentation`), PDF and plain text; SVG, PNG and JPEG are
  offered for Drawings only (G1). Google's SVG is therefore an editor only download of the
  current slide, as report 02 c.1 recorded.
- The export package (`packages/export/src/`, report 07 section 5.1) has one zip helper,
  `ooxml/zip.ts`, whose `writePackage` iterates `listParts` in sorted order and stores media
  parts; an ODF package needs a different writer because `mimetype` must be the first entry
  (section 2.1). `pdf/build.ts` prints the print document through Chromium; `verify/libreoffice.ts`
  runs `soffice --headless --convert-to pdf:<filter>` with a private profile and rasterizes with
  `pdftocairo -png -r 120 -scale-to-x 1600 -scale-to-y 900` (pdftoppm as the fallback), and
  `renderPptxPages` takes any input file soffice accepts.
- The scene (`scene/types.ts`) already carries what both writers need: per text the lines with
  their boxes and runs (section 3.2), per rect the fill, outline, preset id and adjust values,
  per segment the ends, points, decorations and attachments, tables as grids with merged cells and
  per cell borders, charts with their data and resolved colours, the background, the rasters with
  their PNG paths and scale, the frame rules and crosses, the wordmark box, the counter and the
  notes. `pptx/baseline.ts` holds the LibreOffice first baseline model (`dy = pitch / 2 −
  k(size) × size`) and `pptx/face-advance.ts` the off cut advance excess; both were measured on
  LibreOffice 25.2.3.2 and apply to an ODP directly.
- The renderer emits shapes as inline SVG (`packages/render/src/blocks/primitives.ts`
  `renderShape`: `<rect>`, `<ellipse>`, `<line>` with `<polygon>` heads, `<path>` for elbow,
  curved, curve, polyline and scribble, and `<path d="${shapePath(...)}">` for a preset), charts
  as inline SVG (`chart.ts`), declared diagrams as inline SVG with `<use href="#i-...">` icons and
  `<use href="#gt-mark">` (`dia.ts`), tables as a CSS grid of `.td` cells (`table.ts`), pictures
  as `<img>` with the theme twins (`picture.ts`), dithers as `<canvas>` the runtime draws
  (`misc.ts`) and icons as `<svg><use href="#i-<name>"/></svg>` (`context.ts iconSvg`). The
  sprite is 63 Heroicons 20 solid symbols plus `gt-mark` (`packages/theme/src/sprite.ts`, MIT),
  each a `viewBox` and a path body, so every icon and the mark have vector forms.
- `shapePath(kind, w, h, adjust)` at d5d7f07 returns `M0,0 H${w} V${h} H0 Z` for every preset
  (`shapes.ts` line 385 onward, "Until shapes/geometry.ts lands (merge 1b)"); `shapes.test.ts`
  asserts the box. VERIFICATION-2 item 6 records this as a build gap of SPEC-2 0.57: the sheet
  draws every preset as its box while LibreOffice draws the ECMA geometry from the `prstGeom`
  name. The definitions file is committed (`shapes/definitions.ts`, `PathCommand` with `moveTo`,
  `lnTo`, `arcTo`, `quadBezTo`, `cubicBezTo`, `close`), so the interpreter is the missing piece.
- `standalone.ts` inlines fonts by replacing the `url(...)` of `inter.css` with
  `data:font/woff2;base64,...` (`theme-node.ts inlineFontCss`); `inter.css` declares two
  `@font-face` rules, Inter upright and italic, weight 100 to 900, from
  `packages/fonts/assets/InterVariable.woff2` (352,240 bytes) and `InterVariable-Italic.woff2`
  (380,904 bytes), SIL OFL 1.1 with no Reserved Font Name (`fonts.json` `license`).
- The export faces (`packages/fonts/export/*.ttf`, 34 files) carry Inter's vertical metrics:
  `unitsPerEm` 2048, `hhea` ascender 1984 and descender −494, `OS/2` typo metrics equal with
  `USE_TYPO_METRICS` set (read from `GTInterText22-Regular.ttf` and `GTInterDisplay-Regular.ttf`
  in the scratchpad). Ascent is 0.96875 em, descent 0.24121 em, the content height 1.20996 em,
  which is the `1.21` measure.ts uses for a `normal` line height.
- Hosting (report 07 section 11.2): no LibreOffice or poppler inside a function; both live in
  `docker/render-worker.Dockerfile` (LibreOffice 25.2.3.2, poppler 25.03.0, Debian 13); the
  heavy functions run 800 s with 3,009 MB, the synchronous export budget is 780 s, a response
  body over 4,718,592 bytes becomes a 302 to the stored copy, `/tmp` is 525 MB.
- Installed in the workspace (`pnpm-workspace.yaml` catalog and `node_modules/.pnpm`): jszip
  3.10.2, pixelmatch 7.2.0, sharp 0.35.4, playwright-core 1.62.1, pptxgenjs 4.0.1, pngjs 7.0.0.
  Not installed: @xmldom/xmldom, fontkit, opentype.js, fast-xml-parser, svgo, any ODF library.

## Part 1, Google and the readers

| Question | Finding | Source |
| --- | --- | --- |
| What Google's SVG download contains | Unverified. No public page describing the file's internals (text as `<text>` or as paths, font references, data URI images, `viewBox` and size) could be read within this report's budget. What is verified: the row is "Scalable Vector Graphics (.svg, current slide)" in the editor only, and the Drive export API offers no SVG for presentations, so no API documentation of the file exists. Kevin can settle it in one minute by downloading one slide and opening the file in a text editor; the design of Part 3 does not depend on the answer. | G1; report 02 c.1 |
| What Google's ODP download keeps and loses | Unverified. No dated community or third party report was read. The Drive export API confirms the MIME type and that ODP is a whole deck format. | G1 |
| Applications that open ODP | LibreOffice Impress opens and writes ODP natively; the filter is `impress8` ("ODF Presentation", media type `application/vnd.oasis.opendocument.presentation`), listed for import and export, beside `Impress MS PowerPoint 2007 XML` for PPTX and `impress_pdf_Export` for PDF (L1). Apple's page on iWork and Microsoft Office names what Keynote opens as "All Keynote versions" and "Microsoft PowerPoint: Office Open XML (PPTX)", what Pages opens as Pages, DOCX, RTF and TXT, and what Numbers opens as Numbers, XLSX, CSV and text; no OpenDocument format appears on the page (A1). Keynote's export list is PDF, PowerPoint, Movie, Animated GIF, Images, HTML and Keynote '09 (A2). The report therefore treats ODP as a LibreOffice format (and that of the applications built on LibreOffice's ODF support) and does not claim Keynote or Pages support. | L1, A1, A2 |
| Applications that open SVG | Browsers render SVG directly and as an image; when used as an image (`<img>`, `background-image`, SVG `<image>`) "JavaScript is disabled" and "External resources (e.g., images, stylesheets) cannot be loaded, though they can be used if inlined through `data:` URLs" (M1). `<foreignObject>` is "Baseline: Widely available" in browsers since July 2015 (M2). Figma converts an imported SVG into "an editable vector layer" (F1); how it treats `<text>`, `@font-face` in a `<style>` element and data URI images is not stated on that page and is unverified here. Illustrator's SVG import page returned 403 on both Adobe URLs tried; its handling of web fonts and `foreignObject` is unverified here. Inkscape's FAQ and wiki pages returned 403 and 404; its handling is unverified here. The round one objection (an SVG whose text lives in a `foreignObject` renders in browsers only) is Turboslide's own statement and stands as the design constraint of section 3.1. | M1, M2, F1 |
| Embedded `@font-face` in a `<style>` element | Works in browsers when the `src` is a data URI (M1). Whether Illustrator, Figma and Inkscape read a `@font-face` from a `<style>` element is unverified here; the outline mode of section 3.4 removes the question by shipping glyph paths. | M1 |
| Data URI images | SVG `<image>` takes a URL; the formats software must support are JPEG, PNG and SVG (M3); data URIs are the inlining rule browsers allow in image contexts (M1). | M1, M3 |

## Part 2, ODP

### 2.1 The package

ODF 1.3 is OASIS OpenDocument v1.3 (also ISO/IEC 26300). Part 2 defines the package (O2) and
Part 3 the schema (O3).

| Entry | Rule | Turboslide's writer |
| --- | --- | --- |
| `mimetype` | "The 'mimetype' file shall be the first file of the zip file", "shall not be compressed" and "shall not use an 'extra field' in its header"; its content is the ASCII media type (O2 section 3.3). If the manifest has an entry for `/`, the mimetype file must exist and equal its `manifest:media-type` (O2 3.3). | `application/vnd.oasis.opendocument.presentation`, written first with `STORE`. A new `odp/package.ts writeOdfPackage` adds it before every other entry; `ooxml/zip.ts writePackage` cannot be reused because it sorts entries. `entryMethods` (zip.ts) already parses local headers; the test extends it to read the extra field length and asserts offset 0 is `mimetype`, method 0, extra length 0. Whether jszip writes an extra field for an ASCII name is asserted, not assumed (unverified). |
| `META-INF/manifest.xml` | Exactly one `<manifest:file-entry>` per file except `mimetype` and `META-INF/*`, with `manifest:full-path` and `manifest:media-type`; the root entry `/` carries `manifest:version` (O2 3.2, 4.3). | Entries for `/` (the presentation media type, `manifest:version="1.3"`), `content.xml`, `styles.xml`, `meta.xml`, `settings.xml` (`text/xml`), `Pictures/<sha>.png` or `.jpg` (`image/png`, `image/jpeg`), `Thumbnails/thumbnail.png`, `Object <n>/` (`application/vnd.oasis.opendocument.chart`) and `Object <n>/content.xml`, `Media/<sha>.<ext>` (`video/mp4`, `audio/mpeg`), `Fonts/<file>.ttf` (`application/x-font-ttf`) when fonts are embedded. Media stored, XML deflated, entry date the DOS epoch of `ENTRY_DATE`. |
| `content.xml` | `office:document-content` with `office:version="1.3"`, `office:font-face-decls` (O3 3.14), `office:automatic-styles` (3.15.3), `office:body` > `office:presentation` (3.6) > `draw:page` (10.2.4) with `draw:name`, `draw:style-name` (a `drawing-page` automatic style), `draw:master-page-name` and optionally `presentation:presentation-page-layout-name`; `presentation:settings` after the pages. | One `draw:page` per unskipped slide (skipped slides only under `includeSkipped`, hidden by the page style). `draw:name` is the slide title of `slideTitle` (the PPTX's `p:cSld name`). Shapes carry `xml:id` and `draw:id` `ts-<slide>-<block>` so connectors and animations can target them. |
| `styles.xml` | `office:document-styles` with `office:font-face-decls`, `office:styles` (`draw:marker`, `draw:stroke-dash`, `draw:fill-image`, the default styles), `office:automatic-styles` holding `style:page-layout` (16.5) with `style:page-layout-properties fo:page-width fo:page-height style:print-orientation`, and `office:master-styles` (3.15.4) with `draw:layer-set` (10.2.2) and `style:master-page` (16.9) carrying `style:page-layout-name`, `draw:style-name` and `presentation:notes` for the notes layout. | The page is 33.867 cm by 19.05 cm (13.333333 in by 7.5 in; LibreOffice stores lengths in 1/100 mm, which is why the verify loop sees 960.009 pt pages, and the ODP names that grain directly). Report 08 makes the sheet size variable; the writer reads `scene.sheet` and `units.ts`, where one sheet px is 1/120 in. Two master pages per theme as the PPTX defines two masters: the paper master carrying the frame's four rules, the four crosses (two lines each) and the wordmark as a `draw:image`, and the picture master carrying the paper only. |
| `meta.xml`, `settings.xml`, `Thumbnails/thumbnail.png` | Optional. | `meta:generator` "Turboslide <version>", `dc:title`, `dc:date`, `meta:document-statistic`; `settings.xml` omitted (LibreOffice writes its own); the thumbnail is the first page raster at 256 px wide, cheap and useful in file managers. |

Lengths are written in `cm` with four decimals (LibreOffice rounds to 1/100 mm, 0.047 sheet px,
the same snap the PPTX loop measured as `COVER_OFFSET_IN`); rotation as
`draw:transform="rotate (<radians>) translate (<x> <y>)"` about the box centre converted to ODF's
origin form; horizontal and vertical mirror as `draw:mirror-horizontal` and `draw:mirror-vertical`
on `draw:enhanced-geometry` for custom shapes and `style:mirror` for images.

### 2.2 The ODF element table

Each row names the scene entry the PPTX builder reads today (`pptx/build.ts` order), the ODF
element, the attributes and styles, and what is lossy. Section numbers are O3's where the table
of contents gave them.

| Turboslide block or scene entry | ODF element | Attributes and styles | Lossy note |
| --- | --- | --- | --- |
| Text (`SceneText`: heading, paragraph, credit, text, box text, shape text, rows keys and values, refs, ladder, panel, the counter) | `draw:frame` (10.4.2) > `draw:text-box` (10.4.3) > `text:p` per paragraph, `text:span` per run | Frame: `svg:x svg:y svg:width svg:height` from `textBox` lifted by `firstBaselineShiftPx` (the same constant as the PPTX), `draw:style-name` to a `graphic` style with `draw:fill="none" draw:stroke="none" draw:auto-grow-height="false" draw:textarea-vertical-align` (`valign`), `fo:padding-*` (`padding`), `style:columns fo:column-count fo:column-gap` (`columns`). Paragraph style: `fo:text-align` (start, center, end, justify), `fo:line-height="<pitch>pt"` (fixed pitch, the `spcPts` analogue), `fo:margin-top fo:margin-bottom` (`paraSpace`), `fo:margin-left fo:text-indent` (hanging bullets). Text style: `style:font-name` to a face of `office:font-face-decls` (the exact set's family for the size and weight through `fonts-map.ts`, weight 500 as the Medium family as in the PPTX), `fo:font-size="<px × 0.6>pt"`, `fo:font-weight`, `fo:font-style="italic"`, `fo:color`, `fo:background-color` (highlight), `fo:letter-spacing` (tracking, plus the face advance excess of `face-advance.ts` taken back as negative spacing), `style:text-underline-style="solid"` with `style:text-underline-width="auto"` and `style:text-underline-color`, `style:text-line-through-style="solid"`, `style:text-position="super 58%"` and `"sub 58%"`. Links: `text:a xlink:href xlink:type="simple"`. One hard break per browser line as `text:line-break`; a new `text:p` where `SceneLine.paragraph` changes. | `fo:font-weight` accepts 100 to 900 but LibreOffice's UNO weights are coarser, so weight 500 rides the Medium family name as in the PPTX. Slide links (`#s/<id>`, `#next`, `#previous`, `#first`, `#last`) become `office:event-listeners` > `presentation:event-listener presentation:action` (`next-page`, `previous-page`, `first-page`, `last-page`) on the frame; the form of a jump to a named page is unverified (section 5). `style:columns` on a text box is honoured by LibreOffice 7.2 and later; unverified for the 25.2 image beyond that release note memory. |
| Lists (`SceneBullet`) | `text:list text:style-name` > `text:list-item` > `text:p`, with a `text:list-style` in automatic styles | `text:list-level-style-bullet text:level text:bullet-char` for glyph presets; `text:list-level-style-number style:num-format` (`1`, `a`, `A`, `i`, `I`) with `style:num-suffix="."` and `text:start-value` (`startAt`); `style:list-level-properties text:list-level-position-and-space-mode="label-alignment"` > `style:list-level-label-alignment fo:margin-left fo:text-indent` at the renderer's 36 px hanging indent (`BULLET_INDENT_PX`). | The `substituted` forms (`zerodigit` and the others with no OOXML scheme) travel as the same substitution the PPTX records in `residual`. |
| Rules and plates (`SceneRule`, `SceneRect` roles plate, chip, panel, border) | `draw:line` (10.3.3) for a hairline; `draw:rect` (10.3.2) for a plate or chip | Line: `svg:x1 svg:y1 svg:x2 svg:y2`, graphic style `svg:stroke-width="0.6pt" svg:stroke-color` in the composite colour on paper (`lineColor`); over a picture the PPTX writes the ink with alpha, and ODF has `svg:stroke-opacity` on graphic properties for the same rule. Rect: `draw:fill="solid" draw:fill-color`, `draw:stroke="none"`. Crosses: two lines each. | None beyond the 1/100 mm snap. |
| Shape blocks (`SceneRect` roles box, shape; `shape` and `preset`) | `draw:rect` with `draw:corner-radius` for rect and roundRect, `draw:ellipse` (10.3.8) for ellipse, `draw:custom-shape` (10.6.1) > `draw:enhanced-geometry` (10.6.2) for the 135 presets | `svg:viewBox`, `draw:type`, `draw:enhanced-path` (19.145), `draw:modifiers` (the adjust values), `draw:text-areas` (19.220), `draw:glue-points`, `draw:equation draw:name draw:formula` children; `draw:mirror-horizontal`, `draw:mirror-vertical`; the graphic style carries fill, stroke, `svg:stroke-width`, `draw:stroke="dash"` with `draw:stroke-dash` naming a `draw:stroke-dash` of `office:styles` (`draw:dots1 draw:dots1-length draw:dots2 draw:dots2-length draw:distance` from `dashArray`), `draw:shadow="visible" draw:shadow-offset-x draw:shadow-offset-y draw:shadow-color draw:shadow-opacity`. | `draw:type` is `ooxml-<prstGeom>`: LibreOffice names every OOXML preset it imports `"ooxml-" + <preset name>` (`customshapepresetdata.cxx` sets `PROP_Type` to `"ooxml-" + aName`, ignoring the data file's `Type` line, L3), keeps `ooxml-non-primitive` for shapes without a preset (`customshapeproperties.cxx`, L4), and on export back to OOXML treats any type starting with `ooxml` as a preset (`prstGeom`) and everything else as `custGeom` (`oox/source/export/shapes.cxx WriteCustomShape`, L5). So an ODP with `draw:type="ooxml-star5"` round trips to PowerPoint as `star5`, and LibreOffice draws it from `draw:enhanced-path` (only `ooxml-rect` is in its own type table, L6). The path must be written in full: until the interpreter of SPEC-2 0.57 lands, `shapePath` is the box, and the ODP draws the box the sheet draws (section 1); with the interpreter, `PathCommand` maps to ODF path commands (`M`, `L`, `C` for cubicBezTo, `Q` for quadBezTo, `Z`; an `arcTo` as ODF's angle ellipse commands or as cubic segments). Blur on shadows is LibreOffice's `loext:shadow-blur`, an extension (unverified for 25.2; the PPTX writes blur through pptxgenjs). |
| Lines and connectors (`SceneSegment`) | `draw:line` for line and arrow; `draw:connector` (10.3.10) for elbow and curved; `draw:path` (`svg:d`, `svg:viewBox`) for curve, polyline and scribble; `draw:polygon` for a closed polyline | Connector: `draw:type="lines"` (elbow) or `"curve"`, `svg:x1 svg:y1 svg:x2 svg:y2`, `draw:start-shape` (19.217) and `draw:end-shape` (19.144) naming the targets' `draw:id`, `draw:start-glue-point` (19.215) and `draw:end-glue-point` with the site index, `svg:d` for the drawn route. Ends: `draw:marker-start draw:marker-end` naming a `draw:marker` of `office:styles` (`svg:viewBox`, `svg:d` from `lineEndPath`), `draw:marker-start-width`, `draw:marker-start-center="true"` for the centred circle, square and diamond kinds, the `openArrow` and other open kinds as stroked marker paths. | The eight sites of `rectSites` map to LibreOffice's four standard glue points (top, left, bottom, right) plus four `draw:glue-point` elements at the corners; the standard numbering is unverified (section 5). A connector's bend (`bend`) survives only through `svg:d`; LibreOffice reroutes on edit. |
| Pictures and rasters (`ScenePicture`, `SceneRaster`, `SceneBackground`) | `draw:frame` > `draw:image` (10.4.4) with `xlink:href="Pictures/<sha>.png"`; a covering picture also as the page style's `draw:fill="bitmap" draw:fill-image-name` with `style:repeat="stretch"` naming a `draw:fill-image` of `office:styles` | `svg:x svg:y svg:width svg:height`, `svg:title` and `svg:desc` children for the alt text, `style:mirror`, the shadow on the frame's graphic style, `draw:image-opacity` for a picture adjust transparency. The twins and the 2x and 3x rasters are the same bytes the PPTX embeds (`Pictures/` stored). | A `cover` crop (a picture whose aspect is not the sheet's) is a frame at the sheet box with `fo:clip` on the graphic style; the PPTX's `sizing: cover` has that analogue. Share alike pictures follow `excludeShareAlike` as today. |
| Tables (`SceneTable`) | `draw:frame` > `table:table` > `table:table-column` per column, `table:table-row` per row, `table:table-cell` (and `table:covered-table-cell`, 9.1.5) | Column styles (`style:table-column-properties style:column-width`), row styles (`style:table-row-properties style:row-height`), cell styles (`style:table-cell-properties fo:padding-* fo:border-bottom fo:border-top fo:background-color style:vertical-align`, `fo:border-*="0.6pt solid #hex"` and `none` at weight 0, dashed borders through `fo:border` styles), `table:number-columns-spanned` and `table:number-rows-spanned` on the anchor of a merge with `table:covered-table-cell` placeholders, `text:p` per paragraph with the same text styles as a text frame; the header row at the display face weight. | The six dashes reduce to ODF's `fo:border` styles (`solid`, `dashed`, `dotted`); a `longDashDot` border is `dashed`, recorded in `residual` as the PPTX records its substitutions. The ruled rows fallback of the PPTX (`tableFallback`) is not needed: the ODF table's grid is the measured grid. |
| Charts (`SceneChart`) | `draw:frame` > `draw:object` (10.4.6.2) with `xlink:href="./Object <n>" xlink:show="embed" xlink:actuate="onLoad"`; `Object <n>/content.xml` holding `office:document-content` > `office:body` > `office:chart` > `chart:chart` | `chart:class` (`chart:bar` with `chart:vertical="true"` in the plot area style for a horizontal bar chart, `chart:bar` upright for column, `chart:line`, `chart:circle` for pie), `chart:title`, `chart:legend chart:legend-position` (`start`, `end`, `top`, `bottom`), `chart:plot-area` > `chart:axis chart:dimension` (`x`, `y`) with `chart:categories table:cell-range-address`, `chart:series chart:values-cell-range-address chart:label-cell-address` with `chart:data-point` children and a chart style whose `style:graphic-properties draw:fill-color` is the resolved series colour, `chart:data-label` settings for `labels`, and the `table:table table:name="local-table"` with `office:value-type="float" office:value` cells; the number format as a `number:number-style` or `number:percentage-style` referenced by the axis style. Manifest entries for the object directory and its `content.xml`. | As in the PPTX, the chart's box is a picture region in the verify loop, reported and never gated: LibreOffice lays the chart out itself. An optional `ObjectReplacements/Object <n>` picture (the chart's 2x raster) lets readers without a chart module show the sheet's own drawing. |
| Notes | `presentation:notes` child of `draw:page` (16.19 per O3's table of contents) > `draw:page-thumbnail presentation:class="page"` and `draw:frame presentation:class="notes"` > `draw:text-box` > `text:p` | The notes page layout lives on the master's own `presentation:notes` (`style:page-layout-name` of a portrait layout). | Under `includeNotes` only, as the PPTX (decision 15.2). |
| Hidden slides | The page's `drawing-page` style: `style:drawing-page-properties presentation:visibility="hidden"` | LibreOffice maps its `Visible` page property to `presentation:visibility` (`sdpropls.cxx`, L7), with `presentation:background-visible` and `presentation:background-objects-visible` beside it. | Under `includeSkipped` only. |
| Transitions (round five report 05) | The same `style:drawing-page-properties` | `smil:type`, `smil:subtype`, `smil:direction`, `smil:fadeColor` for the effect (LibreOffice's `TransitionType`, `TransitionSubtype`, `TransitionDirection`, `TransitionFadeColor`), `presentation:transition-speed` (`slow`, `medium`, `fast`; `Speed`), `presentation:transition-type` for the advance mode `manual`, `automatic` or `semi-automatic` (`Change`), `presentation:duration` for the page's display time (`HighResDuration`), `presentation:transition-style` for the legacy effect list (`Effect`) (L7). | Report 05 section 10 leg 2 reads `presentation:transition-type` as the effect and `smil:dur or presentation:transition-speed` as the duration; the map says the effect is `smil:type` with `smil:subtype`, the advance mode is `presentation:transition-type`, and the speed is `presentation:transition-speed`. The property map excerpt lists no `TransitionDuration` entry, so a fractional duration in seconds is unverified as an ODF attribute (section 5); the writer quantizes Google's duration to the three speeds and records the quantization in `residual`. |
| Object animations (report 05) | `anim:par presentation:node-type="timing-root"` (15.4.2) > `anim:seq presentation:node-type="main-sequence"` (15.4.3) > `anim:par smil:begin="next"` per click > `anim:par smil:begin="0s"` per with group > `anim:par presentation:node-type` (`on-click`, `after-previous`, `with-previous`) `presentation:preset-class` (`entrance`, `exit`, `emphasis`) `presentation:preset-id` `presentation:preset-sub-type` > `anim:set` and `anim:animate` with `smil:targetElement` (the shape's `xml:id`), `smil:attributeName`, `smil:to`, `smil:dur`, `smil:fill`; paragraph builds through `anim:sub-item="text"` and `presentation:group-id` | The preset ids are LibreOffice's (`ooo-entrance-appear`, `ooo-entrance-fly-in`, `ooo-entrance-zoom`, `ooo-exit-disappear`, `ooo-exit-fly-out`, `ooo-emphasis-spin` and the fade pair), to be pinned from the container round trip of report 05 leg 2, which reads exactly these strings out of LibreOffice's own `content.xml`. | The exact id strings are unverified until that probe runs (section 5). |
| Media (report 05) | `draw:frame` > `draw:plugin` (10.4.8) `xlink:href="Media/<sha>.mp4" draw:mime-type` with `draw:param draw:name draw:value` children | LibreOffice's parameter names (Loop, Mute, VolumeDB, Zoom) and its autoplay node in the timing tree are read back by report 05 leg 2. | The names are unverified here (section 5). |
| The frame, wordmark and counter | Master page shapes (`draw:line` rules and crosses, `draw:frame` > `draw:image` wordmark) and a per page counter text frame | As the PPTX masters (`pptx/masters.ts`). | None. |
| Slide background colour | `style:drawing-page-properties draw:fill="solid" draw:fill-color` | From `scene.background.color` composited on paper as `build.ts` does. | None. |
| Comments (`includeComments`) | ODF has `office:annotation`; Impress comments are an extended form | Out of this report's scope; recorded in `residual` as not carried until designed. | Lossy by omission. |

### 2.3 The Perfect analogue

The PPTX Perfect mode places the 2x page raster as a full page picture over text runs with alpha
0, so the file is pixel identical in viewers that ignore text alpha and searchable everywhere
(`pptx/build.ts` flatten branch). ODF 1.3 has no text transparency attribute in `style:text-
properties`; `draw:opacity` is a graphic property of the shape's fill and stroke. LibreOffice
carries character transparency as an extension: `xmloff/source/text/txtprmap.cxx` maps
`CharTransparence` to `loext:opacity` on text properties with `MAP_EXT` (written in ODF extended
mode) and reads `draw:opacity` import only (L8). ODF 1.3 Part 3 section 3.17 allows foreign
elements and attributes in an extended conforming document (O3), which is the conformance class
LibreOffice writes by default.

The Perfect ODP therefore writes, per page and in this order: the text frames of the invisible
layer (every run `fo:color` equal to the paper colour and `loext:opacity="0%"`; the value's
direction, opacity or transparence, is settled by the container probe that writes both readings
and reads what LibreOffice re-exports), then one `draw:frame` at the sheet box holding
`draw:image` of the page raster encoded by `page-raster.ts` (1 bit or palette PNG, truecolor PNG
or JPEG at quality 92 under the same budgets; the fixture's six flatten pages measured 12,199 to
46,517 bytes each as palette PNGs). Document order is z order in ODF, so the picture covers the
text in every reader, the paper colour hides the text in a reader that ignores the extension,
and Find, Copy and the Outline view still reach the text in LibreOffice. The report's `page`
entry (format, bytes, colors, mismatch, fraction) and the `perfect` flag carry over unchanged,
since the bytes are the same measurement. If Kevin prefers a strict ODF 1.3 document, the
`loext:opacity` attribute is dropped and the paper coloured text under the picture remains, which
is the PowerPoint route without its alpha (decision 3).

### 2.4 The three build paths

| Path | What it is | Cost | Fidelity | Hosted | Verdict |
| --- | --- | --- | --- | --- | --- |
| a. A Turboslide ODF writer | `packages/export/src/odp/`: `package.ts` (mimetype first, manifest), `styles.ts` (page layout, masters, font declarations, an automatic style allocator that deduplicates by content), `text.ts` (paragraph and text styles from `SceneStyle`, lists, links, the baseline shift and advance excess reused from `pptx/`), `shapes.ts` (rect, ellipse, custom shape, line, connector, path, markers, dashes, shadows), `table.ts`, `chart.ts` (the embedded object), `notes.ts`, `media.ts` and `motion.ts` (from `compileMotion`, report 05), `build.ts` and `export-odp.ts` beside `export-pptx.ts`, sharing `extractScenes`, `materializeForExport`, the page raster policy, the report builder and the batch plan. | About 2,500 to 3,500 lines with tests, comparable to `pptx/` (build.ts 35 KB, text.ts 20 KB, lines.ts 12 KB, table.ts 9 KB, chart.ts 5 KB). Runtime per export: the scene extraction (2.5 s per slide in the dialog's estimate) plus milliseconds of XML. | The ODP is LibreOffice's native format, so the fixed pitch and baseline model measured on LibreOffice apply without the OOXML import in between; expected at or better than the Editable text PPTX under the same budgets. | Yes: no binary beyond jszip; the batch and merge path applies (the merge concatenates `draw:page` elements, renumbers `Object <n>` and unions `Pictures/`). | The writer to build. |
| b. LibreOffice converts the Editable text PPTX to ODP | `soffice --headless --convert-to odp --outdir <dir> <file>.pptx` (the `impress8` filter, L1) in `verify/libreoffice.ts`, about 50 lines; Perfect through the flatten PPTX. | Negligible code. | Whatever LibreOffice's OOXML import makes of the PPTX: presets become `ooxml-<prst>` custom shapes with full paths (L3), tables and charts import, alpha 0 text becomes `loext:opacity`; every residual of the PPTX import applies twice. | No: LibreOffice is absent from the function (report 07 11.2, the 250 MB function cap), so a hosted download needs the long lived worker host on Kevin's list or a checkout with soffice (`TURBOSLIDE_SOFFICE`). | A container oracle: its `content.xml` is diffed against path a's for the attribute names of transitions, animations, media and presets, which is also report 05 leg 2. |
| c. Path a with the LibreOffice round trip as verification | The existing `--verify` loop: `renderPptxPages` takes the ODP (soffice converts any Impress input to PDF), pdftocairo rasterizes at 1600 by 900 (native) or 3200 by 1800 (Perfect), pixelmatch at threshold 0.1 against `render.slide --scale 1 or 2`, the per block ink offsets of `verify/geometry.ts`, the picture regions reported and never gated. Plus `soffice --convert-to pptx` of the ODP to read back `prstGeom` names (the `ooxml-` round trip). | The loop exists; the ODP branch adds the input extension, the `content.xml` read back (regex style as the post process) and the ODF specific assertions of section 2.9. | The same gate the PPTX passes: Perfect pages under 0.1 percent, native within the block budgets. | The loop runs in the render worker image or wherever `TURBOSLIDE_SOFFICE` points, as today; the hosted download itself runs in the function. | Recommended. |

### 2.5 Libraries

No Node library on the npm registry writes ODF presentations. The consolidated table in
section 5 carries versions and licences; the findings: `simple-odf` 3.0.3 (MIT, one dependency
@xmldom/xmldom ^0.8.3, 382,313 bytes unpacked) targets text documents, keywords `odt` and
`office`, no presentation API (N1); `webodf` 0.5.10 (AGPL-3.0) is a "Javascript OpenDocument Text
editor" for the browser and its licence alone rules it out (N2); the `odf` package 2.3.4 is a git
helper unrelated to the format (N3); `odt.js` does not exist on the registry (404, N4); `odfpy`
1.4.1 on PyPI (Apache, GPL and LGPL, last upload January 2020) manipulates ODF files in Python
and could generate fixtures in the fonts venv the way python-pptx does, never at runtime (P1);
`libreoffice-convert` 1.8.2 (MIT, 21,726 bytes) is a wrapper that needs an installed soffice (N5),
which `verify/libreoffice.ts` already is. The writer is therefore hand written XML over jszip
3.10.2 (MIT), the way `pptx/` and `ooxml/` are, with @xmldom/xmldom 0.9.12 (MIT, no dependencies,
440,251 bytes) for the namespace aware read back in tests and `export check`, as report 04
section 8 recommends for the PPTX reader.

### 2.6 The validity check

The ODF Toolkit's odfvalidator is a Java tool that "validates OpenDocument files and checks them
for certain conformance criteria", run as `java -jar odfvalidator-<VERSION>-jar-with-
dependencies.jar <odffile>`, supporting ODF 1.0 to 1.3 with automatic version detection (V1); the
toolkit's latest GitHub release is v0.13.0 of 2026-01-23 (V2). The render worker image has no
Java, and adding a headless JRE grows the image; a strict validation also flags the `loext:`
attributes of section 2.3 unless run in extended mode. The practical check is LibreOffice: the
headless open and convert of path c fails loudly on a package LibreOffice cannot read, and the
PDF's page count equals the page count of `content.xml`. The design keeps odfvalidator optional
behind `TURBOSLIDE_ODFVALIDATOR` (the jar path); when set, `export check` runs it and records its
output in `issues` (decision 5). The check that always runs is `export check`'s own zip walk
(section 2.9).

### 2.7 The Download dialog

`packages/chrome/src/dialogs/Download.tsx` takes `format: 'pptx' | 'pdf'`; it gains `'odp'`. For
ODP the dialog is the PowerPoint dialog with its sentences changed: the Seg Perfect | Editable
text ("Every slide looks exactly like the screen in LibreOffice Impress" and "Text boxes you can
edit in LibreOffice Impress"), Include speaker notes (off), Include skipped slides (off), More
options (Light, Dark or Both defaulting to the deck's appearance, fonts Exact or Standard, Embed
fonts for Editable text, Headings as pictures), the same 2.5 s per slide estimate, "Your file is
ready" with the Details link to the report card. The strings land in `menus/strings.ts`
`DIALOGS.download`. The menu row becomes `now('file.download.odp', 'ODP Document (.odp)',
dialog('Download'), { doc: 'Opens in LibreOffice Impress; Perfect by default, or Editable text' })`
with the dialog control `dialog.download.odp`, and `DOWNLOAD_FORMATS` loses the ODP clause.

### 2.8 The actions

| Action | Change | CLI, MCP, window |
| --- | --- | --- |
| `export.run` | `format: z.enum(['pptx', 'pdf', 'odp'])`; every existing field applies to ODP: `mode`, `theme` (one file per theme, `<deckId>-light.odp`, `<deckId>-dark.odp`, `<deckId>-both.zip`), `fonts`, `embedFonts` (the export TTFs under `Fonts/` with `svg:font-face-src` > `svg:font-face-uri` in `office:font-face-decls`, LibreOffice's embedding form; off by default as for PPTX), `headings`, `rasterScale`, `pictureScale`, `excludeShareAlike`, `baseline` (`libreoffice` is the ODP's own renderer), `verify`, `slideIds`, `includeSkipped`, `includeNotes`, `includeComments` (recorded as not carried), `out`, `batch`, `merge`. `EXPORT_OPTIONS` `format` gains `{ value: 'odp', label: 'ODP Document (.odp)', doc: 'One file per theme for LibreOffice Impress, verified through the same loop as PowerPoint.' }`. | `turboslide export odp --mode flatten --theme light,dark --fonts exact --verify --out <dir>` (the CLI's `EXPORT_FORMATS` gains `odp`); MCP `deck_export` with `format: 'odp'`; the window handler `export.run` and the hosted `POST /api/export/:deckId` take the same field; the render worker's export job passes it through (`jobs/export.ts` flags are `export.run`'s fields). |
| `ExportReport` | `format: 'pptx' | 'pdf' | 'odp'`; `files[]` the ODP paths; `slides[].page` in Perfect; new `residual` lines: `odp: mimetype first, stored, no extra field`, `odp: <n> presets as ooxml-<prst> custom shapes, <m> as rect, ellipse or line`, `odp: text opacity through loext:opacity (ODF extended)` in Perfect, `odp: soffice <version>` when verified, the dash and link substitutions. | The report card reads the same fields. |
| `export.check` | Accepts `.odp`: mimetype first, stored and without an extra field; the manifest against the entry list both ways; `content.xml` and `styles.xml` parse namespace aware (@xmldom/xmldom); the page count, the page size 33.867 by 19.05 cm (or the deck's size after report 08); every frame inside the page as `geometry.ts` asserts EMU bounds; `Pictures/` classed by bytes as today; `Object <n>` count; hidden pages; the round five motion line; odfvalidator when `TURBOSLIDE_ODFVALIDATOR` is set. `ExportCheck` gains `container: 'ooxml' | 'odf'` and an `odf` record (`mimetypeFirst`, `mimetypeStored`, `manifest: { entries, missing, extra }`, `pages`, `hiddenPages`, `customShapes: { ooxml, native }`, `objects`, `media`). | `turboslide export check <file.odp>`. |
| `export.verify` (the loop) | `renderPptxPages` gains the `.odp` input and the ODF read back leg: per `draw:page` the transition attributes of section 2.2, the `anim:par` count with `presentation:preset-id`, the `draw:plugin` count, the `draw:custom-shape` types. | `turboslide export odp --verify`; `export check <file> --libreoffice` of report 05. |

### 2.9 Tests, the check step and the budgets

- `odp/package.test.ts`: the local header reader asserts `mimetype` at offset 0, method 0, extra
  length 0; every file has one manifest entry and every entry a file; the root entry's media type
  equals the mimetype content.
- `odp/build.test.ts` over the fixture scenes (`gslides-fixture.test.ts` already builds the
  seven round one and twenty round two slides): one `draw:page` per unskipped slide, the page
  layout size, the frame lines and wordmark on the master, per block the element of section 2.2
  (a `draw:custom-shape` with `draw:type="ooxml-<prst>"` and an `draw:enhanced-path` per preset, a
  `draw:connector` with `draw:start-shape` and `draw:end-shape`, `table:number-columns-spanned`
  and covered cells, one `draw:object` per chart with its `Object <n>/content.xml` and manifest
  entries, `presentation:notes` text, a hidden page style under `includeSkipped`), the Perfect
  order (text frames before the covering `draw:image`, `loext:opacity` on every run), a namespace
  aware parse with no duplicate automatic style names, and the residual lines.
- `export-pptx.test.ts`'s sibling `export-odp.test.ts` runs both modes in both themes over four
  deck slides with Chrome for Testing, asserting the report's `perfect` flag, the page formats,
  the file list and the check's `valid`.
- The container step: `pnpm check` step 25 (the optional Docker verification of SPEC-2 11.3)
  gains `turboslide export odp --mode flatten --verify` and `--mode native --verify`, asserting
  Perfect pages under 0.1 percent (the page raster is the PPTX's bytes, so the mismatch should
  equal the PPTX's) and native within the block budgets, plus the path b oracle diff of section
  2.4. The export fixture step (step 22, "the export fixture in both modes") gains `--format odp`.
  `pnpm check` stays at its round four count plus none: the ODP assertions join existing steps.
- Budgets: the same per slide constant (`SECONDS_PER_SLIDE` 2.6 in `batch/plan.ts`, 60 slides per
  batch, 240 s per batch, 780 s synchronous); file sizes equal the PPTX's within the XML
  difference (the fixture's flatten PPTX is 229,117 bytes for six pages, its native PPTX 40,983
  bytes); a response over 4,718,592 bytes is the stored copy behind a 302 as today.

## Part 3, SVG of the current slide

### 3.1 The three paths

| Path | What the file holds | Where it renders | Where it runs | Verdict |
| --- | --- | --- | --- | --- |
| a. A `<foreignObject>` wrapping the sheet HTML | The rendered slide markup with `sheet.css`, `stage.css`, `BLOCK_CSS` and the inlined fonts (the standalone's pieces) inside one `foreignObject` at the sheet box. | Browsers only: `foreignObject` is Baseline in browsers (M2); Illustrator, Inkscape and Figma are unverified here and the round one objection assumed they drop it. A `<canvas>` dither and the `data-live` materials need the runtime, which an SVG as an image cannot run (M1). | In the function without a browser. | Rejected for the download; useful as nothing. |
| b. A scene driven writer | Native SVG: `<text>` per line, paths for shapes and charts, symbols for icons and the mark, `<image>` data URIs for rasters, rects for rules and plates, the frame and counter (section 3.3). | Everywhere, with the font mode deciding the text (section 3.4). | In the function: `extractScenes` for the one slide (a 1x page for geometry, a 2x page and a 3x page for the rasters) plus the writer. | Recommended. |
| c. Chromium `page.pdf` of one slide then `pdftocairo -svg` | Cairo's SVG surface writes every glyph as an outline `<path>` inside `<g id="glyph-N-M">` in `<defs>` and references it with `<use>` (`_cairo_svg_document_emit_outline_glyph_data`, `_cairo_svg_document_emit_glyph`, C1), or as a bitmap mask for bitmap glyphs; the file has no `<text>` and no fonts, and its rasters are re-encoded PNG data URIs. | Everywhere; nothing searchable. | Only where poppler is installed: the render worker container; `pdftocairo -svg` exists (D1) but the function has no poppler (report 07 11.2). | A container oracle for outline mode: both files rasterized by Chromium and diffed, the way the LibreOffice leg checks the ODP. |

### 3.2 What the scene carries per line

`scene/measure.ts` walks every text carrier character by character with `Range.getClientRects()`,
groups characters into lines by their vertical centre and merges same style neighbours into runs.
For the writer these are the facts:

- `SceneRun.box` is the union of the run's per character client rects in sheet px: the inline
  content box, whose top is the font's ascent line and whose height is the font's ascent plus
  descent at the run's size (1.20996 em for Inter). Its left is the first glyph's origin (plus
  any side bearing the browser positions), its width the browser's advance sum with letter
  spacing and kerning applied.
- `SceneLine.box` is `[inline.left, inline.top − (lh − inline.height) / 2, inline.width, lh]`
  where `inline` is the union of the line's text run rects and `lh` the largest `lineHeight`
  among the runs (`toText` in measure.ts): the half leading is split evenly, which is Chromium's
  own rule and the reason `baseline.ts` exists for LibreOffice.
- `SceneStyle` carries `family`, `mono`, `weight`, `size`, `letterSpacing`, `lineHeight`, `color`,
  `strike`, `link`, `features` (the computed `font-feature-settings`, `cv11` and `ss01` on display
  text), `align`, `italic`, `underline`, `baseline` (`super` or `sub`), `highlight`.
- A superscript or subscript run keeps the carrier's line height (measure.ts `styleOf`) and its
  own rect at its own size; a GT mark run (`gt: true`) has the mark's box and `gtLetters`; a gap
  after a non text inline (the external link glyph) is `gapAfter` with `spaceWidth`.
- The baseline itself is not stored. Two ways to get it: derive `y = run.box[1] + ascent × size`
  with Inter's ascent 0.96875 em (the export faces' `hhea` and `OS/2` metrics, section 1) and the
  mono face's own ascent for the code panel; or measure it, which is what the design does:
  `measureCarrier` inserts a zero width `inline-block` probe with `vertical-align: baseline` at
  the start of each line's first run, reads its bottom, removes it, and writes
  `SceneLine.baseline` (sheet px from the sheet top). The measured field is authoritative and
  the formula is the test's cross check, because Chromium rounds ascent and descent to whole
  device pixels when it builds the inline box (unverified, section 5) and the probe sees the
  rounded value.

The writer places each run at `x = run.box[0]`, `y = line.baseline`, with `textLength =
run.box[2]` and `lengthAdjust="spacingAndGlyphs"`, so a reader whose font differs (link mode, a
substituted face) still lands the run's end where the sheet did and no line rewraps: every line
is its own element. `letter-spacing` is written from the style so an exact font renders without
adjustment.

### 3.3 The SVG element table

The root is `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 <w> <h>" width="<w>"
height="<h>" role="img" aria-labelledby="t d">` with `<title id="t">` (the slide title of
`slideTitle`) and `<desc id="d">` ("Slide n of total, <theme> theme, exported from Turboslide"),
`w` and `h` from `scene.sheet` (report 08's variable size). Colours are written as six digit hex
with `fill-opacity` or `stroke-opacity` from `parseCssColor` so an `rgba()` never reaches a
reader that lacks CSS Color 3. Order follows the sheet's stacking: paper, background, plates and
chips, rules, blocks in document order, the frame, the wordmark, the counter.

| Block or scene entry | SVG form | Portability note |
| --- | --- | --- |
| Paper and slide background | `<rect width height fill="paper">`; a background colour as a second rect; a covering picture (`background.pictureRasterId`) as `<image>` at the sheet with the variant file's bytes when `pictureVariantFile` exists. | Universal. |
| Plates, chips, rules, table rules, the frame's rules and crosses | `<rect>` per box (a 1 px rule is a 1 px rect; a cross is two 1 px rects at the 5 px offsets of `sheet.css`) with hex fill and `fill-opacity` for the hair colours. | Universal; rects avoid stroke alignment questions across renderers. |
| Text (every `SceneText` and the counter) | `<text>` per line with `xml:space="preserve"`, one `<tspan>` per run carrying `x`, `y` (the baseline), `textLength`, `lengthAdjust="spacingAndGlyphs"`, `font-family`, `font-size`, `font-weight`, `font-style`, `letter-spacing`, `fill`; `text-decoration="underline"` and `"line-through"` for the marks (the sheet's hairline link underline drawn as a 1 px `<rect>` under the run in the hair colour instead); a `<rect>` in the highlight colour behind a highlighted run; a superscript or subscript run at its own size and baseline; `font-feature-settings` as a `style` attribute for `cv11` and `ss01`; `<a href>` around a run with a URL link; a slide link dropped and recorded (a single slide file has no target). In outline mode every `<tspan>` becomes a `<path>` and the line's string moves to `aria-label` on a `<g role="text">`. | `textLength` is SVG 1.1 and honoured by browsers; `text-decoration` on `<tspan>` is SVG 1.1; `<a>` in SVG is SVG 1.1 with `xlink:href` (write both `href` and `xlink:href`); `font-feature-settings` needs CSS Fonts 3 support and is unverified outside browsers. |
| List glyphs and numerals | A numbered item's numeral is its own `data-num` carrier and travels as text; a bullet glyph is written as a `<text>` at the paragraph's first baseline, `BULLET_INDENT_PX` (36) left of the text box. | The glyph's exact x is the renderer's constant; the fidelity gate catches drift. |
| GT mark runs (`gt: true`) | The mark's raster or the `gt-mark` symbol at the run box (vector, from the sprite), with the hidden letters as a `<title>` on it. | Universal. |
| Shape blocks (`SceneRect` with `shape` or `preset`; the renderer's inline svg) | The renderer's own body, translated: `<g transform="translate(x y)">` holding the `<rect>`, `<ellipse>` or `<path d="${shapePath(...)}">` at the block size, stroke inset by half the width as `renderShape` does, `stroke-dasharray` from `dashArray`, fill and stroke resolved from the appearance's tokens (`colorCss` writes `var(--ink)`; the writer resolves through `packages/theme/src/tokens.ts` for the scene's theme or reads the computed colours the scene already stores on `SceneRect.fill` and `line`). A rotated or flipped object: `transform="translate(cx cy) rotate(θ) scale(sx sy) translate(-cx -cy)"`. A shadow: `<filter>` with `feGaussianBlur`, `feOffset`, `feFlood`, `feComposite`, `feMerge` (the SVG 1.1 form; `feDropShadow` is SVG 2). Word art outline: `stroke` and `stroke-width` on the text with `paint-order="stroke fill"`. | Presets draw the box until the interpreter lands (section 1), as the sheet does. `paint-order` is SVG 2, supported by browsers and Inkscape; unverified for Illustrator. |
| Lines and connectors (`SceneSegment`) | The renderer's `<line>`, `<path>` and the decoration `<path>` elements of `lineEndPath`, translated to the block box; the `heads` polygons of the legacy arrow kinds. | Universal. |
| Charts | The renderer's inline chart svg (`chart.ts`) translated: axes, bars, lines, slices, labels and legend as paths, rects and text, the title carrying its `data-run` text. | Universal; the chart's text follows the font mode. |
| Declared diagrams (`dia`) | The renderer's svg body translated; `<use href="#i-<name>">` and `<use href="#gt-mark">` resolve against a `<defs>` block into which the writer copies the referenced `<symbol>` entries of `SPRITE` (viewBox and body). A raw `svg` string block is copied after the sanitiser strips `<script>`, `on*` attributes and any `href` that is not a fragment or a data URI. | `<symbol>` and `<use>` are SVG 1.1. |
| Icons (`icon` blocks, the `iconSvg` of rows and refs) | `<use>` of the sprite symbol inside `<defs>`, filled with the resolved colour, at the icon's box. | Vector where the PPTX ships a 3x PNG (SPEC 8.6); the fidelity gate sees antialiasing differences only. |
| Pictures (`ScenePicture`, picture blocks, `shot`, `pair`, `tiles`, `details`, `board`, `logoPlates`, `material` frames) | `<image x y width height preserveAspectRatio="xMidYMid slice" href="data:image/png;base64,...">` (or `image/jpeg`) from the twin file or the 2x raster; `<title>` with the alt text; a `<clipPath>` for a masked picture (the mask preset's path) and for `cover` crops. | Universal; data URIs are the rule browsers allow in image contexts (M1). |
| Dithers (`<canvas>` on the sheet) and `html` escape blocks | The extractor's 2x alpha PNG as `<image>`; the 1 bit dither pages are small (the fixture's 1 bit twin is 9,521 bytes, the mood slide's 16,687). | Rasters by construction, as in every export. |
| Tables (`SceneTable`) | Rules as `<rect>` (row rules, header rule, per cell borders), column and cell fills as `<rect>`, cell text as text lines. | Universal. |
| The wordmark and counter | The `gt-mark` symbol at `scene.wordmark` in the titanium colour; the counter as a text line. | Universal. |
| Frame | Four rules and four crosses as rects (above). | Universal. |
| Metadata | `<title>`, `<desc>`, `role="img"`, `aria-labelledby`; a `<metadata>` block with the deck id, slide id, revision, theme and generator. No `<script>`, no external `href`, no `<style>` except the `@font-face` of embed mode. | Universal. |

### 3.4 Fonts: the three text modes

| Mode | What is written | Size | Exact in | Notes |
| --- | --- | --- | --- | --- |
| `embed` | One `<style>` with `@font-face { font-family: 'Inter'; font-weight: 100 900; src: url(data:font/woff2;base64,...) format('woff2') }` for InterVariable and a second face for the italic when any run is italic (`inlineFontCss` of `theme-node.ts` already does this for the standalone). Runs name `Inter` with the fallback stack `'Helvetica Neue', Arial, sans-serif`. | Plus 469,656 characters of base64 upright (352,240 bytes), plus 507,872 italic (380,904 bytes). | Browsers: the same variable font Chromium rendered the sheet with, at the same size and weight, so the fidelity gate can hold the PDF gate's values. | The text stays searchable and selectable. Whether Illustrator, Figma or Inkscape read the face is unverified (Part 1). |
| `outline` | Every run as `<path d>`: fontkit opens the woff2, `font.getVariation({ wght, opsz })` instances the axes the browser used (`font-optical-sizing: auto` sets `opsz` to the CSS px size, clamped to Inter's 14 to 32; the exact Chromium mapping is unverified), `font.layout(text, features)` shapes the run with Inter's kerning and the `cv11` and `ss01` features of the style, each `glyph.path.toSVG()` is scaled by `size / unitsPerEm`, translated by the advances and joined; the run is then scaled horizontally to `run.box[2]` over its laid out width (the `textLength` idea applied to paths). The string moves to `aria-label`. | About 250 to 700 bytes of path data per glyph (estimate, not measured: fontkit is not installed); the 804 character `cli` slide would be roughly 300 to 500 KB uncompressed, 60 to 100 KB gzipped. | Illustrator, Inkscape, Figma and browsers: no font needed. | Text is not searchable and not editable as text. Outline mode is the file Google's Illustrator and Figma users expect (unverified what Google does). |
| `link` | `font-family` names only, no `<style>`. | The smallest: 1 to 26 KB on the measured text slides. | Exact where Inter is installed; elsewhere the fallback face is stretched to each run's width by `textLength`, so lines never rewrap and line ends hold. | The right mode for agents that post process the SVG and for previews. |

Library facts (R1, R2): fontkit 2.0.4 (MIT, 5,610,637 bytes unpacked, nine dependencies including
`brotli` for WOFF2, `restructure`, `unicode-properties`) reads TTF, OTF, WOFF, WOFF2, TTC and
DFont, exposes `font.variationAxes`, `font.namedVariations` and `font.getVariation(variation)`,
`font.layout(string, features)` returning glyphs with positions, and `glyph.path.toSVG()`.
opentype.js 2.0.0 (MIT, 3,642,174 bytes, no dependencies) parses TTF, OTF and WOFF, refuses WOFF2
("would result in a much heavier (>10×!) opentype.js library", pointing at wawoff2), and has
variation support through `Font.variation.set`, `Path.toSVG` and `Path.toPathData`. Turboslide's
variable font is shipped as WOFF2 only and the sheet renders it at arbitrary optical sizes, so
fontkit is the fit; opentype.js would have to read the static export TTFs, which travel in the
nearest cut face (the 0.82 to 1.7 percent advance excess `face-advance.ts` measured at 27 and 30
px). Both libraries go through `pnpm audit --prod --audit-level=high` (check step 28) before
entering the catalog.

### 3.5 Measured sizes

A probe in the scratchpad wrote scene driven SVGs (paper, frame, plates, rules, rasters as data
URIs, a `<text>` per run with `textLength`, no fonts) from the checked out scene JSON of the m2
export (`.turboslide/m2/scenes/scene-light.json`, eight brand deck slides, light theme) and the
round one fixture (`.turboslide/b2-fixture/native/scene-light.json`, six slides). The numbers:

| Slide | Runs | Characters | Rasters (bytes) | Picture bytes | SVG bytes | gzip | With the upright woff2 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| opener-brand | 5 | 140 | 1 (693) | 9,521 | 15,721 | 9,798 | 485,470 |
| title | 4 | 173 | 1 (2,854) | 0 | 5,437 | 3,614 | 475,186 |
| thesis | 2 | 38 | 0 | 0 | 1,028 | 449 | 470,777 |
| why | 13 | 460 | 3 (1,946) | 0 | 6,672 | 2,951 | 476,421 |
| mood-earth | 6 | 185 | 0 | 16,687 | 24,483 | 15,288 | 494,232 |
| surfaces | 41 | 627 | 24 icons at 3x (10,229) | 0 | 25,853 | 6,710 | 495,602 |
| cli | 27 | 804 | 5 (2,800) | 0 | 11,260 | 4,195 | 481,009 |
| closing | 5 | 142 | 1 (2,460) | 252,475 | 342,042 | 34,732 | 811,791 |
| fixture table | 18 | 107 | 0 | 0 | 4,440 | 747 | 474,189 |

The text and vector content of a slide is 1 to 26 KB; a photograph slide is its twin's size plus
a third (base64); the embedded font is 470 KB upright and dominates every text slide. The
deck's largest twin is 775,759 bytes (`mood-dictionary-light.jpg`), so the worst embed mode file
is about 2 MB, under the 4,718,592 byte response cap; icons as sprite symbols instead of 3x PNGs
would shrink the `surfaces` slide further.

### 3.6 Recommendation and gates

Path b, with c as a container oracle for outline mode. Default text mode `embed` for the Download
row, with `outline` a click away (decision 2): embed keeps the text searchable and renders
exactly in every browser, which is where an SVG download is opened first; outline is what a
designer wants in Illustrator or Figma; link is the agent's mode.

The fidelity gate: the writer's SVG is opened in headless Chromium through `openSheetPage` at
scale 2 (a `file:` URL of the SVG document itself, or the SVG inside an `<img>` at the sheet size,
which also proves the image context restrictions hold), screenshotted at 3200 by 1800 and diffed
with pixelmatch at threshold 0.1 against `render.slide --scale 2` of the same slide and theme,
with picture regions (twins, dithers, materials, shots, charts) reported and never gated as
`pdf/build.ts` does. Budgets: embed mode at `PDF_GATE`'s values (at or under 0.1 percent is the
target, 0.1 to 0.5 percent ships with the slide named in the record, over 0.5 percent fails);
outline mode is measured on the fixture first and gated from the measurement, since paths lose
font hinting and subpixel positioning; link mode is not gated (its glyphs are another face) but
its line boxes are, through the same per block dx, dy, dw read back of `verify/geometry.ts`
applied to the SVG's `<text>` attributes. The validity check: a namespace aware parse
(@xmldom/xmldom) asserting the root is `{http://www.w3.org/2000/svg}svg` with a `viewBox`, no
`script` element, no `on*` attribute, every `href` a fragment or a `data:` URI, every `use`
target present in `defs`, one `title` and one `desc`, and, in embed mode, a `style` element whose
only rule is the `@font-face`.

### 3.7 The actions

| Action | Change | CLI, MCP, window |
| --- | --- | --- |
| `render.slide` | `format: z.enum(['png', 'jpg', 'svg'])`; new `text: z.enum(['embed', 'outline', 'link']).optional()` (svg only, default embed); `scale` ignored for svg (the record reports `scale: 1`); `themes` as today (one file per theme). Output: `records[].image` is the `.svg` path and `images` lists them; the record gains `svg?: { text, bytes, fonts: string[], gate?: { fraction, worst } }`. Implementation: for `svg` the render job runs `extractScenes` for the one slide (a 1x geometry page, a 2x raster page, a 3x page when icons or marks are rasters) and `svg/write.ts` instead of `page.screenshot`; `materializeForExport` supplies dither variants as for the exports. | `turboslide render <slideId> --format svg --text outline --theme light --out <dir>` (the CLI's `--format` check gains `svg`); `turboslide export svg <slideId>` mirrors `export jpeg`; MCP `deck_render` with `format: 'svg'` and `text`, and the MCP image reader (`server/actions.ts`, the facade URL reader) accepts `image/svg+xml`; window: the editor's and the viewer's `render.slide` handlers forward `format` and `text` to the worker; hosted `GET /api/render/:slideId?format=svg&text=embed` answers `image/svg+xml` with the record in `X-Turboslide-Record`, the `?w=` thumbnails stay PNG. |
| `render.sheet` | No svg form: a contact sheet of many slides would embed the font once per file and is a raster surface by purpose; `render.slide` on `slideIds: 'all'` writes one SVG per slide. | Unchanged. |
| The Download row | `now('file.download.svg', 'Scalable Vector Graphics (.svg, current slide)', action('render.slide', { format: 'svg' }))`, following the JPEG and PNG rows, downloading the current slide in the current appearance with the default text mode; the studio's download path for `render.slide` results carries the `.svg` name and `image/svg+xml`. The text mode preference lives in the Preferences dialog round five adds (scope E) as "SVG text: keep as text (fonts embedded) / convert to outlines / font names only". | `DOWNLOAD_FORMATS` loses the SVG clause. |
| `export.check` | Accepts `.svg` for the validity check of section 3.6 and prints the byte size, the text mode read from `<metadata>`, the font count and the element counts. | `turboslide export check <file.svg>`. |

### 3.8 Tests

- `scene/measure.test.ts` (or `extract.test.ts`): `SceneLine.baseline` exists for every line and
  equals `run.box[1] + 0.96875 × size` within 1 px for Inter runs.
- `svg/write.test.ts` over the fixture scenes: the root namespace and `viewBox` from `scene.sheet`;
  one `<text>` per line and one `<tspan>` per non gt run with `textLength` equal to the run box
  width; the marks (italic, underline, strike, super, sub, highlight rect, link anchor); a symbol
  in `defs` for every `use`; the frame's eight rects and four crosses; embed mode's single
  `@font-face` per used face and the italic face only when an italic run exists; outline mode's
  absence of `<text>` with an `aria-label` per line; link mode's absence of `<style>`; no script,
  no external href; byte size under 4 MB for every fixture slide.
- The end to end test beside `export-pptx.test.ts`: `render.slide --format svg` in all three
  modes on four deck slides in both themes with Chrome for Testing, the fidelity gate of section
  3.6 with embed under the PDF gate's ship line and the measured outline budget, the validity
  check, and `export check` on the files.
- The container step: the pdftocairo oracle (`page.pdf` of the slide, `pdftocairo -svg`, both
  files rasterized by Chromium and diffed) recorded, never gated.

## 4 The consolidated library table

| Name | Version | Licence | Verdict |
| --- | --- | --- | --- |
| jszip | 3.10.2 (catalog) | MIT | The ODP package writer, through a new `writeOdfPackage` that writes `mimetype` first and stored. |
| @xmldom/xmldom | 0.9.12 (N6) | MIT, no dependencies, 440,251 bytes | Namespace aware read back for tests, `export check` of `.odp` and `.svg` (report 04 section 8's pick). Pin in the catalog. |
| simple-odf | 3.0.3 (N1) | MIT | Text documents only; not fit for presentations. |
| webodf | 0.5.10 (N2) | AGPL-3.0 | A browser text editor; the licence rules it out. |
| odf | 2.3.4 (N3) | MIT | A git helper unrelated to ODF; not fit. |
| odt.js | none (N4) | | Not on the registry. |
| libreoffice-convert | 1.8.2 (N5) | MIT | A soffice wrapper; `verify/libreoffice.ts` already does this. Not needed. |
| odfpy (Python) | 1.4.1 (P1) | Apache, GPL, LGPL | A fixture and oracle option in the fonts venv, never a runtime dependency. |
| ODF Toolkit odfvalidator (Java) | odftoolkit 0.13.0, 2026-01-23 (V2) | Apache-2.0 (the site's licence, V1) | Optional behind `TURBOSLIDE_ODFVALIDATOR`; needs a JRE the image lacks. LibreOffice's headless open is the practical check. |
| LibreOffice | 25.2.3.2 in the image (docs/export-verification.md) | MPL-2.0 | The ODP verifier (path c) and the path b oracle; `impress8` writes ODP, `impress_pdf_Export` PDF (L1). |
| poppler pdftocairo | 25.03.0 in the image | GPL | The PDF rasterizer of the loop; `-svg` gives the outline oracle (D1, C1). |
| fontkit | 2.0.4 (R1) | MIT, 5,610,637 bytes, nine dependencies | Outline mode: WOFF2, variable instancing, shaping, `path.toSVG()`. Recommended; audit before adding. |
| opentype.js | 2.0.0 (R2) | MIT, 3,642,174 bytes, no dependencies | Variation support but no WOFF2; would need the static TTFs. Not chosen. |
| pixelmatch | 7.2.0 (catalog) | ISC | The SVG fidelity gate, as for PDF. |
| playwright-core | 1.62.1 (catalog) | Apache-2.0 | The Chromium that measures the scene and renders the SVG for the gate. |

## 5 Decisions for Kevin

1. ODP ships from the Turboslide writer inside the function (path c), verified in the container;
   path b (LibreOffice converting the PPTX) needs the worker host on your list and stays an
   oracle. Confirm, or ask for path b only, which makes ODP a container and checkout feature
   until the host exists.
2. The default text mode of the SVG download row: `embed` (searchable, exact in browsers, about
   470 KB of font per file), `outline` (exact in Illustrator, Inkscape and Figma, no text) or
   `link` (smallest). The report recommends `embed` with the choice in Preferences.
3. Whether the Perfect ODP writes LibreOffice's `loext:opacity` (an ODF extended document, exact
   in LibreOffice, flagged by a strict validator) or only the paper coloured text under the
   picture (strict ODF 1.3, the PowerPoint route without alpha). The report recommends both
   together, extended by default.
4. fontkit (5.6 MB unpacked, nine dependencies) enters the catalog for outline mode. The
   alternative is outline mode only where the fonts venv exists (fonttools), which the fonts build
   already uses for `wordmark-outlines.svg` (SPEC-4 line 111), at the cost of no hosted outline
   downloads.
5. A headless JRE in the render worker image for odfvalidator, or LibreOffice's open as the only
   validity check (the report's default).
6. Icons and the mark travel as vectors in the SVG (the sprite's paths) while the PPTX ships them
   as 3x PNGs (SPEC 8.6); accept the difference or write the SVG's icons as the same rasters.
7. The shape interpreter of SPEC-2 0.57 is a prerequisite for the 135 presets in both writers
   (section 1); its build belongs to round five's plan or the presets draw as boxes in the ODP
   and the SVG, as they do on the sheet at d5d7f07.

## 6 Unverified

- What Google's SVG download contains (text as text or paths, font references, data URI images,
  `viewBox` and size); no public description was read.
- What Google's ODP download keeps and loses; no dated report was read.
- Inkscape's, Illustrator's and Figma's handling of `foreignObject`, of `@font-face` in a `<style>`
  element and of data URI images (Adobe returned 403, Inkscape 403 and 404; Figma's page says only
  that an SVG becomes an editable vector layer).
- Keynote and Pages on ODP and ODT: Apple's list names Keynote, PPTX, Pages, DOCX, RTF and TXT
  and no OpenDocument format; the absence is the evidence.
- The `loext:opacity` value direction for an invisible run and its effect in Impress text on
  LibreOffice 25.2 (the mapping is in the shared text property map).
- LibreOffice's attribute for a fractional slide transition duration (the property map excerpt
  lists none).
- The `draw:param` names of `draw:plugin` media and LibreOffice's autoplay node.
- LibreOffice's animation preset ids (`ooo-entrance-appear` and the others) as exact strings.
- The ODF form of a hyperlink that jumps to a named page, and LibreOffice's standard glue point
  numbering for `draw:start-glue-point`.
- Whether `style:columns` on a text box and `loext:shadow-blur` are honoured by the 25.2 image.
- Whether jszip writes an extra field for ASCII entry names (the test asserts it does not).
- Chromium's rounding of ascent and descent in the inline box, and its `opsz` mapping under
  `font-optical-sizing: auto`.
- The outline mode file sizes (estimated; fontkit is not installed to measure).
- `paint-order` and `font-feature-settings` support outside browsers.

## 7 Sources

Repository (all at d5d7f07, read 2026-09-14): `packages/chrome/src/menus/model.ts`,
`docs/gslides-parity/SPEC.md`, `SPEC-2.md`, `SPEC-3.md`, `SPEC-4.md`, `VERIFICATION-2.md`,
`packages/export/src/export-pptx.ts`, `pptx/build.ts`, `pptx/text.ts`, `pptx/baseline.ts`,
`pptx/face-advance.ts`, `pptx/images.ts`, `pptx/shapes.ts`, `pptx/lines.ts`, `pptx/table.ts`,
`pptx/chart.ts`, `pptx/masters.ts`, `pptx/page-raster.ts`, `pptx/fonts-map.ts`, `scene/types.ts`,
`scene/measure.ts`, `scene/extract.ts`, `ooxml/zip.ts`, `pdf/build.ts`, `verify/libreoffice.ts`,
`units.ts`, `package.json`, `packages/render/src/blocks/primitives.ts`, `chart.ts`, `table.ts`,
`dia.ts`, `picture.ts`, `misc.ts`, `text-blocks.ts`, `figures.ts`, `material.ts`, `context.ts`,
`render-block.ts`, `packages/render/src/stage.ts`, `standalone.ts`, `print.ts`, `theme-node.ts`,
`packages/theme/src/gt-ink-paper/sheet.css`, `packages/theme/src/sprite.ts`,
`packages/theme/assets/sprite.svg`, `packages/schema/src/export.ts`, `actions.ts`, `render.ts`,
`shapes.ts`, `shapes/definitions.ts`, `packages/fonts/src/inter.css`, `inter.ts`, `export.ts`,
`export/fonts.json`, `export/GTInterText22-Regular.ttf`, `export/GTInterDisplay-Regular.ttf`,
`packages/headless/src/context.ts`, `packages/chrome/src/dialogs/Download.tsx`,
`apps/cli/src/commands/render.ts`, `export.ts`, `apps/studio/src/routes/api/render.$slideId.ts`,
`scripts/check.mjs`, `docker/render-worker.Dockerfile`, `docs/pptx.md`,
`docs/export-verification.md`, `pnpm-workspace.yaml`. Local measurements:
`.turboslide/m2/scenes/scene-light.json`, `.turboslide/b2-fixture/*/scene-light.json` and
`export-report-light.json` (read only). Sibling reports: research-5/02 c.1, 04 section 8, 05
sections 10 to 12, 07 sections 2, 5, 11 and 12.

External, all read 2026-09-14:

- O2 OASIS OpenDocument v1.3 Part 2, Packages.
  https://docs.oasis-open.org/office/OpenDocument/v1.3/os/part2-packages/OpenDocument-v1.3-os-part2-packages.html
- O3 OASIS OpenDocument v1.3 Part 3, OpenDocument Schema.
  https://docs.oasis-open.org/office/OpenDocument/v1.3/os/part3-schema/OpenDocument-v1.3-os-part3-schema.html
- G1 Google Drive API, Export MIME types for Google Workspace documents.
  https://developers.google.com/workspace/drive/api/guides/ref-export-formats
- G2 Google Docs Editors Help, Create, view, or download a file (no format list on the page).
  https://support.google.com/docs/answer/49114?hl=en
- A1 Apple Support, iWork and Microsoft Office file types (Keynote, Pages and Numbers import lists).
  https://support.apple.com/en-us/HT202227
- A2 Apple Support, Export to PowerPoint or another file format in Keynote for Mac.
  https://support.apple.com/guide/keynote/export-to-powerpoint-or-another-file-format-tana0d19882a/mac
- L1 LibreOffice Help, File conversion filter names.
  https://help.libreoffice.org/latest/en-US/text/shared/guide/convertfilters.html
- L3 LibreOffice core, `oox/source/drawingml/customshapepresetdata.cxx` (`PROP_Type` set to `"ooxml-" + aName`).
  https://raw.githubusercontent.com/LibreOffice/core/master/oox/source/drawingml/customshapepresetdata.cxx
- L4 LibreOffice core, `oox/source/drawingml/customshapeproperties.cxx` (`ooxml-non-primitive`).
  https://raw.githubusercontent.com/LibreOffice/core/master/oox/source/drawingml/customshapeproperties.cxx
- L5 LibreOffice core, `oox/source/export/shapes.cxx` (`WriteCustomShape`, `startsWith("ooxml")`).
  https://raw.githubusercontent.com/LibreOffice/core/master/oox/source/export/shapes.cxx
- L6 LibreOffice core, `svx/source/customshapes/EnhancedCustomShapeTypeNames.cxx` (`ooxml-rect`).
  https://raw.githubusercontent.com/LibreOffice/core/master/svx/source/customshapes/EnhancedCustomShapeTypeNames.cxx
- L7 LibreOffice core, `xmloff/source/draw/sdpropls.cxx` (the drawing page property map).
  https://raw.githubusercontent.com/LibreOffice/core/master/xmloff/source/draw/sdpropls.cxx
- L8 LibreOffice core, `xmloff/source/text/txtprmap.cxx` (`CharTransparence` to `loext:opacity`).
  https://raw.githubusercontent.com/LibreOffice/core/master/xmloff/source/text/txtprmap.cxx
- L9 LibreOffice core, `oox/source/drawingml/customshapes/` listing and README (the preset generation).
  https://api.github.com/repos/LibreOffice/core/contents/oox/source/drawingml/customshapes and
  https://raw.githubusercontent.com/LibreOffice/core/master/oox/source/drawingml/customshapes/README.md
- M1 MDN, SVG as an image.
  https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_as_an_Image
- M2 MDN, `<foreignObject>`.
  https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/foreignObject
- M3 MDN, `<image>`.
  https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/image
- F1 Figma Help Center, Import files into Figma.
  https://help.figma.com/hc/en-us/articles/360040028034-Import-files-into-Figma
- N1 npm registry, simple-odf 3.0.3. https://registry.npmjs.org/simple-odf/latest
- N2 npm registry, webodf 0.5.10. https://registry.npmjs.org/webodf/latest
- N3 npm registry, odf 2.3.4. https://registry.npmjs.org/odf/latest
- N4 npm registry, odt.js (404). https://registry.npmjs.org/odt.js/latest
- N5 npm registry, libreoffice-convert 1.8.2. https://registry.npmjs.org/libreoffice-convert/latest
- N6 npm registry, @xmldom/xmldom 0.9.12. https://registry.npmjs.org/@xmldom/xmldom/latest
- R1 fontkit 2.0.4, npm registry and README. https://registry.npmjs.org/fontkit/latest and
  https://github.com/foliojs/fontkit
- R2 opentype.js 2.0.0, npm registry and README. https://registry.npmjs.org/opentype.js/latest and
  https://github.com/opentypejs/opentype.js
- P1 PyPI, odfpy 1.4.1. https://pypi.org/pypi/odfpy/json
- V1 ODF Toolkit, ODF Validator. https://odftoolkit.org/conformance/ODFValidator.html
- V2 GitHub, tdf/odftoolkit latest release v0.13.0.
  https://api.github.com/repos/tdf/odftoolkit/releases/latest
- D1 Debian manpages, pdftocairo(1), poppler-utils in trixie.
  https://manpages.debian.org/trixie/poppler-utils/pdftocairo.1.en.html
- C1 cairo, `src/cairo-svg-surface.c` (glyphs as outline paths in `<g id="glyph-N-M">`), read from
  the ImageMagick mirror. https://raw.githubusercontent.com/ImageMagick/cairo/main/src/cairo-svg-surface.c

Pages tried and not readable on 2026-09-14: Adobe Illustrator SVG help (403 at
https://helpx.adobe.com/illustrator/using/svg.html and
https://helpx.adobe.com/illustrator/using/importing-artwork-files.html), Inkscape FAQ and wiki
(403 at https://inkscape.org/learn/faq/, 404 at https://wiki.inkscape.org/wiki/SVG_1.1_Support and
https://wiki.inkscape.org/wiki/Frequently_asked_questions), The Document Foundation wiki release
notes 7.0 (access denied), the freedesktop cairo GitLab raw file (access denied), Apple's Keynote
file formats guide page (no list on the page), Apple's Keynote and Pages compatibility pages (no
format list). Web search was unavailable in this session (its budget was exhausted before this
report ran), so every external fact came from a direct fetch of a known URL.
