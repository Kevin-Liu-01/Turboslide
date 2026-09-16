// The rulers' tick math (gslides-parity SPEC-2 6.1 row 29, 0.82, 0.108): Google's default unit is
// the inch, the sheet is 13.333 by 7.5 in at 120 px per inch, a tick every 1/8 in, a numeral at
// every whole inch (0 to 13 across, 14 numerals; 0 to 7 down, 8 numerals; the origin carries its
// numeral), the selection's extent shaded and the pointer's position as a hairline. A drag out of
// a ruler creates a guide at the drop. Pure; rulers.test.tsx (chrome) and canvas.test.ts pin it.
import { DEFAULT_PAGE_SIZE } from './model';
import type { PageSize } from './model';

/** 120 sheet pixels are one inch: the 1600 by 900 sheet is 13.333 by 7.5 in. */
export const PX_PER_INCH = 120;
/** A tick every eighth of an inch. */
export const TICKS_PER_INCH = 8;
/** The rulers' thickness in CSS pixels. */
export const RULER_SIZE_PX = 20;
/** A drag out of a ruler has to travel past its edge by this many CSS pixels to create a guide. */
export const RULER_DRAG_OUT_PX = 4;

export type RulerAxis = 'x' | 'y';

export type RulerTick = {
  /** the tick's position in sheet pixels */
  at: number;
  /** a whole inch (with a numeral), a half, a quarter or an eighth */
  kind: 'inch' | 'half' | 'quarter' | 'eighth';
  /** the numeral of a whole inch tick */
  label?: string;
};

/** The page's length along an axis in sheet pixels (gslides-parity SPEC-5 6.1); the default page when none is given. */
export function axisLength(axis: RulerAxis, page: PageSize = DEFAULT_PAGE_SIZE): number {
  return axis === 'x' ? page.width : page.height;
}

/** Every tick of a ruler from the origin to the page's far edge, an eighth of an inch apart (0 to 13 across on 16:9, 0 to 10 on 4:3, 0 to 12 on 16:10; R08 3f). */
/** The unit a ruler counts in (gslides-parity SPEC-5 6.1; the Preferences' units row): inches, centimetres or sheet pixels. */
export type RulerUnit = 'in' | 'cm' | 'px';

/** Sheet pixels per centimetre: 120 per inch over 2.54. */
export const PX_PER_CM = PX_PER_INCH / 2.54;

/**
 * The ticks of a unit: the numeral pitch in sheet px and how many ticks it splits into (eight
 * per inch, four per centimetre, four per hundred pixels).
 */
export function rulerScale(unit: RulerUnit): { major: number; perMajor: number } {
  switch (unit) {
    case 'cm':
      return { major: PX_PER_CM, perMajor: 4 };
    case 'px':
      return { major: 100, perMajor: 4 };
    default:
      return { major: PX_PER_INCH, perMajor: TICKS_PER_INCH };
  }
}

/**
 * The ticks of an axis: a numeral every unit (the `inch` kind, whatever the unit), the halves,
 * quarters and eighths between; 0 to 13 across and 0 to 7 down in inches on the default page,
 * 0 to 33 across in centimetres, 0 to 1600 by hundreds in sheet pixels.
 */
export function rulerTicks(
  axis: RulerAxis,
  page: PageSize = DEFAULT_PAGE_SIZE,
  unit: RulerUnit = 'in',
): RulerTick[] {
  const length = axisLength(axis, page);
  const { major, perMajor } = rulerScale(unit);
  const step = major / perMajor;
  const out: RulerTick[] = [];
  for (let i = 0; i * step <= length + 1e-9; i += 1) {
    const at = i * step;
    if (at > length) break;
    const kind: RulerTick['kind'] =
      i % perMajor === 0
        ? 'inch'
        : i % (perMajor / 2) === 0
          ? 'half'
          : perMajor >= 8 && i % (perMajor / 4) === 0
            ? 'quarter'
            : perMajor >= 8
              ? 'eighth'
              : 'quarter';
    const tick: RulerTick = { at, kind };
    if (kind === 'inch') tick.label = String(unit === 'px' ? Math.round(at) : i / perMajor);
    out.push(tick);
  }
  return out;
}

/** The numerals a ruler prints: 0 to 13 across (14), 0 to 7 down (8) on the default page. */
export function rulerNumerals(
  axis: RulerAxis,
  page: PageSize = DEFAULT_PAGE_SIZE,
  unit: RulerUnit = 'in',
): string[] {
  return rulerTicks(axis, page, unit)
    .filter((tick) => tick.kind === 'inch')
    .map((tick) => tick.label ?? '');
}

/** Sheet pixels as inches with two decimals, the guide readout's number (the chrome prints the unit). */
export function toInches(px: number): number {
  return Math.round((px / PX_PER_INCH) * 100) / 100;
}

/** The readout sentence: "6.67 in" (menus/strings.ts GUIDES.inches prints the same). */
export function inchesLabel(px: number): string {
  return `${(px / PX_PER_INCH).toFixed(2)} in`;
}

/**
 * The sheet coordinate of a client position along a ruler: the offset from the sheet's edge over
 * the stage scale, clamped inside the sheet, rounded to the pixel `pos` stores.
 */
export function rulerToSheet(
  axis: RulerAxis,
  client: number,
  sheetEdge: number,
  k: number,
  page: PageSize = DEFAULT_PAGE_SIZE,
): number {
  if (!(k > 0)) return 0;
  const raw = (client - sheetEdge) / k;
  return Math.min(axisLength(axis, page), Math.max(0, Math.round(raw)));
}

/** The tick's length in CSS pixels by kind: the whole ruler for an inch, then shorter. */
export function tickLength(kind: RulerTick['kind'], size: number = RULER_SIZE_PX): number {
  switch (kind) {
    case 'inch':
      return size;
    case 'half':
      return Math.round(size * 0.5);
    case 'quarter':
      return Math.round(size * 0.3);
    case 'eighth':
      return Math.round(size * 0.2);
  }
}
