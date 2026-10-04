import { describe, expect, it } from 'vitest';

import { bayer8 } from '@turboslide/effects/bayer';

import { gatherAt, interludeCells, INTERLUDE_CYCLE, SCATTER_TONE, scatterField } from './field';
import { GLYPH_BOX, INTERLUDE_BANDS, glyphBounds, glyphFor, glyphTone } from './glyphs';
import { PEOPLE_LOOP_MS, PEOPLE_LOOP_SECONDS, keyGaps } from '../people-timing';

// The interludes (docs/LANDING.md 2.4, 3.4 I1) and the people band's clock (2.10, 3.4 P-L): every
// glyph fits its box at both sizes and draws something, the gathered still is the glyph's print
// through the 8 by 8 screen, the sparse field is 6 percent tone, a cycle gathers, holds, thins and
// rests on the tone curve, and a person's key gaps keep B's rhythm.

const WIDE = { cols: 512, rows: 64 };
const NARROW = { cols: 179, rows: 40 };

const inked = (cells: Uint8Array): number => cells.reduce((n, c) => n + c, 0);

describe('the interludes', () => {
  it('names the eleven bands in the order of the page', () => {
    expect(INTERLUDE_BANDS).toEqual([
      'menus',
      'canvas',
      'tailor',
      'kits',
      'agents',
      'people',
      'present',
      'export',
      'patterns',
      'features',
      'close',
    ]);
  });

  for (const narrow of [false, true])
    it(`fits every glyph in its box ${narrow ? 'under' : 'at and over'} 720 px`, () => {
      const box = narrow ? GLYPH_BOX.narrow : GLYPH_BOX.wide;
      const strip = narrow ? NARROW : WIDE;
      for (const band of INTERLUDE_BANDS) {
        const glyph = glyphFor(band, narrow);
        expect(glyph.w, band).toBeLessThanOrEqual(box.w);
        expect(glyph.h, band).toBeLessThanOrEqual(box.h);
        const b = glyphBounds(glyph);
        expect(b.x0, band).toBeGreaterThanOrEqual(0);
        expect(b.y0, band).toBeGreaterThanOrEqual(0);
        expect(b.x1, band).toBeLessThanOrEqual(glyph.w);
        expect(b.y1, band).toBeLessThanOrEqual(glyph.h);
        const gathered = interludeCells(
          glyphTone(glyph, strip.cols, strip.rows),
          strip.cols,
          strip.rows,
          1,
        );
        expect(inked(gathered), `${band} draws`).toBeGreaterThan(narrow ? 40 : 120);
      }
    });

  it("gathers into the glyph's exact print and rests on a sparse field at 6 percent tone", () => {
    const { cols, rows } = WIDE;
    for (const band of INTERLUDE_BANDS) {
      const tone = glyphTone(glyphFor(band, false), cols, rows);
      const gathered = interludeCells(tone, cols, rows, 1);
      let differ = 0;
      for (let y = 0; y < rows; y += 1)
        for (let x = 0; x < cols; x += 1) {
          const i = y * cols + x;
          if (gathered[i] !== ((tone[i] ?? 0) > (bayer8(y, x) + 0.5) / 64 ? 1 : 0)) differ += 1;
        }
      expect(differ, band).toBe(0);
      const sparse = interludeCells(tone, cols, rows, 0);
      const share = inked(sparse) / sparse.length;
      /* 6 percent tone in the strip's body, fading at its two ends */
      expect(share, band).toBeGreaterThan(0.035);
      expect(share, band).toBeLessThan(0.07);
      const body = scatterField(cols, rows).slice(
        (rows / 2) * cols + cols / 7,
        (rows / 2) * cols + (6 * cols) / 7,
      );
      const mean = body.reduce((a, b) => a + b, 0) / body.length;
      expect(Math.abs(mean - SCATTER_TONE), band).toBeLessThan(0.012);
      expect(SCATTER_TONE).toBe(0.06);
    }
  });

  it("switches each cell once on the way in, in the screen's order", () => {
    const { cols, rows } = WIDE;
    const tone = glyphTone(glyphFor('canvas', false), cols, rows);
    let before = interludeCells(tone, cols, rows, 0);
    const switches = new Uint8Array(cols * rows);
    for (let s = 0.05; s <= 1.0001; s += 0.05) {
      const now = interludeCells(tone, cols, rows, Math.min(1, s));
      for (let i = 0; i < now.length; i += 1)
        if (now[i] !== before[i]) switches[i] = (switches[i] ?? 0) + 1;
      before = now;
    }
    expect(Math.max(...switches)).toBe(1);
  });

  it('runs the cycle of 3.4: gather over 1,500 ms, hold to 7 s, thin over 1,500 ms, rest to 12 s', () => {
    expect(INTERLUDE_CYCLE).toEqual({ gather: 1500, hold: 7000, thin: 8500, length: 12000 });
    expect(gatherAt(0)).toBe(0);
    expect(gatherAt(750)).toBeCloseTo(0.5, 5);
    expect(gatherAt(1500)).toBe(1);
    expect(gatherAt(6999)).toBe(1);
    expect(gatherAt(7750)).toBeCloseTo(0.5, 5);
    expect(gatherAt(8500)).toBe(0);
    expect(gatherAt(11_999)).toBe(0);
    expect(gatherAt(12_000 + 1500)).toBe(1);
    for (let t = 1; t < 1500; t += 50) expect(gatherAt(t)).toBeGreaterThan(gatherAt(t - 1));
  });
});

describe("the two people's clock", () => {
  it("is 14 s, the caption's figure", () => {
    expect(PEOPLE_LOOP_MS).toBe(14_000);
    expect(PEOPLE_LOOP_SECONDS).toBe(14);
  });

  it('types with uneven gaps of 70 to 240 ms, and 300 to 460 ms at a space', () => {
    const text = ' in person and more words';
    const gaps = keyGaps(text, 11);
    expect(gaps).toHaveLength(text.length);
    for (const [i, gap] of gaps.entries()) {
      if (text[i] === ' ') {
        expect(gap).toBeGreaterThanOrEqual(300);
        expect(gap).toBeLessThanOrEqual(460);
      } else {
        expect(gap).toBeGreaterThanOrEqual(70);
        expect(gap).toBeLessThanOrEqual(240);
      }
    }
    expect(new Set(gaps.map((g) => Math.round(g))).size).toBeGreaterThan(gaps.length / 2);
    expect(keyGaps(text, 11)).toEqual(gaps);
    expect(keyGaps(text, 5)).not.toEqual(gaps);
  });
});
