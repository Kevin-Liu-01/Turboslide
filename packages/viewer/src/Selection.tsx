// The selection model of the stage in edit mode (SPEC 6.4): a block, or one text run of a block,
// or nothing. Selection is by click on the innermost `[data-block]`; Tab and Shift Tab walk the
// blocks in document order; Escape steps back from a run to its block and from a block to nothing.
// The ring itself is drawn by the chrome's Overlay from the boxes the Editor measures (SPEC 2.2:
// the overlay layer draws --pt-ink as a state, the block draws nothing), so this module holds the
// model and the DOM resolution only, and its pure parts are pinned by selection.test.ts.
import type { Block } from '@turboslide/schema/blocks';
import type { Slide } from '@turboslide/schema/deck';
import { slideBlocks } from '@turboslide/schema/deck';
import { assistMark } from '@turboslide/schema/ext';
import { isLineKind } from '@turboslide/schema/shapes';

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

/**
 * The object at or above an event target on any slide kind (gslides-parity SPEC-2 1.1): a block
 * as `resolveBlock` reads it, else one of the kind's elements under the id the conversion gives
 * it: the title's mark svg (`mark`), a picture kind's plate padding (`plate`), the closing's mark
 * inside the plate (`mark`), and on a picture kind any press on the slide outside the plate, which
 * lands on the photograph (`picture`; the stage hides the slide's own image and paints it as the
 * backdrop, so the press reaches the slide element). Null on empty sheet elsewhere.
 */
export function resolveObject(
  target: EventTarget | null,
  root: Element,
  slide: Slide,
): string | null {
  const block = resolveBlock(target, root);
  if (block !== null) return block;
  if (!(target instanceof Element) || !root.contains(target)) return null;
  if (slide.kind === 'title') {
    return target.closest('.left-mid svg[data-raster="mark"]') ? 'mark' : null;
  }
  if (slide.kind === 'opener' || slide.kind === 'mood' || slide.kind === 'closing') {
    if (target.closest('[data-slot="plate"] svg.mark')) return 'mark';
    if (target.closest('[data-slot="plate"]')) return 'plate';
    if (target.closest('.slide')) return 'picture';
  }
  return null;
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
  if (slide.kind === 'title') {
    if (blockId === 'heading') return 'heading';
    if (blockId === 'lead') return 'paragraph';
    if (blockId === 'mark') return 'mark';
  }
  if (slide.kind === 'statement' && blockId === 'big') return 'heading';
  if (slide.kind === 'opener' || slide.kind === 'mood' || slide.kind === 'closing') {
    if (blockId === 'picture') return 'picture';
    if (blockId === 'plate') return 'box';
    if (blockId === 'mark') return 'mark';
  }
  return undefined;
}

/**
 * The right-click target of an object (gslides-parity SPEC-2 4.3): a shape of a closed kind, a
 * line (a rule or a line kind), an image (a picture, a shot, the photograph), a chart, a table's
 * body, else a text object.
 */
export type ObjectContextTarget = 'textBlock' | 'image' | 'shape' | 'line' | 'chart' | 'table';

export function objectContextTarget(slide: Slide, blockId: string): ObjectContextTarget {
  const block = blockById(slide, blockId);
  const type = block?.type ?? blockTypeOf(slide, blockId);
  if (type === 'shape' && block?.type === 'shape')
    return isLineKind(block.shape) ? 'line' : 'shape';
  if (type === 'rule') return 'line';
  if (type === 'chart') return 'chart';
  if (type === 'table') return 'table';
  if (blockFamily(type) === 'image') return 'image';
  return 'textBlock';
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

/** The chrome regions that keep their own clipboard: a dialog's or a menu's fields, the Format options panel. */
const CLIPBOARD_KEEPERS = '[role="dialog"], [role="menu"], .ts-inspector';

/**
 * True when the stage takes a copy, cut or paste event (docs/FOCUS.md rank 15; audit-arrange rows
 * 41 and 42). The shell leaves the three clipboard chords to the browser's events, so the stage is
 * the only taker on the page: it owns the event unless a text session is open, the target is a
 * field or an editable region (the notes, a dialog's input, the palette's query), or the target
 * sits in a dialog, a menu or the Format options panel outside the stage. A toolbar button that
 * kept the focus after its click (New slide) or a filmstrip card does not keep the paste: the
 * seller who copied an object and clicked the next slide's card expects Cmd+V to land there.
 */
export function stageOwnsClipboard(
  target: EventTarget | null,
  stage: Element | null,
  editing: boolean,
): boolean {
  if (editing || isEditableTarget(target)) return false;
  if (!(target instanceof Element)) return true;
  if (stage !== null && stage.contains(target)) return true;
  return target.closest(CLIPBOARD_KEEPERS) === null;
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
// The press on the sheet (docs/gslides-parity/focus/AMENDMENTS.md A1, the click model)

/** What a pointer down on the sheet does, decided before any state changes (press-rules.test.ts). */
export type PressPlan =
  /** the empty sheet: a marquee, a plain click clears (SPEC-2 6.1 row 3) */
  | { action: 'marquee' }
  /** the paint format tool is armed: the click paints the block and nothing else (SPEC 3.1 row 6) */
  | { action: 'paint'; blockId: string }
  /** Shift or Cmd: the object's membership toggles, a group whole (SPEC-2 6.1 row 2) */
  | { action: 'toggle'; blockId: string }
  /**
   * a plain press: `select` when the object joins the selection alone (it was not selected, or a
   * group member the seller has not entered stands in for its group), and `drag` when the press
   * arms the move gesture, which a move past its threshold turns into the drag of the whole
   * selection. On a table the press names the cell it landed in (docs/FEATURES.md 2.1, the
   * amended A1 for tables alone): `caret` is the cell a pointer up without a move opens with the
   * caret at the click point, and `range` says a move past the threshold selects the cells from
   * that cell instead of moving the table, because the table is already the one selected object
   * and its move surface is its ring band, its chip and its eight handles.
   */
  | {
      action: 'press';
      blockId: string;
      select: boolean;
      drag: boolean;
      caret?: { row: number; col: number };
      range?: true;
    };

/**
 * The click model of the canvas (A1, binding above docs/FOCUS.md 2.3), for every object kind
 * including text boxes and the title, subtitle and body placeholders: one click selects the
 * object and shows the ring, the handles and the chip, and places no caret; a pointer down
 * anywhere inside a selected object arms the drag, so a move past the threshold moves it, and the
 * whole selection when several are selected; a click on an object inside a multiple selection
 * keeps the selection. A text object's session opens on a double click, Enter or a typed
 * character, never here, which is what lets a drag start inside the text (Kevin, 2026-09-16:
 * "when you click and drag in the selection area, it should drag, and double clicking is what
 * goes inside"; the verifier's F4 and F5 saw the old one click session claim the drag, the right
 * click and the Shift click). Commenting and Viewing mode select for a comment's anchor and never
 * drag (SPEC-3 5.3, 6.3). The paint tool and the modifiers keep their rules.
 *
 * The table's amendment (docs/FEATURES.md 2.1, 2.2 ranks 2 and 4; question 8 of its section 9
 * records the alternative): rules 1 and 3 of A1 are amended for tables alone. A pointer down in a
 * cell of an unselected table followed by a move past the threshold still drags the table (rule
 * 2, decided at the threshold before any caret); a pointer up without a move selects the table
 * and places the caret in the pressed cell at the click point, Google's one click (audit-objects
 * section 2: Google, Notion and Pitch type in one click, Turboslide took two). On the selected
 * table a press in a cell followed by a move selects a range from that cell and the table does
 * not move (its move surface is the ring band, the chip and the eight handles), and a click on
 * another cell moves the caret. A table in a multiple selection or in a group keeps A1 as written.
 */
export function objectPressPlan(input: {
  /** the object under the pointer (resolveObject), or null on the empty sheet */
  under: string | null;
  /** the selected ids, the anchor first (selectedIds) */
  selected: readonly string[];
  /** Shift, Cmd or Ctrl held */
  modifier: boolean;
  /** Editing mode; Commenting and Viewing mode read false */
  editable: boolean;
  /** the paint format tool is armed */
  paint: boolean;
  /** the object is a member of a group the seller has not entered by a double click */
  grouped: boolean;
  /** the id names an object the stage measured (Freeform isObjectId), so a chip handle exists */
  object: boolean;
  /** the cell of a table the press landed in (resolveRun, cellPointer); absent or null elsewhere */
  cell?: { row: number; col: number } | null;
}): PressPlan {
  const { under } = input;
  if (under === null) return { action: 'marquee' };
  if (input.paint) return { action: 'paint', blockId: under };
  if (input.modifier) return { action: 'toggle', blockId: under };
  const held = input.selected.includes(under);
  if (!input.editable) return { action: 'press', blockId: under, select: !held, drag: false };
  const cell = input.cell ?? null;
  if (cell !== null && !input.grouped) {
    /* the one selected table: a tap moves the caret, a move selects a range */
    if (held && input.selected.length === 1)
      return {
        action: 'press',
        blockId: under,
        select: false,
        drag: false,
        caret: cell,
        range: true,
      };
    /* an unselected table: the press selects it and arms the drag; a tap places the caret */
    if (!held)
      return { action: 'press', blockId: under, select: true, drag: input.object, caret: cell };
  }
  return {
    action: 'press',
    blockId: under,
    select: !held || (input.grouped && input.selected.length === 1),
    drag: input.object,
  };
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
  /* the features round, ship two (docs/FEATURES.md 5.1): a shader block reads Shader */
  material: 'Shader',
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
  picture: 'Image',
  chart: 'Chart',
  logos: 'Logos',
  spec: 'Type specimen',
  lang: 'Scripts',
  ladder: 'Type ladder',
  swatches: 'Swatches',
  ramp: 'Ramp',
};

/**
 * The name the chip and the accessible label use for a block: its type in Google's words (SPEC
 * 13.7), never its id. `assets` is the deck's asset table: a picture whose asset carries the
 * `logo` role reads Logo (docs/FEATURES.md 4.4; the features round's build/b6.md R6, the row
 * `logos.insert.logo-size` reads the chip); without the table the picture reads Image.
 */
export function blockDisplayName(
  slide: Slide,
  blockId: string,
  assets?: Readonly<Record<string, { role?: string } | undefined>>,
): string {
  /* a block the assistant wrote reads Assistant until the seller edits it (docs/PRODUCT.md 6.1; build/b6.md R6) */
  const marked = blockById(slide, blockId);
  if (marked !== undefined && assistMark(marked.ext) !== undefined) return 'Assistant';
  if (
    assets !== undefined &&
    marked !== undefined &&
    (marked.type === 'shot' || marked.type === 'picture') &&
    assets[marked.asset]?.role === 'logo'
  )
    return 'Logo';
  if (slide.kind === 'title' && blockId === 'lead') return 'Subtitle';
  if (slide.kind === 'title' && blockId === 'heading') return 'Title';
  if (
    (slide.kind === 'opener' || slide.kind === 'mood' || slide.kind === 'closing') &&
    blockId === 'plate' &&
    blockById(slide, blockId) === undefined
  )
    return 'Plate';
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
    case 'picture':
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

/** True when the id names a slide field drawn as a pseudo block (the title's heading and lead, the statement's big). */
export function isFieldObject(slide: Slide, blockId: string): boolean {
  return (
    (slide.kind === 'title' && (blockId === 'heading' || blockId === 'lead')) ||
    (slide.kind === 'statement' && blockId === 'big')
  );
}
