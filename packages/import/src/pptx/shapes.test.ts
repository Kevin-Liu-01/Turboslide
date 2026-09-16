// The shape tables (gslides-parity SPEC-5 5.1; R04 5.3, 5.4): the dash fold, the line ends, the
// preset fallback families, the geometry reading with adjusts in guide order, and the stroke
// ladder snap. The whole shape reader is exercised by fixture 02 in fixtures.test.ts.
import { describe, expect, it } from 'vitest';

import { isShapePresetId, shapeAdjustDefaults, shapeGuides } from '@turboslide/schema/shapes';

import {
  dashOf,
  lineEndOf,
  presetFallback,
  readGeometry,
  snapLadder,
  SHAPE_STROKE_LADDER,
} from './shapes.ts';
import { parseXml } from './xml.ts';

const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const P = 'http://schemas.openxmlformats.org/presentationml/2006/main';

describe('dashOf', () => {
  it.each([
    [undefined, undefined, true],
    ['solid', undefined, true],
    ['dot', 'dot', true],
    ['sysDot', 'dot', true],
    ['dash', 'dash', true],
    ['sysDash', 'dash', true],
    ['dashDot', 'dashDot', true],
    ['sysDashDot', 'dashDot', true],
    ['lgDash', 'longDash', true],
    ['lgDashDot', 'longDashDot', true],
    ['lgDashDotDot', 'longDashDot', false],
    ['sysDashDotDot', 'longDashDot', false],
  ] as const)('%s reads as %s (exact %s)', (value, dash, exact) => {
    expect(dashOf(value)).toEqual({ dash, exact });
  });
});

describe('lineEndOf', () => {
  it('is the inverse of the export table', () => {
    expect(lineEndOf('triangle')).toBe('fillArrow');
    expect(lineEndOf('stealth')).toBe('stealth');
    expect(lineEndOf('oval')).toBe('fillCircle');
    expect(lineEndOf('diamond')).toBe('fillDiamond');
    expect(lineEndOf('arrow')).toBe('openArrow');
    expect(lineEndOf('none')).toBeUndefined();
    expect(lineEndOf(undefined)).toBeUndefined();
  });
});

describe('presetFallback', () => {
  it('lands a preset outside the 135 on its family', () => {
    expect(presetFallback('flowChartDecision')).toBe('rect');
    expect(presetFallback('actionButtonHome')).toBe('roundRect');
    expect(presetFallback('wedgeRectCallout')).toBe('rect');
    expect(presetFallback('star24')).toBe('star5');
    expect(presetFallback('mathPlus')).toBe('rect');
    expect(presetFallback('leftRightArrowCallout')).toBe('rect');
    expect(presetFallback('curvedUpArrow')).toBe('rightArrow');
  });
});

describe('readGeometry', () => {
  function spPr(inner: string): ReturnType<typeof readGeometry> {
    const { root } = parseXml(`<p:spPr xmlns:p="${P}" xmlns:a="${A}">${inner}</p:spPr>`, 'test');
    return readGeometry(root);
  }

  it('reads a preset with its written adjusts in guide order and the defaults for the rest', () => {
    const reading = spPr(
      '<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 30000"/></a:avLst></a:prstGeom>',
    );
    expect(reading).toEqual({ kind: 'preset', prst: 'roundRect', adjust: [30000], exact: true });
    const callout = spPr(
      '<a:prstGeom prst="wedgeRectCallout"><a:avLst><a:gd name="adj2" fmla="val 90000"/></a:avLst></a:prstGeom>',
    );
    expect(callout.kind).toBe('preset');
    if (callout.kind === 'preset') {
      expect(callout.prst).toBe('wedgeRectCallout');
      expect(callout.exact).toBe(true);
      const guides = shapeGuides('wedgeRectCallout');
      expect(callout.adjust).toHaveLength(guides.length);
      expect(callout.adjust[guides.indexOf('adj2')]).toBe(90000);
      expect(callout.adjust[guides.indexOf('adj1')]).toBe(
        shapeAdjustDefaults('wedgeRectCallout')[guides.indexOf('adj1')],
      );
    }
  });

  it('folds a preset outside the list onto its family and marks it inexact', () => {
    const outside = [
      'actionButtonBlank',
      'mathPlus',
      'star24',
      'flowChartOffpageConnector',
      'funnel',
    ].find((prst) => !isShapePresetId(prst));
    expect(outside).toBeDefined();
    const reading = spPr(`<a:prstGeom prst="${outside}"><a:avLst/></a:prstGeom>`);
    expect(reading).toMatchObject({
      kind: 'preset',
      prst: presetFallback(outside as string),
      exact: false,
    });
    expect(spPr('<a:prstGeom prst="flowChartDecision"><a:avLst/></a:prstGeom>')).toMatchObject({
      kind: 'preset',
      prst: 'flowChartDecision',
      exact: true,
    });
  });

  it('reads a custom geometry as its paths and no geometry as none', () => {
    const custom = spPr(
      '<a:custGeom><a:pathLst><a:path w="100" h="100"><a:moveTo><a:pt x="0" y="0"/></a:moveTo><a:lnTo><a:pt x="100" y="100"/></a:lnTo></a:path></a:pathLst></a:custGeom>',
    );
    expect(custom.kind).toBe('custom');
    if (custom.kind === 'custom') expect(custom.paths).toHaveLength(1);
    expect(spPr('')).toEqual({ kind: 'none' });
  });
});

describe('snapLadder', () => {
  it('snaps to the nearest step and reports the delta', () => {
    expect(snapLadder(0.75, SHAPE_STROKE_LADDER)).toEqual({ value: 1, delta: 0.25 });
    expect(snapLadder(2.5, SHAPE_STROKE_LADDER).value).toBe(2);
    expect(snapLadder(3.4, SHAPE_STROKE_LADDER).value).toBe(3);
    expect(snapLadder(9, SHAPE_STROKE_LADDER)).toEqual({ value: 4, delta: 5 });
  });
});
