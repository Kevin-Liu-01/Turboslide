import type { Block, BlockType } from '@turboslide/schema/blocks';
import { BLOCK_SCHEMAS } from '@turboslide/schema/blocks';
import { isLineKind } from '@turboslide/schema/shapes';

import type { IconName } from '../icons';
import type { ControlSpec } from './generate';
import { isItemControl } from './sections';

/**
 * Format options (gslides-parity SPEC 3.9; SPEC-2 section 5): the Inspector's generated controls
 * regrouped under Google's section names, in Google's order (R05 B7, F3): Size & rotation,
 * Position, Text fitting, Text, Colour, Picture, Adjustments, Drop shadow, Table, Chart data,
 * Line, Shape, List, Alt text, then the block's own Options. One table names the sections with an
 * icon and a sentence; the two routers send a slide control and a block control to a section, or
 * to none (the fields that leave the panel: the slide's id, tags, section and title override go
 * to Tools > Advanced > Show slide and block ids, the notes to the pane under the canvas, a
 * block's link to Insert > Link; the round two fields the panel draws itself as sections). Pure:
 * no React, no DOM, so `format-sections.test.ts` runs in Node.
 */
export type FormatSectionId =
  | 'size'
  | 'position'
  | 'layout'
  | 'textFitting'
  | 'text'
  | 'colour'
  | 'picture'
  | 'adjustments'
  /** round three (gslides-parity SPEC-3 10.7): the deck's two tone screen over a picture */
  | 'dither'
  | 'shadow'
  | 'table'
  | 'chart'
  | 'line'
  | 'shape'
  | 'list'
  | 'altText'
  /** a grammar block's own fields, under the block's label (no Google section exists) */
  | 'block';

export type FormatSectionMeta = {
  id: FormatSectionId;
  title: string;
  icon: IconName;
  doc: string;
  /**
   * A parked section (docs/FOCUS.md 3.2, 3.3): drawn only while Tools > Advanced tools is on. The
   * Dither and Drop shadow sections belong to parked rows (`format.image.dither`,
   * `format.dropShadow`; docs/RETURN.md 2.15, 3.4 and question 7 of its section 9). The Table,
   * Chart data and Shape sections returned with their features in the return round (RETURN.md 2.2,
   * 2.4, 2.5) and Alt text in the product round (PRODUCT.md section 5). `presentFormatSections`
   * applies the flag.
   */
  advanced?: true;
};

/** The sections in the order the panel shows them (SPEC 3.9, 12 "Panels"; SPEC-2 section 5). */
export const FORMAT_SECTIONS: ReadonlyArray<FormatSectionMeta> = [
  {
    id: 'size',
    title: 'Size & rotation',
    icon: 'arrows-pointing-in',
    doc: 'Width, height, rotation and flip on the slide',
  },
  {
    id: 'position',
    title: 'Position',
    icon: 'move',
    doc: 'The distance from the top left or the centre of the slide',
  },
  { id: 'layout', title: 'Layout', icon: 'columns', doc: 'How this slide arranges its blocks' },
  {
    id: 'textFitting',
    title: 'Text fitting',
    icon: 'arrows-pointing-in',
    doc: 'Autofit, indentation, padding and vertical alignment',
  },
  {
    id: 'text',
    title: 'Text',
    icon: 'text',
    doc: 'Size, weight, alignment, spacing, columns and the selected text’s marks',
  },
  { id: 'colour', title: 'Colour', icon: 'swatch', doc: 'Fill, border and text colour' },
  {
    id: 'picture',
    title: 'Image options',
    icon: 'photo',
    doc: 'The picture, its caption, crop, mask and frame',
  },
  {
    id: 'adjustments',
    title: 'Adjustments',
    icon: 'adjustments',
    doc: 'Transparency, brightness and contrast',
  },
  {
    id: 'dither',
    title: 'Dither',
    icon: 'adjustments',
    doc: 'The deck’s two tone screen over the picture, kept live',
    advanced: true,
  },
  {
    id: 'shadow',
    title: 'Drop shadow',
    icon: 'square-2-stack',
    doc: 'Colour, transparency, angle, distance and blur',
    advanced: true,
  },
  {
    id: 'table',
    title: 'Table',
    icon: 'table',
    doc: 'Header row, columns, fill, border and vertical alignment',
  },
  {
    id: 'chart',
    title: 'Chart data',
    icon: 'chart-bar',
    doc: 'The categories and series of the chart',
  },
  {
    id: 'line',
    title: 'Line',
    icon: 'minus',
    doc: 'The line type, its ends, weight, dash and bend',
  },
  {
    id: 'shape',
    title: 'Shape',
    icon: 'cube',
    doc: 'The shape and its adjustable sides',
  },
  { id: 'list', title: 'List', icon: 'list-bullet', doc: 'The items and how the list draws them' },
  /* Alt text returned to the default view in the product round (docs/PRODUCT.md section 5;
     docs/RETURN.md question 6, default return): an enterprise buyer's deck policy asks for it */
  {
    id: 'altText',
    title: 'Alt text',
    icon: 'information-circle',
    doc: 'The description a screen reader reads',
  },
  { id: 'block', title: 'Options', icon: 'adjustments', doc: 'The block’s own options' },
];

/**
 * The sections a panel draws (docs/FOCUS.md 3.1): every section while Tools > Advanced tools is
 * on, the sections without the `advanced` flag while it is off. Pure, so the panel calls it over
 * whatever block filter it already applies.
 */
export function presentFormatSections(
  sections: ReadonlyArray<FormatSectionMeta>,
  advancedTools: boolean,
): FormatSectionMeta[] {
  return sections.filter((section) => advancedTools || section.advanced !== true);
}

export const FORMAT_SECTION_BY_ID: Readonly<Record<FormatSectionId, FormatSectionMeta>> =
  Object.fromEntries(FORMAT_SECTIONS.map((section) => [section.id, section])) as Record<
    FormatSectionId,
    FormatSectionMeta
  >;

const TEXT_TYPES: ReadonlySet<BlockType> = new Set(['heading', 'paragraph', 'text', 'box']);
const PICTURE_TYPES: ReadonlySet<BlockType> = new Set([
  'shot',
  'pair',
  'tiles',
  'details',
  'icon',
  'picture',
]);
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
  /^(caption|caption size|crop|crop anchor|border|fit|aspect|width|asset|assets|picture|name|size|position)$/i;
/** The round two fields the panel draws as its own sections, never as generated rows (SPEC-2 section 5). */
const OWN_SECTION_PATHS: ReadonlySet<string> = new Set([
  '/pos',
  '/trim',
  '/mask',
  '/adjust',
  '/dither',
  '/frame',
  '/shadow',
  '/autofit',
  '/valign',
  '/padding',
  '/alt',
  '/outline',
  '/dash',
  '/bend',
  '/points',
  '/closed',
  '/lineStart',
  '/lineEnd',
  '/connect',
  '/adjust',
  '/marker',
  '/preset',
  '/kind',
  '/categories',
  '/series',
  '/legend',
  '/numberFormat',
  '/labels',
  '/title',
  '/spans',
  '/cells',
]);

/** Where a slide's own control goes: the layout fields to Layout, the picture to Picture, the rest leave the panel. */
export function formatSectionOfSlideControl(spec: ControlSpec): FormatSectionId | null {
  if (spec.path === '/picture/asset' || spec.group === 'Asset') return 'picture';
  if (spec.path === '/background') return null;
  if (spec.group === 'Slide' || spec.group === 'Text' || spec.group === 'Advanced') return null;
  if (spec.path.startsWith('/layout') || spec.path.startsWith('/plate') || spec.group === 'Layout')
    return 'layout';
  return null;
}

/**
 * Where a block's control goes (SPEC 3.9; SPEC-2 section 5). The position composite is drawn by
 * the panel itself as Size & rotation and Position, so it routes to `size`; the round two fields
 * (`trim`, `mask`, `adjust`, `frame`, `shadow`, `autofit`, `valign`, `padding`, `alt`, the line
 * and chart fields) are drawn by their own sections and route there, so no generated row repeats
 * them; the link leaves (Insert > Link); the ext field leaves.
 */
export function formatSectionOfBlockControl(
  spec: ControlSpec,
  block: Block,
): FormatSectionId | null {
  if (spec.path === '/link' || spec.path === '/ext') return null;
  if (spec.kind === 'position') return 'size';
  if (spec.path === '/alt') return 'altText';
  if (spec.path === '/shadow') return 'shadow';
  if (spec.path === '/dither') return 'dither';
  if (spec.path === '/autofit' || spec.path === '/valign' || spec.path === '/padding')
    return block.type === 'box' && spec.path === '/padding' && block.pos === undefined
      ? 'size'
      : 'textFitting';
  if (spec.path === '/outline') return 'colour';
  if (block.type === 'chart') return 'chart';
  if (block.type === 'shape') {
    if (isLineKind(block.shape)) {
      if (spec.kind === 'typography' || spec.path === '/text') return null;
      return 'line';
    }
    if (spec.path === '/shape' || spec.path === '/adjust') return 'shape';
    if (
      spec.path === '/dash' ||
      spec.path === '/lineStart' ||
      spec.path === '/lineEnd' ||
      spec.path === '/bend' ||
      spec.path === '/points' ||
      spec.path === '/closed' ||
      spec.path === '/connect'
    )
      return 'shape';
  }
  const label = spec.inspector.label;
  if (block.type === 'table') {
    if (spec.kind === 'typography') return 'text';
    return 'table';
  }
  if (block.type === 'material') return 'block';
  if (LIST_TYPES.has(block.type)) {
    if (spec.kind === 'typography') return 'text';
    if (spec.kind === 'color' && !isItemControl(spec)) return 'colour';
    if (block.type === 'plain' && (spec.path === '/marker' || spec.path === '/preset'))
      return 'list';
    return 'list';
  }
  if (spec.kind === 'color') return 'colour';
  if (spec.kind === 'typography') return 'text';
  if (PICTURE_TYPES.has(block.type)) {
    if (spec.path === '/trim' || spec.path === '/mask' || spec.path === '/frame') return 'picture';
    if (spec.path === '/adjust') return 'adjustments';
    if (spec.kind === 'asset' || isItemControl(spec) || PICTURE_FIELDS.test(label) || spec.text)
      return 'picture';
    return 'block';
  }
  if (TEXT_TYPES.has(block.type)) {
    if (spec.text || spec.group === 'Text' || /^(level|role|tone|measure|margin)/i.test(label))
      return 'text';
    if (spec.path === '/dash') return 'colour';
    if (GEOMETRY.test(label)) return 'size';
    return 'block';
  }
  if (block.type === 'shape' || block.type === 'rule') {
    if (spec.path === '/dash') return 'colour';
    if (GEOMETRY.test(label)) return 'size';
    return 'block';
  }
  return 'block';
}

/** True for a path the panel draws inside one of its own sections (no generated row repeats it). */
export function isOwnSectionPath(path: string): boolean {
  return OWN_SECTION_PATHS.has(path);
}

/** True for a block that shows an asset whose description the Alt text section edits as `asset.alt` (SPEC-2 0.51). */
export function hasAltText(block: Block): boolean {
  return PICTURE_TYPES.has(block.type) && block.type !== 'icon';
}

/** True for a block Text fitting applies to (SPEC-2 0.41, 2.1.5): heading, paragraph, text, box and shape. */
export function hasTextFitting(block: Block): boolean {
  return (
    block.type === 'text' ||
    block.type === 'box' ||
    block.type === 'heading' ||
    block.type === 'paragraph' ||
    (block.type === 'shape' && !isLineKind(block.shape))
  );
}

/**
 * True for a block Drop shadow applies to (SPEC-2 2.3.4): the types whose schema carries the
 * `shadow` field (box, shape, text, shot, picture, icon, table and chart), read from the schema so
 * the section appears exactly where `block.shadow` is accepted and follows the schema when a type
 * gains the field. A heading or a paragraph carries none, so the text context menu's Drop shadow
 * row on one opens the panel without the section (VERIFICATION-2 finding 10, VERIFICATION-3
 * finding 16); the schema request that closes it is in build-3/b5.md under Fix round.
 */
export function hasShadow(block: Block): boolean {
  return 'shadow' in BLOCK_SCHEMAS[block.type].shape;
}

/**
 * True for a block the Dither section serves (gslides-parity SPEC-3 10.7; research-3 06 4.7): a shot
 * or a picture object, whose `dither` field is the deck's two tone screen over the picture; an icon
 * has no continuous source to screen.
 */
export function hasDither(block: Block): boolean {
  return block.type === 'shot' || block.type === 'picture';
}

/** True for a block Adjustments applies to (SPEC-2 2.5.3): shot, picture; icon takes transparency only. */
export function hasAdjustments(block: Block): boolean {
  return block.type === 'shot' || block.type === 'picture' || block.type === 'icon';
}

/** True for a block the Picture section serves (SPEC-2 section 5). */
export function hasPicture(block: Block): boolean {
  return (
    block.type === 'shot' ||
    block.type === 'picture' ||
    block.type === 'pair' ||
    block.type === 'tiles' ||
    block.type === 'details'
  );
}
