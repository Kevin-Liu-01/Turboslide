import { bayer8 } from '@turboslide/effects/bayer';

import { homeAsset } from '../assets';
import type { LiveContext } from './index';
import { installGuards, ms, onceInView, reduced, sequence, smoothstep } from './motion';
import type { DurationToken, SequenceBand } from './motion';

/**
 * The Bayer printer of the page's three fields (docs/LANDING.md 2.2, 2.3, 2.6, 3.2 H5, F1 and C1,
 * 3.5; build/integrator.md "Landing, day 0" 2.2, 2.3 and 6, with Kevin's answer 1). L4's file.
 *
 * Every field rests as a CSS still: a 1 bit picture of its cell grid used as a mask over a box
 * filled with the sheet's ink, so a kit or an appearance change prints it again with no script.
 * A motion prints the same cells on the field's canvas while `data-field-state="developing"`
 * hides the still, frame by frame on the tone curve with every cell switching in Bayer order, and
 * hands back to the still at its end (`data-field-state="still"`). The canvas and the still share
 * the grid and the scaling, so the last frame is the still's own pixels and the hand back moves
 * nothing:
 *
 * - H5, the hero's Blue Marble develops over `--ts-d-gather` (1,500 ms): a cell of the still lights
 *   when the curve reaches its threshold divided by the ink density of its 8 by 8 neighbourhood,
 *   so every region reaches its own tone together and every inked cell is lit at the end.
 * - F1, the strip gathers over `--ts-d-gather`: from a sparse field at 6 percent tone (the cells
 *   whose threshold is under 0.06) into the selection frame of its still, each cell's tone moving
 *   from 6 percent to its still's 0 or 1 on the curve.
 * - C1, the Rosetta Stone develops over `--ts-d-develop` (2,400 ms) from its tone map, the
 *   picture's tone times the curve against each threshold (prototype A's develop), held to the
 *   still's cells so the last frame is the still.
 *
 * On a ground darker than its text (the dark appearance, a dark kit) the print is the light
 * print's twin of integrator.md 2.2: the hero draws the disc's cells XOR the ink still, the
 * Rosetta Stone (whose extent is its whole box) the still's complement, both through the
 * complementary screen 63 - m; the strip draws its ink cells in either appearance. Reduced motion
 * never prints: the still is the field. A frame is one pass over the cells into an `ImageData`
 * (147,456 cells at 512 by 288), `requestAnimationFrame` runs only while a field prints, and a
 * kit, an appearance or a width change ends every print at its still (N1, 3.5).
 */

/** The share of the cells the strip's scattered start inks (2.3: "6 percent tone"). */
export const SCATTER_TONE = 0.06;
/** The neighbourhood of the hero's develop: an 8 by 8 window, the screen's own size. */
const WINDOW = 8;

/** A field's cells: `ink[i]` is 1 where the cell is drawn in the sheet's ink at the end. */
export type CellGrid = { cols: number; rows: number; ink: Uint8Array };

/**
 * When each cell switches as the curve's value `s` runs from 0 to 1: a cell is lit while
 * `on[i] <= s < off[i]`. Infinity never switches.
 */
export type Schedule = { cols: number; rows: number; on: Float32Array; off: Float32Array | null };

/** The screen's threshold of a cell, (m + 0.5) / 64, or (63 - m + 0.5) / 64 through its complement. */
export function threshold(row: number, col: number, complement: boolean): number {
  const m = bayer8(row, col);
  return ((complement ? 63 - m : m) + 0.5) / 64;
}

/**
 * The cells a field draws at the end: the light print's ink, or on a dark ground the disc XOR the
 * ink (the hero) or the ink's complement (a field whose extent is its whole box).
 */
export function targetCells(ink: CellGrid, disc: CellGrid | null, dark: boolean): CellGrid {
  if (!dark) return ink;
  const out = new Uint8Array(ink.ink.length);
  for (let i = 0; i < out.length; i += 1) {
    const inside = disc === null ? 1 : (disc.ink[i] ?? 0);
    out[i] = inside === 1 && ink.ink[i] !== 1 ? 1 : 0;
  }
  return { cols: ink.cols, rows: ink.rows, ink: out };
}

/**
 * H5: each drawn cell lights when the curve reaches its threshold over the ink density of its
 * 8 by 8 neighbourhood (a summed area table, one pass), capped at 1 so the last frame is the
 * still. Undrawn cells never light.
 */
export function densitySchedule(target: CellGrid, complement: boolean): Schedule {
  const { cols, rows, ink } = target;
  const sums = new Uint32Array((cols + 1) * (rows + 1));
  for (let y = 0; y < rows; y += 1) {
    let line = 0;
    for (let x = 0; x < cols; x += 1) {
      line += ink[y * cols + x] ?? 0;
      sums[(y + 1) * (cols + 1) + x + 1] = (sums[y * (cols + 1) + x + 1] ?? 0) + line;
    }
  }
  const on = new Float32Array(cols * rows).fill(Infinity);
  const half = WINDOW / 2;
  for (let y = 0; y < rows; y += 1) {
    const y0 = Math.max(0, y - half);
    const y1 = Math.min(rows, y + half);
    for (let x = 0; x < cols; x += 1) {
      const i = y * cols + x;
      if (ink[i] !== 1) continue;
      const x0 = Math.max(0, x - half);
      const x1 = Math.min(cols, x + half);
      const count =
        (sums[y1 * (cols + 1) + x1] ?? 0) -
        (sums[y0 * (cols + 1) + x1] ?? 0) -
        (sums[y1 * (cols + 1) + x0] ?? 0) +
        (sums[y0 * (cols + 1) + x0] ?? 0);
      const density = count / ((x1 - x0) * (y1 - y0));
      on[i] = Math.min(1, threshold(y, x, complement) / density);
    }
  }
  return { cols, rows, on, off: null };
}

/**
 * C1: each drawn cell lights when the picture's tone times the curve passes its threshold
 * (prototype A's develop), the tone sampled from the tone map at the cell's centre; a cell the
 * tone map would not ink lights on the last frame, so the print ends on the still. `tone` holds
 * the ink's share of each cell of the light print (0 paper, 1 ink); a dark print reads 1 - tone.
 */
export function toneSchedule(
  target: CellGrid,
  tone: { width: number; height: number; ink: Float32Array },
  complement: boolean,
): Schedule {
  const { cols, rows, ink } = target;
  const on = new Float32Array(cols * rows).fill(Infinity);
  for (let y = 0; y < rows; y += 1) {
    const ty = Math.min(tone.height - 1, Math.floor(((y + 0.5) / rows) * tone.height));
    for (let x = 0; x < cols; x += 1) {
      const i = y * cols + x;
      if (ink[i] !== 1) continue;
      const tx = Math.min(tone.width - 1, Math.floor(((x + 0.5) / cols) * tone.width));
      const share = tone.ink[ty * tone.width + tx] ?? 0;
      const value = complement ? 1 - share : share;
      const t = threshold(y, x, complement);
      on[i] = value > t ? t / value : 1;
    }
  }
  return { cols, rows, on, off: null };
}

/**
 * F1: each cell's tone moves from SCATTER_TONE to its still's 0 or 1 as `w + (g - w) s`, lit while
 * it passes the cell's threshold: a drawn cell switches on once, a scattered cell outside the
 * frame switches off once.
 */
export function gatherSchedule(target: CellGrid): Schedule {
  const { cols, rows, ink } = target;
  const on = new Float32Array(cols * rows);
  const off = new Float32Array(cols * rows);
  const w = SCATTER_TONE;
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const i = y * cols + x;
      const t = threshold(y, x, false);
      if (ink[i] === 1) {
        on[i] = t < w ? 0 : (t - w) / (1 - w);
        off[i] = Infinity;
      } else if (t < w) {
        on[i] = 0;
        off[i] = 1 - t / w;
      } else {
        on[i] = Infinity;
        off[i] = Infinity;
      }
    }
  }
  return { cols, rows, on, off };
}

/** The cells lit at the curve's value `s`, as 0 and 1 (the tests' and the drivers' reading). */
export function cellsAt(schedule: Schedule, s: number): Uint8Array {
  const out = new Uint8Array(schedule.on.length);
  const { on, off } = schedule;
  for (let i = 0; i < out.length; i += 1)
    out[i] = (on[i] ?? Infinity) <= s && (off === null || s < (off[i] ?? Infinity)) ? 1 : 0;
  return out;
}

/* ---- the page ---- */

const pictures = new Map<string, Promise<ImageData | null>>();

/** A picture's pixels at its own size (a still's cells, a tone map), decoded once per URL. */
export function pixelsOf(url: string): Promise<ImageData | null> {
  let found = pictures.get(url);
  if (found === undefined) {
    found = (async () => {
      try {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx === null) return null;
        ctx.drawImage(image, 0, 0);
        return ctx.getImageData(0, 0, canvas.width, canvas.height);
      } catch {
        return null;
      }
    })();
    pictures.set(url, found);
  }
  return found;
}

/** A still's cells: ink where the mask is opaque (alpha 128 and over), as the CSS mask draws it. */
export function cellsOfStill(pixels: ImageData): CellGrid {
  const ink = new Uint8Array(pixels.width * pixels.height);
  for (let i = 0; i < ink.length; i += 1) ink[i] = (pixels.data[i * 4 + 3] ?? 0) >= 128 ? 1 : 0;
  return { cols: pixels.width, rows: pixels.height, ink };
}

/** A CSS colour as RGBA bytes, read through a 1 by 1 canvas (any syntax the browser takes). */
export function rgbaOf(color: string): [number, number, number, number] {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (ctx === null) return [0, 0, 0, 255];
  ctx.fillStyle = '#000';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0, a = 255] = ctx.getImageData(0, 0, 1, 1).data;
  return [r, g, b, a];
}

/** The ink the still draws in: its masked element's computed background, the colour the CSS fills. */
export function inkOf(box: Element): [number, number, number, number] {
  const style = stillStyle(box);
  const fill = style.backgroundColor;
  return rgbaOf(fill && fill !== 'rgba(0, 0, 0, 0)' ? fill : getComputedStyle(box).color);
}

/** A field's box and its canvas, the markup L1 renders (l4.md M4). */
export type FieldBox = { box: HTMLElement; canvas: HTMLCanvasElement };

export function fieldBox(root: HTMLElement, name: 'hero' | 'strip' | 'canvas'): FieldBox | null {
  const selector = `[data-field="${name}"]`;
  const box = root.matches(selector) ? root : root.querySelector<HTMLElement>(selector);
  const canvas = box?.querySelector<HTMLCanvasElement>(':scope > canvas') ?? null;
  return box && canvas ? { box, canvas } : null;
}

/** Splits a computed list value at its top level commas (a data URI and a gradient hold commas). */
export function splitLayers(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = '';
  let start = 0;
  for (let i = 0; i < value.length; i += 1) {
    const c = value[i];
    if (quote !== '') {
      if (c === '\\') i += 1;
      else if (c === quote) quote = '';
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '(') depth += 1;
    else if (c === ')') depth -= 1;
    else if (c === ',' && depth === 0) {
      out.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(value.slice(start).trim());
  return out.filter((part) => part !== '');
}

/** The URL of a `url(...)` value, or null. */
export function urlOf(value: string): string | null {
  const match = /^url\(\s*(['"]?)(.*)\1\s*\)$/s.exec(value.trim());
  return match?.[2] ? match[2].replace(/\\(.)/g, '$1') : null;
}

/** Combines two mask layers as `mask-composite` does, the upper layer over the lower. */
export function compositeCells(op: string, upper: Uint8Array, lower: Uint8Array): Uint8Array {
  const out = new Uint8Array(upper.length);
  for (let i = 0; i < out.length; i += 1) {
    const a = upper[i] === 1;
    const b = lower[i] === 1;
    const on =
      op === 'exclude'
        ? a !== b
        : op === 'subtract'
          ? a && !b
          : op === 'intersect'
            ? a && b
            : a || b;
    out[i] = on ? 1 : 0;
  }
  return out;
}

/** The element that carries a field's still: its first child that is not the canvas, or ::before. */
function stillStyle(box: Element): CSSStyleDeclaration {
  const layer = [...box.children].find((child) => child.tagName !== 'CANVAS');
  return layer !== undefined ? getComputedStyle(layer) : getComputedStyle(box, '::before');
}

/**
 * The cells a field ends on: the still as its CSS draws it now, every mask layer of the still's
 * element decoded (a URL as its cells, a gradient as every cell) and combined by its
 * `mask-composite`, so the light print (the ink), the hero's dark twin (the disc XOR the ink) and
 * a field's complement read alike and the canvas's last frame is always the still's own pixels.
 * `ink` is the first URL layer, the light print, which the tone map's reading needs; `dark`
 * says the target is a dark twin, printed through the screen's complement.
 */
export async function targetOf(
  box: Element,
): Promise<{ target: CellGrid; ink: CellGrid; dark: boolean } | null> {
  const style = stillStyle(box);
  const images = splitLayers(style.maskImage || style.getPropertyValue('-webkit-mask-image'));
  const composites = splitLayers(
    style.maskComposite || style.getPropertyValue('-webkit-mask-composite') || 'add',
  );
  const urls = images.map(urlOf);
  if (!urls.some((url) => url !== null)) {
    /* no mask resolved yet (a still the band has not requested): read the box's own property */
    const own = urlOf(getComputedStyle(box).getPropertyValue('--ts-still'));
    if (own === null) return null;
    images.splice(0, images.length, `url("${own}")`);
    urls.splice(0, urls.length, own);
  }
  const decoded = await Promise.all(urls.map((url) => (url === null ? null : pixelsOf(url))));
  const first = decoded.find((pixels) => pixels !== null && pixels !== undefined);
  if (first === undefined || first === null) return null;
  const ink = cellsOfStill(first);
  const layers = decoded.map((pixels) =>
    pixels === null || pixels === undefined
      ? new Uint8Array(ink.ink.length).fill(1)
      : cellsOfStill(pixels).ink,
  );
  let target = layers[layers.length - 1] ?? ink.ink;
  for (let i = layers.length - 2; i >= 0; i -= 1)
    target = compositeCells(
      composites[i] ?? composites[composites.length - 1] ?? 'add',
      layers[i]!,
      target,
    );
  return {
    target: { cols: ink.cols, rows: ink.rows, ink: target },
    ink,
    dark: layers.length > 1,
  };
}

/** Every print running now, ended at its still by a kit, an appearance or a width change. */
const printing = new Set<() => void>();
let watching = false;

function watch(): void {
  if (watching) return;
  watching = true;
  const endAll = (): void => {
    for (const finish of [...printing]) finish();
  };
  new MutationObserver(endAll).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  const main = document.querySelector('main');
  if (main !== null)
    new MutationObserver(endAll).observe(main, {
      attributes: true,
      attributeFilter: ['data-page-kit'],
    });
  window.matchMedia('(max-width: 719px)').addEventListener('change', endAll);
}

/** A print armed or running on one field. */
export type Print = {
  /** the hidden first pose: the canvas shows the curve's 0 and hides the still */
  arm(): void;
  /** runs the curve from 0 to 1 over the token's duration, then hands back to the still */
  play(): void;
  /** the end state at once: the still */
  finish(): void;
  /** prints the curve's value `s` on the canvas once (the frame strips' and the drivers' reading) */
  draw(s: number): void;
};

/**
 * A print of `schedule` on a field's canvas in the box's ink, registered as a sequence of `band`
 * so input on the band, a hidden tab and reduced motion end it (motion.ts), and ended by a kit,
 * an appearance or a width change (N1).
 */
export function createPrint(
  field: FieldBox,
  schedule: Schedule,
  token: DurationToken,
  band: SequenceBand,
): Print {
  watch();
  const { box, canvas } = field;
  const { cols, rows, on, off } = schedule;
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext('2d');
  const image = ctx?.createImageData(cols, rows) ?? null;
  const words = image === null ? null : new Uint32Array(image.data.buffer);
  const [r, g, b, a] = inkOf(box);
  /* ImageData is RGBA in memory, so a little endian word reads ABGR */
  const inkWord = ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
  let frame = 0;
  let ended = false;
  let running: { done(): void } | null = null;

  const draw = (s: number): void => {
    if (ctx === null || image === null || words === null) return;
    if (off === null)
      for (let i = 0; i < words.length; i += 1) words[i] = (on[i] ?? Infinity) <= s ? inkWord : 0;
    else
      for (let i = 0; i < words.length; i += 1)
        words[i] = (on[i] ?? Infinity) <= s && s < (off[i] ?? Infinity) ? inkWord : 0;
    ctx.putImageData(image, 0, 0);
  };

  const finish = (): void => {
    if (ended) return;
    ended = true;
    cancelAnimationFrame(frame);
    printing.delete(finish);
    running?.done();
    box.setAttribute('data-field-state', 'still');
  };

  return {
    arm() {
      if (ended) return;
      draw(0);
      box.setAttribute('data-field-state', 'developing');
      printing.add(finish);
      running ??= sequence(band, finish);
    },
    play() {
      if (ended) return;
      if (reduced()) return finish();
      const duration = ms(token);
      if (duration === 0) return finish();
      if (!printing.has(finish)) this.arm();
      const start = performance.now();
      /* the page's clock, not the frame's timestamp, which a DevTools playback rate rescales */
      const step = (): void => {
        if (ended) return;
        const t = (performance.now() - start) / duration;
        if (t >= 1) {
          draw(1);
          finish();
          return;
        }
        draw(smoothstep(t));
        frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    },
    finish,
    draw,
  };
}

/**
 * The tone map of the canvas field (integrator.md 6, `canvas-tone`) as the ink's share per pixel
 * of the light print; `ink` is the light print's cells, which say whether the map holds the
 * luminance or the ink's share.
 */
export async function canvasTone(
  ink: CellGrid,
): Promise<{ width: number; height: number; ink: Float32Array } | null> {
  let url: string;
  try {
    url = homeAsset('canvas-tone', null).path;
  } catch {
    return null;
  }
  const pixels = await pixelsOf(url);
  if (pixels === null) return null;
  const { width, height, data } = pixels;
  const grey = new Float32Array(width * height);
  for (let i = 0; i < grey.length; i += 1) grey[i] = (data[i * 4] ?? 0) / 255;
  /* the map may hold the luminance or the ink's share; read which from the still it prints */
  let inkSum = 0;
  let inkN = 0;
  let paperSum = 0;
  let paperN = 0;
  for (let y = 0; y < ink.rows; y += 1) {
    const ty = Math.min(height - 1, Math.floor(((y + 0.5) / ink.rows) * height));
    for (let x = 0; x < ink.cols; x += 1) {
      const tx = Math.min(width - 1, Math.floor(((x + 0.5) / ink.cols) * width));
      const v = grey[ty * width + tx] ?? 0;
      if (ink.ink[y * ink.cols + x] === 1) {
        inkSum += v;
        inkN += 1;
      } else {
        paperSum += v;
        paperN += 1;
      }
    }
  }
  const luminanceMap = inkN > 0 && paperN > 0 && inkSum / inkN < paperSum / paperN;
  if (luminanceMap) for (let i = 0; i < grey.length; i += 1) grey[i] = 1 - (grey[i] ?? 0);
  return { width, height, ink: grey };
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

/**
 * A field armed below the viewport: the canvas shows nothing (the hidden first pose, set at once,
 * reading nothing), the schedule is read when the box comes within a viewport of the visible area,
 * so nothing is requested before the first scroll (4.1, 4.2), and the print plays at 35 percent in
 * view. A field whose stills cannot be read hands back to its still.
 */
function armedPrint(
  field: FieldBox,
  schedule: (read: NonNullable<Awaited<ReturnType<typeof targetOf>>>) => Promise<Schedule>,
  token: DurationToken,
  band: SequenceBand,
): void {
  let pending: Promise<Print | null> | null = null;
  let print: Print | null = null;
  let hold: { done(): void } | null = null;
  const read = (): Promise<Print | null> => {
    pending ??= targetOf(field.box)
      .then(async (cells) => {
        if (cells === null || field.box.getAttribute('data-field-state') !== 'developing')
          return null;
        print = createPrint(field, await schedule(cells), token, band);
        print.arm();
        return print;
      })
      .catch(() => null)
      .then((made) => {
        hold?.done();
        if (made === null && field.box.getAttribute('data-field-state') === 'developing')
          field.box.setAttribute('data-field-state', 'still');
        return made;
      });
    return pending;
  };
  onceInView(
    field.box,
    () => {
      /* the hidden first pose: a blank canvas over the hidden still, until the print is read */
      field.canvas.getContext('2d')?.clearRect(0, 0, field.canvas.width, field.canvas.height);
      field.box.setAttribute('data-field-state', 'developing');
      hold = sequence(band, () => {
        print?.finish();
        field.box.setAttribute('data-field-state', 'still');
      });
      whenNear(field.box, () => void read());
    },
    () => void read().then((made) => made?.play()),
  );
}

/** F1: the field strip gathers into the selection frame once (2.3). */
export function startStrip(ctx: LiveContext): void {
  installGuards();
  const field = fieldBox(ctx.band, 'strip');
  if (field === null || reduced()) return;
  armedPrint(field, async ({ target }) => gatherSchedule(target), 'gather', 'field');
}

/** C1: the Rosetta Stone develops once from its tone map (2.6; integrator.md 2.3). */
export function startCanvasField(ctx: LiveContext): void {
  installGuards();
  const field = fieldBox(ctx.band, 'canvas');
  if (field === null || reduced()) return;
  armedPrint(
    field,
    async ({ target, ink, dark }) => {
      const tone = await canvasTone(ink);
      return tone === null ? densitySchedule(target, dark) : toneSchedule(target, tone, dark);
    },
    'develop',
    'canvas',
  );
}
