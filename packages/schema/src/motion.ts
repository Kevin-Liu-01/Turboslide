// The slide clock's model (docs: HTML-SLIDES-DESIGN Part 2.1, 2.2). A slide carries effects
// (enter, emphasis, exit) that target its blocks by id, a transition into the slide and a timed
// advance out of it; the deck carries the defaults of the last two. An effect's motion is a
// preset by name, keyframes on CSS properties, or a motion path; it starts on a click, with the
// previous effect or after it. The effects compile into segments: segment 0 is the transition
// plus every effect before the first click, and each click effect opens the next segment.
// `scheduleOf` lays the segments on the rehearsal timeline (each click at the end of the previous
// segment), so any moment of a slide is a pure function of its time; `stateAt` answers which
// blocks show after step k without running anything. The names keep Glyphfield's
// (animationMotion.ts, renderFrame.ts). This module imports no other module of the document, so
// deck.ts, the renderer, the viewer and the CLI all read it.
import { z } from 'zod';

import { blockIdSchema, slugSchema } from './ids.ts';
import { isSafeStyleText } from './style-text.ts';

// ---------------------------------------------------------------------------------------------
// Names

export const EFFECT_ROLES = ['enter', 'emphasis', 'exit'] as const;
export type EffectRole = (typeof EFFECT_ROLES)[number];

/** click opens a new step; with starts at the previous effect's start; after at its end. */
export const EFFECT_STARTS = ['click', 'with', 'after'] as const;
export type EffectStart = (typeof EFFECT_STARTS)[number];

/** The block presets; an exit plays its preset backwards, so one list serves enter and exit. */
export const BLOCK_PRESETS = ['fade', 'rise-in', 'slide-in', 'pop-in', 'wipe', 'draw'] as const;
/** The emphasis presets: no visibility change. */
export const EMPHASIS_PRESETS = ['push-in', 'float', 'pulse'] as const;
/** The text presets, Glyphfield's six text entrances less none; each sets `split` itself. */
export const TEXT_PRESETS = [
  'type-on',
  'word-rise',
  'line-reveal',
  'glyph-stagger',
  'tracking-in',
] as const;
export const EFFECT_PRESETS = [...BLOCK_PRESETS, ...EMPHASIS_PRESETS, ...TEXT_PRESETS] as const;
export type EffectPreset = (typeof EFFECT_PRESETS)[number];
export type TextPreset = (typeof TEXT_PRESETS)[number];

export const SPLIT_UNITS = ['line', 'word', 'glyph'] as const;
export type SplitUnit = (typeof SPLIT_UNITS)[number];

/** The unit each text preset animates; a staggerMs of 0 spreads the starts over half the duration (Glyphfield). */
export const TEXT_PRESET_SPLIT: Readonly<Record<TextPreset, Split>> = {
  'type-on': { by: 'glyph', staggerMs: 0 },
  'word-rise': { by: 'word', staggerMs: 0 },
  'line-reveal': { by: 'line', staggerMs: 0 },
  'glyph-stagger': { by: 'glyph', staggerMs: 0 },
  'tracking-in': { by: 'line', staggerMs: 0 },
};

export const DIRECTIONS = ['left', 'right', 'top', 'bottom'] as const;
export type Direction = (typeof DIRECTIONS)[number];

export const EASING_NAMES = ['linear', 'ease-out-expo', 'ease-in-out', 'overshoot'] as const;
export type EasingName = (typeof EASING_NAMES)[number];
export type CubicBezier = [number, number, number, number];
export type Easing = EasingName | CubicBezier;

/** Glyphfield's easing constants as cubic Béziers. */
export const EASING_CURVES: Readonly<Record<EasingName, CubicBezier>> = {
  linear: [0, 0, 1, 1],
  'ease-out-expo': [0.16, 1, 0.3, 1],
  'ease-in-out': [0.45, 0, 0.55, 1],
  overshoot: [0.34, 1.56, 0.64, 1],
};

/**
 * The slide transitions: ten of Glyphfield's twelve transition packages under their names, and
 * none. morph-fade and type-delete stay out, since both morph one text scene into the next.
 * Absent keeps today's 120 ms fade and rise.
 */
export const TRANSITION_NAMES = [
  'none',
  'crossfade',
  'slide-fade',
  'rise-fade',
  'scale-fade',
  'zoom-through',
  'blur-swipe',
  'flip-fade',
  'spring-pop',
  'rotate-fade',
  'drift-fade',
] as const;
export type TransitionName = (typeof TRANSITION_NAMES)[number];

/** The bounds of section 2.2: Glyphfield's limits for keyframes and length. */
export const MOTION_LIMITS = {
  effectsPerSlide: 200,
  keyframesPerEffect: 32,
  propertiesPerKeyframe: 16,
  durationMs: 60_000,
  delayMs: 60_000,
  staggerMs: 2_000,
  repeat: 100,
  transitionMs: 3_000,
  advanceMs: 600_000,
  pathCommands: 64,
  pathLength: 4_000,
  splitUnits: 400,
} as const;

/** The default length of an effect an agent or the Animate command adds without one. */
export const DEFAULT_EFFECT_MS = 500;

// ---------------------------------------------------------------------------------------------
// Types

export type Keyframe = {
  /** 0 to 1 across the effect, rising from one keyframe to the next */
  at: number;
  /** CSS property to value; a custom property (`--x`) is allowed */
  style: Record<string, string>;
  /** the easing from this keyframe to the next */
  easing?: Easing;
};

export type PresetMotion = { preset: EffectPreset; from?: Direction; amount?: number };
export type KeyframesMotion = { keyframes: Keyframe[] };
/** `path` is SVG path data in sheet px, M L C Q and Z only; `rotate` turns the block along the path. */
export type PathMotion = { path: string; rotate?: true };
export type EffectMotion = PresetMotion | KeyframesMotion | PathMotion;

export type Split = { by: SplitUnit; staggerMs: number };

export type Effect = {
  id: string;
  block: string;
  role: EffectRole;
  motion: EffectMotion;
  start: EffectStart;
  delayMs?: number;
  durationMs: number;
  easing?: Easing;
  /** Emphasis only: a count, or 'slide' to repeat until the slide leaves. */
  repeat?: number | 'slide';
  /** Text blocks only: one animation per unit, `staggerMs` apart. */
  split?: Split;
};

export type Transition = { name: TransitionName; durationMs: number; from?: Direction };
/** Leave the slide `afterMs` after the end of its last step. */
export type Advance = { afterMs: number };

/** The slide fields this module reads. */
export type MotionFields = { effects?: Effect[]; transition?: Transition; advance?: Advance };

// ---------------------------------------------------------------------------------------------
// Schemas

const easingSchema = z
  .union([
    z.enum(EASING_NAMES),
    z.tuple([z.number().min(0).max(1), z.number(), z.number().min(0).max(1), z.number()]),
  ])
  .describe(
    'linear, ease-out-expo, ease-in-out, overshoot, or a cubic Bézier [x1, y1, x2, y2] with x1 and x2 from 0 to 1',
  );

/** A CSS property name: a lower case name with an optional vendor dash, or a custom property. */
export const MOTION_PROPERTY = /^(?:-?[a-z][a-z-]*|--[a-z0-9-]+)$/;

/**
 * Why a keyframe value is refused, or null. The value runs inside the block only: no markup
 * opener (`safeStyleText`), no declaration or rule break, no script URL or `expression(`, no
 * `@import`, and `url()` only for the deck's assets or an inline picture. `position` cannot be
 * fixed or sticky, so an effect never lifts a block over the editor's chrome.
 */
export function keyframeValueProblem(property: string, value: string): string | null {
  if (value.length > 400) return 'is longer than 400 characters';
  if (!isSafeStyleText(value)) return 'holds markup';
  if (/[;{}\\]/.test(value)) return 'holds a ; { } or \\, which would end the declaration';
  const lower = value.toLowerCase();
  if (/expression\s*\(|javascript:|@import|behavior\s*:/.test(lower))
    return 'holds a script form (expression, javascript:, @import)';
  for (const match of lower.matchAll(/url\(\s*(['"]?)([^'")]*)/g)) {
    const target = match[2] ?? '';
    if (!target.startsWith('assets/') && !target.startsWith('data:image/'))
      return 'loads a url outside the deck’s assets/ and data:image/';
  }
  if (property === 'position' && /\b(fixed|sticky)\b/.test(lower))
    return 'would lift the block out of the slide (position fixed or sticky)';
  return null;
}

const keyframeStyleSchema = z.record(z.string(), z.string()).superRefine((style, ctx) => {
  const entries = Object.entries(style);
  if (entries.length === 0)
    ctx.addIssue({ code: 'custom', message: 'A keyframe sets at least one property' });
  if (entries.length > MOTION_LIMITS.propertiesPerKeyframe)
    ctx.addIssue({
      code: 'custom',
      message: `A keyframe sets at most ${MOTION_LIMITS.propertiesPerKeyframe} properties`,
    });
  for (const [property, value] of entries) {
    if (!MOTION_PROPERTY.test(property)) {
      ctx.addIssue({
        code: 'custom',
        path: [property],
        message: `"${property}" is not a CSS property name: lower case letters and hyphens, or --name for a custom property`,
      });
      continue;
    }
    const problem = keyframeValueProblem(property, value);
    if (problem !== null)
      ctx.addIssue({
        code: 'custom',
        path: [property],
        message: `The value of ${property} ${problem}`,
      });
  }
});

export const keyframeSchema = z.strictObject({
  at: z.number().min(0).max(1).describe('0 to 1 across the effect'),
  style: keyframeStyleSchema.describe('CSS property to value, at most 16 properties'),
  easing: easingSchema.optional(),
}) satisfies z.ZodType<Keyframe>;

/** The number of drawing commands in SVG path data, or null when it holds anything but M L C Q Z and numbers. */
export function pathCommandCount(path: string): number | null {
  if (!/^[\sMLCQZmlcqz0-9.,eE+-]*$/.test(path)) return null;
  if (!/^\s*[Mm]/.test(path)) return null;
  return (path.match(/[MLCQZmlcqz]/g) ?? []).length;
}

const pathSchema = z
  .string()
  .max(MOTION_LIMITS.pathLength)
  .superRefine((path, ctx) => {
    const count = pathCommandCount(path);
    if (count === null)
      ctx.addIssue({
        code: 'custom',
        message: 'A motion path is SVG path data that starts with M and uses M, L, C, Q and Z only',
      });
    else if (count > MOTION_LIMITS.pathCommands)
      ctx.addIssue({
        code: 'custom',
        message: `A motion path has at most ${MOTION_LIMITS.pathCommands} commands; this one has ${count}`,
      });
  })
  .describe('SVG path data in sheet px: M, L, C, Q and Z, at most 64 commands');

export const presetMotionSchema = z.strictObject({
  preset: z.enum(EFFECT_PRESETS),
  from: z.enum(DIRECTIONS).optional().describe('The side slide-in and wipe come from'),
  amount: z
    .number()
    .min(0)
    .max(2000)
    .optional()
    .describe('The travel in sheet px, or the scale change in percent for pop-in and push-in'),
}) satisfies z.ZodType<PresetMotion>;

export const keyframesMotionSchema = z.strictObject({
  keyframes: z
    .array(keyframeSchema)
    .min(2)
    .max(MOTION_LIMITS.keyframesPerEffect)
    .superRefine((keyframes, ctx) => {
      keyframes.forEach((keyframe, index) => {
        const before = keyframes[index - 1];
        if (before !== undefined && keyframe.at <= before.at)
          ctx.addIssue({
            code: 'custom',
            path: [index, 'at'],
            message: `Keyframe at values rise: ${keyframe.at} follows ${before.at}`,
          });
      });
    })
    .describe('Two to 32 keyframes, at rising from 0 to 1'),
}) satisfies z.ZodType<KeyframesMotion>;

export const pathMotionSchema = z.strictObject({
  path: pathSchema,
  rotate: z.literal(true).optional().describe('Turn the block along the path'),
}) satisfies z.ZodType<PathMotion>;

export const effectMotionSchema = z.union([
  presetMotionSchema,
  keyframesMotionSchema,
  pathMotionSchema,
]) satisfies z.ZodType<EffectMotion>;

export const splitSchema = z.strictObject({
  by: z.enum(SPLIT_UNITS),
  staggerMs: z
    .number()
    .int()
    .min(0)
    .max(MOTION_LIMITS.staggerMs)
    .describe('Milliseconds between units; 0 spreads the starts over half the duration'),
}) satisfies z.ZodType<Split>;

/** One effect's fields; the refinements across fields are `effectProblem`'s. */
const effectFields = {
  id: slugSchema.describe('The effect id, unique on the slide'),
  block: blockIdSchema.describe('The block the effect animates'),
  role: z.enum(EFFECT_ROLES).describe('enter (hidden before), emphasis, or exit (hidden after)'),
  motion: effectMotionSchema.describe('A preset, keyframes, or a motion path'),
  start: z.enum(EFFECT_STARTS).describe('click, with the previous effect, or after it'),
  delayMs: z.number().int().min(0).max(MOTION_LIMITS.delayMs).optional(),
  durationMs: z.number().int().min(1).max(MOTION_LIMITS.durationMs),
  easing: easingSchema.optional(),
  repeat: z
    .union([z.number().int().min(1).max(MOTION_LIMITS.repeat), z.literal('slide')])
    .optional()
    .describe("Emphasis only: a count, or 'slide' to repeat until the slide leaves"),
  split: splitSchema.optional().describe('Text blocks only: one animation per line, word or glyph'),
};

/** Why an effect's fields do not fit together, or null (the refinements zod cannot state per field). */
export function effectProblem(effect: Omit<Effect, 'id'>): string | null {
  if (effect.repeat !== undefined && effect.role !== 'emphasis')
    return 'repeat is for emphasis effects only';
  const motion = effect.motion;
  if ('preset' in motion) {
    const preset = motion.preset;
    if ((EMPHASIS_PRESETS as ReadonlyArray<string>).includes(preset) && effect.role !== 'emphasis')
      return `${preset} is an emphasis preset; enter and exit take ${[...BLOCK_PRESETS, ...TEXT_PRESETS].join(', ')}`;
    if (!(EMPHASIS_PRESETS as ReadonlyArray<string>).includes(preset) && effect.role === 'emphasis')
      return `${preset} is an enter and exit preset; emphasis takes ${EMPHASIS_PRESETS.join(', ')}, keyframes or a path`;
  }
  return null;
}

export const effectSchema = z.strictObject(effectFields).superRefine((effect, ctx) => {
  const problem = effectProblem(effect as Effect);
  if (problem !== null) ctx.addIssue({ code: 'custom', message: problem });
}) satisfies z.ZodType<Effect>;

/** An effect as motion.add takes it: no id, the action answers one. */
export const newEffectSchema = z
  .strictObject({
    block: effectFields.block,
    role: effectFields.role,
    motion: effectFields.motion,
    start: effectFields.start.optional().describe('click when absent'),
    delayMs: effectFields.delayMs,
    durationMs: effectFields.durationMs.optional().describe('500 ms when absent'),
    easing: effectFields.easing,
    repeat: effectFields.repeat,
    split: effectFields.split,
  })
  .superRefine((effect, ctx) => {
    const problem = effectProblem({
      ...effect,
      start: effect.start ?? 'click',
      durationMs: effect.durationMs ?? DEFAULT_EFFECT_MS,
    } as Omit<Effect, 'id'>);
    if (problem !== null) ctx.addIssue({ code: 'custom', message: problem });
  });
export type NewEffect = z.infer<typeof newEffectSchema>;

export const effectsSchema = z
  .array(effectSchema)
  .max(MOTION_LIMITS.effectsPerSlide)
  .superRefine((effects, ctx) => {
    const seen = new Set<string>();
    effects.forEach((effect, index) => {
      if (seen.has(effect.id))
        ctx.addIssue({
          code: 'custom',
          path: [index, 'id'],
          message: `Effect id "${effect.id}" is used twice on the slide`,
        });
      seen.add(effect.id);
    });
  }) satisfies z.ZodType<Effect[]>;

export const transitionSchema = z.strictObject({
  name: z.enum(TRANSITION_NAMES),
  durationMs: z.number().int().min(0).max(MOTION_LIMITS.transitionMs),
  from: z.enum(DIRECTIONS).optional().describe('The side a directional transition comes from'),
}) satisfies z.ZodType<Transition>;

export const advanceSchema = z.strictObject({
  afterMs: z
    .number()
    .int()
    .min(0)
    .max(MOTION_LIMITS.advanceMs)
    .describe('Milliseconds after the last step ends'),
}) satisfies z.ZodType<Advance>;

// ---------------------------------------------------------------------------------------------
// Resolution

/** The cubic Bézier an easing names. */
export function easingCurve(easing: Easing | undefined): CubicBezier {
  if (easing === undefined) return EASING_CURVES['ease-out-expo'];
  return typeof easing === 'string' ? EASING_CURVES[easing] : easing;
}

/** The split an effect animates by: its own, else its text preset's, else none. */
export function effectSplit(effect: Pick<Effect, 'motion' | 'split'>): Split | undefined {
  if (effect.split !== undefined) return effect.split;
  if (
    'preset' in effect.motion &&
    (TEXT_PRESETS as ReadonlyArray<string>).includes(effect.motion.preset)
  )
    return TEXT_PRESET_SPLIT[effect.motion.preset as TextPreset];
  return undefined;
}

/** The slide's transition: its own, else the deck's, else none (today's 120 ms fade and rise). */
export function slideTransition(
  defaults: { transition?: Transition } | undefined,
  slide: MotionFields,
): Transition | undefined {
  return slide.transition ?? defaults?.transition;
}

/** The slide's timed advance: its own, else the deck's, else none (the slide waits for a click). */
export function slideAdvance(
  defaults: { advance?: Advance } | undefined,
  slide: MotionFields,
): Advance | undefined {
  return slide.advance ?? defaults?.advance;
}

// ---------------------------------------------------------------------------------------------
// The rehearsal schedule

export type ScheduledEffect = {
  id: string;
  block: string;
  role: EffectRole;
  /** the step that plays it: 0 before the first click, k after click k */
  step: number;
  /** ms since the slide appeared */
  startMs: number;
  /** the end of one run; an emphasis repeated until the slide leaves ends its first run here */
  endMs: number;
};

export type Segment = { step: number; startMs: number; endMs: number };

export type Schedule = {
  /** the transition's length; segment 0's effects start after it */
  transitionMs: number;
  /** the clicks the slide waits for */
  steps: number;
  /** segment 0, then one per click */
  segments: Segment[];
  /** every effect whose block is on the slide, in order; a dangling effect is skipped */
  effects: ScheduledEffect[];
  /** the end of the last segment */
  lengthMs: number;
};

export type ScheduleOptions = {
  /** The time of each click; absent clicks sit at the end of the previous segment (the rehearsal). */
  clicks?: ReadonlyArray<number>;
  /** The slide's resolved transition (`slideTransition`). */
  transition?: Transition;
  /** The block ids on the slide; an effect whose block is not among them is skipped. Absent keeps every effect. */
  blocks?: ReadonlySet<string>;
};

/** The length of one effect's run: its duration times its repeat count. */
function runMs(effect: Effect): number {
  const repeat = typeof effect.repeat === 'number' ? effect.repeat : 1;
  return effect.durationMs * repeat;
}

/**
 * The rehearsal timeline of a slide (2.1): segment 0 starts at 0 with the transition, each click
 * effect opens a segment at its click (by default the end of the previous segment), `with` starts
 * at the previous effect's start and `after` at its end, each plus its delay.
 */
export function scheduleOf(slide: MotionFields, options: ScheduleOptions = {}): Schedule {
  const transitionMs = options.transition?.durationMs ?? 0;
  const segments: Segment[] = [{ step: 0, startMs: 0, endMs: transitionMs }];
  const effects: ScheduledEffect[] = [];
  let previous = { startMs: transitionMs, endMs: transitionMs };
  for (const effect of slide.effects ?? []) {
    if (options.blocks !== undefined && !options.blocks.has(effect.block)) continue;
    const delay = effect.delayMs ?? 0;
    let segment = segments[segments.length - 1] as Segment;
    let startMs: number;
    if (effect.start === 'click') {
      const step = segments.length;
      const at = Math.max(options.clicks?.[step - 1] ?? segment.endMs, segment.startMs);
      segment = { step, startMs: at, endMs: at };
      segments.push(segment);
      startMs = at + delay;
    } else if (effect.start === 'with') {
      startMs = previous.startMs + delay;
    } else {
      startMs = previous.endMs + delay;
    }
    const endMs = startMs + runMs(effect);
    segment.endMs = Math.max(segment.endMs, endMs);
    effects.push({
      id: effect.id,
      block: effect.block,
      role: effect.role,
      step: segment.step,
      startMs,
      endMs,
    });
    previous = { startMs, endMs };
  }
  return {
    transitionMs,
    steps: segments.length - 1,
    segments,
    effects,
    lengthMs: (segments[segments.length - 1] as Segment).endMs,
  };
}

/**
 * Which blocks show after step `step` (0 is the state once segment 0 has played), by block id,
 * for the blocks that have an enter or exit effect; every other block shows. A block whose first
 * visibility effect is an enter is hidden until it plays; an exit hides it once it has played.
 */
export function stateAt(schedule: Schedule, step: number): Record<string, boolean> {
  const visible: Record<string, boolean> = {};
  for (const effect of schedule.effects) {
    if (effect.role === 'emphasis') continue;
    if (!(effect.block in visible)) visible[effect.block] = effect.role !== 'enter';
    if (effect.step <= step) visible[effect.block] = effect.role === 'enter';
  }
  return visible;
}

// ---------------------------------------------------------------------------------------------
// Edits the actions make

/** A fresh effect id on the slide: fx-1, fx-2, ... */
export function freeEffectId(effects: ReadonlyArray<Pick<Effect, 'id'>>): string {
  const taken = new Set(effects.map((effect) => effect.id));
  for (let n = 1; ; n += 1) {
    const id = `fx-${n}`;
    if (!taken.has(id)) return id;
  }
}

/** The effect motion.add writes: the defaults filled, the id answered. */
export function effectFromInput(input: NewEffect, id: string): Effect {
  return {
    id,
    block: input.block,
    role: input.role,
    motion: input.motion as EffectMotion,
    start: input.start ?? 'click',
    ...(input.delayMs !== undefined ? { delayMs: input.delayMs } : {}),
    durationMs: input.durationMs ?? DEFAULT_EFFECT_MS,
    ...(input.easing !== undefined ? { easing: input.easing as Easing } : {}),
    ...(input.repeat !== undefined ? { repeat: input.repeat } : {}),
    ...(input.split !== undefined ? { split: input.split } : {}),
  };
}

/** The effects with one moved to `index` (clamped). */
export function moveEffect(
  effects: ReadonlyArray<Effect>,
  effectId: string,
  index: number,
): Effect[] {
  const from = effects.findIndex((effect) => effect.id === effectId);
  if (from < 0) return [...effects];
  const next = [...effects];
  const [moved] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(index, next.length)), 0, moved as Effect);
  return next;
}

/**
 * The effects after blocks are removed: the removed blocks' effects go with them, as block.remove
 * writes. Answers the same array when nothing targeted them.
 */
export function effectsWithoutBlocks(
  effects: ReadonlyArray<Effect>,
  removed: ReadonlySet<string>,
): Effect[] {
  return effects.filter((effect) => !removed.has(effect.block));
}

/**
 * The effects after blocks are duplicated: each copied block's effects are copied under new ids
 * onto the copy, after the originals, as block.duplicate writes.
 */
export function effectsWithCopies(
  effects: ReadonlyArray<Effect>,
  copies: ReadonlyMap<string, string>,
): Effect[] {
  const next = [...effects];
  for (const effect of effects) {
    const copy = copies.get(effect.block);
    if (copy === undefined) continue;
    next.push({ ...structuredClone(effect), id: freeEffectId(next), block: copy });
  }
  return next;
}

/** The number of units a split animates in a block's plain text; lines are bounded by words. */
export function splitUnitCount(text: string, by: SplitUnit): number {
  if (by === 'glyph') return [...text.replace(/\s+/g, '')].length;
  return text.split(/\s+/).filter(Boolean).length;
}
