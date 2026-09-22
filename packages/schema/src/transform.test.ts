// The text transform (gslides-parity SPEC-3 3.4, 3.5, 16.6; MILESTONES-3 B1 day 3): `shiftRange`
// with the anchor cases of 08 1.2, the op against op transforms case by case, and the property
// test: 10,000 random pairs of concurrent splices, marks and case changes on the fixture Texts
// converge under both orders (applied through the same primitives the reducer uses, and through
// the reducer itself on a document), with every divergence classified. The one accepted class is
// the marks of a character inserted exactly at a paragraph boundary of a concurrently marked
// range (the reducer continues the run there, which offset arithmetic cannot see); the
// interleaving of two authors typing at one offset is shown as documentation.
import { describe, expect, it } from 'vitest';
import { errorStatus } from './errors.ts';
import type { Slide } from './deck.ts';
import type { MarkMutation, Mutation, SpliceMutation, TextOp } from './mutations.ts';
import type { CaseMode, RunFlagKey, RunFlags } from './text.ts';
import {
  CASE_MODES,
  canonicalText,
  caseRange,
  markRange,
  plainLength,
  plainOf,
  runFlags,
  spliceText,
  placeRuns,
  sameRunFlags,
} from './text.ts';
import {
  insertTieSide,
  isTextOp,
  rewritesText,
  sameText,
  shiftRange,
  transformAgainst,
  transformMark,
  transformMarkAgainstMark,
  transformMutation,
  transformSplice,
} from './transform.ts';
import type { Side } from './transform.ts';
import { workedDocument } from './fixtures.ts';
import { UNTITLED_DECK_TITLE, applyMutation, applyMutations, deckTitleSource } from './reduce.ts';
import { validateDocument } from './validate.ts';

const address = { slideId: 'content-rule', blockId: 'p1', path: '/text' } as const;
const splice = (at: number, remove: number, insert: string): SpliceMutation => ({
  op: 'text.splice',
  ...address,
  at,
  remove,
  insert,
});
const mark = (range: [number, number], edit: MarkMutation['edit']): MarkMutation => ({
  op: 'text.mark',
  ...address,
  range,
  edit,
});
const italic: MarkMutation['edit'] = { kind: 'marks', set: { i: true } };

/** A text op applied through the primitives the reducer's cases call (reduce.ts). */
function applyOp(text: string, op: TextOp): string {
  if (op.op === 'text.splice')
    return canonicalText(spliceText(text, op.at, op.remove, op.insert, op.flags));
  const [start, end] = op.range;
  const length = plainLength(text);
  if (start > end || end > length) throw new RangeError(`range ${start}..${end} outside ${length}`);
  return canonicalText(
    op.edit.kind === 'marks'
      ? markRange(text, op.range, op.edit)
      : caseRange(text, op.range, op.edit.mode),
  );
}

function applyAll(text: string, ops: ReadonlyArray<Mutation>): string {
  let out = text;
  for (const op of ops) {
    if (!isTextOp(op)) throw new Error('a text op was expected');
    out = applyOp(out, op);
  }
  return out;
}

/** Both orders of a concurrent pair: A then B', and B then A'. */
function bothOrders(text: string, a: TextOp, b: TextOp): { ab: string; ba: string } {
  const bAfterA = transformMutation(b, a, 'right');
  const aAfterB = transformMutation(a, b, 'left');
  return { ab: applyAll(applyOp(text, a), bAfterA), ba: applyAll(applyOp(text, b), aAfterB) };
}

describe('shiftRange (08 1.2)', () => {
  const range: [number, number] = [10, 20];

  it('moves both ends for an insert at or before the start and grows the range for one inside', () => {
    expect(shiftRange(range, { at: 0, remove: 0, insert: 'abc' })).toEqual([13, 23]);
    expect(shiftRange(range, { at: 10, remove: 0, insert: 'ab' })).toEqual([12, 22]);
    expect(shiftRange(range, { at: 15, remove: 0, insert: 'ab' })).toEqual([10, 22]);
    expect(shiftRange(range, { at: 20, remove: 0, insert: 'ab' })).toEqual([10, 20]);
    expect(shiftRange(range, { at: 30, remove: 0, insert: 'ab' })).toEqual([10, 20]);
  });

  it('shrinks the offsets for a delete before, trims an overlap and collapses a cover', () => {
    expect(shiftRange(range, { at: 0, remove: 4, insert: '' })).toEqual([6, 16]);
    expect(shiftRange(range, { at: 6, remove: 4, insert: '' })).toEqual([6, 16]);
    expect(shiftRange(range, { at: 8, remove: 4, insert: '' })).toEqual([8, 16]);
    expect(shiftRange(range, { at: 12, remove: 4, insert: '' })).toEqual([10, 16]);
    expect(shiftRange(range, { at: 18, remove: 4, insert: '' })).toEqual([10, 18]);
    expect(shiftRange(range, { at: 20, remove: 4, insert: '' })).toEqual([10, 20]);
    expect(shiftRange(range, { at: 8, remove: 14, insert: '' })).toEqual([8, 8]);
    expect(shiftRange(range, { at: 10, remove: 10, insert: '' })).toEqual([10, 10]);
  });

  it('treats a replacement as a delete then an insert', () => {
    expect(shiftRange(range, { at: 2, remove: 4, insert: 'xy' })).toEqual([8, 18]);
    expect(shiftRange(range, { at: 8, remove: 4, insert: 'xyz' })).toEqual([11, 19]);
    expect(shiftRange(range, { at: 12, remove: 2, insert: 'xyz' })).toEqual([10, 21]);
    expect(shiftRange(range, { at: 10, remove: 10, insert: 'new' })).toEqual([13, 13]);
  });
});

describe('transformSplice (SPEC-3 3.5)', () => {
  it('shifts an insertion past a concurrent insertion before it and leaves one after it alone', () => {
    expect(transformSplice(splice(10, 0, 'x'), splice(2, 0, 'abc'), 'right')).toEqual([
      splice(13, 0, 'x'),
    ]);
    expect(transformSplice(splice(2, 0, 'x'), splice(10, 0, 'abc'), 'right')).toEqual([
      splice(2, 0, 'x'),
    ]);
  });

  it('breaks a tie at one offset by side: the earlier arrival stays first', () => {
    expect(transformSplice(splice(5, 0, 'B'), splice(5, 0, 'A'), 'right')).toEqual([
      splice(6, 0, 'B'),
    ]);
    expect(transformSplice(splice(5, 0, 'A'), splice(5, 0, 'B'), 'left')).toEqual([
      splice(5, 0, 'A'),
    ]);
    const text = 'Hello world';
    const a = splice(5, 0, ' A');
    const b = splice(5, 0, ' B');
    const { ab, ba } = bothOrders(text, a, b);
    expect(ab).toBe('Hello A B world');
    expect(ba).toBe(ab);
  });

  it('splits a deletion in two around a concurrent insertion inside it, so the insertion survives', () => {
    // delete "lo wo" [3, 8) while the other inserts "XY" at 5
    const out = transformSplice(splice(3, 5, ''), splice(5, 0, 'XY'), 'right');
    expect(out).toEqual([splice(7, 3, ''), splice(3, 2, '')]);
    const { ab, ba } = bothOrders('Hello world', splice(3, 5, ''), splice(5, 0, 'XY'));
    expect(ab).toBe('HelXYrld');
    expect(ba).toBe(ab);
  });

  it('shrinks a deletion by what a concurrent deletion already removed, and drops a covered one', () => {
    expect(transformSplice(splice(3, 5, ''), splice(5, 2, ''), 'right')).toEqual([
      splice(3, 3, ''),
    ]);
    expect(transformSplice(splice(3, 5, ''), splice(0, 20, ''), 'right')).toEqual([]);
    expect(transformSplice(splice(6, 2, ''), splice(2, 3, ''), 'right')).toEqual([
      splice(3, 2, ''),
    ]);
  });

  it('keeps the text of a covered replacement as an insertion after the other replacement', () => {
    const { ab, ba } = bothOrders('Hello world', splice(2, 3, 'XY'), splice(0, 7, 'Q'));
    expect(ab).toBe('QXYorld');
    expect(ba).toBe(ab);
    expect(transformSplice(splice(2, 3, 'XY'), splice(0, 7, 'Q'), 'right')).toEqual([
      splice(1, 0, 'XY'),
    ]);
  });

  it('attaches the insertion of a straddling replacement to its surviving head piece', () => {
    // replace "llo wo" [2, 8) with "Z" while the other inserts "XY" at 5
    const out = transformSplice(splice(2, 6, 'Z'), splice(5, 0, 'XY'), 'right');
    expect(out).toEqual([splice(7, 3, ''), splice(2, 3, 'Z')]);
    const { ab, ba } = bothOrders('Hello world', splice(2, 6, 'Z'), splice(5, 0, 'XY'));
    expect(ab).toBe('HeZXYrld');
    expect(ba).toBe(ab);
  });
});

describe('transformMark (SPEC-3 3.5)', () => {
  it('shifts a range past an insertion before it and grows it over one inside or at its end', () => {
    expect(transformMark(mark([4, 8], italic), splice(0, 0, 'ab'))).toEqual([
      mark([6, 10], italic),
    ]);
    expect(transformMark(mark([4, 8], italic), splice(4, 0, 'ab'))).toEqual([
      mark([6, 10], italic),
    ]);
    expect(transformMark(mark([4, 8], italic), splice(6, 0, 'ab'))).toEqual([
      mark([4, 10], italic),
    ]);
    expect(transformMark(mark([4, 8], italic), splice(8, 0, 'ab'))).toEqual([
      mark([4, 10], italic),
    ]);
    expect(transformMark(mark([4, 8], italic), splice(9, 0, 'ab'))).toEqual([mark([4, 8], italic)]);
    // at offset 0 the inserted characters continue the run that starts there, the marked one
    expect(transformMark(mark([0, 4], italic), splice(0, 0, 'ab'))).toEqual([mark([0, 6], italic)]);
  });

  it('trims a range by a concurrent deletion and drops one that was removed', () => {
    expect(transformMark(mark([4, 8], italic), splice(2, 3, ''))).toEqual([mark([2, 5], italic)]);
    expect(transformMark(mark([4, 8], italic), splice(0, 10, ''))).toEqual([]);
    expect(transformMark(mark([4, 8], italic), splice(6, 5, ''))).toEqual([mark([4, 6], italic)]);
  });

  it('includes a replacement whose first replaced character sat inside the range', () => {
    // "Hello world": mark [2, 8) while the other replaces "o w" [4, 7) with "XYZ"
    expect(transformMark(mark([2, 8], italic), splice(4, 3, 'XYZ'))).toEqual([
      mark([2, 8], italic),
    ]);
    const { ab, ba } = bothOrders('Hello world', mark([2, 8], italic), splice(4, 3, 'XYZ'));
    expect(ab).toBe('He[llXYZo]{i}rld');
    expect(ba).toBe(ab);
    // a replacement that starts before the range leaves its text outside
    expect(transformMark(mark([4, 8], italic), splice(2, 3, 'XY'))).toEqual([mark([4, 7], italic)]);
  });

  it('splits a case change around a concurrent insertion so the inserted characters keep their case', () => {
    const upper: MarkMutation['edit'] = { kind: 'case', mode: 'upper' };
    expect(transformMark(mark([2, 8], upper), splice(5, 0, 'xy'))).toEqual([
      mark([7, 10], upper),
      mark([2, 5], upper),
    ]);
    const { ab, ba } = bothOrders('Hello world', mark([2, 8], upper), splice(5, 0, 'xy'));
    expect(ab).toBe('HeLLOxy WOrld');
    expect(ba).toBe(ab);
  });
});

describe('transformMarkAgainstMark (SPEC-3 3.5 last writer wins per flag)', () => {
  it('leaves independent flags and disjoint ranges alone', () => {
    const under: MarkMutation['edit'] = { kind: 'marks', set: { u: true } };
    expect(transformMarkAgainstMark(mark([2, 8], italic), mark([4, 6], under), 'left')).toEqual([
      mark([2, 8], italic),
    ]);
    expect(transformMarkAgainstMark(mark([2, 4], italic), mark([4, 6], italic), 'left')).toEqual([
      mark([2, 4], italic),
    ]);
  });

  it('lets the later arrival win a flag over the overlap and keeps the earlier one elsewhere', () => {
    const red: MarkMutation['edit'] = { kind: 'marks', set: { color: 'red' } };
    const blue: MarkMutation['edit'] = { kind: 'marks', set: { color: 'blue' } };
    expect(transformMarkAgainstMark(mark([2, 8], red), mark([4, 10], blue), 'right')).toEqual([
      mark([2, 8], red),
    ]);
    expect(transformMarkAgainstMark(mark([2, 8], red), mark([4, 10], blue), 'left')).toEqual([
      mark([2, 4], red),
    ]);
    // a pinned insertion inside a mark keeps its own flags, so the mark splits around it
    const pinned: SpliceMutation = { ...splice(5, 0, 'xy'), flags: { u: true } };
    expect(transformMark(mark([2, 8], italic), pinned)).toEqual([
      mark([7, 10], italic),
      mark([2, 5], italic),
    ]);
    const orders = bothOrders('Hello world', mark([2, 8], italic), pinned);
    expect(orders.ab).toBe('He[llo]{i}[xy]{u}[ wo]{i}rld');
    expect(orders.ba).toBe(orders.ab);
    const { ab, ba } = bothOrders('Hello world', mark([2, 8], red), mark([4, 10], blue));
    expect(ab).toBe('He[ll]{c:red}[o worl]{c:blue}d');
    expect(ba).toBe(ab);
  });

  it('treats a set against a clear, sup against sub and two case modes as conflicts', () => {
    const clearI: MarkMutation['edit'] = { kind: 'marks', clear: ['i'] };
    expect(transformMarkAgainstMark(mark([0, 5], italic), mark([0, 5], clearI), 'left')).toEqual(
      [],
    );
    const both: MarkMutation['edit'] = { kind: 'marks', set: { i: true, sup: true } };
    const sub: MarkMutation['edit'] = { kind: 'marks', set: { sub: true } };
    expect(transformMarkAgainstMark(mark([0, 5], both), mark([0, 5], sub), 'left')).toEqual([
      mark([0, 5], { kind: 'marks', set: { i: true } }),
    ]);
    const upper: MarkMutation['edit'] = { kind: 'case', mode: 'upper' };
    const lower: MarkMutation['edit'] = { kind: 'case', mode: 'lower' };
    expect(transformMarkAgainstMark(mark([0, 8], upper), mark([4, 11], lower), 'left')).toEqual([
      mark([0, 4], upper),
    ]);
    const { ab, ba } = bothOrders('Hello world', mark([0, 8], upper), mark([4, 11], lower));
    expect(ab).toBe('HELLo world');
    expect(ba).toBe(ab);
  });
});

describe('transformMutation and transformAgainst', () => {
  it('pass every other mutation through unchanged, and a text op through an unrelated one', () => {
    const removal: Mutation = { op: 'slide.remove', slideId: 'other' };
    expect(transformMutation(removal, splice(0, 0, 'a'), 'right')).toEqual([removal]);
    expect(transformMutation(splice(0, 0, 'a'), removal, 'right')).toEqual([splice(0, 0, 'a')]);
    const other = { ...splice(0, 0, 'zz'), path: '/caption' };
    expect(transformMutation(splice(3, 0, 'a'), other, 'right')).toEqual([splice(3, 0, 'a')]);
  });

  it('ties two inserts at one offset by the two client ids, the lower id keeping the left, the same from either end (the sync round fix round, F3)', () => {
    const a = '0a1b2c3d4e5f60718293a4b5c6d7e8f9';
    const b = 'f9e8d7c6b5a493827160f5e4d3c2b1a0';
    expect(insertTieSide(a, b)).toBe('left');
    expect(insertTieSide(b, a)).toBe('right');
    expect(insertTieSide(a, a)).toBe('right');
    // a record without an origin travels as `store`; every client id sorts before it
    expect(insertTieSide(a, 'store')).toBe('left');
    // the fourth argument is the inserts' tie; marks keep the third (server order)
    expect(transformMutation(splice(5, 0, 'B'), splice(5, 0, 'A'), 'right', 'left')).toEqual([
      splice(5, 0, 'B'),
    ]);
    expect(transformMutation(splice(5, 0, 'B'), splice(5, 0, 'A'), 'right')).toEqual([
      splice(6, 0, 'B'),
    ]);
    const bold: MarkMutation['edit'] = { kind: 'marks', set: { b: true } };
    const clear: MarkMutation['edit'] = { kind: 'marks', clear: ['b'] };
    // the later mark still wins the flag over the overlap whatever the inserts' tie says
    expect(transformMutation(mark([0, 3], bold), mark([0, 3], clear), 'right', 'left')).toEqual([
      mark([0, 3], bold),
    ]);
    // the two ends agree: the server transforms A's incoming insert against B's landed one
    // with tie(A, B), A's client its pending insert against B's remote one with tie(A, B)
    const text = 'Hello world';
    for (const [me, them] of [
      [a, b],
      [b, a],
    ] as const) {
      const mine = splice(5, 0, ' mine');
      const theirs = splice(5, 0, ' theirs');
      const server = transformMutation(mine, theirs, 'right', insertTieSide(me, them));
      const client = transformMutation(mine, theirs, 'right', insertTieSide(me, them));
      expect(client).toEqual(server);
      expect(applyAll(applyOp(text, theirs), server)).toBe(
        me < them ? 'Hello mine theirs world' : 'Hello theirs mine world',
      );
    }
  });

  it('returns a text op to its author when a whole Text rewrite landed first', () => {
    const rewrite: Mutation = {
      op: 'text.replace',
      ...address,
      range: [0, 3],
      text: 'New',
    };
    expect(rewritesText(rewrite, splice(1, 0, 'a'))).toBe(true);
    expect(transformMutation(splice(1, 0, 'a'), rewrite, 'right')).toEqual([]);
    const blockSet: Mutation = { op: 'block.set', ...address, path: '/text', value: 'x' };
    expect(transformMutation(mark([0, 1], italic), blockSet, 'right')).toEqual([]);
    const parentSet: Mutation = { op: 'block.set', ...address, path: '/items', value: [] };
    expect(
      transformMutation({ ...splice(0, 0, 'a'), path: '/items/0/text' }, parentSet, 'right'),
    ).toEqual([]);
    const otherBlock: Mutation = { op: 'block.set', ...address, blockId: 'q', path: '/text' };
    expect(transformMutation(splice(1, 0, 'a'), otherBlock, 'right')).toEqual([splice(1, 0, 'a')]);
    const slideReplace: Mutation = {
      op: 'slide.replace',
      slideId: 'content-rule',
      slide: base().slides['content-rule']!,
    };
    expect(transformMutation(splice(1, 0, 'a'), slideReplace, 'right')).toEqual([]);
    expect(transformMutation(splice(1, 0, 'a'), { op: 'version.restore', n: 1 }, 'right')).toEqual(
      [],
    );
  });

  it('folds a history in order as the later arrival, fanning out when a deletion splits', () => {
    const history: Mutation[] = [splice(0, 0, 'AB'), splice(5, 0, 'xy'), splice(1, 1, '')];
    // delete [2, 6) of the base text against: +2 at 0, an insertion inside, one deletion before
    const out = transformAgainst(splice(2, 4, ''), history);
    // after +2 at 0 the deletion is [4, 8); the insertion at 5 splits it into [4, 5) and [7, 10);
    // the deletion of one character at 1 moves both left
    expect(out).toEqual([splice(6, 3, ''), splice(3, 1, '')]);
    const text = 'Hello world';
    const straight = applyAll(applyAll(text, history), out);
    const other = applyAll(applyOp(text, splice(2, 4, '')), [
      ...transformMutation(history[0]!, splice(2, 4, ''), 'left'),
    ]);
    // the first history op (an insertion at 0) transformed against the deletion agrees on the
    // characters both orders keep
    expect(plainOf(straight).startsWith('A')).toBe(true);
    expect(plainOf(other).startsWith('A')).toBe(true);
    expect(transformAgainst(mark([0, 2], italic), [splice(0, 5, '')])).toEqual([]);
  });

  it("transforms a heading splice against another heading splice on both sides, as a block's (docs/SYNC.md 3.4)", () => {
    const heading = { slideId: 'title', blockId: 'heading', path: '/heading' } as const;
    const hs = (at: number, remove: number, insert: string): SpliceMutation => ({
      op: 'text.splice',
      ...heading,
      at,
      remove,
      insert,
    });
    // two people insert a word each at offset 0 of the cover's heading: the later arrival lands
    // after the earlier one on the server, and the earlier one stays first on the later's tab
    const a = hs(0, 0, 'pa1 ');
    const b = hs(0, 0, 'pb1 ');
    expect(transformMutation(b, a, 'right')).toEqual([hs(4, 0, 'pb1 ')]);
    expect(transformMutation(a, b, 'left')).toEqual([hs(0, 0, 'pa1 ')]);
    const text = 'General Translation';
    const { ab, ba } = bothOrders(text, a, b);
    expect(ab).toBe('pa1 pb1 General Translation');
    expect(ba).toBe(ab);
    // a splice on the lead is another Text of the same slide and passes through
    const lead = { ...hs(2, 0, 'x'), blockId: 'lead', path: '/lead' };
    expect(transformMutation(lead, a, 'right')).toEqual([lead]);
    expect(sameText(a, lead)).toBe(false);
  });

  it('reads slide.set of a field as a rewrite of that field alone, and of another slide pointer as the whole slide (docs/SYNC.md 3.4)', () => {
    const heading = { slideId: 'title', blockId: 'heading', path: '/heading' } as const;
    const onHeading: SpliceMutation = {
      op: 'text.splice',
      ...heading,
      at: 0,
      remove: 0,
      insert: 'A',
    };
    const onLead: SpliceMutation = { ...onHeading, blockId: 'lead', path: '/lead' };
    const setHeading: Mutation = {
      op: 'slide.set',
      slideId: 'title',
      path: '/heading',
      value: 'New',
    };
    expect(rewritesText(setHeading, onHeading)).toBe(true);
    expect(rewritesText(setHeading, onLead)).toBe(false);
    expect(transformMutation(onHeading, setHeading, 'right')).toEqual([]);
    expect(transformMutation(onLead, setHeading, 'right')).toEqual([onLead]);
    // a body block's op on a content slide is never a heading field's
    const block: SpliceMutation = { ...splice(1, 0, 'a'), slideId: 'title' };
    expect(rewritesText(setHeading, block)).toBe(false);
    // a block on a content slide whose id happens to be heading, with a block pointer
    const lookalike: SpliceMutation = { ...splice(1, 0, 'a'), blockId: 'heading', path: '/text' };
    expect(rewritesText({ ...setHeading, slideId: 'content-rule' }, lookalike)).toBe(false);
    // another slide pointer keeps the whole slide rule
    const setNotes: Mutation = { op: 'slide.set', slideId: 'title', path: '/notes', value: 'n' };
    expect(rewritesText(setNotes, onHeading)).toBe(true);
    expect(rewritesText(setNotes, onLead)).toBe(true);
    expect(rewritesText({ ...setHeading, slideId: 'other' }, onHeading)).toBe(false);
  });

  it('names the text ops and the Texts they share', () => {
    expect(isTextOp(splice(0, 0, 'a'))).toBe(true);
    expect(isTextOp(mark([0, 1], italic))).toBe(true);
    expect(isTextOp({ op: 'slide.remove', slideId: 'x' })).toBe(false);
    expect(sameText(splice(0, 0, 'a'), mark([0, 1], italic))).toBe(true);
    expect(sameText(splice(0, 0, 'a'), { ...mark([0, 1], italic), path: '/caption' })).toBe(false);
    expect(errorStatus(new RangeError('x'))).toBe(404);
  });
});

// ---------------------------------------------------------------------------------------------
// The property test (SPEC-3 3.4, 16.6): random concurrent pairs converge

/** mulberry32: a small seeded generator so a failing pair is reproducible. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIXTURE_TEXTS: string[] = [
  'Every *post* states [what](https://x.y) was built.',
  'The content rule: one idea per slide, one [claim]{i} per line.\nA second paragraph with *weight* and [colour]{c:red}.',
  'Plain words only, no marks at all here',
  '[Underlined]{u} start, [struck]{s} middle, [both]{i u} end\nGT stays a mark.\nThird.',
  'Numbers 12 and H2O with [sup]{sup} and [sub]{sub} runs, then a [link](https://a.b/c) at the end.',
];

const KEYS: RunFlagKey[] = ['i', 'u', 's', 'sup', 'sub', 'color', 'hl', 'b', 'link'];
const COLORS = ['red', 'blue', 'green', 'ink-2'] as const;
const LETTERS = 'abcdefghijklmnopqrstuvwxyz ABCDEF';

function randomInt(random: () => number, max: number): number {
  return Math.floor(random() * (max + 1));
}

function randomInsert(random: () => number, allowBreak: boolean): string {
  const length = 1 + randomInt(random, 4);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    const roll = random();
    if (allowBreak && roll < 0.08) out += '\n';
    else out += LETTERS.charAt(Math.floor(random() * LETTERS.length));
  }
  return out;
}

function randomFlags(random: () => number): RunFlags {
  const flags: RunFlags = {};
  if (random() < 0.3) flags.i = true;
  if (random() < 0.2) flags.u = true;
  if (random() < 0.15) flags.b = true;
  if (random() < 0.15) flags.color = COLORS[randomInt(random, COLORS.length - 1)]!;
  if (random() < 0.1) flags.link = 'https://x.y/z';
  return flags;
}

function randomEdit(random: () => number): MarkMutation['edit'] {
  if (random() < 0.25) {
    return { kind: 'case', mode: CASE_MODES[randomInt(random, CASE_MODES.length - 1)] as CaseMode };
  }
  const set: RunFlags = {};
  const clear: RunFlagKey[] = [];
  const count = 1 + randomInt(random, 2);
  for (let i = 0; i < count; i += 1) {
    const key = KEYS[randomInt(random, KEYS.length - 1)]!;
    if (random() < 0.3) {
      if (!clear.includes(key)) clear.push(key);
      continue;
    }
    if (key === 'color' || key === 'hl') set[key] = COLORS[randomInt(random, COLORS.length - 1)]!;
    else if (key === 'link') set.link = 'https://x.y/z';
    else set[key] = true;
  }
  for (const key of clear) delete set[key];
  return {
    kind: 'marks',
    ...(Object.keys(set).length > 0 ? { set } : {}),
    ...(clear.length > 0 ? { clear } : {}),
  };
}

/** A random op on a Text; `pinned` gives every insertion its flags, as the room client does. */
function randomOp(random: () => number, text: string, pinned: boolean): TextOp {
  const length = plainLength(text);
  if (random() < 0.6) {
    const at = randomInt(random, length);
    const roll = random();
    const remove = roll < 0.4 ? 0 : Math.min(length - at, 1 + randomInt(random, 6));
    const insert = roll > 0.25 || remove === 0 ? randomInsert(random, text.includes('\n')) : '';
    const op = splice(at, remove, insert);
    return pinned && insert !== '' ? { ...op, flags: randomFlags(random) } : op;
  }
  const s = randomInt(random, Math.max(0, length - 1));
  const e = Math.min(length, s + 1 + randomInt(random, 12));
  return mark([s, e], randomEdit(random));
}

/** The plain text with one flag list per character, so a difference names its characters. */
function flagsPerChar(text: string): { plain: string; flags: RunFlags[] } {
  const plain = plainOf(text);
  const flags: RunFlags[] = [];
  const placed = placeRuns(text);
  for (let i = 0; i < plain.length; i += 1) {
    const run = placed.find((row) => row.start <= i && i < row.end);
    flags.push(run === undefined ? {} : runFlags(run.run));
  }
  return { plain, flags };
}

type Divergence = { kind: 'characters'; at: number[] } | { kind: 'flags'; at: number[] };

/**
 * The accepted GT class: every differing character spells the GT word, which the parser keeps as
 * one atomic run (text.ts): a range boundary between its two letters marks the whole run, and a
 * link laid over it turns it into plain letters a title case then rewrites, so the order of two
 * concurrent ops that cut through or cover the mark decides what the run keeps.
 */
function isGtAnomaly(ab: string, ba: string, found: Divergence): boolean {
  const spellsGt = (text: string, index: number): boolean => {
    const plain = plainOf(text).toUpperCase();
    return (
      plain.slice(index, index + 2) === 'GT' ||
      plain.slice(Math.max(0, index - 1), index + 1) === 'GT'
    );
  };
  return found.at.length > 0 && found.at.every((i) => spellsGt(ab, i) || spellsGt(ba, i));
}

/**
 * The accepted case class: the two results differ in letter case alone, one op is a title case,
 * and every differing letter sits right after a span the other op inserted or right where it
 * deleted (Title Case reads the character before a word, which the concurrent edit changed).
 */
function isTitleBoundary(a: TextOp, b: TextOp, ab: string, ba: string, found: Divergence): boolean {
  if (found.kind !== 'characters') return false;
  if (plainOf(ab).toLowerCase() !== plainOf(ba).toLowerCase()) return false;
  const [title, edit] =
    a.op === 'text.mark' && a.edit.kind === 'case' && a.edit.mode === 'title' ? [a, b] : [b, a];
  if (title.op !== 'text.mark' || title.edit.kind !== 'case' || title.edit.mode !== 'title')
    return false;
  if (edit.op !== 'text.splice') return false;
  // the differing letters are within one character of the splice's landing span in either result
  const spans = [ab, ba].flatMap((text) => insertedSpans(text, a, b));
  const near = (index: number): boolean =>
    spans.some(([from, to]) => index >= from - 1 && index <= to) ||
    Math.abs(index - edit.at) <= edit.insert.length + 1;
  return found.at.every(near);
}

function divergence(ab: string, ba: string): Divergence | null {
  if (ab === ba) return null;
  const x = flagsPerChar(ab);
  const y = flagsPerChar(ba);
  if (x.plain !== y.plain) {
    const at: number[] = [];
    for (let i = 0; i < Math.max(x.plain.length, y.plain.length); i += 1)
      if (x.plain.charAt(i) !== y.plain.charAt(i)) at.push(i);
    return { kind: 'characters', at };
  }
  const at: number[] = [];
  for (let i = 0; i < x.plain.length; i += 1) {
    if (!sameRunFlags(x.flags[i] ?? {}, y.flags[i] ?? {})) at.push(i);
  }
  return { kind: 'flags', at };
}

/** The characters an op inserted, in the final text: the ones a flag difference may sit on without pinned flags. */
function insertedSpans(text: string, a: TextOp, b: TextOp): [number, number][] {
  const out: [number, number][] = [];
  const bAfterA = transformMutation(b, a, 'right') as TextOp[];
  const pairs: [TextOp, TextOp[]][] = [
    [a, [a]],
    [b, bAfterA],
  ];
  for (const [original, placed] of pairs) {
    if (original.op !== 'text.splice' || original.insert === '') continue;
    for (const row of placed) {
      if (row.op !== 'text.splice' || row.insert === '') continue;
      // an insertion's offset in the final text moves by whatever the other op placed before it
      let at = row.at;
      for (const other of original === a ? bAfterA : []) {
        if (other.op === 'text.splice' && other.at <= at) at += other.insert.length - other.remove;
      }
      out.push([at, at + row.insert.length]);
    }
  }
  void text;
  return out;
}

describe('the convergence property (SPEC-3 3.4, 16.6: 10,000 random pairs)', () => {
  // The three property tests below run 10,000 and 1,000 pairs each; alone they take about three
  // seconds and under a load average above twenty they pass vitest's 5 s default only sometimes
  // (VERIFICATION-2 section 14, VERIFICATION-3 finding 45), so each carries its own budget. The
  // assertions are unchanged.
  const BUDGET = { timeout: 30_000 };
  it(
    'converges exactly under both orders on every fixture Text when insertions carry their flags',
    BUDGET,
    () => {
      const random = rng(20260913);
      const failures: string[] = [];
      const counts = { converged: 0, titleBoundary: 0, gt: 0 };
      for (let i = 0; i < 10_000; i += 1) {
        const text = FIXTURE_TEXTS[i % FIXTURE_TEXTS.length]!;
        const a = randomOp(random, text, true);
        const b = randomOp(random, text, true);
        let ab: string;
        let ba: string;
        try {
          ({ ab, ba } = bothOrders(text, a, b));
        } catch (error) {
          failures.push(
            `pair ${i} threw ${error instanceof Error ? error.message : String(error)}: ${JSON.stringify([a, b])}`,
          );
          continue;
        }
        if (ab === ba) {
          counts.converged += 1;
          continue;
        }
        const found = divergence(ab, ba);
        if (found !== null && isTitleBoundary(a, b, ab, ba, found)) {
          counts.titleBoundary += 1;
          continue;
        }
        if (found !== null && isGtAnomaly(ab, ba, found)) {
          counts.gt += 1;
          continue;
        }
        failures.push(
          `pair ${i} on ${JSON.stringify(text)}: ${JSON.stringify([a, b])} gave\n  ${ab}\n  ${ba}`,
        );
      }
      expect(failures.slice(0, 8), `${failures.length} divergent pairs`).toEqual([]);
      expect(counts.converged + counts.titleBoundary + counts.gt).toBe(10_000);
      // Title Case beside a concurrent insertion and a boundary inside the GT mark are the two
      // accepted classes with pinned flags; both stay rare
      expect(counts.titleBoundary).toBeLessThan(60);
      expect(counts.gt).toBeLessThan(30);
    },
  );

  it(
    'converges on the characters without pinned flags; a flag difference sits on inserted characters only',
    BUDGET,
    () => {
      const random = rng(4242);
      const counts = { converged: 0, inheritedFlags: 0, titleBoundary: 0, gt: 0 };
      const failures: string[] = [];
      for (let i = 0; i < 10_000; i += 1) {
        const text = FIXTURE_TEXTS[i % FIXTURE_TEXTS.length]!;
        const a = randomOp(random, text, false);
        const b = randomOp(random, text, false);
        const { ab, ba } = bothOrders(text, a, b);
        const found = divergence(ab, ba);
        if (found === null) {
          counts.converged += 1;
          continue;
        }
        const spans = found.kind === 'flags' ? insertedSpans(ab, a, b) : [];
        const onInserted =
          found.kind === 'flags' &&
          found.at.every((index) => spans.some(([from, to]) => index >= from && index < to));
        if (onInserted) {
          counts.inheritedFlags += 1;
          continue;
        }
        if (isTitleBoundary(a, b, ab, ba, found)) {
          counts.titleBoundary += 1;
          continue;
        }
        if (isGtAnomaly(ab, ba, found)) {
          counts.gt += 1;
          continue;
        }
        failures.push(
          `pair ${i} on ${JSON.stringify(text)}: ${JSON.stringify([a, b])} gave\n  ${ab}\n  ${ba}`,
        );
      }
      expect(failures.slice(0, 5), `${failures.length} divergent pairs`).toEqual([]);
      expect(counts.converged + counts.inheritedFlags + counts.titleBoundary + counts.gt).toBe(
        10_000,
      );
      expect(counts.gt).toBeLessThan(30);
      // the inherited flags class is the reason the room client pins `flags`; it stays a minority
      expect(counts.inheritedFlags).toBeLessThan(1_500);
    },
  );

  it('agrees with the reducer on a document for 1,000 pairs', BUDGET, () => {
    const random = rng(7);
    const document = base();
    const textOf = (doc: typeof document): string => {
      const slide = doc.slides['content-rule'];
      if (slide === undefined || slide.kind !== 'content') throw new Error('fixture');
      for (const list of Object.values(slide.slots)) {
        const block = list.find((row) => row.id === 'p1');
        if (block !== undefined && 'text' in block && typeof block.text === 'string')
          return block.text;
      }
      throw new Error('fixture: no p1 text on content-rule');
    };
    const text = textOf(document);
    for (let i = 0; i < 1_000; i += 1) {
      const a = randomOp(random, text, i % 2 === 0);
      const b = randomOp(random, text, i % 2 === 0);
      const viaPrimitives = bothOrders(text, a, b);
      const run = (ops: Mutation[]): string => {
        const doc = structuredClone(document);
        for (const op of ops) applyMutation(doc, op);
        return textOf(doc);
      };
      const ab = run([a, ...transformMutation(b, a, 'right')]);
      const ba = run([b, ...transformMutation(a, b, 'left')]);
      expect(ab).toBe(viaPrimitives.ab);
      expect(ba).toBe(viaPrimitives.ba);
    }
  });

  /**
   * Two authors typing at one offset, one character per op, the server admitting alternately
   * (02 E17). Each client keeps its pending ops, transforms an incoming admitted op forward
   * through them (the opposite side each time, so a later pending op meets the incoming in its
   * own frame) and its pending ops against the incoming, the room client's rule (SPEC-3 3.6);
   * the server transforms an incoming op against everything since the client's base. A POST's
   * answer carries what landed under the admitted entry (`between`) and the entry itself, and
   * the client drains both at once (room-client.ts `take`), so its base moves past its own
   * commit before its next POST: the model receives after every POST. `tie` gives the side of
   * an author's insert against another's at one offset, from the two ids.
   */
  const twoAuthorsAtOneOffset = (
    ids: [string, string],
    tie: (opClientId: string, againstClientId: string) => Side,
  ): { server: string; clients: string[] } => {
    type Client = { text: string; pending: TextOp[]; seen: number; cursor: number };
    const clients: Client[] = [
      { text: 'Hello world', pending: [], seen: 0, cursor: 5 },
      { text: 'Hello world', pending: [], seen: 0, cursor: 5 },
    ];
    const history: { op: TextOp; author: number }[] = [];
    let server = 'Hello world';
    const type = (who: number, ch: string): void => {
      const client = clients[who]!;
      const op = splice(client.cursor, 0, ch);
      client.text = applyOp(client.text, op);
      client.cursor += 1;
      client.pending.push(op);
      // the server admits it: transformed against everything since the client's last sync
      let landed: Mutation[] = [op];
      for (const entry of history.slice(client.seen)) {
        if (entry.author === who) continue;
        landed = landed.flatMap((row) =>
          transformMutation(row, entry.op, 'right', tie(ids[who]!, ids[entry.author]!)),
        );
      }
      for (const row of landed as TextOp[]) {
        server = applyOp(server, row);
        history.push({ op: row, author: who });
      }
    };
    const receive = (who: number): void => {
      const client = clients[who]!;
      for (const entry of history.slice(client.seen)) {
        if (entry.author === who) {
          client.pending.shift();
        } else {
          const mine = tie(ids[who]!, ids[entry.author]!);
          const theirs: Side = mine === 'left' ? 'right' : 'left';
          let incoming: Mutation[] = [entry.op];
          const nextPending: TextOp[] = [];
          for (const pending of client.pending) {
            const moved = incoming.flatMap((row) => transformMutation(pending, row, 'right', mine));
            nextPending.push(...(moved as TextOp[]));
            incoming = incoming.flatMap((row) => transformMutation(row, pending, 'left', theirs));
          }
          for (const row of incoming as TextOp[]) {
            client.text = applyOp(client.text, row);
            if (row.op !== 'text.splice') continue;
            if (
              row.at < client.cursor ||
              (row.at === client.cursor && (client.pending.length === 0 || mine === 'right'))
            )
              client.cursor += row.insert.length - row.remove;
          }
          client.pending = nextPending;
        }
        client.seen += 1;
      }
    };
    // typing order a, x, b, y, c, z; each POST's answer brings its author up to its own commit
    const typed: [number, string][] = [
      [0, 'a'],
      [1, 'x'],
      [0, 'b'],
      [1, 'y'],
      [0, 'c'],
      [1, 'z'],
    ];
    for (const [who, ch] of typed) {
      type(who, ch);
      receive(who);
    }
    receive(0);
    receive(1);
    return { server: plainOf(server), clients: clients.map((client) => plainOf(client.text)) };
  };
  const A = '0a1b2c3d4e5f60718293a4b5c6d7e8f9';
  const B = 'f9e8d7c6b5a493827160f5e4d3c2b1a0';

  it('documents what server order alone does at one offset: every client converges and the two words interleave (02 E17)', () => {
    const { server, clients } = twoAuthorsAtOneOffset([A, B], () => 'right');
    expect(clients[0]).toBe(server);
    expect(clients[1]).toBe(server);
    expect(server.startsWith('Hello')).toBe(true);
    expect(server.endsWith(' world')).toBe(true);
    expect([...server.slice(5, 11)].sort().join('')).toBe('abcxyz');
    // the anomaly the tie below closes: neither author's word survives whole
    expect(server.includes('abc') && server.includes('xyz')).toBe(false);
    // the same six characters as two whole words converge without interleaving
    const { ab, ba } = bothOrders('Hello world', splice(5, 0, 'abc'), splice(5, 0, 'xyz'));
    expect(ab).toBe('Helloabcxyz world');
    expect(ba).toBe(ab);
  });

  it('keeps both words whole under the tie by client id, whichever id sorts first (the sync round fix round, F3)', () => {
    for (const ids of [
      [A, B],
      [B, A],
    ] as [string, string][]) {
      const { server, clients } = twoAuthorsAtOneOffset(ids, insertTieSide);
      expect(clients[0]).toBe(server);
      expect(clients[1]).toBe(server);
      // the lower id's word stands first, and each author's stream of inserts is contiguous
      expect(server).toBe(ids[0] < ids[1] ? 'Helloabcxyz world' : 'Helloxyzabc world');
    }
  });

  it('replays the ordering probe’s split word and reads it whole under the tie (sync-p1-ordering-local.json, title round 1)', () => {
    // the wire on 4419: B at 134 insert " p" (revision 33); A at 134 insert " pa1", written at
    // base 32 and moved past B's; B's "b1" pending at 136, the end of B's own " p", when A's
    // insert lands there. By server order alone each author yields at the same offset in turn
    // and the text reads "p pa1b1" in both browsers; by the two ids both words stay whole.
    const text = 'x'.repeat(134);
    for (const [aId, bId] of [
      [A, B],
      [B, A],
    ] as [string, string][]) {
      const bFirst = splice(134, 0, ' p');
      const afterB = applyOp(text, bFirst);
      // A's insert, at the server and on A's client: the same tie from either end
      const aMoved = transformMutation(
        splice(134, 0, ' pa1'),
        bFirst,
        'right',
        insertTieSide(aId, bId),
      );
      const afterA = applyAll(afterB, aMoved);
      // B's continuation, pending at the end of its own " p", meets A's insert at that offset
      const bNext = splice(136, 0, 'b1');
      const bMoved = aMoved.flatMap((row) =>
        transformMutation(bNext, row, 'right', insertTieSide(bId, aId)),
      );
      const final = applyAll(afterA, bMoved);
      expect(final.includes(' pa1')).toBe(true);
      expect(final.includes(' pb1')).toBe(true);
      expect(final.slice(134)).toBe(aId < bId ? ' pa1 pb1' : ' pb1 pa1');
    }
    // and by server order alone, what the probe read
    const bFirst = splice(134, 0, ' p');
    const aMoved = transformMutation(splice(134, 0, ' pa1'), bFirst, 'right');
    const bMoved = aMoved.flatMap((row) => transformMutation(splice(136, 0, 'b1'), row, 'right'));
    expect(applyAll(applyAll(applyOp(text, bFirst), aMoved), bMoved).slice(134)).toBe(' p pa1b1');
  });
});

function base() {
  const result = validateDocument(workedDocument());
  if (!result.ok || result.deck === null) throw new Error('fixture');
  return { deck: result.deck, slides: result.slides };
}

describe('the deck title follows the cover heading in the reducer (the sync round, docs/SYNC.md 3.4)', () => {
  const heading = { slideId: 'title', blockId: 'heading', path: '/heading' } as const;
  const hs = (at: number, remove: number, insert: string): SpliceMutation => ({
    op: 'text.splice',
    ...heading,
    at,
    remove,
    insert,
  });
  const rename = (value: string): Mutation => ({ op: 'deck.set', path: '/title', value });
  /** The worked deck with the given title; its first title slide reads "General Translation". */
  const deckTitled = (title: string) => {
    const document = base();
    return { deck: { ...document.deck, title }, slides: document.slides };
  };

  it('moves the title with a splice while the title equals the heading, and names a blank deck from its first burst', () => {
    const following = deckTitled('General Translation');
    const moved = applyMutations(following, [hs(19, 0, ' for Acme')]);
    expect(moved.document.slides['title']).toMatchObject({
      heading: 'General Translation for Acme',
    });
    expect(moved.document.deck.title).toBe('General Translation for Acme');
    // the inverse carries the previous title behind the splice's own inverse, so undo is exact
    expect(moved.inverse).toEqual([hs(19, 9, ''), rename('General Translation')]);
    const back = applyMutations(moved.document, moved.inverse).document;
    expect(back.deck.title).toBe('General Translation');
    expect(back.slides['title']).toMatchObject({ heading: 'General Translation' });
    // a blank deck: the untitled name follows the first characters typed into the cover
    const blank = applyMutations(deckTitled(UNTITLED_DECK_TITLE), [hs(0, 19, 'R')]);
    expect(blank.document.deck.title).toBe('R');
    expect(applyMutations(blank.document, [hs(1, 0, 'enewal')]).document.deck.title).toBe(
      'Renewal',
    );
    // undoing the first burst brings the untitled name back, not a derived one
    expect(applyMutations(blank.document, blank.inverse).document.deck.title).toBe(
      UNTITLED_DECK_TITLE,
    );
  });

  it('leaves the title alone after a deck.set /title made them differ, until a set makes them equal again', () => {
    const renamed = applyMutations(deckTitled('General Translation'), [rename('Acme pitch')]);
    expect(renamed.document.deck.title).toBe('Acme pitch');
    const typed = applyMutations(renamed.document, [hs(19, 0, ' 2027')]);
    expect(typed.document.slides['title']).toMatchObject({ heading: 'General Translation 2027' });
    expect(typed.document.deck.title).toBe('Acme pitch');
    // no title inverse rides a splice that moved no title
    expect(typed.inverse).toEqual([hs(19, 5, '')]);
    // a later set that equals the heading resumes the following
    const equal = applyMutations(typed.document, [rename('General Translation 2027')]);
    expect(applyMutations(equal.document, [hs(24, 0, '!')]).document.deck.title).toBe(
      'General Translation 2027!',
    );
  });

  it('keeps the title on an emptied heading, follows a case change, and ignores the lead and a second title slide', () => {
    const following = deckTitled('General Translation');
    const emptied = applyMutations(following, [hs(0, 19, '')]);
    expect(emptied.document.deck.title).toBe('General Translation');
    const cased = applyMutations(following, [
      { op: 'text.mark', ...heading, range: [0, 19], edit: { kind: 'case', mode: 'upper' } },
    ]);
    expect(cased.document.deck.title).toBe('GENERAL TRANSLATION');
    expect(cased.inverse[cased.inverse.length - 1]).toEqual(rename('General Translation'));
    const lead = applyMutations(following, [
      {
        op: 'text.splice',
        slideId: 'title',
        blockId: 'lead',
        path: '/lead',
        at: 0,
        remove: 0,
        insert: 'X',
      },
    ]);
    expect(lead.document.deck.title).toBe('General Translation');
    // a replace on the heading follows too
    const replaced = applyMutations(following, [
      { op: 'text.replace', ...heading, range: [0, 7], text: 'Global' },
    ]);
    expect(replaced.document.slides['title']).toMatchObject({ heading: 'Global Translation' });
    expect(replaced.document.deck.title).toBe('Global Translation');
    // a second title slide after the first is not the title's source
    const cover = following.slides['title'] as Extract<Slide, { kind: 'title' }>;
    const second = applyMutations(following, [
      {
        op: 'slide.insert',
        sectionId: 'brand',
        after: 'title',
        slide: { ...cover, id: 'title-two', heading: 'General Translation' },
      },
    ]);
    const onSecond = applyMutations(second.document, [{ ...hs(0, 0, 'Z'), slideId: 'title-two' }]);
    expect(onSecond.document.deck.title).toBe('General Translation');
    expect(deckTitleSource(second.document)).toEqual({ slideId: 'title', blockId: 'heading' });
  });
});
