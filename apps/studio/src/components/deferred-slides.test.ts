import { describe, expect, it } from 'vitest';

import type { ViewerDeck } from '@turboslide/viewer/model';

import { deferredSlidesOf, mergeDeferredSlides } from './deferred-slides';

// The viewer's deferred slides (gslides-parity SPEC-4 3.11; the focus round, cycle 3 fix, b3
// C3-R3, VERIFICATION C2-F21): the answer of `getDeckSlides` merges into the payload at the
// payload's revision and at a newer one (a checkpoint landed between the loader's read and the
// mount's fetch), and a stale answer is dropped. Before the fix a newer answer was dropped too and
// the viewer opened right after a fill write showed the plate for every slide but the first.

function deck(): ViewerDeck {
  return {
    id: 'd',
    title: 'D',
    revision: 12,
    sections: [{ id: 's', name: 'S', slideIds: ['a', 'b', 'c'] }],
    slides: [
      { id: 'a', n: 1, title: 'A', kind: 'title', html: '<section>a</section>' },
      { id: 'b', n: 2, title: 'B', kind: 'content', html: '' },
      { id: 'c', n: 3, title: 'C', kind: 'content', html: '' },
    ],
  } as unknown as ViewerDeck;
}

describe('deferredSlidesOf', () => {
  it('takes the answer at the payload revision', () => {
    const html = { b: '<section>b</section>', c: '<section>c</section>' };
    expect(deferredSlidesOf(12, { revision: 12, html })).toBe(html);
  });

  it('takes an answer one checkpoint newer than the payload (the memory tier after a write)', () => {
    const html = { b: '<section>b green</section>', c: '<section>c</section>' };
    expect(deferredSlidesOf(12, { revision: 13, html })).toBe(html);
  });

  it('drops a stale answer and no answer', () => {
    expect(
      deferredSlidesOf(12, { revision: 11, html: { b: '<section>old</section>' } }),
    ).toBeNull();
    expect(deferredSlidesOf(12, null)).toBeNull();
  });
});

describe('mergeDeferredSlides', () => {
  it('fills the empty slides by id and leaves the first slide and an unknown id alone', () => {
    const before = deck();
    const merged = mergeDeferredSlides(before, {
      a: '<section>other a</section>',
      b: '<section>b</section>',
      d: '<section>d</section>',
    });
    expect(merged.slides.map((slide) => slide.html)).toEqual([
      '<section>a</section>',
      '<section>b</section>',
      '',
    ]);
    expect(merged.slides.map((slide) => slide.id)).toEqual(['a', 'b', 'c']);
  });

  it('returns the same deck when nothing arrived', () => {
    const before = deck();
    expect(mergeDeferredSlides(before, null)).toBe(before);
    expect(mergeDeferredSlides(before, {})).toBe(before);
  });
});
