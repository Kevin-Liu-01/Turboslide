// CSS the renderer owns: everything the deck's slides used to copy into scoped <style> blocks and
// that is now a block or a kind (SPEC 5.2, "What the renderer owns that slides used to copy";
// report 03 section 11). It is loaded after @turboslide/theme's sheet.css and scoped under the same
// `.ts-sheet` root class. Every value is the deck's, cited to the slide that set it.
export const BLOCK_CSS = `
/* ---- the sheet's inherited text rules. head.html sets these on body (head:183) and on .slide a
   (head:196-199), outside the 11-176 range the theme ports, so the renderer carries them until
   the theme does; the values are identical, so a duplicate is harmless ---- */
.ts-sheet { color: var(--ink); background: var(--paper); font-family: var(--text); font-optical-sizing: auto; -webkit-font-smoothing: antialiased; }
.ts-sheet .slide a { color: inherit; text-decoration: underline; text-decoration-thickness: 1px; text-decoration-color: var(--hair); text-underline-offset: 5px; }
.ts-sheet .slide a:hover { text-decoration-color: var(--ink); }
.ts-sheet .rows.links span { color: var(--ink-2); }

/* ---- full-picture kinds: opener, mood, closing (s01:3-11, s06:3-12, s85:3-13) ---- */
.ts-sheet .slide.opener .opener-img, .ts-sheet .slide.mood .mood-img { position: absolute; inset: -57px; z-index: -1; width: 1600px; height: 900px; object-fit: cover; display: block; }
/* the two paper chips under the wordmark and the counter, emitted only with chrome (OPENERS.md:47) */
.ts-sheet .ts-chips { position: absolute; inset: -57px; z-index: -1; pointer-events: none; background: linear-gradient(var(--paper), var(--paper)) 66px 858px / 40px 30px no-repeat, linear-gradient(var(--paper), var(--paper)) 1474px 856px / 60px 28px no-repeat; }
.ts-sheet .opener-plate { position: absolute; left: 0; bottom: 0; width: fit-content; max-width: 740px; padding: 22px 26px 20px; background: var(--paper); color: var(--ink); }
.ts-sheet .opener-plate .big { color: var(--ink); }
.ts-sheet .opener-plate p { margin-top: 14px; max-width: 56ch; color: var(--ink); }
.ts-sheet .opener-plate .credit, .ts-sheet .mood-plate .credit { margin-top: 12px; font-size: 15px; line-height: 1.45; letter-spacing: 0.01em; color: var(--titanium); }
.ts-sheet .mood-plate { position: absolute; right: 0; bottom: 0; width: fit-content; max-width: 560px; padding: 22px 26px 20px; background: var(--paper); color: var(--ink); }
.ts-sheet .mood-plate .title { font-size: 44px; line-height: 1.08; color: var(--ink); }
.ts-sheet .mood-plate p { margin-top: 12px; color: var(--ink); }
.ts-sheet .s-closing .opener-plate { top: 0; bottom: auto; max-width: 720px; }
.ts-sheet .s-closing .opener-plate .mark { display: block; width: 138px; height: 88px; fill: currentColor; margin-bottom: 24px; }

/* ---- layouts ---- */
/* the head of a split as two columns (s21:4, s34:3-5, s38:3-5, s61:4-5, s80:4-6) */
.ts-sheet .split > .head.head-cols { display: grid; gap: 72px; align-items: start; }
.ts-sheet .split > .head.head-5-7 { grid-template-columns: 5fr 7fr; }
.ts-sheet .split > .head.head-4-8 { grid-template-columns: 4fr 8fr; }
.ts-sheet .split > .head.head-baseline { align-items: first baseline; }
.ts-sheet .split > .head.head-cols h2 { margin-bottom: 0; }
.ts-sheet .split > .head.head-cols p { margin-top: 0; }
.ts-sheet .split > .body.start { align-content: start; }
/* a stack that holds a preformatted panel must not widen its column (s78:3-4) */
.ts-sheet .cols > .stack.has-pre { min-width: 0; }
.ts-sheet .composite { display: grid; }

/* ---- rows and lists ---- */
/* a key without an icon in a table where other keys carry one takes the icon's indent (s14:8) */
.ts-sheet .rows > div > b.no-ic { padding-left: 30px; }
.ts-sheet .rows.links .lk { white-space: nowrap; }
.ts-sheet .plain.plain-22 { font-size: 22px; line-height: 1.4; }
.ts-sheet .plain.plain-20 { font-size: 20px; line-height: 1.45; }
.ts-sheet .plain.plain-20 > span { padding: 8px 0; }
.ts-sheet .plain.plain-20 > span > .ic { width: 20px; height: 20px; vertical-align: -4px; margin-right: 10px; }
.ts-sheet .plain.plain-20 > span:has(> .ic) { padding-left: 30px; text-indent: -30px; }
/* say: two registers as ruled rows, the form of s12:3-8 */
.ts-sheet .rows.ex { --key: 190px; }
.ts-sheet .rows.ex > div { padding: 20px 0; gap: 28px; align-items: baseline; }
.ts-sheet .rows.ex > div > b { font-size: 18px; color: var(--titanium); font-weight: 500; padding-top: 4px; }
.ts-sheet .rows.ex .q { font-family: var(--display); font-weight: 500; font-size: 27px; line-height: 1.25; letter-spacing: -0.015em; color: var(--ink); }
.ts-sheet .rows.ex .q.no { color: var(--ink-2); text-decoration: line-through; text-decoration-thickness: 1.5px; text-decoration-color: var(--titanium); }

/* ---- scales: the center tick (s11:3) ---- */
.ts-sheet .scales.center-tick .scale .bar::after { content: ''; position: absolute; left: 50%; top: -4px; width: 1px; height: 9px; background: var(--ink-2); transform: translateX(-50%); }

/* ---- specimen blocks ---- */
.ts-sheet .spec .w small { font-weight: 400; } /* s19:2 */
.ts-sheet .lang div small { font-size: 15px; } /* s20:4 */
.ts-sheet .lang .ja, .ts-sheet .lang .zh, .ts-sheet .lang .ko { font-weight: 400; } /* s20:5 */
.ts-sheet .ladder > div { padding: 7px 0; } /* s21:6 */
.ts-sheet .ladder > div > small { font-size: 15px; } /* s21:7 */
.ts-sheet .ladder.wide-value > div { grid-template-columns: 1fr 320px; } /* s21:6 */

/* ---- figures ---- */
/* every image the renderer writes carries width and height from the asset's size (gslides-parity
   SPEC-3 9.2 E12), so a rule below that fixes one dimension leaves the other auto and the
   attribute ratio reserves the box before the file decodes */
.ts-sheet .shot-fig { margin: 0; width: 100%; display: grid; gap: 12px; } /* s33:3 */
.ts-sheet .shot-fig figcaption { font-size: 16px; line-height: 1.45; color: var(--ink-2); } /* s33:4 */
.ts-sheet .shot-fig.cap-15 figcaption { font-size: 15px; } /* s38:11 */
/* material (M5): a shader frame as a figure in the shot figure's form; the box keeps 16:9 at the
   slot's width unless the block sets a height; the editor's live mount prepends a canvas that covers
   the frozen frame; before a capture the plate ground carries a 15 px titanium label */
.ts-sheet .material-fig { margin: 0; width: 100%; display: grid; gap: 12px; }
.ts-sheet .material-fig figcaption { font-size: 16px; line-height: 1.45; color: var(--ink-2); }
.ts-sheet .material-fig.cap-15 figcaption { font-size: 15px; }
.ts-sheet .material { position: relative; width: 100%; aspect-ratio: 16 / 9; overflow: hidden; background: var(--plate); }
.ts-sheet .material > img { display: block; width: 100%; height: 100%; object-fit: cover; }
.ts-sheet .material > canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.ts-sheet .pair.gap-40 { gap: 40px; } /* s76:5 */
.ts-sheet .pair.cap-15 figcaption { font-size: 15px; } /* s63:5 */
/* tiles: the reference and direction grids (s13:3-7, s69:3-7) and the engine grid (s72:6-10) */
.ts-sheet .tiles { display: grid; gap: 18px 16px; }
.ts-sheet .tiles.cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.ts-sheet .tiles.cols-5 { grid-template-columns: repeat(5, minmax(0, 1fr)); }
.ts-sheet .tiles.cols-6 { grid-template-columns: repeat(6, minmax(0, 1fr)); }
.ts-sheet .tiles img { display: block; width: 100%; height: auto; object-fit: cover; object-position: center; border: 1px solid var(--hair); background: var(--plate); }
.ts-sheet .tiles.aspect-16-9 img { aspect-ratio: 16 / 9; }
.ts-sheet .tiles.aspect-16-10 img { aspect-ratio: 16 / 10; object-position: top; }
.ts-sheet .tiles.aspect-1-1 img { aspect-ratio: 1 / 1; }
.ts-sheet .tiles.tiles-thumb .tile span { display: block; margin-top: 8px; font-size: 15px; line-height: 1.4; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ts-sheet .tiles .tile.more { border-top: 1px solid var(--hair); padding-top: 10px; font-size: 15px; line-height: 1.45; color: var(--ink-2); }
.ts-sheet .tiles.tiles-marked .tile span { display: flex; align-items: baseline; gap: 8px; margin-top: 7px; font-family: var(--display); font-weight: 500; font-size: 15px; line-height: 1.3; color: var(--ink); white-space: normal; overflow: visible; }
.ts-sheet .tiles.tiles-marked .tile.site img { border-color: var(--ink); }
.ts-sheet .tiles.tiles-marked .tile.site span::before { content: ''; width: 9px; height: 9px; background: var(--ink); flex: 0 0 auto; transform: translateY(-1px); }
.ts-sheet .tiles.tiles-eng { gap: 8px 20px; }
.ts-sheet .tiles.tiles-eng figure { margin: 0; display: grid; gap: 4px; }
.ts-sheet .tiles.tiles-eng img { aspect-ratio: auto; height: auto; object-position: center; }
.ts-sheet .tiles.tiles-eng b { display: block; font-family: var(--display); font-weight: 500; font-size: 20px; line-height: 1.2; letter-spacing: -0.01em; color: var(--ink); }
.ts-sheet .tiles.tiles-eng span { display: block; font-size: 15px; line-height: 1.35; color: var(--ink-2); white-space: nowrap; }
/* details: three 425 px columns of 2x crops (s38:6-11, s65:5-8) */
.ts-sheet .details { display: grid; grid-template-columns: repeat(3, 425px); justify-content: space-between; row-gap: 24px; align-items: start; }
.ts-sheet .details.one-row { row-gap: 0; }
.ts-sheet .details figure { margin: 0; display: grid; gap: 10px; }
.ts-sheet .details figure img { display: block; width: 425px; height: auto; border: 1px solid var(--hair); background: var(--plate); object-fit: cover; object-position: center; }
.ts-sheet .details figcaption { font-size: 15px; line-height: 1.45; color: var(--ink-2); }
/* board: one ruled row per surface (s80:7-15) */
.ts-sheet .board { display: flex; flex-direction: column; border-top: 1px solid var(--hair); }
.ts-sheet .board > div { display: grid; grid-template-columns: 128px 250px 200px 1fr; gap: 22px; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--hair); font-size: 20px; line-height: 1.45; }
.ts-sheet .board img { display: block; width: 128px; height: 72px; object-fit: cover; object-position: top; border: 1px solid var(--hair); background: var(--plate); }
.ts-sheet .board b { font-family: var(--display); font-weight: 500; letter-spacing: -0.01em; }
.ts-sheet .board .who b { display: block; }
.ts-sheet .board .who small { display: block; font-size: 16px; line-height: 1.3; color: var(--ink-2); margin-top: 2px; }
.ts-sheet .board .state { white-space: nowrap; }
.ts-sheet .board .state .ic { margin-right: 10px; }
/* logoPlates: external logos on fixed-white plates (s14:3-7; the one sanctioned fixed color) */
.ts-sheet .lineage { display: grid; grid-template-columns: repeat(3, 150px); gap: 20px; margin-top: 6px; }
.ts-sheet .lineage figure { margin: 0; }
.ts-sheet .lineage .plate { display: grid; place-items: center; height: 90px; background: #ffffff; border: 1px solid var(--hair); }
.ts-sheet .lineage img { display: block; height: 56px; width: auto; }
.ts-sheet .lineage svg { display: block; height: 40px; width: 63px; color: #070707; }
.ts-sheet .lineage figcaption { margin-top: 8px; font-size: 15px; line-height: 1.4; color: var(--ink-2); }

/* ---- panel variants ---- */
.ts-sheet .panel.panel-15 { font-size: 15px; }
.ts-sheet .panel.pre { white-space: pre; overflow: hidden; padding: 20px 18px; } /* s78:5 */
.ts-sheet .panel.term { display: flex; align-items: center; gap: 28px; padding: 14px 26px; } /* s84:24 */
.ts-sheet .panel.term svg { display: block; fill: currentColor; flex: 0 0 auto; }
.ts-sheet .panel.term span { font-size: 20px; line-height: 1; }

/* ---- markSizes and matrix ---- */
.ts-sheet .sizes { display: grid; grid-template-columns: repeat(5, 1fr); } /* s17:3-6 */
.ts-sheet .sizes > div { display: grid; grid-template-rows: 1fr auto; }
.ts-sheet .sizes svg { display: block; align-self: end; justify-self: start; }
.ts-sheet .sizes .step { display: block; border-top: 1px solid var(--hair); padding-top: 14px; font-size: 16px; }
.ts-sheet .matrix { display: grid; border: 1px solid var(--hair); font-family: var(--display); font-size: 22px; font-variant-numeric: tabular-nums; text-align: center; } /* s26:10 */
.ts-sheet .matrix > span { padding: 14px 0; }
.ts-sheet .matrix > span.r { border-right: 1px solid var(--hair-soft); }
.ts-sheet .matrix > span.b { border-bottom: 1px solid var(--hair-soft); }

/* ---- the freeform layout and the primitives (docs/freeform.md) ---- */
/* the layer over the content box and the layer at the sheet origin; a .free wrapper is one block's box */
.ts-sheet .freeform { position: absolute; inset: 0; }
.ts-sheet .freeform-sheet { position: absolute; width: 1600px; height: 900px; pointer-events: none; }
.ts-sheet .freeform-sheet > .free { pointer-events: auto; }
.ts-sheet .free { position: absolute; }
.ts-sheet .free > .box, .ts-sheet .free > svg.shape { width: 100%; height: 100%; }
.ts-sheet .free > .rule-h { width: 100%; }
.ts-sheet .free > .rule-v { height: 100%; }
.ts-sheet .free > h1, .ts-sheet .free > h2, .ts-sheet .free > .big, .ts-sheet .free > p { margin: 0; }
/* a linked block (gslides-parity SPEC 7.2.7) sits in its .link wrapper, which takes the box the block would have */
.ts-sheet .free > .link { display: block; width: 100%; height: 100%; }
.ts-sheet .free > .link > .box, .ts-sheet .free > .link > svg.shape { width: 100%; height: 100%; }
.ts-sheet .free > .link > .rule-h { width: 100%; }
.ts-sheet .free > .link > .rule-v { height: 100%; }
.ts-sheet .free > .link > h1, .ts-sheet .free > .link > h2, .ts-sheet .free > .link > .big, .ts-sheet .free > .link > p { margin: 0; }
/* box: a hairline rectangle with its text at the body size (head:62); the border color and width are inline */
.ts-sheet .box { display: block; box-sizing: border-box; font-size: 22px; line-height: 1.5; color: var(--ink); }
.ts-sheet .box .box-text { margin: 0; }
/* shape: inline SVG on the tokens; a flow-layout shape is as wide as its slot */
.ts-sheet svg.shape { display: block; overflow: visible; max-width: 100%; }
/* rule: the sheet hairline as a block (DECK-GRAMMAR.md:15) */
.ts-sheet .rule { display: block; flex: 0 0 auto; }
/* text: the body step unless typography says otherwise */
.ts-sheet p.text { font-size: 22px; line-height: 1.5; color: var(--ink); }
/* icon: one glyph at its stated size; .ic keeps the sprite fill */
.ts-sheet svg.icon-block { display: block; vertical-align: baseline; }

/* ---- the canvas (gslides-parity SPEC-2 section 1, 1.4): every object in its .free wrapper ---- */
/* an object's box is its wrapper: the block's own flow margins (a paragraph's margin-top, an
   imported residual margin) do not move it inside the box, whatever the inline style says */
.ts-sheet .free > *, .ts-sheet .free > .link > * { margin: 0 !important; }
/* a rotated or flipped object turns about its centre; .ts-measure on the sheet root drops the
   transform for the exporter's measurement pass (1.5) */
.ts-sheet .free[data-rotate], .ts-sheet .free[data-flip] { transform-origin: center; }
.ts-sheet.ts-measure .free[data-rotate], .ts-sheet.ts-measure .free[data-flip], .ts-measure .free[data-rotate], .ts-measure .free[data-flip] { transform: none !important; }
/* the picture object (2.6.4): a frame at the object's box, the image covering it with the twins */
.ts-sheet .picture { position: relative; display: block; box-sizing: border-box; overflow: hidden; }
.ts-sheet .free > .picture, .ts-sheet .free > .link > .picture { width: 100%; height: 100%; }
.ts-sheet .picture > img.picture-img { position: absolute; left: 0; top: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
.ts-sheet .picture > .ts-material-live { position: absolute; inset: 0; }
/* the dither overlay (gslides-parity SPEC-3 10.3): absolute inside the picture's box, drawn at the
   screen size and scaled by CSS with pixelated cells so a 2x device shows exact cells; hidden until
   the runtime draws it, so a toggle or a state change moves nothing (9.2) */
.ts-sheet .picture > canvas.picture-dither, .ts-sheet .shot-crop > canvas.picture-dither { position: absolute; left: 0; top: 0; width: 100%; height: 100%; display: block; image-rendering: pixelated; pointer-events: none; }
.ts-sheet canvas.picture-dither[hidden] { display: none; }
/* the sandboxed frame of an html block (SPEC-3 8.4): the host is the block's box, the frame fills it */
.ts-sheet .ts-x-host { position: relative; display: block; overflow: hidden; }
.ts-sheet .free > .ts-x-host, .ts-sheet .free > .link > .ts-x-host { width: 100%; height: 100%; }
.ts-sheet .ts-x-host > iframe.ts-x-frame { display: block; width: 100%; height: 100%; border: 0; background: transparent; }
/* the two paper chips inside a covering picture object's wrapper paint over the photograph and
   nothing else (0.75, 0.98); the slot form's inset -57px is relative to .slide */
.ts-sheet .free > .ts-chips { inset: 0; z-index: 1; }
/* a material object and a picture object over a material take the object's box, not 16:9 (0.105) */
.ts-sheet .free > .material-fig, .ts-sheet .free > .material { width: 100%; height: 100%; aspect-ratio: auto; }
.ts-sheet .free > .material-fig { grid-template-rows: 1fr auto; }
.ts-sheet .free > .material-fig > .material { aspect-ratio: auto; height: 100%; min-height: 0; }
/* the plate scoped declarations of the picture kinds repeated on a converted plate's children
   (block-css.ts .opener-plate and .mood-plate above), so a plate child renders the same as an
   object: the members keep the plate group tag the conversion wrote (schema/canvas.ts CANVAS_GROUP);
   the credit's 15 px titanium and the mood title's 44 px are the block's own look on any canvas */
.ts-sheet .free[data-group="plate"] > .big { color: var(--ink); }
.ts-sheet .free[data-group="plate"] > p { max-width: 56ch; color: var(--ink); }
.ts-sheet .free > .credit { font-size: 15px; line-height: 1.45; letter-spacing: 0.01em; color: var(--titanium); }
.ts-sheet .free > .big.title { font-size: 44px; line-height: 1.08; }
/* the objects whose content scales with the box under a resize handle (hotfix-3 causes R4, R5;
   SPEC-5-amendments A4): an icon object's glyph fills its box (renderIcon writes no size for a
   positioned icon), a diagram object fills its box in both axes (renderDia adds
   preserveAspectRatio none for a positioned dia), a table object's rows share the box's height
   (the flex rows of the classic form grow from their content height, the auto tracks of the grid
   form stretch); at the box the conversion measured nothing changes, so the fidelity gate holds.
   hotfix-4 causes W2 and W8 add the mark object (renderMark writes no size for a positioned mark
   and the class mark-block; the symbol keeps its ratio inside the box) and the panel object: the
   panel fills its box and the two marks of its term form take half and the whole of the content
   height (16 and 32 at the measured box) with their width from the symbol's ratio (panel.ts
   MARK_VIEW_BOX). The mark rule keys on the class, never on data-type: a surface rendered without
   block attributes (the deck build, the present surface, a flatten sheet) writes no data-type, and
   an unsized svg no rule reaches draws at 300 by 150 (hotfix-4 section 3) */
.ts-sheet .free > svg.mark-block, .ts-sheet .free > .link > svg.mark-block { display: block; fill: currentColor; width: 100%; height: 100%; }
.ts-sheet .free > img.mark-block, .ts-sheet .free > .link > img.mark-block { display: block; width: 100%; height: 100%; object-fit: contain; object-position: left center; }
.ts-sheet .free > .panel, .ts-sheet .free > .link > .panel { box-sizing: border-box; height: 100%; }
.ts-sheet .free > .panel.term > svg.mark-s, .ts-sheet .free > .link > .panel.term > svg.mark-s { height: 50%; width: auto; }
.ts-sheet .free > .panel.term > svg.mark-l, .ts-sheet .free > .link > .panel.term > svg.mark-l { height: 100%; width: auto; }
.ts-sheet .free > svg.icon-block, .ts-sheet .free > .link > svg.icon-block { width: 100%; height: 100%; }
.ts-sheet .free > svg.dia, .ts-sheet .free > .link > svg.dia { width: 100%; height: 100%; }
.ts-sheet .free > .table, .ts-sheet .free > .link > .table { height: 100%; }
.ts-sheet .free > .table > .tr, .ts-sheet .free > .link > .table > .tr { flex: 1 1 auto; }
.ts-sheet .free > .table.grid, .ts-sheet .free > .link > .table.grid { align-content: stretch; }
/* the slide background colour layer (2.6.1): under .in at the sheet box */
.ts-sheet .slide-bg { position: absolute; inset: -57px; pointer-events: none; }
/* a positioned text box with an alignment or a padding fills its box (2.2.18, 2.2.19) */
.ts-sheet .free > p.text, .ts-sheet .free > .link > p.text { box-sizing: border-box; }
/* a shape with text: the svg and the .shape-text layer at the preset's text rectangle (2.2.17) */
.ts-sheet .shape-block { position: relative; display: block; }
.ts-sheet .free > .shape-block, .ts-sheet .free > .link > .shape-block { width: 100%; height: 100%; }
.ts-sheet .shape-block > svg.shape { display: block; width: 100%; height: 100%; }
/* a shape's label is centred and middle unless the block sets an alignment (docs/FEATURES.md 2.2
   rank 3, audit-objects 4: a label typed into a drawn rectangle sat in its top left corner);
   the inline text-align of typography.align and the flex of valign override this default, and
   the exporter reads the computed style either way */
.ts-sheet .shape-text { position: absolute; box-sizing: border-box; display: flex; flex-direction: column; justify-content: center; font-size: 22px; line-height: 1.5; color: var(--ink); text-align: center; overflow-wrap: anywhere; }
.ts-sheet .shape-text .para { margin: 0; }
/* a shape whose text is empty (a fresh shape, docs/FOCUS.md section 4): the layer keeps its run
   for Enter and a double click but takes no pointer until the session gives it the focus, so a
   click selects the shape and a drag moves it */
.ts-sheet .shape-text.is-empty:not(:focus) { pointer-events: none; }
/* the click model on the editor stage (docs/gslides-parity/focus/AMENDMENTS.md A1): outside a
   session a run is a plain surface, so a pointer down inside a selected text object and a move
   drag the object and paint no native selection over the words, and a picture drags as an object
   rather than as the browser's image ghost; the session's editable (.ts-editing) keeps its own
   selection. The viewer's sheet is untouched: the rules bind to the editor root alone */
.ts-sheet.ts-editor .pt-slide [data-run]:not(.ts-editing) { user-select: none; -webkit-user-select: none; }
.ts-sheet.ts-editor .pt-slide img { -webkit-user-drag: none; }
/* word art (2.2.16): the outline behind the fill */
.ts-sheet p.text.word-art { paint-order: stroke fill; }
/* the picture tools on a shot (2.5): the clipping frame at the picture's aspect */
.ts-sheet .shot-crop { position: relative; display: block; width: 100%; overflow: hidden; box-sizing: border-box; background: var(--plate); }
.ts-sheet .shot-crop > img.shot { position: absolute; left: 0; top: 0; width: 100%; height: 100%; object-fit: cover; border: 0; }
/* a picture object drawn as a shot (docs/FOCUS.md rank 18, the deferred W7 of hotfix 4): on the
   canvas the figure takes its box, the image row takes what the caption row leaves and the image
   takes the whole row in both axes (its border box, since the sheet sizes it border-box; the fit
   form's auto width and its two caps are off), so a drag of one edge stretches the picture the way
   Google's does while a corner drag keeps the aspect through the resize model. At the box the
   conversion measured (the figure's own rect: the image's border box, the gap and the caption) a
   converted shot therefore renders the pixels it rendered in the flow, which the fidelity gate
   measures. A trimmed, masked or dithered shot's frame takes the row the same way, its inline
   aspect ratio ignored, and its image stretches inside the frame. */
.ts-sheet .free > .shot-fig, .ts-sheet .free > .link > .shot-fig { height: 100%; min-height: 0; grid-template-rows: minmax(0, 1fr); grid-auto-rows: auto; align-content: start; }
.ts-sheet .free > .shot-fig > img.shot, .ts-sheet .free > .link > .shot-fig > img.shot { width: 100%; height: 100%; max-width: none; max-height: none; min-height: 0; object-fit: fill; }
.ts-sheet .free > .shot-fig > .shot-crop, .ts-sheet .free > .link > .shot-fig > .shot-crop { height: 100%; min-height: 0; aspect-ratio: auto !important; }
.ts-sheet .free > .shot-fig > .shot-crop > img.shot, .ts-sheet .free > .link > .shot-fig > .shot-crop > img.shot { object-fit: fill; }
/* the chart block (2.8.1): the diagram grammar's sizes */
.ts-sheet svg.chart { display: block; overflow: visible; }
.ts-sheet .free > svg.chart, .ts-sheet .free > .link > svg.chart { width: 100%; height: 100%; }
.ts-sheet svg.chart text { font-family: var(--text); font-size: 18px; fill: var(--ink-2); }
.ts-sheet svg.chart .title { font-family: var(--display); font-size: 20px; font-weight: 500; letter-spacing: -0.01em; fill: var(--ink); }
.ts-sheet svg.chart .legend text { font-size: 15px; }
.ts-sheet svg.chart .value { font-size: 15px; fill: var(--ink); }
.ts-sheet svg.chart .ink { stroke: var(--ink); }
.ts-sheet svg.chart .hair { stroke: var(--hair-soft); }
/* Google's bulleted and numbered list (2.2.12): the glyph or numeral in the 36 px key position,
   the item indented 36 px per level below the first */
.ts-sheet .plain.marked > .item { display: grid; grid-template-columns: 36px minmax(0, 1fr); padding: 12px 0; border-bottom: 1px solid var(--hair-soft); }
.ts-sheet .plain.marked > .item:last-child { border-bottom-color: var(--hair); }
.ts-sheet .plain.marked > .item > span { display: block; padding: 0; border-bottom: 0; }
.ts-sheet .plain.marked > .item > .num { font-variant-numeric: tabular-nums; }
.ts-sheet .plain.marked > .item > .glyph { font-size: 0.8em; line-height: 1.75; }
/* an empty table cell keeps its line box with no prompt in the markup (docs/FEATURES.md 2.3 item
   9): a zero width space before the empty paragraph, so the rows of an empty table stand at the
   text's height and the editor's hovered prompt draws on that line */
.ts-sheet .table .td > .para:empty::before { content: '\\200B'; }
/* the table's grid form (2.7.1, 2.7.2): merged cells and per cell rules */
.ts-sheet .table.grid { display: grid; grid-template-columns: var(--table-cols); }
.ts-sheet .table.grid > .tr { display: contents; }
/* a cell fills its track so its rule sits on the row's bottom edge and its fill covers the row, as
   in Google's table and the a:tbl the export writes; the vertical alignment moves to the content */
.ts-sheet .table.grid .td { align-self: stretch; align-content: var(--table-valign, start); }
.ts-sheet .table.grid > .tr.header .td { font-family: var(--display); font-weight: 500; letter-spacing: -0.01em; }

/* ---- the render surface: one visible slide, the sheet filling the viewport in present mode ---- */
.ts-render-surface { margin: 0; background: var(--paper); overflow: hidden; }
.ts-render-surface .ts-sheet.ts-present { position: absolute; left: -1px; top: -1px; border-color: transparent; box-shadow: none; }
`;
