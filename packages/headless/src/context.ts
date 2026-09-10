// One page per theme (SPEC 5.3): a 1600 by 900 viewport, deviceScaleFactor 1 or 2, reduced
// motion, the color scheme, the theme seeded in localStorage under the deck's two keys before any
// script runs (the viewer boots dark unless a theme is stored and never consults
// prefers-color-scheme, shoot-slide.mjs line 33), and the page and console error collectors of
// shoot-slide.mjs lines 35 and 36.
import type { Browser, BrowserContext, Page } from 'playwright-core';

import type { RenderScale, RenderTheme } from './contracts.ts';

export const SHEET = { width: 1600, height: 900 } as const;

export type SheetPageOptions = {
  theme: RenderTheme;
  scale?: RenderScale;
  viewport?: { width: number; height: number };
};

export type SheetPage = {
  context: BrowserContext;
  page: Page;
  theme: RenderTheme;
  scale: RenderScale;
  /** Errors since the last takeErrors(). */
  takeErrors: () => { pageErrors: string[]; consoleErrors: string[] };
  close: () => Promise<void>;
};

export async function openSheetPage(
  browser: Browser,
  options: SheetPageOptions,
): Promise<SheetPage> {
  const scale = options.scale ?? 1;
  const context = await browser.newContext({
    viewport: options.viewport ?? { width: SHEET.width, height: SHEET.height },
    deviceScaleFactor: scale,
    colorScheme: options.theme,
    reducedMotion: 'reduce',
  });
  await context.addInitScript((theme: string) => {
    try {
      localStorage.setItem('gt-theme', theme);
      localStorage.setItem('gt-deck-theme', theme);
    } catch {
      // storage unavailable on file URLs in some configurations; the document stamps the theme itself
    }
  }, options.theme);
  const page = await context.newPage();
  let pageErrors: string[] = [];
  let consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
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
    close: () => context.close(),
  };
}
