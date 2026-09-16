// export.run, export.text and the JPEG render on the CLI (SPEC 7.1, 7.2; gslides-parity SPEC 7.6):
//
//   turboslide export [<format>] [<deckDir>] [ids|all] [--format pptx|pdf|txt|jpeg] ...
//   turboslide export check <file.pptx | dir>
//
// The format is the first word when it names one (pptx, pdf, txt, jpeg, jpg), else `--format`,
// else pptx; the deck is `--deck`, else a positional that names a directory holding deck.json
// (the acceptance lines of MILESTONES B2 write `turboslide export decks/fixture/gslides ...`),
// else the usual resolution; the remaining positionals select slides. PPTX: `--mode
// flatten|native --theme light,dark|both --fonts exact|standard|embed [--embed-fonts] [--headings
// raster] [--raster-scale auto|2|3] [--picture-scale 2|3] [--exclude-share-alike]
// [--baseline-target libreoffice|none] [--tables auto|table|rows] [--include-skipped]
// [--include-notes] [--no-jpeg] [--verify] --out <dir>`; the verify pass runs inside exportPptx so
// a table that misses the per cell budget is rewritten as ruled rows (SPEC 7.3). PDF:
// `[--appearance light|dark] [--include-skipped] [--verify] --out <dir>` through exportPdf, the
// raster gate of SPEC 7.6 where poppler exists. TXT: export.text on stdout. JPEG: the selected
// slides at 2x as JPEGs at quality 92 through the render surface (SPEC 7.6), one theme. Exit 1
// when a report's `passed` is false. `export check` reads a file back, or every .pptx of a folder.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { BAYER8 } from '@turboslide/effects/bayer';
import type {
  ExportMode,
  Orientation,
  Paper,
  PrintLayout,
  PrintOrder,
} from '@turboslide/schema/export';
import { ORIENTATIONS, PAPERS, PRINT_LAYOUTS, PRINT_ORDERS } from '@turboslide/schema/export';
import { deckAppearance } from '@turboslide/schema/deck';
import type { Theme } from '@turboslide/schema/render';
import { deckPage } from '@turboslide/schema/render';
import { exportOdp } from '@turboslide/export/export-odp';
import { exportPptx } from '@turboslide/export/export-pptx';
import type { TableMode } from '@turboslide/export/export-pptx';
import { exportPdf } from '@turboslide/export/pdf/build';
import type { BaselineTarget } from '@turboslide/export/pptx/baseline';
import type { FontSet } from '@turboslide/export/pptx/fonts-map';
import type { RasterScalePolicy } from '@turboslide/export/scene/extract';
import type { PictureScale } from '@turboslide/export/scene/two-tone';
import type { RenderRecord } from '@turboslide/headless/contracts';
import { openSheetPage } from '@turboslide/headless/context';
import { fileUrl, writeTempDocument } from '@turboslide/headless/document';
import { launchBrowser } from '@turboslide/headless/launch';
import { relativeImageRef, renderImageName, renderSlideRecord } from '@turboslide/headless/record';

import { flagBoolean, flagList, flagNumber, flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { derivedDir, findDeckDir, loadDeck, resolveOut, writeJson } from '../deck-files.ts';
import type { LoadedDeck } from '../deck-files.ts';
import { renderThemeDocument, slideHash } from '../deps/render.ts';
import { EXIT, UsageError } from '../exit.ts';
import { formatBytes } from '../output.ts';
import { selectSlides } from '../select.ts';
import { deckText } from '../store-actions.ts';
import { CHECKABLE_EXTENSIONS, exportCheck } from './export-check.ts';

/** The formats `turboslide export` writes (export.run's pptx, pdf and odp, export.text, render.slide jpg). */
export const EXPORT_FORMATS = ['pptx', 'pdf', 'odp', 'txt', 'jpeg'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** The render surface stamps this when fonts, images and dither canvases are in place (render/runtime.ts). */
const READY_SELECTOR = 'html[data-ts-ready="1"]';

function isFormatWord(word: string | undefined): word is ExportFormat | 'jpg' {
  return (
    (word !== undefined && (EXPORT_FORMATS as readonly string[]).includes(word)) || word === 'jpg'
  );
}

/** True when a positional names a deck folder (a path with deck.json) rather than a slide. */
function isDeckPath(cwd: string, word: string | undefined): boolean {
  if (word === undefined || word === 'all') return false;
  if (!word.includes('/') && !word.includes('\\') && word !== '.') return false;
  const path = resolve(cwd, word);
  return existsSync(join(path, 'deck.json'));
}

/**
 * The format, the deck directory and the slide selection words of an export call: the format word
 * first when present, then a deck folder positional, then `--format` and `--deck` as the fallbacks.
 */
export function parseExportTarget(ctx: CommandContext): {
  format: ExportFormat;
  dir: string;
  rest: string[];
} {
  const rest = [...ctx.rest];
  let format: ExportFormat | undefined;
  if (rest[0] === 'gslides') {
    throw new UsageError(
      'export gslides was removed on 2026-09-11: PPTX is the one export target (docs/pptx.md); the other formats are pdf, odp, txt and jpeg',
    );
  }
  if (isFormatWord(rest[0])) {
    const word = rest.shift() as ExportFormat | 'jpg';
    format = word === 'jpg' ? 'jpeg' : word;
  }
  let deckFlag = flagString(ctx.args, 'deck');
  if (deckFlag === undefined && isDeckPath(ctx.cwd, rest[0])) deckFlag = rest.shift();
  const flagged = flagString(ctx.args, 'format');
  if (flagged !== undefined) {
    if (!isFormatWord(flagged))
      throw new UsageError(`--format wants ${EXPORT_FORMATS.join(', ')} or jpg`);
    const named: ExportFormat = flagged === 'jpg' ? 'jpeg' : flagged;
    if (format !== undefined && format !== named)
      throw new UsageError(`export ${format} and --format ${named} disagree`);
    format = named;
  }
  const dir = findDeckDir(ctx.cwd, deckFlag, ctx.env);
  return { format: format ?? 'pptx', dir, rest };
}

/**
 * `turboslide export txt [ids|all] [--include-notes] [--include-skipped]` (gslides-parity SPEC 7.6
 * export.text): the deck as plain text on stdout, or `{ text, slides, bytes }` with --json.
 */
async function exportText(
  ctx: CommandContext,
  loaded: LoadedDeck,
  rest: string[],
): Promise<number> {
  const ids = selectSlides(loaded, rest);
  const result = deckText(
    { deck: loaded.deck, slides: loaded.slides },
    {
      slideIds: ids.length === loaded.order.length ? 'all' : ids,
      ...(flagBoolean(ctx.args, 'include-notes') ? { includeNotes: true } : {}),
      ...(flagBoolean(ctx.args, 'include-skipped') ? { includeSkipped: true } : {}),
    },
  );
  if (ctx.out.json) ctx.out.result(result);
  else ctx.out.human(result.text);
  ctx.out.warn(`export: ${result.slides} slide(s) as text, ${formatBytes(result.bytes)}`);
  return EXIT.ok;
}

function parseMode(ctx: CommandContext): ExportMode {
  const modeFlag = flagString(ctx.args, 'mode') ?? 'flatten';
  if (modeFlag !== 'flatten' && modeFlag !== 'native')
    throw new UsageError('--mode wants flatten (perfect) or native (editable text)');
  return modeFlag;
}

/** `--theme light`, `light,dark` or `both`; the default is both. */
export function parseThemes(
  ctx: CommandContext,
  fallback: readonly Theme[] = ['light', 'dark'],
): Theme[] {
  const raw = flagList(ctx.args, 'theme', fallback);
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

/** `--appearance light|dark` (the PDF's one theme), else the deck's `defaults.appearance`. */
function parseAppearance(ctx: CommandContext, loaded: LoadedDeck): Theme {
  const flag = flagString(ctx.args, 'appearance') ?? flagString(ctx.args, 'theme');
  if (flag === undefined) return deckAppearance(loaded.deck);
  if (flag !== 'light' && flag !== 'dark')
    throw new UsageError('--appearance wants light or dark (one theme per PDF)');
  return flag;
}

/** The ids to export: the selection minus the skipped slides unless --include-skipped (SPEC 7.2.1). */
function playSelection(
  ctx: CommandContext,
  loaded: LoadedDeck,
  rest: string[],
): { ids: string[] | undefined; includeSkipped: boolean } {
  const includeSkipped = flagBoolean(ctx.args, 'include-skipped');
  const selected = selectSlides(loaded, rest);
  const ids = includeSkipped ? selected : selected.filter((id) => loaded.slides[id]?.skip !== true);
  if (ids.length === 0)
    throw new UsageError('every selected slide is skipped; pass --include-skipped');
  return { ids: ids.length === loaded.order.length ? undefined : ids, includeSkipped };
}

async function exportPptxCommand(
  ctx: CommandContext,
  dir: string,
  loaded: LoadedDeck,
  rest: string[],
): Promise<number> {
  const { ids, includeSkipped } = playSelection(ctx, loaded, rest);
  const includeNotes = flagBoolean(ctx.args, 'include-notes');
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
  const tablesFlag = flagString(ctx.args, 'tables') ?? 'auto';
  if (tablesFlag !== 'auto' && tablesFlag !== 'table' && tablesFlag !== 'rows')
    throw new UsageError(
      '--tables wants auto (a:tbl, ruled rows when a cell misses the budget), table or rows',
    );
  const tableMode: TableMode = tablesFlag;
  const verify = flagBoolean(ctx.args, 'verify');
  const noJpeg = flagBoolean(ctx.args, 'no-jpeg');
  /* round five (gslides-parity SPEC-5 2.4, 3.6; b1.md request 8): the timing tree and the media files in Editable text */
  const motionFlag = flagString(ctx.args, 'motion') ?? 'keep';
  if (motionFlag !== 'keep' && motionFlag !== 'drop')
    throw new UsageError('--motion wants keep (the transitions and the timing tree) or drop');
  const mediaFlag = flagString(ctx.args, 'media') ?? 'embed';
  if (mediaFlag !== 'embed' && mediaFlag !== 'poster' && mediaFlag !== 'url')
    throw new UsageError('--media wants embed (the file in the package), poster or url');
  const startedAt = Date.now();

  ctx.out.human(
    `export: pptx ${mode}${mode === 'flatten' ? ' (perfect)' : ' (editable text)'}, ${ids?.length ?? loaded.order.length} slide(s) x ${themes.join(',')}, fonts ${fonts}${embedFonts ? ' embedded' : ''}${excludeShareAlike ? ', share-alike pictures excluded' : ''}${includeSkipped ? ', skipped slides included' : ''}${includeNotes ? ', notes included' : ''} -> ${outDir}`,
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
    tableMode,
    ...(noJpeg ? { noJpeg: true } : {}),
    ...(includeSkipped ? { includeSkipped: true } : {}),
    ...(includeNotes ? { includeNotes: true } : {}),
    motion: motionFlag,
    media: mediaFlag,
    slideIds: ids,
    writeScenes: flagBoolean(ctx.args, 'scenes'),
    // the verify pass runs inside the export so a table that misses the per cell budget is
    // rewritten as ruled rows and verified again (gslides-parity SPEC 7.3)
    ...(verify
      ? { verify: { deckDir: dir, log: (line: string) => ctx.out.human(`  ${line}`) } }
      : {}),
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
  const merged = result.merged;
  ctx.out.result(merged);
  ctx.out.human(
    `export: ${result.files.length} file(s)${result.zipPath ? ' plus the zip of both' : ''}, revision ${merged.revision}, geometry ${merged.geometryInBounds ? 'in bounds' : 'OUT OF BOUNDS'}, perfect ${merged.perfect}, fonts embedded ${merged.fonts.embedded.length}, required on viewer ${merged.fonts.requiredOnViewer.length}, passed ${merged.passed}${result.omitted.length > 0 ? `, ${result.omitted.length} skipped slide(s) left out` : ''}, ${((Date.now() - startedAt) / 1000).toFixed(1)} s`,
  );
  for (const [theme, blocks] of Object.entries(result.tableFallbacks))
    ctx.out.human(
      `export: ${theme}: ${blocks.join(', ')} rewritten as ruled rows after the verify pass`,
    );
  for (const line of merged.residual) ctx.out.human(`  residual: ${line}`);
  return merged.passed ? EXIT.ok : EXIT.findings;
}

/** One of a closed list of words, or a usage error naming the list. */
function parseChoice<T extends string>(
  ctx: CommandContext,
  flag: string,
  choices: readonly T[],
): T | undefined {
  const value = flagString(ctx.args, flag);
  if (value === undefined) return undefined;
  if (!(choices as readonly string[]).includes(value))
    throw new UsageError(`--${flag} wants ${choices.join(', ')}`);
  return value as T;
}

/**
 * The print layout flags of `export pdf` (gslides-parity SPEC-5 6.2): `--layout slides|notes|
 * handout-2|3|4|6|9`, `--paper slide|letter|a4`, `--orientation landscape|portrait`, `--order
 * across|down`, `--hide-background`; absent, one slide per page on the slide's own paper.
 */
export function parsePrintLayout(ctx: CommandContext): {
  layout?: PrintLayout;
  paper?: Paper;
  orientation?: Orientation;
  order?: PrintOrder;
  hideBackground?: boolean;
} {
  const layout = parseChoice(ctx, 'layout', PRINT_LAYOUTS);
  const paper = parseChoice(ctx, 'paper', PAPERS);
  const orientation = parseChoice(ctx, 'orientation', ORIENTATIONS);
  const order = parseChoice(ctx, 'order', PRINT_ORDERS);
  if (paper === 'slide' && layout !== undefined && layout !== 'slides')
    throw new UsageError(
      `--paper slide is the one slide layout's alone; ${layout} needs letter or a4`,
    );
  return {
    ...(layout !== undefined ? { layout } : {}),
    ...(paper !== undefined ? { paper } : {}),
    ...(orientation !== undefined ? { orientation } : {}),
    ...(order !== undefined ? { order } : {}),
    ...(flagBoolean(ctx.args, 'hide-background') ? { hideBackground: true } : {}),
  };
}

/**
 * `turboslide export pdf [<deckDir>] [ids|all] [--appearance light|dark] [--include-skipped]
 * [--layout <layout>] [--paper <paper>] [--orientation <orientation>] [--order <order>]
 * [--hide-background] [--verify] --out <dir>` (gslides-parity SPEC 7.6; SPEC-5 6.2).
 */
async function exportPdfCommand(
  ctx: CommandContext,
  dir: string,
  loaded: LoadedDeck,
  rest: string[],
): Promise<number> {
  const { ids, includeSkipped } = playSelection(ctx, loaded, rest);
  const theme = parseAppearance(ctx, loaded);
  const outDir = resolveOut(
    ctx.cwd,
    flagString(ctx.args, 'out'),
    join(derivedDir(dir, ctx.cwd), 'export'),
  );
  const verify = flagBoolean(ctx.args, 'verify');
  const print = parsePrintLayout(ctx);
  const startedAt = Date.now();
  const layoutWords =
    print.layout !== undefined || print.paper !== undefined
      ? `, ${print.layout ?? 'slides'} on ${print.paper ?? (print.layout === undefined || print.layout === 'slides' ? 'the slide' : 'letter')}${print.orientation ? ` ${print.orientation}` : ''}${print.hideBackground ? ', background hidden' : ''}`
      : print.hideBackground
        ? ', background hidden'
        : '';
  ctx.out.human(
    `export: pdf ${theme}${layoutWords}, ${ids?.length ?? loaded.order.length} slide(s)${includeSkipped ? ', skipped slides included' : ''}${verify ? ', gated against the web render' : ''} -> ${outDir}`,
  );
  const result = await exportPdf({
    deckDir: dir,
    document: { deck: loaded.deck, slides: loaded.slides },
    outDir,
    theme,
    ...(ids !== undefined ? { slideIds: ids } : {}),
    ...(includeSkipped ? { includeSkipped: true } : {}),
    ...print,
    verify,
    env: ctx.env,
    log: (line) => ctx.out.human(`  ${line}`),
  });
  ctx.out.result(result.report);
  const cells = result.report.cells ?? [];
  ctx.out.human(
    `export: ${result.path} (${formatBytes(result.bytes)}), ${result.pages} page(s) at ${result.pageSize ? `${result.pageSize.width} by ${result.pageSize.height} pt` : 'an unread size'}${result.report.layout !== undefined && result.report.layout !== 'slides' ? `, ${cells.length} cell(s), ${cells.filter((c) => c.ok).length} ok` : ''}, gate ${result.gate}${result.rasterizer ? ` (${result.rasterizer})` : ''}, passed ${result.passed}${result.omitted.length > 0 ? `, ${result.omitted.length} skipped slide(s) left out` : ''}, ${((Date.now() - startedAt) / 1000).toFixed(1)} s`,
  );
  for (const line of result.report.residual) ctx.out.human(`  residual: ${line}`);
  return result.passed ? EXIT.ok : EXIT.findings;
}

/**
 * `turboslide export jpeg [<deckDir>] [ids|all] [--theme light|dark] [--scale 1|2] --out <dir>`
 * (render.slide with `format: 'jpg'`, gslides-parity SPEC 7.6): the selected slides as JPEGs at
 * quality 92 at 2x by default, in one theme (the deck's appearance unless named), with the
 * render records as render.json the way `turboslide render` writes them.
 */
async function exportJpegCommand(
  ctx: CommandContext,
  dir: string,
  loaded: LoadedDeck,
  rest: string[],
): Promise<number> {
  const { ids } = playSelection(ctx, loaded, rest);
  const wanted = ids ?? loaded.order;
  const theme = parseAppearance(ctx, loaded);
  const scaleN = flagNumber(ctx.args, 'scale', 2);
  if (scaleN !== 1 && scaleN !== 2) throw new UsageError('--scale wants 1 or 2');
  const scale = scaleN;
  const outDir = resolveOut(
    ctx.cwd,
    flagString(ctx.args, 'out'),
    join(derivedDir(dir, ctx.cwd), 'export'),
  );
  const tmp = await mkdtemp(join(tmpdir(), 'turboslide-jpeg-'));
  const records: RenderRecord[] = [];
  const startedAt = Date.now();
  try {
    const doc = renderThemeDocument(loaded, theme, fileUrl(dir, true));
    for (const w of doc.warnings) ctx.out.warn(`export [${theme}]: ${w}`);
    const file = await writeTempDocument(doc.html, `deck-${theme}.html`, tmp);
    const launched = await launchBrowser();
    try {
      ctx.out.human(
        `export: jpeg ${theme} at ${scale}x, ${wanted.length} slide(s) with ${launched.renderer} -> ${outDir}`,
      );
      const sheetPage = await openSheetPage(launched.browser, {
        theme,
        scale,
        viewport: deckPage(loaded.deck),
      });
      try {
        for (const slideId of wanted) {
          const n =
            doc.slides.find((s) => s.slideId === slideId)?.n ?? loaded.order.indexOf(slideId) + 1;
          const imagePath = join(outDir, renderImageName(n, slideId, theme, scale, 'jpg'));
          const { record } = await renderSlideRecord(sheetPage, {
            url: file.url,
            hash: slideHash(slideId),
            deckId: loaded.deck.id,
            slideId,
            revision: loaded.deck.revision,
            imagePath,
            imageRef: relativeImageRef(outDir, imagePath),
            renderer: launched.renderer,
            bayerTable: BAYER8.flat(),
            readySelector: READY_SELECTOR,
            drawDither: false,
            format: 'jpg',
          });
          records.push(record);
          ctx.out.human(
            `  ${String(n).padStart(2)} ${slideId} ${theme} ${record.image}${record.pageErrors.length ? `, ${record.pageErrors.length} page error(s)` : ''}`,
          );
        }
      } finally {
        await sheetPage.close();
      }
    } finally {
      await launched.close();
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
  await writeJson(join(outDir, 'render.json'), records);
  ctx.out.result({ records, images: records.map((r) => r.image) });
  const errors = records.filter((r) => r.pageErrors.length > 0);
  ctx.out.human(
    `export: ${records.length} JPEG(s) at quality 92 in ${((Date.now() - startedAt) / 1000).toFixed(1)} s -> ${outDir}/render.json`,
  );
  return errors.length > 0 ? EXIT.findings : EXIT.ok;
}

/**
 * `turboslide export odp [<deckDir>] [ids|all] [--mode flatten|native] [--theme light,dark|both]
 * [--include-skipped] [--include-notes] [--motion keep|drop] [--media embed|poster|url]
 * [--verify] --out <dir>` (gslides-parity SPEC-5 6.3): one `.odp` per theme through exportOdp,
 * the report the shape of every export, `export check` folded into `passed`.
 */
async function exportOdpCommand(
  ctx: CommandContext,
  dir: string,
  loaded: LoadedDeck,
  rest: string[],
): Promise<number> {
  const { ids, includeSkipped } = playSelection(ctx, loaded, rest);
  const includeNotes = flagBoolean(ctx.args, 'include-notes');
  const mode = parseMode(ctx);
  const themes = parseThemes(ctx);
  const outDir = resolveOut(
    ctx.cwd,
    flagString(ctx.args, 'out'),
    join(derivedDir(dir, ctx.cwd), 'export'),
  );
  const motionFlag = flagString(ctx.args, 'motion') ?? 'keep';
  if (motionFlag !== 'keep' && motionFlag !== 'drop')
    throw new UsageError('--motion wants keep (the transitions and the animation tree) or drop');
  const mediaFlag = flagString(ctx.args, 'media') ?? 'embed';
  if (mediaFlag !== 'embed' && mediaFlag !== 'poster' && mediaFlag !== 'url')
    throw new UsageError('--media wants embed (the file in the package), poster or url');
  const verify = flagBoolean(ctx.args, 'verify');
  const startedAt = Date.now();
  ctx.out.human(
    `export: odp ${mode}${mode === 'flatten' ? ' (perfect)' : ' (editable text)'}, ${ids?.length ?? loaded.order.length} slide(s) x ${themes.join(',')}${includeSkipped ? ', skipped slides included' : ''}${includeNotes ? ', notes included' : ''} -> ${outDir}`,
  );
  const result = await exportOdp({
    deckDir: dir,
    document: { deck: loaded.deck, slides: loaded.slides },
    outDir,
    mode,
    themes,
    ...(includeSkipped ? { includeSkipped: true } : {}),
    ...(includeNotes ? { includeNotes: true } : {}),
    motion: motionFlag,
    media: mediaFlag,
    slideIds: ids,
    verify,
    env: ctx.env,
    writeScenes: flagBoolean(ctx.args, 'scenes'),
    onSlide: (scene, ms) =>
      ctx.out.human(
        `  ${String(scene.n).padStart(2)} ${scene.slideId} ${scene.theme} ${ms} ms, ${scene.texts.length} text(s), ${scene.rasters.length} raster(s)`,
      ),
    onPage: (scene, raster) =>
      ctx.out.human(
        `  ${String(scene.n).padStart(2)} ${scene.slideId} ${scene.theme} page ${raster.format} ${formatBytes(raster.bytes.byteLength)}, ${(raster.fraction * 100).toFixed(3)} percent mismatch`,
      ),
    onFile: (path, bytes) => ctx.out.human(`export: wrote ${path} (${formatBytes(bytes)})`),
    log: (line) => ctx.out.human(`  ${line}`),
  });
  const merged = result.merged;
  ctx.out.result(merged);
  ctx.out.human(
    `export: ${result.files.length} file(s)${result.zipPath ? ' plus the zip of both' : ''}, revision ${merged.revision}, perfect ${merged.perfect}, passed ${merged.passed}${result.omitted.length > 0 ? `, ${result.omitted.length} skipped slide(s) left out` : ''}, ${((Date.now() - startedAt) / 1000).toFixed(1)} s`,
  );
  for (const line of merged.residual) ctx.out.human(`  residual: ${line}`);
  return merged.passed ? EXIT.ok : EXIT.findings;
}

/** `export check <file.pptx | file.odp | file.svg | dir>`: one file, or every checkable file of a folder (exit 1 when any is not valid). */
async function exportCheckTarget(ctx: CommandContext, rest: string[]): Promise<number> {
  const [target] = rest;
  if (target !== undefined) {
    const path = resolve(ctx.cwd, target);
    if (existsSync(path) && statSync(path).isDirectory()) {
      const files = readdirSync(path)
        .filter((name) => CHECKABLE_EXTENSIONS.some((extension) => name.endsWith(extension)))
        .sort()
        .map((name) => join(path, name));
      if (files.length === 0)
        throw new UsageError(`export check: no .pptx, .odp or .svg under ${target}`);
      let code: number = EXIT.ok;
      for (const file of files) {
        const result = await exportCheck(ctx, [file, ...rest.slice(1)]);
        if (result !== EXIT.ok) code = result;
      }
      return code;
    }
  }
  return exportCheck(ctx, rest);
}

export async function exportCommand(ctx: CommandContext): Promise<number> {
  if (ctx.rest[0] === 'check') return exportCheckTarget(ctx, ctx.rest.slice(1));
  const { format, dir, rest } = parseExportTarget(ctx);
  const loaded = loadDeck(dir);
  switch (format) {
    case 'txt':
      return exportText(ctx, loaded, rest);
    case 'pdf':
      return exportPdfCommand(ctx, dir, loaded, rest);
    case 'jpeg':
      return exportJpegCommand(ctx, dir, loaded, rest);
    case 'odp':
      return exportOdpCommand(ctx, dir, loaded, rest);
    case 'pptx':
      return exportPptxCommand(ctx, dir, loaded, rest);
  }
}
