// The shape interpreter (gslides-parity SPEC-5 6.5): every preset of shapes.ts has a definition in
// shapes/definitions.ts and answers an evaluated outline, a text rectangle and its connection
// sites at any box; the rectangle keeps the byte identical path string shapes.ts wrote before the
// interpreter; the path data writer handles every command kind the definitions use. Until day 6
// this file pinned the box stubs of the merge 1 seam; the fixer round of the verifier's finding 4
// moved it to the interpreter's geometry.
import { describe, expect, it } from 'vitest';

import {
  SHAPE_PRESET_IDS,
  shapeAdjustDefaults,
  shapePath as shapePathData,
  textInset as textInsetAt,
  sites as sitesAt,
} from '../shapes.ts';
import { PRESET_DEFINITIONS } from './definitions.ts';
import { boxPath, pathData, presetDefinition, shapePath, sites, textInset } from './geometry.ts';

/**
 * The callouts whose tail site sits past the box by construction (ECMA-376's `wedge*Callout` and
 * `cloudCallout` definitions place the tail's connection site at the wedge's point, outside the
 * shape's own frame), the one family whose sites may leave the box.
 */
const TAIL_OUTSIDE = new Set([
  'wedgeRectCallout',
  'wedgeRoundRectCallout',
  'wedgeEllipseCallout',
  'cloudCallout',
]);

describe('the shape interpreter', () => {
  const box = { x: 0, y: 0, w: 300, h: 220 };

  it('has a definition for every one of the 135 presets', () => {
    expect(SHAPE_PRESET_IDS).toHaveLength(135);
    for (const id of SHAPE_PRESET_IDS) expect(presetDefinition(id), id).toBeDefined();
    expect(Object.keys(PRESET_DEFINITIONS).length).toBeGreaterThanOrEqual(135);
  });

  it('answers an evaluated outline, a text rectangle inside the frame and at least one site for every preset', () => {
    // a rectangle the guides collapse answers the frame (the clip rule of textInset)
    expect(textInset('rect', { x: 0, y: 0, w: 0, h: 0 })).toEqual({ x: 0, y: 0, w: 0, h: 0 });
    for (const id of SHAPE_PRESET_IDS) {
      const path = shapePath(id, box, shapeAdjustDefaults(id));
      expect(path.length, id).toBeGreaterThanOrEqual(3);
      expect(path[0]?.op, id).toBe('moveTo');
      expect(
        path.some((command) => command.op === 'close'),
        id,
      ).toBe(true);
      const inset = textInset(id, box, shapeAdjustDefaults(id));
      expect(inset.w, id).toBeGreaterThan(0);
      expect(inset.h, id).toBeGreaterThan(0);
      expect(inset.x, id).toBeGreaterThanOrEqual(-0.01);
      expect(inset.y, id).toBeGreaterThanOrEqual(-0.01);
      expect(inset.x + inset.w, id).toBeLessThanOrEqual(box.w + 0.01);
      expect(inset.y + inset.h, id).toBeLessThanOrEqual(box.h + 0.01);
      const points = sites(id, box, shapeAdjustDefaults(id));
      expect(points.length, id).toBeGreaterThanOrEqual(1);
      if (!TAIL_OUTSIDE.has(id))
        for (const point of points) {
          expect(point.x, id).toBeGreaterThanOrEqual(-0.5);
          expect(point.y, id).toBeGreaterThanOrEqual(-0.5);
          expect(point.x, id).toBeLessThanOrEqual(box.w + 0.5);
          expect(point.y, id).toBeLessThanOrEqual(box.h + 0.5);
        }
    }
  });

  it('draws the rectangle as the box and every other preset as its own outline', () => {
    expect(shapePath('rect', box, [])).toEqual(boxPath(box));
    expect(shapePath('rectangle', box, [])).toEqual(boxPath(box));
    // flowChartProcess is a rectangle by definition; every other preset leaves the box path
    const boxShaped = SHAPE_PRESET_IDS.filter(
      (id) => pathData(shapePath(id, box, shapeAdjustDefaults(id))) === pathData(boxPath(box)),
    );
    expect(boxShaped.sort()).toEqual(['flowChartProcess', 'rect']);
  });

  it('writes the rectangle string shapes.ts wrote before the interpreter and the evaluated forms after it', () => {
    expect(pathData(boxPath(box))).toBe('M0,0 H300 V220 H0 Z');
    expect(shapePathData('rect', 300, 220)).toBe('M0,0 H300 V220 H0 Z');
    // the hexagon's outline on the half pixel grid: the two side points at a quarter of the width
    expect(shapePathData('hexagon', 48.25, 36.5)).toBe('M0,18.5 L9,0 H39 L48.5,18.5 L39,36.5 H9 Z');
    // the rounded rectangle's text rectangle: the corner radius (ss times adj 16667 over 100000)
    // times the standard's 29289 over 100000 in from every side
    const radius = 220 * 0.16667;
    const inset = radius * 0.29289;
    const rr = textInsetAt('roundRect', 300, 220);
    expect(rr.x).toBeCloseTo(inset, 3);
    expect(rr.y).toBeCloseTo(inset, 3);
    expect(rr.w).toBeCloseTo(300 - 2 * inset, 3);
    expect(rr.h).toBeCloseTo(220 - 2 * inset, 3);
    expect(sitesAt('rect', 300, 220)[0]).toEqual({ x: 150, y: 0, angle: 270 });
    // the rounded rectangle's own four sites are the box's first four, in the same order
    expect(sitesAt('roundRect', 300, 220)).toEqual(sitesAt('rect', 300, 220).slice(0, 4));
  });

  it('carries an offset box through the sites and the path', () => {
    const at = { x: 40, y: 20, w: 100, h: 50 };
    expect(pathData(boxPath(at))).toBe('M40,20 H140 V70 H40 Z');
    expect(sites('rect', at)[3]).toEqual({ x: 140, y: 45, angle: 0 });
    expect(sites('ellipse', at)[0]).toEqual({ x: 90, y: 20, angle: 270 });
    const outline = pathData(shapePath('ellipse', at));
    expect(outline.startsWith('M')).toBe(true);
    expect(outline).toContain('A');
  });

  it('writes lines, curves, arcs and closes', () => {
    expect(
      pathData([
        { op: 'moveTo', x: 0, y: 0 },
        { op: 'lnTo', x: 10, y: 10 },
        {
          op: 'quadBezTo',
          points: [
            [20, 0],
            [30, 10],
          ],
        },
        {
          op: 'cubicBezTo',
          points: [
            [40, 20],
            [50, 0],
            [60, 10],
          ],
        },
        { op: 'close' },
      ]),
    ).toBe('M0,0 L10,10 Q20,0 30,10 C40,20 50,0 60,10 Z');
    // a quarter arc from the top of a circle of radius 10 centred at 10, 10, clockwise to its right
    expect(
      pathData([
        { op: 'moveTo', x: 10, y: 0 },
        { op: 'arcTo', wR: 10, hR: 10, stAng: 270, swAng: 90 },
      ]),
    ).toBe('M10,0 A10,10 0 0 1 20,10');
    // a half turn is written as two arcs of a quarter each
    expect(
      pathData([
        { op: 'moveTo', x: 10, y: 0 },
        { op: 'arcTo', wR: 10, hR: 10, stAng: 270, swAng: 180 },
      ]),
    ).toBe('M10,0 A10,10 0 0 1 20,10 A10,10 0 0 1 10,20');
  });
});
