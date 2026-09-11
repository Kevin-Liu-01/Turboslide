// One page per theme (SPEC 5.3): a 1600 by 900 viewport, deviceScaleFactor 1, 2 or 3, reduced
// motion, the color scheme, the theme seeded in localStorage under the deck's two keys before any
// script runs (the viewer boots dark unless a theme is stored and never consults
// prefers-color-scheme, shoot-slide.mjs line 33), and the page and console error collectors of
// shoot-slide.mjs lines 35 and 36. Every sheet page a job opens comes from here, so the context
// and page deadlines and the single-process close guard apply to all of them: the export's 3x
// page for icons and marks was opened raw in packages/export until the hosted native export
// closed its context on chrome-headless-shell and crashed (docs/hosting-chromium.md section 3b).
import type { Browser, BrowserContext, Page } from 'playwright-core';

import type { RenderScale, RenderTheme } from './contracts.ts';
import { isSingleProcessBrowser, launchLog, withDeadline } from './launch.ts';

/** How long a browser context or page may take to open before the job fails with a reason. */
export const CONTEXT_TIMEOUT_MS = 60_000;

export const SHEET = { width: 1600, height: 900 } as const;

/**
 * The device scale factors a sheet page opens at: the render record scales (1 and 2, SPEC 4.2)
 * and 3, the export's raster scale for icons and marks (SPEC 8.6). The page types are generic
 * over the scale so a RenderRecord consumer (record.ts) keeps `1 | 2` and the export's 3x page
 * reports 3.
 */
export type SheetScale = RenderScale | 3;

export type SheetPageOptions<S extends SheetScale = RenderScale> = {
  theme: RenderTheme;
  /** Default 1. */
  scale?: S;
  viewport?: { width: number; height: number };
};

export type SheetPage<S extends SheetScale = RenderScale> = {
  context: BrowserContext;
  page: Page;
  theme: RenderTheme;
  scale: S;
  /** Errors since the last takeErrors(). */
  takeErrors: () => { pageErrors: string[]; consoleErrors: string[] };
  close: () => Promise<void>;
};

export async function openSheetPage<S extends SheetScale = RenderScale>(
  browser: Browser,
  options: SheetPageOptions<S>,
): Promise<SheetPage<S>> {
  // 1 when omitted; S is then the default type parameter, the record scales, which admit 1
  const scale = (options.scale ?? 1) as S;
  // bounded: a browser that stops answering the protocol would otherwise hold the job forever
  // (measured on the hosted previews; launch.ts records the cause)
  const context = await withDeadline(
    browser.newContext({
      viewport: options.viewport ?? { width: SHEET.width, height: SHEET.height },
      deviceScaleFactor: scale,
      colorScheme: options.theme,
      reducedMotion: 'reduce',
    }),
    CONTEXT_TIMEOUT_MS,
    'sheet context',
  );
  launchLog(`sheet context ${options.theme} at ${scale}x`);
  await context.addInitScript((theme: string) => {
    try {
      localStorage.setItem('gt-theme', theme);
      localStorage.setItem('gt-deck-theme', theme);
    } catch {
      // storage unavailable on file URLs in some configurations; the document stamps the theme itself
    }
  }, options.theme);
  const page = await withDeadline(context.newPage(), CONTEXT_TIMEOUT_MS, 'sheet page');
  launchLog('sheet page open');
  let pageErrors: string[] = [];
  let consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    // the resource a load error names travels with the text (a bare "Failed to load resource:
    // net::ERR_FAILED" from the hosted browser said nothing about which one)
    const url = message.location().url;
    consoleErrors.push(
      url && !message.text().includes(url) ? `${message.text()} (${url})` : message.text(),
    );
  });
  return {
    context,
    page,
    theme: options.theme,
    scale,
    takeErrors() {
      const out = { pageErrors, consoleErrors };
      pageErrors = [];
      consoleErrors = [];
      return out;
    },
    // the single-process serverless shell crashes when a context is closed (launch.ts records the
    // core files that left), so its contexts stay open until the browser is killed; elsewhere a
    // close error after the records are written is not a render failure
    close: () =>
      isSingleProcessBrowser(browser) ? Promise.resolve() : context.close().catch(() => undefined),
  };
}
