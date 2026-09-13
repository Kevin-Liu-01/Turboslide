# Export fixture deck

The deck the Google Slides parity rounds export in both PPTX modes and to PDF and text
(gslides-parity SPEC 14.5, SPEC-2 11.2): one of every object the rounds added. Twenty seven
slides in two sections, one asset. The first seven are round one's, committed at `a65b313` and
copied under `packages/schema/src/__fixtures__/gslides-r1/` for the migration test; the twenty
that follow are round two's, one per new object.

| Slide | What it carries |
| --- | --- |
| `title` | A title slide with speaker notes |
| `breaks` | Two multiline paragraphs (paragraph breaks) and two run slide links (`#s/table`, `#last`) |
| `table` | A 4 by 4 table with a header row, aligned columns and a 1 px border |
| `numbered` | A numbered ruled statement list (`plain.numbered`) |
| `links` | A freeform slide with block links: a box to `first`, a text box to the `table` slide, a shape to a URL |
| `skipped` | A skipped statement slide with notes; absent from every export unless `includeSkipped` |
| `prompt` | A Title only layout with an empty heading, the empty placeholder that renders as a prompt in the editor and as nothing elsewhere |
| `styles` | A paragraph with italic, underline, strikethrough, superscript, subscript, a coloured and a highlighted run, and a justified text box |
| `canvas-title` | A Title slide converted to the canvas by `turboslide slide to-canvas` (the `pos` the headless measurer wrote, SPEC-2 1.3), its mark, heading and lead as objects, plus a text box with `autofit: 'grow'`, one with `shrink` at 26 px whose copy overflows its box, a rounded rectangle with text, `alt`, `valign: 'middle'` and four sided `padding`, and an icon; `grammar` records the title kind |
| `canvas-opener` | A Section header converted to the canvas: the photograph as the `picture` object at the bottom of the stack, moved 40 px right and trimmed 5 percent each side (its box crosses the right edge, so the slide carries one `freeform/off-sheet` finding at severity 2), the plate group (`box`, heading, paragraph, credit) rotated 3 degrees about the selection; `template: 'opener'` |
| `rotated` | A text box rotated 37 degrees, a right arrow flipped horizontally, a picture rotated 15 degrees |
| `grouped` | Three shapes and a text box in one group (`pos.group: 'four'`) |
| `shapes` | One preset per category: `hexagon`, `rightArrow`, `wedgeRectCallout` with `adjust`, `mathPlus`; a `snip1Rect`; a dashed ellipse |
| `lines` | A line with `fillCircle` start and `stealth` end, an elbow connector attached at both ends to two rectangles (`connect`), a curved connector, a polyline, a closed curve, a scribble |
| `word-art` | A text block with `outline` at 88 px |
| `shadow` | A box, a shape and a picture with drop shadows |
| `background-color` | A content slide with `background.color: 'plate'` |
| `background-picture` | A Title slide converted to the canvas with a `picture` object at the bottom of the stack (z 0) under its mark, heading and lead, the Background dialog's Choose image result written by `block insert --pos 0,0,1600,900` and `block order --move back` |
| `image-tools` | Three picture objects: one with `trim`, one with `mask: 'ellipse'`, one with `adjust` |
| `table-merge` | A 4 by 4 table with a 2 by 2 span, a filled header cell, a transparent border on one cell, a dashed table border and equal row heights |
| `chart-bar` | A bar chart with two series, the legend at the right, thousands format and 12 categories in a 720 px wide box, which plants `chart/size` at severity 2 |
| `chart-line` | A line chart with three series and values shown |
| `chart-pie` | A pie chart with one series and percent labels |
| `diagram` | A Process diagram with four steps in the `plate` style: rounded rectangles, text boxes and attached arrow lines in one group, the shape `diagram.insert` writes (written by hand until `packages/schema/src/diagrams.ts` binds on the CLI) |
| `bullets` | A `plain` block with marker `bullet` at levels 1 to 4, one with marker `number` and the `digit-alpha-roman` preset, and the round one `numbered: true` form beside them |
| `spacing` | A paragraph with line spacing 1.5, space before and after, in two columns; an indented paragraph |
| `autofit` | A content slide whose heading carries `autofit: 'shrink'` at a length the ladder steps down, a placeholder without `pos` |

The asset `fixture-photo` is two 1600 by 900 two-tone twins drawn with PIL by the fixture's
build (a disc, a triangle, a horizon rule and a hatched band in one bit), not a photograph, so the
deck carries no third party picture. `deck.json` sets `defaults.appearance` to `light`,
`defaults.counter` to `on` and `guides` to `{ x: [800], y: [450] }`.

`turboslide validate decks/fixture/gslides` exits 0. The static lint reports two findings at
severity 2 by design (`chart/size` on `chart-bar`, `freeform/off-sheet` on `canvas-opener`) and
none at severity 3; `copy/empty-placeholder` fires on `prompt`, by design.

The three canvas slides were written through the CLI on a scratch copy and copied back
(`docs/gslides-parity/build-2/b1.md` records the commands); rebuilding them is
`slide to-canvas <id>` on the grammar sources the same notes list.
