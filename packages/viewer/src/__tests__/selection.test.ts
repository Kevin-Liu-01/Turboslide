import { describe, expect, it } from 'vitest';

import type { Slide } from '@turboslide/schema/deck';

import {
  blockTypeOf,
  chipLabel,
  cycleSelection,
  escapeSelection,
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
