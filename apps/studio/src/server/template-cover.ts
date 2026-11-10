import { htmlFrameFor } from '@turboslide/render/blocks/html-escape';
import { renderSlide } from '@turboslide/render/slide';
import type { Appearance, Deck, Slide } from '@turboslide/schema/deck';

/** A transparent pixel: a cover's pictures load as empty plates instead of broken image glyphs. */
const EMPTY_PIXEL =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/**
 * A template's cover slide as the HTML of a live clone on the gallery (templates.ts
 * `listTemplateGalleryFn`). A template is anyone's deck drawn on a page everyone opens: whoever
 * may copy a deck can save it as a template. So the cover gets the policy a shared deck's visitor
 * gets (SPEC-3 8.4; decks.ts `shapeByRole`): an `html` block draws as its note in the sandboxed
 * frame, never as its markup, and no HtmlLayer is drawn, neither its CSS nor its markup
 * (docs/html-layers.md 5). Before this the block went through the scoped escape, which runs the
 * parser only when this instance has loaded it and the regular expressions otherwise.
 */
export function templateCoverHtml(deck: Deck, slide: Slide, appearance: Appearance): string {
  return renderSlide(deck, slide, {
    theme: appearance,
    chrome: false,
    assetBase: '',
    assetSrc: () => EMPTY_PIXEL,
    blockAttrs: false,
    gtWord: false,
    prompts: true,
    htmlFrame: htmlFrameFor({
      theme: appearance,
      assetUrl: () => EMPTY_PIXEL,
      policy: 'note',
    }),
    htmlLayersOff: true,
  }).html;
}
