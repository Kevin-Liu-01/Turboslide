// Screenshots at 1x and 2x (SPEC 5.3): the sheet clip at the page's device scale factor, PNG (or
// a JPEG at quality 92 for render.slide's `jpg` format, gslides-parity SPEC 7.6), and element
// screenshots of the data-raster elements for the exporter (SPEC 5.2 RasterRef).
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { Page } from 'playwright-core';

import type { Box } from './contracts.ts';
import type { MeasuredRaster } from './measure.ts';

export type ScreenshotResult = { path: string; ms: number };

/** The image formats a sheet screenshot is written in (render.slide `format`, gslides-parity SPEC 7.6). */
export type ScreenshotFormat = 'png' | 'jpg';

/** The JPEG quality of a `jpg` render (SPEC 7.6: JPEG quality 92). */
export const JPEG_QUALITY = 92;

export type ScreenshotOptions = {
  /** PNG (default) or a JPEG at JPEG_QUALITY. */
  format?: ScreenshotFormat;
  /** The deck's page in sheet pixels, the fallback clip when the sheet box is degenerate (gslides-parity SPEC-5 6.1); 1600 by 900 when absent. */
  page?: { width: number; height: number };
};

/**
 * The sheet as a PNG, or a JPEG when asked. The clip is in CSS pixels; the file is clip times the
 * device scale factor.
 */
export async function screenshotSheet(
  page: Page,
  path: string,
  sheet: Box,
  options: ScreenshotOptions = {},
): Promise<ScreenshotResult> {
  await mkdir(dirname(path), { recursive: true });
  const t = performance.now();
  // a degenerate box (an unsized sheet wrapper) falls back to the page's viewport, 1600 by 900 for the default page
  const [x, y, width, height] =
    sheet[2] >= 1 && sheet[3] >= 1
      ? sheet
      : [0, 0, options.page?.width ?? 1600, options.page?.height ?? 900];
  const jpeg = options.format === 'jpg';
  await page.screenshot({
    path,
    type: jpeg ? 'jpeg' : 'png',
    ...(jpeg ? { quality: JPEG_QUALITY } : {}),
    clip: { x, y, width, height },
    animations: 'disabled',
    caret: 'hide',
  });
  return { path, ms: Math.round(performance.now() - t) };
}

export type RasterFile = MeasuredRaster & { file: string };

/**
 * One PNG per raster element, transparent where the element has no ground (icons, marks,
 * diagrams). The file name is `<slideId>-<blockId>-<n>.png` under `dir`.
 */
export async function screenshotRasters(
  page: Page,
  rasters: MeasuredRaster[],
  dir: string,
  slideId: string,
): Promise<RasterFile[]> {
  await mkdir(dir, { recursive: true });
  const out: RasterFile[] = [];
  for (const [i, raster] of rasters.entries()) {
    const file = join(dir, `${slideId}-${raster.blockId}-${i}.png`);
    const handle = page.locator(raster.selector).first();
    await handle.screenshot({
      path: file,
      type: 'png',
      omitBackground: raster.alpha,
      animations: 'disabled',
    });
    out.push({ ...raster, file });
  }
  return out;
}
