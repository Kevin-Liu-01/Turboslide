import { describe, expect, it } from 'vitest';

import type { ViewerSlide } from '../../model';
import {
  counterText,
  currentPlayIndex,
  formatElapsed,
  isNotesFont,
  isSkippedSlide,
  NOTES_FONT,
  playList,
  slideNumberOf,
  stepNotesFont,
  stepPlayIndex,
} from '../presentModel';

function slide(id: string, n: number, extra: Record<string, unknown> = {}): ViewerSlide {
  return { id, n, title: id, kind: 'content', sectionId: 'deck', html: '', ...extra };
}

// The show runs over the unskipped slides (gslides-parity SPEC 9.2, 7.2.1).
describe('playList', () => {
  const all = [slide('a', 1), slide('b', 2, { skip: true }), slide('c', 3), slide('d', 4)];

  it('reads a skip flag the loader wrote through and leaves the slide out', () => {
    expect(isSkippedSlide(all[1]!)).toBe(true);
    expect(isSkippedSlide(all[0]!)).toBe(false);
    expect(playList(all).map((s) => s.id)).toEqual(['a', 'c', 'd']);
  });

  it('keeps every slide of a payload that already dropped the skipped ones', () => {
    const payload = [slide('a', 1), slide('c', 3)];
    expect(playList(payload)).toEqual(payload);
  });

  it('finds the current position, moving off a skipped slide to the next unskipped one', () => {
    const play = playList(all);
    expect(currentPlayIndex(all, play, 'c')).toBe(1);
    expect(currentPlayIndex(all, play, 'b')).toBe(1);
    expect(currentPlayIndex(all, play, 'missing')).toBe(0);
    const tail = [slide('a', 1), slide('z', 2, { skip: true })];
    expect(currentPlayIndex(tail, playList(tail), 'z')).toBe(0);
    expect(currentPlayIndex([], [], 'a')).toBe(0);
  });

  it('steps inside the list and clamps at both ends', () => {
    expect(stepPlayIndex(0, 1, 3)).toBe(1);
    expect(stepPlayIndex(2, 1, 3)).toBe(2);
    expect(stepPlayIndex(0, -1, 3)).toBe(0);
    expect(stepPlayIndex(5, 1, 0)).toBe(0);
  });
});

describe('counter and the digit jump', () => {
  it('reads "3 of 10" over the unskipped count', () => {
    expect(counterText(2, 10)).toBe('3 of 10');
    expect(counterText(-1, 4)).toBe('1 of 4');
  });

  it('resolves typed digits to a slide number inside the list', () => {
    expect(slideNumberOf('7', 10)).toBe(7);
    expect(slideNumberOf('10', 10)).toBe(10);
    expect(slideNumberOf('0', 10)).toBeNull();
    expect(slideNumberOf('11', 10)).toBeNull();
    expect(slideNumberOf('', 10)).toBeNull();
    expect(slideNumberOf('x', 10)).toBeNull();
  });
});

describe('the presenter console numbers', () => {
  it('formats the elapsed timer as m:ss, then h:mm:ss', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(65_000)).toBe('1:05');
    expect(formatElapsed(3_600_000)).toBe('1:00:00');
    expect(formatElapsed(3_725_000)).toBe('1:02:05');
    expect(formatElapsed(-5)).toBe('0:00');
  });

  it('steps the notes text size between 14 and 28 by 2', () => {
    expect(NOTES_FONT.initial).toBe(16);
    expect(stepNotesFont(16, 1)).toBe(18);
    expect(stepNotesFont(28, 1)).toBe(28);
    expect(stepNotesFont(14, -1)).toBe(14);
    expect(isNotesFont(20)).toBe(true);
    expect(isNotesFont(15)).toBe(false);
    expect(isNotesFont(30)).toBe(false);
    expect(isNotesFont('16')).toBe(false);
  });
});
