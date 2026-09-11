// export.run (SPEC 7.1, 7.2): `turboslide export pptx --mode flatten|native --theme light,dark
// --fonts exact|standard --exclude-share-alike --verify --out <dir>` writes `<deckId>-<theme>.pptx`,
// `export-report-<theme>.json` and the merged `export-report.json`, and exits 1 when the report's
// `passed` is false. `--verify` hands the report to the verify loop (packages/export/src/verify,
// the render worker's LibreOffice pass). Formats other than pptx land later (gslides M6, pdf M6).
import { join } from 'node:path';

import type { ExportMode } from '@turboslide/schema/export';
import type { Theme } from '@turboslide/schema/render';
import { exportPptx } from '@turboslide/export/export-pptx';
import type { BaselineTarget } from '@turboslide/export/pptx/baseline';
import type { FontSet } from '@turboslide/export/pptx/fonts-map';
import { verifyPptx } from '@turboslide/export/verify/report';

import { flagBoolean, flagList, flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { derivedDir, findDeckDir, loadDeck, resolveOut } from '../deck-files.ts';
import { EXIT, UsageError } from '../exit.ts';
import { formatBytes } from '../output.ts';
import { selectSlides } from '../select.ts';

export async function exportCommand(ctx: CommandContext): Promise<number> {
  const [format, ...rest] = ctx.rest;
  if (format === undefined)
    throw new UsageError('export wants a format: pptx (gslides and pdf land in M6)');
  if (format !== 'pptx')
    throw new UsageError(
      `export ${format} is not implemented yet: pptx ships in M2, gslides and pdf in M6`,
    );
  const dir = findDeckDir(ctx.cwd, flagString(ctx.args, 'deck'), ctx.env);
  const loaded = loadDeck(dir);
  const ids = selectSlides(loaded, rest);
  const modeFlag = flagString(ctx.args, 'mode') ?? 'flatten';
  if (modeFlag !== 'flatten' && modeFlag !== 'native')
    throw new UsageError('--mode wants flatten or native');
  const mode: ExportMode = modeFlag;
  const themes = flagList(ctx.args, 'theme', ['light', 'dark']).filter(
    (t): t is Theme => t === 'light' || t === 'dark',
  );
  if (themes.length === 0) throw new UsageError('--theme wants light, dark or light,dark');
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
