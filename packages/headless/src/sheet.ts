// Contact sheets with a JSON cell map (SPEC 7.1 render.sheet, 7.2 turboslide sheet; MILESTONES
// M1 item 8): the renders laid out in a grid of numbered thumbnails with section labels between
// groups, drawn in Chromium so the labels are set in Inter like everything else, and a map from
// cell boxes to slide ids so a judge reading the sheet addresses slides by id (SPEC 7.6 step 3).
// Optional overlays draw lint finding boxes (severity 3 in ink, 1 and 2 in titanium, a 13 px chip
// naming the rule, the overlay grammar of SPEC 2.2) or the plate rectangle on candidate pictures.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { Browser } from 'playwright-core';

import type { Box, RenderTheme } from './contracts.ts';
import { fileUrl } from './document.ts';

export type SheetCell = {
  slideId: string;
  n: number;
  section: string;
  title?: string;
  /** Absolute path or file URL of the render PNG. */
  image: string;
};

export type SheetFinding = { slideId: string; rule: string; severity: 1 | 2 | 3; box?: Box };

export type SheetOptions = {
  theme: RenderTheme;
  cols?: number;
  /** Thumbnail width in pixels. */
  thumb?: number;
  numbered?: boolean;
  /** Section label rows between groups. Default true. */
  labels?: boolean;
  overlay?: 'lint' | 'plate';
  findings?: SheetFinding[];
  /** Plate rectangles per slide id, in sheet pixels, for the plate overlay. */
  plates?: Record<string, Box>;
  /** Fonts CSS to inline (with absolute urls) so labels render in Inter. */
  fontsCss?: string;
  title?: string;
};

export type SheetMap = {
  theme: RenderTheme;
  cols: number;
  thumb: number;
  /** The sheet image size in pixels. */
  size: [number, number];
  cells: { slideId: string; n: number; section: string; box: Box; image: string }[];
  labels: { section: string; box: Box }[];
};

// The sheet tokens on paper, both themes, as head.html defines them (SPEC 2.1). The sheet is a
// judge artifact rather than a slide, so the composite values are written here.
const TOKENS: Record<RenderTheme, Record<string, string>> = {
  light: {
    paper: '#ffffff',
    ink: '#070707',
    titanium: '#8a8f98',
    edge: 'rgba(7,7,7,0.62)',
    hair: 'rgba(7,7,7,0.18)',
  },
  dark: {
    paper: '#070707',
    ink: '#f2f2f0',
    titanium: '#8a8f98',
    edge: 'rgba(242,242,240,0.55)',
    hair: 'rgba(242,242,240,0.22)',
  },
};

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

export const SHEET_GUTTER = { x: 24, y: 28, pad: 32, meta: 22 } as const;

/** The sheet's pixel width for a column count and thumbnail width. */
export function sheetWidth(cols: number, thumb: number): number {
  return SHEET_GUTTER.pad * 2 + cols * thumb + (cols - 1) * SHEET_GUTTER.x;
}

/** The HTML document of a contact sheet. */
export function contactSheetDocument(cells: SheetCell[], options: SheetOptions): string {
  const cols = options.cols ?? 4;
  const thumb = options.thumb ?? 480;
  const t = TOKENS[options.theme];
  const k = thumb / 1600;
  const labels = options.labels !== false;
  const parts: string[] = [];
  let lastSection: string | null = null;
  for (const cell of cells) {
    if (labels && cell.section !== lastSection) {
      parts.push(
        `<div class="label" data-section="${esc(cell.section)}">${esc(cell.section)}</div>`,
      );
      lastSection = cell.section;
    }
    const overlays: string[] = [];
    if (options.overlay === 'lint') {
      for (const f of options.findings ?? []) {
        if (f.slideId !== cell.slideId || !f.box) continue;
        const [x, y, w, h] = f.box;
        overlays.push(
          `<div class="ov s${f.severity}" style="left:${(x * k).toFixed(2)}px;top:${(y * k).toFixed(2)}px;width:${(w * k).toFixed(2)}px;height:${(h * k).toFixed(2)}px"><span>${esc(f.rule)}</span></div>`,
        );
      }
    } else if (options.overlay === 'plate') {
      const plate = options.plates?.[cell.slideId];
      if (plate) {
        const [x, y, w, h] = plate;
        overlays.push(
          `<div class="ov plate" style="left:${(x * k).toFixed(2)}px;top:${(y * k).toFixed(2)}px;width:${(w * k).toFixed(2)}px;height:${(h * k).toFixed(2)}px"><span>plate</span></div>`,
        );
      }
    }
    const src = cell.image.startsWith('file:') ? cell.image : fileUrl(cell.image);
    const meta =
      options.numbered === false ? esc(cell.slideId) : `<b>${cell.n}</b> ${esc(cell.slideId)}`;
    parts.push(
      `<div class="cell" data-slide="${esc(cell.slideId)}" data-n="${cell.n}" data-section="${esc(cell.section)}">` +
        `<div class="meta">${meta}</div>` +
        `<div class="frame"><img src="${esc(src)}" width="${thumb}" height="${Math.round(thumb * 0.5625)}" alt="">${overlays.join('')}</div>` +
        `</div>`,
    );
  }
  return `<!doctype html>
<html lang="en" data-theme="${options.theme}">
<head>
<meta charset="utf-8">
<title>${esc(options.title ?? `Contact sheet, ${options.theme}`)}</title>
<style>
${options.fontsCss ?? ''}
html { color-scheme: ${options.theme}; }
body { margin: 0; background: ${t.paper}; color: ${t.ink}; font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased; }
.sheet { display: grid; grid-template-columns: repeat(${cols}, ${thumb}px); column-gap: ${SHEET_GUTTER.x}px; row-gap: ${SHEET_GUTTER.y}px; padding: ${SHEET_GUTTER.pad}px; width: ${sheetWidth(cols, thumb)}px; box-sizing: border-box; }
.label { grid-column: 1 / -1; font-size: 15px; font-weight: 500; letter-spacing: -0.01em; color: ${t.titanium}; padding-top: 8px; border-bottom: 1px solid ${t.hair}; padding-bottom: 6px; }
.label:first-child { padding-top: 0; }
.cell { display: grid; row-gap: 6px; align-content: start; }
.meta { height: ${SHEET_GUTTER.meta}px; font-size: 14px; line-height: ${SHEET_GUTTER.meta}px; color: ${t.titanium}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
.meta b { color: ${t.ink}; font-weight: 500; margin-right: 6px; }
.frame { position: relative; width: ${thumb}px; height: ${Math.round(thumb * 0.5625)}px; border: 1px solid ${t.edge}; box-sizing: content-box; background: ${t.paper}; }
.frame img { display: block; width: ${thumb}px; height: ${Math.round(thumb * 0.5625)}px; }
.ov { position: absolute; box-sizing: border-box; border: 1px solid ${t.titanium}; pointer-events: none; }
.ov.s3 { border-color: ${t.ink}; }
.ov.plate { border-style: dashed; }
.ov span { position: absolute; left: -1px; top: -15px; font-size: 13px; line-height: 14px; padding: 0 3px; background: ${t.paper}; color: ${t.ink}; white-space: nowrap; }
</style>
</head>
<body><div class="sheet">
${parts.join('\n')}
</div></body>
</html>
`;
}

export type RenderSheetOutput = { png: string; html?: string; map?: string };

/**
 * Render a contact sheet to PNG and return its cell map. The document is written next to the
 * PNG (as `<name>.html`) so the file URLs of the thumbnails resolve, then removed unless
 * `output.html` names a place to keep it.
 */
export async function renderContactSheet(
  browser: Browser,
  cells: SheetCell[],
  options: SheetOptions,
  output: RenderSheetOutput,
): Promise<SheetMap> {
  const cols = options.cols ?? 4;
  const thumb = options.thumb ?? 480;
  const html = contactSheetDocument(cells, options);
  const htmlPath = output.html ?? output.png.replace(/\.png$/, '.html');
  await mkdir(dirname(output.png), { recursive: true });
  await writeFile(htmlPath, html, 'utf8');
  const width = sheetWidth(cols, thumb);
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: options.theme,
    reducedMotion: 'reduce',
  });
  try {
    const page = await context.newPage();
    await page.goto(fileUrl(htmlPath), { waitUntil: 'load' });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        [...document.querySelectorAll('img')].map((img) => img.decode().catch(() => undefined)),
      );
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    });
    const measured = await page.evaluate(() => {
      const box = (el: Element): [number, number, number, number] => {
        const r = el.getBoundingClientRect();
        return [
          Math.round(r.left + window.scrollX),
          Math.round(r.top + window.scrollY),
          Math.round(r.width),
          Math.round(r.height),
        ];
      };
      const cellRows = [...document.querySelectorAll<HTMLElement>('.cell')].map((el) => ({
        slideId: el.dataset.slide ?? '',
        n: Number(el.dataset.n ?? 0),
        section: el.dataset.section ?? '',
        box: box(el.querySelector('.frame') ?? el),
        image: el.querySelector('img')?.getAttribute('src') ?? '',
      }));
      const labels = [...document.querySelectorAll<HTMLElement>('.label')].map((el) => ({
        section: el.dataset.section ?? '',
        box: box(el),
      }));
      const root = document.querySelector('.sheet') ?? document.body;
      return { cells: cellRows, labels, height: Math.ceil(root.getBoundingClientRect().height) };
    });
    await page.screenshot({
      path: output.png,
      type: 'png',
      fullPage: true,
      animations: 'disabled',
    });
    const map: SheetMap = {
      theme: options.theme,
      cols,
      thumb,
      size: [width, measured.height],
      cells: measured.cells,
      labels: measured.labels,
    };
    if (output.map) await writeFile(output.map, `${JSON.stringify(map, null, 2)}\n`, 'utf8');
    return map;
  } finally {
    await context.close();
    if (!output.html) {
      const { rm } = await import('node:fs/promises');
      await rm(htmlPath, { force: true });
    }
  }
}

/** The map file name beside a sheet image: `sheet-<theme>.json` for `sheet-<theme>.png`. */
export function sheetMapPath(pngPath: string): string {
  return pngPath.replace(/\.png$/, '.json');
}

export function sheetPaths(dir: string, theme: RenderTheme): { png: string; map: string } {
  const png = join(dir, `sheet-${theme}.png`);
  return { png, map: sheetMapPath(png) };
}
