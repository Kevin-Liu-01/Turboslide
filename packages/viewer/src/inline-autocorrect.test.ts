import { describe, expect, it } from 'vitest';

import { defaultPreferences } from '@turboslide/schema/preferences';
import { plainOf } from '@turboslide/schema/text';

import {
  AUTOCORRECT_REVERT_MS,
  inlineCorrection,
  revertCorrection,
  shouldRevert,
  triggerKeyOf,
} from './inline-autocorrect.ts';

// The autocorrect step of an InlineText session (gslides-parity SPEC-5 7.1; R10 1.4, 1.7): the
// trigger key, the correction applied to the markup with the run flags kept, the caret moved, a
// link marked, a list handed over, and the Backspace revert within two seconds.

const context = { preferences: defaultPreferences(), language: 'en-US' };

describe('the trigger path', () => {
  it('reads Enter as the paragraph break and the other triggers as typed', () => {
    expect(triggerKeyOf('Enter')).toBe('\n');
    expect(triggerKeyOf(' ')).toBe(' ');
    expect(triggerKeyOf('"')).toBe('"');
    expect(triggerKeyOf('a')).toBeNull();
  });
  it('corrects the token before the caret and keeps the marks of the run', () => {
    const result = inlineCorrection('*teh* quick', 3, ' ', context);
    expect(result).not.toBeNull();
    expect(result?.correction.rule).toBe('spelling');
    expect(result?.next).toBe('*the* quick');
    expect(result?.caret).toBe(3);
    expect(result?.from).toBe('teh');
    expect(result?.at).toBe(0);
    const sub = inlineCorrection('hello (c)', 9, ' ', context);
    expect(sub?.next).toBe('hello ©');
    expect(sub?.caret).toBe(7);
  });
  it('works on the caret’s paragraph of a multiline text', () => {
    const result = inlineCorrection('First line\nteh second', 14, ' ', context);
    expect(result?.next).toBe('First line\nthe second');
    expect(result?.at).toBe(11);
    expect(result?.caret).toBe(14);
  });
  it('replaces a straight quote and consumes the key', () => {
    const result = inlineCorrection('say ', 4, '"', context);
    expect(result?.correction.consumesTrigger).toBe(true);
    expect(plainOf(result?.next ?? '')).toBe('say “');
    expect(result?.caret).toBe(5);
  });
  it('marks a typed address as a link without changing the text', () => {
    const result = inlineCorrection('see www.example.com', 19, ' ', context);
    expect(result?.correction.rule).toBe('link');
    expect(result?.next).toBe('see [www.example.com](https://www.example.com)');
    expect(result?.caret).toBe(19);
    // inside a link's text the substitution and quote rules stay off; a misspelt link text is corrected
    expect(
      inlineCorrection('[a (c)](https://x.com)', 5, ' ', { ...context, inLink: true }),
    ).toBeNull();
    expect(
      inlineCorrection('[teh](https://x.com)', 3, ' ', { ...context, inLink: true })?.next,
    ).toBe('[the](https://x.com)');
  });
  it('hands a list prefix to the caller on a listable pointer', () => {
    const result = inlineCorrection('-', 1, ' ', { ...context, listable: true });
    expect(result?.correction.list).toEqual({ marker: 'bullet' });
    expect(result?.next).toBe('-');
    expect(inlineCorrection('-', 1, ' ', { ...context, listable: true, isList: true })).toBeNull();
    expect(inlineCorrection('-', 1, ' ', context)).toBeNull();
  });
  it('leaves the personal dictionary words alone', () => {
    expect(inlineCorrection('teh', 3, ' ', { ...context, exceptions: ['teh'] })).toBeNull();
  });
});

describe('the revert', () => {
  it('takes the correction back within the window when the text has not moved', () => {
    const applied = inlineCorrection('hello (c)', 9, ' ', context);
    expect(applied).not.toBeNull();
    if (applied === null) return;
    const now = 10_000;
    expect(shouldRevert({ ...applied, time: now - 500 }, applied.next, now)).toBe(true);
    expect(
      shouldRevert({ ...applied, time: now - AUTOCORRECT_REVERT_MS - 1 }, applied.next, now),
    ).toBe(false);
    expect(shouldRevert({ ...applied, time: now }, `${applied.next}!`, now)).toBe(false);
    expect(shouldRevert(null, applied.next, now)).toBe(false);
    expect(revertCorrection(applied.next, applied)).toEqual({ text: 'hello (c)', caret: 9 });
  });
  it('unmarks a link on revert and keeps the marks around a reverted word', () => {
    const link = inlineCorrection('see www.example.com', 19, ' ', context);
    if (link === null) throw new Error('no link correction');
    expect(revertCorrection(link.next, link)).toEqual({ text: 'see www.example.com', caret: 19 });
    const bold = inlineCorrection('*teh* quick', 3, ' ', context);
    if (bold === null) throw new Error('no correction');
    expect(revertCorrection(bold.next, bold)).toEqual({ text: '*teh* quick', caret: 3 });
  });
});
