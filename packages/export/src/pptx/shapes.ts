// The shape vocabulary of the Editable text export (gslides-parity SPEC-2 2.1, 2.3, 2.4): the
// preset geometry names, the transform, the shadow, the dash and the line decorations as
// pptxgenjs 4.0.1 takes them, and the object name with its group suffixes. `prst()` is the one
// typed cast: pptxgenjs's `ShapeType` enum lists the ECMA presets under their own names (one
// spelled `folderCorner` where ECMA says `foldedCorner`), and `bentConnector3`, `curvedConnector3`
// and `custGeom` are missing from the 4.0.1 declarations while the runtime writes any string to
// `prst=` unchanged (SPEC-2 0.47), so the builder passes the ECMA string through this helper and
// its header says so.
import type PptxGenJS from 'pptxgenjs';

import type { Box } from '@turboslide/schema/render';
import { CONNECTOR_PRST, DASH_PPTX, LINE_END_PPTX } from '@turboslide/schema/shapes';
import type { Dash, LineEnd } from '@turboslide/schema/shapes';

import type {
  SceneObject,
  SceneRect,
  SceneSegment,
  SceneShadow,
  SceneTransform,
} from '../scene/types.ts';
import { pxToIn, pxToPt } from '../units.ts';

/** An ECMA `prstGeom` name as the pptxgenjs shape name; the runtime writes the string unchanged. */
export function prst(name: string): PptxGenJS.SHAPE_NAME {
  return name as PptxGenJS.SHAPE_NAME;
}

/** The preset a legacy shape id names (docs/freeform.md's five kinds and the round one scene kinds). */
export const LEGACY_PRESET: Readonly<Record<string, string>> = {
  rectangle: 'rect',
  rect: 'rect',
  rounded: 'roundRect',
  roundRect: 'roundRect',
  ellipse: 'ellipse',
};

/**
 * The object name of an exported shape (SPEC 8.2, SPEC-2 2.1.3): `ts:<slide>#<id>`, then the user
 * group as `@g:<tag>` (the outer grpSp), then a row group (the inner one), left to right.
 */
export function objectName(
  prefix: string,
  id: string,
  userGroup: string | undefined,
  group?: string,
): string {
  return `${prefix}#${id}${userGroup ? `@g:${userGroup}` : ''}${group ? `@${group}` : ''}`;
}

/** `rotate`, `flipH` and `flipV` of a positioned object (SPEC-2 2.1.1, 2.1.2). */
export function transformProps(entry: SceneTransform): {
  rotate?: number;
  flipH?: boolean;
  flipV?: boolean;
} {
  const out: { rotate?: number; flipH?: boolean; flipV?: boolean } = {};
  if (entry.rotate !== undefined && entry.rotate !== 0) out.rotate = entry.rotate;
  if (entry.flip === 'h' || entry.flip === 'hv') out.flipH = true;
  if (entry.flip === 'v' || entry.flip === 'hv') out.flipV = true;
  return out;
}

/** A drop shadow as pptxgenjs writes it: outer, the offset and blur in points (SPEC-2 2.3.4). */
export function shadowProps(shadow: SceneShadow | undefined): PptxGenJS.ShadowProps | undefined {
  if (shadow === undefined) return undefined;
  return {
    type: 'outer',
    color: shadow.colorHex,
    opacity: shadow.opacity,
    angle: Math.round(shadow.angle) % 360,
    offset: pxToPt(shadow.distance),
    blur: pxToPt(shadow.blur),
  };
}

/** The pptxgenjs `dashType` of a dash (SPEC-2 2.3.3); undefined for solid. */
export function dashType(dash: Dash | undefined): PptxGenJS.ShapeLineProps['dashType'] | undefined {
  if (dash === undefined || dash === 'solid') return undefined;
  return DASH_PPTX[dash] as PptxGenJS.ShapeLineProps['dashType'];
}

export type ArrowHead = NonNullable<PptxGenJS.ShapeLineProps['endArrowType']>;

/**
 * The pptxgenjs arrow head of a decoration (SPEC-2 2.4.5): `triangle`, `stealth`, `oval`,
 * `diamond`, `arrow`; a head the file cannot draw as drawn (a square, an open circle or diamond)
 * travels as the nearest one and `exact` says so for the residual.
 */
export function arrowHead(end: LineEnd | string | undefined): { head: ArrowHead; exact: boolean } {
  if (end === undefined || !(end in LINE_END_PPTX)) return { head: 'none', exact: true };
  const entry = LINE_END_PPTX[end as LineEnd];
  return { head: entry.head as ArrowHead, exact: entry.exact };
}

/** The common object props of a positioned entry: the transform, the shadow, the alt text. */
export function objectProps(entry: SceneObject): {
  rotate?: number;
  flipH?: boolean;
  flipV?: boolean;
  shadow?: PptxGenJS.ShadowProps;
  altText?: string;
} {
  const shadow = shadowProps(entry.shadow);
  return {
    ...transformProps(entry),
    ...(shadow ? { shadow } : {}),
    ...(entry.alt !== undefined ? { altText: entry.alt } : {}),
  };
}

/** The ECMA connector preset of an elbow or curved connector (SPEC-2 2.4.1, 2.4.2). */
export function connectorPreset(kind: 'elbow' | 'curved'): string {
  return CONNECTOR_PRST[kind];
}

export type CustomPoint = NonNullable<PptxGenJS.ShapeProps['points']>[number];

export type CubicSegment = {
  from: [number, number];
  c1: [number, number];
  c2: [number, number];
  to: [number, number];
};

/**
 * The cubic segments of a Catmull-Rom spline through `points` (SPEC-2 2.4.3 `curve`), the same
 * construction the renderer draws (packages/render blocks/primitives.ts `catmullRomPath`): each
 * control point a sixth of the way along the chord between the neighbours, the ends repeated on
 * an open curve and wrapped on a closed one, so the file's `a:cubicBezTo` path is the sheet's
 * curve and not the polyline through its points. Two points give one straight segment.
 */
export function catmullRomSegments(
  points: ReadonlyArray<[number, number]>,
  closed: boolean,
): CubicSegment[] {
  const n = points.length;
  if (n < 2) return [];
  const at = (i: number): [number, number] => {
    if (closed) return points[((i % n) + n) % n] as [number, number];
    return points[Math.min(n - 1, Math.max(0, i))] as [number, number];
  };
  const out: CubicSegment[] = [];
  const segments = closed ? n : n - 1;
  for (let i = 0; i < segments; i += 1) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    out.push({
      from: p1,
      c1: [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6],
      c2: [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6],
      to: p2,
    });
  }
  return out;
}

/**
 * The `points` of a custom geometry (SPEC-2 2.4.3, 2.4.4): the path kinds' points in inches
 * relative to the segment's bounding box, a `moveTo` first, then straight segments for a
 * polyline or scribble and the Catmull-Rom cubics of `catmullRomSegments` for a curve (each as a
 * pptxgenjs `cubic` point with its two control points), and `close` when the path is closed.
 */
export function customGeometryPoints(
  segment: SceneSegment,
  box: { x: number; y: number },
): CustomPoint[] {
  const points = segment.points ?? [segment.from, segment.to];
  const rel = (p: readonly [number, number]): { x: number; y: number } => ({
    x: pxToIn(p[0] - box.x),
    y: pxToIn(p[1] - box.y),
  });
  const first = points[0];
  if (first === undefined) return [];
  const out: CustomPoint[] = [{ ...rel(first), moveTo: true }];
  if (segment.kind === 'curve' && points.length > 2) {
    for (const cubic of catmullRomSegments(points, segment.closed === true)) {
      const c1 = rel(cubic.c1);
      const c2 = rel(cubic.c2);
      out.push({
        ...rel(cubic.to),
        curve: { type: 'cubic', x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y },
      });
    }
  } else {
    for (const p of points.slice(1)) out.push(rel(p));
  }
  if (segment.closed === true) out.push({ close: true });
  return out;
}

/**
 * The bounding box of a segment's path in sheet px, at least a pixel each way: the points, and
 * for a curve its control points too, so the cubics stay inside the custom geometry's own box.
 */
export function segmentBox(segment: SceneSegment): { x: number; y: number; w: number; h: number } {
  const points = segment.points ?? [segment.from, segment.to];
  const all: [number, number][] = [...points];
  if (segment.kind === 'curve' && points.length > 2)
    for (const cubic of catmullRomSegments(points, segment.closed === true))
      all.push(cubic.c1, cubic.c2);
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(1, Math.max(...xs) - x), h: Math.max(1, Math.max(...ys) - y) };
}

/**
 * The box a shape's geometry is written at: the sheet keeps a shape's outline inside its box (the
 * renderer insets the path by half the stroke), while DrawingML centres the outline on the
 * geometry so half of it lies outside the `a:xfrm`. A shape or box with an outline is written at
 * its box drawn in by half the stroke on every side, and the outer edge of the outline lands on
 * the sheet's. Measured in the render worker image on the fixture's 2 px dashed ellipse: dx -1,
 * dy -1, dw 2 at the full box, inside the 1 px line budget drawn in (b2.md, fix round). The
 * round one plates, chips and panels keep their boxes.
 */
export function outlineBox(rect: SceneRect): Box {
  const [x, y, w, h] = rect.box;
  const width = rect.line?.width ?? 0;
  if (!(width > 0) || (rect.role !== 'shape' && rect.role !== 'box')) return rect.box;
  const inset = Math.min(width / 2, w / 2, h / 2);
  return [x + inset, y + inset, Math.max(0, w - 2 * inset), Math.max(0, h - 2 * inset)];
}
