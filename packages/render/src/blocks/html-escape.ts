// The `html` escape block (SPEC 1, 5.2, 11): the markup is emitted inside a root that carries the
// generated scope class `.ts-x-<slideId>-<blockId>`, its CSS is rewritten under that class and
// never emitted unscoped, and `<script>`, `<iframe>`, `<object>`, `<embed>` and event attributes
// are stripped. The linter flags the block and the exporter rasterizes it.
import { el, escapeAttr } from '../html.ts';
import type { SlideId } from '@turboslide/schema/ids';
import type { BlockOf } from '@turboslide/schema/blocks';
import { raster, rootAttrs } from './context.ts';
import type { BlockContext } from './context.ts';

export function escapeScopeClass(slideId: SlideId, blockId: string): string {
  return `ts-x-${slideId}-${blockId}`.replace(/[^\w-]/g, '-');
}

/** Removes script-bearing elements and attributes from untrusted markup. */
export function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<(iframe|object|embed)\b[\s\S]*?(<\/\1\s*>|\/>)/gi, '')
    .replace(/<(iframe|object|embed)\b[^>]*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+(href|src|xlink:href)\s*=\s*(["']?)\s*javascript:[^"'\s>]*\2/gi, '');
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

/**
 * Images inside escape markup reference deck assets by their `assets/...` path (the importer rewrites
 * the source's `shots/...` references). The URL is resolved the way block images are, and the twin
 * for the theme becomes `src` with both twins kept for the viewer runtime.
 */
export function resolveEscapeImages(html: string, ctx: BlockContext): string {
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

export function renderHtmlEscape(block: BlockOf<'html'>, ctx: BlockContext): string {
  const scope = escapeScopeClass(ctx.slideId, block.id);
  const css = scopeCss(block.css, `.${scope}`);
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
