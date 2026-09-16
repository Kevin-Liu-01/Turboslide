// The inspector's sections (SPEC 6.5; Kevin, 2026-09-11: "make the right sidebar much more
// intuitive and clear and better with icons"): one table naming every section with its icon and
// its one-sentence doc, the routing that sends a generated control to its section, and the icons
// a control row and a block header draw. Pure: no React, no DOM, so the routing is unit tested
// in Node and Inspector.tsx only draws what this module decides.
import type { BlockType } from '@turboslide/schema/blocks';
import type { SlideKind } from '@turboslide/schema/deck';

import type { IconName } from '../icons';
import type { ControlSpec } from './generate';

export type SectionId =
  | 'slide'
  | 'layout'
  | 'block'
  | 'text'
  | 'color'
  | 'position'
  | 'asset'
  | 'material'
  | 'dither'
  | 'lint'
  | 'versions'
  | 'history'
  | 'tokens';

export type SectionMeta = {
  id: SectionId;
  title: string;
  icon: IconName;
  /** one sentence for the header's tooltip */
  doc: string;
};

/** The sections in the order the panel shows them. */
export const SECTIONS: ReadonlyArray<SectionMeta> = [
  {
    id: 'slide',
    title: 'Slide',
    icon: 'slide',
    doc: 'The slide’s own fields: kind, section, title, notes and the texts it carries outside blocks.',
  },
  {
    id: 'layout',
    title: 'Layout',
    icon: 'columns',
    doc: 'The layout type and its options: ratio, gaps, head and body alignment, the plate and the picture.',
  },
  {
    id: 'block',
    title: 'Block',
    icon: 'grid',
    doc: 'The selected block: its type, its id and its own properties.',
  },
  {
    id: 'text',
    title: 'Text',
    icon: 'text',
    doc: 'The block’s text and typography: size from the ladder, weight, alignment, tracking and leading.',
  },
  {
    id: 'color',
    title: 'Color',
    icon: 'swatch',
    doc: 'Fill, stroke and text colors from the theme tokens and the semantic palette, or a custom hex.',
  },
  {
    id: 'position',
    title: 'Position and size',
    icon: 'move',
    doc: 'The block’s box on the 1600 by 900 sheet, snapped to the 8 px grid, the rails and the seams.',
  },
  {
    id: 'asset',
    title: 'Asset',
    icon: 'photo',
    doc: 'The pictures the slide or the block references: twins, credit, license, and a form to add one.',
  },
  {
    id: 'material',
    title: 'Material',
    icon: 'beaker',
    doc: 'The shader recipe of a material block or picture: preset, uniforms, anchor, two-tone and plate.',
  },
  {
    id: 'dither',
    title: 'Dither',
    icon: 'adjustments',
    doc: 'The two-tone treatment of a picture with its live preview and plate metrics.',
  },
  {
    id: 'lint',
    title: 'Lint',
    icon: 'check-badge',
    doc: 'This slide’s findings from the same linter the CLI runs; Fix applies a mechanical fix.',
  },
  {
    id: 'versions',
    title: 'Versions',
    icon: 'clock',
    doc: 'Named versions with author and revision; Restore is a mutation, so it is undoable.',
  },
  {
    id: 'history',
    title: 'History',
    icon: 'archive',
    doc: 'The mutation log, newest last, with Undo to here.',
  },
  {
    id: 'tokens',
    title: 'Deck tokens',
    icon: 'tag',
    doc: 'The deck’s nine theme tokens, read only.',
  },
];

export const SECTION_BY_ID: Readonly<Record<SectionId, SectionMeta>> = Object.fromEntries(
  SECTIONS.map((section) => [section.id, section]),
) as Record<SectionId, SectionMeta>;

/** The sections closed on a first visit; the reader's choice persists under ts-inspector-sections. */
export const CLOSED_BY_DEFAULT: ReadonlySet<SectionId> = new Set(['history', 'tokens']);

/** The storage key for the collapsed sections. */
export const SECTIONS_STORAGE_KEY = 'ts-inspector-sections';

/** Where a slide's own control goes: Slide (its fields and texts), Asset (its picture), else Layout. */
export function sectionOfSlideControl(spec: ControlSpec): SectionId {
  if (spec.group === 'Asset') return 'asset';
  if (spec.group === 'Slide' || spec.group === 'Text' || spec.group === 'Advanced') return 'slide';
  return 'layout';
}

/** True for a control inside an array item (`/items/0/key`): it stays with its item's rows. */
export function isItemControl(spec: ControlSpec): boolean {
  return /\/\d+(\/|$)/.test(spec.path);
}

/**
 * Where a block's control goes: color fields to Color, the position box to Position and size,
 * text and typography to Text, asset references to Asset, everything else (the block's own
 * options, its spacing, and every field of an array item, which stays under its item's header)
 * to Block.
 */
export function sectionOfBlockControl(spec: ControlSpec): SectionId {
  if (isItemControl(spec)) return 'block';
  if (spec.kind === 'color') return 'color';
  if (spec.kind === 'position') return 'position';
  if (spec.kind === 'typography' || spec.group === 'Text' || spec.text) return 'text';
  if (spec.kind === 'asset' || spec.group === 'Asset') return 'asset';
  return 'block';
}

/* icons by the property label, ahead of the kind */
const LABEL_ICONS: ReadonlyArray<[RegExp, IconName]> = [
  [/^(size|weight|tracking|leading|level|role|measure)/i, 'language'],
  [/^align|^body alignment|^head$/i, 'text'],
  [/^(ratio|gap|type|columns|tracks|plate)/i, 'columns'],
  [/^(margin|height|length|padding|max|min|min row height|z order|width)/i, 'sync'],
  [/^(corner radius|radius)/i, 'box'],
  [/^stroke width$/i, 'minus'],
  [/^orientation/i, 'swap'],
  [/^arrowheads/i, 'arrow-right'],
  [/^shape$/i, 'cube'],
  [/^notes?$/i, 'document'],
  [/^tags?$/i, 'tag'],
  [/^(id|section)$/i, 'tag'],
  [/^(alt|caption|credit|title|heading|lead|big|name|quote|note|key|value|text|sample)/i, 'text'],
  [/^(fit|position|anchor)$/i, 'move'],
];

/** The 16px glyph a control row draws before its label. */
export function controlIcon(spec: ControlSpec): IconName {
  switch (spec.kind) {
    case 'color':
      return 'swatch';
    case 'typography':
      return 'language';
    case 'position':
      return 'move';
    case 'asset':
      return 'photo';
    case 'icon':
      return 'sparkles';
    case 'json':
      return 'code';
    case 'readonly':
      return 'tag';
    default:
      break;
  }
  const label = spec.inspector.label;
  for (const [pattern, icon] of LABEL_ICONS) if (pattern.test(label)) return icon;
  switch (spec.kind) {
    case 'check':
      return 'check-circle';
    case 'seg':
    case 'select':
      return 'adjustments';
    case 'stepper':
    case 'number':
      return 'sync';
    case 'text':
    case 'textarea':
      return 'text';
  }
}

/** The glyph a block type draws in its header, in the block list and in the palette rows. */
export const BLOCK_ICONS: Readonly<Record<BlockType, IconName>> = {
  heading: 'text',
  paragraph: 'document',
  credit: 'document',
  rows: 'table',
  plain: 'index',
  refs: 'book',
  say: 'chat',
  scales: 'adjustments',
  spec: 'language',
  lang: 'language',
  ladder: 'language',
  swatches: 'swatch',
  shot: 'photo',
  pair: 'grid',
  tiles: 'grid',
  details: 'grid',
  board: 'table',
  composite: 'columns',
  panel: 'code',
  dia: 'cube',
  dither: 'adjustments',
  mark: 'star',
  markSizes: 'star',
  matrix: 'table',
  logoPlates: 'grid',
  material: 'beaker',
  table: 'table',
  chart: 'chart-bar',
  picture: 'photo',
  box: 'box',
  shape: 'cube',
  rule: 'minus',
  text: 'pencil',
  icon: 'sparkles',
  /* round five (gslides-parity SPEC-5 1.2): the three new block types; the glyphs are placeholders until B2 and B6 name theirs */
  media: 'play',
  spotlight: 'user-group',
  equation: 'code',
  html: 'code',
};

/** The glyph a slide kind draws in the palette and the Slide section head. */
export const KIND_ICONS: Readonly<Record<SlideKind, IconName>> = {
  content: 'document',
  opener: 'deck',
  mood: 'photo',
  closing: 'check-badge',
  title: 'sparkles',
  statement: 'chat',
};

/** True for a section whose state is saved and read back as a map of id to closed. */
export function isSectionId(value: string): value is SectionId {
  return Object.prototype.hasOwnProperty.call(SECTION_BY_ID, value);
}

/** The closed set read from storage, or the default when nothing valid is saved. */
export function readClosedSections(saved: string | null): ReadonlySet<SectionId> {
  if (saved === null) return CLOSED_BY_DEFAULT;
  try {
    const parsed: unknown = JSON.parse(saved);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
      return CLOSED_BY_DEFAULT;
    const closed = new Set<SectionId>();
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (value === true && isSectionId(id)) closed.add(id);
    }
    return closed;
  } catch {
    return CLOSED_BY_DEFAULT;
  }
}

/** The map written to storage: every closed section true. */
export function writeClosedSections(closed: ReadonlySet<SectionId>): string {
  return JSON.stringify(Object.fromEntries([...closed].map((id) => [id, true])));
}
