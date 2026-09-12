// Empty Texts, paragraph breaks, empty pictures and block links (gslides-parity SPEC 5.4, 7.2.7,
// 7.4). A layout inserts empty Texts; the editor stage (prompts on) draws Google's prompt for an
// empty one in titanium at the block's own size, marked data-prompt and aria-hidden, unselectable
// through the sheet CSS; every other surface (thumbnails, present mode, the view route, the
// standalone build, both PPTX modes, the PDF) draws nothing for it, so a placeholder is never
// content. A multiline Text (paragraph, text box, box, table cell) renders one `.para` span per
// paragraph, display block with no added spacing; a one paragraph Text renders as it always did,
// so every existing slide keeps its markup byte for byte. An empty picture reference (a figure
// layout's shot, pair figure or detail before an asset is chosen) draws a dashed plate reading
// "Click to add a picture" with prompts on and nothing otherwise. A block link wraps the block
// root: an `<a>` where links are active (present mode, the view route, the standalone build, the
// render surface the exporter measures) and an inert `<span>` on the editor stage.
import type { Block } from '@turboslide/schema/blocks';
import type { BlockLink, Text } from '@turboslide/schema/text';
import { slideLinkUrl, splitParagraphs } from '@turboslide/schema/text';
import { PROMPTS, promptFor } from '@turboslide/schema/layouts';
import { attrs, classes, el, escapeText } from '../html.ts';
import { renderText } from '../text.ts';
import type { RenderTextOptions } from '../text.ts';
import type { BlockContext } from './context.ts';

/** True when the context draws prompts: the editor stage (live) or a surface that asked for them. */
export function wantsPrompts(ctx: BlockContext): boolean {
  return ctx.live === true || ctx.prompts === true;
}

/** The prompt span: titanium at the block's size, unselectable, hidden from assistive technology. */
export function promptHtml(text: string): string {
  return `<span class="prompt" data-prompt aria-hidden="true">${escapeText(text)}</span>`;
}

/** The prompt wording of SPEC 5.4 for a Text of a block, or of a slide field when `block` is absent. */
export function promptText(ctx: BlockContext, block: Block | undefined, path: string): string {
  return promptFor({
    slide: ctx.slide ?? { kind: 'content' },
    ...(block !== undefined ? { block } : {}),
    path,
  });
}

/**
 * A Text as HTML, or the prompt for an empty one when the context draws prompts, or nothing.
 * `path` is the JSON pointer of the Text inside the block (`/text`, `/items/0/text`).
 */
export function renderTextOrPrompt(
  text: Text,
  ctx: BlockContext,
  block: Block | undefined,
  path: string,
  options: RenderTextOptions = { gtWord: ctx.gtWord },
): string {
  if (text === '') return wantsPrompts(ctx) ? promptHtml(promptText(ctx, block, path)) : '';
  return renderText(text, options);
}

/**
 * A multiline Text: one `.para` span per paragraph when the Text holds a paragraph break, else
 * the plain markup (so a one paragraph Text renders as before). An empty paragraph keeps its line
 * through the sheet CSS (`.para:empty`). `alwaysWrap` writes the span around a one paragraph Text
 * too, the form a table cell keeps for its editor contract.
 */
export function renderParagraphs(
  text: Text,
  options: RenderTextOptions,
  alwaysWrap = false,
): string {
  const paragraphs = splitParagraphs(text);
  if (paragraphs.length === 1 && !alwaysWrap) return renderText(text, options);
  return paragraphs
    .map((paragraph) => el('span', { class: 'para' }, renderText(paragraph, options)))
    .join('');
}

/** A multiline Text with the prompt rule of renderTextOrPrompt applied to an empty one. */
export function renderMultiline(
  text: Text,
  ctx: BlockContext,
  block: Block | undefined,
  path: string,
  alwaysWrap = false,
): string {
  if (text === '') {
    const prompt = wantsPrompts(ctx) ? promptHtml(promptText(ctx, block, path)) : '';
    return alwaysWrap ? el('span', { class: 'para' }, prompt) : prompt;
  }
  return renderParagraphs(text, { gtWord: ctx.gtWord }, alwaysWrap);
}

/**
 * The dashed plate an empty picture reference draws with prompts on (SPEC 5.2, "Click to add a
 * picture"), and nothing otherwise. `className` names the element the picture would have been
 * (`shot`, the pair or detail image), so the figure keeps its box.
 */
export function emptyPictureHtml(ctx: BlockContext, className?: string): string {
  if (!wantsPrompts(ctx)) return '';
  return el(
    'div',
    { class: classes('pic-prompt', className), 'data-prompt': true, 'aria-hidden': 'true' },
    `<span>${escapeText(PROMPTS.picture)}</span>`,
  );
}

/** The href of a block link: the URL as written, or the slide link form of a slide target. */
export function blockLinkHref(link: BlockLink): string {
  return typeof link === 'string' ? link : slideLinkUrl({ slide: link.slide });
}

/** True for a link that leaves the deck (http, https, mailto and the like), false for a slide link. */
export function isExternalHref(href: string): boolean {
  return !href.startsWith('#');
}

/**
 * Wraps a block's markup in its link (SPEC 7.2.7): an `<a class="link">` active outside the editor
 * (a new tab for an external URL, the hash for a slide link the runtimes resolve), an inert
 * `<span class="link" data-link>` on the editor stage, and the markup unchanged without a link.
 */
export function linkWrap(html: string, block: Block, ctx: BlockContext): string {
  if (block.link === undefined) return html;
  const href = blockLinkHref(block.link);
  if (ctx.live === true) return el('span', { class: 'link', 'data-link': href }, html);
  const external = isExternalHref(href);
  return `<a${attrs({
    class: 'link',
    href,
    target: external ? '_blank' : undefined,
    rel: external ? 'noreferrer' : undefined,
  })}>${html}</a>`;
}
