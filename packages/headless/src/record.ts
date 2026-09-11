// One slide to one RenderRecord (SPEC 4.2, 5.3): load the rendered document, draw the dither
// canvases, wait for readiness, measure, screenshot, and record the renderer string, the errors,
// the overflow, the block boxes, the font status and the rasters, with timings.
import { relative } from 'node:path';

import type { RenderRecord, RenderScale, RenderTheme } from './contracts.ts';
import type { SheetPage } from './context.ts';
import { measureSlide } from './measure.ts';
import type { MeasureOptions } from './measure.ts';
import { launchLog } from './launch.ts';
import { drawDitherCanvases, waitForReady } from './ready.ts';
import { screenshotRasters, screenshotSheet } from './screenshot.ts';

export type RenderSlideInput = {
  /** file:// URL of the document (one slide, or every slide of a theme navigated by hash). */
  url: string;
  /** The fragment that selects the slide in a multi-slide document, for example `s/<slideId>`. */
  hash?: string;
  deckId: string;
  slideId: string;
  revision: number;
  /** Where the PNG lands. */
  imagePath: string;
  /** The `image` field of the record: a path relative to the render directory or absolute. */
  imageRef?: string;
  /** The renderer string from launchBrowser. */
  renderer: string;
  /** The 64-entry Bayer table for the dither canvases. */
  bayerTable: readonly number[];
  /** When set, data-raster elements are screenshotted into this directory. */
  rasterDir?: string;
  measure?: MeasureOptions;
  /** A selector to wait for before the readiness checks, for example 'html[data-ts-ready="1"]'. */
  readySelector?: string;
  /** Draw the dither canvases from the Bayer table (default true; off when the document's runtime draws them). */
  drawDither?: boolean;
  /** Anchors of material frames present on the slide (M5); empty in M1. */
  anchors?: RenderRecord['anchors'];
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
};

export type RenderSlideResult = { record: RenderRecord; readyMs: number; screenshotMs: number };

export async function renderSlideRecord(
  sheetPage: SheetPage,
  input: RenderSlideInput,
): Promise<RenderSlideResult> {
  const { page, theme, scale } = sheetPage;
  sheetPage.takeErrors();
  if (input.hash !== undefined && page.url().split('#')[0] === input.url) {
    // same document: the runtime shows the slide on hashchange and re-stamps readiness
    await page.evaluate((hash) => {
      document.documentElement.removeAttribute('data-ts-ready');
      location.hash = hash;
    }, input.hash);
  } else {
    const target = input.hash !== undefined ? `${input.url}#${input.hash}` : input.url;
    await page.goto(target, { waitUntil: input.waitUntil ?? 'load' });
  }
  const t = performance.now();
  const step = (name: string): void =>
    launchLog(`${input.slideId} ${theme}: ${name} at ${Math.round(performance.now() - t)} ms`);
  step('loaded');
  if (input.readySelector)
    await page.waitForSelector(input.readySelector, { state: 'attached', timeout: 15_000 });
  if (input.drawDither !== false)
    await drawDitherCanvases(page, { table: input.bayerTable, theme });
  step('dither drawn');
  const ready = await waitForReady(page);
  step(`ready (fonts ${ready.fonts.status}, frames ${ready.frames})`);
  const measured = await measureSlide(page, input.measure);
  step('measured');
  const shot = await screenshotSheet(page, input.imagePath, measured.sheet);
  step('shot');
  const rasterFiles = input.rasterDir
    ? await screenshotRasters(page, measured.rasters, input.rasterDir, input.slideId)
    : [];
  const errors = sheetPage.takeErrors();
  const pageErrors = [
    ...errors.pageErrors,
    ...ready.brokenImages.map((src) => `image failed to decode: ${src}`),
  ];
  const record: RenderRecord = {
    deckId: input.deckId,
    slideId: input.slideId,
    revision: input.revision,
    theme,
    scale,
    image: input.imageRef ?? input.imagePath,
    renderer: input.renderer,
    pageErrors,
    consoleErrors: errors.consoleErrors,
    overflow: measured.overflow,
    blocks: measured.blocks,
    fonts: ready.fonts,
    anchors: input.anchors ?? [],
    rasters: input.rasterDir
      ? rasterFiles.map((r) => ({
          blockId: r.blockId,
          kind: r.kind,
          file: r.file,
          box: r.box,
          alpha: r.alpha,
        }))
      : measured.rasters.map((r) => ({
          blockId: r.blockId,
          kind: r.kind,
          file: '',
          box: r.box,
          alpha: r.alpha,
        })),
    timing: { readyMs: ready.readyMs, screenshotMs: shot.ms },
  };
  return { record, readyMs: ready.readyMs, screenshotMs: shot.ms };
}

/** The file name of SPEC 7.2: `<nn>-<slideId>-<theme>.png`, nn zero padded to two digits. */
export function renderImageName(
  n: number,
  slideId: string,
  theme: RenderTheme,
  scale: RenderScale = 1,
): string {
  const nn = String(n).padStart(2, '0');
  return scale === 1 ? `${nn}-${slideId}-${theme}.png` : `${nn}-${slideId}-${theme}@${scale}x.png`;
}

/** A record image path relative to the render directory, as compare-to-shoot.mjs reads it. */
export function relativeImageRef(renderDir: string, imagePath: string): string {
  const rel = relative(renderDir, imagePath);
  return rel.startsWith('..') ? imagePath : rel;
}
