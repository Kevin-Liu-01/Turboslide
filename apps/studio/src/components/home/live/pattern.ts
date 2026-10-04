import { bayer8 } from '@turboslide/effects/bayer';

import { homeAsset } from '../assets';
import { HOME_PATTERN } from '../pattern.generated';
import { rgbaOf } from './field';
import type { LiveContext } from './index';
import { installGuards, loop, motionPaused, onFrame, onMotionChange, reduced } from './motion';
import type { PatternFit, PatternMount, ShaderColor } from './pattern-mount';

/**
 * The patterns band (docs/LANDING.md 2.13, 3.4 P-T, 4.2; B's animated patterns band). V4's file,
 * the band's chunk entry. Slide 8 twice, side by side: on the right the slide as `renderSlide`
 * draws it with the still frame the exporter stores for its Animated pattern (the role
 * `pattern-still` of the shown appearance, the capture's own pixels), and on the left the same
 * markup whose picture is the live shader (`live/pattern-mount.ts`, a chunk of its own) in the
 * slide's ink and paper, so the appearance and a kit restyle it.
 *
 * Nothing is requested before the band comes within one viewport height (4.2): then the still
 * frames, and, while motion is allowed, the shader chunk. Under reduced motion or with Pause Motion
 * pressed the chunk is not requested and both sides draw the still frame. The shader is the loop
 * P-T, a demonstration: it moves at the recipe's speed while the band is at least half in view and
 * the scheduler picks it, and holds its frame (speed 0, no frame) otherwise.
 *
 * `mountPattern` gives V3's show the same shader on slide 8's clone once the chunk has loaded,
 * through `window.tsHomePattern` (v3.md R11), so the show never imports this module.
 *
 * Both sides draw on the screen's own pixels (verify1 F9). The recipe's cell is 3 of the slide's
 * 1,600 units, 0.94 px on the 500 px slide, so the 3,200 by 1,800 still scaled by the page sampled
 * 15 cells in 16 and printed a moire grid of stripes and blocks. The shader renders at the box's
 * drawn device pixels with its cell rounded to whole pixels (`fitOf`), and the still frame is
 * printed on that grid (`printFrame`): each cell takes the exporter's frame's tone under it
 * (`frameCells`) against the threshold the shader gives the same cell, on a 2D canvas in the
 * frame's own two colours, so at the anchor the two sides print the same cells. The served file
 * stays the exporter's frame (the `.ts-field-still` layer the driver hashes), under the print.
 */

/** The pixels a pattern canvas holds at most: the slide's own 1,600 by 900 (pattern-mount.ts). */
const MAX_PIXELS = 1600 * 900;
/** The recipe's cell in the slide's units (the capture's `u_pxSize`). */
const CELL_UNITS = HOME_PATTERN.uniforms['u_pxSize'] ?? 3;

/** A box's drawn size in device pixels (at most MAX_PIXELS) and the recipe's cell in whole ones. */
export function fitOf(cssWidth: number, cssHeight: number, dpr: number, units = 1600): PatternFit {
  const over = Math.max(1, Math.sqrt((cssWidth * dpr * cssHeight * dpr) / MAX_PIXELS));
  const width = Math.max(1, Math.round((cssWidth * dpr) / over));
  const height = Math.max(1, Math.round((cssHeight * dpr) / over));
  return { width, height, cell: Math.max(1, Math.round((CELL_UNITS * width) / units)) };
}

/** Where the shader put its cells in a frame of `width` by `height`: centred, `px` pixels each. */
export type FrameGrid = { px: number; x0: number; y0: number; cols: number; rows: number };

export function frameGrid(width: number, height: number, units = 1600): FrameGrid {
  const px = (CELL_UNITS * width) / units;
  const x0 = (width / 2) % px;
  const y0 = (height / 2) % px;
  return {
    px,
    x0,
    y0,
    cols: Math.floor((width - x0) / px),
    rows: Math.floor((height - y0) / px),
  };
}

/** A frame's cells (1 where the shader's front colour lands) and the tone the print reads. */
export type FrameCells = {
  grid: FrameGrid;
  width: number;
  height: number;
  ink: Uint8Array;
  tone: Float32Array;
};

/** The summed area table of `a` (`cols + 1` by `rows + 1`). */
function summed(a: ArrayLike<number>, cols: number, rows: number): Float64Array {
  const w = cols + 1;
  const table = new Float64Array(w * (rows + 1));
  for (let r = 0; r < rows; r += 1) {
    let run = 0;
    for (let c = 0; c < cols; c += 1) {
      run += a[r * cols + c] ?? 0;
      table[(r + 1) * w + c + 1] = (table[r * w + c + 1] ?? 0) + run;
    }
  }
  return table;
}

/**
 * The sums over the window of rows `r + up` to `r + down` and columns `c + back` to `c + on` round
 * each cell (`up` and `back` at most 0, `down` and `on` at least 0), clipped to the grid, from a
 * summed area table.
 */
function windowSums(
  table: Float64Array,
  cols: number,
  rows: number,
  [up, down, back, on]: readonly [number, number, number, number],
): Float64Array {
  const w = cols + 1;
  const left = new Int32Array(cols);
  const right = new Int32Array(cols);
  for (let c = 0; c < cols; c += 1) {
    left[c] = Math.max(0, c + back);
    right[c] = Math.min(cols, c + on + 1);
  }
  const out = new Float64Array(cols * rows);
  for (let r = 0; r < rows; r += 1) {
    const top = Math.max(0, r + up) * w;
    const bottom = Math.min(rows, r + down + 1) * w;
    for (let c = 0; c < cols; c += 1) {
      const l = left[c] ?? 0;
      const rt = right[c] ?? 0;
      out[r * cols + c] =
        (table[bottom + rt] ?? 0) -
        (table[top + rt] ?? 0) -
        (table[bottom + l] ?? 0) +
        (table[top + l] ?? 0);
    }
  }
  return out;
}

/**
 * A frame's cells from one RGBA sample a cell (`grid.cols` by `grid.rows`, each taken at its
 * cell's centre): ink where the sample differs from the first cell's, which is the ground.
 *
 * Every 8 by 8 window of the screen holds each of its 64 thresholds once, so a window inside the
 * pattern holds ink wherever the tone is 1/64 or more, and its share of ink is the tone. A cell is
 * outside the pattern (the sphere's ground) when one of the four 8 by 8 windows with the cell at a
 * corner holds no ink; its tone is 0. Inside, the tone is the ink's share of the inside cells under
 * two passes of the 8 by 8 window: the first reads a flat tone exactly, the second evens out the
 * steps a gradient leaves as the window slides, and counting inside cells alone keeps the tone up
 * to the rim, so the print's edge is the frame's.
 */
export function frameCells(
  rgba: ArrayLike<number>,
  grid: FrameGrid,
  width: number,
  height: number,
): FrameCells {
  const { cols, rows } = grid;
  const n = cols * rows;
  const ink = new Uint8Array(n);
  for (let i = 0; i < n; i += 1)
    ink[i] =
      rgba[i * 4] !== rgba[0] || rgba[i * 4 + 1] !== rgba[1] || rgba[i * 4 + 2] !== rgba[2] ? 1 : 0;
  const table = summed(ink, cols, rows);
  const inside = new Uint8Array(n).fill(1);
  for (const corner of [
    [-7, 0, -7, 0],
    [-7, 0, 0, 7],
    [0, 7, -7, 0],
    [0, 7, 0, 7],
  ] as const) {
    const sums = windowSums(table, cols, rows, corner);
    for (let i = 0; i < n; i += 1) if ((sums[i] ?? 0) === 0) inside[i] = 0;
  }
  const twice = (a: ArrayLike<number>): Float64Array =>
    windowSums(
      summed(windowSums(summed(a, cols, rows), cols, rows, [-4, 3, -4, 3]), cols, rows),
      cols,
      rows,
      [-3, 4, -3, 4],
    );
  const inked = twice(ink);
  const counted = twice(inside);
  const tone = new Float32Array(n);
  for (let i = 0; i < n; i += 1)
    tone[i] = inside[i] === 1 ? (inked[i] ?? 0) / (counted[i] || 1) : 0;
  return { grid, width, height, ink, tone };
}

/**
 * The frame printed at `fit`, one entry a device pixel, 1 where the front colour lands: the cells
 * centred on the canvas as the shader centres its own, each lit when the tone of the frame cell
 * under its centre reaches the shader's threshold for it (`step(0.5, shape + bayer - 0.5)`, the
 * screen's rows counted up from the bottom as `gl_FragCoord` counts them).
 */
export function printFrame(frame: FrameCells, fit: PatternFit): Uint8Array {
  const { width: w, height: h, cell } = fit;
  const { px, x0, y0, cols, rows } = frame.grid;
  /* each pixel column's cell and the frame column under that cell's centre */
  const cellOf = new Int32Array(w);
  const colOf = new Int32Array(w);
  for (let x = 0; x < w; x += 1) {
    const gx = Math.floor((x + 0.5 - w / 2) / cell);
    cellOf[x] = gx;
    colOf[x] = Math.round(((((gx + 0.5) * cell + w / 2) / w) * frame.width - x0) / px - 0.5);
  }
  const out = new Uint8Array(w * h);
  const row = new Uint8Array(w);
  let last = Number.NaN;
  for (let y = 0; y < h; y += 1) {
    const gy = Math.floor((h / 2 - y - 0.5) / cell);
    if (gy !== last) {
      last = gy;
      const v = 1 - ((gy + 0.5) * cell + h / 2) / h;
      const r = Math.round((v * frame.height - y0) / px - 0.5);
      let lit = 0;
      for (let x = 0; x < w; x += 1) {
        const gx = cellOf[x] ?? 0;
        if (x === 0 || gx !== cellOf[x - 1]) {
          const c = colOf[x] ?? -1;
          const inside = r >= 0 && c >= 0 && r < rows && c < cols;
          const tone = inside ? (frame.tone[r * cols + c] ?? 0) : 0;
          lit = tone > 0 && tone >= 1 - bayer8(gy, gx) / 64 ? 1 : 0;
        }
        row[x] = lit;
      }
    }
    out.set(row, y * w);
  }
  return out;
}

type Chunk = typeof import('./pattern-mount');

let chunk: Chunk | null = null;
let requested: Promise<Chunk | null> | null = null;

/** The shader chunk, imported once; null when it does not load. */
function requestChunk(): Promise<Chunk | null> {
  requested ??= import('./pattern-mount').then(
    (module) => (chunk = module),
    (error: unknown) => {
      console.error('the pattern chunk did not load', error);
      return null;
    },
  );
  return requested;
}

/** The slide's paper and ink as the shader takes them, read where the picture sits. */
function colorsOf(el: Element): { paper: ShaderColor; ink: ShaderColor } {
  const style = getComputedStyle(el);
  const vec = (value: string): ShaderColor => {
    const [r, g, b, a] = rgbaOf(value);
    return [r / 255, g / 255, b / 255, a / 255];
  };
  const paper = style.getPropertyValue('--paper').trim() || style.getPropertyValue('--pt-paper');
  const ink = style.getPropertyValue('--ink').trim() || style.getPropertyValue('--pt-ink');
  return { paper: vec(paper.trim() || '#fff'), ink: vec(ink.trim() || '#000') };
}

/** The shader's canvas covers the still frame once it has drawn a frame (two frames later). */
function revealWhenDrawn(box: HTMLElement): void {
  let frames = 0;
  const stop = onFrame(() => {
    frames += 1;
    if (frames < 2) return;
    stop();
    box.setAttribute('data-pattern-live', '');
  });
}

/**
 * Slide 8's pattern moving on a clone the show draws (V3's request R14): null when the shader
 * chunk has not loaded, under reduced motion or with Pause Motion pressed, so the clone keeps its
 * still frame; it never requests the chunk itself.
 */
export function mountPattern(slide: HTMLElement): { stop(): void } | null {
  if (chunk === null || reduced() || motionPaused()) return null;
  const box = slide.querySelector<HTMLElement>('[data-field="pattern"]');
  if (box === null) return null;
  const mount = chunk.createPatternMount(box, colorsOf(box), fitNow(box));
  revealWhenDrawn(box);
  mount.play();
  return {
    stop() {
      mount.dispose();
      box.removeAttribute('data-pattern-live');
    },
  };
}

declare global {
  interface Window {
    /** interface merging: the show's doorway to the pattern (v3.md R11), set when this module loads */
    tsHomePattern?: { mount(slide: HTMLElement): { stop(): void } | null };
  }
}

/* the show calls the pattern through the window, so the present band's chunk never imports this
   module (v3.md R11) */
if (typeof window !== 'undefined') window.tsHomePattern = { mount: mountPattern };

/** The box's fit now, or null before it is laid out. */
function fitNow(box: HTMLElement): PatternFit | null {
  const rect = box.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  return fitOf(rect.width, rect.height, window.devicePixelRatio || 1, box.offsetWidth || 1600);
}

/** The page's appearance, which picks the still frame's file. */
const shownAppearance = (): 'light' | 'dark' => {
  const theme = document.documentElement.dataset['theme'];
  if (theme === 'dark' || theme === 'light') return theme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

type Frame = { cells: FrameCells; paper: number; front: number };
const frames = new Map<'light' | 'dark', Promise<Frame | null>>();

/**
 * The still frame of an appearance as its cells, read once: the served file (the request the
 * still layer's background made, so the memory cache answers) drawn one pixel a cell at the cells'
 * centres with no smoothing.
 */
function frameOf(shown: 'light' | 'dark'): Promise<Frame | null> {
  let found = frames.get(shown);
  if (found === undefined) {
    found = (async () => {
      try {
        const image = new Image();
        image.src = homeAsset('pattern-still', shown).path;
        await image.decode();
        const { naturalWidth: width, naturalHeight: height } = image;
        const grid = frameGrid(width, height);
        const canvas = document.createElement('canvas');
        canvas.width = grid.cols;
        canvas.height = grid.rows;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx === null || grid.cols < 1 || grid.rows < 1) return null;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(
          image,
          grid.x0,
          grid.y0,
          grid.cols * grid.px,
          grid.rows * grid.px,
          0,
          0,
          grid.cols,
          grid.rows,
        );
        const data = ctx.getImageData(0, 0, grid.cols, grid.rows).data;
        const cells = frameCells(data, grid, width, height);
        const view = new Uint32Array(data.buffer);
        const at = cells.ink.indexOf(1);
        return { cells, paper: view[0] ?? 0, front: at < 0 ? (view[0] ?? 0) : (view[at] ?? 0) };
      } catch {
        /* no still frame (no role written, or no decode): the still layer stays */
        return null;
      }
    })();
    frames.set(shown, found);
  }
  return found;
}

/**
 * Prints the still frame on each box at the fit (the boxes share it, so the print is computed
 * once): a canvas over the still layer, which `data-pattern-printed` hides (motion.css); until it
 * is drawn the layer shows.
 */
let printing = 0;
async function printStill(boxes: HTMLElement[], fit: PatternFit): Promise<void> {
  const token = (printing += 1);
  const frame = await frameOf(shownAppearance());
  /* a later print (an appearance change, a resize) wins */
  if (frame === null || token !== printing) return;
  const lit = printFrame(frame.cells, fit);
  const image = new ImageData(fit.width, fit.height);
  const pixels = new Uint32Array(image.data.buffer);
  for (let i = 0; i < lit.length; i += 1) pixels[i] = lit[i] === 1 ? frame.front : frame.paper;
  for (const box of boxes) {
    let canvas = box.querySelector<HTMLCanvasElement>(':scope > canvas.ts-pattern-print');
    if (canvas === null) {
      canvas = document.createElement('canvas');
      canvas.className = 'ts-pattern-print';
      canvas.setAttribute('aria-hidden', 'true');
      box.append(canvas);
    }
    canvas.width = fit.width;
    canvas.height = fit.height;
    canvas.getContext('2d')?.putImageData(image, 0, 0);
    box.setAttribute('data-pattern-printed', '');
  }
}

/** The still frame's two files on the band, which motion.css draws by the appearance. */
function setStills(band: HTMLElement): void {
  for (const appearance of ['light', 'dark'] as const) {
    try {
      const { path } = homeAsset('pattern-still', appearance);
      band.style.setProperty(`--ts-pattern-still-${appearance}`, `url("${path}")`);
    } catch {
      /* the build has not written the role: the box keeps the slide's print */
      return;
    }
  }
  band.setAttribute('data-pattern-stills', '');
}

/** Runs `fn` once when `el` comes within one viewport height of the visible area (4.2). */
function whenNear(el: Element, fn: () => void): void {
  const near = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      near.disconnect();
      fn();
    },
    { rootMargin: '100% 0px' },
  );
  near.observe(el);
}

/** A clone of the right slide for the left box, when the build did not fill the left itself. */
function leftSlide(moving: HTMLElement, right: HTMLElement): HTMLElement {
  const found = moving.querySelector<HTMLElement>('[data-home-slides]');
  if (found !== null) return found;
  const clone = right.cloneNode(true) as HTMLElement;
  clone.dataset['instance'] = 'patterns-moving';
  for (const node of clone.querySelectorAll('[id]')) node.removeAttribute('id');
  (moving.querySelector<HTMLElement>('.ts-home-sheet') ?? moving).append(clone);
  return clone;
}

export function start(ctx: LiveContext): void {
  installGuards();
  const band = ctx.band;
  const still = band.querySelector<HTMLElement>('[data-pattern="still"]');
  const moving = band.querySelector<HTMLElement>('[data-pattern="moving"]');
  if (still == null || moving == null) return;
  const right = still.querySelector<HTMLElement>('[data-home-slides]');
  if (right === null) return;
  const left = leftSlide(moving, right);
  /* the left draws the same words as the right, which carries them for assistive technology */
  left.setAttribute('aria-hidden', 'true');
  const box = left.querySelector<HTMLElement>('[data-field="pattern"]');
  const stillBox = right.querySelector<HTMLElement>('[data-field="pattern"]');
  if (box === null || stillBox === null) return;
  /* the field printer's canvas has no use under the shader */
  box.querySelector(':scope > canvas')?.remove();

  let near = false;
  let running = false;
  let mount: PatternMount | null = null;

  /* the boxes' drawn size: the shader's canvas and the still's print follow it */
  let fit: PatternFit | null = null;
  const refit = (force: boolean): void => {
    const next = fitNow(box);
    if (next === null) return;
    const same =
      fit !== null &&
      fit.width === next.width &&
      fit.height === next.height &&
      fit.cell === next.cell;
    if (same && !force) return;
    fit = next;
    mount?.fit(next);
    if (near) void printStill([box, stillBox], next);
  };
  const ensure = (): void => {
    if (mount !== null || !near || reduced() || motionPaused()) return;
    void requestChunk().then((loaded) => {
      if (loaded === null || mount !== null || reduced()) return;
      mount = loaded.createPatternMount(box, colorsOf(box), fit ?? fitNow(box));
      revealWhenDrawn(box);
      if (running && !motionPaused()) mount.play();
    });
  };
  whenNear(band, () => {
    near = true;
    setStills(band);
    refit(true);
    ensure();
  });
  onMotionChange(ensure);
  new ResizeObserver(() => refit(false)).observe(band);

  /* a kit or an appearance change restyles the shader (the still frame is the export's, and an
     appearance change prints the other appearance's frame) */
  const recolor = (): void => {
    if (mount === null) return;
    const { paper, ink } = colorsOf(box);
    mount.recolor(paper, ink);
  };
  new MutationObserver(() => {
    recolor();
    /* the still layer shows the shown appearance's file until the print of it is drawn */
    for (const printed of [box, stillBox]) printed.removeAttribute('data-pattern-printed');
    refit(true);
  }).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  new MutationObserver(recolor).observe(left, { attributes: true, attributeFilter: ['style'] });
  const main = document.querySelector('main');
  if (main !== null)
    new MutationObserver(recolor).observe(main, {
      attributes: true,
      attributeFilter: ['data-page-kit'],
    });

  const pair = ctx.reserve ?? moving.parentElement ?? band;
  loop('patterns', pair, {
    kind: 'demonstration',
    play() {
      running = true;
      ensure();
      mount?.play();
    },
    pause() {
      running = false;
      mount?.pause();
    },
    still() {
      running = false;
      mount?.still();
    },
  });
}
