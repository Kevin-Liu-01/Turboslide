// renderDeck: every slide with the frame in one document, the render surface the headless driver
// screenshots and the studio's server render reads (SPEC 5.2, 5.3). The document shows the slide
// named by the hash and stamps `data-ts-ready` when fonts, images and dither canvases are in place.
import { BLOCK_CSS } from './block-css.ts';
import { escapeText } from './html.ts';
import { RENDER_SURFACE_SCRIPT } from './runtime.ts';
import { renderSlide, slideMap, slideOrder } from './slide.ts';
import type { RenderOptions, RenderedSlide } from './slide.ts';
import { bandAssetResolver, counterText, frameBandOf, renderStage } from './stage.ts';
import type { SlideId } from '@turboslide/schema/ids';
import type { Deck, Slide } from '@turboslide/schema/deck';
import { deckCounter, deckCounterFormat } from '@turboslide/schema/deck';
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
  /**
   * The play list the counter counts over (`n / total`), in deck order: the unskipped slides for a
   * download or a slideshow, the whole deck for a render of the editor's slides (default).
   */
  numbering?: SlideId[];
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

/**
 * The counter text of one slide under the deck's counter mode (gslides-parity SPEC 7.2.4): `n /
 * total` over the play list, an empty string when the mode is off, when skip-title meets a title
 * slide, or when the slide is not in the play list (a skipped slide rendered for the editor).
 */
export function slideCounter(deck: Deck, slide: Slide, n: number, total: number): string {
  if (n < 1 || total < 1) return '';
  /* the slide's own word first (Slide numbers > Apply to selected, SPEC 7.2.4; docs/RETURN.md
     section 5 slides.numbers.apply): on numbers it under an off deck, off blanks it under an on one */
  if (slide.counter === 'off') return '';
  /* the kit's format (docs/PRODUCT.md 4.1 Slide numbers): `01 / 85`, `01` or `Slide 1` */
  const format = deckCounterFormat(deck);
  if (slide.counter === 'on') return counterText(n, total, format);
  const mode = deckCounter(deck);
  if (mode === 'off') return '';
  if (mode === 'skip-title' && slide.kind === 'title') return '';
  return counterText(n, total, format);
}

/**
 * Renders the slides of a deck in section order (SPEC 4.2: sections are the only place order
 * lives). `slideIds` selects; `numbering` is the play list the counter counts over (default the
 * deck order), so a download without skipped slides numbers what it holds.
 */
export function renderSlides(
  deck: Deck,
  slides: Slide[],
  options: RenderOptions,
  slideIds?: SlideId[],
  numbering?: SlideId[],
): RenderedDeck['slides'] {
  const byId = slideMap(slides);
  const order = slideOrder(deck);
  const play = numbering ?? order;
  const wanted = slideIds ? new Set(slideIds) : undefined;
  const out: RenderedDeck['slides'] = [];
  order.forEach((slideId, index) => {
    if (wanted && !wanted.has(slideId)) return;
    const slide = byId.get(slideId);
    const played = play.indexOf(slideId);
    const n = played >= 0 ? played + 1 : index + 1;
    if (!slide) {
      out.push({
        slideId,
        n,
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
      n,
      rendered: renderSlide(deck, slide, {
        ...options,
        counter: slideCounter(deck, slide, played >= 0 ? n : 0, play.length),
        active: false,
      }),
    });
  });
  return out;
}

export function renderDeck(deck: Deck, slides: Slide[], options: RenderDeckOptions): RenderedDeck {
  const { bundle, slideIds, numbering, title, present, extraCss, runtime, ...slideOptions } =
    options;
  const rendered = renderSlides(deck, slides, slideOptions, slideIds, numbering);
  const total = (numbering ?? slideOrder(deck)).length;
  const first = rendered[0];
  const firstSlide = first ? slides.find((slide) => slide.id === first.slideId) : undefined;
  const stage = renderStage(rendered.map((entry) => entry.rendered.html).join('\n'), {
    theme: options.theme,
    counter: firstSlide
      ? slideCounter(deck, firstSlide, first?.n ?? 1, total)
      : counterText(first?.n ?? 1, total, deckCounterFormat(deck)),
    sprite: bundle.sprite,
    present: present !== false,
    stageId: 'stage',
    /* the brand kit's frame band (docs/PRODUCT.md 4.1, 4.4): the footer logo, text and format */
    titleSlide: firstSlide?.kind === 'title',
    band: frameBandOf(
      deck,
      options.theme,
      bandAssetResolver(deck, (id, theme, path) =>
        slideOptions.assetSrc
          ? slideOptions.assetSrc(id, theme, path)
          : `${slideOptions.assetBase}${path}`,
      ),
    ),
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
