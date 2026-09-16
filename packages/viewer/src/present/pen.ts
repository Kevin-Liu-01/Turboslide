// The pen of the show (gslides-parity SPEC-5 0.15, 2.2; MILESTONES-5 B1 day 7): Google's "Turn on
// the pen" draws strokes over the slide; Turboslide draws them on one canvas over the stage in
// `--pt-ink` at 3 sheet pixels, keeps them in sheet coordinates so a second window at another
// size draws the same lines, clears them on a slide change and on Esc, and stores nothing. The
// strokes travel to the other windows of the deck as `stroke` messages of the presenter channel;
// this module holds the geometry and the drawing, the Slideshow the pointer events.
import type { PresentStroke } from './presentSync';

/** The pen's width in sheet pixels (SPEC-5 0.15). */
export const PEN_WIDTH_PX = 3;

/** The sheet box a canvas draws over: where the sheet sits in the canvas and its scale. */
export type SheetFrame = {
  left: number;
  top: number;
  /** device pixels per sheet pixel */
  scale: number;
};

/** A point in client coordinates to sheet pixels against the sheet's box. */
export function toSheetPoint(
  clientX: number,
  clientY: number,
  sheet: { left: number; top: number; width: number },
  pageWidth: number,
): [number, number] {
  const scale = sheet.width / pageWidth || 1;
  return [
    Math.round(((clientX - sheet.left) / scale) * 10) / 10,
    Math.round(((clientY - sheet.top) / scale) * 10) / 10,
  ];
}

/** A stroke's points in sheet pixels, or a partial one, appended in place. */
export function appendPoint(stroke: PresentStroke, point: [number, number]): PresentStroke {
  const last = stroke.points.length;
  // a point under half a sheet pixel from the last one adds nothing
  if (
    last >= 2 &&
    Math.abs((stroke.points[last - 2] ?? 0) - point[0]) < 0.5 &&
    Math.abs((stroke.points[last - 1] ?? 0) - point[1]) < 0.5
  )
    return stroke;
  return { ...stroke, points: [...stroke.points, point[0], point[1]] };
}

/** A fresh stroke id: the slide, the clock and a counter, unique across the windows. */
let strokeCounter = 0;
export function newStrokeId(): string {
  strokeCounter += 1;
  return `${Date.now().toString(36)}-${strokeCounter.toString(36)}`;
}

/** The strokes of one slide after a message: a partial stroke of the same id is replaced. */
export function mergeStroke(strokes: PresentStroke[], incoming: PresentStroke): PresentStroke[] {
  const at = strokes.findIndex((stroke) => stroke.id === incoming.id);
  if (at < 0) return [...strokes, incoming];
  const next = [...strokes];
  next[at] = incoming;
  return next;
}

/** The drawing surface the pen paints on; the canvas 2d context, or a fake in a test. */
export type PenContext = {
  clearRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  strokeStyle: string | CanvasGradient | CanvasPattern;
};

/**
 * Draws every stroke of a slide onto a cleared canvas: the sheet's frame maps sheet pixels to
 * device pixels, the width is `PEN_WIDTH_PX` sheet pixels, the colour is the ink handed in.
 */
export function drawStrokes(
  ctx: PenContext,
  size: { width: number; height: number },
  strokes: readonly PresentStroke[],
  frame: SheetFrame,
  ink: string,
): void {
  ctx.clearRect(0, 0, size.width, size.height);
  ctx.lineWidth = Math.max(1, PEN_WIDTH_PX * frame.scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = ink;
  for (const stroke of strokes) {
    const points = stroke.points;
    if (points.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(
      frame.left + (points[0] ?? 0) * frame.scale,
      frame.top + (points[1] ?? 0) * frame.scale,
    );
    if (points.length === 2)
      ctx.lineTo(
        frame.left + (points[0] ?? 0) * frame.scale,
        frame.top + (points[1] ?? 0) * frame.scale,
      );
    for (let i = 2; i < points.length; i += 2)
      ctx.lineTo(
        frame.left + (points[i] ?? 0) * frame.scale,
        frame.top + (points[i + 1] ?? 0) * frame.scale,
      );
    ctx.stroke();
  }
}
