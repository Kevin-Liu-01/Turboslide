// The units of the reader (R04 4; R08 3g): the 16:9 identity, the match and fit modes, sizes,
// angles, flips and the two ST_Percentage forms.
import { describe, expect, it } from 'vitest';

import {
  EMU_PER_PX,
  WIDE_PAGE_EMU,
  angleOf,
  boxToPx,
  emuToPx,
  flipOf,
  lineWidthPx,
  percentOf,
  pointToPx,
  presetOf,
  sameAspect,
  sheetMapping,
  szToPx,
} from './units.ts';

describe('sheetMapping', () => {
  it('maps the 16:9 page at 7,620 EMU per pixel with no bars in both modes', () => {
    for (const mode of ['match', 'fit'] as const) {
      const m = sheetMapping(WIDE_PAGE_EMU, mode);
      expect(m.scale).toBeCloseTo(1 / EMU_PER_PX, 12);
      expect(m.offset).toEqual([0, 0]);
      expect(m.page).toEqual({ width: 1600, height: 900, preset: 'widescreen-16-9' });
      expect(m.bars).toEqual({ x: 0, y: 0 });
      expect(m.fallback).toBeUndefined();
    }
  });

  it('match sets the page to the source size (R08 3g)', () => {
    const standard = sheetMapping({ cx: 9_144_000, cy: 6_858_000 }, 'match');
    expect(standard.page).toEqual({ width: 1200, height: 900, preset: 'standard-4-3' });
    expect(standard.offset).toEqual([0, 0]);
    const google = sheetMapping({ cx: 9_144_000, cy: 5_143_500 }, 'match');
    expect(google.page).toEqual({ width: 1200, height: 675, preset: 'custom' });
    expect(szToPx(1800, google)).toBe(30);
    const wide10 = sheetMapping({ cx: 12_192_000, cy: 7_620_000 }, 'match');
    expect(wide10.page).toEqual({ width: 1600, height: 1000, preset: 'custom' });
  });

  it('match falls back to fit when the source lies outside the page bounds', () => {
    const tiny = sheetMapping({ cx: 100_000, cy: 100_000 }, 'match');
    expect(tiny.fallback).toBe('fit');
    expect(tiny.mode).toBe('fit');
    expect(tiny.page).toEqual({ width: 1600, height: 900, preset: 'widescreen-16-9' });
  });

  it('fit letterboxes 4:3 to 1200 by 900 at x offset 200 and 16:10 to 1440 by 900 at x offset 80 (R04 4)', () => {
    const standard = sheetMapping({ cx: 9_144_000, cy: 6_858_000 }, 'fit');
    expect(standard.offset[0]).toBeCloseTo(200, 6);
    expect(standard.offset[1]).toBeCloseTo(0, 6);
    expect(emuToPx(9_144_000, standard)).toBe(1200);
    expect(standard.bars).toEqual({ x: 200, y: 0 });
    const wide10 = sheetMapping({ cx: 12_192_000, cy: 7_620_000 }, 'fit');
    expect(wide10.offset[0]).toBeCloseTo(80, 6);
    expect(emuToPx(12_192_000, wide10)).toBe(1440);
    // a portrait page fits by its height, the limiting dimension, and centres with side bars
    const portrait = sheetMapping({ cx: 6_858_000, cy: 9_144_000 }, 'fit');
    expect(portrait.offset[0]).toBeCloseTo(462.5, 6);
    expect(portrait.offset[1]).toBeCloseTo(0, 6);
    expect(emuToPx(9_144_000, portrait)).toBe(900);
    expect(emuToPx(6_858_000, portrait)).toBe(675);
    expect(portrait.bars).toEqual({ x: 462.5, y: 0 });
    const banner = sheetMapping({ cx: 18_288_000, cy: 6_858_000 }, 'fit');
    expect(banner.offset[0]).toBeCloseTo(0, 6);
    expect(banner.offset[1]).toBeCloseTo(150, 6);
  });

  it('fits onto the current page when one is given', () => {
    const m = sheetMapping({ cx: 12_192_000, cy: 6_858_000 }, 'fit', {
      width: 1200,
      height: 900,
      preset: 'standard-4-3',
    });
    expect(emuToPx(12_192_000, m)).toBe(1200);
    expect(m.offset[1]).toBeCloseTo(112.5, 6);
    expect(m.page.width).toBe(1200);
  });

  it('reads a missing or zero size as the 16:9 page', () => {
    expect(sheetMapping({ cx: 0, cy: 0 }, 'match').page.width).toBe(1600);
  });
});

describe('the conversions', () => {
  const wide = sheetMapping(WIDE_PAGE_EMU, 'match');

  it('converts the export set: sz 1320 is 22 px, 2640 is 44 px, 7,620 EMU is one pixel', () => {
    expect(szToPx(1320, wide)).toBe(22);
    expect(szToPx(2640, wide)).toBe(44);
    expect(szToPx(1800, wide)).toBe(30);
    expect(emuToPx(7620, wide)).toBe(1);
    expect(lineWidthPx(7620, wide)).toBe(1);
    expect(lineWidthPx(3810, wide)).toBe(0.5);
  });

  it('rounds font sizes to a half pixel and boxes to a hundredth (SPEC-5 5.1)', () => {
    expect(szToPx(1100, wide)).toBe(18.5);
    expect(szToPx(1000, wide)).toBe(16.5);
    const box = boxToPx([685_800, 2_130_425], [7_772_400, 1_470_025], wide);
    expect(box).toEqual({ x: 90, y: 279.58, w: 1020, h: 192.92 });
    const fit = sheetMapping({ cx: 9_144_000, cy: 6_858_000 }, 'fit');
    expect(pointToPx(0, 0, fit)).toEqual([200, 0]);
    expect(boxToPx([0, 0], [9_144_000, 6_858_000], fit)).toEqual({ x: 200, y: 0, w: 1200, h: 900 });
  });

  it('reads angles in 60,000ths of a degree into [0, 360) and the two flips', () => {
    expect(angleOf(900_000)).toBe(15);
    expect(angleOf(20_700_000)).toBe(345);
    expect(angleOf(-5_400_000)).toBe(270);
    expect(angleOf(21_600_000)).toBe(0);
    expect(angleOf(undefined)).toBe(0);
    expect(flipOf(true, false)).toBe('h');
    expect(flipOf(false, true)).toBe('v');
    expect(flipOf(true, true)).toBe('hv');
    expect(flipOf(false, false)).toBeUndefined();
  });

  it('reads both ST_Percentage forms (R04 4)', () => {
    expect(percentOf('18000')).toBe(0.18);
    expect(percentOf('10000')).toBe(0.1);
    expect(percentOf('92.000%')).toBe(0.92);
    expect(percentOf('100%')).toBe(1);
    expect(percentOf('-25000')).toBe(-0.25);
    expect(percentOf('abc')).toBeUndefined();
    expect(percentOf(undefined)).toBeUndefined();
  });

  it('names the presets and the aspect tolerance', () => {
    expect(presetOf(1600, 900)).toBe('widescreen-16-9');
    expect(presetOf(1200, 900)).toBe('standard-4-3');
    expect(presetOf(1440, 900)).toBe('widescreen-16-10');
    expect(presetOf(1200, 675)).toBe('custom');
    expect(sameAspect({ cx: 12_192_000, cy: 6_858_000 }, { width: 1600, height: 900 })).toBe(true);
    expect(sameAspect({ cx: 9_144_000, cy: 5_143_500 }, { width: 1600, height: 900 })).toBe(true);
    expect(sameAspect({ cx: 9_144_000, cy: 6_858_000 }, { width: 1600, height: 900 })).toBe(false);
  });
});
