import { BAYER8 } from '@turboslide/effects/bayer';

/**
 * The cell printer the landing's dithered figures share (docs/SITE.md 9): one
 * canvas pixel per cell, drawn in the page's ink and scaled up by a whole number of device pixels
 * with `image-rendering: pixelated` (site.css), so every cell is square and whole; the paper
 * shows through the cells left unlit. A figure redraws when its box or the appearance changes.
 * Nothing here reaches the editor: the screen is the deck's own table (packages/effects).
 */

export const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/**
 * The deck's 8 by 8 Bayer screen as thresholds in 0 to 1, row major: a cell whose tone is over
 * (m + 0.5) / 64 is lit (packages/effects/src/bayer.ts).
 */
export const SCREEN: Float32Array = (() => {
  const out = new Float32Array(64);
  BAYER8.forEach((row, r) => row.forEach((m, c) => (out[r * 8 + c] = (m + 0.5) / 64)));
  return out;
})();

export type Rgb = readonly [number, number, number];

/** A CSS colour as bytes, read through a 1 by 1 canvas, so any colour syntax reads. */
export function rgbOf(color: string): Rgb {
  const probe = document.createElement('canvas');
  probe.width = 1;
  probe.height = 1;
  const g = probe.getContext('2d', { willReadFrequently: true });
  if (g === null) return [0, 0, 0];
  g.fillStyle = color;
  g.fillRect(0, 0, 1, 1);
  const [r = 0, gr = 0, b = 0] = g.getImageData(0, 0, 1, 1).data;
  return [r, gr, b];
}

/** The ink a figure prints in: the `--pt-ink` its own box resolves. */
export function inkOf(element: Element): Rgb {
  return rgbOf(getComputedStyle(element).getPropertyValue('--pt-ink').trim() || 'currentColor');
}

/**
 * Calls back when the appearance changes: the root's `data-theme` (the footer's switch, the
 * boot script) or the system's scheme. Returns the cleanup.
 */
export function onAppearance(callback: () => void): () => void {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  const scheme = window.matchMedia('(prefers-color-scheme: dark)');
  scheme.addEventListener('change', callback);
  return () => {
    observer.disconnect();
    scheme.removeEventListener('change', callback);
  };
}

/**
 * Sizes a cell canvas over a box of `width` by `height` CSS px at `cell` CSS px a cell: whole
 * cells only, the canvas moved by less than a device pixel so its first cell starts on one (a box
 * at a fractional offset would split a row of cells). Returns the grid's columns and rows.
 */
export function fitCells(
  canvas: HTMLCanvasElement,
  box: DOMRect,
  cell: number,
): { cols: number; rows: number } {
  const cols = Math.max(1, Math.floor(box.width / cell));
  const rows = Math.max(1, Math.floor(box.height / cell));
  if (canvas.width !== cols) canvas.width = cols;
  if (canvas.height !== rows) canvas.height = rows;
  canvas.style.width = `${cols * cell}px`;
  canvas.style.height = `${rows * cell}px`;
  const dpr = window.devicePixelRatio || 1;
  const snap = (v: number): number => (Math.round(v * dpr) - v * dpr) / dpr;
  canvas.style.transform = `translate(${snap(box.left)}px, ${snap(box.top)}px)`;
  return { cols, rows };
}

/**
 * Prints a grid: `lit(col, row)` decides each cell, which is drawn opaque in the ink. One pass,
 * one `putImageData`.
 */
export function printCells(
  canvas: HTMLCanvasElement,
  cols: number,
  rows: number,
  ink: Rgb,
  lit: (col: number, row: number) => boolean,
): void {
  const g = canvas.getContext('2d');
  if (g === null) return;
  const image = g.createImageData(cols, rows);
  const data = image.data;
  for (let row = 0; row < rows; row += 1)
    for (let col = 0; col < cols; col += 1) {
      if (!lit(col, row)) continue;
      const i = (row * cols + col) * 4;
      data[i] = ink[0];
      data[i + 1] = ink[1];
      data[i + 2] = ink[2];
      data[i + 3] = 255;
    }
  g.putImageData(image, 0, 0);
}
