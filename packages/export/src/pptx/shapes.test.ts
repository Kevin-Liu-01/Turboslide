// The fix round of the parity round two (docs/gslides-parity/build-2/b2.md): a curve travels as
// the sheet's Catmull-Rom cubics, its custom geometry box holds the control points, and an
// outlined shape is written drawn in by half its stroke.
import { describe, expect, it } from 'vitest';

import type { SceneRect, SceneSegment } from '../scene/types.ts';
import { catmullRomSegments, customGeometryPoints, outlineBox, segmentBox } from './shapes.ts';

const base = { blockId: 'path', color: 'rgb(7, 7, 7)', width: 1, heads: 'none' as const };

describe('a curve as cubic segments (SPEC-2 2.4.3)', () => {
  const open: SceneSegment = {
    ...base,
    kind: 'curve',
    from: [0, 0],
    to: [120, 0],
    points: [
      [0, 0],
      [60, 60],
      [120, 0],
    ],
  };

  it("builds the renderer's Catmull-Rom controls, a sixth of the neighbours' chord, ends repeated", () => {
    expect(catmullRomSegments(open.points ?? [], false)).toEqual([
      { from: [0, 0], c1: [10, 10], c2: [40, 60], to: [60, 60] },
      { from: [60, 60], c1: [80, 60], c2: [110, 10], to: [120, 0] },
    ]);
    const closed = catmullRomSegments(open.points ?? [], true);
    expect(closed).toHaveLength(3);
    expect(closed[2]?.to).toEqual([0, 0]);
    expect(catmullRomSegments([[0, 0]], false)).toEqual([]);
  });

  it('writes a moveTo and one cubic point per segment, in inches from the geometry box', () => {
    const box = segmentBox(open);
    expect(box).toEqual({ x: 0, y: 0, w: 120, h: 60 });
    const points = customGeometryPoints(open, box);
    expect(points).toHaveLength(3);
    expect(points[0]).toEqual({ x: 0, y: 0, moveTo: true });
    expect(points[1]).toEqual({
      x: 0.5,
      y: 0.5,
      curve: { type: 'cubic', x1: 10 / 120, y1: 10 / 120, x2: 40 / 120, y2: 0.5 },
    });
    expect(points[2]).toMatchObject({
      x: 1,
      y: 0,
      curve: { type: 'cubic', x1: 80 / 120, y1: 0.5 },
    });
  });

  it('keeps a polyline straight and closes a closed path', () => {
    const poly: SceneSegment = { ...open, kind: 'polyline', closed: true };
    const points = customGeometryPoints(poly, segmentBox(poly));
    expect(points).toEqual([
      { x: 0, y: 0, moveTo: true },
      { x: 0.5, y: 0.5 },
      { x: 1, y: 0 },
      { close: true },
    ]);
  });

  it('grows the geometry box to the control points so the bulge stays inside it', () => {
    // the fixture's closed curve at a tenth of its size: the first control point lies left of the
    // first point, at 10 + (20 - 60) / 6
    const closed: SceneSegment = {
      ...open,
      closed: true,
      fill: 'rgb(240, 240, 240)',
      points: [
        [10, 90],
        [20, 10],
        [70, 0],
        [100, 60],
        [60, 100],
      ],
    };
    const hull = segmentBox(closed);
    expect(hull.x).toBeCloseTo(10 - 40 / 6, 5);
    expect(hull.x).toBeLessThan(10);
    expect(hull.x + hull.w).toBeGreaterThanOrEqual(100);
    const points = customGeometryPoints(closed, hull);
    expect(points).toHaveLength(7);
    expect(points[6]).toEqual({ close: true });
    // every written coordinate lies inside the box
    for (const p of points) {
      if ('close' in p) continue;
      expect(p.x).toBeGreaterThanOrEqual(-1e-9);
      expect(p.y).toBeGreaterThanOrEqual(-1e-9);
      if ('curve' in p && p.curve.type === 'cubic') {
        expect(p.curve.x1).toBeGreaterThanOrEqual(-1e-9);
        expect(p.curve.x2).toBeGreaterThanOrEqual(-1e-9);
      }
    }
  });
});

describe('an outlined shape is written drawn in by half its stroke', () => {
  const rect: SceneRect = {
    box: [617, 540, 420, 180],
    fill: 'rgba(0, 0, 0, 0)',
    blockId: 'dashed',
    role: 'shape',
    shape: 'ellipse',
    line: { color: 'rgb(7, 7, 7)', width: 2 },
  };

  it('insets a shape or box by half the line width on every side', () => {
    expect(outlineBox(rect)).toEqual([618, 541, 418, 178]);
    expect(outlineBox({ ...rect, role: 'box', line: { color: 'rgb(7, 7, 7)', width: 1 } })).toEqual(
      [617.5, 540.5, 419, 179],
    );
  });

  it('leaves a shape with no outline, and the round one plates and panels, at their boxes', () => {
    expect(outlineBox({ ...rect, line: undefined })).toEqual(rect.box);
    expect(outlineBox({ ...rect, role: 'plate' })).toEqual(rect.box);
    expect(outlineBox({ ...rect, role: 'panel' })).toEqual(rect.box);
  });

  it('never insets past the middle of a thin box', () => {
    expect(outlineBox({ ...rect, box: [0, 0, 100, 1] })).toEqual([0.5, 0.5, 99, 0]);
  });
});
