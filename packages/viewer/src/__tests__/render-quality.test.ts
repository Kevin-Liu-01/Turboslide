import { describe, expect, test } from 'vitest';

import { adaptivePixels, createFrameAssessment, createRenderQuality } from '../render-quality';

/** Draw times at a steady interval from `start`, for `seconds`. */
function draws(start: number, interval: number, seconds: number): number[] {
  const out: number[] = [];
  for (let t = start; t < start + seconds * 1000; t += interval) out.push(t);
  return out;
}

describe('the frame windows', () => {
  test('a steady 30 fps is smooth after the warm-up; 20 fps is slow; a pause resets', () => {
    const smooth = createFrameAssessment(30);
    const verdicts = draws(0, 1000 / 30, 6).map((t) => smooth.sample(t));
    expect(verdicts.filter((v) => v !== null)).toEqual(['smooth']);
    const slow = createFrameAssessment(30);
    expect(
      draws(0, 50, 6)
        .map((t) => slow.sample(t))
        .filter((v) => v !== null),
    ).toEqual(['slow']);
    const paused = createFrameAssessment(30);
    for (const t of draws(0, 50, 4)) paused.sample(t);
    expect(paused.sample(10_000)).toBeNull();
  });
});

describe('the Auto policy', () => {
  test('two slow windows halve the pixels; smooth windows restore the full budget', () => {
    const budgets: number[] = [];
    const canvas = { width: 2000, height: 1000 } as HTMLCanvasElement;
    const onDraw = adaptivePixels(
      { canvas: () => canvas, setPixelBudget: (n) => budgets.push(n) },
      30,
      5_760_001,
    );
    let t = 0;
    for (; t < 8_000; t += 50) onDraw(t);
    expect(budgets).toEqual([1_000_000]);
    for (; t < 30_000; t += 1000 / 30) onDraw(t);
    expect(budgets).toEqual([1_000_000, 5_760_001]);
  });

  test('a drop after a restore doubles the wait', () => {
    const policy = createRenderQuality(30);
    let t = 0;
    const run = (interval: number, seconds: number) => {
      const changes: string[] = [];
      for (const end = t + seconds * 1000; t < end; t += interval) {
        const next = policy.sample(t);
        if (next !== null) changes.push(next);
      }
      return changes;
    };
    expect(run(50, 8)).toEqual(['low']);
    expect(run(1000 / 30, 14)).toEqual(['high']);
    expect(run(50, 8)).toEqual(['low']);
    expect(run(1000 / 30, 14)).toEqual([]);
    expect(run(1000 / 30, 12)).toEqual(['high']);
  });
});
