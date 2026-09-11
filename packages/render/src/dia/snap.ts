// The half-pixel grid of declared diagrams (report 03 section 5.11; DECK-GRAMMAR.md:44-45): a 1 px
// stroke renders as one crisp pixel only when its coordinate ends in .5, a 1.5 px stroke and every
// fill sit on whole or half pixels, and a label keeps 12 px of clearance from any stroke. The
// editor's Alt-drag (SPEC 6.4), the templates and the dia/* lint rules read these functions so the
// grid, the label box estimate and the clearance are one arithmetic; nothing here touches a DOM.
import type { Diagram } from '@turboslide/schema/blocks';

/** The clearance a label keeps from the nearest stroke, in diagram units (DECK-GRAMMAR.md:45). */
export const LABEL_CLEARANCE = 12;
/** The marker is an 11 px filled square centered on its point (DECK-GRAMMAR.md:44). */
export const MARKER_SIZE = 11;

/** Rounds to the half pixel: 12.3 becomes 12.5, 12.2 becomes 12. */
export function snapHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

/** A coordinate a 1 px stroke should sit on: the nearest x.5. */
export function snapStroke(value: number): number {
  return Math.round(value - 0.5) + 0.5;
}

/**
 * Snaps a value for a stroke of the given width: odd widths (1) land on .5, everything else on the
 * half-pixel grid (the same rule the renderer applies when it emits a declared line).
 */
export function snapFor(value: number, width: number): number {
  return width % 2 === 1 ? snapStroke(value) : snapHalf(value);
}

/** Snaps a point to the half-pixel grid, for labels and markers dragged in the editor. */
export function snapPoint(x: number, y: number): { x: number; y: number } {
  return { x: snapHalf(x), y: snapHalf(y) };
}

export type DiaBox = [number, number, number, number];

/**
 * The approximate box of a label: Inter runs about 0.52 em per character at weights 400 and 500
 * (report 03 section 4.7), the baseline sits about 0.75 em under the top of the box. The estimate
 * is what the linter and the editor's live clearance share; the renderer measures nothing.
 */
export function labelBox(t: Diagram['texts'][number]): DiaBox {
  const w = t.text.length * t.size * 0.52;
  const x = t.anchor === 'middle' ? t.x - w / 2 : t.anchor === 'end' ? t.x - w : t.x;
  return [x, t.y - t.size * 0.75, w, t.size];
}

/** The box of a marker square around its center. */
export function markerBox(m: Diagram['markers'][number]): DiaBox {
  return [m.x - MARKER_SIZE / 2, m.y - MARKER_SIZE / 2, MARKER_SIZE, MARKER_SIZE];
}

/** Distance from a box to a segment, 0 when they intersect. */
export function boxToSegment(box: DiaBox, x1: number, y1: number, x2: number, y2: number): number {
  const [bx, by, bw, bh] = box;
  const steps = 16;
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const px = x1 + (x2 - x1) * t;
    const py = y1 + (y2 - y1) * t;
    const dx = px < bx ? bx - px : px > bx + bw ? px - (bx + bw) : 0;
    const dy = py < by ? by - py : py > by + bh ? py - (by + bh) : 0;
    const d = Math.hypot(dx, dy);
    if (d < best) best = d;
  }
  return best;
}

/** Every stroke of a diagram as segments: lines, stroked rect edges, stroked polygon edges. */
export function strokeSegments(data: Diagram): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  for (const line of data.lines) out.push([line.x1, line.y1, line.x2, line.y2]);
  for (const rect of data.rects) {
    if (!rect.stroke) continue;
    const { x, y, w, h } = rect;
    out.push(
      [x, y, x + w, y],
      [x, y + h, x + w, y + h],
      [x, y, x, y + h],
      [x + w, y, x + w, y + h],
    );
  }
  for (const polygon of data.polygons ?? []) {
    if (!polygon.stroke) continue;
    const points = polygon.points;
    points.forEach(([x, y], i) => {
      const next = points[(i + 1) % points.length];
      if (next) out.push([x, y, next[0], next[1]]);
    });
  }
  return out;
}

/**
 * The clearance of one label from the nearest stroke or marker, in diagram units, and whether it
 * meets LABEL_CLEARANCE. Markers count as strokes: a label over a marker is unreadable.
 */
export function labelClearance(
  data: Diagram,
  index: number,
): { box: DiaBox; nearest: number; ok: boolean } {
  const text = data.texts[index];
  if (!text) return { box: [0, 0, 0, 0], nearest: Number.POSITIVE_INFINITY, ok: true };
  const box = labelBox(text);
  let nearest = Number.POSITIVE_INFINITY;
  for (const [x1, y1, x2, y2] of strokeSegments(data))
    nearest = Math.min(nearest, boxToSegment(box, x1, y1, x2, y2));
  for (const marker of data.markers) {
    const [mx, my, mw, mh] = markerBox(marker);
    nearest = Math.min(
      nearest,
      boxToSegment(box, mx, my, mx + mw, my),
      boxToSegment(box, mx, my + mh, mx + mw, my + mh),
      boxToSegment(box, mx, my, mx, my + mh),
      boxToSegment(box, mx + mw, my, mx + mw, my + mh),
    );
  }
  return { box, nearest, ok: nearest >= LABEL_CLEARANCE };
}

/**
 * The scale from diagram units to sheet pixels for a rendered dia: with `fit: 'slot'` one unit is
 * one pixel; with a viewBox the svg is `width: 100%` of its column and the units scale with it.
 */
export function unitsPerPixel(
  fit: 'slot' | { viewBox: [number, number, number, number] },
  data: Pick<Diagram, 'w'>,
  renderedWidth: number,
): number {
  if (fit === 'slot') return 1;
  const viewWidth = fit.viewBox[2] > 0 ? fit.viewBox[2] : data.w;
  return renderedWidth > 0 ? viewWidth / renderedWidth : 1;
}
