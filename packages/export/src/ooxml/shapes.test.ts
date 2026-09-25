// The connector bound of the vector round (docs/VECTOR.md 2.5, 6.3): `toConnector` attaches an
// end only when its site index is one the target's preset lists in the file. A rectangle offers
// eight sites in the product (the ECMA four then four corners, schema shapes.ts `rectSites`) and
// the file indexes the first four alone, so an end on a corner is dropped and named; a hexagon's
// six are its own list; a target without a preset geometry keeps the index as given. The adjust
// rewrite (SPEC-2 2.3.2) fills the list pptxgenjs leaves empty on a rounded rectangle drawn as a
// path (the vector round's fix round, VERIFICATION.md finding 1) and replaces the `adj` it writes
// from a corner radius.
import { describe, expect, test } from 'vitest';

import { shapeAdjustDefaults, shapeGuides, sites } from '@turboslide/schema/shapes';

import { countConnectors } from './shapes.ts';
import { presetSiteCount, toConnector, writeAdjustValues } from './shapes.ts';

const geom = (prst: string): string => `<a:prstGeom prst="${prst}"><a:avLst/></a:prstGeom>`;
const shape = (id: number, name: string, body: string): string =>
  `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="100" cy="100"/></a:xfrm>${body}</p:spPr></p:sp>`;
const frame = (id: number, name: string): string =>
  `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="${name}"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="0" y="0"/><a:ext cx="100" cy="100"/></p:xfrm><a:graphic/></p:graphicFrame>`;

const PART =
  '<p:spTree>' +
  shape(2, 'ts:s#rect', geom('rect')) +
  shape(3, 'ts:s#hex', geom('hexagon')) +
  frame(5, 'ts:s#table') +
  shape(4, 'ts:s#line', geom('bentConnector3')) +
  '</p:spTree>';

describe('presetSiteCount', () => {
  test('a rectangle lists four in the file, the other presets their own list, a non preset nothing', () => {
    expect(presetSiteCount('rect')).toBe(4);
    expect(presetSiteCount('roundRect')).toBe(4);
    expect(presetSiteCount('ellipse')).toBe(8);
    // the interpreter's list (six for a hexagon once schema shapes.ts answers it)
    expect(presetSiteCount('hexagon')).toBe(
      sites('hexagon', 100, 100, shapeAdjustDefaults('hexagon')).length,
    );
    expect(presetSiteCount('bentConnector3')).toBeUndefined();
    expect(presetSiteCount('custGeom')).toBeUndefined();
  });
});

describe('writeAdjustValues on a rounded rectangle (SPEC-2 2.3.2; VERIFICATION.md finding 1)', () => {
  const rounded = (list: string): string =>
    '<p:spTree>' +
    shape(
      2,
      'ts:s#rounded',
      `<a:prstGeom prst="roundRect"><a:avLst>${list}</a:avLst></a:prstGeom>`,
    ) +
    '</p:spTree>';

  test('the list pptxgenjs writes empty for a path drawn preset gains the block adj under the guide the table names', () => {
    expect(shapeGuides('roundRect')).toEqual(['adj']);
    expect(shapeGuides('rounded')).toEqual(['adj']);
    const out = writeAdjustValues(rounded(''), 'ts:s#rounded', shapeGuides('roundRect'), [50000]);
    expect(out.written).toBe(true);
    expect(out.xml).toContain(
      '<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 50000"/></a:avLst></a:prstGeom>',
    );
  });

  test('the self closed empty list and the adj pptxgenjs writes from a corner radius are replaced alike', () => {
    const selfClosed = writeAdjustValues(
      '<p:spTree>' + shape(2, 'ts:s#rounded', geom('roundRect')) + '</p:spTree>',
      'ts:s#rounded',
      ['adj'],
      [50000],
    );
    expect(selfClosed.written).toBe(true);
    expect(selfClosed.xml).toContain(
      '<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 50000"/></a:avLst></a:prstGeom>',
    );
    const own = writeAdjustValues(
      rounded('<a:gd name="adj" fmla="val 16667"/>'),
      'ts:s#rounded',
      ['adj'],
      [50000],
    );
    expect(own.written).toBe(true);
    expect(own.xml).toContain('<a:avLst><a:gd name="adj" fmla="val 50000"/></a:avLst>');
    expect(own.xml).not.toContain('16667');
  });

  test('no values or a missing shape writes nothing', () => {
    expect(writeAdjustValues(rounded(''), 'ts:s#rounded', ['adj'], []).written).toBe(false);
    expect(writeAdjustValues(rounded(''), 'ts:s#other', ['adj'], [50000]).written).toBe(false);
  });
});

describe('toConnector with the site bound (VECTOR.md 2.5)', () => {
  test('an end on a rectangle corner site is dropped and named; the other end attaches', () => {
    const out = toConnector(PART, 'ts:s#line', {
      start: { name: 'ts:s#rect', site: 5 },
      end: { name: 'ts:s#rect', site: 3 },
    });
    expect(out.written).toBe(true);
    expect(out.dropped).toEqual(['start']);
    expect(out.xml).toContain('<p:cNvCxnSpPr><a:endCxn id="2" idx="3"/></p:cNvCxnSpPr>');
    expect(out.xml).not.toContain('stCxn');
    expect(countConnectors(out.xml)).toBe(1);
  });

  test('a hexagon takes an index below its own count and drops one at it', () => {
    const count = sites('hexagon', 100, 100, shapeAdjustDefaults('hexagon')).length;
    const kept = toConnector(PART, 'ts:s#line', { end: { name: 'ts:s#hex', site: count - 1 } });
    expect(kept.written).toBe(true);
    expect(kept.dropped).toEqual([]);
    expect(kept.xml).toContain(`<a:endCxn id="3" idx="${count - 1}"/>`);
    const dropped = toConnector(PART, 'ts:s#line', { end: { name: 'ts:s#hex', site: count } });
    expect(dropped.written).toBe(false);
    expect(dropped.dropped).toEqual(['end']);
    expect(dropped.xml).toBe(PART);
  });

  test('both ends dropped leave the shape as it was, with both named', () => {
    const out = toConnector(PART, 'ts:s#line', {
      start: { name: 'ts:s#rect', site: 4 },
      end: { name: 'ts:s#rect', site: 7 },
    });
    expect(out.written).toBe(false);
    expect(out.dropped).toEqual(['start', 'end']);
    expect(out.xml).toBe(PART);
  });

  test('a target without a preset geometry (a graphic frame) keeps the index as given', () => {
    const out = toConnector(PART, 'ts:s#line', { start: { name: 'ts:s#table', site: 6 } });
    expect(out.written).toBe(true);
    expect(out.dropped).toEqual([]);
    expect(out.xml).toContain('<a:stCxn id="5" idx="6"/>');
  });

  test('a missing target still answers no attachment and nothing dropped', () => {
    const out = toConnector(PART, 'ts:s#line', { end: { name: 'ts:s#nope', site: 0 } });
    expect(out.written).toBe(false);
    expect(out.dropped).toEqual([]);
  });
});
