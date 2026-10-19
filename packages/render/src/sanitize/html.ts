// The markup sanitizer of the `html` escape block (gslides-parity SPEC-3 0.27, 8.4 item 1; report
// 04 F4): DOMPurify with the profile the specification fixes, through jsdom on the server and the
// page's own window in the browser, run at write time (`applyWrite`, the bundle importer, the
// `html/sanitize` fix rule, all through `sanitizeHtmlBlock`) and again at render time
// (`renderHtmlEscape`, through `sanitizeMarkup`). DOMPurify and jsdom load lazily and only when a
// deck holds an `html` block (`loadPurifier`), so the studio's function bundle does not carry
// jsdom on a request that renders none; the render path is synchronous, so it uses the loaded
// instance when there is one and the regular expression sanitizer of round one otherwise, and a
// block that already carries `htmlSanitized: true` passed the parser at write time. In a page the
// regular expressions are never the only pass (docs/hardening/HARDENING.md HR-W#6, CRIT-M9): a
// block a collaborator wrote reaches the editor without the write time pass on the do tier, so the
// inline path draws the block's plate until the parser has loaded (`inPage`, html-escape.ts).
//
// The profile: html and svg, `FORBID_TAGS` for the elements a block never needs (script, iframe,
// object, embed, base, meta, link, style, form, input, button, textarea, select, math), `style`
// attributes passed through the CSS value allowlist (sanitize/css.ts) and dropped when nothing
// survives, `formaction` and `action` never, URI attributes limited to `https:`, `data:image/`,
// `#` and `assets/`, no unknown protocols. Framework free apart from the two lazy imports.
import type { BlockOf } from '@turboslide/schema/blocks';
import type { Deck, HtmlLayer, Slide } from '@turboslide/schema/deck';

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

type PurifierState = {
  instance: Purifier | null;
  loading: Promise<Purifier> | null;
  /** Set once the first failed load was logged, so a process says why once and not per call. */
  warned?: boolean;
};

const STATE = Symbol.for('turboslide.render.purifier');

function state(): PurifierState {
  const store = globalThis as unknown as Record<symbol, PurifierState | undefined>;
  return (store[STATE] ??= { instance: null, loading: null });
}

/** The loaded instance, or null before `loadPurifier` resolved (the render path asks this). */
export function purifierNow(): Purifier | null {
  return state().instance;
}

/** True in a page (a window and a document), where the inline path waits for the parser. */
export function inPage(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
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
 * on the server. In a page the specifier is written out, so the client build carries DOMPurify as
 * a chunk of its own that only this call fetches (a variable specifier never resolved in a
 * browser, so the parser never loaded there before HR-W#6). jsdom's specifier stays a variable so
 * a bundler that follows dynamic imports (Vite's client optimizer) never pulls jsdom into a
 * browser graph; the studio's function bundle carries both packages and loads them on the first
 * deck that holds an `html` block.
 */
export function loadPurifier(): Promise<Purifier> {
  const s = state();
  if (s.instance !== null) return Promise.resolve(s.instance);
  if (s.loading !== null) return s.loading;
  const purifySpecifier = 'dompurify';
  const jsdomSpecifier = 'jsdom';
  s.loading = (async () => {
    if (inPage()) {
      const purify = (await import('dompurify')) as unknown as DomPurifyModule;
      const purifier = createPurifier(purify.default(window), 'browser');
      s.instance = purifier;
      return purifier;
    }
    const purify = (await import(/* @vite-ignore */ purifySpecifier)) as DomPurifyModule;
    const { JSDOM } = (await import(/* @vite-ignore */ jsdomSpecifier)) as JsdomModule;
    const purifier = createPurifier(purify.default(new JSDOM('').window), 'jsdom');
    s.instance = purifier;
    return purifier;
  })().catch((error: unknown) => {
    s.loading = null;
    // every caller falls back to the regular expressions and says nothing, so the reason is
    // logged here, once per process (production sanitized without the parser on 2026-10-19
    // with no line in the function's log; apps/studio/vite.deploy.config.ts FUNCTION_LINKS)
    if (s.warned !== true) {
      s.warned = true;
      const code = (error as { code?: unknown } | null)?.code;
      const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
      console.warn(
        `turboslide sanitizer: DOMPurify did not load (${typeof code === 'string' ? `${code}: ` : ''}${message}); html markup is sanitized with the regular expressions alone`,
      );
    }
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
  // the fourth pass drops the SVG animation elements, which set an attribute over time
  // (`<animate attributeName="href" values="javascript:...">`) where the URI pass never reads it;
  // DOMPurify drops them too
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
    .replace(/<\/?(?:animate(?:motion|transform|color)?|set|discard)\b[^>]*>/gi, '')
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

/**
 * Removes the `id` and `name` attributes of sanitized markup (docs/html-layers.md 3). An HtmlLayer
 * draws in the editor's own document, the size of the sheet, so an id there could shadow one the
 * editor reads (`document.getElementById`, a named property of `window`); a layer's CSS styles its
 * markup by class instead. Double quoted, single quoted and bare values all go: without the parser
 * (a process that cannot load it) the markup keeps the quoting its author wrote.
 */
export function stripIdentities(html: string): string {
  return html.replace(/\s(?:id|name)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
}

/** The targets an HtmlLayer's markup may load: a deck asset, an inline image, a fragment. */
const LAYER_URI = /^(?:assets\/|data:image\/|#)/i;

/** One attribute of sanitized markup, double quoted, single quoted or bare. */
const URI_ATTRIBUTE =
  /\s(src|href|xlink:href|poster|background|data|action|formaction|srcset|imagesrcset)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;

/**
 * An HtmlLayer's sanitized markup confined to the deck (docs/html-layers.md 3): no `id` or `name`
 * (stripIdentities), and no attribute that loads anything but a deck asset, an inline image or a
 * fragment. The markup draws in the editor's document and in the standalone file and the export
 * capture, which carry no CSP, so an `https:` image there would be a fetch an author chose (a
 * read receipt, a request from the render worker); the html block's frame keeps its `https:`
 * images under the frame's CSP.
 */
export function confineLayerMarkup(html: string): string {
  return stripIdentities(html).replace(
    URI_ATTRIBUTE,
    (whole, name: string, double?: string, single?: string, bare?: string) => {
      const value = (double ?? single ?? bare ?? '').trim();
      const candidates = /srcset$/i.test(name)
        ? value.split(',').map((candidate) => candidate.trim().split(/\s+/)[0] ?? '')
        : [value];
      return candidates.every((candidate) => LAYER_URI.test(candidate)) ? whole : '';
    },
  );
}

/** True when a deck holds an html block or an HtmlLayer with markup. */
export function deckHoldsHtml(deck: Deck, slides: Iterable<Slide>): boolean {
  if (deck.html?.markup !== undefined) return true;
  for (const slide of slides)
    if (slide.html?.markup !== undefined || JSON.stringify(slide).includes('"type":"html"'))
      return true;
  return false;
}

/**
 * Loads the parser before a render of a deck that holds markup, so a surface outside the page (the
 * export capture, `turboslide render`, the standalone build) sanitizes with DOMPurify rather than
 * the regular expressions alone; a deck without markup loads nothing.
 */
export async function loadPurifierFor(deck: Deck, slides: Iterable<Slide>): Promise<void> {
  if (deckHoldsHtml(deck, slides)) await loadPurifier().catch(() => undefined);
}

export type SanitizedHtmlLayer = {
  layer: HtmlLayer;
  changed: boolean;
  /** The CSS rules and declarations the tokenizer dropped, for the caller's answer. */
  droppedCss: string[];
};

/**
 * The write time pass of an HtmlLayer (docs/html-layers.md 3), the one `sanitizeHtmlBlock` runs on
 * an html block: the parser over the markup, the tokenizer over the CSS. The `deck.setHtml` and
 * `slide.setHtml` handlers store its output; every render sanitizes again (html-layers.ts), so a
 * layer written by another path (a raw `slide.set`, a bundle) is never drawn unsanitized.
 */
export async function sanitizeHtmlLayer(layer: HtmlLayer): Promise<SanitizedHtmlLayer> {
  // a process that cannot load the parser (a server bundle without dompurify and jsdom beside it,
  // as the Vercel function was until apps/studio/vite.deploy.config.ts traced both) sanitizes with
  // the regular expressions, as the studio's deck payload does (apps/studio/src/server/decks.ts);
  // every render sanitizes again, DOMPurify in the page and the frame's CSP on the view payloads
  const purifier = await loadPurifier().catch(() => null);
  const out: HtmlLayer = { ...layer };
  let changed = false;
  let droppedCss: string[] = [];
  if (layer.markup !== undefined) {
    const markup = sanitizeMarkup(layer.markup, purifier);
    out.markup = confineLayerMarkup(markup.html);
    changed = changed || markup.changed || out.markup !== markup.html;
  }
  if (layer.css !== undefined) {
    const css = sanitizeCss(layer.css);
    out.css = css.css;
    droppedCss = css.dropped;
    changed = changed || css.dropped.length > 0;
  }
  return { layer: out, changed, droppedCss };
}
