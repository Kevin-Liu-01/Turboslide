// The write actions over the store (SPEC 7.1, MILESTONES M2 item 2): slide.insert, remove, move,
// update and replace, block.set, insert, remove and move, section.set, slide.lease, version.save,
// list and restore, diff.run and fix.run as functions from the action's typed input to its output.
// The CLI commands parse flags into these inputs and print the outputs; registerStoreActions
// registers the same functions on the dispatcher for `turboslide mcp` (SPEC 7.3) and the studio's
// HTTP transport (M4), so every transport runs one implementation. A stale baseRevision or a held
// lease throws ConflictError with the current document (409); a mutation the reducer rejects
// throws TypeError (400); an unknown version throws RangeError (404).
import type { ActionContext, ActionHandler, Dispatcher } from '@turboslide/agent/dispatch';
import { blockTexts, slideTexts } from '@turboslide/lint/context';
import type { TextRef } from '@turboslide/lint/context';
import { lintDeck, lintStatic } from '@turboslide/lint/run';
import { applyLayout } from '@turboslide/schema/apply-layout';
import type { Asset } from '@turboslide/schema/assets';
import type { Block } from '@turboslide/schema/blocks';
import { blockAssetRefs } from '@turboslide/schema/catalog';
import type { DeckDocument, Layout, LayoutId, Section, Slide } from '@turboslide/schema/deck';
import { sectionOfSlide, slideBlocks, slideOrder, slideTitle } from '@turboslide/schema/deck';
import { describeMutation, diffDecks } from '@turboslide/schema/diff';
import { ConflictError } from '@turboslide/schema/errors';
import type { Finding } from '@turboslide/schema/findings';
import { freeLayoutSlideId, layoutEntry } from '@turboslide/schema/layouts';
import { parseParagraphs, plainText, serializeRuns } from '@turboslide/schema/text';
import { walkBlocks } from '@turboslide/schema/validate';
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
// The Google Slides parity round (docs/gslides-parity/SPEC.md 7.5): slide.new, slide.duplicate,
// slide.skip, slide.applyLayout, slide.import, block.duplicate and text.replaceAll as functions
// from the action's input to its output, each one Write through commit; export.text as a pure
// read. A Section header (the opener kind) is first in its section by the validator's rule, so
// inserting or making one after another slide starts a new section that takes the slides after
// the anchor (the grammar's meaning of a section header), which the outputs report.

export type SlideNewInput = Rev & {
  layout: LayoutId;
  after?: string;
  sectionId?: string;
  id?: string;
};
export type SlideDuplicateInput = Rev & { slideIds: string[] };
export type SlideSkipInput = Rev & { slideIds: string[]; skip: boolean };
export type SlideApplyLayoutInput = Rev & { slideIds: string[]; layout: LayoutId };
export type SlideImportInput = Rev & {
  sourceDeckId: string;
  slideIds: string[];
  after?: string;
  sectionId?: string;
};
/** What slide.import reads from the source deck: its document, and a way to copy an asset file. */
export type SlideImportSource = {
  document: DeckDocument;
  /** Copies `<source>/<relative>` to `<target>/<relative>`; the twins and the source file of an asset. */
  copyAsset: (relative: string) => Promise<void>;
};
export type BlockDuplicateInput = Rev & { slideId: string; blockIds: string[] };
export type TextReplaceAllInput = Rev & {
  find: string;
  replace: string;
  matchCase?: boolean;
  slideIds?: string[];
};
export type ExportTextInput = {
  slideIds?: 'all' | string[];
  includeNotes?: boolean;
  includeSkipped?: boolean;
};

type Cursor = { sectionId: string; after: string | undefined };

/** The section a new slide lands in: the named one, the anchor's, else the last section. */
function resolveCursor(
  document: DeckDocument,
  input: { after?: string; sectionId?: string },
): Cursor {
  if (input.after !== undefined) {
    requireSlide(document, input.after);
    const section = sectionOfSlide(document.deck, input.after);
    if (section === undefined) throw new RangeError(`Slide "${input.after}" is in no section`);
    if (input.sectionId !== undefined && input.sectionId !== section.id) {
      throw new TypeError(
        `Slide "${input.after}" is in section "${section.id}", not "${input.sectionId}"`,
      );
    }
    return { sectionId: section.id, after: input.after };
  }
  const section =
    input.sectionId !== undefined
      ? requireSection(document, input.sectionId)
      : document.deck.sections[document.deck.sections.length - 1];
  if (section === undefined) throw new TypeError('The deck has no section to insert into');
  // first in the section, but a section header stays first: land after it
  const first = section.slideIds[0];
  const header =
    first !== undefined && document.slides[first]?.kind === 'opener' ? first : undefined;
  return { sectionId: section.id, after: header };
}

function requireSection(document: DeckDocument, sectionId: string): Section {
  const section = document.deck.sections.find((row) => row.id === sectionId);
  if (section === undefined) throw new RangeError(`No section "${sectionId}"`);
  return section;
}

function takenSlideIds(document: DeckDocument): Set<string> {
  return new Set([...Object.keys(document.slides), ...slideOrder(document.deck)]);
}

function freeId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) {
    taken.add(base);
    return base;
  }
  for (let n = 2; n < 100_000; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }
  throw new RangeError(`No free id for ${base}`);
}

function freeSectionId(base: string, sections: ReadonlyArray<Section>): string {
  const taken = new Set(sections.map((section) => section.id));
  if (!taken.has(base)) return base;
  for (let n = 2; n < 100_000; n += 1) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
  throw new RangeError(`No free section id for ${base}`);
}

/**
 * The mutations that insert one slide at a cursor, and the cursor for the next one. A plain slide
 * is one slide.insert. A Section header after an anchor starts a new section right after the
 * anchor's, taking the slides that followed the anchor; a Section header at the front of a section
 * without one becomes that section's header; a Section header at the front of a section that has
 * one is refused, since two headers cannot share a section.
 */
function insertAt(
  document: DeckDocument,
  slide: Slide,
  cursor: Cursor,
): { mutations: Mutation[]; next: Cursor; sections: Section[] | null } {
  if (slide.kind !== 'opener') {
    return {
      mutations: [
        {
          op: 'slide.insert',
          sectionId: cursor.sectionId,
          ...(cursor.after !== undefined ? { after: cursor.after } : {}),
          slide,
        },
      ],
      next: { sectionId: cursor.sectionId, after: slide.id },
      sections: null,
    };
  }
  const sections = document.deck.sections.map((section) => ({
    ...section,
    slideIds: [...section.slideIds],
  }));
  const index = sections.findIndex((section) => section.id === cursor.sectionId);
  const section = sections[index];
  if (section === undefined) throw new RangeError(`No section "${cursor.sectionId}"`);
  if (cursor.after === undefined) {
    const first = section.slideIds[0];
    if (first !== undefined && document.slides[first]?.kind === 'opener') {
      throw new TypeError(
        `Section "${section.id}" has a section header already ("${first}"); insert after a slide to start a new section`,
      );
    }
    const header = { ...slide, sectionId: section.id };
    return {
      mutations: [{ op: 'slide.insert', sectionId: section.id, slide: header }],
      next: { sectionId: section.id, after: slide.id },
      sections: null,
    };
  }
  const at = section.slideIds.indexOf(cursor.after);
  const rest = section.slideIds.slice(at + 1);
  section.slideIds = section.slideIds.slice(0, at + 1);
  const newId = freeSectionId(slide.id, sections);
  const created: Section = { id: newId, name: `Section ${sections.length + 1}`, slideIds: rest };
  sections.splice(index + 1, 0, created);
  const header = { ...slide, sectionId: newId };
  return {
    mutations: [
      { op: 'section.set', sections },
      { op: 'slide.insert', sectionId: newId, slide: header },
    ],
    next: { sectionId: newId, after: slide.id },
    sections,
  };
}

/** The slides a list of ids names, in deck order, each required to exist. */
function slidesInOrder(document: DeckDocument, slideIds: ReadonlyArray<string>): Slide[] {
  for (const id of slideIds) requireSlide(document, id);
  const wanted = new Set(slideIds);
  return slideOrder(document.deck)
    .filter((id) => wanted.has(id))
    .map((id) => requireSlide(document, id));
}

export async function slideNew(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: SlideNewInput,
): Promise<{ slide: Slide; revision: number; outline: OutlineSection[] }> {
  const current = (await deps.store.read()).document;
  const cursor = resolveCursor(current, input);
  const taken = takenSlideIds(current);
  let id: string;
  if (input.id !== undefined) {
    if (taken.has(input.id)) throw new TypeError(`Slide "${input.id}" exists already`);
    id = input.id;
  } else {
    id = freeLayoutSlideId(input.layout, taken);
  }
  const entry = layoutEntry(input.layout);
  const made = entry.make(id, current.deck, cursor.sectionId);
  if (made === null) {
    throw new TypeError(
      `The ${entry.label} layout needs a picture and the deck has none of the starter roles (opener, mood); add a picture first`,
    );
  }
  const slide: Slide = { ...made, template: input.layout };
  const { mutations } = insertAt(current, slide, cursor);
  const committed = await commit(deps, ctx, input.baseRevision, mutations);
  return {
    slide: requireSlide(committed.document, id),
    revision: committed.revision,
    outline: outlineOf(committed.document),
  };
}

export async function slideDuplicate(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: SlideDuplicateInput,
): Promise<{ slides: Slide[]; revision: number; outline: OutlineSection[] }> {
  const current = (await deps.store.read()).document;
  const sources = slidesInOrder(current, input.slideIds);
  const last = sources[sources.length - 1];
  if (last === undefined) throw new TypeError('slide.duplicate needs at least one slide');
  const section = sectionOfSlide(current.deck, last.id);
  if (section === undefined) throw new RangeError(`Slide "${last.id}" is in no section`);
  let cursor: Cursor = { sectionId: section.id, after: last.id };
  let working = current;
  const taken = takenSlideIds(current);
  const mutations: Mutation[] = [];
  const ids: string[] = [];
  for (const source of sources) {
    const id = freeId(`${source.id}-2`, taken);
    const copy: Slide = { ...cloneSlide(source), id };
    const step = insertAt(working, copy, cursor);
    mutations.push(...step.mutations);
    working = applyMutations(working, step.mutations).document;
    cursor = step.next;
    ids.push(id);
  }
  const committed = await commit(deps, ctx, input.baseRevision, mutations);
  return {
    slides: ids.map((id) => requireSlide(committed.document, id)),
    revision: committed.revision,
    outline: outlineOf(committed.document),
  };
}

function cloneSlide(slide: Slide): Slide {
  return JSON.parse(JSON.stringify(slide)) as Slide;
}

export async function slideSkip(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: SlideSkipInput,
): Promise<{ slideIds: string[]; skip: boolean; revision: number }> {
  const current = (await deps.store.read()).document;
  const slides = slidesInOrder(current, input.slideIds);
  const mutations: Mutation[] = slides.map((slide) => ({
    op: 'slide.set',
    slideId: slide.id,
    path: '/skip',
    ...(input.skip ? { value: true } : {}),
  }));
  const committed = await commit(deps, ctx, input.baseRevision, mutations);
  return {
    slideIds: slides.map((slide) => slide.id),
    skip: input.skip,
    revision: committed.revision,
  };
}

export async function slideApplyLayout(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: SlideApplyLayoutInput,
): Promise<{
  slides: Slide[];
  dropped: { slideId: string; blockIds: string[] }[];
  moved: string[];
  revision: number;
  findings: Finding[];
}> {
  const current = (await deps.store.read()).document;
  const slides = slidesInOrder(current, input.slideIds);
  const mutations: Mutation[] = [];
  const dropped: { slideId: string; blockIds: string[] }[] = [];
  const moved: string[] = [];
  let working = current;
  for (const slide of slides) {
    const section = sectionOfSlide(working.deck, slide.id);
    if (section === undefined) throw new RangeError(`Slide "${slide.id}" is in no section`);
    const result = applyLayout({
      slide,
      layout: input.layout,
      deck: working.deck,
      sectionId: section.id,
    });
    if (result.dropped.length > 0) dropped.push({ slideId: slide.id, blockIds: result.dropped });
    const steps: Mutation[] = [];
    let next = result.slide;
    if (next.kind === 'opener' && section.slideIds[0] !== slide.id) {
      // a Section header starts a new section at this slide, taking the slides after it
      const sections = working.deck.sections.map((row) => ({
        ...row,
        slideIds: [...row.slideIds],
      }));
      const index = sections.findIndex((row) => row.id === section.id);
      const own = sections[index];
      if (own === undefined) throw new RangeError(`No section "${section.id}"`);
      const at = own.slideIds.indexOf(slide.id);
      const taken = own.slideIds.slice(at);
      own.slideIds = own.slideIds.slice(0, at);
      const newId = freeSectionId(slide.id, sections);
      sections.splice(index + 1, 0, {
        id: newId,
        name: `Section ${sections.length + 1}`,
        slideIds: taken,
      });
      next = { ...next, sectionId: newId };
      steps.push({ op: 'section.set', sections });
      moved.push(slide.id);
    }
    steps.push({ op: 'slide.replace', slideId: slide.id, slide: next });
    mutations.push(...steps);
    working = applyMutations(working, steps).document;
  }
  const committed = await commit(deps, ctx, input.baseRevision, mutations);
  return {
    slides: slides.map((slide) => requireSlide(committed.document, slide.id)),
    dropped,
    moved,
    revision: committed.revision,
    findings: slides.flatMap((slide) => findingsFor(deps, committed.document, slide.id)),
  };
}

/** The asset ids a slide references: its picture and every block's asset paths, nested included. */
export function slideAssetIds(slide: Slide): string[] {
  const ids = new Set<string>();
  if (slide.kind === 'opener' || slide.kind === 'mood' || slide.kind === 'closing')
    ids.add(slide.picture.asset);
  const lists =
    slide.kind === 'content'
      ? Object.values(slide.slots)
      : slide.kind === 'opener' || slide.kind === 'mood' || slide.kind === 'closing'
        ? [slide.plate.blocks]
        : [];
  for (const list of lists) {
    walkBlocks(list, '', (block) => {
      for (const ref of blockAssetRefs(block)) if (ref.assetId !== '') ids.add(ref.assetId);
      if (block.type === 'material' && block.asset !== undefined) ids.add(block.asset);
    });
  }
  return [...ids];
}

/** The files an asset record names under the deck directory: the twins and the source file. */
export function assetFiles(asset: Asset): string[] {
  const files = Object.values(asset.twins);
  if (asset.sourceFile !== undefined) files.push(asset.sourceFile);
  return files;
}

export async function slideImport(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: SlideImportInput,
  source: SlideImportSource,
): Promise<{
  slides: Slide[];
  assets: string[];
  renamed: { from: string; to: string }[];
  revision: number;
  outline: OutlineSection[];
}> {
  const current = (await deps.store.read()).document;
  const cursor0 = resolveCursor(current, input);
  // the input order is the order the copies land in (SPEC 7.5 slide.import)
  const sources = input.slideIds.map((id) => {
    const slide = source.document.slides[id];
    if (slide === undefined) throw new RangeError(`No slide "${id}" in ${input.sourceDeckId}`);
    return slide;
  });
  const taken = takenSlideIds(current);
  const mutations: Mutation[] = [];
  const assets: string[] = [];
  const renamed: { from: string; to: string }[] = [];
  const ids: string[] = [];
  let working = current;
  let cursor = cursor0;
  for (const original of sources) {
    for (const assetId of slideAssetIds(original)) {
      if (working.deck.assets[assetId] !== undefined || assets.includes(assetId)) continue;
      const asset = source.document.deck.assets[assetId];
      if (asset === undefined)
        throw new RangeError(`Asset "${assetId}" is not in ${input.sourceDeckId}`);
      for (const relative of assetFiles(asset)) await source.copyAsset(relative);
      const step: Mutation = { op: 'asset.set', asset };
      mutations.push(step);
      working = applyMutations(working, [step]).document;
      assets.push(assetId);
    }
    const id = freeId(original.id, taken);
    if (id !== original.id) renamed.push({ from: original.id, to: id });
    const copy: Slide = { ...cloneSlide(original), id };
    const step = insertAt(working, copy, cursor);
    mutations.push(...step.mutations);
    working = applyMutations(working, step.mutations).document;
    cursor = step.next;
    ids.push(id);
  }
  const committed = await commit(deps, ctx, input.baseRevision, mutations);
  return {
    slides: ids.map((id) => requireSlide(committed.document, id)),
    assets,
    renamed,
    revision: committed.revision,
    outline: outlineOf(committed.document),
  };
}

/** The offset a duplicated freeform block takes (gslides-parity SPEC 7.5 block.duplicate). */
export const DUPLICATE_OFFSET_PX = 16;

export async function blockDuplicate(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: BlockDuplicateInput,
): Promise<SlideResult & { blockIds: string[] }> {
  const current = (await deps.store.read()).document;
  const slide = requireSlide(current, input.slideId);
  const placed = slideBlocks(slide);
  const taken = new Set(placed.map(({ block }) => block.id));
  const maxZ = Math.max(0, ...placed.map(({ block }) => block.pos?.z ?? 0));
  const mutations: Mutation[] = [];
  const ids: string[] = [];
  let z = maxZ;
  for (const blockId of input.blockIds) {
    const row = placed.find(({ block }) => block.id === blockId);
    if (row === undefined) throw new RangeError(`No block "${blockId}" on slide "${slide.id}"`);
    const id = freeId(`${blockId}-2`, taken);
    const copy = JSON.parse(JSON.stringify(row.block)) as Block;
    copy.id = id;
    if (copy.pos !== undefined) {
      z += 1;
      copy.pos = {
        ...copy.pos,
        x: copy.pos.x + DUPLICATE_OFFSET_PX,
        y: copy.pos.y + DUPLICATE_OFFSET_PX,
        z,
      };
    }
    mutations.push({
      op: 'block.insert',
      slideId: slide.id,
      slot: row.slot,
      after: blockId,
      block: copy,
    });
    ids.push(id);
  }
  const committed = await commit(deps, ctx, input.baseRevision, mutations);
  return { ...slideResult(deps, committed, input.slideId), blockIds: ids };
}

/** Every Text of a slide with the write that changes it: the slide fields, every block's texts (nested included) and the notes. */
type TextTarget = { text: string; write: (value: string) => Mutation };

function textTargets(slide: Slide): TextTarget[] {
  const out: TextTarget[] = [];
  for (const ref of slideTexts(slide)) {
    out.push({
      text: ref.text,
      write: (value) => ({ op: 'slide.set', slideId: slide.id, path: ref.path, value }),
    });
  }
  const lists: { pointer: string; blocks: Block[] }[] =
    slide.kind === 'content'
      ? Object.entries(slide.slots).map(([slot, blocks]) => ({ pointer: `/slots/${slot}`, blocks }))
      : slide.kind === 'opener' || slide.kind === 'mood' || slide.kind === 'closing'
        ? [{ pointer: '/plate/blocks', blocks: slide.plate.blocks }]
        : [];
  for (const list of lists) {
    walkBlocks(list.blocks, list.pointer, (block, pointer) => {
      // `<list>/<index>` for a top-level block, `<list>/<index>/cells/<c>/blocks/<b>` for a
      // nested one: the write addresses the top-level block with the rest as its pointer
      const rest = pointer.slice(list.pointer.length + 1);
      const slash = rest.indexOf('/');
      const top = list.blocks[Number(slash < 0 ? rest : rest.slice(0, slash))];
      if (top === undefined) return;
      const relativeBase = slash < 0 ? '' : rest.slice(slash);
      for (const ref of blockTexts(block)) {
        out.push({
          text: ref.text,
          write: (value) => ({
            op: 'block.set',
            slideId: slide.id,
            blockId: top.id,
            path: `${relativeBase}${ref.path}`,
            value,
          }),
        });
      }
    });
  }
  if (slide.notes !== undefined && slide.notes !== '') {
    out.push({
      text: slide.notes,
      write: (value) => ({ op: 'slide.set', slideId: slide.id, path: '/notes', value }),
    });
  }
  return out;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Replaces inside the visible runs of a Text (never inside a link URL or the GT mark) and counts. */
export function replaceInText(
  text: string,
  find: string,
  replace: string,
  matchCase: boolean,
): { text: string; count: number } {
  const pattern = new RegExp(escapeRegExp(find), matchCase ? 'g' : 'gi');
  let count = 0;
  const paragraphs = parseParagraphs(text).map((runs) =>
    serializeRuns(
      runs.map((run) => {
        if (run.gt) return run;
        const next = run.t.replace(pattern, () => {
          count += 1;
          return replace;
        });
        return { ...run, t: next };
      }),
    ),
  );
  return { text: count === 0 ? text : paragraphs.join('\n'), count };
}

/** Replaces in a plain string (the notes) and counts. */
function replaceInPlain(
  text: string,
  find: string,
  replace: string,
  matchCase: boolean,
): { text: string; count: number } {
  const pattern = new RegExp(escapeRegExp(find), matchCase ? 'g' : 'gi');
  let count = 0;
  const next = text.replace(pattern, () => {
    count += 1;
    return replace;
  });
  return { text: next, count };
}

export async function textReplaceAll(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: TextReplaceAllInput,
): Promise<{ replacements: number; slideIds: string[]; revision: number }> {
  const current = (await deps.store.read()).document;
  const slides =
    input.slideIds === undefined
      ? slideOrder(current.deck).map((id) => requireSlide(current, id))
      : slidesInOrder(current, input.slideIds);
  const matchCase = input.matchCase === true;
  const mutations: Mutation[] = [];
  const changed: string[] = [];
  let replacements = 0;
  for (const slide of slides) {
    let touched = false;
    for (const target of textTargets(slide)) {
      const isNotes = target.text === slide.notes && slide.notes !== undefined;
      const result = isNotes
        ? replaceInPlain(target.text, input.find, input.replace, matchCase)
        : replaceInText(target.text, input.find, input.replace, matchCase);
      if (result.count === 0) continue;
      replacements += result.count;
      mutations.push(target.write(result.text));
      touched = true;
    }
    if (touched) changed.push(slide.id);
  }
  if (mutations.length === 0) {
    if (input.baseRevision !== current.deck.revision) {
      throw new ConflictError(
        `baseRevision ${input.baseRevision} is stale; the document is at revision ${current.deck.revision}`,
        { currentRevision: current.deck.revision, current },
      );
    }
    return { replacements: 0, slideIds: [], revision: current.deck.revision };
  }
  const committed = await commit(deps, ctx, input.baseRevision, mutations);
  return { replacements, slideIds: changed, revision: committed.revision };
}

/**
 * export.text (gslides-parity SPEC 7.6): one block of paragraphs per slide in deck order, the
 * table cells joined by tabs per row, a blank line between slides, the notes after each slide's
 * texts when asked; the skipped slides left out unless asked. Pure over the document.
 */
export function deckText(
  document: DeckDocument,
  input: ExportTextInput = {},
): {
  text: string;
  slides: number;
  bytes: number;
} {
  const wanted =
    input.slideIds === undefined || input.slideIds === 'all' ? null : new Set(input.slideIds);
  const blocks: string[] = [];
  let count = 0;
  for (const id of slideOrder(document.deck)) {
    const slide = document.slides[id];
    if (slide === undefined) continue;
    if (wanted !== null && !wanted.has(id)) continue;
    if (slide.skip === true && input.includeSkipped !== true) continue;
    count += 1;
    // an empty placeholder writes nothing (SPEC 5.4); a blank line separates the notes from the texts
    const lines: string[] = [];
    for (const ref of slideTexts(slide)) lines.push(plainText(ref.text));
    for (const { block } of slideBlocks(slide)) lines.push(...blockLines(block));
    const kept = lines.filter((line) => line.trim() !== '');
    if (input.includeNotes === true && slide.notes !== undefined && slide.notes !== '')
      kept.push(...(kept.length > 0 ? ['', slide.notes] : [slide.notes]));
    if (kept.length > 0) blocks.push(kept.join('\n'));
  }
  const text = blocks.join('\n\n');
  // TextEncoder, not Buffer: export.text also runs in the editor page (gslides-parity merge 1)
  return { text, slides: count, bytes: new TextEncoder().encode(text).length };
}

/** The text lines of one block: a table as one line per row with the cells tab separated, else one line per Text. */
function blockLines(block: Block): string[] {
  if (block.type === 'table') {
    return block.rows.map((row) => row.cells.map((cell) => plainText(cell)).join('\t'));
  }
  if (block.type === 'composite') {
    return block.cells
      .flatMap((cell) => cell.blocks.flatMap(blockLines))
      .concat(
        block.caption !== undefined && block.caption !== '' ? [plainText(block.caption)] : [],
      );
  }
  const refs: TextRef[] = blockTexts(block);
  return refs.map((ref) => plainText(ref.text));
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
    'slide.new',
    on<SlideNewInput>((i, c) => slideNew(deps, c, i)),
  );
  dispatcher.register(
    'slide.duplicate',
    on<SlideDuplicateInput>((i, c) => slideDuplicate(deps, c, i)),
  );
  dispatcher.register(
    'slide.skip',
    on<SlideSkipInput>((i, c) => slideSkip(deps, c, i)),
  );
  dispatcher.register(
    'slide.applyLayout',
    on<SlideApplyLayoutInput>((i, c) => slideApplyLayout(deps, c, i)),
  );
  dispatcher.register(
    'block.duplicate',
    on<BlockDuplicateInput>((i, c) => blockDuplicate(deps, c, i)),
  );
  dispatcher.register(
    'text.replaceAll',
    on<TextReplaceAllInput>((i, c) => textReplaceAll(deps, c, i)),
  );
  dispatcher.register(
    'export.text',
    on<ExportTextInput>(async (i) => deckText((await deps.store.read()).document, i)),
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
