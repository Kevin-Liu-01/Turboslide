/// <reference lib="dom" />
// The one measurer of the canvas conversion (gslides-parity SPEC-2 1.3, 0.72, 0.97, 0.104):
// the boxes `toCanvas` of @turboslide/schema/canvas reads from one rendered slide, in sheet pixels
// relative to the 1600 by 900 stage element, at Chromium's layout precision (1/64 px, the
// LayoutUnit; `MEASURE_PRECISION`). SPEC-2 1.3 said integers; the fidelity gate of 1.4
// (scripts/canvas-fidelity.mjs) measured what the integer rounding costs on the GT deck: the
// grammar layouts place blocks at fractional positions (a 5/7 column starts at x 731.5, a centred
// title's heading at y 420.4375), Chromium positions glyphs at subpixel x, and an object moved by
// up to half a pixel changes every glyph's antialiasing, so 104 of the 342 converted pairs missed
// the 0.5 percent budget at integers (mean 0.517 percent) and 3 at the measured values (the three
// dark theme pairs whose code panel carries the dark theme's 1 px border, a theme dependent
// geometry). The conversion writes the boxes as measured (docs/gslides-parity/build-2/b2.md
// records the request to the schema's `boxPos`). The editor runs the measurer on a hidden
// 1x sheet (packages/viewer/src/canvas-measure.ts) and the CLI, the MCP server and the hosted
// studio run it inside a headless sheet page (packages/headless/src/measure.ts `measureCanvas`
// evaluates its source), so the `pos` every transport writes are identical in Chromium. The
// selectors are `CANVAS_SELECTORS`, exported so the renderer and the measurer change together.
//
// Browser safe: no `node:` import, no React, and every function is self contained (its body
// references nothing from module scope except through its parameters), because `page.evaluate`
// takes the function's source text. `awaitSheetReady` is the readiness the two paths share
// before they measure: `document.fonts.ready`, every face the root's text uses loaded (the italic
// face included), every image under the root decoded, every dither canvas drawn (the Bayer
// screen of render/runtime.ts, so no runtime is needed), then two animation frames.
import type { CanvasBoxes } from '@turboslide/schema/canvas';

export type CanvasSelectors = {
  /** Every block root; a positioned block measures through its wrapper. */
  block: string;
  /** The freeform wrapper of a positioned block (render/slide.ts renderFreeform). */
  wrapper: string;
  /** The picture kinds' photograph. */
  picture: string;
  /** The plate of a picture kind. */
  plate: string;
  /** The title slide's mark under `.left-mid`. */
  titleMark: string;
  /** The closing's mark inside the plate. */
  closingMark: string;
  /** The prompt an empty Text draws with prompts on (render/blocks/prompt.ts). */
  prompt: string;
  /** The shown slide of a render surface, else any slide. */
  slide: string;
  /** The 1600 by 900 stage element the boxes are relative to. */
  stage: string;
};

/** The DOM the renderer writes and the measurer reads (SPEC-2 1.3); one place for both. */
export const CANVAS_SELECTORS: CanvasSelectors = {
  block: '[data-block]',
  wrapper: '.free[data-free]',
  picture: 'img.opener-img, img.mood-img',
  plate: '[data-slot="plate"]',
  titleMark: '.left-mid svg[data-raster="mark"]',
  closingMark: '[data-slot="plate"] svg.mark',
  prompt: '.prompt',
  slide: '.slide.is-on, .slide',
  stage: '.ts-stage, .stage',
};

/** The class the exporter sets on the sheet root to drop the objects' transforms (SPEC-2 1.5). */
export const MEASURE_CLASS = 'ts-measure';

/**
 * Steps per sheet pixel the boxes are rounded to: 64, Chromium's layout unit, so a measured box
 * is the box the layout computed and a converted object lands where the grammar drew it.
 */
export const MEASURE_PRECISION = 64;

/**
 * What one block's text needs (SPEC-2 2.1.5, 0.64): the height its line boxes plus the padding
 * take inside its box, and the largest font size of its text, what `block.autofit --apply` and
 * the `text/overflow` rule read. `box` is the block's measured box.
 */
export type FitBox = {
  box: [number, number, number, number];
  contentHeight?: number;
  fontSize?: number;
};

/**
 * The boxes of one rendered slide (SPEC-2 1.3): `blocks[id]` for every `[data-block]` under
 * `root` (a positioned block through its `.free[data-free]` wrapper, the round one `measureBoxes`
 * rule), `picture` for a picture kind's photograph, `plate` for its plate, `mark` for the title's
 * or the closing's mark, and `prompted`, the ids whose box came from a prompt (the block holds a
 * `.prompt` child), so `toCanvas` keeps at least one line box for them (0.97). Boxes are sheet
 * pixels relative to `stage` at 1/64 px (MEASURE_PRECISION); `getBoundingClientRect` with no
 * transform on the stage. A nested block (inside a composite) is measured too, under its own id; the
 * conversion places top level blocks only. Self contained for `page.evaluate`.
 */
export function measureCanvasBoxes(
  root: Element,
  stage: Element,
  selectors: CanvasSelectors = CANVAS_SELECTORS,
  precision = 64,
): CanvasBoxes {
  const origin = stage.getBoundingClientRect();
  const ox = origin.left;
  const oy = origin.top;
  // `precision` steps per sheet pixel: 64 is the layout unit (MEASURE_PRECISION), 1 the pixel
  const q = (v: number): number => Math.round(v * precision) / precision;
  const toBox = (el: Element): [number, number, number, number] => {
    const r = el.getBoundingClientRect();
    return [q(r.left - ox), q(r.top - oy), q(r.width), q(r.height)];
  };
  let slide: Element = root;
  for (const sel of selectors.slide.split(',')) {
    const found = root.matches(sel.trim()) ? root : root.querySelector(sel.trim());
    if (found) {
      slide = found;
      break;
    }
  }
  const blocks: Record<string, [number, number, number, number]> = {};
  const prompted: string[] = [];
  slide.querySelectorAll(selectors.block).forEach((el) => {
    const id = el.getAttribute('data-block');
    if (!id || id in blocks) return;
    const wrapper = el.parentElement ? el.parentElement.closest(selectors.wrapper) : null;
    const target = wrapper && wrapper.getAttribute('data-free') === id ? wrapper : el;
    blocks[id] = toBox(target);
    if (el.querySelector(selectors.prompt) !== null) prompted.push(id);
  });
  const out: CanvasBoxes = { blocks, prompted };
  const picture = slide.querySelector(selectors.picture);
  if (picture) out.picture = toBox(picture);
  const plate = slide.querySelector(selectors.plate);
  if (plate) out.plate = toBox(plate);
  const mark =
    slide.querySelector(selectors.titleMark) ?? slide.querySelector(selectors.closingMark);
  if (mark) out.mark = toBox(mark);
  return out;
}

/**
 * The height every block's text needs and its largest font size (SPEC-2 2.1.5): the bottom of
 * the lowest line box of the block's text nodes, less the block's top, plus the block's bottom
 * padding, rounded; the prompt's text is not content and is skipped. A block with no text has
 * no `contentHeight`. Self contained for `page.evaluate`.
 */
export function measureFitBoxes(
  root: Element,
  stage: Element,
  selectors: CanvasSelectors = CANVAS_SELECTORS,
): Record<string, FitBox> {
  const origin = stage.getBoundingClientRect();
  const ox = origin.left;
  const oy = origin.top;
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  if (!win) return {};
  const toBox = (el: Element): [number, number, number, number] => {
    const r = el.getBoundingClientRect();
    return [
      Math.round(r.left - ox),
      Math.round(r.top - oy),
      Math.round(r.width),
      Math.round(r.height),
    ];
  };
  let slide: Element = root;
  for (const sel of selectors.slide.split(',')) {
    const found = root.matches(sel.trim()) ? root : root.querySelector(sel.trim());
    if (found) {
      slide = found;
      break;
    }
  }
  const out: Record<string, FitBox> = {};
  slide.querySelectorAll(selectors.block).forEach((el) => {
    const id = el.getAttribute('data-block');
    if (!id || id in out) return;
    const wrapper = el.parentElement ? el.parentElement.closest(selectors.wrapper) : null;
    const target = wrapper && wrapper.getAttribute('data-free') === id ? wrapper : el;
    const entry: FitBox = { box: toBox(target) };
    let bottom = Number.NEGATIVE_INFINITY;
    let fontSize: number | undefined;
    const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (!(node.textContent ?? '').trim()) continue;
      const parent = node.parentElement;
      if (!parent || parent.closest(selectors.prompt) !== null) continue;
      const cs = win.getComputedStyle(parent);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const size = parseFloat(cs.fontSize);
      if (Number.isFinite(size) && (fontSize === undefined || size > fontSize)) fontSize = size;
      const range = doc.createRange();
      range.selectNodeContents(node);
      for (const rr of range.getClientRects()) {
        if (rr.width <= 0 || rr.height <= 0) continue;
        if (rr.bottom > bottom) bottom = rr.bottom;
      }
    }
    if (Number.isFinite(bottom)) {
      const top = target.getBoundingClientRect().top;
      const pad = parseFloat(win.getComputedStyle(target).paddingBottom) || 0;
      const inner = parseFloat(win.getComputedStyle(el).paddingBottom) || 0;
      entry.contentHeight = Math.round(bottom - top + Math.max(pad, inner));
    }
    if (fontSize !== undefined) entry.fontSize = Math.round(fontSize * 100) / 100;
    out[id] = entry;
  });
  return out;
}

/**
 * The readiness the editor and the headless page reach before they measure (SPEC-2 1.3, 0.97):
 * `document.fonts.ready`, then `document.fonts.load` for every face the root's text uses (style,
 * weight, size and family, so the italic face loads too, SPEC-2 7.1), `img.decode()` on every
 * image under the root, the dither draw on every `canvas.dither` under the root that no draw has
 * stamped `data-drawn` (the Bayer screen of render/runtime.ts at half the CSS size, one cell per
 * canvas pixel), then two animation frames. Every wait is bounded by `timeoutMs` (default 10 s)
 * so a page whose compositor produces no frames cannot hold the caller. Self contained for
 * `page.evaluate`: `waitForReady` of @turboslide/headless/ready evaluates it and keeps its own
 * reporting around it.
 */
export async function awaitSheetReady(root: Element, timeoutMs = 10_000): Promise<void> {
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  if (!win) return;
  const bounded = <T>(p: Promise<T>, fallback: T): Promise<T> =>
    Promise.race([p, new Promise<T>((r) => win.setTimeout(() => r(fallback), timeoutMs))]);
  await bounded(
    doc.fonts.ready.then(() => undefined),
    undefined,
  );
  const combos = new Set<string>();
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (!(node.textContent ?? '').trim()) continue;
    const el = node.parentElement;
    if (!el) continue;
    const cs = win.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const family = (cs.fontFamily.split(',')[0] ?? '').trim().replace(/^['"]|['"]$/g, '');
    if (!family) continue;
    const style = cs.fontStyle === 'italic' || cs.fontStyle.startsWith('oblique') ? 'italic ' : '';
    combos.add(`${style}${cs.fontWeight} ${cs.fontSize} ${family}`);
  }
  await Promise.all(
    [...combos].map((spec) =>
      bounded(
        doc.fonts.load(spec).catch(() => []),
        [],
      ),
    ),
  );
  const images = [...root.querySelectorAll('img')].filter((img) => {
    const r = img.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  await Promise.all(
    images.map((img) =>
      bounded(
        img.decode().catch(() => undefined),
        undefined,
      ),
    ),
  );
  // the dither ramp of the deck (render/runtime.ts DITHER_SCRIPT; tail.html lines 100 to 114):
  // an 8 by 8 Bayer screen, one cell per canvas pixel at half the CSS size, ink where
  // bayer8(y, x) / 64 < 1 - x / W on paper
  const themed =
    root.closest('.ts-sheet[data-theme]') ?? root.querySelector('.ts-sheet[data-theme]');
  const dark =
    (themed
      ? themed.getAttribute('data-theme')
      : doc.documentElement.getAttribute('data-theme')) === 'dark';
  const B4 = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ];
  const Q = [0, 2, 3, 1];
  const bayer8 = (r: number, c: number): number =>
    (B4[r % 4]?.[c % 4] ?? 0) * 4 + (Q[Math.floor((r % 8) / 4) * 2 + Math.floor((c % 8) / 4)] ?? 0);
  root.querySelectorAll<HTMLCanvasElement>('canvas.dither').forEach((canvas) => {
    if (canvas.dataset['drawn'] === '1') return;
    let W = Math.max(8, Math.round(canvas.clientWidth / 2));
    let H = Math.max(8, Math.round(canvas.clientHeight / 2));
    if (!canvas.clientWidth) {
      W = 505;
      H = 110;
    }
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = dark ? '#070707' : '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = dark ? '#f2f2f0' : '#070707';
    for (let y = 0; y < H; y += 1)
      for (let x = 0; x < W; x += 1) if (bayer8(y, x) / 64 < 1 - x / W) ctx.fillRect(x, y, 1, 1);
    canvas.dataset['drawn'] = '1';
  });
  await bounded(
    new Promise<void>((r) => win.requestAnimationFrame(() => win.requestAnimationFrame(() => r()))),
    undefined,
  );
}
