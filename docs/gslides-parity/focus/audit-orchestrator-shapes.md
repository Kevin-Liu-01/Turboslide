# Orchestrator note for the shapes audit: the mechanism

Read with the shapes audit. Written 2026-09-15 from the code at `ec61c6b`.

Every shape preset on production is drawn as its bounding rectangle because `shapePath` in `packages/schema/src/shapes.ts` lines 385 to 392 returns `M0,0 H{w} V{h} H0 Z` for every preset: the docblock above `textRect` at line 395 says "the whole box until the interpreter lands". The interpreter over `PRESET_DEFINITIONS` (`packages/schema/src/shapes/definitions.ts`, the 135 presets from `presetShapeDefinitions.xml` as one JSON string) was round five's B4 work (SPEC-5 6.5) and did not ship. The renderer (`packages/render/src/blocks/primitives.ts` `renderShape`, line 321, and the path at line 484), the picker's glyphs (`packages/chrome/src/ShapePicker.tsx`, "the picker draws every glyph from shapePath(48, 36)") and the exports all read that one function, which is why the gallery tiles are 135 identical rectangles and an inserted triangle, diamond or arrow is a rectangle with `data-shape` naming the preset it was meant to be.

Consequences for the decision:

- The /home page's fact "135 shape presets drawn from the PowerPoint geometry" is not true on production; the definitions exist and the drawing does not. The README and `facts.json` carry the same count.
- A minimal set a seller uses (rectangle, rounded rectangle, ellipse, line, arrow) needs real paths: rectangle is the box path; rounded rectangle, ellipse and arrow need a path each (about forty lines, no interpreter); a line is the existing line block. Everything else in the gallery is parked until the interpreter lands and passes the canvas fidelity gate.
- The picker must draw the glyph of what it inserts, so a parked preset is hidden rather than shown as a rectangle.
