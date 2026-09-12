// The write actions over the store (SPEC 7.1, MILESTONES M2 item 2): slide.insert, remove, move,
// update and replace, block.set, insert, remove and move, section.set, slide.lease, version.save,
// list and restore, diff.run and fix.run as functions from the action's typed input to its output.
// The CLI commands parse flags into these inputs and print the outputs; registerStoreActions
// registers the same functions on the dispatcher for `turboslide mcp` (SPEC 7.3) and the studio's
// HTTP transport (M4), so every transport runs one implementation. A stale baseRevision or a held
// lease throws ConflictError with the current document (409); a mutation the reducer rejects
// throws TypeError (400); an unknown version throws RangeError (404).
import type { ActionContext, ActionHandler, Dispatcher } from '@turboslide/agent/dispatch';
import { lintDeck, lintStatic } from '@turboslide/lint/run';
import type { Block } from '@turboslide/schema/blocks';
import type { DeckDocument, Layout, Section, Slide } from '@turboslide/schema/deck';
import { slideBlocks, slideTitle } from '@turboslide/schema/deck';
import { describeMutation, diffDecks } from '@turboslide/schema/diff';
import { ConflictError } from '@turboslide/schema/errors';
import type { Finding } from '@turboslide/schema/findings';
import type {
  AlignEdge,
  AlignTarget,
  DistributeAxis,
  OrderMove,
} from '@turboslide/schema/freeform';
import {
  alignPositions,
  convertLayout,
  distributePositions,
  reorderZ,
  snapToGrid,
} from '@turboslide/schema/freeform';
import type { BlockSlot, Lease, Mutation, Version } from '@turboslide/schema/mutations';
import { getAt, jsonEqual } from '@turboslide/schema/pointer';
import type { Position } from '@turboslide/schema/position';
import { applyMutations } from '@turboslide/schema/reduce';
import type { RenderRecord } from '@turboslide/schema/render';
import type { RuleId } from '@turboslide/schema/rules';
import type { DeckStore, VersionRecord, WriteOutcome } from '@turboslide/store/store';

import type { LintLists } from './deps/theme.ts';

export type StoreActionDeps = {
  store: DeckStore;
  /** The theme's copy lists and icon names for the linter (deps/theme.ts). */
  lint: LintLists;
  /** The last render's records, for the rendered lint layer of fix.run; none skips that layer. */
  renderRecords?: () => RenderRecord[];
};

/** The per-call context: the author from the transport, plus the CLI's --force and --note. */
export type WriteContext = ActionContext & {
  /** Skip the lease check (SPEC 6.7 `force`). */
  force?: boolean;
  /** A note stored on the write's version log entry. */
  note?: string;
  /** Receives the advisory lease notices of a write. */
  onWarning?: (line: string) => void;
};

type Rev = { baseRevision: number };
export type SlideInsertInput = Rev & { sectionId: string; after?: string; slide: Slide };
export type SlideRemoveInput = Rev & { slideId: string };
export type SlideMoveInput = Rev & { slideId: string; sectionId: string; after?: string };
export type SlideUpdateInput = Rev & { slideId: string; mutations: Mutation[] };
export type SlideReplaceInput = Rev & { slideId: string; slide: Slide };
export type BlockSetInput = Rev & {
  slideId: string;
  blockId: string;
  path: string;
  value?: unknown;
};
export type BlockInsertInput = Rev & {
  slideId: string;
  slot: BlockSlot;
  after?: string;
  block: Block;
};
export type BlockRemoveInput = Rev & { slideId: string; blockId: string };
export type BlockMoveInput = Rev & {
  slideId: string;
  blockId: string;
  slot: BlockSlot;
  after?: string;
  /** The z order of a positioned block on a freeform slide (docs/freeform.md). */
  z?: number;
};
export type SectionSetInput = Rev & { sections: Section[] };
export type LeaseInput = { slideId: string; minutes?: number; force?: boolean; release?: boolean };
export type VersionSaveInput = { note: string };
export type VersionRestoreInput = Rev & { n: number };
export type DiffInput = { from?: number; to?: number; staged?: boolean };
export type FixInput = Rev & { slideIds: 'all' | string[]; rule?: RuleId; dryRun?: boolean };

export type OutlineSection = {
  id: string;
  name: string;
  slides: { id: string; n: number; title: string; kind: Slide['kind'] }[];
};
export type SlideResult = { slide: Slide; revision: number; findings: Finding[] };
export type DiffResult = { from: number; to: number; mutations: Mutation[]; prose: string[] };
export type FixResult = { applied: Finding[]; remaining: Finding[]; revision: number };

export type Committed = Extract<WriteOutcome, { ok: true }>;

/** Runs one Write and maps a refused outcome to the error classes of SPEC 7.1. */
export async function commit(
  deps: StoreActionDeps,
  ctx: WriteContext,
  baseRevision: number,
  mutations: Mutation[],
): Promise<Committed> {
  const outcome = await deps.store.write(
    {
      baseRevision,
      author: ctx.author,
      ...(ctx.note !== undefined && ctx.note !== '' ? { note: ctx.note } : {}),
      mutations,
    },
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
  for (const line of outcome.warnings) ctx.onWarning?.(line);
  return outcome;
}

/** The static findings of one slide after a write, the `findings` every slide result carries. */
export function findingsFor(
  deps: StoreActionDeps,
  document: DeckDocument,
  slideId: string,
): Finding[] {
  return lintStatic(document, { ...deps.lint, slideIds: [slideId] }).filter(
    (finding) => finding.slideId === slideId,
  );
}

/** Sections with their slides numbered and titled, the `outline` of the slide list actions. */
export function outlineOf(document: DeckDocument): OutlineSection[] {
  let n = 0;
  return document.deck.sections.map((section) => ({
    id: section.id,
    name: section.name,
    slides: section.slideIds.map((id) => {
      n += 1;
      const slide = document.slides[id];
      return {
        id,
        n,
        title: slide === undefined ? id : slideTitle(slide, n),
        kind: slide?.kind ?? 'content',
      };
    }),
  }));
}

function requireSlide(document: DeckDocument, slideId: string): Slide {
  const slide = document.slides[slideId];
  if (slide === undefined) throw new RangeError(`No slide "${slideId}"`);
  return slide;
}

function slideResult(deps: StoreActionDeps, committed: Committed, slideId: string): SlideResult {
  return {
    slide: requireSlide(committed.document, slideId),
    revision: committed.revision,
    findings: findingsFor(deps, committed.document, slideId),
  };
}

// ---------------------------------------------------------------------------------------------
// Slides

export async function slideInsert(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: SlideInsertInput,
): Promise<{ slide: Slide; revision: number; outline: OutlineSection[] }> {
  const committed = await commit(deps, ctx, input.baseRevision, [
    {
      op: 'slide.insert',
      sectionId: input.sectionId,
      ...(input.after !== undefined ? { after: input.after } : {}),
      slide: input.slide,
    },
  ]);
  return {
    slide: requireSlide(committed.document, input.slide.id),
    revision: committed.revision,
    outline: outlineOf(committed.document),
  };
}

export async function slideRemove(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: SlideRemoveInput,
): Promise<{ revision: number; outline: OutlineSection[] }> {
  const committed = await commit(deps, ctx, input.baseRevision, [
    { op: 'slide.remove', slideId: input.slideId },
  ]);
  return { revision: committed.revision, outline: outlineOf(committed.document) };
}

export async function slideMove(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: SlideMoveInput,
): Promise<{ sections: Section[]; revision: number }> {
  const committed = await commit(deps, ctx, input.baseRevision, [
    {
      op: 'slide.move',
      slideId: input.slideId,
      sectionId: input.sectionId,
      ...(input.after !== undefined ? { after: input.after } : {}),
    },
  ]);
  return { sections: committed.document.deck.sections, revision: committed.revision };
}

/** The ops slide.update accepts: every mutation must address the named slide. */
export function checkSlideMutations(slideId: string, mutations: ReadonlyArray<Mutation>): void {
  mutations.forEach((mutation, index) => {
    const target =
      mutation.op === 'slide.insert'
        ? mutation.slide.id
        : 'slideId' in mutation
          ? mutation.slideId
          : undefined;
    if (target === undefined) {
      throw new TypeError(
        `slide.update: mutation ${index} (${mutation.op}) is a deck-level mutation; use its own action`,
      );
    }
    if (target !== slideId) {
      throw new TypeError(
        `slide.update: mutation ${index} addresses slide "${target}", not "${slideId}"`,
      );
    }
  });
}

export async function slideUpdate(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: SlideUpdateInput,
): Promise<SlideResult> {
  checkSlideMutations(input.slideId, input.mutations);
  const committed = await commit(deps, ctx, input.baseRevision, input.mutations);
  return slideResult(deps, committed, input.slideId);
}

export async function slideReplace(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: SlideReplaceInput,
): Promise<SlideResult> {
  const committed = await commit(deps, ctx, input.baseRevision, [
    { op: 'slide.replace', slideId: input.slideId, slide: input.slide },
  ]);
  return slideResult(deps, committed, input.slideId);
}

// ---------------------------------------------------------------------------------------------
// Blocks

export async function blockSet(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: BlockSetInput,
): Promise<SlideResult> {
  const committed = await commit(deps, ctx, input.baseRevision, [
    {
      op: 'block.set',
      slideId: input.slideId,
      blockId: input.blockId,
      path: input.path,
      ...(input.value !== undefined ? { value: input.value } : {}),
    },
  ]);
  return slideResult(deps, committed, input.slideId);
}

export async function blockInsert(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: BlockInsertInput,
): Promise<SlideResult> {
  const committed = await commit(deps, ctx, input.baseRevision, [
    {
      op: 'block.insert',
      slideId: input.slideId,
      slot: input.slot,
      ...(input.after !== undefined ? { after: input.after } : {}),
      block: input.block,
    },
  ]);
  return slideResult(deps, committed, input.slideId);
}

export async function blockRemove(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: BlockRemoveInput,
): Promise<SlideResult> {
  const committed = await commit(deps, ctx, input.baseRevision, [
    { op: 'block.remove', slideId: input.slideId, blockId: input.blockId },
  ]);
  return slideResult(deps, committed, input.slideId);
}

export async function blockMove(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: BlockMoveInput,
): Promise<SlideResult> {
  const committed = await commit(deps, ctx, input.baseRevision, [
    {
      op: 'block.move',
      slideId: input.slideId,
      blockId: input.blockId,
      slot: input.slot,
      ...(input.after !== undefined ? { after: input.after } : {}),
      ...(input.z !== undefined ? { z: input.z } : {}),
    },
  ]);
  return slideResult(deps, committed, input.slideId);
}

// ---------------------------------------------------------------------------------------------
// Sections, leases, versions

export async function sectionSet(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: SectionSetInput,
): Promise<{ sections: Section[]; revision: number }> {
  const committed = await commit(deps, ctx, input.baseRevision, [
    { op: 'section.set', sections: input.sections },
  ]);
  return { sections: committed.document.deck.sections, revision: committed.revision };
}

export async function slideLease(
  deps: StoreActionDeps,
  ctx: ActionContext,
  input: LeaseInput,
): Promise<Lease> {
  if (input.release === true) {
    const released = await deps.store.release(input.slideId, ctx.author);
    if (released === undefined) {
      throw new RangeError(`No lease held by this author on slide "${input.slideId}"`);
    }
    return released;
  }
  return deps.store.lease(input.slideId, ctx.author, {
    ...(input.minutes !== undefined ? { minutes: input.minutes } : {}),
    ...(input.force !== undefined ? { force: input.force } : {}),
  });
}

export async function versionSave(
  deps: StoreActionDeps,
  ctx: ActionContext,
  input: VersionSaveInput,
): Promise<Version> {
  return deps.store.saveVersion(ctx.author, input.note);
}

export async function versionList(deps: StoreActionDeps): Promise<Version[]> {
  return deps.store.listVersions();
}

export async function versionRestore(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: VersionRestoreInput,
): Promise<{ revision: number }> {
  const committed = await commit(deps, ctx, input.baseRevision, [
    { op: 'version.restore', n: input.n },
  ]);
  return { revision: committed.revision };
}

// ---------------------------------------------------------------------------------------------
// Diff

/** Truncates a text for a prose line. */
function short(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (text === undefined) return 'nothing';
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

/** describeMutation, with the old and new value spelled out for property changes. */
export function proseFor(before: DeckDocument, mutation: Mutation): string {
  const base = describeMutation(mutation);
  if (mutation.op === 'block.set') {
    const slide = before.slides[mutation.slideId];
    const block =
      slide === undefined
        ? undefined
        : slideBlocks(slide).find((row) => row.block.id === mutation.blockId)?.block;
    const old = block === undefined ? undefined : getAt(block, mutation.path);
    if (mutation.value === undefined) return `${base} (was ${short(old)})`;
    return old === undefined
      ? `${base} to ${short(mutation.value)}`
      : `${base} from ${short(old)} to ${short(mutation.value)}`;
  }
  if (mutation.op === 'slide.set' || mutation.op === 'deck.set') {
    const target = mutation.op === 'slide.set' ? before.slides[mutation.slideId] : before.deck;
    const old = target === undefined ? undefined : getAt(target, mutation.path);
    if (mutation.value === undefined) return `${base} (was ${short(old)})`;
    return old === undefined
      ? `${base} to ${short(mutation.value)}`
      : `${base} from ${short(old)} to ${short(mutation.value)}`;
  }
  return base;
}

/**
 * Resolves the range of diff.run. Explicit revisions win; `--staged` (or no range) diffs from the
 * newest named version below the current revision, or from where the log starts when no version
 * is named, to the current revision. A version saved at the current revision has nothing staged
 * after it, so the range then shows what that version captured (SPEC 7.2 "--staged diffs against
 * the last version").
 */
export function resolveDiffRange(
  input: DiffInput,
  currentRevision: number,
  records: ReadonlyArray<VersionRecord>,
): { from: number; to: number; base?: VersionRecord } {
  if (input.from !== undefined) return { from: input.from, to: input.to ?? currentRevision };
  let base: VersionRecord | undefined;
  for (let i = records.length - 1; i >= 0; i -= 1) {
    const record = records[i];
    if (record !== undefined && record.note !== '' && record.revision < currentRevision) {
      base = record;
      break;
    }
  }
  const first = records[0];
  const from = base?.revision ?? first?.baseRevision ?? currentRevision;
  return { from, to: currentRevision, ...(base !== undefined ? { base } : {}) };
}

export async function diffRun(
  deps: StoreActionDeps,
  input: DiffInput,
): Promise<DiffResult & { before: DeckDocument; after: DeckDocument }> {
  const current = (await deps.store.read()).document;
  const range = resolveDiffRange(input, current.deck.revision, await deps.store.records());
  const before =
    range.from === current.deck.revision
      ? current
      : await deps.store.documentAtRevision(range.from);
  const after =
    range.to === current.deck.revision ? current : await deps.store.documentAtRevision(range.to);
  const mutations = diffDecks(before, after);
  return {
    from: range.from,
    to: range.to,
    mutations,
    prose: mutations.map((mutation) => proseFor(before, mutation)),
    before,
    after,
  };
}

// ---------------------------------------------------------------------------------------------
// Fix

export type FixPlan = {
  /** Findings whose fix applies cleanly, in lint order. */
  applied: Finding[];
  /** Findings that carry a fix the reducer rejected on top of the earlier ones, with the reason. */
  skipped: { finding: Finding; reason: string }[];
  /** The mutation list of the applied fixes, in order. */
  mutations: Mutation[];
  /** The document with every applied fix, before normalization by the store. */
  document: DeckDocument;
};

/** Simulates the fixes one finding at a time so a fix that no longer applies skips instead of failing the write. */
export function planFixes(document: DeckDocument, findings: ReadonlyArray<Finding>): FixPlan {
  const plan: FixPlan = { applied: [], skipped: [], mutations: [], document };
  for (const finding of findings) {
    if (finding.fix === undefined || finding.fix.length === 0) continue;
    try {
      plan.document = applyMutations(plan.document, finding.fix).document;
      plan.applied.push(finding);
      plan.mutations.push(...finding.fix);
    } catch (error) {
      plan.skipped.push({
        finding,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return plan;
}

function lintOptions(deps: StoreActionDeps, input: FixInput) {
  return {
    ...deps.lint,
    ...(input.slideIds === 'all' ? {} : { slideIds: input.slideIds }),
    ...(input.rule !== undefined ? { rules: [input.rule] } : {}),
  };
}

export async function fixRun(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: FixInput,
): Promise<FixResult & { plan: FixPlan; dryRun: boolean }> {
  const current = (await deps.store.read()).document;
  if (input.slideIds !== 'all') for (const id of input.slideIds) requireSlide(current, id);
  const records = deps.renderRecords?.() ?? [];
  const findings = lintDeck(current, records, lintOptions(deps, input));
  const plan = planFixes(current, findings);
  const dryRun = input.dryRun === true;
  if (dryRun || plan.mutations.length === 0) {
    const remaining = lintDeck(plan.document, records, lintOptions(deps, input));
    return { applied: plan.applied, remaining, revision: current.deck.revision, plan, dryRun };
  }
  const committed = await commit(deps, ctx, input.baseRevision, plan.mutations);
  const remaining = lintDeck(committed.document, records, lintOptions(deps, input));
  return { applied: plan.applied, remaining, revision: committed.revision, plan, dryRun };
}

// ---------------------------------------------------------------------------------------------
// Freeform (docs/freeform.md): block.align, block.distribute, block.order and slide.setLayout. The
// arithmetic is the schema's (@turboslide/schema/freeform), so the editor's drag and these actions
// agree; each one ends in ordinary block.set or slide.replace mutations through commit, so the
// inverse, the version log and the leases are the same as for any other write.

export type BlockAlignInput = Rev & {
  slideId: string;
  blockIds: string[];
  edge: AlignEdge;
  to?: AlignTarget;
  snap?: boolean;
};
export type BlockDistributeInput = Rev & {
  slideId: string;
  blockIds: string[];
  axis: DistributeAxis;
  gap?: number;
  snap?: boolean;
};
export type BlockOrderInput = Rev & {
  slideId: string;
  blockId: string;
  move?: OrderMove;
  z?: number;
};
export type SlideSetLayoutInput = Rev & { slideId: string; layout: Layout };

type Positioned = { block: Block; pos: Position };

/** The positioned top-level blocks of a freeform slide; a TypeError names any other slide. */
function freeformBlocks(slide: Slide): Positioned[] {
  if (slide.kind !== 'content' || slide.layout.type !== 'freeform') {
    throw new TypeError(
      `Slide "${slide.id}" is not on the freeform layout; slide.setLayout moves it there (docs/freeform.md)`,
    );
  }
  return (slide.slots.main ?? []).flatMap((block) =>
    block.pos === undefined ? [] : [{ block, pos: block.pos }],
  );
}

function pickBlocks(rows: Positioned[], ids: readonly string[], slideId: string): Positioned[] {
  return ids.map((id) => {
    const row = rows.find((candidate) => candidate.block.id === id);
    if (row === undefined)
      throw new RangeError(`No positioned block "${id}" on slide "${slideId}"`);
    return row;
  });
}

/** One block.set of /pos per block whose box changed. */
function positionMutations(
  slideId: string,
  rows: readonly Positioned[],
  next: readonly Position[],
): Mutation[] {
  return rows.flatMap((row, index) => {
    const pos = next[index];
    if (pos === undefined || jsonEqual(pos, row.pos)) return [];
    return [{ op: 'block.set' as const, slideId, blockId: row.block.id, path: '/pos', value: pos }];
  });
}

/** Writes the mutations, or returns the current slide when nothing moved (a stale base still conflicts). */
async function commitPositions(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: Rev & { slideId: string },
  current: DeckDocument,
  mutations: Mutation[],
): Promise<SlideResult> {
  if (mutations.length > 0) {
    const committed = await commit(deps, ctx, input.baseRevision, mutations);
    return slideResult(deps, committed, input.slideId);
  }
  if (input.baseRevision !== current.deck.revision) {
    throw new ConflictError(
      `baseRevision ${input.baseRevision} is stale; the document is at revision ${current.deck.revision}`,
      { currentRevision: current.deck.revision, current },
    );
  }
  return {
    slide: requireSlide(current, input.slideId),
    revision: current.deck.revision,
    findings: findingsFor(deps, current, input.slideId),
  };
}

export async function blockAlign(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: BlockAlignInput,
): Promise<SlideResult> {
  const current = (await deps.store.read()).document;
  const rows = pickBlocks(
    freeformBlocks(requireSlide(current, input.slideId)),
    input.blockIds,
    input.slideId,
  );
  const next = alignPositions(
    rows.map((row) => row.pos),
    input.edge,
    input.to,
    input.snap !== false,
  );
  return commitPositions(deps, ctx, input, current, positionMutations(input.slideId, rows, next));
}

export async function blockDistribute(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: BlockDistributeInput,
): Promise<SlideResult> {
  const current = (await deps.store.read()).document;
  const rows = pickBlocks(
    freeformBlocks(requireSlide(current, input.slideId)),
    input.blockIds,
    input.slideId,
  );
  let next = distributePositions(
    rows.map((row) => row.pos),
    input.axis,
    input.gap,
  );
  if (input.snap === true) {
    next = next.map((pos) =>
      input.axis === 'horizontal'
        ? { ...pos, x: snapToGrid(pos.x) }
        : { ...pos, y: snapToGrid(pos.y) },
    );
  }
  return commitPositions(deps, ctx, input, current, positionMutations(input.slideId, rows, next));
}

export async function blockOrder(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: BlockOrderInput,
): Promise<SlideResult> {
  const current = (await deps.store.read()).document;
  const rows = freeformBlocks(requireSlide(current, input.slideId));
  const move = input.move ?? { z: input.z ?? 0 };
  const stack = reorderZ(
    rows.map((row) => ({ id: row.block.id, pos: row.pos })),
    input.blockId,
    move,
  );
  const mutations: Mutation[] = rows.flatMap((row) => {
    const z = stack[row.block.id];
    if (z === undefined || z === row.pos.z) return [];
    return [
      {
        op: 'block.set' as const,
        slideId: input.slideId,
        blockId: row.block.id,
        path: '/pos/z',
        value: z,
      },
    ];
  });
  return commitPositions(deps, ctx, input, current, mutations);
}

export async function slideSetLayout(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: SlideSetLayoutInput,
): Promise<SlideResult> {
  const current = (await deps.store.read()).document;
  const slide = requireSlide(current, input.slideId);
  if (slide.kind !== 'content')
    throw new TypeError(`Slide "${slide.id}" is a ${slide.kind} slide and has no layout to set`);
  const next = convertLayout(slide, input.layout);
  const committed = await commit(deps, ctx, input.baseRevision, [
    { op: 'slide.replace', slideId: input.slideId, slide: next },
  ]);
  return slideResult(deps, committed, input.slideId);
}

// ---------------------------------------------------------------------------------------------
// Registration

/** Registers every store-backed action on a dispatcher; inputs arrive validated by the action's schema. */
export function registerStoreActions(dispatcher: Dispatcher, deps: StoreActionDeps): void {
  const on = <T>(run: (input: T, ctx: WriteContext) => Promise<unknown>): ActionHandler => {
    return (input, ctx) => run(input as T, ctx);
  };
  dispatcher.register(
    'block.align',
    on<BlockAlignInput>((i, c) => blockAlign(deps, c, i)),
  );
  dispatcher.register(
    'block.distribute',
    on<BlockDistributeInput>((i, c) => blockDistribute(deps, c, i)),
  );
  dispatcher.register(
    'block.order',
    on<BlockOrderInput>((i, c) => blockOrder(deps, c, i)),
  );
  dispatcher.register(
    'slide.setLayout',
    on<SlideSetLayoutInput>((i, c) => slideSetLayout(deps, c, i)),
  );
  dispatcher.register(
    'slide.insert',
    on<SlideInsertInput>((i, c) => slideInsert(deps, c, i)),
  );
  dispatcher.register(
    'slide.remove',
    on<SlideRemoveInput>((i, c) => slideRemove(deps, c, i)),
  );
  dispatcher.register(
    'slide.move',
    on<SlideMoveInput>((i, c) => slideMove(deps, c, i)),
  );
  dispatcher.register(
    'slide.update',
    on<SlideUpdateInput>((i, c) => slideUpdate(deps, c, i)),
  );
  dispatcher.register(
    'slide.replace',
    on<SlideReplaceInput>((i, c) => slideReplace(deps, c, i)),
  );
  dispatcher.register(
    'block.set',
    on<BlockSetInput>((i, c) => blockSet(deps, c, i)),
  );
  dispatcher.register(
    'block.insert',
    on<BlockInsertInput>((i, c) => blockInsert(deps, c, i)),
  );
  dispatcher.register(
    'block.remove',
    on<BlockRemoveInput>((i, c) => blockRemove(deps, c, i)),
  );
  dispatcher.register(
    'block.move',
    on<BlockMoveInput>((i, c) => blockMove(deps, c, i)),
  );
  dispatcher.register(
    'section.set',
    on<SectionSetInput>((i, c) => sectionSet(deps, c, i)),
  );
  dispatcher.register(
    'slide.lease',
    on<LeaseInput>((i, c) => slideLease(deps, c, i)),
  );
  dispatcher.register(
    'version.save',
    on<VersionSaveInput>((i, c) => versionSave(deps, c, i)),
  );
  dispatcher.register('version.list', () => versionList(deps));
  dispatcher.register(
    'version.restore',
    on<VersionRestoreInput>((i, c) => versionRestore(deps, c, i)),
  );
  dispatcher.register(
    'diff.run',
    on<DiffInput>(async (i) => {
      const { before: _before, after: _after, ...result } = await diffRun(deps, i);
      return result;
    }),
  );
  dispatcher.register(
    'fix.run',
    on<FixInput>(async (i, c) => {
      const { plan: _plan, dryRun: _dryRun, ...result } = await fixRun(deps, c, i);
      return result;
    }),
  );
}
