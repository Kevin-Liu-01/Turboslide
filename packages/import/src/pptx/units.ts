// Units of the PPTX reader (gslides-parity SPEC-5 0.26, 5.1; R04 section 4; R08 3g): the export's
// constants read in reverse. One sheet pixel is 7,620 EMU, 1/120 inch and 0.6 pt, so a 16:9 page
// of 12,192,000 by 6,858,000 EMU is the 1600 by 900 sheet and `sz="1320"` is 22 px. Any other
// slide size follows the `sheet` mode of R08 3g: `match` sets the deck's page to the source's
// size at the same 7,620 EMU per pixel with no bars (a Google 10 by 5.625 in deck becomes 1200
// by 675 px and keeps its point sizes); `fit` scales the source by its limiting dimension onto the
// current page and centres it, the letterbox of R04 4 (4:3 onto the 1600 by 900 sheet is 1200 by
// 900 at x offset 200, 16:10 is 1440 by 900 at x offset 80). Every coordinate the mapping writes
// is in sheet pixels of the destination page; the mapping records the offset so the report can
// state the bars.
import type { Flip } from '@turboslide/schema/position';
import { normalizeRotation } from '@turboslide/schema/position';
import type { Page, PagePreset } from '@turboslide/schema/render';
import {
  DEFAULT_PAGE,
  PAGE_MAX_PX,
  PAGE_MIN_PX,
  PAGE_PRESET_SIZES,
} from '@turboslide/schema/render';

export const EMU_PER_PX = 7620;
export const EMU_PER_IN = 914_400;
export const EMU_PER_PT = 12_700;
export const PX_PER_IN = 120;
export const PT_PER_PX = 0.6;

/** The 16:9 page in EMU (the export's `PAGE_EMU`). */
export const WIDE_PAGE_EMU = { cx: 12_192_000, cy: 6_858_000 } as const;

/** The default text insets of `a:bodyPr` in EMU (R04 4): 12 px and 6 px on the sheet. */
export const DEFAULT_INSETS_EMU = { l: 91_440, t: 45_720, r: 91_440, b: 45_720 } as const;

/** Two aspect ratios agree within half a percent (the tolerance `isSheetAspect` uses, R04 4). */
export const ASPECT_TOLERANCE = 0.005;

export type SourceSize = { cx: number; cy: number };

export type SheetMode = 'match' | 'fit';

export type SheetMapping = {
  /** the mode that produced the mapping; `fit` after a `match` the page bounds refused carries `fallback` */
  mode: SheetMode;
  /** sheet pixels per EMU */
  scale: number;
  /** the letterbox offset in sheet pixels (zero under `match` and for a source of the page's aspect) */
  offset: [number, number];
  /** the destination page in sheet pixels */
  page: Page;
  source: SourceSize;
  /** the bars in sheet pixels on each side, for the report (R04 4) */
  bars: { x: number; y: number };
  /** set when `match` fell back to `fit` because the source size lies outside 120 to 6720 px */
  fallback?: 'fit';
};

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** The preset a page size names, or `custom`. */
export function presetOf(width: number, height: number): PagePreset {
  for (const [preset, size] of Object.entries(PAGE_PRESET_SIZES) as [PagePreset, Page][]) {
    if (size.width === width && size.height === height) return preset;
  }
  return 'custom';
}

/** True when the two aspect ratios agree within `ASPECT_TOLERANCE`. */
export function sameAspect(a: SourceSize, b: { width: number; height: number }): boolean {
  const ra = a.cx / a.cy;
  const rb = b.width / b.height;
  return Math.abs(ra - rb) / rb <= ASPECT_TOLERANCE;
}

/**
 * The mapping from a source `p:sldSz` onto the sheet (R08 3g). A source without a positive size
 * is read as the 16:9 page.
 */
export function sheetMapping(
  source: SourceSize,
  mode: SheetMode,
  currentPage: Page = DEFAULT_PAGE,
): SheetMapping {
  const src: SourceSize =
    source.cx > 0 && source.cy > 0 ? source : { cx: WIDE_PAGE_EMU.cx, cy: WIDE_PAGE_EMU.cy };
  if (mode === 'match') {
    const width = Math.round(src.cx / EMU_PER_PX);
    const height = Math.round(src.cy / EMU_PER_PX);
    const inBounds = [width, height].every((v) => v >= PAGE_MIN_PX && v <= PAGE_MAX_PX);
    if (inBounds) {
      return {
        mode,
        scale: 1 / EMU_PER_PX,
        offset: [0, 0],
        page: { width, height, preset: presetOf(width, height) },
        source: src,
        bars: { x: 0, y: 0 },
      };
    }
    return { ...sheetMapping(src, 'fit', currentPage), fallback: 'fit' };
  }
  const page: Page = { ...currentPage };
  if (sameAspect(src, page)) {
    return {
      mode,
      scale: page.width / src.cx,
      offset: [0, 0],
      page,
      source: src,
      bars: { x: 0, y: 0 },
    };
  }
  const scale = Math.min(page.width / src.cx, page.height / src.cy);
  const x = (page.width - src.cx * scale) / 2;
  const y = (page.height - src.cy * scale) / 2;
  return {
    mode,
    scale,
    offset: [x, y],
    page,
    source: src,
    bars: { x: roundTo(x, 2), y: roundTo(y, 2) },
  };
}

/** A length in EMU as sheet pixels under the mapping (no offset), rounded to 0.01 px. */
export function emuToPx(emu: number, mapping: SheetMapping): number {
  return roundTo(emu * mapping.scale, 2);
}

/** A point of the source page as a sheet point (the offset applied). */
export function pointToPx(x: number, y: number, mapping: SheetMapping): [number, number] {
  return [
    roundTo(mapping.offset[0] + x * mapping.scale, 2),
    roundTo(mapping.offset[1] + y * mapping.scale, 2),
  ];
}

export type PxBox = { x: number; y: number; w: number; h: number };

/** An `a:off` and `a:ext` pair as a sheet box. */
export function boxToPx(
  off: readonly [number, number],
  ext: readonly [number, number],
  mapping: SheetMapping,
): PxBox {
  const [x, y] = pointToPx(off[0], off[1], mapping);
  return { x, y, w: emuToPx(ext[0], mapping), h: emuToPx(ext[1], mapping) };
}

/** A `sz` attribute (hundredths of a point) as sheet pixels, rounded to a half pixel (SPEC-5 5.1). */
export function szToPx(sz: number, mapping: SheetMapping): number {
  return Math.round((sz / 100) * EMU_PER_PT * mapping.scale * 2) / 2;
}

/** Points to sheet pixels under the mapping, exact. */
export function ptToPx(pt: number, mapping: SheetMapping): number {
  return pt * EMU_PER_PT * mapping.scale;
}

/** An `ST_Angle` (60,000ths of a degree clockwise) as degrees in [0, 360). */
export function angleOf(rot: number | undefined): number {
  if (rot === undefined || rot === 0) return 0;
  return normalizeRotation(roundTo(rot / 60_000, 3));
}

/** `flipH` and `flipV` as the schema's `flip`. */
export function flipOf(flipH: boolean | undefined, flipV: boolean | undefined): Flip | undefined {
  if (flipH === true && flipV === true) return 'hv';
  if (flipH === true) return 'h';
  if (flipV === true) return 'v';
  return undefined;
}

/**
 * An `ST_Percentage` as a fraction (R04 4): thousandths of a percent as an integer (`18000` is
 * 0.18) or the `NN%` string form some producers write (`18%`, `92.5%`). Undefined when neither.
 */
export function percentOf(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const text = value.trim();
  const pct = /^(-?\d+(?:\.\d+)?)%$/.exec(text);
  if (pct !== null) return Number(pct[1]) / 100;
  if (/^-?\d+$/.test(text)) return Number(text) / 100_000;
  return undefined;
}

/** A fraction clamped to 0 to 1. */
export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** A line width in EMU as sheet pixels, exact (the snap to a stroke ladder is the caller's). */
export function lineWidthPx(emu: number, mapping: SheetMapping): number {
  return roundTo(emu * mapping.scale, 3);
}
