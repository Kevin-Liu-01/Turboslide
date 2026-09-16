// Motion on the slide (gslides-parity SPEC-5 1.3, 0.8, 0.10 to 0.13): the transition kinds, the
// animation effects, the triggers, the fly directions, the duration bounds and defaults, the
// `Animation` record `SlideBase.animations` holds in the Motion panel's order, the schedule types
// `compileMotion` answers, the class and attribute names the show toggles on the rendered nodes,
// and `normalizeMotion`, the reducer's normalisation that drops entries whose block is gone
// (called on `block.remove` and `slide.replace`; never a validator refusal). The labels in
// `MOTION_LABELS` are Google's words in Google's order and the one table the panel, the CLI help,
// the palette and the skills read. The integrator landed this module on day 0 as the typed seam
// of SPEC-5 1.6; from day 1 it is B1's (MILESTONES-5 B1 "Owns"), with `motion.test.ts`.
//
// The module is a leaf: it imports zod, the id schemas and types alone. `deck.ts` evaluates
// `animationsSchema` at its top level, so a runtime import of `deck.ts` from here would make the
// evaluation order depend on which module a caller loads first (build-5/b1.md, day 1). The
// schedule the show and every writer read (`compileMotion`, `motionCss`) lives in
// `packages/render/src/motion.ts`, because it needs the renderer's paragraph counts.
import { z } from 'zod';
import type { Block, BlockType } from './blocks.ts';
import type { Slide } from './deck.ts';
import type { BlockId, SlideId } from './ids.ts';
import { blockIdSchema, slugSchema } from './ids.ts';
import type { Box } from './render.ts';
import { splitParagraphs } from './text.ts';

export const TRANSITION_KINDS = [
  'none',
  'dissolve',
  'fade',
  'slideRight',
  'slideLeft',
  'flip',
  'cube',
  'gallery',
] as const;
export type TransitionKind = (typeof TRANSITION_KINDS)[number];

export const ANIMATION_EFFECTS = [
  'appear',
  'disappear',
  'fadeIn',
  'fadeOut',
  'flyIn',
  'flyOut',
  'zoomIn',
  'zoomOut',
  'spin',
  'playMedia',
] as const;
export type AnimationEffect = (typeof ANIMATION_EFFECTS)[number];

export const ANIMATION_TRIGGERS = ['click', 'afterPrevious', 'withPrevious'] as const;
export type AnimationTrigger = (typeof ANIMATION_TRIGGERS)[number];

export const FLY_DIRECTIONS = ['left', 'right', 'top', 'bottom'] as const;
export type FlyDirection = (typeof FLY_DIRECTIONS)[number];

/** The effects that hide their block until their step (SPEC-5 0.10). */
export const ENTRANCE_EFFECTS: ReadonlySet<AnimationEffect> = new Set<AnimationEffect>([
  'appear',
  'fadeIn',
  'flyIn',
  'zoomIn',
]);

/** The effects that hide their block after their step (SPEC-5 0.10). */
export const EXIT_EFFECTS: ReadonlySet<AnimationEffect> = new Set<AnimationEffect>([
  'disappear',
  'fadeOut',
  'flyOut',
  'zoomOut',
]);

/** The two fly effects, the ones that carry a `direction` (SPEC-5 1.3). */
export const FLY_EFFECTS: ReadonlySet<AnimationEffect> = new Set<AnimationEffect>([
  'flyIn',
  'flyOut',
]);

/**
 * What an effect does to its block's visibility (SPEC-5 0.10): an entrance shows it, an exit hides
 * it, an emphasis (Spin) changes nothing, a media effect starts the element.
 */
export type EffectClass = 'entrance' | 'exit' | 'emphasis' | 'media';

export function effectClass(effect: AnimationEffect): EffectClass {
  if (ENTRANCE_EFFECTS.has(effect)) return 'entrance';
  if (EXIT_EFFECTS.has(effect)) return 'exit';
  if (effect === 'playMedia') return 'media';
  return 'emphasis';
}

/**
 * The duration bounds and the slider's three labelled stops (SPEC-5 0.11): Slow 2000, Medium
 * 1000, Fast 500; a new animation is Appear on click at 500 ms and a new transition 500 ms
 * (1000 ms is Kevin's alternative, SPEC-5 17 row 12).
 */
export const DURATION_MS = {
  min: 100,
  max: 5000,
  slow: 2000,
  medium: 1000,
  fast: 500,
  defaultAnimation: 500,
  defaultTransition: 500,
} as const;

/**
 * The length of an Appear or a Disappear as the show and the file play it: PowerPoint's own
 * files write the visibility switch with `dur="1"` (R01 6.4), so the switch is instant and an
 * After previous chained behind it starts one millisecond later. The row's `durationMs` is kept
 * on the record (Google shows the slider on every type; unverified, R01 8 item 3) and ignored by
 * the compiler for these two effects.
 */
export const SWITCH_MS = 1;

/** The most entries one slide's list may hold (SPEC-5 1.2, the `motion` validator code). */
export const ANIMATIONS_MAX = 200;

export type SlideTransition = { kind: TransitionKind; durationMs: number };

export type Animation = {
  /** a slug unique in the slide, `a1`, `a2` */
  id: string;
  blockId: BlockId;
  effect: AnimationEffect;
  /** flyIn and flyOut only */
  direction?: FlyDirection;
  trigger: AnimationTrigger;
  durationMs: number;
  /** blocks with paragraphs or list items only */
  byParagraph?: true;
};

const durationMs = z
  .number()
  .int()
  .min(DURATION_MS.min)
  .max(DURATION_MS.max)
  .describe('Milliseconds, 100 to 5000 (gslides-parity SPEC-5 0.11)');

export const transitionSchema = z.strictObject({
  kind: z.enum(TRANSITION_KINDS),
  durationMs,
}) satisfies z.ZodType<SlideTransition>;

/** An animation id: a short slug unique in its slide (`a1`, `a2`). */
export const animationIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]{0,31}$/, 'an animation id: a lower-case slug of at most 32 characters');

export const animationSchema = z.strictObject({
  id: animationIdSchema,
  blockId: blockIdSchema,
  effect: z.enum(ANIMATION_EFFECTS),
  direction: z.enum(FLY_DIRECTIONS).optional(),
  trigger: z.enum(ANIMATION_TRIGGERS),
  durationMs,
  byParagraph: z.literal(true).optional(),
}) satisfies z.ZodType<Animation>;

export const animationsSchema = z.array(animationSchema).max(ANIMATIONS_MAX);

/**
 * The smallest free id of the `a<n>` form for a new row (`motion.add`): `a1` on an empty list,
 * the first gap otherwise, so an id is never reused while its row exists.
 */
export function nextAnimationId(animations: ReadonlyArray<Pick<Animation, 'id'>>): string {
  const taken = new Set(animations.map((animation) => animation.id));
  let n = 1;
  while (taken.has(`a${n}`)) n += 1;
  return `a${n}`;
}

// ---------------------------------------------------------------------------------------------
// The schedule (SPEC-5 1.3, 0.4): the one output of `compileMotion` in packages/render/src/motion.ts
// that the show, the standalone script, the PPTX timing writer, the ODP animation writer and the
// `motion.compile` action read. The types live here so the action table can validate the
// answer; the compiler needs the renderer's paragraph counts and stays in the render package.

export type MotionEffect = {
  animation: Animation;
  /** milliseconds after the step starts */
  delayMs: number;
  /**
   * The length the effect plays, in milliseconds: the row's `durationMs` for the visual effects,
   * `SWITCH_MS` for Appear and Disappear, the media's remaining length after the trim for Play,
   * or the step's length for a looping medium (SPEC-5 1.3).
   */
  durationMs: number;
  /** the paragraph index under `byParagraph`, absent otherwise */
  paragraph?: number;
  /**
   * The block's `pos` box in sheet pixels when the block is a positioned object, so the fly
   * keyframes travel exactly to the page edge (R05 9.4); absent on a flow layout block, which
   * flies by the page dimension.
   */
  box?: Box;
};

export type MotionStep = {
  effects: MotionEffect[];
  /** max(delay + duration) over the effects */
  durationMs: number;
};

export type MotionSchedule = {
  /** the slide the schedule belongs to; the stylesheet's rules are scoped by it */
  slideId: SlideId;
  /** steps[0] plays on entry, the rest on clicks */
  steps: MotionStep[];
  /** entrance effects hide their block first */
  hiddenAtStart: BlockId[];
  /** the transition into the slide; null when absent or `none` */
  transition: SlideTransition | null;
  /** an animation whose block has no rendered node */
  skipped: { animationId: string; reason: string }[];
};

const boxSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);

export const motionEffectSchema = z.strictObject({
  animation: animationSchema,
  delayMs: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
  paragraph: z.number().int().nonnegative().optional(),
  box: boxSchema.optional(),
}) satisfies z.ZodType<MotionEffect>;

export const motionStepSchema = z.strictObject({
  effects: z.array(motionEffectSchema),
  durationMs: z.number().int().nonnegative(),
}) satisfies z.ZodType<MotionStep>;

export const motionScheduleSchema = z.strictObject({
  slideId: slugSchema,
  steps: z.array(motionStepSchema),
  hiddenAtStart: z.array(blockIdSchema),
  transition: transitionSchema.nullable(),
  skipped: z.array(z.strictObject({ animationId: z.string(), reason: z.string() })),
}) satisfies z.ZodType<MotionSchedule>;

/**
 * The transition the show plays into a slide: the record when its kind is not `none`, else null
 * (the panel's None writes `kind: 'none'`, which every reader treats as absent, SPEC-5 2.1).
 */
export function effectiveTransition(
  transition: SlideTransition | undefined,
): SlideTransition | null {
  if (transition === undefined || transition.kind === 'none') return null;
  return transition;
}

/** The schedule of a slide with no motion: no steps, nothing hidden, the transition if any. */
export function emptySchedule(
  slideId: SlideId,
  transition: SlideTransition | undefined,
): MotionSchedule {
  return {
    slideId,
    steps: [],
    hiddenAtStart: [],
    transition: effectiveTransition(transition),
    skipped: [],
  };
}

/** True when a slide carries motion the filmstrip glyph and the export report count (SPEC-5 0.3). */
export function slideHasMotion(slide: Pick<Slide, 'transition' | 'animations'>): boolean {
  return (
    effectiveTransition(slide.transition) !== null ||
    (slide.animations !== undefined && slide.animations.length > 0)
  );
}

// ---------------------------------------------------------------------------------------------
// The show's contract (SPEC-5 1.5, 2.2): the attribute the layer addresses a block by, the
// attributes it sets while playing and the classes it toggles; `motionCss` writes its selectors
// from these names and the present layer and the standalone motion script read them.

export const MOTION_ATTRS = {
  /** on the slide root: the slide id (`renderSlide` always writes it) */
  slide: 'data-slide',
  /** on every top level block root: the block id (`renderSlide` under `blockAttrs` or `motion`) */
  block: 'data-block',
  /** on the slide root: `"1"` when the slide carries motion, for the filmstrip glyph */
  motion: 'data-motion',
  /** on the slide root while the show is on it: the step reached, 0 for the entry step */
  step: 'data-step',
  /** on a paragraph node the layer stamped: its index in the block, for `byParagraph` targets */
  paragraph: 'data-para',
  /** on an ancestor of both mounted slides during a transition: the incoming slide's id */
  transition: 'data-transition',
  /** beside `data-transition` while going back: the transition plays reversed */
  reverse: 'data-reverse',
} as const;

export const MOTION_CLASSES = {
  /** an entrance's block before its step, an exit's block after; `visibility: hidden` */
  hidden: 'is-hidden',
  /** the block (or paragraph) an entrance plays on; the incoming slide during a transition */
  entering: 'is-entering',
  /** the block (or paragraph) an exit plays on; the outgoing slide during a transition */
  leaving: 'is-leaving',
  /** the block a Spin plays on */
  emphasis: 'is-emph',
} as const;

// ---------------------------------------------------------------------------------------------
// Labels

/**
 * Google's labels (SPEC-5 1.3): the fifteen animation types in Google's order, the triggers and
 * the eight transitions; `playMedia` prints as Play followed by the media's title, which the
 * caller appends.
 */
export const MOTION_LABELS = {
  effects: {
    appear: 'Appear',
    disappear: 'Disappear',
    fadeIn: 'Fade in',
    fadeOut: 'Fade out',
    flyIn: 'Fly in',
    flyOut: 'Fly out',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    spin: 'Spin',
    playMedia: 'Play',
  } satisfies Readonly<Record<AnimationEffect, string>>,
  /** the fly effects print with their direction: Fly in from left, Fly out to top */
  flyIn: {
    left: 'Fly in from left',
    right: 'Fly in from right',
    bottom: 'Fly in from bottom',
    top: 'Fly in from top',
  } satisfies Readonly<Record<FlyDirection, string>>,
  flyOut: {
    left: 'Fly out to left',
    right: 'Fly out to right',
    bottom: 'Fly out to bottom',
    top: 'Fly out to top',
  } satisfies Readonly<Record<FlyDirection, string>>,
  triggers: {
    click: 'On click',
    afterPrevious: 'After previous',
    withPrevious: 'With previous',
  } satisfies Readonly<Record<AnimationTrigger, string>>,
  transitions: {
    none: 'None',
    dissolve: 'Dissolve',
    fade: 'Fade',
    slideRight: 'Slide from right',
    slideLeft: 'Slide from left',
    flip: 'Flip',
    cube: 'Cube',
    gallery: 'Gallery',
  } satisfies Readonly<Record<TransitionKind, string>>,
  /** the slider's labelled stops (SPEC-5 0.11) */
  speeds: { slow: 'Slow', medium: 'Medium', fast: 'Fast' },
} as const;

/**
 * The panel's fifteen animation labels in Google's order (SPEC-5 1.3): Appear, Disappear, Fade
 * in, Fade out, the four Fly in, the four Fly out, Zoom in, Zoom out, Spin.
 */
export const ANIMATION_LABELS_IN_ORDER: ReadonlyArray<string> = [
  MOTION_LABELS.effects.appear,
  MOTION_LABELS.effects.disappear,
  MOTION_LABELS.effects.fadeIn,
  MOTION_LABELS.effects.fadeOut,
  MOTION_LABELS.flyIn.left,
  MOTION_LABELS.flyIn.right,
  MOTION_LABELS.flyIn.bottom,
  MOTION_LABELS.flyIn.top,
  MOTION_LABELS.flyOut.left,
  MOTION_LABELS.flyOut.right,
  MOTION_LABELS.flyOut.bottom,
  MOTION_LABELS.flyOut.top,
  MOTION_LABELS.effects.zoomIn,
  MOTION_LABELS.effects.zoomOut,
  MOTION_LABELS.effects.spin,
];

/**
 * The fifteen panel rows in Google's order as effect and direction pairs, the value each label of
 * `ANIMATION_LABELS_IN_ORDER` writes through `motion.update`.
 */
export const ANIMATION_CHOICES_IN_ORDER: ReadonlyArray<Pick<Animation, 'effect' | 'direction'>> = [
  { effect: 'appear' },
  { effect: 'disappear' },
  { effect: 'fadeIn' },
  { effect: 'fadeOut' },
  { effect: 'flyIn', direction: 'left' },
  { effect: 'flyIn', direction: 'right' },
  { effect: 'flyIn', direction: 'bottom' },
  { effect: 'flyIn', direction: 'top' },
  { effect: 'flyOut', direction: 'left' },
  { effect: 'flyOut', direction: 'right' },
  { effect: 'flyOut', direction: 'bottom' },
  { effect: 'flyOut', direction: 'top' },
  { effect: 'zoomIn' },
  { effect: 'zoomOut' },
  { effect: 'spin' },
];

/** The label of one animation record as the panel prints it. */
export function animationLabel(animation: Pick<Animation, 'effect' | 'direction'>): string {
  if (animation.effect === 'flyIn' && animation.direction !== undefined)
    return MOTION_LABELS.flyIn[animation.direction];
  if (animation.effect === 'flyOut' && animation.direction !== undefined)
    return MOTION_LABELS.flyOut[animation.direction];
  return MOTION_LABELS.effects[animation.effect];
}

// ---------------------------------------------------------------------------------------------
// Paragraph carriers (SPEC-5 2.1 "By paragraph")

/**
 * The block types whose rows can play By paragraph (SPEC-5 2.1): the carriers with paragraphs
 * (`paragraph`, `text`, `box`, a `shape` with text) or items (`plain`, `refs`, `rows`). A picture,
 * a table, a chart or a media block animates as one object, Google's rule (R01 3).
 */
export const PARAGRAPH_CARRIER_TYPES: ReadonlySet<BlockType> = new Set<BlockType>([
  'paragraph',
  'text',
  'box',
  'shape',
  'plain',
  'refs',
  'rows',
]);

/**
 * The paragraph count of a block from the document alone (SPEC-5 1.3): the paragraphs of a
 * multiline Text (the renderer draws one `.para` span each, `text.ts` writes one `a:p` each), or
 * the items of a list block; 0 for a block without paragraphs, where By paragraph does not apply.
 * The show and the exporter count the rendered nodes and the scene lines instead, and agree with
 * this number by construction; the validator and the panel read this one.
 */
export function blockParagraphCount(block: Block): number {
  switch (block.type) {
    case 'paragraph':
    case 'text':
      return block.text === '' ? 0 : splitParagraphs(block.text).length;
    case 'box':
    case 'shape':
      return block.text === undefined || block.text === '' ? 0 : splitParagraphs(block.text).length;
    case 'plain':
    case 'refs':
    case 'rows':
      return block.items.length;
    default:
      return 0;
  }
}

// ---------------------------------------------------------------------------------------------
// Normalisation

/**
 * The top level blocks of a slide, the targets an animation may name (SPEC-5 0.8): the slot
 * blocks of a content slide, the plate blocks of a picture kind, none on a title or statement
 * slide (whose heading and lead are slide fields, not blocks). The same walk as `slideBlocks` in
 * deck.ts, spelled here so this module stays a leaf.
 */
export function motionTargets(slide: Slide): Block[] {
  if (slide.kind === 'content') return Object.values(slide.slots).flat();
  if (slide.kind === 'opener' || slide.kind === 'mood' || slide.kind === 'closing')
    return slide.plate.blocks;
  return [];
}

/**
 * Drops the animations whose block is gone (SPEC-5 0.8): the reducer calls it after `block.remove`
 * and `slide.replace`, so a stale entry never reaches the validator. Returns the same slide when
 * nothing changed, a shallow copy with the filtered list otherwise; an empty list is removed.
 */
export function normalizeMotion<S extends Slide>(slide: S): S {
  const animations = slide.animations;
  if (animations === undefined) return slide;
  const ids = new Set(motionTargets(slide).map((block) => block.id));
  const kept = animations.filter((animation) => ids.has(animation.blockId));
  if (kept.length === animations.length) return slide;
  const next = { ...slide };
  if (kept.length === 0) delete next.animations;
  else next.animations = kept;
  return next;
}
