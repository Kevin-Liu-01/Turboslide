// The version log helpers: the on-disk record schema stays strict, named versions are found by
// note, revisions map to entries, and a broken chain is reported.
import { describe, expect, it } from 'vitest';

import { workedDocument } from '@turboslide/schema/fixtures';

import type { VersionRecord } from './store.ts';
import { touchedSlides } from './store.ts';
import {
  assertContiguous,
  documentAtVersion,
  isNamed,
  lastNamed,
  nextVersionNumber,
  recordAtRevision,
  toVersion,
  versionRecordSchema,
} from './versions.ts';

const author = { kind: 'agent', name: 'agent', runId: 'r' } as const;

function record(n: number, baseRevision: number, revision: number, note = ''): VersionRecord {
  return {
    n,
    revision,
    baseRevision,
    author,
    note,
    createdAt: '2026-09-10T20:00:00.000Z',
    mutations: [],
    inverse: [],
  };
}

describe('version records', () => {
  it('parse strictly and project to a Version', () => {
    const row = record(1, 412, 413, 'first');
    expect(versionRecordSchema.parse(row)).toEqual(row);
    expect(versionRecordSchema.safeParse({ ...row, extra: 1 }).success).toBe(false);
    expect(versionRecordSchema.safeParse({ ...row, inverse: undefined }).success).toBe(false);
    expect(toVersion(row)).not.toHaveProperty('inverse');
    expect(toVersion(row)).not.toHaveProperty('baseRevision');
  });

  it('carry the optional ops range of a checkpoint and refuse a malformed one (SPEC-3 2.1)', () => {
    const row = { ...record(1, 412, 413), ops: { fromSeq: 4100, toSeq: 4140 } };
    expect(versionRecordSchema.parse(row)).toEqual(row);
    expect(versionRecordSchema.safeParse({ ...row, ops: { fromSeq: 5, toSeq: 4 } }).success).toBe(
      false,
    );
    expect(versionRecordSchema.safeParse({ ...row, ops: { fromSeq: 1 } }).success).toBe(false);
    expect(
      versionRecordSchema.safeParse({ ...row, ops: { fromSeq: 1, toSeq: 2, extra: 3 } }).success,
    ).toBe(false);
    expect(versionRecordSchema.safeParse({ ...row, ops: [1, 2] }).success).toBe(false);
    expect(versionRecordSchema.safeParse({ ...row, ops: { fromSeq: -1, toSeq: 2 } }).success).toBe(
      false,
    );
    // a record without the field parses as before the round
    expect(versionRecordSchema.parse(record(1, 412, 413))).not.toHaveProperty('ops');
  });

  it('number from 1, find named versions and revisions', () => {
    const log = [record(1, 412, 413), record(2, 413, 413, 'saved'), record(3, 413, 414)];
    expect(nextVersionNumber([])).toBe(1);
    expect(nextVersionNumber(log)).toBe(4);
    expect(log.map(isNamed)).toEqual([false, true, false]);
    expect(lastNamed(log)?.n).toBe(2);
    expect(lastNamed(log, 413)).toBeUndefined();
    expect(lastNamed(log, 414)?.n).toBe(2);
    expect(recordAtRevision(log, 413)?.n).toBe(2);
    expect(recordAtRevision(log, 414)?.n).toBe(3);
    expect(recordAtRevision(log, 400)).toBeUndefined();
  });

  it('reports a broken chain and a head that is not the current revision', () => {
    const log = [record(1, 412, 413), record(2, 415, 416)];
    expect(() => assertContiguous(log, 416, 0)).toThrow(/breaks between versions 1 .* and 2/);
    expect(() => assertContiguous(log, 416, 1)).not.toThrow();
    expect(() => assertContiguous([record(1, 412, 413)], 414, 0)).toThrow(/ends at revision 413/);
    expect(() => assertContiguous([], 1, 0)).toThrow(/empty/);
  });

  it('returns the current document for version 0 of an empty log', () => {
    const document = workedDocument();
    expect(documentAtVersion(document, [], 0)).toBe(document);
    expect(() => documentAtVersion(document, [], 1)).toThrow(/No version 1/);
    expect(() => documentAtVersion(document, [], -1)).toThrow(RangeError);
  });

  it('names the slides a mutation list touches', () => {
    expect(
      touchedSlides([
        { op: 'block.set', slideId: 'a', blockId: 'b', path: '/x', value: 1 },
        { op: 'slide.remove', slideId: 'c' },
        { op: 'deck.set', path: '/title', value: 't' },
        { op: 'section.set', sections: [] },
      ]),
    ).toEqual(['a', 'c']);
    // an op the switch does not name yet (SPEC-3 3.1's text.splice) still counts by its slideId
    const splice = {
      op: 'text.splice',
      slideId: 'd',
      blockId: 'p1',
      path: '/text',
      at: 0,
      remove: 0,
      insert: 'x',
    } as unknown as Parameters<typeof touchedSlides>[0][number];
    expect(touchedSlides([splice])).toEqual(['d']);
  });
});
