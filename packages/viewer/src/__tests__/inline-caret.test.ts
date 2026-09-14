// The double click entry into editing (SPEC 6.4; VERIFICATION-3 finding 45): the first click of a
// double click opens an inline session and its prompt leaves, so an empty placeholder collapses to
// the caret; the second click of the double lands beside the run and would blur it. The guard keeps
// the caret only for a repeat click outside the editable while the session is live. The DOM path is
// exercised by apps/studio/e2e (landing.spec.ts, the /new title on a real double click); this pins
// the pure predicate.
import { describe, expect, it } from 'vitest';

import { keepsCaretOnRepeatClick } from '../InlineText.tsx';

describe('keepsCaretOnRepeatClick', () => {
  it('keeps the caret on the second click of a double click that lands outside the run', () => {
    // the /new title case: the first click made the run editable, the prompt left and the run
    // collapsed, so the second click of the double lands beside it
    expect(keepsCaretOnRepeatClick({ ended: false, detail: 2, insideEditable: false })).toBe(true);
  });

  it('leaves a single click alone so a click elsewhere still ends the session', () => {
    expect(keepsCaretOnRepeatClick({ ended: false, detail: 1, insideEditable: false })).toBe(false);
  });

  it('leaves a double click inside the run alone so the browser word selection stands', () => {
    expect(keepsCaretOnRepeatClick({ ended: false, detail: 2, insideEditable: true })).toBe(false);
  });

  it('never swallows a click once the session has ended', () => {
    // a double click on another run: the first click blurred this session (ended), so its guard
    // must not preventDefault the second click that belongs to the next run
    expect(keepsCaretOnRepeatClick({ ended: true, detail: 2, insideEditable: false })).toBe(false);
  });

  it('keeps the caret on a triple click outside the run as well', () => {
    expect(keepsCaretOnRepeatClick({ ended: false, detail: 3, insideEditable: false })).toBe(true);
  });
});
