import type { Block, BlockType } from '@turboslide/schema/blocks';

import type { IconName } from '../icons';
import type { ControlSpec } from './generate';
import { isItemControl } from './sections';

/**
 * Format options (gslides-parity SPEC 3.9): the Inspector's generated controls regrouped under
 * Google's section names. One table names the sections in Google's order with an icon and a
 * sentence; the two routers send a slide control and a block control to a section, or to none
 * (the fields that leave the panel: the slide's id, tags, section and title override go to
 * Tools > Advanced > Show slide and block ids, the notes to the pane under the canvas, a block's
 * link to Insert > Link). Pure: no React, no DOM, so `format-sections.test.ts` runs in Node.
 */
export type FormatSectionId =
  | 'size'
  | 'position'
  | 'layout'
  | 'textFitting'
  | 'text'
  | 'colour'
  | 'picture'
  | 'table'
  | 'list'
  | 'altText'
  /** a grammar block's own fields, under the block's label (no Google section exists) */
  | 'block';

export type FormatSectionMeta = {
  id: FormatSectionId;
  title: string;
  icon: IconName;
  doc: string;
};

/** The sections in the order the panel shows them (SPEC 3.9, 12 "Panels"). */
export const FORMAT_SECTIONS: ReadonlyArray<FormatSectionMeta> = [
  {
    id: 'size',
    title: 'Size & rotation',
    icon: 'arrows-pointing-in',
    doc: 'Width and height on the slide',
  },
  {
    id: 'position',
    title: 'Position',
    icon: 'move',
    doc: 'The distance from the top left of the slide',
  },
  { id: 'layout', title: 'Layout', icon: 'columns', doc: 'How this slide arranges its blocks' },
  {
    id: 'textFitting',
    title: 'Text fitting',
    icon: 'arrows-pointing-in',
    doc: 'Not available in Turboslide yet. Text fitting arrives with autofit',
  },
  {
    id: 'text',
    title: 'Text',
    icon: 'text',
    doc: 'Size, weight, alignment, letter spacing and line height',
  },
  { id: 'colour', title: 'Colour', icon: 'swatch', doc: 'Fill, border and text colour' },
  {
    id: 'picture',
    title: 'Picture',
    icon: 'photo',
    doc: 'The picture, its crop, frame and caption',
  },
  {
    id: 'table',
    title: 'Table',
    icon: 'table',
    doc: 'Header row, columns, fill, border and vertical alignment',
  },
  { id: 'list', title: 'List', icon: 'list-bullet', doc: 'The items and how the list draws them' },
  {
    id: 'altText',
    title: 'Alt text',
    icon: 'information-circle',
    doc: 'The description a screen reader reads',
  },
  { id: 'block', title: 'Options', icon: 'adjustments', doc: 'The block’s own options' },
];

export const FORMAT_SECTION_BY_ID: Readonly<Record<FormatSectionId, FormatSectionMeta>> =
  Object.fromEntries(FORMAT_SECTIONS.map((section) => [section.id, section])) as Record<
    FormatSectionId,
    FormatSectionMeta
  >;

const TEXT_TYPES: ReadonlySet<BlockType> = new Set(['heading', 'paragraph', 'text', 'box']);
const PICTURE_TYPES: ReadonlySet<BlockType> = new Set(['shot', 'pair', 'tiles', 'details', 'icon']);
const LIST_TYPES: ReadonlySet<BlockType> = new Set([
  'rows',
  'plain',
  'refs',
  'say',
  'scales',
  'spec',
  'lang',
  'ladder',
  'swatches',
  'board',
  'matrix',
  'logoPlates',
]);
const GEOMETRY =
  /^(radius|padding|height|length|orientation|arrowheads|width|weight|corner radius|shape)$/i;
const PICTURE_FIELDS =
  /^(caption|caption size|crop|crop anchor|border|fit|aspect|width|asset|assets|picture|name|size)$/i;

/** Where a slide's own control goes: the layout fields to Layout, the picture to Picture, the rest leave the panel. */
export function formatSectionOfSlideControl(spec: ControlSpec): FormatSectionId | null {
  if (spec.path === '/picture/asset' || spec.group === 'Asset') return 'picture';
  if (spec.group === 'Slide' || spec.group === 'Text' || spec.group === 'Advanced') return null;
  if (spec.path.startsWith('/layout') || spec.path.startsWith('/plate') || spec.group === 'Layout')
    return 'layout';
  return null;
}

/**
 * Where a block's control goes (SPEC 3.9). The position composite is drawn by the panel itself
 * as Size & rotation and Position, so it routes to `size`; the link leaves (Insert > Link); the
 * ext field leaves.
 */
export function formatSectionOfBlockControl(
  spec: ControlSpec,
  block: Block,
): FormatSectionId | null {
  if (spec.path === '/link' || spec.path === '/ext') return null;
  if (spec.kind === 'position') return 'size';
  const label = spec.inspector.label;
  if (block.type === 'table') return spec.kind === 'typography' ? 'text' : 'table';
  if (block.type === 'material') return 'block';
  if (LIST_TYPES.has(block.type)) {
    if (spec.kind === 'typography') return 'text';
    if (spec.kind === 'color' && !isItemControl(spec)) return 'colour';
    return 'list';
  }
  if (spec.kind === 'color') return 'colour';
  if (spec.kind === 'typography') return 'text';
  if (PICTURE_TYPES.has(block.type)) {
    if (spec.kind === 'asset' || isItemControl(spec) || PICTURE_FIELDS.test(label) || spec.text)
      return 'picture';
    return 'block';
  }
  if (TEXT_TYPES.has(block.type)) {
    if (spec.text || spec.group === 'Text' || /^(level|role|tone|measure|margin)/i.test(label))
      return 'text';
    if (GEOMETRY.test(label)) return 'size';
    return 'block';
  }
  if (block.type === 'shape' || block.type === 'rule') {
    if (GEOMETRY.test(label)) return 'size';
    return 'block';
  }
  return 'block';
}

/** True for a block whose picture carries alt text the Alt text section edits. */
export function hasAltText(block: Block): boolean {
  return PICTURE_TYPES.has(block.type);
}

/** True for a block Text fitting would apply to (SPEC 3.9: text and box), drawn as the Later row. */
export function hasTextFitting(block: Block): boolean {
  return block.type === 'text' || block.type === 'box';
}
