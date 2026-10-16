// The compile of the slide clock (HTML-SLIDES-DESIGN 2.3, 2.8): every preset becomes keyframes,
// an exit plays its preset backwards, keyframe values pass the html block's declaration rules
// again (a fixed position and a remote url() are dropped), a path becomes offset-path, a split's
// units end with the effect, and every transition but none compiles.
import { describe, expect, it } from 'vitest';

import { EFFECT_PRESETS, TRANSITION_NAMES } from '@turboslide/schema/motion-core';
import type { Effect } from '@turboslide/schema/motion-core';

import {
  compileEffect,
  compileTransition,
  cssEasing,
  keyframeProperty,
  unitTiming,
} from '../motion.ts';

const base: Omit<Effect, 'motion' | 'role'> = {
  id: 'fx-1',
  block: 'b1',
  start: 'click',
  durationMs: 500,
};

describe('compileEffect', () => {
  it('compiles every preset to at least two keyframes', () => {
    for (const preset of EFFECT_PRESETS) {
      const role = ['push-in', 'float', 'pulse'].includes(preset) ? 'emphasis' : 'enter';
      const compiled = compileEffect({ ...base, role, motion: { preset } });
      expect(compiled.keyframes.length, preset).toBeGreaterThanOrEqual(2);
      expect(compiled.duration).toBe(500);
    }
  });

  it('plays an exit preset backwards', () => {
    const enter = compileEffect({ ...base, role: 'enter', motion: { preset: 'fade' } });
    const exit = compileEffect({ ...base, role: 'exit', motion: { preset: 'fade' } });
    expect(enter.keyframes).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(exit.keyframes).toEqual([{ opacity: 1 }, { opacity: 0 }]);
  });

  it('moves with the translate property, so a rotated block keeps its transform', () => {
    const compiled = compileEffect({
      ...base,
      role: 'enter',
      motion: { preset: 'slide-in', from: 'right', amount: 200 },
    });
    expect(compiled.keyframes[0]).toMatchObject({ translate: '200px 0px', opacity: 0 });
    expect(compiled.keyframes[0]).not.toHaveProperty('transform');
  });

  it('drops a fixed position and a url() outside the deck, and names main thread properties', () => {
    const compiled = compileEffect({
      ...base,
      role: 'emphasis',
      motion: {
        keyframes: [
          {
            at: 0,
            style: {
              position: 'fixed',
              'background-image': 'url(https://example.com/x.png)',
              'background-color': 'red',
            },
          },
          { at: 1, style: { 'background-color': 'blue', '--glow': '4px' } },
        ],
      },
    });
    expect(compiled.keyframes[0]).toEqual({ backgroundColor: 'red', offset: 0 });
    expect(compiled.keyframes[1]).toEqual({ backgroundColor: 'blue', '--glow': '4px', offset: 1 });
    expect(compiled.mainThread).toBe(true);
  });

  it('keeps an asset url() and runs transform and opacity on the compositor', () => {
    const compiled = compileEffect({
      ...base,
      role: 'emphasis',
      motion: {
        keyframes: [
          { at: 0, style: { opacity: '1', 'mask-image': 'url(assets/mask.png)' } },
          { at: 1, style: { opacity: '0.5' }, easing: 'linear' },
        ],
      },
    });
    expect(compiled.keyframes[0]).toMatchObject({ maskImage: 'url(assets/mask.png)' });
    expect(compiled.keyframes[1]).toMatchObject({ easing: 'linear' });
  });

  it('turns a path into offset-path with offset-distance from 0% to 100%', () => {
    const compiled = compileEffect({
      ...base,
      role: 'emphasis',
      motion: { path: 'M 0 0 C 100 0 200 100 300 100', rotate: true },
    });
    expect(compiled.keyframes[0]).toMatchObject({
      offsetPath: "path('M 0 0 C 100 0 200 100 300 100')",
      offsetRotate: 'auto',
      offsetDistance: '0%',
    });
    expect(compiled.keyframes[1]).toMatchObject({ offsetDistance: '100%' });
  });

  it('repeats an emphasis until the slide leaves, and gives a text preset its split', () => {
    const pulse = compileEffect({
      ...base,
      role: 'emphasis',
      motion: { preset: 'pulse' },
      repeat: 'slide',
    });
    expect(pulse.iterations).toBe(Number.POSITIVE_INFINITY);
    const words = compileEffect({ ...base, role: 'enter', motion: { preset: 'word-rise' } });
    expect(words.split).toEqual({ by: 'word', staggerMs: 0 });
    const draw = compileEffect({ ...base, role: 'enter', motion: { preset: 'draw' } });
    expect(draw.draw).toBe(true);
  });
});

describe('unitTiming', () => {
  it('spreads the starts over half the duration, so the last unit ends with the effect', () => {
    const timing = unitTiming({ by: 'word', staggerMs: 0 }, 1000, 5);
    expect(timing.unitMs).toBe(500);
    expect(timing.delayOf(4) + timing.unitMs).toBe(1000);
  });

  it('starts the units past the cap with the last one', () => {
    const timing = unitTiming({ by: 'glyph', staggerMs: 10 }, 400, 1000);
    expect(timing.delayOf(399)).toBe(3990);
    expect(timing.delayOf(999)).toBe(3990);
  });
});

describe('compileTransition', () => {
  it('compiles every transition but none, and none or 0 ms is a cut', () => {
    for (const name of TRANSITION_NAMES) {
      const compiled = compileTransition({ name, durationMs: 400 });
      if (name === 'none') expect(compiled.keyframes).toEqual([]);
      else expect(compiled.keyframes.length, name).toBe(2);
    }
    expect(compileTransition({ name: 'crossfade', durationMs: 0 }).keyframes).toEqual([]);
  });
});

describe('names', () => {
  it('writes easings and property names as element.animate takes them', () => {
    expect(cssEasing(undefined)).toBe('cubic-bezier(0.16, 1, 0.3, 1)');
    expect(cssEasing('linear')).toBe('linear');
    expect(keyframeProperty('background-color')).toBe('backgroundColor');
    expect(keyframeProperty('--x')).toBe('--x');
    expect(keyframeProperty('-webkit-mask-image')).toBe('webkitMaskImage');
    expect(keyframeProperty('offset')).toBe('cssOffset');
  });
});
