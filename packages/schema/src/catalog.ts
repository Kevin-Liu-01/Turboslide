// The block catalog (MILESTONES M1 item 3): one entry per block type with its label, its grammar
// source, where it may sit, which of its fields are Text (so the validator canonicalizes them, the
// copy rules read them and the renderer stamps data-run paths), which fields reference assets and
// icons, how it exports, and a default instance for the palette. The slide kinds and layouts are
// catalogued the same way. docs/grammar.md is generated from this file and from rules.ts.
import type { z } from 'zod';
import type { Block, BlockType } from './blocks.ts';
import { BLOCK_SCHEMAS } from './blocks.ts';
import type { LayoutType, PlateSide, SlideKind, SlotName } from './deck.ts';
import { SLIDE_SCHEMAS } from './deck.ts';
import type { BlockId } from './ids.ts';

export type BlockGroup =
  'text' | 'list' | 'figure' | 'diagram' | 'specimen' | 'mark' | 'primitive' | 'escape';

/** A pointer template relative to the block; `*` stands for any array index. */
export type PathTemplate = string;

export type BlockCatalogEntry = {
  type: BlockType;
  label: string;
  group: BlockGroup;
  /** One sentence in the grammar's terms. */
  doc: string;
  /** The deck class or slide it comes from. */
  source: string;
  /** 'content' for the slots of a content slide, 'plate' for a full-picture plate. */
  allowedIn: ReadonlyArray<'content' | 'plate'>;
  /** Fields in the four-rule markup (SPEC 4.2 "Text"). */
  textPaths: ReadonlyArray<PathTemplate>;
  /**
   * The Text fields that take paragraph breaks (multilineTextSchema, gslides-parity SPEC 7.4):
   * paragraph.text, text.text, box.text and the table cells; a subset of textPaths.
   */
  multilineTextPaths?: ReadonlyArray<PathTemplate>;
  /** Fields that hold an AssetId. */
  assetPaths: ReadonlyArray<PathTemplate>;
  /** Fields that hold an Icon. */
  iconPaths: ReadonlyArray<PathTemplate>;
  /** How the block leaves for PPTX and Slides in native mode (SPEC 8.6). */
  export: 'native' | 'raster' | 'mixed';
  /** The Zod object schema, for the inspector and the JSON Schema. */
  schema: z.ZodType;
  /** A valid instance with the given id, for the palette's insert. */
  make: (id: BlockId) => Block;
};

function entry(spec: Omit<BlockCatalogEntry, 'schema'>): BlockCatalogEntry {
  return { ...spec, schema: BLOCK_SCHEMAS[spec.type] };
}

export const CATALOG: Readonly<Record<BlockType, BlockCatalogEntry>> = {
  heading: entry({
    type: 'heading',
    label: 'Heading',
    group: 'text',
    doc: 'A display line at h1 88 px, h2 44 px, big 72 px or the mood plate title 44 px, weight 500, no trailing period.',
    source: 'head:58-61; DECK-GRAMMAR.md:20-22',
    allowedIn: ['content', 'plate'],
    textPaths: ['/text'],
    assetPaths: [],
    iconPaths: [],
    export: 'native',
    make: (id) => ({ id, type: 'heading', level: 'h2', text: 'Heading' }),
  }),
  paragraph: entry({
    type: 'paragraph',
    label: 'Paragraph',
    group: 'text',
    doc: 'Body copy at 22 px on 1.5, lead 26 px, cap 15 px titanium; measure caps at 32ch or 56ch.',
    source: 'head:62-68',
    allowedIn: ['content', 'plate'],
    textPaths: ['/text'],
    multilineTextPaths: ['/text'],
    assetPaths: [],
    iconPaths: [],
    export: 'native',
    make: (id) => ({ id, type: 'paragraph', text: 'Paragraph.', measure: 56 }),
  }),
  credit: entry({
    type: 'credit',
    label: 'Credit',
    group: 'text',
    doc: 'The 15 px titanium credit line on a plate; required when the picture is share-alike.',
    source: 'OPENERS.md:255; slide 06',
    allowedIn: ['plate'],
    textPaths: ['/text'],
    assetPaths: [],
    iconPaths: [],
    export: 'native',
    make: (id) => ({ id, type: 'credit', text: 'Image: source, year, license' }),
  }),
  rows: entry({
    type: 'rows',
    label: 'Ruled rows',
    group: 'list',
    doc: 'A ruled key and value table at 20 px; the key column snaps to the deck set, values run two lines at most.',
    source: 'head:96-101; DECK-GRAMMAR.md:36',
    allowedIn: ['content'],
    textPaths: ['/items/*/key', '/items/*/value'],
    assetPaths: [],
    iconPaths: ['/items/*/icon'],
    export: 'native',
    make: (id) => ({ id, type: 'rows', key: 240, items: [{ key: 'Key', value: 'Value.' }] }),
  }),
  plain: entry({
    type: 'plain',
    label: 'Ruled statement list',
    group: 'list',
    doc: 'Statements as ruled rows at 24 px display weight 500, never bullets; a struck row is excluded.',
    source: 'head:102-105; DECK-GRAMMAR.md:38',
    allowedIn: ['content'],
    textPaths: ['/items/*/text'],
    assetPaths: [],
    iconPaths: ['/items/*/icon'],
    export: 'native',
    make: (id) => ({ id, type: 'plain', items: [{ text: 'A statement' }] }),
  }),
  refs: entry({
    type: 'refs',
    label: 'References',
    group: 'list',
    doc: 'A two-column reference list at 20 px with soft rules.',
    source: 'head:106-107',
    allowedIn: ['content'],
    textPaths: ['/items/*'],
    assetPaths: [],
    iconPaths: [],
    export: 'native',
    make: (id) => ({ id, type: 'refs', items: ['Reference'] }),
  }),
  say: entry({
    type: 'say',
    label: 'Two registers',
    group: 'list',
    doc: 'Two quoted registers side by side at 34 px display, each with a 15 px note; a struck quote is the rejected register.',
    source: 'head:164-168; slide 12',
    allowedIn: ['content'],
    textPaths: ['/items/*/quote', '/items/*/note'],
    assetPaths: [],
    iconPaths: [],
    export: 'native',
    make: (id) => ({
      id,
      type: 'say',
      items: [{ quote: 'Say this' }, { quote: 'Not this', no: true }],
    }),
  }),
  scales: entry({
    type: 'scales',
    label: 'Scales',
    group: 'diagram',
    doc: 'Slider rows: a 150 px label, a hairline track with an 11 px square marker, a 150 px label; the marker is derived from the value.',
    source: 'head:123-129; slide 11',
    allowedIn: ['content'],
    textPaths: ['/items/*/left', '/items/*/right'],
    assetPaths: [],
    iconPaths: [],
    export: 'native',
    make: (id) => ({ id, type: 'scales', items: [{ left: 'Left', right: 'Right', value: 50 }] }),
  }),
  spec: entry({
    type: 'spec',
    label: 'Type specimen',
    group: 'specimen',
    doc: 'Inter at 58 px in the listed weights with a 90 px weight column; the one place weight passes 500.',
    source: 'head:132-134; slide 19',
    allowedIn: ['content'],
    textPaths: ['/textRow'],
    assetPaths: [],
    iconPaths: [],
    export: 'native',
    make: (id) => ({ id, type: 'spec', weights: [300, 400, 500, 600, 700, 800], sample: 'Inter' }),
  }),
  lang: entry({
    type: 'lang',
    label: 'Scripts',
    group: 'specimen',
    doc: 'A two-column multilingual grid at 34 px with 14 px script labels; CJK, Arabic and Indic rows take their system stacks.',
    source: 'head:135-140; slide 20',
    allowedIn: ['content'],
    textPaths: [],
    assetPaths: [],
    iconPaths: [],
    export: 'native',
    make: (id) => ({
      id,
      type: 'lang',
      items: [{ script: 'latin', text: 'Every product in every language.', label: 'English' }],
    }),
  }),
  ladder: entry({
    type: 'ladder',
    label: 'Type ladder',
    group: 'specimen',
    doc: 'One sample line per size with a right-aligned 14 px label in a 200 or 320 px column.',
    source: 'head:142-144; slide 21',
    allowedIn: ['content'],
    textPaths: [],
    assetPaths: [],
    iconPaths: [],
    export: 'native',
    make: (id) => ({ id, type: 'ladder', rows: [{ size: 42, label: 'heading 2.25rem / 1.18' }] }),
  }),
  swatches: entry({
    type: 'swatches',
    label: 'Swatches',
    group: 'specimen',
    doc: 'Five color plates at 190 px with a 20 px name and a 15 px value; the fixed plate colors are a sanctioned exception.',
    source: 'head:147-154; slide 18',
    allowedIn: ['content'],
    textPaths: [],
    assetPaths: [],
    iconPaths: [],
    export: 'native',
    make: (id) => ({
      id,
      type: 'swatches',
      items: [{ name: 'Ink', value: '#070707', plate: 'ink' }],
    }),
  }),
  shot: entry({
    type: 'shot',
    label: 'Screenshot',
    group: 'figure',
    doc: 'One bordered capture with a light and dark twin and an optional caption at 16 or 15 px.',
    source: 'head:88-90; DECK-GRAMMAR.md:56',
    allowedIn: ['content'],
    textPaths: ['/caption'],
    assetPaths: ['/asset'],
    iconPaths: [],
    export: 'mixed',
    make: (id) => ({ id, type: 'shot', asset: 'asset-id', fit: 'width' }),
  }),
  pair: entry({
    type: 'pair',
    label: 'Pair',
    group: 'figure',
    doc: 'Two figures side by side with captions; equal gaps are a lint.',
    source: 'head:91-94; DECK-GRAMMAR.md:61',
    allowedIn: ['content'],
    textPaths: ['/figures/*/caption'],
    assetPaths: ['/figures/*/assets/*'],
    iconPaths: [],
    export: 'mixed',
    make: (id) => ({
      id,
      type: 'pair',
      figures: [{ assets: ['asset-a'] }, { assets: ['asset-b'] }],
    }),
  }),
  tiles: entry({
    type: 'tiles',
    label: 'Tile grid',
    group: 'figure',
    doc: 'A grid of 4 to 6 captured tiles at one aspect with 15 or 20 px labels and an optional closing line.',
    source: 'slides 49, 69',
    allowedIn: ['content'],
    textPaths: ['/items/*/label', '/items/*/sub', '/more'],
    assetPaths: ['/items/*/asset'],
    iconPaths: [],
    export: 'mixed',
    make: (id) => ({ id, type: 'tiles', columns: 4, aspect: '16/9', items: [{ label: 'Tile' }] }),
  }),
  details: entry({
    type: 'details',
    label: 'Detail grid',
    group: 'figure',
    doc: 'Three 425 px columns of 2x crops with 15 px captions; row heights are set per row.',
    source: 'slides 38, 39, 65',
    allowedIn: ['content'],
    textPaths: ['/items/*/caption'],
    assetPaths: ['/items/*/asset'],
    iconPaths: [],
    export: 'mixed',
    make: (id) => ({ id, type: 'details', columns: 3, items: [{ asset: 'asset-id' }] }),
  }),
  board: entry({
    type: 'board',
    label: 'Status board',
    group: 'list',
    doc: 'One ruled row per surface: a 128 by 72 capture, the name and address, the state with its icon, a note.',
    source: 'slide 80',
    allowedIn: ['content'],
    textPaths: ['/rows/*/name', '/rows/*/note'],
    assetPaths: ['/rows/*/asset'],
    iconPaths: ['/rows/*/state'],
    export: 'mixed',
    make: (id) => ({
      id,
      type: 'board',
      columns: [128, 250, 200, 'fr'],
      rows: [{ name: 'Surface', state: { name: 'check-circle', color: 'ok' }, note: 'Live.' }],
    }),
  }),
  composite: entry({
    type: 'composite',
    label: 'Composite figure',
    group: 'figure',
    doc: 'A declared grid of cells holding blocks; M5 retires the last html escapes with it.',
    source: 'SPEC 4.2',
    allowedIn: ['content'],
    textPaths: [],
    assetPaths: [],
    iconPaths: [],
    export: 'mixed',
    make: (id) => ({
      id,
      type: 'composite',
      tracks: '1fr 1fr',
      cells: [{ blocks: [] }, { blocks: [] }],
    }),
  }),
  panel: entry({
    type: 'panel',
    label: 'Code panel',
    group: 'text',
    doc: 'Code on the #101010 panel in white monospace at 17 or 15 px on 1.7; the one string where \\n is honored.',
    source: 'head:171-172; DECK-GRAMMAR.md:31',
    allowedIn: ['content'],
    textPaths: [],
    assetPaths: [],
    iconPaths: [],
    export: 'native',
    make: (id) => ({ id, type: 'panel', code: 'npx gt init' }),
  }),
  dia: entry({
    type: 'dia',
    label: 'Diagram',
    group: 'diagram',
    doc: 'An inline SVG with 1 or 1.5 px strokes in ink, mid or hair, fills only ink, paper or plate, 11 px markers, labels 12 px clear of lines.',
    source: 'head:156-160; DECK-GRAMMAR.md:44-46',
    allowedIn: ['content'],
    textPaths: [],
    assetPaths: [],
    iconPaths: ['/data/icons/*'],
    export: 'raster',
    make: (id) => ({
      id,
      type: 'dia',
      fit: 'slot',
      alt: 'Diagram',
      data: { w: 627, h: 300, lines: [], rects: [], markers: [], texts: [], icons: [], marks: [] },
    }),
  }),
  dither: entry({
    type: 'dither',
    label: 'Dither ramp',
    group: 'diagram',
    doc: 'The live 220 px ramp canvas drawn with the 8 by 8 Bayer screen from ink to paper.',
    source: 'head:162; tail:104-114; slide 26',
    allowedIn: ['content'],
    textPaths: [],
    assetPaths: [],
    iconPaths: [],
    export: 'raster',
    make: (id) => ({
      id,
      type: 'dither',
      height: 220,
      ramp: 'linear-x',
      alt: 'A ramp from solid ink to sparse dots',
    }),
  }),
  mark: entry({
    type: 'mark',
    label: 'Mark',
    group: 'mark',
    doc: 'The standalone GT mark at a stated size; the symbol is 1213 by 771.',
    source: 'head:463; slide 02',
    allowedIn: ['content', 'plate'],
    textPaths: [],
    assetPaths: [],
    iconPaths: [],
    export: 'raster',
    make: (id) => ({ id, type: 'mark', w: 132, h: 84 }),
  }),
  markSizes: entry({
    type: 'markSizes',
    label: 'Mark sizes',
    group: 'mark',
    doc: 'The compression specimen: the mark at 16, 32, 64, 128 and 256 px over ruled 16 px labels.',
    source: 'slide 17',
    allowedIn: ['content'],
    textPaths: [],
    assetPaths: [],
    iconPaths: [],
    export: 'raster',
    make: (id) => ({ id, type: 'markSizes', sizes: [16, 32, 64, 128, 256] }),
  }),
  matrix: entry({
    type: 'matrix',
    label: 'Matrix',
    group: 'diagram',
    doc: 'A ruled table of numerals at 22 px tabular, the 4 by 4 Bayer threshold matrix.',
    source: 'slide 26',
    allowedIn: ['content'],
    textPaths: ['/caption'],
    assetPaths: [],
    iconPaths: [],
    export: 'native',
    make: (id) => ({
      id,
      type: 'matrix',
      cells: [
        [0, 8, 2, 10],
        [12, 4, 14, 6],
        [3, 11, 1, 9],
        [15, 7, 13, 5],
      ],
    }),
  }),
  logoPlates: entry({
    type: 'logoPlates',
    label: 'Logo plates',
    group: 'figure',
    doc: 'Fixed-white 150 by 90 plates for external logos with 15 px names; the one sanctioned fixed color outside swatches and the panel.',
    source: 'slide 14; report 03 section 11 item 13',
    allowedIn: ['content'],
    textPaths: ['/items/*/name'],
    assetPaths: ['/items/*/asset'],
    iconPaths: [],
    export: 'mixed',
    make: (id) => ({ id, type: 'logoPlates', items: [{ asset: 'logo-id', name: 'Name' }] }),
  }),
  material: entry({
    type: 'material',
    label: 'Material',
    group: 'figure',
    doc: 'A shader material as a recipe (catalog id, preset, uniforms, frame anchor, two-tone, plate); material.capture freezes it into a frame asset the block shows, and the editor mounts the live shader over it.',
    source: 'SPEC 5.3, 5.4; OPENERS.md "Shader pipeline"',
    allowedIn: ['content'],
    textPaths: ['/caption'],
    assetPaths: ['/asset'],
    iconPaths: [],
    export: 'raster',
    make: (id) => ({
      id,
      type: 'material',
      materialId: 'paper:gem-smoke',
      preset: 'brand-blue',
      anchor: 5500,
      alt: 'The gem smoke material in the brand blue',
    }),
  }),
  box: entry({
    type: 'box',
    label: 'Box',
    group: 'primitive',
    doc: 'A bordered box with an optional text inside: fill, stroke and text color from the palette, a corner radius and padding; a hairline outline unless set.',
    source: 'docs/freeform.md',
    allowedIn: ['content'],
    textPaths: ['/text'],
    multilineTextPaths: ['/text'],
    assetPaths: [],
    iconPaths: [],
    export: 'native',
    make: (id) => ({ id, type: 'box', stroke: 'hair', padding: 16, text: 'A box.' }),
  }),
  shape: entry({
    type: 'shape',
    label: 'Shape',
    group: 'primitive',
    doc: 'A rectangle, rounded rectangle, ellipse, line or arrow filling its box, with palette fill and stroke, a stroke width and filled 8 px arrowheads.',
    source: 'docs/freeform.md',
    allowedIn: ['content'],
    textPaths: [],
    assetPaths: [],
    iconPaths: [],
    export: 'native',
    make: (id) => ({ id, type: 'shape', shape: 'rectangle', stroke: 'hair' }),
  }),
  rule: entry({
    type: 'rule',
    label: 'Rule',
    group: 'primitive',
    doc: 'A horizontal or vertical hairline in a palette color at 1, 1.5 or 2 px; the slot width in a flow layout, its box on a freeform slide.',
    source: 'DECK-GRAMMAR.md:15; docs/freeform.md',
    allowedIn: ['content'],
    textPaths: [],
    assetPaths: [],
    iconPaths: [],
    export: 'native',
    make: (id) => ({ id, type: 'rule', orientation: 'horizontal' }),
  }),
  text: entry({
    type: 'text',
    label: 'Text box',
    group: 'primitive',
    doc: 'One Text in the four-rule markup with typography (size, weight, align, tracking, leading) and a palette color over the body defaults of 22 px on 1.5.',
    source: 'head:62; docs/freeform.md',
    allowedIn: ['content', 'plate'],
    textPaths: ['/text'],
    multilineTextPaths: ['/text'],
    assetPaths: [],
    iconPaths: [],
    export: 'native',
    make: (id) => ({ id, type: 'text', text: 'Text.' }),
  }),
  icon: entry({
    type: 'icon',
    label: 'Icon',
    group: 'primitive',
    doc: 'One sprite glyph on its own at 16 to 96 px in a palette color; the semantic hues stay on icons (DECK-GRAMMAR.md:30, 40).',
    source: 'DECK-GRAMMAR.md:40; docs/freeform.md',
    allowedIn: ['content'],
    textPaths: [],
    assetPaths: [],
    iconPaths: [],
    export: 'raster',
    make: (id) => ({ id, type: 'icon', name: 'check-circle', size: 24 }),
  }),
  table: entry({
    type: 'table',
    label: 'Table',
    group: 'list',
    doc: 'A grid of Text cells in the .rows idiom: a hairline above, a rule under every row, the header row at display weight 500 with an ink rule, tabular numerals, text alignment per column; at most 20 by 20.',
    source: 'gslides-parity SPEC 7.3; R11 A1, A8',
    allowedIn: ['content'],
    textPaths: ['/rows/*/cells/*'],
    multilineTextPaths: ['/rows/*/cells/*'],
    assetPaths: [],
    iconPaths: [],
    export: 'native',
    make: (id) => ({
      id,
      type: 'table',
      columns: [{}, {}, {}],
      rows: [
        { cells: ['', '', ''], header: true },
        { cells: ['', '', ''] },
        { cells: ['', '', ''] },
        { cells: ['', '', ''] },
      ],
    }),
  }),
  html: entry({
    type: 'html',
    label: 'HTML escape',
    group: 'escape',
    doc: 'Scoped CSS and HTML the grammar cannot express; flagged by lint, raster on export.',
    source: 'SPEC 1; report 05 section 9 item 1',
    allowedIn: ['content', 'plate'],
    textPaths: [],
    assetPaths: [],
    iconPaths: [],
    export: 'raster',
    make: (id) => ({
      id,
      type: 'html',
      css: '',
      html: '',
      note: 'Why the grammar cannot express this.',
    }),
  }),
};

export const BLOCK_GROUPS: ReadonlyArray<{ id: BlockGroup; label: string }> = [
  { id: 'text', label: 'Text' },
  { id: 'list', label: 'Ruled lists' },
  { id: 'figure', label: 'Figures' },
  { id: 'diagram', label: 'Diagrams' },
  { id: 'specimen', label: 'Specimens' },
  { id: 'mark', label: 'The mark' },
  { id: 'primitive', label: 'Primitives' },
  { id: 'escape', label: 'Escape' },
];

export type SlideKindCatalogEntry = {
  kind: SlideKind;
  label: string;
  doc: string;
  source: string;
  /** For the full-picture kinds. */
  plate?: { side: PlateSide; maxWidth: 740 | 560 | 720; titleSize?: 44 };
  /** Text fields on the slide itself, outside blocks. */
  textPaths: ReadonlyArray<PathTemplate>;
  schema: z.ZodType;
};

export const SLIDE_KIND_CATALOG: Readonly<Record<SlideKind, SlideKindCatalogEntry>> = {
  content: {
    kind: 'content',
    label: 'Content',
    doc: 'A layout with typed blocks in its slots.',
    source: 'DECK-GRAMMAR.md:33-40',
    textPaths: [],
    schema: SLIDE_SCHEMAS.content,
  },
  opener: {
    kind: 'opener',
    label: 'Section opener',
    doc: 'A full-bleed two-tone picture with the plate lower left at 740 px: the section title, one sentence listing the section’s slide families in order, the credit.',
    source: 'DECK-GRAMMAR.md:6; OPENERS.md:41-47',
    plate: { side: 'lower-left', maxWidth: 740 },
    textPaths: [],
    schema: SLIDE_SCHEMAS.opener,
  },
  mood: {
    kind: 'mood',
    label: 'Mood',
    doc: 'A full-bleed dithered photograph with the plate lower right at 560 px: the picture’s title at 44 px, one or two sentences on why it is in the deck, the credit. A mood slide follows a dense content slide and never sits directly before an opener.',
    source: 'DECK-GRAMMAR.md:6; OPENERS.md:137, 151-156',
    plate: { side: 'lower-right', maxWidth: 560, titleSize: 44 },
    textPaths: [],
    schema: SLIDE_SCHEMAS.mood,
  },
  closing: {
    kind: 'closing',
    label: 'Closing',
    doc: 'The deck closes as it opens: a two-tone render behind a plate upper left at 720 px carrying the mark, the thesis and the three domains.',
    source: 'slide 85',
    plate: { side: 'upper-left', maxWidth: 720 },
    textPaths: [],
    schema: SLIDE_SCHEMAS.closing,
  },
  title: {
    kind: 'title',
    label: 'Title',
    doc: 'The mark at 132 by 84, the h1 and a muted lead, left and vertically centered.',
    source: 'slide 02',
    textPaths: ['/heading', '/lead'],
    schema: SLIDE_SCHEMAS.title,
  },
  statement: {
    kind: 'statement',
    label: 'Statement',
    doc: 'One centered big line at 72 px with a measure in ch.',
    source: 'slide 03',
    textPaths: ['/big'],
    schema: SLIDE_SCHEMAS.statement,
  },
};

export type LayoutCatalogEntry = {
  type: LayoutType;
  label: string;
  doc: string;
  source: string;
  slots: ReadonlyArray<SlotName>;
};

export const LAYOUT_CATALOG: Readonly<Record<LayoutType, LayoutCatalogEntry>> = {
  cols: {
    type: 'cols',
    label: 'Columns',
    doc: 'Two columns at 5/7 (522.5 and 731.5 px), 4/8 (418 and 836), 1/1 (627 and 627) or one fixed column, 72 px gap, centered.',
    source: 'head:83-85; SPEC 5.2 slot geometry',
    slots: ['left', 'right'],
  },
  split: {
    type: 'split',
    label: 'Head over body',
    doc: 'A head above a body with a 56 px gap; the head is single or two columns, the body fills and aligns its content.',
    source: 'head:78-82; report 03 section 11 items 7 and 8',
    slots: ['head', 'headLeft', 'headRight', 'body'],
  },
  center: {
    type: 'center',
    label: 'Center',
    doc: 'One centered block.',
    source: 'head:76',
    slots: ['main'],
  },
  'left-mid': {
    type: 'left-mid',
    label: 'Left, vertically centered',
    doc: 'One block at the left, vertically centered.',
    source: 'head:77',
    slots: ['main'],
  },
  stack: {
    type: 'stack',
    label: 'Stack',
    doc: 'A vertical flex column with a 22 px gap.',
    source: 'head:86',
    slots: ['main'],
  },
  freeform: {
    type: 'freeform',
    label: 'Freeform',
    doc: 'Every block carries pos, its box on the 1600 by 900 sheet, snapped to the 8 px grid, the rails, the plate edges and the column seams; flagged by layout/freeform at severity 1.',
    source: 'Kevin, 2026-09-11; docs/freeform.md',
    slots: ['main'],
  },
};

/** Expands a pointer template against a block: the template /items/STAR/key, with STAR the
 * array wildcard, lists one pointer per item. */
export function expandPaths(value: unknown, template: PathTemplate): string[] {
  const segments = template.split('/').slice(1);
  const out: string[] = [];
  const walk = (current: unknown, index: number, prefix: string): void => {
    if (index === segments.length) {
      out.push(prefix);
      return;
    }
    const segment = segments[index];
    if (segment === undefined || current === null || typeof current !== 'object') return;
    if (segment === '*') {
      if (!Array.isArray(current)) return;
      current.forEach((item, i) => walk(item, index + 1, `${prefix}/${i}`));
      return;
    }
    if (Array.isArray(current)) return;
    const record = current as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(record, segment)) return;
    walk(record[segment], index + 1, `${prefix}/${segment}`);
  };
  walk(value, 0, '');
  return out;
}

/** Every Text pointer inside a block, in document order. */
export function blockTextPaths(block: Block): string[] {
  return CATALOG[block.type].textPaths.flatMap((template) => expandPaths(block, template));
}

/** The Text pointers of a block that take paragraph breaks (gslides-parity SPEC 7.4). */
export function blockMultilinePaths(block: Block): string[] {
  return (CATALOG[block.type].multilineTextPaths ?? []).flatMap((template) =>
    expandPaths(block, template),
  );
}

/** True when the pointer inside the block is one of the four multiline pointers. */
export function isMultilinePath(block: Block, pointer: string): boolean {
  return blockMultilinePaths(block).includes(pointer);
}

/** Every asset reference inside a block: pointer and the referenced id. */
export function blockAssetRefs(block: Block): { path: string; assetId: string }[] {
  return CATALOG[block.type].assetPaths.flatMap((template) =>
    expandPaths(block, template).map((path) => ({ path, assetId: readString(block, path) })),
  );
}

function readString(value: unknown, pointer: string): string {
  let current: unknown = value;
  for (const token of pointer.split('/').slice(1)) {
    if (current === null || typeof current !== 'object') return '';
    current = Array.isArray(current)
      ? current[Number(token)]
      : (current as Record<string, unknown>)[token];
  }
  return typeof current === 'string' ? current : '';
}
