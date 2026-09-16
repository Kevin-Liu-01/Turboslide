// The grpSp post process (SPEC 8.2; gslides-parity SPEC-2 2.1.3, 0.67; SPEC-5 0.48): the shape
// list, the row and user groups by object name key, each group's own id, and the
// mc:AlternateContent wrapper read as one shape.
import { describe, expect, test } from 'vitest';

import { countGroups, groupKeyOf, groupKeysOf, groupShapes, listShapes } from './groups.ts';

function sp(
  id: number,
  name: string,
  x: number,
  y: number,
  cx: number,
  cy: number,
  body = '',
): string {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm></p:spPr>${body}</p:sp>`;
}

function frame(id: number, name: string): string {
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="${name}"/></p:nvGraphicFramePr><p:xfrm><a:off x="100" y="100"/><a:ext cx="500" cy="500"/></p:xfrm></p:graphicFrame>`;
}

function cxn(id: number, name: string): string {
  return `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="${id}" name="${name}"/></p:nvCxnSpPr><p:spPr><a:xfrm><a:off x="700" y="100"/><a:ext cx="300" cy="10"/></a:xfrm></p:spPr></p:cxnSp>`;
}

/** The wrapper ooxml/math.ts writes: the Choice and the Fallback hold the same shape. */
function alternate(id: number, name: string, x: number, y: number, cx: number, cy: number): string {
  return (
    '<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:a14="http://schemas.microsoft.com/office/drawing/2010/main">' +
    `<mc:Choice Requires="a14">${sp(id, name, x, y, cx, cy, '<p:txBody><a:p><a14:m/></a:p></p:txBody>')}</mc:Choice>` +
    `<mc:Fallback>${sp(id, name, x, y, cx, cy)}</mc:Fallback>` +
    '</mc:AlternateContent>'
  );
}

describe('grpSp grouping (SPEC 8.2)', () => {
  const slide =
    '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
    sp(2, 'ts:s#h', 1000, 1000, 500, 100) +
    sp(3, 'ts:s#rule/0@list/row/0', 1000, 2000, 5000, 0) +
    sp(4, 'ts:s#list/items/0/key@list/row/0', 1000, 1500, 1800, 400) +
    sp(5, 'ts:s#list/items/0/value@list/row/0', 3000, 1500, 3000, 400) +
    sp(6, 'ts:s#rule/1@list/row/1', 1000, 3000, 5000, 0) +
    '</p:spTree>';

  test('lists shapes with ids, names, kinds and boxes', () => {
    const shapes = listShapes(slide);
    expect(shapes.map((s) => s.id)).toEqual([2, 3, 4, 5, 6]);
    expect(shapes[1]?.name).toBe('ts:s#rule/0@list/row/0');
    expect(shapes[1]?.ext).toEqual([5000, 0]);
    expect(shapes.every((s) => s.kind === 'sp')).toBe(true);
    expect(groupKeysOf('ts:s#a@g:four@list/row/0')).toEqual(['g:four', 'list/row/0']);
    expect(groupKeyOf('ts:s#a@g:four@list/row/0')).toBe('list/row/0');
    expect(groupKeyOf('ts:s#a')).toBeUndefined();
  });

  test('wraps the shapes of a row in one group with the union xfrm and its own id; a lone key stays', () => {
    const { xml, groups } = groupShapes(slide);
    expect(groups).toEqual([{ key: 'list/row/0', id: 7, ids: [3, 4, 5], depth: 0 }]);
    expect(countGroups(xml)).toBe(1);
    expect(xml).toContain('<p:cNvPr id="7" name="list/row/0"/>');
    expect(xml).toContain(
      '<a:off x="1000" y="1500"/><a:ext cx="5000" cy="500"/><a:chOff x="1000" y="1500"/><a:chExt cx="5000" cy="500"/>',
    );
    // the ungrouped shapes keep their order around the group
    expect(xml.indexOf('name="ts:s#h"')).toBeLessThan(xml.indexOf('<p:grpSp>'));
    expect(xml.indexOf('</p:grpSp>')).toBeLessThan(xml.indexOf('name="ts:s#rule/1@list/row/1"'));
    expect(listShapes(xml).length).toBe(5);
  });

  test('nests a row group inside a user group and groups tables, charts and connectors (SPEC-2 2.1.3, 0.67)', () => {
    const part =
      '<p:spTree>' +
      sp(2, 'ts:s#a@g:four', 0, 0, 100, 100) +
      sp(3, 'ts:s#list/items/0/key@g:four@list/row/0', 0, 200, 100, 50) +
      sp(4, 'ts:s#list/items/0/value@g:four@list/row/0', 100, 200, 100, 50) +
      frame(5, 'ts:s#table@g:four') +
      cxn(6, 'ts:s#link@g:four') +
      sp(7, 'ts:s#alone@g:solo', 900, 900, 10, 10) +
      '</p:spTree>';
    const { xml, groups } = groupShapes(part);
    // the outer group first, the nested row group inside it, the lone key ungrouped
    expect(groups.map((g) => [g.key, g.depth])).toEqual([
      ['g:four', 0],
      ['list/row/0', 1],
    ]);
    expect(groups[0]?.ids).toEqual([2, 3, 4, 5, 6]);
    // the group ids continue after the highest shape id, the outer group first
    expect(groups.map((g) => g.id)).toEqual([8, 9]);
    expect(xml).toContain('<p:cNvPr id="8" name="g:four"/>');
    expect(xml).toContain('<p:cNvPr id="9" name="list/row/0"/>');
    expect(countGroups(xml)).toBe(2);
    const outer = xml.indexOf('name="g:four"');
    const inner = xml.indexOf('name="list/row/0"');
    expect(outer).toBeGreaterThan(-1);
    expect(inner).toBeGreaterThan(outer);
    // the graphicFrame and the connector sit inside the outer group; the lone shape stays
    expect(xml.indexOf('name="ts:s#table@g:four"')).toBeGreaterThan(outer);
    expect(xml.indexOf('name="ts:s#link@g:four"')).toBeGreaterThan(outer);
    expect(xml.lastIndexOf('name="ts:s#alone@g:solo"')).toBeGreaterThan(
      xml.lastIndexOf('</p:grpSp>'),
    );
    expect(listShapes(xml).length).toBe(6);
  });
});

describe('mc:AlternateContent as one shape (SPEC-5 0.48, 2.4)', () => {
  const part =
    '<p:spTree>' +
    sp(2, 'ts:s#h@g:pair', 0, 0, 100, 100) +
    alternate(3, 'ts:s#eq@g:pair', 0, 200, 100, 50) +
    alternate(4, 'ts:s#eq2', 500, 500, 100, 50) +
    '</p:spTree>';

  test('lists a wrapped shape once with the Choice’s id, name and box', () => {
    const shapes = listShapes(part);
    expect(shapes.map((s) => [s.id, s.name, s.kind])).toEqual([
      [2, 'ts:s#h@g:pair', 'sp'],
      [3, 'ts:s#eq@g:pair', 'alternateContent'],
      [4, 'ts:s#eq2', 'alternateContent'],
    ]);
    expect(shapes[1]?.off).toEqual([0, 200]);
    expect(shapes[1]?.ext).toEqual([100, 50]);
    // the wrapper's xml is the whole element, Choice and Fallback included
    expect(shapes[1]?.xml.startsWith('<mc:AlternateContent')).toBe(true);
    expect(shapes[1]?.xml.endsWith('</mc:AlternateContent>')).toBe(true);
  });

  test('groups a wrapped shape with its neighbours and keeps the wrapper whole inside the grpSp', () => {
    const { xml, groups } = groupShapes(part);
    expect(groups).toEqual([{ key: 'g:pair', id: 5, ids: [2, 3], depth: 0 }]);
    expect(countGroups(xml)).toBe(1);
    const open = xml.indexOf('<p:grpSp>');
    const close = xml.indexOf('</p:grpSp>');
    const wrapped = xml.indexOf('<mc:AlternateContent');
    expect(wrapped).toBeGreaterThan(open);
    expect(wrapped).toBeLessThan(close);
    expect(xml.indexOf('</mc:AlternateContent>')).toBeLessThan(close);
    // the union box covers the heading and the equation's Choice box
    expect(xml).toContain('<a:off x="0" y="0"/><a:ext cx="100" cy="250"/>');
    // the unkeyed wrapper stays after the group, whole
    expect(xml.lastIndexOf('name="ts:s#eq2"')).toBeGreaterThan(close);
    expect((xml.match(/<mc:AlternateContent/g) ?? []).length).toBe(2);
    expect(listShapes(xml).map((s) => s.id)).toEqual([2, 3, 4]);
  });
});
