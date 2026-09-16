import { describe, expect, it } from 'vitest';

import type { ViewerSlide } from '../../model';
import {
  AUTO_PLAY_INTERVALS_MS,
  autoPlayLabel,
  counterText,
  currentPlayIndex,
  formatElapsed,
  isNotesFont,
  isSkippedSlide,
  motionOf,
  nextPosition,
  NOTES_FONT,
  playList,
  previousPosition,
  slideNumberOf,
  stepCount,
  stepCounterText,
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

// The step model of round five (gslides-parity SPEC-5 2.2, 0.14; MILESTONES-5 B1 day 4).
describe('the step model', () => {
  const steps = [0, 2, 1];

  it('reads a schedule a loader attached to the viewer slide, and nothing else', () => {
    const schedule = {
      slideId: 'a',
      steps: [{ effects: [], durationMs: 0 }],
      hiddenAtStart: [],
      transition: null,
      skipped: [],
    };
    expect(motionOf(slide('a', 1, { motion: schedule }))).toBe(schedule);
    expect(motionOf(slide('a', 1))).toBeUndefined();
    expect(motionOf(slide('a', 1, { motion: 'no' }))).toBeUndefined();
    expect(motionOf(undefined)).toBeUndefined();
    expect(stepCount(schedule)).toBe(0);
    expect(
      stepCount({ ...schedule, steps: [...schedule.steps, ...schedule.steps, ...schedule.steps] }),
    ).toBe(2);
    expect(stepCount(undefined)).toBe(0);
  });

  it('a next consumes the steps of a slide before it moves, then stops at the end', () => {
    expect(nextPosition(0, 0, 3, steps)).toEqual({ index: 1, step: 0 });
    expect(nextPosition(1, 0, 3, steps)).toEqual({ index: 1, step: 1 });
    expect(nextPosition(1, 1, 3, steps)).toEqual({ index: 1, step: 2 });
    expect(nextPosition(1, 2, 3, steps)).toEqual({ index: 2, step: 0 });
    expect(nextPosition(2, 1, 3, steps)).toBeNull();
    expect(nextPosition(0, 0, 0, steps)).toBeNull();
    expect(nextPosition(0, 0, 3, (index) => steps[index] ?? 0)).toEqual({ index: 1, step: 0 });
  });

  it('a previous reverses a step, then lands on the previous slide at its last step', () => {
    expect(previousPosition(1, 2, 3, steps)).toEqual({ index: 1, step: 1 });
    expect(previousPosition(1, 0, 3, steps)).toEqual({ index: 0, step: 0 });
    expect(previousPosition(2, 0, 3, steps)).toEqual({ index: 1, step: 2 });
    expect(previousPosition(0, 0, 3, steps)).toBeNull();
    expect(previousPosition(0, 0, 0, steps)).toBeNull();
  });

  it('prints the step line and the Auto-play labels', () => {
    expect(stepCounterText(2, 4)).toBe('Step 2 of 4');
    expect(stepCounterText(0, 4)).toBe('Step 0 of 4');
    expect(stepCounterText(0, 0)).toBe('');
    expect(AUTO_PLAY_INTERVALS_MS).toEqual([1000, 2000, 3000, 5000, 10000, 15000, 30000, 60000]);
    expect(autoPlayLabel(1000)).toBe('Every second');
    expect(autoPlayLabel(5000)).toBe('Every 5 seconds');
    expect(autoPlayLabel(60000)).toBe('Every minute');
  });
});
