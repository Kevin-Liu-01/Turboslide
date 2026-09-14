# Freeform slides and the primitives

The freeform round of 2026-09-11. Kevin's directive, verbatim: "be able to drag stuff around in each slide and reorder or move stuff - make the right sidebar much more intuitive and clear and better with icons - have good tooltips in all control surfaces - be able to reuse primitives and icons like boxes and shapes and selecting colors and font and typography controls and stuff. come on this needs to be so much more in depth and we should be able to create decks in turboslide deployment, and we can see the gt template presentation too". This document records the product decisions taken as the founder's direction over the specification's earlier rule, what the document, the renderer, the linter and the exporter do with them, and what is left for the studio and the integrator.

## 1. The decision, and what the specification said

SPEC 1 and SPEC 6.4 state that slots and ids are the only coordinates: "There are no free x and y, no resize handles on text, no z-order, no rotation." SPEC 4.3 calls the grammar layouts the whole addressing model. The round keeps every one of those layouts as it was, and adds one more:

- The grammar layouts (`cols`, `split`, `center`, `left-mid`, `stack`) stay. Blocks in them still have no coordinates; the editor gains drag to move and reorder blocks within a slot and across slots, which is the existing `block.move` mutation (the studio builder's part).
- A new layout, `freeform`, carries positioned blocks. Every top-level block of a freeform slide has `pos: { x, y, w, h, z? }`, its box on the 1600 by 900 sheet in sheet pixels. The validator requires `pos` there and refuses it everywhere else (`packages/schema/src/validate.ts`, issue code `position`, severity 3), so the grammar layouts keep their guarantee.
- A freeform slide is flagged by the linter as `layout/freeform` at severity 1 with the sentence "This slide is arranged by hand; Apply layout re-flows it" (gslides-parity SPEC-2 1.4), so a deck that wants to stay pure grammar sees where it left it.

Round two of the Google Slides parity (gslides-parity SPEC-2 section 1, Kevin's directive of 2026-09-12: "we must, must must be able to drag and move around ANYTHING") makes the canvas the one form of an arranged slide: every slide of every kind (title, statement, content, opener, mood, closing) becomes a freeform content slide on its first canvas manipulation or insert, block by block and losslessly, with the layout's own text, the photograph (the `picture` object at the bottom of the stack), the plate (a `box` with its children in the `plate` group), the mark and every block as objects; `slide.template` keeps the layout identity so Apply layout re-flows, and `slide.grammar` records the origin so `fromCanvas` restores the kind byte for byte while nothing moved. The theme elements the renderer draws on every slide (the footer mark, the counter, the rails, the chips, the paper ground) stay theme level this round, as Google's master elements are, until Slide > Edit theme.

The rendered `sheet/overflow` rule and the line law are unchanged. `docs/grammar.md` is regenerated from the catalog and names the layout and the five primitive blocks.

## 2. The document

`packages/schema/src/position.ts`

```ts
export type Position = {
  x: number;
  y: number;
  w: number;
  h: number;
  z?: number;
  rotate?: number;
  flip?: 'h' | 'v' | 'hv';
  group?: string;
};
```

`pos` sits on `BlockBase`, so every block type can be positioned, the material block included. `z` is optional; absent counts as 0 and document order breaks ties (`sortByZ`). Round two adds `rotate` (degrees clockwise about the box centre), `flip` and `group` (gslides-parity SPEC-2 2.1): rotation is in, and every geometry that reads a box (snapping, align, distribute, the marquee, `freeform/off-sheet`, the connection sites) reads the rotated bounding box (SPEC-2 0.107). A measured box is written at the measurer's 1/64 px, never rounded to the pixel (SPEC-2 1.3; `canvas.ts` `boxPos`). The inspector annotation is one control of kind `position`; Format options draws it as Size & rotation and Position.

`packages/schema/src/deck.ts` adds `{ type: 'freeform' }` to `Layout`; its one slot is `main`, and `normalizeLayout` returns it unchanged.

`packages/schema/src/color.ts`

```ts
export type Color = ColorToken | `#${string}`;
```

A `Color` is a palette token first: `ink`, `paper`, `ink-2`, `titanium`, `hair`, `hair-soft`, `plate`, `edge` (the theme tokens of `DECK-GRAMMAR.md:28`, which follow the theme) and `green` `#12a37a`, `amber` `#f0a020`, `red` `#e5484d`, `blue` `#2f5ce0` (the semantic hues of `DECK-GRAMMAR.md:30`, the same in both themes). A custom `#rrggbb` is allowed and is a `color/off-palette` finding at severity 2. `colorCss` writes a theme token as `var(--token)` and the hues and custom colors as literals; the exporter reads the computed color back from the page, so it needs no theme table. The inspector annotation is control `color` with the palette as its snap set.

`packages/schema/src/typography.ts`

```ts
export type Typography = { size?; weight?; align?; tracking?; leading? };
```

Size is a number with the type ladder as its snap set (88, 72, 58, 44, 34, 26, 24, 22, 20, 18, 17, 16, 15); a size off the ladder is `type/ladder` at severity 2 with a fix to the nearest step. Weight is 300 to 700 in hundreds; the 500 cap of `DECK-GRAMMAR.md:20` is enforced by `type/weight-cap` with a fix to 500, not by the schema. Align is left, center or right; tracking is in em with the deck's steps as snaps; leading is a factor with the ladder's line heights as snaps. A field that is absent keeps the grammar default, so a deck written before this round renders unchanged. Heading and paragraph blocks carry `typography`; so do the text and box primitives. The inspector annotation is one control of kind `typography`.

The primitive blocks (`packages/schema/src/blocks.ts`, catalog group `primitive`):

| Type    | Fields                                                                                                                                  | Export                                                                |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `box`   | `fill`, `stroke`, `strokeWidth` (0, 1, 1.5, 2), `radius`, `padding`, `height`, `text`, `typography`, `color`                            | native: a rectangle or rounded rectangle with a text box              |
| `shape` | `shape` (rectangle, rounded, ellipse, line, arrow), `fill`, `stroke`, `width` (1 to 4), `radius`, `arrowheads`, `orientation`, `height` | native: `rect`, `roundRect`, `ellipse`, or a line with triangle heads |
| `rule`  | `orientation`, `length`, `weight` (1, 1.5, 2), `color`                                                                                  | native: a line                                                        |
| `text`  | `text`, `typography`, `color`                                                                                                           | native: a text box                                                    |
| `icon`  | `name` (a sprite icon), `size` (16 to 96), `color`                                                                                      | raster, like every glyph (SPEC 8.6)                                   |

The box, shape and rule take `height` for a flow layout; on a freeform slide the position box decides. A box or shape with no `fill` has none; a box or closed shape with no `stroke` takes the hairline; a line or arrow with no `stroke` is drawn in the ink. Arrowheads are filled 8 px triangles, the size `dia/stroke-grammar` allows.

Mutations and actions:

- `block.move` gains `z`: on a positioned block it sets `pos.z`; the inverse is the move back plus a `block.set` of `/pos/z` to the old value.
- `block.align` (`slideId`, `blockIds`, `edge`, `to`, `snap`): moves the boxes so one edge is shared, against the selection's bounds, the content box or the sheet; the shared edge snaps once so the blocks stay aligned after the snap.
- `block.distribute` (`slideId`, `blockIds`, `axis`, `gap`, `snap`): equal gaps between the first and the last, or a fixed gap; `snap` rounds the moved edges to the grid.
- `block.order` (`slideId`, `blockId`, `move` or `z`): front, back, forward, backward or a rank; the stack is renumbered 0 to n - 1.
- `slide.setLayout` (`slideId`, `layout`): the conversion of section 4.

All four are on the cli, mcp, http and window transports and end in ordinary `block.set` or `slide.replace` mutations, so versions, inverses and leases are unchanged. The CLI commands are `turboslide block align`, `block distribute`, `block order` and `slide set-layout` (`apps/cli/src/commands/{block,slide}.ts`); the handlers are `apps/cli/src/store-actions.ts`, registered on the same dispatcher the MCP server and the studio's `/api/actions` use.

## 3. Snapping

`packages/schema/src/freeform.ts` is one implementation for the editor's drag, the actions and the linter.

- The grid is 8 px (`FREEFORM_GRID`).
- A guide within 6 px (`SNAP_DISTANCE`) wins over the grid. Vertical guides: the rails at 56 and 1544, the content box edges at 137 and 1463 and its center at 800, the column seams of the three `cols` ratios (5/7 at 659.5 and 731.5, 4/8 at 555 and 627, 1/1 at 764 and 836), the plate edges (opener 877, closing 857, mood 903). Horizontal guides: the rules at 56 and 844, the content box edges at 129 and 771 and its middle at 450.
- `snapPosition` snaps all four edges of a box and keeps at least one grid step of size; `snapOrigin` snaps the left and top edges only and keeps the size. `snapCoordinate` returns the guide's name when one won, for the editor's guide line.

## 4. Changing layout

`convertLayout(slide, layout)` behind `slide.setLayout`:

- To freeform: the measured conversion of gslides-parity SPEC-2 1.2 on every transport (`toCanvas` of `packages/schema/src/canvas.ts` over the boxes one DOM function measures, `measureCanvasBoxes` of `@turboslide/render/measure-dom`, on a 1x sheet with the prompts drawn): every block takes the box it is drawn at, a picture kind's photograph becomes the `picture` object at 0, 0, 1600, 900 under everything, its plate a `box` with its children in the `plate` group, a title's mark a `mark` block, a statement's big line a text block, and `slide.grammar` records the origin. The editor measures a hidden sheet in the current theme (`@turboslide/viewer/canvas-measure`), the CLI and the MCP server a headless page (`turboslide slide to-canvas`, `slide measure`), the hosted studio the render worker (`slide measure` as its child process or its `measure` job); the `pos` they write are identical in Chromium (SPEC-2 0.104). The conversion travels in the gesture's or the action's write as one `slide.replace` first, so one undo restores the kind (SPEC-2 1.6). The slide reads as it did; the designer drags from there.
- From freeform to a grammar layout: the boxes are dropped and the blocks fall into the target slots by geometry. The two columns of `cols` take a block by its center against the content middle; the head of a `split` takes the headings and the rest is the body (with two head columns, headings go left and a paragraph in the top third goes right); one slot takes everything. Blocks read top to bottom, left to right within one grid step.
- Between grammar layouts the slots map by index (left to head, right to body); a slot the target lacks folds into the last one.

A plain `slide.set /layout` from freeform to a grammar layout is refused by the validator because the blocks would keep `pos`; `slide.setLayout` is the way.

## 5. The renderer

`packages/render/src/slide.ts` `renderFreeform`: every block sits in a `.free` wrapper at its box, in paint order (`z`, then document order), the wrapper's `z-index` being its rank. A box inside the content box lives in the `.freeform` layer over `.in`, offset by the content origin, so the slot geometry and the `data-slot="main"` address still hold. A box that reaches past the content box lives in the `.freeform-sheet` layer, the whole sheet placed at the sheet origin (`.in` starts at 137, 129), so its coordinates are sheet coordinates as written. The block renders with the box's width and height as its slot (`slotWidth`, `slotHeight` on the block context).

`packages/render/src/blocks/primitives.ts` renders the five primitives. A shape is inline SVG at the box's size on the half-pixel grid for a 1 px stroke, with `stroke-linecap="square"` and no joins (report 03 section 5.11, `DECK-GRAMMAR.md:44`); an arrow shortens its line by the head length at each headed end and fills the head in the stroke color. The svg carries `data-shape`, and for a line or arrow `data-from`, `data-to` and `data-heads` in the box's own pixels, which the exporter reads back. Typography is inline declarations after the block's own styles (`typographyDeclarations`); colors go through `colorCss`. The CSS is in `block-css.ts` under the freeform comment, on the tokens; every line is 1 px, drawn once.

The block level dither of round three (gslides-parity SPEC-3 10.3): a `picture` or `shot` with a `dither` field renders with `data-dither`, `data-dither-key`, `data-dither-state` and `data-dither-source` on its root (`blocks/dither-attrs.ts`). In state `variant` the image is the materialized twin the asset record lists for the key; in state `live` the image stays the continuous twin and, in a live render only, a `<canvas class="picture-dither">` sits over it at the screen size (the box over the cell) for the runtime to draw (`dither-runtime.ts`, `image-rendering: pixelated`, absolute inside the box so a toggle moves nothing). The key is the sha256 of the source path, the resolved field and the screen in cells (`dither-key.ts`), the same derivation `picture.materialize` and the exporter use.

## 6. The linter

`packages/lint/src/static/freeform.ts`, `color.ts`, `type.ts`:

| Rule                 | Layer  | Severity | Check                                                                                                                                                                                                     | Fix                   |
| -------------------- | ------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `layout/freeform`    | static | 1        | the slide is on the freeform layout                                                                                                                                                                       | no                    |
| `freeform/off-sheet` | static | 3 or 2   | a positioned block lies wholly outside the 1600 by 900 sheet (3, the gate), or its rotated bounding box crosses an edge (2, under the gate: part of the object will not show; gslides-parity SPEC-2 0.96) | no                    |
| `freeform/overlap`   | static | 1        | two text-carrying blocks whose boxes intersect; names both blocks and the intersection                                                                                                                    | no                    |
| `color/off-palette`  | static | 2        | a custom hex on a primitive's `fill`, `stroke` or `color`; names the block and the color                                                                                                                  | no                    |
| `type/ladder`        | static | 2        | a `typography.size` off the ladder                                                                                                                                                                        | yes, the nearest step |
| `type/weight-cap`    | both   | 3        | extended: a `typography.weight` over 500 on a heading, paragraph, text or box                                                                                                                             | yes, 500              |

The fixture deck (`packages/lint/src/fixtures/deck.ts`) plants every one on the `fixed-points` slide, so `packages/lint/fixtures/index.json` lists them and the coverage test runs the fixes. The rendered `sheet/rail-touch` reads `text` and `box` as text types.

## 7. The exporter

Flatten mode is unchanged: the whole sheet is one 2x raster over the invisible text layer, and the text of `text` and `box` blocks is in that layer through their `data-run` carriers.

Native mode (`packages/export/src/scene/measure.ts`, `pptx/lines.ts`, `pptx/build.ts`): `text`, `box`, `shape` and `rule` join `NATIVE_BLOCK_TYPES`. A box is a `SceneRect` with role `box` from its computed background, border and corner radius; a closed shape is a `SceneRect` with role `shape` and `shape` `rect`, `roundRect` or `ellipse` from the inner element's computed fill and stroke (a shape with no fill measures `rgba(0, 0, 0, 0)` and travels as `fill: { type: 'none' }`); a line or arrow is a `SceneSegment` on `scene.lines`, from the svg's `data-from` and `data-to` scaled to its box, and travels as a native line with `beginArrowType` or `endArrowType` `triangle`, flipped when its end lies left of or above its start; a rule is a `SceneRule` with role `rule`. The icon block stays a raster. `TEXT_BLOCK_TYPES` and `LINE_BLOCK_TYPES` in `verify/budgets.ts` know the new types, so the verify loop measures them against the right budget. The importer is unchanged apart from its total id map over `BlockType`.

Dithered pictures (gslides-parity SPEC-3 10.4): the export materializes the missing variants before the shoot and reads variant files on every page; a covering picture whose dither is a plain two tone plane travels as the slide background from the variant file's bytes; the residual carries one `dither:` line per dithered picture. docs/pptx.md "Dithered pictures" has the rules.

## 8. What the studio owns

- The drag surfaces: `block.move` within and across slots on grammar slides, drag and resize of `pos` on freeform slides through `block.set /pos` (snapping through `snapPosition` and the guides of `freeform.ts`), and the align, distribute and order commands as toolbar buttons with tooltips.
- The inspector controls for the three new annotation kinds: `color` (the palette swatches plus a custom hex field), `typography` (size, weight, align, tracking, leading) and `position` (x, y, w, h, z). Until they exist the generated inspector falls back to a text field for these objects (`packages/chrome/src/inspector/generate.ts` `kindFor`).
- The palette group Primitives, and the freeform layout in the layout picker.
- Handlers for every canvas action on the window transport, in the editor's `on(...)` table (`apps/studio/src/routes/edit.$deckId.tsx`): since the Google Slides parity round two each one is the store action of `@turboslide/cli/store-actions` over the editor's store (one commit, one history entry), the one implementation the CLI, the MCP server and the hosted `/api/actions` run, with the editor's own measurer bound as `measureCanvas` and `measureFit` (`@turboslide/viewer/canvas-measure` `measureForCanvas` and `measureForFit` over B2's `measureCanvasBoxes`) and B5's `makeDiagram` as `diagrams`. `slide.setLayout` to freeform is the measured conversion through the store action; back to a grammar layout is the schema's `convertLayout`.

## 9. Tests

- `packages/schema/src/freeform.test.ts`: the schemas, the validator's position issues, snapping, align, distribute, order, the layout conversion, `block.move` with `z` and its inverse, the four actions.
- `packages/render/src/__tests__/blocks.test.ts` and `slide.test.ts`: snapshots of every primitive in both themes, a freeform slide in both themes, the sheet layer, and the parity of the schema's slot boxes with the renderer's.
- `packages/lint/src/lint.test.ts`: every new rule on the fixture, the fixes, and that grammar slides raise none of the freeform rules.
- `apps/cli/src/commands/freeform.test.ts`: the four commands and `block move --z` end to end over a deck in a temp directory.
