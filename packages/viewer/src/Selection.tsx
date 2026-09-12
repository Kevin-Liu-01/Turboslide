// The selection model of the stage in edit mode (SPEC 6.4): a block, or one text run of a block,
// or nothing. Selection is by click on the innermost `[data-block]`; Tab and Shift Tab walk the
// blocks in document order; Escape steps back from a run to its block and from a block to nothing.
// The ring itself is drawn by the chrome's Overlay from the boxes the Editor measures (SPEC 2.2:
// the overlay layer draws --pt-ink as a state, the block draws nothing), so this module holds the
// model and the DOM resolution only, and its pure parts are pinned by selection.test.ts.
import type { Block } from '@turboslide/schema/blocks';
import type { Slide } from '@turboslide/schema/deck';
import { slideBlocks } from '@turboslide/schema/deck';

export type Selection =
  | null
  | { kind: 'block'; blockId: string }
  | {
      kind: 'run';
      blockId: string;
      /** the run's pointer inside the block without the leading slash, as data-run writes it: `items/0/key` */
      pointer: string;
    };

/** The block a selection names, or null. */
export function selectedBlockId(selection: Selection): string | null {
  return selection === null ? null : selection.blockId;
}

/** `data-run="list/items/0/key"` splits at the first slash (SPEC 5.2: `<blockId>/<pointer>`). */
export function parseRunAttr(value: string): { blockId: string; pointer: string } | null {
  const slash = value.indexOf('/');
  if (slash <= 0 || slash === value.length - 1) return null;
  return { blockId: value.slice(0, slash), pointer: value.slice(slash + 1) };
}

/** The block ids under a rendered slide in document order, top level and nested alike. */
export function blockOrder(root: ParentNode): string[] {
  const ids: string[] = [];
  root.querySelectorAll<HTMLElement>('[data-block]').forEach((el) => {
    const id = el.dataset.block;
    if (id !== undefined && id !== '' && !ids.includes(id)) ids.push(id);
  });
  return ids;
}

/**
 * The innermost `[data-block]` at or above an event target inside `root`, or null. A positioned
 * block's `.free[data-free]` wrapper (render/slide.ts renderFreeform) counts as the block, so a
 * press inside its box but outside its text still selects it.
 */
export function resolveBlock(target: EventTarget | null, root: Element): string | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest<HTMLElement>('[data-block], .free[data-free]');
  if (!el || !root.contains(el)) return null;
  return el.dataset['block'] ?? el.dataset['free'] ?? null;
}

/** The `[data-run]` at or above an event target inside `root`, with its element, or null. */
export function resolveRun(
  target: EventTarget | null,
  root: Element,
): { blockId: string; pointer: string; element: HTMLElement } | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest<HTMLElement>('[data-run]');
  if (!el || !root.contains(el)) return null;
  const parsed = parseRunAttr(el.dataset.run ?? '');
  return parsed ? { ...parsed, element: el } : null;
}

/** The element a run selection names, or null once the slide re-rendered without it. */
export function runElement(root: ParentNode, blockId: string, pointer: string): HTMLElement | null {
  const value = `${blockId}/${pointer}`;
  let found: HTMLElement | null = null;
  root.querySelectorAll<HTMLElement>('[data-run]').forEach((el) => {
    if (found === null && el.dataset.run === value) found = el;
  });
  return found;
}

/** The first run of a block in document order, for Enter on a selected block (SPEC 6.9). */
export function firstRunOf(
  root: ParentNode,
  blockId: string,
): { blockId: string; pointer: string; element: HTMLElement } | null {
  let found: { blockId: string; pointer: string; element: HTMLElement } | null = null;
  root.querySelectorAll<HTMLElement>('[data-run]').forEach((el) => {
    if (found !== null) return;
    const parsed = parseRunAttr(el.dataset.run ?? '');
    if (parsed && parsed.blockId === blockId) found = { ...parsed, element: el };
  });
  return found;
}

/**
 * Tab walks the blocks in document order and wraps; Shift Tab walks back (SPEC 6.4). With nothing
 * selected the first (or last) block is taken. A run selection cycles from its block.
 */
export function cycleSelection(
  order: ReadonlyArray<string>,
  selection: Selection,
  delta: 1 | -1,
): Selection {
  if (order.length === 0) return null;
  const current = selectedBlockId(selection);
  const at = current === null ? -1 : order.indexOf(current);
  let next: number;
  if (at < 0) next = delta > 0 ? 0 : order.length - 1;
  else next = (at + delta + order.length) % order.length;
  const blockId = order[next];
  return blockId === undefined ? null : { kind: 'block', blockId };
}

/** Escape steps back from text edit to block to nothing (SPEC 6.4). */
export function escapeSelection(selection: Selection): Selection {
  if (selection === null) return null;
  if (selection.kind === 'run') return { kind: 'block', blockId: selection.blockId };
  return null;
}

/** A block of a slide by id, top level only (the mutations address top-level blocks). */
export function blockById(slide: Slide, blockId: string): Block | undefined {
  return slideBlocks(slide).find(({ block }) => block.id === blockId)?.block;
}

/**
 * The type the chip names for a `data-block` id. Title and statement slides render their text
 * as pseudo blocks (`heading`, `lead`, `big`; slide.ts) that are slide fields, not blocks, so
 * their types come from the render rather than the document.
 */
export function blockTypeOf(slide: Slide, blockId: string): string | undefined {
  const block = blockById(slide, blockId);
  if (block) return block.type;
  if (slide.kind === 'title' && (blockId === 'heading' || blockId === 'lead'))
    return blockId === 'heading' ? 'heading' : 'paragraph';
  if (slide.kind === 'statement' && blockId === 'big') return 'heading';
  return undefined;
}

/** The chip text beside the ring, `type · id` (SPEC 6.4), with a middle dot. */
export function chipLabel(slide: Slide, blockId: string): string {
  const type = blockTypeOf(slide, blockId);
  return type === undefined ? blockId : `${type} · ${blockId}`;
}

/** True when an event target is a field or an editable region; the shell keys are inert there (SPEC 6.9). */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  );
}

// ---------------------------------------------------------------------------------------------
// Multi-selection (this round's directive: Shift click and the marquee on a freeform slide)

/**
 * The selected block ids with the anchor first: the `Selection` the page owns names the anchor
 * (what the inspector edits) and the Editor keeps the rest of a multi-selection in `extra`.
 * Duplicates and a stray anchor in `extra` are dropped.
 */
export function selectedIds(selection: Selection, extra: readonly string[]): string[] {
  const anchor = selectedBlockId(selection);
  const out: string[] = anchor === null ? [] : [anchor];
  for (const id of extra) if (!out.includes(id)) out.push(id);
  return out;
}

/**
 * A Shift click on `id`: added when absent, removed when present; removing the anchor promotes
 * the first extra to anchor, and removing the last block clears the selection.
 */
export function toggleSelected(
  selection: Selection,
  extra: readonly string[],
  id: string,
): { selection: Selection; extra: string[] } {
  const anchor = selectedBlockId(selection);
  if (anchor === null) return { selection: { kind: 'block', blockId: id }, extra: [] };
  if (anchor === id) {
    const [next, ...rest] = extra;
    return next === undefined
      ? { selection: null, extra: [] }
      : { selection: { kind: 'block', blockId: next }, extra: rest };
  }
  if (extra.includes(id)) {
    return { selection: { kind: 'block', blockId: anchor }, extra: extra.filter((e) => e !== id) };
  }
  return { selection: { kind: 'block', blockId: anchor }, extra: [...extra, id] };
}

/** A selection of several blocks from an ordered id list: the first is the anchor. */
export function selectionOf(ids: readonly string[]): { selection: Selection; extra: string[] } {
  const [anchor, ...rest] = ids;
  return anchor === undefined
    ? { selection: null, extra: [] }
    : { selection: { kind: 'block', blockId: anchor }, extra: rest };
}

// ---------------------------------------------------------------------------------------------
// Google's words for the chip and the menus (gslides-parity SPEC 12, 13.7)

/** The plain name of a block type as the default view says it: Google's word where one exists. */
const DISPLAY_NAMES: Readonly<Partial<Record<string, string>>> = {
  heading: 'Title',
  paragraph: 'Text',
  text: 'Text box',
  box: 'Box',
  shape: 'Shape',
  rule: 'Line',
  shot: 'Image',
  pair: 'Images',
  tiles: 'Image grid',
  details: 'Detail grid',
  material: 'Picture',
  table: 'Table',
  rows: 'List',
  plain: 'List',
  refs: 'List',
  say: 'Quotes',
  icon: 'Icon',
  credit: 'Credit',
  scales: 'Scales',
  board: 'Board',
  matrix: 'Matrix',
  dia: 'Diagram',
  panel: 'Code',
  html: 'Embedded content',
  composite: 'Group',
  mark: 'Mark',
  marks: 'Marks',
  logos: 'Logos',
  spec: 'Type specimen',
  lang: 'Scripts',
  ladder: 'Type ladder',
  swatches: 'Swatches',
  ramp: 'Ramp',
};

/** The name the chip and the accessible label use for a block: its type in Google's words (SPEC 13.7), never its id. */
export function blockDisplayName(slide: Slide, blockId: string): string {
  if (slide.kind === 'title' && blockId === 'lead') return 'Subtitle';
  if (slide.kind === 'title' && blockId === 'heading') return 'Title';
  const type = blockTypeOf(slide, blockId);
  if (type === undefined) return 'Block';
  return DISPLAY_NAMES[type] ?? type.charAt(0).toUpperCase() + type.slice(1);
}

/** The family a selected block belongs to, as the menu model's predicates read it (menus/model.ts BlockFamily). */
export type BlockFamily = 'text' | 'shape' | 'image' | 'line' | 'table' | 'other';

export function blockFamily(type: string | undefined): BlockFamily {
  switch (type) {
    case 'heading':
    case 'paragraph':
    case 'text':
    case 'box':
    case 'credit':
      return 'text';
    case 'shape':
      return 'shape';
    case 'rule':
      return 'line';
    case 'shot':
    case 'pair':
    case 'tiles':
    case 'details':
    case 'material':
      return 'image';
    case 'table':
      return 'table';
    default:
      return 'other';
  }
}

/** True for the block types whose text takes typography (SPEC 3.2: heading, paragraph, text, box, table). */
export function isTextBlockType(type: string | undefined): boolean {
  return (
    type === 'heading' ||
    type === 'paragraph' ||
    type === 'text' ||
    type === 'box' ||
    type === 'table'
  );
}

/** The cell a table run pointer names (`rows/<r>/cells/<c>`), or null for any other pointer. */
export function cellPointer(pointer: string): { row: number; col: number } | null {
  const match = /^rows\/(\d+)\/cells\/(\d+)$/.exec(pointer);
  if (!match) return null;
  return { row: Number(match[1]), col: Number(match[2]) };
}

/**
 * The list item a run pointer names: `items/<i>/text` (plain), `items/<i>/key` or `/value`
 * (rows), `items/<i>` (refs); null for any other pointer.
 */
export function listItemPointer(pointer: string): { index: number; field: string | null } | null {
  const match = /^items\/(\d+)(?:\/([a-z]+))?$/.exec(pointer);
  if (!match) return null;
  return { index: Number(match[1]), field: match[2] ?? null };
}

/** The ids of the real blocks of a slide in document order, for Select all (SPEC 2.2). */
export function allBlockIds(slide: Slide): string[] {
  return slideBlocks(slide).map(({ block }) => block.id);
}
