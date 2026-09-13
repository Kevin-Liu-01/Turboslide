// Scene extraction over the deck (SPEC 8.1, 5.3): render every theme's document with renderDeck,
// open one 1x page per theme for the geometry and one page per raster scale for the pixels, show
// each slide by hash on every page, wait for the render surface's readiness stamp, swap two-tone
// pictures for their regenerated 2x or 3x twins, measure the scene on the 1x page, and shoot what
// the mode needs: the whole sheet at 2x for flatten, the raster elements at 2x (3x for icons and
// marks, SPEC 8.6) with alpha for native. The geometry comes from the 1x page because the verify
// loop compares the export with the 1x render: measured in M2 on the 2x page, element boxes
// disagreed with the record by up to 1.5 px (positioning#dia1 at 731.50 against 733) and rasters
// landed a pixel off. One browser and a few pages, one slide at a time (AGENTS.md). Every page,
// the 3x one included, is a headless `openSheetPage`, so the context and page deadlines and the
// single-process close guard cover all of them: the 3x page used to be opened raw here and its
// close killed chrome-headless-shell on every hosted native export (docs/hosting-chromium.md
// section 3b). Nothing here knows about pptxgenjs; the scenes and the PNG paths are the contract
// the PPTX builder reads.
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Page } from 'playwright-core';

import type { Deck, DeckDocument, Slide } from '@turboslide/schema/deck';
import { slideOrder, slideTitle } from '@turboslide/schema/deck';
import { isShareAlike } from '@turboslide/schema/assets';
import type { Asset } from '@turboslide/schema/assets';
import { NATIVE_BLOCK_TYPES } from '@turboslide/schema/export';
import type { ExportMode } from '@turboslide/schema/export';
import type { Theme } from '@turboslide/schema/render';
import { renderDeck } from '@turboslide/render/deck';
import { loadThemeBundle } from '@turboslide/render/theme-node';
import { openSheetPage, SHEET } from '@turboslide/headless/context';
import type { SheetPage, SheetScale } from '@turboslide/headless/context';
import { fileUrl, writeTempDocument } from '@turboslide/headless/document';
import { launchBrowser } from '@turboslide/headless/launch';
import type { LaunchedBrowser } from '@turboslide/headless/launch';
import { waitForReady } from '@turboslide/headless/ready';

import { MEASURE_CLASS } from '@turboslide/render/measure-dom';

import { enrichScene } from './enrich.ts';
import { measureScene, tagRasterElements } from './measure.ts';
import { twoToneTwinAt2x } from './two-tone.ts';
import type { PictureScale } from './two-tone.ts';
import type { Scene, SceneRaster } from './types.ts';

/** The render surface stamps this when fonts, images and dither canvases are in place (render/runtime.ts). */
export const READY_SELECTOR = 'html[data-ts-ready="1"]';

/**
 * How rasters are scaled: `auto` shoots icons and marks at 3x, diagrams and the language specimen
 * at 1x, everything else at 2x (SPEC 8.6); 2 and 3 force every raster to that scale.
 */
export type RasterScalePolicy = 'auto' | 2 | 3;

/** The raster kinds `auto` shoots at 3x: small glyphs whose edges matter under zoom. */
export const THREE_X_KINDS: ReadonlySet<string> = new Set(['icon', 'mark']);

/**
 * The block types `auto` shoots at 1x, the sheet's own grid. A declared or raw diagram draws 1 px
 * strokes on the half pixel for the 1x grid; LibreOffice resampling a 2x image of it dimmed the
 * half-covered strokes below the verify loop's ink cut (M5 round two: `lines#dia1` and
 * `diagrams#dia4` in the dark theme measured dx +1 dw -2, docs/export-verification.md). The
 * language specimen renders through fallback faces whose hinting differs between the 1x and 2x
 * pages (`multilingual#lang` dy -2). At 1x the file holds the pixels the sheet shows.
 */
export const ONE_X_TYPES: ReadonlySet<string> = new Set(['dia', 'lang']);

export function rasterScaleFor(
  kind: string,
  policy: RasterScalePolicy,
  blockType?: string,
): 1 | 2 | 3 {
  if (policy !== 'auto') return policy;
  if (THREE_X_KINDS.has(kind)) return 3;
  if (kind === 'block' && blockType !== undefined && ONE_X_TYPES.has(blockType)) return 1;
  return 2;
}

export type ExtractOptions = {
  deckDir: string;
  document: DeckDocument;
  themes: Theme[];
  mode: ExportMode;
  /** Slide ids to export, in deck order; default every slide. */
  slideIds?: string[];
  /**
   * The play list the counter counts over (`n / total`), in deck order: the deck without its
   * skipped slides for a download (gslides-parity SPEC 7.2.1); default the deck order.
   */
  numbering?: string[];
  /** Where the sheet PNGs, the rasters and the regenerated pictures land. */
  workDir: string;
  excludeShareAlike?: boolean;
  /** Block types written as native text; default NATIVE_BLOCK_TYPES (`headings: 'raster'` drops heading). */
  nativeTypes?: readonly string[];
  /** Raster scale policy; default auto. */
  rasterScale?: RasterScalePolicy;
  /** The scale two-tone pictures are regenerated at; default 2. */
  pictureScale?: PictureScale;
  /**
   * A launched browser to run on, which the caller closes; default launchBrowser(), closed here.
   * The seam the single-process test uses (extract.test.ts).
   */
  browser?: LaunchedBrowser;
  onSlide?: (scene: Scene, ms: number) => void;
};

export type ExtractResult = {
  scenes: Scene[];
  renderer: string;
  /** The wordmark PNG at 2x per theme. */
  wordmark: Partial<Record<Theme, string>>;
  warnings: string[];
};

/**
 * A raster box on whole sheet pixels: the edges round outward to the nearest pixel that contains
 * the element, so no painted pixel is cut and the box, the clip and the placement agree.
 */
export function snapRasterBox(
  box: [number, number, number, number],
): [number, number, number, number] {
  const [x, y, w, h] = box;
  const x0 = Math.max(0, Math.floor(x + 0.001));
  const y0 = Math.max(0, Math.floor(y + 0.001));
  const x1 = Math.min(SHEET.width, Math.ceil(x + w - 0.001));
  const y1 = Math.min(SHEET.height, Math.ceil(y + h - 0.001));
  return [x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)];
}

function slideHash(slideId: string): string {
  return `s/${encodeURIComponent(slideId)}`;
}

function pictureAssetOf(slide: Slide, deck: Deck): Asset | undefined {
  if (slide.kind !== 'opener' && slide.kind !== 'mood' && slide.kind !== 'closing')
    return undefined;
  return deck.assets[slide.picture.asset];
}

async function showSlide(page: Page, url: string, hash: string): Promise<void> {
  if (page.url().split('#')[0] === url) {
    await page.evaluate((h) => {
      document.documentElement.removeAttribute('data-ts-ready');
      location.hash = h;
    }, hash);
  } else {
    await page.goto(`${url}#${hash}`, { waitUntil: 'load' });
  }
  await page.waitForSelector(READY_SELECTOR, { state: 'attached', timeout: 20_000 });
}

/** Replaces the active slide's picture with a data URI and waits for it to decode. */
async function swapPicture(page: Page, dataUri: string): Promise<void> {
  await page.evaluate(async (src) => {
    const img = document.querySelector<HTMLImageElement>(
      '.slide.is-on img.opener-img, .slide.is-on img.mood-img',
    );
    if (!img) return;
    img.removeAttribute('data-light');
    img.removeAttribute('data-dark');
    img.src = src;
    try {
      await img.decode();
    } catch {
      // a failed decode leaves the previous picture; the scene records the source it measured
    }
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  }, dataUri);
}

async function hidePicture(page: Page): Promise<void> {
  await page.evaluate(() => {
    const img = document.querySelector<HTMLImageElement>(
      '.slide.is-on img.opener-img, .slide.is-on img.mood-img',
    );
    if (img) img.style.visibility = 'hidden';
  });
}

/**
 * The measurement class of gslides-parity SPEC-2 1.5 on every sheet root: on, a rotated or flipped
 * object's wrapper drops its transform (render block-css.ts), so the boxes and the element
 * screenshots are the unrotated ones and pptxgenjs `rotate` turns them once; off, the sheet
 * screenshot shows the rotation. Two frames after each switch so layout and paint settle.
 */
async function setMeasureClass(page: Page, on: boolean, className: string): Promise<void> {
  await page.evaluate(
    async ({ on: flag, className: name }) => {
      document.querySelectorAll('.ts-sheet').forEach((el) => el.classList.toggle(name, flag));
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    },
    { on, className },
  );
}

/** Makes the page ground transparent around element screenshots so alpha rasters have no paper behind them. */
async function setTransparentGround(page: Page, on: boolean): Promise<void> {
  await page.evaluate((transparent) => {
    const targets = [
      document.documentElement,
      document.body,
      ...document.querySelectorAll<HTMLElement>('.ts-sheet, .ts-stage'),
    ];
    for (const el of targets) {
      if (transparent) el.style.setProperty('background', 'transparent', 'important');
      else el.style.removeProperty('background');
    }
  }, on);
}

export async function extractScenes(options: ExtractOptions): Promise<ExtractResult> {
  const { deck, slides } = options.document;
  const order = slideOrder(deck);
  const wanted = options.slideIds ? new Set(options.slideIds) : null;
  const ids = order.filter((id) => !wanted || wanted.has(id));
  // the counter counts over the play list (render deck.ts renderSlides), the slides' data-counter
  // carries the text and the render surface's runtime shows it, so nothing is written by hand
  const play = options.numbering ?? order;
  const total = play.length;
  const bundle = loadThemeBundle();
  const assetBase = fileUrl(options.deckDir, true);
  const tmp = await mkdtemp(join(tmpdir(), 'turboslide-export-'));
  const scenes: Scene[] = [];
  const warnings: string[] = [];
  const wordmark: Partial<Record<Theme, string>> = {};
  const nativeTypes: readonly string[] = options.nativeTypes ?? [...NATIVE_BLOCK_TYPES];
  let renderer = '';
  try {
    const docs = new Map<Theme, { url: string; n: Map<string, number> }>();
    for (const theme of options.themes) {
      const rendered = renderDeck(deck, Object.values(slides), {
        theme,
        bundle,
        chrome: true,
        assetBase,
        blockAttrs: true,
        gtWord: true,
        present: true,
        slideIds: ids,
        numbering: play,
        title: `${deck.title} (${theme})`,
      });
      warnings.push(...rendered.warnings.map((w) => `render [${theme}]: ${w}`));
      const file = await writeTempDocument(rendered.html, `deck-${theme}.html`, tmp);
      docs.set(theme, { url: file.url, n: new Map(rendered.slides.map((s) => [s.slideId, s.n])) });
    }
    const launched = options.browser ?? (await launchBrowser());
    renderer = launched.renderer;
    const policy = options.rasterScale ?? 'auto';
    const pictureScale = options.pictureScale ?? 2;
    try {
      for (const theme of options.themes) {
        const doc = docs.get(theme);
        if (!doc) continue;
        // The 1x page measures; the shot pages carry the pixels. Which shot scales a theme needs
        // depends on the mode: flatten shoots the sheet at 2x, native shoots rasters at 2x and, for
        // icons and marks under `auto`, at 3x.
        const shotScales: (2 | 3)[] =
          options.mode === 'flatten' ? [2] : policy === 'auto' ? [2, 3] : [policy];
        const measurePage = await openSheetPage(launched.browser, { theme, scale: 1 });
        const shotPages = new Map<2 | 3, SheetPage<2 | 3>>();
        for (const scale of shotScales)
          shotPages.set(scale, await openSheetPage(launched.browser, { theme, scale }));
        const pictureDir = join(options.workDir, 'pictures', theme);
        const rasterDir = join(options.workDir, 'rasters', theme);
        const sheetDir = join(options.workDir, 'sheets', theme);
        await mkdir(pictureDir, { recursive: true });
        await mkdir(rasterDir, { recursive: true });
        await mkdir(sheetDir, { recursive: true });
        const picturesDone = new Map<string, string>();
        const pages: SheetPage<SheetScale>[] = [measurePage, ...shotPages.values()];
        try {
          for (const slideId of ids) {
            const slide = slides[slideId];
            if (!slide) {
              warnings.push(`${slideId}: listed in deck.json but no slide file`);
              continue;
            }
            const t0 = performance.now();
            for (const sheetPage of pages) {
              sheetPage.takeErrors();
              await showSlide(sheetPage.page, doc.url, slideHash(slideId));
              await waitForReady(sheetPage.page);
            }

            // The picture: excluded, regenerated at 2x or 3x for a two-tone treatment, or the twin file.
            const asset = pictureAssetOf(slide, deck);
            let pictureFile: string | undefined;
            let pictureExcluded = false;
            let pictureRegenerated = false;
            if (asset) {
              if (options.excludeShareAlike && isShareAlike(asset)) {
                for (const sheetPage of pages) await hidePicture(sheetPage.page);
                pictureExcluded = true;
              } else {
                const twin = 'neutral' in asset.twins ? asset.twins.neutral : asset.twins[theme];
                const twinPath = join(options.deckDir, twin);
                if (!existsSync(twinPath)) {
                  warnings.push(`${slideId}: picture twin ${twin} is missing`);
                } else if (asset.treatment?.kind === 'two-tone') {
                  const cached = picturesDone.get(asset.id);
                  if (cached) pictureFile = cached;
                  else {
                    const paper = theme === 'dark' ? '#070707' : '#ffffff';
                    const ink = theme === 'dark' ? '#f2f2f0' : '#070707';
                    const twoTone = await twoToneTwinAt2x(
                      twinPath,
                      theme,
                      { paper, ink },
                      asset.treatment.cell,
                      pictureScale,
                    );
                    pictureFile = join(pictureDir, `${asset.id}@${pictureScale}x.png`);
                    await writeFile(pictureFile, twoTone.png);
                    picturesDone.set(asset.id, pictureFile);
                  }
                  const bytes = await readFile(pictureFile);
                  const uri = `data:image/png;base64,${bytes.toString('base64')}`;
                  for (const sheetPage of pages) await swapPicture(sheetPage.page, uri);
                  pictureRegenerated = true;
                } else {
                  pictureFile = twinPath;
                }
              }
            }

            // The order of one page pass (gslides-parity SPEC-2 1.5): the measurement class on
            // every page, two frames, the tags, the measurement and the element screenshots (a
            // rotated object at its unrotated box, `rotate` and `flip` from its wrapper), the class
            // off, two frames, then the flatten sheet screenshot, which shows the rotation.
            for (const sheetPage of pages)
              await setMeasureClass(sheetPage.page, true, MEASURE_CLASS);

            // The same tags on every page: one document order, one rid per element.
            const tagOptions = { nativeTypes };
            const tags = await tagRasterElements(measurePage.page, tagOptions);
            for (const sheetPage of shotPages.values())
              await tagRasterElements(sheetPage.page, tagOptions);

            const scene = enrichScene(
              await measureScene(measurePage.page, {
                slideId,
                n: doc.n.get(slideId) ?? order.indexOf(slideId) + 1,
                total,
                theme,
                kind: slide.kind,
                nativeTypes,
                pictureAssetId: asset?.id,
                notes: slide.notes,
                tags,
              }),
              slide,
            );
            scene.title = slideTitle(slide, scene.n);
            if (pictureFile) scene.pictureFile = pictureFile;
            if (pictureExcluded) scene.pictureExcluded = true;
            if (pictureRegenerated) scene.pictureRegenerated = true;
            const nn = String(scene.n).padStart(2, '0');

            const wantRasters: SceneRaster[] =
              options.mode === 'native'
                ? scene.rasters
                : scene.rasters.filter((r) => r.blockId === 'wordmark' && !wordmark[theme]);
            if (wantRasters.length > 0) {
              const touched = new Set<SheetPage<SheetScale>>();
              try {
                for (const raster of wantRasters) {
                  if (raster.blockId === 'wordmark' && wordmark[theme]) continue;
                  const [, , w, h] = raster.box;
                  if (w < 1 || h < 1) continue;
                  const blockType = scene.blocks.find((b) => b.blockId === raster.blockId)?.type;
                  const scale = rasterScaleFor(raster.kind, policy, blockType);
                  // the 1x shots come from the measure page itself, the sheet's own grid; a
                  // forced policy has one shot page, which then serves every other scale
                  const shotPage =
                    scale === 1
                      ? undefined
                      : (shotPages.get(scale) ?? shotPages.get(2) ?? shotPages.get(3));
                  if (scale !== 1 && !shotPage) continue;
                  const sheetPage: SheetPage<SheetScale> = shotPage ?? measurePage;
                  raster.scale = sheetPage.scale;
                  // A 1x raster keeps the sheet's own pixels behind it: an alpha PNG of a hairline
                  // junction (two 18 percent strokes, alpha 0.27) came back 6 units lighter from
                  // LibreOffice's compositing and crossed the verify loop's ink cut (M5 round three,
                  // diagrams#dia3 dw -85); opaque, the page shows the pixel the sheet shows. Only a
                  // page that shoots alpha rasters loses its ground: an opaque shot over a
                  // transparent ground comes back on white, a white plate on the dark theme
                  // (round four: every dark diagram measured tens of pixels off).
                  const omitBackground = raster.alpha && scale !== 1;
                  if (!omitBackground) raster.alpha = false;
                  if (omitBackground && !touched.has(sheetPage)) {
                    await setTransparentGround(sheetPage.page, true);
                    touched.add(sheetPage);
                  }
                  const safeId = raster.id.replace(/[^\w.-]+/g, '_');
                  const path =
                    raster.blockId === 'wordmark'
                      ? join(rasterDir, `wordmark@${raster.scale}x.png`)
                      : join(rasterDir, `${nn}-${slideId}-${safeId}@${raster.scale}x.png`);
                  // The clip and the placement are the same whole sheet pixels (snapRasterBox):
                  // Chromium paints a replaced element's pixels on the 1x grid, and LibreOffice
                  // drawing a 2x or 3x image at a whole-pixel box scales it by exactly 2 or 3 with
                  // no half-pixel phase. Measured in M2 and the M5 baseline: the same raster placed
                  // at its fractional box (the mark at x 190.5, a diagram at 731.5) landed 1 px
                  // right and 2 px narrower in the page.
                  const snapped = snapRasterBox(raster.box);
                  raster.box = snapped;
                  const [x, y, cw, ch] = snapped;
                  await sheetPage.page.screenshot({
                    path,
                    type: 'png',
                    clip: { x, y, width: cw, height: ch },
                    omitBackground,
                    animations: 'disabled',
                    caret: 'hide',
                  });
                  raster.file = path;
                  if (raster.blockId === 'wordmark') wordmark[theme] = path;
                }
              } finally {
                for (const sheetPage of touched) await setTransparentGround(sheetPage.page, false);
              }
            }

            for (const sheetPage of pages)
              await setMeasureClass(sheetPage.page, false, MEASURE_CLASS);

            if (options.mode === 'flatten') {
              const sheetPage = shotPages.get(2);
              if (sheetPage) {
                const [x, y, w, h] = scene.sheet;
                const path = join(sheetDir, `${nn}-${slideId}@2x.png`);
                await sheetPage.page.screenshot({
                  path,
                  type: 'png',
                  clip: { x, y, width: w, height: h },
                  animations: 'disabled',
                  caret: 'hide',
                });
                scene.sheetImage = path;
              }
            }
            const errors = measurePage.takeErrors();
            scene.warnings.push(...errors.pageErrors.map((e) => `page error: ${e}`));
            scenes.push(scene);
            options.onSlide?.(scene, Math.round(performance.now() - t0));
          }
        } finally {
          for (const sheetPage of pages) await sheetPage.close();
        }
      }
    } finally {
      // a browser the caller handed in stays the caller's to close
      if (!options.browser) await launched.close();
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
  return { scenes, renderer, wordmark, warnings };
}
