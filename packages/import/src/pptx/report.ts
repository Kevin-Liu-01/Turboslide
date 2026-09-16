// The import report builder (gslides-parity SPEC-5 0.26, 0.29, 5.4, 16.3): every lossy path
// writes a row, never a sentence. The reader calls `keep`, `substitute` and `drop` once per source
// object, `font` once per run, and `build` answers the `ImportReport` of
// `@turboslide/schema/import-report` (the seam the action table types against), parsed through
// its schema so a malformed report never leaves the reader. The counts: `imported` is every
// object that became a block (kept as it was or shown differently), `substituted` the ones shown
// differently, `dropped` the ones left out, so "42 objects imported, 3 shown differently, 1
// dropped" describes 43 source objects and the fidelity table's kept, substituted and dropped
// (`fidelity()`) sum to the source's shape count. Row codes are stable strings (`shape.preset`,
// `effect.reflection`, `chart.kind`, `smartart`, ...) the expected reports pin row for row.
import type {
  ImportReport,
  ImportReportRow,
  ImportRowStatus,
  ImportSheetMode,
  ImportThemeMode,
} from '@turboslide/schema/import-report';
import { importReportSchema } from '@turboslide/schema/import-report';

/** A row without its status; the builder adds it. */
export type RowInput = Omit<ImportReportRow, 'status'>;

/** The kept, substituted and dropped counts, which sum to the source's objects (SPEC-5 16.3). */
export type Fidelity = { objects: number; kept: number; substituted: number; dropped: number };

/** The source facts (`producer`, `sections`, `embeddedFonts` and `modifyVerifier` landed in the schema at merge 1, B3-2). */
export type ReportSource = ImportReport['source'];

export type BuildInput = {
  deckId?: string;
  slides: number;
  theme: { mode: ImportThemeMode; imported: boolean; index?: number };
  sheet?: ImportSheetMode;
  source: ReportSource;
  validation: { ok: boolean; issues: number };
};

/** The row codes the reader writes, one stable string per lossy class (docs/import-pptx.md lists them). */
export const ROW_CODES = {
  packageInvalid: 'package.invalid',
  slideHidden: 'slide.hidden',
  placeholderEmpty: 'placeholder.empty',
  placeholderFooter: 'placeholder.footer',
  masterChrome: 'master.chrome',
  transitionKind: 'transition.kind',
  transitionDirection: 'transition.direction',
  animationEffect: 'animation.effect',
  animationDropped: 'animation.dropped',
  shapePreset: 'shape.preset',
  shapeFill: 'shape.fill',
  shapeEffect: 'shape.effect',
  textRunSize: 'text.runSize',
  textFamily: 'text.family',
  textSoftBreak: 'text.softBreak',
  textMixedList: 'text.mixedList',
  textLink: 'text.link',
  pictureFormat: 'picture.format',
  pictureEffect: 'picture.effect',
  tableColumns: 'table.columns',
  tableBorder: 'table.border',
  chartKind: 'chart.kind',
  chartTruncated: 'chart.truncated',
  mediaFormat: 'media.format',
  mediaCap: 'media.cap',
  smartart: 'smartart',
  ole: 'ole',
  ink: 'ink',
  zoom: 'zoom',
  groupNested: 'group.nested',
  equationImported: 'equation.mathml',
  perfectRaster: 'perfect.raster',
  themeLayouts: 'theme.layouts',
  slideSplit: 'slide.split',
  sheetBars: 'sheet.bars',
} as const;

export type RowCode = (typeof ROW_CODES)[keyof typeof ROW_CODES];

export class ImportReportBuilder {
  private readonly rows: ImportReportRow[] = [];
  private keptCount = 0;
  private readonly fontRuns = new Map<string, number>();

  /** One source object landed as itself. */
  keep(count = 1): void {
    this.keptCount += count;
  }

  /** The row count now, for `keepUnless`. */
  mark(): number {
    return this.rows.length;
  }

  /**
   * Counts one object as kept unless a substituted or dropped row was written for it since
   * `mark`, so an object with a folded fill or a dropped effect counts once (SPEC-5 16.3: the
   * three counts sum to the source's objects).
   */
  keepUnless(mark: number): void {
    const since = this.rows.slice(mark);
    if (since.some((row) => row.status === 'substituted' || row.status === 'dropped')) return;
    this.keptCount += 1;
  }

  /** A row of any status; `kept` rows are notes on objects that landed as they were. */
  row(status: ImportRowStatus, input: RowInput): ImportReportRow {
    const row: ImportReportRow = { ...input, status };
    this.rows.push(row);
    return row;
  }

  /** One source object landed, shown differently; the row says how. */
  substitute(input: RowInput): ImportReportRow {
    return this.row('substituted', input);
  }

  /** One source object was left out; the row says why. */
  drop(input: RowInput): ImportReportRow {
    return this.row('dropped', input);
  }

  /** A source font family seen on `runs` runs (SPEC-5 0.26, `report.fonts`). */
  font(family: string, runs = 1): void {
    const name = family.trim();
    if (name === '') return;
    this.fontRuns.set(name, (this.fontRuns.get(name) ?? 0) + runs);
  }

  /** Every family with its run count, the most used first, ties by name. */
  fonts(substitutedWith?: string): ImportReport['fonts'] {
    return [...this.fontRuns.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([family, runs]) =>
        substitutedWith === undefined
          ? { family, runs }
          : { family, runs, substituted: substitutedWith },
      );
  }

  /** The rows written so far. */
  list(): readonly ImportReportRow[] {
    return this.rows;
  }

  /** The rows of one source slide. */
  rowsOf(slideIndex: number): ImportReportRow[] {
    return this.rows.filter((row) => row.slideIndex === slideIndex);
  }

  /** The kept, substituted and dropped counts (SPEC-5 16.3). */
  fidelity(): Fidelity {
    const substituted = this.rows.filter((row) => row.status === 'substituted').length;
    const dropped = this.rows.filter((row) => row.status === 'dropped').length;
    return {
      objects: this.keptCount + substituted + dropped,
      kept: this.keptCount,
      substituted,
      dropped,
    };
  }

  /** The summary the sentence prints: `imported` is kept plus substituted. */
  summary(slides: number): ImportReport['summary'] {
    const { kept, substituted, dropped } = this.fidelity();
    return { imported: kept + substituted, substituted, dropped, slides };
  }

  /** The report, parsed through the schema. */
  build(input: BuildInput, substitutedFontFamily?: string): ImportReport {
    const theme: ImportReport['theme'] = { mode: input.theme.mode, imported: input.theme.imported };
    if (input.theme.index !== undefined) theme.index = input.theme.index;
    const source = input.source;
    const report: ImportReport = {
      ...(input.deckId !== undefined ? { deckId: input.deckId } : {}),
      summary: this.summary(input.slides),
      rows: [...this.rows],
      fonts: this.fonts(substitutedFontFamily),
      theme,
      source,
      validation: input.validation,
    };
    return importReportSchema.parse(report);
  }
}

/** The kept, substituted and dropped counts of a finished report (`kept` is `imported` less `substituted`). */
export function fidelityOf(report: ImportReport): Fidelity {
  const { imported, substituted, dropped } = report.summary;
  return { objects: imported + dropped, kept: imported - substituted, substituted, dropped };
}
