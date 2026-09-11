// Scene extraction over the deck (SPEC 8.1, 5.3): render every theme's document with renderDeck,
// open one 2x page per theme, show each slide by hash, wait for the render surface's readiness
// stamp, swap two-tone pictures for their regenerated 2x twins, measure the scene, and shoot what
// the mode needs: the whole sheet at 2x for flatten, the raster elements at 2x with alpha for
// native. One browser and one page at a time (AGENTS.md). Nothing here knows about pptxgenjs; the
// scenes and the PNG paths are the contract the PPTX builder reads.
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Page } from 'playwright-core';

import type { Deck, DeckDocument, Slide } from '@turboslide/schema/deck';
import { slideOrder } from '@turboslide/schema/deck';
import { isShareAlike } from '@turboslide/schema/assets';
import type { Asset } from '@turboslide/schema/assets';
import { NATIVE_BLOCK_TYPES } from '@turboslide/schema/export';
import type { ExportMode } from '@turboslide/schema/export';
import type { Theme } from '@turboslide/schema/render';
import { renderDeck } from '@turboslide/render/deck';
import { loadThemeBundle } from '@turboslide/render/theme-node';
import { openSheetPage } from '@turboslide/headless/context';
import { fileUrl, writeTempDocument } from '@turboslide/headless/document';
import { launchBrowser } from '@turboslide/headless/launch';
import { waitForReady } from '@turboslide/headless/ready';

import { measureScene } from './measure.ts';
import { twoToneTwinAt2x } from './two-tone.ts';
import type { Scene } from './types.ts';

/** The render surface stamps this when fonts, images and dither canvases are in place (render/runtime.ts). */
export const READY_SELECTOR = 'html[data-ts-ready="1"]';

export type ExtractOptions = {
  deckDir: string;
  document: DeckDocument;
  themes: Theme[];
  mode: ExportMode;
  /** Slide ids to export, in deck order; default every slide. */
  slideIds?: string[];
  /** Where the sheet PNGs, the rasters and the regenerated pictures land. */
  workDir: string;
  excludeShareAlike?: boolean;
  onSlide?: (scene: Scene, ms: number) => void;
};

export type ExtractResult = {
  scenes: Scene[];
  renderer: string;
  /** The wordmark PNG at 2x per theme. */
  wordmark: Partial<Record<Theme, string>>;
  warnings: string[];
};

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

/** Writes `nn / total` into the stage counter (stage.ts counterText), the deck's numbering. */
async function setCounter(page: Page, n: number, total: number): Promise<void> {
  await page.evaluate(
    ({ n: index, total: count }) => {
      const pad = (v: number): string => (v < 10 ? `0${v}` : String(v));
      const counter = document.querySelector('.ts-stage .counter, .counter');
      if (counter) counter.textContent = `${pad(index)} / ${pad(count)}`;
    },
    { n, total },
  );
}

async function hidePicture(page: Page): Promise<void> {
  await page.evaluate(() => {
    const img = document.querySelector<HTMLImageElement>(
      '.slide.is-on img.opener-img, .slide.is-on img.mood-img',
    );
    if (img) img.style.visibility = 'hidden';
  });
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
  const bundle = loadThemeBundle();
  const assetBase = fileUrl(options.deckDir, true);
  const tmp = await mkdtemp(join(tmpdir(), 'turboslide-export-'));
  const scenes: Scene[] = [];
  const warnings: string[] = [];
  const wordmark: Partial<Record<Theme, string>> = {};
  const nativeTypes = [...NATIVE_BLOCK_TYPES];
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
        title: `${deck.title} (${theme})`,
      });
      warnings.push(...rendered.warnings.map((w) => `render [${theme}]: ${w}`));
      const file = await writeTempDocument(rendered.html, `deck-${theme}.html`, tmp);
      docs.set(theme, { url: file.url, n: new Map(rendered.slides.map((s) => [s.slideId, s.n])) });
    }
    const launched = await launchBrowser();
    renderer = launched.renderer;
    try {
      for (const theme of options.themes) {
        const doc = docs.get(theme);
        if (!doc) continue;
        const sheetPage = await openSheetPage(launched.browser, { theme, scale: 2 });
        const { page } = sheetPage;
        const pictureDir = join(options.workDir, 'pictures', theme);
        const rasterDir = join(options.workDir, 'rasters', theme);
        const sheetDir = join(options.workDir, 'sheets', theme);
        await mkdir(pictureDir, { recursive: true });
        await mkdir(rasterDir, { recursive: true });
        await mkdir(sheetDir, { recursive: true });
        const picturesDone = new Map<string, string>();
        try {
          for (const slideId of ids) {
            const slide = slides[slideId];
            if (!slide) {
              warnings.push(`${slideId}: listed in deck.json but no slide file`);
              continue;
            }
            const t0 = performance.now();
            sheetPage.takeErrors();
            await showSlide(page, doc.url, slideHash(slideId));
            await waitForReady(page);
            // the render surface counts the slides in its document; the export counts the deck's
            await setCounter(page, doc.n.get(slideId) ?? order.indexOf(slideId) + 1, order.length);

            // The picture: excluded, regenerated at 2x for a two-tone treatment, or the twin file.
            const asset = pictureAssetOf(slide, deck);
            let pictureFile: string | undefined;
            let pictureExcluded = false;
            let pictureRegenerated = false;
            if (asset) {
              if (options.excludeShareAlike && isShareAlike(asset)) {
                await hidePicture(page);
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
                    );
                    pictureFile = join(pictureDir, `${asset.id}@2x.png`);
                    await writeFile(pictureFile, twoTone.png);
                    picturesDone.set(asset.id, pictureFile);
                  }
                  const bytes = await readFile(pictureFile);
                  await swapPicture(page, `data:image/png;base64,${bytes.toString('base64')}`);
                  pictureRegenerated = true;
                } else {
                  pictureFile = twinPath;
                }
              }
            }

            const scene = await measureScene(page, {
              slideId,
              n: doc.n.get(slideId) ?? order.indexOf(slideId) + 1,
              total: order.length,
              theme,
              kind: slide.kind,
              nativeTypes,
              pictureAssetId: asset?.id,
              notes: slide.notes,
            });
            if (pictureFile) scene.pictureFile = pictureFile;
            if (pictureExcluded) scene.pictureExcluded = true;
            if (pictureRegenerated) scene.pictureRegenerated = true;
            const nn = String(scene.n).padStart(2, '0');

            if (options.mode === 'flatten') {
              const [x, y, w, h] = scene.sheet;
              const path = join(sheetDir, `${nn}-${slideId}@2x.png`);
              await page.screenshot({
                path,
                type: 'png',
                clip: { x, y, width: w, height: h },
                animations: 'disabled',
                caret: 'hide',
              });
              scene.sheetImage = path;
            }

            const wantRasters =
              options.mode === 'native'
                ? scene.rasters
                : scene.rasters.filter((r) => r.blockId === 'wordmark' && !wordmark[theme]);
            if (wantRasters.length > 0) {
              await setTransparentGround(page, true);
              try {
                for (const raster of wantRasters) {
                  if (raster.blockId === 'wordmark' && wordmark[theme]) continue;
                  const [, , w, h] = raster.box;
                  if (w < 1 || h < 1) continue;
                  const safeId = raster.id.replace(/[^\w.-]+/g, '_');
                  const path =
                    raster.blockId === 'wordmark'
                      ? join(rasterDir, 'wordmark@2x.png')
                      : join(rasterDir, `${nn}-${slideId}-${safeId}@2x.png`);
                  if (raster.clip) {
                    const [x, y, cw, ch] = raster.box;
                    await page.screenshot({
                      path,
                      type: 'png',
                      clip: { x, y, width: cw, height: ch },
                      omitBackground: raster.alpha,
                      animations: 'disabled',
                      caret: 'hide',
                    });
                  } else {
                    await page.locator(raster.selector).first().screenshot({
                      path,
                      type: 'png',
                      omitBackground: raster.alpha,
                      animations: 'disabled',
                    });
                  }
                  raster.file = path;
                  if (raster.blockId === 'wordmark') wordmark[theme] = path;
                }
              } finally {
                await setTransparentGround(page, false);
              }
            }
            const errors = sheetPage.takeErrors();
            scene.warnings.push(...errors.pageErrors.map((e) => `page error: ${e}`));
            scenes.push(scene);
            options.onSlide?.(scene, Math.round(performance.now() - t0));
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
  return { scenes, renderer, wordmark, warnings };
}
