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
.ts-sheet .material-label { position: absolute; left: 14px; bottom: 12px; font-size: 15px; line-height: 1.45; letter-spacing: 0.01em; color: var(--titanium); }
.ts-sheet .pair.gap-40 { gap: 40px; } /* s76:5 */
.ts-sheet .pair.cap-15 figcaption { font-size: 15px; } /* s63:5 */
/* tiles: the reference and direction grids (s13:3-7, s69:3-7) and the engine grid (s72:6-10) */
.ts-sheet .tiles { display: grid; gap: 18px 16px; }
.ts-sheet .tiles.cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.ts-sheet .tiles.cols-5 { grid-template-columns: repeat(5, minmax(0, 1fr)); }
.ts-sheet .tiles.cols-6 { grid-template-columns: repeat(6, minmax(0, 1fr)); }
.ts-sheet .tiles img { display: block; width: 100%; object-fit: cover; object-position: center; border: 1px solid var(--hair); background: var(--plate); }
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
.ts-sheet .details figure img { display: block; width: 425px; border: 1px solid var(--hair); background: var(--plate); object-fit: cover; object-position: center; }
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

/* ---- the render surface: one visible slide, the sheet filling the viewport in present mode ---- */
.ts-render-surface { margin: 0; background: var(--paper); overflow: hidden; }
.ts-render-surface .ts-sheet.ts-present { position: absolute; left: -1px; top: -1px; border-color: transparent; box-shadow: none; }
`;
