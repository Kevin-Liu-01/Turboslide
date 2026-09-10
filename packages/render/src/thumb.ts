// renderThumb: the slide without chrome and chips, inside the deck's `.mini` clone wrapper so the
// thumbnail and book frames scale it by `--k` (SPEC 5.2, 5.5; tail:122-130, head:220, head:292).
import { renderSlide } from './slide.ts';
import type { RenderOptions, RenderedSlide } from './slide.ts';
import { FRAME_HTML } from './stage.ts';
import type { Deck, Slide } from '@turboslide/schema/deck';
import type { Theme } from '@turboslide/schema/render';

export type ThumbOptions = Partial<Omit<RenderOptions, 'theme' | 'chrome' | 'counter'>> & {
  /** `--k` written inline; the viewer recomputes it from the frame width (tail:154-156). */
  k?: number;
};

export function renderThumb(
  deck: Deck,
  slide: Slide,
  theme: Theme,
  options: ThumbOptions = {},
): RenderedSlide {
  const { k, ...rest } = options;
  const rendered = renderSlide(deck, slide, {
    theme,
    chrome: false,
    assetBase: rest.assetBase ?? '',
    assetSrc: rest.assetSrc,
    blockAttrs: rest.blockAttrs ?? false,
    gtWord: rest.gtWord ?? true,
    live: false,
    active: true,
  });
  const style = k !== undefined ? ` style="--k:${k}"` : '';
  return {
    ...rendered,
    html: `<div class="mini"${style}>${FRAME_HTML}${rendered.html}</div>`,
  };
}
