// The palette's data (SPEC 6.3): five groups, one entry list built from the document and the
// action table, and the filter with its three prefixes. Pure: no React, no DOM, so the entries
// and the filter are unit tested in Node and Palette.tsx only draws them. (Named palette-data,
// not palette, because a case-insensitive file system resolves `./palette` to Palette.tsx.) Because the Actions
// group lists every action-table entry that carries a label, anything an agent can invoke a
// human can find by name (SPEC 6.3); an entry runs through the dispatcher with an input built
// from the current view, or names the input it still needs. The Insert group (Kevin, 2026-09-11:
// "reuse primitives and icons like boxes and shapes") leads with the primitives palette: Box,
// Shape in its five kinds, Rule, Text, Icon (through the sprite picker), Image and Material,
// then the grammar's other blocks and the 21 layouts of @turboslide/schema/layouts as New slide
// entries (gslides-parity SPEC 5.1: one list in one order everywhere; each runs slide.new); the same
// entries feed the toolbar's Insert menu (InsertMenu.tsx). The `menus` and `layouts` groups are the
// ToolFinder's (Search the menus, SPEC 2.10) and stay empty in the full palette. On a freeform slide every inserted block carries a position box
// (docs/freeform.md) under the selected block or at the content box's top left.
import type { ActionId, ActionSpec } from '@turboslide/schema/actions';
import { actionsInOrder } from '@turboslide/schema/actions';
import type { Block, BlockType, ShapeKind } from '@turboslide/schema/blocks';
import { PRIMITIVE_BLOCK_TYPES } from '@turboslide/schema/blocks';
import { CATALOG } from '@turboslide/schema/catalog';
import type { Deck, Slide, SlideKind, SlotName } from '@turboslide/schema/deck';
import { slideBlocks, slideTitle, slotsForLayout } from '@turboslide/schema/deck';
import { FREEFORM_GRID, snapPosition } from '@turboslide/schema/freeform';
import type { BlockId, SlideId } from '@turboslide/schema/ids';
import type { BlockSlot, Version } from '@turboslide/schema/mutations';
import type { Position } from '@turboslide/schema/position';
import { CONTENT_BOX } from '@turboslide/schema/render';

import { authorName } from './dispatch';
import type { IconName } from './icons';
import { BLOCK_ICONS, KIND_ICONS } from './inspector/sections';
import { isParkedRow } from './menus/model.ts';
import type { ShellMode } from './shell-data';
import { LAYOUTS, pickAsset } from '@turboslide/schema/layouts';

export type PaletteGroupId =
  'slides' | 'insert' | 'actions' | 'view' | 'versions' | 'menus' | 'layouts';

export type PaletteGroup = {
  id: PaletteGroupId;
  /** the 12.5 px titanium label over the group's rows */
  label: string;
  /** the character that restricts the query to this group (SPEC 6.3) */
  prefix?: '#' | '+' | '>';
};

/** The groups in the order the palette shows them (SPEC 6.3); the last two belong to Search the menus. */
export const PALETTE_GROUPS: ReadonlyArray<PaletteGroup> = [
  { id: 'menus', label: 'Menus' },
  { id: 'slides', label: 'Go to slide', prefix: '#' },
  { id: 'insert', label: 'Insert', prefix: '+' },
  { id: 'actions', label: 'Actions', prefix: '>' },
  { id: 'view', label: 'View' },
  { id: 'versions', label: 'Versions' },
  { id: 'layouts', label: 'Layouts' },
];

/**
 * What Enter does on an entry. `dispatch` runs the action through the dispatcher with the input
 * as built; `prompt` asks for one field first (a version note) and then dispatches; `icon` opens
 * the sprite picker and writes the picked name at `path` inside the input before dispatching (the
 * Icon primitive); `call` runs a view toggle that is not an action-table entry (twin, lint layer,
 * edit, source); `needs` names an input the palette cannot build from the view (a file, a URL,
 * revisions), so Enter reports it and the CLI or the source drawer takes the action.
 */
export type PaletteRun =
  | { kind: 'dispatch'; action: ActionId; input: unknown }
  | {
      kind: 'prompt';
      action: ActionId;
      input: Record<string, unknown>;
      field: string;
      label: string;
    }
  | {
      kind: 'icon';
      action: ActionId;
      input: Record<string, unknown>;
      /** the JSON pointer inside the input the picked icon name lands at: `/block/name` */
      path: string;
      label: string;
    }
  | { kind: 'call'; call: () => void }
  | { kind: 'needs'; action: ActionId; reason: string };

export type PaletteEntry = {
  /** unique across groups: `slide:content-rule`, `action:lint.run` */
  id: string;
  group: PaletteGroupId;
  title: string;
  /** the address at the right end: the section, the action id, the author */
  meta?: string;
  /** one sentence under the title: a block's constraint, an action's doc */
  hint?: string;
  /** the key the toolbar or SPEC 6.9 binds, as words: `Cmd K` */
  keys?: string;
  icon: IconName;
  /** the slide id a row previews under (data-preview) */
  preview?: string;
  /** more words the filter matches, beyond the title */
  terms?: string;
  /** an insert entry's family: a primitive, another block, or a slide template */
  insert?: 'primitive' | 'block' | 'slide';
  /** the shape kind of a Shape primitive entry */
  variant?: ShapeKind;
  run: PaletteRun;
  /**
   * The menu row an Insert entry corresponds to (docs/FOCUS.md 3.1): `insert.textBox` for Text,
   * `insert.shape.shapes.rectangle` for the rectangle, `insert.line.arrow` for the arrow, and so
   * on. Absent for a block no menu row inserts (a grammar block, the box primitive).
   */
  row?: string;
  /**
   * A parked entry (docs/FOCUS.md 3.1, the palette's Insert group): listed only while Tools >
   * Advanced tools is on (`PaletteContext.advancedTools`); `buildPaletteEntries` drops it
   * otherwise. The action it runs stays registered. An Insert entry is parked when the row it
   * names is parked (`isParkedRow`) or when it names none, so a chart, a table, a diagram, an icon,
   * a material and the grammar blocks leave the default view with their rows.
   */
  advanced?: true;
};

export type PaletteView = {
  mode: ShellMode;
  theme: 'light' | 'dark';
  present: boolean;
  edit: boolean;
  twin: boolean;
  lint: boolean;
  source: boolean;
};

export type PaletteToggles = {
  edit: () => void;
  twin: () => void;
  lint: () => void;
  source: () => void;
};

export type PaletteContext = {
  deck: Deck;
  slides: Readonly<Record<SlideId, Slide>>;
  /** the current slide */
  slideId?: SlideId;
  /** the selected block on the current slide */
  blockId?: BlockId;
  revision: number;
  versions?: ReadonlyArray<Version>;
  view: PaletteView;
  toggles: PaletteToggles;
  /** Apple platforms read Cmd, the others Ctrl */
  apple?: boolean;
  /** Tools > Advanced tools is on (docs/FOCUS.md 3.1): the entries flagged `advanced` are listed; off when absent */
  advancedTools?: boolean;
};

/** The action ids the palette builds inputs for from the view; the rest name what they need. */
type InputBuilder = (ctx: PaletteContext) => PaletteRun;

const KIND_ICON: Record<SlideKind, IconName> = KIND_ICONS;

/** The primitives in palette order (docs/freeform.md); Image and Material are the existing blocks under primitive names. */
export const PRIMITIVE_ORDER: ReadonlyArray<BlockType> = [
  ...PRIMITIVE_BLOCK_TYPES,
  'shot',
  'material',
];

/** The label an insert entry shows for a block type: the primitives' short names, the catalog's for the rest. */
export function insertLabel(type: BlockType, variant?: ShapeKind): string {
  if (type === 'shape' && variant !== undefined) return `${SHAPE_WORD[variant]} shape`;
  if (type === 'shot') return 'Image';
  return CATALOG[type].label;
}

const SHAPE_WORD: Readonly<Record<ShapeKind, string>> = {
  rectangle: 'Rectangle',
  rounded: 'Rounded rectangle',
  ellipse: 'Ellipse',
  line: 'Line',
  arrow: 'Arrow',
};

const SHAPE_DOC: Readonly<Record<ShapeKind, string>> = {
  rectangle: 'A rectangle filling its box, hairline stroke, no fill unless set.',
  rounded: 'A rectangle with 8 px corners filling its box.',
  ellipse: 'An ellipse filling its box.',
  line: 'A line across its box, horizontal when the box is wider than tall.',
  arrow: 'A line with a filled 8 px head at its end.',
};

/** The menu row each shape variant corresponds to (docs/FOCUS.md 2.6, 3.1). */
const SHAPE_ROW: Readonly<Record<ShapeKind, string>> = {
  rectangle: 'insert.shape.shapes.rectangle',
  rounded: 'insert.shape.shapes.rounded',
  ellipse: 'insert.shape.shapes.ellipse',
  line: 'insert.line.line',
  arrow: 'insert.line.arrow',
};

/** The menu row a block type's Insert entry corresponds to; absent for a block no row inserts. */
const BLOCK_ROW: Readonly<Partial<Record<BlockType, string>>> = {
  text: 'insert.textBox',
  rule: 'insert.line.rule',
  icon: 'insert.icon',
  shot: 'insert.image.upload',
  material: 'insert.material',
  table: 'insert.table',
  chart: 'insert.chart',
  dia: 'insert.diagram',
};

/** The `row` and `advanced` fields of an Insert entry from the row it corresponds to (docs/FOCUS.md 3.1). */
function rowFields(row: string | undefined): Pick<PaletteEntry, 'row' | 'advanced'> {
  if (row === undefined) return { advanced: true };
  return isParkedRow(row) ? { row, advanced: true } : { row };
}

/**
 * The shape variants the palette and the Insert menu strip offer: the five legacy kinds with a
 * word and a glyph here. The shape table of SPEC-2 2.3 (`SHAPE_KINDS` now lists every preset)
 * is drawn by the shape picker of the menu model's Insert > Shape categories, not by this strip.
 */
export const LEGACY_SHAPE_VARIANTS: ReadonlyArray<ShapeKind> = Object.keys(
  SHAPE_WORD,
) as ShapeKind[];

/** The box a new block takes on a freeform slide, by type; in sheet px on the 8 px grid. */
const DEFAULT_SIZE: Readonly<Record<string, [number, number]>> = {
  box: [320, 184],
  shape: [240, 160],
  rule: [320, 8],
  text: [480, 64],
  icon: [48, 48],
  shot: [480, 272],
  material: [480, 272],
  heading: [800, 56],
  paragraph: [640, 104],
  /* gslides-parity SPEC 7.3: the grid picker's table on a freeform slide */
  table: [960, 320],
};

/**
 * Where a new block lands on a freeform slide: under the selected block when it has a box, else
 * at the content box's top left, snapped like a drag would be (freeform.ts snapPosition).
 */
export function defaultPosition(slide: Slide, type: BlockType, blockId?: BlockId): Position {
  const [w, h] = DEFAULT_SIZE[type] ?? [320, 160];
  const [contentX, contentY] = CONTENT_BOX;
  const anchor =
    blockId === undefined
      ? undefined
      : slideBlocks(slide).find(({ block }) => block.id === blockId)?.block.pos;
  const x = anchor?.x ?? contentX;
  const y = anchor === undefined ? contentY : anchor.y + anchor.h + FREEFORM_GRID * 2;
  return snapPosition({ x, y, w, h });
}

/** True for a content slide under the freeform layout, where every block needs a position box. */
export function isFreeform(slide: Slide): boolean {
  return slide.kind === 'content' && slide.layout.type === 'freeform';
}

/* Cmd L is the lint layer toggle (SPEC 6.9), not lint.run, so lint.run shows no key */
const VIEW_KEYS: Partial<Record<ActionId, string>> = {
  'version.save': 'Cmd S',
  'view.present': 'P',
};

function cmd(ctx: PaletteContext, key: string): string {
  return `${ctx.apple === false ? 'Ctrl' : 'Cmd'} ${key}`;
}

function currentSlide(ctx: PaletteContext): Slide | undefined {
  return ctx.slideId === undefined ? undefined : ctx.slides[ctx.slideId];
}

function sectionOf(deck: Deck, slideId: SlideId) {
  return deck.sections.find((section) => section.slideIds.includes(slideId));
}

/** A slide id that is not taken: `<base>`, then `<base>-2`, `<base>-3`. */
export function freeSlideId(taken: ReadonlySet<string>, base: string): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** A block id that is not taken on the slide: the type, then `<type>-2`. */
export function freeBlockId(slide: Slide, type: BlockType): BlockId {
  const taken = new Set(slideBlocks(slide).map(({ block }) => block.id));
  return freeSlideId(taken, type.toLowerCase());
}

/**
 * A minimal valid slide of a kind (SPEC 4.2). The picture kinds need an asset: the first asset
 * with the kind's role, else any asset; when the deck has none the kind is not offered.
 */
export function blankSlide(
  kind: SlideKind,
  id: SlideId,
  deck: Deck,
  sectionId: string,
): Slide | null {
  const pictureAsset = (role: string): string | undefined => {
    const assets = Object.values(deck.assets);
    return (assets.find((asset) => asset.role === role) ?? assets[0])?.id;
  };
  switch (kind) {
    case 'content':
      return {
        schemaVersion: 1,
        id,
        kind: 'content',
        layout: { type: 'center' },
        slots: { main: [{ id: 'h', type: 'heading', level: 'h2', text: 'Heading' }] },
      };
    case 'title':
      return {
        schemaVersion: 1,
        id,
        kind: 'title',
        mark: { w: 132, h: 84 },
        heading: 'Title',
        lead: 'One line under the title.',
      };
    case 'statement':
      return { schemaVersion: 1, id, kind: 'statement', big: 'Statement', measure: 22 };
    case 'opener': {
      const asset = pictureAsset('opener');
      if (asset === undefined) return null;
      return {
        schemaVersion: 1,
        id,
        kind: 'opener',
        sectionId,
        picture: { asset, fit: 'cover' },
        plate: {
          side: 'lower-left',
          maxWidth: 740,
          blocks: [{ id: 'big', type: 'heading', level: 'big', text: 'Section' }],
        },
      };
    }
    case 'mood': {
      const asset = pictureAsset('mood');
      if (asset === undefined) return null;
      return {
        schemaVersion: 1,
        id,
        kind: 'mood',
        picture: { asset, fit: 'cover' },
        plate: {
          side: 'lower-right',
          maxWidth: 560,
          blocks: [{ id: 'title', type: 'heading', level: 'title', text: 'Picture' }],
        },
      };
    }
    case 'closing': {
      const asset = pictureAsset('opener');
      if (asset === undefined) return null;
      return {
        schemaVersion: 1,
        id,
        kind: 'closing',
        picture: { asset, fit: 'cover' },
        plate: {
          side: 'upper-left',
          maxWidth: 720,
          blocks: [{ id: 'big', type: 'heading', level: 'big', text: 'Closing' }],
        },
      };
    }
  }
}

/** The slot a new block lands in: the selected block's slot, else the layout's first slot or the plate. */
export function insertionSlot(slide: Slide, blockId?: BlockId): BlockSlot | null {
  if (slide.kind === 'opener' || slide.kind === 'mood' || slide.kind === 'closing') return 'plate';
  if (slide.kind !== 'content') return null;
  if (blockId !== undefined) {
    const placed = slideBlocks(slide).find(({ block }) => block.id === blockId);
    if (placed) return placed.slot;
  }
  const slots = slotsForLayout(slide.layout);
  const filled = slots.find((slot) => (slide.slots[slot]?.length ?? 0) > 0);
  return filled ?? slots[0] ?? null;
}

function slideEntries(ctx: PaletteContext): PaletteEntry[] {
  const out: PaletteEntry[] = [];
  let n = 0;
  for (const section of ctx.deck.sections) {
    for (const id of section.slideIds) {
      const slide = ctx.slides[id];
      if (slide === undefined) continue;
      n += 1;
      out.push({
        id: `slide:${id}`,
        group: 'slides',
        title: `${n < 10 ? `0${n}` : n}  ${slideTitle(slide, n)}`,
        meta: section.name,
        icon: KIND_ICON[slide.kind],
        preview: id,
        terms: `${id} ${section.name} ${slide.kind}`,
        run: { kind: 'dispatch', action: 'view.goto', input: { slideId: id } },
      });
    }
  }
  return out;
}

function templateEntries(ctx: PaletteContext): PaletteEntry[] {
  const out: PaletteEntry[] = [];
  const section = ctx.slideId === undefined ? undefined : sectionOf(ctx.deck, ctx.slideId);
  const sectionId = section?.id ?? ctx.deck.sections[0]?.id;
  if (sectionId === undefined) return out;
  /* one entry per layout (gslides-parity SPEC 5.1, 5.3): the New slide of that layout after the
     current slide, one slide.new; a picture layout the deck cannot make yet is not offered */
  for (const entry of LAYOUTS) {
    if (entry.make(`preview-${entry.id}`, ctx.deck, sectionId) === null) continue;
    out.push({
      id: `insert:slide:${entry.id}`,
      group: 'insert',
      title: entry.label,
      hint: entry.doc,
      meta: section ? `after this slide in ${section.name}` : 'first',
      icon: KIND_ICON[entry.kind],
      terms: `slide layout ${entry.id} ${entry.kind} ${entry.layout ?? ''} ${entry.google ? 'google' : 'gt'}`,
      insert: 'slide',
      /* the New slide rows: insert.newSlide with the layout of slide.applyLayout (docs/FOCUS.md 2.2) */
      ...rowFields('insert.newSlide'),
      run: {
        kind: 'dispatch',
        action: 'slide.new',
        input: {
          layout: entry.id,
          sectionId,
          ...(ctx.slideId !== undefined ? { after: ctx.slideId } : {}),
          baseRevision: ctx.revision,
        },
      },
    });
  }
  return out;
}

/** A block instance for an insert entry, with its position box on a freeform slide. */
function madeBlock(
  slide: Slide,
  type: BlockType,
  blockId: BlockId | undefined,
  patch: Partial<Block> = {},
): Block {
  const block = { ...CATALOG[type].make(freeBlockId(slide, type)), ...patch } as Block;
  return isFreeform(slide) ? { ...block, pos: defaultPosition(slide, type, blockId) } : block;
}

function blockEntries(ctx: PaletteContext): PaletteEntry[] {
  const out: PaletteEntry[] = [];
  const slide = currentSlide(ctx);
  if (slide === undefined) return out;
  const slot = insertionSlot(slide, ctx.blockId);
  if (slot === null) return out;
  const where: 'content' | 'plate' = slot === 'plate' ? 'plate' : 'content';
  const meta = `into ${slot}${ctx.blockId !== undefined ? ` after ${ctx.blockId}` : ''}`;
  const insertInput = (block: Block) => ({
    slideId: slide.id,
    slot,
    ...(ctx.blockId !== undefined ? { after: ctx.blockId } : {}),
    block,
    baseRevision: ctx.revision,
  });
  const dispatchInsert = (block: Block): PaletteRun => ({
    kind: 'dispatch',
    action: 'block.insert',
    input: insertInput(block),
  });

  /* the primitives first, in their own order */
  for (const type of PRIMITIVE_ORDER) {
    const entry = CATALOG[type];
    if (!entry.allowedIn.includes(where)) continue;
    if (type === 'shape') {
      for (const variant of LEGACY_SHAPE_VARIANTS) {
        out.push({
          id: `insert:block:shape:${variant}`,
          group: 'insert',
          title: insertLabel('shape', variant),
          hint: SHAPE_DOC[variant],
          meta,
          icon: 'cube',
          terms: `shape ${variant} primitive block`,
          insert: 'primitive',
          variant,
          ...rowFields(SHAPE_ROW[variant]),
          run: dispatchInsert(madeBlock(slide, 'shape', ctx.blockId, { shape: variant })),
        });
      }
      continue;
    }
    if (type === 'icon') {
      out.push({
        id: 'insert:block:icon',
        group: 'insert',
        title: insertLabel('icon'),
        hint: entry.doc,
        meta,
        icon: BLOCK_ICONS.icon,
        terms: 'icon glyph sprite primitive block',
        insert: 'primitive',
        ...rowFields(BLOCK_ROW.icon),
        run: {
          kind: 'icon',
          action: 'block.insert',
          input: insertInput(madeBlock(slide, 'icon', ctx.blockId)),
          path: '/block/name',
          label: 'Pick the symbol',
        },
      });
      continue;
    }
    if (type === 'shot') {
      const asset = pickAsset(ctx.deck, ['capture', 'detail', 'thumb', 'render', 'other']);
      out.push({
        id: 'insert:block:image',
        group: 'insert',
        title: insertLabel('shot'),
        hint: 'A picture from the deck’s assets in a bordered frame with a light and dark twin; pick another asset in the inspector.',
        meta,
        icon: BLOCK_ICONS.shot,
        terms: 'image picture shot capture figure primitive block',
        insert: 'primitive',
        ...rowFields(BLOCK_ROW.shot),
        run:
          asset === undefined
            ? {
                kind: 'needs',
                action: 'block.insert',
                reason: 'Add a picture in the Asset section first',
              }
            : dispatchInsert(madeBlock(slide, 'shot', ctx.blockId, { asset: asset.id })),
      });
      continue;
    }
    out.push({
      id: `insert:block:${type}`,
      group: 'insert',
      title: insertLabel(type),
      hint: entry.doc,
      meta,
      icon: BLOCK_ICONS[type],
      terms: `${type} primitive block ${entry.group}`,
      insert: 'primitive',
      ...rowFields(BLOCK_ROW[type]),
      run: dispatchInsert(madeBlock(slide, type, ctx.blockId)),
    });
  }

  /* then the grammar's other blocks */
  for (const entry of Object.values(CATALOG)) {
    if (!entry.allowedIn.includes(where)) continue;
    if (PRIMITIVE_ORDER.includes(entry.type)) continue;
    out.push({
      id: `insert:block:${entry.type}`,
      group: 'insert',
      title: `${entry.label} block`,
      hint: entry.doc,
      meta,
      icon: BLOCK_ICONS[entry.type],
      terms: `block ${entry.type} ${entry.group}`,
      insert: 'block',
      ...rowFields(BLOCK_ROW[entry.type]),
      run: dispatchInsert(madeBlock(slide, entry.type, ctx.blockId)),
    });
  }
  return out;
}

function insertEntries(ctx: PaletteContext): PaletteEntry[] {
  return [...blockEntries(ctx), ...templateEntries(ctx)];
}

/** How each action's input is built from the view; absent means the action needs an input the palette cannot build. */
const INPUTS: Partial<Record<ActionId, InputBuilder>> = {
  'deck.info': () => ({ kind: 'dispatch', action: 'deck.info', input: {} }),
  'deck.create': () => ({
    kind: 'prompt',
    action: 'deck.create',
    input: { from: 'gt-brand' },
    field: 'name',
    label: 'New deck name (from the GT brand template)',
  }),
  'deck.rename': (ctx) => ({
    kind: 'prompt',
    action: 'deck.rename',
    input: { baseRevision: ctx.revision },
    field: 'name',
    label: 'Deck name',
  }),
  'slide.list': () => ({ kind: 'dispatch', action: 'slide.list', input: {} }),
  'slide.get': (ctx) =>
    ctx.slideId === undefined
      ? { kind: 'needs', action: 'slide.get', reason: 'Open a slide first' }
      : { kind: 'dispatch', action: 'slide.get', input: { slideId: ctx.slideId } },
  'slide.remove': (ctx) =>
    ctx.slideId === undefined
      ? { kind: 'needs', action: 'slide.remove', reason: 'Open a slide first' }
      : {
          kind: 'dispatch',
          action: 'slide.remove',
          input: { slideId: ctx.slideId, baseRevision: ctx.revision },
        },
  'block.remove': (ctx) =>
    ctx.slideId === undefined || ctx.blockId === undefined
      ? { kind: 'needs', action: 'block.remove', reason: 'Select a block first' }
      : {
          kind: 'dispatch',
          action: 'block.remove',
          input: { slideId: ctx.slideId, blockId: ctx.blockId, baseRevision: ctx.revision },
        },
  'slide.lease': (ctx) =>
    ctx.slideId === undefined
      ? { kind: 'needs', action: 'slide.lease', reason: 'Open a slide first' }
      : { kind: 'dispatch', action: 'slide.lease', input: { slideId: ctx.slideId } },
  'render.slide': (ctx) => ({
    kind: 'dispatch',
    action: 'render.slide',
    input: {
      slideIds: ctx.slideId === undefined ? 'all' : [ctx.slideId],
      themes: ['light', 'dark'],
      scale: 1,
    },
  }),
  'render.sheet': () => ({
    kind: 'dispatch',
    action: 'render.sheet',
    input: { slideIds: 'all', themes: ['light', 'dark'], cols: 4, thumb: 480, numbered: true },
  }),
  'lint.run': () => ({
    kind: 'dispatch',
    action: 'lint.run',
    input: { slideIds: 'all', layers: 'static' },
  }),
  'fix.run': (ctx) => ({
    kind: 'dispatch',
    action: 'fix.run',
    input: {
      slideIds: ctx.slideId === undefined ? 'all' : [ctx.slideId],
      dryRun: false,
      baseRevision: ctx.revision,
    },
  }),
  'diff.run': () => ({ kind: 'dispatch', action: 'diff.run', input: { staged: true } }),
  'version.save': () => ({
    kind: 'prompt',
    action: 'version.save',
    input: {},
    field: 'note',
    label: 'Version note',
  }),
  'version.list': () => ({ kind: 'dispatch', action: 'version.list', input: {} }),
  'validate.run': (ctx) => ({
    kind: 'dispatch',
    action: 'validate.run',
    input: { path: `decks/${ctx.deck.id}` },
  }),
  'build.run': (ctx) => ({
    kind: 'dispatch',
    action: 'build.run',
    input: { out: `.turboslide/${ctx.deck.id}.html`, budgetMB: 16 },
  }),
  'export.run': () => ({
    kind: 'dispatch',
    action: 'export.run',
    input: { format: 'pptx', mode: 'flatten', theme: ['light', 'dark'], verify: false },
  }),
  'fonts.build': () => ({ kind: 'dispatch', action: 'fonts.build', input: {} }),
  'material.list': () => ({ kind: 'dispatch', action: 'material.list', input: {} }),
};

const NEEDS: Partial<Record<ActionId, string>> = {
  'slide.insert': 'Use the Insert group for a new slide',
  'slide.move': 'Drag a row in the sidebar',
  'slide.update': 'Change a property in the inspector',
  'slide.replace': 'Apply the source drawer',
  'block.set': 'Change a property in the inspector',
  'block.insert': 'Use the Insert group for a new block',
  'block.move': 'Drag the block on the stage',
  'section.set': 'Edit the manifest in the source drawer',
  'asset.add':
    'Drop or paste a picture on the stage, or fill the Add a picture form in the Asset section',
  'asset.dither': 'Use the Dither tool under the asset in the Asset section, or the CLI',
  'asset.capture': 'Needs a URL: `turboslide asset capture <url> --theme both`',
  'material.capture':
    'Insert a Material block and press Capture frame in its section, or use the CLI',
  'version.restore': 'Pick a version in the Versions group',
  'judge.bundle': 'Needs an output directory: use the CLI',
  'import.run': 'Needs a source directory: use the CLI',
};

/** The actions the palette lists: every entry with a label, outside the view and studio groups. */
export function paletteActions(): ActionSpec[] {
  return actionsInOrder().filter(
    (spec) => spec.label !== '' && spec.group !== 'view' && spec.group !== 'studio',
  );
}

function actionEntries(ctx: PaletteContext): PaletteEntry[] {
  return paletteActions().map((spec) => {
    const build = INPUTS[spec.id];
    const run: PaletteRun = build
      ? build(ctx)
      : {
          kind: 'needs',
          action: spec.id,
          reason: NEEDS[spec.id] ?? 'Needs an input the palette cannot build',
        };
    const key = VIEW_KEYS[spec.id];
    return {
      id: `action:${spec.id}`,
      group: 'actions',
      title: spec.label,
      meta: spec.id,
      hint: spec.doc,
      keys: key === undefined ? undefined : key.startsWith('Cmd ') ? cmd(ctx, key.slice(4)) : key,
      icon: spec.mutates ? 'sparkles' : 'document',
      terms: `${spec.id} ${spec.group} ${spec.mcp ?? ''} ${spec.cli?.usage ?? ''}`,
      run,
    };
  });
}

function viewEntries(ctx: PaletteContext): PaletteEntry[] {
  const { view, toggles } = ctx;
  const modes: { mode: ShellMode; label: string; icon: IconName; key: string }[] = [
    { mode: 'slide', label: 'Slide view', icon: 'slide', key: 'Esc' },
    { mode: 'grid', label: 'Grid view', icon: 'grid', key: 'G' },
    { mode: 'book', label: 'Book view', icon: 'book', key: 'B' },
  ];
  const out: PaletteEntry[] = modes.map((entry) => ({
    id: `view:mode:${entry.mode}`,
    group: 'view',
    title: entry.label,
    meta: view.mode === entry.mode ? 'current' : undefined,
    keys: entry.key,
    icon: entry.icon,
    terms: `mode ${entry.mode}`,
    run: { kind: 'dispatch', action: 'view.mode', input: { mode: entry.mode } },
  }));
  out.push({
    id: 'view:theme',
    group: 'view',
    title: view.theme === 'dark' ? 'Light theme' : 'Dark theme',
    keys: 'D',
    icon: 'sparkles',
    terms: 'theme dark light',
    run: {
      kind: 'dispatch',
      action: 'view.theme',
      input: { theme: view.theme === 'dark' ? 'light' : 'dark' },
    },
  });
  out.push({
    id: 'view:edit',
    group: 'view',
    title: view.edit ? 'View only' : 'Edit',
    keys: 'E',
    icon: 'document',
    terms: 'edit view mode',
    run: { kind: 'call', call: toggles.edit },
  });
  out.push({
    id: 'view:twin',
    group: 'view',
    title: view.twin ? 'Close the twin view' : 'Twin view, light and dark',
    keys: 'Shift D',
    icon: 'grid',
    terms: 'twin both themes',
    run: { kind: 'call', call: toggles.twin },
  });
  out.push({
    id: 'view:lint',
    group: 'view',
    title: view.lint ? 'Hide the lint layer' : 'Show the lint layer',
    keys: cmd(ctx, 'L'),
    icon: 'check-badge',
    terms: 'lint findings layer',
    run: { kind: 'call', call: toggles.lint },
  });
  out.push({
    id: 'view:source',
    group: 'view',
    title: view.source ? 'Close the source drawer' : 'Open the source drawer',
    keys: cmd(ctx, '/'),
    icon: 'document',
    terms: 'source json drawer',
    run: { kind: 'call', call: toggles.source },
  });
  out.push({
    id: 'view:present',
    group: 'view',
    title: view.present ? 'Leave presentation mode' : 'Present',
    keys: 'P',
    icon: 'present',
    terms: 'present fullscreen',
    run: { kind: 'dispatch', action: 'view.present', input: { on: !view.present } },
  });
  return out;
}

function versionEntries(ctx: PaletteContext): PaletteEntry[] {
  const versions = ctx.versions ?? [];
  return versions
    .slice(-10)
    .reverse()
    .map((version) => ({
      id: `version:${version.n}`,
      group: 'versions' as const,
      title: version.note === '' ? `Version ${version.n}` : version.note,
      meta: `${authorName(version.author)} · r${version.revision}`,
      hint:
        version.mutations.length === 0
          ? undefined
          : `${version.mutations.length} mutation${version.mutations.length === 1 ? '' : 's'}`,
      icon: 'deck' as const,
      terms: `version ${version.n} ${version.note} ${authorName(version.author)}`,
      run: {
        kind: 'dispatch' as const,
        action: 'version.restore' as const,
        input: { n: version.n, baseRevision: ctx.revision },
      },
    }));
}

/** The entries a view lists (docs/FOCUS.md 3.1): a parked entry only while Tools > Advanced tools is on. */
export function presentPaletteEntries(
  entries: ReadonlyArray<PaletteEntry>,
  ctx: Pick<PaletteContext, 'advancedTools'>,
): PaletteEntry[] {
  return entries.filter((entry) => entry.advanced !== true || ctx.advancedTools === true);
}

/** Every entry of the five groups for a view, in group order; the parked entries only with the switch on. */
export function buildPaletteEntries(ctx: PaletteContext): PaletteEntry[] {
  return presentPaletteEntries(
    [
      ...slideEntries(ctx),
      ...insertEntries(ctx),
      ...actionEntries(ctx),
      ...viewEntries(ctx),
      ...versionEntries(ctx),
    ],
    ctx,
  );
}

export type PaletteQuery = {
  /** the group a prefix restricts to, or null */
  group: PaletteGroupId | null;
  /** the words after the prefix, trimmed and lower-cased */
  needle: string;
};

/** `>lint` restricts to actions, `#` to slides, `+` to blocks and slides to insert (SPEC 6.3). */
export function parsePaletteQuery(query: string): PaletteQuery {
  const trimmed = query.trimStart();
  const first = trimmed.charAt(0);
  const group = PALETTE_GROUPS.find(
    (entry) => entry.prefix !== undefined && entry.prefix === first,
  );
  if (group) return { group: group.id, needle: trimmed.slice(1).trim().toLowerCase() };
  return { group: null, needle: trimmed.trim().toLowerCase() };
}

/** A needle this long or longer never matches as a subsequence (docs/PRODUCT.md 6.1). */
export const SUBSEQUENCE_MAX_NEEDLE = 3;

/**
 * How well a needle matches a haystack: 4 for a prefix of the whole text, 3 for a prefix of a
 * word, 2 for a substring, 1 for a subsequence in order (`ctr` in `content-rule`), 0 for none.
 * The subsequence score holds for needles of three characters or fewer: a seller's "logo"
 * answered "Long dash dot" through it (audit-assist 8; docs/PRODUCT.md 6.1), so a needle of four
 * characters or more matches only as a prefix or a substring of the row's words.
 */
export function matchScore(needle: string, haystack: string): number {
  if (needle === '') return 1;
  const text = haystack.toLowerCase();
  if (text.startsWith(needle)) return 4;
  const at = text.indexOf(needle);
  if (at >= 0) return /[\s\-:./]/.test(text.charAt(at - 1)) ? 3 : 2;
  if (needle.replace(/\s+/g, '').length > SUBSEQUENCE_MAX_NEEDLE) return 0;
  let from = 0;
  for (const char of needle) {
    if (char === ' ') continue;
    const next = text.indexOf(char, from);
    if (next < 0) return 0;
    from = next + 1;
  }
  return 1;
}

export type PaletteGroupRows = { group: PaletteGroup; rows: PaletteEntry[] };

/** The entries that match a query, grouped in the fixed order, best matches first inside a group. */
export function filterPalette(
  entries: ReadonlyArray<PaletteEntry>,
  query: string,
): PaletteGroupRows[] {
  const { group, needle } = parsePaletteQuery(query);
  const scored = entries.flatMap((entry) => {
    if (group !== null && entry.group !== group) return [];
    const score = Math.max(
      matchScore(needle, entry.title),
      needle === '' ? 0 : matchScore(needle, `${entry.title} ${entry.terms ?? ''}`) - 1,
      needle === '' ? 0 : matchScore(needle, entry.meta ?? '') - 1,
    );
    return score > 0 ? [{ entry, score }] : [];
  });
  /* two menu rows with one label and one score list the shallower path first (Insert › Logo
     before Insert › Image › Logo and Format › Image › Replace image › Logo; the features round,
     docs/FEATURES.md 4.3): a menu row's `meta` is its path, one ' › ' per level */
  const depth = (entry: PaletteEntry) => (entry.meta ?? '').split('›').length;
  return PALETTE_GROUPS.flatMap((meta) => {
    const rows = scored
      .filter(({ entry }) => entry.group === meta.id)
      .sort(
        (a, b) => b.score - a.score || (meta.id === 'menus' ? depth(a.entry) - depth(b.entry) : 0),
      )
      .map(({ entry }) => entry);
    return rows.length > 0 ? [{ group: meta, rows }] : [];
  });
}

/** `12 results`, `1 result`, `Nothing matches`. */
export function paletteCount(n: number): string {
  if (n === 0) return 'Nothing matches';
  return `${n} result${n === 1 ? '' : 's'}`;
}

/** The slot names a content slide offers, for the insert hints. */
export function slotNames(slide: Slide): ReadonlyArray<SlotName> {
  return slide.kind === 'content' ? slotsForLayout(slide.layout) : [];
}
