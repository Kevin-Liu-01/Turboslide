// The motion lane's handlers (gslides-parity SPEC-5 2.5, 13; MILESTONES-5 B1 "Owns"):
// motion.setTransition, motion.add, motion.update, motion.remove, motion.reorder and
// motion.compile on the checkout dispatcher, the hosted dispatcher and, through the editor's
// controller, the window transport (motion.play is window only and lives in the controller's
// `on(...)` table with `motionPlay` of apps/studio/src/components/presentActions.ts). Every
// mutating action is one `slide.set` (one per slide under applyToAll) in one commit, so one Undo
// reverts it (SPEC-5 2.5); the reducer's `normalizeMotion` keeps the list free of entries whose
// block is gone (SPEC-5 0.8). The module stays free of `node:` imports: the editor page imports
// this graph through store-actions.ts.
import type { Dispatcher } from '@turboslide/agent/dispatch';
import type { ActionContext } from '@turboslide/agent/dispatch';
import type { Block } from '@turboslide/schema/blocks';
import type { DeckDocument, Slide } from '@turboslide/schema/deck';
import { slideOrder } from '@turboslide/schema/deck';
import { ConflictError } from '@turboslide/schema/errors';
import type { Animation, MotionSchedule, SlideTransition } from '@turboslide/schema/motion';
import {
  blockParagraphCount,
  DURATION_MS,
  effectiveTransition,
  FLY_EFFECTS,
  motionTargets,
  nextAnimationId,
  PARAGRAPH_CARRIER_TYPES,
} from '@turboslide/schema/motion';
import type { Mutation } from '@turboslide/schema/mutations';
import { compileMotion, deckMediaLength } from '@turboslide/render/motion';

import type { LaneDeps } from './deps.ts';

type Rev = { baseRevision: number };

export type MotionSetTransitionInput = Rev & {
  slideId: string;
  kind?: SlideTransition['kind'];
  durationMs?: number;
  applyToAll?: boolean;
};

export type MotionAddInput = Rev & {
  slideId: string;
  blockIds: string[];
  effect?: Animation['effect'];
  direction?: Animation['direction'];
  trigger?: Animation['trigger'];
  durationMs?: number;
  byParagraph?: boolean;
  at?: number;
};

export type MotionUpdateInput = Rev & {
  slideId: string;
  animationId: string;
  effect?: Animation['effect'];
  direction?: Animation['direction'] | null;
  trigger?: Animation['trigger'];
  durationMs?: number;
  byParagraph?: boolean;
};

export type MotionRemoveInput = Rev & { slideId: string; animationId?: string; blockId?: string };

export type MotionReorderInput = Rev & { slideId: string; order: string[] };

export type MotionCompileInput = { slideId: string };

/** The store deps a motion handler reads: the store alone (`LaneDeps` carries more). */
export type MotionLaneDeps = Pick<LaneDeps, 'store'>;

function requireSlide(document: DeckDocument, slideId: string): Slide {
  const slide = document.slides[slideId];
  if (slide === undefined) throw new RangeError(`No slide "${slideId}"`);
  return slide;
}

function requireBlock(slide: Slide, blockId: string): Block {
  const block = motionTargets(slide).find((each) => each.id === blockId);
  if (block === undefined)
    throw new RangeError(
      `No object "${blockId}" on slide "${slide.id}" that an animation can name`,
    );
  return block;
}

function requireAnimation(slide: Slide, animationId: string): Animation {
  const animation = (slide.animations ?? []).find((each) => each.id === animationId);
  if (animation === undefined)
    throw new RangeError(`No animation "${animationId}" on slide "${slide.id}"`);
  return animation;
}

/**
 * The record a new or rewritten row is checked against (SPEC-5 2.1): a direction on a fly
 * effect alone (left when a fly names none), By paragraph on a carrier with paragraphs, Play on a
 * media block. A refusal is a TypeError with the sentence the panel shows.
 */
export function settleAnimation(animation: Animation, block: Block): Animation {
  const next: Animation = { ...animation };
  if (FLY_EFFECTS.has(next.effect)) {
    if (next.direction === undefined) next.direction = 'left';
  } else delete next.direction;
  if (next.effect === 'playMedia' && block.type !== 'media')
    throw new TypeError(`Play needs a media block; "${block.id}" is a ${block.type}`);
  if (next.byParagraph === true) {
    if (!PARAGRAPH_CARRIER_TYPES.has(block.type))
      throw new TypeError(
        `By paragraph needs a text object with paragraphs or list items; "${block.id}" is a ${block.type}`,
      );
    if (blockParagraphCount(block) < 2)
      throw new TypeError(`By paragraph needs at least two paragraphs; "${block.id}" has fewer`);
  } else delete next.byParagraph;
  return next;
}

/** Runs one Write and maps a refused outcome to the error classes of SPEC 7.1 (store-actions.ts `commit`). */
async function commitWrite(
  deps: MotionLaneDeps,
  ctx: ActionContext,
  baseRevision: number,
  mutations: Mutation[],
): Promise<{ document: DeckDocument; revision: number }> {
  const outcome = await deps.store.write(
    { baseRevision, author: ctx.author, mutations },
    { ...(ctx.force !== undefined ? { force: ctx.force } : {}) },
  );
  if (!outcome.ok) {
    if (outcome.code === 'conflict') {
      throw new ConflictError(outcome.message, {
        currentRevision: outcome.currentRevision,
        current: outcome.current,
        ...(outcome.holder !== undefined ? { holder: outcome.holder } : {}),
      });
    }
    throw new TypeError(outcome.message);
  }
  return { document: outcome.document, revision: outcome.revision };
}

function animationsWrite(slideId: string, animations: Animation[]): Mutation {
  return animations.length === 0
    ? { op: 'slide.set', slideId, path: '/animations' }
    : { op: 'slide.set', slideId, path: '/animations', value: animations };
}

/**
 * The transition of one slide, or of every slide under applyToAll (SPEC-5 2.1): the kind and the
 * duration given, the slide's current values for what is absent, 500 ms for a new transition;
 * None writes `kind: 'none'`, which every reader treats as absent.
 */
export async function motionSetTransition(
  deps: MotionLaneDeps,
  ctx: ActionContext,
  input: MotionSetTransitionInput,
): Promise<{ slideIds: string[]; transition: SlideTransition | null; revision: number }> {
  const { document } = await deps.store.read();
  const slide = requireSlide(document, input.slideId);
  const current = slide.transition;
  const transition: SlideTransition = {
    kind: input.kind ?? current?.kind ?? 'none',
    durationMs: input.durationMs ?? current?.durationMs ?? DURATION_MS.defaultTransition,
  };
  const slideIds = input.applyToAll === true ? slideOrder(document.deck) : [input.slideId];
  const mutations: Mutation[] = slideIds.map((slideId) => ({
    op: 'slide.set',
    slideId,
    path: '/transition',
    value: transition,
  }));
  const committed = await commitWrite(deps, ctx, input.baseRevision, mutations);
  return { slideIds, transition: effectiveTransition(transition), revision: committed.revision };
}

/** Appends one row per block (Appear, On click, 500 ms unless set), or inserts them at `at`. */
export async function motionAdd(
  deps: MotionLaneDeps,
  ctx: ActionContext,
  input: MotionAddInput,
): Promise<{ ids: string[]; animations: Animation[]; revision: number }> {
  const { document } = await deps.store.read();
  const slide = requireSlide(document, input.slideId);
  const list = [...(slide.animations ?? [])];
  const ids: string[] = [];
  const rows: Animation[] = [];
  for (const blockId of input.blockIds) {
    const block = requireBlock(slide, blockId);
    const id = nextAnimationId([...list, ...rows]);
    const row = settleAnimation(
      {
        id,
        blockId,
        effect: input.effect ?? 'appear',
        ...(input.direction !== undefined ? { direction: input.direction } : {}),
        trigger: input.trigger ?? 'click',
        durationMs: input.durationMs ?? DURATION_MS.defaultAnimation,
        ...(input.byParagraph === true ? { byParagraph: true } : {}),
      },
      block,
    );
    ids.push(id);
    rows.push(row);
  }
  const at = input.at === undefined ? list.length : Math.min(list.length, input.at);
  list.splice(at, 0, ...rows);
  const committed = await commitWrite(deps, ctx, input.baseRevision, [
    animationsWrite(input.slideId, list),
  ]);
  return {
    ids,
    animations: requireSlide(committed.document, input.slideId).animations ?? [],
    revision: committed.revision,
  };
}

/** Rewrites the fields of one row; null clears the direction (a fly keeps left) or By paragraph. */
export async function motionUpdate(
  deps: MotionLaneDeps,
  ctx: ActionContext,
  input: MotionUpdateInput,
): Promise<{ animation: Animation; animations: Animation[]; revision: number }> {
  const { document } = await deps.store.read();
  const slide = requireSlide(document, input.slideId);
  const current = requireAnimation(slide, input.animationId);
  const block = requireBlock(slide, current.blockId);
  const draft: Animation = { ...current };
  if (input.effect !== undefined) draft.effect = input.effect;
  if (input.direction === null) delete draft.direction;
  else if (input.direction !== undefined) draft.direction = input.direction;
  if (input.trigger !== undefined) draft.trigger = input.trigger;
  if (input.durationMs !== undefined) draft.durationMs = input.durationMs;
  if (input.byParagraph === true) draft.byParagraph = true;
  else if (input.byParagraph === false) delete draft.byParagraph;
  const animation = settleAnimation(draft, block);
  const list = (slide.animations ?? []).map((row) =>
    row.id === input.animationId ? animation : row,
  );
  const committed = await commitWrite(deps, ctx, input.baseRevision, [
    animationsWrite(input.slideId, list),
  ]);
  return {
    animation,
    animations: requireSlide(committed.document, input.slideId).animations ?? [],
    revision: committed.revision,
  };
}

/** Removes one row by id, or every row of a block. */
export async function motionRemove(
  deps: MotionLaneDeps,
  ctx: ActionContext,
  input: MotionRemoveInput,
): Promise<{ removed: string[]; animations: Animation[]; revision: number }> {
  const { document } = await deps.store.read();
  const slide = requireSlide(document, input.slideId);
  const list = slide.animations ?? [];
  if (input.animationId !== undefined) requireAnimation(slide, input.animationId);
  const removed = list
    .filter((row) =>
      input.animationId !== undefined
        ? row.id === input.animationId
        : row.blockId === input.blockId,
    )
    .map((row) => row.id);
  if (removed.length === 0)
    throw new RangeError(
      `No animation on slide "${slide.id}" names block "${input.blockId ?? ''}"`,
    );
  const kept = list.filter((row) => !removed.includes(row.id));
  const committed = await commitWrite(deps, ctx, input.baseRevision, [
    animationsWrite(input.slideId, kept),
  ]);
  return {
    removed,
    animations: requireSlide(committed.document, input.slideId).animations ?? [],
    revision: committed.revision,
  };
}

/** Writes the whole play order; every id of the slide's list appears once, no more and no fewer. */
export async function motionReorder(
  deps: MotionLaneDeps,
  ctx: ActionContext,
  input: MotionReorderInput,
): Promise<{ animations: Animation[]; revision: number }> {
  const { document } = await deps.store.read();
  const slide = requireSlide(document, input.slideId);
  const list = slide.animations ?? [];
  const byId = new Map(list.map((row) => [row.id, row]));
  const seen = new Set<string>();
  for (const id of input.order) {
    if (!byId.has(id)) throw new RangeError(`No animation "${id}" on slide "${slide.id}"`);
    if (seen.has(id)) throw new TypeError(`motion.reorder names "${id}" twice`);
    seen.add(id);
  }
  if (seen.size !== list.length)
    throw new TypeError(
      `motion.reorder names ${seen.size} of the slide's ${list.length} animations; every id appears once`,
    );
  const ordered = input.order.map((id) => byId.get(id) as Animation);
  const committed = await commitWrite(deps, ctx, input.baseRevision, [
    animationsWrite(input.slideId, ordered),
  ]);
  return {
    animations: requireSlide(committed.document, input.slideId).animations ?? [],
    revision: committed.revision,
  };
}

/**
 * The schedule of a slide from the document alone (SPEC-5 0.4): the paragraph counts from the
 * schema (`blockParagraphCount`, the number the renderer's nodes and the exporter's scene lines
 * agree with) and the media lengths from `deck.media`.
 */
export function compileSlideMotion(document: DeckDocument, slide: Slide): MotionSchedule {
  const blocks = motionTargets(slide);
  const byId = new Map(blocks.map((block) => [block.id, block]));
  return compileMotion(
    slide,
    blocks,
    (blockId) => {
      const block = byId.get(blockId);
      return block === undefined ? 0 : blockParagraphCount(block);
    },
    deckMediaLength(document.deck, slide),
  );
}

export async function motionCompile(
  deps: MotionLaneDeps,
  input: MotionCompileInput,
): Promise<MotionSchedule> {
  const { document } = await deps.store.read();
  return compileSlideMotion(document, requireSlide(document, input.slideId));
}

/** The handlers this lane registers on a dispatcher (the checkout and the hosted composition). */
export function registerMotionActions(dispatcher: Dispatcher, deps: LaneDeps): void {
  dispatcher.register('motion.setTransition', (input, ctx) =>
    motionSetTransition(deps, ctx, input as MotionSetTransitionInput),
  );
  dispatcher.register('motion.add', (input, ctx) => motionAdd(deps, ctx, input as MotionAddInput));
  dispatcher.register('motion.update', (input, ctx) =>
    motionUpdate(deps, ctx, input as MotionUpdateInput),
  );
  dispatcher.register('motion.remove', (input, ctx) =>
    motionRemove(deps, ctx, input as MotionRemoveInput),
  );
  dispatcher.register('motion.reorder', (input, ctx) =>
    motionReorder(deps, ctx, input as MotionReorderInput),
  );
  dispatcher.register('motion.compile', (input) =>
    motionCompile(deps, input as MotionCompileInput),
  );
}
