import { CANVAS_SCREEN } from './copy';

/**
 * The Canvas screen's slide as data and the editor's canvas arithmetic over it (CanvasScreen.tsx):
 * the lighthouse slide's blocks, what a move, a resize, a turn, a nudge, a duplicate, a delete and
 * an order write, the undo record, and the action call the editor sends for each, which the screen
 * prints under the slide.
 *
 * The arithmetic is the product's own, copied by value: `snapMove`, `snapResize`, the sheet's snap
 * lines and the equal spacing snap of packages/viewer/src/snap.ts, `resizeBox` of
 * packages/schema/src/canvas.ts, `rotationFromDrag` of packages/viewer/src/rotate.ts, and
 * `boundingBox`, `unionBox`, `rotatePositions`, `scalePositions` and `reorderZ` of
 * packages/schema/src/freeform.ts. The landing cannot import those modules: they reach zod and
 * the shape table through `@turboslide/schema/deck` and `blocks`, which graph.test.ts keeps off
 * /home. canvas-pose.test.ts runs every gesture here and the editor's own `freeGesture`,
 * `freeNudgeMutations` and `zOrderMutations` on the same slide and asserts the two calls agree,
 * so this copy cannot drift from the editor.
 */

/** A box in slide px: x, y, width, height. */
export type Box = readonly [number, number, number, number];
export type Point = { x: number; y: number };

/** An object's place on the 1600 by 900 slide as the document holds it (packages/schema position.ts). */
export type Pos = { x: number; y: number; w: number; h: number; z?: number; rotate?: number };

export type ObjectType = 'picture' | 'box' | 'heading' | 'paragraph' | 'credit';

/** One block of the slide: its id, its type, its place, and its other fields as the document holds them. */
export type SlideObject = {
  id: string;
  type: ObjectType;
  pos: Pos;
  fields: Readonly<Record<string, unknown>>;
};

/** The slide's blocks in document order (the freeform slot `main`). */
export type Scene = readonly SlideObject[];

export const SLIDE_ID = 'lighthouse';
export const SHEET_W = 1600;
export const SHEET_H = 900;

const { slide } = CANVAS_SCREEN;

/**
 * The lighthouse slide (docs/SITE.md 9) as the Turboslide CLI converted it (2026.1008.3, built at
 * 417fd808, on a copy of `apps/studio/home-deck`): `slide to-canvas lighthouse` placed every block
 * at its measured box (home-deck/recorded/lighthouse-canvas.json), the heading was moved off the
 * plate and turned to 354 degrees, and the plate's group tag is removed as Arrange > Ungroup
 * writes it, so each object selects on its own. The picture covers the slide and is the slide's
 * ground here: it takes no selection, so a press on it clears the selection or starts a marquee.
 */
export const LIGHTHOUSE: Scene = [
  {
    id: 'picture',
    type: 'picture',
    pos: { x: 0, y: 0, w: 1600, h: 900, z: 0 },
    fields: { asset: 'mood-lighthouse', side: 'lower-right' },
  },
  {
    id: 'plate',
    type: 'box',
    pos: { x: 903, y: 536.734375, w: 560, h: 234.265625, z: 1 },
    fields: {
      fill: 'paper',
      strokeWidth: 0,
      padding: { top: 22, right: 26, bottom: 20, left: 26 },
    },
  },
  {
    id: 'h',
    type: 'heading',
    pos: { x: 137, y: 129, w: 508, h: 48, z: 2, rotate: 354 },
    fields: { level: 'title', text: slide.heading, autofit: 'shrink' },
  },
  {
    id: 'p1',
    type: 'paragraph',
    pos: { x: 929, y: 618.25, w: 508, h: 99, z: 3 },
    fields: { text: slide.paragraph, marginTop: 12, autofit: 'shrink' },
  },
  {
    id: 'credit',
    type: 'credit',
    pos: { x: 929, y: 729.25, w: 508, h: 21.75, z: 4 },
    fields: { text: slide.credit },
  },
];

/** A box or corner within this many slide px of a snap line takes the line (schema SNAP_DISTANCE). */
export const SNAP_PX = 6;
/** The smallest side a resize leaves (viewer FREE_MIN_SIZE, schema RESIZE_MIN_SIZE). */
export const MIN_SIZE = 16;
/** A text object's ring stands this far off its box (viewer text-ring.ts TEXT_RING_OUTSET). */
export const RING_OUTSET = 10;
/** A copy sits this far right and down of its original (store-actions.ts DUPLICATE_OFFSET_PX). */
export const DUPLICATE_OFFSET = 16;
/** Shift turns in steps of this many degrees (viewer rotate.ts ROTATE_SNAP_DEG). */
export const TURN_STEP = 15;

const TEXT_TYPES: ReadonlySet<ObjectType> = new Set(['heading', 'paragraph', 'credit']);

/** The picture is the slide's ground on this screen: never selected, moved or hit by a marquee. */
export function isGround(object: SlideObject): boolean {
  return object.type === 'picture';
}

export function objectById(scene: Scene, id: string): SlideObject | undefined {
  return scene.find((object) => object.id === id);
}

/** The objects a selection can hold, in document order. */
export function selectableIds(scene: Scene): string[] {
  return scene.filter((object) => !isGround(object)).map((object) => object.id);
}

// ---------------------------------------------------------------------------------------------
// Boxes

/** A rotation brought into 0 up to 360 (schema position.ts normalizeRotation). */
export function normalizeRotation(degrees: number): number {
  const wrapped = degrees % 360;
  const positive = wrapped < 0 ? wrapped + 360 : wrapped;
  return positive === 360 || Object.is(positive, -0) ? 0 : positive;
}

/** The axis aligned box of a turned position: its four corners turned about the centre and spanned. */
export function boundingBox(pos: Pos): Box {
  const angle = normalizeRotation(pos.rotate ?? 0);
  if (angle === 0) return [pos.x, pos.y, pos.w, pos.h];
  const rad = (angle * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const w = pos.w * cos + pos.h * sin;
  const h = pos.w * sin + pos.h * cos;
  return [pos.x + pos.w / 2 - w / 2, pos.y + pos.h / 2 - h / 2, w, h];
}

function unionOf(boxes: readonly Box[]): Box {
  const x = Math.min(...boxes.map((b) => b[0]));
  const y = Math.min(...boxes.map((b) => b[1]));
  const right = Math.max(...boxes.map((b) => b[0] + b[2]));
  const bottom = Math.max(...boxes.map((b) => b[1] + b[3]));
  return [x, y, right - x, bottom - y];
}

/** The union of the bounding boxes of several positions. */
export function unionBox(positions: readonly Pos[]): Box {
  return unionOf(positions.map(boundingBox));
}

/** A box and the turn it is drawn at, about its centre. */
export type Placed = { box: Box; rotate: number };

/** The selection ring of one object: its box, 10 px out for a text object, at its turn. */
export function ringOf(object: SlideObject): Placed {
  const { x, y, w, h } = object.pos;
  const d = TEXT_TYPES.has(object.type) ? RING_OUTSET : 0;
  return {
    box: [x - d, y - d, w + 2 * d, h + 2 * d],
    rotate: normalizeRotation(object.pos.rotate ?? 0),
  };
}

/** An object's own box at its turn. */
export function placeOf(object: SlideObject): Placed {
  const { x, y, w, h } = object.pos;
  return { box: [x, y, w, h], rotate: normalizeRotation(object.pos.rotate ?? 0) };
}

/**
 * The frame the handles sit on (viewer Gestures.tsx canvasHandles): one object's ring at its
 * turn, or the unturned union of several objects' bounding boxes.
 */
export function frameOf(scene: Scene, ids: readonly string[]): Placed | null {
  const objects = ids.flatMap((id) => objectById(scene, id) ?? []);
  const [only] = objects;
  if (only === undefined) return null;
  if (objects.length === 1) return ringOf(only);
  return { box: unionBox(objects.map((object) => object.pos)), rotate: 0 };
}

/** Each object's paint rank: z ascending, document order breaking ties (schema sortByZ). */
export function paintRanks(scene: Scene): Map<string, number> {
  const order = scene
    .map((object, index) => ({ object, index }))
    .sort((a, b) => (a.object.pos.z ?? 0) - (b.object.pos.z ?? 0) || a.index - b.index);
  return new Map(order.map(({ object }, rank) => [object.id, rank]));
}

// ---------------------------------------------------------------------------------------------
// Snap lines (viewer snap.ts)

export type Axis = 'x' | 'y';
export type LineKind =
  'rail' | 'content' | 'seam' | 'plate' | 'edge' | 'center' | 'sheet' | 'spacing';
/** A vertical (`x`) or horizontal (`y`) line at `at`, spanning `from` to `to` along itself. */
export type Line = { axis: Axis; at: number; kind: LineKind; from: number; to: number };

/** The content box (schema render.ts CONTENT_BOX). */
const CONTENT: Box = [137, 129, 1326, 642];

/**
 * The slide's guides (schema freeform.ts GUIDES): the rails, the content box's edges and centres,
 * the column seams of 4/8, 5/7 and 1/1 and the three plate edges, sorted.
 */
const GUIDE_X: ReadonlyArray<readonly [number, LineKind]> = [
  [56, 'rail'],
  [137, 'content'],
  [555, 'seam'],
  [627, 'seam'],
  [659.5, 'seam'],
  [731.5, 'seam'],
  [764, 'seam'],
  [800, 'content'],
  [836, 'seam'],
  [857, 'plate'],
  [877, 'plate'],
  [903, 'plate'],
  [1463, 'content'],
  [1544, 'rail'],
];
const GUIDE_Y: ReadonlyArray<readonly [number, LineKind]> = [
  [56, 'rail'],
  [129, 'content'],
  [450, 'content'],
  [771, 'content'],
  [844, 'rail'],
];

/**
 * The slide's own snap lines, in the editor's order (Editor.tsx freeContextFor): the sheet's edges
 * and centre (sheetEdgeLines), then the guides, a rail spanning the sheet and every other line
 * the content box (sheetSnapLines).
 */
export const SHEET_LINES: readonly Line[] = [
  ...[0, SHEET_W / 2, SHEET_W].map((at): Line => ({
    axis: 'x',
    at,
    kind: 'sheet',
    from: 0,
    to: SHEET_H,
  })),
  ...[0, SHEET_H / 2, SHEET_H].map((at): Line => ({
    axis: 'y',
    at,
    kind: 'sheet',
    from: 0,
    to: SHEET_W,
  })),
  ...GUIDE_X.map(([at, kind]): Line => {
    const full = kind === 'rail';
    return {
      axis: 'x',
      at,
      kind,
      from: full ? 0 : CONTENT[1],
      to: full ? SHEET_H : CONTENT[1] + CONTENT[3],
    };
  }),
  ...GUIDE_Y.map(([at, kind]): Line => {
    const full = kind === 'rail';
    return {
      axis: 'y',
      at,
      kind,
      from: full ? 0 : CONTENT[0],
      to: full ? SHEET_W : CONTENT[0] + CONTENT[2],
    };
  }),
];

/** The six snap lines of a box: its left, centre and right, its top, middle and bottom. */
export function boxLines(box: Box): Line[] {
  const [x, y, w, h] = box;
  return [
    { axis: 'x', at: x, kind: 'edge', from: y, to: y + h },
    { axis: 'x', at: x + w / 2, kind: 'center', from: y, to: y + h },
    { axis: 'x', at: x + w, kind: 'edge', from: y, to: y + h },
    { axis: 'y', at: y, kind: 'edge', from: x, to: x + w },
    { axis: 'y', at: y + h / 2, kind: 'center', from: x, to: x + w },
    { axis: 'y', at: y + h, kind: 'edge', from: x, to: x + w },
  ];
}

/** What a gesture on `ids` snaps to: the sheet's lines and the other objects' lines and boxes. */
export type SnapContext = { lines: Line[]; spacing: Box[] };

export function snapContext(scene: Scene, ids: readonly string[]): SnapContext {
  const lines = [...SHEET_LINES];
  const spacing: Box[] = [];
  for (const object of scene) {
    if (ids.includes(object.id)) continue;
    const box = boundingBox(object.pos);
    lines.push(...boxLines(box));
    spacing.push(box);
  }
  return { lines, spacing };
}

/** Shift keeps a move on the axis of the larger delta. */
export function axisLock(dx: number, dy: number): { dx: number; dy: number } {
  return Math.abs(dx) >= Math.abs(dy) ? { dx, dy: 0 } : { dx: 0, dy };
}

type AxisSnap = { delta: number; line: Line | null };

function isSheetCentre(line: Line): boolean {
  return line.kind === 'sheet' && line.at === (line.axis === 'x' ? SHEET_W : SHEET_H) / 2;
}

/**
 * The smallest correction within SNAP_PX that puts one of `positions` on a line, the earlier line
 * on a tie; the sheet's centre line outranks every other line in reach. Nothing in reach leaves
 * the value as it is: the editor's grid is off unless Snap to > Grid is on.
 */
function snapAxis(positions: readonly number[], lines: readonly Line[], axis: Axis): AxisSnap {
  let best: AxisSnap | null = null;
  let centre: AxisSnap | null = null;
  for (const line of lines) {
    if (line.axis !== axis) continue;
    for (const at of positions) {
      const delta = line.at - at;
      if (Math.abs(delta) > SNAP_PX) continue;
      if (best === null || Math.abs(delta) < Math.abs(best.delta)) best = { delta, line };
      if (isSheetCentre(line) && (centre === null || Math.abs(delta) < Math.abs(centre.delta)))
        centre = { delta, line };
    }
  }
  return centre ?? best ?? { delta: 0, line: null };
}

/** A guide spanning its line's extent and the snapped box's, so it reaches both. */
function guideFor(line: Line, box: Box): Line {
  const [x, y, w, h] = box;
  const lo = line.axis === 'x' ? y : x;
  const hi = line.axis === 'x' ? y + h : x + w;
  return { ...line, from: Math.min(line.from, lo), to: Math.max(line.to, hi) };
}

type SpacingSnap = { delta: number; guides: Line[] };

/**
 * The equal spacing snap on one axis: where the moving box's gap to a resting box equals the gap
 * between two resting boxes beside it, or sits midway between two; the guides are the ticks that
 * bound the two equal gaps.
 */
function spacingAxis(moving: Box, others: readonly Box[], axis: Axis): SpacingSnap | null {
  const main = axis === 'x' ? 0 : 1;
  const cross = axis === 'x' ? 1 : 0;
  const size = axis === 'x' ? 2 : 3;
  const crossSize = axis === 'x' ? 3 : 2;
  const rows = others
    .filter(
      (b) =>
        b[cross] < moving[cross] + moving[crossSize] && b[cross] + b[crossSize] > moving[cross],
    )
    .sort((a, b) => a[main] - b[main]);
  let best: (SpacingSnap & { distance: number }) | null = null;
  const tick = (at: number): Line => ({
    axis,
    at,
    kind: 'spacing',
    from: moving[cross],
    to: moving[cross] + moving[crossSize],
  });
  const consider = (start: number, ticks: number[]): void => {
    const delta = start - moving[main];
    if (Math.abs(delta) > SNAP_PX) return;
    if (best !== null && Math.abs(delta) >= best.distance) return;
    const unique = ticks.filter((at, index) => ticks.indexOf(at) === index);
    best = { delta, distance: Math.abs(delta), guides: unique.map(tick) };
  };
  const length = moving[size];
  for (let i = 0; i < rows.length - 1; i += 1) {
    const a = rows[i];
    const b = rows[i + 1];
    if (a === undefined || b === undefined) continue;
    const aEnd = a[main] + a[size];
    const bEnd = b[main] + b[size];
    const gap = b[main] - aEnd;
    if (gap <= 0) continue;
    consider(bEnd + gap, [aEnd, b[main], bEnd, bEnd + gap]);
    consider(a[main] - gap - length, [a[main] - gap, a[main], aEnd, b[main]]);
  }
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const a = rows[i];
      const b = rows[j];
      if (a === undefined || b === undefined) continue;
      const aEnd = a[main] + a[size];
      const room = b[main] - aEnd - length;
      if (room <= 0) continue;
      const gap = room / 2;
      consider(aEnd + gap, [aEnd, aEnd + gap, aEnd + gap + length, b[main]]);
    }
  }
  return best;
}

export type Snapped = { box: [number, number, number, number]; guides: Line[] };

/**
 * A box moved by (dx, dy) and snapped: its left, centre and right against the vertical lines, its
 * top, middle and bottom against the horizontal ones, an equal spacing match where it is nearer,
 * rounded to whole slide px.
 */
export function snapMove(
  box: Box,
  dx: number,
  dy: number,
  lines: readonly Line[],
  spacing?: readonly Box[],
): Snapped {
  const [x0, y0, w, h] = box;
  const x = x0 + dx;
  const y = y0 + dy;
  let sx = snapAxis([x, x + w / 2, x + w], lines, 'x');
  let sy = snapAxis([y, y + h / 2, y + h], lines, 'y');
  const guides: Line[] = [];
  if (spacing !== undefined && spacing.length > 1) {
    const moved: Box = [x, y, w, h];
    const spx = spacingAxis(moved, spacing, 'x');
    if (spx !== null && (sx.line === null || Math.abs(spx.delta) < Math.abs(sx.delta))) {
      sx = { delta: spx.delta, line: null };
      guides.push(...spx.guides);
    }
    const spy = spacingAxis(moved, spacing, 'y');
    if (spy !== null && (sy.line === null || Math.abs(spy.delta) < Math.abs(sy.delta))) {
      sy = { delta: spy.delta, line: null };
      guides.push(...spy.guides);
    }
  }
  const snapped: [number, number, number, number] = [
    Math.round(x + sx.delta),
    Math.round(y + sy.delta),
    Math.round(w),
    Math.round(h),
  ];
  if (sx.line) guides.push(guideFor(sx.line, snapped));
  if (sy.line) guides.push(guideFor(sy.line, snapped));
  return { box: snapped, guides };
}

/** Guides on one axis at one place become one line spanning both (viewer Guides.tsx mergeGuides). */
export function mergeGuides(guides: readonly Line[]): Line[] {
  const out: Line[] = [];
  for (const guide of guides) {
    const same = out.find((g) => g.axis === guide.axis && Math.abs(g.at - guide.at) < 0.5);
    if (same) {
      same.from = Math.min(same.from, guide.from);
      same.to = Math.max(same.to, guide.to);
    } else out.push({ ...guide });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Resize (schema canvas.ts resizeBox, viewer snap.ts snapResize)

export type Dir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
/** The eight handles, clockwise from the top left (viewer snap.ts RESIZE_DIRS). */
export const DIRS: readonly Dir[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** A vector turned by `degrees` clockwise. */
function rotateVector(dx: number, dy: number, degrees: number): { dx: number; dy: number } {
  const angle = normalizeRotation(degrees);
  if (angle === 0) return { dx, dy };
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { dx: dx * cos - dy * sin, dy: dx * sin + dy * cos };
}

function round64(value: number): number {
  return Math.round(value * 64) / 64;
}

type XYWH = { x: number; y: number; w: number; h: number };
type EdgeSnap = { x: (edge: number) => number; y: (edge: number) => number };

/**
 * One resize by one handle: the dragged edge moves by the delta, turned into the object's own
 * axes, and the opposite edge holds on the slide; Shift keeps the ratio, the axis with the larger
 * relative change leading; Alt resizes about the centre; no side drops under MIN_SIZE. An
 * unturned box snaps its moving edges and lands on whole px; a turned one rounds to 1/64 px. None
 * of this slide's kinds locks its ratio without Shift (schema ASPECT_LOCKED_KINDS).
 */
export function resizeBox(
  dir: Dir,
  delta: { dx: number; dy: number },
  mods: { shift: boolean; alt: boolean },
  rotation: number,
  box: XYWH,
  snapEdge?: EdgeSnap,
): XYWH {
  const angle = normalizeRotation(rotation);
  const { dx, dy } = angle === 0 ? delta : rotateVector(delta.dx, delta.dy, -angle);
  const hasW = dir.includes('w');
  const hasE = dir.includes('e');
  const hasN = dir.includes('n');
  const hasS = dir.includes('s');
  const { x, y, w, h } = box;
  let left = x;
  let right = x + w;
  let top = y;
  let bottom = y + h;
  const movesX = (hasE || hasW) && dx !== 0;
  const movesY = (hasN || hasS) && dy !== 0;
  if (hasW) left += dx;
  if (hasE) right += dx;
  if (hasN) top += dy;
  if (hasS) bottom += dy;
  const aspect = mods.shift;
  const ratio = h > 0 ? w / h : 1;
  const leadX = !aspect
    ? movesX
    : movesX && movesY
      ? Math.abs(dx) / Math.max(1, w) >= Math.abs(dy) / Math.max(1, h)
      : movesX || ((hasE || hasW) && !movesY);
  const leadY = !aspect ? movesY : !leadX;
  const snap = angle === 0 ? snapEdge : undefined;
  if (leadX) {
    if (snap !== undefined) {
      if (hasW) left = snap.x(left);
      else if (hasE) right = snap.x(right);
    }
    if (right - left < MIN_SIZE) {
      if (hasW) left = right - MIN_SIZE;
      else right = left + MIN_SIZE;
    }
  }
  if (leadY) {
    if (snap !== undefined) {
      if (hasN) top = snap.y(top);
      else if (hasS) bottom = snap.y(bottom);
    }
    if (bottom - top < MIN_SIZE) {
      if (hasN) top = bottom - MIN_SIZE;
      else bottom = top + MIN_SIZE;
    }
  }
  if (aspect) {
    if (leadX) {
      const nextH = Math.max(MIN_SIZE, (right - left) / ratio);
      if (hasN) top = bottom - nextH;
      else bottom = top + nextH;
    } else {
      const nextW = Math.max(MIN_SIZE, (bottom - top) * ratio);
      if (hasW) left = right - nextW;
      else right = left + nextW;
    }
  }
  const cx = x + w / 2;
  const cy = y + h / 2;
  if (mods.alt) {
    const w2 = Math.max(MIN_SIZE, Math.round(w + 2 * (right - left - w)));
    const h2 = Math.max(MIN_SIZE, Math.round(h + 2 * (bottom - top - h)));
    return { x: round64(cx - w2 / 2), y: round64(cy - h2 / 2), w: w2, h: h2 };
  }
  const w2 = Math.max(MIN_SIZE, Math.round(right - left));
  const h2 = Math.max(MIN_SIZE, Math.round(bottom - top));
  const before = rotateVector(hasW ? w / 2 : -w / 2, hasN ? h / 2 : -h / 2, angle);
  const after = rotateVector(hasW ? w2 / 2 : -w2 / 2, hasN ? h2 / 2 : -h2 / 2, angle);
  const cx2 = cx + before.dx - after.dx;
  const cy2 = cy + before.dy - after.dy;
  return { x: round64(cx2 - w2 / 2), y: round64(cy2 - h2 / 2), w: w2, h: h2 };
}

/** A resize with the line snap on the moving edges of an unturned box. */
export function snapResize(
  box: Box,
  dir: Dir,
  dx: number,
  dy: number,
  lines: readonly Line[],
  options: { aspect: boolean; alt: boolean; rotation?: number },
): Snapped {
  const guides: Line[] = [];
  const edge = (axis: Axis) => (at: number) => {
    const s = snapAxis([at], lines, axis);
    if (s.line) guides.push(s.line);
    return at + s.delta;
  };
  const [x, y, w, h] = box;
  const out = resizeBox(
    dir,
    { dx, dy },
    { shift: options.aspect, alt: options.alt },
    options.rotation ?? 0,
    { x, y, w, h },
    { x: edge('x'), y: edge('y') },
  );
  const snapped: [number, number, number, number] = [out.x, out.y, out.w, out.h];
  return { box: snapped, guides: guides.map((line) => guideFor(line, snapped)) };
}

// ---------------------------------------------------------------------------------------------
// Turn (viewer rotate.ts, schema freeform.ts rotatePositions)

/** The angle of a point about a centre, clockwise from the top. */
export function angleAbout(centre: Point, point: Point): number {
  return normalizeRotation((Math.atan2(point.x - centre.x, -(point.y - centre.y)) * 180) / Math.PI);
}

/** The turn a drag of the handle stands for: whole degrees, Shift in 15 degree steps. */
export function rotationFromDrag(
  startAngle: number,
  centre: Point,
  from: Point,
  to: Point,
  shift: boolean,
): number {
  const swept = angleAbout(centre, to) - angleAbout(centre, from);
  const raw = startAngle + swept;
  return normalizeRotation(shift ? Math.round(raw / TURN_STEP) * TURN_STEP : Math.round(raw));
}

function withRotate(pos: Pos, degrees: number): Pos {
  const rotate = normalizeRotation(degrees);
  const next: Pos = { ...pos };
  if (rotate === 0) delete next.rotate;
  else next.rotate = rotate;
  return next;
}

/**
 * Positions turned by `by` degrees: each about its own centre, or about the centre of their union
 * (a group turn), each centre carried round it and written on the half px grid.
 */
export function rotatePositions(
  positions: readonly Pos[],
  by: number,
  about: 'each' | 'selection',
): Pos[] {
  const [ux, uy, uw, uh] = unionBox(positions);
  const cx = ux + uw / 2;
  const cy = uy + uh / 2;
  return positions.map((p) => {
    const next = withRotate(p, (p.rotate ?? 0) + by);
    if (about === 'selection' && positions.length > 1) {
      const rad = (by * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const dx = p.x + p.w / 2 - cx;
      const dy = p.y + p.h / 2 - cy;
      next.x = Math.round((cx + dx * cos - dy * sin - p.w / 2) * 2) / 2;
      next.y = Math.round((cy + dx * sin + dy * cos - p.h / 2) * 2) / 2;
    }
    return next;
  });
}

/** Positions scaled with their union into `to`, about the union's corner, on the half px grid. */
export function scalePositions(positions: readonly Pos[], to: Box): Pos[] {
  const [ux, uy, uw, uh] = unionBox(positions);
  const [tx, ty, tw, th] = to;
  const kx = uw > 0 ? tw / uw : 1;
  const ky = uh > 0 ? th / uh : 1;
  const half = (v: number): number => Math.round(v * 2) / 2;
  return positions.map((p) => ({
    ...p,
    x: half(tx + (p.x - ux) * kx),
    y: half(ty + (p.y - uy) * ky),
    w: Math.max(1, half(Math.max(1, p.w * kx))),
    h: Math.max(1, half(Math.max(1, p.h * ky))),
  }));
}

// ---------------------------------------------------------------------------------------------
// Mutations, the action call and the undo record

/** The writes this screen makes, as packages/schema mutations.ts spells them (the slide id is SLIDE_ID). */
export type Mutation =
  | { op: 'block.set'; blockId: string; path: '/pos'; value: Pos }
  | { op: 'block.set'; blockId: string; path: '/pos/z'; value: number }
  | { op: 'block.remove'; blockId: string }
  | { op: 'block.insert'; after?: string; block: SlideObject };

export type OrderMove = 'front' | 'back' | 'forward' | 'backward';

/**
 * The action call the editor sends: one mutation is its own action and several travel as one
 * `slide.update` (viewer Gestures.tsx actionForMutations); Cmd D and the order keys send their
 * own actions (editor-shell.ts, Editor.tsx).
 */
export type Call =
  | { id: 'block.set' | 'block.remove' | 'block.insert'; mutation: Mutation }
  | { id: 'slide.update'; mutations: readonly Mutation[] }
  | { id: 'block.duplicate'; blockIds: readonly string[] }
  | { id: 'block.order'; blockId: string; move: OrderMove };

export function callFor(mutations: readonly Mutation[]): Call {
  const [first, ...rest] = mutations;
  if (first === undefined) throw new RangeError('callFor: no mutations');
  if (rest.length > 0) return { id: 'slide.update', mutations };
  return { id: first.op, mutation: first };
}

/** A position with its keys in the schema's order: x, y, w, h, z, rotate. */
function canonical(pos: Pos): Pos {
  return {
    x: pos.x,
    y: pos.y,
    w: pos.w,
    h: pos.h,
    ...(pos.z === undefined ? {} : { z: pos.z }),
    ...(pos.rotate === undefined ? {} : { rotate: pos.rotate }),
  };
}

/** A block as the document holds it: its id, its pos, its type, its other fields. */
export function blockJson(object: SlideObject): Record<string, unknown> {
  return { id: object.id, pos: canonical(object.pos), type: object.type, ...object.fields };
}

function mutationInput(m: Mutation): Record<string, unknown> {
  switch (m.op) {
    case 'block.set':
      return {
        op: m.op,
        slideId: SLIDE_ID,
        blockId: m.blockId,
        path: m.path,
        value: m.path === '/pos' ? canonical(m.value) : m.value,
      };
    case 'block.remove':
      return { op: m.op, slideId: SLIDE_ID, blockId: m.blockId };
    case 'block.insert':
      return {
        op: m.op,
        slideId: SLIDE_ID,
        slot: 'main',
        ...(m.after === undefined ? {} : { after: m.after }),
        block: blockJson(m.block),
      };
  }
}

/** The call's action id and input as the editor sends them, without the base revision. */
export function callInput(call: Call): { id: string; input: Record<string, unknown> } {
  switch (call.id) {
    case 'slide.update':
      return {
        id: call.id,
        input: { slideId: SLIDE_ID, mutations: call.mutations.map(mutationInput) },
      };
    case 'block.duplicate':
      return { id: call.id, input: { slideId: SLIDE_ID, blockIds: [...call.blockIds] } };
    case 'block.order':
      return { id: call.id, input: { slideId: SLIDE_ID, blockId: call.blockId, move: call.move } };
    default: {
      const { op: _op, ...input } = mutationInput(call.mutation);
      return { id: call.id, input };
    }
  }
}

/** One printed line: the action and its target, then the value it writes. */
export type PrintLine = { op: string; value?: string; inner?: boolean };

function mutationLine(m: Mutation, target: string): PrintLine {
  switch (m.op) {
    case 'block.set':
      return {
        op: `block.set ${target}${m.blockId} ${m.path}`,
        value: JSON.stringify(m.path === '/pos' ? canonical(m.value) : m.value),
      };
    case 'block.remove':
      return { op: `block.remove ${target}${m.blockId}` };
    case 'block.insert':
      return {
        op: `block.insert ${target === '' ? '' : `${SLIDE_ID} `}--slot main${m.after === undefined ? '' : ` --after ${m.after}`}`,
        value: JSON.stringify(blockJson(m.block)),
      };
  }
}

/**
 * The call as the screen prints it, in the CLI's spelling with the action id for the command
 * (`turboslide block set <slideId>#<blockId> <path> <value>` prints as `block.set lighthouse#h
 * /pos {...}`); a `slide.update` prints its mutations one per line under it.
 */
export function printCall(call: Call): PrintLine[] {
  switch (call.id) {
    case 'slide.update':
      return [
        { op: `slide.update ${SLIDE_ID}` },
        ...call.mutations.map((m) => ({ ...mutationLine(m, ''), inner: true })),
      ];
    case 'block.duplicate':
      return [{ op: `block.duplicate ${SLIDE_ID} --blocks ${call.blockIds.join(',')}` }];
    case 'block.order':
      return [{ op: `block.order ${SLIDE_ID}#${call.blockId} --move ${call.move}` }];
    default:
      return [mutationLine(call.mutation, `${SLIDE_ID}#`)];
  }
}

/** The scene after the mutations, and the mutations that put it back, in the order they run. */
export function applyMutations(
  scene: Scene,
  mutations: readonly Mutation[],
): { scene: Scene; inverse: Mutation[] } {
  let next = [...scene];
  const inverse: Mutation[] = [];
  for (const m of mutations) {
    const index = next.findIndex(
      (object) => object.id === ('blockId' in m ? m.blockId : m.block.id),
    );
    const current = next[index];
    if (m.op === 'block.insert') {
      if (current !== undefined) continue;
      const at = m.after === undefined ? 0 : next.findIndex((object) => object.id === m.after) + 1;
      next.splice(at, 0, m.block);
      inverse.unshift({ op: 'block.remove', blockId: m.block.id });
      continue;
    }
    if (current === undefined) continue;
    if (m.op === 'block.remove') {
      const after = next[index - 1]?.id;
      next = next.filter((object) => object.id !== m.blockId);
      inverse.unshift({
        op: 'block.insert',
        ...(after === undefined ? {} : { after }),
        block: current,
      });
    } else if (m.path === '/pos') {
      next[index] = { ...current, pos: m.value };
      inverse.unshift({ op: 'block.set', blockId: m.blockId, path: '/pos', value: current.pos });
    } else {
      next[index] = { ...current, pos: { ...current.pos, z: m.value } };
      inverse.unshift(
        current.pos.z === undefined
          ? { op: 'block.set', blockId: m.blockId, path: '/pos', value: current.pos }
          : { op: 'block.set', blockId: m.blockId, path: '/pos/z', value: current.pos.z },
      );
    }
  }
  return { scene: next, inverse };
}

/** One step of the undo record: the write and its inverse. */
export type Entry = { mutations: readonly Mutation[]; inverse: readonly Mutation[] };
/** The undo record keeps this many steps. */
export const HISTORY_DEPTH = 100;

/** Everything the screen draws: the slide, the selection, the last call and the undo record. */
export type CanvasState = {
  scene: Scene;
  selected: readonly string[];
  call: Call;
  past: readonly Entry[];
  future: readonly Entry[];
  /** counts the writes, undos and redos, so the printed call is drawn afresh after each */
  seq: number;
};

function posSet(blockId: string, value: Pos): Mutation {
  return { op: 'block.set', blockId, path: '/pos', value };
}

/** The screen at load: the heading selected and the line under the slide its `/pos`. */
export const INITIAL: CanvasState = {
  scene: LIGHTHOUSE,
  selected: ['h'],
  call: callFor([posSet('h', (objectById(LIGHTHOUSE, 'h') as SlideObject).pos)]),
  past: [],
  future: [],
  seq: 0,
};

function existing(scene: Scene, ids: readonly string[]): string[] {
  return ids.filter((id) => objectById(scene, id) !== undefined);
}

/** A write: the mutations applied, recorded for Undo, and the call printed. */
export function write(
  state: CanvasState,
  mutations: readonly Mutation[],
  call?: Call,
  selected: readonly string[] = state.selected,
): CanvasState {
  if (mutations.length === 0) return state;
  const { scene, inverse } = applyMutations(state.scene, mutations);
  return {
    scene,
    selected: existing(scene, selected),
    call: call ?? callFor(mutations),
    past: [...state.past, { mutations, inverse }].slice(-HISTORY_DEPTH),
    future: [],
    seq: state.seq + 1,
  };
}

/** Undo writes the inverse forward, as the editor does, and prints that write. */
export function undo(state: CanvasState): CanvasState {
  const entry = state.past[state.past.length - 1];
  if (entry === undefined) return state;
  const { scene } = applyMutations(state.scene, entry.inverse);
  return {
    scene,
    selected: existing(scene, state.selected),
    call: callFor(entry.inverse),
    past: state.past.slice(0, -1),
    future: [...state.future, entry],
    seq: state.seq + 1,
  };
}

/** Redo writes the mutations again and prints them. */
export function redo(state: CanvasState): CanvasState {
  const entry = state.future[state.future.length - 1];
  if (entry === undefined) return state;
  const { scene } = applyMutations(state.scene, entry.mutations);
  return {
    scene,
    selected: existing(scene, state.selected),
    call: callFor(entry.mutations),
    past: [...state.past, entry],
    future: state.future.slice(0, -1),
    seq: state.seq + 1,
  };
}

// ---------------------------------------------------------------------------------------------
// Gestures (viewer Gestures.tsx freeGesture) and keys

export type Mods = { shift: boolean; alt?: boolean; meta?: boolean };
export type Gesture = { mutations: Mutation[]; guides: Line[] };

function rowsOf(scene: Scene, ids: readonly string[]): { id: string; pos: Pos }[] {
  return ids.flatMap((id) => {
    const object = objectById(scene, id);
    return object === undefined || isGround(object) ? [] : [{ id, pos: object.pos }];
  });
}

function samePos(a: Pos, b: Pos): boolean {
  return (
    a.x === b.x &&
    a.y === b.y &&
    a.w === b.w &&
    a.h === b.h &&
    (a.z ?? 0) === (b.z ?? 0) &&
    (a.rotate ?? 0) === (b.rotate ?? 0)
  );
}

function changed(rows: readonly { id: string; pos: Pos }[], next: readonly Pos[]): Mutation[] {
  return rows.flatMap((row, index) => {
    const pos = next[index];
    return pos === undefined || samePos(pos, row.pos) ? [] : [posSet(row.id, pos)];
  });
}

/**
 * A drag of the selection by (dx, dy) slide px: the union of its bounding boxes snaps and every
 * object moves by the same offset; Shift keeps one axis, Cmd skips the snaps. Null when nothing
 * moves.
 */
export function moveGesture(
  scene: Scene,
  ids: readonly string[],
  dx: number,
  dy: number,
  mods: Mods,
): Gesture | null {
  if (dx === 0 && dy === 0) return null;
  const rows = rowsOf(scene, ids);
  if (rows.length === 0) return null;
  const delta = mods.shift ? axisLock(dx, dy) : { dx, dy };
  const context = mods.meta === true ? null : snapContext(scene, ids);
  const union = unionBox(rows.map((row) => row.pos));
  const snapped = snapMove(union, delta.dx, delta.dy, context?.lines ?? [], context?.spacing);
  const sdx = round64(snapped.box[0] - union[0]);
  const sdy = round64(snapped.box[1] - union[1]);
  if (sdx === 0 && sdy === 0) return null;
  return {
    mutations: rows.map(({ id, pos }) => posSet(id, { ...pos, x: pos.x + sdx, y: pos.y + sdy })),
    guides: snapped.guides,
  };
}

/**
 * A drag of one of the eight handles: one object resizes along its own axes, several scale with
 * their union; Shift keeps the ratio, Alt resizes about the centre, Cmd skips the snaps.
 */
export function resizeGesture(
  scene: Scene,
  ids: readonly string[],
  dir: Dir,
  dx: number,
  dy: number,
  mods: Mods,
): Gesture | null {
  if (dx === 0 && dy === 0) return null;
  const rows = rowsOf(scene, ids);
  const [anchor] = rows;
  if (anchor === undefined) return null;
  const lines = mods.meta === true ? [] : snapContext(scene, ids).lines;
  const options = { aspect: mods.shift, alt: mods.alt === true };
  if (rows.length > 1) {
    const union = unionBox(rows.map((row) => row.pos));
    const snapped = snapResize(union, dir, dx, dy, lines, options);
    const mutations = changed(
      rows,
      scalePositions(
        rows.map((row) => row.pos),
        snapped.box,
      ),
    );
    return mutations.length === 0 ? null : { mutations, guides: snapped.guides };
  }
  const { x: ax, y: ay, w: aw, h: ah } = anchor.pos;
  const snapped = snapResize([ax, ay, aw, ah], dir, dx, dy, lines, {
    ...options,
    rotation: normalizeRotation(anchor.pos.rotate ?? 0),
  });
  const [x, y, w, h] = snapped.box;
  if (x === ax && y === ay && w === aw && h === ah) return null;
  return { mutations: [posSet(anchor.id, { ...anchor.pos, x, y, w, h })], guides: snapped.guides };
}

/**
 * A drag of the turn handle from `from` to `to` (slide px): one object turns about its centre to
 * whole degrees, several turn about their union's centre; Shift steps 15 degrees.
 */
export function turnGesture(
  scene: Scene,
  ids: readonly string[],
  from: Point,
  to: Point,
  mods: Mods,
): Gesture | null {
  if (from.x === to.x && from.y === to.y) return null;
  const rows = rowsOf(scene, ids);
  const [anchor] = rows;
  if (anchor === undefined) return null;
  const positions = rows.map((row) => row.pos);
  const [ux, uy, uw, uh] = unionBox(positions);
  const centre = { x: ux + uw / 2, y: uy + uh / 2 };
  const start = rows.length === 1 ? normalizeRotation(anchor.pos.rotate ?? 0) : 0;
  const angle = rotationFromDrag(start, centre, from, to, mods.shift);
  const next =
    rows.length === 1
      ? [withRotate(anchor.pos, angle)]
      : rotatePositions(positions, angle, 'selection');
  const mutations = changed(rows, next);
  return mutations.length === 0 ? null : { mutations, guides: [] };
}

/** The arrows: the selection moves 1 px, 10 px with Shift, without a snap. */
export function nudge(scene: Scene, ids: readonly string[], dx: number, dy: number): Mutation[] {
  if (dx === 0 && dy === 0) return [];
  return rowsOf(scene, ids).map(({ id, pos }) =>
    posSet(id, { ...pos, x: pos.x + dx, y: pos.y + dy }),
  );
}

/** The turn handle's arrows: the selection turns by `by` degrees, several about their union. */
export function turnBy(scene: Scene, ids: readonly string[], by: number): Mutation[] {
  const rows = rowsOf(scene, ids);
  return changed(
    rows,
    rotatePositions(
      rows.map((row) => row.pos),
      by,
      'selection',
    ),
  );
}

/** Home on the turn handle: every selected object back to no turn. */
export function turnHome(scene: Scene, ids: readonly string[]): Mutation[] {
  const rows = rowsOf(scene, ids);
  return changed(
    rows,
    rows.map((row) => withRotate(row.pos, 0)),
  );
}

/** Delete: one `block.remove` per selected object. */
export function removeAll(scene: Scene, ids: readonly string[]): Mutation[] {
  return rowsOf(scene, ids).map(({ id }): Mutation => ({ op: 'block.remove', blockId: id }));
}

/** The first free id from `base`: `h-2`, then `h-2-2` (viewer clipboard.ts freeId). */
function freeId(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

/**
 * Cmd D (store-actions.ts blockDuplicate): each copy takes `<id>-2`, sits 16 px right and down on
 * top of the stack, right after its original. The call is `block.duplicate`; the write is the
 * inserts, and Undo removes the copies.
 */
export function duplicate(
  scene: Scene,
  ids: readonly string[],
): { call: Call; mutations: Mutation[]; copies: string[] } {
  const rows = rowsOf(scene, ids);
  const taken = new Set(scene.map((object) => object.id));
  let z = Math.max(0, ...scene.map((object) => object.pos.z ?? 0));
  const mutations: Mutation[] = [];
  const copies: string[] = [];
  for (const { id } of rows) {
    const source = objectById(scene, id) as SlideObject;
    const copyId = freeId(`${id}-2`, taken);
    taken.add(copyId);
    z += 1;
    const pos = {
      ...source.pos,
      x: source.pos.x + DUPLICATE_OFFSET,
      y: source.pos.y + DUPLICATE_OFFSET,
      z,
    };
    mutations.push({ op: 'block.insert', after: id, block: { ...source, id: copyId, pos } });
    copies.push(copyId);
  }
  return {
    call: { id: 'block.duplicate', blockIds: rows.map((row) => row.id) },
    mutations,
    copies,
  };
}

/**
 * One move through the stack (schema reorderZ, viewer Freeform.tsx zOrderMutations): the stack is
 * renumbered 0 up in paint order and every object whose z changes gets one `block.set /pos/z`.
 */
export function order(scene: Scene, id: string, move: OrderMove): Mutation[] {
  const ranks = paintRanks(scene);
  const stack = [...scene]
    .sort((a, b) => (ranks.get(a.id) ?? 0) - (ranks.get(b.id) ?? 0))
    .map((o) => o.id);
  const from = stack.indexOf(id);
  if (from < 0) return [];
  stack.splice(from, 1);
  const to =
    move === 'front'
      ? stack.length
      : move === 'back'
        ? 0
        : move === 'forward'
          ? Math.min(stack.length, from + 1)
          : Math.max(0, from - 1);
  stack.splice(to, 0, id);
  return scene.flatMap((object): Mutation[] => {
    const z = stack.indexOf(object.id);
    return z === object.pos.z
      ? []
      : [{ op: 'block.set', blockId: object.id, path: '/pos/z', value: z }];
  });
}

/** The rectangle between the press and the pointer. */
export function marqueeBox(start: Point, now: Point): Box {
  return [
    Math.min(start.x, now.x),
    Math.min(start.y, now.y),
    Math.abs(now.x - start.x),
    Math.abs(now.y - start.y),
  ];
}

/** The objects whose bounding boxes a marquee crosses, in document order. */
export function marqueeHits(scene: Scene, box: Box): string[] {
  if (box[2] <= 0 && box[3] <= 0) return [];
  return scene
    .filter((object) => {
      if (isGround(object)) return false;
      const b = boundingBox(object.pos);
      return (
        box[0] < b[0] + b[2] &&
        box[0] + box[2] > b[0] &&
        box[1] < b[1] + b[3] &&
        box[1] + box[3] > b[1]
      );
    })
    .map((object) => object.id);
}
