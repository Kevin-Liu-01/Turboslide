import { describe, expect, it } from 'vitest';

import type { Slide } from '@turboslide/schema/deck';

import {
  allBlockIds,
  blockDisplayName,
  blockFamily,
  blockTypeOf,
  cellPointer,
  chipLabel,
  cycleSelection,
  escapeSelection,
  isTextBlockType,
  listItemPointer,
  parseRunAttr,
  selectedBlockId,
} from '../Selection';

const order = ['h', 'p1', 'list'];

// The selection model of SPEC 6.4: Tab walks blocks in document order, Escape steps back.
describe('cycleSelection', () => {
  it('starts at the first block forward and the last backward', () => {
    expect(cycleSelection(order, null, 1)).toEqual({ kind: 'block', blockId: 'h' });
    expect(cycleSelection(order, null, -1)).toEqual({ kind: 'block', blockId: 'list' });
  });

  it('walks and wraps in both directions', () => {
    expect(cycleSelection(order, { kind: 'block', blockId: 'p1' }, 1)).toEqual({
      kind: 'block',
      blockId: 'list',
    });
    expect(cycleSelection(order, { kind: 'block', blockId: 'list' }, 1)).toEqual({
      kind: 'block',
      blockId: 'h',
    });
    expect(cycleSelection(order, { kind: 'block', blockId: 'h' }, -1)).toEqual({
      kind: 'block',
      blockId: 'list',
    });
  });

  it('cycles from a run selection through its block and returns null with no blocks', () => {
    expect(cycleSelection(order, { kind: 'run', blockId: 'h', pointer: 'text' }, 1)).toEqual({
      kind: 'block',
      blockId: 'p1',
    });
    expect(cycleSelection([], { kind: 'block', blockId: 'h' }, 1)).toBeNull();
  });
});

describe('escapeSelection', () => {
  it('steps from a run to its block to nothing', () => {
    const run = { kind: 'run', blockId: 'list', pointer: 'items/0/key' } as const;
    expect(escapeSelection(run)).toEqual({ kind: 'block', blockId: 'list' });
    expect(escapeSelection({ kind: 'block', blockId: 'list' })).toBeNull();
    expect(escapeSelection(null)).toBeNull();
    expect(selectedBlockId(run)).toBe('list');
  });
});

describe('parseRunAttr', () => {
  it('splits data-run at the first slash into the block id and the pointer', () => {
    expect(parseRunAttr('list/items/0/key')).toEqual({ blockId: 'list', pointer: 'items/0/key' });
    expect(parseRunAttr('h/text')).toEqual({ blockId: 'h', pointer: 'text' });
    expect(parseRunAttr('nothing')).toBeNull();
    expect(parseRunAttr('/text')).toBeNull();
  });
});

describe('chipLabel', () => {
  const content: Slide = {
    schemaVersion: 1,
    id: 'content-rule',
    kind: 'content',
    layout: { type: 'center' },
    slots: { main: [{ id: 'list', type: 'plain', items: [{ text: 'One.' }] }] },
  };
  const title: Slide = {
    schemaVersion: 1,
    id: 'title',
    kind: 'title',
    mark: { w: 138, h: 88 },
    heading: 'Brand',
    lead: 'The deck.',
  };

  it('names type and id with a middle dot', () => {
    expect(chipLabel(content, 'list')).toBe('plain · list');
    expect(blockTypeOf(content, 'missing')).toBeUndefined();
    expect(chipLabel(content, 'missing')).toBe('missing');
  });

  it('names the pseudo blocks of a title slide by the type they render as', () => {
    expect(chipLabel(title, 'heading')).toBe('heading · heading');
    expect(chipLabel(title, 'lead')).toBe('paragraph · lead');
  });
});

// Google's words for the chip and the menu predicates (gslides-parity SPEC 12, 13.7), and the
// pointers the text keys read.
describe('display names and pointers', () => {
  const slide: Slide = {
    schemaVersion: 1,
    id: 's',
    kind: 'content',
    layout: { type: 'center' },
    slots: {
      main: [
        { id: 't', type: 'text', text: 'x' },
        { id: 'img', type: 'shot', asset: '' },
        { id: 'tbl', type: 'table', columns: [{}], rows: [{ cells: [''] }] },
      ],
    },
  };
  const title: Slide = {
    schemaVersion: 1,
    id: 'title',
    kind: 'title',
    mark: { w: 132, h: 84 },
    heading: 'H',
    lead: 'L',
  };

  it("names a block in Google's words, never by its id", () => {
    expect(blockDisplayName(slide, 't')).toBe('Text box');
    expect(blockDisplayName(slide, 'img')).toBe('Image');
    expect(blockDisplayName(slide, 'tbl')).toBe('Table');
    expect(blockDisplayName(title, 'heading')).toBe('Title');
    expect(blockDisplayName(title, 'lead')).toBe('Subtitle');
    expect(blockDisplayName(slide, 'missing')).toBe('Block');
  });

  it("sorts block types into the menu model's families", () => {
    expect(blockFamily('text')).toBe('text');
    expect(blockFamily('shape')).toBe('shape');
    expect(blockFamily('shot')).toBe('image');
    expect(blockFamily('rule')).toBe('line');
    expect(blockFamily('table')).toBe('table');
    expect(blockFamily('dia')).toBe('other');
    expect(isTextBlockType('paragraph')).toBe(true);
    expect(isTextBlockType('shot')).toBe(false);
  });

  it('parses cell and list item pointers and lists the real blocks', () => {
    expect(cellPointer('rows/2/cells/3')).toEqual({ row: 2, col: 3 });
    expect(cellPointer('text')).toBeNull();
    expect(listItemPointer('items/4/text')).toEqual({ index: 4, field: 'text' });
    expect(listItemPointer('items/1')).toEqual({ index: 1, field: null });
    expect(listItemPointer('rows/0/cells/0')).toBeNull();
    expect(allBlockIds(slide)).toEqual(['t', 'img', 'tbl']);
    expect(allBlockIds(title)).toEqual([]);
  });
});
