// Export reports (SPEC 4.2 "export", 8.5). "Identical" is a measured claim per revision: the
// report carries the files, the fonts, the per-slide native and raster split and the verify
// diff, and `passed` is what `turboslide export --verify` exits on.
import { z } from 'zod';
import type { BlockId, SlideId } from './ids.ts';
import { blockIdSchema, slugSchema } from './ids.ts';

export type ExportFormat = 'pptx' | 'gslides' | 'pdf';
export type ExportMode = 'native' | 'flatten';

/**
 * Block types the exporter writes as native text in both modes (MILESTONES M2 item 4: the
 * archetypes measured in the pptx report; M5 item 5 added the ruled reference list and the type
 * ladder, whose ink is text and hairlines; the two register quote table stays a raster because
 * its 27 px quote has no cut face and the nearest, GT Inter Text 26 Medium, renders 0.8 percent
 * wider in LibreOffice, docs/export-verification.md). Every other block
 * type is a 2x raster in native mode (icons and marks 3x), and its text is recoverable only
 * through the invisible layer in flatten mode. A composite is a grid whose cells' blocks export as
 * themselves. The lint rule export/non-native and the exporter's report read this one list
 * (SPEC 3.3 item 3 keeps lint and export from importing each other, so the classification lives
 * here).
 */
export const NATIVE_BLOCK_TYPES = [
  'heading',
  'paragraph',
  'credit',
  'rows',
  'plain',
  'refs',
  'ladder',
  'panel',
] as const;

export type NativeBlockType = (typeof NATIVE_BLOCK_TYPES)[number];

/**
 * The export choices a menu offers (MILESTONES M5 item 5: the export dialog with mode, theme, font
 * set and headings raster), as data so the studio's dialog, the CLI help and the skills read one
 * list. Every id is an input field of export.run; every value is one the action accepts.
 */
export type ExportOptionChoice = { value: string | number | boolean; label: string; doc: string };
export type ExportOption = {
  id:
    'format' | 'mode' | 'theme' | 'fonts' | 'headings' | 'rasterScale' | 'pictureScale' | 'verify';
  label: string;
  /** `one` picks one value, `many` several (theme), `flag` is on or off. */
  kind: 'one' | 'many' | 'flag';
  default: string | number | boolean | string[];
  choices: ExportOptionChoice[];
};

export const EXPORT_OPTIONS: readonly ExportOption[] = [
  {
    id: 'format',
    label: 'Format',
    kind: 'one',
    default: 'pptx',
    choices: [
      {
        value: 'pptx',
        label: 'PowerPoint (.pptx)',
        doc: 'One file per theme, verified through LibreOffice (SPEC 8.2).',
      },
      {
        value: 'gslides',
        label: 'Google Slides',
        doc: 'A presentation in Drive through the Slides API (SPEC 8.3).',
      },
      { value: 'pdf', label: 'PDF', doc: 'Book mode through Chromium print (M6).' },
    ],
  },
  {
    id: 'mode',
    label: 'Mode',
    kind: 'one',
    default: 'flatten',
    choices: [
      {
        value: 'flatten',
        label: 'Flatten',
        doc: 'Pixel identical: a 2x raster per slide over a searchable invisible text layer.',
      },
      {
        value: 'native',
        label: 'Native',
        doc: 'Editable text boxes, hairlines and plates; icons, marks and diagrams as PNG.',
      },
    ],
  },
  {
    id: 'theme',
    label: 'Theme',
    kind: 'many',
    default: ['light', 'dark'],
    choices: [
      { value: 'light', label: 'Light', doc: 'Ink on paper.' },
      { value: 'dark', label: 'Dark', doc: 'Paper on ink.' },
    ],
  },
  {
    id: 'fonts',
    label: 'Font set',
    kind: 'one',
    default: 'exact',
    choices: [
      {
        value: 'exact',
        label: 'Exact',
        doc: 'Per-size Inter instances renamed GT Inter, embedded (SPEC 8.4).',
      },
      {
        value: 'standard',
        label: 'Standard',
        doc: 'Inter, Inter Medium and GT Inter Display only.',
      },
    ],
  },
  {
    id: 'headings',
    label: 'Headings',
    kind: 'flag',
    default: false,
    choices: [
      {
        value: 'raster',
        label: 'Rasterize headings',
        doc: 'Headings as PNG where the letterforms matter more than editable text (SPEC 8.3).',
      },
    ],
  },
  {
    id: 'rasterScale',
    label: 'Raster scale',
    kind: 'one',
    default: 'auto',
    choices: [
      {
        value: 'auto',
        label: 'Auto',
        doc: 'Icons and marks at 3x, everything else at 2x (SPEC 8.6).',
      },
      { value: 2, label: '2x', doc: 'Every raster at two device pixels per sheet pixel.' },
      { value: 3, label: '3x', doc: 'Every raster at three device pixels per sheet pixel.' },
    ],
  },
  {
    id: 'pictureScale',
    label: 'Two-tone pictures',
    kind: 'one',
    default: 2,
    choices: [
      { value: 2, label: '2x', doc: 'Regenerated from the one-bit image at 3200 by 1800.' },
      { value: 3, label: '3x', doc: 'Regenerated from the one-bit image at 4800 by 2700.' },
    ],
  },
  {
    id: 'verify',
    label: 'Verify',
    kind: 'flag',
    default: false,
    choices: [
      {
        value: true,
        label: 'Verify the file',
        doc: 'Render the export through LibreOffice and diff it against the web render (SPEC 8.5).',
      },
    ],
  },
];

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
