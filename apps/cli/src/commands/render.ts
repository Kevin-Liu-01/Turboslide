// render.slide (SPEC 7.1, 7.2): `turboslide render all --theme light,dark --scale 1 --out dir
// --json` writes <nn>-<slideId>-<theme>.png and render.json (RenderRecord[]). Two phases: every
// theme's document is rendered first (renderDeck's render surface with every slide, the runtime
// showing the hashed slide and stamping data-ts-ready), so a renderer error stops the run before
// a browser starts; then one browser with one page per theme shows each slide by hash and shoots. Exit 1 on any page error.
// The overflow list prints as `slideId#blockId x,y wxh`. `--format svg [--text embed|outline|link]`
// (gslides-parity SPEC-5 6.4) measures the selected slides' scenes in one theme and writes
// <nn>-<slideId>-<theme>.svg through the SVG writer with `export check`'s SVG section folded in;
// a leading `slide` word (`render slide <id>`) is the action's own spelling and is dropped.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { BAYER8 } from '@turboslide/effects/bayer';
import type { RenderRecord } from '@turboslide/headless/contracts';
import { openSheetPage } from '@turboslide/headless/context';
import { fileUrl, writeTempDocument } from '@turboslide/headless/document';
import { launchBrowser } from '@turboslide/headless/launch';
import { formatOverflow } from '@turboslide/headless/measure';
import { relativeImageRef, renderImageName, renderSlideRecord } from '@turboslide/headless/record';
import { checkSvg } from '@turboslide/export/check/svg';
import { renderSvg } from '@turboslide/export/svg/render';
import { SVG_TEXT_MODES } from '@turboslide/schema/preferences';
import type { SvgTextMode } from '@turboslide/schema/preferences';
import { deckPage } from '@turboslide/schema/render';

import { flagBoolean, flagList, flagNumber, flagString } from '../args.ts';
import type { CommandContext } from '../context.ts';
import { derivedDir, findDeckDir, loadDeck, resolveOut, writeJson } from '../deck-files.ts';
import { renderThemeDocument, slideHash } from '../deps/render.ts';
import { EXIT, UsageError } from '../exit.ts';
import { selectSlides } from '../select.ts';

type Job = {
  slideId: string;
  n: number;
  theme: 'light' | 'dark';
  url: string;
  hash: string;
  imagePath: string;
};

/** The render surface stamps this when fonts, images and dither canvases are in place (render/runtime.ts). */
export const READY_SELECTOR = 'html[data-ts-ready="1"]';

/**
 * `turboslide render [slide] <ids|all> --deck <dir> --format svg [--text embed|outline|link]
 * [--theme light|dark] --out <dir>` (gslides-parity SPEC-5 6.4): the SVG of each selected slide
 * in one theme; `--text` defaults to embed (the preference's SVG text row is the studio's). Exit 1
 * when a file fails the SVG section of `export check`.
 */
async function renderSvgCommand(
  ctx: CommandContext,
  dir: string,
  loaded: ReturnType<typeof loadDeck>,
  ids: string[],
  themes: ('light' | 'dark')[],
  outDir: string,
): Promise<number> {
  const textFlag = flagString(ctx.args, 'text') ?? 'embed';
  if (!(SVG_TEXT_MODES as readonly string[]).includes(textFlag))
    throw new UsageError(`--text wants ${SVG_TEXT_MODES.join(', ')} (gslides-parity SPEC-5 6.4)`);
  const text = textFlag as SvgTextMode;
  const theme = themes[0] ?? 'light';
  if (themes.length > 1)
    ctx.out.warn(
      `render: an SVG is written in one theme; ${theme} taken, pass --theme for the other`,
    );
  const startedAt = Date.now();
  ctx.out.human(`render: ${ids.length} slide(s) as SVG, ${theme}, text ${text} -> ${outDir}`);
  const rendered = await renderSvg({
    deckDir: dir,
    document: { deck: loaded.deck, slides: loaded.slides },
    slideIds: ids,
    theme,
    text,
    outDir,
    onSlide: (scene, ms) =>
      ctx.out.human(
        `  ${String(scene.n).padStart(2)} ${scene.slideId} ${theme} measured in ${ms} ms`,
      ),
  });
  const rows = rendered.map((entry) => {
    const check = checkSvg(entry.result.svg);
    ctx.out.human(
      `  ${String(entry.n).padStart(2)} ${entry.slideId} ${entry.path} (${entry.result.bytes} bytes, ${entry.result.counts.texts} text(s), ${entry.result.counts.paths} path(s), ${entry.result.counts.images} image(s), ${entry.result.counts.symbols} symbol(s)) ${check.ok ? 'valid' : 'INVALID'}`,
    );
    for (const line of check.ok ? [] : check.lines) ctx.out.human(`    ${line}`);
    return {
      slideId: entry.slideId,
      n: entry.n,
      theme,
      image: entry.path,
      bytes: entry.result.bytes,
      text,
      counts: entry.result.counts,
      residual: entry.result.residual,
      valid: check.ok,
    };
  });
  await writeJson(join(outDir, 'render.json'), rows);
  ctx.out.result({ records: rows, images: rows.map((row) => row.image) });
  ctx.out.human(
    `render: ${rows.length} SVG(s) in ${((Date.now() - startedAt) / 1000).toFixed(1)} s -> ${outDir}/render.json`,
  );
  return rows.every((row) => row.valid) ? EXIT.ok : EXIT.findings;
}

export async function render(ctx: CommandContext): Promise<number> {
  const dir = findDeckDir(ctx.cwd, flagString(ctx.args, 'deck'), ctx.env);
  const loaded = loadDeck(dir);
  // `render slide <id>` is the action's spelling (render.slide); the word is not a slide
  const rest = ctx.rest[0] === 'slide' && ctx.rest.length > 1 ? ctx.rest.slice(1) : ctx.rest;
  const ids = selectSlides(loaded, rest);
  const themes = flagList(ctx.args, 'theme', ['light', 'dark']).filter(
    (t): t is 'light' | 'dark' => t === 'light' || t === 'dark',
  );
  if (themes.length === 0) throw new UsageError('--theme wants light, dark or light,dark');
  const scaleN = flagNumber(ctx.args, 'scale', 1);
  if (scaleN !== 1 && scaleN !== 2) throw new UsageError('--scale wants 1 or 2');
  const scale = scaleN;
  /* JPEG at quality 92 (render.slide format, gslides-parity SPEC 7.6); SVG from the scene (SPEC-5 6.4) */
  const formatFlag = flagString(ctx.args, 'format') ?? 'png';
  if (formatFlag !== 'png' && formatFlag !== 'jpg' && formatFlag !== 'svg')
    throw new UsageError('--format wants png, jpg or svg');
  const outDir = resolveOut(
    ctx.cwd,
    flagString(ctx.args, 'out'),
    join(derivedDir(dir, ctx.cwd), 'render'),
  );
  if (formatFlag === 'svg') return renderSvgCommand(ctx, dir, loaded, ids, themes, outDir);
  const format = formatFlag;
  const rasterDir = flagBoolean(ctx.args, 'rasters') ? join(outDir, 'rasters') : undefined;

  const tmp = await mkdtemp(join(tmpdir(), 'turboslide-render-'));
  const records: RenderRecord[] = [];
  const startedAt = Date.now();
  try {
    // Phase 1: one document per theme with every slide; a slide is shown by its hash.
    const assetBase = fileUrl(dir, true);
    const jobs: Job[] = [];
    for (const t of themes) {
      const doc = renderThemeDocument(loaded, t, assetBase);
      for (const w of doc.warnings) ctx.out.warn(`render [${t}]: ${w}`);
      const file = await writeTempDocument(doc.html, `deck-${t}.html`, tmp);
      for (const slideId of ids) {
        const n =
          doc.slides.find((s) => s.slideId === slideId)?.n ?? loaded.order.indexOf(slideId) + 1;
        jobs.push({
          slideId,
          n,
          theme: t,
          url: file.url,
          hash: slideHash(slideId),
          imagePath: join(outDir, renderImageName(n, slideId, t, scale, format)),
        });
      }
    }

    // Phase 2: one browser, one page per theme, slides in deck order.
    const launched = await launchBrowser();
    try {
      ctx.out.human(
        `render: ${ids.length} slide(s) x ${themes.join(',')} at ${scale}x with ${launched.renderer}`,
      );
      for (const t of themes) {
        const sheetPage = await openSheetPage(launched.browser, {
          theme: t,
          scale,
          viewport: deckPage(loaded.deck),
        });
        try {
          for (const job of jobs.filter((j) => j.theme === t)) {
            const { record } = await renderSlideRecord(sheetPage, {
              url: job.url,
              hash: job.hash,
              deckId: loaded.deck.id,
              slideId: job.slideId,
              revision: loaded.deck.revision,
              imagePath: job.imagePath,
              format,
              imageRef: relativeImageRef(outDir, job.imagePath),
              renderer: launched.renderer,
              bayerTable: BAYER8.flat(),
              rasterDir,
              readySelector: READY_SELECTOR,
              drawDither: false,
            });
            records.push(record);
            const flags = [
              record.pageErrors.length ? `${record.pageErrors.length} page error(s)` : '',
              record.overflow.length ? `${record.overflow.length} overflow` : '',
              record.fonts.status !== 'loaded' ? 'fonts partial' : '',
            ]
              .filter(Boolean)
              .join(', ');
            ctx.out.human(
              `  ${String(job.n).padStart(2)} ${job.slideId} ${t} ready ${record.timing.readyMs} ms, shot ${record.timing.screenshotMs} ms${flags ? `, ${flags}` : ''}`,
            );
          }
        } finally {
          await sheetPage.close();
        }
      }
    } finally {
      await launched.close();
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
  await writeJson(join(outDir, 'render.json'), records);
  const overflow = records.flatMap((r) =>
    r.overflow.map((o) => `${formatOverflow(r.slideId, o)} [${r.theme}]`),
  );
  const pageErrors = records.filter((r) => r.pageErrors.length > 0);
  if (overflow.length) {
    ctx.out.human('overflow:');
    for (const line of overflow) ctx.out.human(`  ${line}`);
  }
  for (const r of pageErrors) {
    for (const e of r.pageErrors) ctx.out.warn(`page error ${r.slideId} [${r.theme}]: ${e}`);
  }
  ctx.out.human(
    `render: ${records.length} record(s) in ${((Date.now() - startedAt) / 1000).toFixed(1)} s -> ${outDir}/render.json`,
  );
  ctx.out.result(records);
  return pageErrors.length > 0 ? EXIT.findings : EXIT.ok;
}
