// renderPrintDocument: the deck as one page per slide for print and PDF (gslides-parity SPEC 6.8,
// 7.6). Every page is a 960 by 540 pt box (PowerPoint's 13.333 by 7.5 in page, `@page` with no
// margin) holding one stage of the sheet, the frame, the wordmark and the counter at the sheet's
// own 1600 by 900 px, which the printer scales by PRINT_SCALE onto the page so the vector text and
// the pictures fill it edge to edge. The
// play list is the deck without its skipped slides unless asked; notes never travel (SPEC 7.6);
// the appearance is the deck's `defaults.appearance` unless the caller names one. The sprite is
// written once, in the first stage: `<use href="#i-...">` resolves anywhere in the document. No
// runtime: the headless driver draws the dither canvases and waits for the fonts before
// `page.pdf`, and a browser's print dialog does the same through the sheet's own CSS.
import { BLOCK_CSS } from './block-css.ts';
import { renderSlides, slideCounter } from './deck.ts';
import type { RenderedDeck, ThemeBundle } from './deck.ts';
import { escapeText } from './html.ts';
import { renderStage } from './stage.ts';
import { slideOrder } from './slide.ts';
import type { RenderOptions } from './slide.ts';
import type { AssetId, SlideId } from '@turboslide/schema/ids';
import type { Deck, Slide } from '@turboslide/schema/deck';
import { deckAppearance, unskippedSlideOrder } from '@turboslide/schema/deck';
import type { Theme } from '@turboslide/schema/render';

/** PowerPoint's page in points: 13.333333 in by 7.5 in (packages/export units.ts PAGE_IN). */
export const PRINT_PAGE_PT = { width: 960, height: 540 } as const;

/**
 * The print scale that puts the sheet's 1600 px onto the page's 1280 CSS px (960 pt at 96 px per
 * in). The document lays every page out at the sheet's own 1600 by 900 px and the printer scales
 * the finished page by 0.8 (`page.pdf({ scale })` in the headless package; a browser's print
 * dialog shrinks to fit the same way): Chromium snaps hairlines to whole CSS pixels before it
 * scales, so a CSS zoom or transform of 0.8 landed every rule half a raster pixel off and a pixel
 * wide (measured on the fixture deck: 0.27 to 0.63 percent per page against the 2x render),
 * while the print scale keeps them exact (0.000 to 0.017 percent).
 */
export const PRINT_SCALE = 0.8;

/** The page box in CSS px: the sheet's own size; the print scale brings it to PRINT_PAGE_PT. */
export const PRINT_PAGE_PX = { width: 1600, height: 900 } as const;

/**
 * The print stylesheet: the page size, one sheet per page, no sheet edge or mat. `contain: strict`
 * on the page box is load bearing: without it Chromium's print fragmentation dropped whole blocks
 * from any page that had a page after it (measured on the GT deck: the swatches of `color` and the
 * twelve tile pictures of `engines` were absent from the PDF while the same slide printed alone
 * was complete); a page box with size, layout and paint containment prints whole.
 */
export const PRINT_CSS = `
@page { size: ${PRINT_PAGE_PT.width}pt ${PRINT_PAGE_PT.height}pt; margin: 0; }
html, body { margin: 0; padding: 0; background: #ffffff; }
body.ts-print { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.ts-page { position: relative; width: ${PRINT_PAGE_PX.width}px; height: ${PRINT_PAGE_PX.height}px; overflow: hidden; contain: strict; page-break-after: always; break-after: page; background: var(--paper); }
.ts-page:last-child { page-break-after: auto; break-after: auto; }
.ts-page > .ts-sheet { position: absolute; left: 0; top: 0; width: 1600px; height: 900px; border: 0; box-shadow: none; overflow: hidden; }
.ts-page .slide.is-on { animation: none; }
`;

export type PrintDocumentOptions = {
  theme?: Theme;
  bundle: ThemeBundle;
  /** Only these slides, in deck order; default the play list. */
  slideIds?: SlideId[];
  /** Carry the skipped slides too; left out by default (SPEC 7.2.1). */
  includeSkipped?: boolean;
  /** Prefix for asset twin paths; ignored when `assetSrc` is given. */
  assetBase: string;
  assetSrc?: RenderOptions['assetSrc'];
  gtWord?: boolean;
  title?: string;
  /** Extra CSS appended after the print stylesheet. */
  extraCss?: string;
};

export type PrintDocument = {
  html: string;
  theme: Theme;
  /** The pages in order: one per rendered slide. */
  slides: RenderedDeck['slides'];
  pages: number;
  /** Slides left out because they are skipped (SPEC 7.2.1). */
  omitted: SlideId[];
  warnings: string[];
};

export function renderPrintDocument(
  deck: Deck,
  slides: Slide[],
  options: PrintDocumentOptions,
): PrintDocument {
  const theme = options.theme ?? deckAppearance(deck);
  const byId = new Map(slides.map((slide) => [slide.id, slide]));
  const play =
    options.includeSkipped === true
      ? slideOrder(deck)
      : unskippedSlideOrder({ deck, slides: Object.fromEntries(byId) });
  const omitted = slideOrder(deck).filter((id) => !play.includes(id));
  const wanted = options.slideIds ? play.filter((id) => options.slideIds?.includes(id)) : play;
  const rendered = renderSlides(
    deck,
    slides,
    {
      theme,
      chrome: true,
      assetBase: options.assetBase,
      assetSrc: options.assetSrc,
      blockAttrs: true,
      gtWord: options.gtWord ?? true,
    },
    wanted,
    play,
  ).map((entry) => ({
    ...entry,
    // one visible slide per page: the section carries is-on on its own stage
    rendered: {
      ...entry.rendered,
      html: entry.rendered.html.replace(/^<section class="slide/, '<section class="slide is-on'),
    },
  }));
  const pages = rendered.map((entry, index) => {
    const slide = byId.get(entry.slideId);
    const stage = renderStage(entry.rendered.html, {
      theme,
      counter: slide ? slideCounter(deck, slide, entry.n, play.length) : undefined,
      sprite: index === 0 ? options.bundle.sprite : undefined,
      present: true,
    });
    return `<div class="ts-page" data-page="${index + 1}" data-slide="${escapeText(entry.slideId)}">${stage}</div>`;
  });
  const title = options.title ?? deck.title;
  const head =
    `<meta charset="utf-8"><meta name="viewport" content="width=1600,initial-scale=1">` +
    `<title>${escapeText(title)}</title><meta name="robots" content="noindex">` +
    `<style>${options.bundle.fontsCss}</style><style>${options.bundle.sheetCss}</style><style>${options.bundle.stageCss}</style>` +
    `<style>${BLOCK_CSS}</style><style>${PRINT_CSS}</style>${options.extraCss ? `<style>${options.extraCss}</style>` : ''}`;
  const html =
    `<!doctype html><html lang="en" data-theme="${theme}"><head>${head}</head>` +
    `<body class="ts-print">${pages.join('\n')}</body></html>\n`;
  return {
    html,
    theme,
    slides: rendered,
    pages: rendered.length,
    omitted,
    warnings: rendered.flatMap((entry) => entry.rendered.warnings),
  };
}

/** The asset ids a print document references, for a caller that inlines twins. */
export function printAssetIds(deck: Deck): AssetId[] {
  return Object.keys(deck.assets);
}
