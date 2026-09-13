// The canvas measurer of the CLI and the MCP stdio server (gslides-parity SPEC-2 1.3, 0.72, 0.104):
// the boxes `toCanvas` reads, measured on a 1x headless sheet page that renders the slide with
// prompts drawn (an empty placeholder keeps the prompt's box, 0.97), waits for the same readiness
// as a render (fonts, every image decoded, the dither canvases, two frames) and reads
// `getBoundingClientRect` with no transform on the stage. One browser and one page serve every
// slide of a call, so `slide to-canvas` with twenty ids launches once.
//
// The measurement itself is B2's `measureCanvas` and `measureFit` of @turboslide/headless/measure
// (over `measureCanvasBoxes` and `measureFitBoxes` of @turboslide/render/measure-dom, the origin
// the `.ts-stage` element, boxes at 1/64 px), the one function the editor's hidden sheet
// (@turboslide/viewer/canvas-measure), the fidelity script and the hosted studio run, so the
// `pos` every transport writes agree (integrator merge 1c, docs/gslides-parity/build-2/b1.md
// request 1 and b2.md request R1). The same page also measures the height a block's text needs
// (`contentHeight`), what `block autofit --apply` reads.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Page } from 'playwright-core';

import { openSheetPage } from '@turboslide/headless/context';
import { fileUrl, writeTempDocument } from '@turboslide/headless/document';
import { launchBrowser } from '@turboslide/headless/launch';
import { measureCanvas, measureFit } from '@turboslide/headless/measure';
import { waitForReady } from '@turboslide/headless/ready';
import { renderDeck } from '@turboslide/render/deck';
import type { FitBox } from '@turboslide/render/measure-dom';
import type { CanvasBoxes } from '@turboslide/schema/canvas';
import type { Deck, Slide } from '@turboslide/schema/deck';

import type { MeasureCanvas, MeasureFit } from '../store-actions.ts';
import { slideHash, themeBundle } from './render.ts';

/** The render surface stamps this when fonts, images and dither canvases are in place (render/runtime.ts). */
const READY_SELECTOR = 'html[data-ts-ready="1"]';

type FitMeasure = Record<string, FitBox>;

async function measureSlideOnPage(
  page: Page,
  url: string,
  slideId: string,
  first: boolean,
): Promise<{ canvas: CanvasBoxes; fit: FitMeasure }> {
  const hash = slideHash(slideId);
  if (first) {
    await page.goto(`${url}#${hash}`, { waitUntil: 'load' });
  } else {
    await page.evaluate(
      `document.documentElement.removeAttribute('data-ts-ready'); location.hash = ${JSON.stringify(hash)};`,
    );
  }
  await page.waitForSelector(READY_SELECTOR, { state: 'attached', timeout: 15_000 });
  await waitForReady(page);
  const [canvas, fit] = await Promise.all([measureCanvas(page), measureFit(page)]);
  return { canvas, fit };
}

/**
 * How often the measurer launched a browser and how many slides it measured in this process: what
 * `canvas.test.ts` reads to assert that `slide to-canvas` with two ids opens one page (SPEC-2 0.104).
 */
export const headlessStats = { launches: 0, measured: 0 };

/**
 * Renders the named slides into one sheet document (light theme, prompts on, 1x) and measures
 * each on one page. The deck directory is the asset base so the kinds' pictures and figures
 * resolve; a picture that is missing on disk measures at its box all the same.
 */
export async function measureSlidesHeadless(
  dir: string,
  deck: Deck,
  allSlides: Record<string, Slide>,
  slides: ReadonlyArray<Slide>,
): Promise<Record<string, { canvas: CanvasBoxes; fit: FitMeasure }>> {
  const out: Record<string, { canvas: CanvasBoxes; fit: FitMeasure }> = {};
  if (slides.length === 0) return out;
  headlessStats.launches += 1;
  headlessStats.measured += slides.length;
  const wanted = slides.map((slide) => slide.id);
  const rendered = renderDeck(deck, Object.values(allSlides), {
    theme: 'light',
    bundle: themeBundle(),
    chrome: true,
    assetBase: fileUrl(dir, true),
    blockAttrs: true,
    gtWord: true,
    prompts: true,
    present: true,
    slideIds: wanted,
    title: `${deck.title} (canvas)`,
  });
  const tmp = await mkdtemp(join(tmpdir(), 'turboslide-canvas-'));
  try {
    const file = await writeTempDocument(rendered.html, 'canvas.html', tmp);
    const launched = await launchBrowser();
    try {
      const sheetPage = await openSheetPage(launched.browser, { theme: 'light', scale: 1 });
      try {
        let first = true;
        for (const id of wanted) {
          out[id] = await measureSlideOnPage(sheetPage.page, file.url, id, first);
          first = false;
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
  return out;
}

/** The `measureCanvas` dependency of the store actions over a deck directory (one page per call). */
export function headlessCanvasMeasurer(
  dir: string,
  slidesOf: () => Record<string, Slide>,
): MeasureCanvas {
  return async (deck, slides) => {
    const measured = await measureSlidesHeadless(dir, deck, slidesOf(), slides);
    const out: Record<string, CanvasBoxes> = {};
    for (const [id, entry] of Object.entries(measured)) out[id] = entry.canvas;
    return out;
  };
}

/** The `measureFit` dependency of block.autofit --apply over a deck directory. */
export function headlessFitMeasurer(
  dir: string,
  slidesOf: () => Record<string, Slide>,
): MeasureFit {
  return async (deck, slide) => {
    const measured = await measureSlidesHeadless(dir, deck, slidesOf(), [slide]);
    return measured[slide.id]?.fit ?? {};
  };
}
