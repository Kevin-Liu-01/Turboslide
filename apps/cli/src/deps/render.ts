// Rendering boundary (SPEC 5.2): renderDeck gives the render surface of a theme (every slide with
// the frame in one document, the counter, the sprite, the theme CSS and fonts inlined, and the
// runtime that shows the slide named by the hash, draws the dither canvases and stamps
// data-ts-ready), and renderStandalone gives the single-file viewer. The theme bundle comes from
// @turboslide/render/theme-node, which reads the theme and font packages once per run.
import { renderDeck } from '@turboslide/render/deck';
import type { RenderedDeck, ThemeBundle } from '@turboslide/render/deck';
import { renderStandalone } from '@turboslide/render/standalone';
import type { StandaloneResult } from '@turboslide/render/standalone';
import { loadThemeBundle } from '@turboslide/render/theme-node';

import type { LoadedDeck } from '../deck-files.ts';

export type { ThemeBundle };

let cachedBundle: ThemeBundle | undefined;

/** The theme bundle, read once per process (sheet.css, stage.css, the sprite, Inter inlined). */
export function themeBundle(): ThemeBundle {
  cachedBundle ??= loadThemeBundle();
  return cachedBundle;
}

export type ThemeDocument = {
  /** A complete HTML document with every slide; `#s/<slideId>` shows one in present mode. */
  html: string;
  slides: RenderedDeck['slides'];
  warnings: string[];
};

/** The hash that shows a slide in the render surface (render/runtime.ts). */
export function slideHash(slideId: string): string {
  return `s/${encodeURIComponent(slideId)}`;
}

/** The render surface of one theme (SPEC 5.3, the rasters row). */
export function renderThemeDocument(
  loaded: LoadedDeck,
  theme: 'light' | 'dark',
  assetBase: string,
): ThemeDocument {
  const rendered = renderDeck(loaded.deck, Object.values(loaded.slides), {
    theme,
    bundle: themeBundle(),
    chrome: true,
    assetBase,
    blockAttrs: true,
    gtWord: true,
    present: true,
    title: `${loaded.deck.title} (${theme})`,
  });
  return { html: rendered.html, slides: rendered.slides, warnings: rendered.warnings };
}

/** The standalone file (SPEC 5.2 renderStandalone: build-deck.mjs as a function). */
export function renderStandaloneFile(
  loaded: LoadedDeck,
  assetUris: Record<string, string>,
  options: { budgetMB: number; title?: string },
): StandaloneResult {
  return renderStandalone(loaded.deck, Object.values(loaded.slides), {
    bundle: themeBundle(),
    assetUris,
    budgetMB: options.budgetMB,
    title: options.title,
  });
}
