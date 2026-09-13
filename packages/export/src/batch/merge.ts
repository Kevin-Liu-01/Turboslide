// The batched Perfect export, part two: the parts and the merge (gslides-parity SPEC-2 8.1, 0.44,
// 0.48). A batch runs `extractScenes` over its slides and stores every scene as JSON beside the
// files the scene names (the 2x sheet shot, the rasters, the regenerated or twin picture, the
// wordmark) under `exports/<deckId>/<jobId>/parts/`; `relocateScene` turns the extractor's
// temp paths into part names for that upload and `localizeScene` turns them back into the paths
// of the folder the merge streamed the parts to. `mergeParts` then runs the same `buildPptx` the
// single call export runs, per theme over the scenes in play order, from the paths on disk with
// no browser, writes the files and the reports the way export-pptx.ts writes them, and samples
// the process's resident memory every second so the caller can record the merge's peak against
// the 3009 MB function (SPEC-2 0.44). Server only: this module reads and writes files.
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';

import JSZip from 'jszip';

import type { ExportMode, ExportReport } from '@turboslide/schema/export';
import { NATIVE_BLOCK_TYPES, exportReportSchema } from '@turboslide/schema/export';
import type { Theme } from '@turboslide/schema/render';

import { ENTRY_DATE } from '../ooxml/zip.ts';
import { DEFAULT_BASELINE } from '../pptx/baseline.ts';
import { buildPptx } from '../pptx/build.ts';
import type { BuildResult } from '../pptx/build.ts';
import { loadFontsCatalog } from '../pptx/fonts-map.ts';
import type { FontSet, FontsCatalog } from '../pptx/fonts-map.ts';
import { buildReport, fileEntry, mergeReports } from '../report.ts';
import type { Scene } from '../scene/types.ts';
import type { ExportPlan } from './plan.ts';
import { batchRecordName, partNames } from './plan.ts';

// ---------------------------------------------------------------------------------------------
// Parts

export type PartUpload = { from: string; to: string };

/**
 * A scene as a batch stores it: every file path replaced by a part name relative to the job's
 * `parts/` prefix, plus the uploads that put the files there. The sheet shot goes under
 * `sheets/<theme>/`, the rasters under `rasters/<theme>/` (their names carry the slide number,
 * the slide id, the raster id and the scale, unique within a theme), the picture under
 * `pictures/<theme>/` whether it is a regenerated two-tone twin or the deck's own twin file.
 */
export function relocateScene(scene: Scene): { scene: Scene; uploads: PartUpload[] } {
  const uploads = new Map<string, string>();
  const place = (from: string | undefined, folder: string): string | undefined => {
    if (from === undefined) return undefined;
    const to = `${folder}/${scene.theme}/${basename(from)}`;
    uploads.set(to, from);
    return to;
  };
  const sheetImage = place(scene.sheetImage, 'sheets');
  const pictureFile = place(scene.pictureFile, 'pictures');
  const rasters = scene.rasters.map((raster) => {
    const file = place(raster.file, 'rasters');
    return file === undefined ? raster : { ...raster, file };
  });
  const out: Scene = {
    ...scene,
    rasters,
    ...(sheetImage === undefined ? {} : { sheetImage }),
    ...(pictureFile === undefined ? {} : { pictureFile }),
  };
  if (sheetImage === undefined) delete out.sheetImage;
  if (pictureFile === undefined) delete out.pictureFile;
  return { scene: out, uploads: [...uploads].map(([to, from]) => ({ from, to })) };
}

/** The stored scene with its part names turned into the paths of the folder the parts were streamed to. */
export function localizeScene(scene: Scene, partsDir: string): Scene {
  const local = (name: string | undefined): string | undefined =>
    name === undefined ? undefined : join(partsDir, ...name.split('/'));
  const sheetImage = local(scene.sheetImage);
  const pictureFile = local(scene.pictureFile);
  const out: Scene = {
    ...scene,
    rasters: scene.rasters.map((raster) => {
      const file = local(raster.file);
      return file === undefined ? raster : { ...raster, file };
    }),
    ...(sheetImage === undefined ? {} : { sheetImage }),
    ...(pictureFile === undefined ? {} : { pictureFile }),
  };
  return out;
}

/** The scene part's name for a scene of the plan. */
export function scenePartName(scene: Scene): string {
  return partNames(scene.n, scene.slideId, scene.theme).scene;
}

/** The wordmark PNG's part name per theme. */
export function wordmarkPartName(theme: Theme): string {
  return `wordmark.${theme}.png`;
}

/** What one finished batch leaves beside its parts, for the merge's report and the dialog. */
export type BatchRecord = {
  index: number;
  slides: string[];
  ms: number;
  renderer: string;
  warnings: string[];
  /** the themes whose wordmark this batch stored */
  wordmark: Theme[];
};

export { batchRecordName };

// ---------------------------------------------------------------------------------------------
// The merge

export type MergeParts = {
  /** the folder the parts were streamed to, with the scene files at its top level */
  partsDir: string;
  /** the scene part files, any order */
  scenes: string[];
  /** the batch records, when the caller read them */
  records?: BatchRecord[];
};

export type MergeDeps = {
  /** where the files and the reports are written */
  outDir: string;
  /** the builder; the real one unless a test hands in a stand in */
  build?: typeof buildPptx;
  fontsCatalog?: FontsCatalog;
  /** how often the resident memory is sampled; default every second */
  sampleMs?: number;
  /** skip the zip of both themes */
  zip?: boolean;
};

export type MergeResult = {
  files: string[];
  zipPath?: string;
  reports: ExportReport[];
  merged: ExportReport;
  reportPath: string;
  reportPaths: Record<string, string>;
  renderer: string;
  /** the largest `process.memoryUsage().rss` sampled during the merge, in MiB */
  peakMb: number;
  ms: number;
  /** the batch records' warnings, per batch */
  warnings: string[];
};

/** The zip of both theme files, stored (PPTX is a zip already), the same bytes export-pptx.ts writes. */
export async function zipStoredFiles(paths: readonly string[], out: string): Promise<number> {
  const zip = new JSZip();
  for (const path of paths)
    zip.file(basename(path), readFileSync(path), { compression: 'STORE', date: ENTRY_DATE });
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'STORE' });
  await writeFile(out, bytes);
  return bytes.byteLength;
}

/** Reads the scene parts, localizes their paths and orders them by theme and play number. */
export async function readSceneParts(parts: MergeParts): Promise<Map<Theme, Scene[]>> {
  const byTheme = new Map<Theme, Scene[]>();
  for (const file of parts.scenes) {
    const scene = localizeScene(JSON.parse(await readFile(file, 'utf8')) as Scene, parts.partsDir);
    const list = byTheme.get(scene.theme) ?? [];
    list.push(scene);
    byTheme.set(scene.theme, list);
  }
  for (const list of byTheme.values()) list.sort((a, b) => a.n - b.n);
  return byTheme;
}

function mib(bytes: number): number {
  return Math.round((bytes / (1024 * 1024)) * 10) / 10;
}

/**
 * Builds the file per theme from the stored parts in play order, the way export-pptx.ts builds
 * it from a fresh extraction: the same `buildPptx` options, the same report lines plus one naming
 * the batches, the merged report and the zip of both themes. A slide of the plan without a scene
 * part is a RangeError naming it (a batch did not finish), so the dialog reports the failure
 * rather than a shorter file.
 */
export async function mergeParts(
  parts: MergeParts,
  plan: ExportPlan,
  deps: MergeDeps,
): Promise<MergeResult> {
  const t = performance.now();
  const build = deps.build ?? buildPptx;
  const catalog = deps.fontsCatalog ?? loadFontsCatalog();
  const mode: ExportMode = plan.mode;
  const fontSet: FontSet = plan.input.fonts ?? 'exact';
  await mkdir(deps.outDir, { recursive: true });
  let peak = process.memoryUsage().rss;
  const sampler = setInterval(() => {
    peak = Math.max(peak, process.memoryUsage().rss);
  }, deps.sampleMs ?? 1000);
  sampler.unref();
  try {
    const byTheme = await readSceneParts(parts);
    for (const theme of plan.themes) {
      const scenes = byTheme.get(theme) ?? [];
      const have = new Set(scenes.map((scene) => scene.slideId));
      const missing = plan.ids.filter((id) => !have.has(id));
      if (missing.length > 0) {
        throw new RangeError(
          `mergeParts: no ${theme} scene for ${missing.length} slide(s) of the plan (${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ', …' : ''}); a batch did not finish`,
        );
      }
    }
    const records = parts.records ?? [];
    const renderer = records.find((record) => record.renderer !== '')?.renderer ?? '';
    const extractWarnings = records.flatMap((record) => record.warnings);
    const reports: ExportReport[] = [];
    const reportPaths: Record<string, string> = {};
    const files: string[] = [];
    for (const theme of plan.themes) {
      const scenes = byTheme.get(theme) ?? [];
      if (scenes.length === 0) continue;
      const wordmarkPath = join(parts.partsDir, wordmarkPartName(theme));
      const path = join(deps.outDir, `${plan.deckId}-${theme}.pptx`);
      const reportPath = join(deps.outDir, `export-report-${theme}.json`);
      const built = await build(scenes, {
        deckId: plan.deckId,
        deckTitle: plan.deckTitle,
        revision: plan.revision,
        theme,
        mode,
        fontSet,
        fontsCatalog: catalog,
        baseline: plan.input.baseline ?? DEFAULT_BASELINE,
        ...(plan.input.embedFonts === true ? { embedFonts: true } : {}),
        ...(plan.input.includeNotes === true ? { includeNotes: true } : {}),
        tableMode: 'auto',
        tableFallback: new Set(),
        wordmarkPng: existsSync(wordmarkPath) ? readFileSync(wordmarkPath) : undefined,
        defaultNotes: plan.defaultNotes,
      });
      await writeFile(path, built.bytes);
      peak = Math.max(peak, process.memoryUsage().rss);
      const report = themeReport(built, {
        plan,
        scenes,
        theme,
        fontSet,
        catalog,
        path,
        outDir: deps.outDir,
        renderer,
        extractWarnings,
      });
      await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
      files.push(path);
      reportPaths[theme] = reportPath;
      reports.push(report);
    }
    if (reports.length === 0) throw new RangeError('mergeParts: nothing to build');
    let zipPath: string | undefined;
    if (files.length > 1 && deps.zip !== false) {
      zipPath = join(deps.outDir, `${plan.deckId}-both.zip`);
      await zipStoredFiles(files, zipPath);
    }
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
    const reportPath = join(deps.outDir, 'export-report.json');
    await writeFile(reportPath, `${JSON.stringify(merged, null, 2)}\n`);
    peak = Math.max(peak, process.memoryUsage().rss);
    return {
      files,
      ...(zipPath ? { zipPath } : {}),
      reports,
      merged,
      reportPath,
      reportPaths,
      renderer,
      peakMb: mib(peak),
      ms: Math.round(performance.now() - t),
      warnings: extractWarnings,
    };
  } finally {
    clearInterval(sampler);
  }
}

type ThemeReportInput = {
  plan: ExportPlan;
  scenes: Scene[];
  theme: Theme;
  fontSet: FontSet;
  catalog: FontsCatalog;
  path: string;
  outDir: string;
  renderer: string;
  extractWarnings: string[];
};

/** The per theme report of one built file, the lines export-pptx.ts writes plus the batch line. */
function themeReport(built: BuildResult, input: ThemeReportInput): ExportReport {
  const { plan, scenes, theme, fontSet, catalog, path } = input;
  const mode = plan.mode;
  const slidesWithScene = built.slides.map(({ title: _title, ...entry }) => {
    const scene = scenes.find((s) => s.slideId === entry.slideId);
    if (!scene) return entry;
    const out: ExportReport['slides'][number] = { ...entry };
    if (scene.sheetImage) out.sheet = relative(input.outDir, scene.sheetImage);
    if (scene.picture && !scene.pictureExcluded) {
      out.pictures = [{ box: scene.picture.box, regenerated: scene.pictureRegenerated === true }];
    }
    return out;
  });
  const nativeTypes =
    plan.input.headings === 'raster'
      ? NATIVE_BLOCK_TYPES.filter((type) => type !== 'heading')
      : NATIVE_BLOCK_TYPES;
  return buildReport({
    deckId: plan.deckId,
    revision: plan.revision,
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
      ...(plan.input.headings === 'raster'
        ? ['headings: rasterized as PNG (--headings raster)']
        : []),
      `rasters: ${plan.input.rasterScale ?? 'auto'} scale policy (auto is 3x for icons and marks, 1x for diagrams and the language specimen, 2x otherwise); two-tone pictures regenerated at ${plan.input.pictureScale ?? 2}x`,
      `package: ${built.validation.parts} parts, ${built.validation.relationships} relationships, ${built.validation.valid ? 'valid' : 'INVALID'} against the content types and relationships`,
      plan.omitted.length > 0
        ? `skipped: ${plan.omitted.length} slide(s) left out (${plan.omitted.join(', ')}); pass includeSkipped to carry them`
        : 'skipped: none; every slide of the deck is in the file',
      `batched: ${plan.batches.length} batch(es) of at most ${Math.max(...plan.batches.map((b) => b.length))} slides, merged from stored parts (gslides-parity SPEC-2 8.1); native types ${nativeTypes.length}`,
      ...built.residual,
    ],
    warnings: [...input.extractWarnings, ...built.warnings],
  });
}
