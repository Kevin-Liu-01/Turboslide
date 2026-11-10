import { describe, expect, it } from 'vitest';

import { createEditHistory } from './history.ts';

const set = (value: number) =>
  ({ op: 'block.set', slideId: 's', blockId: 'b', path: '/size', value }) as const;

describe('the edit history', () => {
  it('walks ten edits back as ten inverses in reverse order, then forward again', () => {
    const history = createEditHistory(() => '2026-09-10T00:00:00.000Z');
    for (let i = 1; i <= 10; i += 1) {
      history.push({ mutations: [set(i)], inverse: [set(i - 1)], label: 'block.set' });
    }
    expect(history.entries()).toHaveLength(10);
    const undone: number[] = [];
    while (history.canUndo()) {
      const entry = history.undo();
      if (entry) undone.push((entry.inverse[0] as { value: number }).value);
    }
    expect(undone).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(true);
    const redone = history.redo();
    expect((redone?.mutations[0] as { value: number }).value).toBe(1);
    expect(history.log()).toHaveLength(21);
    expect(history.log()[10]?.kind).toBe('undo');
    expect(history.log()[20]?.kind).toBe('redo');
  });

  it('clears the redo stack on a new edit and undoes to a named entry', () => {
    const history = createEditHistory();
    const first = history.push({ mutations: [set(1)], inverse: [set(0)], label: 'a' });
    history.push({ mutations: [set(2)], inverse: [set(1)], label: 'b' });
    history.push({ mutations: [set(3)], inverse: [set(2)], label: 'c' });
    expect(history.undoTo(first.id).map((entry) => entry.label)).toEqual(['c', 'b', 'a']);
    expect(history.canUndo()).toBe(false);
    history.redo();
    history.push({ mutations: [set(9)], inverse: [set(1)], label: 'd' });
    expect(history.canRedo()).toBe(false);
    expect(history.entries().map((entry) => entry.label)).toEqual(['a', 'd']);
    history.clear();
    expect(history.entries()).toHaveLength(0);
    expect(history.log()).toHaveLength(0);
  });

  it('puts a refused undo back: the stacks and the log read as before the step', () => {
    const history = createEditHistory();
    history.push({ mutations: [set(1)], inverse: [set(0)], label: 'a' });
    history.push({ mutations: [set(2)], inverse: [set(1)], label: 'b' });
    history.push({ mutations: [set(3)], inverse: [set(2)], label: 'c' });
    const entry = history.undo();
    if (entry === undefined) throw new Error('nothing to undo');
    expect(history.canRedo()).toBe(true);
    history.revert('undo', entry);
    expect(history.entries().map((row) => row.label)).toEqual(['a', 'b', 'c']);
    expect(history.canRedo()).toBe(false);
    expect(history.log().map((row) => row.kind)).toEqual(['edit', 'edit', 'edit']);
    // the same step is the next one again
    expect(history.undo()).toBe(entry);
  });

  it('puts a refused redo back, and the entries of a refused undo to, the oldest first', () => {
    const history = createEditHistory();
    const first = history.push({ mutations: [set(1)], inverse: [set(0)], label: 'a' });
    history.push({ mutations: [set(2)], inverse: [set(1)], label: 'b' });
    history.push({ mutations: [set(3)], inverse: [set(2)], label: 'c' });
    const undone = history.undo();
    const redone = history.redo();
    if (undone === undefined || redone === undefined) throw new Error('no step');
    history.revert('redo', redone);
    expect(history.entries().map((row) => row.label)).toEqual(['a', 'b']);
    expect(history.canRedo()).toBe(true);
    history.redo();
    // undo to the first entry takes c, b, a; c was undone, b was refused and a never ran
    const taken = history.undoTo(first.id);
    expect(taken.map((row) => row.label)).toEqual(['c', 'b', 'a']);
    for (const put of [taken[2], taken[1]]) if (put !== undefined) history.revert('undo', put);
    expect(history.entries().map((row) => row.label)).toEqual(['a', 'b']);
    expect(history.canRedo()).toBe(true);
    expect(history.redo()?.label).toBe('c');
  });

  it('moves nothing when the entry is not on top of the stack the step moved it to', () => {
    const history = createEditHistory();
    history.push({ mutations: [set(1)], inverse: [set(0)], label: 'a' });
    history.push({ mutations: [set(2)], inverse: [set(1)], label: 'b' });
    const b = history.undo();
    const a = history.undo();
    if (a === undefined || b === undefined) throw new Error('no step');
    history.revert('undo', b);
    expect(history.entries()).toHaveLength(0);
    expect(history.log()).toHaveLength(4);
  });
});
