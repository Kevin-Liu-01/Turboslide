// `width` and `height` on the images of an escape block (gslides-parity SPEC-3 9.2 E12; research-3
// 05 3.2 E12): the block's markup references deck assets by their `assets/...` path, and the deck
// knows every asset's stored size, so the attributes are added before the escape renderer resolves
// the paths to URLs. An image that names a dimension itself is left as written (the author fixed
// one side and the other follows the intrinsic ratio); an image outside `assets/` is unknown to
// the deck and stays as it is. The frame module (SPEC-3 8.4) runs the same function on the
// markup it puts into the frame document.
import type { BlockContext } from './context.ts';

export function withImageSizes(html: string, ctx: BlockContext): string {
  const sizeOf = ctx.assetSize;
  if (sizeOf === undefined) return html;
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    if (/\s(width|height)\s*=/i.test(tag)) return tag;
    const read = (name: string): string | undefined =>
      new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
    const src = read('src');
    if (src === undefined || !src.startsWith('assets/')) return tag;
    const dark = read('data-dark');
    const size = sizeOf(src) ?? (dark !== undefined ? sizeOf(dark) : undefined);
    if (size === undefined) return tag;
    return tag.replace(/^<img/i, `<img width="${size[0]}" height="${size[1]}"`);
  });
}
