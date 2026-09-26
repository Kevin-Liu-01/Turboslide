// export.run for PPTX (SPEC 7.1, 8.2, 8.5): scenes from the renderer, one file per theme through
// the PPTX builder and the OOXML post-process, the typed report per theme and merged, and the
// verify hook. Flatten is the default and the only pixel-identical mode ("Perfect" in the menu);
// native ("Editable text") ships text for the archetypes measured in the pptx report. The files
// are `<deckId>-<theme>.pptx` under the output directory, plus `<deckId>-both.zip` holding both
// when both themes are exported, the reports `export-report-<theme>.json` and `export-report.json`.
//
// The Google Slides parity round (gslides-parity SPEC 7.2.1, 7.2.13, 7.3): skipped slides stay
// out of the file unless `includeSkipped`, and the counter counts what the file holds; the notes
// travel only under `includeNotes`; a table block is an `a:tbl` in Editable text unless a verify
// pass finds one of its cells outside the 3 px budget, in which case the theme's file is rebuilt
// with that table as ruled rows and verified again, and the report names it under `residual`.
// That loop needs the verify pass inside the export, so `verify` here runs the LibreOffice loop
// per theme (the caller no longer verifies afterwards); the merged report is the union of the
// verified per theme reports.
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';

import JSZip from 'jszip';

import type { DeckDocument } from '@turboslide/schema/deck';
import { slideOrder, unskippedSlideOrder } from '@turboslide/schema/deck';
import type { ExportMode, ExportReport } from '@turboslide/schema/export';
import { exportReportSchema, NATIVE_BLOCK_TYPES } from '@turboslide/schema/export';

import { materializeForExport } from './dither-variants.ts';
import type { Theme } from '@turboslide/schema/render';

import { ENTRY_DATE } from './ooxml/zip.ts';
import { buildPptx } from './pptx/build.ts';
import type { BuildResult, TableMode } from './pptx/build.ts';
import { DEFAULT_BASELINE } from './pptx/baseline.ts';
import type { BaselineTarget } from './pptx/baseline.ts';
import { loadFontsCatalog } from './pptx/fonts-map.ts';
import type { FontSet, FontsCatalog } from './pptx/fonts-map.ts';
import type { PageRaster } from './pptx/page-raster.ts';
import { buildReport, fileEntry, mergeReports } from './report.ts';
import { extractScenes } from './scene/extract.ts';
import type { RasterScalePolicy } from './scene/extract.ts';
import type { PictureScale } from './scene/two-tone.ts';
import type { Scene } from './scene/types.ts';
import { tableCellFailures, verifyPptx } from './verify/report.ts';
import type { SlideVerification, VerifyOptions } from './verify/report.ts';

export type { TableMode } from './pptx/build.ts';

/** The verify pass inside the export: the loop's options minus what the export supplies itself. */
export type ExportVerifyOptions = Pick<
  VerifyOptions,
  | 'deckDir'
  | 'referenceDir'
  | 'budgets'
  | 'tools'
  | 'timeoutMs'
  | 'renderPages'
  | 'quickLook'
  | 'log'
  | 'env'
>;

export type ExportPptxOptions = {
  deckDir: string;
  document: DeckDocument;
  outDir: string;
  mode?: ExportMode;
  themes?: Theme[];
  fonts?: FontSet;
  /** Native mode: embed the export faces as fntdata parts; default off (docs/pptx.md). */
  embedFonts?: boolean;
  excludeShareAlike?: boolean;
  /** The first-baseline target the text boxes are offset for (pptx/baseline.ts); default libreoffice. */
  baseline?: BaselineTarget;
  /** `raster` writes every heading as a PNG instead of a text box (SPEC 8.3 `--headings raster`). */
  headings?: 'raster';
  /** How rasters are scaled: auto (icons and marks 3x, the rest 2x), 2 or 3; default auto. */
  rasterScale?: RasterScalePolicy;
  /** The scale two-tone pictures are regenerated at from the one-bit image; default 2. */
  pictureScale?: PictureScale;
  /** Skip the JPEG candidate of the flatten page raster policy. */
  noJpeg?: boolean;
  /** Write the svgBlip beside the PNG blip of every svg picture (docs/VECTOR.md 4.6); default true. */
  svgVector?: boolean;
  /** Write `<deckId>-both.zip` when both themes are exported; default true. */
  zip?: boolean;
  /** A subset of the play list, in deck order; default every slide of it. */
  slideIds?: string[];
  /** Carry the skipped slides too; left out by default (gslides-parity SPEC 7.2.1). */
  includeSkipped?: boolean;
  /** Carry the speaker notes; left out by default (gslides-parity SPEC 7.2.13, decision 15.2). */
  includeNotes?: boolean;
  /** How a table block travels in Editable text (gslides-parity SPEC 7.3); default auto. */
  tableMode?: TableMode;
  /**
   * Run the verify loop on every theme's file inside the export (SPEC 8.5), and fall a table back
   * to ruled rows when a cell misses the 3 px budget (SPEC 7.3). Needs LibreOffice and poppler.
   */
  verify?: ExportVerifyOptions;
  /** Write `scene-<theme>.json` beside the files for inspection. */
  writeScenes?: boolean;
  /**
   * Materialize the missing dither variants before the shoot (gslides-parity SPEC-3 10.4), on by
   * default so every dithered picture is shot in state `variant`; false leaves the deck's files
   * and records as they are and the residual names the pictures shot live.
   */
  materialize?: boolean;
  fontsCatalog?: FontsCatalog;
  onSlide?: (scene: Scene, ms: number) => void;
  onPage?: (scene: Scene, raster: PageRaster) => void;
  onFile?: (path: string, bytes: number) => void;
};

export type ExportPptxResult = {
  reports: ExportReport[];
  merged: ExportReport;
  reportPath: string;
  reportPaths: Record<string, string>;
  files: string[];
  /** `<deckId>-both.zip` when both themes were exported. */
  zipPath?: string;
  renderer: string;
  scenes: Scene[];
  /** The slides left out because they are skipped (gslides-parity SPEC 7.2.1). */
  omitted: string[];
  /** Tables rebuilt as ruled rows after the verify pass, as `<slideId>#<blockId>` per theme. */
  tableFallbacks: Record<string, string[]>;
  /** The dither variant files this export wrote before the shoot (SPEC-3 10.4), relative to the deck. */
  materialized: string[];
};

export const DEFAULT_MODE: ExportMode = 'flatten';
export const DEFAULT_FONT_SET: FontSet = 'exact';

/** The zip of both theme files, stored (PPTX is a zip already), for one download of the pair. */
export async function zipFiles(paths: readonly string[], out: string): Promise<number> {
  const zip = new JSZip();
  for (const path of paths)
    zip.file(basename(path), readFileSync(path), { compression: 'STORE', date: ENTRY_DATE });
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'STORE' });
  await writeFile(out, bytes);
  return bytes.byteLength;
}

/**
 * The slides a download holds, in deck order (gslides-parity SPEC 7.2.1): the deck without its
 * skipped slides unless asked, narrowed to `slideIds` when given. Returns the play list (what the
 * counter counts over), the ids to export and the skipped ids left out.
 */
export function playList(
  document: DeckDocument,
  options: { includeSkipped?: boolean; slideIds?: readonly string[] },
): { play: string[]; ids: string[]; omitted: string[] } {
  const order = slideOrder(document.deck);
  const play = options.includeSkipped === true ? order : unskippedSlideOrder(document);
  const omitted = order.filter((id) => !play.includes(id));
  const wanted = options.slideIds ? new Set(options.slideIds) : null;
  const ids = play.filter((id) => wanted === null || wanted.has(id));
  return { play, ids, omitted };
}

export async function exportPptx(options: ExportPptxOptions): Promise<ExportPptxResult> {
  const mode = options.mode ?? DEFAULT_MODE;
  const themes = options.themes ?? ['light', 'dark'];
  const fontSet = options.fonts ?? DEFAULT_FONT_SET;
  const catalog = options.fontsCatalog ?? loadFontsCatalog();
  await mkdir(options.outDir, { recursive: true });
  // every dithered picture reads a variant file, never a live canvas (SPEC-3 10.4): the missing
  // variants are written under the deck's assets/ and recorded on the document the shoot renders
  const materialized =
    options.materialize === false
      ? { document: options.document, written: [] as string[] }
      : await materializeForExport(options.document, options.deckDir, {
          scale: 2,
          ...(options.slideIds !== undefined ? { slideIds: options.slideIds } : {}),
          ...(options.verify?.log !== undefined ? { log: options.verify.log } : {}),
        });
  const document = materialized.document;
  const { deck } = document;
  const workDir = join(options.outDir, 'work');
  const nativeTypes =
    options.headings === 'raster'
      ? NATIVE_BLOCK_TYPES.filter((type) => type !== 'heading')
      : [...NATIVE_BLOCK_TYPES];
  const { play, ids, omitted } = playList(document, options);
  if (ids.length === 0) throw new RangeError('exportPptx: every selected slide is skipped');
  const extracted = await extractScenes({
    deckDir: options.deckDir,
    document,
    themes,
    mode,
    slideIds: ids,
    numbering: play,
    workDir,
    excludeShareAlike: options.excludeShareAlike,
    nativeTypes,
    rasterScale: options.rasterScale ?? 'auto',
    pictureScale: options.pictureScale ?? 2,
    onSlide: options.onSlide,
  });
  const reports: ExportReport[] = [];
  const reportPaths: Record<string, string> = {};
  const files: string[] = [];
  const tableFallbacks: Record<string, string[]> = {};
  for (const theme of themes) {
    const scenes = extracted.scenes.filter((s) => s.theme === theme);
    if (scenes.length === 0) continue;
    if (options.writeScenes)
      await writeFile(
        join(options.outDir, `scene-${theme}.json`),
        `${JSON.stringify(scenes, null, 2)}\n`,
      );
    const wordmarkPath = extracted.wordmark[theme];
    const path = join(options.outDir, `${deck.id}-${theme}.pptx`);
    const reportPath = join(options.outDir, `export-report-${theme}.json`);
    const write = async (fallback: ReadonlySet<string>): Promise<ExportReport> => {
      const built = await buildPptx(scenes, {
        deckId: deck.id,
        deckTitle: deck.title,
        revision: deck.revision,
        theme,
        mode,
        fontSet,
        fontsCatalog: catalog,
        baseline: options.baseline ?? DEFAULT_BASELINE,
        ...(options.embedFonts === true ? { embedFonts: true } : {}),
        ...(options.noJpeg ? { noJpeg: true } : {}),
        ...(options.svgVector === false ? { svgVector: false } : {}),
        ...(options.includeNotes === true ? { includeNotes: true } : {}),
        tableMode: options.tableMode ?? 'auto',
        tableFallback: fallback,
        wordmarkPng:
          wordmarkPath && existsSync(wordmarkPath) ? readFileSync(wordmarkPath) : undefined,
        defaultNotes: deck.defaults?.notes,
        onPage: options.onPage,
      });
      await writeFile(path, built.bytes);
      options.onFile?.(path, built.bytes.byteLength);
      const report = themeReport(built, {
        options,
        scenes,
        mode,
        theme,
        fontSet,
        catalog,
        path,
        renderer: extracted.renderer,
        extractWarnings: extracted.warnings,
        omitted,
      });
      await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
      return report;
    };
    let report = await write(new Set());
    if (options.verify) {
      const verified = await verifyTheme(reportPath, options.verify, options.deckDir);
      report = verified.report;
      const failures = tableCellFailures(verified.slides);
      // The gate of SPEC 7.3: a table whose cell missed the 3 px budget as a:tbl is rewritten as
      // ruled rows (hairlines plus grouped text boxes) and the file verified again; the report
      // names the block under residual (buildPptx writes the line).
      if (mode === 'native' && (options.tableMode ?? 'auto') === 'auto' && failures.size > 0) {
        options.verify.log?.(
          `export: ${failures.size} table(s) missed the per cell budget as a:tbl in ${theme}; rebuilding as ruled rows: ${[...failures].join(', ')}`,
        );
        tableFallbacks[theme] = [...failures];
        await write(failures);
        report = (await verifyTheme(reportPath, options.verify, options.deckDir)).report;
      }
    }
    if (!files.includes(path)) files.push(path);
    reportPaths[theme] = reportPath;
    reports.push(report);
  }
  if (reports.length === 0) throw new RangeError('exportPptx: nothing to export');
  let zipPath: string | undefined;
  if (files.length > 1 && options.zip !== false) {
    zipPath = join(options.outDir, `${deck.id}-both.zip`);
    const bytes = await zipFiles(files, zipPath);
    options.onFile?.(zipPath, bytes);
  }
  // The merged report lists every theme's slides, so each entry names its theme and a reader can
  // attribute a slide (and its verify paths) to a file without parsing them (SPEC 4.2
  // ExportReport); the per-theme reports beside it stay as buildReport wrote them. The zip of
  // both files is listed here only: it is a download, not a file the verify loop renders.
  const mergedBase = mergeReports(reports);
  const merged = exportReportSchema.parse({
    ...mergedBase,
    files: [...mergedBase.files, ...(zipPath ? [fileEntry(zipPath)] : [])],
    slides: reports.flatMap((report) =>
      report.slides.map(({ slideId, ...entry }) => ({ slideId, theme: report.theme, ...entry })),
    ),
    residual: [
      ...mergedBase.residual,
      ...(zipPath ? [`both: ${basename(zipPath)} holds the light and dark files`] : []),
      ...(materialized.written.length > 0
        ? [
            `dither: ${materialized.written.length} variant file(s) written before the shoot; turboslide picture materialize records them on the deck (gslides-parity SPEC-3 10.4)`,
          ]
        : []),
    ],
  });
  const reportPath = join(options.outDir, 'export-report.json');
  await writeFile(reportPath, `${JSON.stringify(merged, null, 2)}\n`);
  return {
    reports,
    merged,
    reportPath,
    reportPaths,
    files,
    ...(zipPath ? { zipPath } : {}),
    renderer: extracted.renderer,
    scenes: extracted.scenes,
    omitted,
    tableFallbacks,
    materialized: materialized.written,
  };
}

/** One verify pass over a theme's report, collecting the per slide verifications for the table gate. */
async function verifyTheme(
  reportPath: string,
  verify: ExportVerifyOptions,
  deckDir: string,
): Promise<{ report: ExportReport; slides: SlideVerification[] }> {
  const slides: SlideVerification[] = [];
  const report = await verifyPptx(reportPath, {
    ...verify,
    deckDir: verify.deckDir ?? deckDir,
    onSlide: (slide) => slides.push(slide),
  });
  return { report, slides };
}

type ThemeReportInput = {
  options: ExportPptxOptions;
  scenes: Scene[];
  mode: ExportMode;
  theme: Theme;
  fontSet: FontSet;
  catalog: FontsCatalog;
  path: string;
  renderer: string;
  extractWarnings: string[];
  omitted: string[];
};

/** The per theme report of one built file. */
function themeReport(built: BuildResult, input: ThemeReportInput): ExportReport {
  const { options, scenes, mode, theme, fontSet, catalog, path } = input;
  // The verify loop reads the sheet shot and the picture region per slide (SPEC 8.5 step 3).
  const slidesWithScene = built.slides.map(({ title: _title, ...entry }) => {
    const scene = scenes.find((s) => s.slideId === entry.slideId);
    if (!scene) return entry;
    const out: ExportReport['slides'][number] = { ...entry };
    if (scene.sheetImage) out.sheet = relative(options.outDir, scene.sheetImage);
    if (scene.picture && !scene.pictureExcluded) {
      out.pictures = [{ box: scene.picture.box, regenerated: scene.pictureRegenerated === true }];
    }
    // the chart boxes (gslides-parity SPEC-2 2.8.1) and a picture object written as the slide
    // background (2.6.4) are picture regions the verify loop reports and never gates: the viewer
    // lays a chart out itself and resamples a picture with its own filter
    const regions = [
      ...(scene.charts ?? []).map((chart) => ({ box: chart.box, regenerated: false })),
      ...(scene.background?.pictureRasterId !== undefined
        ? scene.rasters
            .filter((r) => r.id === scene.background?.pictureRasterId)
            .map((r) => ({ box: r.box, regenerated: false }))
        : []),
    ];
    if (regions.length > 0) out.pictures = [...(out.pictures ?? []), ...regions];
    return out;
  });
  return buildReport({
    deckId: options.document.deck.id,
    revision: options.document.deck.revision,
    mode,
    theme,
    fontSet,
    fontSetVersion: catalog.version,
    files: [path],
    families: built.families,
    embedded: built.embedded,
    slides: slidesWithScene,
    geometryInBounds: built.geometryInBounds,
    perfect: built.perfect,
    residual: [
      `renderer: ${input.renderer}`,
      ...(mode === 'flatten'
        ? [
            'flatten (perfect): the slide is a 2x raster of the sheet under the page raster policy; text is an invisible native layer; the slide title is the slide name and a hidden title placeholder',
          ]
        : [
            "native (editable text): text boxes at the browser boxes, layout within 3 px; the glyph antialiasing is the viewer's",
          ]),
      ...(options.headings === 'raster' ? ['headings: rasterized as PNG (--headings raster)'] : []),
      `rasters: ${options.rasterScale ?? 'auto'} scale policy (auto is 3x for icons and marks, 1x for diagrams and the language specimen, 2x otherwise); two-tone pictures regenerated at ${options.pictureScale ?? 2}x`,
      `package: ${built.validation.parts} parts, ${built.validation.relationships} relationships, ${built.validation.valid ? 'valid' : 'INVALID'} against the content types and relationships`,
      // the report counts the slides the download left out (gslides-parity SPEC 7.2.1)
      input.omitted.length > 0
        ? `skipped: ${input.omitted.length} slide(s) left out (${input.omitted.join(', ')}); pass includeSkipped to carry them`
        : 'skipped: none; every slide of the deck is in the file',
      ...built.residual,
    ],
    warnings: [...input.extractWarnings, ...built.warnings],
  });
}
