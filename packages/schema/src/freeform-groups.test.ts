// The selection level of nested groups (gslides-parity SPEC-5 0.48; MILESTONES-5 B3 day 6): the
// first click selects the outermost group, the next click one level in, then the block alone; a
// click on another group's member starts again; the union box follows the level.
import { describe, expect, it } from 'vitest';

import type { Block } from './blocks.ts';
import { groupBoxAtLevel, selectionAtLevel, selectionLevelOnClick } from './freeform.ts';

const blocks: Block[] = [
  { id: 'a', type: 'text', text: 'a', pos: { x: 0, y: 0, w: 100, h: 50, group: 'card/row' } },
  { id: 'b', type: 'text', text: 'b', pos: { x: 100, y: 0, w: 100, h: 50, group: 'card/row' } },
  { id: 'c', type: 'text', text: 'c', pos: { x: 0, y: 60, w: 200, h: 40, group: 'card/title' } },
  { id: 'd', type: 'text', text: 'd', pos: { x: 400, y: 0, w: 100, h: 100, group: 'other' } },
  { id: 'e', type: 'text', text: 'e', pos: { x: 600, y: 0, w: 100, h: 100 } },
];

describe('selectionLevelOnClick (SPEC-5 0.48)', () => {
  it('walks outermost, one level in, then the block alone', () => {
    const first = selectionLevelOnClick('card/row', null);
    expect(first).toEqual({ path: 'card/row', depth: 1 });
    expect(selectionAtLevel(blocks, first!)).toEqual(['a', 'b', 'c']);
    const second = selectionLevelOnClick('card/row', first);
    expect(second).toEqual({ path: 'card/row', depth: 2 });
    expect(selectionAtLevel(blocks, second!)).toEqual(['a', 'b']);
    expect(selectionLevelOnClick('card/row', second)).toBeNull();
  });

  it('starts again on another group and selects an ungrouped block alone', () => {
    const inside = { path: 'card/row', depth: 2 };
    expect(selectionLevelOnClick('other', inside)).toEqual({ path: 'other', depth: 1 });
    expect(selectionLevelOnClick(undefined, inside)).toBeNull();
    // a click on a sibling group at the same outer level stays at level 1 of the outer group
    expect(selectionLevelOnClick('card/title', { path: 'card/row', depth: 1 })).toEqual({
      path: 'card/title',
      depth: 2,
    });
  });

  it('draws the union box of the level', () => {
    expect(groupBoxAtLevel(blocks, { path: 'card/row', depth: 1 })).toEqual([0, 0, 200, 100]);
    expect(groupBoxAtLevel(blocks, { path: 'card/row', depth: 2 })).toEqual([0, 0, 200, 50]);
    expect(groupBoxAtLevel(blocks, { path: 'none', depth: 1 })).toBeNull();
  });
});
