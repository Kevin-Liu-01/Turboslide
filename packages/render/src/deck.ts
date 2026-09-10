// renderDeck: every slide with the frame in one document, the render surface the headless driver
// screenshots and the studio's server render reads (SPEC 5.2, 5.3). The document shows the slide
// named by the hash and stamps `data-ts-ready` when fonts, images and dither canvases are in place.
import { BLOCK_CSS } from './block-css.ts';
import { escapeText } from './html.ts';
import { RENDER_SURFACE_SCRIPT } from './runtime.ts';
import { renderSlide, slideMap, slideOrder } from './slide.ts';
import type { RenderOptions, RenderedSlide } from './slide.ts';
import { counterText, renderStage } from './stage.ts';
import type { SlideId } from '@turboslide/schema/ids';
import type { Deck, Slide } from '@turboslide/schema/deck';
import type { Theme } from '@turboslide/schema/render';

/**
 * What a document needs from the theme and the fonts. The CLI and the headless driver load these
 * from @turboslide/theme and @turboslide/fonts (theme-node.ts does it for Node); the studio serves
 * them as stylesheets and passes empty strings here.
 */
export type ThemeBundle = {
  /** sheet.css: head:11-176 under `.ts-sheet` (SPEC 5.1). */
  sheetCss: string;
  /** stage.css: the `.sheet`, `.stage`, `.slide` and `.backdrop` rules of head:249-258. */
  stageCss: string;
  /** The sprite: 63 Heroicons and gt-mark (head:398-462). */
  sprite: string;
  /** The @font-face CSS, with the woff2 inlined or referenced. */
  fontsCss: string;
};

export type RenderDeckOptions = Omit<RenderOptions, 'counter' | 'active'> & {
  theme: Theme;
  bundle: ThemeBundle;
  /** Only these slides, in deck order; default every slide. */
  slideIds?: SlideId[];
  /** The document title. */
  title?: string;
  /** Present mode: the sheet fills the viewport with no edge (default true). */
  present?: boolean;
  /** Extra CSS appended after the block CSS. */
  extraCss?: string;
  /** Replace the inline runtime (the headless driver may inject its own readiness signal). */
  runtime?: string;
};

export type RenderedDeck = {
  html: string;
  slides: { slideId: SlideId; n: number; rendered: RenderedSlide }[];
  warnings: string[];
};

/** Renders the slides of a deck in section order (SPEC 4.2: sections are the only place order lives). */
export function renderSlides(
  deck: Deck,
  slides: Slide[],
  options: RenderOptions,
  slideIds?: SlideId[],
): RenderedDeck['slides'] {
  const byId = slideMap(slides);
  const order = slideOrder(deck);
  const wanted = slideIds ? new Set(slideIds) : undefined;
  const out: RenderedDeck['slides'] = [];
  order.forEach((slideId, index) => {
    if (wanted && !wanted.has(slideId)) return;
    const slide = byId.get(slideId);
    if (!slide) {
      out.push({
        slideId,
        n: index + 1,
        rendered: {
          html: '',
          slots: {},
          rasters: [],
          warnings: [`${slideId}: listed in deck.json but no slide file`],
        },
      });
      return;
    }
    out.push({
      slideId,
      n: index + 1,
      rendered: renderSlide(deck, slide, {
        ...options,
        counter: counterText(index + 1, order.length),
        active: false,
      }),
    });
  });
  return out;
}

export function renderDeck(deck: Deck, slides: Slide[], options: RenderDeckOptions): RenderedDeck {
  const { bundle, slideIds, title, present, extraCss, runtime, ...slideOptions } = options;
  const rendered = renderSlides(deck, slides, slideOptions, slideIds);
  const total = slideOrder(deck).length;
  const stage = renderStage(rendered.map((entry) => entry.rendered.html).join('\n'), {
    theme: options.theme,
    counter: counterText(rendered[0]?.n ?? 1, total),
    sprite: bundle.sprite,
    present: present !== false,
    stageId: 'stage',
  });
  const head =
    `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${escapeText(title ?? deck.title)}</title>` +
    `<style>${bundle.fontsCss}</style><style>${bundle.sheetCss}</style><style>${bundle.stageCss}</style>` +
    `<style>${BLOCK_CSS}</style>${extraCss ? `<style>${extraCss}</style>` : ''}`;
  const html =
    `<!doctype html><html lang="en" data-theme="${options.theme}"><head>${head}</head>` +
    `<body class="ts-render-surface">${stage}<script>${runtime ?? RENDER_SURFACE_SCRIPT}</script></body></html>\n`;
  return {
    html,
    slides: rendered,
    warnings: rendered.flatMap((entry) => entry.rendered.warnings),
  };
}
