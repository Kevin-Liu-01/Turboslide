// The rotation math of the canvas (gslides-parity SPEC-2 6.1 rows 11 and 12, 6.2, 0.102): the
// angle of a pointer about a box centre as Google reads it (0 at the top, clockwise), the angle a
// drag of the rotation handle stands for with the 15 degree snap under Shift, and the `pos`
// writes of a rotation or a flip over the schema's arithmetic (rotatePositions, flipPositions), so
// the handle, Option+Left and Right, Arrange > Rotate and the CLI's block.rotate land the same
// numbers. Pure over sheet pixels; rotate.test.ts pins it.
import { rotateVector } from '@turboslide/schema/canvas';
import type { Slide } from '@turboslide/schema/deck';
import { flipPositions, rotatePositions } from '@turboslide/schema/freeform';
import type { Mutation } from '@turboslide/schema/mutations';
import type { Position } from '@turboslide/schema/position';
import { normalizeRotation } from '@turboslide/schema/position';

import type { Point } from './Gestures';

/** Shift snaps the rotation to multiples of this many degrees (R05 C5). */
export const ROTATE_SNAP_DEG = 15;
/** Option+Left and Option+Right rotate by this many degrees; with Shift by one (R04 B7). */
export const ROTATE_KEY_DEG = 15;
export const ROTATE_KEY_FINE_DEG = 1;
/** The rotation handle sits this many CSS pixels above the ring's top centre (R02 section 6). */
export const ROTATE_HANDLE_GAP_PX = 24;
/** The rotation handle's ring diameter in CSS pixels. */
export const ROTATE_HANDLE_PX = 12;
/** How long the angle chip stays up after a rotate key (SPEC-2 6.1 row 12). */
export const ROTATE_READOUT_MS = 600;

/** The centre of a position box. */
export function centreOf(pos: Pick<Position, 'x' | 'y' | 'w' | 'h'>): Point {
  return { x: pos.x + pos.w / 2, y: pos.y + pos.h / 2 };
}

/**
 * The angle of a point about a centre in degrees clockwise from the top (the handle's rest
 * position), in [0, 360).
 */
export function angleAbout(centre: Point, point: Point): number {
  const degrees = (Math.atan2(point.x - centre.x, -(point.y - centre.y)) * 180) / Math.PI;
  return normalizeRotation(degrees);
}

/** An angle snapped to the nearest multiple of `step`, normalized. */
export function snapAngle(degrees: number, step: number = ROTATE_SNAP_DEG): number {
  return normalizeRotation(Math.round(degrees / step) * step);
}

/**
 * The rotation a handle drag stands for: the object's angle when the drag began plus the angle
 * the pointer swept about the box centre; Shift snaps the result to 15 degree steps. Rounded to
 * whole degrees without Shift, so the write is a readable number.
 */
export function rotationFromDrag(
  startAngle: number,
  centre: Point,
  from: Point,
  to: Point,
  options: { shift?: boolean } = {},
): number {
  const swept = angleAbout(centre, to) - angleAbout(centre, from);
  const raw = startAngle + swept;
  if (options.shift === true) return snapAngle(raw);
  return normalizeRotation(Math.round(raw));
}

/** The angle a rotate key steps by: 15 degrees, 1 with Shift; Left is counter clockwise. */
export function rotateKeyDelta(direction: 'left' | 'right', shift: boolean): number {
  const step = shift ? ROTATE_KEY_FINE_DEG : ROTATE_KEY_DEG;
  return direction === 'left' ? -step : step;
}

function posSet(slide: Slide, blockId: string, pos: Position): Mutation {
  return { op: 'block.set', slideId: slide.id, blockId, path: '/pos', value: pos };
}

function samePos(a: Position, b: Position): boolean {
  return (
    a.x === b.x &&
    a.y === b.y &&
    a.w === b.w &&
    a.h === b.h &&
    (a.z ?? 0) === (b.z ?? 0) &&
    (a.rotate ?? 0) === (b.rotate ?? 0) &&
    (a.flip ?? null) === (b.flip ?? null) &&
    (a.group ?? null) === (b.group ?? null)
  );
}

/**
 * The `block.set /pos` mutations of a rotation over the named objects (what block.rotate writes):
 * `to` sets the angle, `by` adds to it; `about: 'selection'` moves the members around the union
 * centre, a group rotation (SPEC-2 6.2). Objects whose pos does not change get no mutation.
 */
export function rotateMutations(
  slide: Slide,
  rows: ReadonlyArray<{ id: string; pos: Position }>,
  change: { to: number } | { by: number },
  about: 'each' | 'selection' = 'each',
): Mutation[] {
  if (rows.length === 0) return [];
  const positions = rows.map((row) => row.pos);
  const next =
    'by' in change
      ? rotatePositions(positions, change.by, about)
      : about === 'selection' && rows.length > 1
        ? rotatePositions(
            positions,
            change.to - normalizeRotation(positions[0]?.rotate ?? 0),
            'selection',
          )
        : positions.map((pos) => {
            const rotate = normalizeRotation(change.to);
            const out: Position = { ...pos };
            if (rotate === 0) delete out.rotate;
            else out.rotate = rotate;
            return out;
          });
  return rows.flatMap((row, index) => {
    const pos = next[index];
    return pos === undefined || samePos(pos, row.pos) ? [] : [posSet(slide, row.id, pos)];
  });
}

/** The `block.set /pos` mutations of a flip over the named objects (what block.flip writes, SPEC-2 0.102). */
export function flipMutations(
  slide: Slide,
  rows: ReadonlyArray<{ id: string; pos: Position }>,
  axis: 'h' | 'v',
  about: 'each' | 'selection' = 'each',
): Mutation[] {
  if (rows.length === 0) return [];
  const next = flipPositions(
    rows.map((row) => row.pos),
    axis,
    about,
  );
  return rows.flatMap((row, index) => {
    const pos = next[index];
    return pos === undefined || samePos(pos, row.pos) ? [] : [posSet(slide, row.id, pos)];
  });
}

/**
 * The four corners of a rotated position box in sheet pixels, top left first and clockwise, for
 * the overlay's rotated ring and the tests.
 */
export function rotatedCorners(pos: Position): Point[] {
  const c = centreOf(pos);
  const rad = (normalizeRotation(pos.rotate ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const corners: Point[] = [
    { x: pos.x, y: pos.y },
    { x: pos.x + pos.w, y: pos.y },
    { x: pos.x + pos.w, y: pos.y + pos.h },
    { x: pos.x, y: pos.y + pos.h },
  ];
  return corners.map(({ x, y }) => {
    const dx = x - c.x;
    const dy = y - c.y;
    return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
  });
}

/** The CSS transform of a rotated and flipped object (render/slide.ts writes the same for `.free`). */
export function objectTransform(pos: Position): string | undefined {
  const parts: string[] = [];
  const angle = normalizeRotation(pos.rotate ?? 0);
  if (angle !== 0) parts.push(`rotate(${angle}deg)`);
  if (pos.flip === 'h') parts.push('scale(-1, 1)');
  else if (pos.flip === 'v') parts.push('scale(1, -1)');
  else if (pos.flip === 'hv') parts.push('scale(-1, -1)');
  return parts.length === 0 ? undefined : parts.join(' ');
}

/**
 * A pointer delta in the object's own axes: a drag of a resize handle on a rotated object moves
 * the edge along the rotated axis, so the client delta is turned back by the angle (SPEC-2 6.2:
 * "the eight resize handles resize along the rotated axes").
 */
export function unrotateDelta(dx: number, dy: number, degrees: number): { dx: number; dy: number } {
  /* the schema's rotation arithmetic (canvas.ts rotateVector), so the resize model and this
     helper turn a vector the same way */
  return rotateVector(dx, dy, -normalizeRotation(degrees));
}
