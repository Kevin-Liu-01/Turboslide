// Blocks: the grammar's classes as typed nodes (SPEC 4.2 "Blocks"). Every block has a stable id
// unique within its slide and no coordinates; the grammar's hand-set values become properties
// with the snap sets the deck uses (report 03 section 11). Zod schemas produce the JSON Schema
// for MCP and OpenAPI and carry the inspector annotations (SPEC 4.2).
import { z } from 'zod';
import { annotate } from './annotate.ts';
import type { AssetId, BlockId } from './ids.ts';
import { blockIdSchema, slugSchema } from './ids.ts';
import type { IconColor, IconName } from './icons.ts';
import { ICON_COLORS, iconNameSchema } from './icons.ts';
import type { Text } from './text.ts';
import { textSchema } from './text.ts';

/** Unknown fields survive under `ext` on exactly three levels: Slide, Block and Asset (SPEC 4.1). */
export const extSchema = z.record(z.string(), z.unknown()).optional();

// ---------------------------------------------------------------------------------------------
// Types

export type Icon = { name: IconName; color?: IconColor };
/** ext: the external link glyph after a link (head:121). */
export type RowItem = { key: Text; icon?: Icon; value: Text; ext?: true };
export type PlainItem = { text: Text; icon?: Icon; no?: true };

/** The declared, lintable form of svg.dia; with fit 'slot' the renderer sets w to the slot width. */
export type Diagram = {
  w: number;
  h: number;
  lines: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    stroke: 'ink' | 'mid' | 'hair';
    width?: 1 | 1.5;
  }[];
  rects: {
    x: number;
    y: number;
    w: number;
    h: number;
    fill: 'ink' | 'paper' | 'plate' | 'none';
    stroke?: 'ink' | 'mid' | 'hair';
    opacity?: number;
  }[];
  /** 11 px squares (DECK-GRAMMAR.md:44). */
  markers: { x: number; y: number }[];
  texts: {
    x: number;
    y: number;
    text: string;
    size: 20 | 26 | 18;
    anchor?: 'start' | 'middle' | 'end';
  }[];
  icons: { name: IconName; x: number; y: number; size: 24 | 20; color?: IconColor }[];
  marks: { x: number; y: number; w: number; h: number; iso?: true }[];
};

export type BlockBase = { id: BlockId; ext?: Record<string, unknown> };

export type HeadingBlock = BlockBase & {
  type: 'heading';
  level: 'h1' | 'h2' | 'big' | 'title';
  text: Text;
  marginTop?: number;
  marginBottom?: 0 | 18;
};
export type ParagraphBlock = BlockBase & {
  type: 'paragraph';
  text: Text;
  role?: 'body' | 'lead' | 'cap';
  tone?: 'ink' | 'muted';
  measure?: 32 | 56 | number;
  marginTop?: number;
};
/** 15 px titanium, plate only (head:65; OPENERS.md). */
export type CreditBlock = BlockBase & { type: 'credit'; text: Text };
export type RowsBlock = BlockBase & {
  type: 'rows';
  key: 90 | 120 | 150 | 180 | 190 | 200 | 220 | 240 | 250 | 300;
  tight?: boolean;
  links?: boolean;
  minRowHeight?: number;
  items: RowItem[];
};
export type PlainBlock = BlockBase & { type: 'plain'; size?: 24 | 22 | 20; items: PlainItem[] };
export type RefsBlock = BlockBase & { type: 'refs'; items: Text[] };
export type SayBlock = BlockBase & {
  type: 'say';
  items: { quote: Text; note?: Text; no?: true }[];
};
/** The marker is derived from value (DECK-GRAMMAR.md:61). */
export type ScalesBlock = BlockBase & {
  type: 'scales';
  centerTick?: boolean;
  items: { left: Text; right: Text; value: number }[];
};
export type SpecBlock = BlockBase & {
  type: 'spec';
  weights: (300 | 400 | 500 | 600 | 700 | 800)[];
  sample: string;
  textRow?: Text;
};
export type LangBlock = BlockBase & {
  type: 'lang';
  items: {
    script: 'latin' | 'ja' | 'zh' | 'ko' | 'ar' | 'hi' | string;
    text: string;
    label: string;
  }[];
};
export type LadderBlock = BlockBase & {
  type: 'ladder';
  rows: { size: number; label: string }[];
  valueWidth?: 200 | 320;
};
export type SwatchesBlock = BlockBase & {
  type: 'swatches';
  items: { name: string; value: string; plate: 'ink' | 'raised' | 'ti' | 'paper' | 'outline' }[];
};
export type ShotBlock = BlockBase & {
  type: 'shot';
  asset: AssetId;
  fit?: 'width' | 'fit';
  aspect?: string;
  crop?: 'top' | 'center';
  caption?: Text;
  captionSize?: 16 | 15;
  width?: number;
  border?: boolean;
};
export type PairBlock = BlockBase & {
  type: 'pair';
  ratio?: '1/1' | { left: number; right: number };
  gap?: 28 | 40;
  captionSize?: 16 | 15;
  figures: { assets: AssetId[]; caption?: Text }[];
};
export type TilesBlock = BlockBase & {
  type: 'tiles';
  columns: 4 | 5 | 6;
  aspect: '16/9' | '16/10' | '1/1';
  labelSize?: 15 | 20;
  items: { asset?: AssetId; label?: Text; sub?: Text; marker?: true }[];
  more?: Text;
};
export type DetailsBlock = BlockBase & {
  type: 'details';
  columns: 3;
  rowHeights?: number[];
  items: { asset: AssetId; caption?: Text }[];
};
export type BoardBlock = BlockBase & {
  type: 'board';
  columns: [128, 250, 200, 'fr'];
  rows: { asset?: AssetId; name: Text; address?: string; state: Icon; note: Text }[];
};
/** M5: the declared figure grid that retires the last escapes. */
export type CompositeBlock = BlockBase & {
  type: 'composite';
  tracks: string;
  gap?: number;
  cells: { blocks: Block[]; span?: number }[];
};
export type PanelBlock = BlockBase & {
  type: 'panel';
  code: string;
  size?: 17 | 15;
  pre?: boolean;
  term?: boolean;
  marks?: true;
};
export type DiaBlock = BlockBase & {
  type: 'dia';
  fit: 'slot' | { viewBox: [number, number, number, number] };
  data?: Diagram;
  svg?: string;
  alt: string;
};
export type DitherBlock = BlockBase & {
  type: 'dither';
  height: 220;
  ramp: 'linear-x';
  border?: true;
  alt: string;
};
/** The standalone GT mark. */
export type MarkBlock = BlockBase & { type: 'mark'; w: number; h: number };
/** The compression specimen (slide 17). */
export type MarkSizesBlock = BlockBase & { type: 'markSizes'; sizes: number[] };
/** The 4 by 4 Bayer table (slide 26). */
export type MatrixBlock = BlockBase & { type: 'matrix'; cells: number[][]; caption?: Text };
/**
 * Fixed-white plates for external logos (slide 14). An item shows either a logo capture (`asset`)
 * or the GT mark (`mark`): slide 14 places the mark beside two logo captures on the same plates,
 * so the importer and renderer need both forms (import report, deviation 1 from SPEC 4.2).
 */
export type LogoPlatesBlock = BlockBase & {
  type: 'logoPlates';
  items: { asset?: AssetId; mark?: true; name: Text }[];
};
/** The escape hatch: flagged by lint, raster on export. */
export type HtmlBlock = BlockBase & { type: 'html'; css: string; html: string; note: string };

export type Block =
  | HeadingBlock
  | ParagraphBlock
  | CreditBlock
  | RowsBlock
  | PlainBlock
  | RefsBlock
  | SayBlock
  | ScalesBlock
  | SpecBlock
  | LangBlock
  | LadderBlock
  | SwatchesBlock
  | ShotBlock
  | PairBlock
  | TilesBlock
  | DetailsBlock
  | BoardBlock
  | CompositeBlock
  | PanelBlock
  | DiaBlock
  | DitherBlock
  | MarkBlock
  | MarkSizesBlock
  | MatrixBlock
  | LogoPlatesBlock
  | HtmlBlock;

export type BlockType = Block['type'];

/** The block of one type, for renderers and mappers that switch on `type`. */
export type BlockOf<T extends BlockType> = Extract<Block, { type: T }>;

export const BLOCK_TYPES = [
  'heading',
  'paragraph',
  'credit',
  'rows',
  'plain',
  'refs',
  'say',
  'scales',
  'spec',
  'lang',
  'ladder',
  'swatches',
  'shot',
  'pair',
  'tiles',
  'details',
  'board',
  'composite',
  'panel',
  'dia',
  'dither',
  'mark',
  'markSizes',
  'matrix',
  'logoPlates',
  'html',
] as const satisfies ReadonlyArray<BlockType>;

// ---------------------------------------------------------------------------------------------
// Schemas

export const iconSchema = z.strictObject({
  name: annotate(iconNameSchema, { label: 'Icon', control: 'icon', group: 'Block' }),
  color: annotate(z.enum(ICON_COLORS).optional(), {
    label: 'Icon color',
    control: 'select',
    snap: ICON_COLORS,
    group: 'Block',
    help: 'Semantic color lives only on icons (DECK-GRAMMAR.md:30).',
  }),
}) satisfies z.ZodType<Icon>;

export const rowItemSchema = z.strictObject({
  key: annotate(textSchema, { label: 'Key', control: 'text', group: 'Text' }),
  icon: iconSchema.optional(),
  value: annotate(textSchema, { label: 'Value', control: 'text', group: 'Text' }),
  ext: annotate(z.literal(true).optional(), {
    label: 'External link glyph',
    control: 'toggle',
    group: 'Block',
  }),
}) satisfies z.ZodType<RowItem>;

export const plainItemSchema = z.strictObject({
  text: annotate(textSchema, { label: 'Text', control: 'text', group: 'Text' }),
  icon: iconSchema.optional(),
  no: annotate(z.literal(true).optional(), {
    label: 'Struck',
    control: 'toggle',
    group: 'Block',
    help: 'Strikes the line through in ink-2 (head:104).',
  }),
}) satisfies z.ZodType<PlainItem>;

const strokeSchema = z.enum(['ink', 'mid', 'hair']);

export const diagramSchema = z.strictObject({
  w: z.number().positive(),
  h: z.number().positive(),
  lines: z.array(
    z.strictObject({
      x1: z.number(),
      y1: z.number(),
      x2: z.number(),
      y2: z.number(),
      stroke: strokeSchema,
      width: z.literal([1, 1.5]).optional(),
    }),
  ),
  rects: z.array(
    z.strictObject({
      x: z.number(),
      y: z.number(),
      w: z.number(),
      h: z.number(),
      fill: z.enum(['ink', 'paper', 'plate', 'none']),
      stroke: strokeSchema.optional(),
      opacity: z.number().min(0).max(1).optional(),
    }),
  ),
  markers: z.array(z.strictObject({ x: z.number(), y: z.number() })),
  texts: z.array(
    z.strictObject({
      x: z.number(),
      y: z.number(),
      text: z.string(),
      size: z.literal([20, 26, 18]),
      anchor: z.enum(['start', 'middle', 'end']).optional(),
    }),
  ),
  icons: z.array(
    z.strictObject({
      name: iconNameSchema,
      x: z.number(),
      y: z.number(),
      size: z.literal([24, 20]),
      color: z.enum(ICON_COLORS).optional(),
    }),
  ),
  marks: z.array(
    z.strictObject({
      x: z.number(),
      y: z.number(),
      w: z.number(),
      h: z.number(),
      iso: z.literal(true).optional(),
    }),
  ),
}) satisfies z.ZodType<Diagram>;

const base = {
  id: annotate(blockIdSchema, { label: 'Id', control: 'readonly', group: 'Advanced' }),
  ext: extSchema,
};

const captionSize = annotate(z.literal([16, 15]).optional(), {
  label: 'Caption size',
  control: 'select',
  snap: [16, 15],
  group: 'Block',
  help: 'The two caption sizes the deck uses (report 03 section 11 item 9).',
});

const assetRef = (label: string): z.ZodString =>
  annotate(slugSchema, { label, control: 'asset', group: 'Asset' });

export const headingBlockSchema = z.strictObject({
  ...base,
  type: z.literal('heading'),
  level: annotate(z.enum(['h1', 'h2', 'big', 'title']), {
    label: 'Level',
    control: 'select',
    snap: ['h1', 'h2', 'big', 'title'],
    group: 'Block',
    help: 'h1 88 px, h2 44 px, big 72 px, title 44 px on a mood plate (head:59-61).',
  }),
  text: annotate(textSchema, { label: 'Text', control: 'text', group: 'Text' }),
  marginTop: annotate(z.number().optional(), {
    label: 'Margin top',
    control: 'number',
    group: 'Layout',
  }),
  marginBottom: annotate(z.literal([0, 18]).optional(), {
    label: 'Margin bottom',
    control: 'select',
    snap: [0, 18],
    group: 'Layout',
  }),
}) satisfies z.ZodType<HeadingBlock>;

export const paragraphBlockSchema = z.strictObject({
  ...base,
  type: z.literal('paragraph'),
  text: annotate(textSchema, { label: 'Text', control: 'textarea', group: 'Text' }),
  role: annotate(z.enum(['body', 'lead', 'cap']).optional(), {
    label: 'Role',
    control: 'select',
    snap: ['body', 'lead', 'cap'],
    group: 'Block',
    help: 'body 22 px, lead 26 px, cap 15 px titanium (head:62-65).',
  }),
  tone: annotate(z.enum(['ink', 'muted']).optional(), {
    label: 'Tone',
    control: 'select',
    snap: ['ink', 'muted'],
    group: 'Block',
  }),
  measure: annotate(z.number().positive().optional(), {
    label: 'Measure (ch)',
    control: 'number',
    snap: [32, 56],
    group: 'Layout',
    help: 'The .max (32ch) and .max-p (56ch) caps (head:67-68).',
  }),
  marginTop: annotate(z.number().optional(), {
    label: 'Margin top',
    control: 'number',
    group: 'Layout',
  }),
}) satisfies z.ZodType<ParagraphBlock>;

export const creditBlockSchema = z.strictObject({
  ...base,
  type: z.literal('credit'),
  text: annotate(textSchema, {
    label: 'Credit',
    control: 'text',
    group: 'Text',
    help: '15 px titanium on the plate; required for share-alike sources (OPENERS.md:255).',
  }),
}) satisfies z.ZodType<CreditBlock>;

export const ROWS_KEY_SNAP = [90, 120, 150, 180, 190, 200, 220, 240, 250, 300] as const;

export const rowsBlockSchema = z.strictObject({
  ...base,
  type: z.literal('rows'),
  key: annotate(z.literal(ROWS_KEY_SNAP), {
    label: 'Key width',
    control: 'select',
    snap: ROWS_KEY_SNAP,
    group: 'Layout',
    help: 'The key column in px; 240 is the default, 180 the deck’s .narrow (head:97, 100).',
  }),
  tight: annotate(z.boolean().optional(), {
    label: 'Tight',
    control: 'toggle',
    group: 'Layout',
    help: '14 px row padding instead of 16 (head:101).',
  }),
  links: annotate(z.boolean().optional(), {
    label: 'Link table',
    control: 'toggle',
    group: 'Block',
    help: 'Values in ink-2 with the external glyph after each link (head:198).',
  }),
  minRowHeight: annotate(z.number().positive().optional(), {
    label: 'Minimum row height',
    control: 'number',
    group: 'Layout',
  }),
  items: z.array(rowItemSchema).min(1),
}) satisfies z.ZodType<RowsBlock>;

export const plainBlockSchema = z.strictObject({
  ...base,
  type: z.literal('plain'),
  size: annotate(z.literal([24, 22, 20]).optional(), {
    label: 'Size',
    control: 'select',
    snap: [24, 22, 20],
    group: 'Block',
  }),
  items: z.array(plainItemSchema).min(1),
}) satisfies z.ZodType<PlainBlock>;

export const refsBlockSchema = z.strictObject({
  ...base,
  type: z.literal('refs'),
  items: z
    .array(annotate(textSchema, { label: 'Reference', control: 'text', group: 'Text' }))
    .min(1),
}) satisfies z.ZodType<RefsBlock>;

export const sayBlockSchema = z.strictObject({
  ...base,
  type: z.literal('say'),
  items: z
    .array(
      z.strictObject({
        quote: annotate(textSchema, { label: 'Quote', control: 'text', group: 'Text' }),
        note: annotate(textSchema.optional(), { label: 'Note', control: 'text', group: 'Text' }),
        no: annotate(z.literal(true).optional(), {
          label: 'Struck',
          control: 'toggle',
          group: 'Block',
        }),
      }),
    )
    .min(1),
}) satisfies z.ZodType<SayBlock>;

export const scalesBlockSchema = z.strictObject({
  ...base,
  type: z.literal('scales'),
  centerTick: annotate(z.boolean().optional(), {
    label: 'Center tick',
    control: 'toggle',
    group: 'Block',
  }),
  items: z
    .array(
      z.strictObject({
        left: annotate(textSchema, { label: 'Left label', control: 'text', group: 'Text' }),
        right: annotate(textSchema, { label: 'Right label', control: 'text', group: 'Text' }),
        value: annotate(z.number().min(0).max(100), {
          label: 'Value',
          control: 'number',
          group: 'Block',
          help: 'Percent from the left end, 0 to 100, as the deck writes `left: 78%`; the marker position is derived from it (DECK-GRAMMAR.md:61; slide 8).',
        }),
      }),
    )
    .min(1),
}) satisfies z.ZodType<ScalesBlock>;

export const SPEC_WEIGHTS = [300, 400, 500, 600, 700, 800] as const;

export const specBlockSchema = z.strictObject({
  ...base,
  type: z.literal('spec'),
  weights: annotate(z.array(z.literal(SPEC_WEIGHTS)).min(1), {
    label: 'Weights',
    control: 'json',
    snap: SPEC_WEIGHTS,
    group: 'Block',
    help: 'The specimen is the one place display weight may pass 500 (DECK-GRAMMAR.md:20).',
  }),
  sample: annotate(z.string(), { label: 'Sample', control: 'text', group: 'Text' }),
  textRow: annotate(textSchema.optional(), { label: 'Text row', control: 'text', group: 'Text' }),
}) satisfies z.ZodType<SpecBlock>;

export const LANG_SCRIPTS = ['latin', 'ja', 'zh', 'ko', 'ar', 'hi'] as const;

export const langBlockSchema = z.strictObject({
  ...base,
  type: z.literal('lang'),
  items: z
    .array(
      z.strictObject({
        script: annotate(z.string().min(1), {
          label: 'Script',
          control: 'select',
          snap: LANG_SCRIPTS,
          group: 'Block',
          help: 'ja, zh and ko take the CJK stack, ar the Arabic stack, hi the Indic stack (head:138-140).',
        }),
        text: annotate(z.string(), { label: 'Text', control: 'text', group: 'Text' }),
        label: annotate(z.string(), { label: 'Label', control: 'text', group: 'Text' }),
      }),
    )
    .min(1),
}) satisfies z.ZodType<LangBlock>;

export const ladderBlockSchema = z.strictObject({
  ...base,
  type: z.literal('ladder'),
  rows: z
    .array(
      z.strictObject({
        size: annotate(z.number().positive(), { label: 'Size', control: 'number', group: 'Block' }),
        label: annotate(z.string(), { label: 'Label', control: 'text', group: 'Text' }),
      }),
    )
    .min(1),
  valueWidth: annotate(z.literal([200, 320]).optional(), {
    label: 'Value column',
    control: 'select',
    snap: [200, 320],
    group: 'Layout',
  }),
}) satisfies z.ZodType<LadderBlock>;

export const SWATCH_PLATES = ['ink', 'raised', 'ti', 'paper', 'outline'] as const;

export const swatchesBlockSchema = z.strictObject({
  ...base,
  type: z.literal('swatches'),
  items: z
    .array(
      z.strictObject({
        name: annotate(z.string(), { label: 'Name', control: 'text', group: 'Text' }),
        value: annotate(z.string(), { label: 'Value', control: 'text', group: 'Text' }),
        plate: annotate(z.enum(SWATCH_PLATES), {
          label: 'Plate',
          control: 'select',
          snap: SWATCH_PLATES,
          group: 'Block',
        }),
      }),
    )
    .min(1),
}) satisfies z.ZodType<SwatchesBlock>;

export const shotBlockSchema = z.strictObject({
  ...base,
  type: z.literal('shot'),
  asset: assetRef('Asset'),
  fit: annotate(z.enum(['width', 'fit']).optional(), {
    label: 'Fit',
    control: 'select',
    snap: ['width', 'fit'],
    group: 'Layout',
    help: 'width fills the slot; fit keeps the image inside the slot on both axes (head:88-89).',
  }),
  aspect: annotate(
    z
      .string()
      .regex(/^\d+(\.\d+)?\s*\/\s*\d+(\.\d+)?$/)
      .optional(),
    {
      label: 'Aspect',
      control: 'text',
      group: 'Layout',
      help: 'A CSS aspect ratio such as 1440 / 864; the image is cropped to it with object-fit cover.',
    },
  ),
  crop: annotate(z.enum(['top', 'center']).optional(), {
    label: 'Crop anchor',
    control: 'select',
    snap: ['top', 'center'],
    group: 'Layout',
  }),
  caption: annotate(textSchema.optional(), {
    label: 'Caption',
    control: 'textarea',
    group: 'Text',
  }),
  captionSize,
  width: annotate(z.number().positive().optional(), {
    label: 'Width',
    control: 'number',
    group: 'Layout',
  }),
  border: annotate(z.boolean().optional(), {
    label: 'Border',
    control: 'toggle',
    group: 'Block',
    help: 'Required when the asset has one neutral twin (DECK-GRAMMAR.md:56).',
  }),
}) satisfies z.ZodType<ShotBlock>;

export const pairBlockSchema = z.strictObject({
  ...base,
  type: z.literal('pair'),
  ratio: annotate(
    z
      .union([
        z.literal('1/1'),
        z.strictObject({ left: z.number().positive(), right: z.number().positive() }),
      ])
      .optional(),
    { label: 'Ratio', control: 'json', group: 'Layout' },
  ),
  gap: annotate(z.literal([28, 40]).optional(), {
    label: 'Gap',
    control: 'select',
    snap: [28, 40],
    group: 'Layout',
  }),
  captionSize,
  figures: z
    .array(
      z.strictObject({
        assets: z.array(assetRef('Asset')).min(1),
        caption: annotate(textSchema.optional(), {
          label: 'Caption',
          control: 'textarea',
          group: 'Text',
        }),
      }),
    )
    .min(1),
}) satisfies z.ZodType<PairBlock>;

export const tilesBlockSchema = z.strictObject({
  ...base,
  type: z.literal('tiles'),
  columns: annotate(z.literal([4, 5, 6]), {
    label: 'Columns',
    control: 'select',
    snap: [4, 5, 6],
    group: 'Layout',
  }),
  aspect: annotate(z.enum(['16/9', '16/10', '1/1']), {
    label: 'Tile aspect',
    control: 'select',
    snap: ['16/9', '16/10', '1/1'],
    group: 'Layout',
  }),
  labelSize: annotate(z.literal([15, 20]).optional(), {
    label: 'Label size',
    control: 'select',
    snap: [15, 20],
    group: 'Block',
  }),
  items: z
    .array(
      z.strictObject({
        asset: assetRef('Asset').optional(),
        label: annotate(textSchema.optional(), { label: 'Label', control: 'text', group: 'Text' }),
        sub: annotate(textSchema.optional(), {
          label: 'Sub label',
          control: 'text',
          group: 'Text',
        }),
        marker: annotate(z.literal(true).optional(), {
          label: 'Marker',
          control: 'toggle',
          group: 'Block',
        }),
      }),
    )
    .min(1),
  more: annotate(textSchema.optional(), {
    label: 'More',
    control: 'text',
    group: 'Text',
    help: 'A closing line such as "and 12 more".',
  }),
}) satisfies z.ZodType<TilesBlock>;

export const detailsBlockSchema = z.strictObject({
  ...base,
  type: z.literal('details'),
  columns: annotate(z.literal(3), { label: 'Columns', control: 'readonly', group: 'Layout' }),
  rowHeights: annotate(z.array(z.number().positive()).optional(), {
    label: 'Row heights',
    control: 'json',
    group: 'Layout',
    help: 'One height per row of crops; the deck uses 140 and 236 (slide 38) or 425 (slide 65).',
  }),
  items: z
    .array(
      z.strictObject({
        asset: assetRef('Asset'),
        caption: annotate(textSchema.optional(), {
          label: 'Caption',
          control: 'textarea',
          group: 'Text',
        }),
      }),
    )
    .min(1),
}) satisfies z.ZodType<DetailsBlock>;

export const boardBlockSchema = z.strictObject({
  ...base,
  type: z.literal('board'),
  columns: annotate(z.tuple([z.literal(128), z.literal(250), z.literal(200), z.literal('fr')]), {
    label: 'Columns',
    control: 'readonly',
    group: 'Layout',
    help: 'A 128 by 72 capture, the surface and its address, the state, the note (slide 80).',
  }),
  rows: z
    .array(
      z.strictObject({
        asset: assetRef('Asset').optional(),
        name: annotate(textSchema, { label: 'Name', control: 'text', group: 'Text' }),
        address: annotate(z.string().optional(), {
          label: 'Address',
          control: 'text',
          group: 'Text',
        }),
        state: iconSchema,
        note: annotate(textSchema, { label: 'Note', control: 'textarea', group: 'Text' }),
      }),
    )
    .min(1),
}) satisfies z.ZodType<BoardBlock>;

export const panelBlockSchema = z.strictObject({
  ...base,
  type: z.literal('panel'),
  code: annotate(z.string(), {
    label: 'Code',
    control: 'textarea',
    group: 'Text',
    help: 'The one string where \\n is honored; white monospace on the #101010 panel (head:171).',
  }),
  size: annotate(z.literal([17, 15]).optional(), {
    label: 'Size',
    control: 'select',
    snap: [17, 15],
    group: 'Block',
  }),
  pre: annotate(z.boolean().optional(), {
    label: 'Preformatted',
    control: 'toggle',
    group: 'Block',
  }),
  term: annotate(z.boolean().optional(), { label: 'Terminal', control: 'toggle', group: 'Block' }),
  marks: annotate(z.literal(true).optional(), {
    label: 'Marks',
    control: 'toggle',
    group: 'Block',
    help: 'Renders standalone GT inside the panel as the mark; off by default (gt-mark-in-text exclusions).',
  }),
}) satisfies z.ZodType<PanelBlock>;

export const diaBlockSchema = z
  .strictObject({
    ...base,
    type: z.literal('dia'),
    fit: annotate(
      z.union([
        z.literal('slot'),
        z.strictObject({ viewBox: z.tuple([z.number(), z.number(), z.number(), z.number()]) }),
      ]),
      {
        label: 'Fit',
        control: 'json',
        group: 'Layout',
        help: 'slot sizes the viewBox from the slot width so one unit is one sheet pixel (SPEC 5.2).',
      },
    ),
    data: diagramSchema.optional(),
    svg: annotate(z.string().optional(), {
      label: 'Raw SVG',
      control: 'textarea',
      group: 'Advanced',
      help: 'Passes through unchanged with a lint flag; prefer data (SPEC 5.2).',
    }),
    alt: annotate(z.string(), {
      label: 'Alt text',
      control: 'text',
      group: 'Text',
      help: 'Empty for a decorative diagram; the renderer then writes aria-hidden, as the deck does (slide 6).',
    }),
  })
  .refine((value) => (value.data === undefined) !== (value.svg === undefined), {
    message: 'a dia block carries either data or svg, not both and not neither',
    path: ['data'],
  }) satisfies z.ZodType<DiaBlock>;

export const ditherBlockSchema = z.strictObject({
  ...base,
  type: z.literal('dither'),
  height: annotate(z.literal(220), { label: 'Height', control: 'readonly', group: 'Layout' }),
  ramp: annotate(z.literal('linear-x'), { label: 'Ramp', control: 'readonly', group: 'Block' }),
  border: annotate(z.literal(true).optional(), {
    label: 'Border',
    control: 'toggle',
    group: 'Block',
  }),
  alt: annotate(z.string().min(1), { label: 'Alt text', control: 'text', group: 'Text' }),
}) satisfies z.ZodType<DitherBlock>;

export const markBlockSchema = z.strictObject({
  ...base,
  type: z.literal('mark'),
  w: annotate(z.number().positive(), {
    label: 'Width',
    control: 'number',
    group: 'Layout',
    help: 'The symbol is 1213 by 771, so width is 1.573 times height (report 03 section 4.5).',
  }),
  h: annotate(z.number().positive(), { label: 'Height', control: 'number', group: 'Layout' }),
}) satisfies z.ZodType<MarkBlock>;

export const markSizesBlockSchema = z.strictObject({
  ...base,
  type: z.literal('markSizes'),
  sizes: annotate(z.array(z.number().positive()).min(1), {
    label: 'Sizes',
    control: 'json',
    snap: [16, 32, 64, 128, 256],
    group: 'Block',
  }),
}) satisfies z.ZodType<MarkSizesBlock>;

export const matrixBlockSchema = z.strictObject({
  ...base,
  type: z.literal('matrix'),
  cells: annotate(z.array(z.array(z.number())).min(1), {
    label: 'Cells',
    control: 'json',
    group: 'Block',
  }),
  caption: annotate(textSchema.optional(), {
    label: 'Caption',
    control: 'textarea',
    group: 'Text',
  }),
}) satisfies z.ZodType<MatrixBlock>;

export const logoPlatesBlockSchema = z.strictObject({
  ...base,
  type: z.literal('logoPlates'),
  items: z
    .array(
      z
        .strictObject({
          asset: assetRef('Logo').optional(),
          mark: annotate(z.literal(true).optional(), {
            label: 'GT mark',
            control: 'toggle',
            group: 'Block',
            help: 'Draws the GT mark on the plate instead of a logo capture (slide 14).',
          }),
          name: annotate(textSchema, { label: 'Name', control: 'text', group: 'Text' }),
        })
        .refine((item) => item.asset !== undefined || item.mark === true, {
          message: 'A logo plate shows either an asset or the GT mark',
        }),
    )
    .min(1),
}) satisfies z.ZodType<LogoPlatesBlock>;

export const htmlBlockSchema = z.strictObject({
  ...base,
  type: z.literal('html'),
  css: annotate(z.string(), {
    label: 'CSS',
    control: 'textarea',
    group: 'Advanced',
    help: 'Scoped by the renderer under .ts-x-<slideId>-<blockId> (SPEC 5.2).',
  }),
  html: annotate(z.string(), { label: 'HTML', control: 'textarea', group: 'Advanced' }),
  note: annotate(z.string().min(1), {
    label: 'Why the escape',
    control: 'textarea',
    group: 'Advanced',
    help: 'What the grammar cannot express here; the count of these blocks is the grammar’s honest scope (SPEC 1).',
  }),
}) satisfies z.ZodType<HtmlBlock>;

/** Recursive through composite cells; typed explicitly so the cycle resolves. */
export const blockSchema: z.ZodType<Block> = z.lazy(() => blockUnionSchema);

export const compositeBlockSchema = z.strictObject({
  ...base,
  type: z.literal('composite'),
  tracks: annotate(z.string().min(1), {
    label: 'Tracks',
    control: 'text',
    group: 'Layout',
    help: 'A CSS grid-template-columns value; M5 retires the last html escapes with it.',
  }),
  gap: annotate(z.number().nonnegative().optional(), {
    label: 'Gap',
    control: 'number',
    group: 'Layout',
  }),
  cells: z
    .array(
      z.strictObject({
        blocks: z.array(blockSchema),
        span: z.number().int().positive().optional(),
      }),
    )
    .min(1),
}) satisfies z.ZodType<CompositeBlock>;

export const blockUnionSchema = z.discriminatedUnion('type', [
  headingBlockSchema,
  paragraphBlockSchema,
  creditBlockSchema,
  rowsBlockSchema,
  plainBlockSchema,
  refsBlockSchema,
  sayBlockSchema,
  scalesBlockSchema,
  specBlockSchema,
  langBlockSchema,
  ladderBlockSchema,
  swatchesBlockSchema,
  shotBlockSchema,
  pairBlockSchema,
  tilesBlockSchema,
  detailsBlockSchema,
  boardBlockSchema,
  compositeBlockSchema,
  panelBlockSchema,
  diaBlockSchema,
  ditherBlockSchema,
  markBlockSchema,
  markSizesBlockSchema,
  matrixBlockSchema,
  logoPlatesBlockSchema,
  htmlBlockSchema,
]);

/** The concrete object schema for one block type, for the inspector and the catalog. */
export const BLOCK_SCHEMAS = {
  heading: headingBlockSchema,
  paragraph: paragraphBlockSchema,
  credit: creditBlockSchema,
  rows: rowsBlockSchema,
  plain: plainBlockSchema,
  refs: refsBlockSchema,
  say: sayBlockSchema,
  scales: scalesBlockSchema,
  spec: specBlockSchema,
  lang: langBlockSchema,
  ladder: ladderBlockSchema,
  swatches: swatchesBlockSchema,
  shot: shotBlockSchema,
  pair: pairBlockSchema,
  tiles: tilesBlockSchema,
  details: detailsBlockSchema,
  board: boardBlockSchema,
  composite: compositeBlockSchema,
  panel: panelBlockSchema,
  dia: diaBlockSchema,
  dither: ditherBlockSchema,
  mark: markBlockSchema,
  markSizes: markSizesBlockSchema,
  matrix: matrixBlockSchema,
  logoPlates: logoPlatesBlockSchema,
  html: htmlBlockSchema,
} as const satisfies Record<BlockType, z.ZodType>;
