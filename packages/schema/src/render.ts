// Render records (SPEC 4.2 "render"). One record per slide, theme and scale: the headless
// driver measures boxes, line counts, font sizes and weights so judges read structure before
// pixels (SPEC 7.6 item 3), and lists the rasters the exporter must screenshot.
import { z } from 'zod';
import type { AssetId, BlockId, SlideId } from './ids.ts';
import { blockIdSchema, slugSchema } from './ids.ts';

export type Box = [number, number, number, number];

/** The two sheet themes a render, a twin or a finding is stamped with (SPEC 2.1, 4.2). */
export type Theme = 'light' | 'dark';

export const THEME_NAMES = ['light', 'dark'] as const satisfies readonly Theme[];

export type RasterKind = 'dia' | 'dither' | 'icon' | 'mark' | 'shot' | 'html' | 'material';

export const RASTER_KINDS = ['dia', 'dither', 'icon', 'mark', 'shot', 'html', 'material'] as const;

export type RenderRecord = {
  deckId: string;
  slideId: SlideId;
  revision: number;
  theme: 'light' | 'dark';
  scale: 1 | 2;
  image: string;
  /** 'Chrome for Testing 147.0.7727.15, ANGLE Metal, Apple M5 Max' or the SwiftShader string */
  renderer: string;
  pageErrors: string[];
  consoleErrors: string[];
  overflow: { blockId?: BlockId; selector: string; box: Box }[];
  blocks: Record<
    BlockId,
    {
      type: string;
      box: Box;
      lines?: number;
      fontSize?: number;
      fontWeight?: number;
      color?: string;
      /**
       * The height the block's text needs in sheet px, measured from its line boxes plus the
       * padding (gslides-parity SPEC-2 1.6): text/overflow compares it with the box and the fix
       * writes it as pos.h under grow.
       */
      contentHeight?: number;
    }
  >;
  fonts: { status: 'loaded' | 'partial'; faces: string[] };
  anchors: { assetId: AssetId; recipeKey: string; timeMs: number }[];
  rasters: { blockId: BlockId; kind: RasterKind; file: string; box: Box; alpha: boolean }[];
  timing: { readyMs: number; screenshotMs: number };
};

export const boxSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);

export const renderRecordSchema = z.strictObject({
  deckId: slugSchema,
  slideId: slugSchema,
  revision: z.number().int().nonnegative(),
  theme: z.enum(['light', 'dark']),
  scale: z.literal([1, 2]),
  image: z.string(),
  renderer: z.string(),
  pageErrors: z.array(z.string()),
  consoleErrors: z.array(z.string()),
  overflow: z.array(
    z.strictObject({ blockId: blockIdSchema.optional(), selector: z.string(), box: boxSchema }),
  ),
  blocks: z.record(
    z.string(),
    z.strictObject({
      type: z.string(),
      box: boxSchema,
      lines: z.number().int().nonnegative().optional(),
      fontSize: z.number().optional(),
      fontWeight: z.number().optional(),
      color: z.string().optional(),
      contentHeight: z.number().nonnegative().optional(),
    }),
  ),
  fonts: z.strictObject({ status: z.enum(['loaded', 'partial']), faces: z.array(z.string()) }),
  anchors: z.array(
    z.strictObject({ assetId: slugSchema, recipeKey: z.string(), timeMs: z.number() }),
  ),
  rasters: z.array(
    z.strictObject({
      blockId: blockIdSchema,
      kind: z.enum(RASTER_KINDS),
      file: z.string(),
      box: boxSchema,
      alpha: z.boolean(),
    }),
  ),
  timing: z.strictObject({
    readyMs: z.number().nonnegative(),
    screenshotMs: z.number().nonnegative(),
  }),
}) satisfies z.ZodType<RenderRecord>;

/**
 * The GT sheet in px (SPEC 2.1): the default page's size. Since round five the size is the deck's
 * (`deckPage`, gslides-parity SPEC-5 0.30, 6.1); these two stay as the default page's values and
 * every derivation goes through the page helpers below (R08 part 1: SHEET_WIDTH and SHEET_HEIGHT
 * become `DEFAULT_PAGE`).
 */
export const SHEET_WIDTH = 1600;
export const SHEET_HEIGHT = 900;

/** The slide box is inset 57 px with 72 by 80 padding (SPEC 2.1; DECK-GRAMMAR.md:15). */
export const SLIDE_INSET_PX = 57;
export const SLIDE_PAD_PX = { x: 80, y: 72 } as const;

/** The content box's origin, the same on every page: the inset plus the padding (137, 129). */
export const CONTENT_INSET = {
  x: SLIDE_INSET_PX + SLIDE_PAD_PX.x,
  y: SLIDE_INSET_PX + SLIDE_PAD_PX.y,
} as const;

/** The content box of a page (R08 3c): `[137, 129, W - 274, H - 258]`; 1326 by 642 on the GT sheet. */
export function contentBox(page: { width: number; height: number }): Box {
  return [
    CONTENT_INSET.x,
    CONTENT_INSET.y,
    page.width - 2 * CONTENT_INSET.x,
    page.height - 2 * CONTENT_INSET.y,
  ];
}

/** The content box of the default page: the slide inset 57 px with 72 by 80 padding (DECK-GRAMMAR.md:15). */
export const CONTENT_BOX: Box = [137, 129, 1326, 642];

/** Rails and rules at 56 px from the sheet edges (SPEC 2.1). */
export const RAIL_PX = 56;

// ---------------------------------------------------------------------------------------------
// The page (gslides-parity SPEC-5 0.30, 6.1; R08 3a to 3i)

/** Google's four Page setup rows in Google's order (SPEC-5 6.1). */
export const PAGE_PRESETS = [
  'standard-4-3',
  'widescreen-16-9',
  'widescreen-16-10',
  'custom',
] as const;
export type PagePreset = (typeof PAGE_PRESETS)[number];

/** Google's labels for the Page setup dropdown (SPEC-5 6.1). */
export const PAGE_PRESET_LABELS: Readonly<Record<PagePreset, string>> = {
  'standard-4-3': 'Standard (4:3)',
  'widescreen-16-9': 'Widescreen (16:9)',
  'widescreen-16-10': 'Widescreen (16:10)',
  custom: 'Custom',
};

/** The deck's slide size in sheet pixels; `preset` names the row Page setup wrote. */
export type Page = { width: number; height: number; preset?: PagePreset };

/** The sizes of the three named presets under the height rule (R08 3a): 900 px tall, the width from the ratio. */
export const PAGE_PRESET_SIZES: Readonly<Record<Exclude<PagePreset, 'custom'>, Page>> = {
  'standard-4-3': { width: 1200, height: 900, preset: 'standard-4-3' },
  'widescreen-16-9': { width: SHEET_WIDTH, height: SHEET_HEIGHT, preset: 'widescreen-16-9' },
  'widescreen-16-10': { width: 1440, height: 900, preset: 'widescreen-16-10' },
};

/** The page every deck without a `page` field has: the GT sheet (SPEC-5 1.2 "Absent"). */
export const DEFAULT_PAGE: Readonly<Page> = PAGE_PRESET_SIZES['widescreen-16-9'];

/** The custom size bounds in sheet pixels (R08 decisions 11): 1 to 56 inches at 120 per inch. */
export const PAGE_MIN_PX = 120;
export const PAGE_MAX_PX = 6720;

/** One sheet pixel is 1/120 in, 0.6 pt, 7,620 EMU (SPEC-5 0.30). */
export const PAGE_PX_PER_INCH = 120;

export const pageSchema = z.strictObject({
  width: z.number().int().min(PAGE_MIN_PX).max(PAGE_MAX_PX),
  height: z.number().int().min(PAGE_MIN_PX).max(PAGE_MAX_PX),
  preset: z.enum(PAGE_PRESETS).optional(),
}) satisfies z.ZodType<Page>;

/**
 * The page a deck draws on (SPEC-5 6.1): its `page` field, else the GT sheet. The one reader every
 * derivation goes through (`grid(page)`, `geometry(page)`, `pageEmu(page)`, the stage's two custom
 * properties, every export's page); B4's page sweep replaces the sheet constant sites with it from
 * merge 1. Landed by the integrator on day 0 as the identity over the default (SPEC-5 1.6).
 */
export function deckPage(deck: { page?: Page | undefined }): Page {
  return deck.page ?? DEFAULT_PAGE;
}

/** True when a page equals the GT sheet, so every existing gate measures the same pixels (SPEC-5 0.7). */
export function isDefaultPage(page: Page): boolean {
  return page.width === SHEET_WIDTH && page.height === SHEET_HEIGHT;
}

/** The page as a box at the origin, `[0, 0, W, H]`. */
export function pageBox(page: { width: number; height: number }): Box {
  return [0, 0, page.width, page.height];
}

/** The page's centre in sheet pixels: where a new guide, a new object or the zoom lands. */
export function pageCentre(page: { width: number; height: number }): { x: number; y: number } {
  return { x: page.width / 2, y: page.height / 2 };
}

/** The page's aspect ratio, width over height (16/9 on the GT sheet). */
export function pageAspect(page: { width: number; height: number }): number {
  return page.width / page.height;
}

/** The page in inches at 120 sheet pixels per inch (13.333 by 7.5 on the GT sheet). */
export function pageInches(page: { width: number; height: number }): {
  width: number;
  height: number;
} {
  return { width: page.width / PAGE_PX_PER_INCH, height: page.height / PAGE_PX_PER_INCH };
}

// The Page setup units (gslides-parity SPEC-5 6.1; R08 3b, 3h): Google's four unit words, the
// conversion to whole sheet pixels at 120 per inch, and the facts `deck.info` and the dialog print.

/** The Custom size units in Google's order (SPEC-5 6.1): inches, centimeters, points, sheet pixels. */
export const PAGE_UNITS = ['in', 'cm', 'pt', 'px'] as const;
export type PageUnit = (typeof PAGE_UNITS)[number];

/** Google's labels for the unit dropdown (SPEC-5 6.1). */
export const PAGE_UNIT_LABELS: Readonly<Record<PageUnit, string>> = {
  in: 'Inches',
  cm: 'Centimeters',
  pt: 'Points',
  px: 'Pixels',
};

/** Sheet pixels per unit: 120 per inch, 47.244 per centimeter, 1.6667 per point, 1 per sheet pixel (R08 3b). */
export function pxPerUnit(unit: PageUnit): number {
  switch (unit) {
    case 'in':
      return PAGE_PX_PER_INCH;
    case 'cm':
      return PAGE_PX_PER_INCH / 2.54;
    case 'pt':
      return PAGE_PX_PER_INCH / 72;
    case 'px':
      return 1;
  }
}

/** A length in a unit as whole sheet pixels (R08 3b: rounded to the whole pixel). */
export function toSheetPx(value: number, unit: PageUnit): number {
  return Math.round(value * pxPerUnit(unit));
}

/** Sheet pixels in a unit, unrounded; the dialog shows the rounded value back (R08 3b). */
export function fromSheetPx(px: number, unit: PageUnit): number {
  return px / pxPerUnit(unit);
}

/** A length in a unit as the dialog prints it: whole sheet pixels, else up to three decimals with no trailing zeros. */
export function formatPageLength(px: number, unit: PageUnit): string {
  const value = fromSheetPx(px, unit);
  return unit === 'px' ? String(Math.round(value)) : String(Math.round(value * 1000) / 1000);
}

export type PageInput = {
  preset?: PagePreset;
  width?: number;
  height?: number;
  unit?: PageUnit;
};

/**
 * The page a Page setup input names (SPEC-5 6.1; R08 3h): one of the three named presets, or a
 * custom width and height converted to whole sheet pixels in the input's unit (sheet pixels when
 * absent); a custom size that matches a named preset takes that preset's row. A size outside 120
 * to 6720 sheet pixels (1 to 56 inches) is refused with a TypeError naming the bound, so every
 * transport answers 400.
 */
export function pageFromInput(input: PageInput): Page {
  if (input.preset !== undefined && input.preset !== 'custom')
    return { ...PAGE_PRESET_SIZES[input.preset] };
  if (input.width === undefined || input.height === undefined)
    throw new TypeError('Page setup wants a preset, or a width and a height');
  const unit = input.unit ?? 'px';
  const width = toSheetPx(input.width, unit);
  const height = toSheetPx(input.height, unit);
  for (const [side, value] of [
    ['width', width],
    ['height', height],
  ] as const) {
    if (!Number.isFinite(value) || value < PAGE_MIN_PX || value > PAGE_MAX_PX)
      throw new TypeError(
        `Page setup: the ${side} must be between ${PAGE_MIN_PX} and ${PAGE_MAX_PX} sheet pixels (1 to 56 inches); ${input[side]} ${unit} is ${value}`,
      );
  }
  return { width, height, preset: presetOfPage({ width, height }) };
}

/** The page facts `deck.info` reports (SPEC-5 6.1): the size with its preset row, in inches and in EMU, always present. */
export function pageInfo(deck: { page?: Page | undefined }): Page & {
  preset: PagePreset;
  inches: [number, number];
  emu: [number, number];
} {
  const page = deckPage(deck);
  const inches = pageInches(page);
  return {
    width: page.width,
    height: page.height,
    preset: page.preset ?? presetOfPage(page),
    inches: [Math.round(inches.width * 1e6) / 1e6, Math.round(inches.height * 1e6) / 1e6],
    emu: [page.width * PAGE_EMU_PER_PX, page.height * PAGE_EMU_PER_PX],
  };
}

/** One sheet pixel in EMU (SPEC-5 0.30): 914,400 over 120. */
export const PAGE_EMU_PER_PX = 7620;

/** The dialog's readout sentence (R08 3h): "1200 by 900 sheet px, 10 by 7.5 in". */
export function pageSentence(page: { width: number; height: number }): string {
  return `${page.width} by ${page.height} sheet px, ${formatPageLength(page.width, 'in')} by ${formatPageLength(page.height, 'in')} in`;
}

/**
 * The page a pointer clamps to: `PAGE_MAX_PX` on both axes, the bound a server uses when it does
 * not read the deck (the realtime presence pointer, R08 part 1.7).
 */
export const PAGE_CAP: Readonly<Page> = { width: PAGE_MAX_PX, height: PAGE_MAX_PX };

/**
 * A page's preset row from its numbers (R08 3a: the preset is "derivable from the numbers when
 * absent"): one of the three named sizes, else `custom`.
 */
export function presetOfPage(page: { width: number; height: number }): PagePreset {
  for (const [id, size] of Object.entries(PAGE_PRESET_SIZES) as [
    Exclude<PagePreset, 'custom'>,
    Page,
  ][]) {
    if (size.width === page.width && size.height === page.height) return id;
  }
  return 'custom';
}

/**
 * True when a box lies inside the page (the sheet/overflow rule, SPEC 7.7); the GT sheet when no
 * page is given.
 */
export function boxInsideSheet(
  box: Box,
  page: { width: number; height: number } = DEFAULT_PAGE,
): boolean {
  const [x, y, w, h] = box;
  return x >= 0 && y >= 0 && x + w <= page.width && y + h <= page.height;
}

/**
 * True when a position covers the page (the background picture rule, gslides-parity SPEC-2 0.100):
 * the box starts at or before the origin and reaches or passes the far edges.
 */
export function coversPage(
  pos: { x: number; y: number; w: number; h: number },
  page: { width: number; height: number } = DEFAULT_PAGE,
): boolean {
  return pos.x <= 0 && pos.y <= 0 && pos.x + pos.w >= page.width && pos.y + pos.h >= page.height;
}
