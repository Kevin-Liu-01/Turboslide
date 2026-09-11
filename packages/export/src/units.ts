// Units of the PPTX page (SPEC 8.1; pptx report section 4.1). The 1600 by 900 sheet maps onto the
// 13.333333 by 7.5 inch widescreen page, so one sheet pixel is 1/120 inch, 0.6 pt and 7,620 EMU.
// The layout is defined at 13.333333 inches: 13.3333 produced a page 30 EMU short of PowerPoint's
// 12,192,000 (pptx report section 6 item 7).
import type { Box } from '@turboslide/schema/render';

/** The page in inches, the value handed to pptxgenjs defineLayout. */
export const PAGE_IN = { width: 13.333333, height: 7.5 } as const;

/** The page in EMU, what the geometry read-back asserts against (SPEC 8.5 step 4). */
export const PAGE_EMU = { width: 12_192_000, height: 6_858_000 } as const;

export const SHEET_PX = { width: 1600, height: 900 } as const;

/** Sheet pixels per inch. */
export const PX_PER_IN = 120;
/** Points per sheet pixel. */
export const PT_PER_PX = 0.6;
/** EMU per sheet pixel. */
export const EMU_PER_PX = 7620;
export const EMU_PER_IN = 914_400;
export const EMU_PER_PT = 12_700;

export function pxToIn(px: number): number {
  return px / PX_PER_IN;
}

export function pxToPt(px: number): number {
  return px * PT_PER_PX;
}

export function pxToEmu(px: number): number {
  return Math.round(px * EMU_PER_PX);
}

export function emuToPx(emu: number): number {
  return emu / EMU_PER_PX;
}

/** A sheet box in inches, the shape pptxgenjs position options take. */
export function boxToIn(box: Box): { x: number; y: number; w: number; h: number } {
  return { x: pxToIn(box[0]), y: pxToIn(box[1]), w: pxToIn(box[2]), h: pxToIn(box[3]) };
}

/**
 * The font size attribute value pptxgenjs writes, in hundredths of a point: 22 px is 13.2 pt and
 * sz="1320"; 44 px is sz="2640" (pptx report section 4.1).
 */
export function szOf(px: number): number {
  return Math.round(pxToPt(px) * 100);
}

/** The letter-spacing attribute in hundredths of a point: -1.1 px at 44 px is spc="-66". */
export function spcOf(letterSpacingPx: number): number {
  return Math.round(pxToPt(letterSpacingPx) * 100);
}

/** The exact line pitch in hundredths of a point: 33 px is spcPts val="1980". */
export function spcPtsOf(lineHeightPx: number): number {
  return Math.round(pxToPt(lineHeightPx) * 100);
}

/** The line width attribute in EMU: a 1 px hairline is w="7620". */
export function lineWidthEmu(px: number): number {
  return Math.round(px * EMU_PER_PX);
}

/** rgb()/rgba()/#hex to the six-digit hex pptxgenjs wants, plus the alpha in 0..1. */
export function parseCssColor(value: string): { hex: string; alpha: number } {
  const hex = /^#([0-9a-f]{6})$/i.exec(value.trim());
  if (hex) return { hex: (hex[1] ?? '000000').toUpperCase(), alpha: 1 };
  const short = /^#([0-9a-f]{3})$/i.exec(value.trim());
  if (short) {
    const s = short[1] ?? '000';
    return {
      hex: s
        .split('')
        .map((c) => c + c)
        .join('')
        .toUpperCase(),
      alpha: 1,
    };
  }
  const rgb =
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(
      value.trim(),
    ) ??
    /^rgba?\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?)\s*)?\)$/i.exec(value.trim());
  if (!rgb) return { hex: '000000', alpha: 1 };
  const channel = (v: string | undefined): string =>
    Math.max(0, Math.min(255, Math.round(Number(v ?? 0))))
      .toString(16)
      .padStart(2, '0');
  const alphaRaw = rgb[4];
  let alpha = 1;
  if (alphaRaw !== undefined)
    alpha = alphaRaw.endsWith('%') ? Number(alphaRaw.slice(0, -1)) / 100 : Number(alphaRaw);
  return { hex: `${channel(rgb[1])}${channel(rgb[2])}${channel(rgb[3])}`.toUpperCase(), alpha };
}

/** Source-over composite of a translucent color on an opaque hex ground, as pptx report 4.1 did for the master lines. */
export function compositeHex(over: { hex: string; alpha: number }, groundHex: string): string {
  const top = [0, 2, 4].map((i) => parseInt(over.hex.slice(i, i + 2), 16));
  const base = [0, 2, 4].map((i) => parseInt(groundHex.slice(i, i + 2), 16));
  return base
    .map((b, i) => Math.round(b + ((top[i] ?? 0) - b) * over.alpha))
    .map((c) => c.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

/** pptxgenjs `transparency` (0 to 100 percent) for a CSS alpha; alpha 0.18 becomes 82 and `<a:alpha val="18000"/>`. */
export function transparencyOf(alpha: number): number {
  return Math.round((1 - alpha) * 100);
}
