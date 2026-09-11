// export.run (SPEC 7.1, 7.2): `turboslide export pptx --mode flatten|native --theme light,dark|both
// --fonts exact|standard [--embed-fonts] [--headings raster] [--raster-scale auto|2|3]
// [--picture-scale 2|3] [--exclude-share-alike] [--verify] --out <dir>` writes
// `<deckId>-<theme>.pptx`, `<deckId>-both.zip` when both themes are exported,
// `export-report-<theme>.json` and the merged `export-report.json`, and exits 1 when the report's
// `passed` is false. Flatten is the perfect mode (pixel identical, docs/pptx.md); native is the
// editable text mode. `--verify` hands the report to the verify loop (packages/export/src/verify,
// the render worker's LibreOffice pass plus the QuickLook smoke check where macOS provides it).
// `turboslide export check <file.pptx>` is export.check (commands/export-check.ts). PDF lands with
// the publishing builder.
import { join } from 'node:path';

import type { ExportMode } from '@turboslide/schema/export';
import type { Theme } from '@turboslide/schema/render';
import { exportPptx } from '@turboslide/export/export-pptx';
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
import { exportCheck } from './export-check.ts';

function parseMode(ctx: CommandContext): ExportMode {
  const modeFlag = flagString(ctx.args, 'mode') ?? 'flatten';
  if (modeFlag !== 'flatten' && modeFlag !== 'native')
    throw new UsageError('--mode wants flatten (perfect) or native (editable text)');
  return modeFlag;
}

/** `--theme light`, `light,dark` or `both`; the default is both. */
export function parseThemes(ctx: CommandContext): Theme[] {
  const raw = flagList(ctx.args, 'theme', ['light', 'dark']);
  const themes = raw
    .flatMap((t) => (t === 'both' ? ['light', 'dark'] : [t]))
    .filter((t): t is Theme => t === 'light' || t === 'dark');
  if (
    themes.length === 0 ||
    themes.length !== raw.flatMap((t) => (t === 'both' ? [1, 2] : [1])).length
  )
    throw new UsageError('--theme wants light, dark, light,dark or both');
  return [...new Set(themes)];
}

export async function exportCommand(ctx: CommandContext): Promise<number> {
  const [format, ...rest] = ctx.rest;
  if (format === undefined)
    throw new UsageError(
      'export wants a format (pptx) or the check subcommand: export check <file>',
    );
  if (format === 'check') return exportCheck(ctx, rest);
  if (format !== 'pptx')
    throw new UsageError(
      `export ${format} is not implemented yet: pptx ships in M2, pdf in M6; the Google Slides exporter was removed on 2026-09-11 (docs/pptx.md)`,
    );
  const dir = findDeckDir(ctx.cwd, flagString(ctx.args, 'deck'), ctx.env);
  const loaded = loadDeck(dir);
  const ids = selectSlides(loaded, rest);
  const mode = parseMode(ctx);
  const themes = parseThemes(ctx);
  const fontsFlag = flagString(ctx.args, 'fonts') ?? 'exact';
  // `--fonts embed` is the exact set with the faces embedded, the shorthand Kevin's directive names
  if (fontsFlag !== 'exact' && fontsFlag !== 'standard' && fontsFlag !== 'embed')
    throw new UsageError('--fonts wants exact, standard or embed (exact plus --embed-fonts)');
  const fonts: FontSet = fontsFlag === 'embed' ? 'exact' : fontsFlag;
  const embedFonts = fontsFlag === 'embed' || flagBoolean(ctx.args, 'embed-fonts');
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
  const noJpeg = flagBoolean(ctx.args, 'no-jpeg');
  const startedAt = Date.now();

  ctx.out.human(
    `export: pptx ${mode}${mode === 'flatten' ? ' (perfect)' : ' (editable text)'}, ${ids.length} slide(s) x ${themes.join(',')}, fonts ${fonts}${embedFonts ? ' embedded' : ''}${excludeShareAlike ? ', share-alike pictures excluded' : ''} -> ${outDir}`,
  );
  const result = await exportPptx({
    deckDir: dir,
    document: { deck: loaded.deck, slides: loaded.slides },
    outDir,
    mode,
    themes,
    fonts,
    ...(embedFonts ? { embedFonts: true } : {}),
    excludeShareAlike,
    baseline,
    ...(headingsFlag === 'raster' ? { headings: 'raster' as const } : {}),
    rasterScale,
    pictureScale,
    ...(noJpeg ? { noJpeg: true } : {}),
    slideIds: ids.length === loaded.order.length ? undefined : ids,
    writeScenes: flagBoolean(ctx.args, 'scenes'),
    onSlide: (scene, ms) =>
      ctx.out.human(
        `  ${String(scene.n).padStart(2)} ${scene.slideId} ${scene.theme} ${ms} ms, ${scene.texts.length} text(s), ${scene.rasters.length} raster(s)`,
      ),
    onPage: (scene, raster) =>
      ctx.out.human(
        `  ${String(scene.n).padStart(2)} ${scene.slideId} ${scene.theme} page ${raster.format} ${formatBytes(raster.bytes.byteLength)}, ${raster.colors > 4096 ? 'over 4096' : raster.colors} colors, ${(raster.fraction * 100).toFixed(3)} percent mismatch`,
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
    `export: ${result.files.length} file(s)${result.zipPath ? ' plus the zip of both' : ''}, revision ${merged.revision}, geometry ${merged.geometryInBounds ? 'in bounds' : 'OUT OF BOUNDS'}, perfect ${merged.perfect}, fonts embedded ${merged.fonts.embedded.length}, required on viewer ${merged.fonts.requiredOnViewer.length}, passed ${merged.passed}, ${((Date.now() - startedAt) / 1000).toFixed(1)} s`,
  );
  for (const line of merged.residual) ctx.out.human(`  residual: ${line}`);
  return merged.passed ? EXIT.ok : EXIT.findings;
}
