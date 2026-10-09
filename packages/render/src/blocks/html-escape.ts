// The `html` escape block (SPEC 1, 5.2, 11; gslides-parity SPEC-3 0.27, 8.4): the markup is emitted
// inside a root that carries the generated scope class `.ts-x-<slideId>-<blockId>`, its CSS is
// rewritten under that class and never emitted unscoped, and the markup and the CSS pass the
// sanitizer (sanitize/html.ts: DOMPurify when loaded, the regular expressions always; sanitize/
// css.ts: the tokenizer) before they reach the page. The linter flags the block, the exporter
// rasterizes it, and a context that supplies a frame source renders the block inside the
// sandboxed frame instead (blocks/html-frame.ts, sanitize/frame.ts).
import { el, escapeAttr, escapeText } from '../html.ts';
import type { BlockOf } from '@turboslide/schema/blocks';
import { safeStyleText } from '@turboslide/schema/style-text';
import { raster, rootAttrs } from './context.ts';
import type { BlockContext } from './context.ts';
import { sanitizeCss } from '../sanitize/css.ts';
import { inPage, purifierNow, sanitizeMarkup } from '../sanitize/html.ts';
import type { Purifier } from '../sanitize/html.ts';
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
  inPage,
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

/** The class of the plate an html block draws in a page until the parser has loaded (HR-W#6). */
export const HTML_PLATE_CLASS = 'ts-x-plate';

/**
 * The plate an html block draws in place of its markup: the block's note, or a sentence when it
 * has none, on the plate colour. Inline styles, so it needs no stylesheet; no markup of the block.
 */
export function htmlPlate(note = ''): string {
  const words = note.trim() === '' ? 'Loading the HTML block' : note.trim();
  return el(
    'div',
    {
      class: HTML_PLATE_CLASS,
      style:
        'display:flex;align-items:center;justify-content:center;width:100%;height:100%;min-height:48px;padding:16px;box-sizing:border-box;background:var(--plate,rgba(7,7,7,0.035));color:var(--ink-2,#3a3d44);font-size:20px;line-height:1.3;text-align:center',
    },
    `<p>${escapeText(words)}</p>`,
  );
}

export type SanitizeHtmlOptions = {
  /** The parser to use; the loaded one when left out. */
  purifier?: Purifier | null;
  /** Whether the render runs in a page; read from the globals when left out. */
  page?: boolean;
  /** The block's note, which the plate shows. */
  note?: string;
};

/**
 * Removes script bearing elements and attributes from untrusted markup: the parser when it has
 * loaded (`loadPurifier`), the regular expressions of round one in any case. In a page with no
 * parser yet it answers the block's plate instead (HR-W#6, CRIT-M9): the regular expressions are
 * a second pass there, never the only one. Kept under its round one name; `sanitizeMarkup` in
 * sanitize/html.ts answers what changed.
 */
export function sanitizeHtml(html: string, options: SanitizeHtmlOptions = {}): string {
  const purifier = options.purifier === undefined ? purifierNow() : options.purifier;
  if (purifier === null && (options.page ?? inPage())) return htmlPlate(options.note);
  return sanitizeMarkup(html, purifier).html;
}

export function renderHtmlEscape(block: BlockOf<'html'>, ctx: BlockContext): string {
  const scope = escapeScopeClass(ctx.slideId, block.id);
  const plated = purifierNow() === null && inPage();
  // the tokenizer before the scope prefix (SPEC-3 8.4): @import, foreign url(), fixed positions go;
  // the plate carries none of the block's CSS
  const css = plated ? '' : scopeCss(sanitizeCss(block.css).css, `.${scope}`);
  const styleTag = css ? `<style>${safeStyleText(css)}</style>` : '';
  return el(
    'div',
    {
      ...rootAttrs(block, ctx, { className: scope }),
      'data-note': ctx.blockAttrs ? block.note : undefined,
      ...raster(ctx, block.id, 'html', false),
    },
    plated
      ? htmlPlate(block.note)
      : styleTag + resolveEscapeImages(sanitizeHtml(block.html, { page: false }), ctx),
  );
}

export { escapeAttr };
