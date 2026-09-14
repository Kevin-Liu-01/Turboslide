// The `html` escape block (SPEC 1, 5.2, 11; gslides-parity SPEC-3 0.27, 8.4): the markup is emitted
// inside a root that carries the generated scope class `.ts-x-<slideId>-<blockId>`, its CSS is
// rewritten under that class and never emitted unscoped, and the markup and the CSS pass the
// sanitizer (sanitize/html.ts: DOMPurify when loaded, the regular expressions always; sanitize/
// css.ts: the tokenizer) before they reach the page. The linter flags the block, the exporter
// rasterizes it, and a context that supplies a frame source renders the block inside the
// sandboxed frame instead (blocks/html-frame.ts, sanitize/frame.ts).
import { el, escapeAttr } from '../html.ts';
import type { BlockOf } from '@turboslide/schema/blocks';
import { raster, rootAttrs } from './context.ts';
import type { BlockContext } from './context.ts';
import { sanitizeCss } from '../sanitize/css.ts';
import { sanitizeMarkup } from '../sanitize/html.ts';
import { escapeScopeClass, resolveEscapeImages, scopeCss } from '../sanitize/scope.ts';

export { escapeScopeClass, resolveEscapeImages, scopeCss };
export type { ImageResolver } from '../sanitize/scope.ts';

// The sanitizer and the frame module behind the round two export of this file, until the
// `./sanitize/*` entries join packages/render/package.json (build-3/b4.md, a request to the
// integrator): the studio and the linter import them from here in the meantime.
export {
  FORBIDDEN_ATTRIBUTES,
  FORBIDDEN_TAGS,
  PURIFY_CONFIG,
  bindPurifier,
  createPurifier,
  loadPurifier,
  purifierNow,
  sanitizeHtmlBlock,
  sanitizeHtmlRegex,
  sanitizeMarkup,
} from '../sanitize/html.ts';
export type { Purifier, PurifyLike, SanitizedBlock, SanitizedMarkup } from '../sanitize/html.ts';
export { sanitizeCss, sanitizeDeclaration, sanitizeStyleAttribute } from '../sanitize/css.ts';
export type { SanitizedCss } from '../sanitize/css.ts';
export {
  buildFrameSource,
  frameCsp,
  frameDocument,
  frameSourceFor,
  frameThemeCss,
  htmlBlockPolicy,
  htmlFrameFor,
  noteDocument,
} from '../sanitize/frame.ts';
export type { FrameSourceOptions, HtmlBlockPolicyInput } from '../sanitize/frame.ts';

/**
 * Removes script bearing elements and attributes from untrusted markup: the parser when it has
 * loaded (`loadPurifier`), the regular expressions of round one in any case. Kept under its round
 * one name; `sanitizeMarkup` in sanitize/html.ts answers what changed.
 */
export function sanitizeHtml(html: string): string {
  return sanitizeMarkup(html).html;
}

export function renderHtmlEscape(block: BlockOf<'html'>, ctx: BlockContext): string {
  const scope = escapeScopeClass(ctx.slideId, block.id);
  // the tokenizer before the scope prefix (SPEC-3 8.4): @import, foreign url(), fixed positions go
  const css = scopeCss(sanitizeCss(block.css).css, `.${scope}`);
  const styleTag = css ? `<style>${css}</style>` : '';
  return el(
    'div',
    {
      ...rootAttrs(block, ctx, { className: scope }),
      'data-note': ctx.blockAttrs ? block.note : undefined,
      ...raster(ctx, block.id, 'html', false),
    },
    styleTag + resolveEscapeImages(sanitizeHtml(block.html), ctx),
  );
}

export { escapeAttr };
