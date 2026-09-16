// The PPTX import report (gslides-parity SPEC-5 0.26, 0.29, 5.1, 5.4): every lossy path writes
// rows, not sentences. `import.pptx` answers this record, the Open snackbar and the Import slides
// report card show its counts ("42 objects imported, 3 shown differently, 1 dropped") with the
// rows behind Details, an agent reads the same object, and it lands beside the deck as
// `import-report.json`. The integrator landed the shape on day 0 as the seam of SPEC-5 1.6 so the
// action table types against it; B3's `packages/import/src/pptx/report.ts` writes it from merge
// 1 and requests any widening here.
import { z } from 'zod';
import type { HexColor } from './color.ts';
import { hexColorSchema } from './color.ts';
import { pageSchema } from './render.ts';
import { slugSchema } from './ids.ts';

/** What became of one source object (SPEC-5 0.26): kept as it was, shown differently, or left out. */
export const IMPORT_ROW_STATUSES = ['kept', 'substituted', 'dropped'] as const;
export type ImportRowStatus = (typeof IMPORT_ROW_STATUSES)[number];

/** The two theme modes (SPEC-5 0.26): `adopt` snaps blacks, whites and greys to tokens; `keep` keeps every hex. */
export const IMPORT_THEME_MODES = ['adopt', 'keep'] as const;
export type ImportThemeMode = (typeof IMPORT_THEME_MODES)[number];

/** The two sheet modes (SPEC-5 0.26): `match` sets the deck's page to the source's, `fit` scales into the current page. */
export const IMPORT_SHEET_MODES = ['match', 'fit'] as const;
export type ImportSheetMode = (typeof IMPORT_SHEET_MODES)[number];

export type ImportReportRow = {
  /** the source slide, one based */
  slideIndex: number;
  /** the slide it became, when it did */
  slideId?: string;
  /** the source object's name or id */
  object?: string;
  status: ImportRowStatus;
  /** a stable code: `shape.preset`, `effect.reflection`, `chart.kind`, `smartart` */
  code: string;
  message: string;
};

export type ImportReport = {
  /** the deck written, absent under dryRun */
  deckId?: string;
  summary: { imported: number; substituted: number; dropped: number; slides: number };
  rows: ImportReportRow[];
  /** every source font family with its run count (SPEC-5 0.26) */
  fonts: { family: string; runs: number; substituted?: string }[];
  theme: {
    mode: ImportThemeMode;
    imported: boolean;
    index?: number;
    /** the source theme's scheme as resolved for Import theme (R04 6; B3's request at merge 1) */
    scheme?: { colors: Record<string, HexColor>; fonts: { major?: string; minor?: string } };
  };
  source: {
    file: string;
    slides: number;
    page: { width: number; height: number };
    /** the producer `docProps/app.xml` names (R04 3) */
    producer?: string;
    /** the `p14:section` count */
    sections?: number;
    /** the embedded font names the presentation part lists */
    embeddedFonts?: string[];
    /** whether `p:modifyVerifier` marks the file as protected against editing (R04 5.10) */
    modifyVerifier?: boolean;
  };
  /** `validateDeck` over the result: the gate the writer checked before it wrote */
  validation: {
    ok: boolean;
    issues: number;
    /** the package validation's lines behind the count (`validatePackage`) */
    lines?: string[];
  };
};

export const importReportRowSchema = z.strictObject({
  slideIndex: z.number().int().positive(),
  slideId: slugSchema.optional(),
  object: z.string().optional(),
  status: z.enum(IMPORT_ROW_STATUSES),
  code: z.string().min(1),
  message: z.string(),
}) satisfies z.ZodType<ImportReportRow>;

export const importReportSchema = z.strictObject({
  deckId: slugSchema.optional(),
  summary: z.strictObject({
    imported: z.number().int().nonnegative(),
    substituted: z.number().int().nonnegative(),
    dropped: z.number().int().nonnegative(),
    slides: z.number().int().nonnegative(),
  }),
  rows: z.array(importReportRowSchema),
  fonts: z.array(
    z.strictObject({
      family: z.string().min(1),
      runs: z.number().int().nonnegative(),
      substituted: z.string().optional(),
    }),
  ),
  theme: z.strictObject({
    mode: z.enum(IMPORT_THEME_MODES),
    imported: z.boolean(),
    index: z.number().int().nonnegative().optional(),
    scheme: z
      .strictObject({
        colors: z.record(z.string(), hexColorSchema),
        fonts: z.strictObject({ major: z.string().optional(), minor: z.string().optional() }),
      })
      .optional(),
  }),
  source: z.strictObject({
    file: z.string().min(1),
    slides: z.number().int().nonnegative(),
    page: pageSchema.pick({ width: true, height: true }),
    producer: z.string().optional(),
    sections: z.number().int().nonnegative().optional(),
    embeddedFonts: z.array(z.string()).optional(),
    modifyVerifier: z.boolean().optional(),
  }),
  validation: z.strictObject({
    ok: z.boolean(),
    issues: z.number().int().nonnegative(),
    lines: z.array(z.string()).optional(),
  }),
}) satisfies z.ZodType<ImportReport>;

/** The one sentence the Open snackbar and the report card print (SPEC-5 0.29, 15). */
export function importSummarySentence(summary: ImportReport['summary']): string {
  return `${summary.imported} objects imported, ${summary.substituted} shown differently, ${summary.dropped} dropped`;
}
