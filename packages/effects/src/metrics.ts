// Plate metrics for two-tone pictures (SPEC 5.4, Asset.metrics in SPEC 4.2): the lit fraction,
// the lit cells under a plate rectangle and in the 30 px band around it, the nearest lit cell,
// and the two warnings the rounds applied by eye. The rounds measured these by hand
// (OPENERS.md, "Prototemplate and Glyphfield": "the nearest lit cell is 83 pixels from that
// rectangle ... no cell inside the plate or in the 30 pixel band around it is paper").
import type { BitImage, Box } from './image.ts';
import { litFraction } from './image.ts';

/**
 * The rectangles the rounds screened candidates against, in sheet pixels as [x, y, w, h]. The
 * rendered plate is fit-content and grows upward, so these are the tallest plates observed:
 * the opener plate with a two-line title (OPENERS.md, slide 60: 137, 463 to 877, 771; the
 * candidates were screened against a 500 top), the mood plate (x 851 to 1463, y 539 to 771,
 * make.py), the closing plate upper left at 720 wide (SPEC 2.1).
 */
export const PLATE_BOXES: Record<'opener' | 'mood' | 'closing', Box> = {
  opener: [137, 500, 740, 271],
  mood: [851, 539, 612, 232],
  closing: [137, 129, 720, 271],
};

export const PLATE_BAND_PX = 30;

export type PlateClear = {
  plate: Box;
  /** Distance in sheet pixels from the plate rectangle to the nearest lit cell; 0 when one is under it. */
  nearestLitPx: number;
  litUnder: number;
  litInBand: number;
};

export type TwoToneMetrics = {
  litFraction: number;
  plateClear?: PlateClear;
  warnings: string[];
};

/**
 * Plate clearance on a bit image whose cells are `cell` sheet pixels wide (2 for the deck's
 * screen, so an 800 by 450 image covers the 1600 by 900 sheet).
 */
export function plateClear(bits: BitImage, plate: Box, cell = 2): PlateClear {
  const [px, py, pw, ph] = plate;
  const right = px + pw;
  const bottom = py + ph;
  let litUnder = 0;
  let litInBand = 0;
  let nearest = Number.POSITIVE_INFINITY;
  for (let cy = 0; cy < bits.height; cy += 1) {
    const y0 = cy * cell;
    const y1 = y0 + cell;
    const dy = y1 <= py ? py - y1 : y0 >= bottom ? y0 - bottom : 0;
    for (let cx = 0; cx < bits.width; cx += 1) {
      if (!bits.bits[cy * bits.width + cx]) continue;
      const x0 = cx * cell;
      const x1 = x0 + cell;
      const dx = x1 <= px ? px - x1 : x0 >= right ? x0 - right : 0;
      const d = Math.hypot(dx, dy);
      if (d < nearest) nearest = d;
      if (dx === 0 && dy === 0) litUnder += 1;
      else if (d < PLATE_BAND_PX) litInBand += 1;
    }
  }
  return {
    plate,
    nearestLitPx: Number.isFinite(nearest)
      ? Math.round(nearest)
      : Math.round(Math.hypot(bits.width * cell, bits.height * cell)),
    litUnder,
    litInBand,
  };
}

/** Metrics of the dark twin: lit means paper on the dark ground. */
export function twoToneMetrics(darkBits: BitImage, plate?: Box, cell = 2): TwoToneMetrics {
  const lit = litFraction(darkBits);
  const warnings: string[] = [];
  if (lit > 0.92 || lit < 0.08) {
    warnings.push(
      `uniform screen: ${(lit * 100).toFixed(1)} percent of cells are lit; a two-tone picture needs an edge (OPENERS.md, round ten rule)`,
    );
  }
  if (lit < 0.02 || lit > 0.98) {
    warnings.push(
      `blank twin: ${(lit * 100).toFixed(1)} percent lit; one twin shows an empty sheet (picture/blank-twin)`,
    );
  }
  const metrics: TwoToneMetrics = { litFraction: Number(lit.toFixed(4)), warnings };
  if (plate) {
    const clear = plateClear(darkBits, plate, cell);
    metrics.plateClear = clear;
    if (clear.litUnder > 0)
      warnings.push(`${clear.litUnder} lit cell(s) under the plate (picture/plate-clear)`);
    else if (clear.litInBand > 0)
      warnings.push(
        `${clear.litInBand} lit cell(s) within ${PLATE_BAND_PX} px of the plate (picture/plate-clear)`,
      );
  }
  return metrics;
}
