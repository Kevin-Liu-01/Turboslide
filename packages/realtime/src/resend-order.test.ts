import { describe, expect, it } from 'vitest';

import type { Mutation } from '@turboslide/schema/mutations';

import type { Entry } from './channel.ts';
import { landedOf, landedOwn, landedPastAnswered, transformEntry } from './room-core.ts';
import type { OpsPost } from './protocol.ts';

// The rows of an entry the log answers leave what landed (RELIABILITY-2, F1; hardening HR-RT#2).
// A resent POST's first entry is answered from the log; its second entry was written on top of
// it, so it meets the other writers' rows as they stand after the first, and never the first
// entry's own rows (docs/gslides-parity/realtime/build/word-fix.md F1).

const splice = (at: number, insert: string): Mutation => ({
  op: 'text.splice',
  slideId: 'content-rule',
  blockId: 'p1',
  path: '/text',
  at,
  remove: 0,
  insert,
});

function logEntry(seq: number, clientId: string, opId: string, mutations: Mutation[]): Entry {
  return {
    seq,
    rev: 0,
    kind: 'edit',
    author: { kind: 'human', name: clientId },
    clientId,
    opId,
    mutations,
    at: '2026-10-11T10:00:00.000Z',
  };
}

const POST: OpsPost = {
  clientId: 'a'.repeat(32),
  base: { seq: 0 },
  entries: [],
} as unknown as OpsPost;

describe('landedPastAnswered', () => {
  it("takes the answered entry's rows out and moves the rows before it past the entry as its client wrote it", () => {
    // B's " tb" landed at 0 as seq 1; A's " t" at 0 was admitted after it as seq 2, at 3
    const landed = [
      logEntry(1, 'b'.repeat(32), 'b:1', [splice(0, ' tb')]),
      logEntry(2, POST.clientId, 'a:1', [splice(3, ' t')]),
      logEntry(3, 'c'.repeat(32), 'c:1', [splice(20, 'x')]),
    ];
    const rows = landedOf(landed, POST);
    expect(rows.map((row) => row.seq)).toEqual([1, 2, 3]);
    const after = landedPastAnswered(rows, { seq: 2, base: 0 }, [splice(0, ' t')]);
    // B's row moved past A's " t" (A is right of B in the log: B stays at 0), C's row kept as is
    expect(after.map((row) => [row.seq, row.mutation])).toEqual([
      [1, splice(0, ' tb')],
      [3, splice(20, 'x')],
    ]);
    // A's "a1", written after its own " t" (a run), lands after B's word and its own letters
    expect(transformEntry([splice(2, 'a1')], after, true)).toEqual([splice(5, 'a1')]);
    // before the fix the rows still held A's own " t": "a1" was pushed two past its place
    expect(transformEntry([splice(2, 'a1')], rows, true)).toEqual([splice(7, 'a1')]);
  });

  it('changes nothing for an entry at or under the base, whose rows are not among what landed', () => {
    const rows = landedOf([logEntry(5, 'b'.repeat(32), 'b:1', [splice(0, 'x')])], POST);
    expect(landedPastAnswered(rows, { seq: 3, base: 4 }, [splice(0, 'q')])).toEqual(rows);
  });

  it('moves the rows before one record past every entry it answers, in the order of the POST', () => {
    // one blob tier record (seq 9) answers A's two entries " t" and "a1"; B's row landed before it
    const landed = [
      logEntry(8, 'b'.repeat(32), 'store:8', [splice(0, ' tb')]),
      logEntry(9, POST.clientId, 'store:9', [splice(3, ' ta1')]),
    ];
    let rows = landedOf(landed, POST);
    rows = landedPastAnswered(rows, { seq: 9, base: 7 }, [splice(0, ' t')], false);
    rows = landedPastAnswered(rows, { seq: 9, base: 7 }, [splice(2, 'a1')], true);
    expect(rows.map((row) => [row.seq, row.mutation])).toEqual([[8, splice(0, ' tb')]]);
    expect(transformEntry([splice(4, '2')], rows, true)).toEqual([splice(7, '2')]);
  });

  it("keeps the POST's own undo rows, which carry no seq, after the moved rows", () => {
    const rows = [
      ...landedOf([logEntry(1, 'b'.repeat(32), 'b:1', [splice(0, 'bb')])], POST),
      ...landedOf([logEntry(2, POST.clientId, 'a:1', [splice(2, 'a')])], POST),
      ...landedOwn([splice(9, 'zz')]),
    ];
    const after = landedPastAnswered(rows, { seq: 2, base: 0 }, [splice(0, 'a')]);
    expect(after.map((row) => [row.seq, row.own])).toEqual([
      [1, undefined],
      [undefined, true],
    ]);
  });
});
