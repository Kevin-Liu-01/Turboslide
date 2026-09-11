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
});
