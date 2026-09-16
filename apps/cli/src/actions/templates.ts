// The templates lane's handlers (gslides-parity SPEC-5 4.3 to 4.6; MILESTONES-5 B3 day 7):
// `template.list`, `template.slides`, `buildingBlock.list` and `buildingBlock.insert`. Landed
// empty by the integrator on day 0 as the seam of SPEC-5 1.6; B3 fills the registrations here and
// keeps the module free of `node:` imports (the editor page imports this graph through
// store-actions.ts). The index, the template folders and the building block files are read
// through `LaneDeps.imports` (`@turboslide/import/lane`; b3.md request B3-7); `deck.create --from
// <index id>` and `slide.import --template` stay the integrator's registrations over the store's
// widened `createDeck` and the bridge's `slideImportSourceFor` (B3-10, B3-11).
//
// `buildingBlock.insert` lands a record's positioned blocks as one group in one write (SPEC-5
// 4.5): a slide that is not a canvas converts first (`withCanvas`), the blocks are placed by the
// schema's `placeBuildingBlock` at the content box or the point given and scaled with the page,
// their ids freed against the slide's, one fresh group tag on every member, the z values above
// every object, then one `block.insert` per block into `main` and one commit.
import type { ActionContext, Dispatcher } from '@turboslide/agent/dispatch';
import type { ImportLaneDeps } from '@turboslide/import/lane';
import { importBridgeSentence } from '@turboslide/import/lane';
import { ACTIONS } from '@turboslide/schema/actions';
import type { Block } from '@turboslide/schema/blocks';
import type {
  BuildingBlock,
  BuildingBlockCategory,
  TemplateIndexEntry,
} from '@turboslide/schema/building-blocks';
import { placeBuildingBlock } from '@turboslide/schema/building-blocks';
import type { DeckDocument, Slide } from '@turboslide/schema/deck';
import { canvasObjects, slideBlocks } from '@turboslide/schema/deck';
import type { Mutation } from '@turboslide/schema/mutations';
import { deckPage } from '@turboslide/schema/render';

import { commit, findingsFor, withCanvas } from '../store-actions.ts';
import type { SlideResult, WriteContext } from '../store-actions.ts';
import type { LaneDeps } from './deps.ts';

export type TemplatesActionDeps = LaneDeps & { imports?: ImportLaneDeps };

export type TemplateSlidesInput = { id: string };
export type BuildingBlockListInput = { category?: BuildingBlockCategory };
export type BuildingBlockInsertInput = {
  slideId: string;
  id: string;
  at?: [number, number];
  baseRevision: number;
};
export type BuildingBlockInsertResult = SlideResult & { blockIds: string[]; group: string };

function bridgeOf(deps: TemplatesActionDeps, id: string): ImportLaneDeps {
  if (deps.imports === undefined) throw new TypeError(importBridgeSentence(id));
  return deps.imports;
}

function requireSlide(document: DeckDocument, slideId: string): Slide {
  const slide = document.slides[slideId];
  if (slide === undefined) throw new RangeError(`No slide "${slideId}"`);
  return slide;
}

/** `template.list`: the index rows. */
export function templateList(deps: TemplatesActionDeps): { templates: TemplateIndexEntry[] } {
  return { templates: bridgeOf(deps, 'template.list').templates.list() };
}

/** `template.slides`: one template's slides with their titles and kinds. */
export function templateSlides(
  deps: TemplatesActionDeps,
  input: TemplateSlidesInput,
): { id: string; slides: ReturnType<ImportLaneDeps['templates']['slides']> } {
  const bridge = bridgeOf(deps, 'template.slides');
  if (
    !bridge.templates.list().some((row) => row.id === input.id) &&
    input.id !== 'blank' &&
    input.id !== 'gt-brand'
  )
    throw new RangeError(`No template "${input.id}" in the index`);
  return { id: input.id, slides: bridge.templates.slides(input.id) };
}

/**
 * `buildingBlock.list`: the records of one category or all. The full records (with `blocks`) are
 * answered when the action's output admits them (b3.md request B3-14), so the pane can draw a
 * thumbnail; the summaries alone until it does.
 */
export function buildingBlockList(
  deps: TemplatesActionDeps,
  input: BuildingBlockListInput,
): { blocks: (BuildingBlock | Omit<BuildingBlock, 'blocks'>)[] } {
  const records = bridgeOf(deps, 'buildingBlock.list').buildingBlocks.list(input.category);
  const full = { blocks: records };
  if (ACTIONS['buildingBlock.list'].output.safeParse(full).success) return full;
  return { blocks: records.map(({ blocks: _blocks, ...summary }) => summary) };
}

/** `buildingBlock.insert`: the record's blocks as one group on the slide, in one write. */
export async function buildingBlockInsert(
  deps: TemplatesActionDeps,
  ctx: WriteContext,
  input: BuildingBlockInsertInput,
): Promise<BuildingBlockInsertResult> {
  const record = bridgeOf(deps, 'buildingBlock.insert').buildingBlocks.read(input.id);
  const current = (await deps.store.read()).document;
  const canvas = await withCanvas(deps, current, requireSlide(current, input.slideId));
  const slide = canvas.slide;
  const placed = slideBlocks(slide).map(({ block }) => block);
  const takenIds = new Set(placed.map((block) => block.id));
  const takenGroups = new Set(
    placed.flatMap((block) =>
      block.pos?.group !== undefined ? [block.pos.group.split('/')[0] ?? block.pos.group] : [],
    ),
  );
  const maxZ = Math.max(-1, ...canvasObjects(slide).map((block) => block.pos?.z ?? 0));
  const { blocks, group } = placeBuildingBlock(record, {
    page: deckPage(current.deck),
    ...(input.at !== undefined ? { at: input.at } : {}),
    takenIds,
    takenGroups,
    z: maxZ + 1,
  });
  const mutations: Mutation[] = [...canvas.prefix];
  let after: string | undefined;
  for (const block of blocks as Block[]) {
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
    slide: requireSlide(committed.document, input.slideId),
    revision: committed.revision,
    findings: findingsFor(deps, committed.document, input.slideId),
    blockIds: blocks.map((block) => block.id),
    group,
  };
}

/** The handlers this lane registers on a dispatcher. */
export function registerTemplatesActions(dispatcher: Dispatcher, deps: LaneDeps): void {
  const lane = deps as TemplatesActionDeps;
  dispatcher.register('template.list', () => templateList(lane));
  dispatcher.register('template.slides', (input) =>
    templateSlides(lane, input as TemplateSlidesInput),
  );
  dispatcher.register('buildingBlock.list', (input) =>
    buildingBlockList(lane, (input ?? {}) as BuildingBlockListInput),
  );
  dispatcher.register('buildingBlock.insert', (input, ctx: ActionContext) =>
    buildingBlockInsert(lane, ctx, input as BuildingBlockInsertInput),
  );
}
