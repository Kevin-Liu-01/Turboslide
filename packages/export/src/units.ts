// Units of the PPTX page (SPEC 8.1; pptx report section 4.1). The 1600 by 900 sheet maps onto the
// 13.333333 by 7.5 inch widescreen page, so one sheet pixel is 1/120 inch, 0.6 pt and 7,620 EMU.
// The layout is defined at 13.333333 inches: 13.3333 produced a page 30 EMU short of PowerPoint's
// 12,192,000 (pptx report section 6 item 7).
import type { Box, Page } from '@turboslide/schema/render';
import { DEFAULT_PAGE } from '@turboslide/schema/render';

/** A page size in sheet pixels (the schema's `Page` without its preset). */
export type PageSize = Pick<Page, 'width' | 'height'>;

/** The default page in inches, the value handed to pptxgenjs defineLayout for a 16:9 deck. */
export const PAGE_IN = { width: 13.333333, height: 7.5 } as const;

/** The default page in EMU, what the geometry read-back asserts against for a 16:9 deck (SPEC 8.5 step 4). */
export const PAGE_EMU = { width: 12_192_000, height: 6_858_000 } as const;

/** The default page in sheet pixels (the schema's DEFAULT_PAGE, repeated by value). */
export const SHEET_PX = { width: 1600, height: 900 } as const;

/**
 * A page in inches (gslides-parity SPEC-5 6.1; R08 3e): the sheet width over 120, written at six
 * decimals for the 16:9 default so pptxgenjs writes PowerPoint's 12,192,000 EMU exactly (13.3333
 * produced a page 30 EMU short, pptx report section 6 item 7). `pageIn(DEFAULT_PAGE)` equals
 * `PAGE_IN`.
 */
export function pageIn(page: PageSize = DEFAULT_PAGE): { width: number; height: number } {
  if (page.width === SHEET_PX.width && page.height === SHEET_PX.height)
    return { width: PAGE_IN.width, height: PAGE_IN.height };
  return {
    width: Math.round((page.width / PX_PER_IN) * 1e6) / 1e6,
    height: Math.round((page.height / PX_PER_IN) * 1e6) / 1e6,
  };
}

/** A page in EMU: `W by 7,620` by `H by 7,620` (gslides-parity SPEC-5 6.1); `pageEmu(DEFAULT_PAGE)` equals `PAGE_EMU`. */
export function pageEmu(page: PageSize = DEFAULT_PAGE): { width: number; height: number } {
  return { width: page.width * EMU_PER_PX, height: page.height * EMU_PER_PX };
}

/** The pptxgenjs layout name of a page: `TS_SHEET_<W>x<H>`; `TS_SHEET_16x9` for the default page (the name every file so far carries). */
export function layoutName(page: PageSize = DEFAULT_PAGE): string {
  if (page.width === SHEET_PX.width && page.height === SHEET_PX.height) return 'TS_SHEET_16x9';
  return `TS_SHEET_${page.width}x${page.height}`;
}

/** True when a picture's pixels have the page's aspect within half a percent (pptx/images.ts). */
export function isPageAspect(
  width: number,
  height: number,
  page: PageSize = DEFAULT_PAGE,
): boolean {
  if (width <= 0 || height <= 0) return false;
  const aspect = page.width / page.height;
  return Math.abs(width / height - aspect) / aspect < 0.005;
}

/** The page a scene was extracted on: its `page` field, else the default page (the scenes of a 16:9 deck at BASE carry none). */
export function scenePage(scene: { page?: PageSize | undefined }): PageSize {
  return scene.page ?? DEFAULT_PAGE;
}

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
