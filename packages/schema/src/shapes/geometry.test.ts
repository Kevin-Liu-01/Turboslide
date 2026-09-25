// The geometry interpreter (docs/VECTOR.md 2.1, 6.3): the seventeen formula operations, the built
// in guides, the arc conversion, the path space scaling, every preset at three sizes, and a
// sample of the presets against their ECMA path evaluated by hand here.
import { describe, expect, it } from 'vitest';

import { SHAPE_PRESETS, shapeAdjustDefaults } from '../shapes.ts';
import { PRESET_DEFINITIONS } from './definitions.ts';
import {
  DEGREE,
  builtinGuides,
  evaluateFormula,
  evaluateGuides,
  pathData,
  presetGeometry,
} from './geometry.ts';

const joined = (id: string, w: number, h: number, adjust: ReadonlyArray<number> = []) =>
  presetGeometry(id, w, h, adjust.length > 0 ? adjust : shapeAdjustDefaults(id))
    .paths.map((path) => path.d)
    .join(' ');

/** The end point of every command of a path string, parsed by command letter. */
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

describe('the formula operations (ECMA-376 20.1.9.11)', () => {
  const guides = new Map<string, number>([
    ['w', 200],
    ['h', 100],
    ['neg', -30],
  ]);
  const at = (fmla: string) => evaluateFormula(fmla, guides, 'test', 'g');

  it('evaluates each of the seventeen operations with a value', () => {
    expect(at('val 16667')).toBe(16667);
    expect(at('val -20833')).toBe(-20833);
    expect(at('*/ w 3 4')).toBe(150);
    expect(at('+- w h 50')).toBe(250);
    expect(at('+/ w h 3')).toBe(100);
    expect(at('?: neg w h')).toBe(100);
    expect(at('?: w w h')).toBe(200);
    expect(at('?: 0 w h')).toBe(100);
    expect(at('abs neg')).toBe(30);
    expect(at('at2 100 100')).toBeCloseTo(45 * DEGREE, 3);
    expect(at('at2 0 100')).toBeCloseTo(90 * DEGREE, 3);
    expect(at('cat2 w 100 100')).toBeCloseTo(200 * Math.SQRT1_2, 6);
    expect(at('sat2 h 100 100')).toBeCloseTo(100 * Math.SQRT1_2, 6);
    expect(at('cos w 3600000')).toBeCloseTo(100, 6);
    expect(at('sin h 5400000')).toBeCloseTo(100, 6);
    expect(at('tan h 2700000')).toBeCloseTo(100, 6);
    expect(at('max w h')).toBe(200);
    expect(at('min w h')).toBe(100);
    expect(at('mod 3 4 12')).toBe(13);
    expect(at('pin 0 neg 50000')).toBe(0);
    expect(at('pin 0 w 150')).toBe(150);
    expect(at('pin 0 h 150')).toBe(100);
    expect(at('sqrt 144')).toBe(12);
  });

  it('answers 0 for a division by zero and throws for an unknown operation or an undefined guide', () => {
    expect(at('*/ w 3 0')).toBe(0);
    expect(at('+/ w h 0')).toBe(0);
    expect(() => at('pow w 2')).toThrow(RangeError);
    expect(() => at('+- w nope 0')).toThrow(/reads the guide nope before it is defined/);
    expect(() => evaluateFormula('+- w', guides, 'roundRect', 'x1')).toThrow(/roundRect/);
  });

  it('holds the built in guides of 20.1.10.56 at 200 by 100, cd3 included', () => {
    const table = builtinGuides(200, 100);
    expect(table.get('w')).toBe(200);
    expect(table.get('h')).toBe(100);
    expect([table.get('l'), table.get('t'), table.get('r'), table.get('b')]).toEqual([
      0, 0, 200, 100,
    ]);
    expect([table.get('hc'), table.get('vc')]).toEqual([100, 50]);
    expect(table.get('wd2')).toBe(100);
    expect(table.get('wd3')).toBeCloseTo(66.667, 3);
    expect(table.get('wd32')).toBe(6.25);
    expect(table.get('hd12')).toBeCloseTo(8.333, 3);
    expect(table.get('ss')).toBe(100);
    expect(table.get('ssd32')).toBe(3.125);
    expect(table.get('ls')).toBe(200);
    expect(table.get('cd2')).toBe(10800000);
    expect(table.get('cd4')).toBe(5400000);
    expect(table.get('cd8')).toBe(2700000);
    expect(table.get('3cd4')).toBe(16200000);
    expect(table.get('3cd8')).toBe(8100000);
    expect(table.get('5cd8')).toBe(13500000);
    expect(table.get('7cd8')).toBe(18900000);
    expect(table.get('cd3')).toBe(7200000);
    /* curvedLeftArrow's connection site reads cd3 (presetShapeDefinitions.xml 5645) */
    expect(PRESET_DEFINITIONS['curvedLeftArrow']?.cxnLst.some((site) => site.ang === 'cd3')).toBe(
      true,
    );
  });

  it('takes an adjust value at its index when given and the val default otherwise', () => {
    const def = PRESET_DEFINITIONS['wedgeRectCallout'];
    if (def === undefined) throw new Error('no wedgeRectCallout');
    const defaults = evaluateGuides(def, 240, 160, []);
    expect(defaults.get('adj1')).toBe(-20833);
    expect(defaults.get('adj2')).toBe(62500);
    const given = evaluateGuides(def, 240, 160, [10000, Number.NaN]);
    expect(given.get('adj1')).toBe(10000);
    expect(given.get('adj2')).toBe(62500);
    expect(given.get('xPos')).toBe(120 + 24);
  });
});

describe('the arc conversion (ECMA-376 20.1.9.4)', () => {
  it('draws a quarter arc on the ellipse 240 by 160 as ship one drew it', () => {
    const arc = pathData(
      {
        commands: [
          { op: 'moveTo', x: 'l', y: 'vc' },
          { op: 'arcTo', wR: 'wd2', hR: 'hd2', stAng: 'cd2', swAng: 'cd4' },
        ],
      },
      builtinGuides(240, 160),
      240,
      160,
    );
    expect(arc).toBe('M0,80 A120,80 0 0 1 120,0');
  });

  it('draws the pie of the defaults as one arc from 0 degrees sweeping 270 about the centre', () => {
    const pie = joined('pie', 240, 160);
    expect(pie).toBe('M240,80 A120,80 0 1 1 120,0 V80 Z');
    expect(pie.match(/A/g)).toHaveLength(1);
  });

  it('writes two arcs when the sweep reaches 360 degrees', () => {
    /* the pie with its end angle at its start angle: sw1 is 0 and the `?:` guide answers the full turn */
    const full = joined('pie', 240, 160, [0, 0]);
    expect(full.match(/A/g)).toHaveLength(2);
    expect(full).toBe('M240,80 A120,80 0 0 1 0,80 A120,80 0 0 1 240,80 H120 Z');
    /* the divide sign's two dots are full circles */
    expect(joined('mathDivide', 240, 160).match(/A/g)).toHaveLength(4);
  });

  it('ends an arc at the point of the geometric end angle on a wide ellipse, where the pie puts its handle', () => {
    const def = PRESET_DEFINITIONS['pie'];
    if (def === undefined) throw new Error('no pie');
    const adjust = [45 * DEGREE, 200 * DEGREE];
    const guides = evaluateGuides(def, 240, 160, adjust);
    const path = joined('pie', 240, 160, adjust);
    const end = vertices(path)[1];
    expect(end).toBeDefined();
    expect(Math.abs((end?.x ?? 0) - (guides.get('x2') ?? 0))).toBeLessThanOrEqual(0.5);
    expect(Math.abs((end?.y ?? 0) - (guides.get('y2') ?? 0))).toBeLessThanOrEqual(0.5);
    const start = vertices(path)[0];
    expect(Math.abs((start?.x ?? 0) - (guides.get('x1') ?? 0))).toBeLessThanOrEqual(0.5);
    expect(Math.abs((start?.y ?? 0) - (guides.get('y1') ?? 0))).toBeLessThanOrEqual(0.5);
  });

  it('writes nothing for an arc of two collapsed radii, so a rounded rectangle at adj 0 is the box', () => {
    expect(joined('roundRect', 240, 160, [0])).toBe('M0,0 H240 V160 H0 Z');
  });
});

describe('the path space', () => {
  it('scales a path with its own w and h into the box: Flowchart: document at 300 by 100', () => {
    const doc = joined('flowChartDocument', 300, 100);
    expect(doc).toBe('M0,0 H300 V80 C150,80 150,111 0,93.5 Z');
    for (const point of vertices(doc)) {
      expect(point.x).toBeGreaterThanOrEqual(-1);
      expect(point.x).toBeLessThanOrEqual(301);
      expect(point.y).toBeGreaterThanOrEqual(-1);
      expect(point.y).toBeLessThanOrEqual(101);
    }
    /* the bottom edge is the curve; its control point sits below the box the way the file
       draws it (23922 of 21600) while the curve itself peaks below the bottom edge */
    expect(doc).toMatch(/C[^Z]+Z$/);
  });

  it('draws Flowchart: decision from its 2 by 2 space as the diamond', () => {
    expect(joined('flowChartDecision', 200, 100)).toBe('M0,50 L100,0 L200,50 L100,100 Z');
    expect(joined('diamond', 200, 100)).toBe('M0,50 L100,0 L200,50 L100,100 Z');
  });
});

describe('every preset', () => {
  const sizes: [number, number][] = [
    [48, 36],
    [200, 100],
    [400, 400],
  ];
  /* the four callouts' pointer sits below the box at the defaults (adj2 62500: the tip at
     1.125 of the height), as the file draws it; every other vertex is inside the box */
  const callouts = new Set([
    'wedgeRectCallout',
    'wedgeRoundRectCallout',
    'wedgeEllipseCallout',
    'cloudCallout',
  ]);

  it('evaluates at 48 by 36, 200 by 100 and 400 by 400 with finite numbers, every path from M, every closed path to Z, every vertex inside the box', () => {
    for (const row of SHAPE_PRESETS) {
      const def = PRESET_DEFINITIONS[row.prstGeom];
      expect(def, row.id).toBeDefined();
      for (const [w, h] of sizes) {
        const geometry = presetGeometry(row.prstGeom, w, h, shapeAdjustDefaults(row.id));
        expect(geometry.paths, row.id).toHaveLength(def?.pathLst.length ?? -1);
        geometry.paths.forEach((path, index) => {
          expect(path.d, `${row.id} ${w}x${h}`).toMatch(/^M/);
          expect(path.d, `${row.id} ${w}x${h}`).not.toMatch(/NaN|Infinity/);
          const last = def?.pathLst[index]?.commands.at(-1);
          if (last?.op === 'close') expect(path.d.endsWith('Z'), `${row.id} ${w}x${h}`).toBe(true);
          const limit = callouts.has(row.id) ? h * 1.125 + 1 : h + 1;
          for (const point of vertices(path.d)) {
            expect(point.x, `${row.id} ${w}x${h} ${path.d}`).toBeGreaterThanOrEqual(-1);
            expect(point.x, `${row.id} ${w}x${h} ${path.d}`).toBeLessThanOrEqual(w + 1);
            expect(point.y, `${row.id} ${w}x${h} ${path.d}`).toBeGreaterThanOrEqual(-1);
            expect(point.y, `${row.id} ${w}x${h} ${path.d}`).toBeLessThanOrEqual(limit);
          }
        });
        expect(geometry.textRect.w, row.id).toBeGreaterThan(0);
        expect(geometry.textRect.h, row.id).toBeGreaterThan(0);
        expect(geometry.sites, row.id).toHaveLength(def?.cxnLst.length ?? -1);
        expect(geometry.handles, row.id).toHaveLength(def?.ahLst.length ?? -1);
        for (const site of geometry.sites) {
          expect(Number.isFinite(site.x) && Number.isFinite(site.y), row.id).toBe(true);
          expect(Number.isFinite(site.angle), row.id).toBe(true);
        }
      }
    }
  });

  it('throws a RangeError naming a preset the file does not hold', () => {
    expect(() => presetGeometry('nope', 100, 100, [])).toThrow(RangeError);
    expect(() => presetGeometry('nope', 100, 100, [])).toThrow(/nope/);
  });

  it('keeps every number finite at a zero box', () => {
    for (const row of SHAPE_PRESETS) {
      const geometry = presetGeometry(row.prstGeom, 0, 0, shapeAdjustDefaults(row.id));
      for (const path of geometry.paths) expect(path.d, row.id).not.toMatch(/NaN|Infinity/);
    }
  });
});

describe('the pinned paths and a sample against the ECMA path by hand', () => {
  it('draws rect as the box and roundRect and ellipse byte for byte as ship one did', () => {
    expect(joined('rect', 240, 160)).toBe('M0,0 H240 V160 H0 Z');
    expect(joined('roundRect', 240, 160)).toBe(
      'M0,26.5 A26.5,26.5 0 0 1 26.5,0 H213.5 A26.5,26.5 0 0 1 240,26.5 V133.5 A26.5,26.5 0 0 1 213.5,160 H26.5 A26.5,26.5 0 0 1 0,133.5 Z',
    );
    expect(joined('roundRect', 48, 36)).toContain('A6,6 0 0 1 6,0');
    expect(joined('ellipse', 240, 160)).toBe(
      'M0,80 A120,80 0 0 1 120,0 A120,80 0 0 1 240,80 A120,80 0 0 1 120,160 A120,80 0 0 1 0,80 Z',
    );
    expect(joined('ellipse', 48, 36)).toBe(
      'M0,18 A24,18 0 0 1 24,0 A24,18 0 0 1 48,18 A24,18 0 0 1 24,36 A24,18 0 0 1 0,18 Z',
    );
  });

  it('Shapes: triangle, right triangle, trapezoid, plus and hexagon at 200 by 100', () => {
    /* triangle: a 50000, x2 = w a / 100000 = 100; M l,b L x2,t L r,b Z */
    expect(joined('triangle', 200, 100)).toBe('M0,100 L100,0 L200,100 Z');
    /* rtTriangle: M l,b L l,t L r,b Z; the second line is vertical */
    expect(joined('rtTriangle', 200, 100)).toBe('M0,100 V0 L200,100 Z');
    /* trapezoid: maxAdj 100000, a 25000, x2 = ss a / 100000 = 25, x3 = r - x2 = 175 */
    expect(joined('trapezoid', 200, 100)).toBe('M0,100 L25,0 H175 L200,100 Z');
    /* plus: a 25000, x1 = ss a / 100000 = 25, x2 = 175, y2 = 75; twelve vertices */
    const plus = joined('plus', 200, 100);
    expect(plus).toBe('M0,25 H25 V0 H175 V25 H200 V75 H175 V100 H25 V75 H0 Z');
    expect(vertices(plus)).toHaveLength(12);
    /* hexagon: maxAdj 100000, a 25000, x1 = 25, x2 = 175, shd2 = hd2 1.1547, dy1 = shd2 sin 60 = 50 */
    const hexagon = joined('hexagon', 200, 100);
    expect(hexagon).toBe('M0,50 L25,0 H175 L200,50 L175,100 H25 Z');
    expect(vertices(hexagon)).toHaveLength(6);
  });

  it('Arrows: right arrow at 240 by 160, chevron and pentagon arrow at 200 by 100', () => {
    /* rightArrow: maxAdj2 150000, a1 a2 50000, dx1 = ss a2 / 100000 = 80, x1 = 160,
       dy1 = h a1 / 200000 = 40, y1 = 40, y2 = 120; seven vertices, the tip at r,vc */
    const arrow = joined('rightArrow', 240, 160);
    expect(arrow).toBe('M0,40 H160 V0 L240,80 L160,160 V120 H0 Z');
    expect(vertices(arrow)).toHaveLength(7);
    /* chevron: maxAdj 200000, a 50000, x1 = ss a / 100000 = 50, x2 = 150 */
    expect(joined('chevron', 200, 100)).toBe('M0,0 H150 L200,50 L150,100 H0 L50,50 Z');
    /* homePlate: dx1 = 50, x1 = 150 */
    expect(joined('homePlate', 200, 100)).toBe('M0,0 H150 L200,50 L150,100 H0 Z');
  });

  it('Callouts: the rectangular callout at 240 by 160 puts its tip at (-20833, 62500) of the box from the centre', () => {
    /* dxPos = w adj1 / 100000 = -50, dyPos = h adj2 / 100000 = 100, xPos = 70, yPos = 180;
       dz > 0 so the pointer leaves the bottom edge between x1 = w 2/12 = 40 and x2 = w 5/12 = 100,
       and the guides `xl`, `xt`, `xr`, `yl`, `yt`, `yr` answer the box's own points (written as
       the repeated H and V the file's vertices stand for) */
    const callout = joined('wedgeRectCallout', 240, 160);
    expect(callout).toBe(
      'M0,0 H40 H40 H100 H240 V93.5 H240 V133.5 V160 H100 L70,180 L40,160 H0 V133.5 V93.5 H0 Z',
    );
    const points = vertices(callout);
    const tip = points.find((point) => point.y > 160);
    expect(tip).toEqual({ x: 70, y: 180 });
    /* every other vertex is on the box */
    for (const point of points) {
      if (point === tip) continue;
      expect(point.x === 0 || point.x === 240 || point.y === 0 || point.y === 160).toBe(true);
    }
  });

  it('Equation: minus and plus at 200 by 100', () => {
    /* mathMinus: dy1 = h 23520 / 200000 = 11.76, dx1 = w 73490 / 200000 = 73.49;
       x1 = 26.51, x2 = 173.49, y1 = 38.24, y2 = 61.76, on the half pixel grid */
    expect(joined('mathMinus', 200, 100)).toBe('M26.5,38 H173.5 V62 H26.5 Z');
    /* mathPlus: dx2 = ss a1 / 200000 = 11.76; the arms are 2 dx2 = 23.52 wide, adj1 of ss;
       y1 = vc - h 73490 / 200000 = 13.255, y4 = 86.745 */
    const plus = joined('mathPlus', 200, 100);
    expect(plus).toBe('M26.5,38 H88 V13.5 H112 V38 H173.5 V62 H112 V86.5 H88 V62 H26.5 Z');
    expect(vertices(plus)).toHaveLength(12);
  });

  it('answers the text rectangles: roundRect inset by x1 times 0.29289, rightArrow the shaft, pie the box', () => {
    const rounded = presetGeometry('roundRect', 240, 160, [16667]).textRect;
    const x1 = (160 * 16667) / 100000;
    const il = (x1 * 29289) / 100000;
    expect(rounded.x).toBeCloseTo(il, 6);
    expect(rounded.y).toBeCloseTo(il, 6);
    expect(rounded.w).toBeCloseTo(240 - 2 * il, 6);
    expect(rounded.h).toBeCloseTo(160 - 2 * il, 6);
    expect(rounded.x).toBeCloseTo(7.81, 2);
    expect(presetGeometry('rightArrow', 240, 160, [50000, 50000]).textRect).toEqual({
      x: 0,
      y: 40,
      w: 200,
      h: 80,
    });
    /* the file's pie names its rectangle's guides in the wrong order (l il, t ir, r it, b ib),
       which inverts it; the whole box stands in */
    expect(presetGeometry('pie', 240, 160, [0, 16200000]).textRect).toEqual({
      x: 0,
      y: 0,
      w: 240,
      h: 160,
    });
    /* the ellipse's is the rectangle inscribed at 45 degrees */
    const ellipse = presetGeometry('ellipse', 240, 160, []).textRect;
    expect(ellipse.x).toBeCloseTo(120 - 120 * Math.SQRT1_2, 3);
    expect(ellipse.y).toBeCloseTo(80 - 80 * Math.SQRT1_2, 3);
  });

  it('answers the sites in the file’s order with the angle in degrees: hexagon six, rect four', () => {
    const hexagon = presetGeometry('hexagon', 240, 160, [25000, 115470]).sites;
    expect(hexagon).toHaveLength(6);
    expect(hexagon[0]).toEqual({ x: 240, y: 80, angle: 0 });
    expect(hexagon[3]).toEqual({ x: 0, y: 80, angle: 180 });
    expect(hexagon.map((site) => site.angle)).toEqual([0, 90, 90, 180, 270, 270]);
    const rect = presetGeometry('rect', 240, 160, []).sites;
    expect(rect).toEqual([
      { x: 120, y: 0, angle: 270 },
      { x: 0, y: 80, angle: 180 },
      { x: 120, y: 160, angle: 90 },
      { x: 240, y: 80, angle: 0 },
    ]);
    expect(presetGeometry('wedgeRectCallout', 240, 160, []).sites).toHaveLength(5);
  });

  it('keeps each path’s fill mode and stroke flag: can’s three paths with the lid unstroked, the curved arrow’s shade', () => {
    const can = presetGeometry('can', 240, 160, [25000]);
    expect(can.paths).toHaveLength(3);
    expect(can.paths.map((path) => path.fill)).toEqual(['norm', 'lighten', 'none']);
    expect(can.paths.map((path) => path.stroke)).toEqual([false, false, true]);
    expect(can.paths[1]?.d).toBe('M0,20 A120,20 0 0 1 240,20 A120,20 0 0 1 0,20 Z');
    /* the file's curved arrows shade their inner face with darkenLess; bevel alone carries darken */
    const curved = presetGeometry(
      'curvedRightArrow',
      240,
      240,
      shapeAdjustDefaults('curvedRightArrow'),
    );
    expect(curved.paths).toHaveLength(3);
    expect(curved.paths.map((path) => path.fill)).toEqual(['norm', 'darkenLess', 'none']);
    for (const path of curved.paths) expect(path.d).toMatch(/A/);
    expect(presetGeometry('bevel', 200, 100, [12500]).paths.map((path) => path.fill)).toContain(
      'darken',
    );
    /* cloudCallout's five paths: the cloud, the three tail ellipses and the outline */
    expect(presetGeometry('cloudCallout', 240, 160, [-20833, 62500]).paths).toHaveLength(5);
  });

  it('answers the adjust handles with their guide references and bounds as numbers', () => {
    const [handle] = presetGeometry('roundRect', 240, 160, [16667]).handles;
    expect(handle).toEqual({
      kind: 'xy',
      x: (160 * 16667) / 100000,
      y: 0,
      gdRefX: 'adj',
      minX: 0,
      maxX: 50000,
    });
    const pie = presetGeometry('pie', 240, 160, [0, 16200000]).handles;
    expect(pie).toHaveLength(2);
    expect(pie[0]?.kind).toBe('polar');
    expect(pie[0]?.gdRefAng).toBe('adj1');
    expect(pie[0]?.maxAng).toBe(21599999);
    expect(pie[1]?.x).toBeCloseTo(120, 6);
    expect(pie[1]?.y).toBeCloseTo(0, 6);
  });
});
