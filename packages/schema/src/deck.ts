// The deck manifest and the slide kinds (SPEC 4.1, 4.2). A deck is a manifest plus one file per
// slide; the manifest's sections are the only place order lives, so numbers, counts and titles are
// derived (SPEC 4.2). Slide kinds are the grammar's twelve archetypes folded into six kinds: the
// full-picture kinds (opener, mood, closing) carry a picture and a plate, title and statement are
// fixed compositions, and content slides carry typed blocks in the slots of one layout.
import { z } from 'zod';
import { annotate } from './annotate.ts';
import type { Asset, MediaAsset } from './assets.ts';
import { assetSchema, mediaAssetSchema } from './assets.ts';
import type { Block } from './blocks.ts';
import { blockSchema, extSchema } from './blocks.ts';
import type { Color, HexColor } from './color.ts';
import { colorSchema, hexColorSchema } from './color.ts';
import type { FontId } from './fonts.ts';
import { FONT_IDS } from './fonts.ts';
import type { AssetId, SectionId, SlideId } from './ids.ts';
import { slugSchema } from './ids.ts';
import type { Animation, SlideTransition } from './motion.ts';
import { animationsSchema, transitionSchema } from './motion.ts';
import type { Position } from './position.ts';
import { positionObjectSchema } from './position.ts';
import { languageTagSchema } from './preferences.ts';
import type { Page } from './render.ts';
import { PAGE_MAX_PX, pageSchema } from './render.ts';
import type { Text } from './text.ts';
import { multilineTextSchema, plainText, textSchema } from './text.ts';

export const SCHEMA_VERSION = 1;

/**
 * The themes (SPEC 2.1, open question 6): the GT theme, and since round five the second built in
 * theme `ts-plate` (gslides-parity SPEC-5 0.45, 9.3; the working label is "Plate", the label is
 * Kevin's). The stylesheets and the per theme tokens live in `packages/theme` (B6's `themes.ts`).
 */
export const THEMES = ['gt-ink-paper', 'ts-plate'] as const;
export type ThemeId = (typeof THEMES)[number];

/** The language every deck without a `language` field reads in (SPEC-5 1.2 "Absent"). */
export const DEFAULT_LANGUAGE = 'en-US';

/**
 * A custom layout's id (gslides-parity SPEC-5 9.2; R03 4.1): `custom-<slug>`, so a slide's
 * `template` tells a built in layout from a custom one by its prefix and `isLayoutId` stays the
 * guard every built in reader uses.
 */
export type CustomLayoutId = `custom-${string}`;
export const CUSTOM_LAYOUT_ID_PATTERN = /^custom-[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const customLayoutIdSchema = z.templateLiteral([
  'custom-',
  z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'a slug after custom-'),
]) satisfies z.ZodType<CustomLayoutId>;

export function isCustomLayoutId(value: string): value is CustomLayoutId {
  return CUSTOM_LAYOUT_ID_PATTERN.test(value);
}

/**
 * The layout ids of the layout list (gslides-parity SPEC 5.2): Google's eleven names first, in
 * Google's order, then the GT layouts. The entries themselves live in layouts.ts, which re-exports
 * this list; it is declared here because `SlideBase.template` names one of them and layouts.ts
 * imports this module.
 */
export const LAYOUT_IDS = [
  'title',
  'opener',
  'split',
  'cols',
  'title-only',
  'one-column',
  'statement',
  'section-description',
  'mood',
  'big-number',
  'blank',
  'rows',
  'plain',
  'table',
  'figure',
  'pair',
  'tiles',
  'details',
  'board',
  'matrix',
  'closing',
] as const;
export type LayoutId = (typeof LAYOUT_IDS)[number];

/** The Themes panel's choice (gslides-parity SPEC 7.2.3); dark when absent. */
export const APPEARANCES = ['light', 'dark'] as const;
export type Appearance = (typeof APPEARANCES)[number];

/** Slide numbers (gslides-parity SPEC 7.2.4): on when absent. */
export const COUNTER_MODES = ['on', 'off', 'skip-title'] as const;
export type CounterMode = (typeof COUNTER_MODES)[number];

// ---------------------------------------------------------------------------------------------
// Types

/** An opener, if present, is first and has kind 'opener'. */
export type Section = { id: SectionId; name: string; slideIds: SlideId[] };

export type Deck = {
  schemaVersion: 1;
  /** slug, stable: 'gt-brand' */
  id: string;
  title: string;
  theme: ThemeId;
  sections: Section[];
  assets: Record<AssetId, Asset>;
  /**
   * The stored audio and video files (gslides-parity SPEC-5 0.16; R11 1.4), keyed by asset id like
   * the pictures. SPEC-5 0.16 puts them in `assets` as a union; the integrator's day 0 note records
   * why they sit in their own map: 96 picture readers in 40 files across every lane read
   * `assets[id].twins`, and a union there would have moved every one of them on day 0. A media
   * block's `source.asset` and a `MediaAsset.poster` still name ids; `asset.set` and `asset.remove`
   * carry both records and the reducer routes by `kind`, so the operation stream sees one map.
   */
  media?: Record<AssetId, MediaAsset>;
  defaults?: {
    notes?: string;
    /** the theme appearance every surface defaults to; dark when absent (gslides-parity SPEC 7.2.3) */
    appearance?: Appearance;
    /** the frame's slide counter; on when absent (gslides-parity SPEC 7.2.4) */
    counter?: CounterMode;
    /** the background every slide without its own takes; what Add to theme writes (gslides-parity SPEC-2 2.6.2) */
    background?: SlideBackground;
  };
  /**
   * The deck's guides (gslides-parity SPEC-2 2.10): vertical lines at the x values and horizontal
   * lines at the y values, in sheet pixels, the same on every slide; the editor overlay draws them
   * and the snap reads them; never in a thumbnail, the presentation or a download. Sorted, no
   * duplicates, inside the sheet.
   */
  guides?: DeckGuides;
  /**
   * The slide size in sheet pixels (gslides-parity SPEC-5 0.30, 6.1): the GT sheet, 1600 by 900,
   * when absent. Written by `deck.setPageSize` alone (the `deck.set` pointer regex stays closed to
   * it); read through `deckPage()` by every grid, geometry, export and ruler.
   */
  page?: Page;
  /** A BCP 47 tag, `ll` or `ll-RR` (SPEC-5 7.1); `en-US` when absent. Written by `deck.set /language`. */
  language?: string;
  /** Edit theme's override record (SPEC-5 0.44, 9.1; R03 4.1); the base theme when absent. */
  themeEdits?: ThemeEdits;
  /** The records Import theme appended, at most five (SPEC-5 0.28); none when absent. */
  importedThemes?: ThemeRecord[];
  /** The layouts made in the theme mode by id (SPEC-5 9.2); none when absent. */
  customLayouts?: Record<string, CustomLayout>;
  /** increments on every committed write */
  revision: number;
  createdAt: string;
  updatedAt: string;
  /**
   * Set when the deck is in the trash (gslides-parity SPEC 7.2.5): hidden from deck.list, /decks
   * and /new until deck.restore clears it or deck.remove deletes the folder. Written by deck.trash
   * at the store level, never through deck.set.
   */
  trashedAt?: string;
};

export type SlideBase = {
  /** on every slide file so one slide can be read, validated and migrated alone */
  schemaVersion: 1;
  id: SlideId;
  /** overrides the derived title (first heading, big or plate title) */
  title?: string;
  /** speaker notes; the only place notes live */
  notes?: string;
  tags?: string[];
  /**
   * Skip slide (gslides-parity SPEC 7.2.1): present mode, the view route, the standalone build,
   * print, thumbnails' play list, PDF and PPTX omit the slide unless asked; the filmstrip dims it.
   */
  skip?: true;
  /**
   * The layout the slide was made from (gslides-parity SPEC 7.2.2); absent on every stored slide
   * until New slide or Apply layout runs. Since round five a custom layout's id too (SPEC-5 9.2);
   * `isLayoutId` tells the built in ones.
   */
  template?: LayoutId | CustomLayoutId;
  /**
   * The slide's transition (gslides-parity SPEC-5 0.8, 0.12): stored on the incoming slide,
   * PowerPoint's rule; none when absent. Written by `slide.set /transition` through
   * `motion.setTransition`.
   */
  transition?: SlideTransition;
  /**
   * The Motion panel's list in play order (SPEC-5 0.8, 1.3), one entry per animation with the
   * block it targets; no animations when absent. Written by `slide.set /animations` through the
   * `motion.*` actions; the reducer drops entries whose block is gone.
   */
  animations?: Animation[];
  /**
   * The slide's own background colour (gslides-parity SPEC-2 2.6.1, 0.74): a fill under the
   * layout on every slide kind. Absent, the deck default applies. A background picture is not a
   * field: it is a `picture` object at the bottom of the canvas stack (SPEC-2 2.6.4).
   */
  background?: SlideBackground;
  /**
   * The conversion record of a canvas slide (gslides-parity SPEC-2 1.2, 0.99): the kind, the
   * layout, the slot membership, the boxes and the kind's fields the slide had before its first
   * canvas manipulation converted it to the freeform layout, so `fromCanvas` restores the kind
   * while nothing moved and Apply layout re-flows. A first class field, never an `ext` key, so the
   * validator's `ext` issue does not fire on a converted slide.
   */
  grammar?: GrammarRecord;
  ext?: Record<string, unknown>;
};

/** A slide or deck background: a palette colour (SPEC-2 2.6.1, 0.74). */
export type SlideBackground = { color: Color };

/**
 * The deck's guide lines in sheet pixels (SPEC-2 2.10). Since round five a guide may carry a
 * colour (gslides-parity SPEC-5 7.7, Edit guides): `colors` is keyed by the guide's axis and
 * position, `x:800` or `y:450`, so a removed guide takes its colour with it; the guide colour
 * token draws every guide without one.
 */
export type DeckGuides = { x: number[]; y: number[]; colors?: Record<string, Color> };

// ---------------------------------------------------------------------------------------------
// Edit theme (gslides-parity SPEC-5 0.44, 9.1; R03 4.1)

/** The corner slot's kinds (SPEC-5 0.45): the GT mark, a picture asset, the Turboslide mark (in the schema, not drawn), or empty. */
export const THEME_MARK_KINDS = ['gt', 'picture', 'turboslide', 'none'] as const;
export type ThemeMarkKind = (typeof THEME_MARK_KINDS)[number];

/** The two faces a theme names (SPEC-5-amendments A5 item 1) plus the mono stack the code panel uses. */
export const THEME_FONT_ROLES = ['display', 'text', 'mono'] as const;
export type ThemeFontRole = (typeof THEME_FONT_ROLES)[number];

/** The type levels the theme's ladder edits (R03 4.4: Google's nine levels reduce to Turboslide's ladder). */
export const THEME_TYPE_LEVELS = ['h1', 'h2', 'big', 'lead', 'body', 'small', 'caption'] as const;
export type ThemeTypeLevel = (typeof THEME_TYPE_LEVELS)[number];

/** A box on the page in sheet pixels: x, y, w, h. */
export type ThemeBox = [number, number, number, number];

/**
 * Edit theme's override record (R03 4.1): only what a deck changed; `themeCss(deck)` turns it
 * into one stylesheet and the Editable text export writes the theme part from it. The colour
 * maps are keyed by token name (the theme package's token list; the `theme` validator names an
 * unknown one) and hold `#rrggbb` values.
 */
export type ThemeEdits = {
  /** Rename; the Themes panel shows it under "In this presentation" */
  name?: string;
  colors?: {
    light?: Record<string, HexColor>;
    dark?: Record<string, HexColor>;
  };
  fonts?: Partial<Record<ThemeFontRole, FontId>>;
  frame?: { rails?: boolean; rules?: boolean; crosses?: boolean; inset?: number };
  mark?: { kind: ThemeMarkKind; assetId?: AssetId; box?: ThemeBox };
  counter?: {
    show?: boolean;
    side?: 'left' | 'right';
    format?: 'n' | 'n-of-total';
    box?: ThemeBox;
  };
  chips?: { show?: boolean };
  type?: {
    levels?: Partial<Record<ThemeTypeLevel, { size?: number; weight?: number; tracking?: number }>>;
  };
  /** already `defaults.background`; Edit theme's Background button writes it here too */
  background?: SlideBackground;
};

/** The most records "In this presentation" holds (SPEC-5 0.28; R02 b.1 "5 themes per presentation"). */
export const IMPORTED_THEMES_MAX = 5;

/** One imported theme (SPEC-5 0.28): its name, twelve colours, two faces and where it came from. */
export type ThemeRecord = {
  name: string;
  colors: Record<string, HexColor>;
  fonts: { display?: string; text?: string };
  source: { file: string; themeIndex: number } | { deckId: string };
};

/**
 * A layout made in the theme mode (SPEC-5 9.2; R03 4.1): a canvas slide's positioned blocks
 * whose `placeholder` fields say what Apply layout fills, or, for a built in layout the builder
 * deleted, `hidden` alone (a built in layout is code and cannot be removed).
 */
export type CustomLayout = {
  name?: string;
  displayName?: string;
  /** the built in layout it was made from, for its thumbnail's slot signature */
  from?: LayoutId;
  blocks?: Block[];
  hidden?: boolean;
};

/**
 * What a slide was before it became a canvas (SPEC-2 1.2): the round one `GrammarRecord` of the
 * viewer's Freeform module, moved here and extended with the kind and the kind's fields.
 * `layout` and `slots` describe a content source; `fields` carries a fixed kind's `mark`,
 * `measure`, `picture`, `plate` side and width, and `sectionId`; `boxes` is the `pos` every object
 * received at the conversion, by id, so the switch back is lossless while nothing moved.
 */
export type GrammarRecord = {
  kind: SlideKind;
  layout?: Layout;
  /** slot name (or `plate`) to block ids, in slot order */
  slots?: Partial<Record<SlotName | 'plate', string[]>>;
  /** the box each object got at the conversion, by id */
  boxes: Record<string, Position>;
  fields?: {
    mark?: { w: number; h: number };
    measure?: number;
    picture?: Picture;
    plate?: { side: PlateSide; maxWidth: 740 | 560 | 720 };
    sectionId?: SectionId;
    /** the `template` the source carried, when it carried one, so the restore is byte for byte */
    template?: LayoutId;
    /** the ids the conversion wrote `autofit: 'shrink'` on, so the restore removes it again */
    autofit?: string[];
  };
};

export type SlotName = 'main' | 'head' | 'headLeft' | 'headRight' | 'body' | 'left' | 'right';

export const SLOT_NAMES = [
  'main',
  'head',
  'headLeft',
  'headRight',
  'body',
  'left',
  'right',
] as const;

export type ColsRatio = '5/7' | '4/8' | '1/1' | { left: number } | { right: number };

export type Layout =
  /** slots: left, right */
  | { type: 'cols'; ratio: ColsRatio; gap?: 72 | 56 | 48; align?: 'start' | 'center' }
  /** slots: head (or headLeft, headRight), body */
  | {
      type: 'split';
      gap?: 56 | 44 | 40 | 36 | 32 | 26;
      /**
       * `align: 'baseline'` aligns the two head columns on the first baseline where the other
       * head grids align at start (slide 21; import report, deviation 3 from SPEC 4.2).
       */
      head?: 'single' | { cols: '5/7' | '4/8'; align?: 'start' | 'baseline' };
      body?: { align: 'start' | 'center' | 'end' };
    }
  /** slot: main */
  | { type: 'center' }
  /** slot: main */
  | { type: 'left-mid' }
  /** slot: main */
  | { type: 'stack'; gap?: number }
  /**
   * slot: main. Every top-level block carries `pos`, its box on the sheet, and the renderer places
   * it absolutely (Kevin, 2026-09-11, over the no-coordinates rule of SPEC 1 and 6.4; docs/freeform.md).
   * A pure-grammar deck learns of it through the layout/freeform lint at severity 1.
   */
  | { type: 'freeform' };

export type LayoutType = Layout['type'];

export type Picture = { asset: AssetId; fit: 'cover'; position?: 'center' | 'top' | 'bottom' };
export type PlateSide = 'lower-left' | 'lower-right' | 'upper-left';
export type Plate = { side: PlateSide; maxWidth: 740 | 560 | 720; blocks: Block[] };

/** Slots present depend on the layout; a content slide lists only the slots it fills. */
export type ContentSlide = SlideBase & {
  kind: 'content';
  layout: Layout;
  slots: Partial<Record<SlotName, Block[]>>;
};
/** side lower-left, 740 */
export type OpenerSlide = SlideBase & {
  kind: 'opener';
  sectionId: SectionId;
  picture: Picture;
  plate: Plate;
};
/** side lower-right, 560 */
export type MoodSlide = SlideBase & { kind: 'mood'; picture: Picture; plate: Plate };
/** upper-left, 720 */
export type ClosingSlide = SlideBase & {
  kind: 'closing';
  picture: Picture;
  plate: Plate;
  mark?: { w: number; h: number };
};
export type TitleSlide = SlideBase & {
  kind: 'title';
  mark: { w: number; h: number };
  heading: Text;
  lead: Text;
};
/** measure in ch */
export type StatementSlide = SlideBase & { kind: 'statement'; big: Text; measure?: number };

export type Slide =
  ContentSlide | OpenerSlide | MoodSlide | ClosingSlide | TitleSlide | StatementSlide;
export type SlideKind = Slide['kind'];

export const SLIDE_KINDS = ['content', 'opener', 'mood', 'closing', 'title', 'statement'] as const;

/** The manifest and its slides together, the unit the validator, the reducer and the diff work on. */
export type DeckDocument = { deck: Deck; slides: Record<SlideId, Slide> };

// ---------------------------------------------------------------------------------------------
// Schemas

const markSizeSchema = z.strictObject({
  w: annotate(z.number().positive(), { label: 'Mark width', control: 'number', group: 'Layout' }),
  h: annotate(z.number().positive(), { label: 'Mark height', control: 'number', group: 'Layout' }),
});

export const slideBackgroundSchema = z.strictObject({
  color: colorSchema,
}) satisfies z.ZodType<SlideBackground>;

/** The sheet the guides lie inside (render.ts SHEET_WIDTH and SHEET_HEIGHT, repeated by value). */
/**
 * The guide bounds the schema admits: the page cap on both axes since round five (gslides-parity
 * SPEC-5 6.1: "`GUIDE_MAX` becomes the page"); the deck's own page bounds them in
 * `validate/page.ts`, so a 16:9 deck still refuses a guide past 1600 or 900 as a `page` issue.
 */
const GUIDE_MAX = { x: PAGE_MAX_PX, y: PAGE_MAX_PX } as const;

/** A guide colour key: the axis and the position, `x:800` or `y:450` (SPEC-5 7.7). */
export const GUIDE_COLOR_KEY = /^[xy]:-?\d+(?:\.\d+)?$/;

export const deckGuidesSchema = z.strictObject({
  x: z.array(z.number().min(0).max(GUIDE_MAX.x)),
  y: z.array(z.number().min(0).max(GUIDE_MAX.y)),
  colors: z
    .record(
      z.string().regex(GUIDE_COLOR_KEY, 'an axis and a position, x:800 or y:450'),
      colorSchema,
    )
    .optional(),
}) satisfies z.ZodType<DeckGuides>;

const themeBoxSchema = z.tuple([
  z.number(),
  z.number(),
  z.number().positive(),
  z.number().positive(),
]);

const hexMap = z.record(z.string().min(1).max(64), hexColorSchema);

export const themeEditsSchema = z.strictObject({
  name: z.string().min(1).max(120).optional(),
  colors: z.strictObject({ light: hexMap.optional(), dark: hexMap.optional() }).optional(),
  fonts: z
    .strictObject({
      display: z.enum(FONT_IDS).optional(),
      text: z.enum(FONT_IDS).optional(),
      mono: z.enum(FONT_IDS).optional(),
    })
    .optional(),
  frame: z
    .strictObject({
      rails: z.boolean().optional(),
      rules: z.boolean().optional(),
      crosses: z.boolean().optional(),
      inset: z.number().min(0).max(400).optional(),
    })
    .optional(),
  mark: z
    .strictObject({
      kind: z.enum(THEME_MARK_KINDS),
      assetId: slugSchema.optional(),
      box: themeBoxSchema.optional(),
    })
    .optional(),
  counter: z
    .strictObject({
      show: z.boolean().optional(),
      side: z.enum(['left', 'right']).optional(),
      format: z.enum(['n', 'n-of-total']).optional(),
      box: themeBoxSchema.optional(),
    })
    .optional(),
  chips: z.strictObject({ show: z.boolean().optional() }).optional(),
  type: z
    .strictObject({
      levels: z
        .partialRecord(
          z.enum(THEME_TYPE_LEVELS),
          z.strictObject({
            size: z.number().positive().optional(),
            weight: z.number().int().min(100).max(900).optional(),
            tracking: z.number().optional(),
          }),
        )
        .optional(),
    })
    .optional(),
  background: slideBackgroundSchema.optional(),
}) satisfies z.ZodType<ThemeEdits>;

export const themeRecordSchema = z.strictObject({
  name: z.string().min(1).max(120),
  colors: hexMap,
  fonts: z.strictObject({
    display: z.string().min(1).max(120).optional(),
    text: z.string().min(1).max(120).optional(),
  }),
  source: z.union([
    z.strictObject({ file: z.string().min(1), themeIndex: z.number().int().nonnegative() }),
    z.strictObject({ deckId: slugSchema }),
  ]),
}) satisfies z.ZodType<ThemeRecord>;

export const customLayoutSchema = z.strictObject({
  name: z.string().min(1).max(120).optional(),
  displayName: z.string().min(1).max(120).optional(),
  from: z.enum(LAYOUT_IDS).optional(),
  blocks: z.array(blockSchema).optional(),
  hidden: z.boolean().optional(),
}) satisfies z.ZodType<CustomLayout>;

export const sectionSchema = z.strictObject({
  id: slugSchema,
  name: z.string().min(1),
  slideIds: z.array(slugSchema),
}) satisfies z.ZodType<Section>;

export const colsRatioSchema = z.union([
  z.literal(['5/7', '4/8', '1/1']),
  z.strictObject({ left: z.number().positive() }),
  z.strictObject({ right: z.number().positive() }),
]) satisfies z.ZodType<ColsRatio>;

export const COLS_GAPS = [72, 56, 48] as const;
export const SPLIT_GAPS = [56, 44, 40, 36, 32, 26] as const;

export const layoutSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('cols'),
    ratio: annotate(colsRatioSchema, {
      label: 'Ratio',
      control: 'json',
      snap: ['5/7', '4/8', '1/1'],
      group: 'Layout',
      help: '5/7 is the deck’s .cols, 4/8 .wide-right, 1/1 .even; { left: 390 } fixes one column in px (head:83-85).',
    }),
    gap: annotate(z.literal(COLS_GAPS).optional(), {
      label: 'Gap',
      control: 'select',
      snap: COLS_GAPS,
      group: 'Layout',
    }),
    align: annotate(z.enum(['start', 'center']).optional(), {
      label: 'Align',
      control: 'select',
      snap: ['start', 'center'],
      group: 'Layout',
    }),
  }),
  z.strictObject({
    type: z.literal('split'),
    gap: annotate(z.literal(SPLIT_GAPS).optional(), {
      label: 'Gap',
      control: 'select',
      snap: SPLIT_GAPS,
      group: 'Layout',
      help: 'The .split gap variants the deck sets by hand (report 03 section 11 item 8).',
    }),
    head: annotate(
      z
        .union([
          z.literal('single'),
          z.strictObject({
            cols: z.literal(['5/7', '4/8']),
            align: z.enum(['start', 'baseline']).optional(),
          }),
        ])
        .optional(),
      {
        label: 'Head',
        control: 'json',
        snap: ['single', '5/7', '4/8'],
        group: 'Layout',
        help: 'single fills the head slot; cols splits it into headLeft and headRight (item 7).',
      },
    ),
    body: annotate(z.strictObject({ align: z.enum(['start', 'center', 'end']) }).optional(), {
      label: 'Body alignment',
      control: 'json',
      snap: ['start', 'center', 'end'],
      group: 'Layout',
    }),
  }),
  z.strictObject({ type: z.literal('center') }),
  z.strictObject({ type: z.literal('left-mid') }),
  z.strictObject({
    type: z.literal('stack'),
    gap: annotate(z.number().nonnegative().optional(), {
      label: 'Gap',
      control: 'number',
      group: 'Layout',
    }),
  }),
  z.strictObject({ type: z.literal('freeform') }),
]) satisfies z.ZodType<Layout>;

export const pictureSchema = z.strictObject({
  asset: annotate(slugSchema, { label: 'Picture', control: 'asset', group: 'Asset' }),
  fit: z.literal('cover'),
  position: annotate(z.enum(['center', 'top', 'bottom']).optional(), {
    label: 'Position',
    control: 'select',
    snap: ['center', 'top', 'bottom'],
    group: 'Layout',
  }),
}) satisfies z.ZodType<Picture>;

export const PLATE_SIDES = ['lower-left', 'lower-right', 'upper-left'] as const;
export const PLATE_WIDTHS = [740, 560, 720] as const;

export const plateSchema = z.strictObject({
  side: annotate(z.enum(PLATE_SIDES), {
    label: 'Plate side',
    control: 'select',
    snap: PLATE_SIDES,
    group: 'Layout',
    help: 'Opener lower left, mood lower right, closing upper left (SPEC 2.1).',
  }),
  maxWidth: annotate(z.literal(PLATE_WIDTHS), {
    label: 'Plate max width',
    control: 'select',
    snap: PLATE_WIDTHS,
    group: 'Layout',
    help: '740 for an opener, 560 for a mood slide, 720 for the closing (SPEC 2.1).',
  }),
  blocks: z.array(blockSchema),
}) satisfies z.ZodType<Plate>;

export const grammarRecordSchema = z.strictObject({
  kind: z.enum(['content', 'opener', 'mood', 'closing', 'title', 'statement']),
  layout: z.lazy(() => layoutSchema).optional(),
  slots: z.partialRecord(z.enum([...SLOT_NAMES, 'plate']), z.array(z.string())).optional(),
  boxes: z.record(z.string(), positionObjectSchema),
  fields: z
    .strictObject({
      mark: z.strictObject({ w: z.number().positive(), h: z.number().positive() }).optional(),
      measure: z.number().positive().optional(),
      picture: z.lazy(() => pictureSchema).optional(),
      plate: z
        .strictObject({
          side: z.enum(['lower-left', 'lower-right', 'upper-left']),
          maxWidth: z.literal([740, 560, 720]),
        })
        .optional(),
      sectionId: slugSchema.optional(),
      template: z.enum(LAYOUT_IDS).optional(),
      autofit: z.array(z.string()).optional(),
    })
    .optional(),
}) satisfies z.ZodType<GrammarRecord>;

const slideBase = {
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: annotate(slugSchema, { label: 'Id', control: 'readonly', group: 'Slide' }),
  title: annotate(z.string().optional(), {
    label: 'Title override',
    control: 'text',
    group: 'Slide',
    help: 'Replaces the derived title (first heading, big or plate title).',
  }),
  notes: annotate(z.string().optional(), { label: 'Notes', control: 'textarea', group: 'Slide' }),
  tags: annotate(z.array(z.string()).optional(), {
    label: 'Tags',
    control: 'json',
    group: 'Slide',
  }),
  skip: annotate(z.literal(true).optional(), {
    label: 'Skip slide',
    control: 'toggle',
    group: 'Slide',
    help: 'A skipped slide is left out of the slideshow, the shared view, the downloads and the print unless asked (gslides-parity SPEC 7.2.1).',
  }),
  template: annotate(z.union([z.enum(LAYOUT_IDS), customLayoutIdSchema]).optional(), {
    label: 'Layout',
    control: 'select',
    snap: LAYOUT_IDS,
    group: 'Slide',
    help: 'The layout the slide was made from; New slide and Apply layout write it (gslides-parity SPEC 7.2.2). A custom layout of the theme mode is custom-<slug> (gslides-parity SPEC-5 9.2).',
  }),
  transition: annotate(transitionSchema.optional(), {
    label: 'Transition',
    control: 'json',
    group: 'Slide',
    help: 'The transition into this slide, kind and duration in ms; none when absent (gslides-parity SPEC-5 0.12). Slide > Transition writes it.',
  }),
  animations: annotate(animationsSchema.optional(), {
    label: 'Animations',
    control: 'json',
    group: 'Slide',
    help: 'The Motion panel’s list in play order, one entry per animation with its block, effect, trigger and duration (gslides-parity SPEC-5 1.3); none when absent.',
  }),
  background: annotate(slideBackgroundSchema.optional(), {
    label: 'Background',
    control: 'json',
    group: 'Slide',
    help: 'The colour behind the slide; the theme default when absent (gslides-parity SPEC-2 2.6.1). A background picture is a picture object at the bottom of the stack.',
  }),
  grammar: annotate(grammarRecordSchema.optional(), {
    label: 'Arranged from',
    control: 'readonly',
    group: 'Slide',
    help: 'The layout and fields the slide had before it was arranged by hand; Apply layout re-flows from it (gslides-parity SPEC-2 1.2).',
  }),
  ext: extSchema,
};

export const slotsSchema = z.partialRecord(z.enum(SLOT_NAMES), z.array(blockSchema));

export const contentSlideSchema = z.strictObject({
  ...slideBase,
  kind: z.literal('content'),
  layout: layoutSchema,
  slots: slotsSchema,
}) satisfies z.ZodType<ContentSlide>;

export const openerSlideSchema = z.strictObject({
  ...slideBase,
  kind: z.literal('opener'),
  sectionId: annotate(slugSchema, { label: 'Section', control: 'select', group: 'Slide' }),
  picture: pictureSchema,
  plate: plateSchema,
}) satisfies z.ZodType<OpenerSlide>;

export const moodSlideSchema = z.strictObject({
  ...slideBase,
  kind: z.literal('mood'),
  picture: pictureSchema,
  plate: plateSchema,
}) satisfies z.ZodType<MoodSlide>;

export const closingSlideSchema = z.strictObject({
  ...slideBase,
  kind: z.literal('closing'),
  picture: pictureSchema,
  plate: plateSchema,
  mark: markSizeSchema.optional(),
}) satisfies z.ZodType<ClosingSlide>;

export const titleSlideSchema = z.strictObject({
  ...slideBase,
  kind: z.literal('title'),
  mark: markSizeSchema,
  heading: annotate(textSchema, { label: 'Heading', control: 'text', group: 'Text' }),
  /* the subtitle placeholder takes paragraph breaks like Google's, so Enter in it makes a line
     rather than ending the session (build-4/hotfix-4.md cause W4); a one line lead is one
     paragraph, so every existing deck validates and renders byte for byte */
  lead: annotate(multilineTextSchema, { label: 'Lead', control: 'textarea', group: 'Text' }),
}) satisfies z.ZodType<TitleSlide>;

export const statementSlideSchema = z.strictObject({
  ...slideBase,
  kind: z.literal('statement'),
  big: annotate(textSchema, { label: 'Statement', control: 'text', group: 'Text' }),
  measure: annotate(z.number().positive().optional(), {
    label: 'Measure (ch)',
    control: 'number',
    snap: [22, 32],
    group: 'Layout',
  }),
}) satisfies z.ZodType<StatementSlide>;

export const slideSchema = z.discriminatedUnion('kind', [
  contentSlideSchema,
  openerSlideSchema,
  moodSlideSchema,
  closingSlideSchema,
  titleSlideSchema,
  statementSlideSchema,
]) satisfies z.ZodType<Slide>;

export const SLIDE_SCHEMAS = {
  content: contentSlideSchema,
  opener: openerSlideSchema,
  mood: moodSlideSchema,
  closing: closingSlideSchema,
  title: titleSlideSchema,
  statement: statementSlideSchema,
} as const satisfies Record<SlideKind, z.ZodType>;

/** ISO 8601 with a time zone, the form Date.prototype.toISOString writes. */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/);

export const deckSchema = z.strictObject({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: slugSchema,
  title: annotate(z.string().min(1), { label: 'Title', control: 'text', group: 'Slide' }),
  theme: annotate(z.enum(THEMES), {
    label: 'Theme',
    control: 'select',
    snap: THEMES,
    group: 'Slide',
  }),
  sections: z.array(sectionSchema),
  assets: z.record(slugSchema, assetSchema),
  media: annotate(z.record(slugSchema, mediaAssetSchema).optional(), {
    label: 'Media',
    control: 'json',
    group: 'Asset',
    help: 'The stored audio and video files by asset id (gslides-parity SPEC-5 0.16); media.insert writes them.',
  }),
  defaults: z
    .strictObject({
      notes: z.string().optional(),
      appearance: annotate(z.enum(APPEARANCES).optional(), {
        label: 'Theme appearance',
        control: 'select',
        snap: APPEARANCES,
        group: 'Slide',
        help: 'Light or dark; every surface defaults to it (gslides-parity SPEC 7.2.3). Dark when absent.',
      }),
      counter: annotate(z.enum(COUNTER_MODES).optional(), {
        label: 'Slide numbers',
        control: 'select',
        snap: COUNTER_MODES,
        group: 'Slide',
        help: 'on draws the counter on every slide, off on none, skip-title on every slide but the title slide (gslides-parity SPEC 7.2.4). On when absent.',
      }),
      background: annotate(slideBackgroundSchema.optional(), {
        label: 'Background',
        control: 'json',
        group: 'Slide',
        help: 'The background colour every slide without its own takes; Add to theme writes it (gslides-parity SPEC-2 2.6.2).',
      }),
    })
    .optional(),
  guides: annotate(deckGuidesSchema.optional(), {
    label: 'Guides',
    control: 'json',
    group: 'Slide',
    help: 'Vertical (x) and horizontal (y) guide lines in sheet px, the same on every slide; drawn in the editor only (gslides-parity SPEC-2 2.10).',
  }),
  page: annotate(pageSchema.optional(), {
    label: 'Page size',
    control: 'json',
    group: 'Slide',
    help: 'The slide size in sheet px with the Page setup row it came from; 1600 by 900, Widescreen (16:9), when absent (gslides-parity SPEC-5 6.1). Page setup writes it.',
  }),
  language: annotate(languageTagSchema.optional(), {
    label: 'Language',
    control: 'text',
    group: 'Slide',
    help: 'A BCP 47 tag the spell check, the sheet’s lang attribute and the exports read; en-US when absent (gslides-parity SPEC-5 7.1). File > Language writes it.',
  }),
  themeEdits: annotate(themeEditsSchema.optional(), {
    label: 'Theme edits',
    control: 'json',
    group: 'Slide',
    help: 'Edit theme’s override record: the name, colours, fonts, frame, corner mark, counter, chips and type levels the deck changed; the base theme when absent (gslides-parity SPEC-5 9.1).',
  }),
  importedThemes: annotate(z.array(themeRecordSchema).max(IMPORTED_THEMES_MAX).optional(), {
    label: 'Imported themes',
    control: 'json',
    group: 'Slide',
    help: 'The records Import theme appended, at most five, shown under "In this presentation" (gslides-parity SPEC-5 0.28).',
  }),
  customLayouts: annotate(z.record(customLayoutIdSchema, customLayoutSchema).optional(), {
    label: 'Custom layouts',
    control: 'json',
    group: 'Slide',
    help: 'The layouts made in the theme mode by id, and the built in layouts it hid (gslides-parity SPEC-5 9.2).',
  }),
  revision: z.number().int().nonnegative(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  trashedAt: isoDateSchema.optional(),
}) satisfies z.ZodType<Deck>;

/** The appearance a deck defaults to (gslides-parity SPEC 7.2.3): dark when absent. */
export function deckAppearance(deck: Deck): Appearance {
  return deck.defaults?.appearance ?? 'dark';
}

/** The counter mode a deck defaults to (gslides-parity SPEC 7.2.4): on when absent. */
export function deckCounter(deck: Deck): CounterMode {
  return deck.defaults?.counter ?? 'on';
}

/** True when the deck is in the trash. */
export function isTrashed(deck: Pick<Deck, 'trashedAt'>): boolean {
  return typeof deck.trashedAt === 'string' && deck.trashedAt !== '';
}

/** Slide ids in deck order without the skipped slides: what present mode, the view route, the standalone build, print, PDF and PPTX show unless asked (gslides-parity SPEC 7.2.1). */
export function unskippedSlideOrder(document: DeckDocument): SlideId[] {
  return slideOrder(document.deck).filter((id) => document.slides[id]?.skip !== true);
}

// ---------------------------------------------------------------------------------------------
// Derived facts

/** The slot names a layout fills (SPEC 4.2 comments on Layout). */
export function slotsForLayout(layout: Layout): SlotName[] {
  switch (layout.type) {
    case 'cols':
      return ['left', 'right'];
    case 'split':
      return layout.head !== undefined && layout.head !== 'single'
        ? ['headLeft', 'headRight', 'body']
        : ['head', 'body'];
    case 'center':
    case 'left-mid':
    case 'stack':
    case 'freeform':
      return ['main'];
  }
}

/** The layout with its defaults filled, the normalized form the validator stores (SPEC 4.4). */
export function normalizeLayout(layout: Layout): Layout {
  switch (layout.type) {
    case 'cols':
      return {
        type: 'cols',
        ratio: layout.ratio,
        gap: layout.gap ?? 72,
        align: layout.align ?? 'center',
      };
    case 'split':
      return {
        type: 'split',
        gap: layout.gap ?? 56,
        head: layout.head ?? 'single',
        body: layout.body ?? { align: 'center' },
      };
    case 'stack':
      return { type: 'stack', gap: layout.gap ?? 22 };
    case 'center':
    case 'left-mid':
    case 'freeform':
      return { type: layout.type };
  }
}

/** Slide ids in deck order, flattened from the sections; n = index + 1 (AGENTS.md). */
export function slideOrder(deck: Deck): SlideId[] {
  return deck.sections.flatMap((section) => section.slideIds);
}

export function sectionOfSlide(deck: Deck, slideId: SlideId): Section | undefined {
  return deck.sections.find((section) => section.slideIds.includes(slideId));
}

/** Where a top-level block lives: a content slot, or the plate of a picture kind. */
export type BlockPlace = SlotName | 'plate';

/**
 * The blocks of a slide with the slot each lives in: 'plate' for the full-picture kinds, in
 * document order. A canvas slide (gslides-parity SPEC-2 1.1) is a content slide on the freeform
 * layout, so its objects are the blocks of its `main` slot; there is no second list.
 */
export function slideBlocks(slide: Slide): { slot: BlockPlace; block: Block }[] {
  const out: { slot: BlockPlace; block: Block }[] = [];
  if (slide.kind === 'content') {
    for (const [slot, blocks] of Object.entries(slide.slots))
      for (const block of blocks) out.push({ slot: slot as SlotName, block });
  } else if (slide.kind === 'opener' || slide.kind === 'mood' || slide.kind === 'closing') {
    for (const block of slide.plate.blocks) out.push({ slot: 'plate', block });
  }
  return out;
}

/** True for a canvas slide (SPEC-2 1.1): a content slide on the freeform layout. */
export function isCanvasSlide(
  slide: Slide,
): slide is ContentSlide & { layout: { type: 'freeform' } } {
  return slide.kind === 'content' && slide.layout.type === 'freeform';
}

/** The objects of a canvas slide (its top level blocks with `pos`), or none for any other slide. */
export function canvasObjects(slide: Slide): Block[] {
  return isCanvasSlide(slide) ? (slide.slots.main ?? []) : [];
}

/** The background a slide shows (SPEC-2 2.6): its own, else the deck default, else none. */
export function slideBackground(deck: Deck, slide: Slide): SlideBackground | undefined {
  return slide.background ?? deck.defaults?.background;
}

/** The longest title the sidebar and the sheet labels show before an ellipsis (tail:90-94). */
export const TITLE_MAX_CHARS = 72;

/**
 * The first h1 or h2 of an html escape block as plain text, or undefined when it has none. The
 * deck's viewer titles a slide from `h1, h2, .big` (tail:90-94), and an escape slide carries the
 * deck's own markup verbatim, so it is titled the same way. A conservative regex is enough here:
 * the first match wins the way querySelector does, inner tags are dropped and entities decoded.
 */
export function htmlBlockTitle(html: string): string | undefined {
  const match = /<h([12])\b[^>]*>([\s\S]*?)<\/h\1\s*>/i.exec(html);
  if (!match) return undefined;
  const text = collapseWhitespace(decodeEntities((match[2] ?? '').replace(/<[^>]*>/g, '')));
  return text === '' ? undefined : text;
}

/**
 * The title a slide derives from its content (SPEC 4.2): the heading of the title slide, the big
 * text of a statement, else the first heading block of the slots or the plate, looking inside
 * composite cells and html escapes (their first h1 or h2). Markup is removed and the result is
 * trimmed to TITLE_MAX_CHARS with an ellipsis the way the deck's viewer does it (tail:90-94).
 * Undefined when the slide has nothing to derive a title from.
 */
export function derivedSlideTitle(slide: Slide): string | undefined {
  let text: string | undefined;
  if (slide.kind === 'title') text = plainText(slide.heading);
  else if (slide.kind === 'statement') text = plainText(slide.big);
  else text = firstHeading(slideBlocks(slide).map(({ block }) => block));
  if (text === undefined) return undefined;
  const t = collapseWhitespace(text);
  if (t === '') return undefined;
  return t.length > TITLE_MAX_CHARS
    ? `${t.slice(0, TITLE_MAX_CHARS - 3).replace(/\s+\S*$/, '')}...`
    : t;
}

/**
 * The one slide title every surface shows (SPEC 4.2): the override, else the derived title, else
 * `Slide n` when the caller knows the slide number (the sidebar, the sheet labels, the deck's
 * viewer at tail:90-94) and the slide id when it does not (CLI rows, lint messages).
 */
export function slideTitle(slide: Slide, n?: number): string {
  if (slide.title !== undefined && slide.title !== '') return slide.title;
  return derivedSlideTitle(slide) ?? (n === undefined ? slide.id : `Slide ${n}`);
}

function firstHeading(blocks: Block[]): string | undefined {
  for (const block of blocks) {
    if (block.type === 'heading') return plainText(block.text);
    if (block.type === 'html') {
      const inner = htmlBlockTitle(block.html);
      if (inner !== undefined) return inner;
    }
    if (block.type === 'composite') {
      const inner = firstHeading(block.cells.flatMap((cell) => cell.blocks));
      if (inner !== undefined) return inner;
    }
  }
  return undefined;
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
};

/** The entities the deck's headings use; anything else stays as written. */
function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (/^#x/i.test(body)) return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
    if (body.startsWith('#')) return String.fromCodePoint(Number.parseInt(body.slice(1), 10));
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}
