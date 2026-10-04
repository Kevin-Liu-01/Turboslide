import { bayer8 } from '@turboslide/effects/bayer';
import { describe, expect, it } from 'vitest';

import { fitOf, frameCells, frameGrid, printFrame } from './pattern';

// The patterns band's still frame printed on the screen's pixels (verify1 F9): the fit rounds the
// recipe's cell (3 of the slide's 1,600 units) to whole device pixels, and a frame printed on its
// own grid gives back its cells, so the print and the shader at its anchor read as one pattern.

describe('fitOf', () => {
  it('holds the drawn device pixels and a whole pixel cell', () => {
    expect(fitOf(500, 281.25, 1)).toEqual({ width: 500, height: 281, cell: 1 });
    expect(fitOf(500, 281.25, 2)).toEqual({ width: 1000, height: 563, cell: 2 });
    expect(fitOf(358, 201.375, 3)).toEqual({ width: 1074, height: 604, cell: 2 });
    /* a show's slide past 1,600 by 900 pixels renders at that and the recipe's own cell */
    expect(fitOf(1280, 720, 2)).toEqual({ width: 1600, height: 900, cell: 3 });
  });
});

describe('printFrame', () => {
  it('prints a frame on its own grid as the frame', () => {
    /* the shader's frame of a lit disc at 1,600 by 900: cells of 3 px centred on the frame */
    const grid = frameGrid(1600, 900);
    expect(grid).toMatchObject({ px: 3, x0: 2, y0: 0, cols: 532, rows: 300 });
    const { cols, rows } = grid;
    const shape = (r: number, c: number): number => {
      const d = Math.hypot(r - 150, c - 266) / 100;
      return d > 1 ? 0 : 0.15 + 0.8 * (1 - d) * (c / cols);
    };
    const rgba = new Uint8ClampedArray(cols * rows * 4).fill(255);
    const ink = new Uint8Array(cols * rows);
    for (let r = 0; r < rows; r += 1)
      for (let c = 0; c < cols; c += 1) {
        const lit = shape(r, c) >= 1 - bayer8(149 - r, c - 266) / 64;
        ink[r * cols + c] = lit ? 1 : 0;
        if (lit) rgba.fill(7, (r * cols + c) * 4, (r * cols + c) * 4 + 3);
      }
    const frame = frameCells(rgba, grid, 1600, 900);
    expect(frame.ink).toEqual(ink);
    const printed = printFrame(frame, { width: 1600, height: 900, cell: 3 });
    let differ = 0;
    let outside = 0;
    for (let r = 0; r < rows; r += 1)
      for (let c = 0; c < cols; c += 1) {
        const at = printed[(r * 3 + 1) * 1600 + c * 3 + grid.x0 + 1] ?? 0;
        if (at !== ink[r * cols + c]) differ += 1;
        if (at === 1 && shape(r, c) === 0) outside += 1;
      }
    expect(outside).toBe(0);
    expect(differ / ink.reduce((n, v) => n + v, 0)).toBeLessThan(0.02);
  });
});
