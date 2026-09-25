// The connector bound of the vector round (docs/VECTOR.md 2.5, 6.3): `toConnector` attaches an
// end only when its site index is one the target's preset lists in the file. A rectangle offers
// eight sites in the product (the ECMA four then four corners, schema shapes.ts `rectSites`) and
// the file indexes the first four alone, so an end on a corner is dropped and named; a hexagon's
// six are its own list; a target without a preset geometry keeps the index as given.
import { describe, expect, test } from 'vitest';

import { shapeAdjustDefaults, sites } from '@turboslide/schema/shapes';

import { countConnectors } from './shapes.ts';
import { presetSiteCount, toConnector } from './shapes.ts';

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
