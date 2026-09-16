// renderThumb: the slide without chrome and chips, inside the deck's `.mini` clone wrapper so the
// thumbnail and book frames scale it by `--k` (SPEC 5.2, 5.5; tail:122-130, head:220, head:292).
import { renderSlide } from './slide.ts';
import type { RenderOptions, RenderedSlide } from './slide.ts';
import type { Deck, Slide } from '@turboslide/schema/deck';
import type { Theme } from '@turboslide/schema/render';
// the frame per theme (gslides-parity SPEC-5 9.3; B6's seam at merge 1): today's GT frame for
// both ids, byte identical to stage.ts FRAME_HTML (theme-css.test.ts pins the two together)
import { stageFrame } from '@turboslide/theme/themes';

export type ThumbOptions = Partial<Omit<RenderOptions, 'theme' | 'chrome' | 'counter'>> & {
  /** `--k` written inline; the viewer recomputes it from the frame width (tail:154-156). */
  k?: number;
};

/**
 * A thumbnail never draws a prompt (an empty Text is nothing outside the editor, gslides-parity
 * SPEC 5.4) unless the caller asks with `prompts: true`, which the layout grid does for its 21
 * tiles (SPEC 5.2).
 */
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
    ...(rest.prompts === true ? { prompts: true } : {}),
    active: true,
  });
  const style = k !== undefined ? ` style="--k:${k}"` : '';
  return {
    ...rendered,
    html: `<div class="mini"${style}>${stageFrame(deck.theme)}${rendered.html}</div>`,
  };
}
