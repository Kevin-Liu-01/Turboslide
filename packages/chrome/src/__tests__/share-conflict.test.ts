import { describe, expect, it } from 'vitest';

import { conflictRevision, isShareConflict } from '../dialogs/Share';

// The retry base of a refused share write (the focus round, cycle 2; VERIFICATION.md pass 2
// F-share-copy): the 409 sentence names the server's revision, and the dialog retries on the
// highest of that, the route's re-read and its own count, never on the base the server refused.
describe('conflictRevision', () => {
  it('reads the revision the 409 sentence names', () => {
    const error = new Error('the access record is at revision 2, not 1; re-read and retry');
    expect(isShareConflict(error)).toBe(true);
    expect(conflictRevision(error)).toBe(2);
  });

  it('prefers a currentRevision carried on the error', () => {
    const error = Object.assign(
      new Error('the access record is at revision 2, not 1; re-read and retry'),
      { currentRevision: 5 },
    );
    expect(conflictRevision(error)).toBe(5);
  });

  it('answers null for a refusal that names no revision and for a foreign error', () => {
    expect(
      conflictRevision(
        new Error('The sharing settings changed since they were read; reload and retry'),
      ),
    ).toBeNull();
    expect(
      conflictRevision(new TypeError('a presentation holds at most 50 live links')),
    ).toBeNull();
    expect(conflictRevision('plain text')).toBeNull();
  });
});
