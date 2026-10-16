// The slide clock's model with its zod schemas (docs: HTML-SLIDES-DESIGN Part 2.2, 2.4): the
// effects, transitions and timed advance as the actions validate them, and the effect motion.add
// writes. The names, the types, the checks without zod and the rehearsal timeline live in
// `motion-core.ts`, which the page reads; this module re-exports all of it, so deck.ts, the
// actions and the CLI import one module.
import { z } from 'zod';

import { blockIdSchema, slugSchema } from './ids.ts';
import {
  DEFAULT_EFFECT_MS,
  DIRECTIONS,
  EASING_NAMES,
  EFFECT_PRESETS,
  EFFECT_ROLES,
  EFFECT_STARTS,
  keyframeValueProblem,
  effectProblem,
  MOTION_LIMITS,
  MOTION_PROPERTY,
  pathCommandCount,
  SPLIT_UNITS,
  TRANSITION_NAMES,
} from './motion-core.ts';
import type {
  Advance,
  Easing,
  Effect,
  EffectMotion,
  Keyframe,
  KeyframesMotion,
  PathMotion,
  PresetMotion,
  Split,
  Transition,
} from './motion-core.ts';

export * from './motion-core.ts';

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
// Edits the actions make

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
