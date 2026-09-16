// Export reports (SPEC 4.2 "export", 8.5). "Identical" is a measured claim per revision: the
// report carries the files, the fonts, the per-slide native and raster split, the page raster
// each flatten slide carries with its measured mismatch, the verify diff, `perfect` (flatten with
// every page raster within 0.1 percent of its source) and `passed`, which is what
// `turboslide export --verify` exits on. The one export target is PPTX (Kevin, 2026-09-11: "instead
// of exporting to google slides just make it perfect pptx"); PDF lands with the publishing builder.
import { z } from 'zod';
import type { BlockId, SlideId } from './ids.ts';
import { blockIdSchema, slugSchema } from './ids.ts';

/** The export formats: PPTX, PDF and, since round five, ODP (gslides-parity SPEC-5 6.3). */
export const EXPORT_FORMATS = ['pptx', 'pdf', 'odp'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];
export type ExportMode = 'native' | 'flatten';

// ---------------------------------------------------------------------------------------------
// Round five (gslides-parity SPEC-5 1.2, 2.4, 2.5, 3.6, 6.2): the widened inputs of export.run
// and build.run, as data so the Download dialog, the CLI help and the skills read one list

/** Editable text keeps the timing tree or drops it (SPEC-5 2.4 `export.run --motion`). */
export const MOTION_EXPORT_MODES = ['keep', 'drop'] as const;
export type MotionExportMode = (typeof MOTION_EXPORT_MODES)[number];

/** How media travels (SPEC-5 3.6): the stored file, the poster alone, or a link for the web page. */
export const MEDIA_EXPORT_MODES = ['embed', 'poster', 'url'] as const;
export type MediaExportMode = (typeof MEDIA_EXPORT_MODES)[number];

/** Google's print layouts (SPEC-5 6.2; R08 4.5): one slide with or without notes, the handouts. */
export const PRINT_LAYOUTS = [
  'slides',
  'notes',
  'handout-2',
  'handout-3',
  'handout-4',
  'handout-6',
  'handout-9',
] as const;
export type PrintLayout = (typeof PRINT_LAYOUTS)[number];

/** Google's layout dropdown strings (SPEC-5 6.2; the handout strings are unverified). */
export const PRINT_LAYOUT_LABELS: Readonly<Record<PrintLayout, string>> = {
  slides: '1 slide without notes',
  notes: '1 slide with notes',
  'handout-2': 'Handout: 2 slides per page',
  'handout-3': 'Handout: 3 slides per page',
  'handout-4': 'Handout: 4 slides per page',
  'handout-6': 'Handout: 6 slides per page',
  'handout-9': 'Handout: 9 slides per page',
};

/** The slides per page of each layout; the page count is `ceil(slides / perPage)`. */
export const PRINT_SLIDES_PER_PAGE: Readonly<Record<PrintLayout, number>> = {
  slides: 1,
  notes: 1,
  'handout-2': 2,
  'handout-3': 3,
  'handout-4': 4,
  'handout-6': 6,
  'handout-9': 9,
};

/** The paper (SPEC-5 6.2; a Turboslide dropdown): the slide's own page, Letter or A4. */
export const PAPERS = ['slide', 'letter', 'a4'] as const;
export type Paper = (typeof PAPERS)[number];

export const ORIENTATIONS = ['landscape', 'portrait'] as const;
export type Orientation = (typeof ORIENTATIONS)[number];

/** The fill order of a handout's cells (R08 4.5): across the rows first, or down the columns. */
export const PRINT_ORDERS = ['across', 'down'] as const;
export type PrintOrder = (typeof PRINT_ORDERS)[number];

/** Google's Auto-play intervals (SPEC-5 0.14), in milliseconds. */
export const AUTOPLAY_INTERVALS_MS = [1000, 2000, 3000, 5000, 10000, 15000, 30000, 60000] as const;

/** One row of a lossy path's report (SPEC-5 0.29): what an agent and the Details view both read. */
export type ExportReportRow = {
  slideId?: string;
  blockId?: string;
  /** a stable code: `transition.fallback`, `media.poster-only`, `equation.raster`, `notes.clipped` */
  code: string;
  message: string;
};

/** The motion summary of an Editable text export (SPEC-5 2.4). */
export type ExportMotionSummary = {
  transitions: number;
  animations: number;
  media: number;
  equations: { native: number; raster: number };
  rows: ExportReportRow[];
};

/** One handout cell's gate result (SPEC-5 6.2; R08 4.11). */
export type ExportCellEntry = {
  page: number;
  cell: number;
  slideId: string;
  /** the mismatched fraction against the area averaged 2x reference */
  fraction?: number;
  ok: boolean;
};

/** One section of `export check` (SPEC-5 16.7): a verdict with its lines and any counts. */
export type ExportCheckSection = { ok: boolean; lines: string[]; counts?: Record<string, number> };

export const exportReportRowSchema = z.strictObject({
  slideId: z.string().optional(),
  blockId: z.string().optional(),
  code: z.string().min(1),
  message: z.string(),
}) satisfies z.ZodType<ExportReportRow>;

export const exportMotionSummarySchema = z.strictObject({
  transitions: z.number().int().nonnegative(),
  animations: z.number().int().nonnegative(),
  media: z.number().int().nonnegative(),
  equations: z.strictObject({
    native: z.number().int().nonnegative(),
    raster: z.number().int().nonnegative(),
  }),
  rows: z.array(exportReportRowSchema),
}) satisfies z.ZodType<ExportMotionSummary>;

export const exportCellEntrySchema = z.strictObject({
  page: z.number().int().positive(),
  cell: z.number().int().nonnegative(),
  slideId: z.string(),
  fraction: z.number().min(0).max(1).optional(),
  ok: z.boolean(),
}) satisfies z.ZodType<ExportCellEntry>;

export const exportCheckSectionSchema = z.strictObject({
  ok: z.boolean(),
  lines: z.array(z.string()),
  counts: z.record(z.string(), z.number()).optional(),
}) satisfies z.ZodType<ExportCheckSection>;

/**
 * How a flatten page raster is encoded (docs/pptx.md "The raster policy"): a two-color page as a
 * 1-bit palette PNG, a page whose colors fit 256 entries (or quantize within budget) as an 8-bit
 * palette PNG, a page with a continuous-tone block as a JPEG at quality 92 when it stays within
 * budget, else a truecolor PNG. Every raster is 2x (3200 by 1800).
 */
export const PAGE_RASTER_FORMATS = ['png-1bit', 'png-palette', 'png-rgba', 'jpeg'] as const;
export type PageRasterFormat = (typeof PAGE_RASTER_FORMATS)[number];

/**
 * The budgets of the page raster policy as mismatched fractions of the page at pixelmatch
 * threshold 0.1: `perfect` is the claim every page must meet for `ExportReport.perfect`, `palette`
 * is what a quantized palette PNG may lose before the exporter falls back to truecolor, `jpeg` is
 * what a JPEG may lose before the exporter keeps the PNG.
 */
export const PAGE_RASTER_BUDGETS = {
  threshold: 0.1,
  perfect: 0.001,
  palette: 0.01,
  jpeg: 0.005,
} as const;

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
 * here). The freeform round added the text box and the three vector primitives (text as a text
 * box, box as a rectangle with a text box, shape as a native rectangle, rounded rectangle,
 * ellipse, line or arrow, rule as a line; docs/freeform.md); the icon block stays a raster like
 * every glyph (SPEC 8.6).
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
  'text',
  'box',
  'shape',
  'rule',
  // the table block is a PPTX table in Editable text, with the ruled rows construction as the
  // fallback named in `residual` when a cell misses the 3 px budget (gslides-parity SPEC 7.3)
  'table',
  // the chart block is a native chart part through addChart in Editable text (gslides-parity
  // SPEC-2 0.24); its box is a picture region in the verify loop
  'chart',
] as const;

export type NativeBlockType = (typeof NATIVE_BLOCK_TYPES)[number];

/**
 * Block types whose pixels are continuous tone (screenshots, photographs, shader frames). A
 * flatten page that carries one may travel as a JPEG when the JPEG stays within budget
 * (docs/pptx.md); every other page is a PNG.
 */
export const CONTINUOUS_TONE_BLOCK_TYPES = [
  'shot',
  'pair',
  'tiles',
  'details',
  'board',
  'material',
] as const;

/**
 * The export choices a menu offers (MILESTONES M5 item 5: the export dialog with mode, theme, font
 * set and headings raster), as data so the studio's dialog, the CLI help and the skills read one
 * list. Every id is an input field of export.run; every value is one the action accepts.
 */
export type ExportOptionChoice = { value: string | number | boolean; label: string; doc: string };
export type ExportOption = {
  id:
    | 'format'
    | 'mode'
    | 'theme'
    | 'fonts'
    | 'embedFonts'
    | 'headings'
    | 'rasterScale'
    | 'pictureScale'
    | 'verify'
    /* round five (gslides-parity SPEC-5 1.2): motion and media for Editable text and the web
       page, the print layouts for PDF, the web page's autoplay */
    | 'motion'
    | 'media'
    | 'layout'
    | 'paper'
    | 'orientation'
    | 'order'
    | 'hideBackground'
    | 'autoplay';
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
        doc: 'One file per theme plus a zip of both, verified through LibreOffice (SPEC 8.2).',
      },
      { value: 'pdf', label: 'PDF', doc: 'Book mode through Chromium print (M6).' },
      {
        value: 'odp',
        label: 'ODP Document (.odp)',
        doc: 'One file per theme for LibreOffice Impress, verified through the same loop as PowerPoint (gslides-parity SPEC-5 6.3).',
      },
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
        label: 'Perfect',
        doc: 'Pixel identical: a 2x raster per page over a searchable invisible text layer, every page measured within 0.1 percent of the web render.',
      },
      {
        value: 'native',
        label: 'Editable text',
        doc: 'Text boxes, hairlines and plates you can edit; layout identical within 3 px, glyph antialiasing differs; icons, marks and diagrams as PNG.',
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
        doc: 'Per-size Inter instances renamed GT Inter (SPEC 8.4).',
      },
      {
        value: 'standard',
        label: 'Standard',
        doc: 'Inter, Inter Medium and GT Inter Display only.',
      },
    ],
  },
  {
    id: 'embedFonts',
    label: 'Embed fonts',
    kind: 'flag',
    default: false,
    choices: [
      {
        value: true,
        label: 'Embed the export faces',
        doc: 'Editable text only: the faces as fntdata parts, so a viewer without them installed keeps the metrics; off by default because PowerPoint repairs files whose font parts it rejects, and the perfect mode has no visible text to embed for.',
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
  /* round five (gslides-parity SPEC-5 2.4, 2.5, 3.6, 6.2): the rows below land with their
     builders' writers (B1 motion and autoplay, B2 media, B4 the print layouts); the Download
     dialog draws a row once its writer answers */
  {
    id: 'motion',
    label: 'Motion',
    kind: 'one',
    default: 'keep',
    choices: [
      {
        value: 'keep',
        label: 'Keep transitions and animations',
        doc: 'Editable text writes the transition and the timing tree of every slide (gslides-parity SPEC-5 2.4); Perfect writes neither.',
      },
      { value: 'drop', label: 'Drop motion', doc: 'Every object at rest and no timing tree.' },
    ],
  },
  {
    id: 'media',
    label: 'Media',
    kind: 'one',
    default: 'embed',
    choices: [
      {
        value: 'embed',
        label: 'Embed the media files',
        doc: 'The stored audio and video travel as parts of the file, under the deck’s media cap (gslides-parity SPEC-5 0.20).',
      },
      {
        value: 'poster',
        label: 'Posters only',
        doc: 'Every media block travels as its poster picture.',
      },
      {
        value: 'url',
        label: 'Link to the media',
        doc: 'The web page plays the media from the studio instead of carrying it (SPEC-5 3.6).',
      },
    ],
  },
  {
    id: 'layout',
    label: 'Layout',
    kind: 'one',
    default: 'slides',
    choices: PRINT_LAYOUTS.map((layout) => ({
      value: layout,
      label: PRINT_LAYOUT_LABELS[layout],
      doc:
        layout === 'slides'
          ? 'One slide per page at the slide’s own size (gslides-parity SPEC-5 6.2).'
          : layout === 'notes'
            ? 'The slide over its speaker notes on the paper (SPEC-5 6.2).'
            : `${PRINT_SLIDES_PER_PAGE[layout]} slides per page on the paper (SPEC-5 6.2).`,
    })),
  },
  {
    id: 'paper',
    label: 'Paper',
    kind: 'one',
    default: 'slide',
    choices: [
      {
        value: 'slide',
        label: 'Slide size',
        doc: 'The slide’s own page; the one slide layout keeps today’s PDF page.',
      },
      {
        value: 'letter',
        label: 'Letter',
        doc: '8.5 by 11 in; the default under en-US (SPEC-5 6.2).',
      },
      { value: 'a4', label: 'A4', doc: '210 by 297 mm; the default elsewhere.' },
    ],
  },
  {
    id: 'orientation',
    label: 'Orientation',
    kind: 'one',
    default: 'landscape',
    choices: [
      { value: 'landscape', label: 'Landscape', doc: 'The paper on its side.' },
      { value: 'portrait', label: 'Portrait', doc: 'The paper upright.' },
    ],
  },
  {
    id: 'order',
    label: 'Order',
    kind: 'one',
    default: 'across',
    choices: [
      {
        value: 'across',
        label: 'Across, then down',
        doc: 'A handout fills each row before the next (R08 4.5).',
      },
      {
        value: 'down',
        label: 'Down, then across',
        doc: 'A handout fills each column before the next.',
      },
    ],
  },
  {
    id: 'hideBackground',
    label: 'Hide background',
    kind: 'flag',
    default: false,
    choices: [
      {
        value: true,
        label: 'Hide background',
        doc: 'The light appearance on white with the paper ground and every background colour removed; the frame, the wordmark, the counter and every picture kept (SPEC-5 6.2).',
      },
    ],
  },
  {
    id: 'autoplay',
    label: 'Auto-play',
    kind: 'one',
    default: 0,
    choices: [
      { value: 0, label: 'Off', doc: 'The web page advances on clicks and keys alone.' },
      ...AUTOPLAY_INTERVALS_MS.map((ms) => ({
        value: ms,
        label:
          ms >= 60000 ? 'Every 1 minute' : `Every ${ms / 1000} second${ms === 1000 ? '' : 's'}`,
        doc: 'The web page advances one step per tick and restarts after the last slide under Loop (gslides-parity SPEC-5 0.14, 2.3).',
      })),
    ],
  },
];

export function isNativeBlockType(type: string): type is NativeBlockType {
  return (NATIVE_BLOCK_TYPES as ReadonlyArray<string>).includes(type);
}

export function isContinuousToneBlockType(type: string): boolean {
  return (CONTINUOUS_TONE_BLOCK_TYPES as ReadonlyArray<string>).includes(type);
}

/** The page raster a flatten slide carries, measured against the sheet shot it was encoded from. */
export type PageRasterEntry = {
  format: PageRasterFormat;
  bytes: number;
  /** Distinct colors of the sheet shot, capped at 4097 (above it the page counts as continuous tone). */
  colors: number;
  /** Pixels of the decoded raster that differ from the shot at pixelmatch threshold 0.1. */
  mismatch: number;
  /** `mismatch` over the page's pixels; `perfect` requires every page under 0.001. */
  fraction: number;
};

export type ExportReport = {
  deckId: string;
  revision: number;
  format: ExportFormat;
  mode: ExportMode;
  theme: 'light' | 'dark';
  fontSet: 'exact' | 'standard';
  fontSetVersion: string;
  files: { path: string; bytes: number; sha256: string }[];
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
    /** Flatten mode: how the sheet shot travels in the file and how far it is from the shot. */
    page?: PageRasterEntry;
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
  /**
   * True for a flatten export whose every page raster decodes within 0.1 percent of the sheet shot
   * it was encoded from (PAGE_RASTER_BUDGETS.perfect) and whose package validated; never true in
   * native mode, whose text is drawn by the viewer.
   */
  perfect: boolean;
  passed: boolean;
  residual: string[];
  /* round five (gslides-parity SPEC-5 1.2, 0.29): every lossy path writes rows; absent on a
     report written before the round or by a writer that has nothing to say */
  /** the page the file was written at (SPEC-5 6.1) */
  page?: { width: number; height: number };
  /** the Editable text motion summary (SPEC-5 2.4) */
  motion?: ExportMotionSummary;
  /** the media that travelled and the ones reduced to a poster (SPEC-5 3.6) */
  media?: ExportReportRow[];
  /** the equations written as OMML and the ones that fell back to the picture (SPEC-5 8.3) */
  equations?: ExportReportRow[];
  /** the print layout of a PDF (SPEC-5 6.2) */
  layout?: PrintLayout;
  paper?: Paper;
  orientation?: Orientation;
  /** the PDF's page count */
  pages?: number;
  /** the per cell gate of a handout (SPEC-5 6.2) */
  cells?: ExportCellEntry[];
  /** the slide ids whose notes the notes page clipped */
  truncatedNotes?: string[];
};

export const pageRasterEntrySchema = z.strictObject({
  format: z.enum(PAGE_RASTER_FORMATS),
  bytes: z.number().int().nonnegative(),
  colors: z.number().int().nonnegative(),
  mismatch: z.number().int().nonnegative(),
  fraction: z.number().min(0).max(1),
}) satisfies z.ZodType<PageRasterEntry>;

export const exportReportSchema = z.strictObject({
  deckId: slugSchema,
  revision: z.number().int().nonnegative(),
  format: z.enum(EXPORT_FORMATS),
  mode: z.enum(['native', 'flatten']),
  theme: z.enum(['light', 'dark']),
  fontSet: z.enum(['exact', 'standard']),
  fontSetVersion: z.string(),
  files: z.array(
    z.strictObject({ path: z.string(), bytes: z.number().int().nonnegative(), sha256: z.string() }),
  ),
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
      page: pageRasterEntrySchema.optional(),
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
  perfect: z.boolean(),
  passed: z.boolean(),
  residual: z.array(z.string()),
  page: z
    .strictObject({ width: z.number().int().positive(), height: z.number().int().positive() })
    .optional(),
  motion: exportMotionSummarySchema.optional(),
  media: z.array(exportReportRowSchema).optional(),
  equations: z.array(exportReportRowSchema).optional(),
  layout: z.enum(PRINT_LAYOUTS).optional(),
  paper: z.enum(PAPERS).optional(),
  orientation: z.enum(ORIENTATIONS).optional(),
  pages: z.number().int().nonnegative().optional(),
  cells: z.array(exportCellEntrySchema).optional(),
  truncatedNotes: z.array(z.string()).optional(),
}) satisfies z.ZodType<ExportReport>;

/**
 * What `turboslide export check <file.pptx>` reports (export.check): the package walked as a zip
 * against its content types and relationships, the page count and size, the media formats, the
 * embedded fonts, the slide names, python-pptx reopening the file when an interpreter with the
 * module exists, and QuickLook rendering the first page when macOS provides it.
 */
export type ExportCheck = {
  file: string;
  bytes: number;
  parts: number;
  slides: number;
  notes: number;
  pageSize: { cx: number; cy: number };
  pageSizeOk: boolean;
  /** Slide names from `<p:cSld name>`, in slide order. */
  slideNames: string[];
  /** Slides that carry a title placeholder (hidden or visible). */
  titledSlides: number;
  /** Media parts per format: png-1bit, png-palette, png-rgba, png-gray, jpeg, other. */
  formats: Record<string, number>;
  mediaBytes: number;
  embeddedFonts: string[];
  custGeom: number;
  normAutofit: number;
  kernZero: number;
  shapes: number;
  outOfBounds: number;
  /** The parity round two counts (gslides-parity SPEC-2 11.3), written by exports of this round. */
  italicRuns?: number;
  rotated?: number;
  groups?: number;
  charts?: number;
  connectors?: number;
  numCol?: number;
  avLst?: number;
  tables?: number;
  mergedCells?: number;
  relationships: { checked: number; invalid: string[] };
  contentTypes: { undeclared: string[]; missingOverrides: string[] };
  pythonPptx: { ran: boolean; python?: string; slides?: number; shapes?: number; error?: string };
  quickLook: {
    ran: boolean;
    png?: string;
    width?: number;
    height?: number;
    ms?: number;
    error?: string;
  };
  issues: string[];
  valid: boolean;
  /* round five (gslides-parity SPEC-5 1.2, 16.7): one section per check module, absent when the
     module had nothing to read (a PPTX has no odf section, an SVG no motion section) */
  /** an ODP's package rules: mimetype first and stored, the manifest complete (SPEC-5 6.3) */
  container?: ExportCheckSection;
  /** an ODP's transition, animation, media and preset attribute names (SPEC-5 6.3) */
  odf?: ExportCheckSection;
  /** one transition per slide, the effect nodes with their presetID, the bldP count (SPEC-5 2.6) */
  motion?: ExportCheckSection;
  /** a:audioFile, a:videoFile, p14:media, the parts and the five content types (SPEC-5 3.9) */
  media?: ExportCheckSection;
  /** the a14:m count against the block count (SPEC-5 8.4) */
  equations?: ExportCheckSection;
  /** an SVG's root namespace, viewBox, no script, no on*, hrefs, use targets, one title and desc (SPEC-5 0.33) */
  svg?: ExportCheckSection;
};

export const exportCheckSchema = z.strictObject({
  file: z.string(),
  bytes: z.number().int().nonnegative(),
  parts: z.number().int().nonnegative(),
  slides: z.number().int().nonnegative(),
  notes: z.number().int().nonnegative(),
  pageSize: z.strictObject({ cx: z.number().int(), cy: z.number().int() }),
  pageSizeOk: z.boolean(),
  slideNames: z.array(z.string()),
  titledSlides: z.number().int().nonnegative(),
  formats: z.record(z.string(), z.number().int().nonnegative()),
  mediaBytes: z.number().int().nonnegative(),
  embeddedFonts: z.array(z.string()),
  custGeom: z.number().int().nonnegative(),
  normAutofit: z.number().int().nonnegative(),
  kernZero: z.number().int().nonnegative(),
  shapes: z.number().int().nonnegative(),
  outOfBounds: z.number().int().nonnegative(),
  italicRuns: z.number().int().nonnegative().optional(),
  rotated: z.number().int().nonnegative().optional(),
  groups: z.number().int().nonnegative().optional(),
  charts: z.number().int().nonnegative().optional(),
  connectors: z.number().int().nonnegative().optional(),
  numCol: z.number().int().nonnegative().optional(),
  avLst: z.number().int().nonnegative().optional(),
  tables: z.number().int().nonnegative().optional(),
  mergedCells: z.number().int().nonnegative().optional(),
  relationships: z.strictObject({
    checked: z.number().int().nonnegative(),
    invalid: z.array(z.string()),
  }),
  contentTypes: z.strictObject({
    undeclared: z.array(z.string()),
    missingOverrides: z.array(z.string()),
  }),
  pythonPptx: z.strictObject({
    ran: z.boolean(),
    python: z.string().optional(),
    slides: z.number().int().nonnegative().optional(),
    shapes: z.number().int().nonnegative().optional(),
    error: z.string().optional(),
  }),
  quickLook: z.strictObject({
    ran: z.boolean(),
    png: z.string().optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    ms: z.number().int().nonnegative().optional(),
    error: z.string().optional(),
  }),
  issues: z.array(z.string()),
  valid: z.boolean(),
  container: exportCheckSectionSchema.optional(),
  odf: exportCheckSectionSchema.optional(),
  motion: exportCheckSectionSchema.optional(),
  media: exportCheckSectionSchema.optional(),
  equations: exportCheckSectionSchema.optional(),
  svg: exportCheckSectionSchema.optional(),
}) satisfies z.ZodType<ExportCheck>;
