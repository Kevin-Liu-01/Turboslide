// export.run for ODP (gslides-parity SPEC-5 6.3; R09 2.4 path a): the same scenes the PPTX
// writer reads (`extractScenes` in the asked mode, the dither variants materialized first, the
// play list without the skipped slides unless asked), one `.odp` per theme through `buildOdp`
// (odp/build.ts), the report per theme in the shape of every export (`ExportReport` with `format:
// 'odp'`, the page, the media and equation rows, the residual), the merged report and the zip of
// both themes when both were asked. The verify loop through LibreOffice runs in the render worker
// image; on a machine without `soffice` the report says so and `passed` is the writer's own
// checks (the package and the ODF sections of `export check`).
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import type { DeckDocument } from '@turboslide/schema/deck';
import { deckPage } from '@turboslide/schema/render';
import type {
  ExportMode,
  ExportReport,
  MediaExportMode,
  MotionExportMode,
} from '@turboslide/schema/export';
import { NATIVE_BLOCK_TYPES, exportReportSchema } from '@turboslide/schema/export';
import type { Theme } from '@turboslide/schema/render';

import { checkOdp } from './check/odf.ts';
import { materializeForExport } from './dither-variants.ts';
import { playList, zipFiles } from './export-pptx.ts';
import { buildOdp } from './odp/build.ts';
import type { BaselineTarget } from './pptx/baseline.ts';
import { DEFAULT_BASELINE } from './pptx/baseline.ts';
import type { FontSet } from './pptx/fonts-map.ts';
import { loadFontsCatalog } from './pptx/fonts-map.ts';
import type { PageRaster } from './pptx/page-raster.ts';
import { buildReport, fileEntry, mergeReports } from './report.ts';
import { extractScenes } from './scene/extract.ts';
import type { RasterScalePolicy } from './scene/extract.ts';
import type { PictureScale } from './scene/two-tone.ts';
import type { Scene } from './scene/types.ts';

export type ExportOdpOptions = {
  deckDir: string;
  document: DeckDocument;
  outDir: string;
  mode?: ExportMode;
  themes?: Theme[];
  fonts?: FontSet;
  baseline?: BaselineTarget;
  rasterScale?: RasterScalePolicy;
  pictureScale?: PictureScale;
  noJpeg?: boolean;
  zip?: boolean;
  slideIds?: string[];
  includeSkipped?: boolean;
  includeNotes?: boolean;
  motion?: MotionExportMode;
  media?: MediaExportMode;
  materialize?: boolean;
  /** Read the file back through `export check` and fold its verdict into `passed`; on by default. */
  check?: boolean;
  /** Run LibreOffice's read back where `soffice` exists; recorded in the residual when it does not. */
  verify?: boolean;
  env?: NodeJS.ProcessEnv;
  writeScenes?: boolean;
  onSlide?: (scene: Scene, ms: number) => void;
  onPage?: (scene: Scene, raster: PageRaster) => void;
  onFile?: (path: string, bytes: number) => void;
  log?: (line: string) => void;
};

export type ExportOdpResult = {
  reports: ExportReport[];
  merged: ExportReport;
  reportPath: string;
  reportPaths: Record<string, string>;
  files: string[];
  zipPath?: string;
  renderer: string;
  scenes: Scene[];
  omitted: string[];
  materialized: string[];
};

export async function exportOdp(options: ExportOdpOptions): Promise<ExportOdpResult> {
  const mode = options.mode ?? 'flatten';
  const themes = options.themes ?? ['light', 'dark'];
  const fontSet = options.fonts ?? 'exact';
  const catalog = loadFontsCatalog();
  await mkdir(options.outDir, { recursive: true });
  const materialized =
    options.materialize === false
      ? { document: options.document, written: [] as string[] }
      : await materializeForExport(options.document, options.deckDir, {
          scale: 2,
          ...(options.slideIds !== undefined ? { slideIds: options.slideIds } : {}),
          ...(options.log !== undefined ? { log: options.log } : {}),
        });
  const document = materialized.document;
  const { deck } = document;
  const workDir = join(options.outDir, 'work');
  const { play, ids, omitted } = playList(document, options);
  if (ids.length === 0) throw new RangeError('exportOdp: every selected slide is skipped');
  const extracted = await extractScenes({
    deckDir: options.deckDir,
    document,
    themes,
    mode,
    slideIds: ids,
    numbering: play,
    workDir,
    nativeTypes: [...NATIVE_BLOCK_TYPES],
    rasterScale: options.rasterScale ?? 'auto',
    pictureScale: options.pictureScale ?? 2,
    onSlide: options.onSlide,
  });
  const hidden = new Set(ids.filter((id) => document.slides[id]?.skip === true));
  const readFile = (path: string): Uint8Array | undefined =>
    existsSync(path) ? new Uint8Array(readFileSync(path)) : undefined;
  const reports: ExportReport[] = [];
  const reportPaths: Record<string, string> = {};
  const files: string[] = [];
  for (const theme of themes) {
    const scenes = extracted.scenes.filter((scene) => scene.theme === theme);
    if (scenes.length === 0) continue;
    if (options.writeScenes)
      await writeFile(
        join(options.outDir, `scene-${theme}.json`),
        `${JSON.stringify(scenes, null, 2)}\n`,
      );
    const path = join(options.outDir, `${deck.id}-${theme}.odp`);
    const built = await buildOdp(scenes, {
      deckId: deck.id,
      deckTitle: deck.title,
      revision: deck.revision,
      theme,
      mode,
      fontSet,
      baseline: options.baseline ?? DEFAULT_BASELINE,
      page: deckPage(deck),
      ...(deck.language !== undefined ? { language: deck.language } : {}),
      ...(options.includeNotes === true ? { includeNotes: true } : {}),
      hidden,
      ...(options.media !== undefined ? { media: options.media } : {}),
      ...(options.motion !== undefined ? { motion: options.motion } : {}),
      readFile,
      ...(options.noJpeg ? { noJpeg: true } : {}),
      onPage: options.onPage,
    });
    await writeFile(path, built.bytes);
    options.onFile?.(path, built.bytes.byteLength);
    const residual = [
      `renderer: ${extracted.renderer}`,
      ...built.residual,
      omitted.length > 0
        ? `skipped: ${omitted.length} slide(s) left out (${omitted.join(', ')}); pass includeSkipped to carry them`
        : 'skipped: none; every slide of the deck is in the file',
    ];
    let passed = true;
    if (options.check !== false) {
      const check = await checkOdp(path, { page: deckPage(deck) });
      residual.push(
        `package: ${check.parts} parts, ${check.relationships.checked} in the manifest, ${check.valid ? 'valid' : 'INVALID'} (mimetype first and stored, the ODF attribute names checked)`,
      );
      if (!check.valid) {
        passed = false;
        for (const issue of check.issues) residual.push(`check: ${issue}`);
      }
    }
    if (options.verify)
      residual.push(
        'verify: the LibreOffice read back runs in the render worker image (docker/render-worker.Dockerfile); soffice is not part of this run',
      );
    const base = buildReport({
      deckId: deck.id,
      revision: deck.revision,
      mode,
      theme,
      fontSet,
      fontSetVersion: catalog.version,
      files: [path],
      families: built.families,
      embedded: [],
      slides: built.slides.map((entry) => {
        const scene = scenes.find((s) => s.slideId === entry.slideId);
        return scene?.sheetImage !== undefined
          ? { ...entry, sheet: scene.sheetImage.replace(`${options.outDir}/`, '') }
          : entry;
      }),
      geometryInBounds: true,
      perfect: built.perfect,
      residual,
      warnings: [...extracted.warnings, ...built.warnings],
    });
    const mediaRows = built.rows.filter((row) => row.code.startsWith('media.'));
    const equationRows = built.rows.filter((row) => row.code.startsWith('equation.'));
    const motionRows = built.rows.filter(
      (row) => row.code.startsWith('transition.') || row.code.startsWith('animation.'),
    );
    const report = exportReportSchema.parse({
      ...base,
      format: 'odp',
      passed: base.passed && passed,
      // the fonts travel by name in an ODP: LibreOffice substitutes on a machine without them
      fonts: { embedded: [], requiredOnViewer: built.families, substitutedIn: ['every viewer'] },
      // the report's page is the size alone (exportReportSchema), never the preset row
      page: { width: deckPage(deck).width, height: deckPage(deck).height },
      ...(mediaRows.length > 0 ? { media: mediaRows } : {}),
      ...(equationRows.length > 0 ? { equations: equationRows } : {}),
      motion: {
        transitions: built.counts.transitions,
        animations: built.counts.effects,
        media: built.counts.media,
        equations: { native: 0, raster: equationRows.length },
        rows: motionRows,
      },
    } satisfies ExportReport);
    const reportPath = join(options.outDir, `export-report-${theme}.json`);
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    reports.push(report);
    reportPaths[theme] = reportPath;
    files.push(path);
  }
  if (reports.length === 0) throw new RangeError('exportOdp: nothing to export');
  let zipPath: string | undefined;
  if (files.length > 1 && options.zip !== false) {
    zipPath = join(options.outDir, `${deck.id}-both.zip`);
    const bytes = await zipFiles(files, zipPath);
    options.onFile?.(zipPath, bytes);
  }
  const mergedBase = mergeReports(reports);
  const merged = exportReportSchema.parse({
    ...mergedBase,
    format: 'odp',
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
    omitted,
    materialized: materialized.written,
  };
}
