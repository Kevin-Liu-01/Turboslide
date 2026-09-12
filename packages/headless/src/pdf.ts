// PDF through Chromium's own printer (gslides-parity SPEC 7.6): a print document (the render
// package's renderPrintDocument, one 960 by 540 pt page per slide) is loaded from a file, its
// dither canvases drawn and its fonts and images awaited (ready.ts), then `page.pdf` with the CSS
// page size and the backgrounds. Nothing here knows the deck; the export package's pdf/build.ts
// composes the document and gates the pages. The two readers below answer the page count and the
// page size from the file itself (the `/Type /Page` objects and the first `/MediaBox`), so a
// gate without poppler still knows how many pages the file holds.
import { readFile } from 'node:fs/promises';

import type { Page } from 'playwright-core';

import { drawDitherCanvases, waitForReady } from './ready.ts';
import type { ReadyInfo } from './ready.ts';

export type PrintPdfOptions = {
  /** The file URL of the print document. */
  url: string;
  /** Where the PDF lands. */
  path: string;
  /** The 64-entry Bayer table for the dither canvases (effects/bayer BAYER8). */
  bayerTable: readonly number[];
  theme: 'light' | 'dark';
  /**
   * The print scale (default 1): the finished page is scaled onto the paper after layout, so a
   * document laid out at the sheet's 1600 px lands on a 960 pt page at 0.8 with its hairlines
   * still on whole pixels (render/print.ts PRINT_SCALE).
   */
  scale?: number;
  /** Fonts, images and frames wait at most this long before printing (default 20 s). */
  timeoutMs?: number;
};

export type PrintPdfResult = { path: string; bytes: number; ms: number; ready: ReadyInfo };

/**
 * Prints the document at `url` to `path`: every `.ts-page` is one page because the document's
 * `@page` names PowerPoint's size and `preferCSSPageSize` keeps it; `printBackground` keeps the
 * paper and the plates.
 */
export async function printPdf(page: Page, options: PrintPdfOptions): Promise<PrintPdfResult> {
  const t = performance.now();
  await page.goto(options.url, { waitUntil: 'load' });
  // every dither cell as a 2 by 2 block at the CSS size: a PDF viewer interpolates the canvas
  // bitmap, and the half size canvas the screen draws would blur into grey
  await drawDitherCanvases(page, {
    table: options.bayerTable,
    theme: options.theme,
    cells: 'full',
  });
  // every page's slide, not the first one only: the ready wait reads the text nodes of its root
  const ready = await waitForReady(page, {
    rootSelector: 'body',
    timeoutMs: options.timeoutMs ?? 20_000,
  });
  const bytes = await page.pdf({
    path: options.path,
    preferCSSPageSize: true,
    printBackground: true,
    displayHeaderFooter: false,
    scale: options.scale ?? 1,
  });
  return {
    path: options.path,
    bytes: bytes.byteLength,
    ms: Math.round(performance.now() - t),
    ready,
  };
}

/** How many pages a PDF holds: its `/Type /Page` objects (not `/Pages`), read from the file. */
export async function pdfPageCount(path: string): Promise<number> {
  const text = (await readFile(path)).toString('latin1');
  return (text.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
}

/** The first page's MediaBox in points, or null when the file has none. */
export async function pdfPageSize(path: string): Promise<{ width: number; height: number } | null> {
  const text = (await readFile(path)).toString('latin1');
  const match = /\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/.exec(text);
  if (!match) return null;
  const [, x0, y0, x1, y1] = match.map(Number);
  if ([x0, y0, x1, y1].some((v) => v === undefined || Number.isNaN(v))) return null;
  return {
    width: Math.round(Math.abs((x1 as number) - (x0 as number)) * 100) / 100,
    height: Math.round(Math.abs((y1 as number) - (y0 as number)) * 100) / 100,
  };
}
