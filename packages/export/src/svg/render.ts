// render.slide with `format: 'svg'` (gslides-parity SPEC-5 6.4): one slide's scene measured in
// headless Chromium the way the Editable text export measures it (`extractScenes` in native mode,
// so the rasters are shot and every text carries its lines), then written by `writeSvg` in the
// asked text mode with the theme's sprite for the symbols and the document slide for the icon
// names. Node only (the browser, the file reads); the CLI's `render --format svg` and the hosted
// render route call it. Chromium is the one browser the gate reads the file back in (SPEC-5 6.4).
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { LaunchedBrowser } from '@turboslide/headless/launch';
import { loadThemeBundle } from '@turboslide/render/theme-node';
import type { DeckDocument } from '@turboslide/schema/deck';
import { slideOrder } from '@turboslide/schema/deck';
import type { SvgTextMode } from '@turboslide/schema/preferences';
import { NATIVE_BLOCK_TYPES } from '@turboslide/schema/export';
import type { Theme } from '@turboslide/schema/render';

import { extractScenes } from '../scene/extract.ts';
import type { Scene } from '../scene/types.ts';
import { writeSvg } from './write.ts';
import type { SvgWriteResult } from './write.ts';

export type RenderSvgOptions = {
  deckDir: string;
  document: DeckDocument;
  slideIds: string[];
  theme: Theme;
  text: SvgTextMode;
  /** Where the SVGs and the work folder land. */
  outDir: string;
  /** A launched browser to run on, which the caller closes; default launchBrowser(), closed by the extractor. */
  browser?: LaunchedBrowser;
  onSlide?: (scene: Scene, ms: number) => void;
};

export type RenderedSvg = {
  slideId: string;
  n: number;
  path: string;
  result: SvgWriteResult;
  scene: Scene;
};

/** The file name of a slide's SVG: `<nn>-<slideId>-<theme>.svg`, the render command's pattern. */
export function svgFileName(n: number, slideId: string, theme: Theme): string {
  return `${String(n).padStart(2, '0')}-${slideId}-${theme}.svg`;
}

/** The slides' scenes measured once, each written as an SVG in the text mode; the files under `outDir`. */
export async function renderSvg(options: RenderSvgOptions): Promise<RenderedSvg[]> {
  const { deck, slides } = options.document;
  const order = slideOrder(deck);
  const ids = order.filter((id) => options.slideIds.includes(id));
  if (ids.length === 0) throw new RangeError('renderSvg: no slide to render');
  await mkdir(options.outDir, { recursive: true });
  const bundle = loadThemeBundle({ theme: deck.theme });
  const extracted = await extractScenes({
    deckDir: options.deckDir,
    document: options.document,
    themes: [options.theme],
    mode: 'native',
    slideIds: ids,
    numbering: order,
    workDir: join(options.outDir, 'work'),
    nativeTypes: [...NATIVE_BLOCK_TYPES],
    rasterScale: 'auto',
    pictureScale: 2,
    ...(options.browser !== undefined ? { browser: options.browser } : {}),
    onSlide: options.onSlide,
  });
  const readFile = (path: string): Uint8Array | undefined =>
    existsSync(path) ? new Uint8Array(readFileSync(path)) : undefined;
  const out: RenderedSvg[] = [];
  for (const scene of extracted.scenes) {
    const slide = slides[scene.slideId];
    const result = writeSvg(scene, {
      text: options.text,
      sprite: bundle.sprite,
      ...(slide !== undefined ? { slide } : {}),
      readFile,
      deckTitle: deck.title,
      revision: deck.revision,
      ...(deck.language !== undefined ? { language: deck.language } : {}),
    });
    const path = join(options.outDir, svgFileName(scene.n, scene.slideId, options.theme));
    await writeFile(path, result.svg);
    out.push({ slideId: scene.slideId, n: scene.n, path, result, scene });
  }
  return out;
}
