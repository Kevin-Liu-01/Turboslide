// The shape presets (gslides-parity SPEC-2 2.3, 11.5 shapes.test.ts): every preset has a label, a
// category and a prstGeom that is a name in the committed ECMA definitions file (ST_ShapeType, not
// the pptxgenjs enum, 0.47); the 135 rows in Google's four categories; the legacy ids map; the
// day one geometry stubs answer a box, a text inset and eight sites at three sizes; lineEndPath
// for the ten decorations; the dashes and the pptxgenjs names. The interpreter's tests join in
// shapes/geometry.test.ts when it lands (merge 1b).
import { describe, expect, it } from 'vitest';

import { SHAPE_KINDS } from './blocks.ts';
import {
  CONNECTOR_PRST,
  DASHES,
  DASH_PPTX,
  LEGACY_PRESETS,
  LEGACY_SHAPE_IDS,
  LINE_ENDS,
  LINE_END_PPTX,
  LINE_KINDS,
  SHAPE_CATEGORIES,
  SHAPE_PRESETS,
  SHAPE_PRESET_IDS,
  dashArray,
  isClosedShapeKind,
  isConnectorKind,
  isLineKind,
  lineEndFilled,
  lineEndPath,
  presetOf,
  shapeAdjustDefaults,
  shapeGuides,
  shapePath,
  sites,
  textInset,
} from './shapes.ts';
import { PRESET_DEFINITIONS, PRESET_DEFINITIONS_SHA256 } from './shapes/definitions.ts';

describe('the preset table', () => {
  it('holds 135 presets in Google’s four categories, each with a label and a prstGeom the definitions file names', () => {
    expect(SHAPE_PRESETS).toHaveLength(135);
    expect(new Set(SHAPE_PRESET_IDS).size).toBe(135);
    const counts: Record<string, number> = {};
    for (const row of SHAPE_PRESETS) {
      counts[row.category] = (counts[row.category] ?? 0) + 1;
      expect(row.label.length, row.id).toBeGreaterThan(0);
      expect(SHAPE_CATEGORIES).toContain(row.category);
      expect(row.prstGeom).toBe(row.id);
      expect(PRESET_DEFINITIONS[row.prstGeom], row.id).toBeDefined();
    }
    expect(counts).toEqual({ shapes: 99, arrows: 26, callouts: 4, equation: 6 });
    // the ECMA spelling, never the pptxgenjs enum (0.47)
    expect(SHAPE_PRESET_IDS).toContain('foldedCorner');
    expect(SHAPE_PRESET_IDS).not.toContain('folderCorner');
    expect(PRESET_DEFINITIONS_SHA256).toMatch(/^[0-9a-f]{64}$/);
    // the two connector geometries the line kinds export as are in the file too
    for (const name of Object.values(CONNECTOR_PRST))
      expect(PRESET_DEFINITIONS[name]).toBeDefined();
  });

  it('labels follow Google’s words in sentence case where the row does not say otherwise', () => {
    const byId = new Map(SHAPE_PRESETS.map((row) => [row.id, row.label]));
    expect(byId.get('rtTriangle')).toBe('Right triangle');
    expect(byId.get('noSmoking')).toBe('"No" symbol');
    expect(byId.get('homePlate')).toBe('Pentagon arrow');
    expect(byId.get('star4')).toBe('4 point star');
    expect(byId.get('irregularSeal1')).toBe('Explosion 1');
    expect(byId.get('flowChartProcess')).toBe('Flowchart: process');
    for (const label of byId.values()) expect(label).not.toMatch(/—/);
  });

  it('maps the legacy ids to their presets and tells lines, connectors and closed shapes apart', () => {
    expect(LEGACY_SHAPE_IDS).toEqual(['rectangle', 'rounded', 'ellipse', 'line', 'arrow']);
    expect(LEGACY_PRESETS).toEqual({ rectangle: 'rect', rounded: 'roundRect', ellipse: 'ellipse' });
    expect(presetOf('rounded')?.id).toBe('roundRect');
    expect(presetOf('hexagon')?.id).toBe('hexagon');
    expect(presetOf('line')).toBeUndefined();
    expect(LINE_KINDS).toEqual([
      'line',
      'arrow',
      'elbow',
      'curved',
      'curve',
      'polyline',
      'scribble',
    ]);
    for (const kind of LINE_KINDS) expect(isLineKind(kind)).toBe(true);
    expect(isConnectorKind('elbow')).toBe(true);
    expect(isConnectorKind('curve')).toBe(false);
    expect(isClosedShapeKind('ellipse')).toBe(true);
    expect(isClosedShapeKind('rectangle')).toBe(true);
    expect(isClosedShapeKind('arrow')).toBe(false);
    // the schema's shape enum is the legacy ids, the presets and the five new line kinds
    expect(SHAPE_KINDS).toHaveLength(5 + 135 + 5);
  });

  it('reads a preset’s adjust guides and their defaults from the definitions file', () => {
    expect(shapeGuides('roundRect')).toEqual(['adj']);
    expect(shapeAdjustDefaults('roundRect')).toEqual([16667]);
    expect(shapeGuides('wedgeRectCallout')).toEqual(['adj1', 'adj2']);
    expect(shapeAdjustDefaults('wedgeRectCallout')).toEqual([-20833, 62500]);
    expect(shapeGuides('rect')).toEqual([]);
    expect(shapeGuides('line')).toEqual([]);
  });
});

describe('the geometry stubs of day one', () => {
  const sizes: [number, number][] = [
    [48, 36],
    [200, 100],
    [400, 400],
  ];

  it('answer the box as the path, the whole box as the text inset and eight sites at three sizes for every preset', () => {
    for (const row of SHAPE_PRESETS) {
      for (const [w, h] of sizes) {
        const path = shapePath(row.id, w, h, shapeAdjustDefaults(row.id));
        expect(path, row.id).toMatch(/^M/);
        expect(path).toContain(String(w));
        expect(textInset(row.id, w, h)).toEqual({ x: 0, y: 0, w, h });
        const points = sites(row.id, w, h);
        expect(points).toHaveLength(8);
        for (const point of points) {
          expect(point.x).toBeGreaterThanOrEqual(0);
          expect(point.x).toBeLessThanOrEqual(w);
          expect(point.y).toBeGreaterThanOrEqual(0);
          expect(point.y).toBeLessThanOrEqual(h);
        }
      }
    }
  });
});

describe('line decorations and dashes', () => {
  it('draws the ten decorations, the arrows at 8 px and the others at 6, filled or open', () => {
    expect(LINE_ENDS).toHaveLength(10);
    expect(lineEndPath('none')).toBe('');
    for (const kind of LINE_ENDS) {
      if (kind === 'none') continue;
      const path = lineEndPath(kind);
      expect(path, kind).toMatch(/^M/);
      expect(path.endsWith('Z'), kind).toBe(true);
    }
    expect(lineEndPath('fillArrow')).toBe('M0,0 L-8,-4 L-8,4 Z');
    expect(lineEndPath('openCircle')).toContain('a3,3');
    expect(lineEndFilled('fillArrow')).toBe(true);
    expect(lineEndFilled('stealth')).toBe(true);
    expect(lineEndFilled('openDiamond')).toBe(false);
    // the pptxgenjs heads, the substituted ones marked (SPEC-2 2.4.5)
    expect(LINE_END_PPTX.fillArrow).toEqual({ head: 'triangle', exact: true });
    expect(LINE_END_PPTX.openSquare.exact).toBe(false);
  });

  it('writes the six dash arrays scaled by the stroke and the pptxgenjs dash names', () => {
    expect(DASHES).toEqual(['solid', 'dot', 'dash', 'dashDot', 'longDash', 'longDashDot']);
    expect(dashArray('solid', 2)).toBe('');
    expect(dashArray('dot', 1)).toBe('1 2');
    expect(dashArray('dash', 2)).toBe('8 6');
    expect(dashArray('longDashDot', 1)).toBe('8 3 1 3');
    expect(DASH_PPTX).toEqual({
      solid: 'solid',
      dot: 'sysDot',
      dash: 'dash',
      dashDot: 'dashDot',
      longDash: 'lgDash',
      longDashDot: 'lgDashDot',
    });
  });
});
