import { REDUCED_MOTION, SCREEN, inkOf, onAppearance, rgbOf } from './cells';
import type { Rgb } from './cells';
import { FIELD_QUIET, paintArt } from './chapter-fields';
import type { FieldArt } from './chapter-fields';
import {
  FIELD_FONT_PX,
  FOCUS,
  LENS_RADIUS,
  SHEET,
  SOURCE,
  WORD_FONT_PX,
  alphaOf,
  cellFor,
  cellsOf,
  cover,
  fadeAt,
  layoutKey,
  lensAt,
  revealAt,
  spansOf,
} from './field';
import type { Cells, Rect } from './field';

import toneUrl from './pictures/lighthouse-tone.webp?url';

/** The Blue Marble the agents chapter's globe prints, the hero deck's own copy (public/hero/). */
const GLOBE_URL = '/hero/earth.jpg';

/** The device pixel ratio the field draws at, at most 2. */
const MAX_DPR = 2;
/** The word the footer's field draws, and the share of the field's width it spans. */
const WORD = 'Turboslide';
const WORD_SPAN = 0.96;
/** How far around content that must read its cells stay paper, in field px. */
const CLEAR_PAD = 8;
/** How far from the view a field counts as near: it starts there, and draws again on a resize. */
const NEAR_MARGIN = '100% 0px';
/** What the lens never reaches through: the cleared copy, the figure that ends the band, controls. */
const OPAQUE = '[data-field-clear], [data-field-end], a, button, input, textarea';

type Grid = {
  cols: number;
  rows: number;
  dpr: number;
  /** the tone of each cell, 0 paper to 1 ink, already through the fade */
  tone: Float32Array;
  /** the cells content asked to keep clear */
  clear: Uint8Array;
};

/** The cells the lens picks out: the indices from `first` to `last` of one copy of a span. */
type Picked = { first: number; last: number };

/** What a field draws: the lighthouse slide behind the hero, or the name in the footer. */
export type FieldKind = 'slide' | 'word';

/** What a field prints: its kind, a chapter's art and the source its glyphs are set in. */
type FieldOptions = { kind?: FieldKind; art?: FieldArt; source?: string };

/**
 * Draws a field of the site into `node` and returns what stops it (SiteField.tsx draws the canvas
 * and calls this on mount; on /home's static load the page's script calls it for each canvas,
 * home-entry.ts). A field (field.ts; Kevin, 2026-10-30) is one canvas filling its parent, a text
 * portrait set in the lighthouse slide's own JSON in Katagami Mono. The hero's field (`slide`)
 * draws the slide's photograph; the footer's field (`word`) draws the name in Katagami Text the
 * same way.
 *
 * The field prints itself once through the deck's 8 by 8 Bayer screen (`SCREEN`, REVEAL_MS), the
 * same screen the product's two tone pictures use, so it arrives as a dither instead of a fade.
 * Under the pointer a lens inks every cell, so the source reads there, and picks out the key and
 * value under the pointer in the site's accent (`spansOf`). A redraw clears a region snapped to
 * device pixels and draws the cells one cell past it, so a glyph that reaches into its neighbour
 * leaves no sliver behind.
 *
 * The canvas is decorative (`aria-hidden`) and costs nothing at rest: it draws once per grid
 * (field.ts `layoutKey`: the cells, the device pixel ratio and the cells kept clear), appearance
 * and font, the footer's on its first approach to the screen, and after that only the cells under
 * a moving lens. A resize that leaves the grid as it was draws nothing, and a field more than a
 * screen from the view draws for a resize or an appearance only once it comes near again. Content
 * that must read over the field carries `data-field-clear`; its cells stay paper, and with the
 * value `band` its rows stay paper across the field.
 *
 * A chapter's field (Chapters.tsx) passes `art` and `source`: it prints that art
 * (chapter-fields.ts `paintArt`) in that source, unfaded and at FIELD_QUIET of the ink at rest
 * (Kevin, 2026-11-04: "make the text in the back more subtle"), and draws on its first approach to
 * the screen, as the footer's does.
 */
export function attachField(
  node: HTMLCanvasElement,
  { kind = 'slide', art, source = SOURCE }: FieldOptions = {},
): () => void {
  const host = node.parentElement;
  const g = node.getContext('2d', { alpha: true });
  if (host === null || !g) return () => undefined;
  const reduced = window.matchMedia(REDUCED_MOTION);
  const fontPx = kind === 'word' ? WORD_FONT_PX : FIELD_FONT_PX;
  const cell = cellFor(fontPx);
  let grid: Grid | null = null;
  let ink: Rgb = inkOf(host);
  let accent: Rgb = ink;
  let family = getComputedStyle(node).fontFamily;
  let picture: HTMLImageElement | null = null;
  let started = false;
  let cancelled = false;
  /* the reveal: when it began, and the progress the canvas holds (a cell is drawn once its
     threshold in the screen is under it) */
  let revealStart = -1;
  let shown = 0;
  let revealFrame = 0;
  /* the lens: its centre in field px, null while the pointer is away */
  let lens: { x: number; y: number } | null = null;
  let goal: { x: number; y: number } | null = null;
  let picked: Picked | null = null;
  let lensFrame = 0;
  /* what the canvas was last drawn for (field.ts `layoutKey`) */
  let drawnFor = '';

  /* the name's letters are thin against a cell, so its stream leaves out the spaces */
  const stream = kind === 'word' && art === undefined ? source.replace(/\s+/g, '') : source;
  const { spans, at } = spansOf(stream);
  const charAt = (i: number): string => stream[i % stream.length] ?? ' ';
  const thresholdOf = (col: number, row: number): number => SCREEN[(row & 7) * 8 + (col & 7)] ?? 1;

  /** Paints the slide's photograph into the sample, one pixel a cell. */
  const paintSlide = (
    s: CanvasRenderingContext2D,
    box: DOMRect,
    cols: number,
    rows: number,
  ): void => {
    if (picture === null) return;
    /* the photograph covers the band over the element that ends it (the editor's figure);
       under the band the water's last row continues and fades out */
    const end = host.querySelector('[data-field-end]')?.getBoundingClientRect();
    const band = {
      w: box.width,
      h: Math.max(480, Math.min(box.height, end === undefined ? box.height : end.top - box.top)),
    };
    const map = cover(SHEET, band, FOCUS);
    s.drawImage(
      picture,
      map.x / cell.w,
      map.y / cell.h,
      (SHEET.w * map.scale) / cell.w,
      (SHEET.h * map.scale) / cell.h,
    );
    const bottom = Math.min(rows, Math.floor((map.y + SHEET.h * map.scale) / cell.h));
    if (bottom < rows && bottom > 0)
      s.drawImage(s.canvas, 0, bottom - 1, cols, 1, 0, bottom, cols, rows - bottom);
  };

  /** Paints the name into the sample, centred, as wide as the field allows. */
  const paintWord = (s: CanvasRenderingContext2D, box: DOMRect): void => {
    const sans = getComputedStyle(host).getPropertyValue('--site-text').trim() || 'sans-serif';
    s.save();
    s.scale(1 / cell.w, 1 / cell.h);
    s.font = `500 100px ${sans}`;
    const size = Math.min(
      box.height * 0.92,
      (100 * box.width * WORD_SPAN) / s.measureText(WORD).width,
    );
    s.font = `500 ${size}px ${sans}`;
    s.textAlign = 'center';
    s.textBaseline = 'middle';
    s.fillStyle = '#fff';
    s.fillText(WORD, box.width / 2, box.height / 2);
    s.restore();
  };

  /** Readies the context for a batch of glyphs; the colour is set per alpha step. */
  const pen = (): void => {
    if (grid === null) return;
    g.setTransform(grid.dpr, 0, 0, grid.dpr, 0, 0);
    g.font = `400 ${fontPx}px ${family}`;
    g.textBaseline = 'middle';
    g.textAlign = 'center';
  };

  /* the last fill the pen set, so a run of cells at one alpha sets it once */
  let lastFill = '';
  const fill = (rgb: Rgb, alpha: number): void => {
    const style = `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]} / ${alpha})`;
    if (style !== lastFill) {
      g.fillStyle = style;
      lastFill = style;
    }
  };

  /** Draws one cell over what the canvas holds, if the reveal has reached it. */
  const paintCell = (col: number, row: number): void => {
    if (grid === null) return;
    const i = row * grid.cols + col;
    if (grid.clear[i] === 1 || thresholdOf(col, row) >= shown) return;
    const x = col * cell.w + cell.w / 2;
    const y = row * cell.h + cell.h / 2;
    if (picked !== null && i >= picked.first && i <= picked.last) {
      fill(accent, 1);
      g.fillText(charAt(i), x, y);
      return;
    }
    const strength = lens === null ? 0 : lensAt(Math.hypot(x - lens.x, y - lens.y));
    /* a chapter's field sits quieter than the hero's at rest; the lens brings it to full */
    const quiet = art === undefined ? 1 : FIELD_QUIET + (1 - FIELD_QUIET) * strength;
    const alpha = alphaOf(grid.tone[i] ?? 0, strength) * quiet;
    if (alpha <= 0.01) return;
    fill(ink, Math.round(alpha * 20) / 20);
    g.fillText(charAt(i), x, y);
  };

  /** Draws a rect of field px again: cleared on whole device pixels, its cells drawn one past it. */
  const redraw = (rect: Rect): void => {
    if (grid === null) return;
    const { dpr } = grid;
    const x0 = Math.floor(rect.x * dpr) / dpr;
    const y0 = Math.floor(rect.y * dpr) / dpr;
    const x1 = Math.ceil((rect.x + rect.w) * dpr) / dpr;
    const y1 = Math.ceil((rect.y + rect.h) * dpr) / dpr;
    pen();
    g.save();
    g.beginPath();
    g.rect(x0, y0, x1 - x0, y1 - y0);
    g.clip();
    g.clearRect(x0, y0, x1 - x0, y1 - y0);
    const c = cellsOf(
      { x: x0 - cell.w, y: y0 - cell.h, w: x1 - x0 + 2 * cell.w, h: y1 - y0 + 2 * cell.h },
      grid,
      cell,
    );
    lastFill = '';
    for (let row = c.r0; row < c.r1; row += 1)
      for (let col = c.c0; col < c.c1; col += 1) paintCell(col, row);
    g.restore();
    lastFill = '';
  };

  /** The rect of field px a lens at a point inks. */
  const lensRect = (point: { x: number; y: number }): Rect => ({
    x: point.x - LENS_RADIUS,
    y: point.y - LENS_RADIUS,
    w: 2 * LENS_RADIUS,
    h: 2 * LENS_RADIUS,
  });

  /** The rect of field px a picked span covers: its row, or its rows across the field. */
  const pickedRect = (p: Picked): Rect | null => {
    if (grid === null) return null;
    const r0 = Math.floor(p.first / grid.cols);
    const r1 = Math.floor(p.last / grid.cols);
    if (r0 === r1)
      return {
        x: (p.first % grid.cols) * cell.w,
        y: r0 * cell.h,
        w: ((p.last % grid.cols) - (p.first % grid.cols) + 1) * cell.w,
        h: cell.h,
      };
    return { x: 0, y: r0 * cell.h, w: grid.cols * cell.w, h: (r1 - r0 + 1) * cell.h };
  };

  /** The copy of the span under a point, or null over punctuation, paper or a cleared cell. */
  const pickAt = (point: { x: number; y: number } | null): Picked | null => {
    if (grid === null || point === null) return null;
    const col = Math.floor(point.x / cell.w);
    const row = Math.floor(point.y / cell.h);
    if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return null;
    const i = row * grid.cols + col;
    if (grid.clear[i] === 1) return null;
    const n = at[i % stream.length] ?? -1;
    const span = spans[n];
    if (span === undefined) return null;
    const base = i - (i % stream.length);
    return {
      first: Math.max(0, base + span.start),
      last: Math.min(grid.cols * grid.rows - 1, base + span.end - 1),
    };
  };

  /** Moves the lens to the goal: draws again where it was and where it is, and the two spans. */
  const moveLens = (): void => {
    lensFrame = 0;
    const was = lens;
    const before = picked;
    lens = goal;
    picked = pickAt(lens);
    const rects: Rect[] = [];
    if (was !== null) rects.push(lensRect(was));
    if (lens !== null) rects.push(lensRect(lens));
    for (const p of [before, picked]) {
      const r = p === null ? null : pickedRect(p);
      if (r !== null) rects.push(r);
    }
    /* two lens rects that overlap draw as one, so no cell is drawn twice in a frame */
    const [a, b] = rects;
    if (rects.length >= 2 && a !== undefined && b !== undefined && overlaps(a, b)) {
      rects.splice(0, 2, union(a, b));
    }
    for (const rect of rects) redraw(rect);
  };

  /** Draws the cells the reveal has reached since the last frame, then asks for the next. */
  const revealStep = (now: number): void => {
    revealFrame = 0;
    if (grid === null) return;
    const next = reduced.matches ? 1 : revealAt(now - revealStart);
    const from = shown;
    shown = next;
    pen();
    lastFill = '';
    for (let k = 0; k < 64; k += 1) {
      const t = SCREEN[k] ?? 1;
      if (t < from || t >= next) continue;
      for (let row = k >> 3; row < grid.rows; row += 8)
        for (let col = k & 7; col < grid.cols; col += 8) paintCell(col, row);
    }
    lastFill = '';
    if (next < 1) revealFrame = window.requestAnimationFrame(revealStep);
  };

  /** The cells content asks to keep clear; `data-field-clear="band"` clears its rows across. */
  const clearCells = (box: DOMRect, size: { cols: number; rows: number }): Cells[] => {
    const out: Cells[] = [];
    for (const el of host.querySelectorAll<HTMLElement>('[data-field-clear]')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      const band = el.dataset.fieldClear === 'band';
      const x = band ? 0 : r.left - box.left;
      const w = band ? box.width : r.width;
      out.push(
        cellsOf(
          {
            x: x - CLEAR_PAD,
            y: r.top - box.top - CLEAR_PAD,
            w: w + 2 * CLEAR_PAD,
            h: r.height + 2 * CLEAR_PAD,
          },
          size,
          cell,
        ),
      );
    }
    return out;
  };

  /** Samples what the field draws and draws it whole; unless forced, only for a new grid. */
  const build = (force: boolean): void => {
    const box = host.getBoundingClientRect();
    if (box.width === 0) return;
    if (
      art === undefined ? kind === 'slide' && picture === null : art === 'globe' && picture === null
    )
      return;
    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    const cols = Math.max(1, Math.ceil(box.width / cell.w));
    const rows = Math.max(1, Math.ceil(box.height / cell.h));
    const clearAt = clearCells(box, { cols, rows });
    const end =
      kind === 'slide' && art === undefined
        ? host.querySelector('[data-field-end]')?.getBoundingClientRect()
        : undefined;
    const key = layoutKey(
      { cols, rows, dpr },
      clearAt,
      end === undefined ? null : Math.floor((end.top - box.top) / cell.h),
    );
    if (!force && grid !== null && key === drawnFor) return;
    drawnFor = key;
    /* setting a canvas's size reallocates and clears its bitmap, so only a new size sets it; the
       whole redraw below clears what the same size held */
    const width = Math.round(cols * cell.w * dpr);
    const height = Math.round(rows * cell.h * dpr);
    if (node.width !== width) node.width = width;
    if (node.height !== height) node.height = height;
    node.style.width = `${cols * cell.w}px`;
    node.style.height = `${rows * cell.h}px`;
    const sample = document.createElement('canvas');
    sample.width = cols;
    sample.height = rows;
    const s = sample.getContext('2d', { willReadFrequently: true });
    if (s === null) return;
    s.imageSmoothingQuality = 'high';
    if (art !== undefined) {
      s.save();
      s.scale(1 / cell.w, 1 / cell.h);
      paintArt(s, box, art, picture);
      s.restore();
    } else if (kind === 'slide') paintSlide(s, box, cols, rows);
    else paintWord(s, box);
    const data = s.getImageData(0, 0, cols, rows).data;
    const values = new Float32Array(cols * rows);
    for (let row = 0; row < rows; row += 1) {
      const fade = kind === 'slide' && art === undefined ? fadeAt(row, rows) : 1;
      for (let col = 0; col < cols; col += 1) {
        const i = row * cols + col;
        /* the ink follows the picture's light in both appearances, a positive on ink and a
           negative on paper, so the night sky over the title stays open */
        values[i] = ((data[i * 4] ?? 0) / 255) * fade;
      }
    }
    const clear = new Uint8Array(cols * rows);
    for (const c of clearAt)
      for (let row = c.r0; row < c.r1; row += 1)
        clear.fill(1, row * cols + c.c0, row * cols + c.c1);
    grid = { cols, rows, dpr, tone: values, clear };
    picked = pickAt(lens);
    /* the first build starts the reveal; a later one draws at the reveal's current progress */
    const now = performance.now();
    if (revealStart < 0) revealStart = now;
    shown = reduced.matches ? 1 : revealAt(now - revealStart);
    redraw({ x: 0, y: 0, w: cols * cell.w, h: rows * cell.h });
    node.dataset.ready = '';
    window.cancelAnimationFrame(revealFrame);
    revealFrame = shown < 1 ? window.requestAnimationFrame(revealStep) : 0;
  };

  const onMove = (event: PointerEvent): void => {
    if (grid === null) return;
    if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(OPAQUE)) {
      onLeave();
      return;
    }
    const box = host.getBoundingClientRect();
    goal = { x: event.clientX - box.left, y: event.clientY - box.top };
    if (lensFrame === 0) lensFrame = window.requestAnimationFrame(moveLens);
  };
  const onLeave = (): void => {
    if (goal === null && lens === null) return;
    goal = null;
    if (lensFrame === 0) lensFrame = window.requestAnimationFrame(moveLens);
  };

  /* whether the field is within NEAR_MARGIN of the view; near until the observer says otherwise */
  let near = true;
  /* a draw asked for while the field was far, made when it comes near (true: forced) */
  let owed: boolean | null = null;
  let pending = 0;
  let forceNext = false;
  /** Draws again on the next frame, at most once a frame; a far field owes it until it is near. */
  const rebuild = (force = false): void => {
    if (!started) return;
    if (!near) {
      owed = force || owed === true;
      return;
    }
    forceNext ||= force;
    window.cancelAnimationFrame(pending);
    pending = window.requestAnimationFrame(() => {
      const forced = forceNext;
      forceNext = false;
      if (!cancelled) build(forced);
    });
  };
  const readColours = (): void => {
    ink = inkOf(host);
    const value = getComputedStyle(host).getPropertyValue('--site-accent').trim();
    accent = value === '' ? ink : rgbOf(value);
  };
  readColours();
  const resize = new ResizeObserver(() => rebuild());
  resize.observe(host);
  const stopAppearance = onAppearance(() => {
    readColours();
    rebuild(true);
  });
  host.addEventListener('pointermove', onMove, { passive: true });
  host.addEventListener('pointerleave', onLeave);

  /** Loads what the field draws with, then draws it. */
  const start = (): void => {
    if (started) return;
    started = true;
    const sans = getComputedStyle(host).getPropertyValue('--site-text').trim();
    const loads: Promise<unknown>[] = [
      document.fonts.load(`${fontPx}px ${family}`).catch(() => []),
    ];
    if (kind === 'word' && art === undefined && sans !== '')
      loads.push(document.fonts.load(`500 100px ${sans}`).catch(() => []));
    const src =
      art === 'globe' ? GLOBE_URL : art === undefined && kind === 'slide' ? toneUrl : null;
    if (src !== null) {
      const image = new Image();
      image.decoding = 'async';
      image.src = src;
      /* a picture that does not load or decode leaves the field undrawn (build needs it); with
         no catch it was also an unhandled rejection on every load of the page */
      loads.push(
        image.decode().then(
          () => {
            picture = image;
          },
          () => undefined,
        ),
      );
    }
    void Promise.all(loads).then(() => {
      if (cancelled) return;
      family = getComputedStyle(node).fontFamily;
      build(true);
    });
  };
  /* the hero's field draws at once; the footer's and the chapters' when they come within a
     screen of the view. Every field keeps the watch, so a far one draws only once it is near. */
  const lazy = kind === 'word' || art !== undefined;
  const watch =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(
          (entries) => {
            const entry = entries[entries.length - 1];
            if (entry === undefined) return;
            near = entry.isIntersecting;
            if (!near) return;
            if (!started) start();
            else if (owed !== null) {
              const force = owed;
              owed = null;
              rebuild(force);
            }
          },
          { rootMargin: NEAR_MARGIN },
        );
  if (watch === null || !lazy) start();
  watch?.observe(host);

  return () => {
    cancelled = true;
    window.cancelAnimationFrame(lensFrame);
    window.cancelAnimationFrame(revealFrame);
    window.cancelAnimationFrame(pending);
    watch?.disconnect();
    resize.disconnect();
    stopAppearance();
    host.removeEventListener('pointermove', onMove);
    host.removeEventListener('pointerleave', onLeave);
  };
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}
