// Units of the Google Slides page (SPEC 8.1, 8.3). presentations.create ignores every field but
// the title, so the page stays the default 10 by 5.625 inches: 9,144,000 by 5,143,500 EMU. The
// 1600 by 900 sheet maps onto it at 5,715 EMU per sheet pixel, which is 0.45 pt (12,700 EMU per
// point); a 22 px paragraph is 9.9 pt and a 1 px hairline 0.45 pt. Colors travel as RGB floats in
// 0..1 (RgbColor); alpha exists on fills and lines (SolidFill.alpha) and not on text.
import type { Box } from '@turboslide/schema/render';

import { compositeHex, parseCssColor } from '../units.ts';

/** The default page in EMU, what the geometry check asserts against (SPEC 8.5 step 4). */
export const SLIDES_PAGE_EMU = { width: 9_144_000, height: 5_143_500 } as const;

export const SLIDES_EMU_PER_PX = 5715;
export const SLIDES_PT_PER_PX = 0.45;
export const EMU_PER_PT = 12_700;

export type Dimension = { magnitude: number; unit: 'EMU' | 'PT' };

export type RgbColor = { red: number; green: number; blue: number };

export function pxToEmu(px: number): number {
  return Math.round(px * SLIDES_EMU_PER_PX);
}

export function emuToPx(value: number): number {
  return value / SLIDES_EMU_PER_PX;
}

/** Points from sheet pixels, to two decimals: 22 px is 9.9 pt, 44 px is 19.8 pt. */
export function pxToPt(px: number): number {
  return Math.round(px * SLIDES_PT_PER_PX * 100) / 100;
}

export function ptToPx(value: number): number {
  return value / SLIDES_PT_PER_PX;
}

export function emu(px: number): Dimension {
  return { magnitude: pxToEmu(px), unit: 'EMU' };
}

export function pt(value: number): Dimension {
  return { magnitude: Math.round(value * 100) / 100, unit: 'PT' };
}

/** A sheet box as the size and transform of a page element. */
export function elementGeometry(box: Box): {
  size: { width: Dimension; height: Dimension };
  transform: {
    scaleX: 1;
    scaleY: 1;
    translateX: number;
    translateY: number;
    unit: 'EMU';
  };
} {
  const [x, y, w, h] = box;
  return {
    size: { width: emu(w), height: emu(h) },
    transform: {
      scaleX: 1,
      scaleY: 1,
      translateX: pxToEmu(x),
      translateY: pxToEmu(y),
      unit: 'EMU',
    },
  };
}

/** Six hex digits to RgbColor floats, four decimals. */
export function hexToRgb(hex: string): RgbColor {
  const channel = (i: number): number =>
    Math.round((parseInt(hex.slice(i, i + 2), 16) / 255) * 10_000) / 10_000;
  return { red: channel(0), green: channel(2), blue: channel(4) };
}

/**
 * A CSS color as RgbColor plus its alpha. With `groundHex` a translucent color is composited on
 * that ground and comes back opaque (text has no alpha in Slides); without it the alpha is kept
 * for a SolidFill.
 */
export function cssToRgb(value: string, groundHex?: string): { rgb: RgbColor; alpha: number } {
  const parsed = parseCssColor(value);
  if (parsed.alpha < 1 && groundHex)
    return { rgb: hexToRgb(compositeHex(parsed, groundHex)), alpha: 1 };
  return { rgb: hexToRgb(parsed.hex), alpha: Math.round(parsed.alpha * 10_000) / 10_000 };
}

/**
 * The paragraph line spacing as a percentage of the font's normal pitch: Inter's normal line
 * height is 1.21 em (ascender 1984, descender -494 of 2048), so a 33 px pitch at 22 px is 124.0
 * and 48.4 px at 44 px is 90.9 (SPEC 8.3). One decimal.
 */
export function lineSpacingPercent(lineHeightPx: number, sizePx: number, normal: number): number {
  if (sizePx <= 0 || normal <= 0) return 100;
  return Math.round((lineHeightPx / (sizePx * normal)) * 1000) / 10;
}

/** True when the element's box lies inside the page (a zero-size axis is allowed for lines). */
export function insidePage(
  translateX: number,
  translateY: number,
  width: number,
  height: number,
): boolean {
  return (
    translateX >= 0 &&
    translateY >= 0 &&
    width >= 0 &&
    height >= 0 &&
    translateX + width <= SLIDES_PAGE_EMU.width &&
    translateY + height <= SLIDES_PAGE_EMU.height
  );
}
