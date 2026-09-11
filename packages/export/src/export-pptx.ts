// export.run for PPTX (SPEC 7.1, 8.2, 8.5): scenes from the renderer, one file per theme through
// the PPTX builder and the OOXML post-process, the typed report per theme and merged, and the
// verify hook. Flatten is the default and the only pixel-identical mode ("Perfect" in the menu);
// native ("Editable text") ships text for the archetypes measured in the pptx report. The files
// are `<deckId>-<theme>.pptx` under the output directory, plus `<deckId>-both.zip` holding both
// when both themes are exported, the reports `export-report-<theme>.json` and `export-report.json`.
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';

import JSZip from 'jszip';

import type { DeckDocument } from '@turboslide/schema/deck';
import type { ExportMode, ExportReport } from '@turboslide/schema/export';
import { exportReportSchema, NATIVE_BLOCK_TYPES } from '@turboslide/schema/export';
import type { Theme } from '@turboslide/schema/render';

import { ENTRY_DATE } from './ooxml/zip.ts';
import { buildPptx } from './pptx/build.ts';
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
  /** Write `<deckId>-both.zip` when both themes are exported; default true. */
  zip?: boolean;
  slideIds?: string[];
  /** Write `scene-<theme>.json` beside the files for inspection. */
  writeScenes?: boolean;
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

export async function exportPptx(options: ExportPptxOptions): Promise<ExportPptxResult> {
  const mode = options.mode ?? DEFAULT_MODE;
  const themes = options.themes ?? ['light', 'dark'];
  const fontSet = options.fonts ?? DEFAULT_FONT_SET;
  const catalog = options.fontsCatalog ?? loadFontsCatalog();
  const { deck } = options.document;
  await mkdir(options.outDir, { recursive: true });
  const workDir = join(options.outDir, 'work');
  const nativeTypes =
    options.headings === 'raster'
      ? NATIVE_BLOCK_TYPES.filter((type) => type !== 'heading')
      : [...NATIVE_BLOCK_TYPES];
  const extracted = await extractScenes({
    deckDir: options.deckDir,
    document: options.document,
    themes,
    mode,
    slideIds: options.slideIds,
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
  for (const theme of themes) {
    const scenes = extracted.scenes.filter((s) => s.theme === theme);
    if (scenes.length === 0) continue;
    if (options.writeScenes)
      await writeFile(
        join(options.outDir, `scene-${theme}.json`),
        `${JSON.stringify(scenes, null, 2)}\n`,
      );
    const wordmarkPath = extracted.wordmark[theme];
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
      wordmarkPng:
        wordmarkPath && existsSync(wordmarkPath) ? readFileSync(wordmarkPath) : undefined,
      defaultNotes: deck.defaults?.notes,
      onPage: options.onPage,
    });
    // The verify loop reads the sheet shot and the picture region per slide (SPEC 8.5 step 3).
    const slidesWithScene = built.slides.map(({ title: _title, ...entry }) => {
      const scene = scenes.find((s) => s.slideId === entry.slideId);
      if (!scene) return entry;
      const out: ExportReport['slides'][number] = { ...entry };
      if (scene.sheetImage) out.sheet = relative(options.outDir, scene.sheetImage);
      if (scene.picture && !scene.pictureExcluded) {
        out.pictures = [{ box: scene.picture.box, regenerated: scene.pictureRegenerated === true }];
      }
      return out;
    });
    const path = join(options.outDir, `${deck.id}-${theme}.pptx`);
    await writeFile(path, built.bytes);
    files.push(path);
    options.onFile?.(path, built.bytes.byteLength);
    const report = buildReport({
      deckId: deck.id,
      revision: deck.revision,
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
        `renderer: ${extracted.renderer}`,
        ...(mode === 'flatten'
          ? [
              'flatten (perfect): the slide is a 2x raster of the sheet under the page raster policy; text is an invisible native layer; the slide title is the slide name and a hidden title placeholder',
            ]
          : [
              "native (editable text): text boxes at the browser boxes, layout within 3 px; the glyph antialiasing is the viewer's",
            ]),
        ...(options.headings === 'raster'
          ? ['headings: rasterized as PNG (--headings raster)']
          : []),
        `rasters: ${options.rasterScale ?? 'auto'} scale policy (auto is 3x for icons and marks, 1x for diagrams and the language specimen, 2x otherwise); two-tone pictures regenerated at ${options.pictureScale ?? 2}x`,
        `package: ${built.validation.parts} parts, ${built.validation.relationships} relationships, ${built.validation.valid ? 'valid' : 'INVALID'} against the content types and relationships`,
        ...built.residual,
      ],
      warnings: [...extracted.warnings, ...built.warnings],
    });
    const reportPath = join(options.outDir, `export-report-${theme}.json`);
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
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
  };
}
