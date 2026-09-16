import { describe, expect, it } from 'vitest';

import { defaultPreferences } from '@turboslide/schema/preferences';

import { NOTES_REVERT_MS, notesCorrection } from './NotesPane';

// The autocorrect engine over the notes textarea (gslides-parity SPEC-5 7.1; R10 1.4 "Speaker
// notes are a textarea ... and take the same engine on the same triggers"): the paragraph around
// the caret, the corrected value with the caret moved, the quote consuming its key, and the facts
// the Backspace revert reads.

const prefs = defaultPreferences();

describe('notesCorrection', () => {
  it('corrects the paragraph around the caret and moves the caret', () => {
    const result = notesCorrection('first line\nteh second', 14, ' ', prefs, 'en-US');
    expect(result).not.toBeNull();
    expect(result?.value).toBe('first line\nthe second');
    expect(result?.caret).toBe(14);
    expect(result?.from).toBe('teh');
    expect(result?.at).toBe(11);
    expect(result?.correction.rule).toBe('spelling');
  });
  it('substitutes and capitalises, and consumes a straight quote', () => {
    expect(notesCorrection('a -> b', 4, ' ', prefs, 'en-US')?.value).toBe('a → b');
    expect(notesCorrection('hello', 5, '.', prefs, 'en-US')?.value).toBe('Hello');
    const quote = notesCorrection('say ', 4, '"', prefs, 'en-US');
    expect(quote?.correction.consumesTrigger).toBe(true);
    expect(quote?.value).toBe('say “');
    expect(quote?.caret).toBe(5);
  });
  it('never links or lists the plain notes and skips the dictionary words', () => {
    expect(notesCorrection('see www.example.com', 19, ' ', prefs, 'en-US')).toBeNull();
    expect(notesCorrection('-', 1, ' ', prefs, 'en-US')).toBeNull();
    expect(
      notesCorrection(
        'teh',
        3,
        ' ',
        { ...prefs, spelling: { underline: true, dictionary: ['teh'] } },
        'en-US',
      ),
    ).toBeNull();
    expect(notesCorrection('teh', 3, 'a', prefs, 'en-US')).toBeNull();
    expect(NOTES_REVERT_MS).toBe(2000);
  });
});
