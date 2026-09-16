// The wording rule of the sync engine (gslides-parity SPEC-5-amendments A3 item 8; B7): the
// strings "is stale" and "baseRevision" never reach a person. The room's refused base answers
// `movedSentence`, and the blob tier's 409 carries it with the entries since the client's base
// (room.ts `admitOnBlob`); the sentence names what happened in plain words and nothing else.
import { describe, expect, it } from 'vitest';

import { BLOB_REPLAY_RECORDS, movedSentence } from './room';

/** The words a refused write must never show a person (sync-stress-probe.mjs STALE reads the same list). */
const FORBIDDEN = /is stale|baseRevision|reload and rebase|not accepted|changed in the Blob store/i;

describe('the wording of a refused base (SPEC-5-amendments A3 item 8)', () => {
  it('names the revision the presentation moved to in plain words', () => {
    const sentence = movedSentence(12);
    expect(sentence).toBe('The presentation moved to revision 12 while this change was on its way');
    expect(sentence).not.toMatch(FORBIDDEN);
    // sentence case, no trailing period, no em dash
    expect(sentence[0]).toBe(sentence[0]?.toUpperCase());
    expect(sentence.endsWith('.')).toBe(false);
    expect(sentence.includes('—')).toBe(false);
  });

  it('reads back a bounded window of records for a replayed op id', () => {
    expect(BLOB_REPLAY_RECORDS).toBeGreaterThanOrEqual(50);
    expect(BLOB_REPLAY_RECORDS).toBeLessThanOrEqual(1000);
  });
});
