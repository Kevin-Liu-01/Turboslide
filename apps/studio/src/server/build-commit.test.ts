import { describe, expect, it } from 'vitest';

import { buildCommit } from './build-commit';

// The build commit stamp (docs/POLISH.md section 0 item 1): the platform's sha when it names one,
// else the stamp a CLI deploy passes, never an empty platform value over the stamp (the guard's
// preview of c6227464 answered `instance.commit` null with both names in its environment).

const SHA = 'c6227464fa546f3cffd9b30148951827baa6d0f0';

describe('buildCommit', () => {
  it('reads the platform sha first', () => {
    expect(buildCommit({ VERCEL_GIT_COMMIT_SHA: SHA, TURBOSLIDE_BUILD_COMMIT: 'abcdef0' })).toBe(
      SHA,
    );
  });
  it('falls through an empty platform value to the stamp', () => {
    expect(buildCommit({ VERCEL_GIT_COMMIT_SHA: '', TURBOSLIDE_BUILD_COMMIT: SHA })).toBe(SHA);
    expect(buildCommit({ VERCEL_GIT_COMMIT_SHA: '  ', TURBOSLIDE_BUILD_COMMIT: SHA })).toBe(SHA);
  });
  it('skips a platform value that is not a sha', () => {
    expect(buildCommit({ VERCEL_GIT_COMMIT_SHA: 'HEAD', TURBOSLIDE_BUILD_COMMIT: SHA })).toBe(SHA);
  });
  it('reads the stamp alone, lower cased and trimmed', () => {
    expect(buildCommit({ TURBOSLIDE_BUILD_COMMIT: ` ${SHA.toUpperCase()} ` })).toBe(SHA);
  });
  it('answers null when neither names a sha', () => {
    expect(buildCommit({})).toBe(null);
    expect(buildCommit({ VERCEL_GIT_COMMIT_SHA: '', TURBOSLIDE_BUILD_COMMIT: '' })).toBe(null);
    expect(buildCommit({ TURBOSLIDE_BUILD_COMMIT: 'abc' })).toBe(null);
  });
});
