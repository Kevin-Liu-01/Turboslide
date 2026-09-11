// Export reports (SPEC 4.2 "export", 8.5). "Identical" is a measured claim per revision: the
// report carries the files, the fonts, the per-slide native and raster split and the verify
// diff, and `passed` is what `turboslide export --verify` exits on.
import { z } from 'zod';
import type { BlockId, SlideId } from './ids.ts';
import { blockIdSchema, slugSchema } from './ids.ts';

export type ExportFormat = 'pptx' | 'gslides' | 'pdf';
export type ExportMode = 'native' | 'flatten';

/**
 * Block types the M2 exporter writes as native text in both modes (MILESTONES M2 item 4: the
 * archetypes measured in the pptx report). Every other block type is a 2x raster in native mode,
 * and its text is recoverable only through the invisible layer in flatten mode. The lint rule
 * export/non-native and the exporter's report read this one list (SPEC 3.3 item 3 keeps lint and
 * export from importing each other, so the classification lives here).
 */
export const NATIVE_BLOCK_TYPES = [
  'heading',
  'paragraph',
  'credit',
  'rows',
  'plain',
  'panel',
] as const;

export type NativeBlockType = (typeof NATIVE_BLOCK_TYPES)[number];

export function isNativeBlockType(type: string): type is NativeBlockType {
  return (NATIVE_BLOCK_TYPES as ReadonlyArray<string>).includes(type);
}

export type ExportReport = {
  deckId: string;
  revision: number;
  format: ExportFormat;
  mode: ExportMode;
  theme: 'light' | 'dark';
  fontSet: 'exact' | 'standard';
  fontSetVersion: string;
  files: { path: string; bytes: number; sha256: string }[];
  presentationId?: string;
  url?: string;
  fonts: { embedded: string[]; requiredOnViewer: string[]; substitutedIn: string[] };
  slides: {
    slideId: SlideId;
    /**
     * The theme the entry belongs to. A two-theme run's merged report lists every theme's slides,
     * so a reader attributes an entry (and its `verify.ref`) to a file by this field, not by
     * position; the per-theme reports carry it too and it agrees with their root `theme`.
     */
    theme?: 'light' | 'dark';
    native: BlockId[];
    raster: BlockId[];
    /** Flatten mode: the 2x sheet shot the slide carries as its background, relative to the report. */
    sheet?: string;
    /**
     * The picture's box in sheet px. `regenerated` is true when the export replaced the twin with
     * a two-tone dither regenerated at 2x from the one-bit image (SPEC 8.2 flatten), so the
     * region is verified against the embedded sheet, not against the browser's bilinear upscale.
     */
    pictures?: { box: [number, number, number, number]; regenerated: boolean }[];
    verify?: {
      mismatch: number;
      /** Mismatched fraction outside regenerated picture regions. */
      fraction: number;
      /** The reference scale the diff ran at: 2 for flatten (the raster's own scale), 1 for native. */
      scale?: number;
      /** Regenerated picture regions against the embedded sheet, when the slide has one. */
      pictureMismatch?: number;
      pictureFraction?: number;
      blocks: { blockId: BlockId; dx: number; dy: number; dw: number; ok: boolean }[];
      ref: string;
      got: string;
      diff: string;
    };
  }[];
  /** the overflow assertion re-run on the exported EMU geometry */
  geometryInBounds: boolean;
  passed: boolean;
  residual: string[];
};

export const exportReportSchema = z.strictObject({
  deckId: slugSchema,
  revision: z.number().int().nonnegative(),
  format: z.enum(['pptx', 'gslides', 'pdf']),
  mode: z.enum(['native', 'flatten']),
  theme: z.enum(['light', 'dark']),
  fontSet: z.enum(['exact', 'standard']),
  fontSetVersion: z.string(),
  files: z.array(
    z.strictObject({ path: z.string(), bytes: z.number().int().nonnegative(), sha256: z.string() }),
  ),
  presentationId: z.string().optional(),
  url: z.string().optional(),
  fonts: z.strictObject({
    embedded: z.array(z.string()),
    requiredOnViewer: z.array(z.string()),
    substitutedIn: z.array(z.string()),
  }),
  slides: z.array(
    z.strictObject({
      slideId: slugSchema,
      theme: z.enum(['light', 'dark']).optional(),
      native: z.array(blockIdSchema),
      raster: z.array(blockIdSchema),
      sheet: z.string().optional(),
      pictures: z
        .array(
          z.strictObject({
            box: z.tuple([z.number(), z.number(), z.number(), z.number()]),
            regenerated: z.boolean(),
          }),
        )
        .optional(),
      verify: z
        .strictObject({
          mismatch: z.number().nonnegative(),
          fraction: z.number().min(0).max(1),
          scale: z.number().positive().optional(),
          pictureMismatch: z.number().nonnegative().optional(),
          pictureFraction: z.number().min(0).max(1).optional(),
          blocks: z.array(
            z.strictObject({
              blockId: blockIdSchema,
              dx: z.number(),
              dy: z.number(),
              dw: z.number(),
              ok: z.boolean(),
            }),
          ),
          ref: z.string(),
          got: z.string(),
          diff: z.string(),
        })
        .optional(),
    }),
  ),
  geometryInBounds: z.boolean(),
  passed: z.boolean(),
  residual: z.array(z.string()),
}) satisfies z.ZodType<ExportReport>;
