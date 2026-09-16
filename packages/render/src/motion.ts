// The schedule (gslides-parity SPEC-5 0.4, 1.3): `compileMotion` is the one pure function that
// turns a slide's transition and animation list into click steps, and `motionCss` (motion-css.ts)
// the one stylesheet of the classes the present layer and the standalone script toggle. The show,
// the HTML autoplay export, the PPTX timing writer, the ODP animation writer and the
// `motion.compile` action read its output; no consumer re-derives order or delay, and every
// writer's test compares its tree against the same schedule snapshot of `decks/fixture/motion`.
//
// The contract, pinned by `__tests__/motion.test.ts`:
// - a `click` row opens a new step; the first row of a slide with `click` leaves an empty entry
//   step behind it (steps[0] plays on entry, the rest on clicks);
// - `withPrevious` joins the current step at the start of the row it follows (delay 0 behind a
//   click row or first in the step; the same delay as an After previous it follows, Google's
//   definition "starts at the same time the previous animation starts", R01 3), so the rows that
//   start together form one group, PowerPoint's timing group (R01 6.3 level 4);
// - `afterPrevious` joins the current step at the end of the group it follows (the latest end
//   over the row before it and the With previous rows that started with it, R01 6.3: "a delay
//   equal to the end time of the previous group"); a first `afterPrevious` or `withPrevious`
//   joins step 0;
// - `byParagraph` expands one row into one effect per paragraph: each its own step under
//   `click`, chained under `afterPrevious`, together under `withPrevious`; a block with fewer than
//   two paragraphs plays as one object;
// - an entrance adds its block to `hiddenAtStart` (PowerPoint hides an object with an entrance
//   anywhere in the sequence until it plays); an exit hides its block at its end; Spin never
//   changes visibility;
// - Appear and Disappear are the 1 ms switch PowerPoint writes (`SWITCH_MS`); a Play effect lasts
//   the media's remaining length after the trim, or the step's length when it loops;
// - a row whose block is not a top level block of the slide, or Play on a block that is not a
//   media block, is skipped and named in `skipped` (and in the export residual).
//
// `paragraphs(blockId)` is supplied by the caller: `countParagraphs` over the rendered block root
// in the browser (the `.para` spans, else the list items), the distinct paragraphs of the scene's
// lines in the exporter (`paragraphCountOf`), so the count the show gates on is the count the
// writer emits as `a:p` and indexes in `p:pRg`; `blockParagraphCount` in the schema gives the same
// number from the document. `mediaLength(blockId)` answers a media block's stored length in ms,
// null when the container states none; absent, a Play row keeps its own `durationMs`.
//
// The integrator landed this module on day 0 as the identity of SPEC-5 1.6; B1 landed the
// semantics on day 1 (build-5/b1.md).
import type { Block } from '@turboslide/schema/blocks';
import type { Deck, Slide } from '@turboslide/schema/deck';
import type { BlockId } from '@turboslide/schema/ids';
import type {
  Animation,
  MotionEffect,
  MotionSchedule,
  MotionStep,
} from '@turboslide/schema/motion';
import {
  ENTRANCE_EFFECTS,
  FLY_EFFECTS,
  PARAGRAPH_CARRIER_TYPES,
  SWITCH_MS,
  effectiveTransition,
  motionTargets,
} from '@turboslide/schema/motion';
import type { Box } from '@turboslide/schema/render';

export type { MotionSchedule, MotionStep };
export { motionCss, MOTION_BASE_CSS } from './motion-css.ts';

/** The paragraph count of a block as the caller measures it (SPEC-5 1.3). */
export type ParagraphCounter = (blockId: BlockId) => number;

/** A media block's stored length in milliseconds, null when the container states none. */
export type MediaLength = (blockId: BlockId) => number | null;

/** The reason a row is skipped, one sentence the residual line repeats. */
function skipReason(animation: Animation, block: Block | undefined): string | undefined {
  if (block === undefined) return `no block "${animation.blockId}" on the slide`;
  if (animation.effect === 'playMedia' && block.type !== 'media')
    return `Play on block "${block.id}" of type ${block.type}, which is not a media block`;
  return undefined;
}

/** The length one effect plays (SPEC-5 1.3); a looping medium is settled after its step is known. */
function effectLength(
  animation: Animation,
  block: Block,
  mediaLength: MediaLength | undefined,
): { durationMs: number; loops: boolean } {
  if (animation.effect === 'appear' || animation.effect === 'disappear')
    return { durationMs: SWITCH_MS, loops: false };
  if (animation.effect !== 'playMedia' || block.type !== 'media')
    return { durationMs: animation.durationMs, loops: false };
  const playback = block.playback;
  if (playback.loop === true) return { durationMs: 0, loops: true };
  const total = mediaLength?.(block.id) ?? null;
  const start = playback.startMs ?? 0;
  const end = playback.endMs ?? total;
  if (end === null) return { durationMs: animation.durationMs, loops: false };
  return { durationMs: Math.max(0, end - start), loops: false };
}

/** The `pos` box of a positioned block, the fly keyframes' reference (R05 9.4). */
function boxOf(block: Block): Box | undefined {
  const pos = (block as { pos?: { x: number; y: number; w: number; h: number } }).pos;
  return pos === undefined ? undefined : [pos.x, pos.y, pos.w, pos.h];
}

/**
 * The click steps of a slide (SPEC-5 1.3). Pure: the same slide, blocks and counts give the same
 * schedule, and the output carries everything the stylesheet and the writers need.
 */
export function compileMotion(
  slide: Slide,
  blocks: Block[],
  paragraphs: ParagraphCounter,
  mediaLength?: MediaLength,
): MotionSchedule {
  const transition = effectiveTransition(slide.transition);
  const animations = slide.animations ?? [];
  const byId = new Map(blocks.map((block) => [block.id, block]));
  const steps: MotionStep[] = [];
  const hidden: BlockId[] = [];
  const skipped: MotionSchedule['skipped'] = [];
  /** the effects that loop, settled to their step's length once the step is complete */
  const looping: { step: MotionStep; effect: MotionEffect }[] = [];
  let current: MotionStep | undefined;
  /** the timing group the last effect belongs to: its start, and the latest end over its rows */
  let group: { startMs: number; endMs: number } | undefined;

  const open = (): MotionStep => {
    const step: MotionStep = { effects: [], durationMs: 0 };
    steps.push(step);
    group = undefined;
    return step;
  };
  /** Adds an effect to a step; `join` keeps it in the current group, else it opens a new one. */
  const place = (step: MotionStep, effect: MotionEffect, loops: boolean, join: boolean): void => {
    step.effects.push(effect);
    if (loops) looping.push({ step, effect });
    else step.durationMs = Math.max(step.durationMs, effect.delayMs + effect.durationMs);
    const end = effect.delayMs + (loops ? 0 : effect.durationMs);
    if (join && group !== undefined) group.endMs = Math.max(group.endMs, end);
    else group = { startMs: effect.delayMs, endMs: end };
  };

  for (const animation of animations) {
    const block = byId.get(animation.blockId);
    const reason = skipReason(animation, block);
    if (reason !== undefined || block === undefined) {
      skipped.push({ animationId: animation.id, reason: reason ?? '' });
      continue;
    }
    if (ENTRANCE_EFFECTS.has(animation.effect) && !hidden.includes(block.id)) hidden.push(block.id);
    const { durationMs, loops } = effectLength(animation, block, mediaLength);
    const box = boxOf(block);
    const count =
      animation.byParagraph === true && PARAGRAPH_CARRIER_TYPES.has(block.type)
        ? paragraphs(block.id)
        : 0;
    const units: (number | undefined)[] =
      count >= 2 ? Array.from({ length: count }, (_unit, index) => index) : [undefined];
    const make = (paragraph: number | undefined, delayMs: number): MotionEffect => ({
      animation,
      delayMs,
      durationMs,
      ...(paragraph !== undefined ? { paragraph } : {}),
      ...(box !== undefined ? { box } : {}),
    });

    if (animation.trigger === 'click') {
      // a click opens a new step; the first click leaves the entry step empty behind it
      if (current === undefined) open();
      for (const paragraph of units) {
        current = open();
        place(current, make(paragraph, 0), loops, false);
      }
      continue;
    }
    if (current === undefined) current = open();
    if (animation.trigger === 'withPrevious') {
      // together with the row it follows: the group's start, the paragraphs together
      const delay = group?.startMs ?? 0;
      for (const paragraph of units) place(current, make(paragraph, delay), loops, true);
      continue;
    }
    // afterPrevious: behind the end of the group it follows, the paragraphs chained
    let delay = group?.endMs ?? 0;
    for (const paragraph of units) {
      const effect = make(paragraph, delay);
      place(current, effect, loops, false);
      delay = effect.delayMs + effect.durationMs;
    }
  }

  for (const { step, effect } of looping)
    effect.durationMs = Math.max(0, step.durationMs - effect.delayMs);

  return { slideId: slide.id, steps, hiddenAtStart: hidden, transition, skipped };
}

/** The count of click steps after the entry step: what the presenter's "Step k of n" reads. */
export function stepCount(schedule: MotionSchedule): number {
  return Math.max(0, schedule.steps.length - 1);
}

/** The top level blocks of a slide as `compileMotion` takes them, for callers without a scene. */
export function motionBlocks(slide: Slide): Block[] {
  return motionTargets(slide);
}

/**
 * The `mediaLength` of a deck's stored media for one slide (SPEC-5 1.3): a media block's asset
 * record in `deck.media` answers its `durationMs`; a YouTube source, a missing record or a record
 * whose container states no length answer null, so the Play row keeps its own `durationMs`.
 */
export function deckMediaLength(deck: Pick<Deck, 'media'>, slide: Slide): MediaLength {
  const blocks = new Map(motionTargets(slide).map((block) => [block.id, block]));
  return (blockId) => {
    const block = blocks.get(blockId);
    if (block === undefined || block.type !== 'media' || !('asset' in block.source)) return null;
    return deck.media?.[block.source.asset]?.durationMs ?? null;
  };
}

// ---------------------------------------------------------------------------------------------
// The rendered nodes (SPEC-5 1.3, 2.2): the paragraph nodes of a block root in the show, counted
// the same way the exporter counts scene paragraphs and the schema counts the document. The
// element type is structural so this module stays free of the DOM library; a jsdom element and a
// browser element both fit it.

export type ElementLike = {
  tagName: string;
  classList: { contains(name: string): boolean };
  children: ArrayLike<ElementLike>;
  querySelectorAll(selectors: string): ArrayLike<ElementLike>;
};

const LIST_ROOT_CLASSES = ['plain', 'rows', 'refs'];

/**
 * The paragraph nodes of a rendered block root, in order: the `.para` spans of a multiline Text
 * (`renderParagraphs` writes one per paragraph when the Text holds a break), else the item nodes
 * of a list block (the element children of `.plain`, `.rows` and `.refs`, one per item), else the
 * root itself, one paragraph. The present layer stamps `data-para="<index>"` on each so
 * `motionCss`'s By paragraph rules address them.
 */
export function paragraphNodes<E extends ElementLike>(root: E): E[] {
  const paras = Array.from(root.querySelectorAll('.para') as ArrayLike<E>);
  if (paras.length > 0) return paras;
  if (LIST_ROOT_CLASSES.some((name) => root.classList.contains(name)))
    return Array.from(root.children as ArrayLike<E>).filter(
      (child) => child.tagName.toLowerCase() !== 'svg' && child.tagName.toLowerCase() !== 'style',
    );
  return [root];
}

/** The paragraph count of a rendered block root, the browser's `paragraphs(blockId)`. */
export function countParagraphs(root: ElementLike): number {
  return paragraphNodes(root).length;
}

/** True when an effect flies, so its keyframes read the block's box (R05 9.4). */
export function isFlyEffect(effect: MotionEffect): boolean {
  return FLY_EFFECTS.has(effect.animation.effect);
}
