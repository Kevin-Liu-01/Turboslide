import { describe, expect, test } from 'vitest';

import { renumberShapeIds, shapeIdsOf } from './ids.ts';

// The shape id renumber (gslides-parity SPEC-5 2.4; R05 6.4): every cNvPr id from 1 in document
// order with the spTree root first, the connector ends following their targets, the name map.
const PART =
  '<p:sld xmlns:a="a" xmlns:p="p"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
  '<p:sp><p:nvSpPr><p:cNvPr id="7" name="ts:s#a"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr></p:sp>' +
  '<p:grpSp><p:nvGrpSpPr><p:cNvPr id="40" name="g:pair"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
  '<p:sp><p:nvSpPr><p:cNvPr id="7" name="ts:s#b@g:pair"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr></p:sp>' +
  '<p:pic><p:nvPicPr><p:cNvPr id="9" name="ts:s#c@g:pair" descr="a &amp; b"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr></p:pic>' +
  '</p:grpSp>' +
  '<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="12" name="ts:s#line"/><p:cNvCxnSpPr><a:stCxn id="7" idx="1"/><a:endCxn id="9" idx="3"/></p:cNvCxnSpPr><p:nvPr/></p:nvCxnSpPr></p:cxnSp>' +
  '</p:spTree></p:cSld></p:sld>';

describe('renumberShapeIds', () => {
  test('numbers every cNvPr from 1 in document order and maps the names', () => {
    const out = renumberShapeIds(PART);
    expect(shapeIdsOf(out.xml)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(out.count).toBe(6);
    expect(out.duplicates).toBe(1);
    expect(out.ids.get('ts:s#a')).toBe(2);
    expect(out.ids.get('g:pair')).toBe(3);
    expect(out.ids.get('ts:s#b@g:pair')).toBe(4);
    expect(out.ids.get('ts:s#c@g:pair')).toBe(5);
    expect(out.ids.get('ts:s#line')).toBe(6);
    expect(out.ids.has('')).toBe(false);
  });

  test('rewires the connector ends to the new numbers (the first shape of a repeated old id)', () => {
    const out = renumberShapeIds(PART);
    expect(out.xml).toContain('<a:stCxn id="2" idx="1"/>');
    expect(out.xml).toContain('<a:endCxn id="5" idx="3"/>');
    // the descr with an entity survives untouched
    expect(out.xml).toContain('descr="a &amp; b"');
  });

  test('a part without shapes is returned as it is', () => {
    const bare = '<p:sld xmlns:p="p"><p:cSld><p:spTree/></p:cSld></p:sld>';
    const out = renumberShapeIds(bare);
    expect(out.xml).toBe(bare);
    expect(out.count).toBe(0);
    expect(out.ids.size).toBe(0);
  });
});
