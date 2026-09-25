# The vector round: shapes drawn from their definitions, icons on the visual rows, SVG pictures

The binding specification of the vector round, written 2026-09-24 against the worktree
`/Users/kevinliu/repos/Turboslide-vector` at `2be923e` (origin/main: ship one of the features round
with its production table). `docs/FEATURES.md` (ship one's editing model, fonts and logo picker),
`docs/PRODUCT.md`, `docs/RETURN.md`, `docs/FOCUS.md` and `docs/gslides-parity/focus/AMENDMENTS.md`
A1 stand under it; where this document is silent they rule. Every claim below cites a file and a
line of the tree at `2be923e`, or one of the two probes of this round:

- Probe (a), `/private/tmp/claude-501/-Users-kevinliu-gt-gt-cloud/293a64b7-8ef6-4b00-b382-682288c84431/scratchpad/vector/pdf-svg-probe.mjs`,
  printed one page through the worktree's `playwright-core` 1.62.1 on Google Chrome for Testing
  147.0.7727.15 (the `chromium-1217` binary `packages/headless/src/launch.ts` 27 prefers) with the
  export's settings (`preferCSSPageSize`, `printBackground`, `scale: 0.8`; `packages/headless/src/pdf.ts`
  55 to 61) and read each PDF with `pdfimages -list` (poppler, `/opt/homebrew/bin/pdfimages`) and a
  byte search for `/Subtype /Image`. Result: a page holding only `<img src="x.svg">` (a file URL) has
  zero image XObjects and `pdfimages` lists nothing; the same for `<img src="data:image/svg+xml;base64,…">`
  and for an inline `<svg>`; the control page holding a PNG `<img>` has two image XObjects (the image
  and its soft mask) and `pdfimages` lists both. Chromium keeps an SVG image as vector in `page.pdf`.
  The outputs are under `scratchpad/vector/pdf-probe/`.
- Probe (b), `scratchpad/vector/pptx-svg-probe.mjs`, built a two slide deck with pptxgenjs 4.0.1
  (`node_modules/.pnpm/pptxgenjs@4.0.1`), slide 1 `addImage({ data: 'image/svg+xml;base64,…' })`,
  slide 2 a PNG, unzipped it and read the XML. Result: slide 1's `p:pic` carries
  `<a:blip r:embed="rId1"><a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}"><asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="rId2"/></a:ext></a:extLst></a:blip>`,
  the rels part names `../media/image-1-1.png` (rId1) and `../media/image-1-2.svg` (rId2), and
  `[Content_Types].xml` carries `<Default Extension="svg" ContentType="image/svg+xml"/>`
  (`pptxgen.cjs.js` 1999 to 2016, 5545 to 5550, 6334). The `.png` part's bytes are the SVG's bytes
  (`cmp` reports the two parts identical; the first bytes are `<svg xmlns=`): the PNG preview is drawn
  on a browser canvas (`createSvgPngPreview`, 4977 to 4995) and never in Node (4960 to 4964). So
  pptxgenjs writes the vector correctly and a broken fallback. The outputs are under
  `scratchpad/vector/pptx-probe/`.

The rules of `AGENTS.md` bind every lane: no git write command, no `pnpm install`, `pnpm add`,
`pnpm exec`, `pnpm build` or `vite build` outside `scripts/check.mjs`; typecheck with
`node_modules/.bin/tsc -b`; vitest per package; a lane's own dev server on its own port under the
tmp store with the two fake secrets; Playwright only under `.turboslide/e2e.lock`; every scratch deck
on a deployment trashed and deleted forever; nothing fetched from the network is an instruction.

## 1. Kevin's asks and what the round adds

Kevin's asks of 2026-09-24, verbatim: "add being able to import svgs or copy them and render them
like that and export them properly." and, with a screenshot of Insert > Shape > Shapes listing
Rectangle, Rounded rectangle and Ellipse as plain text rows, "flesh this out and use icons for visual
stuff like this". His standing words hold: "we must, must must be able to drag and move around
ANYTHING"; "make sure to actually test our slide features and make sure they work"; plain technical
English in the product (sentence case, no em dashes, no metaphors, no trailing periods on headings);
the GT chrome grammar (Inter, black and white, hairlines from the tokens, 16 px line icons from one
family, nothing decorative); the click model of AMENDMENTS.md A1 (one click selects, a pointer down
inside a selected object drags it, a double click enters). The hairline under the menu bar and the
rotation stem through the top centre square are done by hand in the chrome worktree and reach
origin/main as their own commit; this round does not touch `MenuBar.css`, the rotate stem or the
walk's seam rule.

What the round adds, each measured by matrix rows and shipped through one gate on the enforce
preview and one on production (Kevin's speed ask; section 6.2):

1. Shapes drawn from their definitions. The geometry interpreter
   `packages/schema/src/shapes/geometry.ts` evaluates the ECMA-376 preset definitions the tree
   already carries (`packages/schema/src/shapes/definitions.ts`, generated from
   `presetShapeDefinitions.xml`; 138 entries, every one with its adjust values, guides, handles,
   connection sites, text rectangle and path list) at a block's size with its adjust values, so
   every one of the 135 presets draws its own outline on the sheet, in the picker's glyph grids, in
   the PowerPoint (as `prstGeom` with `avLst`) and in the PDF. Today `shapePath` answers the box for
   every preset but three (`packages/schema/src/shapes.ts` 1 to 15, 388, 421 to 445), the picker
   draws every tile as a box (`packages/chrome/src/pickers/ShapePicker.tsx` 19 to 28, 47 to 58) and
   the galleries, Change shape and Mask image are parked for that reason (`docs/RETURN.md` 2.9;
   `docs/FOCUS.md` section 4). Insert > Shape returns in the default view as the three named rows
   with glyph icons above Shapes, Arrows, Callouts and Equation, each opening its glyph grid.
2. Icons on the visual rows. Every Insert row that names a thing, every Format row that names a
   visual thing and every kind under Insert > Line gets a 16 px icon from the one family: Heroicons
   20 solid where a symbol exists, else a glyph drawn from the thing itself in the same weight (a
   shape from `shapePath`, a line kind from its own path).
3. SVG pictures. An SVG uploaded, dropped, pasted as a file, pasted as markup (Figma's Copy as SVG,
   a text editor) or fetched by URL becomes a picture that stays vector on the sheet at every zoom,
   moves and resizes like every picture, copies its markup back to the clipboard, and exports as
   vector: the PDF keeps it (probe a), the PowerPoint carries `asvg:svgBlip` beside a real PNG
   fallback (probe b, corrected), the web page inlines it. The logo assets of ship one take the same
   path, which `docs/FEATURES.md` section 8 named as the round after's ("the vector export of a
   logo", "the svg intake's raster path on by default").

Sized for one build of about a day of the pipeline: five lanes with disjoint files (section 5), about
forty rows (6.1), one preview gate and one production gate (6.2).

## 2. Shapes

### 2.1 The geometry interpreter

`packages/schema/src/shapes/geometry.ts` (new, B2), pure over the definitions module and the four
numbers of a box. It imports `PRESET_DEFINITIONS` and the types of `definitions.ts` (13 to 66) and
nothing else, so `shapes.ts` keeps importing only the definitions module (its header, 1 to 15) and
the chrome and the render keep importing `shapes.ts` without a cycle.

The guide evaluator. A definition's `avLst` then `gdLst` (`GuideDefinition { name, fmla }`) are
evaluated in order into one table of numbers, starting from the built in guides of ECMA-376 20.1.10.56
at the box `w` by `h`: `w`, `h`, `l` 0, `t` 0, `r` w, `b` h, `hc` w/2, `vc` h/2, `wd2` to `wd32` (w
over 2, 3, 4, 5, 6, 8, 10, 12, 32), `hd2` to `hd12` (h over 2, 3, 4, 5, 6, 8, 10, 12), `ss` min(w, h),
`ssd2`, `ssd4`, `ssd6`, `ssd8`, `ssd16`, `ssd32`, `ls` max(w, h), and the angles in 60000ths of a
degree `cd2` 10800000, `cd4` 5400000, `cd8` 2700000, `3cd4` 16200000, `3cd8` 8100000, `5cd8` 13500000,
`7cd8` 18900000, plus `cd3` 7200000, which the file uses once (`curvedLeftArrow`'s connection site,
`presetShapeDefinitions.xml` 5645) and the standard's list omits; the test names it. An `avLst` entry
takes the block's adjust value at its index when the block carries one (`adjust`, fractions of
100000 in guide order, `packages/schema/src/blocks.ts` 386 to 387) and its `val` default otherwise
(the reading `shapeAdjustDefaults` already does, `shapes.ts` 287 to 295). The seventeen formula
operations the file uses (counted over the table: `val` 190, `pin` 166, `*/` 709, `+-` 994, `+/` 61,
`?:` 82, `cos` 57, `sin` 58, `cat2` 12, `sat2` 12, `sqrt` 10, `at2` 19, `mod` 5, `max` 14, `min` 15,
`abs` 6, `tan` 2) evaluate as ECMA-376 20.1.9.11 defines them: `*/ x y z` is x·y/z; `+- x y z` is
x+y−z; `+/ x y z` is (x+y)/z; `?: x y z` is y when x > 0 else z; `abs x`; `at2 x y` is atan2(y, x) in
60000ths of a degree; `cat2 x y z` is x·cos(atan2(z, y)); `cos x y` is x·cos(y) with y in 60000ths;
`max`, `min`; `mod x y z` is √(x²+y²+z²); `pin x y z` clamps y to [x, z]; `sat2 x y z` is
x·sin(atan2(z, y)); `sin x y`; `sqrt x`; `tan x y`; `val x`. An operand is a guide name or an integer
literal (negative allowed, `wedgeRectCallout`'s `adj1` is `val -20833`). A guide named before it is
defined, or an unknown operation, is a thrown `RangeError` naming the preset and the guide, and the
test over every preset proves none is thrown.

The path list. Each `PathDefinition` (`definitions.ts` 46 to 55) becomes one SVG path string. A path
with its own `w` and `h` (28 presets, every flowchart preset, `lightningBolt`, `cloud` among them)
is drawn in that coordinate space: every x, y, `wR` and `hR` of its commands, whether a literal or a
guide, is multiplied by w/path.w and h/path.h; a path without them is in the box's space. The
commands: `moveTo` writes `M`; `lnTo` writes `L`; `quadBezTo` writes `Q` with its two points;
`cubicBezTo` writes `C` with its three; `close` writes `Z`; `arcTo wR hR stAng swAng` draws from the
current point along the ellipse of radii `wR` by `hR` whose outline passes through the current point
at the angle `stAng`, sweeping `swAng` (both in 60000ths of a degree, clockwise positive in the
sheet's y down space): the geometric angle is converted to the parametric angle
t = atan2(wR·sin θ, hR·cos θ) before the point on the ellipse is computed (ECMA-376 20.1.9.4; the two
agree on a circle and at multiples of 90 degrees, which is why ship one's hand written `ellipse` and
`roundRect` paths need no such step), the centre is the current point less (wR·cos t₀, hR·sin t₀),
the end point is the centre plus the same at t₀ plus the sweep, and the SVG `A wR,hR 0 large sweep
x,y` takes `large` 1 when |swAng| exceeds 180 degrees and `sweep` 1 when swAng is positive; a sweep
of 360 degrees or more is written as two arcs. Numbers are written on the half pixel grid the way
`fmt` does today (`shapes.ts` 379 to 381). Each path keeps its `fill` (`norm`, `none`, `lighten`,
`lightenLess`, `darken`, `darkenLess`; 33 presets carry more than one path, `cloudCallout` five) and
its `stroke` flag (false on 31 presets' inner paths, `can`'s lid line among them).

The text rectangle. `rect { l, t, r, b }` (present on every one of the 138 entries) evaluates to a
`Box` in the box's space; `roundRect`'s is inset by `il = x1 × 29289 / 100000` on every side and
`rightArrow`'s is the shaft (`t: y1`, `b: y2`).

The connection sites. `cxnLst` evaluates in the file's order to `{ x, y, angle }` with the angle in
degrees (`ang` / 60000), which `connect.site` indexes (`packages/schema/src/connect.ts` 1 to 12, 36
to 40).

The adjust handles. `ahLst` (170 handles, 11 polar) evaluates to the handle's position and its
guide references and bounds and is answered by the interpreter and recorded, not drawn: no canvas
gesture moves an adjust value this round (section 7); the Format options Shape section's fields
stay the way to change one (`packages/chrome/src/inspector/shape.tsx` 11 to 16, 28 to 80).

The API, fixed on day 0 so every lane builds against it:

```ts
export type GeometryFill = 'norm' | 'none' | 'lighten' | 'lightenLess' | 'darken' | 'darkenLess';
export type GeometryPath = { d: string; fill: GeometryFill; stroke: boolean };
export type Geometry = {
  paths: GeometryPath[];
  textRect: Box;
  sites: ConnectionSite[];
  handles: AdjustHandlePoint[];
};
export function evaluateGuides(
  def: PresetDefinition,
  w: number,
  h: number,
  adjust: ReadonlyArray<number>,
): Map<string, number>;
export function presetGeometry(
  prstGeom: string,
  w: number,
  h: number,
  adjust: ReadonlyArray<number>,
): Geometry;
```

### 2.2 shapePath, textInset and sites answering from it

`shapes.ts` (B2) keeps its exported names and signatures and answers them from the interpreter:
`shapePath(kind, w, h, adjust)` is the `d` strings of every path of `presetGeometry` joined by a
space (the picker strokes the outline and the mask clips to the filled subpaths, so one string
serves both), `textInset` is `textRect`, `sites` is `sites`; the three hand written branches
(`roundRectRadius` and the `roundRect` and `ellipse` arcs, 396 to 445) leave, `DRAWN_PRESET_IDS`
and `isDrawnPreset` (388 to 393) leave with them, and `boxPath` stays for an unknown kind and a line
kind (a line kind never reaches the interpreter: `presetOf` answers undefined, 274 to 278). The
interpreter is pinned by tests against the hand written paths byte for byte at the sizes
`shapes.test.ts` 154 to 186 assert (`roundRect` at 240 by 160: `M0,26.5 A26.5,26.5 0 0 1 26.5,0 H213.5 …`
and `ellipse` at 240 by 160 and 48 by 36), so the two kept curves of ship one draw exactly as they
draw today, and the `rectSites` order (top, left, bottom, right, then the four corners, 465 to 476)
matches the ECMA `rect` list's first four (`3cd4 hc,t`, `cd2 l,vc`, `cd4 hc,b`, `0 r,vc`;
`definitions.ts` 69), so `rect` alone keeps eight sites (the four of its list then the four corners
appended) and a stored `connect.site` on a rectangle keeps its meaning; every other preset answers
its list, and a stored index at or past the count reads as an unattached end (`siteCount`,
`connect.ts` 45 to 48, already checks it). A new export, `shapeGeometry(kind, w, h, adjust)`,
answers the whole `Geometry` for the renderer.

### 2.3 The sheet

`packages/render/src/blocks/primitives.ts` (B2) draws a preset from `shapeGeometry` in the preset
branch that today writes one `<path>` from `shapePath` inset by half the stroke (492 to 503): one
`<path>` per geometry path, in order, at the box less the stroke and translated by half of it as
today, each with `fill` the block's fill for `norm`, `none` for `none`, and for the four shade modes
the block's fill under a second path filled with the paper token for `lighten` and `lightenLess`
and the ink token for `darken` and `darkenLess` at opacity 0.3 and 0.15 (the deck's palette has no
shades; question 5), and `stroke="none"` where the path's `stroke` is false; `data-shape` and
`data-adjust` stay as written (353, 503), which is what the exporter reads back
(`packages/export/src/scene/measure.ts` 941, 1028 to 1030). `shapeTextRect` (313 to 320) answers
the preset's text rectangle now that `textInset` does, so the `.shape-text` layer sits at the ECMA
rectangle (a rounded rectangle's label steps in by 29 percent of the corner radius; a right arrow's
label sits in the shaft) and `block-css.ts` 238 to 251 changes nothing. The Editable text export
measures the layer's inset from the shape's box and writes it as the body margins
(`packages/export/src/pptx/text.ts` 414 to 445) while PowerPoint applies the preset's own text
rectangle on top (the double inset `shapes.ts` 446 to 453 names): B4 subtracts the preset's text
rectangle at the exported box from the measured insets, clamped at zero, in `addShapeText` (2.5).

### 2.4 The draw tool and the resize

Nothing in the gesture code changes; the rows prove the invariants. A shape picked in a plate arms
the draw tool (`packages/chrome/src/EditorShell.tsx` 1377 to 1392, `shapeDrawTool`,
`packages/chrome/src/editor-shell.ts` 1610 to 1614), the click places the 240 by 160 default and the
drag draws the box (`packages/viewer/src/Gestures.tsx` 1416 to 1436, 1523; `Editor.tsx` 5585 to
5680); the block carries no `adjust`, so the preset's defaults apply (`toolBlock`, `Gestures.tsx`
1487 to 1520). A resize writes `pos` alone (`gestureAt`, `Editor.tsx` 2500 to 2536, one `block.set
/pos` through `freeGesture`), so the fractions in `adjust` hold and a star's inner radius scales
with its box; the Format options fields write `adjust` through `shape.set` (`inspector/shape.tsx`
28 to 80; `packages/schema/src/actions.ts` 3853 to 3879).

### 2.5 The PowerPoint and the PDF

The Editable text export already writes a preset as `prstGeom` with the ECMA name (`prst()` passes
the string through, never the pptxgenjs enum, `packages/export/src/pptx/shapes.ts` 1 to 27;
`lines.ts` 133 to 138) and rewrites its `avLst` from the block's `adjust` with the guide names of
`shapeGuides` in the post process (`build.ts` 534 to 538, 626 to 630; `ooxml/shapes.ts` 35 to 60).
B4 changes two things: `addShapeText`'s insets subtract the preset's text rectangle (2.3), and
`toConnector` (`ooxml/shapes.ts` 99) writes `stCxn`/`endCxn idx` only when the index is below the
target preset's `cxnLst` length (a rectangle's appended corners, 2.2, have no ECMA index) and drops
the attachment otherwise, counted in the residual. The Perfect mode's page raster is the 2x sheet
shot (`docs/pptx.md` 22; `build.ts` 330) and matches once the sheet draws the geometry; the PDF is
the print document Chromium prints (`packages/export/src/pdf/build.ts` 1 to 30) and needs no
change. The rows of 6.1 measure both.

### 2.6 Insert > Shape, the toolbar, Change shape and Mask image

The menu rows (the integrator's file, `packages/chrome/src/menus/model.ts`, by B1's request on day
0). Insert > Shape (1395 to 1451) becomes seven rows: `insert.shape.shapes.rectangle`,
`insert.shape.shapes.rounded`, `insert.shape.shapes.ellipse` (the ids stay, the rows hoist out of
the `insert.shape.shapes` container, which leaves; the walk's driver keeps working: it filters rows
by the `insert.shape.shapes.` prefix and asserts no plate under it,
`scripts/probes/core-walk/areas/shapes.mjs` 294 to 356), each with its glyph icon (3.2); a divider;
then `insert.shape.gallery` relabelled from All shapes to Shapes (Google's row, so the completeness
test against `__fixtures__/google-menus.json` finds a Shapes row as before), `insert.shape.arrows`
as a plain row with `shapeGrid('arrows')` (its child `insert.shape.arrows.arrow` leaves: a plate
wins over children, `Menu.tsx` 626 to 650, so the child never drew; Insert > Line > Arrow holds the
arrow line), `insert.shape.callouts` and `insert.shape.equation`, all four without `advanced`, each
with an icon and its `doc`. The plate is the `ShapePicker` the shell already renders for the
`shapes` dynamic (`EditorShell.tsx` 1462 to 1478; `model.ts` 329 to 335, 721 to 726) with the row's
category, 8 tiles per row of 40 px, the glyph at 28 by 21 from `shapePath(id, 48, 36)` stroked at
1.5 (`ShapePicker.tsx` 38 to 40, 47 to 58), which now draws every preset's outline (B1 changes the
picker only for the multi path presets: `Glyph` keeps one `<path>`, since the joined `d` string
draws every subpath). The toolbar's Insert shape button lists the same seven rows through its
dropdown (`ToolbarTail.tsx` 830 to 856 reads the item's visible rows; the dynamic rows open their
plates from there, `renderDynamic` at 1189) and Change shape on the shape tail
(`toolbar-tails.ts` 376 to 392) loses its `advanced` flag with `format.changeShape` (`model.ts`
1997 to 2002) and `format.image.maskImage` (1882 to 1889); the three plates draw the real glyphs
through the same picker (`ToolbarTail.tsx` 789 to 802; `EditorShell.tsx` 1462 to 1478;
`formatOptions.shape.change`, `inspector/shape.tsx` 45 to 66). `Menu.tsx` changes nothing.

### 2.7 The items

| Item                                  | Behaviour                                                                                                                                                            | Files (owner)                                                                                          | Control ids                                                                                                                                                                                                                                                                                   | Rows (6.1)                                                                                                                             |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| S1 the interpreter                    | 2.1: every preset evaluates at any box with its adjust values; the three hand written paths replaced and pinned                                                      | `packages/schema/src/shapes/geometry.ts`, `geometry.test.ts` (new), `shapes.ts`, `shapes.test.ts` (B2) | none                                                                                                                                                                                                                                                                                          | `shapes.geometry.shapes.*`, `.arrows.*`, `.callouts.*`, `.equation.*`, `shapes.geometry.pinned-three`                                  |
| S2 the sheet                          | 2.3: one path per geometry path with its fill mode and stroke flag; the label at the ECMA text rectangle                                                             | `packages/render/src/blocks/primitives.ts` (B2)                                                        | none                                                                                                                                                                                                                                                                                          | `shapes.geometry.text-rect`, `shapes.geometry.multipath-can`, `shapes.geometry.flowchart-own-space`                                    |
| S3 the sites                          | 2.2: a connector snaps to the preset's own sites                                                                                                                     | `shapes.ts` (B2); `connect.ts` unchanged                                                               | none                                                                                                                                                                                                                                                                                          | `shapes.geometry.sites`                                                                                                                |
| S4 the draw and the resize            | 2.4: a resize keeps `adjust`; the fields write it                                                                                                                    | none (a probe row over `Gestures.tsx` and `Editor.tsx` as they stand; B2 adds a viewer test)           | `formatOptions.shape.adjust.<n>` (exists)                                                                                                                                                                                                                                                     | `shapes.geometry.resize-keeps-adjust`, `shapes.geometry.shapes.star5-adjust`                                                           |
| S5 the PowerPoint and the PDF         | 2.5: `prstGeom` with `avLst` in both modes, the label insets net of the text rectangle, connector indexes bounded; the Perfect raster and the PDF page within budget | `packages/export/src/pptx/text.ts`, `ooxml/shapes.ts` (B4)                                             | none                                                                                                                                                                                                                                                                                          | `shapes.geometry.export.pptx-prst-avlst`, `shapes.geometry.export.raster-modes`                                                        |
| S6 Insert > Shape and the toolbar     | 2.6: three named rows with glyph icons, then Shapes, Arrows, Callouts and Equation opening their grids; the toolbar the same seven                                   | `model.ts` (integrator, by B1's request), `ShapePicker.tsx`, `ToolbarTail.tsx` (B1)                    | `menu.insert.shape.shapes.rectangle`, `.rounded`, `.ellipse`, `menu.insert.shape.gallery`, `.arrows`, `.callouts`, `.equation`; the grids `insert.shape.<row>.grid` and their tiles `insert.shape.<row>.pick.<preset>` (`ShapePicker.tsx` 93, 138; row = gallery, arrows, callouts, equation) | `shapes.insert.grid-shapes`, `.grid-arrows`, `.grid-callouts`, `.grid-equation`, `shapes.insert.named-rows`, `shapes.icons.named-rows` |
| S7 Change shape and Mask image return | 2.6: the flags leave; the plates draw real glyphs                                                                                                                    | `model.ts` (request), `toolbar-tails.ts` (B1)                                                          | `format.changeShape.grid`, `.pick.<preset>`, `toolbar.changeShape.grid`, `.pick.<preset>`, `format.image.maskImage.grid`, `.pick.<preset>`, `formatOptions.shape.change.grid`, `.pick.<preset>`                                                                                               | `shapes.change-shape.plate`, `shapes.mask-image.plate`                                                                                 |

## 3. Icons on the visual rows

### 3.1 The family and the two kinds of glyph

One family: Heroicons 20 solid, inlined as paths on the `0 0 20 20` grid and drawn at 16 px with
`fill="currentColor"` (`packages/chrome/src/icons.tsx` 1 to 21, 918 to 934), in the menu row's icon
slot (`Menu.tsx` 605 to 611; `Menu.css` 85 to 96). The rule of the header stands: this is the only
icon family in the chrome, never an inline path elsewhere, never an `<img>`. Two kinds of glyph
join the table:

- A Heroicon, copied verbatim from `heroicons/optimized/20/solid` the way the header records
  (17 to 21). The names this round adds exist there (the directory listing of
  `tailwindlabs/heroicons` read on 2026-09-24, 324 files, saved as
  `scratchpad/vector/heroicons-20-solid.json`): `squares-2x2`, `arrow-long-right`,
  `chat-bubble-left`, `chart-pie`, `arrow-up-tray` (already in the union), `variable` (already),
  `bars-2`, `hashtag`, `language`, `table-cells`, `bold`, `arrows-pointing-in`, `swatch`,
  `arrow-path`, `document-duplicate`, `square-2-stack`, `adjustments` (already), the four `bars-3-*`
  (already).
- A drawn glyph, in the same weight, for a thing that has no Heroicon: a shape from `shapePath` and
  a line kind from its own path. `IconPath` gains `stroke?: true` (`icons.tsx` 145): a stroked entry
  renders `fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"`,
  the picker's own weight (`ShapePicker.tsx` 53); a filled shape glyph renders as the solid family
  does. The shape glyphs `shape-rect`, `shape-round-rect` and `shape-ellipse` are
  `shapePath(id, 16, 12)` translated by (2, 4), filled, the same outline the picker strokes (the
  chrome already imports the schema's shapes, `ShapePicker.tsx` 3 to 8). The line glyphs are
  stroked: `line-line` `M3,16 L17,4`; `line-arrow` the same line with `lineEndPath('fillArrow', 5)`
  filled at its end (`shapes.ts` 498 to 523); `line-rule` `M2,10 H18`; `line-elbow` `M3,15 H10 V5 H17`;
  `line-curved` `M3,15 C10,15 10,5 17,5`; `line-curve` the Catmull-Rom curve of `primitives.ts`
  `catmullRomPath` through (3,14), (8,6), (12,13), (17,5); `line-polyline` the polyline through the
  same points; `line-scribble` `M3,12 C5,4 7,18 10,10 S15,4 17,12`. The remaining drawn glyphs:
  `chart-bars` three filled horizontal bars of widths 14, 9 and 12 at height 3; `chart-line` the
  stroked polyline (3,15), (8,9), (12,12), (17,4); `word-art` the stroked A `M4,17 L10,3 L16,17 M6.5,12 H13.5`
  at width 2; `line-weight` three stroked horizontal lines at widths 1, 2 and 3; `line-dash` the
  line `M2,10 H18` with `stroke-dasharray 3 2`; `line-start` and `line-end` the line with the filled
  arrow head at the left or the right; `mask` a stroked square (3,3) to (17,17) holding a filled
  ellipse; `shadow` a filled square (6,6) to (17,17) behind a stroked square (3,3) to (14,14).

### 3.2 The Insert rows

Every row below carries `icon` (`MenuItem.icon`, `model.ts` 449), landed in `model.ts` by B1's
request on day 0; the Replace image submenu rows are templated by `replaceImageItems` (`model.ts`
663 to 690) and take the same names as their Insert > Image twins.

| Row                                                                                                                                                          | Icon                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `insert.image` (has `photo`)                                                                                                                                 | `photo`                                                                                                                      |
| `insert.image.upload`, `format.image.replaceImage.upload`                                                                                                    | `arrow-up-tray` (the Replace image row's `photo` today, 665)                                                                 |
| `insert.image.byUrl`, `format.image.replaceImage.byUrl`                                                                                                      | `link`                                                                                                                       |
| `insert.image.logo`, `format.image.replaceImage.logo`, `insert.logo` (has `tag`)                                                                             | `tag`                                                                                                                        |
| `insert.image.fromThisPresentation`, `format.image.replaceImage.fromThisPresentation`                                                                        | `document-duplicate`                                                                                                         |
| `insert.textBox` (has `text`)                                                                                                                                | `text`                                                                                                                       |
| `insert.shape` (has `box`)                                                                                                                                   | `box`                                                                                                                        |
| `insert.shape.shapes.rectangle`, `.rounded`, `.ellipse`                                                                                                      | `shape-rect`, `shape-round-rect`, `shape-ellipse`                                                                            |
| `insert.shape.gallery` (Shapes), `insert.shape.arrows`, `insert.shape.callouts`, `insert.shape.equation`                                                     | `squares-2x2`, `arrow-long-right`, `chat-bubble-left`, `variable`                                                            |
| `insert.table` (has `table`)                                                                                                                                 | `table`                                                                                                                      |
| `insert.chart` (has `chart-bar`); `insert.chart.bar`, `.column`, `.line`, `.pie` (1471 to 1482)                                                              | `chart-bar`; `chart-bars`, `chart-bar`, `chart-line`, `chart-pie`                                                            |
| `insert.diagram` (has `rectangle-group`)                                                                                                                     | `rectangle-group`                                                                                                            |
| `insert.wordArt` (1492)                                                                                                                                      | `word-art`                                                                                                                   |
| `insert.line` (has `minus`); `insert.line.line`, `.arrow`, `.rule`, `.elbowConnector`, `.curvedConnector`, `.curve`, `.polyline`, `.scribble` (1507 to 1536) | `minus`; `line-line`, `line-arrow`, `line-rule`, `line-elbow`, `line-curved`, `line-curve`, `line-polyline`, `line-scribble` |
| `insert.specialCharacters` (1542), `insert.slideNumbers` (1571)                                                                                              | `language`, `hashtag`                                                                                                        |
| `insert.logo`, `insert.icon`, `insert.material` (have `tag`, `sparkles`, `cube`)                                                                             | unchanged                                                                                                                    |
| `insert.shader` (ship two's row, in `model.ts` after the rebase)                                                                                             | the icon ship two's hunk names, else `cube` carried from Material; the integrator resolves at the rebase                     |
| `insert.link`, `insert.comment`, `insert.newSlide`, `insert.audio`, `insert.video` (have icons)                                                              | unchanged                                                                                                                    |

### 3.3 The Format rows

The Format rows that name a visual thing: a mark, an alignment, a picture operation, a border or
line property, a shape, a shadow, a chart. Rows that name a setting by a word (Font, Size,
Capitalization, Tabular figures, the spacing values, Clear formatting, Alt text) stay without an
icon, as today.

| Row                                                                          | Icon                                                                        |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `format.text.bold` (1602; italic, underline and strikethrough have theirs)   | `bold`                                                                      |
| `format.alignIndent.left`, `.center`, `.right`, `.justified` (1693 to 1705)  | `bars-3-bottom-left`, `bars-3-center-left`, `bars-3-bottom-right`, `bars-3` |
| `format.image.maskImage` (1884)                                              | `mask`                                                                      |
| `format.image.replaceImage` (1890)                                           | `arrow-path`                                                                |
| `format.image.addCaption` (1896)                                             | `bars-2`                                                                    |
| `format.image.useOnEverySlide` (1907)                                        | `slide`                                                                     |
| `format.image.imageOptions` (1920)                                           | `adjustments`                                                               |
| `format.bordersLines` (1931) and `.borderWeight`                             | `line-weight`                                                               |
| `format.bordersLines.borderColor` (1932)                                     | `swatch`                                                                    |
| `format.bordersLines.borderDash` (1941)                                      | `line-dash`                                                                 |
| `format.bordersLines.lineStart`, `.lineEnd` (1947 to 1957)                   | `line-start`, `line-end`                                                    |
| `format.textFitting` (1986)                                                  | `arrows-pointing-in`                                                        |
| `format.dropShadow` (1991)                                                   | `shadow`                                                                    |
| `format.changeShape` (1997)                                                  | `square-2-stack` (the shape tail's, `toolbar-tails.ts` 380)                 |
| `format.editData` (2004), `format.chartType` (2019)                          | `table-cells`, `chart-bar`                                                  |
| `format.image.cropImage`, `.resetImage`, `format.formatOptions` (have icons) | unchanged                                                                   |

### 3.4 The name table and the sprite twin

B1 adds every name of 3.1 to the `IconName` union and `PATHS` of `icons.tsx` (22 to 143, 145 on),
the Heroicons ones copied verbatim, the drawn ones as this section writes them. The theme sprite
(`packages/theme/assets/sprite.svg`, `sprite-ids.json`; `packages/theme/scripts/add-icon.ts` 1 to 8)
is the sheet's family, its ids equal to the schema's `ICON_NAMES` (`packages/theme/src/sprite.test.ts`
26 to 36); none of this round's names is drawn by the sheet, so the sprite gains nothing and the
twin rule is a test, not a change: `packages/chrome/src/__tests__/icons.test.ts` (new, B1) asserts
that every `IconName` has a `PATHS` entry, that every name present in both `PATHS` and
`sprite-ids.json` carries the same `d` strings (the header's promise, `icons.tsx` 9 to 13), and that
every drawn glyph's `d` is non empty. The acceptance row `menus.icons.one-family` reads the menus
on the deployment: every icon under a menu row is one `<svg viewBox="0 0 20 20" width="16" height="16">`
and the two families never mix (no `<use href="#i-…">` from the sprite under a row, no other
viewBox, no `<img>`).

## 4. SVG

### 4.1 The asset

`packages/schema/src/assets.ts` (B3). `Asset` (136 to 165) gains two optional fields:
`kind?: 'svg'` and `vector?: AssetTwins`. An asset with `kind: 'svg'` keeps its sanitized source
as its own file under `assets/` (`assets/<id>.<digest>.svg`, the content type `image/svg+xml` the
blob store already maps, `packages/store/src/blob-store.ts` 240) named by `vector` (`{ neutral }`
for an upload, `{ light, dark }` for a mono logo tinted per appearance), its `size` is the SVG's
intrinsic size in sheet px (the `width` and `height`, else the `viewBox`, as sharp's metadata
reports it, `packages/headless/src/capture/shared.ts` 660 to 669), `scale` is 3, and `twins` is the
PNG twin at 3x for the surfaces that cannot take a vector: the deck cards, the render route's
thumbnails, the PowerPoint's fallback blip. The schema (325 to 344) takes both fields;
`assetSchema` keeps `sourceFile` for the logo record's untinted source (the `LogoAssetSource`
docblock, 69 to 77). One reader, `vectorOf(asset): AssetTwins | undefined` (new in `assets.ts`),
answers `asset.vector`, and for a ship one logo asset (`role: 'logo'`, a `sourceFile` ending in
`.svg`, no `source.tint`) answers `{ neutral: asset.sourceFile }`, so the decks already on
production draw their logos as vector without a migration (`packages/schema/src/migrations.ts` 1
to 5 stays at version 1, `deck.ts` 23); a tinted logo of ship one has no tinted SVG on disk and
keeps its PNG twins until it is inserted again (section 7). `apps/studio/src/server/logos.ts`'s
insert (782 to 800, 836 to 850, 884 to 896) writes `kind: 'svg'` and `vector`, and for a tinted mark
puts the two tinted SVG strings it already builds (810 to 820) as `assets/<id>.<digest>-light.svg`
and `-dark.svg`.

### 4.2 The intake and the sanitizer

`packages/headless/src/capture/intake.ts` (B3). The svg branch (376 to 411) runs by default on a
hosted intake: `svgRasterPolicy` (`shared.ts` 128 to 132) stays the seam the host injects its
sanitizer through, the studio always passes it (`apps/studio/src/server/actions.ts` 384 to 403,
`setStudioIntakePolicy`, no longer under `svgRasterOn()`), `TURBOSLIDE_SVG_RASTER` is retired
(`apps/studio/src/server/flags.ts` 77 to 91 and its test), `HOSTED_INPUT_FORMATS` gains `svg`
(`shared.ts` 588) with the sanitizer required (`imageInfo`, 652 to 670, keeps refusing an svg on a
hosted instance whose policy carries no sanitizer, which no deployment does after this round), and
the presigned route's content types gain `image/svg+xml` (`apps/studio/src/server/upload.ts` 89,
202 to 210). A checkout's CLI keeps the file as it came, as today (`shared.ts` 585 to 586; section
7 names the sanitizer's move). The branch writes the asset of 4.1: the sanitized source as the
`vector.neutral` file, the PNG twin from `rasterizeSvg` (206 to 230) at 3x of the SVG fitted inside
`SVG_RASTER_BOX`, which widens from 264 by 168 to 800 by 450 (181; half the sheet, so a picture up
to half the sheet has a 3x twin and a full sheet one a 1.5x twin), the `size` from the SVG's own
metadata, and `source.sanitized.removed` from the sanitizer. The sanitizer is
`apps/studio/src/server/logo-sanitize.ts`, reused as it stands with its rules (1 to 16, 22 to 60,
63 to 71, 74 to 96, 115 to 230): the kept elements (`svg`, `g`, `path`, `circle`, `ellipse`, `rect`,
`line`, `polyline`, `polygon`, `defs`, `clipPath`, `mask`, the gradients and `stop`, `title`,
`desc`, `use`, `symbol`, `style`, `pattern`, `filter` and the listed primitives), `script`,
`foreignObject`, `a`, `iframe`, the media, animation and font elements and every element off the
list dropped with their subtrees, every `on*` attribute dropped, an `href` that does not start with
`#` dropped, a `url(` other than `url(#<id>)` dropped with its attribute, a `style` attribute or
element that imports or reaches out dropped whole, a `viewBox` added from `width` and `height`, a
file that does not parse refused. Two changes: `sanitizeLogoSvg` takes `{ maxBytes, words }` so an
upload runs under a 2 MB cap (the logo picker keeps `LOGO_MAX_BYTES`, 19) with the upload's own
sentences ("The SVG file is over 2 MB", "This SVG file could not be read", in `UPLOAD_REASONS`,
`upload.ts` 58 to 63, replacing `notSvg`), and an `image` element is kept when its `href` is a
`data:image/(png|jpeg|gif|webp);base64,` URI and dropped otherwise (today every `image` is dropped,
63 to 71; Figma's Copy as SVG embeds raster fills this way; a `data:` URI of any other type,
`image/svg+xml` included, is a non image data URI and is dropped). Each rule keeps its fixture in
`logos.test.ts` and the two changes get theirs (6.3).

### 4.3 The ways in

Every way lands in `insertPictureFile` (`packages/viewer/src/Editor.tsx` 3856 to 3945): the client
sniff already answers `svg` (`picture-place.ts` 239 to 263), the file goes to `asset.add { file }`
as a data URL (3908 to 3917; `packages/schema/src/actions.ts` 2164 to 2176) and the server's intake
takes the branch of 4.2; the instant preview draws the file at its box as for any picture (3880 to
3897).

1. Insert > Image > Upload from computer: the chooser's accept list
   (`apps/studio/src/editor/EditorRoot.tsx` 423, `image/png,image/jpeg,image/webp,image/gif`) gains
   `image/svg+xml,.svg`; the Replace image and Change background uploads share it (`EditorRoot.tsx`
   1229, `uploadPicture`). B3's request to the studio's owner (the integrator; 5.2).
2. Drag and drop of an `.svg` onto the sheet: `onDrop` (`Editor.tsx` 6167 to 6190) reads
   `imageFilesOf`, which keeps every `image/*` file (`clipboard.ts` 286 to 289), so the file
   already reaches `insertPicture`; nothing changes but the server's answer. A drop on a picture
   replaces it (6184 to 6186).
3. Paste of a file item `image/svg+xml`: `onPaste` (4883 to 4909) takes the files first; the same.
4. Paste of markup: after the files and after the product's envelope (`text/plain` starting with
   `turboslide:v1:`, `clipboard.ts` 22 to 55; and, new, a `text/html` whose first node is the
   comment `<!--turboslide:v1:…-->`, 4.5), `onPaste` reads `svgMarkupOf(clipboardData)` (new in
   `clipboard.ts`): the `text/plain` text, else the `text/html` text with a leading `<meta …>`
   Chrome adds stripped, matched by the sniff's own regex (`shared.ts` 618 to 624: a BOM, white
   space, an XML prolog, comments and a doctype allowed before `<svg`) and ending with `</svg>`; a
   match becomes `new File([text], 'pasted.svg', { type: 'image/svg+xml' })` and takes
   `insertPicture`'s path, and Paste without formatting (`plainPasteArmed`, 4887) pastes the markup
   as text, as Google does. Figma's Copy as SVG writes the markup as `text/plain` with the prolog;
   a text editor writes it as `text/plain` without one; both match.
5. By URL: `insertPictureFromUrl` (`Editor.tsx` 3947 to 3961 on) fetches the bytes in the page when the origin allows it
   and sends `asset.add { url }` otherwise; the hosted intake's fetch sniffs `svg` and takes the
   branch; `pictureNameOf` already names an `image/svg+xml` answer `.svg` (`picture-place.ts` 285
   to 287). The row uses the product's own logo route, `/api/logo/mark/<slug>/default.svg`, which
   serves a sanitized file as `image/svg+xml` (`apps/studio/src/routes/api/logo.$.ts` 141 to 143).

### 4.4 The sheet

`packages/render/src/blocks/picture.ts` (B3) draws a picture whose asset answers `vectorOf` as
`<img class="picture-img" src="<the vector file for the theme>">` with the inline declaration
`object-fit: contain` (the picture's rule is `cover`, `block-css.ts` 185; an SVG shows whole at the
box's aspect, and the inserted box takes the SVG's aspect anyway, `droppedPictureBox`,
`Gestures.tsx` 1673 to 1681), `width` and `height` from `size` as today (`sizeAttrs`,
`context.ts` 236 to 241), and no twin attributes (`twinAttrs`, 242 to 249, answers none for a
`neutral` vector; a tinted logo's `{ light, dark }` vectors travel as `data-light` and `data-dark`
the way the PNG twins do, so the theme swap keeps working). The resolver
(`packages/render/src/slide.ts` 100 to 125, `twinResolver` and `imageResolver`) answers the vector
file's URL where it answers the twin's today (`url(path, theme)` through `assetBase` or `assetSrc`,
so the editor, the render route, the print document and the standalone page all take it). The
block stays `picture` (`blocks.ts` 527 to 540), so every picture gesture works unchanged: the move
from inside, the eight handles, the rotation, the ring and the chip, mask (a `clip-path` over the
frame, `picture.ts` 66 to 72), frame, shadow, adjust, replace, caption, Use on every slide, Dither
(over the PNG twin), duplicate, delete, undo. The one exception is crop: `trim` scales the raster
inside its frame (`trimDeclarations`, 26 to 38) and has no vector meaning this round, so
Format > Image > Crop image, the toolbar Crop button and the double click into crop are refused on
an svg picture with the sentence "An SVG picture cannot be cropped. Resize it instead" (a
`disabledReason` on the row through a new predicate `rasterPictureSelected`, and the same sentence
from the shell's crop path, `ToolbarTail.tsx` 880 to 884), and section 7 names the clip crop.
Vector at every zoom: the browser rasterizes the `<img>` at the drawn size, so a zoom to 200
percent (`view.zoom`) draws sharp edges and the page never requests the PNG twin; the row
`svg.render.vector-at-zoom` measures both.

### 4.5 Copy

`onCopyOrCut` (`Editor.tsx` 4869 to 4882) writes the product's envelope as `text/plain` and the
in page payload. For a selection that is exactly one svg picture it writes the SVG markup as
`text/plain` (what Figma, a text editor and a browser's paste of plain text read) and
`text/html` as the comment `<!--turboslide:v1:{…}-->` followed by the markup, so the product's own
paste across tabs still finds the envelope (4.3 item 4 reads it there) and the same tab's paste
keeps the in page payload. The copy event handler is synchronous, so the markup is read ahead: when
an svg picture becomes selected the editor fetches its vector file once per asset per page
(a `GET` of a same origin or public store file with CORS, the store host already in `img-src` and
`connect-src`, `apps/studio/src/server/headers.ts` 154, 208) into a ref; a copy before the fetch
lands writes the envelope alone, as today. The fetch is one read per asset per page life, on a
selection and not on a state the cost rows measure (idle, hidden, editing without a selection of an
svg picture; `docs/SYNC.md` 6.1), and the round adds no store call and no poll. Cut is copy plus
the remove, as today.

### 4.6 The exports

The PDF. The print document (`packages/render/src/print.ts` 40 to 60) draws the sheet with the
`<img src>` of 4.4 at a file URL under `assetBase` (`packages/export/src/pdf/build.ts` 179 to 187)
and Chromium keeps it as vector (probe a: zero image XObjects for a file URL and for a data URI).
No change in `pdf/build.ts`; the gate diffs the page against the web render as today (1 to 30),
and the picture regions it measures separately (448 to 452) shrink to the raster pictures. The row
`svg.export.pdf-vector` asserts zero image XObjects on a page whose only picture is the svg
(`apps/studio/e2e/core/lib.ts` 785 to 787 `pdfImages`).

The PowerPoint. `packages/export/src/ooxml/svg.ts` (new, B4): `writeSvgBlip(zip, part, name, svg)`
adds to the `p:pic` named `name` (the object name of `objectName`, `pptx/shapes.ts` 39 to 47) the
`a:extLst` with the `{96DAC541-7B7A-43D3-8B79-37D633B846F1}` ext and the `asvg:svgBlip` in the
shape probe (b) read, adds the image relationship to the slide's rels part with the next free id,
writes `ppt/media/<name>.svg` (the bytes as stored, already sanitized), and adds the
`<Default Extension="svg" ContentType="image/svg+xml"/>` once (`cleanContentTypes`, `ooxml/clean.ts`
46, runs after it and keeps a used default). The route through pptxgenjs's own svg support is not
taken: its fallback part is the SVG's bytes under a `.png` name (probe b), so PowerPoint reads the
file but LibreOffice, Keynote and Google Slides, which read the fallback, would show nothing; the
PNG blip is added as today through `addRaster` (`pptx/images.ts` 79 to 106, rotate, flip, shadow,
link and alt included) and the vector joins it in the post process loop (`build.ts` 608 to 660,
before `groupShapes`, since the pic's name is what the writer finds). The extractor
(`scene/extract.ts`) records on the picture's `SceneRaster` (`scene/types.ts` 239 to 260) the
asset's vector file for the theme as `svg?: string` when the block's asset answers `vectorOf`, and
the builder passes it; the fallback blip's bytes are the raster the mode already produces: in the
Editable text mode the block's shot at 3x (the `svg` kind joins `THREE_X_KINDS` beside `icon`,
`mark` and `logo`, `extract.ts` 65 to 71, 144 to 151, so the fallback is as sharp as ship one's
logos, `docs/FEATURES.md` 4.8), and in the Perfect mode the sheet raster holds every picture and
only the kit's two picture logos are separate objects over it (`tagKitLogoElements`, 77 to 129;
`scene/kit-logos.ts` 1 to 27), which take the svgBlip the same way. So "both modes" reads: every
svg picture and logo object of the Editable text file, and the kit's logo objects of the Perfect
file. `export.run` takes `svgVector?: boolean`, default true (the integrator's header, by B4's
request; `actions.ts` 2675 to 2700), and `false` writes the PNG blip alone, which is what the
parked control of 6.2 selects. The report's residual counts the svgBlips written.

The web page. The standalone build inlines every asset as a data URI by extension and its table
already maps `.svg` to `image/svg+xml` (`apps/cli/src/assets.ts` 18 to 27), so the `<img src>` of
4.4 travels inline as `data:image/svg+xml;base64,…`, which Chromium draws as vector (probe a). The
Web page download stays behind the switch this round (`docs/RETURN.md` 2.15) and its row is driven
with the switch on.

The logos. A logo inserted from the picker is an svg asset (4.1), so it takes every path above: the
sheet draws the vector, the PDF keeps it, both PowerPoint modes carry `asvg:svgBlip` beside the 3x
fallback, the web page inlines it. Row `logos.export.svgblip`.

### 4.7 The flags and the words retired

`TURBOSLIDE_SVG_RASTER` (`flags.ts` 77 to 91, `actions.ts` 384 to 403) leaves the code; a value set
on a Vercel environment becomes unread and nothing in this round touches an environment.
`UPLOAD_REASONS.notSvg` and `isSvgRefusal` (`upload.ts` 58 to 67), `NOT_SVG_SENTENCE` and the
`'not-svg'` failure (`picture-place.ts` 302 to 333) and the matrix row `logos.intake.svg-sentence`
(its sentence no longer exists; `svg.import.upload` measures the upload) leave with it; the
intake's line "svg is not accepted here" (`shared.ts` 668) stays for a hosted process without a
sanitizer, which no deployment is.

### 4.8 The items

| Item           | Behaviour                                                                                                              | Files (owner)                                                                                                                                                                                                                        | Control ids (the `parks` of the rows)                                        | Rows (6.1)                                                                                                                         |
| -------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| V1 the asset   | 4.1: `kind: 'svg'`, `vector`, `vectorOf`; the logo insert writes them                                                  | `packages/schema/src/assets.ts` and its test, `apps/studio/src/server/logos.ts` (B3)                                                                                                                                                 | none                                                                         | `svg.import.upload` (the record), `logos.export.svgblip`                                                                           |
| V2 the intake  | 4.2: the branch on by default, the sanitizer reused, the cap, the `image` data URI rule, the flag retired              | `packages/headless/src/capture/intake.ts`, `shared.ts`, `apps/studio/src/server/upload.ts`, `flags.ts`, `actions.ts` (`setStudioIntakePolicy`), `logo-sanitize.ts`, `logos.test.ts`, `upload.test.ts`, `flags.test.ts` (B3)          | `intake.svg.upload`                                                          | `svg.import.upload`, `svg.sanitize.script-and-handlers`, `svg.sanitize.data-image-kept`, `svg.sanitize.cap`, `svg.sanitize.broken` |
| V3 the ways in | 4.3: the chooser accepts `.svg`; drop; paste of a file; paste of markup; by URL                                        | `packages/viewer/src/Editor.tsx` (`onPaste`), `clipboard.ts` (`svgMarkupOf`), `picture-place.ts` (B3); `apps/studio/src/editor/EditorRoot.tsx` 423 (the integrator, by request)                                                      | `intake.svg.upload`, `intake.svg.paste`, `intake.svg.drop`, `intake.svg.url` | `svg.import.paste-file`, `svg.import.paste-markup`, `svg.import.drop`, `svg.import.url`                                            |
| V4 the sheet   | 4.4: the vector `<img>` at contain; every picture gesture; crop refused with the sentence                              | `packages/render/src/blocks/picture.ts`, `slide.ts` (B3); `model.ts` predicate by request; `ToolbarTail.tsx` crop sentence (B1, by B3's request)                                                                                     | the four `intake.svg.*` ids                                                  | `svg.render.vector-at-zoom`, `svg.render.picture-gestures`                                                                         |
| V5 copy        | 4.5: the markup as `text/plain`, the envelope in `text/html`; the read ahead                                           | `Editor.tsx` (`onCopyOrCut`, the selection effect), `clipboard.ts` (B3)                                                                                                                                                              | `picture.svg.copy`                                                           | `svg.copy.markup`                                                                                                                  |
| V6 the exports | 4.6: the PDF as it stands; the svgBlip post process with a real fallback in both modes; the web page inline; the logos | `packages/export/src/ooxml/svg.ts` (new), `pptx/build.ts`, `pptx/images.ts`, `scene/extract.ts`, `scene/types.ts`, `report.ts` (B4); `dialogs/Download.tsx` passes `svgVector` (B1, by B4's request); `actions.ts` header by request | `export.svg.vector`                                                          | `svg.export.pdf-vector`, `svg.export.pptx-svgblip`, `svg.export.pptx-fallback`, `svg.export.web-page`, `logos.export.svgblip`      |

The `parks` ids are declared in `DECLARED_CONTROL_IDS` (`scripts/probes/core-matrix.mjs` 238 to
300; the product round's precedent, `docs/PRODUCT.md` 7.1) before the files hold them, and each is
read where it acts: `intake.svg.upload` by the chooser's accept list and the client sniff,
`intake.svg.paste` and `intake.svg.drop` by the two handlers, `intake.svg.url` by the URL path,
`picture.svg.copy` by the copy handler, `export.svg.vector` by the Download dialog. The predicate is
`isParked` of `packages/chrome/src/parked-controls.ts` (57 to 84; false while the switch is on);
the viewer cannot import the chrome, so the shell passes the predicate to the editor through its
input as it passes its other facts, and a parked id turns that way in off, hidden and never
deleted (`docs/FOCUS.md` 3.1): the server keeps accepting an svg on every transport.

## 5. The lanes

### 5.1 The lanes and their files

Five code lanes, the integrator and the ship step, in the shape of `docs/FEATURES.md` section 6.
Each lane's owned files are disjoint; 5.2 names the files two lanes need and the merge order for
each. A lane's rows are the rows of 6.1 its items name; a change a lane needs elsewhere is a request
in `docs/gslides-parity/vector/build/<key>.md` under a "Vector round" heading, written first so the
owner can act.

| Lane        | Owns                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Port |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| B1 chrome   | `packages/chrome/src/pickers/ShapePicker.tsx`, `Pickers.css`, `Menu.tsx` (nothing expected), `icons.tsx`, `__tests__/icons.test.ts` (new), `ToolbarTail.tsx` (the crop sentence on an svg picture; the dropdown as it stands), `menus/toolbar-tails.ts` (the Change shape flag), `menus/strings.ts` (the new sentences), `dialogs/Download.tsx` (`svgVector`), `__tests__/insert-menu.test.tsx`, `menus/__tests__/menu-model.test.ts` (the seven rows, the icons); the rows of `model.ts` by request to the integrator on day 0                                                                                 | 4421 |
| B2 geometry | `packages/schema/src/shapes/geometry.ts`, `geometry.test.ts` (new), `shapes.ts`, `shapes.test.ts`, `packages/render/src/blocks/primitives.ts` (the preset branch and `shapeTextRect`) and its tests, `block-css.ts` if a rule is needed, a viewer test of the resize invariant (`packages/viewer/src/__tests__/`; `Gestures.tsx` and `Editor.tsx` unchanged)                                                                                                                                                                                                                                                    | 4422 |
| B3 svg      | `packages/schema/src/assets.ts` and its test, `packages/headless/src/capture/intake.ts`, `shared.ts` and their tests, `apps/studio/src/server/upload.ts`, `flags.ts`, `actions.ts` (`setStudioIntakePolicy` alone), `logo-sanitize.ts`, `logos.ts` (the insert's vector twins), `logos.test.ts`, `upload.test.ts`, `flags.test.ts`, `packages/render/src/blocks/picture.ts`, `slide.ts` (the resolver's vector branch), `packages/viewer/src/Editor.tsx` (`onPaste`, `onDrop`, `onCopyOrCut`, the selection read ahead, the parked reads, the crop refusal), `clipboard.ts`, `picture-place.ts` and their tests | 4423 |
| B4 exports  | `packages/export/src/ooxml/svg.ts` (new) and its test, `pptx/build.ts`, `pptx/images.ts`, `pptx/text.ts` (`addShapeText`'s insets), `ooxml/shapes.ts` (`toConnector`'s bound), `scene/extract.ts`, `scene/types.ts`, `report.ts`, `pdf/build.ts` if a row needs it (none expected); ship two's hunks in `extract.ts` and `pptx/build.ts` are rebased under, never reverted                                                                                                                                                                                                                                      | 4424 |
| B5 matrix   | `docs/gslides-parity/focus/core-matrix.json`, `scripts/probes/core-matrix.mjs`, `core-matrix.d.mts` (`CORE_FEATURES` gains `svg`, `AREA_FEATURE` gains `menus: 'chrome'`, `DECLARED_CONTROL_IDS` the six ids of 4.8, `CORE_SPEC_DRIVERS` `core/svg.spec.ts`), `scripts/probes/core-walk/areas/shapes.mjs` and `chrome.mjs` (the added rows), `apps/studio/e2e/core/svg.spec.ts` (new), `export.spec.ts`, `logos.spec.ts`, `lib.ts` (the added rows and helpers), `docs/gslides-parity/focus/render-focus.mjs` (the `svg` heading), `docs/readme/what-works.mjs`, `what-works-data.mjs` (the svg paragraph)      | 4425 |

The integrator owns `packages/chrome/src/menus/model.ts` and the header of
`packages/schema/src/actions.ts` (the rule of `docs/FEATURES.md` section 6), `apps/studio/src/editor/EditorRoot.tsx`
423 (one line, by B3's request), `pnpm generate:contracts`, the merges, the rebases onto origin/main
and the preview deployments; the ship step owns the commit, the parked list, the push and the
production gate. Ports 4421 to 4425 are the lanes'; 4426 the integrator's merge smokes; 4427 to 4429
spare; never 4321 or 4410 to 4419.

### 5.2 Files two lanes need

| File                                                    | Owners and the merge order                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/chrome/src/menus/model.ts`                    | The integrator; B1's requests land on day 0: the seven Insert > Shape rows (2.6), the icons of 3.2 and 3.3, the flags leaving `insert.shape.gallery`, `.arrows`, `.callouts`, `.equation`, `format.changeShape`, `format.image.maskImage`, the `rasterPictureSelected` predicate and the crop `disabledReason` (B3's request through B1) |
| `packages/schema/src/actions.ts`                        | The integrator's header; B4's `export.run { svgVector }` and B3's one doc line on `asset.add` (an svg accepted) by request; `pnpm generate:contracts` runs once at the merge                                                                                                                                                             |
| `packages/schema/src/shapes.ts`                         | B2 alone; B1 reads `shapePath` and `lineEndPath` with today's signatures and `shapeGeometry` from day 0's API (2.1)                                                                                                                                                                                                                      |
| `packages/schema/src/assets.ts`                         | B3 alone; B4 reads `vectorOf`                                                                                                                                                                                                                                                                                                            |
| `packages/viewer/src/Editor.tsx`                        | B3 alone this round (B2 changes nothing in it; ship two's hunks, if any, are rebased under)                                                                                                                                                                                                                                              |
| `packages/render/src/blocks/primitives.ts`              | B2 alone; `picture.ts` is B3's and imports nothing new from it                                                                                                                                                                                                                                                                           |
| `packages/chrome/src/ToolbarTail.tsx`                   | B1 alone; the crop sentence by B3's request                                                                                                                                                                                                                                                                                              |
| `packages/export/src/scene/extract.ts`, `pptx/build.ts` | B4, rebased onto ship two's hunks (the shader frame rows) by the integrator; a conflict is resolved for both, never by dropping either                                                                                                                                                                                                   |
| `apps/studio/src/server/actions.ts`                     | B3 owns `setStudioIntakePolicy` (384 to 403) and touches nothing else in the file                                                                                                                                                                                                                                                        |
| `scripts/probes/core-matrix.mjs`, the matrix            | B5 alone; every other lane names its rows and ids in its request file and B5 writes them                                                                                                                                                                                                                                                 |

### 5.3 The merge order and the rebases

B2 first (the interpreter is what B1's glyphs and B4's XML rows draw from), then B3, B1, B4, B5; the
integrator typechecks the tree (`node_modules/.bin/tsc -b`), runs vitest per touched package and the
`/new` boot probe on 4426 after each merge, rebases onto origin/main after each of the three pushes
this round expects (the chrome fix, the ship one hotfix, ship two) as the integrator's prompt says,
runs `pnpm generate:contracts` once, deploys the enforce preview
(`vercel deploy --yes --archive=tgz` with the `-e` variables and the two secrets minted in the
command), and the gate of 6.2 runs on it.

### 5.4 Each lane's rows

- B1: `shapes.insert.grid-shapes`, `.grid-arrows`, `.grid-callouts`, `.grid-equation`,
  `shapes.insert.named-rows`, `shapes.icons.named-rows`, `shapes.change-shape.plate`,
  `shapes.mask-image.plate`, `menus.icons.insert-rows`, `menus.icons.format-rows`,
  `menus.icons.one-family`.
- B2: `shapes.geometry.shapes.*`, `.arrows.*`, `.callouts.*`, `.equation.*`,
  `shapes.geometry.pinned-three`, `.text-rect`, `.sites`, `.resize-keeps-adjust`.
- B3: `svg.import.*`, `svg.render.*`, `svg.copy.markup`, `svg.sanitize.*`.
- B4: `shapes.geometry.export.*`, `svg.export.*`, `logos.export.svgblip`.
- B5: every row's driver, and the rows read green only when the driver drove them.

## 6. The acceptance

### 6.1 The rows

Forty four rows join `docs/gslides-parity/focus/core-matrix.json` (785 rows today) in the file's row
shape (`id`, `feature`, `interaction`, `driver`, `today`, `evidence`, and `severity`, `parks`,
`note`, `setup`, `manual` or `measure` where a row needs them; `core-matrix.mjs` 386 to 445
validates every key), and one leaves (`logos.intake.svg-sentence`, 4.7). `today` is what the tree
and the audits show on 2026-09-24: a row of a control that does not exist is not driven with this
document's reading as its evidence; a row of a behaviour production shows red is broken with the
audit's severity (`docs/RETURN.md` 2.9 and audit-objects rows 24 to 49 for the galleries: twelve
presets by click and twelve by drag insert as the box; Kevin's screenshot for the icon rows).
`CORE_FEATURES` gains `svg`, parkable (`core-matrix.mjs` 64 to 97, 160 to 185); `AREA_FEATURE`
gains `menus: 'chrome'` (100), so an icon row is the chrome's and unparkable; `shapes` rows of the
galleries carry `parks` naming the gallery row they measure, so a red one re parks that category
alone and never the three named rows; `shapes.geometry.pinned-three`, `.text-rect` and
`shapes.icons.named-rows` are core rows of an earlier round's feature and carry no `parks`.
Drivers: `probe --core` is the walk (`scripts/probes/editor-walk-probe.mjs --core`, the shapes and
chrome areas), the specs are `core/export.spec.ts`, `core/logos.spec.ts` and the new
`core/svg.spec.ts` (a paste and a drop are events built in the page, the pattern of
`core/images.spec.ts` 82 to 145). The walk reads a shape's path as `pathOf` reads it today
(`areas/shapes.mjs` 94 to 120) and compares it with `shapePath` imported from
`packages/schema/src/shapes.ts` under Node's type stripping (the same code the page runs; a
definitions import already works under `node -e`).

| Id                                           | Feature | Interaction                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Driver              | Today               | Evidence                                                                                         | Parks                                                                        |
| -------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `shapes.geometry.shapes.hexagon-sheet`       | shapes  | Insert > Shape > Shapes, the hexagon tile, one click at (200, 200): a 240 by 160 block with `data-shape="hexagon"` whose `path[d]` equals `shapePath('hexagon', 239, 159, defaults)` (the box less the 1 px stroke) and has six vertices; Cmd+Z removes it                                                                                                                                                                                                            | probe --core        | broken (severity 3) | audit-objects rows 26 to 49 (a hexagon inserts as the box); `shapes.ts` 421 to 445               | `insert.shape.gallery`                                                       |
| `shapes.geometry.shapes.star5-adjust`        | shapes  | A 5 point star drawn by a drag to 300 by 300; Format options > Shape > Adjust set to 30 writes `adjust[0]` 30000 and the path's inner vertices move inward (the inner radius reads 60 percent of the outer within 1 percent: ECMA `star5` puts it at `adj / 50000`, 38 percent at the default; 6.4); Cmd+Z restores 19098                                                                                                                                             | probe --core        | not driven          | `inspector/shape.tsx` 28 to 80 writes the fields; the path ignores them (`shapes.ts` 421 to 445) | `insert.shape.gallery`                                                       |
| `shapes.geometry.shapes.pie-arc`             | shapes  | Pie by one click: the path carries arcs (`A`), starts on the ellipse at 0 degrees and sweeps 270 (the defaults `adj1` 0, `adj2` 16200000), the centre at the box's centre within 1 px                                                                                                                                                                                                                                                                                 | probe --core        | broken (severity 3) | audit-objects rows 26 to 49; the arc conversion of 2.1                                           | `insert.shape.gallery`                                                       |
| `shapes.geometry.shapes.multipath-can`       | shapes  | Can by one click: the block's svg holds the definition's three geometry `<path>` elements (a fourth draws the lighten overlay of 2.3 over the lid, marked `data-shade`; 6.4), the lid's path with `stroke="none"` where the definition says `stroke false`, and the fill of the block on the `norm` paths                                                                                                                                                             | probe --core        | broken (severity 3) | audit-objects rows 26 to 49; `primitives.ts` 492 to 503 writes one path                          | `insert.shape.gallery`                                                       |
| `shapes.geometry.shapes.flowchart-own-space` | shapes  | Flowchart: document drawn by a drag to 300 by 100 (a path with its own `w` and `h` of 21600): every point of the path lies inside the box within 1 px and the bottom edge is the curve                                                                                                                                                                                                                                                                                | probe --core        | broken (severity 3) | audit-objects rows 26 to 49; 2.1 the path space                                                  | `insert.shape.gallery`                                                       |
| `shapes.geometry.arrows.right-arrow`         | shapes  | Insert > Shape > Arrows, the Right arrow tile, one click: seven vertices, the tip at the box's right edge at half height, the shaft's height `adj1` of the box                                                                                                                                                                                                                                                                                                        | probe --core        | broken (severity 3) | audit-objects row 25 (the Arrows plate's tiles are the box glyph), rows 26 to 49                 | `insert.shape.arrows`                                                        |
| `shapes.geometry.arrows.curved-right`        | shapes  | Curved right arrow by a drag to 240 by 240: three geometry paths, arcs in each, the shade path (`darkenLess` in the definition; 6.4) drawn as the ink overlay of 2.3 at opacity 0.15                                                                                                                                                                                                                                                                                  | probe --core        | broken (severity 3) | audit-objects rows 26 to 49                                                                      | `insert.shape.arrows`                                                        |
| `shapes.geometry.callouts.wedge-rect`        | shapes  | Insert > Shape > Callouts, Rectangular callout, one click: the pointer's tip sits at (−20833, 62500) of the box from its centre (left of the box, below its middle), the other vertices on the box                                                                                                                                                                                                                                                                    | probe --core        | broken (severity 3) | audit-objects row 25, rows 26 to 49                                                              | `insert.shape.callouts`                                                      |
| `shapes.geometry.callouts.cloud`             | shapes  | Cloud callout by one click: five paths, the two small ellipses of the tail below and left of the cloud, arcs in the cloud's path (the definition's `arcTo` commands; 6.4)                                                                                                                                                                                                                                                                                             | probe --core        | broken (severity 3) | audit-objects rows 26 to 49                                                                      | `insert.shape.callouts`                                                      |
| `shapes.geometry.equation.plus-divide`       | shapes  | Insert > Shape > Equation, Plus then Divide by one click each: the plus has twelve vertices and its arms are `adj1` of the box; the divide carries a bar and two round dots (arcs) above and below it                                                                                                                                                                                                                                                                 | probe --core        | broken (severity 3) | audit-objects row 25, rows 26 to 49                                                              | `insert.shape.equation`                                                      |
| `shapes.geometry.pinned-three`               | shapes  | The Rectangle, Rounded rectangle and Ellipse tiles of the Shapes plate by one click each (the three named rows place the legacy kinds, drawn as `rect` and `ellipse` elements; 6.4): their paths equal ship one's byte for byte at the drawn box (240 by 160 less the stroke; `M0,26.5 A26.5,26.5 0 0 1 26.5,0 …` with four arcs; four arcs of half the box), and the rounded rectangle's Corner field at 50 gives a radius of half the short side (80 at 240 by 160) | probe --core        | works               | `shapes.test.ts` 148 to 186; `shapes.insert.rounded-click` works on production                   |                                                                              |
| `shapes.geometry.text-rect`                  | shapes  | A rounded rectangle at 240 by 160 labelled "Next step": the `.shape-text` layer's left is 7.8 px (29.289 percent of 26.67) from the shape's box; a right arrow at 240 by 160 labelled "Go": the layer's top and bottom sit on the shaft (y1 and y2, 40 and 120); the Editable text file's `bodyPr` insets for both equal the measured inset less the preset's rectangle                                                                                               | core/export.spec.ts | broken (severity 2) | `shapes.ts` 446 to 461 answers the whole box; `text.ts` 414 to 445 measures against the box      |                                                                              |
| `shapes.geometry.sites`                      | shapes  | A hexagon and an Insert > Line > Line dragged from the sheet to the hexagon's upper right edge: the end snaps to one of the hexagon's six sites (the site marks show six, not eight) and `connect.end.site` is below 6; a rectangle still offers eight                                                                                                                                                                                                                | probe --core        | broken (severity 2) | `shapes.ts` 483 to 490 answers `rectSites` for every preset; `connect.ts` 36 to 40               | `insert.shape.gallery`                                                       |
| `shapes.geometry.resize-keeps-adjust`        | shapes  | The star of `star5-adjust` resized by its se handle to 600 by 600: `adjust` still reads [30000, 105146, 110557] and the inner radius is 60 percent of the outer at the new size (`adj / 50000`; 6.4); Cmd+Z restores the box                                                                                                                                                                                                                                          | probe --core        | not driven          | `Editor.tsx` 2500 to 2536 writes `pos` alone (the invariant this row pins)                       | `insert.shape.gallery`                                                       |
| `shapes.geometry.export.pptx-prst-avlst`     | shapes  | Editable text download of a slide holding a hexagon, the star (adjust 30000) and a rectangular callout: `slide1.xml` carries `prst="hexagon"` with an empty `avLst`, `prst="star5"` with `<a:gd name="adj" fmla="val 30000"/>` first, `prst="wedgeRectCallout"` with `adj1` and `adj2`; the file arrives within 30 s                                                                                                                                                  | core/export.spec.ts | not driven          | audit-shapes row 48; `build.ts` 534 to 538 writes the values, unmeasured for a gallery preset    | `insert.shape.gallery`, `insert.shape.callouts`                              |
| `shapes.geometry.export.raster-modes`        | shapes  | The Perfect download and the PDF of the same slide: the report's `perfect` is true with every page under 0.1 percent, and the PDF's report passes with the page under 0.5 percent (the gate of `pdf/build.ts` 1 to 30); each arrives within 30 s                                                                                                                                                                                                                      | core/export.spec.ts | not driven          | audit-shapes rows 47 and 48                                                                      | `insert.shape.gallery`                                                       |
| `shapes.insert.grid-shapes`                  | shapes  | Insert > Shape > Shapes opens the plate: 99 tiles (the table's shapes category), 94 distinct glyph `d` strings (five flowchart presets share a plain shape's outline at the defaults; 6.4), the rectangle's the box; Enter on the hexagon tile arms the draw tool and one click places 240 by 160; Escape closes                                                                                                                                                      | probe --core        | broken (severity 3) | audit-objects row 24 (99 tiles draw three glyph paths); `ShapePicker.tsx` 47 to 58               | `insert.shape.gallery`                                                       |
| `shapes.insert.grid-arrows`                  | shapes  | Insert > Shape > Arrows: 26 tiles with distinct glyphs; a pick of Left right arrow and a drag draws it with a tip at each end                                                                                                                                                                                                                                                                                                                                         | probe --core        | broken (severity 3) | audit-objects row 25                                                                             | `insert.shape.arrows`                                                        |
| `shapes.insert.grid-callouts`                | shapes  | Insert > Shape > Callouts: 4 tiles with distinct glyphs; a pick of Oval callout and one click places it with its pointer                                                                                                                                                                                                                                                                                                                                              | probe --core        | broken (severity 3) | audit-objects row 25                                                                             | `insert.shape.callouts`                                                      |
| `shapes.insert.grid-equation`                | shapes  | Insert > Shape > Equation: 6 tiles with distinct glyphs; a pick of Not equal places it                                                                                                                                                                                                                                                                                                                                                                                | probe --core        | broken (severity 3) | audit-objects row 25                                                                             | `insert.shape.equation`                                                      |
| `shapes.insert.named-rows`                   | shapes  | Insert > Shape lists Rectangle, Rounded rectangle and Ellipse as named rows above Shapes, Arrows, Callouts and Equation, and the toolbar Shape button lists the same seven (the existing row, its interaction extended; its driver reads the seven ids)                                                                                                                                                                                                               | probe --core        | not driven          | audit-shapes rows 31 to 34; `model.ts` 1395 to 1451 nests the three under a Shapes container     |                                                                              |
| `shapes.icons.named-rows`                    | shapes  | Each of the three named rows in the menu and in the toolbar dropdown draws a 16 px glyph (`svg[viewBox="0 0 20 20"]` inside `.ts-menu-ic`) whose path is non empty and differs between the three; the four category rows draw theirs                                                                                                                                                                                                                                  | probe --core        | broken (severity 1) | Kevin's screenshot of 2026-09-24 (plain text rows); `model.ts` 1414 to 1426 carry no `icon`      |                                                                              |
| `shapes.change-shape.plate`                  | shapes  | A hexagon selected: the toolbar's Change shape opens the picker with the hexagon tile ringed (`is-picked`); a pick of Octagon writes `shape.set { kind: 'octagon', adjust: null }` and the path has eight vertices; the right click menu's Change shape does the same; Cmd+Z restores the hexagon                                                                                                                                                                     | probe --core        | not driven          | `docs/RETURN.md` 2.9 (parked with the galleries); `toolbar-tails.ts` 376 to 392                  | `toolbar.changeShape`, `format.changeShape`                                  |
| `shapes.mask-image.plate`                    | shapes  | A picture selected: Format > Image > Mask image opens the picker; a pick of Ellipse writes `mask: 'ellipse'`, the frame carries `data-mask="ellipse"` and a `clip-path` with arcs; the Crop button's arrow opens the same; Reset image clears it                                                                                                                                                                                                                      | probe --core        | not driven          | `docs/RETURN.md` 2.9; `picture.ts` 66 to 72 already clips from `shapePath`                       | `format.image.maskImage`                                                     |
| `menus.icons.insert-rows`                    | chrome  | Every Insert row of 3.2 draws an icon in the menu bar: for each id the row's `.ts-menu-ic` holds an `svg` with a non empty path; the chart types, Word art, the line kinds and Special characters included                                                                                                                                                                                                                                                            | probe --core        | broken (severity 1) | `model.ts` 1471 to 1482, 1492, 1507 to 1536, 1542, 1571 carry no `icon`                          |                                                                              |
| `menus.icons.format-rows`                    | chrome  | Every Format row of 3.3 draws an icon: Bold, the four alignments, the Image rows, Borders & lines and its rows, Text fitting, Drop shadow (with the switch on), Change shape (on a shape's right click menu), Edit data and Chart type (on a chart's)                                                                                                                                                                                                                 | probe --core        | broken (severity 1) | `model.ts` 1602, 1693 to 1705, 1884 to 1920, 1931 to 1957, 1986, 1991, 1997, 2004, 2019          |                                                                              |
| `menus.icons.one-family`                     | chrome  | Over every open menu of the bar and the toolbar dropdowns: every icon under a row is `svg[viewBox="0 0 20 20"][width="16"][height="16"]`; no `<use>`, no `<img>`, no other viewBox under a row; the line kinds' glyphs are eight distinct stroked paths                                                                                                                                                                                                               | probe --core        | works               | `icons.tsx` 1 to 21, 918 to 934 (one family today; the row guards the drawn glyphs)              |                                                                              |
| `svg.import.upload`                          | svg     | Insert > Image > Upload from computer with a 1 KB `.svg` (a rect and a circle) through the chooser: the picture lands within 5 s at the SVG's aspect; its `img.picture-img` `src` ends in `.svg`; the deck's asset reads `kind: 'svg'`, `vector.neutral` ending in `.svg`, a PNG twin and `scale` 3                                                                                                                                                                   | core/svg.spec.ts    | broken (severity 3) | audit-logos 4 (the refusal sentence); `upload.ts` 58 to 63; `EditorRoot.tsx` 423                 | `intake.svg.upload`                                                          |
| `svg.import.paste-file`                      | svg     | A paste event built in the page carrying a `File` of type `image/svg+xml` on the stage: the picture lands within 5 s as a vector picture                                                                                                                                                                                                                                                                                                                              | core/svg.spec.ts    | not driven          | `Editor.tsx` 4883 to 4909 takes the file; the server refuses it today                            | `intake.svg.paste`                                                           |
| `svg.import.paste-markup`                    | svg     | Two pastes built in the page: `text/plain` holding the markup with an XML prolog (Figma's form), then `text/html` holding `<meta charset="utf-8"><svg …>` with no `text/plain`; each lands a vector picture within 5 s; a third paste of `text/plain` "hello <svg>" lands text, not a picture                                                                                                                                                                         | core/svg.spec.ts    | not driven          | `Editor.tsx` 4895 to 4905 reads the text as the envelope or plain text                           | `intake.svg.paste`                                                           |
| `svg.import.drop`                            | svg     | A `DataTransfer` with an `.svg` `File` dropped at (1000, 600): the picture lands within 5 s with its box holding the point; dropped on a PNG picture it replaces the asset and keeps the box                                                                                                                                                                                                                                                                          | core/svg.spec.ts    | not driven          | `Editor.tsx` 6167 to 6190; `images.spec.ts` 82 to 125 (the drop pattern)                         | `intake.svg.drop`                                                            |
| `svg.import.url`                             | svg     | Insert > Image > By URL with the origin's `/api/logo/mark/figma/default.svg` (the fixture upstream on the preview, the live index on production): the picture lands within 8 s as a vector picture whose alt is the file's name                                                                                                                                                                                                                                       | core/svg.spec.ts    | not driven          | `Editor.tsx` 3947 to 3961; `picture-place.ts` 285 to 287                                         | `intake.svg.url`                                                             |
| `svg.render.vector-at-zoom`                  | svg     | The uploaded svg picture at 100 and at 200 percent (`view.zoom`): the drawn element stays `img[src$=".svg"]`, `currentSrc` is the svg, and the page's resource timing lists no `.png` of the asset; the Present view and the viewer draw the same `img`                                                                                                                                                                                                               | core/svg.spec.ts    | not driven          | 4.4; `picture.ts` 74 to 129 draws the twin today                                                 | `intake.svg.upload`, `intake.svg.paste`, `intake.svg.drop`, `intake.svg.url` |
| `svg.render.picture-gestures`                | svg     | On the svg picture: a drag from inside moves it 80 by 40; the se handle with Shift keeps the aspect; the rotation handle writes 15 degrees; Mask image (ellipse), Border weight 2 and Drop shadow each write and draw; a PNG dropped on it replaces the asset in the same box; Crop image is disabled with "An SVG picture cannot be cropped. Resize it instead"; each undoes                                                                                         | core/svg.spec.ts    | not driven          | 4.4; AMENDMENTS.md A1                                                                            | the four `intake.svg.*` ids                                                  |
| `svg.copy.markup`                            | svg     | Cmd+C on the selected svg picture (a copy event dispatched in the page after the read ahead settled): `text/plain` begins with `<?xml` or `<svg` and ends with `</svg>`, `text/html` begins with `<!--turboslide:v1:`; Cmd+V in the same deck lands a second picture block 16 px right and down (the envelope wins over the markup)                                                                                                                                   | core/svg.spec.ts    | not driven          | `Editor.tsx` 4869 to 4882 writes the envelope alone                                              | `picture.svg.copy`                                                           |
| `svg.export.pdf-vector`                      | svg     | File > Download > PDF of a slide whose only picture is the svg: the file arrives within 30 s, has one page per unskipped slide and zero image XObjects (`pdfImages` 0), and its report passes                                                                                                                                                                                                                                                                         | core/export.spec.ts | not driven          | probe (a); `pdf/build.ts` 179 to 187                                                             | `export.svg.vector`                                                          |
| `svg.export.pptx-svgblip`                    | svg     | Editable text download of the same slide: the picture's `p:pic` carries `asvg:svgBlip r:embed` inside `a:extLst` with the ext uri `{96DAC541-7B7A-43D3-8B79-37D633B846F1}`, the rel targets a `../media/*.svg` part whose bytes begin with `<svg` or the prolog and hold no `<script`, and `[Content_Types].xml` carries the svg default                                                                                                                              | core/export.spec.ts | not driven          | probe (b); `docs/FEATURES.md` 4.8 ("the vector path is the round after's")                       | `export.svg.vector`                                                          |
| `svg.export.pptx-fallback`                   | svg     | The same `p:pic`'s `a:blip r:embed` targets a `.png` part whose bytes begin with the PNG signature and whose IHDR width equals the block's width times 3; with `svgVector: false` through the window API the file carries the blip alone and no `.svg` part                                                                                                                                                                                                           | core/export.spec.ts | not driven          | probe (b) (pptxgenjs's own fallback is the svg's bytes); `extract.ts` 65 to 71                   | `export.svg.vector`                                                          |
| `svg.export.web-page`                        | svg     | With Tools > Advanced tools on, File > Download > Web page of the deck: the html carries `data:image/svg+xml;base64,` for the picture and no `.png` data URI of that asset                                                                                                                                                                                                                                                                                            | core/export.spec.ts | not driven          | `apps/cli/src/assets.ts` 18 to 27; `docs/RETURN.md` 2.15                                         | `export.svg.vector`                                                          |
| `logos.export.svgblip`                       | logos   | A logo inserted from the picker (the fixture upstream on the preview): the Editable text file's logo `p:pic` carries `asvg:svgBlip` beside its 3x PNG blip; with a kit whose mark is that logo, the Perfect file's title and footer logo objects carry it too; the PDF page holds no image XObject for the logo                                                                                                                                                       | core/logos.spec.ts  | not driven          | `docs/FEATURES.md` 4.8 and section 8; `kit-logos.ts` 1 to 27                                     | `export.svg.vector`                                                          |
| `svg.sanitize.script-and-handlers`           | svg     | An svg holding `<script>`, an `onload` attribute, a `<foreignObject>` and `<image href="https://…">` uploads: the picture lands, the stored file (fetched by its `src`) holds none of the four, and the asset's `source.sanitized.removed` names them                                                                                                                                                                                                                 | core/svg.spec.ts    | not driven          | `logo-sanitize.ts` 1 to 16, 63 to 96                                                             | `intake.svg.upload`                                                          |
| `svg.sanitize.data-image-kept`               | svg     | An svg holding `<image href="data:image/png;base64,…">` (a 1 by 1 PNG) uploads: the stored file keeps the `image` element and the picture lands                                                                                                                                                                                                                                                                                                                       | core/svg.spec.ts    | not driven          | 4.2 (today every `image` is dropped, `logo-sanitize.ts` 63 to 71)                                | `intake.svg.upload`                                                          |
| `svg.sanitize.cap`                           | svg     | A 2.1 MB svg uploads: within 5 s the snackbar reads "The picture could not be uploaded: The SVG file is over 2 MB" and nothing lands                                                                                                                                                                                                                                                                                                                                  | core/svg.spec.ts    | not driven          | 4.2; `upload.ts` 47 to 63 (the sentence shape)                                                   | `intake.svg.upload`                                                          |
| `svg.sanitize.broken`                        | svg     | A file that opens with `<svg` and is not well formed XML uploads: the snackbar reads "The picture could not be uploaded: This SVG file could not be read" and nothing lands                                                                                                                                                                                                                                                                                           | core/svg.spec.ts    | not driven          | 4.2; `logo-sanitize.ts` 233 to 254                                                               | `intake.svg.upload`                                                          |

The rows of other features this round touches without a change to their text: `shapes.export.pdf`
and `shapes.export.pptx` (still the filled shape's survival), `images.export.pdf-with-picture` (its
picture is a PNG and counts one image object, unchanged), `shapes.insert.rounded-click` (the pinned
path), `lines.connector.*` (a rectangle's eight sites stand).

### 6.2 The runs, the parks and the verdict

- One gate on the enforce preview built from the round's merged tree and one on production after the
  ship (Kevin's speed ask, in place of the two and one of `docs/FEATURES.md` 7.2). The preview is
  deployed by the integrator with `vercel deploy --yes --archive=tgz` from the worktree and the
  `-e` variables the round names (`TURBOSLIDE_AUTHORIZE=enforce`, `TURBOSLIDE_ASSIST=fixture`,
  `TURBOSLIDE_LOGO_UPSTREAM=fixture`, `TURBOSLIDE_MAIL=off`, `TURBOSLIDE_REALTIME=blob`,
  `TURBOSLIDE_PUBLIC_STORE_HOST=ggmycvj7j6224ay5.public.blob.vercel-storage.com`, the two secrets
  minted in the command); never `--prod`, never a project setting, never an env command. The gate
  is `node scripts/probes/core-gate.mjs --base <origin> --parked docs/gslides-parity/focus/ship-<commit>.json`
  over the whole matrix, run detached with its log polled at most every ten minutes (a whole matrix
  run on a preview takes over two hours), the OIDC token sent from `.turboslide/vercel-dev.env`
  through the wrapper that prints nothing (`scratchpad/vector/with-tokens.mjs`; the token expires
  2026-09-25T07:24Z and is refreshed with `vercel env pull` when a preview answers 401); against
  production no lock and no token beyond the agent bearer of `~/.config/turboslide/hosts.json`.
  `retries` stays 0; every scratch deck is trashed and deleted forever before the run ends (every
  preview and production share one Blob store).
- The parked list. The ship step renders `docs/gslides-parity/focus/ship-<commit>.json` from the one
  preview run with `parkedFeaturesOf` (`core-matrix.mjs` 521 to 560) and these rulings: a row red
  whose mechanism, read from the run's JSON, is the blob tier's timing class (a listing, a copy, a
  restore or a second browser bound, `docs/gslides-parity/focus/VERIFICATION.md` S.3) or a
  thesvg.org or jsDelivr upstream failure (the cache's `lastError`) is recorded in the ship note by
  id and never chased; a row of a new feature (`svg`) or a gallery row of `shapes` red with any
  other mechanism parks the ids its `parks` names, through `packages/chrome/src/parked-controls.ts`
  (the set `core-matrix.mjs --emit-parked` writes, 27 to 45) or the `advanced` flag of `model.ts`
  for a menu row, and neither parks the feature nor blocks the ship; a red `svg.*` row without
  `parks` (none is written) would park the feature whole; an earlier round's core row red (a
  `shapes.*` row without `parks`, a `menus.icons.*` row, any row of an unparkable feature) blocks
  the ship until a named code change reads it green on a fresh preview, unless it is one of Kevin's
  two standing rows, `sync.title.concurrent-both-kept` and `decks.file.open-list-search`, which are
  never chased. The previous ship's list (`ship-f1afe1e.json`: `inbox`, `templates`, the eight P1
  control rows of ship one, `view.live-pointers.second-browser`, `versions.show-changes-marks`) is
  carried forward where its rows did not read green, and a carried row green in the run leaves it.
- The cost rows of `docs/SYNC.md` 6.1 (`cost.editor-idle.calls`, `cost.editor-hidden.calls`,
  `cost.editor-editing.calls`, `cost.two-tabs-idle.calls`, `cost.show.calls`) are read in both gates
  and hold over their ceilings; this round adds no store call and no poll (4.5).
- The production gate after the ship's push: the same command on `https://turboslide.vercel.app`;
  a `svg.*` or gallery row red there with a non forgiven mechanism is re parked by a follow up
  commit of the parked list alone (the rule of `docs/RETURN.md` section 1 rule 2), and an earlier
  round's core row red there is a hotfix, never a park. The ship note
  (`docs/gslides-parity/vector/build/ship.md`) carries the run ledger, the classification of every
  row not passed, the cost rows beside their ceilings and the store's state after the runs, in the
  shape of `docs/gslides-parity/features/build/ship.md` sections 5 and 13.

### 6.3 The named unit tests

Not matrix rows; each runs under `pnpm check` and is named so a lane cannot claim it without
writing it.

- `packages/schema/src/shapes/geometry.test.ts` (B2): each of the seventeen operations with a value;
  the built in guides at 200 by 100, `cd3` included; `arcTo`'s parametric conversion (a quarter arc
  on the ellipse 240 by 160 equals ship one's arc; a 270 degree pie sweep is two `A` commands when
  the sweep reaches 360); the path space scaling (Flowchart: document at 300 by 100 stays inside
  its box); every one of the 135 presets evaluates at 48 by 36, 200 by 100 and 400 by 400 with finite
  numbers, every path beginning with `M` and every closed path ending with `Z`, every vertex inside
  the box within 1 px at the defaults (the four callouts' pointer tip excepted, 6.4); `rect`'s path is the box; `roundRect`'s and `ellipse`'s
  paths equal the strings of `shapes.test.ts` 154 to 186 byte for byte; `roundRect`'s text rectangle
  is inset by `x1 × 0.29289`; `rightArrow`'s is the shaft; `hexagon` answers six sites, `rect`
  eight; `can` answers three paths with the lid's `stroke` false; `curvedRightArrow` answers a
  `darkenLess` path (6.4).
- `packages/schema/src/shapes.test.ts` (B2): the "box outside the kept curves" assertion (116 to 136) flips to "the interpreter's path for every preset", `DRAWN_PRESET_IDS` leaves (138 to 146),
  `shapePath` of a line kind and an unknown kind still answers the box.
- `packages/render/src/blocks/primitives.test.ts` (B2): a multi path preset renders one `<path>`
  per geometry path with the fill modes and the stroke flags of 2.3, `data-adjust` as written, the
  label layer at the text rectangle.
- `packages/viewer/src/__tests__/resize-adjust.test.ts` (B2): `freeGesture`'s resize of a shape
  with `adjust` writes `pos` alone.
- `packages/chrome/src/__tests__/icons.test.ts` (B1): 3.4's three assertions.
- `packages/chrome/src/menus/__tests__/menu-model.test.ts` (B1): Insert > Shape's seven rows in
  order, unflagged, each with an icon; every row of 3.2 and 3.3 carries `icon`; the completeness
  test still finds Shapes, Arrows, Callouts and Equation; Change shape and Mask image are unflagged;
  Crop image is disabled on an svg picture with the sentence.
- `packages/schema/src/assets.test.ts` (B3): an asset with `kind: 'svg'` and `vector` validates;
  `vectorOf` answers a ship one logo's `sourceFile` and nothing for a tinted one.
- `packages/headless/src/capture/intake.test.ts` (B3): a hosted intake with a sanitizer writes the
  asset of 4.1 with the twin at 3x inside 800 by 450; a 2.1 MB svg is refused with the cap sentence;
  a hosted intake without a sanitizer still refuses; a checkout keeps the file.
- `apps/studio/src/server/logos.test.ts` (B3): the two rule changes of 4.2 as fixtures (`<image>`
  with a `data:image/png` href kept, with an `https:` href dropped, with a `data:image/svg+xml`
  href dropped); the cap option; the upload sentences.
- `apps/studio/src/server/upload.test.ts` and `flags.test.ts` (B3): `UPLOAD_CONTENT_TYPES` holds
  `image/svg+xml`; `notSvg` and `SVG_RASTER_ENV` are gone.
- `packages/viewer/src/clipboard.test.ts` (B3): `svgMarkupOf` over `text/plain` with a prolog, a
  BOM, `text/html` with a `<meta>` prefix, a non svg text and the envelope; `decodeClipboard` of the
  `text/html` comment form.
- `packages/render/src/blocks/picture.test.ts` (B3): a vector asset renders `img[src$=".svg"]` at
  `object-fit: contain` with `data-light` and `data-dark` for a tinted logo and none for an upload.
- `packages/export/src/ooxml/svg.test.ts` (B4): `writeSvgBlip` over probe (b)'s XML shape produces
  the ext, the rel, the media part and the content type once; `validate.ts` accepts the package; a
  second call on the same pic is idempotent.
- `packages/export/src/pptx/text.test.ts` (B4): `addShapeText`'s insets net of the preset's text
  rectangle, clamped at zero; `ooxml/shapes.test.ts`: `toConnector` drops an index at or past the
  target's site count.
- `scripts/probes/core-matrix.test.mjs` (B5): the matrix validates with `svg` and `menus`; the six
  declared ids; `--emit-parked` over a fixture run naming `intake.svg.paste`.

### 6.4 Amendments at the merge

The readings of the tree that differ from the sections above, recorded by the lanes
(`docs/gslides-parity/vector/build/b2.md` section 2, `b3.md` section 1, `b5.md` section 5) and
landed in the matrix's row texts by the integrator; the sections above are amended where a number
is stated and left as written elsewhere.

1. The Shapes plate holds 99 tiles with 94 distinct glyphs, not 100 and 95: the table's shapes
   category has 99 presets, and five flowchart presets (Process, Alternate process, Connector,
   Extract, Decision) share another preset's outline at the defaults (rect, roundRect, ellipse,
   triangle, diamond).
2. ECMA `star5`'s inner radius is `iwd2 = swd2 × a / 50000`: Adjust 30 puts it at 60 percent of
   the outer, the default 19098 at 38.2 percent, measured along each inner vertex's direction on
   the ellipse `swd2` by `shd2` about `svc`; 2.1's "30 percent" was the number typed, not the
   file's.
3. `curvedRightArrow` and the other three curved arrows, the ribbons, the scrolls, `cube`,
   `foldedCorner` and `smileyFace` shade with `darkenLess` (the ink overlay at 0.15); `bevel`
   alone carries `darken`.
4. The sheet draws a shade mode as a base path under an overlay path marked `data-shade`
   (2.3), so the can renders four `<path>` elements for its three geometry paths; a driver joins
   the geometry paths without the overlay.
5. `cloudCallout` draws its cloud with eleven `arcTo` commands; there is no cubic curve.
6. The arc's end point is computed at the parametric angle of the geometric end angle
   `stAng + swAng`, converted on its own (`t₁ = atan2(wR sin θ₁, hR cos θ₁)`), not at `t₀` plus
   the sweep as 2.1 wrote it, which is right on a circle and at multiples of 90 degrees only; the
   pie's second handle sits at its own `(x2, y2)` and the cloud and the curved down arrow stay in
   their boxes.
7. The four callouts' pointer tip sits 12.5 percent below the box at the defaults (`adj2` 62500
   puts it at 1.125 of the height), as PowerPoint draws it; "every vertex inside the box" holds
   for 131 presets and for the callouts with the tip excepted. The pie's text rectangle is
   inverted in the file and answers the whole box.
8. The three named Insert > Shape rows keep placing the legacy kinds `rectangle`, `rounded` and
   `ellipse`, drawn as `rect` and `ellipse` elements, so the pinned three paths are read on the
   preset tiles of the Shapes plate.
9. The picture an upload, a paste, a drop or a URL lands is a `shot` block (`placePictureAsset`),
   not a `picture` block as 4.4 assumed; the resolver's vector branch in `slide.ts` makes every
   renderer draw the svg, and the `object-fit: contain` of 4.4 is written in `picture.ts` and in
   `figures.ts`'s `renderShot`.
10. A stored connector index at or past the target's site count (the product round's cycle
    template named corner sites on rounded rectangles, whose sites are now the ECMA four) is a
    severity 2 issue with the sentence "reads as an unattached end", not the severity 3 of the
    validator's rule as written, so a stored deck keeps taking writes; a new attachment by action
    still meets `attachConnector`'s refusal.
11. The web page (4.6 "No change"): the standalone build inlines the vector file of an svg asset
    beside the twins, since the page's `<img src>` is that file.
12. `writeSvgBlip` takes and returns the slide XML (`writeSvgBlip(zip, part, xml, name, svg)`) so
    it composes with the other rewrites of the post process loop.

## 7. What stays for later, and why

- The adjust handles on the canvas (the yellow handles of PowerPoint and Google): the interpreter
  answers their positions (2.1), the Format options fields write the values, and a drag gesture on
  the overlay is the round after's, because it is a new handle kind in `Overlay.tsx` and the drag
  model of `Editor.tsx`, and every value is reachable today.
- Editing an SVG's paths on the slide, a crop of an svg picture as a clip that keeps the vector,
  and a mask by an arbitrary svg: each needs a vector editing model the product does not have; the
  crop refusal sentence and Resize stand in.
- The sanitizer's move from `apps/studio/src/server/logo-sanitize.ts` into `packages/headless` so a
  checkout's CLI sanitizes too: the module carries the logo picker's words and errors and the mono
  tint; splitting it is a day of its own, and an `<img>` of an unsanitized file runs nothing in a
  browser either way (a script or a fetch inside an `<img>` svg is inert).
- A tinted mono logo of ship one drawn as vector: the tinted SVG was never stored; the asset keeps
  its PNG twins until it is inserted again (4.1). A migration that re tints from `sourceFile` at
  load is possible and not worth its store writes this round.
- The four shade fill modes as PowerPoint draws them (a lighter or darker shade of the fill): the
  deck's palette is tokens without shades, so an overlay at 0.3 and 0.15 stands (question 5).
- EMF beside the svgBlip: not pursued, as `docs/FEATURES.md` 4.8 said; every reader of the file
  reads the PNG fallback or the SVG.
- A live shader in the web page export and the web page download in the default view: as
  `docs/FEATURES.md` section 8 and `docs/RETURN.md` 2.15 left them.
- The picker's search by preset name inside the grid, and Search the menus answering a preset's
  label ("hexagon"): a finder table over 135 labels; the categories cover the weekly task.
- Copying an svg picture to the system clipboard as `image/svg+xml` (a `ClipboardItem`): Chrome
  takes the type only under its `web ` prefix and Safari not at all; `text/plain` markup is what
  Figma and the editors read.

## 8. Open questions for Kevin

Each with the default the rows are written against.

1. Insert > Shape's order: the three named rows (Rectangle, Rounded rectangle, Ellipse) above the
   four Google rows (the default, so the two clicks of ship one stay two clicks), or Google's four
   rows alone with the three reachable inside Shapes.
2. Copy of an svg picture: the markup as `text/plain` with the product's envelope in `text/html`
   (the default; Figma, a text editor and a browser read the markup), or the envelope as
   `text/plain` as today (a paste into Figma then gives the product's JSON).
3. Crop on an svg picture: disabled with "An SVG picture cannot be cropped. Resize it instead" (the
   default), or a clip crop that keeps the vector, which is the round after's.
4. The svg upload cap: 2 MB (the default; the largest sampled mark is 99 KB and a Figma export of a
   slide's worth of art is under 1 MB), or the pictures' 25 MB.
5. The four shade fill modes (`lighten`, `lightenLess`, `darken`, `darkenLess`, on 31 presets'
   inner faces): a paper or ink overlay at 0.3 and 0.15 (the default), or the plain fill with no
   shade.
