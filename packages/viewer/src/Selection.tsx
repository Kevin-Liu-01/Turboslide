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

/** The innermost `[data-block]` at or above an event target inside `root`, or null. */
export function resolveBlock(target: EventTarget | null, root: Element): string | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest<HTMLElement>('[data-block]');
  if (!el || !root.contains(el)) return null;
  return el.dataset.block ?? null;
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
