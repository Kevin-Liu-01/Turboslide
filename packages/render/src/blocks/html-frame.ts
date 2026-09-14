// The sandboxed frame of an `html` block (gslides-parity SPEC-3 8.4 item 2): the block root keeps
// the generated scope class, the block attributes and the raster the exporter screenshots, and
// holds one `<iframe class="ts-x-frame" sandbox="">` whose document the frame module builds
// (`@turboslide/render/sanitize/frame`, B4) from the sanitized markup, the theme CSS the block
// needs and the frame's CSP. The renderer emits the element when the context supplies a frame
// source (RenderOptions.htmlFrame); without one the block renders as the scoped escape markup
// (html-escape.ts), so a document renders byte for byte as before until the frame module lands.
// `sandbox=""` is the whole policy: no scripts, no same origin, an opaque origin.
import type { BlockOf } from '@turboslide/schema/blocks';
import { classes, el, px, style } from '../html.ts';
import type { BlockContext, HtmlFrameSource } from './context.ts';
import { escapeScopeClass } from './html-escape.ts';
import { raster, rootAttrs } from './context.ts';

export const FRAME_HOST_CLASS = 'ts-x-host';
export const FRAME_CLASS = 'ts-x-frame';

export function renderHtmlFrame(
  block: BlockOf<'html'>,
  ctx: BlockContext,
  source: HtmlFrameSource,
): string {
  const scope = escapeScopeClass(ctx.slideId, block.id);
  // a positioned block fills its wrapper (block-css.ts); a block in a flow layout takes the
  // height the frame source measured, else the slot's height when the layout knows it
  const height = source.height ?? ctx.slotHeight;
  const frame = el(
    'iframe',
    {
      class: FRAME_CLASS,
      sandbox: '',
      srcdoc: source.srcdoc,
      title: source.title ?? block.alt ?? block.note ?? 'HTML block',
      loading: 'eager',
      referrerpolicy: 'no-referrer',
    },
    '',
  );
  return el(
    'div',
    {
      ...rootAttrs(block, ctx, {
        className: classes(scope, FRAME_HOST_CLASS),
        style: style(block.pos === undefined && height !== undefined && `height:${px(height)}px`),
      }),
      'data-note': ctx.blockAttrs ? block.note : undefined,
      ...raster(ctx, block.id, 'html', false),
    },
    frame,
  );
}
