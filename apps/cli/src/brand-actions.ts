// The brand kit's handlers (docs/PRODUCT.md 4.1; B5a): brand.get, brand.set and brand.reset over a
// deck store, and font.list, on every transport through one dispatcher registration
// (`registerBrandActions`), the way registerStoreActions registers the store actions. Every write
// is one `deck.set` mutation under `/brand` (the reducer's DECK_SET_ROOTS gains the root; the
// `deck.set` action's own pointer regex stays closed to it, so these handlers are the one write
// path), written at the shallowest missing ancestor of the pointer so one Undo reverts exactly
// the field (schema brand.ts brandWriteMutation), and the record is validated by brandKitSchema
// before the commit, so a stored deck never carries a slot the renderer does not know. The page's
// window transport runs the same plans through its own commit (`brandSetPlan`, `brandResetPlan`),
// so the three transports and the editor agree on the mutation and the history label. This
// module stays free of `node:` imports: the editor page imports this graph.
import type { ActionContext, Dispatcher } from '@turboslide/agent/dispatch';
import type { BrandKit, BrandMutation } from '@turboslide/schema/brand';
import {
  brandAfter,
  brandResetMutations,
  brandWriteLabel,
  brandWriteMutation,
  checkBrandKit,
} from '@turboslide/schema/brand';
import type { Deck, DeckDocument } from '@turboslide/schema/deck';
import { catalogSummary } from '@turboslide/fonts/summary';

import { commit } from './store-actions.ts';
import type { StoreActionDeps, WriteContext } from './store-actions.ts';

type Rev = { baseRevision: number };
export type BrandSetInput = Rev & { path: string; value?: unknown };
export type BrandResetInput = Rev & { path?: string };

export type BrandGetResult = { brand: BrandKit; own: boolean; revision: number };
export type BrandSetResult = { path: string; value?: unknown; brand: BrandKit; revision: number };
export type BrandResetResult = { brand: BrandKit; revision: number; changed: boolean };

/** The plan of one write: the mutation, the history label and the record it leaves. */
export type BrandPlan = { mutations: BrandMutation[]; label: string; brand: BrandKit };

/** What brand.get answers for a manifest. */
export function brandGet(deck: Pick<Deck, 'brand' | 'revision'>): BrandGetResult {
  return { brand: deck.brand ?? {}, own: deck.brand !== undefined, revision: deck.revision };
}

/**
 * The plan of brand.set: the pointer write and the record it leaves, refused as a TypeError (400)
 * when the pointer is outside the kit or the record after the write does not validate.
 */
export function brandSetPlan(deck: Pick<Deck, 'brand'>, input: BrandSetInput): BrandPlan {
  const mutation = brandWriteMutation(deck, input.path, input.value);
  const after = brandAfter(deck, mutation);
  const checked = checkBrandKit(after ?? {});
  if ('refused' in checked) throw new TypeError(`brand.set: ${checked.refused}`);
  return { mutations: [mutation], label: brandWriteLabel(input.path), brand: checked.kit };
}

/** The plan of brand.reset: the record or one field removed; no mutation when there is nothing to remove. */
export function brandResetPlan(
  deck: Pick<Deck, 'brand'>,
  input: BrandResetInput,
  defaultKitName?: string,
): BrandPlan {
  const mutations = brandResetMutations(deck, input.path);
  const label =
    input.path === undefined || input.path === '' || input.path === '/'
      ? `Reset to ${defaultKitName ?? 'the default kit'}`
      : `${brandWriteLabel(input.path)} reset`;
  const after =
    mutations.length === 0 ? deck.brand : brandAfter(deck, mutations[0] as BrandMutation);
  return { mutations, label, brand: after ?? {} };
}

export async function brandSet(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: BrandSetInput,
): Promise<BrandSetResult> {
  const { document } = await deps.store.read();
  const plan = brandSetPlan(document.deck, input);
  const committed = await commit(
    deps,
    { ...ctx, note: ctx.note ?? plan.label },
    input.baseRevision,
    plan.mutations,
  );
  return {
    path: input.path,
    ...(input.value !== undefined ? { value: input.value } : {}),
    brand: committed.document.deck.brand ?? {},
    revision: committed.revision,
  };
}

export async function brandReset(
  deps: StoreActionDeps,
  ctx: WriteContext,
  input: BrandResetInput,
): Promise<BrandResetResult> {
  const { document } = await deps.store.read();
  const plan = brandResetPlan(document.deck, input);
  if (plan.mutations.length === 0)
    return { brand: document.deck.brand ?? {}, revision: document.deck.revision, changed: false };
  const committed = await commit(
    deps,
    { ...ctx, note: ctx.note ?? plan.label },
    input.baseRevision,
    plan.mutations,
  );
  return {
    brand: committed.document.deck.brand ?? {},
    revision: committed.revision,
    changed: true,
  };
}

/** The one implementation of font.list: the catalog summary in the action's output shape. */
export function fontList(): ReturnType<typeof catalogSummary> {
  return catalogSummary();
}

/** The handlers this lane registers on a dispatcher: brand.get, brand.set, brand.reset and font.list. */
export function registerBrandActions(dispatcher: Dispatcher, deps: StoreActionDeps): void {
  dispatcher.register('brand.get', async () => brandGet((await deps.store.read()).document.deck));
  dispatcher.register('brand.set', (input, ctx: ActionContext) =>
    brandSet(deps, ctx, input as BrandSetInput),
  );
  dispatcher.register('brand.reset', (input, ctx: ActionContext) =>
    brandReset(deps, ctx, input as BrandResetInput),
  );
  dispatcher.register('font.list', () => fontList());
}

/** For a caller that holds the document already (the page): the same three answers over a value. */
export function brandOf(document: DeckDocument): BrandGetResult {
  return brandGet(document.deck);
}
