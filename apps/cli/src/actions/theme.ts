// The theme lane's handlers (gslides-parity SPEC-5 9.4, 13; R03 4.8; MILESTONES-5 B6 day 5):
// theme.get, theme.set, theme.rename, theme.reset, theme.applyImported and the six layout
// actions on the checkout dispatcher, the hosted dispatcher and, through the editor's controller,
// the window transport. Every write is one `deck.set` mutation under `/themeEdits` or
// `/customLayouts` (the reducer's `DECK_SET_ROOTS`, SPEC-5 0.44: the `deck.set` action's own
// pointer regex stays closed to the records, so these handlers are the one write path), written
// at the shallowest missing ancestor of the pointer so the mutation is as fine as the record
// allows (a second edit of one colour is one `/themeEdits/colors/light/ink` write, which the
// operation stream merges field by field) and one Undo reverts it. The record is validated by
// `themeEditsSchema` and the `theme` and `layout` validator families before the commit, so a
// stored deck never carries a slot the renderer does not know. The module stays free of `node:`
// imports: the editor page imports this graph through store-actions.ts.
//
// Apply layout over a custom layout (SPEC-5 9.2) is `applyCustomLayout`, a pure function the
// integrator's `slide.applyLayout` calls for a `custom-` id (b6.md request R9): the slide's
// content is refiled into the layout's placeholder boxes (title, subtitle, body, image) and its
// free boxes stay where they are.
import type { ActionContext, Dispatcher } from '@turboslide/agent/dispatch';
import type { Block, BlockOf, PlaceholderKind } from '@turboslide/schema/blocks';
import { PLACEHOLDER_KINDS } from '@turboslide/schema/blocks';
import type {
  ContentSlide,
  CustomLayout,
  CustomLayoutId,
  Deck,
  DeckDocument,
  Slide,
  ThemeEdits,
  ThemeRecord,
} from '@turboslide/schema/deck';
import {
  IMPORTED_THEMES_MAX,
  customLayoutIdSchema,
  customLayoutSchema,
  isCustomLayoutId,
  sectionOfSlide,
  slideBlocks,
  themeEditsSchema,
} from '@turboslide/schema/deck';
import { ConflictError } from '@turboslide/schema/errors';
import { FONT_IDS } from '@turboslide/schema/fonts';
import type { FontId } from '@turboslide/schema/fonts';
import { slugify } from '@turboslide/schema/ids';
import type { LayoutId } from '@turboslide/schema/layouts';
import { LAYOUTS, isLayoutId, layoutEntry } from '@turboslide/schema/layouts';
import { applyLayout, extractContent } from '@turboslide/schema/apply-layout';
import type { Mutation } from '@turboslide/schema/mutations';
import { cloneJson, hasAt, setAt } from '@turboslide/schema/pointer';
import type { Position } from '@turboslide/schema/position';
import { contentBox, deckPage } from '@turboslide/schema/render';
import type { Page } from '@turboslide/schema/render';
import { validateLayouts } from '@turboslide/schema/validate/layout';
import { validateTheme } from '@turboslide/schema/validate/theme';

import type { LaneDeps } from './deps.ts';

type Rev = { baseRevision: number };

export type ThemeSetInput = Rev & { path: string; value?: unknown };
export type ThemeRenameInput = Rev & { name: string };
export type ThemeResetInput = Rev & { path?: string };
export type ThemeApplyImportedInput = Rev & { index: number };
export type LayoutCreateInput = Rev & { from?: LayoutId | CustomLayoutId; name: string };
export type LayoutDuplicateInput = Rev & { id: LayoutId | CustomLayoutId };
export type LayoutRenameInput = Rev & { id: CustomLayoutId; name: string };
export type LayoutDeleteInput = Rev & { id: LayoutId | CustomLayoutId; confirm: true };
export type LayoutSetPlaceholderInput = Rev & {
  layoutId: CustomLayoutId;
  blockId: string;
  placeholder: PlaceholderKind | null;
};

/** The store deps a theme handler reads: the store alone (`LaneDeps` carries more). */
export type ThemeLaneDeps = Pick<LaneDeps, 'store'>;

export type LayoutRow = {
  id: string;
  name: string;
  builtIn: boolean;
  hidden: boolean;
  placeholders: PlaceholderKind[];
};

/** Runs one Write and maps a refused outcome to the error classes of SPEC 7.1 (store-actions.ts `commit`). */
async function commitWrite(
  deps: ThemeLaneDeps,
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

// ---------------------------------------------------------------------------------------------
// The pointer write

/**
 * One `deck.set` for a value at a pointer under a record root: the mutation is written at the
 * shallowest ancestor the deck lacks (creating the record when it is absent) so the inverse the
 * reducer records removes exactly what the write made; an absent value removes the field. The
 * deck passed is read only; the caller applies the mutation to a clone to validate the result.
 */
export function recordWrite(deck: Deck, pointer: string, value: unknown): Mutation {
  if (value === undefined) return { op: 'deck.set', path: pointer };
  const segments = pointer.split('/').slice(1);
  for (let depth = 1; depth < segments.length; depth += 1) {
    const ancestor = `/${segments.slice(0, depth).join('/')}`;
    if (!hasAt(deck, ancestor)) {
      let built: unknown = cloneJson(value);
      for (let i = segments.length - 1; i >= depth; i -= 1) built = { [segments[i] ?? '']: built };
      return { op: 'deck.set', path: ancestor, value: built };
    }
  }
  return { op: 'deck.set', path: pointer, value: cloneJson(value) };
}

/** The deck after a `deck.set` of the record kind, on a clone (the validator reads the result). */
function previewDeck(deck: Deck, mutation: Mutation): Deck {
  const next = cloneJson(deck);
  if (mutation.op !== 'deck.set') return next;
  setAt(next, mutation.path, mutation.value === undefined ? undefined : cloneJson(mutation.value));
  return next;
}

function firstMessage(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>): string {
  const issue = issues[0];
  if (issue === undefined) return 'invalid';
  const at = issue.path.length === 0 ? '' : ` at /${issue.path.map(String).join('/')}`;
  return `${issue.message}${at}`;
}

/** The record after a write, refused as a TypeError when the schema or the theme validator says no. */
function checkThemeEdits(document: DeckDocument, deck: Deck): ThemeEdits | undefined {
  if (deck.themeEdits === undefined) return undefined;
  const parsed = themeEditsSchema.safeParse(deck.themeEdits);
  if (!parsed.success) throw new TypeError(`theme.set: ${firstMessage(parsed.error.issues)}`);
  const issues = validateTheme({ ...document, deck }).filter((issue) => issue.severity >= 2);
  if (issues.length > 0) throw new TypeError(`theme.set: ${issues[0]?.message ?? 'refused'}`);
  return parsed.data;
}

function checkLayouts(document: DeckDocument, deck: Deck): void {
  for (const [id, layout] of Object.entries(deck.customLayouts ?? {})) {
    const parsedId = customLayoutIdSchema.safeParse(id);
    if (!parsedId.success) throw new TypeError(`layout: "${id}" is not a custom layout id`);
    const parsed = customLayoutSchema.safeParse(layout);
    if (!parsed.success) throw new TypeError(`layout ${id}: ${firstMessage(parsed.error.issues)}`);
  }
  const issues = validateLayouts({ ...document, deck }).filter((issue) => issue.severity >= 2);
  if (issues.length > 0) throw new TypeError(`layout: ${issues[0]?.message ?? 'refused'}`);
}

// ---------------------------------------------------------------------------------------------
// theme.*

export function themeGet(document: DeckDocument): {
  theme: Deck['theme'];
  themeEdits?: ThemeEdits;
  importedThemes?: ThemeRecord[];
  customLayouts?: Record<string, CustomLayout>;
} {
  const { deck } = document;
  return {
    theme: deck.theme,
    ...(deck.themeEdits !== undefined ? { themeEdits: deck.themeEdits } : {}),
    ...(deck.importedThemes !== undefined ? { importedThemes: deck.importedThemes } : {}),
    ...(deck.customLayouts !== undefined ? { customLayouts: deck.customLayouts } : {}),
  };
}

export async function themeSet(
  deps: ThemeLaneDeps,
  ctx: ActionContext,
  input: ThemeSetInput,
): Promise<{ path: string; value?: unknown; themeEdits: ThemeEdits; revision: number }> {
  const { document } = await deps.store.read();
  const mutation = recordWrite(document.deck, `/themeEdits${input.path}`, input.value);
  const next = previewDeck(document.deck, mutation);
  const edits = checkThemeEdits(document, next) ?? {};
  const committed = await commitWrite(deps, ctx, input.baseRevision, [mutation]);
  return {
    path: input.path,
    ...(input.value !== undefined ? { value: input.value } : {}),
    themeEdits: committed.document.deck.themeEdits ?? edits,
    revision: committed.revision,
  };
}

export async function themeRename(
  deps: ThemeLaneDeps,
  ctx: ActionContext,
  input: ThemeRenameInput,
): Promise<{ name: string; revision: number }> {
  const answer = await themeSet(deps, ctx, {
    path: '/name',
    value: input.name,
    baseRevision: input.baseRevision,
  });
  return { name: input.name, revision: answer.revision };
}

export async function themeReset(
  deps: ThemeLaneDeps,
  ctx: ActionContext,
  input: ThemeResetInput,
): Promise<{ themeEdits?: ThemeEdits; revision: number }> {
  const { document } = await deps.store.read();
  const pointer =
    input.path === undefined || input.path === '' ? '/themeEdits' : `/themeEdits${input.path}`;
  if (!hasAt(document.deck, pointer)) {
    if (input.baseRevision !== document.deck.revision)
      throw new ConflictError(`the document is at revision ${document.deck.revision}`, {
        currentRevision: document.deck.revision,
        current: document,
      });
    return {
      ...(document.deck.themeEdits !== undefined ? { themeEdits: document.deck.themeEdits } : {}),
      revision: document.deck.revision,
    };
  }
  const committed = await commitWrite(deps, ctx, input.baseRevision, [
    { op: 'deck.set', path: pointer },
  ]);
  const edits = committed.document.deck.themeEdits;
  return { ...(edits !== undefined ? { themeEdits: edits } : {}), revision: committed.revision };
}

/** The catalog id of a face by the name PowerPoint and Google Slides use ("Open Sans" is `open-sans`); undefined when the catalog lacks it. */
export function fontIdOfName(name: string | undefined): FontId | undefined {
  if (name === undefined) return undefined;
  const slug = slugify(name);
  return (FONT_IDS as ReadonlyArray<string>).includes(slug) ? (slug as FontId) : undefined;
}

/**
 * An imported record's colours and faces as theme edits (SPEC-5 0.28, 5.3): the twelve colours
 * land in both appearances (an imported scheme is one scheme, as Google's is), a face the catalog
 * ships by name lands on its role, a face it does not ship leaves the theme's.
 */
export function editsFromRecord(record: ThemeRecord, current: ThemeEdits | undefined): ThemeEdits {
  const colors = { ...record.colors };
  const fonts: Partial<Record<'display' | 'text', FontId>> = {};
  const display = fontIdOfName(record.fonts.display);
  const text = fontIdOfName(record.fonts.text);
  if (display !== undefined) fonts.display = display;
  if (text !== undefined) fonts.text = text;
  return {
    ...(current ?? {}),
    name: record.name,
    colors: { light: colors, dark: { ...colors } },
    ...(Object.keys(fonts).length > 0 ? { fonts: { ...(current?.fonts ?? {}), ...fonts } } : {}),
  };
}

export async function themeApplyImported(
  deps: ThemeLaneDeps,
  ctx: ActionContext,
  input: ThemeApplyImportedInput,
): Promise<{ themeEdits: ThemeEdits; revision: number }> {
  const { document } = await deps.store.read();
  const records = document.deck.importedThemes ?? [];
  const record = records[input.index];
  if (record === undefined)
    throw new RangeError(
      records.length === 0
        ? 'This presentation holds no imported theme; Import theme adds one (at most five)'
        : `No imported theme at index ${input.index}; the presentation holds ${records.length} (0 to ${records.length - 1}, at most ${IMPORTED_THEMES_MAX})`,
    );
  const edits = editsFromRecord(record, document.deck.themeEdits);
  const mutation: Mutation = { op: 'deck.set', path: '/themeEdits', value: edits };
  checkThemeEdits(document, previewDeck(document.deck, mutation));
  const committed = await commitWrite(deps, ctx, input.baseRevision, [mutation]);
  return { themeEdits: committed.document.deck.themeEdits ?? edits, revision: committed.revision };
}

// ---------------------------------------------------------------------------------------------
// layout.*

/** The custom entry that hides a built in layout: `{ from: <id>, hidden: true }` under a `custom-` key (b6.md 1.3 item 5). */
function hiddenEntryOf(deck: Deck, id: LayoutId): [string, CustomLayout] | undefined {
  for (const [key, layout] of Object.entries(deck.customLayouts ?? {}))
    if (layout.hidden === true && layout.from === id) return [key, layout];
  return undefined;
}

/** The placeholder a block carries (`BlockBase.placeholder`; the material block declares none). */
export function placeholderOf(block: Block): PlaceholderKind | undefined {
  return (block as { placeholder?: PlaceholderKind }).placeholder;
}

/** The placeholders a custom layout's blocks carry, in block order, each kind once. */
export function placeholdersOf(layout: CustomLayout): PlaceholderKind[] {
  const out: PlaceholderKind[] = [];
  for (const block of layout.blocks ?? []) {
    const kind = placeholderOf(block);
    if (kind !== undefined && !out.includes(kind)) out.push(kind);
  }
  return out;
}

/** The label of a custom layout: its display name, else its name, else its id. */
export function layoutLabel(id: string, layout: CustomLayout): string {
  return layout.displayName ?? layout.name ?? id;
}

export function layoutList(document: DeckDocument): { layouts: LayoutRow[] } {
  const { deck } = document;
  const rows: LayoutRow[] = LAYOUTS.map((entry) => ({
    id: entry.id,
    name: entry.label,
    builtIn: true,
    hidden: hiddenEntryOf(deck, entry.id) !== undefined,
    placeholders: [],
  }));
  for (const [id, layout] of Object.entries(deck.customLayouts ?? {})) {
    if (layout.hidden === true) continue;
    rows.push({
      id,
      name: layoutLabel(id, layout),
      builtIn: false,
      hidden: false,
      placeholders: placeholdersOf(layout),
    });
  }
  return { layouts: rows };
}

/** A free `custom-<slug>` id from a name: `custom-quote`, then `custom-quote-2` and so on. */
export function freeCustomLayoutId(name: string, taken: ReadonlySet<string>): CustomLayoutId {
  const slug = slugify(name) || 'layout';
  const first = `custom-${slug}` as CustomLayoutId;
  if (!taken.has(first)) return first;
  for (let n = 2; ; n += 1) {
    const id = `custom-${slug}-${n}` as CustomLayoutId;
    if (!taken.has(id)) return id;
  }
}

/**
 * The placeholder a block of a layout made from a built in one stands for (R03 2.2: title,
 * subtitle, body and image are the kinds Google's Insert placeholder offers): the first heading
 * is the title, the first text after it on the Title slide layout the subtitle, every other text
 * or list the body, a picture object the image.
 */
export function inferPlaceholders(blocks: Block[], from: LayoutId | undefined): Block[] {
  let title = false;
  let subtitle = false;
  return blocks.map((block) => {
    if (placeholderOf(block) !== undefined) return block;
    let kind: PlaceholderKind | undefined;
    if (block.type === 'heading') {
      if (!title) {
        kind = 'title';
        title = true;
      } else kind = 'body';
    } else if (block.type === 'paragraph' || block.type === 'text') {
      if (from === 'title' && title && !subtitle) {
        kind = 'subtitle';
        subtitle = true;
      } else kind = 'body';
    } else if (block.type === 'plain' || block.type === 'rows' || block.type === 'refs')
      kind = 'body';
    else if (block.type === 'shot' || block.type === 'picture') kind = 'picture';
    return kind === undefined ? block : ({ ...block, placeholder: kind } as Block);
  });
}

/** The blocks a built in layout yields as a custom layout: its empty slide converted to a canvas, the placeholders inferred. */
export function blocksFromBuiltIn(deck: Deck, from: LayoutId): Block[] {
  const sectionId = deck.sections[0]?.id ?? 'main';
  const entry = layoutEntry(from);
  const made = entry.make('layout-source', deck, sectionId);
  if (made === null)
    throw new RangeError(
      `The ${entry.label} layout needs a picture and the deck has none of the starter roles (opener, mood); add a picture first`,
    );
  const page = deckPage(deck);
  const converted = applyLayout({ slide: made, layout: 'blank', deck, sectionId });
  const blocks = converted.slide.kind === 'content' ? (converted.slide.slots.main ?? []) : [];
  return inferPlaceholders(
    blocks.map((block) => {
      if (block.pos !== undefined) return block;
      const [x, y, w, h] = contentBox(page);
      return { ...block, pos: { x, y, w, h } } as Block;
    }),
    from,
  );
}

async function writeLayouts(
  deps: ThemeLaneDeps,
  ctx: ActionContext,
  document: DeckDocument,
  baseRevision: number,
  mutation: Mutation,
): Promise<{ document: DeckDocument; revision: number }> {
  checkLayouts(document, previewDeck(document.deck, mutation));
  return commitWrite(deps, ctx, baseRevision, [mutation]);
}

export async function layoutCreate(
  deps: ThemeLaneDeps,
  ctx: ActionContext,
  input: LayoutCreateInput,
): Promise<{ id: CustomLayoutId; layout: CustomLayout; revision: number }> {
  const { document } = await deps.store.read();
  const { deck } = document;
  const taken = new Set(Object.keys(deck.customLayouts ?? {}));
  const id = freeCustomLayoutId(input.name, taken);
  let blocks: Block[] = [];
  let from: LayoutId | undefined;
  if (input.from !== undefined) {
    if (isCustomLayoutId(input.from)) {
      const source = deck.customLayouts?.[input.from];
      if (source === undefined || source.hidden === true)
        throw new RangeError(`No custom layout "${input.from}"`);
      blocks = cloneJson(source.blocks ?? []);
      from = source.from;
    } else if (isLayoutId(input.from)) {
      from = input.from;
      blocks = blocksFromBuiltIn(deck, input.from);
    } else throw new RangeError(`No layout "${String(input.from)}"`);
  }
  const layout: CustomLayout = {
    name: input.name,
    displayName: input.name,
    ...(from !== undefined ? { from } : {}),
    blocks,
  };
  const mutation = recordWrite(deck, `/customLayouts/${id}`, layout);
  const committed = await writeLayouts(deps, ctx, document, input.baseRevision, mutation);
  return { id, layout, revision: committed.revision };
}

export async function layoutDuplicate(
  deps: ThemeLaneDeps,
  ctx: ActionContext,
  input: LayoutDuplicateInput,
): Promise<{ id: CustomLayoutId; layout: CustomLayout; revision: number }> {
  const { document } = await deps.store.read();
  const { deck } = document;
  let name: string;
  let from: LayoutId | CustomLayoutId;
  if (isCustomLayoutId(input.id)) {
    const source = deck.customLayouts?.[input.id];
    if (source === undefined || source.hidden === true)
      throw new RangeError(`No custom layout "${input.id}"`);
    name = `${layoutLabel(input.id, source)} copy`;
    from = input.id;
  } else if (isLayoutId(input.id)) {
    name = `${layoutEntry(input.id).label} copy`;
    from = input.id;
  } else throw new RangeError(`No layout "${String(input.id)}"`);
  return layoutCreate(deps, ctx, { from, name, baseRevision: input.baseRevision });
}

export async function layoutRename(
  deps: ThemeLaneDeps,
  ctx: ActionContext,
  input: LayoutRenameInput,
): Promise<{ id: CustomLayoutId; name: string; revision: number }> {
  const { document } = await deps.store.read();
  const source = document.deck.customLayouts?.[input.id];
  if (source === undefined || source.hidden === true)
    throw new RangeError(`No custom layout "${input.id}"`);
  const mutation = recordWrite(document.deck, `/customLayouts/${input.id}/displayName`, input.name);
  const committed = await writeLayouts(deps, ctx, document, input.baseRevision, mutation);
  return { id: input.id, name: input.name, revision: committed.revision };
}

export async function layoutDelete(
  deps: ThemeLaneDeps,
  ctx: ActionContext,
  input: LayoutDeleteInput,
): Promise<{ id: string; hidden: boolean; revision: number }> {
  const { document } = await deps.store.read();
  const { deck } = document;
  if (isCustomLayoutId(input.id)) {
    const source = deck.customLayouts?.[input.id];
    if (source === undefined) throw new RangeError(`No custom layout "${input.id}"`);
    // a slide on the layout keeps its blocks and loses the template reading
    const slides = Object.values(document.slides).filter((slide) => slide.template === input.id);
    const removal: Mutation = { op: 'deck.set', path: `/customLayouts/${input.id}` };
    const mutations: Mutation[] = [removal];
    for (const slide of slides)
      mutations.push({ op: 'slide.set', slideId: slide.id, path: '/template' });
    const preview = previewDeck(deck, removal);
    checkLayouts({ ...document, slides: withoutTemplate(document.slides, slides) }, preview);
    const committed = await commitWrite(deps, ctx, input.baseRevision, mutations);
    return { id: input.id, hidden: false, revision: committed.revision };
  }
  if (!isLayoutId(input.id)) throw new RangeError(`No layout "${String(input.id)}"`);
  if (hiddenEntryOf(deck, input.id) !== undefined) {
    if (input.baseRevision !== deck.revision)
      throw new ConflictError(`the document is at revision ${deck.revision}`, {
        currentRevision: deck.revision,
        current: document,
      });
    return { id: input.id, hidden: true, revision: deck.revision };
  }
  const key = freeCustomLayoutId(
    `hidden-${input.id}`,
    new Set(Object.keys(deck.customLayouts ?? {})),
  );
  const mutation = recordWrite(deck, `/customLayouts/${key}`, { from: input.id, hidden: true });
  const committed = await writeLayouts(deps, ctx, document, input.baseRevision, mutation);
  return { id: input.id, hidden: true, revision: committed.revision };
}

function withoutTemplate(
  slides: DeckDocument['slides'],
  changed: ReadonlyArray<Slide>,
): DeckDocument['slides'] {
  const ids = new Set(changed.map((slide) => slide.id));
  const out: DeckDocument['slides'] = {};
  for (const [id, slide] of Object.entries(slides)) {
    if (!ids.has(id)) {
      out[id] = slide;
      continue;
    }
    const { template: _template, ...rest } = slide;
    out[id] = rest as Slide;
  }
  return out;
}

export async function layoutSetPlaceholder(
  deps: ThemeLaneDeps,
  ctx: ActionContext,
  input: LayoutSetPlaceholderInput,
): Promise<{ layout: CustomLayout; revision: number }> {
  const { document } = await deps.store.read();
  const source = document.deck.customLayouts?.[input.layoutId];
  if (source === undefined || source.hidden === true)
    throw new RangeError(`No custom layout "${input.layoutId}"`);
  const index = (source.blocks ?? []).findIndex((block) => block.id === input.blockId);
  if (index === -1)
    throw new RangeError(`No block "${input.blockId}" on layout "${input.layoutId}"`);
  if (input.placeholder !== null && !PLACEHOLDER_KINDS.includes(input.placeholder))
    throw new TypeError(`"${String(input.placeholder)}" is not a placeholder kind`);
  const pointer = `/customLayouts/${input.layoutId}/blocks/${index}/placeholder`;
  const mutation = recordWrite(
    document.deck,
    pointer,
    input.placeholder === null ? undefined : input.placeholder,
  );
  if (input.placeholder === null && !hasAt(document.deck, pointer)) {
    if (input.baseRevision !== document.deck.revision)
      throw new ConflictError(`the document is at revision ${document.deck.revision}`, {
        currentRevision: document.deck.revision,
        current: document,
      });
    return { layout: source, revision: document.deck.revision };
  }
  const committed = await writeLayouts(deps, ctx, document, input.baseRevision, mutation);
  const layout = committed.document.deck.customLayouts?.[input.layoutId];
  if (layout === undefined)
    throw new RangeError(`No custom layout "${input.layoutId}" after the write`);
  return { layout, revision: committed.revision };
}

// ---------------------------------------------------------------------------------------------
// Apply layout over a custom layout (SPEC-5 9.2; R03 4.1)

export type ApplyCustomLayoutResult = { slide: Slide; dropped: string[] };

function keptFields(slide: Slide, layout: CustomLayoutId) {
  return {
    ...(slide.title !== undefined ? { title: slide.title } : {}),
    ...(slide.notes !== undefined ? { notes: slide.notes } : {}),
    ...(slide.tags !== undefined ? { tags: slide.tags } : {}),
    ...(slide.skip !== undefined ? { skip: slide.skip } : {}),
    ...(slide.background !== undefined ? { background: slide.background } : {}),
    ...(slide.ext !== undefined ? { ext: slide.ext } : {}),
    template: layout,
  };
}

function withFreeId<T extends Block>(block: T, taken: Set<string>): T {
  let id = block.id;
  let n = 2;
  while (taken.has(id)) id = `${block.id}-${n++}`;
  taken.add(id);
  return id === block.id ? block : { ...block, id };
}

function boxOf(block: Block, fallback: Position): Position {
  const pos = block.pos ?? fallback;
  return { x: pos.x, y: pos.y, w: pos.w, h: pos.h };
}

/**
 * Apply layout on a custom layout: the slide's title, subtitle, body texts and first picture move
 * into the layout's placeholder boxes (a body box holding every remaining text and list, split
 * evenly), the layout's own decorations (blocks without a placeholder) are copied, and the slide's
 * free boxes stay where they are; a slide that is not a canvas becomes one first. Pure: the result
 * is the slide to write with one slide.replace.
 */
export function applyCustomLayout(
  slide: Slide,
  layoutId: CustomLayoutId,
  layout: CustomLayout,
  page: Page,
): ApplyCustomLayoutResult {
  const source = cloneJson(slide);
  const extracted = extractContent(source);
  const kept = keptFields(source, layoutId);
  const [cx, cy, cw, ch] = contentBox(page);
  const contentPos: Position = { x: cx, y: cy, w: cw, h: ch };
  const taken = new Set<string>();
  const main: Block[] = [];
  const consumed = new Set<string>();
  let z = 0;
  const place = (block: Block, pos: Position): void => {
    main.push(withFreeId({ ...block, pos: { ...pos, z: z++ } } as Block, taken));
  };

  const bodyTexts = [...extracted.body];
  const layoutBlocks = layout.blocks ?? [];
  const bodyBoxes = layoutBlocks.filter((block) => placeholderOf(block) === 'body');
  const bodyContent: Block[] = [];
  for (const block of layoutBlocks) {
    const box = boxOf(block, contentPos);
    switch (placeholderOf(block)) {
      case 'title': {
        const text = extracted.title ?? '';
        if (extracted.titleFrom !== undefined) consumed.add(extracted.titleFrom);
        const heading: BlockOf<'heading'> =
          block.type === 'heading'
            ? { ...block, text }
            : { id: block.id, type: 'heading', level: 'h2', text };
        place(heading, box);
        break;
      }
      case 'subtitle': {
        const next = bodyTexts.shift();
        if (next !== undefined) consumed.add(next.from);
        const text = next?.text ?? '';
        const body: Block =
          block.type === 'text' || block.type === 'paragraph'
            ? ({ ...block, text } as Block)
            : { id: block.id, type: 'paragraph', text };
        place(body, box);
        break;
      }
      case 'body':
        break;
      case 'picture': {
        const picture = extracted.pictures[0];
        if (picture !== undefined) {
          consumed.add(picture.from);
          place({ id: block.id, type: 'shot', asset: picture.asset, fit: 'width' } as Block, box);
        } else place(block, box);
        break;
      }
      case 'slideNumber':
        // the counter is the stage's; the placeholder box marks where the theme draws it
        place(block, box);
        break;
      default:
        place(block, box);
    }
  }
  // the body boxes take every remaining text and list in reading order, split evenly
  for (const row of bodyTexts) {
    consumed.add(row.from);
    bodyContent.push({ id: row.from, type: 'paragraph', text: row.text } as Block);
  }
  for (const list of extracted.lists) {
    consumed.add(list.id);
    bodyContent.push(list);
  }
  if (bodyBoxes.length > 0) {
    const perBox = Math.max(1, Math.ceil(bodyContent.length / bodyBoxes.length));
    bodyBoxes.forEach((box, boxIndex) => {
      const target = boxOf(box, contentPos);
      const rows = bodyContent.slice(boxIndex * perBox, (boxIndex + 1) * perBox);
      if (rows.length === 0) {
        place(box, target);
        return;
      }
      const rowHeight = target.h / rows.length;
      rows.forEach((row, i) => {
        const shaped: Block =
          box.type === 'text' && row.type === 'paragraph'
            ? ({ ...box, id: row.id, text: (row as BlockOf<'paragraph'>).text } as Block)
            : row;
        place(shaped, {
          x: target.x,
          y: Math.round(target.y + i * rowHeight),
          w: target.w,
          h: Math.round(rowHeight),
        });
      });
    });
  } else {
    // no body placeholder: the remaining texts keep their boxes or stack in the content box
    bodyContent.forEach((row, i) => {
      const own = slideBlocks(source).find(({ block }) => block.id === row.id)?.block.pos;
      place(
        row,
        own ?? {
          x: cx,
          y: cy + i * 56,
          w: cw,
          h: 48,
        },
      );
    });
  }
  // the source's free objects stay where they are; grammar blocks without a box stack under the content
  const dropped: string[] = [];
  let stackY = cy;
  for (const { block } of slideBlocks(source)) {
    if (consumed.has(block.id)) continue;
    if (block.type === 'heading' && extracted.titleFrom === block.id) continue;
    if (
      extracted.tables.some((table) => table.id === block.id) ||
      extracted.rest.some((rest) => rest.id === block.id)
    ) {
      if (block.pos !== undefined) place(block, boxOf(block, contentPos));
      else {
        place(block, { x: cx, y: stackY, w: cw, h: 120 });
        stackY += 128;
      }
      continue;
    }
    if (block.pos !== undefined) place(block, boxOf(block, contentPos));
    else dropped.push(block.id);
  }
  const next: ContentSlide = {
    schemaVersion: 1,
    id: source.id,
    kind: 'content',
    layout: { type: 'freeform' },
    slots: { main },
    ...kept,
  };
  return { slide: next, dropped };
}

/** The layout a custom id names, refused when the deck lacks it or hides it. */
export function requireCustomLayout(deck: Deck, id: CustomLayoutId): CustomLayout {
  const layout = deck.customLayouts?.[id];
  if (layout === undefined || layout.hidden === true)
    throw new RangeError(`No custom layout "${id}"`);
  return layout;
}

/**
 * `slide.applyLayout` for a custom id (the integrator's handler calls it, b6.md request R9): one
 * slide.replace per slide, one commit, the same answer shape as the built in path.
 */
export async function slideApplyCustomLayout(
  deps: ThemeLaneDeps,
  ctx: ActionContext,
  input: Rev & { slideIds: string[]; layout: CustomLayoutId },
): Promise<{
  slides: Slide[];
  dropped: { slideId: string; blockIds: string[] }[];
  revision: number;
}> {
  const { document } = await deps.store.read();
  const layout = requireCustomLayout(document.deck, input.layout);
  const page = deckPage(document.deck);
  const mutations: Mutation[] = [];
  const dropped: { slideId: string; blockIds: string[] }[] = [];
  for (const slideId of input.slideIds) {
    const slide = document.slides[slideId];
    if (slide === undefined) throw new RangeError(`No slide "${slideId}"`);
    if (sectionOfSlide(document.deck, slideId) === undefined)
      throw new RangeError(`Slide "${slideId}" is in no section`);
    const result = applyCustomLayout(slide, input.layout, layout, page);
    if (result.dropped.length > 0) dropped.push({ slideId, blockIds: result.dropped });
    mutations.push({ op: 'slide.replace', slideId, slide: result.slide });
  }
  const committed = await commitWrite(deps, ctx, input.baseRevision, mutations);
  return {
    slides: input.slideIds.map((id) => {
      const slide = committed.document.slides[id];
      if (slide === undefined) throw new RangeError(`No slide "${id}" after the write`);
      return slide;
    }),
    dropped,
    revision: committed.revision,
  };
}

/** The handlers this lane registers on a dispatcher. */
export function registerThemeActions(dispatcher: Dispatcher, deps: LaneDeps): void {
  dispatcher.register('theme.get', async () => themeGet((await deps.store.read()).document));
  dispatcher.register('theme.set', (input, ctx) => themeSet(deps, ctx, input as ThemeSetInput));
  dispatcher.register('theme.rename', (input, ctx) =>
    themeRename(deps, ctx, input as ThemeRenameInput),
  );
  dispatcher.register('theme.reset', (input, ctx) =>
    themeReset(deps, ctx, input as ThemeResetInput),
  );
  dispatcher.register('theme.applyImported', (input, ctx) =>
    themeApplyImported(deps, ctx, input as ThemeApplyImportedInput),
  );
  dispatcher.register('layout.list', async () => layoutList((await deps.store.read()).document));
  dispatcher.register('layout.create', (input, ctx) =>
    layoutCreate(deps, ctx, input as LayoutCreateInput),
  );
  dispatcher.register('layout.duplicate', (input, ctx) =>
    layoutDuplicate(deps, ctx, input as LayoutDuplicateInput),
  );
  dispatcher.register('layout.rename', (input, ctx) =>
    layoutRename(deps, ctx, input as LayoutRenameInput),
  );
  dispatcher.register('layout.delete', (input, ctx) =>
    layoutDelete(deps, ctx, input as LayoutDeleteInput),
  );
  dispatcher.register('layout.setPlaceholder', (input, ctx) =>
    layoutSetPlaceholder(deps, ctx, input as LayoutSetPlaceholderInput),
  );
}
