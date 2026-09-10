// Export reports (SPEC 4.2 "export", 8.5). "Identical" is a measured claim per revision: the
// report carries the files, the fonts, the per-slide native and raster split and the verify
// diff, and `passed` is what `turboslide export --verify` exits on.
import { z } from 'zod';
import type { BlockId, SlideId } from './ids.ts';
import { blockIdSchema, slugSchema } from './ids.ts';

export type ExportFormat = 'pptx' | 'gslides' | 'pdf';
export type ExportMode = 'native' | 'flatten';

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
    native: BlockId[];
    raster: BlockId[];
    verify?: {
      mismatch: number;
      fraction: number;
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
      native: z.array(blockIdSchema),
      raster: z.array(blockIdSchema),
      verify: z
        .strictObject({
          mismatch: z.number().nonnegative(),
          fraction: z.number().min(0).max(1),
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
