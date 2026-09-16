# PowerPoint import

How a `.pptx` becomes a Turboslide deck (gslides-parity SPEC-5 sections 5 and 11; R04; the round
five build stage, builder B3). The reader lives in `packages/import/src/pptx/`; every transport runs
it: the CLI (`turboslide import <file.pptx>`), the actions `import.pptx`, `theme.import` and
`slide.import --file`, File > Open and File > Import slides in the editor, and the home page's
Upload tab through the bundle route.

## What the reader does

1. **The package.** The bytes are refused by signature before any inflation: a `.ppt` (OLE), an
   encrypted package, a file that is not a zip, a file over 200 MB. The zip inflates through the
   store's reader under a 400 MB cap (a zip bomb and zip64 are its refusals). `openPackage` refuses
   an `.odp`, a macro enabled main part (`.pptm`, `.ppsm`, `.potm`) and a package without
   `ppt/presentation.xml`; `validatePackage` runs the Open Packaging Conventions checks and the
   report carries the issues when the package is read anyway.
2. **The presentation.** `p:sldIdLst` gives the slide order (never the file numbers), `p:sldSz`
   the page, `p14:sectionLst` the sections, `p:sldMasterIdLst` the masters, `ppt/theme/themeN.xml`
   the themes, `docProps/app.xml` the producer. A hidden slide imports with `skip: true`.
3. **The page.** `sheet: 'match'` (the default) sets the deck's page to the source's size in sheet
   pixels (7,620 EMU per pixel, so 13.333 by 7.5 inches is 1600 by 900); `sheet: 'fit'` scales the
   slides onto the current page with bars. A source outside the page bounds is fitted with a row
   in the report.
4. **The theme.** `theme: 'adopt'` (the default) snaps a neutral within 12 channel units of a
   token to `ink`, `paper`, `ink-2`, `titanium`, `plate` and the four semantic hues to `green`,
   `amber`, `red`, `blue`; `theme: 'keep'` keeps every hex as written. The first theme part's
   scheme is read for Import theme (`themeRecordsOf`): eleven colours under the theme record keys
   (`ink`, `paper`, `ink-2`, `plate`, `ok`, `warn`, `no`, `info`, `titanium`, `raised`, `link`) and
   the major and minor latin faces as `display` and `text`.
5. **Every slide** becomes a canvas slide (`kind: 'content'`, `layout: { type: 'freeform' }`)
   whose `main` slot holds every object with a `pos` in sheet pixels, z in tree order. The
   inheritance chain slide, layout, master, theme resolves placeholders, fills, lines and text
   styles; master and layout shapes come onto each slide under the group `layout` unless
   `masterShapes: false`. Groups become `pos.group` paths, the outermost group first, and a group's
   child space is composed through every level.
6. **The objects.** Text bodies (paragraphs, runs, marks, lists, links, autofit, columns,
   vertical alignment, insets), shapes (135 presets, custom geometry as sampled polylines,
   connectors with their sites, fills, lines, dashes, arrowheads, shadows), pictures (crops,
   colour adjustments, duotone as a recolor preset, frames, reflections), tables (spans, per edge
   borders, header rows, column fills; a table over 20 by 20 is truncated or dropped with a row),
   charts (bar, column, line, pie; the first plot of a combination; categories and series capped
   at 12 and 6), SmartArt through its `dsp:drawing` fallback, equations (OMML to MathML), audio
   and video through the store's `mediaInfo` (a cut file lands as its poster with a row), YouTube
   by URL, OLE objects as their picture, ink as a labelled box. Transitions fold onto the incoming
   slide; entrance, exit and emphasis effects with a click, with previous or after previous
   triggers map to the eight effects; a paragraph build reads as `byParagraph`.
7. **The report** (`import-report.json` beside the manifest; `ImportReport` in
   `packages/schema/src/import-report.ts`) lists every source shape once as kept, substituted or
   dropped with a stable code and one sentence, the source fonts with their run counts, the
   source facts (file, producer, slides, page, sections, embedded fonts, modify verifier) and the
   validation. The sentence every surface speaks is `<n> objects imported, <m> shown differently,
<k> dropped`; when anything was substituted or dropped the notice "Some PowerPoint features look
   different in Turboslide" follows.
8. **The deck folder** is written into a staging folder, validated at schemaVersion 1, then renamed
   into `decks/<id>/` with `import-report.json` and `import-ids.json` (the source `p:sldId` to the
   slide id, for a stable re import). An existing id is refused unless `--replace`.

## Round trip

A file the exporter wrote (an object named `ts:<slide>#<block>` or a master named `DECK_PAPER_*`)
is read as a round trip: the object names give the slide and block ids back, the exporter's chrome
(the counter, the marks, the frame, the wordmark, the sheet) is skipped and not counted, a Perfect
file's page raster is dropped, a measured line wrap (`a:br`) joins as a space, the text box slack
and the stroke inset are removed, and a chart title or a shape's text box folds back onto its
block. `packages/import/src/pptx/roundtrip.test.ts` gates fixture 05 (the native export of a 28
slide deck) and 05b (the Perfect export): ids and titles equal, canvas boxes within 1 px in x and
width, lines by centre, and a second pass (export the import, import that) adds no report row.

## The CLI

```
turboslide import <file.pptx> [--into <deckId>] [--theme adopt|keep] [--sheet match|fit] [--snap-ladder]
                  [--no-master-shapes] [--no-hidden] [--comments] [--keep-page-raster] [--replace]
                  [--dry-run] [--document] [--decks <dir>] [--json]
turboslide theme import <file.pptx> [--index <n>] | theme import --deck-id <id>
turboslide slide import --file <file.pptx> --indexes 2,3 [--after <slideId>] [--keep-theme]
```

`--dry-run` prints the report and writes nothing; `--document` adds the deck and the slides to the
`--json` output. `theme import` appends one record under In this presentation (at most five; the
sixth is refused with "This presentation already holds five themes"). `slide import --file` reads
the numbered slides fitted onto the deck's page and copies them after the current slide with their
assets; `--keep-theme` is Google's Keep original theme and adds the file's first theme record.

The Python oracle (`scripts/pptx-oracle.py`, python-pptx inside `.turboslide/venv`) counts the
shapes of a fixture independently; `oracle.test.ts` compares its counts with the reader's and skips
without the venv.

## In the editor

- **File > Open > Upload** takes a `.pptx` beside a bundle. The route runs the reader on the
  server, answers the new deck and its report; the snackbar speaks the sentence with an Open
  action for the report card (Import report), and the editor opens the deck.
- **File > Import slides > Upload** reads the file once as a dry run, lists its slides with their
  thumbnails, All, None and Back, the checkbox Keep original theme (unchecked), and Import slides
  copies the chosen slide numbers after the current slide in one write.
- **Themes panel > Import theme** takes a `.pptx` (and its theme part number) or another
  presentation of this Turboslide, and appends the record under In this presentation.
- **Insert > Templates** and **Insert > Building blocks** open the two panes; the sidebar strip
  carries both. A template's slides copy through `slide.import --template`; a building block lands
  as one group at the content box through `buildingBlock.insert`, scaled by `min(1, contentWidth /
1326)` on a narrower page.

## Limits, recorded

- BMP and TIFF pictures land as a labelled box (Turboslide has no decoder without a dependency).
- A shape with text, a hex stroke and no fill in Editable text is dropped by the exporter, so the
  round trip test pins `links/box` as a known omission (a finding for the export lane).
- The exporter writes no `p14:sectionLst`, so a round trip of a sectioned deck lands in one section
  named after the deck.
- The worst text y delta on the round trip is 17.1 px (the baseline offset of a text box), not
  gated; a full bleed picture reads back within 40 px (the rails inset).
- The hosted upload of a `.pptx` needs the bundle route's `.pptx` branch (b3.md request B3-18),
  the lane handlers need the import bridge composed on both dispatchers (B3-7), and the studio
  needs `@turboslide/import` as a dependency (B3-22).
