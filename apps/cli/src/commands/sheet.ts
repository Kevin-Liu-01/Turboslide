// render.sheet (SPEC 7.1, 7.2): `turboslide sheet all --cols 4 --thumb 480 --numbered --out dir`
// writes sheet-<theme>.png and sheet-<theme>.json (the cell map) from the last render's PNGs.
// `--overlay lint` draws finding boxes from the lint report (or a fresh static lint);
// `--overlay plate --kind opener|mood|closing` draws the plate rectangle on the candidate pictures.
import { existsSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

import { PLATE_BOXES } from '@turboslide/effects/metrics';
import { launchBrowser } from '@turboslide/headless/launch';
import { renderContactSheet, sheetPaths } from '@turboslide/headless/sheet';
import type { SheetCell, SheetFinding } from '@turboslide/headless/sheet';
import type { Finding } from '@turboslide/schema/findings';
import { lintStatic } from '@turboslide/lint/run';

import { flagBoolean, flagList, flagNumber, flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import {
  derivedDir,
  findDeckDir,
  loadDeck,
  readJson,
  readRenderRecords,
  resolveOut,
  slideRows,
} from '../deck-files.ts';
import { lintLists, loadFontsCss } from '../deps/theme.ts';
import { UsageError } from '../exit.ts';
import { selectSlides } from '../select.ts';

export async function sheet(ctx: CommandContext): Promise<number> {
  const dir = findDeckDir(ctx.cwd, flagString(ctx.args, 'deck'), ctx.env);
  const loaded = loadDeck(dir);
  const ids = selectSlides(loaded, ctx.rest);
  const derived = derivedDir(dir, ctx.cwd);
  const renderDir = resolveOut(ctx.cwd, flagString(ctx.args, 'render'), join(derived, 'render'));
  const outDir = resolveOut(ctx.cwd, flagString(ctx.args, 'out'), join(derived, 'sheet'));
  const cols = flagNumber(ctx.args, 'cols', 4);
  const thumb = flagNumber(ctx.args, 'thumb', 480);
  const numbered = flagBoolean(ctx.args, 'numbered') || ctx.args.flags.numbered === undefined;
  const overlayFlag = flagString(ctx.args, 'overlay');
  const overlay = overlayFlag === 'lint' || overlayFlag === 'plate' ? overlayFlag : undefined;
  if (overlayFlag && !overlay) throw new UsageError('--overlay wants lint or plate');
  const kindFilter = flagString(ctx.args, 'kind');
  const records = readRenderRecords(join(renderDir, 'render.json'));
  if (records.length === 0)
    throw new UsageError(
      `no render records in ${renderDir}/render.json; run \`turboslide render all\` first or pass --render <dir>`,
    );
  const themes = flagList(ctx.args, 'theme', [...new Set(records.map((r) => r.theme))]).filter(
    (t): t is 'light' | 'dark' => t === 'light' || t === 'dark',
  );
  const rows = slideRows(loaded);

  let findings: SheetFinding[] = [];
  if (overlay === 'lint') {
    const reportPath = resolveOut(
      ctx.cwd,
      flagString(ctx.args, 'findings'),
      join(derived, 'lint.json'),
    );
    const source: Finding[] = existsSync(reportPath)
      ? (readJson(reportPath) as Finding[])
      : lintStatic(loaded, lintLists());
    findings = source
      .filter((f) => f.evidence.box)
      .map((f) => ({
        slideId: f.slideId,
        rule: f.rule,
        severity: f.severity,
        box: f.evidence.box,
      }));
  }
  const plates: Record<string, [number, number, number, number]> = {};
  if (overlay === 'plate') {
    for (const id of ids) {
      const slide = loaded.slides[id];
      if (!slide || (slide.kind !== 'opener' && slide.kind !== 'mood' && slide.kind !== 'closing'))
        continue;
      if (kindFilter && slide.kind !== kindFilter) continue;
      plates[id] = PLATE_BOXES[slide.kind];
    }
  }

  const launched = await launchBrowser({ probeRenderer: false });
  const written: { theme: string; png: string; map: string; cells: number }[] = [];
  try {
    for (const theme of themes) {
      const cells: SheetCell[] = [];
      for (const id of ids) {
        const record = records.find((r) => r.slideId === id && r.theme === theme);
        if (!record) {
          ctx.out.warn(`sheet: no ${theme} render for ${id}; skipped`);
          continue;
        }
        const image = isAbsolute(record.image) ? record.image : resolve(renderDir, record.image);
        if (!existsSync(image)) {
          ctx.out.warn(`sheet: ${image} is missing; skipped`);
          continue;
        }
        const row = rows.find((r) => r.id === id);
        cells.push({
          slideId: id,
          n: row?.n ?? loaded.order.indexOf(id) + 1,
          section: row?.section ?? '',
          title: row?.title,
          image,
        });
      }
      const paths = sheetPaths(outDir, theme);
      const map = await renderContactSheet(
        launched.browser,
        cells,
        {
          theme,
          cols,
          thumb,
          numbered,
          overlay,
          findings,
          plates,
          fontsCss: loadFontsCss(),
          title: `${loaded.deck.title}, ${theme}`,
        },
        { png: paths.png, map: paths.map },
      );
      written.push({ theme, png: paths.png, map: paths.map, cells: map.cells.length });
      ctx.out.human(
        `sheet ${theme}: ${map.cells.length} cells, ${map.labels.length} section labels, ${map.size[0]}x${map.size[1]} -> ${paths.png}`,
      );
    }
  } finally {
    await launched.close();
  }
  ctx.out.result({ outDir, cols, thumb, overlay: overlay ?? null, sheets: written });
  return 0;
}
