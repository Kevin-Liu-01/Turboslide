import { describe, expect, it } from 'vitest';

import {
  cellsAt,
  compositeCells,
  densitySchedule,
  splitLayers,
  targetCells,
  threshold,
  toneSchedule,
  urlOf,
} from './field';
import type { CellGrid } from './field';

// The Bayer printer's schedules (docs/LANDING.md 3.5 H5 and C1): every print starts from its
// first pose and ends on its still's exact cells, cells switch in the screen's order, and a dark
// ground prints the light print's twin (build/integrator.md "Landing, day 0" 2.2).

const COLS = 64;
const ROWS = 32;

/** The light print of a tone function through the 8 by 8 screen. */
function print(tone: (x: number, y: number) => number): { grid: CellGrid; ink: Float32Array } {
  const ink = new Uint8Array(COLS * ROWS);
  const shares = new Float32Array(COLS * ROWS);
  for (let y = 0; y < ROWS; y += 1)
    for (let x = 0; x < COLS; x += 1) {
      const t = tone(x, y);
      shares[y * COLS + x] = t;
      ink[y * COLS + x] = t > threshold(y, x, false) ? 1 : 0;
    }
  return { grid: { cols: COLS, rows: ROWS, ink }, ink: shares };
}

const count = (cells: Uint8Array): number => cells.reduce((n, c) => n + c, 0);
const same = (a: Uint8Array, b: Uint8Array): boolean => a.every((v, i) => v === b[i]);

/* a lit sphere's limb: dark in the lower right, paper elsewhere */
const limb = (x: number, y: number): number =>
  Math.max(0, Math.min(1, 1.4 - Math.hypot(x - COLS, y - ROWS) / 30));

describe('the develop of H5 (density) and C1 (tone)', () => {
  it('starts on paper, ends on the still and only ever adds cells', () => {
    const { grid, ink } = print(limb);
    for (const schedule of [
      densitySchedule(grid, false),
      toneSchedule(grid, { width: COLS, height: ROWS, ink }, false),
    ]) {
      expect(count(cellsAt(schedule, 0))).toBe(0);
      expect(same(cellsAt(schedule, 1), grid.ink)).toBe(true);
      let last = 0;
      for (let s = 0; s <= 1.0001; s += 0.05) {
        const lit = cellsAt(schedule, s);
        /* nothing outside the still is ever drawn */
        expect(lit.every((v, i) => v === 0 || grid.ink[i] === 1)).toBe(true);
        expect(count(lit)).toBeGreaterThanOrEqual(last);
        last = count(lit);
      }
    }
  });

  it('raises a flat tone in proportion, as the screen prints the tone times the curve', () => {
    const { grid, ink } = print(() => 0.5);
    const tone = toneSchedule(grid, { width: COLS, height: ROWS, ink }, false);
    const density = densitySchedule(grid, false);
    const total = count(grid.ink);
    expect(total).toBe((COLS * ROWS) / 2);
    for (const schedule of [tone, density]) {
      const half = count(cellsAt(schedule, 0.5)) / total;
      expect(half).toBeGreaterThan(0.4);
      expect(half).toBeLessThan(0.6);
    }
  });

  it('prints the dark twin: the disc XOR the ink, or the complement, through the 63 - m screen', () => {
    const { grid } = print(limb);
    const disc: CellGrid = {
      cols: COLS,
      rows: ROWS,
      ink: grid.ink.map((_v, i) => (limb(i % COLS, Math.floor(i / COLS)) > 0 ? 1 : 0)),
    };
    const dark = targetCells(grid, disc, true);
    for (let i = 0; i < dark.ink.length; i += 1)
      expect(dark.ink[i]).toBe(disc.ink[i] === 1 && grid.ink[i] === 0 ? 1 : 0);
    const whole = targetCells(grid, null, true);
    for (let i = 0; i < whole.ink.length; i += 1) expect(whole.ink[i]).toBe(1 - (grid.ink[i] ?? 0));
    expect(targetCells(grid, disc, false)).toBe(grid);
    const schedule = densitySchedule(dark, true);
    expect(same(cellsAt(schedule, 1), dark.ink)).toBe(true);
    expect(threshold(0, 0, true)).toBe(1 - threshold(0, 0, false));
  });
});

describe('the still as its CSS draws it', () => {
  it('reads the mask layers and combines them as mask-composite does', () => {
    const value =
      'url("data:image/png;base64,AAA="), url("/home/disc.webp"), linear-gradient(rgb(0, 0, 0), rgb(0, 0, 0))';
    expect(splitLayers(value)).toEqual([
      'url("data:image/png;base64,AAA=")',
      'url("/home/disc.webp")',
      'linear-gradient(rgb(0, 0, 0), rgb(0, 0, 0))',
    ]);
    expect(urlOf('url("data:image/png;base64,AAA=")')).toBe('data:image/png;base64,AAA=');
    expect(urlOf('url(/home/a.webp)')).toBe('/home/a.webp');
    expect(urlOf('linear-gradient(red, red)')).toBeNull();
    const a = Uint8Array.from([1, 1, 0, 0]);
    const b = Uint8Array.from([1, 0, 1, 0]);
    expect([...compositeCells('exclude', a, b)]).toEqual([0, 1, 1, 0]);
    expect([...compositeCells('add', a, b)]).toEqual([1, 1, 1, 0]);
    expect([...compositeCells('subtract', a, b)]).toEqual([0, 1, 0, 0]);
    expect([...compositeCells('intersect', a, b)]).toEqual([1, 0, 0, 0]);
  });
});
