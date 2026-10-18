// The CSS tokenizer of the `html` escape block and of an HtmlLayer (gslides-parity SPEC-3 0.27,
// 8.4 item 1; report 04 F4 bypass 6; docs/html-layers.md 3): a block's or a layer's `css` and every
// `style` attribute the markup sanitizer lets through pass here before `scopeCss` prefixes the
// selectors (scope.ts).
//
// The text is tokenized the way a browser reads it (CSS Syntax 3, the parts that decide structure):
// comments, strings, unquoted `url(...)`, backslash escapes, and the braces, semicolons and
// parentheses outside them. The output is rebuilt from the tokens, so every brace in it is a
// structural brace and `scopeCss`'s depth count cannot be led astray (a brace inside a string or a
// url desynchronized the two parsers before 2026-10-18). Kept: style rules, and the grouping rules
// `@media`, `@supports`, `@container` and `@layer` with the style rules inside them. Dropped:
//
// - every other at rule (`@import`, `@font-face`, `@keyframes`, `@property`, `@page`,
//   `@starting-style`, `@scope`, a statement such as `@layer a, b;`): each either fetches, or acts
//   on the whole document whatever its scope
// - a nested style rule inside a style rule (CSS nesting: `&` makes its selector absolute)
// - a selector or a declaration that holds a backslash escape, a string with a brace, a malformed
//   string or url, or (a selector) a `&` or a `url(...)`
// - a `url()` whose target is not a deck asset (`assets/...`) or an inline image (`data:image/`), and
//   the functions that reach another resource or element (`image-set`, `src`, `attr`, `element`,
//   `cross-fade`)
// - `expression(`, `behavior` and `-moz-binding` (legacy script vectors), `position: fixed` and
//   `sticky` (a block that paints over the editor chrome) and a `position` read from `var()`, and
//   `pointer-events` (a layer never takes a pointer, html-layers.ts); `!important` on `z-index` is
//   stripped and the declaration kept
//
// A `<` that opens markup (`</style`, `<!--`, `<script`) is written as `\3c ` (schema style-text.ts,
// hardening H1 WEBV-1), so the CSS cannot close the style element it lands in. Framework free, no
// DOM, runs on the server, in the CLI and in the browser.
import { safeStyleText } from '@turboslide/schema/style-text';

export type SanitizedCss = {
  css: string;
  /** What was removed, one entry per rule or declaration, for the `sanitizer.rewrite` log line. */
  dropped: string[];
};

/** The at rules a block never carries (SPEC-3 8.4); every at rule but GROUPING_AT_RULES goes too. */
export const FORBIDDEN_AT_RULES: ReadonlyArray<string> = [
  'import',
  'font-face',
  'namespace',
  'charset',
];

/** The at rules whose blocks hold style rules, kept with their rules scoped (scope.ts). */
export const GROUPING_AT_RULES: ReadonlyArray<string> = ['media', 'supports', 'container', 'layer'];

/** A `url()` target a block may reference: a deck asset twin or an inline image. */
export const ALLOWED_URL = /^(?:assets\/[A-Za-z0-9._@/-]+|data:image\/[a-z0-9.+-]+[;,])/i;

const FORBIDDEN_VALUE = /expression\s*\(|behavior\s*:|-moz-binding|javascript:|vbscript:/i;

/** The functions that load another resource or paint another element, refused in any value. */
const FORBIDDEN_FUNCTION =
  /(?:^|[^\w-])(?:-webkit-image-set|image-set|src|attr|-moz-element|element|-webkit-cross-fade|cross-fade)\s*\(/i;

// ---------------------------------------------------------------------------------------------
// The tokens

type Punct = '{' | '}' | ';' | ':' | ',' | '(' | ')' | '[' | ']';

type Token =
  | { t: 'ws' }
  | { t: 'text'; v: string }
  | { t: 'punct'; v: Punct }
  /** a quoted string with its quotes; `bad` when unterminated or carrying an escape */
  | { t: 'str'; v: string; bad: boolean }
  /** an unquoted `url(...)`; `bad` when it holds a quote, a paren, an escape or inner space */
  | { t: 'url'; v: string; bad: boolean }
  /** a backslash and the character after it: whatever holds one is dropped */
  | { t: 'esc'; v: string };

const PUNCT = new Set<string>(['{', '}', ';', ':', ',', '(', ')', '[', ']']);
const IDENT = /[\w\u0080-￿-]/;
const SPACE = /[ \t\n\r\f]/;

function tokenize(css: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < css.length) {
    const ch = css.charAt(i);
    if (ch === '/' && css.charAt(i + 1) === '*') {
      const end = css.indexOf('*/', i + 2);
      // an unterminated comment runs to the end of the text, as a browser reads it
      if (end < 0) break;
      out.push({ t: 'ws' });
      i = end + 2;
      continue;
    }
    if (SPACE.test(ch)) {
      while (i < css.length && SPACE.test(css.charAt(i))) i += 1;
      out.push({ t: 'ws' });
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      let bad = false;
      for (; j < css.length; j += 1) {
        const c = css.charAt(j);
        if (c === '\\') {
          bad = true;
          j += 1;
          continue;
        }
        if (c === '\n' || c === '\r' || c === '\f') {
          bad = true;
          break;
        }
        if (c === ch) break;
      }
      if (j >= css.length) bad = true;
      out.push({ t: 'str', v: css.slice(i, Math.min(j + 1, css.length)), bad });
      i = j + 1;
      continue;
    }
    if (ch === '\\') {
      out.push({ t: 'esc', v: css.slice(i, i + 2) });
      i += 2;
      continue;
    }
    if (PUNCT.has(ch)) {
      out.push({ t: 'punct', v: ch as Punct });
      i += 1;
      continue;
    }
    if (IDENT.test(ch)) {
      let j = i;
      while (j < css.length && IDENT.test(css.charAt(j))) j += 1;
      const word = css.slice(i, j);
      if (word.toLowerCase() === 'url' && css.charAt(j) === '(') {
        let k = j + 1;
        while (k < css.length && SPACE.test(css.charAt(k))) k += 1;
        const next = css.charAt(k);
        if (next !== '"' && next !== "'") {
          // the unquoted form: a url token to the closing paren
          let bad = false;
          let m = k;
          for (; m < css.length; m += 1) {
            const c = css.charAt(m);
            if (c === ')') break;
            if (c === '"' || c === "'" || c === '(' || c === '\\') bad = true;
            if (SPACE.test(c)) {
              let n = m;
              while (n < css.length && SPACE.test(css.charAt(n))) n += 1;
              if (css.charAt(n) !== ')') bad = true;
              m = n - 1;
            }
          }
          if (m >= css.length) bad = true;
          out.push({ t: 'url', v: css.slice(i, Math.min(m + 1, css.length)), bad });
          i = m + 1;
          continue;
        }
      }
      out.push({ t: 'text', v: word });
      i = j;
      continue;
    }
    out.push({ t: 'text', v: ch });
    i += 1;
  }
  return out;
}

/** The tokens as text, whitespace collapsed to one space. */
function text(tokens: ReadonlyArray<Token>): string {
  let out = '';
  for (const token of tokens)
    out += token.t === 'ws' ? ' ' : token.t === 'punct' ? token.v : token.v;
  return out.replace(/\s+/g, ' ').trim();
}

/** A run of tokens no rule may keep: an escape, a malformed string or url, a string with a brace. */
function unsafe(tokens: ReadonlyArray<Token>): boolean {
  return tokens.some(
    (token) =>
      token.t === 'esc' ||
      ((token.t === 'str' || token.t === 'url') && (token.bad || /[{}]/.test(token.v))),
  );
}

// ---------------------------------------------------------------------------------------------
// Declarations

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
 * dropped; `!important` is stripped from `z-index` and the declaration kept.
 */
export function sanitizeDeclaration(declaration: string): string | null {
  const colon = declaration.indexOf(':');
  if (colon <= 0) return null;
  const property = declaration.slice(0, colon).trim().toLowerCase();
  let value = declaration.slice(colon + 1).trim();
  if (property === '' || value === '') return null;
  // a property is a plain name or a custom property; anything else (an escape, a brace) is junk
  if (!/^(?:--[\w-]+|-?[a-z][a-z0-9-]*)$/.test(property)) return null;
  if (/[\\{}]/.test(value)) return null;
  if (FORBIDDEN_VALUE.test(value) || FORBIDDEN_FUNCTION.test(value)) return null;
  if (!urlsAllowed(value)) return null;
  if (property === 'position' && /\b(?:fixed|sticky)\b|var\s*\(/i.test(value)) return null;
  if (property === 'behavior' || property === '-moz-binding') return null;
  if (property === 'pointer-events') return null;
  if (property === 'z-index' && /!\s*important/i.test(value)) {
    value = value.replace(/\s*!\s*important/gi, '').trim();
  }
  return `${property}: ${value}`;
}

/** Splits a run of tokens on `;` outside parentheses and brackets. */
function splitDeclarationTokens(tokens: ReadonlyArray<Token>): Token[][] {
  const out: Token[][] = [];
  let depth = 0;
  let current: Token[] = [];
  for (const token of tokens) {
    if (token.t === 'punct') {
      if (token.v === '(' || token.v === '[') depth += 1;
      if (token.v === ')' || token.v === ']') depth = Math.max(0, depth - 1);
      if (token.v === ';' && depth === 0) {
        out.push(current);
        current = [];
        continue;
      }
    }
    current.push(token);
  }
  out.push(current);
  return out;
}

/** The declarations of a token run, each through the token rules and `sanitizeDeclaration`. */
function declarationsOf(tokens: ReadonlyArray<Token>): { kept: string[]; dropped: string[] } {
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const part of splitDeclarationTokens(tokens)) {
    const raw = text(part);
    if (raw === '') continue;
    const clean = unsafe(part) ? null : sanitizeDeclaration(raw);
    if (clean === null) dropped.push(raw);
    else kept.push(clean);
  }
  return { kept, dropped };
}

/** A declaration list (the inside of a rule, or a `style` attribute) declaration by declaration. */
export function sanitizeDeclarations(body: string): { text: string; dropped: string[] } {
  const tokens = tokenize(body).filter((token) => !(token.t === 'punct' && /[{}]/.test(token.v)));
  const { kept, dropped } = declarationsOf(tokens);
  return { text: kept.join('; '), dropped };
}

/** The value of a `style` attribute after the declaration rules; empty when nothing survives. */
export function sanitizeStyleAttribute(value: string): string {
  // a brace in a style attribute is never structure: the whole attribute is refused
  if (/[{}]/.test(value)) return '';
  return sanitizeDeclarations(value).text;
}

// ---------------------------------------------------------------------------------------------
// Rules

type Cursor = { tokens: Token[]; i: number; dropped: string[] };

const isPunct = (token: Token | undefined, value: Punct): boolean =>
  token !== undefined && token.t === 'punct' && token.v === value;

/** Skips past the block whose `{` was just consumed, to its matching `}`. */
function skipBlock(cursor: Cursor): void {
  let depth = 1;
  while (cursor.i < cursor.tokens.length && depth > 0) {
    const token = cursor.tokens[cursor.i];
    if (isPunct(token, '{')) depth += 1;
    if (isPunct(token, '}')) depth -= 1;
    cursor.i += 1;
  }
}

/**
 * Reads tokens up to the first `{`, `;` or `}` outside parentheses and brackets, without consuming
 * it; the stop token (or null at the end of the text) and the tokens before it.
 */
function readPrelude(cursor: Cursor): { stop: Punct | null; tokens: Token[] } {
  const tokens: Token[] = [];
  let depth = 0;
  while (cursor.i < cursor.tokens.length) {
    const token = cursor.tokens[cursor.i];
    if (token === undefined) break;
    if (token.t === 'punct') {
      if (token.v === '(' || token.v === '[') depth += 1;
      else if (token.v === ')' || token.v === ']') depth = Math.max(0, depth - 1);
      else if (depth === 0 && (token.v === '{' || token.v === ';' || token.v === '}'))
        return { stop: token.v, tokens };
    }
    tokens.push(token);
    cursor.i += 1;
  }
  return { stop: null, tokens };
}

/** The tokens of a style rule's block, its nested rules dropped; the cursor ends past its `}`. */
function readDeclarationBlock(cursor: Cursor, selector: string): Token[] {
  const tokens: Token[] = [];
  let since = 0;
  while (cursor.i < cursor.tokens.length) {
    const token = cursor.tokens[cursor.i];
    cursor.i += 1;
    if (token === undefined) break;
    if (isPunct(token, '}')) return tokens;
    if (isPunct(token, '{')) {
      // a nested rule (CSS nesting): its selector is the text since the last `;`, dropped whole
      cursor.dropped.push(`${selector} { ${text(tokens.slice(since))} { ... } }`);
      tokens.length = since;
      skipBlock(cursor);
      continue;
    }
    tokens.push(token);
    if (isPunct(token, ';')) since = tokens.length;
  }
  return tokens;
}

function selectorAllowed(tokens: ReadonlyArray<Token>): boolean {
  if (unsafe(tokens) || tokens.some((token) => token.t === 'url')) return false;
  return !tokens.some((token) => token.t === 'text' && token.v === '&');
}

/** The rules of a block (the text's top level, or a grouping rule's), sanitized. */
function rules(cursor: Cursor, nested: boolean): string[] {
  const out: string[] = [];
  while (cursor.i < cursor.tokens.length) {
    const token = cursor.tokens[cursor.i];
    if (token === undefined) break;
    if (token.t === 'ws' || isPunct(token, ';')) {
      cursor.i += 1;
      continue;
    }
    if (isPunct(token, '}')) {
      cursor.i += 1;
      // the close of the grouping rule; a stray one at the top level ends nothing
      if (nested) return out;
      continue;
    }
    if (token.t === 'text' && token.v === '@') {
      const name = cursor.tokens[cursor.i + 1];
      cursor.i += name !== undefined && name.t === 'text' ? 2 : 1;
      const atName = name !== undefined && name.t === 'text' ? name.v.toLowerCase() : '';
      const prelude = readPrelude(cursor);
      const head = `@${atName} ${text(prelude.tokens)}`.trim();
      if (prelude.stop !== '{') {
        // a statement (`@import url(x);`, `@layer a, b;`) or a malformed rule: dropped
        if (prelude.stop === ';') cursor.i += 1;
        cursor.dropped.push(head);
        continue;
      }
      cursor.i += 1;
      const grouping =
        GROUPING_AT_RULES.includes(atName) &&
        !unsafe(prelude.tokens) &&
        !prelude.tokens.some((each) => each.t === 'url');
      if (!grouping) {
        skipBlock(cursor);
        cursor.dropped.push(`${head} { ... }`);
        continue;
      }
      const inner = rules(cursor, true);
      if (inner.length > 0) out.push(`${head} { ${inner.join(' ')} }`);
      continue;
    }
    const prelude = readPrelude(cursor);
    if (prelude.stop !== '{') {
      // text that is not a rule (a stray declaration where rules stand): dropped
      if (prelude.stop === ';') cursor.i += 1;
      const junk = text(prelude.tokens);
      if (junk !== '') cursor.dropped.push(junk);
      continue;
    }
    cursor.i += 1;
    const selector = text(prelude.tokens);
    const body = readDeclarationBlock(cursor, selector);
    if (selector === '' || !selectorAllowed(prelude.tokens)) {
      cursor.dropped.push(`${selector} { ... }`);
      continue;
    }
    const { kept, dropped } = declarationsOf(body);
    cursor.dropped.push(...dropped.map((declaration) => `${selector} { ${declaration} }`));
    if (kept.length > 0) out.push(`${selector} { ${kept.join('; ')}; }`);
  }
  return out;
}

/**
 * A block's or a layer's CSS after the rules above, rebuilt from its tokens: comments go, rule order
 * and selectors stay, a rule whose every declaration was dropped disappears. `scopeCss` (scope.ts)
 * runs after this.
 */
export function sanitizeCss(css: string): SanitizedCss {
  const cursor: Cursor = { tokens: tokenize(css), i: 0, dropped: [] };
  const serialized = rules(cursor, false).join('\n');
  const out = safeStyleText(serialized);
  if (out !== serialized) cursor.dropped.push('a < that opens markup, written as \\3c');
  return { css: out, dropped: cursor.dropped };
}
