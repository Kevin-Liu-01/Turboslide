import { describe, expect, it } from 'vitest';

import type { Mutation } from '@turboslide/schema/mutations';

import { stepBursts } from './undo-bursts';
import type { Burst } from './undo-bursts';

const splice = (at: number, insert: string): Mutation => ({
  op: 'text.splice',
  slideId: 'content-rule',
  blockId: 'p1',
  path: '/text',
  at,
  remove: 0,
  insert,
});

/** A transform that records the clock it was asked from and marks each splice with it. */
function recorder(): {
  calls: number[];
  transformSince: (mutations: Mutation[], at: number) => Mutation[];
} {
  const calls: number[] = [];
  return {
    calls,
    transformSince: (mutations, at) => {
      calls.push(at);
      return mutations.map((m) => (m.op === 'text.splice' ? { ...m, at: m.at + at * 100 } : m));
    },
  };
}

const bursts: Burst[] = [
  { at: 1, forward: 1, inverse: 1 },
  { at: 2, forward: 1, inverse: 1 },
  { at: 3, forward: 2, inverse: 2 },
];

describe('stepBursts (the undo of a typing group, burst by burst; s2.md S2-R3)', () => {
  it('transforms each inverse segment from its own clock, newest burst first as the entry holds them', () => {
    const r = recorder();
    // group.inverse.unshift(...) put burst 3 first, then 2, then 1
    const inverse = [splice(4, 'c'), splice(3, 'c'), splice(2, 'b'), splice(1, 'a')];
    const out = stepBursts(bursts, inverse, 'inverse', r.transformSince);
    expect(r.calls).toEqual([3, 2, 1]);
    expect(out.map((m) => (m.op === 'text.splice' ? m.at : -1))).toEqual([304, 303, 202, 101]);
  });

  it('transforms each forward segment from its own clock, oldest burst first', () => {
    const r = recorder();
    const forward = [splice(1, 'a'), splice(2, 'b'), splice(3, 'c'), splice(4, 'c')];
    const out = stepBursts(bursts, forward, 'forward', r.transformSince);
    expect(r.calls).toEqual([1, 2, 3]);
    expect(out.map((m) => (m.op === 'text.splice' ? m.at : -1))).toEqual([101, 202, 303, 304]);
  });

  it('falls back to the first burst’s clock over the whole list when the counts do not add up', () => {
    const r = recorder();
    const out = stepBursts(bursts, [splice(1, 'a'), splice(2, 'b')], 'inverse', r.transformSince);
    expect(r.calls).toEqual([1]);
    expect(out).toHaveLength(2);
  });

  it('skips a burst that added nothing on that side and copies the list when no burst is known', () => {
    const r = recorder();
    const out = stepBursts(
      [
        { at: 5, forward: 1, inverse: 0 },
        { at: 6, forward: 1, inverse: 1 },
      ],
      [splice(1, 'x')],
      'inverse',
      r.transformSince,
    );
    expect(r.calls).toEqual([6]);
    expect(out.map((m) => (m.op === 'text.splice' ? m.at : -1))).toEqual([601]);
    const untouched = [splice(1, 'x')];
    const copy = stepBursts([], untouched, 'forward', r.transformSince);
    expect(copy).toEqual(untouched);
    expect(copy).not.toBe(untouched);
  });
});
