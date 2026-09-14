// The sandboxed frame document of an `html` block (gslides-parity SPEC-3 0.27, 8.4 item 2;
// report 04 F4 fix 1): what `RenderOptions.htmlFrame` hands the renderer so B5's
// `renderHtmlFrame` (blocks/html-frame.ts) emits `<iframe class="ts-x-frame" sandbox=""
// srcdoc="...">`. The document carries a `<meta http-equiv="Content-Security-Policy">` with
// `default-src 'none'` (so `@import` and `url()` to another host are refused inside the frame
// whatever the sanitizer missed), the theme's sheet variables and reset as its own CSS, the
// block's CSS scoped under the block's class after the tokenizer, and the sanitized markup with
// its images resolved to URLs. `sandbox=""` gives the frame an opaque origin with scripts off; a
// standalone file opened from disk gets the same document, where a same origin script would be
// far worse (report 04 8.4). The policy of 8.4 ("Allow embedded HTML blocks in this shared
// presentation") decides between the frame and the block's note in a plate (`htmlBlockPolicy`).
// Framework free; the CSS text the caller passes comes from the theme package.
import type { BlockOf } from '@turboslide/schema/blocks';
import type { BlockContext, HtmlFrameSource } from '../blocks/context.ts';
import type { RenderOptions } from '../slide.ts';
import { escapeAttr } from '../html.ts';
import { escapeScopeClass, resolveEscapeImages, scopeCss } from './scope.ts';
import { sanitizeCss } from './css.ts';
import type { Purifier } from './html.ts';
import { purifierNow, sanitizeMarkup } from './html.ts';

/** The frame's own policy (SPEC-3 8.4 item 2); `publicStoreHost` joins `img-src` when given. */
export function frameCsp(publicStoreHost?: string | null): string {
  const store = publicStoreHost ? ` https://${publicStoreHost}` : '';
  return `default-src 'none'; img-src 'self' data:${store}; style-src 'unsafe-inline'; font-src 'self' data:`;
}

/**
 * The sheet variables and the reset a block's CSS may reference, rewritten from the theme's
 * sheet.css for a document whose root is the frame: `.ts-sheet {` and `.ts-sheet[data-theme='dark']
 * {` become `:root` blocks (the frame carries one theme), `.ts-sheet *` becomes `*`. Everything
 * else of the sheet (the layout rules of the sheet's own blocks) stays out: an escape block draws
 * its own layout.
 */
export function frameThemeCss(sheetCss: string, theme: 'light' | 'dark'): string {
  const blocks: string[] = [];
  const take = (selector: string): string | null => {
    const start = sheetCss.indexOf(`${selector} {`);
    if (start < 0) return null;
    const open = sheetCss.indexOf('{', start);
    const close = sheetCss.indexOf('}', open);
    if (open < 0 || close < 0) return null;
    return sheetCss.slice(open + 1, close);
  };
  const light = take('.ts-sheet');
  if (light !== null) blocks.push(`:root {${light}}`);
  if (theme === 'dark') {
    const dark = take(".ts-sheet[data-theme='dark']");
    if (dark !== null) blocks.push(`:root {${dark}}`);
  }
  const reset = take('.ts-sheet *');
  if (reset !== null) blocks.push(`* {${reset}}`);
  return blocks.join('\n');
}

export type FrameDocumentOptions = {
  /** The sanitized markup with its images resolved. */
  html: string;
  /** The block's CSS after the tokenizer and the scope prefix. */
  css: string;
  /** The block's scope class, the root the markup sits in. */
  scope: string;
  theme: 'light' | 'dark';
  /** The theme CSS of `frameThemeCss`, or any CSS the caller wants in the frame. */
  themeCss?: string;
  publicStoreHost?: string | null;
  title?: string;
};

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** The complete `srcdoc` document. */
export function frameDocument(options: FrameDocumentOptions): string {
  const title = escapeText(options.title ?? 'HTML block');
  const ink = options.theme === 'dark' ? '#ffffff' : '#070707';
  return [
    '<!doctype html>',
    `<html lang="en" data-theme="${options.theme}">`,
    '<head>',
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${escapeAttr(frameCsp(options.publicStoreHost))}">`,
    `<title>${title}</title>`,
    '<style>',
    'html, body { margin: 0; padding: 0; background: transparent; overflow: hidden; }',
    `body { color: var(--ink, ${ink}); font-family: Inter, system-ui, sans-serif; }`,
    options.themeCss ?? '',
    options.css,
    '</style>',
    '</head>',
    `<body><div class="ts-sheet ${options.scope}" data-theme="${options.theme}">${options.html}</div></body>`,
    '</html>',
  ].join('\n');
}

/** The note in a plate: what a block renders as when the deck's policy refuses the frame (8.4). */
export function noteDocument(block: BlockOf<'html'>, theme: 'light' | 'dark'): string {
  const note = escapeText(
    block.note.trim() === '' ? 'Embedded HTML is off in this presentation.' : block.note,
  );
  return frameDocument({
    html: `<div class="ts-x-note"><p>${note}</p></div>`,
    css: '.ts-x-note { height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; background: var(--plate, rgba(7,7,7,0.035)); color: var(--ink-2, #3a3d44); font-size: 20px; line-height: 1.3; text-align: center; box-sizing: border-box; }',
    scope: 'ts-x-off',
    theme,
    title: 'Embedded HTML is off',
  });
}

export type HtmlBlockPolicyInput = {
  /** The deck is shared beyond its owner: a link mode other than restricted, or a grant besides the owner. */
  sharedBeyondOwner: boolean;
  /** The owner's switch "Allow embedded HTML blocks in this shared presentation" (SPEC-3 6.5). */
  allowHtmlBlocks: boolean;
  /** The `htmlBlocks` kill switch (SPEC-3 8.12); on by default. */
  flagOn?: boolean;
};

/** `frame` renders the block; `note` renders its note in a plate (SPEC-3 8.4 policy). */
export function htmlBlockPolicy(input: HtmlBlockPolicyInput): 'frame' | 'note' {
  if (input.flagOn === false) return 'note';
  if (input.sharedBeyondOwner && !input.allowHtmlBlocks) return 'note';
  return 'frame';
}

export type FrameSourceOptions = {
  theme: 'light' | 'dark';
  /** Resolves an asset path (`assets/x-light.jpg`) to a URL the frame can load. */
  assetUrl: (path: string) => string;
  /** The theme's sheet.css text; `frameThemeCss` takes the variables from it. */
  sheetCss?: string;
  publicStoreHost?: string | null;
  policy?: 'frame' | 'note';
  /** The sanitizer to use; the loaded one by default, the regular expressions when none loaded. */
  purifier?: Purifier | null;
  /** The slide the block sits on, for the scope class; the block id alone otherwise. */
  slideId?: string;
  /** The host's height in sheet pixels when the layout knows it (a flow layout). */
  slotHeight?: number;
};

/**
 * The frame source of one block: the markup sanitized (the parser when loaded, the regular
 * expressions otherwise, both always), the CSS through the tokenizer and the scope prefix, the
 * images resolved through `assetUrl`, the theme variables, the frame's CSP.
 */
export function buildFrameSource(
  block: BlockOf<'html'>,
  options: FrameSourceOptions,
): HtmlFrameSource {
  const theme = options.theme;
  const title = block.alt ?? block.note;
  const height = options.slotHeight !== undefined ? { height: options.slotHeight } : {};
  if ((options.policy ?? 'frame') === 'note') {
    return { srcdoc: noteDocument(block, theme), title, ...height };
  }
  const scope = escapeScopeClass(options.slideId ?? 'x', block.id);
  const markup = sanitizeMarkup(block.html, options.purifier ?? purifierNow());
  const css = scopeCss(sanitizeCss(block.css).css, `.${scope}`);
  return {
    srcdoc: frameDocument({
      html: resolveEscapeImages(markup.html, { assetUrl: options.assetUrl, theme }),
      css,
      scope,
      theme,
      ...(options.sheetCss !== undefined
        ? { themeCss: frameThemeCss(options.sheetCss, theme) }
        : {}),
      ...(options.publicStoreHost !== undefined
        ? { publicStoreHost: options.publicStoreHost }
        : {}),
      title,
    }),
    title,
    ...height,
  };
}

/** `buildFrameSource` with the slide, the theme, the asset resolver and the slot height of a render context. */
export function frameSourceFor(
  block: BlockOf<'html'>,
  ctx: BlockContext,
  options: Omit<FrameSourceOptions, 'theme' | 'assetUrl' | 'slideId' | 'slotHeight'> = {},
): HtmlFrameSource {
  return buildFrameSource(block, {
    ...options,
    theme: ctx.theme,
    assetUrl: ctx.assetUrl,
    slideId: ctx.slideId,
    ...(ctx.slotHeight !== undefined ? { slotHeight: ctx.slotHeight } : {}),
  });
}

/**
 * The `RenderOptions.htmlFrame` callback for a slide render: every call site that renders a
 * slide for a browser (the studio's live views, the print document, the standalone build) passes
 * this so the block lands in the frame. The callback receives the block alone (B5's seam), so the
 * theme and the asset resolver come from here; the host takes the height from the render
 * context's slot when the source names none.
 */
export function htmlFrameFor(
  options: Omit<FrameSourceOptions, 'slideId' | 'slotHeight'>,
): NonNullable<RenderOptions['htmlFrame']> {
  return (block) => buildFrameSource(block, options);
}
