// The title row's save words (SPEC 2.0, SPEC-3 15; b1 R46; the focus round, cycle 3 stream fix
// round, VERIFICATION C3-F1): six phrases in one cell. Offline wins; Reconnecting shows while the
// stream is down or the store refuses its poll and every write is acknowledged; a write in
// flight keeps Saving and a refused one keeps the retry word, so a seller never reads Saving for
// a stream problem and never reads All changes saved while the tab is cut off.
import { describe, expect, it } from 'vitest';

import { TITLE_ROW } from '../menus/strings';
import { saveWords } from '../TitleRow';

describe('saveWords', () => {
  it('answers the five phrases of the round three cell as before', () => {
    expect(saveWords('saved', false)).toBe(TITLE_ROW.saved);
    expect(saveWords('saved', true)).toBe(TITLE_ROW.notSaved);
    expect(saveWords('saving', false)).toBe(TITLE_ROW.saving);
    expect(saveWords('unsaved', false)).toBe(TITLE_ROW.saving);
    expect(saveWords('conflict', false)).toBe(TITLE_ROW.retrying);
    expect(saveWords('saved', false, true)).toBe(TITLE_ROW.offline);
    expect(saveWords('offline', false)).toBe(TITLE_ROW.offline);
  });

  it('reads Reconnecting… while the stream is down and every write is acknowledged (R46, C3-F1)', () => {
    expect(saveWords('saved', false, false, true)).toBe('Reconnecting…');
    expect(saveWords('saved', false, false, true)).toBe(TITLE_ROW.reconnecting);
  });

  it('lets the offline sentence win over Reconnecting (FR3-R5: the word shows while the client is not offline)', () => {
    expect(saveWords('saved', false, true, true)).toBe(TITLE_ROW.offline);
  });

  it('keeps the word of a write in flight or refused: Saving for a pending POST, the retry word for a refusal, never Saving for the stream alone', () => {
    expect(saveWords('unsaved', false, false, true)).toBe(TITLE_ROW.saving);
    expect(saveWords('saving', false, false, true)).toBe(TITLE_ROW.saving);
    expect(saveWords('conflict', false, false, true)).toBe(TITLE_ROW.retrying);
    // a draft at /new that has never written keeps Not saved yet whatever the stream does
    expect(saveWords('saved', true, false, true)).toBe(TITLE_ROW.notSaved);
  });

  it('never returns All changes saved while reconnecting', () => {
    for (const state of ['saved', 'idle', 'anything']) {
      expect(saveWords(state, false, false, true)).not.toBe(TITLE_ROW.saved);
    }
  });
});
