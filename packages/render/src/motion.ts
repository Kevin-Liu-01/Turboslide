// The compile of the slide clock (docs: HTML-SLIDES-DESIGN 2.3): one effect or one transition
// becomes the keyframe list and the timing `element.animate` takes. Pure and framework free, so
// the viewer's clock (packages/viewer/src/slide-clock.ts) and the tests in Node read the same
// output. Presets become keyframes in sheet px; keyframe values pass the html block's declaration
// rules again (sanitize/css.ts), so an effect cannot fetch from outside the deck or lift a block
// over the editor's chrome; a motion path becomes `offset-path` with `offset-distance` from 0% to
// 100%. Movement uses the individual `translate` and `scale` properties, which compose with the
// `transform` a rotated or flipped block already carries. The still exports never call this
// module, so a slide renders as authored on every page, picture and file.
import {
  easingCurve,
  effectSplit,
  keyframeValueProblem,
  MOTION_LIMITS,
  MOTION_PROPERTY,
} from '@turboslide/schema/motion-core';
import type {
  Direction,
  Easing,
  Effect,
  EffectPreset,
  Split,
  Transition,
  TransitionName,
} from '@turboslide/schema/motion-core';

import { sanitizeDeclaration } from './sanitize/css.ts';

/** One keyframe as `element.animate` takes it: camel case properties, an offset and an easing. */
export type MotionKeyframe = {
  [property: string]: string | number | undefined;
  offset?: number;
  easing?: string;
};

/** What an effect compiles to; the clock adds the delay and the fill from the schedule. */
export type CompiledEffect = {
  keyframes: MotionKeyframe[];
  /** one run, in ms; a split effect's unit run */
  duration: number;
  easing: string;
  /** a count, or Infinity for an emphasis that repeats until the slide leaves */
  iterations: number;
  /** `draw`: the page measures each stroke and animates its dash */
  draw?: true;
  /** the text units the effect animates one by one */
  split?: Split;
  /** a property outside transform, opacity and filter: it runs on the main thread */
  mainThread: boolean;
};

export type CompiledTransition = { keyframes: MotionKeyframe[]; duration: number; easing: string };

/** The CSS easing an effect easing names. */
export function cssEasing(easing: Easing | undefined): string {
  if (easing === 'linear') return 'linear';
  const [x1, y1, x2, y2] = easingCurve(easing);
  return `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`;
}

/** `background-color` to `backgroundColor`; `float` and `offset` take their `css` names; custom properties stay. */
export function keyframeProperty(property: string): string {
  if (property.startsWith('--')) return property;
  if (property === 'float') return 'cssFloat';
  if (property === 'offset') return 'cssOffset';
  const bare = property.startsWith('-') ? property.slice(1) : property;
  return bare.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

const COMPOSITOR = new Set(['opacity', 'transform', 'translate', 'scale', 'rotate', 'filter']);

/** One keyframe's style, each declaration checked twice: the schema's rule and the html block's. */
function safeStyle(style: Record<string, string>): { frame: MotionKeyframe; mainThread: boolean } {
  const frame: MotionKeyframe = {};
  let mainThread = false;
  for (const [property, value] of Object.entries(style)) {
    if (!MOTION_PROPERTY.test(property)) continue;
    if (keyframeValueProblem(property, value) !== null) continue;
    if (sanitizeDeclaration(`${property}: ${value}`) === null) continue;
    frame[keyframeProperty(property)] = value;
    if (!COMPOSITOR.has(property)) mainThread = true;
  }
  return { frame, mainThread };
}

/** The travel of a direction: where a block comes from, in sheet px. */
function travel(from: Direction, amount: number): string {
  switch (from) {
    case 'left':
      return `${-amount}px 0px`;
    case 'right':
      return `${amount}px 0px`;
    case 'top':
      return `0px ${-amount}px`;
    case 'bottom':
      return `0px ${amount}px`;
  }
}

/** The clip a wipe starts from: the block is revealed from its `from` side. */
function wipeClip(from: Direction): string {
  switch (from) {
    case 'left':
      return 'inset(0% 100% 0% 0%)';
    case 'right':
      return 'inset(0% 0% 0% 100%)';
    case 'top':
      return 'inset(0% 0% 100% 0%)';
    case 'bottom':
      return 'inset(100% 0% 0% 0%)';
  }
}

/** The enter keyframes of a preset (an exit plays them backwards); emphasis presets as they run. */
export function presetKeyframes(
  preset: EffectPreset,
  from: Direction | undefined,
  amount: number | undefined,
): MotionKeyframe[] {
  switch (preset) {
    case 'fade':
      return [{ opacity: 0 }, { opacity: 1 }];
    case 'rise-in':
      return [
        { opacity: 0, translate: travel(from ?? 'bottom', amount ?? 24) },
        { opacity: 1, translate: '0px 0px' },
      ];
    case 'slide-in':
      return [
        { opacity: 0, translate: travel(from ?? 'left', amount ?? 160) },
        { opacity: 1, translate: '0px 0px' },
      ];
    case 'pop-in': {
      const scale = Math.max(0, 1 - (amount ?? 20) / 100);
      return [
        { opacity: 0, scale: String(scale) },
        { opacity: 1, scale: '1' },
      ];
    }
    case 'wipe':
      return [{ clipPath: wipeClip(from ?? 'left') }, { clipPath: 'inset(0% 0% 0% 0%)' }];
    case 'draw':
      /* the page replaces these with each stroke's dash (slide-clock.ts); a block with no stroke wipes */
      return [{ clipPath: wipeClip(from ?? 'left') }, { clipPath: 'inset(0% 0% 0% 0%)' }];
    case 'push-in':
      return [{ scale: '1' }, { scale: String(1 + (amount ?? 6) / 100) }];
    case 'float': {
      const lift = travel(from ?? 'top', amount ?? 8);
      return [{ translate: '0px 0px' }, { translate: lift, offset: 0.5 }, { translate: '0px 0px' }];
    }
    case 'pulse': {
      const scale = String(1 + (amount ?? 6) / 100);
      return [{ scale: '1' }, { scale, offset: 0.5 }, { scale: '1' }];
    }
    /* the text presets animate each unit (the clock splits the block) */
    case 'type-on':
      return [{ opacity: 0 }, { opacity: 1 }];
    case 'word-rise':
      return [
        { opacity: 0, translate: '0px 0.4em' },
        { opacity: 1, translate: '0px 0px' },
      ];
    case 'line-reveal':
      return [
        { opacity: 0, translate: '0px 0.6em' },
        { opacity: 1, translate: '0px 0px' },
      ];
    case 'glyph-stagger':
      return [
        { opacity: 0, translate: '0px 0.3em' },
        { opacity: 1, translate: '0px 0px' },
      ];
    case 'tracking-in':
      return [
        { opacity: 0, letterSpacing: '0.4em' },
        { opacity: 1, letterSpacing: 'normal' },
      ];
  }
}

/** The keyframes backwards: an exit plays its enter preset in reverse. */
function reversed(keyframes: MotionKeyframe[]): MotionKeyframe[] {
  return [...keyframes].reverse().map((frame) => {
    const { offset, ...rest } = frame;
    return offset === undefined ? rest : { ...rest, offset: 1 - offset };
  });
}

/** One effect as keyframes and timing. */
export function compileEffect(effect: Effect): CompiledEffect {
  const easing = cssEasing(effect.easing);
  const iterations = effect.repeat === 'slide' ? Number.POSITIVE_INFINITY : (effect.repeat ?? 1);
  const split = effectSplit(effect);
  const motion = effect.motion;
  let keyframes: MotionKeyframe[];
  let mainThread = false;
  let draw = false;
  if ('preset' in motion) {
    keyframes = presetKeyframes(motion.preset, motion.from, motion.amount);
    if (effect.role === 'exit') keyframes = reversed(keyframes);
    draw = motion.preset === 'draw';
    mainThread = motion.preset === 'wipe' || motion.preset === 'tracking-in';
  } else if ('keyframes' in motion) {
    keyframes = motion.keyframes.map((keyframe) => {
      const { frame, mainThread: slow } = safeStyle(keyframe.style);
      if (slow) mainThread = true;
      return {
        ...frame,
        offset: keyframe.at,
        ...(keyframe.easing !== undefined ? { easing: cssEasing(keyframe.easing) } : {}),
      };
    });
  } else {
    const path = `path('${motion.path.replace(/[^MLCQZmlcqz0-9.,eE+\-\s]/g, '')}')`;
    const rotate = motion.rotate === true ? 'auto' : '0deg';
    keyframes = [
      { offsetPath: path, offsetRotate: rotate, offsetAnchor: '0px 0px', offsetDistance: '0%' },
      { offsetPath: path, offsetRotate: rotate, offsetAnchor: '0px 0px', offsetDistance: '100%' },
    ];
    mainThread = true;
  }
  return {
    keyframes,
    duration: effect.durationMs,
    easing,
    iterations,
    ...(draw ? { draw: true as const } : {}),
    ...(split !== undefined ? { split } : {}),
    mainThread,
  };
}

/**
 * The stagger of a split effect over `count` units: its own, or the starts spread over half the
 * duration when it is 0 (Glyphfield). Each unit runs half the duration when the stagger is
 * spread, so the effect ends at its scheduled end; an explicit stagger runs each unit the whole
 * duration. Units past the cap start with the last one.
 */
export function unitTiming(
  split: Split,
  durationMs: number,
  count: number,
): { staggerMs: number; unitMs: number; delayOf: (index: number) => number } {
  const animated = Math.max(1, Math.min(count, MOTION_LIMITS.splitUnits));
  const spread = split.staggerMs === 0;
  const unitMs = spread && animated > 1 ? Math.max(1, durationMs / 2) : durationMs;
  const staggerMs = spread
    ? animated > 1
      ? (durationMs - unitMs) / (animated - 1)
      : 0
    : split.staggerMs;
  return {
    staggerMs,
    unitMs,
    delayOf: (index) => Math.min(index, animated - 1) * staggerMs,
  };
}

/** The slide transitions: the entering slide's keyframes for each name (Glyphfield's packages). */
function transitionKeyframes(name: TransitionName, from: Direction | undefined): MotionKeyframe[] {
  switch (name) {
    case 'none':
      return [];
    case 'crossfade':
      return [{ opacity: 0 }, { opacity: 1 }];
    case 'slide-fade':
      return [
        { opacity: 0, translate: travel(from ?? 'right', 96) },
        { opacity: 1, translate: '0px 0px' },
      ];
    case 'rise-fade':
      return [
        { opacity: 0, translate: travel(from ?? 'bottom', 40) },
        { opacity: 1, translate: '0px 0px' },
      ];
    case 'scale-fade':
      return [
        { opacity: 0, scale: '0.96' },
        { opacity: 1, scale: '1' },
      ];
    case 'zoom-through':
      return [
        { opacity: 0, scale: '1.15' },
        { opacity: 1, scale: '1' },
      ];
    case 'blur-swipe':
      return [
        { opacity: 0, filter: 'blur(12px)', translate: travel(from ?? 'right', 64) },
        { opacity: 1, filter: 'blur(0px)', translate: '0px 0px' },
      ];
    case 'flip-fade':
      return [
        { opacity: 0, transform: 'perspective(2400px) rotateY(24deg)' },
        { opacity: 1, transform: 'perspective(2400px) rotateY(0deg)' },
      ];
    case 'spring-pop':
      return [
        { opacity: 0, scale: '0.9' },
        { opacity: 1, scale: '1' },
      ];
    case 'rotate-fade':
      return [
        { opacity: 0, rotate: '-4deg', scale: '0.98' },
        { opacity: 1, rotate: '0deg', scale: '1' },
      ];
    case 'drift-fade':
      return [
        { opacity: 0, translate: '-32px 12px' },
        { opacity: 1, translate: '0px 0px' },
      ];
  }
}

/** A transition as the entering slide's keyframes and timing; `none` and 0 ms compile to no keyframes, a cut. */
export function compileTransition(transition: Transition): CompiledTransition {
  const keyframes =
    transition.durationMs > 0 ? transitionKeyframes(transition.name, transition.from) : [];
  return {
    keyframes,
    duration: transition.durationMs,
    easing:
      transition.name === 'spring-pop'
        ? cssEasing('overshoot')
        : transition.name === 'drift-fade'
          ? cssEasing('ease-in-out')
          : cssEasing('ease-out-expo'),
  };
}
