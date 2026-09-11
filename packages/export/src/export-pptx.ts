// export.run for PPTX (SPEC 7.1, 8.2, 8.5): scenes from the renderer, one file per theme through
// the PPTX builder and the OOXML post-process, the typed report per theme and merged, and the
// verify hook. Flatten is the default and the only pixel-identical mode; native ships text for
// the archetypes measured in the pptx report. The files are `<deckId>-<theme>.pptx` under the
// output directory, the reports `export-report-<theme>.json` and `export-report.json`.
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import type { DeckDocument } from '@turboslide/schema/deck';
import type { ExportMode, ExportReport } from '@turboslide/schema/export';
import { exportReportSchema } from '@turboslide/schema/export';
import type { Theme } from '@turboslide/schema/render';

import { buildPptx } from './pptx/build.ts';
import { DEFAULT_BASELINE } from './pptx/baseline.ts';
import type { BaselineTarget } from './pptx/baseline.ts';
import { loadFontsCatalog } from './pptx/fonts-map.ts';
import type { FontSet, FontsCatalog } from './pptx/fonts-map.ts';
import { buildReport, mergeReports } from './report.ts';
import { extractScenes } from './scene/extract.ts';
import type { Scene } from './scene/types.ts';

export type ExportPptxOptions = {
  deckDir: string;
  document: DeckDocument;
  outDir: string;
  mode?: ExportMode;
  themes?: Theme[];
  fonts?: FontSet;
  excludeShareAlike?: boolean;
  /** The first-baseline target the text boxes are offset for (pptx/baseline.ts); default libreoffice. */
  baseline?: BaselineTarget;
  slideIds?: string[];
  /** Write `scene-<theme>.json` beside the files for inspection. */
  writeScenes?: boolean;
  fontsCatalog?: FontsCatalog;
  onSlide?: (scene: Scene, ms: number) => void;
  onFile?: (path: string, bytes: number) => void;
};

export type ExportPptxResult = {
  reports: ExportReport[];
  merged: ExportReport;
  reportPath: string;
  reportPaths: Record<string, string>;
  files: string[];
  renderer: string;
  scenes: Scene[];
};

export const DEFAULT_MODE: ExportMode = 'flatten';
export const DEFAULT_FONT_SET: FontSet = 'exact';

export async function exportPptx(options: ExportPptxOptions): Promise<ExportPptxResult> {
  const mode = options.mode ?? DEFAULT_MODE;
  const themes = options.themes ?? ['light', 'dark'];
  const fontSet = options.fonts ?? DEFAULT_FONT_SET;
  const catalog = options.fontsCatalog ?? loadFontsCatalog();
  const { deck } = options.document;
  await mkdir(options.outDir, { recursive: true });
  const workDir = join(options.outDir, 'work');
  const extracted = await extractScenes({
    deckDir: options.deckDir,
    document: options.document,
    themes,
    mode,
    slideIds: options.slideIds,
    workDir,
    excludeShareAlike: options.excludeShareAlike,
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
      wordmarkPng:
        wordmarkPath && existsSync(wordmarkPath) ? readFileSync(wordmarkPath) : undefined,
      defaultNotes: deck.defaults?.notes,
    });
    // The verify loop reads the sheet shot and the picture region per slide (SPEC 8.5 step 3).
    const slidesWithScene = built.slides.map((entry) => {
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
      residual: [
        `renderer: ${extracted.renderer}`,
        ...(mode === 'flatten'
          ? ['flatten: the slide is a 2x raster of the sheet; text is an invisible native layer']
          : []),
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
  // The merged report lists every theme's slides, so each entry names its theme and a reader can
  // attribute a slide (and its verify paths) to a file without parsing them (SPEC 4.2
  // ExportReport); the per-theme reports beside it stay as buildReport wrote them.
  const merged = exportReportSchema.parse({
    ...mergeReports(reports),
    slides: reports.flatMap((report) =>
      report.slides.map(({ slideId, ...entry }) => ({ slideId, theme: report.theme, ...entry })),
    ),
  });
  const reportPath = join(options.outDir, 'export-report.json');
  await writeFile(reportPath, `${JSON.stringify(merged, null, 2)}\n`);
  return {
    reports,
    merged,
    reportPath,
    reportPaths,
    files,
    renderer: extracted.renderer,
    scenes: extracted.scenes,
  };
}
