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

/** The sheet in px (SPEC 2.1). */
export const SHEET_WIDTH = 1600;
export const SHEET_HEIGHT = 900;

/** The content box: the slide inset 57 px with 72 by 80 padding (SPEC 2.1; DECK-GRAMMAR.md:15). */
export const CONTENT_BOX: Box = [137, 129, 1326, 642];

/** Rails and rules at 56 px from the sheet edges (SPEC 2.1). */
export const RAIL_PX = 56;

/** True when a box lies inside the sheet (the sheet/overflow rule, SPEC 7.7). */
export function boxInsideSheet(box: Box): boolean {
  const [x, y, w, h] = box;
  return x >= 0 && y >= 0 && x + w <= SHEET_WIDTH && y + h <= SHEET_HEIGHT;
}
