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

/** Splits a selector list on its commas outside parentheses, brackets and strings. */
function splitSelectorList(head: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = '';
  for (const ch of head) {
    if (quote !== null) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(' || ch === '[') depth += 1;
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    else if (ch === ',' && depth === 0) {
      out.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out;
}

/**
 * One selector of a rule under the scope, or null when it would reach past the scope: a selector
 * that starts with a combinator or puts `~` or `+` right after `:scope` (the scope's siblings, the
 * other slides of a page), or that holds `&` (CSS nesting's absolute form). The rest is kept when it
 * already names the scope as its whole first compound (the importer rewrites the source's stale
 * scope class to it), takes the scope for `:scope`, or is prefixed. The scope must end where the
 * selector's first compound ends, so `.ts-x-s10 p` is not taken as already scoped by `.ts-x-s1`.
 */
function scopeSelectorPart(part: string, scopeSelector: string): string | null {
  const p = part.trim();
  if (p.length === 0) return null;
  if (/^[>+~]/.test(p) || p.includes('&')) return null;
  if (/^:scope\b/.test(p)) {
    const rest = p.slice(':scope'.length);
    if (/^\s*[+~]/.test(rest)) return null;
    return `.ts-sheet ${scopeSelector}${rest}`;
  }
  const next = p.charAt(scopeSelector.length);
  const named = p.startsWith(scopeSelector) && (next === '' || !/[\w-]/.test(next));
  if (named && /^\s*[+~]/.test(p.slice(scopeSelector.length))) return null;
  return `.ts-sheet ${named ? p : `${scopeSelector} ${p}`}`;
}

/**
 * Scopes every rule of a CSS block under a selector, `.ts-sheet <scope> <selector>`. Style rules
 * inside a grouping `@` rule (`@media`, `@supports`, `@container`, `@layer`) are scoped the same
 * way at any depth, so a media query cannot carry a rule out of the scope; the bodies of other `@`
 * rules and of nested style rules are copied (sanitizeCss drops both before this runs), and a rule
 * whose every selector reaches past the scope is dropped. The brace count is exact on the text
 * sanitizeCss writes, whose only braces are structural.
 */
export function scopeCss(css: string, scopeSelector: string): string {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let out = '';
  let buffer = '';
  /** what each open brace holds: style rules to scope, a body to copy, or a body to drop */
  const stack: ('scope' | 'copy' | 'drop')[] = [];
  const top = () => stack[stack.length - 1];
  const scoping = (): boolean => stack.length === 0 || top() === 'scope';
  const dropping = (): boolean => stack.includes('drop');
  for (const ch of withoutComments) {
    if (ch === '{') {
      const head = buffer.trim();
      buffer = '';
      if (dropping()) {
        stack.push('drop');
      } else if (!scoping()) {
        out += `${head} {`;
        stack.push('copy');
      } else if (head.startsWith('@')) {
        out += `${head} {`;
        stack.push(GROUPING_AT_RULE.test(head) ? 'scope' : 'copy');
      } else {
        const parts = splitSelectorList(head)
          .map((part) => scopeSelectorPart(part, scopeSelector))
          .filter((part): part is string => part !== null);
        if (parts.length === 0) {
          stack.push('drop');
        } else {
          out += `${parts.join(', ')} {`;
          stack.push('copy');
        }
      }
      continue;
    }
    if (ch === ';' && scoping() && !dropping()) {
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
      const closed = stack.pop();
      if (closed !== 'drop') out += `${buffer}}`;
      buffer = '';
      if (stack.length === 0 && closed !== 'drop') out += '\n';
      continue;
    }
    buffer += ch;
  }
  // an unclosed rule at the end is closed, so the text after it stays inside its own block
  const open = stack.filter((each) => each !== 'drop').length;
  if (open > 0) out += `${dropping() ? '' : buffer}${'}'.repeat(open)}`;
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
