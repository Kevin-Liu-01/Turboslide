// The page lane's handlers (gslides-parity SPEC-5 6.1; MILESTONES-5 B4 "Owns", item 2):
// `deck.setPageSize` over `pageFromInput`, `scaleCanvas` and `scaleGuides` of the schema, and
// `pageInfo`, the page fields of `deck.info` (the two readers, apps/cli/src/commands/mcp.ts and
// packages/agent/src/http/readers.ts, spread it into their answer). The module stays free of
// `node:` imports: the editor page reaches it through store-actions.ts and the controller's
// window slot (`GS5_WINDOW_SLOTS.B4`), so one write path serves the CLI, the MCP server, the HTTP
// surface, the hosted dispatcher and the window transport.
//
// The write (R08 3d, 3h): one commit holding a `deck.set /page` mutation, then one `slide.replace`
// per canvas slide whose objects `fit` or `maximize` scaled, then `deck.set /guides` when the
// guides moved or fell off the page, so one undo restores the page, the objects and the guides
// together. Under `keep` (Google's behaviour, the dialog's default) every `pos` stays and only the
// guides beyond the new edge go; `freeform/off-sheet` names what fell off the sheet afterwards.
import type { ActionContext, Dispatcher } from '@turboslide/agent/dispatch';
import type { DeckDocument } from '@turboslide/schema/deck';
import { slideOrder } from '@turboslide/schema/deck';
import type { Page } from '@turboslide/schema/render';
import { deckPage, pageFromInput } from '@turboslide/schema/render';
import type { PageInput } from '@turboslide/schema/render';
import { scaleCanvas, scaleGuides } from '@turboslide/schema/canvas';
import type { ScaleCanvasMode } from '@turboslide/schema/canvas';
import { ConflictError } from '@turboslide/schema/errors';
import type { Mutation } from '@turboslide/schema/mutations';
import { jsonEqual } from '@turboslide/schema/pointer';

import { commit } from '../store-actions.ts';
import type { StoreActionDeps, WriteContext } from '../store-actions.ts';
import type { LaneDeps } from './deps.ts';

export type DeckSetPageSizeInput = PageInput & {
  objects?: ScaleCanvasMode;
  baseRevision: number;
};

export type DeckSetPageSizeResult = {
  page: Page;
  previous: Page;
  guidesDropped: number;
  objectsScaled: number;
  slidesTouched: number;
  revision: number;
};

/**
 * The mutations of a page change, pure over the document: the page, one `slide.replace` per
 * canvas slide the mode scaled, and the guides when they changed. The handler commits them as one
 * write; the editor's controller can run the same list through its own commit.
 */
export function pageSizeMutations(
  document: DeckDocument,
  next: Page,
  mode: ScaleCanvasMode,
): { mutations: Mutation[]; objectsScaled: number; slidesTouched: number; guidesDropped: number } {
  const previous = deckPage(document.deck);
  const mutations: Mutation[] = [{ op: 'deck.set', path: '/page', value: next }];
  let objectsScaled = 0;
  let slidesTouched = 0;
  for (const slideId of slideOrder(document.deck)) {
    const slide = document.slides[slideId];
    if (slide === undefined) continue;
    const scaled = scaleCanvas(slide, previous, next, mode);
    if (scaled.objectsScaled === 0) continue;
    objectsScaled += scaled.objectsScaled;
    slidesTouched += 1;
    mutations.push({ op: 'slide.replace', slideId, slide: scaled.slide });
  }
  const guides = scaleGuides(document.deck.guides, previous, next, mode);
  if (!jsonEqual(guides.guides ?? null, document.deck.guides ?? null))
    mutations.push({
      op: 'deck.set',
      path: '/guides',
      ...(guides.guides !== undefined ? { value: guides.guides } : {}),
    });
  return { mutations, objectsScaled, slidesTouched, guidesDropped: guides.dropped };
}

/** deck.setPageSize as a function from its input to its output over the store (SPEC-5 6.1). */
export async function deckSetPageSize(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: DeckSetPageSizeInput,
): Promise<DeckSetPageSizeResult> {
  const current = (await deps.store.read()).document;
  const previous = deckPage(current.deck);
  const next = pageFromInput(input);
  const mode: ScaleCanvasMode = input.objects ?? 'keep';
  const samePage =
    previous.width === next.width &&
    previous.height === next.height &&
    (previous.preset ?? next.preset) === next.preset;
  if (samePage) {
    if (input.baseRevision !== current.deck.revision)
      throw new ConflictError(
        `baseRevision ${input.baseRevision} is behind the document, which is at revision ${current.deck.revision}`,
        { currentRevision: current.deck.revision, current },
      );
    return {
      page: { ...previous, preset: previous.preset ?? next.preset },
      previous,
      guidesDropped: 0,
      objectsScaled: 0,
      slidesTouched: 0,
      revision: current.deck.revision,
    };
  }
  const plan = pageSizeMutations(current, next, mode);
  const committed = await commit(deps, ctx, input.baseRevision, plan.mutations);
  return {
    page: deckPage(committed.document.deck),
    previous,
    guidesDropped: plan.guidesDropped,
    objectsScaled: plan.objectsScaled,
    slidesTouched: plan.slidesTouched,
    revision: committed.revision,
  };
}

/** The handlers this lane registers on a dispatcher: deck.setPageSize (SPEC-5 13). */
export function registerPageActions(dispatcher: Dispatcher, deps: LaneDeps): void {
  dispatcher.register('deck.setPageSize', (input, context: ActionContext) =>
    deckSetPageSize(deps, context, input as DeckSetPageSizeInput),
  );
}
