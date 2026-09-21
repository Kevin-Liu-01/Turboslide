// The write actions over the store (SPEC 7.1, MILESTONES M2 item 2): slide.insert, remove, move,
// update and replace, block.set, insert, remove and move, section.set, slide.lease, version.save,
// list and restore, diff.run and fix.run as functions from the action's typed input to its output.
// The CLI commands parse flags into these inputs and print the outputs; registerStoreActions
// registers the same functions on the dispatcher for `turboslide mcp` (SPEC 7.3) and the studio's
// HTTP transport (M4), so every transport runs one implementation. A stale baseRevision or a held
// lease throws ConflictError with the current document (409); a mutation the reducer rejects
// throws TypeError (400); an unknown version throws RangeError (404).
//
// The Google Slides parity round two (docs/gslides-parity/SPEC-2.md sections 1, 3): every canvas
// write on a slide that is not on the freeform layout converts it first through `withCanvas`, the
// measured conversion of @turboslide/schema/canvas over `deps.measureCanvas` (bound to headless
// Chromium in the CLI and the MCP server, to the render worker facade in the studio), and travels
// the conversion's `slide.replace` in the same write, so Cmd+Z after an agent's first `block.set
// /pos` restores the grammar slide as it does after a drag (1.6, 0.73). A moved, resized, rotated
// or flipped shape carries its attached connectors through `followConnectors` (2.4.7). This module
// is imported by the editor page too, so it stays free of `node:` imports: the measurer is a
// dependency, never an import.
import type { ActionContext, ActionHandler, Dispatcher } from '@turboslide/agent/dispatch';
import { blockTexts, slideTexts } from '@turboslide/lint/context';
import type { TextRef } from '@turboslide/lint/context';
import { lintDeck, lintStatic } from '@turboslide/lint/run';
import type { ChartKind, ChartSeries } from '@turboslide/schema/blocks/chart';
import type { CellBorder, TableCommand } from '@turboslide/schema/blocks/table';
import { applyTableCommand } from '@turboslide/schema/blocks/table';
import { applyLayout } from '@turboslide/schema/apply-layout';
import type { Asset, AssetVariant } from '@turboslide/schema/assets';
import { hasContinuousSource } from '@turboslide/schema/assets';
import type { PictureDither } from '@turboslide/schema/blocks/dither';
import { DITHER_NO_SOURCE_MESSAGE } from '@turboslide/schema/blocks/dither';
import {
  ditherKey,
  ditherScreen,
  ditherSourceOf,
  resolveDither,
} from '@turboslide/render/dither-key';
import type { Autofit, Block, Shadow, ShapeBlock } from '@turboslide/schema/blocks';
import type { CanvasBoxes } from '@turboslide/schema/canvas';
import { applyGuides, toCanvas } from '@turboslide/schema/canvas';
import type { GuidesInput } from '@turboslide/schema/canvas';
import { blockAssetRefs, blockTextPaths } from '@turboslide/schema/catalog';
import type { Color } from '@turboslide/schema/color';
import {
  attachConnector,
  detachConnectors,
  followConnectors,
  isConnector,
  renameConnectorRefs,
} from '@turboslide/schema/connect';
import type {
  Deck,
  DeckDocument,
  DeckGuides,
  Layout,
  LayoutId,
  Section,
  Slide,
  SlideBackground,
} from '@turboslide/schema/deck';
import {
  canvasObjects,
  isCanvasSlide,
  sectionOfSlide,
  slideBlocks,
  slideOrder,
  slideTitle,
} from '@turboslide/schema/deck';
import { describeMutation, diffDecks } from '@turboslide/schema/diff';
import { ConflictError } from '@turboslide/schema/errors';
import type { Finding } from '@turboslide/schema/findings';
import { freeLayoutSlideId, layoutEntry } from '@turboslide/schema/layouts';
import type {
  BulletPreset,
  CaseMode,
  ListMarker,
  MarkEdit,
  NumberPreset,
} from '@turboslide/schema/text';
import {
  BULLET_PRESETS,
  LIST_LEVEL_MAX,
  NUMBER_PRESETS,
  caseRange,
  insertAt as insertTextAt,
  listNumerals,
  parseParagraphs,
  plainLength,
  plainText,
  serializeRuns,
  splitParagraphs,
  styleRange,
  textBullet,
} from '@turboslide/schema/text';
import type { ShapeKind } from '@turboslide/schema/blocks';
import type { Dash, LineEnd, LineKind } from '@turboslide/schema/shapes';
import { isLineKind } from '@turboslide/schema/shapes';
import { INDENT_STEP_PX, ladderStepDown } from '@turboslide/schema/typography';
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
  flipPositions,
  readingOrder,
  reorderZ,
  rotatePositions,
  snapToGrid,
} from '@turboslide/schema/freeform';
import type { Author, BlockSlot, Lease, Mutation, Version } from '@turboslide/schema/mutations';
import { getAt, jsonEqual } from '@turboslide/schema/pointer';
import type { Position } from '@turboslide/schema/position';
import { applyMutations } from '@turboslide/schema/reduce';
import type { RenderRecord } from '@turboslide/schema/render';
import { SHEET_HEIGHT, SHEET_WIDTH } from '@turboslide/schema/render';
import type { RuleId } from '@turboslide/schema/rules';
import type { DeckStore, VersionRecord, WriteOutcome } from '@turboslide/store/store';

import type { LintLists } from './deps/theme.ts';

/**
 * The measurement a canvas conversion reads (gslides-parity SPEC-2 1.3, 0.104): the boxes of
 * every slide named, from one rendered sheet page per call at scale 1 with prompts drawn. The CLI
 * and the MCP stdio server bind it to headless Chromium (deps/canvas.ts), the studio to the render
 * worker facade; the editor measures its hidden sheet with the same DOM function.
 */
export type MeasureCanvas = (
  deck: Deck,
  slides: ReadonlyArray<Slide>,
) => Promise<Record<string, CanvasBoxes>>;

/** What `block.autofit --apply` measures: per block, the box drawn and the height its text needs (SPEC-2 0.64). */
export type MeasureFit = (
  deck: Deck,
  slide: Slide,
) => Promise<
  Record<
    string,
    { box: [number, number, number, number]; contentHeight?: number; fontSize?: number }
  >
>;

/** The diagram templates (SPEC-2 2.8.3, @turboslide/schema/diagrams DIAGRAM_TEMPLATES `make`). */
export type DiagramMaker = (
  kind: string,
  count: number,
  style: string,
  box: Position,
  group: string,
) => Block[];

export type StoreActionDeps = {
  store: DeckStore;
  /** The theme's copy lists and icon names for the linter (deps/theme.ts). */
  lint: LintLists;
  /** The last render's records, for the rendered lint layer of fix.run; none skips that layer. */
  renderRecords?: () => RenderRecord[];
  /** The canvas measurer (SPEC-2 1.3); without it a canvas write on a grammar slide is refused with the reason. */
  measureCanvas?: MeasureCanvas;
  /** The fit measurer of block.autofit --apply (SPEC-2 0.64); without it apply is refused with the reason. */
  measureFit?: MeasureFit;
  /** The diagram templates diagram.insert instantiates (SPEC-2 2.8.3). */
  diagrams?: DiagramMaker;
  /**
   * The dither pipeline picture.materialize writes variants with (gslides-parity SPEC-3 10.2,
   * 10.4; B5's @turboslide/effects/dither over the store's putAsset): given a picture's asset,
   * its resolved dither and the screen size, writes the variant twins under assets/ and answers
   * the record. Without it the action answers its dry run (the missing variants) and refuses a
   * write with the sentence naming the pipeline.
   */
  materialize?: Materializer;
};

/** The write half of picture.materialize (SPEC-3 10.4): one variant per key, the files under assets/. */
export type Materializer = (request: {
  asset: Asset;
  dither: PictureDither;
  key: string;
  screen: [number, number];
  scale: 1 | 2;
}) => Promise<{ variant: AssetVariant; files: string[] }>;

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
  const write: Mutation = {
    op: 'block.set',
    slideId: input.slideId,
    blockId: input.blockId,
    path: input.path,
    ...(input.value !== undefined ? { value: input.value } : {}),
  };
  // a /pos write is a canvas write (gslides-parity SPEC-2 1.6): the slide converts first and the
  // moved block's connectors follow (2.4.7)
  if (input.path === '/pos' || input.path.startsWith('/pos/')) {
    const current = (await deps.store.read()).document;
    const canvas = await withCanvas(deps, current, requireSlide(current, input.slideId));
    const mutations = withFollow(
      canvas.document,
      input.slideId,
      [...canvas.prefix, write],
      [input.blockId],
    );
    const committed = await commit(deps, ctx, input.baseRevision, mutations);
    return slideResult(deps, committed, input.slideId);
  }
  const committed = await commit(deps, ctx, input.baseRevision, [write]);
  return slideResult(deps, committed, input.slideId);
}

export async function blockInsert(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: BlockInsertInput,
): Promise<SlideResult> {
  let prefix: Mutation[] = [];
  let slot: BlockSlot = input.slot;
  let after = input.after;
  let block = input.block;
  // a positioned block on a slide that is not a canvas yet converts the slide first and lands in
  // main as an object (SPEC-2 1.6, 0.8); with no `after` the object goes on top of the stack, last
  // in the list and one above the highest z, as Insert does in Google Slides
  if (block.pos !== undefined) {
    const current = (await deps.store.read()).document;
    let slide = requireSlide(current, input.slideId);
    if (!isCanvasSlide(slide)) {
      const canvas = await withCanvas(deps, current, slide);
      prefix = canvas.prefix;
      slide = canvas.slide;
      slot = 'main';
    }
    const objects = canvasObjects(slide);
    if (after === undefined && objects.length > 0) after = objects[objects.length - 1]?.id;
    if (block.pos.z === undefined && objects.length > 0) {
      const top = Math.max(...objects.map((object) => object.pos?.z ?? 0));
      block = { ...block, pos: { ...block.pos, z: top + 1 } } as Block;
    }
  }
  const committed = await commit(deps, ctx, input.baseRevision, [
    ...prefix,
    {
      op: 'block.insert',
      slideId: input.slideId,
      slot,
      ...(after !== undefined ? { after } : {}),
      block,
    },
  ]);
  return slideResult(deps, committed, input.slideId);
}

export async function blockRemove(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: BlockRemoveInput,
): Promise<SlideResult> {
  const current = (await deps.store.read()).document;
  const slide = requireSlide(current, input.slideId);
  // a removed target detaches its connectors in the same write (SPEC-2 2.4.7)
  const detach = detachConnectors(slide, [input.blockId]);
  const committed = await commit(deps, ctx, input.baseRevision, [
    ...detach,
    { op: 'block.remove', slideId: input.slideId, blockId: input.blockId },
  ]);
  return slideResult(deps, committed, input.slideId);
}

export async function blockMove(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: BlockMoveInput,
): Promise<SlideResult> {
  let prefix: Mutation[] = [];
  let slot: BlockSlot = input.slot;
  // a z target is a canvas write: the slide converts first (SPEC-2 1.6)
  if (input.z !== undefined) {
    const current = (await deps.store.read()).document;
    const slide = requireSlide(current, input.slideId);
    if (!isCanvasSlide(slide)) {
      const canvas = await withCanvas(deps, current, slide);
      prefix = canvas.prefix;
      slot = 'main';
    }
  }
  const committed = await commit(deps, ctx, input.baseRevision, [
    ...prefix,
    {
      op: 'block.move',
      slideId: input.slideId,
      blockId: input.blockId,
      slot,
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

/** The positioned top-level blocks of a canvas slide; a TypeError names any other slide. */
function freeformBlocks(slide: Slide): Positioned[] {
  if (!isCanvasSlide(slide)) {
    throw new TypeError(
      `Slide "${slide.id}" is not arranged by hand yet; slide.toCanvas converts it (docs/gslides-parity/SPEC-2.md 1.6)`,
    );
  }
  return (slide.slots.main ?? []).flatMap((block) =>
    block.pos === undefined ? [] : [{ block, pos: block.pos }],
  );
}

// ---------------------------------------------------------------------------------------------
// The canvas conversion (gslides-parity SPEC-2 1.6, 0.73, 0.104)

export type CanvasPrefix = {
  /** The `slide.replace` of the conversion, or nothing when the slide is a canvas already. */
  prefix: Mutation[];
  /** The document with the conversion applied, the one the gesture's mutations are computed on. */
  document: DeckDocument;
  /** The slide as a canvas. */
  slide: Slide;
  converted: boolean;
};

/**
 * The conversion every canvas write precedes on a slide that is not on the freeform layout: one
 * `slide.replace` with the measured `toCanvas` of the slide, travelling in the gesture's write so
 * one revision and one undo step hold both (SPEC-2 1.6). The measurement comes from
 * `deps.measureCanvas`, one sheet page per call; without the binding the write is refused with
 * the reason, never converted by an even split. A slide that is a canvas already yields no prefix.
 */
export async function withCanvas(
  deps: StoreActionDeps,
  document: DeckDocument,
  slide: Slide,
  measured?: Record<string, CanvasBoxes>,
): Promise<CanvasPrefix> {
  if (isCanvasSlide(slide)) return { prefix: [], document, slide, converted: false };
  const boxes = measured?.[slide.id] ?? (await measureOne(deps, document.deck, slide));
  const result = toCanvas(slide, boxes);
  if (result === null) return { prefix: [], document, slide, converted: false };
  const prefix: Mutation[] = [{ op: 'slide.replace', slideId: slide.id, slide: result.slide }];
  const next = applyMutations(document, prefix).document;
  return { prefix, document: next, slide: requireSlide(next, slide.id), converted: true };
}

async function measureOne(deps: StoreActionDeps, deck: Deck, slide: Slide): Promise<CanvasBoxes> {
  if (deps.measureCanvas === undefined) {
    throw new TypeError(
      `Slide "${slide.id}" is not arranged by hand yet and this transport has no measurer to convert it; run the write through the turboslide CLI or the studio, or slide.toCanvas first (docs/gslides-parity/SPEC-2.md 1.3)`,
    );
  }
  const measured = await deps.measureCanvas(deck, [slide]);
  const boxes = measured[slide.id];
  if (boxes === undefined)
    throw new RangeError(`The measurer returned no boxes for slide "${slide.id}"`);
  return boxes;
}

/**
 * The mutations with the connectors of the moved blocks following (SPEC-2 2.4.7): the mutations
 * are applied to a copy and `followConnectors` reads the result, so the follow travels in the same
 * write on every transport.
 */
export function withFollow(
  document: DeckDocument,
  slideId: string,
  mutations: Mutation[],
  movedIds: ReadonlyArray<string>,
): Mutation[] {
  if (mutations.length === 0 || movedIds.length === 0) return mutations;
  const next = applyMutations(document, mutations).document;
  const slide = next.slides[slideId];
  if (slide === undefined) return mutations;
  return [...mutations, ...followConnectors(slide, movedIds)];
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

/** A canvas write's positions: the conversion first, the moves computed on the canvas, the connectors following. */
async function commitCanvasPositions(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: Rev & { slideId: string },
  current: DeckDocument,
  compute: (rows: Positioned[]) => Mutation[],
  movedIds: ReadonlyArray<string>,
): Promise<SlideResult> {
  const canvas = await withCanvas(deps, current, requireSlide(current, input.slideId));
  const moves = compute(freeformBlocks(canvas.slide));
  if (moves.length === 0 && canvas.prefix.length === 0)
    return commitPositions(deps, ctx, input, current, []);
  const mutations = withFollow(
    canvas.document,
    input.slideId,
    [...canvas.prefix, ...moves],
    movedIds,
  );
  return commitPositions(deps, ctx, input, current, mutations);
}

export async function blockAlign(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: BlockAlignInput,
): Promise<SlideResult> {
  const current = (await deps.store.read()).document;
  return commitCanvasPositions(
    deps,
    ctx,
    input,
    current,
    (all) => {
      const rows = pickBlocks(all, input.blockIds, input.slideId);
      /* the shared edge is the extreme object's own edge unless snap is asked for (docs/FOCUS.md
         rank 14: tops 150, 240, 500 became 152 on the grid); Google's Align never snaps */
      const next = alignPositions(
        rows.map((row) => row.pos),
        input.edge,
        input.to,
        input.snap === true,
      );
      return positionMutations(input.slideId, rows, next);
    },
    input.blockIds,
  );
}

export async function blockDistribute(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: BlockDistributeInput,
): Promise<SlideResult> {
  const current = (await deps.store.read()).document;
  return commitCanvasPositions(
    deps,
    ctx,
    input,
    current,
    (all) => {
      const rows = pickBlocks(all, input.blockIds, input.slideId);
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
      return positionMutations(input.slideId, rows, next);
    },
    input.blockIds,
  );
}

export async function blockOrder(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: BlockOrderInput,
): Promise<SlideResult> {
  const current = (await deps.store.read()).document;
  return commitCanvasPositions(
    deps,
    ctx,
    input,
    current,
    (rows) => {
      const move = input.move ?? { z: input.z ?? 0 };
      const stack = reorderZ(
        rows.map((row) => ({ id: row.block.id, pos: row.pos })),
        input.blockId,
        move,
      );
      return rows.flatMap((row) => {
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
    },
    [],
  );
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
  // to freeform on a grammar content slide is the measured conversion on every transport
  // (SPEC-2 1.6, 0.73); the even split of convertLayout serves every other switch
  if (input.layout.type === 'freeform') {
    // a canvas slide is on the freeform layout already: nothing to write, the objects keep their order
    if (isCanvasSlide(slide)) return commitPositions(deps, ctx, input, current, []);
    const canvas = await withCanvas(deps, current, slide);
    const committed = await commit(deps, ctx, input.baseRevision, canvas.prefix);
    return slideResult(deps, committed, input.slideId);
  }
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
  // a duplicate is a canvas write on every slide kind (SPEC-2 1.6): the slide converts first
  const canvas = await withCanvas(deps, current, requireSlide(current, input.slideId));
  const slide = canvas.slide;
  const placed = slideBlocks(slide);
  const taken = new Set(placed.map(({ block }) => block.id));
  const maxZ = Math.max(0, ...placed.map(({ block }) => block.pos?.z ?? 0));
  const mutations: Mutation[] = [...canvas.prefix];
  const ids: string[] = [];
  const mapping = new Map<string, string>();
  // one fresh tag per copied group (SPEC-2 section 3, block.duplicate)
  const groupTags = new Map<string, string>();
  const takenGroups = new Set(
    placed.flatMap(({ block }) => (block.pos?.group !== undefined ? [block.pos.group] : [])),
  );
  let z = maxZ;
  const copies: { row: (typeof placed)[number]; copy: Block; id: string }[] = [];
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
      if (copy.pos.group !== undefined) {
        let tag = groupTags.get(copy.pos.group);
        if (tag === undefined) {
          tag = freeId(`${copy.pos.group}-2`, takenGroups);
          groupTags.set(copy.pos.group, tag);
        }
        copy.pos.group = tag;
      }
    }
    mapping.set(blockId, id);
    copies.push({ row, copy, id });
    ids.push(id);
  }
  for (const { row, copy } of copies) {
    // a copied connector keeps the attachments to copied targets and drops the others (SPEC-2 2.4.7)
    if (isConnector(copy) && copy.connect !== undefined) {
      const renamed = renameConnectorRefs(copy.connect, mapping);
      if (renamed === undefined) delete copy.connect;
      else copy.connect = renamed;
    }
    mutations.push({
      op: 'block.insert',
      slideId: slide.id,
      slot: row.slot,
      after: row.block.id,
      block: copy,
    });
  }
  const committed = await commit(deps, ctx, input.baseRevision, mutations);
  return { ...slideResult(deps, committed, input.slideId), blockIds: ids };
}

/** Every Text of a slide with the write that changes it: the slide fields, every block's texts (nested included) and the notes. */
/** One visible text of a slide with the mutation that rewrites it (the notes included). */
export type TextTarget = { text: string; write: (value: string) => Mutation };

/**
 * Every text Find and replace, the tailoring pass and the assist read on a slide, in document
 * order: the fixed kinds' fields, every block text (nested blocks addressed through their top
 * level block), then the notes. Exported for the assist's server module, which addresses the
 * same texts the product's own replace does (docs/PRODUCT.md 6.2).
 */
export function textTargets(slide: Slide): TextTarget[] {
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

// ---------------------------------------------------------------------------------------------
// The tailoring pass (docs/PRODUCT.md section 5; audit-gaps 16; research 07): rename the customer,
// swap the logo, skip the internal slides, as one write and one undo step, deterministic and
// without a model call. The Tailor dialog, the CLI (`turboslide tailor`), MCP (`deck_tailor`) and
// HTTP run this one function; the Assist panel's first starter card opens the dialog.

export type TailorReplacement = { from: string; to: string };
export type TailorLogo = { assetId: string; replaceAlt?: string };
export type DeckTailorInput = Rev & {
  replacements?: TailorReplacement[];
  logo?: TailorLogo;
  skip?: string[];
};

export type TailorPlan = {
  mutations: Mutation[];
  /** the text replacements made, over every visible text and the notes */
  replacements: number;
  /** the slides whose text changed */
  slideIds: string[];
  /** the pictures swapped for the logo */
  pictures: number;
  /** the slides skipped by this pass (the ones not skipped already) */
  skipped: string[];
  /** how many places each replacement touched, in the input's order, for the dialog's count */
  counts: { from: string; places: number; slides: number }[];
};

/** How many times `from` occurs in a slide's texts, case insensitive; the dialog's live count. */
export function tailorCount(
  document: DeckDocument,
  from: string,
): { places: number; slides: number } {
  if (from === '') return { places: 0, slides: 0 };
  let places = 0;
  let slides = 0;
  for (const id of slideOrder(document.deck)) {
    const slide = document.slides[id];
    if (slide === undefined) continue;
    let here = 0;
    for (const target of textTargets(slide)) {
      const isNotes = target.text === slide.notes && slide.notes !== undefined;
      here += (
        isNotes
          ? replaceInPlain(target.text, from, '', false)
          : replaceInText(target.text, from, '', false)
      ).count;
    }
    if (here > 0) {
      places += here;
      slides += 1;
    }
  }
  return { places, slides };
}

/** The assets a slide's pictures reference, with the mutation that swaps each one. */
function pictureTargets(slide: Slide): { assetId: string; write: (assetId: string) => Mutation }[] {
  const out: { assetId: string; write: (assetId: string) => Mutation }[] = [];
  if (slide.kind === 'opener' || slide.kind === 'mood' || slide.kind === 'closing') {
    out.push({
      assetId: slide.picture.asset,
      write: (assetId) => ({
        op: 'slide.set',
        slideId: slide.id,
        path: '/picture/asset',
        value: assetId,
      }),
    });
  }
  const lists: { blocks: Block[] }[] =
    slide.kind === 'content'
      ? Object.values(slide.slots).map((blocks) => ({ blocks }))
      : slide.kind === 'opener' || slide.kind === 'mood' || slide.kind === 'closing'
        ? [{ blocks: slide.plate.blocks }]
        : [];
  for (const list of lists) {
    for (const block of list.blocks) {
      if ((block.type === 'shot' || block.type === 'picture') && typeof block.asset === 'string') {
        out.push({
          assetId: block.asset,
          write: (assetId) => ({
            op: 'block.set',
            slideId: slide.id,
            blockId: block.id,
            path: '/asset',
            value: assetId,
          }),
        });
      }
    }
  }
  return out;
}

/**
 * The pass as mutations over a document, pure (unit tested without a store): the replacements in
 * order through the same replace Find and replace runs (never inside a link URL or the GT mark),
 * the logo over every picture whose asset's alt text names the old customer, and a skip on each
 * named slide that is not skipped yet. A logo without `replaceAlt` is refused until the brand kit
 * gives the deck a logo slot (docs/PRODUCT.md 4.1, B5a), with the reason in the sentence.
 */
export function tailorPlan(document: DeckDocument, input: DeckTailorInput): TailorPlan {
  const mutations: Mutation[] = [];
  const changed = new Set<string>();
  let replacements = 0;
  const counts: TailorPlan['counts'] = [];
  const slides = slideOrder(document.deck).map((id) => requireSlide(document, id));
  // the replacements run over a working copy so a second pair sees the first one's result
  const working: Record<string, string[]> = {};
  for (const slide of slides) working[slide.id] = textTargets(slide).map((target) => target.text);
  for (const pair of input.replacements ?? []) {
    if (pair.from === '') continue;
    let places = 0;
    const touched = new Set<string>();
    for (const slide of slides) {
      const targets = textTargets(slide);
      const texts = working[slide.id] ?? [];
      targets.forEach((target, i) => {
        const current = texts[i] ?? target.text;
        const isNotes = target.text === slide.notes && slide.notes !== undefined;
        const result = isNotes
          ? replaceInPlain(current, pair.from, pair.to, false)
          : replaceInText(current, pair.from, pair.to, false);
        if (result.count === 0) return;
        places += result.count;
        touched.add(slide.id);
        texts[i] = result.text;
      });
    }
    replacements += places;
    counts.push({ from: pair.from, places, slides: touched.size });
    for (const id of touched) changed.add(id);
  }
  for (const slide of slides) {
    const targets = textTargets(slide);
    const texts = working[slide.id] ?? [];
    targets.forEach((target, i) => {
      const next = texts[i];
      if (next !== undefined && next !== target.text) mutations.push(target.write(next));
    });
  }
  let pictures = 0;
  if (input.logo !== undefined) {
    if (input.logo.replaceAlt === undefined) {
      throw new TypeError(
        'deck.tailor: the logo on every slide needs the brand kit’s logo slot, which this presentation does not have yet; pass replaceAlt to swap the pictures named after the old customer instead',
      );
    }
    if (document.deck.assets[input.logo.assetId] === undefined) {
      throw new RangeError(`deck.tailor: no asset "${input.logo.assetId}" in this presentation`);
    }
    const needle = input.logo.replaceAlt.toLowerCase();
    for (const slide of slides) {
      for (const target of pictureTargets(slide)) {
        if (target.assetId === input.logo.assetId) continue;
        const alt = document.deck.assets[target.assetId]?.alt ?? '';
        if (!alt.toLowerCase().includes(needle)) continue;
        mutations.push(target.write(input.logo.assetId));
        pictures += 1;
        changed.add(slide.id);
      }
    }
  }
  const skipped: string[] = [];
  for (const id of input.skip ?? []) {
    const slide = requireSlide(document, id);
    if (slide.skip === true) continue;
    mutations.push({ op: 'slide.set', slideId: slide.id, path: '/skip', value: true });
    skipped.push(slide.id);
  }
  return {
    mutations,
    replacements,
    slideIds: slideOrder(document.deck).filter((id) => changed.has(id)),
    pictures,
    skipped,
    counts,
  };
}

export async function deckTailor(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: DeckTailorInput,
): Promise<{
  replacements: number;
  slideIds: string[];
  pictures: number;
  skipped: string[];
  revision: number;
}> {
  const current = (await deps.store.read()).document;
  const plan = tailorPlan(current, input);
  if (plan.mutations.length === 0) {
    if (input.baseRevision !== current.deck.revision) {
      throw new ConflictError(
        `baseRevision ${input.baseRevision} is stale; the document is at revision ${current.deck.revision}`,
        { currentRevision: current.deck.revision, current },
      );
    }
    return {
      replacements: 0,
      slideIds: [],
      pictures: 0,
      skipped: [],
      revision: current.deck.revision,
    };
  }
  const committed = await commit(deps, ctx, input.baseRevision, plan.mutations);
  return {
    replacements: plan.replacements,
    slideIds: plan.slideIds,
    pictures: plan.pictures,
    skipped: plan.skipped,
    revision: committed.revision,
  };
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
    // a canvas slide reads in reading order, top to bottom then left to right (SPEC-2 1.5)
    const ordered = isCanvasSlide(slide)
      ? readingOrder(slide).map((row) => row.block)
      : slideBlocks(slide).map(({ block }) => block);
    for (const block of ordered) lines.push(...blockLines(block));
    const kept = lines.filter((line) => line.trim() !== '');
    if (input.includeNotes === true && slide.notes !== undefined && slide.notes !== '')
      kept.push(...(kept.length > 0 ? ['', slide.notes] : [slide.notes]));
    if (kept.length > 0) blocks.push(kept.join('\n'));
  }
  const text = blocks.join('\n\n');
  // TextEncoder, not Buffer: export.text also runs in the editor page (gslides-parity merge 1)
  return { text, slides: count, bytes: new TextEncoder().encode(text).length };
}

/**
 * The text lines of one block: a table as one line per row with the cells tab separated, a chart
 * as its title then the categories and series as tab separated rows, a glyph or numbered list
 * with its marker before each item (SPEC-2 section 3, export.text), else one line per Text.
 */
function blockLines(block: Block): string[] {
  if (block.type === 'table') {
    return block.rows.map((row) => row.cells.map((cell) => plainText(cell)).join('\t'));
  }
  if (block.type === 'chart') {
    const out: string[] = [];
    if (block.title !== undefined && block.title !== '') out.push(plainText(block.title));
    out.push(['', ...block.categories].join('\t'));
    for (const series of block.series)
      out.push([series.name, ...series.values.map((value) => String(value))].join('\t'));
    return out;
  }
  if (block.type === 'plain' && (block.marker === 'bullet' || block.marker === 'number')) {
    const levels = block.items.map((item) => item.level ?? 1);
    const numerals =
      block.marker === 'number'
        ? listNumerals(numberPresetOf(block.preset), levels)
        : levels.map((level) => textBullet(level));
    return block.items.map(
      (item, i) =>
        `${'  '.repeat((item.level ?? 1) - 1)}${numerals[i] ?? ''} ${plainText(item.text)}`,
    );
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
// The Google Slides parity round two (docs/gslides-parity/SPEC-2.md section 3): the 36 actions
// as functions from the action's input to its output, each one Write through commit. A canvas
// write converts a grammar slide first (withCanvas); a move, rotate or flip carries the attached
// connectors (withFollow).

export type SlideToCanvasInput = Rev & { slideIds: string[] };
export type DeckGuidesInput = Rev & GuidesInput;
export type SlideSetBackgroundInput = Rev & {
  slideIds: string[];
  background: SlideBackground | null;
};
export type DeckSetBackgroundInput = Rev & { background: SlideBackground | null };
export type BlockGroupInput = Rev & { slideId: string; blockIds: string[]; group?: string };
export type BlockUngroupInput = Rev & { slideId: string; blockIds?: string[]; group?: string };
export type BlockRegroupInput = Rev & { slideId: string; blockIds: string[]; group: string };
export type BlockRotateInput = Rev & {
  slideId: string;
  blockIds: string[];
  to?: number;
  by?: number;
  about?: 'each' | 'selection';
};
export type BlockFlipInput = Rev & {
  slideId: string;
  blockIds: string[];
  axis: 'h' | 'v';
  about?: 'each' | 'selection';
};
export type BlockCropInput = Rev & {
  slideId: string;
  blockId: string;
  trim: { left: number; right: number; top: number; bottom: number };
};
export type BlockMaskInput = Rev & { slideId: string; blockId: string; mask: string | null };
export type BlockResetImageInput = Rev & { slideId: string; blockId: string };
export type BlockAdjustInput = Rev & {
  slideId: string;
  blockId: string;
  transparency?: number | null;
  brightness?: number | null;
  contrast?: number | null;
};
export type BlockSetAltInput = Rev & { slideId: string; blockId: string; alt: string };
export type BlockShadowInput = Rev & { slideId: string; blockIds: string[]; shadow: Shadow | null };
export type BlockAutofitInput = Rev & {
  slideId: string;
  blockId: string;
  autofit: Autofit;
  apply?: true;
};
export type TextStyleInput = Rev & {
  slideId: string;
  blockId: string;
  path: string;
  range: [number, number];
  marks: MarkEdit;
};
export type TextListInput = Rev & {
  slideId: string;
  blockId: string;
  marker?: ListMarker;
  preset?: BulletPreset | NumberPreset;
  items?: number[];
  level?: number;
  levelBy?: 1 | -1;
};
export type TextSpacingInput = Rev & {
  slideId: string;
  blockIds: string[];
  line?: number | null;
  before?: number | null;
  after?: number | null;
};
export type TextColumnsInput = Rev & { slideId: string; blockIds: string[]; columns: 1 | 2 | 3 };
export type TextIndentInput = Rev & {
  slideId: string;
  blockIds: string[];
  by?: 1 | -1;
  to?: number;
  items?: number[];
};
export type TextCaseInput = Rev & {
  slideId: string;
  blockId: string;
  path: string;
  range: [number, number];
  mode: CaseMode;
};
export type TextInsertInput = Rev & {
  slideId: string;
  blockId: string;
  path: string;
  at: number;
  text: string;
};
export type ChartSetDataInput = Rev & {
  slideId: string;
  blockId: string;
  categories: string[];
  series: ChartSeries[];
};
export type ChartSetKindInput = Rev & { slideId: string; blockId: string; kind: ChartKind };
export type TableMergeInput = Rev & {
  slideId: string;
  blockId: string;
  from: [number, number];
  to: [number, number];
};
export type TableUnmergeInput = Rev & { slideId: string; blockId: string; at: [number, number] };
export type TableInsertRowsInput = Rev & {
  slideId: string;
  blockId: string;
  at: number;
  count?: number;
  where: 'above' | 'below';
};
export type TableInsertColumnsInput = Rev & {
  slideId: string;
  blockId: string;
  at: number;
  count?: number;
  where: 'left' | 'right';
};
export type TableDeleteInput = Rev & {
  slideId: string;
  blockId: string;
  from: number;
  to?: number;
};
export type TableDistributeInput = Rev & {
  slideId: string;
  blockId: string;
  axis: 'rows' | 'columns';
  total?: number;
  range?: [number, number];
};
export type TableCellStyleInput = Rev & {
  slideId: string;
  blockId: string;
  cells: [number, number][];
  fill?: Color | null;
  border?: CellBorder | null;
};
export type ShapeSetInput = Rev & {
  slideId: string;
  blockIds: string[];
  kind?: ShapeKind;
  adjust?: number[] | null;
  fill?: Color | null;
  stroke?: Color | null;
  width?: 1 | 1.5 | 2 | 3 | 4 | null;
  dash?: Dash | null;
  radius?: number | null;
};
export type LineSetInput = Rev & {
  slideId: string;
  blockIds: string[];
  kind?: LineKind;
  start?: LineEnd;
  end?: LineEnd;
  weight?: 1 | 1.5 | 2 | 3 | 4;
  dash?: Dash | null;
  bend?: number | null;
  points?: [number, number][];
  connect?: {
    start?: { block: string; site: number } | null;
    end?: { block: string; site: number } | null;
  };
};
export type DiagramInsertInput = Rev & {
  slideId: string;
  kind: string;
  count: number;
  style?: string;
  pos?: Position;
  after?: string;
};

export type CanvasObjectRow = { id: string; type: string; pos: Position };
export type SlideToCanvasResult = {
  slides: {
    slideId: string;
    converted: boolean;
    template?: LayoutId;
    objects: CanvasObjectRow[];
  }[];
  revision: number;
  findings: Finding[];
};

function objectRows(slide: Slide): CanvasObjectRow[] {
  return canvasObjects(slide).flatMap((block) =>
    block.pos === undefined ? [] : [{ id: block.id, type: block.type, pos: block.pos }],
  );
}

/** A block of a slide by id, top level; a RangeError names a missing one. */
function requireBlock(slide: Slide, blockId: string): Block {
  const row = slideBlocks(slide).find(({ block }) => block.id === blockId);
  if (row === undefined) throw new RangeError(`No block "${blockId}" on slide "${slide.id}"`);
  return row.block;
}

function setField(slideId: string, blockId: string, path: string, value: unknown): Mutation {
  return {
    op: 'block.set',
    slideId,
    blockId,
    path,
    ...(value !== undefined && value !== null ? { value } : {}),
  };
}

/** A field write that skips a value the block already carries, so a write changes something or nothing. */
function fieldMutations(
  slide: Slide,
  blockId: string,
  fields: Record<string, unknown>,
): Mutation[] {
  const block = requireBlock(slide, blockId) as unknown as Record<string, unknown>;
  const out: Mutation[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    const current = block[key];
    if (value === null) {
      if (current === undefined) continue;
      out.push(setField(slide.id, blockId, `/${key}`, undefined));
      continue;
    }
    if (jsonEqual(current, value)) continue;
    out.push(setField(slide.id, blockId, `/${key}`, value));
  }
  return out;
}

/** Commits, or answers the current slide when nothing changes (a stale base still conflicts). */
async function commitOrCurrent(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: Rev & { slideId: string },
  current: DeckDocument,
  mutations: Mutation[],
): Promise<SlideResult> {
  return commitPositions(deps, ctx, input, current, mutations);
}

export async function slideToCanvas(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: SlideToCanvasInput,
): Promise<SlideToCanvasResult> {
  const current = (await deps.store.read()).document;
  const slides = slidesInOrder(current, input.slideIds);
  const pending = slides.filter((slide) => !isCanvasSlide(slide));
  let measured: Record<string, CanvasBoxes> = {};
  if (pending.length > 0) {
    if (deps.measureCanvas === undefined)
      throw new TypeError(
        'slide.toCanvas needs a measurer on this transport; run it through the turboslide CLI or the studio (docs/gslides-parity/SPEC-2.md 1.3)',
      );
    // one sheet page for the call (SPEC-2 0.104)
    measured = await deps.measureCanvas(current.deck, pending);
  }
  const mutations: Mutation[] = [];
  const rows: SlideToCanvasResult['slides'] = [];
  let working = current;
  for (const slide of slides) {
    const canvas = await withCanvas(deps, working, slide, measured);
    mutations.push(...canvas.prefix);
    working = canvas.document;
    rows.push({
      slideId: slide.id,
      converted: canvas.converted,
      ...(canvas.slide.template !== undefined ? { template: canvas.slide.template } : {}),
      objects: objectRows(canvas.slide),
    });
  }
  if (mutations.length === 0) {
    if (input.baseRevision !== current.deck.revision)
      throw new ConflictError(
        `baseRevision ${input.baseRevision} is stale; the document is at revision ${current.deck.revision}`,
        { currentRevision: current.deck.revision, current },
      );
    return {
      slides: rows,
      revision: current.deck.revision,
      findings: slides.flatMap((slide) => findingsFor(deps, current, slide.id)),
    };
  }
  const committed = await commit(deps, ctx, input.baseRevision, mutations);
  return {
    slides: rows.map((row) => ({
      ...row,
      objects: objectRows(requireSlide(committed.document, row.slideId)),
    })),
    revision: committed.revision,
    findings: slides.flatMap((slide) => findingsFor(deps, committed.document, slide.id)),
  };
}

export async function deckGuides(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: DeckGuidesInput,
): Promise<{ guides: DeckGuides | null; revision: number }> {
  const current = (await deps.store.read()).document;
  const { baseRevision, ...edit } = input;
  const next = applyGuides(current.deck.guides, edit);
  if (jsonEqual(next ?? null, current.deck.guides ?? null)) {
    if (baseRevision !== current.deck.revision)
      throw new ConflictError(
        `baseRevision ${baseRevision} is stale; the document is at revision ${current.deck.revision}`,
        { currentRevision: current.deck.revision, current },
      );
    return { guides: current.deck.guides ?? null, revision: current.deck.revision };
  }
  const committed = await commit(deps, ctx, baseRevision, [
    { op: 'deck.set', path: '/guides', ...(next !== undefined ? { value: next } : {}) },
  ]);
  return { guides: committed.document.deck.guides ?? null, revision: committed.revision };
}

export async function slideSetBackground(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: SlideSetBackgroundInput,
): Promise<{ slides: Slide[]; revision: number; findings: Finding[] }> {
  const current = (await deps.store.read()).document;
  const slides = slidesInOrder(current, input.slideIds);
  const mutations: Mutation[] = slides.map((slide) => ({
    op: 'slide.set',
    slideId: slide.id,
    path: '/background',
    ...(input.background !== null ? { value: input.background } : {}),
  }));
  const committed = await commit(deps, ctx, input.baseRevision, mutations);
  return {
    slides: slides.map((slide) => requireSlide(committed.document, slide.id)),
    revision: committed.revision,
    findings: slides.flatMap((slide) => findingsFor(deps, committed.document, slide.id)),
  };
}

export async function deckSetBackground(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: DeckSetBackgroundInput,
): Promise<{ background: SlideBackground | null; revision: number }> {
  const committed = await commit(deps, ctx, input.baseRevision, [
    {
      op: 'deck.set',
      path: '/defaults/background',
      ...(input.background !== null ? { value: input.background } : {}),
    },
  ]);
  return {
    background: committed.document.deck.defaults?.background ?? null,
    revision: committed.revision,
  };
}

/** The group tags on a slide, for a fresh one. */
function groupTags(slide: Slide): Set<string> {
  return new Set(
    canvasObjects(slide).flatMap((block) =>
      block.pos?.group !== undefined ? [block.pos.group] : [],
    ),
  );
}

export async function blockGroup(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: BlockGroupInput,
): Promise<SlideResult & { group: string }> {
  const current = (await deps.store.read()).document;
  const canvas = await withCanvas(deps, current, requireSlide(current, input.slideId));
  const rows = pickBlocks(freeformBlocks(canvas.slide), input.blockIds, input.slideId);
  const tag = input.group ?? freeId('group', groupTags(canvas.slide));
  const mutations: Mutation[] = [
    ...canvas.prefix,
    ...rows.flatMap((row) =>
      row.pos.group === tag ? [] : [setField(input.slideId, row.block.id, '/pos/group', tag)],
    ),
  ];
  const result = await commitOrCurrent(deps, ctx, input, current, mutations);
  return { ...result, group: tag };
}

export async function blockUngroup(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: BlockUngroupInput,
): Promise<SlideResult> {
  const current = (await deps.store.read()).document;
  const slide = requireSlide(current, input.slideId);
  const members =
    input.blockIds !== undefined
      ? pickBlocks(freeformBlocks(slide), input.blockIds, input.slideId)
      : freeformBlocks(slide).filter((row) => row.pos.group === input.group);
  if (members.length === 0)
    throw new RangeError(
      `No block on slide "${input.slideId}" carries the group "${input.group ?? ''}"`,
    );
  const mutations = members.flatMap((row) =>
    row.pos.group === undefined
      ? []
      : [setField(input.slideId, row.block.id, '/pos/group', undefined)],
  );
  return commitOrCurrent(deps, ctx, input, current, mutations);
}

export async function blockRegroup(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: BlockRegroupInput,
): Promise<SlideResult & { group: string }> {
  const result = await blockGroup(deps, ctx, { ...input, group: input.group });
  return { ...result, group: input.group };
}

export async function blockRotate(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: BlockRotateInput,
): Promise<SlideResult> {
  const current = (await deps.store.read()).document;
  return commitCanvasPositions(
    deps,
    ctx,
    input,
    current,
    (all) => {
      const rows = pickBlocks(all, input.blockIds, input.slideId);
      const next =
        input.to !== undefined
          ? rows.map((row) => {
              // `to` sets each object's own angle; about the selection the members turn together by
              // the difference from the first one's angle
              const by = input.to! - (rows[0]?.pos.rotate ?? 0);
              return input.about === 'selection'
                ? rotatePositions(
                    rows.map((r) => r.pos),
                    by,
                    'selection',
                  )[rows.indexOf(row)]!
                : rotatePositions([row.pos], input.to! - (row.pos.rotate ?? 0), 'each')[0]!;
            })
          : rotatePositions(
              rows.map((row) => row.pos),
              input.by ?? 0,
              input.about ?? 'each',
            );
      return positionMutations(input.slideId, rows, next);
    },
    input.blockIds,
  );
}

export async function blockFlip(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: BlockFlipInput,
): Promise<SlideResult> {
  const current = (await deps.store.read()).document;
  return commitCanvasPositions(
    deps,
    ctx,
    input,
    current,
    (all) => {
      const rows = pickBlocks(all, input.blockIds, input.slideId);
      const next = flipPositions(
        rows.map((row) => row.pos),
        input.axis,
        input.about ?? 'each',
      );
      return positionMutations(input.slideId, rows, next);
    },
    input.blockIds,
  );
}

/** True for the blocks the picture tools write (SPEC-2 2.5): a figure or the picture object. */
function isPictureLike(block: Block): block is Block & { type: 'shot' | 'picture' } {
  return block.type === 'shot' || block.type === 'picture';
}

function requirePicture(slide: Slide, blockId: string): Block & { type: 'shot' | 'picture' } {
  const block = requireBlock(slide, blockId);
  if (!isPictureLike(block))
    throw new TypeError(
      `Block "${blockId}" is a ${block.type}; the picture tools work on a picture`,
    );
  return block;
}

export async function blockCrop(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: BlockCropInput,
): Promise<SlideResult> {
  const current = (await deps.store.read()).document;
  const slide = requireSlide(current, input.slideId);
  requirePicture(slide, input.blockId);
  // crop is a canvas write on a positioned picture (SPEC-2 1.6); a figure in a grammar slot keeps
  // its slot and takes the trim in place
  const canvas =
    isCanvasSlide(slide) || requireBlock(slide, input.blockId).pos === undefined
      ? { prefix: [] as Mutation[], document: current, slide }
      : await withCanvas(deps, current, slide);
  const mutations = [
    ...canvas.prefix,
    ...fieldMutations(canvas.slide, input.blockId, { trim: input.trim }),
  ];
  return commitOrCurrent(deps, ctx, input, current, mutations);
}

export async function blockMask(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: BlockMaskInput,
): Promise<SlideResult> {
  const current = (await deps.store.read()).document;
  const slide = requireSlide(current, input.slideId);
  requirePicture(slide, input.blockId);
  return commitOrCurrent(
    deps,
    ctx,
    input,
    current,
    fieldMutations(slide, input.blockId, { mask: input.mask }),
  );
}

export async function blockResetImage(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: BlockResetImageInput,
): Promise<SlideResult> {
  const current = (await deps.store.read()).document;
  const slide = requireSlide(current, input.slideId);
  requirePicture(slide, input.blockId);
  const mutations = fieldMutations(slide, input.blockId, {
    trim: null,
    mask: null,
    adjust: null,
    crop: null,
    aspect: null,
  });
  return commitOrCurrent(deps, ctx, input, current, mutations);
}

export async function blockAdjust(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: BlockAdjustInput,
): Promise<SlideResult> {
  const current = (await deps.store.read()).document;
  const slide = requireSlide(current, input.slideId);
  const block = requirePicture(slide, input.blockId);
  const adjust: Record<string, number> = { ...(block.adjust ?? {}) };
  for (const key of ['transparency', 'brightness', 'contrast'] as const) {
    const value = input[key];
    if (value === null) delete adjust[key];
    else if (value !== undefined) adjust[key] = value;
  }
  const next = Object.keys(adjust).length === 0 ? null : adjust;
  return commitOrCurrent(
    deps,
    ctx,
    input,
    current,
    fieldMutations(slide, input.blockId, { adjust: next }),
  );
}

/** The asset a block shows, when it shows one: the description lives on it (SPEC-2 0.51). */
function shownAsset(block: Block): string | undefined {
  if (block.type === 'material') return block.asset;
  const refs = blockAssetRefs(block).filter((ref) => ref.assetId !== '');
  return refs[0]?.assetId;
}

export async function blockSetAlt(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: BlockSetAltInput,
): Promise<SlideResult & { target: 'block' | 'asset'; assetId?: string }> {
  const current = (await deps.store.read()).document;
  const slide = requireSlide(current, input.slideId);
  const block = requireBlock(slide, input.blockId);
  const assetId = shownAsset(block);
  if (assetId !== undefined) {
    const asset = current.deck.assets[assetId];
    if (asset === undefined) throw new RangeError(`Asset "${assetId}" is not in deck.json`);
    const committed = await commit(deps, ctx, input.baseRevision, [
      { op: 'asset.set', asset: { ...asset, alt: input.alt } },
    ]);
    return { ...slideResult(deps, committed, input.slideId), target: 'asset', assetId };
  }
  const result = await commitOrCurrent(
    deps,
    ctx,
    input,
    current,
    fieldMutations(slide, input.blockId, { alt: input.alt }),
  );
  return { ...result, target: 'block' };
}

/** The blocks a drop shadow lives on (SPEC-2 2.5); a heading or paragraph carries none. */
const SHADOW_TYPES: ReadonlySet<Block['type']> = new Set([
  'box',
  'shape',
  'text',
  'icon',
  'shot',
  'picture',
  'table',
]);

export async function blockShadow(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: BlockShadowInput,
): Promise<SlideResult> {
  const current = (await deps.store.read()).document;
  const slide = requireSlide(current, input.slideId);
  // the schema refuses `shadow` on the other types; refused here with the reason instead of the
  // reducer's slide level issue (integrator merge 2, the window transport's 36 actions spec)
  for (const blockId of input.blockIds) {
    const block = requireBlock(slide, blockId);
    if (!SHADOW_TYPES.has(block.type))
      throw new TypeError(
        `Block "${blockId}" is a ${block.type}; Drop shadow works on a box, shape, text box, icon, picture or table`,
      );
  }
  const mutations = input.blockIds.flatMap((blockId) =>
    fieldMutations(slide, blockId, { shadow: input.shadow }),
  );
  return commitOrCurrent(deps, ctx, input, current, mutations);
}

/** True for the blocks `autofit` lives on (SPEC-2 2.1.5). */
function takesAutofit(block: Block): boolean {
  return (
    block.type === 'heading' ||
    block.type === 'paragraph' ||
    block.type === 'text' ||
    block.type === 'box' ||
    block.type === 'shape'
  );
}

export async function blockAutofit(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: BlockAutofitInput,
): Promise<SlideResult & { written: string[] }> {
  const current = (await deps.store.read()).document;
  const slide = requireSlide(current, input.slideId);
  const block = requireBlock(slide, input.blockId);
  if (!takesAutofit(block))
    throw new TypeError(
      `Block "${input.blockId}" is a ${block.type}; Text fitting works on a text carrying block`,
    );
  const written: string[] = [];
  const mutations = fieldMutations(slide, input.blockId, { autofit: input.autofit });
  if (mutations.length > 0) written.push('autofit');
  if (input.apply === true && input.autofit !== 'none') {
    if (deps.measureFit === undefined)
      throw new TypeError(
        'block.autofit with apply needs a measurer on this transport; run it through the turboslide CLI or the studio (docs/gslides-parity/SPEC-2.md 0.64)',
      );
    const measured = (await deps.measureFit(current.deck, slide))[input.blockId];
    const pos = block.pos;
    if (
      measured?.contentHeight !== undefined &&
      pos !== undefined &&
      measured.contentHeight > pos.h + 1
    ) {
      if (input.autofit === 'grow') {
        mutations.push(
          setField(slide.id, input.blockId, '/pos/h', Math.ceil(measured.contentHeight)),
        );
        written.push('pos.h');
      } else {
        const size =
          measured.fontSize ?? ('typography' in block ? block.typography?.size : undefined);
        const step = size !== undefined ? ladderStepDown(size) : undefined;
        if (step !== undefined) {
          const typography = {
            ...('typography' in block ? (block.typography ?? {}) : {}),
            size: step,
          };
          mutations.push(setField(slide.id, input.blockId, '/typography', typography));
          written.push('typography.size');
        }
      }
    } else if (input.autofit === 'grow' && pos === undefined) {
      throw new TypeError(
        `Block "${input.blockId}" has no position box; Resize shape to fit text works on an object of the canvas (docs/gslides-parity/SPEC-2.md 0.41)`,
      );
    }
  }
  const result = await commitOrCurrent(deps, ctx, input, current, mutations);
  return { ...result, written };
}

/** The Text at a pointer of a block, checked to be one of its Text fields. */
function textAt(block: Block, path: string): string {
  if (!blockTextPaths(block).includes(path))
    throw new RangeError(
      `${path} is not a Text of a ${block.type} block (${blockTextPaths(block).join(', ') || 'it has none'})`,
    );
  const value = getAt(block, path);
  if (typeof value !== 'string')
    throw new TypeError(`${path} on block "${block.id}" is not a Text`);
  return value;
}

/** One text.replace of the whole Text (SPEC-2 section 3: text.style, text.case, text.insert). */
function replaceWhole(
  slideId: string,
  blockId: string,
  path: string,
  current: string,
  next: string,
): Mutation[] {
  if (next === current) return [];
  return [{ op: 'text.replace', slideId, blockId, path, range: [0, current.length], text: next }];
}

export async function textStyle(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: TextStyleInput,
): Promise<SlideResult & { text: string }> {
  const current = (await deps.store.read()).document;
  const slide = requireSlide(current, input.slideId);
  const text = textAt(requireBlock(slide, input.blockId), input.path);
  const next = styleRange(text, input.range, input.marks);
  const result = await commitOrCurrent(
    deps,
    ctx,
    input,
    current,
    replaceWhole(input.slideId, input.blockId, input.path, text, next),
  );
  return { ...result, text: textAt(requireBlock(result.slide, input.blockId), input.path) };
}

export async function textCase(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: TextCaseInput,
): Promise<SlideResult & { text: string }> {
  const current = (await deps.store.read()).document;
  const slide = requireSlide(current, input.slideId);
  const text = textAt(requireBlock(slide, input.blockId), input.path);
  const next = caseRange(text, input.range, input.mode);
  const result = await commitOrCurrent(
    deps,
    ctx,
    input,
    current,
    replaceWhole(input.slideId, input.blockId, input.path, text, next),
  );
  return { ...result, text: textAt(requireBlock(result.slide, input.blockId), input.path) };
}

export async function textInsert(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: TextInsertInput,
): Promise<SlideResult & { text: string }> {
  const current = (await deps.store.read()).document;
  const slide = requireSlide(current, input.slideId);
  const text = textAt(requireBlock(slide, input.blockId), input.path);
  if (input.at > plainLength(text))
    throw new RangeError(
      `Offset ${input.at} is past the end of a text of ${plainLength(text)} characters`,
    );
  const next = insertTextAt(text, input.at, input.text);
  const result = await commitOrCurrent(
    deps,
    ctx,
    input,
    current,
    replaceWhole(input.slideId, input.blockId, input.path, text, next),
  );
  return { ...result, text: textAt(requireBlock(result.slide, input.blockId), input.path) };
}

function numberPresetOf(preset: string | undefined): NumberPreset {
  return preset !== undefined && (NUMBER_PRESETS as ReadonlyArray<string>).includes(preset)
    ? (preset as NumberPreset)
    : 'digit-alpha-roman';
}

/** A paragraph or text box as a list block, one item per paragraph (the round one Bulleted list). */
function listBlockFrom(block: Block): Block {
  if (block.type === 'plain') return block;
  if (block.type !== 'paragraph' && block.type !== 'text' && block.type !== 'box')
    throw new TypeError(
      `Block "${block.id}" is a ${block.type}; List options work on a list, a paragraph or a text box`,
    );
  const items = splitParagraphs(block.text ?? '')
    .filter((paragraph) => paragraph.trim() !== '')
    .map((paragraph) => ({ text: paragraph }));
  return {
    id: block.id,
    type: 'plain',
    items: items.length > 0 ? items : [{ text: '' }],
    ...(block.pos !== undefined ? { pos: block.pos } : {}),
  };
}

export async function textList(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: TextListInput,
): Promise<SlideResult> {
  const current = (await deps.store.read()).document;
  const slide = requireSlide(current, input.slideId);
  const source = requireBlock(slide, input.blockId);
  const mutations: Mutation[] = [];
  let list = listBlockFrom(source);
  if (list !== source) {
    // the paragraph becomes a list in place: the block is replaced by removing and inserting it
    const placed = slideBlocks(slide);
    const index = placed.findIndex(({ block }) => block.id === source.id);
    const row = placed[index];
    if (row === undefined) throw new RangeError(`No block "${source.id}" on slide "${slide.id}"`);
    const before = placed
      .slice(0, index)
      .filter((candidate) => candidate.slot === row.slot)
      .at(-1);
    mutations.push({ op: 'block.remove', slideId: slide.id, blockId: source.id });
    mutations.push({
      op: 'block.insert',
      slideId: slide.id,
      slot: row.slot,
      ...(before !== undefined ? { after: before.block.id } : {}),
      block: list,
    });
  }
  if (list.type !== 'plain') throw new TypeError('not a list');
  const next = { ...list, items: list.items.map((item) => ({ ...item })) };
  if (input.marker !== undefined) {
    if (input.marker === 'rule') {
      delete next.marker;
      delete next.preset;
    } else {
      next.marker = input.marker;
      const family: ReadonlyArray<string> =
        input.marker === 'bullet' ? BULLET_PRESETS : NUMBER_PRESETS;
      if (next.preset !== undefined && !family.includes(next.preset)) delete next.preset;
    }
  }
  if (input.preset !== undefined) {
    const marker = next.marker;
    const bullet = (BULLET_PRESETS as ReadonlyArray<string>).includes(input.preset);
    if (marker === undefined || marker === 'rule') next.marker = bullet ? 'bullet' : 'number';
    else if ((marker === 'bullet') !== bullet)
      throw new TypeError(
        `The preset ${input.preset} belongs to the ${bullet ? 'bullet' : 'number'} family, not to marker ${marker}`,
      );
    next.preset = input.preset;
  }
  if (input.level !== undefined || input.levelBy !== undefined) {
    const targets = input.items ?? next.items.map((_item, i) => i);
    for (const index of targets) {
      const item = next.items[index];
      if (item === undefined)
        throw new RangeError(
          `The list has ${next.items.length} item(s); item ${index} does not exist`,
        );
      const level = Math.min(
        LIST_LEVEL_MAX,
        Math.max(1, input.level ?? (item.level ?? 1) + (input.levelBy ?? 0)),
      );
      if (level === 1) delete item.level;
      else item.level = level;
    }
  }
  if (list !== source) {
    // the fresh block carries the final fields in one insert
    const insert = mutations[mutations.length - 1];
    if (insert !== undefined && insert.op === 'block.insert') insert.block = next;
  } else {
    for (const key of ['marker', 'preset', 'items'] as const) {
      if (
        !jsonEqual((list as Record<string, unknown>)[key], (next as Record<string, unknown>)[key])
      )
        mutations.push(
          setField(slide.id, list.id, `/${key}`, (next as Record<string, unknown>)[key]),
        );
    }
  }
  return commitOrCurrent(deps, ctx, input, current, mutations);
}

/** The blocks `typography` lives on. */
function requireTypographyBlock(
  slide: Slide,
  blockId: string,
): Block & { typography?: Record<string, unknown> } {
  const block = requireBlock(slide, blockId);
  if (!('typography' in block) && !takesAutofit(block))
    throw new TypeError(`Block "${blockId}" is a ${block.type}; it carries no typography`);
  return block as Block & { typography?: Record<string, unknown> };
}

function typographyWrite(
  slide: Slide,
  blockId: string,
  edits: Record<string, number | null | undefined>,
): Mutation[] {
  const block = requireTypographyBlock(slide, blockId);
  const typography: Record<string, unknown> = { ...(block.typography ?? {}) };
  for (const [key, value] of Object.entries(edits)) {
    if (value === undefined) continue;
    if (value === null) delete typography[key];
    else typography[key] = value;
  }
  const next = Object.keys(typography).length === 0 ? undefined : typography;
  if (jsonEqual(next, block.typography)) return [];
  return [setField(slide.id, blockId, '/typography', next)];
}

export async function textSpacing(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: TextSpacingInput,
): Promise<SlideResult> {
  const current = (await deps.store.read()).document;
  const slide = requireSlide(current, input.slideId);
  const mutations = input.blockIds.flatMap((blockId) =>
    typographyWrite(slide, blockId, {
      leading: input.line,
      spaceBefore: input.before,
      spaceAfter: input.after,
    }),
  );
  return commitOrCurrent(deps, ctx, input, current, mutations);
}

export async function textColumns(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: TextColumnsInput,
): Promise<SlideResult> {
  const current = (await deps.store.read()).document;
  const slide = requireSlide(current, input.slideId);
  const mutations = input.blockIds.flatMap((blockId) =>
    typographyWrite(slide, blockId, { columns: input.columns === 1 ? null : input.columns }),
  );
  return commitOrCurrent(deps, ctx, input, current, mutations);
}

export async function textIndent(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: TextIndentInput,
): Promise<SlideResult> {
  const current = (await deps.store.read()).document;
  const slide = requireSlide(current, input.slideId);
  const mutations: Mutation[] = [];
  for (const blockId of input.blockIds) {
    const block = requireBlock(slide, blockId);
    // a list steps its items' levels (SPEC-2 0.22)
    if (block.type === 'plain' && (input.items !== undefined || input.by !== undefined)) {
      const items = block.items.map((item) => ({ ...item }));
      const targets = input.items ?? items.map((_item, i) => i);
      for (const index of targets) {
        const item = items[index];
        if (item === undefined)
          throw new RangeError(
            `The list has ${items.length} item(s); item ${index} does not exist`,
          );
        const level = Math.min(
          LIST_LEVEL_MAX,
          Math.max(
            1,
            input.to !== undefined
              ? Math.round(input.to / INDENT_STEP_PX) + 1
              : (item.level ?? 1) + (input.by ?? 0),
          ),
        );
        if (level === 1) delete item.level;
        else item.level = level;
      }
      if (!jsonEqual(items, block.items))
        mutations.push(setField(slide.id, blockId, '/items', items));
      continue;
    }
    const typo = requireTypographyBlock(slide, blockId);
    const currentIndent =
      typeof typo.typography?.['indent'] === 'number' ? (typo.typography['indent'] as number) : 0;
    const indent =
      input.to !== undefined
        ? input.to
        : Math.max(0, currentIndent + (input.by ?? 0) * INDENT_STEP_PX);
    mutations.push(...typographyWrite(slide, blockId, { indent: indent === 0 ? null : indent }));
  }
  return commitOrCurrent(deps, ctx, input, current, mutations);
}

function requireChart(slide: Slide, blockId: string): Block & { type: 'chart' } {
  const block = requireBlock(slide, blockId);
  if (block.type !== 'chart')
    throw new TypeError(`Block "${blockId}" is a ${block.type}, not a chart`);
  return block;
}

export async function chartSetData(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: ChartSetDataInput,
): Promise<SlideResult> {
  const current = (await deps.store.read()).document;
  const slide = requireSlide(current, input.slideId);
  requireChart(slide, input.blockId);
  const mutations = fieldMutations(slide, input.blockId, {
    categories: input.categories,
    series: input.series,
  });
  return commitOrCurrent(deps, ctx, input, current, mutations);
}

export async function chartSetKind(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: ChartSetKindInput,
): Promise<SlideResult & { dropped: string[] }> {
  const current = (await deps.store.read()).document;
  const slide = requireSlide(current, input.slideId);
  const chart = requireChart(slide, input.blockId);
  const dropped: string[] = [];
  const mutations = fieldMutations(slide, input.blockId, { kind: input.kind });
  if (input.kind === 'pie' && chart.series.length > 1) {
    dropped.push(...chart.series.slice(1).map((series) => series.name));
    mutations.push(setField(slide.id, input.blockId, '/series', chart.series.slice(0, 1)));
  }
  const result = await commitOrCurrent(deps, ctx, input, current, mutations);
  return { ...result, dropped };
}

function requireTable(slide: Slide, blockId: string): Block & { type: 'table' } {
  const block = requireBlock(slide, blockId);
  if (block.type !== 'table')
    throw new TypeError(`Block "${blockId}" is a ${block.type}, not a table`);
  return block;
}

/** One table command as the block.set writes of the fields it changed, or the table's removal. */
async function tableWrite(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: Rev & { slideId: string; blockId: string },
  command: TableCommand,
): Promise<SlideResult> {
  const current = (await deps.store.read()).document;
  const slide = requireSlide(current, input.slideId);
  const table = requireTable(slide, input.blockId);
  const edit = applyTableCommand(table, command);
  if ('deleted' in edit) {
    const committed = await commit(deps, ctx, input.baseRevision, [
      { op: 'block.remove', slideId: input.slideId, blockId: input.blockId },
    ]);
    return slideResult(deps, committed, input.slideId);
  }
  const mutations = fieldMutations(slide, input.blockId, {
    columns: edit.columns,
    rows: edit.rows,
    spans: edit.spans ?? null,
    cells: edit.cells ?? null,
  });
  return commitOrCurrent(deps, ctx, input, current, mutations);
}

export function tableMerge(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: TableMergeInput,
): Promise<SlideResult> {
  return tableWrite(deps, ctx, input, { kind: 'merge', from: input.from, to: input.to });
}

export function tableUnmerge(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: TableUnmergeInput,
): Promise<SlideResult> {
  return tableWrite(deps, ctx, input, { kind: 'unmerge', at: input.at });
}

export function tableInsertRows(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: TableInsertRowsInput,
): Promise<SlideResult> {
  return tableWrite(deps, ctx, input, {
    kind: 'insertRows',
    at: input.at,
    ...(input.count !== undefined ? { count: input.count } : {}),
    where: input.where,
  });
}

export function tableInsertColumns(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: TableInsertColumnsInput,
): Promise<SlideResult> {
  return tableWrite(deps, ctx, input, {
    kind: 'insertColumns',
    at: input.at,
    ...(input.count !== undefined ? { count: input.count } : {}),
    where: input.where,
  });
}

export function tableDeleteRows(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: TableDeleteInput,
): Promise<SlideResult> {
  return tableWrite(deps, ctx, input, {
    kind: 'deleteRows',
    from: input.from,
    ...(input.to !== undefined ? { to: input.to } : {}),
  });
}

export function tableDeleteColumns(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: TableDeleteInput,
): Promise<SlideResult> {
  return tableWrite(deps, ctx, input, {
    kind: 'deleteColumns',
    from: input.from,
    ...(input.to !== undefined ? { to: input.to } : {}),
  });
}

export function tableDistribute(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: TableDistributeInput,
): Promise<SlideResult> {
  return tableWrite(
    deps,
    ctx,
    input,
    input.axis === 'rows'
      ? { kind: 'distributeRows', ...(input.total !== undefined ? { total: input.total } : {}) }
      : { kind: 'distributeColumns', ...(input.total !== undefined ? { total: input.total } : {}) },
  );
}

export function tableCellStyle(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: TableCellStyleInput,
): Promise<SlideResult> {
  return tableWrite(deps, ctx, input, {
    kind: 'cellStyle',
    cells: input.cells,
    ...(input.fill !== undefined ? { fill: input.fill } : {}),
    ...(input.border !== undefined ? { border: input.border } : {}),
  });
}

function requireShape(slide: Slide, blockId: string): ShapeBlock {
  const block = requireBlock(slide, blockId);
  if (block.type !== 'shape')
    throw new TypeError(`Block "${blockId}" is a ${block.type}, not a shape`);
  return block;
}

export async function shapeSet(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: ShapeSetInput,
): Promise<SlideResult> {
  const current = (await deps.store.read()).document;
  const slide = requireSlide(current, input.slideId);
  const mutations: Mutation[] = [];
  for (const blockId of input.blockIds) {
    const shape = requireShape(slide, blockId);
    if (input.kind !== undefined && isLineKind(input.kind) !== isLineKind(shape.shape))
      throw new TypeError(
        `Block "${blockId}" is a ${isLineKind(shape.shape) ? 'line' : 'closed shape'}; ${input.kind} is a ${isLineKind(input.kind) ? 'line kind (line.set)' : 'closed shape'}`,
      );
    mutations.push(
      ...fieldMutations(slide, blockId, {
        shape: input.kind,
        adjust: input.adjust,
        fill: input.fill,
        stroke: input.stroke,
        width: input.width,
        dash: input.dash,
        radius: input.radius,
      }),
    );
    // a changed preset drops adjust values of the old one unless new ones came with it
    if (
      input.kind !== undefined &&
      input.kind !== shape.shape &&
      input.adjust === undefined &&
      shape.adjust !== undefined
    )
      mutations.push(setField(slide.id, blockId, '/adjust', undefined));
  }
  return commitOrCurrent(deps, ctx, input, current, mutations);
}

export async function lineSet(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: LineSetInput,
): Promise<SlideResult> {
  const current = (await deps.store.read()).document;
  const slide = requireSlide(current, input.slideId);
  const mutations: Mutation[] = [];
  const objects = new Map(slideBlocks(slide).map(({ block }) => [block.id, block]));
  for (const blockId of input.blockIds) {
    const shape = requireShape(slide, blockId);
    if (!isLineKind(shape.shape))
      throw new TypeError(
        `Block "${blockId}" is a ${shape.shape}, a closed shape; shape.set writes it`,
      );
    mutations.push(
      ...fieldMutations(slide, blockId, {
        shape: input.kind,
        lineStart: input.start,
        lineEnd: input.end,
        width: input.weight,
        dash: input.dash,
        bend: input.bend,
        points: input.points,
      }),
    );
    if (input.connect !== undefined) {
      if (shape.pos === undefined)
        throw new TypeError(
          `Block "${blockId}" has no position box; a connector attaches on the canvas`,
        );
      const fields = attachConnector(shape, objects, input.connect);
      mutations.push(...fieldMutations(slide, blockId, fields as Record<string, unknown>));
      if (fields.connect === undefined && shape.connect !== undefined)
        mutations.push(setField(slide.id, blockId, '/connect', undefined));
    }
  }
  return commitOrCurrent(deps, ctx, input, current, mutations);
}

/** The default box a diagram lands in: 960 by 540 centred on the sheet (Insert > Chart's box, SPEC-2 2.8.2). */
const DIAGRAM_BOX: Position = {
  x: (SHEET_WIDTH - 960) / 2,
  y: (SHEET_HEIGHT - 540) / 2,
  w: 960,
  h: 540,
};

export async function diagramInsert(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: DiagramInsertInput,
): Promise<SlideResult & { blockIds: string[]; group: string }> {
  if (deps.diagrams === undefined)
    throw new TypeError(
      'diagram.insert needs the diagram templates, which this transport does not carry yet (docs/gslides-parity/SPEC-2.md 2.8.3)',
    );
  const current = (await deps.store.read()).document;
  const canvas = await withCanvas(deps, current, requireSlide(current, input.slideId));
  const slide = canvas.slide;
  const taken = new Set(slideBlocks(slide).map(({ block }) => block.id));
  const group = freeId(input.kind, groupTags(slide));
  const box = input.pos ?? { ...DIAGRAM_BOX };
  const maxZ = Math.max(-1, ...canvasObjects(slide).map((block) => block.pos?.z ?? 0));
  const blocks = deps
    .diagrams(input.kind, input.count, input.style ?? 'outline', box, group)
    .map((block, index) => {
      const id = freeId(block.id, taken);
      const pos = block.pos === undefined ? undefined : { ...block.pos, z: maxZ + 1 + index };
      return { ...block, id, ...(pos !== undefined ? { pos } : {}) } as Block;
    });
  const mutations: Mutation[] = [...canvas.prefix];
  let after = input.after;
  for (const block of blocks) {
    mutations.push({
      op: 'block.insert',
      slideId: slide.id,
      slot: 'main',
      ...(after !== undefined ? { after } : {}),
      block,
    });
    after = block.id;
  }
  const committed = await commit(deps, ctx, input.baseRevision, mutations);
  return {
    ...slideResult(deps, committed, input.slideId),
    blockIds: blocks.map((block) => block.id),
    group,
  };
}

/** The store facts deck.info and slide.list report for the canvas (SPEC-2 0.93). */
export function canvasCounts(document: DeckDocument): {
  canvas: number;
  charts: number;
  guides: number;
} {
  let canvas = 0;
  let charts = 0;
  for (const slide of Object.values(document.slides)) {
    if (isCanvasSlide(slide)) canvas += 1;
    for (const { block } of slideBlocks(slide)) if (block.type === 'chart') charts += 1;
  }
  const guides = (document.deck.guides?.x.length ?? 0) + (document.deck.guides?.y.length ?? 0);
  return { canvas, charts, guides };
}

// ---------------------------------------------------------------------------------------------
// Round three (gslides-parity SPEC-3 5.7, 10.5, 12): version.diff, picture.dither,
// picture.materialize and slide.setBackgroundPicture. The record actions (comments, share, the
// inbox, accounts, admin, presence) need the file system and live in record-actions.ts.

export type VersionDiffInput = { from?: number; to?: number; staged?: boolean };
export type VersionDiffResult = {
  from: number;
  to: number;
  mutations: Mutation[];
  byAuthor: {
    author: Author;
    blocks: { slideId: string; blockId?: string; ops: Mutation['op'][] }[];
  }[];
};

/** The slide and block a mutation touches, for the Show changes grouping; deck level ops touch none. */
function touchedBy(mutation: Mutation): { slideId: string; blockId?: string } | undefined {
  switch (mutation.op) {
    case 'block.set':
    case 'block.remove':
    case 'block.move':
    case 'text.replace':
    case 'text.splice':
    case 'text.mark':
      return { slideId: mutation.slideId, blockId: mutation.blockId };
    case 'block.insert':
      return { slideId: mutation.slideId, blockId: mutation.block.id };
    case 'slide.set':
    case 'slide.replace':
    case 'slide.remove':
    case 'slide.move':
      return { slideId: mutation.slideId };
    case 'slide.insert':
      return { slideId: mutation.slide.id };
    default:
      return undefined;
  }
}

function authorKey(author: Author): string {
  return (
    author.principalId ??
    (author.kind === 'agent' ? `agent:${author.runId ?? author.name}` : `local:${author.name}`)
  );
}

/**
 * The mutations between two revisions grouped by touched block and by author (SPEC-3 5.7, 0.44):
 * the data behind Show changes. The range follows diff.run (from omitted with staged is the last
 * named version; to defaults to the current revision); the records inside the range attribute
 * every mutation to its author, so a version's authors group the touched blocks.
 */
export async function versionDiff(
  deps: StoreActionDeps,
  input: VersionDiffInput,
): Promise<VersionDiffResult> {
  const current = (await deps.store.read()).document;
  const records = await deps.store.records();
  const range = resolveDiffRange(input, current.deck.revision, records);
  if (range.from > range.to)
    throw new TypeError(`version.diff reads forward: from ${range.from} is after to ${range.to}`);
  if (range.to > current.deck.revision)
    throw new RangeError(
      `revision ${range.to} does not exist yet; the deck is at ${current.deck.revision}`,
    );
  const inside = records.filter(
    (record) => record.baseRevision >= range.from && record.revision <= range.to,
  );
  const before =
    range.from === current.deck.revision
      ? current
      : await deps.store.documentAtRevision(range.from);
  const after =
    range.to === current.deck.revision ? current : await deps.store.documentAtRevision(range.to);
  const mutations = diffDecks(before, after);
  const groups = new Map<
    string,
    {
      author: Author;
      blocks: Map<string, { slideId: string; blockId?: string; ops: Mutation['op'][] }>;
    }
  >();
  for (const record of inside) {
    const key = authorKey(record.author);
    const group = groups.get(key) ?? { author: record.author, blocks: new Map() };
    groups.set(key, group);
    for (const mutation of record.mutations) {
      const touched = touchedBy(mutation);
      if (touched === undefined) continue;
      const id = `${touched.slideId}#${touched.blockId ?? ''}`;
      const row = group.blocks.get(id) ?? {
        slideId: touched.slideId,
        ...(touched.blockId !== undefined ? { blockId: touched.blockId } : {}),
        ops: [],
      };
      if (!row.ops.includes(mutation.op)) row.ops.push(mutation.op);
      group.blocks.set(id, row);
    }
  }
  return {
    from: range.from,
    to: range.to,
    mutations,
    byAuthor: [...groups.values()].map((group) => ({
      author: group.author,
      blocks: [...group.blocks.values()],
    })),
  };
}

export type PictureDitherInput = Rev & {
  slideId: string;
  blockId: string;
  dither: PictureDither | null;
};
export type PictureDitherResult = SlideResult & {
  key?: string;
  metrics?: Asset['metrics'];
  warnings: string[];
};

/** The screen size a dithered picture is keyed at: its box, or the sheet for a covering picture without one (the renderer's rule). */
function screenOf(block: Block, dither: PictureDither): [number, number] {
  const w = block.pos?.w ?? SHEET_WIDTH;
  const h = block.pos?.h ?? SHEET_HEIGHT;
  return ditherScreen(w, h, resolveDither(dither).cell);
}

/**
 * The dither field on a picture or a shot (SPEC-3 10.5): writes `block.set /dither`, or removes
 * the field with null; a slide that is not a canvas converts first when the picture is
 * positioned, the rule of block.crop; a dither over an asset with a two tone treatment and no
 * continuous source is refused with the sentence of 10.1. The answer carries the variant key, the
 * variant's metrics when one is materialized and a warning when none is.
 */
export async function pictureDither(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: PictureDitherInput,
): Promise<PictureDitherResult> {
  const current = (await deps.store.read()).document;
  const slide = requireSlide(current, input.slideId);
  const picture = requirePicture(slide, input.blockId);
  const asset = current.deck.assets[picture.asset];
  if (asset === undefined)
    throw new RangeError(`No asset "${picture.asset}" for block "${input.blockId}"`);
  if (input.dither !== null && !hasContinuousSource(asset)) {
    throw new TypeError(
      `Block "${input.blockId}" dithers asset "${asset.id}": ${DITHER_NO_SOURCE_MESSAGE}`,
    );
  }
  const canvas =
    isCanvasSlide(slide) || picture.pos === undefined
      ? { prefix: [] as Mutation[], document: current, slide }
      : await withCanvas(deps, current, slide);
  const mutations = [
    ...canvas.prefix,
    ...fieldMutations(canvas.slide, input.blockId, { dither: input.dither }),
  ];
  const warnings: string[] = [];
  if (mutations.length === 0)
    warnings.push('the field already held this value; nothing was written');
  const result =
    mutations.length === 0
      ? {
          slide: canvas.slide,
          revision: current.deck.revision,
          findings: findingsFor(deps, current, input.slideId),
        }
      : await commitOrCurrent(deps, ctx, input, current, mutations);
  if (input.dither === null) return { ...result, warnings };
  const key = ditherKey({
    source: ditherSourceOf(asset),
    dither: input.dither,
    screen: screenOf(picture, input.dither),
  });
  const variant = asset.variants?.[key];
  if (variant === undefined)
    warnings.push(
      `no variant is materialized for key ${key.slice(0, 12)} yet; the editor draws the live overlay and \`turboslide picture materialize\` writes the files every export reads`,
    );
  return {
    ...result,
    key,
    ...(variant?.metrics !== undefined ? { metrics: variant.metrics } : {}),
    warnings,
  };
}

export type PictureMaterializeInput = Rev & {
  slideIds?: 'all' | string[];
  blockIds?: string[];
  prune?: boolean;
  scale?: 1 | 2;
  dryRun?: boolean;
};
export type PictureMaterializeResult = {
  revision: number;
  written: { assetId: string; key: string; files: string[]; metrics?: Asset['metrics'] }[];
  pruned: { assetId: string; key: string }[];
  missing: { slideId: string; blockId: string; assetId: string; key: string }[];
};

type DitheredPicture = {
  slideId: string;
  block: Block & { type: 'picture' | 'shot' };
  dither: PictureDither;
  asset: Asset;
  key: string;
  screen: [number, number];
};

/** Every dithered picture or shot on the named slides with its variant key. */
function ditheredPictures(
  document: DeckDocument,
  slideIds: 'all' | string[] | undefined,
  blockIds?: string[],
): DitheredPicture[] {
  const ids = slideIds === undefined || slideIds === 'all' ? slideOrder(document.deck) : slideIds;
  const out: DitheredPicture[] = [];
  for (const slideId of ids) {
    const slide = requireSlide(document, slideId);
    for (const { block } of slideBlocks(slide)) {
      if (!isPictureLike(block)) continue;
      if (blockIds !== undefined && !blockIds.includes(block.id)) continue;
      const dither = (block as { dither?: PictureDither }).dither;
      if (dither === undefined) continue;
      const asset = document.deck.assets[block.asset];
      if (asset === undefined) continue;
      const screen = screenOf(block, dither);
      out.push({
        slideId,
        block,
        dither,
        asset,
        key: ditherKey({ source: ditherSourceOf(asset), dither, screen }),
        screen,
      });
    }
  }
  return out;
}

/**
 * The variant files and records of every dithered picture on the named slides (SPEC-3 10.4,
 * 10.5): `dryRun` names the missing variants without writing; `prune` drops the variants no
 * picture references (one asset.set per asset, the files removed after the record commits); the
 * write path runs the bound Materializer and records every variant in one write.
 */
export async function pictureMaterialize(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: PictureMaterializeInput,
): Promise<PictureMaterializeResult> {
  const current = (await deps.store.read()).document;
  const pictures = ditheredPictures(current, input.slideIds, input.blockIds);
  const missing = pictures.filter((row) => row.asset.variants?.[row.key] === undefined);
  const referenced = new Set(
    ditheredPictures(current, 'all').map((row) => `${row.asset.id}:${row.key}`),
  );
  const pruned: PictureMaterializeResult['pruned'] = [];
  if (input.prune === true) {
    for (const asset of Object.values(current.deck.assets)) {
      for (const key of Object.keys(asset.variants ?? {})) {
        if (!referenced.has(`${asset.id}:${key}`)) pruned.push({ assetId: asset.id, key });
      }
    }
  }
  const missingRows = missing.map((row) => ({
    slideId: row.slideId,
    blockId: row.block.id,
    assetId: row.asset.id,
    key: row.key,
  }));
  if (input.dryRun === true)
    return { revision: current.deck.revision, written: [], pruned, missing: missingRows };
  const written: PictureMaterializeResult['written'] = [];
  const nextAssets = new Map<string, Asset>();
  const assetOf = (id: string): Asset =>
    nextAssets.get(id) ?? cloneJsonAsset(current.deck.assets[id]);
  const seen = new Set<string>();
  for (const row of missing) {
    if (seen.has(`${row.asset.id}:${row.key}`)) continue;
    seen.add(`${row.asset.id}:${row.key}`);
    if (deps.materialize === undefined) {
      throw new TypeError(
        'picture.materialize needs the dither pipeline (@turboslide/effects/dither, gslides-parity SPEC-3 10.2) bound on this transport; run it through the turboslide CLI once the pipeline lands, or pass dryRun to list the missing variants',
      );
    }
    const asset = assetOf(row.asset.id);
    const { variant, files } = await deps.materialize({
      asset,
      dither: row.dither,
      key: row.key,
      screen: row.screen,
      scale: input.scale ?? 2,
    });
    asset.variants = { ...(asset.variants ?? {}), [row.key]: variant };
    nextAssets.set(asset.id, asset);
    written.push({
      assetId: asset.id,
      key: row.key,
      files,
      ...(variant.metrics !== undefined ? { metrics: variant.metrics } : {}),
    });
  }
  const removed: string[] = [];
  for (const { assetId, key } of pruned) {
    const asset = assetOf(assetId);
    const variant = asset.variants?.[key];
    if (variant === undefined) continue;
    const rest = { ...asset.variants };
    delete rest[key];
    if (Object.keys(rest).length > 0) asset.variants = rest;
    else delete asset.variants;
    nextAssets.set(assetId, asset);
    removed.push(
      ...('neutral' in variant.twins
        ? [variant.twins.neutral]
        : [variant.twins.light, variant.twins.dark]),
    );
  }
  if (nextAssets.size === 0)
    return { revision: current.deck.revision, written, pruned, missing: [] };
  const committed = await commit(
    deps,
    ctx,
    input.baseRevision,
    [...nextAssets.values()].map((asset) => ({ op: 'asset.set', asset })),
  );
  for (const relative of removed) await deps.store.removeAsset(relative);
  return { revision: committed.revision, written, pruned, missing: [] };
}

function cloneJsonAsset(asset: Asset | undefined): Asset {
  if (asset === undefined) throw new RangeError('no such asset');
  return JSON.parse(JSON.stringify(asset)) as Asset;
}

export type SlideSetBackgroundPictureInput = Rev & {
  slideIds: string[];
  assetId: string;
  alt?: string;
  dither?: PictureDither;
  replace?: boolean;
};
export type SlideSetBackgroundPictureResult = {
  revision: number;
  assetId: string;
  slides: { slideId: string; blockId: string }[];
  findings: Finding[];
};

/** The covering picture at the bottom of a canvas slide's stack, when one exists (SPEC-3 10.6). */
export function coveringPicture(slide: Slide): (Block & { type: 'picture' }) | undefined {
  const objects = canvasObjects(slide).filter(
    (block): block is Block & { type: 'picture' } =>
      block.type === 'picture' &&
      block.pos !== undefined &&
      block.pos.x === 0 &&
      block.pos.y === 0 &&
      block.pos.w === SHEET_WIDTH &&
      block.pos.h === SHEET_HEIGHT,
  );
  if (objects.length === 0) return undefined;
  return objects.sort((a, b) => (a.pos?.z ?? 0) - (b.pos?.z ?? 0))[0];
}

/**
 * One write for a covering picture object at the back of each named slide with an optional
 * dither (SPEC-3 10.5, 10.6): the slide converts to the canvas first, the covering picture already
 * there is replaced unless told not to, else a new picture lands at (0, 0, 1600, 900) under every
 * other object. The file, url and upload forms run asset.add first (the Node side of this action,
 * record-actions.ts) and call this with the asset id.
 */
export async function slideSetBackgroundPicture(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: SlideSetBackgroundPictureInput,
): Promise<SlideSetBackgroundPictureResult> {
  const current = (await deps.store.read()).document;
  const asset = current.deck.assets[input.assetId];
  if (asset === undefined) throw new RangeError(`No asset "${input.assetId}"`);
  if (input.dither !== undefined && !hasContinuousSource(asset)) {
    throw new TypeError(`asset "${asset.id}": ${DITHER_NO_SOURCE_MESSAGE}`);
  }
  const slides = slidesInOrder(current, input.slideIds);
  const mutations: Mutation[] = [];
  const placed: SlideSetBackgroundPictureResult['slides'] = [];
  let working = current;
  for (const slide of slides) {
    const canvas = await withCanvas(deps, working, slide);
    mutations.push(...canvas.prefix);
    working = canvas.document;
    const existing = input.replace === false ? undefined : coveringPicture(canvas.slide);
    if (existing !== undefined) {
      mutations.push(
        ...fieldMutations(canvas.slide, existing.id, {
          asset: input.assetId,
          ...(input.alt !== undefined ? { alt: input.alt } : {}),
          dither: input.dither ?? null,
        }),
      );
      placed.push({ slideId: slide.id, blockId: existing.id });
      continue;
    }
    const taken = new Set(slideBlocks(canvas.slide).map(({ block }) => block.id));
    const id = freeId('background', taken);
    const minZ = Math.min(0, ...canvasObjects(canvas.slide).map((block) => block.pos?.z ?? 0));
    const block = {
      id,
      type: 'picture',
      asset: input.assetId,
      ...(input.alt !== undefined ? { alt: input.alt } : {}),
      ...(input.dither !== undefined ? { dither: input.dither } : {}),
      pos: { x: 0, y: 0, w: SHEET_WIDTH, h: SHEET_HEIGHT, z: minZ - 1 },
    } as unknown as Block;
    mutations.push({ op: 'block.insert', slideId: slide.id, slot: 'main', block });
    placed.push({ slideId: slide.id, blockId: id });
  }
  const committed = await commit(deps, ctx, input.baseRevision, mutations);
  return {
    revision: committed.revision,
    assetId: input.assetId,
    slides: placed,
    findings: placed.flatMap((row) => findingsFor(deps, committed.document, row.slideId)),
  };
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
    'deck.tailor',
    on<DeckTailorInput>((i, c) => deckTailor(deps, c, i)),
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
  // the Google Slides parity round two (SPEC-2 section 3)
  dispatcher.register(
    'slide.toCanvas',
    on<SlideToCanvasInput>((i, c) => slideToCanvas(deps, c, i)),
  );
  dispatcher.register(
    'deck.guides',
    on<DeckGuidesInput>((i, c) => deckGuides(deps, c, i)),
  );
  dispatcher.register(
    'slide.setBackground',
    on<SlideSetBackgroundInput>((i, c) => slideSetBackground(deps, c, i)),
  );
  dispatcher.register(
    'deck.setBackground',
    on<DeckSetBackgroundInput>((i, c) => deckSetBackground(deps, c, i)),
  );
  dispatcher.register(
    'block.group',
    on<BlockGroupInput>((i, c) => blockGroup(deps, c, i)),
  );
  dispatcher.register(
    'block.ungroup',
    on<BlockUngroupInput>((i, c) => blockUngroup(deps, c, i)),
  );
  dispatcher.register(
    'block.regroup',
    on<BlockRegroupInput>((i, c) => blockRegroup(deps, c, i)),
  );
  dispatcher.register(
    'block.rotate',
    on<BlockRotateInput>((i, c) => blockRotate(deps, c, i)),
  );
  dispatcher.register(
    'block.flip',
    on<BlockFlipInput>((i, c) => blockFlip(deps, c, i)),
  );
  dispatcher.register(
    'block.crop',
    on<BlockCropInput>((i, c) => blockCrop(deps, c, i)),
  );
  dispatcher.register(
    'block.mask',
    on<BlockMaskInput>((i, c) => blockMask(deps, c, i)),
  );
  dispatcher.register(
    'block.resetImage',
    on<BlockResetImageInput>((i, c) => blockResetImage(deps, c, i)),
  );
  dispatcher.register(
    'block.adjust',
    on<BlockAdjustInput>((i, c) => blockAdjust(deps, c, i)),
  );
  dispatcher.register(
    'block.setAlt',
    on<BlockSetAltInput>((i, c) => blockSetAlt(deps, c, i)),
  );
  dispatcher.register(
    'block.shadow',
    on<BlockShadowInput>((i, c) => blockShadow(deps, c, i)),
  );
  dispatcher.register(
    'block.autofit',
    on<BlockAutofitInput>((i, c) => blockAutofit(deps, c, i)),
  );
  dispatcher.register(
    'text.style',
    on<TextStyleInput>((i, c) => textStyle(deps, c, i)),
  );
  dispatcher.register(
    'text.list',
    on<TextListInput>((i, c) => textList(deps, c, i)),
  );
  dispatcher.register(
    'text.spacing',
    on<TextSpacingInput>((i, c) => textSpacing(deps, c, i)),
  );
  dispatcher.register(
    'text.columns',
    on<TextColumnsInput>((i, c) => textColumns(deps, c, i)),
  );
  dispatcher.register(
    'text.indent',
    on<TextIndentInput>((i, c) => textIndent(deps, c, i)),
  );
  dispatcher.register(
    'text.case',
    on<TextCaseInput>((i, c) => textCase(deps, c, i)),
  );
  dispatcher.register(
    'text.insert',
    on<TextInsertInput>((i, c) => textInsert(deps, c, i)),
  );
  dispatcher.register(
    'chart.setData',
    on<ChartSetDataInput>((i, c) => chartSetData(deps, c, i)),
  );
  dispatcher.register(
    'chart.setKind',
    on<ChartSetKindInput>((i, c) => chartSetKind(deps, c, i)),
  );
  dispatcher.register(
    'table.merge',
    on<TableMergeInput>((i, c) => tableMerge(deps, c, i)),
  );
  dispatcher.register(
    'table.unmerge',
    on<TableUnmergeInput>((i, c) => tableUnmerge(deps, c, i)),
  );
  dispatcher.register(
    'table.insertRows',
    on<TableInsertRowsInput>((i, c) => tableInsertRows(deps, c, i)),
  );
  dispatcher.register(
    'table.insertColumns',
    on<TableInsertColumnsInput>((i, c) => tableInsertColumns(deps, c, i)),
  );
  dispatcher.register(
    'table.deleteRows',
    on<TableDeleteInput>((i, c) => tableDeleteRows(deps, c, i)),
  );
  dispatcher.register(
    'table.deleteColumns',
    on<TableDeleteInput>((i, c) => tableDeleteColumns(deps, c, i)),
  );
  dispatcher.register(
    'table.distribute',
    on<TableDistributeInput>((i, c) => tableDistribute(deps, c, i)),
  );
  dispatcher.register(
    'table.cellStyle',
    on<TableCellStyleInput>((i, c) => tableCellStyle(deps, c, i)),
  );
  dispatcher.register(
    'shape.set',
    on<ShapeSetInput>((i, c) => shapeSet(deps, c, i)),
  );
  dispatcher.register(
    'line.set',
    on<LineSetInput>((i, c) => lineSet(deps, c, i)),
  );
  dispatcher.register(
    'diagram.insert',
    on<DiagramInsertInput>((i, c) => diagramInsert(deps, c, i)),
  );
  // the Google Slides parity round three (SPEC-3 5.7, 10.5)
  dispatcher.register(
    'version.diff',
    on<VersionDiffInput>((i) => versionDiff(deps, i)),
  );
  dispatcher.register(
    'picture.dither',
    on<PictureDitherInput>((i, c) => pictureDither(deps, c, i)),
  );
  dispatcher.register(
    'picture.materialize',
    on<PictureMaterializeInput>((i, c) => pictureMaterialize(deps, c, i)),
  );
}
