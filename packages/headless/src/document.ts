// The page skeleton a slide renders inside for a screenshot (SPEC 5.3, the rasters row): the
// theme stamped on the root and the sheet before first paint, the sheet at 0,0 filling the 1600
// by 900 viewport exactly (the deck's present mode), no chrome. The body is the render package's
// output (renderStage around renderSlide, SPEC 5.2); the styles are the theme's sheet.css and
// stage.css and the fonts CSS, passed in by the caller so this package stays below theme and
// fonts in the dependency direction (SPEC 3.3 item 3).
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { RenderTheme } from './contracts.ts';

export type SheetDocument = {
  theme: RenderTheme;
  /** The rendered stage markup: the .ts-sheet root with the frame and the slide inside. */
  body: string;
  /** Style sheets inlined in order: fonts, sheet.css, stage.css, then any extra. */
  styles: string[];
  /** Base URL for relative asset paths, usually the deck directory as a file URL. */
  base?: string;
  title?: string;
  /** Inline SVG sprite markup (the 63 Heroicons plus gt-mark) placed before the body. */
  sprite?: string;
  /** Extra head markup, for example a <script> that a live block needs. */
  head?: string;
  /** The deck's page in sheet pixels (gslides-parity SPEC-5 6.1): the viewport and the sheet fill it; 1600 by 900 when absent. */
  page?: { width: number; height: number };
};

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** A complete HTML document for one slide at sheet size. */
export function sheetDocument(doc: SheetDocument): string {
  const styles = doc.styles.map((css) => `<style>\n${css}\n</style>`).join('\n');
  const base = doc.base ? `<base href="${escapeAttr(doc.base)}">` : '';
  const w = doc.page?.width ?? 1600;
  const h = doc.page?.height ?? 900;
  return `<!doctype html>
<html lang="en" data-theme="${doc.theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=${w},initial-scale=1">
<title>${escapeAttr(doc.title ?? 'Turboslide render')}</title>
${base}
<style>
/* headless skeleton: the sheet fills the viewport, as the deck's present mode does (shoot-slide.mjs line 39) */
html { color-scheme: ${doc.theme}; }
html, body { margin: 0; padding: 0; width: ${w}px; height: ${h}px; overflow: hidden; }
body { position: relative; background: ${doc.theme === 'dark' ? '#070707' : '#ffffff'}; }
.ts-sheet { position: absolute; left: 0; top: 0; width: ${w}px; height: ${h}px; overflow: hidden; }
</style>
${styles}
${doc.head ?? ''}
</head>
<body>
${doc.sprite ?? ''}
${doc.body}
</body>
</html>
`;
}

/** Absolute path to file URL, with a trailing slash for directories used as a base. */
export function fileUrl(path: string, directory = false): string {
  const url = pathToFileURL(resolve(path)).href;
  return directory && !url.endsWith('/') ? `${url}/` : url;
}

export type TempDocument = { path: string; url: string };

/**
 * Write a document to a temp file and return its file URL. Chromium refuses file:// subresources
 * from about:blank, so rendered documents are always loaded from a file rather than setContent.
 */
export async function writeTempDocument(
  html: string,
  name = 'slide.html',
  dir?: string,
): Promise<TempDocument> {
  const directory = dir ?? (await mkdtemp(join(tmpdir(), 'turboslide-')));
  const path = join(directory, name);
  await writeFile(path, html, 'utf8');
  return { path, url: fileUrl(path) };
}
