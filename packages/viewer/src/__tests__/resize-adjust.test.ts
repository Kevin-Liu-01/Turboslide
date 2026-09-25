// The resize invariant of the vector round (docs/VECTOR.md 2.4, row shapes.geometry.resize-keeps-adjust):
// a resize of a preset shape that carries `adjust` writes `pos` alone, so the fractions of 100000
// hold and a star's inner radius scales with its box; the Format options fields are the one way
// an adjust value changes. Pins `freeGesture` as it stands; Gestures.tsx and Editor.tsx change
// nothing this round.
import { describe, expect, it } from 'vitest';

import type { Block } from '@turboslide/schema/blocks';
import type { ContentSlide, Slide } from '@turboslide/schema/deck';
import type { Position } from '@turboslide/schema/position';
import { applyMutations } from '@turboslide/schema/reduce';
import { shapeAdjustDefaults, shapeGeometry } from '@turboslide/schema/shapes';

import { freeGesture, handlesFor } from '../Gestures';
import type { Handle, MeasuredBoxes } from '../Gestures';

const starPos: Position = { x: 100, y: 100, w: 300, h: 300, z: 0 };
const adjust = [30000, 105146, 110557];
const star: Block = {
  id: 'star',
  type: 'shape',
  shape: 'star5',
  fill: 'plate',
  stroke: 'ink',
  text: '',
  adjust,
  pos: starPos,
} as Block;
const canvas: ContentSlide = {
  schemaVersion: 1,
  id: 'cv',
  kind: 'content',
  layout: { type: 'freeform' },
  slots: { main: [star] },
};
const boxes: MeasuredBoxes = {
  blocks: { star: [starPos.x, starPos.y, starPos.w, starPos.h] },
  slots: {},
  runs: {},
  parts: {},
};

function handle(kind: Handle['kind'], list: Handle[], dir?: string): Handle {
  const found = list.find((h) => h.kind === kind && (dir === undefined || h.dir === dir));
  if (!found) throw new Error(`no ${kind} handle`);
  return found;
}

/** The end point of every command of a path string, parsed by command letter (H and V included). */
function vertices(d: string): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  let x = 0;
  let y = 0;
  for (const match of d.matchAll(/([MLHVQCAZ])([^MLHVQCAZ]*)/g)) {
    const letter = match[1];
    const nums = (match[2]?.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    if (letter === 'Z') continue;
    if (letter === 'H') x = nums[0] ?? x;
    else if (letter === 'V') y = nums[0] ?? y;
    else {
      x = nums[nums.length - 2] ?? x;
      y = nums[nums.length - 1] ?? y;
    }
    out.push({ x, y });
  }
  return out;
}

/** The inner radius of a five point star over its outer radius, read from its path's first two vertices. */
function innerOverOuter(w: number, h: number, values: ReadonlyArray<number>): number {
  const points = vertices(shapeGeometry('star5', w, h, values).paths[0]?.d ?? '');
  const outer = points[0];
  const inner = points[1];
  if (outer === undefined || inner === undefined) throw new Error('no star vertices');
  /* the file's star is drawn about `svc`, the centre scaled by `vf`, on the ellipse of the
     scaled half sides; the ratio of the inner to the outer radius is `a / 50000` on that ellipse
     and reads the same on both axes */
  const cx = w / 2;
  const cy = (h / 2) * 1.10557;
  const rx = (w / 2) * 1.05146;
  const ry = (h / 2) * 1.10557;
  const radius = (p: { x: number; y: number }) => Math.hypot((p.x - cx) / rx, (p.y - cy) / ry);
  return radius(inner) / radius(outer);
}

describe('a resize keeps the adjust values (docs/VECTOR.md 2.4)', () => {
  it('writes pos alone from the south east handle and the fractions hold at the new size', () => {
    const list = handlesFor(canvas, boxes, { kind: 'block', blockId: 'star' });
    const se = handle('free-resize', list, 'se');
    const ctx = { slide: canvas as Slide, boxes, free: { ids: ['star'], lines: [], grid: false } };
    const drag = freeGesture(se, ctx, { x: 400, y: 400 }, { x: 700, y: 700 });
    expect(drag).not.toBeNull();
    expect(drag?.mutations).toHaveLength(1);
    const mutation = drag?.mutations[0];
    expect(mutation?.op).toBe('block.set');
    expect(mutation?.op === 'block.set' && mutation.path).toBe('/pos');
    expect(drag?.size).toEqual({ w: 600, h: 600 });
    const after = applyMutations(
      {
        schemaVersion: 1,
        id: 'deck',
        title: 'deck',
        slides: { cv: canvas },
        order: ['cv'],
      } as never,
      drag?.mutations ?? [],
    );
    const slide = after.document.slides['cv'] as ContentSlide;
    const resized = slide.slots.main?.find((block) => block.id === 'star');
    expect(resized?.type === 'shape' && resized.adjust).toEqual(adjust);
    expect(resized?.pos).toEqual({ ...starPos, w: 600, h: 600 });
    /* the file's guide is iwd2 = swd2 a / 50000, so adjust[0] 30000 puts the inner radius at
       60 percent of the outer, at both sizes, and the default 19098 at the pentagram's 38.2 */
    expect(innerOverOuter(300, 300, adjust)).toBeCloseTo(0.6, 2);
    expect(innerOverOuter(600, 600, adjust)).toBeCloseTo(0.6, 2);
    expect(innerOverOuter(300, 300, shapeAdjustDefaults('star5'))).toBeCloseTo(0.382, 2);
    expect(innerOverOuter(600, 600, shapeAdjustDefaults('star5'))).toBeCloseTo(0.382, 2);
  });
});
