import lighthouseJson from '../../../home-deck/slides/lighthouse.json?raw';

/**
 * The site's fields (SiteField.tsx; Kevin, 2026-10-30: "a full width interactive experience with
 * ascii in the background"): a text portrait set in the lighthouse slide's own source. Every cell
 * holds the next character of the slide's JSON, inked as strongly as the picture is light at the
 * cell, and a lens under the pointer inks every cell, so the source reads where the pointer is.
 * These are the fields' pure parts; the component draws them.
 */

/** The sheet the slide's photograph is drawn for (SPEC 4.1). */
export const SHEET = { w: 1600, h: 900 } as const;

/** A cell of Katagami Mono at a size: its advance (0.625 em) by a line of 1.25 em. */
export type Cell = { w: number; h: number };
export const cellFor = (px: number): Cell => ({ w: px * 0.625, h: px * 1.25 });

/** The hero's type: Katagami Mono at 12 px, so one cell is 7.5 by 15 px. */
export const FIELD_FONT_PX = 12;
export const CELL: Cell = cellFor(FIELD_FONT_PX);
/** The footer's name is drawn finer, at 8 px, so its letters have twice the rows. */
export const WORD_FONT_PX = 8;

/** Where the photograph sits in the hero: its top on the band's top, the lantern right of centre. */
export const FOCUS = { x: 0.62, y: 0 } as const;

/** The lens radius in px and the share of its radius that inks at full strength. */
export const LENS_RADIUS = 152;
const LENS_CORE = 0.45;

/** Ink alphas: the lightest cell of the picture, the floor the lens lifts every cell to. */
export const ALPHA = { tone: 0.92, revealed: 0.5 } as const;
/** The picture's levels: tones under `low` are paper and over `high` full ink. */
const LEVELS = { low: 0.3, high: 1 } as const;

/** The slide's source as one line of text: the JSON with no whitespace outside its strings. */
export const SOURCE: string = JSON.stringify(JSON.parse(lighthouseJson));

export type Rect = { x: number; y: number; w: number; h: number };

/** Where a picture of `src` lands when it covers `dst`, placed by the focus (0 to 1 per axis). */
export function cover(
  src: { w: number; h: number },
  dst: { w: number; h: number },
  focus: { x: number; y: number } = { x: 0.5, y: 0.5 },
): { scale: number; x: number; y: number } {
  const scale = Math.max(dst.w / src.w, dst.h / src.h);
  return {
    scale,
    x: (dst.w - src.w * scale) * focus.x,
    y: (dst.h - src.h * scale) * focus.y,
  };
}

/** The cells a rect in field px covers, whole cells, clamped to the grid. */
export function cellsOf(
  rect: Rect,
  grid: { cols: number; rows: number },
  cell: Cell = CELL,
): { c0: number; r0: number; c1: number; r1: number } {
  return {
    c0: Math.max(0, Math.floor(rect.x / cell.w)),
    r0: Math.max(0, Math.floor(rect.y / cell.h)),
    c1: Math.min(grid.cols, Math.ceil((rect.x + rect.w) / cell.w)),
    r1: Math.min(grid.rows, Math.ceil((rect.y + rect.h) / cell.h)),
  };
}

/** A tone (0 paper to 1 ink) through the levels and a smoothstep, so the midtones open up. */
export function toneInk(tone: number): number {
  const t = Math.min(1, Math.max(0, (tone - LEVELS.low) / (LEVELS.high - LEVELS.low)));
  return t * t * (3 - 2 * t);
}

/** The lens's strength at a distance in px: 1 in its core, easing to 0 at its radius. */
export function lensAt(distance: number, radius = LENS_RADIUS): number {
  if (distance >= radius) return 0;
  const t = Math.max(0, (distance / radius - LENS_CORE) / (1 - LENS_CORE));
  return 1 - t * t * (3 - 2 * t);
}

/** A cell's ink alpha: its tone's ink, lifted toward legible by the lens's strength. */
export function alphaOf(tone: number, lens: number): number {
  const base = toneInk(tone) * ALPHA.tone;
  const top = Math.max(base, ALPHA.revealed + (1 - ALPHA.revealed) * toneInk(tone));
  return base + (top - base) * lens;
}

/** The field's fade by row: full over its first `solid` share of rows, then down to 0. */
export function fadeAt(row: number, rows: number, solid = 0.62): number {
  const t = rows <= 1 ? 0 : row / (rows - 1);
  if (t <= solid) return 1;
  const u = (t - solid) / (1 - solid);
  return Math.max(0, 1 - u * u * (3 - 2 * u));
}
