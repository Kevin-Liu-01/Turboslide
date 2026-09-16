// Nesting by the group path (gslides-parity SPEC-5 0.48; MILESTONES-5 B3 day 6): a `@g:outer/inner`
// object name reads as two keys, so the members of the inner path sit in a grpSp inside the outer
// group's grpSp beside the members of the outer path alone; a flat tag is one key as before; a row
// group after the path nests a third level.
import { describe, expect, test } from 'vitest';

import { countGroups, expandGroupPath, groupKeysOf, groupShapes, listShapes } from './groups.ts';

function sp(id: number, name: string, x: number, y: number, cx: number, cy: number): string {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm></p:spPr></p:sp>`;
}

const HEAD =
  '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>';
const TAIL = '</p:spTree>';

describe('group path keys', () => {
  test('a path expands to one key per level, the outermost first; flat tags and other keys stay one', () => {
    expect(expandGroupPath('g:card')).toEqual(['g:card']);
    expect(expandGroupPath('g:card/row')).toEqual(['g:card', 'g:card/row']);
    expect(expandGroupPath('g:a/b/c')).toEqual(['g:a', 'g:a/b', 'g:a/b/c']);
    expect(expandGroupPath('rows/row/0')).toEqual(['rows/row/0']);
    expect(groupKeysOf('ts:s#b@g:card/row@rows/row/0')).toEqual([
      'g:card',
      'g:card/row',
      'rows/row/0',
    ]);
    expect(groupKeysOf('ts:s#b')).toEqual([]);
  });
});

describe('two level nesting (SPEC-5 0.48)', () => {
  const xml =
    HEAD +
    sp(2, 'ts:s#a@g:card/row', 0, 0, 100, 50) +
    sp(3, 'ts:s#b@g:card/row', 100, 0, 100, 50) +
    sp(4, 'ts:s#c@g:card', 0, 60, 200, 40) +
    sp(5, 'ts:s#d', 400, 0, 100, 100) +
    TAIL;

  test('writes the outer grpSp holding the inner grpSp and the outer only member', () => {
    const result = groupShapes(xml);
    expect(countGroups(result.xml)).toBe(2);
    expect(result.groups.map((g) => [g.key, g.depth, g.ids])).toEqual([
      ['g:card', 0, [2, 3, 4]],
      ['g:card/row', 1, [2, 3]],
    ]);
    // the outer group's box is the union of every member; the inner group's the union of its two
    const outer =
      /<p:grpSp><p:nvGrpSpPr><p:cNvPr id="(\d+)" name="g:card"\/>[\s\S]*?<a:off x="0" y="0"\/><a:ext cx="200" cy="100"\/>/.exec(
        result.xml,
      );
    expect(outer).not.toBeNull();
    const inner =
      /<p:cNvPr id="(\d+)" name="g:card\/row"\/>[\s\S]*?<a:off x="0" y="0"\/><a:ext cx="200" cy="50"\/>/.exec(
        result.xml,
      );
    expect(inner).not.toBeNull();
    // the inner grpSp opens after the outer one and closes before it
    const outerStart = result.xml.indexOf('name="g:card"');
    const innerStart = result.xml.indexOf('name="g:card/row"');
    expect(innerStart).toBeGreaterThan(outerStart);
    // the ungrouped shape stays at the top level, after the group
    const top = listShapes(result.xml.replace(/<p:grpSp>[\s\S]*<\/p:grpSp>/, ''));
    expect(top.map((s) => s.id)).toEqual([5]);
    // the group ids continue past the largest shape id
    expect(result.groups.map((g) => g.id)).toEqual([6, 7]);
  });

  test('an inner level with one member does not group; the member sits in the outer group', () => {
    const one =
      HEAD +
      sp(2, 'ts:s#a@g:card/row', 0, 0, 100, 50) +
      sp(3, 'ts:s#c@g:card', 0, 60, 200, 40) +
      TAIL;
    const result = groupShapes(one);
    expect(countGroups(result.xml)).toBe(1);
    expect(result.groups.map((g) => [g.key, g.ids])).toEqual([['g:card', [2, 3]]]);
  });

  test('a row group after the path nests as the third level', () => {
    const rows =
      HEAD +
      sp(2, 'ts:s#r/key@g:card/row@r/row/0', 0, 0, 100, 20) +
      sp(3, 'ts:s#r/value@g:card/row@r/row/0', 100, 0, 100, 20) +
      sp(4, 'ts:s#r/key@g:card/row@r/row/1', 0, 20, 100, 20) +
      sp(5, 'ts:s#r/value@g:card/row@r/row/1', 100, 20, 100, 20) +
      sp(6, 'ts:s#c@g:card', 0, 60, 200, 40) +
      TAIL;
    const result = groupShapes(rows);
    expect(countGroups(result.xml)).toBe(4);
    expect(result.groups.map((g) => [g.key, g.depth])).toEqual([
      ['g:card', 0],
      ['g:card/row', 1],
      ['r/row/0', 2],
      ['r/row/1', 2],
    ]);
  });
});
