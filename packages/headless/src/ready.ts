// The readiness signal that replaces the deck's fixed 220 ms settle (SPEC 5.3, the rasters row;
// slides report section 2.2: the settle was two thirds of the per-slide cost): document.fonts
// loaded for every face the slide uses, every visible image decoded, the dither canvases drawn,
// material anchors present, then two animation frames. The steps themselves are
// `awaitSheetReady` of @turboslide/render/measure-dom (gslides-parity SPEC-2 1.3, 0.97), the one
// function the editor's canvas measurer and this page run before they measure, so both reach
// the same readiness; `waitForReady` evaluates its source and keeps the ReadyInfo reporting
// (the faces, the missing Inter combinations, the broken images, how the frames ended) around
// it. The dither draw at the PDF's full cell size stays here (drawDitherCanvases), which the
// shared function leaves alone once a canvas carries `data-drawn`.
//
// Every function handed to page.evaluate is self-contained: Playwright serializes its source, so
// nothing from module scope may be referenced inside.
import type { Page } from 'playwright-core';

import { awaitSheetReady } from '@turboslide/render/measure-dom';

export type ReadyInfo = {
  readyMs: number;
  fonts: { status: 'loaded' | 'partial'; faces: string[] };
  /** src of every visible image that failed to decode. */
  brokenImages: string[];
  imageCount: number;
  /** how the two-frame settle ended: the frames fired, or the wait fell back to the timer */
  frames: 'raf' | 'timeout';
};

export type ReadyOptions = {
  /** The element whose text nodes decide which faces to load; default the active slide, else body. */
  rootSelector?: string;
  timeoutMs?: number;
};

const DEFAULT_ROOT = '.slide.is-on, [data-slide], .slide, .ts-sheet, body';

export async function waitForReady(page: Page, options: ReadyOptions = {}): Promise<ReadyInfo> {
  const selector = options.rootSelector ?? DEFAULT_ROOT;
  const timeout = options.timeoutMs ?? 10_000;
  return page.evaluate(
    `(async (rootSelector, timeoutMs, ready) => {
      const t0 = performance.now();
      // the selector list is tried in order; a comma list would match body first in document order
      let root = document.body;
      for (const sel of rootSelector.split(',')) {
        const el = document.querySelector(sel.trim());
        if (el) {
          root = el;
          break;
        }
      }
      const withTimeout = (p, fallback) =>
        Promise.race([p, new Promise((r) => setTimeout(() => r(fallback), timeoutMs))]);
      // the shared steps: fonts, every face the root uses, the images, the dither canvases, two
      // frames; bounded here as well so a page whose compositor produces no frames (measured in
      // the hosted chrome-headless-shell: every render hung to the job's 300 s timeout) answers
      const frames = await withTimeout(ready(root, timeoutMs).then(() => 'raf'), 'timeout');
      // Every (weight, size, family) combination the slide's text uses: document.fonts.ready
      // resolves before a lazily used face loads (pptx report section 4.4 note 4); after the
      // shared load the answer names the Inter combinations no face served.
      const combos = new Set();
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (!(node.textContent || '').trim()) continue;
        const el = node.parentElement;
        if (!el) continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const family = (cs.fontFamily.split(',')[0] || '').trim().replace(/^['"]|['"]$/g, '');
        if (!family) continue;
        const style = cs.fontStyle === 'italic' || cs.fontStyle.indexOf('oblique') === 0 ? 'italic ' : '';
        combos.add(style + cs.fontWeight + ' ' + cs.fontSize + ' ' + family);
      }
      const missing = [];
      await Promise.all(
        [...combos].map(async (spec) => {
          const family = spec.replace(/^italic /, '').split(' ').slice(2).join(' ');
          try {
            const faces = await withTimeout(document.fonts.load(spec), []);
            if (faces.length === 0 && /^inter$/i.test(family)) missing.push(spec);
          } catch (e) {
            if (/^inter$/i.test(family)) missing.push(spec);
          }
        }),
      );
      const images = [...root.querySelectorAll('img')].filter((img) => {
        const r = img.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      const brokenImages = images
        .filter((img) => img.complete && img.naturalWidth === 0)
        .map((img) => img.getAttribute('src') || img.currentSrc);
      const faces = [...document.fonts]
        .filter((face) => face.status === 'loaded')
        .map((face) => face.family.replace(/^['"]|['"]$/g, '') + ' ' + face.weight + ' ' + face.style);
      for (const spec of missing) faces.push('fallback:' + spec);
      return {
        readyMs: Math.round(performance.now() - t0),
        fonts: { status: missing.length ? 'partial' : 'loaded', faces },
        brokenImages,
        imageCount: images.length,
        frames,
      };
    })(${JSON.stringify(selector)}, ${timeout}, ${awaitSheetReady.toString()})`,
  ) as Promise<ReadyInfo>;
}

export type DitherDrawOptions = {
  /** The 64-entry Bayer table, row major, from @turboslide/effects/bayer BAYER8. */
  table: readonly number[];
  theme: 'light' | 'dark';
  selector?: string;
  /**
   * `half` (default) draws one cell per canvas pixel at half the CSS size, the deck's pixelated
   * look; `full` draws every cell as a 2 by 2 block at the CSS size, so a printer that
   * interpolates the canvas bitmap (a PDF viewer, gslides-parity SPEC 7.6) shows the same cells.
   */
  cells?: 'half' | 'full';
};

/**
 * Draw every dither canvas as the deck's drawDither does (tail.html lines 104 to 114): one cell
 * per canvas pixel at half CSS size, ink where bayer8(y, x) / 64 < 1 - x / W on a paper ground;
 * the CSS upscales with image-rendering: pixelated. Returns the number of canvases drawn.
 */
export async function drawDitherCanvases(page: Page, options: DitherDrawOptions): Promise<number> {
  return page.evaluate(
    ({ table, theme, selector, full }) => {
      const canvases = [...document.querySelectorAll<HTMLCanvasElement>(selector)];
      for (const canvas of canvases) {
        const cw = canvas.clientWidth;
        const ch = canvas.clientHeight;
        let W = Math.max(8, Math.round(cw / 2));
        let H = Math.max(8, Math.round(ch / 2));
        if (!cw) {
          W = 505;
          H = 110;
        }
        // one cell per canvas pixel at half size, or a 2 by 2 block per cell at the CSS size
        const k = full ? 2 : 1;
        canvas.width = W * k;
        canvas.height = H * k;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        const dark = theme === 'dark';
        ctx.fillStyle = dark ? '#070707' : '#ffffff';
        ctx.fillRect(0, 0, W * k, H * k);
        ctx.fillStyle = dark ? '#f2f2f0' : '#070707';
        for (let y = 0; y < H; y += 1) {
          for (let x = 0; x < W; x += 1) {
            if ((table[(y % 8) * 8 + (x % 8)] ?? 0) / 64 < 1 - x / W)
              ctx.fillRect(x * k, y * k, k, k);
          }
        }
        canvas.dataset.drawn = '1';
      }
      return canvases.length;
    },
    {
      table: [...options.table],
      theme: options.theme,
      selector: options.selector ?? 'canvas.dither',
      full: options.cells === 'full',
    },
  );
}
