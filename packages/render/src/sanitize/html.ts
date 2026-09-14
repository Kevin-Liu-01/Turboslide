// The markup sanitizer of the `html` escape block (gslides-parity SPEC-3 0.27, 8.4 item 1; report
// 04 F4): DOMPurify with the profile the specification fixes, through jsdom on the server and the
// page's own window in the browser, run at write time (`applyWrite`, the bundle importer, the
// `html/sanitize` fix rule, all through `sanitizeHtmlBlock`) and again at render time
// (`renderHtmlEscape`, through `sanitizeMarkup`). DOMPurify and jsdom load lazily and only when a
// deck holds an `html` block (`loadPurifier`), so the studio's function bundle does not carry
// jsdom on a request that renders none; the render path is synchronous, so it uses the loaded
// instance when there is one and the regular expression sanitizer of round one otherwise, and a
// block that already carries `htmlSanitized: true` passed the parser at write time.
//
// The profile: html and svg, `FORBID_TAGS` for the elements a block never needs (script, iframe,
// object, embed, base, meta, link, style, form, input, button, textarea, select, math), `style`
// attributes passed through the CSS value allowlist (sanitize/css.ts) and dropped when nothing
// survives, `formaction` and `action` never, URI attributes limited to `https:`, `data:image/`,
// `#` and `assets/`, no unknown protocols. Framework free apart from the two lazy imports.
import type { BlockOf } from '@turboslide/schema/blocks';

import { sanitizeCss, sanitizeStyleAttribute } from './css.ts';

/** The elements a block never carries (SPEC-3 8.4 item 1). */
export const FORBIDDEN_TAGS: ReadonlyArray<string> = [
  'script',
  'iframe',
  'object',
  'embed',
  'base',
  'meta',
  'link',
  'style',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'math',
  'template',
  'noscript',
];

/** The attributes a block never carries, whatever the element. */
export const FORBIDDEN_ATTRIBUTES: ReadonlyArray<string> = [
  'formaction',
  'action',
  'srcdoc',
  'ping',
  'background',
  'poster',
  'dynsrc',
  'lowsrc',
];

/** A URI attribute value a block may carry: https, an inline image, a fragment or a deck asset. */
export const ALLOWED_URI = /^(?:https:|data:image\/|#|assets\/)/i;

/** The DOMPurify configuration, as the package takes it (`sanitize(html, config)`). */
export const PURIFY_CONFIG = {
  USE_PROFILES: { html: true, svg: true, svgFilters: true },
  FORBID_TAGS: [...FORBIDDEN_TAGS],
  FORBID_ATTR: [...FORBIDDEN_ATTRIBUTES],
  ALLOWED_URI_REGEXP: ALLOWED_URI,
  ALLOW_UNKNOWN_PROTOCOLS: false,
  ALLOW_DATA_ATTR: true,
  KEEP_CONTENT: true,
  WHOLE_DOCUMENT: false,
  RETURN_DOM: false,
} as const;

/** What this module needs of a DOMPurify instance: `sanitize` and the hook registration. */
export type PurifyLike = {
  sanitize: (html: string, config?: Record<string, unknown>) => string;
  addHook?: (
    name: 'uponSanitizeAttribute',
    hook: (node: Element, data: { attrName: string; attrValue: string; keepAttr: boolean }) => void,
  ) => unknown;
  removed?: unknown[];
};

/** The bound sanitizer this module hands out. */
export type Purifier = {
  sanitize: (html: string) => string;
  /** The window the instance is bound to: `jsdom` on the server, `browser` in a page. */
  host: 'jsdom' | 'browser';
};

/**
 * A DOMPurify instance with the profile and the `style` hook: every `style` attribute runs
 * through `sanitizeStyleAttribute` and is dropped when nothing survives. Exported so a test binds
 * an instance over its own window.
 */
export function createPurifier(instance: PurifyLike, host: Purifier['host']): Purifier {
  instance.addHook?.('uponSanitizeAttribute', (_node, data) => {
    if (data.attrName !== 'style') return;
    const clean = sanitizeStyleAttribute(data.attrValue);
    if (clean === '') {
      data.keepAttr = false;
      return;
    }
    data.attrValue = clean;
  });
  return {
    host,
    sanitize: (html) =>
      instance.sanitize(html, PURIFY_CONFIG as unknown as Record<string, unknown>),
  };
}

type PurifierState = { instance: Purifier | null; loading: Promise<Purifier> | null };

const STATE = Symbol.for('turboslide.render.purifier');

function state(): PurifierState {
  const store = globalThis as unknown as Record<symbol, PurifierState | undefined>;
  return (store[STATE] ??= { instance: null, loading: null });
}

/** The loaded instance, or null before `loadPurifier` resolved (the render path asks this). */
export function purifierNow(): Purifier | null {
  return state().instance;
}

/** Binds an instance (a test over its own window); `null` forgets the loaded one. */
export function bindPurifier(purifier: Purifier | null): void {
  const s = state();
  s.instance = purifier;
  s.loading = null;
}

type DomPurifyModule = { default: (window: unknown) => PurifyLike };
type JsdomModule = { JSDOM: new (html?: string) => { window: unknown } };

/**
 * Loads DOMPurify once per process: bound to the page's `window` in a browser, to a jsdom window
 * on the server. The specifiers are variables so a bundler that follows dynamic imports (Vite's
 * client optimizer) never pulls jsdom into a browser graph; the studio's function bundle carries
 * both packages and loads them on the first deck that holds an `html` block.
 */
export function loadPurifier(): Promise<Purifier> {
  const s = state();
  if (s.instance !== null) return Promise.resolve(s.instance);
  if (s.loading !== null) return s.loading;
  const purifySpecifier = 'dompurify';
  const jsdomSpecifier = 'jsdom';
  s.loading = (async () => {
    const purify = (await import(/* @vite-ignore */ purifySpecifier)) as DomPurifyModule;
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const purifier = createPurifier(purify.default(window), 'browser');
      s.instance = purifier;
      return purifier;
    }
    const { JSDOM } = (await import(/* @vite-ignore */ jsdomSpecifier)) as JsdomModule;
    const purifier = createPurifier(purify.default(new JSDOM('').window), 'jsdom');
    s.instance = purifier;
    return purifier;
  })().catch((error: unknown) => {
    s.loading = null;
    throw error;
  });
  return s.loading;
}

/**
 * The regular expression sanitizer of round one (SPEC 1, 5.2, 11): script bearing elements and
 * attributes removed. Kept as the synchronous fallback when no parser has loaded and as the
 * second pass after DOMPurify (an attribute separator the parser normalized is caught twice).
 */
/** The URI attributes the fallback inspects for a script scheme. */
const URI_ATTRIBUTES = 'href|src|xlink:href|action|formaction|data|codebase|poster|background';

/**
 * Decodes the entities a browser decodes inside an attribute value before it reads the scheme
 * (numeric, hex, `&colon;`, `&tab;`, `&newline;`, `&NewLine;`) and drops the control and space
 * characters a scheme may be padded with, so `jav&#x61;script:` and `java\tscript:` read as
 * `javascript:` (report 04 F4 bypasses 2 and 4).
 */
export function decodedScheme(value: string): string {
  return (
    value
      .replace(/&#x([0-9a-f]+);?/gi, (_m, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
      .replace(/&#(\d+);?/g, (_m, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
      .replace(/&colon;/gi, ':')
      .replace(/&(?:tab|newline);/gi, '')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0020\u007f-\u009f\s]+/g, '')
      .toLowerCase()
  );
}

/** True for a value whose decoded scheme runs script or smuggles a document. */
export function dangerousUri(value: string): boolean {
  const scheme = decodedScheme(value);
  return (
    scheme.startsWith('javascript:') ||
    scheme.startsWith('vbscript:') ||
    scheme.startsWith('livescript:') ||
    scheme.startsWith('mocha:') ||
    (scheme.startsWith('data:') && !scheme.startsWith('data:image/'))
  );
}

/**
 * The regular expression sanitizer of round one (SPEC 1, 5.2, 11): script bearing elements and
 * attributes removed. Kept as the synchronous fallback when no parser has loaded and as the
 * second pass after DOMPurify (an attribute separator the parser normalized is caught twice), with
 * the entity decoding of `dangerousUri` on every URI attribute.
 */
export function sanitizeHtmlRegex(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(
      /<(iframe|object|embed|base|meta|link|style|form|template|noscript|math)\b[\s\S]*?(<\/\1\s*>|\/>)/gi,
      '',
    )
    .replace(
      /<\/?(iframe|object|embed|base|meta|link|style|form|input|button|textarea|select|template|noscript|math|maction)\b[^>]*>/gi,
      '',
    )
    .replace(/[\s/]+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(
      new RegExp(`\\s+(${URI_ATTRIBUTES})\\s*=\\s*("[^"]*"|'[^']*'|[^\\s>]+)`, 'gi'),
      (attribute: string, _name: string, quoted: string) =>
        dangerousUri(quoted.replace(/^["']|["']$/g, '')) ? '' : attribute,
    );
}

export type SanitizedMarkup = { html: string; changed: boolean; parsed: boolean };

/**
 * The markup after the parser (when loaded) and the regular expressions: `parsed` says the
 * parser ran, `changed` that something was removed, for the `sanitizer.rewrite` line and the
 * `htmlSanitized` stamp.
 */
export function sanitizeMarkup(
  html: string,
  purifier: Purifier | null = purifierNow(),
): SanitizedMarkup {
  const parsed = purifier !== null;
  const first = parsed ? purifier.sanitize(html) : html;
  const out = sanitizeHtmlRegex(first);
  return { html: out, changed: normalize(out) !== normalize(html), parsed };
}

function normalize(html: string): string {
  return html
    .replace(/\s+/g, ' ')
    .replace(/\s*\/>/g, '>')
    .trim();
}

export type SanitizedBlock = {
  block: BlockOf<'html'>;
  changed: boolean;
  /** The CSS rules and declarations the tokenizer dropped, for the log line. */
  droppedCss: string[];
};

/**
 * The write time pass (SPEC-3 8.4): the parser over the markup, the tokenizer over the CSS, and
 * the `htmlSanitized: true` stamp. Loads the parser when it has not loaded yet, so this is the
 * one asynchronous entry; `applyWrite` (B2), the bundle importer (B2) and the `html/sanitize`
 * fix rule (B1) call it and log `sanitizer.rewrite` when `changed`.
 */
export async function sanitizeHtmlBlock(block: BlockOf<'html'>): Promise<SanitizedBlock> {
  const purifier = await loadPurifier();
  const markup = sanitizeMarkup(block.html, purifier);
  const css = sanitizeCss(block.css);
  const changed = markup.changed || css.dropped.length > 0 || block.htmlSanitized !== true;
  return {
    block: { ...block, html: markup.html, css: css.css, htmlSanitized: true },
    changed,
    droppedCss: css.dropped,
  };
}
