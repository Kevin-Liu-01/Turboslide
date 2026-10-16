import { describe, expect, it } from 'vitest';

import type { VersionRecord } from '@turboslide/store/store';

import { RESYNC_ORIGINS_MAX, resyncReadSince } from './origins';

// The resync read on every tier (RELIABILITY-17; hardening HR-RT#15): the editor loader's answer
// to a resync carries the origins of the records above the tab's old position and `bounded` when
// those records do not reach it. On the stream tiers (memory, redis, do) a tab's position is a
// stream seq and a record's place is the last seq it folded (`ops.toSeq`); on the blob tier both
// are the revision. Before this the read compared every tier's position with the revision, so on
// the do tier, whose seqs run far ahead of the revisions, it named no origin, and it never said
// `bounded` off the blob tier.

const record = (
  revision: number,
  opIds: string[] | null,
  ops?: { fromSeq: number; toSeq: number },
): VersionRecord => ({
  n: revision,
  revision,
  baseRevision: revision - 1,
  author: { kind: 'human', name: 'studio' },
  note: '',
  createdAt: new Date(Date.UTC(2026, 9, 12, 0, 0, revision)).toISOString(),
  mutations: [],
  inverse: [],
  ...(ops === undefined ? {} : { ops }),
  ...(opIds === null ? {} : { origin: { clientId: 'tab-a', opIds } }),
});

// the do tier's log: five checkpoints of an object whose head passed 3,000
const doLog = [
  record(1, ['a:1', 'a:2'], { fromSeq: 1, toSeq: 900 }),
  record(2, ['a:3'], { fromSeq: 901, toSeq: 1800 }),
  // an agent's write through the object folds entries but names no tab's op
  record(3, null, { fromSeq: 1801, toSeq: 2400 }),
  record(4, ['a:4', 'a:5'], { fromSeq: 2401, toSeq: 2950 }),
  // a manifest written outside the stream: a record with no ops
  record(5, null),
  record(6, ['a:6'], { fromSeq: 2951, toSeq: 3100 }),
];

describe('the resync read (HR-RT#15)', () => {
  it('names the do tier records above a stream position, which the revision rule missed', () => {
    // the reproduction: the rule before this, which every tier read, compared seq 2000 with
    // revisions 1 to 6 (the blob tier's reading) and named nothing
    expect(resyncReadSince(doLog, 2000, 'blob')).toEqual({ origins: [], bounded: false });
    expect(resyncReadSince(doLog, 2000, 'do')).toEqual({
      origins: [
        { seq: 2950, n: 4, clientId: 'tab-a', opIds: ['a:4', 'a:5'] },
        { seq: 3100, n: 6, clientId: 'tab-a', opIds: ['a:6'] },
      ],
      bounded: false,
    });
    // a position inside a record: that record reaches it
    expect(resyncReadSince(doLog, 1000, 'do')).toMatchObject({ bounded: false });
    expect(resyncReadSince(doLog, 1000, 'memory').origins.map((origin) => origin.opIds)).toEqual([
      ['a:3'],
      ['a:4', 'a:5'],
      ['a:6'],
    ]);
  });

  it('is bounded when the records it read do not reach the position', () => {
    // a log read from its newest records only: the oldest starts above since + 1
    const newest = doLog.slice(3);
    expect(resyncReadSince(newest, 2000, 'do').bounded).toBe(true);
    expect(resyncReadSince(newest, 2400, 'do').bounded).toBe(false);
    // more records above the position than the read answers
    const long = Array.from({ length: 8 }, (_, i) =>
      record(i + 1, [`a:${i + 1}`], { fromSeq: i * 10 + 1, toSeq: (i + 1) * 10 }),
    );
    expect(resyncReadSince(long, 0, 'do', 5)).toMatchObject({ bounded: true });
    expect(resyncReadSince(long, 0, 'do', 5).origins.map((origin) => origin.seq)).toEqual([
      40, 50, 60, 70, 80,
    ]);
    expect(resyncReadSince(long, 30, 'do', 5)).toMatchObject({ bounded: false });
  });

  it('leaves the uncommitted tail alone: a position past every record is not bounded', () => {
    expect(resyncReadSince(doLog, 3100, 'do')).toEqual({ origins: [], bounded: false });
    expect(resyncReadSince(doLog, 5000, 'redis')).toEqual({ origins: [], bounded: false });
  });

  it('reads the revision on the blob tier, as the room client did, and says bounded there too', () => {
    const blob = Array.from({ length: 6 }, (_, i) => record(i + 1, [`b:${i + 1}`]));
    expect(resyncReadSince(blob, 2, 'blob').origins.map((origin) => origin.seq)).toEqual([
      3, 4, 5, 6,
    ]);
    expect(resyncReadSince(blob, 2, 'blob').bounded).toBe(false);
    expect(resyncReadSince(blob, 0, 'blob', 3).bounded).toBe(true);
    expect(resyncReadSince(blob.slice(3), 1, 'blob').bounded).toBe(true);
    expect(RESYNC_ORIGINS_MAX).toBe(2000);
  });
});
