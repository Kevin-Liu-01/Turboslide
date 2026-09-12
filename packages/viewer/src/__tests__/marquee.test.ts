import { describe, expect, it } from 'vitest';

import type { Box } from '@turboslide/schema/render';

import { guideStyle, mergeGuides } from '../Guides';
import type { Guide } from '../Guides';
import { isMarquee, MARQUEE_MIN_PX, marqueeBox, marqueeHits } from '../Marquee';

// The marquee and the guides of the freeform stage (this round): pure models over sheet pixels.
describe('marqueeBox', () => {
  it('normalizes the rectangle whichever way the pointer went', () => {
    expect(marqueeBox({ x: 10, y: 20 }, { x: 110, y: 70 })).toEqual([10, 20, 100, 50]);
    expect(marqueeBox({ x: 110, y: 70 }, { x: 10, y: 20 })).toEqual([10, 20, 100, 50]);
  });

  it('counts as a marquee once it is wide or tall enough', () => {
    expect(isMarquee([0, 0, MARQUEE_MIN_PX - 1, MARQUEE_MIN_PX - 1])).toBe(false);
    expect(isMarquee([0, 0, MARQUEE_MIN_PX, 0])).toBe(true);
    expect(isMarquee([0, 0, 0, MARQUEE_MIN_PX])).toBe(true);
  });
});

describe('marqueeHits', () => {
  const blocks: Record<string, Box> = {
    a: [200, 200, 300, 100],
    b: [600, 240, 200, 60],
    c: [1000, 300, 100, 200],
  };

  it('takes every block the rectangle touches, in document order', () => {
    expect(marqueeHits([450, 150, 400, 200], blocks, ['a', 'b', 'c'])).toEqual(['a', 'b']);
    expect(marqueeHits([450, 150, 400, 200], blocks, ['c', 'b', 'a'])).toEqual(['b', 'a']);
    expect(marqueeHits([0, 0, 1600, 900], blocks, ['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('takes nothing from a gap or a zero-size rectangle', () => {
    expect(marqueeHits([520, 100, 60, 400], blocks, ['a', 'b', 'c'])).toEqual([]);
    expect(marqueeHits([250, 250, 0, 0], blocks, ['a', 'b', 'c'])).toEqual([]);
    expect(marqueeHits([250, 250, 10, 10], blocks, ['a', 'zzz'])).toEqual(['a']);
  });
});

describe('guides', () => {
  it('merges guides on the same line and keeps their union extent', () => {
    const guides: Guide[] = [
      { axis: 'x', at: 600, kind: 'edge', from: 240, to: 300 },
      { axis: 'x', at: 600, kind: 'edge', from: 100, to: 250 },
      { axis: 'y', at: 600, kind: 'center', from: 0, to: 10 },
    ];
    expect(mergeGuides(guides)).toEqual([
      { axis: 'x', at: 600, kind: 'edge', from: 100, to: 300 },
      { axis: 'y', at: 600, kind: 'center', from: 0, to: 10 },
    ]);
    expect(guides[0]).toMatchObject({ from: 240 });
  });

  it('places a vertical guide by left and a horizontal one by top, at the stage scale', () => {
    expect(guideStyle({ axis: 'x', at: 600, kind: 'edge', from: 100, to: 300 }, 0.5)).toEqual({
      left: 300,
      top: 50,
      height: 100,
    });
    expect(guideStyle({ axis: 'y', at: 129, kind: 'content', from: 137, to: 1463 }, 0.5)).toEqual({
      top: 65,
      left: 68.5,
      width: 663,
    });
  });
});
