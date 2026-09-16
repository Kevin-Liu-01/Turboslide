// The group path arithmetic of nested groups (gslides-parity SPEC-5 0.48; MILESTONES-5 B3 day 6):
// a path is slugs joined by slashes with the outermost group first; Group on a selection that
// holds a group prepends the new tag, Ungroup drops the outer segment, and the selection level a
// click reaches is one prefix of the path.
import { describe, expect, it } from 'vitest';

import {
  groupDepth,
  groupPathOnGroup,
  groupPrefix,
  groupSegments,
  groupsAtLevel,
  innerGroupPath,
  membersAtLevel,
  outerGroup,
  sharesGroupLevel,
} from './position.ts';

describe('group paths (SPEC-5 0.48)', () => {
  it('prepends the new tag when a grouped member is grouped again, and drops it on ungroup', () => {
    expect(groupPathOnGroup(undefined, 'card')).toBe('card');
    expect(groupPathOnGroup('row', 'card')).toBe('card/row');
    expect(groupPathOnGroup('row/cell', 'card')).toBe('card/row/cell');
    expect(innerGroupPath('card/row/cell')).toBe('row/cell');
    expect(innerGroupPath('card')).toBeUndefined();
    expect(outerGroup('card/row')).toBe('card');
    expect(groupSegments('card/row/cell')).toEqual(['card', 'row', 'cell']);
  });

  it('reads the depth and the prefix at a level', () => {
    expect(groupDepth('a')).toBe(1);
    expect(groupDepth('a/b/c')).toBe(3);
    expect(groupPrefix('a/b/c', 1)).toBe('a');
    expect(groupPrefix('a/b/c', 2)).toBe('a/b');
    expect(groupPrefix('a/b/c', 9)).toBe('a/b/c');
    expect(groupPrefix('a', 0)).toBe('a');
  });

  it('tells members of one level apart from members of another', () => {
    expect(sharesGroupLevel('card/row', 'card/other', 1)).toBe(true);
    expect(sharesGroupLevel('card/row', 'card/other', 2)).toBe(false);
    expect(sharesGroupLevel('card/row', 'card/row', 2)).toBe(true);
    expect(sharesGroupLevel('card', 'card/row', 2)).toBe(false);
    expect(sharesGroupLevel(undefined, 'card', 1)).toBe(false);
  });

  it('selects the members at a level: every block whose prefix agrees, at any depth below', () => {
    const blocks = [
      { id: 'a', pos: { group: 'card/row' } },
      { id: 'b', pos: { group: 'card/row' } },
      { id: 'c', pos: { group: 'card/title' } },
      { id: 'd', pos: { group: 'card' } },
      { id: 'e', pos: { group: 'other/row' } },
      { id: 'f' },
    ];
    expect(membersAtLevel(blocks, 'card/row', 1).map((b) => b.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(membersAtLevel(blocks, 'card/row', 2).map((b) => b.id)).toEqual(['a', 'b']);
    expect(membersAtLevel(blocks, 'other/row', 2).map((b) => b.id)).toEqual(['e']);
    expect(
      groupsAtLevel(
        blocks.map((b) => b.pos?.group),
        1,
      ),
    ).toEqual(['card', 'other']);
    expect(
      groupsAtLevel(
        blocks.map((b) => b.pos?.group),
        2,
      ),
    ).toEqual(['card/row', 'card/title', 'other/row']);
  });
});
