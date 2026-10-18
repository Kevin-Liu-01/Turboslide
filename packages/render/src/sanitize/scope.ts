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
 * The `@` rules whose bodies hold style rules, which are scoped like top level rules. Every other
 * `@` body (`@keyframes` steps, `@page`, `@font-face`) is copied as it is: its selectors are not
 * element selectors.
 */
const GROUPING_AT_RULE = /^@(?:media|supports|container|layer|scope|document)\b/i;

/**
 * One selector of a rule under the scope: kept when it already names the scope as its whole first
 * compound (the importer rewrites the source's stale scope class to it), `:scope` replaced by the
 * scope, every other selector prefixed. The scope must end where the selector's first compound
 * ends, so `.ts-x-s10 p` is not taken as already scoped by `.ts-x-s1`.
 */
function scopeSelectorPart(part: string, scopeSelector: string): string {
  const p = part.trim();
  if (p.length === 0) return p;
  if (/^:scope\b/.test(p)) return `.ts-sheet ${scopeSelector}${p.slice(':scope'.length)}`;
  const next = p.charAt(scopeSelector.length);
  const named = p.startsWith(scopeSelector) && (next === '' || !/[\w-]/.test(next));
  return `.ts-sheet ${named ? p : `${scopeSelector} ${p}`}`;
}

/**
 * Scopes every rule of a CSS block under a selector, `.ts-sheet <scope> <selector>`. Style rules
 * inside a grouping `@` rule (`@media`, `@supports`, `@container`, `@layer`) are scoped the same
 * way at any depth, so a media query cannot carry a rule out of the scope; the bodies of other `@`
 * rules and of nested style rules (CSS nesting, relative to their already scoped parent) are copied.
 */
export function scopeCss(css: string, scopeSelector: string): string {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let out = '';
  let buffer = '';
  /** what each open brace holds: style rules to scope, or a body to copy */
  const stack: ('scope' | 'copy')[] = [];
  const scoping = (): boolean => stack.length === 0 || stack[stack.length - 1] === 'scope';
  for (const ch of withoutComments) {
    if (ch === '{') {
      const head = buffer.trim();
      buffer = '';
      if (!scoping()) {
        out += `${head} {`;
        stack.push('copy');
      } else if (head.startsWith('@')) {
        out += `${head} {`;
        stack.push(GROUPING_AT_RULE.test(head) ? 'scope' : 'copy');
      } else {
        out += `${head
          .split(',')
          .map((part) => scopeSelectorPart(part, scopeSelector))
          .join(', ')} {`;
        stack.push('copy');
      }
      continue;
    }
    if (ch === ';' && scoping()) {
      // a statement where rules stand (`@layer a, b;`, a stray declaration) is dropped, so its
      // text never joins the next rule's selector and leaves that rule unscoped
      buffer = '';
      continue;
    }
    if (ch === '}') {
      if (stack.length === 0) {
        // an unbalanced close brace ends nothing: dropped, so it cannot close the scope early
        buffer = '';
        continue;
      }
      stack.pop();
      out += `${buffer}}`;
      buffer = '';
      if (stack.length === 0) out += '\n';
      continue;
    }
    buffer += ch;
  }
  // an unclosed rule at the end is closed, so the text after it stays inside its own block
  if (stack.length > 0) out += `${buffer}${'}'.repeat(stack.length)}`;
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
