// The scope helpers the `html` escape block and its sandboxed frame share (SPEC 5.2; gslides-parity
// SPEC-3 8.4): the generated scope class, the CSS prefixer, and the image resolver that turns a
// block's `assets/...` references into URLs. A leaf module, so blocks/html-escape.ts (the block
// renderer) and sanitize/frame.ts (the frame document) import it without a cycle between them.
import { escapeAttr } from '../html.ts';
import type { SlideId } from '@turboslide/schema/ids';
import type { BlockContext } from '../blocks/context.ts';

export function escapeScopeClass(slideId: SlideId, blockId: string): string {
  return `ts-x-${slideId}-${blockId}`.replace(/[^\w-]/g, '-');
}

/**
 * Scopes every rule of a CSS block under a class. A selector that already starts with the scope
 * class (the importer rewrites the source's stale scope class to it) is kept; every other selector
 * is prefixed. `@` rules pass through with their inner rules scoped.
 */
export function scopeCss(css: string, scopeSelector: string): string {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let out = '';
  let depth = 0;
  let buffer = '';
  for (const ch of withoutComments) {
    if (ch === '{') {
      if (depth === 0) {
        const selector = buffer.trim();
        buffer = '';
        out += selector.startsWith('@')
          ? `${selector} {`
          : `${selector
              .split(',')
              .map((part) => {
                const p = part.trim();
                if (p.length === 0) return p;
                const scoped = p.startsWith(scopeSelector) ? p : `${scopeSelector} ${p}`;
                return `.ts-sheet ${scoped}`;
              })
              .join(', ')} {`;
      } else {
        out += `${buffer}{`;
        buffer = '';
      }
      depth += 1;
      continue;
    }
    if (ch === '}') {
      depth -= 1;
      out += `${buffer}}`;
      buffer = '';
      if (depth === 0) out += '\n';
      continue;
    }
    buffer += ch;
  }
  return out.trim();
}

/** What `resolveEscapeImages` reads of a context: the asset resolver and the theme. */
export type ImageResolver = Pick<BlockContext, 'assetUrl' | 'theme'>;

/**
 * Images inside escape markup reference deck assets by their `assets/...` path (the importer rewrites
 * the source's `shots/...` references). The URL is resolved the way block images are, and the twin
 * for the theme becomes `src` with both twins kept for the viewer runtime.
 */
export function resolveEscapeImages(html: string, ctx: ImageResolver): string {
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const read = (name: string): string | undefined => {
      const match = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
      return match?.[1];
    };
    const src = read('src');
    if (!src || !src.startsWith('assets/')) return tag;
    const dark = read('data-dark');
    const light = ctx.assetUrl(src);
    const darkUrl = dark ? ctx.assetUrl(dark) : undefined;
    const chosen = ctx.theme === 'dark' && darkUrl ? darkUrl : light;
    let out = tag
      .replace(/\ssrc="[^"]*"/, ` src="${escapeAttr(chosen)}"`)
      .replace(/\sdata-dark="[^"]*"/, '')
      .replace(/\sdata-light="[^"]*"/, '');
    // The twin that differs from src only, as imgAttrs does (context.ts).
    if (darkUrl)
      out = out.replace(
        /^<img/,
        chosen === light
          ? `<img data-dark="${escapeAttr(darkUrl)}"`
          : `<img data-light="${escapeAttr(light)}"`,
      );
    return out;
  });
}
