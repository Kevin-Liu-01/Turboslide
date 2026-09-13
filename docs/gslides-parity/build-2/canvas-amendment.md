# The canvas amendment

Amendment author's note, 2026-09-12. `docs/gslides-parity/SPEC-2.md` and `MILESTONES-2.md` were rewritten in place for Kevin's directive (3): "we must, must must be able to drag and move around ANYTHING, including backgrounds and shaders but all text in the same exact way the google slides is like a canvas. bring in ALL the canvas features". Nothing else in the tree was edited; no git write command was run.

## What changed in SPEC-2

- Section 1 is "The canvas": every slide is a canvas; the first manipulation or insert converts a slide to the freeform layout losslessly, block by block for every kind (1.2), measured by one DOM function in the editor and headless (1.3), validated, rendered through `renderFreeform` with the new `picture` block (1.4), exported both ways (1.5), and written with the gesture in one `slide.update` (1.6). `SlideBase.objects` and the `'objects'` slot are dropped everywhere; section 0 rows 0.7, 0.8, 0.9 are superseded and 0.16, 0.41, 0.42, 0.52 amended.
- Section 0 rows 0.69 to 0.95 record every decision, each naming directive (3).
- Section 2: 2.1.4 is the canvas, 2.6 is the colour fill plus the `picture` object (2.6.4), 2.10 is `Deck.guides`; 2.9 gains items 9 and 10.
- Section 3: `slide.toCanvas` and `deck.guides` join (36 actions, 105 in the table); the changed actions paragraph names the conversion on every canvas write, `view.zoom` with `center`, `block.align` to the sheet for one object.
- Section 4: Show ruler, the four Guides rows, Snap to, Zoom, Center on page (`to: 'sheet'`), Align, Distribute, Order, Rotate, Group, Ungroup and Regroup are Now on every slide kind; the `guide` context target and Guides ▸ on the empty canvas menu.
- Section 6 is "The canvas features": 34 behaviour rows (Google's behaviour and source, our gesture or key, the write, the guides and readouts, the test) and the kept surfaces.
- Section 9: the rotate alias, Cmd+scroll, Space+drag, 10 px nudges and their conflicts. Section 10: the new labels, strings and forbidden words.
- Section 11: check step 24 (`scripts/canvas-fidelity.mjs`), the fixture at 27 slides (`canvas-title`, `canvas-opener`), the new tests, `canvas.spec.ts`, and 11.8 the canvas walk. Section 12: rulers, guides, zoom and pan leave round three; Edit guides, the ruler's indent markers and unit, and the theme elements as objects stay.

## What changed in MILESTONES-2

- B4 is the canvas (sections 1 and 6 in full plus text editing and the draw tools), 112 agent-hours over days 2 to 6; it owns `packages/viewer/src/**` except `present/**`, the chrome's Overlay, ContextMenu, NotesPane and the new Rulers and Guides with their CSS and tests, and `apps/studio/e2e/{canvas,objects,text-styles}.spec.ts`.
- B1 gains `canvas.ts` (`toCanvas`, `fromCanvas`), the `picture` block, `Deck.guides`, the measured store actions (`withCanvas`), `slide to-canvas` and `deck guides`, and drops the objects layer. B2 gains `measure-dom.ts`, `measureCanvas` in headless (merge 1c on day 2), the picture block renderer, the chips and plate CSS rules, and `scripts/canvas-fidelity.mjs`. B3 gains the View rows, the Zoom box ladder, Center on page, the predicates and settings, and the filmstrip files and specs the first draft's B4 held.
- Eight days of wall time, about 510 agent-hours, `pnpm check` 24 of 24.

## Revised after the canvas review

The review in `build-2/review-canvas.md` (2026-09-12) found three severity 3 and nine severity 2 defects in the amendment. All twelve are applied in place; SPEC-2 section 0 rows 0.96 to 0.108 record each decision and name the finding, and MILESTONES-2 follows them. In short: `freeform/off-sheet` has two severities (3 wholly outside, 2 crossing an edge) and the editor shows the part past the edge on the workspace (0.96); both measuring paths draw prompts and await `awaitSheetReady` (0.97); `.ts-sheet .slide { isolation: isolate }` keeps every object under the frame, the wordmark and the counter (0.98); the conversion record is `SlideBase.grammar?: GrammarRecord`, not `ext.grammar` (0.99); the workspace is a marquee origin, a deselect target and the empty canvas menu's origin, and a covering picture's menu appends Change background and Guides (0.100); zoom types 25 to 1600 (0.101); groups resize, flip and take format writes over every member (0.102); a connector is rerouted by dragging an end (0.103); the `pos` identity holds in Chromium and the hosted http path measures through the render worker facade (0.104); a material takes its object's box and the picture object carries `side` (0.105); the theme exclusion is listed for Kevin (0.106); every geometry reads the rotated bounding box (0.107). Four severity 1 findings whose lines the edits touched are applied too (0.108); the rest stay for the fixer round. Where the revision disagrees with a finding's proposed fix (the record's name, the material caption, the Cmd+press marquee), the row says why.

## Open points for Kevin or the verifier

1. Align with one object aligns to the slide (0.80); R05 C2 reads Google's Align as a several objects command.
2. Google's rotate keys are Option+Left and Right; the brief's Cmd+Option pair is an alias honoured when Chrome lets it through (0.78).
3. Shift+arrows nudge 10 px (0.87), replacing round one's 8 px grid step.
4. The rulers and guide readouts read inches; the fields keep px (0.82).
5. Edit guides stays a Later stub with a clause (0.77); the four other Guides rows are Now.
6. Unverified Google facts the amendment designs around are listed in SPEC-2 section 13.
7. The theme elements (the wordmark, the counter, the rails, the two paper chips, the paper ground) stay theme level this round (0.75, 0.106): they are drawn on every slide, cannot be selected and are not objects, as Google's master elements are not; Slide > Edit theme (section 12, the design note "the Edit theme round makes the frame editable") makes them editable. This is the one scoping of directive (3) ("drag and move around ANYTHING, including backgrounds").
8. A picture object that covers the sheet at the bottom of the stack leaves no empty sheet; the escape is the workspace (marquee, deselect, the empty canvas menu) and the covering picture's menu appending Change background and Guides (0.100). Google never meets this case because its background image is not an object.
9. The editor's and the CLI's `pos` for a conversion are identical in Chromium; Safari and Firefox may differ by a pixel (0.104).
10. An object crossing the slide's edge is a severity 2 `freeform/off-sheet` finding, under the gate, and the part past the edge shows on the workspace while editing and is clipped everywhere else (0.96); whether Google dims it is unverified.
