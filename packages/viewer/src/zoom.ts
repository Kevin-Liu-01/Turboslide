// The zoom of the editor's stage (gslides-parity SPEC-2 6.1 rows 27 and 28, 0.81, 0.101): the
// Zoom box takes Fit, the presets and a typed value from 25 to 1600 percent, Cmd+plus and
// Cmd+minus step the ladder from the effective zoom, Cmd+scroll and a trackpad pinch zoom about
// the pointer, and `view.zoom` with `center` scrolls the named sheet point under the stage centre.
// Pure over numbers; zoom.test.ts pins the ladder, the clamp and the centre math. The Editor owns
// the wheel listener and the scroll; the route owns the zoom state through view.zoom.
import type { SheetFit } from './Sheet';

/** The ladder Cmd+plus and Cmd+minus step (Google's 25 to 1600 percent). */
export const ZOOM_LADDER: ReadonlyArray<number> = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 8, 16];
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 16;
/** The presets the Zoom box lists after Fit. */
export const ZOOM_PRESETS: ReadonlyArray<number> = [0.5, 1, 2];
/** One wheel tick of this many pixels doubles or halves the zoom (a trackpad pinch reports small deltas). */
export const WHEEL_ZOOM_PX = 400;

export type Zoom = number | 'fit';

/** A zoom factor clamped to Google's range. */
export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

/**
 * The next ladder value above (1) or below (-1) the effective zoom; the ends hold. A zoom between
 * two rungs steps to the neighbouring rung, so 0.86 (a fit) steps up to 1 and down to 0.75.
 */
export function stepZoom(effective: number, direction: 1 | -1): number {
  const epsilon = 1e-6;
  if (direction > 0) {
    const next = ZOOM_LADDER.find((rung) => rung > effective + epsilon);
    return next ?? ZOOM_MAX;
  }
  const below = ZOOM_LADDER.filter((rung) => rung < effective - epsilon);
  return below[below.length - 1] ?? ZOOM_MIN;
}

/**
 * The zoom the Zoom box's text names: "Fit" (any case), a percent with or without the sign, or a
 * factor under 16 written with a point ("1.5"); null for anything else. Out of range values clamp.
 */
export function parseZoomInput(text: string): Zoom | null {
  const trimmed = text.trim().toLowerCase();
  if (trimmed === '') return null;
  if (trimmed === 'fit') return 'fit';
  const match = /^(\d+(?:\.\d+)?)\s*%?$/.exec(trimmed);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  return clampZoom(value / 100);
}

/** What the Zoom box reads: "Fit" while the stage fits, else the percent without decimals. */
export function formatZoom(zoom: Zoom): string {
  if (zoom === 'fit') return 'Fit';
  return `${Math.round(zoom * 100)}%`;
}

/**
 * The zoom after a wheel or pinch: an exponential of the vertical delta so a pinch feels the same
 * at every level; the default direction (a negative delta zooms in) matches Google Slides.
 */
export function zoomFromWheel(current: number, deltaY: number): number {
  return clampZoom(current * Math.exp(-deltaY / WHEEL_ZOOM_PX));
}

export type Viewport = { width: number; height: number };

/**
 * The scroll of the stage that keeps a sheet point under the stage centre at a fit (SPEC-2 0.81):
 * the sheet's border box sits at `fit.left + 1`, `fit.top + 1` inside the scrolled surface.
 */
export function scrollForCenter(
  center: { x: number; y: number },
  fit: SheetFit,
  viewport: Viewport,
): { left: number; top: number } {
  return {
    left: Math.max(0, Math.round(fit.left + 1 + center.x * fit.scale - viewport.width / 2)),
    top: Math.max(0, Math.round(fit.top + 1 + center.y * fit.scale - viewport.height / 2)),
  };
}

/**
 * The sheet point under the stage centre for a given scroll, the inverse of `scrollForCenter`:
 * what `view.zoom` reports as the scroll's meaning.
 */
export function centerForScroll(
  scroll: { left: number; top: number },
  fit: SheetFit,
  viewport: Viewport,
): { x: number; y: number } {
  return {
    x: (scroll.left + viewport.width / 2 - fit.left - 1) / fit.scale,
    y: (scroll.top + viewport.height / 2 - fit.top - 1) / fit.scale,
  };
}

/**
 * The sheet point to keep under the stage centre so that the sheet point `under` (the point under
 * the pointer before a pinch) stays under the pointer after the zoom to `nextScale`: the pointer's
 * offset from the stage centre in stage pixels, divided by the new scale.
 */
export function centerKeepingPoint(
  under: { x: number; y: number },
  pointer: { x: number; y: number },
  viewport: Viewport,
  nextScale: number,
): { x: number; y: number } {
  return {
    x: under.x + (viewport.width / 2 - pointer.x) / nextScale,
    y: under.y + (viewport.height / 2 - pointer.y) / nextScale,
  };
}
