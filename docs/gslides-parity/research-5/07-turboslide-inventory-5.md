# Turboslide inventory for round five: the document, the surfaces, the pipelines and the hosting facts

Report 07 of the Google Slides parity round five, written 2026-09-14 from the code at `main`
`d5d7f07` (round three and its two hotfixes). Round four (the identity, `/home`, performance) was
being built in the working tree while this report was read: at the start of the reading no tracked
file under `packages/`, `apps/`, `crates/` or `scripts/` differed from `d5d7f07`; by the end,
`scripts/check.mjs`, `packages/theme/package.json`, `packages/theme/tsconfig.json` and
`apps/studio/package.json` carried uncommitted edits. Every fact and line number below was read
with `git show d5d7f07:<path>`, so it holds for `main` and not for the working tree's round four
edits. Nothing here was run; no web source was read. The Google side is the sibling reports' work
(`01-google-motion.md`, `02-media-templates-import-page.md`, `03-later-rows-and-edit-theme.md`,
`04-pptx-import-feasibility.md`, `06-equation-editor.md`).

Round one's inventory (`research/06-turboslide-inventory.md`) listed every control, key and action
of the editor at `8c7056c`; round three's (`research-3/07-turboslide-inventory-3.md`, at `61b16e4`)
listed the routes, the tokens, the store layouts, the sharing surfaces and the picture fields. This
report covers what the round five designers need that those two did not carry or that rounds three
and four moved: the block catalog with every field, the slide and deck fields, the layouts table,
the present surface and its keys, the asset pipeline with every cap, the export packages'
structure, the importer, the theme package, the materials and effects packages, the menu model's
Later and Omit rows, the action table's groups and count, the check chain, and the hosting limits.
Section 13 maps the six round five scope areas onto the files that carry them today.

## Summary

1. The document is 35 block types on six slide kinds under one deck manifest. `BLOCK_TYPES`
   (`packages/schema/src/blocks.ts:683-719`) lists them; `CATALOG` (`catalog.ts:55-592`) gives
   each its label, group, allowed containers and export class. Every block carries `id`, `ext`,
   `pos`, `link` and `alt` (`BlockBase`, `blocks.ts:216-222`). No block, slide or deck field
   names a transition, an animation, a media file, a page size or a second theme (sections 1.1,
   1.2, 1.4).
2. A slide is `SlideBase` (`deck.ts:115-158`: `schemaVersion`, `id`, `title`, `notes`, `tags`,
   `skip`, `template`, `background`, `grammar`, `ext`) plus one of six kinds (`content`, `opener`,
   `mood`, `closing`, `title`, `statement`; `deck.ts:250-284`). A deck is `Deck`
   (`deck.ts:71-113`: `id`, `title`, `theme`, `sections`, `assets`, `defaults` with `notes`,
   `appearance`, `counter`, `background`, `guides`, `revision`, timestamps, `trashedAt`). The one
   theme is `THEMES = ['gt-ink-paper']` (`deck.ts:24`).
3. The sheet is 1600 by 900 sheet pixels in four places that must move together for Page setup:
   `SHEET_WIDTH` and `SHEET_HEIGHT` (`render.ts:101-102`), `SHEET` (`packages/theme/src/tokens.ts:129`),
   `GUIDE_MAX` (`deck.ts:274`), `PICTURE_POS` (`canvas.ts:63`), plus the export page of 13.333 by
   7.5 inches (`docs/pptx.md:15-18`) and the print page of 960 by 540 pt (`render/print.ts:24`).
4. The action table holds 169 actions in 16 groups (`packages/agent/generated/manifest.json`
   `actionCount`; `ACTION_GROUPS`, `actions.ts:119-136`); 153 OpenAPI paths, 146 MCP tools and 156
   CLI entries are generated from it (section 2). The editor registers 74 window handlers
   (`apps/studio/src/routes/edit.$deckId.tsx`, the `on<...>(` calls); the presenter registers
   `view.goto` and `view.present` (`packages/agent/src/window/registry.ts:65-67`).
5. Present mode is one component, `apps/studio/src/components/Slideshow.tsx` (578 lines), over the
   viewer's `present/` folder: every key of Google's presenting table is bound
   (`packages/viewer/src/present/presentKeys.ts:77-116`), the presenter window syncs over
   `BroadcastChannel('turboslide:<deckId>')` (`presentSync.ts:44-50`), and Auto-play, the pen,
   in-show downloads, captions and audience tools are stubs with a sentence each
   (`present/strings.ts:22-36, 65`). Nothing in the show advances on a timer or plays media.
6. The asset pipeline accepts four image types (`apps/studio/src/server/upload.ts:48-53`), takes
   the presigned path over 3 MB (`:42`), caps a picture at 25 MB anonymous and 50 MB signed in
   (`ratelimit.ts:163-166`), an HTTP action body at 1 MB and an asset body at 25 MB
   (`packages/agent/src/http/dispatch.ts:21-22`), a bundle at 200 MB (`packages/store/src/bundle.ts:22`),
   and the deck's public assets at 200 MB (`DECK_CAPS`, `ratelimit.ts:260-276`). No audio or
   video type, role or sniff exists.
7. Export is PPTX in two modes (`flatten`, the default, pixel identical; `native`, editable text;
   `packages/export/src/export-pptx.ts:1-15`), PDF through Chromium print (`pdf/build.ts:1-27`),
   plain text (`export.text`), the standalone HTML (`build.run`), a JPEG or PNG of the current
   slide (`render.slide`), and the bundle (`deck.pack`); ODP and SVG are Later rows
   (`packages/chrome/src/menus/model.ts:841, 858`). The OOXML post process is nine modules under
   `packages/export/src/ooxml/` that rewrite slide parts by object name (section 5.3), the place a
   transition or animation part would be written.
8. `packages/import` imports one thing: the Prototemplate GT deck from its HTML parts
   (`import-deck.ts:1-5`). A `.pptx` is refused with one sentence in File > Open and Import slides
   (`packages/chrome/src/menus/strings.ts:852-854`; `dialogs/Open.tsx:67`; `dialogs/ImportSlides.tsx:182`).
   `jszip` is already in the catalog and the export package uses it (`pnpm-workspace.yaml`,
   `packages/export/src/ooxml/zip.ts`).
9. The menu model carries 232 Now rows, 21 Later rows and 38 Omit rows (`model.ts`, the `now(`,
   `later(` and `omit(` calls). Sections 9.2 and 9.3 list every Later and Omit row with its line
   and clause; the Later rows are the round five surface, and eleven of the Omit rows name a
   Google service or a Google account feature the brief excludes.
10. `pnpm check` is 28 steps at `d5d7f07` (`scripts/check.mjs:143-260`); SPEC-4 6.1 adds steps 29
    to 31 (the brand build check, the Vercel output check, the perf budget) for 31
    (`docs/gslides-parity/SPEC-4.md:430-442`).
11. Hosted, a function runs 300 s by default and 800 s with 3009 MB on the export, render, bundle
    and server function routes (`apps/studio/vite.deploy.config.ts:88, 128, 153-160`); a response
    body over 4,718,592 bytes cannot leave a function (`docs/hosting-chromium.md:261-265`); `/tmp`
    is 525 MB with about 205 MB taken by the browser (`:173-185`); each function directory is about
    150 MB against a 250 MB cap (`:347-348`). Without `REDIS_URL` the deployment runs the `blob`
    realtime tier with per instance presence and no cross instance quota
    (`docs/hosting.md:594-599`; `ratelimit.ts:455-470`).

## How to read this report

- A path is relative to `/Users/kevinliu/repos/Turboslide`. A line reference is `file:line` or
  `file:from-to` at `d5d7f07`. Paths under `packages/schema/src/` are given by file name alone
  after their first mention in a section.
- "Read" means the fact is in the source. "Recorded" means a document in the repository states it
  and it was not re-measured here. "Unverified" means neither settles it; section 14 repeats every
  such item.
- Plain technical English, sentence case, no trailing periods on headings.

## 1. The document

### 1.1 The deck manifest

`Deck` (`deck.ts:71-113`) and `deckSchema` (`deck.ts:539-586`):

| Field                   | Type                                                          | Notes                                                                                                                                                           |
| ----------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schemaVersion`         | `1`                                                           | `SCHEMA_VERSION` (`deck.ts:21`)                                                                                                                                 |
| `id`                    | slug                                                          | the folder name under `decks/`                                                                                                                                  |
| `title`                 | string                                                        | inspector group Slide                                                                                                                                           |
| `theme`                 | `'gt-ink-paper'`                                              | `THEMES` has one entry; the comment reads "a second theme is additive (SPEC 2.1, open question 6)" (`deck.ts:23-25`)                                            |
| `sections`              | `{ id, name, slideIds }[]`                                    | the only place order lives (`deck.ts:69`); `slideOrder` flattens them (`:655`)                                                                                  |
| `assets`                | `Record<AssetId, Asset>`                                      | section 1.6                                                                                                                                                     |
| `defaults.notes`        | string                                                        | the notes a slide without its own exports (`pptx/notes.ts:1-2`)                                                                                                 |
| `defaults.appearance`   | `'light' \| 'dark'`                                           | dark when absent (`deckAppearance`, `deck.ts:589`)                                                                                                              |
| `defaults.counter`      | `'on' \| 'off' \| 'skip-title'`                               | on when absent (`deckCounter`, `:594`)                                                                                                                          |
| `defaults.background`   | `{ color: Color }`                                            | what Add to theme writes (`deck.setBackground`)                                                                                                                 |
| `guides`                | `{ x: number[]; y: number[] }`                                | sheet pixels inside `GUIDE_MAX` 1600 by 900 (`deck.ts:274-279`); sorted, no duplicates (`validate` code `guides`)                                              |
| `revision`              | integer                                                       | increments on every committed write                                                                                                                             |
| `createdAt`, `updatedAt` | ISO 8601                                                     | `isoDateSchema` (`:535`)                                                                                                                                        |
| `trashedAt`             | ISO 8601, optional                                            | written by `deck.trash` at the store level, never through `deck.set` (`:104-112`)                                                                               |

No field names a page size, a transition default, a second theme, a template origin or a
media list. The whole document is `DeckDocument = { deck, slides }` (`deck.ts:287`).

### 1.2 The slide

`SlideBase` (`deck.ts:115-158`):

| Field           | Type                          | Notes                                                                                                                                                                     |
| --------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schemaVersion` | `1`                           | on every slide file so one slide reads alone                                                                                                                              |
| `id`            | slug                          |                                                                                                                                                                           |
| `title`         | string, optional              | overrides the derived title (`derivedSlideTitle`, `deck.ts:722`; `TITLE_MAX_CHARS` 72, `:700`)                                                                           |
| `notes`         | string, optional              | the only place notes live                                                                                                                                                 |
| `tags`          | string[], optional            |                                                                                                                                                                           |
| `skip`          | `true`, optional              | present, view, standalone, print, thumbnails, PDF and PPTX omit it unless asked (`unskippedSlideOrder`, `:604`)                                                            |
| `template`      | `LayoutId`, optional          | the layout the slide was made from; absent on every stored slide until New slide or Apply layout runs                                                                     |
| `background`    | `{ color: Color }`, optional  | the slide's own fill; a background picture is a `picture` block at the bottom of the canvas stack, not a field (`:139-144`)                                               |
| `grammar`       | `GrammarRecord`, optional     | the conversion record of a canvas slide: kind, layout, slot membership, boxes, the kind's fields (`:174-193`), so `fromCanvas` restores the kind (`canvas.ts:497`)        |
| `ext`           | record, optional              | unknown fields survive here; `validate` reports it once at severity 1                                                                                                     |

The six kinds (`deck.ts:250-284`; `SLIDE_KINDS`, `:284`):

| Kind        | Own fields                                              | Plate side and width       | Source                          |
| ----------- | ------------------------------------------------------- | -------------------------- | ------------------------------- |
| `content`   | `layout: Layout`, `slots: Partial<Record<SlotName, Block[]>>` | none                  | `deck.ts:250-254`               |
| `opener`    | `sectionId`, `picture`, `plate`                         | lower-left, 740            | `:256-261`                      |
| `mood`      | `picture`, `plate`                                      | lower-right, 560           | `:263`                          |
| `closing`   | `picture`, `plate`, `mark?`                             | upper-left, 720            | `:265-270`                      |
| `title`     | `mark: { w, h }`, `heading: Text`, `lead: Text`         | none                       | `:271-276`                      |
| `statement` | `big: Text`, `measure?`                                 | none                       | `:278`                          |

`Layout` (`deck.ts:209-241`) is one of `cols` (ratio `5/7`, `4/8`, `1/1`, `{ left }` or `{ right }`;
gap 72, 56 or 48; align), `split` (gap 56 to 26; head single or two columns; body align), `center`,
`left-mid`, `stack` (gap) and `freeform`. The slot names are `main`, `head`, `headLeft`,
`headRight`, `body`, `left`, `right` (`SLOT_NAMES`, `:197-205`). A canvas slide is a content slide
on the `freeform` layout whose `main` blocks each carry `pos` (`isCanvasSlide`, `:683`;
`canvasObjects`, `:690`). `Picture` is `{ asset, fit: 'cover', position? }` (`:245`) and `Plate` is
`{ side, maxWidth, blocks }` (`:247`); `PLATE_SIDES` and `PLATE_WIDTHS` are at `:377-378`.

### 1.3 The shared block fields

| Field or type          | Definition                                                                                                                                                       | Where                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `BlockBase`            | `id`, `ext?`, `pos?: Position`, `link?: BlockLink`, `alt?: string`                                                                                               | `blocks.ts:216-222`                     |
| `Position`             | `x, y, w, h` in sheet px, `z?`, `rotate?` in degrees clockwise 0 to 360 exclusive, `flip?: 'h' \| 'v' \| 'hv'`, `group?: slug` (the flat group tag)              | `position.ts:15-29`                     |
| `Autofit`              | `'none' \| 'shrink' \| 'grow'`, Google's three labels                                                                                                            | `blocks.ts:225-233`                     |
| `Valign`               | `'top' \| 'middle' \| 'bottom'`                                                                                                                                  | `:235-236`                              |
| `Padding`              | one number or four sides in px                                                                                                                                   | `:239`                                  |
| `Shadow`               | `color?`, `opacity?`, `angle?`, `distance?`, `blur?`; defaults ink, 0.3, 45, 8, 12                                                                               | `:242-256`                              |
| `Typography`           | `size?` (the ladder 88 to 15), `weight?` 300 to 700 (500 cap as a lint), `align?` (left, center, right, justify), `tracking?` em, `leading?`, `spaceBefore?`, `spaceAfter?`, `columns?` 1 to 3, `indent?` px | `typography.ts:14-75` |
| `Color`                | a token of `COLOR_TOKENS` (ink, paper, ink-2, titanium, hair, hair-soft, plate, edge, green, amber, red, blue) or `#rrggbb`; a hex is a `color/off-palette` finding | `color.ts:14-32`                     |
| `Text`                 | a string in the five rule markup: `*display*`, `[text](url)`, `[text]{i u s sup sub c:<color> h:<color>}`, the GT word, the escapes; paragraph breaks only in the multiline pointers | `text.ts:1-27, 34` |
| `RunMarks`             | `i`, `u`, `s`, `sup`, `sub`, `color`, `hl`                                                                                                                       | `text.ts:40-48`                         |
| `BlockLink`            | a URL or `{ slide: <id> \| next \| previous \| first \| last }`                                                                                                  | `text.ts:87-123`                        |
| `LINK_SCHEMES`         | `https:`, `http:`, `mailto:`, `tel:`                                                                                                                             | `text.ts:1032`                          |
| Lists                  | `LIST_MARKERS` rule, bullet, number; `BULLET_PRESETS` (`:1060`), `NUMBER_PRESETS` (`:1074`), `LIST_LEVEL_MAX` 9 (`:1088`), `NumeralForm` digit, zerodigit, alpha, upperalpha, roman, upperroman (`:1121`) | `text.ts:1060-1124` |
| `CASE_MODES`           | lower, upper, title                                                                                                                                              | `text.ts:624`                           |

The typography steps are data: `TYPE_LADDER` (`typography.ts:14`), `TYPE_WEIGHTS` (`:21`),
`TYPE_ALIGNS` (`:27`), `TYPE_TRACKING` (`:31`), `TYPE_LEADING` (`:38`), `LINE_SPACING_PRESETS`
(`:43`), `TYPE_COLUMNS` (`:46`), `COLUMN_GAP_PX` 40 (`:50`), `INDENT_STEP_PX` 64 (`:53`),
`PARAGRAPH_SPACE_STEP_PX` 8 (`:56`). There is no `firstLine` or `hanging` indent field (SPEC-2 12
lists them as Later).

### 1.4 The block catalog

`BLOCK_TYPES` (`blocks.ts:683-719`) has 35 entries; `CATALOG` (`catalog.ts:55-592`) is keyed by
them and `BLOCK_GROUPS` (`catalog.ts:594-603`) names the eight groups: Text, Ruled lists, Figures,
Diagrams, Specimens, The mark, Primitives, Escape. The export column is the catalog's `export`
field (`'native'`, `'raster'` or `'mixed'`, SPEC 8.6); `NATIVE_BLOCK_TYPES` in `export.ts:51-70`
is the list the Editable text export writes as text (heading, paragraph, credit, rows, plain,
refs, ladder, panel, text, box, shape, rule, table, chart).

| Type         | Label                | Group     | Allowed in       | Export | Fields beyond `BlockBase`                                                                                                                                                                                                                                             | Type at         |
| ------------ | -------------------- | --------- | ---------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `heading`    | Heading              | text      | content, plate   | native | `level` h1, h2, big, title; `text`; `marginTop?`; `marginBottom?` 0 or 18; `typography?`; `autofit?`                                                                                                                                                                   | `blocks.ts:275` |
| `paragraph`  | Paragraph            | text      | content, plate   | native | `text`; `role?` body, lead, cap; `tone?` ink, muted; `measure?` 32, 56 or a number; `marginTop?`; `typography?`; `autofit?`                                                                                                                                             | `:286`          |
| `credit`     | Credit               | text      | plate, content   | native | `text`                                                                                                                                                                                                                                                                | `:440`          |
| `rows`       | Ruled rows           | list      | content          | native | `key` 90 to 300 (the snap set `ROWS_KEY_SNAP`, `:1018`); `tight?`; `links?`; `minRowHeight?`; `items: { key, icon?, value, ext? }[]`                                                                                                                                 | `:441`          |
| `plain`      | Ruled statement list | list      | content          | native | `size?` 24, 22, 20; `numbered?`; `marker?` rule, bullet, number; `preset?`; `items: { text, icon?, no?, level? }[]`                                                                                                                                                  | `:454`          |
| `refs`       | References           | list      | content          | native | `items: Text[]`                                                                                                                                                                                                                                                       | `:462`          |
| `say`        | Two registers        | list      | content          | native | `items: { quote, note?, no? }[]`                                                                                                                                                                                                                                      | `:463`          |
| `scales`     | Scales               | diagram   | content          | native | `centerTick?`; `items: { left, right, value }[]`                                                                                                                                                                                                                      | `:468`          |
| `spec`       | Type specimen        | specimen  | content          | native | `weights` 300 to 800; `sample`; `textRow?`                                                                                                                                                                                                                            | `:473`          |
| `lang`       | Scripts              | specimen  | content          | native | `items: { script, text, label }[]`                                                                                                                                                                                                                                    | `:479`          |
| `ladder`     | Type ladder          | specimen  | content          | native | `rows: { size, label }[]`; `valueWidth?` 200 or 320                                                                                                                                                                                                                   | `:487`          |
| `swatches`   | Swatches             | specimen  | content          | native | `items: { name, value, plate }[]`                                                                                                                                                                                                                                     | `:492`          |
| `shot`       | Screenshot           | figure    | content          | mixed  | `asset`; `fit?` width, fit; `aspect?`; `crop?` top, center; `caption?`; `captionSize?` 16, 15; `width?`; `border?`; `trim?`; `mask?`; `adjust?`; `frame?`; `shadow?`; `dither?`                                                                                      | `:503`          |
| `pair`       | Pair                 | figure    | content          | mixed  | `ratio?`; `gap?` 28, 40; `captionSize?`; `figures: { assets, caption? }[]`                                                                                                                                                                                            | `:543`          |
| `tiles`      | Tile grid            | figure    | content          | mixed  | `columns` 4, 5, 6; `aspect` 16/9, 16/10, 1/1; `labelSize?`; `items: { asset?, label?, sub?, marker? }[]`; `more?`                                                                                                                                                    | `:550`          |
| `details`    | Detail grid          | figure    | content          | mixed  | `columns: 3`; `rowHeights?`; `items: { asset, caption? }[]`                                                                                                                                                                                                           | `:558`          |
| `board`      | Status board         | list      | content          | mixed  | `columns: [128, 250, 200, 'fr']`; `rows: { asset?, name, address?, state: Icon, note }[]`                                                                                                                                                                             | `:564`          |
| `composite`  | Composite figure     | figure    | content          | mixed  | `tracks` (a CSS grid template); `gap?`; `justify?`; `align?`; `caption?`; `captionSize?`; `cells: { blocks: Block[], span? }[]` (recursive)                                                                                                                             | `:576`          |
| `panel`      | Code panel           | text      | content          | native | `code`; `size?` 17, 15; `pre?`; `term?`; `marks?`                                                                                                                                                                                                                     | `:586`          |
| `dia`        | Diagram              | diagram   | content          | raster | `fit` slot or `{ viewBox }`; `data?: Diagram` (lines, rects, markers, texts, icons, marks, polygons; `:137-179`); `svg?`; `alt`                                                                                                                                       | `:594`          |
| `dither`     | Dither ramp          | diagram   | content          | raster | `height: 220`; `ramp: 'linear-x'`; `border?`; `alt`                                                                                                                                                                                                                   | `:601`          |
| `mark`       | Mark                 | mark      | content, plate   | raster | `w`, `h`                                                                                                                                                                                                                                                              | `:609`          |
| `markSizes`  | Mark sizes           | mark      | content          | raster | `sizes: number[]`                                                                                                                                                                                                                                                     | `:611`          |
| `matrix`     | Matrix               | diagram   | content          | native | `cells: number[][]`; `caption?`                                                                                                                                                                                                                                       | `:613`          |
| `logoPlates` | Logo plates          | figure    | content          | mixed  | `items: { asset?, mark?, name }[]`                                                                                                                                                                                                                                    | `:619`          |
| `material`   | Material             | figure    | content          | raster | `materialId`; `preset?`; `uniforms?`; `anchor?` ms; `twoTone?`; `plate?`; `asset?` (the frozen frame); `height?`; `caption?`; `captionSize?`; `alt`                                                                                                                  | `blocks/material.ts:33-61` |
| `box`        | Box                  | primitive | content          | native | `fill?`; `stroke?`; `strokeWidth?` 0, 1, 1.5, 2; `radius?`; `padding?`; `height?`; `text?`; `typography?`; `color?`; `dash?`; `valign?`; `shadow?`; `autofit?`                                                                                                        | `:306`          |
| `shape`      | Shape                | primitive | content          | native | `shape: ShapeKind` (5 legacy ids, 135 presets, 5 line kinds); `fill?`; `stroke?`; `width?` 1 to 4; `radius?`; `arrowheads?`; `orientation?`; `height?`; `text?`; `typography?`; `color?`; `padding?`; `valign?`; `autofit?`; `adjust?: number[]`; `dash?`; `shadow?`; `bend?`; `points?`; `closed?`; `lineStart?`; `lineEnd?`; `connect?: { start?, end? }` | `:361` |
| `rule`       | Rule                 | primitive | content          | native | `orientation`; `length?`; `weight?` 1, 1.5, 2; `color?`; `dash?`                                                                                                                                                                                                      | `:400`          |
| `text`       | Text box             | primitive | content, plate   | native | `text`; `typography?`; `color?`; `outline?: { color, width }` (word art); `valign?`; `padding?`; `shadow?`; `autofit?`                                                                                                                                                | `:415`          |
| `icon`       | Icon                 | primitive | content          | raster | `name: IconName`; `size?` 16 to 96; `color?`; `shadow?`                                                                                                                                                                                                               | `:432`          |
| `table`      | Table                | list      | content          | native | section 1.5, plus `shadow?`                                                                                                                                                                                                                                           | `:637`          |
| `chart`      | Chart                | diagram   | content          | native | section 1.5, plus `shadow?`                                                                                                                                                                                                                                           | `:639`          |
| `picture`    | Picture              | figure    | content          | raster | `asset`; `position?` center, top, bottom; `trim?`; `mask?`; `adjust?`; `frame?`; `shadow?`; `dither?`; `side?`                                                                                                                                                       | `:530`          |
| `html`       | HTML escape          | escape    | content, plate   | raster | `css`; `html`; `note`; `htmlSanitized?`                                                                                                                                                                                                                               | `:629`          |

The picture tools shared by `shot` and `picture`: `ShotTrim` (four fractions, `:497`), `ShotAdjust`
(`transparency`, `brightness`, `contrast`; `:499`), `ShotFrame` (`weight`, `color`, `dash`; `:501`),
`mask` (a closed preset id), `shadow`, and `dither: PictureDither` (section 1.5). There is no
`reflection` or `recolor` field (SPEC-2 12 lists them as Later).

The shape vocabulary (`shapes.ts`): `SHAPE_CATEGORIES` shapes, arrows, callouts, equation (`:14`);
`SHAPE_PRESETS` 135 rows in picker order (`:188`); `LEGACY_SHAPE_IDS` rectangle, rounded, ellipse,
line, arrow (`:205`); `LINE_KINDS` line, arrow, elbow, curved, curve, polyline, scribble
(`:216-224`); `CONNECTOR_KINDS` (`:239`) and `PATH_KINDS` (`:241`); `LINE_ENDS` none, fillArrow,
stealth, fillCircle, fillSquare, fillDiamond, openArrow, openCircle and three more (`:294-305`);
`DASHES` solid, dot, dash, dashDot, longDash, longDashDot (`:322`); the PPTX maps `DASH_PPTX`
(`:348`) and `LINE_END_PPTX` (`:358`); the connection sites `rectSites` (`:407`). The `equation`
category holds preset shapes only (mathPlus and its kin); there is no equation object, OMML field
or math text run anywhere in the schema (the sibling report 06 designs it).

### 1.5 The sub block modules

| Module                | What it holds                                                                                                                                                                                                                                                                                                                                          | Lines                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| `blocks/table.ts`     | `TABLE_MAX_COLUMNS` and `TABLE_MAX_ROWS` 20 (`:22-23`); `TABLE_SIZES` 20, 18, 17, 16, 15; aligns; valigns; `TABLE_BORDER_WEIGHTS` 0, 1, 1.5, 2; `TableFields`: `columns: { width?, align?, fill? }[]`, `rows: { cells: Text[], header?, height? }[]`, `valign?`, `border?: { weight, color?, dash? }`, `size?`, `spans?: { row, column, rows, columns }[]`, `cells?: { row, column, fill?, border? }[]`; `TableCommand` and `applyTableCommand` for Google's row and column menus | `:21-65, 324, 456`             |
| `blocks/chart.ts`     | `CHART_KINDS` bar, column, line, pie (`:15`); `CHART_LEGENDS` none, right, bottom, top, left; `CHART_NUMBER_FORMATS` plain, thousands, percent, currency; 12 categories and 6 series at most (`:32-33`); `CHART_SERIES_COLORS` (`:36`); `ChartFields`: `kind`, `categories`, `series: { name, values, color? }[]`, `title?`, `legend?`, `numberFormat?`, `labels?`, `height?` | `:15-64`                       |
| `blocks/material.ts`  | `MATERIAL_PLATE_SIDES` (`:27`), `MATERIAL_ANCHORS` 4000, 5500, 7000 ms (`:31`), `MaterialBlock` (section 1.4)                                                                                                                                                                                                                                          | `:27-61`                       |
| `blocks/dither.ts`    | `DITHER_PATTERNS` bayer8, bayer4, blue64, random (`:11`); `DITHER_TONES` two, three, original (`:14`); `DITHER_CELLS` 1 to 4 (`:17`); `DITHER_POLARITIES` auto, dark-ground, light-ground, same (`:20`); `DITHER_CHANNELS` gray, r, g, b (`:23`); `PictureDither`: `pattern`, `tone?`, `steps?` 2 to 7, `cell?`, `strength?` 0 to 1, `black?`, `white?` 0 to 255, `gamma?` 0.5 to 2, `invert?`, `polarity?`, `blur?` 0 to 8, `minFilter?` 0 to 9, `channel?`, `seed?` (`:27-56`); `DITHER_DEFAULTS` (`:62-76`); the Photograph preset black 120, white 230, gamma 0.9 (`:87`) | `:11-96`                       |
| `blocks/composite.ts` | the track parser (px, fr, minmax, repeat, percent) and `COMPOSITE_DEFAULT_GAP` 22                                                                                                                                                                                                                                                                      | `:9-12`                        |

The dither families are four ordered or random threshold patterns. No error diffusion (Floyd
Steinberg, Atkinson) and no halftone family exists in `blocks/dither.ts`, `packages/effects/src/dither.ts`
(`thresholdAt`, `:107`) or the Rust crate (section 8.2).

### 1.6 Assets

`Asset` (`assets.ts:111-135`): `id`, `role`, `alt`, `twins` (`{ light, dark }` or `{ neutral }`
paths under `assets/`), `size` in file pixels, `scale` 1, 2 or 3, `source`, `treatment?`,
`sourceFile?` (the continuous original a dither re-runs from), `credit?`, `inline`, `metrics?`,
`variants?` (the materialized dither variants by key, `AssetVariant`, `:95-109`), `ext?`.

| List               | Values                                                                                                                             | Where              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `ASSET_ROLES`      | opener, mood, capture, detail, thumb, render, icon, logo, frame, other                                                             | `assets.ts:11-22`  |
| `INLINE_RULES`     | native, resample-1280, two-color, pass-through                                                                                     | `:26`              |
| `AssetSource`      | `material` (materialId, uniforms, size 3200 by 1800, timeMs, backend, renderer, recipeKey); `capture` (url, viewport 1440 by 900, scale 2, theme, region, recipe); `photo` (origin, title, artist, license, shareAlike); `file` | `:31-58` |
| `AssetTreatment`   | `two-tone` (crop, channel, invert, blur, autocontrast 0.5, black, white, gamma, minFilter, unsharp, polarity, cell 2, bayer 8, resampler lanczos3) or `continuous` (quality 88, 92, 95) | `:60-78` |
| `AssetMetrics`     | `litFraction`, `plateClear` (plate box, nearest lit px, lit under, lit in band)                                                     | `:80-88`           |

Every asset is a picture. There is no audio or video role, no duration, no poster field, no
`kind: 'media'` source. The importer's residual record `ext.import` (`style`, `classes`, `css`,
`scope`) is `ext.ts:8-17`.

### 1.7 Access, comments, mutations and versions

Access (`access.ts`): `ROLES` viewer, commenter, editor, owner (`:17`); `CAPABILITIES` read,
readSkipped, readNotes, readComments, comment, write, history, export, exportNotes, share,
settings, rename, copy, trash, restore, remove, publish, transfer, presence, follow (`:27-49`);
`SCOPES` read, comment, write, export, share, admin (`:53`); `AccessRecord` with `owner`,
`pendingOwner`, `assetKey`, `generalAccess { mode: restricted | link | open, role }`, `links`,
`publish`, `grants`, `requests`, `settings`, `revision` (`:156-175`); the five settings
`editorsCanShare`, `viewersCanDownload`, `viewersCanSeeComments`, `showNamesToLinkVisitors`,
`allowHtmlBlocks` (`:148-154`, defaults `:177-183`).

Comments (`comments.ts`): six anchor kinds deck, slide, block, text (path, range, quoted), cell,
notes (`:77-99`); `COMMENT_CAPS` body 4,000 code points, 20 mentions, 100 replies, 200 threads
per slide, 5,000 per deck, 200 quoted, 40 label (`:52-60`); `Thread` with `comment`, `replies`,
`resolved?`, `assignee?`, `revision` (`:277-290`); 24 reactions (`EMOJI_PALETTE`, `:203`);
principal ids `anon_<uuid>`, `usr_<id>`, `agent:<tokenId>`, `local:<name>` (`:34-35`). A chat
inside the file would be a seventh surface beside these; nothing carries one today.

Mutations (`mutations.ts`): 17 ops, `slide.insert`, `slide.remove`, `slide.move`, `slide.set`,
`slide.replace`, `block.insert`, `block.remove`, `block.move`, `block.set`, `text.replace`,
`text.splice`, `text.mark`, `section.set`, `asset.set`, `asset.remove`, `deck.set`,
`version.restore` (`:104-121`); `Author` `{ kind, name, runId?, principalId? }` (`:136-141`);
`Write` `{ baseRevision, author, note?, mutations }` (`:142`); `Version` `{ n, revision, author,
note, createdAt, mutations }` (`:143-150`); `Lease` `{ slideId, holder, until }` (`:152`). A
transition or animation field lands through `slide.set` and `block.set` with no new op.

### 1.8 The layouts table

`LAYOUT_IDS` (`deck.ts:33-55`) and `LAYOUTS` (`layouts.ts:245-661`): Google's eleven names first
(`GOOGLE_LAYOUT_COUNT` 11, `:51`), then the GT layouts after the rule `LAYOUT_RULE_LABEL`
(`:53`). A `LayoutEntry` carries `id`, `label`, `google`, `kind`, `layout?`, `doc`, `icon`,
`needsPicture` and `make(id, deck, sectionId)` (`:32-48`). The placeholder prompts are `PROMPTS`
(`:58`, "Click to add title" and its kin).

| Id                    | Label                         | Google | Kind        | Layout     | Line   |
| --------------------- | ----------------------------- | ------ | ----------- | ---------- | ------ |
| `title`               | Title slide                   | yes    | title       |            | `:247` |
| `opener`              | Section header                | yes    | opener      |            | `:257` |
| `split`               | Title and body                | yes    | content     | split      | `:285` |
| `cols`                | Title and two columns         | yes    | content     | cols       | `:297` |
| `title-only`          | Title only                    | yes    | content     | stack      | `:312` |
| `one-column`          | One column text               | yes    | content     | stack      | `:323` |
| `statement`           | Main point                    | yes    | statement   |            | `:334` |
| `section-description` | Section title and description | yes    | content     | cols       | `:344` |
| `mood`                | Caption                       | yes    | mood        |            | `:359` |
| `big-number`          | Big number                    | yes    | content     | center     | `:382` |
| `blank`               | Blank                         | yes    | content     | freeform   | `:398` |
| `rows`                | Ruled rows                    | no     | content     | cols       | `:409` |
| `plain`               | Ruled statement list          | no     | content     | cols       | `:436` |
| `table`               | Title and table               | no     | content     | split      | `:457` |
| `figure`              | Figure                        | no     | content     | cols       | `:468` |
| `pair`                | Pair of figures               | no     | content     | split      | `:492` |
| `tiles`               | Tile grid                     | no     | content     | split      | `:516` |
| `details`             | Detail grid                   | no     | content     | split      | `:549` |
| `board`               | Status board                  | no     | content     | split      | `:576` |
| `matrix`              | Matrix                        | no     | content     | cols       | `:606` |
| `closing`             | Closing                       | no     | closing     |            | `:633` |

The layout list is the one "master and layouts" structure Turboslide has: there is no master
object, no layout thumbnail source beyond `icon`, and no per layout placeholder geometry that an
Edit theme surface could edit (the frame, wordmark and counter are the theme's CSS, section 7.2).

### 1.9 Validator codes and lint rules

`IssueCode` (`validate.ts:24-49`): `not_object`, `invalid`, `missing`, `unknown_field`, `ext`,
`migrated`, `ahead`, `duplicate_id`, `slot`, `reference`, `unlisted`, `opener`, `position`,
`table_size`, `link`, `dither`, `chart_size`, `connect`, `guides`. An `Issue` carries `code`,
`severity`, `file`, `pointer`, `message` (`:52-60`). `rules.json` names 56 lint rules (`sheet/`,
`type/`, `text/`, `color/`, `icon/`, `rows/`, `dia/`, `asset/`, `picture/`, `opener/`, `lines/`,
`copy/`, `table/size`, `chart/size`, `contrast/`, `layout/`, `freeform/`, `scales/`, `escape/`,
`html/sanitize`, `export/non-native`, `numbers/`, `count/`). A new block or field needs a code
here and, where legibility matters, a rule.

## 2. The agent surface

### 2.1 The action table

`ACTION_GROUPS` (`actions.ts:119-136`) names 16 groups; the generated manifest counts 169 actions
(`packages/agent/generated/manifest.json` `actionCount`). Milestone tags: 9 M1, 18 M2, 10 M3, 3 M4,
5 M5, 9 M6, 15 GS1, 36 GS2, 64 GS3 (`actions.ts`, the `milestone:` fields).

| Group      | Count | Ids                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deck`     | 18    | deck.info, create, rename, set, pack, unpack, push, pull, list, copy, trash, restore, remove, setBackground, guides; section.set; import.run; validate.run                                                                                                                                                                                                                                                       |
| `slide`    | 20    | slide.list, get, insert, remove, move, update, replace, setLayout, new, duplicate, skip, applyLayout, import, toCanvas, setBackground, lease, setBackgroundPicture, setBackgroundMaterial; text.replaceAll; diagram.insert                                                                                                                                                                                       |
| `block`    | 41    | block.set, insert, remove, move, align, distribute, order, duplicate, group, ungroup, regroup, rotate, flip, crop, mask, resetImage, adjust, setAlt, shadow, autofit; text.style, list, spacing, columns, indent, case, insert; chart.setData, setKind; table.merge, unmerge, insertRows, insertColumns, deleteRows, deleteColumns, distribute, cellStyle; shape.set; line.set; picture.dither, materialize |
| `asset`    | 5     | asset.add, dither, capture; material.capture, list                                                                                                                                                                                                                                                                                                                                                              |
| `render`   | 2     | render.slide, sheet                                                                                                                                                                                                                                                                                                                                                                                             |
| `lint`     | 3     | lint.run; fix.run; judge.bundle                                                                                                                                                                                                                                                                                                                                                                                 |
| `version`  | 5     | diff.run; version.save, list, restore, diff                                                                                                                                                                                                                                                                                                                                                                     |
| `view`     | 5     | view.goto, mode, theme, present, zoom                                                                                                                                                                                                                                                                                                                                                                           |
| `export`   | 5     | export.run, check, text; build.run; fonts.build                                                                                                                                                                                                                                                                                                                                                                 |
| `studio`   | 6     | source.read, apply; controls.list; control.activate, set; artifact.download                                                                                                                                                                                                                                                                                                                                     |
| `presence` | 4     | presence.list, follow, unfollow, pointer                                                                                                                                                                                                                                                                                                                                                                        |
| `sync`     | 3     | sync.status; deck.watch, follow                                                                                                                                                                                                                                                                                                                                                                                 |
| `comment`  | 16    | comment.add, reply, edit, delete, resolve, reopen, assign, done, react, list, get, link; notification.list, markRead, settings; activity.list                                                                                                                                                                                                                                                                   |
| `share`    | 21    | share.get, setGeneralAccess, createLink, revokeLink, rotateLink, stop, invite, setRole, remove, setExpiry, settings, requestAccess, listRequests, respond, transferOwnership, acceptOwnership, declineOwnership, claim, emailCollaborators; deck.publish, unpublish                                                                                                                                              |
| `account`  | 10    | account.decks, tokens.create, tokens.list, tokens.revoke, me, setName, setAvatar, sessions, signOut, forget                                                                                                                                                                                                                                                                                                     |
| `admin`    | 5     | admin.bootstrap, assignOwner, flag, migrateStorage, mail.list                                                                                                                                                                                                                                                                                                                                                   |

An `ActionSpec` (`actions.ts:147-166`) carries `id`, `label`, `doc`, `group`, `mutates`,
`transports`, `milestone`, `input`, `output`, `cli?`, `mcp?`, `example`. Inputs that the round
five designers extend: `render.slide` takes `scale` 1 or 2 and `format` png or jpg (`:2026-2027`);
`view.mode` takes slide, grid or book (`:2237`); `view.zoom` takes 0.25 to 16 or `fit` (`:2278`);
`export.run` takes the fields of `EXPORT_OPTIONS` (section 5.2); `deck.create` takes `name`, `from`
(`DECK_TEMPLATES` gt-brand or blank, `:567`) and `id` (`:942-951`); `slide.setBackgroundPicture`
takes `file`, `url` or `upload` with `alt` and the replace switch (`:4806-4814`);
`slide.setBackgroundMaterial` takes `materialId`, `preset`, `uniforms` and `anchor` (`:4851-4858`);
`picture.materialize` takes `slideIds`, `prune`, `scale`, `dryRun` (`:4761-4765`); `asset.add`
takes `id`, `file`, `url` (25 MB at most), `role`, `alt`, the license fields, `twoTone` and
`treatment` (`:1787-1821`).

### 2.2 Transports and generated files

`TRANSPORTS` are cli, mcp, http, window (`actions.ts:87-89`); 141 specs use `A`
(`ALL_TRANSPORTS`), the rest name a subset (`transports: ['cli']` 8 times, `['window']` 10 times).
The generator (`packages/agent/src/generate/*.ts`) writes `generated/manifest.json` (169 actions,
the transports' usage lines), `openapi.json` (153 paths), `mcp-tools.json` (146 tools),
`cli.json` (156 entries under `actions`), `describe.json`, `llms.txt` and `llms-full.txt`, plus
the four skill tables under `skills/turboslide-{api,create,studio,verify}/references/` and
`docs/grammar.md`; check step 3 asserts the tree is unchanged after `pnpm generate:contracts`
(`scripts/check.mjs:146-153`). The HTTP rules are `packages/agent/src/http/` (`WRITE_BODY_LIMIT`
1 MB and `ASSET_BODY_LIMIT` 25 MB, `dispatch.ts:21-22`); the MCP server is `packages/mcp/src/`
(`http.ts`, `stdio.ts`, `tools.ts`, `prompts.ts`, `resources.ts`).

### 2.3 Window handlers

The editor (`apps/studio/src/routes/edit.$deckId.tsx`, 5,334 lines) registers 74 handlers through
`on<...>('<id>', ...)`: block.adjust, align, autofit, crop, distribute, duplicate, flip, group,
insert, mask, move, order, regroup, remove, resetImage, rotate, set, setAlt, shadow, ungroup;
build.run; chart.setData, setKind; comment.link; deck.create, guides, rename, set, setBackground;
diagram.insert; export.run, text; line.set; picture.dither; presence.follow, pointer;
render.slide; section.set; shape.set; slide.applyLayout, duplicate, get, list, new, remove,
replace, setBackground, setLayout, skip, toCanvas, update; table.cellStyle, deleteColumns,
deleteRows, distribute, insertColumns, insertRows, merge, unmerge; text.case, columns, indent,
insert, list, replaceAll, spacing, style; version.restore, save; view.goto, mode, present, theme,
zoom. The server side window actions (run through `runDeckAction`, the write returning over the
watch channel) are `SERVER_SIDE_WINDOW_ACTIONS_GS2` (asset.add, asset.dither, material.capture,
material.list, deck.list, copy, trash, restore, remove, slide.import) and `_GS3` (presence.list,
sync.status, the comment actions and more; `apps/studio/src/server/agent-actions.ts:46-75`). The
viewer owner offers the `view.*` actions plus render.slide and render.sheet; the presenter offers
view.goto and view.present (`packages/agent/src/window/registry.ts:52-67`).

## 3. Present mode

### 3.1 The surfaces

| Surface                | File                                                                | What it is                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The slideshow          | `apps/studio/src/components/Slideshow.tsx` (578 lines)              | mounted over the sheet by `DeckViewer` and the editor while the shell is in present mode; state `{ blank, laser, fullscreen }` (`:53-57`); the keys, the toolbar, the black and white slides, the laser pointer, the counter, the channel; every move is one `onGoto` (`:41-51`); the Options menu is `optionsItems` (`:99-135`) with Auto-play as a stub (`:112-115`), the laser, full screen, and exit |
| The toolbar            | `packages/viewer/src/present/PresentToolbar.tsx`                    | bottom left, appears on pointer, fades two seconds after; Previous, the slide number opening the slide list, Next, Options; laser, the disabled Captions stub, full screen, Exit (`:1-10`)                                                                                                                                                                                       |
| The slide list         | `present/SlideList.tsx`                                             | the dropdown of slides in the show                                                                                                                                                                                                                                                                                                                                               |
| The layers             | `present/SlideshowLayer.tsx`                                        | `BlankLayer` and `LaserPointer`                                                                                                                                                                                                                                                                                                                                                  |
| The audience route     | `apps/studio/src/routes/deck.$deckId.tsx` with `?present=1`         | the shareable present link (`presentActions.ts:37-39`); the payload carries no notes and no skipped slides                                                                                                                                                                                                                                                                       |
| The presenter route    | `apps/studio/src/routes/present.$deckId.tsx`                        | `ssr: false`; loads the editor's read (notes, skip flags); renders the unskipped slides once for live frames; `?screen=1` redirects to the audience form (`:61-70`); attaches to the session registry as `presenter` and is a window API owner for view.goto and view.present (`:30-42`)                                                                                            |
| The presenter console  | `present/PresenterConsole.tsx`                                      | a timer with Pause and Reset, the clock, the current slide with the slide list and Previous and Next, the previous and next slides at 0.3 scale, the notes with plus and minus text size 14 to 28 px, "No speaker notes for this slide", an Audience tools tab present and disabled; live clones, no live shaders (`:24-34`)                                                       |
| The split button       | `apps/studio/src/components/presentActions.ts`                      | `presenterView` and `presentFromBeginning` as client handlers; the main part is `view.present`; `presenterWindowName` `turboslide-presenter:<deckId>` (`:28`), `presenterPath` (`:32`), `audiencePath` (`:37`)                                                                                                                                                                    |
| The standalone runtime | `packages/viewer/standalone/runtime.ts`                             | tail.html's script ported: the sidebar of live clones, the grid, the book, the theme bridge, the key table, click halves and swipe, the hash contract; no timers, no transitions (`:1-30`)                                                                                                                                                                                       |

The pure model is `present/presentModel.ts`: `playList` (the deck without skipped slides, `:23`),
`currentPlayIndex` (`:37`), `stepPlayIndex` (`:52`), `counterText` "3 of 10" (`:58`),
`slideNumberOf` (`:63`), `formatElapsed` (`:70`), `NOTES_FONT` 14 to 28 in steps of 2 (`:81`).

### 3.2 The keys

`presentKeyAction` (`presentKeys.ts:77-116`) and `presentKeyRows` (`:126-153`) bind every row of
Google's presenting table; every other bare key is swallowed so the reading surface's letters
never act while presenting.

| Keys                                                    | Action                     | Note                                                         |
| ------------------------------------------------------- | -------------------------- | ------------------------------------------------------------ |
| Esc                                                     | exit                       |                                                              |
| Right arrow, Space, Enter, Page down, a click            | next                       | Enter after digits is go                                     |
| Left arrow, Backspace, Page up                          | previous                   |                                                              |
| Home, End                                               | first, last                |                                                              |
| 0 to 9, then Enter                                      | digit, go                  | `slideNumberOf` over the play list                           |
| S                                                       | notes (Presenter view)     |                                                              |
| A                                                       | audience                   | inert with a snackbar; "Audience tools need a question service" (`strings.ts:65`) |
| L                                                       | laser                      |                                                              |
| Cmd or Ctrl P                                           | print                      |                                                              |
| Cmd or Ctrl Shift C                                     | captions                   | inert; captions are omitted (`strings.ts:22`)                |
| Cmd Shift F, F11                                        | fullscreen                 |                                                              |
| B or .; W or ,                                          | blank black; blank white   | any key returns (`:77-116`, the blank branch)                |

An animation step on click would have to share `next` with the slide advance; the resolver today
returns `{ type: 'next' }` with no notion of a step inside a slide.

### 3.3 The channel

`presentSync.ts`: `PRESENT_PROTOCOL` 1 (`:13`); `BroadcastChannel('turboslide:<deckId>')` with
`localStorage` key `turboslide:present:<deckId>` as the fallback (`:44-50`); messages `hello`,
`state { slideId, index, total, blank, laser }`, `goto { slideId }`, `present { on }`, `bye`, each
with `from` and `role` audience or presenter (`:17-35`); the envelope adds `v`, `at`, `seq`
(`:38-42`). The audience reports its state and follows `goto`; the presenter says hello, follows
the audience and sends `goto` for its own moves. A transition or animation state would need a
new message or a field on `state`.

### 3.4 The stubs inside the show

`present/strings.ts`: `captionsStub` (`:22`), `autoPlay` and `autoPlayStub` "Auto-play comes in a
later round" (`:29-30`), `pen` and `penStub` (`:31-32`), `downloadPdf`, `downloadPptx` and
`downloadStub` "Downloads open from the Download dialog after the show" (`:34-36`),
`audienceToolsStub` (`:65`). The Slideshow arrow's Present on another screen is a Later row
(`model.ts:724`).

## 4. The store and the asset pipeline

### 4.1 Backends and layout

`selectStore(env)` picks `file` (a checkout, `<repo>/decks`), `tmp` (`VERCEL` set without
`BLOB_READ_WRITE_TOKEN`, the overlay under `/tmp/turboslide/decks`, edits do not persist) or
`blob` (`VERCEL` and the token, the overlay as a mirror of Blob); `TURBOSLIDE_STORE` forces one
(`docs/hosting.md:10-31`, recorded). The Blob layout is `decks/<id>/` with `deck.json`,
`slides/<slideId>.json`, `versions/<n>.json`, `leases.json`, the sidecars and `assets/<file>` as
public URLs; the store mirrors one deck in the overlay and is a `FileStore` over it with a sync
around every call and `ifMatch` on `deck.json` as the commit point (`packages/store/src/blob-store.ts:1-12`).
Storage layout v2 puts documents in a private store when `TURBOSLIDE_BLOB_PRIVATE_TOKEN` is set
(`docs/hosting.md:640-692`, recorded). `HostedDecks` serves the deck list, `deck.create`, the store
of a deck and the asset twins through one collection whatever the backend
(`packages/store/src/hosted.ts:1-8, 62`).

### 4.2 The DeckStore interface

`DeckStore` (`packages/store/src/store.ts:154-197`): `read`, `revision`, `write(write, options)`,
`saveVersion`, `listVersions`, `records`, `documentAt(n)`, `documentAtRevision`, `lease`,
`release`, `leases`, `watch(listener)`, `putAsset(relative, bytes, contentType)` (digest named,
never overwritten, `AssetExistsError` at `:72`). A media file lands through `putAsset` the way a
twin does; nothing in the interface knows the content type beyond the optional argument.

### 4.3 Asset intake

| Path                                                     | Rule                                                                                                                                                                                                                                                                                                                    | Where                                              |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `asset.add { file }`                                     | a path on the machine or a `data:` URL; file paths need `allowPaths` (SPEC-3 8.6)                                                                                                                                                                                                                                       | `actions.ts:1789-1792`; `materials/actions.ts:76` |
| `asset.add { url }`                                      | an http(s) URL fetched through `safeFetch`, 25 MB at most                                                                                                                                                                                                                                                               | `actions.ts:1793`                                  |
| `asset.add { upload }`                                   | hosted: the key of a presigned client upload, read by `readUpload`                                                                                                                                                                                                                                                      | `materials/actions.ts:80`; `upload.ts:25-39`       |
| The presigned route `POST /api/x/upload/picture`         | a picture over `PRESIGN_THRESHOLD_BYTES` 3 MB takes it; `authorize(write)`, the `uploads` flag, the picture quotas; a token for `uploads/<principalId>/<uuid>` with the tier's cap and one of four content types, valid ten minutes; unclaimed uploads swept after 24 hours                                            | `upload.ts:25-58`; `routes/api/x.upload.$.ts`      |
| `UPLOAD_CONTENT_TYPES`                                   | `image/png`, `image/jpeg`, `image/webp`, `image/gif`                                                                                                                                                                                                                                                                    | `upload.ts:48-53`                                  |
| The sniff                                                | `sniffImage` from `@turboslide/headless/capture/shared` before a file is kept                                                                                                                                                                                                                                            | `upload.ts:6`                                      |
| The HTTP body                                            | 1 MB for a write, 25 MB for `asset.add` and `asset.capture`                                                                                                                                                                                                                                                             | `packages/agent/src/http/dispatch.ts:21-22`        |
| A bundle                                                 | `BUNDLE_MAX_BYTES` 200 MB; the unpack validates every digest and image signature                                                                                                                                                                                                                                        | `packages/store/src/bundle.ts:22`; `unpack.ts`     |
| The function's response                                  | a body over 4,718,592 bytes cannot leave; the export answers 302 to the stored copy or 413                                                                                                                                                                                                                              | `docs/hosting-chromium.md:261-265` (recorded)      |

The twins and the dither variants are what every surface draws; the continuous source is kept as
`assets/<id>.source.<ext>` only when asked (`assets.ts:120-127`). Thumbnails are the render worker's
1x screenshot downsized to 160, 320 or 640 px (`THUMB_WIDTHS`, `apps/studio/src/server/thumbs.ts:48-51`).

### 4.4 Quotas and deck caps

`QUOTAS` (`apps/studio/src/server/ratelimit.ts:88-253`), three tiers anonymous, account, agent:

| Quota                     | Anonymous | Account | Agent  | Window |
| ------------------------- | --------- | ------- | ------ | ------ |
| writesPerMinutePerDeck    | 120       | 240     | 600    | minute |
| rendersPerHour            | 400       | 2,000   | 5,000  | hour   |
| exportsPerDay             | 5         | 30      | 100    | day    |
| exportConcurrency         | 1         | 1       | 2      | none   |
| standaloneBuildsPerDay    | 3         | 20      | 50     | day    |
| deckCreatesPerDay         | 5         | 50      | 200    | day    |
| bundlesPerDay             | 2         | 20      | 100    | day    |
| bundleBytesPerDay         | 100 MB    | 2 GB    | 10 GB  | day    |
| picturesPerDay            | 20        | 200     | 500    | day    |
| pictureBytesPerDay        | 200 MB    | 5 GB    | 10 GB  | day    |
| largestPictureBytes       | 25 MB     | 50 MB   | 50 MB  | none   |
| materializePerHour        | 20        | 100     | 500    | hour   |
| materialCapturesPerHour   | 10        | 50      | 200    | hour   |
| opsBytesPerMinute         | 2 MB      | 8 MB    | 8 MB   | minute |

`DECK_CAPS` (`:260-276`): 500 slides, 400 blocks per slide, 200 KB per slide document, 5 MB per
html block, 25 MB per document, 200 MB public assets, 250 MB continuous sources, 5 MB comments,
200 comments per thread, 16 MB retained stream, 500 MB uploads in flight, 200 mutations per write,
40 named versions, 600 grant holders, 50 live links. A media cap would be a new row here and a new
`largestMediaBytes` quota.

### 4.5 Templates and the seed

`DECK_TEMPLATES` is `['gt-brand', 'blank']` (`actions.ts:567`). A template is a folder
`decks/templates/<id>` with `template.json` (`TemplateRecord`: `id`, `name`, `description`,
`theme`, `deck`, `slides`, `assets`, `sections`, `archetypes` of `{ id, label, kind, layout?,
source? }`; `packages/store/src/templates.ts:50-77`), a `deck.json` and a `slides/` folder; the GT
template shares the imported deck's twins (`:1-13`). `createDeck`, `copyDeck`, `trashDeck`,
`restoreDeck` and `removeDeck` live here (`:15-19`). The seed (`seed.ts:1-9`) writes
`decks/templates` and the GT deck into the overlay on first use from a directory or Nitro's
server assets. The home page's strip (`apps/studio/src/routes/decks.index.tsx:611-655`) shows the
Blank card and the GT brand deck card under a "Template gallery" link that scrolls to the strip;
Insert > Templates and Building blocks are Later rows (`model.ts:1352-1353`). The Open dialog's
Upload tab and the Import slides dialog's Upload tab accept a Turboslide bundle (`.zip`) only
(`dialogs/Open.tsx:1-4, 171`; `dialogs/ImportSlides.tsx:176`).

## 5. Export

### 5.1 The package

`packages/export/src/`:

| Folder or file          | Modules                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `export-pptx.ts`        | `export.run` for PPTX: scenes from the renderer, one file per theme, the OOXML post process, the typed report, the verify hook; flatten is the default; the table fallback loop (`:1-15`, `exportPptx` `:159`)                                                                                                                                                                                                                             |
| `scene/`                | `extract.ts` (the scenes from the rendered DOM), `enrich.ts`, `measure.ts`, `two-tone.ts`, `types.ts`                                                                                                                                                                                                                                                                                                                                       |
| `pptx/`                 | `build.ts` (one theme's scenes to one PPTX through pptxgenjs; `buildPptx` `:223`), `masters.ts` (the paper and picture masters, 13.333 by 7.5 in), `text.ts`, `shapes.ts`, `lines.ts`, `links.ts` (URL and slide hyperlinks), `images.ts` (2x PNG rasters with rotate, flip, shadow, alt), `table.ts` (`addTable`), `chart.ts` (`addChart`), `notes.ts` (one notes part per slide), `baseline.ts`, `face-advance.ts`, `fonts-map.ts`, `page-raster.ts` |
| `ooxml/`                | section 5.3                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `pdf/build.ts`          | `exportPdf` through Chromium print of `renderPrintDocument`; `PDF_GATE` and `PDF_RASTER` 3200 by 1800 (`:60-70`, `:171`)                                                                                                                                                                                                                                                                                                                    |
| `batch/`                | `plan.ts` (`BATCH_BUDGET_S` 240, `SECONDS_PER_SLIDE` 2.6, `EXPORT_BATCH_SIZE` 60, `TURBOSLIDE_EXPORT_BATCH`; `:24-43`), `merge.ts`, `index.ts`                                                                                                                                                                                                                                                                                             |
| `verify/`               | the LibreOffice loop, the geometry read back, the diffs, the budgets, the QuickLook smoke check, the reference renders                                                                                                                                                                                                                                                                                                                      |
| `dither-variants.ts`    | `materializeForExport`                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `calibration/`          | the calibration deck and its measures                                                                                                                                                                                                                                                                                                                                                                                                       |
| `check.ts`, `report.ts` | `export.check` and the report builder                                                                                                                                                                                                                                                                                                                                                                                                       |
| `units.ts`              | `PAGE_EMU`, `PAGE_IN`, `pxToEmu` (one sheet px is 7,620 EMU)                                                                                                                                                                                                                                                                                                                                                                                |

The schema side is `export.ts`: `ExportFormat` pptx or pdf (`:11`), `ExportMode` native or flatten
(`:12`), `PAGE_RASTER_FORMATS` png-1bit, png-palette, png-rgba, jpeg (`:20`),
`PAGE_RASTER_BUDGETS` (`:29-34`), `NATIVE_BLOCK_TYPES` (`:51-70`), `CONTINUOUS_TONE_BLOCK_TYPES`
(`:79-86`), `EXPORT_OPTIONS` with ids format, mode, theme, fonts, embedFonts, headings,
rasterScale, pictureScale, verify (`:112-238`), `ExportReport` (`:259`), `ExportCheck` (`:391`).

### 5.2 Modes, formats and the menu rows

Perfect (`flatten`) places the 2x sheet screenshot as a full page picture over the slide's text as
invisible runs; Editable text (`native`) writes every `NATIVE_BLOCK_TYPES` block as a text box at
the browser's box and the rest as 2x PNGs; both share the page, the notes, the slide names and
hidden titles, the post process and the validation (`docs/pptx.md:13-50`, recorded). File >
Download (`model.ts:838-870`): PowerPoint (the Download dialog with the Perfect | Editable text
Seg, notes, skipped slides, More options; `dialogs/Download.tsx:1-8`), ODP (Later, `:841`), PDF
(the same dialog without the Seg), Plain Text (`export.text`, `:845`), JPEG and PNG of the current
slide (`render.slide` with `format`, `:848-857`), SVG (Later, `:858`), Web page (`build.run`,
`:863`), Turboslide bundle (`deck.pack`, `:867`). Round five's autoplay HTML export lands on
`build.run` and `renderStandalone` (`packages/render/src/standalone.ts:87`) with the runtime of
`packages/viewer/standalone/runtime.ts`.

### 5.3 The OOXML post process

Every module takes and returns a slide part's XML or the jszip package; shapes are addressed by
the object names pptxgenjs wrote (`ts:<slide>#<block>@g:<tag>@<block>/row/<i>`).

| Module        | What it does                                                                                                                                                                                                                                                                | Exports at                        |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `zip.ts`      | open, read, write and list parts; `slideParts`; media stored, XML deflated; `ENTRY_DATE`                                                                                                                                                                                    | `:9-40`                           |
| `clean.ts`    | the repair risk strip (`kern="0"`, empty `extLst`, the content type overrides, `image/jpg`, DOS epoch dates), `setAppTitles`, `mediaParts`                                                                                                                                  | `:17-94`                          |
| `kern.ts`     | `stripKern`, `countKernZero`                                                                                                                                                                                                                                                | `:7-12`                           |
| `groups.ts`   | `groupShapes`: the row group and the user group `g:<tag>` as `p:grpSp`, one level of nesting (a row group inside a user group); the regex matches `p:sp`, `p:pic`, `p:graphicFrame`, `p:cxnSp`                                                                            | `:13-211`                         |
| `shapes.ts`   | `writeAdjustValues` (`avLst`), `writeColumns` (`numCol`, `spcCol`), `toConnector` (`p:cxnSp` with `a:stCxn` and `a:endCxn`), `writeAltText`                                                                                                                                | `:41-163`                         |
| `titles.ts`   | `setSlideName` (`p:cSld name`), `addHiddenTitle` (the hidden title placeholder)                                                                                                                                                                                             | `:35-80`                          |
| `fonts.ts`    | EOT wrapping and `embedFonts` (`ppt/fonts/fontN.fntdata`, `p:embeddedFontLst`), off by default                                                                                                                                                                              | `:86-231`                         |
| `geometry.ts` | `readGeometry`, `readAttributes`, `readPageSize` against the 12,192,000 by 6,858,000 EMU page                                                                                                                                                                               | `:23-108`                         |
| `validate.ts` | `validatePackage`: content types, overrides, relationships, the root rels                                                                                                                                                                                                   | `:58`                             |

A `p:transition` element on a slide part, a `p:timing` tree for animations, an `a:audioFile` or
`a:videoFile` relationship on a picture, or an OMML `a14:m` block in a text body would be new
modules here, run from `buildPptx` after `groupShapes` (`pptx/build.ts:1-12`), and read back by
`geometry.ts` and `validate.ts`. Perfect stills carry none of them by construction (the page is one
picture and the text is invisible).

### 5.4 PDF, print, text and the standalone

The print document is one 960 by 540 pt page per slide at `PRINT_SCALE` 0.8 with the frame, the
wordmark and the counter (`packages/render/src/print.ts:24-38, 84`); the print route offers
"1 slide without notes" and "1 slide with notes" and lists the handouts of 2, 3, 4, 6 and 9 per
page as disabled rows with `HANDOUT_STUB` "Handouts need a page layout the renderer does not have"
(`apps/studio/src/routes/print.$deckId.tsx:42, 84-94`). The PDF export prints that document through
Chromium (`pdf/build.ts:1-27`). `export.text` writes one block of paragraphs per slide, cells joined
by tabs, notes when asked (`actions.ts:2429-2431`). `build.run` writes the single file HTML deck
with fonts and assets inlined and a size budget (`:2460-2462`).

### 5.5 The hosted export

Hosted, every `POST /api/export/:deckId` runs synchronously inside the function under
`SYNC_EXPORT_TIMEOUT_MS` 780 s (`docs/hosting-chromium.md:285-288`, recorded); a deck longer than
the batch size runs as per slide batches with a merge without a browser (`batch/plan.ts:1-9`); the
render worker (`apps/render-worker/`) runs render, sheet, export, verify and measure jobs one at a
time (`queue.ts:12`) in the function's process, in Docker, or over HTTP (`server.ts:1-17`), and the
export job's flags are `export.run`'s fields (`jobs/export.ts:1-10`).

## 6. Import

### 6.1 The importer today

`packages/import` imports the Prototemplate GT deck: `importDeck` parses `parts/head.html` to
confirm the theme, every `slides/NN-*.html` with parse5, the sections from `parts/tail.html`, the
provenance from `shots/OPENERS.md` and `shots/DETAILS.md`, and writes `decks/<id>/` with
`deck.json`, one slide per file, the assets with light and dark twins, `import-ids.json` and
`import-report.json` (`import-deck.ts:1-5, 69`). The modules are `map.ts` (the kind from the
section classes, the layout from the `.in` child, the escape fallback; `:1-3`), `map-blocks.ts`,
`assets.ts`, `provenance.ts`, `sections.ts`, `ids.ts`, `css.ts`, `text.ts`, `dom.ts`, `write.ts`,
`composite.ts`, `images.ts`, `map-context.ts`; the package depends on `@turboslide/schema`,
`@turboslide/theme` and `parse5` alone (`package.json`). Check steps 7 and 8 assert 85 slides, 8
sections and 0 html blocks from that import (`scripts/check.mjs:159-165`). The `import.run` action
is that importer; `slide.import` copies slides from another deck of this studio or from a bundle
(`dialogs/ImportSlides.tsx:1-5`).

### 6.2 The PPTX refusals and the bundle path

`IMPORT_PPTX` reads "PowerPoint import is not available in Turboslide yet. Import a Turboslide
bundle (.zip), or open the file in Google Slides and paste the text" (`packages/chrome/src/menus/strings.ts:852-854`);
File > Open's Upload tab (`dialogs/Open.tsx:67-72`) and Import slides' Upload tab
(`dialogs/ImportSlides.tsx:182-184`) show it for a `.pptx` name and accept `.zip` only
(`:171`, `:176`). The bundle is a plain zip with `manifest.json` (`bundleVersion`, `deckId`,
`title`, `revision`, `packedAt`, digests) and `decks/<id>/...` (`docs/deck-transfer.md`, section 1);
`POST /api/decks/bundle` takes a raw zip, multipart or a Blob URL at 200 MB and validates every
digest and image signature before a write (`apps/studio/src/server/bundle-core.ts:265`;
`packages/store/src/unpack.ts`). `jszip` 3.10.2 is in the catalog (`pnpm-workspace.yaml`) and the
export's `ooxml/zip.ts` already reads packages with it; the OOXML reader of a PPTX import
(`p:sp`, `p:pic`, `a:tbl`, `c:chart`, the notes) has no module yet, and its residual record has a
home in `ext.import` (`ext.ts:8-17`). The theme import (Import theme) has no surface at all: the
theme is one CSS file, section 7.

## 7. The theme

### 7.1 The package

`packages/theme/` at `d5d7f07`: `assets/sprite.svg` and `assets/sprite-ids.json` (70 ids: the
Heroicons 20 solid set plus `gt-mark`), `scripts/add-icon.ts` and `build-sprite.ts`, `src/copy.ts`
(the proper nouns and copy rules), `src/css.ts`, `src/gt-ink-paper/sheet.css` (880 lines) and
`stage.css` (71 lines), `src/sprite.ts` (generated), `src/theme.ts`, `src/tokens.ts`. `THEME_ID`
is `gt-ink-paper`, the root class `ts-sheet`, the attribute `data-theme` (`theme.ts:7-11`);
`sheetCss()` and `stageCss()` read the files for Node callers (`:20-30`).

`tokens.ts` is the theme as data, pinned to `sheet.css` by `tokens.test.ts`:

| Constant                               | Value                                                                                                                                | Line      |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| `TOKEN_NAMES`                          | paper, ink, ink-2, titanium, hair, hair-soft, plate, cross, edge, thumb                                                              | `:12-23`  |
| `TOKENS.light` and `.dark`             | paper `#ffffff` and `#070707`, ink `#070707` and `#f2f2f0`, ink-2, titanium `#8a8f98`, the five alphas                               | `:26-52`  |
| `SEMANTIC`                             | ok `#12a37a`, warn `#f0a020`, no `#e5484d`, info `#2f5ce0`                                                                           | `:54`     |
| `PANEL`, `SWATCH_PLATES`, `LOGO_PLATE` | the code panel, the swatch plates, the logo plate fixed colours                                                                      | `:57-68`  |
| `SHEET`                                | 1600 by 900                                                                                                                          | `:129`    |
| `RAIL`, `INSET`, `PAD`                 | 56; 57; 72 by 80                                                                                                                     | `:131-135` |
| `CONTENT`, `CONTENT_ORIGIN`            | 1326 by 642 at 137, 129                                                                                                              | `:137-138` |
| `CROSS`                                | size 11, offset 51                                                                                                                   | `:140`    |
| `WORDMARK`                             | left 72, bottom 18, height 18                                                                                                        | `:142`    |
| `COUNTER`                              | right 72, bottom 22, font 13                                                                                                         | `:143`    |
| `CHIPS`                                | the plate chips                                                                                                                      | `:145`    |
| `COLUMN_GAP`, `COLUMNS`                | 72; the 5/7, 4/8, 1/1 widths                                                                                                         | `:153-154` |
| `LADDER`                               | the type ladder steps with weight, tracking, leading                                                                                 | `:184`    |
| `DISPLAY`, `WEIGHT_CAP`, `FLOOR`       | weight 500, tracking -0.025em, `'cv11', 'ss01'`; 500; 15                                                                             | `:214-219` |
| `PLATES`, `MOTION`, `FONTS`, `MARK`    | the plate boxes; cut 140 ms; the Inter faces; the mark geometry                                                                      | `:231-252` |

Every one of these is what Slide > Edit theme and Slide > Change theme would make editable or
swap; today they are constants and CSS, and `Deck.theme` accepts one id (section 1.1).

### 7.2 The frame parts

`packages/render/src/stage.ts` emits the frame (`.frame` with `.rule.top`, `.rule.bottom` and the
four `.cross` spans; `FRAME_HTML` `:7-9`), the wordmark (the mark at 28 by 18 in titanium,
`WORDMARK_HTML` `:11-13`) and the counter (`counterText`, `:16`); a slide never draws them.
`sheet.css` styles them under `.ts-sheet .frame` (`:57-115`), `.ts-sheet .counter` (`:116`) and
`.ts-sheet .wordmark` (`:126-136`); the slide's own box is `.ts-sheet .slide > .in` (`:137`). The
counter text per slide is `data-counter` on the slide root, empty when hidden by
`defaults.counter` (`packages/render/src/slide.ts:27-32`). The chips of a picture kind are drawn by
the slide over the covering picture (`render/blocks/picture.ts:11-12`).

### 7.3 The round four brand plan

At `d5d7f07` there is no `packages/theme/brand/` folder and no `src/brand.ts`; the working tree at
the time of reading had `dist/` only under the theme package. SPEC-4 puts the identity there:
`packages/theme/brand/` (`mark.svg`, `mark-small.svg`, `icon-tile.svg`, `wordmark.svg`,
`wordmark-outlines.svg`, `lockup-stacked.svg`, `og-template.html`, `hero.recipe.json`,
`mark-geometry.json`, `facts.json`, `site.ts`, `previews/`) and `packages/theme/src/brand.ts`
(`BRAND_TOKENS`, `markBits`, `markPath`, `cellRects`, `markSvg`, `markBlocks`), mirrored by
`packages/chrome/src/brand.css`, built by `scripts/build-brand.ts`, exported as `./brand` and
`./brand/site` (`docs/gslides-parity/SPEC-4.md:11, 27-31, 119, 133`; `MILESTONES-4.md:42, 59`).
The brand tokens are `--ts-` tokens beside the chrome's `--pt-` tokens and the sheet's unprefixed
tokens (`sheet.css:4`).

## 8. Materials and effects

### 8.1 Materials

`packages/materials/src/catalog.ts` binds 17 Paper Shaders materials (`MATERIALS`, `:145-524`):
`paper:liquid-metal`, `gem-smoke`, `smoke-ring`, `god-rays`, `mesh-gradient`, `simplex-noise`,
`swirl`, `spiral`, `grain-gradient`, `dithering`, `static-radial-gradient`, `neuro-noise`,
`metaballs`, `waves`, `dot-grid`, `perlin-noise`, `static-mesh-gradient`; each with its fragment
shader name, sizing family, textures, palette roles and one spec per `u_*` uniform (`:1-8`);
`listMaterials` (`:548`) answers `material.list`. `presets.ts` holds `GT_PALETTE` (`:13`), the
brand presets `ink-paper`, `paper-ink`, `brand-blue` (`:52-74`) and `EXTRA_PRESETS` per material
(`:117`). `capture.ts` freezes a frame at an anchor into an asset with `source.kind 'material'`;
`mount.ts` plays the live shader in the editor; `recipe-key.ts` names the recipe. The package
depends on `@paper-design/shaders` 0.0.78 (the catalog).

### 8.2 Effects and the native crate

`packages/effects/src/`: `pipeline.ts` is the two tone screen (gray or one channel, crop, invert,
minimum filter, blur, cover fit to 800 by 450 through Lanczos3, unsharp, autocontrast 0.5, black
and white points and gamma through the tone LUT, the 8 by 8 Bayer screen; `:1-13`, `TWO_TONE_SIZE`
`:22`); `dither.ts` is the block level dither in five stages (tone base, the LUT, the threshold
against bayer8, bayer4, blue64 or random, polarity, paint; `:1-30`, `thresholdAt` `:107`);
`bayer.ts`, `blue64.ts`, `tone.ts`, `filters.ts`, `resample.ts`, `ramp.ts`, `metrics.ts` (the
plate clearance), `diff.ts`, `pixelmatch.ts`, `dssim.ts`, `png1.ts` (the 1 bit encoder), `io.ts`,
`dither-io.ts`, `image.ts`, `backend.ts` and `select.ts` (native, then wasm, then TypeScript;
`TURBOSLIDE_EFFECTS_BACKEND` pins one; `:1-7`). The studio's worker is
`apps/studio/src/workers/dither.worker.ts`.

`crates/turboslide-native/src/lib.rs` mirrors the two tone pipeline, the 1 bit encoder and the
diffs (`bayer`, `diff`, `dssim`, `filters`, `image`, `jsmath`, `metrics`, `params`, `png1`,
`resample`, `tone`; `:19-29`; `two_tone_screen` `:82`, `two_tone` `:126`) behind `bind_napi.rs`
and `bind_wasm.rs`; the loader is `packages/native/` (`src/node.ts`, `wasm.ts`, `platform.ts`,
`types.ts`; the README). The crate carries the 8 by 8 Bayer screen alone: the block dither's
`bayer4`, `blue64`, `random`, `tone`, `steps` and `strength` are TypeScript only (`SPEC-4.md:477`
names them as round five work). No error diffusion or halftone exists in either language.

## 9. The menu model

### 9.1 Counts and shape

`packages/chrome/src/menus/model.ts` (3,182 lines) is the one table the menu bar, the context
menus, Search the menus, the shortcuts dialog and the parity audit read (`:8-13`). `MenuStatus` is
`now`, `later` or `omit` (`:45`); the rows are built by `now()` (`:485`), `later()` (`:489`) and
`omit()` (`:493`): 232 Now, 21 Later, 38 Omit. The ten menus are `MenuId` file, edit, view, insert,
format, slide, arrange, tools, extensions, help (`:436-446`). Every row carries a role predicate
(`when`) from round three; a Later row is present in Google's position, disabled, with the
tooltip "Not available in Turboslide yet" plus its clause (`:14-16`). The Insert menu's Now rows
today: image upload and by URL, text box, the shape categories, the four chart kinds, diagram,
word art, the seven line kinds, special characters, link, comment, new slide, slide numbers, icon,
material.

### 9.2 The Later rows

| Line   | Id                                                | Label                                    | Clause                                                                                | Round five scope |
| ------ | ------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------- | ---------------- |
| `:687` | `title.presence.joinChat`                         | Join chat                                | Leave a comment on the slide instead                                                  | E (chat)         |
| `:724` | `title.slideshow.presentOnAnotherScreen`          | Present on another screen                | Presenter view opens a second window you can drag to another screen                   | A (present)      |
| `:832` | `file.email.collaborators`                        | Email collaborators                      | The invitation carries your message                                                   | Kevin (Resend)   |
| `:841` | `file.download.odp`                               | ODP Document (.odp)                      | Only PowerPoint, PDF, text, pictures and the web page download                        | E (downloads)    |
| `:858` | `file.download.svg`                               | Scalable Vector Graphics (.svg)          | the same                                                                              | E (downloads)    |
| `:901` | `file.versionHistory.deleteOlder`                 | Delete this and older versions           | Named versions are kept; older records thin out after 30 days                         | SPEC-3 17 (`version.delete`) |
| `:909` | `file.versionHistory.deleteHistory`               | Delete history                           | the same                                                                              | the same         |
| `:927` | `file.pageSetup`                                  | Page setup                               | The GT theme is 16:9 at 1600 by 900                                                   | E (page setup)   |
| `:1067` | `view.guides.edit`                               | Edit guides                              | Drag a guide to move it and right-click it to delete it                               | E (remaining rows) |
| `:1204` | `insert.audio`                                   | Audio                                    | Link to a recording instead                                                           | B (media)        |
| `:1205` | `insert.video`                                   | Video                                    | Link to a recording instead                                                           | B (media)        |
| `:1352` | `insert.templates`                               | Templates                                | Start from the GT brand deck on the home page                                         | C (templates)    |
| `:1353` | `insert.buildingBlocks`                          | Building blocks                          | the same                                                                              | C (templates)    |
| `:1491` | `format.alignIndent.indentationOptions`          | Indentation options                      | Set the indent under Text fitting                                                     | E (remaining rows) |
| `:1558` | `format.bulletsNumbering.listOptions.restart`    | Restart numbering                        | Numbering starts at 1                                                                 | E (remaining rows) |
| `:1563` | `format.bulletsNumbering.listOptions.prefixSuffix` | Edit prefix and suffix                 | Numbering starts at 1                                                                 | E (remaining rows) |
| `:1832` | `slide.transition`                               | Transition                               | The GT theme presents still slides                                                    | A (motion)       |
| `:1834` | `slide.editTheme`                                | Edit theme                               | The footer mark, the slide counter and the rails belong to the GT theme               | E (Edit theme)   |
| `:2026` | `tools.spelling.spellCheck`                      | Spell check                              | Your browser underlines misspellings and offers suggestions on right-click            | E (spelling)     |
| `:2052` | `tools.preferences`                              | Preferences                              | Text fitting is set per text box in Format options; the ruler reads inches            | E (preferences)  |
| `:2086` | `tools.activityDashboard.viewers`                | Viewers                                  | Turboslide keeps no record of who viewed a presentation                               | SPEC-3 17        |

The clause constants are `CHAT_LATER`, `EMAIL_COLLABORATORS_LATER`, `DELETE_VERSIONS_LATER`,
`VIEWERS_TAB_LATER`, `STILL_SLIDES`, `NUMBERING_STARTS`, `NO_MEDIA`, `START_FROM_GT`,
`DOWNLOAD_FORMATS`, `GUIDES_BY_HAND` (`:536-547`); `menu-model.test.ts` asserts each clause and the
parity audit checks the disabled state. Flipping a row to Now means replacing `later(` with `now(`
and an effect (`action`, `dialog`, `panel`, `route`, `toggle` or `client`; `:521-529`).

### 9.3 The Omit rows

| Line    | Id                                        | Label                              | Reason                                                                                  | Round five reading                                  |
| ------- | ----------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `:656`  | `title.star`                              | Star                               | Starring is a per person list; the home page lists every presentation                   | a standalone product could offer it (an account list) |
| `:661`  | `title.move`                              | Move                               | No folders                                                                              | stays omitted (no Drive)                            |
| `:708`  | `title.meet`                              | Meet                               | A Google service                                                                        | stays omitted                                       |
| `:709`  | `title.record`                            | Record                             | A Google service                                                                        | stays omitted                                       |
| `:730`  | `title.slideshow.displayOptions`          | Presentation display options       |                                                                                         | Google's screen picker; a standalone can offer the browser's window placement |
| `:778`  | `title.gemini`                            | Ask Gemini                         | A Google service                                                                        | stays omitted                                       |
| `:830`  | `file.email.thisFile`                     | Email this file                    | Share sends the link with your message                                                  | Kevin (Resend)                                      |
| `:876`  | `file.move`                               | Move                               | No folders                                                                              | stays omitted                                       |
| `:877`  | `file.addShortcut`                        | Add shortcut to Drive              | No Drive                                                                                | stays omitted                                       |
| `:915`  | `file.approvals`                          | Approvals                          | Workspace only                                                                          | stays omitted                                       |
| `:916`  | `file.offline`                            | Make available offline             | Present mode keeps working after load without the network                               | SPEC-3 17 (offline pinning)                         |
| `:922`  | `file.language`                           | Language                           | One face and English copy rules; spelling follows the browser                           | E (spelling and preferences decide)                 |
| `:1002` | `view.motion`                             | Motion                             | Section 0.5; the one Transition stub sits in Google's three Transition positions        | A (motion): flips to Now                            |
| `:1007` | `view.themeBuilder`                       | Theme builder                      | The GT theme is edited in the repository; Slide > Edit theme is the Later stub          | E (Edit theme): flips with it                       |
| `:1183` | `insert.image.stockWeb`                   | Stock & web                        | Google services and the licensing hazard R07 names                                      | stays omitted                                       |
| `:1188` | `insert.image.drivePhotos`                | Drive & Photos                     | A Google service                                                                        | stays omitted                                       |
| `:1189` | `insert.image.camera`                     | Camera                             | A Google service                                                                        | a standalone could offer the browser camera; the brief's Omit reading stands unless the designers argue it |
| `:1274` | `insert.chart.fromSheets`                 | From Sheets                        | A Google service                                                                        | stays omitted                                       |
| `:1325` | `insert.animation`                        | Animation                          | Section 0.5                                                                             | A (motion): flips to Now                            |
| `:1351` | `insert.placeholder`                      | Placeholder                        | Theme builder only                                                                      | E (Edit theme): flips with the theme editor         |
| `:1354` | `insert.speakerSpotlight`                 | Speaker spotlight                  | Meet only                                                                               | stays omitted                                       |
| `:2034` | `tools.spelling.personalDictionary`       | Personal dictionary                | The browser's dictionary applies                                                        | E (spelling): flips with the spell check card       |
| `:2042` | `tools.explore`                           | Explore                            | Retired by Google in 2024 (R02 8.6)                                                     | E: the brief lists Explore; sibling report 03 decides |
| `:2043` | `tools.linkedObjects`                     | Linked objects                     | No linked sources                                                                       | stays omitted                                       |
| `:2044` | `tools.dictionary`                        | Dictionary                         | A Google service                                                                        | E: the brief lists Dictionary                       |
| `:2045` | `tools.qaHistory`                         | Q&A history                        | A Google service                                                                        | stays omitted                                       |
| `:2046` | `tools.dictateNotes`                      | Dictate speaker notes              | A Google service                                                                        | E (voice type): browser speech recognition          |
| `:2066` | `tools.accessibilitySettings.screenReader` | Turn on screen reader support     | The browser's screen reader works on the DOM                                            | E (Accessibility menu)                              |
| `:2071` | `tools.accessibilitySettings.braille`     | Turn on braille support            | the same                                                                                | E (Accessibility menu)                              |
| `:2159` | `extensions.addOns.get`                   | Get add-ons                        | No marketplace                                                                          | stays omitted                                       |
| `:2160` | `extensions.addOns.manage`                | Manage add-ons                     | No marketplace                                                                          | stays omitted                                       |
| `:2164` | `extensions.installedAddOns`              | Installed add-ons                  | No marketplace                                                                          | stays omitted                                       |
| `:2167` | `extensions.appsScript`                   | Apps Script                        | A Google service                                                                        | stays omitted                                       |
| `:2172` | `extensions.appSheet`                     | AppSheet                           | A Google service                                                                        | stays omitted                                       |
| `:2205` | `help.training`                           | Training                           | No training site                                                                        | E: Turboslide pages                                 |
| `:2206` | `help.updates`                            | Updates                            | No release notes page                                                                   | E: Turboslide pages                                 |
| `:2214` | `help.privacyPolicy`                      | Privacy Policy                     | No policy page                                                                          | Kevin (a policy text)                               |
| `:2215` | `help.termsOfService`                     | Terms of Service                   | No terms page                                                                           | Kevin (a terms text)                                |

## 10. The check chain

`scripts/check.mjs:143-260` at `d5d7f07` runs 28 steps in order; `--list` prints them and
`--only`, `--from`, `--strict`, `--keep-server` select and adjust (`:17-22`). The steps needing the
studio start the dev server on 4321 with `SERVER_ENV` (the memory realtime tier, a checkout auth
database, captured mail, a fake download secret, `TURBOSLIDE_EXPORT_BATCH` 3; `:96-104`).

| Step  | Command (abridged)                                                                                                                                       | Needs         |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 1     | `pnpm install --frozen-lockfile`                                                                                                                         |               |
| 2     | `tsr generate`                                                                                                                                           |               |
| 3     | the generated files are tracked, `pnpm generate:contracts`, `git diff --exit-code` on them                                                               |               |
| 4     | `tsc -b`                                                                                                                                                 |               |
| 5     | `pnpm test`                                                                                                                                              |               |
| 6     | `pnpm build`, `check-client-bundle.mjs`, `check.mjs --greps` (the `innerHTML` and `overwrite` allowlists)                                                |               |
| 7, 8  | import the Prototemplate deck; assert 85 slides, 8 sections, 0 html blocks                                                                               | prototemplate |
| 9     | `turboslide validate decks/gt-brand`                                                                                                                     |               |
| 10, 11 | render all slides in both themes; assert 170 records with no page errors                                                                                |               |
| 12    | `compare-to-shoot.mjs` at 0.5 percent                                                                                                                    | prototemplate |
| 13, 14 | the contact sheets; 85 cells each                                                                                                                       |               |
| 15    | `turboslide lint all --json`                                                                                                                             |               |
| 16    | `turboslide build --budget 16`                                                                                                                           |               |
| 17    | `viewer.spec.ts`                                                                                                                                         | server        |
| 18    | `lint --chrome` on `/deck`, `/edit`, `/new`, `/decks` at 1440, 1280, 390 in both themes                                                                  | server        |
| 19    | `pnpm format:check`                                                                                                                                      |               |
| 20    | the parity audit (`scripts/gslides-parity-audit.mjs`) or the menu model tests                                                                            | server        |
| 21    | fifteen e2e specs (ten tasks, text editing, filmstrip, home, present, landing, actions, deck transfer, canvas, objects, text styles, tables, charts, hygiene, export batch) | server |
| 22    | the fixture deck exported in both modes, `export check`, the flatten report perfect                                                                      |               |
| 23    | `turboslide fonts build --check`                                                                                                                         | python        |
| 24    | `canvas-fidelity.mjs` at 0.5 percent                                                                                                                     |               |
| 25    | the container verification                                                                                                                               | docker        |
| 26    | the eight round three specs (realtime, presence, comments, share, versions by author, accounts, dither, security; `:81-90`)                              | server        |
| 27    | `layout-shift-audit.mjs` against `vite preview` on 4344                                                                                                  | preview       |
| 28    | `check.mjs --audit` (`pnpm audit --prod --audit-level=high` with `scripts/audit-allow.json`)                                                             |               |

SPEC-4 6.1 (`docs/gslides-parity/SPEC-4.md:430-442`) adds step 29 (`scripts/build-brand.ts
--check`, with the native rebuild and diff when cargo is present), step 30 (`[vercel]`,
`check-vercel-output.mjs` after a Vercel build) and step 31 (`needs: 'node-server'`, the perf
budget against the node-server build), and grows steps 5, 6, 18 and 26. Round five's steps would
follow as 32 and up. The e2e folder holds 28 specs and `identity-seed.mts`
(`apps/studio/e2e/`).

## 11. Hosting facts

### 11.1 Backends and tiers

| Concern     | Selection                                                                                                                              | Degraded state                                                                                                                                                                         | Where                                                   |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| The store   | `file`, `tmp`, `blob` from `VERCEL` and `BLOB_READ_WRITE_TOKEN`; `TURBOSLIDE_STORE` forces                                              | `tmp`: edits persist on the instance only; the editor shows a banner                                                                                                                   | `docs/hosting.md:10-31` (recorded)                      |
| Realtime    | `memory`, `redis` (`REDIS_URL`), `blob` (hosted without Redis); `TURBOSLIDE_REALTIME` forces                                            | `blob`: every batch is a store write, `head('deck.json')` polled, presence per instance, the title row's notice `BLOB_TIER_NOTICE`                                                     | `packages/realtime/src/select.ts:1-15`; `hosting.md:594-599` |
| Quotas      | a windowed quota counts in the bound backend; Redis or the Upstash pair share counters                                                  | without either, one caller's requests spread across instances and no windowed quota holds; the WAF rules carry the limits; logged once per instance                                    | `ratelimit.ts:20-28, 455-470`                           |
| Chromium    | `resolveExecutable`: env, `chromium-1217`, Playwright, `sparticuz` inside a function                                                   | `/tmp` 525 MB with about 205 MB for the inflated browser; a core file from a crash fills it                                                                                             | `packages/headless/src/launch.ts:35-89`; `hosting-chromium.md:173-185` |
| Effects     | native, then wasm, then TypeScript                                                                                                     | TypeScript is 52 ms against 23 ms wasm per screen (recorded)                                                                                                                           | `packages/effects/src/select.ts:1-7`; `SPEC-4.md:333`   |
| Kill switches | twelve flags read per request with a 5 s cache: realtime, presence, comments, invites, email, exports, uploads, renderThumbs, materialize, htmlBlocks, signup, readOnly | when the reader fails, `realtime` reads off and every other flag on                                                                                                                    | `apps/studio/src/server/flags.ts:1-50`                  |
| The WAF     | `firewall/rules.json`: 23 rules (per IP limits on server functions, renders, exports, bundles, agent actions, MCP, sign in, assets, stream opens, operations, presence, comment writes, share exchange, deck pages, upload tokens, avatars, WebSocket upgrades (r19, "round four"), notifications, plus a bypass for the CLI and MCP clients) | log mode from the ship step; enforce is Kevin's date                                                                                                                                   | `firewall/rules.json`; `hosting.md:726-727`             |

### 11.2 Function limits

| Limit                                            | Value                                                   | Where                                                                          |
| ------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| The base function                                | `maxDuration` 300 s                                     | `apps/studio/vite.deploy.config.ts:128`                                        |
| `/api/export/**`, `/api/render/**`, `/api/x/export/**`, `/api/x/render/**`, `/api/decks/bundle`, `/api/decks/**/bundle`, `/_serverFn/**` | `HEAVY`: `maxDuration` 800 s, `memory` 3009 MB | `:88, 153-160`                                                                 |
| The synchronous export budget                    | 780 s                                                   | `hosting-chromium.md:285-288` (recorded)                                       |
| A response body                                  | 4,718,592 bytes; over it, 302 to the stored copy or 413 | `:261-265`                                                                     |
| A function directory                             | about 150 MB uncompressed with the browser; 250 MB cap  | `:347-348`; `hosting.md:295-297`                                               |
| `/tmp`                                           | 525 MB                                                  | `hosting-chromium.md:173`                                                      |
| Blob write rate                                  | about 15 one slide commits per second across a deployment | `hosting.md:589-590`                                                          |
| Blob `list()`                                    | lags `head()` and `get()`                               | `hosting.md:359-365`                                                           |
| The ops stream                                   | 64 entries and 256 kB per batch; 10,000 entries retained | `hosting.md:616-617, 603`                                                     |

### 11.3 Environment variables the designers may need

`REDIS_URL`, `TURBOSLIDE_REALTIME`, `TURBOSLIDE_BLOB_PRIVATE_TOKEN`, `TURBOSLIDE_BLOB_PRIVATE_DIR`,
`DATABASE_URL`, `BETTER_AUTH_SECRET`, `TURBOSLIDE_SESSION_SECRET`, `RESEND_API_KEY`,
`TURBOSLIDE_MAIL_FROM`, `TURBOSLIDE_MAIL`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`,
`TURBOSLIDE_ADMIN_EMAILS`, `TURBOSLIDE_DOWNLOAD_SECRET`, `TURBOSLIDE_AUTH_DB`,
`TURBOSLIDE_AUTHORIZE`, `TURBOSLIDE_MISSING_RECORD`, `TURBOSLIDE_TRUST_PROXY`,
`TURBOSLIDE_LOCAL_OPEN`, `TURBOSLIDE_LOCAL_TOKEN`, `TURBOSLIDE_AUTH_RATE_LIMIT`,
`TURBOSLIDE_PASSKEY_RPID` (`hosting.md:740-760`); `TURBOSLIDE_TOKEN`, `TURBOSLIDE_STORE`,
`TURBOSLIDE_OVERLAY_DIR`, `BLOB_READ_WRITE_TOKEN` (`:10-31, 274`); `TURBOSLIDE_EXPORT_BATCH`
(`batch/plan.ts:43`); `TURBOSLIDE_EFFECTS_BACKEND` (`effects/select.ts:3`);
`TURBOSLIDE_WORKER_TOKEN` and `TURBOSLIDE_WORKER_URL` (`render-worker/src/server.ts:15`;
`SPEC-4.md:474`). The items that need Kevin (a worker host, Redis, Postgres, Resend, the domain)
are the runbook of `hosting.md:709-738`.

## 12. The deferred lists

SPEC-2 section 12 (`docs/gslides-parity/SPEC-2.md:777-806`), SPEC-3 section 17 (`SPEC-3.md:1240-1253`)
and SPEC-4 section 7 (`SPEC-4.md:469-482`), each item with the round five scope letter or the
reason it stays on Kevin's list:

| Item                                                                   | Listed in            | Design note recorded there                                              | Round five |
| ---------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------- | ---------- |
| Transition, Motion, Animation, Animate                                 | SPEC-2 12, SPEC-3 17 | `SlideBase.transition`, `Block.animation`; the present runtime          | A          |
| Audio, Video                                                           | SPEC-2 12, SPEC-3 17 | a `media` block with an asset kind                                      | B          |
| Templates, Building blocks                                             | SPEC-2 12            | the home page strip and Insert > Templates over `deck.list`             | C          |
| PPTX import                                                            | SPEC-2 12, SPEC-3 17 | `import.pptx` over jszip                                                | D          |
| Page setup                                                             | SPEC-2 12            | none                                                                    | E          |
| Edit guides dialog                                                     | SPEC-2 12            | the dialog over `Deck.guides`                                           | E          |
| Handouts 2, 3, 4, 6, 9                                                 | SPEC-2 12, SPEC-3 17 | `renderPrintDocument` layouts                                           | E          |
| ODP, SVG                                                               | SPEC-2 12            | none                                                                    | E          |
| Preferences (autofit defaults, the ruler's unit)                       | SPEC-2 12, SPEC-3 17 | a per browser settings dialog; `units`                                  | E          |
| Reflection, Recolor                                                    | SPEC-2 12, SPEC-3 17 | `reflection`, `recolor` fields; a CSS reflection is a second raster     | F          |
| Spell check card                                                       | SPEC-2 12            | none                                                                    | E          |
| Restart numbering, Edit prefix and suffix                              | SPEC-2 12            | `plain.start`, `plain.prefix`                                           | E          |
| Indentation options and the ruler's indent markers                     | SPEC-2 12            | `typography.firstLine`, `hanging`; `Rulers.tsx`                         | E          |
| Nested groups                                                          | SPEC-2 12, SPEC-3 17 | a group tree                                                            | F          |
| Theme elements as objects (Edit theme)                                 | SPEC-2 12, SPEC-3 17 | the frame, wordmark, counter and chips editable (0.75, listed for Kevin at 0.106) | E |
| Edit points, Change shape on a path                                    | SPEC-2 12            | point handles                                                           | E (remaining rows) |
| The cell border selection chord                                        | SPEC-2 12            | the per edge picker                                                     | E (remaining rows) |
| The special characters drawing box                                     | SPEC-2 12            | none                                                                    | E (remaining rows) |
| Present on another screen                                              | SPEC-2 12            | none                                                                    | A          |
| Auto-play, the pen, downloads inside the show                          | SPEC-2 12            | as round one                                                            | A          |
| Chat inside the file (Join chat)                                       | SPEC-3 17            | the same logging and abuse limits as comments                           | E          |
| Audience Q&A, Approvals, Meet, Record                                  | SPEC-3 17            | Google services or Enterprise                                           | omitted    |
| Viewers tab                                                            | SPEC-3 17            | Turboslide records no views                                             | stays Later |
| `version.delete` with re-authentication                                | SPEC-3 17            | a confirm                                                               | E (remaining rows) |
| `share.emailCollaborators`, organizations, domain link modes, admin console, inbox snooze, Postgres comment index | SPEC-3 17 | account infrastructure                                        | Kevin      |
| Passkeys, a Blob backed auth adapter                                   | SPEC-3 17            | the production domain                                                   | Kevin      |
| Error diffusion and halftone families, a GPU dither preview, Add picture to theme | SPEC-3 17 | 06 3, 4.8, 4.9                                                          | F          |
| PowerPoint's modern threaded comment parts                             | SPEC-3 17            | once verified against a saved file                                      | D (the reader can read the classic parts) |
| Offline pinning, a suggest a change mode                               | SPEC-3 17            |                                                                         | not in scope |
| The WebSocket transport behind `TURBOSLIDE_REALTIME_WS`; multi region  | SPEC-3 17            | once TanStack Start's dev server story is settled; WAF rule r19 exists  | F (the flag) |
| A per Text CRDT                                                        | SPEC-3 17            | if two people typing in one box proves common                           | not in scope |
| Chromium out of the secret holding function; a long lived worker host  | SPEC-3 17, SPEC-4 7  | a second project or the Docker worker; Fly or Railway over `TURBOSLIDE_WORKER_URL` | Kevin |
| The live monochrome hero                                               | SPEC-4 7             | after the shader split; `/home` under 600 KB                            | F          |
| The per deck card `/og/deck/:deckId.png`                               | SPEC-4 7             | `s-maxage` per revision, the private store's URL rules                  | F          |
| A 320 px twin variant for the filmstrip clones                         | SPEC-4 7             | a 200 px clone decodes 1600 px twins today                              | F          |
| The deck index `decks/index.json` on the blob tier                     | SPEC-4 7             | past about 50 decks                                                     | F          |
| Field INP through `web-vitals/attribution`; Lighthouse CI              | SPEC-4 7             | `/api/vitals`                                                           | F          |
| The cold first byte and function directory size gates                  | SPEC-4 7             | reported in round four                                                  | F          |
| The `ditherPicture` patterns in the crate                              | SPEC-4 7             | bayer4, blue64, random, strength                                        | F          |
| Splitting the base function's Chromium package                         | SPEC-4 7             | Nitro's `traceDeps` is one list                                         | Kevin or F |
| A Turboslide branded second sheet theme                                | SPEC-4 7             | SPEC open question 6; recommended against there                         | E (Change theme) |
| React's `<ViewTransition>`                                             | SPEC-4 7             | once the router and React agree                                         | not in scope |

## 13. Where each round five scope area lands today

| Scope | What exists                                                                                                                                                                                                                                                                                                                                                                                                                                      | What does not exist                                                                                                                                                                                                                                                                                                                            | Files to extend                                                                                                                                                                                                                                                                                                                                                              |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A motion | the Slideshow with `onGoto` per move and the key resolver (section 3); `MOTION = { cut: 140 }` as the theme's one duration (`tokens.ts:239`); the standalone runtime's key table; the Later row `slide.transition` (`model.ts:1832`), the Omit rows `view.motion` (`:1002`) and `insert.animation` (`:1325`), the toolbar 17 stub, the `autoPlayStub`; the OOXML post process addressed by object name (section 5.3); `hiddenTitleFor` and `setSlideName` per slide part | a `transition` field on `SlideBase`, an `animation` field on `BlockBase`, a step inside `next`, a `p:transition` or `p:timing` writer, a `state` message for a step, an autoplay timer in the standalone runtime | `deck.ts:115-158` (SlideBase), `blocks.ts:216-222` (BlockBase), `validate.ts:24-49`, `presentKeys.ts:77-116`, `presentModel.ts`, `presentSync.ts:17-35`, `Slideshow.tsx`, `viewer/standalone/runtime.ts`, `export/src/ooxml/` (a new module), `pptx/build.ts:223`, `model.ts:1002, 1325, 1832`, `actions.ts` (new `slide.setTransition`, `block.animate`, `motion.*` ids) |
| B media | `Asset` with `source.kind 'file'` and `putAsset` (sections 1.6, 4.2); `asset.add` from a file, URL or presigned upload; the four image content types and `sniffImage`; the picture object with `position`, `trim`, `mask`, `frame`, `shadow` (`blocks.ts:530`); `pptx/images.ts` for a poster; `RASTER_KINDS` (`render.ts:17`); the Later rows `insert.audio` and `insert.video` (`model.ts:1204-1205`) | a `media` block or `audio` and `video` roles, `audio/*` and `video/*` content types and sniffs, a duration or poster field, a YouTube URL form, playback in the Slideshow and the standalone runtime, `a:audioFile` or `a:videoFile` relationships in the export, a `largestMediaBytes` quota and a `mediaBytes` deck cap | `assets.ts:11-58`, `blocks.ts` (a new block), `catalog.ts:55`, `upload.ts:48-53`, `ratelimit.ts:88-276`, `materials/actions.ts:66-90`, `render/blocks/`, `Slideshow.tsx`, `runtime.ts`, `pptx/images.ts`, a new `ooxml/media.ts`, `model.ts:1204-1205`, `actions.ts` |
| C templates | `DECK_TEMPLATES` gt-brand and blank (`actions.ts:567`); `TemplateRecord` with `archetypes` (`templates.ts:50-77`); the home strip (`decks.index.tsx:611-655`); `LAYOUTS` with `make` (`layouts.ts:245-661`); `slide.import` and `slide.applyLayout`; the Later rows `insert.templates` and `insert.buildingBlocks` (`model.ts:1352-1353`) | a template gallery with categories, a sales starter deck folder, building block entries (agendas, quotes, key statistics, the sidebar), File > New > From template, Insert > Templates over a list | `decks/templates/` (new folders), `templates.ts:41-110`, `actions.ts:567`, `decks.index.tsx:611`, `layouts.ts`, `model.ts:1352-1353`, `chrome/src/slide-templates.ts` |
| D import | `packages/import` for the Prototemplate deck (section 6.1); `ext.import` (`ext.ts:8-17`); `jszip` in the catalog; `ooxml/zip.ts`, `geometry.ts`, `validate.ts` as readers; the bundle route and unpack validation; the two `.pptx` refusals (`Open.tsx:67`, `ImportSlides.tsx:182`); `IMPORT_PPTX` (`strings.ts:852-854`); the home page's Open dialog Upload tab (`.zip` only) | an OOXML reader for `p:sp`, `p:pic`, `a:tbl`, `c:chart`, `p:notesSlide`, a mapping to `text`, `shape`, `picture`, `table`, `chart` blocks with `pos`, a drop report, Import theme, a `.pptx` accept on the Upload tabs, `import.pptx` and `import.theme` actions | a new `packages/import/src/pptx/`, `import-deck.ts:69`, `Open.tsx:67-72, 171`, `ImportSlides.tsx:176-190`, `bundle-core.ts`, `actions.ts` (`import.run` input), `ext.ts` |
| E page and the rest | the sheet constants in six places (summary 3); the print route's disabled handouts (`print.$deckId.tsx:84-94`) and `renderPrintDocument` (`print.ts:84`); `render.slide` png and jpg; the shape `equation` category (`shapes.ts:14`); the theme as data and CSS (section 7); `THEMES` one entry (`deck.ts:24`); `comments.ts` as the model a chat would copy; the browser's spellcheck on `contentEditable`; the Later rows of section 9.2 and the Omit rows the brief names (Dictionary, Explore, Dictate, Accessibility, Training, Updates) | a page size on `Deck`, a handout layout, ODP and SVG writers, a preferences record, an equation block or math run with OMML export, a theme record with editable frame parts, a second theme id, a chat sidecar, a spell check card, a dictionary or voice surface, the two help pages | `render.ts:101-108`, `tokens.ts:129-143`, `deck.ts:24, 71-113, 274`, `canvas.ts:63`, `units.ts`, `masters.ts`, `print.ts:24-38`, `print.$deckId.tsx:84-94`, `export.ts:11`, `theme.ts:7`, `sheet.css:57-136`, `stage.ts:7-16`, `comments.ts`, `model.ts` (the rows), `actions.ts` |
| F deferred engineering | `THUMB_WIDTHS` 160, 320, 640 for thumbnails (`thumbs.ts:48`) while the twins stay 1600 px; `Position.group` as a flat tag (`position.ts:26-28`) and `ooxml/groups.ts` nesting a row group inside a user group; `ShotAdjust` transparency, brightness, contrast (`blocks.ts:499`); the crate's 8 by 8 Bayer (`lib.rs:82`); the four TypeScript patterns (`effects/dither.ts:107`); WAF rule r19 for WebSocket upgrades; `MATERIALS` `paper:liquid-metal` and the `ink-paper` preset for the hero | a twin variant pipeline, a group tree, `reflection` and `recolor` fields, error diffusion and halftone families in both languages, the WebSocket channel, the deck index, the vitals route, Lighthouse CI, the per deck card | `assets.ts:95-109`, `position.ts:15-29`, `canvas.ts`, `freeform.ts:432-470`, `groups.ts:153`, `blocks.ts:497-521`, `blocks/dither.ts:11`, `effects/dither.ts`, `crates/turboslide-native/src/`, `realtime/src/`, `hosted.ts`, `scripts/perf-budget.mjs` (round four) |

## 14. Unverified

1. The working tree began to differ from `d5d7f07` during the reading (`scripts/check.mjs`,
   `packages/theme/package.json`, `packages/theme/tsconfig.json`, `apps/studio/package.json`);
   every line number here is at `d5d7f07` and may not match the round four tree.
2. The counts 153 OpenAPI paths, 146 MCP tools and 156 CLI entries were read from the generated
   files; the split between them and the 169 actions (which actions lack a CLI usage or an MCP
   tool) was not tabulated.
3. The 74 window handlers were counted from the `on<...>(` calls of `edit.$deckId.tsx`; handlers
   registered by other means (the server side window actions through `runDeckAction`, the viewer
   and presenter owners) were read from `agent-actions.ts` and `registry.ts` and not run.
4. The hosting numbers (function sizes, `/tmp` usage, the 780 s budget, the Blob write rate, the
   Blob listing lag, the effects timings) are recorded in `docs/hosting.md`,
   `docs/hosting-chromium.md` and `SPEC-4.md` and were not re-measured.
5. Whether the four `UPLOAD_CONTENT_TYPES` are the only gate on a hosted upload or whether
   `sniffImage` also refuses a non image with a permitted declared type was read from the module
   header (`upload.ts:25-39`) and not traced through `readUpload`.
6. The 135 shape presets were read from the comments of `shapes.ts:2, 187, 197`; the rows were
   not counted one by one.
7. `packages/theme/brand/` and `src/brand.ts` did not exist in the working tree at the time of
   reading; round four may have added them since.
