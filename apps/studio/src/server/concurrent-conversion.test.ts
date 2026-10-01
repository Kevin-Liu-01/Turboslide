import { describe, expect, it } from 'vitest';

import { WORKED_SLIDES } from '@turboslide/schema/fixtures';
import type { Mutation } from '@turboslide/schema/mutations';

import { landedOwn, transformEntry, yieldConcurrentConversion } from './room';

// Two tabs converting one slide at once (the realtime round, R1's two process run; the row
// `realtime.title.two-typers`): the wire of the run read both tabs posting `slide.replace` with
// their own copy of the cover beside a `text.splice`, 11 ms apart; the second's splice, moved past
// the first's, fell outside its own copy's text and the whole entry was refused ("text.splice: 40
// plus 0 is outside a text of 32 characters"), the second word lost in three runs of three. The
// rule under test: the later entry yields its `slide.replace` when another replaced the slide
// since its base and the entry types on that slide; a bare replacement keeps last writer wins.

const SLIDE = WORKED_SLIDES.find((slide) => slide.id === 'content-rule')!;
const BLOCK = 'p1';

function splice(at: number, insert: string): Mutation {
  return { op: 'text.splice', slideId: SLIDE.id, blockId: BLOCK, path: '/text', at, remove: 0, insert };
}
const replace: Mutation = { op: 'slide.replace', slideId: SLIDE.id, slide: SLIDE };
const typography: Mutation = {
  op: 'block.set',
  slideId: SLIDE.id,
  blockId: BLOCK,
  path: '/size',
  value: 9,
};

describe('yieldConcurrentConversion (docs/REALTIME.md row realtime.title.two-typers)', () => {
  it('drops the later slide.replace when the entry also types on the slide, and keeps the rest', () => {
    const landed = landedOwn([replace, splice(32, ' charlie'), typography]);
    expect(yieldConcurrentConversion([replace, splice(32, ' delta'), typography], landed)).toEqual([
      splice(32, ' delta'),
      typography,
    ]);
  });

  it('keeps a bare slide.replace (the source drawer, slide.toCanvas): last writer wins as before', () => {
    const landed = landedOwn([replace]);
    expect(yieldConcurrentConversion([replace], landed)).toEqual([replace]);
    // a replacement of another slide is not touched either
    const other: Mutation = { op: 'slide.replace', slideId: 'title', slide: { ...SLIDE, id: 'title' } };
    expect(yieldConcurrentConversion([other, splice(1, 'x')], landed)).toEqual([other, splice(1, 'x')]);
  });

  it('transformEntry then moves the second typist’s splice past the first’s and lands no replacement', () => {
    const landed = landedOwn([replace, splice(32, ' charlie'), typography]);
    const out = transformEntry([replace, splice(32, ' delta'), typography], landed);
    expect(out).toEqual([splice(40, ' delta'), typography]);
  });
});
