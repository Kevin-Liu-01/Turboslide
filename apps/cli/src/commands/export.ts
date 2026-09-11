// export.run (SPEC 7.1, 7.2): `turboslide export pptx --mode flatten|native --theme light,dark
// --fonts exact|standard --headings raster --raster-scale auto|2|3 --picture-scale 2|3
// --exclude-share-alike --verify --out <dir>` writes `<deckId>-<theme>.pptx`,
// `export-report-<theme>.json` and the merged `export-report.json`, and exits 1 when the report's
// `passed` is false. `--verify` hands the report to the verify loop (packages/export/src/verify,
// the render worker's LibreOffice pass). `turboslide export gslides --mode flatten|native --theme
// light --dry-run --out <dir>` builds and validates the Slides batchUpdate requests without
// credentials (requests.json, images.json, dry-run.json, the report with no presentationId) and
// exits 0; without --dry-run it needs TURBOSLIDE_GOOGLE_CREDENTIALS, creates one presentation per
// theme and reports the presentationId and URL; `--verify` diffs the LARGE thumbnails (SPEC 8.3,
// MILESTONES M6). PDF lands with the publishing builder.
import { join } from 'node:path';

import type { ExportMode } from '@turboslide/schema/export';
import type { Theme } from '@turboslide/schema/render';
import { exportPptx } from '@turboslide/export/export-pptx';
import { MissingCredentialsError } from '@turboslide/export/gslides/auth';
import { exportGslides } from '@turboslide/export/gslides/build';
import type { HostKind } from '@turboslide/export/gslides/images';
import type { BaselineTarget } from '@turboslide/export/pptx/baseline';
import type { FontSet } from '@turboslide/export/pptx/fonts-map';
import type { RasterScalePolicy } from '@turboslide/export/scene/extract';
import type { PictureScale } from '@turboslide/export/scene/two-tone';
import { verifyPptx } from '@turboslide/export/verify/report';

import { flagBoolean, flagList, flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { derivedDir, findDeckDir, loadDeck, resolveOut } from '../deck-files.ts';
import { EXIT, UsageError } from '../exit.ts';
import { formatBytes } from '../output.ts';
import { selectSlides } from '../select.ts';

function parseMode(ctx: CommandContext): ExportMode {
  const modeFlag = flagString(ctx.args, 'mode') ?? 'flatten';
  if (modeFlag !== 'flatten' && modeFlag !== 'native')
    throw new UsageError('--mode wants flatten or native');
  return modeFlag;
}

function parseThemes(ctx: CommandContext): Theme[] {
  const themes = flagList(ctx.args, 'theme', ['light', 'dark']).filter(
    (t): t is Theme => t === 'light' || t === 'dark',
  );
  if (themes.length === 0) throw new UsageError('--theme wants light, dark or light,dark');
  return themes;
}

export async function exportCommand(ctx: CommandContext): Promise<number> {
  const [format, ...rest] = ctx.rest;
  if (format === undefined)
    throw new UsageError('export wants a format: pptx or gslides (pdf lands in M6)');
  if (format === 'gslides') return exportGslidesCommand(ctx, rest);
  if (format !== 'pptx')
    throw new UsageError(
      `export ${format} is not implemented yet: pptx ships in M2, gslides in M6, pdf in M6`,
    );
  const dir = findDeckDir(ctx.cwd, flagString(ctx.args, 'deck'), ctx.env);
  const loaded = loadDeck(dir);
  const ids = selectSlides(loaded, rest);
  const mode = parseMode(ctx);
  const themes = parseThemes(ctx);
  const fontsFlag = flagString(ctx.args, 'fonts') ?? 'exact';
  if (fontsFlag !== 'exact' && fontsFlag !== 'standard')
    throw new UsageError('--fonts wants exact or standard');
  const fonts: FontSet = fontsFlag;
  const outDir = resolveOut(
    ctx.cwd,
    flagString(ctx.args, 'out'),
    join(derivedDir(dir, ctx.cwd), 'export'),
  );
  const excludeShareAlike = flagBoolean(ctx.args, 'exclude-share-alike');
  const baselineFlag = flagString(ctx.args, 'baseline-target') ?? 'libreoffice';
  if (baselineFlag !== 'libreoffice' && baselineFlag !== 'none')
    throw new UsageError(
      '--baseline-target wants libreoffice (the verify renderer, default) or none',
    );
  const baseline: BaselineTarget = baselineFlag;
  const headingsFlag = flagString(ctx.args, 'headings');
  if (headingsFlag !== undefined && headingsFlag !== 'raster')
    throw new UsageError('--headings wants raster (SPEC 8.3)');
  const rasterFlag = flagString(ctx.args, 'raster-scale') ?? 'auto';
  if (rasterFlag !== 'auto' && rasterFlag !== '2' && rasterFlag !== '3')
    throw new UsageError('--raster-scale wants auto, 2 or 3');
  const rasterScale: RasterScalePolicy =
    rasterFlag === 'auto' ? 'auto' : rasterFlag === '2' ? 2 : 3;
  const pictureFlag = flagString(ctx.args, 'picture-scale') ?? '2';
  if (pictureFlag !== '2' && pictureFlag !== '3')
    throw new UsageError('--picture-scale wants 2 or 3');
  const pictureScale: PictureScale = pictureFlag === '2' ? 2 : 3;
  const verify = flagBoolean(ctx.args, 'verify');
  const startedAt = Date.now();

  ctx.out.human(
    `export: pptx ${mode}, ${ids.length} slide(s) x ${themes.join(',')}, fonts ${fonts}${excludeShareAlike ? ', share-alike pictures excluded' : ''} -> ${outDir}`,
  );
  const result = await exportPptx({
    deckDir: dir,
    document: { deck: loaded.deck, slides: loaded.slides },
    outDir,
    mode,
    themes,
    fonts,
    excludeShareAlike,
    baseline,
    ...(headingsFlag === 'raster' ? { headings: 'raster' as const } : {}),
    rasterScale,
    pictureScale,
    slideIds: ids.length === loaded.order.length ? undefined : ids,
    writeScenes: flagBoolean(ctx.args, 'scenes'),
    onSlide: (scene, ms) =>
      ctx.out.human(
        `  ${String(scene.n).padStart(2)} ${scene.slideId} ${scene.theme} ${ms} ms, ${scene.texts.length} text(s), ${scene.rasters.length} raster(s)`,
      ),
    onFile: (path, bytes) => ctx.out.human(`export: wrote ${path} (${formatBytes(bytes)})`),
  });
  let merged = result.merged;
  if (verify) {
    ctx.out.human('export: verifying the exported files');
    for (const theme of themes) {
      const path = result.reportPaths[theme];
      if (path) await verifyPptx(path, { deckDir: dir, log: (line) => ctx.out.human(`  ${line}`) });
    }
    merged = await verifyPptx(result.reportPath, {
      deckDir: dir,
      log: (line) => ctx.out.human(`  ${line}`),
    });
  }
  ctx.out.result(merged);
  ctx.out.human(
    `export: ${result.files.length} file(s), revision ${merged.revision}, geometry ${merged.geometryInBounds ? 'in bounds' : 'OUT OF BOUNDS'}, fonts embedded ${merged.fonts.embedded.length}, required on viewer ${merged.fonts.requiredOnViewer.length}, passed ${merged.passed}, ${((Date.now() - startedAt) / 1000).toFixed(1)} s`,
  );
  for (const line of merged.residual) ctx.out.human(`  residual: ${line}`);
  return merged.passed ? EXIT.ok : EXIT.findings;
}

/**
 * `turboslide export gslides [ids|all] --mode flatten|native --theme light[,dark] [--dry-run]
 * [--verify] [--images=local|gcs] [--assets-url=<origin>] [--title=<text>] [--scenes] --out <dir>`.
 * A dry run exits 0 when the requests validate and every element stays on the page; a live run
 * exits 1 when the report's `passed` is false and 2 when the credentials are missing.
 */
async function exportGslidesCommand(ctx: CommandContext, rest: string[]): Promise<number> {
  const dir = findDeckDir(ctx.cwd, flagString(ctx.args, 'deck'), ctx.env);
  const loaded = loadDeck(dir);
  const ids = selectSlides(loaded, rest);
  const mode = parseMode(ctx);
  const themes = parseThemes(ctx);
  const dryRun = flagBoolean(ctx.args, 'dry-run');
  const verify = flagBoolean(ctx.args, 'verify');
  const outDir = resolveOut(
    ctx.cwd,
    flagString(ctx.args, 'out'),
    join(derivedDir(dir, ctx.cwd), 'export-gslides'),
  );
  const imagesFlag = flagString(ctx.args, 'images');
  if (imagesFlag !== undefined && imagesFlag !== 'local' && imagesFlag !== 'gcs')
    throw new UsageError('--images wants local or gcs');
  const imageHost: HostKind | undefined = imagesFlag;
  const excludeShareAlike = flagBoolean(ctx.args, 'exclude-share-alike');
  const title = flagString(ctx.args, 'title');
  const assetBaseUrl = flagString(ctx.args, 'assets-url');
  const startedAt = Date.now();
  ctx.out.human(
    `export: gslides ${mode}, ${ids.length} slide(s) x ${themes.join(',')}${dryRun ? ', dry run' : ''}${verify ? ', verify' : ''}${excludeShareAlike ? ', share-alike pictures excluded' : ''} -> ${outDir}`,
  );
  try {
    const result = await exportGslides({
      deckDir: dir,
      document: { deck: loaded.deck, slides: loaded.slides },
      outDir,
      mode,
      themes,
      dryRun,
      verify,
      env: ctx.env,
      excludeShareAlike,
      slideIds: ids.length === loaded.order.length ? undefined : ids,
      writeScenes: flagBoolean(ctx.args, 'scenes'),
      ...(imageHost ? { imageHost } : {}),
      ...(title ? { title } : {}),
      ...(assetBaseUrl ? { assetBaseUrl } : {}),
      log: (line) => ctx.out.human(`  ${line}`),
      onSlide: (scene, ms) =>
        ctx.out.human(
          `  ${String(scene.n).padStart(2)} ${scene.slideId} ${scene.theme} ${ms} ms, ${scene.texts.length} text(s), ${scene.rasters.length} raster(s)`,
        ),
    });
    ctx.out.result(result.merged);
    for (const theme of result.themes) {
      const bytes = theme.batches.reduce((n, b) => n + b.bytes, 0);
      ctx.out.human(
        `export: ${theme.theme}: ${theme.plan.slides.length} slide(s), ${theme.plan.requests.length} request(s) in ${theme.batches.length} batch(es) (${formatBytes(bytes)}), ${theme.manifest.images.length} image(s), ${theme.validation.length} invalid${
          theme.live ? `, presentation ${theme.live.presentationId} ${theme.live.url}` : ''
        }${theme.verified ? `, thumbnails ${theme.verified.passed ? 'within' : 'over'} budget` : ''}`,
      );
    }
    ctx.out.human(
      `export: wrote ${result.requestsPath}, ${result.imagesPath}${result.dryRunPath ? `, ${result.dryRunPath}` : ''}, ${result.reportPath}; geometry ${result.merged.geometryInBounds ? 'in bounds' : 'OUT OF BOUNDS'}, passed ${result.merged.passed}, ${((Date.now() - startedAt) / 1000).toFixed(1)} s`,
    );
    for (const line of result.merged.residual) ctx.out.human(`  residual: ${line}`);
    return result.merged.passed ? EXIT.ok : EXIT.findings;
  } catch (error) {
    if (error instanceof MissingCredentialsError) throw new UsageError(error.message);
    throw error;
  }
}
