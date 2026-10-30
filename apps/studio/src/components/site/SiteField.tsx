import { useRef } from 'react';

import { useMountEffect } from '../useMountEffect';
import { REDUCED_MOTION, inkOf, onAppearance } from './cells';
import type { Rgb } from './cells';
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
  lensAt,
} from './field';
import type { Rect } from './field';

import toneUrl from './pictures/lighthouse-tone.webp?url';

/** The device pixel ratio the field draws at, at most 2. */
const MAX_DPR = 2;
/** How far the lens moves toward the pointer each frame (1 under reduced motion). */
const EASE = 0.28;
/** The word the footer's field draws, and the share of the field's width it spans. */
const WORD = 'Turboslide';
const WORD_SPAN = 0.96;

type Grid = {
  cols: number;
  rows: number;
  dpr: number;
  /** the tone of each cell, 0 paper to 1 ink, already through the fade */
  tone: Float32Array;
  /** the cells content asked to keep clear */
  clear: Uint8Array;
};

/** What a field draws: the lighthouse slide behind the hero, or the name in the footer. */
export type FieldKind = 'slide' | 'word';

/**
 * A field of the site (field.ts; Kevin, 2026-10-30): one canvas filling its parent, a text
 * portrait set in the lighthouse slide's own JSON in Katagami Mono, with a lens under the pointer
 * that inks every cell so the source reads there. The hero's field (`slide`) draws the slide's
 * photograph; the footer's field (`word`) draws the name in Katagami Sans the same way.
 *
 * The canvas is decorative (`aria-hidden`) and draws once per size, appearance and font, the
 * footer's on its first approach to the screen; after that only the cells under the lens are drawn
 * again, and only while the lens moves, so the page idles at zero. The canvas fades in once drawn,
 * and nothing in the page's flow depends on it. Content that must read over the field carries
 * `data-field-clear`; its cells stay paper, and with the value `band` its rows stay paper across
 * the field.
 */
export function SiteField({ kind = 'slide' }: { kind?: FieldKind }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useMountEffect(() => {
    const node = canvas.current;
    const host = node?.parentElement;
    const g = node?.getContext('2d', { alpha: true });
    if (node === null || node === undefined || host === null || host === undefined || !g) return;
    const reduced = window.matchMedia(REDUCED_MOTION);
    const fontPx = kind === 'word' ? WORD_FONT_PX : FIELD_FONT_PX;
    const cell = cellFor(fontPx);
    let grid: Grid | null = null;
    let ink: Rgb = inkOf(host);
    let family = getComputedStyle(node).fontFamily;
    let picture: HTMLImageElement | null = null;
    let started = false;
    let frame = 0;
    let cancelled = false;
    /* the lens: where it is drawn and where it heads */
    let lens = { x: -1e4, y: -1e4 };
    let goal = { x: -1e4, y: -1e4 };
    let drawn = { x: -1e4, y: -1e4 };

    /* the name's letters are thin against a cell, so its stream leaves out the spaces */
    const stream = kind === 'word' ? SOURCE.replace(/\s+/g, '') : SOURCE;
    const charAt = (i: number): string => stream[i % stream.length] ?? ' ';

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

    const build = (): void => {
      const box = host.getBoundingClientRect();
      if (box.width === 0 || (kind === 'slide' && picture === null)) return;
      const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
      const cols = Math.max(1, Math.ceil(box.width / cell.w));
      const rows = Math.max(1, Math.ceil(box.height / cell.h));
      node.width = Math.round(cols * cell.w * dpr);
      node.height = Math.round(rows * cell.h * dpr);
      node.style.width = `${cols * cell.w}px`;
      node.style.height = `${rows * cell.h}px`;
      const sample = document.createElement('canvas');
      sample.width = cols;
      sample.height = rows;
      const s = sample.getContext('2d', { willReadFrequently: true });
      if (s === null) return;
      s.imageSmoothingQuality = 'high';
      if (kind === 'slide') paintSlide(s, box, cols, rows);
      else paintWord(s, box);
      const data = s.getImageData(0, 0, cols, rows).data;
      const values = new Float32Array(cols * rows);
      for (let row = 0; row < rows; row += 1) {
        const fade = kind === 'slide' ? fadeAt(row, rows) : 1;
        for (let col = 0; col < cols; col += 1) {
          const i = row * cols + col;
          /* the ink follows the picture's light in both appearances, a positive on ink and a
             negative on paper, so the night sky over the title stays open */
          values[i] = ((data[i * 4] ?? 0) / 255) * fade;
        }
      }
      const clear = new Uint8Array(cols * rows);
      const keep = (rect: Rect, pad: number): void => {
        const c = cellsOf(
          { x: rect.x - pad, y: rect.y - pad, w: rect.w + 2 * pad, h: rect.h + 2 * pad },
          { cols, rows },
          cell,
        );
        for (let row = c.r0; row < c.r1; row += 1)
          clear.fill(1, row * cols + c.c0, row * cols + c.c1);
      };
      /* `data-field-clear="band"` clears the element's rows across the whole field */
      for (const el of host.querySelectorAll<HTMLElement>('[data-field-clear]')) {
        const r = el.getBoundingClientRect();
        const band = el.dataset.fieldClear === 'band';
        if (r.width > 0)
          keep(
            {
              x: band ? 0 : r.left - box.left,
              y: r.top - box.top,
              w: band ? box.width : r.width,
              h: r.height,
            },
            8,
          );
      }
      grid = { cols, rows, dpr, tone: values, clear };
      drawCells(0, 0, cols, rows);
      node.dataset.ready = '';
    };

    /** Draws the cells of a block of the grid, after clearing it. */
    const drawCells = (c0: number, r0: number, c1: number, r1: number): void => {
      if (grid === null) return;
      const { cols, dpr, tone: values, clear } = grid;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(c0 * cell.w, r0 * cell.h, (c1 - c0) * cell.w, (r1 - r0) * cell.h);
      g.font = `400 ${fontPx}px ${family}`;
      g.textBaseline = 'middle';
      g.textAlign = 'center';
      const [r, gr, b] = ink;
      let last = -1;
      for (let row = r0; row < r1; row += 1) {
        const y = row * cell.h + cell.h / 2;
        for (let col = c0; col < c1; col += 1) {
          const i = row * cols + col;
          if (clear[i] === 1) continue;
          const x = col * cell.w + cell.w / 2;
          const alpha = alphaOf(values[i] ?? 0, lensAt(Math.hypot(x - lens.x, y - lens.y)));
          if (alpha <= 0.01) continue;
          const step = Math.round(alpha * 20);
          if (step !== last) {
            g.fillStyle = `rgb(${r} ${gr} ${b} / ${step / 20})`;
            last = step;
          }
          g.fillText(charAt(i), x, y);
        }
      }
    };

    /** Draws again the cells the lens covered and now covers. */
    const drawLens = (): void => {
      if (grid === null) return;
      const reach = LENS_RADIUS + cell.w;
      const x0 = Math.min(drawn.x, lens.x) - reach;
      const x1 = Math.max(drawn.x, lens.x) + reach;
      const y0 = Math.min(drawn.y, lens.y) - reach;
      const y1 = Math.max(drawn.y, lens.y) + reach;
      const c = cellsOf({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, grid, cell);
      /* a lens that jumped across the field draws its two places, not the band between them */
      if ((c.c1 - c.c0) * (c.r1 - c.r0) > 2 * ((2 * reach) / cell.w) * ((2 * reach) / cell.h)) {
        for (const at of [drawn, lens]) {
          const d = cellsOf(
            { x: at.x - reach, y: at.y - reach, w: 2 * reach, h: 2 * reach },
            grid,
            cell,
          );
          drawCells(d.c0, d.r0, d.c1, d.r1);
        }
      } else drawCells(c.c0, c.r0, c.c1, c.r1);
      drawn = { ...lens };
    };

    const tick = (): void => {
      frame = 0;
      const k = reduced.matches ? 1 : EASE;
      lens = { x: lens.x + (goal.x - lens.x) * k, y: lens.y + (goal.y - lens.y) * k };
      if (Math.hypot(goal.x - lens.x, goal.y - lens.y) < 0.5) lens = { ...goal };
      drawLens();
      if (lens.x !== goal.x || lens.y !== goal.y) frame = window.requestAnimationFrame(tick);
    };
    const schedule = (): void => {
      if (frame === 0) frame = window.requestAnimationFrame(tick);
    };

    const onMove = (event: PointerEvent): void => {
      if (grid === null) return;
      const box = host.getBoundingClientRect();
      const x = event.clientX - box.left;
      const y = event.clientY - box.top;
      if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
      /* the lens enters at the pointer instead of sweeping in from where it last left */
      if (goal.x < -1e3) lens = { x, y };
      goal = { x, y };
      schedule();
    };
    const onLeave = (): void => {
      goal = { x: -1e4, y: -1e4 };
      lens = { ...goal };
      drawLens();
    };

    let pending = 0;
    const rebuild = (): void => {
      if (!started) return;
      window.cancelAnimationFrame(pending);
      pending = window.requestAnimationFrame(() => {
        if (!cancelled) build();
      });
    };
    const resize = new ResizeObserver(rebuild);
    resize.observe(host);
    const stopAppearance = onAppearance(() => {
      ink = inkOf(host);
      rebuild();
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
      if (kind === 'word' && sans !== '')
        loads.push(document.fonts.load(`500 100px ${sans}`).catch(() => []));
      if (kind === 'slide') {
        const image = new Image();
        image.decoding = 'async';
        image.src = toneUrl;
        loads.push(
          image.decode().then(() => {
            picture = image;
          }),
        );
      }
      void Promise.all(loads).then(() => {
        if (cancelled) return;
        family = getComputedStyle(node).fontFamily;
        build();
      });
    };
    /* the hero's field draws at once; the footer's when it comes within a screen of the view */
    const near =
      kind === 'word' && typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(
            (entries) => {
              if (entries.some((entry) => entry.isIntersecting)) {
                near?.disconnect();
                start();
              }
            },
            { rootMargin: '100% 0px' },
          )
        : null;
    if (near === null) start();
    else near.observe(host);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(pending);
      near?.disconnect();
      resize.disconnect();
      stopAppearance();
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerleave', onLeave);
    };
  });
  return <canvas ref={canvas} className="site-field" aria-hidden="true" />;
}
