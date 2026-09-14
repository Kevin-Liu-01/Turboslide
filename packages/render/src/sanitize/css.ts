// The CSS tokenizer of the `html` escape block (gslides-parity SPEC-3 0.27, 8.4 item 1; report 04
// F4 bypass 6): a block's `css` and every `style` attribute the sanitizer lets through pass here
// before `scopeCss` prefixes the selectors. Dropped: `@import`, `@font-face`, `@namespace` and
// `@charset` rules (a fetch to another host, a font from anywhere, a namespace trick); any
// `url()` whose target is not a deck asset (`assets/...`) or an inline image (`data:image/`);
// `expression(`, `behavior:` and `-moz-binding` (legacy script vectors); `position: fixed` and
// `position: sticky` (a block that paints over the editor chrome); and `!important` on `z-index`
// (the same trick with a stacking order). Everything else passes untouched, so the GT deck's
// imported escape blocks render as before. Framework free, no DOM, runs on the server, in the
// CLI and in the browser.

export type SanitizedCss = {
  css: string;
  /** What was removed, one entry per rule or declaration, for the `sanitizer.rewrite` log line. */
  dropped: string[];
};

/** The at rules a block never carries (SPEC-3 8.4). */
export const FORBIDDEN_AT_RULES: ReadonlyArray<string> = [
  'import',
  'font-face',
  'namespace',
  'charset',
];

/** A `url()` target a block may reference: a deck asset twin or an inline image. */
export const ALLOWED_URL = /^(?:assets\/[A-Za-z0-9._@/-]+|data:image\/[a-z0-9.+-]+[;,])/i;

const FORBIDDEN_VALUE = /expression\s*\(|behavior\s*:|-moz-binding|javascript:|vbscript:/i;

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** True when every `url(...)` in a value names an allowed target. */
export function urlsAllowed(value: string): boolean {
  const pattern = /url\(\s*(['"]?)([^'")]*)\1\s*\)/gi;
  for (const match of value.matchAll(pattern)) {
    const target = (match[2] ?? '').trim();
    if (!ALLOWED_URL.test(target)) return false;
  }
  return true;
}

/**
 * One declaration (`property: value [!important]`) after the rules above, or null when it is
 * dropped: a forbidden value, a `url()` outside the deck, a fixed or sticky position; `!important`
 * is stripped from `z-index` and the declaration kept.
 */
export function sanitizeDeclaration(declaration: string): string | null {
  const colon = declaration.indexOf(':');
  if (colon <= 0) return null;
  const property = declaration.slice(0, colon).trim().toLowerCase();
  let value = declaration.slice(colon + 1).trim();
  if (property === '' || value === '') return null;
  if (FORBIDDEN_VALUE.test(value)) return null;
  if (!urlsAllowed(value)) return null;
  if (property === 'position' && /\b(?:fixed|sticky)\b/i.test(value)) return null;
  if (property === 'behavior' || property === '-moz-binding') return null;
  if (property === 'z-index' && /!\s*important/i.test(value)) {
    value = value.replace(/\s*!\s*important/gi, '').trim();
  }
  return `${property}: ${value}`;
}

/** A declaration list (the inside of a rule, or a `style` attribute) declaration by declaration. */
export function sanitizeDeclarations(body: string): { text: string; dropped: string[] } {
  const dropped: string[] = [];
  const kept: string[] = [];
  for (const raw of splitDeclarations(body)) {
    const declaration = raw.trim();
    if (declaration === '') continue;
    const clean = sanitizeDeclaration(declaration);
    if (clean === null) dropped.push(declaration);
    else kept.push(clean);
  }
  return { text: kept.join('; '), dropped };
}

/** Splits on `;` outside parentheses and quotes (a `data:` URL carries semicolons). */
function splitDeclarations(body: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = '';
  for (const ch of body) {
    if (quote !== null) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '(') depth += 1;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ';' && depth === 0) {
      out.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim() !== '') out.push(current);
  return out;
}

/** The value of a `style` attribute after the declaration rules; empty when nothing survives. */
export function sanitizeStyleAttribute(value: string): string {
  return sanitizeDeclarations(stripComments(value)).text;
}

type Rule = { prelude: string; body: string; nested: Rule[] | null };

/** A flat parse of rules and at rules by brace depth; a nested at rule keeps its inner rules. */
function parseRules(css: string): Rule[] {
  const rules: Rule[] = [];
  let i = 0;
  const text = css;
  const readBlock = (start: number): { inner: string; end: number } => {
    let depth = 0;
    let quote: string | null = null;
    for (let j = start; j < text.length; j += 1) {
      const ch = text[j] ?? '';
      if (quote !== null) {
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        continue;
      }
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) return { inner: text.slice(start + 1, j), end: j + 1 };
      }
    }
    return { inner: text.slice(start + 1), end: text.length };
  };
  while (i < text.length) {
    const brace = text.indexOf('{', i);
    const semi = text.indexOf(';', i);
    if (brace < 0) break;
    const prelude = text.slice(i, brace).trim();
    // a statement at rule (`@import url(x);`) ends at the semicolon before any brace
    if (prelude.startsWith('@') && semi >= 0 && semi < brace) {
      rules.push({ prelude: text.slice(i, semi).trim(), body: '', nested: null });
      i = semi + 1;
      continue;
    }
    const { inner, end } = readBlock(brace);
    const nested = prelude.startsWith('@') && /\{/.test(inner) ? parseRules(inner) : null;
    rules.push({ prelude, body: nested === null ? inner : '', nested });
    i = end;
  }
  // a trailing statement at rule without a brace anywhere after it
  const tail = text.slice(i).trim();
  if (tail.startsWith('@')) {
    for (const statement of tail.split(';')) {
      const rule = statement.trim();
      if (rule !== '') rules.push({ prelude: rule, body: '', nested: null });
    }
  }
  return rules;
}

function atRuleName(prelude: string): string | null {
  const match = /^@([a-z-]+)/i.exec(prelude);
  return match === null ? null : (match[1] ?? '').toLowerCase();
}

function serialize(rules: Rule[], dropped: string[]): string {
  const out: string[] = [];
  for (const rule of rules) {
    const at = atRuleName(rule.prelude);
    if (at !== null && FORBIDDEN_AT_RULES.includes(at)) {
      dropped.push(rule.prelude);
      continue;
    }
    if (rule.nested !== null) {
      const inner = serialize(rule.nested, dropped);
      if (inner.trim() !== '') out.push(`${rule.prelude} { ${inner} }`);
      continue;
    }
    if (at !== null && rule.body === '') {
      // a statement at rule that is not forbidden (`@layer x;`): kept as it is
      out.push(`${rule.prelude};`);
      continue;
    }
    const declarations = sanitizeDeclarations(rule.body);
    dropped.push(...declarations.dropped.map((d) => `${rule.prelude} { ${d} }`));
    if (declarations.text !== '') out.push(`${rule.prelude} { ${declarations.text}; }`);
  }
  return out.join('\n');
}

/**
 * A block's CSS after the rules above. Comments go; rule order and selectors stay; a rule whose
 * every declaration was dropped disappears. `scopeCss` (html-escape.ts) runs after this.
 */
export function sanitizeCss(css: string): SanitizedCss {
  const dropped: string[] = [];
  const out = serialize(parseRules(stripComments(css)), dropped);
  return { css: out, dropped };
}
