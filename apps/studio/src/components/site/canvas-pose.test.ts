import { describe, expect, it } from 'vitest';

import { LIGHTHOUSE, clampPose, poseJson, turnTo } from './canvas-pose';

// The Canvas screen's heading (CanvasScreen.tsx): a pose is whole slide px and whole degrees, its
// box's centre stays on the slide, and the line under the slide is the `/pos` the editor writes.

describe('the heading’s pose', () => {
  it('starts as the write the CLI recorded', () => {
    const { x, y, rotate } = LIGHTHOUSE.moved;
    expect(poseJson({ x, y, rotate })).toBe('{"x":137,"y":129,"w":508,"h":48,"rotate":354}');
  });

  it('keeps the box’s centre on the slide in whole px', () => {
    expect(clampPose({ x: -900.4, y: 2000, rotate: 0 })).toEqual({ x: -254, y: 876, rotate: 0 });
    expect(clampPose({ x: 1600, y: -60, rotate: 0 })).toEqual({ x: 1346, y: -24, rotate: 0 });
    expect(clampPose({ x: 412.6, y: 300.2, rotate: 0 })).toEqual({ x: 413, y: 300, rotate: 0 });
  });

  it('turns in 0 to 359 degrees, by a step', () => {
    expect(turnTo(-6, 1)).toBe(354);
    expect(turnTo(360, 1)).toBe(0);
    expect(turnTo(97, 15)).toBe(90);
    expect(turnTo(-8, 15)).toBe(345);
  });
});
