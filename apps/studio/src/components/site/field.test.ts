import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  ALPHA,
  FOCUS,
  LENS_RADIUS,
  SHEET,
  SOURCE,
  alphaOf,
  cellsOf,
  cover,
  fadeAt,
  lensAt,
  toneInk,
} from './field';

// The site's fields (field.ts, SiteField.tsx; Kevin, 2026-10-30): the lighthouse slide as a text
// portrait in its own JSON. These pin the parts a wrong number would break without a browser:
// the stream is the slide's file, the photograph covers the band from its top at every window
// the site draws, and the lens and the ink ramp stay in range.

const slide = JSON.parse(
  readFileSync(new URL('../../../home-deck/slides/lighthouse.json', import.meta.url), 'utf8'),
) as unknown;

describe("the hero's field", () => {
  it('streams the slide file as compact JSON', () => {
    expect(SOURCE).toBe(JSON.stringify(slide));
    expect(SOURCE).not.toMatch(/\n/);
  });

  it('covers the band with the sheet from its top', () => {
    for (const band of [
      { w: 1440, h: 480 },
      { w: 1920, h: 560 },
      { w: 1024, h: 480 },
      { w: 390, h: 640 },
      { w: 2560, h: 600 },
    ]) {
      const map = cover(SHEET, band, FOCUS);
      expect(SHEET.w * map.scale).toBeGreaterThanOrEqual(band.w - 1e-6);
      expect(SHEET.h * map.scale).toBeGreaterThanOrEqual(band.h - 1e-6);
      expect(map.x).toBeLessThanOrEqual(1e-6);
      expect(Math.abs(map.y)).toBe(0);
    }
  });

  it('clamps a rect to the grid', () => {
    expect(cellsOf({ x: -40, y: -40, w: 80, h: 80 }, { cols: 10, rows: 10 })).toEqual({
      c0: 0,
      r0: 0,
      c1: 6,
      r1: 3,
    });
  });

  it('eases the lens from full strength in its core to nothing at its radius', () => {
    expect(lensAt(0)).toBe(1);
    expect(lensAt(LENS_RADIUS * 0.4)).toBe(1);
    expect(lensAt(LENS_RADIUS)).toBe(0);
    let last = 1;
    for (let d = 0; d <= LENS_RADIUS; d += 4) {
      const v = lensAt(d);
      expect(v).toBeLessThanOrEqual(last + 1e-9);
      last = v;
    }
  });

  it('inks paper as nothing and the lens lifts every cell to legible', () => {
    expect(toneInk(0)).toBe(0);
    expect(toneInk(1)).toBe(1);
    expect(alphaOf(0, 0)).toBe(0);
    expect(alphaOf(1, 0)).toBeCloseTo(ALPHA.tone);
    expect(alphaOf(0, 1)).toBeCloseTo(ALPHA.revealed);
    expect(alphaOf(1, 1)).toBeCloseTo(1);
  });

  it('fades the field out over its last rows', () => {
    expect(fadeAt(0, 100)).toBe(1);
    expect(fadeAt(50, 100)).toBe(1);
    expect(fadeAt(99, 100)).toBe(0);
  });
});
