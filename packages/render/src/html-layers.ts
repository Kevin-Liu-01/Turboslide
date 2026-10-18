// HTML and CSS under the hood of a slide (docs/html-layers.md; Kevin, 2026-10-18: "shared slide
// html/css + per slide html and css"). A slide already renders as HTML; the deck's HtmlLayer
// (`deck.html`) and the slide's own (`slide.html`) add to that render:
//
// - the CSS of both, the deck's first, through the CSS tokenizer (sanitize/css.ts) and scoped to
//   this slide's root, `[data-slide="<id>"]` (sanitize/scope.ts), in one `<style>` inside the
//   slide, the way the brand kit's stylesheet rides inside every slide (slide.ts kitStyle). Each
//   rendered slide styles itself alone, the editor's filmstrip clones included;
// - the markup of each, sanitized as an html block's markup is (sanitize/html.ts), in a layer the
//   size of the sheet under the slide's own blocks or over them (`layer`). The layer never takes a
//   pointer, so the editor's selection and the show's clicks reach the slide as before, and it is
//   a raster the exporter screenshots (an Editable text PPTX places it as a picture).
//
// A surface that passes `htmlLayerFrame` (the studio's view, show, embed and print payloads,
// apps/studio/src/server/decks.ts) gets each markup layer as the sandboxed frame of an html block
// instead (sanitize/frame.ts): an opaque origin with scripts off and the frame's CSP. A surface
// that passes `htmlLayersOff` (the deck's html policy is off) draws neither. A slide of a deck
// with no HtmlLayer renders byte for byte as before.
import type { Deck, HtmlLayer, Slide } from '@turboslide/schema/deck';
import type { BlockContext, HtmlFrameSource } from './blocks/context.ts';
import { raster } from './blocks/context.ts';
import { el } from './html.ts';
import { sanitizeCss } from './sanitize/css.ts';
import { inPage, purifierNow, sanitizeMarkup } from './sanitize/html.ts';
import { resolveEscapeImages, scopeCss } from './sanitize/scope.ts';
import { safeStyleText } from '@turboslide/schema/style-text';

/** The class of a markup layer's root; `is-under` or `is-over` names its place (block-css.ts). */
export const HTML_LAYER_CLASS = 'slide-html';

/** What the frame builder receives for one markup layer (sanitize/frame.ts htmlLayerFrameFor). */
export type HtmlLayerFrameInput = {
  slideId: string;
  /** which layer: the deck's shared one or the slide's own */
  from: 'deck' | 'slide';
  /** the layer's raw markup; the builder sanitizes it */
  markup: string;
  /** the deck's then the slide's raw CSS; the builder tokenizes and scopes it */
  css: string;
};

export type HtmlLayerOptions = {
  htmlLayerFrame?: (layer: HtmlLayerFrameInput) => HtmlFrameSource | undefined;
  htmlLayersOff?: boolean;
};

/** A slide's HtmlLayer output: the `<style>`, and the layers under and over its blocks. */
export type RenderedHtmlLayers = { css: string; under: string; over: string };

const NONE: RenderedHtmlLayers = { css: '', under: '', over: '' };

/** The selector every rule of a slide's HtmlLayer CSS is scoped under (scope.ts scopeCss). */
export function htmlLayerScope(slideId: string): string {
  return `[data-slide="${slideId.replace(/["\\]/g, '')}"]`;
}

/** The deck's then the slide's CSS, raw, joined; empty when neither has any. */
export function htmlLayerCss(deck: Deck, slide: Slide): string {
  return [deck.html?.css, slide.html?.css]
    .filter((css) => css !== undefined && css !== '')
    .join('\n');
}

/** True when the deck or the slide carries an HtmlLayer with something to draw. */
export function hasHtmlLayer(deck: Deck, slide: Slide): boolean {
  const drawn = (layer: HtmlLayer | undefined): boolean =>
    layer !== undefined && ((layer.css ?? '') !== '' || (layer.markup ?? '') !== '');
  return drawn(deck.html) || drawn(slide.html);
}

export function renderHtmlLayers(
  deck: Deck,
  slide: Slide,
  options: HtmlLayerOptions,
  ctx: BlockContext,
): RenderedHtmlLayers {
  if (options.htmlLayersOff === true || !hasHtmlLayer(deck, slide)) return NONE;
  const rawCss = htmlLayerCss(deck, slide);
  const scoped = rawCss === '' ? '' : scopeCss(sanitizeCss(rawCss).css, htmlLayerScope(slide.id));
  const out: RenderedHtmlLayers = {
    css: scoped === '' ? '' : `<style>${safeStyleText(scoped)}</style>`,
    under: '',
    over: '',
  };
  const layers: ['deck' | 'slide', HtmlLayer | undefined][] = [
    ['deck', deck.html],
    ['slide', slide.html],
  ];
  for (const [from, layer] of layers) {
    const markup = layer?.markup ?? '';
    if (layer === undefined || markup === '') continue;
    const drawn = markupLayer(from, layer, markup, rawCss, options, ctx);
    if (drawn === '') continue;
    if ((layer.layer ?? 'under') === 'over') out.over += drawn;
    else out.under += drawn;
  }
  return out;
}

/** One markup layer: in the sandboxed frame when the surface passes one, else inline and sanitized. */
function markupLayer(
  from: 'deck' | 'slide',
  layer: HtmlLayer,
  markup: string,
  rawCss: string,
  options: HtmlLayerOptions,
  ctx: BlockContext,
): string {
  const place = layer.layer ?? 'under';
  const rasterAttrs = raster(ctx, `html-${from}`, 'html', true);
  const root = {
    class: `${HTML_LAYER_CLASS} is-${place}`,
    'data-html-layer': from,
    ...rasterAttrs,
  };
  if (options.htmlLayerFrame !== undefined) {
    const source = options.htmlLayerFrame({ slideId: ctx.slideId, from, markup, css: rawCss });
    if (source === undefined) return '';
    const frame = el(
      'iframe',
      {
        class: 'ts-x-frame',
        sandbox: '',
        srcdoc: source.srcdoc,
        title: source.title ?? (from === 'deck' ? 'Shared slide HTML' : 'Slide HTML'),
        loading: 'eager',
        referrerpolicy: 'no-referrer',
      },
      '',
    );
    return el('div', { ...root, class: `${root.class} ts-x-host` }, frame);
  }
  // a page that has not loaded the parser yet draws no markup rather than the regular
  // expression pass alone, as the html block draws its plate then (html-escape.ts); the editor
  // loads the parser when the deck carries a layer and renders again
  const purifier = purifierNow();
  if (purifier === null && inPage()) return '';
  const clean = sanitizeMarkup(markup, purifier);
  return el('div', root, resolveEscapeImages(clean.html, ctx));
}
